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
