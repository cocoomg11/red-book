/**
 * Dates and times (0.6.0), pure: no Foundry calls, tested in Node. Every log entry keeps its real time as `t` (ms since the epoch) and
 * `at` (the same instant as an ISO 8601 string in UTC). What a viewer sees is worked out from those in the viewer's own time zone
 * (Intl, `timeZone` undefined = this browser's), so a session that runs past midnight shows its day change where it happened for that
 * viewer. Durations and "this session" windows always come from timestamps, never from wall-clock dates.
 */

/** The ISO 8601 UTC string for `ms`, or "" when it isn't a usable time. */
export function isoOf(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return "";
  try { return new Date(n).toISOString(); } catch { return ""; }
}
/** ms from an ISO string (or a number), or 0. */
export function msOf(v) {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : 0;
  const n = Date.parse(String(v ?? ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** @type {Map<string, Intl.DateTimeFormat>} */
const FMT = new Map();
function fmt(locale, opts) {
  const k = `${locale ?? ""}|${JSON.stringify(opts)}`;
  let f = FMT.get(k);
  if (!f) {
    try { f = new Intl.DateTimeFormat(locale, opts); } catch { f = new Intl.DateTimeFormat(undefined, { ...opts, timeZone: undefined }); }
    FMT.set(k, f);
  }
  return f;
}

/**
 * The wall-clock parts of `ms` in `timeZone` (undefined = this browser's): { y, mo (1–12), d, h (0–23), mi, s }.
 * @param {number} ms @param {string} [timeZone]
 */
export function localParts(ms, timeZone) {
  const parts = fmt("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(new Date(ms));
  const g = type => Number(parts.find(p => p.type === type)?.value ?? 0);
  return { y: g("year"), mo: g("month"), d: g("day"), h: g("hour") % 24, mi: g("minute"), s: g("second") };
}
/** "YYYY-MM-DD" of `ms` in `timeZone`. */
export function dayKey(ms, timeZone) {
  const p = localParts(ms, timeZone); const z = n => String(n).padStart(2, "0");
  return `${p.y}-${z(p.mo)}-${z(p.d)}`;
}
/** The UTC offset of `timeZone` at `ms`, in ms (local = UTC + offset). */
export function offsetAt(ms, timeZone) {
  const p = localParts(ms, timeZone);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}
/**
 * The instant a local wall-clock time names in `timeZone` (month 1–12). A time skipped by a DST jump lands just after the jump; a
 * time that happens twice (clocks going back) is the first one.
 */
export function localToMs(y, mo, d, h, mi, timeZone, s = 0) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const same = t => { const p = localParts(t, timeZone); return p.y === y && p.mo === mo && p.d === d && p.h === h && p.mi === mi; };
  const ms1 = guess - offsetAt(guess, timeZone);
  const ms2 = guess - offsetAt(ms1, timeZone);
  // In a DST gap neither matches: the later reading is the wall time pushed past the jump.
  let ms = same(ms2) ? ms2 : same(ms1) ? ms1 : Math.max(ms1, ms2);
  // Clocks going back: the earlier of two matches (one hour before) if it shows the same wall time.
  if (same(ms - 3600000)) ms -= 3600000;
  return ms;
}

/** @typedef {{ locale?: string, timeZone?: string }} Where */
/** "Sat 14 Mar" in the viewer's language (`locale`) and time zone. @param {number} ms @param {Where} [o] */
export function dayLabel(ms, { locale, timeZone } = {}) {
  const parts = fmt(locale, { timeZone, weekday: "short", day: "numeric", month: "short" }).formatToParts(new Date(ms));
  const g = type => parts.find(p => p.type === type)?.value ?? "";
  return `${g("weekday")} ${g("day")} ${g("month")}`.trim();
}
/** "7:00 PM" (or "19:00", by locale). @param {number} ms @param {Where} [o] */
export const timeLabel = (ms, { locale, timeZone } = {}) => fmt(locale, { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(ms));

/**
 * The session's time span: "Sat 14 Mar, 7:00 PM – Sun 15 Mar, 1:30 AM"; one date when it ends the day it started ("Sat 14 Mar,
 * 7:00 PM – 11:00 PM"); "Sat 14 Mar, 7:00 PM –" while open (no end). "" without a start.
 * @param {number} start @param {number} [end]
 * @param {{ locale?: string, timeZone?: string }} [opts]
 */
export function rangeText(start, end = 0, opts = {}) {
  const a = msOf(start); if (!a) return "";
  const from = `${dayLabel(a, opts)}, ${timeLabel(a, opts)}`;
  const b = msOf(end); if (!b) return `${from} –`;
  const same = dayKey(a, opts.timeZone) === dayKey(b, opts.timeZone);
  return `${from} – ${same ? "" : `${dayLabel(b, opts)}, `}${timeLabel(b, opts)}`;
}

/** Whether `ms` falls on a different local day than the session's start (so its row shows a date). */
export const otherDay = (ms, start, timeZone) => !!msOf(ms) && !!msOf(start) && dayKey(ms, timeZone) !== dayKey(start, timeZone);
/** Whether a time window [start, end] spans more than one local day. */
export const crossesMidnight = (start, end, timeZone) => !!msOf(start) && !!msOf(end) && dayKey(start, timeZone) !== dayKey(end, timeZone);

/** Elapsed ms between two timestamps (never negative; 0 when either is missing). */
export const elapsedMs = (start, now) => (msOf(start) && msOf(now) ? Math.max(0, msOf(now) - msOf(start)) : 0);
/** "1:05" (hours:minutes) or "0:07" for an elapsed time in ms; long sessions keep counting hours ("26:10"). */
export function clockText(ms) {
  const m = Math.floor(Math.max(0, Number(ms) || 0) / 60000);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * The break reminder (0.6.0): which reminder is due now. `every` minutes (0 or less = never), `shown` = the last reminder number
 * already shown this session on this client (0 = none). Returns the reminder number to show (1, 2, …) or 0. Several missed at once
 * (the tab slept) give only the latest.
 */
export function breakDue(start, now, every, shown = 0) {
  const min = Number(every); const e = elapsedMs(start, now);
  if (!(min > 0) || !e) return 0;
  const n = Math.floor(e / (min * 60000));
  return n > (Number(shown) || 0) ? n : 0;
}

/**
 * A clock reading "19:30", "7:30 PM", "7:30 p.m.", "07:30:15" → { h (0–23), mi }, or null.
 * @param {unknown} text
 */
export function parseClock(text) {
  const m = /(\d{1,2})[:.h](\d{2})(?::\d{2})?\s*([ap])?\.?\s*m?\.?/i.exec(String(text ?? "").trim());
  if (!m) return null;
  let h = Number(m[1]); const mi = Number(m[2]);
  if (mi > 59 || h > 23) return null;
  if (m[3]) { if (h > 12 || h === 0) return null; const pm = m[3].toLowerCase() === "p"; h = (h % 12) + (pm ? 12 : 0); }
  return { h, mi };
}

/**
 * Fills in a full time for events stored before 0.6.0 without one (pure). Events with a usable `t` or `at` keep it (and get `at` if
 * missing). Others take the session's start date plus their clock reading (`rtText`), rolling on to the next day each time the clock
 * goes backwards; with no reading they take the previous event's time (or the start). `timeZone`: the zone the clock readings were
 * written in (undefined = this browser's: the GM tab that migrates). Returns new event objects; the input is not changed.
 * @param {any[]} events @param {number} startedAt @param {{ timeZone?: string }} [opts]
 */
export function migrateTimes(events = [], startedAt = 0, { timeZone } = {}) {
  const start = msOf(startedAt);
  let day = start ? localParts(start, timeZone) : null;
  let prev = start;
  let prevClock = day ? day.h * 60 + day.mi : -1;
  return (Array.isArray(events) ? events : []).map(e => {
    if (!e || typeof e !== "object") return e;
    const known = msOf(e.t) || msOf(e.at);
    if (known) {
      prev = known; if (start) { const p = localParts(known, timeZone); day = p; prevClock = p.h * 60 + p.mi; }
      return { ...e, t: known, at: isoOf(known) };
    }
    const c = parseClock(e.rtText);
    if (!c || !day) { const t = prev || 0; return { ...e, t, at: isoOf(t), migrated: true }; }
    const clock = c.h * 60 + c.mi;
    let base = day;
    if (prevClock >= 0 && clock < prevClock) {
      // The clock went backwards: the next day (noon avoids DST edges when stepping a day).
      const noon = localToMs(day.y, day.mo, day.d, 12, 0, timeZone) + 86400000;
      base = localParts(noon, timeZone);
    }
    const t = localToMs(base.y, base.mo, base.d, c.h, c.mi, timeZone);
    day = base; prevClock = clock; prev = t;
    return { ...e, t, at: isoOf(t), migrated: true };
  });
}

/**
 * Events between two timestamps (inclusive), by their `t`; `end` 0 = still open (up to `now`). The "this session" window.
 * @param {any[]} list @param {number} start @param {number} end @param {(x: any) => number} [timeOf]
 */
export function inWindow(list = [], start = 0, end = 0, timeOf = x => msOf(x?.t ?? x?.at), now = Date.now()) {
  const a = msOf(start); const b = msOf(end) || now;
  if (!a) return [];
  return (Array.isArray(list) ? list : []).filter(x => { const t = timeOf(x); return t >= a && t <= b; });
}
