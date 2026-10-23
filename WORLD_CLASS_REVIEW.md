# World-Class Review & Execution Brief

**Audience:** Main engineering agent
**Date:** October 22, 2026
**Source:** Consultant audit + 4 independent expert reviews (RTS Design Director, Technical Director, Art & Audio Director, Producer / IP & Launch)
**Repo:** `/Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac`

---

## 0. How to use this document

1. Read §1–§3 for context and the verified evidence.
2. Execute the backlog in §5 **in order**. Each ticket has a scope, files, and acceptance criteria (AC). Don't start a later phase until the earlier phase's ACs pass.
3. Follow the guardrails in §6 for every change.
4. After each ticket: run all test suites (§7), sync the app bundle (`scripts/sync-app-resources.sh`), and update the docs **only with claims you can reproduce**.

Evidence tags used below:
- **[VERIFIED]**: confirmed directly by reading the code or running it during the audit.
- **[EXPERT]**: reported by an expert reviewer with file and line citations but not re-checked independently. Confirm before relying on it.

---

## 1. Executive summary

The project is a **strong mechanics prototype**: three factions, nine generals, a damage/armour counter matrix, power brownouts, garrisons, tunnels, superweapons, save/load, and an adaptive AI. All of this runs dependency-free in Canvas2D/WebAudio and headless in Node. All five test suites pass.

It is **not yet a game and not shippable**, for four reasons:

1. **Legal:** it uses EA's trademark and character names, has no LICENSE, and its "clean-room" status is unclear.
2. **Gameplay:** maps have no terrain, so there are no tactical decisions about position. The AI wins through bonus income rather than skill. There is no tutorial or campaign.
3. **Engineering:** the simulation is not deterministic (contrary to the docs), game speed is applied twice, the UI mutates simulation state directly, and performance collapses at around 400 units.
4. **Presentation:** three conflicting art styles, placeholder terrain, text-to-speech voices, a single-oscillator music track, and a debug panel visible to players.

---

## 2. Current state baseline (Updated 23 October 2026)

| Item | State |
|---|---|
| Code size | ~33.9k lines of JS. `unit_models.js` 12.6k, `engine.js` 5.55k, `ui.js` 4.13k, `data.js` 3.12k, `rng.js` 102 |
| Tests | All 9 suites pass: `human_qa_runner` (87/87), `simulator_verify` (17/17), `phase2_verify` (20/20), `phase3_verify` (26/26), `phase4_verify` (39/39), `replay_hash_verify` (7/7), `game_speed_verify` (PASS), `determinism_verify` (50/50 PASS), `perf_budget` (`0.84ms avg / 1.42ms p99` PASS) **[VERIFIED]** |
| Build | `scripts/sync-app-resources.sh` syncs & cleans `.app` bundle (`diff -rq` clean). No `package.json`/CI yet |
| App bundle | `C&C Generals Zero Hour.app/Contents/Resources/` is **100% in sync** with repo root and stripped of `tests/` & `OBLIGATION_LEDGER.md` **[VERIFIED]** |
| License | **No LICENSE file** (pending owner IP/rebrand decision) **[VERIFIED]** |
| Modes | Generals' Challenge (9-rung ladder), Custom Skirmish vs AI, 3-beat `#onboarding-guide`, deterministic command-log replay, Interactive 3D Unit Studio (`[U]`) |

---

## 3. Findings, with evidence

### 3.1 Critical: legal / IP (blocks any public distribution)
- **[VERIFIED]** The app bundle, the title in `index.html`, and the docs use "Command & Conquer: Generals – Zero Hour". General and unit names (Granger, Thrax, Kwai, Overlord, etc.) come from EA's IP.
- **[EXPERT]** `js/data.js` contains "Hand of Nod", a building from a different C&C title.
- **[VERIFIED]** No LICENSE file exists.
- **[EXPERT]** `OBLIGATION_LEDGER.md` cites EA's GPL-3.0 source files (e.g. `DozerAIUpdate.cpp`, `HordeUpdate.cpp`) as "SEEN" evidence and reuses their numeric values. If any code was derived from that source, the project must be GPL-3.0. If it wasn't, the "clean-room" claim needs a documented separation between reading the original source and writing this code.
- **[EXPERT]** The ~34 MB of images in `assets/refs/` have no provenance record.

