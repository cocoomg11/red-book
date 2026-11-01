/**
 * Session Start (feature "sessionStart"; moved here from the companion toolkit). One GM dialog: pick the scene (scenes matching
 * the "hidden from the list" pattern are left out), activate it for players, unpause the game, and, when the session log is on,
 * start the session log (which records "Session started on <scene>"). No recap is posted. Red Book never writes the toolkit's Travel
 * Log page; the session log is where the start is recorded.
 */
import { esc } from "./const.mjs";
import { F, get } from "./core.mjs";
import { sceneChoices } from "./start-model.mjs";
import * as UI from "./ui.mjs";

let deps = {};
export function init(d) { deps = d; }

const opt = (v, label, sel) => `<option value="${esc(v)}" ${sel ? "selected" : ""}>${esc(label)}</option>`;

/** Opens the Session Start dialog (GM). Resolves to { scene, activated, unpaused, logged } or null. */
export async function open() {
  if (!F.need("sessionStart") || !UI.gmOnly()) return null;
  const scenes = sceneChoices(game.scenes.map(s => ({ id: s.id, name: s.name })), String(get("hiddenScenes") ?? ""));
  const log = F.on("sessionLog") && !deps.session?.openEntry?.();
  const content = `<div class="form-group"><label>Scene</label><select name="scene">${scenes.map(s => opt(s.id, s.name, s.id === canvas?.scene?.id)).join("")}</select></div>
    <div class="form-group"><label>Activate it for players</label><input type="checkbox" name="activate" checked></div>
    <div class="form-group"><label>Unpause the game</label><input type="checkbox" name="unpause" checked></div>
    ${F.on("sessionLog") ? `<div class="form-group"><label>Start the session log</label><input type="checkbox" name="log" ${log ? "checked" : "disabled"}></div>${log ? "" : `<p class="hint">A session is already open.</p>`}` : ""}`;
  const f = await UI.form("Session Start", content, "Start session");
  if (!f) return null;
  const s = game.scenes.get(f.scene);
  if (f.activate && s) await s.activate();
  if (f.unpause && game.paused) game.togglePause(false, { broadcast: true });
  const logged = !!(f.log && log) && !!deps.session?.start?.();
  return { scene: s?.id ?? null, activated: !!(f.activate && s), unpaused: !!f.unpause, logged };
}

export const api = { open: () => open() };
