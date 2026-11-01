/**
 * Health check: read-only, GM only. Built with wanderers-core's healthCollector, so every check is wrapped (a failing check becomes
 * one "warn" line, never throws, never changes anything) and the report has core's shared shape:
 *   [{ title, lines: [{ level: "ok" | "warn" | "bad" | "off" | "info", text }] }]
 */
import { healthCollector } from "../vendor/wanderers-core/index.mjs";
import { sceneTab } from "../vendor/wanderers-core/foundry/index.mjs";
import { ID, TOOLKIT_ID, MATT_ID, toolkitTitle, toolkitHealthText } from "./const.mjs";
import { F, L, get } from "./core.mjs";
import { webhookOk } from "./discord-model.mjs";

export function report(deps = {}) {
  const h = healthCollector();
  h.check(add => {
    const gm = L.activeGM(); const i = L.info();
    if (!gm) add("warn", "No GM is connected: nothing is recorded.");
    else if (gm.id !== game.user.id) add("info", `${gm.name} is the active GM; their earliest open tab records.`);
    else add(i.leader ? "ok" : "info", i.leader ? `This tab records (${i.sessions} tab${i.sessions === 1 ? "" : "s"} of yours open).` : `Another of your tabs records (${i.sessions} open).`);
  });
  h.check(add => add("info", `System: ${game.system.id}${game.system.id === "dnd5e" ? " (rests, NPC stats and level-ups supported)" : " (rests, CR checks and dnd5e level-ups are skipped)"}.`));
  h.check(add => { const on = !!game.modules.get(TOOLKIT_ID)?.active; add(on ? "ok" : "info", toolkitHealthText(on, toolkitTitle())); });
  if (F.on("sessionLog")) h.check(add => {
    const j = deps.session?.openEntry?.();
    add(j ? "ok" : "info", j ? `Session open: ${j.name}.` : "No session is open.");
    const open = game.journal.filter(x => x.flags?.[ID]?.session?.open);
    if (open.length > 1) add("warn", `${open.length} session logs are marked open; only "${j?.name ?? "the one in the setting"}" records. End or delete the others.`);
  });
  if (F.on("prepBoard")) h.check(add => { const s = deps.board?.store?.(); if (s) add(s.ok ? "ok" : "warn", s.text); });
  if (F.on("sceneCheck")) h.check(add => add("info", game.modules.get(MATT_ID)?.active ? "Monk's Active Tiles is active: its tile actions are checked." : "Monk's Active Tiles isn't active: its check is skipped."));
  if (F.on("whosOnline")) h.check(add => {
    const r = deps.online?.read?.(); if (!r) return;
    const hubs = game.scenes.filter(s => deps.online.isHub(s)).map(s => s.name);
    add("info", hubs.length ? `Who's online panel on ${hubs.length} Hub scene${hubs.length === 1 ? "" : "s"}: ${hubs.slice(0, 5).join(", ")}${hubs.length > 5 ? ", …" : ""}.` : "No scene is marked Hub (Scene Configuration › Table Tools): the Who's online panel shows only in its window.");
    if (get("onlineCount") === "list" && !r.expected) add("warn", "Who's online: Only the users listed is chosen, but the list names no user of this world.");
    if (r.unknown?.length) add("warn", `Who's online: no user named ${r.unknown.join(", ")}.`);
    add(r.all ? "ok" : "info", r.expected ? `${r.present} of ${r.expected} players here${r.all ? ": everyone's here" : ""}.` : "No players count towards \"Everyone's here\" yet.");
  });
  if (F.on("whosOnline")) h.check(add => { if (!sceneTab.sections().some(s => s.moduleId === ID)) add("warn", "The Hub scene option isn't in the Table Tools scene tab."); });
  if (F.on("discord")) h.check(add => {
    const url = String(get("discordWebhook") ?? "").trim();
    if (!url) add("warn", "Discord posts are on but no webhook URL is set (Tool settings › Discord).");
    else if (!webhookOk(url)) add("bad", "Discord: the webhook URL doesn't look like a Discord webhook; nothing is posted.");
    else add("info", "Discord posts are on. Honor system: players can read the webhook URL from the browser console.");
  });
  h.check(add => { if (get("debugLog")) add("info", "Debug logging is on."); });
  return h.report();
}

/** The report as flat lines (the control panel's Overview list). */
export const lines = deps => report(deps).flatMap(s => s.lines);
