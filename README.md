# Red Book

A Foundry VTT module (v13 and v14, any game system, extra support for dnd5e) that cuts GM prep. Everything lives in **one window** with a sidebar that looks like Foundry itself, in the light and the dark theme:

- **Session dashboard**: Red Book **writes the session log for you while you play**. See at a glance whether a session is running, add a quick note, filter the timeline, and watch who's at the table (with live hit points on dnd5e).
- **Next-session board**: active quests, the NPCs, journals and scenes they link to, last session's open threads and your own pins, in three columns.
- **Scene check**: a read-only audit of your scenes before the players see them, scene list on the left, findings on the right.
- **Session Start**: pick the scene, activate it, unpause and start the log in one step.
- **Who's online**: a small panel on Hub scenes that says when everyone's here; it can be moved and folded.
- **Session extras**: a *Previously on…* title card for players at Session Start, NPCs met (with remove), a session timer and optional break reminder, attendance with experience or milestones (totals per character), *Gained this session* coin and items, and full dates on every log line, so sessions that run past midnight read correctly.
- **Toolkit and Discord**: quest progress and journeys from Wanderer's Toolkit in the log and the recap, a prep list on the board fed by the scene check, a *Next session* date, an *Open Red Book* key binding, and optional Discord posts (off by default).

Every tool can be turned off. A turned-off tool registers nothing. With **Wanderer's Satchel** installed, Red Book also shows up in its hub (control panel, health check, debug logging).

<!-- screenshot: the Red Book window, Session page -->

## Contents

