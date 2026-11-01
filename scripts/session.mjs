/**
 * Session log (feature "sessionLog"). A GM starts and ends sessions; while one is open the leader client (leader.mjs) records a
 * timeline from hooks and writes it to a GM-only journal entry: flags.red-book.session holds the structured data (versioned, capped)
 * and the "Timeline" page is rebuilt from it. A "Notes" page is the GM's own. Everything that changes a document runs on the leader:
 * other clients (another GM tab, a player finishing a rest, someone showing a journal) send requests to it.
 * Turned off, init() is never called and nothing here is registered.
 */
import { ID, HOOKS, TOOLKIT_ID, esc } from "./const.mjs";
import * as M from "./session-model.mjs";
import { rangeText } from "./time-model.mjs";
import { F, L, get, set, log, warn } from "./core.mjs";
import { offGroups } from "./settings-model.mjs";
import * as UI from "./ui.mjs";
import { gateApi } from "./check-model.mjs";
import { t } from "./i18n.mjs";

const TK = TOOLKIT_ID;
const hasProp = (o, p) => foundry.utils.hasProperty(o, p);
const getProp = (o, p) => foundry.utils.getProperty(o, p);

/** The leader's in-memory state; other clients keep only `null`. */
/** @type {any} */
const R = { entry: null, data: null, dirty: false, timer: null, flushing: null, downed: new Set(), base: new Map(), levels: new Map(), quests: new Map(), travel: null, rolls: new Set(), combats: new Set(), coalescer: null, coalesceTimer: null, time: new M.TimeTotal(), npcTimer: null,
  // 0.5.0: quest lines logged lately (journal flag and toolkit hook report the same change), journeys (hook vs Travel Log line).
  questsSeen: new M.Recent({ window: 15000 }), journeys: new M.Merge({ window: 15000, delay: 2500 }) };

// ---------------------------------------------------------------- reading
export const isSessionEntry = j => !!j?.flags?.[ID]?.session;
export const sessions = () => game.journal.filter(isSessionEntry).sort((a, b) => (Number(a.flags[ID].session.n) || 0) - (Number(b.flags[ID].session.n) || 0));
export const dataOf = j => M.normalizeSession(j?.flags?.[ID]?.session);
export function openEntry() { const id = get("openSession"); const j = id ? game.journal.get(id) : null; return j && isSessionEntry(j) && dataOf(j).open ? j : null; }
export function latest() { const l = sessions(); return l[l.length - 1] ?? null; }
const timelinePage = j => j?.pages.find(p => p.flags?.[ID]?.timeline) ?? null;

// ---------------------------------------------------------------- time stamps
const rtText = (ms = Date.now()) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
function wtText(t = game.time.worldTime) {
  try { const c = game.time.calendar; if (c?.format) return c.format(t); } catch { }
  return "";
}

// ---------------------------------------------------------------- recording (leader only)
const recording = () => !!R.data?.open && L.isLeader();

/**
 * Adds one event to the open session (leader only). Returns the event or null.
 * @param {string} type @param {string} text
 * @param {{ refs?: any[], data?: any, private?: boolean, thread?: boolean }} [opts]
 */
export function record(type, text, { refs = [], data = {}, private: priv = false, thread = false } = {}) {
  if (!recording()) return null;
  if (!M.typeOn(type, offGroups(get))) return null;
  const ev = M.makeEvent({ type, text, refs, data, private: priv, thread, rtText: rtText(), wtText: wtText(), wt: game.time.worldTime });
  R.data = M.addEvent(R.data, ev);
  schedule();
  // Every client hears this hook (players too), so it carries ids only: never the text, which may be a GM-only note. GM clients
  // read the event from the GM-only journal (api.session.get) when they need it.
  L.broadcastHook(HOOKS.eventLogged, M.eventHookPayload(R.entry.id, ev));
  return ev;
}

function schedule() { R.dirty = true; clearTimeout(R.timer); R.timer = setTimeout(flush, 1500); }
/** Writes the in-memory session to its journal (flags + Timeline page). */
export async function flush() {
  clearTimeout(R.timer); R.timer = null;
  if (!R.dirty || !R.entry || !R.data) return;
  if (R.flushing) { await R.flushing; return flush(); }
  R.dirty = false;
  const entry = R.entry, data = foundry.utils.deepClone(R.data);
  R.flushing = (async () => {
    try {
      await entry.update({ [`flags.${ID}.session`]: data });
      const page = timelinePage(entry);
      const html = M.pageHTML(data, pageOpts(data));
      if (page) await page.update({ "text.content": html });
      else await entry.createEmbeddedDocuments("JournalEntryPage", [{ name: "Timeline", type: "text", text: { content: html }, flags: { [ID]: { timeline: true } } }]);
    } catch (e) { warn("session log not saved", e); R.dirty = true; }
  })();
  await R.flushing; R.flushing = null;
}

