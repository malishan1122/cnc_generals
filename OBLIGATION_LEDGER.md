# Reverse Engineering Obligation Ledger: Command & Conquer: Generals – Zero Hour (SAGE Engine)

**Target Specification:** *Command & Conquer: Generals – Zero Hour* (2003, EA Pacific / Electronic Arts; SAGE Engine `GeneralsMD`, open-sourced under GPLv3 at `electronicarts/CnC_Generals_Zero_Hour`)
**Target Platform:** macOS (Apple Silicon / Intel Native `.app` + HTML5 Canvas/WebAudio Clean-Room Runtime)
**Methodology:** `leanrea` / `rea` Evidence-Gated Clean-Room Reverse Engineering (`SEEN`, `INFERRED`, `UNKNOWN`)

---

## 1. Engine & Subsystem Inventory (`GeneralsMD` / SAGE Architecture)

| ID | Subsystem | Classification | Evidence Source | Clean-Room Implementation Obligation |
| :--- | :--- | :--- | :--- | :--- |
| **SYS-01** | **INI-Driven Object & Weapon Registry** | **SEEN** | `Data/INI/Object/*.ini`, `Data/INI/Weapon.ini` | Declarative data registry (`js/data.js`) defining every unit, building, upgrade, weapon, armor damage scalar, and Generals Power across USA, China, and GLA. |
| **SYS-02** | **Asymmetric 3-Faction + 9 Sub-General Matrix** | **SEEN** | Wikipedia *Zero Hour* spec; `PlayerTemplate.ini` | Playable **USA** (Granger, Townes, Alexander), **China** (Kwai, Shin Fai, Tsing Shi Tao), and **GLA** (Dr. Thrax, Juhziz, Kassad) with sub-general cost/stat modifiers and unique units. |
| **SYS-03** | **Free-Placement Dozer & Worker Construction** | **SEEN** | `DozerAIUpdate.cpp`, Wikipedia *Generals* mechanics | Unlike classic C&C sidebar construction, USA/China **Construction Dozers** and GLA **Workers** physically pathfind to arbitrary build footprints and construct structures over time (`0% -> 100%`). |
| **SYS-04** | **Dual-Tier Economy (Supply Docks + Infinite Late-Game)** | **SEEN** | `ChinookAIUpdate`, `SupplyTruckAIUpdate`, `SlavedUpdate` | Primary finite **Supply Docks** harvested by USA Chinooks ($600/trip), China Supply Trucks ($300/trip), and GLA Workers ($150/trip), transitioning to infinite secondary income (**Supply Drop Zone**, **Internet Center / Hackers**, **Black Market**). |
| **SYS-05** | **Power Grid & Brownout Penalties** | **SEEN** | `Energy.cpp`, `Player.cpp` | USA (Cold Fusion Reactor + Control Rods) and China (Nuclear Reactor + Overcharge) require `powerProduced >= powerConsumed`. Low power disables radar & base defenses and halves production speed (`0.5x`). **GLA requires zero power (`usesPower: false`)**. |
| **SYS-06** | **GLA Salvage Crate Upgrade Progression** | **SEEN** | `SalvageCrateCollide.cpp`, `WeaponSetUpdate` | Destroyed enemy vehicles drop **Salvage Crates**. When collected by GLA vehicles (Technical, Scorpion, Marauder, Quad Cannon, Toxin Tractor), it upgrades their weapon tier (**Base -> Salvage Tier 1 -> Salvage Tier 2**) or grants $150 cash to non-upgradable units. |
| **SYS-07** | **GLA Tunnel Network Subterranean Transit** | **SEEN** | `TunnelContain.cpp` | All GLA **Tunnel Networks** share a global subterranean garrison pool (`max 10 units`). Entering any tunnel heals units to full HP and allows instant deployment from *any* other owned Tunnel Network on the map. |
| **SYS-08** | **USA Point-Defense Laser (PDL) Interception** | **SEEN** | `LaserUpdate.cpp`, `PointDefenseLaserUpdate` | USA **Paladin Tank**, **Avenger**, and **Laser Tank** mount an autonomous point-defense laser that zaps incoming ballistic missiles/rockets out of the air on a cooldown. |
| **SYS-09** | **China Nationalism ("Horde" Bonus) & Propaganda Aura** | **SEEN** | `HordeUpdate.cpp`, `PassiveAreaEffectBehavior` | Groups of 5+ China Red Guards, Tank Hunters, Battlemasters, or Gattling Tanks receive a **+25% rate-of-fire Horde bonus** (glowing red star). **Speaker Towers** and **Overlord Speaker Towers** project a passive healing + ROF aura. |
| **SYS-10** | **Veterancy Chevrons (Regular -> Veteran -> Elite -> Heroic)** | **SEEN** | `ExperienceTracker.cpp` | Combat units earn XP on kills, advancing through 4 ranks (`0` to `3` chevrons) granting `+20%/+40%/+70%` damage, `+15%/+30%/+50%` HP, faster ROF, and passive self-healing at Elite/Heroic. |
| **SYS-11** | **Generals Experience, 5-Star Rank & Generals Powers Tree** | **SEEN** | `Science.ini`, `SpecialPower.ini` | Combat XP fills the **General's Rank Bar** (Rank 1 -> Rank 5), granting **Generals Points** to unlock and cast active tactical powers (e.g., *Spy Drone*, *A-10 Strike*, *Spectre Gunship*, *Fuel Air Bomb*, *Artillery Barrage*, *Cash Hack*, *Carpet Bomb*, *EMP Pulse*, *Rebel Ambush*, *GPS Scrambler*, *Anthrax Bomb*). |
| **SYS-12** | **Global Superweapons & Live HUD Countdown Timers** | **SEEN** | `OCLSpecialPower.cpp`, `SpecialPowerTimer` | Constructing a **Particle Cannon** (USA), **Nuclear Missile Silo** (China), or **Scud Storm** (GLA) reveals the structure and starts a global HUD countdown timer for all players before unleashing catastrophic area-of-effect destruction. |
| **SYS-13** | **Generals' Challenge Mode & Live General Taunts** | **SEEN** | `ChallengeGenerals.ini`, Wikipedia *Zero Hour* | Boss gauntlet pitting the player against specialized Zero Hour Generals (Granger, Townes, Alexander, Kwai, Shin Fai, Tao, Thrax, Juhziz, Kassad) who build thematic armies, cast Generals Powers, and deliver contextual voice/text taunts. |
| **SYS-14** | **Fixed-Timestep 60Hz Loop, SpatialHashGrid & Locomotor Physics** | **SEEN** | `GameLogic.cpp`, `PartitionManager.cpp`, `Locomotor.cpp` | Deterministic `1/60s` (`16.67ms`) simulation accumulator coupled with a 128px `SpatialHashGrid` (`js/spatial.js`) and 7 distinct SAGE Locomotor classes (`INFANTRY`, `CLIFF_CLIMBER`, `WHEELED`, `TRACKED`, `HOVER`, `HELICOPTER`, `AIRCRAFT`) with turn-rate inertia, banking, and boid separation. |
| **SYS-15** | **8-Way A* NavigationGrid & BFS Flow Fields** | **SEEN** | `AIPathfind.cpp` | `NavigationGrid` (`js/nav.js`, 48px cell size) with building footprint & terrain obstacle rasterization, string-pulled 8-way A* pathfinding, cliff-climber/aircraft passability, and cached BFS Flow Fields. |
| **SYS-16** | **3D Ballistic Projectile Arcs, EMP Disable & Garrison Clearing** | **SEEN** | ` BezierProjectileBehavior.cpp`, `EMPUpdate.cpp`, `GarrisonContain.cpp` | `BallisticsEngine` (`js/spatial.js`) computing 3D parabolic heights $z(t) = 4 h_{\text{peak}} t(1-t)$, ground shadows, EMP vehicle/building disable timers, and instant garrison clearing via `FLAME_TOXIN` or `FLASHBANG` weapons. |
| **SYS-17** | **Neutral Tech Structures & Civilian Structure Garrisoning** | **SEEN** | `TechBuildingBehavior.cpp`, `GarrisonContain.cpp` | Capturable neutral **Tech Oil Derricks** (+$1,000 bonus + $35/2s drip), **Tech Hospitals** (+6 HP/s global infantry heal), **Tech Repair Bays** (+8 HP/s global vehicle repair), and **Civilian Garrison Bunkers** (hold up to 6 infantry firing from ports with +40% armor & +25% range; cleared by Flame/Toxin/Flashbang). |
| **SYS-18** | **9 Sub-General Exclusive Units & Active Micro-Abilities (`[F]`)** | **SEEN** | `GeneralsMD/Data/INI/Object/*.ini`, `PilotExitContain` | Exclusive units (`USA_KING_RAPTOR`, `USA_COMBAT_CHINOOK`, `USA_AURORA_ALPHA`, `USA_LASER_CRUSADER`, `CHINA_EMPEROR_OVERLORD`, `CHINA_MINIGUNNER`, `CHINA_ASSAULT_CRAWLER`, `CHINA_NUKE_MIG`, `GLA_COMBAT_CYCLE`, `GLA_HIJACKER`) and `[F]` abilities (`FLASHBANG`, `LASER_LOCK`, `FLAME_WALL`, `OVERLORD_SPEAKER`, `PILOT_SNIPE` turning enemy vehicles neutral/unmanned for re-crewing, and `HIJACK_VEHICLE`). |
| **SYS-19** | **Control Groups (`0–9`), Tactical Stances (`A`/`G`/`S`/`X`), Force-Fire & Waypoints** | **SEEN** | `CommandMap.ini`, `AIGuard.cpp`, `InGameUI.cpp` | `Ctrl+[0-9]` group binding, single-tap selection, double-tap camera centering, overhead `[#N]` group badges, `A` Attack-Move, `G` Guard (220px area leash returning to anchor `(guardX, guardY)`), `S` Stop, `X` Scatter, `Ctrl+RightClick` Force-Fire ground/entity attack, and `Shift+RightClick` chained waypoints rendered on canvas. |
| **SYS-20** | **Faction-Skinned HUD, Cameo Queue Badges/Refunds, Rally Lines & Radar Event Jump** | **SEEN** | `ControlBar.cpp`, `Radar.cpp`, `ProductionUpdate.cpp` | Faction HUD themes (`hud-theme-usa`, `hud-theme-china`, `hud-theme-gla`), Cameo queue count badges (`xN`) + progress sweeps, right-click Cameo cancellation with 100% credit refund (`cancelProduction`), animated dashed factory rally lines, under-attack radar pings, and `Spacebar` jump-to-last-radar-alert (`jumpToLastAlert`). |
| **SYS-21** | **Articulated Multi-Part 2.5D Unit Rigs, 4-Stage Scaffolding & Damage Plumes** | **SEEN** | `W3DModelDraw.cpp`, `W3DTankDraw.cpp`, `StructureToppleUpdate` | Decoupled `Chassis` (`u.angle`), `Turret` (`u.turretAngle`), and `Recoiling Barrels` (`u.recoilOffset` + dual-barrel alternating recoil on `Overlord`/`Emperor`/`Marauder`/`Quad`/`Gattling`), spinning rotor discs, 4-stage construction scaffolding (`0–33%`, `33–66%`, `66–99%`, `100%`), and hull/structure smoke & fire plumes below 50%/25% HP (`js/vfx.js`). |
| **SYS-22** | **Persistent Battlefield Decal Layer & Multi-Stage Superweapon Spectacle** | **SEEN** | `TerrainVisual.cpp`, `Scorch.ini`, `FXList.ini` | Persistent ground decals (`engine.decals`: blast craters, Particle Cannon scorch trails, tank tread ribbons) and multi-stage Superweapon VFX (`engine.shockwaves`, `engine.mushroomClouds`, `engine.screenFlash` thermal whiteout) in `js/vfx.js`. |
| **SYS-23** | **2.5D Spatial WebAudio Panning, Dynamic Faction Music & Radio EVA** | **SEEN** | `AudioAffect.cpp`, `SoundManager.cpp`, `MusicManager.cpp` | Camera-relative `StereoPannerNode` & distance rolloff (`computeSpatialParams` in `js/audio.js`), procedural faction music sequencer (`USA`, `CHINA`, `GLA` themes with combat intensity layering & `[M]` toggle), and radio-filtered EVA squelch. |
| **SYS-24** | **Phase 3 Headless Automated Verification Suite** | **SEEN** | `tests/phase3_verify.js` | 26-point headless Node verification suite validating `SYS-14`..`SYS-23` and doorway spawn clearance with 0 failures. |
| **SYS-25** | **Deterministic Skirmish Save/Load & `.zhsave` Persistence** | **SEEN** | `GameState.cpp`, `Xfer.cpp`, `XferSave.cpp` | Full JSON state serialization/deserialization (`serializeState`, `deserializeState`, `saveToSlot`, `loadFromSlot`, `exportSaveJSON`, `importSaveJSON`) across `js/engine.js`, `js/ai.js`, and `js/ui.js` (`F5` Quick Save, `F9` Quick Load, `.zhsave` Export/Import). |
| **SYS-26** | **Multi-Squad Tactical AI Micro, Threat Heatmap & Power Combo Engine** | **SEEN** | `AISkirmishPlayer.cpp`, `AIAttackState.cpp` | Multi-squad tactical roles (`VANGUARD`, `FLANKER`, `BASE_DEFENSE`), Dozer/Harvester raid hunting with turret-threat avoidance (`findHighValueRaidTarget`), dynamic counter-unit production (`computeCounterWeights`), and spatial cluster/power-grid targeting (`findBestClusterTarget`). |
| **SYS-27** | **9×9 General Matchup Balance Matrix & Tournament Runner** | **SEEN** | `tests/balance_matrix.js` | Automated 81-matchup (`9×9` Sub-Generals) headless AI-vs-AI tournament runner verifying 0 runtime errors and balanced faction win rates (`USA: 47.9%`, `CHINA: 53.0%`, `GLA: 49.1%`). |
| **SYS-28** | **macOS Native `.app` v2.0 Shell, Menu Bar & Retina Polish** | **SEEN** | `macos_main.swift`, `Info.plist` | Native macOS Menu Bar (`Game`, `Audio`, `View`), `Cmd+S`/`Cmd+L`/`Cmd+E` Save/Load/Export key equivalents, Retina HiDPI canvas scaling, and compiled `C&C Generals Zero Hour.app` v2.0 bundle. |
| **SYS-29** | **Phase 4 Headless Automated Verification Suite** | **SEEN** | `tests/phase4_verify.js` | 29-point headless Node verification suite validating `SYS-25`..`SYS-28` and the 81-matchup 9×9 General Balance Matrix (`29/29 PASS`). |

