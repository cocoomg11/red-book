/**
 * Session log: the pure part (no Foundry calls; tested in Node). The session's data lives in flags.red-book.session on its journal
 * entry; normalizeSession() reads every stored version. Events are plain objects; their times are formatted when they are logged
 * (rtText: real clock, wtText: the world calendar), so rendering needs no clock or calendar.
 *
 * Event: { id, type, t (real ms), at (0.6.0: the same instant, ISO 8601 UTC), wt (world seconds), rtText, wtText, text, refs: [uuid],
 * data: {}, private, thread }. Rendering shows the time from `t` in the viewer's zone; rtText is the fallback (and the source the
 * 0.6.0 migration reads a time from when an old event has no usable `t`).
 */
import { esc, plain, plural } from "./const.mjs";
import { isoOf, msOf, migrateTimes, dayKey, dayLabel, timeLabel, otherDay, rangeText } from "./time-model.mjs";

/** 2 (0.6.0): every event has `at` (ISO, UTC) next to `t`; NPCs met, attendance and awards. */
export const SESSION_VERSION = 2;
/** At most this many events are kept per session; notes and threads are never the ones dropped. */
export const EVENTS_MAX = 1000;
/** At most this many NPCs are remembered as met per session. */
export const MET_MAX = 500;

/** Event types: label (for the summary counts and settings), icon (Font Awesome), group (which setting turns it off). */
export const TYPES = {
  session: { label: "Session", icon: "fa-book" },
  scene: { label: "Scenes activated", icon: "fa-map" },
  combatStart: { label: "Combats started", icon: "fa-swords", group: "combat" },
  combatEnd: { label: "Combats ended", icon: "fa-flag-checkered", group: "combat" },
  down: { label: "Dropped to 0 HP", icon: "fa-heart-crack", group: "downs" },
  death: { label: "Killed or defeated", icon: "fa-skull", group: "downs" },
  rest: { label: "Rests", icon: "fa-bed" },
  loot: { label: "Items and coin", icon: "fa-sack-dollar" },
  time: { label: "Time advanced", icon: "fa-hourglass-half" },
  journal: { label: "Journals shown", icon: "fa-book-open" },
  npc: { label: "NPCs met", icon: "fa-user-group" },
  level: { label: "Level-ups", icon: "fa-arrow-up" },
  quest: { label: "Quests", icon: "fa-scroll", group: "toolkit" },
  objective: { label: "Objectives", icon: "fa-list-check", group: "toolkit" },
  travel: { label: "Travel and flights", icon: "fa-route", group: "toolkit" },
  lootRoll: { label: "Loot rolls", icon: "fa-dice", group: "toolkit" },
  note: { label: "Notes", icon: "fa-pen" }
};
/** Event groups the GM can turn off (setting "logTypes" holds the turned-off ones). */
export const GROUPS = {
  scene: "Scenes activated", combat: "Combats (start, end, combatants)", downs: "Characters at 0 HP and creatures killed",
  rest: "Rests (dnd5e)", loot: "Items and coin on player characters and the party actor", time: "World time advanced",
  journal: "Journals shown to players", npc: "NPCs met", level: "Level-ups", toolkit: "Quests, travel, flights and loot rolls (from the toolkit)"
};
export const groupOf = type => TYPES[type]?.group ?? type;
/** Whether events of `type` are logged, given the list of turned-off groups. Notes and session lines always are. */
export const typeOn = (type, off = []) => type === "note" || type === "session" || !off.includes(groupOf(type));

let seq = 0;
const eid = (t) => `${Math.floor(t).toString(36)}${(seq++ % 1296).toString(36).padStart(2, "0")}${Math.random().toString(36).slice(2, 5)}`;

/** A clean event. Unknown types become notes. */
export function makeEvent(e = {}, now = Date.now()) {
  const t = msOf(e.t) || msOf(e.at) || now;
  return {
    id: String(e.id || eid(t)), type: TYPES[e.type] ? e.type : "note", t, at: isoOf(t), wt: Number(e.wt) || 0,
    rtText: String(e.rtText ?? ""), wtText: String(e.wtText ?? ""), text: String(e.text ?? "").slice(0, 2000),
    refs: Array.isArray(e.refs) ? e.refs.filter(r => typeof r === "string").slice(0, 20) : [],
    data: e.data && typeof e.data === "object" ? e.data : {}, private: !!e.private, thread: !!e.thread
  };
}

/** Reads any stored session shape (missing v = 0: the same fields, unchecked) into the current one. */
/** @param {any} [raw] */
export function normalizeSession(raw = {}) {
  /** @type {any} */
  const s = raw && typeof raw === "object" ? raw : {};
  let events = (Array.isArray(s.events) ? s.events : []).filter(e => e && typeof e === "object");
  // 0.6.0: events stored without a usable time get one from the session's start date and their clock reading.
  if (events.some(e => !msOf(e.t) && !msOf(e.at))) events = migrateTimes(events, Number(s.startedAt) || 0);
  return {
    v: SESSION_VERSION, n: Math.max(1, Math.floor(Number(s.n) || 1)), name: String(s.name ?? ""),
    startedAt: Number(s.startedAt) || 0, endedAt: Number(s.endedAt) || 0, startWorld: Number(s.startWorld) || 0, endWorld: Number(s.endWorld) || 0,
    open: s.open === undefined ? !s.endedAt : !!s.open,
    events: events.map(e => makeEvent(e, Number(s.startedAt) || Date.now())),
    dropped: Math.max(0, Number(s.dropped) || 0),
    met: Array.isArray(s.met) ? [...new Set(s.met.map(String))].slice(-MET_MAX) : [],
    summary: s.summary && typeof s.summary === "object" ? s.summary : null,
    recap: String(s.recap ?? ""),
    // 0.6.0
    npcs: normalizeNpcs(s.npcs),
    attendance: normalizeAttendance(s.attendance),
    awards: normalizeAwards(s.awards),
    gained: s.gained && typeof s.gained === "object" ? s.gained : null
  };
}

