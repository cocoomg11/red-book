/**
 * The Red Book window (0.4.0): one ApplicationV2 with core's sidebar shell. Tools: Session (the default page: live banner, stat
 * tiles, quick note, filterable timeline, "At the table" with live HP on dnd5e), Board, Scene check (master–detail), Online, Past
 * sessions. Settings: Features, Tool settings, Health, Data. The markup comes from view.mjs (pure, tested); this file reads the world
 * into plain models, routes clicks (ApplicationV2 `_onClickAction`) and saves forms. GM only. Opened from Module Settings, the scene
 * controls, `api.panel(page)` and the board/check buttons.
 */
import { ID } from "./const.mjs";
import { F, get, set } from "./core.mjs";
import * as S from "./settings-model.mjs";
import { report } from "./health.mjs";
import * as V from "./view.mjs";
import { t } from "./i18n.mjs";
import { PINS_MAX } from "./board-model.mjs";
import * as UI from "./ui.mjs";

/** @type {any} */
let deps = {};
export function init(d) { deps = d; }

const TOOL_TABS = () => S.TABS.filter(x => x.feature);
/** Plain users for the roster (character HP read from dnd5e's prepared data: value, max, temp, tempmax, effectiveMax). */
function users() {
  return game.users.map(u => { const c = u.character; return { id: u.id, name: u.name, color: u.color?.css ?? String(u.color ?? ""), active: !!u.active, isGM: !!u.isGM, character: c ? { name: c.name, img: c.img, hp: c.system?.attributes?.hp ?? null } : null }; });
}
const dnd5e = () => game.system?.id === "dnd5e";

