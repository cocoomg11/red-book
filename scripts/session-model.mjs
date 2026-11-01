/**
 * Session log: the pure part (no Foundry calls; tested in Node). The session's data lives in flags.red-book.session on its journal
 * entry; normalizeSession() reads every stored version. Events are plain objects; their times are formatted when they are logged
 * (rtText: real clock, wtText: the world calendar), so rendering needs no clock or calendar.
 *
 * Event: { id, type, t (real ms), wt (world seconds), rtText, wtText, text, refs: [uuid], data: {}, private, thread }
 */
import { esc, plain, plural } from "./const.mjs";

export const SESSION_VERSION = 1;
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
  journal: "Journals shown to players", npc: "NPCs met", level: "Level-ups", toolkit: "Quests, travel, flights and loot rolls (Wayfarer's Toolkit)"
};
export const groupOf = type => TYPES[type]?.group ?? type;
/** Whether events of `type` are logged, given the list of turned-off groups. Notes and session lines always are. */
export const typeOn = (type, off = []) => type === "note" || type === "session" || !off.includes(groupOf(type));

let seq = 0;
const eid = (t) => `${Math.floor(t).toString(36)}${(seq++ % 1296).toString(36).padStart(2, "0")}${Math.random().toString(36).slice(2, 5)}`;

/** A clean event. Unknown types become notes. */
export function makeEvent(e = {}, now = Date.now()) {
  const t = Number(e.t) || now;
  return {
    id: String(e.id || eid(t)), type: TYPES[e.type] ? e.type : "note", t, wt: Number(e.wt) || 0,
    rtText: String(e.rtText ?? ""), wtText: String(e.wtText ?? ""), text: String(e.text ?? "").slice(0, 2000),
    refs: Array.isArray(e.refs) ? e.refs.filter(r => typeof r === "string").slice(0, 20) : [],
    data: e.data && typeof e.data === "object" ? e.data : {}, private: !!e.private, thread: !!e.thread
  };
}