// ---------------------------------------------------------------- 0.6.0: NPCs met, attendance, awards
/** At most this many people are kept in a session's attendance. */
export const ATTEND_MAX = 50;
const str = (v, max = 100) => plain(String(v ?? "")).replace(/\s+/g, " ").trim().slice(0, max);
/** NPCs met: [{ key, actorId, name, at (ms), sceneId, sceneName }], one per key, oldest first, at most MET_MAX. */
export function normalizeNpcs(list) {
  const seen = new Set(); const out = [];
  for (const n of Array.isArray(list) ? list : []) {
    if (!n || typeof n !== "object") continue;
    const key = String(n.key ?? "").slice(0, 200); if (!key || seen.has(key)) continue; seen.add(key);
    out.push({ key, actorId: String(n.actorId ?? "").slice(0, 64), name: str(n.name) || "?", at: msOf(n.at), sceneId: String(n.sceneId ?? "").slice(0, 64), sceneName: str(n.sceneName) });
  }
  return out.slice(-MET_MAX);
}
/**
 * Attendance: [{ userId, name, characterId, characterName, auto, present }], one per user, at most ATTEND_MAX. A row the GM took
 * out stays with `present: false`, so the automatic add from who's online doesn't put it back.
 */
export function normalizeAttendance(list) {
  const seen = new Set(); const out = [];
  for (const a of Array.isArray(list) ? list : []) {
    if (!a || typeof a !== "object") continue;
    const userId = String(a.userId ?? "").slice(0, 64); if (!userId || seen.has(userId)) continue; seen.add(userId);
    out.push({ userId, name: str(a.name) || "?", characterId: String(a.characterId ?? "").slice(0, 64), characterName: str(a.characterName), auto: a.auto !== false, present: a.present !== false });
  }
  return out.slice(0, ATTEND_MAX);
}
/** Awards: { xp: [{ actorId, name, n }], milestone: text }. XP is a whole number ≥ 0 (zero entries dropped). */
export function normalizeAwards(raw) {
  const a = raw && typeof raw === "object" ? raw : {};
  const seen = new Set(); const xp = [];
  for (const x of Array.isArray(a.xp) ? a.xp : []) {
    if (!x || typeof x !== "object") continue;
    const actorId = String(x.actorId ?? "").slice(0, 64); const n = Math.min(1e7, Math.max(0, Math.floor(Number(x.n) || 0)));
    if (!actorId || !n || seen.has(actorId)) continue; seen.add(actorId);
    xp.push({ actorId, name: str(x.name) || "?", n });
  }
  return { xp: xp.slice(0, ATTEND_MAX), milestone: str(a.milestone, 500) };
}

/**
 * Adds NPCs met now (0.6.0). `cands`: [{ key, actorId, name, uuid, sceneId, sceneName }]. Returns { fresh, session } where fresh
 * are the ones not met before this session (each key once, even after the GM removed it: a removed NPC stays in `met` so the next
 * scan doesn't add it back).
 */
export function meetNpcs(session, cands = [], now = Date.now()) {
  const { fresh, met } = meet(session.met ?? [], cands);
  if (!fresh.length) return { fresh, session };
  const npcs = normalizeNpcs([...(session.npcs ?? []), ...fresh.map(c => ({ ...c, at: now }))]);
  return { fresh, session: { ...session, met, npcs } };
}
/**
 * Removes one NPC from the met list (the GM's click: a hidden ambusher, a wrong token). Its name goes from the "Met" timeline line
 * (a line with nobody left goes); the key stays in `met`, so it isn't met again this session. Pure; returns the new session.
 */
export function unmeet(session, key) {
  const k = String(key ?? "");
  const npc = (session.npcs ?? []).find(n => n.key === k); if (!npc) return session;
  const npcs = session.npcs.filter(n => n.key !== k);
  const events = [];
  for (const e of session.events ?? []) {
    const keys = Array.isArray(e.data?.npcs) ? e.data.npcs : null;
    if (e.type !== "npc" || !keys || !keys.includes(k)) { events.push(e); continue; }
    const i = keys.indexOf(k);
    const nk = keys.filter(x => x !== k); const names = (e.data.names ?? []).filter((_, j) => j !== i);
    if (!nk.length) continue;
    events.push({ ...e, text: metText(names), data: { ...e.data, npcs: nk, names }, refs: e.refs.filter((_, j) => j !== i) });
  }
  return { ...session, npcs, events };
}

/**
 * Attendance from who's online (0.6.0): adds every connected player (not GMs) not listed yet, with their character. `users`:
 * [{ id, name, active, isGM, character: { id, name } | null }]. Entries the GM set by hand are kept as they are.
 */
/** The rows of an attendance list that count (not taken out by the GM). */
export const present = (list = []) => (Array.isArray(list) ? list : []).filter(a => a && a.present !== false);
export function addAttendance(list = [], users = []) {
  const have = new Set(list.map(a => a.userId)); const out = [...list];
  for (const u of users) {
    if (!u?.active || u.isGM || !u.id || have.has(u.id)) continue; have.add(u.id);
    out.push({ userId: String(u.id), name: String(u.name ?? ""), characterId: String(u.character?.id ?? ""), characterName: String(u.character?.name ?? ""), auto: true });
  }
  return normalizeAttendance(out);
}

/** The award modes (setting "awardMode"). */
export const AWARD_MODES = Object.freeze({ xp: "Experience points", milestone: "Milestones", off: "Off" });
/**
 * Totals per character across sessions (0.6.0): { [actorId]: { name, xp, milestones, sessions } }. `sessions`: normalized sessions.
 * A milestone counts once for each character present that session. The name is the newest one seen.
 */
export function awardTotals(sessions = []) {
  /** @type {Record<string, { name: string, xp: number, milestones: number, sessions: number }>} */
  const out = {};
  const row = (id, name) => (out[id] ??= { name, xp: 0, milestones: 0, sessions: 0 });
  for (const s of [...sessions].sort((a, b) => (a.n || 0) - (b.n || 0))) {
    for (const a of present(s.attendance)) if (a.characterId) { const r = row(a.characterId, a.characterName || a.name); r.sessions++; if (a.characterName) r.name = a.characterName; if (s.awards?.milestone) r.milestones++; }
    for (const x of s.awards?.xp ?? []) { const r = row(x.actorId, x.name); r.xp += x.n; r.name = x.name || r.name; }
  }
  return out;
}

// ---------------------------------------------------------------- 0.6.0: loot and coin gained this session
/**
 * The toolkit's coin log entries read defensively (`api.coinLog.entries()`: { at, actor, actorName, delta (smallest coin), reason,
 * undoneAt, undoOf }). Undone entries and the undo entries themselves are left out. null-safe.
 */
