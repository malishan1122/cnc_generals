# Main Agent Brief — From Skirmish Prototype to a World-Class RTS

**Date:** 22 October 2026 (Updated: 24 October 2026 — Phases 0, 1, 2 & Phase 3 Core Complete ✅)  
**Repo:** `/Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac`  
**Audience:** The main implementation agent. This file is the assignment. Do not treat `README.md`, `PRD.md`, or `STUDIO_MASTER_PLAN.md` as proof that a feature is finished.  
**Panel:** Four independent reviews of this tree on 22 Oct 2026. Average score **4.6 / 10**. Highest: Zero Hour fantasy **6 / 10**. Lowest: public ship readiness **3 / 10**.

> [!IMPORTANT]
> **Phase Execution Status (Updated 24 October 2026):**
> - **Phase 0 (Section 5) — Make the current tree true**: **COMPLETE ✅** (`BUG-UI-07`, `BUG-UI-08`, `BUG-UI-09` verified passing `87/87` in [`tests/human_qa_runner.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/tests/human_qa_runner.js); `.app` bundle synced & cleaned via [`scripts/sync-app-resources.sh`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/scripts/sync-app-resources.sh); all 11 markdown docs synchronized with honest 3-map & runner counts).
> - **Phase 1 (Section 6) — First 15 minutes for a human player**: **COMPLETE ✅** (Skirmish setup matches sim with behavioral `Easy`/`Normal`/`Hard` profiles & visible starting cash, `gameSpeed` fixed-step scaling verified by [`tests/game_speed_verify.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/tests/game_speed_verify.js) (`5/5 PASS`), 3-beat `#onboarding-guide` implemented, translucent 3-second (`3000ms`) auto-expiring HUD banners implemented, China & GLA diorama PNGs integrated in `assets/diorama/units/`, and live weapon-vs-armor counter readout in HUD inspector).
> - **Phase 2 (Section 7) — Simulation truth and scale**: **COMPLETE ✅** (Authoritative `engine.issueCommand()` boundary, Simulation-to-Presentation Event Bus `emitEvent()`/`drainEvents()`, `SeededRNG` in [`js/rng.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/rng.js) serialized in `.zhsave` v2, deterministic state hashing verified by [`tests/replay_hash_verify.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/tests/replay_hash_verify.js) (`7/7 PASS`) and [`tests/determinism_verify.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/tests/determinism_verify.js) (`9/9 PASS`), binary-heap A* + zero-alloc `queryRadiusInto` verified at `<= 6.0ms avg / <= 12.0ms p99` for 1,000 units in [`tests/perf_budget.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/tests/perf_budget.js) (`4/4 PASS`)).
> - **Phase 3 (Section 8) — Content that earns a second match**: **CORE COMPLETE ✅** (Data-driven map `obstacles`, `supplyDocks`, `techStructures`, and `garrisonBunkers` on `TOURNAMENT_DESERT`, `FINAL_CRUSADE`, and `DEFCON_6` rasterized into `js/nav.js`; Challenge 2.0 prefab bases & 75s commander twists; Perceptive Fog-of-War AI `teamMemory` + O(N) spatial vision grid in `js/ai.js`; all 55/55 faction units & 38/38 structures in `js/unit_models.js`; un-clamped 81-matchup `tests/phase4_verify.js` & `tests/balance_matrix.js`).

---

## 1. How to use this file

Work the phases in order. Finish a phase only when its acceptance checks pass. Do not start multiplayer, a story campaign, or a new procedural model family while an earlier phase is open.

Before editing a cited line, re-read the function. Line numbers below were true on 22 Oct 2026 and will drift.

After every phase:

1. Run the verification commands in section 12.
2. Update `README.md`, `PRD.md`, `STUDIO_MASTER_PLAN.md`, `OBLIGATION_LEDGER.md`, and `BUG_REPORT.md` so they match the runner output you just produced. Delete stale “61/61 PASS” and “4 maps” claims.
3. Copy changed runtime files into `C&C Generals Zero Hour.app/Contents/Resources/` from `js/`, `css/`, `index.html`, and tests. Do not edit the app copy by hand and leave `js/` behind.

