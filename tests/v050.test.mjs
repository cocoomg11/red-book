import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { flatten } from "../scripts/i18n.mjs";
import * as V from "../scripts/view.mjs";
import * as B from "../scripts/board-model.mjs";
import * as C from "../scripts/check-model.mjs";
import * as St from "../scripts/store-model.mjs";
import * as M from "../scripts/session-model.mjs";
import { REQUESTS } from "../scripts/requests.mjs";
import { readRequest, makeRequestId } from "../vendor/wanderers-core/index.mjs";

const QID = "abcdefghijklmnop";
const LANG = flatten(JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8")));
before(() => {
  globalThis.game = { i18n: {
    localize: k => LANG[k] ?? `MISSING:${k}`,
    format: (k, d) => (LANG[k] ?? `MISSING:${k}`).replace(/\{(\w+)\}/g, (_, n) => d[n] ?? "")
  } };
});
const noMissing = html => assert.ok(!html.includes("MISSING:"), html.match(/MISSING:[\w.]+/)?.[0]);

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

// ---------------------------------------------------------------- timeline: Travel chip
test("timeline filter: Travel has its own chip; quests chip has quests and objectives", () => {
  assert.deepEqual(V.FILTERS.travel, ["travel"]);
  assert.deepEqual(V.FILTERS.quests, ["quest", "objective"]);
  const ev = [{ type: "travel" }, { type: "quest" }, { type: "objective" }];
  assert.equal(V.filterEvents(ev, "travel").length, 1);
  assert.equal(V.filterCounts(ev).quests, 2);
  noMissing(V.sessionPageHTML({ on: true, now: 10, filter: "travel", session: { name: "S", startedAt: 1, events: [] }, roster: [] }));
});

// ---------------------------------------------------------------- prep list
const scene = { id: "s1", uuid: "Scene.s1", name: "Cave" };
const F1 = { rule: "walls", severity: "warning", text: "No walls", key: "walls" };
const F2 = { rule: "bg", severity: "problem", text: "Background missing", key: "background:x" };
const F3 = { rule: "n", severity: "note", text: "A note", key: "notes:n" };
test("prep list: deduped by scene + finding key, newest first, capped, linked to the scene", () => {
  let r = B.addTodos([], scene, [F1, F2], 100);
  assert.equal(r.added, 2); assert.deepEqual(r.items.map(i => i.text), ["Background missing", "No walls"]);
  assert.equal(r.items[0].sceneUuid, "Scene.s1"); assert.equal(r.items[0].id, "s1|background:x");
  r = B.addTodos(r.items, scene, [F1], 200);
  assert.equal(r.added, 0); assert.equal(r.items.length, 2, "same finding twice stays one item");
  r = B.addTodos(r.items, { id: "s2", name: "Hall" }, [F1], 300);
  assert.equal(r.added, 1); assert.equal(r.items[0].sceneUuid, "Scene.s2");
  assert.equal(B.removeTodo(r.items, "s1|walls").length, 2);
  const many = Array.from({ length: 150 }, (_, i) => ({ severity: "warning", text: `t${i}`, key: `k${i}` }));
  assert.equal(B.addTodos([], scene, many).items.length, B.TODOS_MAX);
  assert.equal(B.normalizeTodos([{ id: "a" }, { id: "a" }, null, { nope: 1 }]).length, 1);
  assert.equal(B.isFailure(F3), false); assert.equal(B.isFailure(F1), true);
  // A finding without a key (a failed check line) is keyed by its text.
  assert.equal(B.todoId("s1", { text: "Couldn't check" }), "s1|Couldn't check");
});
test("store: prep list kept in the GM-only store (older stores read as empty)", () => {
  assert.deepEqual(St.normalizeStore({ v: 1, pins: { pins: [] } }).todos, []);
  assert.equal(St.normalizeStore({ v: 1, todos: [{ id: "s1|walls", sceneId: "s1", text: "x" }] }).todos.length, 1);
});
test("check page: Add to board on failures only, On the board marker, Add all failures (only the new ones)", () => {
  const r = C.applyIgnored({ scene, all: [F1, F2, F3] }, null);
  const html = V.checkPageHTML({ scenes: [{ id: "s1", name: "Cave" }], results: { s1: r }, selected: "s1", query: "", prep: { on: true, onBoard: new Set(["s1|walls"]) } });
  noMissing(html);
  const adds = html.match(/data-action="prepAdd"/g) ?? [];
  assert.equal(adds.length, 1, "one failure not yet on the board");
  assert.match(html, /class="rb-on-board"/);
  assert.match(html, /data-action="prepAddAll" data-scene="s1">[^<]*<i[^>]*><\/i> Add all failures \(1\)/);
  const off = V.checkPageHTML({ scenes: [{ id: "s1", name: "Cave" }], results: { s1: r }, selected: "s1", query: "" });
  assert.ok(!off.includes("prepAdd"), "no buttons when the prep list is off");
  const all = V.checkPageHTML({ scenes: [{ id: "s1", name: "Cave" }], results: { s1: r }, selected: "s1", query: "", prep: { on: true, onBoard: new Set(["s1|walls", "s1|background:x"]) } });
  assert.match(all, /data-action="prepAddAll"[^>]* disabled/); assert.match(all, /Every failure is on the board/);
});
test("board: prep panel grouped by scene, scene link and Check again, Done buttons, escaped", () => {
  const items = B.addTodos([], scene, [F1, { ...F2, text: "<b>bad</b>" }]).items;
  const html = V.prepPanelHTML(items, { checkOn: true, max: 100 });
  noMissing(html);
  assert.equal((html.match(/rb-prep-scene/g) ?? []).length, 1);
  assert.match(html, /data-action="openUuid" data-uuid="Scene.s1">Cave/);
  assert.match(html, /data-action="checkScene"[^>]*data-scene="s1"/);
  assert.equal((html.match(/data-action="prepDone"/g) ?? []).length, 2);
  assert.ok(html.includes("&lt;b&gt;bad") && !html.includes("<b>bad"));
  assert.match(V.prepPanelHTML([]), /Nothing to fix/);
  const m = { toolkit: false, quests: [], links: { actors: [], journals: [], other: [], scenes: [] }, last: null, pins: [], todos: items };
  assert.match(V.boardPageHTML(m, u => ({ name: u, exists: true, scene: true }), { prepOn: true, checkOn: false }), /Prep list/);
  assert.ok(!V.boardPageHTML(m, u => ({ name: u, exists: true, scene: true }), { prepOn: false }).includes("Prep list"));
  assert.ok(!V.prepPanelHTML(items, { checkOn: false }).includes("checkScene"));
});
