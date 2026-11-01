/**
 * Scene readiness check (feature "sceneCheck"): read-only. sceneFacts() reads a scene into plain facts, the path cache asks the
 * server whether each file loads, and check-model.mjs turns the facts into findings. A results window lists each scene's findings
 * with a jump-to-fix button; Export writes the report to a GM-only journal. Nothing in the checked scenes is ever changed.
 */
import { ID, MATT_ID, esc } from "./const.mjs";
import * as C from "./check-model.mjs";
import { get } from "./settings.mjs";
import { offRules } from "./settings-model.mjs";
import * as UI from "./ui.mjs";

const safe = UI.safeSync;
const exists = uuid => !!safe(uuid);

/** The background picture: v13's scene.background, v14's initial (or first) level's background. */
export function backgroundOf(scene) {
  try {
    const lv = scene.initialLevel ?? scene.firstLevel ?? scene.levels?.contents?.[0];
    const src = lv?.background?.src ?? scene._source?.background?.src ?? scene.background?.src;
    return src || "";
  } catch { return ""; }
}

/** Plain facts about a scene for checkScene(). */
export function sceneFacts(scene) {
  const env = scene.environment ?? {};
  const tokens = scene.tokens.map(t => {
    const a = t.actor; const pc = !!(a && (a.hasPlayerOwner || a.type === "character"));
    return {
      id: t.id, uuid: t.uuid, name: t.name, img: t.texture?.src ?? "", actorExists: !!a && (!t.actorId || !!game.actors.get(t.actorId) || !t.actorLink),
      actorId: t.actorId, actorUuid: a?.uuid ?? "", actorType: a?.type ?? "", pc, linked: !!t.actorLink, sight: !!t.sight?.enabled,
      hpMax: a?.system?.attributes?.hp?.max ?? null, cr: a?.system?.details?.cr ?? null
    };
  });
  const playlist = scene.playlist;
  const facts = {
    id: scene.id, uuid: scene.uuid, name: scene.name, background: backgroundOf(scene),
    gridType: scene.grid?.type ?? 1, tokenVision: !!scene.tokenVision,
    darkness: Number(env.darknessLevel ?? scene.darkness ?? 0), globalLight: !!(env.globalLight?.enabled ?? scene.globalLight),
    lights: scene.lights.size, walls: { count: scene.walls.size, doors: scene.walls.filter(w => Number(w.door) > 0).length },
    tokens,
    sounds: scene.sounds.map(s => ({ id: s.id, path: s.path ?? "" })),
    tiles: scene.tiles.map(t => ({ id: t.id, img: t.texture?.src ?? "" })),
    drawings: scene.drawings.map(d => ({ id: d.id, img: typeof d.texture === "string" ? d.texture : d.texture?.src ?? "" })),
    notes: scene.notes.map(n => ({ id: n.id, label: n.label || n.entry?.name || "", img: n.texture?.src ?? "", entryId: n.entryId ?? "", entryExists: !!(n.entryId && game.journal.get(n.entryId)), pageId: n.pageId ?? "", pageExists: !!(n.pageId && game.journal.get(n.entryId)?.pages.get(n.pageId)) })),
    playlist: {
      set: !!scene._source?.playlist, exists: !!playlist, soundSet: !!scene._source?.playlistSound, soundExists: !!scene.playlistSound,
      paths: playlist ? playlist.sounds.map(s => ({ playlistId: playlist.id, playlist: playlist.name, name: s.name, path: s.path ?? "" })) : []
    },
    journal: { set: !!scene._source?.journal, exists: !!scene.journal, pageSet: !!scene._source?.journalEntryPage, pageExists: !!scene.journalEntryPage },
    matt: []
  };
  if (game.modules.get(MATT_ID)?.active) {
    for (const t of scene.tiles) {
      let actions = null; try { actions = t.flags?.[MATT_ID]?.actions; } catch { }
      for (const r of C.mattRefs(actions)) facts.matt.push({ ...r, tileId: t.id, exists: exists(r.uuid) });
    }
  }
  return facts;
}

// ---------------------------------------------------------------- paths
async function probe(path) {
  const url = foundry.utils.getRoute?.(path) ?? path;
  const res = await fetch(url, { method: "HEAD", cache: "no-store" });
  if (res.status === 405) { const g = await fetch(url, { method: "GET", cache: "no-store", headers: { Range: "bytes=0-0" } }); return g.ok || g.status === 206; }
  return res.ok;
}
let CACHE = null;
const cache = () => (CACHE ??= new C.PathCache({ probe, concurrency: Number(get("checkConcurrency")) || 4, timeout: (Number(get("checkTimeout")) || 4) * 1000 }));

