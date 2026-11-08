# Changelog

## 0.9.0 (2026-11-08)

Renown from Wanderer's Toolkit in the session log. This release also carries the unreleased **0.8.6** (the move to wanderers-core 0.6.0, below): publish 0.9.0 and both reach users together.

### Added
- **Renown in the log** (feature `renownEvents`, on by default, needs the session log). With Wanderer's Toolkit 2.2+ (its *Renown* and *Hooks for other modules* on), every saved renown change (an award, a quest's renown reward, the GM setting a score, adding or removing another source) becomes a **Renown** line: *Bryn gained 3 renown with The Guild (now 13, Trusted). Reached Trusted!*, *… lost 2 renown …*, *Dropped to Known.* Faction names and tier names are read on the GM client through the toolkit's `api.renown`.
- **Merged repeats**: changes for the same character and faction less than 5 seconds apart become one line with the net change (a burst is logged at most 30 s after it began; anything waiting is logged when the session ends).
- **Summary › Renown**: the net change per character per faction over the session, with the total and tier reached. It shows in the recap and in the Discord session-end post.
- **Renown filter chip** on the Session page's timeline.
- **Hidden factions stay GM only**: their lines go in secret blocks on the timeline and in a *GM-only renown* block in the summary; they are never in the recap, the Discord post or the summary's counts, and the `red-book.eventLogged` hook reports them as a note. A faction Red Book can't read (toolkit inactive, not a GM client) is treated as hidden.

### Under the hood
- Pure: `session-model.mjs` `readRenownHook` (ids and numbers only, clipped; other fields never read), `renownKey`, `mergeRenown`, `renownEvent`, `renownTotals` / `renownRowText` (summary rows, at most `RENOWN_ROWS_MAX` 100), `TOOLKIT_HOOKS.renownChanged`, event type `renown` (group `toolkit`, so *Event types to log* › toolkit turns it off too). `discord-model.mjs` `summaryText` adds visible Renown rows.
- New request kind `renown` (`from: "gm"`, schema in `requests.mjs`): a GM tab that isn't recording relays the hook to the recording tab. Only the leader merges and writes.
- Tests: `tests/v090.test.mjs`.

### Untested in Foundry
- [ ] Toolkit 2.2+ with Renown and Hooks for other modules on, session open: award 3 renown to one character with a visible faction: one Renown line after about 5 s with the name, the new total and the tier.
- [ ] Award +1 three times within a few seconds: one line with +3. Award to the party: one line per character.
- [ ] Cross a tier threshold: the line ends with *Reached <tier>!*; lose renown below it: *Dropped to <tier>.*
- [ ] Award with a **hidden** faction: the line is in a secret block (GM only) on the timeline page; after End session the summary has a *GM-only renown* block; Share as recap and the Discord post show nothing of it, and the counts don't include it.
- [ ] Two GM tabs: award from the tab that isn't recording: the line is still logged once (relayed).
- [ ] Session page: the *Renown* chip filters to renown lines.
- [ ] End the session within 5 s of an award: the line is logged before the summary.
- [ ] Turn `renownEvents` off (reload): no Renown lines; the toolkit is unaffected.

## 0.8.6 (2026-11-08)

Moves to wanderers-core 0.6.0. Nothing changes at the table: no new setting, nothing stored, no migration.

### Changed
- **wanderers-core 0.5.1 → 0.6.0** (via 0.5.2). Red Book's windows, the Session Start window and the Hub panel pick up core's stylesheet revision 4 (`wc-r4`) through `UI_CLASSES`; revision 4 differs from 3 by the new *heirloom* item quality colour. Red Book uses none of 0.6.0's new guest-page exports. Chat output and journal pages written before the update carry no revision class, so they are unaffected.

### Under the hood
- CI calls core's `module-checks.yml@v0.6.0`. The 0.7.0 core-pin test now checks that the vendored core, the lock and the CI ref agree instead of a fixed version; the version asserts moved to `tests/v086.test.mjs`.

### Untested in Foundry
- [ ] Red Book window (every page: Session, Board, Scene check, Data, Health, Discord): looks as before in the light and the dark Foundry theme.
- [ ] Session Start window: looks as before in both themes; the quiet start banner too.
- [ ] Who's online Hub panel: looks as before in both themes; drag and fold still work.
- [ ] Gained this session: reward items still show their quality colours.

## 0.8.5 (2026-11-07)

### Fixed
- **Players' browsers no longer run the session log's 5-second inventory timer.** It is started only on GM clients now. Recording is unchanged: the timer still flushes only on the GM client that records (the leader), and a leader change between GM tabs still picks it up.

### Under the hood
- The Release workflow now has a read-only build job and a separate upload job (the only one that can write to the release), with top-level `permissions: contents: read` and every action pinned by commit SHA. Same tag check, version/URL setting and zip contents as before.

