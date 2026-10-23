// ============================================================================
// Command & Conquer: Generals – Zero Hour (macOS Clean-Room Edition)
// js/vfx.js — Phase 3: Articulated Multi-Part Unit Rigs, Persistent Decals,
//             4-Stage Construction Scaffolding & Multi-Stage Superweapon VFX
// ============================================================================

if (typeof window !== 'undefined' && !window.ZH_UNIT_MODELS && typeof require === 'function') {
  try {
    require('./unit_models.js');
  } catch (_) {}
}

window.ZH_VFX = (function () {
  'use strict';

  const MAX_DECALS = 180;

  // ==========================================================================
  // 1. Persistent Battlefield Decal System (Craters, Scorch Marks, Tread Tracks)
  // ==========================================================================
  function ensureContainers(engine) {
    if (!engine.decals) engine.decals = [];
    if (!engine.shockwaves) engine.shockwaves = [];
    if (!engine.mushroomClouds) engine.mushroomClouds = [];
    if (engine.screenFlash === undefined) engine.screenFlash = 0;
  }

  function addDecal(engine, type, x, y, radius, angle = 0, duration = 120) {
    ensureContainers(engine);
    if (type === 'TREAD' && engine.units && engine.units.length > 160 && engine.decals.length >= 60) {
      return;
    }
    if (engine.decals.length >= MAX_DECALS) {
      engine.decals[0] = engine.decals[engine.decals.length - 1];
      engine.decals.pop();
    }
    engine.decals.push({
      type, // 'CRATER' | 'SCORCH' | 'NUKE_CRATER' | 'TREAD'
      x,
      y,
      radius,
      angle,
      timer: duration,
      maxTimer: duration
    });
  }

  function addTreadMark(engine, u) {
    ensureContainers(engine);
    addDecal(engine, 'TREAD', u.x, u.y, u.radius * 0.75, u.angle, 22);
  }

  function updateVFX(engine, dt) {
    ensureContainers(engine);

    if (engine.screenFlash > 0) {
      engine.screenFlash = Math.max(0, engine.screenFlash - dt * 1.4);
    }

    // Update persistent decals
    for (let i = engine.decals.length - 1; i >= 0; i--) {
      const d = engine.decals[i];
      d.timer -= dt;
      if (d.timer <= 0) {
        engine.decals[i] = engine.decals[engine.decals.length - 1];
        engine.decals.pop();
      }
    }

    // Update shockwave rings
    for (let i = engine.shockwaves.length - 1; i >= 0; i--) {
      const sw = engine.shockwaves[i];
      sw.timer -= dt;
      sw.radius += sw.speed * dt;
      if (sw.timer <= 0) {
        engine.shockwaves.splice(i, 1);
      }
    }

    // Update Nuclear Mushroom Clouds
    for (let i = engine.mushroomClouds.length - 1; i >= 0; i--) {
      const mc = engine.mushroomClouds[i];
      mc.timer -= dt;
      mc.age += dt;
      if (mc.timer <= 0) {
        engine.mushroomClouds.splice(i, 1);
      }
    }

    const canEmitSmoke = !engine.particles || engine.particles.length < 240;

    // Update unit barrel recoil & tread mark stamping
    for (const u of engine.units) {
      if (u.recoilOffset && u.recoilOffset > 0) {
        u.recoilOffset = Math.max(0, u.recoilOffset - dt * 24);
      }
      const isAirOrDrone = Boolean(u.def.isAir || u.def.category === 'AIRCRAFT' || u.defId === 'USA_BATTLE_DRONE');
      if (isAirOrDrone && !u.unmanned && (u.empTimer || 0) <= 0) {
        u.treadPhase = ((u.treadPhase || 0) + dt * 3.2) % 1;
      }
      const isMovingState =
        (u.currentSpeed && u.currentSpeed > 2) ||
        u.state === 'MOVE' ||
        u.state === 'ATTACK_MOVE' ||
        u.state === 'BUILD' ||
        u.state === 'HARVEST' ||
        u.state === 'RETURN_SUPPLY' ||
        u.state === 'RETURN_CARGO';
      if (isMovingState) {
        const loco = u.locomotor || u.def.locomotor || (u.def.category === 'TANK' ? 'TRACKED' : 'INFANTRY');
        if (!isAirOrDrone) {
          u.treadPhase = ((u.treadPhase || 0) + dt * 2.4) % 1;
        }
        if (loco === 'TRACKED' || loco === 'WHEELED') {
          u.treadTimer = (u.treadTimer || 0) + dt;
          if (u.treadTimer >= 0.32) {
            u.treadTimer = 0;
            addTreadMark(engine, u);
          }
        }
      }
      // Emit vehicle damage smoke below 50% HP
      if (canEmitSmoke && u.hp > 0 && u.hp < u.maxHp * 0.5 && u.def.category !== 'INFANTRY') {
        if (Math.random() < (u.hp < u.maxHp * 0.25 ? 0.35 : 0.15)) {
          engine.particles.push({
            x: u.x + (Math.random() - 0.5) * u.radius,
            y: u.y + (Math.random() - 0.5) * u.radius,
            vx: (Math.random() - 0.5) * 14,
            vy: -18 - Math.random() * 16,
            r: 3 + Math.random() * 2.5,
            color: u.hp < u.maxHp * 0.25 && Math.random() < 0.45 ? '#f97316' : 'rgba(30, 41, 59, 0.78)',
            timer: 0.55,
            maxTimer: 0.55
          });
        }
      }
    }

    // Emit building damage smoke & fire below 50% HP
    for (const b of engine.buildings) {
      if (b.constructed && b.hp > 0 && b.hp < b.maxHp * 0.55) {
        const isCritical = b.hp < b.maxHp * 0.28;
        if (Math.random() < (isCritical ? 0.45 : 0.2)) {
          engine.particles.push({
            x: b.x + (Math.random() - 0.5) * b.radius * 1.1,
            y: b.y + (Math.random() - 0.5) * b.radius * 1.1,
            vx: (Math.random() - 0.5) * 18,
            vy: -24 - Math.random() * 20,
            r: 4.5 + Math.random() * 3.5,
            color: isCritical && Math.random() < 0.5 ? '#ef4444' : '#334155',
            timer: 0.7,
            maxTimer: 0.7
          });
        }
      }
    }

    // Stamp continuous scorch decals beneath active Particle Cannon beams
    for (const beam of engine.activeBeams) {
      beam.scorchAccum = (beam.scorchAccum || 0) + dt;
      if (beam.scorchAccum >= 0.18) {
        beam.scorchAccum = 0;
        addDecal(engine, 'SCORCH', beam.x, beam.y, 34, 0, 90);
      }
    }
  }

  function renderDecals(ctx, engine) {
    ensureContainers(engine);
    for (const d of engine.decals) {
      const vis = engine.isPositionVisible ? engine.isPositionVisible(d.x, d.y) : true;
      const exp = engine.isPositionExplored ? engine.isPositionExplored(d.x, d.y) : vis;
      if (!vis && !exp) continue;
      ctx.save();
      const alpha = Math.min(1, d.timer / Math.min(15, d.maxTimer));
      ctx.globalAlpha = alpha;
      ctx.translate(d.x, d.y);

      if (d.type === 'TREAD') {
        ctx.rotate(d.angle);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.36)';
        ctx.fillRect(-5, -d.radius * 0.7, 10, 3);
        ctx.fillRect(-5, d.radius * 0.7 - 3, 10, 3);
      } else if (d.type === 'SCORCH') {
        const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, d.radius);
        grad.addColorStop(0, 'rgba(9, 13, 22, 0.78)');
        grad.addColorStop(0.65, 'rgba(30, 41, 59, 0.45)');
        grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, d.radius, 0, Math.PI * 2);
        ctx.fill();
      } else if (d.type === 'CRATER' || d.type === 'NUKE_CRATER') {
        ctx.fillStyle = d.type === 'NUKE_CRATER' ? 'rgba(15, 10, 8, 0.82)' : 'rgba(15, 23, 42, 0.68)';
        ctx.beginPath();
        ctx.arc(0, 0, d.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = d.type === 'NUKE_CRATER' ? 'rgba(249, 115, 22, 0.45)' : 'rgba(71, 85, 105, 0.45)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ==========================================================================
  // 2. 4-Stage Building Construction Scaffolding & Damage Overlays
  // ==========================================================================
  function renderConstructionScaffolding(ctx, b, s) {
    const rawProg = b.buildProgress || 0;
    const ratio = rawProg <= 1.0
      ? Math.max(0, Math.min(1, rawProg))
      : Math.max(0, Math.min(1, rawProg / Math.max(1, b.def.buildTime || 10)));
    const stage = ratio < 0.25 ? 1 : ratio < 0.50 ? 2 : ratio < 0.75 ? 3 : 4;
    const half = s / 2;

    ctx.save();
    // Stage 1+: Isometric construction perimeter tape & corner pylons (translucent so Ligne-Claire sprite shines through)
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.75)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(0, -half * 0.78);
    ctx.lineTo(half * 1.12, 0);
    ctx.lineTo(0, half * 0.78);
    ctx.lineTo(-half * 1.12, 0);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    // Stage 2+: Open steel girder frame around the rising Ligne-Claire structure
    if (stage >= 2) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.lineWidth = 1.2;
      const step = Math.max(16, Math.floor(s / 3));
      for (let x = -half * 0.75; x <= half * 0.75; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, -half * 0.55);
        ctx.lineTo(x, half * 0.45);
        ctx.stroke();
      }
    }

    // Stage 3+: Yellow isometric construction crane boom
    if (stage >= 3) {
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-s * 0.38, s * 0.28);
      ctx.lineTo(-s * 0.38, -s * 0.42);
      ctx.lineTo(s * 0.32, -s * 0.52);
      ctx.stroke();
    }

    // Stage 4: Welding arc spark flash
    if (stage >= 3 && Math.random() < 0.55) {
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc((Math.random() - 0.5) * s * 0.55, (Math.random() - 0.5) * s * 0.45, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // ==========================================================================
  // 2b. Phase 1 (6.3) China Tactical Zoom Readability Pass (High-contrast silhouette & role emblem)
  function renderChinaTacticalReadabilityPass(ctx, u, faction, options) {
    if (!u || !u.defId || !u.defId.startsWith('CHINA_')) return;
    if (options && options.isStudio) return;
    const zoom = (options && options.zoom) || 1;
    if (zoom > 1.35) return; // Close zoom uses full unassisted 3D CAD detail

    const r = u.radius || 14;
    ctx.save();

    // 1. High-contrast dark tactical separation base plate so red/olive chassis pop on all 3 biomes
    ctx.strokeStyle = 'rgba(8, 12, 20, 0.85)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    if (typeof ctx.ellipse === 'function') {
      ctx.ellipse(0, 1, r * 1.02, r * 0.78, u.angle || 0, 0, Math.PI * 2);
    } else {
      ctx.arc(0, 1, r * 0.9, 0, Math.PI * 2);
    }
    ctx.stroke();

    // 2. Crimson & Gold PLA Tactical Rim Accent
    ctx.strokeStyle = u.unmanned ? '#94a3b8' : '#ef4444';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    if (typeof ctx.ellipse === 'function') {
      ctx.ellipse(0, 0, r * 0.94, r * 0.70, u.angle || 0, 0, Math.PI * 2);
    } else {
      ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2);
    }
    ctx.stroke();

    // 3. Instant 1-Second Role Identifier Silhouette Badge at Tactical Zoom
    const id = u.defId;
    ctx.rotate(u.turretAngle !== undefined ? u.turretAngle : (u.angle || 0));
    if (id.includes('OVERLORD')) {
      // Twin Gold Heavy Command Stripes on Overlord / Emperor Turret
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(-r * 0.35, -5, r * 0.55, 2.2);
      ctx.fillRect(-r * 0.35, 2.8, r * 0.55, 2.2);
    } else if (id.includes('GATTLING')) {
      // High-visibility Gold Rotary Barrel Tip Marker
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(r * 0.65, 0, 2.6, 0, Math.PI * 2);
      ctx.fill();
    } else if (id.includes('DRAGON') || id.includes('INFERNO')) {
      // Flame/Napalm Orange Fuel Core Indicator
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(-r * 0.22, 0, 3.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (id.includes('NUKE_CANNON')) {
      // Bright Atomic Hazard Core Ring
      ctx.strokeStyle = '#a3e635';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 3. Articulated Multi-Part 2.5D Unit Rig (Chassis + Turret + Recoiling Barrels)
  // ==========================================================================
  function renderArticulatedUnit(ctx, u, faction, options) {
    if ((!options || !options.forceLegacy) && window.ZH_UNIT_MODELS && window.ZH_UNIT_MODELS.renderUnitIfBespoke) {
      if (window.ZH_UNIT_MODELS.renderUnitIfBespoke(ctx, u, faction, options)) {
        renderChinaTacticalReadabilityPass(ctx, u, faction, options);
        return;
      }
    }

    const r = u.radius;
    const recoil = u.recoilOffset || 0;
    const hullColor = u.unmanned ? '#64748b' : faction.color;
    const accentColor = u.unmanned ? '#cbd5e1' : faction.accent;

    // 1. Ground Shadow (offset by altitude)
    const shadowOff = u.def.isAir ? 18 : 4;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
    ctx.beginPath();
    ctx.ellipse(shadowOff, shadowOff + 2, r * 0.95, r * 0.72, u.angle || 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Articulated Hull / Chassis Pass (Rotated by u.angle)
    ctx.save();
    ctx.rotate(u.angle || 0);

    if (u.def.category === 'INFANTRY') {
      // Infantry Boots/Shoulders + Helmet + Weapon
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(-r * 0.5, -r * 0.75, r, r * 1.5);
      ctx.fillStyle = hullColor;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      // Rifle / RPG barrel with recoil
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(2 - recoil * 0.4, 2);
      ctx.lineTo(r + 6 - recoil * 0.4, 2);
      ctx.stroke();
    } else if (u.def.category === 'TANK') {
      // Caterpillar Treads (Left & Right)
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-r * 1.05, -r * 0.92, r * 2.1, r * 0.34);
      ctx.fillRect(-r * 1.05, r * 0.58, r * 2.1, r * 0.34);
      // Tread grousers
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      for (let tx = -r * 0.9; tx <= r * 0.9; tx += 5) {
        ctx.beginPath();
        ctx.moveTo(tx, -r * 0.92);
        ctx.lineTo(tx, -r * 0.58);
        ctx.moveTo(tx, r * 0.58);
        ctx.lineTo(tx, r * 0.92);
        ctx.stroke();
      }
      // Armored glacis hull
      ctx.fillStyle = hullColor;
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 1.8;
      ctx.fillRect(-r * 0.92, -r * 0.64, r * 1.84, r * 1.28);
      ctx.strokeRect(-r * 0.92, -r * 0.64, r * 1.84, r * 1.28);
      // Front reactive armor chevron
      ctx.fillStyle = accentColor;
      ctx.fillRect(r * 0.55, -r * 0.45, 3, r * 0.9);
      // Dozer blade for Dozers
      if (u.def.isBuilder) {
        ctx.fillStyle = '#eab308';
        ctx.fillRect(r * 0.88, -r * 0.85, 5, r * 1.7);
      }
    } else if (u.def.category === 'LIGHT_VEHICLE') {
      // 4 Tire Wheels
      ctx.fillStyle = '#090d16';
      ctx.fillRect(-r * 0.8, -r * 0.85, r * 0.55, 4);
      ctx.fillRect(r * 0.25, -r * 0.85, r * 0.55, 4);
      ctx.fillRect(-r * 0.8, r * 0.85 - 4, r * 0.55, 4);
      ctx.fillRect(r * 0.25, r * 0.85 - 4, r * 0.55, 4);
      // Wheeled body
      ctx.fillStyle = hullColor;
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 1.6;
      ctx.fillRect(-r * 0.9, -r * 0.65, r * 1.8, r * 1.3);
      ctx.strokeRect(-r * 0.9, -r * 0.65, r * 1.8, r * 1.3);
      // Armored windshield
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(r * 0.2, -r * 0.45, r * 0.35, r * 0.9);
    } else if (u.def.category === 'AIRCRAFT') {
      const isHeli = (u.def.locomotor === 'HELICOPTER') ||
        u.defId.includes('COMANCHE') ||
        u.defId.includes('CHINOOK');
      if (isHeli) {
        // Helicopter fuselage + tail boom
        ctx.fillStyle = hullColor;
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.95, r * 0.58, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Spinning Rotor Disc Blur + Cross Blades
        const rotorAng = (performance.now() * 0.018) % (Math.PI * 2);
        ctx.save();
        ctx.rotate(rotorAng);
        ctx.strokeStyle = 'rgba(226, 232, 240, 0.75)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-r * 1.25, 0);
        ctx.lineTo(r * 1.25, 0);
        ctx.moveTo(0, -r * 1.25);
        ctx.lineTo(0, r * 1.25);
        ctx.stroke();
        ctx.restore();
      } else {
        // Swept-wing Supersonic Jet (Raptor / King Raptor / Aurora / MiG)
        ctx.fillStyle = hullColor;
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(r * 1.25, 0);
        ctx.lineTo(-r * 0.85, r * 1.05);
        ctx.lineTo(-r * 0.45, 0);
        ctx.lineTo(-r * 0.85, -r * 1.05);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Twin afterburner glow
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(-r * 0.65, 0, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // 3. Articulated Turret & Recoiling Barrels Pass (Rotated by u.turretAngle)
    if (u.def.category === 'TANK' || (u.def.category === 'LIGHT_VEHICLE' && u.def.weapon)) {
      ctx.save();
      ctx.rotate(u.turretAngle !== undefined ? u.turretAngle : (u.angle || 0));

      const isDualBarrel =
        u.defId === 'CHINA_OVERLORD' ||
        u.defId === 'CHINA_EMPEROR_OVERLORD' ||
        u.defId === 'GLA_MARAUDER' ||
        u.defId === 'GLA_QUAD_CANNON' ||
        u.defId === 'CHINA_GATTLING_TANK';

      const isMissileArtillery =
        u.defId === 'USA_TOMAHAWK' ||
        u.defId === 'GLA_SCUD_LAUNCHER' ||
        u.defId === 'CHINA_NUKE_CANNON' ||
        u.defId === 'CHINA_INFERNO_CANNON' ||
        u.defId === 'GLA_ROCKET_BUGGY';

      // Recoiling Weapon Barrels
      ctx.strokeStyle = u.def.weapon && u.def.weapon.projType === 'LASER' ? '#38bdf8' : '#e2e8f0';
      ctx.lineWidth = isDualBarrel ? 2.6 : 3.4;

      if (isDualBarrel) {
        ctx.beginPath();
        ctx.moveTo(0, -3.5);
        ctx.lineTo(r + 8 - recoil, -3.5);
        ctx.moveTo(0, 3.5);
        ctx.lineTo(r + 8 - recoil * 0.6, 3.5);
        ctx.stroke();
      } else if (isMissileArtillery) {
        // Elevated Missile / Warhead Rail
        ctx.fillStyle = '#fde047';
        ctx.fillRect(-r * 0.3 - recoil, -4, r * 1.35, 8);
      } else if (u.def.weapon) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(r + 7 - recoil, 0);
        ctx.stroke();
      }

      // Turret Cupola
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.48, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Overlord / Emperor Speaker Tower or Gatling attachment
      if (u.hasSpeakerTower || u.def.isPropagandaCarrier) {
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(-r * 0.25, 0, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      if (u.hasGatlingCannon) {
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.arc(r * 0.2, 0, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  // ==========================================================================
  // 4. Multi-Stage Superweapon Spectacle (Nuke Cloud, Shockwaves, Particle Lens)
  // ==========================================================================
  function triggerSuperweaponSpectacle(engine, type, x, y) {
    ensureContainers(engine);

    if (type === 'PARTICLE_CANNON') {
      addDecal(engine, 'SCORCH', x, y, 65, 0, 140);
      engine.shockwaves.push({
        x,
        y,
        radius: 15,
        speed: 220,
        color: '#38bdf8',
        timer: 0.9,
        maxTimer: 0.9
      });
    } else if (type === 'NUCLEAR_MISSILE') {
      engine.screenFlash = 0.85;
      addDecal(engine, 'NUKE_CRATER', x, y, 165, 0, 180);
      // Dual supersonic shockwave rings
      engine.shockwaves.push({
        x,
        y,
        radius: 20,
        speed: 360,
        color: '#fde047',
        timer: 1.1,
        maxTimer: 1.1
      });
      engine.shockwaves.push({
        x,
        y,
        radius: 10,
        speed: 240,
        color: '#ef4444',
        timer: 1.4,
        maxTimer: 1.4
      });
      // Rising Thermo-Nuclear Mushroom Cloud
      engine.mushroomClouds.push({
        x,
        y,
        age: 0,
        timer: 6.5,
        maxTimer: 6.5
      });
    } else if (type === 'SCUD_STORM') {
      addDecal(engine, 'CRATER', x, y, 110, 0, 150);
      engine.shockwaves.push({
        x,
        y,
        radius: 18,
        speed: 260,
        color: '#84cc16',
        timer: 1.0,
        maxTimer: 1.0
      });
    }
  }

  function renderSuperweaponSpectacle(ctx, engine) {
    ensureContainers(engine);

    // Expanding supersonic shockwave rings
    for (const sw of engine.shockwaves) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, sw.timer / sw.maxTimer);
      ctx.strokeStyle = sw.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Multi-layered rising Nuclear Mushroom Clouds
    for (const mc of engine.mushroomClouds) {
      ctx.save();
      const alpha = Math.min(1, mc.timer / 2.0);
      ctx.globalAlpha = alpha;
      const lift = Math.min(110, mc.age * 28);
      const capRadius = Math.min(95, 32 + mc.age * 18);

      // Base thermal skirt
      ctx.fillStyle = 'rgba(249, 115, 22, 0.38)';
      ctx.beginPath();
      ctx.ellipse(mc.x, mc.y, capRadius * 1.1, capRadius * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();

      // Rising fiery stem column
      const stemGrad = ctx.createLinearGradient(mc.x, mc.y, mc.x, mc.y - lift);
      stemGrad.addColorStop(0, 'rgba(69, 26, 3, 0.85)');
      stemGrad.addColorStop(1, 'rgba(249, 115, 22, 0.9)');
      ctx.fillStyle = stemGrad;
      ctx.fillRect(mc.x - 22, mc.y - lift, 44, lift);

      // Mushroom Cap (outer dark smoke + inner incandescent core)
      ctx.fillStyle = 'rgba(28, 25, 23, 0.88)';
      ctx.beginPath();
      ctx.ellipse(mc.x, mc.y - lift, capRadius, capRadius * 0.68, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(251, 146, 60, 0.75)';
      ctx.beginPath();
      ctx.ellipse(mc.x, mc.y - lift + 6, capRadius * 0.72, capRadius * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // =========================================================================
  // 5. LIGNE-CLAIRE ISOMETRIC MILITARY BUILDING SPRITES & 60 FPS ANIMATIONS
  //    Covers all 31 military structures: USA (10), China (12), GLA (9)
  // =========================================================================
  const LIGNE_CLAIRE_BUILDING_IDS = [
    // USA (10)
    'USA_COMMAND_CENTER', 'USA_REACTOR', 'USA_SUPPLY_CENTER', 'USA_BARRACKS', 'USA_WAR_FACTORY',
    'USA_AIRFIELD', 'USA_STRATEGY_CENTER', 'USA_SUPPLY_DROP_ZONE', 'USA_PATRIOT', 'USA_PARTICLE_CANNON',
    // China (12)
    'CHINA_COMMAND_CENTER', 'CHINA_REACTOR', 'CHINA_SUPPLY_CENTER', 'CHINA_BARRACKS', 'CHINA_WAR_FACTORY',
    'CHINA_AIRFIELD', 'CHINA_PROPAGANDA_CENTER', 'CHINA_INTERNET_CENTER', 'CHINA_GATTLING_CANNON',
    'CHINA_BUNKER', 'CHINA_SPEAKER_TOWER', 'CHINA_NUCLEAR_SILO',
    // GLA (9)
    'GLA_COMMAND_CENTER', 'GLA_SUPPLY_STASH', 'GLA_BARRACKS', 'GLA_ARMS_DEALER', 'GLA_PALACE',
    'GLA_BLACK_MARKET', 'GLA_TUNNEL_NETWORK', 'GLA_STINGER_SITE', 'GLA_SCUD_STORM'
  ];

  const buildingSpriteCache = {};
  let buildingSpritesInitialized = false;

  function ensureBuildingSpritesLoaded() {
    if (buildingSpritesInitialized || typeof Image === 'undefined') return;
    buildingSpritesInitialized = true;
    for (const id of LIGNE_CLAIRE_BUILDING_IDS) {
      const img = new Image();
      img.src = `assets/diorama/buildings/${id.toLowerCase()}.png`;
      buildingSpriteCache[id] = img;
    }
  }

  function renderLigneClaireBuildingSubFX(ctx, b, s, t, col) {
    const id = b.def.id;
    const INK = '#2b241f';

    switch (id) {
      // ==================== USA (10) ====================
      case 'USA_COMMAND_CENTER': {
        // Rotating rooftop radar dish + mast beacon
        const rx = -s * 0.16, ry = -s * 0.42;
        ctx.save();
        ctx.translate(rx, ry);
        ctx.rotate(t * 1.9);
        ctx.fillStyle = '#e2e8f0';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 0.11, s * 0.055, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        const blink = 0.5 + 0.5 * Math.sin(t * 7);
        ctx.fillStyle = `rgba(239, 68, 68, ${0.4 + 0.6 * blink})`;
        ctx.beginPath();
        ctx.arc(s * 0.14, -s * 0.54, 3.2, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'USA_REACTOR': {
        // Rising cyan fusion plasma rings
        for (let i = 0; i < 3; i++) {
          const phase = (t * 1.3 + i * 0.33) % 1;
          const ry = s * 0.08 - phase * s * 0.48;
          const alpha = Math.sin(phase * Math.PI);
          ctx.strokeStyle = `rgba(56, 189, 248, ${0.85 * alpha})`;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.ellipse(0, ry, s * 0.18, s * 0.08, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      }
      case 'USA_SUPPLY_CENTER': {
        // Spinning Chinook supply rotor disc above helipad
        const hx = s * 0.24, hy = -s * 0.18 + Math.sin(t * 4) * 3;
        ctx.save();
        ctx.translate(hx, hy);
        ctx.strokeStyle = 'rgba(226, 232, 240, 0.65)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 0.18, s * 0.09, 0, 0, Math.PI * 2);
        ctx.stroke();
        for (let bIdx = 0; bIdx < 3; bIdx++) {
          const ang = t * 18 + (bIdx * Math.PI * 2) / 3;
          ctx.strokeStyle = INK;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(ang) * s * 0.17, Math.sin(ang) * s * 0.085);
          ctx.stroke();
        }
        ctx.restore();
        break;
      }
      case 'USA_BARRACKS': {
        const pulse = 0.5 + 0.5 * Math.sin(t * 5);
        ctx.fillStyle = `rgba(56, 189, 248, ${0.35 + 0.45 * pulse})`;
        ctx.beginPath();
        ctx.arc(-s * 0.08, -s * 0.12, 4.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'USA_WAR_FACTORY': {
        // Welding arc flashes + exhaust smoke puffs
        if (Math.sin(t * 23) > 0.45) {
          ctx.fillStyle = '#38bdf8';
          ctx.beginPath();
          ctx.arc(s * 0.1, s * 0.12, 4.5, 0, Math.PI * 2);
          ctx.fill();
        }
        for (let i = 0; i < 2; i++) {
          const p = (t * 0.9 + i * 0.5) % 1;
          ctx.fillStyle = `rgba(226, 232, 240, ${(1 - p) * 0.55})`;
          ctx.beginPath();
          ctx.arc(-s * 0.18 + p * 8, -s * 0.42 - p * 18, 4 + p * 5, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'USA_AIRFIELD': {
        // Rotating ATC radar bar
        ctx.save();
        ctx.translate(-s * 0.18, -s * 0.42);
        ctx.rotate(t * 2.6);
        ctx.fillStyle = '#f8fafc';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.5;
        ctx.fillRect(-s * 0.1, -2, s * 0.2, 4);
        ctx.strokeRect(-s * 0.1, -2, s * 0.2, 4);
        ctx.restore();
        break;
      }
      case 'USA_STRATEGY_CENTER': {
        // Rotating satellite dish + Battle Plan aura ring
        const modeCol = b.strategyMode === 'BOMBARDMENT' ? '#ef4444'
          : (b.strategyMode === 'HOLD_THE_LINE' ? '#22c55e' : '#38bdf8');
        const ringP = (t * 0.65) % 1;
        ctx.strokeStyle = modeCol;
        ctx.globalAlpha = (1 - ringP) * 0.65;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, s * 0.05, s * (0.35 + ringP * 0.45), s * (0.18 + ringP * 0.22), 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        break;
      }
      case 'USA_SUPPLY_DROP_ZONE': {
        // Blinking drop-pad target strobes
        for (let i = 0; i < 4; i++) {
          const ang = (i * Math.PI) / 2 + Math.PI / 4;
          const active = Math.floor(t * 6) % 4 === i;
          ctx.fillStyle = active ? '#38bdf8' : '#fde047';
          ctx.beginPath();
          ctx.arc(Math.cos(ang) * s * 0.28, Math.sin(ang) * s * 0.14 + s * 0.08, active ? 3.5 : 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'USA_PATRIOT': {
        // Rotating phased-array tracking radar + turret orientation indicator
        ctx.save();
        ctx.translate(0, -s * 0.12);
        ctx.rotate(b.turretAngle || t * 1.2);
        ctx.fillStyle = '#475569';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.6;
        ctx.fillRect(0, -4, s * 0.34, 8);
        ctx.strokeRect(0, -4, s * 0.34, 8);
        ctx.restore();
        break;
      }
      case 'USA_PARTICLE_CANNON': {
        // Pulsing cyan core + capacitor energy rings
        const glow = 0.5 + 0.5 * Math.sin(t * 6);
        ctx.fillStyle = `rgba(56, 189, 248, ${0.45 + 0.45 * glow})`;
        ctx.beginPath();
        ctx.arc(0, -s * 0.24, 6 + glow * 4, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      // ==================== CHINA (12) ====================
      case 'CHINA_COMMAND_CENTER': {
        // Rotating dual radar dish + glowing red/gold PLA star pulse
        ctx.save();
        ctx.translate(s * 0.16, -s * 0.38);
        ctx.rotate(t * 2.0);
        ctx.fillStyle = '#e2e8f0';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 0.1, s * 0.05, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        const starPulse = 0.5 + 0.5 * Math.sin(t * 5);
        ctx.fillStyle = `rgba(250, 204, 21, ${0.5 + 0.5 * starPulse})`;
        ctx.beginPath();
        ctx.arc(0, -s * 0.16, 4, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'CHINA_REACTOR': {
        // Rising cel-shaded cooling tower steam puffs + glowing nuclear green core
        for (let i = 0; i < 3; i++) {
          const p = (t * 0.75 + i * 0.33) % 1;
          const sx = -s * 0.12 + Math.sin(t * 2 + i) * 4;
          const sy = -s * 0.34 - p * s * 0.32;
          const rad = (5 + p * 8);
          ctx.fillStyle = `rgba(248, 250, 252, ${(1 - p) * 0.75})`;
          ctx.strokeStyle = `rgba(43, 36, 31, ${(1 - p) * 0.5})`;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(sx, sy, rad, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        const gPulse = 0.5 + 0.5 * Math.sin(t * 6);
        ctx.fillStyle = `rgba(74, 222, 128, ${0.4 + 0.45 * gPulse})`;
        ctx.beginPath();
        ctx.arc(s * 0.16, -s * 0.04, 5 + gPulse * 3, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'CHINA_SUPPLY_CENTER': {
        // Reciprocating gantry crane trolley + red dock strobe
        const cx = Math.sin(t * 1.8) * s * 0.16;
        ctx.fillStyle = '#facc15';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.5;
        ctx.fillRect(cx - 5, -s * 0.18, 10, 6);
        ctx.strokeRect(cx - 5, -s * 0.18, 10, 6);
        break;
      }
      case 'CHINA_BARRACKS': {
        const star = 0.5 + 0.5 * Math.sin(t * 4.5);
        ctx.fillStyle = `rgba(250, 204, 21, ${0.45 + 0.5 * star})`;
        ctx.beginPath();
        ctx.arc(0, -s * 0.18, 3.8, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'CHINA_WAR_FACTORY': {
        // Twin smokestack industrial smoke puffs + welding sparks
        for (let i = 0; i < 2; i++) {
          const p = (t * 0.85 + i * 0.5) % 1;
          ctx.fillStyle = `rgba(203, 213, 225, ${(1 - p) * 0.65})`;
          ctx.beginPath();
          ctx.arc(-s * 0.2 + i * 8, -s * 0.42 - p * 20, 4.5 + p * 5, 0, Math.PI * 2);
          ctx.fill();
        }
        if (Math.sin(t * 21) > 0.4) {
          ctx.fillStyle = '#fde047';
          ctx.beginPath();
          ctx.arc(s * 0.08, s * 0.14, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'CHINA_AIRFIELD': {
        // Rotating ATC radar bar
        ctx.save();
        ctx.translate(s * 0.22, -s * 0.38);
        ctx.rotate(t * 2.5);
        ctx.fillStyle = '#ef4444';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.4;
        ctx.fillRect(-s * 0.09, -2, s * 0.18, 4);
        ctx.strokeRect(-s * 0.09, -2, s * 0.18, 4);
        ctx.restore();
        break;
      }
      case 'CHINA_PROPAGANDA_CENTER': {
        // Expanding crimson/gold broadcast waves from rooftop antenna
        for (let i = 0; i < 2; i++) {
          const p = (t * 0.75 + i * 0.5) % 1;
          ctx.strokeStyle = `rgba(239, 68, 68, ${(1 - p) * 0.75})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, -s * 0.44, 6 + p * s * 0.35, 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      }
      case 'CHINA_INTERNET_CENTER': {
        // Rotating oversized rooftop satellite dish + green cyber telemetry LEDs
        ctx.save();
        ctx.translate(0, -s * 0.34);
        ctx.rotate(Math.sin(t * 1.1) * 0.65);
        ctx.fillStyle = '#f8fafc';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 0.18, s * 0.09, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'CHINA_GATTLING_CANNON': {
        // Swiveling dual 6-barrel Gatling barrels oriented to b.turretAngle
        ctx.save();
        ctx.translate(0, -s * 0.14);
        ctx.rotate(b.turretAngle || 0);
        ctx.fillStyle = '#475569';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.5;
        ctx.fillRect(2, -7, s * 0.36, 4.5);
        ctx.strokeRect(2, -7, s * 0.36, 4.5);
        ctx.fillRect(2, 2.5, s * 0.36, 4.5);
        ctx.strokeRect(2, 2.5, s * 0.36, 4.5);
        ctx.restore();
        break;
      }
      case 'CHINA_BUNKER': {
        // Garrisoned muzzle flashes / periscope glint
        const garCount = b.garrison ? b.garrison.length : 0;
        if (garCount > 0) {
          for (let i = 0; i < garCount; i++) {
            ctx.fillStyle = '#facc15';
            ctx.strokeStyle = INK;
            ctx.lineWidth = 1;
            ctx.fillRect(-s * 0.24 + i * 7, -s * 0.36, 5, 5);
            ctx.strokeRect(-s * 0.24 + i * 7, -s * 0.36, 5, 5);
          }
        }
        break;
      }
      case 'CHINA_SPEAKER_TOWER': {
        // Concentric crimson & gold propaganda soundwave rings
        for (let i = 0; i < 2; i++) {
          const p = (t * 0.9 + i * 0.5) % 1;
          ctx.strokeStyle = i % 2 === 0
            ? `rgba(239, 68, 68, ${(1 - p) * 0.85})`
            : `rgba(250, 204, 21, ${(1 - p) * 0.85})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, -s * 0.44, 5 + p * s * 0.45, 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      }
      case 'CHINA_NUCLEAR_SILO': {
        // Glowing green radiation core + flashing red/yellow ICBM hazard beacons
        const radPulse = 0.5 + 0.5 * Math.sin(t * 5.5);
        ctx.fillStyle = `rgba(74, 222, 128, ${0.35 + 0.45 * radPulse})`;
        ctx.beginPath();
        ctx.arc(0, -s * 0.08, 7 + radPulse * 5, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      // ==================== GLA (9) ====================
      case 'GLA_COMMAND_CENTER': {
        // Rotating improvised radar dish + amber mast light
        ctx.save();
        ctx.translate(-s * 0.14, -s * 0.38);
        ctx.rotate(t * 1.7);
        ctx.fillStyle = '#d6d3d1';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 0.1, s * 0.05, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'GLA_SUPPLY_STASH': {
        // Rising green toxin vapor bubbles from stash drums
        for (let i = 0; i < 2; i++) {
          const p = (t * 0.8 + i * 0.5) % 1;
          ctx.fillStyle = `rgba(74, 222, 128, ${(1 - p) * 0.7})`;
          ctx.beginPath();
          ctx.arc(s * 0.22 + (i - 0.5) * 6, s * 0.05 - p * 16, 2.5 + p * 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'GLA_BARRACKS': {
        // Watchtower spotlight sweep
        const ang = Math.sin(t * 1.6) * 0.55 + Math.PI * 0.35;
        ctx.save();
        ctx.translate(-s * 0.18, -s * 0.36);
        ctx.rotate(ang);
        ctx.fillStyle = 'rgba(253, 224, 71, 0.22)';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(s * 0.38, -8);
        ctx.lineTo(s * 0.38, 8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'GLA_ARMS_DEALER': {
        // Diesel exhaust puffs + welding arc flash
        for (let i = 0; i < 2; i++) {
          const p = (t * 0.95 + i * 0.5) % 1;
          ctx.fillStyle = `rgba(168, 162, 158, ${(1 - p) * 0.6})`;
          ctx.beginPath();
          ctx.arc(s * 0.22, -s * 0.36 - p * 18, 4 + p * 4.5, 0, Math.PI * 2);
          ctx.fill();
        }
        if (Math.sin(t * 19) > 0.45) {
          ctx.fillStyle = '#fde047';
          ctx.beginPath();
          ctx.arc(-s * 0.05, s * 0.12, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'GLA_PALACE': {
        // Dome command beacon + garrison pips
        const garCount = b.garrison ? b.garrison.length : 0;
        if (garCount > 0) {
          for (let i = 0; i < garCount; i++) {
            ctx.fillStyle = '#4ade80';
            ctx.strokeStyle = INK;
            ctx.lineWidth = 1;
            ctx.fillRect(-s * 0.22 + i * 7, -s * 0.44, 5, 5);
            ctx.strokeRect(-s * 0.22 + i * 7, -s * 0.44, 5, 5);
          }
        }
        break;
      }
      case 'GLA_BLACK_MARKET': {
        // Rotating camouflaged satellite dish + green anthrax drum glow
        ctx.save();
        ctx.translate(-s * 0.15, -s * 0.34);
        ctx.rotate(Math.sin(t * 1.4) * 0.6);
        ctx.fillStyle = '#a3b18a';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 0.11, s * 0.055, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'GLA_TUNNEL_NETWORK': {
        // Swiveling twin-barrel machine-gun turret
        ctx.save();
        ctx.translate(0, -s * 0.16);
        ctx.rotate(b.turretAngle || 0);
        ctx.fillStyle = '#57534e';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.5;
        ctx.fillRect(0, -5, s * 0.34, 3.5);
        ctx.strokeRect(0, -5, s * 0.34, 3.5);
        ctx.fillRect(0, 1.5, s * 0.34, 3.5);
        ctx.strokeRect(0, 1.5, s * 0.34, 3.5);
        ctx.restore();
        break;
      }
      case 'GLA_STINGER_SITE': {
        // Swiveling Stinger missile launcher rails
        ctx.save();
        ctx.translate(0, -s * 0.12);
        ctx.rotate(b.turretAngle || 0);
        ctx.fillStyle = '#65a30d';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.5;
        ctx.fillRect(-4, -6, s * 0.32, 12);
        ctx.strokeRect(-4, -6, s * 0.32, 12);
        ctx.restore();
        break;
      }
      case 'GLA_SCUD_STORM': {
        // Bubbling green anthrax warhead glow + toxic vapor puffs
        for (let i = 0; i < 3; i++) {
          const p = (t * 0.7 + i * 0.33) % 1;
          ctx.fillStyle = `rgba(74, 222, 128, ${(1 - p) * 0.65})`;
          ctx.beginPath();
          ctx.arc((i - 1) * s * 0.16, -s * 0.28 - p * 18, 3.5 + p * 4, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
    }
  }

  function renderLigneClaireBuilding(ctx, b, team, gameTime) {
    const s = b.def.size;
    const half = s / 2;
    const col = team ? team.faction.color : '#38bdf8';
    const t = gameTime || 0;
    const INK = '#2b241f';

    // 1. Primary path: Deep-Engineered 3D Ligne-Claire Architectural CAD Rig (when available & not in 2D sprite mode)
    if (
      typeof window !== 'undefined' &&
      window.ZH_UNIT_MODELS &&
      typeof window.ZH_UNIT_MODELS.renderBuildingIfBespoke === 'function'
    ) {
      ctx.save();
      ctx.translate(b.x, b.y);
      const rendered3D = window.ZH_UNIT_MODELS.renderBuildingIfBespoke(ctx, b, team, t);
      if (rendered3D) {
        if (b.constructed !== false) {
          const hpRatio = b.hp / b.maxHp;
          if (hpRatio < 0.65) {
            const smokeCount = hpRatio < 0.35 ? 3 : 2;
            for (let i = 0; i < smokeCount; i++) {
              const p = (t * 0.9 + i * 0.33) % 1;
              const sx = (i - 0.5) * s * 0.22 + Math.sin(t * 3 + i) * 4;
              const sy = -s * 0.1 - p * s * 0.42;
              ctx.fillStyle = `rgba(43, 36, 31, ${(1 - p) * 0.7})`;
              ctx.beginPath();
              ctx.arc(sx, sy, 4 + p * 6, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
        ctx.restore();
        return true;
      }
      ctx.restore();
    }

    ensureBuildingSpritesLoaded();
    const img = buildingSpriteCache[b.def.id];
    if (!img || !img.complete || img.naturalWidth === 0) {
      return false; // Let caller fall back while loading
    }

    ctx.save();
    ctx.translate(b.x, b.y);

    // 1. Isometric Ligne-Claire ground shadow + warm concrete compound plinth
    ctx.fillStyle = 'rgba(20, 17, 14, 0.42)';
    ctx.beginPath();
    ctx.ellipse(5, s * 0.14, s * 0.76, s * 0.40, 0, 0, Math.PI * 2);
    ctx.fill();

    // Isometric concrete compound foundation pad so #2b241f ink outlines pop crisply on dark terrain
    const padW = half * 1.18;
    const padH = half * 0.62;
    ctx.fillStyle = '#bfb39c';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, -padH);
    ctx.lineTo(padW, 0);
    ctx.lineTo(0, padH);
    ctx.lineTo(-padW, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Crisp faction accent ring under the building footprint
    ctx.strokeStyle = col;
    ctx.lineWidth = 2.4;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(0, -padH * 0.90);
    ctx.lineTo(padW * 0.90, 0);
    ctx.lineTo(0, padH * 0.90);
    ctx.lineTo(-padW * 0.90, 0);
    ctx.closePath();
    ctx.stroke();
    ctx.globalAlpha = 1;

    // 2. Compute sprite dimensions preserving aspect ratio
    const drawW = s * 1.68;
    const aspect = img.naturalHeight / img.naturalWidth;
    const drawH = drawW * aspect;
    const drawX = -drawW / 2;
    const drawY = -drawH * 0.58;

    if (!b.constructed) {
      // Rising bottom-to-top construction reveal
      const prog = Math.max(0.22, Math.min(1, b.buildProgress || 0));
      const visH = drawH * prog;
      ctx.save();
      ctx.beginPath();
      ctx.rect(drawX - 6, drawY + (drawH - visH), drawW + 12, visH + 10);
      ctx.clip();
      ctx.globalAlpha = 0.92;
      ctx.drawImage(img, drawX, drawY + (1 - prog) * 12, drawW, drawH);
      ctx.restore();
    } else {
      ctx.drawImage(img, drawX, drawY, drawW, drawH);

      // 3. 60 FPS Ligne-Claire Procedural Sub-Animations (when powered & active)
      const isDisabled = (b.disabledTimer > 0) || (b.empTimer > 0) || (team && team.isLowPower && !b.def.powerBonus);
      if (!isDisabled) {
        renderLigneClaireBuildingSubFX(ctx, b, s, t, col);
      }

      // 4. Cel-Shaded Damage Smoke & Fire if heavily damaged
      const hpRatio = b.hp / b.maxHp;
      if (hpRatio < 0.65) {
        const smokeCount = hpRatio < 0.35 ? 3 : 2;
        for (let i = 0; i < smokeCount; i++) {
          const p = (t * 0.9 + i * 0.33) % 1;
          const sx = (i - 0.5) * s * 0.22 + Math.sin(t * 3 + i) * 4;
          const sy = -s * 0.1 - p * s * 0.42;
          ctx.fillStyle = `rgba(43, 36, 31, ${(1 - p) * 0.7})`;
          ctx.beginPath();
          ctx.arc(sx, sy, 4 + p * 6, 0, Math.PI * 2);
          ctx.fill();
        }
        if (hpRatio < 0.35) {
          const flick = 0.6 + 0.4 * Math.sin(t * 16);
          ctx.fillStyle = '#f97316';
          ctx.strokeStyle = INK;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(-s * 0.08, -s * 0.05, 5 * flick, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
    }

    ctx.restore();
    return true;
  }

  function renderLigneClaireBuildingGhost(ctx, defId, x, y, s, valid) {
    ensureBuildingSpritesLoaded();
    const img = buildingSpriteCache[defId];
    const half = s / 2;
    const padW = half * 1.18;
    const padH = half * 0.62;

    ctx.save();
    ctx.translate(x, y);

    // Isometric placement diamond footprint
    ctx.fillStyle = valid ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.30)';
    ctx.strokeStyle = valid ? '#22c55e' : '#ef4444';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0, -padH);
    ctx.lineTo(padW, 0);
    ctx.lineTo(0, padH);
    ctx.lineTo(-padW, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.globalAlpha = valid ? 0.82 : 0.55;
    let renderedBespoke = false;
    if (window.ZH_UNIT_MODELS && typeof window.ZH_UNIT_MODELS.renderBuildingIfBespoke === 'function') {
      const bDef = (window.ZH_DATA && window.ZH_DATA.BUILDINGS && window.ZH_DATA.BUILDINGS[defId]) || { id: defId, size: s };
      const ghostEntity = {
        defId,
        def: bDef,
        x: 0,
        y: 0,
        size: s,
        hp: bDef.hp || 1000,
        maxHp: bDef.hp || 1000,
        constructed: true,
        buildProgress: 1.0
      };
      const factionCol = valid ? '#38bdf8' : '#ef4444';
      renderedBespoke = window.ZH_UNIT_MODELS.renderBuildingIfBespoke(ctx, ghostEntity, { faction: { color: factionCol } }, 0);
    }

    if (!renderedBespoke && img && img.complete && img.naturalWidth > 0) {
      const drawW = s * 1.68;
      const aspect = img.naturalHeight / img.naturalWidth;
      const drawH = drawW * aspect;
      const drawX = -drawW / 2;
      const drawY = -drawH * 0.58;
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
    }
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  return {
    addDecal,
    addTreadMark,
    updateVFX,
    renderDecals,
    renderConstructionScaffolding,
    renderArticulatedUnit,
    triggerSuperweaponSpectacle,
    renderSuperweaponSpectacle,
    renderLigneClaireBuilding,
    renderLigneClaireBuildingGhost
  };
})();

