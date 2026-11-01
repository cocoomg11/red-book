/**
 * The one place that binds wanderers-core (vendor/wanderers-core, pinned in wanderers-core.lock.json) to Red Book: the feature
 * registry, the settings table, debug logging and the one-writer leader with its schema-checked socket requests and broadcast hooks.
 * Importing this file calls nothing in Foundry; each object touches `game` only when used.
 */
import { createFeatures, createSettings, createLogger, createLeader } from "../vendor/wanderers-core/foundry/index.mjs";
import { ID, HOOKS } from "./const.mjs";
import { FEATURE_LIST } from "./features.mjs";
import { SETTINGS } from "./settings-model.mjs";
import { REQUESTS } from "./requests.mjs";

export const F = createFeatures(ID, FEATURE_LIST, { title: "Red Book" });
export const S = createSettings(ID, [...SETTINGS]);
export const { log, warn, debugOn } = createLogger(ID);
export const get = S.get;
export const set = S.set;

/** Hooks the leader may broadcast to every client (core refuses any other name, and other clients accept them only from the leader). */
export const BROADCAST = [HOOKS.sessionStarted, HOOKS.sessionEnded, HOOKS.eventLogged, HOOKS.previouslyOn];

export const L = createLeader({ id: ID, log, requests: REQUESTS, hooks: BROADCAST, leaderHook: HOOKS.leaderChanged });
