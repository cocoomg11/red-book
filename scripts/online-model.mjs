/**
 * Who's online (feature whosOnline, ported from the companion toolkit with the same behaviour): who counts as "the players", who of them is connected and whether everyone's here. Pure, no
 * Foundry calls (tested in Node). Users come in as plain objects: { id, name, color, active, isGM, character: { name, img } | null }.
 */

export const COUNTS = { players: "Every player user", characters: "Players with an assigned character", list: "Only the users listed below" };
export const POSITIONS = { "top-left": "Top left", "top-centre": "Top centre", "bottom-left": "Bottom left, right of the scene navigation", "bottom-centre": "Bottom centre" };

/** "Ann, Bob; Cy" → lower-case names. */
export const listNames = text => [...new Set(String(text ?? "").split(/[,;\n]+/).map(s => s.trim().toLowerCase()).filter(Boolean))];

/**
 * Whether a user counts towards "everyone's here".
 * @param {any} user
 * @param {{ count?: string, list?: string[] }} [opts]
 */
export function counts(user, { count = "players", list = /** @type {string[]} */ ([]) } = {}) {
  if (!user) return false;
  if (count === "list") return list.includes(String(user.name ?? "").trim().toLowerCase());
  if (user.isGM) return false;
  if (count === "characters") return !!user.character;
  return true;
}

/**
 * The board: { entries, expected, present, all, missing, unknown }. `entries`: users who count (online first, then by name) followed
 * by anyone else online (GMs, players who don't count), each with `counts` and a display `label` (character name, or user name).
 * `all` is true only when at least one user counts and every one of them is online. `unknown`: listed names with no such user.
 */
export function roster(users = [], { count = "players", list = "" } = {}) {
  const names = listNames(list);
  const opts = { count, list: names };
  const row = u => ({ id: u.id, name: u.name, color: u.color ?? null, active: !!u.active, isGM: !!u.isGM, counts: counts(u, opts), character: u.character ?? null, label: u.character?.name || u.name });
  const all = users.map(row);
  const by = (a, b) => (b.active - a.active) || String(a.label).localeCompare(String(b.label));
  const expectedRows = all.filter(r => r.counts).sort(by);
  const others = all.filter(r => !r.counts && r.active).sort(by);
  const present = expectedRows.filter(r => r.active).length;
  const unknown = count === "list" ? names.filter(n => !users.some(u => String(u.name ?? "").trim().toLowerCase() === n)) : [];
  return {
    entries: [...expectedRows, ...others], expected: expectedRows.length, present,
    all: expectedRows.length > 0 && present === expectedRows.length,
    missing: expectedRows.filter(r => !r.active).map(r => r.name), unknown
  };
}

/** What changed between two rosters (`prev` may be null): { countChanged, becameAll, leftAll }. */
export function changes(prev, next) {
  if (!prev) return { countChanged: true, becameAll: !!next?.all, leftAll: false };
  return {
    countChanged: prev.present !== next.present || prev.expected !== next.expected,
    becameAll: !prev.all && !!next.all,
    leftAll: !!prev.all && !next.all
  };
}

/** The data the hooks pass: { online, expected, all, missing, users: [{ id, name, label, active, counts }] }. */
export function hookPayload(r, extra = {}) {
  return { online: r.present, expected: r.expected, all: r.all, missing: [...r.missing], users: r.entries.map(e => ({ id: e.id, name: e.name, label: e.label, active: e.active, counts: e.counts })), ...extra };
}

// ---------------------------------------------------------------- 1.25: panel placement (pure; the HUD measures, this decides)
/** Gap kept between the panel and the screen edges or Foundry's own UI, in pixels. */
export const EDGE = 8;

/** A rectangle as { left, top, right, bottom } (from getBoundingClientRect), or null when absent or empty. */
const rect = r => r && Number.isFinite(+r.right) && +r.right > +r.left ? { left: +r.left, top: +r.top, right: +r.right, bottom: +r.bottom } : null;

