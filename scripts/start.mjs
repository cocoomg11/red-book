/**
 * Session Start (feature "sessionStart"; moved here from the companion toolkit). A small GM window (0.4.0: its own ApplicationV2):
 * a searchable scene list (scenes matching the "left out of the list" pattern aren't offered) and a "Ready?" checklist (activate it
 * for players, unpause, start the session log; who's at the table and the scene check's last result this load, when those tools are
 * on). Start activates the scene, unpauses the game and, when the session log is on, starts it ("Session started on <scene>").
 * No recap is posted. Red Book never writes the toolkit's Travel Log page; the session log is where the start is recorded.
 */
import { ID } from "./const.mjs";
import { F, get } from "./core.mjs";
import { sceneChoices } from "./start-model.mjs";
import { startHTML } from "./view.mjs";
import { t } from "./i18n.mjs";
import * as UI from "./ui.mjs";

/** @type {any} */
let deps = {};
export function init(d) { deps = d; }

export class StartApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: `${ID}-start`, classes: ["rb-start-app", UI.WINDOW, ...UI.UI_CLASSES], tag: "form", form: { closeOnSubmit: false },
    window: { title: "Session Start", icon: "fa-solid fa-flag-checkered", resizable: true }, position: { width: 420, height: 560 }
  };
  selected = null;
  query = "";
  /** @type {((v: any) => void) | null} */ resolve = null;

  get title() { return t("Start.title"); }

  #scenes() {
    return sceneChoices(game.scenes.map(s => ({ id: s.id, name: s.name, active: !!s.active })), String(get("hiddenScenes") ?? ""));
  }

  async _renderHTML() {
    const div = document.createElement("div"); div.className = "rb-start-body";
    const scenes = this.#scenes();
    if (!scenes.some(s => s.id === this.selected)) this.selected = scenes.find(s => s.id === canvas?.scene?.id)?.id ?? scenes[0]?.id ?? null;
    let online = null;
    if (F.on("whosOnline")) { const r = deps.online?.read?.(); if (r) online = { present: r.present, expected: r.expected, all: r.all }; }
    const checkOn = F.on("sceneCheck");
    div.innerHTML = startHTML({
      scenes, selected: this.selected, query: this.query, logOn: F.on("sessionLog"), logOpen: !!deps.session?.openEntry?.(),
      online, checkOn, check: checkOn && this.selected ? deps.check?.memory?.().get(this.selected) : null, paused: !!game.paused
    });
    return div;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
    const q = result.querySelector("[data-filter-start]");
    q?.addEventListener("input", () => {
      this.query = q.value; const v = q.value.trim().toLowerCase();
      result.querySelectorAll(".rb-start-list li[data-name]").forEach(li => { li.hidden = !!v && !li.dataset.name.includes(v); });
    });
    result.querySelectorAll("input[name=scene]").forEach(r => r.addEventListener("change", () => { this.selected = r.value; this.render(); }));
    this.element.onsubmit = ev => { ev.preventDefault(); this.#go(); };
  }

  async _onClickAction(event, target) {
    if (target.dataset.action === "startCheck" && this.selected) {
      const p = deps.check?.checkInto?.(this.selected, { fresh: true }); this.render();
      await p; if (this.rendered) this.render();
    }
  }

  async #go() {
    const f = this.element; const s = game.scenes.get(this.selected);
    const activate = !!f.elements.activate?.checked, unpause = !!f.elements.unpause?.checked;
    const wantLog = !!f.elements.log?.checked && !f.elements.log?.disabled;
    if (activate && s) await s.activate();
    if (unpause && game.paused) game.togglePause(false, { broadcast: true });
    const logged = wantLog && F.on("sessionLog") && !deps.session?.openEntry?.() ? !!deps.session?.start?.() : false;
    const out = { scene: s?.id ?? null, activated: !!(activate && s), unpaused: unpause, logged };
    const r = this.resolve; this.resolve = null;
    await this.close();
    r?.(out);
  }

  async close(options) {
    const r = this.resolve; this.resolve = null; r?.(null);
    return super.close(options);
  }
}

/** Opens the Session Start window (GM). Resolves to { scene, activated, unpaused, logged } when started, or null when closed. */
export function open() {
  if (!F.need("sessionStart") || !UI.gmOnly()) return Promise.resolve(null);
  const app = /** @type {any} */ (foundry.applications.instances?.get?.(`${ID}-start`)) ?? new StartApp();
  app.resolve?.(null);
  return new Promise(res => { app.resolve = res; app.render({ force: true }); });
}

export const api = { open: () => open() };