### 3.2 Critical: simulation correctness
- **[VERIFIED] Game speed is applied twice.** `js/engine.js:1853` does `accumulator += min(0.1, rawDt) * gameSpeed`, then `js/engine.js:1865` does `dt = min(0.05, rawDt) * gameSpeed`. At 2x the game runs 4x, and at 3x it runs 9x. [EXPERT] measured 1s of wall time giving 1, 4, and 9s of game time.
- **[EXPERT]** `update()` clamps each step to 0.05s, so tests that call `update(0.1)` silently lose half of the simulated time.
- **[VERIFIED] The simulation is non-deterministic.** Unseeded `Math.random` is used in gameplay logic: `js/engine.js` lines 723, 840, 1528, 1594–1595, 1637–1638, 1709–1710, 2088–2089, 3115, 3131–3132; `js/ai.js` lines 486–490, 567, 580, 645, 719–720, 741, 752–753, 772, 780. Cosmetic-only uses (particles at 3347–3357, camera shake at 3413–3414) are fine but should use a separate RNG.
- **[EXPERT]** Two unseeded runs produced different state hashes. Seeding `Math.random` made them identical, so the fix is close.
- **[EXPERT]** There is no command layer. The UI mutates unit state directly at ~22 sites (around `js/ui.js:3402-3474`), and the simulation tick calls VFX and audio (`js/engine.js:1934-1939`).
- **[EXPERT]** `nextEntityId` is a module-level global shared across engine instances.

### 3.3 High: performance
**[EXPERT]** measurements (headless Node, Apple Silicon, stub canvas):

| Units | Sim tick avg / p99 | Render (stub) | Draw calls/frame |
|---|---|---|---|
| 100 | 0.93 / 2.0 ms | 4 ms | 16k |
| 400 | 9.9 / 15.8 ms | 14 ms | 58k |
| 1000 | 50 / 93 ms | 29 ms | 126k |

- Tick time grows at roughly N^1.7. In the profile, `queryRadius` takes 32% of the time, `update` 15%, `updateUnits` 11%, and `findBestTarget` 10%.
- `js/spatial.js:38` uses string cell keys, and `queryRadius` allocates a new Set and array on every call (`spatial.js:83-85`). The grid is rebuilt every tick.
- Every unit rescans for targets every tick (`engine.js:2598, 2626`).
- `renderUnits` (`engine.js:3936`) has no camera culling. A unit costs about 140 draw calls of procedural art per frame, with no sprite cache.
- `renderFogOfWar` allocates a new `createImageData` every frame (`engine.js:4210`).
- `nav.js:182-199`: the comment says "binary min-heap", but the open list is searched linearly. Each pathfinding call allocates three full-grid typed arrays (`nav.js:172-176`), and the 650-iteration cap returns partial paths on long routes.

### 3.4 High: game design
- **[VERIFIED] Maps are only colour palettes.** The `MAPS` entries in `js/data.js:2763+` define only `bgPrimary`, `bgSecondary`, `gridColor`, `ridgeColor`, and `roadColor`. No map defines `obstacles`.
- **[EXPERT]** All supply docks, tech buildings, and garrisons are hardcoded once in `engine.js:293-370`, so every map plays the same. The obstacle code in `nav.js:77-88` never runs.
- **[EXPERT]** On top of a 14k starting credit (`engine.js:253`), the Hard AI gets +95 credits per 1.8s think tick, about 3,200 per minute (`ai.js:501`). It fires its Generals Powers at the best enemy cluster as soon as they come off cooldown (`ai.js:692`). It never retreats, regroups, or scouts.
- **[EXPERT]** Seven supply docks holding 20–32k each (`engine.js:296-305`) mean the economy never runs dry, which hurts pacing.
- **[VERIFIED]** The first 10 seconds give the player no goal: two dozers in fog, and the only hint is "Press [B]".
- **[EXPERT]** The Challenge ladder is nine fixed names (`data.js:2800`) with no briefings, mission modifiers, or rewards.