export class RedBookApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: `${ID}-panel`, classes: ["rb-app", UI.WINDOW, ...UI.UI_CLASSES], tag: "form", form: { closeOnSubmit: false },
    window: { title: "Red Book", icon: "fa-solid fa-book", resizable: true }, position: { width: 980, height: 720 }
  };
  page = V.DEFAULT_PAGE;
  tool = "session";
  filter = "all";
  check = { selected: null, query: "" };

  get title() { return t("Window.title"); }

  async _renderHTML() {
    const div = document.createElement("div"); div.className = "rb-app-body";
    if (!game.user?.isGM) { div.textContent = t("Common.gmOnly"); return div; }
    let main = "";
    try { main = this.#page(); } catch (e) { console.error(`${ID} | page ${this.page}`, e); main = `<p class="wc-status wc-bad">${UI.escText(String(e?.message ?? e))}</p>`; }
    // The shell is returned as the window content's direct child, so core's narrow-layout container and padding rules apply.
    div.innerHTML = V.shellHTML(V.navHTML(this.page, id => F.on(id), this.#badges()), main);
    return /** @type {HTMLElement} */ (div.firstElementChild);
  }

  #badges() {
    const out = {};
    const open = F.on("sessionLog") && deps.session?.openEntry?.();
    if (open) out.session = { tone: "live", text: t("Common.on"), title: t("Session.live") };
    if (F.on("prepBoard")) { try { const n = deps.board?.pins?.().length ?? 0; if (n) out.board = { tone: "info", text: n }; } catch { } }
    if (F.on("whosOnline")) { try { const r = deps.online.read(); out.online = { tone: r.all ? "ok" : "info", text: V.countPill(r) }; } catch { } }
    try { const n = report(deps).flatMap(s => s.lines).filter(l => l.level === "bad" || l.level === "warn").length; if (n) out.health = { tone: "warn", text: n }; } catch { }
    return out;
  }

  #page() {
    const p = this.page;
    if (p === "session") return this.#sessionPage();
    if (p === "board") return F.on("prepBoard") ? V.boardPageHTML(deps.board.model(), look, { sessionOn: F.on("sessionLog"), checkOn: F.on("sceneCheck"), pinsMax: PINS_MAX }) : V.pageHead(t("Nav.board")) + V.offAlert();
    if (p === "check") {
      if (!F.on("sceneCheck")) return V.pageHead(t("Nav.check")) + V.offAlert();
      const scenes = game.scenes.contents.map(s => ({ id: s.id, name: s.name })).sort((a, b) => a.name.localeCompare(b.name));
      if (!this.check.selected && canvas?.scene) this.check.selected = canvas.scene.id;
      return V.checkPageHTML({ scenes, results: deps.check.memory().all(), selected: this.check.selected, query: this.check.query });
    }
    if (p === "online") {
      if (!F.on("whosOnline")) return V.pageHead(t("Nav.online")) + V.offAlert();
      return V.onlinePageHTML(deps.online.read(), { hubs: game.scenes.filter(s => deps.online.isHub(s)).map(s => s.name) });
    }
    if (p === "past") {
      if (!F.on("sessionLog")) return V.pageHead(t("Nav.past")) + V.offAlert();
      return V.pastPageHTML(deps.session.sessions().map(j => { const d = deps.session.dataOf(j); return { id: j.id, uuid: j.uuid, name: j.name, n: d.n, open: d.open, events: d.events.length, startedAt: d.startedAt, endedAt: d.endedAt }; }));
    }
    if (p === "features") return V.featuresPageHTML(F.FEATURES, id => F.on(id));
    if (p === "tools") {
      const tab = TOOL_TABS().find(x => x.id === this.tool) ?? TOOL_TABS()[0];
      const off = !!tab.feature && !F.on(tab.feature);
      const extra = tab.id === "check" && !off ? `<div class="wc-row"><button type="button" class="wc-btn wc-btn-sm" data-action="clearAllIgnored"><i class="fa-solid fa-eraser" aria-hidden="true"></i> ${UI.escText(t("Tools.clearAll"))}</button></div><p class="wc-hint">${UI.escText(t("Tools.clearAllHint"))}</p>` : "";
      return V.toolSettingsHTML({ tool: tab.id, tabs: TOOL_TABS(), rows: S.tabRows(tab.id), value: get, off, extra });
    }
    if (p === "health") return V.healthPageHTML(report(deps));
    if (p === "data") return V.dataPageHTML({ rows: S.tabRows("data"), value: get });
    return "";
  }

  #sessionPage() {
    const on = F.on("sessionLog");
    const open = on ? deps.session.openEntry() : null;
    const latest = on && !open ? deps.session.latest() : null;
    const withUuid = j => (j ? { ...deps.session.dataOf(j), uuid: j.uuid } : null);
    let online = null;
    if (F.on("whosOnline")) { const r = deps.online.read(); online = { present: r.present, expected: r.expected }; }
    return V.sessionPageHTML({
      on, session: withUuid(open), last: withUuid(latest), now: Date.now(), filter: this.filter, startOn: F.on("sessionStart"),
      roster: V.rosterModel(users(), { dnd5e: dnd5e() }), dnd5e: dnd5e(), online
    });
  }

  _replaceHTML(result, content) {
    const hadNavFocus = !!document.activeElement?.closest?.(`#${this.id} .wc-nav`);
    const note = this.element?.querySelector?.("[name=noteText]")?.value ?? "";
    content.replaceChildren(result);
    // Keyboard: arrow keys, Home and End move between the sidebar's links (one tab stop; Enter or Space opens a page).
    const navs = [...result.querySelectorAll(".wc-nav")];
    navs.forEach((b, i) => b.addEventListener("keydown", ev => {
      if (ev.key === " " || ev.key === "Enter") { ev.stopPropagation(); return; }
      const j = V.nextNavIndex(i, ev.key, navs.length); if (j < 0) return;
      ev.preventDefault(); navs.forEach(x => x.setAttribute("tabindex", "-1")); navs[j].setAttribute("tabindex", "0"); navs[j].focus();
    }));
    if (hadNavFocus) result.querySelector(".wc-nav.active")?.focus();
    const n = result.querySelector("[name=noteText]"); if (n && note) n.value = note;
    // Live search in the scene list (no re-render, so the field keeps focus).
    const q = result.querySelector("[data-filter-scenes]");
    q?.addEventListener("input", () => { this.check.query = q.value; filterList(result.querySelector(".rb-scene-list"), q.value); });
    if (q && this.check.query) filterList(result.querySelector(".rb-scene-list"), this.check.query);
    const drop = result.querySelector("[data-drop]");
    if (drop) {
      drop.addEventListener("dragover", ev => { ev.preventDefault(); drop.classList.add("over"); });
      drop.addEventListener("dragleave", () => drop.classList.remove("over"));
      drop.addEventListener("drop", async ev => { ev.preventDefault(); drop.classList.remove("over"); if (await deps.board.dropPin(ev)) this.render(); });
    }
    this.element.onsubmit = ev => { ev.preventDefault(); this.#submit(); };
  }

  async _onClickAction(event, target) {
    const a = target.dataset.action; const d = target.dataset;
    const S_ = deps.session, B = deps.board, C = deps.check;
    switch (a) {
      case "nav": this.page = d.page; this.render(); return;
      case "filter": this.filter = d.filter; this.render(); return;
      case "tool": this.tool = d.tool; this.render(); return;
      case "refresh": this.render(); return;
      case "start": await S_?.start(); return this.soon();
      case "end": await S_?.end(); return this.soon();
      case "note": return S_?.noteDialog();
      case "addNote": return this.#addNote();
      case "startDialog": return deps.start?.open();
      case "openUuid": return UI.openUuid(d.uuid);
      case "recap": return S_?.shareRecap(d.id);
      case "viewScene": return UI.safeSync(d.uuid)?.view?.();
      case "checkScene": {
        const id = d.scene ?? UI.safeSync(d.uuid)?.id; if (!id) return;
        const fresh = !!C?.memory().get(id);
        this.page = "check"; this.check.selected = id; this.render();
        return C?.checkInto(id, { fresh });
      }
      case "checkAll": return C?.run({ scenes: B.model().links.scenes.map(e => e.uuid) });
      case "checkAllScenes": return C?.run({ all: true });
      case "pickScene": this.check.selected = d.scene; this.render(); return;
      case "exportCheck": { const r = C?.memory().get(d.scene); return r && !r.pending ? C.exportReport([r]) : undefined; }
      case "fix": return C?.fixFinding(d.scene, Number(d.i), d.ignored === "1");
      case "ignore": return C?.ignoreAndRefresh(C.ignore(d.scene, d.key));
      case "unignore": return C?.ignoreAndRefresh(C.unignore(d.scene, d.key));
      case "clearIgnored": return C?.ignoreAndRefresh(C.clearIgnored(d.scene));
      case "clearAllIgnored": return C?.clearAllIgnored?.();
      case "unpin": await B.unpin(d.uuid); this.render(); return;
      case "openOnline": return deps.online?.open();
      case "resetHud": return deps.online?.resetPosition();
      case "cleanup": return deps.cleanup?.open();
      default: return undefined;
    }
  }

  /** Re-render after a start/end request reaches the recording tab. */
  soon() { setTimeout(() => this.rendered && this.render(), 800); }

  #addNote() {
    const f = this.element; const el = f.querySelector("[name=noteText]");
    const text = String(el?.value ?? "").trim(); if (!text) return;
    const ok = deps.session?.note(text, { thread: !!f.querySelector("[name=noteThread]")?.checked, private: !!f.querySelector("[name=notePrivate]")?.checked });
    if (ok !== false && el) { el.value = ""; ui.notifications.info(`Red Book: ${t("Session.noteAdded")}`); }
  }

  async #submit() {
    const form = this.element;
    if (this.page === "session") return this.#addNote();
    if (this.page === "features") {
      let changed = false;
      for (const f of F.FEATURES) { const v = !!form.elements[f.key]?.checked; if (v !== F.on(f.id)) { await game.settings.set(ID, f.key, v); changed = true; } }
      if (changed) foundry.applications?.settings?.SettingsConfig?.reloadConfirm?.({ world: true });
      return ui.notifications.info("Red Book: features saved.");
    }
    const tab = this.page === "data" ? "data" : this.page === "tools" ? this.tool : null; if (!tab) return undefined;
    const { basic, advanced } = S.tabRows(tab);
    for (const s of [...basic, ...advanced]) {
      const el = form.elements[s.key]; if (!el || el.disabled) continue;
      const v = S.convert(s, s.type === "bool" ? el.checked : el.value);
      if (v !== null && v !== get(s.key)) await set(s.key, v);
    }
    ui.notifications.info("Red Book: settings saved.");
    return this.render();
  }
}
/** The old name (Module Settings menu registration). */
export const ControlPanel = RedBookApp;