- [Features](#features)
- [Quick start](#quick-start)
- [How to use: Session log](#session-log)
- [How to use: Next-session board](#next-session-board)
- [How to use: Scene readiness check](#scene-readiness-check)
- [How to use: Session Start](#session-start)
- [How to use: Who's online](#whos-online)
- [Control panel and settings](#the-red-book-window-and-settings)
- [Integrations (toolkit hooks)](#integrations)
- [Discord posts](#discord-posts)
- [Several GMs or several tabs](#several-gms-or-several-tabs)
- [Data Red Book writes, and removing it](#data-red-book-writes-and-removing-it)
- [Public API and hooks](#public-api-and-hooks)
- [License](#license)

## Features

| Tool | Setting | What it does |
|---|---|---|
| Session log | `sessionLog` | Start and end a session; while it's open a GM-only journal fills with a timeline (real and in-world time): scenes activated, combats (combatants, defeated), characters at 0 HP and creatures killed, rests, items and coin gained or lost, world time advanced, journals shown, NPCs met, level-ups, and your quick notes. Ending adds a summary. **Share as recap** makes a player copy you review first. |
| Next-session board | `prepBoard` | One GM window: active quests and their next objectives, the NPCs, journals and scenes those quests link to, open threads and the summary from the last session, and your own pinned documents. |
| Session Start | `sessionStart` | One GM dialog: pick the scene, activate it for players, unpause, and start the session log. |
| Who's online | `whosOnline` | Who's connected, with their character's portrait and name: a small movable panel on scenes you mark Hub, and a window. Says "Everyone's here" and fires hooks for world scripts. |
| Quest events in the log | `questEvents` | (0.5.0; needs the session log) Quests given, completed or failed and objectives ticked become timeline lines, have their own *Quests* list in the summary and so appear in the recap. Hidden quests and hidden objectives are logged as GM-only lines (left out of the recap). A change reported both by the quest's journal and by the toolkit's hook is logged once. |
| Journeys in the log | `journeys` | (0.5.0; needs the session log) The toolkit's hex trips and flights become **Travel** lines (from, to, hours, cost), with a *Travel* filter chip. |
| Prep list from the scene check | `prepList` | (0.5.0; needs the board and the scene check) *Add to the next-session board* on each failed finding and *Add all failures*: a to-do list on the board, grouped by scene, deduped, linking back to the scene. |
| Open Red Book key binding | `openKey` | (0.5.0) A GM key binding that opens the Red Book window. No key is set until you pick one in Configure Controls. |
| Discord posts | `discord` | (0.5.0; **off by default**) Posts to a Discord channel through a webhook: a summary when a session ends, the recap when you share it (optional), the next session's date when you set it. See [Discord posts](#discord-posts). |
| "Previously on…" card | `previously` | (0.6.0; needs the session log) When a session starts (setting *Show "Previously on…" when a session starts*), and when you click **Show to players** on the Session page, players see the last recap you shared as a title card they dismiss. Each browser remembers which recap it has seen; **Preview** shows it to you only. Only the shared recap (player copy) is shown. |
| NPCs met this session | `npcsMet` | (0.6.0; needs the session log) Non-player tokens that appear on the active scene, or on a scene a connected player is viewing, while a session runs are recorded once each (actor id, name, first seen, scene): **Met** lines on the timeline, an *NPCs met* panel on the Session page and an *NPCs met* list in the recap. Hidden tokens count once revealed. Take one out (a hidden ambusher) with its remove button: it leaves the list and the Met line, and isn't added again that session. |
| Session timer and break reminder | `sessionTimer` | (0.6.0; needs the session log) Elapsed time (hours:minutes, from the start timestamp) on the Session page's *Played* tile and live banner. *Remind me to take a break* (off by default) shows a GM-only notification every *N* minutes (default 90). |
| Attendance and experience | `attendance` | (0.6.0; needs the session log) Who was at the table each session (connected players and their characters, added automatically; add or take out by hand) and, by the *Track per session* setting, experience points per character (GM only) or a milestone line (players see it in the recap), or neither. Past sessions shows them per session and totals per character. |
| Gained this session | `gained` | (0.6.0; needs the session log) A *Gained this session* block in the log and the recap: the party's net coin (g/s/c, with what was spent) from Wanderer's Toolkit's coin log within the session's start and end times, or from the log's own item and coin lines when the coin log isn't there, plus reward items of quests completed this session (hidden quests left out). Frozen when the session ends. |
| Scene readiness check | `sceneCheck` | A read-only audit of a scene, a folder or every scene: missing images and sounds, walls and doors, lights, token vision and links, NPC stats, map notes, linked journals, active tile actions and player characters. Each finding has a button that opens the thing to fix. GM only. |

Optional: with **Wanderer's Toolkit** active, its quests feed the board and its quests, objectives, travel, flights and loot rolls are logged too (its map pins are left out of the scene check). With **Monk's Active Tiles** active, tile actions that point at deleted documents are reported.

## Quick start

1. Install from the manifest URL `https://github.com/cocoomg11/red-book/releases/latest/download/module.json` and enable the module.
2. As GM, click the **Red Book** button (open book) in the token controls, or **Game Settings › Configure Settings › Red Book › Open the control panel**. The window opens on the Session page; *Settings › Health* shows what's working.
3. Click **Session Start** (the flag button in the token controls on the left): pick the scene, and Red Book activates it, unpauses and starts the session log. Play. Press **Ctrl+Shift+N** for a quick note.
   To show who's here, open a scene's configuration, go to the **Table Tools** tab and tick **Hub scene**.
4. Click **End session**. Open the log in the *Session Log* journal folder, add anything to its *Notes* page, then click **Share as recap** in the journal's header menu.
5. Before next session, open the **Next-session board** (thumbtack button) and run **Check scene readiness** (clipboard button) on the scenes you'll use.

## Session log

<!-- screenshot: a session log timeline page with its summary -->

- **Start session / End session**: from the Red Book window's Session page, the book button in the token scene controls, or the API. When a GM loads the world with no session open, Red Book asks whether to start one (setting *Ask to start a session on load*).
- Each session is a GM-only journal entry *Session N — date* in the *Session Log* folder, with a **Timeline** page (rebuilt from the recorded data as events come in: don't edit it) and a **Notes** page that is yours.
- **Quick note** (key binding, default Ctrl+Shift+N, change it in Configure Controls): a small box. A note starting with `?` (or ticked *Open thread*) is an **open thread**: it's listed in the summary and on the board until you deal with it. Tick *GM only* (or write `#private`) to keep a note out of recaps.
- What's logged (each group can be turned off under the Session log tab's Advanced section):
  - scenes activated; combats started (combatants) and ended (rounds, defeated);
  - player characters dropping to 0 HP, other creatures dropping to 0 or marked defeated;
  - rests (dnd5e: short and long, on whichever client the rest was taken);
  - items and coin gained or lost on player-owned characters and party (group) actors; a burst of changes (a shop trip, a loot split) becomes one line per actor;
  - world time advanced (small steps such as combat rounds add up until they reach the setting's minimum);
  - journals and pages shown to players;
  - NPCs met: non-player actors with a visible token on the active scene (0.6.0, feature `npcsMet`: or a scene a connected player is viewing) while a player is connected, once per session;
  - level-ups (dnd5e: total level; other systems: `system.details.level` when present);
  - Wanderer's Toolkit: quests given, completed, failed, reopened, objectives ticked, flights and hex travel (from its Travel Log page), finished loot rolls.
- **End session** adds a **summary** at the top: how long you played and how much in-world time passed, counts per kind, notable moments (kills, level-ups, quests, combats) and open threads (GM-only threads in a secret block).
- **Quest events and journeys (0.5.0)**: with the toolkit, quest lines and Travel lines come from its quest journals and its hooks (see [Integrations](#integrations)); each change is logged once. Quest lines get their own *Quests* list in the summary, so they show in the recap (except GM-only ones). The timeline has *Quests* and *Travel* filter chips.
- **Dates and times (0.6.0)**: every line stores its full time (`t` in ms and `at`, an ISO 8601 UTC string). The Red Book window shows each line's time in **your own time zone**, with the date in front of lines from a later day than the session's start and a day separator where the timeline crosses midnight. The session's span reads *Sat 14 Mar, 7:00 PM – Sun 15 Mar, 1:30 AM* on the Session page, Past sessions, the journal page and the recap. The session's name and number keep the start date. Durations and "this session" windows (time played, gained this session, the break reminder) come from timestamps, so they stay right across midnight and daylight-saving changes. The journal page is written by the recording GM's browser, in that GM's time zone. Lines logged before 0.6.0 get a full time on the first GM load: the session's start date plus the line's clock reading, moving to the next day whenever the clock goes backwards. Turn the dates off with *Dates on the timeline* (Advanced).
- **Share as recap** (journal header menu on a session log, or the Red Book window's Past sessions page): shows every list line of the session's pages with a tick box. Untick what players shouldn't see. Red Book then creates or updates a separate journal **Recap: <session name>** in the *Session Recaps* folder that players can observe. Secret blocks, GM-only notes, HTML comments and document links are always left out. The GM log itself is never made visible.

## Next-session board

<!-- screenshot: the board -->

Open it with the thumbtack button in the token controls, the Red Book window's **Board** page or `api.board.open()`. Three columns: quests and the last session; NPCs, journals and scenes; your pins.

- **Active quests** (Wanderer's Toolkit's quest log, when that module is active) with their next unticked objectives.
- **NPCs, Journals, Scenes**: every document linked from those quests (giver, description, objectives), with the quests that link it. Deleted documents are shown struck through.
- **Last session**: its counts, notable moments and open threads.
- **Pinned**: drop actors, journals, pages, scenes, roll tables, items, playlists or macros on it (up to 50). Click × to unpin.
- Click any row to open it. Scenes have **View** and **Check readiness** buttons; *Check all these scenes* checks every scene the quests link to.

## Scene readiness check

<!-- screenshot: the Scene check page -->

Run it from the clipboard button (the viewed scene), the Red Book window's **Scene check** page (scene list on the left with each scene's last result, findings grouped by kind on the right; *Check all*), the Scenes sidebar's right-click menu (*Check readiness*), the board, or `api.sceneCheck.run()`. It **never changes anything**. The whole scene check is **GM only**: players see no button or menu entry, and the API refuses them.

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

**Ignoring a finding.** Each finding has an **Ignore** button (crossed-out eye). An ignored finding stops counting toward that scene's totals and moves into a collapsed **Ignored (n)** list under the scene, where **Un-ignore** brings it back. Ignores are saved on the scene itself (`flags.red-book.ignoredChecks`), so they survive reloads and never affect another scene. Each one is tied to that rule and that one thing: ignoring "no hit points" on one NPC token doesn't hide it on another. An ignore whose finding no longer comes up is kept but not shown. **Clear ignored** (in the scene's section) wipes one scene's list; **Clear all ignored warnings…** (Red Book window, *Tool settings › Scene check*) wipes every scene's after a confirm. GM only.

Files are checked with a HEAD request to your Foundry server, a few at a time, with a time-out (a file that doesn't answer is reported as *couldn't be checked*, not missing), and remembered for five minutes. Files on other websites aren't checked. **Export to journal** writes the results to a GM-only *Scene check* journal (one page per scene, replaced on each export); ignored findings are listed separately, marked *ignored*. Every check can be turned off (Scene check tab, Advanced).

## Session Start

Click the flag button in the token controls (GM), **Session Start…** on the Red Book window's Session page, or `api.sessionStart.open()`. A small window opens.

- Pick the scene from the list (type to search; the one you're viewing is selected). Under **Ready?** tick or untick **Activate it for players**, **Unpause the game** and **Start the session log**. The last one is greyed out when a session is already open, and missing when the session log is turned off.
- **Scenes left out of the list** (Session Start tab): a regular expression, for example `^(Test map|NPC gallery)$`. Matching scenes aren't offered. Blank offers every scene.

## Who's online

- **Hub scenes**: in a scene's configuration, open the **Table Tools** tab and tick **Hub scene (show who's online)** in the Red Book section. Everyone viewing that scene sees a small panel of the players: each one's character portrait and name, greyed out when not connected, plus anyone else online (GMs, players who don't count).
- The panel says **x of y here**, then **Everyone's here** when all the players who count are connected.
- **Who counts** (Who's online tab): every player user, players with an assigned character (default), or only the users you list (Advanced).
- **Moving it**: drag the panel by its header. Each browser keeps its own spot, always on screen. Double-click the header to put it back where the *Panel position* setting says.
- **Folding it**: the arrow button in the header (or Tab to it and press Enter or Space) folds the panel to its header, which still shows the count (for example 3/4). Each browser remembers its choice.
- The Red Book window's **Online** page, its *Open as a window* button (or `api.online.open()`) opens the same board as a window, for anyone.
- **Hooks for world scripts**: `red-book.playerCountChanged` fires whenever the count changes, and `red-book.allPlayersOnline` when everyone's here. They fire on every client, so a script that changes documents should check `game.users.activeGM?.isSelf`. Scripts written for Wanderer's Toolkit keep working: the old names `wayfarers-toolkit.playerCountChanged` / `.allPlayersOnline` fire too, unless the toolkit still has its own Who's online (then the toolkit fires them) or you turn off *Also fire the old hook names*.
- **Moving from Wanderer's Toolkit**: on the GM's first load of 0.3.0, Red Book copies the toolkit's Who's online and Session Start settings and its Hub scene ticks. The toolkit's own data stays as it was. Turn the toolkit's copies of these tools off so you don't get two panels.

## Integrations

Red Book listens to two hooks from **Wanderer's Toolkit** (when a toolkit version that fires them is active; older versions simply don't fire them and Red Book falls back to reading the quest journals and the Travel Log page). Both are fired with `Hooks.callAll` and carry ids and display strings only. Only the recording GM tab logs; another GM tab that hears them sends them on (GM-only, schema-checked requests); players' clients ignore them.

| Hook | Payload | What Red Book does |
|---|---|---|
| `wayfarersToolkit.questUpdated` | `{ questId, change }`: `questId` the quest's JournalEntry id; `change` one of `"started"`, `"completed"`, `"failed"`, `"objective"`, `"updated"`, `"assigned"` | Re-reads the quest (on a GM, the toolkit's API, so hidden objectives are known) and logs what changed since it last read it. A line logged by the journal update within 15 s (same quest, same change, same objective) is not logged again. `updated` and `assigned` log only what the quest data shows changed. Feature `questEvents`. |
| `wayfarersToolkit.journey` | `{ kind: "hex" \| "flight", fromId, toId, fromName, toName, hours, cost: { gp, sp, cp }, partyId }` (names are the strings the toolkit shows the GM) | A **Travel** line: `Flight: A → B, 2 hours, 5 gp.` The toolkit's Travel Log page gets a line for the same trip; when both come within 15 s, the hook's line is kept and the page's line is skipped. Feature `journeys`. |

## Discord posts

Off by default (feature `discord`). Set it up on **Tool settings › Discord**:

1. In Discord: the channel's settings › Integrations › Webhooks › *New Webhook*, then *Copy Webhook URL*. Make a webhook for **one channel** used only for this.
2. Paste it into **Webhook URL**, save, and click **Send test message**.
3. Choose what to post: a summary when a session ends (on), the recap when you share it (off), the next session's date when you set it on the board (on). *Post as* (Advanced) is the name the posts show.

**Honor system.** World settings are sent to every connected browser, so a player who opens the browser console can read the webhook URL and post to that channel. Red Book can't hide it; it's up to your table. Use a webhook for one channel you don't mind, and if the URL leaks, delete the webhook in Discord and make a new one.

Only a GM's browser posts: session-end summaries come from the recording GM tab (one post even with several GMs or tabs); the recap and the next-session date from the GM who clicked. Posts are player-safe (no GM-only notes, private threads or hidden quest lines), never ping anyone, are sent as an embed (plain text if Discord refuses it), queued one at a time and retried when Discord rate-limits. A failed post shows an error to that GM only, without the URL.

**Next session** (board, first column): a date and time field. Saving a new date posts it when *Post the next session's date* is on (as a Discord timestamp, so each reader sees their own time zone); *Post to Discord* posts it again. The date is a world setting (`nextSession`), so players' modules and macros can read it with `api.nextSession()`.

## The Red Book window and settings

The **Red Book** button in the token controls, or Module Settings › Red Book › **Open the control panel**. A sidebar on the left (arrow keys, Home and End move between pages; it becomes a strip in a narrow window):

- **Tools**: **Session** (the start page: running or not, counts, a quick note box, the timeline with filters by kind, newest 100, and *At the table*: the connected players, with each character's hit points on dnd5e), **Board**, **Scene check**, **Online**, **Past sessions** (every session log, with open and share-as-recap).
- **Settings**: **Features** (one switch per tool; reloads), **Tool settings** (pick a tool; Advanced section where it has one), **Health**, **Data** (Debug logging and Remove Red Book data).
- **Open Red Book** key binding (0.5.0, feature `openKey`): Configure Controls › Red Book. No key by default.

The window and every GM tool are GM only. It follows Foundry's light and dark themes.

## Several GMs or several tabs

Exactly one client records and writes: the active GM user's earliest-opened tab. GM tabs find each other over the module socket and ping every two seconds; closing the recording tab hands over at once, a crashed one after two missed pings. Notes typed in another tab, and rests or journal shows on other clients, are sent to the recording tab with a request id so nothing is logged twice. The recording tab checks each request: its shape, a per-user rate limit, and who sent it (as Foundry reports it). For example, a rest is logged only from a user who owns that character. Hooks broadcast to other clients are accepted only from the GM's recording tab, and they carry ids, never the log's text.

Red Book also reads (0.6.0, feature `gained`, GM clients only, read-only) the toolkit's coin log through `game.modules.get("wayfarers-toolkit").api.coinLog.entries()` when it's there: entries `{ at, actorName, delta, reason, undoneAt, undoOf }` within the session's start and end times; undone entries and undo entries are skipped. Anything missing or unexpected means "no coin log" and the session's own coin lines are used instead.

## Data Red Book writes, and removing it

- Journal entries: session logs (`flags.red-book.session`, versioned, at most 1000 events and 500 NPCs met per session), recaps (`flags.red-book.recap`), the *Scene check* report journal (`flags.red-book.reports`). Folders it made carry `flags.red-book.folder`.
- Scenes: the scene check's ignored findings (`flags.red-book.ignoredChecks`: `{ v, entries: [{ key, at, by, name }] }`, at most 500 per scene). Remove Red Book data's *flags* category removes them too.
- A GM-only journal *Red Book data (GM only)* (`flags.red-book.store`: `{ v, pins, migrated, todos }`; ownership None), holding the board's pins (versioned, at most 50) and, from 0.5.0, the prep list (at most 100 items). Before 0.3.0 the pins were in the world setting `boardPins`; the GM's first load moves them and empties the setting.
- Scenes: the Hub scene tick (`flags.red-book.hubScene`).
- 0.6.0: session logs also hold `npcs` (at most 500), `attendance` (at most 50), `awards` (`{ xp: [{ actorId, name, n }], milestone }`) and, once ended, `gained`; each event has `at`. Stored version 2 (older entries are read and rewritten once by the first GM load). One more client setting per browser: `previouslySeen` (the last *Previously on…* card seen).
- World settings under `red-book.*`, including the open session id, `nextSession` (0.5.0: `{ v, at }`, the board's next-session date), the Discord webhook URL and options (0.5.0; readable by players, see [Discord posts](#discord-posts)) and `migrations` (what the one-time carry-over from the toolkit has done). Two client settings per browser: `onlineHudPos` (where you dragged the Who's online panel) and `onlineHudCollapsed` (whether you folded it). Scene-check results shown in the window are kept in that browser tab's memory only, until reload.
- **Remove Red Book data** (Module Settings, or the Red Book window's Data page) shows a dry run with counts and names, then removes only the ticked categories after you type REMOVE.

## Public API and hooks

`game.modules.get("red-book").api`, available from the `ready` hook. A tool's entry is `undefined` while it's turned off. **Stable**: kept across minor versions. **Experimental**: may change in a minor version. While the module is 0.x, treat everything as experimental unless marked stable.

| API | Status |
|---|---|
| (GM only: for other users every `session.*` and `board.*` member warns "GM only" and returns undefined) | |
| `session.start()`, `session.end()`, `session.note(text, { thread, private })`, `session.noteDialog()`, `session.current()`, `session.list()`, `session.get(idOrEntry)`, `session.shareRecap(idOrEntry)` | stable |
| `session.log(type, text, { refs, private })` (add an event from another module), `session.flush()` | experimental |
| `board.open()`, `board.pins()`, `board.pin(uuid)`, `board.unpin(uuid)`, `board.model()`, `board.refresh()`, `board.todos()` (0.5.0: the prep list), `board.doneTodo(id)` (0.5.0) | experimental |
| `discord.post({ title, text, footer })`, `discord.test()` (0.5.0, GM only; undefined while Discord posts are off) | experimental |
| `nextSession()` (0.5.0: the next session's date in ms, 0 when not set; everyone) | experimental |
| `session.edit(sessionId, op)` (0.6.0: `{ op: "unmeet", key }`, `{ op: "attend", userId, present, name?, characterId?, characterName? }`, `{ op: "award", actorId, name?, n }`, `{ op: "milestone", text }`), `session.totals()` (0.6.0: `{ [actorId]: { name, xp, milestones, sessions } }`) | experimental |
| `previously.preview()`, `previously.show()` (0.6.0, GM only; undefined while the card is off) | experimental |
| `sceneCheck.run({ scenes, folder, all })`, `sceneCheck.chooser()`, `sceneCheck.checkOne(scene)`, `sceneCheck.exportReport(results)`, `sceneCheck.facts(scene)`, `sceneCheck.rules`, `sceneCheck.clearCache()`, `sceneCheck.ignored(scene)`, `sceneCheck.ignore(scene, key)`, `sceneCheck.unignore(scene, key)`, `sceneCheck.clearIgnored(scene)`, `sceneCheck.clearAllIgnored({ confirm })`, `sceneCheck.results()` (0.4.0: last result per scene this load), `sceneCheck.open(sceneId)` (0.4.0) (GM only: for other users every member warns "GM only" and returns undefined) | experimental |
| `sessionStart.open()` (GM) | experimental |
| `online.read()`, `online.open()`, `online.refresh()`, `online.resetPosition()`, `online.toggleCollapsed(value?)` (0.4.0; this browser), `online.isHub(scene)`, `online.hooks`, `online.legacyHooks` (everyone) | experimental |
| `panel(page)` (0.4.0: opens the Red Book window on `session`, `board`, `check`, `online`, `past`, `features`, `tools`, `health` or `data`; the old tab names still work), `health()` (returns `[{ title, lines: [{ level, text }] }]`), `cleanup.plan()`, `cleanup.dryRun()`, `cleanup.remove(pick)`, `cleanup.open()` (GM only: for players they warn "GM only" and return undefined) | experimental |
| `features.on(id)`, `features.list()`, `leader()`, `hooks` | experimental |

Hooks (fired with `Hooks.callAll` on every client):

| Hook | Payload | Status |
|---|---|---|
| `red-book.sessionStarted` | `{ session, uuid, n, name }` | stable |
| `red-book.sessionEnded` | `{ session, uuid, name }` (0.3.0: no summary; read `api.session.get(session).summary` on a GM client) | stable |
| `red-book.eventLogged` | `{ session, event: { id, type, t, wt } }` (ids only since 0.3.0; read the event with `api.session.get(session)` on a GM client) | experimental |
| `red-book.recapShared` | `{ session, recap, uuid }` (the GM client that shared it only) | experimental |
| `red-book.playerCountChanged` | `{ online, expected, all, missing, users: [{ id, name, label, active, counts }] }` (each client, from its own view) | experimental |
| `red-book.allPlayersOnline` | same as above (when everyone who counts is here) | experimental |
| `wayfarers-toolkit.playerCountChanged`, `wayfarers-toolkit.allPlayersOnline` | same payloads; fired for old world scripts unless the toolkit provides them or the setting is off | experimental (compatibility) |
| `red-book.leaderChanged` | `{ leader }` (this client only) | experimental |
| `red-book.previouslyOn` | `{ recap, force }` (0.6.0: a recap journal id; each client that can observe it shows the card) | experimental |

## License

[MIT](LICENSE). This is an unofficial fan-made module, not affiliated with or endorsed by Foundry Gaming LLC or any game publisher. It bundles no game content.

## Building from source

Red Book bundles [wanderers-core](https://github.com/cocoomg11/wanderers-core) (0.3.1, including its shared window look) in `vendor/wanderers-core/`, pinned in `wanderers-core.lock.json`. Never edit it by hand. Update it with `node vendor/wanderers-core/vendor.mjs update X.Y.Z`; `npm run verify-core` checks it matches the pin.

`npm test` runs the pure-logic tests with Node's built-in test runner (Node 22); `npm run check` syntax-checks every script; `npm run lint` runs ESLint with core's shared config; `npm run types` runs the JSDoc type check (zero errors). GitHub Actions runs core's shared checks (pin, syntax, lint, types, tests).