---

## 2. Verdict

This is a real single-player RTS simulation with a Mac shell. It is not yet a world-class game and it is not ready for a public commercial release.

What is already real:

- 60 Hz fixed step, spatial hash, 8-way navigation, fog of war, armor matrix, power brownouts, garrisons, tunnels, generals’ powers, nine AI doctrines, control groups, stances, faction HUD, `.zhsave`, native `WKWebView` shell.
- About 39,900 lines across `js/`, `tests/`, `css/style.css`, `index.html`, and `macos_main.swift` (updated 23 Oct 2026).
- Unit studio with a complete 93-entity 3D/2.5D CAD registry (`js/unit_models.js`, 12,642 lines) plus 33 diorama sprites under `assets/diorama/units/` and 33 reference sheets under `assets/refs/`.

What blocks “world class”:

| Pillar | Evidence on 22 Oct 2026 | Required outcome |
|---|---|---|
| First session | `BUG_REPORT.md` records `BUG-UI-07`, `BUG-UI-08`, `BUG-UI-09`. Source in `js/ui.js` already contains the recommended patches (see section 5). Docs still claim 61/61. | Human runner green on Retina. Docs match that run. (**Resolved 23 Oct 2026 ✅**) |
| Content | `ZH_DATA` maps are three entries, not four. Challenge is a skirmish ladder. | Honest map list now (**Done ✅**). Authored layouts and one scripted twist per general later. |
| Feel | Procedural canvas rigs, oscillator music, `SpeechSynthesis` EVA. | One faction readable at tactical zoom (**Done ✅**). Commissioned or licensed original VO and stems later. |
| Determinism | `Math.random` inside `js/engine.js` combat, spawns, and camera shake. Saves are snapshots. | Seeded sim RNG and a replay hash before any network code. (**Resolved 23 Oct 2026 ✅**) |
| Shape | `engine.js` 4,866 lines, `ui.js` 4,066, duplicated app Resources. | One packaging step (**Done ✅**). Sim step separated from render. |
| Modes | `checkVictoryConditions()` is last building or builder. Human vs one AI. | Skirmish options that match the sim. Behavior-based difficulty. (**Resolved 23 Oct 2026 ✅**) |
| Legal | Product is named and positioned as Command & Conquer: Generals Zero Hour. | No store release until a license or a rebrand is written down. Clean-room code does not clear the trademark. |

---

## 3. Rules for this assignment

Do:

- Prefer a small change that a player can feel over a new subsystem.
- Keep gameplay RNG on one seeded generator owned by the simulation.
- Keep presentation RNG (screen shake, particle scatter) out of any state that save/replay must reproduce, or seed it too.
- Preserve the clean-room rule: original geometry, audio, and copy. Do not drop in EA extracts, ripped sprites, or ripped voice lines.
- When a test and a doc disagree, the test run you just executed wins. Then fix the doc.

Do not:

- Add multiplayer, matchmaking, or a spectator until a command-log replay reproduces a state hash.
- Add more unit-model render families while `BUG_REPORT.md` and the README disagree.
- Quote the 9×9 “win rates” (USA 47.9%, China 53.0%, GLA 49.1%) as balance proof. `tests/balance_matrix.js` scores short army-value slices with forced credits. It is a crash/smoke matrix until it plays matches to a victory.
- Market Generals’ Challenge as a story campaign. `CHALLENGE_LADDER` in `js/data.js` is nine general ids.
- Edit only the `.app` bundle.

---

## 4. Source snapshot (re-verify before acting)

**Maps** in `js/data.js` `MAPS` (around line 2763):

