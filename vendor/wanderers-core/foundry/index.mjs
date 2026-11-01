/**
 * wanderers-core: the Foundry halves. Thin wrappers over Foundry's settings, socket, hooks and documents, each bound to the host
 * module's id (no globals, no shared setting keys, no shared socket channel). Importing this file calls nothing; every function
 * touches `game` only when called. Untested in Node: these need a live world (see CHANGELOG, Untested in Foundry).
 */
export { createLeader } from "./leader.mjs";
export { createFeatures, createSettings, createLogger, getSetting, settingValues, settingDefs } from "./module.mjs";
export { worldDocuments, flaggedDocuments, unsetFlags, resetSettings } from "./cleanup.mjs";
export { sceneTab } from "./scene-tab.mjs";
