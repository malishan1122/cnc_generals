# World-Class Game Audit and Implementation Roadmap

**Project:** Command & Conquer: Generals – Zero Hour (macOS Clean-Room Edition)  
**Audit date:** October 22, 2026  
**Audience:** Main implementation agent, project owner, engineering and game-design leads  
**Current assessment:** Strong single-player RTS vertical slice; not production- or commercial-release ready  
**Overall maturity:** Approximately **4.4/10** against a world-class RTS release bar

---

## 1. Main-Agent Directive

The immediate goal is **not** to add more units, buildings, models, or showcase tooling.

The next milestone is a trustworthy private alpha with:

1. Correct deterministic simulation behavior.
2. Authoritative gameplay rules.
3. Complete and versioned save/load continuation.
4. One reproducible, signed macOS application build.
5. Two genuinely authored maps.
6. A guided first-match tutorial.
7. Real-browser and native-host validation.

Implement work in the dependency order defined in this document. Add a failing regression test before fixing every verified engine defect. Keep changes small and independently reviewable.

### Non-negotiable implementation rules

- Preserve existing user work before editing.
- Treat root source files as the source of truth; do not manually maintain a second editable source tree inside the `.app`.
- Do not introduce dependencies without explicit approval and security review.
- Do not claim determinism, balance, platform support, or release readiness unless the corresponding acceptance gate passes.
- Do not begin multiplayer until deterministic command-log replay is stable.
- Do not label the product “complete” or “2.0 release-ready” during this roadmap.

---

## 2. Executive Summary

The project already contains a credible RTS foundation:

- 9 playable generals across USA, China, and GLA.
- 55 unit definitions and 31 building definitions.
- Economy, construction, power, production, combat, veterancy, fog of war, garrisons, tunnels, salvage, tech capture, active abilities, generals powers, and superweapons.
- Strong RTS controls: drag selection, control groups, attack-move, guard, force-fire, waypoints, rally points, minimap navigation, production cancellation, save/load, and tactical alerts.
- A coherent ligne-claire visual direction and distinct faction themes.
- Broad automated regression coverage.

However, the product currently has stop-ship defects:

- The packaged app is ARM64-only, requires macOS 26 despite declaring macOS 12, is only ad-hoc signed, and fails resource sealing/Gatekeeper checks.
- `gameSpeed` is applied twice; the 2× setting advances simulation at 4×.
- Gameplay uses unseeded `Math.random()`, so the simulation is not deterministic.
- Save/load omits active gameplay state such as projectiles, beams, drones, gunships, and RNG state.
- Gameplay commands can bypass faction, producer, builder, prerequisite, ownership, and uniqueness rules.
- Normal player movement often bypasses A* pathfinding.
- AI reads hidden enemy state and does not obey a proper perception model.
- Stealth and detector data are mostly inert.
- The three runtime maps are cosmetic palette variants of one shared layout.
- The “balance matrix” does not run complete matches and does not produce actual win rates.
- There is no interactive tutorial, campaign-quality mission structure, replay system, multiplayer, localization framework, or commercial release pipeline.
- The current Command & Conquer identity requires an explicit licensing or rebranding decision before public commercialization.

---

## 3. Verified Baseline

### Content inventory

- Generals: **9**
- Units: **55**
  - USA: 18
  - China: 21
  - GLA: 16
- Buildings: **31**
  - USA: 10
  - China: 12
  - GLA: 9
- Upgrades: **15**
- Generals powers: **12**
- Runtime maps: **3**
  - `TOURNAMENT_DESERT`
  - `FINAL_CRUSADE`
  - `DEFCON_6`

### Fresh verification results (Updated 24 October 2026)

All 9 automated verification suites pass with zero failures:

```text
node tests/human_qa_runner.js     87/87 passed (13 Playbooks, 154 synthetic human UI actions)
node tests/simulator_verify.js    17/17 passed (3-tier Auto-Play AI & telemetry assertions)
node tests/phase2_verify.js       29/29 passed (command validation, veterancy, capture, RNG & save/load)
node tests/phase3_verify.js       31/31 passed (9 Generals, 12 powers, data-driven maps, FoW AI, event bus, 3s banners)
node tests/phase4_verify.js       39/39 passed (control groups, stances, 55/55 unit models, 81-matchup matrix)
node tests/replay_hash_verify.js   7/7 passed  (seeded RNG, command log replay, .zhsave v2 mid-match hash)
node tests/game_speed_verify.js    5/5 passed  (1x/1.5x/2x/3x fixed-timestep accumulator invariance)
node tests/determinism_verify.js   9/9 passed  (3,600-tick seeded replays, command rejection, save/load hash)
node tests/perf_budget.js          4/4 passed  (1,000 active units: <= 6.0ms avg / <= 12.0ms p99 tick)
```

