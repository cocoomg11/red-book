import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../scripts/check-model.mjs";

const base = () => ({
  id: "s1", name: "Cave", background: "maps/cave.webp", gridType: 1, tokenVision: true, darkness: 0, globalLight: false, lights: 0,
  walls: { count: 30, doors: 2 }, tokens: [], sounds: [], tiles: [], drawings: [], notes: [], playlist: { set: false, paths: [] }, journal: { set: false }, matt: []
});
const npc = (o = {}) => ({ id: "t2", name: "Wolf", img: "w.png", actorExists: true, actorId: "W", actorUuid: "Actor.W", actorType: "npc", pc: false, linked: false, hpMax: 0, cr: 1, ...o });
const keys = (f, o) => C.checkScene(f, o).map(x => x.key);

test("finding keys: rule id for scene-wide, rule:subject for one thing", () => {
  assert.equal(C.findingKey("walls"), "walls");
  assert.equal(C.findingKey("npcStats", "t2", "hp"), "npcStats.hp:t2");
  assert.deepEqual(keys({ ...base(), walls: { count: 0, doors: 0 } }), ["walls"]);
  assert.deepEqual(keys({ ...base(), darkness: 0.9 }), ["lights"]);
  // Two zero-HP NPCs: one key each, by token id.
  assert.deepEqual(keys({ ...base(), tokens: [npc(), npc({ id: "t3", actorId: "W2" })] }, { dnd5e: true }), ["npcStats.hp:t2", "npcStats.hp:t3"]);
  // Background: missing vs broken are different keys.
  assert.deepEqual(keys({ ...base(), background: "" }), ["background"]);
  assert.deepEqual(keys(base(), { paths: { "maps/cave.webp": false } }), ["background.broken"]);
  // Players by user id; tokens by token id.
  assert.deepEqual(keys(base(), { players: [{ id: "U1", name: "Bo", hasCharacter: false }] }), ["players:U1"]);
});
test("finding keys are stable across runs and unique within a scene", () => {
  const f = { ...base(), background: "", darkness: 0.9, walls: { count: 0, doors: 0 }, tokens: [npc({ cr: "" }), npc({ id: "t3", linked: true }), npc({ id: "t4", linked: true })],
    notes: [{ id: "n1", label: "A", entryId: "", img: "" }, { id: "n2", label: "B", entryId: "J", entryExists: false, img: "x.png" }] };
  const opts = { dnd5e: true, paths: { "x.png": false } };
  const a = keys(f, opts), b = keys(f, opts);
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, a.length);
  assert.ok(a.every(k => typeof k === "string" && k.length));
});

test("add, replace and remove ignore entries", () => {
  let s = C.addIgnored(null, "walls", { by: "G1", name: "GM", now: 5 });
  assert.deepEqual(s, { v: C.IGNORED_VERSION, entries: [{ key: "walls", at: 5, by: "G1", name: "GM" }] });
  s = C.addIgnored(s, "npcStats.hp:t2", { by: "G1", name: "GM", now: 6 });
  s = C.addIgnored(s, "walls", { by: "G2", name: "Co-GM", now: 7 });
  assert.deepEqual(s.entries.map(e => `${e.key}@${e.at}/${e.by}`), ["npcStats.hp:t2@6/G1", "walls@7/G2"]);
  s = C.removeIgnored(s, "walls");
  assert.deepEqual(s.entries.map(e => e.key), ["npcStats.hp:t2"]);
  assert.deepEqual(C.removeIgnored(s, "nope").entries.length, 1);
});
test("ignore store: normalised, de-duplicated, capped", () => {
  assert.deepEqual(C.normalizeIgnored(undefined), { v: C.IGNORED_VERSION, entries: [] });
  assert.deepEqual(C.normalizeIgnored({ entries: [null, { key: "" }, { key: 3 }, { key: "a", at: "x" }] }).entries, [{ key: "a", at: 0, by: "", name: "" }]);
  let s = null;
  for (let i = 0; i < C.IGNORED_MAX + 20; i++) s = C.addIgnored(s, `k${i}`, { now: i });
  assert.equal(s.entries.length, C.IGNORED_MAX);
  assert.equal(s.entries[0].key, "k20");
  assert.equal(C.normalizeIgnored({ entries: Array.from({ length: C.IGNORED_MAX + 5 }, (_, i) => ({ key: `k${i}` })) }).entries.length, C.IGNORED_MAX);
});

