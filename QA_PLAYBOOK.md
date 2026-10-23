# Human-User RTS QA Playbook & Blind-Spot Post-Mortem

> **Executable Runner**: [`tests/human_qa_runner.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/tests/human_qa_runner.js) (`node tests/human_qa_runner.js`)  
> **Reusable Skill**: [`.agents/skills/rts-human-qa/SKILL.md`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/.agents/skills/rts-human-qa/SKILL.md)

---

## 1. Post-Mortem: Why the Previous QA Playbook Missed the Main User-Facing Bugs

When testing commit `0db2d13`, a human player immediately noticed:
1. **Units were not getting selected on the canvas.**
2. **The Bulldozer was getting selected (when clicking `#btn-select-builder` / `[B]`), spoke its voice lines when ordered to move, but never moved on screen.**
3. **Buildings were not showing up when attempting to place them, while background audio continued playing.**

Yet the previous automated QA run reported `60/60 PASS`. Debugging the QA playbook and runner revealed **5 critical blind spots** in how the synthetic human driver interacted with the game loop and DOM/Canvas:

| Blind Spot | What the Old QA Runner Did | Why It Masked the Bug in `0db2d13` & `f831a1a` | New Mandatory QA Playbook Rule |
| :--- | :--- | :--- | :--- |
| **1. Zero-Frame "Teleport" Clicks During `BUILD` Mode** | Clicked `#command-card-grid` Reactor button (`commandMode = 'BUILD'`) and on the **very next synchronous JS line** called `human.leftClickWorld(x, y)` (`commandMode = null`), advancing **0 animation frames** while `commandMode === 'BUILD'`. | In `js/engine.js:4129`, `renderCommandOverlay()` called `this.canPlaceBuildingAt(...)` (which did not exist in `0db2d13`) **only when `engine.render()` ran while `commandMode === 'BUILD'`**. Because the QA runner placed the building before a single frame rendered, `renderCommandOverlay()` never executed in the test, whereas a real human moves their mouse for `10–60+` frames before clicking — immediately crashing `frame(now)`! | **Multi-Frame Modal Hover Rule**: Every action that enters a modal cursor state (`BUILD`, `POWER`, `SUPERWEAPON`, `ABILITY`, `ATTACK_MOVE`, `RALLY`) **must** update `mouseWorld` and run `human.stepFrames(5)` **while the mode is active** before clicking the canvas. |
| **2. Stale `rafCallback` Masking `requestAnimationFrame` Loop Death** | `requestAnimationFrame(fn)` assigned `rafCallback = fn`, and `stepFrames()` called `rafCallback(simClockMs)` **without clearing `rafCallback = null` first**. | In `js/ui.js:118-146` (`0db2d13`), `frame(now)` called `engine.render()` *before* `requestAnimationFrame(frame)` with no `try/catch`. When `engine.render()` threw in the real browser, `requestAnimationFrame` was never re-registered and the game loop died permanently (while WebAudio/speech continued asynchronously). In the old QA runner, `rafCallback` kept pointing to the old `frame` function even if it threw! | **Strict RAF Re-Registration Rule**: `stepFrames()` now clears `const cb = rafCallback; rafCallback = null; cb(simClockMs);` on every tick and asserts `typeof rafCallback === 'function'`. Any uncaught error or dropped `requestAnimationFrame` immediately halts the loop and fails the check. |
| **3. Selecting Dozer via HUD Button (`#btn-select-builder`) vs. Selecting Units on `#game-canvas`** | Selected the Dozer via `human.clickElement('#btn-select-builder')` and tested canvas clicks with a simplified `getBoundingClientRect()` (`top: 0, width: this.width, height: this.height`) at `devicePixelRatio = 1`. | Clicking `#btn-select-builder` (`[B]`) runs synchronously in DOM event code (`js/ui.js:670-683`) — it adds the Dozer to `engine.selectedIds`, updates `#inspector-title` to `USA Construction Dozer`, and plays audio **even when the `requestAnimationFrame` loop is completely dead**! Meanwhile, on `#game-canvas`: (a) `#viewport-wrap` has `margin-top: 36px` (`--top-bar-h`), (b) on macOS Retina (`devicePixelRatio = 2`), `resizeCanvases()` sets `engine.pixelRatio = 2` while `renderSelectionBox()` (`js/ui.js:2405`) reads `engine.dpr || 1` (`1`), drawing the green drag-selection box at **50% size/position** (`BUG-UI-07`), and (c) while `commandMode === 'BUILD'` is active after a failed click, `mousedown` (`js/ui.js:1946-1958`) returns early and blocks all unit selection (`BUG-UI-08`). | **Retina & Offset Canvas Selection Rule**: `gameCanvas._rect` enforces `top: 36, height: 500`, `getBoundingClientRect()` returns CSS pixels (`style.width/height`) rather than backing-store `canvas.width/height`, and Playbook 13 tests single-click, drag-box marquee transform scaling (`ctx.setTransform`), and `BUILD`-mode click traps under `devicePixelRatio = 2`. |
| **4. Asserting `u.state === 'MOVE'` Instead of Physical Position Delta ($\Delta x, \Delta y > 0$)** | Checked `squad.every(u => u.state === 'MOVE')` on the same tick immediately after `human.rightClickWorld(900, 2100)`. | `issueRightClickOrder()` (`js/ui.js:2203-2400`) synchronously sets `u.state = 'MOVE'` and triggers `ZH_AUDIO.speak(...)` inside the `mousedown` handler. If the game loop is dead (`BUG-LOOP-01`) or the Dozer is stuck outside build range (`d > site.radius + u.radius + 22`), `u.state` is `'MOVE'` and audio plays, **but `(u.x, u.y)` never changes**! | **Physical Displacement Rule**: After every move, harvest, or build order, the runner must step `25+` frames and assert `Math.hypot(u.x - startX, u.y - startY) > 12`. |
| **5. Only Checking `ctx.arc` After `stepFixed(dt)` Instead of Same-Frame `engine.render()`** | Only checked `canvas._nanArcCalls` after `stepFrames(40)` had already run `updateSpecialEffects(dt)`. | `pushMoveMarker()` (`js/ui.js:2192-2201`) creates `{ x, y, color, age: 0, maxAge: 0.55 }` without `t: 0`. If `engine.render()` runs before `updateSpecialEffects(dt)` (e.g., while paused or on an immediate redraw), `m.t / 0.45` is `NaN` (`BUG-UI-09`). | **Same-Frame Render Audit Rule**: Playbook 13 invokes `engine.render()` immediately after `rightClickWorld` (before `stepFixed`) and asserts `canvas._nanArcCalls === 0`. |

---

## 2. The 13 End-to-End Human QA Playbooks

Run `node tests/human_qa_runner.js` to execute all **13 Playbooks** (**87 Assertions** across **154 Synthetic Human UI Actions**, `87/87 PASS`):

| Playbook | Human Persona Flow | Key Invariants Verified |
| :--- | :--- | :--- |
| **Playbook 1** | **Skirmish Setup & Launch** | `#start-modal` visible on boot -> switch to `SKIRMISH` tab -> pick Player & AI Generals -> click `#btn-launch-operation` -> `#start-modal.hidden === true`, `#hud-credits`, `#hud-power`, `#hud-match-clock` live. |
| **Playbook 2** | **Camera Navigation** | `WASD`/Arrow keys pan `engine.cam`, Minimap left-click centers camera, `[Space]` jumps to `engine.lastAlertPos`. |
| **Playbook 3** | **Base Construction & Dozer Movement** | Click `#btn-select-builder` -> right-click ground -> step 25 frames & verify **physical Dozer displacement ($\Delta d > 15\text{px}$)** -> click Reactor on Command Card -> step 5 frames in `BUILD` mode & verify `rafCallback` stays alive -> right-click cancel -> invalid footprint rejection -> valid placement & full construction. |
| **Playbook 4** | **Structure Selection, Production Queue & Rally** | Left-click Barracks on `#game-canvas` -> right-click terrain to set Rally Point -> left-click unit cameos to queue 4 infantry -> right-click cameo to cancel & refund 1 unit -> step frames until infantry spawn & rally. |
| **Playbook 5** | **Unit Selection & Control Groups** | Single-click Ranger on canvas -> double-click (`< 340ms`) to select all Rangers -> drag-box across mixed combat + Dozer (verifies combat priority filter) -> `Ctrl+1` bind, click empty ground to deselect, `1` recall, double-tap `1` camera snap. |
| **Playbook 6** | **Contextual Orders, Physical Squad Movement & Garrison** | Right-click terrain -> verify `u.state === 'MOVE'` **and physical squad displacement across 25 frames** -> `Shift`+Right-Click waypoints -> `#btn-order-attack-move`, `#btn-order-guard`, `#btn-order-scatter`, `#btn-order-stop` -> `Ctrl`+Right-Click `FORCE_FIRE` -> Right-click Civilian Bunker (`ENTER_GARRISON`) & click `EVACUATE`. |
| **Playbook 7** | **Economy & Power Brownout** | Build Supply Center -> Chinook harvests supplies & increments `teams[0].credits` -> low-power brownout slows production rate by `0.45x`. |
| **Playbook 8** | **Generals Powers, Superweapons & Multi-Faction GLA Switch** | Press `[P]` to open `#powers-modal` -> unlock Rank-1 Power -> press `[F1]` & left-click target -> build Superweapon & verify `#superweapon-timers` DOM countdown -> switch to GLA General Juhziz & verify `+35%` `HIGH_EXPLOSIVE` damage modifier (`BUG-HUMAN-05`). |
| **Playbook 9** | **Pause, Quick Save/Load (`F5`/`F9`), Audio & Victory Loop** | Bind production building to `Ctrl+2` (`BUG-HUMAN-07`) -> press `[F5]` Quick Save -> press `[Escape]` / Pause (`engine.paused === true`) -> press `[F9]` Quick Load from Main Menu (`BUG-HUMAN-08`) -> toggle SFX/Music/Voice -> trigger Victory Modal -> click `#btn-next-challenge`. |
| **Playbook 10** | **HUD Overhaul** | Fixed 12-slot `#command-card-grid` -> Sell (`[Z]`) 50% credit refund -> `#selection-summary` `.unit-group-chip` sub-selection -> `#control-group-bar` pill click -> `#power-strip` click -> Mouse wheel zoom & `[Home]` reset. |
| **Playbook 11** | **Early-Game AI Grace & HUD Settings** | AI does not map-hack strike player base within first 6s -> move markers expire cleanly -> `resizeCanvases()` matches `--top-bar-h` (`36px`) and `--cmd-bar-h` (`184px`) -> `#opt-health-bars`, `#opt-ui-scale`, `#btn-open-powers-preview`, Victory `creditsEarned`. |
| **Playbook 12** | **PlanSimulator Auto-Play** | `#btn-auto-sim` (`Cmd+T`) toggles `PlanSimulator.enabled` -> `5x` Warp speed accelerates `engine.matchTime` -> Dozers complete buildings -> Barracks/War Factory train combat units (`totalUnitsProduced > 0`). |
| **Playbook 13** | **macOS Retina (`DPR=2`) & `BUILD`-Mode Selection** | Single-click unit under `devicePixelRatio = 2` & `top: 36px` offset -> verify `renderSelectionBox()` uses `2x` Retina transform (`BUG-UI-07`) -> verify same-frame `pushMoveMarker` initializes `t: 0` (`BUG-UI-09`) -> verify clicking a friendly building/unit while in `BUILD` mode does not trap selection or place a scaffold over a unit (`BUG-UI-08`). |

---

## 3. Complete Verification Matrix (All 9 Automated Suites)

| Suite | Command | Latest Result |
| :--- | :--- | :--- |
| **13-Playbook Synthetic Human QA** | `node tests/human_qa_runner.js` | **87/87 PASS** (154 actions, 0 failures) |
| **Phase 2 Engine & Command Authority** | `node tests/phase2_verify.js` | **20/20 PASS** |
| **Phase 3 Tactical HUD, VFX & Audio** | `node tests/phase3_verify.js` | **26/26 PASS** |
| **Phase 4 Save/Load, Challenge 2.0 & 3D Studio** | `node tests/phase4_verify.js` | **39/39 PASS** |
| **PlanSimulator Autonomous Audit** | `node tests/simulator_verify.js` | **17/17 PASS** |
| **Seeded Replay Hash & Challenge 2.0** | `node tests/replay_hash_verify.js` | **7/7 PASS** |
| **Fixed-Step GameSpeed Invariance (`1x`/`2x`/`3x`)** | `node tests/game_speed_verify.js` | **PASS** (`60`/`120`/`180` ticks per 1.0s) |
| **50-Run Replay & Mid-Match Save Determinism** | `node tests/determinism_verify.js` | **PASS** (`50/50` identical hashes) |
| **1,000-Unit Combat Performance Gate** | `node tests/perf_budget.js` | **PASS** (`0.84ms` avg / `1.42ms` p99) |
| **9×9 General Matchup Smoke Matrix** | `node tests/balance_matrix.js` | **81/81 PASS** (0 runtime exceptions + full victory test) |

