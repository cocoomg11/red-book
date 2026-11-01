/**
 * One client records and writes. Every hook that writes on its own (the session timeline, NPCs met, the load-time prompt) runs only
 * on the leader: the active GM user's earliest-started client (see leader-model.mjs). Buttons a GM clicks run on that GM's client;
 * things that must be recorded by the leader (a quick note typed in another tab, a rest finished on a player's client) are sent to
 * it over the socket with a request id, and the leader skips ids it has handled before.
 */
import * as M from "./leader-model.mjs";
import { ID, SOCKET, HOOKS } from "./const.mjs";
import { log } from "./log.mjs";

export function activeGM() {
  try { return M.pickActiveGM(game.users?.contents ?? [...(game.users ?? [])], game.users?.activeGM ?? null); } catch { return null; }
}

const S = { self: null, peers: [], lastPing: null, prevPing: null, started: false, settled: false, leader: null, leaderFor: null, settle: null, timer: null };
const leaderFns = [];
const handlers = new Map();
const seen = M.seenCache();
let reqN = 0;

const cutoff = () => M.aliveCutoff(S.prevPing);
const emit = op => { try { game.socket.emit(SOCKET, { action: "leader", op, sid: S.self.id, since: S.self.since }); } catch { } };

function recompute() {
  if (!S.started) return;
  S.peers = M.prune(S.peers, cutoff());
  const was = S.leader; const gm = activeGM();
  S.leaderFor = gm?.id ?? null;
  S.leader = gm ? M.leaderOf(S.peers, { gmUserId: gm.id, cutoff: cutoff(), self: S.self }) : null;
  if (was === S.leader) return;
  log(`leader: ${S.leader ?? "none"}${S.leader === S.self.id ? " (this client)" : ""}`);
  if (S.settled) changed();
}
function changed() {
  const me = S.leader === S.self?.id;
  Hooks.callAll(HOOKS.leaderChanged, { leader: me });
  if (me) for (const fn of leaderFns) { try { fn(); } catch (e) { console.warn(`${ID} | leader change`, e); } }
}
function ping() { S.prevPing = S.lastPing; S.lastPing = Date.now(); emit("ping"); recompute(); }

function onMessage(msg, senderId) {
  if (!msg || typeof msg !== "object") return;
  if (msg.action === "leader") {
    if (!S.started) return;
    const m = M.readSessionMessage(msg); if (!m || m.sid === S.self.id) return;
    const sender = game.users.get(senderId); if (!sender?.isGM) return;
    S.peers = M.applySessionMessage(S.peers, m, sender.id, Date.now());
    if (m.op === "ping") emit("here");
    recompute();
    return;
  }
  if (msg.action === "request") {
    if (!isLeader() || !handlers.has(msg.kind)) return;
    if (!seen.firstTime(M.requestId(msg))) return log("duplicate request skipped", msg.rid);
    const user = game.users.get(senderId); if (!user) return;
    Promise.resolve().then(() => handlers.get(msg.kind)(msg.data ?? {}, user)).catch(e => console.warn(`${ID} | request ${msg.kind}`, e));
    return;
  }
  if (msg.action === "hook" && typeof msg.name === "string" && Object.values(HOOKS).includes(msg.name)) Hooks.callAll(msg.name, msg.payload ?? {});
}

/** Ready hook, every client: the socket listener; GM clients also take a session id and start pinging. */
export function start() {
  if (S.started) return;
  game.socket.on(SOCKET, onMessage);
  if (!game.user?.isGM) return;
  S.self = { id: M.newId(), userId: game.user.id, since: Date.now() };
  S.started = true;
  S.settle = new Promise(res => setTimeout(() => { S.settled = true; S.leader = undefined; recompute(); res(); }, M.SETTLE_MS));
  ping();
  S.timer = setInterval(ping, M.HEARTBEAT_MS);
  globalThis.addEventListener?.("pagehide", () => { for (const fn of byeFns) { try { fn(); } catch { } } emit("bye"); });
  Hooks.on("userConnected", user => { if (user?.isGM) setTimeout(recompute, 0); });
}
const byeFns = [];
/** Runs `fn` when this tab is closing (best effort: flush pending writes). */
export function onBye(fn) { byeFns.push(fn); }

export function settled() { return S.started && !S.settled ? S.settle : Promise.resolve(); }
/** Runs `fn` on the client that becomes the leader (after load settles, or on hand-over). */
export function onLeader(fn) { if (typeof fn === "function") leaderFns.push(fn); }

/** True on the one client that records and writes. */
export function isLeader() {
  const gm = activeGM(); if (!gm || gm.id !== game.user?.id) return false;
  if (!S.started) return true;
  if (!S.settled) return false;
  if (S.leaderFor !== gm.id) recompute();
  return S.leader === S.self.id;
}

export function info() {
  if (!S.started) return { started: false, leader: isLeader(), sessions: 0 };
  const mine = M.prune(S.peers, cutoff()).filter(p => p.userId === S.self.userId);
  return { started: true, self: S.self.id, sessions: mine.length + 1, leader: S.leader === S.self.id, settled: S.settled };
}

/** Registers the leader's handler for one request kind. `fn(data, user)`; check the user's rights inside. */
export function handle(kind, fn) { handlers.set(kind, fn); }

/**
 * Has the leader run request `kind`: here when this client leads, else over the socket with a fresh request id. The handler gets the
 * sending user (Foundry's sender, not the message's word). Returns false when no GM is connected.
 */
export function request(kind, data = {}) {
  const rid = `${S.self?.id ?? game.user.id.padEnd(4, "x")}-${++reqN}-${Date.now().toString(36)}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  if (isLeader()) { seen.firstTime(rid); const h = handlers.get(kind); if (h) Promise.resolve().then(() => h(data, game.user)).catch(e => console.warn(`${ID} | ${kind}`, e)); return true; }
  if (!activeGM()) return false;
  try { game.socket.emit(SOCKET, { action: "request", kind, rid, data }); } catch { return false; }
  return true;
}

/** Fires one of our hooks here and on every other client. */
export function broadcastHook(name, payload) {
  Hooks.callAll(name, payload);
  try { game.socket.emit(SOCKET, { action: "hook", name, payload }); } catch { }
}
