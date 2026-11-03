/**
 * The main window's markup (0.4.0, Option B), pure: no Foundry calls, tested in Node. app.mjs reads the world into plain models and
 * calls these; every page is a string of HTML built on wanderers-core's shared look (wc-* classes, styles/wanderers-ui.css) plus a
 * few scoped rb-* rules (styles/red-book.css). All text is escaped with `esc`; all new strings come from lang/en.json through `t`.
 *
 * Pages: Tools (session, board, check, online, past) and Settings (features, tools, health, data). The session dashboard is the
 * default page.
 */
import { esc, plural, toolkitTitle } from "./const.mjs";
import { navItem, statusLine, statusLines, badge, dot, icon, TONES } from "../vendor/wanderers-core/index.mjs";
import { TYPES, durationText, whenText, present, worldTimeText } from "./session-model.mjs";
import { dayKey, dayLabel, timeLabel, rangeText, clockText, elapsedMs } from "./time-model.mjs";
import { isFailure, todoId, toLocalInput } from "./board-model.mjs";
import { groupFindings, tallyText } from "./check-model.mjs";
import { t } from "./i18n.mjs";

// ---------------------------------------------------------------- navigation
/** The sidebar: groups of pages. `feature`: the tool that page belongs to (muted when off). */
export const NAV = Object.freeze([
  { group: "Tools", pages: [
    { id: "session", icon: "fa-solid fa-book", feature: null },
    { id: "board", icon: "fa-solid fa-thumbtack", feature: "prepBoard" },
    { id: "check", icon: "fa-solid fa-clipboard-check", feature: "sceneCheck" },
    { id: "online", icon: "fa-solid fa-users", feature: "whosOnline" },
    { id: "past", icon: "fa-solid fa-clock-rotate-left", feature: "sessionLog" }
  ] },
  { group: "Settings", pages: [
    { id: "features", icon: "fa-solid fa-toggle-on", feature: null },
    { id: "tools", icon: "fa-solid fa-sliders", feature: null },
    { id: "health", icon: "fa-solid fa-heart-pulse", feature: null },
    { id: "data", icon: "fa-solid fa-database", feature: null }
  ] }
]);
export const PAGES = NAV.flatMap(g => g.pages.map(p => p.id));
export const DEFAULT_PAGE = "session";

/** The old control-panel tab names (api.panel(tab) before 0.4.0) → { page, tool }. Unknown names give the default page. */
export function pageFor(tab) {
  const s = String(tab ?? "");
  if (PAGES.includes(s)) return { page: s, tool: null };
  if (s === "overview") return { page: "session", tool: null };
  if (["session", "board", "check", "start", "online"].includes(s)) return { page: "tools", tool: s };
  return { page: DEFAULT_PAGE, tool: null };
}

/** Roving focus in the sidebar: the index to focus after `key` from `i` among `n` items (ArrowUp/Down wrap, Home, End), or -1. */
export function nextNavIndex(i, key, n) {
  if (!(n > 0)) return -1;
  if (key === "ArrowDown" || key === "ArrowRight") return (i + 1) % n;
  if (key === "ArrowUp" || key === "ArrowLeft") return (i - 1 + n) % n;
  if (key === "Home") return 0;
  if (key === "End") return n - 1;
  return -1;
}

/**
 * The sidebar markup. `on(feature)` says whether a tool is on; `badges` ({ pageId: { tone, text, title } }) adds a small badge.
 * @param {string} page
 * @param {(f: string) => boolean} on
 * @param {Record<string, { tone: string, text: unknown, title?: string }>} [badges]
 */
export function navHTML(page, on, badges = {}) {
  const groups = NAV.map(g => `<h3 class="wc-side-head">${esc(t(`Nav.${g.group}`))}</h3>${g.pages.map(p => {
    const off = !!p.feature && !on(p.feature);
    const label = t(`Nav.${p.id}`);
    return navItem({ label, page: p.id, icon: p.icon, active: p.id === page, muted: off, tabindex: p.id === page ? 0 : -1,
      badge: off ? { tone: "off", text: t("Common.off") } : badges[p.id], aria: off ? `${label}, ${t("Common.off")}` : undefined });
  }).join("")}`).join("");
  return `<nav class="wc-side rb-side" aria-label="${esc(t("Nav.label"))}">${groups}</nav>`;
}

/** The whole window body: sidebar + page. */
export const shellHTML = (nav, main) => `<div class="wc-shell rb-shell">${nav}<section class="wc-main rb-main" tabindex="-1">${main}</section></div>`;

/** A page head: title and optional meta markup (trusted). */
export const pageHead = (title, meta = "") => `<header class="wc-pagehead"><div class="wc-pagehead-title"><h2>${esc(title)}</h2>${meta ? `<div class="wc-pagehead-meta">${meta}</div>` : ""}</div></header>`;

/** The "this tool is turned off" alert. */
export const offAlert = () => `<div class="wc-alert wc-off">${icon("off")}<div class="wc-alert-title">${esc(t("Common.toolOff"))}</div><p>${esc(t("Common.toolOffHint"))}</p></div>`;

const btn = (action, iconCls, label, { primary = false, small = false, danger = false, data = {}, disabled = false, type = "button" } = {}) =>
  `<button type="${type}" class="wc-btn${primary ? " wc-btn-primary" : ""}${small ? " wc-btn-sm" : ""}${danger ? " wc-btn-danger" : ""}"${action ? ` data-action="${esc(action)}"` : ""}${Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join("")}${disabled ? " disabled" : ""}><i class="${iconCls}" aria-hidden="true"></i> ${esc(label)}</button>`;
const iconBtn = (action, iconCls, label, data = {}) =>
  `<button type="button" class="wc-btn wc-btn-icon wc-btn-ghost" data-action="${esc(action)}"${Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join("")} data-tooltip="${esc(label)}" aria-label="${esc(label)}"><i class="${iconCls}" aria-hidden="true"></i></button>`;
const panel = (title, iconCls, body, { cls = "", head = "" } = {}) =>
  `<section class="wc-panel${cls ? ` ${cls}` : ""}"><header class="wc-panel-head"><h3>${iconCls ? `<i class="${iconCls}" aria-hidden="true"></i>` : ""}${esc(title)}</h3>${head}</header>${body}</section>`;
const hint = text => `<p class="wc-hint">${esc(text)}</p>`;

// ---------------------------------------------------------------- session dashboard: timeline filter
/** Timeline filter chips: id → event types ("all" = every type). */
export const FILTERS = Object.freeze({
  all: null,
  scene: ["scene", "session"],
  combat: ["combatStart", "combatEnd", "down", "death"],
  loot: ["loot", "lootRoll"],
  world: ["rest", "time", "journal", "npc", "level"],
  quests: ["quest", "objective"],
  travel: ["travel"],
  notes: ["note"]
});
/** Rows the dashboard timeline shows at most. */
export const TIMELINE_MAX = 100;

/** Events of one filter, newest first, at most `max`. Unknown filters act as "all". */
export function filterEvents(events = [], filter = "all", max = TIMELINE_MAX) {
  const types = Object.hasOwn(FILTERS, filter) ? FILTERS[filter] : null;
  const list = (Array.isArray(events) ? events : []).filter(e => e && (!types || types.includes(e.type)));
  return list.slice(-Math.max(0, max)).reverse();
}
/** How many events each filter matches: { all: n, scene: n, … }. */
export function filterCounts(events = []) {
  const out = {};
  for (const [id, types] of Object.entries(FILTERS)) out[id] = (Array.isArray(events) ? events : []).filter(e => e && (!types || types.includes(e.type))).length;
  return out;
}

/** The tone a timeline row's icon takes. */
export function eventTone(type) {
  if (type === "down" || type === "death") return "bad";
  if (type === "combatStart" || type === "combatEnd") return "warn";
  if (type === "note") return "accent";
  if (type === "loot" || type === "lootRoll" || type === "level") return "ok";
  if (type === "session") return "live";
  return "info";
}

