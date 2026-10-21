# The 7 RTS QA Prospector Lenses (`rts-bug-prospector`)

Apply **Lenses 1–3** for a **Quick Pass**, and **all 7 Lenses** for a **Full Pass**. Every lens is designed to catch bugs that survive syntax checks, unit tests, and naive headless QA runs.

---

## Lens 1: Synchronous State vs. Physical & Visual Reality *(Quick & Full)*

**The Question**: *Did the unit or building actually move, construct, or render across frames on screen, or did an event handler just mutate a state string (`u.state = 'MOVE'`) and play audio on the same tick?*

- **What to Check**:
  - In `js/ui.js` / `js/engine.js`: Does issuing a right-click (`issueRightClick`) or build order (`issueBuildOrder`) set `u.state` and trigger `audio.playVoice()` synchronously inside `mousedown`/`contextmenu`, while the actual movement (`updateUnit(u, dt)`) depends on `requestAnimationFrame` continuing to fire?
  - In `tests/human_qa_runner.js`: Does the test assert `u.state === 'MOVE'` immediately after clicking, or does it step 45–60 frames (`stepFrames(60)`) and assert **physical Euclidean displacement** ($\sqrt{(x_1 - x_0)^2 + (y_1 - y_0)^2} > 15\text{px}$) and **building HP/progress growth** (`b.hp > initialHp`, `b.constructed === true`)?
- **Verdict Trigger**:
  - **`FLUNK`** if a test or fix claims "movement/building works" without verifying multi-frame physical displacement and `rafCallback !== null`.

---

## Lens 2: Multi-Frame Modal Latency (`commandMode` Survival) *(Quick & Full)*

**The Question**: *What happens on the `requestAnimationFrame` ticks **between** clicking a HUD button (`commandMode = 'BUILD' | 'POWER' | 'SUPERWEAPON' | 'RALLY' | 'ATTACK_MOVE' | 'ABILITY'`) and clicking `#game-canvas`?*

- **What to Check**:
  - A real human player takes 200–800ms (12–48 frames at 60 FPS) to move the mouse from `#command-card-grid` to `#game-canvas`. During every single one of those frames, `ui.render()` calls `renderCommandOverlay()` and `renderHoverTooltip()`.
  - If a test clicks `.cmd-btn` and then immediately calls `canvasMouse('mousedown', ...)` with **zero** `stepFrames()` in between, `renderCommandOverlay()` is never executed while `commandMode` is active!
- **Verdict Trigger**:
  - **`FLUNK`** if any modal `commandMode` test transitions from mode entry to mode exit in `0` frames without calling `stepFrames(2..5)` while the cursor moves across `#game-canvas`.
  - **`FLUNK`** if `renderCommandOverlay()` or `renderHoverTooltip()` calls any method or reads any property that is undefined during any `commandMode` or `selectedAbility`.

---

## Lens 3: Real Input Surface vs. God-Mode Bypass *(Quick & Full)*

**The Question**: *Did the test or feature work through actual `#game-canvas` mouse/keyboard coordinates with real CSS layout offsets and Retina DPR scaling, or did it use a backdoor shortcut?*

- **What to Check**:
  - **No Engine Backdoors**: Search `tests/human_qa_runner.js` for `engine.selectedEntities =`, `engine.commandMode =`, `engine.placeBuilding(`, or `engine.issueRightClick(`. Tests must dispatch real DOM `MouseEvent` / `KeyboardEvent` on `#game-canvas` and `.cmd-btn`.
  - **No HUD Shortcut Substitution for Canvas Selection**: Selecting a builder via `#btn-select-builder` tests the HUD button, **not** canvas selection. Playbooks must also click and box-drag directly on `#game-canvas` to select both `isBuilder` units and combat units (`INFANTRY`, `VEHICLE`).
  - **Real Bounding Rect & Retina DPR (`2x`)**: In a real browser/WKWebView, `#game-canvas` sits at `top: 36px` (`--top-bar-h: 36px`) and on macOS Retina has `window.devicePixelRatio = 2` (`canvas.width = 2 * clientWidth`). Check whether `getBoundingClientRect()` and `devicePixelRatio = 2` are simulated and whether `engine.pixelRatio` matches `ui.js` transforms.
- **Verdict Trigger**:
  - **`FLUNK`** if canvas selection or placement is only verified via `#btn-select-builder` or at `devicePixelRatio = 1` with `{top: 0, left: 0}` while CSS/DPR mismatches exist in `engine.js` or `ui.js`.

---

## Lens 4: State-Machine & Command-Mode Escape Hatches *(Full)*

**The Question**: *When a player or unit enters a modal state (`commandMode` in `ui.js` or `u.state` in `engine.js`), can they get permanently stuck when something goes slightly off-script?*

- **What to Check**:
  - **UI `commandMode` Traps (`js/ui.js`)**: While in `commandMode === 'BUILD' | 'POWER' | 'SUPERWEAPON' | 'ABILITY' | 'RALLY' | 'ATTACK_MOVE'`, what happens if the player:
    1. Left-clicks an **invalid** build spot (water, cliff, overlapping another building, or insufficient credits)?
    2. Left-clicks a **friendly unit or building** to switch selection?
    3. Drags a **selection box** on `#game-canvas`?
    4. Right-clicks or presses `Escape`?
  - **Unit State Deadlocks (`js/engine.js`)**:
    1. **Collision vs. Arrival Radius**: In `BUILD`, `HARVEST`, `RETURN_CARGO`, `ENTER_GARRISON`, and `CAPTURE`, compare the target stand-off distance set when issuing the order against `resolveCollisions()` pushback distance and `updateUnit()` arrival radius. If `orderDist > arrivalRadius` or `collisionPushback > arrivalRadius`, the unit will stop short and never execute the action.
    2. **Target Death Mid-Order**: What happens when a building scaffold is destroyed while a Dozer is in `state === 'BUILD'`, or a Supply Center is destroyed while a Harvester is in `state === 'RETURN_CARGO'`?
