# C&C Generals: Zero Hour — Human QA Post-Mortem & Bug Report for Main Agent

- **Target Branch**: `feat/hud-overhaul`
- **Commits Analyzed**: `0db2d13` (where user reproduced "units not getting selected, Bulldozer selected via HUD button but not moving") and `f831a1a` (current `HEAD`)
- **Automated Human QA Runner**: [`tests/human_qa_runner.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/tests/human_qa_runner.js) (`node tests/human_qa_runner.js`)
- **Latest Execution Summary (23 Oct 2026)**: **13 Playbooks | 154 Synthetic Human UI Actions Dispatched | 87 Assertions | 87 Passed (`87/87 PASS`) | 0 Active Failures (All 12 Bugs `BUG-UI-01..09`, `BUG-ENG-01..02`, `BUG-AI-01` Resolved & Verified)**

---

## Part 1: Root-Cause Analysis of the User's Reported Symptoms & Why the Old QA Playbook Missed Them

### Why the User Experienced:
> *"the units are not getting selected, the buldoser is getting selected but not moving, buildings are not showing up, the audio tells it might be running in the background"*

1. **`BUG-LOOP-01` (CRITICAL P0 in `0db2d13`, fixed in `f831a1a`) — `TypeError: this.canPlaceBuildingAt is not a function` Permanently Killed the `requestAnimationFrame` Loop**:
   - In [`js/engine.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/engine.js#L4124-L4137) (`renderCommandOverlay`), whenever `this.commandMode === 'BUILD' && this.pendingBuildId`, `render()` called `this.canPlaceBuildingAt(this.pendingBuildId, 0, mx, my)`. In `0db2d13`, only `canPlaceBuilding(defId, x, y)` existed (`canPlaceBuildingAt` was undefined).
   - In [`js/ui.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L123-L149) (`0db2d13`), `frame(now)` called `engine.render()` **before** `requestAnimationFrame(frame)` with no `try/catch`.
   - **Exact Human Flow**:
     1. The user clicked `#btn-select-builder` (`🚜 Dozer / Worker [B]`) in the top bar (or pressed `B`). Because `#btn-select-builder`'s DOM `click` listener ([`js/ui.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L670-L683)) runs **synchronously inside the browser event handler**, it added the Dozer to `engine.selectedIds`, updated `#inspector-title` to `USA Construction Dozer`, populated `#command-card-grid`, and played `ZH_AUDIO.playSFX('click')` — **even if the `requestAnimationFrame` loop was already dead or about to die**!
     2. The instant the user clicked any building cameo on the Command Card (`commandMode = 'BUILD'`), the very next animation frame threw `Uncaught TypeError: this.canPlaceBuildingAt is not a function` inside `renderCommandOverlay()`, **permanently halting `frame(now)`** before `requestAnimationFrame(frame)` could be scheduled.
     3. When the user right-clicked the map to move the selected Bulldozer ([`js/ui.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L2203-L2400)), the `mousedown` handler synchronously set `u.state = 'MOVE'` and called `ZH_AUDIO.speak(...)` (so the Bulldozer spoke its move acknowledgment in the background!), **but because `frame(now)` was dead, `engine.stepFixed(dt)` and `engine.render()` never ran again — so the Bulldozer never moved a single pixel and no placed buildings ever rendered!**
     4. Even before `frame(now)` crashed (or if the user placed a scaffold before the first render), in `0db2d13` [`js/engine.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/engine.js#L2340-L2345), the Dozer build range check required `d <= site.radius + u.radius + 22`, whereas `startBuildingPlacement()` ordered the Dozer to `x + site.radius + builder.radius + 8` and spatial collision resolution pushed the Dozer beyond `+22px`, causing the Dozer to oscillate or stall on `BUILD` orders.

2. **Why the Old QA Playbook Missed It (5 Blind Spots Fixed in [`tests/human_qa_runner.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/tests/human_qa_runner.js))**:
   - **Blind Spot 1 (Zero-Frame "Teleport" Placement)**: The old runner clicked the Reactor button on the Command Card (`commandMode = 'BUILD'`) and on the **very next synchronous JS line** called `human.leftClickWorld(reactorSpot.x, reactorSpot.y)`, which placed the building and reset `commandMode = null` **with 0 frames rendered in between**. `renderCommandOverlay()` (`this.canPlaceBuildingAt`) was never called during the test!
   - **Blind Spot 2 (Stale `rafCallback` Reference)**: In the old runner, `requestAnimationFrame(fn)` set `rafCallback = fn`, and `stepFrames()` called `rafCallback(simClockMs)` without clearing `rafCallback = null` first. Even if `frame(now)` threw before re-registering `requestAnimationFrame`, `rafCallback` still held the previous function reference.
   - **Blind Spot 3 (Asserting `u.state === 'MOVE'` Instead of Physical $\Delta x, \Delta y$ Across Frames)**: Playbook 6 only checked `squad.every(u => u.state === 'MOVE')` on the same tick after `rightClickWorld`, without stepping frames to verify the units actually changed `(u.x, u.y)` coordinates.
   - **Blind Spot 4 (Unrealistic Canvas `getBoundingClientRect` & `devicePixelRatio = 1`)**: The old runner mocked `gameCanvas._rect = { left: 0, top: 0, width: 1280, height: 720 }` at `devicePixelRatio = 1` instead of `top: 36, height: 500` and macOS Retina `devicePixelRatio = 2`.
   - **Blind Spot 5 (Not Testing `BUILD`-Mode Left-Click Selection Trap)**: The old runner never tested what happens when a human player is in `BUILD` mode, clicks an existing structure or unit, and expects to select it.

---

## Part 2: Resolved UI Bugs Verified by Playbook 13 (`87/87 PASS`)

Running the upgraded 13-Playbook Human QA Suite (`node tests/human_qa_runner.js`) verifies all **3 Retina & `BUILD`-Mode UI/Selection fixes** (`BUG-UI-07`, `BUG-UI-08`, `BUG-UI-09`) alongside the 9 earlier human-QA fixes (`BUG-UI-01..06`, `BUG-ENG-01..02`, `BUG-AI-01`):

### 1. `[BUG-UI-07]` (HIGH / P1) — macOS Retina (`devicePixelRatio = 2`) Drag-Selection Box Draws at 50% Size & 50% Coordinates
- **File & Lines**: [`js/ui.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L2402-L2419) vs. [`js/ui.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L201-L220) and [`js/engine.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/engine.js#L3391-L3400)
- **QA Playbook Failure**:
  `❌ FAIL | [Playbook 13] renderSelectionBox() scales drag-selection marquee by engine.pixelRatio (2x on Retina) so visual box matches cursor — devicePixelRatio=2, engine.pixelRatio=2, engine.dpr=undefined, marqueeTransformScaleX=1`
- **Root Cause**:
  In [`resizeCanvases()`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L205-L216), the canvas physical buffer is scaled by `dpr = Math.min(window.devicePixelRatio || 1, 2)` (`2` on all Retina Macs) and stored on `engine.pixelRatio = dpr`. Inside [`engine.render()`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/engine.js#L3394), the engine sets `const dpr = this.pixelRatio || 1; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);`.
  However, right after `engine.render()` returns, [`renderSelectionBox()`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L2405-L2407) executed `const dpr = engine.dpr || 1;`, which evaluated to `1` when `engine.dpr` was undefined, overwriting the `2x` Retina transform.
- **Resolution Verified**:
  [`js/ui.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js) sets `engine.dpr = dpr` alongside `engine.pixelRatio = dpr` in `resizeCanvases()` and resolves `const dpr = engine.pixelRatio || engine.dpr || window.devicePixelRatio || 1;` in `renderSelectionBox()`.

---

### 2. `[BUG-UI-08]` (MEDIUM / P2) — Left-Clicking a Friendly Unit or Structure While in `BUILD` Mode Traps Selection or Places a Foundation Over the Unit
- **File & Lines**: [`js/ui.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L3265-L3290) and [`js/engine.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/engine.js#L1118-L1153)
- **QA Playbook Failure**:
  `❌ FAIL | [Playbook 13] Left-clicking a friendly structure/unit after an invalid BUILD click does not silently trap the player in BUILD mode or place a scaffold over the unit — commandMode=null, selectedIds=17`
- **Root Cause**:
  When `engine.commandMode === 'BUILD'`, left-clicking a friendly unit placed a scaffold directly over the unit (because `canPlaceBuilding()` only checked buildings), and left-clicking an existing friendly structure after a failed placement kept `BUILD` mode locked instead of selecting the structure.
- **Resolution Verified**:
  In [`js/ui.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L3265-L3290), left-clicking a friendly unit while in `BUILD` mode immediately exits `BUILD` mode and selects the unit; left-clicking an invalid footprint rejects placement once (warning the player while keeping `BUILD` mode active), and a subsequent click on an existing friendly building exits `BUILD` mode and selects that building. Both Playbook 3 and Playbook 13 pass cleanly.

---

### 3. `[BUG-UI-09]` (LOW / P2) — `pushMoveMarker()` Does Not Initialize `t: 0`, Causing `NaN` `ctx.arc` Radius on Same-Frame Render
- **File & Lines**: [`js/ui.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L2192-L2201) vs. [`js/engine.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/engine.js#L3464-L3481)
- **QA Playbook Failure**:
  `❌ FAIL | [Playbook 13] pushMoveMarker() initializes t: 0 so same-frame engine.render() never passes NaN radius to ctx.arc() — nanArcCallsOnImmediateRender=2, marker[last].t=undefined`
- **Root Cause**:
  `pushMoveMarker()` pushed `{ x: wx, y: wy, color: color || '#22c55e', age: 0, maxAge: 0.55 }` without initializing `t: 0`, causing `renderMoveMarkers()` to compute `NaN` when `engine.render()` ran before `stepFixed(dt)`.
- **Resolution Verified**:
  `pushMoveMarker()` initializes `t: 0` and `renderMoveMarkers()` guards `(m.t || 0)`.

---

## Part 3: Complete Resolved Bug Ledger (`BUG-UI-01..09`, `BUG-ENG-01..02`, `BUG-AI-01`)

| Bug ID | Severity | Summary | Status |
| :--- | :--- | :--- | :--- |
| `BUG-UI-01` | High | `#command-card-grid` overflowed 12-slot layout when unit upgrades + stances stacked | **Resolved ✅** (Playbook 10) |
| `BUG-UI-02` | Medium | `#selection-summary` `.unit-group-chip` click did not filter multi-type selection | **Resolved ✅** (Playbook 10) |
| `BUG-UI-03` | Medium | `#control-group-bar` pill click did not recall bound squad or building | **Resolved ✅** (Playbook 10) |
| `BUG-UI-04` | Low | `#power-strip` quick-cast buttons did not arm `commandMode = 'POWER'` | **Resolved ✅** (Playbook 10) |
| `BUG-UI-05` | Medium | Canvas CSS height did not dynamically subtract `--top-bar-h` (`36px`) + `--cmd-bar-h` (`184px`) | **Resolved ✅** (Playbook 11) |
| `BUG-UI-06` | Low | `#btn-open-powers-preview` did not open `#powers-modal` when Rank Points = 0 | **Resolved ✅** (Playbook 11) |
| `BUG-UI-07` | High | macOS Retina (`devicePixelRatio = 2`) drag-selection marquee drew at 50% scale | **Resolved ✅** (Playbook 13) |
| `BUG-UI-08` | Medium | Left-clicking friendly unit/building in `BUILD` mode trapped selection or placed scaffold over unit | **Resolved ✅** (Playbook 3 & 13) |
| `BUG-UI-09` | Low | `pushMoveMarker()` omitted `t: 0`, causing `NaN` `ctx.arc` radius on same-frame render | **Resolved ✅** (Playbook 13) |
| `BUG-ENG-01` | Medium | Move markers persisted indefinitely when `age` vs `t` properties diverged | **Resolved ✅** (Playbook 11) |
| `BUG-ENG-02` | Medium | Victory modal `creditsEarned` statistic showed current bank instead of cumulative income | **Resolved ✅** (Playbook 11) |
| `BUG-AI-01` | High | AI launched unprovoked superweapon/power strikes within the first 6s of a match | **Resolved ✅** (Playbook 11) |

---

## Verification Command

Run:
```bash
node tests/human_qa_runner.js
```
All **87/87 Human QA assertions** across **Playbooks 1–13 (154 synthetic human actions)** pass with `0` findings.