/**
 * Timeline rows (core's wc-timeline). 0.6.0: `o.start` (the session's start, ms) shows the date on rows from another day and a day
 * separator row where the day changes, both in this viewer's time zone (`o.timeZone` undefined = the browser's); times come from
 * each event's timestamp. Rows may be newest first or oldest first.
 * @param {any[]} events @param {{ start?: number, timeZone?: string, locale?: string, dates?: boolean }} [o]
 */
export function timelineHTML(events = [], o = {}) {
  if (!events.length) return `<p class="wc-hint rb-pad">${esc(t("Session.noEvents"))}</p>`;
  const dates = o.dates !== false && !!o.start;
  let day = "";
  return `<ol class="wc-timeline rb-timeline">${events.map((e, i) => {
    let sep = "";
    if (dates && e.t) {
      const k = dayKey(e.t, o.timeZone);
      // A separator names the day of the rows under it: wherever the day changes, and above the first row when that isn't the
      // session's start date (newest first, past midnight).
      const changed = i > 0 ? k !== day : k !== dayKey(/** @type {number} */ (o.start), o.timeZone);
      if (changed) sep = `<li class="rb-day-sep" role="separator"><span>${esc(dayLabel(e.t, o))}</span></li>`;
      day = k;
    }
    const tone = eventTone(e.type);
    const ic = TYPES[e.type]?.icon ?? "fa-circle";
    const aside = [e.thread ? badge("accent", t("Session.thread"), { small: true }) : "", e.private ? badge("off", t("Session.gmOnly"), { small: true }) : ""].join("");
    const when = dates ? whenText(e, { ...o, start: o.start }) : e.rtText || "";
    return `${sep}<li class="${e.type === "note" ? "wc-tl-note" : ""}" data-type="${esc(e.type)}"${e.at ? ` data-at="${esc(e.at)}"` : ""}><span class="wc-tl-time"><span>${esc(when)}</span>${worldTimeText(e) ? `<span>${esc(worldTimeText(e))}</span>` : ""}</span>`
      + `<span class="wc-tl-icon wc-${tone}" aria-hidden="true"><i class="fa-solid ${esc(ic)}"></i></span><span class="wc-tl-text"><span class="wc-sr">${esc(TYPES[e.type]?.label ?? e.type)}:</span>${esc(e.text)}</span>`
      + `<span class="wc-tl-aside">${aside}</span></li>`;
  }).join("")}</ol>`;
}

// ---------------------------------------------------------------- session dashboard: roster with live HP (dnd5e only)
/**
 * A dnd5e hit-point reading from `system.attributes.hp` ({ value, max, temp, tempmax, effectiveMax }), or null when it can't be read.
 * The bar's maximum is dnd5e's effectiveMax when present, else max + tempmax. pct is clamped to 0–100.
 * @param {any} hp
 * @returns {{ value: number, max: number, temp: number, pct: number, tone: string } | null}
 */
export function hpOf(hp) {
  if (!hp || typeof hp !== "object") return null;
  const num = v => (v === null || v === undefined || v === "" ? NaN : Number(v));
  const value = num(hp.value), base = num(hp.max);
  if (!Number.isFinite(value) || !Number.isFinite(base)) return null;
  const eff = num(hp.effectiveMax);
  const max = Number.isFinite(eff) ? eff : Math.max(0, base + (Number(hp.tempmax) || 0));
  if (!(max > 0)) return null;
  const pct = Math.round(Math.min(100, Math.max(0, (value / max) * 100)));
  const tone = value <= 0 ? "bad" : pct <= 25 ? "bad" : pct <= 50 ? "warn" : "ok";
  return { value, max, temp: Math.max(0, Number(hp.temp) || 0), pct, tone };
}

/**
 * "At the table": the connected players (not GMs), each with their character's name and portrait, and their HP when `dnd5e`.
 * `users`: [{ id, name, color, active, isGM, character: { name, img, hp } | null }]. On other systems `hp` is always null (never shown).
 */
export function rosterModel(users = [], { dnd5e = false } = {}) {
  return (Array.isArray(users) ? users : []).filter(u => u && u.active && !u.isGM)
    .map(u => ({ id: String(u.id ?? ""), name: String(u.name ?? ""), color: String(u.color ?? ""), label: u.character?.name || u.name || "",
      img: u.character?.img || "", hasCharacter: !!u.character, hp: dnd5e && u.character ? hpOf(u.character.hp) : null }))
    .sort((a, b) => String(a.label).localeCompare(String(b.label)));
}

/** Whether an actor update can change what the roster shows (the first line of the updateActor hook). Pure. */
export function rosterTouched(changes) {
  const c = changes && typeof changes === "object" ? changes : {};
  const hp = c.system?.attributes?.hp;
  return !!(hp && typeof hp === "object") || "name" in c || "img" in c;
}

