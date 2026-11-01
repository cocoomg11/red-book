/** Debug logging: prints only when the world setting "Debug logging" is on. */
import { ID } from "./const.mjs";

export function debugOn() { try { return !!game.settings.get(ID, "debugLog"); } catch { return false; } }
export function log(...args) { if (debugOn()) console.log(`${ID} [debug] |`, ...args); }
export const warn = (...args) => console.warn(`${ID} |`, ...args);
