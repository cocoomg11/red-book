import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as M from "../scripts/session-model.mjs";
import * as D from "../scripts/discord-model.mjs";
import * as V from "../scripts/view.mjs";
import * as Feat from "../scripts/features.mjs";
import { REQUESTS } from "../scripts/requests.mjs";
import { readRequest, makeRequestId } from "../vendor/wanderers-core/index.mjs";

const read = f => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const AID = "abcdefghijklmnop";
const AID2 = "ponmlkjihgfedcba";
const FID = "guild01";
const HID = "shadow99";
const payload = (o = {}) => ({ actorId: AID, factionId: FID, before: 10, after: 13, delta: 3, tierBefore: 0, tierAfter: 1, ...o });

test("0.9.0: the toolkit hook name matches the toolkit's RENOWN_HOOK", () => {
  assert.equal(M.TOOLKIT_HOOKS.renownChanged, "wayfarers-toolkit.renownChanged");
});

test("readRenownHook: ids and numbers only, other fields ignored, bad ids refused", () => {
  const p = M.readRenownHook({ ...payload(), text: "<b>secret</b>", name: "Hidden Faction", user: "x" });
  assert.deepEqual(p, { actorId: AID, factionId: FID, before: 10, after: 13, delta: 3, tierBefore: 0, tierAfter: 1 });
  assert.equal(M.readRenownHook(null), null);
  assert.equal(M.readRenownHook("x"), null);
  assert.equal(M.readRenownHook(payload({ actorId: "short" })), null);
  assert.equal(M.readRenownHook(payload({ factionId: "bad id!" })), null);
  assert.equal(M.readRenownHook(payload({ factionId: "x".repeat(25) })), null);
  const odd = M.readRenownHook(payload({ before: -5, after: "7.6", delta: "nope", tierBefore: -9, tierAfter: 1e9 }));
  assert.deepEqual([odd.before, odd.after, odd.delta, odd.tierBefore, odd.tierAfter], [0, 8, 0, -1, 100]);
});

test("mergeRenown: first before, last after, deltas added", () => {
  const a = M.readRenownHook(payload({ before: 2, after: 3, delta: 1, tierBefore: -1, tierAfter: 0 }));
  const b = M.readRenownHook(payload({ before: 3, after: 4, delta: 1, tierBefore: 0, tierAfter: 0 }));
  const c = M.readRenownHook(payload({ before: 4, after: 5, delta: 1, tierBefore: 0, tierAfter: 0 }));
  const m = M.mergeRenown(M.mergeRenown(M.mergeRenown(null, a), b), c);
  assert.deepEqual(m, { actorId: AID, factionId: FID, before: 2, after: 5, delta: 3, tierBefore: -1, tierAfter: 0 });
  assert.equal(M.renownKey(a), `${AID}:${FID}`);
  assert.notEqual(M.renownKey(a), M.renownKey(M.readRenownHook(payload({ actorId: AID2 }))));
});

test("coalescing: changes within the quiet time make one burst; separate keys stay apart", () => {
  const c = new M.Coalescer({ quiet: M.RENOWN_QUIET, max: M.RENOWN_BURST_MAX });
  c.touch("a", 0); c.touch("a", 2000); c.touch("b", 2500);
  assert.deepEqual(c.due(2000 + M.RENOWN_QUIET - 1), []);
  assert.deepEqual(c.due(2000 + M.RENOWN_QUIET), ["a"]);
  assert.deepEqual(c.due(2500 + M.RENOWN_QUIET), ["b"]);
  // A steady stream is cut at the burst maximum.
  for (let t = 0; t <= M.RENOWN_BURST_MAX; t += 1000) c.touch("s", t);
  assert.deepEqual(c.due(M.RENOWN_BURST_MAX), ["s"]);
});

