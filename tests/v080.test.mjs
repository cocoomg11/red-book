import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { flatten } from "../scripts/i18n.mjs";
import * as V from "../scripts/view.mjs";
import * as M from "../scripts/session-model.mjs";
import * as C from "../scripts/check-model.mjs";
import * as K from "../scripts/cleanup-model.mjs";
import * as Set_ from "../scripts/settings-model.mjs";
import { KEYS, FEATURE_LIST } from "../scripts/features.mjs";
import { registration } from "../scripts/satchel-model.mjs";
import { defineOpenKeybinding } from "../vendor/wanderers-core/index.mjs";

const LANG = flatten(JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8")));
const read = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
before(() => {
  globalThis.game = { i18n: {
    localize: k => LANG[k] ?? `MISSING:${k}`,
    format: (k, d) => (LANG[k] ?? `MISSING:${k}`).replace(/\{(\w+)\}/g, (_, n) => d[n] ?? "")
  } };
});
const noMissing = html => assert.ok(!html.includes("MISSING:"), html.match(/MISSING:[\w.]+/)?.[0]);

// ---------------------------------------------------------------- 1. start prompt
test("startAsk: a client choice (ask / quiet / never), default quiet; old world switch kept as a hidden record", () => {
  const s = Set_.SETTINGS.find(r => r.key === "startAsk");
  assert.equal(s.type, "choice"); assert.equal(s.default, "quiet"); assert.equal(s.client, true); assert.ok(!s.hidden);
  assert.deepEqual(Object.keys(s.choices), ["ask", "quiet", "never"]);
  const old = Set_.SETTINGS.find(r => r.key === "startPrompt");
  assert.equal(old.hidden, true); assert.ok(!old.client);
  assert.ok(Set_.tabRows("session").basic.some(r => r.key === "startAsk"));
  assert.ok(!Set_.tabRows("session").basic.some(r => r.key === "startPrompt"), "old switch no longer shown");
  assert.equal(Set_.startMode("ask"), "ask"); assert.equal(Set_.startMode("never"), "never");
  assert.equal(Set_.startMode("x"), "quiet"); assert.equal(Set_.startMode(undefined), "quiet");
});
test("startAsk carry-over: old switch off and no choice in this browser → never; otherwise nothing", () => {
  assert.equal(Set_.startAskCarry(false, false), "never");
  assert.equal(Set_.startAskCarry(false, true), null, "a choice made here wins");
  assert.equal(Set_.startAskCarry(true, false), null);
  assert.equal(Set_.startAskCarry(undefined, false), null);
});
test("load dialog answer: Yes / No with Don't ask again; closed = nothing", () => {
  assert.deepEqual(M.promptAnswer({ yes: true, never: false }), { start: true, never: false });
  assert.deepEqual(M.promptAnswer({ yes: false, never: true }), { start: false, never: true });
  assert.deepEqual(M.promptAnswer({ yes: true, never: true }), { start: true, never: true });
  assert.deepEqual(M.promptAnswer(null), { start: false, never: false });
  assert.deepEqual(M.promptAnswer(true), { start: true, never: false });
  assert.deepEqual(M.promptAnswer("x"), { start: false, never: false });
});
test("start prompt with the banner: Start starts, closing does nothing, a start elsewhere closes it", async () => {
  let answer, fire, started = 0;
  const deps = { ask: () => new Promise(r => { answer = r; }), subscribe: fn => { fire = fn; return () => { }; }, close: () => answer(null), isOpen: () => false, start: () => started++ };
  let p = M.startPrompt(deps); answer(true); assert.equal(await p, true); assert.equal(started, 1);
  p = M.startPrompt(deps); answer(null); assert.equal(await p, false); assert.equal(started, 1);
  p = M.startPrompt(deps); fire(); assert.equal(await p, false); assert.equal(started, 1);
});
test("quiet banner: text, Start and Not now buttons, localized", () => {
  const html = V.startBannerHTML(); noMissing(html);
  assert.match(html, /data-rb-banner="start"/); assert.match(html, /data-rb-banner="close"[^>]*aria-label="Not now"/);
  assert.match(html, /Start session/);
  for (const k of ["title", "body", "never", "neverDone", "quiet", "dismiss"]) assert.ok(LANG[`REDBOOK.Prompt.${k}`], k);
});
test("client settings are never exported by the Satchel; cleanup's settings reset covers them", () => {
  for (const k of [...Set_.RECORDS, "startAsk"]) assert.ok(Set_.SATCHEL_SKIP.includes(k), k);
  for (const s of Set_.SETTINGS.filter(r => r.client)) assert.ok(Set_.SATCHEL_SKIP.includes(s.key), s.key);
  const reg = registration({ id: "red-book", title: "Red Book", openPanel: () => 1, health: () => [], records: Set_.SATCHEL_SKIP, debugKey: "debugLog" });
  assert.ok(reg.skipSettings.includes("startAsk"));
  assert.match(read("scripts/main.mjs"), /records: SATCHEL_SKIP/);
  assert.deepEqual(K.SETTING_SCOPES, ["world", "client"]);
  assert.match(K.CATEGORIES.find(c => c[0] === "settings")[1], /start-a-session prompt/);
  assert.match(K.CATEGORIES.find(c => c[0] === "settings")[1], /saved scene-check results/);
});

// ---------------------------------------------------------------- 2. scene names
test("check page: scene names wrap (two lines) and carry the full name as a tooltip", () => {
  const long = "A very long scene name that would not fit <in> one line";
  const html = V.checkPageHTML({ scenes: [{ id: "s1", name: long }], results: {}, selected: "s1", query: "" });
  noMissing(html);
  assert.match(html, /class="rb-scene-btn"[^>]*title="A very long scene name that would not fit &lt;in&gt; one line"/);
  assert.match(html, /<span class="wc-grow rb-clamp2">/);
  assert.match(html, /<h3 class="wc-grow rb-ellipsis" title="A very long/);
  assert.match(read("styles/red-book.css"), /\.rb-app \.rb-clamp2 \{[^}]*-webkit-line-clamp: 2/);
});

// ---------------------------------------------------------------- 3. saved results
const res = (id, at, extra = {}) => ({ scene: { id, uuid: `Scene.${id}`, name: `S ${id}` }, at, all: [{ rule: "walls", severity: "warning", text: "No walls", key: "walls", fix: { kind: "scene", id } }], findings: [], ignored: [], tally: { problem: 0, warning: 1, note: 0 }, ...extra });
test("saved results: packed per scene with time, pending/undated/deleted left out, read back", () => {
  const text = C.packSaved({ a: res("a", 100), b: { pending: true }, c: res("c", 0), d: res("d", 200) }, { sceneIds: ["a", "b", "c"] });
  const back = C.unpackSaved(text);
  assert.deepEqual(Object.keys(back), ["a"]);
  assert.equal(back.a.at, 100); assert.equal(back.a.scene.name, "S a");
  assert.deepEqual(back.a.all[0], { rule: "walls", severity: "warning", text: "No walls", key: "walls", fix: { kind: "scene", id: "a" } });
  // Ignores are re-applied from the scene, not stored.
  const applied = C.applyIgnored(back.a, { v: 1, entries: [{ key: "walls", at: 1, by: "u", name: "Ann" }] });
  assert.equal(applied.findings.length, 0); assert.equal(applied.ignored.length, 1); assert.equal(applied.at, 100);
  assert.deepEqual(Object.keys(C.unpackSaved(text, { sceneIds: [] })), [], "scenes deleted since are pruned on load");
});
test("saved results: capped by scenes (newest kept), findings and size; bad data → nothing", () => {
  const all = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`s${i}`, res(`s${i}`, 1000 + i)]));
  const few = C.unpackSaved(C.packSaved(all, { max: { scenes: 3 } }));
  assert.deepEqual(Object.keys(few).sort(), ["s7", "s8", "s9"]);
  const big = { x: res("x", 5, { all: Array.from({ length: 50 }, (_, i) => ({ rule: "r", severity: "note", text: "t".repeat(900), key: `k${i}` })) }) };
  const b = C.unpackSaved(C.packSaved(big, { max: { findings: 10 } }));
  assert.equal(b.x.all.length, 10); assert.equal(b.x.all[0].text.length, 500);
  const small = C.packSaved(all, { max: { chars: 600 } });
  assert.ok(small.length <= 600); assert.ok(Object.keys(C.unpackSaved(small)).length < 10);
  assert.deepEqual(C.unpackSaved("not json"), {}); assert.deepEqual(C.unpackSaved(null), {});
  assert.deepEqual(C.unpackSaved(JSON.stringify({ v: 99, scenes: {} })), {});
  assert.deepEqual(C.unpackSaved(JSON.stringify({ v: 1, scenes: { a: { at: "x", all: [] }, b: { at: 1 } } })), {});
  assert.equal(C.savedKey("w1"), "red-book.checkResults.w1");
  assert.ok(!Set_.SETTINGS.some(s => /check.*result|results/i.test(s.key)), "still never a world setting");
});
test("check page: 'Checked 18:20' with the result's time, another day shows the date; Clear saved results", () => {
  const at = Date.UTC(2026, 10, 1, 18, 20);
  const o = { now: Date.UTC(2026, 10, 1, 21, 0), timeZone: "UTC", locale: "en-GB" };
  assert.equal(V.checkedText(at, o), "Checked 18:20");
  assert.equal(V.checkedText(at, { ...o, now: Date.UTC(2026, 10, 3, 9, 0) }), "Checked Sun 1 Nov 18:20");
  const html = V.checkPageHTML({ scenes: [{ id: "s1", name: "Cave" }], results: { s1: C.applyIgnored(res("s1", at), null) }, selected: "s1", query: "", ...o });
  noMissing(html);
  assert.match(html, /class="wc-hint rb-checked-at" title="Sun 1 Nov 18:20">Checked 18:20</);
  assert.match(html, /data-action="clearSavedChecks"/); assert.match(html, /Clear saved results/);
  assert.match(html, /kept in this browser only/);
  const none = V.checkPageHTML({ scenes: [{ id: "s1", name: "Cave" }], results: {}, selected: "s1", query: "" });
  assert.ok(!none.includes("clearSavedChecks"), "no button with nothing saved");
  assert.match(read("scripts/panel.mjs"), /case "clearSavedChecks": return C\?\.clearSaved\(\);/);
});

