/**
 * Features: one world setting per tool. A turned-off tool registers nothing (no hooks, buttons, key bindings, socket handlers or
 * wrappers) and its API entry is undefined. To add a tool, add an entry here and gate its registration with on("<id>").
 */
import { ID } from "./const.mjs";

export const FEATURES = [
  { id: "sessionLog", label: "Session log", hint: "Start and end sessions; while one is open, a timeline of scenes, combats, downs, rests, loot, time, journals shown, NPCs met, level-ups and your quick notes is kept in a GM-only journal, with a summary and a player recap you review first." },
  { id: "prepBoard", label: "Next-session board", hint: "One GM window with the active quests and their next objectives, the NPCs, journals and scenes they link to, the open threads and summary from the last session, and your own pinned documents." },
  { id: "sceneCheck", label: "Scene readiness check", hint: "A read-only audit of one scene, a folder or every scene: missing images and sounds, walls, lights, token vision and links, NPC stats, map notes, linked journals and player characters. Each finding has a jump-to fix." }
].map(f => ({ default: true, key: `feature-${f.id}`, ...f }));

const byId = id => FEATURES.find(f => f.id === id);

/** Whether a tool is turned on in this world. Unknown ids count as on. */
export function on(id) {
  const f = byId(id); if (!f) return true;
  try { return !!game.settings.get(ID, f.key); } catch { return f.default; }
}

/** For API entry points: warns and returns false when the tool is off. */
export function need(id) {
  if (on(id)) return true;
  ui.notifications.warn(`${byId(id)?.label ?? id} is turned off in Red Book › Features.`);
  return false;
}

export function registerSettings() {
  for (const f of FEATURES) game.settings.register(ID, f.key, { name: `Feature: ${f.label}`, hint: f.hint, scope: "world", config: false, type: Boolean, default: f.default, requiresReload: true });
}
