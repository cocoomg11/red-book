# Changelog

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
