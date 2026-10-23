# Clean-Room Build Specification: Command & Conquer: Generals – Zero Hour (macOS Edition)

## 1. System Architecture

This project is a clean-room macOS re-implementation of **Command & Conquer: Generals – Zero Hour** built from the `OBLIGATION_LEDGER.md` behavioral specification.

```
cnc-generals-zero-hour-mac/
├── OBLIGATION_LEDGER.md          # Reverse-engineered SAGE / Zero Hour behavioral ledger (SYS-01..SYS-32)
├── PRD.md                        # Product Requirements Document & architecture overview
├── BUILD.md                      # Clean-room architecture, native compilation & test instructions
├── play-mac.command              # Double-clickable macOS launcher script
├── scripts/
│   └── sync-app-resources.sh     # Syncs runtime HTML/CSS/JS/assets into C&C Generals Zero Hour.app
├── C&C Generals Zero Hour.app/   # Native macOS Cocoa (WKWebView) Application Bundle
│   └── Contents/
│       ├── Info.plist
│       ├── MacOS/
│       │   └── CnCGeneralsZeroHour  # Compiled native Apple Silicon (arm64) / macOS binary
│       └── Resources/            # Synced runtime web bundle (index.html, css/, js/, assets/)
├── index.html                    # Main entry point, HUD shell & 3D Unit Studio modal
├── unit-studio.html              # Direct standalone launcher for the 3D Unit Studio ([U])
├── usa-buildings-diorama.html    # Interactive 3D/2.5D structure diorama inspection viewer
├── usa-units-diorama.html        # Interactive 3D/2.5D unit diorama inspection viewer
├── assets/
│   ├── diorama/                  # High-DPI pre-baked isometric unit & structure diorama sprites
│   └── refs/                     # 4-panel orthographic CAD reference sheets (USA, China, GLA)
├── css/
│   └── style.css                 # Authentic Zero Hour tactical Command Bar, Radar, Studio & Modal UI
├── js/
│   ├── rng.js                    # Standalone seeded Mulberry32 PRNG & state serialization (ZH_RNG)
│   ├── data.js                   # INI-equivalent Faction, Sub-General, Unit, Building, Weapon & Power registry
│   ├── spatial.js                # O(1) SpatialHashGrid, 7 Locomotor classes & 3D Parabolic Ballistics
│   ├── nav.js                    # NavigationGrid A* Pathfinding, Spiral Fallback, Cliff Climber & Flow Fields
│   ├── unit_models.js            # 39/39 Unit & 38/38 Building procedural 3D/2.5D CAD models (ZH_UNIT_MODELS)
│   ├── vfx.js                    # Articulated multi-part rigs, persistent decals & Superweapon spectacle
│   ├── audio.js                  # Spatial WebAudio SFX synthesizer, dynamic music & EVA / General voice
│   ├── engine.js                 # Core 60Hz deterministic simulation loop, issueCommand() queue & renderer
│   ├── ai.js                     # Multi-squad tactical AI Commander, Threat Heatmap & 9 General doctrines
│   ├── simulator.js              # Autonomous PlanSimulator & headless match harness (5x warp auto-play)
│   ├── unit_studio.js            # Interactive 3D/2.5D Unit & Building Design Workbench ([U])
│   └── ui.js                     # Command card, Generals Powers modal, Save/Load (.zhsave) & input controller
└── tests/                        # 9 automated headless Node.js verification & QA suites
```

## 2. Core Simulation Modules

### 2.1 `js/rng.js` & `js/data.js` — Deterministic PRNG & Declarative INI Registry
- **`js/rng.js` (`ZH_RNG`):** Standalone Mulberry32 seeded PRNG (`next()`, `float(min, max)`, `int(min, max)`, `getState()`, `setState()`) ensuring zero `Math.random()` calls in simulation logic.
- **`js/data.js` (`ZH_DATA`):** Encodes the complete *Zero Hour* balance tables:
  - **3 Factions & 9 Sub-Generals:** Applies dynamic cost, HP, speed, damage, and unit-unlock modifiers based on the selected General.
  - **Buildings:** Command Center, Power plants (Cold Fusion Reactor, Nuclear Reactor), Supply Centers/Stashes, Barracks, War Factory/Arms Dealer, Airfield, Secondary Economy (Supply Drop Zone, Internet Center, Black Market), Tech Centers (Strategy Center, Propaganda Center, Palace), Defenses (Patriot/Laser/EMP Turret, Bunker, Gattling Cannon, Speaker Tower, Tunnel Network, Stinger Site), and Superweapons (Particle Cannon, Nuclear Missile Silo, Scud Storm).
  - **Units:** Dozers/Workers, Harvesters (Chinook, Supply Truck), Infantry (Ranger, Missile Defender, Pathfinder, Red Guard, Tank Hunter, Mini-Gunner, Hacker, Rebel, RPG Trooper, Terrorist, Angry Mob, Hijacker, Jarmen Kell), Vehicles (Humvee, Crusader, Laser Crusader, Paladin, Laser Tank, Tomahawk, Battlemaster, Gattling Tank, Dragon Tank, Overlord, Emperor Overlord, Assault Troop Crawler, Nuke Cannon, Technical, Combat Cycle, Scorpion Tank, Marauder Tank, Quad Cannon, Toxin Tractor, Rocket Buggy, Scud Launcher), and Aircraft (Comanche, Raptor, King Raptor, Combat Chinook, Aurora Bomber, Aurora Alpha, MiG, Tactical Nuke MiG).
  - **Generals Powers:** 3-tier unlock tree per faction costing Generals Points earned via combat XP.