export function rosterHTML(rows = [], { dnd5e = false } = {}) {
  if (!rows.length) return `<p class="wc-hint rb-pad">${esc(t("Roster.none"))}</p>`;
  return `<ul class="wc-panel-list rb-roster">${rows.map(r => {
    const face = r.img ? `<img class="rb-face" src="${esc(r.img)}" alt="">` : `<span class="rb-face rb-face-dot" style="background:${esc(r.color || "#888")}"></span>`;
    const hp = r.hp ? `<span class="rb-hp wc-${r.hp.tone}" role="meter" aria-valuemin="0" aria-valuemax="${r.hp.max}" aria-valuenow="${r.hp.value}" aria-label="${esc(t("Roster.hpOf", { name: r.label }))}">`
      + `<span class="rb-hp-bar"><span style="width:${r.hp.pct}%"></span></span><span class="rb-hp-val wc-mono">${r.hp.value}/${r.hp.max}${r.hp.temp ? ` +${r.hp.temp}` : ""}</span></span>`
      : dnd5e && !r.hasCharacter ? `<span class="wc-hint">${esc(t("Roster.noCharacter"))}</span>` : "";
    return `<li data-user="${esc(r.id)}">${face}<span class="wc-grow rb-who"><strong>${esc(r.label)}</strong>${r.label !== r.name ? ` <span class="wc-hint">${esc(r.name)}</span>` : ""}</span>${hp}</li>`;
  }).join("")}</ul>`;
}

// ---------------------------------------------------------------- session dashboard
/** Stat tiles. */
const stat = (k, v, sub = "") => `<div class="wc-stat"><p class="wc-stat-k">${esc(k)}</p><div class="wc-stat-v">${esc(v)}${sub ? ` <span class="wc-hint">${esc(sub)}</span>` : ""}</div></div>`;

/**
 * The session dashboard. `m`: { on (session log on), session: normalized session or null (the open one), last: the latest ended
 * one or null, now (ms), filter, roster: rows, dnd5e, online: { present, expected } | null, rosterOn }.
 */
export function sessionPageHTML(m) {
  const s = m.session; const shown = s ?? m.last;
  const banner = !m.on ? `<div class="wc-banner wc-off">${icon("off")}<span class="wc-banner-text">${esc(t("Session.logOff"))}</span></div>`
    : s ? `<div class="wc-banner wc-live rb-live">${dot("live")}<span class="wc-banner-text"><strong>${esc(t("Session.live"))}</strong> · ${esc(s.name)}${s.startedAt ? (m.timer ? ` · <span class="rb-clock" data-tooltip="${esc(t("Timer.elapsed"))}"><i class="fa-solid fa-stopwatch" aria-hidden="true"></i> <span data-rb-clock="${esc(s.startedAt)}">${esc(clockText(elapsedMs(s.startedAt, m.now)))}</span></span>` : ` · ${esc(t("Session.since", { time: durationText(Math.max(0, Math.round((m.now - s.startedAt) / 1000))) }))}`) : ""}</span>${btn("note", "fa-solid fa-pen", t("Session.noteBox"), { small: true })}${btn("end", "fa-solid fa-book-bookmark", t("Session.end"), { small: true })}</div>`
      : `<div class="wc-banner wc-none">${icon("none")}<span class="wc-banner-text">${esc(t("Session.notLive"))}</span>${btn("startDialog", "fa-solid fa-flag-checkered", t("Session.startDialog"), { small: true, disabled: !m.startOn })}${btn("start", "fa-solid fa-book", t("Session.start"), { small: true, primary: true })}</div>`;
  const ev = shown?.events ?? [];
  const count = type => ev.filter(e => e.type === type).length;
  const played = shown?.startedAt ? durationText(Math.max(0, Math.round(((s ? m.now : shown.endedAt || m.now) - shown.startedAt) / 1000))) : "–";
  const threads = ev.filter(e => e.type === "note" && e.thread).length;
  const range = shown?.startedAt && m.dates !== false ? rangeText(shown.startedAt, s ? 0 : shown.endedAt, { timeZone: m.timeZone, locale: m.locale }) : "";
  const playedTile = s && m.timer && s.startedAt
    ? `<div class="wc-stat"><p class="wc-stat-k">${esc(t("Session.statPlayed"))}</p><div class="wc-stat-v wc-mono" data-rb-clock="${esc(s.startedAt)}">${esc(clockText(elapsedMs(s.startedAt, m.now)))}</div></div>`
    : stat(t("Session.statPlayed"), played);
  const tiles = m.on && shown ? `<p class="wc-section-label">${esc(s ? t("Session.thisSession") : t("Session.lastSession", { name: shown.name }))}${range ? ` <span class="wc-hint">${esc(range)}</span>` : ""}</p><div class="wc-stats rb-stats">
      ${stat(t("Session.statEvents"), String(ev.length))}
      ${playedTile}
      ${stat(t("Session.statCombats"), String(count("combatStart")), count("down") ? t("Session.downs", { n: count("down") }) : "")}
      ${stat(t("Session.statNotes"), String(count("note")), threads ? t("Session.threads", { n: threads }) : "")}
      ${m.online ? stat(t("Session.statHere"), `${m.online.present}/${m.online.expected}`) : ""}
    </div>` : "";
  const note = m.on && s ? `<div class="rb-quicknote wc-row"><label class="wc-sr" for="rb-note-text">${esc(t("Session.noteLabel"))}</label>
      <input type="text" id="rb-note-text" name="noteText" class="wc-grow" maxlength="2000" autocomplete="off" placeholder="${esc(t("Session.notePlaceholder"))}">
      <label class="rb-check"><input type="checkbox" name="noteThread"> ${esc(t("Session.thread"))}</label>
      <label class="rb-check"><input type="checkbox" name="notePrivate"> ${esc(t("Session.gmOnly"))}</label>
      ${btn("addNote", "fa-solid fa-plus", t("Session.addNote"), { small: true, primary: true })}</div>` : "";
  const counts = filterCounts(ev);
  const chips = `<div class="wc-row rb-chips" role="group" aria-label="${esc(t("Session.filterLabel"))}">${Object.keys(FILTERS).map(f => `<button type="button" class="wc-chip" data-action="filter" data-filter="${f}" aria-pressed="${f === m.filter ? "true" : "false"}">${esc(t(`Filter.${f}`))} <span class="wc-hint">${counts[f]}</span></button>`).join("")}</div>`;
  const rows = filterEvents(ev, m.filter, TIMELINE_MAX);
  const more = (Object.hasOwn(FILTERS, m.filter) ? counts[m.filter] : counts.all) > TIMELINE_MAX ? hint(t("Session.more", { n: TIMELINE_MAX })) : "";
  const timeline = m.on && shown ? panel(t("Session.timeline"), "fa-solid fa-timeline", `${chips}${timelineHTML(rows, { start: shown.startedAt, timeZone: m.timeZone, locale: m.locale })}${more}`, { cls: "rb-tl-panel", head: shown.uuid ? iconBtn("openUuid", "fa-solid fa-up-right-from-square", t("Session.openJournal"), { uuid: shown.uuid }) : "" }) : "";
  const table = panel(t("Roster.title"), "fa-solid fa-users", rosterHTML(m.roster ?? [], { dnd5e: !!m.dnd5e }), { cls: "rb-roster-panel", head: m.online ? badge(m.online.expected && m.online.present === m.online.expected ? "ok" : "info", `${m.online.present}/${m.online.expected}`, { small: true }) : "" });
  const side = [table, m.on && m.previously ? previouslyPanelHTML(m.previously) : "", m.on && shown && m.npcs ? npcsPanelHTML(shown, { timeZone: m.timeZone, locale: m.locale }) : "",
    m.on && shown && m.attendance ? attendancePanelHTML(shown, m.attendance) : ""].join("");
  return `${pageHead(t("Nav.session"))}${banner}${tiles}${note}<div class="wc-cols rb-session-cols"><div class="rb-col-main">${timeline || (m.on ? hint(t("Session.none")) : "")}</div><div class="rb-col-side">${side}</div></div>`;
}

// ---------------------------------------------------------------- 0.6.0 side panels
/**
 * "Previously on…": Preview (this GM only) and Show to players. `p`: { recap: { id, name } | null }.
 * @param {{ recap?: { id: string, name: string } | null }} p
 */
export function previouslyPanelHTML(p) {
  const body = p?.recap
    ? `<div class="wc-panel-body"><p class="rb-ellipsis">${esc(p.recap.name)}</p><div class="wc-row">${btn("prevPreview", "fa-solid fa-eye", t("Previously.previewBtn"), { small: true })}${btn("prevShow", "fa-solid fa-clapperboard", t("Previously.show"), { small: true, primary: true })}</div></div>`
    : `<p class="wc-hint rb-pad">${esc(t("Previously.none"))}</p>`;
  return panel(t("Previously.title"), "fa-solid fa-clapperboard", body, { cls: "rb-prev-panel" });
}
/**
 * NPCs met in the session shown (open or last): name, scene, first seen; a remove button each.
 * @param {any} s @param {{ timeZone?: string, locale?: string }} [o]
 */
export function npcsPanelHTML(s, o = {}) {
  const list = Array.isArray(s?.npcs) ? s.npcs : [];
  const body = list.length ? `<ul class="wc-panel-list rb-npc-list">${[...list].reverse().map(n => `<li><span class="wc-grow rb-who"><strong>${esc(n.name)}</strong> <span class="wc-hint">${esc([n.sceneName, n.at ? whenText({ t: n.at }, { ...o, start: s.startedAt }) : ""].filter(Boolean).join(" · "))}</span></span>${iconBtn("unmeet", "fa-solid fa-user-minus", t("Npcs.remove", { name: n.name }), { session: s.id ?? "", key: n.key })}</li>`).join("")}</ul>`
    : `<p class="wc-hint rb-pad">${esc(t("Npcs.none"))}</p>`;
  return panel(t("Npcs.title"), "fa-solid fa-user-group", body, { cls: "rb-npcs-panel", head: list.length ? badge("info", String(list.length), { small: true }) : "" });
}
/**
 * Attendance and awards for the session shown. `a`: { mode ("xp" | "milestone" | "off"), players: [{ userId, name, characterId,
 * characterName }] (every player user, to add someone by hand) }.
 * @param {any} s @param {{ mode?: string, players?: any[] }} a
 */
export function attendancePanelHTML(s, a = {}) {
  const here = present(s?.attendance ?? []);
  const ids = new Set(here.map(x => x.userId));
  const xp = new Map((s?.awards?.xp ?? []).map(x => [x.actorId, x.n]));
  const sid = s?.id ?? "";
  const rows = here.map(x => `<li><span class="wc-grow rb-who"><strong>${esc(x.characterName || x.name)}</strong>${x.characterName ? ` <span class="wc-hint">${esc(x.name)}</span>` : ""}</span>`
    + `${a.mode === "xp" && x.characterId ? `<label class="wc-sr" for="rb-xp-${esc(x.characterId)}">${esc(t("Attend.xpFor", { name: x.characterName || x.name }))}</label><input type="number" class="rb-xp" id="rb-xp-${esc(x.characterId)}" name="xp-${esc(x.characterId)}" data-actor="${esc(x.characterId)}" data-name="${esc(x.characterName || x.name)}" min="0" step="1" value="${xp.get(x.characterId) ?? ""}" placeholder="XP">` : ""}`
    + `${iconBtn("attendOff", "fa-solid fa-user-xmark", t("Attend.remove", { name: x.characterName || x.name }), { session: sid, user: x.userId })}</li>`).join("");
  const missing = (a.players ?? []).filter(p => !ids.has(p.userId));
  const add = missing.length ? `<div class="wc-row rb-attend-add"><label class="wc-sr" for="rb-attend-pick">${esc(t("Attend.add"))}</label><select id="rb-attend-pick" name="attendPick">${missing.map(p => `<option value="${esc(p.userId)}">${esc(p.characterName || p.name)}</option>`).join("")}</select>${btn("attendOn", "fa-solid fa-user-plus", t("Attend.add"), { small: true, data: { session: sid } })}</div>` : "";
  const award = a.mode === "milestone" ? `<div class="rb-milestone-row"><label for="rb-milestone">${esc(t("Attend.milestone"))}</label><input type="text" id="rb-milestone" name="milestone" maxlength="500" value="${esc(s?.awards?.milestone ?? "")}" placeholder="${esc(t("Attend.milestoneHint"))}"></div>` : "";
  const save = a.mode === "xp" || a.mode === "milestone" ? `<div class="wc-row wc-end">${btn("saveAwards", "fa-solid fa-floppy-disk", t("Attend.save"), { small: true, primary: true, data: { session: sid } })}</div>` : "";
  const body = `<div class="wc-panel-body">${here.length ? `<ul class="wc-panel-list rb-attend-list">${rows}</ul>` : hint(t("Attend.none"))}${add}${award}${save}${a.mode === "xp" ? hint(t("Attend.xpHint")) : ""}</div>`;
  return panel(t("Attend.title"), "fa-solid fa-clipboard-user", body, { cls: "rb-attend-panel", head: badge("info", String(here.length), { small: true }) });
}

// ---------------------------------------------------------------- board (three columns)
/**
 * The next-session board. `m`: board.model() ({ quests, links, last, pins, toolkit }); `look(uuid)` → { name, exists, scene };
 * `opts`: { sessionOn, checkOn, pinsMax }.
 */
export function boardPageHTML(m, look, opts = {}) {
  const row = (uuid, label, extra = "") => {
    const d = look(uuid) ?? { name: uuid, exists: false, scene: false };
    const acts = d.scene && d.exists ? `${iconBtn("viewScene", "fa-solid fa-eye", t("Board.view"), { uuid })}${opts.checkOn ? iconBtn("checkScene", "fa-solid fa-clipboard-check", t("Board.check"), { uuid }) : ""}` : "";
    return `<li class="rb-brow${d.exists ? "" : " rb-gone"}"><span class="wc-grow"><a class="rb-open" data-action="openUuid" data-uuid="${esc(uuid)}">${esc(label || d.name || uuid)}</a>${d.exists ? "" : ` ${badge("bad", t("Board.missing"), { small: true })}`}${extra}</span>${acts}</li>`;
  };
  const list = (items, none) => items.length ? `<ul class="wc-panel-list">${items.join("")}</ul>` : `<p class="wc-hint rb-pad">${esc(none)}</p>`;
  const quests = !m.toolkit ? `<p class="wc-hint rb-pad">${esc(t("Board.noToolkit", { name: toolkitTitle() }))}</p>`
    : list(m.quests.map(q => row(q.uuid, q.name, `${q.zone ? ` <span class="wc-chip">${esc(q.zone)}</span>` : ""}${q.next.length ? `<ul class="rb-next">${q.next.map(x => `<li>${esc(x)}</li>`).join("")}${q.more ? `<li class="wc-hint">${esc(t("Board.andMore", { n: q.more }))}</li>` : ""}</ul>` : ""}`)), t("Board.noQuests"));
  const last = m.last ? `<div class="wc-panel-body"><p>${`<a class="rb-open" data-action="openUuid" data-uuid="${esc(m.last.uuid)}">${esc(m.last.name)}</a>`}${m.last.open ? ` ${badge("live", t("Session.live"), { small: true, dot: true })}` : ""}</p>
      ${(m.last.summary?.notable ?? []).length ? `<ul class="rb-next">${m.last.summary.notable.slice(0, 8).map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      <p class="wc-section-label">${esc(t("Board.threads"))}</p>${m.last.threads.length ? `<ul class="rb-next">${m.last.threads.map(x => `<li>${esc(x.text)}${x.private ? ` ${badge("off", t("Session.gmOnly"), { small: true })}` : ""}</li>`).join("")}</ul>` : hint(t("Board.noThreads"))}</div>`
    : `<p class="wc-hint rb-pad">${esc(opts.sessionOn ? t("Board.noSession") : t("Session.logOff"))}</p>`;
  const linked = (items, none) => list(items.map(e => row(e.uuid, "", ` <span class="wc-hint">${esc(e.from.join(", "))}</span>`)), none);
  const scenes = m.links.scenes;
  const pins = `<div class="rb-drop" data-drop>${m.pins.length ? `<ul class="wc-panel-list">${m.pins.map(p => row(p.uuid, p.name || "", "").replace(/<\/li>$/, `${iconBtn("unpin", "fa-solid fa-xmark", t("Board.unpin"), { uuid: p.uuid })}</li>`)).join("")}</ul>` : ""}<p class="wc-hint rb-pad">${esc(t("Board.dropHint", { n: opts.pinsMax ?? 50 }))}</p></div>`;
  return `${pageHead(t("Nav.board"))}<div class="rb-board3">
    <div class="rb-board-col">${opts.next ? nextPanelHTML(opts.next) : ""}${panel(t("Board.quests"), "fa-solid fa-scroll", quests)}${panel(t("Board.last"), "fa-solid fa-book", last)}</div>
    <div class="rb-board-col">${panel(t("Board.npcs"), "fa-solid fa-user-group", linked(m.links.actors, t("Board.noNpcs")))}${panel(t("Board.journals"), "fa-solid fa-book-open", linked([...m.links.journals, ...m.links.other], t("Board.noJournals")))}${panel(t("Board.scenes"), "fa-solid fa-map", linked(scenes, t("Board.noScenes")), { head: scenes.length && opts.checkOn ? btn("checkAll", "fa-solid fa-clipboard-check", t("Board.checkAll"), { small: true }) : "" })}</div>
    <div class="rb-board-col">${opts.prepOn ? prepPanelHTML(m.todos ?? [], { checkOn: !!opts.checkOn, max: opts.todosMax }) : ""}${panel(t("Board.pinned"), "fa-solid fa-thumbtack", pins, { head: badge("info", `${m.pins.length}/${opts.pinsMax ?? 50}`, { small: true }) })}</div>
  </div>`;
}