- `TOURNAMENT_DESERT` — Tournament Desert
- `FINAL_CRUSADE` — Final Crusade
- `DEFCON_6` — Defcon 6 (Arctic Stronghold)

`README.md` still names Desert Storm and Twin Rivers. Those ids are not in `MAPS`. Either implement them as real layouts or remove them from every doc.

**Victory** in `js/engine.js` `checkVictoryConditions()` (around line 3306): a side is alive if it has a building with `hp > 0` or a living builder. There is no surrender, timer, or objective mode.

**Challenge** in `js/data.js` `CHALLENGE_LADDER` (around line 2800): Granger, Kwai, Thrax, Townes, Shin Fai, Kassad, Tao, Juhziz, Alexander.

**Difficulty cash** in `js/engine.js` `createTeam` (around line 253): Hard 14000, Easy 8500, Normal 10500, against a human start near 10000. That is an economy handicap, not a behavior profile.

**Nondeterminism:** `Math.random` appears in `js/engine.js` at spawn jitter, power impact offsets, rally scatter, bursts, and camera shake. Treat sim-affecting calls as phase 3 work. Leave visual-only shake until the replay hash defines which streams must be seeded.

**Packaging:** runtime also lives under `C&C Generals Zero Hour.app/Contents/Resources/`. Synced via [`scripts/sync-app-resources.sh`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/scripts/sync-app-resources.sh).

**Largest files (lines, updated 23 Oct 2026):**

| File | Lines |
|---|---:|
| `js/unit_models.js` | 12642 |
| `js/engine.js` | 5551 |
| `js/ui.js` | 4132 |
| `css/style.css` | 3753 |
| `js/data.js` | 3121 |
| `tests/human_qa_runner.js` | 1767 |
| `js/vfx.js` | 1272 |
| `js/simulator.js` | 995 |
| `js/ai.js` | 886 |
| `js/unit_studio.js` | 773 |
| `js/spatial.js` | 632 |
| `js/audio.js` | 436 |
| `js/nav.js` | 411 |
| `macos_main.swift` | 149 |
| `js/rng.js` | 102 |

Art inventory: 33 files in `assets/diorama/units/` (including all 12 GLA diorama sprites) and 33 reference sheets in `assets/refs/`.

---

## 5. Phase 0 — Make the current tree true (do this first)

### 5.1 Re-test the three known UI bugs before patching again

`BUG_REPORT.md` Part 2 tells the main agent to fix these. On 22 Oct 2026 the working tree in `js/ui.js` already shows the recommended code. Confirm with a run. Do not apply a second, conflicting patch.

**BUG-UI-07 (Retina marquee).** `resizeCanvases()` sets both `engine.pixelRatio` and `engine.dpr`. `renderSelectionBox()` uses `engine.pixelRatio || engine.dpr || 1` and `setTransform(dpr, ...)`. The old failure was `const dpr = engine.dpr || 1` while `engine.dpr` was undefined, so the marquee drew at half size on `devicePixelRatio = 2`.

**BUG-UI-08 (build mode swallows selection).** The left-click handler, when `commandMode === 'BUILD'`, looks for a friendly unit, building, or bunker under the cursor. If it finds one, it clears `commandMode` and `pendingBuildId` and does not return, so selection can continue. If it does not, it places or returns. The old failure kept build mode latched, or placed a scaffold on a friendly unit because `canPlaceBuilding()` only tested buildings.

**BUG-UI-09 (NaN move marker).** `pushMoveMarker()` pushes `t: 0`. `renderMoveMarkers()` must tolerate a missing `t` anyway (`(m.t || 0)`), so a same-frame render cannot pass `NaN` into `ctx.arc`.

Acceptance:

- `node tests/human_qa_runner.js` exits 0.
- If Playbook 13 still fails, fix the assertion’s actual mismatch. Read the failure string. The BUILD-mode case must end with build mode cleared and the clicked friendly selected, not the dozer left selected as a side effect.
- `BUG_REPORT.md` header matches the new pass count. Remove “all bugs resolved” if anything is still failing.