---

## 2. Armor & Weapon Damage Matrix (`DamageFX.ini` / `Armor.ini`)

Derived from SAGE's damage-type vs. armor-class scalar curves:

| Weapon Damage Type | vs. `INFANTRY` | vs. `LIGHT_VEHICLE` | vs. `TANK` | vs. `AIRCRAFT` | vs. `BUILDING` |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **SMALL_ARMS** (Rifles, Gattling, Quad) | `1.35x` | `0.85x` | `0.25x` | `1.20x` | `0.30x` |
| **SNIPER** (Pathfinder, Jarmen Kell) | `3.80x` | `0.40x` | `0.10x` | `0.10x` | `0.05x` |
| **ARMOR_PIERCING** (Tank Shells, RPG, Laser) | `0.45x` | `1.35x` | `1.25x` | `1.30x` | `0.85x` |
| **HIGH_EXPLOSIVE** (Artillery, Tomahawk, Scud, Bombs) | `1.45x` | `1.25x` | `1.00x` | `0.20x` | `1.60x` |
| **FLAME_TOXIN** (Dragon Tank, Inferno, Toxin Tractor) | `2.10x` | `0.90x` | `0.40x` | `0.00x` | `1.50x` |
| **SUPERWEAPON** (Particle Beam, Nuke, Scud Storm) | `3.00x` | `2.50x` | `2.20x` | `2.00x` | `2.40x` |

