/**
 * One-time carry-over from the companion toolkit (pure; tested in Node). Session Start and Who's online moved from the toolkit to
 * Red Book; on the first GM load (leader only) Red Book copies the toolkit's world settings for those features and its Hub scene flag
 * into its own, without changing or deleting anything of the toolkit's. The record `red-book.migrations` (`{ v, toolkit: ms }`)
 * makes it run once.
 *
 *   toolkit setting                 → Red Book setting
 *   wayfarers-toolkit.onlineCount   → red-book.onlineCount
 *   wayfarers-toolkit.onlineList    → red-book.onlineList
 *   wayfarers-toolkit.onlinePosition→ red-book.onlinePosition
 *   wayfarers-toolkit.onlineDrag    → red-book.onlineDrag
 *   wayfarers-toolkit.hiddenScenes  → red-book.hiddenScenes
 *   wayfarers-toolkit.onlineHudPos (client) → red-book.onlineHudPos (client; per browser, see clientCarry)
 *   scene flags.wayfarers-toolkit.hub → scene flags.red-book.hubScene
 */
import { versioned } from "../vendor/wanderers-core/index.mjs";
import { COUNTS, POSITIONS } from "./online-model.mjs";

export const TOOLKIT_NS = "wayfarers-toolkit";
export const MIGRATIONS_VERSION = 1;

/** toolkit key → { key: Red Book key, ok: value check } (world settings). */
export const SETTING_MAP = {
  onlineCount: { key: "onlineCount", ok: v => typeof v === "string" && Object.hasOwn(COUNTS, v) },
  onlineList: { key: "onlineList", ok: v => typeof v === "string" && v.length <= 2000 },
  onlinePosition: { key: "onlinePosition", ok: v => typeof v === "string" && Object.hasOwn(POSITIONS, v) },
  onlineDrag: { key: "onlineDrag", ok: v => typeof v === "boolean" },
  hiddenScenes: { key: "hiddenScenes", ok: v => typeof v === "string" && v.length <= 4000 }
};
export const TOOLKIT_HUB_FLAG = "hub";
export const HUB_FLAG = "hubScene";

export const normalizeMigrations = versioned({
  version: MIGRATIONS_VERSION,
  empty: () => ({ v: MIGRATIONS_VERSION }),
  upgrades: { 0: old => ({ ...old }) },
  clean: m => ({ v: MIGRATIONS_VERSION, ...(Number.isFinite(Number(m?.toolkit)) && Number(m?.toolkit) > 0 ? { toolkit: Number(m.toolkit) } : {}) })
});

/** A stored setting string (Foundry keeps world and client settings as JSON text) read back, or undefined. */
export function readStored(raw) {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") return raw;
  try { return JSON.parse(raw); } catch { return undefined; }
}

/**
 * What to carry over. `toolkit`: { key: stored raw value | undefined } for the SETTING_MAP keys (only values the toolkit actually
 * stored, never its defaults); `ours`: { key: true } for Red Book settings already stored (those are kept: the GM set them here);
 * `scenes`: [{ id, toolkitHub, hub }] where `hub` is our flag's value or undefined. Returns { settings: { ourKey: value },
 * scenes: [ids to mark Hub], skipped: [toolkit keys with unusable values] }.
 */
export function planToolkitMigration({ toolkit = {}, ours = {}, scenes = [] } = {}) {
  const settings = {}; const skipped = [];
  for (const [tk, m] of Object.entries(SETTING_MAP)) {
    const v = readStored(toolkit[tk]);
    if (v === undefined) continue;
    if (!m.ok(v)) { skipped.push(tk); continue; }
    if (ours[m.key]) continue;
    settings[m.key] = v;
  }
  const hubs = scenes.filter(s => s && s.toolkitHub && (s.hub === undefined || s.hub === null)).map(s => String(s.id));
  return { settings, scenes: hubs, skipped };
}

/** A saved panel position (client setting), carried over only when Red Book has none on this browser. */
export function clientCarry(toolkitRaw, oursRaw) {
  const ours = readStored(oursRaw);
  if (ours && typeof ours === "object" && Number.isFinite(+ours.left)) return null;
  const v = readStored(toolkitRaw);
  return v && typeof v === "object" && Number.isFinite(+v.left) && Number.isFinite(+v.top) ? { left: +v.left, top: +v.top } : null;
}