### 2.2 `js/engine.js` & `js/unit_models.js` — SAGE Simulation & 3D/2.5D Tactical Renderer
- **Fixed-Timestep Lockstep Simulation:** Advances at an invariant `1/60s` (`dt = 1/60`) per tick across all `gameSpeed` multipliers (`1x`, `1.5x`, `2x`, `3x`), with validated command queuing (`issueCommand()`), replay export/execution (`exportReplay()`, `runReplay()`), and `.zhsave` serialization.
- **Map & Terrain Generator:** 2,600×2,600 to 3,200×3,200 tactical battlefields (*Tournament Desert*, *Final Crusade*, *Defcon 6*) with Supply Docks, Oil Derricks, Hospitals, Repair Bays, Civilian Bunkers, choke points, rivers/bridges, and starting bases.
- **Procedural 3D/2.5D CAD Models (`js/unit_models.js`, `js/unit_studio.js`):** 39/39 faction units and 38/38 structures rendered with articulated chassis, turrets, recoiling barrels, rotors, and high-DPI diorama sprites, inspectable live in the **3D Unit Studio (`[U]`)**.
- **GLA Salvage & Tunnel Network:** Destroyed vehicles spawn collectible Salvage Crates that upgrade GLA vehicles through 2 salvage tiers; GLA Tunnel Networks share a global garrison array enabling instant map-wide subterranean transit.
- **USA Point-Defense Laser & China Horde/Propaganda:** Paladin/Laser/Avenger units intercept incoming missiles with visible laser beams; grouped Chinese units gain the glowing Horde ROF buff and heal near Speaker Towers / Overlords.

### 2.3 `js/ai.js` — Generals' Challenge & Skirmish AI Commander
- Autonomous base expansion (builds power, supply, barracks, war factory, tech center, base defenses, and superweapon).
- Adaptive wave composition tailored to the active opposing General's doctrine and behavioral difficulty (`CADET`, `COMMANDER`, `GENERAL`).
- Uses Generals Powers and Superweapons on cooldown (respecting early-game grace timers and fog-of-war scouting) and broadcasts iconic *Zero Hour* General taunts.

## 3. Building & Running on macOS

1. **Native macOS App:** Double-click `C&C Generals Zero Hour.app` inside Finder, or run:
   ```bash
   open "C&C Generals Zero Hour.app"
   ```
2. **Launcher Script:** Double-click `play-mac.command` or run `./play-mac.command`.
3. **Browser Mode & Developer Toolbar (`?dev=1`):** Open `index.html` directly in Safari, Chrome, or Arc. Append `?dev=1` (`index.html?dev=1`) to reveal the developer `⚡ SIM` (PlanSimulator 5x auto-play) and `🎨 STUDIO` (3D Unit Studio) buttons in the top HUD bar.
4. **Compile Native macOS Wrapper (`macos_main.swift`):**
   ```bash
   # Native Apple Silicon (arm64) build:
   swiftc macos_main.swift -o "C&C Generals Zero Hour.app/Contents/MacOS/CnCGeneralsZeroHour" -framework Cocoa -framework WebKit

   # Optional Universal (arm64 + x86_64) build:
   swiftc -target arm64-apple-macos12.0 macos_main.swift -o /tmp/zh_arm64 -framework Cocoa -framework WebKit && \
   swiftc -target x86_64-apple-macos12.0 macos_main.swift -o /tmp/zh_x86_64 -framework Cocoa -framework WebKit && \
   lipo -create -output "C&C Generals Zero Hour.app/Contents/MacOS/CnCGeneralsZeroHour" /tmp/zh_arm64 /tmp/zh_x86_64
   ```
5. **Sync App Bundle Resources:** Run `bash scripts/sync-app-resources.sh` after modifying any HTML, CSS, JS, or asset files to sync all runtime resources into `C&C Generals Zero Hour.app/Contents/Resources/` and strip non-runtime files.
6. **Automated Verification Suites:**
   ```bash
   node tests/human_qa_runner.js      # 13 Playbooks, 154 actions, 87/87 PASS
   node tests/replay_hash_verify.js   # Seeded determinism, Challenge 2.0 & p95 step <= 8ms, 7/7 PASS
   node tests/game_speed_verify.js    # Fixed-timestep gameSpeed invariance (1x, 1.5x, 2x, 3x)
   node tests/determinism_verify.js   # Seeded PRNG, issueCommand(), exportReplay/runReplay & .zhsave determinism
   node tests/perf_budget.js          # 1,000-unit performance budget (avg <= 6.0ms, p99 <= 12.0ms) & A* fallback
   node tests/phase2_verify.js        # Phase 2 Engine & AI Doctrines (20/20 PASS)
   node tests/phase3_verify.js        # Phase 3 UX, VFX & Spatial Audio (26/26 PASS)
   node tests/phase4_verify.js        # Phase 4 Save/Load, 3D CAD Coverage & 81-Slice Matrix (39/39 PASS)
   node tests/balance_matrix.js       # 81-match (9x9) AI balance matrix + full-match victory check
   ```
