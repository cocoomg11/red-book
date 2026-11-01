/**
 * Scene readiness check: the pure part (no Foundry calls; tested in Node). check.mjs reads a scene into plain "facts" and the paths
 * into a result map; checkScene() turns them into findings. Nothing here (or there) changes a document.
 *
 * Finding: { rule, severity: "problem" | "warning" | "note", text, fix: { kind, id } | null }
 *   fix kinds: "scene" (scene config), "token", "actor", "tile", "drawing", "note", "sound", "playlist", "journal", "users", "light".
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
  const add = (rule, severity, text, fix = null) => out.push({ rule, severity, text, fix });
  const theatre = isTheatre(f);
  const tokens = f.tokens ?? [];

  if (want("background")) {
    if (!f.background) { if (!theatre || !(f.tiles ?? []).length) add("background", theatre ? "note" : "warning", "No background image.", { kind: "scene", id: f.id }); }
    else if (bad(paths, f.background)) add("background", "problem", `Background image doesn't load: ${f.background}`, { kind: "scene", id: f.id });
    else if (slow(paths, f.background)) add("background", "note", `Background image couldn't be checked: ${f.background}`, { kind: "scene", id: f.id });
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
      if (!(Number(t.hpMax) > 0)) add("npcStats", "warning", `${label}: no hit points (max 0).`, { kind: "actor", id: t.actorUuid });
      if (t.cr === null || t.cr === undefined || t.cr === "") add("npcStats", "note", `${label}: no challenge rating.`, { kind: "actor", id: t.actorUuid });
    }
  }
  if (want("tokenLink")) for (const [, list] of linkedNpc) if (list.length > 1) add("tokenLink", "warning", `${list[0].name}: ${list.length} tokens share one linked NPC actor (damage to one hits all).`, { kind: "token", id: list[0].id });

  if (want("sounds")) {
    for (const s of f.sounds ?? []) {
      if (!s.path) add("sounds", "warning", `Ambient sound with no file.`, { kind: "sound", id: s.id });
      else if (bad(paths, s.path)) add("sounds", "problem", `Ambient sound doesn't load: ${s.path}`, { kind: "sound", id: s.id });
    }
    if (f.playlist?.set && !f.playlist.exists) add("sounds", "problem", "The scene's playlist was deleted.", { kind: "scene", id: f.id });
    if (f.playlist?.soundSet && !f.playlist.soundExists) add("sounds", "problem", "The scene's playlist sound was deleted.", { kind: "scene", id: f.id });
    for (const p of f.playlist?.paths ?? []) if (bad(paths, p.path)) add("sounds", "problem", `Playlist "${p.playlist}": ${p.name} doesn't load: ${p.path}`, { kind: "playlist", id: p.playlistId });
  }
  if (want("images")) {
    for (const t of f.tiles ?? []) if (bad(paths, t.img)) add("images", "problem", `Tile image doesn't load: ${t.img}`, { kind: "tile", id: t.id });
    for (const d of f.drawings ?? []) if (bad(paths, d.img)) add("images", "problem", `Drawing texture doesn't load: ${d.img}`, { kind: "drawing", id: d.id });
    for (const n of f.notes ?? []) if (bad(paths, n.img)) add("images", "warning", `Map note icon doesn't load: ${n.img}`, { kind: "note", id: n.id });
  }
  if (want("notes")) for (const n of f.notes ?? []) {
    const label = n.label ? `Map note "${n.label}"` : "Map note";
    if (n.entryId && !n.entryExists) add("notes", "problem", `${label}: its journal was deleted.`, { kind: "note", id: n.id });
    else if (n.pageId && !n.pageExists) add("notes", "problem", `${label}: its page was deleted.`, { kind: "note", id: n.id });
    else if (!n.entryId) add("notes", "note", `${label} isn't linked to a journal.`, { kind: "note", id: n.id });
  }
  if (want("activeTiles") && matt) for (const r of f.matt ?? []) if (r.exists === false) add("activeTiles", "problem", `Active tile action ${r.index + 1} (${r.action || "action"}) points at a missing document: ${r.uuid}`, { kind: "tile", id: r.tileId });
  if (want("sceneJournal")) {
    if (f.journal?.set && !f.journal.exists) add("sceneJournal", "problem", "The journal linked in the scene config was deleted.", { kind: "scene", id: f.id });
    else if (f.journal?.pageSet && !f.journal.pageExists) add("sceneJournal", "problem", "The journal page linked in the scene config was deleted.", { kind: "scene", id: f.id });
  }
  if (want("players")) for (const u of players) if (!u.hasCharacter) add("players", "warning", `${u.name} is connected with no character assigned.`, { kind: "users", id: u.id });

  const rank = s => SEVERITIES.indexOf(s);
  return out.sort((a, b) => rank(a.severity) - rank(b.severity));
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
export function reportHTML(sceneName, findings = [], when = "") {
  const t = tally(findings);
  const rows = findings.map(x => `<li><strong>${esc(x.severity)}</strong> · ${esc(RULES[x.rule]?.label ?? x.rule)}: ${esc(x.text)}</li>`).join("");
  return `<p><strong>${esc(sceneName)}</strong>${when ? ` · checked ${esc(when)}` : ""} · ${esc(tallyText(t))}.</p>${rows ? `<ul>${rows}</ul>` : "<p>Nothing to fix.</p>"}`;
}
