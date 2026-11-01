/**
 * Every Red Book setting except the feature toggles, in one table (pure; tested in Node). settings.mjs registers them; the control
 * panel shows them on their tab, Basic first and the rest under Advanced. Keys are stable across versions: never rename one.
 *
 * Row: { key, tab, advanced, feature, type: "bool" | "text" | "number", default, label, hint, min, max, step, hidden, client }
 */
import { GROUPS } from "./session-model.mjs";
import { RULES, ruleKey } from "./check-model.mjs";

export const TABS = [
  { id: "overview", label: "Overview", icon: "fa-solid fa-house" },
  { id: "features", label: "Features", icon: "fa-solid fa-toggle-on" },
  { id: "session", label: "Session log", icon: "fa-solid fa-book", feature: "sessionLog" },
  { id: "board", label: "Next-session board", icon: "fa-solid fa-thumbtack", feature: "prepBoard" },
  { id: "check", label: "Scene check", icon: "fa-solid fa-clipboard-check", feature: "sceneCheck" },
  { id: "data", label: "Data", icon: "fa-solid fa-broom" }
];

const row = (tab, feature, key, type, def, label, hint, extra = {}) => ({ tab, feature, key, type, default: def, label, hint, advanced: false, ...extra });

export const SETTINGS = [
  row("session", "sessionLog", "sessionFolder", "text", "Session Log", "Session log folder", "Journal folder for the session logs (GM only). Made when the first session starts."),
  row("session", "sessionLog", "recapFolder", "text", "Session Recaps", "Recap folder", "Journal folder for the player recaps you share. Players get Observer on each recap."),
  row("session", "sessionLog", "startPrompt", "bool", true, "Ask to start a session on load", "When a GM loads the world with no session open, ask whether to start one."),
  row("session", "sessionLog", "notePrompt", "bool", true, "Open a quick note box from the key binding", "The Quick note key (Configure Controls, default Ctrl+Shift+N) opens a small box. A note starting with ? is an open thread."),
  row("session", "sessionLog", "coalesceSeconds", "number", 8, "Group item and coin changes (seconds)", "Item and coin changes on one character within this many seconds of each other become one line.", { advanced: true, min: 2, max: 60, step: 1 }),
  row("session", "sessionLog", "timeMinMinutes", "number", 10, "Log world time once it adds up to (minutes)", "Small advances (combat rounds, short waits) are added up and logged once they reach this.", { advanced: true, min: 1, max: 1440, step: 1 }),
  row("session", "sessionLog", "npcHidden", "bool", false, "Count hidden tokens as met", "Off: an NPC is met only once its token is visible on the active scene while a player is connected.", { advanced: true }),
  ...Object.entries(GROUPS).map(([g, label]) => row("session", "sessionLog", `log-${g}`, "bool", true, `Log: ${label}`, "", { advanced: true })),
  row("board", "prepBoard", "boardNext", "number", 3, "Objectives shown per quest", "How many unticked objectives the board lists under each active quest.", { min: 1, max: 10, step: 1 }),
  row("check", "sceneCheck", "checkTimeout", "number", 4, "File check time-out (seconds)", "A file that doesn't answer within this is reported as not checked rather than missing.", { advanced: true, min: 1, max: 30, step: 1 }),
  row("check", "sceneCheck", "checkConcurrency", "number", 4, "Files checked at once", "", { advanced: true, min: 1, max: 12, step: 1 }),
  ...Object.entries(RULES).map(([id, r]) => row("check", "sceneCheck", ruleKey(id), "bool", true, `Check: ${r.label}`, r.hint, { advanced: true })),
  row("data", null, "debugLog", "bool", false, "Debug logging", "Write Red Book's automatic decisions (leader changes, skipped duplicates) to the browser console.", { advanced: true }),
  // Hidden record settings (written by the module).
  { key: "openSession", type: "text", default: "", hidden: true },
  { key: "boardPins", type: "object", default: { v: 1, pins: [] }, hidden: true }
];

/** Hidden record settings: never shown and never reset by "Reset tab". */
export const RECORDS = SETTINGS.filter(s => s.hidden).map(s => s.key);

/** Settings of a tab, split into { basic, advanced }. */
export function tabRows(tab) {
  const list = SETTINGS.filter(s => s.tab === tab && !s.hidden);
  return { basic: list.filter(s => !s.advanced), advanced: list.filter(s => s.advanced) };
}

/** A form value converted to the setting's type, clamped; null when it can't be read (the old value is kept). */
export function convert(s, raw) {
  if (s.type === "bool") return raw === true || raw === "on" || raw === "true";
  if (s.type === "number") {
    const n = Number(raw); if (!Number.isFinite(n)) return null;
    return Math.min(s.max ?? Infinity, Math.max(s.min ?? -Infinity, n));
  }
  if (s.type === "text") return String(raw ?? "").trim() || String(s.default);
  return null;
}

/** Log groups turned off, from a settings getter. */
export const offGroups = get => Object.keys(GROUPS).filter(g => get(`log-${g}`) === false);
/** Check rules turned off, from a settings getter. */
export const offRules = get => Object.keys(RULES).filter(r => get(ruleKey(r)) === false);
