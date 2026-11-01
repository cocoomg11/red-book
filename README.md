# Red Book

A Foundry VTT module (v13 and v14, any game system, extra support for dnd5e) that cuts GM prep: it **writes the session log for you while you play**, puts **everything you need for next session on one board**, and **checks your scenes before the players see them**.

Every tool can be turned off. A turned-off tool registers nothing.

<!-- screenshot: the control panel Overview tab -->

## Contents

- [Features](#features)
- [Quick start](#quick-start)
- [How to use: Session log](#session-log)
- [How to use: Next-session board](#next-session-board)
- [How to use: Scene readiness check](#scene-readiness-check)
- [Control panel and settings](#control-panel-and-settings)
- [Several GMs or several tabs](#several-gms-or-several-tabs)
- [Data Red Book writes, and removing it](#data-red-book-writes-and-removing-it)
- [Public API and hooks](#public-api-and-hooks)
- [License](#license)

## Features

| Tool | Setting | What it does |
|---|---|---|
| Session log | `sessionLog` | Start and end a session; while it's open a GM-only journal fills with a timeline (real and in-world time): scenes activated, combats (combatants, defeated), characters at 0 HP and creatures killed, rests, items and coin gained or lost, world time advanced, journals shown, NPCs met, level-ups, and your quick notes. Ending adds a summary. **Share as recap** makes a player copy you review first. |
| Next-session board | `prepBoard` | One GM window: active quests and their next objectives, the NPCs, journals and scenes those quests link to, open threads and the summary from the last session, and your own pinned documents. |
| Scene readiness check | `sceneCheck` | A read-only audit of a scene, a folder or every scene: missing images and sounds, walls and doors, lights, token vision and links, NPC stats, map notes, linked journals, active tile actions and player characters. Each finding has a button that opens the thing to fix. GM only. |

Optional: with **Wayfarer's Toolkit** active, its quests feed the board and its quests, objectives, travel, flights and loot rolls are logged too. With **Monk's Active Tiles** active, tile actions that point at deleted documents are reported.

## Quick start

1. Install from the manifest URL `https://github.com/cocoomg11/red-book/releases/latest/download/module.json` and enable the module.
2. As GM, open **Game Settings › Configure Settings › Red Book › Open the control panel**. The Overview tab shows what's working.
3. Click **Start session** (control panel, or the book button in the token controls on the left). Play. Press **Ctrl+Shift+N** for a quick note.
4. Click **End session**. Open the log in the *Session Log* journal folder, add anything to its *Notes* page, then click **Share as recap** in the journal's header menu.
5. Before next session, open the **Next-session board** (thumbtack button) and run **Check scene readiness** (clipboard button) on the scenes you'll use.

## Session log

<!-- screenshot: a session log timeline page with its summary -->

- **Start session / End session**: from the control panel's Overview, the book button in the token scene controls, or the API. When a GM loads the world with no session open, Red Book asks whether to start one (setting *Ask to start a session on load*).
- Each session is a GM-only journal entry *Session N — date* in the *Session Log* folder, with a **Timeline** page (rebuilt from the recorded data as events come in: don't edit it) and a **Notes** page that is yours.
- **Quick note** (key binding, default Ctrl+Shift+N, change it in Configure Controls): a small box. A note starting with `?` (or ticked *Open thread*) is an **open thread**: it's listed in the summary and on the board until you deal with it. Tick *GM only* (or write `#private`) to keep a note out of recaps.
- What's logged (each group can be turned off under the Session log tab's Advanced section):
  - scenes activated; combats started (combatants) and ended (rounds, defeated);
  - player characters dropping to 0 HP, other creatures dropping to 0 or marked defeated;
  - rests (dnd5e: short and long, on whichever client the rest was taken);
  - items and coin gained or lost on player-owned characters and party (group) actors; a burst of changes (a shop trip, a loot split) becomes one line per actor;
  - world time advanced (small steps such as combat rounds add up until they reach the setting's minimum);
  - journals and pages shown to players;
  - NPCs met: non-player actors with a visible token on the active scene while a player is connected, once per session;
  - level-ups (dnd5e: total level; other systems: `system.details.level` when present);
  - Wayfarer's Toolkit: quests given, completed, failed, reopened, objectives ticked, flights and hex travel (from its Travel Log page), finished loot rolls.
- **End session** adds a **summary** at the top: how long you played and how much in-world time passed, counts per kind, notable moments (kills, level-ups, quests, combats) and open threads (GM-only threads in a secret block).
- **Share as recap** (journal header menu on a session log, or the control panel for the latest session): shows every list line of the session's pages with a tick box. Untick what players shouldn't see. Red Book then creates or updates a separate journal **Recap: <session name>** in the *Session Recaps* folder that players can observe. Secret blocks, GM-only notes, HTML comments and document links are always left out. The GM log itself is never made visible.

## Next-session board

<!-- screenshot: the board -->

Open it with the thumbtack button in the token controls, the control panel or `api.board.open()`.

- **Active quests** (Wayfarer's Toolkit's quest log, when that module is active) with their next unticked objectives.
- **NPCs, Journals, Scenes**: every document linked from those quests (giver, description, objectives), with the quests that link it. Deleted documents are shown struck through.
- **Last session**: its counts, notable moments and open threads.
- **Pinned**: drop actors, journals, pages, scenes, roll tables, items, playlists or macros on it (up to 50). Click × to unpin.
- Click any row to open it. Scenes have **View** and **Check readiness** buttons; *Check all these scenes* checks every scene the quests link to.

## Scene readiness check

<!-- screenshot: the results window -->

Run it from the clipboard button (the viewed scene), the control panel (*Check scenes…*: the viewed scene, one scene, a folder or every scene), the Scenes sidebar's right-click menu (*Check readiness*), the board, or `api.sceneCheck.run()`. It **never changes anything**. The whole scene check is **GM only**: players see no button or menu entry, and the API refuses them.

| Check | Severity |
|---|---|
| Background image set and loads | problem if it doesn't load, warning if missing on a battle map |
| Grid on a battle map | note |
| Walls on battle maps (scenes named like *title/backdrop/theatre*, gridless scenes, and empty scenes without token vision are treated as theatre of the mind) | warning |
| Doors when there are many walls | note |
| Dark scene with no lights and no global light | warning |
| Player character tokens have vision (when the scene uses token vision) | warning |
| Token actor exists | problem |
| Player character tokens linked; one linked NPC used by several tokens | warning |
| Token images load | problem |
| dnd5e NPCs: hit points above 0, a challenge rating | warning / note |
| Ambient sounds and the scene playlist (and its sound files) exist and load | problem |
| Tile, drawing and map-note images load | problem / warning |
| Map notes link to journals and pages that exist | problem / note |
| Monk's Active Tiles actions point at existing documents | problem |
| The scene's linked journal (and page) exists | problem |
| Connected players have a character assigned | warning |

**Ignoring a finding.** Each finding has an **Ignore** button (crossed-out eye). An ignored finding stops counting toward that scene's totals and moves into a collapsed **Ignored (n)** list under the scene, where **Un-ignore** brings it back. Ignores are saved on the scene itself (`flags.red-book.ignoredChecks`), so they survive reloads and never affect another scene. Each one is tied to that rule and that one thing: ignoring "no hit points" on one NPC token doesn't hide it on another. An ignore whose finding no longer comes up is kept but not shown. **Clear ignored** (in the scene's section) wipes one scene's list; **Clear all ignored warnings…** (control panel, Scene check tab) wipes every scene's after a confirm. GM only.

Files are checked with a HEAD request to your Foundry server, a few at a time, with a time-out (a file that doesn't answer is reported as *couldn't be checked*, not missing), and remembered for five minutes. Files on other websites aren't checked. **Export to journal** writes the results to a GM-only *Scene check* journal (one page per scene, replaced on each export); ignored findings are listed separately, marked *ignored*. Every check can be turned off (Scene check tab, Advanced).

## Control panel and settings

Module Settings › Red Book › **Open the control panel**. Tabs: Overview (health and the main buttons), Features (one switch per tool; reloads), Session log, Next-session board, Scene check (each with an Advanced section), Data (Debug logging and Remove Red Book data).

## Several GMs or several tabs

Exactly one client records and writes: the active GM user's earliest-opened tab. GM tabs find each other over the module socket and ping every two seconds; closing the recording tab hands over at once, a crashed one after two missed pings. Notes typed in another tab, and rests or journal shows on other clients, are sent to the recording tab with a request id so nothing is logged twice.

## Data Red Book writes, and removing it

- Journal entries: session logs (`flags.red-book.session`, versioned, at most 1000 events and 500 NPCs met per session), recaps (`flags.red-book.recap`), the *Scene check* report journal (`flags.red-book.reports`). Folders it made carry `flags.red-book.folder`.
- Scenes: the scene check's ignored findings (`flags.red-book.ignoredChecks`: `{ v, entries: [{ key, at, by, name }] }`, at most 500 per scene). Remove Red Book data's *flags* category removes them too.
- World settings under `red-book.*`, including the pinned list (`boardPins`, versioned, at most 50) and the open session id.
- **Remove Red Book data** (Module Settings, or the control panel's Data tab) shows a dry run with counts and names, then removes only the ticked categories after you type REMOVE.

## Public API and hooks

`game.modules.get("red-book").api`, available from the `ready` hook. A tool's entry is `undefined` while it's turned off. **Stable**: kept across minor versions. **Experimental**: may change in a minor version. While the module is 0.x, treat everything as experimental unless marked stable.

| API | Status |
|---|---|
| `session.start()`, `session.end()`, `session.note(text, { thread, private })`, `session.noteDialog()`, `session.current()`, `session.list()`, `session.get(idOrEntry)`, `session.shareRecap(idOrEntry)` | stable |
| `session.log(type, text, { refs, private })` (add an event from another module), `session.flush()` | experimental |
| `board.open()`, `board.pins()`, `board.pin(uuid)`, `board.unpin(uuid)`, `board.model()`, `board.refresh()` | experimental |
| `sceneCheck.run({ scenes, folder, all })`, `sceneCheck.chooser()`, `sceneCheck.checkOne(scene)`, `sceneCheck.exportReport(results)`, `sceneCheck.facts(scene)`, `sceneCheck.rules`, `sceneCheck.clearCache()`, `sceneCheck.ignored(scene)`, `sceneCheck.ignore(scene, key)`, `sceneCheck.unignore(scene, key)`, `sceneCheck.clearIgnored(scene)`, `sceneCheck.clearAllIgnored({ confirm })` (GM only: for other users every member warns "GM only" and returns undefined) | experimental |
| `panel(tab)`, `health()`, `cleanup.plan()`, `cleanup.dryRun()`, `cleanup.remove(pick)`, `cleanup.open()`, `features.on(id)`, `features.list()`, `leader()`, `hooks` | experimental |

Hooks (fired with `Hooks.callAll` on every client):

| Hook | Payload | Status |
|---|---|---|
| `red-book.sessionStarted` | `{ session, uuid, n, name }` | stable |
| `red-book.sessionEnded` | `{ session, uuid, name, summary }` | stable |
| `red-book.eventLogged` | `{ session, event }` | experimental |
| `red-book.recapShared` | `{ session, recap, uuid }` (GM client only) | experimental |
| `red-book.leaderChanged` | `{ leader }` (this client only) | experimental |

## License

[MIT](LICENSE). This is an unofficial fan-made module, not affiliated with or endorsed by Foundry Gaming LLC or any game publisher. It bundles no game content.

## Building from source

`npm test` runs the pure-logic tests with Node's built-in test runner (Node 22, nothing to install); `npm run check` syntax-checks every script. Both run on GitHub Actions.
