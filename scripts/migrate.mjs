/**
 * One-time GM-load work (leader only; see migrate-model.mjs for what moves where): carry over the companion toolkit's Session Start
 * and Who's online settings and Hub scene flags, and move the board pins into the GM-only store. Reads the toolkit's stored values
 * straight from Foundry's settings storage, so it works whether or not the toolkit is active; never writes toolkit data.
 * Untested in Node: needs a live world.
 */
import { ID } from "./const.mjs";
import * as M from "./migrate-model.mjs";
import { L, get, set, log, warn } from "./core.mjs";
import * as Store from "./store.mjs";

const storage = scope => { try { return game.settings.storage.get(scope); } catch { return null; } };
/** The raw stored value of a world setting, or undefined when it was never set (Setting documents hold JSON text). */
function storedWorld(ns, key) {
  try {
    const s = storage("world"); const k = `${ns}.${key}`;
    if (typeof s?.getSetting === "function") { const doc = s.getSetting(k); return doc ? (doc._source?.value ?? doc.value) : undefined; }
    return s?.getItem?.(k) ?? undefined;
  } catch { return undefined; }
}

async function toolkit() {
  const m = M.normalizeMigrations(get("migrations"));
  if (m.toolkit) return;
  const toolkitVals = Object.fromEntries(Object.keys(M.SETTING_MAP).map(k => [k, storedWorld(M.TOOLKIT_NS, k)]));
  const ours = Object.fromEntries(Object.values(M.SETTING_MAP).map(({ key }) => [key, storedWorld(ID, key) !== undefined]));
  const scenes = game.scenes.map(s => ({ id: s.id, toolkitHub: !!s.flags?.[M.TOOLKIT_NS]?.[M.TOOLKIT_HUB_FLAG], hub: s.flags?.[ID]?.[M.HUB_FLAG] }));
  const plan = M.planToolkitMigration({ toolkit: toolkitVals, ours, scenes });
  for (const [k, v] of Object.entries(plan.settings)) { try { await set(k, v); } catch (e) { warn(`carrying over ${k}`, e); } }
  if (plan.scenes.length) {
    try { await Scene.updateDocuments(plan.scenes.map(_id => ({ _id, [`flags.${ID}.${M.HUB_FLAG}`]: true }))); } catch (e) { warn("carrying over Hub scenes", e); }
  }
  if (plan.skipped.length) warn(`toolkit settings not carried over (unreadable values): ${plan.skipped.join(", ")}`);
  await set("migrations", { ...m, toolkit: Date.now() });
  const n = Object.keys(plan.settings).length;
  log(`carried over from the toolkit: ${n} setting${n === 1 ? "" : "s"}, ${plan.scenes.length} Hub scene${plan.scenes.length === 1 ? "" : "s"}`);
}

/** Every client (feature on): this browser's dragged panel spot, once, when Red Book has none. */
export async function clientPosition() {
  try {
    const s = storage("client");
    const pos = M.clientCarry(s?.getItem?.(`${M.TOOLKIT_NS}.onlineHudPos`), s?.getItem?.(`${ID}.onlineHudPos`));
    if (pos) await set("onlineHudPos", pos);
  } catch { }
}

/** Leader, after the GM tabs settled. */
export async function run({ online = true, start = true, pins = true } = {}) {
  if (!L.isLeader()) return;
  if (online || start) { try { await toolkit(); } catch (e) { warn("toolkit carry-over failed", e); } }
  if (pins) await Store.migrate();
}