/** The actors whose items and coin are watched: player-owned characters and party (group) actors. */
const watched = a => !!a && !a.isToken && (a.type === "group" || ((a.type === "character" || game.system.id !== "dnd5e") && a.hasPlayerOwner));
function snap(a) {
  const items = (a.items ?? []).filter(i => i.type !== "class" && i.type !== "subclass" && i.type !== "background" && i.type !== "race" && i.type !== "feat" && i.type !== "spell")
    .map(i => ({ id: i.id, name: i.name, qty: Number(i.system?.quantity ?? 1) }));
  return M.snapshot({ items, currency: a.system?.currency ?? {} });
}
const levelOf = a => Number(a?.system?.details?.level ?? a?.system?.level?.value ?? a?.system?.level);
function baseline() {
  R.base.clear(); R.levels.clear(); R.downed.clear();
  for (const a of game.actors) {
    if (watched(a)) R.base.set(a.uuid, snap(a));
    if (a.hasPlayerOwner && Number.isFinite(levelOf(a))) R.levels.set(a.uuid, levelOf(a));
    if (a.hasPlayerOwner && Number(a.system?.attributes?.hp?.value) <= 0 && Number(a.system?.attributes?.hp?.max) > 0) R.downed.add(a.uuid);
  }
  R.quests.clear();
  if (game.modules.get(TK)?.active) {
    for (const j of game.journal) { const q = questData(j); if (q) R.quests.set(j.id, M.questState(j.name, q)); }
    R.travel = travelLogPage()?.text?.content ?? "";
  }
  R.met = new Set(R.data?.met ?? []);
}

function touchInventory(actor) {
  if (!recording() || !watched(actor)) return;
  if (!R.base.has(actor.uuid)) { R.base.set(actor.uuid, snap(actor)); return; }
  R.coalescer.touch(actor.uuid, Date.now());
  clearTimeout(R.coalesceTimer); R.coalesceTimer = setTimeout(flushInventory, (Number(get("coalesceSeconds")) || 8) * 1000 + 50);
}
async function flushInventory(all = false) {
  if (!R.coalescer) return;
  const keys = all ? R.coalescer.all() : R.coalescer.due(Date.now());
  for (const uuid of keys) {
    const a = fromUuidSync(uuid); if (!a) continue;
    const now = snap(a); const d = M.diffInventory(R.base.get(uuid), now); R.base.set(uuid, now);
    const text = M.inventoryText(a.name, d); if (text) record("loot", text, { refs: [uuid], data: d });
  }
  if (R.coalescer.size) { clearTimeout(R.coalesceTimer); R.coalesceTimer = setTimeout(flushInventory, 1000); }
}

function hpChanged(actor, hp) {
  const kind = M.hpTransition(R.downed, actor.uuid, hp);
  if (kind !== "down") return;
  const pc = actor.hasPlayerOwner;
  record(pc ? "down" : "death", pc ? `${actor.name} dropped to 0 HP.` : `${actor.name} was killed.`, { refs: [actor.isToken ? actor.token?.uuid : actor.uuid].filter(Boolean) });
}

function checkLevel(actor) {
  if (!actor?.hasPlayerOwner || actor.isToken) return;
  const now = levelOf(actor); if (!Number.isFinite(now)) return;
  const before = R.levels.get(actor.uuid); R.levels.set(actor.uuid, now);
  const text = M.levelText(actor.name, before, now); if (text) record("level", text, { refs: [actor.uuid] });
}

const travelLogPage = () => {
  let name = ""; try { name = game.settings.get(TK, "trackerJournal"); } catch { }
  const j = name ? game.journal.getName(name) : null; return j?.pages.getName("Travel Log") ?? null;
};

/**
 * NPCs met: non-player actors with a (visible) token on the active scene while a player is connected. 0.6.0 (feature npcsMet): also
 * the scenes connected players are viewing, and each NPC is kept in the session's `npcs` list (actor id, name, first seen, scene),
 * which the GM can take one out of. Hidden tokens count once revealed (unless "Count hidden tokens as met" is on).
 */
function scanNPCs() {
  if (!recording()) return;
  const players = game.users.filter(u => u.active && !u.isGM);
  if (!players.length) return;
  const scenes = new Map();
  if (game.scenes.active) scenes.set(game.scenes.active.id, game.scenes.active);
  if (F.on("npcsMet")) for (const u of players) { const v = u.viewedScene ? game.scenes.get(u.viewedScene) : null; if (v) scenes.set(v.id, v); }
  if (!scenes.size) return;
  const hidden = !!get("npcHidden");
  const cands = [];
  for (const scene of scenes.values()) for (const tk of scene.tokens) {
    const a = tk.actor; if (!a || a.hasPlayerOwner || ["character", "group", "vehicle"].includes(a.type)) continue;
    if (tk.hidden && !hidden) continue;
    const base = tk.actorLink ? a.id : (tk.actorId ?? a.id);
    cands.push({ key: tk.actorLink ? base : `${base}:${tk.name}`, actorId: String(tk.actorId ?? a.id ?? ""), name: tk.name || a.name, uuid: tk.actorLink ? a.uuid : tk.uuid, sceneId: scene.id, sceneName: scene.name });
  }
  const { fresh, session } = F.on("npcsMet") ? M.meetNpcs(R.data, cands, Date.now()) : (() => { const r = M.meet(R.data.met, cands); return { fresh: r.fresh, session: { ...R.data, met: r.met } }; })();
  if (!fresh.length) return;
  R.data = session;
  const names = fresh.map(c => c.name);
  record("npc", M.metText(names), { refs: fresh.map(c => c.uuid).slice(0, 20), data: { npcs: fresh.map(c => c.key), names } });
}
function scanSoon() { clearTimeout(R.npcTimer); R.npcTimer = setTimeout(scanNPCs, 1500); }

