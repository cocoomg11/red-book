import { test } from "node:test";
import assert from "node:assert/strict";
import { readRequest, makeRequest, makeRequestId } from "../vendor/wanderers-core/index.mjs";
import { REQUESTS } from "../scripts/requests.mjs";
import * as SM from "../scripts/session-model.mjs";
import * as C from "../scripts/check-model.mjs";
import * as St from "../scripts/store-model.mjs";
import * as O from "../scripts/online-model.mjs";
import * as Mg from "../scripts/migrate-model.mjs";
import * as Sc from "../scripts/start-model.mjs";
import * as K from "../scripts/cleanup-model.mjs";
import { SETTINGS, tabRows, TABS } from "../scripts/settings-model.mjs";
import { FEATURES } from "../scripts/features.mjs";

const rid = makeRequestId("abcd1234", 1, 1000);
const req = (kind, data) => readRequest(REQUESTS, { action: "request", kind, rid, data });

// ---------------------------------------------------------------- security: requests
test("requests: rest and journal are schema-checked; no payload user field is accepted", () => {
  assert.equal(req("rest", { uuid: "Actor.abcdefghijklmnop", long: true }).ok, true);
  assert.equal(req("rest", { uuid: "Actor.x", long: true, userId: "gm" }).ok, false, "userId in the payload is refused");
  assert.equal(req("rest", { uuid: "<script>", long: true }).ok, false);
  assert.equal(req("rest", { uuid: "Actor.x" }).ok, false, "long is required");
  assert.equal(req("journal", { uuid: "JournalEntry.abc", force: false, users: 3 }).ok, true);
  assert.equal(req("journal", { uuid: "JournalEntry.abc", force: false, users: -1 }).ok, false);
  assert.equal(req("journal", { uuid: "JournalEntry.abc", force: "yes", users: 1 }).ok, false);
  assert.equal(req("nope", {}).ok, false, "unknown kinds are refused");
  assert.equal(req("toString", {}).ok, false);
});
test("requests: GM-only kinds are marked from: gm; player kinds are not", () => {
  for (const k of ["start", "end", "note", "log"]) assert.equal(REQUESTS[k].from, "gm", k);
  for (const k of ["rest", "journal"]) assert.notEqual(REQUESTS[k].from, "gm", k);
});
test("requests: note and log payloads", () => {
  assert.equal(req("note", { text: "hi", thread: true, private: false }).ok, true);
  assert.equal(req("note", { text: "" }).ok, false);
  assert.equal(req("note", { text: "x".repeat(2001) }).ok, false);
  assert.equal(req("log", { type: "quest", text: "Done", refs: ["Actor.a"], private: true }).ok, true);
  assert.equal(req("log", { type: "quest", text: "Done", opts: {} }).ok, false, "the old opts wrapper is gone");
  assert.equal(req("log", { type: "a b", text: "x" }).ok, false);
  assert.doesNotThrow(() => makeRequest(REQUESTS, "start", rid, {}));
  assert.throws(() => makeRequest(REQUESTS, "start", rid, { by: "me" }));
});

// ---------------------------------------------------------------- security: hook payloads carry ids only
test("eventLogged payload carries ids only, never the text or refs", () => {
  const ev = SM.makeEvent({ type: "note", text: "The king is the traitor", private: true, thread: true, refs: ["Actor.k"], data: { by: "GM" } });
  const p = SM.eventHookPayload("sess1", ev);
  assert.deepEqual(Object.keys(p).sort(), ["event", "session"]);
  assert.deepEqual(Object.keys(p.event).sort(), ["id", "t", "type", "wt"]);
  const json = JSON.stringify(p);
  for (const leak of ["king", "traitor", "Actor.k", "GM", "private", "thread"]) assert.ok(!json.includes(leak), leak);
  assert.equal(p.event.id, ev.id);
});

// ---------------------------------------------------------------- GM-only API gate
test("GM-only gate: players get undefined from every member and a notice", () => {
  let warned = 0; let gm = false;
  const api = C.gateApi({ list: () => [1], current: () => ({ a: 1 }), data: [1] }, () => gm, () => warned++);
  assert.equal(api.list(), undefined); assert.equal(api.current(), undefined); assert.equal(api.data, undefined);
  assert.equal(warned, 3);
  gm = true; assert.deepEqual(api.list(), [1]); assert.deepEqual(api.data, [1]);
});

// ---------------------------------------------------------------- bug C: toolkit map pins
test("scene check skips the toolkit's map pins", () => {
  assert.equal(C.isToolkitPin({ flags: { "wayfarers-toolkit": { pin: { v: 1, kind: "camp" } } } }), true);
  assert.equal(C.isToolkitPin({ _source: { flags: { "wayfarers-toolkit": { pin: { v: 1 } } } } }), true);
  assert.equal(C.isToolkitPin({ flags: { "wayfarers-toolkit": { other: 1 } } }), false);
  assert.equal(C.isToolkitPin({ flags: {} }), false);
  assert.equal(C.isToolkitPin(null), false);
});

