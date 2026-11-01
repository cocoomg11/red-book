/**
 * Red Book: session log, next-session board, scene readiness check, Session Start and Who's online for Foundry VTT (any system;
 * extra dnd5e support). Built on wanderers-core (vendor/wanderers-core): features, settings, logging and the one-writer leader come
 * from core.mjs. Each tool is a feature that can be turned off; a turned-off tool registers nothing and its API entry is undefined.
 */
import { ID, HOOKS } from "./const.mjs";
import { F, S, L, get, warn } from "./core.mjs";
import { normalizeNext } from "./board-model.mjs";
import { gateApi } from "./check-model.mjs";
import * as Session from "./session.mjs";
import * as Board from "./board.mjs";
import * as Check from "./check.mjs";
import * as Cleanup from "./cleanup.mjs";
import * as Panel from "./panel.mjs";
import * as Start from "./start.mjs";
import * as Online from "./online.mjs";
import * as Migrate from "./migrate.mjs";
import * as Discord from "./discord.mjs";
import { report } from "./health.mjs";
import { registration, registerWith, SATCHEL_ID } from "./satchel-model.mjs";
import { RECORDS } from "./settings-model.mjs";

const deps = { session: Session, board: Board, check: Check, cleanup: Cleanup, online: Online, start: Start, discord: Discord };

/** The Discord API (GM only; players get "GM only" and undefined). */
const DiscordApi = gateApi({ post: msg => Discord.post(msg ?? {}, { here: true }), test: () => Discord.test() }, () => !!game.user?.isGM, () => ui.notifications.warn("Red Book: GM only."));

Hooks.once("init", () => {
  F.register();
  S.register();
  game.settings.registerMenu(ID, "panel", { name: "Red Book", label: "Open the control panel", hint: "Health, start/end session, the board, scene checks, every tool's settings and Remove Red Book data.", icon: "fa-solid fa-book", type: Panel.ControlPanel, restricted: true });
  game.settings.registerMenu(ID, "cleanup", { name: "Remove Red Book data", label: "Remove Red Book data", hint: "Dry run first, then removes what Red Book stored in this world.", icon: "fa-solid fa-broom", type: Cleanup.CleanupApp, restricted: true });
  Panel.init(deps); Board.init(deps); Start.init(deps);
  if (F.on("sessionLog")) Session.registerKeybinding();
  if (F.on("whosOnline")) Online.init();
  // 0.5.0: Open Red Book (GM). No default key: the GM picks one in Configure Controls.
  if (F.on("openKey")) game.keybindings.register(ID, "openRedBook", {
    name: "Open Red Book", hint: "Opens the Red Book window (GM).", editable: [], restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL, onDown: () => { Panel.open(); return true; }
  });

  Hooks.on("getSceneControlButtons", controls => {
    if (!game.user.isGM) return;
    const tokens = controls.tokens ?? controls.token; if (!tokens?.tools) return;
    tokens.tools.rbApp = { name: "rbApp", title: "Red Book", icon: "fa-solid fa-book-open-reader", order: 118, button: true, visible: true, onChange: () => Panel.open() };
    if (F.on("sessionStart")) tokens.tools.rbStart = { name: "rbStart", title: "Session Start", icon: "fa-solid fa-flag-checkered", order: 119, button: true, visible: true, onChange: () => Start.open() };
    if (F.on("sessionLog")) Session.controls(tokens.tools);
    if (F.on("prepBoard")) tokens.tools.rbBoard = { name: "rbBoard", title: "Next-session board", icon: "fa-solid fa-thumbtack", order: 122, button: true, visible: true, onChange: () => Board.open() };
    if (F.on("sceneCheck")) tokens.tools.rbCheck = { name: "rbCheck", title: "Check scene readiness", icon: "fa-solid fa-clipboard-check", order: 123, button: true, visible: true, onChange: () => Check.run({}) };
  });
  if (F.on("sessionLog")) {
    Hooks.on("getHeaderControlsJournalEntrySheet", (app, controls) => Session.headerControls(app, controls));
    const rerender = () => ui.controls?.render?.({ reset: true });
    Hooks.on(HOOKS.sessionStarted, rerender); Hooks.on(HOOKS.sessionEnded, rerender);
  }
  if (F.on("sceneCheck")) Hooks.on("getSceneContextOptions", (app, options) => Check.contextOptions(options));
});

Hooks.once("ready", () => {
  L.start();
  Panel.ready();
  if (F.on("sessionLog")) Session.ready();
  if (F.on("prepBoard")) Board.ready();
  if (F.on("discord")) Discord.ready();
  if (F.on("whosOnline")) Migrate.clientPosition().finally(() => Online.ready());
  // One-time GM work on the leader, after the GM tabs have found each other: carry over the toolkit's settings and Hub flags, and
  // move the board pins out of the world setting into the GM-only store.
  L.onLeader(() => { Migrate.run({ online: F.on("whosOnline"), start: F.on("sessionStart"), pins: F.on("prepBoard") }); });
  const gm = () => !!game.user?.isGM;
  const deny = () => ui.notifications.warn("Red Book: GM only.");
  game.modules.get(ID).api = {
    get session() { return F.on("sessionLog") ? Session.api : undefined; },
    get board() { return F.on("prepBoard") ? Board.api : undefined; },
    get sceneCheck() { return F.on("sceneCheck") ? Check.api : undefined; },
    get sessionStart() { return F.on("sessionStart") ? Start.api : undefined; },
    get online() { return F.on("whosOnline") ? Online.api : undefined; },
    /** Experimental (0.5.0), GM only: post a message ({ title, text, footer }) or the test message to the Discord webhook. */
    get discord() { return F.on("discord") ? DiscordApi : undefined; },
    /** 0.5.0: the next session's date (ms, 0 = not set); readable by everyone (it's a world setting). */
    nextSession: () => normalizeNext(get("nextSession")).at,
    /** GM only: opens the Red Book window, on a page (session, board, check, online, past, features, tools, health, data) or an old tab name. */
    panel: page => Panel.open(page),
    /** GM only: the read-only health report ([{ title, lines }]); undefined for players. */
    health: () => { if (!gm()) { deny(); return undefined; } return report(deps); },
    get cleanup() { return Cleanup.api; },
    leader: () => L.info(),
    features: { on: F.on, list: () => F.list() },
    hooks: { ...HOOKS }
  };
  // Wanderer's Satchel (optional GM hub): register when it's active. Its calls run on a GM's client only.
  registerWith(registration({
    id: ID, title: "Red Book", openPanel: () => Panel.open(), health: () => report(deps), records: RECORDS, debugKey: "debugLog"
  }), {
    active: () => !!game.modules.get(SATCHEL_ID)?.active, api: () => game.modules.get(SATCHEL_ID)?.api,
    once: (h, fn) => Hooks.once(h, fn), warn: (m, e) => warn(m, e)
  });
});