// ---------------------------------------------------------------- start, end, notes (run on the leader)
async function doStart(by) {
  if (R.data?.open || openEntry()) { ui.notifications.info("Red Book: a session is already open."); return null; }
  const all = sessions().map(dataOf);
  const n = M.nextNumber(all); const now = Date.now();
  const name = M.sessionName(n, now);
  const f = await UI.folder(get("sessionFolder") || "Session Log");
  const data = M.normalizeSession({ n, name, startedAt: now, startWorld: game.time.worldTime, open: true, events: [] });
  const entry = await JournalEntry.create({
    name, folder: f?.id, ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE }, flags: { [ID]: { session: data } },
    pages: [
      { name: "Timeline", type: "text", sort: 100, text: { content: M.pageHTML(data, pageOpts(data)) }, flags: { [ID]: { timeline: true } } },
      { name: "Notes", type: "text", sort: 200, text: { content: "<p>Your own notes for this session. Put anything players shouldn't see in a secret block.</p>" } }
    ]
  });
  await set("openSession", entry.id);
  load(entry);
  record("session", `Session started${by ? ` by ${by.name}` : ""}${game.scenes.active ? ` on ${game.scenes.active.name}` : ""}.`, { refs: game.scenes.active ? [game.scenes.active.uuid] : [] });
  takeAttendance();
  await flush();
  L.broadcastHook(HOOKS.sessionStarted, { session: entry.id, uuid: entry.uuid, n, name });
  scanSoon();
  // 0.6.0: "Previously on…" for the players (ids only; each client reads the recap journal it can see).
  if (F.on("previously") && get("previouslyAuto") !== false) { const r = lastRecap(entry.id); if (r) L.broadcastHook(HOOKS.previouslyOn, { recap: r.id, force: false }); }
  return entry;
}

async function doEnd(by) {
  if (!R.data?.open) { const j = openEntry(); if (j) load(j); }
  if (!R.data?.open) { ui.notifications.info("Red Book: no session is open."); return null; }
  await flushInventory(true);
  const t = R.time.take(1); if (t) record("time", `World time advanced ${M.durationText(t.seconds)}.`, { data: t });
  record("session", `Session ended${by ? ` by ${by.name}` : ""}.`);
  const ended = { ...R.data, open: false, endedAt: Date.now(), endWorld: game.time.worldTime };
  ended.summary = M.summarize(ended);
  // 0.6.0: what was gained is frozen at the end (the toolkit's coin log is capped and can be undone later).
  if (F.on("gained")) ended.gained = gainedNow(ended);
  R.data = ended; R.dirty = true;
  await flush();
  const entry = R.entry;
  await set("openSession", "");
  unload();
  // Ids only (the summary holds GM-only threads): GM clients read it with api.session.get(session).summary.
  L.broadcastHook(HOOKS.sessionEnded, { session: entry.id, uuid: entry.uuid, name: ended.name });
  return entry;
}

function load(entry) {
  R.entry = entry; R.data = dataOf(entry); R.dirty = false;
  R.coalescer = new M.Coalescer({ quiet: (Number(get("coalesceSeconds")) || 8) * 1000 });
  R.time.clear(); R.rolls = new Set(R.data.events.map(e => e.data?.msg).filter(Boolean)); R.combats.clear();
  R.questsSeen = new M.Recent({ window: 15000 }); R.journeys = new M.Merge({ window: 15000, delay: 2500 });
  baseline();
  log("session loaded on the leader", entry.name);
}
function unload() { R.entry = null; R.data = null; R.coalescer = null; clearTimeout(R.coalesceTimer); clearTimeout(R.npcTimer); }

// ---------------------------------------------------------------- 0.6.0: attendance, edits, gained, the page's extra blocks
/** Plain users for attendance (connected players and their characters). */
const userRows = () => game.users.map(u => ({ id: u.id, name: u.name, active: !!u.active, isGM: !!u.isGM, character: u.character ? { id: u.character.id, name: u.character.name } : null }));
/** Leader: adds the connected players to the open session's attendance (feature attendance). */
function takeAttendance() {
  if (!recording() || !F.on("attendance")) return;
  const before = R.data.attendance ?? [];
  const after = M.addAttendance(before, userRows());
  if (after.length !== before.length) { R.data = { ...R.data, attendance: after }; schedule(); }
}