### 5.2 One packaging path

Add a single script (shell is enough; no new npm dependency) that copies:

- `index.html`, `css/`, `js/`, and the test files the app actually loads
- into `C&C Generals Zero Hour.app/Contents/Resources/`

Run it at the end of every phase. Document it in `BUILD.md`.

Acceptance: after a one-line JS change and a sync, `diff -q js/engine.js "C&C Generals Zero Hour.app/Contents/Resources/js/engine.js"` is empty. Same for `ui.js`, `data.js`, `vfx.js`, `audio.js`, `ai.js`, `nav.js`, `spatial.js`.

### 5.3 Doc correction, same phase

Replace these claims everywhere they appear:

| Stale claim | Replacement until a later phase earns a new number |
|---|---|
| 4 skirmish maps, including Desert Storm and Twin Rivers | 3 maps: Tournament Desert, Final Crusade, Defcon 6 |
| Human QA 61/61, 9 playbooks, 123 actions | The count printed by the latest `human_qa_runner.js` run |
| 9×9 win rates inside 35–65% as balance proof | “81 short AI slices completed without a runtime throw. Not a human balance result.” |
| “Complete Zero Hour experience” / phase 4 complete as product-complete | “Single-player skirmish and challenge gauntlet. Campaign, replay, and multiplayer are not in this build.” |

Acceptance: `rg "61/61|Desert Storm|Twin Rivers" README.md PRD.md STUDIO_MASTER_PLAN.md OBLIGATION_LEDGER.md` returns no product claims.

---

## 6. Phase 1 — A match a new player can finish (about 30 days)

Design director and producer agreed this is the next player-facing bet.

### 6.1 Skirmish setup matches the sim

The start screen may offer only options the engine implements today:

- General vs general (already present).
- Map: the three real ids.
- Difficulty: Easy / Normal / Hard, with the cash numbers visible.
- One sentence on victory: destroy every enemy building and builder.

If you add game speed, it must change the fixed-step accumulator or the amount of sim time per frame in one place, and saves must restore it.

### 6.2 Guided first match

Add one explicit onboarding path, not a QA playbook. Three beats:

1. Select the builder, place a supply building, order a harvester, confirm credits increase.
2. Place power (USA/China) or a barracks (GLA) and train one combat unit.
3. Attack-move that unit and select it again with a drag box.

A player who has never opened the PRD must be able to finish this without reading `README.md`.

### 6.3 China reads at tactical zoom

Use the existing diorama PNGs as the in-game picture at normal camera zoom for China units that already have a paired `assets/diorama/units/*.png` and `assets/refs/*_diorama_ref.png`. Keep the procedural rig for the unit studio and for close inspection.

Art rules for this pass:

- Class silhouette first: tank, truck, infantry blob, artillery, aircraft must separate at the size they appear in a 40-unit fight.
- One team accent. Three cel values. Do not reuse USA hull proportions for China or GLA.
- No new emoji command-card icons. Use the diorama cameo or a simple geometric cameo.

Acceptance: a skirmish as China vs a USA AI shows supply truck, battlemaster, and red guard as different shapes without selecting them. Studio still opens the parametric rig.

### 6.4 Counter readout

When a unit is selected and the cursor is over an enemy, the inspector shows weapon damage type and the target armor class from the existing matrix in `js/data.js`. Do not invent a second matrix.

Acceptance: selecting a tank hunter and hovering a battlemaster shows armor-piercing vs tank, using the data file’s labels.

---

## 7. Phase 2 — Simulation you can trust (about 90 days)

Technical director’s gate. No sockets in this phase.

### 7.1 Simulation kernel

Extract a function with this shape, even if it still lives in `js/engine.js` at first:

```text
step(tick, commands) -> new state
```

`js/ui.js` posts commands (move, attack, build, train, power, stop). It does not mutate unit positions except by enqueueing a command. The render loop may interpolate. It must not call `Math.random` for gameplay.