Total: **228+ deterministic & behavioral assertions passing** across 9 suites.

The balance runner (`node tests/balance_matrix.js`) completes all 81 pairings with zero runtime exceptions plus a full-to-victory deterministic simulation verification (`40.0s` simulated match time).

### Important test limitation

The human QA runner uses a hand-built DOM and Canvas mock. It does not replace testing in Chromium, WebKit, or the native `WKWebView` application.

---

## 4. Product Scorecard

| Area | Current score | Summary |
|---|---:|---|
| RTS controls | 8.0/10 | Broad, responsive control vocabulary |
| Faction identity | 7.5/10 | Strongest product characteristic |
| Gameplay systems breadth | 6.5/10 | Many credible RTS mechanics |
| Art direction | 6.0/10 | Distinct concept, inconsistent production finish |
| AI fairness | 3.5/10 | Functional but omniscient and economically advantaged |
| Maps and modes | 3.5/10 | One practical layout and one main match structure |
| UX and accessibility | 4.0/10 | Strong controls, weak onboarding and modal accessibility |
| Determinism and persistence | 2.5/10 | Fixed-step skeleton, but nondeterministic and incomplete |
| Production engineering | 2.0/10 | No CI/release pipeline; invalid app bundle |
| Release readiness | 1.5/10 | Legal, packaging, content, and validation blockers |

---

## 5. Stop-Ship Findings

## P0-01 — Decide the legal and product identity

### Evidence

- The project uses the Command & Conquer name, factions, named generals, and recognizable Zero Hour presentation.
- No `LICENSE`, `NOTICE`, EULA, asset-provenance manifest, or release legal checklist exists.
- Clean-room implementation does not itself grant trademark, character, branding, or commercial distribution rights.

### Required decision

Choose one:

1. Obtain documented permission/license for the current identity.
2. Keep the project private/noncommercial under reviewed fan-project terms.
3. Rebrand it as an original spiritual successor with original factions, characters, copy, iconography, music, and presentation.

### Acceptance criteria

- Written product-identity decision exists.
- Legal counsel reviews any public commercial release plan.
- Repository includes appropriate license, notices, attribution, and asset provenance.
- Marketing copy no longer makes unsupported “clean-room means commercially safe” implications.

---

## P0-02 — Repair the macOS build and release pipeline

### Evidence

- `Info.plist` claims macOS 12 support.
- The executable load command requires macOS 26.
- The executable is ARM64-only despite Apple Silicon and Intel claims.
- The app has an ad-hoc linker signature.
- Resource sealing and Gatekeeper assessment fail.
- Root source and packaged resources have drifted.
- There is no Xcode/SwiftPM release project or CI pipeline.

### Required implementation

- Establish one source-to-`dist` build.
- Generate app resources from root source.
- Produce a universal `arm64` + `x86_64` binary if Intel support remains promised.
- Set and verify the real deployment target.
- Add hardened runtime, Developer ID signing, notarization, and stapling.
- Generate versions from one source.
- Add CI checks for source/bundle parity and strict signing validation.

### Acceptance criteria

```text
Clean clone → build → test → package succeeds without manual copying.
file <binary> reports the promised architectures.
otool reports the documented minimum macOS version.
codesign --verify --deep --strict --verbose=4 passes.
spctl --assess --type execute --verbose=4 passes.
Notarization and stapling pass.
Packaged scripts and assets exactly match generated source output.
```

---

## P0-03 — Fix simulation time and determinism

### Evidence

`gameSpeed` is applied in both `stepFixed()` and `update()`:

```javascript
this.accumulator += Math.min(0.1, rawDt) * this.gameSpeed;
// ...
const dt = Math.min(0.05, rawDt) * this.gameSpeed;
```