/** The toolkit's coin log entries (GM: its API; anything unexpected = none). */
function coinLog() {
  try { const api = game.modules.get(TK)?.active ? game.modules.get(TK)?.api : null; const e = api?.coinLog?.entries?.(); return Array.isArray(e) ? e : null; } catch { return null; }
}
/** The toolkit's coin values ({ gp, sp, cp } in its smallest coin), defaults when it doesn't say. */
function coinValues() {
  try { const c = game.modules.get(TK)?.api?.coins?.(); if (Array.isArray(c)) return Object.fromEntries(c); } catch { }
  return {};
}
/** Reward items of quests completed this session (not hidden), read from the toolkit's quest data. */
function questRewards(data) {
  const out = [];
  for (const e of data.events) {
    if (e.type !== "quest" || e.private || e.data?.status !== "completed" || !e.data?.quest) continue;
    const q = questData(game.journal.get(e.data.quest)); if (!q || q.hidden) continue;
    out.push({ name: e.text, hidden: !!q.hidden, items: (Array.isArray(q.rewards?.items) ? q.rewards.items : []).map(i => ({ name: i?.name, qty: i?.quantity ?? 1 })) });
  }
  return out;
}
/** The "Gained this session" data for a session (coin log in its window, or its own loot lines without one). */
function gainedNow(data) {
  const log = coinLog();
  return M.gained({ coinLog: log ?? M.coinFromLoot(data.events), start: data.startedAt, end: data.open ? 0 : data.endedAt, quests: questRewards(data), values: log ? coinValues() : {} });
}
/** Labels for the extra blocks, from lang/en.json. */
const extraLabels = () => Object.fromEntries(Object.keys(M.EXTRA_LABELS).map(k => [k, t(`Extras.${k}`)]));
/** pageHTML options: dates (setting), the extra blocks (features on). Written by the recording GM's browser, in its time zone. */
function pageOpts(data) {
  const mode = String(get("awardMode") ?? "xp");
  const gained = F.on("gained") ? (data.open ? gainedNow(data) : data.gained) : null;
  const extras = M.extrasHTML({
    npcs: F.on("npcsMet") ? data.npcs : null, attendance: F.on("attendance") ? data.attendance : null,
    awards: F.on("attendance") && mode !== "off" ? data.awards : null, mode, gained, start: data.startedAt, dates: get("logDates") !== false
  }, extraLabels());
  return { dates: get("logDates") !== false, extras };
}

/** Leader: one GM edit to a session (open: the in-memory copy; ended: its journal directly). */
async function doEdit(d) {
  const op = { ...d };
  if (R.entry?.id === d.session && R.data) { R.data = M.applyEdit(R.data, op); schedule(); return; }
  const j = game.journal.get(d.session); if (!j || !isSessionEntry(j)) return;
  const data = M.applyEdit(dataOf(j), op);
  try {
    await j.update({ [`flags.${ID}.session`]: data });
    const page = timelinePage(j); if (page) await page.update({ "text.content": M.pageHTML(data, pageOpts(data)) });
  } catch (e) { warn("session edit not saved", e); }
}
/**
 * GM: edits a session's NPCs met, attendance or awards (0.6.0; routed to the recording tab). `op`: { op: "unmeet", key } |
 * { op: "attend", userId, present, name?, characterId?, characterName? } | { op: "award", actorId, name?, n } | { op: "milestone", text }.
 */
export function edit(sessionId, op = {}) {
  if (!UI.gmOnly()) return false;
  const clean = Object.fromEntries(Object.entries({ session: String(sessionId ?? ""), ...op }).filter(([, v]) => v !== undefined && v !== null));
  return L.request("sessionEdit", clean);
}

/** Totals per character (session-model awardTotals). */
export const awardTotals = list => M.awardTotals(list);
/** The latest shared recap (a recap journal players can observe), skipping `skip` (a session id). */
export function lastRecap(skip = "") {
  const order = new Map(sessions().map(j => [j.id, dataOf(j).n]));
  const list = game.journal.filter(j => !!j.flags?.[ID]?.recap && j.flags[ID].recap.session !== skip && (game.user?.isGM ? Number(j.ownership?.default ?? 0) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER : j.testUserPermission?.(game.user, "OBSERVER")));
  list.sort((a, b) => (order.get(a.flags[ID].recap.session) ?? 0) - (order.get(b.flags[ID].recap.session) ?? 0) || (Number(a._stats?.modifiedTime) || 0) - (Number(b._stats?.modifiedTime) || 0));
  return list[list.length - 1] ?? null;
}

// ---------------------------------------------------------------- public (any client: routed to the leader)
export function start() { if (!UI.gmOnly()) return false; return L.request("start"); }
export async function end() {
  if (!UI.gmOnly()) return false;
  if (!openEntry() && !R.data?.open) { ui.notifications.info("Red Book: no session is open."); return false; }
  const ok = await UI.confirm("End session", "<p>End the open session? A summary is added to its log.</p>");
  return ok ? L.request("end") : false;
}
/** Adds a note: `text` ("?" first = open thread, "#private" = kept out of recaps). */
export function note(text, opts = {}) {
  if (!UI.gmOnly()) return false;
  const n = M.parseNote(text, opts); if (!n.text) return false;
  if (!openEntry() && !R.data?.open) { ui.notifications.warn("Red Book: start a session first (no session is open)."); return false; }
  return L.request("note", { text: n.text.slice(0, 2000), thread: n.thread, private: n.private });
}
export async function noteDialog() {
  if (!UI.gmOnly()) return;
  if (!openEntry()) return ui.notifications.warn("Red Book: start a session first (no session is open).");
  const f = await UI.form("Quick note", `<div class="form-group stacked"><input type="text" name="text" autofocus placeholder="What happened? Start with ? for an open thread."></div>
    <div class="form-group"><label><input type="checkbox" name="thread"> Open thread</label><label><input type="checkbox" name="private"> GM only (left out of recaps)</label></div>`, "Add note");
  if (f?.text) note(f.text, { thread: !!f.thread, private: !!f.private });
}

