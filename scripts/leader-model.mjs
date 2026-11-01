/**
 * Leader election among the browser tabs (clients) of the active GM user, and request de-duplication. Pure: no Foundry calls; the
 * clock, the random source and the send function are passed in, so it is tested in Node.
 *
 * Why: Foundry's "active GM" is a user, not a client. One GM with two tabs open runs every hook twice, so automatic writes happen twice.
 * Each client picks a session id at load; GM clients announce themselves over the module socket ("hello", then a heartbeat). Among the
 * live clients of the active GM user, the lowest id leads. Ids start with the load time, so the oldest tab leads and a tab opened later
 * never takes over from a working leader. A lone client leads once the short settle window has passed with nobody answering. A leader
 * that closes says "bye" (hand-over at once); one that vanishes stops sending heartbeats and drops out after TTL_MS.
 */
export const HEARTBEAT_MS = 4000;
export const TTL_MS = 10000;
export const SETTLE_MS = 1500;

/** A client session id: load time (base 36, fixed width, so ids sort by age) plus a random tail. */
export function makeClientId(now = Date.now(), rand = Math.random) {
  const t = Math.max(0, Math.floor(now)).toString(36).padStart(10, "0");
  const r = Math.floor(rand() * 36 ** 6).toString(36).padStart(6, "0");
  return `${t}-${r}`;
}

/**
 * The leading client id, or null. `clients`: [{ cid, uid, seen }] (seen: last time heard, ms; the client itself can pass seen = now).
 * Only clients of `gmUserId` that were heard within `ttl` count. Lowest id wins.
 */
export function electLeader(clients = [], gmUserId = null, now = Date.now(), ttl = TTL_MS) {
  if (!gmUserId) return null;
  const live = clients.filter(c => c && c.cid && c.uid === gmUserId && now - (Number(c.seen) || 0) <= ttl).map(c => String(c.cid)).sort();
  return live[0] ?? null;
}

/**
 * The election state of one client. `self`: { cid, uid, isGM }. `send(msg)` broadcasts on the socket. `activeGM()` returns the active
 * GM user's id (or null). `now()` the clock. Call start() at ready, receive(msg, now) for every socket message, tick() every few
 * seconds (heartbeat + expiry) and stop() when the page goes. onChange(isLeader, leaderCid) fires when this client's leadership flips.
 */
export class Election {
  constructor({ self, send, activeGM, now = () => Date.now(), onChange = () => {}, ttl = TTL_MS, settle = SETTLE_MS }) {
    this.self = self; this.send = send; this.activeGM = activeGM; this.now = now; this.onChange = onChange;
    this.ttl = ttl; this.settle = settle; this.peers = new Map(); this.startedAt = null; this.leading = false; this.stopped = false;
  }
  /** Whether this client takes part: only GM users' clients do. Players never lead and never send. */
  get eligible() { return !!this.self?.isGM; }
  start() {
    if (!this.eligible) return;
    this.startedAt = this.now();
    this.send({ action: "hello", cid: this.self.cid, uid: this.self.uid, reply: false });
  }
  stop() {
    if (!this.eligible || this.stopped) return;
    this.stopped = true;
    this.send({ action: "bye", cid: this.self.cid, uid: this.self.uid });
    this.#set(false);
  }
  /** Handles one election message; returns true when it was one. */
  receive(msg, now = this.now()) {
    if (!msg || typeof msg !== "object" || !["hello", "beat", "bye"].includes(msg.action)) return false;
    if (!this.eligible || this.stopped || typeof msg.cid !== "string" || msg.cid === this.self.cid) return true;
    if (msg.action === "bye") this.peers.delete(msg.cid);
    else {
      const known = this.peers.has(msg.cid);
      this.peers.set(msg.cid, { cid: msg.cid, uid: String(msg.uid ?? ""), seen: now });
      // A newcomer's hello is answered so it learns about us within its settle window.
      if (msg.action === "hello" && !msg.reply && !known) this.send({ action: "hello", cid: this.self.cid, uid: this.self.uid, reply: true });
    }
    this.evaluate(now);
    return true;
  }
  /** Heartbeat and expiry. */
  tick(now = this.now()) {
    if (!this.eligible || this.stopped) return;
    this.send({ action: "beat", cid: this.self.cid, uid: this.self.uid });
    for (const [cid, p] of this.peers) if (now - p.seen > this.ttl * 3) this.peers.delete(cid);
    this.evaluate(now);
  }
  /** The leading client id as this client sees it (null while still settling and alone). */
  leader(now = this.now()) {
    if (!this.eligible || this.stopped) return null;
    const list = [...this.peers.values(), { cid: this.self.cid, uid: this.self.uid, seen: now }];
    return electLeader(list, this.activeGM(), now, this.ttl);
  }
  get settled() { return this.startedAt != null && this.now() - this.startedAt >= this.settle; }
  evaluate(now = this.now()) {
    const lead = this.leader(now);
    this.#set(this.settled && lead === this.self.cid, lead);
    return this.leading;
  }
  #set(v, lead = null) {
    if (this.leading === v) return;
    this.leading = v; this.onChange(v, lead);
  }
}

/** Remembers the last `max` request ids; seen(rid) is true for a repeat. */
export class Deduper {
  constructor(max = 200) { this.max = Math.max(1, max); this.ids = new Map(); }
  seen(rid) {
    if (!rid) return false;
    if (this.ids.has(rid)) return true;
    this.ids.set(rid, true);
    while (this.ids.size > this.max) this.ids.delete(this.ids.keys().next().value);
    return false;
  }
}

/** A request id: the sending client's id, a counter and the time. */
export function makeRequestId(cid, n, now = Date.now()) { return `${cid}:${n}:${Math.floor(now).toString(36)}`; }