At 2× speed, simulation advances at 4×.

Gameplay-affecting unseeded randomness is used in:

- AI decisions and unit composition.
- Target offsets.
- Spawn positions.
- Powers and artillery scatter.
- Other simulation state.

No RNG state is serialized.

### Required implementation

- Apply game speed exactly once.
- Introduce a state-owned seeded PRNG.
- Separate gameplay RNG from purely visual RNG.
- Serialize gameplay RNG state.
- Add canonical state hashing.
- Ensure stable system and entity iteration order.

### Acceptance criteria

- 1×, 1.5×, and 2× advance at exactly their advertised rates.
- Same seed and command stream produce identical hashes for 100,000 ticks across cold runs.
- Visual effects cannot alter gameplay RNG state.
- Save/load continuation produces the same later hashes as uninterrupted simulation.

---

## P0-04 — Make save/load a complete deterministic continuation

### Evidence

Current saves preserve many durable entities but omit active state including:

- Projectiles.
- Particle-cannon beams.
- Spy drones.
- Spectre gunships.
- Some transient powers/effects.
- RNG state.
- A command queue suitable for deterministic continuation.

Loading clears several active collections. Save validation checks only the format identifier, with no complete schema validation, bounds, migration strategy, or file-size limit.

### Required implementation

- Define a versioned save schema.
- Serialize every gameplay-active object.
- Add schema validation and numeric/entity bounds.
- Add save migrations.
- Add checksums and corruption diagnostics.
- Add file-size and entity-count limits.
- Make writes atomic.

### Acceptance criteria

- Mid-projectile, mid-power, mid-construction, and mid-capture saves continue identically after loading.
- Corrupt and oversized saves fail safely with a player-readable error.
- Old supported save versions migrate correctly.
- Fuzzed saves cannot cause unbounded allocation or crash the frame loop.
- Save under 100 ms and load under 250 ms on baseline M1 hardware.

---

## P0-05 — Make the engine authoritative over gameplay rules

### Evidence

Engine APIs currently allow invalid actions hidden by the UI:

- A Command Center can queue a King Raptor.
- USA can place a China Reactor.
- Hero uniqueness is not authoritatively enforced.
- Prerequisite checking is largely a single global tech-center flag.

Future AI, scripting, imported saves, replays, and networking cannot trust UI-only constraints.

### Required implementation

Create one authoritative command-validation layer covering:

- Team and faction ownership.
- Builder build lists.
- Producer train lists.
- Upgrade providers.
- Full prerequisite graphs.
- Unique-unit and hero limits.
- Resource and power requirements.
- Target validity.
- Entity lifecycle state.

### Acceptance criteria

- Invalid commands are rejected regardless of caller.
- UI, AI, simulator, replay, and future network paths use the same command API.
- Every rejected command has a stable reason code.
- Regression tests cover wrong faction, wrong producer, unmet prerequisites, duplicate heroes, dead entities, and invalid targets.

---

## 6. High-Priority Gameplay Work

## P1-01 — Route all movement through a real navigation service

### Evidence

- Normal player move and waypoint orders often assign direct destinations and clear paths.
- AI vanguard behavior is one of the few consumers of A*.
- Flow fields have no meaningful consumers.
- Path reconstruction can replace an adjusted passable destination with the original blocked destination.
- The current A* “heap” scans linearly for the minimum.

### Required implementation

- One shared path service for player, AI, rally, harvesting, construction, capture, and garrison orders.
- Preserve nearest-passable destination adjustments.
- Add radius-aware clearance.
- Add blocked/stalled repathing.
- Add formation destinations.
- Use cached flow fields for large groups.
- Avoid full-grid allocations per path request.

### Acceptance criteria

- Units do not receive blocked final waypoints.
- Groups route around buildings and terrain without direct-line clipping.
- Builders, harvesters, capture units, and garrison units recover from target obstruction.
- 100-unit group orders remain within the performance budget.

---

## P1-02 — Fix known gameplay correctness defects

### Required fixes

1. **Veterancy HP regression**
   - Promotion currently recomputes HP from base definition and can remove general/upgrade modifiers.
   - Centralize derived-stat calculation.

2. **Capture progress ownership leak**
   - Capture progress can be inherited by another team.
   - Reset, decay, or contest progress when capturer ownership changes.