/** Reads any stored session shape (missing v = 0: the same fields, unchecked) into the current one. */
export function normalizeSession(raw = {}) {
  const s = raw && typeof raw === "object" ? raw : {};
  return {
    v: SESSION_VERSION, n: Math.max(1, Math.floor(Number(s.n) || 1)), name: String(s.name ?? ""),
    startedAt: Number(s.startedAt) || 0, endedAt: Number(s.endedAt) || 0, startWorld: Number(s.startWorld) || 0, endWorld: Number(s.endWorld) || 0,
    open: s.open === undefined ? !s.endedAt : !!s.open,
    events: (Array.isArray(s.events) ? s.events : []).filter(e => e && typeof e === "object").map(e => makeEvent(e)),
    dropped: Math.max(0, Number(s.dropped) || 0),
    met: Array.isArray(s.met) ? [...new Set(s.met.map(String))].slice(-MET_MAX) : [],
    summary: s.summary && typeof s.summary === "object" ? s.summary : null,
    recap: String(s.recap ?? "")
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
  return { name: String(name ?? ""), status: String(q.status ?? "available"), hidden: !!q.hidden, done: objs.filter(o => o.done).map(o => String(o.id ?? o.text)), objectives: Object.fromEntries(objs.map(o => [String(o.id ?? o.text), String(o.text)])) };
}
/** Events for one quest's change: given, completed, failed, reopened, objectives ticked. `before` null = a new quest. */
export function diffQuest(before, after) {
  const out = []; if (!after) return out;
  const was = before?.status ?? "available";
  if (after.status !== was) {
    const verb = { active: was === "available" ? "given" : "reopened", completed: "completed", failed: "failed", available: "reset" }[after.status];
    if (verb && verb !== "reset") out.push({ type: "quest", text: `Quest ${verb}: ${after.name}.`, data: { status: after.status } });
  }
  const had = new Set(before?.done ?? []);
  for (const id of after.done) if (!had.has(id) && before) out.push({ type: "objective", text: `Objective done: ${after.name}: ${after.objectives[id] ?? id}.` });
  return out;
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
/** Counts by type, notable moments (kills, level-ups, quests, combats) and open threads. */
export function summarize(session) {
  const counts = {};
  for (const e of session.events) if (e.type !== "session") counts[e.type] = (counts[e.type] ?? 0) + 1;
  const notable = session.events.filter(e => NOTABLE.has(e.type)).slice(0, 20).map(e => e.text);
  const threads = session.events.filter(e => e.type === "note" && e.thread).map(e => ({ id: e.id, text: e.text, private: e.private }));
  const real = session.endedAt && session.startedAt ? session.endedAt - session.startedAt : 0;
  const world = session.endWorld - session.startWorld;
  return { counts, notable, threads, realMs: Math.max(0, real), worldSeconds: world, dropped: session.dropped ?? 0 };
}

export function summaryHTML(sum) {
  const counts = Object.entries(sum.counts).filter(([, n]) => n).map(([k, n]) => `<li>${esc(TYPES[k]?.label ?? k)}: ${n}</li>`).join("");
  const length = [sum.realMs ? `Played ${durationText(Math.round(sum.realMs / 1000))}` : "", sum.worldSeconds ? `in-world ${durationText(sum.worldSeconds)}` : ""].filter(Boolean).join(", ");
  const pubThreads = sum.threads.filter(t => !t.private), privThreads = sum.threads.filter(t => t.private);
  return [
    `<section class="rb-summary"><h2>Summary</h2>`,
    length ? `<p>${esc(length)}.</p>` : "",
    counts ? `<ul>${counts}</ul>` : `<p>Nothing was logged.</p>`,
    sum.notable.length ? `<h3>Notable moments</h3><ul>${sum.notable.map(t => `<li>${esc(t)}</li>`).join("")}</ul>` : "",
    pubThreads.length ? `<h3>Open threads</h3><ul>${pubThreads.map(t => `<li>${esc(t.text)}</li>`).join("")}</ul>` : "",
    privThreads.length ? `<section class="secret" id="secret-rb-threads"><p><strong>Private open threads</strong></p><ul>${privThreads.map(t => `<li>${esc(t.text)}</li>`).join("")}</ul></section>` : "",
    sum.dropped ? `<p><em>${plural(sum.dropped, "older event")} dropped to keep the log under its size cap.</em></p>` : "",
    `</section>`
  ].join("");
}

/** @UUID links for an event's refs are added after the text when it doesn't already name them. */
function lineHTML(e) {
  const when = [e.rtText, e.wtText].filter(Boolean).map(esc).join(" · ");
  const tag = e.thread ? ` <strong>[thread]</strong>` : "";
  const links = e.refs.length ? ` ${e.refs.slice(0, 6).map(u => `@UUID[${u}]`).join(" ")}` : "";
  return `${when ? `<span class="rb-when">${when}</span> ` : ""}${esc(e.text)}${tag}${links}`;
}

/** The session page: header, the summary once ended, then the timeline. Private events go in secret blocks (GM-only in Foundry). */
export function pageHTML(session) {
  const out = [];
  out.push(`<p class="rb-head"><strong>${esc(session.name)}</strong>${session.open ? " · <em>open: this page is rewritten as events come in; write your own notes on another page</em>" : ""}</p>`);
  if (!session.open && session.summary) out.push(summaryHTML(session.summary));
  out.push(`<h2>Timeline</h2>`);
  let list = [];
  const flush = () => { if (list.length) out.push(`<ul class="rb-timeline">${list.join("")}</ul>`); list = []; };
  for (const e of session.events) {
    if (e.private) { flush(); out.push(`<section class="secret" id="secret-rb-${esc(e.id)}"><p>${lineHTML(e)}</p></section>`); continue; }
    list.push(`<li>${lineHTML(e)}</li>`);
  }
  flush();
  if (!session.events.length) out.push(`<p>Nothing logged yet.</p>`);
  return out.join("\n");
}

// ---------------------------------------------------------------- recap
/** Removes every <section class="secret">…</section> (nested sections inside one are removed with it). */
export function stripSecrets(html = "") {
  let s = String(html ?? "");
  const open = /<section\b[^>]*class\s*=\s*["'][^"']*\bsecret\b[^"']*["'][^>]*>/i;
  for (let guard = 0; guard < 500; guard++) {
    const m = open.exec(s); if (!m) break;
    let depth = 1, i = m.index + m[0].length; const tag = /<\/?section\b[^>]*>/gi; tag.lastIndex = i;
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
export function recapHTML(sessionName, stripped) {
  return `<p><em>Recap of ${esc(sessionName)}.</em></p>\n${stripped || "<p>Nothing to share.</p>"}`;
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
