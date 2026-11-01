/**
 * "Remove Red Book data": a dry run first (counts and names per category), the GM ticks what goes and types REMOVE. Only Red Book's own
 * documents (recognised by their flags) and flags.red-book on other documents are touched.
 */
import { ID, esc } from "./const.mjs";
import * as M from "./cleanup-model.mjs";
import * as UI from "./ui.mjs";
import { gateApi } from "./check-model.mjs";
import { confirmed, changedSettings } from "../vendor/wanderers-core/index.mjs";
import { flaggedDocuments, unsetFlags, resetSettings, settingValues } from "../vendor/wanderers-core/foundry/index.mjs";

/** The plan (GM only: players get the empty plan). */
export function plan() {
  if (!game.user?.isGM) return M.plan({});
  return M.plan({
    journals: game.journal.map(j => ({ id: j.id, name: j.name, flags: j.flags, folder: j.folder?.id })),
    folders: game.folders.filter(f => f.type === "JournalEntry").map(f => ({ id: f.id, name: f.name, flags: f.flags })),
    // Every other world document and its embedded documents (journals are sorted above, so they're skipped here).
    docs: flaggedDocuments(ID, d => d.documentName !== "JournalEntry").map(d => ({ uuid: d.uuid, name: d.name, flags: { [ID]: { any: true } } })),
    // World settings, plus this browser's own (client scope: the Who's online panel spot and fold, 0.4.0). Other browsers keep theirs.
    settings: changedSettings(settingValues(ID), { scopes: M.SETTING_SCOPES }).map(s => ({ key: s.key, changed: true }))
  });
}

export async function remove(pick = {}) {
  if (!UI.gmOnly()) return null;
  const p = plan(); const done = {};
  const contents = Object.fromEntries(p.folders.map(f => [f.id, game.folders.get(f.id)?.contents?.map(j => j.id) ?? []]));
  const children = Object.fromEntries(p.folders.map(f => [f.id, game.folders.get(f.id)?.children ?? []]));
  const folders = pick.folders ? M.emptyFolders(p, pick, contents, children) : [];
  for (const k of ["sessions", "recaps", "reports", "store"]) if (pick[k] && p[k].length) {
    try { await JournalEntry.deleteDocuments(p[k].map(j => j.id)); done[k] = p[k].length; } catch (e) { console.warn(`${ID} | remove ${k}`, e); done[k] = 0; }
  }
  if (pick.flags) done.flags = await unsetFlags(ID, p.flags.map(f => f.uuid));
  if (folders.length) { try { await Folder.deleteDocuments(folders.map(f => f.id)); done.folders = folders.length; } catch (e) { console.warn(`${ID} | remove folders`, e); } }
  if (pick.settings) done.settings = await resetSettings(ID, p.settings.map(s => s.key));
  return done;
}

export class CleanupApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = { id: `${ID}-cleanup`, classes: ["rb-cleanup", UI.WINDOW], tag: "form", form: { closeOnSubmit: false }, window: { title: "Red Book · Remove Red Book data", icon: "fa-solid fa-broom", resizable: true }, position: { width: 580, height: "auto" } };
  async _renderHTML() {
    const div = document.createElement("div");
    if (!game.user.isGM) { div.textContent = "GM only."; return div; }
    const rows = M.dryRun(plan());
    div.innerHTML = `<p>Dry run: this is what would go now. Nothing changes until you tick, type REMOVE and click Remove. Your own documents and other modules' data are never touched.</p>
      ${rows.map(r => `<div class="form-group"><label><input type="checkbox" name="${r.key}" ${r.ticked ? "checked" : ""}> ${esc(r.text)}</label></div>`).join("")}
      <div class="form-group"><label>Type <strong>REMOVE</strong> to confirm</label><div class="form-fields"><input type="text" name="confirm" autocomplete="off"></div></div>
      <footer class="form-footer"><button type="submit"><i class="fa-solid fa-broom"></i> Remove</button></footer>`;
    return div;
  }
  _replaceHTML(result, content) {
    content.replaceChildren(result);
    const form = this.element;
    form.onsubmit = async ev => {
      ev.preventDefault();
      if (!confirmed(form.elements.confirm?.value)) return ui.notifications.warn("Red Book: type REMOVE to confirm.");
      const pick = Object.fromEntries(M.CATEGORIES.map(([k]) => [k, !!form.elements[k]?.checked]));
      if (!Object.values(pick).some(Boolean)) return ui.notifications.info("Red Book: nothing ticked.");
      const done = await remove(pick); await this.close();
      if (!done) return;
      ui.notifications.info(`Red Book data removed: ${Object.entries(done).map(([k, n]) => `${k} ${n}`).join(", ") || "nothing"}.`);
      if (pick.settings) foundry.applications?.settings?.SettingsConfig?.reloadConfirm?.({ world: true });
    };
  }
}
export const open = () => (UI.gmOnly() ? new CleanupApp().render({ force: true }) : null);
/** GM only: for other users every member warns "GM only" and returns undefined. */
export const api = gateApi({ plan, remove, open, dryRun: () => M.dryRun(plan()) }, () => !!game.user?.isGM, () => ui.notifications.warn("Red Book: GM only."));