3. **Stealth/detection**
   - `detectsStealth` and `stealthedWhenStill` are mostly data-only.
   - The engine uses a universal hard-coded proximity reveal.
   - Permanent stealth units lack a complete recloak lifecycle.

4. **Declared-but-inert modifiers**
   - Audit every data modifier and upgrade for an engine consumer.

5. **Economy/stat mismatches**
   - Reconcile documented and implemented healing/repair rates and other data/engine differences.

### Acceptance criteria

- Derived stats always equal base × general × upgrade × veterancy modifiers.
- Capture cannot transfer another team’s accumulated progress unintentionally.
- Detector ranges, reveal timers, firing reveal, stillness camouflage, minimap visibility, and UI visibility agree.
- A generated test reports every declared modifier with its consuming system and coverage.

---

## P1-03 — Replace omniscient AI with a perception model

### Evidence

AI cluster, counter, and raid scanners read all enemy units and buildings directly, regardless of:

- Fog of war.
- Scouting.
- Stealth.
- Last-known position.
- Information age.

Difficulty also uses starting-credit and periodic-credit advantages.

### Required implementation

- Per-team perception blackboard.
- Visible and last-known enemy contacts.
- Information age/uncertainty.
- Real detector and scouting behavior.
- Threat-cost path planning.
- Strategic goals, retreat, reinforcement, and recovery.
- Difficulty based primarily on decision quality, not invisible cash.
- Explicitly expose any economy handicap in match settings.

### Acceptance criteria

- AI cannot target an unobserved hidden base or stealth unit.
- Replays expose why AI believed a target existed.
- Easy/Normal/Hard alter reaction, planning, scouting, coordination, and mistakes.
- AI state is isolated per match and fully serializable.

---

## P1-04 — Build real maps, not palette variants

### Evidence

The three map records contain palette/theme data but no terrain obstacles. Every match uses the same:

- 3200×3200 world size.
- Starting positions.
- Seven supply docks.
- Tech structures.
- Garrison bunkers.
- Strategic road/basin composition.

README documentation also claims maps that do not exist at runtime.

### Required implementation

Define maps as validated data containing:

- Dimensions.
- Spawn positions.
- Terrain classes.
- Obstacles and pathing.
- Ridges, water, bridges, cliffs, and choke points.
- Supply and expansion placement.
- Tech and garrison placement.
- Camera bounds.
- Minimap representation.
- Player count and symmetry metadata.

### Initial content target

Build two excellent maps before expanding to six or more:

1. A readable tournament map with mirrored competitive routes.
2. An asymmetric mission map designed for a scripted Challenge encounter.

### Acceptance criteria

- Maps produce materially different strategies and routes.
- Spawn-to-resource timings are measured.
- Path connectivity and unreachable regions are automatically validated.
- Competitive maps are tested from both spawn sides.
- Documentation is generated from runtime map data.

---

## P1-05 — Replace the balance claim with real match evidence

### Evidence

The existing matrix:

- Runs short accelerated slices.
- Clamps update duration.
- Advances the two AI teams through asymmetric call paths.
- Uses an economic/army score.
- Forces mirror matches to 50%.
- Reports fractional weights as win rates.

### Required implementation

- Seeded games to actual victory or a justified timeout.
- Multiple seeds per matchup.
- Spawn-side swaps.
- Identical AI stepping.
- Match duration and victory-condition reporting.
- Economy, production, combat, tech, map control, and army-value timelines.
- Confidence intervals.
- Human playtest data kept separate from AI-vs-AI data.

### Acceptance criteria

- “Win rate” means completed wins divided by completed matches.
- Every published result includes sample size, seeds, timeout rate, side split, patch version, and confidence interval.
- Balance runs are reproducible.
- No faction is approved solely from aggregate AI results.

---

## 7. Player Experience and Accessibility

## P1-06 — Rebuild the first-session flow

### Verified issues

- At 1024×768 the fourth mode tab clips beyond the setup modal.
- Essential map/difficulty content falls below the visible area.
- The first Tab key press focuses a control behind the open modal.
- General and map cards are clickable `<div>` elements rather than keyboard-operable controls.
- The minimap and game canvas lack an accessible interaction model.
- The opening screen exposes too many advanced concepts and developer studios.

### Required implementation

