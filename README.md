# Command & Conquer: Generals – Zero Hour (macOS Clean-Room Edition v2.0)

A zero-dependency, native macOS (`.app`) and HTML5 Canvas/WebAudio clean-room recreation of **Command & Conquer: Generals – Zero Hour** (2003), engineered from first principles against the open-sourced SAGE (`GeneralsMD`) architectural specification.

---

## Key Features

- **3 Asymmetric Factions & All 9 Zero Hour Sub-Generals**:
  - **USA**: Standard USA, **Gen. Granger** (Air Force), **Gen. Townes** (Laser), **Gen. Alexander** (Superweapon).
  - **China**: Standard China, **Gen. Kwai** (Tank), **Gen. Shin Fai** (Infantry), **Gen. Tsing Shi Tao** (Nuclear).
  - **GLA**: Standard GLA, **Dr. Thrax** (Toxin), **Gen. Juhziz** (Demolition), **Prince Kassad** (Stealth).
- **2 Game Modes & 4 Tactical Maps**:
  - **Generals' Challenge**: Multi-stage boss gauntlet with live General portrait taunts and signature doctrines.
  - **Custom Skirmish**: Any-vs-Any General matchups across *Desert Storm (2,800×2,800)*, *Tournament Desert (2,600×2,600)*, *Final Crusade (3,000×3,000)*, and *Twin Rivers (3,000×3,000)*.
- **Authentic Zero Hour Mechanics**:
  - Free-placement Dozer & Worker construction with 4-stage scaffolding and doorway spawn clearance.
  - Dual-tier economy (Supply Docks + Supply Drop Zones / Hackers / Black Markets) & Power Grid brownouts (`GLA` requires zero power).
  - Neutral Tech Buildings (**Oil Derrick**, **Hospital**, **Repair Bay**) & **Civilian Garrison Bunkers** (6-infantry capacity, cleared by Flame/Toxin/Flashbang, evacuable via `[E]`).
  - GLA **Salvage Crates** (`Base -> Tier 1 -> Tier 2` vehicle weapon upgrades) & global subterranean **Tunnel Networks**.
  - USA **Point-Defense Lasers (PDL)**, China **Nationalism ("Horde")** & **Speaker Tower** propaganda auras.
  - 5-Star **Generals' Secret Powers** modal (`[P]`) & global **Superweapons** (*Particle Cannon*, *Nuclear Missile*, *Scud Storm*).
- **Complete RTS Controls & Save/Load Persistence**:
  - Drag-box selection with automatic combat-unit priority filtering, double-click type selection, and **Control Groups `0–9`** (`Ctrl+0..9`, double-tap camera centering) for both units and production buildings.
  - Tactical stances: `[A]` Attack-Move, `[G]` Guard (220px leash), `[S]` Stop, `[X]` Scatter, `Ctrl+RightClick` Force-Fire, `Shift+RightClick` Chained Waypoints, `[F]` Unit Micro-Ability, `Spacebar` Jump-to-Alert.
  - Deterministic **Quick Save `[F5]`**, **Quick Load `[F9]`**, and **`.zhsave` JSON Export/Import**.

---

## Quick Start (macOS)

1. **Double-Click Native App**: Open **`C&C Generals Zero Hour.app`** (or double-click **`play-mac.command`**).
2. **Browser Mode**: Open `index.html` directly in Safari, Chrome, or Firefox, or serve locally via `python3 -m http.server 8080`.

---

## Documentation & Specifications

- [**Product Requirements Document (`PRD.md`)**](PRD.md) — Complete product scope, faction matrix, gameplay systems (`SYS-01`–`SYS-30`), and QA gates.
- [**Studio Master Plan (`STUDIO_MASTER_PLAN.md`)**](STUDIO_MASTER_PLAN.md) — Multi-agent studio architecture and Phase 1–4 execution record.
- [**Reverse-Engineering Obligation Ledger (`OBLIGATION_LEDGER.md`)**](OBLIGATION_LEDGER.md) — Evidence-gated SAGE (`GeneralsMD`) subsystem trace (`SYS-01`–`SYS-30`).
- [**Human-User QA Playbook (`QA_PLAYBOOK.md`)**](QA_PLAYBOOK.md) — 4-Tier RTS testing pyramid and 9 synthetic human UI playbooks.
- [**QA Bug Report & Verification Log (`BUG_REPORT.md`)**](BUG_REPORT.md) — Complete log of all 13 discovered & resolved engine and human-UI bugs (`BUG-01..06`, `BUG-HUMAN-01..07`).
- [**macOS Build & Launch Guide (`BUILD.md`)**](BUILD.md) — Native Swift/WebKit `.app` compilation and controls reference.

---

## Running the Automated Verification Suites

```bash
# 1. Human-User UI Playbook Runner (9 Playbooks, 123 synthetic DOM/Canvas/Keyboard actions, 61/61 PASS)
node tests/human_qa_runner.js

# 2. Plan Simulator & Bug Regression Suite (17/17 PASS)
node tests/simulator_verify.js

# 3. Phase 2 Engine & AI Doctrines Suite (6/6 PASS)
node tests/phase2_verify.js

# 4. Phase 3 UX, VFX & Spatial Audio Suite (26/26 PASS)
node tests/phase3_verify.js

# 5. Phase 4 Save/Load, Tactical AI & 81-Matchup (9x9) Balance Suite (29/29 PASS)
node tests/phase4_verify.js
```