---

## 3. Faction & Sub-General Roster (`PlayerTemplate.ini`)

### 3.1 United States of America (USA)
- **Doctrine:** High-tech precision, air superiority, laser point-defense, satellite intelligence.
- **Sub-Generals:**
  1. **General Malcolm "Ace" Granger (Air Force General):** Aircraft cost `-20%`, Aircraft HP `+25%`, unlocks **King Raptor** (PDL + 6 missiles) & **Combat Chinook** (flying gunship bunker), Comanches and Raptors spawn at Veteran rank.
  2. **General "Pinpoint" Townes (Laser General):** Unlocks **Laser Crusader** & **Laser Tank** and **Laser Turret**, Cold Fusion Reactors produce `+25%` power, Laser weapons deal `+20%` damage.
  3. **General Alexis Alexander (Superweapon General):** **Particle Cannon** costs `-40%` and recharges `30%` faster, **EMP Patriot** defenses disable vehicles on hit, **Aurora Alpha Bomber** (thermobaric fuel-air blast) unlocked.

### 3.2 People's Republic of China (China)
- **Doctrine:** Heavy armor, nuclear power, propaganda healing, overwhelming numbers ("Horde" bonus), gatling/napalm/nuclear weaponry.
- **Sub-Generals:**
  1. **General Ta Hun Kwai (Tank General):** Tanks cost `-20%`, start as **Veteran**, **Emperor Overlord** unlocked (intrinsic Speaker Tower + Gattling Cannon), Battlemaster & Gattling Tanks gain `+15%` speed.
  2. **General "Anvil" Shin Fai (Infantry General):** Infantry trained at **Veteran** rank with `+35%` HP, **Mini-Gunner** (elite twin-chaingun infantry) and **Assault Troop Crawler** unlocked, Horde bonus increased to `+35%`.
  3. **General Tsing Shi Tao (Nuclear General):** Tanks come pre-equipped with **Uranium Shells** & **Nuclear Tanks** (`+20%` speed, `+20%` damage), **Tactical Nuke MiG** unlocked, Nuclear Reactors produce `+35%` power.

