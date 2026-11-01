/**
 * Red Book: session log, next-session board, scene readiness check, Session Start and Who's online for Foundry VTT (any system;
 * extra dnd5e support). Built on wanderers-core (vendor/wanderers-core): features, settings, logging and the one-writer leader come
 * from core.mjs. Each tool is a feature that can be turned off; a turned-off tool registers nothing and its API entry is undefined.
 */
import { ID, HOOKS } from "./const.mjs";
import { F, S, L } from "./core.mjs";
import * as Session from "./session.mjs";
import * as Board from "./board.mjs";
import * as Check from "./check.mjs";
import * as Cleanup from "./cleanup.mjs";
import * as Panel from "./panel.mjs";
import * as Start from "./start.mjs";
import * as Online from "./online.mjs";
import * as Migrate from "./migrate.mjs";
import { report } from "./health.mjs";

const deps = { session: Session, board: Board, check: Check, cleanup: Cleanup, online: Online, start: Start };

Hooks.once("init", () => {
  F.register();
  S.register();
  game.settings.registerMenu(ID, "panel", { name: "Red Book", label: "Open the control panel", hint: "Health, start/end session, the board, scene checks, every tool's settings and Remove Red Book data.", icon: "fa-solid fa-book", type: Panel.ControlPanel, restricted: true });
  game.settings.registerMenu(ID, "cleanup", { name: "Remove Red Book data", label: "Remove Red Book data", hint: "Dry run first, then removes what Red Book stored in this world.", icon: "fa-solid fa-broom", type: Cleanup.CleanupApp, restricted: true });
  Panel.init(deps); Board.init(deps); Start.init(deps);
  if (F.on("sessionLog")) Session.registerKeybinding();
  if (F.on("whosOnline")) Online.init();

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
    /** GM only: opens the Red Book window, on a page (session, board, check, online, past, features, tools, health, data) or an old tab name. */
    panel: page => Panel.open(page),
    /** GM only: the read-only health report ([{ title, lines }]); undefined for players. */
    health: () => { if (!gm()) { deny(); return undefined; } return report(deps); },
    get cleanup() { return Cleanup.api; },
    leader: () => L.info(),
    features: { on: F.on, list: () => F.list() },
    hooks: { ...HOOKS }
  };
});