test("renownEvent: gained, lost, tier up and down, names clipped", () => {
  const up = M.renownEvent(M.readRenownHook(payload()), { actor: "Bryn", faction: "The Guild", hidden: false, tier: "Trusted", tierBefore: "Known" });
  assert.equal(up.type, "renown");
  assert.equal(up.text, "Bryn gained 3 renown with The Guild (now 13, Trusted). Reached Trusted!");
  assert.equal(up.private, false);
  assert.equal(up.data.net, 3);
  const down = M.renownEvent(M.readRenownHook(payload({ before: 11, after: 9, delta: -2, tierBefore: 1, tierAfter: 0 })), { actor: "Bryn", faction: "The Guild", hidden: false, tier: "Known", tierBefore: "Trusted" });
  assert.equal(down.text, "Bryn lost 2 renown with The Guild (now 9, Known). Dropped to Known.");
  const none = M.renownEvent(M.readRenownHook(payload({ before: 3, after: 2, delta: -1, tierBefore: 0, tierAfter: -1 })), { actor: "Bryn", faction: "The Guild", hidden: false, tier: "", tierBefore: "Known" });
  assert.equal(none.text, "Bryn lost 1 renown with The Guild (now 2). No longer Known.");
  const one = M.renownEvent(M.readRenownHook(payload({ before: 4, after: 5, delta: 1, tierBefore: 0, tierAfter: 0 })), { actor: "Bryn", faction: "The Guild", hidden: false, tier: "Known" });
  assert.equal(one.text, "Bryn gained 1 renown with The Guild (now 5, Known).");
  assert.equal(M.renownEvent(M.readRenownHook(payload({ before: 5, after: 5, delta: 0, tierBefore: 0, tierAfter: 0 })), { faction: "x" }), null);
  assert.equal(M.renownEvent(null), null);
});

test("privacy: a hidden faction, or one that couldn't be read, makes the line GM only", () => {
  const p = M.readRenownHook(payload({ factionId: HID }));
  assert.equal(M.renownEvent(p, { actor: "Bryn", faction: "The Shadow Court", hidden: true, tier: "Trusted" }).private, true);
  const unknown = M.renownEvent(p, { actor: "Bryn", faction: "", hidden: false });
  assert.equal(unknown.private, true);
  assert.match(unknown.text, /a faction/);
});

/** A session with one visible and one hidden faction's renown lines. */
function session() {
  const ev = (p, names) => { const e = M.renownEvent(M.readRenownHook(p), names); return M.makeEvent({ ...e, rtText: "19:00" }); };
  const vis = { actor: "Bryn", faction: "The Guild", hidden: false };
  const hid = { actor: "Bryn", faction: "The Shadow Court", hidden: true };
  const events = [
    ev(payload({ before: 10, after: 13, delta: 3, tierBefore: 0, tierAfter: 1 }), { ...vis, tier: "Trusted" }),
    ev(payload({ before: 13, after: 12, delta: -1, tierBefore: 1, tierAfter: 1 }), { ...vis, tier: "Trusted" }),
    ev(payload({ actorId: AID2, before: 0, after: 4, delta: 4, tierBefore: -1, tierAfter: 0 }), { actor: "Ash", faction: "The Guild", hidden: false, tier: "Known" }),
    ev(payload({ factionId: HID, before: 0, after: 5, delta: 5, tierBefore: -1, tierAfter: 0 }), { ...hid, tier: "Known" })
  ];
  return M.normalizeSession({ n: 1, name: "Session 1", startedAt: 1, endedAt: 2, open: false, events });
}

test("summary: Renown list, net per character per faction; hidden factions private", () => {
  const s = session();
  const sum = M.summarize(s);
  assert.deepEqual(sum.renown.map(r => [r.text, r.private]), [
    ["Bryn: +2 with The Guild (now 12, Trusted)", false],
    ["Ash: +4 with The Guild (now 4, Known)", false],
    ["Bryn: +5 with The Shadow Court (now 5, Known)", true]
  ]);
  // The counts (recap, Discord) leave hidden renown lines out.
  assert.equal(sum.counts.renown, 3);
  const html = M.summaryHTML(sum);
  assert.match(html, /<h3>Renown<\/h3><ul><li>Bryn: \+2 with The Guild/);
  assert.match(html, /<section class="secret" id="secret-rb-renown">[\s\S]*Shadow Court/);
});

test("renownTotals: a net-zero row is kept only when the tier changed; capped", () => {
  const ev = (p, tier) => M.makeEvent(M.renownEvent(M.readRenownHook(p), { actor: "A", faction: "F", hidden: false, tier }));
  const flat = [ev(payload({ before: 5, after: 6, tierBefore: 0, tierAfter: 0 }), "K"), ev(payload({ before: 6, after: 5, tierBefore: 0, tierAfter: 0 }), "K")];
  assert.deepEqual(M.renownTotals(flat), []);
  const many = Array.from({ length: M.RENOWN_ROWS_MAX + 20 }, (_, i) => ev(payload({ factionId: `f${i}` }), "K"));
  assert.equal(M.renownTotals(many).length, M.RENOWN_ROWS_MAX);
  assert.deepEqual(M.renownTotals(null), []);
});

