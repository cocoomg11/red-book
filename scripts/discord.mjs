/**
 * Discord posts (feature "discord", off by default; markup and limits in discord-model.mjs). Posts go to the GM's webhook (world
 * setting `discordWebhook`) with fetch, from one client only: the leader (the active GM's earliest tab), so several GMs or tabs never
 * post twice. Session end: a short summary; Share as recap: the recap text (optional); the board's Next session date. Every post is
 * an embed first and plain text if Discord refuses the embed; posts are queued one at a time, at least MIN_GAP apart, and a 429
 * answer is waited out and tried again (TRIES). Errors are shown to GMs only (a notification on this GM's client) and never include
 * the URL. Turned off, ready() isn't called and nothing here is registered.
 *
 * Honor system: world settings reach every client, so a player with the browser console can read the webhook URL (README; the
 * setting's hint). Nothing GM-only is ever posted.
 */
import { ID, HOOKS } from "./const.mjs";
import * as D from "./discord-model.mjs";
import { TYPES } from "./session-model.mjs";
import { L, get, warn } from "./core.mjs";

const name = () => String(get("discordName") || "Red Book");
const sleep = ms => new Promise(r => setTimeout(r, ms));
/** GM-only error notice (this client is a GM's: only GM clients post). */
const fail = why => { if (game.user?.isGM) ui.notifications.error(`Red Book: Discord post failed: ${why}.`); };

/** @type {Promise<unknown>} */
let chain = Promise.resolve();
let nextAt = 0;
/**
 * Queues one message ({ title, text, footer }). Resolves to true when Discord took it. `here`: post even when this tab isn't the
 * leader (the GM clicked Send test message here).
 * @param {{ title?: string, text?: string, footer?: string }} msg
 * @param {{ here?: boolean }} [opts]
 */
export function post(msg, { here = false } = {}) {
  const run = async () => {
    if (!game.user?.isGM) return false;
    if (!here && !L.isLeader()) return false;
    const url = D.postUrl(get("discordWebhook"));
    if (!url) { fail(get("discordWebhook") ? "the webhook URL doesn't look like a Discord webhook" : "no webhook URL is set (Red Book › Tool settings › Discord)"); return false; }
    const wait = nextAt - Date.now(); if (wait > 0) await sleep(wait);
    let ok = await send(url, D.embedPayload({ ...msg, username: name() }));
    if (ok === "fallback") ok = await send(url, D.textPayload({ ...msg, username: name() }));
    return ok === true;
  };
  const p = chain.then(run, run);
  chain = p.catch(() => false);
  return p;
}

/** One payload, retried on 429/5xx. Resolves true, false, or "fallback" (a 400: try again as plain text). */
async function send(url, payload) {
  for (let i = 0; i < D.TRIES; i++) {
    /** @type {Response | null} */ let res = null;
    try { res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); } catch (e) { warn("discord post", e); }
    nextAt = Date.now() + D.MIN_GAP;
    if (!res) { fail(D.errorText(0)); return false; }
    const header = n => res?.headers?.get?.(n) ?? null;
    if (res.ok) { nextAt = Date.now() + Math.max(D.MIN_GAP, D.bucketDelay(header)); return true; }
    /** @type {any} */ let body = null; try { body = await res.json(); } catch { }
    if (res.status === 400 && payload.embeds) return "fallback";
    const delay = D.retryDelay(res.status, header, body);
    if (delay === null || i === D.TRIES - 1) { fail(D.errorText(res.status, body)); return false; }
    await sleep(delay);
  }
  return false;
}

/** Send test message (the GM's button): posts from this tab. */
export function test() {
  if (!game.user?.isGM) return Promise.resolve(false);
  return post({ title: "Red Book test message", text: `Webhook set up from ${game.world?.title ?? "this world"}. Session summaries and next-session dates will appear here.` }, { here: true })
    .then(ok => { if (ok) ui.notifications.info("Red Book: test message posted to Discord."); return ok; });
}

/** The "Next session" post (from the board, on the leader or the GM who set it; `force`: the GM's own click). */
export function postNext(at, { force = false } = {}) {
  const when = D.nextText(at); if (!when) return Promise.resolve(false);
  return post({ title: "Next session", text: when, footer: game.world?.title ?? "" }, { here: force });
}

/** Ready (feature on, every client; posts happen on the leader GM only). */
export function ready() {
  if (!game.user?.isGM) return;
  // Session ended: the summary (ids-only hook; the leader reads it from the GM-only journal). Posts on the leader only.
  Hooks.on(HOOKS.sessionEnded, (/** @type {any} */ { session } = {}) => {
    if (!L.isLeader() || get("discordEnd") === false) return;
    const j = game.journal.get(session); const s = j?.flags?.[ID]?.session; if (!s) return;
    const text = D.summaryText(s.summary, TYPES);
    post({ title: `${String(s.name ?? j.name)} ended`, text: text || "Nothing was logged.", footer: game.world?.title ?? "" });
  });
  // Recap shared (fired on the GM's client that shared it): post from there, the recap players can already read.
  Hooks.on(HOOKS.recapShared, (/** @type {any} */ { recap } = {}) => {
    if (get("discordRecap") !== true) return;
    const r = game.journal.get(recap); if (!r) return;
    const html = r.pages.contents.filter(p => p.type === "text").map(p => p.text?.content ?? "").join("\n");
    post({ title: r.name, text: D.htmlToText(html), footer: game.world?.title ?? "" }, { here: true });
  });
}
