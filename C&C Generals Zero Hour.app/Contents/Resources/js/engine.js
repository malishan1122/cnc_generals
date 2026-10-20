// ============================================================================
// Command & Conquer: Generals – Zero Hour (macOS Clean-Room Edition)
// js/engine.js — Phase 2 SAGE RTS Simulation, Spatial Grid, A* Nav, Locomotors,
//                3D Parabolic Ballistics, Garrisoning, Tech Buildings & Abilities
// ============================================================================

window.ZH_ENGINE = (function () {
  'use strict';

  const WORLD_SIZE = 3200;
  const FOG_CELL = 80;
  const FOG_GRID = Math.ceil(WORLD_SIZE / FOG_CELL);
  const FIXED_STEP = 1 / 60;

  let nextEntityId = 1;

  function dist(ax, ay, bx, by) {
    return Math.hypot(bx - ax, by - ay);
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function angleBetween(ax, ay, bx, by) {
    return Math.atan2(by - ay, bx - ax);
  }

  class GameEngine {
    constructor(canvas, minimapCanvas, initialConfig = null) {
      this.canvas = canvas;
      this.ctx = canvas ? canvas.getContext('2d') : null;
      this.minimapCanvas = minimapCanvas;
      this.minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;

      this.worldSize = WORLD_SIZE;
      this.fixedStep = FIXED_STEP;
      this.accumulator = 0;
      this.running = false;
      this.paused = false;
      this.gameSpeed = 1.0;
      this.gameTime = 0;
      this.mode = 'CHALLENGE'; // 'CHALLENGE' | 'SKIRMISH'
      this.challengeIndex = 0;
      this.difficulty = 'NORMAL'; // 'EASY' | 'NORMAL' | 'HARD'
      this.mapDef = ZH_DATA.MAPS[0];
      this.mapData = this.mapDef;
      this.gameOver = false;
      this.winner = null;

      // Camera
      this.cam = {
        x: 120,
        y: WORLD_SIZE - 900,
        w: 1200,
        h: 800,
        shake: 0
      };

      // Phase 2 Spatial Hash Grid & A* Navigation Grid
      this.spatialGrid = window.ZH_SPATIAL ? new ZH_SPATIAL.SpatialHashGrid(128) : null;
      this.navGrid = window.ZH_NAV ? new ZH_NAV.NavigationGrid(WORLD_SIZE, WORLD_SIZE, 48) : null;

      // World Entities
      this.teams = [];
      this.buildings = [];
      this.units = [];
      this.projectiles = [];
      this.particles = [];
      this.salvageCrates = [];
      this.hazards = [];
      this.supplyDocks = [];
      this.techStructures = [];
      this.oilDerricks = this.techStructures; // Backward-compat alias
      this.garrisonBunkers = [];
      this.garrisonStructures = this.garrisonBunkers; // Backward-compat alias
      this.spyDrones = [];
      this.spectreGunships = [];
      this.activeBeams = [];
      this.floatingTexts = [];
      this.radarPings = [];

      // Phase 3 Persistent Decals, Superweapon Spectacle & Under-Attack Radar State
      this.decals = [];
      this.shockwaves = [];
      this.mushroomClouds = [];
      this.screenFlash = 0;
      this.lastAlertPos = null;
      this.underAttackTimer = 0;

      // Fog of War (0: unexplored, 1: explored, 2: visible)
      this.fog = new Uint8Array(FOG_GRID * FOG_GRID);

      // Selection & Orders
      this.selectedIds = new Set();
      this.controlGroups = {};
      this.commandMode = null; // null | 'ATTACK_MOVE' | 'GUARD' | 'FORCE_FIRE' | 'BUILD' | 'POWER' | 'SUPERWEAPON' | 'ABILITY'
      this.pendingBuildId = null;
      this.pendingPowerId = null;
      this.pendingSuperweaponBuildingId = null;
      this.pendingAbilityUnitId = null;
      this.mouseWorld = { x: 0, y: 0 };

      // Timers
      this.passiveIncomeTimer = 0;
      this.hordeCheckTimer = 0;
      this.fogUpdateTimer = 0;

      // Callbacks
      this.onAlert = null;
      this.onTaunt = null;
      this.onStateChange = null;
      this.onGameOver = null;

      if (initialConfig && typeof initialConfig === 'object') {
        this.initMatch({
          mode: initialConfig.mode || 'SKIRMISH',
          mapId: initialConfig.mapId || 'TOURNAMENT_DESERT',
          playerGeneralId: initialConfig.playerGenId || initialConfig.playerGeneralId || 'USA_GRANGER',
          aiGeneralId: initialConfig.enemyGenId || initialConfig.aiGeneralId || 'CHINA_KWAI',
          difficulty: initialConfig.difficulty || 'NORMAL',
          challengeIndex: initialConfig.challengeIndex || 0
        });
      }
    }

    initMatch(config = {}) {
      nextEntityId = 1;
      this.mode = config.mode || 'CHALLENGE';
      this.challengeIndex = config.challengeIndex || 0;
      this.difficulty = config.difficulty || 'NORMAL';
      this.mapDef = ZH_DATA.MAPS.find(m => m.id === config.mapId) || ZH_DATA.MAPS[0];
      this.mapData = this.mapDef;

      this.gameTime = 0;
      this.matchTime = 0;
      this.accumulator = 0;
      this.gameOver = false;
      this.winner = null;
      this.paused = false;

      this.buildings = [];
      this.units = [];
      this.projectiles = [];
      this.particles = [];
      this.salvageCrates = [];
      this.hazards = [];
      this.supplyDocks = [];
      this.techStructures = [];
      this.oilDerricks = this.techStructures;
      this.garrisonBunkers = [];
      this.garrisonStructures = this.garrisonBunkers;
      this.spyDrones = [];
      this.spectreGunships = [];
      this.activeBeams = [];
      this.floatingTexts = [];
      this.radarPings = [];
      this.decals = [];
      this.shockwaves = [];
      this.mushroomClouds = [];
      this.screenFlash = 0;
      this.lastAlertPos = null;
      this.underAttackTimer = 0;
      this.selectedIds.clear();
      this.controlGroups = {};
      this.commandMode = null;
      this.pendingBuildId = null;
      this.pendingPowerId = null;
      this.pendingSuperweaponBuildingId = null;
      this.pendingAbilityUnitId = null;

      // Initialize Fog
      this.fog.fill(0);

      // Initialize Player (Team 0) and AI (Team 1)
      const pGen = ZH_DATA.GENERALS[config.playerGeneralId] || ZH_DATA.GENERALS.USA_GRANGER;
      const aiGen = ZH_DATA.GENERALS[config.aiGeneralId] || ZH_DATA.GENERALS.GLA_THRAX;

      this.teams = [
        this.createTeam(0, pGen, false),
        this.createTeam(1, aiGen, true)
      ];

      // Build Map Features (Supply Docks, Neutral Tech Buildings & Civilian Garrison Bunkers)
      this.setupMapResources();

      // Spawn Starting Bases (Player Bottom-Left, AI Top-Right)
      this.spawnStartingBase(0, 440, WORLD_SIZE - 440);
      this.spawnStartingBase(1, WORLD_SIZE - 440, 440);

      // Rebuild Navigation Grid with initial structures
      if (this.navGrid) {
        this.navGrid.rebuild(this);
      }

      // Position Camera over Player Command Center
      this.cam.x = clamp(440 - this.cam.w / 2, 0, WORLD_SIZE - this.cam.w);
      this.cam.y = clamp(WORLD_SIZE - 440 - this.cam.h / 2, 0, WORLD_SIZE - this.cam.h);

      this.recalculatePower(0);
      this.recalculatePower(1);
      this.updateFogOfWar();

      this.running = true;
      if (window.ZH_AUDIO) {
        if (ZH_AUDIO.startMusic) ZH_AUDIO.startMusic(pGen.faction);
        ZH_AUDIO.speak(`Welcome to Command and Conquer Generals Zero Hour. ${pGen.title} online.`, { priority: true });
      }
    }

    createTeam(id, generalDef, isAI) {
      const factionDef = ZH_DATA.FACTIONS[generalDef.faction];
      const aiBonus = isAI
        ? (this.difficulty === 'HARD' ? 14000 : this.difficulty === 'EASY' ? 8500 : 10500)
        : factionDef.startingCredits;

      return {
        id,
        isAI,
        generalId: generalDef.id,
        general: generalDef,
        factionId: factionDef.id,
        faction: factionDef,
        credits: aiBonus,
        powerProduced: 0,
        powerConsumed: 0,
        isLowPower: false,
        hasRadar: true,
        hasTechCenter: false,
        rank: 1,
        xp: 0,
        generalPoints: 1,
        unlockedPowers: new Set(),
        powerCooldowns: {},
        upgrades: new Set(),
        tunnelUnits: [] // Shared GLA Tunnel Network Garrison
      };
    }

    setupMapResources() {
      // 1. Primary & Expansion Supply Docks
      const docks = [
        // Player Primary & Natural Expansion
        { x: 760, y: WORLD_SIZE - 360, amount: 24000 },
        { x: 360, y: WORLD_SIZE - 840, amount: 20000 },
        // AI Primary & Natural Expansion
        { x: WORLD_SIZE - 760, y: 360, amount: 24000 },
        { x: WORLD_SIZE - 360, y: 840, amount: 20000 },
        // Contested Center & Flank Supply Docks
        { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2, amount: 32000 },
        { x: 680, y: 680, amount: 22000 },
        { x: WORLD_SIZE - 680, y: WORLD_SIZE - 680, amount: 22000 }
      ];

      docks.forEach(d => {
        this.supplyDocks.push({
          id: nextEntityId++,
          x: d.x,
          y: d.y,
          amount: d.amount,
          maxAmount: d.amount,
          radius: 48
        });
      });

      // 2. Neutral Capturable Tech Structures (2 Oil Derricks, 1 Tech Hospital, 1 Tech Repair Bay)
      const techPlacements = [
        { defId: 'TECH_OIL_DERRICK', x: 450, y: 450 },
        { defId: 'TECH_OIL_DERRICK', x: WORLD_SIZE - 450, y: WORLD_SIZE - 450 },
        { defId: 'TECH_HOSPITAL', x: WORLD_SIZE / 2 - 420, y: WORLD_SIZE / 2 + 420 },
        { defId: 'TECH_REPAIR_BAY', x: WORLD_SIZE / 2 + 420, y: WORLD_SIZE / 2 - 420 }
      ];

      techPlacements.forEach(tp => {
        const tDef = (ZH_DATA.TECH_BUILDINGS && ZH_DATA.TECH_BUILDINGS[tp.defId]) || {
          id: tp.defId,
          name: 'Tech Oil Derrick',
          shortName: 'OIL DERRICK',
          size: 72,
          hp: 2000,
          captureBonus: 1000,
          passiveIncome: 35
        };
        this.techStructures.push({
          id: nextEntityId++,
          isTechStructure: true,
          defId: tp.defId,
          def: tDef,
          name: tDef.name,
          x: tp.x,
          y: tp.y,
          team: -1, // Neutral until captured by Infantry
          captureProgress: 0,
          capturingTeam: -1,
          radius: (tDef.size || 72) / 2,
          hp: tDef.hp || 2000,
          maxHp: tDef.hp || 2000
        });
      });

      // 3. Neutral Civilian Urban Garrison Bunkers (Choke Points around Center & Flanks)
      const bunkerDef = (ZH_DATA.TECH_BUILDINGS && ZH_DATA.TECH_BUILDINGS.CIV_GARRISON_BUNKER) || {
        id: 'CIV_GARRISON_BUNKER',
        name: 'Civilian Urban Garrison',
        shortName: 'CIV BUNKER',
        size: 84,
        hp: 2200,
        isGarrisonable: true,
        maxOccupants: 6,
        armorBonus: 0.40,
        rangeBonus: 1.25
      };

      const bunkerCoords = [
        { x: WORLD_SIZE / 2 - 220, y: WORLD_SIZE / 2 - 220 },
        { x: WORLD_SIZE / 2 + 220, y: WORLD_SIZE / 2 + 220 },
        { x: 980, y: WORLD_SIZE - 980 },
        { x: WORLD_SIZE - 980, y: 980 }
      ];

      bunkerCoords.forEach(bc => {
        const occupants = [];
        this.garrisonBunkers.push({
          id: nextEntityId++,
          isGarrisonBunker: true,
          defId: 'CIV_GARRISON_BUNKER',
          def: bunkerDef,
          name: bunkerDef.name,
          x: bc.x,
          y: bc.y,
          team: -1,
          radius: (bunkerDef.size || 84) / 2,
          hp: bunkerDef.hp || 2200,
          maxHp: bunkerDef.hp || 2200,
          maxOccupants: bunkerDef.maxOccupants || 6,
          armorBonus: bunkerDef.armorBonus || 0.40,
          rangeBonus: bunkerDef.rangeBonus || 1.25,
          occupants,
          garrisonedUnits: occupants
        });
      });
    }

    spawnStartingBase(teamId, baseX, baseY) {
      const team = this.teams[teamId];
      const fId = team.factionId;

      const ccId = fId === 'USA' ? 'USA_COMMAND_CENTER'
        : fId === 'CHINA' ? 'CHINA_COMMAND_CENTER'
        : 'GLA_COMMAND_CENTER';

      this.spawnBuilding(ccId, teamId, baseX, baseY, true);

      // Spawn 2 Builders (Dozers or GLA Workers)
      const builderId = fId === 'USA' ? 'USA_DOZER'
        : fId === 'CHINA' ? 'CHINA_DOZER'
        : 'GLA_WORKER';

      this.spawnUnit(builderId, teamId, baseX - 90, baseY + 80);
      this.spawnUnit(builderId, teamId, baseX + 90, baseY + 80);

      // Spawn initial Scout / Guard squad
      const infId = fId === 'USA' ? 'USA_RANGER'
        : fId === 'CHINA' ? (team.generalId === 'CHINA_SHIN_FAI' ? 'CHINA_MINIGUNNER' : 'CHINA_RED_GUARD')
        : 'GLA_REBEL';

      this.spawnUnit(infId, teamId, baseX - 60, baseY - 95);
      this.spawnUnit(infId, teamId, baseX + 60, baseY - 95);
    }

    // ========================================================================
    // Dynamic Cost & Stat Helpers (Applying Sub-General & Upgrade Modifiers)
    // ========================================================================
    getModifiedCost(defId, teamId) {
      const team = this.teams[teamId];
      const mod = team.general.modifiers || {};
      const uDef = ZH_DATA.UNITS[defId];
      const bDef = ZH_DATA.BUILDINGS[defId];
      const upgDef = ZH_DATA.UPGRADES[defId];

      if (upgDef) return upgDef.cost;
      if (uDef) {
        let c = uDef.cost;
        if (uDef.category === 'AIRCRAFT' && mod.aircraftCostMult) c *= mod.aircraftCostMult;
        if (uDef.category === 'TANK' && mod.tankCostMult) c *= mod.tankCostMult;
        if ((defId === 'GLA_TERRORIST' || defId === 'GLA_SCUD_LAUNCHER' || defId === 'GLA_BOMB_TRUCK') && mod.demoCostMult) c *= mod.demoCostMult;
        return Math.round(c);
      }
      if (bDef) {
        let c = bDef.cost;
        if (bDef.isSuperweapon && mod.superweaponCostMult) c *= mod.superweaponCostMult;
        if (bDef.isTunnel && mod.tunnelCostMult) c *= mod.tunnelCostMult;
        return Math.round(c);
      }
      return 500;
    }

    canAfford(teamId, amount) {
      return this.teams[teamId].credits >= amount;
    }

    isEntityUnlocked(defId, teamId) {
      const team = this.teams[teamId];
      if (!team) return false;
      const def = ZH_DATA.UNITS[defId] || ZH_DATA.BUILDINGS[defId];
      if (!def) return false;
      if (def.generalOnly && def.generalOnly !== team.generalId) return false;
      if (def.requiresTech && !team.hasTechCenter) {
        if (defId === 'CHINA_NUKE_CANNON' && team.generalId === 'CHINA_TAO') return true;
        return false;
      }
      return true;
    }

    // ========================================================================
    // Spawning Buildings & Units
    // ========================================================================
    spawnBuilding(defId, teamId, x, y, instantComplete = false) {
      const def = ZH_DATA.BUILDINGS[defId];
      if (!def) return null;
      const team = this.teams[teamId];
      const mod = team.general.modifiers || {};

      let swCooldown = def.superweaponCooldown || 150;
      if (def.isSuperweapon && mod.superweaponCooldownMult) {
        swCooldown = Math.round(swCooldown * mod.superweaponCooldownMult);
      }

      const b = {
        id: nextEntityId++,
        isBuilding: true,
        defId,
        def,
        team: teamId,
        x: clamp(x, 80, WORLD_SIZE - 80),
        y: clamp(y, 80, WORLD_SIZE - 80),
        radius: def.size / 2,
        hp: instantComplete ? def.hp : Math.round(def.hp * 0.12),
        maxHp: def.hp,
        constructed: instantComplete,
        buildProgress: instantComplete ? 1.0 : 0.05,
        queue: [], // [{ type: 'UNIT'|'UPGRADE', id, timer, totalTime }]
        rallyX: x,
        rallyY: clamp(y + def.size * 1.35 + 28, 80, WORLD_SIZE - 80),
        attackCooldown: 0,
        turretAngle: 0,
        overcharged: false,
        disabledTimer: 0,
        empTimer: 0,
        superweaponTimer: swCooldown,
        superweaponMaxTimer: swCooldown,
        superweaponReady: false
      };

      this.buildings.push(b);
      if (this.navGrid) this.navGrid.rebuild(this);

      if (instantComplete) {
        this.onBuildingCompleted(b);
      }

      return b;
    }

    findSafeSpawnPosition(x, y, radius = 14, isAir = false, locomotor = 'TRACKED') {
      let sx = clamp(x, 35, WORLD_SIZE - 35);
      let sy = clamp(y, 35, WORLD_SIZE - 35);
      if (isAir) return { x: sx, y: sy };

      // 1. Push radially outside any alive building footprint
      for (let pass = 0; pass < 2; pass++) {
        for (const b of this.buildings) {
          if (!b || b.hp <= 0) continue;
          const minD = (b.radius || 40) + radius + 14;
          const dx = sx - b.x;
          const dy = sy - b.y;
          const d = Math.hypot(dx, dy);
          if (d < minD) {
            const exitAng = d > 0.5
              ? Math.atan2(dy, dx)
              : angleBetween(b.x, b.y, b.rallyX || b.x, b.rallyY || (b.y + 90));
            sx = clamp(b.x + Math.cos(exitAng) * minD, 35, WORLD_SIZE - 35);
            sy = clamp(b.y + Math.sin(exitAng) * minD, 35, WORLD_SIZE - 35);
          }
        }
      }

      // 2. Ensure position is not on a blocked NavigationGrid cell
      if (this.navGrid && typeof this.navGrid.isPassable === 'function') {
        const canCliff = locomotor === 'CLIFF_CLIMBER';
        const canWater = locomotor === 'HOVER';
        if (!this.navGrid.isPassable(sx, sy, canCliff, canWater)) {
          const cell = this.navGrid.worldToCell(sx, sy);
          const safeCell = this.navGrid.findNearestPassable(cell.col, cell.row, locomotor, 6);
          const worldPos = this.navGrid.cellToWorld(safeCell.col, safeCell.row);
          sx = clamp(worldPos.x, 35, WORLD_SIZE - 35);
          sy = clamp(worldPos.y, 35, WORLD_SIZE - 35);
        }
      }

      return { x: sx, y: sy };
    }

    onBuildingCompleted(b) {
      b.constructed = true;
      b.buildProgress = 1.0;
      b.hp = b.maxHp;

      if (this.navGrid) this.navGrid.rebuild(this);
      this.recalculatePower(b.team);

      // Eject any ground units (such as the builder Dozer/Worker) trapped inside the completed building footprint
      for (const u of this.units) {
        if (!u || u.hp <= 0 || u.def.isAir) continue;
        const minD = b.radius + (u.radius || 14) + 14;
        if (dist(u.x, u.y, b.x, b.y) < minD) {
          const safe = this.findSafeSpawnPosition(u.x, u.y, u.radius || 14, false, u.locomotor || 'TRACKED');
          u.x = safe.x;
          u.y = safe.y;
        }
      }

      // Spawn free harvester if Supply Depot
      if (b.def.freeUnit) {
        const uDef = ZH_DATA.UNITS[b.def.freeUnit];
        const uRad = (uDef && uDef.radius) || 16;
        const u = this.spawnUnit(b.def.freeUnit, b.team, b.x, b.y + b.radius + uRad + 18);
        if (u) {
          u.angle = Math.PI / 2;
          u.turretAngle = Math.PI / 2;
          if (u.def.isHarvester) {
            this.assignNearestSupplyDock(u);
          }
        }
      }

      // Announce Superweapon construction to all players
      if (b.def.isSuperweapon) {
        if (window.ZH_AUDIO) ZH_AUDIO.playSFX('superweapon');
        const msg = b.def.superweaponType === 'PARTICLE_CANNON'
          ? 'Warning! Particle Cannon uplink detected!'
          : b.def.superweaponType === 'NUCLEAR_MISSILE'
          ? 'Warning! Nuclear Missile Silo detected!'
          : 'Warning! Scud Storm launch facility detected!';
        this.triggerAlert(msg, '#ef4444');
        if (window.ZH_AUDIO) ZH_AUDIO.speak(msg, { priority: true });
        this.addRadarPing(b.x, b.y, '#ef4444');
      } else if (b.team === 0 && this.gameTime > 2) {
        if (window.ZH_AUDIO) ZH_AUDIO.speak('Construction complete.');
      }

      if (this.onStateChange) this.onStateChange();
    }

    spawnUnit(defId, teamId, x, y) {
      const def = ZH_DATA.UNITS[defId];
      if (!def) return null;
      const team = this.teams[teamId];
      const mod = team ? (team.general.modifiers || {}) : {};

      let maxHp = def.hp;
      let speed = def.speed;
      let startVet = 0;

      if (def.category === 'AIRCRAFT') {
        if (mod.aircraftHpMult) maxHp *= mod.aircraftHpMult;
        if (mod.aircraftStartVet) startVet = Math.max(startVet, mod.aircraftStartVet);
      }
      if (def.category === 'TANK') {
        if (mod.tankSpeedMult) speed *= mod.tankSpeedMult;
        if (mod.tankStartVet) startVet = Math.max(startVet, mod.tankStartVet);
        if (team && team.upgrades.has('UPG_COMPOSITE_ARMOR')) maxHp *= 1.25;
      }
      if (def.category === 'INFANTRY') {
        if (mod.infantryHpMult) maxHp *= mod.infantryHpMult;
        if (mod.infantryStartVet) startVet = Math.max(startVet, mod.infantryStartVet);
      }
      if (mod.unitSpeedMult) speed *= mod.unitSpeedMult;

      const vetDef = ZH_DATA.VETERANCY_LEVELS[startVet];
      maxHp = Math.round(maxHp * vetDef.hpMult);

      const locomotor = def.locomotor || (window.ZH_SPATIAL ? ZH_SPATIAL.LocomotorSystem.inferLocomotor(def) : 'INFANTRY');

      // Jitter spawn position slightly to prevent exact overlap, then clamp outside building footprints & blocked cells
      const angle = Math.random() * Math.PI * 2;
      const rawX = clamp(x + Math.cos(angle) * 8, 35, WORLD_SIZE - 35);
      const rawY = clamp(y + Math.sin(angle) * 8, 35, WORLD_SIZE - 35);
      const safePos = this.findSafeSpawnPosition(rawX, rawY, def.radius || 14, Boolean(def.isAir), locomotor);
      const sx = safePos.x;
      const sy = safePos.y;

      const u = {
        id: nextEntityId++,
        isUnit: true,
        defId,
        def,
        team: teamId,
        x: sx,
        y: sy,
        radius: def.radius,
        hp: maxHp,
        maxHp,
        speed,
        currentSpeed: 0,
        angle: teamId === 0 ? Math.PI / 2 : (3 * Math.PI) / 4,
        turretAngle: teamId === 0 ? Math.PI / 2 : (3 * Math.PI) / 4,
        bankAngle: 0,
        locomotor,
        vetLevel: startVet,
        xp: vetDef.xpReq,
        salvageTier: 0,
        inHorde: false,
        inPropaganda: false,
        stealthed: Boolean(def.stealthed || (mod.stealthAllUnits && def.category === 'INFANTRY')),
        gpsScrambleTimer: 0,
        unmanned: false,
        garrisonedIn: null,
        hasSpeakerTower: Boolean(def.isPropagandaCarrier && defId !== 'CHINA_OVERLORD'),
        hasGatlingCannon: false,
        overlordAddon: def.isPropagandaCarrier && defId !== 'CHINA_OVERLORD'
          ? 'SPEAKER_TOWER'
          : null,
        laserLockTimer: 0,
        laserLockedTimer: 0,
        abilityCooldown: 0,
        disabledTimer: 0,
        empTimer: 0,
        attackCooldown: 0,
        pdlTimer: 0,
        rotorAngle: 0,
        recoilOffset: 0,
        hackTimer: 0,
        controlGroup: null,
        waypoints: [],
        // Orders & State Machine
        state: 'IDLE', // 'IDLE' | 'MOVE' | 'ATTACK_MOVE' | 'GUARD' | 'FORCE_FIRE' | 'ATTACK' | 'BUILD' | 'HARVEST' | 'RETURN_SUPPLY' | 'ENTER_TUNNEL' | 'CAPTURE' | 'ENTER_GARRISON' | 'RECREW_VEHICLE' | 'HIJACK_VEHICLE'
        targetX: sx,
        targetY: sy,
        guardX: sx,
        guardY: sy,
        targetEntityId: null,
        buildTargetId: null,
        supplyDockId: null,
        supplyCarried: 0,
        harvestTimer: 0
      };

      this.units.push(u);

      // Troop Crawler / Assault Crawler spawns with escort infantry!
      if (def.spawnsInfantryCount && def.spawnsInfantryType && teamId >= 0) {
        const escortCount = Math.min(4, def.spawnsInfantryCount);
        for (let i = 0; i < escortCount; i++) {
          this.spawnUnit(def.spawnsInfantryType, teamId, sx + (i - 1.5) * 18, sy + 24);
        }
      }

      return u;
    }

    // ========================================================================
    // Civilian Garrison Bunker Entry & Evacuation
    // ========================================================================
    enterGarrison(unit, bunker) {
      if (!unit || !bunker || unit.hp <= 0 || unit.def.category !== 'INFANTRY') return false;
      if (bunker.hp <= 200) return false;
      if (bunker.team !== -1 && bunker.team !== unit.team) return false;
      if (bunker.occupants.length >= (bunker.maxOccupants || 6)) return false;

      bunker.team = unit.team;
      unit.garrisonedIn = bunker.id;
      unit.garrisonId = bunker.id;
      unit.state = 'IDLE';
      this.selectedIds.delete(unit.id);

      if (!bunker.occupants.includes(unit)) {
        bunker.occupants.push(unit);
      }

      if (unit.team === 0) {
        if (window.ZH_AUDIO) ZH_AUDIO.playSFX('click');
        this.triggerAlert(`${unit.def.shortName} garrisoned ${bunker.name} (${bunker.occupants.length}/${bunker.maxOccupants})`, '#38bdf8');
      }
      if (this.onStateChange) this.onStateChange();
      return true;
    }

    evacuateGarrison(bunkerOrId) {
      const bunker = typeof bunkerOrId === 'object' ? bunkerOrId : this.garrisonBunkers.find(g => g.id === bunkerOrId);
      if (!bunker || bunker.occupants.length === 0) return 0;

      const count = bunker.occupants.length;
      while (bunker.occupants.length > 0) {
        const u = bunker.occupants.pop();
        u.garrisonedIn = null;
        u.garrisonId = null;
        if (u.hp > 0) {
          const ang = Math.random() * Math.PI * 2;
          u.x = clamp(bunker.x + Math.cos(ang) * (bunker.radius + 20), 40, WORLD_SIZE - 40);
          u.y = clamp(bunker.y + Math.sin(ang) * (bunker.radius + 20), 40, WORLD_SIZE - 40);
          u.state = 'IDLE';
          if (!this.units.includes(u)) {
            this.units.push(u);
          }
        }
      }
      bunker.team = -1;
      if (window.ZH_AUDIO) ZH_AUDIO.playSFX('click');
      if (this.onStateChange) this.onStateChange();
      return count;
    }

    // ========================================================================
    // Active Unit Micro-Abilities ([F] Hotkey & AI Tactical Micro)
    // ========================================================================
    triggerUnitAbility(unitOrId, arg2, arg3, arg4 = null, arg5 = null) {
      const u = typeof unitOrId === 'object' ? unitOrId : this.units.find(x => x.id === unitOrId);
      if (!u || u.hp <= 0 || u.unmanned) return false;
      if ((u.abilityCooldown || 0) > 0) return false;

      let abilityId = u.def.abilityId || (u.def.ability && u.def.ability.id);
      let tx = arg2;
      let ty = arg3;
      let explicitTarget = arg4;

      if (typeof arg2 === 'string') {
        abilityId = arg2;
        tx = arg3;
        ty = arg4;
        explicitTarget = arg5;
      }

      if (typeof explicitTarget === 'number') {
        explicitTarget = this.findEntityById(explicitTarget);
      }

      if (!abilityId) return false;
      const abDef = (ZH_DATA.UNIT_ABILITIES && ZH_DATA.UNIT_ABILITIES[abilityId]) || u.def.ability || { cooldown: 15 };
      const team = this.teams[u.team];

      const targetX = tx !== undefined ? tx : u.x;
      const targetY = ty !== undefined ? ty : u.y;

      switch (abilityId) {
        case 'FLASHBANG': {
          u.abilityCooldown = abDef.cooldown || 14;
          // Check if a hostile garrison bunker is near targetX, targetY
          const bunker = this.garrisonBunkers.find(
            g => g.occupants.length > 0 && g.team !== u.team && dist(targetX, targetY, g.x, g.y) <= 200
          );
          if (bunker) {
            const killed = bunker.occupants.length;
            while (bunker.occupants.length > 0) {
              const occ = bunker.occupants.pop();
              occ.hp = 0;
              occ.garrisonedIn = null;
            }
            bunker.team = -1;
            this.spawnBurst(bunker.x, bunker.y, '#fef08a', 20);
            this.spawnFloatingText(bunker.x, bunker.y - 26, `FLASHBANG CLEARED (${killed} KIA)!`, '#fef08a');
            this.grantTeamXP(u.team, killed * 40);
          } else {
            this.dealAreaDamage(targetX, targetY, 85, 110, 'SMALL_ARMS', u.team, u);
            this.spawnBurst(targetX, targetY, '#fef08a', 16);
          }
          if (window.ZH_AUDIO) ZH_AUDIO.playSFX('explosion');
          return true;
        }

        case 'LASER_LOCK': {
          u.abilityCooldown = abDef.cooldown || 18;
          u.laserLockTimer = 5.0;
          u.laserLockedTimer = 5.0;
          u.attackCooldown = 0;
          this.spawnFloatingText(u.x, u.y - 18, '🎯 LASER LOCK SALVO!', '#38bdf8');
          this.spawnBurst(u.x, u.y, '#38bdf8', 10);
          if (window.ZH_AUDIO) ZH_AUDIO.playSFX('laser');
          return true;
        }

        case 'FLAME_WALL': {
          u.abilityCooldown = abDef.cooldown || 22;
          const cx = targetX || (u.x + Math.cos(u.angle) * 65);
          const cy = targetY || (u.y + Math.sin(u.angle) * 65);
          this.dealAreaDamage(cx, cy, 130, 185, 'FLAME_TOXIN', u.team, u);
          this.hazards.push({
            id: nextEntityId++,
            type: 'FLAME',
            team: u.team,
            x: cx,
            y: cy,
            radius: 115,
            timer: 10,
            dps: 34
          });
          if (window.ZH_SPATIAL) {
            ZH_SPATIAL.BallisticsEngine.applySpecialHitEffects(
              this,
              { team: u.team, damageType: 'FLAME_TOXIN', splash: 130 },
              null,
              cx,
              cy
            );
          }
          this.spawnBurst(cx, cy, '#f97316', 32);
          this.spawnFloatingText(u.x, u.y - 20, '🔥 NAPALM FIRE WALL!', '#f97316');
          if (window.ZH_AUDIO) ZH_AUDIO.playSFX('explosion');
          return true;
        }

        case 'OVERLORD_SPEAKER': {
          if (u.hasSpeakerTower || u.overlordAddon === 'SPEAKER_TOWER') return false;
          const cost = abDef.cost || 500;
          if (!this.canAfford(u.team, cost)) return false;
          team.credits -= cost;
          u.hasSpeakerTower = true;
          u.overlordAddon = 'SPEAKER_TOWER';
          u.def = Object.assign({}, u.def, { isPropagandaCarrier: true, auraRadius: 195 });
          this.spawnFloatingText(u.x, u.y - 22, '🔊 SPEAKER TOWER INSTALLED!', '#22c55e');
          if (window.ZH_AUDIO) ZH_AUDIO.playSFX('promote');
          if (this.onStateChange) this.onStateChange();
          return true;
        }

        case 'OVERLORD_GATLING': {
          if (u.hasGatlingCannon || u.overlordAddon === 'GATLING_CANNON') return false;
          const cost = abDef.cost || 500;
          if (!this.canAfford(u.team, cost)) return false;
          team.credits -= cost;
          u.hasGatlingCannon = true;
          u.overlordAddon = 'GATLING_CANNON';
          this.spawnFloatingText(u.x, u.y - 22, '⚙ GATLING CANNON INSTALLED!', '#fde047');
          if (window.ZH_AUDIO) ZH_AUDIO.playSFX('promote');
          if (this.onStateChange) this.onStateChange();
          return true;
        }

        case 'PILOT_SNIPE': {
          const target = explicitTarget || this.units.find(
            e => e.team !== u.team && !e.unmanned && e.hp > 0 &&
                 (e.def.category === 'TANK' || e.def.category === 'LIGHT_VEHICLE') &&
                 dist(targetX, targetY, e.x, e.y) <= 140
          );
          if (!target) return false;
          u.abilityCooldown = abDef.cooldown || 20;
          target.unmanned = true;
          target.team = -1;
          target.state = 'IDLE';
          target.targetEntityId = null;
          target.currentSpeed = 0;
          this.selectedIds.delete(target.id);

          this.particles.push({
            type: 'LASER_LINE',
            x1: u.x,
            y1: u.y,
            x2: target.x,
            y2: target.y,
            color: '#fde047',
            timer: 0.25,
            maxTimer: 0.25
          });
          this.spawnBurst(target.x, target.y, '#fde047', 14);
          this.spawnFloatingText(target.x, target.y - 22, '🎯 PILOT SNIPED (UNMANNED)!', '#fde047');
          if (window.ZH_AUDIO) ZH_AUDIO.playSFX('sniper');
          if (this.onStateChange) this.onStateChange();
          return true;
        }

        case 'HIJACK_VEHICLE': {
          const target = explicitTarget || this.units.find(
            e => e.team !== u.team && e.hp > 0 &&
                 (e.def.category === 'TANK' || e.def.category === 'LIGHT_VEHICLE') &&
                 dist(targetX, targetY, e.x, e.y) <= 180
          );
          if (!target) return false;
          if (dist(u.x, u.y, target.x, target.y) <= u.radius + target.radius + 28) {
            this.executeHijackVehicle(u, target);
          } else {
            u.state = 'HIJACK_VEHICLE';
            u.targetEntityId = target.id;
            u.targetX = target.x;
            u.targetY = target.y;
          }
          return true;
        }
      }
      return false;
    }

    useUnitAbility(unitOrId, abilityId, tx, ty, explicitTarget = null) {
      return this.triggerUnitAbility(unitOrId, abilityId, tx, ty, explicitTarget);
    }

    purchaseOverlordAddon(unitOrId, addonType) {
      const abId = addonType === 'SPEAKER_TOWER' || addonType === 'OVERLORD_SPEAKER'
        ? 'OVERLORD_SPEAKER'
        : 'OVERLORD_GATLING';
      return this.triggerUnitAbility(unitOrId, abId);
    }

    executeHijackVehicle(hijacker, vehicle) {
      if (!hijacker || !vehicle || vehicle.hp <= 0) return false;
      vehicle.team = hijacker.team;
      vehicle.unmanned = false;
      vehicle.state = 'IDLE';
      vehicle.targetEntityId = null;

      this.spawnBurst(vehicle.x, vehicle.y, '#22c55e', 16);
      this.spawnFloatingText(vehicle.x, vehicle.y - 22, `🕶 VEHICLE HIJACKED!`, '#22c55e');
      if (hijacker.team === 0) {
        this.triggerAlert(`${vehicle.def.name} hijacked and added to your command!`, '#22c55e');
      }

      // Consume Hijacker inside the captured vehicle
      this.selectedIds.delete(hijacker.id);
      hijacker.hp = 0;
      const idx = this.units.indexOf(hijacker);
      if (idx >= 0) this.units.splice(idx, 1);

      if (window.ZH_AUDIO) ZH_AUDIO.playSFX('promote');
      if (this.onStateChange) this.onStateChange();
      return true;
    }

    // ========================================================================
    // Power & Tech Recalculation
    // ========================================================================
    recalculatePower(teamId) {
      const team = this.teams[teamId];
      if (!team) return;
      const mod = team.general.modifiers || {};
      let prod = 0;
      let cons = 0;
      let hasRadar = false;
      let hasTech = false;

      for (const b of this.buildings) {
        if (b.team !== teamId || !b.constructed || b.hp <= 0) continue;

        if (b.def.providesRadar) hasRadar = true;
        if (b.def.isTechCenter) hasTech = true;

        if (b.def.power > 0) {
          let p = b.def.power;
          if (mod.powerOutputMult) p *= mod.powerOutputMult;
          if (b.defId === 'USA_REACTOR' && team.upgrades.has('UPG_CONTROL_RODS')) p *= 2.0;
          if (b.overcharged) p *= 1.5;
          prod += Math.round(p);
        } else if (b.def.power < 0) {
          cons += Math.abs(b.def.power);
        }
      }

      team.powerProduced = prod;
      team.powerConsumed = cons;
      team.hasTechCenter = hasTech;

      const wasLow = team.isLowPower;
      team.isLowPower = team.faction.usesPower && cons > prod;
      team.hasRadar = hasRadar && !team.isLowPower;

      if (!wasLow && team.isLowPower && teamId === 0) {
        this.triggerAlert('LOW POWER! Base defenses & Radar offline — build Reactors!', '#f59e0b');
        if (window.ZH_AUDIO) ZH_AUDIO.speak('Low power. Additional reactors required.');
      }
    }

    // ========================================================================
    // Player & AI Command Issuing
    // ========================================================================
    getAdjustedCost(defId, teamId) {
      return this.getModifiedCost(defId, teamId);
    }

    canPlaceBuilding(defId, x, y) {
      const def = ZH_DATA.BUILDINGS[defId];
      if (!def) return false;
      const bRad = (def.size || 72) / 2;
      if (x < bRad + 40 || x > WORLD_SIZE - bRad - 40 || y < bRad + 40 || y > WORLD_SIZE - bRad - 40) {
        return false;
      }
      for (const other of this.buildings) {
        if (other.hp <= 0) continue;
        if (dist(x, y, other.x, other.y) < (bRad + other.radius + 16)) {
          return false;
        }
      }
      for (const dock of this.supplyDocks) {
        if (dist(x, y, dock.x, dock.y) < (bRad + (dock.radius || 46) + 20)) {
          return false;
        }
      }
      for (const tech of this.techStructures) {
        if (dist(x, y, tech.x, tech.y) < (bRad + (tech.radius || 38) + 16)) {
          return false;
        }
      }
      for (const gar of this.garrisonBunkers) {
        if (dist(x, y, gar.x, gar.y) < (bRad + (gar.radius || 40) + 16)) {
          return false;
        }
      }
      return true;
    }

    findValidBuildSpot(defId, anchorX, anchorY, preferredSlot = 0) {
      const ringOffsets = [
        { dx: 150, dy: -30 },
        { dx: -40, dy: -165 },
        { dx: 165, dy: -165 },
        { dx: 270, dy: -70 },
        { dx: -175, dy: -50 },
        { dx: 110, dy: 150 },
        { dx: -160, dy: -180 },
        { dx: 270, dy: -210 },
        { dx: 295, dy: 80 },
        { dx: -180, dy: 130 },
        { dx: 40, dy: -285 },
        { dx: 200, dy: -290 },
        { dx: 380, dy: -120 },
        { dx: -285, dy: -90 },
        { dx: 230, dy: 210 },
        { dx: -60, dy: 245 }
      ];
      for (let i = 0; i < ringOffsets.length; i++) {
        const slot = ringOffsets[(preferredSlot + i) % ringOffsets.length];
        const cx = clamp(anchorX + slot.dx, 100, WORLD_SIZE - 100);
        const cy = clamp(anchorY + slot.dy, 100, WORLD_SIZE - 100);
        if (this.canPlaceBuilding(defId, cx, cy)) {
          return { x: cx, y: cy };
        }
      }
      for (let r = 130; r <= 720; r += 65) {
        const steps = 16;
        for (let s = 0; s < steps; s++) {
          const ang = ((s + preferredSlot) / steps) * Math.PI * 2;
          const cx = clamp(Math.round(anchorX + Math.cos(ang) * r), 100, WORLD_SIZE - 100);
          const cy = clamp(Math.round(anchorY + Math.sin(ang) * r), 100, WORLD_SIZE - 100);
          if (this.canPlaceBuilding(defId, cx, cy)) {
            return { x: cx, y: cy };
          }
        }
      }
      return null;
    }

    startBuildingPlacement(defId, teamId, x, y, builderUnit = null) {
      const def = ZH_DATA.BUILDINGS[defId];
      if (!def) return null;
      if (!this.isEntityUnlocked(defId, teamId)) {
        if (teamId === 0) this.triggerAlert('Requires Tech Center (Strategy / Propaganda / Palace)!', '#f59e0b');
        return null;
      }

      const cost = this.getModifiedCost(defId, teamId);
      if (!this.canAfford(teamId, cost)) {
        if (teamId === 0) {
          this.triggerAlert('Insufficient funds!', '#ef4444');
          if (window.ZH_AUDIO) ZH_AUDIO.speak('Insufficient funds.');
        }
        return null;
      }

      // Check collision with existing buildings
      for (const other of this.buildings) {
        if (other.hp <= 0) continue;
        if (dist(x, y, other.x, other.y) < (def.size / 2 + other.radius + 16)) {
          if (teamId === 0) this.triggerAlert('Cannot build there — footprint blocked!', '#ef4444');
          return null;
        }
      }

      // Find an available Dozer or GLA Worker
      let builder = builderUnit;
      if (!builder) {
        const candidates = this.units.filter(u => u.team === teamId && u.def.isBuilder && u.hp > 0 && !u.unmanned && !u.garrisonedIn);
        if (candidates.length === 0) {
          if (teamId === 0) this.triggerAlert('No Dozer or Worker available to construct!', '#ef4444');
          return null;
        }
        candidates.sort((a, b) => {
          const aSel = this.selectedIds.has(a.id) ? -10000 : 0;
          const bSel = this.selectedIds.has(b.id) ? -10000 : 0;
          const aIdle = a.state === 'IDLE' ? -2500 : 0;
          const bIdle = b.state === 'IDLE' ? -2500 : 0;
          return (dist(a.x, a.y, x, y) + aSel + aIdle) - (dist(b.x, b.y, x, y) + bSel + bIdle);
        });
        builder = candidates[0];
      }

      this.teams[teamId].credits -= cost;
      const site = this.spawnBuilding(defId, teamId, x, y, false);
      builder.state = 'BUILD';
      builder.buildTargetId = site.id;
      builder.targetX = site.x;
      builder.targetY = site.y;

      if (teamId === 0 && window.ZH_AUDIO) {
        ZH_AUDIO.playSFX('click');
        if (builder.def.voiceMove) ZH_AUDIO.speak(builder.def.voiceMove);
      }
      return site;
    }

    queueUnitProduction(building, unitId) {
      return this.queueProduction(building, unitId);
    }

    queueUpgradeResearch(building, upgId) {
      return this.queueProduction(building, upgId);
    }

    spendGeneralPoint(teamId, powerId) {
      return this.unlockGeneralsPower(teamId, powerId);
    }

    toggleOvercharge(building) {
      if (!building || !building.def || !building.def.canOvercharge) return false;
      building.overcharged = !building.overcharged;
      this.recalculatePower(building.team);
      if (this.onStateChange) this.onStateChange();
      return true;
    }

    evacuateTunnel(tunnelOrId) {
      const b = typeof tunnelOrId === 'object' ? tunnelOrId : this.buildings.find(x => x.id === tunnelOrId);
      return this.deployFromTunnel(b);
    }

    queueProduction(building, itemId) {
      if (!building || !building.constructed || building.hp <= 0) return false;
      const team = this.teams[building.team];

      const uDef = ZH_DATA.UNITS[itemId];
      const upgDef = ZH_DATA.UPGRADES[itemId];

      if (uDef) {
        if (!this.isEntityUnlocked(itemId, building.team)) {
          if (building.team === 0) this.triggerAlert('Requires Tech Center!', '#f59e0b');
          return false;
        }
        if (building.queue.length >= 9) return false;
        const cost = this.getModifiedCost(itemId, building.team);
        if (!this.canAfford(building.team, cost)) {
          if (building.team === 0) {
            this.triggerAlert('Insufficient funds!', '#ef4444');
            if (window.ZH_AUDIO) ZH_AUDIO.speak('Insufficient funds.');
          }
          return false;
        }
        team.credits -= cost;
        building.queue.push({
          type: 'UNIT',
          id: itemId,
          name: uDef.shortName,
          timer: uDef.buildTime,
          totalTime: uDef.buildTime
        });
        if (building.team === 0 && window.ZH_AUDIO) ZH_AUDIO.playSFX('click');
        if (this.onStateChange) this.onStateChange();
        return true;
      }

      if (upgDef) {
        if (team.upgrades.has(itemId)) return false;
        if (building.queue.some(q => q.id === itemId)) return false;
        if (!this.canAfford(building.team, upgDef.cost)) {
          if (building.team === 0) this.triggerAlert('Insufficient funds for upgrade!', '#ef4444');
          return false;
        }
        team.credits -= upgDef.cost;
        building.queue.push({
          type: 'UPGRADE',
          id: itemId,
          name: upgDef.shortName,
          timer: 10,
          totalTime: 10
        });
        if (building.team === 0 && window.ZH_AUDIO) ZH_AUDIO.playSFX('click');
        if (this.onStateChange) this.onStateChange();
        return true;
      }

      return false;
    }

    cancelProduction(building, itemId) {
      if (!building || !building.queue || building.queue.length === 0) return false;
      let idx = -1;
      for (let i = building.queue.length - 1; i >= 0; i--) {
        if (!itemId || building.queue[i].id === itemId) {
          idx = i;
          break;
        }
      }
      if (idx === -1) return false;
      const removed = building.queue.splice(idx, 1)[0];
      const team = this.teams[building.team];
      if (team) {
        if (removed.type === 'UNIT') {
          team.credits += this.getModifiedCost(removed.id, building.team);
        } else if (removed.type === 'UPGRADE' && ZH_DATA.UPGRADES[removed.id]) {
          team.credits += ZH_DATA.UPGRADES[removed.id].cost;
        }
      }
      if (building.team === 0 && window.ZH_AUDIO) ZH_AUDIO.playSFX('click');
      if (this.onStateChange) this.onStateChange();
      return true;
    }

    // Phase 3 Tactical Stances & Control Groups (SYS-19 & SYS-20)
    orderGuardSelected(wx, wy) {
      let count = 0;
      for (const u of this.units) {
        if (u.team === 0 && this.selectedIds.has(u.id) && u.hp > 0 && !u.unmanned) {
          u.state = 'GUARD';
          u.guardX = wx !== undefined ? wx : u.x;
          u.guardY = wy !== undefined ? wy : u.y;
          u.targetX = u.guardX;
          u.targetY = u.guardY;
          u.targetEntityId = null;
          u.waypoints = [];
          count++;
        }
      }
      if (count > 0 && window.ZH_AUDIO) ZH_AUDIO.playSFX('click');
      if (this.onStateChange) this.onStateChange();
      return count;
    }

    orderForceFireSelected(wx, wy, targetEntity = null) {
      let count = 0;
      for (const u of this.units) {
        if (u.team === 0 && this.selectedIds.has(u.id) && u.hp > 0 && !u.unmanned && u.def.weapon) {
          u.state = 'FORCE_FIRE';
          u.targetX = targetEntity ? targetEntity.x : wx;
          u.targetY = targetEntity ? targetEntity.y : wy;
          u.targetEntityId = targetEntity ? targetEntity.id : null;
          u.waypoints = [];
          count++;
        }
      }
      if (count > 0 && window.ZH_AUDIO) ZH_AUDIO.playSFX('click');
      if (this.onStateChange) this.onStateChange();
      return count;
    }

    orderScatterSelected() {
      const selectedUnits = this.units.filter(u => u.team === 0 && this.selectedIds.has(u.id) && u.hp > 0 && !u.unmanned);
      if (selectedUnits.length === 0) return 0;
      let cx = 0;
      let cy = 0;
      for (const u of selectedUnits) {
        cx += u.x;
        cy += u.y;
      }
      cx /= selectedUnits.length;
      cy /= selectedUnits.length;

      selectedUnits.forEach((u, i) => {
        let ang = Math.atan2(u.y - cy, u.x - cx);
        if (Math.hypot(u.x - cx, u.y - cy) < 6) {
          ang = (i / Math.max(1, selectedUnits.length)) * Math.PI * 2;
        }
        u.state = 'MOVE';
        u.targetX = clamp(u.x + Math.cos(ang) * 90, 40, WORLD_SIZE - 40);
        u.targetY = clamp(u.y + Math.sin(ang) * 90, 40, WORLD_SIZE - 40);
        u.targetEntityId = null;
        u.waypoints = [];
      });
      if (window.ZH_AUDIO) ZH_AUDIO.playSFX('click');
      if (this.onStateChange) this.onStateChange();
      return selectedUnits.length;
    }

    bindControlGroup(groupNum) {
      if (this.selectedIds.size === 0) return false;
      const ids = Array.from(this.selectedIds);
      this.controlGroups[groupNum] = ids;

      for (const u of this.units) {
        if (u.controlGroup === groupNum && !this.selectedIds.has(u.id)) u.controlGroup = null;
        if (this.selectedIds.has(u.id)) u.controlGroup = groupNum;
      }
      for (const b of this.buildings) {
        if (b.controlGroup === groupNum && !this.selectedIds.has(b.id)) b.controlGroup = null;
        if (this.selectedIds.has(b.id)) b.controlGroup = groupNum;
      }
      if (window.ZH_AUDIO) ZH_AUDIO.playSFX('click');
      if (this.onStateChange) this.onStateChange();
      return true;
    }

    selectControlGroup(groupNum, centerCamera = false) {
      const grp = this.controlGroups[groupNum];
      if (!grp || grp.length === 0) return false;
      this.selectedIds.clear();
      let sx = 0;
      let sy = 0;
      let count = 0;
      for (const id of grp) {
        const ent = this.units.find(u => u.id === id && u.team === 0 && u.hp > 0) ||
                    this.buildings.find(b => b.id === id && b.team === 0 && b.hp > 0);
        if (ent) {
          this.selectedIds.add(id);
          sx += ent.x;
          sy += ent.y;
          count++;
        }
      }
      if (count > 0 && centerCamera) {
        this.cam.x = clamp(sx / count - this.cam.w / 2, 0, WORLD_SIZE - this.cam.w);
        this.cam.y = clamp(sy / count - this.cam.h / 2, 0, WORLD_SIZE - this.cam.h);
      }
      if (this.onStateChange) this.onStateChange();
      return count > 0;
    }

    jumpToLastAlert() {
      if (!this.lastAlertPos) return false;
      this.cam.x = clamp(this.lastAlertPos.x - this.cam.w / 2, 0, WORLD_SIZE - this.cam.w);
      this.cam.y = clamp(this.lastAlertPos.y - this.cam.h / 2, 0, WORLD_SIZE - this.cam.h);
      if (window.ZH_AUDIO) ZH_AUDIO.playSFX('click');
      return true;
    }

    assignNearestSupplyDock(unit) {
      let best = null;
      let bestDist = Infinity;
      for (const d of this.supplyDocks) {
        if (d.amount <= 0) continue;
        const dd = dist(unit.x, unit.y, d.x, d.y);
        if (dd < bestDist) {
          bestDist = dd;
          best = d;
        }
      }
      if (best) {
        unit.state = 'HARVEST';
        unit.supplyDockId = best.id;
        unit.targetX = best.x;
        unit.targetY = best.y;
      } else {
        unit.state = 'IDLE';
      }
    }

    findNearestSupplyDepot(teamId, x, y) {
      let best = null;
      let bestDist = Infinity;
      for (const b of this.buildings) {
        if (b.team === teamId && b.constructed && b.hp > 0 && b.def.isSupplyDepot) {
          const dd = dist(x, y, b.x, b.y);
          if (dd < bestDist) {
            bestDist = dd;
            best = b;
          }
        }
      }
      return best;
    }

    // GLA Tunnel Network Deployment
    deployFromTunnel(tunnelBuilding) {
      if (!tunnelBuilding || !tunnelBuilding.def.isTunnel || !tunnelBuilding.constructed) return;
      const team = this.teams[tunnelBuilding.team];
      if (team.tunnelUnits.length === 0) {
        if (tunnelBuilding.team === 0) this.triggerAlert('Tunnel Network garrison is empty!', '#f59e0b');
        return;
      }

      const count = team.tunnelUnits.length;
      while (team.tunnelUnits.length > 0) {
        const u = team.tunnelUnits.shift();
        const ang = Math.random() * Math.PI * 2;
        u.x = clamp(tunnelBuilding.x + Math.cos(ang) * (tunnelBuilding.radius + 22), 40, WORLD_SIZE - 40);
        u.y = clamp(tunnelBuilding.y + Math.sin(ang) * (tunnelBuilding.radius + 22), 40, WORLD_SIZE - 40);
        u.hp = u.maxHp; // Full heal inside tunnel!
        u.state = 'IDLE';
        this.units.push(u);
      }

      this.spawnBurst(tunnelBuilding.x, tunnelBuilding.y, '#eab308', 14);
      if (tunnelBuilding.team === 0) {
        if (window.ZH_AUDIO) ZH_AUDIO.playSFX('click');
        this.triggerAlert(`Deployed ${count} units from subterranean Tunnel Network!`, '#eab308');
      }
      if (this.onStateChange) this.onStateChange();
    }

    // Unlock & Cast Generals Powers
    unlockGeneralsPower(teamId, powerId) {
      const team = this.teams[teamId];
      const powers = ZH_DATA.GENERALS_POWERS[team.factionId] || [];
      const pDef = powers.find(p => p.id === powerId);
      if (!pDef) return false;
      if (team.unlockedPowers.has(powerId)) return false;
      if (team.rank < pDef.rankReq || team.generalPoints < pDef.costPoints) return false;

      team.generalPoints -= pDef.costPoints;
      team.unlockedPowers.add(powerId);
      team.powerCooldowns[powerId] = 0;
      if (teamId === 0 && window.ZH_AUDIO) {
        ZH_AUDIO.playSFX('promote');
        ZH_AUDIO.speak(`${pDef.name} authorized and ready.`);
      }
      if (this.onStateChange) this.onStateChange();
      return true;
    }

    castGeneralsPower(teamId, powerId, targetX, targetY) {
      const team = this.teams[teamId];
      const powers = ZH_DATA.GENERALS_POWERS[team.factionId] || [];
      const pDef = powers.find(p => p.id === powerId);
      if (!pDef || !team.unlockedPowers.has(powerId)) return false;
      if ((team.powerCooldowns[powerId] || 0) > 0) return false;

      team.powerCooldowns[powerId] = pDef.cooldown;
      this.addRadarPing(targetX, targetY, team.faction.color);

      switch (powerId) {
        case 'GP_USA_SPY_DRONE': {
          this.spyDrones.push({
            id: nextEntityId++,
            team: teamId,
            x: targetX,
            y: targetY,
            radius: pDef.radius,
            timer: 60
          });
          this.triggerAlert('Spy Drone deployed over target sector!', '#3b82f6');
          if (window.ZH_AUDIO) ZH_AUDIO.speak('Spy Drone deployed.');
          break;
        }

        case 'GP_USA_A10_STRIKE': {
          this.triggerAlert('Incoming A-10 Thunderbolt Strike!', '#3b82f6');
          if (window.ZH_AUDIO) ZH_AUDIO.speak('A-10 Thunderbolt strike inbound!', { priority: true });
          for (let i = 0; i < 7; i++) {
            const ox = targetX + (Math.random() - 0.5) * 160;
            const oy = targetY + (Math.random() - 0.5) * 160;
            this.dealAreaDamage(ox, oy, 95, 190, 'HIGH_EXPLOSIVE', teamId);
            this.spawnBurst(ox, oy, '#f97316', 18);
          }
          this.cam.shake = Math.max(this.cam.shake, 14);
          if (window.ZH_AUDIO) ZH_AUDIO.playSFX('explosion');
          break;
        }

        case 'GP_USA_SPECTRE_GUNSHIP': {
          this.triggerAlert('AC-130U Spectre Gunship orbiting target zone!', '#3b82f6');
          if (window.ZH_AUDIO) ZH_AUDIO.speak('Spectre Gunship on station!', { priority: true });
          this.spectreGunships.push({
            id: nextEntityId++,
            team: teamId,
            cx: targetX,
            cy: targetY,
            orbitRadius: 155,
            angle: 0,
            timer: 18,
            shotTimer: 0
          });
          break;
        }

        case 'GP_USA_FUEL_AIR_BOMB': {
          this.triggerAlert('MOAB Fuel-Air Bomb Detonated!', '#3b82f6');
          if (window.ZH_AUDIO) ZH_AUDIO.speak('Fuel Air Bomb impact!', { priority: true });
          this.dealAreaDamage(targetX, targetY, pDef.radius, 620, 'SUPERWEAPON', teamId);
          this.spawnBurst(targetX, targetY, '#fb923c', 45);
          this.cam.shake = Math.max(this.cam.shake, 26);
          if (window.ZH_AUDIO) {
            ZH_AUDIO.playSFX('superweapon');
            ZH_AUDIO.playSFX('explosion');
          }
          break;
        }

        case 'GP_CHINA_ARTILLERY_BARRAGE': {
          this.triggerAlert('PLA Artillery Barrage saturating target coordinates!', '#ef4444');
          if (window.ZH_AUDIO) ZH_AUDIO.speak('Artillery barrage inbound!');
          for (let i = 0; i < 8; i++) {
            const ox = targetX + (Math.random() - 0.5) * 170;
            const oy = targetY + (Math.random() - 0.5) * 170;
            this.dealAreaDamage(ox, oy, 85, 165, 'HIGH_EXPLOSIVE', teamId);
            this.spawnBurst(ox, oy, '#ef4444', 16);
          }
          this.cam.shake = Math.max(this.cam.shake, 15);
          if (window.ZH_AUDIO) ZH_AUDIO.playSFX('explosion');
          break;
        }

        case 'GP_CHINA_CASH_HACK': {
          const enemy = this.teams[1 - teamId];
          const stolen = Math.min(2500, Math.max(1200, enemy.credits));
          enemy.credits = Math.max(0, enemy.credits - stolen);
          team.credits += stolen;
          this.spawnFloatingText(targetX, targetY, `+$${stolen} CASH HACK!`, '#22c55e');
          this.spawnBurst(targetX, targetY, '#22c55e', 24);
          this.triggerAlert(`Cyber Cash Hack siphoned $${stolen}!`, '#22c55e');
          if (window.ZH_AUDIO) {
            ZH_AUDIO.playSFX('cash');
            ZH_AUDIO.speak('Enemy funds transferred.');
          }
          break;
        }

        case 'GP_CHINA_CARPET_BOMB': {
          this.triggerAlert('H-6 Strategic Carpet Bomber saturating target corridor!', '#ef4444');
          if (window.ZH_AUDIO) ZH_AUDIO.speak('Carpet bombing run initiated!', { priority: true });
          for (let i = -4; i <= 4; i++) {
            const bx = clamp(targetX + i * 38, 60, WORLD_SIZE - 60);
            const by = clamp(targetY - i * 24, 60, WORLD_SIZE - 60);
            this.dealAreaDamage(bx, by, 100, 210, 'HIGH_EXPLOSIVE', teamId);
            this.spawnBurst(bx, by, '#f97316', 16);
          }
          this.cam.shake = Math.max(this.cam.shake, 20);
          if (window.ZH_AUDIO) ZH_AUDIO.playSFX('explosion');
          break;
        }

        case 'GP_CHINA_EMP_PULSE': {
          this.triggerAlert('EMP Pulse & Carpet Bombing detonated!', '#ef4444');
          if (window.ZH_AUDIO) ZH_AUDIO.speak('EMP Pulse detonated!', { priority: true });
          this.applyEMP(targetX, targetY, pDef.radius, 14, teamId);
          this.dealAreaDamage(targetX, targetY, pDef.radius, 480, 'HIGH_EXPLOSIVE', teamId);
          this.spawnBurst(targetX, targetY, '#38bdf8', 40);
          this.cam.shake = Math.max(this.cam.shake, 22);
          if (window.ZH_AUDIO) ZH_AUDIO.playSFX('explosion');
          break;
        }

        case 'GP_GLA_REBEL_AMBUSH': {
          this.triggerAlert('GLA Rebel Ambush emerging from underground!', '#eab308');
          if (window.ZH_AUDIO) ZH_AUDIO.speak('Ambush! Strike from the shadows!');
          for (let i = 0; i < 5; i++) {
            const u = this.spawnUnit('GLA_REBEL', teamId, targetX, targetY);
            if (u) u.vetLevel = 1;
          }
          for (let i = 0; i < 2; i++) {
            const u = this.spawnUnit('GLA_RPG_TROOPER', teamId, targetX, targetY);
            if (u) u.vetLevel = 1;
          }
          this.spawnBurst(targetX, targetY, '#eab308', 22);
          break;
        }

        case 'GP_GLA_CASH_BOUNTY': {
          team.credits += 1500;
          for (let i = 0; i < 4; i++) {
            this.salvageCrates.push({
              id: nextEntityId++,
              x: clamp(targetX + (Math.random() - 0.5) * 90, 50, WORLD_SIZE - 50),
              y: clamp(targetY + (Math.random() - 0.5) * 90, 50, WORLD_SIZE - 50),
              timer: 90
            });
          }
          this.spawnFloatingText(targetX, targetY, '+$1500 & 4 SALVAGE CRATES!', '#fde047');
          this.triggerAlert('GLA War Chest Bounty (+$1,500) & Salvage Crates delivered!', '#eab308');
          if (window.ZH_AUDIO) ZH_AUDIO.playSFX('cash');
          break;
        }

        case 'GP_GLA_GPS_SCRAMBLER': {
          this.triggerAlert('GLA GPS Scrambler activated — units camouflaged!', '#22c55e');
          if (window.ZH_AUDIO) ZH_AUDIO.speak('GPS Scrambler active. Units cloaked.');
          for (const u of this.units) {
            if (u.team === teamId && dist(targetX, targetY, u.x, u.y) <= (pDef.radius || 180)) {
              u.stealthed = true;
              u.gpsScrambleTimer = 28;
            }
          }
          this.spawnBurst(targetX, targetY, '#22c55e', 24);
          break;
        }

        case 'GP_GLA_ANTHRAX_BOMB': {
          this.triggerAlert('Anthrax Bio-Bomb released over target area!', '#22c55e');
          if (window.ZH_AUDIO) ZH_AUDIO.speak('Anthrax Bomb deployed!', { priority: true });
          this.dealAreaDamage(targetX, targetY, pDef.radius, 420, 'FLAME_TOXIN', teamId);
          this.hazards.push({
            id: nextEntityId++,
            type: 'TOXIN',
            team: teamId,
            x: targetX,
            y: targetY,
            radius: pDef.radius * 0.85,
            timer: 26,
            dps: 48
          });
          if (window.ZH_SPATIAL) {
            ZH_SPATIAL.BallisticsEngine.applySpecialHitEffects(
              this,
              { team: teamId, damageType: 'FLAME_TOXIN', splash: pDef.radius },
              null,
              targetX,
              targetY
            );
          }
          this.spawnBurst(targetX, targetY, '#22c55e', 42);
          if (window.ZH_AUDIO) ZH_AUDIO.playSFX('explosion');
          break;
        }
      }

      if (this.onStateChange) this.onStateChange();
      return true;
    }

    // Fire Global Superweapons (Particle Cannon, Nuclear Missile, Scud Storm)
    fireSuperweapon(buildingId, targetX, targetY) {
      const b = this.buildings.find(x => x.id === buildingId);
      if (!b || !b.constructed || !b.superweaponReady || b.hp <= 0) return false;

      b.superweaponReady = false;
      b.superweaponTimer = b.superweaponMaxTimer;
      const team = this.teams[b.team];
      const mod = team.general.modifiers || {};

      this.addRadarPing(targetX, targetY, '#ef4444');
      this.lastAlertPos = { x: targetX, y: targetY };
      if (window.ZH_VFX && ZH_VFX.triggerSuperweaponSpectacle) {
        ZH_VFX.triggerSuperweaponSpectacle(this, b.def.superweaponType, targetX, targetY);
      }
      if (window.ZH_AUDIO) {
        ZH_AUDIO.playSFX('superweapon', targetX, targetY, this.cam);
        ZH_AUDIO.playSFX('explosion', targetX, targetY, this.cam);
      }
      this.cam.shake = 32;

      if (b.def.superweaponType === 'PARTICLE_CANNON') {
        this.triggerAlert('ORBITAL PARTICLE CANNON BEAM ENGAGED!', '#38bdf8');
        if (window.ZH_AUDIO) ZH_AUDIO.speak('Particle Cannon activated!', { priority: true });
        this.activeBeams.push({
          id: nextEntityId++,
          team: b.team,
          x: targetX,
          y: targetY,
          destX: clamp(targetX + 180, 100, WORLD_SIZE - 100),
          destY: clamp(targetY - 120, 100, WORLD_SIZE - 100),
          radius: 90,
          timer: 8.5,
          dps: 220
        });
      } else if (b.def.superweaponType === 'NUCLEAR_MISSILE') {
        this.triggerAlert('THERMONUCLEAR MISSILE IMPACT!', '#ef4444');
        if (window.ZH_AUDIO) ZH_AUDIO.speak('Nuclear Missile launched!', { priority: true });
        const dmg = Math.round(950 * (mod.nukeDamageMult || 1.0));
        this.dealAreaDamage(targetX, targetY, 270, dmg, 'SUPERWEAPON', b.team);
        this.hazards.push({
          id: nextEntityId++,
          type: 'RADIATION',
          team: b.team,
          x: targetX,
          y: targetY,
          radius: 230,
          timer: 25,
          dps: 45
        });
        this.spawnBurst(targetX, targetY, '#f97316', 65);
      } else if (b.def.superweaponType === 'SCUD_STORM') {
        this.triggerAlert('SCUD STORM ANTHRAX SALVO IMPACT!', '#eab308');
        if (window.ZH_AUDIO) ZH_AUDIO.speak('Scud Storm launched!', { priority: true });
        for (let i = 0; i < 9; i++) {
          const ang = (i / 9) * Math.PI * 2;
          const distOff = i === 0 ? 0 : 95 + (i % 2) * 50;
          const sx = clamp(targetX + Math.cos(ang) * distOff, 60, WORLD_SIZE - 60);
          const sy = clamp(targetY + Math.sin(ang) * distOff, 60, WORLD_SIZE - 60);
          this.dealAreaDamage(sx, sy, 125, 420, 'SUPERWEAPON', b.team);
          this.hazards.push({
            id: nextEntityId++,
            type: 'TOXIN',
            team: b.team,
            x: sx,
            y: sy,
            radius: 105,
            timer: 22,
            dps: 42
          });
          this.spawnBurst(sx, sy, '#84cc16', 20);
        }
      }

      if (this.onStateChange) this.onStateChange();
      return true;
    }

    // ========================================================================
    // Main Simulation Step (60Hz Fixed-Timestep Accumulator + Direct Tick)
    // ========================================================================
    stepFixed(rawDt) {
      if (!this.running || this.paused || this.gameOver) return;
      this.accumulator += Math.min(0.1, rawDt) * this.gameSpeed;
      while (this.accumulator + 1e-9 >= FIXED_STEP) {
        this.update(FIXED_STEP);
        this.accumulator = Math.max(0, this.accumulator - FIXED_STEP);
      }
    }

    update(rawDt) {
      if (!this.running || this.paused || this.gameOver) return;
      const dt = Math.min(0.05, rawDt) * this.gameSpeed;
      this.gameTime += dt;
      this.matchTime = this.gameTime;
      this.simTick = (this.simTick || 0) + 1;
      if (this.underAttackTimer > 0) {
        this.underAttackTimer = Math.max(0, this.underAttackTimer - dt);
      }

      if (this.cam.shake > 0) {
        this.cam.shake = Math.max(0, this.cam.shake - dt * 28);
      }

      // 0. Rebuild SpatialHashGrid for O(k) queries
      if (this.spatialGrid) {
        this.spatialGrid.rebuild(this.units, this.buildings);
      }

      // 1. Update Generals Power Cooldowns & GLA Tunnel Healing
      for (const team of this.teams) {
        for (const k of Object.keys(team.powerCooldowns)) {
          if (team.powerCooldowns[k] > 0) {
            team.powerCooldowns[k] = Math.max(0, team.powerCooldowns[k] - dt);
          }
        }
        for (const tu of team.tunnelUnits) {
          tu.hp = Math.min(tu.maxHp, tu.hp + 25 * dt);
        }
      }

      // 2. Periodic Passive Income (Supply Drop Zones, Internet Centers, Black Markets, Tech Oil Derricks)
      this.passiveIncomeTimer += dt;
      if (this.passiveIncomeTimer >= 2.0) {
        this.passiveIncomeTimer -= 2.0;
        for (const b of this.buildings) {
          if (!b.constructed || b.hp <= 0) continue;
          const team = this.teams[b.team];
          if (b.def.passiveIncome && !team.isLowPower) {
            team.credits += b.def.passiveIncome;
            this.spawnFloatingText(b.x, b.y - 20, `+$${b.def.passiveIncome}`, '#22c55e');
          }
        }
        for (const o of this.techStructures) {
          if (o.team >= 0 && o.def && o.def.passiveIncome) {
            this.teams[o.team].credits += o.def.passiveIncome;
            this.spawnFloatingText(o.x, o.y - 18, `+$${o.def.passiveIncome} OIL`, '#fde047');
          }
        }
      }

      // 3. Periodic Horde & Propaganda Aura Check
      this.hordeCheckTimer += dt;
      if (this.hordeCheckTimer >= 0.4) {
        this.hordeCheckTimer = 0;
        this.updateAurasAndHorde();
      }

      // 4. Update Buildings & Civilian Garrison Bunkers
      this.updateBuildings(dt);
      this.updateGarrisonBunkers(dt);

      // 5. Update Units (Locomotor Movement, Harvesting, Building, Combat, PDL, Abilities)
      this.updateUnits(dt);

      // 6. Update Projectiles (with 3D Parabolic Ballistics)
      this.updateProjectiles(dt);

      // 7. Update Orbital Particle Beams, Spectre Gunships, Hazards, Spy Drones, Crates & Phase 3 VFX
      this.updateSpecialEffects(dt);
      if (window.ZH_VFX && ZH_VFX.updateVFX) {
        ZH_VFX.updateVFX(this, dt);
      }
      if (window.ZH_AUDIO && ZH_AUDIO.setCombatIntensity) {
        ZH_AUDIO.setCombatIntensity(Math.min(1, this.projectiles.length / 8));
      }

      // 8. Update Fog of War
      this.fogUpdateTimer += dt;
      if (this.fogUpdateTimer >= 0.25) {
        this.fogUpdateTimer = 0;
        this.updateFogOfWar();
      }

      // 9. Update AI Commander
      if (window.ZH_AI) {
        ZH_AI.update(this, dt);
      }

      // 10. Check Victory / Defeat Conditions
      this.checkVictoryConditions();
    }

    updateAurasAndHorde() {
      for (const u of this.units) {
        u.inHorde = false;
        u.inPropaganda = false;
      }

      // China Nationalism Horde Bonus (5+ friendly horde-eligible units within 145px)
      for (const u of this.units) {
        if (!u.def.hasHordeBonus || u.hp <= 0 || u.unmanned) continue;
        let count = 0;
        const nearby = this.spatialGrid
          ? this.spatialGrid.queryRadius(u.x, u.y, 145)
          : this.units;
        for (const other of nearby) {
          if (other.isUnit && other.team === u.team && other.def.hasHordeBonus && other.hp > 0) {
            if (dist(u.x, u.y, other.x, other.y) <= 145) {
              count++;
              if (count >= 5) break;
            }
          }
        }
        if (count >= 5) u.inHorde = true;
      }

      // China Speaker Tower & Overlord Propaganda Aura
      const emitters = [];
      for (const b of this.buildings) {
        if (b.constructed && b.hp > 0 && b.def.isPropagandaTower && !this.teams[b.team].isLowPower) {
          emitters.push({ team: b.team, x: b.x, y: b.y, r: b.def.auraRadius || 210 });
        }
      }
      for (const u of this.units) {
        if (u.hp > 0 && !u.unmanned && (u.def.isPropagandaCarrier || u.hasSpeakerTower)) {
          emitters.push({ team: u.team, x: u.x, y: u.y, r: u.def.auraRadius || 195 });
        }
      }

      for (const em of emitters) {
        for (const u of this.units) {
          if (u.team === em.team && u.hp > 0 && dist(u.x, u.y, em.x, em.y) <= em.r) {
            u.inPropaganda = true;
          }
        }
      }
    }

    updateGarrisonBunkers(dt) {
      for (const bunker of this.garrisonBunkers) {
        if (bunker.occupants.length === 0 || bunker.team < 0) continue;
        for (const occ of bunker.occupants) {
          if (!occ.def.weapon) continue;
          occ.attackCooldown = Math.max(0, (occ.attackCooldown || 0) - dt);
          if (occ.attackCooldown <= 0) {
            const range = occ.def.weapon.range * (bunker.rangeBonus || 1.25);
            const target = this.findBestTarget(
              { x: bunker.x, y: bunker.y, team: bunker.team },
              range,
              occ.def.weapon.antiAir
            );
            if (target) {
              this.fireWeapon(
                {
                  id: occ.id,
                  isUnit: true,
                  defId: occ.defId,
                  def: occ.def,
                  team: bunker.team,
                  x: bunker.x,
                  y: bunker.y,
                  vetLevel: occ.vetLevel,
                  salvageTier: occ.salvageTier
                },
                target,
                occ.def.weapon
              );
              occ.attackCooldown = occ.def.weapon.cooldown;
            }
          }
        }
      }
    }

    updateBuildings(dt) {
      for (let i = this.buildings.length - 1; i >= 0; i--) {
        const b = this.buildings[i];
        if (b.hp <= 0) {
          this.destroyBuilding(b, i);
          continue;
        }

        if (b.disabledTimer > 0) b.disabledTimer = Math.max(0, b.disabledTimer - dt);
        if (b.empTimer > 0) b.empTimer = Math.max(0, b.empTimer - dt);
        const isDisabled = b.disabledTimer > 0 || b.empTimer > 0;

        const team = this.teams[b.team];
        const speedMult = team.isLowPower ? 0.5 : 1.0;

        // China Nuclear Reactor Overcharge self-damage
        if (b.overcharged && b.constructed) {
          b.hp -= 8 * dt;
          if (b.hp < b.maxHp * 0.2) {
            b.overcharged = false;
            this.recalculatePower(b.team);
          }
        }

        // Production Queue
        if (b.constructed && b.queue.length > 0 && !isDisabled) {
          const item = b.queue[0];
          item.timer -= dt * speedMult;
          if (item.timer <= 0) {
            b.queue.shift();
            if (item.type === 'UNIT') {
              const uDef = ZH_DATA.UNITS[item.id];
              const count = (uDef && uDef.spawnCount) ? uDef.spawnCount : 1;
              const uRad = (uDef && uDef.radius) || 14;
              const exitAng = angleBetween(b.x, b.y, b.rallyX, b.rallyY);
              const spawnDist = b.radius + uRad + 18;
              for (let c = 0; c < count; c++) {
                const lateral = (c - (count - 1) * 0.5) * (uRad * 1.6 + 6);
                const sx = b.x + Math.cos(exitAng) * spawnDist - Math.sin(exitAng) * lateral;
                const sy = b.y + Math.sin(exitAng) * spawnDist + Math.cos(exitAng) * lateral;
                const spawned = this.spawnUnit(item.id, b.team, sx, sy);
                if (spawned) {
                  spawned.angle = exitAng;
                  spawned.turretAngle = exitAng;
                  if (spawned.def.isHarvester && !spawned.def.isBuilder) {
                    this.assignNearestSupplyDock(spawned);
                  } else {
                    spawned.state = 'ATTACK_MOVE';
                    spawned.targetX = clamp(b.rallyX + (c - (count - 1) * 0.5) * 22 + (Math.random() - 0.5) * 18, 40, WORLD_SIZE - 40);
                    spawned.targetY = clamp(b.rallyY + (Math.random() - 0.5) * 18, 40, WORLD_SIZE - 40);
                  }
                }
              }
              if (b.team === 0 && window.ZH_AUDIO) ZH_AUDIO.speak('Unit ready.');
            } else if (item.type === 'UPGRADE') {
              team.upgrades.add(item.id);
              this.recalculatePower(b.team);
              if (b.team === 0) {
                this.triggerAlert(`Upgrade Complete: ${ZH_DATA.UPGRADES[item.id].name}`, '#22c55e');
                if (window.ZH_AUDIO) ZH_AUDIO.speak('Upgrade complete.');
              }
            }
            if (this.onStateChange) this.onStateChange();
          }
        }

        // Superweapon Countdown Timer
        if (b.constructed && b.def.isSuperweapon && !b.superweaponReady) {
          if (!team.isLowPower && !isDisabled) {
            b.superweaponTimer = Math.max(0, b.superweaponTimer - dt);
            if (b.superweaponTimer <= 0) {
              b.superweaponReady = true;
              if (b.team === 0) {
                this.triggerAlert(`${b.def.name} is READY TO FIRE!`, '#22c55e');
                if (window.ZH_AUDIO) ZH_AUDIO.speak(`${b.def.name} ready.`);
              }
              if (this.onStateChange) this.onStateChange();
            }
          }
        }

        // Base Defense Turrets
        if (b.constructed && b.def.isDefense && b.def.weapon && !isDisabled) {
          const requiresPower = team.faction.usesPower && b.def.power < 0;
          if (!requiresPower || !team.isLowPower) {
            b.attackCooldown = Math.max(0, b.attackCooldown - dt);
            if (b.attackCooldown <= 0) {
              const target = this.findBestTarget(b, b.def.weapon.range, b.def.weapon.antiAir);
              if (target) {
                b.turretAngle = angleBetween(b.x, b.y, target.x, target.y);
                this.fireWeapon(b, target, b.def.weapon);
                b.attackCooldown = b.def.weapon.cooldown;
              }
            }
          }
        }
      }
    }

    updateUnits(dt) {
      // Determine Tech Hospital & Tech Repair Bay ownership per team (BUG-04)
      const hasHospital = [false, false];
      const hasRepairBay = [false, false];
      for (const ts of this.techStructures) {
        if (ts.team >= 0 && ts.def) {
          if (ts.def.infantryHealRate || ts.def.healInfantryRate) hasHospital[ts.team] = true;
          if (ts.def.vehicleRepairRate || ts.def.repairVehicleRate) hasRepairBay[ts.team] = true;
        }
      }

      for (let i = this.units.length - 1; i >= 0; i--) {
        const u = this.units[i];
        if (u.hp <= 0) {
          this.destroyUnit(u, i);
          continue;
        }
        if (u.garrisonedIn || u.garrisonId) {
          continue;
        }

        u.rotorAngle += dt * 16;
        if (u.abilityCooldown > 0) u.abilityCooldown = Math.max(0, u.abilityCooldown - dt);
        if (u.laserLockTimer > 0) {
          u.laserLockTimer = Math.max(0, u.laserLockTimer - dt);
          u.laserLockedTimer = u.laserLockTimer;
        } else if (u.laserLockedTimer > 0) {
          u.laserLockedTimer = Math.max(0, u.laserLockedTimer - dt);
          u.laserLockTimer = u.laserLockedTimer;
        }
        if (u.gpsScrambleTimer > 0) {
          u.gpsScrambleTimer = Math.max(0, u.gpsScrambleTimer - dt);
          if (u.gpsScrambleTimer <= 0 && !u.def.stealthed) {
            u.stealthed = false;
          }
        }

        // Unmanned vehicles sit idle waiting for infantry to re-crew them
        if (u.unmanned || u.team < 0) {
          continue;
        }

        const team = this.teams[u.team];
        const vetDef = ZH_DATA.VETERANCY_LEVELS[u.vetLevel] || ZH_DATA.VETERANCY_LEVELS[0];

        // Veterancy / Propaganda / GLA Junk Repair / Tech Hospital / Tech Repair Bay self-healing
        let healRate = vetDef.selfHeal;
        if (u.inPropaganda) {
          healRate += team.upgrades.has('UPG_SUBLIMINAL_MESSAGING') ? 22 : 12;
        }
        if (u.def.isMob) healRate += 10;
        if (u.def.category === 'INFANTRY' && hasHospital[u.team]) healRate += 10;
        if (u.def.category !== 'INFANTRY' && hasRepairBay[u.team]) healRate += 16;
        if (team.factionId === 'GLA' && u.def.category !== 'INFANTRY' && team.upgrades.has('UPG_JUNK_REPAIR')) {
          healRate += 10;
        }
        if (healRate > 0 && u.hp < u.maxHp) {
          u.hp = Math.min(u.maxHp, u.hp + healRate * dt);
        }

        if (u.disabledTimer > 0) u.disabledTimer = Math.max(0, u.disabledTimer - dt);
        if (u.empTimer > 0) u.empTimer = Math.max(0, u.empTimer - dt);
        if (u.disabledTimer > 0 || u.empTimer > 0) {
          continue;
        }

        // USA Point-Defense Laser (PDL) Missile Interception (Paladin, Avenger, King Raptor, Combat Chinook)
        if (u.def.hasPointDefenseLaser) {
          u.pdlTimer = Math.max(0, u.pdlTimer - dt);
          if (u.pdlTimer <= 0) {
            for (let pIdx = this.projectiles.length - 1; pIdx >= 0; pIdx--) {
              const proj = this.projectiles[pIdx];
              if (proj.team !== u.team && (proj.projType === 'MISSILE' || proj.projType === 'SCUD_MISSILE')) {
                if (dist(u.x, u.y, proj.x, proj.y) <= 175) {
                  this.particles.push({
                    type: 'LASER_LINE',
                    x1: u.x,
                    y1: u.y,
                    x2: proj.x,
                    y2: proj.y,
                    color: '#ef4444',
                    timer: 0.18,
                    maxTimer: 0.18
                  });
                  this.spawnBurst(proj.x, proj.y, '#38bdf8', 7);
                  this.projectiles.splice(pIdx, 1);
                  u.pdlTimer = u.def.pdlCooldown || 1.4;
                  if (window.ZH_AUDIO) ZH_AUDIO.playSFX('pdl');
                  break;
                }
              }
            }
          }
        }

        // GLA Salvage Crate Collection
        if (team.factionId === 'GLA' && this.salvageCrates.length > 0) {
          for (let cIdx = this.salvageCrates.length - 1; cIdx >= 0; cIdx--) {
            const crate = this.salvageCrates[cIdx];
            if (dist(u.x, u.y, crate.x, crate.y) <= u.radius + 22) {
              this.salvageCrates.splice(cIdx, 1);
              if (u.def.canSalvage && u.salvageTier < 2) {
                u.salvageTier++;
                u.maxHp = Math.round(u.maxHp * 1.15);
                u.hp = Math.min(u.maxHp, u.hp + 120);
                this.spawnFloatingText(u.x, u.y - 16, `SALVAGE TIER ${u.salvageTier}!`, '#fde047');
              } else {
                team.credits += 150;
                this.spawnFloatingText(u.x, u.y - 16, '+$150 SALVAGE', '#22c55e');
              }
              if (window.ZH_AUDIO) ZH_AUDIO.playSFX('cash');
              break;
            }
          }
        }

        // PLA Cyber Hacker Field Income when IDLE
        if (u.def.isHacker && u.state === 'IDLE') {
          u.hackTimer += dt;
          if (u.hackTimer >= 2.0) {
            u.hackTimer -= 2.0;
            const mult = (team.general.modifiers && team.general.modifiers.hackerIncomeMult) || 1.0;
            const amt = Math.round(u.def.passiveHackIncome * mult);
            team.credits += amt;
            this.spawnFloatingText(u.x, u.y - 14, `+$${amt}`, '#22c55e');
          }
        }

        // Weapon Cooldown
        if (u.attackCooldown > 0) {
          let rofMult = vetDef.rofMult;
          if (u.inHorde) {
            const hMult = (team.general.modifiers && team.general.modifiers.hordeRofBonus) || 1.25;
            rofMult *= team.upgrades.has('UPG_NATIONALISM') ? hMult + 0.15 : hMult;
          }
          if (u.inPropaganda) rofMult *= 1.15;
          if (u.salvageTier > 0) rofMult *= (1 + u.salvageTier * 0.18);
          if (u.laserLockTimer > 0) rofMult *= 2.2;
          u.attackCooldown = Math.max(0, u.attackCooldown - dt * rofMult);
        }

        // Execute Unit State Machine
        this.stepUnitStateMachine(u, dt);
      }

      // Soft Ground Unit Separation
      for (let i = 0; i < this.units.length; i++) {
        const a = this.units[i];
        if (a.def.isAir || a.garrisonedIn || a.garrisonId) continue;
        for (let j = i + 1; j < this.units.length; j++) {
          const b = this.units[j];
          if (b.def.isAir || b.garrisonedIn || b.garrisonId) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          const minD = a.radius + b.radius + 2;
          if (d > 0.01 && d < minD) {
            const push = (minD - d) * 0.25;
            const nx = dx / d;
            const ny = dy / d;
            a.x = clamp(a.x - nx * push, 25, WORLD_SIZE - 25);
            a.y = clamp(a.y - ny * push, 25, WORLD_SIZE - 25);
            b.x = clamp(b.x + nx * push, 25, WORLD_SIZE - 25);
            b.y = clamp(b.y + ny * push, 25, WORLD_SIZE - 25);
          }
        }
      }

      // Hard Ground Unit vs. Building Footprint Exclusion (prevents units from ever being pushed inside buildings)
      for (let i = 0; i < this.units.length; i++) {
        const u = this.units[i];
        if (!u || u.hp <= 0 || u.def.isAir || u.garrisonedIn || u.garrisonId) continue;
        for (let j = 0; j < this.buildings.length; j++) {
          const b = this.buildings[j];
          if (!b || b.hp <= 0) continue;
          const minD = b.radius + (u.radius || 14) + 8;
          const dx = u.x - b.x;
          const dy = u.y - b.y;
          const d = Math.hypot(dx, dy);
          if (d < minD) {
            const exitAng = d > 0.5 ? Math.atan2(dy, dx) : angleBetween(b.x, b.y, b.rallyX || b.x, b.rallyY || (b.y + 90));
            u.x = clamp(b.x + Math.cos(exitAng) * minD, 25, WORLD_SIZE - 25);
            u.y = clamp(b.y + Math.sin(exitAng) * minD, 25, WORLD_SIZE - 25);
          }
        }
      }
    }

    stepUnitStateMachine(u, dt) {
      // 1. BUILD / REPAIR STATE (Dozer / Worker) (BUG-06)
      if (u.state === 'BUILD') {
        const targetId = u.buildTargetId || u.targetEntityId;
        const site = this.buildings.find(b => b.id === targetId);
        if (!site || site.hp <= 0 || (site.constructed && site.hp >= site.maxHp)) {
          u.state = 'IDLE';
          u.buildTargetId = null;
          return;
        }
        const d = dist(u.x, u.y, site.x, site.y);
        if (d > site.radius + u.radius + 22) {
          this.moveUnitToward(u, site.x, site.y, dt);
        } else {
          const mod = this.teams[u.team].general.modifiers || {};
          let buildTime = site.def.buildTime || 12;
          if (site.def.isTunnel && mod.tunnelCostMult) buildTime *= 0.7;
          const rate = 1.0 / buildTime;
          if (!site.constructed) {
            site.buildProgress = Math.min(1.0, site.buildProgress + rate * dt);
            site.hp = Math.min(site.maxHp, site.hp + site.maxHp * rate * dt);
            if (site.buildProgress >= 1.0) {
              this.onBuildingCompleted(site);
              u.state = 'IDLE';
              u.buildTargetId = null;
            }
          } else {
            site.hp = Math.min(site.maxHp, site.hp + site.maxHp * rate * 1.4 * dt);
            if (site.hp >= site.maxHp) {
              u.state = 'IDLE';
              u.buildTargetId = null;
            }
          }
        }
        return;
      }

      // 2. HARVEST SUPPLY DOCK
      if (u.state === 'HARVEST') {
        const dock = this.supplyDocks.find(d => d.id === u.supplyDockId);
        if (!dock || dock.amount <= 0) {
          this.assignNearestSupplyDock(u);
          return;
        }
        const d = dist(u.x, u.y, dock.x, dock.y);
        if (d > dock.radius + u.radius + 10) {
          this.moveUnitToward(u, dock.x, dock.y, dt);
        } else {
          u.harvestTimer += dt;
          if (u.harvestTimer >= 1.4) {
            u.harvestTimer = 0;
            const take = Math.min(u.def.carryCap || 300, dock.amount);
            dock.amount -= take;
            u.supplyCarried = take;
            u.state = 'RETURN_SUPPLY';
          }
        }
        return;
      }

      // 3. RETURN SUPPLY TO DEPOT
      if (u.state === 'RETURN_SUPPLY') {
        const depot = this.findNearestSupplyDepot(u.team, u.x, u.y);
        if (!depot) {
          u.state = 'IDLE';
          return;
        }
        const d = dist(u.x, u.y, depot.x, depot.y);
        if (d > depot.radius + u.radius + 14) {
          this.moveUnitToward(u, depot.x, depot.y, dt);
        } else {
          const delivered = u.supplyCarried || (u.def.carryCap || 300);
          this.teams[u.team].credits += delivered;
          u.supplyCarried = 0;
          this.spawnFloatingText(depot.x, depot.y - 24, `+$${delivered}`, '#22c55e');
          if (u.team === 0 && window.ZH_AUDIO) ZH_AUDIO.playSFX('cash');
          this.assignNearestSupplyDock(u);
        }
        return;
      }

      // 4. ENTER GLA TUNNEL NETWORK
      if (u.state === 'ENTER_TUNNEL') {
        const tunnel = this.buildings.find(b => b.id === u.targetEntityId && b.constructed && b.hp > 0);
        if (!tunnel) {
          u.state = 'IDLE';
          return;
        }
        const d = dist(u.x, u.y, tunnel.x, tunnel.y);
        if (d > tunnel.radius + u.radius + 26) {
          this.moveUnitToward(u, tunnel.x, tunnel.y, dt);
        } else {
          const team = this.teams[u.team];
          if (team.tunnelUnits.length < 10) {
            this.selectedIds.delete(u.id);
            const idx = this.units.indexOf(u);
            if (idx >= 0) this.units.splice(idx, 1);
            team.tunnelUnits.push(u);
            if (u.team === 0) {
              this.triggerAlert(`${u.def.shortName} entered Tunnel Network (${team.tunnelUnits.length}/10)`, '#eab308');
            }
            if (this.onStateChange) this.onStateChange();
          } else {
            u.state = 'IDLE';
          }
        }
        return;
      }

      // 5. ENTER CIVILIAN GARRISON BUNKER
      if (u.state === 'ENTER_GARRISON') {
        const bunker = this.garrisonBunkers.find(g => g.id === u.targetEntityId);
        if (!bunker || bunker.hp <= 200 || (bunker.team !== -1 && bunker.team !== u.team) || bunker.occupants.length >= bunker.maxOccupants) {
          u.state = 'IDLE';
          return;
        }
        const d = dist(u.x, u.y, bunker.x, bunker.y);
        if (d > bunker.radius + u.radius + 28) {
          this.moveUnitToward(u, bunker.x, bunker.y, dt);
        } else {
          this.enterGarrison(u, bunker);
        }
        return;
      }

      // 6. RE-CREW UNMANNED VEHICLE (After Jarmen Kell Pilot Snipe!)
      if (u.state === 'RECREW_VEHICLE') {
        const veh = this.units.find(v => v.id === u.targetEntityId && v.unmanned && v.hp > 0);
        if (!veh) {
          u.state = 'IDLE';
          return;
        }
        const d = dist(u.x, u.y, veh.x, veh.y);
        if (d > veh.radius + u.radius + 18) {
          this.moveUnitToward(u, veh.x, veh.y, dt);
        } else {
          veh.team = u.team;
          veh.unmanned = false;
          veh.state = 'IDLE';
          this.spawnBurst(veh.x, veh.y, '#22c55e', 14);
          this.spawnFloatingText(veh.x, veh.y - 22, '🔧 VEHICLE RE-CREWED!', '#22c55e');
          this.selectedIds.delete(u.id);
          u.hp = 0;
          const idx = this.units.indexOf(u);
          if (idx >= 0) this.units.splice(idx, 1);
          if (this.onStateChange) this.onStateChange();
        }
        return;
      }

      // 7. HIJACK ENEMY VEHICLE (GLA Hijacker)
      if (u.state === 'HIJACK_VEHICLE') {
        const veh = this.units.find(v => v.id === u.targetEntityId && v.hp > 0 && v.team !== u.team);
        if (!veh) {
          u.state = 'IDLE';
          return;
        }
        const d = dist(u.x, u.y, veh.x, veh.y);
        if (d > veh.radius + u.radius + 22) {
          this.moveUnitToward(u, veh.x, veh.y, dt);
        } else {
          this.executeHijackVehicle(u, veh);
        }
        return;
      }

      // 8. CAPTURE TECH STRUCTURE OR ENEMY BUILDING (Ranger / Red Guard / Rebel / Black Lotus)
      if (u.state === 'CAPTURE') {
        const techTarget = this.techStructures.find(o => o.id === u.targetEntityId) ||
                           this.buildings.find(b => b.id === u.targetEntityId && b.team !== u.team && b.hp > 0);
        if (!techTarget || techTarget.team === u.team) {
          u.state = 'IDLE';
          return;
        }
        const captureRange = (techTarget.radius || 36) + u.radius + (u.def.isRemoteHacker ? 115 : 28);
        const d = dist(u.x, u.y, techTarget.x, techTarget.y);
        if (d > captureRange) {
          this.moveUnitToward(u, techTarget.x, techTarget.y, dt);
        } else {
          const capSpeed = u.def.isRemoteHacker ? 0.55 : 0.28;
          techTarget.capturingTeam = u.team;
          techTarget.captureProgress = (techTarget.captureProgress || 0) + dt * capSpeed;
          if (techTarget.captureProgress >= 1.0) {
            techTarget.team = u.team;
            techTarget.captureProgress = 0;
            const bonus = (techTarget.def && techTarget.def.captureBonus) || 250;
            if (bonus > 0) {
              this.teams[u.team].credits += bonus;
            }
            const label = techTarget.name || (techTarget.def && techTarget.def.name) || 'TECH STRUCTURE';
            this.spawnFloatingText(techTarget.x, techTarget.y - 22, `${label.toUpperCase()} CAPTURED!${bonus ? ' +$' + bonus : ''}`, '#fde047');
            if (u.team === 0) {
              this.triggerAlert(`${label} captured!`, '#22c55e');
              if (window.ZH_AUDIO) ZH_AUDIO.speak('Building captured.');
            }
            if (techTarget.isBuilding) {
              this.recalculatePower(0);
              this.recalculatePower(1);
            }
            u.state = 'IDLE';
          }
        }
        return;
      }

      // 9. SPECIFIC TARGET ATTACK
      if (u.state === 'ATTACK' && u.def.weapon) {
        const target = this.findEntityById(u.targetEntityId);
        if (!target || target.hp <= 0 || (target.isGarrisonBunker && target.occupants.length === 0)) {
          u.state = 'IDLE';
          u.targetEntityId = null;
          return;
        }
        const wRange = this.getEffectiveWeaponRange(u);
        const d = dist(u.x, u.y, target.x, target.y) - (target.radius || 0);
        if (d > wRange) {
          this.moveUnitToward(u, target.x, target.y, dt);
        } else {
          u.turretAngle = angleBetween(u.x, u.y, target.x, target.y);
          if (u.attackCooldown <= 0) {
            this.fireWeapon(u, target, u.def.weapon);
            u.attackCooldown = u.def.weapon.cooldown;
          }
        }
        return;
      }

      // 9b. PHASE 3 FORCE_FIRE (Ctrl+RightClick Ground or Entity Suppression)
      if (u.state === 'FORCE_FIRE' && u.def.weapon) {
        const target = u.targetEntityId ? this.findEntityById(u.targetEntityId) : null;
        if (u.targetEntityId && (!target || target.hp <= 0)) {
          u.state = 'IDLE';
          u.targetEntityId = null;
          return;
        }
        const tx = target ? target.x : u.targetX;
        const ty = target ? target.y : u.targetY;
        const wRange = this.getEffectiveWeaponRange(u);
        const d = dist(u.x, u.y, tx, ty) - (target ? (target.radius || 0) : 0);
        if (d > wRange) {
          this.moveUnitToward(u, tx, ty, dt);
        } else {
          u.turretAngle = angleBetween(u.x, u.y, tx, ty);
          if (u.attackCooldown <= 0) {
            const fireTarget = target || { id: 0, x: tx, y: ty, hp: 100, radius: 0 };
            this.fireWeapon(u, fireTarget, u.def.weapon);
            u.attackCooldown = u.def.weapon.cooldown;
          }
        }
        return;
      }

      // 9c. PHASE 3 GUARD STANCE (220px Area Leash around guardX, guardY)
      if (u.state === 'GUARD') {
        const gx = u.guardX !== undefined ? u.guardX : u.x;
        const gy = u.guardY !== undefined ? u.guardY : u.y;
        if (u.def.weapon) {
          const wRange = this.getEffectiveWeaponRange(u);
          const scanRange = Math.max(220, wRange + 50);
          const enemy = this.findBestTarget(u, scanRange, u.def.weapon.antiAir);
          if (enemy && dist(gx, gy, enemy.x, enemy.y) <= 260) {
            u.targetEntityId = enemy.id;
            const d = dist(u.x, u.y, enemy.x, enemy.y) - (enemy.radius || 0);
            if (d <= wRange) {
              u.turretAngle = angleBetween(u.x, u.y, enemy.x, enemy.y);
              if (u.attackCooldown <= 0) {
                this.fireWeapon(u, enemy, u.def.weapon);
                u.attackCooldown = u.def.weapon.cooldown;
              }
            } else {
              this.moveUnitToward(u, enemy.x, enemy.y, dt);
            }
            return;
          }
        }
        if (dist(u.x, u.y, gx, gy) > 18) {
          this.moveUnitToward(u, gx, gy, dt);
        } else {
          u.currentSpeed = 0;
        }
        return;
      }

      // 10. MOVE / ATTACK_MOVE / IDLE
      if (u.def.weapon && (u.state === 'IDLE' || u.state === 'ATTACK_MOVE')) {
        const wRange = this.getEffectiveWeaponRange(u);
        const scanRange = Math.max(wRange + 35, u.def.sight * 0.85);
        const enemy = this.findBestTarget(u, scanRange, u.def.weapon.antiAir);
        if (enemy) {
          const d = dist(u.x, u.y, enemy.x, enemy.y) - (enemy.radius || 0);
          if (d <= wRange) {
            u.turretAngle = angleBetween(u.x, u.y, enemy.x, enemy.y);
            if (u.attackCooldown <= 0) {
              this.fireWeapon(u, enemy, u.def.weapon);
              u.attackCooldown = u.def.weapon.cooldown;
            }
            return;
          } else if (u.state === 'ATTACK_MOVE') {
            this.moveUnitToward(u, enemy.x, enemy.y, dt);
            return;
          }
        }
      }

      if (u.state === 'MOVE' || u.state === 'ATTACK_MOVE') {
        const d = dist(u.x, u.y, u.targetX, u.targetY);
        if (d <= 14) {
          if (u.waypoints && u.waypoints.length > 0) {
            const nextWp = u.waypoints.shift();
            u.targetX = nextWp.x;
            u.targetY = nextWp.y;
          } else {
            u.state = 'IDLE';
            u.currentSpeed = 0;
          }
        } else {
          this.moveUnitToward(u, u.targetX, u.targetY, dt);
        }
      }
    }

    moveUnitToward(u, tx, ty, dt) {
      if (window.ZH_SPATIAL && ZH_SPATIAL.LocomotorSystem) {
        ZH_SPATIAL.LocomotorSystem.stepUnitMovement(u, tx, ty, dt, this.spatialGrid, this.navGrid);
        u.x = clamp(u.x, 25, WORLD_SIZE - 25);
        u.y = clamp(u.y, 25, WORLD_SIZE - 25);
        return;
      }
      const ang = angleBetween(u.x, u.y, tx, ty);
      u.angle = ang;
      u.turretAngle = ang;
      const step = u.speed * dt;
      u.x = clamp(u.x + Math.cos(ang) * step, 25, WORLD_SIZE - 25);
      u.y = clamp(u.y + Math.sin(ang) * step, 25, WORLD_SIZE - 25);
    }

    getEffectiveWeaponRange(u) {
      if (!u.def.weapon) return 0;
      let r = u.def.weapon.range;
      const team = this.teams[u.team];
      if (!team) return r;
      const mod = team.general.modifiers || {};
      if (u.defId === 'USA_HUMVEE' && team.upgrades.has('UPG_TOW_MISSILE')) r += 35;
      if (u.def.weapon.damageType === 'SNIPER' && mod.sniperBonusMult) r *= mod.sniperBonusMult;
      if (team.hasTechCenter && team.factionId === 'USA') r *= 1.1;
      return r;
    }

    findEntityById(id) {
      if (!id) return null;
      return (
        this.units.find(u => u.id === id) ||
        this.buildings.find(b => b.id === id) ||
        this.garrisonBunkers.find(g => g.id === id) ||
        this.techStructures.find(t => t.id === id) ||
        null
      );
    }

    findBestTarget(attacker, maxRange, canHitAir) {
      let best = null;
      let bestScore = Infinity;

      const candidates = this.spatialGrid
        ? this.spatialGrid.queryRadius(attacker.x, attacker.y, maxRange + 80)
        : [...this.units, ...this.buildings];

      for (const ent of candidates) {
        if (ent.isUnit) {
          if (ent.team === attacker.team || ent.team < 0 || ent.unmanned || ent.garrisonedIn || ent.garrisonId || ent.hp <= 0) continue;
          if (ent.stealthed && dist(attacker.x, attacker.y, ent.x, ent.y) > 95) continue;
          if (ent.def.isAir && !canHitAir) continue;
          const d = dist(attacker.x, attacker.y, ent.x, ent.y) - ent.radius;
          if (d <= maxRange && d < bestScore) {
            bestScore = d;
            best = ent;
          }
        } else if (ent.isBuilding) {
          if (ent.team === attacker.team || ent.hp <= 0) continue;
          const d = dist(attacker.x, attacker.y, ent.x, ent.y) - ent.radius;
          if (d <= maxRange && d + 25 < bestScore) {
            bestScore = d + 25;
            best = ent;
          }
        }
      }

      // Check hostile occupied Civilian Garrison Bunkers
      for (const g of this.garrisonBunkers) {
        if (g.occupants.length > 0 && g.team !== -1 && g.team !== attacker.team) {
          const d = dist(attacker.x, attacker.y, g.x, g.y) - g.radius;
          if (d <= maxRange && d + 15 < bestScore) {
            bestScore = d + 15;
            best = g;
          }
        }
      }

      return best;
    }

    // ========================================================================
    // Weapons, Projectiles (3D Parabolic Arcs) & Damage Application
    // ========================================================================
    fireWeapon(attacker, target, wDef) {
      if (!wDef || typeof wDef !== 'object') {
        wDef = attacker.def ? attacker.def.weapon : null;
      }
      if (!wDef) return;
      const team = this.teams[attacker.team];
      const mod = team ? (team.general.modifiers || {}) : {};

      // Phase 3 Articulated Barrel Recoil Kickback (SYS-21)
      if (attacker.isUnit) {
        attacker.recoilOffset = 6.5;
        attacker.recoilBarrelToggle = ((attacker.recoilBarrelToggle || 0) + 1) % 2;
      }

      // Uncloak stealth units briefly when firing
      if (attacker.isUnit && attacker.stealthed && attacker.gpsScrambleTimer <= 0) {
        attacker.stealthed = false;
      }

      // Suicide Demolition Detonation (GLA Terrorist, Combat Cycle, Bomb Truck)
      if (attacker.isUnit && attacker.def.isSuicideUnit) {
        const dmg = Math.round(wDef.damage * (mod.explosiveDamageMult || 1.0));
        this.dealAreaDamage(attacker.x, attacker.y, wDef.splash || 65, dmg, wDef.damageType, attacker.team, attacker);
        this.spawnBurst(attacker.x, attacker.y, '#f97316', 28);
        if (window.ZH_AUDIO) ZH_AUDIO.playSFX('explosion', attacker.x, attacker.y, this.cam);
        attacker.hp = 0;
        return;
      }

      // Calculate modified damage
      let dmg = wDef.damage;
      if (attacker.isUnit) {
        const vetDef = ZH_DATA.VETERANCY_LEVELS[attacker.vetLevel] || ZH_DATA.VETERANCY_LEVELS[0];
        dmg *= vetDef.dmgMult;
        if (attacker.salvageTier > 0) dmg *= (1 + attacker.salvageTier * 0.25);
        if (attacker.laserLockTimer > 0) dmg *= 1.25;

        if (team) {
          if (attacker.defId === 'USA_RANGER' && team.upgrades.has('UPG_FLASHBANGS')) dmg *= 1.4;
          if (attacker.defId === 'USA_HUMVEE' && team.upgrades.has('UPG_TOW_MISSILE')) dmg *= 1.45;
          if (attacker.defId === 'USA_COMANCHE' && team.upgrades.has('UPG_ROCKET_PODS')) dmg *= 1.35;
          if (attacker.defId === 'CHINA_DRAGON_TANK' && team.upgrades.has('UPG_BLACK_NAPALM')) dmg *= 1.35;
          if ((attacker.defId === 'CHINA_GATTLING_TANK' || attacker.defId === 'CHINA_MINIGUNNER') && team.upgrades.has('UPG_CHAIN_GUNS')) dmg *= 1.25;
          if ((attacker.defId === 'CHINA_BATTLEMASTER' || attacker.defId === 'CHINA_OVERLORD' || attacker.defId === 'CHINA_EMPEROR_OVERLORD') && team.upgrades.has('UPG_URANIUM_SHELLS')) dmg *= 1.25;
          if ((attacker.defId === 'GLA_SCORPION' || attacker.defId === 'GLA_MARAUDER') && team.upgrades.has('UPG_SCORPION_ROCKET')) dmg *= 1.35;
          if ((attacker.defId === 'GLA_RPG_TROOPER' || attacker.defId === 'GLA_SCORPION' || attacker.defId === 'GLA_ROCKET_BUGGY') && team.upgrades.has('UPG_AP_ROCKETS')) dmg *= 1.25;
          if (attacker.defId === 'GLA_ANGRY_MOB' && team.upgrades.has('UPG_ARM_THE_MOB')) dmg *= 1.5;
        }

        if (attacker.def.category === 'TANK' && mod.tankDamageMult) dmg *= mod.tankDamageMult;
        if ((attacker.defId === 'USA_AURORA' || attacker.defId === 'USA_AURORA_ALPHA') && mod.auroraDamageMult) dmg *= mod.auroraDamageMult;
        if (attacker.hasGatlingCannon) dmg *= 1.2;
      } else if (attacker.isBuilding && team) {
        if (attacker.defId === 'CHINA_GATTLING_CANNON' && team.upgrades.has('UPG_CHAIN_GUNS')) dmg *= 1.25;
        if (attacker.defId === 'GLA_STINGER_SITE' && team.upgrades.has('UPG_AP_ROCKETS')) dmg *= 1.25;
        if (mod.defenseDamageMult) dmg *= mod.defenseDamageMult;
      }

      if (wDef.projType === 'LASER' && mod.laserDamageMult) dmg *= mod.laserDamageMult;
      if (wDef.damageType === 'FLAME_TOXIN' || wDef.damageType === 'FLAME' || wDef.damageType === 'TOXIN') {
        if (mod.toxinDamageMult) dmg *= mod.toxinDamageMult;
        if (team && team.upgrades.has('UPG_ANTHRAX_BETA')) dmg *= 1.3;
      }
      if ((wDef.damageType === 'HIGH_EXPLOSIVE' || wDef.damageType === 'EXPLOSIVE' || wDef.damageType === 'ARTILLERY') && mod.explosiveDamageMult) {
        dmg *= mod.explosiveDamageMult;
      }

      // Instant Laser / Sniper Hit
      if (wDef.projType === 'LASER' || wDef.projType === 'SNIPER') {
        const beamColor = wDef.projType === 'LASER' ? '#ef4444' : '#fef08a';
        this.particles.push({
          type: 'LASER_LINE',
          x1: attacker.x,
          y1: attacker.y,
          x2: target.x,
          y2: target.y,
          color: beamColor,
          timer: 0.16,
          maxTimer: 0.16
        });
        this.applyDamageToTarget(target, dmg, wDef.damageType, attacker.team, attacker);
        if (window.ZH_AUDIO) ZH_AUDIO.playSFX(wDef.projType === 'LASER' ? 'laser' : 'sniper', attacker.x, attacker.y, this.cam);
        return;
      }

      // Spawn Ballistic / Missile / Flame Projectile with 3D Parabolic Arc metadata
      const proj = {
        id: nextEntityId++,
        team: attacker.team,
        attackerId: attacker.id,
        attackerDefId: attacker.defId,
        weaponDef: wDef,
        startX: attacker.x,
        startY: attacker.y,
        x: attacker.x,
        y: attacker.y,
        z: 0,
        targetId: target.id,
        tx: target.x,
        ty: target.y,
        speed: wDef.projectileSpeed || 520,
        damage: dmg,
        damageType: wDef.damageType,
        projType: wDef.projType || 'BULLET',
        splash: wDef.splash || 0,
        isEMP: Boolean(wDef.isEMP || attacker.defId === 'USA_EMP_PATRIOT'),
        leavesHazard: wDef.leavesHazard || null
      };

      if (window.ZH_SPATIAL && ZH_SPATIAL.BallisticsEngine) {
        ZH_SPATIAL.BallisticsEngine.computeProjectileArc(proj);
      }

      this.projectiles.push(proj);

      if (window.ZH_AUDIO) {
        if (wDef.projType === 'MISSILE' || wDef.projType === 'SCUD_MISSILE') {
          ZH_AUDIO.playSFX('missile', attacker.x, attacker.y, this.cam);
        } else if (wDef.projType === 'SHELL' || wDef.projType === 'NUKE_SHELL') {
          ZH_AUDIO.playSFX('cannon', attacker.x, attacker.y, this.cam);
        } else {
          ZH_AUDIO.playSFX('bullet', attacker.x, attacker.y, this.cam);
        }
      }
    }

    updateProjectiles(dt) {
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const p = this.projectiles[i];
        const liveTarget = this.findEntityById(p.targetId);
        if (liveTarget && liveTarget.hp > 0) {
          p.tx = liveTarget.x;
          p.ty = liveTarget.y;
        }

        const d = dist(p.x, p.y, p.tx, p.ty);
        const step = p.speed * dt;
        if (d <= step + 8) {
          const attacker = this.findEntityById(p.attackerId);
          if (p.splash > 0) {
            this.dealAreaDamage(p.tx, p.ty, p.splash, p.damage, p.damageType, p.team, attacker);
          } else if (liveTarget && liveTarget.hp > 0) {
            this.applyDamageToTarget(liveTarget, p.damage, p.damageType, p.team, attacker);
          }

          // Phase 2 Ballistics Special Hit Effects (EMP & Garrison Clearing)
          if (window.ZH_SPATIAL && ZH_SPATIAL.BallisticsEngine) {
            ZH_SPATIAL.BallisticsEngine.applySpecialHitEffects(this, p, liveTarget, p.tx, p.ty);
          }

          if (p.leavesHazard) {
            this.hazards.push({
              id: nextEntityId++,
              type: p.leavesHazard,
              team: p.team,
              x: p.tx,
              y: p.ty,
              radius: 58,
              timer: 10,
              dps: 26
            });
          }

          const burstCol = p.projType === 'TOXIN' ? '#22c55e'
            : p.projType === 'FLAME' ? '#f97316'
            : p.projType === 'NUKE_SHELL' ? '#fb923c'
            : '#fde047';
          this.spawnBurst(p.tx, p.ty, burstCol, p.splash > 30 ? 14 : 5);
          this.projectiles.splice(i, 1);
        } else {
          const ang = angleBetween(p.x, p.y, p.tx, p.ty);
          p.x += Math.cos(ang) * step;
          p.y += Math.sin(ang) * step;
          if (window.ZH_SPATIAL && ZH_SPATIAL.BallisticsEngine) {
            ZH_SPATIAL.BallisticsEngine.computeProjectileArc(p);
          }
        }
      }
    }

    applySplashDamage(x, y, radius, baseDamage, damageType, sourceTeam, attacker = null) {
      return this.dealAreaDamage(x, y, radius, baseDamage, damageType, sourceTeam, attacker);
    }

    dealAreaDamage(x, y, radius, baseDamage, damageType, sourceTeam, attacker = null) {
      // Phase 3 Persistent Battlefield Crater Decal (SYS-22)
      if (window.ZH_VFX && ZH_VFX.addDecal && radius >= 45) {
        const decalType = damageType === 'SUPERWEAPON' ? 'NUKE_CRATER' : 'CRATER';
        ZH_VFX.addDecal(this, decalType, x, y, Math.min(95, radius * 0.45), 0, 120);
      }

      for (const u of this.units) {
        if (u.team === sourceTeam || u.hp <= 0 || u.garrisonedIn || u.garrisonId) continue;
        const d = dist(x, y, u.x, u.y);
        if (d <= radius + u.radius) {
          const falloff = Math.max(0.35, 1 - d / (radius + u.radius + 20));
          this.applyDamageToTarget(u, baseDamage * falloff, damageType, sourceTeam, attacker);
        }
      }
      for (const b of this.buildings) {
        if (b.team === sourceTeam || b.hp <= 0) continue;
        const d = dist(x, y, b.x, b.y);
        if (d <= radius + b.radius) {
          const falloff = Math.max(0.45, 1 - d / (radius + b.radius + 30));
          this.applyDamageToTarget(b, baseDamage * falloff, damageType, sourceTeam, attacker);
        }
      }
      for (const g of this.garrisonBunkers) {
        if (g.team === sourceTeam || g.occupants.length === 0) continue;
        const d = dist(x, y, g.x, g.y);
        if (d <= radius + g.radius) {
          const falloff = Math.max(0.45, 1 - d / (radius + g.radius + 30));
          this.applyDamageToTarget(g, baseDamage * falloff, damageType, sourceTeam, attacker);
        }
      }
    }

    applyDamageToTarget(target, rawDamage, damageType, sourceTeam, attacker = null) {
      if (!target || target.hp <= 0) return;

      // Phase 3 Under-Attack Radar Ping & Spacebar Jump Event (SYS-20)
      if (target.team === 0 && sourceTeam !== 0) {
        this.lastAlertPos = { x: target.x, y: target.y };
        if ((this.underAttackTimer || 0) <= 0) {
          this.underAttackTimer = 8.0;
          this.addRadarPing(target.x, target.y, '#ef4444');
          this.triggerAlert('Our forces are under attack! Press [SPACE] to view.', '#ef4444');
          if (window.ZH_AUDIO) ZH_AUDIO.playSFX('alert', target.x, target.y, this.cam);
        }
      }

      // Civilian Garrison Bunker Damage Handling (40% Armor Reduction + Instant Flame/Toxin/Flashbang Clear)
      if (target.isGarrisonBunker) {
        if (damageType === 'FLAME_TOXIN' || damageType === 'FLAME' || damageType === 'TOXIN' || damageType === 'FLASHBANG') {
          const killed = target.occupants.length;
          while (target.occupants.length > 0) {
            const occ = target.occupants.pop();
            occ.hp = 0;
            occ.garrisonedIn = null;
          }
          target.team = -1;
          if (killed > 0 && sourceTeam !== undefined && sourceTeam >= 0) {
            this.grantTeamXP(sourceTeam, killed * 40);
          }
          return;
        }
        const reduced = Math.max(1, rawDamage * (1 - (target.armorBonus || 0.40)));
        target.hp -= reduced;
        if (target.hp <= 200) {
          target.hp = 200;
          this.evacuateGarrison(target.id);
        }
        return;
      }

      const armorClass = target.isBuilding ? 'BUILDING' : (target.def.category || 'INFANTRY');
      const row = ZH_DATA.DAMAGE_MATRIX[damageType] || ZH_DATA.DAMAGE_MATRIX.SMALL_ARMS;
      const scalar = row[armorClass] !== undefined ? row[armorClass] : 1.0;

      const finalDmg = Math.max(1, rawDamage * scalar);
      target.hp -= finalDmg;

      // Grant XP on kill
      if (target.hp <= 0) {
        const xpGain = target.isBuilding
          ? Math.round((target.def.cost || 800) * 0.14)
          : Math.round((target.def.cost || 300) * 0.22);

        this.grantTeamXP(sourceTeam, xpGain);

        if (attacker && attacker.isUnit && attacker.hp > 0) {
          attacker.xp = (attacker.xp || 0) + xpGain;
          while (
            attacker.vetLevel < 3 &&
            attacker.xp >= ZH_DATA.VETERANCY_LEVELS[attacker.vetLevel + 1].xpReq
          ) {
            attacker.vetLevel++;
            const newVet = ZH_DATA.VETERANCY_LEVELS[attacker.vetLevel];
            attacker.maxHp = Math.round(attacker.def.hp * newVet.hpMult);
            attacker.hp = attacker.maxHp;
            this.spawnFloatingText(attacker.x, attacker.y - 18, `★ ${newVet.name.toUpperCase()}!`, '#fde047');
            if (attacker.team === 0 && window.ZH_AUDIO) ZH_AUDIO.playSFX('promote');
          }
        }
      }
    }

    grantTeamXP(teamId, amount) {
      const team = this.teams[teamId];
      if (!team) return;
      team.xp += amount;

      while (team.rank < 5 && team.xp >= ZH_DATA.GENERAL_RANKS[team.rank].xpReq) {
        const nextRank = ZH_DATA.GENERAL_RANKS[team.rank];
        team.rank = nextRank.rank;
        team.generalPoints += nextRank.pointsGranted;
        if (teamId === 0) {
          if (window.ZH_AUDIO) ZH_AUDIO.playSFX('promote');
          this.triggerAlert(`PROMOTED TO ${nextRank.title.toUpperCase()}! (+${nextRank.pointsGranted} Generals Point)`, '#fde047');
          if (window.ZH_AUDIO) ZH_AUDIO.speak('General, you have been promoted!', { priority: true });
        }
        if (this.onStateChange) this.onStateChange();
      }
    }

    applyEMP(x, y, radius, duration, sourceTeam) {
      for (const u of this.units) {
        if (u.team !== sourceTeam && u.def.category !== 'INFANTRY' && dist(x, y, u.x, u.y) <= radius) {
          u.disabledTimer = Math.max(u.disabledTimer, duration);
          u.empTimer = Math.max(u.empTimer || 0, duration);
        }
      }
      for (const b of this.buildings) {
        if (b.team !== sourceTeam && dist(x, y, b.x, b.y) <= radius) {
          b.disabledTimer = Math.max(b.disabledTimer, duration);
          b.empTimer = Math.max(b.empTimer || 0, duration);
        }
      }
    }

    destroyUnit(u, index) {
      this.selectedIds.delete(u.id);
      this.spawnBurst(u.x, u.y, '#f97316', u.def.category === 'TANK' ? 18 : 8);
      if (window.ZH_AUDIO) ZH_AUDIO.playSFX('explosion');

      const team = this.teams[u.team];
      if (team && team.generalId === 'GLA_JUHZIZ') {
        this.dealAreaDamage(u.x, u.y, 45, 55, 'HIGH_EXPLOSIVE', u.team);
      }

      if (u.def.category === 'TANK' || u.def.category === 'LIGHT_VEHICLE') {
        this.salvageCrates.push({
          id: nextEntityId++,
          x: u.x,
          y: u.y,
          timer: 75
        });
      }

      this.units.splice(index, 1);
      if (this.onStateChange) this.onStateChange();
    }

    destroyBuilding(b, index) {
      this.selectedIds.delete(b.id);
      this.spawnBurst(b.x, b.y, '#f97316', 32);
      if (window.ZH_AUDIO) ZH_AUDIO.playSFX('explosion');
      this.cam.shake = Math.max(this.cam.shake, 12);

      const teamId = b.team;
      this.buildings.splice(index, 1);
      if (this.navGrid) this.navGrid.rebuild(this);
      this.recalculatePower(teamId);
      if (this.onStateChange) this.onStateChange();
    }

    updateSpecialEffects(dt) {
      // Orbital Particle Cannon Beams
      for (let i = this.activeBeams.length - 1; i >= 0; i--) {
        const beam = this.activeBeams[i];
        beam.timer -= dt;
        const ang = angleBetween(beam.x, beam.y, beam.destX, beam.destY);
        beam.x += Math.cos(ang) * 45 * dt;
        beam.y += Math.sin(ang) * 45 * dt;
        this.dealAreaDamage(beam.x, beam.y, beam.radius, beam.dps * dt, 'SUPERWEAPON', beam.team);
        if (Math.random() < 0.45) {
          this.spawnBurst(beam.x, beam.y, '#38bdf8', 3);
        }
        if (beam.timer <= 0) {
          this.activeBeams.splice(i, 1);
        }
      }

      // USA AC-130 Spectre Gunship Orbiting Strikes
      for (let i = this.spectreGunships.length - 1; i >= 0; i--) {
        const sg = this.spectreGunships[i];
        sg.timer -= dt;
        sg.angle += dt * 1.1;
        sg.shotTimer -= dt;
        if (sg.shotTimer <= 0) {
          sg.shotTimer = 0.65;
          const ox = sg.cx + (Math.random() - 0.5) * 140;
          const oy = sg.cy + (Math.random() - 0.5) * 140;
          this.dealAreaDamage(ox, oy, 75, 95, 'HIGH_EXPLOSIVE', sg.team);
          this.spawnBurst(ox, oy, '#fde047', 12);
          if (window.ZH_AUDIO) ZH_AUDIO.playSFX('cannon');
        }
        if (sg.timer <= 0) {
          this.spectreGunships.splice(i, 1);
        }
      }

      // Radiation, Flame & Anthrax Toxin Hazards
      for (let i = this.hazards.length - 1; i >= 0; i--) {
        const h = this.hazards[i];
        h.timer -= dt;
        this.dealAreaDamage(h.x, h.y, h.radius, h.dps * dt, 'FLAME_TOXIN', h.team);
        if (h.timer <= 0) {
          this.hazards.splice(i, 1);
        }
      }

      // Spy Drones
      for (let i = this.spyDrones.length - 1; i >= 0; i--) {
        this.spyDrones[i].timer -= dt;
        if (this.spyDrones[i].timer <= 0) {
          this.spyDrones.splice(i, 1);
        }
      }

      // Salvage Crates
      for (let i = this.salvageCrates.length - 1; i >= 0; i--) {
        this.salvageCrates[i].timer -= dt;
        if (this.salvageCrates[i].timer <= 0) {
          this.salvageCrates.splice(i, 1);
        }
      }

      // Particles
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const pt = this.particles[i];
        pt.timer -= dt;
        if (pt.vx !== undefined) {
          pt.x += pt.vx * dt;
          pt.y += pt.vy * dt;
        }
        if (pt.timer <= 0) {
          this.particles.splice(i, 1);
        }
      }

      // Floating Text
      for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
        const ft = this.floatingTexts[i];
        ft.timer -= dt;
        ft.y -= 24 * dt;
        if (ft.timer <= 0) {
          this.floatingTexts.splice(i, 1);
        }
      }

      // Radar Pings
      for (let i = this.radarPings.length - 1; i >= 0; i--) {
        this.radarPings[i].timer -= dt;
        if (this.radarPings[i].timer <= 0) {
          this.radarPings.splice(i, 1);
        }
      }
    }

    updateFogOfWar() {
      for (let i = 0; i < this.fog.length; i++) {
        if (this.fog[i] === 2) this.fog[i] = 1;
      }

      const revealCircle = (wx, wy, radius) => {
        const gx0 = Math.max(0, Math.floor((wx - radius) / FOG_CELL));
        const gx1 = Math.min(FOG_GRID - 1, Math.floor((wx + radius) / FOG_CELL));
        const gy0 = Math.max(0, Math.floor((wy - radius) / FOG_CELL));
        const gy1 = Math.min(FOG_GRID - 1, Math.floor((wy + radius) / FOG_CELL));
        const rSq = radius * radius;
        for (let gy = gy0; gy <= gy1; gy++) {
          for (let gx = gx0; gx <= gx1; gx++) {
            const cx = (gx + 0.5) * FOG_CELL;
            const cy = (gy + 0.5) * FOG_CELL;
            if ((cx - wx) * (cx - wx) + (cy - wy) * (cy - wy) <= rSq) {
              this.fog[gy * FOG_GRID + gx] = 2;
            }
          }
        }
      };

      for (const b of this.buildings) {
        if (b.team === 0 && b.hp > 0) {
          revealCircle(b.x, b.y, b.def.sight || 260);
        }
        if (b.def.isSuperweapon && b.constructed) {
          revealCircle(b.x, b.y, 180);
        }
      }

      for (const g of this.garrisonBunkers) {
        if (g.team === 0 && g.occupants.length > 0) {
          revealCircle(g.x, g.y, 280);
        }
      }

      for (const t of this.techStructures) {
        if (t.team === 0) {
          revealCircle(t.x, t.y, 200);
        }
      }

      for (const u of this.units) {
        if (u.team === 0 && u.hp > 0) {
          revealCircle(u.x, u.y, u.def.sight || 220);
        }
      }

      for (const sd of this.spyDrones) {
        if (sd.team === 0) {
          revealCircle(sd.x, sd.y, sd.radius);
        }
      }

      for (const sg of this.spectreGunships) {
        if (sg.team === 0) {
          revealCircle(sg.cx, sg.cy, 260);
        }
      }
    }

    isPositionVisible(wx, wy) {
      const gx = clamp(Math.floor(wx / FOG_CELL), 0, FOG_GRID - 1);
      const gy = clamp(Math.floor(wy / FOG_CELL), 0, FOG_GRID - 1);
      return this.fog[gy * FOG_GRID + gx] === 2;
    }

    isPositionExplored(wx, wy) {
      const gx = clamp(Math.floor(wx / FOG_CELL), 0, FOG_GRID - 1);
      const gy = clamp(Math.floor(wy / FOG_CELL), 0, FOG_GRID - 1);
      return this.fog[gy * FOG_GRID + gx] >= 1;
    }

    checkVictoryConditions() {
      if (this.gameTime < 5) return;
      const p0Alive = this.buildings.some(b => b.team === 0 && b.hp > 0) ||
                      this.units.some(u => u.team === 0 && u.def.isBuilder && u.hp > 0);
      const p1Alive = this.buildings.some(b => b.team === 1 && b.hp > 0) ||
                      this.units.some(u => u.team === 1 && u.def.isBuilder && u.hp > 0);

      if (!p1Alive) {
        this.gameOver = true;
        this.winner = 0;
        if (window.ZH_AUDIO) {
          ZH_AUDIO.playSFX('promote');
          ZH_AUDIO.speak('You are victorious, General!', { priority: true });
        }
        if (this.onGameOver) this.onGameOver(0);
      } else if (!p0Alive) {
        this.gameOver = true;
        this.winner = 1;
        if (window.ZH_AUDIO) ZH_AUDIO.speak('You have been defeated.', { priority: true });
        if (this.onGameOver) this.onGameOver(1);
      }
    }

    // ========================================================================
    // Visual FX Spawners
    // ========================================================================
    spawnBurst(x, y, color, count = 12) {
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 25 + Math.random() * 115;
        this.particles.push({
          type: 'SPARK',
          x,
          y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          r: 2.5 + Math.random() * 4.5,
          color,
          timer: 0.28 + Math.random() * 0.32,
          maxTimer: 0.6
        });
      }
    }

    spawnFloatingText(x, y, text, color = '#ffffff') {
      this.floatingTexts.push({
        x,
        y,
        text,
        color,
        timer: 1.5
      });
    }

    addRadarPing(x, y, color = '#ef4444') {
      this.radarPings.push({ x, y, color, timer: 4.0 });
    }

    triggerAlert(msg, color = '#38bdf8') {
      if (this.onAlert) this.onAlert(msg, color);
    }

    triggerTaunt(generalDef, text) {
      if (this.onTaunt) this.onTaunt(generalDef, text);
      if (window.ZH_AUDIO) ZH_AUDIO.speak(text);
    }

    // ========================================================================
    // 2.5D Tactical Canvas Renderer & Radar Minimap
    // ========================================================================
    render() {
      if (!this.ctx || !this.canvas) return;
      const ctx = this.ctx;
      const w = this.canvas.width;
      const h = this.canvas.height;
      this.cam.w = w;
      this.cam.h = h;

      ctx.save();

      // Screen Shake
      const sx = this.cam.shake > 0 ? (Math.random() - 0.5) * this.cam.shake : 0;
      const sy = this.cam.shake > 0 ? (Math.random() - 0.5) * this.cam.shake : 0;
      ctx.translate(-this.cam.x + sx, -this.cam.y + sy);

      // 1. Terrain Background, Tactical Grid & Persistent Battlefield Decals (SYS-22)
      this.renderTerrain(ctx);

      // 2. Environmental Hazards (Anthrax Toxin Pools, Napalm & Radiation)
      this.renderHazards(ctx);

      // 3. Supply Docks, Neutral Tech Structures & Civilian Garrison Bunkers
      this.renderMapResources(ctx);

      // 4. Salvage Crates
      this.renderSalvageCrates(ctx);

      // 5. Buildings (with 4-Stage Scaffolding & Animated Rally Lines)
      this.renderBuildings(ctx);

      // 6. Ground Units (Articulated Multi-Part Rigs)
      this.renderUnits(ctx, false);

      // 7. Aircraft, Spy Drones & Spectre Gunships
      this.renderUnits(ctx, true);
      this.renderSpyDrones(ctx);

      // 8. Projectiles (with 3D Parabolic Arcs), Lasers, Orbital Beams & Superweapon Spectacle
      this.renderProjectilesAndEffects(ctx);
      if (window.ZH_VFX && ZH_VFX.renderSuperweaponSpectacle) {
        ZH_VFX.renderSuperweaponSpectacle(ctx, this);
      }

      // 9. Fog of War Shroud
      this.renderFogOfWar(ctx);

      // 10. Placement Ghost / Power Targeting Reticle
      this.renderCommandOverlay(ctx);

      // 11. Floating Combat & Economy Text
      this.renderFloatingTexts(ctx);

      ctx.restore();

      // Superweapon Thermal Flash Whiteout Overlay
      if (this.screenFlash > 0) {
        ctx.save();
        ctx.fillStyle = `rgba(255, 250, 235, ${Math.min(0.65, this.screenFlash)})`;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }

      // Render Radar Minimap
      this.renderMinimap();
    }

    renderTerrain(ctx) {
      ctx.fillStyle = this.mapDef.bgPrimary;
      ctx.fillRect(this.cam.x, this.cam.y, this.cam.w, this.cam.h);

      // Strategic diagonal highway & central basin
      ctx.strokeStyle = this.mapDef.roadColor;
      ctx.lineWidth = 74;
      ctx.beginPath();
      ctx.moveTo(220, WORLD_SIZE - 220);
      ctx.lineTo(WORLD_SIZE - 220, 220);
      ctx.stroke();

      ctx.fillStyle = this.mapDef.bgSecondary;
      ctx.beginPath();
      ctx.arc(WORLD_SIZE / 2, WORLD_SIZE / 2, 340, 0, Math.PI * 2);
      ctx.fill();

      // Tactical Grid Lines
      ctx.strokeStyle = this.mapDef.gridColor;
      ctx.lineWidth = 1;
      const step = 160;
      const xStart = Math.floor(this.cam.x / step) * step;
      const yStart = Math.floor(this.cam.y / step) * step;
      ctx.beginPath();
      for (let x = xStart; x <= this.cam.x + this.cam.w; x += step) {
        ctx.moveTo(x, this.cam.y);
        ctx.lineTo(x, this.cam.y + this.cam.h);
      }
      for (let y = yStart; y <= this.cam.y + this.cam.h; y += step) {
        ctx.moveTo(this.cam.x, y);
        ctx.lineTo(this.cam.x + this.cam.w, y);
      }
      ctx.stroke();

      // Phase 3 Persistent Battlefield Decals (Craters, Scorch Trails, Tank Treads)
      if (window.ZH_VFX && ZH_VFX.renderDecals) {
        ZH_VFX.renderDecals(ctx, this);
      }
    }

    renderHazards(ctx) {
      for (const h of this.hazards) {
        ctx.save();
        const isRad = h.type === 'RADIATION';
        const isFlame = h.type === 'FLAME';
        const grad = ctx.createRadialGradient(h.x, h.y, 8, h.x, h.y, h.radius);
        if (isRad || isFlame) {
          grad.addColorStop(0, 'rgba(249, 115, 22, 0.55)');
          grad.addColorStop(1, 'rgba(239, 68, 68, 0.0)');
        } else {
          const hasBeta = this.teams[h.team] && this.teams[h.team].upgrades.has('UPG_ANTHRAX_BETA');
          grad.addColorStop(0, hasBeta ? 'rgba(168, 85, 247, 0.55)' : 'rgba(34, 197, 94, 0.52)');
          grad.addColorStop(1, 'rgba(34, 197, 94, 0.0)');
        }
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    renderMapResources(ctx) {
      // 1. Supply Docks
      for (const d of this.supplyDocks) {
        ctx.save();
        ctx.fillStyle = '#475569';
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2;
        ctx.fillRect(d.x - 44, d.y - 34, 88, 68);
        ctx.strokeRect(d.x - 44, d.y - 34, 88, 68);

        const ratio = clamp(d.amount / d.maxAmount, 0, 1);
        const crates = Math.ceil(ratio * 12);
        for (let i = 0; i < crates; i++) {
          const cx = d.x - 34 + (i % 4) * 18;
          const cy = d.y - 24 + Math.floor(i / 4) * 16;
          ctx.fillStyle = '#ca8a04';
          ctx.fillRect(cx, cy, 14, 12);
          ctx.strokeStyle = '#fef08a';
          ctx.lineWidth = 1;
          ctx.strokeRect(cx, cy, 14, 12);
        }

        ctx.fillStyle = '#fef08a';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`SUPPLY $${d.amount.toLocaleString()}`, d.x, d.y + 48);
        ctx.restore();
      }

      // 2. Neutral / Captured Tech Structures (Oil Derricks, Hospital, Repair Bay)
      for (const o of this.techStructures) {
        ctx.save();
        const col = o.team === 0 ? this.teams[0].faction.color
          : o.team === 1 ? this.teams[1].faction.color
          : '#cbd5e1';

        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = col;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        const bob = Math.sin(this.gameTime * 4) * 7;
        ctx.strokeStyle = col;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(o.x - 14, o.y - bob);
        ctx.lineTo(o.x + 14, o.y + bob);
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        const label = o.def ? o.def.shortName : 'TECH BUILDING';
        ctx.fillText(o.team < 0 ? `NEUTRAL ${label}` : label, o.x, o.y + o.radius + 14);
        ctx.restore();
      }

      // 3. Civilian Urban Garrison Bunkers
      for (const g of this.garrisonBunkers) {
        ctx.save();
        const col = g.team === 0 ? this.teams[0].faction.color
          : g.team === 1 ? this.teams[1].faction.color
          : '#94a3b8';

        const r = g.radius;
        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = col;
        ctx.lineWidth = 3;
        ctx.fillRect(g.x - r, g.y - r, r * 2, r * 2);
        ctx.strokeRect(g.x - r, g.y - r, r * 2, r * 2);

        // Firing Port Windows
        for (let p = 0; p < 6; p++) {
          const px = g.x - r + 10 + (p % 3) * 24;
          const py = g.y - r + 12 + Math.floor(p / 3) * 38;
          ctx.fillStyle = p < g.occupants.length ? col : '#0f172a';
          ctx.fillRect(px, py, 14, 10);
        }

        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`GARRISON [${g.occupants.length}/${g.maxOccupants}]`, g.x, g.y + 4);
        this.drawHealthBar(ctx, g.x, g.y - r - 8, r * 2, g.hp, g.maxHp);
        ctx.restore();
      }
    }

    renderSalvageCrates(ctx) {
      for (const c of this.salvageCrates) {
        if (!this.isPositionVisible(c.x, c.y)) continue;
        ctx.save();
        ctx.fillStyle = '#a16207';
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 2;
        ctx.fillRect(c.x - 9, c.y - 9, 18, 18);
        ctx.strokeRect(c.x - 9, c.y - 9, 18, 18);
        ctx.fillStyle = '#fef08a';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('⚙', c.x, c.y + 3);
        ctx.restore();
      }
    }

    renderBuildings(ctx) {
      for (const b of this.buildings) {
        if (b.team !== 0 && !b.def.isSuperweapon && !this.isPositionVisible(b.x, b.y)) continue;

        const team = this.teams[b.team];
        const col = team.faction.color;
        const dark = team.faction.darkColor;
        const s = b.def.size;
        const half = s / 2;

        ctx.save();

        // Selection Ring & Animated Factory Rally Line + Flag Marker (SYS-20)
        if (this.selectedIds.has(b.id)) {
          ctx.strokeStyle = '#22c55e';
          ctx.lineWidth = 2.5;
          ctx.strokeRect(b.x - half - 5, b.y - half - 5, s + 10, s + 10);

          if (b.def.trains && b.def.trains.length > 0) {
            ctx.save();
            ctx.setLineDash([8, 6]);
            ctx.lineDashOffset = -(this.gameTime * 28);
            ctx.strokeStyle = '#fde047';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(b.x, b.y);
            ctx.lineTo(b.rallyX, b.rallyY);
            ctx.stroke();
            ctx.setLineDash([]);

            // Rally Flag Beacon
            ctx.fillStyle = '#fde047';
            ctx.beginPath();
            ctx.arc(b.rallyX, b.rallyY, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.font = 'bold 11px monospace';
            ctx.fillText('🚩 RALLY', b.rallyX + 24, b.rallyY + 4);
            ctx.restore();
          }
        }

        // Propaganda Aura Ring
        if (b.constructed && b.def.isPropagandaTower && !team.isLowPower) {
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.32)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.def.auraRadius || 210, 0, Math.PI * 2);
          ctx.stroke();
        }

        // 2.5D Shadow & Base Block
        ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
        ctx.fillRect(b.x - half + 6, b.y - half + 8, s, s);

        ctx.fillStyle = b.constructed ? '#1e293b' : 'rgba(30, 41, 59, 0.55)';
        ctx.strokeStyle = col;
        ctx.lineWidth = 3;
        ctx.fillRect(b.x - half, b.y - half, s, s);
        ctx.strokeRect(b.x - half, b.y - half, s, s);

        // Faction Roof Detail
        ctx.fillStyle = dark;
        ctx.fillRect(b.x - half + 8, b.y - half + 8, s - 16, s - 16);

        // Turret Barrel for Defenses
        if (b.def.isDefense && b.constructed) {
          ctx.save();
          ctx.translate(b.x, b.y);
          ctx.rotate(b.turretAngle);
          ctx.fillStyle = col;
          ctx.fillRect(0, -4, half + 10, 8);
          ctx.restore();
        }

        // Phase 3 4-Stage Construction Scaffolding (SYS-21)
        if (!b.constructed) {
          if (window.ZH_VFX && ZH_VFX.renderConstructionScaffolding) {
            ctx.save();
            ctx.translate(b.x, b.y);
            ZH_VFX.renderConstructionScaffolding(ctx, b, s);
            ctx.restore();
          } else {
            ctx.strokeStyle = '#fde047';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(b.x - half + 3, b.y - half + 3, (s - 6) * b.buildProgress, s - 6);
          }
          ctx.fillStyle = '#fde047';
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(`BUILDING ${Math.round(b.buildProgress * 100)}%`, b.x, b.y + 4);
        } else {
          ctx.fillStyle = '#f8fafc';
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(b.def.shortName, b.x, b.y + 4);
        }

        if (b.disabledTimer > 0 || b.empTimer > 0) {
          ctx.fillStyle = '#38bdf8';
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('⚡ EMP DISABLED', b.x, b.y - 12);
        }

        // Control Group Badge [#N]
        if (b.controlGroup !== null && b.controlGroup !== undefined) {
          ctx.fillStyle = '#38bdf8';
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'left';
          ctx.fillText(`[#${b.controlGroup}]`, b.x - half + 4, b.y - half - 14);
        }

        // HP Bar
        this.drawHealthBar(ctx, b.x, b.y - half - 10, s, b.hp, b.maxHp);

        // Production Queue Progress Bar
        if (b.queue.length > 0) {
          const q = b.queue[0];
          const prog = clamp(1 - q.timer / q.totalTime, 0, 1);
          ctx.fillStyle = 'rgba(0,0,0,0.7)';
          ctx.fillRect(b.x - half, b.y + half + 4, s, 5);
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(b.x - half, b.y + half + 4, s * prog, 5);
        }

        ctx.restore();
      }
    }

    renderUnits(ctx, airPass) {
      for (const u of this.units) {
        if (u.garrisonedIn || u.garrisonId) continue;
        if (Boolean(u.def.isAir) !== airPass) continue;
        if (u.team !== 0 && !u.unmanned && !this.isPositionVisible(u.x, u.y)) continue;

        const team = u.team >= 0 ? this.teams[u.team] : null;
        const col = u.unmanned ? '#94a3b8' : (team ? team.faction.color : '#94a3b8');
        const r = u.radius;

        ctx.save();
        if (u.stealthed) {
          ctx.globalAlpha = u.team === 0 ? 0.55 : 0.28;
        }

        // China Horde Bonus Star Indicator
        if (u.inHorde) {
          ctx.strokeStyle = '#fde047';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(u.x, u.y, r + 6, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Overlord Propaganda Aura
        if (u.def.isPropagandaCarrier || u.hasSpeakerTower) {
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.25)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(u.x, u.y, u.def.auraRadius || 185, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Selection Circle, Guard Leash Ring & Chained Waypoint Path (SYS-19)
        if (this.selectedIds.has(u.id)) {
          ctx.strokeStyle = '#22c55e';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(u.x, u.y, r + 4, 0, Math.PI * 2);
          ctx.stroke();

          if (u.state === 'GUARD') {
            ctx.save();
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
            ctx.beginPath();
            ctx.arc(u.guardX || u.x, u.guardY || u.y, 65, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }

          if (u.waypoints && u.waypoints.length > 0) {
            ctx.save();
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(u.x, u.y);
            ctx.lineTo(u.targetX, u.targetY);
            for (const wp of u.waypoints) {
              ctx.lineTo(wp.x, wp.y);
            }
            ctx.stroke();
            ctx.restore();
          }
        }

        // Air Shadow
        if (airPass) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
          ctx.beginPath();
          ctx.arc(u.x + 12, u.y + 16, r * 0.85, 0, Math.PI * 2);
          ctx.fill();
        }

        // Phase 3 Articulated Multi-Part 2.5D Unit Rig (Chassis + Turret + Recoiling Barrels)
        if (window.ZH_VFX && ZH_VFX.renderArticulatedUnit && team) {
          ctx.save();
          ctx.translate(u.x, u.y);
          ZH_VFX.renderArticulatedUnit(ctx, u, team.faction);
          ctx.restore();
        } else {
          ctx.save();
          ctx.translate(u.x, u.y);
          ctx.rotate(u.angle);
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        ctx.restore();

        // Health Bar, Veterancy Chevrons, Control Group, Salvage & Unmanned Badges
        this.drawHealthBar(ctx, u.x, u.y - r - 9, r * 2.1, u.hp, u.maxHp);

        if (u.controlGroup !== null && u.controlGroup !== undefined) {
          ctx.fillStyle = '#38bdf8';
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'right';
          ctx.fillText(`#${u.controlGroup}`, u.x - r - 3, u.y + 3);
        }

        if (u.unmanned) {
          ctx.fillStyle = '#fde047';
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('[UNMANNED]', u.x, u.y - r - 13);
        } else if (u.disabledTimer > 0 || u.empTimer > 0) {
          ctx.fillStyle = '#38bdf8';
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('⚡ EMP', u.x, u.y - r - 13);
        } else if (u.state === 'GUARD') {
          ctx.fillStyle = '#38bdf8';
          ctx.font = 'bold 8px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('🛡️ GUARD', u.x, u.y - r - 12);
        } else if (u.vetLevel > 0) {
          ctx.fillStyle = '#fde047';
          ctx.font = 'bold 10px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('★'.repeat(u.vetLevel), u.x, u.y - r - 12);
        }
        if (u.salvageTier > 0) {
          ctx.fillStyle = '#38bdf8';
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(`S${u.salvageTier}`, u.x + r + 6, u.y + 3);
        }
      }
    }

    renderSpyDrones(ctx) {
      for (const sd of this.spyDrones) {
        ctx.save();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.arc(sd.x, sd.y, sd.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('🛸 SPY DRONE', sd.x, sd.y);
        ctx.restore();
      }

      for (const sg of this.spectreGunships) {
        ctx.save();
        const gx = sg.cx + Math.cos(sg.angle) * sg.orbitRadius;
        const gy = sg.cy + Math.sin(sg.angle) * sg.orbitRadius;
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.45)';
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.arc(sg.cx, sg.cy, sg.orbitRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#3b82f6';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('✈ AC-130 SPECTRE', gx, gy);
        ctx.restore();
      }
    }

    renderProjectilesAndEffects(ctx) {
      // Projectiles with 3D Parabolic Elevation (p.z) + Ground Shadow
      for (const p of this.projectiles) {
        if (!this.isPositionVisible(p.x, p.y)) continue;
        ctx.save();
        const z = p.z || 0;
        if (z > 4) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = p.projType === 'TOXIN' ? '#22c55e'
          : p.projType === 'FLAME' ? '#f97316'
          : p.projType === 'MISSILE' || p.projType === 'SCUD_MISSILE' ? '#ef4444'
          : '#fde047';
        ctx.beginPath();
        ctx.arc(p.x, p.y - z, p.splash > 25 ? 4.8 : 2.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Orbital Particle Cannon Beam
      for (const beam of this.activeBeams) {
        ctx.save();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
        ctx.lineWidth = 44;
        ctx.beginPath();
        ctx.moveTo(beam.x, beam.y - 900);
        ctx.lineTo(beam.x, beam.y);
        ctx.stroke();

        ctx.strokeStyle = '#e0f2fe';
        ctx.lineWidth = 16;
        ctx.beginPath();
        ctx.moveTo(beam.x, beam.y - 900);
        ctx.lineTo(beam.x, beam.y);
        ctx.stroke();
        ctx.restore();
      }

      // Lasers & Sparks
      for (const pt of this.particles) {
        ctx.save();
        const alpha = clamp(pt.timer / (pt.maxTimer || 0.5), 0, 1);
        ctx.globalAlpha = alpha;
        if (pt.type === 'LASER_LINE') {
          ctx.strokeStyle = pt.color;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(pt.x1, pt.y1);
          ctx.lineTo(pt.x2, pt.y2);
          ctx.stroke();
        } else {
          ctx.fillStyle = pt.color;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    renderFogOfWar(ctx) {
      const gx0 = Math.max(0, Math.floor(this.cam.x / FOG_CELL));
      const gx1 = Math.min(FOG_GRID - 1, Math.ceil((this.cam.x + this.cam.w) / FOG_CELL));
      const gy0 = Math.max(0, Math.floor(this.cam.y / FOG_CELL));
      const gy1 = Math.min(FOG_GRID - 1, Math.ceil((this.cam.y + this.cam.h) / FOG_CELL));

      for (let gy = gy0; gy <= gy1; gy++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          const state = this.fog[gy * FOG_GRID + gx];
          if (state === 2) continue;
          ctx.fillStyle = state === 0 ? 'rgba(6, 10, 19, 0.86)' : 'rgba(6, 10, 19, 0.45)';
          ctx.fillRect(gx * FOG_CELL, gy * FOG_CELL, FOG_CELL + 1, FOG_CELL + 1);
        }
      }
    }

    renderCommandOverlay(ctx) {
      const mx = this.mouseWorld.x;
      const my = this.mouseWorld.y;

      if (this.commandMode === 'BUILD' && this.pendingBuildId) {
        const def = ZH_DATA.BUILDINGS[this.pendingBuildId];
        if (def) {
          const s = def.size;
          ctx.save();
          ctx.strokeStyle = '#22c55e';
          ctx.fillStyle = 'rgba(34, 197, 94, 0.24)';
          ctx.lineWidth = 2;
          ctx.fillRect(mx - s / 2, my - s / 2, s, s);
          ctx.strokeRect(mx - s / 2, my - s / 2, s, s);
          ctx.restore();
        }
      } else if (this.commandMode === 'POWER' || this.commandMode === 'SUPERWEAPON' || this.commandMode === 'ABILITY') {
        ctx.save();
        ctx.strokeStyle = this.commandMode === 'ABILITY' ? '#fde047' : '#ef4444';
        ctx.fillStyle = this.commandMode === 'ABILITY' ? 'rgba(253, 224, 71, 0.16)' : 'rgba(239, 68, 68, 0.18)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(mx, my, this.commandMode === 'ABILITY' ? 95 : 150, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    renderFloatingTexts(ctx) {
      for (const ft of this.floatingTexts) {
        ctx.save();
        ctx.font = 'bold 12px monospace';
        ctx.fillStyle = ft.color;
        ctx.textAlign = 'center';
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
      }
    }

    drawHealthBar(ctx, cx, y, width, hp, maxHp) {
      const ratio = clamp(hp / maxHp, 0, 1);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(cx - width / 2, y, width, 4.5);
      ctx.fillStyle = ratio > 0.5 ? '#22c55e' : ratio > 0.25 ? '#eab308' : '#ef4444';
      ctx.fillRect(cx - width / 2, y, width * ratio, 4.5);
    }

    renderMinimap() {
      if (!this.minimapCtx || !this.minimapCanvas) return;
      const mctx = this.minimapCtx;
      const mw = this.minimapCanvas.width;
      const mh = this.minimapCanvas.height;
      const scale = mw / WORLD_SIZE;

      mctx.fillStyle = '#090e17';
      mctx.fillRect(0, 0, mw, mh);

      const playerTeam = this.teams[0];
      if (playerTeam && !playerTeam.hasRadar) {
        mctx.fillStyle = '#ef4444';
        mctx.font = 'bold 12px monospace';
        mctx.textAlign = 'center';
        mctx.fillText('RADAR OFFLINE', mw / 2, mh / 2 - 6);
        mctx.fillStyle = '#94a3b8';
        mctx.font = '10px monospace';
        mctx.fillText(playerTeam.isLowPower ? '(LOW POWER)' : '(NEEDS CMD CENTER)', mw / 2, mh / 2 + 12);
        return;
      }

      // Supply Docks
      for (const d of this.supplyDocks) {
        if (d.amount <= 0) continue;
        mctx.fillStyle = '#fde047';
        mctx.fillRect(d.x * scale - 3, d.y * scale - 3, 6, 6);
      }

      // Tech Structures & Garrison Bunkers
      for (const t of this.techStructures) {
        mctx.fillStyle = t.team >= 0 ? this.teams[t.team].faction.color : '#cbd5e1';
        mctx.fillRect(t.x * scale - 2.5, t.y * scale - 2.5, 5, 5);
      }
      for (const g of this.garrisonBunkers) {
        mctx.fillStyle = g.team >= 0 ? this.teams[g.team].faction.color : '#94a3b8';
        mctx.fillRect(g.x * scale - 3, g.y * scale - 3, 6, 6);
      }

      // Buildings
      for (const b of this.buildings) {
        if (b.team !== 0 && !b.def.isSuperweapon && !this.isPositionVisible(b.x, b.y)) continue;
        mctx.fillStyle = this.teams[b.team].faction.color;
        mctx.fillRect(b.x * scale - 3.5, b.y * scale - 3.5, 7, 7);
      }

      // Units
      for (const u of this.units) {
        if (u.garrisonedIn || u.garrisonId) continue;
        if (u.team < 0 || (u.team !== 0 && !this.isPositionVisible(u.x, u.y))) continue;
        mctx.fillStyle = this.teams[u.team].faction.accent;
        mctx.fillRect(u.x * scale - 1.5, u.y * scale - 1.5, 3, 3);
      }

      // Radar Pings
      for (const rp of this.radarPings) {
        mctx.strokeStyle = rp.color;
        mctx.lineWidth = 1.5;
        mctx.beginPath();
        mctx.arc(rp.x * scale, rp.y * scale, (4.2 - rp.timer) * 6, 0, Math.PI * 2);
        mctx.stroke();
      }

      // Camera Viewport Box
      mctx.strokeStyle = '#f8fafc';
      mctx.lineWidth = 1.2;
      mctx.strokeRect(
        this.cam.x * scale,
        this.cam.y * scale,
        this.cam.w * scale,
        this.cam.h * scale
      );
    }

    // ========================================================================
    // Phase 4 (SYS-25): Deterministic Skirmish Save / Load Serialization (.zhsave)
    // ========================================================================
    serializeUnit(u) {
      return {
        id: u.id,
        defId: u.defId,
        team: u.team,
        x: u.x,
        y: u.y,
        z: u.z || 0,
        radius: u.radius,
        hp: u.hp,
        maxHp: u.maxHp,
        speed: u.speed,
        currentSpeed: u.currentSpeed || 0,
        angle: u.angle || 0,
        turretAngle: u.turretAngle || 0,
        bankAngle: u.bankAngle || 0,
        locomotor: u.locomotor,
        vetLevel: u.vetLevel || 0,
        xp: u.xp || 0,
        salvageTier: u.salvageTier || 0,
        inHorde: Boolean(u.inHorde),
        inPropaganda: Boolean(u.inPropaganda),
        stealthed: Boolean(u.stealthed),
        gpsScrambleTimer: u.gpsScrambleTimer || 0,
        unmanned: Boolean(u.unmanned),
        garrisonedIn: u.garrisonedIn || u.garrisonId || null,
        overlordAddon: u.overlordAddon || null,
        hasSpeakerTower: Boolean(u.hasSpeakerTower),
        hasGatlingCannon: Boolean(u.hasGatlingCannon),
        laserLockTimer: u.laserLockTimer || 0,
        abilityCooldown: u.abilityCooldown || 0,
        disabledTimer: u.disabledTimer || 0,
        empTimer: u.empTimer || 0,
        attackCooldown: u.attackCooldown || 0,
        pdlTimer: u.pdlTimer || 0,
        rotorAngle: u.rotorAngle || 0,
        recoilOffset: u.recoilOffset || 0,
        activeBarrel: u.activeBarrel || 0,
        hackTimer: u.hackTimer || 0,
        controlGroup: u.controlGroup || null,
        aiSquad: u.aiSquad || null,
        waypoints: Array.isArray(u.waypoints) ? u.waypoints.map(w => ({ x: w.x, y: w.y })) : [],
        state: u.state || 'IDLE',
        targetX: u.targetX,
        targetY: u.targetY,
        guardX: u.guardX,
        guardY: u.guardY,
        targetEntityId: u.targetEntity ? u.targetEntity.id : (u.targetEntityId || null),
        buildTargetId: u.buildTargetId || null,
        supplyDockId: u.supplyDockId || null,
        supplyCarried: u.supplyCarried || 0,
        harvestTimer: u.harvestTimer || 0
      };
    }

    hydrateUnit(raw) {
      const def = ZH_DATA.UNITS[raw.defId];
      if (!def) return null;
      return {
        ...raw,
        isUnit: true,
        def,
        overlordAddon: raw.overlordAddon || null,
        garrisonedIn: raw.garrisonedIn || null,
        garrisonId: raw.garrisonedIn || null,
        waypoints: Array.isArray(raw.waypoints) ? raw.waypoints.map(w => ({ x: w.x, y: w.y })) : []
      };
    }

    serializeState() {
      const controlGroupsObj = {};
      if (this.controlGroups) {
        for (const [grp, ids] of Object.entries(this.controlGroups)) {
          controlGroupsObj[grp] = Array.from(ids);
        }
      }

      return {
        format: 'CNC_ZH_SAVE_V2',
        version: '2.0.0',
        savedAt: new Date().toISOString(),
        nextEntityId,
        mode: this.mode,
        challengeIndex: this.challengeIndex,
        difficulty: this.difficulty,
        mapId: this.mapDef ? this.mapDef.id : 'TOURNAMENT_DESERT',
        gameTime: this.gameTime,
        matchTime: this.gameTime,
        simTick: this.simTick || 0,
        gameSpeed: this.gameSpeed,
        paused: this.paused,
        gameOver: this.gameOver,
        winner: this.winner,
        passiveIncomeTimer: this.passiveIncomeTimer,
        hordeCheckTimer: this.hordeCheckTimer,
        fogUpdateTimer: this.fogUpdateTimer,
        underAttackTimer: this.underAttackTimer,
        lastAlertPos: this.lastAlertPos ? { ...this.lastAlertPos } : null,
        cam: { ...this.cam },
        selectedIds: Array.from(this.selectedIds),
        controlGroups: controlGroupsObj,
        fog: Array.from(this.fog),
        teams: this.teams.map(t => ({
          id: t.id,
          isAI: t.isAI,
          generalId: t.generalId,
          factionId: t.factionId,
          credits: t.credits,
          powerProduced: t.powerProduced,
          powerConsumed: t.powerConsumed,
          isLowPower: t.isLowPower,
          hasRadar: t.hasRadar,
          hasTechCenter: t.hasTechCenter,
          rank: t.rank,
          xp: t.xp,
          generalPoints: t.generalPoints,
          unlockedPowers: Array.from(t.unlockedPowers || []),
          powerCooldowns: { ...(t.powerCooldowns || {}) },
          upgrades: Array.from(t.upgrades || []),
          tunnelUnits: (t.tunnelUnits || []).map(u => this.serializeUnit(u))
        })),
        buildings: this.buildings.map(b => ({
          id: b.id,
          defId: b.defId,
          team: b.team,
          x: b.x,
          y: b.y,
          radius: b.radius,
          hp: b.hp,
          maxHp: b.maxHp,
          constructed: b.constructed,
          buildProgress: b.buildProgress,
          queue: (b.queue || []).map(q => ({ ...q })),
          rallyX: b.rallyX,
          rallyY: b.rallyY,
          attackCooldown: b.attackCooldown || 0,
          turretAngle: b.turretAngle || 0,
          overcharged: Boolean(b.overcharged),
          disabledTimer: b.disabledTimer || 0,
          empTimer: b.empTimer || 0,
          superweaponTimer: b.superweaponTimer || 0,
          superweaponMaxTimer: b.superweaponMaxTimer || 150,
          superweaponReady: Boolean(b.superweaponReady),
          controlGroup: b.controlGroup || null
        })),
        units: this.units.map(u => this.serializeUnit(u)),
        supplyDocks: this.supplyDocks.map(d => ({
          id: d.id,
          x: d.x,
          y: d.y,
          amount: d.amount,
          maxAmount: d.maxAmount,
          radius: d.radius
        })),
        techStructures: this.techStructures.map(t => ({
          id: t.id,
          defId: t.defId,
          name: t.name,
          x: t.x,
          y: t.y,
          team: t.team,
          captureProgress: t.captureProgress || 0,
          capturingTeam: t.capturingTeam !== undefined ? t.capturingTeam : -1,
          radius: t.radius,
          hp: t.hp,
          maxHp: t.maxHp
        })),
        garrisonBunkers: this.garrisonBunkers.map(gb => ({
          id: gb.id,
          defId: gb.defId,
          name: gb.name,
          x: gb.x,
          y: gb.y,
          team: gb.team,
          radius: gb.radius,
          hp: gb.hp,
          maxHp: gb.maxHp,
          maxOccupants: gb.maxOccupants || 6,
          armorBonus: gb.armorBonus || 0.40,
          rangeBonus: gb.rangeBonus || 1.25,
          occupantIds: (gb.occupants || []).map(u => u.id)
        })),
        salvageCrates: this.salvageCrates.map(c => ({ ...c })),
        hazards: this.hazards.map(h => ({ ...h })),
        decals: (this.decals || []).slice(-120).map(d => ({ ...d })),
        aiState: window.ZH_AI && typeof ZH_AI.serializeState === 'function' ? ZH_AI.serializeState() : null
      };
    }

    deserializeState(snapshot) {
      if (!snapshot || snapshot.format !== 'CNC_ZH_SAVE_V2') {
        throw new Error('Invalid or unsupported .zhsave format');
      }

      nextEntityId = snapshot.nextEntityId || 1000;
      this.mode = snapshot.mode || 'SKIRMISH';
      this.challengeIndex = snapshot.challengeIndex || 0;
      this.difficulty = snapshot.difficulty || 'NORMAL';
      this.mapDef = ZH_DATA.MAPS.find(m => m.id === snapshot.mapId) || ZH_DATA.MAPS[0];
      this.mapData = this.mapDef;

      this.gameTime = snapshot.gameTime || snapshot.matchTime || 0;
      this.matchTime = this.gameTime;
      this.simTick = snapshot.simTick || 0;
      this.accumulator = 0;
      this.gameSpeed = snapshot.gameSpeed || 1.0;
      this.paused = Boolean(snapshot.paused);
      this.gameOver = Boolean(snapshot.gameOver);
      this.winner = snapshot.winner !== undefined ? snapshot.winner : null;

      this.passiveIncomeTimer = snapshot.passiveIncomeTimer || 0;
      this.hordeCheckTimer = snapshot.hordeCheckTimer || 0;
      this.fogUpdateTimer = snapshot.fogUpdateTimer || 0;
      this.underAttackTimer = snapshot.underAttackTimer || 0;
      this.lastAlertPos = snapshot.lastAlertPos ? { ...snapshot.lastAlertPos } : null;

      if (snapshot.cam) {
        this.cam = { ...this.cam, ...snapshot.cam };
      }

      // Restore Teams
      this.teams = (snapshot.teams || []).map(t => {
        const generalDef = ZH_DATA.GENERALS[t.generalId] || ZH_DATA.GENERALS.USA_GRANGER;
        const factionDef = ZH_DATA.FACTIONS[t.factionId] || ZH_DATA.FACTIONS[generalDef.faction];
        const unlockedPowers = new Set(t.unlockedPowers || []);
        const upgrades = new Set(t.upgrades || []);
        const tunnelUnits = (t.tunnelUnits || []).map(u => this.hydrateUnit(u)).filter(Boolean);
        return {
          id: t.id,
          isAI: t.isAI,
          generalId: generalDef.id,
          general: generalDef,
          factionId: factionDef.id,
          faction: factionDef,
          credits: t.credits,
          powerProduced: t.powerProduced || 0,
          powerConsumed: t.powerConsumed || 0,
          isLowPower: Boolean(t.isLowPower),
          hasRadar: t.hasRadar !== undefined ? t.hasRadar : true,
          hasTechCenter: Boolean(t.hasTechCenter),
          rank: t.rank || 1,
          xp: t.xp || 0,
          generalPoints: t.generalPoints !== undefined ? t.generalPoints : 1,
          unlockedPowers,
          powerCooldowns: { ...(t.powerCooldowns || {}) },
          upgrades,
          researchedUpgrades: upgrades,
          tunnelUnits,
          tunnelPool: tunnelUnits
        };
      });

      // Restore Buildings
      this.buildings = (snapshot.buildings || []).map(b => {
        const def = ZH_DATA.BUILDINGS[b.defId];
        if (!def) return null;
        return {
          ...b,
          isBuilding: true,
          def,
          queue: (b.queue || []).map(q => ({ ...q }))
        };
      }).filter(Boolean);

      // Restore Units
      this.units = (snapshot.units || []).map(u => this.hydrateUnit(u)).filter(Boolean);

      // Restore Supply Docks
      this.supplyDocks = (snapshot.supplyDocks || []).map(d => ({ ...d }));

      // Restore Tech Structures
      this.techStructures = (snapshot.techStructures || []).map(t => {
        const tDef = (ZH_DATA.TECH_BUILDINGS && ZH_DATA.TECH_BUILDINGS[t.defId]) || {
          id: t.defId,
          name: t.name || 'Tech Building',
          size: (t.radius || 36) * 2,
          hp: t.maxHp || 2000
        };
        return {
          ...t,
          isTechStructure: true,
          def: tDef
        };
      });
      this.oilDerricks = this.techStructures;

      // Restore Garrison Bunkers and re-link occupant references
      const unitById = new Map(this.units.map(u => [u.id, u]));
      this.garrisonBunkers = (snapshot.garrisonBunkers || []).map(gb => {
        const bDef = (ZH_DATA.TECH_BUILDINGS && ZH_DATA.TECH_BUILDINGS[gb.defId]) || {
          id: gb.defId || 'CIV_GARRISON_BUNKER',
          name: gb.name || 'Civilian Urban Garrison',
          size: (gb.radius || 42) * 2,
          hp: gb.maxHp || 2200,
          isGarrisonable: true,
          maxOccupants: gb.maxOccupants || 6
        };
        const occupants = (gb.occupantIds || []).map(id => unitById.get(id)).filter(Boolean);
        occupants.forEach(occ => {
          occ.garrisonedIn = gb.id;
          occ.garrisonId = gb.id;
        });
        return {
          ...gb,
          isGarrisonBunker: true,
          def: bDef,
          occupants,
          garrisonedUnits: occupants
        };
      });
      this.garrisonStructures = this.garrisonBunkers;

      // Re-link targetEntity references on units
      const allEntitiesById = new Map();
      this.buildings.forEach(b => allEntitiesById.set(b.id, b));
      this.units.forEach(u => allEntitiesById.set(u.id, u));
      this.techStructures.forEach(t => allEntitiesById.set(t.id, t));
      this.garrisonBunkers.forEach(g => allEntitiesById.set(g.id, g));
      this.supplyDocks.forEach(d => allEntitiesById.set(d.id, d));

      for (const u of this.units) {
        if (u.targetEntityId && allEntitiesById.has(u.targetEntityId)) {
          u.targetEntity = allEntitiesById.get(u.targetEntityId);
        }
      }

      // Restore Crates, Hazards, Decals & Transient VFX
      this.salvageCrates = (snapshot.salvageCrates || []).map(c => ({ ...c }));
      this.hazards = (snapshot.hazards || []).map(h => ({ ...h }));
      this.decals = (snapshot.decals || []).map(d => ({ ...d }));
      this.projectiles = [];
      this.particles = [];
      this.shockwaves = [];
      this.mushroomClouds = [];
      this.activeBeams = [];
      this.floatingTexts = [];
      this.radarPings = [];

      // Restore Selection & Control Groups
      this.selectedIds = new Set((snapshot.selectedIds || []).filter(id => allEntitiesById.has(id)));
      this.controlGroups = {};
      if (snapshot.controlGroups) {
        for (const [grp, ids] of Object.entries(snapshot.controlGroups)) {
          this.controlGroups[grp] = (ids || []).filter(
            id => unitById.has(id) || this.buildings.some(b => b.id === id && b.hp > 0)
          );
        }
      }

      // Restore Fog of War
      if (Array.isArray(snapshot.fog) && snapshot.fog.length === this.fog.length) {
        this.fog.set(snapshot.fog);
      } else {
        this.updateFogOfWar();
      }

      // Restore AI State
      if (snapshot.aiState && window.ZH_AI && typeof ZH_AI.deserializeState === 'function') {
        ZH_AI.deserializeState(snapshot.aiState);
      }

      if (this.navGrid) this.navGrid.rebuild(this);
      if (this.spatialGrid) this.spatialGrid.rebuild(this.units, this.buildings);
      this.recalculatePower(0);
      this.recalculatePower(1);
      this.running = true;

      if (this.onStateChange) this.onStateChange();
      if (this.onAlert) this.onAlert('SKIRMISH SNAPSHOT RESTORED [F9]', '#38bdf8');
      return true;
    }

    saveToSlot(slotKey = 'zh_quicksave_v2') {
      const snapshot = this.serializeState();
      const json = JSON.stringify(snapshot);
      if (!GameEngine._memorySaveSlots) GameEngine._memorySaveSlots = {};
      GameEngine._memorySaveSlots[slotKey] = json;
      if (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.setItem === 'function') {
        try {
          localStorage.setItem(slotKey, json);
        } catch (err) {
          // Ignore quota errors in headless environments
        }
      }
      if (this.onAlert) this.onAlert('SKIRMISH SNAPSHOT SAVED [F5]', '#22c55e');
      return true;
    }

    loadFromSlot(slotKey = 'zh_quicksave_v2') {
      let raw = null;
      if (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.getItem === 'function') {
        try {
          raw = localStorage.getItem(slotKey);
        } catch (err) {
          raw = null;
        }
      }
      if (!raw && GameEngine._memorySaveSlots && GameEngine._memorySaveSlots[slotKey]) {
        raw = GameEngine._memorySaveSlots[slotKey];
      }
      if (raw) {
        const snapshot = JSON.parse(raw);
        return this.deserializeState(snapshot);
      }
      return false;
    }

    exportSaveJSON() {
      return JSON.stringify(this.serializeState(), null, 2);
    }

    importSaveJSON(jsonString) {
      const snapshot = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
      return this.deserializeState(snapshot);
    }
  }

  return {
    GameEngine,
    WORLD_SIZE,
    FIXED_STEP
  };
})();