// ---------------------------------------------------------------- recap
/** Shares a session's text as a player-visible recap after the GM reviews it. `ref`: session entry (or id); default the latest. */
export async function shareRecap(ref) {
  if (!UI.gmOnly()) return null;
  const entry = typeof ref === "string" ? game.journal.get(ref) : ref ?? latest();
  if (!entry || !isSessionEntry(entry)) { ui.notifications.warn("Red Book: no session log to share."); return null; }
  if (R.entry?.id === entry.id) await flush();
  const pages = entry.pages.contents.filter(p => p.type === "text").sort((a, b) => a.sort - b.sort);
  const html = M.joinPages(pages.map(p => ({ name: p.name, html: p.text?.content ?? "" })));
  const lines = M.listLines(html);
  const list = lines.length ? `<div class="rb-review">${lines.map(l => `<label><input type="checkbox" name="keep${l.index}" checked> ${esc(l.text)}</label>`).join("")}</div>` : "<p>No list lines to review.</p>";
  const f = await UI.form(`Share as recap: ${entry.name}`, `<p>Players will see a copy of this session's pages. Secret blocks, GM-only notes and HTML comments are always left out. Untick any line players shouldn't see.</p>${list}`, "Share with players", 560);
  if (!f) return null;
  const drop = lines.filter(l => !f[`keep${l.index}`]).map(l => l.index);
  const sd = dataOf(entry);
  const content = M.recapHTML(entry.name, M.stripForRecap(html, drop), get("logDates") !== false ? rangeText(sd.startedAt, sd.open ? 0 : sd.endedAt) : "");
  const name = M.recapName(entry.name);
  let recap = game.journal.find(j => j.flags?.[ID]?.recap?.session === entry.id);
  const folder = await UI.folder(get("recapFolder") || "Session Recaps");
  if (recap) {
    const page = recap.pages.contents[0];
    if (page) await page.update({ "text.content": content }); else await recap.createEmbeddedDocuments("JournalEntryPage", [{ name: "Recap", type: "text", text: { content } }]);
    await recap.update({ name, "ownership.default": CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER });
  } else {
    recap = await JournalEntry.create({ name, folder: folder?.id, ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER }, flags: { [ID]: { recap: { session: entry.id, v: 1 } } }, pages: [{ name: "Recap", type: "text", text: { content } }] });
  }
  ui.notifications.info(`Red Book: ${name} shared with players.`);
  Hooks.callAll(HOOKS.recapShared, { session: entry.id, recap: recap.id, uuid: recap.uuid });
  return recap;
}

// ---------------------------------------------------------------- hooks
function onDocHooks() {
  Hooks.on("updateScene", (scene, changes) => {
    if (changes.active !== true || !recording()) return;
    record("scene", `Scene activated: ${scene.name}.`, { refs: [scene.uuid] }); scanSoon();
  });
  Hooks.on("updateCombat", (combat, changes) => {
    if (!("round" in changes) || !recording() || R.combats.has(combat.id) || !(combat.round >= 1)) return;
    R.combats.add(combat.id);
    const names = combat.combatants.map(c => c.name).slice(0, 20);
    record("combatStart", `Combat started${combat.scene ? ` on ${combat.scene.name}` : ""}: ${names.join(", ") || "no combatants"}.`, { refs: combat.scene ? [combat.scene.uuid] : [] });
  });
  Hooks.on("deleteCombat", combat => {
    if (!recording() || !(combat.round >= 1)) return;
    const defeated = combat.combatants.filter(c => c.isDefeated).map(c => c.name);
    record("combatEnd", M.combatEndText({ round: combat.round, combatants: combat.combatants.map(c => c.name).slice(0, 20), defeated }));
  });
  Hooks.on("updateCombatant", (c, changes) => {
    if (changes.defeated !== true || !recording()) return;
    const a = c.actor; const key = a?.uuid ?? c.uuid;
    if (R.downed.has(key)) return; R.downed.add(key);
    record(a?.hasPlayerOwner ? "down" : "death", a?.hasPlayerOwner ? `${c.name} was defeated.` : `${c.name} was defeated.`, { refs: [c.token?.uuid].filter(Boolean) });
  });
  Hooks.on("updateActor", (actor, changes) => {
    if (!recording()) return;
    if (hasProp(changes, "system.attributes.hp.value")) hpChanged(actor, getProp(changes, "system.attributes.hp.value"));
    if (hasProp(changes, "system.currency")) touchInventory(actor);
    if (hasProp(changes, "system.details.level") || hasProp(changes, "system.level")) checkLevel(actor);
  });
  Hooks.on("updateToken", (token, changes) => {
    if (!recording()) return;
    if (hasProp(changes, "delta.system.attributes.hp.value") && token.actor) hpChanged(token.actor, getProp(changes, "delta.system.attributes.hp.value"));
    if (("hidden" in changes || "actorId" in changes) && (token.parent?.active || F.on("npcsMet"))) scanSoon();
  });
  const itemHook = (item, changes) => {
    if (!recording()) return;
    const a = item.parent; if (!(a instanceof Actor)) return;
    if (item.type === "class" && (changes === undefined || hasProp(changes, "system.levels"))) checkLevel(a);
    if (changes === undefined || hasProp(changes, "system.quantity") || "name" in changes) touchInventory(a);
  };
  Hooks.on("createItem", item => itemHook(item));
  Hooks.on("deleteItem", item => itemHook(item));
  Hooks.on("updateItem", (item, changes) => itemHook(item, changes));
  Hooks.on("updateWorldTime", (worldTime, dt) => {
    if (!recording() || !dt) return;
    R.time.add(dt, worldTime);
    if (game.combat?.started) return; // rounds add up; logged once combat is over and the total is big enough
    const t = R.time.take((Number(get("timeMinMinutes")) || 10) * 60);
    if (t) record("time", `World time advanced ${M.durationText(t.seconds)}.`, { data: t });
  });
  Hooks.on("createToken", token => { if (recording() && (token.parent?.active || F.on("npcsMet"))) scanSoon(); });
  Hooks.on("userConnected", (user, connected) => { if (recording() && !user.isGM) { scanSoon(); if (connected !== false) takeAttendance(); } });
  // 0.6.0: a player moving to another scene (viewedScene) can meet its NPCs.
  Hooks.on("updateUser", (user, changes) => { if (recording() && !user.isGM && F.on("npcsMet") && changes && "viewedScene" in changes) scanSoon(); });
  Hooks.on("updateUser", (user, changes) => { if (recording() && !user.isGM && F.on("attendance") && user.active && changes && "character" in changes) takeAttendance(); });
}

