/**
 * The GM-only store journal (see store-model.mjs), on core's `createStore` (0.7.0): one JournalEntry with default ownership None and
 * `flags.red-book.store`, found by that data flag (no marker flag, `entryFlag: null`), exactly as before. Read only on GM clients;
 * written by GM clicks (board pins, prep list) and, once, by the leader's migration of the old `boardPins` world setting. The leader
 * files a root-level entry into the shared "Module data" folder once (`file()`, marks `flags.red-book.dataFolderFiled`).
 * This file stays the single place that knows where the store lives. Untested in Node: needs a live world.
 */
import { createStore } from "../vendor/wanderers-core/foundry/index.mjs";
import { ID } from "./const.mjs";
import * as M from "./store-model.mjs";
import { L, get, set, log, warn } from "./core.mjs";

export const Store = createStore(ID, { ...M.STORE_OPTIONS, log: { warn }, isWriter: () => L.isLeader() });

/** The store journal, or null (GM clients only: players never look for it). */
export function entry() { return Store.entry(); }
/** The store's data (GM clients), or the empty store. */
export function read() { return Store.read(); }
/** Writes the whole store (GM only), making the journal the first time. */
export function write(data) { return Store.update(() => data); }
/** The leader, at ready: files a root-level store entry into "Module data" once. Never throws. */
export function file() { return Store.file(); }
/** Health-line facts (`exists`, `playersCanSee`, …). */
export function status() { return Store.status(); }
/** Cleanup: deletes the store entry (every copy) and the "Module data" folder when empty. */
export function remove() { return Store.remove(); }

/** One-time, on the leader: moves the `boardPins` world setting into the store and resets the setting. */
export async function migrate() {
  if (!L.isLeader()) return;
  try {
    const r = M.migratePins(entry()?.flags?.[ID]?.store, get("boardPins"));
    if (r.store) { await write(r.store); log(`board pins moved to the GM-only store (${r.moved})`); }
    if (r.clearSetting) await set("boardPins", { v: 1, pins: [] });
  } catch (e) { warn("moving the board pins to the GM-only store failed (they stay in the old setting; try reloading)", e); }
}
