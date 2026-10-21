---
name: rts-human-qa
description: Autonomous Human-Persona QA Playbook & Bug Discovery methodology for Real-Time Strategy (RTS) games. Use when asked to QA the game as a human user, run interactive playbooks, debug why QA missed a bug, or generate an actionable bug report for engineering agents.
---

# Autonomous Human-Persona RTS QA Skill

## Core Mandate: Zero God-Mode Rule
When acting as a Human QA Engineer, **never** call internal engine mutation methods (`engine.spawnUnit()`, `engine.queueUnit()`, `engine.startBuildingPlacement()`, `engine.castGeneralPower()`, or `u.x = ...`) to test gameplay features.
Every action must originate from a **real user input channel**:
1. **DOM Clicks**: `.click()` / `contextmenu` on `#start-modal`, `#btn-launch-operation`, `#btn-select-builder`, `#btn-select-combat`, `#command-card-grid .cmd-card-btn`, `#stance-bar .hud-btn`, `#power-strip .power-pill`, `#control-group-bar .ctrl-group-pill`, `#selection-summary .unit-group-chip`, `#btn-auto-sim`.
2. **Canvas Mouse Events**: `mousedown` / `mousemove` / `mouseup` / `wheel` with accurate `clientX`, `clientY`, `button` (`0` = Left, `2` = Right), and modifiers (`shiftKey`, `ctrlKey`, `metaKey`) on `#game-canvas` (accounting for CSS `--top-bar-h: 36px` and `--cmd-bar-h: 184px` viewport offsets and macOS Retina `window.devicePixelRatio = 2`) and `#minimap-canvas`.
3. **Window Keyboard Events**: `keydown` / `keyup` for hotkeys (`B`, `Q`, `A`, `G`, `S`, `X`, `Z`, `P`, `Space`, `Escape`, `Home`, `F1`–`F6`, `1`–`9`, `Ctrl+1`–`9`, `WASD`/Arrows).

---

## 5 Mandatory Anti-Blind-Spot Invariants (Lessons Learned from Post-Mortem)

Any RTS QA Playbook that skips these 5 invariants will produce **false-positive passes** while the actual human game is broken:

### 1. Never Perform "Zero-Frame Teleport Clicks" After Arming a Command Mode
- **Why QA Missed `canPlaceBuildingAt` (`BUG-LOOP-01`)**: If a test clicks a Command Card building cameo (`commandMode = 'BUILD'`) and on the **very next synchronous JS line** dispatches a canvas `mousedown` to place the building (`commandMode = null`), **zero `requestAnimationFrame` renders occur while `commandMode === 'BUILD'`**. Any crash inside `renderCommandOverlay()` (such as calling a non-existent `this.canPlaceBuildingAt()`) is completely bypassed!
- **Mandatory Rule**: Whenever a human action arms a modal cursor state (`BUILD`, `POWER`, `SUPERWEAPON`, `ABILITY`, `ATTACK_MOVE`, `RALLY`), the QA driver **must** move the mouse across the canvas and advance **at least 3–5 animation frames (`stepFrames(5)`) while the mode is active** before clicking the canvas.

### 2. Strictly Verify `requestAnimationFrame` Re-Registration Every Frame
- **Why QA Missed Render-Loop Death**: If the test harness stores `rafCallback = fn` without clearing `rafCallback = null` before invoking `cb(simClockMs)`, an uncaught exception inside `frame(now)` (before `requestAnimationFrame(frame)` is called at the bottom of the loop) leaves the stale `rafCallback` function pointer in memory, tricking subsequent `stepFrames()` calls into restarting a dead loop.
- **Mandatory Rule**: `stepFrames()` **must** clear `rafCallback = null` before calling the frame callback and assert `typeof rafCallback === 'function'` after every frame. If `rafCallback` ever becomes `null`, the game loop has died (`P0 CRITICAL`).

### 3. Distinguish HUD-Button Selection (`#btn-select-builder`) from Canvas Hit-Testing (`#game-canvas`)
- **Why QA Missed "Units Not Getting Selected, Bulldozer Getting Selected But Not Moving"**:
  - Clicking `#btn-select-builder` (`[B]`) selects the Bulldozer via a synchronous DOM listener (`js/ui.js`) without touching `#game-canvas` coordinate math or checking if `frame(now)` is alive.
  - Meanwhile, clicking units on `#game-canvas` depends on `getBoundingClientRect()` (which has `top: 36px` from `#top-bar` and CSS height `calc(100vh - 220px)`), `window.devicePixelRatio` (`engine.pixelRatio` vs `engine.dpr`), isometric sprite visual elevation offsets (`-6px`), and `engine.commandMode` not trapping left-clicks in `BUILD` mode.
