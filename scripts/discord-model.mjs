/**
 * Discord posts (feature "discord", off by default): the pure part (no Foundry calls; tested in Node). discord.mjs reads the world
 * and posts these payloads to the GM's webhook with fetch. Payloads never ping anyone (`allowed_mentions: { parse: [] }`), carry
 * player-safe text only (no secret blocks, no GM-only notes or quest lines) and stay inside Discord's limits.
 *
 * The webhook URL is a world setting: every client receives world settings, so a player with the browser console can read it. That
 * is on the honour system (README, the setting's hint); a webhook made for one channel limits what a leaked URL can do.
 */
import { plain } from "./const.mjs";
import { durationText, stripSecrets } from "./session-model.mjs";

/** Discord's limits: message content, embed title, embed description, footer. */
export const LIMITS = Object.freeze({ content: 2000, title: 256, description: 4096, footer: 2048, username: 80 });
/** Embed colour (a muted red). */
export const COLOR = 0x9b2c2c;
/** Posts in a row at most this often (ms), on top of Discord's own rate-limit answers. */
export const MIN_GAP = 1000;
/** A rate-limited post is tried at most this many times. */
export const TRIES = 3;

const WEBHOOK = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/(?:v\d{1,2}\/)?webhooks\/\d{5,30}\/[A-Za-z0-9_-]{20,200}\/?(?:\?thread_id=\d{5,30})?$/;
/**
 * Whether `url` looks like a Discord webhook URL (https, discord.com or discordapp.com, /api/webhooks/<id>/<token>, an optional
 * thread_id). Anything else is never fetched.
 * @param {unknown} url
 */
export const webhookOk = url => WEBHOOK.test(String(url ?? "").trim());

/** The URL to post to: `wait=true` so Discord answers with errors instead of 204, keeping a thread_id. "" when the URL is no good. */
export function postUrl(url) {
  const u = String(url ?? "").trim(); if (!webhookOk(u)) return "";
  return `${u}${u.includes("?") ? "&" : "?"}wait=true`;
}

