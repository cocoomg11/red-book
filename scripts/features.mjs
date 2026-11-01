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
  { id: "whosOnline", label: "Who's online", hint: "A board of who's connected, with their character's portrait and name: a small movable panel on scenes marked Hub, and a window. Says \"Everyone's here\" and fires hooks that world scripts can listen to." },
  // 0.5.0
  { id: "questEvents", label: "Quest events in the log", hint: "While a session is open, quests given, completed or failed and objectives ticked (from the companion toolkit) become timeline lines and show in the summary and the recap. Each change is logged once, even when the toolkit reports it twice.", needs: ["sessionLog"] },
  { id: "journeys", label: "Journeys in the log", hint: "While a session is open, the companion toolkit's hex trips and flights become Travel lines on the timeline (from, to, hours and cost), with their own filter.", needs: ["sessionLog"] },
  { id: "prepList", label: "Prep list from the scene check", hint: "Send failed scene-check findings to the next-session board (one at a time or all failures of a scene), as a to-do list that links back to each scene.", needs: ["prepBoard", "sceneCheck"] },
  { id: "openKey", label: "Open Red Book key binding", hint: "A key binding (Configure Controls › Red Book, GM only) that opens the Red Book window. No key is set until you pick one." },
  { id: "discord", label: "Discord posts", default: false, hint: "Off by default. Post the session recap when a session ends and the next session's date to a Discord channel through a webhook you set up. Only a GM's browser posts. Players can read world settings from the browser console, so the webhook URL is on the honor system." }
];

export const FEATURES = defineFeatures(FEATURE_LIST);
export const FEATURE_KEYS = FEATURES.map(f => f.key);