export function readCoinLog(entries) {
  return (Array.isArray(entries) ? entries : []).filter(e => e && typeof e === "object" && !e.undoneAt && !e.undoOf)
    .map(e => ({ at: msOf(e.at), actorName: str(e.actorName) || "?", delta: Math.round(Number(e.delta) || 0), reason: str(e.reason, 200) }))
    .filter(e => e.at && e.delta);
}
/** An amount in the smallest coin as { gp, sp, cp } (gold 100, silver 10, copper 1 unless `values` says otherwise). */
export function coinParts(amount, values = {}) {
  const gpV = values.gp > 0 ? values.gp : 100, spV = values.sp > 0 ? values.sp : 10, cpV = values.cp > 0 ? values.cp : 1;
  let a = Math.abs(Math.round(Number(amount) || 0));
  const gp = Math.floor(a / gpV); a -= gp * gpV; const sp = Math.floor(a / spV); a -= sp * spV;
  return { gp, sp, cp: Math.round(a / cpV) };
}
/** "12 g 5 s 3 c" (zero parts left out; "0 c" for nothing). */
export const coinText = c => ["gp", "sp", "cp"].filter(k => c[k] > 0).map(k => `${c[k]} ${k[0]}`).join(" ") || "0 c";
/**
 * The "Gained this session" block's data (0.6.0): coin from the coin log within [start, end] (party totals: gained, spent, net) and
 * reward items of quests completed this session. `quests`: [{ name, hidden, paid, items: [{ name, qty }] }] for the quests the
 * session's events say were completed. Hidden quests are left out (the block is player-safe).
 * @param {{ coinLog?: any[], start?: number, end?: number, quests?: any[], values?: Record<string, number>, now?: number }} [o]
 */
export function gained({ coinLog = [], start = 0, end = 0, quests = [], values = {}, now = Date.now() } = {}) {
  const a = msOf(start), b = msOf(end) || now;
  let plus = 0, minus = 0;
  for (const e of readCoinLog(coinLog)) if (a && e.at >= a && e.at <= b) { if (e.delta > 0) plus += e.delta; else minus -= e.delta; }
  /** @type {Map<string, number>} */ const items = new Map();
  for (const q of Array.isArray(quests) ? quests : []) {
    if (!q || q.hidden) continue;
    for (const i of Array.isArray(q.items) ? q.items : []) { const n = str(i?.name); if (n) items.set(n, (items.get(n) ?? 0) + Math.max(1, Math.floor(Number(i.qty) || 1))); }
  }
  return {
    coin: coinParts(plus, values), spent: coinParts(minus, values), net: plus - minus, netCoin: coinParts(plus - minus, values), netSign: Math.sign(plus - minus),
    items: [...items].sort((x, y) => x[0].localeCompare(y[0])).map(([name, qty]) => ({ name, qty })), any: !!(plus || minus || items.size)
  };
}

/** A new session object with `ev` added and the cap kept: the oldest events that aren't notes go first. */
export function addEvent(session, ev, max = EVENTS_MAX) {
  const s = { ...session, events: [...(session.events ?? []), ev] };
  let over = s.events.length - Math.max(1, max);
  if (over > 0) {
    const keep = [];
    for (const e of s.events) { if (over > 0 && e.type !== "note" && e !== ev) { over--; s.dropped = (s.dropped ?? 0) + 1; continue; } keep.push(e); }
    // Only notes left and still over: drop the oldest notes.
    s.events = keep.slice(-Math.max(1, max));
  }
  return s;
}

