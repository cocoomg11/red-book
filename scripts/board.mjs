/**
 * Next-session board (feature "prepBoard"): the Board page of the Red Book window (0.4.0: three columns, markup in view.mjs). Active quests with their next objectives (from the companion toolkit when
 * it is active, else none), the NPCs, journals and scenes those quests link to, the open threads and summary of the latest session,
 * and a Pinned list the GM drops documents onto (capped, versioned). The pins live in the GM-only store journal (store.mjs), not in
 * a world setting, so players never receive them. Read-only apart from the pins.
 */
import { ID, TOOLKIT_ID } from "./const.mjs";
import * as B from "./board-model.mjs";
import { gateApi } from "./check-model.mjs";
import { openThreads } from "./session-model.mjs";
import { F, get, set } from "./core.mjs";
import * as UI from "./ui.mjs";
import * as Panel from "./panel.mjs";
import * as Store from "./store.mjs";
import { migratePins } from "./store-model.mjs";

/** The pins (GM). Before the one-time move has run, the old setting's pins are shown merged in, so nothing seems lost. */
export function pinStore() {
  const s = Store.read();
  return s.migrated.boardPins ? s.pins : (migratePins(s, get("boardPins")).store?.pins ?? s.pins);
}
async function savePins(pins) {
  const s = Store.read();
  const m = s.migrated.boardPins ? s : (migratePins(s, get("boardPins")).store ?? s);
  await Store.write({ ...m, pins });
  if (!s.migrated.boardPins && B.normalizePins(get("boardPins")).pins.length) await set("boardPins", { v: 1, pins: [] });
}
/** For the health check. */
export function store() {
  const j = Store.entry(); if (!j) return { ok: true, text: "Board pins: none yet (the GM-only store journal is made with the first pin)." };
  const open = Number(j.ownership?.default ?? 0) > 0 || Object.entries(j.ownership ?? {}).some(([u, l]) => u !== "default" && Number(l) > 0 && !game.users.get(u)?.isGM);
  return open ? { ok: false, text: `The "${j.name}" journal is visible to players: set its ownership back to None.` } : { ok: true, text: `Board pins: ${pinStore().pins.length}, kept in a GM-only journal.` };
}
let deps = { session: null, check: null };
export function init(d) { deps = { ...deps, ...d }; }

/** The quest adapter: the toolkit's API when it is active, else its quest flags, else nothing. */
export function questSource() {
  const tk = game.modules.get(TOOLKIT_ID);
  if (!tk?.active) return [];
  try {
    const list = tk.api?.quests?.list?.();
    if (Array.isArray(list)) return list.map(q => ({ ...q, uuid: `JournalEntry.${q.id}` }));
  } catch { }
  return game.journal.filter(j => j.flags?.[TOOLKIT_ID]?.quest).map(j => ({ id: j.id, name: j.name, uuid: j.uuid, ...j.flags[TOOLKIT_ID].quest }));
}

export function model() {
  const quests = B.activeQuests(questSource(), { nextCount: Number(get("boardNext")) || 3 });
  const links = B.groupLinks(quests);
  const S = F.on("sessionLog") ? deps.session : null;
  const last = S?.latest?.() ?? null;
  const data = last ? S.dataOf(last) : null;
  return { quests, links, last: last ? { id: last.id, uuid: last.uuid, name: last.name, open: data.open, summary: data.summary, threads: openThreads(data) } : null, pins: pinStore().pins, toolkit: !!game.modules.get(TOOLKIT_ID)?.active };
}

/** Adds the document dropped on the Pinned list (a drop event). Resolves true when a pin was added. */
export async function dropPin(ev) {
  if (!game.user?.isGM) return false;
  let d = null; try { d = UI.TextEditorImpl().getDragEventData(ev); } catch { }
  const uuid = d?.uuid; if (!uuid) return false;
  const doc = UI.safeSync(uuid);
  const r = B.addPin(pinStore(), { uuid, type: d.type ?? doc?.documentName, name: doc?.name ?? "" });
  if (!r.added) { ui.notifications.warn(`Red Book: ${r.why}.`); return false; }
  await savePins({ v: r.v, pins: r.pins });
  return true;
}
/** Removes a pin (GM). */
export const unpin = async uuid => savePins(B.removePin(pinStore(), uuid));
/** The pins list (GM). */
export const pins = () => pinStore().pins;

/** Re-renders the Red Book window's Board page soon (a no-op when it isn't showing). */
export function refresh() { Panel.refresh("board"); }

/** Opens the Red Book window on the Board page (GM). */
export function open() { return Panel.open("board"); }

/** Ready hook (feature on): refresh on the few hooks that can change what it shows. */
export function ready() {
  const j = (doc, changes) => { if (doc.flags?.[TOOLKIT_ID]?.quest || doc.flags?.[ID]?.session || changes?.flags) refresh(); };
  Hooks.on("updateJournalEntry", j); Hooks.on("createJournalEntry", j); Hooks.on("deleteJournalEntry", () => refresh());
  for (const h of ["deleteActor", "deleteScene", "updateScene", "updateActor"]) Hooks.on(h, (doc, changes) => { if ((h.startsWith("delete") || (changes && "name" in changes))) refresh(); });
  Hooks.on(`${ID}.sessionEnded`, refresh); Hooks.on(`${ID}.sessionStarted`, refresh);
  Hooks.on("updateJournalEntry", doc => { if (doc.flags?.[ID]?.store) refresh(); });
}

const apiRaw = { open, model, refresh, pins,
  pin: async uuid => { const d = UI.safeSync(uuid); const r = B.addPin(pinStore(), { uuid, type: d?.documentName, name: d?.name }); if (r.added) await savePins({ v: r.v, pins: r.pins }); return r.added; },
  unpin };
/** The board is GM only: for other users every member warns "GM only" and returns undefined. */
export const api = gateApi(apiRaw, () => !!game.user?.isGM, () => ui.notifications.warn("Red Book: GM only."));
