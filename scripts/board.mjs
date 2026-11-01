/**
 * Next-session board (feature "prepBoard"): one GM window. Active quests with their next objectives (from the companion toolkit when
 * it is active, else none), the NPCs, journals and scenes those quests link to, the open threads and summary of the latest session,
 * and a Pinned list the GM drops documents onto (capped, versioned). The pins live in the GM-only store journal (store.mjs), not in
 * a world setting, so players never receive them. Read-only apart from the pins.
 */
import { ID, TOOLKIT_ID, esc } from "./const.mjs";
import * as B from "./board-model.mjs";
import { gateApi } from "./check-model.mjs";
import { openThreads, TYPES } from "./session-model.mjs";
import { F, get, set } from "./core.mjs";
import * as UI from "./ui.mjs";
import * as Store from "./store.mjs";
import { migratePins } from "./store-model.mjs";

let APP = null;

/** The pins (GM). Before the one-time move has run, the old setting's pins are shown merged in, so nothing seems lost. */
export function pinStore() {
  const s = Store.read();
  return s.migrated.boardPins ? s.pins : (migratePins(s, get("boardPins")).store?.pins ?? s.pins);
}
async function savePins(pins) {
  const s = Store.read();
  const m = s.migrated.boardPins ? s : (migratePins(s, get("boardPins")).store ?? s);
  await Store.write({ ...m, pins });
  if (!s.migrated.boardPins && B.normalizePins(get("boardPins")).pins.length) await set("boardPins", { v: 1, pins: [] });
}
/** For the health check. */
export function store() {
  const j = Store.entry(); if (!j) return { ok: true, text: "Board pins: none yet (the GM-only store journal is made with the first pin)." };
  const open = Number(j.ownership?.default ?? 0) > 0 || Object.entries(j.ownership ?? {}).some(([u, l]) => u !== "default" && Number(l) > 0 && !game.users.get(u)?.isGM);
  return open ? { ok: false, text: `The "${j.name}" journal is visible to players: set its ownership back to None.` } : { ok: true, text: `Board pins: ${pinStore().pins.length}, kept in a GM-only journal.` };
}
let deps = { session: null, check: null };
export function init(d) { deps = { ...deps, ...d }; }

/** The quest adapter: the toolkit's API when it is active, else its quest flags, else nothing. */
export function questSource() {
  const tk = game.modules.get(TOOLKIT_ID);
  if (!tk?.active) return [];
  try {
    const list = tk.api?.quests?.list?.();
    if (Array.isArray(list)) return list.map(q => ({ ...q, uuid: `JournalEntry.${q.id}` }));
  } catch { }
  return game.journal.filter(j => j.flags?.[TOOLKIT_ID]?.quest).map(j => ({ id: j.id, name: j.name, uuid: j.uuid, ...j.flags[TOOLKIT_ID].quest }));
}

export function model() {
  const quests = B.activeQuests(questSource(), { nextCount: Number(get("boardNext")) || 3 });
  const links = B.groupLinks(quests);
  const S = F.on("sessionLog") ? deps.session : null;
  const last = S?.latest?.() ?? null;
  const data = last ? S.dataOf(last) : null;
  return { quests, links, last: last ? { id: last.id, uuid: last.uuid, name: last.name, open: data.open, summary: data.summary, threads: openThreads(data) } : null, pins: pinStore().pins, toolkit: !!game.modules.get(TOOLKIT_ID)?.active };
}

const nameOf = (uuid, fallback = "") => UI.safeSync(uuid)?.name ?? fallback ?? uuid;
const exists = uuid => !!UI.safeSync(uuid);
function rowHTML(uuid, label, extra = "") {
  const gone = !exists(uuid);
  const scene = B.uuidType(uuid) === "Scene" && !gone;
  return `<li class="rb-row ${gone ? "gone" : ""}"><a class="rb-open" data-uuid="${esc(uuid)}">${esc(label || nameOf(uuid, uuid))}</a>${gone ? ` <span class="rb-tag bad">missing</span>` : ""}${extra}
    ${scene ? `<span class="rb-actions"><button type="button" data-action="view" data-uuid="${esc(uuid)}" data-tooltip="View scene"><i class="fa-solid fa-eye"></i></button>${F.on("sceneCheck") && game.user.isGM ? `<button type="button" data-action="check" data-uuid="${esc(uuid)}" data-tooltip="Check readiness"><i class="fa-solid fa-clipboard-check"></i></button>` : ""}</span>` : ""}</li>`;
}