// ---------------------------------------------------------------- GM-only store and the pin move
test("store: versioned, empty for junk, pins capped", () => {
  assert.deepEqual(St.normalizeStore(null), { v: 1, pins: { v: 1, pins: [] }, migrated: {} });
  assert.deepEqual(St.normalizeStore({ v: 99, pins: [] }).pins.pins, [], "a newer shape isn't trusted");
  const many = Array.from({ length: 80 }, (_, i) => ({ uuid: `Actor.a${i}` }));
  assert.equal(St.normalizeStore({ v: 1, pins: { pins: many } }).pins.pins.length, 50);
  assert.deepEqual(St.normalizeStore({ pins: { pins: [{ uuid: "Actor.x" }] }, migrated: { boardPins: "5", bad: "x" } }).migrated, { boardPins: 5 });
});
test("pin move: once, merged, setting cleared", () => {
  const setting = { v: 1, pins: [{ uuid: "Actor.a", name: "A" }, { uuid: "Scene.s", name: "S" }] };
  const r = St.migratePins(null, setting, 1000);
  assert.deepEqual(r.store.pins.pins.map(p => p.uuid), ["Actor.a", "Scene.s"]);
  assert.equal(r.store.migrated.boardPins, 1000); assert.equal(r.clearSetting, true); assert.equal(r.moved, 2);
  const again = St.migratePins(r.store, setting, 2000);
  assert.equal(again.store, null, "never runs twice"); assert.equal(again.clearSetting, true, "a leftover setting is still cleared");
  const merged = St.migratePins({ v: 1, pins: { pins: [{ uuid: "Actor.a" }, { uuid: "Item.i" }] } }, setting, 3);
  assert.deepEqual(merged.store.pins.pins.map(p => p.uuid), ["Actor.a", "Item.i", "Scene.s"]); assert.equal(merged.moved, 1);
  const none = St.migratePins(null, { v: 1, pins: [] }, 4);
  assert.equal(none.clearSetting, false); assert.equal(none.store.migrated.boardPins, 4);
});
test("cleanup finds the GM-only store journal", () => {
  const p = K.plan({ journals: [{ id: "d", name: St.STORE_NAME, flags: { "red-book": { store: { v: 1 } } } }] });
  assert.deepEqual(p.store.map(x => x.id), ["d"]); assert.deepEqual(p.flags, []);
  assert.ok(K.CATEGORIES.some(c => c[0] === "store"));
  assert.deepEqual(K.emptyFolders({ ...p, folders: [{ id: "f" }] }, { store: true }, { f: ["d"] }).map(f => f.id), ["f"]);
});

// ---------------------------------------------------------------- Who's online (ported model)
const U = (id, o = {}) => ({ id, name: id, color: "#f00", active: false, isGM: false, character: null, ...o });
test("who's online: who counts and everyone's here", () => {
  const users = [U("gm", { isGM: true, active: true }), U("ann", { active: true, character: { name: "Ari", img: "a.png" } }), U("bob", { character: { name: "Bo" } }), U("cy", { active: true })];
  const r = O.roster(users, { count: "characters" });
  assert.equal(r.expected, 2); assert.equal(r.present, 1); assert.equal(r.all, false); assert.deepEqual(r.missing, ["bob"]);
  assert.equal(O.roster(users, { count: "players" }).expected, 3);
  const l = O.roster(users, { count: "list", list: "Ann, cy; nobody" });
  assert.equal(l.all, true); assert.deepEqual(l.unknown, ["nobody"]);
  assert.equal(O.roster([U("gm", { isGM: true, active: true })], { count: "players" }).all, false, "no players: never everyone");
});
test("who's online: hook payload matches the toolkit's", () => {
  const r = O.roster([U("ann", { active: true })], { count: "players" });
  assert.deepEqual(O.hookPayload(r), { online: 1, expected: 1, all: true, missing: [], users: [{ id: "ann", name: "ann", label: "ann", active: true, counts: true }] });
});
test("who's online: changes and hook names (new names always, old names unless the toolkit provides them)", () => {
  const a = O.roster([U("ann", { active: true }), U("bob")], { count: "players" });
  const b = O.roster([U("ann", { active: true }), U("bob", { active: true })], { count: "players" });
  assert.deepEqual(O.changes(null, a), { countChanged: true, becameAll: false, leftAll: false });
  const ch = O.changes(a, b); assert.equal(ch.becameAll, true);
  assert.deepEqual(O.hookNames(ch), ["red-book.playerCountChanged", "wayfarers-toolkit.playerCountChanged", "red-book.allPlayersOnline", "wayfarers-toolkit.allPlayersOnline"]);
  assert.deepEqual(O.hookNames(ch, { toolkitProvides: true }), ["red-book.playerCountChanged", "red-book.allPlayersOnline"]);
  assert.deepEqual(O.hookNames(ch, { legacy: false }), ["red-book.playerCountChanged", "red-book.allPlayersOnline"]);
  assert.deepEqual(O.hookNames(O.changes(b, b)), []);
});
test("who's online: panel placement stays on screen and clear of the scene navigation", () => {
  const view = { width: 1129, height: 1267 }, size = { width: 180, height: 120 };
  const ui = { controls: { left: 16, top: 16, right: 88, bottom: 1038 }, nav: { left: 104, top: 16, right: 304, bottom: 1251 } };
  assert.deepEqual(O.anchorPos("top-left", view, size, ui), { left: 312, top: 12 });
  assert.deepEqual(O.placePanel({ saved: { left: 5000, top: -40 } }, view, size, ui), { left: 941, top: 8 });
  assert.deepEqual(O.placePanel({ saved: { left: 500, top: 400 }, drag: false }, view, size, ui), { left: 312, top: 12 }, "drag off: saved spot ignored");
  assert.equal(O.savedPos({}), null);
});

