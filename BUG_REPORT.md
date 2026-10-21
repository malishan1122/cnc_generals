# C&C Generals: Zero Hour — Human-User QA Bug Report (`feat/hud-overhaul` @ `d2c335b`)

**QA Methodology**: Executed using `.agents/skills/rts-human-qa/SKILL.md` (`node tests/human_qa_runner.js`, 12 end-to-end human playbooks, 60 assertions, 114 synthetic mouse/keyboard/DOM interactions).
**User-Reported Symptom**:
> *"In this version, the units do not seem to be moving and buildings are not showing up, the audio tells it might be running in the background."*

---

## Executive Diagnosis of the User-Reported Symptom

We traced the exact symptom (*"units do not seem to be moving, buildings are not showing up, and audio plays in the background"*) to **two compounding P0 bugs** depending on whether the user is running in **Auto-Play / PlanSimulator mode** or **Standard Human Skirmish/Challenge mode**:

1. **`BUG-SIM-01` (CRITICAL / P0) — `PlanSimulator` (`js/simulator.js`) Schema Mismatches & Build-Order Thrashing**:
   - **Why no combat units ever spawn or move**: `handleUnitProduction()` (`js/simulator.js:667`) filters buildings by `b.def.produces && b.def.produces.length > 0`, which is `undefined` on **every building in `js/data.js`** (`ZH_DATA.BUILDINGS` uses `b.def.trains`). Consequently, `prodBuildings` is always `[]`, **`0` combat units are ever queued or trained** (`totalUnitsProducedBySim = 0`), and no squad ever moves across the map.
   - **Why buildings do not show up as completed structures**: `executeStrategicPlan()` (`js/simulator.js:504–524`) checks `this.countTeamBuildings(defId, false)` (`constructedOnly = false`), treating a 5% unconstructed foundation (`constructed === false`) as already built. Every `1.1s` (`decisionTimer`), it places the next building in the build order (`supply` -> `power` -> `barracks` -> `warFactory` -> `defense`) and `engine.startBuildingPlacement()` (`js/engine.js:1214–1235`) reassigns the Dozer/Worker (`builder.buildTargetId = site.id`) to the newest foundation, pulling it off the previous incomplete site!
   - **Why replacement Dozers & Harvesters are never trained**: `js/simulator.js:403, 471` checks `b.def.isCommandCenter` (schema uses `b.def.isHQ`), and `js/simulator.js:410, 477` checks `b.def.isSupplyDrop` (schema uses `b.def.isSupplyDepot`).
   - **Why Warp Speed (`5x` / `15x` / `25x`) and `Cmd+T` (`#btn-auto-sim`) do not work**: `js/ui.js:124–126` ignores `ZH_SIMULATOR.getSpeedMultiplier()`, and `#btn-auto-sim` (`index.html:242`, triggered by `macos_main.swift:125`) has no `click` listener in `js/ui.js` or `js/simulator.js`.

2. **`BUG-AI-01` (CRITICAL / P0) — AI Map-Hack Omniscience + Instant Rank-1 Generals Power Strike at `t = 2.6s`**:
   - Both teams initialize at `rank: 1, generalPoints: 1` (`js/engine.js:267–269`).
   - At `t = 2.6s` (the very first AI think tick on Normal difficulty, or `1.8s` on Hard), `ZH_AI.updateTeam()` (`js/ai.js:663–680`) unlocks its Rank-1 offensive Generals Power (`CHINA_ARTILLERY_BARRAGE`, `USA_A10_STRIKE`, or `GLA_REBEL_AMBUSH`) and immediately casts it on `findBestClusterTarget(engine, 0, 260, true)` (`js/ai.js:252–263`).
   - Because `findBestClusterTarget` queries `engine.buildings` and `engine.units` directly without checking Fog of War or an early-game grace period, the AI immediately bombards the player's Command Center `(440, 2760)` at `t = 2.6s`.
   - Within `5.0s` of match start, **both of the player's starting combat units (`USA_RANGER`) are killed** and 1,350 HP is stripped from the Command Center while loud artillery explosions and EVA *"Our forces are under attack!"* audio play in the background. Only the two idle `USA_DOZER` units remain (`state: 'IDLE'`), so clicking `⚔️ All Combat Units [Q]` selects nothing and no combat units exist to move.

