/**
 * The main window's markup (0.4.0, Option B), pure: no Foundry calls, tested in Node. app.mjs reads the world into plain models and
 * calls these; every page is a string of HTML built on wanderers-core's shared look (wc-* classes, styles/wanderers-ui.css) plus a
 * few scoped rb-* rules (styles/red-book.css). All text is escaped with `esc`; all new strings come from lang/en.json through `t`.
 *
 * Pages: Tools (session, board, check, online, past) and Settings (features, tools, health, data). The session dashboard is the
 * default page.
 */
import { esc, plural } from "./const.mjs";
import { navItem, statusLine, statusLines, badge, dot, icon, TONES } from "../vendor/wanderers-core/index.mjs";
import { TYPES, durationText } from "./session-model.mjs";
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
  quests: ["quest", "objective", "travel"],
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

/** Timeline rows (core's wc-timeline). */
export function timelineHTML(events = []) {
  if (!events.length) return `<p class="wc-hint rb-pad">${esc(t("Session.noEvents"))}</p>`;
  return `<ol class="wc-timeline rb-timeline">${events.map(e => {
    const tone = eventTone(e.type);
    const ic = TYPES[e.type]?.icon ?? "fa-circle";
    const aside = [e.thread ? badge("accent", t("Session.thread"), { small: true }) : "", e.private ? badge("off", t("Session.gmOnly"), { small: true }) : ""].join("");
    return `<li class="${e.type === "note" ? "wc-tl-note" : ""}" data-type="${esc(e.type)}"><span class="wc-tl-time"><span>${esc(e.rtText || "")}</span>${e.wtText ? `<span>${esc(e.wtText)}</span>` : ""}</span>`
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
    : s ? `<div class="wc-banner wc-live rb-live">${dot("live")}<span class="wc-banner-text"><strong>${esc(t("Session.live"))}</strong> · ${esc(s.name)}${s.startedAt ? ` · ${esc(t("Session.since", { time: durationText(Math.max(0, Math.round((m.now - s.startedAt) / 1000))) }))}` : ""}</span>${btn("note", "fa-solid fa-pen", t("Session.noteBox"), { small: true })}${btn("end", "fa-solid fa-book-bookmark", t("Session.end"), { small: true })}</div>`
      : `<div class="wc-banner wc-none">${icon("none")}<span class="wc-banner-text">${esc(t("Session.notLive"))}</span>${btn("startDialog", "fa-solid fa-flag-checkered", t("Session.startDialog"), { small: true, disabled: !m.startOn })}${btn("start", "fa-solid fa-book", t("Session.start"), { small: true, primary: true })}</div>`;
  const ev = shown?.events ?? [];
  const count = type => ev.filter(e => e.type === type).length;
  const played = shown?.startedAt ? durationText(Math.max(0, Math.round(((s ? m.now : shown.endedAt || m.now) - shown.startedAt) / 1000))) : "–";
  const threads = ev.filter(e => e.type === "note" && e.thread).length;
  const tiles = m.on && shown ? `<p class="wc-section-label">${esc(s ? t("Session.thisSession") : t("Session.lastSession", { name: shown.name }))}</p><div class="wc-stats rb-stats">
      ${stat(t("Session.statEvents"), String(ev.length))}
      ${stat(t("Session.statPlayed"), played)}
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
  const timeline = m.on && shown ? panel(t("Session.timeline"), "fa-solid fa-timeline", `${chips}${timelineHTML(rows)}${more}`, { cls: "rb-tl-panel", head: shown.uuid ? iconBtn("openUuid", "fa-solid fa-up-right-from-square", t("Session.openJournal"), { uuid: shown.uuid }) : "" }) : "";
  const table = panel(t("Roster.title"), "fa-solid fa-users", rosterHTML(m.roster ?? [], { dnd5e: !!m.dnd5e }), { cls: "rb-roster-panel", head: m.online ? badge(m.online.expected && m.online.present === m.online.expected ? "ok" : "info", `${m.online.present}/${m.online.expected}`, { small: true }) : "" });
  return `${pageHead(t("Nav.session"))}${banner}${tiles}${note}<div class="wc-cols rb-session-cols"><div class="rb-col-main">${timeline || (m.on ? hint(t("Session.none")) : "")}</div><div class="rb-col-side">${table}</div></div>`;
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
  const quests = !m.toolkit ? `<p class="wc-hint rb-pad">${esc(t("Board.noToolkit"))}</p>`
    : list(m.quests.map(q => row(q.uuid, q.name, `${q.zone ? ` <span class="wc-chip">${esc(q.zone)}</span>` : ""}${q.next.length ? `<ul class="rb-next">${q.next.map(x => `<li>${esc(x)}</li>`).join("")}${q.more ? `<li class="wc-hint">${esc(t("Board.andMore", { n: q.more }))}</li>` : ""}</ul>` : ""}`)), t("Board.noQuests"));
  const last = m.last ? `<div class="wc-panel-body"><p>${`<a class="rb-open" data-action="openUuid" data-uuid="${esc(m.last.uuid)}">${esc(m.last.name)}</a>`}${m.last.open ? ` ${badge("live", t("Session.live"), { small: true, dot: true })}` : ""}</p>
      ${(m.last.summary?.notable ?? []).length ? `<ul class="rb-next">${m.last.summary.notable.slice(0, 8).map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      <p class="wc-section-label">${esc(t("Board.threads"))}</p>${m.last.threads.length ? `<ul class="rb-next">${m.last.threads.map(x => `<li>${esc(x.text)}${x.private ? ` ${badge("off", t("Session.gmOnly"), { small: true })}` : ""}</li>`).join("")}</ul>` : hint(t("Board.noThreads"))}</div>`
    : `<p class="wc-hint rb-pad">${esc(opts.sessionOn ? t("Board.noSession") : t("Session.logOff"))}</p>`;
  const linked = (items, none) => list(items.map(e => row(e.uuid, "", ` <span class="wc-hint">${esc(e.from.join(", "))}</span>`)), none);
  const scenes = m.links.scenes;
  const pins = `<div class="rb-drop" data-drop>${m.pins.length ? `<ul class="wc-panel-list">${m.pins.map(p => row(p.uuid, p.name || "", "").replace(/<\/li>$/, `${iconBtn("unpin", "fa-solid fa-xmark", t("Board.unpin"), { uuid: p.uuid })}</li>`)).join("")}</ul>` : ""}<p class="wc-hint rb-pad">${esc(t("Board.dropHint", { n: opts.pinsMax ?? 50 }))}</p></div>`;
  return `${pageHead(t("Nav.board"))}<div class="rb-board3">
    <div class="rb-board-col">${panel(t("Board.quests"), "fa-solid fa-scroll", quests)}${panel(t("Board.last"), "fa-solid fa-book", last)}</div>
    <div class="rb-board-col">${panel(t("Board.npcs"), "fa-solid fa-user-group", linked(m.links.actors, t("Board.noNpcs")))}${panel(t("Board.journals"), "fa-solid fa-book-open", linked([...m.links.journals, ...m.links.other], t("Board.noJournals")))}${panel(t("Board.scenes"), "fa-solid fa-map", linked(scenes, t("Board.noScenes")), { head: scenes.length && opts.checkOn ? btn("checkAll", "fa-solid fa-clipboard-check", t("Board.checkAll"), { small: true }) : "" })}</div>
    <div class="rb-board-col">${panel(t("Board.pinned"), "fa-solid fa-thumbtack", pins, { head: badge("info", `${m.pins.length}/${opts.pinsMax ?? 50}`, { small: true }) })}</div>
  </div>`;
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
 * `m`: { scenes: [{ id, name }], results: { [sceneId]: result | { pending: true } } (the GM client's memory of this load), selected,
 * query }. A result is check.mjs checkOne()'s { scene, findings, ignored, stored, tally }.
 */
export function checkPageHTML(m) {
  const q = String(m.query ?? "").trim().toLowerCase();
  const scenes = m.scenes ?? [];
  const results = m.results ?? {};
  const item = s => {
    const r = results[s.id]; const tone = resultTone(r);
    const word = r?.pending ? t("Check.checking") : r ? tallyText(r.tally) : t("Check.notChecked");
    const name = String(s.name).toLowerCase();
    return `<li class="${s.id === m.selected ? "active" : ""}" data-name="${esc(name)}"${q && !name.includes(q) ? " hidden" : ""}><button type="button" class="rb-scene-btn" data-action="pickScene" data-scene="${esc(s.id)}"${s.id === m.selected ? ` aria-current="true"` : ""}>${dot(tone, { label: word })}<span class="wc-grow rb-ellipsis">${esc(s.name)}</span><span class="wc-hint rb-ellipsis">${esc(word)}</span></button></li>`;
  };
  const list = `<div class="rb-master"><div class="rb-search"><label class="wc-sr" for="rb-scene-q">${esc(t("Check.search"))}</label><input type="search" id="rb-scene-q" data-filter-scenes placeholder="${esc(t("Check.search"))}" value="${esc(m.query ?? "")}"></div>
    <ul class="wc-panel-list rb-scene-list">${scenes.map(item).join("") || `<li class="wc-hint">${esc(t("Check.noScenes"))}</li>`}</ul>
    <div class="wc-row rb-pad">${btn("checkAllScenes", "fa-solid fa-list-check", t("Check.all", { n: (m.scenes ?? []).length }), { small: true })}</div></div>`;
  const sel = (m.scenes ?? []).find(s => s.id === m.selected);
  const r = sel ? results[sel.id] : null;
  let detail;
  if (!sel) detail = `<div class="wc-alert wc-info">${icon("info")}<div class="wc-alert-title">${esc(t("Check.pick"))}</div><p>${esc(t("Check.readOnly"))}</p></div>`;
  else {
    const head = `<div class="wc-row rb-detail-head"><h3 class="wc-grow rb-ellipsis">${esc(sel.name)}</h3>${btn("checkScene", "fa-solid fa-clipboard-check", r && !r.pending ? t("Check.again") : t("Check.run"), { small: true, primary: true, data: { scene: sel.id }, disabled: !!r?.pending })}${r && !r.pending ? btn("exportCheck", "fa-solid fa-file-export", t("Check.export"), { small: true, data: { scene: sel.id } }) : ""}</div>`;
    if (!r) detail = `${head}${hint(t("Check.readOnly"))}`;
    else if (r.pending) detail = `${head}<p class="wc-status wc-pending">${icon("pending")}<span>${esc(t("Check.checking"))}</span></p>`;
    else detail = `${head}${checkResultHTML(r)}`;
  }
  return `${pageHead(t("Nav.check"), `<span class="wc-hint">${esc(t("Check.memory"))}</span>`)}<div class="rb-md">${list}<div class="rb-detail">${detail}</div></div>`;
}

/** One scene's findings, grouped by rule category, then the ignored ones and Clear ignored. */
export function checkResultHTML(r) {
  const sid = r.scene?.id ?? "";
  const row = (f, i, ignored) => statusLine(sevTone(f.severity), f.text, { html: `<span class="rb-find-acts">${f.fix ? iconBtn("fix", "fa-solid fa-wrench", t("Check.fix"), { scene: sid, i, ignored: ignored ? 1 : 0 }) : ""}${f.key ? (ignored
    ? iconBtn("unignore", "fa-solid fa-eye", f.ignore?.name ? t("Check.unignoreBy", { name: f.ignore.name }) : t("Check.unignore"), { scene: sid, key: f.key })
    : iconBtn("ignore", "fa-solid fa-eye-slash", t("Check.ignore"), { scene: sid, key: f.key })) : ""}</span>` });
  const total = `<p class="wc-status ${r.tally.problem ? "wc-bad" : r.tally.warning ? "wc-warn" : "wc-ok"}">${icon(r.tally.problem ? "bad" : r.tally.warning ? "warn" : "ok")}<span>${esc(tallyText(r.tally))}${r.ignored?.length ? ` · ${esc(t("Check.ignoredN", { n: r.ignored.length }))}` : ""}</span></p>`;
  const index = new Map((r.findings ?? []).map((f, i) => [f, i]));
  const groups = groupFindings(r.findings ?? []).map(g => panel(t(`Check.cat.${g.id}`), g.icon, `<ul class="wc-lines rb-pad">${g.findings.map(f => row(f, index.get(f), false)).join("")}</ul>`, { head: badge(g.findings.some(f => f.severity === "problem") ? "bad" : g.findings.some(f => f.severity === "warning") ? "warn" : "info", String(g.findings.length), { small: true }) })).join("");
  const ign = r.ignored?.length ? `<details class="rb-ignored"><summary>${esc(t("Check.ignoredList", { n: r.ignored.length }))}</summary><ul class="wc-lines rb-pad">${r.ignored.map((f, i) => row(f, i, true)).join("")}</ul></details>` : "";
  const clear = r.stored ? `<div class="wc-row">${btn("clearIgnored", "fa-solid fa-eraser", t("Check.clearIgnored", { n: r.stored }), { small: true, data: { scene: sid } })}</div>` : "";
  return `${total}${groups || `<p class="wc-status wc-ok">${icon("ok")}<span>${esc(t("Check.nothing"))}</span></p>`}${ign}${clear}`;
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
/** `list`: [{ id, uuid, name, n, open, events, startedAt, endedAt }] newest first is done here. */
export function pastPageHTML(list = []) {
  const rows = [...list].sort((a, b) => (Number(b.n) || 0) - (Number(a.n) || 0));
  const body = rows.length ? `<div class="wc-table-box"><table class="wc-table"><thead><tr><th>${esc(t("Past.session"))}</th><th>${esc(t("Past.events"))}</th><th>${esc(t("Past.played"))}</th><th><span class="wc-sr">${esc(t("Past.actions"))}</span></th></tr></thead><tbody>${rows.map(s => `<tr>
      <td><a class="rb-open" data-action="openUuid" data-uuid="${esc(s.uuid)}">${esc(s.name)}</a>${s.open ? ` ${badge("live", t("Session.live"), { small: true, dot: true })}` : ""}</td>
      <td>${Number(s.events) || 0}</td><td>${s.startedAt && s.endedAt ? esc(durationText(Math.round((s.endedAt - s.startedAt) / 1000))) : "–"}</td>
      <td class="rb-right">${iconBtn("openUuid", "fa-solid fa-book-open", t("Past.open"), { uuid: s.uuid })}${iconBtn("recap", "fa-solid fa-share-from-square", t("Past.recap"), { id: s.id })}</td></tr>`).join("")}</tbody></table></div>`
    : `<div class="wc-alert wc-info">${icon("info")}<div class="wc-alert-title">${esc(t("Past.none"))}</div><p>${esc(t("Past.noneHint"))}</p></div>`;
  return `${pageHead(t("Nav.past"), `<span class="wc-hint">${esc(plural(rows.length, "session"))}</span>`)}${body}`;
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

/** Health: core's report sections ([{ title, lines }]). */
export function healthPageHTML(report = []) {
  const all = report.flatMap(s => s.lines ?? []);
  const worst = all.some(l => l.level === "bad") ? "bad" : all.some(l => l.level === "warn") ? "warn" : "ok";
  return `${pageHead(t("Nav.health"), badge(worst, worst === "ok" ? t("Health.ok") : t("Health.issues", { n: all.filter(l => l.level === "bad" || l.level === "warn").length }), { small: true }))}
    ${report.map(s => panel(s.title || t("Nav.health"), "", `<div class="wc-panel-body">${statusLines(s.lines)}</div>`)).join("")}
    <div class="wc-row">${btn("refresh", "fa-solid fa-rotate", t("Health.refresh"), { small: true })}</div>`;
}

/** Data: debug logging (and any other data-tab rows) and Remove Red Book data. */
/** @param {{ rows?: { basic: any[], advanced: any[] }, value?: (key: string) => any }} [opts] */
export function dataPageHTML({ rows = { basic: [], advanced: [] }, value = () => undefined } = {}) {
  const all = [...rows.basic, ...rows.advanced];
  return `${pageHead(t("Nav.data"))}<div class="wc-panel"><div class="wc-panel-body">${all.map(s => settingRowHTML(s, value(s.key))).join("")}</div></div>${all.length ? saveBar() : ""}
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