/** Hides list items whose data-name doesn't contain the query. */
function filterList(ul, query) {
  const q = String(query ?? "").trim().toLowerCase();
  ul?.querySelectorAll("li[data-name]").forEach(li => { li.hidden = !!q && !li.dataset.name.includes(q); });
}
/** A UUID's name, whether it exists, whether it's a scene (for the board's rows). */
function look(uuid) {
  const d = UI.safeSync(uuid);
  return { name: d?.name ?? "", exists: !!d, scene: d?.documentName === "Scene" || /^Scene\.[^.]+$/.test(String(uuid)) };
}

const app = () => foundry.applications.instances?.get?.(`${ID}-panel`) ?? null;
/**
 * Opens the window (GM only; players get a "GM only" notice). `page`: a page id, or an old control-panel tab name (overview,
 * session, board, check, start, online, features, data).
 */
export function open(page) {
  if (!UI.gmOnly()) return undefined;
  const a = app() ?? new RedBookApp();
  if (page) { const p = V.pageFor(page); a.page = p.page; if (p.tool) a.tool = p.tool; }
  return a.render({ force: true });
}
/** Opens on the scene check page with a scene selected (no check is run). */
export function openCheck(sceneId) {
  if (!UI.gmOnly()) return undefined;
  const a = app() ?? new RedBookApp(); a.page = "check"; if (sceneId) a.check.selected = sceneId;
  return a.render({ force: true });
}