/** Clips text to `n` characters (with an ellipsis). */
export function clip(s, n) {
  const t = String(s ?? "");
  return t.length <= n ? t : `${t.slice(0, Math.max(0, n - 1)).trimEnd()}…`;
}
/** Escapes Discord markdown in plain text (names, quest titles), so it shows as typed. */
export const md = s => String(s ?? "").replace(/([\\*_~`|>#[\]()-])/g, "\\$1");

/**
 * A journal page's HTML as Discord text: secret blocks dropped, headings bold, list items as bullets, paragraphs as lines, @UUID
 * links as their label, everything else plain text (escaped for markdown).
 * @param {string} html
 */
export function htmlToText(html = "") {
  // 0.7.0: screen-reader-only text (core item slots: the quality word) is left out of the plain text.
  let s = stripSecrets(String(html ?? "")).replace(/<!--[\s\S]*?-->/g, "").replace(/<span class="wc-sr">[^<]*<\/span>/g, "");
  s = s.replace(/@UUID\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/@UUID\[[^\]]*\]/g, "");
  /** @type {string[]} */ const out = [];
  const re = /<(h[1-6]|li|p)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(s))) {
    const text = md(plain(m[2])); if (!text) continue;
    const tag = m[1].toLowerCase();
    out.push(tag === "li" ? `• ${text}` : tag.startsWith("h") ? `\n**${text}**` : text);
  }
  if (!out.length) { const p = md(plain(s)); if (p) out.push(p); }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * The text posted when a session ends: how long it ran, the counts, notable moments, quest progress and open threads, all player-safe
 * (private notes, GM-only quest lines and private threads left out). `sum`: session-model summarize(); `labels`: { type: label }.
 * @param {any} sum
 * @param {Record<string, { label: string }>} [labels]
 */
export function summaryText(sum, labels = {}) {
  if (!sum || typeof sum !== "object") return "";
  const lines = [];
  const length = [sum.realMs ? `Played ${durationText(Math.round(sum.realMs / 1000))}` : "", sum.worldSeconds ? `in-world ${durationText(sum.worldSeconds)}` : ""].filter(Boolean).join(", ");
  if (length) lines.push(`${length}.`);
  const skip = new Set(["note", "session"]);
  const counts = Object.entries(sum.counts ?? {}).filter(([k, n]) => n && !skip.has(k)).map(([k, n]) => `${md(labels[k]?.label ?? k)}: ${n}`);
  if (counts.length) lines.push(counts.join(" · "));
  const quests = (Array.isArray(sum.quests) ? sum.quests : []).filter(q => q && !q.private).map(q => String(q.text));
  const questSet = new Set(quests);
  const notable = (sum.notable ?? []).filter(x => !questSet.has(x));
  if (notable.length) lines.push("", "**Notable moments**", ...notable.slice(0, 10).map(x => `• ${md(x)}`));
  if (quests.length) lines.push("", "**Quests**", ...quests.slice(0, 15).map(x => `• ${md(x)}`));
  // 0.9.0: renown with visible factions only (hidden factions' rows are private).
  const renown = (Array.isArray(sum.renown) ? sum.renown : []).filter(r => r && !r.private).map(r => String(r.text));
  if (renown.length) lines.push("", "**Renown**", ...renown.slice(0, 15).map(x => `• ${md(x)}`));
  const threads = (sum.threads ?? []).filter(x => x && !x.private).map(x => String(x.text));
  if (threads.length) lines.push("", "**Open threads**", ...threads.slice(0, 10).map(x => `• ${md(x)}`));
  return lines.join("\n").trim();
}

/**
 * The "Next session" text with Discord timestamps (each reader sees their own time zone): full date and time, and "in 3 days".
 * @param {number} ms
 */
export function nextText(ms) {
  const s = Math.floor(Number(ms) / 1000);
  return Number.isFinite(s) && s > 0 ? `<t:${s}:F> (<t:${s}:R>)` : "";
}

/**
 * An embed message. `opts`: { title, text, footer, username }. Text over the embed limit is clipped.
 * @param {{ title?: string, text?: string, footer?: string, username?: string }} opts
 */
export function embedPayload({ title = "", text = "", footer = "", username = "" } = {}) {
  /** @type {any} */ const embed = { color: COLOR };
  if (title) embed.title = clip(title, LIMITS.title);
  if (text) embed.description = clip(text, LIMITS.description);
  if (footer) embed.footer = { text: clip(footer, LIMITS.footer) };
  /** @type {any} */ const p = { allowed_mentions: { parse: [] }, embeds: [embed] };
  if (username) p.username = clip(username, LIMITS.username);
  return p;
}
/**
 * The same message as plain text (the fallback when an embed is refused): bold title, then the text, within the content limit.
 * @param {{ title?: string, text?: string, footer?: string, username?: string }} opts
 */
export function textPayload({ title = "", text = "", footer = "", username = "" } = {}) {
  const body = [title ? `**${title}**` : "", text, footer ? `-# ${footer}` : ""].filter(Boolean).join("\n");
  /** @type {any} */ const p = { allowed_mentions: { parse: [] }, content: clip(body, LIMITS.content) };
  if (username) p.username = clip(username, LIMITS.username);
  return p;
}

/**
 * How long to wait before trying a post again, in ms, or null when it shouldn't be retried. A 429 answer gives `retry_after`
 * (seconds) in its JSON body or a Retry-After header; 5xx answers wait a little. `header(name)` reads a response header.
 * @param {number} status
 * @param {(name: string) => string | null | undefined} [header]
 * @param {any} [body]
 */
export function retryDelay(status, header = () => null, body = null) {
  if (status === 429) {
    const s = Number(body?.retry_after ?? header("retry-after") ?? header("x-ratelimit-reset-after"));
    return Math.min(60000, Math.max(250, Math.ceil((Number.isFinite(s) && s > 0 ? s : 2) * 1000)));
  }
  if (status >= 500 && status < 600) return 2000;
  return null;
}
/**
 * How long to wait before the next post (ms) from the rate-limit headers of a good answer: when this was the bucket's last post,
 * the reset time; else 0.
 * @param {(name: string) => string | null | undefined} [header]
 */
export function bucketDelay(header = () => null) {
  const left = Number(header("x-ratelimit-remaining"));
  const after = Number(header("x-ratelimit-reset-after"));
  return left === 0 && Number.isFinite(after) && after > 0 ? Math.min(60000, Math.ceil(after * 1000)) : 0;
}

/** A short reason for the GM (status code and Discord's message, never the URL). */
export function errorText(status, body) {
  const msg = body && typeof body === "object" && typeof body.message === "string" ? `: ${clip(body.message, 200)}` : "";
  if (status === 401 || status === 404) return `the webhook wasn't found (${status}); it may have been deleted`;
  if (status === 0) return "Discord couldn't be reached";
  return `Discord answered ${status}${msg}`;
}
