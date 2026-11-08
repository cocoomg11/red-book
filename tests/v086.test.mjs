import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CORE_VERSION, UI_CLASSES } from "../vendor/wanderers-core/index.mjs";

const read = f => readFileSync(new URL("../" + f, import.meta.url), "utf8");

test("0.8.6: core 0.6.0 vendored, CI calls the same core version", () => {
  const lock = JSON.parse(read("wanderers-core.lock.json"));
  assert.equal(lock.version, "0.6.0");
  assert.equal(lock.source, "release");
  assert.equal(CORE_VERSION, lock.version);
  assert.match(read(".github/workflows/test.yml"), new RegExp(`module-checks\\.yml@v${lock.version.replace(/\./g, "\\.")}\\s`));
});

test("0.8.6: windows take core's revision class from UI_CLASSES; nothing writes one out", () => {
  assert.ok(UI_CLASSES.includes("wc-r4"));
  for (const f of ["styles/red-book.css", "scripts/view.mjs", "scripts/panel.mjs", "scripts/ui.mjs", "scripts/start.mjs", "scripts/online.mjs"]) {
    assert.doesNotMatch(read(f), /wc-r\d/, f);
  }
});

test("0.8.6 changelog section kept (shipped with 0.9.0)", () => {
  assert.match(read("CHANGELOG.md"), /^## 0\.8\.6 \(2026-11-08\)[\s\S]*?Untested in Foundry/m);
});