/**
 * The board's Next session field (0.5.0): a local date and time, Save, Clear and (Discord posts on) Post to Discord. `n`: { at (ms,
 * 0 = not set), now, discord (feature on) }. Shown as "in 3 days" next to it when set.
 * @param {{ at?: number, now?: number, discord?: boolean }} n
 */
export function nextPanelHTML(n) {
  const at = Number(n?.at) || 0; const now = Number(n?.now) || 0;
  const when = at ? (at >= now ? t("Next.in", { time: durationText(Math.round((at - now) / 1000)) }) : t("Next.past")) : t("Next.unset");
  const body = `<div class="wc-panel-body"><div class="wc-row rb-next-row"><label class="wc-sr" for="rb-next-at">${esc(t("Next.label"))}</label>
    <input type="datetime-local" id="rb-next-at" name="nextAt" value="${esc(toLocalInput(at))}">
    ${btn("saveNext", "fa-solid fa-floppy-disk", t("Common.save"), { small: true, primary: true })}${at ? btn("clearNext", "fa-solid fa-xmark", t("Next.clear"), { small: true }) : ""}${n?.discord && at ? btn("postNext", "fa-brands fa-discord", t("Next.post"), { small: true }) : ""}</div>
    <p class="wc-hint">${esc(when)}</p></div>`;
  return panel(t("Next.title"), "fa-solid fa-calendar-day", body);
}

