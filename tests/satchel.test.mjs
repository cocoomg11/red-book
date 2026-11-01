import { test } from "node:test";
import assert from "node:assert/strict";
import { registration, registerWith, SATCHEL_ID, SATCHEL_READY } from "../scripts/satchel-model.mjs";
import { RECORDS } from "../scripts/settings-model.mjs";

const reg = (over = {}) => registration({ id: "red-book", title: "Red Book", openPanel: () => "opened", health: o => [{ title: "Red Book", lines: [{ level: "ok", text: `t=${o?.timeoutMs ?? "-"}` }] }], records: RECORDS, debugKey: "debugLog", ...over });
/** The field names the Satchel's register() knows (its README, "Registration fields"). */
const KNOWN = new Set(["id", "title", "openPanel", "health", "healthTimeoutMs", "exportSettings", "importSettings", "debugSetting", "docs", "skipSettings", "validators"]);

test("satchel: registration has only known fields, debug setting, every record skipped, functions pass through", async () => {
  const r = reg();
  for (const k of Object.keys(r)) assert.ok(KNOWN.has(k), `unknown field ${k}`);
  assert.equal(r.id, "red-book");
  assert.deepEqual(r.debugSetting, { namespace: "red-book", key: "debugLog" });
  for (const k of ["openSession", "migrations", "onlineHudPos", "onlineHudCollapsed", "boardPins"]) assert.ok(r.skipSettings.includes(k), k);
  assert.equal(r.openPanel(), "opened");
  assert.deepEqual(r.health({ timeoutMs: 500 })[0].lines[0].text, "t=500");
  assert.equal(r.health()[0].lines[0].text, "t=-");
});

const env = (over = {}) => {
  const once = []; const warns = [];
  return { once, warns, e: { active: () => true, api: () => null, once: (h, fn) => once.push([h, fn]), warn: m => warns.push(m), ...over } };
};

test("satchel: not active → nothing registered, no hook", () => {
  const { once, e } = env({ active: () => false, api: () => ({ register: () => assert.fail("must not register") }) });
  assert.equal(registerWith(reg(), e), null);
  assert.equal(once.length, 0);
});
test("satchel: active with api → registers now and again on its ready hook", () => {
  const calls = [];
  const api = { register: r => { calls.push(r.id); return { ok: true, error: null, warnings: [] }; } };
  const { once, warns, e } = env({ api: () => api });
  assert.deepEqual(registerWith(reg(), e), { ok: true, error: null, warnings: [] });
  assert.equal(once[0][0], SATCHEL_READY); assert.equal(SATCHEL_READY, `${SATCHEL_ID}.ready`);
  once[0][1](api);
  assert.deepEqual(calls, ["red-book", "red-book"]);
  assert.equal(warns.length, 0);
});
test("satchel: api not there yet → waits for the ready hook (uses the hook's api)", () => {
  const calls = [];
  const { once, e } = env();
  assert.equal(registerWith(reg(), e), null);
  once[0][1]({ register: r => { calls.push(r); return { ok: true }; } });
  assert.equal(calls.length, 1);
});
test("satchel: refusals, warnings and throws are reported, never thrown", () => {
  let { warns, e } = env({ api: () => ({ register: () => ({ ok: false, error: "bad id" }) }) });
  registerWith(reg(), e); assert.match(warns[0], /refused.*bad id/);
  ({ warns, e } = env({ api: () => ({ register: () => ({ ok: true, warnings: ["x"] }) }) }));
  registerWith(reg(), e); assert.match(warns[0], /x/);
  ({ warns, e } = env({ api: () => ({ register: () => { throw new Error("boom"); } }) }));
  assert.equal(registerWith(reg(), e), null); assert.match(warns[0], /failed/);
  ({ warns, e } = env({ api: () => ({}) }));
  assert.equal(registerWith(reg(), e), null);
});
test("satchel: recommended in module.json, not required", async () => {
  const { readFileSync } = await import("node:fs");
  const m = JSON.parse(readFileSync(new URL("../module.json", import.meta.url), "utf8"));
  assert.ok(m.relationships.recommends.some(r => r.id === SATCHEL_ID));
  assert.ok(!(m.relationships.requires ?? []).some(r => r.id === SATCHEL_ID));
});
