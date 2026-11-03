import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../styles/red-book.css", import.meta.url), "utf8");
const rule = sel => css.split("\n").find(l => l.startsWith(sel + " {")) ?? "";

test("start banner has an opaque background in both themes", () => {
  const dark = rule(".rb-start-banner"); const light = rule("body.theme-light .rb-start-banner");
  assert.ok(dark && light);
  assert.doesNotMatch(dark, /var\(--wc-surface/, "core's surface token is a translucent tint");
  assert.match(dark, /background: #[0-9a-f]{6};/); assert.match(light, /background: #[0-9a-f]{6};/);
  assert.match(dark, /color: #[0-9a-f]{6};/); assert.match(light, /color: #[0-9a-f]{6};/);
});

test("0.8.1 version and changelog", () => {
  const read = f => readFileSync(new URL("../" + f, import.meta.url), "utf8");
  assert.equal(JSON.parse(read("module.json")).version, "0.8.1");
  assert.equal(JSON.parse(read("package.json")).version, "0.8.1");
  assert.match(read("module.json"), /releases\/download\/v0\.8\.1\/module\.zip/);
  assert.match(read("CHANGELOG.md"), /^## 0\.8\.1 \(2026-11-02\)[\s\S]*?Untested in Foundry/m);
});
