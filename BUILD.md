# Clean-Room Build Specification: Command & Conquer: Generals – Zero Hour (macOS Edition)

## 1. System Architecture

This project is a clean-room macOS re-implementation of **Command & Conquer: Generals – Zero Hour** built from the `OBLIGATION_LEDGER.md` behavioral specification.

```
cnc-generals-zero-hour-mac/
├── OBLIGATION_LEDGER.md          # Reverse-engineered SAGE / Zero Hour behavioral ledger
├── BUILD.md                      # Clean-room architecture & build instructions
├── play-mac.command              # Double-clickable macOS launcher script
├── C&C Generals Zero Hour.app/   # Native macOS Cocoa (WKWebView) Application Bundle
│   └── Contents/
│       ├── Info.plist
│       ├── MacOS/
│       │   └── CnCGeneralsZeroHour  # Compiled native Apple Silicon / macOS binary
│       └── Resources/
├── index.html                    # Main entry point & HUD shell
├── css/
│   └── style.css                 # Authentic Zero Hour tactical Command Bar, Radar & Generals Modal UI
└── js/
    ├── data.js                   # INI-equivalent Faction, Sub-General, Unit, Building, Weapon & Power registry
    ├── spatial.js                # O(k) SpatialHashGrid, 7 Locomotor classes & 3D Parabolic Ballistics
    ├── nav.js                    # NavigationGrid A* Pathfinding, Cliff Climber & Flow Fields
    ├── vfx.js                    # Articulated multi-part sprites, persistent decals & Superweapon spectacle
    ├── audio.js                  # Spatial WebAudio SFX synthesizer, dynamic music & EVA / General voice
    ├── engine.js                 # Core 60FPS RTS simulation loop, pathfinding, combat, economy & 2.5D renderer
    ├── ai.js                     # Multi-squad tactical AI Commander, Threat Heatmap & 9 General doctrines
    ├── simulator.js              # Autonomous PlanSimulator & headless match harness
    └── ui.js                     # Command card, Generals Powers modal, Save/Load (.zhsave) & input controller
```

## 2. Core Simulation Modules

### 2.1 `js/data.js` — Declarative INI Registry
Encodes the complete *Zero Hour* balance tables:
- **3 Factions & 9 Sub-Generals:** Applies dynamic cost, HP, speed, damage, and unit-unlock modifiers based on the selected General.
- **Buildings:** Command Center, Power plants (Cold Fusion Reactor, Nuclear Reactor), Supply Centers/Stashes, Barracks/Hand of Nod, War Factory/Arms Dealer, Secondary Economy (Supply Drop Zone, Internet Center, Black Market), Tech Centers (Strategy Center, Propaganda Center, Palace), Defenses (Patriot/Laser/EMP Turret, Bunker, Gattling Cannon, Speaker Tower, Tunnel Network, Stinger Site), and Superweapons (Particle Cannon, Nuclear Missile Silo, Scud Storm).
- **Units:** Dozers/Workers, Harvesters (Chinook, Supply Truck), Infantry (Ranger, Missile Defender, Pathfinder, Red Guard, Tank Hunter, Hacker, Rebel, RPG Trooper, Terrorist, Angry Mob, Jarmen Kell), Vehicles (Humvee, Crusader, Paladin, Laser Tank, Tomahawk, Battlemaster, Gattling Tank, Dragon Tank, Overlord, Nuke Cannon, Technical, Scorpion Tank, Quad Cannon, Toxin Tractor, Scud Launcher), and Aircraft (Comanche, Aurora/Raptor).
- **Generals Powers:** 3-tier unlock tree per faction costing Generals Points earned via combat XP.

### 2.2 `js/engine.js` — SAGE Simulation & 2.5D Tactical Renderer
- **Map & Terrain Generator:** 3200×3200 tactical battlefields (*Tournament Desert*, *Final Crusade*, *Defcon 6*) with Supply Docks, Oil Derricks, choke points, rivers/bridges, and starting bases.
- **Physical Construction & Harvesting:** Dozers and Workers travel to build footprints and construct buildings with visual scaffolding; Chinooks, Supply Trucks, and Workers harvest from Supply Docks and return cash to the nearest Supply Center/Stash.
- **GLA Salvage & Tunnel Network:** Destroyed vehicles spawn collectible Salvage Crates that upgrade GLA vehicles through 2 salvage tiers; GLA Tunnel Networks share a global garrison array enabling instant map-wide subterranean transit.
- **USA Point-Defense Laser & China Horde/Propaganda:** Paladin/Laser tanks intercept incoming missiles with visible red laser beams; grouped Chinese units gain the glowing Horde ROF buff and heal near Speaker Towers / Overlords.
- **Superweapons & Generals Powers:** Particle Cannon orbital beam that sweeps across enemy bases, Nuclear Missile Silo ICBM with mushroom cloud + radiation fallout, Scud Storm multi-warhead anthrax barrage, A-10 airstrikes, Artillery barrages, EMP pulses, Cash Hack, and Rebel Ambush.

### 2.3 `js/ai.js` — Generals' Challenge AI Commander
- Autonomous base expansion (builds power, supply, barracks, war factory, tech center, base defenses, and superweapon).
- Adaptive wave composition tailored to the active opposing General's doctrine (e.g., Granger spams Comanches/Raptors, Kwai leads with Overlord + Battlemaster columns, Dr. Thrax deploys Toxin Tractors & Scud Launchers).
- Uses Generals Powers and Superweapons on cooldown and broadcasts iconic *Zero Hour* General taunts.

## 3. Running on macOS

1. **Native macOS App:** Double-click `C&C Generals Zero Hour.app` inside Finder, or run:
   ```bash
   open "C&C Generals Zero Hour.app"
   ```
2. **Launcher Script:** Double-click `play-mac.command` or run `./play-mac.command`.
3. **Browser Mode:** Open `index.html` directly in Safari, Chrome, or Arc.
4. **Sync App Bundle Resources:** Run `./scripts/sync-app-resources.sh` to copy `index.html`, `css/`, and `js/` into `C&C Generals Zero Hour.app/Contents/Resources/`.
