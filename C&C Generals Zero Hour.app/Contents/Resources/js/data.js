// ============================================================================
// Command & Conquer: Generals – Zero Hour (macOS Clean-Room Edition)
// js/data.js — Phase 2 Declarative INI-Equivalent Faction, General, Unit,
//              Building, Tech Structure, Active Ability & Generals Power Registry
// ============================================================================

window.ZH_DATA = (function () {
  'use strict';

  // Armor Damage Scalar Matrix (Weapon Damage Type -> Target Armor Class)
  const DAMAGE_MATRIX = {
    SMALL_ARMS:     { INFANTRY: 1.35, LIGHT_VEHICLE: 0.85, TANK: 0.25, AIRCRAFT: 1.20, BUILDING: 0.30 },
    SNIPER:         { INFANTRY: 3.80, LIGHT_VEHICLE: 0.40, TANK: 0.10, AIRCRAFT: 0.10, BUILDING: 0.05 },
    ARMOR_PIERCING: { INFANTRY: 0.45, LIGHT_VEHICLE: 1.35, TANK: 1.25, AIRCRAFT: 1.30, BUILDING: 0.85 },
    HIGH_EXPLOSIVE: { INFANTRY: 1.45, LIGHT_VEHICLE: 1.25, TANK: 1.00, AIRCRAFT: 0.20, BUILDING: 1.60 },
    FLAME_TOXIN:    { INFANTRY: 2.10, LIGHT_VEHICLE: 0.90, TANK: 0.40, AIRCRAFT: 0.00, BUILDING: 1.50 },
    SUPERWEAPON:    { INFANTRY: 3.00, LIGHT_VEHICLE: 2.50, TANK: 2.20, AIRCRAFT: 2.00, BUILDING: 2.40 }
  };

  // Veterancy Ranks (Regular -> Veteran -> Elite -> Heroic)
  const VETERANCY_LEVELS = [
    { level: 0, name: 'Regular', xpReq: 0,   dmgMult: 1.00, hpMult: 1.00, rofMult: 1.00, selfHeal: 0 },
    { level: 1, name: 'Veteran', xpReq: 100, dmgMult: 1.20, hpMult: 1.15, rofMult: 1.12, selfHeal: 0 },
    { level: 2, name: 'Elite',   xpReq: 260, dmgMult: 1.40, hpMult: 1.30, rofMult: 1.25, selfHeal: 4 },
    { level: 3, name: 'Heroic',  xpReq: 520, dmgMult: 1.70, hpMult: 1.50, rofMult: 1.40, selfHeal: 10 }
  ];

  // General Rank Thresholds (1-Star to 5-Star General)
  const GENERAL_RANKS = [
    { rank: 1, title: '1-Star Brigadier', xpReq: 0,    pointsGranted: 1 },
    { rank: 2, title: '2-Star Major Gen.', xpReq: 450,  pointsGranted: 1 },
    { rank: 3, title: '3-Star Lt. General', xpReq: 1100, pointsGranted: 1 },
    { rank: 4, title: '4-Star General',     xpReq: 2100, pointsGranted: 1 },
    { rank: 5, title: '5-Star Commander',   xpReq: 3500, pointsGranted: 2 }
  ];

  // 3 Asymmetric Factions
  const FACTIONS = {
    USA: {
      id: 'USA',
      name: 'United States (USA)',
      shortName: 'USA',
      color: '#3b82f6',
      accent: '#93c5fd',
      darkColor: '#1d4ed8',
      usesPower: true,
      bannerIcon: '🦅',
      tagline: 'High-Tech Precision, Air Superiority & Point-Defense Lasers',
      description: 'Deploys Cold Fusion Reactors, Chinook air-supply choppers, Paladin Tanks with missile-zapping Point-Defense Lasers, stealth Comanches, and the orbital Particle Cannon.',
      startingCredits: 10000
    },
    CHINA: {
      id: 'CHINA',
      name: "People's Republic of China",
      shortName: 'China',
      color: '#ef4444',
      accent: '#fca5a5',
      darkColor: '#b91c1c',
      usesPower: true,
      bannerIcon: '🐉',
      tagline: 'Heavy Armor, Nationalism Horde Bonus, Napalm & Nuclear Might',
      description: 'Commands massive Overlord Tanks, Gattling weapons, Dragon flame tanks, Internet Center Hackers, Propaganda healing towers, and the thermonuclear Missile Silo.',
      startingCredits: 10000
    },
    GLA: {
      id: 'GLA',
      name: 'Global Liberation Army (GLA)',
      shortName: 'GLA',
      color: '#eab308',
      accent: '#fde047',
      darkColor: '#a16207',
      usesPower: false,
      bannerIcon: '🦂',
      tagline: 'Zero Power Needed, Tunnel Networks, Salvage Crates & Anthrax Toxins',
      description: 'Requires zero electricity. Connects the map via subterranean Tunnel Networks, upgrades vehicles by collecting battlefield Salvage Crates, and launches the Scud Storm.',
      startingCredits: 10000
    }
  };

  // 9 Zero Hour Sub-Generals
  const GENERALS = {
    USA_GRANGER: {
      id: 'USA_GRANGER',
      faction: 'USA',
      name: 'Gen. Malcolm "Ace" Granger',
      title: 'US Air Force General',
      badge: '✈️',
      specialty: 'Air Superiority Doctrine',
      perks: [
        'Unlocks King Raptor (PDL + 6 missiles) & Combat Chinook Gunship',
        'Aircraft cost -20% and have +25% Armor HP',
        'Comanches & Raptors spawn at Veteran rank'
      ],
      modifiers: {
        aircraftCostMult: 0.80,
        aircraftHpMult: 1.25,
        aircraftStartVet: 1
      },
      taunts: [
        'Welcome to my airspace, General. My King Raptors already have you locked on radar.',
        'You cannot hide from complete air superiority! Incoming airstrike!',
        'Watch the skies, General — my Combat Chinooks and Comanches will tear your armor apart!'
      ]
    },
    USA_TOWNES: {
      id: 'USA_TOWNES',
      faction: 'USA',
      name: 'Gen. "Pinpoint" Townes',
      title: 'US Laser Weapons General',
      badge: '⚡',
      specialty: 'Directed-Energy & Laser Armor',
      perks: [
        'Unlocks Laser Crusader, Laser Tank & Laser Defense Turret',
        'Cold Fusion Reactors generate +25% Power',
        'All Laser & Beam weapons deal +20% damage'
      ],
      modifiers: {
        powerOutputMult: 1.25,
        laserDamageMult: 1.20,
        unlockLaserTank: true
      },
      taunts: [
        'Bullets and shells are relics of the past. Prepare for surgical laser precision!',
        'My Laser Turrets will vaporize your assault before you cross the perimeter.',
        'Focused light at the speed of thought. Your armor is melting, General!'
      ]
    },
    USA_ALEXANDER: {
      id: 'USA_ALEXANDER',
      faction: 'USA',
      name: 'Gen. Alexis Alexander',
      title: 'US Superweapon & Defense General',
      badge: '🛰️',
      specialty: 'Orbital Particle Weapons & EMP Defense',
      perks: [
        'Unlocks Aurora Alpha Fuel-Air Bomber & EMP Patriot Battery',
        'Particle Cannon costs -40% and recharges 30% faster',
        'Patriot Missile Systems fire EMP-charged warheads (+25% dmg)'
      ],
      modifiers: {
        superweaponCostMult: 0.60,
        superweaponCooldownMult: 0.70,
        defenseDamageMult: 1.25,
        auroraDamageMult: 1.35
      },
      taunts: [
        'Try breaching my EMP Patriot perimeter while my Particle Cannon aligns in orbit!',
        'Orbital coordinates locked. Let us see how your base handles solar-core plasma!',
        'Defense wins wars, General — and my Aurora Alphas finish them.'
      ]
    },
    CHINA_KWAI: {
      id: 'CHINA_KWAI',
      faction: 'CHINA',
      name: 'Gen. Ta Hun Kwai',
      title: 'PLA Tank Division General',
      badge: '🛡️',
      specialty: 'Heavy Armored Spearhead',
      perks: [
        'Unlocks Emperor Overlord Tank (Speaker Tower + Gattling Cannon)',
        'All Tanks cost -20% and roll out at Veteran rank',
        'Battlemaster & Gattling Tanks move +15% faster'
      ],
      modifiers: {
        tankCostMult: 0.80,
        tankStartVet: 1,
        tankSpeedMult: 1.15,
        freeOverlordSpeaker: true
      },
      taunts: [
        'Nothing stops China\'s armored fist! My Emperor Overlords will crush your base beneath their treads!',
        'Feel the ground tremble, General! Another column of Battlemasters is on the march!',
        'You bring toys to a tank war! Roll over them!'
      ]
    },
    CHINA_SHIN_FAI: {
      id: 'CHINA_SHIN_FAI',
      faction: 'CHINA',
      name: 'Gen. "Anvil" Shin Fai',
      title: 'PLA Infantry General',
      badge: '🎖️',
      specialty: 'Elite Infantry & Nationalism Horde',
      perks: [
        'Unlocks Elite Mini-Gunner & Assault Troop Crawler',
        'All Infantry spawn at Veteran rank with +35% HP',
        'Nationalism Horde Bonus boosted to +35% fire rate'
      ],
      modifiers: {
        infantryStartVet: 1,
        infantryHpMult: 1.35,
        hordeRofBonus: 1.35,
        hackerIncomeMult: 1.25
      },
      taunts: [
        'A million loyal Mini-Gunners march on your position! Can your guns reload fast enough?',
        'My Assault Troop Crawlers carry the strength of the People! Hold the line!',
        'Your tanks will drown in a sea of Tank Hunters and Mini-Gunners!'
      ]
    },
    CHINA_TAO: {
      id: 'CHINA_TAO',
      faction: 'CHINA',
      name: 'Gen. Tsing Shi Tao',
      title: 'PLA Nuclear Weapons General',
      badge: '☢️',
      specialty: 'Tactical & Strategic Nuclear Arsenal',
      perks: [
        'Unlocks Tactical Nuke MiG & immediate Nuke Cannon access',
        'Tanks come pre-upgraded with Uranium Shells (+20% dmg) & Nuclear Engines (+20% speed)',
        'Nuclear Reactors generate +35% Power cleanly'
      ],
      modifiers: {
        powerOutputMult: 1.35,
        tankDamageMult: 1.20,
        tankSpeedMult: 1.20,
        nukeDamageMult: 1.25
      },
      taunts: [
        'Behold the glow of splitting atoms! Soon your entire base will shine in the dark!',
        'My Nuke MiGs and Nuke Cannons are already in range. Enjoy the fallout, General!',
        'Everything is better with nuclear power — especially your destruction!'
      ]
    },
    GLA_THRAX: {
      id: 'GLA_THRAX',
      faction: 'GLA',
      name: 'Dr. Thrax',
      title: 'GLA Bio-Chemical & Toxin General',
      badge: '☣️',
      specialty: 'Anthrax Gamma Biological Warfare',
      perks: [
        'All Toxin & Chemical weapons deal +35% damage (Anthrax Gamma intrinsic)',
        'Rebels, RPG Troopers & Tunnel Networks fire toxin-laced rounds',
        'Scud Launcher & Scud Storm leave prolonged toxic fallout clouds'
      ],
      modifiers: {
        toxinDamageMult: 1.35,
        allWeaponsToxic: true
      },
      taunts: [
        'Take a deep breath, General! My newest batch of Anthrax Gamma is completely free of charge!',
        'Careful with that armor — my toxins eat right through steel and flesh alike!',
        'The doctor is in! And your prognosis is terminal!'
      ]
    },
    GLA_JUHZIZ: {
      id: 'GLA_JUHZIZ',
      faction: 'GLA',
      name: 'Gen. Rodall "Demo" Juhziz',
      title: 'GLA Demolition & Artillery General',
      badge: '💥',
      specialty: 'High-Explosive & Suicide Detonation Doctrine',
      perks: [
        'Unlocks Cliff-Climbing Combat Cycle & High-Explosive Bomb Truck',
        'All Explosive, Artillery & Demolition weapons deal +35% damage',
        'Terrorists & Scud Launchers cost -20%; Scud Storm recharges 25% faster'
      ],
      modifiers: {
        explosiveDamageMult: 1.35,
        demoCostMult: 0.80,
        superweaponCooldownMult: 0.75
      },
      taunts: [
        'Listen closely, General... everything around you is wired to blow!',
        'Boom! Haha! Did you like that? My Combat Cycles are already scaling your cliffs!',
        'My Scud Launchers will turn your gleaming fortress into a smoking crater!'
      ]
    },
    GLA_KASSAD: {
      id: 'GLA_KASSAD',
      faction: 'GLA',
      name: 'Prince Kassad',
      title: 'GLA Stealth & Ambush General',
      badge: '🕵️',
      specialty: 'Camouflage Networks, Hijackers & Guerrilla Snipers',
      perks: [
        'Unlocks Stealthed Vehicle Hijacker & GPS Scrambler Power',
        'Tunnel Networks cost -25% and units move +15% faster',
        'Jarmen Kell & Rebels gain +25% range and stealth ambush bonus'
      ],
      modifiers: {
        tunnelCostMult: 0.75,
        unitSpeedMult: 1.15,
        sniperBonusMult: 1.25
      },
      taunts: [
        'You strike at shadows while my Hijackers commandeer your finest tanks!',
        'What you cannot see WILL destroy you, General. Watch your supply lines!',
        'From the desert sands we strike, and to the sands we vanish.'
      ]
    }
  };

  // Neutral Capturable Tech Buildings & Fortifiable Civilian Structures (Phase 2)
  const TECH_BUILDINGS = {
    TECH_OIL_DERRICK: {
      id: 'TECH_OIL_DERRICK',
      name: 'Tech Oil Derrick',
      shortName: 'OIL DERRICK',
      hp: 1600,
      size: 58,
      captureBonus: 1000,
      passiveIncome: 35, // +$35 every 2s (+1050/min)
      icon: '🛢️',
      description: 'Capturable Neutral Tech Structure. Capturing with Ranger/Red Guard/Rebel grants an immediate +$1,000 bonus and +$35 every 2 seconds.'
    },
    TECH_HOSPITAL: {
      id: 'TECH_HOSPITAL',
      name: 'Tech Civilian Hospital',
      shortName: 'HOSPITAL',
      hp: 1600,
      size: 62,
      healInfantryRate: 6, // +6 HP/s to all friendly infantry globally
      icon: '🏥',
      description: 'Capturable Neutral Tech Structure. Passively heals all friendly Infantry across the entire battlefield (+6 HP/sec).'
    },
    TECH_REPAIR_BAY: {
      id: 'TECH_REPAIR_BAY',
      name: 'Tech Industrial Repair Bay',
      shortName: 'REPAIR BAY',
      hp: 1700,
      size: 64,
      repairVehicleRate: 8, // +8 HP/s to all friendly vehicles globally
      icon: '🔧',
      description: 'Capturable Neutral Tech Structure. Passively repairs all friendly Vehicles and Tanks across the entire battlefield (+8 HP/sec).'
    },
    CIV_GARRISON_BUNKER: {
      id: 'CIV_GARRISON_BUNKER',
      name: 'Civilian Urban Garrison',
      shortName: 'GARRISON',
      hp: 1800,
      size: 66,
      capacity: 6,
      armorBonus: 0.40,
      rangeBonus: 1.25,
      icon: '🏢',
      description: 'Fortifiable Civilian Structure. Garrison up to 6 infantry inside (Right-Click) to fire from protected ports (+25% range, +40% armor). Cleared instantly by Flame, Toxin, or Flashbang weapons!'
    }
  };

  // Building Registry
  const BUILDINGS = {
    // ================= USA BUILDINGS =================
    USA_COMMAND_CENTER: {
      id: 'USA_COMMAND_CENTER',
      faction: 'USA',
      name: 'US Command Center',
      shortName: 'CMD',
      cost: 2000,
      buildTime: 18,
      hp: 3000,
      power: 0,
      size: 92,
      sight: 320,
      isCommandCenter: true,
      providesRadar: true,
      trains: ['USA_DOZER'],
      upgrades: [],
      voiceSelect: 'US Command Center operational.',
      description: 'Primary headquarters and satellite radar uplink. Trains Construction Dozers.'
    },
    USA_REACTOR: {
      id: 'USA_REACTOR',
      faction: 'USA',
      name: 'Cold Fusion Reactor',
      shortName: 'REACTOR',
      cost: 800,
      buildTime: 9,
      hp: 1100,
      power: 8,
      size: 64,
      sight: 200,
      upgrades: ['UPG_CONTROL_RODS'],
      voiceSelect: 'Cold Fusion Reactor online.',
      description: 'Generates +8 Power for the US base grid. Upgradable with Control Rods (+100% power).'
    },
    USA_SUPPLY_CENTER: {
      id: 'USA_SUPPLY_CENTER',
      faction: 'USA',
      name: 'Supply Center',
      shortName: 'SUPPLY',
      cost: 2000,
      buildTime: 14,
      hp: 1800,
      power: -1,
      size: 82,
      sight: 240,
      isSupplyDepot: true,
      freeUnit: 'USA_CHINOOK',
      trains: ['USA_CHINOOK'],
      voiceSelect: 'Supply Center ready for deliveries.',
      description: 'Refines battlefield supplies. Includes 1 free Chinook Supply Helicopter ($600 per trip).'
    },
    USA_BARRACKS: {
      id: 'USA_BARRACKS',
      faction: 'USA',
      name: 'US Barracks',
      shortName: 'BARRACKS',
      cost: 600,
      buildTime: 10,
      hp: 1400,
      power: -1,
      size: 72,
      sight: 220,
      trains: ['USA_RANGER', 'USA_MISSILE_DEFENDER', 'USA_PATHFINDER'],
      upgrades: ['UPG_FLASHBANGS'],
      voiceSelect: 'US Barracks ready.',
      description: 'Trains US Rangers, Laser-Lock Missile Defenders, and elite Pathfinders.'
    },
    USA_WAR_FACTORY: {
      id: 'USA_WAR_FACTORY',
      faction: 'USA',
      name: 'US War Factory',
      shortName: 'WAR FAC',
      cost: 2000,
      buildTime: 16,
      hp: 2400,
      power: -2,
      size: 88,
      sight: 240,
      trains: ['USA_HUMVEE', 'USA_CRUSADER', 'USA_LASER_CRUSADER', 'USA_PALADIN', 'USA_LASER_TANK', 'USA_AVENGER', 'USA_TOMAHAWK'],
      upgrades: ['UPG_TOW_MISSILE'],
      voiceSelect: 'War Factory ready for armor production.',
      description: 'Manufactures Humvees, Crusader/Laser Crusader/Paladin/Laser Tanks, Avengers, and Tomahawks.'
    },
    USA_AIRFIELD: {
      id: 'USA_AIRFIELD',
      faction: 'USA',
      name: 'US Airfield',
      shortName: 'AIRFIELD',
      cost: 1000,
      buildTime: 12,
      hp: 1600,
      power: -2,
      size: 84,
      sight: 260,
      trains: ['USA_RAPTOR', 'USA_KING_RAPTOR', 'USA_COMANCHE', 'USA_COMBAT_CHINOOK', 'USA_AURORA', 'USA_AURORA_ALPHA'],
      upgrades: ['UPG_ROCKET_PODS'],
      voiceSelect: 'Airfield flight deck cleared.',
      description: 'Produces Raptors, King Raptors (Granger), Comanches, Combat Chinooks (Granger), and Aurora Bombers.'
    },
    USA_STRATEGY_CENTER: {
      id: 'USA_STRATEGY_CENTER',
      faction: 'USA',
      name: 'Strategy Center',
      shortName: 'STRATEGY',
      cost: 2500,
      buildTime: 18,
      hp: 2500,
      power: -3,
      size: 84,
      sight: 300,
      isTechCenter: true,
      upgrades: ['UPG_COMPOSITE_ARMOR'],
      voiceSelect: 'Strategy Center online. Battle plan active.',
      description: 'Unlocks Paladin Tanks, Avengers, Tomahawks, Pathfinders, Supply Drop Zones, and the Particle Cannon. Grants +10% range & armor aura.'
    },
    USA_SUPPLY_DROP_ZONE: {
      id: 'USA_SUPPLY_DROP_ZONE',
      faction: 'USA',
      name: 'Supply Drop Zone',
      shortName: 'DROP ZONE',
      cost: 1500,
      buildTime: 14,
      hp: 1300,
      power: -2,
      size: 68,
      sight: 220,
      requiresTech: true,
      passiveIncome: 45,
      voiceSelect: 'C-130 Supply Drop Zone active.',
      description: 'Calls periodic C-130 cargo drops yielding steady infinite secondary income.'
    },
    USA_PATRIOT: {
      id: 'USA_PATRIOT',
      faction: 'USA',
      name: 'Patriot / Laser / EMP Battery',
      shortName: 'PATRIOT',
      cost: 900,
      buildTime: 9,
      hp: 1100,
      power: -3,
      size: 46,
      sight: 300,
      isDefense: true,
      weapon: {
        damage: 65,
        range: 280,
        cooldown: 1.35,
        damageType: 'ARMOR_PIERCING',
        projectileSpeed: 520,
        projType: 'MISSILE',
        splash: 18,
        antiAir: true
      },
      voiceSelect: 'Patriot Defense System tracking.',
      description: 'Guided missile battery (Laser Turret for Gen. Townes; EMP Patriot disabling enemy vehicles for Gen. Alexander).'
    },
    USA_PARTICLE_CANNON: {
      id: 'USA_PARTICLE_CANNON',
      faction: 'USA',
      name: 'Particle Cannon',
      shortName: 'PARTICLE',
      cost: 5000,
      buildTime: 26,
      hp: 2800,
      power: -6,
      size: 92,
      sight: 300,
      requiresTech: true,
      isSuperweapon: true,
      superweaponType: 'PARTICLE_CANNON',
      superweaponCooldown: 150,
      voiceSelect: 'Particle Cannon orbital mirror aligned.',
      description: 'USA Superweapon. Fires a steerable orbital particle beam that incinerates enemy bases.'
    },

    // ================= CHINA BUILDINGS =================
    CHINA_COMMAND_CENTER: {
      id: 'CHINA_COMMAND_CENTER',
      faction: 'CHINA',
      name: 'PLA Command Center',
      shortName: 'CMD',
      cost: 2000,
      buildTime: 18,
      hp: 3200,
      power: 0,
      size: 92,
      sight: 320,
      isCommandCenter: true,
      providesRadar: true,
      trains: ['CHINA_DOZER'],
      upgrades: [],
      voiceSelect: 'China Command Center ready.',
      description: 'Central headquarters and radar hub for the People\'s Liberation Army. Trains Construction Dozers.'
    },
    CHINA_REACTOR: {
      id: 'CHINA_REACTOR',
      faction: 'CHINA',
      name: 'Nuclear Reactor',
      shortName: 'NUCLEAR',
      cost: 1000,
      buildTime: 10,
      hp: 1300,
      power: 10,
      size: 68,
      sight: 200,
      canOvercharge: true,
      voiceSelect: 'Nuclear Reactor operating within normal parameters.',
      description: 'Generates +10 Power. Can toggle Overcharge (+50% power at the cost of slow hull damage).'
    },
    CHINA_SUPPLY_CENTER: {
      id: 'CHINA_SUPPLY_CENTER',
      faction: 'CHINA',
      name: 'Supply Center',
      shortName: 'SUPPLY',
      cost: 1500,
      buildTime: 13,
      hp: 1900,
      power: -1,
      size: 82,
      sight: 240,
      isSupplyDepot: true,
      freeUnit: 'CHINA_SUPPLY_TRUCK',
      trains: ['CHINA_SUPPLY_TRUCK'],
      voiceSelect: 'Supply Center operational.',
      description: 'Processes supply crates. Comes with 1 free Supply Truck ($350 per trip).'
    },
    CHINA_BARRACKS: {
      id: 'CHINA_BARRACKS',
      faction: 'CHINA',
      name: 'PLA Barracks',
      shortName: 'BARRACKS',
      cost: 500,
      buildTime: 9,
      hp: 1500,
      power: -1,
      size: 72,
      sight: 220,
      trains: ['CHINA_RED_GUARD', 'CHINA_MINIGUNNER', 'CHINA_TANK_HUNTER', 'CHINA_HACKER', 'CHINA_BLACK_LOTUS'],
      upgrades: ['UPG_NATIONALISM'],
      voiceSelect: 'Barracks ready to train the People\'s army.',
      description: 'Trains Red Guard squads, Elite Mini-Gunners (Shin Fai), Tank Hunters, Hackers, and Black Lotus.'
    },
    CHINA_WAR_FACTORY: {
      id: 'CHINA_WAR_FACTORY',
      faction: 'CHINA',
      name: 'PLA War Factory',
      shortName: 'WAR FAC',
      cost: 2000,
      buildTime: 16,
      hp: 2600,
      power: -2,
      size: 88,
      sight: 240,
      trains: [
        'CHINA_BATTLEMASTER', 'CHINA_GATTLING_TANK', 'CHINA_DRAGON_TANK',
        'CHINA_TROOP_CRAWLER', 'CHINA_ASSAULT_CRAWLER', 'CHINA_INFERNO_CANNON',
        'CHINA_OVERLORD', 'CHINA_EMPEROR_OVERLORD', 'CHINA_NUKE_CANNON'
      ],
      upgrades: ['UPG_BLACK_NAPALM', 'UPG_CHAIN_GUNS'],
      voiceSelect: 'China War Factory ready.',
      description: 'Produces Battlemasters, Gattling/Dragon Tanks, Troop/Assault Crawlers, Inferno Cannons, Overlords, and Nuke Cannons.'
    },
    CHINA_AIRFIELD: {
      id: 'CHINA_AIRFIELD',
      faction: 'CHINA',
      name: 'PLA Airfield',
      shortName: 'AIRFIELD',
      cost: 1000,
      buildTime: 12,
      hp: 1650,
      power: -2,
      size: 84,
      sight: 260,
      trains: ['CHINA_MIG', 'CHINA_NUKE_MIG'],
      upgrades: [],
      voiceSelect: 'PLA Airfield ready for sorties.',
      description: 'Deploys Napalm MiG-1.44 Tactical Fighters and Gen. Tao\'s Tactical Nuke MiGs.'
    },
    CHINA_PROPAGANDA_CENTER: {
      id: 'CHINA_PROPAGANDA_CENTER',
      faction: 'CHINA',
      name: 'Propaganda Center',
      shortName: 'PROPAGANDA',
      cost: 2000,
      buildTime: 17,
      hp: 2400,
      power: -3,
      size: 84,
      sight: 280,
      isTechCenter: true,
      upgrades: ['UPG_SUBLIMINAL_MESSAGING', 'UPG_URANIUM_SHELLS'],
      voiceSelect: 'Propaganda Center broadcasting state directives.',
      description: 'Unlocks Overlord Tanks, Inferno/Nuke Cannons, Hackers, Black Lotus, Internet Center, and Nuclear Silo.'
    },
    CHINA_INTERNET_CENTER: {
      id: 'CHINA_INTERNET_CENTER',
      faction: 'CHINA',
      name: 'Internet Center',
      shortName: 'INTERNET',
      cost: 1800,
      buildTime: 15,
      hp: 1700,
      power: -3,
      size: 74,
      sight: 260,
      requiresTech: true,
      passiveIncome: 55,
      voiceSelect: 'Internet Center satellite link established.',
      description: 'Protected cyber-warfare complex that generates high-speed infinite Hacker income.'
    },
    CHINA_GATTLING_CANNON: {
      id: 'CHINA_GATTLING_CANNON',
      faction: 'CHINA',
      name: 'Gattling Cannon Defense',
      shortName: 'GATTLING',
      cost: 800,
      buildTime: 9,
      hp: 1150,
      power: -3,
      size: 46,
      sight: 290,
      isDefense: true,
      weapon: {
        damage: 16,
        range: 255,
        cooldown: 0.22,
        damageType: 'SMALL_ARMS',
        projectileSpeed: 650,
        projType: 'BULLET',
        antiAir: true
      },
      voiceSelect: 'Gattling Cannon spinning up.',
      description: 'Rapid-fire rotary cannon turret that shreds infantry, light vehicles, and aircraft.'
    },
    CHINA_BUNKER: {
      id: 'CHINA_BUNKER',
      faction: 'CHINA',
      name: 'PLA Fortified Bunker',
      shortName: 'BUNKER',
      cost: 700,
      buildTime: 8,
      hp: 1450,
      power: 0,
      size: 50,
      sight: 270,
      isDefense: true,
      weapon: {
        damage: 34,
        range: 250,
        cooldown: 0.55,
        damageType: 'ARMOR_PIERCING',
        projectileSpeed: 560,
        projType: 'MISSILE',
        antiAir: true
      },
      voiceSelect: 'Fortified Bunker manned and ready.',
      description: 'Reinforced concrete pillbox with integrated anti-tank and anti-infantry firing slits.'
    },
    CHINA_SPEAKER_TOWER: {
      id: 'CHINA_SPEAKER_TOWER',
      faction: 'CHINA',
      name: 'Speaker Tower',
      shortName: 'SPEAKER',
      cost: 500,
      buildTime: 7,
      hp: 800,
      power: -1,
      size: 40,
      sight: 240,
      isPropagandaTower: true,
      auraRadius: 210,
      voiceSelect: 'Broadcasting the voice of the People.',
      description: 'Projects a Propaganda Aura that continuously heals nearby friendly units and boosts fire rate by +25%.'
    },
    CHINA_NUCLEAR_SILO: {
      id: 'CHINA_NUCLEAR_SILO',
      faction: 'CHINA',
      name: 'Nuclear Missile Silo',
      shortName: 'NUKE SILO',
      cost: 5000,
      buildTime: 26,
      hp: 3000,
      power: -8,
      size: 92,
      sight: 300,
      requiresTech: true,
      isSuperweapon: true,
      superweaponType: 'NUCLEAR_MISSILE',
      superweaponCooldown: 165,
      voiceSelect: 'Thermonuclear warhead armed.',
      description: 'China Superweapon. Launches a strategic ICBM that obliterates a wide radius and leaves radioactive fallout.'
    },

    // ================= GLA BUILDINGS =================
    GLA_COMMAND_CENTER: {
      id: 'GLA_COMMAND_CENTER',
      faction: 'GLA',
      name: 'GLA Command Center',
      shortName: 'CMD',
      cost: 2000,
      buildTime: 16,
      hp: 2800,
      power: 0,
      size: 90,
      sight: 300,
      isCommandCenter: true,
      providesRadar: true,
      trains: ['GLA_WORKER'],
      upgrades: [],
      voiceSelect: 'GLA Command Center ready.',
      description: 'Underground-linked command headquarters. Trains GLA Workers. Requires zero power.'
    },
    GLA_SUPPLY_STASH: {
      id: 'GLA_SUPPLY_STASH',
      faction: 'GLA',
      name: 'Supply Stash',
      shortName: 'STASH',
      cost: 1200,
      buildTime: 11,
      hp: 1600,
      power: 0,
      size: 76,
      sight: 220,
      isSupplyDepot: true,
      freeUnit: 'GLA_WORKER',
      trains: ['GLA_WORKER'],
      voiceSelect: 'Supply Stash open for collection.',
      description: 'Drop-off point for harvested supplies. Spawns 1 free GLA Worker and trains additional Workers.'
    },
    GLA_BARRACKS: {
      id: 'GLA_BARRACKS',
      faction: 'GLA',
      name: 'GLA Barracks',
      shortName: 'BARRACKS',
      cost: 500,
      buildTime: 9,
      hp: 1400,
      power: 0,
      size: 72,
      sight: 220,
      trains: ['GLA_REBEL', 'GLA_RPG_TROOPER', 'GLA_TERRORIST', 'GLA_HIJACKER', 'GLA_ANGRY_MOB', 'GLA_JARMEN_KELL'],
      upgrades: ['UPG_ANTHRAX_BETA'],
      voiceSelect: 'GLA fighters ready.',
      description: 'Trains Rebels, RPG Troopers, Demolition Terrorists, Stealthed Hijackers (Kassad), Angry Mobs, and Jarmen Kell.'
    },
    GLA_ARMS_DEALER: {
      id: 'GLA_ARMS_DEALER',
      faction: 'GLA',
      name: 'Arms Dealer',
      shortName: 'ARMS DLR',
      cost: 1800,
      buildTime: 15,
      hp: 2200,
      power: 0,
      size: 88,
      sight: 240,
      trains: [
        'GLA_TECHNICAL', 'GLA_COMBAT_CYCLE', 'GLA_SCORPION', 'GLA_MARAUDER',
        'GLA_QUAD_CANNON', 'GLA_ROCKET_BUGGY', 'GLA_TOXIN_TRACTOR', 'GLA_BOMB_TRUCK', 'GLA_SCUD_LAUNCHER'
      ],
      upgrades: ['UPG_SCORPION_ROCKET', 'UPG_AP_ROCKETS'],
      voiceSelect: 'Arms Dealer open for business.',
      description: 'Supplies Technicals, Combat Cycles (Juhziz), Scorpion/Marauder Tanks, Quad Cannons, Rocket Buggies, Toxin Tractors, Bomb Trucks, and Scud Launchers.'
    },
    GLA_PALACE: {
      id: 'GLA_PALACE',
      faction: 'GLA',
      name: 'GLA Palace',
      shortName: 'PALACE',
      cost: 2200,
      buildTime: 18,
      hp: 3200,
      power: 0,
      size: 86,
      sight: 300,
      isTechCenter: true,
      isDefense: true,
      weapon: {
        damage: 45,
        range: 260,
        cooldown: 0.9,
        damageType: 'ARMOR_PIERCING',
        projectileSpeed: 500,
        projType: 'MISSILE',
        antiAir: true
      },
      upgrades: ['UPG_ARM_THE_MOB', 'UPG_JUNK_REPAIR'],
      voiceSelect: 'The Palace stands strong!',
      description: 'Fortified Tech Center with built-in garrison firing ports. Unlocks Angry Mob, Jarmen Kell, Scud Launcher, Black Market, and Scud Storm.'
    },
    GLA_BLACK_MARKET: {
      id: 'GLA_BLACK_MARKET',
      faction: 'GLA',
      name: 'Black Market',
      shortName: 'BLK MKT',
      cost: 2000,
      buildTime: 16,
      hp: 1800,
      power: 0,
      size: 74,
      sight: 240,
      requiresTech: true,
      passiveIncome: 50,
      voiceSelect: 'Black Market trade routes active.',
      description: 'Smuggles illicit arms and contrabands, generating steady infinite cash ($50 every 2s) and advanced upgrades.'
    },
    GLA_TUNNEL_NETWORK: {
      id: 'GLA_TUNNEL_NETWORK',
      faction: 'GLA',
      name: 'Tunnel Network',
      shortName: 'TUNNEL',
      cost: 700,
      buildTime: 8,
      hp: 1200,
      power: 0,
      size: 52,
      sight: 270,
      isDefense: true,
      isTunnel: true,
      weapon: {
        damage: 20,
        range: 245,
        cooldown: 0.35,
        damageType: 'SMALL_ARMS',
        projectileSpeed: 600,
        projType: 'BULLET',
        antiAir: false
      },
      voiceSelect: 'Tunnel Network entrance secured.',
      description: 'Armed defensive bunker connected to the global GLA subterranean network. Units entering ANY tunnel heal rapidly and can exit from ANY other tunnel on the map!'
    },
    GLA_STINGER_SITE: {
      id: 'GLA_STINGER_SITE',
      faction: 'GLA',
      name: 'Stinger Missile Site',
      shortName: 'STINGER',
      cost: 800,
      buildTime: 9,
      hp: 1150,
      power: 0,
      size: 48,
      sight: 300,
      isDefense: true,
      weapon: {
        damage: 58,
        range: 285,
        cooldown: 1.25,
        damageType: 'ARMOR_PIERCING',
        projectileSpeed: 540,
        projType: 'MISSILE',
        splash: 15,
        antiAir: true
      },
      voiceSelect: 'Stinger Site watching the horizon.',
      description: 'Concealed anti-tank and anti-aircraft guided missile emplacement.'
    },
    GLA_SCUD_STORM: {
      id: 'GLA_SCUD_STORM',
      faction: 'GLA',
      name: 'Scud Storm',
      shortName: 'SCUD STORM',
      cost: 5000,
      buildTime: 26,
      hp: 2800,
      power: 0,
      size: 92,
      sight: 300,
      requiresTech: true,
      isSuperweapon: true,
      superweaponType: 'SCUD_STORM',
      superweaponCooldown: 155,
      voiceSelect: 'Scud Storm launchers elevated!',
      description: 'GLA Superweapon. Fires a salvo of 9 high-explosive Anthrax-tipped Scud ballistic missiles that saturate target coordinates.'
    }
  };

  // Unit Registry (with Phase 2 Locomotors, Sub-General Exclusives & Active Abilities)
  const UNITS = {
    // ================= USA UNITS =================
    USA_DOZER: {
      id: 'USA_DOZER',
      faction: 'USA',
      name: 'US Construction Dozer',
      shortName: 'DOZER',
      category: 'LIGHT_VEHICLE',
      locomotor: 'TRACKED',
      cost: 800,
      buildTime: 7,
      hp: 450,
      speed: 78,
      radius: 16,
      sight: 210,
      isBuilder: true,
      builds: [
        'USA_REACTOR', 'USA_SUPPLY_CENTER', 'USA_BARRACKS', 'USA_WAR_FACTORY',
        'USA_AIRFIELD', 'USA_STRATEGY_CENTER', 'USA_SUPPLY_DROP_ZONE',
        'USA_PATRIOT', 'USA_PARTICLE_CANNON'
      ],
      voiceSelect: 'Always prepared.',
      voiceMove: 'Heading out to the site.',
      description: 'Constructs and repairs US base structures at any valid map location.'
    },
    USA_CHINOOK: {
      id: 'USA_CHINOOK',
      faction: 'USA',
      name: 'Chinook Supply Helicopter',
      shortName: 'CHINOOK',
      category: 'AIRCRAFT',
      locomotor: 'HELICOPTER',
      cost: 1000,
      buildTime: 9,
      hp: 420,
      speed: 145,
      radius: 18,
      sight: 220,
      isHarvester: true,
      isAir: true,
      carryCap: 600,
      voiceSelect: 'Chinook in the air.',
      voiceMove: 'Supply run underway.',
      description: 'Heavy twin-rotor transport that flies directly over terrain obstacles to harvest $600 per trip.'
    },
    USA_RANGER: {
      id: 'USA_RANGER',
      faction: 'USA',
      name: 'US Ranger',
      shortName: 'RANGER',
      category: 'INFANTRY',
      locomotor: 'INFANTRY',
      cost: 225,
      buildTime: 4,
      hp: 180,
      speed: 68,
      radius: 9,
      sight: 210,
      canCapture: true,
      ability: {
        id: 'FLASHBANG',
        name: 'Flashbang Clear [F]',
        icon: '💥',
        cooldown: 10,
        range: 175,
        desc: 'Lobs a concussive Flashbang grenade that instantly clears enemy Garrison Bunkers and stuns infantry.'
      },
      weapon: {
        damage: 18,
        range: 165,
        cooldown: 0.45,
        damageType: 'SMALL_ARMS',
        projectileSpeed: 560,
        projType: 'BULLET',
        antiAir: false
      },
      voiceSelect: 'Rangers lead the way!',
      voiceMove: 'Moving out, sir!',
      description: 'Versatile assault infantry armed with assault rifles, structure capture training, and Flashbang Garrison-Clearing grenades [F].'
    },
    USA_MISSILE_DEFENDER: {
      id: 'USA_MISSILE_DEFENDER',
      faction: 'USA',
      name: 'Missile Defender',
      shortName: 'MSL DEF',
      category: 'INFANTRY',
      locomotor: 'INFANTRY',
      cost: 300,
      buildTime: 5,
      hp: 160,
      speed: 64,
      radius: 9,
      sight: 230,
      ability: {
        id: 'LASER_LOCK',
        name: 'Laser-Lock Salvo [F]',
        icon: '🎯',
        cooldown: 14,
        range: 245,
        desc: 'Paints target armor or aircraft with a laser designator, unleashing a rapid-fire 3x guided missile salvo!'
      },
      weapon: {
        damage: 48,
        range: 215,
        cooldown: 1.25,
        damageType: 'ARMOR_PIERCING',
        projectileSpeed: 480,
        projType: 'MISSILE',
        antiAir: true
      },
      voiceSelect: 'Got my missile launcher right here.',
      voiceMove: 'Watch for enemy armor!',
      description: 'Anti-tank and anti-air specialist equipped with a Laser-Lock [F] rapid-fire rocket launcher.'
    },
    USA_PATHFINDER: {
      id: 'USA_PATHFINDER',
      faction: 'USA',
      name: 'Pathfinder Sniper',
      shortName: 'PATHFDR',
      category: 'INFANTRY',
      locomotor: 'CLIFF_CLIMBER',
      cost: 600,
      buildTime: 7,
      hp: 200,
      speed: 74,
      radius: 9,
      sight: 300,
      requiresTech: true,
      stealthedWhenStill: true,
      weapon: {
        damage: 140,
        range: 295,
        cooldown: 1.35,
        damageType: 'SNIPER',
        projectileSpeed: 900,
        projType: 'SNIPER',
        antiAir: false
      },
      voiceSelect: 'Pathfinder in position.',
      voiceMove: 'Silent and deadly.',
      description: 'Elite cliff-climbing marksman that eliminates enemy infantry in a single shot.'
    },
    USA_HUMVEE: {
      id: 'USA_HUMVEE',
      faction: 'USA',
      name: 'Humvee Scout Vehicle',
      shortName: 'HUMVEE',
      category: 'LIGHT_VEHICLE',
      locomotor: 'WHEELED',
      cost: 700,
      buildTime: 7,
      hp: 380,
      speed: 122,
      radius: 15,
      sight: 250,
      weapon: {
        damage: 22,
        range: 195,
        cooldown: 0.35,
        damageType: 'SMALL_ARMS',
        projectileSpeed: 600,
        projType: 'BULLET',
        antiAir: true
      },
      voiceSelect: 'Humvee here.',
      voiceMove: 'Step on it!',
      description: 'Fast wheeled attack vehicle armed with a .50 cal machine gun and upgradable TOW missile launcher.'
    },
    USA_CRUSADER: {
      id: 'USA_CRUSADER',
      faction: 'USA',
      name: 'Crusader Tank',
      shortName: 'CRUSADER',
      category: 'TANK',
      locomotor: 'TRACKED',
      cost: 900,
      buildTime: 9,
      hp: 680,
      speed: 84,
      radius: 18,
      sight: 240,
      weapon: {
        damage: 72,
        range: 215,
        cooldown: 1.45,
        damageType: 'ARMOR_PIERCING',
        projectileSpeed: 540,
        projType: 'SHELL',
        antiAir: false
      },
      voiceSelect: 'Crusader Tank responding.',
      voiceMove: 'Rolling out!',
      description: 'Standard US main battle tank with heavy composite armor and 120mm smoothbore cannon.'
    },
    USA_LASER_CRUSADER: {
      id: 'USA_LASER_CRUSADER',
      faction: 'USA',
      name: 'Laser Crusader Tank',
      shortName: 'LSR CRUS',
      category: 'TANK',
      locomotor: 'TRACKED',
      cost: 950,
      buildTime: 9,
      hp: 740,
      speed: 88,
      radius: 18,
      sight: 255,
      generalOnly: 'USA_TOWNES',
      subGeneralExclusive: 'USA_TOWNES',
      hasPointDefenseLaser: true,
      pdlCooldown: 1.6,
      weapon: {
        damage: 96,
        range: 235,
        cooldown: 1.15,
        damageType: 'ARMOR_PIERCING',
        projectileSpeed: 999,
        projType: 'LASER',
        antiAir: false
      },
      voiceSelect: 'Laser Crusader charged and ready.',
      voiceMove: 'Focusing twin beam emitters.',
      description: 'Gen. Townes Exclusive. Directed-energy main battle tank with continuous ruby laser beams and Point-Defense Laser.'
    },
    USA_PALADIN: {
      id: 'USA_PALADIN',
      faction: 'USA',
      name: 'Paladin Tank',
      shortName: 'PALADIN',
      category: 'TANK',
      locomotor: 'TRACKED',
      cost: 1100,
      buildTime: 11,
      hp: 820,
      speed: 82,
      radius: 19,
      sight: 255,
      requiresTech: true,
      hasPointDefenseLaser: true,
      pdlCooldown: 1.8,
      weapon: {
        damage: 88,
        range: 225,
        cooldown: 1.4,
        damageType: 'ARMOR_PIERCING',
        projectileSpeed: 560,
        projType: 'SHELL',
        antiAir: false
      },
      voiceSelect: 'Paladin Tank in the field.',
      voiceMove: 'Noble cause.',
      description: 'Advanced battle tank featuring an autonomous Point-Defense Laser (PDL) that intercepts enemy missiles.'
    },
    USA_LASER_TANK: {
      id: 'USA_LASER_TANK',
      faction: 'USA',
      name: 'Townes Laser Tank',
      shortName: 'LASER TNK',
      category: 'TANK',
      locomotor: 'TRACKED',
      cost: 1050,
      buildTime: 10,
      hp: 760,
      speed: 88,
      radius: 18,
      sight: 260,
      generalOnly: 'USA_TOWNES',
      subGeneralExclusive: 'USA_TOWNES',
      hasPointDefenseLaser: true,
      pdlCooldown: 1.5,
      weapon: {
        damage: 98,
        range: 240,
        cooldown: 1.2,
        damageType: 'ARMOR_PIERCING',
        projectileSpeed: 999,
        projType: 'LASER',
        antiAir: false
      },
      voiceSelect: 'Laser capacitor charged.',
      voiceMove: 'Focusing emitter.',
      description: 'General Townes\' signature directed-energy tank. Fires instantaneous high-intensity laser beams.'
    },
    USA_AVENGER: {
      id: 'USA_AVENGER',
      faction: 'USA',
      name: 'Avenger Laser Air-Defense',
      shortName: 'AVENGER',
      category: 'LIGHT_VEHICLE',
      locomotor: 'WHEELED',
      cost: 1500,
      buildTime: 12,
      hp: 520,
      speed: 96,
      radius: 17,
      sight: 290,
      requiresTech: true,
      hasPointDefenseLaser: true,
      pdlCooldown: 0.75,
      weapon: {
        damage: 65,
        range: 280,
        cooldown: 0.85,
        damageType: 'ARMOR_PIERCING',
        projectileSpeed: 999,
        projType: 'LASER',
        antiAir: true
      },
      voiceSelect: 'Avenger laser defense online.',
      voiceMove: 'Scanning the skies.',
      description: 'High-tech laser air-defense and missile-interception support vehicle with ultra-fast dual Point-Defense Lasers.'
    },
    USA_TOMAHAWK: {
      id: 'USA_TOMAHAWK',
      faction: 'USA',
      name: 'Tomahawk Launcher',
      shortName: 'TOMAHAWK',
      category: 'LIGHT_VEHICLE',
      locomotor: 'WHEELED',
      cost: 1200,
      buildTime: 12,
      hp: 360,
      speed: 72,
      radius: 18,
      sight: 280,
      requiresTech: true,
      isArtillery: true,
      weapon: {
        damage: 145,
        range: 390,
        cooldown: 3.1,
        damageType: 'HIGH_EXPLOSIVE',
        projectileSpeed: 390,
        projType: 'MISSILE',
        splash: 42,
        antiAir: false
      },
      voiceSelect: 'Tomahawk system online.',
      voiceMove: 'Positioning launcher.',
      description: 'Long-range cruise missile artillery devastating against enemy base defenses and structures.'
    },
    USA_RAPTOR: {
      id: 'USA_RAPTOR',
      faction: 'USA',
      name: 'F-22 Raptor Jet Fighter',
      shortName: 'RAPTOR',
      category: 'AIRCRAFT',
      locomotor: 'AIRCRAFT',
      cost: 1400,
      buildTime: 12,
      hp: 440,
      speed: 178,
      radius: 17,
      sight: 290,
      isAir: true,
      weapon: {
        damage: 95,
        range: 265,
        cooldown: 1.55,
        damageType: 'ARMOR_PIERCING',
        projectileSpeed: 640,
        projType: 'MISSILE',
        splash: 24,
        antiAir: true
      },
      voiceSelect: 'Raptor here.',
      voiceMove: 'Supersonic intercept!',
      description: 'Air-superiority jet fighter armed with precision Maverick air-to-ground and air-to-air missiles.'
    },
    USA_KING_RAPTOR: {
      id: 'USA_KING_RAPTOR',
      faction: 'USA',
      name: 'King Raptor Fighter',
      shortName: 'KING RPT',
      category: 'AIRCRAFT',
      locomotor: 'AIRCRAFT',
      cost: 1350,
      buildTime: 11,
      hp: 580,
      speed: 188,
      radius: 18,
      sight: 310,
      isAir: true,
      generalOnly: 'USA_GRANGER',
      subGeneralExclusive: 'USA_GRANGER',
      hasPointDefenseLaser: true,
      pdlCooldown: 1.2,
      weapon: {
        damage: 135,
        range: 280,
        cooldown: 1.35,
        damageType: 'ARMOR_PIERCING',
        projectileSpeed: 680,
        projType: 'MISSILE',
        splash: 30,
        antiAir: true
      },
      voiceSelect: 'King Raptor ready for takeoff.',
      voiceMove: 'We own the skies!',
      description: 'Gen. Granger Exclusive. Advanced twin-delta strike fighter carrying 50% more missiles and onboard Point-Defense Lasers.'
    },
    USA_COMANCHE: {
      id: 'USA_COMANCHE',
      faction: 'USA',
      name: 'Comanche Gunship',
      shortName: 'COMANCHE',
      category: 'AIRCRAFT',
      locomotor: 'HELICOPTER',
      cost: 1200,
      buildTime: 11,
      hp: 460,
      speed: 148,
      radius: 17,
      sight: 280,
      isAir: true,
      isHelicopter: true,
      weapon: {
        damage: 46,
        range: 235,
        cooldown: 0.85,
        damageType: 'ARMOR_PIERCING',
        projectileSpeed: 540,
        projType: 'MISSILE',
        splash: 20,
        antiAir: true
      },
      voiceSelect: 'Comanche waiting for orders.',
      voiceMove: 'Low and fast!',
      description: 'Agile attack helicopter armed with a 20mm Vulcan cannon and Hellfire anti-tank rockets.'
    },
    USA_COMBAT_CHINOOK: {
      id: 'USA_COMBAT_CHINOOK',
      faction: 'USA',
      name: 'Combat Chinook Gunship',
      shortName: 'CMBT CHNK',
      category: 'AIRCRAFT',
      locomotor: 'HELICOPTER',
      cost: 1500,
      buildTime: 13,
      hp: 760,
      speed: 142,
      radius: 20,
      sight: 285,
      isAir: true,
      isHelicopter: true,
      generalOnly: 'USA_GRANGER',
      subGeneralExclusive: 'USA_GRANGER',
      hasPointDefenseLaser: true,
      pdlCooldown: 1.4,
      weapon: {
        damage: 58,
        range: 245,
        cooldown: 0.55,
        damageType: 'ARMOR_PIERCING',
        projectileSpeed: 580,
        projType: 'MISSILE',
        splash: 22,
        antiAir: true
      },
      voiceSelect: 'Combat Chinook locked and loaded!',
      voiceMove: 'Bringing the rain!',
      description: 'Gen. Granger Exclusive. Heavily armed assault transport gunship bristling with side-port miniguns, TOW launchers, and PDL.'
    },
    USA_AURORA: {
      id: 'USA_AURORA',
      faction: 'USA',
      name: 'Aurora Strike Bomber',
      shortName: 'AURORA',
      category: 'AIRCRAFT',
      locomotor: 'AIRCRAFT',
      cost: 2000,
      buildTime: 15,
      hp: 520,
      speed: 195,
      radius: 19,
      sight: 300,
      isAir: true,
      requiresTech: true,
      weapon: {
        damage: 240,
        range: 250,
        cooldown: 3.8,
        damageType: 'HIGH_EXPLOSIVE',
        projectileSpeed: 640,
        projType: 'MISSILE',
        splash: 60,
        antiAir: false
      },
      voiceSelect: 'Hypersonic Aurora ready.',
      voiceMove: 'Breaking Mach 5!',
      description: 'Supersonic strategic strike aircraft delivering high-yield concussion bombs.'
    },
    USA_AURORA_ALPHA: {
      id: 'USA_AURORA_ALPHA',
      faction: 'USA',
      name: 'Aurora Alpha Fuel-Air Bomber',
      shortName: 'ALPHA BOM',
      category: 'AIRCRAFT',
      locomotor: 'AIRCRAFT',
      cost: 2000,
      buildTime: 15,
      hp: 580,
      speed: 205,
      radius: 19,
      sight: 310,
      isAir: true,
      requiresTech: true,
      generalOnly: 'USA_ALEXANDER',
      subGeneralExclusive: 'USA_ALEXANDER',
      weapon: {
        damage: 340,
        range: 265,
        cooldown: 3.8,
        damageType: 'HIGH_EXPLOSIVE',
        projectileSpeed: 680,
        projType: 'MISSILE',
        splash: 85,
        antiAir: false
      },
      voiceSelect: 'Aurora Alpha thermobaric payload armed.',
      voiceMove: 'Hypersonic approach vector locked!',
      description: 'Gen. Alexander Exclusive. Hypersonic bomber armed with tactical Fuel-Air Explosives (MOAB mini-nukes).'
    },

    // ================= CHINA UNITS =================
    CHINA_DOZER: {
      id: 'CHINA_DOZER',
      faction: 'CHINA',
      name: 'PLA Construction Dozer',
      shortName: 'DOZER',
      category: 'LIGHT_VEHICLE',
      locomotor: 'TRACKED',
      cost: 800,
      buildTime: 7,
      hp: 480,
      speed: 75,
      radius: 16,
      sight: 210,
      isBuilder: true,
      builds: [
        'CHINA_REACTOR', 'CHINA_SUPPLY_CENTER', 'CHINA_BARRACKS', 'CHINA_WAR_FACTORY',
        'CHINA_AIRFIELD', 'CHINA_PROPAGANDA_CENTER', 'CHINA_INTERNET_CENTER',
        'CHINA_BUNKER', 'CHINA_GATTLING_CANNON', 'CHINA_SPEAKER_TOWER', 'CHINA_NUCLEAR_SILO'
      ],
      voiceSelect: 'I build for China!',
      voiceMove: 'China will grow larger!',
      description: 'Constructs and repairs PLA structures across the battlefield.'
    },
    CHINA_SUPPLY_TRUCK: {
      id: 'CHINA_SUPPLY_TRUCK',
      faction: 'CHINA',
      name: 'Supply Truck',
      shortName: 'TRUCK',
      category: 'LIGHT_VEHICLE',
      locomotor: 'WHEELED',
      cost: 600,
      buildTime: 6,
      hp: 380,
      speed: 98,
      radius: 15,
      sight: 200,
      isHarvester: true,
      carryCap: 350,
      voiceSelect: 'Supply Truck ready.',
      voiceMove: 'Fetching supplies for the People.',
      description: 'Ground transport that shuttles $350 of supplies per trip between a Supply Dock and Supply Center.'
    },
    CHINA_RED_GUARD: {
      id: 'CHINA_RED_GUARD',
      faction: 'CHINA',
      name: 'Red Guard Squad',
      shortName: 'RED GUARD',
      category: 'INFANTRY',
      locomotor: 'INFANTRY',
      cost: 300,
      buildTime: 4,
      hp: 210,
      speed: 66,
      radius: 9,
      sight: 210,
      spawnCount: 2,
      hasHordeBonus: true,
      canCapture: true,
      weapon: {
        damage: 16,
        range: 165,
        cooldown: 0.48,
        damageType: 'SMALL_ARMS',
        projectileSpeed: 550,
        projType: 'BULLET',
        antiAir: false
      },
      voiceSelect: 'Serving China\'s need!',
      voiceMove: 'For the Red Army!',
      description: 'Trained in pairs (2 units per order)! Gains the +25% Horde fire-rate bonus when grouped in 5+.'
    },
    CHINA_MINIGUNNER: {
      id: 'CHINA_MINIGUNNER',
      faction: 'CHINA',
      name: 'Elite Mini-Gunner',
      shortName: 'MINIGUNR',
      category: 'INFANTRY',
      locomotor: 'INFANTRY',
      cost: 350,
      buildTime: 4,
      hp: 250,
      speed: 70,
      radius: 9,
      sight: 235,
      generalOnly: 'CHINA_SHIN_FAI',
      subGeneralExclusive: 'CHINA_SHIN_FAI',
      hasHordeBonus: true,
      canCapture: true,
      weapon: {
        damage: 15,
        range: 205,
        cooldown: 0.18,
        damageType: 'SMALL_ARMS',
        projectileSpeed: 640,
        projType: 'BULLET',
        antiAir: true
      },
      voiceSelect: 'Mini-Gunner reporting for duty!',
      voiceMove: 'Spinning up chain gun!',
      description: 'Gen. Shin Fai Exclusive. Elite infantry carrying a portable rotary Gattling cannon effective against ground and air targets.'
    },
    CHINA_TANK_HUNTER: {
      id: 'CHINA_TANK_HUNTER',
      faction: 'CHINA',
      name: 'Tank Hunter',
      shortName: 'TNK HNTR',
      category: 'INFANTRY',
      locomotor: 'INFANTRY',
      cost: 300,
      buildTime: 5,
      hp: 170,
      speed: 62,
      radius: 9,
      sight: 225,
      hasHordeBonus: true,
      weapon: {
        damage: 46,
        range: 205,
        cooldown: 1.25,
        damageType: 'ARMOR_PIERCING',
        projectileSpeed: 470,
        projType: 'MISSILE',
        antiAir: true
      },
      voiceSelect: 'Where are the enemy tanks?',
      voiceMove: 'Moving to ambush position.',
      description: 'Anti-armor/anti-air infantry that benefits from the Nationalism Horde bonus.'
    },
    CHINA_HACKER: {
      id: 'CHINA_HACKER',
      faction: 'CHINA',
      name: 'PLA Cyber Hacker',
      shortName: 'HACKER',
      category: 'INFANTRY',
      locomotor: 'INFANTRY',
      cost: 625,
      buildTime: 7,
      hp: 150,
      speed: 64,
      radius: 9,
      sight: 210,
      requiresTech: true,
      isHacker: true,
      passiveHackIncome: 12,
      voiceSelect: 'Laptop in hand.',
      voiceMove: 'Setting up proxy connection.',
      description: 'Field cyber-operative. Automatically siphons infinite cash from the global network when stationary!'
    },
    CHINA_BLACK_LOTUS: {
      id: 'CHINA_BLACK_LOTUS',
      faction: 'CHINA',
      name: 'Black Lotus (Cyber Hero)',
      shortName: 'BLK LOTUS',
      category: 'INFANTRY',
      locomotor: 'CLIFF_CLIMBER',
      cost: 1500,
      buildTime: 13,
      hp: 340,
      speed: 84,
      radius: 10,
      sight: 300,
      requiresTech: true,
      isHero: true,
      stealthed: true,
      canCapture: true,
      isHacker: true,
      passiveHackIncome: 28,
      voiceSelect: 'Black Lotus online.',
      voiceMove: 'Bypassing their firewall.',
      description: 'Stealthed cyber-commando hero. Rapidly captures tech buildings and siphons $28 every 2 seconds.'
    },
    CHINA_BATTLEMASTER: {
      id: 'CHINA_BATTLEMASTER',
      faction: 'CHINA',
      name: 'Battlemaster Tank',
      shortName: 'BTLMASTR',
      category: 'TANK',
      locomotor: 'TRACKED',
      cost: 800,
      buildTime: 8,
      hp: 650,
      speed: 82,
      radius: 18,
      sight: 235,
      hasHordeBonus: true,
      weapon: {
        damage: 68,
        range: 210,
        cooldown: 1.45,
        damageType: 'ARMOR_PIERCING',
        projectileSpeed: 530,
        projType: 'SHELL',
        antiAir: false
      },
      voiceSelect: 'Battlemaster reporting.',
      voiceMove: 'Nothing can stop us!',
      description: 'Workhorse main battle tank. Gains the Nationalism Horde fire-rate bonus when massed in groups of 5+.'
    },
    CHINA_GATTLING_TANK: {
      id: 'CHINA_GATTLING_TANK',
      faction: 'CHINA',
      name: 'Gattling Tank',
      shortName: 'GATTLING',
      category: 'LIGHT_VEHICLE',
      locomotor: 'TRACKED',
      cost: 800,
      buildTime: 8,
      hp: 500,
      speed: 94,
      radius: 17,
      sight: 255,
      hasHordeBonus: true,
      weapon: {
        damage: 15,
        range: 235,
        cooldown: 0.20,
        damageType: 'SMALL_ARMS',
        projectileSpeed: 640,
        projType: 'BULLET',
        antiAir: true
      },
      voiceSelect: 'Gattling Tank ready for action!',
      voiceMove: 'Barrels spinning!',
      description: 'Mobile dual-rotary cannon vehicle that shreds infantry, light vehicles, and enemy aircraft.'
    },
    CHINA_DRAGON_TANK: {
      id: 'CHINA_DRAGON_TANK',
      faction: 'CHINA',
      name: 'Dragon Flame Tank',
      shortName: 'DRAGON',
      category: 'TANK',
      locomotor: 'TRACKED',
      cost: 800,
      buildTime: 8,
      hp: 580,
      speed: 84,
      radius: 17,
      sight: 220,
      ability: {
        id: 'FLAME_WALL',
        name: 'Firestorm Flame Wall [F]',
        icon: '🔥',
        cooldown: 18,
        range: 155,
        desc: 'Unleashes a 360-degree Firestorm wall of napalm that incinerates nearby enemies and clears garrisons!'
      },
      weapon: {
        damage: 38,
        range: 155,
        cooldown: 0.40,
        damageType: 'FLAME_TOXIN',
        projectileSpeed: 360,
        projType: 'FLAME',
        splash: 32,
        clearsGarrison: true,
        antiAir: false
      },
      voiceSelect: 'Dragon Tank!',
      voiceMove: 'It is very hot in here!',
      description: 'Sprays torrents of napalm fire (clears garrisons!) and can trigger a Firestorm Flame Wall [F].'
    },
    CHINA_TROOP_CRAWLER: {
      id: 'CHINA_TROOP_CRAWLER',
      faction: 'CHINA',
      name: 'Troop Crawler APC',
      shortName: 'CRAWLER',
      category: 'LIGHT_VEHICLE',
      locomotor: 'WHEELED',
      cost: 1400,
      buildTime: 11,
      hp: 720,
      speed: 88,
      radius: 20,
      sight: 270,
      detectsStealth: true,
      weapon: {
        damage: 26,
        range: 195,
        cooldown: 0.36,
        damageType: 'SMALL_ARMS',
        projectileSpeed: 580,
        projType: 'BULLET',
        antiAir: false
      },
      voiceSelect: 'Troop Crawler ready.',
      voiceMove: 'Transporting infantry squad!',
      description: 'Armored personnel carrier with infantry firing ports and stealth detection radar.'
    },
    CHINA_ASSAULT_CRAWLER: {
      id: 'CHINA_ASSAULT_CRAWLER',
      faction: 'CHINA',
      name: 'Assault Troop Crawler',
      shortName: 'ASLT CRWL',
      category: 'TANK',
      locomotor: 'WHEELED',
      cost: 1600,
      buildTime: 12,
      hp: 980,
      speed: 94,
      radius: 21,
      sight: 290,
      generalOnly: 'CHINA_SHIN_FAI',
      subGeneralExclusive: 'CHINA_SHIN_FAI',
      isPropagandaCarrier: true,
      auraRadius: 190,
      detectsStealth: true,
      weapon: {
        damage: 42,
        range: 225,
        cooldown: 0.22,
        damageType: 'SMALL_ARMS',
        projectileSpeed: 640,
        projType: 'BULLET',
        antiAir: true
      },
      voiceSelect: 'Assault Troop Crawler armed with Mini-Gunners!',
      voiceMove: 'Rolling bunker advancing!',
      description: 'Gen. Shin Fai Exclusive. Super-fortified mobile bunker pre-loaded with Elite Mini-Gunners and a Propaganda Speaker aura.'
    },
    CHINA_INFERNO_CANNON: {
      id: 'CHINA_INFERNO_CANNON',
      faction: 'CHINA',
      name: 'Inferno Cannon Artillery',
      shortName: 'INFERNO',
      category: 'LIGHT_VEHICLE',
      locomotor: 'TRACKED',
      cost: 900,
      buildTime: 10,
      hp: 420,
      speed: 72,
      radius: 18,
      sight: 260,
      requiresTech: true,
      isArtillery: true,
      weapon: {
        damage: 115,
        range: 365,
        cooldown: 2.8,
        damageType: 'FLAME_TOXIN',
        projectileSpeed: 370,
        projType: 'SHELL',
        splash: 54,
        clearsGarrison: true,
        antiAir: false
      },
      voiceSelect: 'Inferno Cannon ready to ignite.',
      voiceMove: 'Setting napalm trajectory.',
      description: 'Long-range napalm artillery that hurls incendiary shells creating firestorms and clearing garrisons.'
    },
    CHINA_OVERLORD: {
      id: 'CHINA_OVERLORD',
      faction: 'CHINA',
      name: 'Overlord Super-Heavy Tank',
      shortName: 'OVERLORD',
      category: 'TANK',
      locomotor: 'TRACKED',
      cost: 2000,
      buildTime: 16,
      hp: 1650,
      speed: 62,
      radius: 25,
      sight: 265,
      requiresTech: true,
      isPropagandaCarrier: true,
      auraRadius: 185,
      ability: {
        id: 'OVERLORD_SPEAKER',
        name: 'Propaganda Surge [F]',
        icon: '📢',
        cooldown: 20,
        range: 200,
        desc: 'Broadcasts an intense Propaganda Surge that immediately repairs +200 HP to this Overlord and nearby friendly units!'
      },
      weapon: {
        damage: 145,
        range: 245,
        cooldown: 1.75,
        damageType: 'ARMOR_PIERCING',
        projectileSpeed: 560,
        projType: 'SHELL',
        splash: 24,
        antiAir: true
      },
      voiceSelect: 'Overlord is waiting.',
      voiceMove: 'I am big.',
      description: 'Colossal twin-barreled behemoth equipped with a Propaganda Speaker Tower & Gattling defense.'
    },
    CHINA_EMPEROR_OVERLORD: {
      id: 'CHINA_EMPEROR_OVERLORD',
      faction: 'CHINA',
      name: 'Emperor Overlord Tank',
      shortName: 'EMPEROR',
      category: 'TANK',
      locomotor: 'TRACKED',
      cost: 2000,
      buildTime: 16,
      hp: 1950,
      speed: 68,
      radius: 26,
      sight: 280,
      requiresTech: true,
      generalOnly: 'CHINA_KWAI',
      subGeneralExclusive: 'CHINA_KWAI',
      isPropagandaCarrier: true,
      auraRadius: 230,
      ability: {
        id: 'OVERLORD_GATLING',
        name: 'Emperor Overdrive [F]',
        icon: '🛡️',
        cooldown: 18,
        range: 230,
        desc: 'Activates Emperor Overdrive, repairing +260 HP to nearby tanks and firing an immediate rotary Gattling barrage!'
      },
      weapon: {
        damage: 175,
        range: 255,
        cooldown: 1.55,
        damageType: 'ARMOR_PIERCING',
        projectileSpeed: 590,
        projType: 'SHELL',
        splash: 28,
        antiAir: true
      },
      voiceSelect: 'Emperor Overlord commands the battlefield!',
      voiceMove: 'Crush them beneath our treads!',
      description: 'Gen. Kwai Exclusive. Supreme heavy tank pre-equipped with a high-output Speaker Tower AND top-mounted Gattling Cannon.'
    },
    CHINA_NUKE_CANNON: {
      id: 'CHINA_NUKE_CANNON',
      faction: 'CHINA',
      name: 'Nuke Cannon Artillery',
      shortName: 'NUKE CNN',
      category: 'TANK',
      locomotor: 'TRACKED',
      cost: 1600,
      buildTime: 14,
      hp: 480,
      speed: 58,
      radius: 21,
      sight: 280,
      requiresTech: true,
      isArtillery: true,
      weapon: {
        damage: 210,
        range: 410,
        cooldown: 4.5,
        damageType: 'HIGH_EXPLOSIVE',
        projectileSpeed: 340,
        projType: 'NUKE_SHELL',
        splash: 72,
        leavesHazard: 'RADIATION',
        antiAir: false
      },
      voiceSelect: 'China\'s nuclear artillery.',
      voiceMove: 'Moving heavy ordnance.',
      description: 'Long-range siege artillery that lobs tactical nuclear shells leaving lethal radioactive fallout.'
    },
    CHINA_MIG: {
      id: 'CHINA_MIG',
      faction: 'CHINA',
      name: 'MiG-1.44 Napalm Fighter',
      shortName: 'MIG-1.44',
      category: 'AIRCRAFT',
      locomotor: 'AIRCRAFT',
      cost: 1200,
      buildTime: 11,
      hp: 440,
      speed: 182,
      radius: 17,
      sight: 285,
      isAir: true,
      weapon: {
        damage: 105,
        range: 260,
        cooldown: 1.8,
        damageType: 'FLAME_TOXIN',
        projectileSpeed: 640,
        projType: 'MISSILE',
        splash: 42,
        clearsGarrison: true,
        antiAir: true
      },
      voiceSelect: 'MiG in flight.',
      voiceMove: 'Tactical fighter reporting.',
      description: 'Agile delta-wing jet fighter firing incendiary napalm missiles that create firestorms.'
    },
    CHINA_NUKE_MIG: {
      id: 'CHINA_NUKE_MIG',
      faction: 'CHINA',
      name: 'Tactical Nuke MiG',
      shortName: 'NUKE MIG',
      category: 'AIRCRAFT',
      locomotor: 'AIRCRAFT',
      cost: 1550,
      buildTime: 13,
      hp: 500,
      speed: 192,
      radius: 18,
      sight: 300,
      isAir: true,
      generalOnly: 'CHINA_TAO',
      subGeneralExclusive: 'CHINA_TAO',
      weapon: {
        damage: 175,
        range: 275,
        cooldown: 2.2,
        damageType: 'HIGH_EXPLOSIVE',
        projectileSpeed: 660,
        projType: 'NUKE_SHELL',
        splash: 62,
        leavesHazard: 'RADIATION',
        antiAir: true
      },
      voiceSelect: 'Nuclear MiG airborne!',
      voiceMove: 'Delivering tactical atomic payload!',
      description: 'Gen. Tao Exclusive. Supersonic strike fighter armed with tactical nuclear-tipped missiles that scatter enemy columns.'
    },

    // ================= GLA UNITS =================
    GLA_WORKER: {
      id: 'GLA_WORKER',
      faction: 'GLA',
      name: 'GLA Worker',
      shortName: 'WORKER',
      category: 'INFANTRY',
      locomotor: 'INFANTRY',
      cost: 200,
      buildTime: 4,
      hp: 150,
      speed: 74,
      radius: 9,
      sight: 195,
      isBuilder: true,
      isHarvester: true,
      carryCap: 160,
      builds: [
        'GLA_SUPPLY_STASH', 'GLA_BARRACKS', 'GLA_ARMS_DEALER',
        'GLA_PALACE', 'GLA_BLACK_MARKET', 'GLA_TUNNEL_NETWORK',
        'GLA_STINGER_SITE', 'GLA_SCUD_STORM'
      ],
      voiceSelect: 'Cannot we live in peace?',
      voiceMove: 'Thank you for the new shoes!',
      description: 'Dual-role laborer that both constructs GLA buildings AND harvests supplies from Supply Docks.'
    },
    GLA_REBEL: {
      id: 'GLA_REBEL',
      faction: 'GLA',
      name: 'GLA Rebel Fighter',
      shortName: 'REBEL',
      category: 'INFANTRY',
      locomotor: 'INFANTRY',
      cost: 150,
      buildTime: 3,
      hp: 170,
      speed: 70,
      radius: 9,
      sight: 210,
      canCapture: true,
      weapon: {
        damage: 16,
        range: 165,
        cooldown: 0.45,
        damageType: 'SMALL_ARMS',
        projectileSpeed: 540,
        projType: 'BULLET',
        antiAir: false
      },
      voiceSelect: 'The higher order shall reign!',
      voiceMove: 'We fight for the cause!',
      description: 'Inexpensive guerrilla fighter. Fires toxin-tipped rounds when commanded by Dr. Thrax.'
    },
    GLA_RPG_TROOPER: {
      id: 'GLA_RPG_TROOPER',
      faction: 'GLA',
      name: 'RPG Trooper',
      shortName: 'RPG TRP',
      category: 'INFANTRY',
      locomotor: 'INFANTRY',
      cost: 300,
      buildTime: 5,
      hp: 175,
      speed: 65,
      radius: 9,
      sight: 225,
      weapon: {
        damage: 46,
        range: 210,
        cooldown: 1.2,
        damageType: 'ARMOR_PIERCING',
        projectileSpeed: 480,
        projType: 'MISSILE',
        antiAir: true
      },
      voiceSelect: 'RPG Trooper ready.',
      voiceMove: 'Looking for armor!',
      description: 'Anti-tank and anti-aircraft rocket infantry.'
    },
    GLA_TERRORIST: {
      id: 'GLA_TERRORIST',
      faction: 'GLA',
      name: 'Demolition Saboteur',
      shortName: 'DEMO TRP',
      category: 'INFANTRY',
      locomotor: 'INFANTRY',
      cost: 200,
      buildTime: 4,
      hp: 150,
      speed: 98,
      radius: 9,
      sight: 210,
      isSuicideUnit: true,
      weapon: {
        damage: 340,
        range: 34,
        cooldown: 0.2,
        damageType: 'HIGH_EXPLOSIVE',
        projectileSpeed: 999,
        projType: 'DETONATE',
        splash: 65,
        antiAir: false
      },
      voiceSelect: 'Wires are set!',
      voiceMove: 'I will make the sacrifice!',
      description: 'High-speed demolition operative that detonates on contact for massive structural and armor damage.'
    },
    GLA_HIJACKER: {
      id: 'GLA_HIJACKER',
      faction: 'GLA',
      name: 'Stealth Vehicle Hijacker',
      shortName: 'HIJACKER',
      category: 'INFANTRY',
      locomotor: 'CLIFF_CLIMBER',
      cost: 400,
      buildTime: 6,
      hp: 200,
      speed: 88,
      radius: 9,
      sight: 240,
      generalOnly: 'GLA_KASSAD',
      subGeneralExclusive: 'GLA_KASSAD',
      stealthed: true,
      ability: {
        id: 'HIJACK_VEHICLE',
        name: 'Hijack Enemy Vehicle [F]',
        icon: '🔑',
        cooldown: 12,
        range: 110,
        desc: 'Seizes control of target enemy vehicle, permanently converting it to your command!'
      },
      weapon: {
        damage: 24,
        range: 95,
        cooldown: 0.8,
        damageType: 'SMALL_ARMS',
        projectileSpeed: 540,
        projType: 'BULLET',
        antiAir: false
      },
      voiceSelect: 'Give me the keys!',
      voiceMove: 'Nice tank you have there...',
      description: 'Prince Kassad Exclusive. Camouflaged cliff-climbing infiltrator who hijacks enemy tanks and vehicles [F]!'
    },
    GLA_ANGRY_MOB: {
      id: 'GLA_ANGRY_MOB',
      faction: 'GLA',
      name: 'Angry Mob (AK-47s & Molotovs)',
      shortName: 'MOB',
      category: 'INFANTRY',
      locomotor: 'INFANTRY',
      cost: 800,
      buildTime: 9,
      hp: 620,
      speed: 72,
      radius: 17,
      sight: 230,
      requiresTech: true,
      isMob: true,
      weapon: {
        damage: 55,
        range: 185,
        cooldown: 0.42,
        damageType: 'HIGH_EXPLOSIVE',
        projectileSpeed: 500,
        projType: 'BULLET',
        splash: 24,
        antiAir: false
      },
      voiceSelect: 'AK-47s for everyone!',
      voiceMove: 'Down with the oppressors!',
      description: 'Swarming crowd of insurgents throwing Molotov cocktails and firing AK-47s. Regenerates members over time.'
    },
    GLA_JARMEN_KELL: {
      id: 'GLA_JARMEN_KELL',
      faction: 'GLA',
      name: 'Jarmen Kell (Hero Sniper)',
      shortName: 'JARMEN',
      category: 'INFANTRY',
      locomotor: 'CLIFF_CLIMBER',
      cost: 1500,
      buildTime: 13,
      hp: 360,
      speed: 82,
      radius: 10,
      sight: 320,
      requiresTech: true,
      isHero: true,
      stealthedWhenStill: true,
      ability: {
        id: 'PILOT_SNIPE',
        name: 'Snipe Vehicle Pilot [F]',
        icon: '🎯',
        cooldown: 16,
        range: 320,
        desc: 'Snipes the driver of an enemy Tank or Vehicle, leaving the hull neutral and unmanned so any infantry can capture it!'
      },
      weapon: {
        damage: 175,
        range: 320,
        cooldown: 1.4,
        damageType: 'SNIPER',
        projectileSpeed: 950,
        projType: 'SNIPER',
        antiAir: false
      },
      voiceSelect: 'Jarmen Kell. Name your target.',
      voiceMove: 'Moving into the shadows.',
      description: 'Legendary GLA sniper hero. Eliminates infantry instantly and can Snipe Vehicle Pilots [F] so your infantry can steal enemy tanks!'
    },
    GLA_TECHNICAL: {
      id: 'GLA_TECHNICAL',
      faction: 'GLA',
      name: 'Technical Pickup',
      shortName: 'TECHNCAL',
      category: 'LIGHT_VEHICLE',
      locomotor: 'WHEELED',
      cost: 500,
      buildTime: 6,
      hp: 360,
      speed: 132,
      radius: 15,
      sight: 245,
      canSalvage: true,
      weapon: {
        damage: 20,
        range: 195,
        cooldown: 0.32,
        damageType: 'SMALL_ARMS',
        projectileSpeed: 600,
        projType: 'BULLET',
        antiAir: false
      },
      voiceSelect: 'Bolted down and ready!',
      voiceMove: 'Hold on tight!',
      description: 'Fast pickup truck with bed-mounted heavy weapon. Upgradable via battlefield Salvage Crates (20mm -> RPG).'
    },
    GLA_COMBAT_CYCLE: {
      id: 'GLA_COMBAT_CYCLE',
      faction: 'GLA',
      name: 'Demolition Combat Cycle',
      shortName: 'CMBT CYC',
      category: 'LIGHT_VEHICLE',
      locomotor: 'CLIFF_CLIMBER',
      cost: 500,
      buildTime: 5,
      hp: 290,
      speed: 158,
      radius: 13,
      sight: 260,
      generalOnly: 'GLA_JUHZIZ',
      subGeneralExclusive: 'GLA_JUHZIZ',
      isCliffClimber: true,
      weapon: {
        damage: 85,
        range: 205,
        cooldown: 1.05,
        damageType: 'HIGH_EXPLOSIVE',
        projectileSpeed: 560,
        projType: 'MISSILE',
        splash: 32,
        antiAir: false
      },
      voiceSelect: 'Full throttle!',
      voiceMove: 'Over the ridge!',
      description: 'Gen. Juhziz Exclusive. Ultra-fast cliff-climbing motorcycle armed with twin demolition rocket launchers.'
    },
    GLA_SCORPION: {
      id: 'GLA_SCORPION',
      faction: 'GLA',
      name: 'Scorpion Tank',
      shortName: 'SCORPION',
      category: 'TANK',
      locomotor: 'TRACKED',
      cost: 600,
      buildTime: 7,
      hp: 560,
      speed: 92,
      radius: 17,
      sight: 235,
      canSalvage: true,
      weapon: {
        damage: 64,
        range: 215,
        cooldown: 1.35,
        damageType: 'ARMOR_PIERCING',
        projectileSpeed: 540,
        projType: 'SHELL',
        antiAir: false
      },
      voiceSelect: 'Scorpion, ready to sting!',
      voiceMove: 'Light and fast!',
      description: 'Light main battle tank. Fires deadly Scorpion Rockets (and dual-rockets at Salvage Tier 2).'
    },
    GLA_MARAUDER: {
      id: 'GLA_MARAUDER',
      faction: 'GLA',
      name: 'Marauder Heavy Tank',
      shortName: 'MARAUDER',
      category: 'TANK',
      locomotor: 'TRACKED',
      cost: 800,
      buildTime: 9,
      hp: 840,
      speed: 78,
      radius: 19,
      sight: 245,
      canSalvage: true,
      weapon: {
        damage: 92,
        range: 225,
        cooldown: 1.45,
        damageType: 'ARMOR_PIERCING',
        projectileSpeed: 560,
        projType: 'SHELL',
        antiAir: false
      },
      voiceSelect: 'Marauder Tank assembled.',
      voiceMove: 'Heavy guns moving.',
      description: 'Heavy casemate tank destroyer. Collecting two Salvage Crates upgrades it to twin long-barrel cannons!'
    },
    GLA_QUAD_CANNON: {
      id: 'GLA_QUAD_CANNON',
      faction: 'GLA',
      name: 'Quad Cannon Half-Track',
      shortName: 'QUAD CNN',
      category: 'LIGHT_VEHICLE',
      locomotor: 'TRACKED',
      cost: 700,
      buildTime: 8,
      hp: 520,
      speed: 92,
      radius: 17,
      sight: 260,
      canSalvage: true,
      weapon: {
        damage: 18,
        range: 245,
        cooldown: 0.22,
        damageType: 'SMALL_ARMS',
        projectileSpeed: 660,
        projType: 'BULLET',
        antiAir: true
      },
      voiceSelect: 'Four on the floor!',
      voiceMove: 'Begin stitching!',
      description: 'Quad-barreled anti-air and anti-infantry half-track. Salvage Crates add rapid-fire sniping barrels.'
    },
    GLA_ROCKET_BUGGY: {
      id: 'GLA_ROCKET_BUGGY',
      faction: 'GLA',
      name: 'Rocket Buggy',
      shortName: 'RKT BUGY',
      category: 'LIGHT_VEHICLE',
      locomotor: 'WHEELED',
      cost: 900,
      buildTime: 9,
      hp: 360,
      speed: 136,
      radius: 16,
      sight: 275,
      requiresTech: true,
      canSalvage: true,
      isArtillery: true,
      weapon: {
        damage: 110,
        range: 355,
        cooldown: 2.3,
        damageType: 'ARMOR_PIERCING',
        projectileSpeed: 520,
        projType: 'MISSILE',
        splash: 28,
        antiAir: false
      },
      voiceSelect: 'Rocket Buggy ready to roll!',
      voiceMove: 'Eat dust!',
      description: 'High-speed hit-and-run dune buggy that fires long-range salvos of unguided artillery rockets.'
    },
    GLA_TOXIN_TRACTOR: {
      id: 'GLA_TOXIN_TRACTOR',
      faction: 'GLA',
      name: 'Toxin Tractor',
      shortName: 'TOXIN TR',
      category: 'TANK',
      locomotor: 'TRACKED',
      cost: 750,
      buildTime: 8,
      hp: 540,
      speed: 78,
      radius: 17,
      sight: 220,
      canSalvage: true,
      weapon: {
        damage: 36,
        range: 165,
        cooldown: 0.42,
        damageType: 'FLAME_TOXIN',
        projectileSpeed: 380,
        projType: 'TOXIN',
        splash: 34,
        clearsGarrison: true,
        leavesHazard: 'TOXIN',
        antiAir: false
      },
      voiceSelect: 'Would you like a sample?',
      voiceMove: 'Fresh out of the lab!',
      description: 'Sprays lethal streams of liquid Anthrax that dissolve infantry, clear garrisons, and contaminate ground.'
    },
    GLA_BOMB_TRUCK: {
      id: 'GLA_BOMB_TRUCK',
      faction: 'GLA',
      name: 'Disguised Bomb Truck',
      shortName: 'BOMB TRK',
      category: 'LIGHT_VEHICLE',
      locomotor: 'WHEELED',
      cost: 1200,
      buildTime: 11,
      hp: 520,
      speed: 108,
      radius: 18,
      sight: 230,
      requiresTech: true,
      isSuicideUnit: true,
      weapon: {
        damage: 680,
        range: 42,
        cooldown: 0.2,
        damageType: 'HIGH_EXPLOSIVE',
        projectileSpeed: 999,
        projType: 'DETONATE',
        splash: 95,
        leavesHazard: 'TOXIN',
        antiAir: false
      },
      voiceSelect: 'Special delivery!',
      voiceMove: 'Nothing stops the mail!',
      description: 'Heavy demolition truck packed with high-explosive and bio-toxin payloads that obliterates enemy bases on impact.'
    },
    GLA_SCUD_LAUNCHER: {
      id: 'GLA_SCUD_LAUNCHER',
      faction: 'GLA',
      name: 'Scud Launcher',
      shortName: 'SCUD LCH',
      category: 'TANK',
      locomotor: 'WHEELED',
      cost: 1400,
      buildTime: 13,
      hp: 460,
      speed: 62,
      radius: 20,
      sight: 280,
      requiresTech: true,
      canSalvage: true,
      isArtillery: true,
      weapon: {
        damage: 195,
        range: 410,
        cooldown: 4.2,
        damageType: 'HIGH_EXPLOSIVE',
        projectileSpeed: 350,
        projType: 'SCUD_MISSILE',
        splash: 68,
        leavesHazard: 'TOXIN',
        antiAir: false
      },
      voiceSelect: 'Look at the flames!',
      voiceMove: 'Shall I push the button?',
      description: 'Mobile ballistic missile launcher firing high-explosive / anthrax warheads across huge distances.'
    }
  };

  // Tech & Faction Upgrades
  const UPGRADES = {
    UPG_CONTROL_RODS: {
      id: 'UPG_CONTROL_RODS',
      name: 'Control Rods (+100% Power)',
      shortName: 'CTRL RODS',
      cost: 600,
      desc: 'Doubles power output of all US Cold Fusion Reactors (+8 -> +16 Power each).'
    },
    UPG_FLASHBANGS: {
      id: 'UPG_FLASHBANGS',
      name: 'Flashbang Grenades',
      shortName: 'FLASHBANG',
      cost: 500,
      desc: 'Rangers deal +40% bonus damage with concussive Flashbang munitions.'
    },
    UPG_TOW_MISSILE: {
      id: 'UPG_TOW_MISSILE',
      name: 'TOW Missile Pod',
      shortName: 'TOW MSL',
      cost: 800,
      desc: 'Equips all Humvees with anti-tank/anti-air guided TOW missiles (+45% damage & +35 range).'
    },
    UPG_ROCKET_PODS: {
      id: 'UPG_ROCKET_PODS',
      name: 'Comanche Rocket Pods',
      shortName: 'RKT PODS',
      cost: 800,
      desc: 'Equips Comanche Gunships with area-saturation rocket pods (+35% damage).'
    },
    UPG_COMPOSITE_ARMOR: {
      id: 'UPG_COMPOSITE_ARMOR',
      name: 'Composite Armor',
      shortName: 'COMP ARMR',
      cost: 1200,
      desc: 'Increases maximum HP of all US Crusader, Laser Crusader, Paladin, and Laser Tanks by +25%.'
    },
    UPG_NATIONALISM: {
      id: 'UPG_NATIONALISM',
      name: 'Nationalism (+Horde Bonus)',
      shortName: 'NATNLSM',
      cost: 800,
      desc: 'Boosts the China Horde fire-rate bonus by an additional +20%.'
    },
    UPG_BLACK_NAPALM: {
      id: 'UPG_BLACK_NAPALM',
      name: 'Black Napalm',
      shortName: 'BLK NAPLM',
      cost: 1000,
      desc: 'Upgrades Dragon Tank, MiG, and Inferno Cannon flames to super-heated blue Black Napalm (+35% damage).'
    },
    UPG_CHAIN_GUNS: {
      id: 'UPG_CHAIN_GUNS',
      name: 'Gattling Chain Guns',
      shortName: 'CHAINGUN',
      cost: 800,
      desc: 'Increases damage of all Mini-Gunners, Gattling Tanks, and Gattling Cannons by +25%.'
    },
    UPG_SUBLIMINAL_MESSAGING: {
      id: 'UPG_SUBLIMINAL_MESSAGING',
      name: 'Subliminal Messaging',
      shortName: 'SUBLIMNL',
      cost: 700,
      desc: 'Doubles the healing rate of all Speaker Towers and Overlord Propaganda Towers.'
    },
    UPG_URANIUM_SHELLS: {
      id: 'UPG_URANIUM_SHELLS',
      name: 'Depleted Uranium Shells',
      shortName: 'URANIUM',
      cost: 1200,
      desc: 'Battlemaster, Overlord, and Emperor Overlord tank shells deal +25% armor-piercing damage.'
    },
    UPG_ANTHRAX_BETA: {
      id: 'UPG_ANTHRAX_BETA',
      name: 'Anthrax Beta Toxins',
      shortName: 'ANTHRAX B',
      cost: 1000,
      desc: 'Upgrades all GLA Toxin Tractors, Scud Launchers, and Scud Storms to lethal purple/blue Anthrax (+30% dmg).'
    },
    UPG_SCORPION_ROCKET: {
      id: 'UPG_SCORPION_ROCKET',
      name: 'Scorpion Rocket Launcher',
      shortName: 'SCORP RKT',
      cost: 800,
      desc: 'Mounts top-attack anti-tank rockets onto all Scorpion Tanks (+35% damage).'
    },
    UPG_AP_ROCKETS: {
      id: 'UPG_AP_ROCKETS',
      name: 'Armor-Piercing Rockets',
      shortName: 'AP ROCKTS',
      cost: 1000,
      desc: 'Increases damage of all RPG Troopers, Rocket Buggies, Combat Cycles, Stinger Sites, and Scorpion Rockets by +25%.'
    },
    UPG_ARM_THE_MOB: {
      id: 'UPG_ARM_THE_MOB',
      name: 'Arm the Mob (AK-47s!)',
      shortName: 'AK-47 MOB',
      cost: 800,
      desc: 'Issues AK-47 assault rifles to all Angry Mobs (+50% damage)!'
    },
    UPG_JUNK_REPAIR: {
      id: 'UPG_JUNK_REPAIR',
      name: 'Junk Repair',
      shortName: 'JUNK REP',
      cost: 900,
      desc: 'All GLA vehicles passively self-repair in the field without needing a Palace or Tunnel.'
    }
  };

  // Expanded 5-Rank Generals Powers Tree (Phase 2)
  const GENERALS_POWERS = {
    USA: [
      {
        id: 'GP_USA_SPY_DRONE',
        name: 'Spy Drone',
        rankReq: 1,
        costPoints: 1,
        cooldown: 55,
        radius: 360,
        icon: '🛸',
        desc: 'Deploys an invisible surveillance drone at target coordinates, revealing Fog of War for 60s and granting +15% range to nearby allies.'
      },
      {
        id: 'GP_USA_A10_STRIKE',
        name: 'A-10 Thunderbolt Strike',
        rankReq: 3,
        costPoints: 1,
        cooldown: 95,
        radius: 170,
        icon: '✈️',
        desc: 'Calls a squadron of A-10 Warthogs to strafe target area with 30mm GAU-8 Avenger cannon fire and Maverick missiles.'
      },
      {
        id: 'GP_USA_SPECTRE_GUNSHIP',
        name: 'AC-130 Spectre Gunship',
        rankReq: 3,
        costPoints: 1,
        cooldown: 110,
        radius: 210,
        icon: '🚁',
        desc: 'Summons an AC-130 Spectre Gunship that orbits target area, hammering enemies with 105mm howitzer shells and 25mm Gatling fire!'
      },
      {
        id: 'GP_USA_FUEL_AIR_BOMB',
        name: 'Fuel Air Bomb (MOAB)',
        rankReq: 5,
        costPoints: 1,
        cooldown: 135,
        radius: 230,
        icon: '💣',
        desc: 'Drops a thermobaric Mother Of All Bombs that levels enemy armor and fortifications across a massive blast zone.'
      }
    ],
    CHINA: [
      {
        id: 'GP_CHINA_ARTILLERY_BARRAGE',
        name: 'Artillery Barrage',
        rankReq: 1,
        costPoints: 1,
        cooldown: 75,
        radius: 165,
        icon: '🎯',
        desc: 'Unleashes an off-map 155mm howitzer artillery bombardment on target enemy coordinates.'
      },
      {
        id: 'GP_CHINA_CASH_HACK',
        name: 'Cash Hack ($2,500)',
        rankReq: 3,
        costPoints: 1,
        cooldown: 80,
        radius: 160,
        icon: '💻',
        desc: 'Siphons up to $2,500 directly from enemy coffers into your war chest!'
      },
      {
        id: 'GP_CHINA_CARPET_BOMB',
        name: 'H-6 Carpet Bombing',
        rankReq: 3,
        costPoints: 1,
        cooldown: 105,
        radius: 200,
        icon: '🛩️',
        desc: 'Dispatches a heavy bomber across the target sector, dropping a linear carpet of high-explosive incendiary bombs.'
      },
      {
        id: 'GP_CHINA_EMP_PULSE',
        name: 'EMP Pulse & Nuclear Fallout',
        rankReq: 5,
        costPoints: 1,
        cooldown: 130,
        radius: 220,
        icon: '⚡',
        desc: 'Detonates a high-altitude EMP bomb disabling enemy vehicles and base defenses for 14s while dealing heavy blast damage.'
      }
    ],
    GLA: [
      {
        id: 'GP_GLA_REBEL_AMBUSH',
        name: 'Rebel Ambush Squad',
        rankReq: 1,
        costPoints: 1,
        cooldown: 65,
        radius: 110,
        icon: '🥷',
        desc: 'Instantly spawns a veteran squad of 5 GLA Rebels and 2 RPG Troopers directly out of the ground at any visible location!'
      },
      {
        id: 'GP_GLA_CASH_BOUNTY',
        name: 'Cash Bounty & Salvage Drop',
        rankReq: 3,
        costPoints: 1,
        cooldown: 75,
        radius: 130,
        icon: '📦',
        desc: 'Grants +$1,500 war chest funding and drops 4 high-grade Salvage Crates at target coordinates.'
      },
      {
        id: 'GP_GLA_GPS_SCRAMBLER',
        name: 'GPS Scrambler Camouflage',
        rankReq: 3,
        costPoints: 1,
        cooldown: 85,
        radius: 185,
        icon: '📡',
        desc: 'Cloaks all friendly combat units within target radius in active stealth camouflage and grants +25% movement speed for 25s!'
      },
      {
        id: 'GP_GLA_ANTHRAX_BOMB',
        name: 'Anthrax Bio-Bomb',
        rankReq: 5,
        costPoints: 1,
        cooldown: 130,
        radius: 230,
        icon: '☣️',
        desc: 'Drops a catastrophic biological payload that deals heavy impact damage and blankets the area in lethal Anthrax Gamma clouds.'
      }
    ]
  };

  // Skirmish & Generals' Challenge Maps
  const MAPS = [
    {
      id: 'TOURNAMENT_DESERT',
      name: 'Tournament Desert',
      subtitle: 'Iconic Arid Canyon, Tech Oil Derricks & Central Urban Garrisons',
      theme: 'DESERT',
      bgPrimary: '#c2a36b',
      bgSecondary: '#b08f54',
      gridColor: 'rgba(92, 68, 32, 0.16)',
      ridgeColor: '#8d6e3a',
      roadColor: '#9e8252'
    },
    {
      id: 'FINAL_CRUSADE',
      name: 'Final Crusade',
      subtitle: 'Temperate Valley, Tech Hospital & Central Supply Basin',
      theme: 'TEMPERATE',
      bgPrimary: '#526f43',
      bgSecondary: '#435d36',
      gridColor: 'rgba(25, 42, 18, 0.18)',
      ridgeColor: '#5b574b',
      roadColor: '#767164'
    },
    {
      id: 'DEFCON_6',
      name: 'Defcon 6 (Arctic Stronghold)',
      subtitle: 'Frozen Mountain Pass, Tech Repair Bays & Strategic Choke Points',
      theme: 'SNOW',
      bgPrimary: '#cbd5e1',
      bgSecondary: '#94a3b8',
      gridColor: 'rgba(51, 65, 85, 0.16)',
      ridgeColor: '#64748b',
      roadColor: '#78879b'
    }
  ];

  // Generals' Challenge Campaign Gauntlet Order
  const CHALLENGE_LADDER = [
    'USA_GRANGER',
    'CHINA_KWAI',
    'GLA_THRAX',
    'USA_TOWNES',
    'CHINA_SHIN_FAI',
    'GLA_KASSAD',
    'CHINA_TAO',
    'GLA_JUHZIZ',
    'USA_ALEXANDER'
  ];

  // Active Unit Micro-Abilities (Phase 2 SYS-17)
  const UNIT_ABILITIES = {
    FLASHBANG: {
      id: 'FLASHBANG',
      name: 'Flashbang Grenade',
      shortName: 'FLASHBANG',
      hotkey: 'F',
      cooldown: 14,
      range: 195,
      splash: 55,
      targetType: 'GROUND_OR_GARRISON',
      desc: 'Fires a concussion grenade that instantly clears all hostile infantry inside a garrisoned building and stuns nearby infantry.'
    },
    LASER_LOCK: {
      id: 'LASER_LOCK',
      name: 'Laser-Lock Barrage',
      shortName: 'LASER LOCK',
      hotkey: 'F',
      cooldown: 16,
      range: 265,
      duration: 6,
      targetType: 'ENEMY_VEHICLE_OR_AIR',
      desc: 'Paints a target vehicle or aircraft with a targeting laser, doubling firing rate (+100% ROF) and granting +25% range for 6s.'
    },
    FLAME_WALL: {
      id: 'FLAME_WALL',
      name: ' Napalm Firestorm Wall',
      shortName: 'FIRE WALL',
      hotkey: 'F',
      cooldown: 22,
      range: 175,
      splash: 110,
      targetType: 'GROUND',
      desc: 'Unleashes a 360-degree ring of Black Napalm firestorm that incinerates surrounding structures, garrisons, and infantry.'
    },
    OVERLORD_SPEAKER: {
      id: 'OVERLORD_SPEAKER',
      name: 'Mount Propaganda Speaker Tower',
      shortName: 'SPEAKER TWR',
      hotkey: 'F',
      cost: 500,
      cooldown: 2,
      targetType: 'SELF_ADDON',
      desc: 'Installs a mobile Propaganda Speaker Tower atop the Overlord (+12 HP/s AoE repair aura & +25% rate of fire).'
    },
    OVERLORD_GATLING: {
      id: 'OVERLORD_GATLING',
      name: 'Mount Gatling Cannon Turret',
      shortName: 'GATLING TWR',
      hotkey: 'R',
      cost: 400,
      cooldown: 2,
      targetType: 'SELF_ADDON',
      desc: 'Installs a dorsal Gatling Cannon atop the Overlord for rapid anti-infantry, anti-air, and stealth detection.'
    },
    PILOT_SNIPE: {
      id: 'PILOT_SNIPE',
      name: 'Snipe Vehicle Crew',
      shortName: 'SNIPE CREW',
      hotkey: 'F',
      cooldown: 20,
      range: 310,
      targetType: 'ENEMY_VEHICLE',
      desc: 'Kills the driver of an enemy vehicle with an armor-piercing round, leaving the vehicle intact and unmanned for any infantry to capture!'
    },
    HIJACK_VEHICLE: {
      id: 'HIJACK_VEHICLE',
      name: 'Hijack Enemy Vehicle',
      shortName: 'HIJACK',
      hotkey: 'F',
      cooldown: 5,
      range: 55,
      targetType: 'ENEMY_VEHICLE',
      desc: 'Stealthed operative forces open an enemy vehicle hatch and permanently commandeers the vehicle for your army!'
    }
  };

  // Normalize Neutral Tech Structure property aliases (BUG-04)
  Object.values(TECH_BUILDINGS).forEach(tb => {
    if (tb.healInfantryRate && !tb.infantryHealRate) tb.infantryHealRate = tb.healInfantryRate;
    if (tb.infantryHealRate && !tb.healInfantryRate) tb.healInfantryRate = tb.infantryHealRate;
    if (tb.repairVehicleRate && !tb.vehicleRepairRate) tb.vehicleRepairRate = tb.repairVehicleRate;
    if (tb.vehicleRepairRate && !tb.repairVehicleRate) tb.repairVehicleRate = tb.vehicleRepairRate;
  });

  // Normalize UNITS & BUILDINGS so both v1 and Phase 2 property conventions work seamlessly
  const abilityByUnitId = {
    USA_RANGER: 'FLASHBANG',
    USA_MISSILE_DEFENDER: 'LASER_LOCK',
    CHINA_DRAGON_TANK: 'FLAME_WALL',
    CHINA_OVERLORD: 'OVERLORD_SPEAKER',
    CHINA_EMPEROR_OVERLORD: 'OVERLORD_GATLING',
    GLA_JARMEN_KELL: 'PILOT_SNIPE',
    GLA_HIJACKER: 'HIJACK_VEHICLE'
  };

  Object.values(UNITS).forEach(u => {
    if (!u.type) {
      u.type = u.category === 'INFANTRY' ? 'INFANTRY' : u.category === 'AIRCRAFT' ? 'AIRCRAFT' : 'VEHICLE';
    }
    if (!u.ability && abilityByUnitId[u.id]) {
      u.ability = abilityByUnitId[u.id];
    }
    // BUG-02: Normalize u.ability to a canonical string key in UNIT_ABILITIES
    if (u.ability && typeof u.ability === 'object') {
      u.abilityDef = u.ability;
      const abId = u.ability.id || abilityByUnitId[u.id] || (u.id + '_ABILITY');
      if (!UNIT_ABILITIES[abId]) {
        UNIT_ABILITIES[abId] = Object.assign({
          shortName: (u.ability.name || abId).slice(0, 11).toUpperCase(),
          hotkey: 'F'
        }, u.ability, { id: abId });
      }
      u.ability = abId;
      u.abilityId = abId;
    } else if (typeof u.ability === 'string') {
      u.abilityId = u.ability;
      if (!UNIT_ABILITIES[u.ability]) {
        UNIT_ABILITIES[u.ability] = { id: u.ability, name: u.ability, shortName: u.ability.slice(0, 11), hotkey: 'F' };
      }
    }
    // BUG-09: Normalize Black Lotus & Troop/Assault Crawler special flags
    if (u.id === 'CHINA_BLACK_LOTUS') {
      u.isRemoteHacker = true;
      u.canCapture = true;
    }
    if (u.spawnsInfantry && !u.spawnsInfantryType) {
      u.spawnsInfantryType = u.spawnsInfantry;
    }
    if (u.spawnsCount && !u.spawnsInfantryCount) {
      u.spawnsInfantryCount = u.spawnsCount;
    }
    if (u.id === 'CHINA_ASSAULT_CRAWLER') {
      u.spawnsInfantryType = u.spawnsInfantryType || 'CHINA_MINIGUNNER';
      u.spawnsInfantryCount = u.spawnsInfantryCount || 4;
    }
    if (u.id === 'CHINA_TROOP_CRAWLER') {
      u.spawnsInfantryType = u.spawnsInfantryType || 'CHINA_RED_GUARD';
      u.spawnsInfantryCount = u.spawnsInfantryCount || 4;
    }
    if (u.id === 'GLA_COMBAT_CYCLE') {
      u.locomotor = 'CLIFF_CLIMBER';
    }
    if (u.weapon) {
      if (u.weapon.fireRate === undefined && u.weapon.cooldown) {
        u.weapon.fireRate = u.weapon.cooldown;
      }
      if (u.weapon.splashRadius === undefined && u.weapon.splash) {
        u.weapon.splashRadius = u.weapon.splash;
      }
      if (u.weapon.canTargetAir === undefined) {
        u.weapon.canTargetAir = !!u.weapon.antiAir;
      }
      if (u.weapon.canTargetGround === undefined) {
        u.weapon.canTargetGround = u.weapon.groundOnly !== false;
      }
      if (u.weapon.damageType === 'ARMOR_PIERCING') u.weapon.damageType = 'AP';
      if (u.weapon.damageType === 'ARTILLERY') u.weapon.damageType = 'HIGH_EXPLOSIVE';
      if (u.weapon.damageType === 'FLAME' || u.weapon.damageType === 'TOXIN') u.weapon.damageType = 'FLAME_TOXIN';
    }
  });

  Object.values(BUILDINGS).forEach(b => {
    if (!b.footprint) {
      const s = b.size || 72;
      b.footprint = { w: s, h: s };
    }
    if (b.trains && !b.produces) b.produces = b.trains;
    if (b.produces && !b.trains) b.trains = b.produces;
    if (b.isSupplyDepot && b.isSupplyDrop === undefined) b.isSupplyDrop = true;
    if (b.weapon) {
      if (b.weapon.fireRate === undefined && b.weapon.cooldown) {
        b.weapon.fireRate = b.weapon.cooldown;
      }
      if (b.weapon.splashRadius === undefined && b.weapon.splash) {
        b.weapon.splashRadius = b.weapon.splash;
      }
      if (b.weapon.canTargetAir === undefined) {
        b.weapon.canTargetAir = !!b.weapon.antiAir;
      }
      if (b.weapon.canTargetGround === undefined) {
        b.weapon.canTargetGround = true;
      }
      if (b.weapon.damageType === 'ARMOR_PIERCING') b.weapon.damageType = 'AP';
      if (b.weapon.damageType === 'ARTILLERY') b.weapon.damageType = 'HIGH_EXPLOSIVE';
      if (b.weapon.damageType === 'FLAME' || b.weapon.damageType === 'TOXIN') b.weapon.damageType = 'FLAME_TOXIN';
    }
  });

  // Normalize DAMAGE_MATRIX so both naming conventions work seamlessly
  if (!DAMAGE_MATRIX.SMALL_ARMS.VEHICLE) {
    DAMAGE_MATRIX.SMALL_ARMS.VEHICLE = DAMAGE_MATRIX.SMALL_ARMS.TANK || 0.25;
  }
  if (!DAMAGE_MATRIX.HIGH_EXPLOSIVE.VEHICLE) {
    DAMAGE_MATRIX.HIGH_EXPLOSIVE.VEHICLE = 0.9;
  }
  if (!DAMAGE_MATRIX.AP) {
    DAMAGE_MATRIX.AP = Object.assign({ VEHICLE: 1.25 }, DAMAGE_MATRIX.ARMOR_PIERCING || {});
  }
  if (!DAMAGE_MATRIX.EXPLOSIVE) {
    DAMAGE_MATRIX.EXPLOSIVE = Object.assign({ VEHICLE: 0.9 }, DAMAGE_MATRIX.HIGH_EXPLOSIVE || {});
  }
  if (!DAMAGE_MATRIX.ARTILLERY) {
    DAMAGE_MATRIX.ARTILLERY = Object.assign({ VEHICLE: 0.9 }, DAMAGE_MATRIX.HIGH_EXPLOSIVE || {});
  }
  if (!DAMAGE_MATRIX.FLAME_TOXIN) {
    DAMAGE_MATRIX.FLAME_TOXIN = Object.assign({ VEHICLE: 0.45 }, DAMAGE_MATRIX.FLAME || {});
  }
  if (!DAMAGE_MATRIX.FLASHBANG) {
    DAMAGE_MATRIX.FLASHBANG = { INFANTRY: 1.6, VEHICLE: 0.05, AIRCRAFT: 0.0, BUILDING: 0.1 };
  }

  return {
    DAMAGE_MATRIX,
    VETERANCY_LEVELS,
    GENERAL_RANKS,
    FACTIONS,
    GENERALS,
    TECH_BUILDINGS,
    BUILDINGS,
    UNITS,
    UNIT_ABILITIES,
    UPGRADES,
    GENERALS_POWERS,
    MAPS,
    CHALLENGE_LADDER
  };
})();