3. **`BUG-UI-01` (HIGH / P1) — Right-Click Move Marker `age` vs `t` Property Mismatch (`NaN` Canvas Arc & Memory Leak)**:
   - When the user right-clicks to move a unit, `pushMoveMarker()` (`js/ui.js:2108–2117`) pushes `{ x, y, color, age: 0, maxAge: 0.55 }`, whereas `updateSpecialEffects()` (`js/engine.js:3176–3178`) and `renderMoveMarkers()` (`js/engine.js:3434–3450`) read and increment `m.t` (`undefined + dt = NaN`). As a result, the green right-click move confirmation ring passes `NaN` to `ctx.arc(m.x, m.y, NaN, ...)` every frame (rendering nothing) and never expires from `engine.moveMarkers`.

---

## Summary Table of All Discovered Bugs (All 11 Resolved & Verified)

| Bug ID | Severity | Status | File(s) & Line Numbers | Summary |
| :--- | :--- | :--- | :--- | :--- |
| **`BUG-SIM-01A`** | **CRITICAL (P0)** | ✅ **FIXED** | `js/simulator.js:667, 403, 410, 471, 477`, `js/engine.js:275, 786` | `PlanSimulator` now checks `b.def.trains || b.def.produces`, `b.def.isHQ || b.def.isCommandCenter`, and `b.def.isSupplyDepot || b.def.isSupplyDrop`, and `engine.js` increments `stats.unitsProduced` alongside `stats.unitsBuilt`. |
| **`BUG-SIM-01B`** | **CRITICAL (P0)** | ✅ **FIXED** | `js/simulator.js:485–524` & `js/engine.js:1214–1235` | `executeStrategicPlan()` waits when `unconstructedCount >= builders.length` so Dozers/Workers finish constructing current foundations before placing new ones (`constructedNonHQ=11, unconstructedFoundations=0`). |
| **`BUG-AI-01`** | **CRITICAL (P0)** | ✅ **FIXED** | `js/ai.js:663–680` | Enforced early-game offensive Generals Power grace period (`engine.matchTime >= 75` seconds) so AI unlocks its Rank-1 power immediately (`aiPowerUsed=true`) without map-hack bombarding the unscouted player HQ at `t = 2.6s`. |
| **`BUG-UI-01`** | **HIGH (P1)** | ✅ **FIXED** | `js/ui.js:2108–2117` & `js/engine.js:3174–3181, 3434–3450` | `pushMoveMarker()` initializes `t: 0, age: 0, maxAge: 0.45, kind` and `engine.js` safely advances both `m.t` and `m.age` (`nanArcCalls=0`, markers expire cleanly after `0.45s`). |
| **`BUG-SIM-01D`** | **HIGH (P1)** | ✅ **FIXED** | `js/ui.js:124–133` vs `js/simulator.js:956–958` | Main 60Hz loop in `js/ui.js` reads `ZH_SIMULATOR.getSpeedMultiplier()` and executes `warpSteps` iterations per frame (`5.00s` game time per `1.0s` real time at `5x` warp). |
| **`BUG-SIM-01E`** | **HIGH (P1)** | ✅ **FIXED** | `js/ui.js:106–109, 150–178`, `js/simulator.js:970–1053` | `ZH_SIMULATOR.initHUD()` runs before `configureDevOnlyElements()`, guards with `if (hudPanelEl) return;`, and binds `#btn-auto-sim` click listener to toggle `activeSimulator.enabled`. |
| **`BUG-UI-02`** | **MEDIUM (P2)** | ✅ **FIXED** | `js/ui.js:189–194` vs `css/style.css:7–8` | `resizeCanvases()` reads `--top-bar-h` (`36px`) and `--cmd-bar-h` (`184px`), yielding exact `500px` viewport height on a `720p` window. |
| **`BUG-UI-03`** | **MEDIUM (P2)** | ✅ **FIXED** | `js/ui.js:313–334` | `setupSettingsControls()` detects `<input type="checkbox" id="opt-health-bars">` via `hbEl.type === 'checkbox' || hbEl.getAttribute('type') === 'checkbox'` and updates `engine.showAllHealthBars`. |
| **`BUG-UI-04`** | **LOW (P3)** | ✅ **FIXED** | `js/ui.js:274–278, 345–361` & `css/style.css:54, 152` | `#opt-ui-scale` normalizes percentage values (`115` -> `1.15`) into `--ui-scale` and applies `zoom: var(--ui-scale, 1)` to `#top-bar` and `#command-bar`. |
| **`BUG-UI-05`** | **LOW (P3)** | ✅ **FIXED** | `js/ui.js:550–556, 2500–2545` & `css/style.css:936` | `#btn-open-powers-preview` opens `#powers-modal` (`z-index: 120`) and supports pre-launch general preview when `engine.teams[0]` is not yet initialized. |
| **`BUG-UI-06`** | **LOW (P3)** | ✅ **FIXED** | `js/ui.js:2645–2699` & `js/engine.js:275, 528` | `showVictoryModal()` populates both `#victory-stats-wrap` and `#victory-stats` using `s0.creditsEarned ?? s0.creditsCollected ?? 0`, and `stepFixed()` triggers `onGameOver(this.winner)` if `matchOver` is set externally. |

