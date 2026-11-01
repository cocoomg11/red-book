/**
 * Localisation for the 0.4.0 UI (lang/en.json, keys under "REDBOOK."). Pure: reads `game.i18n` when Foundry is there, else returns
 * the key (tests install a small shim built from lang/en.json). Format data is plain text; callers escape the result before it goes
 * into HTML (the views do).
 */
export const PREFIX = "REDBOOK.";

/**
 * The string for `key` (without the prefix), with `{name}` placeholders filled from `data`.
 * @param {string} key
 * @param {Record<string, unknown>} [data]
 * @returns {string}
 */
export function t(key, data) {
  const i = /** @type {any} */ (globalThis).game?.i18n;
  const k = PREFIX + key;
  if (!i) return key;
  if (data) return i.format(k, Object.fromEntries(Object.entries(data).map(([n, v]) => [n, String(v ?? "")])));
  return i.localize(k);
}

/**
 * Flattens a nested lang object ({ REDBOOK: { Nav: { Session: "…" } } }) into { "REDBOOK.Nav.Session": "…" }, the way Foundry reads it.
 * @param {Record<string, unknown>} obj
 * @param {string} [pre]
 * @returns {Record<string, string>}
 */
export function flatten(obj, pre = "") {
  /** @type {Record<string, string>} */ const out = {};
  for (const [k, v] of Object.entries(obj ?? {})) {
    const key = pre ? `${pre}.${k}` : k;
    if (v && typeof v === "object") Object.assign(out, flatten(/** @type {any} */ (v), key)); else out[key] = String(v);
  }
  return out;
}
