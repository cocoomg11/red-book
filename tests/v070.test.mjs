import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { flatten } from "../scripts/i18n.mjs";
import * as V from "../scripts/view.mjs";
import * as M from "../scripts/session-model.mjs";
import * as SM from "../scripts/store-model.mjs";
import * as K from "../scripts/cleanup-model.mjs";
import * as Set_ from "../scripts/settings-model.mjs";
import { KEYS } from "../scripts/features.mjs";
import { registration } from "../scripts/satchel-model.mjs";
import { htmlToText } from "../scripts/discord-model.mjs";
import { defineStore, isStoreEntry, storeCreateData, needsFiling, defineOpenKeybinding, FIX_ACTION_RE, readFix, statusLines, CORE_VERSION } from "../vendor/wanderers-core/index.mjs";

const LANG = flatten(JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8")));
const read = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
before(() => {
  globalThis.game = { i18n: {
    localize: k => LANG[k] ?? `MISSING:${k}`,
    format: (k, d) => (LANG[k] ?? `MISSING:${k}`).replace(/\{(\w+)\}/g, (_, n) => d[n] ?? "")
  } };
});
const noMissing = html => assert.ok(!html.includes("MISSING:"), html.match(/MISSING:[\w.]+/)?.[0]);

// ---------------------------------------------------------------- core 0.5.0 (0.8.6: whatever the lock pins)
test("vendored core matches its lock; CI and the release zip follow it", () => {
  const pinned = JSON.parse(read("wanderers-core.lock.json")).version;
  assert.equal(CORE_VERSION, pinned);
  assert.match(read(".github/workflows/test.yml"), new RegExp(`module-checks\\.yml@v${pinned.replace(/\./g, "\\.")}\\s`));
  assert.match(read(".github/workflows/release.yml"), /'vendor\/wanderers-core\/testing\/\*'/);
});

// ---------------------------------------------------------------- the bug fix: the picked choice reward
test("rewardItems: fixed items plus the picked choice (toolkit quest v2); no pick or a stale pick adds nothing", () => {
  const q = { rewards: { items: [{ uuid: "Item.a", name: "Ring", img: "r.webp", rarity: "rare" }], choice: [{ uuid: "Item.b", name: "Axe", img: "a.webp", rarity: "uncommon" }, { uuid: "Item.c", name: "Bow" }], pick: "Item.c" } };
  assert.deepEqual(M.rewardItems(q).map(i => i.name), ["Ring", "Bow"]);
  assert.deepEqual(M.rewardItems({ rewards: { ...q.rewards, pick: "" } }).map(i => i.name), ["Ring"]);
  assert.deepEqual(M.rewardItems({ rewards: { ...q.rewards, pick: "Item.zzz" } }).map(i => i.name), ["Ring"]);
  // Only a choice, picked: the choice alone counts (the live bug: nothing was shown).
  assert.deepEqual(M.rewardItems({ rewards: { items: [], choice: q.rewards.choice, pick: "Item.b" } }), [{ name: "Axe", qty: 1, img: "a.webp", rarity: "uncommon" }]);
  // Older records: items with quantity; nothing at all.
  assert.deepEqual(M.rewardItems({ rewards: { items: [{ name: "Potion", quantity: 3 }] } }), [{ name: "Potion", qty: 3, img: "", rarity: "" }]);
  assert.deepEqual(M.rewardItems(null), []); assert.deepEqual(M.rewardItems({ rewards: { choice: "x", pick: 5 } }), []);
  const g = M.gained({ quests: [{ items: M.rewardItems(q) }] });
  assert.deepEqual(g.items.map(i => i.name), ["Bow", "Ring"]); assert.equal(g.any, true);
});

// ---------------------------------------------------------------- coins and quality
test("gained with the world's ratio: core coin text; spent; old frozen blocks keep their text", () => {
  const log = [{ at: 5, delta: 120503, actorName: "P" }, { at: 6, delta: -250 }];
  const g = M.gained({ coinLog: log, start: 1, end: 10, ratio: 100 });
  assert.equal(g.ratio, 100); assert.deepEqual(g.netCoin, { gp: 12, sp: 2, cp: 53 });
  const html = M.extrasHTML({ gained: g });
  assert.match(html, /Coin: \+12g 2s 53c \(Spent 2s 50c\)/);
  const std = M.extrasHTML({ gained: M.gained({ coinLog: [{ at: 5, delta: 1253 }], start: 1, end: 10, ratio: 10 }) });
  assert.match(std, /Coin: \+12g 5s 3c</);
  const old = M.extrasHTML({ gained: { any: true, net: 1253, netSign: 1, netCoin: { gp: 12, sp: 5, cp: 3 }, spent: { gp: 0, sp: 0, cp: 0 }, items: [] } });
  assert.match(old, /Coin: \+12 g 5 s 3 c</);
  // The loot-line fallback in the world's coins.
  assert.deepEqual(M.coinFromLoot([{ type: "loot", t: 2, data: { coin: { gp: 1, sp: 2, cp: 3 } } }], 100).map(e => e.delta), [10203]);
  assert.deepEqual(M.coinFromLoot([{ type: "loot", t: 2, data: { coin: { gp: 1, pp: 1 } } }]).map(e => e.delta), [1100]);
  assert.equal(M.coinAmount(-250, 100), "2s 50c");
});

test("reward items: core quality slot and colour, escaped; the core root classes on the list; Discord text skips the slot's hidden word", () => {
  const g = M.gained({ quests: [{ items: [{ name: "Blade \"Q\" & Co", img: "i\".webp", rarity: "veryRare" }, { name: "Plain" }] }] });
  const html = M.extrasHTML({ gained: g });
  assert.match(html, /class="rb-gained wc-ui wc-r\d+"/);
  assert.match(html, /<span class="wc-item-slot wc-sm" data-quality="epic"/);
  assert.match(html, /<span class="wc-q-text" data-quality="epic">Blade &quot;Q&quot; &amp; Co<\/span>/);
  assert.ok(!html.includes('i".webp'));
  assert.match(html, /<li>Plain<\/li>/);
  assert.equal(htmlToText(html).split("\n").filter(l => l.startsWith("•")).join("|"), "• Blade \"Q\" & Co|• Plain");
});

// ---------------------------------------------------------------- store on core
test("store on core createStore: found by its data flag as before, created GM-only with the About page, filed once", () => {
  const spec = defineStore({ ...SM.STORE_OPTIONS });
  assert.equal(spec.entryFlag, null); assert.equal(spec.flagKey, "store");
  const old = { flags: { "red-book": { store: { v: 1, pins: { v: 1, pins: [] } } } } };
  assert.ok(isStoreEntry(old, "red-book", spec)); assert.ok(!isStoreEntry({ flags: { "red-book": { session: {} } } }, "red-book", spec));
  assert.equal(needsFiling(old, "red-book", spec), true);
  assert.equal(needsFiling({ flags: { "red-book": { ...old.flags["red-book"], dataFolderFiled: true } } }, "red-book", spec), false);
  const c = storeCreateData("red-book", spec, { none: 0, folder: "F1" });
  assert.equal(c.name, SM.STORE_NAME); assert.equal(c.ownership.default, 0); assert.equal(c.folder, "F1");
  assert.deepEqual(c.flags["red-book"].store, SM.normalizeStore(null));
  assert.match(c.pages[0].text.content, /GM-only data/);
  assert.match(read("scripts/store.mjs"), /createStore\(ID, \{ \.\.\.M\.STORE_OPTIONS, log: \{ warn \}, isWriter: \(\) => L\.isLeader\(\) \}\)/);
  assert.match(read("scripts/main.mjs"), /Store\.file\(\)/);
  assert.match(read("scripts/cleanup.mjs"), /Store\.remove\(\)/);
});

test("cleanup: the filed store is still the store; a leftover dataFolderFiled mark is a flag; client settings are reset too", () => {
  const p = K.plan({ journals: [
    { id: "s", name: "Red Book data (GM only)", flags: { "red-book": { store: { v: 1 }, dataFolderFiled: true } } },
    { id: "x", name: "Other", flags: { "red-book": { dataFolderFiled: true } } }
  ] });
  assert.deepEqual(p.store.map(j => j.id), ["s"]); assert.deepEqual(p.flags.map(f => f.uuid), ["JournalEntry.x"]);
  assert.deepEqual(K.SETTING_SCOPES, ["world", "client"]);
  assert.match(K.CATEGORIES.find(c => c[0] === "settings")[1], /window positions/);
});

// ---------------------------------------------------------------- settings, records, Satchel
test("showModuleData and windowPlacement: hidden client records, skipped by the Satchel; fixes registered", () => {
  const s = Set_.SETTINGS.find(r => r.key === "showModuleData");
  assert.equal(s.type, "bool"); assert.equal(s.default, false); assert.equal(s.hidden, true); assert.equal(s.client, true); assert.equal(typeof s.onChange, "function");
  assert.doesNotThrow(() => s.onChange(true));
  for (const k of ["showModuleData", "windowPlacement"]) assert.ok(Set_.RECORDS.includes(k), k);
  const reg = registration({ id: "red-book", title: "Red Book", openPanel: () => 1, health: () => [], records: Set_.RECORDS, debugKey: "debugLog", fixes: { storeNone: () => "ok", bad: "x" } });
  for (const k of ["showModuleData", "windowPlacement"]) assert.ok(reg.skipSettings.includes(k), k);
  assert.deepEqual(Object.keys(reg.fixes), ["storeNone"]);
  assert.equal("fixes" in registration({ id: "red-book", title: "R", openPanel: () => 1, health: () => [], records: [], debugKey: "debugLog" }), false);
});

// ---------------------------------------------------------------- key bindings
test("key bindings through core: same action ids, Ctrl+Shift+N kept, GM only", () => {
  const q = defineOpenKeybinding({ ...KEYS.quickNote, onDown: () => {} });
  assert.equal(q.action, "quickNote"); assert.equal(q.gmOnly, true); assert.deepEqual(q.editable, [{ key: "KeyN", modifiers: ["Control", "Shift"] }]);
  const o = defineOpenKeybinding({ ...KEYS.openRedBook, onDown: () => {} });
  assert.equal(o.action, "openRedBook"); assert.deepEqual(o.editable, [{ key: "KeyR", modifiers: ["Shift"] }], "0.8.0: default Shift+R");
  for (const f of ["scripts/main.mjs", "scripts/session.mjs"]) assert.ok(!/game\.keybindings\.register/.test(read(f)), f);
});

// ---------------------------------------------------------------- windows
test("windows remember their placement (core RememberedWindow), with stable keys", () => {
  for (const [f, key] of [["scripts/panel.mjs", "app"], ["scripts/start.mjs", "start"], ["scripts/cleanup.mjs", "cleanup"], ["scripts/online.mjs", "online"]]) {
    assert.match(read(f), new RegExp(`RememberedWindow\\(foundry\\.applications\\.api\\.ApplicationV2, \\{ moduleId: ID, key: "${key}"`), f);
  }
});

// ---------------------------------------------------------------- Data page and health fixes
test("Data page: Show module data switch and Reset window positions; strings present", () => {
  const html = V.dataPageHTML({ rows: { basic: [], advanced: [] }, showData: true, windows: 2 });
  noMissing(html);
  assert.match(html, /name="showModuleData" checked/); assert.match(html, /data-action="resetWindows"(?! disabled)/); assert.match(html, /2 remembered/);
  assert.match(V.dataPageHTML({}), /data-action="resetWindows" disabled/);
  assert.ok(!/name="showModuleData" checked/.test(V.dataPageHTML({})));
});

test("health lines with a fix: a Fix button with the action id, escaped; lines without keep core's markup", async () => {
  const { FIX_ACTIONS } = await import("../scripts/health.mjs");
  for (const [id, f] of Object.entries(FIX_ACTIONS)) {
    assert.match(id, FIX_ACTION_RE); assert.deepEqual(readFix({ action: id, ...f }), { label: f.label, action: id, confirm: f.confirm });
  }
  const plain = [{ level: "ok", text: "Fine" }];
  assert.equal(V.healthLinesHTML(plain), statusLines(plain));
  const html = V.healthLinesHTML([{ level: "warn", text: "Open <x>", fix: { label: "Set <to> None", action: "storeNone" } }, { level: "ok", text: "Fine" }]);
  assert.match(html, /Open &lt;x&gt;/); assert.match(html, /data-action="healthFix" data-fix="storeNone"/); assert.match(html, /Set &lt;to&gt; None/);
  noMissing(V.healthPageHTML([{ title: "R", lines: [{ level: "warn", text: "t", fix: { action: "clearOpenSession" } }] }]));
});
