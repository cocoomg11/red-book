/**
 * Red Book's GM-only store (pure; tested in Node). Data that only the GM should read lives in `flags.red-book.store` on one journal
 * entry whose default ownership is None, instead of in a world setting (every client receives every world setting). Today it holds
 * the next-session board's pins; `migrated` records the one-time move of the old `boardPins` world setting.
 *
 * Shape (STORE_VERSION 1): { v: 1, pins: { v, pins: [...] } (board-model normalizePins), migrated: { boardPins?: number (ms) },
 * todos: [...] (0.5.0, board-model normalizeTodos: scene-check findings sent to the board; an older store reads as an empty list) }.
 */
import { versioned } from "../vendor/wanderers-core/index.mjs";
import { normalizePins, normalizeTodos } from "./board-model.mjs";

export const STORE_VERSION = 1;
/** Name of the store journal (GM only; found by its flag, not its name). */
export const STORE_NAME = "Red Book data (GM only)";
/** Text of the store journal's "About" page (core escapes it). */
export const STORE_ABOUT = "Red Book keeps GM-only data (the next-session board's pins and the prep list) on this entry. Leave it GM only. Remove Red Book data deletes it.";

export const normalizeStore = versioned({
  version: STORE_VERSION,
  empty: () => ({ v: STORE_VERSION, pins: normalizePins(null), migrated: {}, todos: [] }),
  // v0: anything stored before the version field existed is read as the same fields, unchecked.
  upgrades: { 0: old => ({ ...old }) },
  clean: s => ({
    v: STORE_VERSION,
    pins: normalizePins(s?.pins),
    todos: normalizeTodos(s?.todos),
    migrated: Object.fromEntries(Object.entries(s?.migrated && typeof s.migrated === "object" ? s.migrated : {}).filter(([, t]) => Number.isFinite(Number(t))).map(([k, t]) => [k, Number(t)]))
  })
});

/**
 * The options for core's `createStore` (0.7.0; store.mjs adds `log` and `isWriter`). No marker flag (`entryFlag: null`): the entry is
 * found by its data flag `flags.red-book.store`, exactly as before 0.7.0, so an existing store is kept as it is.
 */
export const STORE_OPTIONS = Object.freeze({ name: STORE_NAME, flagKey: "store", entryFlag: null, normalize: normalizeStore, about: STORE_ABOUT });

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
