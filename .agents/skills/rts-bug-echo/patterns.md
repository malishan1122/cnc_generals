# C&C Generals: Zero Hour — Known Defect Patterns (`rts-bug-echo`)

Use this catalog during **Step 1** and **Step 3** of `rts-bug-echo` to expand a single bug into its full family of sibling checks across `js/*.js`, `index.html`, `css/style.css`, `macos_main.swift`, and `tests/*.js`.

---

## Pattern 1: Cross-File Schema & Property Drift (`data.js` / `engine.js` $\leftrightarrow$ Consumers)

- **Signature**: A consumer (`js/ai.js`, `js/simulator.js`, `js/ui.js`) reads a property name on a unit definition, building definition, team object, or engine instance that does not match the producer key in `js/data.js` or `js/engine.js`. Because JavaScript returns `undefined` instead of throwing on missing properties, boolean checks silently evaluate to `false` and numeric checks become `NaN` or `0`.
- **Historical Examples in This Repo**:
  - `def.produces` read in `ai.js` / `simulator.js` instead of `def.trains` (`data.js`) $\rightarrow$ AI never identified production buildings.
  - `def.isHQ` / `def.isSupplyDrop` read in `simulator.js` instead of `def.isCommandCenter` / `def.isSupplyDepot` (`data.js`).
  - `t.stats.creditsCollected` read in `simulator.js` instead of `t.stats.creditsEarned` (`engine.js`).
  - `engine.dpr` read in `ui.js` instead of `engine.pixelRatio` (`engine.js`).
- **Sibling Search Tokens**:
  - Compare all `\.def\.[a-zA-Z0-9_]+` and `\bdef\.[a-zA-Z0-9_]+` across `js/ai.js`, `js/simulator.js`, `js/ui.js`, and `js/engine.js` against keys defined in `js/data.js`.
  - Compare all `\.stats\.[a-zA-Z0-9_]+` across `js/*.js` against `team.stats` in `js/engine.js`.
- **False-Positive Trap**: Some code intentionally checks both (`def.isCommandCenter || def.isHQ`) — classify those as `WATCH` (legacy alias) or `OK`.

---

## Pattern 2: Uncalled or Renamed Method on Modal Render / Command Path

- **Signature**: A method call inside a conditional render or input branch (`if (this.commandMode === 'BUILD')`, `if (this.selectedEntities.length > 0)`, `if (u.state === 'CAPTURE')`) calls a helper name that does not exist on `GameEngine` or `GameUI`, throwing an uncaught `TypeError` inside `requestAnimationFrame` and permanently killing the game loop.
- **Historical Examples in This Repo**:
  - `this.engine.canPlaceBuildingAt(...)` called in `ui.js` `renderCommandOverlay()` instead of `this.engine.canPlaceBuilding(...)` (`BUG-CRASH-01`).
- **Sibling Search Tokens**:
  - Every `this\.engine\.[a-zA-Z0-9_]+\(` in `js/ui.js`, `js/ai.js`, `js/simulator.js` cross-checked against method definitions in `js/engine.js`.
  - Every `this\.[a-zA-Z0-9_]+\(` inside `js/engine.js` and `js/ui.js` cross-checked against class methods on the same class.
- **False-Positive Trap**: Dynamic dispatch or methods attached to `window.ZH_*` globals.

---

## Pattern 3: Retina DPR (`devicePixelRatio`) & CSS Custom Property Mismatch

- **Signature**: Canvas transform or coordinate conversion code mixes `1x` CSS pixels with `2x` backing-store pixels on macOS Retina displays, or reads a CSS custom property name that does not match `css/style.css` (`:root`).
- **Historical Examples in This Repo**:
  - `ui.js` `render()` called `ctx.setTransform(this.engine.dpr || 1, 0, 0, this.engine.dpr || 1, 0, 0)` while `engine.js` stored `this.pixelRatio = window.devicePixelRatio || 1`. On Retina (`pixelRatio = 2`), `ui.js` reset the canvas transform to `1x` on Frame 1, rendering the entire world at 50% scale while mouse clicks used `2x` math (`BUG-UI-07`).
  - `engine.js` `resize()` queried `--hud-top-h` and `--hud-bottom-h`, whereas `css/style.css` defined `--top-bar-h: 36px` and `--cmd-bar-h: 184px` (`BUG-UI-08`).