### 7.2 Seeded RNG

Add one `simRng` seeded from match start and stored in the save. Replace gameplay `Math.random` in spawn positions, projectile scatter that affects damage, rally offsets, and AI rolls. Record the seed in `.zhsave`.

### 7.3 Replay hash

Write a file containing seed, map, generals, and the command list with tick indexes. A headless reload applies that log and hashes unit ids, positions (quantized), hp, and building hp at a chosen tick. Two runs in one process must match. Document the hash function in a short comment next to the test.

### 7.4 Navigation cost

Stop rebuilding the spatial hash and the nav blockage as if every tick were a fresh map when nothing was built or destroyed. Invalidate on building footprint changes. Add a stress test that issues a group move of at least 80 units and asserts the step still finishes. Record the budget you actually measured. Do not claim a frame rate you did not record.

### 7.5 AI difficulty is behavior

Remove the hidden credit gap, or show it as an explicit handicap slider. Easy, Normal, and Hard must differ by production choice, raid frequency, and power timing in `js/ai.js`, not only by starting money.

Acceptance:

- A Node test loads a fixed seed and command log and compares the hash at tick T.
- `rg "Math.random" js/engine.js js/ai.js` is empty for gameplay, or each remaining call is commented as presentation-only and excluded from the hash.
- Difficulty descriptions on the start screen match the code path.

---

## 8. Phase 3 — Content and feel (this year, after phase 2)

Do this only after phase 2’s hash test exists.

### 8.1 Maps

Replace theme-only arenas with layouts that change choke points, water or cliffs, civilian bunkers, and tech building positions. Target 8–12. Each map needs a one-sentence identity a player can repeat (“central oil, two bridges”). Update `MAPS` and the start screen together.

The existing three ids can stay as the first three if their layouts become real. Desert Storm and Twin Rivers get added only when they have distinct geometry.

### 8.2 Challenge 2.0

For each id in `CHALLENGE_LADDER`, define a prefab base, a handicap, and one scripted twist (air rush, tunnel raid, superweapon timing). Taunts stay. A twist is a trigger in the sim, not a paragraph in the PRD.

### 8.3 Audio

Replace `SpeechSynthesis` EVA for match-critical lines with original recordings or a licensed pack you have rights to. Build faction music as stems (drums, bass, lead) with a stinger on superweapon launch. Sidechain music under voice. Keep the spatial panner in `js/audio.js`.

### 8.4 USA and GLA art

Repeat the China LOD pass. Finish GLA next (worker, rebel, technical, scorpion, scud), then USA (dozer, crusader, humvee, ranger).

### 8.5 Balance

Rewrite `tests/balance_matrix.js` so a sample of matchups runs until `checkVictoryConditions()` or a declared tick cap, and the report says which. Publish win counts only from those full games. Human notes beat the matrix when they disagree.

### 8.6 Legal line

Pick one and write it at the top of `README.md`:

- Fan, non-commercial, not affiliated with EA, or
- Rebrand to an original title and original faction names before any store listing, or
- Licensed product (only if a license exists in the repo; do not invent one).

Acceptance: a playtester can name a favorite map and a favorite general after two sessions. README’s first paragraph matches the legal line.

---

## 9. Explicitly later

These are real gaps. They are not the next sprint.

- Lockstep or rollback multiplayer. Requires phase 2 replay hashes across two processes.
- Story campaign with fail states and scripted objectives.
- Localization beyond English.
- Mod SDK. A stable data schema and replay hash are the prerequisite.
- WebGL. Only after a recorded 150-unit canvas profile misses the frame budget.

---

## 10. Specialist opinions (do not flatten these into one score)

### RTS design director — fantasy 6/10, modern RTS 3.5/10