test("privacy: hidden-faction renown never reaches the recap, the Discord text or the event hook", () => {
  const s = session();
  s.summary = M.summarize(s);
  const page = M.pageHTML(s);
  assert.match(page, /Shadow Court/); // the GM's own page has it, in secret blocks
  const recap = M.stripForRecap(page);
  assert.doesNotMatch(recap, /Shadow Court/);
  assert.match(recap, /The Guild/);
  const txt = D.summaryText(s.summary, M.TYPES);
  assert.doesNotMatch(txt, /Shadow Court/);
  assert.match(txt, /\*\*Renown\*\*/);
  assert.match(txt, /Bryn: \+2 with The Guild/);
  assert.match(txt, /Renown: 3/);
  const hidden = s.events.find(e => e.private);
  assert.equal(M.eventHookPayload("x", hidden).event.type, "note");
  assert.equal(M.eventHookPayload("x", s.events[0]).event.type, "renown");
  assert.deepEqual(Object.keys(M.eventHookPayload("x", hidden).event).sort(), ["id", "t", "type", "wt"]);
});

test("requests: renown relay is GM only, ids and numbers, schema-checked", () => {
  const rid = n => makeRequestId("abcd1234", n, 1000);
  assert.equal(REQUESTS.renown.from, "gm");
  const ok = readRequest(REQUESTS, { action: "request", kind: "renown", rid: rid(1), data: payload() });
  assert.equal(ok.ok, true, ok.reason);
  assert.equal(readRequest(REQUESTS, { action: "request", kind: "renown", rid: rid(2), data: { ...payload(), name: "x" } }).ok, false);
  assert.equal(readRequest(REQUESTS, { action: "request", kind: "renown", rid: rid(3), data: payload({ actorId: "nope" }) }).ok, false);
  assert.equal(readRequest(REQUESTS, { action: "request", kind: "renown", rid: rid(4), data: payload({ factionId: "bad id" }) }).ok, false);
  assert.equal(readRequest(REQUESTS, { action: "request", kind: "renown", rid: rid(5), data: payload({ delta: 1.5 }) }).ok, false);
  assert.equal(readRequest(REQUESTS, { action: "request", kind: "renown", rid: rid(6), data: { actorId: AID, factionId: FID } }).ok, false);
  // Whatever the reader accepts, the request accepts (the relay sends readRenownHook's output).
  assert.equal(readRequest(REQUESTS, { action: "request", kind: "renown", rid: rid(7), data: M.readRenownHook(payload({ tierBefore: -1, before: 0 })) }).ok, true);
});

test("feature renownEvents: needs the session log, on by default; Renown filter chip; toolkit group", () => {
  const f = Feat.FEATURE_LIST.find(x => x.id === "renownEvents");
  assert.ok(f);
  assert.deepEqual(f.needs, ["sessionLog"]);
  assert.notEqual(f.default, false);
  assert.deepEqual(V.FILTERS.renown, ["renown"]);
  assert.equal(M.groupOf("renown"), "toolkit");
  assert.equal(M.typeOn("renown", ["toolkit"]), false);
});

test("session.mjs: the hook is gated, the leader writes, other GM tabs relay; read-only toolkit use", () => {
  const src = read("scripts/session.mjs");
  assert.match(src, /if \(F\.on\("renownEvents"\)\) Hooks\.on\(M\.TOOLKIT_HOOKS\.renownChanged, onRenownHook\)/);
  assert.match(src, /if \(F\.on\("renownEvents"\)\) L\.handle\("renown"/);
  assert.match(src, /if \(!L\.isLeader\(\)\) \{ if \(game\.user\?\.isGM && openEntry\(\)\) L\.request\("renown"/);
  assert.match(src, /flushRenown\(true\)/);
  // Only reading calls on the toolkit's renown API.
  assert.doesNotMatch(src, /renown\?*\.(award|setScore|addSource|removeSource|track|sync)\b/);
});

test("0.9.0 version", () => {
  assert.equal(JSON.parse(read("module.json")).version, "0.9.0");
  assert.equal(JSON.parse(read("package.json")).version, "0.9.0");
  assert.match(read("module.json"), /releases\/download\/v0\.9\.0\/module\.zip/);
  assert.match(read("CHANGELOG.md"), /^## 0\.9\.0 \(2026-11-08\)[\s\S]*?Untested in Foundry/m);
});
