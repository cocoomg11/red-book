import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "../scripts/session-model.mjs";
import { REQUESTS } from "../scripts/requests.mjs";
import { readRequest, makeRequestId } from "../vendor/wanderers-core/index.mjs";

const QID = "abcdefghijklmnop";

// ---------------------------------------------------------------- quest events
test("quest hook: ids only, known changes, journal ids or UUIDs; anything else is null", () => {
  assert.deepEqual(M.readQuestHook({ questId: QID, change: "started" }), { questId: QID, change: "started" });
  assert.deepEqual(M.readQuestHook({ questId: `JournalEntry.${QID}`, change: "objective" }), { questId: QID, change: "objective" });
  for (const c of M.QUEST_CHANGES) assert.ok(M.readQuestHook({ questId: QID, change: c }), c);
  assert.equal(M.readQuestHook({ questId: QID, change: "deleted" }), null);
  assert.equal(M.readQuestHook({ questId: "short", change: "started" }), null);
  assert.equal(M.readQuestHook({ questId: "<script>alert(1)</script>xx", change: "started" }), null);
  assert.equal(M.readQuestHook(null), null);
  assert.equal(M.readQuestHook("x"), null);
  assert.deepEqual(M.TOOLKIT_HOOKS, { questUpdated: "wayfarersToolkit.questUpdated", journey: "wayfarersToolkit.journey" });
});

test("quest diff: hidden quests and hidden objectives become GM-only lines; objective ids kept for the dedupe key", () => {
  const b = M.questState("Q", { status: "active", objectives: [{ id: "o1", text: "Find it" }, { id: "o2", text: "Secret", hidden: true }] });
  const a = M.questState("Q", { status: "active", objectives: [{ id: "o1", text: "Find it", done: true }, { id: "o2", text: "Secret", hidden: true, done: true }] });
  const ev = M.diffQuest(b, a);
  assert.deepEqual(ev.map(e => [e.type, e.private, e.data.objective]), [["objective", false, "o1"], ["objective", true, "o2"]]);
  const hidden = M.diffQuest(M.questState("H", { status: "available", hidden: true }), M.questState("H", { status: "active", hidden: true }));
  assert.equal(hidden.length, 1); assert.equal(hidden[0].private, true); assert.equal(hidden[0].text, "Quest given: H.");
});

test("quest keys: the same change of the same quest (and objective) gives the same key", () => {
  assert.equal(M.questKey(QID, { type: "quest", data: { status: "active" } }), `${QID}:started`);
  assert.equal(M.questKey(QID, { type: "quest", data: { status: "completed" } }), `${QID}:completed`);
  assert.equal(M.questKey(QID, { type: "quest", data: { status: "failed" } }), `${QID}:failed`);
  assert.equal(M.questKey(QID, { type: "objective", data: { objective: "o1" } }), `${QID}:objective:o1`);
  assert.notEqual(M.questKey(QID, { type: "objective", data: { objective: "o1" } }), M.questKey(QID, { type: "objective", data: { objective: "o2" } }));
  assert.equal(M.questKey("", { type: "quest", data: { status: "active" } }), "");
  assert.equal(M.questKey(QID, { type: "note" }), "");
});

test("quest fallback: only when the quest's status agrees with the hook; hidden quests GM only", () => {
  assert.deepEqual(M.questFallback("completed", { name: "Q", status: "completed" }), { type: "quest", text: "Quest completed: Q.", data: { status: "completed" }, private: false });
  assert.equal(M.questFallback("started", { name: "Q", status: "active", hidden: true }).private, true);
  assert.equal(M.questFallback("started", { name: "Q", status: "active" }).text, "Quest given: Q.");
  assert.equal(M.questFallback("completed", { name: "Q", status: "active" }), null);
  assert.equal(M.questFallback("objective", { name: "Q", status: "active" }), null);
  assert.equal(M.questFallback("updated", { name: "Q", status: "active" }), null);
  assert.equal(M.questFallback("started", null), null);
});