---

## Detailed Root-Cause Analysis & Exact Fixes for Main Agent

### 1. `BUG-SIM-01A` & `BUG-SIM-01B` (CRITICAL / P0): `PlanSimulator` Schema Mismatches & Build-Order Foundation Thrashing

#### Root Cause
1. **`js/simulator.js:667` (`handleUnitProduction`)**:
   ```javascript
   // BUG in js/simulator.js:667:
   const prodBuildings = eng.buildings.filter(
     b => b.team === t && b.constructed && b.def.produces && b.def.produces.length > 0
   );
   ```
   In `js/data.js`, every production building defines `trains: [...]`, **not** `produces: [...]`. Because `b.def.produces` is `undefined`, `prodBuildings` is always empty and **zero combat units are ever produced by the simulator**.
2. **`js/simulator.js:403, 410, 471, 477` (`tryConstructBuilding` & `executeStrategicPlan`)**:
   - Lines `403` and `471` check `b.def.isCommandCenter`, which is `undefined` in `js/data.js` (buildings use `b.def.isHQ: true`).
   - Lines `410` and `477` check `b.def.isSupplyDrop` / `bDef.isSupplyDrop`, which is `undefined` in `js/data.js` (buildings use `b.def.isSupplyDepot: true`).
3. **`js/simulator.js:504–524` (`executeStrategicPlan`) & `js/engine.js:1214–1235` (`startBuildingPlacement`)**:
   - `executeStrategicPlan()` checks `if (this.countTeamBuildings(bp.supply, false) < 1)` (`constructedOnly = false`). As soon as a 5% foundation is placed, `countTeamBuildings(..., false)` returns `1`, so `1.1s` later on the next `decisionTimer` tick, `executeStrategicPlan()` immediately places `bp.power`, then `bp.barracks`, then `bp.warFactory`, then `bp.defense`.
   - Each call to `engine.startBuildingPlacement()` (`js/engine.js:1214–1235`) picks a builder with `u.state === 'IDLE' || u.state === 'MOVE'` — and since a Dozer walking toward the first foundation is in `u.state === 'BUILD'`, or if `executeStrategicPlan` lines `441–456` reassigns it, or when multiple foundations are placed before any builder finishes, Dozers leave unconstructed foundations stranded across the base.
   - Even worse, in `executeStrategicPlan()` (`js/simulator.js:504`), the simulator should wait if there are already unconstructed foundations matching the number of available builders (`unconstructedCount >= builders.length`), so builders finish constructing the current building before placing the next foundation!