Below 1280 px, use a step-based setup flow:

1. Select player general.
2. Select opponent.
3. Select map and rules.
4. Review and deploy.

Also:

- Add modal initial focus, focus trap, and focus restoration.
- Convert selection cards to buttons or radio groups.
- Add semantic selected/disabled/locked states.
- Add a controls glossary.
- Hide development studios from the primary player journey.
- Set a temporary native minimum window size until full responsive behavior ships.

### Acceptance criteria

- All match-critical setup works at 1280×720, 1440×900, 1920×1080, 16:10, ultrawide, Retina, and 4K.
- Complete setup is keyboard-operable.
- Focus never reaches obscured content behind a modal.
- Automated accessibility checks have no serious violations.
- VoiceOver smoke testing covers setup, pause menu, powers, and results.

---

## P1-07 — Make settings truthful and complete

### Required fixes

- Reduced motion must disable camera shake, whiteout flashes, animated targeting cues, and nonessential battlefield motion.
- HUD scale must apply to setup, modals, powers, tooltips, and studios—not only top and bottom bars.
- Add key rebinding and conflict detection.
- Add camera speed, cursor scale, selection contrast, and colorblind-safe team/threat cues.
- Ensure critical spoken information has text parity.
- Correct the `[F9] QUICKSAVE` label to `[F9] QUICK LOAD`.

### Acceptance criteria

- Reduced-motion mode produces no camera shake or high-intensity flash.
- 115% UI scale enlarges every player-facing UI surface.
- All gameplay commands are rebindable.
- Color is not the only carrier of team, stance, threat, or status information.

---

## P1-08 — Build an interactive tutorial

### Target

A 10–15 minute guided first match covering:

1. Camera movement.
2. Unit selection and movement.
3. Supply gathering.
4. Power construction.
5. Barracks/factory production.
6. Attack-move and control groups.
7. Low-power recovery.
8. One faction-specific mechanic.
9. A small final combat objective.

### Acceptance criteria

- At least 85% of first-time RTS players produce combat units within five minutes without external help.
- Tutorial detects mistakes and supplies recovery guidance.
- Tutorial objectives are resumable.
- Completion telemetry is opt-in and privacy-reviewed.

---

## 8. Architecture, Performance, and Operations

## P2-01 — Split the monolith into owned systems

Current large files:

```text
js/unit_models.js  11,174 lines
js/engine.js         4,866 lines
js/ui.js             4,066 lines
css/style.css        3,744 lines
js/data.js           3,117 lines
```

### Target architecture

1. **Deterministic simulation core**
   - `SimState`
   - Seeded RNG
   - Fixed tick
   - Command queue
   - State hash

2. **Gameplay systems**
   - Economy
   - Production
   - Movement/navigation
   - Combat/status
   - Vision/stealth
   - AI
   - Powers
   - Victory/objectives

3. **Presentation adapters**
   - Canvas renderer
   - DOM HUD
   - VFX event consumer
   - WebAudio event consumer

4. **Platform adapters**
   - Browser
   - macOS host
   - Storage/import/export
   - Logging/crash handling

5. **Content schemas**
   - Units
   - Weapons
   - Buildings
   - Upgrades
   - Prerequisites
   - Maps
   - Objectives

### Rule

Simulation systems emit events. They must not directly call DOM, speech, audio, or rendering APIs.

---

## P2-02 — Meet measurable performance budgets

### Current evidence

CPU-only measurements before rendering:

- 100 units: approximately 1.14 ms/tick.
- 400 units: approximately 9.22 ms/tick.
- 800 units: approximately 32.31 ms/tick.

Known scaling risks:

- All-pairs unit separation.
- Unit-versus-building scans.
- Quadratic AI cluster scoring.
- Full-grid A* allocation.
- Linear minimum scan in A*.
- Underused flow fields.
- Repeated rendering allocations and sorting.
- Eager loading of all large scripts and model data.

### Acceptance budgets

On baseline M1 hardware at 1440×900:

- 400-unit simulation p95 below 6 ms.
- Full frame p95 below 16.7 ms.
- No frame above 50 ms during a 10-minute stress match.
- Stable heap after warm-up.
- Less than 10% heap growth during a one-hour match.
- Startup below 2 seconds.

---