/** Checks one scene; resolves to { scene, findings, tally }. */
export async function checkOne(scene) {
  const f = sceneFacts(scene);
  const paths = C.scenePaths(f).filter(p => C.checkable(p, location.origin));
  const res = await cache().checkAll(paths);
  const players = game.users.filter(u => u.active && !u.isGM).map(u => ({ id: u.id, name: u.name, hasCharacter: !!u.character }));
  const findings = C.checkScene(f, { paths: res, off: offRules(get), players, dnd5e: game.system.id === "dnd5e", matt: !!game.modules.get(MATT_ID)?.active });
  return { scene: { id: scene.id, uuid: scene.uuid, name: scene.name }, findings, tally: C.tally(findings) };
}

/** Which scenes: { scenes: [uuid | id | Scene], folder: id | Folder, all: true } (default: the viewed scene). */
export function pick({ scenes, folder, all } = {}) {
  if (all) return game.scenes.contents;
  if (folder) {
    const f = typeof folder === "string" ? game.folders.get(folder) : folder; if (!f) return [];
    const ids = new Set([f.id, ...(f.getSubfolders?.(true) ?? []).map(x => x.id)]);
    return game.scenes.filter(s => s.folder && ids.has(s.folder.id));
  }
  if (scenes?.length) return scenes.map(s => (typeof s === "string" ? (game.scenes.get(s) ?? safe(s)) : s)).filter(s => s?.documentName === "Scene");
  return canvas?.scene ? [canvas.scene] : [];
}

/** Runs the check and opens the results window. Resolves to the results. */
export async function run(opts = {}) {
  if (!UI.gmOnly()) return null;
  const list = pick(opts);
  if (!list.length) { ui.notifications.warn("Red Book: no scenes to check."); return []; }
  const app = Results.instance(); app.results = null; app.label = list.length === 1 ? list[0].name : `${list.length} scenes`; app.render({ force: true });
  const results = [];
  for (const s of list) { try { results.push(await checkOne(s)); } catch (e) { results.push({ scene: { id: s.id, uuid: s.uuid, name: s.name }, findings: [{ rule: "background", severity: "note", text: `Couldn't check this scene: ${e.message}`, fix: null }], tally: { problem: 0, warning: 0, note: 1 } }); } }
  app.results = results; app.render();
  return results;
}

/** Writes the results to a GM-only journal "Scene check" with one page per scene (replaced on each export). */
export async function exportReport(results) {
  if (!UI.gmOnly() || !results?.length) return null;
  const when = new Date().toLocaleString();
  let j = game.journal.find(x => x.flags?.[ID]?.reports);
  if (!j) j = await JournalEntry.create({ name: "Scene check", ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE }, flags: { [ID]: { reports: { v: C.REPORT_VERSION } } } });
  const create = [], update = [];
  for (const r of results) {
    const content = C.reportHTML(r.scene.name, r.findings, when);
    const page = j.pages.find(p => p.flags?.[ID]?.scene === r.scene.id);
    if (page) update.push({ _id: page.id, name: r.scene.name, "text.content": content });
    else create.push({ name: r.scene.name, type: "text", text: { content }, flags: { [ID]: { scene: r.scene.id } } });
  }
  if (create.length) await j.createEmbeddedDocuments("JournalEntryPage", create);
  if (update.length) await j.updateEmbeddedDocuments("JournalEntryPage", update);
  ui.notifications.info(`Red Book: report written to the "${j.name}" journal.`);
  j.sheet?.render(true);
  return j;
}

/** Jump-to-fix: opens the thing a finding is about. */
async function fix(sceneId, f) {
  const scene = game.scenes.get(sceneId); if (!scene || !f) return;
  const embedded = { token: "tokens", tile: "tiles", drawing: "drawings", note: "notes", sound: "sounds", light: "lights" }[f.kind];
  if (f.kind === "scene") return scene.sheet?.render(true);
  if (f.kind === "actor") return safe(f.id)?.sheet?.render(true);
  if (f.kind === "playlist") return game.playlists.get(f.id)?.sheet?.render(true);
  if (f.kind === "users") return game.users.get(f.id)?.sheet?.render(true);
  if (embedded) {
    const doc = scene[embedded].get(f.id); if (!doc) return;
    if (canvas.scene?.id !== scene.id) await scene.view();
    const obj = doc.object; if (obj) { canvas.animatePan?.({ x: obj.center?.x ?? doc.x, y: obj.center?.y ?? doc.y, duration: 300 }); obj.layer?.activate?.(); obj.control?.({ releaseOthers: true }); }
    return doc.sheet?.render(true);
  }
}