The economy, powers, tunnels, garrisons, and doctrines are a Generals vocabulary. The product is a 1v1 annihilation sandbox. Challenge is a queue. The balance matrix is telemetry, not proof. Sequence: honest skirmish, then maps and scripted challenge twists, then replay, then multiplayer, then a small mission set.

### Engine technical director — simulation 5.5/10, production engineering 4/10

Fixed step, spatial hash, fog, and save v2 are the right skeleton. `Math.random`, UI ownership of sim steps, per-tick rebuilds, and the duplicated app tree block a platform. Sequence: package and green the UI runner, extract `step(tick, commands)`, seed RNG, hash a replay, then think about a wire protocol.

### Presentation director — readability 5.5/10, emotional audio 4/10

HUD structure, decals, scaffolding, and superweapon beats are coherent. Shared hull families and browser TTS do not carry a fight or a faction. Sequence: China illustrated LOD at tactical zoom, procedural rigs reserved for the studio, then original VO and stem music. Reference board stays the project’s own PNGs.

### Live producer and QA director — session reliability 5/10, ship readiness 3/10

The suite culture and the native shell are ahead of a typical hobby RTS. A publisher stops shipment for contradictory pass claims, Retina selection bugs, thin map count, English-only UI, and the trademark. Ladder:

| Stage | Gate |
|---|---|
| Private alpha | Phase 0 and phase 1 acceptance. Legal stance written. 30–60 minute human session with the frame loop still alive. |
| Public demo | 1–2 maps, 3 factions, onboarding, fan or rebranded label, no EA store listing. |
| 1.0 | License or original IP. Skirmish and challenge stable. Labeled single-player until replay exists. |

Automated tests do not prove the match is fun. Keep a human soak on the list for every release candidate.

---

## 11. File map for the work

| Concern | Primary files |
|---|---|
| Selection, build mode, markers, marquee | `js/ui.js` |
| Victory, cash, fog, save, `Math.random` | `js/engine.js` |
| Map list, generals, damage matrix, challenge order | `js/data.js` |
| Doctrines and difficulty behavior | `js/ai.js` |
| Path invalidation | `js/nav.js`, `js/spatial.js` |
| In-game drawing and diorama LOD | `js/vfx.js`, `js/unit_models.js`, `assets/diorama/`, `assets/refs/` |
| Music and EVA | `js/audio.js` |
| HUD | `index.html`, `css/style.css` |
| Human truth | `tests/human_qa_runner.js`, `BUG_REPORT.md` |
| Smoke balance | `tests/balance_matrix.js` |
| Mac shell | `macos_main.swift`, `BUILD.md`, the `.app` Resources tree |
| Claims | `README.md`, `PRD.md`, `STUDIO_MASTER_PLAN.md`, `OBLIGATION_LEDGER.md` |

---

## 12. Verification commands

Run from the repo root:

```bash
node tests/human_qa_runner.js
node tests/simulator_verify.js
node tests/phase2_verify.js
node tests/phase3_verify.js
node tests/phase4_verify.js
node tests/replay_hash_verify.js
node tests/game_speed_verify.js
node tests/determinism_verify.js
node tests/perf_budget.js
```

All 9 suites pass as of 23 Oct 2026. Do not update pass counts in markdown from memory.

Manual Mac check after phase 0 and phase 1, Retina if available:

1. Launch the `.app` after the sync script.
2. Drag-select a mixed group. The marquee sits on the cursor.
3. Select the dozer, click a building cameo, then click a friendly unit. The unit becomes selected and build mode ends.
4. Right-click move. The marker renders on the same frame with no console error from `ctx.arc`.
5. Place a supply structure and watch credits change.

---

## 13. Definition of progress

A change counts when a player can tell, or when a hash test fails if the change is reverted. A new SYS id, a longer `unit_models.js`, or a README sentence that the runner does not support does not count.

World class, for this project, means: a deterministic skirmish a new player can read, maps and audio they remember, docs that match the binary, and a title you have the right to ship. Reach that in the phase order above.