/**
 * A quest's data: the toolkit's API on a GM (the full quest from its GM-only store, hidden objectives included), else the journal's
 * flag (the players' view since toolkit 1.27). null when it isn't a quest.
 */
function questData(j) {
  if (!j?.flags?.[TK]?.quest) return null;
  try { const q = game.user?.isGM ? game.modules.get(TK)?.api?.quests?.get?.(j.id) : null; if (q && typeof q === "object") return q; } catch { }
  return j.flags[TK].quest;
}

/**
 * Logs a quest's changes since Red Book last read it (quest events feature). Both the journal update and the toolkit's
 * `wayfarersToolkit.questUpdated` hook call this; whichever comes first logs, and a line already logged within 15 s (same quest, same
 * change, same objective) is skipped. Hidden quests and hidden objectives are logged as GM-only lines (kept out of the recap).
 * `change`: the hook's change, used only when the quest data shows no change the hook says happened.
 */
function questChanged(j, change = "") {
  if (!recording() || !j) return;
  const q = questData(j); if (!q) return;
  const after = M.questState(j.name, q); const before = R.quests.get(j.id) ?? null; R.quests.set(j.id, after);
  const events = M.diffQuest(before ?? (after.status !== "available" ? { status: "available", done: after.done, objectives: {}, name: after.name, hidden: after.hidden } : null), after);
  if (!events.length && change) { const f = M.questFallback(change, after); if (f) events.push(f); }
  const now = Date.now();
  for (const e of events) {
    const key = M.questKey(j.id, e);
    if (key && R.questsSeen.seen(key, now)) continue;
    if (key) R.questsSeen.mark(key, now);
    record(e.type, e.text, { refs: [j.uuid], data: { ...e.data, quest: j.id }, private: !!e.private });
  }
}

/** The toolkit's quest hook (ids only): `{ questId, change }`. Read defensively: the hook may not exist in the toolkit installed. */
function onQuestHook(payload) {
  const p = M.readQuestHook(payload); if (!p) return;
  // Heard on another GM tab: relay it (a change kept only in the toolkit's GM-only store updates no journal the recording tab sees).
  if (!L.isLeader()) { if (game.user?.isGM && openEntry()) L.request("quest", p); return; }
  questChanged(game.journal.get(p.questId), p.change);
}

/**
 * The toolkit's journey hook: a hex trip or a flight, logged as a Travel line. The Travel Log page gets a line for the same trip; the
 * one from the hook wins (it has hours and cost) and the page's line is skipped when they come within 15 s of each other.
 */
function onJourneyHook(payload) {
  const j = M.readJourney(payload); if (!j) return;
  // Heard on another GM tab (the toolkit ran the trip there): relay it to the recording tab. Players' clients don't.
  if (!L.isLeader()) { if (game.user?.isGM && openEntry()) L.request("journey", journeyRequest(j)); return; }
  logJourney(j);
}
/** The relay payload: the hook's fields, read and clipped by readJourney (nothing else). */
const journeyRequest = j => ({ kind: j.kind, fromId: j.fromId, toId: j.toId, fromName: j.fromName, toName: j.toName, hours: j.hours, cost: { ...j.cost }, partyId: j.partyId });
function logJourney(j) {
  if (!recording()) return;
  const e = M.journeyEvent(j); if (!e) return;
  if (!R.journeys.primary(M.journeyKind(j), Date.now())) return;
  record(e.type, e.text, { data: e.data });
}
/** A Travel Log line: logged at once when the journey hook isn't listened to; else after a short wait unless the hook reported it. */
function travelLine(e) {
  if (!F.on("journeys")) { record(e.type, e.text, { data: e.data }); return; }
  const kind = e.data?.kind === "flight" ? "flight" : e.data?.kind === "travel" ? "travel" : "";
  if (!kind) { record(e.type, e.text, { data: e.data }); return; }
  const at = Date.now();
  if (R.journeys.secondary(kind, at) === "skip") return;
  setTimeout(() => { if (recording() && R.journeys.settle(kind, at)) record(e.type, e.text, { data: e.data }); }, R.journeys.delay);
}