// ---------------------------------------------------------------- Session Start
test("session start: hidden scenes pattern, sorted list, broken pattern hides nothing", () => {
  const scenes = [{ id: "1", name: "Town" }, { id: "2", name: "Test map" }, { id: "3", name: "Cave" }, { id: "4", name: "NPC Gallery" }];
  assert.deepEqual(Sc.sceneChoices(scenes, "^(Test map|NPC Gallery)$").map(s => s.name), ["Cave", "Town"]);
  assert.equal(Sc.sceneChoices(scenes, "(").length, 4);
  assert.equal(Sc.sceneChoices(scenes, "").length, 4);
});

// ---------------------------------------------------------------- migration from the toolkit
test("toolkit carry-over: stored values only, ours win, bad values skipped, Hub flags", () => {
  const p = Mg.planToolkitMigration({
    toolkit: { onlineCount: JSON.stringify("list"), onlineList: JSON.stringify("Ann, Bob"), onlinePosition: JSON.stringify("sideways"), onlineDrag: "false", hiddenScenes: undefined },
    ours: { onlineList: true },
    scenes: [{ id: "a", toolkitHub: true }, { id: "b", toolkitHub: true, hub: false }, { id: "c", toolkitHub: false }]
  });
  assert.deepEqual(p.settings, { onlineCount: "list", onlineDrag: false });
  assert.deepEqual(p.skipped, ["onlinePosition"]);
  assert.deepEqual(p.scenes, ["a"], "a scene already set in Red Book keeps its value");
  assert.deepEqual(Mg.planToolkitMigration({}), { settings: {}, scenes: [], skipped: [] });
  assert.equal(Mg.readStored("{bad"), undefined);
});
test("toolkit carry-over: the run-once record and the client position", () => {
  assert.deepEqual(Mg.normalizeMigrations(null), { v: 1 });
  assert.deepEqual(Mg.normalizeMigrations({ v: 1, toolkit: 5 }), { v: 1, toolkit: 5 });
  assert.deepEqual(Mg.clientCarry(JSON.stringify({ left: 10, top: 20 }), undefined), { left: 10, top: 20 });
  assert.equal(Mg.clientCarry(JSON.stringify({ left: 10, top: 20 }), JSON.stringify({ left: 1, top: 1 })), null);
  assert.equal(Mg.clientCarry(JSON.stringify({}), null), null);
  for (const { key } of Object.values(Mg.SETTING_MAP)) assert.ok(SETTINGS.some(s => s.key === key), key);
});

// ---------------------------------------------------------------- settings for the new tools
test("settings: new tabs and rows; the drag position is per browser", () => {
  for (const id of ["start", "online"]) assert.ok(TABS.some(t => t.id === id));
  assert.ok(FEATURES.some(f => f.id === "sessionStart") && FEATURES.some(f => f.id === "whosOnline"));
  assert.deepEqual(tabRows("online").basic.map(s => s.key), ["onlineCount"]);
  assert.ok(tabRows("online").advanced.some(s => s.key === "onlineLegacyHooks"));
  const pos = SETTINGS.find(s => s.key === "onlineHudPos"); assert.equal(pos.client, true); assert.equal(pos.hidden, true);
  assert.equal(SETTINGS.find(s => s.key === "onlineCount").type, "choice");
});