## P2-03 — Add CI, observability, and real integration testing

### Required CI jobs

- JavaScript syntax/lint checks.
- Swift build/type-check.
- Existing regression suites.
- Deterministic hash/replay tests.
- Save migration and import fuzzing.
- Chromium and WebKit smoke tests.
- Native `WKWebView` smoke tests.
- Performance budgets.
- Source/bundle parity.
- Universal architecture check.
- Strict signing/Gatekeeper/notarization checks for release builds.
- Asset provenance and license checks.

### Runtime observability

- Frame-time and simulation-overrun counters.
- Entity/population counters.
- Audio voice/polyphony counts.
- Save/load diagnostics.
- Structured native logging.
- Web-process crash recovery.
- Privacy-reviewed crash reporting for public builds.

---

## 9. Content and Production Roadmap

## P2-04 — Upgrade modes and objectives

Current victory is essentially annihilation of buildings/builders.

Add objective types:

- Control points.
- Timed survival.
- Convoy escort/interception.
- Extraction.
- Attack/defend.
- Resource race.
- Boss phases.
- Score limit.
- Optional secondary objectives.

### Challenge target

Each general should have:

- A unique authored arena.
- Mission-specific build logic.
- Signature scripted phases.
- Objective changes.
- Briefing/debriefing.
- Persistent progression.
- A real finale.

---

## P2-05 — Improve audiovisual production

### Current strengths

- Coherent ligne-claire direction.
- Distinct faction palettes.
- Useful selection, queue, cooldown, alert, and superweapon feedback.
- Spatial panning and distance attenuation.

### Current weaknesses

- Mixed visual languages: DEFCON UI, emoji controls, faction HUD, procedural rigs, sprites, and CAD studio.
- Small gameplay silhouettes and typography.
- Procedural oscillator/noise audio lacks authored emotional impact.
- Music and effects do not consistently route through master/category buses.
- Developer tooling remains visible in player builds.

### Required implementation

- One product-wide visual token and icon system.
- Tactical-zoom silhouette standards.
- Authored impacts, weapons, ambience, UI sounds, voice, and adaptive music.
- Master/music/SFX/voice gain hierarchy.
- Ducking, priority, and voice/polyphony budgets.
- Hide Plan Simulator and audit controls unless a development flag is enabled.

---

## P2-06 — Prepare localization

- Externalize all player-facing strings.
- Add stable string IDs.
- Add pseudo-localization.
- Test 30–50% expansion.
- Define number/date/key-name formatting.
- Add font fallback.
- Plan right-to-left behavior.
- Keep text parity with important audio alerts.

Do not begin translation before pseudo-localization and layout expansion pass.

---

## P2-07 — Build replay before multiplayer

### Replay prerequisites

- Seeded deterministic simulation.
- Authoritative tick-stamped command queue.
- Stable state hashing.
- Versioned content/balance identifiers.
- Seeking via snapshots plus command replay.
- Desync diagnostics.

### Multiplayer may begin only after

- Replays reproduce long matches across cold runs.
- Mid-match snapshots continue identically.
- Invalid commands are rejected authoritatively.
- Hidden information and AI perception are team-scoped.

Potential later multiplayer scope:

- 1v1 lobby.
- Matchmaking.
- Reconnect.
- Spectator/observer.
- Desync reporting.
- Secure command validation.

---

## 10. Phased Delivery Plan

## Phase 0 — Stop-ship correction (Days 0–14)

- Decide legal/product identity.
- Remove “complete” release messaging.
- Fix game-speed multiplication.
- Add seeded gameplay RNG.
- Fix veterancy HP calculation.
- Fix capture ownership/progress.
- Add authoritative command validation.
- Complete active-effect save/load.
- Add regression tests for each issue.

### Exit gate

- No known P0 gameplay correctness defect remains.
- Every verified defect has a failing-before/passing-after regression.
- Product identity decision is documented.

---

## Phase 1 — Trustworthy private alpha (Days 15–30)

- Establish one source-to-app build.
- Correct platform target and architecture claims.
- Sign/notarize a private release candidate.
- Add real Chromium/WebKit/native smoke tests.
- Fix compact setup layout and modal focus.
- Make reduced motion and audio buses authoritative.
- Hide simulator/developer UI in release builds.
- Align README, PRD, QA docs, test counts, and map counts.

