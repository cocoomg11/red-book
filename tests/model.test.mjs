import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../scripts/settings-model.mjs";
import * as K from "../scripts/cleanup-model.mjs";
import { RULES } from "../scripts/check-model.mjs";
import { GROUPS } from "../scripts/session-model.mjs";

test("every check rule and log group has a setting; keys unique", () => {
  const keys = S.SETTINGS.map(s => s.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const r of Object.keys(RULES)) assert.ok(keys.includes(`check-${r}`));
  for (const g of Object.keys(GROUPS)) assert.ok(keys.includes(`log-${g}`));
  assert.deepEqual(S.RECORDS, ["openSession", "migrations", "onlineHudPos", "boardPins"]);
});
test("tab rows and conversion", () => {
  const { basic, advanced } = S.tabRows("check");
  assert.equal(basic.length, 0); assert.ok(advanced.length >= Object.keys(RULES).length);
  const n = S.SETTINGS.find(s => s.key === "boardNext");
  assert.equal(S.convert(n, "99"), 10); assert.equal(S.convert(n, "x"), null);
  assert.equal(S.convert({ type: "bool" }, "on"), true);
  assert.equal(S.convert({ type: "text", default: "Session Log" }, "  "), "Session Log");
  assert.deepEqual(S.offRules(k => (k === "check-walls" ? false : true)), ["walls"]);
  assert.deepEqual(S.offGroups(k => (k === "log-npc" ? false : undefined)), ["npc"]);
});
test("cleanup plan: only our documents and flags", () => {
  const world = {
    journals: [
      { id: "s", name: "Session 1", flags: { "red-book": { session: { n: 1 } } } }, { id: "r", name: "Recap: Session 1", flags: { "red-book": { recap: { session: "s" } } } },
      { id: "c", name: "Scene check", flags: { "red-book": { reports: { v: 1 } } } }, { id: "x", name: "Mine", flags: {} },
      { id: "y", name: "Other mod", flags: { other: { a: 1 } } }, { id: "z", name: "Flagged", flags: { "red-book": { note: 1 } } }
    ],
    folders: [{ id: "f1", name: "Session Log", flags: { "red-book": { folder: true } } }, { id: "f2", name: "Mine", flags: {} }],
    docs: [{ uuid: "JournalEntry.s.JournalEntryPage.p", name: "Timeline", flags: { "red-book": { timeline: true } } }, { uuid: "Actor.a", name: "A", flags: { "red-book": {} } }],
    settings: [{ key: "boardPins", changed: true }, { key: "debugLog", changed: false }]
  };
  const p = K.plan(world);
  assert.deepEqual(p.sessions.map(x => x.id), ["s"]); assert.deepEqual(p.recaps.map(x => x.id), ["r"]); assert.deepEqual(p.reports.map(x => x.id), ["c"]);
  assert.deepEqual(p.flags.map(x => x.uuid), ["JournalEntry.z", "JournalEntry.s.JournalEntryPage.p"]);
  assert.deepEqual(p.folders.map(x => x.id), ["f1"]); assert.deepEqual(p.settings.map(x => x.key), ["boardPins"]);
  assert.deepEqual(K.emptyFolders(p, { sessions: true }, { f1: ["s"] }).map(f => f.id), ["f1"]);
  assert.deepEqual(K.emptyFolders(p, { sessions: true }, { f1: ["s", "x"] }), []);
  assert.deepEqual(K.emptyFolders(p, { sessions: false }, { f1: ["s"] }), []);
  const dry = K.dryRun(p); assert.equal(dry.length, K.CATEGORIES.length); assert.match(dry[0].text, /: 1 \(Session 1\)$/);
  assert.equal(dry.find(r => r.key === "flags").ticked, true);
});

test("feature registry: five tools, stable keys, needs nothing from Foundry", async () => {
  const F = await import("../scripts/features.mjs");
  assert.deepEqual(F.FEATURES.map(f => f.key), ["feature-sessionLog", "feature-prepBoard", "feature-sceneCheck", "feature-sessionStart", "feature-whosOnline"]);
  assert.ok(F.FEATURES.every(f => f.default === true && f.hint));
});