- **Verdict Trigger**:
  - **`FLUNK`** if collision pushback prevents arrival in `BUILD`/`HARVEST`/`CAPTURE`, or if a player cannot select units on `#game-canvas` after clicking a build button.
  - **`CAVEAT`** if an edge-case cancellation path requires pressing `Escape` instead of natural click-switching.

---

## Lens 5: Cross-File Schema & Property Conservation *(Full)*

**The Question**: *Does every property name read by a consumer (`ui.js`, `ai.js`, `simulator.js`) identically match the property name written by its producer (`data.js`, `engine.js`, `index.html`, `css/style.css`)?*

- **What to Check**:
  - `js/data.js` $\rightarrow$ `js/engine.js`, `js/ai.js`, `js/simulator.js`, `js/ui.js`:
    - `def.trains` (not `def.produces`)
    - `def.isCommandCenter` (not `def.isHQ`)
    - `def.isSupplyDepot` (not `def.isSupplyDrop`)
    - `def.prerequisites` (array of building defIds)
    - `def.power` (positive = producer, negative = consumer)
  - `js/engine.js` $\rightarrow$ `js/ui.js`, `js/simulator.js`:
    - `engine.pixelRatio` (not `engine.dpr`)
    - `team.stats.creditsEarned` (not `creditsCollected`)
    - `engine.canPlaceBuilding(defId, x, y, team)` (not `canPlaceBuildingAt`)
    - `b.constructed` (must be `true` before counting a building as operational for tech, power, or training)
  - `index.html` / `css/style.css` $\rightarrow$ `js/ui.js` / `js/engine.js`:
    - `--top-bar-h` and `--cmd-bar-h` (not `--hud-top-h` / `--hud-bottom-h`)
    - Checkbox `.checked` (not `.value === 'on'`)
    - `<select>` option scale (`"100"` $\rightarrow$ `/ 100` $\rightarrow$ `1.0`)
- **Verdict Trigger**:
  - **`FLUNK`** on any live property mismatch that causes `undefined`, `NaN`, or a `TypeError`.

---

## Lens 6: Render-Loop Survival & Silent Canvas Corruption *(Full)*

**The Question**: *Does `requestAnimationFrame` stay alive across all 13 playbooks, and are all Canvas 2D API calls free of `NaN` / `Infinity` arguments and transform leaks?*

- **What to Check**:
  - **Strict RAF Liveness**: In `tests/human_qa_runner.js`, `stepFrames()` must set `rafCallback = null` **before** calling `cb(simTime)` so that if an exception is thrown inside `engine.loop()`, `rafCallback` remains `null` and immediately fails the test.
  - **`NaN` Canvas Calls**: Check all `ctx.arc(x, y, r, ...)`, `ctx.fillRect(...)`, and `ctx.drawImage(...)` calls. Any particle, shockwave, or `moveMarker` pushed without `t: 0` will turn `m.t += dt` into `NaN` and pass `NaN` radius to `ctx.arc()`.
  - **`ctx.save()` / `ctx.restore()` & `ctx.setTransform()` Balance**: Check that `engine.render()` and `ui.render()` agree on the base transform (`ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0)`).
- **Verdict Trigger**:
  - **`FLUNK`** if `rafCallback` dies, if `ctx.setTransform` disagrees between `engine.js` and `ui.js`, or if any `ctx.arc` receives `NaN` or negative radius.

---

## Lens 7: Asymmetric Faction, Sub-General & Time-Scale Parity *(Full)*

**The Question**: *Does a feature or fix that works for USA at `1x` speed also work for China and GLA, across all 9 sub-generals (`generalIndex 0..8`), and under Simulator Warp (`5x–25x`)?*

- **What to Check**:
  - **USA**: Dozer (`isBuilder: true`, `canHarvest: false`), Chinook (`isHarvester: true`, `isAir: true`), Cold Fusion Reactor (`power: 5`).
  - **China**: Dozer (`isBuilder: true`), Supply Truck (`isHarvester: true`, ground collision), Nuclear Reactor (`power: 10`).
  - **GLA**: Worker (`isBuilder: true` **AND** `isHarvester: true`), **no power plants** (`power: 0` across all buildings), Tunnel Network garrison/heal, Palace garrison, Salvage crates (`canSalvage: true`).
  - **Sub-General Modifiers (`js/data.js` `GENERALS`)**: Cost/buildTime/armor/damage multipliers for Generals `0..8` must not produce `NaN` when a field is omitted.
  - **Warp Speed (`engine.gameSpeed = 5..25`)**: In `engine.loop()`, `dt` is clamped (`Math.min(0.05, ...)`), multiplied by `this.gameSpeed`, and sub-stepped (`MAX_STEP = 0.05`). Verify high `gameSpeed` does not cause units to overshoot arrival radii (`BUILD`, `HARVEST`) in a single sub-step.
- **Verdict Trigger**:
  - **`FLUNK`** if a faction's builder/harvester cannot build or harvest, or if sub-general modifiers produce `NaN`.
  - **`CAVEAT`** if high time-scale (`25x`) causes occasional waypoint overshoot without breaking normal `1x–2x` play.
