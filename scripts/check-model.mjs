/**
 * Scene readiness check: the pure part (no Foundry calls; tested in Node). check.mjs reads a scene into plain "facts" and the paths
 * into a result map; checkScene() turns them into findings. Nothing here (or there) changes a document.
 *
 * Finding: { rule, severity: "problem" | "warning" | "note", text, fix: { kind, id } | null, key }
 *   fix kinds: "scene" (scene config), "token", "actor", "tile", "drawing", "note", "sound", "playlist", "journal", "users", "light".
 *   key: stable id of this one finding, used to ignore it (see findingKey).
 */
import { esc, plural } from "./const.mjs";

export const SEVERITIES = ["problem", "warning", "note"];
export const REPORT_VERSION = 1;

/** Every rule: label (settings and report), hint. Each is a world setting `check-<id>` (Advanced), default on. */
export const RULES = {
  background: { label: "Background image", hint: "The scene has a background image and it loads." },
  grid: { label: "Grid", hint: "Battle maps have a grid." },
  walls: { label: "Walls", hint: "Battle maps (not theatre-of-the-mind or backdrop scenes) have walls." },
  doors: { label: "Doors", hint: "A map with many walls usually has at least one door." },
  lights: { label: "Lights in dark scenes", hint: "A dark scene with no global light has at least one light." },
  vision: { label: "Player token vision", hint: "Player character tokens have vision on when token vision is on." },
  tokenActor: { label: "Token actors", hint: "Every token's actor still exists." },
  tokenLink: { label: "Token links", hint: "Player characters are linked; one linked NPC isn't used for several tokens." },
  tokenImage: { label: "Token images", hint: "Token images load." },
  npcStats: { label: "NPC stats (dnd5e)", hint: "NPCs have hit points and a challenge rating." },
  sounds: { label: "Sounds", hint: "Ambient sounds and the scene playlist exist and their files load." },
  images: { label: "Tile, drawing and note images", hint: "Tile, drawing and map-note images load." },
  notes: { label: "Map notes", hint: "Map notes link to journals and pages that exist." },
  activeTiles: { label: "Active tile actions", hint: "Monk's Active Tiles actions don't point at deleted documents (only when that module is active)." },
  sceneJournal: { label: "Scene journal", hint: "The journal (and page) linked in the scene config exists." },
  players: { label: "Player characters", hint: "Connected players have a character assigned." }
};
export const ruleKey = id => `check-${id}`;

/** Defaults the heuristics use; the GM can't change these (they're judgement calls written down). */
export const LIMITS = { darkAt: 0.5, doorsAfterWalls: 20 };

/**
 * Whether a scene looks like a theatre-of-the-mind or backdrop scene (no walls expected): gridless, or no tokens with token vision
 * off, or a name that says so.
 */
export function isTheatre(f = {}) {
  if (/\b(theat(re|er)|backdrop|splash|landing|title|menu|intermission|loading)\b/i.test(f.name ?? "")) return true;
  if (f.gridType === 0) return true;
  return !f.tokenVision && !(f.tokens ?? []).length;
}

/** A path's result in a `paths` map: true loads, false missing, null/undefined not checked (timed out, outside this server). */
const bad = (paths, p) => !!p && paths?.[p] === false;
const slow = (paths, p) => !!p && paths?.[p] === null;

/**
 * Findings for one scene. `facts`: see check.mjs `sceneFacts`. `paths`: { [path]: true | false | null }. `off`: rule ids turned off.
 * `players`: [{ id, name, hasCharacter }] connected non-GM users. `dnd5e`: the system is dnd5e. `matt`: Monk's Active Tiles active.
 */
