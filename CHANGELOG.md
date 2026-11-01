# Changelog

## 0.3.0 (2026-11-01)

### Added
- **Session Start** (new tool, can be turned off): one GM dialog to begin the evening. Pick the scene, activate it for players, unpause, and start the session log. Scenes matching *Scenes left out of the list* (a regular expression) aren't offered. Token controls (flag button), control panel, or `api.sessionStart.open()`. No recap is posted.
- **Who's online** (new tool, can be turned off): who's connected, with each player's character portrait and name. A small panel shows on scenes marked **Hub scene** (Scene Configuration › *Table Tools* tab › Red Book). Everyone can drag it by its title, and double-click puts it back. There's also a window from the control panel or `api.online.open()`. It says "Everyone's here" when all the players who count are connected, and fires `red-book.playerCountChanged` and `red-book.allPlayersOnline`.
- Both tools came from Wayfarer's Toolkit. On the first GM load, Red Book copies the toolkit's settings for them (who counts, the list of users, panel position, dragging, hidden scenes) and marks the toolkit's Hub scenes as Red Book Hub scenes. The toolkit's own data isn't changed or deleted. Each browser's dragged panel spot comes over too.
- **Old hook names still fire.** World scripts written for the toolkit keep working: `wayfarers-toolkit.allPlayersOnline` and `wayfarers-toolkit.playerCountChanged` fire alongside the new names, with the same payload. They're skipped while the toolkit still has its own Who's online (so nothing fires twice). There's also a setting to turn them off (Who's online › Advanced).

### Changed
- **Built on wanderers-core 0.2.0** (bundled in `vendor/`, pinned and hash-checked). Red Book now uses core for features, settings, debug logging, the one recording tab, socket requests, health checks and cleanup. CI uses core's shared checks.
- `red-book.eventLogged` now carries ids only: `{ session, event: { id, type, t, wt } }`. Read the full event on a GM client with `api.session.get(session)`.
- `red-book.sessionEnded` no longer carries the summary: `{ session, uuid, name }`. Read it with `api.session.get(session).summary`.
- `red-book.recapShared` fires on the GM client that shared the recap only.
- `api.session.log(type, text, { refs, private })` now checks its input strictly: a type is letters only, text is at most 2000 characters, refs are document UUIDs.

### Security
- **Session events no longer reach players.** Every logged event, including GM-only notes and threads, used to be broadcast to every client. Now only ids are sent.
- **Broadcast hooks are accepted only from the GM's recording tab.** Before, any client could make every other client fire a Red Book hook.
- **Requests from other clients** (rests, journals shown, notes, start/end) are checked against a schema and rate-limited per user. They are refused when Foundry doesn't know the sender. The sender is never read from the message.
- **GM-only API**: for players, `api.panel()`, `api.health()`, `api.cleanup.*`, `api.session.*` and `api.board.*` show "GM only" and return nothing.
- **Board pins moved out of a world setting** (every client receives world settings) into a GM-only journal, *Red Book data (GM only)*, with ownership None. This happens once, automatically, on the GM's first load. The old setting is emptied.

### Fixed
- The scene check no longer reports Wayfarer's Toolkit map pins as "map note isn't linked to a journal".
- `api.panel()` no longer opens the control panel for players.

### Live test checklist (Untested in Foundry)

Unit tests (67) cover the request schemas, the ids-only hook payload, the GM-only gate, the toolkit pin filter, the store and the pin move, Who's online counting, hooks and placement, the Session Start scene list, the toolkit carry-over plan and the settings. Check these in a live v14 world (dnd5e 6.x), with one GM and at least one player:

**Core and the recording tab**
- [ ] The world loads with no console errors for GM and player. `api.leader()` on the GM shows `started: true, leader: true`.
- [ ] Two GM tabs: only one records. Close it and the other takes over. A quick note typed in the second tab is logged once.
- [ ] Foundry passes the sender id to socket handlers. A player finishes a dnd5e rest: it's logged (if not, the sender id isn't arriving and every request is refused). Show a journal to players from a GM tab that isn't recording: it's logged once.
- [ ] Health (control panel Overview) lists every line with no "A check failed to run".

