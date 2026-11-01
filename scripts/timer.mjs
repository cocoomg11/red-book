/**
 * Session timer and break reminder (feature "sessionTimer"). Every GM client: elements marked `data-rb-clock="<start ms>"` (the
 * Session page's stat tile and live banner) are updated every 20 s from the timestamp, without re-rendering; the break reminder (setting
 * `breakReminder`, off by default, every `breakEvery` minutes) is a GM-only notification on this client (players never see it).
 * Remembered per session for this tab only. Untested in Node: the rules are time-model breakDue / clockText.
 */
import { F, get } from "./core.mjs";
import { breakDue, clockText, elapsedMs } from "./time-model.mjs";
import { t } from "./i18n.mjs";

/** @type {any} */ let deps = {};
export function init(d) { deps = d; }
const shown = { session: "", n: 0 };

function tick() {
  const now = Date.now();
  for (const el of document.querySelectorAll("[data-rb-clock]")) {
    const start = Number(/** @type {HTMLElement} */ (el).dataset.rbClock);
    el.textContent = clockText(elapsedMs(start, now));
  }
  const j = deps.session?.openEntry?.(); if (!j) { shown.session = ""; shown.n = 0; return; }
  const s = deps.session.dataOf(j);
  if (shown.session !== j.id) { shown.session = j.id; shown.n = breakDue(s.startedAt, now, Number(get("breakEvery")) || 90, 0); }
  if (get("breakReminder") !== true) return;
  const n = breakDue(s.startedAt, now, Number(get("breakEvery")) || 90, shown.n);
  if (!n) return;
  shown.n = n;
  ui.notifications.info(`Red Book: ${t("Timer.break", { time: clockText(elapsedMs(s.startedAt, now)) })}`, { permanent: true });
}

/** Ready (GM clients, feature on). */
export function ready() {
  if (!game.user?.isGM || !F.on("sessionTimer")) return;
  setInterval(tick, 20000);
  setTimeout(tick, 1000);
}
