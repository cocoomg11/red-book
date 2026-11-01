/**
 * "Previously on…" (feature "previously"): the Foundry half; the rules are in previously-model.mjs. The leader broadcasts
 * `red-book.previouslyOn` `{ recap, force }` (ids only) when a session starts and when a GM clicks Show; every client that can observe
 * that recap journal and hasn't seen it shows a dismissable title card. GMs get only their own preview. Untested in Node.
 */
import { ID, HOOKS } from "./const.mjs";
import { L, get, set, warn } from "./core.mjs";
import * as M from "./previously-model.mjs";
import { rangeText } from "./time-model.mjs";
import { t } from "./i18n.mjs";
import * as UI from "./ui.mjs";

/** @type {any} */ let deps = {};
export function init(d) { deps = d; }

const labels = () => ({ title: t("Previously.title"), preview: t("Previously.preview"), empty: t("Previously.empty") });
const keyOf = j => M.seenKey(j?.id, j?._stats?.modifiedTime);

/** Shows the card for recap journal `id` on this client (if the rules say so). */
async function show(id, { force = false, preview = false } = {}) {
  const j = game.journal.get(id); if (!j?.flags?.[ID]?.recap) return false;
  const canSee = !!j.testUserPermission?.(game.user, "OBSERVER");
  const key = keyOf(j);
  if (!M.shouldShow({ isGM: !!game.user?.isGM, preview, force, canSee, key, seen: M.normalizeSeen(get("previouslySeen")).key })) return false;
  const page = j.pages.contents.filter(p => p.type === "text").sort((a, b) => a.sort - b.sort)[0];
  let html = "";
  try { html = await UI.TextEditorImpl().enrichHTML(page?.text?.content ?? "", { secrets: false, relativeTo: page }); } catch (e) { warn("previously: enrich", e); }
  // The recap's own first line ("Recap of …") is said by the card's header already.
  html = html.replace(/^\s*<p><em>Recap of[\s\S]*?<\/em><\/p>/i, "");
  const s = deps.session?.dataOf ? (() => { const e = game.journal.get(j.flags[ID].recap.session); return e ? deps.session.dataOf(e) : null; })() : null;
  const range = s?.startedAt && get("logDates") !== false ? rangeText(s.startedAt, s.open ? 0 : s.endedAt) : "";
  const content = M.cardHTML({ name: M.recapTitle(j.name), range, html, preview }, labels());
  if (!preview) { try { await set("previouslySeen", { v: 1, key }); } catch { } }
  await UI.DialogV2().prompt({
    id: `${ID}-previously`, classes: ["rb-previously", UI.WINDOW, ...UI.UI_CLASSES], window: { title: t("Previously.title") }, position: { width: 620 },
    content, ok: { label: t("Previously.dismiss"), icon: "fa-solid fa-check" }, rejectClose: false
  });
  return true;
}

/** GM: the last shared recap's journal, or null. */
const latest = () => deps.session?.lastRecap?.() ?? null;
/** GM: previews the card on this client only. */
export function preview() {
  if (!UI.gmOnly()) return false;
  const r = latest(); if (!r) { ui.notifications.info(`Red Book: ${t("Previously.none")}`); return false; }
  return show(r.id, { preview: true });
}
/** GM: shows the card to the players now (`again`: also to those who saw it). */
export function showPlayers({ again = true } = {}) {
  if (!UI.gmOnly()) return false;
  const r = latest(); if (!r) { ui.notifications.info(`Red Book: ${t("Previously.none")}`); return false; }
  ui.notifications.info(`Red Book: ${t("Previously.sent")}`);
  return L.request("previously", { recap: r.id, force: !!again });
}

/** Ready (feature on): every client listens. */
export function ready() {
  Hooks.on(HOOKS.previouslyOn, p => {
    const id = typeof p?.recap === "string" && /^[A-Za-z0-9]{16}$/.test(p.recap) ? p.recap : "";
    if (id) show(id, { force: p.force === true }).catch(e => warn("previously", e));
  });
}

export const api = { preview, show: showPlayers };