**Leaks to players (open the browser console on a player client)**
- [ ] Start a session, add a GM-only note (`#private`) and an open thread, then end the session. Run `Hooks.on("red-book.eventLogged", console.log)` on the player before the notes. The player sees only `{ session, event: { id, type, t, wt } }`, with no text. `red-book.sessionEnded` has no summary.
- [ ] On the player, `game.journal.filter(j => j.flags?.["red-book"])` lists **no** session logs and **not** *Red Book data (GM only)*. Recaps shared with players should be listed. If GM-only journals do show up on players, tell the developer: the store and logs rely on Foundry not sending ownership-None documents to players.
- [ ] On the player, `game.settings.get("red-book", "boardPins")` returns an empty list after the GM has loaded once.
- [ ] As the player, `game.modules.get("red-book").api.panel()`, `.health()`, `.cleanup.plan()`, `.session.list()` and `.board.pins()` each warn "GM only" and return undefined. No control panel opens.
- [ ] A player running `game.socket.emit("module.red-book", { action: "hook", name: "red-book.sessionStarted", sid: "abcdabcdabcdabcd", payload: {} })` doesn't fire the hook on other clients.

**Board pins move**
- [ ] On a world with pins from 0.2.0: after the GM loads, the board shows the same pins, a GM-only journal *Red Book data (GM only)* exists (ownership None), and pin/unpin still work. Reload: pins are kept and nothing moves twice.
- [ ] Remove Red Book data lists the data journal under its own category and deletes it.

**Scene check**
- [ ] A scene with toolkit map pins and a plain unlinked map note: only the plain note is reported.