- **Sibling Search Tokens**:
  - `setTransform`, `resetTransform`, `scale(`, `devicePixelRatio`, `pixelRatio`, `dpr`, `getBoundingClientRect`, `clientWidth`, `clientHeight`, `canvas.width`, `canvas.height`, `screenToWorld`, `worldToScreen`.
  - `getPropertyValue\(['"]--[a-zA-Z0-9_-]+['"]\)` cross-checked against `:root` in `css/style.css`.

---

## Pattern 4: Modal `commandMode` Input Trap on `#game-canvas`

- **Signature**: `mousedown` / `mouseup` / `click` handlers in `js/ui.js` branch on `this.commandMode` (`'BUILD'`, `'RALLY'`, `'ATTACK_MOVE'`, `'POWER'`, `'SUPERWEAPON'`, `'ABILITY'`) and early-return (`return;`) without allowing the player to click a friendly unit/building to switch selection or recover when clicking an invalid location.
- **Historical Examples in This Repo**:
  - Entering `commandMode = 'BUILD'` (Dozer selected + clicking Power Plant) trapped all left-clicks on `#game-canvas` inside `if (this.commandMode === 'BUILD') { ... return; }`, making it impossible to left-click combat units or box-select until exiting build mode (`BUG-UI-09`).
- **Sibling Search Tokens**:
  - Every `if \(.*this\.commandMode` and `switch \(this\.commandMode\)` in `js/ui.js`.
  - Check what happens in each mode on: (a) left-clicking a valid target, (b) left-clicking an invalid target, (c) left-clicking a friendly unit/building, (d) dragging a selection box, (e) right-clicking, and (f) pressing `Escape`.

---

## Pattern 5: Unconstructed Foundation (`!b.constructed`) Treated as Active Structure

- **Signature**: Code queries `engine.buildings` (or calls `countTeamBuildings(team, defId, false)`) without filtering for `b.constructed && !b.dead`, treating a 1% HP unbuilt scaffold as an operational building for tech-tree prerequisites, unit production, power output, or AI build quotas.
- **Historical Examples in This Repo**:
  - `ai.js` checked `countBuilding('USA_BARRACKS') === 0` using `countTeamBuildings(..., false)`, so as soon as a scaffold was placed, the AI thought the building was complete; if the Dozer died en route, the AI never retried or re-dispatched a builder.
- **Sibling Search Tokens**:
  - Every `.buildings.filter`, `.buildings.find`, `.buildings.some`, `for (... of this.buildings)`, and `countTeamBuildings` across `js/engine.js`, `js/ai.js`, `js/simulator.js`, and `js/ui.js`.
- **Classification Rule**:
  - Queries for **placement collision**, **Dozer repair/build dispatch**, or **enemy targeting** *should* include `!b.constructed` (`OK`).
  - Queries for **tech tree unlock (`prerequisites`)**, **unit training (`trains`)**, **superweapon/power readiness**, or **economy income** *must* require `b.constructed === true` (`BUG` if missing).

---

## Pattern 6: Stand-Off Distance vs. Collision Pushback Deadlock

- **Signature**: A unit order sets a movement destination at distance $D_{\text{order}}$ from a target's center, while `resolveCollisions()` pushes units out to $D_{\text{push}}$, and the state machine's arrival check requires $D \le D_{\text{arrive}}$. Whenever $D_{\text{order}} > D_{\text{arrive}}$ or $D_{\text{push}} > D_{\text{arrive}}$, the unit oscillates or idles forever right outside the target.
- **Historical Examples in This Repo**:
  - `issueBuildOrder` / `placeBuilding` sent the Dozer to `b.radius + u.radius + 10`, `resolveCollisions` pushed it to `b.radius + u.radius + 4`, and `updateUnit` (`BUILD` state) checked `dist <= b.radius + u.radius + 18` (or failed when `moveTarget` cleared before reaching interaction range).