/**
 * The board's prep list (0.5.0): scene-check findings sent from the Scene check page, grouped by scene, each scene a link with
 * Check again; each item has a Done button. `items`: board-model normalizeTodos().
 * @param {any[]} items
 * @param {{ checkOn?: boolean, max?: number }} [opts]
 */
export function prepPanelHTML(items = [], { checkOn = true, max = 100 } = {}) {
  /** @type {Map<string, any[]>} */ const by = new Map();
  for (const i of items) { const l = by.get(i.sceneId) ?? []; l.push(i); by.set(i.sceneId, l); }
  const body = items.length ? [...by.values()].map(list => {
    const sc = list[0];
    const head = `<p class="wc-row rb-prep-scene"><a class="rb-open wc-grow rb-ellipsis" data-action="openUuid" data-uuid="${esc(sc.sceneUuid)}">${esc(sc.sceneName || sc.sceneUuid)}</a>${checkOn ? iconBtn("checkScene", "fa-solid fa-clipboard-check", t("Board.check"), { scene: sc.sceneId }) : ""}</p>`;
    return `${head}<ul class="wc-lines rb-prep-list">${list.map(i => statusLine(sevTone(i.severity), i.text, { html: `<span class="rb-find-acts">${iconBtn("prepDone", "fa-solid fa-check", t("Prep.done"), { id: i.id })}</span>` })).join("")}</ul>`;
  }).join("") : `<p class="wc-hint rb-pad">${esc(t("Prep.none"))}</p>`;
  // 0.8.0: "3 to do" (Done takes an item off, so there is no done count); the cap shows in the tooltip, and in the badge once the
  // list is nearly full ("92 to do · max 100").
  const near = items.length >= Math.ceil(max * 0.8);
  const label = near ? t("Prep.countMax", { n: items.length, max }) : t("Prep.count", { n: items.length });
  return panel(t("Prep.title"), "fa-solid fa-list-check", `<div class="wc-panel-body">${body}</div>`, { head: badge(items.length >= max ? "bad" : items.length ? "warn" : "ok", label, { small: true, title: t("Prep.cap", { max }) }) });
}

/** 0.8.0: the quiet "Start a session?" banner (bottom of the screen, GM's browser): text, Start, and a close button. */
export function startBannerHTML() {
  return `<span class="rb-banner-grip" title="${esc(t("Prompt.dragHint"))}"><i class="fa-solid fa-grip-vertical rb-grip-icon" aria-hidden="true"></i><i class="fa-solid fa-book" aria-hidden="true"></i><span class="rb-banner-text">${esc(t("Prompt.quiet"))}</span></span>`
    + `<button type="button" class="wc-btn wc-btn-sm wc-btn-primary" data-rb-banner="start"><i class="fa-solid fa-book" aria-hidden="true"></i> ${esc(t("Session.start"))}</button>`
    + `<button type="button" class="wc-btn wc-btn-icon wc-btn-ghost" data-rb-banner="close" data-tooltip="${esc(t("Prompt.dismiss"))}" aria-label="${esc(t("Prompt.dismiss"))}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>`;
}

// ---------------------------------------------------------------- scene check (master–detail)
/** A severity as a core tone. */
export const sevTone = sev => (sev === "problem" ? "bad" : sev === "warning" ? "warn" : "info");
/** A scene list entry's tone from its last result (memory): pending, not checked, problem, warning, clear. */
export function resultTone(r) {
  if (!r) return "none";
  if (r.pending) return "pending";
  if (r.tally?.problem) return "bad";
  if (r.tally?.warning) return "warn";
  return "ok";
}

/**
 * 0.8.0: when a result was made: "Checked 18:20" today, "Checked Sat 14 Mar 18:20" on another day (viewer's zone; `o.now`,
 * `o.timeZone`, `o.locale` for tests).
 * @param {number} at @param {{ now?: number, timeZone?: string, locale?: string }} [o]
 */
export function checkedText(at, o = {}) {
  const now = o.now ?? Date.now();
  const clock = timeLabel(at, o);
  return t("Check.checkedAt", { time: dayKey(at, o.timeZone) === dayKey(now, o.timeZone) ? clock : `${dayLabel(at, o)} ${clock}` });
}
const checkedTitle = (at, o = {}) => `${dayLabel(at, o)} ${timeLabel(at, o)}`;

/**
 * `m`: { scenes: [{ id, name }], results: { [sceneId]: result | { pending: true } } (the GM client's memory, 0.8.0: with this
 * browser's saved results; `at` = when checked), selected, query, now?, timeZone?, locale? }. A result is check.mjs checkOne()'s { scene, findings, ignored, stored, tally }.
 */
/**
 * `m.prep` (0.5.0, prep list on): { on: true, onBoard: Set of prep-list ids already on the board } adds "Add to board" per finding
 * and "Add all failures".
 */
export function checkPageHTML(m) {
  const q = String(m.query ?? "").trim().toLowerCase();
  const scenes = m.scenes ?? [];
  const results = m.results ?? {};
  const item = s => {
    const r = results[s.id]; const tone = resultTone(r);
    const word = r?.pending ? t("Check.checking") : r ? tallyText(r.tally) : t("Check.notChecked");
    const name = String(s.name).toLowerCase();
    // 0.8.0: names wrap to two lines (rb-clamp2) and the full name is always the tooltip.
    return `<li class="${s.id === m.selected ? "active" : ""}" data-name="${esc(name)}"${q && !name.includes(q) ? " hidden" : ""}><button type="button" class="rb-scene-btn" data-action="pickScene" data-scene="${esc(s.id)}" title="${esc(s.name)}"${s.id === m.selected ? ` aria-current="true"` : ""}>${dot(tone, { label: word })}<span class="wc-grow rb-clamp2">${esc(s.name)}</span><span class="wc-hint rb-ellipsis">${esc(word)}</span></button></li>`;
  };
  const saved = Object.values(results).some(r => r && !r.pending && Number(r.at) > 0);
  const list = `<div class="rb-master"><div class="rb-search"><label class="wc-sr" for="rb-scene-q">${esc(t("Check.search"))}</label><input type="search" id="rb-scene-q" data-filter-scenes placeholder="${esc(t("Check.search"))}" value="${esc(m.query ?? "")}"></div>
    <ul class="wc-panel-list rb-scene-list">${scenes.map(item).join("") || `<li class="wc-hint">${esc(t("Check.noScenes"))}</li>`}</ul>
    <div class="wc-row rb-pad">${btn("checkAllScenes", "fa-solid fa-list-check", t("Check.all", { n: (m.scenes ?? []).length }), { small: true })}${saved ? btn("clearSavedChecks", "fa-solid fa-eraser", t("Check.clearSaved"), { small: true }) : ""}</div></div>`;
  const sel = (m.scenes ?? []).find(s => s.id === m.selected);
  const r = sel ? results[sel.id] : null;
  let detail;
  if (!sel) detail = `<div class="wc-alert wc-info">${icon("info")}<div class="wc-alert-title">${esc(t("Check.pick"))}</div><p>${esc(t("Check.readOnly"))}</p></div>`;
  else {
    const when = r && !r.pending && Number(r.at) > 0 ? `<span class="wc-hint rb-checked-at" title="${esc(checkedTitle(r.at, m))}">${esc(checkedText(r.at, m))}</span>` : "";
    const head = `<div class="wc-row rb-detail-head"><h3 class="wc-grow rb-ellipsis" title="${esc(sel.name)}">${esc(sel.name)}</h3>${when}${btn("checkScene", "fa-solid fa-clipboard-check", r && !r.pending ? t("Check.again") : t("Check.run"), { small: true, primary: true, data: { scene: sel.id }, disabled: !!r?.pending })}${r && !r.pending ? btn("exportCheck", "fa-solid fa-file-export", t("Check.export"), { small: true, data: { scene: sel.id } }) : ""}</div>`;
    if (!r) detail = `${head}${hint(t("Check.readOnly"))}`;
    else if (r.pending) detail = `${head}<p class="wc-status wc-pending">${icon("pending")}<span>${esc(t("Check.checking"))}</span></p>`;
    else detail = `${head}${checkResultHTML(r, m.prep)}`;
  }
  return `${pageHead(t("Nav.check"), `<span class="wc-hint">${esc(t("Check.saved"))}</span>`)}<div class="rb-md">${list}<div class="rb-detail">${detail}</div></div>`;
}