export function checkScene(f, { paths = {}, off = [], players = [], dnd5e = false, matt = false } = {}) {
  const out = []; const want = id => !off.includes(id);
  // `variant` tells apart two findings of one rule about the same thing; `subject` is the thing (default: the fix target unless it's the scene).
  const add = (rule, severity, text, fix = null, { variant = "", subject } = {}) =>
    out.push({ rule, severity, text, fix, key: findingKey(rule, subject ?? (fix && fix.kind !== "scene" ? fix.id : ""), variant) });
  const theatre = isTheatre(f);
  const tokens = f.tokens ?? [];

  if (want("background")) {
    if (!f.background) { if (!theatre || !(f.tiles ?? []).length) add("background", theatre ? "note" : "warning", "No background image.", { kind: "scene", id: f.id }); }
    else if (bad(paths, f.background)) add("background", "problem", `Background image doesn't load: ${f.background}`, { kind: "scene", id: f.id }, { variant: "broken" });
    else if (slow(paths, f.background)) add("background", "note", `Background image couldn't be checked: ${f.background}`, { kind: "scene", id: f.id }, { variant: "unchecked" });
  }
  if (want("grid") && !theatre && f.gridType === 0) add("grid", "note", "Gridless scene with tokens on it.", { kind: "scene", id: f.id });
  if (want("walls") && !theatre && !f.walls?.count) add("walls", "warning", "No walls: tokens can see and move through everything.", { kind: "scene", id: f.id });
  if (want("doors") && !theatre && (f.walls?.count ?? 0) >= LIMITS.doorsAfterWalls && !f.walls?.doors) add("doors", "note", `${plural(f.walls.count, "wall")} and no doors.`, { kind: "scene", id: f.id });
  if (want("lights") && (Number(f.darkness) || 0) >= LIMITS.darkAt && !f.globalLight && !f.lights) add("lights", "warning", "Dark scene with no lights and no global light.", { kind: "scene", id: f.id });

  const linkedNpc = new Map();
  for (const t of tokens) {
    const label = t.name || "Token";
    if (want("tokenActor") && !t.actorExists) { add("tokenActor", "problem", `${label}: its actor was deleted.`, { kind: "token", id: t.id }); continue; }
    const pc = t.pc;
    if (want("vision") && pc && f.tokenVision && !t.sight) add("vision", "warning", `${label}: player character token without vision.`, { kind: "token", id: t.id });
    if (want("tokenLink") && pc && !t.linked) add("tokenLink", "warning", `${label}: player character token isn't linked to its actor (changes won't reach the character sheet).`, { kind: "token", id: t.id });
    if (!pc && t.linked && t.actorId) { const l = linkedNpc.get(t.actorId) ?? []; l.push(t); linkedNpc.set(t.actorId, l); }
    if (want("tokenImage") && bad(paths, t.img)) add("tokenImage", "problem", `${label}: image doesn't load: ${t.img}`, { kind: "token", id: t.id });
    if (want("npcStats") && dnd5e && !pc && t.actorType === "npc") {
      if (!(Number(t.hpMax) > 0)) add("npcStats", "warning", `${label}: no hit points (max 0).`, { kind: "actor", id: t.actorUuid }, { variant: "hp", subject: t.id });
      if (t.cr === null || t.cr === undefined || t.cr === "") add("npcStats", "note", `${label}: no challenge rating.`, { kind: "actor", id: t.actorUuid }, { variant: "cr", subject: t.id });
    }
  }
  if (want("tokenLink")) for (const [, list] of linkedNpc) if (list.length > 1) add("tokenLink", "warning", `${list[0].name}: ${list.length} tokens share one linked NPC actor (damage to one hits all).`, { kind: "token", id: list[0].id }, { variant: "shared", subject: list[0].actorId });

  if (want("sounds")) {
    for (const s of f.sounds ?? []) {
      if (!s.path) add("sounds", "warning", `Ambient sound with no file.`, { kind: "sound", id: s.id });
      else if (bad(paths, s.path)) add("sounds", "problem", `Ambient sound doesn't load: ${s.path}`, { kind: "sound", id: s.id }, { variant: "broken" });
    }
    if (f.playlist?.set && !f.playlist.exists) add("sounds", "problem", "The scene's playlist was deleted.", { kind: "scene", id: f.id }, { variant: "playlist" });
    if (f.playlist?.soundSet && !f.playlist.soundExists) add("sounds", "problem", "The scene's playlist sound was deleted.", { kind: "scene", id: f.id }, { variant: "playlistSound" });
    for (const p of f.playlist?.paths ?? []) if (bad(paths, p.path)) add("sounds", "problem", `Playlist "${p.playlist}": ${p.name} doesn't load: ${p.path}`, { kind: "playlist", id: p.playlistId }, { variant: "playlistFile", subject: `${p.playlistId}.${p.soundId || p.name}` });
  }
  if (want("images")) {
    for (const t of f.tiles ?? []) if (bad(paths, t.img)) add("images", "problem", `Tile image doesn't load: ${t.img}`, { kind: "tile", id: t.id }, { variant: "tile" });
    for (const d of f.drawings ?? []) if (bad(paths, d.img)) add("images", "problem", `Drawing texture doesn't load: ${d.img}`, { kind: "drawing", id: d.id }, { variant: "drawing" });
    for (const n of f.notes ?? []) if (bad(paths, n.img)) add("images", "warning", `Map note icon doesn't load: ${n.img}`, { kind: "note", id: n.id }, { variant: "note" });
  }
  if (want("notes")) for (const n of f.notes ?? []) {
    const label = n.label ? `Map note "${n.label}"` : "Map note";
    if (n.entryId && !n.entryExists) add("notes", "problem", `${label}: its journal was deleted.`, { kind: "note", id: n.id }, { variant: "journal" });
    else if (n.pageId && !n.pageExists) add("notes", "problem", `${label}: its page was deleted.`, { kind: "note", id: n.id }, { variant: "page" });
    else if (!n.entryId) add("notes", "note", `${label} isn't linked to a journal.`, { kind: "note", id: n.id }, { variant: "unlinked" });
  }
  if (want("activeTiles") && matt) for (const r of f.matt ?? []) if (r.exists === false) add("activeTiles", "problem", `Active tile action ${r.index + 1} (${r.action || "action"}) points at a missing document: ${r.uuid}`, { kind: "tile", id: r.tileId }, { subject: `${r.tileId}.${r.index}.${r.uuid}` });
  if (want("sceneJournal")) {
    if (f.journal?.set && !f.journal.exists) add("sceneJournal", "problem", "The journal linked in the scene config was deleted.", { kind: "scene", id: f.id }, { variant: "journal" });
    else if (f.journal?.pageSet && !f.journal.pageExists) add("sceneJournal", "problem", "The journal page linked in the scene config was deleted.", { kind: "scene", id: f.id }, { variant: "page" });
  }
  if (want("players")) for (const u of players) if (!u.hasCharacter) add("players", "warning", `${u.name} is connected with no character assigned.`, { kind: "users", id: u.id });

  const rank = s => SEVERITIES.indexOf(s);
  return out.sort((a, b) => rank(a.severity) - rank(b.severity));
}

