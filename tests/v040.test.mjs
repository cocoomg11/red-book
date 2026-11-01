import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { flatten, t } from "../scripts/i18n.mjs";
import * as V from "../scripts/view.mjs";
import * as C from "../scripts/check-model.mjs";
import * as O from "../scripts/online-model.mjs";
import * as K from "../scripts/cleanup-model.mjs";
import { SETTINGS, RECORDS } from "../scripts/settings-model.mjs";
import { UI_CLASSES } from "../vendor/wanderers-core/index.mjs";

const LANG = flatten(JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8")));
const used = new Set();
before(() => {
  globalThis.game = { i18n: {
    localize: k => { used.add(k); return LANG[k] ?? `MISSING:${k}`; },
    format: (k, d) => { used.add(k); return (LANG[k] ?? `MISSING:${k}`).replace(/\{(\w+)\}/g, (_, n) => d[n] ?? ""); }
  } };
});
const noMissing = html => assert.ok(!html.includes("MISSING:"), html.match(/MISSING:[\w.]+/)?.[0]);

const ev = (type, i, extra = {}) => ({ id: `e${i}`, type, t: 1000 + i, wt: 0, rtText: "20:00", wtText: "", text: `${type} ${i}`, refs: [], data: {}, private: false, thread: false, ...extra });

// ---------------------------------------------------------------- i18n
test("i18n: t() falls back to the key without Foundry; lang file is nested and complete for the views", () => {
  const saved = globalThis.game; delete globalThis.game;
  assert.equal(t("Nav.session"), "Nav.session");
  globalThis.game = saved;
  assert.equal(t("Online.count", { present: 2, expected: 4 }), "2 of 4 here");
  assert.ok(Object.keys(LANG).every(k => k.startsWith("REDBOOK.")));
  for (const p of V.PAGES) assert.ok(LANG[`REDBOOK.Nav.${p}`], p);
  for (const f of Object.keys(V.FILTERS)) assert.ok(LANG[`REDBOOK.Filter.${f}`], f);
  for (const c of C.CHECK_CATEGORIES) assert.ok(LANG[`REDBOOK.Check.cat.${c.id}`], c.id);
});

// ---------------------------------------------------------------- navigation and keyboard
test("nav: two groups, session first and default; old tab names map to pages", () => {
  assert.deepEqual(V.NAV.map(g => g.group), ["Tools", "Settings"]);
  assert.deepEqual(V.NAV[0].pages.map(p => p.id), ["session", "board", "check", "online", "past"]);
  assert.deepEqual(V.NAV[1].pages.map(p => p.id), ["features", "tools", "health", "data"]);
  assert.equal(V.DEFAULT_PAGE, "session");
  assert.deepEqual(V.pageFor("overview"), { page: "session", tool: null });
  assert.deepEqual(V.pageFor("start"), { page: "tools", tool: "start" });
  assert.deepEqual(V.pageFor("board"), { page: "board", tool: null });
  assert.deepEqual(V.pageFor("nope"), { page: "session", tool: null });
  assert.deepEqual(V.pageFor(undefined), { page: "session", tool: null });
});
test("nav: roving focus keys wrap; other keys do nothing", () => {
  assert.equal(V.nextNavIndex(0, "ArrowDown", 9), 1);
  assert.equal(V.nextNavIndex(8, "ArrowDown", 9), 0);
  assert.equal(V.nextNavIndex(0, "ArrowUp", 9), 8);
  assert.equal(V.nextNavIndex(4, "Home", 9), 0);
  assert.equal(V.nextNavIndex(4, "End", 9), 8);
  assert.equal(V.nextNavIndex(4, "Enter", 9), -1);
  assert.equal(V.nextNavIndex(0, "ArrowDown", 0), -1);
});
test("nav: one tab stop (active page), muted + Off for turned-off tools, aria-current on the active page", () => {
  const html = V.navHTML("board", f => f !== "sceneCheck");
  noMissing(html);
  assert.equal((html.match(/tabindex="0"/g) ?? []).length, 1);
  assert.match(html, /data-page="board"[^>]*aria-current="page"[^>]*tabindex="0"/);
  assert.match(html, /class="wc-nav wc-muted" data-action="nav" data-page="check"[^>]*aria-label="Scene check, Off"/);
  assert.equal((html.match(/class="wc-side-head"/g) ?? []).length, 2);
  const shell = V.shellHTML(html, "<p>x</p>");
  assert.match(shell, /^<div class="wc-shell rb-shell"><nav class="wc-side rb-side"/);
  assert.match(shell, /<section class="wc-main rb-main" tabindex="-1"><p>x<\/p><\/section><\/div>$/);
});

// ---------------------------------------------------------------- timeline filter
test("filter: chips by type, newest first, capped at 100; unknown filter = all", () => {
  const events = [];
  for (let i = 0; i < 150; i++) events.push(ev(i % 3 === 0 ? "note" : i % 3 === 1 ? "combatStart" : "loot", i));
  const all = V.filterEvents(events, "all");
  assert.equal(all.length, V.TIMELINE_MAX);
  assert.equal(all[0].id, "e149", "newest first");
  assert.equal(V.filterEvents(events, "notes").every(e => e.type === "note"), true);
  assert.equal(V.filterEvents(events, "notes").length, 50);
  assert.equal(V.filterEvents(events, "combat").length, 50);
  assert.equal(V.filterEvents(events, "bogus").length, 100);
  assert.equal(V.filterEvents(null).length, 0);
  const c = V.filterCounts(events);
  assert.equal(c.all, 150); assert.equal(c.notes, 50); assert.equal(c.loot, 50); assert.equal(c.scene, 0);
  // Every logged type falls under some chip other than "all".
  const covered = new Set(Object.values(V.FILTERS).filter(Boolean).flat());
  for (const type of ["session", "scene", "combatStart", "combatEnd", "down", "death", "rest", "loot", "time", "journal", "npc", "level", "quest", "objective", "travel", "lootRoll", "note"]) assert.ok(covered.has(type), type);
});
test("timeline: escaped text, type for screen readers, thread and GM-only badges, note row class", () => {
  const html = V.timelineHTML([ev("note", 1, { text: "<b>hi</b>", thread: true, private: true }), ev("down", 2)]);
  noMissing(html);
  assert.ok(html.includes("&lt;b&gt;hi&lt;/b&gt;") && !html.includes("<b>hi"));
  assert.match(html, /class="wc-tl-note" data-type="note"/);
  assert.match(html, /wc-sr">Notes:/);
  assert.match(html, /Thread<\/span>/); assert.match(html, /GM only<\/span>/);
  assert.match(html, /wc-tl-icon wc-bad/);
  assert.match(V.timelineHTML([]), /Nothing of this kind/);
});

// ---------------------------------------------------------------- roster live HP (dnd5e only)
test("hp: reads dnd5e hp (effectiveMax first, else max + tempmax), clamps, tones; null when unreadable", () => {
  assert.deepEqual(V.hpOf({ value: 20, max: 40, temp: 5, tempmax: 0 }), { value: 20, max: 40, temp: 5, pct: 50, tone: "warn" });
  assert.equal(V.hpOf({ value: 30, max: 40, tempmax: 10 }).max, 50);
  assert.equal(V.hpOf({ value: 30, max: 40, tempmax: 10, effectiveMax: 45 }).max, 45);
  assert.equal(V.hpOf({ value: 60, max: 40 }).pct, 100);
  assert.equal(V.hpOf({ value: 0, max: 40 }).tone, "bad");
  assert.equal(V.hpOf({ value: 10, max: 40 }).tone, "bad");
  assert.equal(V.hpOf({ value: 39, max: 40 }).tone, "ok");
  assert.equal(V.hpOf({ value: null, max: 40 }), null, "dnd5e value may be null");
  assert.equal(V.hpOf({ value: 5, max: null }), null);
  assert.equal(V.hpOf({ value: 5, max: 0 }), null);
  assert.equal(V.hpOf(undefined), null);
});
test("roster: connected players only (no GMs), sorted; HP only when dnd5e", () => {
  const users = [
    { id: "g", name: "GM", active: true, isGM: true, character: null },
    { id: "b", name: "Bea", active: true, isGM: false, character: { name: "Zed", img: "z.webp", hp: { value: 5, max: 10 } } },
    { id: "a", name: "Al", active: true, isGM: false, character: null },
    { id: "c", name: "Cy", active: false, isGM: false, character: { name: "Off", img: "", hp: { value: 1, max: 1 } } }
  ];
  const d = V.rosterModel(users, { dnd5e: true });
  assert.deepEqual(d.map(r => r.id), ["a", "b"]);
  assert.equal(d[1].hp.pct, 50); assert.equal(d[0].hp, null);
  const other = V.rosterModel(users, { dnd5e: false });
  assert.ok(other.every(r => r.hp === null), "no HP on other systems");
  const html = V.rosterHTML(d, { dnd5e: true }); noMissing(html);
  assert.match(html, /role="meter" aria-valuemin="0" aria-valuemax="10" aria-valuenow="5"/);
  assert.match(html, /No character/);
  const plain = V.rosterHTML(other, { dnd5e: false });
  assert.ok(!plain.includes("rb-hp") && !plain.includes("No character"), "HP hidden entirely off dnd5e");
  assert.match(V.rosterHTML([]), /No players connected/);
});
test("roster: actor updates refresh only for HP, name or image", () => {
  assert.equal(V.rosterTouched({ system: { attributes: { hp: { value: 3 } } } }), true);
  assert.equal(V.rosterTouched({ name: "x" }), true);
  assert.equal(V.rosterTouched({ img: "x" }), true);
  assert.equal(V.rosterTouched({ system: { currency: { gp: 1 } } }), false);
  assert.equal(V.rosterTouched({ system: { attributes: { ac: {} } } }), false);
  assert.equal(V.rosterTouched(null), false);
});

// ---------------------------------------------------------------- session dashboard
test("session page: live banner, tiles, quick note, chips with aria-pressed, roster", () => {
  const session = { name: "Session 3", startedAt: 1, endedAt: 0, events: [ev("note", 1, { thread: true }), ev("combatStart", 2), ev("down", 3)], uuid: "JournalEntry.abc" };
  const html = V.sessionPageHTML({ on: true, session, last: null, now: 3_600_001, filter: "combat", roster: [], dnd5e: false, online: { present: 2, expected: 3 }, startOn: true });
  noMissing(html);
  assert.match(html, /wc-banner wc-live/); assert.match(html, /Session running/); assert.match(html, /1 hour/);
  assert.match(html, /name="noteText"/);
  assert.match(html, /data-filter="combat" aria-pressed="true"/);
  assert.match(html, /data-filter="all" aria-pressed="false"/);
  assert.match(html, /wc-stats/); assert.match(html, /2\/3/);
  assert.match(html, /At the table/);
  assert.ok(!html.includes("note 1"), "filtered to combat");
  const idle = V.sessionPageHTML({ on: true, session: null, last: null, now: 0, filter: "all", roster: [], online: null, startOn: false });
  assert.match(idle, /No session is running/); assert.ok(!idle.includes("noteText"));
  assert.match(idle, /data-action="startDialog" disabled/);
  assert.match(V.sessionPageHTML({ on: false, now: 0, filter: "all" }), /session log is turned off/);
});

// ---------------------------------------------------------------- board
test("board page: three columns, missing rows, unpin buttons, scene actions only with scene check", () => {
  const m = { toolkit: true, quests: [{ uuid: "JournalEntry.q", name: "Q1", zone: "North", next: ["Do it"], more: 2 }], links: { actors: [], journals: [], other: [], scenes: [{ uuid: "Scene.s", from: ["Q1"] }] }, last: null, pins: [{ uuid: "Actor.gone", name: "Old" }] };
  const look = u => ({ name: u, exists: u !== "Actor.gone", scene: u.startsWith("Scene.") });
  const html = V.boardPageHTML(m, look, { checkOn: true, sessionOn: true, pinsMax: 50 });
  noMissing(html);
  assert.equal((html.match(/class="rb-board-col"/g) ?? []).length, 3);
  assert.match(html, /data-action="unpin" data-uuid="Actor.gone"/);
  assert.match(html, /missing/); assert.match(html, /and 2 more/);
  assert.match(html, /data-action="checkScene" data-uuid="Scene.s"/);
  assert.match(html, /data-action="checkAll"/);
  const off = V.boardPageHTML(m, look, { checkOn: false });
  assert.ok(!off.includes("checkScene") && !off.includes("checkAll"));
});

// ---------------------------------------------------------------- scene check (display-only categories, memory)
test("check categories: every rule mapped; grouping is display only (findings and keys untouched)", () => {
  for (const r of Object.keys(C.RULES)) assert.ok(C.RULE_CATEGORY[r], r);
  const f = [
    { rule: "notes", severity: "note", text: "a", key: "notes:1" }, { rule: "walls", severity: "warning", text: "b", key: "walls" },
    { rule: "background", severity: "problem", text: "c", key: "background.broken" }, { rule: "mystery", severity: "note", text: "d", key: "m" }
  ];
  const before = JSON.stringify(f);
  const g = C.groupFindings(f);
  assert.deepEqual(g.map(x => x.id), ["map", "links", "other"]);
  assert.deepEqual(g[0].findings.map(x => x.key), ["background.broken", "walls"], "problems first");
  assert.equal(JSON.stringify(f), before);
  assert.equal(g[0].findings[0], f[2], "same objects");
});
test("check memory: per scene, latest wins, capped, pending marker; never touches settings", () => {
  const m = new C.ResultMemory(3);
  m.pending("a"); assert.deepEqual(m.get("a"), { pending: true });
  m.set("a", { tally: { problem: 1 } }); m.set("b", {}); m.set("c", {}); m.set("d", {});
  assert.equal(m.size, 3); assert.equal(m.get("a"), null, "oldest dropped");
  m.set("b", { x: 1 }); m.set("e", {}); assert.ok(m.get("b"), "re-set moves to newest"); assert.equal(m.get("c"), null);
  assert.deepEqual(Object.keys(m.all()).sort(), ["b", "d", "e"]);
  m.clear(); assert.equal(m.size, 0);
  assert.ok(!SETTINGS.some(s => /check.*result|results/i.test(s.key)), "no world setting holds results");
});
test("check page: master list with status dots, search, detail with grouped findings and ignore buttons", () => {
  const r = C.applyIgnored({ scene: { id: "s1", uuid: "Scene.s1", name: "Cave" }, all: [
    { rule: "walls", severity: "warning", text: "No walls", fix: { kind: "scene", id: "s1" }, key: "walls" },
    { rule: "notes", severity: "note", text: "Note <x>", fix: null, key: "notes:n1" }
  ] }, { v: 1, entries: [{ key: "notes:n1", at: 1, by: "u", name: "Ann" }] });
  const html = V.checkPageHTML({ scenes: [{ id: "s1", name: "Cave" }, { id: "s2", name: "Hall" }], results: { s1: r, s2: { pending: true } }, selected: "s1", query: "" });
  noMissing(html);
  assert.match(html, /class="active" data-name="cave"><button type="button" class="rb-scene-btn" data-action="pickScene" data-scene="s1" title="Cave" aria-current="true">/);
  assert.match(html, /wc-dot wc-warn/); assert.match(html, /wc-dot wc-pending/);
  assert.match(html, /Map, walls and light/);
  assert.match(html, /data-action="ignore" data-scene="s1" data-key="walls"/);
  assert.match(html, /data-action="unignore"[^>]*data-tooltip="Un-ignore \(ignored by Ann\)"/);
  assert.match(html, /Note &lt;x&gt;/);
  assert.match(html, /data-action="fix" data-scene="s1" data-i="0" data-ignored="0"/);
  assert.match(html, /Clear ignored \(1 saved\)/);
  const filtered = V.checkPageHTML({ scenes: [{ id: "s1", name: "Cave" }, { id: "s2", name: "Hall" }], results: {}, selected: null, query: "hal" });
  assert.match(filtered, /<li class="" data-name="cave" hidden>/); assert.match(filtered, /<li class="" data-name="hall"><button/);
  assert.match(filtered, /Pick a scene/);
  assert.equal(V.resultTone(null), "none"); assert.equal(V.resultTone({ tally: { problem: 0, warning: 0 } }), "ok");
});

// ---------------------------------------------------------------- who's online: header, pill, collapse
test("online HUD: themed header is the drag handle (not h3), count pill, keyboard toggle with aria-expanded", () => {
  const r = O.roster([{ id: "a", name: "A", active: true, isGM: false, character: { name: "Ay", img: "" } }, { id: "b", name: "B", active: false, isGM: false, character: { name: "Bee", img: "" } }], { count: "characters" });
  const open = V.hudHTML(r, { collapsed: false });
  noMissing(open);
  assert.ok(!open.includes("<h3"), "no h3 handle any more");
  assert.match(open, /^<header class="rb-online-head rb-drag"/);
  assert.match(open, /rb-online-pill[^>]*>1\/2</);
  assert.match(open, /<button type="button" class="rb-online-toggle" aria-expanded="true" aria-controls="rb-online-body" aria-label="Fold the panel"/);
  assert.match(open, /id="rb-online-body" class="rb-online-body">/);
  const shut = V.hudHTML(r, { collapsed: true });
  assert.match(shut, /aria-expanded="false"/); assert.match(shut, /class="rb-online-body" hidden>/);
  assert.match(V.hudHTML(r, { drag: false }), /^<header class="rb-online-head">/);
  assert.equal(V.countPill({ expected: 0 }), "–");
  assert.deepEqual(V.onlineStatus({ all: true }).tone, "ok");
});
test("online collapsed setting: client scope, boolean, default false, hidden (not in config), a record; reset covers client scope", () => {
  const s = SETTINGS.find(x => x.key === "onlineHudCollapsed");
  assert.equal(s.type, "bool"); assert.equal(s.default, false); assert.equal(s.client, true); assert.equal(s.hidden, true);
  assert.ok(RECORDS.includes("onlineHudCollapsed"));
  assert.deepEqual(K.SETTING_SCOPES, ["world", "client"]);
  const p = K.plan({ settings: [{ key: "onlineHudCollapsed", changed: true }] });
  assert.deepEqual(p.settings.map(x => x.key), ["onlineHudCollapsed"]);
});

// ---------------------------------------------------------------- Session Start, past sessions, settings pages
test("start window: searchable radio list, Ready? checklist; log box off when a session is open", () => {
  const html = V.startHTML({ scenes: [{ id: "a", name: "Alpha", active: true }, { id: "b", name: "Beta" }], selected: "b", query: "be", logOn: true, logOpen: true, online: { present: 1, expected: 2, all: false }, checkOn: true, check: null, paused: true });
  noMissing(html);
  assert.match(html, /<li hidden data-name="alpha">/);
  assert.match(html, /value="b" checked/);
  assert.match(html, /name="log" disabled/); assert.match(html, /already open/);
  assert.match(html, /1 of 2 here/); assert.match(html, /data-action="startCheck"/);
  assert.match(html, /Ready\?/);
  assert.match(V.startHTML({ scenes: [], selected: null }), /type="submit"[^>]*disabled/);
});
test("past, features, tools, health and data pages render without missing strings", () => {
  noMissing(V.pastPageHTML([{ id: "1", uuid: "JournalEntry.1", name: "S1", n: 1, events: 4, startedAt: 0, endedAt: 60000 }, { id: "2", uuid: "JournalEntry.2", name: "S2", n: 2, open: true, events: 1 }]));
  assert.match(V.pastPageHTML([{ n: 1, name: "a" }, { n: 2, name: "b" }]), /b<\/a>[\s\S]*a<\/a>/);
  assert.match(V.pastPageHTML([]), /No sessions yet/);
  const f = V.featuresPageHTML([{ id: "x", key: "feature-x", label: "X", hint: "h" }], () => false);
  noMissing(f); assert.match(f, /name="feature-x">/);
  const tl = V.toolSettingsHTML({ tool: "online", tabs: [{ id: "online", label: "O", icon: "i" }], rows: { basic: [{ key: "k", type: "bool", label: "L" }], advanced: [] }, value: () => true, off: true });
  noMissing(tl); assert.match(tl, /name="k" checked disabled/); assert.match(tl, /turned off/);
  const h = V.healthPageHTML([{ title: "T", lines: [{ level: "warn", text: "w" }] }]); noMissing(h); assert.match(h, /1 to look at/);
  noMissing(V.dataPageHTML({ rows: { basic: [], advanced: [{ key: "debugLog", type: "bool", label: "D" }] }, value: () => false }));
});

// ---------------------------------------------------------------- styles
test("styles: core's stylesheet loads first; Red Book CSS is scoped, has no override and no revision class", () => {
  const mod = JSON.parse(readFileSync(new URL("../module.json", import.meta.url), "utf8"));
  assert.equal(mod.styles[0], "vendor/wanderers-core/styles/wanderers-ui.css");
  assert.equal(UI_CLASSES[0], "wc-ui"); assert.match(UI_CLASSES[1], /^wc-r\d+$/);
  const css = readFileSync(new URL("../styles/red-book.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!css.includes("flex-shrink: 0"), "core 0.3.1 fixed it: no local override");
  assert.ok(!/(^|\})\s*(:root|html|body|button|input|h\d)\s*[{,]/m.test(css), "no bare element rules");
  for (const sel of css.split("}").map(b => b.split("{")[0].trim()).filter(Boolean)) {
    if (sel.startsWith("@")) continue;
    for (const s of sel.split(",")) assert.match(s.trim(), /\.rb-|^body\.theme-light \.rb-|^from|^to|^\d/, `unscoped: ${s.trim()}`);
  }
});

test("no file hard-codes the shared stylesheet's revision class (use UI_CLASSES)", async () => {
  const { readdirSync } = await import("node:fs");
  for (const dir of ["scripts", "styles"]) for (const f of readdirSync(new URL(`../${dir}/`, import.meta.url))) {
    const text = readFileSync(new URL(`../${dir}/${f}`, import.meta.url), "utf8");
    assert.ok(!/wc-r\d/.test(text), `${dir}/${f} names a wc-r<N> class`);
  }
});
