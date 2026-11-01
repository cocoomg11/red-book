import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { flatten } from "../scripts/i18n.mjs";
import * as V from "../scripts/view.mjs";
import * as M from "../scripts/session-model.mjs";
import * as P from "../scripts/previously-model.mjs";
import * as Feat from "../scripts/features.mjs";
import * as Set_ from "../scripts/settings-model.mjs";
import { REQUESTS } from "../scripts/requests.mjs";
import { BROADCAST } from "../scripts/core.mjs";
import { readRequest, makeRequestId } from "../vendor/wanderers-core/index.mjs";

const LANG = flatten(JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8")));
before(() => {
  globalThis.game = { i18n: {
    localize: k => LANG[k] ?? `MISSING:${k}`,
    format: (k, d) => (LANG[k] ?? `MISSING:${k}`).replace(/\{(\w+)\}/g, (_, n) => d[n] ?? "")
  } };
});
const noMissing = html => assert.ok(!html.includes("MISSING:"), html.match(/MISSING:[\w.]+/)?.[0]);
const ID16 = "abcdefghijklmnop", U2 = "ponmlkjihgfedcba";
const rid = n => makeRequestId("u1", n);
const req = (kind, data, n = 1) => readRequest(REQUESTS, { action: "request", kind, rid: rid(n), data });

// ---------------------------------------------------------------- features and settings
test("features 0.6.0: each new tool is toggleable, needs the session log, on by default", () => {
  for (const id of ["previously", "npcsMet", "sessionTimer", "attendance", "gained"]) {
    const f = Feat.FEATURES.find(x => x.id === id);
    assert.ok(f, id); assert.deepEqual([...f.needs], ["sessionLog"]); assert.equal(f.default, true); assert.ok(f.hint);
  }
  const s = k => Set_.SETTINGS.find(x => x.key === k);
  assert.equal(s("breakReminder").default, false); assert.equal(s("breakEvery").default, 90);
  assert.equal(s("awardMode").default, "xp"); assert.deepEqual(Object.keys(s("awardMode").choices), ["xp", "milestone", "off"]);
  assert.equal(s("previouslySeen").client, true); assert.ok(Set_.RECORDS.includes("previouslySeen"));
  assert.equal(s("logDates").default, true);
});

test("requests 0.6.0: sessionEdit and previously are GM-only, typed and small", () => {
  assert.equal(REQUESTS.sessionEdit.from, "gm"); assert.equal(REQUESTS.previously.from, "gm");
  assert.equal(req("sessionEdit", { session: ID16, op: "unmeet", key: "a:Goblin" }).ok, true);
  assert.equal(req("sessionEdit", { session: ID16, op: "award", actorId: U2, n: 300 }, 2).ok, true);
  assert.equal(req("sessionEdit", { session: ID16, op: "attend", userId: U2, present: false }, 3).ok, true);
  assert.equal(req("sessionEdit", { session: ID16, op: "drop" }, 4).ok, false);
  assert.equal(req("sessionEdit", { session: ID16, op: "award", actorId: U2, n: -5 }, 5).ok, false);
  assert.equal(req("sessionEdit", { session: ID16, op: "milestone", text: "x", by: "me" }, 6).ok, false);
  assert.equal(req("previously", { recap: ID16, force: true }, 7).ok, true);
  assert.equal(req("previously", { recap: "<b>" }, 8).ok, false);
  assert.ok(BROADCAST.includes("red-book.previouslyOn"));
});

// ---------------------------------------------------------------- NPCs met
test("NPCs met: each once with actor id, name, first seen and scene; removed ones leave the Met line and stay met", () => {
  let s = M.normalizeSession({ n: 1, startedAt: 1000 });
  const c = (key, name) => ({ key, actorId: ID16, name, uuid: `Actor.${ID16}`, sceneId: "s1", sceneName: "Road" });
  const r = M.meetNpcs(s, [c("a:Wolf", "Wolf"), c("a:Bandit", "Bandit")], 5000);
  assert.equal(r.fresh.length, 2); s = r.session;
  s = M.addEvent(s, M.makeEvent({ type: "npc", text: M.metText(["Wolf", "Bandit"]), refs: ["Actor.x", "Actor.y"], data: { npcs: ["a:Wolf", "a:Bandit"], names: ["Wolf", "Bandit"] } }));
  assert.deepEqual(s.npcs.map(n => [n.key, n.name, n.at, n.sceneName]), [["a:Wolf", "Wolf", 5000, "Road"], ["a:Bandit", "Bandit", 5000, "Road"]]);
  assert.equal(M.meetNpcs(s, [c("a:Wolf", "Wolf")], 6000).fresh.length, 0);
  s = M.unmeet(s, "a:Bandit");
  assert.deepEqual(s.npcs.map(n => n.key), ["a:Wolf"]);
  assert.equal(s.events[0].text, "Met Wolf."); assert.deepEqual(s.events[0].refs, ["Actor.x"]);
  assert.equal(M.meetNpcs(s, [c("a:Bandit", "Bandit")], 7000).fresh.length, 0, "not met again after removal");
  s = M.unmeet(s, "a:Wolf");
  assert.equal(s.events.length, 0, "a Met line with nobody left goes");
  assert.equal(M.unmeet(s, "nobody"), s);
  // Stored shape survives normalizeSession; capped.
  const n = M.normalizeSession({ npcs: Array.from({ length: 600 }, (_, i) => ({ key: `k${i}`, name: `<b>${i}</b>` })) }).npcs;
  assert.equal(n.length, M.MET_MAX); assert.equal(n[0].name, "100");
});

// ---------------------------------------------------------------- attendance and awards
test("attendance: connected players added once, GM edits kept, taken-out rows not re-added", () => {
  const users = [{ id: "u1", name: "Ana", active: true, isGM: false, character: { id: "c1", name: "Thorn" } }, { id: "g", name: "GM", active: true, isGM: true }, { id: "u2", name: "Bo", active: false, isGM: false }];
  let s = M.normalizeSession({});
  s = { ...s, attendance: M.addAttendance(s.attendance, users) };
  assert.deepEqual(s.attendance.map(a => [a.userId, a.characterName, a.present]), [["u1", "Thorn", true]]);
  s = M.applyEdit(s, { op: "attend", userId: "u1", present: false });
  assert.equal(M.present(s.attendance).length, 0);
  s = { ...s, attendance: M.addAttendance(s.attendance, users) };
  assert.equal(M.present(s.attendance).length, 0, "the automatic add doesn't undo the GM");
  s = M.applyEdit(s, { op: "attend", userId: "u2", present: true, name: "Bo", characterId: "c2", characterName: "Moss" });
  s = M.applyEdit(s, { op: "attend", userId: "u1", present: true });
  assert.deepEqual(M.present(s.attendance).map(a => a.characterName).sort(), ["Moss", "Thorn"]);
  assert.equal(M.normalizeAttendance(Array.from({ length: 80 }, (_, i) => ({ userId: `u${i}` }))).length, M.ATTEND_MAX);
});

test("awards: XP per character, milestone text, totals across sessions", () => {
  let a = M.normalizeSession({ n: 1, attendance: [{ userId: "u1", name: "Ana", characterId: "c1", characterName: "Thorn" }, { userId: "u2", name: "Bo", characterId: "c2", characterName: "Moss" }] });
  a = M.applyEdit(a, { op: "award", actorId: "c1", name: "Thorn", n: 300 });
  a = M.applyEdit(a, { op: "award", actorId: "c1", name: "Thorn", n: 350 });
  a = M.applyEdit(a, { op: "award", actorId: "c2", name: "Moss", n: 0 });
  assert.deepEqual(a.awards.xp, [{ actorId: "c1", name: "Thorn", n: 350 }]);
  let b = M.normalizeSession({ n: 2, attendance: [{ userId: "u1", name: "Ana", characterId: "c1", characterName: "Thorn" }] });
  b = M.applyEdit(b, { op: "award", actorId: "c1", name: "Thorn", n: 100 });
  b = M.applyEdit(b, { op: "milestone", text: "Cleared the mine" });
  const tot = M.awardTotals([b, a]);
  assert.deepEqual(tot.c1, { name: "Thorn", xp: 450, milestones: 1, sessions: 2 });
  assert.deepEqual(tot.c2, { name: "Moss", xp: 0, milestones: 0, sessions: 1 });
  assert.equal(M.normalizeAwards({ xp: [{ actorId: "x", n: "12.7" }, { actorId: "x", n: 5 }, { n: 9 }] }).xp.length, 1);
});

test("extras block: milestone for players, XP only in a secret block, attendance, NPCs, gained; empty parts left out", () => {
  const s = { attendance: [{ userId: "u1", name: "Ana", characterId: "c1", characterName: "Thorn", present: true }, { userId: "u2", name: "Bo", characterName: "", present: false }],
    awards: { xp: [{ actorId: "c1", name: "Thorn", n: 300 }], milestone: "Level <4>" }, npcs: [{ key: "k", name: "Wolf", at: 0, sceneName: "Road" }] };
  const g = M.gained({ coinLog: [{ at: 5, delta: 1253, actorName: "Party" }], start: 1, end: 10, quests: [{ items: [{ name: "Ring", qty: 1 }] }] });
  const xp = M.extrasHTML({ ...s, mode: "xp", gained: g });
  assert.match(xp, /<section class="secret" id="secret-rb-xp">.*Thorn: 300 XP/);
  assert.ok(!xp.includes("Level")); assert.ok(!xp.includes("Bo"), "taken-out rows aren't listed");
  assert.match(xp, /At the table<\/h3><ul class="rb-attendance"><li>Thorn \(Ana\)<\/li>/);
  assert.match(xp, /NPCs met<\/h3>.*Wolf · Road/);
  assert.match(xp, /Gained this session<\/h3><ul class="rb-gained"><li>Coin: \+12 g 5 s 3 c<\/li><li>Ring<\/li>/);
  const ms = M.extrasHTML({ ...s, mode: "milestone" });
  assert.match(ms, /Level &lt;4&gt;/); assert.ok(!ms.includes("XP"));
  // The recap keeps the milestone and drops the XP.
  const recap = M.stripForRecap(M.pageHTML({ ...M.normalizeSession({ name: "S" }), open: false }, { extras: xp }));
  assert.ok(!recap.includes("300")); assert.match(recap, /Thorn/); assert.match(recap, /Gained this session/);
  assert.equal(M.extrasHTML({}), "");
});

// ---------------------------------------------------------------- gained
test("gained: coin log in the session window only, undone and undo entries left out, hidden quests left out", () => {
  const log = [
    { at: 50, delta: 500, actorName: "A", reason: "Quest reward" }, { at: 60, delta: -120, actorName: "A", reason: "Room" },
    { at: 5, delta: 10000 }, { at: 70, delta: 999, undoneAt: 80 }, { at: 80, delta: -999, undoOf: "x" }, null, { at: 90, delta: "nope" }
  ];
  const g = M.gained({ coinLog: log, start: 10, end: 100, quests: [{ items: [{ name: "Sword" }, { name: "Potion", qty: 2 }] }, { hidden: true, items: [{ name: "Secret" }] }, { items: [{ name: "Potion" }] }] });
  assert.deepEqual(g.coin, { gp: 5, sp: 0, cp: 0 }); assert.deepEqual(g.spent, { gp: 1, sp: 2, cp: 0 });
  assert.equal(g.net, 380); assert.deepEqual(g.netCoin, { gp: 3, sp: 8, cp: 0 });
  assert.deepEqual(g.items, [{ name: "Potion", qty: 3 }, { name: "Sword", qty: 1 }]);
  assert.equal(M.gained({ coinLog: "x", start: 1 }).any, false);
  assert.equal(M.gained({ coinLog: log, start: 0, end: 100 }).net, 0, "no start, no window");
  // Open session: up to now.
  assert.equal(M.gained({ coinLog: log, start: 10, end: 0, now: 55 }).net, 500);
  // Without the coin log: the session's own loot lines.
  const loot = M.coinFromLoot([{ id: "e", type: "loot", t: 20, data: { coin: { gp: 2, sp: -5, pp: 1 } } }, { type: "note", data: { coin: { gp: 9 } } }]);
  assert.deepEqual(loot.map(e => e.delta), [1150]);
  assert.equal(M.coinText({ gp: 0, sp: 0, cp: 0 }), "0 c");
  assert.deepEqual(M.coinParts(1253, { gp: 1000, sp: 100, cp: 1 }), { gp: 1, sp: 2, cp: 53 });
});

// ---------------------------------------------------------------- Previously on…
test("previously: players once per recap (unless forced), GMs only as a preview, never without access", () => {
  const key = P.seenKey(ID16, 123);
  assert.equal(key, `${ID16}:123`); assert.equal(P.seenKey("", 1), "");
  assert.equal(P.shouldShow({ canSee: true, key, seen: "" }), true);
  assert.equal(P.shouldShow({ canSee: true, key, seen: key }), false);
  assert.equal(P.shouldShow({ canSee: true, key, seen: key, force: true }), true);
  assert.equal(P.shouldShow({ canSee: false, key, force: true }), false);
  assert.equal(P.shouldShow({ isGM: true, canSee: true, key }), false);
  assert.equal(P.shouldShow({ isGM: true, preview: true, canSee: true, key, seen: key }), true);
  assert.equal(P.shouldShow({ isGM: false, preview: true, canSee: true, key }), false);
  assert.deepEqual(P.normalizeSeen(null), { v: 1, key: "" });
  const html = P.cardHTML({ name: "<Session 3>", range: "Sat 14 Mar, 7:00 PM – Sun 15 Mar, 1:30 AM", html: "<p>They met the duke.</p>", preview: true }, { title: "Previously on…", preview: "Preview", empty: "Nothing" });
  assert.match(html, /&lt;Session 3&gt;/); assert.match(html, /rb-prev-preview/); assert.match(html, /They met the duke/);
  assert.match(P.cardHTML({ name: "S" }, { title: "T", preview: "P", empty: "Nothing" }), /<p>Nothing<\/p>/);
  assert.equal(P.recapTitle("Recap: Session 2 — 2026-03-14"), "Session 2 — 2026-03-14");
});

// ---------------------------------------------------------------- views
const sess = (extra = {}) => ({ ...M.normalizeSession({ n: 2, name: "Session 2", startedAt: Date.UTC(2026, 2, 14, 23), open: true }), id: ID16, uuid: `JournalEntry.${ID16}`, ...extra });
test("session page 0.6.0: live clock, Previously panel, NPCs met with remove, attendance with XP fields; no missing strings", () => {
  const s = sess({ npcs: [{ key: "k1", name: "Wolf", at: Date.UTC(2026, 2, 14, 23, 30), sceneName: "Road" }], attendance: [{ userId: "u1", name: "Ana", characterId: "c1", characterName: "Thorn", present: true }], awards: { xp: [{ actorId: "c1", name: "Thorn", n: 50 }], milestone: "" } });
  const html = V.sessionPageHTML({ on: true, session: s, last: null, now: s.startedAt + 65 * 60000, filter: "all", roster: [], timer: true, timeZone: "UTC", locale: "en-US",
    previously: { recap: { id: U2, name: "Recap: Session 1" } }, npcs: true, attendance: { mode: "xp", players: [{ userId: "u1", name: "Ana" }, { userId: "u2", name: "Bo", characterName: "Moss" }] } });
  noMissing(html);
  assert.match(html, /data-rb-clock="\d+">1:05</);
  assert.match(html, /Sat 14 Mar, 11:00 PM –/);
  assert.match(html, /data-action="prevPreview"/); assert.match(html, /data-action="prevShow"/);
  assert.match(html, /data-action="unmeet" data-session="abcdefghijklmnop" data-key="k1"/);
  assert.match(html, /name="xp-c1"[^>]*value="50"/);
  assert.match(html, /<option value="u2">Moss<\/option>/);
  // Timer off: the old "so far" text; features off: no panels.
  const off = V.sessionPageHTML({ on: true, session: s, last: null, now: s.startedAt + 60000, filter: "all", roster: [] });
  noMissing(off); assert.ok(!off.includes("data-rb-clock")); assert.ok(!off.includes("unmeet")); assert.ok(!off.includes("prevShow"));
  const ms = V.attendancePanelHTML(s, { mode: "milestone", players: [] }); noMissing(ms); assert.match(ms, /name="milestone"/); assert.ok(!ms.includes("xp-c1"));
  noMissing(V.previouslyPanelHTML({ recap: null })); noMissing(V.npcsPanelHTML({ npcs: [] })); noMissing(V.attendancePanelHTML({}, {}));
});

test("timeline view: date on rows from another day and a separator where the day changes (newest first)", () => {
  const start = Date.UTC(2026, 2, 14, 23, 0);
  const ev = (i, t) => ({ id: `e${i}`, type: "note", t, at: new Date(t).toISOString(), wt: 0, rtText: "", wtText: "", text: `n${i}`, refs: [], data: {}, private: false, thread: false });
  const rows = [ev(3, start + 3 * 3600000), ev(2, start + 1.5 * 3600000), ev(1, start + 600000)];
  const html = V.timelineHTML(rows, { start, timeZone: "UTC", locale: "en-US" });
  noMissing(html);
  const seps = html.match(/rb-day-sep/g) ?? [];
  assert.equal(seps.length, 2); // "Sun 15 Mar" above the newest rows, "Sat 14 Mar" where it changes back
  assert.match(html, /<span>Sun 15 Mar 2:00 AM<\/span>/); assert.match(html, /<span>11:10 PM<\/span>/);
  assert.match(html, /data-at="2026-03-15T02:00:00.000Z"/);
  // No session start (old callers): no dates, no separators.
  assert.ok(!V.timelineHTML(rows).includes("rb-day-sep"));
});

test("past sessions 0.6.0: date range, attendance, XP or milestone column, totals per character", () => {
  const list = [{ id: "a", uuid: "JournalEntry.a", name: "Session 1", n: 1, open: false, events: 3, startedAt: Date.UTC(2026, 2, 14, 19), endedAt: Date.UTC(2026, 2, 15, 1, 30),
    attendance: [{ userId: "u1", name: "Ana", characterName: "Thorn", present: true }], awards: { xp: [{ actorId: "c1", name: "Thorn", n: 200 }, { actorId: "c2", name: "Moss", n: 100 }], milestone: "M1" } }];
  const html = V.pastPageHTML(list, { dates: true, mode: "xp", totals: { c1: { name: "Thorn", xp: 200, milestones: 0, sessions: 1 } }, timeZone: "UTC", locale: "en-US" });
  noMissing(html);
  assert.match(html, /Sat 14 Mar, 7:00 PM – Sun 15 Mar, 1:30 AM/);
  assert.match(html, /<td>Thorn<\/td>/); assert.match(html, /<td>300<\/td>/); assert.match(html, /Totals per character/);
  const m = V.pastPageHTML(list, { mode: "milestone", totals: {} }); noMissing(m); assert.match(m, /<td>M1<\/td>/); assert.ok(!m.includes("Totals"));
  const plain = V.pastPageHTML(list); noMissing(plain); assert.ok(!plain.includes("XP")); assert.ok(!plain.includes("Sat 14"));
});
