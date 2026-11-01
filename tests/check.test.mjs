import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../scripts/check-model.mjs";

const base = () => ({
  id: "s1", name: "Cave", background: "maps/cave.webp", gridType: 1, tokenVision: true, darkness: 0, globalLight: false, lights: 0,
  walls: { count: 30, doors: 2 }, tokens: [], sounds: [], tiles: [], drawings: [], notes: [], playlist: { set: false, paths: [] }, journal: { set: false }, matt: []
});
const rules = (f, o) => C.checkScene(f, o).map(x => `${x.rule}:${x.severity}`);
const pc = (o = {}) => ({ id: "t1", name: "Ana", img: "a.png", actorExists: true, actorId: "A", pc: true, linked: true, sight: true, ...o });
const npc = (o = {}) => ({ id: "t2", name: "Wolf", img: "w.png", actorExists: true, actorId: "W", actorUuid: "Actor.W", actorType: "npc", pc: false, linked: false, hpMax: 11, cr: 0.25, ...o });

test("clean scene has no findings", () => { assert.deepEqual(rules({ ...base(), tokens: [pc(), npc()] }, { paths: { "maps/cave.webp": true }, dnd5e: true }), []); });
test("background: missing, broken, unchecked", () => {
  assert.deepEqual(rules({ ...base(), background: "" }), ["background:warning"]);
  assert.deepEqual(rules(base(), { paths: { "maps/cave.webp": false } }), ["background:problem"]);
  assert.deepEqual(rules(base(), { paths: { "maps/cave.webp": null } }), ["background:note"]);
});
test("theatre scenes don't need walls or a grid", () => {
  const t = { ...base(), name: "Title backdrop", walls: { count: 0, doors: 0 }, background: "" };
  assert.equal(C.isTheatre(t), true);
  assert.deepEqual(rules(t), ["background:note"]);
  assert.equal(C.isTheatre({ ...base(), gridType: 0 }), true);
  assert.equal(C.isTheatre({ ...base(), tokenVision: false, tokens: [] }), true);
});
test("walls, doors, grid", () => {
  assert.deepEqual(rules({ ...base(), walls: { count: 0, doors: 0 } }), ["walls:warning"]);
  assert.deepEqual(rules({ ...base(), walls: { count: 25, doors: 0 } }), ["doors:note"]);
  assert.deepEqual(rules({ ...base(), walls: { count: 5, doors: 0 } }), []);
});
test("dark scene without lights", () => {
  assert.deepEqual(rules({ ...base(), darkness: 0.8 }), ["lights:warning"]);
  assert.deepEqual(rules({ ...base(), darkness: 0.8, globalLight: true }), []);
  assert.deepEqual(rules({ ...base(), darkness: 0.8, lights: 2 }), []);
});
test("tokens: actor, vision, links, images, NPC stats", () => {
  assert.deepEqual(rules({ ...base(), tokens: [pc({ actorExists: false })] }), ["tokenActor:problem"]);
  assert.deepEqual(rules({ ...base(), tokens: [pc({ sight: false })] }), ["vision:warning"]);
  assert.deepEqual(rules({ ...base(), tokenVision: false, tokens: [pc({ sight: false })] }), []);
  assert.deepEqual(rules({ ...base(), tokens: [pc({ linked: false })] }), ["tokenLink:warning"]);
  assert.deepEqual(rules({ ...base(), tokens: [npc({ linked: true, id: "a" }), npc({ linked: true, id: "b" })] }), ["tokenLink:warning"]);
  assert.deepEqual(rules({ ...base(), tokens: [npc()] }, { paths: { "w.png": false } }), ["tokenImage:problem"]);
  assert.deepEqual(rules({ ...base(), tokens: [npc({ hpMax: 0, cr: null })] }, { dnd5e: true }), ["npcStats:warning", "npcStats:note"]);
  assert.deepEqual(rules({ ...base(), tokens: [npc({ hpMax: 0 })] }, { dnd5e: false }), []);
});
test("sounds and playlists", () => {
  const f = { ...base(), sounds: [{ id: "x", path: "" }, { id: "y", path: "a.ogg" }], playlist: { set: true, exists: false, soundSet: false, paths: [{ playlistId: "p", playlist: "P", name: "Song", path: "s.ogg" }] } };
  assert.deepEqual(rules(f, { paths: { "a.ogg": false, "s.ogg": false } }), ["sounds:problem", "sounds:problem", "sounds:problem", "sounds:warning"]);
});
test("tile, drawing and note images; note links", () => {
  const f = { ...base(), tiles: [{ id: "t", img: "t.png" }], drawings: [{ id: "d", img: "d.png" }], notes: [{ id: "n", img: "n.svg", label: "Inn", entryId: "j", entryExists: false }, { id: "m", entryId: "", label: "" }, { id: "o", entryId: "j2", entryExists: true, pageId: "p", pageExists: false }] };
  assert.deepEqual(rules(f, { paths: { "t.png": false, "d.png": false, "n.svg": false } }), ["images:problem", "images:problem", "notes:problem", "notes:problem", "images:warning", "notes:note"]);
});
test("active tiles only when the module is active", () => {
  const f = { ...base(), matt: [{ index: 0, action: "teleport", uuid: "Scene.abcdefghijklmnop", tileId: "t", exists: false }] };
  assert.deepEqual(rules(f, { matt: true }), ["activeTiles:problem"]); assert.deepEqual(rules(f, { matt: false }), []);
});
test("scene journal and players", () => {
  assert.deepEqual(rules({ ...base(), journal: { set: true, exists: false } }), ["sceneJournal:problem"]);
  assert.deepEqual(rules({ ...base(), journal: { set: true, exists: true, pageSet: true, pageExists: false } }), ["sceneJournal:problem"]);
  assert.deepEqual(rules(base(), { players: [{ id: "u", name: "Bo", hasCharacter: false }, { id: "v", name: "Cy", hasCharacter: true }] }), ["players:warning"]);
});
test("rules can be turned off", () => {
  assert.deepEqual(rules({ ...base(), walls: { count: 0 }, darkness: 1 }, { off: ["walls", "lights"] }), []);
});
test("Monk's Active Tiles refs are read defensively", () => {
  const refs = C.mattRefs([{ action: "openjournal", data: { entity: { id: "JournalEntry.abcdefghijklmnop", name: "x" } } }, null, "junk", { action: "a", data: { list: ["Actor.ABCDEFGHIJKLMNOP", "not a uuid", "Actor.ABCDEFGHIJKLMNOP"] } }]);
  assert.deepEqual(refs, [{ index: 0, action: "openjournal", uuid: "JournalEntry.abcdefghijklmnop" }, { index: 3, action: "a", uuid: "Actor.ABCDEFGHIJKLMNOP" }]);
  assert.deepEqual(C.mattRefs(undefined), []); assert.deepEqual(C.mattRefs({}), []);
});
test("paths: collected once, checkable filter", () => {
  const f = { ...base(), tokens: [pc({ img: "maps/cave.webp" })], tiles: [{ img: "data:image/png;base64,xx" }, { img: "t.png" }] };
  assert.deepEqual(C.scenePaths(f), ["maps/cave.webp", "t.png"]);
  assert.equal(C.checkable("icons/a.svg"), true); assert.equal(C.checkable("tokens/*.png"), false);
  assert.equal(C.checkable("https://other.site/a.png", "https://me.host"), false); assert.equal(C.checkable("https://me.host/a.png", "https://me.host"), true);
});
test("tally and report", () => {
  const f = C.checkScene({ ...base(), walls: { count: 0 }, darkness: 1 });
  assert.deepEqual(C.tally(f), { problem: 0, warning: 2, note: 0 }); assert.equal(C.tallyText(C.tally([])), "all clear");
  assert.match(C.reportHTML("<Cave>", f, "now"), /&lt;Cave&gt;.*2 warnings/);
});

