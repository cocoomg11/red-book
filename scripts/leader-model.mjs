/**
 * Pure helpers for "exactly one client acts" (no Foundry calls; tested in Node). Same approach as the companion toolkit's gm-model.
 *
 * Foundry's active GM is a user, but one GM user can be logged in on several clients (two tabs, a laptop and a desktop). Each of those
 * clients would think it is the active GM, so every automatic write would happen once per tab. Each GM client therefore takes a
 * random session id at load and announces it over the module socket; among the live sessions of the active GM user, the one that
 * started first (ties: the lowest id) is the leader, and only the leader records and writes.
 *
 * Liveness: a client pings every HEARTBEAT_MS and every other GM client answers "here" at once. A peer counts as alive when it was
 * heard after this client's previous ping (minus a grace). Measuring against our own pings, not the wall clock, keeps a background
 * tab (whose timers the browser slows to once a minute) from being declared dead: it still answers pings straight away, because socket
 * messages are not throttled. A tab that closes says "bye" (hand-over at once); one that crashes drops out after two missed pings.
 * A lone client always counts itself, so it leads once the short settle window has passed.
 */
export const HEARTBEAT_MS = 2000;
export const GRACE_MS = 1000;
export const SETTLE_MS = 800;
export const SEEN_MAX = 200;

const ID_RE = /^[A-Za-z0-9_-]{4,64}$/;

/** A random session or request id (letters and digits). `rand` is for tests. */
export function newId(rand = Math.random, length = 16) {
  const abc = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = ""; for (let i = 0; i < length; i++) s += abc[Math.floor(rand() * abc.length) % abc.length];
  return s;
}

/** Ordering of sessions: earliest start first, then lowest id. */
export function compareSessions(a, b) {
  if (a.since !== b.since) return a.since < b.since ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The cut-off for "still alive": heard after this client's previous ping, minus a grace. `prevPing` null: everyone counts. */
export function aliveCutoff(prevPing, grace = GRACE_MS) {
  return typeof prevPing === "number" && Number.isFinite(prevPing) ? prevPing - grace : -Infinity;
}

/**
 * The leader's session id among `sessions` ([{ id, userId, since, seen }]) for GM user `gmUserId`, or null. Sessions last seen before
 * `cutoff` are ignored; `self` always counts while it belongs to that user.
 */
export function leaderOf(sessions = [], { gmUserId, cutoff = -Infinity, self = null } = {}) {
  if (!gmUserId) return null;
  const live = sessions.filter(s => s && s.userId === gmUserId && s.id !== self?.id && (s.seen ?? -Infinity) >= cutoff);
  if (self && self.userId === gmUserId) live.push(self);
  return live.sort(compareSessions)[0]?.id ?? null;
}

export function isLeader(sessions, { gmUserId, cutoff, self }) {
  return !!self && self.userId === gmUserId && leaderOf(sessions, { gmUserId, cutoff, self }) === self.id;
}

/** Drops sessions last seen before `cutoff`. */
export function prune(sessions = [], cutoff = -Infinity) { return sessions.filter(s => (s.seen ?? -Infinity) >= cutoff); }

/** A session socket message { action: "leader", op: "ping" | "here" | "bye", sid, since } read safely, or null. */
export function readSessionMessage(msg) {
  if (!msg || msg.action !== "leader" || !["ping", "here", "bye"].includes(msg.op)) return null;
  if (typeof msg.sid !== "string" || !ID_RE.test(msg.sid)) return null;
  const since = Number(msg.since);
  return { op: msg.op, sid: msg.sid, since: Number.isFinite(since) ? since : 0 };
}

/** Applies a session message from `userId` (Foundry's sender id, never the message's word) at `now`. Returns the new table. */
export function applySessionMessage(sessions = [], m, userId, now = 0) {
  if (!m || !userId) return sessions;
  const rest = sessions.filter(s => s.id !== m.sid);
  if (m.op === "bye") return rest;
  return [...rest, { id: m.sid, userId, since: m.since, seen: now }];
}

/** The active GM user: Foundry's pick when it is an active GM, else the active GM with the lowest id, else null. */
export function pickActiveGM(users = [], declared = null) {
  if (declared && declared.isGM && declared.active) return declared;
  return [...users].filter(u => u?.isGM && u.active).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0] ?? null;
}

/**
 * A bounded "seen before" cache for request ids. firstTime(id) is true the first time (and remembers it), false after. Missing ids
 * always pass. The oldest ids drop off past `max`.
 */
export function seenCache(max = SEEN_MAX) {
  const ids = new Set();
  return {
    firstTime(id) {
      if (typeof id !== "string" || !id) return true;
      if (ids.has(id)) return false;
      ids.add(id);
      while (ids.size > max) ids.delete(ids.values().next().value);
      return true;
    },
    has: id => ids.has(id),
    get size() { return ids.size; }
  };
}

/** A request id from a socket message, or null. */
export function requestId(msg) { return typeof msg?.rid === "string" && ID_RE.test(msg.rid) ? msg.rid : null; }
