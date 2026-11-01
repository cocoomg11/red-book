/**
 * Scene readiness check (feature "sceneCheck"): read-only. sceneFacts() reads a scene into plain facts, the path cache asks the
 * server whether each file loads, and check-model.mjs turns the facts into findings. A results window lists each scene's findings
 * with a jump-to-fix button (the Red Book window's Scene check page, 0.4.0: master–detail, last results kept in this tab's memory
 * only); Export writes the report to a GM-only journal. Nothing in the checked scenes is ever changed, except
 * the GM's own list of ignored findings (flags.red-book.ignoredChecks on the scene, written only on a GM's click).
 */
import { ID, MATT_ID, TOOLKIT_ID, esc } from "./const.mjs";
import * as C from "./check-model.mjs";
import { get } from "./core.mjs";
import { offRules } from "./settings-model.mjs";
import * as UI from "./ui.mjs";
import * as Panel from "./panel.mjs";

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
      id: t.id, uuid: t.uuid, name: t.name, img: t.texture?.src ?? "", actorExists: !!a && (!t.actorId || !!game.actors.get(t.actorId)),
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
    // The toolkit's map pins are Note documents with flags.wayfarers-toolkit.pin: the party's own marks, never linked to a journal.
    notes: scene.notes.filter(n => !C.isToolkitPin(n, TOOLKIT_ID)).map(n => ({ id: n.id, label: n.label || n.entry?.name || "", img: n.texture?.src ?? "", entryId: n.entryId ?? "", entryExists: !!(n.entryId && game.journal.get(n.entryId)), pageId: n.pageId ?? "", pageExists: !!(n.pageId && game.journal.get(n.entryId)?.pages.get(n.pageId)) })),
    playlist: {
      set: !!scene._source?.playlist, exists: !!playlist, soundSet: !!scene._source?.playlistSound, soundExists: !!scene.playlistSound,
      paths: playlist ? playlist.sounds.map(s => ({ playlistId: playlist.id, soundId: s.id, playlist: playlist.name, name: s.name, path: s.path ?? "" })) : []
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
  const all = C.checkScene(f, { paths: res, off: offRules(get), players, dnd5e: game.system.id === "dnd5e", matt: !!game.modules.get(MATT_ID)?.active });
  return C.applyIgnored({ scene: { id: scene.id, uuid: scene.uuid, name: scene.name }, all }, ignoredOf(scene));
}