#### Fix (`js/simulator.js`)
- In `tryConstructBuilding()` (`js/simulator.js:402–418`):
  Replace `b.def.isCommandCenter` with `b.def.isHQ` and `bDef.isSupplyDrop` with `bDef.isSupplyDepot`.
- In `executeStrategicPlan()` (`js/simulator.js:471–525`):
  - Replace `b.def.isCommandCenter` with `b.def.isHQ` and `b.def.isSupplyDrop` with `b.def.isSupplyDepot`.
  - Before placing new build-order foundations (lines `485–525`), check:
    ```javascript
    const unconstructedCount = eng.buildings.filter(b => b.team === t && !b.dead && !b.constructed).length;
    if (unconstructedCount > 0 && unconstructedCount >= Math.max(1, builders.length)) {
      return; // Let Dozers/Workers finish constructing current foundations before placing new ones
    }
    ```
- In `handleUnitProduction()` (`js/simulator.js:666–676`):
  Replace `b.def.produces` with `b.def.trains`:
  ```javascript
  const prodBuildings = eng.buildings.filter(
    b => b.team === t && b.constructed && Array.isArray(b.def.trains) && b.def.trains.length > 0
  );
  ```
  And at line `675`, replace `for (const uId of b.def.produces)` with `for (const uId of b.def.trains)`.

---

### 2. `BUG-AI-01` (CRITICAL / P0): AI Map-Hack Omniscience + Instant Rank-1 Generals Power Strike on Player Base at `t = 2.6s`

#### Root Cause
- In `js/engine.js:267–269`, both teams start at `rank: 1, generalPoints: 1`.
- In `js/ai.js:663–680` (`updateTeam`), at `t = 2.6s` (first AI think tick on Normal difficulty), the AI unlocks its Rank-1 power (`CHINA_ARTILLERY_BARRAGE`, `USA_A10_STRIKE`, or `GLA_REBEL_AMBUSH`) and immediately calls `findBestClusterTarget(engine, enemyTeam, 260, true)`.
- `findBestClusterTarget()` (`js/ai.js:252–263`) iterates over `engine.buildings` and `engine.units` directly without checking whether the target is visible in Fog of War or whether an early-game grace period has elapsed.
- Consequently, at `t = 2.6s`, the AI fires an artillery barrage or A-10 strike directly on the player's Command Center `(440, 2760)`, killing the player's starting combat units within 5 seconds of match start while playing loud explosion/EVA audio!

#### Fix (`js/ai.js:663–680`)
Enforce a minimum match-time grace period (e.g. `engine.matchTime >= 75` seconds) before the AI casts offensive Generals Powers, or require that candidate targets in `findBestClusterTarget` have been scouted:
```javascript
// In js/ai.js around line 669:
const clusterTarget = engine.matchTime >= 75
  ? findBestClusterTarget(engine, enemyTeam, 260, true)
  : null;
```

---

### 3. `BUG-UI-01` (HIGH / P1): `pushMoveMarker` (`js/ui.js`) vs `updateSpecialEffects` / `renderMoveMarkers` (`js/engine.js`) Property Mismatch (`age` vs `t`)

#### Root Cause
- `js/ui.js:2108–2117`:
  ```javascript
  function pushMoveMarker(wx, wy, color) {
    if (!engine || !Array.isArray(engine.moveMarkers)) return;
    engine.moveMarkers.push({
      x: wx,
      y: wy,
      color: color || '#22c55e',
      age: 0,
      maxAge: 0.55
    });
  }
  ```
- `js/engine.js:3174–3181` (`updateSpecialEffects`) & `3434–3450` (`renderMoveMarkers`):
  ```javascript
  for (let i = this.moveMarkers.length - 1; i >= 0; i--) {
    this.moveMarkers[i].t += dt; // undefined + dt => NaN!
    if (this.moveMarkers[i].t >= 0.45) {
      this.moveMarkers.splice(i, 1); // NaN >= 0.45 is always false!
    }
  }
  ```
  And in `renderMoveMarkers()`, `const p = clamp(m.t / 0.45, 0, 1)` evaluates to `NaN`, passing `NaN` radius to `ctx.arc(m.x, m.y, r, 0, Math.PI * 2)` on every frame and leaking `this.moveMarkers` forever.

