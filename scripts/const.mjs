/**
 * The module id lives here and only here. Every other file imports ID (and the derived names) from this one, so renaming the module
 * before its first release means changing this constant plus "id"/"title"/URLs in module.json. No Foundry calls at import time.
 */
export const ID = "red-book";
/** The module socket channel (module.json has "socket": true). */
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
/** Monk's Active Tiles, read (never written) by the scene check. */
export const MATT_ID = "monks-active-tiles";

export const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Plain text from a bit of HTML (tags dropped, the common entities decoded). */
export const plain = s => String(s ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
