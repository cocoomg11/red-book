import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = f => readFileSync(new URL("../" + f, import.meta.url), "utf8");

test("0.8.5: the inventory timer starts only on GM clients and still flushes only while recording", () => {
  const src = read("scripts/session.mjs");
  const timers = [...src.matchAll(/setInterval\(/g)];
  assert.equal(timers.length, 1, "one interval in session.mjs");
  assert.match(src, /if \(game\.user\?\.isGM\) setInterval\(\(\) => \{ if \(recording\(\)\) flushInventory\(\); \}, 5000\);/);
  assert.match(src, /const recording = \(\) => !!R\.data\?\.open && L\.isLeader\(\);/, "the recorder check stays the leader");
});
