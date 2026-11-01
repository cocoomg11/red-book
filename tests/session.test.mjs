import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "../scripts/session-model.mjs";

const ev = (o) => M.makeEvent(o, 1000);
test("events: unknown types become notes; text capped", () => {
  assert.equal(ev({ type: "nope" }).type, "note");
  assert.equal(ev({ type: "scene", text: "x".repeat(3000) }).text.length, 2000);
});
test("normalize reads v0 (no v) and caps met", () => {
  const s = M.normalizeSession({ n: 3, name: "S", events: [{ type: "scene", text: "a" }, null], met: Array.from({ length: 600 }, (_, i) => `n${i}`) });
  assert.equal(s.v, M.SESSION_VERSION); assert.equal(s.events.length, 1); assert.equal(s.open, true); assert.equal(s.met.length, M.MET_MAX);
  assert.equal(M.normalizeSession({ endedAt: 5 }).open, false);
});
test("event cap drops the oldest non-notes first and counts them", () => {
  let s = M.normalizeSession({});
  s = M.addEvent(s, ev({ type: "note", text: "keep" }), 3);
  for (let i = 0; i < 5; i++) s = M.addEvent(s, ev({ type: "scene", text: `s${i}` }), 3);
  assert.equal(s.events.length, 3);
  assert.equal(s.events[0].text, "keep"); assert.equal(s.events.at(-1).text, "s4"); assert.equal(s.dropped, 3);
});
test("names and numbers", () => {
  assert.equal(M.nextNumber([{ n: 2 }, { n: 7 }]), 8); assert.equal(M.nextNumber([]), 1);
  assert.match(M.sessionName(4, Date.UTC(2026, 0, 2, 12)), /^Session 4 — 2026-01-0[12]$/);
  assert.equal(M.recapName("Session 1"), "Recap: Session 1");
});
test("quick notes: ? opens a thread; #private hides it", () => {
  assert.deepEqual(M.parseNote("? Who sent the letter"), { text: "Who sent the letter", thread: true, private: false });
  assert.deepEqual(M.parseNote("bribe noted #private"), { text: "bribe noted", thread: false, private: true });
  assert.equal(M.parseNote("plain").thread, false);
});
test("inventory diff and text", () => {
  const a = M.snapshot({ items: [{ id: "1", name: "Rope", qty: 1 }, { id: "2", name: "Torch", qty: 5 }], currency: { gp: 10, sp: 3 } });
  const b = M.snapshot({ items: [{ id: "2", name: "Torch", qty: 3 }, { id: "3", name: "Potion", qty: 2 }], currency: { gp: 15, sp: 3 } });
  const d = M.diffInventory(a, b);
  assert.deepEqual(d.gained, [{ name: "Potion", qty: 2 }]);
  assert.deepEqual(d.lost, [{ name: "Rope", qty: 1 }, { name: "Torch", qty: 2 }]);
  assert.deepEqual(d.coin, { gp: 5 });
  assert.equal(M.inventoryText("Ana", d), "Ana: gained Potion ×2; lost Rope, Torch ×2; coin +5 gp.");
  assert.equal(M.inventoryText("Ana", M.diffInventory(a, a)), "");
});
test("coalescing: a burst is one flush after it goes quiet, or after the max", () => {
  const c = new M.Coalescer({ quiet: 100, max: 1000 });
  c.touch("a", 0); c.touch("a", 50); c.touch("b", 60);
  assert.deepEqual(c.due(120), []);
  assert.deepEqual(c.due(151), ["a"]);
  c.touch("b", 150); for (let t = 200; t < 1100; t += 50) c.touch("b", t);
  assert.deepEqual(c.due(1061), ["b"]);
  c.touch("z", 5); assert.deepEqual(c.all(), ["z"]); assert.equal(c.size, 0);
});
test("world time adds up until the minimum", () => {
  const t = new M.TimeTotal();
  t.add(6, 106); t.add(6, 112); assert.equal(t.take(600), null);
  t.add(600, 712); assert.deepEqual(t.take(600), { seconds: 612, from: 100 }); assert.equal(t.take(1), null);
  assert.equal(M.durationText(3 * 86400 + 4 * 3600 + 60), "3 days 4 hours");
  assert.equal(M.durationText(45 * 60), "45 minutes"); assert.equal(M.durationText(-3600), "rewound 1 hour");
});
test("hit points, levels, combat end", () => {
  const set = new Set();
  assert.equal(M.hpTransition(set, "a", 0), "down"); assert.equal(M.hpTransition(set, "a", -2), null);
  assert.equal(M.hpTransition(set, "a", 4), "up"); assert.equal(M.hpTransition(set, "a", 4), null); assert.equal(M.hpTransition(set, "a", "x"), null);
  assert.equal(M.levelText("Ana", 3, 4), "Ana reached level 4."); assert.equal(M.levelText("Ana", undefined, 4), ""); assert.equal(M.levelText("Ana", 4, 4), "");
  assert.equal(M.combatEndText({ round: 3, combatants: ["A", "B"], defeated: ["B"] }), "Combat ended after 3 rounds. Combatants: A, B. Defeated: B.");
});
test("NPCs met are deduped per session", () => {
  const r1 = M.meet([], [{ key: "x", name: "Guard" }, { key: "x", name: "Guard" }, { key: "y", name: "Smith" }]);
  assert.equal(r1.fresh.length, 2); assert.deepEqual(r1.met, ["x", "y"]);
  assert.equal(M.meet(r1.met, [{ key: "y" }]).fresh.length, 0);
  assert.equal(M.metText(["A", "B", "C"]), "Met A, B and C."); assert.equal(M.metText(["A"]), "Met A.");
});
test("toolkit quests, travel log and loot rolls", () => {
  const b = M.questState("Q", { status: "available", objectives: [{ id: "o1", text: "Find it" }] });
  const a = M.questState("Q", { status: "active", objectives: [{ id: "o1", text: "Find it", done: true }] });
  assert.deepEqual(M.diffQuest(b, a).map(e => e.text), ["Quest given: Q.", "Objective done: Q: Find it."]);
  const c = M.questState("Q", { status: "completed", objectives: [{ id: "o1", text: "Find it", done: true }] });
  assert.deepEqual(M.diffQuest(a, c).map(e => e.type), ["quest"]);
  const add = M.travelLogAdditions("<p>old</p>", "<p>old</p><p><strong>Flight.</strong> A → B, 2 h.</p><p><strong>Session started</strong> at x.</p><p><strong>Trip 3.</strong> Forest: 2 hexes.</p>");
  assert.deepEqual(add.map(e => e.data.kind), ["flight", "travel"]);
  assert.equal(M.travelLogAdditions("<p>a</p>", "<p>changed</p>").length, 0);
  assert.equal(M.lootRollEvent({ status: "open" }), null);
  assert.equal(M.lootRollEvent({ status: "done", name: "Sword", result: "<strong>Ana</strong> wins Sword (Need)." }).text, "Loot roll for Sword: Ana wins Sword (Need).");
});
test("summary and timeline rendering", () => {
  let s = M.normalizeSession({ n: 1, name: "Session 1 — 2026-01-01", startedAt: 1, endedAt: 3600001, startWorld: 0, endWorld: 7200 });
  s = M.addEvent(s, ev({ type: "scene", text: "Scene activated: Inn.", rtText: "19:00", wtText: "Day 1", refs: ["Scene.abc"] }));
  s = M.addEvent(s, ev({ type: "death", text: "Wolf was killed." }));
  s = M.addEvent(s, ev({ type: "note", text: "Who is the stranger", thread: true }));
  s = M.addEvent(s, ev({ type: "note", text: "Secret twist", private: true, thread: true }));
  s.open = false; s.summary = M.summarize(s);
  assert.deepEqual(s.summary.counts, { scene: 1, death: 1, note: 2 });
  assert.deepEqual(s.summary.notable, ["Wolf was killed."]);
  assert.equal(s.summary.threads.length, 2);
  const html = M.pageHTML(s);
  assert.match(html, /<h2>Summary<\/h2>/); assert.match(html, /Played 1 hour, in-world 2 hours/);
  assert.match(html, /<span class="rb-when">19:00 · Day 1<\/span> Scene activated: Inn\. @UUID\[Scene\.abc\]/);
  assert.match(html, /<section class="secret" id="secret-rb-[^"]+"><p>.*Secret twist/);
  assert.match(html, /\[thread\]/);
  assert.equal(M.openThreads(s).length, 2);
  assert.match(M.pageHTML(M.normalizeSession({ name: "x" })), /Nothing logged yet/);
  assert.ok(!M.pageHTML(M.normalizeSession({ name: "<b>" })).includes("<b>"));
});
test("event types turned off are skipped (notes never)", () => {
  assert.equal(M.typeOn("combatStart", ["combat"]), false); assert.equal(M.typeOn("note", ["note"]), true); assert.equal(M.typeOn("quest", []), true);
});
