/**
 * Every Red Book setting except the feature toggles, in one table (pure; tested in Node). settings.mjs registers them; the control
 * panel shows them on their tab, Basic first and the rest under Advanced. Keys are stable across versions: never rename one.
 *
 * Rows follow wanderers-core's settings table (defineSettings: checked once, frozen; feature keys are reserved).
 * Row: { key, tab, advanced, feature, type: "bool" | "text" | "number" | "choice" | "object", default, label, hint, min, max, step, choices, hidden, client }
 */
import { defineSettings, records, tabRows as coreTabRows, convert as coreConvert } from "../vendor/wanderers-core/index.mjs";
import { GROUPS, AWARD_MODES } from "./session-model.mjs";
import { RULES, ruleKey } from "./check-model.mjs";
import { FEATURE_KEYS } from "./features.mjs";
import { COUNTS, POSITIONS } from "./online-model.mjs";

export const TABS = [
  { id: "overview", label: "Overview", icon: "fa-solid fa-house" },
  { id: "features", label: "Features", icon: "fa-solid fa-toggle-on" },
  { id: "session", label: "Session log", icon: "fa-solid fa-book", feature: "sessionLog" },
  { id: "board", label: "Next-session board", icon: "fa-solid fa-thumbtack", feature: "prepBoard" },
  { id: "check", label: "Scene check", icon: "fa-solid fa-clipboard-check", feature: "sceneCheck" },
  { id: "start", label: "Session Start", icon: "fa-solid fa-flag-checkered", feature: "sessionStart" },
  { id: "online", label: "Who's online", icon: "fa-solid fa-users", feature: "whosOnline" },
  { id: "discord", label: "Discord", icon: "fa-brands fa-discord", feature: "discord" },
  { id: "data", label: "Data", icon: "fa-solid fa-broom" }
];

const row = (tab, feature, key, type, def, label, hint, extra = {}) => ({ tab, feature, key, type, default: def, label, hint, advanced: false, ...extra });

