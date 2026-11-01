import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "../scripts/session-model.mjs";

const page = `<p class="rb-head"><strong>Session 1</strong></p><h2>Timeline</h2><ul class="rb-timeline"><li>Met @UUID[Actor.abc]{Old Tom}.</li><li>Found the map @UUID[Item.zzz]</li><li>Fought wolves</li></ul>
<section class="secret" id="s1"><p>Hidden <section class="x">nested</section> still hidden</p><ul><li>secret line</li></ul></section>
<!-- gm comment --><p>Public text</p><ul><li>only line</li></ul>`;

test("secret blocks (with nested sections) are stripped", () => {
  const s = M.stripSecrets(page);
  assert.ok(!s.includes("Hidden")); assert.ok(!s.includes("still hidden")); assert.ok(!s.includes("secret line")); assert.ok(s.includes("Public text"));
  assert.equal(M.stripSecrets(`<section class="foo secret bar">x</section>y`), "y");
});
test("review lines are numbered after secrets are gone and match the strip", () => {
  const lines = M.listLines(page);
  assert.deepEqual(lines.map(l => l.text), ["Met @UUID[Actor.abc]{Old Tom}.", "Found the map @UUID[Item.zzz]", "Fought wolves", "only line"]);
  const out = M.stripForRecap(page, [1, 3]);
  assert.ok(out.includes("Met Old Tom.")); assert.ok(!out.includes("Found the map")); assert.ok(out.includes("Fought wolves"));
  assert.ok(!out.includes("only line")); assert.ok(!out.includes("gm comment")); assert.ok(!out.includes("@UUID")); assert.ok(!out.includes("rb-head"));
  assert.ok(!/<ul\b[^>]*>\s*<\/ul>/.test(out));
});
test("private events never reach the recap", () => {
  let s = M.normalizeSession({ name: "S" });
  s = M.addEvent(s, M.makeEvent({ type: "note", text: "public" }));
  s = M.addEvent(s, M.makeEvent({ type: "note", text: "gm only", private: true }));
  const out = M.stripForRecap(M.pageHTML(s));
  assert.ok(out.includes("public")); assert.ok(!out.includes("gm only"));
});
test("pages are joined and wrapped", () => {
  const j = M.joinPages([{ name: "Timeline", html: "<p>a</p>" }, { name: "Notes", html: "  " }, { name: "<x>", html: "<p>b</p>" }]);
  assert.equal(j, "<h2>Timeline</h2>\n<p>a</p>\n<h2>&lt;x&gt;</h2>\n<p>b</p>");
  assert.match(M.recapHTML("Session 1", ""), /Nothing to share/);
});
