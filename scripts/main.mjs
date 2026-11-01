/**
 * Red Book: session log, next-session board and scene readiness check for Foundry VTT (any system; extra dnd5e support).
 * Each tool is a feature that can be turned off (features.mjs); a turned-off tool registers nothing and its API entry is undefined.
 */
import { ID, HOOKS } from "./const.mjs";
import * as F from "./features.mjs";
import * as Settings from "./settings.mjs";
import * as L from "./leader.mjs";
import * as Session from "./session.mjs";
import * as Board from "./board.mjs";
import * as Check from "./check.mjs";
import * as Cleanup from "./cleanup.mjs";
import * as Panel from "./panel.mjs";
import { health } from "./health.mjs";

const deps = { session: Session, board: Board, check: Check, cleanup: Cleanup };

Hooks.once("init", () => {
  F.registerSettings();
  Settings.register();
  game.settings.registerMenu(ID, "panel", { name: "Red Book", label: "Open the control panel", hint: "Health, start/end session, the board, scene checks, every tool's settings and Remove Red Book data.", icon: "fa-solid fa-book", type: Panel.ControlPanel, restricted: true });
  game.settings.registerMenu(ID, "cleanup", { name: "Remove Red Book data", label: "Remove Red Book data", hint: "Dry run first, then removes what Red Book stored in this world.", icon: "fa-solid fa-broom", type: Cleanup.CleanupApp, restricted: true });
  Panel.init(deps); Board.init(deps);
  if (F.on("sessionLog")) Session.registerKeybinding();

  Hooks.on("getSceneControlButtons", controls => {
    if (!game.user.isGM) return;
    const tokens = controls.tokens ?? controls.token; if (!tokens?.tools) return;
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
  if (F.on("sessionLog")) Session.ready();
  if (F.on("prepBoard")) Board.ready();
  const mod = game.modules.get(ID);
  mod.api = {
    get session() { return F.on("sessionLog") ? Session.api : undefined; },
    get board() { return F.on("prepBoard") ? Board.api : undefined; },
    get sceneCheck() { return F.on("sceneCheck") ? Check.api : undefined; },
    panel: tab => Panel.open(tab),
    health: () => health(deps),
    cleanup: Cleanup.api,
    leader: () => L.info(),
    features: { on: F.on, list: () => F.FEATURES.map(f => ({ id: f.id, label: f.label, on: F.on(f.id) })) },
    hooks: { ...HOOKS }
  };
});
