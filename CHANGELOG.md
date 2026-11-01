# Changelog

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