/**
 * One scene's findings, grouped by rule category, then the ignored ones and Clear ignored. `prep` (0.5.0): { on, onBoard: Set of
 * prep-list ids } adds "Add to board" on each failed (problem or warning) finding and "Add all failures".
 * @param {any} r
 * @param {{ on?: boolean, onBoard?: Set<string> }} [prep]
 */
export function checkResultHTML(r, prep = {}) {
  const sid = r.scene?.id ?? "";
  const onBoard = prep?.onBoard ?? new Set();
  const failures = (r.findings ?? []).filter(isFailure);
  const toAdd = failures.filter(f => !onBoard.has(todoId(sid, f)));
  const boardBtn = (f, i, ignored) => {
    if (!prep?.on || ignored || !isFailure(f)) return "";
    return onBoard.has(todoId(sid, f)) ? `<span class="rb-on-board" data-tooltip="${esc(t("Prep.onBoard"))}" aria-label="${esc(t("Prep.onBoard"))}"><i class="fa-solid fa-thumbtack" aria-hidden="true"></i></span>`
      : iconBtn("prepAdd", "fa-solid fa-thumbtack", t("Prep.add"), { scene: sid, i });
  };
  const row = (f, i, ignored) => statusLine(sevTone(f.severity), f.text, { html: `<span class="rb-find-acts">${boardBtn(f, i, ignored)}${f.fix ? iconBtn("fix", "fa-solid fa-wrench", t("Check.fix"), { scene: sid, i, ignored: ignored ? 1 : 0 }) : ""}${f.key ? (ignored
    ? iconBtn("unignore", "fa-solid fa-eye", f.ignore?.name ? t("Check.unignoreBy", { name: f.ignore.name }) : t("Check.unignore"), { scene: sid, key: f.key })
    : iconBtn("ignore", "fa-solid fa-eye-slash", t("Check.ignore"), { scene: sid, key: f.key })) : ""}</span>` });
  const total = `<p class="wc-status ${r.tally.problem ? "wc-bad" : r.tally.warning ? "wc-warn" : "wc-ok"}">${icon(r.tally.problem ? "bad" : r.tally.warning ? "warn" : "ok")}<span>${esc(tallyText(r.tally))}${r.ignored?.length ? ` · ${esc(t("Check.ignoredN", { n: r.ignored.length }))}` : ""}</span></p>`;
  const index = new Map((r.findings ?? []).map((f, i) => [f, i]));
  const groups = groupFindings(r.findings ?? []).map(g => panel(t(`Check.cat.${g.id}`), g.icon, `<ul class="wc-lines rb-pad">${g.findings.map(f => row(f, index.get(f), false)).join("")}</ul>`, { head: badge(g.findings.some(f => f.severity === "problem") ? "bad" : g.findings.some(f => f.severity === "warning") ? "warn" : "info", String(g.findings.length), { small: true }) })).join("");
  const ign = r.ignored?.length ? `<details class="rb-ignored"><summary>${esc(t("Check.ignoredList", { n: r.ignored.length }))}</summary><ul class="wc-lines rb-pad">${r.ignored.map((f, i) => row(f, i, true)).join("")}</ul></details>` : "";
  const clear = r.stored ? `<div class="wc-row">${btn("clearIgnored", "fa-solid fa-eraser", t("Check.clearIgnored", { n: r.stored }), { small: true, data: { scene: sid } })}</div>` : "";
  const addAll = prep?.on && failures.length ? `<div class="wc-row rb-prep-all">${btn("prepAddAll", "fa-solid fa-thumbtack", t("Prep.addAll", { n: toAdd.length }), { small: true, data: { scene: sid }, disabled: !toAdd.length })}${toAdd.length ? "" : `<span class="wc-hint">${esc(t("Prep.allOnBoard"))}</span>`}</div>` : "";
  return `${total}${addAll}${groups || `<p class="wc-status wc-ok">${icon("ok")}<span>${esc(t("Check.nothing"))}</span></p>`}${ign}${clear}`;
}

// ---------------------------------------------------------------- who's online
/** The roster list (window, page and Hub panel). `r`: online-model roster(). */
export function onlineListHTML(r, { compact = false } = {}) {
  const row = e => `<li class="${e.active ? "on" : "off"}${e.counts ? "" : " extra"}" title="${esc(e.name)}${e.character ? ` (${esc(e.character.name)})` : ""}${e.active ? "" : `: ${esc(t("Online.notConnected"))}`}">`
    + `${e.character?.img ? `<img src="${esc(e.character.img)}" alt="">` : `<span class="rb-face-dot" style="background:${esc(e.color || "#888")}"></span>`}`
    + `<span class="nm">${esc(e.label)}${e.character && !compact ? ` <small>${esc(e.name)}</small>` : ""}${e.isGM ? ` <small>${esc(t("Online.gm"))}</small>` : ""}</span>${e.active ? "" : `<span class="wc-sr">${esc(t("Online.notConnected"))}</span>`}</li>`;
  return `<ul class="rb-online-list">${r.entries.filter(e => e.active || e.counts).map(row).join("")}</ul>`;
}
/** The roster's status line: Everyone's here / n of m here / nobody counts. */
export function onlineStatus(r) {
  if (r.all) return { tone: "ok", text: t("Online.all") };
  if (r.expected) return { tone: "info", text: t("Online.count", { present: r.present, expected: r.expected }) };
  return { tone: "off", text: t("Online.nobody") };
}
/** The count pill text: "3/4" (or "–" when nobody counts). */
export const countPill = r => (r.expected ? `${r.present}/${r.expected}` : "–");

/**
 * The Hub panel's inner markup: a header (title, count pill, collapse toggle) and, unless collapsed, the list. The header is the
 * drag handle (`.rb-online-head`); the toggle is a real button (Enter/Space), so the panel can be folded from the keyboard.
 */
export function hudHTML(r, { collapsed = false, drag = true } = {}) {
  const st = onlineStatus(r);
  const label = collapsed ? t("Online.expand") : t("Online.collapse");
  return `<header class="rb-online-head${drag ? " rb-drag" : ""}"${drag ? ` title="${esc(t("Online.dragHint"))}"` : ""}><span class="rb-online-title">${esc(t("Online.title"))}</span>`
    + `${badge(st.tone, countPill(r), { small: true, title: st.text, cls: "rb-online-pill" })}`
    + `<button type="button" class="rb-online-toggle" aria-expanded="${collapsed ? "false" : "true"}" aria-controls="rb-online-body" aria-label="${esc(label)}" data-tooltip="${esc(label)}"><i class="fa-solid ${collapsed ? "fa-chevron-down" : "fa-chevron-up"}" aria-hidden="true"></i></button></header>`
    + `<div id="rb-online-body" class="rb-online-body"${collapsed ? " hidden" : ""}>${statusLine(st.tone, st.text, { tag: "p" })}${onlineListHTML(r, { compact: true })}</div>`;
}