### Untested in Foundry
- [ ] As a player, reload: no 5 s timer from Red Book (e.g. Performance panel); as the GM, start a session, move items between characters: inventory lines still appear in the log after the coalesce delay.
- [ ] Two GM tabs: close the recording tab; the other becomes leader and inventory changes are still logged.

## 0.8.4 (2026-11-06)

Small fixes from a destructive live test of *Remove Red Book data*.

### Fixed
- **The "removed" notice said "flags 2" while the dry run said 13.** The dry run counted the Red Book flags on the pages of session, recap, report and data journals, but those journals were deleted in the same run, so only the flags on surviving documents were cleared. Pages of journals Red Book deletes are no longer counted as flags (they go with their journal), so the dry run and the notice agree.
- **Red Book made a new empty data journal on the next reload after "Remove data".** The one-time board-pin move wrote its done-mark into a new journal even when there was nothing to move. It now writes nothing when there is no journal and no old pins: the GM-only data journal is made lazily, with the first pin or prep item you save. The removal notice says so.
- **Resetting settings re-imported the toolkit's old settings.** "Reset Red Book's settings" also reset the `migrations` record, which is what stops the one-time carry-over from the toolkit, so the next load copied the toolkit's Session Start / Who's online settings and Hub scene flags back. The reset now leaves that mark in place (and sets it when the carry-over never ran), and the `migrations` record is no longer counted in the settings dry run.

### Verified
- Verified on Foundry 14.370: session log world time PASS.