test("Recent: a key logged within the window is seen; later or other keys aren't; capped", () => {
  const r = new M.Recent({ window: 1000, max: 3 });
  assert.equal(r.seen("a", 0), false); r.mark("a", 0);
  assert.equal(r.seen("a", 500), true); assert.equal(r.seen("a", 1500), false); assert.equal(r.seen("b", 500), false);
  for (const k of ["b", "c", "d", "e"]) r.mark(k, 10);
  assert.equal(r.size, 3); assert.equal(r.seen("a", 20), false);
});

test("summary: quest progress has its own list; GM-only quest lines only in a secret block (stripped from the recap)", () => {
  let s = M.normalizeSession({ n: 1, name: "S", startedAt: 1, endedAt: 2 });
  const add = (e, i) => { s = M.addEvent(s, M.makeEvent({ id: `e${i}`, ...e })); };
  add({ type: "quest", text: "Quest given: Open.", data: { status: "active" } }, 1);
  add({ type: "objective", text: "Objective done: Open: Step.", data: { objective: "o" } }, 2);
  add({ type: "quest", text: "Quest given: Hidden.", data: { status: "active" }, private: true }, 3);
  add({ type: "death", text: "Wolf was killed." }, 4);
  s.open = false; s.summary = M.summarize(s);
  assert.deepEqual(s.summary.quests.map(q => [q.text, q.private]), [["Quest given: Open.", false], ["Objective done: Open: Step.", false], ["Quest given: Hidden.", true]]);
  assert.deepEqual(s.summary.notable, ["Quest given: Open.", "Wolf was killed."], "private lines never notable");
  const html = M.summaryHTML(s.summary);
  assert.match(html, /<h3>Quests<\/h3><ul><li>Quest given: Open\.<\/li><li>Objective done: Open: Step\.<\/li><\/ul>/);
  assert.ok(!/<h3>Notable moments<\/h3><ul>[^]*Quest given: Open[^]*<\/ul>[^]*<h3>Quests/.test(html.split("<h3>Quests")[0]), "quest lines not repeated under Notable");
  const recap = M.stripForRecap(M.pageHTML(s));
  assert.match(recap, /Quest given: Open\./); assert.match(recap, /Objective done: Open: Step\./);
  assert.ok(!recap.includes("Hidden"), "GM-only quest lines never reach the recap");
  // An old summary (no quests list) still renders its notable moments.
  assert.match(M.summaryHTML({ counts: {}, notable: ["Quest given: X."], threads: [], realMs: 0, worldSeconds: 0 }), /Notable moments<\/h3><ul><li>Quest given: X\./);
});