export class Results extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = { id: `${ID}-check`, classes: ["rb-check", UI.WINDOW], window: { title: "Red Book · Scene readiness", icon: "fa-solid fa-clipboard-check", resizable: true }, position: { width: 620, height: 600 } };
  static #app = null;
  static instance() { return (Results.#app ??= new Results()); }
  async _renderHTML() {
    const div = document.createElement("div"); div.className = "rb-check-body";
    if (!this.results) { div.innerHTML = `<p><i class="fa-solid fa-spinner fa-spin"></i> Checking ${esc(this.label ?? "")}…</p>`; return div; }
    const tot = this.results.reduce((t, r) => ({ problem: t.problem + r.tally.problem, warning: t.warning + r.tally.warning, note: t.note + r.tally.note }), { problem: 0, warning: 0, note: 0 });
    div.innerHTML = `<p class="rb-total">${this.results.length > 1 ? `${this.results.length} scenes: ` : ""}${esc(C.tallyText(tot))}. Read-only: nothing was changed.</p>
      ${this.results.map(r => `<details class="rb-scene" ${this.results.length === 1 || r.tally.problem ? "open" : ""}><summary><strong>${esc(r.scene.name)}</strong> <span class="hint">${esc(C.tallyText(r.tally))}</span></summary>
        ${r.findings.length ? `<ul class="rb-findings">${r.findings.map((f, i) => `<li class="rb-${f.severity}"><span class="rb-sev">${f.severity}</span> <span class="rb-text">${esc(f.text)}</span>${f.fix ? `<button type="button" data-scene="${r.scene.id}" data-i="${i}" data-tooltip="Open it"><i class="fa-solid fa-wrench"></i></button>` : ""}</li>`).join("")}</ul>` : "<p>Nothing to fix.</p>"}</details>`).join("")}
      <footer class="form-footer"><button type="button" data-action="rerun"><i class="fa-solid fa-rotate"></i> Check again</button><button type="button" data-action="export"><i class="fa-solid fa-file-export"></i> Export to journal</button></footer>`;
    return div;
  }
  _replaceHTML(result, content) {
    content.replaceChildren(result);
    content.querySelectorAll("button[data-scene]").forEach(b => b.addEventListener("click", () => {
      const r = this.results?.find(x => x.scene.id === b.dataset.scene); fix(b.dataset.scene, r?.findings[Number(b.dataset.i)]?.fix);
    }));
    content.querySelector("[data-action=export]")?.addEventListener("click", () => exportReport(this.results));
    content.querySelector("[data-action=rerun]")?.addEventListener("click", () => { cache().clear(); run({ scenes: (this.results ?? []).map(r => r.scene.id) }); });
  }
}

/** Asks which scenes to check. */
export async function chooser() {
  if (!UI.gmOnly()) return;
  const folders = game.folders.filter(f => f.type === "Scene");
  const f = await UI.form("Scene readiness check", `<div class="form-group"><label>Check</label><select name="what">
      <option value="viewed">The viewed scene${canvas?.scene ? ` (${esc(canvas.scene.name)})` : ""}</option>
      <option value="scene">One scene…</option>${folders.length ? `<option value="folder">A folder…</option>` : ""}<option value="all">Every scene (${game.scenes.size})</option></select></div>
    <div class="form-group"><label>Scene</label><select name="scene">${game.scenes.contents.sort((a, b) => a.name.localeCompare(b.name)).map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select></div>
    ${folders.length ? `<div class="form-group"><label>Folder</label><select name="folder">${folders.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}</select></div>` : ""}`, "Check");
  if (!f) return;
  if (f.what === "all") return run({ all: true });
  if (f.what === "folder") return run({ folder: f.folder });
  if (f.what === "scene") return run({ scenes: [f.scene] });
  return run({});
}

/** Scene directory context menu entry (v13 and v14 entry shapes both given). */
export function contextOptions(options) {
  if (!Array.isArray(options)) return;
  const sceneOf = li => game.scenes.get((li?.dataset ?? li?.[0]?.dataset)?.entryId);
  const go = li => { const s = sceneOf(li); if (s) run({ scenes: [s] }); };
  const icon = `<i class="fa-solid fa-clipboard-check"></i>`;
  // v14 entries are { label, icon, visible, onClick(event, target) }; v13 used { name, icon, condition, callback(li) }. Only one shape
  // is given so an entry never runs twice.
  const entry = (game.release?.generation ?? 13) >= 14
    ? { label: "Check readiness", icon: "fa-solid fa-clipboard-check", visible: () => game.user.isGM, onClick: (ev, target) => go(target ?? ev?.currentTarget) }
    : { name: "Check readiness", icon, condition: () => game.user.isGM, callback: li => go(li) };
  options.push(entry);
}

export const api = { run, chooser, checkOne, facts: sceneFacts, exportReport, rules: C.RULES, clearCache: () => cache().clear() };