/** The companion toolkit: its quests (journal flags and hook), journeys (hook), Travel Log page and loot roll cards. Read only. */
function toolkitHooks() {
  // The toolkit's hooks are listened to even if it isn't active yet: they fire only when it is. Ids and display names only.
  if (F.on("questEvents")) Hooks.on(M.TOOLKIT_HOOKS.questUpdated, onQuestHook);
  if (F.on("journeys")) Hooks.on(M.TOOLKIT_HOOKS.journey, onJourneyHook);
  if (!game.modules.get(TK)?.active) return;
  if (F.on("questEvents")) {
    Hooks.on("createJournalEntry", j => { if (j.flags?.[TK]?.quest) questChanged(j); });
    Hooks.on("updateJournalEntry", (j, changes) => { if (hasProp(changes, `flags.${TK}.quest`)) questChanged(j); });
  }
  Hooks.on("updateJournalEntryPage", (page, changes) => {
    if (!recording() || page.name !== "Travel Log" || !hasProp(changes, "text.content")) return;
    const now = page.text.content ?? ""; const was = R.travel ?? ""; R.travel = now;
    for (const e of M.travelLogAdditions(was, now)) travelLine(e);
  });
  Hooks.on("updateChatMessage", (msg, changes) => {
    if (!recording() || !hasProp(changes, `flags.${TK}.lootRoll`) || R.rolls.has(msg.id)) return;
    const e = M.lootRollEvent(msg.flags?.[TK]?.lootRoll); if (!e) return;
    R.rolls.add(msg.id); record(e.type, e.text, { data: { msg: msg.id } });
  });
}

/** Journal.show is wrapped (no hook exists for it) so showing a journal or page to players can be logged. The original always runs. */
function wrapShow() {
  const J = foundry.documents?.collections?.Journal ?? globalThis.Journal;
  if (!J?.show || J.show.__redBook) return;
  const orig = J.show;
  const wrapped = /** @this {any} */ async function (doc, options = {}, ...rest) {
    const r = await orig.call(this, doc, options, ...rest);
    try { if (doc?.uuid) L.request("journal", { uuid: doc.uuid, force: !!options?.force, users: Array.isArray(options?.users) ? options.users.length : 0 }); } catch { }
    return r;
  };
  wrapped.__redBook = true; J.show = wrapped;
}

// ---------------------------------------------------------------- setup
export function registerKeybinding() {
  game.keybindings.register(ID, "quickNote", {
    name: "Quick note", hint: "Opens a small box to add a note to the open session (GM). Start the note with ? to make it an open thread.",
    editable: [{ key: "KeyN", modifiers: ["Control", "Shift"] }], restricted: true, precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
    onDown: () => { if (get("notePrompt") !== false) noteDialog(); return true; }
  });
}