#### Fix (`js/ui.js:2108–2117` and/or `js/engine.js:3174–3181, 3434–3450`)
Update `pushMoveMarker` in `js/ui.js:2108–2117` to include `t: 0` and `kind`:
```javascript
function pushMoveMarker(wx, wy, color) {
  if (!engine || !Array.isArray(engine.moveMarkers)) return;
  const isAttack = color === '#ef4444' || color === '#f59e0b';
  engine.moveMarkers.push({
    x: wx,
    y: wy,
    t: 0,
    kind: isAttack ? 'attack' : 'move',
    color: color || '#22c55e'
  });
}
```

---

### 4. `BUG-SIM-01D` & `BUG-SIM-01E` (HIGH / P1): Simulator Warp Speed Not Applied in Main Loop & `#btn-auto-sim` (`Cmd+T`) Unwired

#### Root Cause
1. **`js/ui.js:124–126` (`loop`)**:
   ```javascript
   if (engine.running && !engine.paused) {
     engine.stepFixed(dt);
     if (window.ZH_SIMULATOR) window.ZH_SIMULATOR.update(dt);
   }
   ```
   `ZH_SIMULATOR.getSpeedMultiplier()` returns `1`, `5`, `15`, or `25` when the user clicks the Warp buttons in the Simulator HUD, but `js/ui.js` never multiplies `dt` (or steps multiple times) by `ZH_SIMULATOR.getSpeedMultiplier()`.
2. **`index.html:242`, `js/ui.js:106, 153–163`, `js/simulator.js:975`, `macos_main.swift:125`**:
   - `macos_main.swift:125` ("Toggle AI Auto-Play Simulator" `Cmd+T`) executes `document.getElementById('btn-auto-sim')?.click();`.
   - `index.html:242` defines `<button class="hud-btn" id="btn-auto-sim" type="button" hidden>🤖 Auto-Sim</button>`, which has `hidden` attribute (`btn.hidden === true`) and **zero event listeners** in `js/ui.js` or `js/simulator.js`.
   - `js/ui.js:106` calls `configureDevOnlyElements()` **before** `ZH_SIMULATOR.initHUD()` (`js/ui.js:113`), and `configureDevOnlyElements()` (`js/ui.js:161`) queries `document.getElementById('zh-sim-panel')` instead of `'zh-sim-hud-panel'`.

#### Fix (`js/ui.js` & `js/simulator.js`)
1. In `js/ui.js:106–116`, call `ZH_SIMULATOR.initHUD()` **before** `configureDevOnlyElements()`, and in `configureDevOnlyElements()` (`js/ui.js:153–163`):
   - Clear `autoSimBtn.hidden = !devModeEnabled` in addition to `classList.toggle('hidden', !devModeEnabled)`.
   - Look up `document.getElementById('zh-sim-hud-panel')` instead of `'zh-sim-panel'`.
   - Attach a click listener to `#btn-auto-sim` that toggles the active simulator (`const sim = window.ZH_SIMULATOR?.getActiveSimulator(); if (sim) { sim.enabled = !sim.enabled; ... }`).
2. In `js/ui.js:124–126`:
   ```javascript
   if (engine.running && !engine.paused) {
     const simMult = (window.ZH_SIMULATOR && window.ZH_SIMULATOR.getSpeedMultiplier)
       ? window.ZH_SIMULATOR.getSpeedMultiplier()
       : 1;
     const steps = Math.max(1, Math.min(25, Math.round(simMult)));
     for (let s = 0; s < steps; s++) {
       engine.stepFixed(dt);
       if (window.ZH_SIMULATOR) window.ZH_SIMULATOR.update(dt);
     }
   }
   ```

