# CLAUDE.md: Red Book

Foundry VTT module (v13 minimum, verified v14 build 369; any system, extra dnd5e 6.x support) that cuts GM prep: session log, next-session board, scene readiness check. Logic only; campaign content stays in each world. Public repo, MIT.

## File map (`scripts/`)
- `main.mjs` entry: settings, menus, scene-control buttons, header/context hooks, the API (`game.modules.get("red-book").api`).
- `const.mjs` module id, socket name, hook names, `esc`/`plain`/`plural`. The id lives only here (and module.json).
- `features.mjs` feature registry (`FEATURES`, `on(id)`, `need(id)`); `settings-model.mjs` every other setting (tab, Basic/Advanced, label, hint, converters; pure); `settings.mjs` registers them.
- `leader-model.mjs` (pure) / `leader.mjs`: one writing client: per-client session id, ping/here/bye over the socket, earliest-started session of the active GM user leads, settle window, request routing (`request(kind, data)` → leader's `handle(kind, fn)`) with request-id de-dup, `broadcastHook`.
- `session-model.mjs` (pure) / `session.mjs`: session log: events, caps, coalescing, inventory diffs, time totals, NPCs met, toolkit quest/travel/loot-roll readers, summary, timeline HTML, recap stripping.
- `board-model.mjs` (pure) / `board.mjs`: next-session board: UUID extraction, active quests, link grouping, pins.
- `check-model.mjs` (pure) / `check.mjs`: scene readiness: rules, path list, `PathCache`, Monk's Active Tiles reader, report HTML / scene facts, HEAD probe, results window, export.
- `cleanup-model.mjs` (pure) / `cleanup.mjs`: Remove Red Book data (dry run, REMOVE confirm).
- `health.mjs` read-only health lines; `panel.mjs` control panel; `ui.mjs` dialogs, folders, open-by-UUID; `log.mjs` debug logging.
- `styles/red-book.css`, `lang/en.json` (empty: strings are plain English in code).

## Key patterns
- **Feature registry:** `sessionLog`, `prepBoard`, `sceneCheck`, world settings `feature-<id>` (reload). A turned-off tool registers no hooks, buttons, key bindings or socket handlers; its API getter returns undefined.
- **One writer:** every automatic write goes through `session.record()` / `flush()`, which run only when `L.isLeader()`. Other clients (other GM tabs, players resting, anyone calling `Journal.show`) call `L.request(kind, data)`; handlers check the sending user's rights (Foundry's sender id, never the payload). Request ids are de-duplicated by `seenCache`.
- **Session storage:** `flags.red-book.session` on the session's JournalEntry (`SESSION_VERSION`, read through `normalizeSession`), the *Timeline* page (`flags.red-book.timeline`) is rebuilt from it; the *Notes* page is the GM's. World setting `openSession` holds the open entry id. Recaps: separate entry with `flags.red-book.recap = { session, v }`, ownership default Observer.
- **Caps:** `EVENTS_MAX` 1000 (notes kept last), `MET_MAX` 500, `PINS_MAX` 50, `SEEN_MAX` 200, `IGNORED_MAX` 500 per scene, path cache 2000 entries. A new list-like store gets a cap and a test.
- **Hot hooks** (`updateActor`, `updateToken`, `updateItem`, `updateWorldTime`, …) bail on their first line unless a session is recording on this client and the change touches what we read (`foundry.utils.hasProperty(changes, …)`).
- **Scene check is read-only** for the scenes' content. Facts are gathered into plain objects (`sceneFacts`), the rules are pure. The one write: the GM's ignored findings, `flags.red-book.ignoredChecks` on the scene (`{ v, entries: [{ key, at, by, name }] }`, `IGNORED_MAX` 500), GM clicks only. Each finding has a stable `key` (`findingKey(rule, subject, variant)`: `rule[.variant][:subjectId]`); never change an existing rule's key shape or saved ignores stop matching. A new finding in a rule that can say two things about one subject needs its own variant. v14 backgrounds live on levels (`scene.initialLevel.background.src`); v13 on `scene.background.src`.
- **Toolkit integration** is read-only: quest flags `flags.wayfarers-toolkit.quest` (or `api.quests.list()`), the Travel Log page text, `flags.wayfarers-toolkit.lootRoll` on chat messages (`status: "done"`). Never write toolkit data.
- **`Journal.show` wrap:** no core hook fires when a journal is shown, so `session.mjs` wraps the static method (original always runs first). Re-check on each Foundry release.
- Windows use the `rb-window` class (no backdrop blur). Flags only under `flags.red-book.*`; settings only under `red-book.*`.
- **Cleanup covers everything we write:** a new flag, setting, document or folder must be found by `cleanup-model.mjs` `plan()`.
- **Docs:** README *Public API and hooks* lists every `api.*` entry and hook, marked stable or experimental. Update it with any change.

## Tests
- `npm test` = `node --test tests/*.test.mjs`; `npm run check` syntax-checks scripts and tests. CI runs both (`test.yml`); the Release workflow runs them again.
- Pure and tested: leader election and de-dup, session model (caps, coalescing, inventory, time, HP/level transitions, NPCs met, toolkit readers, summary, timeline), recap stripping, board links and pins, every readiness rule, path cache, settings table, cleanup plan, features.
- Not testable in Node: hooks, sockets, ApplicationV2 windows, journal writes, HEAD probes. List what's untested in the changelog's live checklist.

## Release process
1. Bump `version` in `module.json` and the `download` URL (`.../releases/download/vX.Y.Z/module.zip`); the manifest URL stays `https://github.com/cocoomg11/red-book/releases/latest/download/module.json`.
2. Add a `CHANGELOG.md` section with an "Untested in Foundry" checklist.
3. Commit and push to main. **Agents never tag or publish.** The user publishes the GitHub release with a tag `vMAJOR.MINOR.PATCH` only (the workflow fails on anything else); the Release workflow tests, sets version/URLs and uploads `module.json` + `module.zip` (`module.json scripts styles lang README.md CHANGELOG.md LICENSE`). A new top-level folder must be added to the zip step.
4. Keep `compatibility` honest (minimum 13, verified = newest build checked live). Optional modules go in `relationships.recommends`.

## Rules
- Public repo: no campaign names, no game-publisher wording, no private details (IPs, domains, paths), no Tolkien proper nouns beyond the module name.
- No official non-SRD rules text; never 5etools or other unofficial rules sites. Verify APIs at foundryvtt.com/api and github.com/foundryvtt/dnd5e.
- Every tool and check toggleable; no automatic hotbar macros.
- Commit author `cocoomg11 <cocoomg11@users.noreply.github.com>`; end commit messages with the attribution trailers given by the session.
