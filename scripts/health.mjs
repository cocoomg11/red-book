/**
 * Health check: read-only lines for the control panel's Overview. Each check is wrapped, never throws and never changes anything.
 * Line: { level: "ok" | "warn" | "bad" | "info", text }.
 */
import { ID, TOOLKIT_ID, MATT_ID } from "./const.mjs";
import * as F from "./features.mjs";
import * as L from "./leader.mjs";
import { get } from "./settings.mjs";

export function health(deps = {}) {
  const out = [];
  const add = (level, text) => out.push({ level, text });
  const safe = (fn) => { try { fn(); } catch (e) { add("warn", `A check failed to run: ${e.message}`); } };
  safe(() => {
    const gm = L.activeGM(); const i = L.info();
    if (!gm) add("warn", "No GM is connected: nothing is recorded.");
    else if (gm.id !== game.user.id) add("info", `${gm.name} is the active GM; their earliest open tab records.`);
    else add(i.leader ? "ok" : "info", i.leader ? `This tab records (${i.sessions} tab${i.sessions === 1 ? "" : "s"} of yours open).` : `Another of your tabs records (${i.sessions} open).`);
  });
  safe(() => add("info", `System: ${game.system.id}${game.system.id === "dnd5e" ? " (rests, NPC stats and level-ups supported)" : " (rests, CR checks and dnd5e level-ups are skipped)"}.`));
  safe(() => add(game.modules.get(TOOLKIT_ID)?.active ? "ok" : "info", game.modules.get(TOOLKIT_ID)?.active ? "Wayfarer's Toolkit is active: quests, travel, flights and loot rolls are logged and quests feed the board." : "Wayfarer's Toolkit isn't active: the board shows no quests and its events aren't logged."));
  if (F.on("sessionLog")) safe(() => {
    const j = deps.session?.openEntry?.();
    add(j ? "ok" : "info", j ? `Session open: ${j.name}.` : "No session is open.");
    const open = game.journal.filter(x => x.flags?.[ID]?.session?.open);
    if (open.length > 1) add("warn", `${open.length} session logs are marked open; only "${j?.name ?? "the one in the setting"}" records. End or delete the others.`);
  });
  if (F.on("sceneCheck")) safe(() => add("info", game.modules.get(MATT_ID)?.active ? "Monk's Active Tiles is active: its tile actions are checked." : "Monk's Active Tiles isn't active: its check is skipped."));
  safe(() => { if (get("debugLog")) add("info", "Debug logging is on."); });
  return out;
}