// ---------------------------------------------------------------- journeys
const J = { kind: "flight", fromId: "a1", toId: "b2", fromName: "Harbor", toName: "<b>Hill</b> Fort", hours: 2.5, cost: { gp: 1, sp: 5, cp: 0 }, partyId: "p" };
test("journey hook: read, names plain and clipped, numbers checked; unknown kinds refused", () => {
  const j = M.readJourney(J);
  assert.equal(j.toName, "Hill Fort"); assert.equal(j.hours, 2.5); assert.deepEqual(j.cost, { gp: 1, sp: 5, cp: 0 });
  assert.equal(M.readJourney({ ...J, kind: "boat" }), null);
  assert.equal(M.readJourney({ kind: "hex" }), null, "no names");
  assert.equal(M.readJourney(null), null);
  const odd = M.readJourney({ kind: "hex", fromName: "x".repeat(500), hours: -3, cost: { gp: "lots", sp: -1, cp: 2.7 } });
  assert.equal(odd.fromName.length, 100); assert.equal(odd.hours, 0); assert.deepEqual(odd.cost, { gp: 0, sp: 0, cp: 2 });
});
test("journey event: a Travel line with route, time and cost; hex trips are Travel, flights Flight", () => {
  const e = M.journeyEvent(M.readJourney(J));
  assert.equal(e.type, "travel"); assert.equal(e.text, "Flight: Harbor → Hill Fort, 2 hours 30 minutes, 1 gp 5 sp.");
  assert.equal(e.data.kind, "flight"); assert.equal(e.data.via, "hook");
  const h = M.journeyEvent(M.readJourney({ kind: "hex", fromName: "A", toName: "B" }));
  assert.equal(h.text, "Travel: A → B."); assert.equal(h.data.kind, "travel");
  assert.equal(M.journeyEvent(null), null);
  assert.equal(M.costText({}), "");
});
test("Merge: the hook (primary) and the Travel Log line (secondary) log once, whichever comes first", () => {
  // Hook first: logged; the page line within the window is skipped.
  let m = new M.Merge({ window: 1000, delay: 100, repeat: 50 });
  assert.equal(m.primary("flight", 0), true); assert.equal(m.secondary("flight", 10), "skip");
  // Page line first: it waits; the hook within the delay logs and the waiting line is dropped.
  m = new M.Merge({ window: 1000, delay: 100 });
  assert.equal(m.secondary("travel", 0), "wait"); assert.equal(m.primary("travel", 50), true); assert.equal(m.settle("travel", 0), false);
  // Page line alone (toolkit without the hook): logged after the delay.
  m = new M.Merge({ window: 1000, delay: 100 });
  assert.equal(m.secondary("travel", 0), "wait"); assert.equal(m.settle("travel", 0), true);
  // ...and a late hook for the same trip is then skipped.
  assert.equal(m.primary("travel", 200), false);
  // Two trips in a row from one source both log; other kinds don't interfere; outside the window nothing pairs.
  m = new M.Merge({ window: 1000, delay: 100, repeat: 0 });
  assert.equal(m.primary("flight", 0), true); assert.equal(m.primary("flight", 5), true);
  assert.equal(m.secondary("travel", 6), "wait");
  assert.equal(m.secondary("flight", 2000), "wait");
  // The same page line heard twice at once (two tabs) is a repeat.
  m = new M.Merge({ window: 1000, delay: 100, repeat: 50 });
  assert.equal(m.secondary("travel", 0), "wait"); assert.equal(m.secondary("travel", 10), "skip");
});
test("Merge: capped key list", () => {
  const m = new M.Merge({ max: 5 });
  for (let i = 0; i < 20; i++) m.primary(`k${i}`, i);
  assert.equal(m.size, 5);
});
test("requests: quest relay is GM only, ids only", () => {
  const rid = n => makeRequestId("abcd1234", n, 1000);
  assert.equal(REQUESTS.quest.from, "gm");
  assert.deepEqual(REQUESTS.quest.fields.change.oneOf, [...M.QUEST_CHANGES]);
  assert.equal(readRequest(REQUESTS, { action: "request", kind: "quest", rid: rid(7), data: { questId: QID, change: "failed" } }).ok, true);
  assert.equal(readRequest(REQUESTS, { action: "request", kind: "quest", rid: rid(8), data: { questId: QID, change: "failed", text: "x" } }).ok, false);
  assert.equal(readRequest(REQUESTS, { action: "request", kind: "quest", rid: rid(9), data: { questId: "nope", change: "failed" } }).ok, false);
});
test("requests: journey relay is GM only, schema-checked, no user field", () => {
  assert.equal(REQUESTS.journey.from, "gm");
  const rid = n => makeRequestId("abcd1234", n, 1000);
  const ok = readRequest(REQUESTS, { action: "request", kind: "journey", rid: rid(1), data: { kind: "hex", fromName: "A", toName: "B", hours: 3, cost: { gp: 1 } } });
  assert.equal(ok.ok, true, ok.reason);
  const bad = readRequest(REQUESTS, { action: "request", kind: "journey", rid: rid(2), data: { kind: "boat" } });
  assert.equal(bad.ok, false);
  const user = readRequest(REQUESTS, { action: "request", kind: "journey", rid: rid(3), data: { kind: "hex", user: "x" } });
  assert.equal(user.ok, false);
});
