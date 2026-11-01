/**
 * The GM-only store journal (see store-model.mjs): one JournalEntry with default ownership None and `flags.red-book.store`. Read
 * only on GM clients; written by GM clicks (board pins) and, once, by the leader's migration of the old `boardPins` world setting.
 * Untested in Node: needs a live world.
 */
import { ID } from "./const.mjs";
import * as M from "./store-model.mjs";
import { L, get, set, log, warn } from "./core.mjs";

const isStore = j => !!j?.flags?.[ID]?.store;
/** The store journal, or null (GM clients only: players never look for it). */
export function entry() { if (!game.user?.isGM) return null; return game.journal.find(isStore) ?? null; }
/** The store's data (GM clients), or the empty store. */
export function read() { return M.normalizeStore(entry()?.flags?.[ID]?.store); }

let creating = null;
/** Writes the store (GM only), making the journal the first time. */
export async function write(data) {
  if (!game.user?.isGM) throw new Error("Red Book: GM only.");
  const clean = M.normalizeStore(data);
  const j = entry();
  if (j) return j.update({ [`flags.${ID}.store`]: clean });
  if (creating) { await creating; return write(data); }
  creating = JournalEntry.create({
    name: M.STORE_NAME, ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
    flags: { [ID]: { store: clean } },
    pages: [{ name: "About", type: "text", text: { content: "<p>Red Book keeps GM-only data (the next-session board's pins) on this entry. Leave it GM only. Remove Red Book data deletes it.</p>" } }]
  });
  try { return await creating; } finally { creating = null; }
}

/** One-time, on the leader: moves the `boardPins` world setting into the store and resets the setting. */
export async function migrate() {
  if (!L.isLeader()) return;
  try {
    const r = M.migratePins(entry()?.flags?.[ID]?.store, get("boardPins"));
    if (r.store) { await write(r.store); log(`board pins moved to the GM-only store (${r.moved})`); }
    if (r.clearSetting) await set("boardPins", { v: 1, pins: [] });
  } catch (e) { warn("moving the board pins to the GM-only store failed (they stay in the old setting; try reloading)", e); }
}
