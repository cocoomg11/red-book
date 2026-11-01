/**
 * Remove Red Book data: the pure plan (tested in Node). cleanup.mjs reads the world into plain lists; plan() sorts them into
 * categories; nothing is changed until the GM confirms. Only Red Book's own documents (its session logs, recaps, report journals and
 * folders, recognised by their flags) and `flags.red-book` on anything else are touched.
 */
export const CATEGORIES = [
  ["sessions", "Session log journals (the GM-only timelines and their notes pages)", false],
  ["recaps", "Player recap journals made by Share as recap", false],
  ["reports", "Scene check report journals", true],
  ["flags", "Red Book flags on other documents (they stay; only our flags go)", true],
  ["folders", "Folders Red Book made, once empty", true],
  ["settings", "Reset Red Book's settings to defaults (feature toggles, pins; reloads)", false]
];

const flagsOf = d => d?.flags?.["red-book"];
/** What a journal entry is to us: "session", "recap", "report" or null. */
export function kindOf(entry) {
  const f = flagsOf(entry); if (!f || typeof f !== "object") return null;
  if (f.session) return "session";
  if (f.recap) return "recap";
  if (f.reports) return "report";
  return null;
}

/**
 * `world`: { journals: [{ id, name, flags, folder }], folders: [{ id, name, flags, type }], docs: [{ uuid, name, flags }] (every
 * other document that may carry our flags), settings: [{ key, changed }] }. Returns { sessions, recaps, reports, flags, folders, settings },
 * each a list of { id | uuid | key, name }.
 */
export function plan(world = {}) {
  const p = { sessions: [], recaps: [], reports: [], flags: [], folders: [], settings: [] };
  for (const j of world.journals ?? []) {
    const k = kindOf(j);
    if (k === "session") p.sessions.push({ id: j.id, name: j.name });
    else if (k === "recap") p.recaps.push({ id: j.id, name: j.name });
    else if (k === "report") p.reports.push({ id: j.id, name: j.name });
    else if (flagsOf(j) && Object.keys(flagsOf(j)).length) p.flags.push({ uuid: `JournalEntry.${j.id}`, name: j.name });
  }
  for (const d of world.docs ?? []) if (flagsOf(d) && typeof flagsOf(d) === "object" && Object.keys(flagsOf(d)).length) p.flags.push({ uuid: d.uuid, name: d.name });
  for (const f of world.folders ?? []) if (flagsOf(f)?.folder) p.folders.push({ id: f.id, name: f.name });
  for (const s of world.settings ?? []) if (s.changed) p.settings.push({ key: s.key, name: s.key });
  return p;
}

/** The folders that can go: ours, and empty once the ticked journals are deleted. `contents`: { folderId: [journal ids] }. */
export function emptyFolders(p, pick, contents = {}, children = {}) {
  const going = new Set([...(pick.sessions ? p.sessions : []), ...(pick.recaps ? p.recaps : []), ...(pick.reports ? p.reports : [])].map(j => j.id));
  return p.folders.filter(f => (contents[f.id] ?? []).every(id => going.has(id)) && !(children[f.id] ?? []).length);
}

/** Plain-text dry run: one line per category with its count and the first few names. */
export function dryRun(p, max = 5) {
  return CATEGORIES.map(([k, label]) => {
    const list = p[k] ?? [];
    const names = list.slice(0, max).map(x => x.name).join(", ");
    return { key: k, label, count: list.length, text: `${label}: ${list.length}${list.length ? ` (${names}${list.length > max ? ", …" : ""})` : ""}` };
  });
}