// ---------------------------------------------------------------- ignored findings
/**
 * A finding's stable key: `rule[.variant][:subject]`. Scene-wide findings have no subject (key = rule id, or rule.variant when one rule
 * can say two different things about the scene); findings about a token, tile, note, sound, user… end in that thing's id.
 */
export function findingKey(rule, subject = "", variant = "") {
  return `${rule}${variant ? `.${variant}` : ""}${subject ? `:${subject}` : ""}`;
}
export const IGNORED_FLAG = "ignoredChecks";
export const IGNORED_VERSION = 1;
export const IGNORED_MAX = 500;
/**
 * The ignored-findings store kept on each scene, `flags.red-book.ignoredChecks`: { v, entries: [{ key, at, by, name }] }
 * (`at` ms time stamp, `by` user id, `name` that user's name then). Entries are kept even when the finding stops showing up.
 * An array, not an object keyed by finding key, so a write replaces the whole list (no key-deletion syntax needed).
 */
export function normalizeIgnored(raw) {
  const list = Array.isArray(raw?.entries) ? raw.entries : [];
  const seen = new Map();
  for (const e of list) {
    if (!e || typeof e.key !== "string" || !e.key) continue;
    seen.delete(e.key);
    seen.set(e.key, { key: e.key.slice(0, 300), at: Number(e.at) || 0, by: String(e.by ?? ""), name: String(e.name ?? "") });
  }
  return { v: IGNORED_VERSION, entries: [...seen.values()].slice(-IGNORED_MAX) };
}
/** The store with `key` ignored (an existing entry for it is replaced; past the cap the oldest go). */
export function addIgnored(raw, key, { by = "", name = "", now = Date.now(), max = IGNORED_MAX } = {}) {
  const s = normalizeIgnored(raw);
  const entries = [...s.entries.filter(e => e.key !== key), { key, at: now, by, name }];
  return { v: IGNORED_VERSION, entries: entries.slice(-max) };
}
/** The store without `key`. */
export function removeIgnored(raw, key) {
  const s = normalizeIgnored(raw);
  return { v: IGNORED_VERSION, entries: s.entries.filter(e => e.key !== key) };
}
/** Splits findings into { active, ignored }; each ignored finding carries its entry as `ignore`. Unmatched entries are left alone. */
export function splitIgnored(findings = [], raw) {
  const byKey = new Map(normalizeIgnored(raw).entries.map(e => [e.key, e]));
  const active = [], ignored = [];
  for (const f of findings) { const e = f?.key && byKey.get(f.key); if (e) ignored.push({ ...f, ignore: e }); else active.push(f); }
  return { active, ignored };
}
/**
 * A scene's result with the ignore store applied: `all` every finding, `findings` the ones that count, `ignored` the hidden ones,
 * `tally` of `findings` only, `stored` how many entries the scene's store holds (shown or not).
 */