- **Mandatory Rule**: Test both single-click and drag-box selection directly on `#game-canvas` with `top: 36px` viewport offset and `window.devicePixelRatio = 2` (macOS Retina), and verify `renderSelectionBox()` canvas transform scaling (`ctx.setTransform`) during active drag (`framesDuringDrag: 2`).

### 4. Assert Physical Coordinate Displacement ($\Delta x, \Delta y > 0$), Never Just `u.state === 'MOVE'`
- **Why QA Missed Non-Moving Units**: Right-clicking the canvas synchronously sets `u.state = 'MOVE'` and plays the unit's voice line (`ZH_AUDIO.speak`) inside the `mousedown` handler. If the animation loop is dead or pathfinding/perimeter standoff is stuck, `u.state` is `'MOVE'` and audio plays in the background, **but the unit never moves a single pixel**.
- **Mandatory Rule**: Every movement, harvest, build, or attack-move assertion **must** record `(startX, startY)`, advance `25–60` frames via `stepFrames()`, and assert `Math.hypot(u.x - startX, u.y - startY) > threshold`.

### 5. Monitor Canvas Context Calls for Silent `NaN` & Transform Corruption
- **Mandatory Rule**: Wrap `HTMLCanvasElement.prototype.getContext('2d')` in a proxy that counts `NaN` arguments passed to `ctx.arc()` / `ctx.strokeRect()` (both during `stepFrames` and on immediate same-frame `engine.render()`) and records `ctx.setTransform()` matrices during `renderSelectionBox()`.

---

## Execution Workflow

1. **Run the Automated 13-Playbook Human QA Suite**:
   ```bash
   node tests/human_qa_runner.js
   ```
2. **Inspect All 13 Playbooks**:
   - **Playbook 1**: Start Modal, Challenge vs Skirmish Tabs, Faction Selection, Launch Operation & HUD Initialization
   - **Playbook 2**: Camera Panning (`WASD`/Arrows), Minimap Left-Click Jump & `[Space]` Alert Jump
   - **Playbook 3**: Base Construction via Builder (`#btn-select-builder` & `[B]`), Dozer Right-Click Physical Movement, Multi-Frame `BUILD` Ghost Preview (`canPlaceBuildingAt`), Collision Rejection & Full Scaffold Construction
   - **Playbook 4**: Structure Selection on Canvas, Unit Queueing, Right-Click Cancel/Refund & Rally Points
   - **Playbook 5**: Unit Selection on Canvas (Single-Click, Double-Click Type Select, Drag-Box Combat Priority Filter & Control Groups `Ctrl+1`/`1`)
   - **Playbook 6**: Contextual Right-Click Orders, Physical Squad Translation across Frames, `Shift` Waypoints, Tactical Stances (`Attack-Move`, `Guard`, `Scatter`, `Stop`), `Ctrl` Force-Fire & Civilian Bunker Garrison/Evacuate
   - **Playbook 7**: Economy & Supply Chain (`Supply Center` -> `Chinook` Harvest -> Credit Tick & Low-Power Brownout Penalty)
   - **Playbook 8**: Generals Powers Modal (`[F]`), Power Unlock, Tactical Targeting (`F1`) & Superweapon Countdown
   - **Playbook 9**: Pause (`[P]`), Audio Toggles, Victory/Defeat Modal & Next Operation Flow
   - **Playbook 10**: HUD Overhaul (12-Slot Grid, Sell `[Z]` 50% Refund, `#selection-summary` Sub-Type Filtering, `#control-group-bar`, `#power-strip`, Mouse Wheel Zoom & `[Home]` Reset)
   - **Playbook 11**: Early-Game AI Power Grace Period, Move Marker Decay & Game Menu Settings (`#opt-health-bars`, `#opt-ui-scale`, `#btn-open-powers-preview`, Victory Credits Stat)
   - **Playbook 12**: `PlanSimulator` Auto-Play (`#btn-auto-sim` / `Cmd+T`, `5x` Warp Speed Multiplier, Complete Building Construction & Unit Production)
   - **Playbook 13**: macOS Retina (`devicePixelRatio = 2`) Selection Box Transform Alignment (`BUG-UI-07`), `BUILD`-Mode Left-Click Selection Trap (`BUG-UI-08`), and Same-Frame Move Marker `t: 0` Initialization (`BUG-UI-09`)
3. **Generate the Structured Bug Report**:
   - Document every failed assertion with Severity (`CRITICAL P0` / `HIGH P1` / `MEDIUM P2` / `LOW P3`), exact file & line numbers, Human Reproduction Steps, Root Cause Analysis, and Concrete Fix Snippet in `BUG_REPORT.md`.
