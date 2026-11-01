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
  leaderChanged: `${ID}.leaderChanged`,
  /** 0.6.0: show the "Previously on…" card ({ recap: journal id }; ids only). */
  previouslyOn: `${ID}.previouslyOn`
};
/** The companion module whose quests, flights, travel and loot rolls the session log can read (optional). */
export const TOOLKIT_ID = "wayfarers-toolkit";
/** Monk's Active Tiles, read (never written) by the scene check. */
export const MATT_ID = "monks-active-tiles";

/** Text helpers come from wanderers-core (one copy for every module). */
export { esc, plain, plural } from "../vendor/wanderers-core/index.mjs";