export function applyIgnored(result, raw) {
  const all = result.all ?? result.findings ?? [];
  const { active, ignored } = splitIgnored(all, raw);
  return { ...result, all, findings: active, ignored, tally: tally(active), stored: normalizeIgnored(raw).entries.length };
}
/** Ids of the scenes whose store has entries: [{ id, flags }] in, ids out (for "Clear all ignored warnings"). */
export function scenesWithIgnored(scenes = []) {
  return scenes.filter(s => normalizeIgnored(s?.flags?.["red-book"]?.[IGNORED_FLAG]).entries.length).map(s => s.id);
}

/** Counts per severity. */
export function tally(findings = []) {
  const t = { problem: 0, warning: 0, note: 0 };
  for (const x of findings) if (x.severity in t) t[x.severity]++;
  return t;
}
export const tallyText = t => [t.problem && plural(t.problem, "problem"), t.warning && plural(t.warning, "warning"), t.note && plural(t.note, "note")].filter(Boolean).join(", ") || "all clear";

/** Every path the scene uses, once each (data: URIs and blanks skipped). */
export function scenePaths(f = {}) {
  const out = new Set();
  const push = p => { if (typeof p === "string" && p.trim() && !p.startsWith("data:")) out.add(p.trim()); };
  push(f.background);
  for (const t of f.tokens ?? []) push(t.img);
  for (const s of f.sounds ?? []) push(s.path);
  for (const p of f.playlist?.paths ?? []) push(p.path);
  for (const t of f.tiles ?? []) push(t.img);
  for (const d of f.drawings ?? []) push(d.img);
  for (const n of f.notes ?? []) push(n.img);
  return [...out];
}

/** A path this server can be asked about: relative paths and same-origin URLs. Others (other sites, wildcards) aren't checked. */
export function checkable(path, origin = "") {
  const p = String(path ?? "");
  if (!p || p.includes("*") || p.startsWith("data:") || p.startsWith("blob:")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(p)) return !!origin && p.startsWith(origin);
  return true;
}

