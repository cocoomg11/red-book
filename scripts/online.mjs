/**
 * Who's online (feature "whosOnline"; moved here from the companion toolkit, same behaviour). A board of the connected users with
 * their assigned character's portrait and name (or the user's name and colour), updated live. Shown as a small panel on scenes marked
 * Hub (`flags.red-book.hubScene`, set in the shared Table Tools scene tab) and in a window (api.online.open()). When every user who
 * counts is online the board says "Everyone's here".
 *
 * Hooks, fired on every client from its own reading of the users (no socket; a world script that writes documents in them should
 * check `game.users.activeGM?.isSelf`): `red-book.playerCountChanged` whenever the count changes, `red-book.allPlayersOnline` when
 * everyone who counts is here. Payload { online, expected, all, missing, users }. The toolkit's old names
 * (`wayfarers-toolkit.allPlayersOnline` / `.playerCountChanged`) fire too, with the same payload, unless the toolkit is active and
 * still provides its own Who's online (its `api.online`), or the setting "Also fire the old hook names" is off.
 *
 * The panel can be dragged by its title (world setting onlineDrag); each user's spot is their own client setting onlineHudPos, kept on
 * screen on load and resize; double-click the title to go back to the position choice. Writes no documents.
 */
import * as M from "./online-model.mjs";
import { ID, TOOLKIT_ID, esc } from "./const.mjs";
import { get, set, warn } from "./core.mjs";
import { sceneTab } from "../vendor/wanderers-core/foundry/index.mjs";

const HUD_ID = "rb-online-hud";
/** The scene flag: flags.red-book.hubScene (boolean). */
export const HUB_FLAG = "hubScene";
/** @type {any} */
let last = null;
/** @type {any} */
let app = null;
let dragging = false;

/** The world's users as plain objects for the model. */
function users() {
  return game.users.map(u => { const c = u.character; return { id: u.id, name: u.name, color: u.color?.css ?? String(u.color ?? ""), active: !!u.active, isGM: !!u.isGM, character: c ? { name: c.name, img: c.img } : null }; });
}
/** The board now: { entries, expected, present, all, missing, unknown }. */
export function read() { return M.roster(users(), { count: String(get("onlineCount") ?? "characters"), list: String(get("onlineList") ?? "") }); }

export const isHub = scene => !!scene?.getFlag?.(ID, HUB_FLAG);
const hubScene = () => isHub(canvas?.scene);

/** Whether the companion toolkit still fires its own Who's online hooks (active, and its api.online is there). */
export function toolkitProvides() {
  const tk = game.modules.get(TOOLKIT_ID); if (!tk?.active) return false;
  try { return !!tk.api?.online; } catch { return false; }
}

function boardHTML(r, { compact = false } = {}) {
  const row = e => `<li class="${e.active ? "on" : "off"}${e.counts ? "" : " extra"}" title="${esc(e.name)}${e.character ? ` (${esc(e.character.name)})` : ""}${e.active ? "" : ": not connected"}">
    ${e.character?.img ? `<img src="${esc(e.character.img)}" alt="">` : `<span class="dot" style="background:${esc(e.color || "#888")}"></span>`}
    <span class="nm">${esc(e.label)}${e.character && !compact ? ` <small>${esc(e.name)}</small>` : ""}${e.isGM ? " <small>GM</small>" : ""}</span></li>`;
  const head = r.all ? `<p class="rb-online-all"><i class="fa-solid fa-circle-check"></i> Everyone's here</p>` : r.expected ? `<p class="rb-online-count">${r.present} of ${r.expected} here</p>` : `<p class="rb-online-count">No players count yet</p>`;
  return `${head}<ul class="rb-online-list">${r.entries.filter(e => e.active || e.counts).map(row).join("")}</ul>`;
}

/** Foundry's own UI the panel keeps clear of (v14: scene navigation is a column right of the scene controls). */
function uiRects() {
  const r = sel => { const e = document.querySelector(sel); if (!e || (e.offsetParent === null && getComputedStyle(e).position !== "fixed")) return null; return e.getBoundingClientRect(); };
  return { nav: r("#scene-navigation"), controls: r("#scene-controls"), players: r("#players") };
}
const view = () => ({ width: window.innerWidth, height: window.innerHeight });

/** Puts the panel where it belongs: this user's dragged spot (kept on screen) or the world's position choice. */
function place(el = document.getElementById(HUD_ID)) {
  if (!el || dragging) return;
  const b = el.getBoundingClientRect();
  const p = M.placePanel({ anchor: String(get("onlinePosition") ?? "top-left"), saved: /** @type {any} */ (get("onlineHudPos")) ?? null, drag: get("onlineDrag") !== false }, view(), { width: b.width, height: b.height }, uiRects());
  el.style.left = `${p.left}px`; el.style.top = `${p.top}px`;
}

