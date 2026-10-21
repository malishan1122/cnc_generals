/**
 * Command & Conquer: Generals — Zero Hour (macOS Clean-Room Edition)
 * Internal Autonomous Plan Simulator & Real-Time Invariant Audit Engine
 *
 * Plays the game autonomously as Team 0 (or full AI vs AI), executes multi-phase
 * strategic doctrines across all 9 Generals, exercises UI & Engine command pipelines,
 * and continuously audits runtime state for gameplay bugs or invariant violations.
 */

window.ZH_SIMULATOR = (function () {
  'use strict';

  const PLANS = {
    BALANCED_DOCTRINE: {
      id: 'BALANCED_DOCTRINE',
      name: 'Combined-Arms Doctrine',
      desc: 'Balanced economy, tech capture, base expansion, upgrades, ability micro, and coordinated assault waves.'
    },
    RUSH_DOCTRINE: {
      id: 'RUSH_DOCTRINE',
      name: 'Aggressive Blitz Rush',
      desc: 'Fast dual-production opener with relentless early-game attack waves and forward garrison control.'
    },
    TECH_SUPERWEAPON_DOCTRINE: {
      id: 'TECH_SUPERWEAPON_DOCTRINE',
      name: 'Tech & Superweapon Rush',
      desc: 'Fortified base perimeter, rapid Tier-3 escalation, Generals Powers, and Superweapon strikes.'
    },
    ABILITY_FUZZ_DOCTRINE: {
      id: 'ABILITY_FUZZ_DOCTRINE',
      name: 'Subsystem & Ability Exerciser',
      desc: 'Systematically exercises unit abilities, Jarmen snipe + re-crew, Hijackers, GLA tunnels, and repairs.'
    }
  };

  // Faction-specific blueprint tables used by the strategic planner
  const FACTION_BLUEPRINTS = {
    USA: {
      power: 'USA_REACTOR',
      supply: 'USA_SUPPLY_CENTER',
      barracks: 'USA_BARRACKS',
      warFactory: 'USA_WAR_FACTORY',
      airfield: 'USA_AIRFIELD',
      tech: 'USA_STRATEGY_CENTER',
      superweapon: 'USA_PARTICLE_CANNON',
      defenses: ['USA_PATRIOT', 'USA_EMP_PATRIOT', 'USA_LASER_TURRET'],
      harvester: 'USA_CHINOOK',
      builder: 'USA_DOZER',
      captureUnit: 'USA_RANGER',
      upgrades: [
        'UPG_CONTROL_RODS',
        'UPG_FLASHBANGS',
        'UPG_TOW_MISSILE',
        'UPG_ROCKET_PODS',
        'UPG_COMPOSITE_ARMOR'
      ],
      roster: [
        'USA_RANGER',
        'USA_MISSILE_DEFENDER',
        'USA_PATHFINDER',
        'USA_COLONEL_BURTON',
        'USA_HUMVEE',
        'USA_CRUSADER',
        'USA_LASER_CRUSADER',
        'USA_PALADIN',
        'USA_LASER_TANK',
        'USA_TOMAHAWK',
        'USA_AVENGER',
        'USA_COMANCHE',
        'USA_COMBAT_CHINOOK',
        'USA_RAPTOR',
        'USA_KING_RAPTOR',
        'USA_AURORA',
        'USA_AURORA_ALPHA'
      ]
    },
    CHINA: {
      power: 'CHINA_REACTOR',
      supply: 'CHINA_SUPPLY_CENTER',
      barracks: 'CHINA_BARRACKS',
      warFactory: 'CHINA_WAR_FACTORY',
      airfield: 'CHINA_AIRFIELD',
      tech: 'CHINA_PROPAGANDA_CENTER',
      superweapon: 'CHINA_NUCLEAR_SILO',
      defenses: ['CHINA_GATTLING_CANNON', 'CHINA_BUNKER', 'CHINA_SPEAKER_TOWER'],
      harvester: 'CHINA_SUPPLY_TRUCK',
      builder: 'CHINA_DOZER',
      captureUnit: 'CHINA_RED_GUARD',
      upgrades: [
        'UPG_NATIONALISM',
        'UPG_BLACK_NAPALM',
        'UPG_CHAIN_GUNS',
        'UPG_SUBLIMINAL_MESSAGING',
        'UPG_URANIUM_SHELLS'
      ],
      roster: [
        'CHINA_RED_GUARD',
        'CHINA_MINIGUNNER',
        'CHINA_TANK_HUNTER',
        'CHINA_HACKER',
        'CHINA_BLACK_LOTUS',
        'CHINA_BATTLEMASTER',
        'CHINA_GATTLING_TANK',
        'CHINA_DRAGON_TANK',
        'CHINA_TROOP_CRAWLER',
        'CHINA_ASSAULT_CRAWLER',
        'CHINA_INFERNO_CANNON',
        'CHINA_OVERLORD',
        'CHINA_EMPEROR_OVERLORD',
        'CHINA_NUKE_CANNON',
        'CHINA_MIG',
        'CHINA_NUKE_MIG'
      ]
    },
    GLA: {
      power: null,
      supply: 'GLA_SUPPLY_STASH',
      barracks: 'GLA_BARRACKS',
      warFactory: 'GLA_ARMS_DEALER',
      airfield: null,
      tech: 'GLA_PALACE',
      superweapon: 'GLA_SCUD_STORM',
      defenses: ['GLA_TUNNEL_NETWORK', 'GLA_STINGER_SITE'],
      harvester: 'GLA_WORKER',
      builder: 'GLA_WORKER',
      captureUnit: 'GLA_REBEL',
      upgrades: [
        'UPG_ANTHRAX_BETA',
        'UPG_SCORPION_ROCKET',
        'UPG_AP_ROCKETS',
        'UPG_ARM_THE_MOB',
        'UPG_JUNK_REPAIR'
      ],
      roster: [
        'GLA_REBEL',
        'GLA_RPG_TROOPER',
        'GLA_TERRORIST',
        'GLA_ANGRY_MOB',
        'GLA_HIJACKER',
        'GLA_JARMEN_KELL',
        'GLA_TECHNICAL',
        'GLA_COMBAT_CYCLE',
        'GLA_SCORPION',
        'GLA_MARAUDER',
        'GLA_QUAD_CANNON',
        'GLA_ROCKET_BUGGY',
        'GLA_TOXIN_TRACTOR',
        'GLA_BOMB_TRUCK',
        'GLA_SCUD_LAUNCHER'
      ]
    }
  };

  // ==========================================================================
  // AuditEngine: Real-Time Runtime Bug & Invariant Detector
  // ==========================================================================
  class AuditEngine {
    constructor() {
      this.reset();
    }

    reset() {
      this.issues = [];
      this.issueMap = new Map();
      this.metrics = {
        ticksAudited: 0,
        projectilesChecked: 0,
        ballisticArcsVerified: 0,
        abilitiesTriggered: 0,
        buildingsConstructed: 0,
        techCaptured: 0,
        garrisonsEntered: 0,
        tunnelsUsed: 0,
        vehiclesRecrewed: 0,
        vehiclesHijacked: 0,
        superweaponsFired: 0,
        generalsPowersCast: 0,
        unstuckRecoveries: 0
      };
      this.unitStallTracker = new Map();
    }

    reportIssue(code, severity, message, details = null) {
      const existing = this.issueMap.get(code + ':' + message);
      if (existing) {
        existing.count++;
        existing.lastSeen = Date.now();
        return existing;
      }
      const entry = {
        code,
        severity, // 'ERROR' | 'WARN' | 'INFO'
        message,
        details,
        count: 1,
        firstSeen: Date.now(),
        lastSeen: Date.now()
      };
      this.issues.push(entry);
      this.issueMap.set(code + ':' + message, entry);
      return entry;
    }

    auditTick(engine, dt) {
      if (!engine) return;
      this.metrics.ticksAudited++;

      // INV-01: Team Economy & Power Invariants
      for (const t of [0, 1]) {
        const team = engine.teams[t];
        if (!team) continue;
        if (!Number.isFinite(team.credits) || team.credits < -0.01) {
          this.reportIssue('INV-01', 'ERROR', `Team ${t} credits invalid: ${team.credits}`);
        }
        if (!Number.isFinite(team.powerProduced) || !Number.isFinite(team.powerConsumed)) {
          this.reportIssue('INV-01', 'ERROR', `Team ${t} power telemetry NaN`);
        }
      }

      // INV-02: Unit Coordinate, Health, State & Exclusivity Invariants
      for (const u of engine.units) {
        if (!Number.isFinite(u.x) || !Number.isFinite(u.y) || !Number.isFinite(u.hp)) {
          this.reportIssue('INV-02', 'ERROR', `Unit ${u.defId}#${u.id} has non-finite coords/hp`);
        }
        if (u.x < -64 || u.y < -64 || u.x > engine.worldSize + 64 || u.y > engine.worldSize + 64) {
          this.reportIssue('INV-02', 'WARN', `Unit ${u.defId}#${u.id} out of world bounds (${Math.round(u.x)}, ${Math.round(u.y)})`);
        }

        // Check generalOnly restriction on spawned units (excluding captured/hijacked/recrewed units)
        if (
          u.def &&
          u.def.generalOnly &&
          !u.wasCapturedOrRecrewed &&
          engine.teams[u.team] &&
          engine.teams[u.team].general &&
          u.def.generalOnly !== engine.teams[u.team].general.id &&
          u.def.faction === engine.teams[u.team].general.faction
        ) {
          this.reportIssue(
            'INV-05',
            'ERROR',
            `Team ${u.team} (${engine.teams[u.team].general.id}) spawned restricted unit ${u.defId} (requires ${u.def.generalOnly})`
          );
        }

        // Detect & auto-recover stalled BUILD or HARVEST orders
        if (u.state === 'BUILD' || u.state === 'MOVE' || u.state === 'HARVEST') {
          const prev = this.unitStallTracker.get(u.id);
          if (prev && prev.state === u.state && Math.hypot(u.x - prev.x, u.y - prev.y) < 1.5) {
            prev.stallTime += dt;
            if (prev.stallTime > 18.0) {
              // Check if builder is trying to build a valid target or stuck
              if (u.state === 'BUILD') {
                const siteId = u.buildTargetId || u.targetEntityId;
                const site = engine.buildings.find(b => b.id === siteId);
                if (!site) {
                  this.reportIssue('INV-04', 'WARN', `Builder ${u.defId}#${u.id} had orphaned BUILD state without valid site`);
                  u.state = 'IDLE';
                  this.metrics.unstuckRecoveries++;
                }
              }
              prev.stallTime = 0;
            }
          } else {
            this.unitStallTracker.set(u.id, { state: u.state, x: u.x, y: u.y, stallTime: 0 });
          }
        } else {
          this.unitStallTracker.delete(u.id);
        }
      }

      // INV-03: Building Coordinate, Health & General Exclusivity Invariants
      for (const b of engine.buildings) {
        if (!Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.hp)) {
          this.reportIssue('INV-03', 'ERROR', `Building ${b.defId}#${b.id} has non-finite coords/hp`);
        }
        if (
          b.def &&
          b.def.generalOnly &&
          !b.wasCaptured &&
          engine.teams[b.team] &&
          engine.teams[b.team].general &&
          b.def.generalOnly !== engine.teams[b.team].general.id &&
          b.def.faction === engine.teams[b.team].general.faction
        ) {
          this.reportIssue(
            'INV-05',
            'ERROR',
            `Team ${b.team} (${engine.teams[b.team].general.id}) placed restricted building ${b.defId} (requires ${b.def.generalOnly})`
          );
        }
      }

      // INV-04: Garrison Bunker Consistency
      for (const g of engine.garrisonBunkers || []) {
        const cap = g.maxOccupants || g.capacity || 6;
        if (g.occupants.length > cap) {
          this.reportIssue('INV-04', 'ERROR', `Garrison bunker #${g.id} exceeded capacity (${g.occupants.length}/${cap})`);
        }
        for (const occEntry of g.occupants) {
          const occ = typeof occEntry === 'object' ? occEntry : engine.units.find(u => u.id === occEntry);
          if (occ && occ.garrisonedIn !== g.id) {
            this.reportIssue('INV-04', 'ERROR', `Garrison occupant #${occ.id} missing garrisonedIn=${g.id}`);
          }
        }
      }

      // INV-06: 3D Ballistics Arc Audit
      for (const p of engine.projectiles || []) {
        this.metrics.projectilesChecked++;
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
          this.reportIssue('INV-06', 'ERROR', `Projectile has NaN coordinates (${p.x}, ${p.y}, ${p.z})`);
        }
        if (p.isBallistic && p.peakHeight > 0 && p.totalDist > 40) {
          const traveled = Math.hypot(p.x - p.startX, p.y - p.startY);
          const ratio = traveled / p.totalDist;
          if (ratio > 0.15 && ratio < 0.85 && p.z > 1.0) {
            this.metrics.ballisticArcsVerified++;
          } else if (ratio > 0.25 && ratio < 0.75 && p.z <= 0) {
            this.reportIssue('INV-06', 'ERROR', `Ballistic projectile mid-flight z-arc is flat (z=${p.z}, ratio=${ratio.toFixed(2)})`);
          }
        }
      }
    }
  }

  // ==========================================================================
  // PlanSimulator: Autonomous Strategic Planner & Micro Controller
  // ==========================================================================
  class PlanSimulator {
    constructor(engine, ai, options = {}) {
      this.engine = engine;
      this.ai = ai;
      this.enabled = options.enabled !== undefined ? options.enabled : false;
      this.speedMultiplier = options.speedMultiplier || 1;
      this.planId = options.planId || 'BALANCED_DOCTRINE';
      this.team = options.team !== undefined ? options.team : 0;
      this.phase = 'PHASE 1: BASE & ECONOMY';
      this.lastActionText = 'Simulator Standby';
      this.decisionTimer = 0;
      this.microTimer = 0;
      this.buildSlotCursor = 0;
      this.audit = new AuditEngine();
    }

    resetForMatch(engine, ai) {
      this.engine = engine;
      this.ai = ai;
      this.decisionTimer = 0;
      this.microTimer = 0;
      this.buildSlotCursor = 0;
      this.phase = 'PHASE 1: BASE & ECONOMY';
      this.lastActionText = 'Match Initialized';
      this.audit.reset();
    }

    update(dt) {
      if (!this.engine || !this.engine.running) return;

      // Always run real-time invariant audit
      this.audit.auditTick(this.engine, dt);

      if (!this.enabled) return;

      this.decisionTimer -= dt;
      this.microTimer -= dt;

      if (this.microTimer <= 0) {
        this.microTimer = 0.45;
        this.executeTacticalMicro();
      }

      if (this.decisionTimer <= 0) {
        this.decisionTimer = 1.1;
        this.executeStrategicPlan();
      }
    }

    getBlueprint() {
      const gen = this.engine.teams[this.team].general;
      return FACTION_BLUEPRINTS[gen.faction] || FACTION_BLUEPRINTS.USA;
    }

    countTeamBuildings(defId, constructedOnly = false) {
      return this.engine.buildings.filter(
        b => b.team === this.team && b.defId === defId && (!constructedOnly || b.constructed)
      ).length;
    }

    countTeamUnits(defId) {
      return this.engine.units.filter(u => u.team === this.team && !u.dead && u.hp > 0 && u.defId === defId).length;
    }

    tryConstructBuilding(defId) {
      if (!defId) return false;
      if (!this.engine.isEntityUnlocked(defId, this.team)) return false;
      const bDef = ZH_DATA.BUILDINGS[defId];
      if (!bDef) return false;
      const cost = this.engine.getAdjustedCost(defId, this.team);
      if (this.engine.teams[this.team].credits < cost) return false;

      const cc =
        this.engine.buildings.find(b => b.team === this.team && !b.dead && b.hp > 0 && (b.def.isHQ || b.def.isCommandCenter)) ||
        this.engine.buildings.find(b => b.team === this.team && !b.dead && b.hp > 0);
      if (!cc) return false;

      // If it's a Supply Center / Supply Stash, try placing near an unharvested Supply Dock first
      let anchorX = cc.x;
      let anchorY = cc.y;
      if (bDef.isSupplyDepot || bDef.isSupplyDrop) {
        const dock = this.engine.supplyDocks.find(
          d => d.amount > 1000 && Math.hypot(d.x - cc.x, d.y - cc.y) < 950
        );
        if (dock) {
          anchorX = dock.x;
          anchorY = dock.y;
        }
      }

      this.buildSlotCursor = (this.buildSlotCursor + 1) % 24;
      const spot = this.engine.findValidBuildSpot(defId, anchorX, anchorY, this.buildSlotCursor);
      if (!spot) return false;
      const site = this.engine.startBuildingPlacement(defId, this.team, spot.x, spot.y);
      if (site) {
        this.audit.metrics.buildingsConstructed++;
        this.lastActionText = `Constructing ${bDef.name}`;
        return true;
      }
      return false;
    }

    executeStrategicPlan() {
      const eng = this.engine;
      const t = this.team;
      const teamState = eng.teams[t];
      const gen = teamState.general;
      const bp = this.getBlueprint();

      // 1. Re-assign idle Builders to unfinished or damaged buildings
      const builders = eng.units.filter(u => u.team === t && !u.dead && u.hp > 0 && u.def.isBuilder && !u.garrisonedIn);
      const unconstructedSites = eng.buildings.filter(
        b => b.team === t && !b.dead && b.hp > 0 && !b.constructed
      );
      const needySite = unconstructedSites[0] || eng.buildings.find(
        b => b.team === t && !b.dead && b.hp > 0 && b.hp < b.maxHp * 0.85
      );
      if (needySite) {
        const assignedBuilder = builders.find(
          b => b.state === 'BUILD' && (b.buildTargetId === needySite.id || b.targetEntityId === needySite.id)
        );
        if (!assignedBuilder) {
          const idleBuilder = builders.find(b => b.state === 'IDLE' || (!b.def.isHarvester && b.state === 'MOVE'));
          if (idleBuilder) {
            idleBuilder.state = 'BUILD';
            idleBuilder.buildTargetId = needySite.id;
            idleBuilder.targetEntityId = needySite.id;
            this.lastActionText = `Assigned ${idleBuilder.def.name} to build/repair ${needySite.def.name}`;
          }
        }
      }

      // Only place a new foundation when no unconstructed foundation is waiting on a Dozer/Worker
      const canPlaceNewBuilding = unconstructedSites.length === 0;

      // 2. Keep idle Harvesters gathering supplies
      const harvesters = eng.units.filter(u => u.team === t && !u.dead && u.hp > 0 && u.def.isHarvester && !u.garrisonedIn);
      for (const h of harvesters) {
        if (h.state === 'IDLE') {
          if (h.def.isBuilder && builders.filter(b => b.state === 'BUILD').length === 0 && needySite) {
            continue;
          }
          eng.assignNearestSupplyDock(h);
        }
      }

      // 3. Ensure at least 1-2 Builders and 2-3 Harvesters exist
      const cc = eng.buildings.find(b => b.team === t && !b.dead && b.hp > 0 && b.constructed && (b.def.isHQ || b.def.isCommandCenter));
      if (cc && builders.length < 2 && cc.queue.length < 1 && (builders.length === 0 || teamState.credits >= 1800)) {
        if (eng.queueUnitProduction(cc, bp.builder)) {
          this.lastActionText = `Queued replacement ${bp.builder}`;
        }
      }
      const supplyDrop = eng.buildings.find(b => b.team === t && !b.dead && b.hp > 0 && b.constructed && (b.def.isSupplyDepot || b.def.isSupplyDrop));
      if (supplyDrop && harvesters.length < 3 && supplyDrop.queue.length < 2) {
        if (eng.queueUnitProduction(supplyDrop, bp.harvester)) {
          this.lastActionText = `Queued harvester ${bp.harvester}`;
        }
      }

      // 4. Power Management (USA / China) + China Reactor Overcharge
      if (bp.power) {
        if (canPlaceNewBuilding && teamState.powerConsumed >= teamState.powerProduced && this.countTeamBuildings(bp.power, false) < 5) {
          this.tryConstructBuilding(bp.power);
        }
        // China Reactor Overcharge when low power or high demand
        if (gen.faction === 'CHINA') {
          const reactors = eng.buildings.filter(b => b.team === t && !b.dead && b.hp > 0 && b.constructed && b.defId === 'CHINA_REACTOR');
          for (const r of reactors) {
            if (teamState.isLowPower && !r.overcharged && r.hp > r.maxHp * 0.55) {
              eng.toggleOvercharge(r);
              this.lastActionText = 'Activated Nuclear Reactor Overcharge';
            } else if (!teamState.isLowPower && r.overcharged && r.hp < r.maxHp * 0.45) {
              eng.toggleOvercharge(r);
            }
          }
        }
      }

      // 5. Core Base Build Order Progression based on Strategic Plan
      const hasSupply = this.countTeamBuildings(bp.supply, false) > 0;
      const hasBarracks = this.countTeamBuildings(bp.barracks, false) > 0;
      const hasWarFactory = this.countTeamBuildings(bp.warFactory, false) > 0;
      const hasTech = this.countTeamBuildings(bp.tech, false) > 0;

      if (canPlaceNewBuilding && unconstructedSites.length === 0) {
        if (!hasSupply) {
          this.phase = 'PHASE 1: SUPPLY ECONOMY';
          this.tryConstructBuilding(bp.supply);
        } else if (bp.power && this.countTeamBuildings(bp.power, false) === 0) {
          this.phase = 'PHASE 1: POWER GRID';
          this.tryConstructBuilding(bp.power);
        } else if (!hasBarracks) {
          this.phase = 'PHASE 1: INFANTRY BARRACKS';
          this.tryConstructBuilding(bp.barracks);
        } else if (!hasWarFactory) {
          this.phase = 'PHASE 2: MECHANIZED PRODUCTION';
          this.tryConstructBuilding(bp.warFactory);
        } else if (this.planId === 'RUSH_DOCTRINE') {
          this.phase = 'PHASE 2: BLITZ RUSH PRODUCTION';
          if (this.countTeamBuildings(bp.warFactory, false) < 2 && teamState.credits > 2400) {
            this.tryConstructBuilding(bp.warFactory);
          }
        } else {
          const unlockedDefenses = bp.defenses.filter(dId => eng.isEntityUnlocked(dId, t));
          const totalDefs = unlockedDefenses.reduce((acc, dId) => acc + this.countTeamBuildings(dId, false), 0);
          const targetDefs = this.planId === 'TECH_SUPERWEAPON_DOCTRINE' ? 3 : 2;

          if (unlockedDefenses.length > 0 && totalDefs < targetDefs && teamState.credits > 1200) {
            const pickDef = unlockedDefenses[totalDefs % unlockedDefenses.length];
            this.tryConstructBuilding(pickDef);
          } else if (bp.airfield && this.countTeamBuildings(bp.airfield, false) === 0 && teamState.credits > 1400) {
            this.phase = 'PHASE 2: AIR SUPERIORITY';
            this.tryConstructBuilding(bp.airfield);
          } else if (!hasTech && teamState.credits > 1800) {
            this.phase = 'PHASE 3: TIER-3 TECH ESCALATION';
            this.tryConstructBuilding(bp.tech);
          } else if (
            hasTech &&
            bp.superweapon &&
            this.countTeamBuildings(bp.superweapon, false) === 0 &&
            (this.planId === 'TECH_SUPERWEAPON_DOCTRINE' || teamState.credits > 4200)
          ) {
            this.phase = 'PHASE 4: SUPERWEAPON CONSTRUCTION';
            this.tryConstructBuilding(bp.superweapon);
          }
        }
      }

      // 6. Research Faction Upgrades
      for (const upgId of bp.upgrades) {
        if (!teamState.upgrades.has(upgId)) {
          const upgDef = ZH_DATA.UPGRADES[upgId];
          if (!upgDef) continue;
          const provider = eng.buildings.find(
            b =>
              b.team === t &&
              !b.dead &&
              b.hp > 0 &&
              b.constructed &&
              b.queue.length < 3 &&
              !b.queue.some(q => q.id === upgId) &&
              b.def.upgrades &&
              b.def.upgrades.includes(upgId)
          );
          if (provider && teamState.credits >= upgDef.cost) {
            if (eng.queueUpgradeResearch(provider, upgId)) {
              this.lastActionText = `Researching ${upgDef.name}`;
              break;
            }
          }
        }
      }

      // 7. Spend Generals Points & Cast Generals Powers
      this.handleGeneralsPowers();

      // 8. Fire Ready Superweapons
      this.handleSuperweapons();

      // 9. Queue Unit Production across all constructed production structures
      this.handleUnitProduction(bp);

      // 10. Issue Macro Objectives (Tech Capture, Garrisoning, Attack Waves)
      this.handleMacroObjectives(bp);
    }

    handleGeneralsPowers() {
      const eng = this.engine;
      const t = this.team;
      const teamState = eng.teams[t];
      const powers = ZH_DATA.GENERALS_POWERS[teamState.factionId] || [];

      if (teamState.generalPoints > 0) {
        for (const pDef of powers) {
          if (pDef && !teamState.unlockedPowers.has(pDef.id) && teamState.rank >= (pDef.rankReq || 1)) {
            if (eng.spendGeneralPoint(t, pDef.id)) {
              this.lastActionText = `Unlocked Power: ${pDef.name}`;
              break;
            }
          }
        }
      }

      if ((eng.matchTime || eng.gameTime || 0) < 75) return;

      const enemyTarget =
        eng.buildings.find(b => b.team !== t && !b.dead && b.hp > 0) ||
        eng.units.find(u => u.team !== t && !u.dead && u.hp > 0 && !u.garrisonedIn);
      if (!enemyTarget) return;

      for (const pId of teamState.unlockedPowers) {
        const cd = teamState.powerCooldowns[pId] || 0;
        if (cd <= 0) {
          if (eng.castGeneralsPower(t, pId, enemyTarget.x, enemyTarget.y)) {
            this.audit.metrics.generalsPowersCast++;
            this.lastActionText = `Cast Generals Power: ${pId}`;
            break;
          }
        }
      }
    }

    handleSuperweapons() {
      const eng = this.engine;
      const t = this.team;
      const enemyTarget =
        eng.buildings.find(b => b.team !== t && !b.dead && b.hp > 0 && (b.def.isHQ || b.def.isCommandCenter)) ||
        eng.buildings.find(b => b.team !== t && !b.dead && b.hp > 0);
      if (!enemyTarget) return;

      const readySilos = eng.buildings.filter(
        b => b.team === t && !b.dead && b.constructed && b.hp > 0 && b.def.isSuperweapon && b.superweaponReady
      );
      for (const sw of readySilos) {
        if (eng.fireSuperweapon(sw.id, enemyTarget.x, enemyTarget.y)) {
          this.audit.metrics.superweaponsFired++;
          this.lastActionText = `Fired Superweapon: ${sw.def.name}`;
        }
      }
    }

    handleUnitProduction(bp) {
      const eng = this.engine;
      const t = this.team;
      const teamState = eng.teams[t];

      // Filter roster to unlocked units for this General
      const unlockedRoster = bp.roster.filter(uId => eng.isEntityUnlocked(uId, t));
      if (unlockedRoster.length === 0) return;

      const prodBuildings = eng.buildings.filter(b => {
        const trainable = (b.def && (b.def.trains || b.def.produces)) || [];
        return b.team === t && !b.dead && b.hp > 0 && b.constructed && trainable.length > 0 && b.queue.length < 2;
      });

      for (const b of prodBuildings) {
        const trainable = (b.def && (b.def.trains || b.def.produces)) || [];
        const candidates = trainable.filter(
          uId => unlockedRoster.includes(uId) && eng.isEntityUnlocked(uId, t)
        );
        if (candidates.length === 0) continue;

        // Prioritize hero/specialist units if not yet on field
        let chosen = null;
        for (const cId of candidates) {
          const uDef = ZH_DATA.UNITS[cId];
          if (!uDef) continue;
          if (
            (cId === 'USA_COLONEL_BURTON' ||
              cId === 'CHINA_BLACK_LOTUS' ||
              cId === 'GLA_JARMEN_KELL' ||
              cId === 'GLA_HIJACKER' ||
              cId === 'CHINA_OVERLORD' ||
              cId === 'CHINA_EMPEROR_OVERLORD' ||
              cId === 'CHINA_DRAGON_TANK') &&
            this.countTeamUnits(cId) === 0
          ) {
            chosen = cId;
            break;
          }
        }

        if (!chosen) {
          const idx = Math.floor(((eng.matchTime || eng.gameTime || 0) * 3 + b.id) % candidates.length);
          chosen = candidates[idx];
        }

        const cost = eng.getAdjustedCost(chosen, t);
        if (teamState.credits >= cost) {
          if (eng.queueUnitProduction(b, chosen)) {
            this.lastActionText = `Training ${ZH_DATA.UNITS[chosen].name}`;
          }
        }
      }
    }

    handleMacroObjectives(bp) {
      const eng = this.engine;
      const t = this.team;

      // 1. Capture Neutral/Enemy Tech Structures (Oil Derricks, Hospital, Repair Bay)
      const uncapturedTech = (eng.techStructures || []).find(ts => ts.team !== t);
      if (uncapturedTech) {
        const capturer = eng.units.find(
          u =>
            u.team === t &&
            !u.garrisonedIn &&
            u.state === 'IDLE' &&
            (u.def.isRemoteHacker || u.def.canCapture)
        );
        if (capturer) {
          capturer.state = 'CAPTURE';
          capturer.targetEntityId = uncapturedTech.id;
          this.audit.metrics.techCaptured++;
          this.lastActionText = `Capturing ${uncapturedTech.name}`;
        }
      }

      // 2. Garrison neutral Civilian Bunkers
      const openBunker = (eng.garrisonBunkers || []).find(
        g => g.hp > 200 && (g.team === -1 || g.team === t) && g.occupants.length < (g.maxOccupants || g.capacity || 6)
      );
      if (openBunker) {
        const inf = eng.units.find(
          u =>
            u.team === t &&
            !u.garrisonedIn &&
            u.state === 'IDLE' &&
            u.def.category === 'INFANTRY' &&
            !u.def.isBuilder &&
            !u.def.isHero &&
            Math.hypot(u.x - openBunker.x, u.y - openBunker.y) < 900
        );
        if (inf && openBunker.occupants.length < 2) {
          inf.state = 'ENTER_GARRISON';
          inf.targetEntityId = openBunker.id;
          this.audit.metrics.garrisonsEntered++;
          this.lastActionText = `Garrisoning ${openBunker.name} with ${inf.def.name}`;
        }
      }

      // 3. Coordinate Combat Assault Waves (keep 2 defenders at base so base is never left empty)
      const combatIdle = eng.units.filter(
        u =>
          u.team === t &&
          !u.dead &&
          u.hp > 0 &&
          !u.garrisonedIn &&
          !u.def.isBuilder &&
          !u.def.isHarvester &&
          u.def.weapon &&
          u.state === 'IDLE'
      );

      const waveThreshold = this.planId === 'RUSH_DOCTRINE' ? 4 : 7;
      if (combatIdle.length >= waveThreshold) {
        this.phase = 'PHASE 3: COMBINED-ARMS ASSAULT';
        const enemyTarget =
          eng.buildings.find(b => b.team !== t && !b.dead && b.hp > 0) ||
          eng.units.find(u => u.team !== t && !u.dead && u.hp > 0 && !u.garrisonedIn);
        if (enemyTarget) {
          const assaultGroup = combatIdle.length > 2 ? combatIdle.slice(2) : combatIdle;
          for (const u of assaultGroup) {
            u.state = 'ATTACK_MOVE';
            u.targetX = enemyTarget.x + (Math.random() - 0.5) * 90;
            u.targetY = enemyTarget.y + (Math.random() - 0.5) * 90;
          }
          this.lastActionText = `Launched ${assaultGroup.length}-unit assault wave`;
        }
      }
    }

    executeTacticalMicro() {
      const eng = this.engine;
      const t = this.team;
      const myUnits = eng.units.filter(u => u.team === t && !u.garrisonedIn && u.hp > 0);
      const isVehicle = (u) => u && u.def && (u.def.category === 'TANK' || u.def.category === 'LIGHT_VEHICLE');

      // 1. Check for Unmanned Neutral Vehicles (from Jarmen Kell Pilot Snipe) -> Send infantry to Re-Crew!
      const unmanned = eng.units.find(u => u.unmanned && u.hp > 0);
      if (unmanned) {
        const inf = myUnits.find(
          u => u.def.category === 'INFANTRY' && !u.def.isBuilder && u.state !== 'RECREW_VEHICLE'
        );
        if (inf) {
          inf.state = 'RECREW_VEHICLE';
          inf.targetEntityId = unmanned.id;
          unmanned.wasCapturedOrRecrewed = true;
          this.audit.metrics.vehiclesRecrewed++;
          this.lastActionText = `Ordering ${inf.def.name} to re-crew unmanned ${unmanned.def.name}`;
        }
      }

      // 2. Unit Active Abilities & Specialist Micro
      for (const u of myUnits) {
        // Overlord self-upgrades (Speaker Tower or Gatling Cannon)
        if (
          (u.defId === 'CHINA_OVERLORD' || u.defId === 'CHINA_EMPEROR_OVERLORD') &&
          (!u.hasSpeakerTower || !u.hasGatlingCannon) &&
          (u.abilityCooldown || 0) <= 0
        ) {
          const abil = !u.hasSpeakerTower ? 'OVERLORD_SPEAKER' : 'OVERLORD_GATLING';
          if (eng.triggerUnitAbility(u, abil, u.x, u.y)) {
            this.audit.metrics.abilitiesTriggered++;
            this.lastActionText = `${u.def.name} equipped ${abil}`;
          }
          continue;
        }

        // GLA Hijacker -> Hijack nearest enemy vehicle
        if (u.defId === 'GLA_HIJACKER' && u.state !== 'HIJACK_VEHICLE') {
          const enemyVeh = eng.units.find(
            ev => ev.team !== t && !ev.unmanned && isVehicle(ev) && ev.hp > 0
          );
          if (enemyVeh) {
            u.state = 'HIJACK_VEHICLE';
            u.targetEntityId = enemyVeh.id;
            enemyVeh.wasCapturedOrRecrewed = true;
            this.audit.metrics.vehiclesHijacked++;
            this.lastActionText = `Hijacker targeting enemy ${enemyVeh.def.name}`;
            continue;
          }
        }

        // Jarmen Kell -> Pilot Snipe enemy vehicle in range
        if (u.defId === 'GLA_JARMEN_KELL' && (u.abilityCooldown || 0) <= 0) {
          const enemyVeh = eng.units.find(
            ev =>
              ev.team !== t &&
              !ev.unmanned &&
              isVehicle(ev) &&
              Math.hypot(ev.x - u.x, ev.y - u.y) <= 320
          );
          if (enemyVeh) {
            if (eng.triggerUnitAbility(u, 'PILOT_SNIPE', enemyVeh.x, enemyVeh.y, enemyVeh.id)) {
              this.audit.metrics.abilitiesTriggered++;
              this.lastActionText = `Jarmen Kell sniped pilot of ${enemyVeh.def.name}!`;
              continue;
            }
          }
        }

        // USA Missile Defender -> Laser Lock enemy armor
        if (u.defId === 'USA_MISSILE_DEFENDER' && (u.abilityCooldown || 0) <= 0) {
          const enemyArmor = eng.units.find(
            ev =>
              ev.team !== t &&
              !ev.garrisonedIn &&
              isVehicle(ev) &&
              Math.hypot(ev.x - u.x, ev.y - u.y) <= 230
          );
          if (enemyArmor) {
            if (eng.triggerUnitAbility(u, 'LASER_LOCK', enemyArmor.x, enemyArmor.y, enemyArmor.id)) {
              this.audit.metrics.abilitiesTriggered++;
              this.lastActionText = `Missile Defender Laser-Locked ${enemyArmor.def.name}`;
              continue;
            }
          }
        }

        // USA Ranger -> Flashbang enemy infantry or garrisoned bunker
        if (u.defId === 'USA_RANGER' && (u.abilityCooldown || 0) <= 0) {
          const enemyInf = eng.units.find(
            ev =>
              ev.team !== t &&
              !ev.garrisonedIn &&
              ev.def &&
              ev.def.category === 'INFANTRY' &&
              Math.hypot(ev.x - u.x, ev.y - u.y) <= 190
          );
          if (enemyInf) {
            if (eng.triggerUnitAbility(u, 'FLASHBANG', enemyInf.x, enemyInf.y, enemyInf.id)) {
              this.audit.metrics.abilitiesTriggered++;
              this.lastActionText = `Ranger lobbed Flashbang at ${enemyInf.def.name}`;
              continue;
            }
          }
        }

        // China Dragon Tank -> Flame Wall against enemy cluster/structure
        if (u.defId === 'CHINA_DRAGON_TANK' && (u.abilityCooldown || 0) <= 0) {
          const enemyTarget =
            eng.buildings.find(b => b.team !== t && Math.hypot(b.x - u.x, b.y - u.y) <= 185) ||
            eng.units.find(ev => ev.team !== t && !ev.garrisonedIn && Math.hypot(ev.x - u.x, ev.y - u.y) <= 185);
          if (enemyTarget) {
            if (eng.triggerUnitAbility(u, 'FLAME_WALL', enemyTarget.x, enemyTarget.y)) {
              this.audit.metrics.abilitiesTriggered++;
              this.lastActionText = `Dragon Tank unleashed Flame Wall!`;
              continue;
            }
          }
        }

        // Damaged GLA unit near friendly Tunnel Network -> Enter Tunnel for instant protection/healing
        if (
          u.hp < u.maxHp * 0.45 &&
          !u.def.isAir &&
          !u.def.isBuilder &&
          u.state !== 'ENTER_TUNNEL' &&
          (eng.teams[t].tunnelUnits || []).length < 8
        ) {
          const tunnel = eng.buildings.find(
            b => b.team === t && b.constructed && b.def.isTunnel && Math.hypot(b.x - u.x, b.y - u.y) < 320
          );
          if (tunnel) {
            u.state = 'ENTER_TUNNEL';
            u.targetEntityId = tunnel.id;
            this.audit.metrics.tunnelsUsed++;
          }
        }
      }

      // Evacuate healed units from GLA Tunnel Network
      const tunnelUnits = eng.teams[t].tunnelUnits || [];
      if (tunnelUnits.length > 0 && tunnelUnits.every(tu => tu.hp >= tu.maxHp * 0.9)) {
        const tunnel = eng.buildings.find(b => b.team === t && b.constructed && b.def.isTunnel);
        if (tunnel) {
          eng.evacuateTunnel(tunnel);
          this.lastActionText = `Deployed ${tunnelUnits.length} units from GLA Tunnel Network`;
        }
      }
    }
  }

  // ==========================================================================
  // Browser HUD Simulator Control Panel & Runtime Wiring
  // ==========================================================================
  let activeSimulator = null;
  let hudPanelEl = null;
  let hudRefreshAccum = 0;

  function attachEngine(engine, ai) {
    if (!activeSimulator) {
      activeSimulator = new PlanSimulator(engine, ai, {
        enabled: false,
        speedMultiplier: 1,
        planId: 'BALANCED_DOCTRINE'
      });
    } else {
      activeSimulator.resetForMatch(engine, ai);
    }
    syncHUDPanel();
    return activeSimulator;
  }

  function getSpeedMultiplier() {
    return activeSimulator && activeSimulator.enabled ? activeSimulator.speedMultiplier : 1;
  }

  function update(dt) {
    if (!activeSimulator) return;
    activeSimulator.update(dt);
    hudRefreshAccum += dt;
    if (hudRefreshAccum >= 0.4) {
      hudRefreshAccum = 0;
      syncHUDPanel();
    }
  }

  function initHUD() {
    if (typeof document === 'undefined') return;
    if (hudPanelEl) return;

    const panel = document.getElementById('zh-sim-hud-panel') || document.createElement('div');
    panel.id = 'zh-sim-hud-panel';
    panel.style.cssText = [
      'position:fixed',
      'top:54px',
      'left:14px',
      'z-index:45',
      'width:300px',
      'background:rgba(9,14,24,0.92)',
      'border:1px solid rgba(56,189,248,0.45)',
      'border-radius:6px',
      'padding:10px 12px',
      'font-family:monospace',
      'font-size:11px',
      'color:#e2e8f0',
      'box-shadow:0 8px 24px rgba(0,0,0,0.65)',
      'backdrop-filter:blur(6px)'
    ].join(';');

    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;border-bottom:1px solid rgba(56,189,248,0.25);padding-bottom:5px;gap:6px;">
        <span style="font-weight:700;color:#38bdf8;letter-spacing:0.5px;">🤖 PLAN SIMULATOR &amp; AUDIT</span>
        <div style="display:flex;gap:4px;align-items:center;">
          <button id="zh-sim-toggle-btn" style="background:#1e293b;color:#94a3b8;border:1px solid #475569;border-radius:4px;padding:2px 8px;cursor:pointer;font-weight:700;font-size:10px;">AUTO-PLAY: OFF</button>
          <button id="zh-sim-collapse-btn" title="Collapse/Expand Simulator Panel" style="background:#1e293b;color:#94a3b8;border:1px solid #475569;border-radius:4px;padding:2px 6px;cursor:pointer;font-weight:700;font-size:10px;">▾</button>
        </div>
      </div>
      <div id="zh-sim-body">
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
          <label style="color:#94a3b8;font-size:10px;">PLAN:</label>
          <select id="zh-sim-plan-select" style="flex:1;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:3px;padding:2px 4px;font-size:10px;font-family:monospace;">
            ${Object.values(PLANS)
              .map(p => `<option value="${p.id}">${p.name}</option>`)
              .join('')}
          </select>
        </div>
        <div style="display:flex;gap:4px;align-items:center;margin-bottom:7px;">
          <span style="color:#94a3b8;font-size:10px;margin-right:2px;">WARP:</span>
          <button class="zh-sim-speed-btn" data-speed="1" style="flex:1;background:#0284c7;color:#fff;border:none;border-radius:3px;padding:2px 0;cursor:pointer;font-size:10px;font-weight:700;">1x</button>
          <button class="zh-sim-speed-btn" data-speed="5" style="flex:1;background:#1e293b;color:#cbd5e1;border:1px solid #334155;border-radius:3px;padding:2px 0;cursor:pointer;font-size:10px;">5x</button>
          <button class="zh-sim-speed-btn" data-speed="15" style="flex:1;background:#1e293b;color:#cbd5e1;border:1px solid #334155;border-radius:3px;padding:2px 0;cursor:pointer;font-size:10px;">15x</button>
          <button class="zh-sim-speed-btn" data-speed="25" style="flex:1;background:#1e293b;color:#cbd5e1;border:1px solid #334155;border-radius:3px;padding:2px 0;cursor:pointer;font-size:10px;">25x</button>
        </div>
        <div id="zh-sim-phase-line" style="color:#fde047;font-weight:700;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">PHASE: STANDBY</div>
        <div id="zh-sim-action-line" style="color:#cbd5e1;font-size:10px;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Action: Manual Control</div>
        <div id="zh-sim-audit-line" style="background:rgba(15,23,42,0.85);border:1px solid rgba(34,197,94,0.4);border-radius:4px;padding:4px 6px;font-size:10px;color:#4ade80;">
          ✓ 0 Bugs Detected | Arcs/Units Nominal
        </div>
      </div>
    `;

    if (!panel.parentElement && document.body) {
      document.body.appendChild(panel);
    }
    hudPanelEl = panel;

    const collapseBtn = document.getElementById('zh-sim-collapse-btn');
    const simBody = document.getElementById('zh-sim-body');
    if (collapseBtn && simBody) {
      collapseBtn.addEventListener('click', () => {
        const collapsed = simBody.style.display === 'none';
        simBody.style.display = collapsed ? '' : 'none';
        collapseBtn.textContent = collapsed ? '▾' : '▸';
      });
    }

    const toggleBtn = document.getElementById('zh-sim-toggle-btn');
    toggleBtn.addEventListener('click', () => {
      if (!activeSimulator) return;
      activeSimulator.enabled = !activeSimulator.enabled;
      syncHUDPanel();
    });

    const topBarAutoSimBtn = document.getElementById('btn-auto-sim');
    if (topBarAutoSimBtn && !topBarAutoSimBtn.dataset.simBound) {
      topBarAutoSimBtn.dataset.simBound = '1';
      topBarAutoSimBtn.addEventListener('click', () => {
        if (!activeSimulator) return;
        activeSimulator.enabled = !activeSimulator.enabled;
        syncHUDPanel();
      });
    }

    const planSelect = document.getElementById('zh-sim-plan-select');
    planSelect.addEventListener('change', e => {
      if (!activeSimulator) return;
      activeSimulator.planId = e.target.value;
      syncHUDPanel();
    });

    const speedBtns = panel.querySelectorAll('.zh-sim-speed-btn');
    speedBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (!activeSimulator) return;
        activeSimulator.speedMultiplier = Number(btn.getAttribute('data-speed')) || 1;
        if (!activeSimulator.enabled && activeSimulator.speedMultiplier > 1) {
          activeSimulator.enabled = true;
        }
        syncHUDPanel();
      });
    });
  }

  function syncHUDPanel() {
    if (typeof document === 'undefined' || !hudPanelEl || !activeSimulator) return;
    const toggleBtn = document.getElementById('zh-sim-toggle-btn');
    const topBarAutoSimBtn = document.getElementById('btn-auto-sim');
    const phaseLine = document.getElementById('zh-sim-phase-line');
    const actionLine = document.getElementById('zh-sim-action-line');
    const auditLine = document.getElementById('zh-sim-audit-line');

    if (activeSimulator.enabled) {
      toggleBtn.textContent = 'AUTO-PLAY: ON';
      toggleBtn.style.background = '#16a34a';
      toggleBtn.style.color = '#ffffff';
      toggleBtn.style.borderColor = '#4ade80';
      if (topBarAutoSimBtn) {
        topBarAutoSimBtn.textContent = 'AUTO SIM: ON';
        topBarAutoSimBtn.classList.add('active');
      }
      phaseLine.textContent = activeSimulator.phase;
      actionLine.textContent = `Action: ${activeSimulator.lastActionText}`;
    } else {
      toggleBtn.textContent = 'AUTO-PLAY: OFF';
      toggleBtn.style.background = '#1e293b';
      toggleBtn.style.color = '#94a3b8';
      toggleBtn.style.borderColor = '#475569';
      if (topBarAutoSimBtn) {
        topBarAutoSimBtn.textContent = 'AUTO SIM: OFF';
        topBarAutoSimBtn.classList.remove('active');
      }
      phaseLine.textContent = 'PHASE: MANUAL CONTROL (AUDIT ACTIVE)';
      actionLine.textContent = `Ticks Audited: ${activeSimulator.audit.metrics.ticksAudited}`;
    }

    const speedBtns = hudPanelEl.querySelectorAll('.zh-sim-speed-btn');
    speedBtns.forEach(btn => {
      const spd = Number(btn.getAttribute('data-speed'));
      if (spd === activeSimulator.speedMultiplier) {
        btn.style.background = '#0284c7';
        btn.style.color = '#ffffff';
      } else {
        btn.style.background = '#1e293b';
        btn.style.color = '#cbd5e1';
      }
    });

    const errCount = activeSimulator.audit.issues.filter(i => i.severity === 'ERROR').length;
    const warnCount = activeSimulator.audit.issues.filter(i => i.severity === 'WARN').length;
    const m = activeSimulator.audit.metrics;

    if (errCount === 0 && warnCount === 0) {
      auditLine.style.borderColor = 'rgba(34,197,94,0.45)';
      auditLine.style.color = '#4ade80';
      auditLine.textContent = `✓ 0 Bugs | Bld:${m.buildingsConstructed} Abil:${m.abilitiesTriggered} Arcs:${m.ballisticArcsVerified}`;
    } else {
      const latest = activeSimulator.audit.issues[activeSimulator.audit.issues.length - 1];
      auditLine.style.borderColor = errCount > 0 ? '#ef4444' : '#f59e0b';
      auditLine.style.color = errCount > 0 ? '#fca5a5' : '#fcd34d';
      auditLine.textContent = `⚠ ${errCount} Err / ${warnCount} Warn: ${latest.message}`;
    }
  }

  return {
    PLANS,
    FACTION_BLUEPRINTS,
    AuditEngine,
    PlanSimulator,
    initHUD,
    attachEngine,
    getSpeedMultiplier,
    update,
    getActiveSimulator: () => activeSimulator
  };
})();