### 3.3 Global Liberation Army (GLA)
- **Doctrine:** Guerrilla warfare, zero power requirement, Tunnel Network teleportation, Salvage Crate scavenging, anthrax toxins, demolition ambushes.
- **Sub-Generals:**
  1. **Dr. Thrax (Toxin General):** All toxin weapons deal `+35%` damage (Anthrax Gamma intrinsic), Rebels, RPG Troopers & Tunnel Networks fire toxin-laced rounds.
  2. **General Rodall "Demo" Juhziz (Demolition General):** Explosive/Demolition units deal `+35%` damage, unlocks **Combat Cycle** (`CLIFF_CLIMBER` demo motorcycle) and **Bomb Truck**, Terrorists & Scud Launchers cost `-20%`.
  3. **Prince Kassad (Stealth General):** Unlocks stealthed **Hijacker** (captures enemy vehicles) and **GPS Scrambler** Generals Power, Tunnel Networks cost `-25%` and units move `+15%` faster.

---

## 4. Clean-Room Verification Checklist
- [x] **No Proprietary Assets Copied:** 100% procedural Canvas 2.5D vector graphics, procedural WebAudio synthesizer SFX, and native macOS WebSpeech voice synthesis.
- [x] **Full RTS Control Scheme:** Left-click/drag box selection, right-click move/attack/harvest/enter-tunnel/garrison/capture/re-crew, `Ctrl+0..9` control groups + double-tap camera snap, `[A]` Attack-Move, `[G]` Guard, `[S]` Stop, `[X]` Scatter, `Ctrl+RightClick` Force-Fire, `Shift+RightClick` Waypoints, `[F]` Special Ability, `[E]` Evacuate Garrison, `Spacebar` Jump-to-Alert, `F5` Quick Save, `F9` Quick Load.
- [x] **Phase 2 Headless Automated Verification (`tests/phase2_verify.js`):** Automated Node test suite verifying SpatialHashGrid, 7 Locomotors, 8-way A* NavigationGrid, 3D Ballistics, Garrisoning + Flame/Flashbang clearing, Tech Building capture, Sub-General exclusive units, Pilot Snipe + re-crew, Hijacker capture, and 9 AI General Doctrines (`6/6 PASS`).
- [x] **Phase 3 Headless Automated Verification (`tests/phase3_verify.js`):** Automated Node test suite verifying Control Groups `0–9`, Guard Area Leash, Force-Fire, Scatter, Chained Waypoints, Cameo Queue Cancel/100% Refund, Under-Attack Radar Pings + Spacebar Jump, Faction HUD Themes, Articulated Unit Rigs + Barrel Recoil, 4-Stage Scaffolding, Persistent Decals, Multi-Stage Superweapon Spectacle, Spatial WebAudio Panning, Dynamic Faction Music, and Building Spawn Doorway Clearance (`26/26 PASS`).
- [x] **Plan Simulator & Bug Audit Verification (`tests/simulator_verify.js`):** Autonomous multi-doctrine simulator (`PlanSimulator`) verifying all 7 QA bug fixes, 9 full AI-vs-AI skirmish doctrine simulations, and UI fuzzing (`17/17 PASS`).
- [x] **Phase 4 Save/Load, Tactical AI Micro, 9×9 Balance Matrix & macOS v2.0 Verification (`tests/phase4_verify.js` & `tests/balance_matrix.js`):** Automated verification of deterministic `.zhsave` / `localStorage` Save/Load state serialization (`SYS-25`), Multi-Squad Tactical AI Micro & Power-Grid Cluster Targeting (`SYS-26`), 81-matchup `9×9` General Balance Matrix (`USA: 47.9%`, `CHINA: 53.0%`, `GLA: 49.1%`, `0` errors, `SYS-27`), and native macOS `.app` v2.0 Menu Bar & Retina shell (`SYS-28`, `29/29 PASS`).
