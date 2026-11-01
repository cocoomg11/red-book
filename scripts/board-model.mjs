/**
 * Next-session board: the pure part (tested in Node). Reads quests from a provider (the companion toolkit's quest data), pulls the
 * document links out of their text, and keeps the GM's pinned list (capped, versioned).
 */
export const PINS_VERSION = 1;
export const PINS_MAX = 50;
/** Document types that can be pinned (dropped on the board). */
export const PIN_TYPES = ["Actor", "JournalEntry", "JournalEntryPage", "Scene", "RollTable", "Item", "Playlist", "Macro"];

/**
 * Every document UUID linked in a bit of text: @UUID[...] links (label or not), @Actor[id]/@JournalEntry[id]/… shortcuts, and
 * content-link anchors (data-uuid="…"). In order, without repeats. Embedded ids (#anchors) are dropped.
 */
export function extractUuids(text = "") {
  const s = String(text ?? ""); const out = [];
  const push = u => { u = String(u).split("#")[0].trim(); if (u && !out.includes(u)) out.push(u); };
  for (const m of s.matchAll(/@UUID\[([^\]]+)\]/g)) push(m[1]);
  for (const m of s.matchAll(/@(Actor|JournalEntry|Scene|Item|RollTable|Playlist|Macro)\[([^\]]+)\]/g)) push(m[2].includes(".") ? m[2] : `${m[1]}.${m[2]}`);
  for (const m of s.matchAll(/data-uuid\s*=\s*["']([^"']+)["']/g)) push(m[1]);
  return out;
}
/** The document type a UUID points at: the last "Type.id" pair ("Scene.x.Token.y" → Token; "Compendium.a.b.Actor.id" → Actor). */
export function uuidType(uuid = "") {
  const parts = String(uuid).split(".");
  if (parts[0] === "Compendium") return parts.length >= 5 ? parts[parts.length - 2] : null;
  return parts.length >= 2 ? parts[parts.length - 2] : null;
}

/**
 * Active quests in board form, from the toolkit's quest data: [{ id, name, uuid, zone, next: [objective texts], links }].
 * Given and not completed = status "active". The next objectives are the first `nextCount` unticked, non-hidden ones (optional ones
 * marked). Links come from the giver, the description, the summary and objective text.
 */
export function activeQuests(quests = [], { nextCount = 3 } = {}) {
  return quests.filter(q => q && q.status === "active").sort((a, b) => (Number(a.sort) || 0) - (Number(b.sort) || 0)).map(q => {
    const objs = (q.objectives ?? []).filter(o => o && !o.done && !o.hidden);
    const text = [q.description, q.summary, ...(q.objectives ?? []).map(o => o?.text)].join("\n");
    const links = [q.giver?.uuid, ...extractUuids(text)].filter(Boolean);
    return {
      id: String(q.id ?? ""), name: String(q.name ?? "Quest"), uuid: q.uuid ?? (q.id ? `JournalEntry.${q.id}` : ""), zone: String(q.zone ?? ""),
      next: objs.slice(0, nextCount).map(o => `${o.text}${o.optional ? " (optional)" : ""}`), more: Math.max(0, objs.length - nextCount),
      links: [...new Set(links)]
    };
  });
}

/** Links of all quests sorted into board columns by type, each UUID once, with the quests that link it. */
export function groupLinks(quests = []) {
  const map = new Map();
  for (const q of quests) for (const u of q.links) { const e = map.get(u) ?? { uuid: u, type: uuidType(u), from: [] }; if (!e.from.includes(q.name)) e.from.push(q.name); map.set(u, e); }
  const all = [...map.values()];
  return {
    actors: all.filter(e => e.type === "Actor" || e.type === "Token"),
    journals: all.filter(e => e.type === "JournalEntry" || e.type === "JournalEntryPage"),
    scenes: all.filter(e => e.type === "Scene"),
    other: all.filter(e => !["Actor", "Token", "JournalEntry", "JournalEntryPage", "Scene"].includes(e.type))
  };
}