/** Ready hook (feature on). */
export function ready() {
  // Requests arrive schema-checked and rate-limited by wanderers-core, with Foundry's sender user (unknown senders are refused
  // before this). start/end/note/log are `from: "gm"` kinds; the isGM checks below stay as a second line.
  L.handle("start", (d, user) => user?.isGM && doStart(user));
  L.handle("end", (d, user) => user?.isGM && doEnd(user));
  L.handle("note", (d, user) => {
    if (!user?.isGM) return;
    const n = M.parseNote(d.text, d); if (!n.text) return;
    if (!R.data?.open) { const j = openEntry(); if (j) load(j); }
    record("note", n.text, { thread: n.thread, private: n.private, data: { by: user.name } });
  });
  L.handle("log", (d, user) => { if (user?.isGM) record(String(d.type), String(d.text ?? ""), { refs: d.refs ?? [], private: !!d.private }); });
  L.handle("sessionEdit", (d, user) => {
    if (!user?.isGM) return undefined;
    if ((d.op === "unmeet" && !F.on("npcsMet")) || ((d.op === "attend" || d.op === "award" || d.op === "milestone") && !F.on("attendance"))) return undefined;
    return doEdit(d);
  });
  if (F.on("previously")) L.handle("previously", (d, user) => { if (user?.isGM && d.recap) L.broadcastHook(HOOKS.previouslyOn, { recap: d.recap, force: !!d.force }); });
  if (F.on("questEvents")) L.handle("quest", (d, user) => { if (user?.isGM) { const p = M.readQuestHook(d); if (p) questChanged(game.journal.get(p.questId), p.change); } });
  if (F.on("journeys")) L.handle("journey", (d, user) => { if (user?.isGM) { const j = M.readJourney(d); if (j) logJourney(j); } });
  L.handle("rest", (d, user) => {
    if (!user) return;
    /** @type {any} */ let a = null; try { a = fromUuidSync(d.uuid, { strict: false }); } catch { }
    if (!(a instanceof Actor) || !a.testUserPermission?.(user, "OWNER")) return;
    record("rest", `${a.name} finished a ${d.long ? "long" : "short"} rest.`, { refs: [a.uuid] });
  });
  L.handle("journal", async (d, user) => {
    if (!user) return;
    /** @type {any} */ let doc = null; try { doc = await fromUuid(d.uuid); } catch { }
    if (doc?.documentName !== "JournalEntry" && doc?.documentName !== "JournalEntryPage") return;
    if (!doc || !doc.testUserPermission?.(user, "OWNER")) return;
    const name = doc.documentName === "JournalEntryPage" ? `${doc.parent?.name}: ${doc.name}` : doc.name;
    if (isSessionEntry(doc.documentName === "JournalEntryPage" ? doc.parent : doc)) return;
    record("journal", `Shown to players: ${name}${d.users ? ` (${d.users} of them)` : ""}.`, { refs: [doc.uuid] });
  });

  onDocHooks();
  toolkitHooks();
  wrapShow();
  if (game.system.id === "dnd5e") Hooks.on("dnd5e.restCompleted", (actor, result) => {
    if (!actor?.isOwner) return;
    // Only the client that rested fires this; one request per rest.
    L.request("rest", { uuid: actor.uuid, long: !!(result?.longRest ?? result?.type === "long") });
  });

  let prompted = false;
  L.onLeader(() => {
    const j = openEntry(); if (j && R.entry?.id !== j.id) load(j);
    if (!prompted && !j && get("startPrompt") !== false) { prompted = true; promptStart(); }
    else prompted = true;
    scanSoon();
  });
  L.onBye(() => { if (R.dirty) flush(); });
  setInterval(() => { if (recording()) flushInventory(); }, 5000);
}

const PROMPT_ID = `${ID}-start-prompt`;
/** The load prompt. Closed (and a late Yes ignored) when a session starts another way: panel, token button, API or another tab. */
function promptStart() {
  return M.startPrompt({
    ask: () => UI.confirm("Start a session?", "<p>No session is open. Start one now? While it's open, Red Book keeps a timeline of what happens.</p>", { id: PROMPT_ID }),
    subscribe: fn => { const hid = Hooks.on(HOOKS.sessionStarted, fn); return () => Hooks.off(HOOKS.sessionStarted, hid); },
    close: () => foundry.applications.instances?.get?.(PROMPT_ID)?.close?.(),
    isOpen: () => !!openEntry(),
    start: () => L.request("start")
  });
}

/** Scene control buttons (token layer): Start/End session and Quick note. */
export function controls(tools) {
  const open = !!openEntry();
  tools.rbSession = { name: "rbSession", title: open ? "End session" : "Start session", icon: open ? "fa-solid fa-book-bookmark" : "fa-solid fa-book", order: 120, button: true, visible: game.user.isGM, onChange: () => (openEntry() ? end() : start()) };
  tools.rbNote = { name: "rbNote", title: "Quick note", icon: "fa-solid fa-pen", order: 121, button: true, visible: game.user.isGM, onChange: () => noteDialog() };
}

/** A "Share as recap" header button on session log journals (GM). */
export function headerControls(app, controls) {
  const j = app?.document; if (!game.user.isGM || !isSessionEntry(j) || !Array.isArray(controls)) return;
  if (app.options?.actions && !app.options.actions.rbRecap) app.options.actions.rbRecap = function () { shareRecap(this.document); };
  controls.push({ icon: "fa-solid fa-share-from-square", label: "Share as recap", action: "rbRecap", visible: true });
}

const apiRaw = {
  start, end, note, noteDialog, shareRecap, flush,
  /** Experimental (0.6.0): edit a session's NPCs met, attendance or awards (see edit()). */
  edit,
  /** Experimental (0.6.0): XP, milestones and sessions attended per character across every session. */
  totals: () => M.awardTotals(sessions().map(dataOf)),
  current: () => { const j = openEntry(); return j ? { id: j.id, uuid: j.uuid, ...dataOf(j) } : null; },
  list: () => sessions().map(j => ({ id: j.id, uuid: j.uuid, name: j.name, n: dataOf(j).n, open: dataOf(j).open })),
  get: ref => { const j = typeof ref === "string" ? game.journal.get(ref) : ref; return j && isSessionEntry(j) ? dataOf(j) : null; },
  /** Adds an event from another module: routed to the leader. type: one of the session-model TYPES (unknown = note). */
  log: (type, text, opts = {}) => {
    const refs = Array.isArray(opts.refs) ? opts.refs.filter(r => typeof r === "string").slice(0, 20) : [];
    return L.request("log", { type: String(type ?? "note"), text: String(text ?? "").slice(0, 2000), refs, private: !!opts.private });
  }
};

/** The session log is GM only: for other users every member warns "GM only" and returns undefined (the logs are GM-only journals). */
export const api = gateApi(apiRaw, () => !!game.user?.isGM, () => ui.notifications.warn("Red Book: GM only."));
