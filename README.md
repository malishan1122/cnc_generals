# Command & Conquer: Generals – Zero Hour (macOS Clean-Room Edition v2.0)

A zero-dependency, native macOS (`.app`) and HTML5 Canvas/WebAudio clean-room recreation of **Command & Conquer: Generals – Zero Hour** (2003), engineered from first principles against the open-sourced SAGE (`GeneralsMD`) architectural specification.

---

## Key Features

- **3 Asymmetric Factions & All 9 Zero Hour Sub-Generals**:
  - **USA**: Standard USA, **Gen. Granger** (Air Force), **Gen. Townes** (Laser), **Gen. Alexander** (Superweapon).
  - **China**: Standard China, **Gen. Kwai** (Tank), **Gen. Shin Fai** (Infantry), **Gen. Tsing Shi Tao** (Nuclear).
  - **GLA**: Standard GLA, **Dr. Thrax** (Toxin), **Gen. Juhziz** (Demolition), **Prince Kassad** (Stealth).
- **2 Game Modes & 3 Tactical Maps**:
  - **Single-player skirmish and challenge gauntlet.** Campaign, full replay viewer, and multiplayer are not in this build.
  - **Generals' Challenge**: 9-stage commander gauntlet with authored forward outposts, 75-second commander-specific scripted twists, live General portrait taunts, and signature doctrines.
  - **Custom Skirmish**: Any-vs-Any General matchups across **3 maps: *Tournament Desert* (2,600×2,600), *Final Crusade* (3,000×3,000), and *Defcon 6* (3,200×3,200)**, with behavioral difficulty tiers (`CADET [AI $8.5K]`, `COMMANDER [AI $10.5K]`, `GENERAL [AI $14.0K]`).
- **Authentic Zero Hour Mechanics**:
  - Free-placement Dozer & Worker construction with 4-stage scaffolding and doorway spawn clearance.
  - Dual-tier economy (Supply Docks + Supply Drop Zones / Hackers / Black Markets) & Power Grid brownouts (`GLA` requires zero power).
  - Neutral Tech Buildings (**Oil Derrick**, **Hospital**, **Repair Bay**) & **Civilian Garrison Bunkers** (6-infantry capacity, cleared by Flame/Toxin/Flashbang, evacuable via `[E]`).
  - GLA **Salvage Crates** (`Base -> Tier 1 -> Tier 2` vehicle weapon upgrades) & global subterranean **Tunnel Networks**.
  - USA **Point-Defense Lasers (PDL)**, China **Nationalism ("Horde")** & **Speaker Tower** propaganda auras, plus high-contrast China tactical silhouette rings at battle zoom.
  - 5-Star **Generals' Secret Powers** modal (`[P]`) & global **Superweapons** (*Particle Cannon*, *Nuclear Missile*, *Scud Storm*).
- **Complete RTS Controls, 3D Unit Studio, Seeded Determinism & Save/Load Persistence**:
  - Drag-box selection with automatic combat-unit priority filtering, double-click type selection, live armor-counter hover readouts, and **Control Groups `0–9`** (`Ctrl+0..9`, double-tap camera centering) for both units and production buildings.
  - Tactical stances: `[A]` Attack-Move, `[G]` Guard (220px leash), `[S]` Stop, `[X]` Scatter, `Ctrl+RightClick` Force-Fire, `Shift+RightClick` Chained Waypoints, `[F]` Unit Micro-Ability, `Spacebar` Jump-to-Alert.
  - **Interactive 3D/2.5D Unit & Building Studio (`[U]`)**: Built-in parametric CAD modeler (`js/unit_models.js`, `js/unit_studio.js`) with 39/39 faction units & 38/38 structures, turntable inspection, weapon test-fire, and standalone diorama inspection sheets (`unit-studio.html`, `usa-buildings-diorama.html`, `usa-units-diorama.html`).
  - Seeded simulation PRNG (`js/rng.js`, Mulberry32), deterministic fixed-timestep `gameSpeed` accumulator (`1x`, `1.5x`, `2x`, `3x`), validated command queue (`issueCommand()`, `exportReplay()`, `runReplay()`), FNV-1a state hashing (`computeStateHash()`), **Quick Save `[F5]`**, **Quick Load `[F9]`**, and **`.zhsave` JSON Export/Import**.

---

## Quick Start (macOS)

