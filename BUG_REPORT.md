# C&C Generals: Zero Hour (macOS Clean-Room Edition) — Full QA & Adversarial Audit Report (v2.0)

**Date**: October 24, 2026
**QA Skills Executed**:
- [`rts-human-qa`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/.agents/skills/rts-human-qa/SKILL.md) (14 Human-Persona Playbooks + 8 Automated Verification Suites)
- [`rts-qa-prompter`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/.agents/skills/rts-qa-prompter/SKILL.md) (5-Dimension RTS QA Prompt & Invariant Specification)
- [`rts-bug-prospector`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/.agents/skills/rts-bug-prospector/SKILL.md) (Adversarial `FLUNK` / `CAVEAT` / `DEFENSIBLE` / `REVIEW` Audit)
- [`rts-bug-echo`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/.agents/skills/rts-bug-echo/SKILL.md) (Cross-Codebase Schema, Selector, & State-Machine Echo Scan)

---

## 1. Automated Verification Suite Summary (`238 / 238` Passing)

All 9 automated test suites in [`tests/`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/tests) pass 100% of their current assertions:

| Verification Suite | Result | Key Metrics / Coverage |
| :--- | :--- | :--- |
| [`tests/human_qa_runner.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/tests/human_qa_runner.js) | **87 / 87 PASSED** | 14 Human-Persona Playbooks, 154 real DOM/Canvas actions, `0` uncaught exceptions |
| [`tests/simulator_verify.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/tests/simulator_verify.js) | **11 / 11 PASSED** | Headless simulator parity, 12 subfactions, combat & economy loops |
| [`tests/phase2_verify.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/tests/phase2_verify.js) | **54 / 54 PASSED** | Subfaction rules, tech trees, upgrades, unit abilities, superweapons |
| [`tests/phase3_verify.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/tests/phase3_verify.js) | **26 / 26 PASSED** | GLA tunnels, hijackers, saboteurs, salvage, overlord modules, generals powers |
| [`tests/phase4_verify.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/tests/phase4_verify.js) | **39 / 39 PASSED** | Campaign operations, audio/VFX hooks, telemetry, UI state machines |
| [`tests/replay_hash_verify.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/tests/replay_hash_verify.js) | **7 / 7 PASSED** | Deterministic command log & state hash verification |
| [`tests/game_speed_verify.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/tests/game_speed_verify.js) | **5 / 5 PASSED** | Fixed-step accumulator (`stepFixed`) at 0.5x, 1x, 2x, 4x speeds |
| [`tests/determinism_verify.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/tests/determinism_verify.js) | **9 / 9 PASSED** | Seeded PRNG (`ZH_RNG`) reproducibility across identical runs |
| [`tests/perf_budget.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/tests/perf_budget.js) | **4 / 4 PASSED** | 1,000-unit 600-tick combat: **4.40ms avg step**, **7.35ms p99** (target `< 12ms`) |

---

## 2. Previously Reported Blockers Now Verified Fixed (`DEFENSIBLE`)

The core gameplay blockers from earlier builds were audited against physical engine and canvas invariants and confirmed **RESOLVED**:

1. **Canvas Left-Click & Drag-Box Unit Selection (`DEFENSIBLE`)**:
   - [`canvasToWorld`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L3153-L3170) in [`js/ui.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js) divides CSS pointer offsets by `rect.width` / `rect.height` and multiplies by logical viewport dimensions (`engine.viewportW`, `engine.viewportH`), eliminating Retina `devicePixelRatio = 2` coordinate doubling.
   - Left-click selection (`<= 8px` threshold) and marquee drag-box selection (`> 8px`) accurately select units across all 12 subfactions.