/** Drag by the title (pointer events); double-click the title to go back to the default spot. */
function wireDrag(el) {
  const h = el.querySelector("h3"); if (!h || get("onlineDrag") === false) return;
  h.title = "Drag to move · double-click to put back";
  /** @type {{ x: number, y: number, w: number, h: number } | null} */ let start = null;
  h.addEventListener("pointerdown", ev => {
    if (ev.button !== 0) return;
    const b = el.getBoundingClientRect(); start = { x: ev.clientX - b.left, y: ev.clientY - b.top, w: b.width, h: b.height };
    dragging = true; el.classList.add("dragging"); h.setPointerCapture?.(ev.pointerId); ev.preventDefault();
  });
  h.addEventListener("pointermove", ev => {
    if (!start) return;
    const p = M.clampPos({ left: ev.clientX - start.x, top: ev.clientY - start.y }, view(), { width: start.w, height: start.h });
    el.style.left = `${p.left}px`; el.style.top = `${p.top}px`;
  });
  const end = () => {
    if (!start) return; start = null; dragging = false; el.classList.remove("dragging");
    set("onlineHudPos", { left: parseFloat(el.style.left), top: parseFloat(el.style.top) }).catch(e => warn("who's online position", e));
  };
  h.addEventListener("pointerup", end); h.addEventListener("pointercancel", end);
  h.addEventListener("dblclick", ev => { ev.preventDefault(); set("onlineHudPos", {}).then(() => place()).catch(() => { }); });
}

function renderHud(r) {
  let el = document.getElementById(HUD_ID);
  if (!hubScene()) { el?.remove(); return; }
  if (!el) { el = document.createElement("aside"); el.id = HUD_ID; el.setAttribute("aria-label", "Who's online"); document.body.append(el); }
  if (dragging) return;
  const drag = get("onlineDrag") !== false;
  el.className = `rb-online-hud${drag ? " movable" : ""}${r.all ? " all" : ""}`;
  el.innerHTML = `<h3>Who's online</h3>${boardHTML(r, { compact: true })}`;
  wireDrag(el); place(el);
}

/** Resets this user's dragged position (the panel goes back to the world's position choice). */
export function resetPosition() { return set("onlineHudPos", {}).then(() => place()); }

/** Re-reads the board, redraws the panel and window, and fires the hooks when something changed. */
export function refresh() {
  const r = read();
  const ch = M.changes(last, r); last = r;
  try { renderHud(r); } catch (e) { warn("who's online panel", e); }
  if (app?.rendered) app.render();
  const names = M.hookNames(ch, { toolkitProvides: toolkitProvides(), legacy: get("onlineLegacyHooks") !== false });
  for (const n of names) { try { Hooks.callAll(n, M.hookPayload(r)); } catch (e) { warn(`hook ${n}`, e); } }
  return r;
}

export class OnlineApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = { id: `${ID}-online`, classes: ["rb-window", "rb-online-window"], window: { title: "Who's online", icon: "fa-solid fa-users", resizable: true }, position: { width: 300, height: "auto" } };
  async _renderHTML() { const div = document.createElement("div"); div.className = "rb-online-board"; div.innerHTML = boardHTML(read()); return div; }
  _replaceHTML(result, content) { content.replaceChildren(result); }
}
/** Opens the Who's online window (everyone). */
export function open() { app ??= new OnlineApp(); return app.render({ force: true }); }

/** Init (feature on): the Hub scene option in the shared Table Tools scene tab, and the hooks that change the board. */
export function init() {
  sceneTab.addSection(ID, {
    title: "Red Book", order: 20,
    render: (_app, scene) => `<div class="form-group"><label>Hub scene (show who's online)</label><div class="form-fields"><input type="checkbox" name="flags.${ID}.${HUB_FLAG}" ${isHub(scene) ? "checked" : ""}></div><p class="hint">Everyone on this scene sees a small Who's online panel.</p></div>`
  });
  // userConnected(user, connected) fires for other users joining or leaving; read the users on the next tick.
  Hooks.on("userConnected", () => setTimeout(() => refresh(), 0));
  Hooks.on("updateUser", (u, changes) => { const c = changes ?? {}; if ("character" in c || "role" in c || "name" in c || "color" in c) refresh(); });
  Hooks.on("createUser", () => refresh()); Hooks.on("deleteUser", () => refresh());
  Hooks.on("updateActor", (a, changes) => { if (("name" in (changes ?? {}) || "img" in (changes ?? {})) && game.users.some(u => u.character?.id === a.id)) refresh(); });
  Hooks.on("canvasReady", () => refresh());
  Hooks.on("updateSetting", s => { if (/^red-book\.online/.test(String(s?.key ?? ""))) refresh(); });
  Hooks.on("updateScene", (s, changes) => { if (s.id === canvas?.scene?.id && foundry.utils.hasProperty(changes ?? {}, `flags.${ID}`)) refresh(); });
  // Keep the panel on screen when the window changes size (bails at once with no panel showing).
  /** @type {any} */ let t = null; window.addEventListener("resize", () => { if (!document.getElementById(HUD_ID)) return; clearTimeout(t); t = setTimeout(() => place(), 100); });
}
/** Ready (feature on): the first reading (fires playerCountChanged once, and allPlayersOnline if everyone's already here). */
export function ready() { refresh(); }

/** Everyone may read who's online (it's what the panel shows). */
export const api = { read, open, refresh, resetPosition, isHub, hooks: { ...M.ONLINE_HOOKS }, legacyHooks: { ...M.LEGACY_HOOKS } };