/** The Who's online page (main window) and window body. */
export function onlinePageHTML(r, { page = true, hubs = [] } = {}) {
  const st = onlineStatus(r);
  const body = `${statusLine(st.tone, st.text, { tag: "p" })}${onlineListHTML(r)}`;
  if (!page) return `<div class="rb-online-board">${body}</div>`;
  return `${pageHead(t("Nav.online"), badge(st.tone, countPill(r), { small: true }))}${panel(t("Online.title"), "fa-solid fa-users", `<div class="wc-panel-body rb-online-board">${body}</div>`)}
    ${hint(hubs.length ? t("Online.hubs", { list: hubs.slice(0, 5).join(", ") + (hubs.length > 5 ? ", …" : "") }) : t("Online.noHubs"))}
    <div class="wc-row">${btn("openOnline", "fa-solid fa-up-right-from-square", t("Online.window"), { small: true })}${btn("resetHud", "fa-solid fa-arrows-to-dot", t("Online.resetPos"), { small: true })}</div>`;
}

// ---------------------------------------------------------------- past sessions
/**
 * `list`: [{ id, uuid, name, n, open, events, startedAt, endedAt, attendance?, awards? }] (newest first is done here). 0.6.0 `o`:
 * { dates (show the date range), mode (award mode, or "off" / undefined: no award column), totals (awardTotals(), or null: no totals
 * table), timeZone, locale }.
 */
export function pastPageHTML(list = [], o = {}) {
  const rows = [...list].sort((a, b) => (Number(b.n) || 0) - (Number(a.n) || 0));
  const awards = o.mode === "xp" || o.mode === "milestone";
  const att = !!o.totals;
  const awardCell = s => o.mode === "xp" ? String((s.awards?.xp ?? []).reduce((n, x) => n + x.n, 0) || "–") : esc(s.awards?.milestone || "–");
  const body = rows.length ? `<div class="wc-table-box"><table class="wc-table"><thead><tr><th>${esc(t("Past.session"))}</th>${o.dates ? `<th>${esc(t("Past.when"))}</th>` : ""}<th>${esc(t("Past.events"))}</th><th>${esc(t("Past.played"))}</th>${att ? `<th>${esc(t("Past.here"))}</th>` : ""}${awards ? `<th>${esc(t(o.mode === "xp" ? "Past.xp" : "Past.milestone"))}</th>` : ""}<th><span class="wc-sr">${esc(t("Past.actions"))}</span></th></tr></thead><tbody>${rows.map(s => `<tr>
      <td><a class="rb-open" data-action="openUuid" data-uuid="${esc(s.uuid)}">${esc(s.name)}</a>${s.open ? ` ${badge("live", t("Session.live"), { small: true, dot: true })}` : ""}</td>
      ${o.dates ? `<td class="wc-hint">${esc(rangeText(s.startedAt, s.open ? 0 : s.endedAt, { timeZone: o.timeZone, locale: o.locale }))}</td>` : ""}
      <td>${Number(s.events) || 0}</td><td>${s.startedAt && s.endedAt ? esc(durationText(Math.round((s.endedAt - s.startedAt) / 1000))) : "–"}</td>
      ${att ? `<td>${esc(present(s.attendance ?? []).map(a => a.characterName || a.name).join(", ") || "–")}</td>` : ""}${awards ? `<td>${awardCell(s)}</td>` : ""}
      <td class="rb-right">${iconBtn("openUuid", "fa-solid fa-book-open", t("Past.open"), { uuid: s.uuid })}${iconBtn("recap", "fa-solid fa-share-from-square", t("Past.recap"), { id: s.id })}</td></tr>`).join("")}</tbody></table></div>`
    : `<div class="wc-alert wc-info">${icon("info")}<div class="wc-alert-title">${esc(t("Past.none"))}</div><p>${esc(t("Past.noneHint"))}</p></div>`;
  const tot = att ? Object.entries(o.totals).sort((a, b) => a[1].name.localeCompare(b[1].name)) : [];
  const totals = tot.length ? panel(t("Past.totals"), "fa-solid fa-trophy", `<div class="wc-table-box"><table class="wc-table"><thead><tr><th>${esc(t("Past.character"))}</th><th>${esc(t("Past.sessions"))}</th>${o.mode === "xp" ? `<th>${esc(t("Past.xp"))}</th>` : ""}${o.mode === "milestone" ? `<th>${esc(t("Past.milestones"))}</th>` : ""}</tr></thead><tbody>${tot.map(([, r]) => `<tr><td>${esc(r.name)}</td><td>${r.sessions}</td>${o.mode === "xp" ? `<td>${r.xp}</td>` : ""}${o.mode === "milestone" ? `<td>${r.milestones}</td>` : ""}</tr>`).join("")}</tbody></table></div>`) : "";
  return `${pageHead(t("Nav.past"), `<span class="wc-hint">${esc(plural(rows.length, "session"))}</span>`)}${body}${totals}`;
}