/** YYYY-MM-DD in local time. */
export function isoDate(ms) {
  const d = new Date(ms); const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export const sessionName = (n, ms) => `Session ${n} — ${isoDate(ms)}`;
export const recapName = name => `Recap: ${name}`;
/** The next session number: one past the highest stored. */
export const nextNumber = (sessions = []) => 1 + sessions.reduce((m, s) => Math.max(m, Number(s?.n) || 0), 0);

// ---------------------------------------------------------------- notes
/**
 * A quick note's text and marks. "?" at the start, or "#thread", makes an open thread; "#private" (or the dialog's box) keeps it out
 * of recaps. The marks are taken out of the text.
 */
export function parseNote(raw = "", { thread = false, private: priv = false } = {}) {
  let text = String(raw ?? "").trim();
  if (text.startsWith("?")) { thread = true; text = text.slice(1).trim(); }
  if (/(^|\s)#thread\b/i.test(text)) { thread = true; text = text.replace(/(^|\s)#thread\b/ig, " ").trim(); }
  if (/(^|\s)#private\b/i.test(text)) { priv = true; text = text.replace(/(^|\s)#private\b/ig, " ").trim(); }
  return { text: text.replace(/\s+/g, " "), thread: !!thread, private: !!priv };
}

// ---------------------------------------------------------------- inventory (items and coin)
/** A plain snapshot of an actor's items and coin: { items: { id: { name, qty } }, coin: { gp: 10, … } }. */
export function snapshot({ items = [], currency = {} } = {}) {
  const out = { items: {}, coin: {} };
  for (const i of items) if (i?.id) out.items[i.id] = { name: String(i.name ?? "?"), qty: Number.isFinite(Number(i.qty)) ? Number(i.qty) : 1 };
  for (const [k, v] of Object.entries(currency ?? {})) if (Number.isFinite(Number(v))) out.coin[k] = Number(v);
  return out;
}

/** What changed between two snapshots, items merged by name: { gained: [{ name, qty }], lost: [...], coin: { gp: +5 } }. */
export function diffInventory(before = { items: {}, coin: {} }, after = { items: {}, coin: {} }) {
  const byName = new Map();
  const add = (name, n) => byName.set(name, (byName.get(name) ?? 0) + n);
  const ids = new Set([...Object.keys(before.items ?? {}), ...Object.keys(after.items ?? {})]);
  for (const id of ids) {
    const a = before.items?.[id], b = after.items?.[id];
    const name = b?.name ?? a?.name ?? "?";
    // A renamed item counts as the same one.
    add(name, (b?.qty ?? 0) - (a?.qty ?? 0));
  }
  const gained = [], lost = [];
  for (const [name, n] of [...byName].sort((x, y) => x[0].localeCompare(y[0]))) { if (n > 0) gained.push({ name, qty: n }); else if (n < 0) lost.push({ name, qty: -n }); }
  const coin = {};
  for (const k of new Set([...Object.keys(before.coin ?? {}), ...Object.keys(after.coin ?? {})])) {
    const d = (after.coin?.[k] ?? 0) - (before.coin?.[k] ?? 0); if (d) coin[k] = d;
  }
  return { gained, lost, coin };
}
export const emptyDiff = d => !d.gained.length && !d.lost.length && !Object.keys(d.coin).length;
const COIN_ORDER = ["pp", "gp", "ep", "sp", "cp"];
const items = l => l.map(i => `${i.name}${i.qty !== 1 ? ` ×${i.qty}` : ""}`).join(", ");
/** One line for a burst of changes on one actor, or "" when nothing net changed. */
export function inventoryText(actorName, d) {
  if (emptyDiff(d)) return "";
  const parts = [];
  if (d.gained.length) parts.push(`gained ${items(d.gained)}`);
  if (d.lost.length) parts.push(`lost ${items(d.lost)}`);
  const keys = Object.keys(d.coin).sort((a, b) => ((COIN_ORDER.indexOf(a) + 1 || 99) - (COIN_ORDER.indexOf(b) + 1 || 99)) || a.localeCompare(b));
  if (keys.length) parts.push(`coin ${keys.map(k => `${d.coin[k] > 0 ? "+" : "−"}${Math.abs(d.coin[k])} ${k}`).join(", ")}`);
  return `${actorName}: ${parts.join("; ")}.`;
}

/**
 * Collects bursts per key (an actor) and hands each one over once it has been quiet for `quiet` ms, or `max` ms after it began.
 * Pure: the caller passes the time and asks due(now) for the keys to flush.
 */
export class Coalescer {
  constructor({ quiet = 8000, max = 60000 } = {}) { this.quiet = quiet; this.max = max; this.open = new Map(); }
  touch(key, now) { const o = this.open.get(key); if (o) o.last = now; else this.open.set(key, { first: now, last: now }); }
  /** Keys whose burst is over, removed from the list. */
  due(now) {
    const out = [];
    for (const [k, o] of this.open) if (now - o.last >= this.quiet || now - o.first >= this.max) { out.push(k); this.open.delete(k); }
    return out;
  }
  /** Every open key (session end), removed. */
  all() { const k = [...this.open.keys()]; this.open.clear(); return k; }
  get size() { return this.open.size; }
}

/** Adds up world-time advances; take(min) returns the total once it is at least `min` seconds (then starts again), else null. */
export class TimeTotal {
  constructor() { this.sum = 0; this.from = null; }
  add(dt, worldTime) { if (this.from == null) this.from = worldTime - dt; this.sum += dt; }
  take(min) { if (Math.abs(this.sum) < min || !this.sum) return null; const r = { seconds: this.sum, from: this.from }; this.sum = 0; this.from = null; return r; }
  clear() { this.sum = 0; this.from = null; }
}
/** "2 hours 5 minutes", "45 minutes", "3 days 4 hours", "rewound 1 hour". */
export function durationText(seconds) {
  const neg = seconds < 0; let s = Math.abs(Math.round(seconds));
  const d = Math.floor(s / 86400); s -= d * 86400; const h = Math.floor(s / 3600); s -= h * 3600; const m = Math.floor(s / 60); s -= m * 60;
  const parts = [d && plural(d, "day"), h && plural(h, "hour"), m && plural(m, "minute"), (!d && !h && !m) && plural(s, "second")].filter(Boolean).slice(0, 2);
  return `${neg ? "rewound " : ""}${parts.join(" ")}`;
}

// ---------------------------------------------------------------- companion toolkit (quests, travel log, loot rolls)
/** Quest state for diffing: { status, name, done: [objective ids], objectives: { id: text } }. */
export function questState(name, q = {}) {
  const objs = Array.isArray(q.objectives) ? q.objectives.filter(o => o && o.text) : [];
  const oid = o => String(o.id ?? o.text);
  return { name: String(name ?? ""), status: String(q.status ?? "available"), hidden: !!q.hidden, done: objs.filter(o => o.done).map(oid), objectives: Object.fromEntries(objs.map(o => [oid(o), String(o.text)])), secret: objs.filter(o => o.hidden).map(oid) };
}
/**
 * Events for one quest's change: given, completed, failed, reopened, objectives ticked. `before` null = a new quest. A hidden quest's
 * lines, and a hidden objective's, are marked `private` (GM only: kept out of the recap).
 */
export function diffQuest(before, after) {
  /** @type {{ type: string, text: string, data: any, private: boolean }[]} */
  const out = []; if (!after) return out;
  const was = before?.status ?? "available";
  if (after.status !== was) {
    const verb = { active: was === "available" ? "given" : "reopened", completed: "completed", failed: "failed", available: "reset" }[after.status];
    if (verb && verb !== "reset") out.push({ type: "quest", text: `Quest ${verb}: ${after.name}.`, data: { status: after.status }, private: !!after.hidden });
  }
  const had = new Set(before?.done ?? []);
  const secret = new Set(after.secret ?? []);
  for (const id of after.done) if (!had.has(id) && before) out.push({ type: "objective", text: `Objective done: ${after.name}: ${after.objectives[id] ?? id}.`, data: { objective: id }, private: !!after.hidden || secret.has(id) });
  return out;
}

// ---------------------------------------------------------------- toolkit hooks (0.5.0): quest changes and journeys
/** The companion toolkit's hooks Red Book listens to (0.5.0; see README, Integrations). Both carry ids and display names only. */
export const TOOLKIT_HOOKS = Object.freeze({ questUpdated: "wayfarersToolkit.questUpdated", journey: "wayfarersToolkit.journey" });
/** The `change` values of the toolkit's `wayfarersToolkit.questUpdated` hook. */
export const QUEST_CHANGES = Object.freeze(["started", "completed", "failed", "objective", "updated", "assigned"]);
const DOC_ID = /^[A-Za-z0-9]{16}$/;
/** A journal id from an id or a "JournalEntry.<id>" UUID, or "". */
const journalId = v => { const s = String(v ?? "").trim().replace(/^JournalEntry\./, ""); return DOC_ID.test(s) ? s : ""; };
/**
 * Reads the toolkit's `wayfarersToolkit.questUpdated` payload `{ questId, change }` (ids only). Returns `{ questId, change }` or null
 * for anything else (unknown change, bad id, not an object).
 * @param {any} p
 * @returns {{ questId: string, change: string } | null}
 */
export function readQuestHook(p) {
  if (!p || typeof p !== "object") return null;
  const questId = journalId(p.questId); const change = String(p.change ?? "");
  return questId && QUEST_CHANGES.includes(change) ? { questId, change } : null;
}
/** The key a logged quest event is deduped by: "<questId>:<change>[:<objective id>]" (both sources compute the same one). */
export function questKey(questId, e) {
  if (!questId || !e) return "";
  if (e.type === "objective") return `${questId}:objective:${e.data?.objective ?? ""}`;
  const c = { active: "started", completed: "completed", failed: "failed" }[e.data?.status];
  return e.type === "quest" && c ? `${questId}:${c}` : "";
}

/**
 * The line logged when the toolkit's hook reports a status change the quest data didn't show as a change (the change happened before
 * Red Book read the quest, say). Only when the quest's current status agrees with the hook; null otherwise (objective, updated and
 * assigned changes are logged from the quest data only). A hidden quest's line is GM only.
 * @param {string} change @param {{ name: string, status: string, hidden?: boolean } | null} state
 */
export function questFallback(change, state) {
  const status = { started: "active", completed: "completed", failed: "failed" }[change];
  if (!status || !state || state.status !== status) return null;
  return { type: "quest", text: `Quest ${change === "started" ? "given" : change}: ${state.name || "a quest"}.`, data: { status }, private: !!state.hidden };
}

/**
 * Keys logged recently (pure; the caller passes the time). `seen(key, now)` is true when `key` was marked within `window` ms;
 * `mark(key, now)` remembers it. At most `max` keys are kept (oldest go first).
 */
export class Recent {
  constructor({ window = 15000, max = 500 } = {}) { this.window = window; this.max = max; /** @type {Map<string, number>} */ this.at = new Map(); }
  /** @param {string} key @param {number} now */
  seen(key, now) { const t = this.at.get(key); return t !== undefined && now - t <= this.window; }
  /** @param {string} key @param {number} now */
  mark(key, now) {
    this.at.delete(key); this.at.set(key, now);
    while (this.at.size > this.max) this.at.delete(/** @type {string} */ (this.at.keys().next().value));
  }
  get size() { return this.at.size; }
}

/**
 * Merges two reports of the same change from two sources, so it is logged once (pure; the caller passes the time). The *primary*
 * source is logged at once; the *secondary* one waits `delay` ms (`settle`) and is logged only if no primary report of the same key
 * came within `window` ms. Quests: primary = the journal flag (it names the objective), secondary = the toolkit's hook. Journeys:
 * primary = the toolkit's hook (it has hours and cost), secondary = the Travel Log page line.
 * Each report is used once: two objectives ticked in a row (two primaries) both log. A secondary repeated within `repeat` ms (the hook
 * heard by two GM tabs) is dropped. At most `max` keys are remembered.
 */
export class Merge {
  constructor({ window = 15000, delay = 2000, repeat = 1500, max = 200 } = {}) {
    this.window = window; this.delay = delay; this.repeat = repeat; this.max = max;
    /** @type {Map<string, { source: "primary" | "secondary", at: number, state: "open" | "pending" | "logged" | "used" }[]>} */
    this.keys = new Map();
  }
  /** @param {string} key @param {number} now */
  #list(key, now) { const l = (this.keys.get(key) ?? []).filter(r => now - r.at <= this.window); this.keys.delete(key); if (l.length) this.keys.set(key, l); return l; }
  #put(key, list, r) {
    list.push(r); this.keys.delete(key); this.keys.set(key, list.slice(-20));
    while (this.keys.size > this.max) this.keys.delete(/** @type {string} */ (this.keys.keys().next().value));
  }
  /** A primary report: true = log it now (false: a secondary report of it was already logged). Cancels a waiting secondary. */
  primary(key, now) {
    if (!key) return true;
    const list = this.#list(key, now);
    const sec = list.find(r => r.source === "secondary" && (r.state === "pending" || r.state === "logged"));
    if (sec?.state === "logged") { sec.state = "used"; return false; }
    if (sec) { sec.state = "used"; this.#put(key, list, { source: "primary", at: now, state: "used" }); return true; }
    this.#put(key, list, { source: "primary", at: now, state: "open" });
    return true;
  }
  /** A secondary report: "skip" (already logged by the primary, or a repeat) or "wait" (call settle(key, at) after `delay`). */
  secondary(key, now) {
    if (!key) return "wait";
    const list = this.#list(key, now);
    const pri = list.find(r => r.source === "primary" && r.state === "open");
    if (pri) { pri.state = "used"; return "skip"; }
    if (list.some(r => r.source === "secondary" && now - r.at <= this.repeat)) return "skip";
    this.#put(key, list, { source: "secondary", at: now, state: "pending" });
    return "wait";
  }
  /** After the delay: true = log the secondary report made at `at` (no primary came meanwhile). */
  settle(key, at) {
    const r = (this.keys.get(key) ?? []).find(x => x.source === "secondary" && x.at === at);
    if (!r || r.state !== "pending") return false;
    r.state = "logged"; return true;
  }
  get size() { return this.keys.size; }
}

const NAME_MAX = 100;
const clipName = v => plain(String(v ?? "")).slice(0, NAME_MAX);
const coinNum = v => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? Math.min(n, 1e9) : 0; };
/**
 * Reads the toolkit's `wayfarersToolkit.journey` payload `{ kind: "hex" | "flight", fromId, toId, fromName, toName, hours,
 * cost: { gp, sp, cp }, partyId }`. Names are display strings (plain text, clipped); ids are kept as short strings. null when the kind
 * is unknown or neither name is given.
 * @param {any} p
 */
export function readJourney(p) {
  if (!p || typeof p !== "object" || (p.kind !== "hex" && p.kind !== "flight")) return null;
  const fromName = clipName(p.fromName), toName = clipName(p.toName);
  if (!fromName && !toName) return null;
  const id = v => String(v ?? "").slice(0, 64);
  const hours = Number(p.hours);
  return {
    kind: /** @type {"hex" | "flight"} */ (p.kind), fromId: id(p.fromId), toId: id(p.toId), fromName, toName, partyId: id(p.partyId),
    hours: Number.isFinite(hours) && hours > 0 ? Math.min(hours, 24 * 365) : 0,
    cost: { gp: coinNum(p.cost?.gp), sp: coinNum(p.cost?.sp), cp: coinNum(p.cost?.cp) }
  };
}
/** "2 gp 5 sp", or "" when free. */
export const costText = (c = {}) => ["gp", "sp", "cp"].filter(k => c[k] > 0).map(k => `${c[k]} ${k}`).join(" ");
/** The Travel log kind a journey pairs with: a flight, or "travel" for a hex trip (the Travel Log page's classes). */
export const journeyKind = j => (j?.kind === "flight" ? "flight" : "travel");
/** The timeline event for a journey read with readJourney: type "travel". */
export function journeyEvent(j) {
  if (!j) return null;
  const route = `${j.fromName || "?"} → ${j.toName || "?"}`;
  const parts = [route, j.hours ? durationText(Math.round(j.hours * 3600)) : "", costText(j.cost)].filter(Boolean);
  const kind = journeyKind(j);
  return { type: "travel", text: `${kind === "flight" ? "Flight" : "Travel"}: ${parts.join(", ")}.`, data: { kind, via: "hook", fromId: j.fromId, toId: j.toId, partyId: j.partyId, hours: j.hours, cost: j.cost } };
}

/** New lines appended to the toolkit's Travel Log page, classed as flight, travel or other. The session-start line is skipped. */
export function travelLogAdditions(before = "", after = "") {
  const a = String(before ?? ""), b = String(after ?? "");
  const added = b.startsWith(a) ? b.slice(a.length) : "";
  if (!added.trim()) return [];
  return (added.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) ?? [added]).map(p => plain(p)).filter(Boolean).flatMap(text => {
    if (/^Session started\b/i.test(text)) return [];
    if (/^Flight\./i.test(text)) return [{ type: "travel", text: `Flight: ${text.replace(/^Flight\.\s*/i, "")}`, data: { kind: "flight" } }];
    if (/^Trip \d+\./i.test(text)) return [{ type: "travel", text: `Travel: ${text.replace(/^Trip \d+\.\s*/i, "")}`, data: { kind: "travel" } }];
    return [{ type: "travel", text, data: { kind: "other" } }];
  });
}

/** An event for a finished toolkit loot roll (its card state), or null while it is still open. */
export function lootRollEvent(st) {
  if (!st || st.status !== "done") return null;
  const result = plain(st.result ?? "");
  return { type: "lootRoll", text: `Loot roll for ${st.name ?? "an item"}${st.quantity > 1 ? ` ×${st.quantity}` : ""}: ${result || "settled"}` };
}

// ---------------------------------------------------------------- summary and page
const NOTABLE = new Set(["death", "level", "quest", "combatStart"]);
const QUESTS = new Set(["quest", "objective"]);
/**
 * Counts by type, notable moments (kills, level-ups, quests, combats), quest progress (0.5.0: quests and objectives, GM-only ones
 * marked private) and open threads.
 */
export function summarize(session) {
  const counts = {};
  for (const e of session.events) if (e.type !== "session") counts[e.type] = (counts[e.type] ?? 0) + 1;
  const notable = session.events.filter(e => NOTABLE.has(e.type) && !e.private).slice(0, 20).map(e => e.text);
  const threads = session.events.filter(e => e.type === "note" && e.thread).map(e => ({ id: e.id, text: e.text, private: e.private }));
  const quests = session.events.filter(e => QUESTS.has(e.type)).slice(0, 50).map(e => ({ text: e.text, private: e.private }));
  const real = session.endedAt && session.startedAt ? session.endedAt - session.startedAt : 0;
  const world = session.endWorld - session.startWorld;
  return { counts, notable, quests, threads, realMs: Math.max(0, real), worldSeconds: world, dropped: session.dropped ?? 0 };
}

export function summaryHTML(sum) {
  const counts = Object.entries(sum.counts).filter(([, n]) => n).map(([k, n]) => `<li>${esc(TYPES[k]?.label ?? k)}: ${n}</li>`).join("");
  const length = [sum.realMs ? `Played ${durationText(Math.round(sum.realMs / 1000))}` : "", sum.worldSeconds ? `in-world ${durationText(sum.worldSeconds)}` : ""].filter(Boolean).join(", ");
  const pubThreads = sum.threads.filter(t => !t.private), privThreads = sum.threads.filter(t => t.private);
  const quests = Array.isArray(sum.quests) ? sum.quests : [];
  const pubQuests = quests.filter(q => !q.private), privQuests = quests.filter(q => q.private);
  // Quest lines have their own list (0.5.0); older summaries without one keep them under Notable moments.
  const questText = new Set(quests.map(q => q.text));
  const notable = (sum.notable ?? []).filter(x => !questText.has(x));
  return [
    `<section class="rb-summary"><h2>Summary</h2>`,
    length ? `<p>${esc(length)}.</p>` : "",
    counts ? `<ul>${counts}</ul>` : `<p>Nothing was logged.</p>`,
    notable.length ? `<h3>Notable moments</h3><ul>${notable.map(t => `<li>${esc(t)}</li>`).join("")}</ul>` : "",
    pubQuests.length ? `<h3>Quests</h3><ul>${pubQuests.map(q => `<li>${esc(q.text)}</li>`).join("")}</ul>` : "",
    privQuests.length ? `<section class="secret" id="secret-rb-quests"><p><strong>GM-only quest progress</strong></p><ul>${privQuests.map(q => `<li>${esc(q.text)}</li>`).join("")}</ul></section>` : "",
    pubThreads.length ? `<h3>Open threads</h3><ul>${pubThreads.map(t => `<li>${esc(t.text)}</li>`).join("")}</ul>` : "",
    privThreads.length ? `<section class="secret" id="secret-rb-threads"><p><strong>Private open threads</strong></p><ul>${privThreads.map(t => `<li>${esc(t.text)}</li>`).join("")}</ul></section>` : "",
    sum.dropped ? `<p><em>${plural(sum.dropped, "older event")} dropped to keep the log under its size cap.</em></p>` : "",
    `</section>`
  ].join("");
}

/**
 * The time a row shows: the clock reading (rtText, or the time from `t`), with the date in front when it isn't the session's start
 * date (0.6.0; `dates` off: the clock only).
 * `stored`: use the clock reading written with the event (rtText) when there is one.
 * @param {any} e @param {{ start?: number, timeZone?: string, locale?: string, dates?: boolean, stored?: boolean }} [o]
 */
export function whenText(e, o = {}) {
  // The journal page (written once, by the recording GM's browser) keeps the stored reading; windows work it out for the viewer.
  const clock = (o.stored ? e.rtText : "") || (e.t ? timeLabel(e.t, o) : e.rtText || "");
  if (o.dates === false || !e.t || !o.start || !otherDay(e.t, o.start, o.timeZone)) return clock;
  return `${dayLabel(e.t, o)} ${clock}`.trim();
}
/** @UUID links for an event's refs are added after the text when it doesn't already name them. */
function lineHTML(e, o = {}) {
  const when = [whenText(e, o), e.wtText].filter(Boolean).map(esc).join(" · ");
  const tag = e.thread ? ` <strong>[thread]</strong>` : "";
  const links = e.refs.length ? ` ${e.refs.slice(0, 6).map(u => `@UUID[${u}]`).join(" ")}` : "";
  return `${when ? `<span class="rb-when">${when}</span> ` : ""}${esc(e.text)}${tag}${links}`;
}

/**
 * The session page: header (with its date range), the summary once ended, then the timeline. Private events go in secret blocks
 * (GM-only in Foundry). 0.6.0: a day heading wherever the timeline crosses midnight (in `o.timeZone`: the writing GM's zone), and
 * the date on rows that aren't on the start date; `o.extras` (trusted HTML: NPCs met, attendance, awards, gained) after the summary.
 * @param {any} session @param {{ timeZone?: string, locale?: string, dates?: boolean, extras?: string }} [o]
 */
export function pageHTML(session, o = {}) {
  const out = [];
  const opts = { ...o, start: session.startedAt, stored: true };
  const range = session.startedAt && o.dates !== false ? rangeText(session.startedAt, session.open ? 0 : session.endedAt, o) : "";
  out.push(`<p class="rb-head"><strong>${esc(session.name)}</strong>${range ? ` · ${esc(range)}` : ""}${session.open ? " · <em>open: this page is rewritten as events come in; write your own notes on another page</em>" : ""}</p>`);
  if (!session.open && session.summary) out.push(summaryHTML(session.summary));
  if (o.extras) out.push(o.extras);
  out.push(`<h2>Timeline</h2>`);
  let list = [];
  const flush = () => { if (list.length) out.push(`<ul class="rb-timeline">${list.join("")}</ul>`); list = []; };
  let day = session.startedAt ? dayKey(session.startedAt, o.timeZone) : "";
  for (const e of session.events) {
    if (o.dates !== false && e.t) {
      const k = dayKey(e.t, o.timeZone);
      if (day && k !== day) { flush(); out.push(`<h3 class="rb-day">${esc(dayLabel(e.t, o))}</h3>`); }
      day = k;
    }
    if (e.private) { flush(); out.push(`<section class="secret" id="secret-rb-${esc(e.id)}"><p>${lineHTML(e, opts)}</p></section>`); continue; }
    list.push(`<li>${lineHTML(e, opts)}</li>`);
  }
  flush();
  if (!session.events.length) out.push(`<p>Nothing logged yet.</p>`);
  return out.join("\n");
}

// ---------------------------------------------------------------- 0.6.0: the extra blocks on the Timeline page (and so in the recap)
/** Labels for the extra blocks; session.mjs passes the lang/en.json strings. */
export const EXTRA_LABELS = Object.freeze({
  npcs: "NPCs met", attendance: "At the table", xp: "Experience", milestone: "Milestone", gained: "Gained this session",
  coin: "Coin", spent: "Spent", items: "Items", xpGm: "Experience awarded (GM only)", seen: "first seen"
});
/**
 * The extra blocks (0.6.0), trusted HTML (every value escaped). `m`: { npcs (normalizeNpcs) | null, attendance | null, awards |
 * null, mode ("xp" | "milestone" | "off"), gained (gained()) | null, timeZone, locale, start }. Player-safe except XP, which goes in a
 * secret block (players see the milestone text only, never XP numbers). A block whose part is null (feature off) is left out.
 * @param {any} m @param {Record<string, string>} [L]
 */
export function extrasHTML(m = {}, L = EXTRA_LABELS) {
  const out = [];
  const o = { timeZone: m.timeZone, locale: m.locale };
  const here = present(m.attendance ?? []);
  if (here.length) out.push(`<h3>${esc(L.attendance)}</h3><ul class="rb-attendance">${here.map(a => `<li>${esc(a.characterName || a.name)}${a.characterName && a.name ? ` (${esc(a.name)})` : ""}</li>`).join("")}</ul>`);
  if (m.awards && m.mode === "milestone" && m.awards.milestone) out.push(`<h3>${esc(L.milestone)}</h3><p class="rb-milestone">${esc(m.awards.milestone)}</p>`);
  if (m.awards && m.mode === "xp" && m.awards.xp?.length) out.push(`<section class="secret" id="secret-rb-xp"><p><strong>${esc(L.xpGm)}</strong></p><ul>${m.awards.xp.map(x => `<li>${esc(x.name)}: ${x.n} XP</li>`).join("")}</ul></section>`);
  if (m.npcs?.length) out.push(`<h3>${esc(L.npcs)}</h3><ul class="rb-npcs">${m.npcs.map(n => `<li>${esc(n.name)}${n.sceneName ? ` · ${esc(n.sceneName)}` : ""}${n.at ? ` · ${esc(L.seen)} ${esc(whenText({ t: n.at }, { ...o, start: m.start, dates: m.dates }))}` : ""}</li>`).join("")}</ul>`);
  const g = m.gained;
  if (g?.any) {
    const lines = [];
    if (g.net) lines.push(`<li>${esc(L.coin)}: ${g.netSign < 0 ? "−" : "+"}${esc(coinText(g.netCoin))}${g.spent && (g.spent.gp || g.spent.sp || g.spent.cp) ? ` (${esc(L.spent)} ${esc(coinText(g.spent))})` : ""}</li>`);
    for (const i of g.items) lines.push(`<li>${esc(i.name)}${i.qty > 1 ? ` ×${i.qty}` : ""}</li>`);
    if (lines.length) out.push(`<h3>${esc(L.gained)}</h3><ul class="rb-gained">${lines.join("")}</ul>`);
  }
  return out.length ? `<section class="rb-extras">${out.join("")}</section>` : "";
}

/**
 * Coin in the session's own loot lines (inventory diffs, data.coin) as coin-log-shaped entries in copper: the fallback when the
 * toolkit's coin log isn't there (toolkit off, its coin log off, or an older toolkit).
 */
export function coinFromLoot(events = []) {
  const V = { pp: 1000, gp: 100, ep: 50, sp: 10, cp: 1 };
  const out = [];
  for (const e of events) {
    if (e?.type !== "loot" || !e.data?.coin || typeof e.data.coin !== "object") continue;
    let n = 0; for (const [k, v] of Object.entries(e.data.coin)) n += (V[k] ?? 0) * (Number(v) || 0);
    if (Math.round(n)) out.push({ id: e.id, at: e.t, actor: "loot", actorName: "", delta: Math.round(n) });
  }
  return out;
}

/**
 * One GM edit to a session (0.6.0), pure: `op` is a "sessionEdit" request's fields. unmeet { key }; attend { userId, present, name,
 * characterId, characterName }; award { actorId, name, n }; milestone { text }. Unknown ops return the session unchanged.
 * @param {any} session @param {any} op
 */
export function applyEdit(session, op = {}) {
  if (op.op === "unmeet") return unmeet(session, op.key);
  if (op.op === "attend") {
    const list = session.attendance ?? [];
    const was = list.find(a => a.userId === op.userId);
    const row = { ...(was ?? { userId: op.userId, name: op.name ?? "" }), characterId: op.characterId ?? was?.characterId ?? "", characterName: op.characterName ?? was?.characterName ?? "", auto: false, present: !!op.present };
    return { ...session, attendance: normalizeAttendance(was ? list.map(a => (a.userId === op.userId ? row : a)) : [...list, row]) };
  }
  if (op.op === "award") {
    const xp = (session.awards?.xp ?? []).filter(x => x.actorId !== op.actorId);
    if (Number(op.n) > 0) xp.push({ actorId: op.actorId, name: op.name, n: op.n });
    return { ...session, awards: normalizeAwards({ ...(session.awards ?? {}), xp }) };
  }
  if (op.op === "milestone") return { ...session, awards: normalizeAwards({ ...(session.awards ?? {}), milestone: op.text }) };
  return session;
}

// ---------------------------------------------------------------- recap
/** Removes every <section class="secret">…</section> (nested sections inside one are removed with it). */
export function stripSecrets(html = "") {
  let s = String(html ?? "");
  const open = /<section\b[^>]*class\s*=\s*["'][^"']*\bsecret\b[^"']*["'][^>]*>/i;
  for (let guard = 0; guard < 500; guard++) {
    const m = open.exec(s); if (!m) break;
    let depth = 1; const i = m.index + m[0].length; const tag = /<\/?section\b[^>]*>/gi; tag.lastIndex = i;
    let t; let end = s.length;
    while ((t = tag.exec(s))) { depth += t[0][1] === "/" ? -1 : 1; if (depth === 0) { end = t.index + t[0].length; break; } }
    s = s.slice(0, m.index) + s.slice(end);
  }
  return s;
}
const LI = /<li\b[^>]*>[\s\S]*?<\/li>/gi;
/** Secrets and HTML comments out: the shared first step of listLines and stripForRecap, so their line numbers agree. */
const gmFree = html => stripSecrets(html).replace(/<!--[\s\S]*?-->/g, "");
/** The list lines of a page (after secrets are taken out), in order: [{ index, text }]. The review dialog shows these. */
export function listLines(html = "") {
  return [...gmFree(html).matchAll(LI)].map((m, index) => ({ index, text: plain(m[0]) }));
}
/**
 * The player copy of a page: secret blocks, HTML comments and the list lines at the `drop` indexes (as numbered by listLines) are
 * removed; @UUID links become their plain label (players may not be able to open them); empty lists go too.
 */
export function stripForRecap(html = "", drop = []) {
  const gone = new Set(drop.map(Number));
  let i = -1;
  let s = gmFree(html);
  s = s.replace(LI, li => (++i, gone.has(i) ? "" : li));
  s = s.replace(/@UUID\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/@UUID\[[^\]]*\]/g, "");
  s = s.replace(/<p class="rb-head">[\s\S]*?<\/p>/i, "");
  s = s.replace(/<ul\b[^>]*>\s*<\/ul>/gi, "");
  return s.trim();
}

/** The text of several journal pages joined for a recap, each under its page name (pages with no text are left out). */
export function joinPages(pages = []) {
  return pages.filter(p => p && String(p.html ?? "").trim()).map(p => `<h2>${esc(p.name)}</h2>\n${p.html}`).join("\n");
}
/** The player recap page: a short header and the stripped text. */
export function recapHTML(sessionName, stripped, range = "") {
  return `<p><em>Recap of ${esc(sessionName)}${range ? ` (${esc(range)})` : ""}.</em></p>\n${stripped || "<p>Nothing to share.</p>"}`;
}

// ---------------------------------------------------------------- hit points and levels (state kept by the recorder)
/**
 * Whether a hit point change is a new drop to 0: `downed` is the set of actor UUIDs already at 0 this session (changed in place).
 * Returns "down" (first time at 0), "up" (back above 0) or null.
 */
export function hpTransition(downed, uuid, hp) {
  const v = Number(hp); if (!Number.isFinite(v)) return null;
  if (v <= 0) { if (downed.has(uuid)) return null; downed.add(uuid); return "down"; }
  if (downed.delete(uuid)) return "up";
  return null;
}
/** A level-up line when `after` is above `before` (both numbers; a missing `before` logs nothing). */
export function levelText(name, before, after, cls = "") {
  const a = Number(after), b = Number(before);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= b) return "";
  return `${name} reached ${cls ? `${cls} ` : ""}level ${a}.`;
}
/** A combat's end line: who fought and who was defeated. */
export function combatEndText({ round = 0, combatants = [], defeated = [] } = {}) {
  const who = combatants.length ? ` Combatants: ${combatants.join(", ")}.` : "";
  const down = defeated.length ? ` Defeated: ${defeated.join(", ")}.` : "";
  return `Combat ended after ${plural(Math.max(0, round), "round")}.${who}${down}`;
}

