// ============================================================================
// Command & Conquer: Generals – Zero Hour (macOS Clean-Room Edition)
// js/spatial.js — Spatial Hash Partitioning, Unit Locomotors & Ballistics Engine
// ============================================================================

window.ZH_SPATIAL = (function () {
  'use strict';

  function distSq(ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    return dx * dx + dy * dy;
  }

  function dist(ax, ay, bx, by) {
    return Math.hypot(bx - ax, by - ay);
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  // ==========================================================================
  // 1. SpatialHashGrid (2D Uniform Grid for O(k) Spatial Queries)
  // ==========================================================================
  class SpatialHashGrid {
    constructor(worldSizeOrCellSize = 2600, cellSize = 128) {
      if (worldSizeOrCellSize > 256) {
        this.worldSize = worldSizeOrCellSize;
        this.cellSize = cellSize;
      } else {
        this.worldSize = 2600;
        this.cellSize = worldSizeOrCellSize || 128;
      }
      this.cells = new Map();
    }

    _key(gx, gy) {
      return `${gx}:${gy}`;
    }

    clear() {
      this.cells.clear();
    }

    rebuild(units = [], buildings = [], extra = []) {
      this.clear();
      for (const u of units) {
        if (u && u.hp > 0 && !u.garrisonId && !u.garrisonedIn) this.insert(u);
      }
      for (const b of buildings) {
        if (b && b.hp > 0) this.insert(b);
      }
      for (const e of extra) {
        if (e && e.hp > 0) this.insert(e);
      }
    }

    insert(entity) {
      if (!entity || entity.hp <= 0 || entity.x === undefined || entity.y === undefined) {
        return;
      }

      const r = Math.max(4, entity.radius || 14);
      const minGx = Math.floor((entity.x - r) / this.cellSize);
      const maxGx = Math.floor((entity.x + r) / this.cellSize);
      const minGy = Math.floor((entity.y - r) / this.cellSize);
      const maxGy = Math.floor((entity.y + r) / this.cellSize);

      for (let gx = minGx; gx <= maxGx; gx++) {
        for (let gy = minGy; gy <= maxGy; gy++) {
          const key = this._key(gx, gy);
          let cell = this.cells.get(key);
          if (!cell) {
            cell = new Set();
            this.cells.set(key, cell);
          }
          cell.add(entity);
        }
      }
    }

    queryRadius(x, y, radius, filterFn = null) {
      const results = [];
      const visited = new Set();
      const minGx = Math.floor((x - radius) / this.cellSize);
      const maxGx = Math.floor((x + radius) / this.cellSize);
      const minGy = Math.floor((y - radius) / this.cellSize);
      const maxGy = Math.floor((y + radius) / this.cellSize);

      for (let gx = minGx; gx <= maxGx; gx++) {
        for (let gy = minGy; gy <= maxGy; gy++) {
          const cell = this.cells.get(this._key(gx, gy));
          if (!cell) continue;

          for (const entity of cell) {
            if (visited.has(entity)) continue;
            visited.add(entity);
            if (entity.hp <= 0) continue;

            const dSq = distSq(x, y, entity.x, entity.y);
            const totalR = radius + (entity.radius || 0);
            if (dSq <= totalR * totalR) {
              if (!filterFn || filterFn(entity)) {
                results.push(entity);
              }
            }
          }
        }
      }
      return results;
    }

    queryCircle(x, y, radius, filterFn = null) {
      return this.queryRadius(x, y, radius, filterFn);
    }

    findNearest(x, y, maxRadius, filterFn = null) {
      const candidates = this.queryRadius(x, y, maxRadius, filterFn);
      if (candidates.length === 0) return null;

      let best = null;
      let bestDistSq = Infinity;
      for (const ent of candidates) {
        const dSq = distSq(x, y, ent.x, ent.y);
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          best = ent;
        }
      }
      return best;
    }

    queryNearestEnemy(x, y, maxRadius, friendlyTeam, allowAir = true, allowGround = true) {
      return this.findNearest(x, y, maxRadius, (ent) => {
        if (ent.team === undefined || ent.team === friendlyTeam || ent.team === -1) return false;
        if (ent.unmanned || ent.garrisonId || ent.garrisonedIn) return false;
        const isAir = !!(ent.def && ent.def.isAir);
        if (isAir && !allowAir) return false;
        if (!isAir && !allowGround) return false;
        return true;
      });
    }
  }

  // ==========================================================================
  // 2. LocomotorSystem (Turn Rates, Inertia, Boid Separation & Air Flight)
  // ==========================================================================
  const LOCOMOTOR_PROFILES = {
    INFANTRY: {
      turnRate: 9.0,
      accel: 380,
      decel: 480,
      separationWeight: 1.15,
      canPassCliff: false
    },
    CLIFF_CLIMBER: {
      turnRate: 7.5,
      accel: 420,
      decel: 500,
      separationWeight: 1.2,
      canPassCliff: true
    },
    WHEELED: {
      turnRate: 4.8,
      accel: 260,
      decel: 320,
      separationWeight: 1.4,
      minTurnSpeedRatio: 0.25
    },
    TRACKED: {
      turnRate: 3.2,
      accel: 190,
      decel: 280,
      separationWeight: 1.5,
      pivotInPlace: true
    },
    HOVER: {
      turnRate: 5.5,
      accel: 280,
      decel: 240,
      separationWeight: 1.35,
      canCrossWater: true
    },
    HELICOPTER: {
      turnRate: 5.0,
      accel: 240,
      decel: 220,
      separationWeight: 1.6,
      isAir: true,
      hoverBob: true
    },
    AIRCRAFT: {
      turnRate: 3.6,
      accel: 320,
      decel: 260,
      separationWeight: 1.8,
      isAir: true,
      bankingFactor: 0.45
    }
  };

  function inferLocomotor(unitDef) {
    if (!unitDef) return 'WHEELED';
    if (unitDef.locomotor && LOCOMOTOR_PROFILES[unitDef.locomotor]) {
      return unitDef.locomotor;
    }

    const id = (unitDef.id || '').toUpperCase();
    const name = (unitDef.name || '').toUpperCase();
    const cat = (unitDef.category || unitDef.type || '').toUpperCase();

    if (unitDef.isAir || cat === 'AIRCRAFT') {
      if (
        name.includes('COMANCHE') ||
        name.includes('CHINOOK') ||
        name.includes('HELIX') ||
        id.includes('COMANCHE') ||
        id.includes('CHINOOK') ||
        id.includes('HELIX') ||
        unitDef.isHelicopter
      ) {
        return 'HELICOPTER';
      }
      return 'AIRCRAFT';
    }

    if (cat === 'INFANTRY' || unitDef.isInfantry) {
      if (
        unitDef.isCliffClimber ||
        name.includes('PATHFINDER') ||
        name.includes('SNIPER') ||
        name.includes('JARMEN') ||
        name.includes('HIJACKER') ||
        id.includes('PATHFINDER') ||
        id.includes('JARMEN')
      ) {
        return 'CLIFF_CLIMBER';
      }
      return 'INFANTRY';
    }

    if (unitDef.isHover || name.includes('HOVER') || id.includes('HOVER') || id.includes('COMBAT_CYCLE')) {
      return 'HOVER';
    }

    if (
      unitDef.isTracked ||
      cat === 'TANK' ||
      name.includes('TANK') ||
      name.includes('OVERLORD') ||
      name.includes('SCORPION') ||
      name.includes('CRUSADER') ||
      name.includes('PALADIN') ||
      name.includes('BATTLEMASTER') ||
      name.includes('GATTLING') ||
      name.includes('DRAGON') ||
      name.includes('INFERNO') ||
      name.includes('NUKE_CANNON')
    ) {
      return 'TRACKED';
    }

    return 'WHEELED';
  }

  function stepUnitMovement(unit, targetX, targetY, dt, spatialGrid, navGrid) {
    if (unit.empTimer > 0) return false;
    if (unit.unmanned) return false;
    if (unit.hp <= 0) return false;

    const profileKey = unit.locomotor || inferLocomotor(unit.def);
    const profile = LOCOMOTOR_PROFILES[profileKey] || LOCOMOTOR_PROFILES.WHEELED;

    let wpX = targetX;
    let wpY = targetY;

    const pathList = (unit.waypoints && unit.waypoints.length > 0) ? unit.waypoints : unit.path;
    if (pathList && pathList.length > 0) {
      const wp = pathList[0];
      const dToWp = dist(unit.x, unit.y, wp.x, wp.y);
      const wpArriveDist = Math.max(16, (unit.radius || 15) * 1.1);

      if (dToWp <= wpArriveDist) {
        pathList.shift();
        if (pathList.length > 0) {
          wpX = pathList[0].x;
          wpY = pathList[0].y;
        }
      } else {
        wpX = wp.x;
        wpY = wp.y;
      }
    }

    const distToFinal = dist(unit.x, unit.y, targetX, targetY);
    const arriveThreshold = profile.isAir ? 18 : 10;

    if (distToFinal <= arriveThreshold && (!pathList || pathList.length === 0)) {
      if (unit.currentSpeed > 0) {
        unit.currentSpeed = Math.max(0, unit.currentSpeed - profile.decel * dt);
      }
      if (unit.currentSpeed <= 4) {
        unit.currentSpeed = 0;
        return true;
      }
    }

    const desiredAngle = Math.atan2(wpY - unit.y, wpX - unit.x);
    if (unit.angle === undefined) unit.angle = desiredAngle;

    let diff = desiredAngle - unit.angle;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;

    const maxTurn = profile.turnRate * dt;
    if (Math.abs(diff) <= maxTurn) {
      unit.angle = desiredAngle;
    } else {
      unit.angle += Math.sign(diff) * maxTurn;
    }

    if (profile.bankingFactor) {
      unit.bankingAngle = clamp(diff * profile.bankingFactor, -0.45, 0.45);
    } else {
      unit.bankingAngle = 0;
    }

    if (profile.hoverBob) {
      unit.hoverTimer = (unit.hoverTimer || 0) + dt * 4.0;
      unit.hoverBob = Math.sin(unit.hoverTimer) * 3.5;
    } else {
      unit.hoverBob = 0;
    }

    const maxSpeed = unit.speed || 100;
    let targetSpeed = maxSpeed;

    if (!profile.pivotInPlace && Math.abs(diff) > 0.85) {
      const minRatio = profile.minTurnSpeedRatio || 0.3;
      targetSpeed = Math.max(maxSpeed * minRatio, maxSpeed * Math.max(0, Math.cos(diff)));
    }

    unit.currentSpeed = unit.currentSpeed || 0;
    if (unit.currentSpeed < targetSpeed) {
      unit.currentSpeed = Math.min(targetSpeed, unit.currentSpeed + profile.accel * dt);
    } else if (unit.currentSpeed > targetSpeed) {
      unit.currentSpeed = Math.max(targetSpeed, unit.currentSpeed - profile.decel * dt);
    }

    let sepX = 0;
    let sepY = 0;

    if (spatialGrid) {
      const neighborRadius = (unit.radius || 15) * 2.4;
      const neighbors = spatialGrid.queryRadius(unit.x, unit.y, neighborRadius, (other) => {
        return (
          other !== unit &&
          other.hp > 0 &&
          other.def &&
          !other.isBuilding &&
          !!other.def.isAir === !!profile.isAir
        );
      });

      const minDist = (unit.radius || 15) * 2.1;
      for (const other of neighbors) {
        const dx = unit.x - other.x;
        const dy = unit.y - other.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.001 && d < minDist) {
          const force = (minDist - d) / minDist;
          sepX += (dx / d) * force;
          sepY += (dy / d) * force;
        }
      }
    }

    const sepWeight = profile.separationWeight || 1.2;
    const sepSpeed = maxSpeed * 0.42;

    const forwardStep = unit.currentSpeed * dt;
    const vx = Math.cos(unit.angle) * forwardStep + sepX * sepWeight * sepSpeed * dt;
    const vy = Math.sin(unit.angle) * forwardStep + sepY * sepWeight * sepSpeed * dt;

    let nextX = clamp(unit.x + vx, 25, 3175);
    let nextY = clamp(unit.y + vy, 25, 3175);

    if (navGrid && typeof navGrid.isPassable === 'function' && !profile.isAir) {
      const canCliff = profile.canPassCliff;
      const canWater = profile.canCrossWater;
      if (navGrid.isPassable(nextX, nextY, canCliff, canWater)) {
        unit.x = nextX;
        unit.y = nextY;
      } else if (!navGrid.isPassable(unit.x, unit.y, canCliff, canWater)) {
        // Unit is currently trapped inside a blocked cell: never freeze sub-cell steps!
        // Guide it out toward the nearest passable cell or its movement vector.
        if (typeof navGrid.worldToCell === 'function' && typeof navGrid.findNearestPassable === 'function') {
          const curCell = navGrid.worldToCell(unit.x, unit.y);
          const escapeCell = navGrid.findNearestPassable(curCell.col, curCell.row, unit.locomotor || 'TRACKED', 6);
          const escapeWorld = navGrid.cellToWorld(escapeCell.col, escapeCell.row);
          const escAng = Math.atan2(escapeWorld.y - unit.y, escapeWorld.x - unit.x);
          const escStep = Math.max(forwardStep, (unit.speed || 90) * dt);
          unit.x = clamp(unit.x + Math.cos(escAng) * escStep, 25, 3175);
          unit.y = clamp(unit.y + Math.sin(escAng) * escStep, 25, 3175);
        } else {
          unit.x = nextX;
          unit.y = nextY;
        }
      } else {
        if (navGrid.isPassable(nextX, unit.y, canCliff, canWater)) {
          unit.x = nextX;
        } else if (navGrid.isPassable(unit.x, nextY, canCliff, canWater)) {
          unit.y = nextY;
        }
      }
    } else {
      unit.x = nextX;
      unit.y = nextY;
    }

    if (!unit.lockedTurret) {
      unit.turretAngle = unit.angle;
    }

    return false;
  }

  function updateUnitMovement(unit, dt, engine) {
    const tx = unit.targetX !== undefined ? unit.targetX : unit.x;
    const ty = unit.targetY !== undefined ? unit.targetY : unit.y;
    const spatialGrid = engine ? engine.spatialGrid : null;
    const navGrid = engine ? engine.navGrid : null;
    return stepUnitMovement(unit, tx, ty, dt, spatialGrid, navGrid);
  }

  const LocomotorSystem = {
    LOCOMOTOR_PROFILES,
    inferLocomotor,
    stepUnitMovement,
    updateUnitMovement
  };

  // ==========================================================================
  // 3. BallisticsEngine (3D Parabolic Arcs, EMP & Garrison Clearing)
  // ==========================================================================
  function isBallisticWeapon(damageType, unitDef) {
    if (
      damageType === 'ARTILLERY' ||
      damageType === 'HIGH_EXPLOSIVE' ||
      damageType === 'NUKE' ||
      damageType === 'RADIATION' ||
      damageType === 'FLAME' ||
      damageType === 'TOXIN' ||
      damageType === 'SCUD' ||
      damageType === 'MORTAR'
    ) {
      return true;
    }

    if (unitDef) {
      if (unitDef.isArtillery) return true;
      if (unitDef.weapon) {
        const w = unitDef.weapon;
        if (w.splash && w.splash >= 28) return true;
        if (w.projType === 'SHELL' || w.projType === 'NUKE_SHELL' || w.projType === 'SCUD_MISSILE') {
          return true;
        }
      }
    }

    return false;
  }

  function computeProjectileArc(proj) {
    if (!proj) return 0;

    const hasEndpoints = proj.startX !== undefined && proj.startY !== undefined && proj.tx !== undefined && proj.ty !== undefined;
    const totalDist = Math.max(1, proj.totalDist || (hasEndpoints ? dist(proj.startX, proj.startY, proj.tx, proj.ty) : 100));
    proj.totalDist = totalDist;
    const currentDist = hasEndpoints ? dist(proj.startX, proj.startY, proj.x, proj.y) : (proj.progress || 0) * totalDist;
    const t = clamp(hasEndpoints ? (currentDist / totalDist) : (proj.progress || 0), 0, 1);
    proj.progress = t;

    if (proj.peakZ === undefined) {
      if (proj.peakHeight !== undefined) {
        proj.peakZ = proj.peakHeight;
      } else if (
        proj.projType === 'SHELL' ||
        proj.projType === 'NUKE_SHELL' ||
        proj.projType === 'SCUD_MISSILE' ||
        proj.damageType === 'ARTILLERY' ||
        proj.damageType === 'HIGH_EXPLOSIVE' ||
        proj.damageType === 'EXPLOSIVE'
      ) {
        proj.peakZ = Math.min(95, Math.max(34, totalDist * 0.22));
      } else if (proj.projType === 'MISSILE') {
        proj.peakZ = Math.min(28, Math.max(10, totalDist * 0.08));
      } else {
        proj.peakZ = 0;
      }
    }
    proj.peakHeight = proj.peakZ;
    proj.isBallistic = Boolean(proj.peakZ > 0);

    proj.z = 4 * (proj.peakZ || 0) * t * (1 - t);
    return proj.z;
  }

  function computeArcElevation(peakHeight, t) {
    const clampedT = clamp(t, 0, 1);
    return 4 * (peakHeight || 0) * clampedT * (1 - clampedT);
  }

  function applySpecialHitEffects(engine, proj, target, impactX, impactY) {
    if (!engine || !proj) return;

    const x = impactX !== undefined ? impactX : (target ? target.x : proj.x);
    const y = impactY !== undefined ? impactY : (target ? target.y : proj.y);

    const isEMP =
      proj.isEMP ||
      proj.attackerDefId === 'USA_EMP_PATRIOT' ||
      (proj.weaponDef && proj.weaponDef.isEMP);

    if (isEMP) {
      const empRadius = proj.empRadius || proj.splash || 64;
      if (engine.units) {
        for (const u of engine.units) {
          if (u.hp <= 0 || u.team === proj.team) continue;
          if (dist(x, y, u.x, u.y) <= empRadius + (u.radius || 15)) {
            const cat = (u.def && (u.def.category || u.def.type)) || '';
            if (cat !== 'INFANTRY') {
              u.empTimer = Math.max(u.empTimer || 0, 6.0);
              u.currentSpeed = 0;
              if (engine.spawnFloatingText) {
                engine.spawnFloatingText(u.x, u.y - 18, '⚡ EMP DISABLED (6s)', '#38bdf8');
              }
              if (engine.spawnBurst) {
                engine.spawnBurst(u.x, u.y, '#38bdf8', 8);
              }
            }
          }
        }
      }

      if (engine.buildings) {
        for (const b of engine.buildings) {
          if (b.hp <= 0 || !b.constructed || b.team === proj.team) continue;
          if (dist(x, y, b.x, b.y) <= empRadius + (b.radius || 35)) {
            b.empTimer = Math.max(b.empTimer || 0, 6.0);
            if (engine.spawnFloatingText) {
              engine.spawnFloatingText(b.x, b.y - 24, '⚡ POWER SHORTED (6s)', '#38bdf8');
            }
          }
        }
      }
    }

    const isClearGarrison =
      proj.damageType === 'FLAME_TOXIN' ||
      proj.damageType === 'FLAME' ||
      proj.damageType === 'TOXIN' ||
      proj.isFlashbang ||
      (proj.weaponDef &&
        (proj.weaponDef.damageType === 'FLAME_TOXIN' ||
          proj.weaponDef.damageType === 'FLAME' ||
          proj.weaponDef.damageType === 'TOXIN' ||
          proj.weaponDef.clearsGarrison));

    const garrisons = (engine.garrisonBunkers || engine.garrisonStructures || []);
    if (isClearGarrison && garrisons.length > 0) {
      const clearRadius = (proj.splash || 28) + 42;

      for (const g of garrisons) {
        if (g.hp <= 0) continue;
        const occList = g.occupants || g.garrisonedUnits;
        if (!occList || occList.length === 0) continue;
        if (g.team === proj.team) continue;

        if (dist(x, y, g.x, g.y) <= clearRadius + (g.radius || 38)) {
          const prevTeam = g.team;
          const initialCount = occList.length;

          while (occList.length > 0) {
            const occupant = occList.pop();
            occupant.garrisonedIn = null;
            occupant.hp = 0;
          }

          g.team = -1;
          if (engine.spawnBurst) {
            const burstCol = proj.damageType === 'FLAME_TOXIN' ? '#22c55e' : '#f97316';
            engine.spawnBurst(g.x, g.y, burstCol, 12);
          }
          if (engine.spawnFloatingText) {
            engine.spawnFloatingText(
              g.x,
              g.y - 32,
              `GARRISON CLEARED! (${initialCount} KIA)`,
              '#ef4444'
            );
          }

          if (engine.triggerAlert && prevTeam === 0) {
            engine.triggerAlert('Our garrisoned structure was cleared by hostile ordnance!', '#ef4444');
          }

          if (engine.onStateChange) engine.onStateChange();
        }
      }
    }
  }

  const BallisticsEngine = {
    isBallisticWeapon,
    computeProjectileArc,
    computeArcElevation,
    applySpecialHitEffects
  };

  return {
    LOCOMOTOR_PROFILES,
    SpatialHashGrid,
    LocomotorSystem,
    BallisticsEngine
  };
})();