- **Sibling Search Tokens**:
  - All distance thresholds in `js/engine.js` `updateUnit()`: `state === 'BUILD'`, `'HARVEST'`, `'RETURN_CARGO'`, `'ENTER_GARRISON'`, `'CAPTURE'`, `'REPAIR'`, and `resolveCollisions()`.
  - Verify the strict inequality chain for every interaction state:
    $$D_{\text{push}} \le D_{\text{order}} < D_{\text{arrive}}$$

---

## Pattern 7: Uninitialized VFX / Entity Lifecycle Timer (`t` vs `age` $\rightarrow$ `NaN` Canvas Calls)

- **Signature**: An object pushed into a render/update array (`moveMarkers`, `particles`, `shockwaves`, `projectiles`, `floatingTexts`, `pings`) omits its lifecycle timer property (`t: 0` or `age: 0`) or uses a mismatched name (`age` vs `t`). During `update(dt)`, `obj.t += dt` produces `NaN`, which:
  1. Passes `obj.t < obj.maxT` (`NaN < 0.65 === false`, or in filter `m.t < 0.65` $\rightarrow$ `false` or infinite retention depending on negation), and
  2. Feeds `NaN` radius into `ctx.arc(x, y, r, 0, Math.PI * 2)` during `render()`.
- **Historical Examples in This Repo**:
  - `ui.js` pushed `{ x, y, color, maxR, duration }` into `engine.moveMarkers` without `t: 0`, causing `m.t += dt` to become `NaN` and passing `NaN` radius to `ctx.arc()` (`BUG-ENGINE-04`).
- **Sibling Search Tokens**:
  - Every `.moveMarkers.push`, `.particles.push`, `.shockwaves.push`, `.projectiles.push`, `.floatingTexts.push`, `.pings.push`, `.crates.push` across `js/engine.js` and `js/ui.js`.

---

## Pattern 8: DOM Control Type vs. Event Listener Contract Mismatch (`index.html` $\leftrightarrow$ `ui.js`)

- **Signature**: An `<input>` or `<select>` element in `index.html` has a type or value domain that does not match how `js/ui.js` reads it, or a button in `index.html` has no event listener bound in `js/ui.js`.
- **Historical Examples in This Repo**:
  - `#opt-fog` is `<input type="checkbox" checked>`, but `ui.js` read `e.target.value === 'on'` (always `'on'` even when unchecked) instead of `e.target.checked` (`BUG-UI-01`).
  - `#opt-gamespeed` options have values `"70"`, `"100"`, `"115"`, `"130"`, `"150"`, but `ui.js` assigned `parseFloat(e.target.value)` directly to `engine.gameSpeed` (`100x` speed instead of `1.0x`) (`BUG-UI-02`).
  - `#btn-auto-sim` and `#btn-open-powers-preview` existed in `index.html` with zero `addEventListener` bindings in `js/ui.js` (`BUG-UI-04`, `BUG-UI-05`).
- **Sibling Search Tokens**:
  - Every `id="..."` on `<button>`, `<input>`, `<select>` in `index.html` cross-checked against `getElementById` / `querySelector` in `js/ui.js`.

---

## Pattern 9: QA Runner False-Positive / God-Mode Bypass (`tests/human_qa_runner.js`)

- **Signature**: A QA playbook test in `tests/human_qa_runner.js` mutates engine state directly, clicks a HUD shortcut instead of `#game-canvas`, or teleports from modal activation to canvas click in 0 frames.
- **Historical Examples in This Repo**:
  - Playbook 2 clicked `#btn-select-builder` instead of `#game-canvas` (`QA-GAP-02`).
  - Playbook 3 clicked `.cmd-btn` (`BUILD`) and immediately clicked `#game-canvas` with `0` `stepFrames()` in between, missing `renderCommandOverlay()` crash (`QA-GAP-01`).
  - `stepFrames()` did not clear `rafCallback = null` before invoking `cb(simTime)`, masking `requestAnimationFrame` loop death (`QA-GAP-03`).
- **Sibling Search Tokens**:
  - Search `tests/*.js` for direct assignments `engine.selectedEntities =`, `engine.commandMode =`, `u.state =`, or `.click()` followed immediately by `canvasMouse(` without an intervening `stepFrames(`.