/** UUID-looking strings in a Monk's Active Tiles action list: [{ index, action, uuid }]. Read defensively; anything odd is skipped. */
const UUID_RE = /^(Actor|Item|JournalEntry|Scene|RollTable|Playlist|Macro|Cards|Adventure)\.[A-Za-z0-9]{16}(\.[A-Za-z]+\.[A-Za-z0-9]{16})*$/;
export function mattRefs(actions) {
  const out = [];
  if (!Array.isArray(actions)) return out;
  actions.forEach((a, index) => {
    if (!a || typeof a !== "object") return;
    const seen = new Set();
    const walk = (v, depth) => {
      if (depth > 4 || v == null) return;
      if (typeof v === "string") { if (UUID_RE.test(v) && !seen.has(v)) { seen.add(v); out.push({ index, action: String(a.action ?? ""), uuid: v }); } return; }
      if (typeof v === "object") for (const x of Array.isArray(v) ? v : Object.values(v)) walk(x, depth + 1);
    };
    walk(a.data, 0);
  });
  return out;
}

/**
 * Asks about paths at most `concurrency` at a time, gives up on one after `timeout` ms (result null: not checked), and remembers
 * answers for `ttl` ms. `probe(path)` resolves true (loads) or false (missing) and may throw (counted as null). `now()` and `wait(ms)`
 * are injectable for tests.
 */
