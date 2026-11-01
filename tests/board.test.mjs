import { test } from "node:test";
import assert from "node:assert/strict";
import * as B from "../scripts/board-model.mjs";

test("UUID extraction from links, shortcuts and anchors", () => {
  const t = `See @UUID[Actor.aaa]{Tom} and @UUID[JournalEntry.j1.JournalEntryPage.p1#sec] @Scene[s1] @Actor[Actor.aaa] <a data-uuid="Item.i1">x</a>`;
  assert.deepEqual(B.extractUuids(t), ["Actor.aaa", "JournalEntry.j1.JournalEntryPage.p1", "Scene.s1", "Item.i1"]);
  assert.deepEqual(B.extractUuids(null), []);
});
test("uuid types", () => {
  assert.equal(B.uuidType("Scene.x.Token.y"), "Token"); assert.equal(B.uuidType("Compendium.a.b.Actor.id"), "Actor");
  assert.equal(B.uuidType("Actor.x"), "Actor"); assert.equal(B.uuidType("bad"), null);
});
test("active quests with next objectives and links", () => {
  const qs = B.activeQuests([
    { id: "q1", name: "Lost", status: "active", sort: 2, giver: { uuid: "Actor.g" }, description: "Go to @UUID[Scene.s]", objectives: [{ text: "A", done: true }, { text: "B @UUID[Actor.n]" }, { text: "C", optional: true }, { text: "H", hidden: true }, { text: "D" }] },
    { id: "q0", name: "First", status: "active", sort: 1 }, { id: "q2", name: "Done", status: "completed" }
  ], { nextCount: 2 });
  assert.deepEqual(qs.map(q => q.name), ["First", "Lost"]);
  assert.deepEqual(qs[1].next, ["B @UUID[Actor.n]", "C (optional)"]); assert.equal(qs[1].more, 1);
  assert.deepEqual(qs[1].links, ["Actor.g", "Scene.s", "Actor.n"]); assert.equal(qs[1].uuid, "JournalEntry.q1");
  const g = B.groupLinks(qs);
  assert.deepEqual(g.actors.map(e => e.uuid), ["Actor.g", "Actor.n"]); assert.deepEqual(g.scenes[0].from, ["Lost"]);
});
test("pins: versioned, deduped, newest first, capped, typed", () => {
  assert.deepEqual(B.normalizePins(["Actor.a", "Actor.a"]).pins.length, 1);
  let s = B.normalizePins(null);
  s = B.addPin(s, { uuid: "Actor.a", name: "A", at: 1 }); s = B.addPin(s, { uuid: "Scene.b", at: 2 }); s = B.addPin(s, { uuid: "Actor.a", at: 3 });
  assert.deepEqual(s.pins.map(p => p.uuid), ["Actor.a", "Scene.b"]); assert.equal(s.v, B.PINS_VERSION);
  assert.equal(B.addPin(s, { uuid: "Scene.x.Token.t" }).added, false);
  assert.equal(B.addPin(s, {}).why, "no document");
  let big = B.normalizePins([]); for (let i = 0; i < 60; i++) big = B.addPin(big, { uuid: `Actor.a${i}` });
  assert.equal(big.pins.length, B.PINS_MAX); assert.equal(big.pins[0].uuid, "Actor.a59");
  assert.equal(B.normalizePins({ pins: Array.from({ length: 80 }, (_, i) => `Item.i${i}`) }).pins.length, B.PINS_MAX);
  assert.deepEqual(B.removePin(s, "Actor.a").pins.map(p => p.uuid), ["Scene.b"]);
});