// ---------------------------------------------------------------- 4. in-world time
test("in-world time: hidden for the default calendar at year 0 and for year-0 stamps; kept otherwise", () => {
  assert.equal(M.hasWorldCalendar({ isDefault: true, year: 0 }), false);
  assert.equal(M.hasWorldCalendar({ isDefault: true, year: null }), false);
  assert.equal(M.hasWorldCalendar({ isDefault: true, year: 1492 }), true, "default calendar with a year set");
  assert.equal(M.hasWorldCalendar({ isDefault: false, year: 0 }), true, "a custom calendar is real even at year 0");
  assert.equal(M.worldTimeText({ wtText: "0000-01-01 13:30:06" }), "");
  assert.equal(M.worldTimeText({ wtText: "0-01-01 13:30" }), "");
  assert.equal(M.worldTimeText({ wtText: "Day 3, Hammer 1492" }), "Day 3, Hammer 1492");
  assert.equal(M.worldTimeText({ wtText: "1492-03-01 08:00:00" }), "1492-03-01 08:00:00");
  assert.equal(M.worldTimeText({}), "");
  const ev = (i, wtText) => ({ id: `e${i}`, type: "note", t: 1000 + i, wt: 0, rtText: "20:00", wtText, text: `n${i}`, refs: [], data: {}, private: false, thread: false });
  const html = V.timelineHTML([ev(1, "0000-01-01 13:30:06"), ev(2, "Day 3")]);
  assert.ok(!html.includes("0000-01-01")); assert.match(html, /<span>Day 3<\/span>/);
  const page = M.pageHTML(M.normalizeSession({ name: "S", open: true, startedAt: 1000, events: [ev(1, "0000-01-01 13:30:06")] }));
  assert.ok(!page.includes("0000-01-01"), "journal page too");
});