### Exit gate

- Clean-clone build produces a Gatekeeper-clean app.
- 30-minute real-player session has no frame-loop death or blocking UI defect.
- Documentation matches runtime behavior.

---

## Phase 2 — World-class foundation (Days 31–90)

- Extract deterministic command-driven simulation.
- Add state hashes and replay spike.
- Route all movement through navigation.
- Implement proper stealth/detection and AI perception.
- Build two real maps.
- Build interactive tutorial.
- Replace balance runner with seeded full matches.
- Add performance and one-hour soak harnesses.

### Exit gate

- 100,000-tick deterministic hash test passes.
- Mid-combat save/load continuation hash matches uninterrupted play.
- New players complete the tutorial successfully.
- Two maps produce distinct strategies and pass connectivity validation.

---

## Phase 3 — Content-quality alpha (Months 4–6)

- Modularize simulation/render/platform boundaries.
- Meet 400-unit performance budgets.
- Build three authored Challenge missions.
- Add objective framework.
- Commission initial original voice/music/SFX.
- Add rebinding, camera speed, cursor scale, colorblind presets, and full UI scaling.
- Run structured novice/intermediate/expert playtests.

### Exit gate

- Three missions feel materially different.
- Full-match balance telemetry is reproducible.
- Accessibility and performance gates pass.

---

## Phase 4 — Premium indie/early-access candidate (Months 7–12)

- Six to eight distinct competitive maps.
- Nine scripted Challenge missions and finale.
- Replay viewer and observer controls.
- Localization framework and initial languages.
- Authored audio/art consistency pass.
- Two closed betas.
- Multiplayer only if replay determinism remains stable.

### Exit gate

- Players can name favorite maps and generals based on play, not documentation.
- One-hour sessions remain stable across the hardware/resolution matrix.
- Product identity and distribution are legally cleared.
- Store/release messaging accurately describes included modes.

---

## 11. Recommended Four-Person Core Team

1. **Lead deterministic gameplay and AI engineer**
   - Simulation clock, RNG, commands, gameplay rules, AI perception, replay.

2. **Engine, performance, and macOS release engineer**
   - Architecture extraction, profiling, build pipeline, signing, native host, CI.

3. **Senior RTS mission and level designer**
   - Maps, tutorial, Challenge missions, objectives, pacing, playtests, balance.

4. **UX and accessibility designer-engineer**
   - Responsive setup/HUD, input, settings, accessibility, onboarding presentation.

Use specialist contractors for:

- IP/trademark legal review.
- Original music, voice, and sound design.
- Final production art and animation.
- Localization and accessibility testing.

---

## 12. Definition of “World-Class” for This Project

The project reaches the intended bar when:

- The first 15 minutes are understandable without external documentation.
- Commands behave consistently and cannot bypass rules.
- Movement and formations survive real map topology.
- The same seed and commands always reproduce the same game.
- Saves resume every active battle state exactly.
- AI acts from perceived information and makes understandable decisions.
- Maps create different strategies rather than different background colors.
- Balance claims come from complete reproducible matches and human evidence.
- UI is readable and operable across supported resolutions and accessibility needs.
- Audio, art, copy, and iconography feel like one product.
- The application is built once, signed, notarized, and verifiably matches source.
- Product identity and public distribution rights are explicit.

---

## 13. Main-Agent First Execution Batch (Completed 23 October 2026 ✅)

All 12 items in the First Execution Batch have been implemented and verified:

1. `[x]` Add regression proving 2× advances accurately (`tests/game_speed_verify.js`).
2. `[x]` Fix game-speed application (`engine.stepFixed(rawDt)` applies `this.gameSpeed` once on the accumulator; `engine.update(FIXED_STEP)` is invariant).
3. `[x]` Add regression for veterancy preserving general and upgrade modifiers (`tests/phase2_verify.js`).
4. `[x]` Fix derived-stat recomputation (`recomputeUnitDerivedStats` preserves general & tech upgrades across rank promotions).
5. `[x]` Add regression for cross-team capture progress (`tests/phase2_verify.js`).
6. `[x]` Fix capture reset/contest behavior (contested or switched-team capture resets/blocks progress cleanly).
7. `[x]` Add engine-level invalid-command tests (`tests/phase2_verify.js`).
8. `[x]` Implement authoritative faction/producer/builder/hero validation (`engine.issueCommand()` validates ownership, faction tech, producer building, builder capability, and hero uniqueness).
9. `[x]` Add mid-projectile and mid-power save/load tests (`tests/phase2_verify.js` & `tests/replay_hash_verify.js`).
10. `[x]` Serialize all gameplay-active save state (`.zhsave` v2 includes active `projectiles`, `bombers`, `paratroopers`, `pendingPowers`, `hazards`, `activeScans`, `commandQueue`, `commandLog`, and `rngState`).
11. `[x]` Introduce seeded simulation RNG and serialize its state (`js/rng.js` `SeededRNG` with separated `simRng` and `cosmeticRng`).
12. `[x]` Add deterministic state hashing (`engine.computeStateHash()` verified across 50 consecutive 600-tick runs in `tests/determinism_verify.js` and mid-match save/load in `tests/replay_hash_verify.js`).

### Next Execution Batch (Open Roadmap Items)

1. `[ ]` **Workstream 4 — Real Tactical Maps & Terrain**: Author multi-route map definitions (`MAPS`) with terrain obstacles, elevation/chokepoints, and neutral garrisons rasterized into `js/nav.js`.
2. `[ ]` **Workstream 3 — Fair Perceptive AI**: Add per-team fog-of-war perception blackboards (`aiMemory[team]`) so AI reacts to scouted intel rather than omniscient arrays.
3. `[ ]` **Workstream 6 — Responsive & Accessible UX**: Replace the multi-row setup modal with a compact step wizard, add responsive `clamp()` layout tokens, and full keyboard/modal focus management.
4. `[ ]` **Workstream 9 — IP / Naming Table & Public Packaging**: Centralize user-facing names into a single naming table and add universal binary signing/notarization rules when preparing for external distribution.

---

## 14. Evidence Index

Primary project evidence:

- `README.md`
- `PRD.md`
- `STUDIO_MASTER_PLAN.md`
- `OBLIGATION_LEDGER.md`
- `BUG_REPORT.md`
- `QA_PLAYBOOK.md`
- `BUILD.md`
- `index.html`
- `css/style.css`
- `macos_main.swift`
- `scripts/sync-app-resources.sh`
- `js/data.js`
- `js/engine.js`
- `js/ai.js`
- `js/nav.js`
- `js/spatial.js`
- `js/ui.js`
- `js/audio.js`
- `js/vfx.js`
- `js/simulator.js`
- `js/unit_models.js`
- `js/unit_studio.js`
- `tests/human_qa_runner.js`
- `tests/simulator_verify.js`
- `tests/phase2_verify.js`
- `tests/phase3_verify.js`
- `tests/phase4_verify.js`
- `tests/balance_matrix.js`

Key verified code areas:

- Double-applied game speed: `js/engine.js`, `stepFixed()` and `update()`.
- Save schema and omissions: `js/engine.js`, `serializeState()` and `deserializeState()`.
- Rule validation: `js/engine.js`, unlock/queue/build command paths.
- Veterancy recomputation: `js/engine.js`, XP/promotion path.
- Capture carryover: `js/engine.js`, `CAPTURE` state.
- Stealth acquisition: `js/engine.js`, target acquisition.
- AI omniscience: `js/ai.js`, cluster/counter/raid target scanners.
- Map definitions: `js/data.js`, `MAPS`.
- Shared map layout: `js/engine.js`, `setupMapResources()`.
- Path goal defect: `js/nav.js`, `findPath()`.
- Heuristic balance scoring: `tests/balance_matrix.js`.
- Mocked human QA environment: `tests/human_qa_runner.js`.
- Responsive breakpoints: `css/style.css`.
- Modal and keyboard behavior: `js/ui.js`.
- Native bundle setup: `macos_main.swift` and `C&C Generals Zero Hour.app`.

---

## Final Direction

The project should be positioned as an **alpha RTS platform with a strong mechanical core**, not a finished remake.

The highest-value product direction is:

> An original, instant-launch macOS RTS with asymmetric 20-minute warfare, deterministic replays, authored challenge missions, and a distinctive ligne-claire visual identity.

Correctness, authored play, and player trust will create more value than another wave of units or showcase models.