/** Reads the stored pins (any version; an array is the bare v0 list) into { v, pins: [{ uuid, type, name, at }] }. */
export function normalizePins(raw) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.pins) ? raw.pins : [];
  const pins = [];
  for (const p of list) {
    const uuid = typeof p === "string" ? p : p?.uuid; if (!uuid || pins.some(x => x.uuid === uuid)) continue;
    pins.push({ uuid: String(uuid), type: String(p?.type ?? uuidType(uuid) ?? ""), name: String(p?.name ?? ""), at: Number(p?.at) || 0 });
  }
  return { v: PINS_VERSION, pins: pins.slice(0, PINS_MAX) };
}
/** Adds a pin (newest first, a repeat moves to the top); refuses types that can't be pinned. Returns { pins, added, why }. */
export function addPin(store, pin, max = PINS_MAX) {
  const s = normalizePins(store);
  const type = pin?.type ?? uuidType(pin?.uuid);
  if (!pin?.uuid) return { ...s, added: false, why: "no document" };
  if (!PIN_TYPES.includes(type)) return { ...s, added: false, why: `${type ?? "that"} can't be pinned` };
  const pins = [{ uuid: pin.uuid, type, name: String(pin.name ?? ""), at: Number(pin.at) || Date.now() }, ...s.pins.filter(p => p.uuid !== pin.uuid)];
  return { v: PINS_VERSION, pins: pins.slice(0, Math.max(1, max)), added: true, dropped: Math.max(0, pins.length - max) };
}
export function removePin(store, uuid) { const s = normalizePins(store); return { v: PINS_VERSION, pins: s.pins.filter(p => p.uuid !== uuid) }; }

// ---------------------------------------------------------------- prep list (0.5.0): scene-check findings sent to the board
export const TODOS_MAX = 100;
/**
 * Reads the stored prep list into [{ id, sceneId, sceneUuid, sceneName, text, severity, at }], newest first, without repeats (by id),
 * at most TODOS_MAX. `id` is "<sceneId>|<finding key or text>", so the same finding sent twice stays one item.
 * @param {any} raw
 */
export function normalizeTodos(raw) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
  /** @type {{ id: string, sceneId: string, sceneUuid: string, sceneName: string, text: string, severity: string, at: number }[]} */
  const out = [];
  for (const x of list) {
    if (!x || typeof x !== "object" || !x.id || out.some(o => o.id === String(x.id))) continue;
    out.push({ id: String(x.id).slice(0, 300), sceneId: String(x.sceneId ?? ""), sceneUuid: String(x.sceneUuid ?? ""), sceneName: String(x.sceneName ?? "").slice(0, 200),
      text: String(x.text ?? "").slice(0, 500), severity: ["problem", "warning", "note"].includes(x.severity) ? x.severity : "warning", at: Number(x.at) || 0 });
  }
  return out.slice(0, TODOS_MAX);
}
/** The prep-list id of a finding on a scene. */
export const todoId = (sceneId, f) => `${sceneId}|${f?.key || String(f?.text ?? "").slice(0, 200)}`;
/** Whether a finding counts as a failure ("Add all failures"): a problem or a warning. */
export const isFailure = f => f?.severity === "problem" || f?.severity === "warning";
/**
 * Adds findings of one scene (`scene`: { id, uuid, name }) to the prep list. A finding already on the list is left where it is.
 * Returns { items, added } (`added`: how many were new). The list keeps its cap: the oldest items go first.
 */
export function addTodos(items, scene, findings = [], now = Date.now(), max = TODOS_MAX) {
  const list = normalizeTodos(items); const have = new Set(list.map(i => i.id)); const fresh = [];
  for (const f of findings) {
    if (!f || !scene?.id) continue;
    const id = todoId(scene.id, f); if (have.has(id)) continue; have.add(id);
    fresh.push({ id, sceneId: String(scene.id), sceneUuid: String(scene.uuid ?? `Scene.${scene.id}`), sceneName: String(scene.name ?? ""), text: String(f.text ?? ""), severity: f.severity, at: now });
  }
  return { items: normalizeTodos([...fresh.reverse(), ...list]).slice(0, Math.max(1, max)), added: fresh.length };
}
export const removeTodo = (items, id) => normalizeTodos(items).filter(i => i.id !== id);

// ---------------------------------------------------------------- next session (0.5.0): the date the GM sets on the board
/**
 * The stored next-session date (world setting `nextSession`, `{ v: 1, at: ms }`; players may see it, it isn't GM-only). Anything
 * unreadable is "not set" (at 0).
 * @param {any} raw
 * @returns {{ v: 1, at: number }}
 */
export function normalizeNext(raw) {
  const at = Math.floor(Number(raw?.at));
  return { v: 1, at: Number.isFinite(at) && at > 0 ? at : 0 };
}
const pad = n => String(n).padStart(2, "0");
/** A ms time as the value of an `<input type="datetime-local">` (local time, minutes), or "" when not set. */
export function toLocalInput(ms) {
  const n = Number(ms); if (!Number.isFinite(n) || n <= 0) return "";
  const d = new Date(n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** A `datetime-local` value (local time) as ms, or 0 when blank or unreadable. */
export function fromLocalInput(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!m) return 0;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const t = new Date(y, mo - 1, d, h, mi).getTime();
  return Number.isFinite(t) ? t : 0;
}
