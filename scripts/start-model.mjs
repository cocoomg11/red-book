/**
 * Session Start, the pure part (tested in Node): which scenes the dialog offers. The setting `hiddenScenes` is a regular expression
 * (the same format the companion toolkit used, so a migrated value works unchanged); scenes whose name matches are left out. A blank
 * or broken pattern hides nothing.
 */

/** The pattern as a RegExp that matches nothing when blank or unreadable. */
export function hiddenPattern(src) {
  const s = String(src ?? "");
  if (!s) return /(?!)/;
  try { return new RegExp(s); } catch { return /(?!)/; }
}

/** Scenes offered by Session Start: not hidden, sorted by name. `scenes`: [{ id, name }]. */
export function sceneChoices(scenes = [], hidden = "") {
  const re = hiddenPattern(hidden);
  return scenes.filter(s => s && !re.test(String(s.name ?? ""))).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
