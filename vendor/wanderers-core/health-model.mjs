/**
 * The read-only health check, pure (tested in Node). Every module returns the same report shape, so a hub can show them together:
 *   [{ title, lines: [{ level: "ok" | "warn" | "bad" | "off" | "info", text }] }]   (text is plain text)
 * Checks are added through a collector that wraps each one: a check that throws becomes one "warn" line and never stops the others,
 * and nothing in a check may change the world.
 */
import { plain } from "./text.mjs";

/** @typedef {"ok" | "warn" | "bad" | "off" | "info"} Level */
/** @typedef {{ level: Level, text: string }} HealthLine */
/** @typedef {{ title: string, lines: HealthLine[] }} HealthSection */

export const LEVELS = /** @type {const} */ (["ok", "warn", "bad", "off", "info"]);
/** @type {Record<string, Level>} */
const ALIAS = { error: "bad", fail: "bad", failed: "bad", warning: "warn", good: "ok", pass: "ok", disabled: "off", note: "info" };

/**
 * A level name read leniently ("error" → "bad"); anything unknown is "info".
 * @param {unknown} l
 * @returns {Level}
 */
export function level(l) {
  const s = String(l ?? "").toLowerCase();
  return /** @type {readonly string[]} */ (LEVELS).includes(s) ? /** @type {Level} */ (s) : ALIAS[s] ?? "info";
}

/**
 * @typedef {object} HealthCollector
 * @property {(level: Level, text: string) => void} add a line in the current section
 * @property {(title: string) => void} section starts a new section
 * @property {(fn: (add: (level: Level, text: string) => void) => void) => void} check runs one check, wrapped
 * @property {(title: string, fn: (add: (level: Level, text: string) => void) => (void | Promise<void>)) => Promise<void>} checkAsync
 *   runs one async check in its own section, wrapped and time-limited
 * @property {() => HealthSection[]} report the sections so far (empty sections dropped)
 */

/**
 * A collector for one module's report.
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {HealthCollector}
 */
export function healthCollector({ timeoutMs = 5000 } = {}) {
  /** @type {HealthSection[]} */
  const sections = [{ title: "", lines: [] }];
  const cur = () => sections[sections.length - 1];
  const add = (/** @type {Level} */ l, /** @type {string} */ text) => { const t = plain(text); if (t) cur().lines.push({ level: level(l), text: t }); };
  const failed = (/** @type {unknown} */ e) => add("warn", `A check failed to run: ${plain(/** @type {any} */ (e)?.message ?? e)}`);
  return {
    add,
    section(title) { sections.push({ title: plain(title), lines: [] }); },
    check(fn) { try { fn(add); } catch (e) { failed(e); } },
    async checkAsync(title, fn) {
      this.section(title);
      /** @type {ReturnType<typeof setTimeout> | undefined} */
      let timer;
      const limit = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`no answer within ${Math.round(timeoutMs / 1000)} s`)), timeoutMs); });
      try { await Promise.race([Promise.resolve().then(() => fn(add)), limit]); } catch (e) { failed(e); } finally { clearTimeout(timer); }
    },
    report() { return sections.filter(s => s.lines.length).map(s => ({ title: s.title, lines: [...s.lines] })); }
  };
}

/**
 * The worst level in a report: "bad" > "warn" > "ok" > "info"/"off".
 * @param {HealthSection[]} report
 * @returns {Level}
 */
export function worst(report) {
  const all = report.flatMap(s => s.lines.map(l => l.level));
  return all.includes("bad") ? "bad" : all.includes("warn") ? "warn" : all.includes("ok") ? "ok" : "info";
}

/**
 * Counts per level.
 * @param {HealthSection[]} report
 * @returns {Record<Level, number>}
 */
export function counts(report) {
  /** @type {Record<Level, number>} */
  const c = { ok: 0, warn: 0, bad: 0, off: 0, info: 0 };
  for (const s of report) for (const l of s.lines) c[l.level] += 1;
  return c;
}
