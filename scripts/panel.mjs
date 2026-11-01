/**
 * The control panel (Module Settings › Red Book › Open the control panel). Tabs: Overview (health and the main buttons), Features
 * (one switch per tool), one tab per tool (Basic settings, then Advanced), Data (debug logging and Remove Red Book data). What goes
 * where comes from settings-model.mjs.
 */
import { ID, esc } from "./const.mjs";
import * as F from "./features.mjs";
import * as S from "./settings-model.mjs";
import { get, set } from "./settings.mjs";
import { health } from "./health.mjs";
import * as UI from "./ui.mjs";

let deps = {};
export function init(d) { deps = d; }

const ICON = { ok: "fa-circle-check", warn: "fa-triangle-exclamation", bad: "fa-circle-xmark", info: "fa-circle-info" };

function input(s, disabled) {
  const v = get(s.key); const dis = disabled ? "disabled" : "";
  if (s.type === "bool") return `<input type="checkbox" name="${s.key}" ${v ? "checked" : ""} ${dis}>`;
  if (s.type === "number") return `<input type="number" name="${s.key}" value="${esc(v)}" min="${s.min ?? ""}" max="${s.max ?? ""}" step="${s.step ?? 1}" ${dis}>`;
  return `<input type="text" name="${s.key}" value="${esc(v)}" ${dis}>`;
}
const rowHTML = (s, off) => `<div class="form-group"><label>${esc(s.label)}</label><div class="form-fields">${input(s, off)}</div>${s.hint ? `<p class="hint">${esc(s.hint)}</p>` : ""}</div>`;

export class ControlPanel extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = { id: `${ID}-panel`, classes: ["rb-panel", UI.WINDOW], tag: "form", form: { closeOnSubmit: false }, window: { title: "Red Book", icon: "fa-solid fa-book", resizable: true }, position: { width: 720, height: 620 } };
  tab = "overview";
  async _renderHTML() {
    const div = document.createElement("div"); div.className = "rb-panel-body";
    const tabs = S.TABS.map(t => `<button type="button" data-tab="${t.id}" class="${t.id === this.tab ? "active" : ""}"><i class="${t.icon}"></i> ${esc(t.label)}</button>`).join("");
    div.innerHTML = `<nav class="rb-tabs">${tabs}</nav><section class="rb-main">${this.#tab()}</section>`;
    return div;
  }
  #tab() {
    const t = S.TABS.find(x => x.id === this.tab) ?? S.TABS[0];
    if (t.id === "overview") {
      const open = F.on("sessionLog") && deps.session?.openEntry?.();
      const btn = (a, icon, label, on = true) => on ? `<button type="button" data-run="${a}"><i class="${icon}"></i> ${label}</button>` : "";
      return `<h2>Overview</h2><ul class="rb-health">${health(deps).map(l => `<li class="rb-${l.level}"><i class="fa-solid ${ICON[l.level]}"></i> ${esc(l.text)}</li>`).join("")}</ul>
        <div class="rb-buttons">
          ${btn(open ? "end" : "start", open ? "fa-solid fa-book-bookmark" : "fa-solid fa-book", open ? "End session" : "Start session", F.on("sessionLog"))}
          ${btn("note", "fa-solid fa-pen", "Quick note", F.on("sessionLog") && !!open)}
          ${btn("recap", "fa-solid fa-share-from-square", "Share last session as recap", F.on("sessionLog"))}
          ${btn("board", "fa-solid fa-thumbtack", "Next-session board", F.on("prepBoard"))}
          ${btn("check", "fa-solid fa-clipboard-check", "Check scenes…", F.on("sceneCheck") && game.user.isGM)}
        </div>`;
    }
    if (t.id === "features") return `<h2>Features</h2><p class="hint">A tool that's off registers nothing (no hooks, buttons or key bindings). Changes reload the world.</p>
      ${F.FEATURES.map(f => `<div class="form-group"><label><input type="checkbox" name="${f.key}" ${F.on(f.id) ? "checked" : ""}> ${esc(f.label)}</label><p class="hint">${esc(f.hint)}</p></div>`).join("")}
      <footer class="form-footer"><button type="submit"><i class="fa-solid fa-floppy-disk"></i> Save changes</button></footer>`;
    const off = t.feature && !F.on(t.feature);
    const { basic, advanced } = S.tabRows(t.id);
    const extra = t.id === "data" ? `<div class="rb-buttons"><button type="button" data-run="cleanup"><i class="fa-solid fa-broom"></i> Remove Red Book data…</button></div>`
      : t.id === "check" && !off && game.user.isGM ? `<div class="rb-buttons"><button type="button" data-run="clearIgnored"><i class="fa-solid fa-eraser"></i> Clear all ignored warnings…</button></div><p class="hint">Stops ignoring every finding you ignored in the readiness window, on every scene (asks first).</p>` : "";
    return `<h2>${esc(t.label)}</h2>${off ? `<p class="rb-warn"><i class="fa-solid fa-power-off"></i> This tool is turned off (Features tab).</p>` : ""}
      ${basic.map(s => rowHTML(s, off)).join("")}
      ${advanced.length ? `<details class="rb-advanced"><summary>Advanced</summary>${advanced.map(s => rowHTML(s, off)).join("")}</details>` : ""}
      ${extra}
      ${basic.length + advanced.length ? `<footer class="form-footer"><button type="submit"><i class="fa-solid fa-floppy-disk"></i> Save changes</button></footer>` : ""}`;
  }
  _replaceHTML(result, content) {
    content.replaceChildren(result);
    content.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => { this.tab = b.dataset.tab; this.render(); }));
    content.querySelectorAll("[data-run]").forEach(b => b.addEventListener("click", async () => {
      const r = b.dataset.run;
      if (r === "start") deps.session?.start(); else if (r === "end") await deps.session?.end();
      else if (r === "note") deps.session?.noteDialog(); else if (r === "recap") deps.session?.shareRecap();
      else if (r === "board") deps.board?.open(); else if (r === "check") deps.check?.chooser(); else if (r === "cleanup") deps.cleanup?.open();
      else if (r === "clearIgnored") await deps.check?.clearAllIgnored?.();
      setTimeout(() => this.rendered && this.render(), 800);
    }));
    this.element.onsubmit = ev => { ev.preventDefault(); this.#save(); };
  }
  async #save() {
    const form = this.element;
    if (this.tab === "features") {
      let changed = false;
      for (const f of F.FEATURES) { const v = !!form.elements[f.key]?.checked; if (v !== F.on(f.id)) { await game.settings.set(ID, f.key, v); changed = true; } }
      if (changed) foundry.applications?.settings?.SettingsConfig?.reloadConfirm?.({ world: true });
      return ui.notifications.info("Red Book: features saved.");
    }
    const { basic, advanced } = S.tabRows(this.tab);
    for (const s of [...basic, ...advanced]) {
      const el = form.elements[s.key]; if (!el || el.disabled) continue;
      const v = S.convert(s, s.type === "bool" ? el.checked : el.value);
      if (v !== null && v !== get(s.key)) await set(s.key, v);
    }
    ui.notifications.info("Red Book: settings saved.");
    this.render();
  }
}

export function open(tab) {
  const app = foundry.applications.instances?.get?.(`${ID}-panel`) ?? new ControlPanel();
  if (tab) app.tab = tab;
  return app.render({ force: true });
}
