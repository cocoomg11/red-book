/**
 * "Previously on…" card (0.6.0, feature "previously"), the pure part (tested in Node). At Session Start (and when the GM clicks Show)
 * players see the last shared recap as a title card. Only the recap journal is read (the player copy made by Share as recap: secret
 * blocks, GM-only notes and unticked lines already left out), and only by clients that can observe it. Each browser remembers the
 * recap it has seen (client setting `previouslySeen`, `{ v: 1, key }`), so a reload doesn't show it again; the GM's Show again sends
 * `force` to show it anyway.
 */
import { esc } from "./const.mjs";

/** The seen key of a recap: its id and when it last changed (a re-shared recap is new again). */
export const seenKey = (id, modified = 0) => (id ? `${id}:${Math.floor(Number(modified) || 0)}` : "");
/** The stored record read back. */
export function normalizeSeen(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  return { v: 1, key: typeof r.key === "string" ? r.key.slice(0, 120) : "" };
}
/**
 * Whether this client shows the card. `p`: { isGM, preview (the GM's own preview), force, canSee (observer of the recap), key,
 * seen (stored key) }. GMs see it only as a preview; players once per recap unless forced.
 */
export function shouldShow({ isGM = false, preview = false, force = false, canSee = false, key = "", seen = "" } = {}) {
  if (!key || !canSee) return false;
  if (preview) return !!isGM;
  if (isGM) return false;
  return force || key !== seen;
}
/**
 * The card's body (trusted wrapper; `html` is the recap page's enriched text, already player-safe). `L`: { title, sub, preview,
 * empty }.
 * @param {{ name?: string, range?: string, html?: string, preview?: boolean }} m @param {Record<string, string>} L
 */
export function cardHTML(m, L) {
  const body = String(m.html ?? "").trim();
  return `<div class="rb-prev">${m.preview ? `<p class="rb-prev-preview">${esc(L.preview)}</p>` : ""}<header class="rb-prev-head"><p class="rb-prev-kicker">${esc(L.title)}</p>`
    + `<h2 class="rb-prev-title">${esc(m.name ?? "")}</h2>${m.range ? `<p class="rb-prev-sub">${esc(m.range)}</p>` : ""}</header>`
    + `<div class="rb-prev-body">${body || `<p>${esc(L.empty)}</p>`}</div></div>`;
}
/** The session name a recap journal is named after ("Recap: Session 3 — …" → "Session 3 — …"). */
export const recapTitle = (name = "") => String(name ?? "").replace(/^Recap:\s*/i, "");