// ---------------------------------------------------------------- settings pages
/** One setting's input. `v`: its current value; `disabled` greys it out (tool off). */
export function inputHTML(s, v, disabled = false) {
  const dis = disabled ? " disabled" : ""; const id = `rb-set-${esc(s.key)}`;
  if (s.type === "bool") return `<input type="checkbox" id="${id}" name="${esc(s.key)}"${v ? " checked" : ""}${dis}>`;
  if (s.type === "choice") return `<select id="${id}" name="${esc(s.key)}"${dis}>${Object.entries(s.choices ?? {}).map(([k, l]) => `<option value="${esc(k)}"${k === v ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  if (s.type === "number") return `<input type="number" id="${id}" name="${esc(s.key)}" value="${esc(v)}" min="${s.min ?? ""}" max="${s.max ?? ""}" step="${s.step ?? 1}"${dis}>`;
  return `<input type="text" id="${id}" name="${esc(s.key)}" value="${esc(v ?? "")}"${dis}>`;
}
export const settingRowHTML = (s, v, off = false) => `<div class="form-group"><label for="rb-set-${esc(s.key)}">${esc(s.label)}</label><div class="form-fields">${inputHTML(s, v, off)}</div>${s.hint ? `<p class="hint">${esc(s.hint)}</p>` : ""}</div>`;
const saveBar = () => `<footer class="wc-row wc-end rb-save">${btn("", "fa-solid fa-floppy-disk", t("Common.save"), { primary: true, type: "submit" })}</footer>`;

/** Features: one switch per tool. `features`: [{ id, key, label, hint }]. */
export function featuresPageHTML(/** @type {readonly any[]} */ features = [], /** @type {(id: string) => boolean} */ on = () => true) {
  return `${pageHead(t("Nav.features"))}${hint(t("Features.hint"))}<div class="wc-panel"><div class="wc-panel-body">${features.map(f => `<div class="form-group"><label class="rb-check"><input type="checkbox" name="${esc(f.key)}"${on(f.id) ? " checked" : ""}> <strong>${esc(f.label)}</strong> ${on(f.id) ? badge("ok", t("Common.on"), { small: true }) : badge("off", t("Common.off"), { small: true })}</label><p class="hint">${esc(f.hint)}</p></div>`).join("")}</div></div>${saveBar()}`;
}

/**
 * Tool settings: chips to pick a tool, then its Basic rows and Advanced rows. `tabs`: settings-model TABS of tools; `rows`:
 * { basic, advanced }; `value(key)`; `off`: tool turned off; `extra`: trusted markup (buttons) after the rows.
 */
/** @param {{ tool: string, tabs?: any[], rows?: { basic: any[], advanced: any[] }, value?: (key: string) => any, off?: boolean, extra?: string }} opts */
export function toolSettingsHTML({ tool, tabs = [], rows = { basic: [], advanced: [] }, value = () => undefined, off = false, extra = "" }) {
  const chips = `<div class="wc-row rb-chips" role="group" aria-label="${esc(t("Tools.pick"))}">${tabs.map(x => `<button type="button" class="wc-chip" data-action="tool" data-tool="${esc(x.id)}" aria-pressed="${x.id === tool ? "true" : "false"}"><i class="${esc(x.icon)}" aria-hidden="true"></i> ${esc(x.label)}</button>`).join("")}</div>`;
  const n = rows.basic.length + rows.advanced.length;
  return `${pageHead(t("Nav.tools"))}${chips}${off ? offAlert() : ""}<div class="wc-panel"><div class="wc-panel-body">
    ${rows.basic.map(s => settingRowHTML(s, value(s.key), off)).join("")}
    ${rows.advanced.length ? `<details class="rb-advanced"><summary>${esc(t("Tools.advanced"))}</summary>${rows.advanced.map(s => settingRowHTML(s, value(s.key), off)).join("")}</details>` : ""}
    ${n ? "" : hint(t("Tools.none"))}${extra}</div></div>${n ? saveBar() : ""}`;
}

/** The Discord tool's extra settings markup (0.5.0): the honor-system warning and Send test message. */
export const discordExtraHTML = () => `<div class="wc-alert wc-warn">${icon("warn")}<div class="wc-alert-title">${esc(t("Discord.honor"))}</div></div>`
  + `<div class="wc-row">${btn("discordTest", "fa-brands fa-discord", t("Discord.test"), { small: true })}</div>${hint(t("Discord.testHint"))}`;

/** Health: core's report sections ([{ title, lines }]). */
/** Health lines; a line with a fix action (0.7.0) gets a Fix button (`healthFix`, the GM confirms first). */
export function healthLinesHTML(lines = []) {
  if (!lines.some(l => l?.fix?.action)) return statusLines(lines);
  return `<ul class="wc-lines">${lines.map(l => statusLine(String(l?.level ?? "info"), l?.text, l?.fix?.action ? { html: btn("healthFix", "fa-solid fa-wrench", l.fix.label || t("Health.fix"), { small: true, data: { fix: l.fix.action } }) } : {})).join("")}</ul>`;
}
export function healthPageHTML(report = []) {
  const all = report.flatMap(s => s.lines ?? []);
  const worst = all.some(l => l.level === "bad") ? "bad" : all.some(l => l.level === "warn") ? "warn" : "ok";
  return `${pageHead(t("Nav.health"), badge(worst, worst === "ok" ? t("Health.ok") : t("Health.issues", { n: all.filter(l => l.level === "bad" || l.level === "warn").length }), { small: true }))}
    ${report.map(s => panel(s.title || t("Nav.health"), "", `<div class="wc-panel-body">${healthLinesHTML(s.lines)}</div>`)).join("")}
    <div class="wc-row">${btn("refresh", "fa-solid fa-rotate", t("Health.refresh"), { small: true })}</div>`;
}

/**
 * Data: debug logging (and any other data-tab rows), 0.7.0's "Show module data" switch (this browser) and Reset window positions,
 * and Remove Red Book data. `showData`: the switch's value; `windows`: how many window placements this browser remembers.
 * @param {{ rows?: { basic: any[], advanced: any[] }, value?: (key: string) => any, showData?: boolean, windows?: number }} [opts]
 */
export function dataPageHTML({ rows = { basic: [], advanced: [] }, value = () => undefined, showData = false, windows = 0 } = {}) {
  const all = [...rows.basic, ...rows.advanced];
  const show = `<div class="form-group"><label for="rb-set-showModuleData">${esc(t("Data.showData"))}</label><div class="form-fields"><input type="checkbox" id="rb-set-showModuleData" name="showModuleData"${showData ? " checked" : ""}></div><p class="hint">${esc(t("Data.showDataHint"))}</p></div>`;
  const win = `<div class="form-group"><label>${esc(t("Data.windows"))}</label><div class="form-fields">${btn("resetWindows", "fa-solid fa-window-restore", t("Data.windowsReset"), { small: true, disabled: !windows })}</div><p class="hint">${esc(t("Data.windowsHint", { n: windows }))}</p></div>`;
  return `${pageHead(t("Nav.data"))}<div class="wc-panel"><div class="wc-panel-body">${all.map(s => settingRowHTML(s, value(s.key))).join("")}${show}${win}</div></div>${saveBar()}
    <div class="wc-alert wc-warn">${icon("warn")}<div class="wc-alert-title">${esc(t("Data.removeTitle"))}</div><p>${esc(t("Data.removeHint"))}</p></div>
    <div class="wc-row">${btn("cleanup", "fa-solid fa-broom", t("Data.remove"), { danger: true })}</div>`;
}

// ---------------------------------------------------------------- Session Start window
/**
 * Session Start. `m`: { scenes: [{ id, name }], selected, query, logOn (session log on), logOpen (a session is open already),
 * online: { present, expected, all } | null, check: last scene-check result for the selected scene | null | { pending } , paused }.
 */
export function startHTML(m) {
  const q = String(m.query ?? "").trim().toLowerCase();
  const scenes = (m.scenes ?? []);
  const li = s => `<li${q && !String(s.name).toLowerCase().includes(q) ? " hidden" : ""} data-name="${esc(String(s.name).toLowerCase())}"><label class="rb-scene-opt${s.id === m.selected ? " active" : ""}"><input type="radio" name="scene" value="${esc(s.id)}"${s.id === m.selected ? " checked" : ""}> <span class="wc-grow rb-ellipsis">${esc(s.name)}</span>${s.active ? badge("live", t("Start.active"), { small: true }) : ""}</label></li>`;
  const ready = [];
  const opt = (name, label, checked = true, disabled = false, why = "") => `<li class="wc-status"><label class="rb-check"><input type="checkbox" name="${name}"${checked ? " checked" : ""}${disabled ? " disabled" : ""}> ${esc(label)}</label>${why ? ` <span class="wc-hint">${esc(why)}</span>` : ""}</li>`;
  ready.push(opt("activate", t("Start.activate")));
  ready.push(opt("unpause", t("Start.unpause"), true, false, m.paused === false ? t("Start.notPaused") : ""));
  if (m.logOn) ready.push(opt("log", t("Start.log"), !m.logOpen, !!m.logOpen, m.logOpen ? t("Start.logOpen") : ""));
  const info = [];
  if (m.online) info.push(statusLine(m.online.all ? "ok" : m.online.expected ? "warn" : "off", m.online.all ? t("Online.all") : m.online.expected ? t("Online.count", { present: m.online.present, expected: m.online.expected }) : t("Online.nobody")));
  if (m.checkOn) {
    const c = m.check;
    info.push(c?.pending ? statusLine("pending", t("Check.checking")) : c ? statusLine(c.tally.problem ? "bad" : c.tally.warning ? "warn" : "ok", t("Start.checked", { result: tallyText(c.tally) }), { html: `<button type="button" class="wc-btn wc-btn-sm wc-btn-ghost" data-action="startCheck">${esc(t("Check.again"))}</button>` })
      : statusLine("none", t("Start.unchecked"), { html: `<button type="button" class="wc-btn wc-btn-sm wc-btn-ghost" data-action="startCheck">${esc(t("Check.run"))}</button>` }));
  }
  return `<div class="rb-start">
    <div class="rb-search"><label class="wc-sr" for="rb-start-q">${esc(t("Start.search"))}</label><input type="search" id="rb-start-q" data-filter-start placeholder="${esc(t("Start.search"))}" value="${esc(m.query ?? "")}"></div>
    <ul class="wc-panel-list rb-start-list" role="radiogroup" aria-label="${esc(t("Start.scene"))}">${scenes.map(li).join("") || `<li class="wc-hint">${esc(t("Check.noScenes"))}</li>`}</ul>
    <p class="wc-section-label">${esc(t("Start.ready"))}</p><ul class="wc-lines">${ready.join("")}${info.join("")}</ul>
    <footer class="wc-row wc-end">${btn("", "fa-solid fa-flag-checkered", t("Start.go"), { primary: true, type: "submit", disabled: !m.selected })}</footer></div>`;
}

/** Every tone name core knows (re-exported for tests). */
export const TONE_NAMES = Object.keys(TONES);
