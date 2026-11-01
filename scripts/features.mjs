/**
 * Features: one world setting per tool (pure list; tested in Node). A turned-off tool registers nothing (no hooks, buttons, key
 * bindings, socket handlers or wrappers) and its API entry is undefined. core.mjs binds the list to Foundry (createFeatures). To add
 * a tool, add an entry here and gate its registration with F.on("<id>"). Setting keys (`feature-<id>`) never change.
 */
import { defineFeatures } from "../vendor/wanderers-core/index.mjs";

export const FEATURE_LIST = [
  { id: "sessionLog", label: "Session log", hint: "Start and end sessions; while one is open, a timeline of scenes, combats, downs, rests, loot, time, journals shown, NPCs met, level-ups and your quick notes is kept in a GM-only journal, with a summary and a player recap you review first." },
  { id: "prepBoard", label: "Next-session board", hint: "One GM window with the active quests and their next objectives, the NPCs, journals and scenes they link to, the open threads and summary from the last session, and your own pinned documents." },
  { id: "sceneCheck", label: "Scene readiness check", hint: "A read-only audit of one scene, a folder or every scene: missing images and sounds, walls, lights, token vision and links, NPC stats, map notes, linked journals and player characters. Each finding has a jump-to fix." },
  { id: "sessionStart", label: "Session Start", hint: "One GM dialog to begin the evening: pick the scene, activate it for players, unpause, and start the session log." },
  { id: "whosOnline", label: "Who's online", hint: "A board of who's connected, with their character's portrait and name: a small movable panel on scenes marked Hub, and a window. Says \"Everyone's here\" and fires hooks that world scripts can listen to." }
];

export const FEATURES = defineFeatures(FEATURE_LIST);
export const FEATURE_KEYS = FEATURES.map(f => f.key);
