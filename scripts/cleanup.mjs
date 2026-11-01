/**
 * "Remove Red Book data": a dry run first (counts and names per category), the GM ticks what goes and types REMOVE. Only Red Book's own
 * documents (recognised by their flags) and flags.red-book on other documents are touched.
 */
import { ID, esc } from "./const.mjs";
import * as M from "./cleanup-model.mjs";
import * as UI from "./ui.mjs";

function* flagged() {
  for (const c of [game.actors, game.items, game.scenes, game.tables, game.playlists, game.macros, game.users]) for (const d of c ?? []) yield d;
  for (const j of game.journal) for (const p of j.pages) yield p;
  for (const s of game.scenes) for (const t of s.tokens) yield t;
}

export function plan() {
  const settings = [];
  for (const [, c] of game.settings.settings) if (c.namespace === ID && c.scope === "world") {
    let cur; try { cur = game.settings.get(ID, c.key); } catch { continue; }
    settings.push({ key: c.key, changed: JSON.stringify(cur) !== JSON.stringify(c.default) });
  }
  return M.plan({
    journals: game.journal.map(j => ({ id: j.id, name: j.name, flags: j.flags, folder: j.folder?.id })),
    folders: game.folders.filter(f => f.type === "JournalEntry").map(f => ({ id: f.id, name: f.name, flags: f.flags })),
    docs: [...flagged()].map(d => ({ uuid: d.uuid, name: d.name ?? d.id, flags: d.flags })),
    settings
  });
}

export async function remove(pick = {}) {
  if (!UI.gmOnly()) return null;
  const p = plan(); const done = {};
  const contents = Object.fromEntries(p.folders.map(f => [f.id, game.folders.get(f.id)?.contents?.map(j => j.id) ?? []]));
  const children = Object.fromEntries(p.folders.map(f => [f.id, game.folders.get(f.id)?.children ?? []]));
  const folders = pick.folders ? M.emptyFolders(p, pick, contents, children) : [];
  for (const k of ["sessions", "recaps", "reports"]) if (pick[k] && p[k].length) {
    try { await JournalEntry.deleteDocuments(p[k].map(j => j.id)); done[k] = p[k].length; } catch (e) { console.warn(`${ID} | remove ${k}`, e); done[k] = 0; }
  }
  if (pick.flags) {
    let n = 0;
    for (const { uuid } of p.flags) { try { const d = await fromUuid(uuid); if (d) { for (const k of Object.keys(d._source?.flags?.[ID] ?? d.flags?.[ID] ?? {})) await d.unsetFlag(ID, k); n++; } } catch (e) { console.warn(`${ID} | remove flags ${uuid}`, e); } }
    done.flags = n;
  }
  if (folders.length) { try { await Folder.deleteDocuments(folders.map(f => f.id)); done.folders = folders.length; } catch (e) { console.warn(`${ID} | remove folders`, e); } }
  if (pick.settings) {
    let n = 0;
    for (const s of p.settings) { const c = game.settings.settings.get(`${ID}.${s.key}`); try { await game.settings.set(ID, s.key, foundry.utils.deepClone(c.default)); n++; } catch { } }
    done.settings = n;
  }
  return done;
}

export class CleanupApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = { id: `${ID}-cleanup`, classes: ["rb-cleanup", UI.WINDOW], tag: "form", form: { closeOnSubmit: false }, window: { title: "Red Book · Remove Red Book data", icon: "fa-solid fa-broom", resizable: true }, position: { width: 580, height: "auto" } };
  async _renderHTML() {
    const div = document.createElement("div");
    if (!game.user.isGM) { div.textContent = "GM only."; return div; }
    const rows = M.dryRun(plan());
    div.innerHTML = `<p>Dry run: this is what would go now. Nothing changes until you tick, type REMOVE and click Remove. Your own documents and other modules' data are never touched.</p>
      ${rows.map(r => `<div class="form-group"><label><input type="checkbox" name="${r.key}" ${M.CATEGORIES.find(c => c[0] === r.key)[2] ? "checked" : ""}> ${esc(r.text)}</label></div>`).join("")}
      <div class="form-group"><label>Type <strong>REMOVE</strong> to confirm</label><div class="form-fields"><input type="text" name="confirm" autocomplete="off"></div></div>
      <footer class="form-footer"><button type="submit"><i class="fa-solid fa-broom"></i> Remove</button></footer>`;
    return div;
  }
  _replaceHTML(result, content) {
    content.replaceChildren(result);
    const form = this.element;
    form.onsubmit = async ev => {
      ev.preventDefault();
      if (String(form.elements.confirm?.value ?? "").trim() !== "REMOVE") return ui.notifications.warn("Red Book: type REMOVE to confirm.");
      const pick = Object.fromEntries(M.CATEGORIES.map(([k]) => [k, !!form.elements[k]?.checked]));
      if (!Object.values(pick).some(Boolean)) return ui.notifications.info("Red Book: nothing ticked.");
      const done = await remove(pick); await this.close();
      if (!done) return;
      ui.notifications.info(`Red Book data removed: ${Object.entries(done).map(([k, n]) => `${k} ${n}`).join(", ") || "nothing"}.`);
      if (pick.settings) foundry.applications?.settings?.SettingsConfig?.reloadConfirm?.({ world: true });
    };
  }
}
export const open = () => new CleanupApp().render({ force: true });
export const api = { plan, remove, open, dryRun: () => M.dryRun(plan()) };
