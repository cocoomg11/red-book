/**
 * The module id lives here and only here. Every other file imports ID (and the derived names) from this one, so renaming the module
 * before its first release means changing this constant plus "id"/"title"/URLs in module.json. No Foundry calls at import time.
 */
export const ID = "red-book";
/** The module socket channel (module.json has "socket": true); wanderers-core's createLeader uses it. */
export const SOCKET = `module.${ID}`;
/** Hook names other modules can listen to (see README, Public API and hooks). */
export const HOOKS = {
  sessionStarted: `${ID}.sessionStarted`,
  sessionEnded: `${ID}.sessionEnded`,
  eventLogged: `${ID}.eventLogged`,
  recapShared: `${ID}.recapShared`,
  leaderChanged: `${ID}.leaderChanged`
};
/** The companion module whose quests, flights, travel and loot rolls the session log can read (optional). */
export const TOOLKIT_ID = "wayfarers-toolkit";
/** The toolkit's display name as the installed module spells it (it was renamed in 1.27.2), else this fallback. */
export const TOOLKIT_TITLE = "Wanderer's Toolkit";
/** @param {any} [g] the Foundry `game` (default: the global one) */
export function toolkitTitle(g = /** @type {any} */ (globalThis).game) {
  try { const t = g?.modules?.get?.(TOOLKIT_ID)?.title; return typeof t === "string" && t.trim() ? t.trim() : TOOLKIT_TITLE; } catch { return TOOLKIT_TITLE; }
}
/** The health line about the toolkit. @param {boolean} on @param {string} [title] */
export function toolkitHealthText(on, title = TOOLKIT_TITLE) {
  return on ? `${title} is active: quests, travel, flights and loot rolls are logged and quests feed the board.` : `${title} isn't active: the board shows no quests and its events aren't logged.`;
}
/** Monk's Active Tiles, read (never written) by the scene check. */
export const MATT_ID = "monks-active-tiles";

/** Text helpers come from wanderers-core (one copy for every module). */
export { esc, plain, plural } from "../vendor/wanderers-core/index.mjs";