test("path cache: cached, de-duplicated in flight, concurrency-limited, timed out", async () => {
  let running = 0, peak = 0; const calls = [];
  const probe = async p => { calls.push(p); running++; peak = Math.max(peak, running); await new Promise(r => setTimeout(r, 5)); running--; if (p === "boom") throw new Error("x"); if (p === "slow") await new Promise(r => setTimeout(r, 200)); return p !== "missing"; };
  const c = new C.PathCache({ probe, concurrency: 2, timeout: 50 });
  const r = await c.checkAll(["a", "b", "missing", "a", "boom", "slow"]);
  assert.deepEqual(r, { a: true, b: true, missing: false, boom: null, slow: null });
  assert.ok(peak <= 2);
  assert.equal(calls.filter(x => x === "a").length, 1);
  await c.checkAll(["a", "missing"]); assert.equal(calls.filter(x => x === "a").length, 1);
  await c.check("slow"); assert.equal(calls.filter(x => x === "slow").length, 2, "timeouts aren't cached");
});
test("path cache: entries expire and the cache is capped", async () => {
  let t = 0; let n = 0;
  const c = new C.PathCache({ probe: async () => (n++, true), ttl: 100, max: 2, now: () => t });
  await c.check("a"); t = 50; await c.check("a"); assert.equal(n, 1);
  t = 200; await c.check("a"); assert.equal(n, 2);
  await c.check("b"); await c.check("c"); assert.equal(c.cache.size, 2);
});