export class PathCache {
  constructor({ probe, concurrency = 4, timeout = 4000, ttl = 5 * 60000, max = 2000, now = () => Date.now(), wait = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
    this.probe = probe; this.concurrency = Math.max(1, concurrency); this.timeout = timeout; this.ttl = ttl; this.max = max; this.now = now; this.wait = wait;
    this.cache = new Map(); this.inflight = new Map(); this.queue = []; this.running = 0; this.probes = 0;
  }
  get(path) { const e = this.cache.get(path); return e && this.now() - e.at < this.ttl ? e.ok : undefined; }
  clear() { this.cache.clear(); }
  check(path) {
    const hit = this.get(path); if (hit !== undefined) return Promise.resolve(hit);
    if (this.inflight.has(path)) return this.inflight.get(path);
    const p = new Promise(res => { this.queue.push({ path, res }); this.#pump(); });
    this.inflight.set(path, p);
    return p;
  }
  /** { [path]: true | false | null } for every path. */
  async checkAll(paths = []) {
    const list = [...new Set(paths)];
    const res = await Promise.all(list.map(p => this.check(p)));
    return Object.fromEntries(list.map((p, i) => [p, res[i]]));
  }
  #pump() {
    while (this.running < this.concurrency && this.queue.length) {
      const { path, res } = this.queue.shift(); this.running++; this.probes++;
      const timeout = Promise.resolve(this.wait(this.timeout)).then(() => null);
      Promise.race([Promise.resolve().then(() => this.probe(path)).then(v => !!v, () => null), timeout]).then(ok => {
        this.running--; this.inflight.delete(path);
        // A timeout isn't remembered: the next run asks again.
        if (ok !== null) { this.cache.set(path, { ok, at: this.now() }); while (this.cache.size > this.max) this.cache.delete(this.cache.keys().next().value); }
        res(ok); this.#pump();
      });
    }
  }
}

/** The report page for one scene (exported to a GM-only journal page). */
export function reportHTML(sceneName, findings = [], when = "", ignored = []) {
  const t = tally(findings);
  const line = x => `<strong>${esc(x.severity)}</strong> · ${esc(RULES[x.rule]?.label ?? x.rule)}: ${esc(x.text)}`;
  const rows = findings.map(x => `<li>${line(x)}</li>`).join("");
  const ign = ignored.map(x => `<li><em>ignored</em> · ${line(x)}${x.ignore?.name ? ` (by ${esc(x.ignore.name)}${x.ignore.at ? `, ${esc(isoDay(x.ignore.at))}` : ""})` : ""}</li>`).join("");
  return `<p><strong>${esc(sceneName)}</strong>${when ? ` · checked ${esc(when)}` : ""} · ${esc(tallyText(t))}${ignored.length ? ` · ${ignored.length} ignored` : ""}.</p>${rows ? `<ul>${rows}</ul>` : "<p>Nothing to fix.</p>"}${ign ? `<p><strong>Ignored (${ignored.length})</strong></p><ul>${ign}</ul>` : ""}`;
}
const isoDay = ms => { try { return new Date(ms).toISOString().slice(0, 10); } catch { return ""; } };

/**
 * GM-only gate for the scene check API. Every member (methods and data like `rules`) goes through `isGM()`: for a non-GM, `deny()`
 * is called (it shows the notice) and a method returns undefined; data reads as undefined. Pure: the caller supplies both functions.
 */
export function gateApi(api, isGM, deny) {
  const out = {};
  for (const [k, v] of Object.entries(api)) {
    Object.defineProperty(out, k, {
      enumerable: true,
      get: () => {
        if (!isGM()) { deny(); return typeof v === "function" ? () => undefined : undefined; }
        return v;
      }
    });
  }
  return out;
}

/** Whether a map note is one of the companion toolkit's map pins (flags.<toolkit>.pin): the scene check leaves those out. */
export function isToolkitPin(note, toolkitId = "wayfarers-toolkit") {
  const f = note?.flags?.[toolkitId] ?? note?._source?.flags?.[toolkitId];
  return !!(f && typeof f === "object" && f.pin && typeof f.pin === "object");
}

// ---------------------------------------------------------------- 0.4.0: display-only rule categories (the main window's Scene check page)
/**
 * Which category each rule is shown under. Display only: it never changes a finding, its key or a saved ignore. A rule missing
 * here is shown under "other".
 */
export const RULE_CATEGORY = Object.freeze({
  background: "map", grid: "map", walls: "map", doors: "map", lights: "map",
  vision: "tokens", tokenActor: "tokens", tokenLink: "tokens", tokenImage: "tokens", npcStats: "tokens",
  sounds: "media", images: "media",
  notes: "links", activeTiles: "links", sceneJournal: "links",
  players: "players"
});
/** The categories in display order, with their icons. */
export const CHECK_CATEGORIES = Object.freeze([
  { id: "map", icon: "fa-solid fa-map" }, { id: "tokens", icon: "fa-solid fa-chess-pawn" }, { id: "media", icon: "fa-solid fa-photo-film" },
  { id: "links", icon: "fa-solid fa-link" }, { id: "players", icon: "fa-solid fa-users" }, { id: "other", icon: "fa-solid fa-circle-question" }
]);
const SEV_ORDER = { problem: 0, warning: 1, note: 2 };
/** Findings grouped by category (empty categories left out), each group sorted problem → warning → note (stable). */
export function groupFindings(findings = []) {
  const by = new Map();
  for (const f of Array.isArray(findings) ? findings : []) {
    const c = RULE_CATEGORY[f?.rule] ?? "other";
    if (!by.has(c)) by.set(c, []);
    by.get(c).push(f);
  }
  return CHECK_CATEGORIES.filter(c => by.has(c.id)).map(c => ({ ...c, findings: by.get(c.id).map((f, i) => [f, i]).sort((a, b) => ((SEV_ORDER[a[0].severity] ?? 3) - (SEV_ORDER[b[0].severity] ?? 3)) || a[1] - b[1]).map(x => x[0]) }));
}

/**
 * The GM client's memory of the last scene-check result per scene (this browser tab, this load; never saved to the world).
 * Capped at `max` scenes (oldest dropped first).
 */
export class ResultMemory {
  constructor(max = 500) { this.max = max; /** @type {Map<string, any>} */ this.map = new Map(); }
  get(id) { return this.map.get(String(id)) ?? null; }
  set(id, result) {
    const k = String(id); this.map.delete(k); this.map.set(k, result);
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
    return result;
  }
  pending(id) { return this.set(id, { pending: true }); }
  delete(id) { this.map.delete(String(id)); }
  clear() { this.map.clear(); }
  /** { [sceneId]: result } for the view. */
  all() { return Object.fromEntries(this.map); }
  get size() { return this.map.size; }
}