test("ignored findings don't count; stale entries are kept but not shown", () => {
  const f = { ...base(), walls: { count: 0, doors: 0 }, tokens: [npc(), npc({ id: "t3", actorId: "W2" })] };
  const all = C.checkScene(f, { dnd5e: true });
  assert.deepEqual(C.tally(all), { problem: 0, warning: 3, note: 0 });
  const store = { entries: [{ key: "npcStats.hp:t2", at: 1, by: "G", name: "GM" }, { key: "lights", at: 2 }] };
  const r = C.applyIgnored({ scene: { id: "s1", name: "Cave" }, all }, store);
  assert.deepEqual(r.tally, { problem: 0, warning: 2, note: 0 });
  assert.deepEqual(r.findings.map(x => x.key), ["walls", "npcStats.hp:t3"]);
  assert.deepEqual(r.ignored.map(x => x.key), ["npcStats.hp:t2"]);
  assert.equal(r.ignored[0].ignore.name, "GM");
  assert.equal(r.stored, 2); // "lights" didn't come up but stays saved
  assert.equal(r.all.length, 3);
  // Everything ignored: the scene is all clear.
  const every = C.applyIgnored({ all }, { entries: all.map(x => ({ key: x.key })) });
  assert.equal(C.tallyText(every.tally), "all clear");
  // Re-applying after un-ignore puts it back.
  const back = C.applyIgnored(r, C.removeIgnored(store, "npcStats.hp:t2"));
  assert.equal(back.findings.length, 3); assert.equal(back.ignored.length, 0);
});
test("per-scene clear and clear-all", () => {
  const scenes = [
    { id: "a", flags: { "red-book": { ignoredChecks: { v: 1, entries: [{ key: "walls" }] } } } },
    { id: "b", flags: { "red-book": { ignoredChecks: { v: 1, entries: [] } } } },
    { id: "c", flags: { other: { ignoredChecks: { entries: [{ key: "walls" }] } } } },
    { id: "d", flags: { "red-book": { ignoredChecks: { entries: [{ key: "lights" }, { key: "players:U" }] } } } },
    { id: "e" }
  ];
  assert.deepEqual(C.scenesWithIgnored(scenes), ["a", "d"]);
  // Clearing one scene leaves the others alone.
  scenes[0].flags["red-book"].ignoredChecks = null;
  assert.deepEqual(C.scenesWithIgnored(scenes), ["d"]);
  // A scene's store applies only to that scene's results.
  const all = C.checkScene({ ...base(), walls: { count: 0, doors: 0 } });
  assert.equal(C.applyIgnored({ all }, scenes[3].flags["red-book"].ignoredChecks).findings.length, 1);
});
test("export lists ignored findings separately, marked ignored", () => {
  const all = C.checkScene({ ...base(), walls: { count: 0, doors: 0 }, darkness: 0.9 });
  const r = C.applyIgnored({ all }, { entries: [{ key: "lights", at: Date.UTC(2026, 0, 2), name: "GM" }] });
  const html = C.reportHTML("Cave", r.findings, "now", r.ignored);
  assert.match(html, /1 warning · 1 ignored\./);
  assert.match(html, /<strong>Ignored \(1\)<\/strong><\/p><ul><li><em>ignored<\/em> · <strong>warning<\/strong> · Lights in dark scenes: .*\(by GM, 2026-01-02\)<\/li><\/ul>$/);
  assert.doesNotMatch(C.reportHTML("Cave", all, "now"), /Ignored/);
});

test("gateApi: GM-only scene check API", async () => {
  let denied = 0; let gm = false;
  const calls = [];
  const api = C.gateApi({ run: o => { calls.push(o); return "ran"; }, rules: [1, 2], clearAllIgnored: async () => 3 }, () => gm, () => { denied++; });
  // Non-GM: methods return undefined, data reads as undefined, each access warns, nothing runs.
  assert.equal(api.run({ all: true }), undefined);
  assert.equal(api.rules, undefined);
  assert.equal(api.clearAllIgnored(), undefined);
  assert.equal(denied, 3);
  assert.deepEqual(calls, []);
  // GM: passes through untouched, no notice.
  gm = true;
  assert.equal(api.run({ all: true }), "ran");
  assert.deepEqual(api.rules, [1, 2]);
  assert.equal(await api.clearAllIgnored(), 3);
  assert.equal(denied, 3);
  assert.deepEqual(Object.keys(api), ["run", "rules", "clearAllIgnored"]);
});
