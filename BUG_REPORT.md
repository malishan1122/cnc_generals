# C&C Generals: Zero Hour — Human QA Post-Mortem & Bug Report for Main Agent

- **Target Branch**: `feat/hud-overhaul`
- **Commits Analyzed**: `0db2d13` (where user reproduced "units not getting selected, Bulldozer selected via HUD button but not moving") and `f831a1a` (current `HEAD`)
- **Automated Human QA Runner**: [`tests/human_qa_runner.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/tests/human_qa_runner.js) (`node tests/human_qa_runner.js`)
- **Execution Summary on `HEAD` (`f831a1a`)**: **158 Synthetic Human UI Actions Dispatched | 65 Assertions | 62 Passed | 3 Active Bugs Failing (`BUG-UI-07`, `BUG-UI-08`, `BUG-UI-09`)**

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

## Part 2: Active Bugs in Current `HEAD` (`f831a1a`) for the Main Agent to Fix

Running the upgraded 13-Playbook Human QA Suite (`node tests/human_qa_runner.js`) on `HEAD` (`f831a1a`) catches **3 active UI/Selection bugs** that directly impact unit selection and visual feedback on macOS:

### 1. `[BUG-UI-07]` (HIGH / P1) — macOS Retina (`devicePixelRatio = 2`) Drag-Selection Box Draws at 50% Size & 50% Coordinates
- **File & Lines**: [`js/ui.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L2402-L2419) vs. [`js/ui.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L201-L220) and [`js/engine.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/engine.js#L3391-L3400)
- **QA Playbook Failure**:
  `❌ FAIL | [Playbook 13] renderSelectionBox() scales drag-selection marquee by engine.pixelRatio (2x on Retina) so visual box matches cursor — devicePixelRatio=2, engine.pixelRatio=2, engine.dpr=undefined, marqueeTransformScaleX=1`
- **Root Cause**:
  In [`resizeCanvases()`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L205-L216), the canvas physical buffer is scaled by `dpr = Math.min(window.devicePixelRatio || 1, 2)` (`2` on all Retina Macs) and stored on `engine.pixelRatio = dpr`. Inside [`engine.render()`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/engine.js#L3394), the engine sets `const dpr = this.pixelRatio || 1; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);`.
  However, right after `engine.render()` returns, [`renderSelectionBox()`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L2405-L2407) executes:
  ```js
  const dpr = engine.dpr || 1;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ```
  Because `engine.dpr` is **`undefined`** (the property on `GameEngine` is `engine.pixelRatio`), `dpr` evaluates to `1`! `ctx.setTransform(1, 0, 0, 1, 0, 0)` overwrites the `2x` Retina transform on the `2560x1000` physical canvas buffer and draws the green selection box using CSS pixel coordinates (`boxStartScreenX`, `boxEndScreenX`) at **half size and half position** (shifted 50% toward the top-left corner away from the player's cursor).
- **Fix for Main Agent**:
  In [`js/ui.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L2405), change:
  ```js
  const dpr = engine.pixelRatio || engine.dpr || window.devicePixelRatio || 1;
  ```
  (and optionally set `engine.dpr = dpr;` alongside `engine.pixelRatio = dpr;` in [`resizeCanvases()`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L216)).

---

### 2. `[BUG-UI-08]` (MEDIUM / P2) — Left-Clicking a Friendly Unit or Structure While in `BUILD` Mode Traps Selection or Places a Foundation Over the Unit
- **File & Lines**: [`js/ui.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L1946-L1958) and [`js/engine.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/engine.js#L1118-L1153)
- **QA Playbook Failure**:
  `❌ FAIL | [Playbook 13] Left-clicking a friendly structure/unit after an invalid BUILD click does not silently trap the player in BUILD mode or place a scaffold over the unit — commandMode=null, selectedIds=17`
- **Root Cause**:
  1. When the player selects a Dozer and clicks a building cameo on the Command Card (`engine.commandMode = 'BUILD'`), [`canvas.addEventListener('mousedown')`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L1946-L1958) intercepts **every** left-click and returns early before `handleSingleClickSelection` or `isDraggingBox = true`.
  2. If the player changes their mind and left-clicks directly on an existing friendly building (like their Command Center or Barracks) to select it, `startBuildingPlacement` returns `false` (collision), plays an error buzzer, and **keeps `engine.commandMode = 'BUILD'` locked**, refusing to select the clicked building.
  3. Worse, if the player left-clicks directly on one of their own combat units (`targetUnit`) to select it, [`canPlaceBuilding()`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/engine.js#L1118-L1146) only checks building collisions (`this.buildings`), **not friendly units**, so left-clicking a friendly unit while in `BUILD` mode places a building scaffold directly on top of the unit and keeps the Dozer (`id=17`) selected instead of selecting the unit!
- **Fix for Main Agent**:
  In [`js/ui.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L1946-L1958) (inside the `if (engine.commandMode === 'BUILD' && engine.pendingBuildId)` block in `mousedown`):
  Before attempting `startBuildingPlacement`, check if the user clicked directly on an existing friendly unit or friendly building (when `!e.shiftKey`). If a friendly unit or building is directly under the cursor (`hitUnit` or `hitBldg`), cancel `BUILD` mode (`engine.commandMode = null; engine.pendingBuildId = null;`) and fall through to `handleSingleClickSelection(w.x, w.y, false)` so clicking a unit or building selects it naturally!

---

### 3. `[BUG-UI-09]` (LOW / P2) — `pushMoveMarker()` Does Not Initialize `t: 0`, Causing `NaN` `ctx.arc` Radius on Same-Frame Render
- **File & Lines**: [`js/ui.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L2192-L2201) vs. [`js/engine.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/engine.js#L3464-L3481)
- **QA Playbook Failure**:
  `❌ FAIL | [Playbook 13] pushMoveMarker() initializes t: 0 so same-frame engine.render() never passes NaN radius to ctx.arc() — nanArcCallsOnImmediateRender=2, marker[last].t=undefined`
- **Root Cause**:
  [`pushMoveMarker()`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L2194-L2200) pushes `{ x: wx, y: wy, color: color || '#22c55e', age: 0, maxAge: 0.55 }` without initializing `t: 0`. Although `updateSpecialEffects(dt)` now initializes `m.t = (m.t || 0) + dt`, if `engine.render()` runs before `stepFixed(dt)` (for example, while the game is paused or on an immediate redraw), [`renderMoveMarkers()`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/engine.js#L3468) computes `const p = Math.min(1, m.t / 0.45);` where `m.t` is `undefined`, passing `NaN` radius to `ctx.arc()`.
- **Fix for Main Agent**:
  1. In [`js/ui.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L2194-L2200), add `t: 0` to the object pushed in `pushMoveMarker()`:
     ```js
     engine.moveMarkers.push({
       x: wx,
       y: wy,
       color: color || '#22c55e',
       t: 0,
       age: 0,
       maxAge: 0.55
     });
     ```
  2. In [`js/engine.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/engine.js#L3468), guard `m.t` with `const p = Math.min(1, (m.t || 0) / 0.45);`.

---

## Verification Command for the Main Agent

After applying the 3 fixes above, run:
```bash
node tests/human_qa_runner.js
```
All **65/65 Human QA assertions** across Playbooks 1–13 will pass with `0` findings.