### Untested in Foundry
- [ ] Make a session with a Timeline page and a recap, then Remove data with everything ticked: the dry-run flag count equals the number in the notice.
- [ ] After Remove data (store ticked), reload with Red Book enabled: no new "Red Book data (GM only)" journal appears. Pin something on the board: the journal is made then.
- [ ] With the toolkit's old Who's online settings still in the world: Remove data with settings ticked, reload: those settings are not copied back (Who's online keeps its defaults).
- [ ] A fresh world with the toolkit's old settings still carries them over once on first load (unchanged).

## 0.8.3 (2026-11-02)

### Fixed
- **Dragging the start banner stretched it instead of moving it** (dark theme). The rule that drops the banner's default bottom-centre anchor while it is placed only applied in the light theme, so in the dark theme the banner kept its bottom edge and centring and grew taller as it was dragged up. It now applies in both themes.
- **The banner text was dark in the dark theme.** It now follows the banner's own text colour (light on dark, dark on light).

### Untested in Foundry
- [ ] Dark and light theme: drag the banner up, down and sideways; it moves as one piece and keeps its size.
- [ ] Banner text readable in both themes.

## 0.8.2 (2026-11-02)

### Changed
- **The quiet "No session is open." banner can be moved.** Drag it by its grip and text (the Start and close buttons still just click); it stays on screen and the spot is remembered in this browser (new hidden client setting `startBannerPos`). Double-click the grip to put it back at the bottom centre. The solid background from 0.8.1 is unchanged. The new setting is in the Wanderer's Satchel skip list and in Remove Red Book data's settings reset.

### Untested in Foundry
- [ ] Drag the banner to another corner and release; reload with no session open: it comes back in the same spot.
- [ ] Clicking *Start session* and the close button still works (no drag starts from them); double-click the grip returns it to the bottom centre.
- [ ] Shrink the browser window: a banner saved near an edge is pulled back on screen.
- [ ] Both themes: the dragged banner stays opaque and readable.

## 0.8.1 (2026-11-02)

### Fixed
- **The "Start a session?" banner was almost see-through in the light theme.** It now has a solid background in both the light and dark themes, with dark text on light and light text on dark.

### Untested in Foundry
- The banner at the bottom of the screen in the light theme and in the dark theme: solid background, readable text and buttons, nothing showing through from the hotbar behind it.

## 0.8.0 (2026-11-01)

Small fixes and comforts from a live run-through. No data is rewritten; nothing new is stored in the world.

### Changed
- **"Start a session?" no longer pops up every load.** New setting *Ask to start a session when the world loads* (Session log tab, per browser): **Quiet** (default) shows a small banner at the bottom of the screen with a *Start session* button and a close button, which you can ignore while prepping; **Ask** is the old dialog, now with *Don't ask again in this browser* (switches this browser to Never); **Never** shows nothing. The old world switch is gone from the settings; if you had turned it off, each GM browser starts on Never. A session started any other way still closes the banner or dialog.
- **Scene check names no longer cut off.** The scene list is a little wider and names wrap to two lines; hovering a name always shows it in full (the detail heading too).
- **Scene check results survive a reload.** The last result per scene is saved in this browser (localStorage, one entry per world; never in the world, so players never receive it), at most 200 scenes, about 1 MB, deleted scenes dropped. Each result shows when it was made (*Checked 18:20*, with the date on another day). **Clear saved results** on the Scene check page forgets them; Remove Red Book data's settings reset does too. Ignored findings are still read from the scene, so a saved result always shows today's ignores.
- **Timeline without a calendar.** When the world uses Foundry's default calendar at year 0, log lines no longer show the meaningless in-world time (*0000-01-01 13:30:06*); old lines with such a stamp hide it too. Real-time clock times stay. A world with a calendar set up (or a year above 0) keeps its in-world time.
- **Prep list count is clearer.** The board's prep list badge said *0/100*; it now says *3 to do* (Done takes an item off the list, so there is no done count). The 100-item limit is in the badge's tooltip, and in the badge itself once the list is nearly full (*85 to do · max 100*).
- **Open Red Book has a default key: Shift+R** (Foundry core and dnd5e bind nothing to Shift+R). A key you already picked stays. Ctrl+Shift+N (Quick note) is unchanged.
- **`api.open(page)`** opens (or brings forward) the Red Book window, optionally on a page; it is what the Wanderer's Satchel will use to launch Red Book. `api.panel(page)` still works. New: `api.sceneCheck.clearSaved({ confirm })`; `api.sceneCheck.results()` now includes saved results, each with its time `at`.
- Wanderer's Satchel registration: every per-browser setting (now including `startAsk`) is in `skipSettings`, so settings backups never carry one browser's habits.

### Untested in Foundry
Unit tests (166, passing in UTC, New York and Tokyo) cover the new setting and its carry-over, the dialog answer and banner, the Satchel skip list and cleanup text, the scene-list tooltip and wrap, saving/loading/capping/pruning results, the *Checked* time, the in-world time rules, the prep badge, the key definitions and `api.open`. Check in a live v14 world (dnd5e 6.x) as GM:

- [ ] Fresh browser, no session open: reload shows the quiet banner (not a dialog); *Start session* starts one and the banner goes; the close button just hides it. Start a session from the token controls while the banner is up: it disappears.
- [ ] Set *Ask*: reload shows the dialog; tick *Don't ask again* and click No: notice shown, setting now Never, next reload shows nothing. Yes with the box ticked starts a session and sets Never.
- [ ] A world where the old *Ask to start a session on load* was off: the first load in each GM browser is quiet (Never), and the setting shows Never.
- [ ] Banner placement over the hotbar/chat at small window sizes; light and dark themes.
- [ ] Scene check list: a long scene name wraps to two lines, hover shows the full name; the list column width at the default window size.
- [ ] Check a few scenes, reload: results are back with *Checked HH:MM*; ignore a finding then reload: still ignored. Delete a checked scene, reload: gone from saved results. *Clear saved results* (confirm): list back to *Not checked*, and stays so after a reload. A second world in the same browser keeps its own results.
- [ ] Timeline in a world with no calendar set: no *0000-01-01* times on new or old lines, in the window and in the journal page; a world with a calendar module or a configured calendar still shows in-world time.
- [ ] Board prep list badge reads *n to do*; tooltip shows the limit.
- [ ] Shift+R opens the Red Book window (and doesn't fire while typing in a text field); Configure Controls shows Shift+R under Red Book; a previously chosen key still works. Ctrl+Shift+N still opens the quick note.
- [ ] `game.modules.get("red-book").api.open("check")` opens the window on the Scene check page; the Wanderer's Satchel still lists Red Book and its backup leaves `startAsk` out.
- [ ] Remove Red Book data with *Reset settings* ticked: `startAsk` back to Quiet and saved scene-check results gone in this browser.

## 0.7.1 (2026-11-01)

Moves to **wanderers-core 0.5.1** (patch: every shared "Module data" journal folder is hidden, and duplicates are merged when the store is filed). No Red Book API, setting or data changes.

### Changed
- wanderers-core 0.5.1 vendored (CI checks `@v0.5.1`).

### Untested in Foundry
- A world with several Module data folders ends with one after a reload.

## 0.7.0 (2026-11-01)

Red Book moves from wanderers-core 0.3.1 straight to **0.5.0** and uses its new helpers, plus one fix found in live testing.

### Fixed
- **Gained this session left out the reward the players picked.** Quests with a choice of rewards (Wanderer's Toolkit 1.29+, quest record v2: `rewards.choice` and `rewards.pick`) now count the picked item next to the fixed ones; with no pick, or a pick that is no longer one of the choices, only the fixed items count.

### Changed
- **wanderers-core 0.5.0** vendored (CI checks `@v0.5.0`; the release zip leaves out core's dev-only `testing/` folder). Windows move to core's stylesheet revision 3 by themselves (no revision is written in Red Book).
- **GM-only store on core's `createStore`.** The *Red Book data (GM only)* journal is found exactly as before (by `flags.red-book.store`), nothing renamed or rewritten. The recording GM's first load files it, once, into a shared **Module data** journal folder (made if missing) and marks it `flags.red-book.dataFolderFiled`; a GM who moves it later keeps their choice. Remove Red Book data deletes it through core, and the folder too once nothing else is in it.
- **Module data folder hidden** from the Journal sidebar. New switch **Show module data** on the Data page (client setting `showModuleData`, per browser, off; re-renders the Journal sidebar). Tidiness, not secrecy: players' browsers still receive those journals.
- **Windows remember their spot** (core `RememberedWindow`): the Red Book window, Session Start, Who's online and Remove Red Book data reopen where they were left in this browser (client setting `windowPlacement`). **Reset window positions** on the Data page.
- **Key bindings through core** (`registerOpenKeybinding`): *Quick note* (`quickNote`, Ctrl+Shift+N) and *Open Red Book* (`openRedBook`, no key) keep their action ids and defaults, so keys users chose stay.
- **Gained this session** shows coin with core's coin text (`12g 2s 53c`) in the world's coins: the toolkit's `api.coinRatio()` when it has one, else 100 to 1 with the toolkit active and 10 to 1 without (the loot-line fallback follows the same ratio). Reward items show core's quality slot and colour when the quest stores a picture and rarity. Blocks frozen by 0.6.0 keep their text.
- **Health fixes:** *The GM-only data journal is visible to players* gets **Set to None**, and a new line for an open-session setting pointing at a missing or ended journal gets **Clear it**; both ask first. The buttons are on the Health page and, through the registration's `fixes`, in the Wanderer's Satchel.
- Wanderer's Satchel registration: `showModuleData` and `windowPlacement` are in `skipSettings` (never exported or imported).

### Live test checklist (Untested in Foundry)

Unit tests (151, passing in UTC, New York and Tokyo) cover the core pin, the picked reward, coin text and ratios, the loot fallback, reward slots and escaping, the Discord text of a slot, the store options and how the old entry is found and filed, cleanup of the filed mark, the new settings and records, the Satchel `skipSettings` and `fixes`, the key binding definitions, the window keys, the Data page and the Fix buttons. Check in a live v14 world (dnd5e 6.x) with Wanderer's Toolkit 1.29+ and the Wanderer's Satchel, one GM and one player:

- [ ] Load a 0.6.0 world with board pins: the *Red Book data (GM only)* journal moves into *Module data* once (flag `dataFolderFiled`), pins and prep list unchanged; move it back to the root and reload: it stays at the root.
- [ ] A fresh world: the first pin creates the journal inside *Module data* with the About page.
- [ ] The Journal sidebar hides *Module data* (and its search can't find the entry); *Show module data* on the Data page shows it at once, in this browser only. Another module's switch also shows it.
- [ ] Set the store journal to Observer for a player: Health shows the warning with **Set to None**; confirm: ownership back to None, line ok. Same from the Satchel's health page.
- [ ] Delete the open session's journal (or set `openSession` to an ended one by hand): Health shows **Clear it**; confirm: the setting is empty, nothing else changed.
- [ ] Move and resize the Red Book window, Session Start, Who's online and Remove data, close, reload: each opens where it was. Shrink the browser: windows stay on screen. **Reset window positions**: default spots on the next opening.
- [ ] Ctrl+Shift+N still opens the quick note; a key a user had set for *Open Red Book* still works (Configure Controls shows both under Red Book, GM only).
- [ ] Complete a quest whose players picked a choice reward: *Gained this session* lists the fixed items and the picked one (picture with quality border, name in the quality colour) in the log, recap and Discord post (no quality word in the Discord text). No pick: only the fixed items.
- [ ] Coin in three-coin and standard worlds: the amounts match the toolkit's coin log.
- [ ] Windows and the Gained block in the dark and the light theme (core revision 3).
- [ ] Remove Red Book data with the store ticked: the journal goes, and *Module data* too when no other module's journal is in it; settings reset clears this browser's window spots and Show module data.

## 0.6.0 (2026-11-01)

Five new features, each with its own switch on the Features page (all on by default, all need the session log), and full dates on every log line.

### Added
- **"Previously on…" card** (`previously`): at Session Start (setting *Show "Previously on…" when a session starts*, on) and when the GM clicks **Show to players** on the Session page, players see the last shared recap as a dismissable title card (name, date range, the recap's text). Only the shared recap journal is read, by clients that can observe it. Each browser remembers the recap it has seen (client record `previouslySeen`); *Show to players* shows it again. **Preview** shows it to the clicking GM only. Hook `red-book.previouslyOn` `{ recap, force }` (ids only); request `previously` (GM only).
- **NPCs met this session** (`npcsMet`): non-player tokens on the active scene or a scene a connected player is viewing are recorded once each (actor id, name, first seen, scene) into the session's `npcs` list, logged as **Met** lines, listed in an *NPCs met* panel and in the summary block / recap. Hidden tokens count once revealed (unless *Count hidden tokens as met*). The GM can take one out: it leaves the list and the Met line and isn't met again that session.
- **Session timer and break reminder** (`sessionTimer`): hours:minutes since the start on the Session page and live banner, updated every 20 s from the start timestamp. *Remind me to take a break* (off by default) every *N* minutes (default 90): a GM-only notification.
- **Attendance and experience** (`attendance`): connected players and their characters are added to the session's attendance at start, on connect and on a character change (taken-out rows stay out); add or take out by hand. *Track per session*: experience (per character, GM only: a secret block in the log, never in the recap), milestone (text players see in the recap) or off. Past sessions shows the attendance, XP or milestone per session and totals per character. API `session.totals()`.
- **Gained this session** (`gained`): party coin (net, with what was spent) from the toolkit's coin log within the session window, or the log's own coin lines without it, and reward items of quests completed this session (hidden quests left out), as a block in the log and recap. Frozen at session end.
- Request `sessionEdit` (GM only, schema-checked) for NPC removal, attendance and awards, on open or ended sessions; API `session.edit()`.

### Fixed
- **Enter in the Next session field now saves** (found in 0.5.0): Chromium does no implicit form submission from a `datetime-local` input and Save is a plain button, so Enter did nothing. The field now handles Enter itself (and keeps it from Foundry's key bindings) and runs the same save as the Save button.

### Changed
- **Dates on every log line, sessions past midnight** (user request). Each event stores `at` (ISO 8601, UTC) next to `t`. Times are shown in each viewer's time zone (the window) or the recording GM's (the journal page); a line from a later day than the start shows its date, and day separators / headings mark midnight. Session span *Sat 14 Mar, 7:00 PM – Sun 15 Mar, 1:30 AM* on the Session page, Past sessions, the journal page, the recap and the card. The session's name keeps its start date. Durations and session windows use timestamps only. Setting *Dates on the timeline* (Advanced, on).
- Stored session version 2. Events without a usable time (older data) get the start date plus their clock reading, rolling to the next day when the clock goes backwards; the first GM load rewrites ended sessions once.
- NPCs met scans also run when a token changes on a non-active scene (feature `npcsMet`).

### Live test checklist (Untested in Foundry)

Unit tests (138, passing in UTC, New York and Tokyo time zones) cover the time model (ISO round trip, zones, DST gaps and repeats, range text, midnight crossing, clock parsing, the migration incl. a roll across a DST change, windows, break due), timeline dates and separators (page and window), NPCs met / remove, attendance and GM edits, awards and totals, the extras block (XP only in a secret block, stripped from the recap), gained (window, undone entries, hidden quests, loot fallback), the Previously rules and card, the new views, settings, features and request schemas. Check in a live v14 world (dnd5e 6.x) with Wayfarer's Toolkit, one GM and two players:

**Dates and midnight**
- [ ] Start a session, change the computer clock or wait past midnight (or load a world with an old session): new lines after midnight show *Sun 15 Mar 12:10 AM*, a day separator appears in the window's timeline and a day heading on the journal page; the Session page and Past sessions show the full span.
- [ ] A second GM in another time zone sees times and day changes in their own zone in the window.
- [ ] An ended 0.5.0 session: after the first GM load its flag is version 2, every event has `at`, lines past midnight are on the next day.
- [ ] Share as recap: the recap's first line has the date span.

**Previously on…**
- [ ] Share a recap, start the next session: each player sees the card once (reload: not again). Show to players: shown again. Preview: only the GM sees it, players see nothing.
- [ ] A player without access to the recap (ownership changed) sees nothing. No secret block text appears.
- [ ] Feature off (reload): no buttons, no card.

**NPCs met**
- [ ] Place an NPC token on the active scene: one Met line, listed in the NPCs met panel with scene and time. A hidden token: not listed until revealed. A player pulled to another scene with NPCs: those are met too.
- [ ] Take one out: gone from the panel and the Met line; moving the token doesn't add it back. The recap lists the rest.

**Timer and break reminder**
- [ ] The Played tile and banner count up without re-rendering. Break reminder on, every 15 minutes: one GM-only notification per interval (players see none); a sleeping tab shows one, not several.

**Attendance and experience**
- [ ] Players online at start are listed; a player connecting later is added; taking one out sticks. Add someone back by hand.
- [ ] XP mode: enter XP, Save: Past sessions shows the total and Totals per character adds up across sessions; the recap has no XP. Milestone mode: the text shows in the recap.

**Gained this session**
- [ ] With the toolkit's coin log on: pay a quest reward and a room during the session; end it: the block shows the net coin and what was spent, and the quest's reward items. An undone entry isn't counted. Without the toolkit: coin from the log's own loot lines.


## 0.5.0 (2026-11-01)

Five new features, each with its own switch on the Features page (four on by default, Discord posts off).

### Changed
- **Toolkit name at runtime:** the health line and the board's no-quests note use the installed toolkit module's own title ("Wanderer's Toolkit" since 1.27.2; older installs keep theirs), falling back to "Wanderer's Toolkit". The log-group setting label says "from the toolkit". Ids, flags and hook names are unchanged.

### Added
- **Quest events in the log** (`questEvents`, needs the session log): with Wanderer's Toolkit, quests given, completed, failed or reopened and objectives ticked during an open session become timeline lines. They come from the quest journal update and from the toolkit's new `wayfarersToolkit.questUpdated` hook (`{ questId, change }`); a change reported by both within 15 s is logged once. On a GM the full quest is read through the toolkit's API, so a hidden quest's or a hidden objective's line is logged as **GM only** (kept out of the recap). The summary has its own **Quests** list (quest lines are no longer repeated under Notable moments), so quest progress shows in the recap.
- **Journeys in the log** (`journeys`, needs the session log): the toolkit's new `wayfarersToolkit.journey` hook (hex trips and flights) becomes a **Travel** line with route, time and cost. The Travel Log page's line for the same trip is skipped when both come within 15 s. The timeline's *Quests and travel* chip is now two chips, **Quests** and **Travel**.
- Another GM tab that hears either hook sends it on to the recording tab (new GM-only requests `quest` and `journey`, schema-checked).
- **Prep list from the scene check** (`prepList`, needs the board and the scene check): on the Scene check page each problem or warning has **Add to the next-session board**, and **Add all failures** adds the rest. The board's new **Prep list** panel groups them by scene (scene link, Check again, Done). Deduped by scene and finding, at most 100, kept in the GM-only store journal.
- **Next session** date on the board (world setting `nextSession`; `api.nextSession()`).
- **Open Red Book** key binding (`openKey`, GM): Configure Controls › Red Book. No key is set by default.
- **Discord posts** (`discord`, **off by default**): Tool settings › Discord. A webhook URL, and posts for: a summary when a session ends (recording GM tab only), the recap when you share it (optional, off), the next-session date when you save it. Send test message button. Embeds with a plain-text fallback, no pings, one post at a time, Discord's rate limits waited out; a failed post is an error on that GM's screen only, without the URL. **Honor system**: the webhook URL is a world setting, which every browser receives, so a player with the browser console can read it; the setting's hint, the Discord page, the health check and the README say so. Use a webhook for one channel only.
- API (experimental): `board.todos()`, `board.doneTodo(id)`, `discord.post(msg)`, `discord.test()`, `nextSession()`.

### Changed
- Built with types on (JSDoc check at zero errors in CI).

### Live test checklist (Untested in Foundry)

Unit tests (118) cover the quest hook reader (ids only, known changes), hidden quest/objective lines marked GM only, the dedupe keys and window, the fallback line, the summary's Quests list and the recap (GM-only quest lines stripped), the journey reader (names plain and clipped, numbers checked), the Travel line, the hook/Travel Log merge (either order, repeats, caps), the new request schemas, the Travel chip, the prep list (dedupe, cap, store), the Add to board / Add all failures buttons, the board's prep panel and Next session field, the date round trip, the Discord URL check, payload limits and no-ping, the player-safe summary and recap text, retry and rate-limit waits, error text, the Discord settings and feature defaults. Check in a live v14 world (dnd5e 6.x) with Wanderer's Toolkit, one GM and one player:

**Quest events**
- [ ] With a session open: give, complete and fail a quest, tick an objective. Each appears **once** on the timeline, with the toolkit both with and without the new `questUpdated` hook.
- [ ] Two objectives ticked quickly both appear. A hidden objective ticked shows a GM-only badge and isn't in the recap.
- [ ] End the session: the summary has a Quests list; Share as recap shows the quest lines (not the GM-only ones).
- [ ] A second GM tab (not recording) changes a quest: logged once by the recording tab.
- [ ] Features › Quest events off (reload): no quest lines, no errors.

**Journeys**
- [ ] A hex trip and a flight with the new `journey` hook: one Travel line each with hours and cost; the Travel Log line isn't logged as well. Without the hook (older toolkit): the Travel Log line is logged as before (about 2.5 s later).
- [ ] The Travel chip shows only Travel lines; the Quests chip only quest lines.

**Prep list**
- [ ] Scene check page: Add to board on a warning; the button becomes a pin mark. Add all failures adds the rest and then greys out. The board's Prep list shows them under the scene's name; the scene link opens it, Check again runs the check, Done removes the item.
- [ ] A player can't see the prep list (it's in the GM-only store journal); Remove Red Book data › GM-only data journal removes it.

**Next session and key binding**
- [ ] Board › Next session: pick a date, Save (also Enter in the field). Reopen: kept. Clear removes it. `api.nextSession()` returns it on a player's client.
- [ ] Configure Controls › Red Book › Open Red Book: no key by default; set one; it opens the window for the GM, does nothing for a player.

**Discord** (turn the feature on, reload)
- [ ] Paste a webhook URL, Save, Send test message: posted. A wrong URL: an error notice (GM only), no request sent. Health shows the honor-system line.
- [ ] End a session: one summary post, even with two GM tabs open. Private notes, private threads and hidden quest lines aren't in it.
- [ ] *Post the recap* on: Share as recap posts the recap text without secret blocks or unticked lines.
- [ ] Save a next-session date: a post with the date in each reader's time zone. Post to Discord posts again.
- [ ] Delete the webhook in Discord, then post: an error notice on the GM's screen, nothing on the player's.
- [ ] Many posts quickly (several recaps): all arrive, none lost to rate limits.

## 0.4.0 (2026-11-01)

### Changed
- **One Red Book window** with a sidebar, replacing the tabbed control panel, the separate board window and the scene-check results window. **Tools**: Session, Board, Scene check, Online, Past sessions. **Settings**: Features, Tool settings, Health, Data. Open it with the new **Red Book** button (open book) in the token controls, Module Settings › Red Book › *Open the control panel*, or `api.panel(page)` (the old tab names still work). Arrow keys, Home and End move through the sidebar; in a narrow window it becomes a strip across the top. It follows Foundry's light and dark themes.
- **Session page** (the start page): a banner says whether a session is running (with Start, Session Start…, Note box and End), tiles count events, time played, combats and downs, notes and open threads, and who's here. A quick-note box adds a note without a dialog (Thread / GM only ticks). The timeline shows the newest 100 events, newest first, with filter chips by kind (Scenes, Combat, Loot, Rests and world, Quests and travel, Notes).
- **At the table** on the Session page: the connected players with their character's portrait. **On dnd5e, each character's hit points** (bar and value, temporary HP shown as +n) update live as they change. On other systems no HP is shown.
- **Board** is a page with three columns: quests and the last session; NPCs, journals and scenes; your pins.
- **Scene check** is a page: every scene on the left (search, a dot with its last result), the chosen scene's findings on the right, grouped by kind (map, tokens, images and sounds, notes and links, players). Results are kept in that browser tab until you reload; nothing new is saved to the world. `api.sceneCheck.run()` opens this page; `api.sceneCheck.results()` and `api.sceneCheck.open(sceneId)` are new (experimental).
- **Session Start** is a small window of its own: a searchable scene list and a *Ready?* checklist (activate, unpause, start the log, who's here, and the scene check's result for that scene this load, with a Check button).
- **Who's online panel**: a themed header with a count pill (for example 3/4). Drag it by the header (no longer the title text). A new **fold button** in the header folds the panel to its header; each browser remembers it (client setting `onlineHudCollapsed`). Tab to the button and press Enter or Space to fold or unfold. `api.online.toggleCollapsed(value?)` is new.
- **Remove Red Book data › Reset settings** now also resets this browser's own client settings (the Who's online panel spot and fold).
- New strings are in `lang/en.json` and can be translated.
- Built on **wanderers-core 0.3.1** and its shared stylesheet (loaded before Red Book's own; revision 2). CI uses core's checks v0.3.1.

### Added
- **Wanderer's Satchel**: when that hub module is active, Red Book registers itself there (its own control panel button, its health check, the debug-logging switch; its record settings are left out of the Satchel's settings export and import). Red Book works the same without it; it's listed as recommended, not required.

### Live test checklist (Untested in Foundry)

Unit tests (93) cover the sidebar (pages, groups, one tab stop, muted tools, keyboard index), the old tab-name mapping, the timeline filter and its cap, the timeline rows, the dnd5e HP reading (null values, effectiveMax, temporary max, clamping) and the roster (players only, no HP off dnd5e, which actor changes refresh it), the session, board, scene check, Online, past sessions, settings, health, data and Session Start pages, the scene-check categories (display only) and results memory (cap), the Hub panel header and fold button, the new client setting and the reset covering it, every new string in `lang/en.json`, the stylesheet order and scoping (no file names a revision class), and the Satchel registration (fields, records skipped, only when active, waits for its ready hook, refusals and errors reported). Check these in a live v14 world (dnd5e 6.x), one GM and at least one player:

**Look**
- [ ] The Red Book window, Session Start and Who's online look like Foundry v14 in the **dark** theme and in the **light** theme (text readable, badges, banners and HP bars coloured, no stray backgrounds). Dialogs (End session, Quick note, Share as recap) still look right.
- [ ] **Narrow window**: resize the Red Book window below about 720 px wide: the sidebar becomes a strip, the session columns, board and scene check stack, nothing is cut off. Between 720 and 980 px the board has two columns. Make it short (for example 1000×450 and 640×720): pages scroll and no panel or table is squashed to nothing (core 0.3.1's fix; Red Book no longer has its own override).
- [ ] With another module still on core 0.3.0 open at the same time, both windows keep their own look.

**Window and keyboard**
- [ ] The **Red Book** token-control button, Module Settings › *Open the control panel* and `api.panel()` open the window on the Session page. `api.panel("board")`, `api.panel("overview")` and `api.panel("start")` open Board, Session and Tool settings › Session Start. For a player, `api.panel()` warns "GM only".
- [ ] **Keyboard nav**: Tab reaches the sidebar once; Arrow Up/Down, Home and End move between pages; Enter or Space opens one (and doesn't pause the game); after the page changes, focus stays on the sidebar.
- [ ] Tools that are turned off show greyed in the sidebar with *Off*, and their page says so.

**Session page**
- [ ] No session: the banner offers Start and Session Start…. Start: the banner turns to *Session running* with a pulsing dot, the timeline fills in as you play, tiles count up.
- [ ] Quick note: type and press Enter (or Add): it's logged once, the box empties. Thread and GM only ticks work. Ctrl+Shift+N still opens the note box.
- [ ] Filter chips show their counts and only that kind; with more than 100 events, the newest 100 show with a hint.
- [ ] **Roster HP live updates (dnd5e)**: damage and heal a connected player's character (sheet and token HUD): the bar and value update within a moment, temp HP shows +n; a player without a character shows *No character*. Many quick changes don't stutter. On a non-dnd5e world, no HP is shown at all. Nothing is written to the world (no document updates in the console).
- [ ] End session from the banner: summary written as before; Past sessions lists it with Open and Share as recap.

**Board**
- [ ] Three columns at full width; dropping a document on *Pinned* pins it; unpin, view scene, check scene and Check all work; missing documents are struck through.

**Scene check memory**
- [ ] The clipboard button checks the viewed scene and opens the Scene check page on it. Pick other scenes on the left and check them; the dots and results stay while you move between scenes and pages. Close and reopen the window: still there. Reload: gone (nothing saved). On the player, `game.settings` has nothing new from Red Book.
- [ ] Ignore, Un-ignore, Clear ignored, the wrench (open it) and Export to journal work as before; *Check all* fills every scene's dot. Tool settings › Scene check › *Clear all ignored warnings…* still works.
- [ ] The Scenes sidebar's *Check readiness*, the board's check buttons and `api.sceneCheck.run({ all: true })` still work.

**Session Start**
- [ ] The flag button opens the small window. Typing filters the list; hidden-pattern scenes aren't listed; the viewed scene is chosen. *Ready?* shows who's here and the scene's check result, and Check runs it. Start activates, unpauses and starts the log; with a session open, the log box is greyed out. `api.sessionStart.open()` resolves to the result, or null when the window is closed.

**Who's online**
- [ ] On a Hub scene the panel has a header with *Who's online* and a count pill; it turns green when everyone's here.
- [ ] **Who's online drag**: drag by the header (not by the fold button) moves it and it stays after reload; double-click the header puts it back.
- [ ] **HUD collapse persistence**: the fold button folds and unfolds; reload: it stays folded in that browser only (another browser or player is unaffected). Keyboard: Tab to the button, Enter or Space folds it and doesn't pause the game. Remove Red Book data › Reset settings unfolds it again.
- [ ] Online page and *Open as a window* show the same board; *Put the panel back* resets the spot.

**Wanderer's Satchel registration**
- [ ] With the Satchel active: its hub lists Red Book as registered (not the built-in adapter); *Open panel* opens the Red Book window; its health check shows Red Book's report; *Debug logging for all* turns Red Book's *Debug logging* on and off; Settings transfer › Export leaves out `openSession`, `migrations`, `boardPins`, `onlineHudPos` and `onlineHudCollapsed`. No warning from the Satchel in the console.
- [ ] Load order: works whether Red Book or the Satchel gets ready first (it registers again on `wanderers-satchel.ready`).
- [ ] Without the Satchel (not installed, or off): no errors, nothing changes.

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