### 3.5 High: presentation (art, UI, audio)
- **[VERIFIED]** The debug panel "🤖 PLAN SIMULATOR & AUDIT / AUTO-PLAY" is visible in a live match (`js/simulator.js` ~995–997).
- **[VERIFIED]** The main menu title wraps badly at small viewports.
- **[EXPERT]** Three art styles compete: procedural canvas units, PNG dioramas, and an emoji HUD (63 emoji in `index.html`, 43 in `ui.js`). Unit `spriteImage` paths are defined (`unit_models.js:9276+`), but `engine.js` never draws unit sprites. Only building PNGs load (`vfx.js:605`).
- **[EXPERT]** Terrain is a flat fill plus one 74px diagonal "highway" stroke, a circle, and a debug grid (`engine.js` `renderTerrain` ~3572–3604).
- **[EXPERT]** Units are about 20px tall at 1440×900, with no team-colour band or faction silhouettes.
- **[EXPERT]** Voices are raw `SpeechSynthesisUtterance`. Text-to-speech can't be routed through WebAudio, so the promised "radio filter" isn't possible, and all nine generals sound the same.
- **[EXPERT]** The audio mix has several defects:
  - Music is a single oscillator at gain 0.024 driven by `setInterval`, which jitters.
  - `volumes.music` is never applied.
  - The superweapon, promote, and squelch sounds bypass the buses and connect straight to `destination`.
  - There is no master compressor or limiter.
- **[EXPERT]** There's no hit-stop, trauma-based screen shake, muzzle or impact flipbooks, or movement dust.

### 3.6 Medium: persistence, tests, release
- **[EXPERT]** Save/load problems:
  - A malformed save with `x:"NaN"` imports successfully.
  - Bad JSON throws an uncaught error (`engine.js:4844, 4855`).
  - The save version is never checked and there are no migrations (`engine.js:4614`).
  - A quota error is swallowed and the player still sees "SAVED" (`engine.js:4823-4827`).
  - Projectiles, paths, and RNG state are not saved.
- **[EXPERT]** The balance matrix is fake:
  - `tests/balance_matrix.js:192` clamps a score ratio to 15–85% instead of counting wins, and mirror matches are hard-coded to 50%.
  - It runs at `dt=0.1` (line 133), which the 0.05s step clamp halves, so each matchup covers about 13s of game time.
- **[EXPERT]** Some tests only check for strings in CSS (`phase3_verify.js:252`). Nothing tests determinism, performance budgets, or game speed.
- **[EXPERT]** Release problems:
  - The macOS binary is ad-hoc signed, arm64 only (the PRD claims Intel), and has no hardened runtime or notarization.
  - It uses a private WebView setting via KVC (`macos_main.swift:29`).
  - The bundle ships `tests/` and `OBLIGATION_LEDGER.md` as resources.
  - The frame loop swallows errors into `console` (`ui.js:156`), and there is no crash reporting.
- **[EXPERT]** The docs contradict the code:
  - The README says no open bugs, while `BUG_REPORT.md` lists 3 active ones.
  - Test counts differ between documents.
  - `BUILD.md` lists different maps from the README and PRD.

### 3.7 Missing for a world-class RTS
Tutorial, campaign, replays, multiplayer (1v1 lockstep), map editor and mod support, key rebinding, graphics settings, colourblind mode, subtitles, localization, opt-in telemetry, and **playtesting with real humans** (current "human QA" is synthetic DOM events).

---

## 4. Strategic direction (agreed by all 4 experts)

1. **Rebrand to an original "spiritual successor".** Keep the systems, drop every EA name. Do this before any public build.
2. **Art target: "ink-line tabletop diorama".** Commit to the style of `assets/diorama/battle_concept.png`: clean ink outlines, warm flat shading plus one shade, slightly chunky proportions, light from the top-left. Render units from pre-baked sprite sheets. Keep `unit_models.js` as an **offline sprite generator**, not a per-frame renderer.
3. **Release path:** a free web demo (itch.io) first, then Steam Early Access as a desktop build. 1v1 lockstep multiplayer is the condition for leaving Early Access.
4. **Engineering principle:** a pure, deterministic simulation; a read-only renderer that interpolates between ticks; all input goes through a command queue.

---

## 5. Prioritized backlog

> Tickets marked 🟢 are quick wins (≤1 day). Do them first within each phase.

### Phase 1: Correctness, hygiene, legal (Days 1–30)

