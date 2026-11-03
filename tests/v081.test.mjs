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
  assert.equal(JSON.parse(read("module.json")).version, "0.8.2");
  assert.equal(JSON.parse(read("package.json")).version, "0.8.2");
  assert.match(read("module.json"), /releases\/download\/v0\.8\.2\/module\.zip/);
  assert.match(read("CHANGELOG.md"), /^## 0\.8\.1 \(2026-11-02\)[\s\S]*?Untested in Foundry/m);
});

// ---- 0.8.2: draggable start banner
import { bannerPlace, clampPos } from "../scripts/online-model.mjs";
import { SETTINGS, RECORDS, SATCHEL_SKIP } from "../scripts/settings-model.mjs";
import { startBannerHTML } from "../scripts/view.mjs";

test("0.8.2 banner position: none/unreadable = default, saved is clamped on screen", () => {
  const view = { width: 1000, height: 700 }, size = { width: 300, height: 40 };
  for (const bad of [null, undefined, {}, "x", { left: "a", top: 1 }, { left: NaN, top: 2 }]) assert.equal(bannerPlace(bad, view, size), null);
  assert.deepEqual(bannerPlace({ left: 100, top: 200 }, view, size), { left: 100, top: 200 });
  const far = bannerPlace({ left: 5000, top: 5000 }, view, size), neg = bannerPlace({ left: -50, top: -9 }, view, size);
  assert.deepEqual(far, clampPos({ left: 5000, top: 5000 }, view, size));
  assert.ok(far.left + 300 <= 1000 && far.top + 40 <= 700 && neg.left >= 0 && neg.top >= 0);
});

test("0.8.2 startBannerPos is a hidden client record, covered by RECORDS and the Satchel skip list", () => {
  const s = SETTINGS.find(x => x.key === "startBannerPos");
  assert.ok(s && s.client && s.hidden && s.type === "object");
  assert.ok(RECORDS.includes("startBannerPos") && SATCHEL_SKIP.includes("startBannerPos"));
});

test("0.8.2 banner has a grip handle with the buttons outside it, and drag CSS + cleanup text", () => {
  const html = startBannerHTML();
  assert.match(html, /class="rb-banner-grip"[^>]*title=/);
  assert.ok(html.indexOf("data-rb-banner=\"start\"") > html.indexOf("</span></span>"), "buttons are outside the handle");
  assert.match(css, /\.rb-start-banner \.rb-banner-grip \{[^}]*cursor: grab/);
  assert.match(css, /\.rb-start-banner\.placed \{[^}]*transform: none/);
  assert.match(readFileSync(new URL("../scripts/cleanup-model.mjs", import.meta.url), "utf8"), /startBannerPos/);
});