/**
 * Where the panel goes for a position choice (world setting red-book.onlinePosition), as { left, top } in pixels. `view`: { width, height }
 * of the window; `size`: { width, height } of the panel; `ui`: rectangles of Foundry's scene navigation (`nav`), scene controls
 * (`controls`) and players list (`players`), any of which may be missing. Top left starts to the right of the scene navigation (in
 * v14 it is a full-height column next to the scene controls, so a fixed left offset sat on top of it); without one, right of the
 * controls. Every choice stays right of that column; bottom left sits level with the top of the players list.
 */
export function anchorPos(anchor, view, size, ui = {}) {
  const vw = +view?.width || 0, vh = +view?.height || 0, w = +size?.width || 0, h = +size?.height || 0;
  const nav = rect(ui.nav), controls = rect(ui.controls), players = rect(ui.players);
  const leftOfUi = Math.max(nav?.right ?? 0, controls?.right ?? 0, 0) + EDGE;
  const clearLeft = nav || controls ? leftOfUi : 320;
  let p;
  if (anchor === "top-centre") p = { left: Math.max(clearLeft, (vw - w) / 2), top: EDGE * 1.5 };
  else if (anchor === "bottom-left") p = { left: clearLeft, top: (players?.top ?? vh - 140) - h - EDGE };
  else if (anchor === "bottom-centre") p = { left: Math.max(clearLeft, (vw - w) / 2), top: vh - 110 - h };
  else p = { left: clearLeft, top: EDGE * 1.5 };
  return clampPos(p, view, size);
}

/**
 * Keeps the panel inside the window: { left, top } moved so the whole panel shows with EDGE pixels to spare (or, when the panel
 * is bigger than the window, its top-left corner shows). Bad numbers become EDGE.
 */
export function clampPos(pos, view, size) {
  const vw = +view?.width || 0, vh = +view?.height || 0, w = +size?.width || 0, h = +size?.height || 0;
  const one = (v, span, len) => { v = +v; if (!Number.isFinite(v)) v = EDGE; return Math.round(Math.max(EDGE, Math.min(v, span - len - EDGE))); };
  return { left: one(pos?.left, vw, w), top: one(pos?.top, vh, h) };
}

/** A saved drag position (client setting red-book.onlineHudPos) as { left, top }, or null when none or unreadable (use the anchor). */
export function savedPos(v) {
  if (!v || typeof v !== "object") return null;
  const left = +v.left, top = +v.top;
  return Number.isFinite(left) && Number.isFinite(top) ? { left, top } : null;
}

/** Where the panel sits: the saved drag position when dragging is on and one is saved, else the anchor; always on screen. */
export function placePanel({ anchor = "top-left", saved = null, drag = true } = {}, view, size, ui = {}) {
  const s = drag ? savedPos(saved) : null;
  return s ? clampPos(s, view, size) : anchorPos(anchor, view, size, ui);
}

// ---------------------------------------------------------------- Red Book: hook names and the companion toolkit's old names
/** The hooks Red Book fires (on every client, from that client's own reading of the users). */
export const ONLINE_HOOKS = { allPlayersOnline: "red-book.allPlayersOnline", playerCountChanged: "red-book.playerCountChanged" };
/** The names the companion toolkit used before the feature moved here; fired too unless the toolkit still provides them. */
export const LEGACY_HOOKS = { allPlayersOnline: "wayfarers-toolkit.allPlayersOnline", playerCountChanged: "wayfarers-toolkit.playerCountChanged" };

/**
 * The hook names to fire for one change: Red Book's always, the toolkit's old names only when the toolkit doesn't fire them itself
 * (`toolkitProvides`: the toolkit is active and its own Who's online is on) and the legacy setting is on.
 * @param {{ countChanged: boolean, becameAll: boolean }} ch from changes()
 * @param {{ toolkitProvides?: boolean, legacy?: boolean }} [opts]
 * @returns {string[]}
 */
export function hookNames(ch, { toolkitProvides = false, legacy = true } = {}) {
  const out = [];
  const add = k => { out.push(ONLINE_HOOKS[k]); if (legacy && !toolkitProvides) out.push(LEGACY_HOOKS[k]); };
  if (ch?.countChanged) add("playerCountChanged");
  if (ch?.becameAll) add("allPlayersOnline");
  return out;
}
