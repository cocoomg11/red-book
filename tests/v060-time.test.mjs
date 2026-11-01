import { test } from "node:test";
import assert from "node:assert/strict";
import * as T from "../scripts/time-model.mjs";
import * as M from "../scripts/session-model.mjs";

const NY = "America/New_York", TYO = "Asia/Tokyo", UTC = "UTC";
const en = { locale: "en-US" };

test("iso: every event has an ISO UTC time next to t; bad values give 0 / empty", () => {
  const e = M.makeEvent({ type: "note", text: "x", t: Date.UTC(2026, 2, 14, 23, 0) });
  assert.equal(e.at, "2026-03-14T23:00:00.000Z");
  assert.equal(M.makeEvent({ at: "2026-03-15T05:30:00.000Z" }).t, Date.UTC(2026, 2, 15, 5, 30));
  assert.equal(T.isoOf(0), ""); assert.equal(T.isoOf("nope"), ""); assert.equal(T.msOf("garbage"), 0); assert.equal(T.msOf(-5), 0);
});

test("local wall time and back, in several zones", () => {
  const ms = T.localToMs(2026, 3, 14, 19, 0, NY);
  assert.equal(new Date(ms).toISOString(), "2026-03-14T23:00:00.000Z"); // EDT (after 8 Mar)
  assert.deepEqual(T.localParts(ms, NY), { y: 2026, mo: 3, d: 14, h: 19, mi: 0, s: 0 });
  assert.equal(T.dayKey(ms, NY), "2026-03-14"); assert.equal(T.dayKey(ms, TYO), "2026-03-15"); assert.equal(T.dayKey(ms, UTC), "2026-03-14");
  assert.equal(new Date(T.localToMs(2026, 1, 10, 19, 0, NY)).toISOString(), "2026-01-11T00:00:00.000Z"); // EST
});

test("session range: one date the same day, both dates past midnight, open sessions end with a dash", () => {
  const a = T.localToMs(2026, 3, 14, 19, 0, NY), b = T.localToMs(2026, 3, 15, 1, 30, NY);
  assert.equal(T.rangeText(a, b, { ...en, timeZone: NY }), "Sat 14 Mar, 7:00 PM – Sun 15 Mar, 1:30 AM");
  assert.equal(T.rangeText(a, a + 3 * 3600000, { ...en, timeZone: NY }), "Sat 14 Mar, 7:00 PM – 10:00 PM");
  assert.equal(T.rangeText(a, 0, { ...en, timeZone: NY }), "Sat 14 Mar, 7:00 PM –");
  assert.equal(T.rangeText(0, b), "");
  // The same instants seen from Tokyo: the start is already Sunday morning there, so both ends fall on Sunday.
  assert.equal(T.rangeText(a, b, { ...en, timeZone: TYO }), "Sun 15 Mar, 8:00 AM – 2:30 PM");
  assert.equal(T.crossesMidnight(a, b, NY), true); assert.equal(T.crossesMidnight(a, b, TYO), false);
});

test("durations come from timestamps: across a DST change a 7 h wall-clock span is 6 or 8 real hours", () => {
  // Spring forward (8 Mar 2026, 2:00 → 3:00 in New York): 9 PM to 4 AM on the wall is 6 hours.
  const s1 = T.localToMs(2026, 3, 7, 21, 0, NY), e1 = T.localToMs(2026, 3, 8, 4, 0, NY);
  assert.equal(T.elapsedMs(s1, e1), 6 * 3600000); assert.equal(T.clockText(T.elapsedMs(s1, e1)), "6:00");
  // Fall back (1 Nov 2026, 2:00 → 1:00): 9 PM to 4 AM is 8 hours.
  const s2 = T.localToMs(2026, 10, 31, 21, 0, NY), e2 = T.localToMs(2026, 11, 1, 4, 0, NY);
  assert.equal(T.elapsedMs(s2, e2), 8 * 3600000);
  // A skipped time lands after the jump; a doubled one is the first.
  assert.equal(T.localParts(T.localToMs(2026, 3, 8, 2, 30, NY), NY).h, 3);
  assert.equal(new Date(T.localToMs(2026, 11, 1, 1, 30, NY)).toISOString(), "2026-11-01T05:30:00.000Z");
  assert.equal(T.elapsedMs(5, 2), 0); assert.equal(T.elapsedMs(0, 2), 0);
  assert.equal(T.clockText(26 * 3600000 + 10 * 60000), "26:10");
});

test("clock readings: 24 h, 12 h, with seconds; nonsense is null", () => {
  assert.deepEqual(T.parseClock("19:30"), { h: 19, mi: 30 });
  assert.deepEqual(T.parseClock("07:30 PM"), { h: 19, mi: 30 });
  assert.deepEqual(T.parseClock("12:05 a.m."), { h: 0, mi: 5 });
  assert.deepEqual(T.parseClock("12:05 PM"), { h: 12, mi: 5 });
  assert.deepEqual(T.parseClock("01:02:03"), { h: 1, mi: 2 });
  assert.equal(T.parseClock("25:00"), null); assert.equal(T.parseClock(""), null); assert.equal(T.parseClock("13:00 PM"), null);
});