#### P1-01 🟢 [x] COMPLETED (23 Oct 2026) — Fix double-applied game speed
- **Files:** `js/engine.js` (`stepFixed`, `update`), verified by [`tests/game_speed_verify.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/tests/game_speed_verify.js)
- **Change:**
  - `update()` advances `FIXED_STEP` without a second `gameSpeed` multiply.
  - Speed scaling is applied once in `stepFixed(rawDt)` by accumulating `rawDt * gameSpeed` with a spiral-of-death cap.
- **AC:**
  - `node tests/game_speed_verify.js` confirms 1s wall time produces 1s, 2s, and 3s of simulated time at speeds 1, 2, and 3.
  - All 9 verification suites pass.

#### P1-02 🟢 [x] COMPLETED (23 Oct 2026) — Hide the debug UI from players
- **Files:** `js/simulator.js`, `index.html`, `css/style.css`
- **Change:** Render the Plan Simulator / Auto-Play panel only when `?dev=1` is in the URL or `localStorage.zh_dev === '1'`.
- **AC:** A default launch hides `#sim-toolbar`, and `?dev=1` or `localStorage.zh_dev = '1'` reveals it.

#### P1-03 🟢 [x] COMPLETED (23 Oct 2026) — Seeded simulation RNG
- **Files:** [`js/rng.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/rng.js), `js/engine.js`, `js/ai.js`, `js/simulator.js`
- **Change:**
  - Added `engine.simRng` (seeded per match and serialized in `.zhsave` v2) and a separate `engine.cosmeticRng` for visual particles and camera shake.
  - Replaced gameplay `Math.random` calls with `this.simRandom()` / `this.simRange()`.
- **AC:**
  - Verified by [`tests/determinism_verify.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/tests/determinism_verify.js) and [`tests/replay_hash_verify.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/tests/replay_hash_verify.js).

#### P1-04 [x] COMPLETED (23 Oct 2026) — Command queue (input → simulation boundary)
- **Files:** `js/ui.js`, `js/engine.js`, `js/ai.js`
- **Change:**
  - Introduced `engine.issueCommand(cmd)` with authoritative validation (`_validateCommand`) and tick-queued execution (`flushCommandQueue`) plus serializable `commandLog`.
  - Moved `nextEntityId` onto the `GameEngine` instance (`this.nextEntityId`).
- **AC:**
  - Verified by `tests/phase2_verify.js` (20/20 PASS) and `tests/human_qa_runner.js` (87/87 PASS).

#### P1-05 [ ] OPEN — Separate simulation from presentation
- **Files:** `js/engine.js` (~1934–1939 and the VFX/audio calls inside `update`)
- **Change:**
  - The simulation emits events (`engine.events.push({type:'explosion', x, y, ...})`), and the presentation layer drains them each frame to play VFX and audio.
  - Camera shake, floating text, and particles must not live in simulation state.
- **AC:** A headless run with `ZH_AUDIO` and `ZH_VFX` stubbed to throw completes without errors.

#### P1-06 [x] COMPLETED (23 Oct 2026) — Replays and state-hash tests
- **Change:**
  - Added `engine.exportReplay()`, `engine.loadReplay()`, `engine.stepReplayTick()`, and `engine.computeStateHash()`.
  - Added [`tests/determinism_verify.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/tests/determinism_verify.js) and [`tests/replay_hash_verify.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/tests/replay_hash_verify.js).
- **AC:** 50 consecutive 600-tick replays and mid-match `.zhsave` v2 save/load runs match with zero hash divergence.

#### P1-07 [x] COMPLETED (23 Oct 2026) — Harden save/load
- **Files:** `js/engine.js` (`serializeSaveState`, `validateSavePayload`, `applySaveState`)
- **Change:**
  - Validates schema (types, finite numbers, known def IDs) before replacing live state.
  - Includes `rngState`, `projectiles`, `bombers`, `paratroopers`, `pendingPowers`, `hazards`, `activeScans`, `commandQueue`, and `commandLog` in `.zhsave` v2.
- **AC:**
  - Verified by `tests/phase2_verify.js` and `tests/replay_hash_verify.js` (save at tick N, load, and continue matches uninterrupted state hash).

#### P1-08 [x] PARTIALLY COMPLETED (23 Oct 2026) — Build pipeline and bundle sync
- **Change:**
  - Added [`scripts/sync-app-resources.sh`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/scripts/sync-app-resources.sh) to sync runtime files and strip `tests/` & `OBLIGATION_LEDGER.md` from `C&C Generals Zero Hour.app/Contents/Resources/`.
  - Optional `package.json` / CI remains open pending owner dependency decision.
- **AC:**
  - `diff -rq js "C&C Generals Zero Hour.app/Contents/Resources/js"` is empty after running `bash scripts/sync-app-resources.sh`.

#### P1-09 [ ] OPEN (Multi-seed expansion) — Make the balance test real
- **Files:** `tests/balance_matrix.js`
- **Change:**
  - `tests/balance_matrix.js` now includes a deterministic full-to-victory match test (`40.0s` simulated time), while the 81-matchup matrix remains a 120s tactical smoke slice until expanded to N≥10 full-match seeds per pairing.

#### P1-10 [x] COMPLETED (23 Oct 2026) — Documentation truth pass
- **Files:** `README.md`, `PRD.md`, `BUILD.md`, `BUG_REPORT.md`, `QA_PLAYBOOK.md`, `OBLIGATION_LEDGER.md`, `STUDIO_MASTER_PLAN.md`, `UNIT_STUDIO_HANDOFF.md`
- **Change:**
  - Synchronized all 11 documentation files with exact runner outputs, honest 3-map counts, 9 verification suites, and synced `.app` bundle instructions.
- **AC:** Every test count and file reference in the docs matches the live repository.

#### P1-11 [ ] OPEN — Legal preparation (engineering side, **requires owner decisions; see §8**)
- **Change:**
  - Put all player-facing names (game title, factions, generals, units, buildings, taunts) behind a single naming table in `js/data.js`, so a rebrand is a data change.
  - Remove "Hand of Nod".
  - Produce an inventory of every EA-derived name and every citation of EA source in `OBLIGATION_LEDGER.md`.
- **AC:**
  - Changing the naming table renames everything on screen.
  - `rg -i "command & conquer|C&C|nod|granger|thrax|kwai|overlord"` hits only the naming table and the inventory doc.

### Phase 2: Make it a game (Days 31–60)

#### P2-01 [ ] OPEN — Data-driven maps with real terrain
- **Files:** `js/data.js` (MAPS), `js/engine.js` (~293–370 hardcoded layout), `js/nav.js` (~77–88 obstacle rasterization)
- **Change:**
  - Each map defines spawns, supply docks (with amounts), tech buildings, garrisons, obstacles (cliffs, water, rocks), ramps, and roads.
  - Remove the hardcoded layout from the engine.
  - Build 3 hand-made 1v1 maps, each built around one strategic idea:
    1. A bridge chokepoint.
    2. A high-ground oil field.
    3. An urban centre with garrisons.
  - Optional: import from Tiled or LDtk JSON.
- **AC:**
  - Each map produces different pathing (verified by a navigation test).
  - The AI can complete a match on all 3 maps.
  - Docks are tuned so the centre dock becomes contested by around minute 8.

#### P2-02 [ ] OPEN — Terrain rendering
- **Change:**
  - Autotiled ground (sand, rock, road, urban, water), cliff edges, and a scatter pass of props and decals.
  - Pre-bake terrain per chunk to an offscreen canvas.
  - The debug grid becomes a dev toggle.
  - Sharpen the fog-of-war edge.
- **AC:** A 5-second screenshot test, judged by a person: chokepoints and high ground are identifiable at default zoom.

#### P2-03 [ ] OPEN — Sprite-baking pipeline and a single art style
- **Files:** `js/unit_models.js` (keep as the generator), `js/engine.js` `renderUnits` (~3936), `js/vfx.js`
- **Change:**
  - Bake every unit type into 16-direction team-colour atlases, either at load time or as an offline step.
  - Render units as `drawImage` from the atlas.
  - Cull units outside the camera.
  - Apply the ink-line diorama style everywhere.
- **AC:**
  - Draw calls per frame at 400 units drop by ≥10x versus the baseline in §3.3.
  - Visuals stay consistent with `assets/diorama/battle_concept.png`.

#### P2-04 [x] PARTIALLY COMPLETED (23 Oct 2026) — Readability pass
- **Change:**
  - Integrated 33 diorama sprites (`assets/diorama/units/`) across USA, China, and GLA plus live weapon-vs-armor counter effectiveness readouts in the HUD selection inspector.
  - Greyscale/deuteranopia silhouette tuning remains open for iterative polish.

#### P2-05 [x] COMPLETED (23 Oct 2026) — Performance
- **Files:** `js/spatial.js`, `js/engine.js`, `js/nav.js`, verified by [`tests/perf_budget.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/tests/perf_budget.js)
- **Change:**
  - Zero-allocation `queryRadiusInto` in `js/spatial.js`.
  - Binary min-heap open set and flat `Float64Array` / `Int32Array` buffers with `searchStamp` generation counters in `js/nav.js`.
  - Staggered target acquisition scans and stable entity iteration order in `js/engine.js`.
- **AC:**
  - [`tests/perf_budget.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/tests/perf_budget.js) passes with **0.84ms avg / 1.42ms p99** tick time for 1,000 active units (budget: ≤6ms avg / ≤12ms p99).
  - [`tests/determinism_verify.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/tests/determinism_verify.js) passes 50/50 runs.

#### P2-06 AI difficulty based on skill
- **Files:** `js/ai.js` (~501 income bonus, ~692 power usage)
- **Change:**
  - Remove the free income bonus from Easy, Medium, and Hard, and add an explicit "Brutal" tier that keeps it.
  - Scale difficulty by reaction delay, scouting and what the AI can see, build-order tightness, and micro quality.
  - Add retreat-and-regroup when a fight is lost, harassment timings, and attacks timed to its own power spikes.
  - Use Generals Powers on meaningful targets with some delay.
- **AC:**
  - Seeded AI-vs-AI runs show Easy < Medium < Hard < Brutal in win rate against a reference AI.
  - All 81 general matchups fall within a 45–55% win rate on real wins.
  - Median match length is 12–18 minutes.

#### P2-07 Audio foundation
- **Files:** `js/audio.js`
- **Change:**
  - Route every sound through buses → `DynamicsCompressor` → limiter, including the superweapon, promote, and squelch sounds.
  - Apply `volumes.music`.
  - Replace `setInterval` music timing with sample-accurate `AudioContext` scheduling.
  - Add a sample-playback engine with variants and ±8% pitch, a voice limiter (≤6 simultaneous explosions), and EVA ducking.
- **AC:**
  - Each volume slider changes its bus.
  - No source connects directly to `destination`, verified with `rg`.

#### P2-08 HUD cleanup
- **Files:** `index.html`, `css/style.css`, `js/ui.js`
- **Change:**
  - Replace emoji with an SVG icon set.
  - Use fluid type with `clamp()`, and fix the title wrapping.
  - In the top bar, credits, power, and rank dominate; Unit Studio and Building Diorama move into the menu.
  - When nothing is selected, the command card shows a contextual prompt.
- **AC:** The layout is clean at 1280×720, 1440×900, and 5K, verified by screenshots.

### Phase 3: Reasons to come back, and shipping (Days 61–90)

#### P3-01 Tutorial ("Boot Camp")
- A 5-minute scripted tutorial covering building, economy, counters, Generals Powers, and attack-move.
- Contextual hints during the first 3 matches, and a "next objective" prompt.
- Requires a scripted-objectives layer: triggers, objectives, and timers.
- **AC:** In external playtests, ≥70% of players complete the tutorial.

#### P3-02 Challenge mode and campaign
- Challenge mode gets a briefing, a special rule per opponent, and a medal and score screen.
- First 4 campaign missions built on the objectives layer: escort, defend X minutes, capture.
- Track mastery per general.

#### P3-03 Post-match screen
- Graphs over time for army value, income, and units lost.
- MVP unit.
- A "watch replay" button (uses P1-06).

#### P3-04 Voice-over and music
- About 300 recorded lines: EVA, unit barks (3 types × 4 per class), and taunts for the 9 generals.
- Lines processed with a radio filter.
- Stem-based adaptive music per faction (calm, tension, combat), crossfaded by `combatIntensity`.
- Mix target: −16 LUFS integrated.
- **Requires a budget and licensing decision (§8).** Until then, keep text-to-speech behind the same API so recorded lines can be dropped in later.

#### P3-05 VFX juice
- Flipbook atlas for muzzle flashes, impacts, smoke, and debris.
- Trauma-based camera shake scaled by explosion size.
- Hit-stop on big impacts.
- Movement dust and damage-smoke states.

#### P3-06 Accessibility and settings
- Key rebinding.
- Colourblind palettes.
- Subtitles for all VO.
- UI scale (the `--ui-scale` hook already exists).
- Graphics quality presets.
- Respect the existing `prefers-reduced-motion` support.

#### P3-07 macOS release
- Universal binary (arm64 + x86_64) via `xcodebuild`.
- Developer ID signing with hardened runtime, notarization, and stapling.
- Remove the private KVC WebView setting (`macos_main.swift:29`).
- A `WKScriptMessage` bridge for crash and error reporting; the frame loop must report errors, not just log them (`ui.js:156`).
- Opt-in telemetry.
- Sparkle update channel.
- **Requires an Apple Developer account (§8).**

#### P3-08 Multiplayer prototype (stretch; continue into the next 90 days)
- 2-player lockstep over WebRTC or WebSocket, using the command queue and seeded RNG.
- Desync detection via periodic state-hash exchange.
- **AC:** 30-minute matches with no desync over a simulated network with 150 ms latency and 2% packet loss.

---

## 6. Guardrails for every change

- **Don't add dependencies without explicit approval** (repo security rule). Propose them in your summary first.
- **Determinism:** once P1-03 lands, simulation code must never call `Math.random`, `Date.now`, or `performance.now`, or iterate over `Set`/`Map` in non-insertion order. Order-dependent iteration must use sorted IDs.
- **Simulation purity:** no DOM, `window`, audio, or VFX calls inside `update()` after P1-05.
- **No inline imports.** Keep imports at the top of each module.
- **Tests must assert observable behaviour:** positions changing across frames, real wins, state hashes. Not string presence or the same tick's state flags (see the blind spots in `BUG_REPORT.md` Part 1).
- **Keep the app bundle in sync** after every change (`scripts/sync-app-resources.sh`, later `npm run build`).
- **Docs:** only write claims that a committed script reproduces.
- **Commits:** conventional commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`), one ticket per commit or MR.
- **Never commit secrets**, and don't log sensitive data in telemetry.

---

## 7. Verification commands

```bash
node tests/phase2_verify.js
node tests/phase3_verify.js
node tests/simulator_verify.js
node tests/phase4_verify.js
node tests/human_qa_runner.js
# Added by this plan:
node tests/determinism_verify.js   # P1-06
node tests/game_speed_verify.js    # P1-01
node tests/perf_budget.js          # P2-05
node tests/balance_matrix.js       # P1-09 (real wins)
diff -rq js "C&C Generals Zero Hour.app/Contents/Resources/js"   # must be empty
```

---

## 8. Decisions needed from the project owner (don't decide these yourself)

1. **New name and identity** for the rebrand: game title, faction names, general names.
2. **License:** GPL-3.0 (if any EA-derived code is kept) or a proprietary/permissive license after a genuine re-specification. Get legal review.
3. **Repo visibility:** make the GitHub repo private until the rebrand is done?
4. **Approval of dev dependencies** for P1-08 (esbuild, eslint, typescript).
5. **Budget** for recorded VO and commissioned music (P3-04), and for an Apple Developer account (P3-07).
6. **Provenance of `assets/refs/`** images: keep them, replace them, or remove them from the repo.

---

## 9. Success metrics at day 90

| Area | Target |
|---|---|
| Determinism | 100/100 seeded replays identical |
| Performance | 1,000 units: ≤6 ms average simulation tick headless; 60 fps at 400 units on an M1 |
| Balance | Every faction and general within a 45–55% win rate (real wins, N≥10 seeds per matchup) |
| Pacing | Median match length 12–18 min |
| Onboarding | Tutorial completion ≥70% in external playtests |
| Stability | ≥99% crash-free sessions (telemetry) |
| Legal | Zero EA names (`rg` check), license chosen, provenance memo written |
| Playtesting | ≥30 external human testers |
| Go-to-market | Web demo live; Steam page up |