export const SETTINGS = defineSettings([
  row("session", "sessionLog", "sessionFolder", "text", "Session Log", "Session log folder", "Journal folder for the session logs (GM only). Made when the first session starts."),
  row("session", "sessionLog", "recapFolder", "text", "Session Recaps", "Recap folder", "Journal folder for the player recaps you share. Players get Observer on each recap."),
  row("session", "sessionLog", "startPrompt", "bool", true, "Ask to start a session on load", "When a GM loads the world with no session open, ask whether to start one."),
  row("session", "sessionLog", "notePrompt", "bool", true, "Open a quick note box from the key binding", "The Quick note key (Configure Controls, default Ctrl+Shift+N) opens a small box. A note starting with ? is an open thread."),
  row("session", "sessionLog", "coalesceSeconds", "number", 8, "Group item and coin changes (seconds)", "Item and coin changes on one character within this many seconds of each other become one line.", { advanced: true, min: 2, max: 60, step: 1 }),
  row("session", "sessionLog", "timeMinMinutes", "number", 10, "Log world time once it adds up to (minutes)", "Small advances (combat rounds, short waits) are added up and logged once they reach this.", { advanced: true, min: 1, max: 1440, step: 1 }),
  row("session", "sessionLog", "npcHidden", "bool", false, "Count hidden tokens as met", "Off: an NPC is met only once its token is visible on the active scene while a player is connected.", { advanced: true }),
  // 0.6.0
  row("session", "sessionLog", "logDates", "bool", true, "Dates on the timeline", "Rows from a later day than the session's start show their date, and a day heading marks midnight (in each viewer's own time zone).", { advanced: true }),
  row("session", "previously", "previouslyAuto", "bool", true, "Show \"Previously on…\" when a session starts", "Players see the last shared recap as a title card when you start a session. Off: only when you click Show on the Session page."),
  row("session", "sessionTimer", "breakReminder", "bool", false, "Remind me to take a break", "A GM-only notification every so many minutes while a session runs."),
  row("session", "sessionTimer", "breakEvery", "number", 90, "Break reminder every (minutes)", "", { min: 15, max: 600, step: 5 }),
  row("session", "attendance", "awardMode", "choice", "xp", "Track per session", "Experience points (a number per character, GM only), milestones (a line of text players see in the recap), or neither.", { choices: { ...AWARD_MODES } }),
  ...Object.entries(GROUPS).map(([g, label]) => row("session", "sessionLog", `log-${g}`, "bool", true, `Log: ${label}`, "", { advanced: true })),
  row("board", "prepBoard", "boardNext", "number", 3, "Objectives shown per quest", "How many unticked objectives the board lists under each active quest.", { min: 1, max: 10, step: 1 }),
  row("check", "sceneCheck", "checkTimeout", "number", 4, "File check time-out (seconds)", "A file that doesn't answer within this is reported as not checked rather than missing.", { advanced: true, min: 1, max: 30, step: 1 }),
  row("check", "sceneCheck", "checkConcurrency", "number", 4, "Files checked at once", "", { advanced: true, min: 1, max: 12, step: 1 }),
  ...Object.entries(RULES).map(([id, r]) => row("check", "sceneCheck", ruleKey(id), "bool", true, `Check: ${r.label}`, r.hint, { advanced: true })),
  row("start", "sessionStart", "hiddenScenes", "text", "", "Scenes left out of the list", "A regular expression: scenes whose name matches aren't offered by Session Start (test maps, galleries). For exact names write ^(Name one|Name two)$. Blank: every scene is offered."),
  row("online", "whosOnline", "onlineCount", "choice", "characters", "\"Everyone's here\" counts", "Who has to be connected: every player user, only players with an assigned character, or the users you list.", { choices: { ...COUNTS } }),
  row("online", "whosOnline", "onlineList", "text", "", "Users who count", "User names, separated by commas, for \"Only the users listed\".", { advanced: true }),
  row("online", "whosOnline", "onlinePosition", "choice", "top-left", "Panel position", "Where the panel starts on Hub scenes (top left sits right of the scene navigation). Each user can drag it elsewhere.", { advanced: true, choices: { ...POSITIONS } }),
  row("online", "whosOnline", "onlineDrag", "bool", true, "The panel can be moved", "Everyone can drag the panel by its title to a spot of their own (kept for that browser, always on screen); double-click the title to put it back.", { advanced: true }),
  row("online", "whosOnline", "onlineLegacyHooks", "bool", true, "Also fire the old hook names", "Besides red-book.allPlayersOnline and red-book.playerCountChanged, fire wayfarers-toolkit.allPlayersOnline and wayfarers-toolkit.playerCountChanged for world scripts written for the companion toolkit (skipped while the toolkit still provides its own Who's online).", { advanced: true }),
  // 0.5.0: Discord posts (feature off by default). The URL is a world setting: players can read it from the console (honor system).
  row("discord", "discord", "discordWebhook", "text", "", "Webhook URL", "Discord: channel settings › Integrations › Webhooks › New webhook › Copy URL. Only a GM's browser posts. Honor system: world settings reach every player's browser, so a player who opens the browser console can read this URL and post to that channel. Make a webhook for one channel you don't mind, and delete it in Discord if it leaks."),
  row("discord", "discord", "discordEnd", "bool", true, "Post a summary when a session ends", "How long you played, what happened, quest progress and open threads. GM-only notes, private threads and hidden quests are left out."),
  row("discord", "discord", "discordRecap", "bool", false, "Post the recap when you share it", "After you review it with Share as recap, post the same text (secret blocks and unticked lines are left out)."),
  row("discord", "discord", "discordNext", "bool", true, "Post the next session's date when you set it", "When you save a date in Next session on the board, post it (each reader sees it in their own time zone)."),
  row("discord", "discord", "discordName", "text", "Red Book", "Post as", "The name the posts show in Discord.", { advanced: true }),
  row("data", null, "debugLog", "bool", false, "Debug logging", "Write Red Book's automatic decisions (leader changes, skipped duplicates) to the browser console.", { advanced: true }),
  // Hidden record settings (written by the module). boardPins is only read for the one-time move into the GM-only store (0.3.0)
  // and is kept registered so that move can read it; the key never changes.
  { key: "openSession", type: "text", default: "", hidden: true },
  { key: "migrations", type: "object", default: { v: 1 }, hidden: true },
  { key: "onlineHudPos", type: "object", default: {}, hidden: true, client: true },
  // 0.4.0: the Hub panel folded to its header, per browser (the fold button in its header; not shown in the settings).
  { key: "onlineHudCollapsed", type: "bool", default: false, hidden: true, client: true },
  { key: "boardPins", type: "object", default: { v: 1, pins: [] }, hidden: true },
  // 0.5.0: the next session's date, set on the board (not GM-only: the players may see it).
  { key: "nextSession", type: "object", default: { v: 1, at: 0 }, hidden: true },
  // 0.6.0: the "Previously on…" recap this browser has seen ({ v: 1, key }: recap id and its last change), per browser.
  { key: "previouslySeen", type: "object", default: { v: 1, key: "" }, hidden: true, client: true }
], { reserved: FEATURE_KEYS });

/** Hidden record settings: never shown and never reset by "Reset tab". */
export const RECORDS = records(SETTINGS);

/** Settings of a tab, split into { basic, advanced } (rows of a turned-off tool are shown greyed out, so all are listed). */
export const tabRows = tab => coreTabRows(SETTINGS, tab);

/** A form value converted to the setting's type, clamped; null when it can't be read (the old value is kept). */
export const convert = (s, raw) => coreConvert(s, raw);

/** Log groups turned off, from a settings getter. */
export const offGroups = get => Object.keys(GROUPS).filter(g => get(`log-${g}`) === false);
/** Check rules turned off, from a settings getter. */
export const offRules = get => Object.keys(RULES).filter(r => get(ruleKey(r)) === false);
