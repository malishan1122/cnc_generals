// ============================================================================
// Command & Conquer: Generals — Zero Hour (macOS Clean-Room Edition)
// js/ai_policies.js — Declarative Unit Capabilities, Unit Micro-AI Brains,
//                     Commander Macro Policies & Headless RL / Evolution Harness
// ============================================================================

window.ZH_AI_POLICIES = (function () {
  'use strict';

  const STORAGE_KEY = 'zh_ai_studio_policies_v1';

  // Baseline snapshots so any unit capability or brain can be reset cleanly
  const BASELINE_UNITS = {};
  const BASELINE_LOCOMOTORS = {};
  const BASELINE_BRAINS = {};
  const BASELINE_COMMANDERS = {};

  // Active live registries
  const UNIT_CAPABILITY_OVERRIDES = {};
  const UNIT_BRAINS = {};
  const COMMANDER_STRATEGIES = {};

  // Posture Archetype Presets for one-click assignment in AI Studio
  const POSTURE_ARCHETYPES = {
    STAND_GROUND: {
      id: 'STAND_GROUND',
      name: 'Stand Ground Brawler',
      desc: 'Closes to effective weapon range and trades fire directly. Ideal for heavy main battle tanks and basic infantry.',
      posture: 'STAND_GROUND',
      preferredRangeFrac: 0.85,
      kiteDangerFrac: 0.0,
      retreatHpPct: 0.15,
      dodgeHazards: true,
      autoAbility: true,
      focusLowHpWeight: 0.65,
      counterBiasWeight: 0.80
    },
    KITE_SKIRMISHER: {
      id: 'KITE_SKIRMISHER',
      name: 'Kite at Max Range',
      desc: 'Maintains standoff distance (~88% weapon range) and reverses/repositions away whenever enemies close inside danger radius.',
      posture: 'KITE_SKIRMISHER',
      preferredRangeFrac: 0.90,
      kiteDangerFrac: 0.62,
      retreatHpPct: 0.28,
      dodgeHazards: true,
      autoAbility: true,
      focusLowHpWeight: 0.95,
      counterBiasWeight: 1.15
    },
    HIT_AND_RUN: {
      id: 'HIT_AND_RUN',
      name: 'Hit-and-Run Raider',
      desc: 'Darts into range to fire a burst/salvo, then pulls back while weapon is on cooldown. Prioritize harvesters and light targets.',
      posture: 'HIT_AND_RUN',
      preferredRangeFrac: 0.88,
      kiteDangerFrac: 0.72,
      retreatHpPct: 0.32,
      dodgeHazards: true,
      autoAbility: true,
      focusLowHpWeight: 1.10,
      counterBiasWeight: 1.25
    },
    CRUSH_ASSAULT: {
      id: 'CRUSH_ASSAULT',
      name: 'Heavy Armor Crush',
      desc: 'Aggressively drives through enemy infantry squads to crush them under treads while firing main cannon at enemy armor.',
      posture: 'CRUSH_ASSAULT',
      preferredRangeFrac: 0.65,
      kiteDangerFrac: 0.0,
      retreatHpPct: 0.12,
      dodgeHazards: true,
      autoAbility: true,
      focusLowHpWeight: 0.55,
      counterBiasWeight: 0.90
    },
    ARTILLERY_SIEGE: {
      id: 'ARTILLERY_SIEGE',
      name: 'Long-Range Siege Artillery',
      desc: 'Holds maximum standoff range, prioritizes high-density clusters and base defenses, and immediately retreats if flanked.',
      posture: 'ARTILLERY_SIEGE',
      preferredRangeFrac: 0.96,
      kiteDangerFrac: 0.48,
      retreatHpPct: 0.35,
      dodgeHazards: true,
      autoAbility: true,
      focusLowHpWeight: 0.40,
      counterBiasWeight: 1.30
    }
  };

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // Infer a smart default Micro Brain for each unit based on its role & weapon
  function buildDefaultBrainForUnit(uId, def) {
    const w = def.weapon || {};
    const dmgType = w.damageType || 'SMALL_ARMS';
    const range = w.range || 150;
    const speed = def.speed || 70;

    let posture = 'STAND_GROUND';
    let preferredRangeFrac = 0.85;
    let kiteDangerFrac = 0.0;
    let retreatHpPct = 0.18;
    let focusLowHpWeight = 0.70;
    let counterBiasWeight = 0.90;

    const targetPriority = {
      INFANTRY: 1.0,
      LIGHT_VEHICLE: 1.0,
      TANK: 1.0,
      AIRCRAFT: w.antiAir ? 1.35 : 0.0,
      BUILDING: 0.55,
      HARVESTER: 1.35,
      HERO: 1.40
    };

    // Tailor by Damage Type
    if (dmgType === 'SNIPER') {
      posture = 'KITE_SKIRMISHER';
      preferredRangeFrac = 0.94;
      kiteDangerFrac = 0.65;
      retreatHpPct = 0.35;
      targetPriority.INFANTRY = 2.50;
      targetPriority.HERO = 2.80;
      targetPriority.TANK = 0.15;
      targetPriority.BUILDING = 0.10;
    } else if (dmgType === 'SMALL_ARMS') {
      targetPriority.INFANTRY = 1.65;
      targetPriority.LIGHT_VEHICLE = 1.05;
      targetPriority.TANK = 0.35;
      targetPriority.BUILDING = 0.35;
    } else if (dmgType === 'ARMOR_PIERCING') {
      targetPriority.TANK = 1.65;
      targetPriority.LIGHT_VEHICLE = 1.50;
      targetPriority.INFANTRY = 0.55;
      targetPriority.BUILDING = 0.85;
    } else if (dmgType === 'HIGH_EXPLOSIVE') {
      targetPriority.BUILDING = 1.45;
      targetPriority.INFANTRY = 1.35;
      targetPriority.LIGHT_VEHICLE = 1.20;
      targetPriority.TANK = 1.05;
    } else if (dmgType === 'FLAME_TOXIN') {
      targetPriority.INFANTRY = 1.95;
      targetPriority.BUILDING = 1.55;
      targetPriority.TANK = 0.45;
    }

    // Tailor by specific iconic Zero Hour unit behaviors
    if (
      uId === 'USA_HUMVEE' ||
      uId === 'GLA_ROCKET_BUGGY' ||
      uId === 'USA_PATHFINDER' ||
      uId === 'GLA_JARMEN_KELL'
    ) {
      posture = 'KITE_SKIRMISHER';
      preferredRangeFrac = 0.92;
      kiteDangerFrac = 0.64;
      retreatHpPct = 0.28;
      focusLowHpWeight = 1.05;
    } else if (
      uId === 'GLA_TECHNICAL' ||
      uId === 'GLA_COMBAT_CYCLE' ||
      uId === 'USA_COMANCHE' ||
      uId === 'CHINA_MIG' ||
      uId === 'CHINA_J16' ||
      uId === 'CHINA_NUKE_MIG' ||
      uId === 'USA_RAPTOR' ||
      uId === 'USA_KING_RAPTOR'
    ) {
      posture = 'HIT_AND_RUN';
      preferredRangeFrac = 0.88;
      kiteDangerFrac = 0.68;
      retreatHpPct = 0.30;
      targetPriority.HARVESTER = 1.85;
    } else if (
      uId === 'USA_TOMAHAWK' ||
      uId === 'CHINA_INFERNO_CANNON' ||
      uId === 'CHINA_NUKE_CANNON' ||
      uId === 'GLA_SCUD_LAUNCHER'
    ) {
      posture = 'ARTILLERY_SIEGE';
      preferredRangeFrac = 0.96;
      kiteDangerFrac = 0.50;
      retreatHpPct = 0.32;
      targetPriority.BUILDING = 1.65;
    } else if (
      uId === 'CHINA_OVERLORD' ||
      uId === 'CHINA_EMPEROR_OVERLORD' ||
      uId === 'GLA_MARAUDER'
    ) {
      posture = 'CRUSH_ASSAULT';
      preferredRangeFrac = 0.72;
      kiteDangerFrac = 0.0;
      retreatHpPct = 0.14;
      targetPriority.TANK = 1.75;
    } else if (
      range >= 210 &&
      speed >= 85 &&
      def.category === 'LIGHT_VEHICLE'
    ) {
      posture = 'KITE_SKIRMISHER';
      preferredRangeFrac = 0.90;
      kiteDangerFrac = 0.58;
    }

    return {
      unitId: uId,
      posture,
      preferredRangeFrac,
      kiteDangerFrac,
      retreatHpPct,
      dodgeHazards: true,
      autoAbility: true,
      focusLowHpWeight,
      counterBiasWeight,
      targetPriority
    };
  }

  function initRegistries() {
    if (!window.ZH_DATA) return;

    // 1. Snapshot Units & Build Default Brains
    for (const [uId, def] of Object.entries(ZH_DATA.UNITS)) {
      if (!BASELINE_UNITS[uId]) {
        BASELINE_UNITS[uId] = clone(def);
      }
      if (!UNIT_BRAINS[uId]) {
        const brain = buildDefaultBrainForUnit(uId, def);
        BASELINE_BRAINS[uId] = clone(brain);
        UNIT_BRAINS[uId] = clone(brain);
      }
    }

    // 2. Snapshot Locomotor Profiles
    if (window.ZH_SPATIAL && ZH_SPATIAL.LOCOMOTOR_PROFILES) {
      for (const [locoId, prof] of Object.entries(ZH_SPATIAL.LOCOMOTOR_PROFILES)) {
        if (!BASELINE_LOCOMOTORS[locoId]) {
          BASELINE_LOCOMOTORS[locoId] = clone(prof);
        }
      }
    }

    // 3. Snapshot & Extend Commander Doctrines
    if (window.ZH_AI && ZH_AI.GENERAL_DOCTRINES) {
      for (const [genId, doc] of Object.entries(ZH_AI.GENERAL_DOCTRINES)) {
        if (!BASELINE_COMMANDERS[genId]) {
          const extended = {
            generalId: genId,
            macroStyle: genId === 'CHINA_KWAI' || genId === 'GLA_JUHIZ' ? 'BLITZ_RUSH'
              : genId === 'USA_ALEXANDER' || genId === 'CHINA_TAO' ? 'TURTLE_SUPERWEAPON'
              : genId === 'GLA_KASSAD' ? 'GUERRILLA_SWARM'
              : 'BALANCED',
            waveSize: doc.waveSize || 6,
            flankRatio: doc.flankRatio !== undefined ? doc.flankRatio : 0.35,
            defenseRatio: doc.preferTurtling ? 0.32 : 0.18,
            retreatThreshold: 0.25,
            counterAdaptationGain: 1.0,
            harvesterTargetPerDepot: 2,
            firstAttackTimeSec: doc.waveSize <= 5 ? 42 : 55,
            preferTurtling: Boolean(doc.preferTurtling),
            preferGarrisons: Boolean(doc.preferGarrisons),
            preferAir: Boolean(doc.preferAir),
            targetScoring: {
              economyWeight: 1.45,
              powerWeight: 1.35,
              techWeight: 1.50,
              defenseAvoidance: 1.0,
              clusterRadius: 260
            },
            buildOrder: clone(doc.buildOrder || []),
            unitWeights: clone(doc.unitWeights || {})
          };
          BASELINE_COMMANDERS[genId] = clone(extended);
          COMMANDER_STRATEGIES[genId] = clone(extended);
        }
      }
    }

    loadSavedPolicies();
  }

  // ==========================================================================
  // Capability Override Management (Live Stats & Sensor Tuning)
  // ==========================================================================
  function getUnitCapabilities(unitId) {
    initRegistries();
    const def = ZH_DATA.UNITS[unitId];
    if (!def) return null;
    const locoId = def.locomotor || 'INFANTRY';
    const loco = (window.ZH_SPATIAL && ZH_SPATIAL.LOCOMOTOR_PROFILES && ZH_SPATIAL.LOCOMOTOR_PROFILES[locoId]) || {};
    return {
      unitId,
      name: def.name,
      faction: def.faction,
      category: def.category,
      locomotor: locoId,
      cost: def.cost,
      buildTime: def.buildTime,
      hp: def.hp,
      speed: def.speed,
      sight: def.sight,
      radius: def.radius,
      stealthed: Boolean(def.stealthed),
      pointDefenseLaser: Boolean(def.pointDefenseLaser),
      canCrushInfantry: def.canCrushInfantry !== undefined ? Boolean(def.canCrushInfantry) : Boolean(loco.canCrushInfantry),
      accelFrac: def.accelFrac !== undefined ? def.accelFrac : (loco.accelFrac || 4.0),
      decelFrac: def.decelFrac !== undefined ? def.decelFrac : (loco.decelFrac || 5.0),
      turnRateDeg: def.turnRateDeg !== undefined ? def.turnRateDeg : (loco.turnRateDeg || 180),
      weapon: def.weapon ? clone(def.weapon) : null,
      ability: def.ability ? clone(def.ability) : null
    };
  }

  function applyUnitCapabilityOverride(unitId, patch, activeEngine = null) {
    initRegistries();
    const def = ZH_DATA.UNITS[unitId];
    if (!def || !patch) return null;

    if (!UNIT_CAPABILITY_OVERRIDES[unitId]) {
      UNIT_CAPABILITY_OVERRIDES[unitId] = {};
    }
    const store = UNIT_CAPABILITY_OVERRIDES[unitId];

    const topScalarKeys = [
      'cost', 'buildTime', 'hp', 'speed', 'sight', 'radius',
      'category', 'locomotor', 'stealthed', 'pointDefenseLaser',
      'canCrushInfantry', 'accelFrac', 'decelFrac', 'turnRateDeg'
    ];
    for (const k of topScalarKeys) {
      if (patch[k] !== undefined) {
        def[k] = patch[k];
        store[k] = patch[k];
      }
    }

    if (patch.weapon && def.weapon) {
      if (!store.weapon) store.weapon = {};
      for (const [wk, wv] of Object.entries(patch.weapon)) {
        if (wv !== undefined) {
          def.weapon[wk] = wv;
          store.weapon[wk] = wv;
        }
      }
    }

    if (patch.ability && def.ability) {
      if (!store.ability) store.ability = {};
      for (const [ak, av] of Object.entries(patch.ability)) {
        if (av !== undefined) {
          def.ability[ak] = av;
          store.ability[ak] = av;
        }
      }
    }

    // Propagate live to any existing instances in an active GameEngine
    if (activeEngine && Array.isArray(activeEngine.units)) {
      for (const u of activeEngine.units) {
        if (u.defId === unitId && u.hp > 0) {
          const hpRatio = u.maxHp > 0 ? u.hp / u.maxHp : 1;
          u.maxHp = def.hp;
          u.hp = Math.max(1, Math.round(def.hp * hpRatio));
          u.speed = def.speed;
          u.radius = def.radius;
          u.locomotor = def.locomotor || u.locomotor;
        }
      }
    }

    return getUnitCapabilities(unitId);
  }

  function resetUnitCapabilities(unitId, activeEngine = null) {
    initRegistries();
    if (!BASELINE_UNITS[unitId]) return null;
    const base = clone(BASELINE_UNITS[unitId]);
    const target = ZH_DATA.UNITS[unitId];
    for (const k of Object.keys(target)) delete target[k];
    Object.assign(target, base);
    delete UNIT_CAPABILITY_OVERRIDES[unitId];

    if (activeEngine && Array.isArray(activeEngine.units)) {
      for (const u of activeEngine.units) {
        if (u.defId === unitId && u.hp > 0) {
          u.maxHp = target.hp;
          u.hp = Math.min(u.hp, u.maxHp);
          u.speed = target.speed;
          u.radius = target.radius;
        }
      }
    }
    return getUnitCapabilities(unitId);
  }

  // ==========================================================================
  // Unit Micro-AI Brain Management
  // ==========================================================================
  function getUnitBrain(unitId) {
    initRegistries();
    return UNIT_BRAINS[unitId] || null;
  }

  function updateUnitBrain(unitId, patch) {
    initRegistries();
    if (!UNIT_BRAINS[unitId]) return null;
    const brain = UNIT_BRAINS[unitId];
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'targetPriority' && v && typeof v === 'object') {
        Object.assign(brain.targetPriority, v);
      } else if (v !== undefined) {
        brain[k] = v;
      }
    }
    return brain;
  }

  function applyPostureArchetype(unitId, archetypeId) {
    initRegistries();
    const arch = POSTURE_ARCHETYPES[archetypeId];
    if (!arch || !UNIT_BRAINS[unitId]) return null;
    return updateUnitBrain(unitId, {
      posture: arch.posture,
      preferredRangeFrac: arch.preferredRangeFrac,
      kiteDangerFrac: arch.kiteDangerFrac,
      retreatHpPct: arch.retreatHpPct,
      dodgeHazards: arch.dodgeHazards,
      autoAbility: arch.autoAbility,
      focusLowHpWeight: arch.focusLowHpWeight,
      counterBiasWeight: arch.counterBiasWeight
    });
  }

  function resetUnitBrain(unitId) {
    initRegistries();
    if (!BASELINE_BRAINS[unitId]) return null;
    UNIT_BRAINS[unitId] = clone(BASELINE_BRAINS[unitId]);
    return UNIT_BRAINS[unitId];
  }

  // ==========================================================================
  // Commander Strategy Management
  // ==========================================================================
  function getCommanderStrategy(generalId) {
    initRegistries();
    return COMMANDER_STRATEGIES[generalId] || null;
  }

  function updateCommanderStrategy(generalId, patch) {
    initRegistries();
    if (!COMMANDER_STRATEGIES[generalId]) return null;
    const strat = COMMANDER_STRATEGIES[generalId];
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'targetScoring' && v && typeof v === 'object') {
        Object.assign(strat.targetScoring, v);
      } else if (k === 'unitWeights' && v && typeof v === 'object') {
        Object.assign(strat.unitWeights, v);
      } else if (k === 'buildOrder' && Array.isArray(v)) {
        strat.buildOrder = clone(v);
      } else if (v !== undefined) {
        strat[k] = v;
      }
    }
    // Sync into ZH_AI.GENERAL_DOCTRINES so live skirmishes immediately obey
    if (window.ZH_AI && ZH_AI.GENERAL_DOCTRINES && ZH_AI.GENERAL_DOCTRINES[generalId]) {
      const doc = ZH_AI.GENERAL_DOCTRINES[generalId];
      doc.waveSize = strat.waveSize;
      doc.flankRatio = strat.flankRatio;
      doc.preferTurtling = strat.preferTurtling;
      doc.preferGarrisons = strat.preferGarrisons;
      doc.preferAir = strat.preferAir;
      doc.buildOrder = clone(strat.buildOrder);
      doc.unitWeights = clone(strat.unitWeights);
    }
    return strat;
  }

  function resetCommanderStrategy(generalId) {
    initRegistries();
    if (!BASELINE_COMMANDERS[generalId]) return null;
    COMMANDER_STRATEGIES[generalId] = clone(BASELINE_COMMANDERS[generalId]);
    return updateCommanderStrategy(generalId, COMMANDER_STRATEGIES[generalId]);
  }

  // ==========================================================================
  // Runtime Target Scoring & Unit Micro Execution (Called by GameEngine)
  // ==========================================================================
  function evaluateTargetEffectiveDistance(attacker, target, rawDistance, maxRange) {
    const brain = UNIT_BRAINS[attacker.defId];
    if (!brain) {
      return target.isBuilding ? rawDistance + 25 : rawDistance;
    }

    let priorityMult = 1.0;
    const tp = brain.targetPriority || {};

    if (target.isBuilding) {
      priorityMult = tp.BUILDING !== undefined ? tp.BUILDING : 0.55;
      if (target.def && target.def.weapon) {
        priorityMult *= 1.35; // Base defenses are higher priority than passive buildings
      }
    } else if (target.isUnit && target.def) {
      const cat = target.def.category || 'INFANTRY';
      priorityMult = tp[cat] !== undefined ? tp[cat] : 1.0;
      if ((target.def.isAir || cat === 'AIRCRAFT') && attacker.def && attacker.def.weapon && attacker.def.weapon.antiAir) {
        priorityMult = Math.max(priorityMult, 1.55);
      }
      if (target.def.isHarvester && tp.HARVESTER !== undefined) {
        priorityMult = Math.max(priorityMult, tp.HARVESTER);
      }
      if (target.def.isHero && tp.HERO !== undefined) {
        priorityMult = Math.max(priorityMult, tp.HERO);
      }
    }

    if (priorityMult <= 0.05) return Infinity;

    // Counter-matrix multiplier bonus (prefer targets my weapon counters well)
    let counterMult = 1.0;
    if (attacker.def && attacker.def.weapon && window.ZH_DATA && ZH_DATA.DAMAGE_MATRIX) {
      const dmgType = attacker.def.weapon.damageType || 'SMALL_ARMS';
      const armorCat = target.isBuilding ? 'BUILDING' : (target.def && target.def.category) || 'INFANTRY';
      const row = ZH_DATA.DAMAGE_MATRIX[dmgType];
      const scalar = row && row[armorCat] !== undefined ? row[armorCat] : 1.0;
      counterMult = 1.0 + (scalar - 1.0) * (brain.counterBiasWeight !== undefined ? brain.counterBiasWeight : 0.8);
      counterMult = Math.max(0.25, counterMult);
    }

    // Focus-fire low-HP bonus
    let lowHpBonus = 1.0;
    if (target.maxHp > 0 && target.hp > 0) {
      const missingFrac = 1.0 - (target.hp / target.maxHp);
      lowHpBonus = 1.0 + missingFrac * (brain.focusLowHpWeight !== undefined ? brain.focusLowHpWeight : 0.7);
    }

    const totalDesirability = Math.max(0.15, priorityMult * counterMult * lowHpBonus);
    // Lower effective distance score = more desirable target
    return (rawDistance + 30) / totalDesirability;
  }

  // Executes per-unit micro-tactics (kiting, hit-and-run, crush, hazard dodge, ability usage)
  // Returns true if the micro-brain took control of movement/action for this tick
  function stepUnitMicroBrain(engine, u, dt) {
    if (!u || u.hp <= 0 || !u.def) return false;
    if (u.locomotor === 'AIRCRAFT') return false;
    // Do not override explicit non-combat player orders
    if (
      u.state === 'BUILD' ||
      u.state === 'HARVEST' ||
      u.state === 'RETURN_SUPPLY' ||
      u.state === 'ENTER_TUNNEL' ||
      u.state === 'ENTER_GARRISON' ||
      u.state === 'ENTER_TRANSPORT' ||
      u.state === 'RECREW_VEHICLE' ||
      u.state === 'CAPTURE' ||
      u.state === 'REARM_AIRCRAFT'
    ) {
      u._aiThought = u.state;
      return false;
    }

    const brain = UNIT_BRAINS[u.defId];
    if (!brain) return false;

    // 1. Hazard Avoidance Reflex (Step out of Radiation / Toxin / Flame pools)
    if (brain.dodgeHazards && !u.def.isAir && Array.isArray(engine.hazards) && engine.hazards.length > 0) {
      for (const h of engine.hazards) {
        if (h.team === u.team && h.type !== 'RADIATION') continue;
        const dx = u.x - h.x;
        const dy = u.y - h.y;
        const d = Math.hypot(dx, dy);
        if (d < h.radius + u.radius + 12) {
          const escAng = d > 1 ? Math.atan2(dy, dx) : (u.angle || 0);
          const escX = Math.max(40, Math.min(engine.worldSize - 40, h.x + Math.cos(escAng) * (h.radius + 48)));
          const escY = Math.max(40, Math.min(engine.worldSize - 40, h.y + Math.sin(escAng) * (h.radius + 48)));
          engine.moveUnitToward(u, escX, escY, dt);
          u._aiThought = `DODGE ${h.type}`;
          u._aiVector = { x: escX, y: escY, color: '#f97316' };
          return true;
        }
      }
    }

    // 2. Self-Preservation Retreat Reflex
    if (brain.retreatHpPct > 0 && u.hp < u.maxHp * brain.retreatHpPct && u.state !== 'MOVE') {
      // Find friendly healer/Propaganda or Command Center / Supply Depot
      const safeAnchor = engine.buildings.find(
        b => b.team === u.team && b.constructed && b.hp > 0 &&
          (b.defId === 'CHINA_SPEAKER_TOWER' || b.def.isCommandCenter || b.def.isSupplyDepot)
      );
      if (safeAnchor) {
        const dAnchor = Math.hypot(u.x - safeAnchor.x, u.y - safeAnchor.y);
        if (dAnchor > 160) {
          engine.moveUnitToward(u, safeAnchor.x, safeAnchor.y, dt);
          u._aiThought = `RETREAT (${Math.round((u.hp / u.maxHp) * 100)}% HP)`;
          u._aiVector = { x: safeAnchor.x, y: safeAnchor.y, color: '#38bdf8' };
          return true;
        }
      }
    }

    // 3. Autonomous Special Ability Execution ([F] abilities)
    if (brain.autoAbility && u.def.ability && (u.abilityCooldown || 0) <= 0) {
      const abId = u.def.ability.id;
      const abRange = u.def.ability.range || 200;

      if (abId === 'OVERLORD_SPEAKER' && !u.overlordAddon && u.hp < u.maxHp * 0.85) {
        engine.triggerUnitAbility(u.id);
        u._aiThought = 'EQUIP SPEAKER TOWER';
      } else if (abId === 'OVERLORD_GATTLING' && !u.overlordAddon) {
        engine.triggerUnitAbility(u.id);
        u._aiThought = 'EQUIP GATTLING CANNON';
      } else if (abId === 'SNIPE_DRIVER') {
        let bestVeh = null;
        let bestCost = 0;
        for (const e of engine.units) {
          if (e.team !== u.team && e.team >= 0 && e.hp > 0 && !e.unmanned &&
              (e.def.category === 'TANK' || e.def.category === 'LIGHT_VEHICLE')) {
            const d = Math.hypot(e.x - u.x, e.y - u.y);
            if (d <= abRange + 30 && (e.def.cost || 500) > bestCost) {
              bestCost = e.def.cost || 500;
              bestVeh = e;
            }
          }
        }
        if (bestVeh) {
          engine.triggerUnitAbility(u.id, bestVeh.x, bestVeh.y, bestVeh);
          u._aiThought = `SNIPE ${bestVeh.def.shortName}`;
          return true;
        }
      } else if (abId === 'HIJACK') {
        let bestVeh = null;
        let bestCost = 0;
        for (const e of engine.units) {
          if (e.team !== u.team && e.team >= 0 && e.hp > 0 &&
              (e.def.category === 'TANK' || e.def.category === 'LIGHT_VEHICLE')) {
            const d = Math.hypot(e.x - u.x, e.y - u.y);
            if (d <= 220 && (e.def.cost || 500) > bestCost) {
              bestCost = e.def.cost || 500;
              bestVeh = e;
            }
          }
        }
        if (bestVeh && u.state !== 'HIJACK_VEHICLE') {
          u.state = 'HIJACK_VEHICLE';
          u.targetEntityId = bestVeh.id;
          u._aiThought = `HIJACK ${bestVeh.def.shortName}`;
          return true;
        }
      } else if (abId === 'LASER_LOCK' || abId === 'FLASHBANG' || abId === 'FLAME_WALL' || abId === 'EW_JAM_PULSE') {
        const target = u.targetEntity || (u.targetEntityId ? engine.findEntityById(u.targetEntityId) : null);
        if (target && target.hp > 0 && target.team !== u.team) {
          const d = Math.hypot(target.x - u.x, target.y - u.y);
          if (d <= abRange) {
            if (abId !== 'LASER_LOCK' || (target.isUnit && (target.def.category === 'TANK' || target.def.category === 'LIGHT_VEHICLE' || target.def.category === 'AIRCRAFT'))) {
              engine.triggerUnitAbility(u.id, target.x, target.y, target);
              u._aiThought = `ABILITY: ${abId}`;
            }
          }
        }
      } else if (abId === 'DETONATE') {
        for (const e of engine.units) {
          if (e.team !== u.team && e.team >= 0 && e.hp > 0 && Math.hypot(e.x - u.x, e.y - u.y) <= 56) {
            engine.triggerUnitAbility(u.id, u.x, u.y, e);
            u._aiThought = 'DETONATE!';
            return true;
          }
        }
      }
    }

    if (!u.def.weapon) return false;
    if (u.state !== 'IDLE' && u.state !== 'ATTACK_MOVE' && u.state !== 'ATTACK') return false;

    const wRange = engine.getEffectiveWeaponRange(u);
    const scanRange = u.state === 'IDLE' ? Math.max(wRange + 40, u.def.sight * 0.85) : Math.max(wRange + 55, u.def.sight * 0.90);

    u.scanCooldown = Math.max(0, (u.scanCooldown || 0) - dt);
    let enemy = null;
    if (u.state === 'ATTACK' && u.targetEntityId) {
      enemy = engine.findEntityById(u.targetEntityId);
      if (!enemy || enemy.hp <= 0 || enemy.unmanned) enemy = null;
    }
    if (!enemy && u.scanCooldown <= 0) {
      enemy = engine.findBestTarget(u, scanRange, u.def.weapon.antiAir);
      u.targetEntity = enemy || null;
      u.scanCooldown = 0.10 + ((u.id & 7) * 0.015);
    } else if (!enemy && u.targetEntity && u.targetEntity.hp > 0 && !u.targetEntity.unmanned) {
      enemy = u.targetEntity;
    }

    if (!enemy) {
      u._aiThought = u.state;
      u._aiVector = null;
      return false;
    }

    const rawD = Math.hypot(enemy.x - u.x, enemy.y - u.y);
    const edgeD = rawD - (enemy.radius || 0);
    const posture = brain.posture || 'STAND_GROUND';
    const kiteDist = wRange * (brain.kiteDangerFrac || 0);
    const prefDist = wRange * (brain.preferredRangeFrac || 0.88);

    // 4A. CRUSH_ASSAULT Posture: Heavy tanks drive directly over enemy infantry
    if (
      posture === 'CRUSH_ASSAULT' &&
      enemy.isUnit &&
      enemy.def &&
      enemy.def.category === 'INFANTRY' &&
      rawD <= wRange * 1.15
    ) {
      engine.moveUnitToward(u, enemy.x, enemy.y, dt);
      if (edgeD <= wRange) {
        u.turretAngle = Math.atan2(enemy.y - u.y, enemy.x - u.x);
        if (u.attackCooldown <= 0) {
          engine.fireWeapon(u, enemy, u.def.weapon);
          u.attackCooldown = u.def.weapon.cooldown;
        }
      }
      u._aiThought = `CRUSH ${enemy.def.shortName}`;
      u._aiVector = { x: enemy.x, y: enemy.y, color: '#ef4444' };
      return true;
    }

    // 4B. KITE_SKIRMISHER & HIT_AND_RUN & ARTILLERY_SIEGE Kiting Logic
    if (
      (posture === 'KITE_SKIRMISHER' || posture === 'HIT_AND_RUN' || posture === 'ARTILLERY_SIEGE') &&
      kiteDist > 0 &&
      edgeD <= wRange
    ) {
      u.turretAngle = Math.atan2(enemy.y - u.y, enemy.x - u.x);

      // Fire weapon whenever ready!
      if (u.attackCooldown <= 0) {
        engine.fireWeapon(u, enemy, u.def.weapon);
        u.attackCooldown = u.def.weapon.cooldown;
      }

      // Should we kite/reposition away right now?
      const shouldKite =
        (edgeD < kiteDist && u.attackCooldown > 0.12) ||
        (posture === 'HIT_AND_RUN' && u.attackCooldown > u.def.weapon.cooldown * 0.35 && edgeD < prefDist);

      if (shouldKite && enemy.isUnit && !enemy.isBuilding) {
        // Compute threat repulsion vector from nearby enemies
        let repX = u.x - enemy.x;
        let repY = u.y - enemy.y;
        const repLen = Math.hypot(repX, repY) || 1;
        repX /= repLen;
        repY /= repLen;

        let kiteX = u.x + repX * 110;
        let kiteY = u.y + repY * 110;
        // If near map wall, strafe tangentially so kiting unit never corners itself
        const margin = 120;
        if (kiteX < margin || kiteX > engine.worldSize - margin || kiteY < margin || kiteY > engine.worldSize - margin) {
          const tangX = -repY * ((u.id % 2 === 0) ? 1 : -1);
          const tangY = repX * ((u.id % 2 === 0) ? 1 : -1);
          kiteX = Math.max(55, Math.min(engine.worldSize - 55, u.x + (repX * 0.35 + tangX * 0.85) * 120));
          kiteY = Math.max(55, Math.min(engine.worldSize - 55, u.y + (repY * 0.35 + tangY * 0.85) * 120));
        }

        engine.moveUnitToward(u, kiteX, kiteY, dt);
        u._aiThought = `${posture === 'HIT_AND_RUN' ? 'HIT&RUN' : 'KITE'} vs ${enemy.def ? enemy.def.shortName : 'ENEMY'}`;
        u._aiVector = { x: kiteX, y: kiteY, color: '#fde047' };
        return true;
      }

      u._aiThought = `ENGAGE ${enemy.def ? enemy.def.shortName : 'BLDG'}`;
      u._aiVector = { x: enemy.x, y: enemy.y, color: '#22c55e' };
      return true;
    }

    // Default engagement thought annotation
    if (edgeD <= wRange) {
      u._aiThought = `FIRE ${enemy.def ? enemy.def.shortName : 'TARGET'}`;
      u._aiVector = { x: enemy.x, y: enemy.y, color: '#22c55e' };
    } else {
      u._aiThought = `CLOSE ON ${enemy.def ? enemy.def.shortName : 'TARGET'}`;
      u._aiVector = { x: enemy.x, y: enemy.y, color: '#94a3b8' };
    }
    return false;
  }

  // ==========================================================================
  // Persistence & JSON Export / Import for Antigravity
  // ==========================================================================
  function exportPolicySnapshot() {
    initRegistries();
    return {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      unitCapabilityOverrides: clone(UNIT_CAPABILITY_OVERRIDES),
      unitBrains: clone(UNIT_BRAINS),
      commanderStrategies: clone(COMMANDER_STRATEGIES)
    };
  }

  function importPolicySnapshot(snapshot, activeEngine = null) {
    if (!snapshot || typeof snapshot !== 'object') return false;
    initRegistries();

    if (snapshot.unitCapabilityOverrides) {
      for (const [uId, patch] of Object.entries(snapshot.unitCapabilityOverrides)) {
        applyUnitCapabilityOverride(uId, patch, activeEngine);
      }
    }
    if (snapshot.unitBrains) {
      for (const [uId, brain] of Object.entries(snapshot.unitBrains)) {
        updateUnitBrain(uId, brain);
      }
    }
    if (snapshot.commanderStrategies) {
      for (const [genId, strat] of Object.entries(snapshot.commanderStrategies)) {
        updateCommanderStrategy(genId, strat);
      }
    }
    savePoliciesToStorage();
    return true;
  }

  function savePoliciesToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(exportPolicySnapshot()));
    } catch (_) {
      // Ignore storage quota errors
    }
  }

  function loadSavedPolicies() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version) {
        if (parsed.unitCapabilityOverrides) {
          for (const [uId, patch] of Object.entries(parsed.unitCapabilityOverrides)) {
            applyUnitCapabilityOverride(uId, patch);
          }
        }
        if (parsed.unitBrains) {
          for (const [uId, brain] of Object.entries(parsed.unitBrains)) {
            if (UNIT_BRAINS[uId]) Object.assign(UNIT_BRAINS[uId], brain);
          }
        }
        if (parsed.commanderStrategies) {
          for (const [genId, strat] of Object.entries(parsed.commanderStrategies)) {
            updateCommanderStrategy(genId, strat);
          }
        }
        return true;
      }
    } catch (_) {
      // Ignore malformed storage
    }
    return false;
  }

  function resetAllPolicies(activeEngine = null) {
    initRegistries();
    for (const uId of Object.keys(BASELINE_UNITS)) {
      resetUnitCapabilities(uId, activeEngine);
      resetUnitBrain(uId);
    }
    for (const genId of Object.keys(BASELINE_COMMANDERS)) {
      resetCommanderStrategy(genId);
    }
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  }

  // ==========================================================================
  // Headless RL & Evolutionary Rollout Environment (window.ZH_RL_ENV)
  // ==========================================================================
  function extractObservation(engine, teamId = 0) {
    const enemyId = 1 - teamId;
    const myUnits = engine.units.filter(u => u.team === teamId && u.hp > 0);
    const enUnits = engine.units.filter(u => u.team === enemyId && u.hp > 0);

    const sumHp = list => list.reduce((acc, u) => acc + u.hp, 0);
    const sumCost = list => list.reduce((acc, u) => acc + ((u.def && u.def.cost) || 300), 0);
    const sumWeightedHp = list => list.reduce((acc, u) => {
      const c = (u.def && u.def.cost) || 300;
      const maxHp = u.maxHp || 100;
      return acc + (u.hp / maxHp) * c;
    }, 0);

    const myHp = sumHp(myUnits);
    const enHp = sumHp(enUnits);
    const myValue = sumWeightedHp(myUnits);
    const enValue = sumWeightedHp(enUnits);

    return {
      tick: engine.simTick || 0,
      gameTime: engine.gameTime || 0,
      myUnitCount: myUnits.length,
      enemyUnitCount: enUnits.length,
      myTotalHp: myHp,
      enemyTotalHp: enHp,
      myArmyValue: myValue,
      enemyArmyValue: enValue,
      myCredits: engine.teams[teamId] ? engine.teams[teamId].credits : 0,
      enemyCredits: engine.teams[enemyId] ? engine.teams[enemyId].credits : 0,
      vector: [
        myUnits.length / 20,
        enUnits.length / 20,
        myHp / 5000,
        enHp / 5000,
        myValue / 10000,
        enValue / 10000
      ]
    };
  }

  // Runs a deterministic headless micro battle and returns detailed telemetry + RL reward
  function runHeadlessMicroEpisode(scenario, options = {}) {
    const maxTicks = options.maxTicks || 60 * 35; // 35 seconds @ 60Hz
    const seed = options.seed !== undefined ? options.seed : 1337;

    const engine = new window.GameEngine(null, {
      playerGeneralId: scenario.team0General || 'USA_GRANGER',
      aiGeneralId: scenario.team1General || 'CHINA_KWAI',
      aiDifficulty: 'HARD',
      skirmishMapId: 'DESERT_STORM',
      seed
    });

    // Clear default skirmish base entities for a clean micro-arena test
    engine.units.length = 0;
    engine.buildings.length = 0;
    engine.supplyDocks.length = 0;
    engine.techStructures.length = 0;
    engine.garrisonBunkers.length = 0;
    engine.projectiles.length = 0;
    engine.hazards.length = 0;
    if (engine.navGrid) engine.navGrid.rebuild(engine);

    const cx = 1500;
    const cy = 1500;

    // Spawn Team 0 (Blue) and Team 1 (Red) squads
    const spawnSquad = (list, teamId, baseX, baseY, targetX, targetY) => {
      let idx = 0;
      for (const item of list) {
        const count = item.count || 1;
        for (let c = 0; c < count; c++) {
          const row = Math.floor(idx / 4);
          const col = idx % 4;
          const sx = baseX + (teamId === 0 ? -row * 44 : row * 44);
          const sy = baseY + (col - 1.5) * 46;
          const u = engine.spawnUnit(item.unitId, teamId, sx, sy);
          if (u) {
            u.state = 'ATTACK_MOVE';
            u.targetX = targetX;
            u.targetY = targetY;
          }
          idx++;
        }
      }
    };

    spawnSquad(scenario.team0 || [], 0, cx - 210, cy, cx + 210, cy);
    spawnSquad(scenario.team1 || [], 1, cx + 210, cy, cx - 210, cy);

    const initObs = extractObservation(engine, 0);

    for (let t = 0; t < maxTicks; t++) {
      engine.update(1 / 60);
      const t0Alive = engine.units.some(u => u.team === 0 && u.hp > 0);
      const t1Alive = engine.units.some(u => u.team === 1 && u.hp > 0);
      if (!t0Alive || !t1Alive) break;
    }

    const finalObs = extractObservation(engine, 0);
    const myValueLost = Math.max(0, initObs.myArmyValue - finalObs.myArmyValue);
    const enemyValueDestroyed = Math.max(0, initObs.enemyArmyValue - finalObs.enemyArmyValue);
    const won = finalObs.enemyUnitCount === 0 && finalObs.myUnitCount > 0;
    const draw = finalObs.enemyUnitCount > 0 && finalObs.myUnitCount > 0;

    // Shaped RL Fitness / Reward function:
    // + Value destroyed - Value lost + Win bonus + Speed bonus
    const timeBonus = won ? Math.max(0, (maxTicks - finalObs.tick) / maxTicks) * 400 : 0;
    const reward =
      (enemyValueDestroyed * 1.25) -
      (myValueLost * 1.0) +
      (won ? 600 : draw ? 0 : -400) +
      timeBonus;

    return {
      won,
      draw,
      ticks: finalObs.tick,
      durationSec: +(finalObs.tick / 60).toFixed(2),
      mySurvivors: finalObs.myUnitCount,
      enemySurvivors: finalObs.enemyUnitCount,
      myHpPct: initObs.myTotalHp > 0 ? +(finalObs.myTotalHp / initObs.myTotalHp * 100).toFixed(1) : 0,
      enemyHpPct: initObs.enemyTotalHp > 0 ? +(finalObs.enemyTotalHp / initObs.enemyTotalHp * 100).toFixed(1) : 0,
      costEfficiency: myValueLost > 10 ? +(enemyValueDestroyed / myValueLost).toFixed(2) : +(enemyValueDestroyed / 100).toFixed(2),
      reward: Math.round(reward)
    };
  }

  function runHeadlessBatch(scenario, episodes = 10) {
    const results = [];
    let wins = 0;
    let totalReward = 0;
    let totalMyHpPct = 0;
    let totalDuration = 0;

    for (let i = 0; i < episodes; i++) {
      const res = runHeadlessMicroEpisode(scenario, { seed: 1001 + i * 97 });
      results.push(res);
      if (res.won) wins++;
      totalReward += res.reward;
      totalMyHpPct += res.myHpPct;
      totalDuration += res.durationSec;
    }

    return {
      episodes,
      winRatePct: +((wins / episodes) * 100).toFixed(1),
      avgReward: Math.round(totalReward / episodes),
      avgMyHpPct: +(totalMyHpPct / episodes).toFixed(1),
      avgDurationSec: +(totalDuration / episodes).toFixed(1),
      results
    };
  }

  // Mutates a unit brain vector slightly for (1+lambda) evolutionary RL search
  function mutateBrainCandidate(baseBrain, sigma = 0.18, rngFn = Math.random) {
    const b = clone(baseBrain);
    const postures = ['STAND_GROUND', 'KITE_SKIRMISHER', 'HIT_AND_RUN', 'CRUSH_ASSAULT', 'ARTILLERY_SIEGE'];
    if (rngFn() < 0.25) {
      b.posture = postures[Math.floor(rngFn() * postures.length)];
    }
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const gauss = () => (rngFn() + rngFn() + rngFn() - 1.5) * 1.3;

    b.preferredRangeFrac = +clamp(b.preferredRangeFrac + gauss() * sigma, 0.50, 0.98).toFixed(2);
    b.kiteDangerFrac = +clamp(b.kiteDangerFrac + gauss() * sigma, 0.0, 0.85).toFixed(2);
    b.retreatHpPct = +clamp(b.retreatHpPct + gauss() * sigma * 0.6, 0.0, 0.55).toFixed(2);
    b.focusLowHpWeight = +clamp(b.focusLowHpWeight + gauss() * sigma * 2.0, 0.0, 2.0).toFixed(2);
    b.counterBiasWeight = +clamp(b.counterBiasWeight + gauss() * sigma * 2.0, 0.0, 2.0).toFixed(2);

    for (const k of Object.keys(b.targetPriority)) {
      if (k === 'AIRCRAFT' && b.targetPriority[k] === 0) continue;
      b.targetPriority[k] = +clamp(b.targetPriority[k] + gauss() * sigma * 2.2, 0.1, 3.0).toFixed(2);
    }
    return b;
  }

  window.ZH_RL_ENV = {
    extractObservation,
    runHeadlessMicroEpisode,
    runHeadlessBatch,
    mutateBrainCandidate
  };

  return {
    initRegistries,
    POSTURE_ARCHETYPES,
    UNIT_BRAINS,
    COMMANDER_STRATEGIES,
    UNIT_CAPABILITY_OVERRIDES,
    getUnitCapabilities,
    applyUnitCapabilityOverride,
    resetUnitCapabilities,
    getUnitBrain,
    updateUnitBrain,
    applyPostureArchetype,
    resetUnitBrain,
    getCommanderStrategy,
    updateCommanderStrategy,
    resetCommanderStrategy,
    evaluateTargetEffectiveDistance,
    stepUnitMicroBrain,
    exportPolicySnapshot,
    importPolicySnapshot,
    savePoliciesToStorage,
    resetAllPolicies,
    runHeadlessMicroEpisode,
    runHeadlessBatch,
    mutateBrainCandidate
  };
})();
