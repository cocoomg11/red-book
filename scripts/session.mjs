/**
 * Session log (feature "sessionLog"). A GM starts and ends sessions; while one is open the leader client (leader.mjs) records a
 * timeline from hooks and writes it to a GM-only journal entry: flags.red-book.session holds the structured data (versioned, capped)
 * and the "Timeline" page is rebuilt from it. A "Notes" page is the GM's own. Everything that changes a document runs on the leader:
 * other clients (another GM tab, a player finishing a rest, someone showing a journal) send requests to it.
 * Turned off, init() is never called and nothing here is registered.
 */
import { ID, HOOKS, TOOLKIT_ID, esc } from "./const.mjs";
import * as M from "./session-model.mjs";
import { L, get, set, log, warn } from "./core.mjs";
import { offGroups } from "./settings-model.mjs";
import * as UI from "./ui.mjs";
import { gateApi } from "./check-model.mjs";

const TK = TOOLKIT_ID;
const hasProp = (o, p) => foundry.utils.hasProperty(o, p);
const getProp = (o, p) => foundry.utils.getProperty(o, p);

/** The leader's in-memory state; other clients keep only `null`. */
/** @type {any} */
const R = { entry: null, data: null, dirty: false, timer: null, flushing: null, downed: new Set(), base: new Map(), levels: new Map(), quests: new Map(), travel: null, rolls: new Set(), combats: new Set(), coalescer: null, coalesceTimer: null, time: new M.TimeTotal(), npcTimer: null };

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
      const html = M.pageHTML(data);
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
    for (const j of game.journal) { const q = j.flags?.[TK]?.quest; if (q) R.quests.set(j.id, M.questState(j.name, q)); }
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

/** NPCs met: non-player actors with a (visible) token on the active scene while a player is connected. */
function scanNPCs() {
  if (!recording()) return;
  const scene = game.scenes.active; if (!scene) return;
  if (!game.users.some(u => u.active && !u.isGM)) return;
  const hidden = !!get("npcHidden");
  const cands = [];
  for (const t of scene.tokens) {
    const a = t.actor; if (!a || a.hasPlayerOwner || ["character", "group", "vehicle"].includes(a.type)) continue;
    if (t.hidden && !hidden) continue;
    const base = t.actorLink ? a.id : (t.actorId ?? a.id);
    cands.push({ key: t.actorLink ? base : `${base}:${t.name}`, name: t.name || a.name, uuid: t.actorLink ? a.uuid : t.uuid });
  }
  const { fresh, met } = M.meet(R.data.met, cands);
  if (!fresh.length) return;
  R.data = { ...R.data, met };
  record("npc", M.metText(fresh.map(c => c.name)), { refs: fresh.map(c => c.uuid).slice(0, 20) });
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
      { name: "Timeline", type: "text", sort: 100, text: { content: M.pageHTML(data) }, flags: { [ID]: { timeline: true } } },
      { name: "Notes", type: "text", sort: 200, text: { content: "<p>Your own notes for this session. Put anything players shouldn't see in a secret block.</p>" } }
    ]
  });
  await set("openSession", entry.id);
  load(entry);
  record("session", `Session started${by ? ` by ${by.name}` : ""}${game.scenes.active ? ` on ${game.scenes.active.name}` : ""}.`, { refs: game.scenes.active ? [game.scenes.active.uuid] : [] });
  await flush();
  L.broadcastHook(HOOKS.sessionStarted, { session: entry.id, uuid: entry.uuid, n, name });
  scanSoon();
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
  baseline();
  log("session loaded on the leader", entry.name);
}
function unload() { R.entry = null; R.data = null; R.coalescer = null; clearTimeout(R.coalesceTimer); clearTimeout(R.npcTimer); }

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
  const content = M.recapHTML(entry.name, M.stripForRecap(html, drop));
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
    if (("hidden" in changes || "actorId" in changes) && token.parent?.active) scanSoon();
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
  Hooks.on("createToken", token => { if (recording() && token.parent?.active) scanSoon(); });
  Hooks.on("userConnected", user => { if (recording() && !user.isGM) scanSoon(); });
}

/** The companion toolkit: its quests (journal flags), Travel Log page and loot roll cards. Read only. */
function toolkitHooks() {
  if (!game.modules.get(TK)?.active) return;
  const quest = j => {
    if (!recording()) return;
    const q = j.flags?.[TK]?.quest; if (!q) return;
    const after = M.questState(j.name, q); const before = R.quests.get(j.id) ?? null; R.quests.set(j.id, after);
    if (after.hidden) return;
    for (const e of M.diffQuest(before ?? (after.status !== "available" ? { status: "available", done: after.done } : null), after)) record(e.type, e.text, { refs: [j.uuid], data: e.data });
  };
  Hooks.on("createJournalEntry", quest);
  Hooks.on("updateJournalEntry", (j, changes) => { if (hasProp(changes, `flags.${TK}.quest`)) quest(j); });
  Hooks.on("updateJournalEntryPage", (page, changes) => {
    if (!recording() || page.name !== "Travel Log" || !hasProp(changes, "text.content")) return;
    const now = page.text.content ?? ""; const was = R.travel ?? ""; R.travel = now;
    for (const e of M.travelLogAdditions(was, now)) record(e.type, e.text, { data: e.data });
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
