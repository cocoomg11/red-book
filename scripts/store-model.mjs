/**
 * Red Book's GM-only store (pure; tested in Node). Data that only the GM should read lives in `flags.red-book.store` on one journal
 * entry whose default ownership is None, instead of in a world setting (every client receives every world setting). Today it holds
 * the next-session board's pins; `migrated` records the one-time move of the old `boardPins` world setting.
 *
 * Shape (STORE_VERSION 1): { v: 1, pins: { v, pins: [...] } (board-model normalizePins), migrated: { boardPins?: number (ms) } }.
 */
import { versioned } from "../vendor/wanderers-core/index.mjs";
import { normalizePins } from "./board-model.mjs";

export const STORE_VERSION = 1;
/** Name of the store journal (GM only; found by its flag, not its name). */
export const STORE_NAME = "Red Book data (GM only)";

export const normalizeStore = versioned({
  version: STORE_VERSION,
  empty: () => ({ v: STORE_VERSION, pins: normalizePins(null), migrated: {} }),
  // v0: anything stored before the version field existed is read as the same fields, unchecked.
  upgrades: { 0: old => ({ ...old }) },
  clean: s => ({
    v: STORE_VERSION,
    pins: normalizePins(s?.pins),
    migrated: Object.fromEntries(Object.entries(s?.migrated && typeof s.migrated === "object" ? s.migrated : {}).filter(([, t]) => Number.isFinite(Number(t))).map(([k, t]) => [k, Number(t)]))
  })
});

/**
 * The one-time move of the `boardPins` world setting into the store. Returns { store, clearSetting, moved }: `store` the store to
 * write (or null when nothing changes), `clearSetting` whether the old setting should be reset to its default (it is reset even when
 * the store already has pins, so the setting stops carrying them to players), `moved` how many pins came over. Pins already in the
 * store come first; a repeat uuid is kept once.
 */
export function migratePins(rawStore, settingValue, now = Date.now()) {
  const store = normalizeStore(rawStore);
  const old = normalizePins(settingValue).pins;
  if (store.migrated.boardPins) return { store: null, clearSetting: old.length > 0, moved: 0 };
  const have = new Set(store.pins.pins.map(p => p.uuid));
  const add = old.filter(p => !have.has(p.uuid));
  const pins = normalizePins({ pins: [...store.pins.pins, ...add] });
  return { store: { ...store, pins, migrated: { ...store.migrated, boardPins: now } }, clearSetting: old.length > 0, moved: add.length };
}
