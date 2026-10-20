// ============================================================================
// Command & Conquer: Generals – Zero Hour (macOS Clean-Room Edition)
// js/vfx.js — Phase 3: Articulated Multi-Part Unit Rigs, Persistent Decals,
//             4-Stage Construction Scaffolding & Multi-Stage Superweapon VFX
// ============================================================================

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
    engine.decals.push({
      type, // 'CRATER' | 'SCORCH' | 'NUKE_CRATER' | 'TREAD'
      x,
      y,
      radius,
      angle,
      timer: duration,
      maxTimer: duration
    });
    if (engine.decals.length > MAX_DECALS) {
      engine.decals.shift();
    }
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
        engine.decals.splice(i, 1);
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

    // Update unit barrel recoil & tread mark stamping
    for (const u of engine.units) {
      if (u.recoilOffset && u.recoilOffset > 0) {
        u.recoilOffset = Math.max(0, u.recoilOffset - dt * 24);
      }
      if (u.state === 'MOVE' || u.state === 'ATTACK_MOVE' || u.state === 'HARVEST' || u.state === 'RETURN_CARGO') {
        const loco = u.def.locomotor || (u.def.category === 'TANK' ? 'TRACKED' : 'INFANTRY');
        if (loco === 'TRACKED') {
          u.treadTimer = (u.treadTimer || 0) + dt;
          if (u.treadTimer >= 0.32) {
            u.treadTimer = 0;
            addTreadMark(engine, u);
          }
        }
      }
      // Emit vehicle damage smoke below 50% HP
      if (u.hp > 0 && u.hp < u.maxHp * 0.5 && u.def.category !== 'INFANTRY') {
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

    ctx.save();
    // Stage 1+: Excavated foundation pit
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-s / 2, -s / 2, s, s);

    // Stage 2+: Isometric steel girder cross-bracing
    if (stage >= 2) {
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      const step = Math.max(12, Math.floor(s / 4));
      for (let x = -s / 2; x <= s / 2; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, -s / 2);
        ctx.lineTo(x, s / 2);
        ctx.stroke();
      }
      for (let y = -s / 2; y <= s / 2; y += step) {
        ctx.beginPath();
        ctx.moveTo(-s / 2, y);
        ctx.lineTo(s / 2, y);
        ctx.stroke();
      }
    }

    // Stage 3+: Partial concrete/armor superstructure rising from bottom
    if (stage >= 3) {
      const fillH = s * ratio;
      ctx.fillStyle = 'rgba(51, 65, 85, 0.82)';
      ctx.fillRect(-s / 2 + 4, s / 2 - fillH + 4, s - 8, fillH - 8);
      // Yellow construction crane arm
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-s * 0.35, s * 0.35);
      ctx.lineTo(s * 0.38, -s * 0.38);
      ctx.stroke();
    }

    // Stage 4: Welding arc spark flash
    if (stage === 4 && Math.random() < 0.5) {
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc((Math.random() - 0.5) * s * 0.6, (Math.random() - 0.5) * s * 0.6, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Stage badge
    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`STAGE ${stage}/4 (${Math.round(ratio * 100)}%)`, 0, s / 2 - 5);
    ctx.restore();
  }

  // ==========================================================================
  // 3. Articulated Multi-Part 2.5D Unit Rig (Chassis + Turret + Recoiling Barrels)
  // ==========================================================================
  function renderArticulatedUnit(ctx, u, faction) {
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

  return {
    addDecal,
    addTreadMark,
    updateVFX,
    renderDecals,
    renderConstructionScaffolding,
    renderArticulatedUnit,
    triggerSuperweaponSpectacle,
    renderSuperweaponSpectacle
  };
})();