1. **Double-Click Native App**: Open **`C&C Generals Zero Hour.app`** (or double-click **`play-mac.command`**).
2. **Browser Mode**: Open `index.html` directly in Safari, Chrome, or Firefox, or serve locally via `python3 -m http.server 8080`. Append `?dev=1` (e.g., `index.html?dev=1`) to expose the developer toolbar buttons (`⚡ SIM` and `🎨 STUDIO`) in the top tactical bar.
3. **Sync App Bundle**: Run `bash scripts/sync-app-resources.sh` after editing `index.html`, `css/`, `js/`, or `assets/` to sync all runtime resources into `C&C Generals Zero Hour.app/Contents/Resources/`.

---

## Documentation & Specifications

- [**Product Requirements Document (`PRD.md`)**](PRD.md) — Product scope, module inventory, faction matrix, gameplay systems (`SYS-01`–`SYS-32`), and QA gates.
- [**Studio Master Plan (`STUDIO_MASTER_PLAN.md`)**](STUDIO_MASTER_PLAN.md) — Multi-agent studio architecture and execution record.
- [**Reverse-Engineering Obligation Ledger (`OBLIGATION_LEDGER.md`)**](OBLIGATION_LEDGER.md) — Evidence-gated SAGE (`GeneralsMD`) subsystem trace (`SYS-01`–`SYS-32`).
- [**Human-User QA Playbook (`QA_PLAYBOOK.md`)**](QA_PLAYBOOK.md) — 4-Tier RTS testing pyramid and 13 synthetic human UI playbooks.
- [**QA Bug Report & Verification Log (`BUG_REPORT.md`)**](BUG_REPORT.md) — Root-cause post-mortem and verification log (`87/87 PASS` across Playbooks 1–13).
- [**3D Unit & Building Studio Handoff (`UNIT_STUDIO_HANDOFF.md`)**](UNIT_STUDIO_HANDOFF.md) — Parametric 3D/2.5D CAD model registry (`js/unit_models.js`), diorama sprites, and workbench architecture.
- [**World-Class Game Audit & Roadmap (`WORLD_CLASS_GAME_AUDIT_AND_ROADMAP.md`)**](WORLD_CLASS_GAME_AUDIT_AND_ROADMAP.md) — Engineering audit, P0–P3 implementation tickets, and completion status.
- [**macOS Build & Launch Guide (`BUILD.md`)**](BUILD.md) — Native Swift/WebKit `.app` compilation, resource sync script, and controls reference.

---

## Running the Automated Verification Suites

```bash
# 1. Human-User UI Playbook Runner (13 Playbooks, 154 synthetic DOM/Canvas/Keyboard actions, 87/87 PASS)
node tests/human_qa_runner.js

# 2. Deterministic Seed, Command-Log Replay Hash, Challenge 2.0 & 80-Unit Step Benchmark (7/7 PASS)
node tests/replay_hash_verify.js

# 3. Fixed-Timestep GameSpeed Invariance (1x, 1.5x, 2x, 3x identical state hashes)
node tests/game_speed_verify.js

# 4. Seeded PRNG, Validated issueCommand(), Replay Export/Run & Mid-Match .zhsave Determinism
node tests/determinism_verify.js

# 5. 1,000-Unit Performance Budget (avg <= 6.0ms, p99 <= 12.0ms) & Blocked-Goal A* Fallback
node tests/perf_budget.js

# 6. Phase 2 Engine & AI Doctrines Suite (20/20 PASS)
node tests/phase2_verify.js

# 7. Phase 3 UX, VFX & Spatial Audio Suite (26/26 PASS)
node tests/phase3_verify.js

# 8. Phase 4 Save/Load, 3D Model Coverage (39/39 Units, 38/38 Buildings) & 81-Slice Matrix (39/39 PASS)
node tests/phase4_verify.js

# 9. Standalone 9x9 Sub-General AI Matchup Matrix & Full-Match Victory Check (81/81 Matchups)
node tests/balance_matrix.js
```

---

## Legal & Trademark Notice

This repository is an educational, clean-room engineering study featuring 100% original procedural code, geometry, and synthesized audio. **Clean-room code does not clear trademark rights:** *Command & Conquer* and *Generals – Zero Hour* are trademarks of Electronic Arts Inc. This project is not affiliated with or endorsed by Electronic Arts Inc., and may not be distributed commercially or published to any app store without an explicit trademark license or complete rebranding under an original IP.