// ---------------------------------------------------------------- ignored findings (GM only; stored on the scene)
const sceneOf = s => (typeof s === "string" ? game.scenes.get(s) : s);
/** A scene's raw ignore store (normalised by the model). */
export const ignoredOf = scene => sceneOf(scene)?.getFlag?.(ID, C.IGNORED_FLAG) ?? null;
async function writeIgnored(scene, store) {
  if (!store.entries.length) return scene.unsetFlag(ID, C.IGNORED_FLAG);
  return scene.setFlag(ID, C.IGNORED_FLAG, store);
}
/** Ignores one finding (by its key) on a scene. */
export async function ignore(scene, key) {
  const s = sceneOf(scene); if (!UI.gmOnly() || !s || !key) return null;
  return writeIgnored(s, C.addIgnored(ignoredOf(s), String(key), { by: game.user.id, name: game.user.name }));
}
/** Stops ignoring one finding on a scene. */
export async function unignore(scene, key) {
  const s = sceneOf(scene); if (!UI.gmOnly() || !s || !key) return null;
  return writeIgnored(s, C.removeIgnored(ignoredOf(s), String(key)));
}
/** Wipes a scene's ignored findings. */
export async function clearIgnored(scene) {
  const s = sceneOf(scene); if (!UI.gmOnly() || !s) return null;
  return s.unsetFlag(ID, C.IGNORED_FLAG);
}
/** Wipes the ignored findings on every scene (after a confirm unless `confirm: false`). Resolves to the number of scenes cleared, or null. */
export async function clearAllIgnored({ confirm = true } = {}) {
  if (!UI.gmOnly()) return null;
  const ids = C.scenesWithIgnored(game.scenes.map(s => ({ id: s.id, flags: s.flags })));
  if (!ids.length) { ui.notifications.info("Red Book: no scene has ignored findings."); return 0; }
  if (confirm && !(await UI.confirm("Clear all ignored warnings", `<p>Stop ignoring every ignored scene-check finding on ${ids.length === 1 ? "1 scene" : `${ids.length} scenes`}? They will count again on the next check.</p>`))) return null;
  let n = 0;
  for (const id of ids) { try { await game.scenes.get(id)?.unsetFlag(ID, C.IGNORED_FLAG); n++; } catch (e) { console.warn(`${ID} | clear ignored ${id}`, e); } }
  ui.notifications.info(`Red Book: ignored findings cleared on ${n === 1 ? "1 scene" : `${n} scenes`}.`);
  refreshIgnored();
  return n;
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

// ---------------------------------------------------------------- results memory (GM client only; never saved to the world)
/** The last result per scene, kept in this tab's memory until reload. */
const MEMORY = new C.ResultMemory();
export const memory = () => MEMORY;

/** Checks one scene into memory and refreshes the window (`fresh`: ask the server about every file again). Resolves to the result. */
export async function checkInto(sceneRef, { fresh = false } = {}) {
  if (!UI.gmOnly()) return null;
  const s = sceneOf(sceneRef); if (!s) return null;
  if (fresh) cache().clear();
  MEMORY.pending(s.id); Panel.refresh("check");
  let r;
  try { r = await checkOne(s); } catch (e) { r = failed(s, e); }
  MEMORY.set(s.id, r); Panel.refresh("check");
  return r;
}
const failed = (s, e) => ({ scene: { id: s.id, uuid: s.uuid, name: s.name }, findings: [{ rule: "background", severity: "note", text: `Couldn't check this scene: ${e?.message ?? e}`, fix: null, key: "" }], ignored: [], stored: 0, tally: { problem: 0, warning: 0, note: 1 } });

/**
 * Runs the check on the picked scenes and opens the Red Book window's Scene check page on the first scene (the first with a
 * problem when there are several). Resolves to the results (as before 0.4.0).
 */
export async function run(opts = {}) {
  if (!UI.gmOnly()) return null;
  const list = pick(opts);
  if (!list.length) { ui.notifications.warn("Red Book: no scenes to check."); return []; }
  for (const s of list) MEMORY.pending(s.id);
  Panel.openCheck(list[0].id);
  const results = [];
  for (const s of list) {
    let r; try { r = await checkOne(s); } catch (e) { r = failed(s, e); }
    MEMORY.set(s.id, r); results.push(r); Panel.refresh("check");
  }
  const first = results.find(r => r.tally.problem) ?? results[0];
  if (list.length > 1 && first) Panel.openCheck(first.scene.id);
  return results;
}

/** Re-applies each remembered scene's ignore store (no new check) and refreshes the window. */
export function refreshIgnored() {
  for (const [id, r] of Object.entries(MEMORY.all())) if (r?.all) MEMORY.set(id, C.applyIgnored(r, ignoredOf(id)));
  Panel.refresh("check");
}
/** Waits for an ignore write, then refreshes (an error is reported, not thrown). */
export function ignoreAndRefresh(p) {
  return Promise.resolve(p).then(() => refreshIgnored(), e => { console.warn(`${ID} | ignore`, e); ui.notifications.error("Red Book: couldn't save the ignored list (see console)."); });
}
/** Jump-to-fix for the i-th finding (or ignored finding) of a remembered result. */
export function fixFinding(sceneId, i, ignored = false) {
  const r = MEMORY.get(sceneId); if (!r || r.pending) return undefined;
  return fix(sceneId, (ignored ? r.ignored : r.findings)?.[i]?.fix);
}

/** Writes the results to a GM-only journal "Scene check" with one page per scene (replaced on each export). */
export async function exportReport(results) {
  if (!UI.gmOnly() || !results?.length) return null;
  const when = new Date().toLocaleString();
  let j = game.journal.find(x => x.flags?.[ID]?.reports);
  if (!j) j = await JournalEntry.create({ name: "Scene check", ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE }, flags: { [ID]: { reports: { v: C.REPORT_VERSION } } } });
  const create = [], update = [];
  for (const r of results) {
    const content = C.reportHTML(r.scene.name, r.findings, when, r.ignored ?? []);
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
  if (!Array.isArray(options) || !game.user?.isGM) return;
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

const apiRaw = {
  run, chooser, checkOne, facts: sceneFacts, exportReport, rules: C.RULES, clearCache: () => cache().clear(),
  ignored: scene => C.normalizeIgnored(ignoredOf(scene)).entries, ignore, unignore, clearIgnored, clearAllIgnored,
  /** Experimental (0.4.0): the last result per scene this load ({ sceneId: result }). */
  results: () => MEMORY.all(), open: sceneId => Panel.openCheck(sceneId)
};
/** Scene check is GM-only: non-GM users get a "GM only" notice and undefined from every member. */
export const api = C.gateApi(apiRaw, () => !!game.user?.isGM, () => ui.notifications.warn("Red Book: GM only."));
