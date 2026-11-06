import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as K from "../scripts/cleanup-model.mjs";
import * as St from "../scripts/store-model.mjs";
import * as M from "../scripts/migrate-model.mjs";

const read = f => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const rb = o => ({ "red-book": o });

test("0.8.4 cleanup: pages of journals that are deleted are not counted as flags", () => {
  const world = {
    journals: [
      { id: "s", name: "Session 1", flags: rb({ session: { n: 1 } }) }, { id: "d", name: "Data", flags: rb({ store: { v: 1 } }) },
      { id: "o", name: "Other", flags: {} }
    ],
    docs: [
      { uuid: "JournalEntry.s.JournalEntryPage.p1", name: "Timeline", flags: rb({ timeline: true }) },
      { uuid: "JournalEntry.s.JournalEntryPage.p2", name: "Notes", flags: rb({ any: true }) },
      { uuid: "JournalEntry.d.JournalEntryPage.p3", name: "About", flags: rb({ any: true }) },
      { uuid: "JournalEntry.o.JournalEntryPage.p4", name: "Mine", flags: rb({ any: true }) },
      { uuid: "Actor.a", name: "A", flags: rb({ any: true }) }
    ]
  };
  const p = K.plan(world);
  assert.deepEqual(p.flags.map(f => f.uuid), ["JournalEntry.o.JournalEntryPage.p4", "Actor.a"]);
  assert.equal(K.dryRun(p).find(r => r.key === "flags").text.match(/: (\d+)/)[1], "2", "the dry run count is what the notice will say");
  assert.equal(K.parentJournalId("JournalEntry.abc.JournalEntryPage.def"), "abc"); assert.equal(K.parentJournalId("Actor.a"), null);
});

test("0.8.4 cleanup: the migrations record is not reset; the carry-over mark is kept or set", () => {
  const p = K.plan({ settings: [{ key: "migrations", changed: true }, { key: "boardPins", changed: true }] });
  assert.deepEqual(p.settings.map(s => s.key), ["boardPins"]);
  assert.equal(K.keepMigrations({ v: 1, toolkit: 123 }, 999).toolkit, 123);
  assert.equal(K.keepMigrations({ v: 1 }, 999).toolkit, 999, "never run: mark it done so a reload doesn't import");
  assert.equal(K.keepMigrations(undefined, 7).toolkit, 7);
  assert.match(read("scripts/cleanup.mjs"), /keepMigrations\(get\("migrations"\)\)/);
});

test("0.8.4 carry-over: a marked world imports nothing again, and our reset values are not refilled", () => {
  const kept = M.normalizeMigrations(K.keepMigrations({ v: 1 }, 5));
  assert.equal(kept.toolkit, 5);
  assert.match(read("scripts/migrate.mjs"), /if \(m\.toolkit\) return;/);
});

test("0.8.4 pin move: no store and no old pins writes nothing (lazy create)", () => {
  const r = St.migratePins(null, { v: 1, pins: [] }, 1);
  assert.equal(r.store, null); assert.equal(r.clearSetting, false);
  assert.equal(St.migratePins(undefined, undefined, 1).store, null);
  assert.ok(St.migratePins(null, { v: 1, pins: [{ uuid: "Actor.a", name: "A" }] }, 1).store, "old pins still move");
});

test("0.8.4 version", () => {
  assert.equal(JSON.parse(read("module.json")).version, "0.8.4");
  assert.match(read("CHANGELOG.md"), /^## 0\.8\.4 \(2026-11-06\)[\s\S]*?Untested in Foundry/m);
});