let timer = null;
/** Re-renders the open window soon (debounced) when it shows `page` (any page when omitted). A no-op when it's closed. */
export function refresh(page) {
  const a = app(); if (!a?.rendered || (page && a.page !== page)) return;
  clearTimeout(timer); timer = setTimeout(() => { const b = app(); if (b?.rendered && (!page || b.page === page)) b.render(); }, 250);
}

/**
 * Ready (GM): live updates for the Session page. Every hook bails on its first line unless the window is open on that page. HP:
 * dnd5e only, on actor updates that touch HP, name or image of a character a connected player has. No world writes.
 */
export function ready() {
  if (!game.user?.isGM) return;
  const onSession = () => app()?.rendered && app().page === "session";
  Hooks.on("updateActor", (actor, changes) => {
    if (!onSession() || !V.rosterTouched(changes)) return;
    if (game.users.some(u => u.active && !u.isGM && u.character?.id === actor.id)) refresh("session");
  });
  Hooks.on("userConnected", () => { if (onSession()) refresh("session"); });
  Hooks.on("updateUser", (u, changes) => { if (onSession() && changes && "character" in changes) refresh("session"); });
  Hooks.on("updateJournalEntry", (j, changes) => { if (app()?.rendered && foundry.utils.hasProperty(changes ?? {}, `flags.${ID}.session`)) refresh(); });
  for (const h of ["red-book.sessionStarted", "red-book.sessionEnded"]) Hooks.on(h, () => refresh());
  Hooks.on("createScene", () => refresh("check")); Hooks.on("deleteScene", () => refresh("check"));
}