/** Adds NPC keys to the met list; returns the new ones (not met before this session) and the capped list. */
export function meet(met = [], candidates = [], max = MET_MAX) {
  const have = new Set(met); const fresh = [];
  for (const c of candidates) { if (!c?.key || have.has(c.key)) continue; have.add(c.key); fresh.push(c); }
  return { fresh, met: [...have].slice(-max) };
}
/** One line for NPCs met at once. */
export const metText = names => names.length ? `Met ${names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`}.` : "";
/** The open threads to carry forward: from the summary when ended, else from the events (open session). */
export function openThreads(session) {
  if (!session) return [];
  if (!session.open && session.summary?.threads) return session.summary.threads;
  return session.events.filter(e => e.type === "note" && e.thread).map(e => ({ id: e.id, text: e.text, private: e.private }));
}

/**
 * The "Start a session?" prompt, with its Foundry parts injected (tested in Node). `ask()` opens the dialog and resolves true/false/null;
 * `subscribe(fn)` calls fn when a session starts some other way and returns an unsubscribe function; `close()` closes the dialog;
 * `isOpen()` says whether a session is open now; `start()` starts one. A session started while the prompt is up closes it, and a Yes
 * clicked after that (or with a session already open) does nothing. Resolves to whether `start()` was called.
 */
export async function startPrompt({ ask, subscribe, close = () => { }, isOpen = () => false, start }) {
  let started = false;
  const off = subscribe?.(() => { started = true; try { close(); } catch { } }) ?? (() => { });
  try {
    const ok = await ask();
    if (!ok || started || isOpen()) return false;
    start(); return true;
  } finally { try { off(); } catch { } }
}

/**
 * The `red-book.eventLogged` hook payload: ids only, so a player client that hears it learns nothing from the GM-only log (no text,
 * no linked documents, not whether it was a private note). `{ session, event: { id, type, t, wt } }`; a GM client reads the full
 * event from the journal (api.session.get(session).events).
 */
export function eventHookPayload(session, ev) {
  const type = ev?.type === "note" ? "note" : String(ev?.type ?? "note");
  return { session: String(session ?? ""), event: { id: String(ev?.id ?? ""), type, t: Number(ev?.t) || 0, wt: Number(ev?.wt) || 0 } };
}