export class Board extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = { id: `${ID}-board`, classes: ["rb-board", UI.WINDOW], window: { title: "Red Book · Next-session board", icon: "fa-solid fa-thumbtack", resizable: true }, position: { width: 720, height: 680 } };
  async _renderHTML() {
    const m = model(); const div = document.createElement("div"); div.className = "rb-board-body";
    const col = (title, icon, body, cls = "") => `<section class="rb-col ${cls}"><h3><i class="${icon}"></i> ${title}</h3>${body}</section>`;
    const quests = !m.toolkit ? `<p class="hint">Active quests come from Wayfarer's Toolkit's quest log when that module is active.</p>`
      : m.quests.length ? `<ul class="rb-list">${m.quests.map(q => rowHTML(q.uuid, q.name, `${q.zone ? ` <span class="rb-tag">${esc(q.zone)}</span>` : ""}${q.next.length ? `<ul class="rb-next">${q.next.map(t => `<li>${esc(t)}</li>`).join("")}${q.more ? `<li class="hint">and ${q.more} more</li>` : ""}</ul>` : ""}`)).join("")}</ul>` : `<p class="hint">No active quests.</p>`;
    const linkList = (l, none) => l.length ? `<ul class="rb-list">${l.map(e => rowHTML(e.uuid, "", ` <span class="hint">${esc(e.from.join(", "))}</span>`)).join("")}</ul>` : `<p class="hint">${none}</p>`;
    const sess = m.last ? `<p>${UI.link(m.last.uuid, m.last.name)}${m.last.open ? ` <span class="rb-tag">open</span>` : ""}</p>
      ${m.last.summary ? `<ul class="rb-counts">${Object.entries(m.last.summary.counts ?? {}).map(([k, n]) => `<li>${esc(TYPES[k]?.label ?? k)}: ${n}</li>`).join("")}</ul>${(m.last.summary.notable ?? []).length ? `<ul class="rb-next">${m.last.summary.notable.slice(0, 8).map(t => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}` : ""}
      <h4>Open threads</h4>${m.last.threads.length ? `<ul class="rb-next">${m.last.threads.map(t => `<li>${esc(t.text)}${t.private ? ` <span class="rb-tag">GM</span>` : ""}</li>`).join("")}</ul>` : `<p class="hint">None.</p>`}`
      : `<p class="hint">${F.on("sessionLog") ? "No session logged yet." : "The session log is turned off."}</p>`;
    const pins = `<div class="rb-drop" data-drop>${m.pins.length ? `<ul class="rb-list">${m.pins.map(p => rowHTML(p.uuid, p.name || "", `<span class="rb-actions"><button type="button" data-action="unpin" data-uuid="${esc(p.uuid)}" data-tooltip="Unpin"><i class="fa-solid fa-xmark"></i></button></span>`)).join("")}</ul>` : ""}<p class="hint">Drop actors, journals, pages, scenes, tables, items, playlists or macros here (up to ${B.PINS_MAX}).</p></div>`;
    div.innerHTML = `<div class="rb-board-grid">
      ${col("Active quests", "fa-solid fa-scroll", quests, "wide")}
      ${col("Last session", "fa-solid fa-book", sess)}
      ${col("Pinned", "fa-solid fa-thumbtack", pins)}
      ${col("NPCs", "fa-solid fa-user-group", linkList(m.links.actors, "No NPCs linked from active quests."))}
      ${col("Journals", "fa-solid fa-book-open", linkList([...m.links.journals, ...m.links.other], "No journals linked from active quests."))}
      ${col("Scenes", "fa-solid fa-map", linkList(m.links.scenes, "No scenes linked from active quests.") + (m.links.scenes.length && F.on("sceneCheck") && game.user.isGM ? `<button type="button" data-action="checkAll"><i class="fa-solid fa-clipboard-check"></i> Check all these scenes</button>` : ""))}
    </div>`;
    return div;
  }
  _replaceHTML(result, content) {
    content.replaceChildren(result);
    content.querySelectorAll(".rb-open").forEach(a => a.addEventListener("click", ev => { ev.preventDefault(); UI.openUuid(a.dataset.uuid); }));
    content.querySelectorAll("button[data-action]").forEach(b => b.addEventListener("click", async ev => {
      ev.preventDefault(); const u = b.dataset.uuid;
      if (b.dataset.action === "view") return UI.safeSync(u)?.view?.();
      if (b.dataset.action === "check") return deps.check?.run?.({ scenes: [u] });
      if (b.dataset.action === "checkAll") return deps.check?.run?.({ scenes: model().links.scenes.map(e => e.uuid) });
      if (b.dataset.action === "unpin") { await savePins(B.removePin(pinStore(), u)); this.render(); }
    }));
    const drop = content.querySelector("[data-drop]");
    if (drop) {
      drop.addEventListener("dragover", ev => { ev.preventDefault(); drop.classList.add("over"); });
      drop.addEventListener("dragleave", () => drop.classList.remove("over"));
      drop.addEventListener("drop", async ev => {
        ev.preventDefault(); drop.classList.remove("over");
        let d = null; try { d = UI.TextEditorImpl().getDragEventData(ev); } catch { }
        const uuid = d?.uuid; if (!uuid) return;
        const doc = UI.safeSync(uuid);
        const r = B.addPin(pinStore(), { uuid, type: d.type ?? doc?.documentName, name: doc?.name ?? "" });
        if (!r.added) return ui.notifications.warn(`Red Book: ${r.why}.`);
        await savePins({ v: r.v, pins: r.pins });
        this.render();
      });
    }
  }
}

let refreshT = null;
/** Re-renders the open board soon (cheap no-op when it isn't showing). */
export function refresh() { if (!APP?.rendered) return; clearTimeout(refreshT); refreshT = setTimeout(() => APP?.rendered && APP.render(), 250); }

export function open() {
  if (!UI.gmOnly()) return null;
  APP ??= new Board();
  return APP.render({ force: true });
}

/** Ready hook (feature on): refresh on the few hooks that can change what it shows. */
export function ready() {
  const j = (doc, changes) => { if (!APP?.rendered) return; if (doc.flags?.[TOOLKIT_ID]?.quest || doc.flags?.[ID]?.session || changes?.flags) refresh(); };
  Hooks.on("updateJournalEntry", j); Hooks.on("createJournalEntry", j); Hooks.on("deleteJournalEntry", () => APP?.rendered && refresh());
  for (const h of ["deleteActor", "deleteScene", "updateScene", "updateActor"]) Hooks.on(h, (doc, changes) => { if (APP?.rendered && (h.startsWith("delete") || (changes && "name" in changes))) refresh(); });
  Hooks.on(`${ID}.sessionEnded`, refresh); Hooks.on(`${ID}.sessionStarted`, refresh);
  Hooks.on("updateJournalEntry", doc => { if (APP?.rendered && doc.flags?.[ID]?.store) refresh(); });
}

const apiRaw = { open, model, refresh, pins: () => pinStore().pins,
  pin: async uuid => { const d = UI.safeSync(uuid); const r = B.addPin(pinStore(), { uuid, type: d?.documentName, name: d?.name }); if (r.added) await savePins({ v: r.v, pins: r.pins }); return r.added; },
  unpin: async uuid => savePins(B.removePin(pinStore(), uuid)) };
/** The board is GM only: for other users every member warns "GM only" and returns undefined. */
export const api = gateApi(apiRaw, () => !!game.user?.isGM, () => ui.notifications.warn("Red Book: GM only."));