**Session Start**
- [ ] The flag button (token controls) opens the dialog. It hides scenes matching the pattern (also after migration from the toolkit's setting). Start activates the scene, unpauses, and starts the session log. With a session already open, the log box is greyed out.
- [ ] Turn the feature off: no button, `api.sessionStart` is undefined.

**Who's online and Hub after migration**
- [ ] On a world that used the toolkit's Who's online: after the GM's first load, Red Book's Who's online settings match the toolkit's. Scenes that were toolkit Hubs are ticked under Scene Configuration › *Table Tools* › Red Book › *Hub scene*. The toolkit's own flags and settings are unchanged.
- [ ] With both modules active and the toolkit's Who's online still on: two panels show (the toolkit's and Red Book's). `wayfarers-toolkit.allPlayersOnline` fires once (from the toolkit), not twice. Turn one of them off.
- [ ] With the toolkit's Who's online removed or off: `wayfarers-toolkit.allPlayersOnline` and `.playerCountChanged` fire from Red Book. With *Also fire the old hook names* off, they don't.
- [ ] The panel shows on Hub scenes only. A player connecting or leaving updates it, and "Everyone's here" appears when the last player arrives. Dragging moves it and it stays there after a reload. Double-click puts it back. Resizing the window keeps it on screen.
- [ ] The *Table Tools* scene tab shows Red Book's section next to the other modules' sections, if those are installed. Saving the scene keeps the Hub tick.

## 0.2.0 — 2026-10-31

- **Scene check: ignore a finding.** Each finding in the readiness window has an Ignore button. Ignored findings stop counting toward the totals and the scene's all-clear, and sit in a collapsed *Ignored (n)* list with Un-ignore. Saved per scene in `flags.red-book.ignoredChecks` (`{ v, entries: [{ key, at, by, name }] }`, at most 500), keyed by rule and subject (e.g. `npcStats.hp:<tokenId>` for one NPC, `walls` for a scene-wide rule). Entries whose finding no longer comes up are kept, just not shown. *Clear ignored* per scene in the window; *Clear all ignored warnings…* (with a confirm) on the control panel's Scene check tab. GM only. Export lists ignored findings separately, marked ignored. Remove Red Book data's flags category covers it. API: `sceneCheck.ignored`, `ignore`, `unignore`, `clearIgnored`, `clearAllIgnored`.
- **Scene check is GM only.** No scene-control button, Scenes context entry, control-panel button or board button for players, and every `api.sceneCheck.*` member warns "GM only" and returns undefined for non-GM users.
- **Fix:** the "Start a session?" prompt on load now closes when a session is started some other way (panel, token button, API or another GM tab), and a late Yes no longer tries a second start.

### Untested in Foundry (check in a live world)

Unit tests cover the finding keys, ignore/un-ignore, filtering and counting, per-scene clear and clear-all selection, the export HTML and the prompt logic and the GM-only API gate (60 tests). Check live on v14 (and v13):

- [ ] Ignore a warning: it leaves the main list, the scene and window totals drop, and it shows under a collapsed *Ignored (1)*. A scene whose only findings are ignored reads "all clear".
- [ ] Two dnd5e NPC tokens at 0 max HP: ignoring one leaves the other's warning showing.
- [ ] Reload the world and check again: the ignore is still there. Check another scene with the same problem: not ignored there.
- [ ] Un-ignore: the finding comes back and counts again. The wrench (jump-to-fix) works on ignored rows too.
- [ ] Fix an ignored problem and check again: it disappears from both lists; *Clear ignored* is still offered (the entry is kept).
- [ ] *Clear ignored* in the window clears only that scene. Multi-scene check: each scene section has its own button.
- [ ] Control panel › Scene check › *Clear all ignored warnings…*: confirm dialog, then every scene's ignores are gone; an open results window updates. Cancel leaves them.
- [ ] A player can't write the flag (API calls warn "GM only"; the window is GM-only).
- [ ] As Player3, no scene check button, context entry or API access.
- [ ] Export to journal: ignored findings listed under *Ignored (n)* marked *ignored*, with who and when.
- [ ] Remove Red Book data: dry run lists scenes with ignores under flags; removing clears `flags.red-book.ignoredChecks`.
- [ ] Start prompt: load the world with no session open, leave the prompt up and start a session from the control panel (and from `api.session.start()`, and from a second GM tab): the prompt closes and only one session is made. Yes / No on the prompt still work as before.

## 0.1.0

First release.

- **Session log**: Start / End session (control panel, token controls, API; optional prompt on load). Timeline in a GM-only journal per session: scenes, combats, 0 HP and kills, dnd5e rests, items and coin on player characters and party actors (bursts grouped), world time, journals shown, NPCs met, level-ups, Wayfarer's Toolkit quests, objectives, travel, flights and loot rolls. Quick note key binding (Ctrl+Shift+N; `?` = open thread). Summary on End session. Share as recap with a review dialog.
- **Next-session board**: active quests and next objectives, linked NPCs, journals and scenes, last session's threads and summary, pinned documents (drop to pin).
- **Scene readiness check**: 16 read-only checks with severities and jump-to-fix, on a scene, a folder, every scene or the board's scenes; cached, rate-limited file checks; export to a GM-only journal.
- Control panel, health check, Remove Red Book data with a dry run, single-writer leader election across GM tabs with request de-dup.

### Untested in Foundry (check in a live world)

Only the pure logic is tested in Node (51 tests). Needs a live v13 and v14 (build 369) world, dnd5e 6.x and another system:

- [ ] Start / End session from the panel, the token-control button (icon and title flip) and the load prompt; the journal, folder and pages are made GM-only.
- [ ] Two tabs of the same GM: only one logs (check `api.leader()` in both); close it and the other takes over; a note typed in the non-recording tab is logged once.
- [ ] Two GM users: only the active GM's tab records.
- [ ] Each event kind appears: scene activation, combat start/end with defeated, a PC at 0 HP, an NPC killed, short and long rest on a player client, buying/selling and a loot split (one line per actor), group actor coin, `game.time.advance`, showing a journal and a page (v14 `Journal.show` wrapper), NPCs met (hidden tokens skipped), dnd5e level-up via the class item.
- [ ] Wayfarer's Toolkit: give/complete a quest, tick an objective, a flight, a hex trip, a finished loot roll.
- [ ] Quick note key binding and the `?` thread; summary block on End session; secret block for private threads.
- [ ] Share as recap: header button on the journal sheet (v14 `getHeaderControlsJournalEntrySheet`), review dialog, recap visible to a player, no secrets/GM notes/links; sharing again updates the same recap.
- [ ] Board: quests from the toolkit, links, drop-to-pin of each document type, View and Check readiness buttons, refresh after a quest change.
- [ ] Scene check: v14 background from the scene's level (`initialLevel.background.src`), v13 `scene.background`; darkness/global light on v13 and v14; doors; HEAD requests on a self-hosted server and behind a reverse proxy; the Scenes context menu entry (v13 `name/callback` vs v14 `label/onClick`); jump-to-fix for tokens, tiles, notes; export journal.
- [ ] Monk's Active Tiles flags with a deleted target.
- [ ] Remove Red Book data: dry run counts, deletion, folders removed only when empty, settings reset reloads.
- [ ] No backdrop blur on Red Book windows; light and dark themes.