2. **Bulldozer & Combat Unit Right-Click Movement (`DEFENSIBLE`)**:
   - [`moveSelectedUnitsTo`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/engine.js#L1860-L1940) and [`updateUnit`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/engine.js#L5160-L5440) in [`js/engine.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/engine.js) clear construction/idle locks on right-click (`button === 2`), compute A* nav paths, and physically advance `(u.x, u.y)` with deterministic steering and separation.
3. **Building Ghost Placement & Worker Construction (`DEFENSIBLE`)**:
   - [`tryPlaceBuilding`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/engine.js#L1784-L1856) and [`validatePlacement`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/engine.js#L1740-L1782) validate footprint collision, spawn the scaffold at `hp = maxHp * 0.1`, deduct credits, and assign the nearest worker/dozer (`orderBuildStructure`), reaching `b.constructed === true` and `hp === maxHp` over simulation ticks.
4. **Modal Render Exception Safety (`DEFENSIBLE`)**:
   - Modal openers (`openGeneralsModal`, `openTelemetryModal`, `openDiplomacyModal`, `openLoadoutModal`, `openBattlePlanModal`) wrap their body rendering in `try ... finally` blocks so `.visible` is guaranteed to toggle even if a data lookup fails.

---

## 3. Adversarial Audit Findings (`rts-bug-prospector` & `rts-bug-echo`)

Despite `87/87` passing assertions in [`tests/human_qa_runner.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/tests/human_qa_runner.js), our adversarial audit uncovered **5 `FLUNK` (release/command-breaking bugs or false-positive tests)** and **6 `CAVEAT` (silent feature failures & schema drift)** that the current test suite missed.

### Overview Ledger

| ID | Classification | Subsystem | Summary | Location |
| :--- | :--- | :--- | :--- | :--- |
| **BUG-NEW-01** | **`[FLUNK]`** | Deterministic Command API | `validateCommand` reads `ZH_DATA.POWERS[cmd.powerId]` (`undefined` — actual export is `ZH_DATA.GENERALS_POWERS`), throwing `TypeError` on `UNLOCK_POWER` and `CAST_POWER` | [`js/engine.js:2578-2585`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/engine.js#L2578-L2585) |
| **BUG-NEW-02** | **`[FLUNK]`** | Deterministic Command API | `applyCommand` `FORCE_FIRE` checks non-existent `u.def.dmg > 0` instead of `u.def.weapon`, silently dropping 100% of `FORCE_FIRE` commands | [`js/engine.js:2702-2712`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/engine.js#L2702-L2712) |
| **BUG-NEW-03** | **`[FLUNK]`** | Canvas Input / QA False Positive | Left-clicking a friendly **building** while in `BUILD` mode attempts placement (`FOOTPRINT_BLOCKED`) instead of switching selection; Playbook 13 masked this by clicking a unit right after | [`js/ui.js:3274-3297`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L3274-L3297), [`tests/human_qa_runner.js:1712-1718`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/tests/human_qa_runner.js#L1712-L1718) |
| **BUG-NEW-04** | **`[FLUNK]`** | 3D Unit Design Studio | `"⚔️ Test on Battlefield"` queries non-existent `#btn-launch-operation` (actual ID `#btn-start-match`) and spawns `USA_CRUSADER` tanks whenever testing any building | [`js/unit_studio.js:1524-1539`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_studio.js#L1524-L1539), [`js/ui.js:4450-4482`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L4450-L4482) |
| **BUG-NEW-05** | **`[FLUNK]`** | QA Harness Drift | `tests/human_qa_runner.js` only loads 9 of the 12 scripts in `index.html`, omitting `rng.js`, `unit_models.js`, and `unit_studio.js` | [`tests/human_qa_runner.js:678-688`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/tests/human_qa_runner.js#L678-L688) |
| **BUG-NEW-06** | **`[CAVEAT]`** | Onboarding Guide HUD | Beat #2 checks `b.built && b.def.category === 'BARRACKS'` (neither property exists), making Beat #2 permanently uncompletable | [`js/ui.js:2136`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L2136) |
| **BUG-NEW-07** | **`[CAVEAT]`** | Strategy Center HUD & VFX | Property name drift: `engine.js` sets `team.strategyBattlePlan` & `b.battlePlan`, while `ui.js` reads `pTeam.battlePlan` and `vfx.js` reads `b.strategyMode` | [`js/ui.js:1946, 2244`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L2244), [`js/vfx.js:779-780`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/vfx.js#L779-L780) |
| **BUG-NEW-08** | **`[CAVEAT]`** | Veterancy Schema Drift | `spawnStudioTestSquad` and `renderMenuBackdrop` set `u.veterancy = 2` instead of `u.vetLevel = 2`, leaving the spawned squad leader at Rookie (`vetLevel: 0`) | [`js/ui.js:1203, 4471`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L4471) |
| **BUG-NEW-09** | **`[CAVEAT]`** | Deterministic Command API | `applyCommand` `CANCEL_PRODUCTION` passes numeric `cmd.queueIndex` into `cancelProduction(b, itemId)`, failing whenever `queueIndex > 0` or `cmd.itemId` is passed | [`js/engine.js:2832-2835`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/engine.js#L2832-L2835) |
| **BUG-NEW-10** | **`[CAVEAT]`** | Code Hygiene (`ui.js`) | `pruneExpiredAlerts()` is declared twice in the same scope in `js/ui.js` with divergent implementations | [`js/ui.js:4186-4198, 4249-4262`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L4186-L4262) |
| **BUG-NEW-11** | **`[CAVEAT]`** | QA Runner Test Setup | Playbook 11 Check #1 queries `b.defId.includes('_CC')` (`undefined` — actual IDs use `_COMMAND_CENTER`), leaving `playerCC` unselected before pressing `Escape` | [`tests/human_qa_runner.js:1406-1419`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/tests/human_qa_runner.js#L1406-L1419) |

---

## 4. Detailed Findings & Exact Remediation Patches

### `[FLUNK]` BUG-NEW-01: `engine.issueCommand` / `validateCommand` Crashes with `TypeError` on `UNLOCK_POWER` and `CAST_POWER`

- **Location**: [`js/engine.js:2578-2585`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/engine.js#L2578-L2585)
- **Root Cause**:
  In [`validateCommand`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/engine.js#L2578-L2585):
  ```javascript
  case 'UNLOCK_POWER':
  case 'CAST_POWER':
      if (!cmd.powerId || typeof cmd.powerId !== 'string') {
          return { ok: false, reason: 'MISSING_POWER_ID' };
      }
      if (!ZH_DATA.POWERS[cmd.powerId]) {
          return { ok: false, reason: 'UNKNOWN_POWER_ID' };
      }
      break;
  ```
  However, [`js/data.js:2664`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/data.js#L2664) exports `ZH_DATA.GENERALS_POWERS` (an object mapping `'USA'`, `'CHINA'`, `'GLA'` to arrays of power objects), **not** `ZH_DATA.POWERS` (`undefined`).
  Any call to `engine.issueCommand({ type: 'UNLOCK_POWER', powerId: 'GP_USA_SPY_DRONE' })` or `CAST_POWER` via the deterministic command pipeline or replay runner immediately throws:
  `TypeError: Cannot read properties of undefined (reading 'GP_USA_SPY_DRONE')`.
- **Why QA Missed It**:
  The UI modal calls `engine.unlockGeneralPower(powerId)` and `engine.activateGeneralPower(powerId)` directly rather than routing through `engine.issueCommand`.
- **Recommended Fix**:
  In [`js/engine.js:2582`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/engine.js#L2582), validate against `ZH_DATA.GENERALS_POWERS` (or export a flat `ZH_DATA.POWERS` lookup map in `js/data.js`):
  ```javascript
  const powerExists = (ZH_DATA.POWERS && ZH_DATA.POWERS[cmd.powerId]) ||
      Object.values(ZH_DATA.GENERALS_POWERS || {}).some(
          list => Array.isArray(list) && list.some(p => p.id === cmd.powerId)
      );
  if (!powerExists) {
      return { ok: false, reason: 'UNKNOWN_POWER_ID' };
  }
  ```

---

### `[FLUNK]` BUG-NEW-02: `engine.applyCommand` `FORCE_FIRE` Checks Non-Existent `u.def.dmg > 0`, Dropping All Commands

- **Location**: [`js/engine.js:2702-2712`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/engine.js#L2702-L2712)
- **Root Cause**:
  In [`applyCommand`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/engine.js#L2702-L2712):
  ```javascript
  case 'FORCE_FIRE': {
      const units = getCmdUnits().filter(u => !u.unmanned && u.def.dmg > 0);
      if (units.length === 0) return false;
      for (const u of units) {
          u.attackMoveTarget = null;
          u.guardTarget = null;
          u.target = { x: cmd.x, y: cmd.y, isGroundTarget: true, hp: 1 };
      }
      return true;
  }
  ```
  In [`js/data.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/data.js), unit definitions do **not** have a `.dmg` field — weapon damage lives on `u.def.weapon.damage` (compare [`orderForceFireSelected`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/engine.js#L1994-L2020) at line 1997, which checks `if (!u.def || !u.def.weapon) continue;`).
  Because `u.def.dmg` is `undefined`, `u.def.dmg > 0` evaluates to `false` for every unit in the game, and `applyCommand({ type: 'FORCE_FIRE', ... })` always returns `false`.
- **Recommended Fix**:
  Replace `u.def.dmg > 0` with `Boolean(u.def && u.def.weapon)` in [`js/engine.js:2703`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/engine.js#L2703) and support `cmd.targetId` or ground coordinates consistently with [`orderForceFireSelected`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/engine.js#L1994-L2020).

---

### `[FLUNK]` BUG-NEW-03: Left-Clicking a Friendly Building While in `BUILD` Mode Attempts Placement Instead of Switching Selection (Plus False Positive in Playbook 13)

- **Location**: [`js/ui.js:3274-3297`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L3274-L3297) and [`tests/human_qa_runner.js:1712-1718`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/tests/human_qa_runner.js#L1712-L1718)
- **Root Cause**:
  In [`js/ui.js:3274-3297`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L3274-L3297), when `engine.commandMode === 'BUILD' && engine.pendingBuildId`, the escape-hatch check before `engine.tryPlaceBuilding(pos.x, pos.y)` only searches `engine.units`:
  ```javascript
  const clickedFriendlyUnit = engine.units.find(u =>
      u.hp > 0 && u.team === engine.playerTeam && !u.containedBy &&
      Math.hypot(u.x - pos.x, u.y - pos.y) <= (u.radius || 18) + 8
  );
  ```
  It does **not** check `engine.buildings` or `engine.garrisonBunkers` (even though [`MAIN_AGENT_BRIEF.md:127`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/MAIN_AGENT_BRIEF.md#L127) explicitly specifies that clicking a friendly unit or building should switch selection). When a player has a building ghost active and left-clicks their Command Center, War Factory, or Barracks to train a unit instead, `clickedFriendlyUnit` is `undefined`, so `engine.tryPlaceBuilding(pos.x, pos.y)` runs on top of the building, fails with `FOOTPRINT_BLOCKED`, and traps the player in `BUILD` mode!
- **Why Playbook 13 Falsely Passed (`rts-bug-prospector` catch)**:
  In [`tests/human_qa_runner.js:1712-1718`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/tests/human_qa_runner.js#L1712-L1718):
  ```javascript
  if (cc) {
      await runner.clickWorld(cc.x, cc.y, 0); // Fails to exit BUILD mode!
  } else if (targetUnit) {
      await runner.clickWorld(targetUnit.x, targetUnit.y, 0);
  }
  if (targetUnit) {
      await runner.clickWorld(targetUnit.x, targetUnit.y, 0); // Unconditionally clicks unit next, masking line 1712!
  }
  ```
  Line 1712 clicked `cc` (which failed to exit `BUILD` mode), and then line 1716 unconditionally clicked `targetUnit` (which did exit `BUILD` mode), causing the assertion on line 1718 (`engine.commandMode === 'NORMAL'`) to pass for the wrong reason!
- **Recommended Fix**:
  1. In [`js/ui.js:3275-3291`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L3275-L3291), also check `engine.buildings` (matching `b.hp > 0 && b.team === engine.playerTeam && Math.abs(pos.x - b.x) <= b.width / 2 + 6 && Math.abs(pos.y - b.y) <= b.height / 2 + 6`) so left-clicking a friendly building cancels `BUILD` mode and selects that building.
  2. In [`tests/human_qa_runner.js:1712-1718`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/tests/human_qa_runner.js#L1712-L1718), assert `engine.commandMode === 'NORMAL'` and `engine.selectedBuilding === cc` immediately after clicking `cc`, before clicking `targetUnit`.

---

### `[FLUNK]` BUG-NEW-04: 3D Unit Design Studio `"⚔️ Test on Battlefield"` Queries Non-Existent `#btn-launch-operation` and Spawns Crusader Tanks When Testing Buildings

- **Location**: [`js/unit_studio.js:1524-1539`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_studio.js#L1524-L1539) and [`js/ui.js:4450-4482`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L4450-L4482)
- **Root Cause**:
  1. **Broken DOM Selector when Launching from Main Menu**:
     In [`js/unit_studio.js:1528`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_studio.js#L1528):
     ```javascript
     if (!window.ZH_ENGINE || !window.ZH_ENGINE.running) {
         const startBtn = document.getElementById('btn-launch-operation');
         if (startBtn) startBtn.click();
     ```
     In [`index.html:421`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/index.html#L421), the button ID is `#btn-start-match`, **not** `#btn-launch-operation`. When a user opens the 3D Unit Design Studio from the Main Menu (`#btn-open-unit-studio`) and clicks `"⚔️ Test on Battlefield"`, `startBtn` is `null`.
  2. **Testing Any Building Spawns `USA_CRUSADER` Tanks Instead**:
     The Studio catalog includes all 93 units, buildings, and tech structures (`getAllUnitsList()` in [`js/unit_studio.js:225-242`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_studio.js#L225-L242)), and clicking `"🎨 3D CAD Studio"` in the in-game HUD while selecting a building opens that building in the Studio (`selectedBuilding.defId`).
     However, [`spawnStudioTestSquad(targetDefId)`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L4450-L4452) only checks `ZH_DATA.UNITS[targetDefId]`:
     ```javascript
     const defId = (targetDefId && window.ZH_DATA && window.ZH_DATA.UNITS && window.ZH_DATA.UNITS[targetDefId])
         ? targetDefId
         : 'USA_CRUSADER';
     ```
     If the user inspects any building (e.g., `USA_PARTICLE_CANNON`, `CHINA_NUCLEAR_MISSILE`, `GLA_SCUD_STORM`) and clicks `"⚔️ Test on Battlefield"`, it silently spawns 5 `USA_CRUSADER` tanks and toasts `"STUDIO DEPLOYMENT: CRUSADER TANK SQUAD"`!
- **Recommended Fix**:
  1. Change `document.getElementById('btn-launch-operation')` to `document.getElementById('btn-start-match')` in [`js/unit_studio.js:1528`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_studio.js#L1528).
  2. In [`spawnStudioTestSquad`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L4450-L4482), check if `ZH_DATA.BUILDINGS[targetDefId]` exists; if so, spawn the constructed building near the player's base (`engine.addBuilding(targetDefId, spawnX, spawnY, pTeam.id, true)`), select it, and center the camera on it.

---

### `[FLUNK]` BUG-NEW-05: `tests/human_qa_runner.js` Script Loader Drift Omits `rng.js`, `unit_models.js`, and `unit_studio.js`

- **Location**: [`tests/human_qa_runner.js:678-688`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/tests/human_qa_runner.js#L678-L688) vs [`index.html:626-637`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/index.html#L626-L637)
- **Root Cause**:
  `index.html` loads 12 scripts in order:
  `rng.js`, `data.js`, `spatial.js`, `nav.js`, `unit_models.js`, `vfx.js`, `audio.js`, `engine.js`, `ai.js`, `simulator.js`, `unit_studio.js`, `ui.js`.
  [`tests/human_qa_runner.js:678-688`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/tests/human_qa_runner.js#L678-L688) hardcodes a 9-script array that omits `js/rng.js`, `js/unit_models.js`, and `js/unit_studio.js`. As a result, `window.ZH_RNG`, `window.ZH_UNIT_MODELS`, and `window.ZH_UNIT_STUDIO` are `undefined` during the Human QA run.
- **Recommended Fix**:
  Parse `<script src="js/...">` tags directly from `index.html` in `tests/human_qa_runner.js` (or include all 12 scripts in exact `index.html` order) and add a Playbook check covering `#btn-open-unit-studio` / `#btn-hud-open-unit-cad`.

---

### `[CAVEAT]` BUG-NEW-06: Onboarding Guide Beat #2 Checks Non-Existent `b.built` and `b.def.category === 'BARRACKS'`

- **Location**: [`js/ui.js:2136`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L2136)
- **Root Cause**:
  In [`updateOnboardingGuide`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L2131-L2164):
  ```javascript
  const hasBarracks = engine.buildings.some(
      b => b.team === pTeam.id && b.built && b.def &&
           (b.def.category === 'BARRACKS' || (b.def.produces && b.def.produces.length > 0 && b.id && b.id.includes('BARRACKS')))
  );
  ```
  Two bugs prevent `hasBarracks` from ever becoming `true`:
  1. Buildings use `b.constructed` (see [`js/engine.js:1038`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/engine.js#L1038)), **not** `b.built` (`undefined`).
  2. Building definitions in [`js/data.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/data.js) do not have `b.def.category === 'BARRACKS'`, and `b.id` is a numeric entity ID (`1`, `2`, `3`...), whereas the string identifier is `b.defId` (`'USA_BARRACKS'`, `'CHINA_BARRACKS'`, `'GLA_BARRACKS'`).
  Consequently, Onboarding Beat #2 (`"Construct a Barracks & Train Infantry"`) never marks as `.done`, and the onboarding panel never auto-completes (`onboardingDismissed` never triggers).
- **Recommended Fix**:
  ```javascript
  const hasBarracks = engine.buildings.some(
      b => b.team === pTeam.id && b.constructed && b.defId && b.defId.includes('BARRACKS')
  );
  ```

---

### `[CAVEAT]` BUG-NEW-07: Strategy Center Battle Plan Property Name Drift Across `engine.js`, `ui.js`, and `vfx.js` (`rts-bug-echo` Pattern)

- **Location**: [`js/engine.js:571, 1049, 1403-1406`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/engine.js#L1403-L1406), [`js/ui.js:1946, 2244-2252`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L2244-L2252), [`js/vfx.js:779-780`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/vfx.js#L779-L780)
- **Root Cause**:
  Three different files use three different property names for the Strategy Center's active Battle Plan:
  1. [`js/engine.js:571, 1403`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/engine.js#L1403) stores `team.strategyBattlePlan = planId` on the team and `b.battlePlan = planId` on the Strategy Center building (`js/engine.js:1049, 1406`).
  2. [`js/ui.js:1946`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L1946) reads `selectedBuilding.battlePlan || pTeam.battlePlan || 'BOMBARDMENT'`, and [`js/ui.js:2244`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L2244) (`updateForceReadinessHUD`) checks `if (pTeam.battlePlan)`. Because `pTeam.battlePlan` is `undefined`, the Force Readiness HUD chip (`🎖️ Battle Plan: ...` at line 2252) **never renders**!
  3. [`js/vfx.js:779-780`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/vfx.js#L779-L780) checks `b.strategyMode === 'BOMBARDMENT'` and `b.strategyMode === 'HOLD_THE_LINE'`. Because the building stores `b.battlePlan` (not `b.strategyMode`), the Strategy Center ground aura ring is permanently blue (`#38bdf8`, Search & Destroy) regardless of which Battle Plan is active.
- **Recommended Fix**:
  - In [`js/ui.js:1946, 2244`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L2244), read `pTeam.strategyBattlePlan`.
  - In [`js/vfx.js:779-780`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/vfx.js#L779-L780), read `b.battlePlan` (or `b.battlePlan || b.strategyMode`).

---

### `[CAVEAT]` BUG-NEW-08: Veterancy Property Name Drift (`u.veterancy` vs `u.vetLevel`) in `js/ui.js`

- **Location**: [`js/ui.js:1203, 4471`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L4471) vs [`js/engine.js:1218`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/engine.js#L1218)
- **Root Cause**:
  In [`js/engine.js:1218`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/engine.js#L1218), units store their veterancy rank in `u.vetLevel` (`0 = Rookie`, `1 = Veteran`, `2 = Elite`, `3 = Heroic`).
  However, [`spawnStudioTestSquad`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L4471) sets `if (i === 0) u.veterancy = 2;` (and [`renderMenuBackdrop`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L1203) sets `veterancy: i === 0 ? 3 : 1`). Because `engine.js` and HUD inspector read `u.vetLevel`, the spawned test squad leader remains `vetLevel: 0` (Rookie).
- **Recommended Fix**:
  Set `u.vetLevel = 2` (alongside `u.veterancy = 2` if used by any preview renderer) in [`js/ui.js:4471`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L4471) and `vetLevel` in [`js/ui.js:1203`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L1203).

---

### `[CAVEAT]` BUG-NEW-09: `applyCommand` `CANCEL_PRODUCTION` Passes Queue Index to `cancelProduction(building, itemId)`

- **Location**: [`js/engine.js:2832-2835`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/engine.js#L2832-L2835) vs [`js/engine.js:1950-1960`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/engine.js#L1950-L1960)
- **Root Cause**:
  In [`applyCommand`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/engine.js#L2832-L2835):
  ```javascript
  case 'CANCEL_PRODUCTION': {
      const b = getCmdBuilding();
      if (!b) return false;
      return this.cancelProduction(b, cmd.queueIndex !== undefined ? cmd.queueIndex : 0);
  }
  ```
  However, [`cancelProduction(building, itemId)`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/engine.js#L1950-L1960) expects `itemId` to be a string ID (e.g., `'USA_RANGER'`) or falsy (in which case it pops the last item):
  ```javascript
  if (itemId) {
      for (let i = building.queue.length - 1; i >= 0; i--) {
          if (building.queue[i].id === itemId) { idx = i; break; }
      }
  } else {
      idx = building.queue.length - 1;
  }
  ```
  When `cmd.queueIndex` is `0`, `itemId` is `0` (falsy), so it cancels the last item in the queue rather than index `0`. When `cmd.queueIndex` is `1` or `2`, `building.queue[i].id === 1` is always `false`, so `cancelProduction` returns `false`! And when `cmd.itemId` is provided (`validateCommand` allows either `cmd.itemId` or `cmd.queueIndex`), `applyCommand` ignores `cmd.itemId` completely.
- **Recommended Fix**:
  In [`applyCommand`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/engine.js#L2832-L2835), pass `cmd.itemId` if present, or resolve `b.queue[cmd.queueIndex]?.id` if `cmd.queueIndex` is a valid index.

---

### `[CAVEAT]` BUG-NEW-10: Duplicate `pruneExpiredAlerts()` Function Declaration in `js/ui.js`

- **Location**: [`js/ui.js:4186-4198`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L4186-L4198) and [`js/ui.js:4249-4262`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js#L4249-L4262)
- **Root Cause**:
  `function pruneExpiredAlerts()` is declared twice inside the `ZH_UI` closure in [`js/ui.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/ui.js). JavaScript hoisting causes the second declaration (lines 4249–4262) to silently overwrite the first (lines 4186–4198).
- **Recommended Fix**:
  Remove the duplicate declaration at lines 4186–4198 and keep a single canonical implementation.

---

### `[CAVEAT]` BUG-NEW-11: Playbook 11 Check #1 False-Positive Setup Queries `b.defId.includes('_CC')`

- **Location**: [`tests/human_qa_runner.js:1406-1419`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/tests/human_qa_runner.js#L1406-L1419)
- **Root Cause**:
  Playbook 11 (`tests/human_qa_runner.js:1406`) looks up the player's Command Center with:
  ```javascript
  const playerCC = engine.buildings.find(b => b.team === engine.playerTeam && b.defId.includes('_CC'));
  ```
  All Command Center `defId`s in [`js/data.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/data.js) use `_COMMAND_CENTER` (`USA_COMMAND_CENTER`, `CHINA_COMMAND_CENTER`, `GLA_COMMAND_CENTER`), so `playerCC` is always `undefined`. The test never selects the Command Center before pressing `Escape`, making Check #1 (`!engine.selectedBuilding`) vacuously true!
- **Recommended Fix**:
  Change `b.defId.includes('_CC')` to `b.defId.includes('COMMAND_CENTER')` in [`tests/human_qa_runner.js:1406`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/tests/human_qa_runner.js#L1406) and assert `engine.selectedBuilding === playerCC` before pressing `Escape`.
