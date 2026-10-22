# 3D Unit Design Studio — Main Agent Integration Handoff (All 58 Deep-Engineered Units)

## 1. Overview

All **47 core units in `ZH_DATA.UNITS` (+ 11 Sub-General & Variant IDs = 58 Total Unit IDs)** across **USA**, **China**, and **GLA** are now **Deep-Engineered** in [`js/unit_models.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js). Every unit features:
- **5-Group Parametric Inspector Schema** (`paramSchema` with `groups[].fields[]`) in [`js/unit_models.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L5028-L6398)
- **5 Tactical Presets** (`presets`, including `DIORAMA_DEFAULT` and 4 doctrine/combat variants)
- **Dedicated Multi-Pass 3D Ligne-Claire Procedural Renderer** (`render`) with Painter's-algorithm depth sorting, 360° turntable rotation, independent 3D turret/launcher/blade/rotor articulation, and live recoil/suspension/hydraulic kinematics.
- **Full `DEEP_ENGINEERED_UNIT_IDS` Registration**: [`DEEP_ENGINEERED_UNIT_IDS`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L8176) is populated with `Object.keys(MODEL_REGISTRY)` so every unit renders with its full 3D Ligne-Claire rig in both [`unit_studio.html`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/unit_studio.html) and the live game ([`index.html`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/index.html) via [`js/vfx.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/vfx.js#L253-L259)).

---

## 2. 3D Ligne-Claire Procedural Renderers (22 Dedicated Engines)

| # | Renderer Function | Line Range | Unit Families Powered |
| :- | :--- | :--- | :--- |
| 1 | [`renderCrusaderModel`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L596-L1105) | `#L596-L1105` | `USA_CRUSADER`, `USA_LASER_CRUSADER` |
| 2 | [`renderPaladinModel`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L1112-L1324) | `#L1112-L1324` | `USA_PALADIN`, `USA_LASER_TANK` |
| 3 | [`renderHumveeOrAvengerModel`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L1331-L1506) | `#L1331-L1506` | `USA_HUMVEE`, `USA_AVENGER` |
| 4 | [`renderTomahawkModel`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L1699-L2492) | `#L1699-L2492` | `USA_TOMAHAWK` |
| 5 | [`renderDozerModel`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L2690-L3624) | `#L2690-L3624` | `USA_DOZER`, `CHINA_DOZER` |
| 6 | [`renderChinookModel`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L3631-L3808) | `#L3631-L3808` | `USA_CHINOOK`, `USA_COMBAT_CHINOOK` |
| 7 | [`renderComancheModel`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L3815-L3982) | `#L3815-L3982` | `USA_COMANCHE` |
| 8 | [`renderRaptorModel`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L3989-L4160) | `#L3989-L4160` | `USA_RAPTOR`, `USA_KING_RAPTOR` |
| 9 | [`renderAuroraModel`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L4167-L4304) | `#L4167-L4304` | `USA_AURORA`, `USA_AURORA_ALPHA` |
| 10 | [`renderInfantryModel`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L4311-L4549) | `#L4311-L4549` | All 17 USA, China & GLA Infantry / Commando / Worker units |
| 11 | [`renderOverlordModel`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L4556-L4734) | `#L4556-L4734` | `CHINA_OVERLORD`, `CHINA_EMPEROR_OVERLORD` |
| 12 | [`renderAmbulanceModel`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L4739-L4836) | `#L4739-L4836` | `USA_AMBULANCE` |
| 13 | [`renderMicrowaveTankModel`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L4841-L4914) | `#L4841-L4914` | `USA_MICROWAVE_TANK` |
| 14 | [`renderBattleDroneModel`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L4919-L4966) | `#L4919-L4966` | `USA_BATTLE_DRONE` |
| 15 | [`renderStealthFighterModel`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L4971-L5026) | `#L4971-L5026` | `USA_STEALTH_FIGHTER` |
| 16 | [`renderChinaTankModel`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L6400-L6515) | `#L6400-L6515` | `CHINA_BATTLEMASTER`, `CHINA_NUKE_BATTLEMASTER`, `CHINA_GATTLING_TANK`, `CHINA_DRAGON_TANK`, `CHINA_ECM_TANK` |
| 17 | [`renderChinaArtilleryModel`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L6517-L6595) | `#L6517-L6595` | `CHINA_INFERNO_CANNON`, `CHINA_NUKE_CANNON` |
| 18 | [`renderChinaWheeledModel`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L6597-L6660) | `#L6597-L6660` | `CHINA_SUPPLY_TRUCK`, `CHINA_TROOP_CRAWLER`, `CHINA_ASSAULT_CRAWLER`, `CHINA_ASSAULT_TROOP_CRAWLER`, `CHINA_LISTENING_OUTPOST`, `CHINA_ATTACK_OUTPOST` |
| 19 | [`renderHelixModel`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L6662-L6716) | `#L6662-L6716` | `CHINA_HELIX` |
| 20 | [`renderMigModel`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L6718-L6768) | `#L6718-L6768` | `CHINA_MIG`, `CHINA_NUKE_MIG`, `CHINA_TACTICAL_NUKEMIG` |
| 21 | [`renderGlaTankModel`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L6770-L6837) | `#L6770-L6837` | `GLA_SCORPION`, `GLA_MARAUDER`, `GLA_QUAD_CANNON`, `GLA_TOXIN_TRACTOR` |
| 22 | [`renderGlaWheeledModel`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L6839-L6891) | `#L6839-L6891` | `GLA_TECHNICAL`, `GLA_COMBAT_CYCLE`, `GLA_ROCKET_BUGGY`, `GLA_BOMB_TRUCK`, `GLA_SCUD_LAUNCHER`, `GLA_BATTLE_BUS` |

---

## 3. Complete Unit Registry Index (`MODEL_REGISTRY`)

### 3.1 USA Units (22 Registry Entries)
- [`MODEL_REGISTRY.USA_CRUSADER`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L6931-L6942) — M1A9 Crusader Tank ([`CRUSADER_PARAM_SCHEMA`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L475-L558), [`CRUSADER_PRESETS`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L409-L473))
- [`MODEL_REGISTRY.USA_LASER_CRUSADER`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L6943-L6954) — M1A9 Laser Crusader (Gen. Townes)
- [`MODEL_REGISTRY.USA_PALADIN`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L6955-L6966) — Paladin Frontline Battle Tank ([`PALADIN_PARAM_SCHEMA`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L5028-L5087), [`PALADIN_PRESETS`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L5089-L5144))
- [`MODEL_REGISTRY.USA_LASER_TANK`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L6967-L6978) — Laser Paladin Tank (Gen. Townes)
- [`MODEL_REGISTRY.USA_HUMVEE`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L6979-L6990) — M1114 Humvee Armored Scout ([`HUMVEE_PARAM_SCHEMA`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L5146-L5208), [`HUMVEE_PRESETS`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L5210-L5262))
- [`MODEL_REGISTRY.USA_AVENGER`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L6991-L7002) — M1097 Avenger Air-Defense System ([`AVENGER_PRESETS`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L5264-L5316))
- [`MODEL_REGISTRY.USA_TOMAHAWK`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7003-L7014) — BGM-109 Tomahawk Launcher ([`TOMAHAWK_PARAM_SCHEMA`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L1625-L1697), [`TOMAHAWK_PRESETS`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L1562-L1623))
- [`MODEL_REGISTRY.USA_AMBULANCE`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7015-L7026) — Armored Field Ambulance & NBC Decon ([`AMBULANCE_PARAM_SCHEMA`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L5318-L5369), [`AMBULANCE_PRESETS`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L5371-L5409))
- [`MODEL_REGISTRY.USA_MICROWAVE_TANK`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7027-L7038) — Directed-Energy Microwave Tank ([`MICROWAVE_TANK_PARAM_SCHEMA`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L5411-L5462), [`MICROWAVE_TANK_PRESETS`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L5464-L5502))
- [`MODEL_REGISTRY.USA_BATTLE_DRONE`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7039-L7050) — Autonomous Battle & Sentry Drone ([`BATTLE_DRONE_PARAM_SCHEMA`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L5504-L5551), [`BATTLE_DRONE_PRESETS`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L5553-L5586))
- [`MODEL_REGISTRY.USA_DOZER`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7053-L7064) — Caterpillar Armored Construction Dozer ([`DOZER_PARAM_SCHEMA`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L2614-L2688), [`DOZER_PRESETS`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L2548-L2612))
- [`MODEL_REGISTRY.USA_CHINOOK`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7065-L7076) — CH-47D Chinook Heavy Transport ([`CHINOOK_PARAM_SCHEMA`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L5588-L5647), [`CHINOOK_PRESETS`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L5649-L5699))
- [`MODEL_REGISTRY.USA_COMBAT_CHINOOK`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7079-L7090) — MH-47E Combat Chinook Gunship (Gen. Granger)
- [`MODEL_REGISTRY.USA_COMANCHE`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7091-L7102) — RAH-66 Comanche Stealth Gunship ([`COMANCHE_PARAM_SCHEMA`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L5701-L5762), [`COMANCHE_PRESETS`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L5764-L5819))
- [`MODEL_REGISTRY.USA_RAPTOR`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7103-L7114) — F-22 Raptor Stealth Fighter ([`RAPTOR_PARAM_SCHEMA`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L5821-L5882), [`RAPTOR_PRESETS`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L5884-L5941))
- [`MODEL_REGISTRY.USA_KING_RAPTOR`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7115-L7126) — F-22X King Raptor (Gen. Granger)
- [`MODEL_REGISTRY.USA_STEALTH_FIGHTER`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7127-L7138) — F-117A Nighthawk Stealth Fighter ([`STEALTH_FIGHTER_PARAM_SCHEMA`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L5943-L5994), [`STEALTH_FIGHTER_PRESETS`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L5996-L6032))
- [`MODEL_REGISTRY.USA_AURORA`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7139-L7150) — B-70 Aurora Hypersonic Bomber ([`AURORA_PARAM_SCHEMA`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L6034-L6089), [`AURORA_PRESETS`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L6091-L6143))
- [`MODEL_REGISTRY.USA_AURORA_ALPHA`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7151-L7162) — Aurora Alpha Thermobaric Bomber (Gen. Alexander)
- [`MODEL_REGISTRY.USA_RANGER`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7165-L7176) — US Army Ranger ([`INFANTRY_PARAM_SCHEMA`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L6145-L6172), [`INFANTRY_PRESETS`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L6174-L6189))
- [`MODEL_REGISTRY.USA_MISSILE_DEFENDER`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7177-L7188) — Missile Defender
- [`MODEL_REGISTRY.USA_PATHFINDER`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7189-L7200) — Pathfinder Elite Sniper
- [`MODEL_REGISTRY.USA_COLONEL_BURTON`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7201-L7212) — Colonel Burton Elite Commando

### 3.2 China PLA Units (23 Registry Entries)
- [`MODEL_REGISTRY.CHINA_DOZER`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7215-L7226) — PLA Construction Dozer
- [`MODEL_REGISTRY.CHINA_SUPPLY_TRUCK`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7227-L7238) — PLA Supply Cargo Truck ([`CHINA_WHEELED_PARAM_SCHEMA`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L6289-L6296))
- [`MODEL_REGISTRY.CHINA_BATTLEMASTER`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7239-L7250) — Type-98 Battlemaster MBT ([`CHINA_TANK_PARAM_SCHEMA`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L6271-L6278))
- [`MODEL_REGISTRY.CHINA_NUKE_BATTLEMASTER`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7251-L7262) — Nuclear Battlemaster (Gen. Tao)
- [`MODEL_REGISTRY.CHINA_GATTLING_TANK`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7263-L7274) — Dual Rotary Gattling Tank
- [`MODEL_REGISTRY.CHINA_DRAGON_TANK`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7275-L7286) — Dragon Flame Tank
- [`MODEL_REGISTRY.CHINA_INFERNO_CANNON`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7287-L7298) — Inferno Napalm Artillery ([`CHINA_ARTILLERY_PARAM_SCHEMA`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L6280-L6287))
- [`MODEL_REGISTRY.CHINA_NUKE_CANNON`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7299-L7310) — Tactical Nuclear Siege Cannon
- [`MODEL_REGISTRY.CHINA_ECM_TANK`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7311-L7322) — ECM Electronic Warfare Tank
- [`MODEL_REGISTRY.CHINA_OVERLORD`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7323-L7334) — Overlord Super-Heavy Battle Tank ([`OVERLORD_PARAM_SCHEMA`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L6191-L6212))
- [`MODEL_REGISTRY.CHINA_EMPEROR_OVERLORD`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7335-L7346) — Emperor Overlord (Gen. Kwai)
- [`MODEL_REGISTRY.CHINA_TROOP_CRAWLER`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7347-L7358) — 8x8 Armored Troop Crawler
- [`MODEL_REGISTRY.CHINA_ASSAULT_CRAWLER`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7359-L7370) — Assault Troop Crawler (Gen. Fai)
- [`MODEL_REGISTRY.CHINA_ASSAULT_TROOP_CRAWLER`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7371-L7382) — Assault Troop Crawler Alias
- [`MODEL_REGISTRY.CHINA_LISTENING_OUTPOST`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7383-L7394) — Stealth Listening Outpost
- [`MODEL_REGISTRY.CHINA_ATTACK_OUTPOST`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7395-L7406) — Assault Listening Outpost (Gen. Fai)
- [`MODEL_REGISTRY.CHINA_HELIX`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7407-L7418) — Ka-58 Helix Heavy Assault Gunship ([`HELIX_PARAM_SCHEMA`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L6298-L6305))
- [`MODEL_REGISTRY.CHINA_MIG`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7419-L7430) — MiG-1.44 Firestorm Strike Fighter ([`MIG_PARAM_SCHEMA`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L6307-L6314))
- [`MODEL_REGISTRY.CHINA_NUKE_MIG`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7431-L7442) — Tactical Nuclear MiG (Gen. Tao)
- [`MODEL_REGISTRY.CHINA_TACTICAL_NUKEMIG`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7443-L7454) — Tactical Nuclear MiG Alias
- [`MODEL_REGISTRY.CHINA_RED_GUARD`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7455-L7466) — PLA Red Guard Rifle Squad
- [`MODEL_REGISTRY.CHINA_MINIGUNNER`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7467-L7478) — Elite Gattling Minigunner (Gen. Fai)
- [`MODEL_REGISTRY.CHINA_TANK_HUNTER`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7479-L7490) — PLA Anti-Armor Tank Hunter
- [`MODEL_REGISTRY.CHINA_HACKER`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7491-L7502) — PLA Cyber Warfare Hacker
- [`MODEL_REGISTRY.CHINA_SUPER_HACKER`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7503-L7514) — Elite Stealth Hacker (Gen. Fai)
- [`MODEL_REGISTRY.CHINA_BLACK_LOTUS`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7515-L7526) — Black Lotus Elite Cyber Agent

### 3.3 GLA Units (17 Registry Entries)
- [`MODEL_REGISTRY.GLA_WORKER`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7529-L7540) — Field Laborer & Builder Worker
- [`MODEL_REGISTRY.GLA_REBEL`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7541-L7552) — Guerrilla Rebel Fighter
- [`MODEL_REGISTRY.GLA_RPG_TROOPER`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7553-L7564) — Anti-Armor RPG-7 Trooper
- [`MODEL_REGISTRY.GLA_TERRORIST`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7565-L7576) — Demolition Saboteur
- [`MODEL_REGISTRY.GLA_HIJACKER`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7577-L7588) — Stealth Vehicle Hijacker (Prince Kassad)
- [`MODEL_REGISTRY.GLA_ANGRY_MOB`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7589-L7600) — Angry Insurgent Mob (AK-47 & Molotov)
- [`MODEL_REGISTRY.GLA_JARMEN_KELL`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7601-L7612) — Jarmen Kell Legendary Sniper Hero
- [`MODEL_REGISTRY.GLA_SCORPION`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7613-L7624) — Scorpion Light Battle Tank ([`GLA_TANK_PARAM_SCHEMA`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L6316-L6323))
- [`MODEL_REGISTRY.GLA_MARAUDER`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7625-L7636) — Marauder Salvage Heavy Tank
- [`MODEL_REGISTRY.GLA_QUAD_CANNON`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7637-L7648) — ZSU-23-4 Quad Cannon Half-Track
- [`MODEL_REGISTRY.GLA_TOXIN_TRACTOR`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7649-L7660) — Anthrax Bio-Toxin Tractor
- [`MODEL_REGISTRY.GLA_TECHNICAL`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7661-L7672) — Improvised Technical Pickup ([`GLA_WHEELED_PARAM_SCHEMA`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L6325-L6332))
- [`MODEL_REGISTRY.GLA_COMBAT_CYCLE`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7673-L7684) — Demolition Combat Cycle (Gen. Juhziz)
- [`MODEL_REGISTRY.GLA_ROCKET_BUGGY`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7685-L7696) — High-Speed Artillery Rocket Buggy
- [`MODEL_REGISTRY.GLA_BOMB_TRUCK`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7697-L7708) — Disguised High-Explosive Bomb Truck
- [`MODEL_REGISTRY.GLA_SCUD_LAUNCHER`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7709-L7720) — MAZ-543 Scud-B Ballistic Missile Launcher
- [`MODEL_REGISTRY.GLA_BATTLE_BUS`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L7721-L7732) — Up-Armored Fortified Battle Bus

---

## 4. Shared 3D Projection Helpers & Live Integration Hook

| Component | Location | Description |
| :--- | :--- | :--- |
| **3D Projection & Primitives** | [`js/unit_models.js#L45-L352`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L45-L352) | `createProjector`, `flushFaces`, `pushBox3D`, `pushFrustumFaces`, `pushCylinderZ3D`, `pushTubeSegment3D`, `pushTrackedSuspension3D`, `pushWheelAxle3D`, `drawGlassPane3D`, `pushPintleMG3D`. |
| **Unit Dispatch Entry Point** | [`js/unit_models.js#L8248-L8267`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js#L8248-L8267) | `window.ZH_UNIT_MODELS.renderUnitIfBespoke(ctx, u, faction, options)` — renders any unit in `MODEL_REGISTRY` at `(0, 0)` in the caller's translated canvas context using `u.angle`, `u.turretAngle`, `u.recoilOffset`, and `u.treadPhase`. |
| **Battlefield Renderer Hook** | [`js/vfx.js#L253-L259`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/vfx.js#L253-L259) | [`renderArticulatedUnit(ctx, u, faction, options)`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/vfx.js#L253-L259) delegates directly to `window.ZH_UNIT_MODELS.renderUnitIfBespoke`. |
| **3D Unit Design Studio UI** | [`unit_studio.html`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/unit_studio.html) & [`js/unit_studio.js`](file:///Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_studio.js) | Interactive CAD workbench with faction tabs (`All`, `USA`, `China`, `GLA`), 5-group parametric inspector, 5-preset selector, 8-direction compass, and live combat kinematics preview. |
