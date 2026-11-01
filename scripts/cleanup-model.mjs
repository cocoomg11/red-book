/**
 * Remove Red Book data: the pure plan (tested in Node). cleanup.mjs reads the world into plain lists; plan() sorts them into
 * categories; nothing is changed until the GM confirms. Only Red Book's own documents (its session logs, recaps, report journals and
 * folders, recognised by their flags) and `flags.red-book` on anything else are touched.
 */
import { dryRun as coreDryRun, hasFlags } from "../vendor/wanderers-core/index.mjs";

/** @type {[string, string, boolean][]} */
export const CATEGORIES = [
  ["sessions", "Session log journals (the GM-only timelines and their notes pages)", false],
  ["store", "The GM-only data journal (the next-session board's pins)", false],
  ["recaps", "Player recap journals made by Share as recap", false],
  ["reports", "Scene check report journals", true],
  ["flags", "Red Book flags on other documents, including ignored scene-check findings (the documents stay; only our flags go)", true],
  ["folders", "Folders Red Book made, once empty", true],
  ["settings", "Reset Red Book's settings to defaults (feature toggles; this browser's Who's online panel spot and fold; reloads)", false]
];
/** Setting scopes "Reset Red Book's settings" covers: the world's, and this browser's client settings (onlineHudPos, onlineHudCollapsed). */
export const SETTING_SCOPES = ["world", "client"];

const flagsOf = d => d?.flags?.["red-book"];
/** What a journal entry is to us: "session", "recap", "report", "store" or null. */
export function kindOf(entry) {
  const f = flagsOf(entry); if (!f || typeof f !== "object") return null;
  if (f.session) return "session";
  if (f.recap) return "recap";
  if (f.reports) return "report";
  if (f.store) return "store";
  return null;
}

/**
 * `world`: { journals: [{ id, name, flags, folder }], folders: [{ id, name, flags, type }], docs: [{ uuid, name, flags }] (every
 * other document that may carry our flags), settings: [{ key, changed }] }. Returns { sessions, recaps, reports, flags, folders, settings },
 * each a list of { id | uuid | key, name }.
 */
/** @param {any} [world] */
export function plan(world = {}) {
  /** @type {Record<string, any[]>} */
  const p = { sessions: [], recaps: [], reports: [], store: [], flags: [], folders: [], settings: [] };
  for (const j of world.journals ?? []) {
    const k = kindOf(j);
    if (k === "session") p.sessions.push({ id: j.id, name: j.name });
    else if (k === "recap") p.recaps.push({ id: j.id, name: j.name });
    else if (k === "report") p.reports.push({ id: j.id, name: j.name });
    else if (k === "store") p.store.push({ id: j.id, name: j.name });
    else if (flagsOf(j) && Object.keys(flagsOf(j)).length) p.flags.push({ uuid: `JournalEntry.${j.id}`, name: j.name });
  }
  for (const d of world.docs ?? []) if (hasFlags(d, "red-book")) p.flags.push({ uuid: d.uuid, name: d.name });
  for (const f of world.folders ?? []) if (flagsOf(f)?.folder) p.folders.push({ id: f.id, name: f.name });
  for (const s of world.settings ?? []) if (s.changed) p.settings.push({ key: s.key, name: s.key });
  return p;
}

/** The folders that can go: ours, and empty once the ticked journals are deleted. `contents`: { folderId: [journal ids] }. */
export function emptyFolders(p, pick, contents = {}, children = {}) {
  const going = new Set([...(pick.sessions ? p.sessions : []), ...(pick.recaps ? p.recaps : []), ...(pick.reports ? p.reports : []), ...(pick.store ? p.store ?? [] : [])].map(j => j.id));
  return p.folders.filter(f => (contents[f.id] ?? []).every(id => going.has(id)) && !(children[f.id] ?? []).length);
}

/** Plain-text dry run: one line per category with its count and the first few names (wanderers-core's dryRun). */
export const dryRun = (p, max = 5) => coreDryRun(CATEGORIES, p, max);