// ---------------------------------------------------------------- 5. prep list count
test("prep list badge: 'n to do', the cap in the tooltip and near the cap", () => {
  const items = n => Array.from({ length: n }, (_, i) => ({ id: `s1|k${i}`, sceneId: "s1", sceneUuid: "Scene.s1", sceneName: "Cave", text: `t${i}`, severity: "warning" }));
  const three = V.prepPanelHTML(items(3), { max: 100 }); noMissing(three);
  assert.match(three, /title="The list holds up to 100 items; Done takes an item off\.">3 to do</);
  assert.ok(!three.includes("/100"));
  assert.match(V.prepPanelHTML([], { max: 100 }), />0 to do</);
  assert.match(V.prepPanelHTML(items(85), { max: 100 }), />85 to do · max 100</);
  assert.match(V.prepPanelHTML(items(100), { max: 100 }), /wc-badge wc-bad[^>]*>100 to do · max 100</);
});

// ---------------------------------------------------------------- 6. key binding and api.open
test("Open Red Book: default Shift+R, Quick note keeps Ctrl+Shift+N, action ids unchanged", () => {
  const o = defineOpenKeybinding({ ...KEYS.openRedBook, onDown: () => { } });
  assert.equal(o.action, "openRedBook"); assert.equal(o.gmOnly, true);
  assert.deepEqual(o.editable, [{ key: "KeyR", modifiers: ["Shift"] }]);
  assert.deepEqual(defineOpenKeybinding({ ...KEYS.quickNote, onDown: () => { } }).editable, [{ key: "KeyN", modifiers: ["Control", "Shift"] }]);
  assert.match(FEATURE_LIST.find(f => f.id === "openKey").hint, /Shift\+R/);
});
test("api.open(page) opens the main window; panel(page) kept", () => {
  const main = read("scripts/main.mjs");
  assert.match(main, /open: page => Panel\.open\(page\),/);
  assert.match(main, /panel: page => Panel\.open\(page\),/);
  assert.match(read("README.md"), /`open\(page\)`/);
});

test("0.8.0 version and changelog", () => {
  assert.match(read("CHANGELOG.md"), /^## 0\.8\.0 \(2026-11-01\)[\s\S]*?Untested in Foundry/m);
});