test("migration: old events get the start date + their clock, rolling to the next day when the clock goes back", () => {
  const start = T.localToMs(2026, 3, 14, 19, 0, NY);
  const old = [{ rtText: "07:00 PM" }, { rtText: "11:45 PM" }, { rtText: "12:10 AM" }, { rtText: "" }, { rtText: "01:30 AM" }, { t: start + 1000 }];
  const out = T.migrateTimes(old, start, { timeZone: NY });
  const iso = out.map(e => e.at);
  assert.equal(iso[0], "2026-03-14T23:00:00.000Z");
  assert.equal(iso[1], "2026-03-15T03:45:00.000Z");
  assert.equal(iso[2], "2026-03-15T04:10:00.000Z"); // rolled to Sunday
  assert.equal(iso[3], iso[2]); // no reading: the previous event's time
  assert.equal(iso[4], "2026-03-15T05:30:00.000Z");
  assert.equal(out[5].t, start + 1000); assert.ok(!out[5].migrated); assert.ok(out[0].migrated);
  assert.equal(old[0].t, undefined); // input untouched
  // Times keep going forward.
  for (let i = 1; i < 5; i++) assert.ok(out[i].t >= out[i - 1].t);
  // A roll across a DST change keeps the wall time.
  const s = T.localToMs(2026, 3, 7, 22, 0, NY);
  const d = T.migrateTimes([{ rtText: "22:00" }, { rtText: "03:15" }], s, { timeZone: NY });
  assert.deepEqual(T.localParts(d[1].t, NY), { y: 2026, mo: 3, d: 8, h: 3, mi: 15, s: 0 });
  // No start date: nothing to build from; events keep t 0 → normalizeSession falls back to the start (0) / now.
  assert.equal(T.migrateTimes([{ rtText: "19:00" }], 0)[0].t, 0);
});

test("normalizeSession migrates events with no usable time (v1 data) and stores v2", () => {
  const start = Date.UTC(2026, 2, 14, 23, 0);
  const s = M.normalizeSession({ v: 1, startedAt: start, events: [{ type: "scene", text: "a", rtText: "23:30" }, { type: "note", text: "b", rtText: "00:15" }] });
  assert.equal(s.v, 2);
  // The zone is this machine's; whatever it is, the second event is later than the first and after the start.
  assert.ok(s.events[1].t > s.events[0].t && s.events[0].t >= start - 86400000);
  assert.ok(s.events.every(e => /Z$/.test(e.at)));
  assert.deepEqual(s.npcs, []); assert.deepEqual(s.attendance, []); assert.deepEqual(s.awards, { xp: [], milestone: "" });
});

test("timeline page: day headings past midnight, dates on rows not on the start date, viewer's zone", () => {
  const start = T.localToMs(2026, 3, 14, 19, 0, NY);
  let s = M.normalizeSession({ n: 1, name: "Session 1", startedAt: start, endedAt: start + 6.5 * 3600000, open: false });
  s = M.addEvent(s, M.makeEvent({ type: "scene", text: "Evening", t: start + 60000, rtText: "7:01 PM" }));
  s = M.addEvent(s, M.makeEvent({ type: "note", text: "Late", t: start + 5.5 * 3600000, rtText: "12:30 AM" }));
  const html = M.pageHTML(s, { ...en, timeZone: NY });
  assert.match(html, /Sat 14 Mar, 7:00 PM – Sun 15 Mar, 1:30 AM/);
  assert.match(html, /<h3 class="rb-day">Sun 15 Mar<\/h3>/);
  assert.match(html, /<span class="rb-when">Sun 15 Mar 12:30 AM<\/span> Late/);
  assert.match(html, /<span class="rb-when">7:01 PM<\/span> Evening/);
  // Seen from Tokyo the whole session is on Sunday: no day heading, no dates.
  const tyo = M.pageHTML(s, { ...en, timeZone: TYO });
  assert.ok(!tyo.includes("rb-day")); assert.match(tyo, /Sun 15 Mar, 8:00 AM – 2:30 PM/);
  // Dates turned off: plain clock, no heading.
  assert.ok(!M.pageHTML(s, { dates: false, timeZone: NY }).includes("rb-day"));
  // whenText shows the date only when it differs.
  assert.equal(M.whenText({ t: start + 60000 }, { ...en, timeZone: NY, start }), "7:01 PM");
  assert.equal(M.whenText({ t: start + 5 * 3600000 }, { ...en, timeZone: NY, start }), "Sun 15 Mar 12:00 AM");
});

test("this-session window and break reminders use timestamps", () => {
  const a = 1_000_000, b = a + 3600000;
  const list = [{ t: a - 1 }, { t: a }, { t: b }, { t: b + 1 }, { at: T.isoOf(a + 5) }];
  assert.equal(T.inWindow(list, a, b).length, 3);
  assert.equal(T.inWindow(list, a, 0, undefined, b).length, 3); // open: up to now
  assert.equal(T.inWindow(list, 0, b).length, 0);
  assert.equal(T.breakDue(a, a + 89 * 60000, 90), 0);
  assert.equal(T.breakDue(a, a + 90 * 60000, 90), 1);
  assert.equal(T.breakDue(a, a + 95 * 60000, 90, 1), 0);
  assert.equal(T.breakDue(a, a + 300 * 60000, 90, 1), 3); // missed ones: only the latest
  assert.equal(T.breakDue(a, a + 300 * 60000, 0), 0);
});