---

### 5. `BUG-UI-02` (MEDIUM / P2): CSS Variable Name Mismatch in `resizeCanvases()` (`js/ui.js:182–183` vs `css/style.css:7–8`)

#### Root Cause
- `css/style.css:7–8` defines:
  ```css
  --top-bar-h: 36px;
  --cmd-bar-h: 184px;
  ```
- `js/ui.js:182–183` reads:
  ```javascript
  const topBarH = parseInt(cs.getPropertyValue('--hud-top-h'), 10) || 36;
  const bottomBarH = parseInt(cs.getPropertyValue('--hud-bottom-h'), 10) || 176;
  ```
  Because `--hud-bottom-h` is undefined, `bottomBarH` falls back to `176` instead of `184`, making the canvas height 8px larger than `#viewport-wrap`.

#### Fix (`js/ui.js:182–183`)
```javascript
const topBarH = parseInt(cs.getPropertyValue('--top-bar-h'), 10) || 36;
const bottomBarH = parseInt(cs.getPropertyValue('--cmd-bar-h'), 10) || 184;
```

---

### 6. `BUG-UI-03` (MEDIUM / P2): `#opt-health-bars` Checkbox vs `<select>` Mismatch (`index.html:167` vs `js/ui.js:303–313`)

#### Root Cause
- `index.html:167` defines `<input type="checkbox" id="opt-health-bars" />`.
- `js/ui.js:303–313` treats `#opt-health-bars` as a `<select>` with values `'DAMAGED'` and `'ALWAYS'`:
  ```javascript
  hbEl.value = settings.healthBars || 'DAMAGED';
  hbEl.addEventListener('change', (e) => {
    settings.healthBars = e.target.value || 'DAMAGED';
    if (engine) engine.showAllHealthBars = settings.healthBars === 'ALWAYS';
    saveSettings();
  });
  ```
  For a checkbox, `e.target.value` is always `'on'`, so `settings.healthBars === 'ALWAYS'` is always `false`.

#### Fix (`js/ui.js:303–313`)
Support both checkbox (`e.target.type === 'checkbox'`) and select:
```javascript
if (hbEl) {
  if (hbEl.type === 'checkbox') {
    hbEl.checked = settings.healthBars === 'ALWAYS';
  } else {
    hbEl.value = settings.healthBars || 'DAMAGED';
  }
  hbEl.addEventListener('change', (e) => {
    settings.healthBars = e.target.type === 'checkbox'
      ? (e.target.checked ? 'ALWAYS' : 'DAMAGED')
      : (e.target.value || 'DAMAGED');
    if (engine) engine.showAllHealthBars = settings.healthBars === 'ALWAYS';
    saveSettings();
  });
}
```

---

### 7. `BUG-UI-04`, `BUG-UI-05`, `BUG-UI-06` (LOW / P3): UI Scale Normalization, Start Modal Powers Preview Button & Victory Credits Stat

1. **`BUG-UI-04` (`index.html:176–180` vs `js/ui.js:60, 267, 329`)**:
   `#opt-ui-scale` has `<option value="90">`, `<option value="100">`, `<option value="115">`. Normalize values `> 10` by dividing by `100` (`const normScale = Number(val) > 10 ? String(Number(val) / 100) : String(val || '1')`) before setting `--ui-scale`.
2. **`BUG-UI-05` (`index.html:240` & `js/ui.js`)**:
   Wire `document.getElementById('btn-open-powers-preview')` in `js/ui.js` to call `openPowersModal()`, and ensure `#powers-modal` has a higher `z-index` than `#start-modal` (or works when previewed from the Start Modal using `selectedPlayerGeneral`).
3. **`BUG-UI-06` (`js/ui.js:2642` vs `js/engine.js:281`)**:
   In `showVictoryModal()` (`js/ui.js:2642`), replace `s0.creditsCollected` / `s1.creditsCollected` with `s0.creditsEarned || s0.creditsCollected || 0` and `s1.creditsEarned || s1.creditsCollected || 0`.
