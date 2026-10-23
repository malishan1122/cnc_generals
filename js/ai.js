// ============================================================================
// Command & Conquer: Generals – Zero Hour (macOS Clean-Room Edition)
// js/ai.js — Phase 2: 9-General Doctrine AI, Tech Capture, Garrison & Flanking
// ============================================================================

window.ZH_AI = (function () {
  'use strict';

  let thinkTimer = 0;
  let tauntTimer = 18;
  let waveTimer = 0;

  // Pre-calculated build offsets around AI base (Top-Right: 2760, 440)
  const BASE_OFFSETS = [
    { dx: -240, dy: -60 },  // Supply Center
    { dx: 130,  dy: -110 }, // Reactor 1
    { dx: -160, dy: 160 },  // Barracks
    { dx: -310, dy: 180 },  // War Factory / Arms Dealer
    { dx: 130,  dy: 160 },  // Airfield / Reactor 2
    { dx: -210, dy: 310 },  // Defense 1
    { dx: -80,  dy: 310 },  // Defense 2
    { dx: 70,   dy: 280 },  // Tech Center
    { dx: 200,  dy: 280 },  // Secondary Eco
    { dx: 220,  dy: 40 },   // Superweapon
    { dx: -340, dy: 40 },   // Extra Airfield / Defense 3
    { dx: 40,   dy: 360 }   // Forward Turret
  ];

  // Phase 2: Dedicated 9-General Strategic Doctrines
  const GENERAL_DOCTRINES = {
    USA_GRANGER: {
      name: 'Air Force General Granger',
      waveSize: 5,
      flankRatio: 0.5,
      buildOrder: [
        { id: 'USA_REACTOR', count: 1 },
        { id: 'USA_SUPPLY_CENTER', count: 1 },
        { id: 'USA_BARRACKS', count: 1 },
        { id: 'USA_AIRFIELD', count: 2 },
        { id: 'USA_WAR_FACTORY', count: 1 },
        { id: 'USA_PATRIOT', count: 2 },
        { id: 'USA_REACTOR', count: 2 },
        { id: 'USA_STRATEGY_CENTER', count: 1 },
        { id: 'USA_SUPPLY_DROP_ZONE', count: 1 },
        { id: 'USA_PARTICLE_CANNON', count: 1 }
      ],
      unitWeights: {
        USA_KING_RAPTOR: 5,
        USA_COMBAT_CHINOOK: 4,
        USA_COMANCHE: 4,
        USA_RANGER: 2,
        USA_MISSILE_DEFENDER: 2,
        USA_HUMVEE: 2
      }
    },
    USA_ALEXANDER: {
      name: 'Superweapon General Alexander',
      waveSize: 7,
      flankRatio: 0.25,
      buildOrder: [
        { id: 'USA_REACTOR', count: 2 },
        { id: 'USA_SUPPLY_CENTER', count: 1 },
        { id: 'USA_BARRACKS', count: 1 },
        { id: 'USA_PATRIOT', count: 3 },
        { id: 'USA_WAR_FACTORY', count: 1 },
        { id: 'USA_STRATEGY_CENTER', count: 1 },
        { id: 'USA_REACTOR', count: 3 },
        { id: 'USA_PARTICLE_CANNON', count: 1 },
        { id: 'USA_SUPPLY_DROP_ZONE', count: 1 }
      ],
      unitWeights: {
        USA_AURORA_ALPHA: 4,
        USA_MISSILE_DEFENDER: 3,
        USA_PATHFINDER: 3,
        USA_CRUSADER: 2,
        USA_TOMAHAWK: 3
      }
    },
    USA_TOWNES: {
      name: 'Laser General Townes',
      waveSize: 6,
      flankRatio: 0.35,
      buildOrder: [
        { id: 'USA_REACTOR', count: 2 },
        { id: 'USA_SUPPLY_CENTER', count: 1 },
        { id: 'USA_BARRACKS', count: 1 },
        { id: 'USA_WAR_FACTORY', count: 1 },
        { id: 'USA_PATRIOT', count: 2 },
        { id: 'USA_REACTOR', count: 3 },
        { id: 'USA_STRATEGY_CENTER', count: 1 },
        { id: 'USA_AIRFIELD', count: 1 },
        { id: 'USA_PARTICLE_CANNON', count: 1 }
      ],
      unitWeights: {
        USA_LASER_CRUSADER: 5,
        USA_LASER_TANK: 5,
        USA_AVENGER: 3,
        USA_RANGER: 2,
        USA_MISSILE_DEFENDER: 3
      }
    },
    CHINA_KWAI: {
      name: 'Tank General Kwai',
      waveSize: 6,
      flankRatio: 0.3,
      buildOrder: [
        { id: 'CHINA_REACTOR', count: 1 },
        { id: 'CHINA_SUPPLY_CENTER', count: 1 },
        { id: 'CHINA_WAR_FACTORY', count: 2 },
        { id: 'CHINA_BARRACKS', count: 1 },
        { id: 'CHINA_GATTLING_CANNON', count: 2 },
        { id: 'CHINA_PROPAGANDA_CENTER', count: 1 },
        { id: 'CHINA_REACTOR', count: 2 },
        { id: 'CHINA_SPEAKER_TOWER', count: 1 },
        { id: 'CHINA_NUCLEAR_SILO', count: 1 }
      ],
      unitWeights: {
        CHINA_EMPEROR_OVERLORD: 5,
        CHINA_OVERLORD: 4,
        CHINA_BATTLEMASTER: 5,
        CHINA_GATTLING_TANK: 3,
        CHINA_DRAGON_TANK: 2,
        CHINA_TANK_HUNTER: 2
      }
    },
    CHINA_SHIN_FAI: {
      name: 'Infantry General Shin Fai',
      waveSize: 8,
      flankRatio: 0.45,
      buildOrder: [
        { id: 'CHINA_REACTOR', count: 1 },
        { id: 'CHINA_SUPPLY_CENTER', count: 1 },
        { id: 'CHINA_BARRACKS', count: 2 },
        { id: 'CHINA_WAR_FACTORY', count: 1 },
        { id: 'CHINA_BUNKER', count: 2 },
        { id: 'CHINA_PROPAGANDA_CENTER', count: 1 },
        { id: 'CHINA_SPEAKER_TOWER', count: 2 },
        { id: 'CHINA_INTERNET_CENTER', count: 1 },
        { id: 'CHINA_NUCLEAR_SILO', count: 1 }
      ],
      unitWeights: {
        CHINA_MINIGUNNER: 6,
        CHINA_ASSAULT_CRAWLER: 5,
        CHINA_TANK_HUNTER: 4,
        CHINA_BLACK_LOTUS: 2,
        CHINA_HACKER: 2,
        CHINA_INFERNO_CANNON: 2
      }
    },
    CHINA_TAO: {
      name: 'Nuclear General Tsing Shi Tao',
      waveSize: 6,
      flankRatio: 0.35,
      buildOrder: [
        { id: 'CHINA_REACTOR', count: 2 },
        { id: 'CHINA_SUPPLY_CENTER', count: 1 },
        { id: 'CHINA_BARRACKS', count: 1 },
        { id: 'CHINA_WAR_FACTORY', count: 1 },
        { id: 'CHINA_AIRFIELD', count: 1 },
        { id: 'CHINA_PROPAGANDA_CENTER', count: 1 },
        { id: 'CHINA_GATTLING_CANNON', count: 2 },
        { id: 'CHINA_NUCLEAR_SILO', count: 1 },
        { id: 'CHINA_INTERNET_CENTER', count: 1 }
      ],
      unitWeights: {
        CHINA_NUKE_CANNON: 5,
        CHINA_NUKE_MIG: 5,
        CHINA_OVERLORD: 4,
        CHINA_BATTLEMASTER: 4,
        CHINA_DRAGON_TANK: 2,
        CHINA_RED_GUARD: 2
      }
    },
    GLA_THRAX: {
      name: 'Toxin General Dr. Thrax',
      waveSize: 7,
      flankRatio: 0.4,
      buildOrder: [
        { id: 'GLA_SUPPLY_STASH', count: 1 },
        { id: 'GLA_BARRACKS', count: 1 },
        { id: 'GLA_ARMS_DEALER', count: 1 },
        { id: 'GLA_TUNNEL_NETWORK', count: 2 },
        { id: 'GLA_STINGER_SITE', count: 2 },
        { id: 'GLA_PALACE', count: 1 },
        { id: 'GLA_BLACK_MARKET', count: 1 },
        { id: 'GLA_SCUD_STORM', count: 1 }
      ],
      unitWeights: {
        GLA_TOXIN_TRACTOR: 5,
        GLA_MARAUDER: 4,
        GLA_SCUD_LAUNCHER: 4,
        GLA_REBEL: 3,
        GLA_RPG_TROOPER: 3,
        GLA_QUAD_CANNON: 3
      }
    },
    GLA_JUHZIZ: {
      name: 'Demolition General Rodall Juhziz',
      waveSize: 6,
      flankRatio: 0.5,
      buildOrder: [
        { id: 'GLA_SUPPLY_STASH', count: 1 },
        { id: 'GLA_BARRACKS', count: 1 },
        { id: 'GLA_ARMS_DEALER', count: 1 },
        { id: 'GLA_TUNNEL_NETWORK', count: 2 },
        { id: 'GLA_PALACE', count: 1 },
        { id: 'GLA_STINGER_SITE', count: 1 },
        { id: 'GLA_BLACK_MARKET', count: 1 },
        { id: 'GLA_SCUD_STORM', count: 1 }
      ],
      unitWeights: {
        GLA_COMBAT_CYCLE: 5,
        GLA_BOMB_TRUCK: 5,
        GLA_TERRORIST: 5,
        GLA_SCUD_LAUNCHER: 4,
        GLA_SCORPION: 3,
        GLA_JARMEN_KELL: 2
      }
    },
    GLA_KASSAD: {
      name: 'Stealth General Prince Kassad',
      waveSize: 6,
      flankRatio: 0.6,
      buildOrder: [
        { id: 'GLA_SUPPLY_STASH', count: 1 },
        { id: 'GLA_BARRACKS', count: 1 },
        { id: 'GLA_ARMS_DEALER', count: 1 },
        { id: 'GLA_TUNNEL_NETWORK', count: 3 },
        { id: 'GLA_PALACE', count: 1 },
        { id: 'GLA_STINGER_SITE', count: 2 },
        { id: 'GLA_BLACK_MARKET', count: 1 },
        { id: 'GLA_SCUD_STORM', count: 1 }
      ],
      unitWeights: {
        GLA_HIJACKER: 5,
        GLA_JARMEN_KELL: 3,
        GLA_TECHNICAL: 4,
        GLA_QUAD_CANNON: 4,
        GLA_ROCKET_BUGGY: 4,
        GLA_REBEL: 3,
        GLA_RPG_TROOPER: 3
      }
    }
  };

  const teamTimers = {
    0: { think: 0, taunt: 24, wave: 0 },
    1: { think: 0, taunt: 18, wave: 0 }
  };

  let fallbackRngState = 0x20261022;

  function rng(engine) {
    if (engine && typeof engine.simRandom === 'function') return engine.simRandom();
    let t = (fallbackRngState += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function resetTimers() {
    fallbackRngState = 0x20261022;
    thinkTimer = 0;
    tauntTimer = 18;
    waveTimer = 0;
    teamTimers[0] = { think: 0, taunt: 24, wave: 0 };
    teamTimers[1] = { think: 0, taunt: 18, wave: 0 };
  }

  function isEnemyVisibleToAI(engine, u, aiTeamId = 1) {
    if (!u || u.hp <= 0 || u.garrisonedIn || u.garrisonId) return false;
    if (u.stealthed && (u.detectedTimer || 0) <= 0) return false;
    return true;
  }

  // Phase 4 (SYS-26): Spatial Density & Power-Grid Vulnerability Scanner
  function findBestClusterTarget(engine, enemyTeamId = 0, radius = 260, prioritizePower = false) {
    const aiTeamId = enemyTeamId === 0 ? 1 : 0;
    const enemyBuildings = engine.buildings.filter(b => b.team === enemyTeamId && b.hp > 0);
    const enemyUnits = engine.units.filter(u => u.team === enemyTeamId && isEnemyVisibleToAI(engine, u, aiTeamId));
    const enemyTeam = engine.teams[enemyTeamId];

    const candidates = [];
    for (const b of enemyBuildings) {
      candidates.push({ x: b.x, y: b.y, entity: b, isBuilding: true });
    }
    const unitStep = Math.max(1, Math.ceil(enemyUnits.length / 16));
    for (let i = 0; i < enemyUnits.length; i += unitStep) {
      const u = enemyUnits[i];
      candidates.push({ x: u.x, y: u.y, entity: u, isBuilding: false });
    }

    if (candidates.length === 0) {
      const fallbackX = enemyTeamId === 0 ? 440 : engine.worldSize - 440;
      const fallbackY = enemyTeamId === 0 ? engine.worldSize - 440 : 440;
      return { x: fallbackX, y: fallbackY, score: 0, targetEntity: null, isPowerStrike: false };
    }

    let best = null;
    const radiusSq = radius * radius;
    const hasSpatial = engine.spatialGrid && typeof engine.spatialGrid.forEachInRadius === 'function';
    for (const cand of candidates) {
      let score = 0;
      let isPowerStrike = false;

      for (const b of enemyBuildings) {
        const dx = b.x - cand.x;
        const dy = b.y - cand.y;
        if (dx * dx + dy * dy <= radiusSq) {
          score += (b.def.cost || 800) * 1.35;
          if (b.def.isSuperweapon) score += 2200;
          if (b.def.isCommandCenter) score += 1200;
          // Power blackout check: if destroying this reactor causes or worsens Low Power
          if ((b.def.power || 0) > 0 && enemyTeam && enemyTeam.faction.usesPower) {
            const margin = (enemyTeam.powerProduced || 0) - (enemyTeam.powerConsumed || 0);
            if (prioritizePower || margin <= (b.def.power || 8)) {
              score += 2400;
              isPowerStrike = true;
            }
          }
        }
      }

      if (hasSpatial) {
        engine.spatialGrid.forEachInRadius(cand.x, cand.y, radius, (u, dSq) => {
          if (u.isUnit && u.team === enemyTeamId && dSq <= radiusSq && isEnemyVisibleToAI(engine, u, aiTeamId)) {
            score += (u.def.cost || 400);
          }
        });
      } else {
        for (const u of enemyUnits) {
          const dx = u.x - cand.x;
          const dy = u.y - cand.y;
          if (dx * dx + dy * dy <= radiusSq) {
            score += (u.def.cost || 400);
          }
        }
      }

      if (!best || score > best.score) {
        best = {
          x: cand.x,
          y: cand.y,
          score,
          targetEntity: cand.entity,
          isPowerStrike
        };
      }
    }

    return best;
  }

  // Phase 4 (SYS-26): High-Value Dozer / Harvester Raid Scanner with Turret Threat Avoidance
  function findHighValueRaidTarget(engine, attackerXOrTeamId, attackerY, enemyTeamId = 0) {
    let attackerX = attackerXOrTeamId;
    if (typeof attackerY !== 'number') {
      const teamId = typeof attackerXOrTeamId === 'number' ? attackerXOrTeamId : 1;
      enemyTeamId = teamId === 1 ? 0 : 1;
      const ownCC = engine.buildings.find(b => b.team === teamId && b.def.isCommandCenter);
      attackerX = ownCC ? ownCC.x : (teamId === 1 ? 2360 : 440);
      attackerY = ownCC ? ownCC.y : (teamId === 1 ? 440 : 2360);
    }

    const aiTeamId = enemyTeamId === 0 ? 1 : 0;
    const enemyUnits = engine.units.filter(u => u.team === enemyTeamId && isEnemyVisibleToAI(engine, u, aiTeamId));
    const enemyDefenses = engine.buildings.filter(
      b => b.team === enemyTeamId && b.hp > 0 && b.constructed && b.def.isDefense && (!engine.teams[enemyTeamId] || !engine.teams[enemyTeamId].isLowPower)
    );

    let bestTarget = null;
    let bestScore = -Infinity;

    for (const u of enemyUnits) {
      const isHighValue = u.def.isBuilder || u.def.isHarvester || u.def.isHacker || u.def.isArtillery;
      if (!isHighValue) continue;

      let priority = u.def.isBuilder ? 2200 : u.def.isHarvester ? 1900 : u.def.isHacker ? 1600 : 1400;
      const distPenalty = Math.hypot(u.x - attackerX, u.y - attackerY) * 0.35;

      // Threat Heatmap penalty: count active enemy base defense turrets covering this unit
      let nearbyTurrets = 0;
      for (const defB of enemyDefenses) {
        if (Math.hypot(defB.x - u.x, defB.y - u.y) <= 270) {
          nearbyTurrets++;
        }
      }
      const threatPenalty = nearbyTurrets * 950;
      const score = priority - distPenalty - threatPenalty;

      if (score > bestScore) {
        bestScore = score;
        bestTarget = u;
      }
    }

    return bestTarget;
  }

  // Phase 4 (SYS-26): Dynamic Counter-Composition Weighting
  function computeCounterWeights(engine, generalIdOrTeamId, enemyTeamId = 0) {
    let generalId = generalIdOrTeamId;
    if (typeof generalIdOrTeamId === 'number') {
      const teamId = generalIdOrTeamId;
      enemyTeamId = teamId === 1 ? 0 : 1;
      generalId = (engine && engine.teams && engine.teams[teamId] && engine.teams[teamId].generalId) || 'USA_GRANGER';
    }
    const doctrine = GENERAL_DOCTRINES[generalId] || GENERAL_DOCTRINES.USA_GRANGER;
    const baseWeights = {
      ...(doctrine.unitWeights || {}),
      antiAirBoost: 1.0,
      antiArmorBoost: 1.0,
      antiInfBoost: 1.0
    };

    if (!engine || !Array.isArray(engine.units)) return baseWeights;

    const aiTeamId = enemyTeamId === 0 ? 1 : 0;
    const enemyCombat = engine.units.filter(
      u => u.team === enemyTeamId && isEnemyVisibleToAI(engine, u, aiTeamId) && !u.def.isBuilder && !u.def.isHarvester
    );
    if (enemyCombat.length < 2) return baseWeights;

    let airCount = 0;
    let armorCount = 0;
    let infCount = 0;
    for (const u of enemyCombat) {
      if (u.def.category === 'AIRCRAFT' || u.def.isAir) airCount++;
      else if (u.def.category === 'TANK' || u.def.category === 'LIGHT_VEHICLE' || u.def.type === 'VEHICLE') armorCount++;
      else if (u.def.category === 'INFANTRY' || u.def.type === 'INFANTRY') infCount++;
    }

    const total = enemyCombat.length;
    const airRatio = airCount / total;
    const armorRatio = armorCount / total;
    const infRatio = infCount / total;

    if (airRatio >= 0.25) baseWeights.antiAirBoost = 2.6;
    if (armorRatio >= 0.40) baseWeights.antiArmorBoost = 1.8;
    if (infRatio >= 0.50) baseWeights.antiInfBoost = 1.8;

    const antiAirUnits = new Set([
      'USA_AVENGER', 'USA_MISSILE_DEFENDER', 'USA_KING_RAPTOR', 'USA_RAPTOR',
      'CHINA_GATTLING_TANK', 'CHINA_MINIGUNNER', 'CHINA_ASSAULT_CRAWLER',
      'GLA_QUAD_CANNON', 'GLA_RPG_TROOPER'
    ]);
    const antiArmorUnits = new Set([
      'USA_PALADIN', 'USA_LASER_TANK', 'USA_LASER_CRUSADER', 'USA_COMANCHE', 'USA_MISSILE_DEFENDER',
      'CHINA_EMPEROR_OVERLORD', 'CHINA_OVERLORD', 'CHINA_TANK_HUNTER', 'CHINA_NUKE_MIG',
      'GLA_MARAUDER', 'GLA_RPG_TROOPER', 'GLA_HIJACKER', 'GLA_ROCKET_BUGGY'
    ]);
    const antiInfUnits = new Set([
      'USA_PATHFINDER', 'USA_HUMVEE', 'USA_COMBAT_CHINOOK',
      'CHINA_DRAGON_TANK', 'CHINA_GATTLING_TANK', 'CHINA_MINIGUNNER',
      'GLA_TOXIN_TRACTOR', 'GLA_QUAD_CANNON', 'GLA_JARMEN_KELL'
    ]);

    for (const uId of Object.keys(ZH_DATA.UNITS)) {
      if (!baseWeights[uId]) baseWeights[uId] = 1;
      if (airRatio >= 0.25 && antiAirUnits.has(uId)) {
        baseWeights[uId] = Math.round(baseWeights[uId] * 2.2);
      }
      if (armorRatio >= 0.40 && antiArmorUnits.has(uId)) {
        baseWeights[uId] = Math.round(baseWeights[uId] * 1.8);
      }
      if (infRatio >= 0.50 && antiInfUnits.has(uId)) {
        baseWeights[uId] = Math.round(baseWeights[uId] * 1.8);
      }
    }

    return baseWeights;
  }

  // Phase 4 (SYS-26): Multi-Squad Role Assignment (VANGUARD / FLANKER / BASE_DEFENSE)
  function assignSquadRoles(combatUnits, flankRatioOrUnderAttack = 0.3, cc = null) {
    const validUnits = (combatUnits || []).filter(Boolean);
    const n = validUnits.length;
    if (n === 0) return { vanguard: [], flankers: [], defenders: [] };

    const forceBaseDefense = typeof flankRatioOrUnderAttack === 'boolean' && flankRatioOrUnderAttack;
    const flankRatio = typeof flankRatioOrUnderAttack === 'number' ? flankRatioOrUnderAttack : 0.3;

    const vanguard = [];
    const flankers = [];
    const defenders = [];

    validUnits.forEach((u, idx) => {
      if (forceBaseDefense && idx < Math.max(1, Math.floor(n * 0.35))) {
        u.aiSquad = 'BASE_DEFENSE';
      } else if (!u.aiSquad || (u.aiSquad === 'BASE_DEFENSE' && !forceBaseDefense && !cc)) {
        const isFastOrFlank = flankRatio > 0 && (u.def.isAir || u.def.stealthed || u.def.locomotor === 'CLIFF_CLIMBER' || u.def.locomotor === 'WHEELED' || (u.def.speed >= 95 && u.def.category !== 'TANK'));
        if (idx === 0 && n >= 4 && cc) {
          u.aiSquad = 'BASE_DEFENSE';
        } else if (flankRatio > 0 && (isFastOrFlank || (idx / Math.max(1, n)) < flankRatio)) {
          u.aiSquad = 'FLANKER';
        } else {
          u.aiSquad = 'VANGUARD';
        }
      }
      if (u.aiSquad === 'BASE_DEFENSE') defenders.push(u);
      else if (u.aiSquad === 'FLANKER') flankers.push(u);
      else vanguard.push(u);
    });

    return { vanguard, flankers, defenders };
  }

  function update(engine, dt) {
    if ((engine.simTick || 0) <= 1) {
      resetTimers();
    }
    updateTeam(engine, 1, dt);
  }

  function updateTeam(engine, teamId, dt) {
    const aiTeam = engine.teams[teamId];
    if (!aiTeam) return;
    const enemyTeamId = teamId === 1 ? 0 : 1;
    const teamDiff = (aiTeam && aiTeam.difficulty) || engine.difficulty || 'NORMAL';
    const isEasy = teamDiff === 'EASY';
    const isBrutal = teamDiff === 'BRUTAL';
    const isHard = teamDiff === 'HARD' || isBrutal;

    const tState = teamTimers[teamId] || (teamTimers[teamId] = { think: 0, taunt: 20, wave: 0 });
    tState.think += dt;
    tState.taunt -= dt;
    tState.wave += dt;

    if (teamId === 1) {
      thinkTimer = tState.think;
      tauntTimer = tState.taunt;
      waveTimer = tState.wave;
    }

    // Periodic General Taunts (Team 1 in Campaign/Skirmish)
    if (teamId === 1 && tState.taunt <= 0) {
      tState.taunt = 42 + rng(engine) * 25;
      tauntTimer = tState.taunt;
      const taunts = aiTeam.general.taunts || [];
      if (taunts.length > 0) {
        const line = taunts[Math.floor(rng(engine) * taunts.length)];
        engine.triggerTaunt(aiTeam.general, line);
      }
    }

    const interval = isBrutal ? 1.4 : isHard ? 1.6 : isEasy ? 4.4 : 2.6;
    if (tState.think < interval) return;
    tState.think = 0;
    if (teamId === 1) thinkTimer = 0;

    // P2-04: EASY, NORMAL, and HARD differ in think interval, scouting, counter-build accuracy,
    // queue depth, flank ratio, and retreat threshold — not in passive cash cheats.
    // Passive credit bonus applies only in BRUTAL or when explicit aiIncomeBonus is enabled.
    if (isBrutal || engine.aiIncomeBonus) {
      aiTeam.credits += 110;
    }

    const fId = aiTeam.factionId;
    const doctrine = GENERAL_DOCTRINES[aiTeam.generalId] || GENERAL_DOCTRINES.USA_GRANGER;
    const myBuildings = engine.buildings.filter(b => b.team === teamId && b.hp > 0);
    const myUnits = engine.units.filter(u => u.team === teamId && u.hp > 0 && !(u.garrisonedIn || u.garrisonId));
    const cc = myBuildings.find(b => b.def.isCommandCenter) || myBuildings[0];
    if (!cc) return;

    // 1. Ensure AI has at least 1 Builder (Dozer / Worker) and repair damaged structures
    const builderId = fId === 'USA' ? 'USA_DOZER' : fId === 'CHINA' ? 'CHINA_DOZER' : 'GLA_WORKER';
    const builders = myUnits.filter(u => u.def.isBuilder);
    if (builders.length === 0 && cc.constructed && cc.queue.length === 0) {
      engine.queueProduction(cc, builderId);
    }

    const damagedBuilding = myBuildings.find(b => b.constructed && b.hp < b.maxHp * 0.75);
    if (damagedBuilding) {
      const idleBuilder = builders.find(u => u.state === 'IDLE');
      if (idleBuilder) {
        idleBuilder.state = 'BUILD';
        idleBuilder.buildTargetId = damagedBuilding.id;
        idleBuilder.targetX = damagedBuilding.x;
        idleBuilder.targetY = damagedBuilding.y;
      }
    }

    // 2. Ensure AI Harvesters are gathering
    for (const u of myUnits) {
      if (u.def.isHarvester && u.state === 'IDLE') {
        if (u.def.isBuilder && builders.filter(b => b.state === 'BUILD').length === 0 && myBuildings.length < 7) {
          continue;
        }
        engine.assignNearestSupplyDock(u);
      }
    }

    // 3. Base Construction Progression using General-specific Doctrine
    const unbuiltFoundation = myBuildings.find(b => !b.constructed && b.hp > 0);
    if (unbuiltFoundation) {
      const assignedBuilder = builders.find(u => u.state === 'BUILD' && u.buildTargetId === unbuiltFoundation.id);
      if (!assignedBuilder) {
        const freeBuilder = builders.find(u => u.state === 'IDLE') || builders[0];
        if (freeBuilder) {
          freeBuilder.state = 'BUILD';
          freeBuilder.buildTargetId = unbuiltFoundation.id;
          freeBuilder.targetX = unbuiltFoundation.x;
          freeBuilder.targetY = unbuiltFoundation.y;
        }
      }
    }

    const hasFreeBuilder = builders.some(u => u.state === 'IDLE') || !unbuiltFoundation;
    const countBuilding = (id) => myBuildings.filter(b => b.defId === id).length;
    const desiredBuildOrder = doctrine.buildOrder || getBuildOrderForFaction(fId);
    const dirSign = teamId === 0 ? -1 : 1;
    if (hasFreeBuilder) {
      for (let i = 0; i < desiredBuildOrder.length; i++) {
        const item = desiredBuildOrder[i];
        const bDef = ZH_DATA.BUILDINGS[item.id];
        if (!bDef || !engine.isEntityUnlocked(item.id, teamId)) continue;
        // Phase 3 (8.3): Easy difficulty does not construct superweapons
        if (isEasy && bDef.isSuperweapon) continue;
        if (countBuilding(item.id) < item.count) {
          const slot = BASE_OFFSETS[i % BASE_OFFSETS.length];
          const spot = engine.findValidBuildSpot
            ? engine.findValidBuildSpot(item.id, cc.x, cc.y, i)
            : { x: cc.x + slot.dx * dirSign + (rng(engine) - 0.5) * 28, y: cc.y + slot.dy * dirSign + (rng(engine) - 0.5) * 28 };
          if (spot && engine.startBuildingPlacement(item.id, teamId, spot.x, spot.y)) {
            break;
          }
        }
      }
    }

    // Extra reactor if AI is in low power
    if (aiTeam.isLowPower && fId !== 'GLA' && hasFreeBuilder) {
      const reactorId = fId === 'USA' ? 'USA_REACTOR' : 'CHINA_REACTOR';
      const spot = engine.findValidBuildSpot
        ? engine.findValidBuildSpot(reactorId, cc.x, cc.y, 0)
        : { x: cc.x + (rng(engine) - 0.5) * 320, y: cc.y + (rng(engine) - 0.5) * 320 };
      if (spot) {
        engine.startBuildingPlacement(reactorId, teamId, spot.x, spot.y);
      }
    }

    // 4. Train Army (with Dynamic Counter-Composition Weighting) & Research Upgrades
    // Phase 3 (8.3): Easy AI uses base doctrine weights without counter-adaptation and skips tech upgrades; Hard AI prioritizes upgrades at credits > 800
    const counterWeights = isEasy ? (doctrine.unitWeights || {}) : computeCounterWeights(engine, aiTeam.generalId, enemyTeamId);
    const upgradeCreditThreshold = isHard ? 800 : 1200;
    const maxQueueDepth = isHard ? 3 : isEasy ? 1 : 2;
    for (const b of myBuildings) {
      if (!b.constructed || b.queue.length >= maxQueueDepth) continue;

      if (!isEasy && b.def.upgrades && b.def.upgrades.length > 0 && aiTeam.credits > upgradeCreditThreshold) {
        for (const upgId of b.def.upgrades) {
          if (!aiTeam.upgrades.has(upgId)) {
            engine.queueProduction(b, upgId);
            break;
          }
        }
      }

      if (b.def.trains && b.def.trains.length > 0) {
        const candidates = b.def.trains.filter(
          uId => ZH_DATA.UNITS[uId] &&
                 !ZH_DATA.UNITS[uId].isBuilder &&
                 !ZH_DATA.UNITS[uId].isHarvester &&
                 engine.isEntityUnlocked(uId, teamId)
        );
        if (candidates.length > 0) {
          const pick = pickUnitForGeneral(aiTeam.generalId, candidates, counterWeights, engine);
          engine.queueProduction(b, pick);
        }
      }
    }

    // 5. Tech Building Capture & Civilian Garrisoning Orders
    const capturers = myUnits.filter(u => u.def.canCapture && u.state === 'IDLE');
    if (capturers.length > 0 && Array.isArray(engine.techStructures)) {
      const uncapturedTech = engine.techStructures.filter(t => t.team !== teamId && t.hp > 0);
      if (uncapturedTech.length > 0) {
        const capUnit = capturers[0];
        let bestTech = uncapturedTech[0];
        let bestDist = Math.hypot(bestTech.x - capUnit.x, bestTech.y - capUnit.y);
        for (const t of uncapturedTech) {
          const d = Math.hypot(t.x - capUnit.x, t.y - capUnit.y);
          if (d < bestDist) {
            bestDist = d;
            bestTech = t;
          }
        }
        capUnit.state = 'CAPTURE';
        capUnit.targetEntity = bestTech;
        capUnit.targetEntityId = bestTech.id;
        capUnit.targetX = bestTech.x;
        capUnit.targetY = bestTech.y;
      }
    }

    if (Array.isArray(engine.garrisonBunkers)) {
      const openBunkers = engine.garrisonBunkers.filter(
        gb => gb.hp > 0 && (gb.team === -1 || gb.team === teamId) && gb.occupants.length < (gb.maxOccupants || gb.capacity || 6)
      );
      if (openBunkers.length > 0) {
        const idleInf = myUnits.filter(
          u => u.def.category === 'INFANTRY' && !u.def.isBuilder && !u.def.isHacker && u.state === 'IDLE'
        );
        if (idleInf.length > 0 && rng(engine) < 0.45) {
          const inf = idleInf[0];
          const bunker = openBunkers[0];
          inf.state = 'ENTER_GARRISON';
          inf.targetEntity = bunker;
          inf.targetEntityId = bunker.id;
          inf.targetX = bunker.x;
          inf.targetY = bunker.y;
        }
      }
    }

    // 6. Tactical Active Micro-Abilities for AI Units (Normal & Hard)
    const enemyUnits = engine.units.filter(u => u.team === enemyTeamId && isEnemyVisibleToAI(engine, u, teamId));
    if (!isEasy) {
      for (const u of myUnits) {
        const abId = u.def.abilityId || (typeof u.def.ability === 'string' ? u.def.ability : (u.def.ability && u.def.ability.id));
        if (!abId || (u.abilityCooldown || 0) > 0) continue;
        if (abId === 'OVERLORD_SPEAKER' || abId === 'OVERLORD_GATLING') {
          engine.triggerUnitAbility(u.id, u.x, u.y);
        } else if (abId === 'PILOT_SNIPE' || abId === 'HIJACK_VEHICLE') {
          const enemyVeh = enemyUnits.find(
            e => (e.def.category === 'TANK' || e.def.category === 'LIGHT_VEHICLE') && !e.unmanned && Math.hypot(e.x - u.x, e.y - u.y) <= 300
          );
          if (enemyVeh) {
            engine.triggerUnitAbility(u.id, enemyVeh.x, enemyVeh.y, enemyVeh);
          }
        } else if (abId === 'FLASHBANG' || abId === 'FLAME_WALL' || abId === 'LASER_LOCK') {
          const nearEnemy = enemyUnits.find(e => Math.hypot(e.x - u.x, e.y - u.y) <= 240);
          if (nearEnemy) {
            engine.triggerUnitAbility(u.id, nearEnemy.x, nearEnemy.y, nearEnemy);
          }
        }
      }
    }

    // 7. Intelligent Cluster & Power-Grid Combo Engine (Generals Powers + Superweapons)
    if (aiTeam.generalPoints > 0) {
      const powers = ZH_DATA.GENERALS_POWERS[fId] || [];
      for (const p of powers) {
        if (isEasy && p.rankReq > 1) continue; // Easy AI only unlocks Rank 1 powers
        if (!aiTeam.unlockedPowers.has(p.id) && aiTeam.rank >= p.rankReq) {
          engine.unlockGeneralsPower(teamId, p.id);
          break;
        }
      }
    }

    const clusterTarget = findBestClusterTarget(engine, enemyTeamId, 260, !isEasy);
    const powerMinTime = isHard ? 65 : isEasy ? 150 : 90;

    if ((engine.matchTime || 0) >= powerMinTime) {
      for (const pId of aiTeam.unlockedPowers) {
        if ((aiTeam.powerCooldowns[pId] || 0) <= 0) {
          engine.castGeneralsPower(teamId, pId, clusterTarget.x, clusterTarget.y);
          break;
        }
      }
    }

    if (!isEasy) {
      for (const b of myBuildings) {
        if (b.constructed && b.def.isSuperweapon && b.superweaponReady) {
          engine.fireSuperweapon(b.id, clusterTarget.x, clusterTarget.y);
        }
      }
    }

    // 8. Phase 4 (SYS-26): Multi-Squad Tactical Micro (BASE_DEFENSE, FLANKER Dozer/Harvester Raid, VANGUARD Push)
    const combatUnits = myUnits.filter(u => !u.def.isBuilder && !u.def.isHarvester && !u.def.isHacker);
    // Retreat micro on Hard/Brutal: pull critically damaged vehicles back toward Command Center
    const retreatThreshold = isBrutal ? 0.30 : isHard ? 0.22 : 0;
    if (retreatThreshold > 0) {
      for (const u of combatUnits) {
        if (u.hp > 0 && u.hp < u.maxHp * retreatThreshold && Math.hypot(u.x - cc.x, u.y - cc.y) > 260) {
          u.state = 'MOVE';
          u.targetEntity = null;
          u.targetX = cc.x + (rng(engine) - 0.5) * 90;
          u.targetY = cc.y + (rng(engine) - 0.5) * 90;
        }
      }
    }
    const baseWave = doctrine.waveSize || 6;
    const waveSize = isHard ? Math.max(4, baseWave - 1) : isEasy ? baseWave + 2 : baseWave;
    // Phase 3 (8.3): Easy uses single-lane vanguard push (flankRatio = 0); Hard uses aggressive multi-angle flank raids
    const flankRatio = isEasy ? 0 : isHard ? Math.max(0.45, doctrine.flankRatio || 0.35) : (doctrine.flankRatio || 0.35);

    const squads = assignSquadRoles(combatUnits, flankRatio, cc);

    // Base Defense squad maintains GUARD leash around Command Center
    for (const defUnit of squads.defenders) {
      if (defUnit.state === 'IDLE') {
        defUnit.state = 'GUARD';
        defUnit.guardX = cc.x + (rng(engine) - 0.5) * 120;
        defUnit.guardY = cc.y + (rng(engine) - 0.5) * 120;
        defUnit.targetX = defUnit.guardX;
        defUnit.targetY = defUnit.guardY;
      }
    }

    if (combatUnits.length >= waveSize || tState.wave >= 40) {
      tState.wave = 0;
      if (teamId === 1) waveTimer = 0;

      // Dispatch FLANKER squad to hunt exposed enemy Builders/Harvesters or flank via outer corridors
      const sharedRaidTarget = !isEasy ? findHighValueRaidTarget(engine, cc.x, cc.y, enemyTeamId) : null;
      squads.flankers.forEach((u, idx) => {
        if (u.state === 'IDLE') {
          const destX = sharedRaidTarget ? sharedRaidTarget.x : clusterTarget.x;
          const destY = sharedRaidTarget ? sharedRaidTarget.y : clusterTarget.y;
          u.state = 'ATTACK_MOVE';
          const flankX = Math.max(220, Math.min(engine.worldSize - 220, destX + (idx % 2 === 0 ? -380 : 420)));
          const flankY = Math.max(220, Math.min(engine.worldSize - 220, destY + (idx % 2 === 0 ? -420 : 360)));
          u.waypoints = [
            { x: flankX, y: flankY },
            { x: destX + (rng(engine) - 0.5) * 90, y: destY + (rng(engine) - 0.5) * 90 }
          ];
          u.targetX = u.waypoints[0].x;
          u.targetY = u.waypoints[0].y;
        }
      });

      // Dispatch VANGUARD squad to crush primary cluster target (share one A* corridor per wave)
      let sharedVanguardPath = null;
      squads.vanguard.forEach((u) => {
        if (u.state === 'IDLE') {
          u.state = 'ATTACK_MOVE';
          const offX = (rng(engine) - 0.5) * 140;
          const offY = (rng(engine) - 0.5) * 140;
          u.targetX = clusterTarget.x + offX;
          u.targetY = clusterTarget.y + offY;
          if (engine.navGrid) {
            if (!sharedVanguardPath) {
              sharedVanguardPath = engine.navGrid.findPath(u.x, u.y, clusterTarget.x, clusterTarget.y, u.def.locomotor || 'TRACKED');
            }
            if (sharedVanguardPath && sharedVanguardPath.length > 0) {
              u.waypoints = sharedVanguardPath.map((wp, idx) =>
                idx === sharedVanguardPath.length - 1
                  ? { x: u.targetX, y: u.targetY }
                  : { x: wp.x + offX * 0.35, y: wp.y + offY * 0.35 }
              );
              u.targetX = u.waypoints[0].x;
              u.targetY = u.waypoints[0].y;
            } else {
              u.waypoints = [{ x: u.targetX, y: u.targetY }];
            }
          }
        }
      });
    }
  }

  function getBuildOrderForFaction(fId) {
    if (fId === 'USA') return GENERAL_DOCTRINES.USA_GRANGER.buildOrder;
    if (fId === 'CHINA') return GENERAL_DOCTRINES.CHINA_KWAI.buildOrder;
    return GENERAL_DOCTRINES.GLA_THRAX.buildOrder;
  }

  function pickUnitForGeneral(generalId, candidates, customWeights = null, engine = null) {
    const doctrine = GENERAL_DOCTRINES[generalId];
    const weights = customWeights || (doctrine && doctrine.unitWeights);
    if (!weights) {
      return candidates[Math.floor(rng(engine) * candidates.length)];
    }
    let totalWeight = 0;
    const weightedList = candidates.map(uId => {
      const w = weights[uId] || 1;
      totalWeight += w;
      return { id: uId, weight: w };
    });
    let roll = rng(engine) * totalWeight;
    for (const item of weightedList) {
      roll -= item.weight;
      if (roll <= 0) return item.id;
    }
    return candidates[candidates.length - 1];
  }

  function serializeState() {
    return {
      thinkTimer,
      tauntTimer,
      waveTimer,
      teamTimers: JSON.parse(JSON.stringify(teamTimers))
    };
  }

  function deserializeState(state) {
    if (!state) return;
    thinkTimer = state.thinkTimer !== undefined ? state.thinkTimer : 0;
    tauntTimer = state.tauntTimer !== undefined ? state.tauntTimer : 18;
    waveTimer = state.waveTimer !== undefined ? state.waveTimer : 0;
    if (state.teamTimers) {
      if (state.teamTimers[0]) Object.assign(teamTimers[0], state.teamTimers[0]);
      if (state.teamTimers[1]) Object.assign(teamTimers[1], state.teamTimers[1]);
    }
  }

  return {
    update,
    updateTeam,
    resetTimers,
    GENERAL_DOCTRINES,
    pickUnitForGeneral,
    findBestClusterTarget,
    findHighValueRaidTarget,
    computeCounterWeights,
    assignSquadRoles,
    serializeState,
    deserializeState
  };
})();

