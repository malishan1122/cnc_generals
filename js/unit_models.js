// ============================================================================
// Command & Conquer: Generals – Zero Hour (macOS Clean-Room Edition)
// js/unit_models.js — Bespoke 3D/2.5D Parametric Unit Model Registry & Renderer
//                     Illustrated Isometric "Ligne-Claire" Vector-Cel Diorama Theme
//                     Full Allied (USA) Army Roster (18 Units) + Overlord Tank
// ============================================================================

const ZH_UNIT_MODELS = (function () {
  'use strict';

  const STORAGE_KEY = 'zh_custom_unit_designs_v2';

  // ==========================================================================
  // 1. Color, Cel-Shading & 3D Projection Math Utilities
  // ==========================================================================
  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function hexToRgb(hex) {
    if (!hex || typeof hex !== 'string') return { r: 212, g: 176, b: 123 };
    let h = hex.trim().replace(/^#/, '');
    if (h.length === 3) {
      h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    }
    const num = parseInt(h, 16);
    if (isNaN(num)) return { r: 212, g: 176, b: 123 };
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    };
  }

  function rgbToCss(rgb, alpha = 1) {
    const r = clamp(Math.round(rgb.r), 0, 255);
    const g = clamp(Math.round(rgb.g), 0, 255);
    const b = clamp(Math.round(rgb.b), 0, 255);
    if (alpha < 0.999) {
      return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
    }
    return `rgb(${r}, ${g}, ${b})`;
  }

  function shadeHex(hex, factor, alpha = 1) {
    const rgb = hexToRgb(hex);
    if (factor >= 1) {
      const t = clamp(factor - 1, 0, 1);
      return rgbToCss({
        r: rgb.r + (255 - rgb.r) * t,
        g: rgb.g + (255 - rgb.g) * t,
        b: rgb.b + (255 - rgb.b) * t
      }, alpha);
    } else {
      const f = clamp(factor, 0, 1);
      return rgbToCss({
        r: rgb.r * f,
        g: rgb.g * f,
        b: rgb.b * f
      }, alpha);
    }
  }

  function mixHex(hexA, hexB, t, alpha = 1) {
    const a = hexToRgb(hexA);
    const b = hexToRgb(hexB);
    const k = clamp(t, 0, 1);
    return rgbToCss({
      r: a.r + (b.r - a.r) * k,
      g: a.g + (b.g - a.g) * k,
      b: a.b + (b.b - a.b) * k
    }, alpha);
  }

  // Normalized directional sunlight in screen/world space (top-left-front warm studio sun)
  const SUN_DIR = (function () {
    const lx = -0.42;
    const ly = -0.58;
    const lz = 0.70;
    const len = Math.hypot(lx, ly, lz) || 1;
    return { x: lx / len, y: ly / len, z: lz / len };
  })();

  function createProjector(yaw, pitchScale, zScale, pivotX = 0, pivotY = 0, pivotZ = 0, baseYaw = 0) {
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const cosB = Math.cos(baseYaw);
    const sinB = Math.sin(baseYaw);

    const pwx = pivotX * cosB - pivotY * sinB;
    const pwy = pivotX * sinB + pivotY * cosB;
    const pwz = pivotZ;

    return {
      cosY,
      sinY,
      pitchScale,
      zScale,
      project(lx, ly, lz) {
        const wx = pwx + (lx * cosY - ly * sinY);
        const wy = pwy + (lx * sinY + ly * cosY);
        const wz = pwz + lz;
        return {
          x: wx,
          y: wy * pitchScale - wz * zScale,
          wx,
          wy,
          wz,
          depth: wy * 0.65 + wz * 0.76
        };
      },
      shadeNormal(nx, ny, nz) {
        const wnx = nx * cosY - ny * sinY;
        const wny = nx * sinY + ny * cosY;
        const wnz = nz;
        const len = Math.hypot(wnx, wny, wnz) || 1;
        const dot = (wnx * SUN_DIR.x + wny * SUN_DIR.y + wnz * SUN_DIR.z) / len;
        return clamp(0.86 + dot * 0.34, 0.48, 1.24);
      }
    };
  }

  function drawPolyPts(ctx, pts, fillStyle, strokeStyle, lineWidth = 1.15) {
    if (!pts || pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();
    if (fillStyle) {
      ctx.fillStyle = fillStyle;
      ctx.fill();
    }
    if (strokeStyle && lineWidth > 0) {
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }

  function drawLine3D(ctx, proj, x1, y1, z1, x2, y2, z2, strokeStyle, lineWidth = 1.1) {
    const p1 = proj.project(x1, y1, z1);
    const p2 = proj.project(x2, y2, z2);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }

  // Push a 3D lofted frustum (bottom polygon -> top polygon) into faceList
  function pushFrustumFaces(faceList, proj, bottomLoop, topLoop, baseHex, strokeHex, strokeW = 1.15, layerBias = 0) {
    const n = Math.min(bottomLoop.length, topLoop.length);
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      const b0 = bottomLoop[i];
      const b1 = bottomLoop[next];
      const t1 = topLoop[next];
      const t0 = topLoop[i];

      const p0 = proj.project(b0[0], b0[1], b0[2]);
      const p1 = proj.project(b1[0], b1[1], b1[2]);
      const p2 = proj.project(t1[0], t1[1], t1[2]);
      const p3 = proj.project(t0[0], t0[1], t0[2]);

      const dx = b1[0] - b0[0];
      const dy = b1[1] - b0[1];
      const nx = dy;
      const ny = -dx;
      const nz = 0.28;
      const light = proj.shadeNormal(nx, ny, nz);

      const avgDepth = (p0.depth + p1.depth + p2.depth + p3.depth) * 0.25 + layerBias;
      faceList.push({
        depth: avgDepth,
        pts: [p0, p1, p2, p3],
        fill: shadeHex(baseHex, light * 0.93),
        stroke: strokeHex,
        lineWidth: strokeW
      });
    }

    const topPts = topLoop.map((v) => proj.project(v[0], v[1], v[2]));
    const topDepth = topPts.reduce((acc, p) => acc + p.depth, 0) / topPts.length + 0.08 + layerBias;
    const topLight = proj.shadeNormal(0, 0, 1);
    faceList.push({
      depth: topDepth,
      pts: topPts,
      fill: shadeHex(baseHex, topLight * 1.05),
      stroke: strokeHex,
      lineWidth: strokeW
    });
  }

  // Helper: Push a 3D beveled box [x0..x1, y0..y1, z0..z1] with optional top taper
  function pushBox3D(faceList, proj, x0, x1, y0, y1, z0, z1, baseHex, strokeHex, strokeW = 1.15, bias = 0, taperX = 0, taperY = 0) {
    const bot = [
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y1, z0],
      [x0, y1, z0]
    ];
    const top = [
      [x0 + taperX, y0 + taperY, z1],
      [x1 - taperX, y0 + taperY, z1],
      [x1 - taperX, y1 - taperY, z1],
      [x0 + taperX, y1 - taperY, z1]
    ];
    pushFrustumFaces(faceList, proj, bot, top, baseHex, strokeHex, strokeW, bias);
  }

  // Helper: Push a vertical 3D cylinder / dome along Z axis
  function pushCylinderZ3D(faceList, proj, cx, cy, z0, z1, radBot, radTop, sides, baseHex, strokeHex, strokeW = 1.05, bias = 0) {
    const bot = [];
    const top = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      bot.push([cx + Math.cos(a) * radBot, cy + Math.sin(a) * radBot, z0]);
      top.push([cx + Math.cos(a) * radTop, cy + Math.sin(a) * radTop, z1]);
    }
    pushFrustumFaces(faceList, proj, bot, top, baseHex, strokeHex, strokeW, bias);
  }

  // Helper: Push a 3D cylindrical tube along an arbitrary local X/Z elevation ray
  function pushTubeSegment3D(faceList, proj, xRoot, yCenter, zRoot, elevRad, d0, d1, r0, r1, colHex, ringStroke, strokeW = 0.9, bias = 1.5) {
    const x0 = xRoot + Math.cos(elevRad) * d0;
    const z0 = zRoot + Math.sin(elevRad) * d0;
    const x1 = xRoot + Math.cos(elevRad) * d1;
    const z1 = zRoot + Math.sin(elevRad) * d1;

    const angles = [-Math.PI * 0.85, -Math.PI * 0.45, -Math.PI * 0.15, Math.PI * 0.15, Math.PI * 0.45, Math.PI * 0.85];
    for (let i = 0; i < angles.length; i++) {
      const next = (i + 1) % angles.length;
      const a0 = angles[i];
      const a1 = angles[next];

      const p00 = proj.project(x0, yCenter + Math.sin(a0) * r0, z0 + Math.cos(a0) * r0);
      const p10 = proj.project(x1, yCenter + Math.sin(a0) * r1, z1 + Math.cos(a0) * r1);
      const p11 = proj.project(x1, yCenter + Math.sin(a1) * r1, z1 + Math.cos(a1) * r1);
      const p01 = proj.project(x0, yCenter + Math.sin(a1) * r0, z0 + Math.cos(a1) * r0);

      const midA = (a0 + a1) * 0.5;
      const light = proj.shadeNormal(0.15, Math.sin(midA), Math.cos(midA));

      faceList.push({
        depth: (p00.depth + p10.depth + p11.depth + p01.depth) * 0.25 + bias,
        pts: [p00, p10, p11, p01],
        fill: shadeHex(colHex, light),
        stroke: ringStroke || shadeHex(colHex, light * 0.78),
        lineWidth: ringStroke ? strokeW : 0.45
      });
    }
  }

  // Helper: Push Diorama Ligne-Claire Track Pod with Visible Road Wheel Bogies
  function pushTrackedSuspension3D(faceList, proj, r, xRear, xFront, yInner, yOuter, zTop, numWheels, hubCol, seamCol, treadPhase, showRoadWheels = true, bias = -2.0) {
    for (const side of [-1, 1]) {
      const yMin = Math.min(side * yInner, side * yOuter);
      const yMax = Math.max(side * yInner, side * yOuter);
      const yOutFace = side * yOuter;

      const botLoop = [
        [xRear * 0.88, yMin, 0],
        [xFront * 0.88, yMin, 0],
        [xFront * 0.88, yMax, 0],
        [xRear * 0.88, yMax, 0]
      ];
      const topLoop = [
        [xRear, yMin, zTop],
        [xFront, yMin, zTop],
        [xFront, yMax, zTop],
        [xRear, yMax, zTop]
      ];
      pushFrustumFaces(faceList, proj, botLoop, topLoop, '#3b3733', seamCol, 1.05, bias);

      // Road wheels & animated grouser cleats
      const sideDepth = proj.project(0, side * (yOuter + 0.02 * r), zTop * 0.48).depth + bias + 0.55;
      faceList.push({
        depth: sideDepth,
        customDraw(c) {
          // Animated grousers on track belt
          const numCleats = 8;
          const span = xFront - xRear;
          const phaseOff = ((treadPhase % 1) + 1) % 1;
          for (let k = 0; k < numCleats; k++) {
            const frac = (k + phaseOff) / numCleats;
            const cx = xRear + frac * span;
            drawLine3D(c, proj, cx, yMin, zTop + 0.008 * r, cx, yMax, zTop + 0.008 * r, '#69625a', 1.05);
          }

          // Visible circular road wheels inside the caterpillar track loop (matching asset_sheet.png!)
          if (showRoadWheels && numWheels > 0) {
            const wheelR = clamp(((xFront - xRear) * 0.76) / (numWheels * 2.15), 0.11 * r, 0.21 * r);
            const startX = xRear * 0.74;
            const endX = xFront * 0.74;
            for (let wIdx = 0; wIdx < numWheels; wIdx++) {
              const frac = numWheels === 1 ? 0.5 : wIdx / (numWheels - 1);
              const wx = startX + frac * (endX - startX);
              const wz = zTop * 0.46;

              const rimPts = [];
              const hubPts = [];
              for (let s = 0; s < 10; s++) {
                const a = (s / 10) * Math.PI * 2;
                rimPts.push(proj.project(wx + Math.cos(a) * wheelR, yOutFace, wz + Math.sin(a) * wheelR * 0.88));
                hubPts.push(proj.project(wx + Math.cos(a) * wheelR * 0.58, yOutFace, wz + Math.sin(a) * wheelR * 0.52));
              }
              drawPolyPts(c, rimPts, '#2c2825', seamCol, 0.95);
              drawPolyPts(c, hubPts, hubCol, seamCol, 0.85);
              const centerPt = proj.project(wx, yOutFace, wz);
              c.fillStyle = seamCol;
              c.beginPath();
              c.arc(centerPt.x, centerPt.y, Math.max(1.0, 0.032 * r), 0, Math.PI * 2);
              c.fill();
            }
          }
        }
      });
    }
  }

  // Helper: Push 3D Rubber Off-Road Wheel + Rim Hub (for Humvee, Avenger, Tomahawk)
  function pushWheelAxle3D(faceList, proj, r, axX, yInner, yOuter, wheelRad, tireCol, hubCol, seamCol, treadPhase, bias = -1.2) {
    for (const side of [-1, 1]) {
      const yIn = side * yInner;
      const yOut = side * yOuter;
      const zCenter = wheelRad * 0.92;
      const sides = 10;
      const inLoop = [];
      const outLoop = [];
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        const lx = axX + Math.cos(a) * wheelRad;
        const lz = Math.max(0, zCenter + Math.sin(a) * wheelRad);
        inLoop.push([lx, yIn, lz]);
        outLoop.push([lx, yOut, lz]);
      }
      if (side < 0) {
        pushFrustumFaces(faceList, proj, inLoop, outLoop, tireCol, seamCol, 1.0, bias);
      } else {
        pushFrustumFaces(faceList, proj, inLoop.slice().reverse(), outLoop.slice().reverse(), tireCol, seamCol, 1.0, bias);
      }

      // Outer hubcap + lug bolts
      const hubDepth = proj.project(axX, yOut + side * 0.02 * r, zCenter).depth + bias + 0.35;
      faceList.push({
        depth: hubDepth,
        customDraw(c) {
          const hubPts = [];
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + (treadPhase || 0) * Math.PI * 2;
            hubPts.push(proj.project(axX + Math.cos(a) * wheelRad * 0.54, yOut, zCenter + Math.sin(a) * wheelRad * 0.54));
          }
          drawPolyPts(c, hubPts, hubCol, seamCol, 0.9);
          const cp = proj.project(axX, yOut, zCenter);
          c.fillStyle = seamCol;
          c.beginPath();
          c.arc(cp.x, cp.y, Math.max(1.2, wheelRad * 0.18), 0, Math.PI * 2);
          c.fill();
        }
      });
    }
  }

  // Helper: Draw a 3D Glass Window Pane with Ligne-Claire Diagonal White Reflection Slash
  function drawGlassPane3D(ctx, proj, quad3D, glassCol, seamCol, lineWidth = 1.05) {
    const pts = quad3D.map((v) => proj.project(v[0], v[1], v[2]));
    drawPolyPts(ctx, pts, glassCol, seamCol, lineWidth);
    // White diagonal reflection slash inside the glass pane
    const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const b0 = lerp3(quad3D[0], quad3D[1], 0.25);
    const t0 = lerp3(quad3D[3], quad3D[2], 0.52);
    const b1 = lerp3(quad3D[0], quad3D[1], 0.42);
    const t1 = lerp3(quad3D[3], quad3D[2], 0.68);
    drawLine3D(ctx, proj, b0[0], b0[1], b0[2], t0[0], t0[1], t0[2], 'rgba(255, 255, 255, 0.72)', 1.35);
    drawLine3D(ctx, proj, b1[0], b1[1], b1[2], t1[0], t1[1], t1[2], 'rgba(255, 255, 255, 0.45)', 0.9);
  }

  // Helper: Draw Roof-Mounted Pintle .50 Cal M2HB Heavy Machine Gun (from asset_sheet.png)
  function pushPintleMG3D(faceList, proj, r, mx, my, mzBase, seamCol, bias = 1.9) {
    const pDepth = proj.project(mx, my, mzBase + 0.18 * r).depth + bias;
    faceList.push({
      depth: pDepth,
      customDraw(c) {
        // Pedestal post
        drawLine3D(c, proj, mx, my, mzBase, mx, my, mzBase + 0.16 * r, '#475569', 2.2);
        // Receiver box
        const rx0 = mx - 0.14 * r;
        const rx1 = mx + 0.16 * r;
        const ry0 = my - 0.05 * r;
        const ry1 = my + 0.05 * r;
        const rz = mzBase + 0.17 * r;
        const recPts = [
          proj.project(rx0, ry0, rz),
          proj.project(rx1, ry0, rz),
          proj.project(rx1, ry1, rz + 0.06 * r),
          proj.project(rx0, ry1, rz + 0.06 * r)
        ];
        drawPolyPts(c, recPts, '#334155', seamCol, 1.0);
        // Heavy barrel & ammo box
        drawLine3D(c, proj, rx1, my, rz + 0.03 * r, rx1 + 0.34 * r, my, rz + 0.06 * r, seamCol, 1.85);
        drawLine3D(c, proj, rx0, my, rz + 0.03 * r, rx0 - 0.10 * r, my, rz + 0.01 * r, seamCol, 1.5);
      }
    });
  }

  function flushFaces(ctx, faceList) {
    faceList.sort((a, b) => a.depth - b.depth);
    for (let i = 0; i < faceList.length; i++) {
      const f = faceList[i];
      if (f.customDraw) {
        f.customDraw(ctx);
      } else {
        drawPolyPts(ctx, f.pts, f.fill, f.stroke, f.lineWidth);
      }
    }
  }

  // ==========================================================================
  // 2. Unit #1 & #2: M1A9 Crusader Tank & Laser Crusader (Updated w/ Diorama Theme)
  // ==========================================================================
  const CRUSADER_DEFAULT_PARAMS = {
    // 1. Hull & Proportions
    hullScale: 1.0,
    hullLength: 1.0,
    hullWidth: 1.0,
    frontFenderGap: 0.34,
    sideSkirtWidth: 1.0,
    extrusionDepth: 1.0,

    // 2. Turret & ERA Sponsons
    turretScale: 1.0,
    turretLength: 1.0,
    turretWidth: 1.0,
    sponsonScale: 1.0,
    antennaHeight: 1.0,

    // 3. 120mm Smoothbore Cannon
    barrelLength: 1.0,
    barrelThickness: 1.0,
    boreEvacuatorScale: 1.0,
    barrelElevation: 0.0,

    // 4. Armor Material & Palette (Default: Warm Illustrated Diorama Desert Tan from asset_sheet.png)
    armorBaseColor: '#d9b882',
    armorHighlightColor: '#edd3a4',
    armorShadowColor: '#9c7a49',
    panelLineColor: '#26201b',
    houseColorMode: 'CUSTOM',
    houseColor: '#c9a66b',
    weatheringIntensity: 0.85,

    // 5. Component Layer Visibility & Detail Toggles
    showTracks: true,
    showRoadWheels: true,
    showFrontSponsons: true,
    showFenderXRibs: true,
    showSideSkirts: true,
    showSideMarkings: true,
    showRearEngineDeck: true,
    showTurretShell: true,
    showCheekBrackets: true,
    showBlueSponsons: true,
    showCupolaHatches: true,
    showPintleMG: true,
    showWhipAntennas: true,
    showCannonBarrel: true,
    showBarrelBands: true
  };

  const LASER_CRUSADER_DEFAULT_PARAMS = Object.assign({}, CRUSADER_DEFAULT_PARAMS, {
    armorBaseColor: '#dcc08e',
    armorHighlightColor: '#f2dcb3',
    armorShadowColor: '#9e7e4e',
    panelLineColor: '#26201b',
    houseColorMode: 'CUSTOM',
    houseColor: '#0284c7',
    barrelLength: 1.04,
    barrelThickness: 1.12,
    sponsonScale: 1.08
  });

  const CRUSADER_PRESETS = {
    DIORAMA_ASSET_SHEET: {
      name: '🎨 Diorama Vector-Cel (Asset Sheet Default)',
      params: Object.assign({}, CRUSADER_DEFAULT_PARAMS)
    },
    M1A9_UNTITLED_REF: {
      name: '🟦 M1A9 Crusader (C&C Untitled Blue ERA)',
      params: Object.assign({}, CRUSADER_DEFAULT_PARAMS, {
        armorBaseColor: '#cbc6b9',
        armorHighlightColor: '#e4e0d5',
        armorShadowColor: '#7c786d',
        panelLineColor: '#2d2b26',
        houseColor: '#1d4ed8'
      })
    },
    DESERT_STORM_ABRAMS: {
      name: '🏜️ Operation Desert Storm (Sand & Blue)',
      params: Object.assign({}, CRUSADER_DEFAULT_PARAMS, {
        armorBaseColor: '#d4be94',
        armorHighlightColor: '#ead9b5',
        armorShadowColor: '#8c7651',
        panelLineColor: '#26201b',
        houseColor: '#2563eb'
      })
    },
    URBAN_SPEC_OPS: {
      name: '🏙️ Urban Spec-Ops (Tactical Slate)',
      params: Object.assign({}, CRUSADER_DEFAULT_PARAMS, {
        armorBaseColor: '#94a3b8',
        armorHighlightColor: '#cbd5e1',
        armorShadowColor: '#475569',
        panelLineColor: '#0f172a',
        houseColor: '#38bdf8'
      })
    },
    TOWNES_LASER_CRUSADER: {
      name: '⚡ Gen. Townes Laser Crusader',
      params: Object.assign({}, LASER_CRUSADER_DEFAULT_PARAMS)
    }
  };

  const CRUSADER_PARAM_SCHEMA = [
    {
      group: '1. Hull & Catamaran Sponsons',
      fields: [
        { key: 'hullScale', label: 'Overall Unit Scale', type: 'range', min: 0.75, max: 1.35, step: 0.02 },
        { key: 'hullLength', label: 'Hull Length', type: 'range', min: 0.80, max: 1.25, step: 0.02 },
        { key: 'hullWidth', label: 'Hull Width', type: 'range', min: 0.80, max: 1.25, step: 0.02 },
        { key: 'frontFenderGap', label: 'Front Fender Notch Gap', type: 'range', min: 0.20, max: 0.48, step: 0.02 },
        { key: 'sideSkirtWidth', label: 'Ballistic Side Skirt Thickness', type: 'range', min: 0.70, max: 1.35, step: 0.05 },
        { key: 'extrusionDepth', label: '3D Armor Height / Extrusion', type: 'range', min: 0.50, max: 1.50, step: 0.05 }
      ]
    },
    {
      group: '2. Faceted M1A9 Turret & ERA',
      fields: [
        { key: 'turretScale', label: 'Turret Overall Scale', type: 'range', min: 0.75, max: 1.30, step: 0.02 },
        { key: 'turretLength', label: 'Turret Bustle Length', type: 'range', min: 0.80, max: 1.25, step: 0.02 },
        { key: 'turretWidth', label: 'Turret Cheek Width', type: 'range', min: 0.80, max: 1.25, step: 0.02 },
        { key: 'sponsonScale', label: 'Side ERA Sponson Size', type: 'range', min: 0.60, max: 1.45, step: 0.05 },
        { key: 'antennaHeight', label: 'Twin Whip Antenna Height', type: 'range', min: 0.40, max: 1.60, step: 0.05 }
      ]
    },
    {
      group: '3. 120mm Smoothbore Cannon',
      fields: [
        { key: 'barrelLength', label: '120mm Barrel Length', type: 'range', min: 0.70, max: 1.40, step: 0.02 },
        { key: 'barrelThickness', label: 'Barrel Caliber Thickness', type: 'range', min: 0.70, max: 1.45, step: 0.05 },
        { key: 'boreEvacuatorScale', label: 'Mid-Barrel Bore Evacuator', type: 'range', min: 0.65, max: 1.45, step: 0.05 },
        { key: 'barrelElevation', label: 'Gun Elevation Pitch (°)', type: 'range', min: -8, max: 22, step: 1 }
      ]
    },
    {
      group: '4. Armor Palette & House Accents',
      fields: [
        { key: 'armorBaseColor', label: 'Composite Armor Base', type: 'color' },
        { key: 'armorHighlightColor', label: 'Top Bevel Highlight', type: 'color' },
        { key: 'armorShadowColor', label: 'Sloped Armor Shadow', type: 'color' },
        { key: 'panelLineColor', label: 'Ligne-Claire Ink Outline', type: 'color' },
        { key: 'houseColor', label: 'ERA Sponson / Accent Color', type: 'color' },
        { key: 'houseColorMode', label: 'Accent Mode', type: 'select', options: [
          { value: 'CUSTOM', label: 'Studio Custom Accent' },
          { value: 'FACTION', label: 'Dynamic Team / General Color' }
        ]},
        { key: 'weatheringIntensity', label: 'Panel & Cheek Weathering', type: 'range', min: 0, max: 1.2, step: 0.05 }
      ]
    },
    {
      group: '5. Component Layer Visibility',
      fields: [
        { key: 'showTracks', label: 'Caterpillar Treads & Grousers', type: 'checkbox' },
        { key: 'showRoadWheels', label: '5 Road Wheels Inside Tracks', type: 'checkbox' },
        { key: 'showFrontSponsons', label: 'Catamaran Front Track Pods', type: 'checkbox' },
        { key: 'showFenderXRibs', label: 'Front Fender X-Rib Braces (⌧)', type: 'checkbox' },
        { key: 'showSideSkirts', label: 'Sloped Ballistic Side Skirts', type: 'checkbox' },
        { key: 'showSideMarkings', label: 'Side Chevron (<), Star & Vents', type: 'checkbox' },
        { key: 'showRearEngineDeck', label: 'Rear Louvered Engine Deck', type: 'checkbox' },
        { key: 'showTurretShell', label: 'Faceted M1A9 Stealth Turret', type: 'checkbox' },
        { key: 'showCheekBrackets', label: 'Front Cheek [ ] Stencil Markings', type: 'checkbox' },
        { key: 'showBlueSponsons', label: 'Side ERA Sponson Blocks', type: 'checkbox' },
        { key: 'showCupolaHatches', label: 'Dual Crew Hatches & Periscopes', type: 'checkbox' },
        { key: 'showPintleMG', label: 'Roof Pintle .50 Cal Machine Gun', type: 'checkbox' },
        { key: 'showWhipAntennas', label: 'Twin Antenna Mounts & Whips', type: 'checkbox' },
        { key: 'showCannonBarrel', label: '120mm Cannon & Bore Evacuator', type: 'checkbox' },
        { key: 'showBarrelBands', label: 'Barrel Collar & Muzzle Bands', type: 'checkbox' }
      ]
    }
  ];

  function renderCrusaderModel(ctx, u, faction, customParams, options) {
    const isLaserVariant = u && u.defId === 'USA_LASER_CRUSADER';
    const baseDefaults = isLaserVariant ? LASER_CRUSADER_DEFAULT_PARAMS : CRUSADER_DEFAULT_PARAMS;
    const p = Object.assign({}, baseDefaults, customParams || {});
    const opts = options || {};

    const rawR = (u && u.radius) || 18;
    const r = rawR * (p.hullScale || 1.0);
    const L = p.hullLength || 1.0;
    const W = p.hullWidth || 1.0;
    const H = p.extrusionDepth || 1.0;

    const hullAngle = (u && u.angle !== undefined) ? u.angle : 0;
    const turretAngle = (u && u.turretAngle !== undefined) ? u.turretAngle : hullAngle;
    const recoil = (u && u.recoilOffset) || 0;
    const treadPhase = (u && u.treadPhase) || 0;

    const pitchScale = opts.pitchScale !== undefined ? opts.pitchScale : 0.66;
    const zScale = opts.zScale !== undefined ? opts.zScale : 0.76;

    const isUnmanned = Boolean(u && u.unmanned);
    const armorBase = isUnmanned ? '#64748b' : p.armorBaseColor;
    const armorHi = isUnmanned ? '#94a3b8' : p.armorHighlightColor;
    const armorDark = isUnmanned ? '#334155' : p.armorShadowColor;
    const seamCol = p.panelLineColor || '#26201b';

    let houseCol = p.houseColor || '#c9a66b';
    if (isUnmanned) {
      houseCol = '#475569';
    } else if (p.houseColorMode === 'FACTION' && faction && faction.color) {
      houseCol = faction.color;
    }
    const houseHi = shadeHex(houseCol, 1.24);

    const hullProj = createProjector(hullAngle, pitchScale, zScale, 0, 0, 0, 0);

    // PASS 0: Warm Terracotta-Charcoal Ground Drop Shadow
    const shadowPts = [
      hullProj.project(-1.18 * r * L, -0.88 * r * W, 0),
      hullProj.project(1.22 * r * L, -0.88 * r * W, 0),
      hullProj.project(1.22 * r * L, 0.88 * r * W, 0),
      hullProj.project(-1.18 * r * L, 0.88 * r * W, 0)
    ].map((pt) => ({ x: pt.x + 3.5, y: pt.y + 4.5 }));
    drawPolyPts(ctx, shadowPts, 'rgba(65, 50, 40, 0.36)', null, 0);

    const hullFaces = [];

    // PASS 1: Left & Right Caterpillar Track Pods + 5 Visible Road Wheels (from asset_sheet.png!)
    if (p.showTracks !== false) {
      pushTrackedSuspension3D(
        hullFaces,
        hullProj,
        r,
        -1.12 * r * L,
        1.15 * r * L,
        0.48 * r * W,
        0.82 * r * W,
        0.26 * r * H,
        5,
        armorDark,
        seamCol,
        treadPhase,
        p.showRoadWheels !== false,
        -2.0
      );
    }

    // PASS 2: Lower & Upper Armored Chassis + Sloped Side Skirts + Engine Deck
    const zHullBot = 0.16 * r * H;
    const zHullTop = 0.45 * r * H;
    const xRearBot = -1.14 * r * L;
    const xRearTop = -1.06 * r * L;
    const xMidFront = 0.46 * r * L;
    const xGlacisBot = 0.92 * r * L;
    const xGlacisTop = 0.74 * r * L;
    const yHullBot = 0.86 * r * W * (p.sideSkirtWidth || 1.0);
    const yHullTop = 0.78 * r * W;

    const mainHullBot = [
      [xRearBot, -yHullBot, zHullBot],
      [xMidFront, -yHullBot, zHullBot],
      [xGlacisBot, -0.36 * r * W, zHullBot],
      [xGlacisBot, 0.36 * r * W, zHullBot],
      [xMidFront, yHullBot, zHullBot],
      [xRearBot, yHullBot, zHullBot]
    ];
    const mainHullTop = [
      [xRearTop, -yHullTop, zHullTop],
      [xMidFront, -yHullTop, zHullTop],
      [xGlacisTop, -0.34 * r * W, zHullTop],
      [xGlacisTop, 0.34 * r * W, zHullTop],
      [xMidFront, yHullTop, zHullTop],
      [xRearTop, yHullTop, zHullTop]
    ];
    pushFrustumFaces(hullFaces, hullProj, mainHullBot, mainHullTop, armorBase, seamCol, 1.15, 0);

    // PASS 2B: Catamaran Split Front Track Sponsons
    if (p.showFrontSponsons !== false) {
      const gapY = clamp(p.frontFenderGap || 0.34, 0.18, 0.50) * r * W;
      const outerBotY = yHullBot;
      const outerTopY = yHullTop;
      const xPodBack = 0.36 * r * L;
      const xPodFrontBot = 1.20 * r * L;
      const xPodFrontTop = 1.00 * r * L;
      const zPodBot = 0.18 * r * H;
      const zPodTop = 0.48 * r * H;

      for (const side of [-1, 1]) {
        const yInB = side * gapY;
        const yOutB = side * outerBotY;
        const yInT = side * (gapY + 0.02 * r * W);
        const yOutT = side * outerTopY;

        const podBot = side < 0
          ? [
              [xPodBack, yOutB, zPodBot],
              [xPodFrontBot, yOutB * 0.94, zPodBot + 0.04 * r * H],
              [xPodFrontBot, yInB, zPodBot + 0.04 * r * H],
              [xPodBack, yInB, zPodBot]
            ]
          : [
              [xPodBack, yInB, zPodBot],
              [xPodFrontBot, yInB, zPodBot + 0.04 * r * H],
              [xPodFrontBot, yOutB * 0.94, zPodBot + 0.04 * r * H],
              [xPodBack, yOutB, zPodBot]
            ];

        const podTop = side < 0
          ? [
              [xPodBack, yOutT, zPodTop],
              [xPodFrontTop, yOutT * 0.93, zPodTop],
              [xPodFrontTop, yInT, zPodTop],
              [xPodBack, yInT, zPodTop]
            ]
          : [
              [xPodBack, yInT, zPodTop],
              [xPodFrontTop, yInT, zPodTop],
              [xPodFrontTop, yOutT * 0.93, zPodTop],
              [xPodBack, yOutT, zPodTop]
            ];

        pushFrustumFaces(hullFaces, hullProj, podBot, podTop, armorBase, seamCol, 1.15, 0.4);

        if (p.showFenderXRibs !== false) {
          const rx0 = 0.44 * r * L;
          const rx1 = 0.93 * r * L;
          const ry0 = side * (gapY + 0.08 * r * W);
          const ry1 = side * (outerTopY - 0.08 * r * W);
          const rz = zPodTop + 0.008 * r * H;

          const boxCenter = hullProj.project((rx0 + rx1) * 0.5, (ry0 + ry1) * 0.5, rz);
          hullFaces.push({
            depth: boxCenter.depth + 0.65,
            customDraw(c) {
              const bPts = [
                hullProj.project(rx0, ry0, rz),
                hullProj.project(rx1, ry0, rz),
                hullProj.project(rx1, ry1, rz),
                hullProj.project(rx0, ry1, rz)
              ];
              drawPolyPts(c, bPts, shadeHex(armorDark, 0.92), seamCol, 0.95);
              drawLine3D(c, hullProj, rx0 + 0.03 * r, ry0, rz, rx1 - 0.03 * r, ry1, rz, armorHi, 1.4);
              drawLine3D(c, hullProj, rx1 - 0.03 * r, ry0, rz, rx0 + 0.03 * r, ry1, rz, armorHi, 1.4);
              drawLine3D(c, hullProj, rx0 + 0.03 * r, ry0, rz, rx1 - 0.03 * r, ry1, rz, seamCol, 0.65);
              drawLine3D(c, hullProj, rx1 - 0.03 * r, ry0, rz, rx0 + 0.03 * r, ry1, rz, seamCol, 0.65);
            }
          });
        }
      }
    }

    // PASS 2C: Recessed Center Glacis, Side Skirt Seams & Rear Engine Deck
    hullFaces.push({
      depth: hullProj.project(0.55 * r * L, 0, zHullTop).depth + 0.55,
      customDraw(c) {
        const gz = zHullTop + 0.006 * r * H;
        drawLine3D(c, hullProj, 0.25 * r * L, 0, gz, xGlacisTop, 0, gz, seamCol, 0.95);
        drawLine3D(c, hullProj, 0.54 * r * L, -0.28 * r * W, gz, 0.54 * r * L, 0.28 * r * W, gz, seamCol, 0.9);
        const drvPts = [
          hullProj.project(0.42 * r * L, -0.14 * r * W, gz),
          hullProj.project(0.52 * r * L, -0.11 * r * W, gz),
          hullProj.project(0.52 * r * L, 0.11 * r * W, gz),
          hullProj.project(0.42 * r * L, 0.14 * r * W, gz)
        ];
        drawPolyPts(c, drvPts, '#2b3542', seamCol, 0.85);
      }
    });

    if (p.showSideSkirts !== false) {
      for (const side of [-1, 1]) {
        const yBot = side * yHullBot;
        const yTop = side * yHullTop;
        const sideCenter = hullProj.project(0, yBot, (zHullBot + zHullTop) * 0.5);
        hullFaces.push({
          depth: sideCenter.depth + 0.52,
          customDraw(c) {
            const seamXs = [-0.54, -0.04, 0.44, 0.82];
            for (const sx of seamXs) {
              drawLine3D(c, hullProj, sx * r * L, yBot, zHullBot, sx * r * L, yTop, zHullTop, seamCol, 1.05);
            }
            drawLine3D(c, hullProj, xRearTop, yTop, zHullTop, 0.95 * r * L, yTop, zHullTop, armorHi, 1.2);

            if (p.showSideMarkings !== false) {
              const midZ = (zHullBot + zHullTop) * 0.52;
              const midY = (yBot + yTop) * 0.5;
              const chTipX = 0.06 * r * L;
              const chBackX = 0.32 * r * L;
              drawLine3D(c, hullProj, chBackX, yTop * 0.97 + yBot * 0.03, zHullTop - 0.05 * r * H, chTipX, midY, midZ, '#f8fafc', 1.45);
              drawLine3D(c, hullProj, chTipX, midY, midZ, chBackX, yBot * 0.97 + yTop * 0.03, zHullBot + 0.05 * r * H, '#f8fafc', 1.45);
            }
          }
        });
      }
    }

    if (p.showRearEngineDeck !== false) {
      hullFaces.push({
        depth: hullProj.project(-0.78 * r * L, 0, zHullTop).depth + 0.55,
        customDraw(c) {
          const rz = zHullTop + 0.006 * r * H;
          for (const side of [-1, 1]) {
            const gx0 = -0.98 * r * L;
            const gx1 = -0.56 * r * L;
            const gy0 = side * 0.12 * r * W;
            const gy1 = side * 0.58 * r * W;
            const gPts = [
              hullProj.project(gx0, gy0, rz),
              hullProj.project(gx1, gy0, rz),
              hullProj.project(gx1, gy1, rz),
              hullProj.project(gx0, gy1, rz)
            ];
            drawPolyPts(c, gPts, shadeHex(armorDark, 0.72), seamCol, 0.9);
            for (let lx = gx0 + 0.08 * r * L; lx < gx1; lx += 0.10 * r * L) {
              drawLine3D(c, hullProj, lx, gy0, rz, lx, gy1, rz, seamCol, 0.85);
            }
          }
        }
      });
    }

    flushFaces(ctx, hullFaces);

    // PASS 3: Articulated M1A9 Stealth-Sloped Turret & 120mm Smoothbore Cannon
    const tScale = p.turretScale || 1.0;
    const tL = (p.turretLength || 1.0) * tScale;
    const tW = (p.turretWidth || 1.0) * tScale;
    const zTurretBot = 0.46 * r * H;
    const zTurretTop = 0.89 * r * H;

    const turProj = createProjector(turretAngle, pitchScale, zScale, -0.04 * r * L, 0, 0, hullAngle);

    if (p.showTurretShell !== false) {
      const tShadPts = [
        [-0.96 * r * tL, -0.54 * r * tW],
        [-0.45 * r * tL, -0.68 * r * tW],
        [0.24 * r * tL, -0.68 * r * tW],
        [0.64 * r * tL, -0.24 * r * tW],
        [0.64 * r * tL, 0.24 * r * tW],
        [0.24 * r * tL, 0.68 * r * tW],
        [-0.45 * r * tL, 0.68 * r * tW],
        [-0.96 * r * tL, 0.54 * r * tW]
      ].map(([lx, ly]) => {
        const pt = turProj.project(lx, ly, zTurretBot);
        return { x: pt.x + 2.5, y: pt.y + 3.0 };
      });
      drawPolyPts(ctx, tShadPts, 'rgba(38, 32, 27, 0.34)', null, 0);
    }

    const turretFaces = [];

    if (p.showTurretShell !== false) {
      const turBotLoop = [
        [-0.96 * r * tL, -0.50 * r * tW, zTurretBot],
        [-0.50 * r * tL, -0.62 * r * tW, zTurretBot],
        [0.20 * r * tL, -0.64 * r * tW, zTurretBot],
        [0.62 * r * tL, -0.20 * r * tW, zTurretBot],
        [0.62 * r * tL, 0.20 * r * tW, zTurretBot],
        [0.20 * r * tL, 0.64 * r * tW, zTurretBot],
        [-0.50 * r * tL, 0.62 * r * tW, zTurretBot],
        [-0.96 * r * tL, 0.50 * r * tW, zTurretBot]
      ];
      const turTopLoop = [
        [-0.86 * r * tL, -0.42 * r * tW, zTurretTop],
        [-0.44 * r * tL, -0.50 * r * tW, zTurretTop],
        [0.14 * r * tL, -0.46 * r * tW, zTurretTop],
        [0.42 * r * tL, -0.17 * r * tW, zTurretTop],
        [0.42 * r * tL, 0.17 * r * tW, zTurretTop],
        [0.14 * r * tL, 0.46 * r * tW, zTurretTop],
        [-0.44 * r * tL, 0.50 * r * tW, zTurretTop],
        [-0.86 * r * tL, 0.42 * r * tW, zTurretTop]
      ];
      pushFrustumFaces(turretFaces, turProj, turBotLoop, turTopLoop, armorBase, seamCol, 1.15, 1.0);

      // Rear Bustle Side Storage Racks (matching asset_sheet.png slatted bustle basket!)
      for (const side of [-1, 1]) {
        const earBot = [
          [-0.90 * r * tL, side * 0.48 * r * tW, zTurretBot + 0.05 * r * H],
          [-0.50 * r * tL, side * 0.56 * r * tW, zTurretBot + 0.05 * r * H],
          [-0.52 * r * tL, side * 0.70 * r * tW, zTurretBot + 0.08 * r * H],
          [-0.88 * r * tL, side * 0.64 * r * tW, zTurretBot + 0.08 * r * H]
        ];
        const earTop = [
          [-0.86 * r * tL, side * 0.42 * r * tW, zTurretTop - 0.02 * r * H],
          [-0.48 * r * tL, side * 0.50 * r * tW, zTurretTop - 0.02 * r * H],
          [-0.50 * r * tL, side * 0.64 * r * tW, zTurretTop - 0.04 * r * H],
          [-0.84 * r * tL, side * 0.58 * r * tW, zTurretTop - 0.04 * r * H]
        ];
        if (side < 0) {
          earBot.reverse();
          earTop.reverse();
        }
        pushFrustumFaces(turretFaces, turProj, earBot, earTop, shadeHex(armorBase, 0.94), seamCol, 1.0, 1.15);
      }

      turretFaces.push({
        depth: turProj.project(0.42 * r * tL, 0, (zTurretBot + zTurretTop) * 0.55).depth + 1.45,
        customDraw(c) {
          if (p.showCheekBrackets !== false) {
            for (const side of [-1, 1]) {
              const bOuter = [0.20 * r * tL, side * 0.64 * r * tW, zTurretBot];
              const bInner = [0.62 * r * tL, side * 0.20 * r * tW, zTurretBot];
              const tOuter = [0.14 * r * tL, side * 0.46 * r * tW, zTurretTop];
              const tInner = [0.42 * r * tL, side * 0.17 * r * tW, zTurretTop];

              const cheekPt = (uFrac, vFrac) => {
                const bx = bInner[0] + (bOuter[0] - bInner[0]) * uFrac;
                const by = bInner[1] + (bOuter[1] - bInner[1]) * uFrac;
                const bz = bInner[2] + (bOuter[2] - bInner[2]) * uFrac;
                const tx = tInner[0] + (tOuter[0] - tInner[0]) * uFrac;
                const ty = tInner[1] + (tOuter[1] - tInner[1]) * uFrac;
                const tz = tInner[2] + (tOuter[2] - tInner[2]) * uFrac;
                return turProj.project(
                  bx + (tx - bx) * vFrac,
                  by + (ty - by) * vFrac,
                  bz + (tz - bz) * vFrac
                );
              };

              if ((p.weatheringIntensity || 0) > 0.1) {
                const wPts = [cheekPt(0.18, 0.20), cheekPt(0.82, 0.20), cheekPt(0.82, 0.82), cheekPt(0.18, 0.82)];
                drawPolyPts(c, wPts, `rgba(92, 74, 48, ${(0.20 * p.weatheringIntensity).toFixed(2)})`, seamCol, 0.75);
              }
            }
          }

          // Raised Gunner CITV Sight Hood on Front-Right Roof (matching asset_sheet.png!)
          const zRoof = zTurretTop + 0.008 * r * H;
          const ventPts = [
            turProj.project(0.16 * r * tL, -0.26 * r * tW, zRoof),
            turProj.project(0.36 * r * tL, -0.26 * r * tW, zRoof + 0.08 * r * H),
            turProj.project(0.36 * r * tL, -0.08 * r * tW, zRoof + 0.08 * r * H),
            turProj.project(0.16 * r * tL, -0.08 * r * tW, zRoof)
          ];
          drawPolyPts(c, ventPts, armorHi, seamCol, 1.0);
        }
      });
    }

    // 3B. Side ERA / Sponson Modules
    if (p.showBlueSponsons !== false) {
      const spScale = p.sponsonScale || 1.0;
      for (const side of [-1, 1]) {
        const sx0 = -0.46 * r * tL;
        const sx1 = 0.12 * r * tL;
        const syIn = side * 0.53 * r * tW;
        const syOut = side * (0.53 + 0.22 * spScale) * r * tW;
        const szBot = zTurretBot + 0.04 * r * H;
        const szTop = zTurretTop - 0.06 * r * H;

        const spBot = [
          [sx0, syIn, szBot],
          [sx1, syIn, szBot],
          [sx1 - 0.04 * r * tL, syOut, szBot],
          [sx0 + 0.04 * r * tL, syOut, szBot]
        ];
        const spTop = [
          [sx0, syIn * 0.94, szTop],
          [sx1, syIn * 0.94, szTop],
          [sx1 - 0.04 * r * tL, syOut * 0.96, szTop],
          [sx0 + 0.04 * r * tL, syOut * 0.96, szTop]
        ];
        if (side < 0) {
          spBot.reverse();
          spTop.reverse();
        }
        pushFrustumFaces(turretFaces, turProj, spBot, spTop, houseCol, seamCol, 1.05, 1.25);
      }
    }

    // 3C. Dual Crew Cupola Hatches + Pintle .50 Cal Machine Gun (matching asset_sheet.png!)
    if (p.showCupolaHatches !== false) {
      const zHatchBase = zTurretTop + 0.01 * r * H;
      const zHatchTop = zTurretTop + 0.13 * r * H;

      // Port CITV / Sight Turret Box
      pushCylinderZ3D(turretFaces, turProj, -0.06 * r * tL, -0.22 * r * tW, zHatchBase, zHatchTop, 0.15 * r * tScale, 0.13 * r * tScale, 8, armorHi, seamCol, 1.0, 1.55);

      // Starboard Commander Cupola
      pushCylinderZ3D(turretFaces, turProj, 0.02 * r * tL, 0.22 * r * tW, zHatchBase, zHatchTop, 0.18 * r * tScale, 0.15 * r * tScale, 8, houseCol, seamCol, 1.0, 1.60);

      if (p.showPintleMG !== false) {
        pushPintleMG3D(turretFaces, turProj, r * tScale, 0.05 * r * tL, 0.22 * r * tW, zHatchTop, seamCol, 1.85);
      }

      if (isLaserVariant || (u && u.def && u.def.hasPointDefenseLaser)) {
        turretFaces.push({
          depth: turProj.project(-0.22 * r * tL, 0, zHatchTop + 0.08 * r * H).depth + 1.8,
          customDraw(c) {
            const pdlPt = turProj.project(-0.22 * r * tL, 0, zHatchTop + 0.06 * r * H);
            c.fillStyle = '#38bdf8';
            c.beginPath();
            c.arc(pdlPt.x, pdlPt.y, 3.2, 0, Math.PI * 2);
            c.fill();
            c.strokeStyle = seamCol;
            c.lineWidth = 1.0;
            c.stroke();
          }
        });
      }
    }

    // 3D. Twin Whip Antennas
    if (p.showWhipAntennas !== false) {
      const antH = (p.antennaHeight || 1.0) * 1.15 * r;
      const sway = Math.sin((treadPhase || 0) * Math.PI * 2) * 0.06 * r - recoil * 0.035 * r;
      for (const side of [-1, 1]) {
        const ax = -0.82 * r * tL;
        const ay = side * 0.39 * r * tW;
        const azPedTop = zTurretTop + 0.08 * r * H;
        turretFaces.push({
          depth: turProj.project(ax, ay, azPedTop + antH * 0.5).depth + 2.2,
          customDraw(c) {
            const pBase = turProj.project(ax, ay, zTurretTop);
            const pTip = turProj.project(ax - 0.12 * r + sway, ay + side * 0.03 * r, azPedTop + antH);
            c.strokeStyle = seamCol;
            c.lineWidth = 1.65;
            c.beginPath();
            c.moveTo(pBase.x, pBase.y);
            c.lineTo(pTip.x, pTip.y);
            c.stroke();
            c.fillStyle = houseHi;
            c.beginPath();
            c.arc(pTip.x, pTip.y, 1.3, 0, Math.PI * 2);
            c.fill();
          }
        });
      }
    }

    // 3E. 120mm Smoothbore Cannon Barrel with Bore Evacuator
    if (p.showCannonBarrel !== false) {
      const bLen = p.barrelLength || 1.0;
      const bThick = p.barrelThickness || 1.0;
      const boreScale = p.boreEvacuatorScale || 1.0;
      const elevRad = ((p.barrelElevation || 0) * Math.PI) / 180;
      const recDist = clamp(recoil * 0.055 * r, 0, 0.35 * r);

      const xRoot = 0.44 * r * tL - recDist;
      const zRoot = (zTurretBot + zTurretTop) * 0.52;
      const bandCol = (p.showBarrelBands !== false) ? houseCol : armorHi;
      const tubeCol = isLaserVariant ? '#e2e8f0' : armorBase;

      // Armored sloped mantlet housing block at cannon root (matching asset_sheet.png!)
      pushBox3D(turretFaces, turProj, 0.34 * r * tL, 0.64 * r * tL, -0.18 * r * tW, 0.18 * r * tW, zTurretBot + 0.06 * r * H, zTurretTop - 0.02 * r * H, armorHi, seamCol, 1.1, 1.38, 0.04 * r, 0.03 * r);

      pushTubeSegment3D(turretFaces, turProj, xRoot, 0, zRoot, elevRad, 0.00 * r * bLen, 0.52 * r * bLen, 0.12 * r * bThick, 0.095 * r * bThick, armorBase, seamCol, 1.0, 1.44);
      const bevR = 0.118 * r * bThick * boreScale;
      pushTubeSegment3D(turretFaces, turProj, xRoot, 0, zRoot, elevRad, 0.52 * r * bLen, 0.92 * r * bLen, 0.088 * r * bThick, 0.086 * r * bThick, tubeCol, seamCol, 0.9, 1.50);
      pushTubeSegment3D(turretFaces, turProj, xRoot, 0, zRoot, elevRad, 0.92 * r * bLen, 1.30 * r * bLen, bevR, bevR * 0.96, bandCol, seamCol, 1.05, 1.58);
      pushTubeSegment3D(turretFaces, turProj, xRoot, 0, zRoot, elevRad, 1.30 * r * bLen, 1.82 * r * bLen, 0.076 * r * bThick, 0.074 * r * bThick, tubeCol, seamCol, 0.9, 1.64);
      pushTubeSegment3D(turretFaces, turProj, xRoot, 0, zRoot, elevRad, 1.82 * r * bLen, 1.98 * r * bLen, 0.092 * r * bThick, 0.092 * r * bThick, bandCol, seamCol, 1.05, 1.70);

      const dTip = 1.98 * r * bLen;
      const tipProj = turProj.project(xRoot + Math.cos(elevRad) * dTip, 0, zRoot + Math.sin(elevRad) * dTip);
      turretFaces.push({
        depth: tipProj.depth + 1.85,
        customDraw(c) {
          c.fillStyle = isLaserVariant ? '#38bdf8' : seamCol;
          c.beginPath();
          c.arc(tipProj.x, tipProj.y, Math.max(1.6, 0.055 * r * bThick), 0, Math.PI * 2);
          c.fill();
        }
      });
    }

    flushFaces(ctx, turretFaces);

    if (recoil > 2.2 && p.showCannonBarrel !== false) {
      const bLen = p.barrelLength || 1.0;
      const elevRad = ((p.barrelElevation || 0) * Math.PI) / 180;
      const recDist = clamp(recoil * 0.055 * r, 0, 0.35 * r);
      const xRoot = 0.44 * r * tL - recDist;
      const zRoot = (zTurretBot + zTurretTop) * 0.52;
      const dTip = 2.02 * r * bLen;
      const mPt = turProj.project(xRoot + Math.cos(elevRad) * dTip, 0, zRoot + Math.sin(elevRad) * dTip);
      const flashR = (recoil / 6) * 0.48 * r;
      ctx.save();
      ctx.fillStyle = isLaserVariant ? 'rgba(56, 189, 248, 0.85)' : 'rgba(251, 191, 36, 0.88)';
      ctx.beginPath();
      ctx.arc(mPt.x, mPt.y, flashR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(mPt.x, mPt.y, flashR * 0.48, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ==========================================================================
  // 3. Unit #3 & #4: USA Paladin Tank & Laser Tank (Point-Defense Laser Dome)
  //    Matches assets/refs/usa_paladin_diorama_ref.png
  // ==========================================================================
  const PALADIN_DEFAULT_PARAMS = Object.assign({}, CRUSADER_DEFAULT_PARAMS, {
    hullScale: 1.06,
    hullLength: 1.04,
    hullWidth: 1.08,
    extrusionDepth: 1.04,
    turretScale: 1.08,
    turretWidth: 1.10,
    barrelLength: 1.08,
    barrelThickness: 1.10,
    pdlDomeScale: 1.0,
    pdlSweepSpeed: 1.0,
    eraSkirtScale: 1.0,
    bustleRackScale: 1.0,
    armorBaseColor: '#dfc08a',
    armorHighlightColor: '#f3dab0',
    armorShadowColor: '#a3804c',
    panelLineColor: '#26201b',
    houseColor: '#cca86e',
    pdlCrystalColor: '#38bdf8',
    eraBlockColor: '#b9935a',
    showPdlDome: true,
    showEraSkirts: true,
    showBustleAmmoRack: true,
    showLaserCoolingVents: true
  });

  const LASER_TANK_DEFAULT_PARAMS = Object.assign({}, PALADIN_DEFAULT_PARAMS, {
    armorBaseColor: '#cbd5e1',
    armorHighlightColor: '#f8fafc',
    armorShadowColor: '#64748b',
    houseColor: '#0ea5e9',
    pdlCrystalColor: '#22d3ee',
    eraBlockColor: '#475569',
    barrelThickness: 1.22
  });

  const PALADIN_PARAM_SCHEMA = [
    {
      group: '1. Heavy Armor Hull & Tracked Suspension',
      fields: [
        { key: 'hullScale', label: 'Overall Tank Scale', type: 'range', min: 0.80, max: 1.35, step: 0.02 },
        { key: 'hullLength', label: 'Glacis-to-Deck Length', type: 'range', min: 0.85, max: 1.25, step: 0.02 },
        { key: 'hullWidth', label: 'Armored Skirt Stance Width', type: 'range', min: 0.85, max: 1.28, step: 0.02 },
        { key: 'extrusionDepth', label: 'Vertical Armor Loft (3D)', type: 'range', min: 0.75, max: 1.40, step: 0.04 },
        { key: 'eraSkirtScale', label: 'Side ERA Skirt Plate Thickness', type: 'range', min: 0.60, max: 1.45, step: 0.05 }
      ]
    },
    {
      group: '2. 125mm Smoothbore / Plasma-Laser Turret',
      fields: [
        { key: 'turretScale', label: 'Cast Turret Volume', type: 'range', min: 0.80, max: 1.35, step: 0.02 },
        { key: 'turretWidth', label: 'Cheek Armor Width', type: 'range', min: 0.85, max: 1.30, step: 0.02 },
        { key: 'barrelLength', label: 'Main Cannon / Emitter Reach', type: 'range', min: 0.75, max: 1.45, step: 0.03 },
        { key: 'barrelThickness', label: 'Bore & Thermal Jacket Caliber', type: 'range', min: 0.75, max: 1.50, step: 0.04 },
        { key: 'bustleRackScale', label: 'Rear Bustle Blowout Rack', type: 'range', min: 0.65, max: 1.40, step: 0.05 }
      ]
    },
    {
      group: '3. Point-Defense Laser (PDL) Dome Assembly',
      fields: [
        { key: 'pdlDomeScale', label: 'PDL Crystal Turret Scale', type: 'range', min: 0.65, max: 1.50, step: 0.05 },
        { key: 'pdlSweepSpeed', label: 'Optical Tracking Sweep Rate', type: 'range', min: 0.0, max: 2.5, step: 0.1 },
        { key: 'weatheringIntensity', label: 'Desert Dust & Burn Scuff', type: 'range', min: 0.0, max: 1.0, step: 0.05 }
      ]
    },
    {
      group: '4. Ligne-Claire Tactical Palette',
      fields: [
        { key: 'armorBaseColor', label: 'Primary Composite Armor', type: 'color' },
        { key: 'armorHighlightColor', label: 'Top Glacis & Cheek Highlight', type: 'color' },
        { key: 'armorShadowColor', label: 'Lower Sponson Shadow', type: 'color' },
        { key: 'eraBlockColor', label: 'Reactive Skirt Armor Trim', type: 'color' },
        { key: 'pdlCrystalColor', label: 'PDL Emitter Prism Glow', type: 'color' },
        { key: 'panelLineColor', label: 'Ligne-Claire Espresso Ink', type: 'color' }
      ]
    },
    {
      group: '5. Sub-Assembly Visibility Toggles',
      fields: [
        { key: 'showPdlDome', label: 'Roof Point-Defense Laser (PDL) Dome', type: 'checkbox' },
        { key: 'showEraSkirts', label: 'Sloped Reactive Side Skirt Blocks', type: 'checkbox' },
        { key: 'showBustleAmmoRack', label: 'Turret Rear Blowout Ammo Rack', type: 'checkbox' },
        { key: 'showLaserCoolingVents', label: 'Cryogenic Laser Cooling Louvers', type: 'checkbox' },
        { key: 'showCompositePlates', label: 'Front Glacis Chobham Appliqué', type: 'checkbox' },
        { key: 'showExhaustGrille', label: 'Rear Turbine Exhaust Louvers', type: 'checkbox' }
      ]
    }
  ];

  const PALADIN_PRESETS = {
    DIORAMA_DEFAULT: Object.assign({}, PALADIN_DEFAULT_PARAMS),
    OPERATION_DESERT_SPEAR: Object.assign({}, PALADIN_DEFAULT_PARAMS, {
      armorBaseColor: '#e5c68b',
      armorHighlightColor: '#f8e2b8',
      armorShadowColor: '#a68249',
      eraBlockColor: '#c49b5d',
      pdlCrystalColor: '#38bdf8',
      weatheringIntensity: 0.55
    }),
    NATO_WOODLAND_HEAVY: Object.assign({}, PALADIN_DEFAULT_PARAMS, {
      armorBaseColor: '#5c6b4d',
      armorHighlightColor: '#7a8c68',
      armorShadowColor: '#3c4731',
      eraBlockColor: '#48543c',
      houseColor: '#eab308',
      pdlCrystalColor: '#22d3ee'
    }),
    ARCTIC_VANGUARD: Object.assign({}, PALADIN_DEFAULT_PARAMS, {
      armorBaseColor: '#dce4ec',
      armorHighlightColor: '#f8fafc',
      armorShadowColor: '#8fa1b3',
      eraBlockColor: '#64748b',
      houseColor: '#0284c7',
      pdlCrystalColor: '#0ea5e9'
    }),
    GENERAL_TOWNES_LASER_PROTOTYPE: Object.assign({}, LASER_TANK_DEFAULT_PARAMS, {
      pdlDomeScale: 1.18,
      barrelThickness: 1.28,
      pdlCrystalColor: '#38bdf8'
    })
  };

  function renderPaladinModel(ctx, u, faction, customParams, options) {
    const isLaserTank = u && u.defId === 'USA_LASER_TANK';
    const baseDef = isLaserTank ? LASER_TANK_DEFAULT_PARAMS : PALADIN_DEFAULT_PARAMS;
    const p = Object.assign({}, baseDef, customParams || {});
    const opts = options || {};

    // Render base heavy tank chassis & turret
    renderCrusaderModel(ctx, u, faction, Object.assign({}, p, { showPintleMG: false }), opts);

    const rawR = (u && u.radius) || 19;
    const r = rawR * (p.hullScale || 1.06);
    const L = p.hullLength || 1.04;
    const W = p.hullWidth || 1.08;
    const H = p.extrusionDepth || 1.04;
    const tScale = p.turretScale || 1.08;
    const hullAngle = (u && u.angle !== undefined) ? u.angle : 0;
    const turretAngle = (u && u.turretAngle !== undefined) ? u.turretAngle : hullAngle;
    const phase = (u && u.treadPhase) || (typeof performance !== 'undefined' ? (performance.now() * 0.002) % 1 : 0);
    const pitchScale = opts.pitchScale !== undefined ? opts.pitchScale : 1.0;
    const zScale = opts.zScale !== undefined ? opts.zScale : 0.42;
    const seamCol = p.panelLineColor || '#26201b';
    const isUnmanned = Boolean(u && u.unmanned);
    const eraCol = isUnmanned ? '#475569' : (p.eraBlockColor || '#b9935a');
    const crystalCol = isUnmanned ? '#64748b' : (p.pdlCrystalColor || '#38bdf8');

    const hullProj = createProjector(hullAngle, pitchScale, zScale, 0, 0, 0, 0);
    const turProj = createProjector(turretAngle, pitchScale, zScale, -0.04 * r, 0, 0, hullAngle);
    const extraFaces = [];

    // 1. Sloped Explosive Reactive Armor (ERA) Side Skirt Blocks (distinguishes Paladin hull from Crusader)
    if (p.showEraSkirts !== false) {
      const eScale = p.eraSkirtScale || 1.0;
      for (const side of [-1, 1]) {
        const yIn = side * 0.80 * r * W;
        const yOut = side * (0.80 + 0.08 * eScale) * r * W;
        const yMin = Math.min(yIn, yOut);
        const yMax = Math.max(yIn, yOut);
        for (let bi = 0; bi < 4; bi++) {
          const x0 = (-0.64 + bi * 0.34) * r * L;
          const x1 = x0 + 0.29 * r * L;
          pushBox3D(extraFaces, hullProj, x0, x1, yMin, yMax, 0.24 * r * H, 0.48 * r * H, eraCol, seamCol, 0.95, 1.15);
        }
      }
    }

    // 2. Extended Turret Bustle Ammo Rack + Laser Tank Cryogenic Cooling Radiators
    if (p.showBustleAmmoRack !== false) {
      const bScale = (p.bustleRackScale || 1.0) * tScale;
      pushBox3D(
        extraFaces,
        turProj,
        -0.88 * r * bScale,
        -0.56 * r * tScale,
        -0.46 * r * tScale,
        0.46 * r * tScale,
        0.58 * r * H,
        0.84 * r * H,
        eraCol,
        seamCol,
        1.05,
        1.85
      );
    }

    if (isLaserTank && p.showLaserCoolingVents !== false) {
      // Glowing cyan plasma-capacitor coils on turret cheeks & barrel collar
      for (const side of [-1, 1]) {
        const cy0 = side * 0.42 * r * tScale;
        const cy1 = side * 0.56 * r * tScale;
        pushBox3D(
          extraFaces,
          turProj,
          -0.36 * r * tScale,
          0.22 * r * tScale,
          Math.min(cy0, cy1),
          Math.max(cy0, cy1),
          0.62 * r * H,
          0.82 * r * H,
          crystalCol,
          seamCol,
          0.95,
          1.95
        );
      }
    }

    // 3. Roof Point-Defense Laser (PDL) Dome Turret (matching usa_paladin_diorama_ref.png!)
    const zBase = 0.90 * r * H;
    const dScale = (p.pdlDomeScale || 1.0) * tScale;
    const dx = -0.10 * r;
    const dy = -0.18 * r;

    if (p.showPdlDome !== false) {
      // Armored collar base
      pushCylinderZ3D(extraFaces, turProj, dx, dy, zBase, zBase + 0.12 * r * H, 0.23 * r * dScale, 0.19 * r * dScale, 8, p.armorBaseColor, seamCol, 1.05, 2.0);
      // Glowing Cyan Crystal Emitter Dome
      pushCylinderZ3D(extraFaces, turProj, dx, dy, zBase + 0.12 * r * H, zBase + 0.31 * r * H, 0.19 * r * dScale, 0.12 * r * dScale, 8, crystalCol, seamCol, 1.05, 2.15);
      // Top armored cap ring
      pushCylinderZ3D(extraFaces, turProj, dx, dy, zBase + 0.31 * r * H, zBase + 0.35 * r * H, 0.11 * r * dScale, 0.08 * r * dScale, 8, eraCol, seamCol, 0.95, 2.25);
    }

    flushFaces(ctx, extraFaces);

    if (p.showPdlDome !== false) {
      // Specular white highlight + rotating 3D PDL laser emitter sweep
      const topPt = turProj.project(dx - 0.04 * r, dy - 0.04 * r, zBase + 0.25 * r * H);
      const domeCenter = turProj.project(dx, dy, zBase + 0.22 * r * H);
      const sweepA = phase * Math.PI * 4 * (p.pdlSweepSpeed !== undefined ? p.pdlSweepSpeed : 1.0);
      const tipPt = turProj.project(dx + Math.cos(sweepA) * 0.30 * r * dScale, dy + Math.sin(sweepA) * 0.30 * r * dScale, zBase + 0.24 * r * H);
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.88)';
      ctx.lineWidth = Math.max(1.4, 0.06 * r);
      ctx.beginPath();
      ctx.moveTo(domeCenter.x, domeCenter.y);
      ctx.lineTo(tipPt.x, tipPt.y);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.beginPath();
      ctx.arc(topPt.x, topPt.y, Math.max(1.6, 0.06 * r * dScale), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ==========================================================================
  // 4. Unit #5 & #6: USA Humvee Scout & Avenger Air-Defense Vehicle
  //    Matches assets/refs/usa_humvee_diorama_ref.png
  // ==========================================================================
  const HUMVEE_DEFAULT_PARAMS = {
    hullScale: 1.0,
    hullLength: 1.0,
    hullWidth: 1.0,
    extrusionDepth: 1.0,
    wheelScale: 1.0,
    wheelTrackWidth: 1.0,
    turretScale: 1.0,
    towPodScale: 1.0,
    brushGuardScale: 1.0,
    weatheringIntensity: 0.25,
    armorBaseColor: '#d7b57d',
    armorHighlightColor: '#ecd0a0',
    armorShadowColor: '#9c7a49',
    panelLineColor: '#26201b',
    glassColor: '#6cb4d8',
    podColor: '#687550',
    tireColor: '#332f2c',
    missileTipColor: '#dc2626',
    showWheels: true,
    showBrushGuardWinch: true,
    showDoorXStamps: true,
    showWindshield: true,
    showHoodGrille: true,
    showRearCargoHatch: true,
    showSnorkelStack: true,
    showRoofTurret: true,
    showTowPod: true,
    showWhipAntenna: true
  };

  const AVENGER_DEFAULT_PARAMS = Object.assign({}, HUMVEE_DEFAULT_PARAMS, {
    hullScale: 1.04,
    turretScale: 1.12,
    podColor: '#6b7a52'
  });

  const HUMVEE_PARAM_SCHEMA = [
    {
      group: '1. M1114 Up-Armored 4×4 Chassis & Tires',
      fields: [
        { key: 'hullScale', label: 'Overall Vehicle Scale', type: 'range', min: 0.75, max: 1.35, step: 0.02 },
        { key: 'hullLength', label: 'Wheelbase & Chassis Length', type: 'range', min: 0.80, max: 1.25, step: 0.02 },
        { key: 'hullWidth', label: 'Armored Body Width', type: 'range', min: 0.80, max: 1.25, step: 0.02 },
        { key: 'extrusionDepth', label: 'Cab Roof Height (3D Loft)', type: 'range', min: 0.70, max: 1.40, step: 0.04 },
        { key: 'wheelScale', label: '37-Inch Baja Tire Diameter', type: 'range', min: 0.75, max: 1.35, step: 0.04 },
        { key: 'wheelTrackWidth', label: 'Portal Axle Track Stance', type: 'range', min: 0.85, max: 1.25, step: 0.03 }
      ]
    },
    {
      group: '2. Roof Weapon Station / Avenger Pedestal',
      fields: [
        { key: 'turretScale', label: 'Roof Turret / Pedestal Scale', type: 'range', min: 0.70, max: 1.45, step: 0.04 },
        { key: 'towPodScale', label: 'BGM-71 TOW / Stinger Pod Size', type: 'range', min: 0.65, max: 1.45, step: 0.05 },
        { key: 'brushGuardScale', label: 'Front Bull-Bar & Winch Scale', type: 'range', min: 0.65, max: 1.40, step: 0.05 }
      ]
    },
    {
      group: '3. Weathering & Trim Calibration',
      fields: [
        { key: 'weatheringIntensity', label: 'Mud & Desert Dust Scuff', type: 'range', min: 0.0, max: 1.0, step: 0.05 }
      ]
    },
    {
      group: '4. Ligne-Claire Tactical Palette',
      fields: [
        { key: 'armorBaseColor', label: 'Desert CARC Body Tan', type: 'color' },
        { key: 'armorHighlightColor', label: 'Hood & Roof Highlight', type: 'color' },
        { key: 'armorShadowColor', label: 'Rocker & Fender Shadow', type: 'color' },
        { key: 'podColor', label: 'Turret / Missile Pod Olive', type: 'color' },
        { key: 'glassColor', label: 'Ballistic Windshield Tint', type: 'color' },
        { key: 'tireColor', label: 'Off-Road Tire Compound', type: 'color' },
        { key: 'missileTipColor', label: 'Seeker Warhead Nose Cap', type: 'color' },
        { key: 'panelLineColor', label: 'Ligne-Claire Espresso Ink', type: 'color' }
      ]
    },
    {
      group: '5. Component Visibility Toggles',
      fields: [
        { key: 'showWheels', label: '4×4 Off-Road Tires & CTIS Hubs', type: 'checkbox' },
        { key: 'showBrushGuardWinch', label: 'Tubular Front Brush Guard & Winch', type: 'checkbox' },
        { key: 'showHoodGrille', label: '7-Slot Grille & Louvered Hood Vent', type: 'checkbox' },
        { key: 'showWindshield', label: '2-Pane Ballistic Windshield', type: 'checkbox' },
        { key: 'showDoorXStamps', label: 'X-Stamped Up-Armored Crew Doors', type: 'checkbox' },
        { key: 'showRearCargoHatch', label: 'Slanted Rear Cargo Bed Hatch', type: 'checkbox' },
        { key: 'showSnorkelStack', label: 'Fording Air Intake Snorkel', type: 'checkbox' },
        { key: 'showRoofTurret', label: 'Roof Gunner Ring / Avenger Turret', type: 'checkbox' },
        { key: 'showTowPod', label: 'BGM-71 TOW Launcher / Stinger Pods', type: 'checkbox' },
        { key: 'showWhipAntenna', label: 'Rear SINCGARS Whip Antenna', type: 'checkbox' }
      ]
    }
  ];

  const HUMVEE_PRESETS = {
    DIORAMA_DEFAULT: Object.assign({}, HUMVEE_DEFAULT_PARAMS),
    OPERATION_IRAQI_FREEDOM: Object.assign({}, HUMVEE_DEFAULT_PARAMS, {
      armorBaseColor: '#dfc088',
      armorHighlightColor: '#f5dcb0',
      podColor: '#5c6b4d',
      weatheringIntensity: 0.45
    }),
    NATO_RECON_OLIVE: Object.assign({}, HUMVEE_DEFAULT_PARAMS, {
      armorBaseColor: '#5b6b4c',
      armorHighlightColor: '#788a65',
      armorShadowColor: '#3c4731',
      podColor: '#434f37',
      glassColor: '#7dd3fc'
    }),
    SPEC_OPS_NIGHT_RAID: Object.assign({}, HUMVEE_DEFAULT_PARAMS, {
      armorBaseColor: '#334155',
      armorHighlightColor: '#475569',
      armorShadowColor: '#1e293b',
      podColor: '#1f2937',
      glassColor: '#38bdf8'
    }),
    ARCTIC_PATROL_WINTER: Object.assign({}, HUMVEE_DEFAULT_PARAMS, {
      armorBaseColor: '#e2e8f0',
      armorHighlightColor: '#f8fafc',
      armorShadowColor: '#94a3b8',
      podColor: '#64748b'
    })
  };

  const AVENGER_PRESETS = {
    DIORAMA_DEFAULT: Object.assign({}, AVENGER_DEFAULT_PARAMS),
    SHORAD_DESERT_BATTERY: Object.assign({}, AVENGER_DEFAULT_PARAMS, {
      armorBaseColor: '#e2c289',
      podColor: '#586949',
      turretScale: 1.18
    }),
    NATO_AIR_DEFENSE: Object.assign({}, AVENGER_DEFAULT_PARAMS, {
      armorBaseColor: '#5b6b4c',
      armorHighlightColor: '#788a65',
      armorShadowColor: '#3c4731',
      podColor: '#3f4d34'
    }),
    TOWNES_LASER_SHORAD: Object.assign({}, AVENGER_DEFAULT_PARAMS, {
      armorBaseColor: '#cbd5e1',
      armorHighlightColor: '#f8fafc',
      armorShadowColor: '#64748b',
      podColor: '#0284c7',
      missileTipColor: '#38bdf8'
    }),
    URBAN_CAMO_DEFENDER: Object.assign({}, AVENGER_DEFAULT_PARAMS, {
      armorBaseColor: '#64748b',
      armorHighlightColor: '#94a3b8',
      armorShadowColor: '#334155',
      podColor: '#475569'
    })
  };

  function renderHumveeOrAvengerModel(ctx, u, faction, customParams, options) {
    const isAvenger = u && u.defId === 'USA_AVENGER';
    const baseDef = isAvenger ? AVENGER_DEFAULT_PARAMS : HUMVEE_DEFAULT_PARAMS;
    const p = Object.assign({}, baseDef, customParams || {});
    const opts = options || {};

    const rawR = (u && u.radius) || 15;
    const r = rawR * (p.hullScale || 1.0);
    const L = p.hullLength || 1.0;
    const W = p.hullWidth || 1.0;
    const H = p.extrusionDepth || 1.0;
    const wScale = p.wheelScale || 1.0;
    const trackW = p.wheelTrackWidth || 1.0;

    const hullAngle = (u && u.angle !== undefined) ? u.angle : 0;
    const turretAngle = (u && u.turretAngle !== undefined) ? u.turretAngle : hullAngle;
    const recoil = (u && u.recoilOffset) || 0;
    const treadPhase = (u && u.treadPhase) || 0;
    const pitchScale = opts.pitchScale !== undefined ? opts.pitchScale : 1.0;
    const zScale = opts.zScale !== undefined ? opts.zScale : 0.42;

    const isUnmanned = Boolean(u && u.unmanned);
    const armorBase = isUnmanned ? '#64748b' : (p.armorBaseColor || '#d7b57d');
    const armorHi = isUnmanned ? '#94a3b8' : (p.armorHighlightColor || '#ecd0a0');
    const armorDark = isUnmanned ? '#334155' : (p.armorShadowColor || '#9c7a49');
    const seamCol = p.panelLineColor || '#26201b';
    const glassCol = p.glassColor || '#6cb4d8';
    const podCol = isUnmanned ? '#475569' : (p.podColor || '#687550');
    const tireCol = p.tireColor || '#332f2c';
    const tipCol = p.missileTipColor || '#dc2626';

    const hullProj = createProjector(hullAngle, pitchScale, zScale, 0, 0, 0, 0);

    // Drop shadow
    const shadowPts = [
      hullProj.project(-1.14 * r * L, -0.84 * r * W, 0),
      hullProj.project(1.18 * r * L, -0.84 * r * W, 0),
      hullProj.project(1.18 * r * L, 0.84 * r * W, 0),
      hullProj.project(-1.14 * r * L, 0.84 * r * W, 0)
    ].map((pt) => ({ x: pt.x + 3.0, y: pt.y + 4.0 }));
    drawPolyPts(ctx, shadowPts, 'rgba(65, 50, 40, 0.35)', null, 0);

    const faces = [];

    // 1. 4×4 Off-Road Tires with Tan 6-Bolt CTIS Wheel Hubs
    if (p.showWheels !== false) {
      const wheelR = 0.34 * r * wScale;
      pushWheelAxle3D(faces, hullProj, r, -0.68 * r * L, 0.50 * r * W * trackW, 0.83 * r * W * trackW, wheelR, tireCol, armorDark, seamCol, treadPhase, -1.5);
      pushWheelAxle3D(faces, hullProj, r, 0.68 * r * L, 0.50 * r * W * trackW, 0.83 * r * W * trackW, wheelR, tireCol, armorDark, seamCol, treadPhase, -1.5);
    }

    // 2. Lower Armored Body (Hood + Side Doors + Rear Sloped Cargo Bed)
    const zBot = 0.20 * r * H;
    const zBelt = 0.54 * r * H;
    const zRoof = 0.88 * r * H;
    const yBody = 0.74 * r * W;

    pushBox3D(faces, hullProj, -1.08 * r * L, 1.10 * r * L, -yBody, yBody, zBot, zBelt, armorBase, seamCol, 1.15, 0, 0.04 * r * L, 0.03 * r * W);

    // 2b. Front Tubular Brush Guard + Warn Winch Housing
    if (p.showBrushGuardWinch !== false) {
      const bgS = p.brushGuardScale || 1.0;
      pushBox3D(faces, hullProj, 1.08 * r * L, (1.08 + 0.11 * bgS) * r * L, -0.56 * r * W, 0.56 * r * W, zBot - 0.02 * r * H, zBot + 0.18 * r * H, '#3d3934', seamCol, 1.0, 0.35);
      // Winch drum in center bumper
      pushBox3D(faces, hullProj, 1.11 * r * L, (1.11 + 0.09 * bgS) * r * L, -0.20 * r * W, 0.20 * r * W, zBot + 0.02 * r * H, zBot + 0.22 * r * H, armorDark, seamCol, 0.95, 0.45);
    }

    // 3. Upper Armored Crew Cabin + Sloped Fastback Rear Trunk
    const cabBot = [
      [-0.86 * r * L, -yBody * 0.96, zBelt],
      [0.36 * r * L, -yBody * 0.96, zBelt],
      [0.36 * r * L, yBody * 0.96, zBelt],
      [-0.86 * r * L, yBody * 0.96, zBelt]
    ];
    const cabTop = [
      [-0.58 * r * L, -yBody * 0.84, zRoof],
      [0.18 * r * L, -yBody * 0.84, zRoof],
      [0.18 * r * L, yBody * 0.84, zRoof],
      [-0.58 * r * L, yBody * 0.84, zRoof]
    ];
    pushFrustumFaces(faces, hullProj, cabBot, cabTop, armorBase, seamCol, 1.15, 0.45);

    // 3b. Slanted Rear Cargo Hatch & Tie-Down Straps
    if (p.showRearCargoHatch !== false) {
      faces.push({
        depth: hullProj.project(-0.82 * r * L, 0, (zBelt + zRoof) * 0.5).depth + 0.58,
        customDraw(c) {
          const hatchPts = [
            hullProj.project(-0.84 * r * L, -yBody * 0.72, zBelt + 0.03 * r * H),
            hullProj.project(-0.59 * r * L, -yBody * 0.68, zRoof - 0.03 * r * H),
            hullProj.project(-0.59 * r * L, yBody * 0.68, zRoof - 0.03 * r * H),
            hullProj.project(-0.84 * r * L, yBody * 0.72, zBelt + 0.03 * r * H)
          ];
          drawPolyPts(c, hatchPts, armorHi, seamCol, 0.95);
          drawLine3D(c, hullProj, -0.84 * r * L, 0, zBelt + 0.03 * r * H, -0.59 * r * L, 0, zRoof - 0.03 * r * H, seamCol, 0.85);
        }
      });
    }

    // 3c. Deep-Water Fording Snorkel Stack on Right Windshield A-Pillar
    if (p.showSnorkelStack !== false) {
      pushCylinderZ3D(faces, hullProj, 0.28 * r * L, 0.68 * r * W, zBelt, zRoof + 0.14 * r * H, 0.055 * r, 0.05 * r, 6, '#332f2c', seamCol, 0.9, 0.82);
    }

    // 4. Hood Louvered Grille, 7-Slot Front Grille & Headlights (matching usa_humvee_diorama_ref.png!)
    if (p.showHoodGrille !== false) {
      faces.push({
        depth: hullProj.project(0.74 * r * L, 0, zBelt + 0.02 * r).depth + 0.65,
        customDraw(c) {
          const hz = zBelt + 0.01 * r * H;
          const hPts = [
            hullProj.project(0.48 * r * L, -0.32 * r * W, hz),
            hullProj.project(0.88 * r * L, -0.28 * r * W, hz),
            hullProj.project(0.88 * r * L, 0.28 * r * W, hz),
            hullProj.project(0.48 * r * L, 0.32 * r * W, hz)
          ];
          drawPolyPts(c, hPts, '#3d3934', seamCol, 0.95);
          for (let lx = 0.54; lx <= 0.83; lx += 0.07) {
            drawLine3D(c, hullProj, lx * r * L, -0.25 * r * W, hz, lx * r * L, 0.25 * r * W, hz, seamCol, 0.85);
          }

          // Front 7-slot grille + round headlights + amber turn indicators
          const fx = 1.09 * r * L;
          for (let gy = -0.30; gy <= 0.30; gy += 0.10) {
            drawLine3D(c, hullProj, fx, gy * r * W, zBot + 0.07 * r * H, fx, gy * r * W, zBelt - 0.06 * r * H, seamCol, 1.25);
          }
          for (const side of [-1, 1]) {
            const hlPt = hullProj.project(fx, side * 0.46 * r * W, (zBot + zBelt) * 0.52);
            c.fillStyle = '#fef3c7';
            c.strokeStyle = seamCol;
            c.lineWidth = 0.9;
            c.beginPath();
            c.arc(hlPt.x, hlPt.y, Math.max(1.6, 0.075 * r), 0, Math.PI * 2);
            c.fill();
            c.stroke();

            const ambPt = hullProj.project(fx - 0.02 * r * L, side * 0.62 * r * W, (zBot + zBelt) * 0.52);
            c.fillStyle = '#f59e0b';
            c.beginPath();
            c.arc(ambPt.x, ambPt.y, Math.max(1.2, 0.055 * r), 0, Math.PI * 2);
            c.fill();
            c.stroke();
          }
        }
      });
    }

    // 5. 2-Pane Blue-Tinted Armored Windshield + Wipers
    if (p.showWindshield !== false) {
      faces.push({
        depth: hullProj.project(0.32 * r * L, 0, (zBelt + zRoof) * 0.52).depth + 0.72,
        customDraw(c) {
          for (const side of [-1, 1]) {
            const y0 = side * 0.05 * r * W;
            const y1 = side * 0.62 * r * W;
            const quad = [
              [0.35 * r * L, y0, zBelt + 0.04 * r * H],
              [0.35 * r * L, y1, zBelt + 0.04 * r * H],
              [0.19 * r * L, y1 * 0.94, zRoof - 0.04 * r * H],
              [0.19 * r * L, y0, zRoof - 0.04 * r * H]
            ];
            drawGlassPane3D(c, hullProj, quad, glassCol, seamCol, 1.05);
          }
        }
      });
    }

    // 6. Side Armored Doors with Iconic X-Stamp & Side Glass Windows
    if (p.showDoorXStamps !== false) {
      for (const side of [-1, 1]) {
        const yDoor = side * yBody * 0.98;
        faces.push({
          depth: hullProj.project(-0.12 * r * L, yDoor, (zBot + zRoof) * 0.5).depth + 0.62,
          customDraw(c) {
            for (const dxCenter of [-0.28 * r * L, 0.08 * r * L]) {
              drawLine3D(c, hullProj, dxCenter - 0.11 * r * L, yDoor, zBot + 0.06 * r * H, dxCenter + 0.11 * r * L, yDoor, zBelt - 0.05 * r * H, seamCol, 0.95);
              drawLine3D(c, hullProj, dxCenter + 0.11 * r * L, yDoor, zBot + 0.06 * r * H, dxCenter - 0.11 * r * L, yDoor, zBelt - 0.05 * r * H, seamCol, 0.95);
              const winQuad = [
                [dxCenter - 0.11 * r * L, yDoor * 0.96, zBelt + 0.05 * r * H],
                [dxCenter + 0.11 * r * L, yDoor * 0.96, zBelt + 0.05 * r * H],
                [dxCenter + 0.09 * r * L, yDoor * 0.88, zRoof - 0.06 * r * H],
                [dxCenter - 0.09 * r * L, yDoor * 0.88, zRoof - 0.06 * r * H]
              ];
              drawGlassPane3D(c, hullProj, winQuad, glassCol, seamCol, 0.9);
            }
          }
        });
      }
    }

    // 7. Rear Whip Antenna
    if (p.showWhipAntenna !== false) {
      const ax = -0.92 * r * L;
      const ay = -0.58 * r * W;
      faces.push({
        depth: hullProj.project(ax, ay, zBelt + 0.5 * r).depth + 1.2,
        customDraw(c) {
          drawLine3D(c, hullProj, ax, ay, zBelt, ax - 0.06 * r, ay, zBelt + 0.95 * r * H, seamCol, 1.65);
        }
      });
    }

    flushFaces(ctx, faces);

    // 8. Rotating Roof Turret:
    //    - Avenger: Olive-drab AN/TWQ-1 pedestal with twin 4-cell missile/laser pods + FLIR cupola
    //    - Humvee: Up-armored gunner shield ring with .50 cal M2HB + BGM-71 TOW launcher tube
    if (p.showRoofTurret !== false) {
      const tScale = p.turretScale || 1.0;
      const towScale = p.towPodScale || 1.0;
      const turProj = createProjector(turretAngle, pitchScale, zScale, -0.18 * r * L, 0, 0, hullAngle);
      const turFaces = [];
      const zTurBase = zRoof + 0.01 * r * H;
      const recDist = clamp(recoil * 0.03 * r, 0, 0.16 * r);

      // Circular olive/tan turret ring pedestal
      pushCylinderZ3D(turFaces, turProj, 0, 0, zTurBase, zTurBase + 0.14 * r * H * tScale, 0.34 * r * tScale, 0.28 * r * tScale, 8, podCol, seamCol, 1.05, 1.5);

      if (isAvenger) {
        // Central operator cabin / FLIR sensor mast + glowing cyan target acquisition optics
        pushBox3D(turFaces, turProj, -0.22 * r * tScale, 0.22 * r * tScale, -0.15 * r * tScale, 0.15 * r * tScale, zTurBase + 0.12 * r * H * tScale, zTurBase + 0.48 * r * H * tScale, podCol, seamCol, 1.05, 1.65);
        // Front FLIR glass window on central Avenger turret
        turFaces.push({
          depth: turProj.project(0.23 * r * tScale, 0, zTurBase + 0.34 * r * H * tScale).depth + 1.72,
          customDraw(c) {
            const flirQuad = [
              [0.23 * r * tScale, -0.10 * r * tScale, zTurBase + 0.24 * r * H * tScale],
              [0.23 * r * tScale, 0.10 * r * tScale, zTurBase + 0.24 * r * H * tScale],
              [0.23 * r * tScale, 0.10 * r * tScale, zTurBase + 0.42 * r * H * tScale],
              [0.23 * r * tScale, -0.10 * r * tScale, zTurBase + 0.42 * r * H * tScale]
            ];
            drawGlassPane3D(c, turProj, flirQuad, '#38bdf8', seamCol, 0.9);
          }
        });

        // Twin 4-Cell Rectangular Missile/Laser Pods on Left & Right
        if (p.showTowPod !== false) {
          for (const side of [-1, 1]) {
            const py0 = side * 0.16 * r * tScale;
            const py1 = side * (0.16 + 0.32 * towScale) * r * tScale;
            const yMin = Math.min(py0, py1);
            const yMax = Math.max(py0, py1);
            const pz0 = zTurBase + 0.22 * r * H * tScale;
            const pz1 = zTurBase + (0.22 + 0.34 * towScale) * r * H * tScale;
            const px0 = -0.44 * r * tScale * towScale - recDist;
            const px1 = 0.38 * r * tScale * towScale - recDist;
            pushBox3D(turFaces, turProj, px0, px1, yMin, yMax, pz0, pz1, podCol, seamCol, 1.1, 1.75);

            // 4 Seeker Missile Cells on Front Face of Each Pod (2×2 grid matching usa_humvee_diorama_ref.png!)
            const frontDepth = turProj.project(px1 + 0.02 * r, (yMin + yMax) * 0.5, (pz0 + pz1) * 0.5).depth + 1.95;
            turFaces.push({
              depth: frontDepth,
              customDraw(c) {
                for (const cyFrac of [0.30, 0.70]) {
                  for (const czFrac of [0.30, 0.70]) {
                    const cy = yMin + (yMax - yMin) * cyFrac;
                    const cz = pz0 + (pz1 - pz0) * czFrac;
                    const pt = turProj.project(px1 + 0.01 * r, cy, cz);
                    c.fillStyle = tipCol;
                    c.strokeStyle = seamCol;
                    c.lineWidth = 0.85;
                    c.beginPath();
                    c.arc(pt.x, pt.y, Math.max(1.3, 0.048 * r * tScale), 0, Math.PI * 2);
                    c.fill();
                    c.stroke();
                  }
                }
              }
            });
          }
        }
      } else {
        // Humvee Up-Armored Gunner Shield Flaps + .50 Cal M2HB + Side BGM-71 TOW Missile Tube
        for (const side of [-1, 1]) {
          const sy = side * 0.24 * r * tScale;
          pushBox3D(turFaces, turProj, -0.20 * r * tScale, 0.22 * r * tScale, sy - 0.02 * r, sy + 0.02 * r, zTurBase + 0.12 * r * H, zTurBase + 0.30 * r * H, armorBase, seamCol, 0.95, 1.72);
        }
        pushPintleMG3D(turFaces, turProj, r * tScale * 1.15, 0.06 * r - recDist, 0, zTurBase + 0.10 * r * H, seamCol, 1.85);
        if (p.showTowPod !== false) {
          pushBox3D(turFaces, turProj, -0.26 * r * tScale * towScale - recDist, 0.38 * r * tScale * towScale - recDist, -0.36 * r * tScale, -0.18 * r * tScale, zTurBase + 0.16 * r * H, zTurBase + 0.32 * r * H, podCol, seamCol, 1.0, 1.80);
          // Red TOW tube nose cap
          turFaces.push({
            depth: turProj.project(0.40 * r * tScale * towScale - recDist, -0.27 * r * tScale, zTurBase + 0.24 * r * H).depth + 1.92,
            customDraw(c) {
              const pt = turProj.project(0.39 * r * tScale * towScale - recDist, -0.27 * r * tScale, zTurBase + 0.24 * r * H);
              c.fillStyle = tipCol;
              c.strokeStyle = seamCol;
              c.lineWidth = 0.85;
              c.beginPath();
              c.arc(pt.x, pt.y, Math.max(1.4, 0.055 * r * tScale), 0, Math.PI * 2);
              c.fill();
              c.stroke();
            }
          });
        }
      }

      flushFaces(ctx, turFaces);

      // Muzzle / Laser Flash when firing
      if (recoil > 0.8) {
        const muzPt = turProj.project(0.56 * r * tScale, isAvenger ? 0.30 * r * tScale : 0, zTurBase + 0.36 * r * H * tScale);
        const fR = Math.max(2.5, (recoil / 6) * 0.32 * r);
        ctx.save();
        ctx.fillStyle = isAvenger ? 'rgba(56, 189, 248, 0.90)' : 'rgba(251, 191, 36, 0.92)';
        ctx.beginPath();
        ctx.arc(muzPt.x, muzPt.y, fR, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(muzPt.x, muzPt.y, fR * 0.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  // ==========================================================================
  // 5. Unit #7: USA Tomahawk Cruise Missile Launcher (8×8 Heavy HEMTT Truck)
  //    Matches assets/refs/usa_tomahawk_diorama_ref.png
  // ==========================================================================
  const TOMAHAWK_DEFAULT_PARAMS = {
    // 1. 8×8 HEMTT Chassis & Cab Proportions
    hullScale: 1.0,
    hullLength: 1.0,
    hullWidth: 1.0,
    extrusionDepth: 1.0,
    wheelRadiusScale: 1.0,

    // 2. Hydraulic Erector-Launcher Box
    launcherElevation: 20,
    launcherScale: 1.0,
    gantryArchScale: 1.0,

    // 3. BGM-109 Tomahawk Cruise Missile
    missileScale: 1.0,
    missileWingSpan: 1.0,

    // 4. Diorama Vector-Cel Palette (Matches usa_tomahawk_diorama_ref.png)
    armorBaseColor: '#d8b77e',
    armorHighlightColor: '#eed3a2',
    armorShadowColor: '#9c7a49',
    panelLineColor: '#26201b',
    wheelHubColor: '#c9a66b',
    glassColor: '#69b9e0',
    missileBodyColor: '#f8fafc',
    missileFinColor: '#ef4444',
    houseColorMode: 'CUSTOM',
    houseColor: '#c9a66b',
    weatheringIntensity: 0.85,

    // 5. Component Layer Visibility & Detail Toggles
    showEightWheels: true,
    showWheelFenders: true,
    showMidFuelTanks: true,
    showBoardingSteps: true,
    showCrewCab: true,
    showFrontBumperGrille: true,
    showWindshieldGlass: true,
    showSideMirrors: true,
    showRoofDetails: true,
    showEngineDeck: true,
    showLauncherBox: true,
    showHydraulicRams: true,
    showLaunchTubeCells: true,
    showRollBarGantry: true,
    showMissile: true,
    showMissileWings: true
  };

  const TOMAHAWK_PRESETS = {
    DIORAMA_DEFAULT: {
      name: '🎨 Diorama Vector-Cel (Blueprint Default)',
      params: Object.assign({}, TOMAHAWK_DEFAULT_PARAMS)
    },
    HIGH_ANGLE_SALVO: {
      name: '🚀 High-Elevation Siege Salvo (34° Pitch)',
      params: Object.assign({}, TOMAHAWK_DEFAULT_PARAMS, {
        launcherElevation: 34,
        gantryArchScale: 1.08,
        missileScale: 1.06,
        missileWingSpan: 1.12
      })
    },
    DESERT_STORM_HEMTT: {
      name: '🏜️ Operation Desert Storm (Oshkosh Sand)',
      params: Object.assign({}, TOMAHAWK_DEFAULT_PARAMS, {
        armorBaseColor: '#dfc28d',
        armorHighlightColor: '#f5deb3',
        armorShadowColor: '#a6824c',
        wheelHubColor: '#d2b076',
        houseColorMode: 'CUSTOM',
        houseColor: '#6b705c',
        launcherElevation: 22
      })
    },
    NATO_WOODLAND: {
      name: '🌲 NATO Woodland Camo (European Theater)',
      params: Object.assign({}, TOMAHAWK_DEFAULT_PARAMS, {
        armorBaseColor: '#78866b',
        armorHighlightColor: '#96a688',
        armorShadowColor: '#4f5946',
        wheelHubColor: '#69755d',
        houseColorMode: 'CUSTOM',
        houseColor: '#475569',
        missileBodyColor: '#e2e8f0',
        missileFinColor: '#dc2626'
      })
    },
    GEN_ALEXANDER_THERMOBARIC: {
      name: '⚡ Gen. Alexander Thermobaric Tomahawk',
      params: Object.assign({}, TOMAHAWK_DEFAULT_PARAMS, {
        armorBaseColor: '#cbb793',
        armorHighlightColor: '#e5d5b5',
        armorShadowColor: '#857456',
        wheelHubColor: '#94a3b8',
        houseColorMode: 'CUSTOM',
        houseColor: '#0284c7',
        missileBodyColor: '#f1f5f9',
        missileFinColor: '#f59e0b',
        launcherElevation: 26,
        missileScale: 1.08
      })
    }
  };

  const TOMAHAWK_PARAM_SCHEMA = [
    {
      group: '1. 8×8 HEMTT Chassis & Cab Proportions',
      fields: [
        { key: 'hullScale', label: 'Overall Unit Scale', type: 'range', min: 0.75, max: 1.35, step: 0.02 },
        { key: 'hullLength', label: '8×8 Truck Chassis Length', type: 'range', min: 0.85, max: 1.25, step: 0.02 },
        { key: 'hullWidth', label: 'Chassis & Cab Width', type: 'range', min: 0.85, max: 1.25, step: 0.02 },
        { key: 'extrusionDepth', label: 'Vertical 3D Height Scale', type: 'range', min: 0.75, max: 1.35, step: 0.02 },
        { key: 'wheelRadiusScale', label: 'Off-Road Tire Diameter', type: 'range', min: 0.80, max: 1.25, step: 0.02 }
      ]
    },
    {
      group: '2. Hydraulic Erector Box & Gantry',
      fields: [
        { key: 'launcherElevation', label: 'Launcher Elevation Pitch (°)', type: 'range', min: 0, max: 42, step: 1 },
        { key: 'launcherScale', label: 'Erector Box Scale', type: 'range', min: 0.80, max: 1.25, step: 0.02 },
        { key: 'gantryArchScale', label: 'Front Roll-Bar Gantry Height', type: 'range', min: 0.75, max: 1.35, step: 0.02 }
      ]
    },
    {
      group: '3. BGM-109 Tomahawk Cruise Missile',
      fields: [
        { key: 'missileScale', label: 'Cruise Missile Scale', type: 'range', min: 0.75, max: 1.35, step: 0.02 },
        { key: 'missileWingSpan', label: 'Mid-Body Cruise Wing Span', type: 'range', min: 0.70, max: 1.45, step: 0.02 }
      ]
    },
    {
      group: '4. Diorama Vector-Cel Palette',
      fields: [
        { key: 'houseColorMode', label: 'Accent Trim Source', type: 'select', options: [
          { value: 'CUSTOM', label: 'Custom Trim Swatch' },
          { value: 'FACTION', label: 'Dynamic Faction Color' }
        ] },
        { key: 'weatheringIntensity', label: 'Panel Shading Contrast', type: 'range', min: 0.2, max: 1.5, step: 0.05 },
        { key: 'armorBaseColor', label: 'Desert Tan Cab & Box', type: 'color' },
        { key: 'armorHighlightColor', label: 'Sunlit Upper Deck', type: 'color' },
        { key: 'armorShadowColor', label: 'Lower Hull Shadow', type: 'color' },
        { key: 'panelLineColor', label: 'Ligne-Claire Ink Outline', type: 'color' },
        { key: 'wheelHubColor', label: '8×8 Heavy Wheel Hubs', type: 'color' },
        { key: 'glassColor', label: 'Armored Windshield Glass', type: 'color' },
        { key: 'missileBodyColor', label: 'Tomahawk Missile Fuselage', type: 'color' },
        { key: 'missileFinColor', label: 'Missile Nose & Cruise Wings', type: 'color' },
        { key: 'houseColor', label: 'Tactical Trim / Stripe', type: 'color' }
      ]
    },
    {
      group: '5. Component Layer Visibility & Detail Toggles',
      fields: [
        { key: 'showEightWheels', label: '8×8 Tandem Off-Road Wheels', type: 'checkbox' },
        { key: 'showWheelFenders', label: 'Tandem Wheel-Arch Fenders', type: 'checkbox' },
        { key: 'showMidFuelTanks', label: 'Mid-Chassis Fuel Tanks', type: 'checkbox' },
        { key: 'showBoardingSteps', label: 'Cab Boarding Stirrup Steps', type: 'checkbox' },
        { key: 'showCrewCab', label: 'Armored HEMTT Crew Cab', type: 'checkbox' },
        { key: 'showFrontBumperGrille', label: 'Slatted Grille & Headlights', type: 'checkbox' },
        { key: 'showWindshieldGlass', label: '2-Pane Blue Glass & Wipers', type: 'checkbox' },
        { key: 'showSideMirrors', label: 'West-Coast C-Bracket Mirrors', type: 'checkbox' },
        { key: 'showRoofDetails', label: 'Amber Clearance Lights & Hatch', type: 'checkbox' },
        { key: 'showEngineDeck', label: 'Mid-Ship Engine & HVAC Deck', type: 'checkbox' },
        { key: 'showLauncherBox', label: 'Armored Erector-Launcher Box', type: 'checkbox' },
        { key: 'showHydraulicRams', label: 'Twin Telescoping Hydraulic Rams', type: 'checkbox' },
        { key: 'showLaunchTubeCells', label: '6-Cell Launch Tube Faceplate', type: 'checkbox' },
        { key: 'showRollBarGantry', label: 'Overhead Roll-Bar Gantry Frame', type: 'checkbox' },
        { key: 'showMissile', label: 'Perched BGM-109 Tomahawk', type: 'checkbox' },
        { key: 'showMissileWings', label: 'Swept Red Cruise Wings & Fins', type: 'checkbox' }
      ]
    }
  ];

  function renderTomahawkModel(ctx, u, faction, customParams, options) {
    const p = Object.assign({}, TOMAHAWK_DEFAULT_PARAMS, customParams || {});
    const opts = options || {};

    const rawR = (u && u.radius) || 18;
    const r = rawR * (p.hullScale || 1.0);
    const L = p.hullLength || 1.0;
    const W = p.hullWidth || 1.0;
    const H = p.extrusionDepth || 1.0;
    const wRadScale = p.wheelRadiusScale || 1.0;
    const lScale = p.launcherScale || 1.0;
    const gScale = p.gantryArchScale || 1.0;
    const mScale = p.missileScale || 1.0;
    const wSpan = p.missileWingSpan || 1.0;
    const weather = p.weatheringIntensity !== undefined ? p.weatheringIntensity : 0.85;

    const hullAngle = (u && u.angle !== undefined) ? u.angle : 0;
    const turretAngle = (u && u.turretAngle !== undefined) ? u.turretAngle : hullAngle;
    const treadPhase = (u && u.treadPhase) || 0;
    const pitchScale = opts.pitchScale !== undefined ? opts.pitchScale : 0.66;
    const zScale = opts.zScale !== undefined ? opts.zScale : 0.76;

    const isUnmanned = Boolean(u && u.unmanned);
    const rawArmorBase = (p.armorBaseColor && p.armorBaseColor !== TOMAHAWK_DEFAULT_PARAMS.armorBaseColor)
      ? p.armorBaseColor
      : (p.hullMidColor || p.armorBaseColor || '#d8b77e');
    const armorBase = isUnmanned ? '#64748b' : rawArmorBase;
    const armorHighlight = isUnmanned
      ? '#94a3b8'
      : (p.armorHighlightColor && p.armorHighlightColor !== TOMAHAWK_DEFAULT_PARAMS.armorHighlightColor
          ? p.armorHighlightColor
          : shadeHex(armorBase, 1.12));
    const armorShadow = isUnmanned
      ? '#334155'
      : (p.armorShadowColor && p.armorShadowColor !== TOMAHAWK_DEFAULT_PARAMS.armorShadowColor
          ? p.armorShadowColor
          : shadeHex(armorBase, 0.72));
    const armorDark = mixHex(armorBase, armorShadow, clamp(0.65 * weather, 0.25, 0.95));
    const hubCol = isUnmanned ? '#475569' : (p.wheelHubColor || '#c9a66b');
    const seamCol = p.panelLineColor || '#26201b';
    const glassCol = p.glassColor || '#69b9e0';
    const missileBodyCol = p.missileBodyColor || '#f8fafc';
    const missileFinCol = p.missileFinColor || p.stripeColor || '#ef4444';
    const houseCol = isUnmanned
      ? '#475569'
      : (p.houseColorMode === 'FACTION' && faction && faction.color)
        ? faction.color
        : (p.houseColor || '#c9a66b');

    const hullProj = createProjector(hullAngle, pitchScale, zScale, 0, 0, 0, 0);

    // Warm Cast Ground Shadow (matching usa_tomahawk_diorama_ref.png)
    const shadowPts = [
      hullProj.project(-1.30 * r * L, -0.84 * r * W, 0),
      hullProj.project(1.30 * r * L, -0.84 * r * W, 0),
      hullProj.project(1.30 * r * L, 0.84 * r * W, 0),
      hullProj.project(-1.30 * r * L, 0.84 * r * W, 0)
    ].map((pt) => ({ x: pt.x + 3.5, y: pt.y + 4.5 }));
    drawPolyPts(ctx, shadowPts, 'rgba(65, 50, 40, 0.36)', null, 0);

    const faces = [];

    // ========================================================================
    // 1. 8×8 Heavy Off-Road Wheels (Front Tandem Pair + Rear Tandem Pair)
    // ========================================================================
    const axleXs = [-0.88 * r * L, -0.42 * r * L, 0.40 * r * L, 0.86 * r * L];
    if (p.showEightWheels !== false) {
      const wheelR = 0.265 * r * wRadScale;
      for (const axX of axleXs) {
        // Solid heavy axle differential bar across underbody
        pushBox3D(
          faces,
          hullProj,
          axX - 0.06 * r * L,
          axX + 0.06 * r * L,
          -0.52 * r * W,
          0.52 * r * W,
          0.16 * r * H,
          0.26 * r * H,
          '#292524',
          seamCol,
          0.85,
          -1.8
        );
        pushWheelAxle3D(
          faces,
          hullProj,
          r,
          axX,
          0.48 * r * W,
          0.80 * r * W,
          wheelR,
          '#332f2c',
          hubCol,
          seamCol,
          treadPhase,
          -1.45
        );
        // Deep tire lug notches & 5-bolt hub ring detail on outer wheel face
        for (const side of [-1, 1]) {
          const yOut = side * 0.805 * r * W;
          const zCenter = wheelR * 0.92;
          faces.push({
            depth: hullProj.project(axX, yOut + side * 0.03 * r, zCenter).depth - 0.95,
            customDraw(c) {
              // 5 heavy planetary hub bolts around rim
              for (let b = 0; b < 5; b++) {
                const ba = (b / 5) * Math.PI * 2 + (treadPhase || 0) * Math.PI * 2;
                const bp = hullProj.project(
                  axX + Math.cos(ba) * wheelR * 0.36,
                  yOut,
                  zCenter + Math.sin(ba) * wheelR * 0.36
                );
                c.fillStyle = seamCol;
                c.beginPath();
                c.arc(bp.x, bp.y, Math.max(0.9, 0.026 * r), 0, Math.PI * 2);
                c.fill();
              }
              // Outer tire tread lug ticks
              for (let t = 0; t < 8; t++) {
                const ta = (t / 8) * Math.PI * 2 + (treadPhase || 0) * Math.PI * 2;
                const rIn = wheelR * 0.76;
                const rOut = wheelR * 0.96;
                drawLine3D(
                  c,
                  hullProj,
                  axX + Math.cos(ta) * rIn,
                  yOut,
                  Math.max(0.02 * r, zCenter + Math.sin(ta) * rIn),
                  axX + Math.cos(ta) * rOut,
                  yOut,
                  Math.max(0.02 * r, zCenter + Math.sin(ta) * rOut),
                  seamCol,
                  0.95
                );
              }
            }
          });
        }
      }
    }

    // ========================================================================
    // 2. Heavy HEMTT Ladder Frame Spine, Tandem Wheel Fenders & Mid Fuel Tanks
    // ========================================================================
    // Main longitudinal chassis spine & rear bumper beam
    pushBox3D(
      faces,
      hullProj,
      -1.20 * r * L,
      1.20 * r * L,
      -0.56 * r * W,
      0.56 * r * W,
      0.20 * r * H,
      0.42 * r * H,
      armorDark,
      seamCol,
      1.1,
      -0.65
    );

    // Rear flatbed deck platform over the rear tandem axles
    pushBox3D(
      faces,
      hullProj,
      -1.18 * r * L,
      0.06 * r * L,
      -0.72 * r * W,
      0.72 * r * W,
      0.38 * r * H,
      0.48 * r * H,
      armorBase,
      seamCol,
      1.1,
      -0.25
    );

    // Rear bumper tail-lights (Red brake lights + Amber turn signals) & mudflaps
    faces.push({
      depth: hullProj.project(-1.21 * r * L, 0, 0.30 * r * H).depth - 0.15,
      customDraw(c) {
        for (const side of [-1, 1]) {
          const ly0 = side * 0.44 * r * W;
          const ly1 = side * 0.64 * r * W;
          const lQuad = [
            hullProj.project(-1.21 * r * L, ly0, 0.25 * r * H),
            hullProj.project(-1.21 * r * L, ly1, 0.25 * r * H),
            hullProj.project(-1.21 * r * L, ly1, 0.36 * r * H),
            hullProj.project(-1.21 * r * L, ly0, 0.36 * r * H)
          ];
          drawPolyPts(c, lQuad, '#ef4444', seamCol, 0.95);
          const aQuad = [
            hullProj.project(-1.21 * r * L, side * 0.32 * r * W, 0.25 * r * H),
            hullProj.project(-1.21 * r * L, ly0, 0.25 * r * H),
            hullProj.project(-1.21 * r * L, ly0, 0.36 * r * H),
            hullProj.project(-1.21 * r * L, side * 0.32 * r * W, 0.36 * r * H)
          ];
          drawPolyPts(c, aQuad, '#f59e0b', seamCol, 0.9);
        }
      }
    });

    // Trapezoidal Tandem Wheel-Arch Fenders (over Rear Tandem & Front Tandem pairs)
    if (p.showWheelFenders !== false) {
      const fenderPairs = [
        { x0: -1.12 * r * L, x1: -0.18 * r * L, z0: 0.34 * r * H, z1: 0.46 * r * H },
        { x0: 0.18 * r * L, x1: 1.06 * r * L, z0: 0.34 * r * H, z1: 0.46 * r * H }
      ];
      for (const fp of fenderPairs) {
        for (const side of [-1, 1]) {
          const yIn = side * 0.54 * r * W;
          const yOut = side * 0.81 * r * W;
          const yMin = Math.min(yIn, yOut);
          const yMax = Math.max(yIn, yOut);
          const botLoop = [
            [fp.x0, yMin, fp.z0],
            [fp.x1, yMin, fp.z0],
            [fp.x1, yMax, fp.z0],
            [fp.x0, yMax, fp.z0]
          ];
          const topLoop = [
            [fp.x0 + 0.08 * r * L, yMin, fp.z1],
            [fp.x1 - 0.08 * r * L, yMin, fp.z1],
            [fp.x1 - 0.08 * r * L, yMax, fp.z1],
            [fp.x0 + 0.08 * r * L, yMax, fp.z1]
          ];
          pushFrustumFaces(faces, hullProj, botLoop, topLoop, armorDark, seamCol, 1.05, -0.35);
        }
      }
    }

    // Mid-Chassis Cylindrical Fuel Tank & Hydraulic Locker (between Front & Rear Tandem Axles)
    if (p.showMidFuelTanks !== false) {
      for (const side of [-1, 1]) {
        const yIn = side * 0.48 * r * W;
        const yOut = side * 0.77 * r * W;
        const yMin = Math.min(yIn, yOut);
        const yMax = Math.max(yIn, yOut);
        pushBox3D(
          faces,
          hullProj,
          -0.15 * r * L,
          0.15 * r * L,
          yMin,
          yMax,
          0.18 * r * H,
          0.44 * r * H,
          armorDark,
          seamCol,
          1.05,
          -0.30,
          0.03 * r * L,
          0.02 * r * W
        );
        // Fuel tank strap ribs & filler cap
        faces.push({
          depth: hullProj.project(0, side * 0.78 * r * W, 0.32 * r * H).depth - 0.10,
          customDraw(c) {
            for (const sx of [-0.07 * r * L, 0.07 * r * L]) {
              drawLine3D(c, hullProj, sx, yOut, 0.19 * r * H, sx, yOut, 0.43 * r * H, seamCol, 1.0);
            }
          }
        });
      }
    }

    // ========================================================================
    // 3. Mid-Ship Stepped Engine / Generator & HVAC Equipment Deck (behind cab)
    // ========================================================================
    if (p.showEngineDeck !== false) {
      // Central diesel engine & cooling module housing
      pushBox3D(
        faces,
        hullProj,
        0.04 * r * L,
        0.50 * r * L,
        -0.66 * r * W,
        0.66 * r * W,
        0.42 * r * H,
        0.78 * r * H,
        armorBase,
        seamCol,
        1.1,
        0.18,
        0.02 * r * L,
        0.02 * r * W
      );
      // Left & right side-mounted vertical equipment / air-filter lockers (matching reference!)
      for (const side of [-1, 1]) {
        const yIn = side * 0.56 * r * W;
        const yOut = side * 0.75 * r * W;
        const yMin = Math.min(yIn, yOut);
        const yMax = Math.max(yIn, yOut);
        pushBox3D(
          faces,
          hullProj,
          0.10 * r * L,
          0.46 * r * L,
          yMin,
          yMax,
          0.44 * r * H,
          0.74 * r * H,
          armorHighlight,
          seamCol,
          1.05,
          0.28
        );
        // Locker seam & louver vents
        faces.push({
          depth: hullProj.project(0.28 * r * L, side * 0.76 * r * W, 0.58 * r * H).depth + 0.38,
          customDraw(c) {
            drawLine3D(c, hullProj, 0.28 * r * L, yOut, 0.46 * r * H, 0.28 * r * L, yOut, 0.72 * r * H, seamCol, 0.95);
            for (const lz of [0.52 * r * H, 0.59 * r * H, 0.66 * r * H]) {
              drawLine3D(c, hullProj, 0.14 * r * L, yOut, lz, 0.24 * r * L, yOut, lz, seamCol, 0.85);
            }
          }
        });
      }
      // Top dark louvered heat-exchanger grille on engine deck
      faces.push({
        depth: hullProj.project(0.27 * r * L, 0, 0.79 * r * H).depth + 0.35,
        customDraw(c) {
          const gPts = [
            hullProj.project(0.12 * r * L, -0.42 * r * W, 0.785 * r * H),
            hullProj.project(0.42 * r * L, -0.42 * r * W, 0.785 * r * H),
            hullProj.project(0.42 * r * L, 0.42 * r * W, 0.785 * r * H),
            hullProj.project(0.12 * r * L, 0.42 * r * W, 0.785 * r * H)
          ];
          drawPolyPts(c, gPts, '#332f2c', seamCol, 0.95);
        }
      });
    }

    // ========================================================================
    // 4. Forward Armored Oshkosh HEMTT Crew Cab
    // ========================================================================
    if (p.showCrewCab !== false) {
      // Lower cab waist block (bumper-to-rear-cab wall)
      pushBox3D(
        faces,
        hullProj,
        0.50 * r * L,
        1.22 * r * L,
        -0.74 * r * W,
        0.74 * r * W,
        0.38 * r * H,
        0.58 * r * H,
        armorBase,
        seamCol,
        1.15,
        0.42,
        0.02 * r * L,
        0.01 * r * W
      );

      // Upper armored greenhouse cab with sloped front windshield face
      const cabBot = [
        [0.50 * r * L, -0.73 * r * W, 0.58 * r * H],
        [1.20 * r * L, -0.73 * r * W, 0.58 * r * H],
        [1.20 * r * L, 0.73 * r * W, 0.58 * r * H],
        [0.50 * r * L, 0.73 * r * W, 0.58 * r * H]
      ];
      const cabTop = [
        [0.52 * r * L, -0.69 * r * W, 0.95 * r * H],
        [1.08 * r * L, -0.69 * r * W, 0.95 * r * H],
        [1.08 * r * L, 0.69 * r * W, 0.95 * r * H],
        [0.52 * r * L, 0.69 * r * W, 0.95 * r * H]
      ];
      pushFrustumFaces(faces, hullProj, cabBot, cabTop, armorHighlight, seamCol, 1.15, 0.52);

      // Tactical house-color stripe along lower cab doors
      faces.push({
        depth: hullProj.project(0.84 * r * L, 0, 0.48 * r * H).depth + 0.62,
        customDraw(c) {
          for (const side of [-1, 1]) {
            const yFace = side * 0.742 * r * W;
            const sPts = [
              hullProj.project(0.54 * r * L, yFace, 0.45 * r * H),
              hullProj.project(1.14 * r * L, yFace, 0.45 * r * H),
              hullProj.project(1.14 * r * L, yFace, 0.52 * r * H),
              hullProj.project(0.54 * r * L, yFace, 0.52 * r * H)
            ];
            drawPolyPts(c, sPts, houseCol, seamCol, 0.85);
            // Vertical door seam & grab handle
            drawLine3D(c, hullProj, 0.68 * r * L, yFace, 0.41 * r * H, 0.68 * r * L, yFace, 0.88 * r * H, seamCol, 0.95);
            drawLine3D(c, hullProj, 0.74 * r * L, yFace, 0.53 * r * H, 0.81 * r * L, yFace, 0.53 * r * H, seamCol, 1.25);
          }
        }
      });
    }

    // Front Crew Boarding Stirrup Steps (below cab doors ahead of front axle)
    if (p.showBoardingSteps !== false && p.showCrewCab !== false) {
      faces.push({
        depth: hullProj.project(1.04 * r * L, 0, 0.24 * r * H).depth + 0.48,
        customDraw(c) {
          for (const side of [-1, 1]) {
            const yStep = side * 0.76 * r * W;
            const x0 = 0.98 * r * L;
            const x1 = 1.13 * r * L;
            drawLine3D(c, hullProj, x0, yStep, 0.38 * r * H, x0, yStep, 0.16 * r * H, seamCol, 1.35);
            drawLine3D(c, hullProj, x1, yStep, 0.38 * r * H, x1, yStep, 0.16 * r * H, seamCol, 1.35);
            drawLine3D(c, hullProj, x0, yStep, 0.16 * r * H, x1, yStep, 0.16 * r * H, '#475569', 1.55);
            drawLine3D(c, hullProj, x0, yStep, 0.27 * r * H, x1, yStep, 0.27 * r * H, '#475569', 1.35);
          }
        }
      });
    }

    // Heavy Front Bumper, Slatted Trapezoidal Radiator Grille, Dual Headlights & Tow Shackles
    if (p.showFrontBumperGrille !== false && p.showCrewCab !== false) {
      // Protruding front heavy steel bumper
      pushBox3D(
        faces,
        hullProj,
        1.16 * r * L,
        1.27 * r * L,
        -0.75 * r * W,
        0.75 * r * W,
        0.22 * r * H,
        0.40 * r * H,
        armorDark,
        seamCol,
        1.15,
        0.68
      );

      faces.push({
        depth: hullProj.project(1.24 * r * L, 0, 0.48 * r * H).depth + 0.82,
        customDraw(c) {
          // Trapezoidal dark slatted radiator grille in center of nose
          const gQuad = [
            hullProj.project(1.225 * r * L, -0.30 * r * W, 0.40 * r * H),
            hullProj.project(1.225 * r * L, 0.30 * r * W, 0.40 * r * H),
            hullProj.project(1.215 * r * L, 0.26 * r * W, 0.56 * r * H),
            hullProj.project(1.215 * r * L, -0.26 * r * W, 0.56 * r * H)
          ];
          drawPolyPts(c, gQuad, '#2b2521', seamCol, 1.05);
          for (const gz of [0.44 * r * H, 0.48 * r * H, 0.52 * r * H]) {
            drawLine3D(c, hullProj, 1.226 * r * L, -0.25 * r * W, gz, 1.226 * r * L, 0.25 * r * W, gz, '#78716c', 0.85);
          }

          // Dual rectangular headlights + amber turn markers on left & right nose cheeks
          for (const side of [-1, 1]) {
            const hy0 = side * 0.36 * r * W;
            const hy1 = side * 0.62 * r * W;
            const hQuad = [
              hullProj.project(1.225 * r * L, hy0, 0.42 * r * H),
              hullProj.project(1.225 * r * L, hy1, 0.42 * r * H),
              hullProj.project(1.22 * r * L, hy1, 0.52 * r * H),
              hullProj.project(1.22 * r * L, hy0, 0.52 * r * H)
            ];
            drawPolyPts(c, hQuad, '#fef08a', seamCol, 0.95);

            // Amber corner turn indicator
            const aQuad = [
              hullProj.project(1.225 * r * L, hy1, 0.42 * r * H),
              hullProj.project(1.225 * r * L, side * 0.70 * r * W, 0.42 * r * H),
              hullProj.project(1.22 * r * L, side * 0.70 * r * W, 0.52 * r * H),
              hullProj.project(1.22 * r * L, hy1, 0.52 * r * H)
            ];
            drawPolyPts(c, aQuad, '#f59e0b', seamCol, 0.85);

            // Front bumper recovery tow shackle loop
            const ty = side * 0.34 * r * W;
            drawLine3D(c, hullProj, 1.27 * r * L, ty, 0.27 * r * H, 1.33 * r * L, ty, 0.24 * r * H, seamCol, 1.65);
          }
        }
      });
    }

    // Split 2-Pane Armored Blue Glass Windshield + Wipers + Side Door Windows
    if (p.showWindshieldGlass !== false && p.showCrewCab !== false) {
      faces.push({
        depth: hullProj.project(1.16 * r * L, 0, 0.76 * r * H).depth + 0.88,
        customDraw(c) {
          for (const side of [-1, 1]) {
            const y0 = side * 0.05 * r * W;
            const y1 = side * 0.62 * r * W;
            const wQuad = [
              [1.19 * r * L, y0, 0.61 * r * H],
              [1.19 * r * L, y1, 0.61 * r * H],
              [1.09 * r * L, y1 * 0.95, 0.90 * r * H],
              [1.09 * r * L, y0, 0.90 * r * H]
            ];
            drawGlassPane3D(c, hullProj, wQuad, glassCol, seamCol, 1.05);
            // Windshield wiper blade angled across pane
            drawLine3D(
              c,
              hullProj,
              1.185 * r * L,
              side * 0.22 * r * W,
              0.615 * r * H,
              1.14 * r * L,
              side * 0.44 * r * W,
              0.77 * r * H,
              seamCol,
              1.15
            );
          }
        }
      });

      // Recessed Side Door Windows (left and right cab doors)
      for (const side of [-1, 1]) {
        const yDoor = side * 0.725 * r * W;
        faces.push({
          depth: hullProj.project(0.86 * r * L, yDoor + side * 0.02 * r, 0.74 * r * H).depth + 0.76,
          customDraw(c) {
            const sideQuad = [
              [0.72 * r * L, yDoor, 0.62 * r * H],
              [1.06 * r * L, yDoor, 0.62 * r * H],
              [1.00 * r * L, yDoor * 0.96, 0.88 * r * H],
              [0.72 * r * L, yDoor * 0.96, 0.88 * r * H]
            ];
            drawGlassPane3D(c, hullProj, sideQuad, glassCol, seamCol, 1.0);
          }
        });
      }
    }

    // External West-Coast C-Bracket Side Mirrors (on both cab doors)
    if (p.showSideMirrors !== false && p.showCrewCab !== false) {
      for (const side of [-1, 1]) {
        const yDoor = side * 0.71 * r * W;
        const yMirror = side * 0.83 * r * W;
        faces.push({
          depth: hullProj.project(1.04 * r * L, yMirror, 0.74 * r * H).depth + 0.92,
          customDraw(c) {
            // Top & bottom C-bracket struts
            drawLine3D(c, hullProj, 1.05 * r * L, yDoor, 0.86 * r * H, 1.05 * r * L, yMirror, 0.86 * r * H, seamCol, 1.15);
            drawLine3D(c, hullProj, 1.05 * r * L, yDoor, 0.62 * r * H, 1.05 * r * L, yMirror, 0.62 * r * H, seamCol, 1.15);
            drawLine3D(c, hullProj, 1.05 * r * L, yMirror, 0.62 * r * H, 1.05 * r * L, yMirror, 0.86 * r * H, seamCol, 1.15);
            // Vertical rectangular mirror plate
            const mPts = [
              hullProj.project(1.03 * r * L, yMirror, 0.65 * r * H),
              hullProj.project(1.07 * r * L, yMirror, 0.65 * r * H),
              hullProj.project(1.07 * r * L, yMirror, 0.83 * r * H),
              hullProj.project(1.03 * r * L, yMirror, 0.83 * r * H)
            ];
            drawPolyPts(c, mPts, armorBase, seamCol, 0.95);
          }
        });
      }
    }

    // 3 Roof Amber Clearance Marker Lights, Commander Roof Hatch & Whip Antenna
    if (p.showRoofDetails !== false && p.showCrewCab !== false) {
      // Circular roof hatch on right cab roof
      pushCylinderZ3D(
        faces,
        hullProj,
        0.74 * r * L,
        -0.26 * r * W,
        0.95 * r * H,
        1.01 * r * H,
        0.16 * r,
        0.15 * r,
        8,
        armorBase,
        seamCol,
        0.95,
        0.85
      );
      faces.push({
        depth: hullProj.project(1.06 * r * L, 0, 0.97 * r * H).depth + 0.95,
        customDraw(c) {
          // 3 amber roof brow clearance lights (matching usa_tomahawk_diorama_ref.png!)
          for (const ly of [-0.36 * r * W, 0, 0.36 * r * W]) {
            const lp = hullProj.project(1.04 * r * L, ly, 0.96 * r * H);
            c.fillStyle = '#f59e0b';
            c.strokeStyle = seamCol;
            c.lineWidth = 0.9;
            c.beginPath();
            c.arc(lp.x, lp.y, Math.max(1.5, 0.045 * r), 0, Math.PI * 2);
            c.fill();
            c.stroke();
          }
          // Comms whip antenna on rear corner of cab roof
          drawLine3D(c, hullProj, 0.56 * r * L, 0.58 * r * W, 0.95 * r * H, 0.46 * r * L, 0.62 * r * W, 1.48 * r * H, seamCol, 1.15);
        }
      });
    }

    flushFaces(ctx, faces);

    // ========================================================================
    // 5. Articulating Rear Hydraulic Erector-Launcher Assembly + BGM-109 Missile
    // ========================================================================
    const turProj = createProjector(turretAngle, pitchScale, zScale, -0.46 * r * L, 0, 0.46 * r * H, hullAngle);
    const lFaces = [];
    const baseElevDeg = p.launcherElevation !== undefined ? p.launcherElevation : 20;
    const combatElevBoost = (u && (u.state === 'ATTACK' || u.state === 'FORCE_FIRE' || (u.attackCooldown && u.attackCooldown > 0))) ? 10 : 0;
    const elevRad = (Math.min(48, baseElevDeg + combatElevBoost) * Math.PI) / 180;
    const cosE = Math.cos(elevRad);
    const sinE = Math.sin(elevRad);

    // Local erector-box coordinate helper: maps (s along box, y across box, n normal to box) -> 3D turProj space
    const bLen = 1.28 * r * L * lScale;
    const boxW = 0.52 * r * W * lScale;
    const boxH = 0.35 * r * H * lScale;
    const xHinge = -0.60 * r * L;
    const zHinge = 0.04 * r * H;
    const boxPt = (s, y, n) => [
      xHinge + s * cosE - n * sinE,
      y,
      zHinge + s * sinE + n * cosE
    ];

    // Turntable base pedestal & rear trunnion hinge cradle on flatbed
    pushCylinderZ3D(
      lFaces,
      turProj,
      0.02 * r * L,
      0,
      0,
      0.08 * r * H,
      0.44 * r * W,
      0.40 * r * W,
      10,
      armorDark,
      seamCol,
      1.0,
      0.15
    );
    pushBox3D(
      lFaces,
      turProj,
      xHinge - 0.08 * r * L,
      xHinge + 0.16 * r * L,
      -0.46 * r * W,
      0.46 * r * W,
      0,
      0.14 * r * H,
      armorDark,
      seamCol,
      1.05,
      0.22
    );

    // Twin Telescoping Hydraulic Lift Cylinders (matching usa_tomahawk_diorama_ref.png!)
    if (p.showHydraulicRams !== false) {
      const ramBaseX = 0.14 * r * L;
      const ramBaseZ = 0.03 * r * H;
      const ramTopPt = boxPt(0.74 * bLen, 0, 0.02 * r * H);
      const midX = (ramBaseX + ramTopPt[0]) * 0.52;
      const midZ = (ramBaseZ + ramTopPt[2]) * 0.52;

      lFaces.push({
        depth: turProj.project(midX, 0, midZ).depth + 0.95,
        customDraw(c) {
          for (const side of [-1, 1]) {
            const ry = side * 0.27 * r * W;
            // Lower outer hydraulic barrel (#475569) with ink outline
            drawLine3D(c, turProj, ramBaseX, ry, ramBaseZ, midX, ry, midZ, seamCol, 4.4);
            drawLine3D(c, turProj, ramBaseX, ry, ramBaseZ, midX, ry, midZ, '#64748b', 2.6);
            // Upper polished chrome piston rod (#e2e8f0)
            drawLine3D(c, turProj, midX, ry, midZ, ramTopPt[0], ry, ramTopPt[2], seamCol, 3.0);
            drawLine3D(c, turProj, midX, ry, midZ, ramTopPt[0], ry, ramTopPt[2], '#e2e8f0', 1.6);
          }
        }
      });
    }

    // Rectangular Armored Erector-Launcher Box with 3 Recessed Side Panels
    if (p.showLauncherBox !== false) {
      const lBot = [
        boxPt(0, -boxW, 0),
        boxPt(bLen, -boxW, 0),
        boxPt(bLen, boxW, 0),
        boxPt(0, boxW, 0)
      ];
      const lTop = [
        boxPt(0, -boxW * 0.95, boxH),
        boxPt(bLen, -boxW * 0.95, boxH),
        boxPt(bLen, boxW * 0.95, boxH),
        boxPt(0, boxW * 0.95, boxH)
      ];
      pushFrustumFaces(lFaces, turProj, lBot, lTop, armorBase, seamCol, 1.15, 1.25);

      // 3 Recessed Side Structural Rib Panels along both flanks + dorsal launch rail
      for (const side of [-1, 1]) {
        const yFlank = side * boxW * 0.985;
        const midFlank = boxPt(0.5 * bLen, yFlank + side * 0.02 * r, 0.5 * boxH);
        lFaces.push({
          depth: turProj.project(midFlank[0], midFlank[1], midFlank[2]).depth + 1.42,
          customDraw(c) {
            for (let idx = 0; idx < 3; idx++) {
              const s0 = (0.08 + idx * 0.29) * bLen;
              const s1 = (0.31 + idx * 0.29) * bLen;
              const pQuad = [
                boxPt(s0, yFlank, 0.18 * boxH),
                boxPt(s1, yFlank, 0.18 * boxH),
                boxPt(s1, yFlank, 0.82 * boxH),
                boxPt(s0, yFlank, 0.82 * boxH)
              ].map((v) => turProj.project(v[0], v[1], v[2]));
              drawPolyPts(c, pQuad, armorDark, seamCol, 0.95);
            }
          }
        });
      }

      // Dorsal launch guide rail along top of erector box
      const railBot = [
        boxPt(0.05 * bLen, -0.14 * r * W, boxH),
        boxPt(0.95 * bLen, -0.14 * r * W, boxH),
        boxPt(0.95 * bLen, 0.14 * r * W, boxH),
        boxPt(0.05 * bLen, 0.14 * r * W, boxH)
      ];
      const railTop = [
        boxPt(0.05 * bLen, -0.11 * r * W, boxH + 0.05 * r * H),
        boxPt(0.95 * bLen, -0.11 * r * W, boxH + 0.05 * r * H),
        boxPt(0.95 * bLen, 0.11 * r * W, boxH + 0.05 * r * H),
        boxPt(0.05 * bLen, 0.11 * r * W, boxH + 0.05 * r * H)
      ];
      pushFrustumFaces(lFaces, turProj, railBot, railTop, '#475569', seamCol, 0.95, 1.50);
    }

    // 6-Cell Circular Launch Tube Front Faceplate (matching usa_tomahawk_diorama_ref.png!)
    if (p.showLaunchTubeCells !== false && p.showLauncherBox !== false) {
      const fCenter = boxPt(bLen + 0.008 * r, 0, 0.5 * boxH);
      lFaces.push({
        depth: turProj.project(fCenter[0], fCenter[1], fCenter[2]).depth + 1.55,
        customDraw(c) {
          // Dark recessed front canister bezel plate
          const bezelPts = [
            boxPt(bLen + 0.004 * r, -boxW * 0.88, 0.14 * boxH),
            boxPt(bLen + 0.004 * r, boxW * 0.88, 0.14 * boxH),
            boxPt(bLen + 0.004 * r, boxW * 0.88, 0.86 * boxH),
            boxPt(bLen + 0.004 * r, -boxW * 0.88, 0.86 * boxH)
          ].map((v) => turProj.project(v[0], v[1], v[2]));
          drawPolyPts(c, bezelPts, armorDark, seamCol, 1.0);

          // 6 circular missile launch tube cells (2 rows × 3 columns across the faceplate)
          const cellCols = [-0.58 * boxW, 0, 0.58 * boxW];
          const cellRows = [0.34 * boxH, 0.68 * boxH];
          const cellR = Math.max(1.5, 0.075 * r * lScale);
          for (const cy of cellCols) {
            for (const cz of cellRows) {
              const cp3 = boxPt(bLen + 0.012 * r, cy, cz);
              const cp2 = turProj.project(cp3[0], cp3[1], cp3[2]);
              c.fillStyle = '#1e293b';
              c.strokeStyle = seamCol;
              c.lineWidth = 1.05;
              c.beginPath();
              c.arc(cp2.x, cp2.y, cellR, 0, Math.PI * 2);
              c.fill();
              c.stroke();
            }
          }
        }
      });
    }

    // Signature Overhead U-Shaped Roll-Bar / Blast-Deflector Gantry Frame at front of Launcher Box!
    if (p.showRollBarGantry !== false && p.showLauncherBox !== false) {
      const gH = 0.42 * r * H * gScale;
      const gs0 = 0.78 * bLen;
      const gs1 = 0.94 * bLen;
      const postThick = 0.09 * r * W;

      // Left and right vertical-angled gantry posts rising from top corners of launcher box
      for (const side of [-1, 1]) {
        const yOut = side * boxW * 0.94;
        const yIn = side * (boxW * 0.94 - postThick);
        const yMin = Math.min(yIn, yOut);
        const yMax = Math.max(yIn, yOut);
        const pBot = [
          boxPt(gs0, yMin, boxH),
          boxPt(gs1, yMin, boxH),
          boxPt(gs1, yMax, boxH),
          boxPt(gs0, yMax, boxH)
        ];
        const pTop = [
          boxPt(gs0 + 0.03 * bLen, yMin * 0.92, boxH + gH),
          boxPt(gs1 + 0.02 * bLen, yMin * 0.92, boxH + gH),
          boxPt(gs1 + 0.02 * bLen, yMax * 0.92, boxH + gH),
          boxPt(gs0 + 0.03 * bLen, yMax * 0.92, boxH + gH)
        ];
        pushFrustumFaces(lFaces, turProj, pBot, pTop, armorHighlight, seamCol, 1.1, 2.20);
      }

      // Overhead horizontal crossbar arch bridging the two gantry posts above the missile nose
      const crossBot = [
        boxPt(gs0 + 0.03 * bLen, -boxW * 0.88, boxH + gH - 0.08 * r * H),
        boxPt(gs1 + 0.02 * bLen, -boxW * 0.88, boxH + gH - 0.08 * r * H),
        boxPt(gs1 + 0.02 * bLen, boxW * 0.88, boxH + gH - 0.08 * r * H),
        boxPt(gs0 + 0.03 * bLen, boxW * 0.88, boxH + gH - 0.08 * r * H)
      ];
      const crossTop = [
        boxPt(gs0 + 0.03 * bLen, -boxW * 0.84, boxH + gH),
        boxPt(gs1 + 0.02 * bLen, -boxW * 0.84, boxH + gH),
        boxPt(gs1 + 0.02 * bLen, boxW * 0.84, boxH + gH),
        boxPt(gs0 + 0.03 * bLen, boxW * 0.84, boxH + gH)
      ];
      pushFrustumFaces(lFaces, turProj, crossBot, crossTop, armorHighlight, seamCol, 1.15, 2.32);
    }

    // ========================================================================
    // 6. Perched BGM-109 Tomahawk Cruise Missile on Dorsal Launch Rail
    // ========================================================================
    const recoil = (u && u.recoilOffset) || 0;
    const isReloading = Boolean(u && u.attackCooldown && u.attackCooldown > 1.8);
    if (p.showMissile !== false && recoil <= 3.6 && !isReloading) {
      const mSlide = recoil > 0.08 ? (recoil / 3.6) * 0.58 * r * L : 0;
      const mOrigin = boxPt(0.04 * bLen + mSlide, 0, boxH + 0.16 * r * H * mScale);
      const mRootX = mOrigin[0];
      const mRootZ = mOrigin[2];
      const mLen = 1.02 * r * L * mScale;
      const mRad = 0.125 * r * mScale;

      const mPt = (s, y, n) => [
        mRootX + s * cosE - n * sinE,
        y,
        mRootZ + s * sinE + n * cosE
      ];

      // 1. Dark metallic turbofan booster nozzle at tail
      pushTubeSegment3D(
        lFaces,
        turProj,
        mRootX,
        0,
        mRootZ,
        elevRad,
        -0.12 * mLen,
        0.02 * mLen,
        mRad * 0.78,
        mRad * 0.96,
        '#334155',
        seamCol,
        0.95,
        1.78
      );

      // 2. Main cylindrical white Tomahawk fuselage
      pushTubeSegment3D(
        lFaces,
        turProj,
        mRootX,
        0,
        mRootZ,
        elevRad,
        0.02 * mLen,
        0.84 * mLen,
        mRad,
        mRad,
        missileBodyCol,
        seamCol,
        1.05,
        1.85
      );

      // 3. Crimson-red tactical nose band ring + pointed aerodynamic ogive nose cone
      pushTubeSegment3D(
        lFaces,
        turProj,
        mRootX,
        0,
        mRootZ,
        elevRad,
        0.84 * mLen,
        0.96 * mLen,
        mRad,
        mRad * 0.88,
        missileFinCol,
        seamCol,
        1.0,
        1.92
      );
      pushTubeSegment3D(
        lFaces,
        turProj,
        mRootX,
        0,
        mRootZ,
        elevRad,
        0.96 * mLen,
        1.20 * mLen,
        mRad * 0.88,
        0.018 * r,
        missileBodyCol,
        seamCol,
        1.05,
        1.98
      );

      // 4. Swept Mid-Body Red Cruise Wings + Cruciform Red Tail Fins (matching usa_tomahawk_diorama_ref.png!)
      if (p.showMissileWings !== false) {
        const wingOutY = 0.48 * r * mScale * wSpan;
        for (const side of [-1, 1]) {
          const yRoot = side * mRad * 0.85;
          const yTip = side * wingOutY;
          const wMid = mPt(0.50 * mLen, (yRoot + yTip) * 0.5, 0);
          lFaces.push({
            depth: turProj.project(wMid[0], wMid[1], wMid[2]).depth + 2.02,
            customDraw(c) {
              // Swept mid-body cruise wing
              const wingPts = [
                mPt(0.42 * mLen, yRoot, 0),
                mPt(0.62 * mLen, yRoot, 0),
                mPt(0.52 * mLen, yTip, -0.02 * r),
                mPt(0.38 * mLen, yTip, -0.02 * r)
              ].map((v) => turProj.project(v[0], v[1], v[2]));
              drawPolyPts(c, wingPts, missileFinCol, seamCol, 1.05);

              // Horizontal tail stabilizer fin
              const tailFinPts = [
                mPt(-0.04 * mLen, yRoot * 0.9, 0),
                mPt(0.14 * mLen, yRoot * 0.9, 0),
                mPt(0.08 * mLen, side * 0.28 * r * mScale, 0),
                mPt(-0.06 * mLen, side * 0.28 * r * mScale, 0)
              ].map((v) => turProj.project(v[0], v[1], v[2]));
              drawPolyPts(c, tailFinPts, missileFinCol, seamCol, 0.95);
            }
          });
        }

        // Vertical dorsal tail fin on top of aft fuselage
        const dFinMid = mPt(0.04 * mLen, 0, mRad * 1.6);
        lFaces.push({
          depth: turProj.project(dFinMid[0], dFinMid[1], dFinMid[2]).depth + 2.08,
          customDraw(c) {
            const dorsalFinPts = [
              mPt(-0.04 * mLen, 0, mRad * 0.85),
              mPt(0.16 * mLen, 0, mRad * 0.85),
              mPt(0.08 * mLen, 0, mRad * 2.15),
              mPt(-0.05 * mLen, 0, mRad * 2.15)
            ].map((v) => turProj.project(v[0], v[1], v[2]));
            drawPolyPts(c, dorsalFinPts, missileFinCol, seamCol, 1.0);
          }
        });
      }
    }

    flushFaces(ctx, lFaces);

    // Rocket motor backblast & launch booster flare when firing
    if (recoil > 0.5) {
      const aftBlast3D = boxPt(-0.06 * bLen, 0, boxH * 0.85);
      const blastPt = turProj.project(aftBlast3D[0], aftBlast3D[1], aftBlast3D[2]);
      const bR = Math.max(3.5, (recoil / 6) * 0.52 * r);
      ctx.save();
      ctx.fillStyle = 'rgba(251, 146, 60, 0.88)';
      ctx.beginPath();
      ctx.arc(blastPt.x, blastPt.y, bR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(blastPt.x, blastPt.y, bR * 0.52, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ==========================================================================
  // 6. Unit #8: USA Construction Dozer (Caterpillar D9R Armored Bulldozer)
  //    Matches assets/refs/usa_dozer_diorama_ref.png
  // ==========================================================================
  const DOZER_DEFAULT_PARAMS = {
    // 1. Caterpillar Chassis & Tracked Undercarriage
    hullScale: 1.0,
    hullLength: 1.0,
    hullWidth: 1.0,
    extrusionDepth: 1.0,
    trackWidthScale: 1.0,

    // 2. Hydraulic Moldboard Blade & C-Frame Arms
    bladeWidth: 1.0,
    bladeHeight: 1.0,
    bladeLift: 0.0,
    bladeCurvature: 1.0,

    // 3. ROPS Glass Cabin, Engine Hood & Exhaust
    cabHeightScale: 1.0,
    exhaustHeightScale: 1.0,

    // 4. Diorama Vector-Cel Palette
    armorHighlightColor: '#fcd762',
    armorBaseColor: '#edb032',
    armorShadowColor: '#bd8118',
    trackColor: '#423d38',
    hydraulicCylinderColor: '#f2b93b',
    glassColor: '#699ec2',
    panelLineColor: '#26201b',
    houseColorMode: 'DEFAULT',
    weatheringIntensity: 0.35,

    // 5. Component Layer Visibility & Detail Toggles
    showDozerBlade: true,
    showBladeEndBits: true,
    showPushArms: true,
    showHydraulicCylinders: true,
    showTrackBogies: true,
    showTrackGrousers: true,
    showGlassCab: true,
    showSplitDoorGlass: true,
    showSideMirrors: true,
    showFrontGrille: true,
    showHoodLouvers: true,
    showPreCleanerCap: true,
    showExhaustStack: true,
    showSideFenders: true,
    showRearCounterweight: true,
    showGroundShadow: true
  };

  const DOZER_PRESETS = {
    DIORAMA_DEFAULT: {
      label: '🎨 Ligne-Claire Caterpillar',
      description: 'Authentic Caterpillar yellow armored bulldozer matching assets/refs/usa_dozer_diorama_ref.png',
      params: Object.assign({}, DOZER_DEFAULT_PARAMS)
    },
    HEAVY_EARTHMOVER: {
      label: '🚜 Raised Blade Earthmover',
      description: 'Wide 1.18x concave moldboard blade lifted for heavy earth-moving and obstacle clearing',
      params: Object.assign({}, DOZER_DEFAULT_PARAMS, {
        bladeWidth: 1.18,
        bladeHeight: 1.12,
        bladeLift: 0.22,
        bladeCurvature: 1.20
      })
    },
    COMBAT_SAPPER_OLIVE: {
      label: '🛡️ USACE Combat Sapper',
      description: 'US Army Corps of Engineers olive-drab armored mine-clearing sapper dozer',
      params: Object.assign({}, DOZER_DEFAULT_PARAMS, {
        armorHighlightColor: '#8d9e69',
        armorBaseColor: '#6f7e50',
        armorShadowColor: '#4d5936',
        hydraulicCylinderColor: '#eab308',
        bladeWidth: 1.12
      })
    },
    DESERT_CORPS_TAN: {
      label: '🏜️ Desert Construction Corps',
      description: 'Middle-East theater desert sand camouflage with heavy dust weathering',
      params: Object.assign({}, DOZER_DEFAULT_PARAMS, {
        armorHighlightColor: '#eed3a2',
        armorBaseColor: '#d8b77e',
        armorShadowColor: '#9c7a49',
        hydraulicCylinderColor: '#e0bc80',
        weatheringIntensity: 0.65
      })
    },
    HIGH_VIS_HAZARD: {
      label: '⚠️ High-Vis Safety Orange',
      description: 'High-visibility industrial amber-orange dozer with reinforced C-frame push beams',
      params: Object.assign({}, DOZER_DEFAULT_PARAMS, {
        armorHighlightColor: '#fdba74',
        armorBaseColor: '#ea7317',
        armorShadowColor: '#9a3412',
        hydraulicCylinderColor: '#fb923c'
      })
    }
  };

  const DOZER_PARAM_SCHEMA = [
    {
      group: '1. Caterpillar Chassis & Tracked Undercarriage',
      fields: [
        { key: 'hullScale', label: 'Overall Dozer Scale', type: 'range', min: 0.75, max: 1.35, step: 0.02 },
        { key: 'hullLength', label: 'Tractor Chassis Length', type: 'range', min: 0.85, max: 1.25, step: 0.02 },
        { key: 'hullWidth', label: 'Tractor Stance Width', type: 'range', min: 0.85, max: 1.25, step: 0.02 },
        { key: 'extrusionDepth', label: 'Vertical Profile Height', type: 'range', min: 0.75, max: 1.35, step: 0.05 },
        { key: 'trackWidthScale', label: 'Caterpillar Track Shoe Width', type: 'range', min: 0.80, max: 1.35, step: 0.05 }
      ]
    },
    {
      group: '2. Hydraulic Moldboard Blade & C-Frame Arms',
      fields: [
        { key: 'bladeWidth', label: 'Front Moldboard Blade Width', type: 'range', min: 0.80, max: 1.35, step: 0.05 },
        { key: 'bladeHeight', label: 'Front Moldboard Blade Height', type: 'range', min: 0.75, max: 1.35, step: 0.05 },
        { key: 'bladeLift', label: 'Hydraulic Blade Lift Offset', type: 'range', min: -0.12, max: 0.42, step: 0.02 },
        { key: 'bladeCurvature', label: 'Concave Moldboard Curvature', type: 'range', min: 0.60, max: 1.40, step: 0.05 }
      ]
    },
    {
      group: '3. ROPS Glass Cabin, Engine Hood & Exhaust',
      fields: [
        { key: 'cabHeightScale', label: 'ROPS Operator Cabin Height', type: 'range', min: 0.80, max: 1.30, step: 0.02 },
        { key: 'exhaustHeightScale', label: 'Diesel Exhaust Stack Height', type: 'range', min: 0.75, max: 1.35, step: 0.05 }
      ]
    },
    {
      group: '4. Diorama Vector-Cel Palette',
      fields: [
        { key: 'armorHighlightColor', label: 'Roof & Upper Lip Highlight', type: 'color' },
        { key: 'armorBaseColor', label: 'Caterpillar Yellow Body', type: 'color' },
        { key: 'armorShadowColor', label: 'Deep Ochre Cel Shadow', type: 'color' },
        { key: 'trackColor', label: 'Steel Track Shoe Charcoal', type: 'color' },
        { key: 'hydraulicCylinderColor', label: 'Hydraulic Lift Jacket', type: 'color' },
        { key: 'glassColor', label: 'ROPS Cabin Window Tint', type: 'color' },
        { key: 'panelLineColor', label: 'Ligne-Claire Ink Outline', type: 'color' },
        {
          key: 'houseColorMode',
          label: 'Accent Color Source',
          type: 'select',
          options: [
            { value: 'DEFAULT', label: 'Caterpillar Yellow Trim' },
            { value: 'FACTION', label: 'Dynamic Faction Trim' }
          ]
        },
        { key: 'weatheringIntensity', label: 'Blade Wear & Earth Scuffs', type: 'range', min: 0, max: 1, step: 0.05 }
      ]
    },
    {
      group: '5. Component Layer Visibility & Detail Toggles',
      fields: [
        { key: 'showDozerBlade', label: 'Curved 3-Segment Moldboard Blade', type: 'checkbox' },
        { key: 'showBladeEndBits', label: 'Flared Side Cheek Plates & Cutting Edge', type: 'checkbox' },
        { key: 'showPushArms', label: 'Outside C-Frame Push Beams & Braces', type: 'checkbox' },
        { key: 'showHydraulicCylinders', label: 'Twin Hood Hydraulic Lift Cylinders', type: 'checkbox' },
        { key: 'showTrackBogies', label: 'Sculpted Yellow Roller Frame & Sprockets', type: 'checkbox' },
        { key: 'showTrackGrousers', label: 'Caterpillar Steel Track Grouser Cleats', type: 'checkbox' },
        { key: 'showGlassCab', label: 'Tall ROPS Operator Cabin & Canopy', type: 'checkbox' },
        { key: 'showSplitDoorGlass', label: '3-Pane Split Side Door & Leg Windows', type: 'checkbox' },
        { key: 'showSideMirrors', label: 'External C-Bracket Side Mirrors', type: 'checkbox' },
        { key: 'showFrontGrille', label: 'Recessed Slatted Black Radiator Grille', type: 'checkbox' },
        { key: 'showHoodLouvers', label: 'Engine Hood & Rear Quarter Louver Vents', type: 'checkbox' },
        { key: 'showPreCleanerCap', label: 'Top Hood Cylindrical Air Pre-Cleaner', type: 'checkbox' },
        { key: 'showExhaustStack', label: 'Curved Black Diesel Exhaust Stack', type: 'checkbox' },
        { key: 'showSideFenders', label: 'Stepped Track Fenders & Shoulder Boxes', type: 'checkbox' },
        { key: 'showRearCounterweight', label: 'Stepped Rear Counterweight Bumper', type: 'checkbox' },
        { key: 'showGroundShadow', label: 'Ground Contact Shadow', type: 'checkbox' }
      ]
    }
  ];

  function renderDozerModel(ctx, u, faction, customParams, options) {
    const p = Object.assign({}, DOZER_DEFAULT_PARAMS, customParams || {});
    const opts = options || {};

    const rawR = (u && u.radius) || 17;
    const r = rawR * (p.hullScale || 1.0);
    const L = p.hullLength || 1.0;
    const W = p.hullWidth || 1.0;
    const H = p.extrusionDepth || 1.0;
    const tW = p.trackWidthScale || 1.0;
    const cabH = p.cabHeightScale || 1.0;
    const exH = p.exhaustHeightScale || 1.0;

    const hullAngle = (u && u.angle !== undefined) ? u.angle : 0;
    const treadPhase = (u && u.treadPhase) || 0;
    const recoil = (u && u.recoilOffset) || 0;
    const baseLift = (p.bladeLift !== undefined ? p.bladeLift : 0.0) * r * H;
    const animLift = (Math.sin(treadPhase * Math.PI * 2) * 0.025 + (recoil > 0.1 ? Math.sin((recoil / 6.5) * Math.PI) * 0.16 : 0)) * r * H;
    const bladeLift = baseLift + animLift;
    const pitchScale = opts.pitchScale !== undefined ? opts.pitchScale : 0.66;
    const zScale = opts.zScale !== undefined ? opts.zScale : 0.76;

    const isUnmanned = Boolean(u && u.unmanned);
    const useAltHull = p.hullMidColor && p.armorBaseColor === DOZER_DEFAULT_PARAMS.armorBaseColor;
    const yellowBase = isUnmanned
      ? '#64748b'
      : useAltHull
        ? p.hullMidColor
        : (p.armorBaseColor || '#edb032');
    const yellowHi = isUnmanned
      ? '#94a3b8'
      : useAltHull
        ? (p.hullTopColor || shadeHex(p.hullMidColor, 20))
        : (p.armorHighlightColor || '#fcd762');
    const yellowDark = isUnmanned
      ? '#334155'
      : useAltHull
        ? shadeHex(p.hullMidColor, -28)
        : (p.armorShadowColor || '#bd8118');
    const trackCol = p.trackColor || '#423d38';
    const trackDarkCol = shadeHex(trackCol, -24);
    const cylCol = isUnmanned
      ? '#64748b'
      : p.houseColorMode === 'FACTION' && faction && faction.color
        ? faction.color
        : (p.hydraulicCylinderColor || '#f2b93b');
    const seamCol = p.panelLineColor || '#26201b';
    const glassCol = p.glassColor || '#699ec2';
    const weathering = p.weatheringIntensity !== undefined ? p.weatheringIntensity : 0.35;

    const proj = createProjector(hullAngle, pitchScale, zScale, 0, 0, 0, 0);

    // ========================================================================
    // 0. Ground Contact Shadow
    // ========================================================================
    if (p.showGroundShadow !== false) {
      const shadowPts = [
        proj.project(-1.08 * r * L, -0.96 * r * W, 0),
        proj.project(1.32 * r * L, -0.96 * r * W, 0),
        proj.project(1.32 * r * L, 0.96 * r * W, 0),
        proj.project(-1.08 * r * L, 0.96 * r * W, 0)
      ].map((pt) => ({ x: pt.x + 3.5, y: pt.y + 4.5 }));
      drawPolyPts(ctx, shadowPts, 'rgba(65, 50, 40, 0.36)', null, 0);
    }

    const faces = [];

    // ========================================================================
    // 1. Heavy Caterpillar Tracked Undercarriage & Sculpted Yellow Roller Frame
    //    (Matches assets/refs/usa_dozer_diorama_ref.png!)
    // ========================================================================
    const txRear = -0.88 * r * L;
    const txFront = 0.72 * r * L;
    const tzTop = 0.36 * r * H;
    const tzMid = 0.18 * r * H;

    for (const side of [-1, 1]) {
      const tyIn = side * 0.48 * r * W;
      const tyOut = side * (0.48 + 0.34 * tW) * r * W;
      const yMin = Math.min(tyIn, tyOut);
      const yMax = Math.max(tyIn, tyOut);
      const yOuterFace = tyOut;

      // Main 3D Caterpillar Track Block with bevelled front/rear sprocket arcs
      pushBox3D(
        faces,
        proj,
        txRear,
        txFront,
        yMin,
        yMax,
        0.01 * r * H,
        tzTop,
        trackCol,
        seamCol,
        1.15,
        -1.85,
        0.10 * r * L,
        0.05 * r * H
      );

      // Transverse Steel Grouser Cleat Ribs along top & front arc of Caterpillar tracks
      if (p.showTrackGrousers !== false) {
        faces.push({
          depth: proj.project((txRear + txFront) * 0.5, yOuterFace, tzTop).depth - 1.55,
          customDraw(c) {
            const cleatCount = 11;
            const spanX = txFront - txRear - 0.16 * r * L;
            const startX = txRear + 0.08 * r * L;
            const offset = ((treadPhase % 1) + 1) % 1;
            for (let i = 0; i < cleatCount; i++) {
              const frac = (i + offset) / cleatCount;
              const cx = startX + frac * spanX;
              drawLine3D(c, proj, cx, yMin, tzTop + 0.006 * r * H, cx, yMax, tzTop + 0.006 * r * H, seamCol, 1.05);
              // Outer track edge grouser tooth tick
              drawLine3D(
                c,
                proj,
                cx,
                yOuterFace,
                tzTop + 0.005 * r * H,
                cx,
                yOuterFace,
                tzTop - 0.045 * r * H,
                trackDarkCol,
                1.1
              );
            }
          }
        });
      }

      // Sculpted Caterpillar-Yellow Roller Bogie Frame, Rear Drive Sprocket, Front Idler & Road Wheels
      if (p.showTrackBogies !== false) {
        const yBogie = tyOut + side * 0.015 * r * W;
        faces.push({
          depth: proj.project(-0.08 * r * L, yBogie + side * 0.03 * r, tzMid).depth - 1.25,
          customDraw(c) {
            // 1. Rear Large Drive Sprocket Wheel + Recessed Hub Dish
            const sxRear = txRear + 0.17 * r * L;
            const szRear = 0.19 * r * H;
            const spRear = proj.project(sxRear, yBogie, szRear);
            const spRad = Math.max(3.2, 0.145 * r);
            c.fillStyle = yellowBase;
            c.strokeStyle = seamCol;
            c.lineWidth = 1.15;
            c.beginPath();
            c.arc(spRear.x, spRear.y, spRad, 0, Math.PI * 2);
            c.fill();
            c.stroke();

            c.fillStyle = yellowDark;
            c.beginPath();
            c.arc(spRear.x, spRear.y, spRad * 0.56, 0, Math.PI * 2);
            c.fill();
            c.stroke();

            // 2. Front Idler Wheel
            const sxFront = txFront - 0.16 * r * L;
            const szFront = 0.17 * r * H;
            const spFront = proj.project(sxFront, yBogie, szFront);
            const idRad = Math.max(2.6, 0.115 * r);
            c.fillStyle = yellowBase;
            c.beginPath();
            c.arc(spFront.x, spFront.y, idRad, 0, Math.PI * 2);
            c.fill();
            c.stroke();

            // 3. Sculpted Yellow Horizontal Track Roller Frame Beam connecting Sprocket to Idler
            const frameQuad = [
              proj.project(sxRear + 0.08 * r * L, yBogie, 0.09 * r * H),
              proj.project(sxFront - 0.04 * r * L, yBogie, 0.09 * r * H),
              proj.project(sxFront - 0.08 * r * L, yBogie, 0.25 * r * H),
              proj.project(sxRear + 0.06 * r * L, yBogie, 0.27 * r * H)
            ];
            drawPolyPts(c, frameQuad, yellowBase, seamCol, 1.1);

            // Upper recessed shadow groove along roller frame
            drawLine3D(
              c,
              proj,
              sxRear + 0.12 * r * L,
              yBogie,
              0.21 * r * H,
              sxFront - 0.12 * r * L,
              yBogie,
              0.20 * r * H,
              seamCol,
              0.95
            );

            // 4. Lower Bogie Road Wheel Hubs & Bolt Centers
            for (const wx of [-0.38 * r * L, -0.06 * r * L, 0.26 * r * L]) {
              const wp = proj.project(wx, yBogie, 0.11 * r * H);
              const wRad = Math.max(1.8, 0.068 * r);
              c.fillStyle = yellowDark;
              c.strokeStyle = seamCol;
              c.lineWidth = 0.95;
              c.beginPath();
              c.arc(wp.x, wp.y, wRad, 0, Math.PI * 2);
              c.fill();
              c.stroke();
            }
          }
        });
      }
    }

    // ========================================================================
    // 2. Outside-Mounted Heavy C-Frame Push Arms & Angle Braces
    //    (Running outside the tracks from rear-mid trunnion to back of blade!)
    // ========================================================================
    const bW = 1.02 * r * W * (p.bladeWidth || 1.0);
    const bH = 0.66 * r * H * (p.bladeHeight || 1.0);
    const bxBack = 0.92 * r * L;
    const zBladeBot = Math.max(0.01 * r * H, 0.02 * r * H + bladeLift);
    const zBladeTop = zBladeBot + bH;

    if (p.showPushArms !== false && p.showDozerBlade !== false) {
      for (const side of [-1, 1]) {
        const yArmIn = side * (0.48 + 0.34 * tW) * r * W;
        const yArmOut = side * (0.58 + 0.34 * tW) * r * W;
        const yaMin = Math.min(yArmIn, yArmOut);
        const yaMax = Math.max(yArmIn, yArmOut);
        const armX0 = -0.34 * r * L;
        const armX1 = bxBack + 0.02 * r * L;
        const armZ0 = 0.11 * r * H;
        const armZ1 = zBladeBot + 0.08 * r * H;
        const armThickZ = 0.11 * r * H;

        // 3D Rectangular Box Push Beam along outside of track
        const armBot = [
          [armX0, yaMin, armZ0],
          [armX1, yaMin, armZ1],
          [armX1, yaMax, armZ1],
          [armX0, yaMax, armZ0]
        ];
        const armTop = [
          [armX0, yaMin, armZ0 + armThickZ],
          [armX1, yaMin, armZ1 + armThickZ],
          [armX1, yaMax, armZ1 + armThickZ],
          [armX0, yaMax, armZ0 + armThickZ]
        ];
        pushFrustumFaces(faces, proj, armBot, armTop, yellowBase, seamCol, 1.1, -0.45);

        // Diagonal Tilt Strut Brace + Mid-Arm Gusset Flange & Trunnion Boss
        faces.push({
          depth: proj.project(0.45 * r * L, yArmOut + side * 0.02 * r, armZ1 + 0.12 * r * H).depth - 0.15,
          customDraw(c) {
            // Diagonal upper angle brace from push beam up to mid-back of blade
            const braceX0 = 0.44 * r * L;
            const braceZ0 = (armZ0 + armZ1) * 0.5 + armThickZ;
            drawLine3D(c, proj, braceX0, yArmIn, braceZ0, bxBack, yArmIn, zBladeBot + 0.42 * bH, seamCol, 3.2);
            drawLine3D(c, proj, braceX0, yArmIn, braceZ0, bxBack, yArmIn, zBladeBot + 0.42 * bH, yellowDark, 1.8);

            // Mid-beam joint seam & pin rivets (matching usa_dozer_diorama_ref.png!)
            const jx = -0.02 * r * L;
            const jz = (armZ0 + armZ1) * 0.5;
            drawLine3D(c, proj, jx, yArmOut, jz, jx, yArmOut, jz + armThickZ, seamCol, 1.05);
            for (const rx of [-0.28 * r * L, 0.36 * r * L]) {
              const rp = proj.project(rx, yArmOut, jz + 0.5 * armThickZ);
              c.fillStyle = yellowDark;
              c.strokeStyle = seamCol;
              c.lineWidth = 0.85;
              c.beginPath();
              c.arc(rp.x, rp.y, Math.max(1.2, 0.032 * r), 0, Math.PI * 2);
              c.fill();
              c.stroke();
            }
          }
        });
      }
    }

    // ========================================================================
    // 3. Stepped Rear Counterweight Bumper, Rear Fuel Deck & Side Fender Boxes
    // ========================================================================
    // 3a. Stepped Rear Counterweight Bumper & Tow Hitch
    if (p.showRearCounterweight !== false) {
      pushBox3D(
        faces,
        proj,
        -1.03 * r * L,
        -0.84 * r * L,
        -0.54 * r * W,
        0.54 * r * W,
        0.18 * r * H,
        0.42 * r * H,
        yellowDark,
        seamCol,
        1.1,
        -0.35,
        0.03 * r,
        0.03 * r
      );
    }

    // 3b. Rear Auxiliary/Fuel Housing behind Operator Cabin
    pushBox3D(
      faces,
      proj,
      -0.91 * r * L,
      -0.44 * r * L,
      -0.48 * r * W,
      0.48 * r * W,
      0.26 * r * H,
      0.74 * r * H,
      yellowBase,
      seamCol,
      1.15,
      0.10,
      0.04 * r,
      0.04 * r
    );

    // 3c. Stepped Track Fender Catwalks & Raised Sloped Side Shoulder Boxes beside Cab
    if (p.showSideFenders !== false) {
      for (const side of [-1, 1]) {
        const yfIn = side * 0.46 * r * W;
        const yfOut = side * (0.46 + 0.32 * tW) * r * W;
        const yfMin = Math.min(yfIn, yfOut);
        const yfMax = Math.max(yfIn, yfOut);

        // Flat horizontal fender catwalk above tracks
        pushBox3D(
          faces,
          proj,
          -0.52 * r * L,
          0.18 * r * L,
          yfMin,
          yfMax,
          0.40 * r * H,
          0.48 * r * H,
          yellowHi,
          seamCol,
          1.05,
          0.18,
          0.02 * r,
          0.01 * r
        );

        // Raised sloped side shoulder box flanking rear half of cab door (matching usa_dozer_diorama_ref.png!)
        const ysOut = side * (0.46 + 0.24 * tW) * r * W;
        const ysMin = Math.min(yfIn, ysOut);
        const ysMax = Math.max(yfIn, ysOut);
        pushBox3D(
          faces,
          proj,
          -0.48 * r * L,
          -0.12 * r * L,
          ysMin,
          ysMax,
          0.48 * r * H,
          0.68 * r * H,
          yellowBase,
          seamCol,
          1.1,
          0.32,
          0.04 * r,
          0.03 * r
        );
      }
    }

    // ========================================================================
    // 4. Forward Sloped Louvered Engine Hood, Pre-Cleaner Cap & Slatted Grille
    // ========================================================================
    const hx0 = 0.14 * r * L;
    const hx1 = 0.80 * r * L;
    const hy = 0.39 * r * W;
    const hz0 = 0.28 * r * H;
    const hz1 = 0.78 * r * H;

    pushBox3D(
      faces,
      proj,
      hx0,
      hx1,
      -hy,
      hy,
      hz0,
      hz1,
      yellowBase,
      seamCol,
      1.15,
      0.38,
      0.04 * r,
      0.04 * r
    );

    // Side Cooling Louver Vents on Forward Engine Hood & Rear Quarter Panel
    if (p.showHoodLouvers !== false) {
      for (const side of [-1, 1]) {
        const ySideHood = side * (hy + 0.008 * r * W);
        faces.push({
          depth: proj.project(0.42 * r * L, ySideHood + side * 0.02 * r, 0.52 * r * H).depth + 0.55,
          customDraw(c) {
            // Recessed hood side panel outline
            const pQuad = [
              proj.project(0.22 * r * L, ySideHood, 0.36 * r * H),
              proj.project(0.58 * r * L, ySideHood, 0.36 * r * H),
              proj.project(0.58 * r * L, ySideHood, 0.65 * r * H),
              proj.project(0.22 * r * L, ySideHood, 0.65 * r * H)
            ];
            drawPolyPts(c, pQuad, yellowDark, seamCol, 0.9);
            // 4 vertical cooling louver slots on hood flank
            for (const lx of [0.28 * r * L, 0.36 * r * L, 0.44 * r * L, 0.52 * r * L]) {
              drawLine3D(c, proj, lx, ySideHood, 0.40 * r * H, lx, ySideHood, 0.61 * r * H, seamCol, 1.0);
            }
          }
        });

        // Rear auxiliary housing vertical louver vents
        const ySideRear = side * 0.488 * r * W;
        faces.push({
          depth: proj.project(-0.68 * r * L, ySideRear + side * 0.02 * r, 0.52 * r * H).depth + 0.28,
          customDraw(c) {
            for (const rx of [-0.78 * r * L, -0.71 * r * L, -0.64 * r * L]) {
              drawLine3D(c, proj, rx, ySideRear, 0.44 * r * H, rx, ySideRear, 0.65 * r * H, seamCol, 0.95);
            }
          }
        });
      }
    }

    // Top Engine Hood Cylindrical Air Pre-Cleaner Cap (right in front of windshield!)
    if (p.showPreCleanerCap !== false) {
      pushCylinderZ3D(
        faces,
        proj,
        0.34 * r * L,
        -0.05 * r * W,
        hz1,
        hz1 + 0.09 * r * H,
        0.13 * r,
        0.13 * r,
        10,
        '#4b5563',
        seamCol,
        1.05,
        0.78
      );
    }

    // Front Recessed Slatted Black Radiator Grille on Nose of Engine Hood
    if (p.showFrontGrille !== false) {
      faces.push({
        depth: proj.project(hx1 + 0.01 * r * L, 0, 0.52 * r * H).depth + 0.65,
        customDraw(c) {
          const gPts = [
            proj.project(hx1 + 0.005 * r * L, -0.29 * r * W, 0.32 * r * H),
            proj.project(hx1 + 0.005 * r * L, 0.29 * r * W, 0.32 * r * H),
            proj.project(hx1 - 0.02 * r * L, 0.27 * r * W, 0.70 * r * H),
            proj.project(hx1 - 0.02 * r * L, -0.27 * r * W, 0.70 * r * H)
          ];
          drawPolyPts(c, gPts, '#3a3530', seamCol, 1.1);
          // 6 horizontal radiator grille slats
          for (let z = 0.37; z <= 0.65; z += 0.055) {
            drawLine3D(
              c,
              proj,
              hx1 + 0.008 * r * L,
              -0.25 * r * W,
              z * r * H,
              hx1 + 0.008 * r * L,
              0.25 * r * W,
              z * r * H,
              seamCol,
              0.95
            );
          }
        }
      });
    }

    // ========================================================================
    // 5. Tall ROPS Glass Operator Cabin, Overhanging Canopy Roof & Split Doors
    //    (Matches assets/refs/usa_dozer_diorama_ref.png!)
    // ========================================================================
    if (p.showGlassCab !== false) {
      const cx0 = -0.48 * r * L;
      const cx1 = 0.16 * r * L;
      const cy = 0.47 * r * W;
      const cz0 = 0.48 * r * H;
      const cz1 = 1.15 * r * H * cabH;

      // Main ROPS Operator Cabin Body
      pushBox3D(
        faces,
        proj,
        cx0,
        cx1,
        -cy,
        cy,
        cz0,
        cz1,
        yellowBase,
        seamCol,
        1.15,
        0.82,
        0.03 * r,
        0.02 * r
      );

      // Thick Overhanging ROPS Sun-Canopy Roof Slab in Bright Highlight Yellow
      const rcx0 = cx0 - 0.04 * r * L;
      const rcx1 = cx1 + 0.05 * r * L;
      const rcy = cy + 0.04 * r * W;
      const rcz0 = cz1 - 0.02 * r * H;
      const rcz1 = cz1 + 0.08 * r * H;
      pushBox3D(
        faces,
        proj,
        rcx0,
        rcx1,
        -rcy,
        rcy,
        rcz0,
        rcz1,
        yellowHi,
        seamCol,
        1.15,
        1.05,
        0.02 * r,
        0.02 * r
      );

      // Sloped Front Windshield + 3-Pane Split Side Cab Windows
      faces.push({
        depth: proj.project(cx1, 0, (cz0 + cz1) * 0.55).depth + 1.15,
        customDraw(c) {
          // 1. Large Sloped Front Windshield with Ligne-Claire diagonal reflection slashes
          const frontWin = [
            [cx1 - 0.008 * r * L, -cy * 0.80, cz0 + 0.28 * r * H],
            [cx1 - 0.008 * r * L, cy * 0.80, cz0 + 0.28 * r * H],
            [cx1 - 0.032 * r * L, cy * 0.76, cz1 - 0.06 * r * H],
            [cx1 - 0.032 * r * L, -cy * 0.76, cz1 - 0.06 * r * H]
          ];
          drawGlassPane3D(c, proj, frontWin, glassCol, seamCol, 1.05);

          // 2. Side Cab Windows (3-pane split layout matching usa_dozer_diorama_ref.png!)
          for (const side of [-1, 1]) {
            const sy = side * cy * 0.99;
            const syTop = side * cy * 0.95;

            if (p.showSplitDoorGlass !== false) {
              // (a) Rear vertical quarter window
              const rearPane = [
                [cx0 + 0.06 * r * L, sy, cz0 + 0.24 * r * H],
                [-0.21 * r * L, sy, cz0 + 0.24 * r * H],
                [-0.21 * r * L, syTop, cz1 - 0.07 * r * H],
                [cx0 + 0.07 * r * L, syTop, cz1 - 0.07 * r * H]
              ];
              drawGlassPane3D(c, proj, rearPane, glassCol, seamCol, 0.95);

              // (b) Forward upper door window
              const upperDoorPane = [
                [-0.15 * r * L, sy, cz0 + 0.24 * r * H],
                [cx1 - 0.07 * r * L, sy, cz0 + 0.24 * r * H],
                [cx1 - 0.08 * r * L, syTop, cz1 - 0.07 * r * H],
                [-0.15 * r * L, syTop, cz1 - 0.07 * r * H]
              ];
              drawGlassPane3D(c, proj, upperDoorPane, glassCol, seamCol, 0.98);

              // (c) Lower angled trapezoidal door leg-visibility window
              const lowerDoorPane = [
                [-0.11 * r * L, sy, cz0 + 0.04 * r * H],
                [cx1 - 0.07 * r * L, sy, cz0 + 0.04 * r * H],
                [cx1 - 0.07 * r * L, sy, cz0 + 0.19 * r * H],
                [-0.15 * r * L, sy, cz0 + 0.19 * r * H]
              ];
              drawGlassPane3D(c, proj, lowerDoorPane, glassCol, seamCol, 0.92);

              // Door latch / vertical grab bar
              drawLine3D(
                c,
                proj,
                -0.17 * r * L,
                sy,
                cz0 + 0.22 * r * H,
                -0.17 * r * L,
                sy,
                cz0 + 0.36 * r * H,
                seamCol,
                1.2
              );
            } else {
              const singleSideWin = [
                [cx0 + 0.08 * r * L, sy, cz0 + 0.22 * r * H],
                [cx1 - 0.08 * r * L, sy, cz0 + 0.22 * r * H],
                [cx1 - 0.10 * r * L, syTop, cz1 - 0.07 * r * H],
                [cx0 + 0.10 * r * L, syTop, cz1 - 0.07 * r * H]
              ];
              drawGlassPane3D(c, proj, singleSideWin, glassCol, seamCol, 0.95);
            }
          }
        }
      });

      // External C-Bracket Side Mirrors on Front Cab A-Pillars
      if (p.showSideMirrors !== false) {
        for (const side of [-1, 1]) {
          const yPillar = side * cy * 0.98;
          const yMirror = side * (cy + 0.12 * r * W);
          faces.push({
            depth: proj.project(cx1 - 0.04 * r * L, yMirror, cz0 + 0.45 * r * H).depth + 1.22,
            customDraw(c) {
              drawLine3D(c, proj, cx1 - 0.04 * r * L, yPillar, cz1 - 0.10 * r * H, cx1 - 0.04 * r * L, yMirror, cz1 - 0.10 * r * H, seamCol, 1.1);
              drawLine3D(c, proj, cx1 - 0.04 * r * L, yPillar, cz0 + 0.32 * r * H, cx1 - 0.04 * r * L, yMirror, cz0 + 0.32 * r * H, seamCol, 1.1);
              const mQuad = [
                proj.project(cx1 - 0.06 * r * L, yMirror, cz0 + 0.34 * r * H),
                proj.project(cx1 - 0.02 * r * L, yMirror, cz0 + 0.34 * r * H),
                proj.project(cx1 - 0.02 * r * L, yMirror, cz1 - 0.12 * r * H),
                proj.project(cx1 - 0.06 * r * L, yMirror, cz1 - 0.12 * r * H)
              ];
              drawPolyPts(c, mQuad, '#94a3b8', seamCol, 0.95);
            }
          });
        }
      }
    }

    // ========================================================================
    // 6. Vertical Black Diesel Exhaust Stack with Curved Goose-Neck Rain Cap
    // ========================================================================
    if (p.showExhaustStack !== false) {
      const ex = -0.62 * r * L;
      const ey = -0.28 * r * W;
      const ezBase = 0.72 * r * H;
      const ezMid = (0.72 + 0.30 * exH) * r * H;
      const ezTop = (0.72 + 0.44 * exH) * r * H;

      // Lower Cylindrical Muffler Barrel
      pushCylinderZ3D(
        faces,
        proj,
        ex,
        ey,
        ezBase,
        ezMid,
        0.068 * r,
        0.064 * r,
        8,
        '#475569',
        seamCol,
        1.05,
        1.20
      );

      // Upper Exhaust Pipe & Curved Goose-Neck Tip
      faces.push({
        depth: proj.project(ex, ey, ezTop).depth + 1.28,
        customDraw(c) {
          drawLine3D(c, proj, ex, ey, ezMid, ex, ey, ezTop, seamCol, 4.2);
          drawLine3D(c, proj, ex, ey, ezMid, ex, ey, ezTop, '#334155', 2.4);
          // Curved goose-neck elbow tip pointing aft
          drawLine3D(c, proj, ex, ey, ezTop, ex - 0.09 * r * L, ey - 0.03 * r * W, ezTop + 0.06 * r * H, seamCol, 3.8);
          drawLine3D(c, proj, ex, ey, ezTop, ex - 0.09 * r * L, ey - 0.03 * r * W, ezTop + 0.06 * r * H, '#334155', 2.1);
        }
      });
    }

    // ========================================================================
    // 7. Twin Hood-Mounted Hydraulic Lift Cylinders & Chrome Piston Rods
    //    (Matches assets/refs/usa_dozer_diorama_ref.png!)
    // ========================================================================
    if (p.showHydraulicCylinders !== false && p.showDozerBlade !== false) {
      for (const side of [-1, 1]) {
        const cyCyl = side * (hy + 0.065 * r * W);
        const topMountX = 0.55 * r * L;
        const topMountZ = 0.84 * r * H;
        const botMountX = bxBack - 0.04 * r * L;
        const botMountZ = zBladeBot + 0.28 * bH;
        const midRodX = topMountX + (botMountX - topMountX) * 0.68;
        const midRodZ = topMountZ + (botMountZ - topMountZ) * 0.68;

        faces.push({
          depth: proj.project(midRodX, cyCyl, midRodZ).depth + 1.15,
          customDraw(c) {
            // Circular trunnion pivot boss on side of engine hood
            const trPt = proj.project(0.58 * r * L, cyCyl, 0.56 * r * H);
            c.fillStyle = yellowDark;
            c.strokeStyle = seamCol;
            c.lineWidth = 1.0;
            c.beginPath();
            c.arc(trPt.x, trPt.y, Math.max(1.8, 0.055 * r), 0, Math.PI * 2);
            c.fill();
            c.stroke();

            // Lower polished silver-chrome hydraulic piston rod (#e2e8f0)
            drawLine3D(c, proj, midRodX, cyCyl, midRodZ, botMountX, cyCyl, botMountZ, seamCol, 3.6);
            drawLine3D(c, proj, midRodX, cyCyl, midRodZ, botMountX, cyCyl, botMountZ, '#e2e8f0', 2.0);

            // Upper Caterpillar-yellow hydraulic cylinder barrel jacket
            drawLine3D(c, proj, topMountX, cyCyl, topMountZ, midRodX, cyCyl, midRodZ, seamCol, 5.2);
            drawLine3D(c, proj, topMountX, cyCyl, topMountZ, midRodX, cyCyl, midRodZ, cylCol, 3.2);
          }
        });
      }
    }

    flushFaces(ctx, faces);

    // ========================================================================
    // 8. Massive Curved 3-Segment Front Earth-Moving Moldboard Blade & End Bits
    //    (Rendered in its own sorted pass so the wide front blade & flared side
    //     cheeks sort cleanly across the nose from any 360° turntable angle!)
    // ========================================================================
    if (p.showDozerBlade !== false) {
      const bFaces = [];
      const curve = p.bladeCurvature !== undefined ? p.bladeCurvature : 1.0;

      // 3-station vertical concave profile coordinates along X and Z:
      // z0 (Bottom cutting edge) -> z1 (Lower wear lip top) -> z2 (Concave mid-belly) -> z3 (Top spill guard lip)
      const z0 = zBladeBot;
      const z1 = zBladeBot + 0.24 * bH;
      const z2 = zBladeBot + 0.76 * bH;
      const z3 = zBladeTop;

      const xFront0 = (0.94 + 0.28 * curve) * r * L; // Sharp forward-swept bottom cutting edge
      const xFront1 = (0.94 + 0.16 * curve) * r * L; // Top of lower bevelled wear plate
      const xFront2 = (0.94 + 0.10 * curve) * r * L; // Deepest concave moldboard belly
      const xFront3 = (0.94 + 0.18 * curve) * r * L; // Forward-curling top spill lip
      const xBack0 = bxBack;
      const xBack1 = bxBack - 0.02 * r * L;
      const xBack2 = bxBack - 0.04 * r * L;
      const xBack3 = bxBack - 0.02 * r * L;

      // Segment 1: Lower Bevelled Cutting-Edge Wear Plate (bright golden-yellow with bolt rivets & scuffs)
      const seg1Bot = [
        [xBack0, -bW, z0],
        [xFront0, -bW * 0.98, z0],
        [xFront0, bW * 0.98, z0],
        [xBack0, bW, z0]
      ];
      const seg1Top = [
        [xBack1, -bW, z1],
        [xFront1, -bW * 0.98, z1],
        [xFront1, bW * 0.98, z1],
        [xBack1, bW, z1]
      ];
      pushFrustumFaces(bFaces, proj, seg1Bot, seg1Top, yellowBase, seamCol, 1.15, 1.40);

      // Segment 2: Middle Concave Moldboard Face (rich ochre cel-shadow tone matching usa_dozer_diorama_ref.png!)
      const seg2Top = [
        [xBack2, -bW, z2],
        [xFront2, -bW * 0.98, z2],
        [xFront2, bW * 0.98, z2],
        [xBack2, bW, z2]
      ];
      pushFrustumFaces(bFaces, proj, seg1Top, seg2Top, yellowDark, seamCol, 1.1, 1.48);

      // Segment 3: Upper Forward-Curling Spill Guard Lip (bright highlight yellow)
      const seg3Top = [
        [xBack3, -bW, z3],
        [xFront3, -bW * 0.98, z3],
        [xFront3, bW * 0.98, z3],
        [xBack3, bW, z3]
      ];
      pushFrustumFaces(bFaces, proj, seg2Top, seg3Top, yellowHi, seamCol, 1.15, 1.56);

      // Cutting-edge wear bolts & earth-scuff weathering ticks along lower blade face
      if (weathering > 0.05) {
        bFaces.push({
          depth: proj.project((xFront0 + xFront1) * 0.5, 0, (z0 + z1) * 0.5).depth + 1.68,
          customDraw(c) {
            for (const byFrac of [-0.68, -0.34, 0, 0.34, 0.68]) {
              const wy = byFrac * bW;
              drawLine3D(
                c,
                proj,
                xFront0 - 0.02 * r * L,
                wy,
                z0 + 0.04 * bH,
                xFront1 - 0.01 * r * L,
                wy + 0.02 * r * W,
                z1 - 0.05 * bH,
                'rgba(38, 32, 27, 0.55)',
                0.95
              );
            }
          }
        });
      }

      // Flared Left & Right Side Cheek Plates (End Bits) with Forward-Swept Cutting Corners
      if (p.showBladeEndBits !== false) {
        const cheekThick = 0.065 * r * W;
        for (const side of [-1, 1]) {
          const yIn = side * bW * 0.96;
          const yOut = side * (bW * 0.96 + cheekThick);
          const ycMin = Math.min(yIn, yOut);
          const ycMax = Math.max(yIn, yOut);

          const cBot = [
            [xBack0 - 0.02 * r * L, ycMin, z0 - 0.01 * r * H],
            [xFront0 + 0.04 * r * L, ycMin, z0 - 0.01 * r * H],
            [xFront0 + 0.04 * r * L, ycMax, z0 - 0.01 * r * H],
            [xBack0 - 0.02 * r * L, ycMax, z0 - 0.01 * r * H]
          ];
          const cTop = [
            [xBack3 - 0.02 * r * L, ycMin, z3 + 0.02 * r * H],
            [xFront3 + 0.02 * r * L, ycMin, z3 + 0.02 * r * H],
            [xFront3 + 0.02 * r * L, ycMax, z3 + 0.02 * r * H],
            [xBack3 - 0.02 * r * L, ycMax, z3 + 0.02 * r * H]
          ];
          pushFrustumFaces(bFaces, proj, cBot, cTop, yellowBase, seamCol, 1.2, 1.72);
        }
      }

      flushFaces(ctx, bFaces);
    }
  }

  // ==========================================================================
  // 7. Unit #9 & #10: USA Chinook & Combat Chinook (Twin-Tandem Rotor Helicopter)
  //    Matches assets/refs/usa_chinook_diorama_ref.png
  // ==========================================================================
  const CHINOOK_DEFAULT_PARAMS = {
    hullScale: 1.0,
    hullLength: 1.0,
    hullWidth: 1.0,
    rotorSpan: 1.0,
    armorBaseColor: '#6d7a53',
    camoStripeColor: '#d4b07b',
    panelLineColor: '#26201b',
    glassColor: '#62b0d9',
    showRotors: true,
    showPortholes: true,
    showSponsons: true
  };

  const COMBAT_CHINOOK_DEFAULT_PARAMS = Object.assign({}, CHINOOK_DEFAULT_PARAMS, {
    hullScale: 1.05,
    armorBaseColor: '#556343',
    camoStripeColor: '#c9a46b'
  });

  const CHINOOK_PARAM_SCHEMA = [
    {
      group: '1. Twin-Tandem Fuselage Proportions',
      fields: [
        { key: 'hullScale', label: 'Overall Helicopter Scale', type: 'range', min: 0.75, max: 1.35, step: 0.02 },
        { key: 'hullLength', label: 'Fuselage & Cargo Bay Length', type: 'range', min: 0.85, max: 1.25, step: 0.02 },
        { key: 'hullWidth', label: 'Cabin & Sponson Width', type: 'range', min: 0.85, max: 1.25, step: 0.02 }
      ]
    },
    {
      group: '2. Tandem Rotor & Engine Pylon Geometry',
      fields: [
        { key: 'rotorSpan', label: 'Counter-Rotating Rotor Diameter', type: 'range', min: 0.75, max: 1.35, step: 0.05 },
        { key: 'extrusionDepth', label: 'Vertical Cabin & Pylon Height', type: 'range', min: 0.80, max: 1.30, step: 0.05 }
      ]
    },
    {
      group: '3. Combat Gunship Sponsons & Avionics',
      fields: [
        { key: 'weathering', label: 'Rotor Downwash & Desert Dust', type: 'range', min: 0.0, max: 1.0, step: 0.05 }
      ]
    },
    {
      group: '4. Diorama Camouflage Palette',
      fields: [
        { key: 'armorBaseColor', label: 'Olive-Drab Base', type: 'color' },
        { key: 'camoStripeColor', label: 'Desert Tan Camo Bands', type: 'color' },
        { key: 'panelLineColor', label: 'Ligne-Claire Ink Outline', type: 'color' },
        { key: 'glassColor', label: 'Cockpit & Chin Bubble Glass', type: 'color' }
      ]
    },
    {
      group: '5. Component Visibility Toggles',
      fields: [
        { key: 'showRotors', label: 'Front & Rear Spinning 3-Blade Rotors', type: 'checkbox' },
        { key: 'showSponsons', label: 'Side Fuel Sponsons & Quad Landing Gear', type: 'checkbox' },
        { key: 'showPortholes', label: 'Cabin Portholes & Combat Gun Ports', type: 'checkbox' }
      ]
    }
  ];

  const CHINOOK_PRESETS = {
    DIORAMA_DEFAULT: { name: '1. Olive & Sand Supply (Default)', params: Object.assign({}, CHINOOK_DEFAULT_PARAMS) },
    DESERT_MEDEVAC: { name: '2. Desert Sand Logistics', params: Object.assign({}, CHINOOK_DEFAULT_PARAMS, { armorBaseColor: '#c9a673', camoStripeColor: '#9c7c4e' }) },
    NIGHT_STALKER: { name: '3. SOAR Night Stalker (160th)', params: Object.assign({}, CHINOOK_DEFAULT_PARAMS, { armorBaseColor: '#2d3748', camoStripeColor: '#1e293b', glassColor: '#eab308' }) },
    ARCTIC_LIFT: { name: '4. Arctic Heavy Lift', params: Object.assign({}, CHINOOK_DEFAULT_PARAMS, { armorBaseColor: '#cbd5e1', camoStripeColor: '#ea580c' }) },
    COMBAT_GUNSHIP: { name: '5. Granger Combat Gunship', params: Object.assign({}, COMBAT_CHINOOK_DEFAULT_PARAMS) }
  };

  function renderChinookModel(ctx, u, faction, customParams, options) {
    const isCombat = u && u.defId === 'USA_COMBAT_CHINOOK';
    const baseDef = isCombat ? COMBAT_CHINOOK_DEFAULT_PARAMS : CHINOOK_DEFAULT_PARAMS;
    const p = Object.assign({}, baseDef, customParams || {});
    const opts = options || {};

    const rawR = (u && u.radius) || 19;
    const r = rawR * (p.hullScale || 1.0);
    const L = p.hullLength || 1.0;
    const W = p.hullWidth || 1.0;
    const hullAngle = (u && u.angle !== undefined) ? u.angle : 0;
    const recoil = (u && u.recoilOffset) || 0;
    const phase = (u && u.treadPhase) || (typeof performance !== 'undefined' ? (performance.now() * 0.003) % 1 : 0);
    const hoverZ = Math.sin(phase * Math.PI * 2) * 0.04 * r;
    const pitchScale = opts.pitchScale !== undefined ? opts.pitchScale : 1.0;
    const zScale = opts.zScale !== undefined ? opts.zScale : 0.42;

    const oliveCol = p.armorBaseColor || '#6d7a53';
    const tanCol = p.camoStripeColor || '#d4b07b';
    const seamCol = p.panelLineColor || '#26201b';
    const glassCol = p.glassColor || '#62b0d9';

    const proj = createProjector(hullAngle, pitchScale, zScale, 0, 0, 0, 0);

    // Ground Contact & Rotor Downwash Shadow
    const shadowPts = [
      proj.project(-1.26 * r * L, -0.70 * r * W, 0),
      proj.project(1.26 * r * L, -0.70 * r * W, 0),
      proj.project(1.26 * r * L, 0.70 * r * W, 0),
      proj.project(-1.26 * r * L, 0.70 * r * W, 0)
    ].map((pt) => ({ x: pt.x + 4.5, y: pt.y + 6.0 }));
    drawPolyPts(ctx, shadowPts, 'rgba(65, 50, 40, 0.28)', null, 0);

    const faces = [];
    const zBot = 0.22 * r + hoverZ;
    const zTop = 0.74 * r + hoverZ;

    // 1. Quad Wheeled Landing Gear Bogies + Sculpted Side Fuel Sponsons
    if (p.showSponsons !== false) {
      for (const side of [-1, 1]) {
        const yIn = side * 0.46 * r * W;
        const yOut = side * 0.70 * r * W;
        const yMin = Math.min(yIn, yOut);
        const yMax = Math.max(yIn, yOut);
        const yWheel = side * 0.60 * r * W;

        // Forward & Aft Landing Gear Wheels under Sponsons
        for (const wx of [-0.62 * r * L, 0.34 * r * L]) {
          faces.push({
            depth: proj.project(wx, yWheel, zBot - 0.08 * r).depth - 0.45,
            customDraw(c) {
              const wPt = proj.project(wx, yWheel, zBot - 0.08 * r);
              const sPt = proj.project(wx, yWheel * 0.92, zBot + 0.02 * r);
              c.strokeStyle = '#64748b';
              c.lineWidth = 1.6;
              c.beginPath();
              c.moveTo(sPt.x, sPt.y);
              c.lineTo(wPt.x, wPt.y);
              c.stroke();

              c.fillStyle = '#1e293b';
              c.strokeStyle = seamCol;
              c.lineWidth = 1.05;
              c.beginPath();
              c.arc(wPt.x, wPt.y, Math.max(2.1, 0.095 * r), 0, Math.PI * 2);
              c.fill();
              c.stroke();

              c.fillStyle = '#94a3b8';
              c.beginPath();
              c.arc(wPt.x, wPt.y, Math.max(0.9, 0.04 * r), 0, Math.PI * 2);
              c.fill();
            }
          });
        }

        // Main Sponson Fuel Tank Bulge (Two-Tone Tan & Olive)
        pushBox3D(faces, proj, -0.82 * r * L, 0.16 * r * L, yMin, yMax, zBot - 0.03 * r, zBot + 0.24 * r, tanCol, seamCol, 1.05, -0.25, 0.06 * r, 0.02 * r);
        pushBox3D(faces, proj, 0.16 * r * L, 0.54 * r * L, yMin, yMax * 0.94, zBot - 0.02 * r, zBot + 0.21 * r, oliveCol, seamCol, 1.05, -0.22, 0.08 * r, 0.02 * r);

        // Combat Chinook Sponson Hydra-70 Rocket Pods
        if (isCombat) {
          pushTubeSegment3D(faces, proj, -0.10 * r * L, side * 0.75 * r * W, zBot + 0.08 * r, 0, 0, 0.44 * r * L, 0.085 * r, 0.085 * r, '#334155', seamCol, 0.95, -0.15);
        }
      }
    }

    // 2. Main Cargo Fuselage (Segmented in Olive-Drab & Desert-Tan Camo Bands + Sculpted Nose & Rear Ramp)
    // Aft section + Angled Rear Cargo Ramp
    pushBox3D(faces, proj, -1.10 * r * L, -0.36 * r * L, -0.50 * r * W, 0.50 * r * W, zBot, zTop, oliveCol, seamCol, 1.15, 0.1, 0.05 * r, 0.05 * r);
    // Mid section in Desert Tan camo band
    pushBox3D(faces, proj, -0.36 * r * L, 0.36 * r * L, -0.50 * r * W, 0.50 * r * W, zBot, zTop, tanCol, seamCol, 1.15, 0.2, 0.02 * r, 0.05 * r);
    // Forward cabin & cockpit section in Olive-Drab
    pushBox3D(faces, proj, 0.36 * r * L, 1.04 * r * L, -0.48 * r * W, 0.48 * r * W, zBot, zTop * 0.96, oliveCol, seamCol, 1.15, 0.3, 0.10 * r, 0.08 * r);
    // Rounded Nose Chin & Dark Charcoal Weather Radar Radome Cap
    pushBox3D(faces, proj, 1.00 * r * L, 1.18 * r * L, -0.32 * r * W, 0.32 * r * W, zBot + 0.03 * r, zBot + 0.28 * r, '#334155', seamCol, 1.1, 0.38, 0.08 * r, 0.05 * r);

    // 3. Dorsal Drive-Shaft Spine Fairing + Forward Rotor Mast + Tall Rear Rotor Pylon + Twin T55 Turboshaft Nacelles
    pushBox3D(faces, proj, -0.62 * r * L, 0.62 * r * L, -0.14 * r * W, 0.14 * r * W, zTop - 0.02 * r, zTop + 0.10 * r, oliveCol, seamCol, 1.0, 0.52, 0.03 * r, 0.02 * r);
    pushBox3D(faces, proj, 0.54 * r * L, 0.94 * r * L, -0.24 * r * W, 0.24 * r * W, zTop * 0.92, zTop + 0.26 * r, oliveCol, seamCol, 1.1, 0.6, 0.05 * r, 0.04 * r);
    pushBox3D(faces, proj, -1.08 * r * L, -0.56 * r * L, -0.26 * r * W, 0.26 * r * W, zTop * 0.95, zTop + 0.44 * r, tanCol, seamCol, 1.1, 0.65, 0.06 * r, 0.05 * r);

    // Twin T55-GA-714A Turboshaft Engine Pods with Metallic Exhaust Cones & Dark Intake Mouths
    for (const side of [-1, 1]) {
      const ey = side * 0.42 * r * W;
      pushTubeSegment3D(faces, proj, -0.96 * r * L, ey, zTop + 0.06 * r, 0, 0, 0.52 * r * L, 0.12 * r, 0.13 * r, oliveCol, seamCol, 1.05, 0.58);
      pushTubeSegment3D(faces, proj, -1.10 * r * L, ey, zTop + 0.06 * r, 0, 0, 0.15 * r * L, 0.09 * r, 0.11 * r, '#94a3b8', seamCol, 0.95, 0.56);
    }

    // 4. Multi-Pane Cockpit Glass, Chin Windows, Panel Ribs, Nose Pitots & Cabin Portholes
    faces.push({
      depth: proj.project(1.04 * r * L, 0, (zBot + zTop) * 0.54).depth + 0.85,
      customDraw(c) {
        // Nose twin pitot probes
        for (const side of [-1, 1]) {
          drawLine3D(c, proj, 1.16 * r * L, side * 0.12 * r * W, zBot + 0.16 * r, 1.30 * r * L, side * 0.12 * r * W, zBot + 0.16 * r, seamCol, 1.3);
        }

        // 4-Pane Wrap-Around Blue Cockpit Windshield + Lower Chin Observation Windows
        for (const side of [-1, 1]) {
          const y0 = side * 0.03 * r * W;
          const yMid = side * 0.22 * r * W;
          const y1 = side * 0.43 * r * W;
          const frontPane = [
            [1.04 * r * L, y0, zBot + 0.22 * r],
            [1.00 * r * L, yMid, zBot + 0.22 * r],
            [0.88 * r * L, yMid * 0.92, zTop - 0.06 * r],
            [0.93 * r * L, y0, zTop - 0.06 * r]
          ];
          const sidePane = [
            [0.99 * r * L, yMid * 1.05, zBot + 0.20 * r],
            [0.86 * r * L, y1, zBot + 0.20 * r],
            [0.74 * r * L, y1 * 0.92, zTop - 0.07 * r],
            [0.87 * r * L, yMid * 0.96, zTop - 0.06 * r]
          ];
          drawGlassPane3D(c, proj, sidePane, glassCol, seamCol, 1.0);
          drawGlassPane3D(c, proj, frontPane, glassCol, seamCol, 1.05);

          // Chin bubble window
          const chinPane = [
            [1.04 * r * L, side * 0.16 * r * W, zBot + 0.06 * r],
            [0.94 * r * L, side * 0.36 * r * W, zBot + 0.06 * r],
            [0.94 * r * L, side * 0.36 * r * W, zBot + 0.16 * r],
            [1.04 * r * L, side * 0.16 * r * W, zBot + 0.16 * r]
          ];
          drawGlassPane3D(c, proj, chinPane, '#38bdf8', seamCol, 0.85);
        }

        // Rear Cargo Ramp Door Seams
        drawLine3D(c, proj, -1.10 * r * L, -0.34 * r * W, zBot + 0.04 * r, -1.10 * r * L, 0.34 * r * W, zBot + 0.04 * r, seamCol, 1.1);
        drawLine3D(c, proj, -1.10 * r * L, -0.30 * r * W, zBot + 0.04 * r, -1.10 * r * L, -0.24 * r * W, zTop - 0.14 * r, seamCol, 0.95);
        drawLine3D(c, proj, -1.10 * r * L, 0.30 * r * W, zBot + 0.04 * r, -1.10 * r * L, 0.24 * r * W, zTop - 0.14 * r, seamCol, 0.95);

        if (p.showPortholes !== false) {
          for (const side of [-1, 1]) {
            const py = side * 0.51 * r * W;
            // Side crew door outline near forward cabin
            drawLine3D(c, proj, 0.46 * r * L, py, zBot + 0.06 * r, 0.46 * r * L, py, zTop - 0.10 * r, 'rgba(38,32,27,0.55)', 0.9);
            drawLine3D(c, proj, 0.64 * r * L, py, zBot + 0.06 * r, 0.64 * r * L, py, zTop - 0.10 * r, 'rgba(38,32,27,0.55)', 0.9);

            for (const px of [-0.56 * r * L, -0.10 * r * L, 0.30 * r * L]) {
              const pt = proj.project(px, py, (zBot + zTop) * 0.58);
              const rad = Math.max(1.8, 0.082 * r);
              // Metallic porthole rim
              c.fillStyle = '#94a3b8';
              c.strokeStyle = seamCol;
              c.lineWidth = 0.95;
              c.beginPath();
              c.arc(pt.x, pt.y, rad + 0.8, 0, Math.PI * 2);
              c.fill();
              c.stroke();
              // Dark glass center
              c.fillStyle = '#1e293b';
              c.beginPath();
              c.arc(pt.x, pt.y, rad * 0.72, 0, Math.PI * 2);
              c.fill();
              // Specular glint
              c.fillStyle = '#bae6fd';
              c.beginPath();
              c.arc(pt.x - rad * 0.22, pt.y - rad * 0.22, Math.max(0.7, rad * 0.28), 0, Math.PI * 2);
              c.fill();

              // Combat Chinook side-firing minigun barrels + muzzle flashes
              if (isCombat) {
                const bx = px + 0.08 * r;
                const by = py + side * 0.32 * r;
                const bz = (zBot + zTop) * 0.52;
                drawLine3D(c, proj, px, py, (zBot + zTop) * 0.58, bx, by, bz, seamCol, 2.0);
                if (recoil > 0.5) {
                  const mPt = proj.project(bx, by, bz);
                  c.fillStyle = 'rgba(251, 191, 36, 0.90)';
                  c.beginPath();
                  c.arc(mPt.x, mPt.y, Math.max(2.0, (recoil / 6) * 0.22 * r), 0, Math.PI * 2);
                  c.fill();
                }
              }
            }
          }
        }
      }
    });

    flushFaces(ctx, faces);

    // 5. Dual Counter-Rotating 3D Wide-Chord Tandem Rotors + Mechanical Swashplate Hubs
    if (p.showRotors !== false) {
      const rSpan = 1.04 * r * (p.rotorSpan || 1.0);
      const hubs = [
        { x: 0.75 * r * L, z: zTop + 0.28 * r, dir: 1 },
        { x: -0.82 * r * L, z: zTop + 0.46 * r, dir: -1 }
      ];
      for (const h of hubs) {
        const hubPt = proj.project(h.x, 0, h.z);
        ctx.save();
        // Outer & inner motion-blur rings
        ctx.strokeStyle = 'rgba(38, 32, 27, 0.22)';
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.ellipse(hubPt.x, hubPt.y, rSpan, rSpan * pitchScale, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(234, 179, 8, 0.25)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.ellipse(hubPt.x, hubPt.y, rSpan * 0.92, rSpan * 0.92 * pitchScale, 0, 0, Math.PI * 2);
        ctx.stroke();

        // 3 Wide-Chord 3D Polygonal Rotor Blades with Yellow Safety Tips
        const baseA = phase * Math.PI * 2 * h.dir + (h.dir < 0 ? 0.52 : 0);
        const chord = 0.085 * r;
        for (let b = 0; b < 3; b++) {
          const a = baseA + (b * Math.PI * 2) / 3;
          const ca = Math.cos(a);
          const sa = Math.sin(a);
          const pa = -sa * chord;
          const pb = ca * chord;

          // Root spar line
          drawLine3D(ctx, proj, h.x, 0, h.z, h.x + ca * rSpan * 0.18, sa * rSpan * 0.18, h.z, '#475569', 2.2);

          // Main dark charcoal airfoil polygon (0.16 to 0.84 span)
          const bladePts = [
            proj.project(h.x + ca * rSpan * 0.16 - pa * 0.5, sa * rSpan * 0.16 - pb * 0.5, h.z),
            proj.project(h.x + ca * rSpan * 0.84 - pa * 0.7, sa * rSpan * 0.84 - pb * 0.7, h.z),
            proj.project(h.x + ca * rSpan * 0.84 + pa * 0.7, sa * rSpan * 0.84 + pb * 0.7, h.z),
            proj.project(h.x + ca * rSpan * 0.16 + pa * 0.5, sa * rSpan * 0.16 + pb * 0.5, h.z)
          ];
          drawPolyPts(ctx, bladePts, '#1e293b', seamCol, 1.0);

          // Yellow safety tip band (0.84 to 1.00 span)
          const tipPts = [
            proj.project(h.x + ca * rSpan * 0.84 - pa * 0.7, sa * rSpan * 0.84 - pb * 0.7, h.z),
            proj.project(h.x + ca * rSpan * 1.00 - pa * 0.55, sa * rSpan * 1.00 - pb * 0.55, h.z),
            proj.project(h.x + ca * rSpan * 1.00 + pa * 0.55, sa * rSpan * 1.00 + pb * 0.55, h.z),
            proj.project(h.x + ca * rSpan * 0.84 + pa * 0.7, sa * rSpan * 0.84 + pb * 0.7, h.z)
          ];
          drawPolyPts(ctx, tipPts, '#eab308', seamCol, 0.95);
        }

        // Swashplate & Rotor Hub Cap
        ctx.fillStyle = '#64748b';
        ctx.strokeStyle = seamCol;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(hubPt.x, hubPt.y, Math.max(2.8, 0.13 * r), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#334155';
        ctx.beginPath();
        ctx.arc(hubPt.x, hubPt.y, Math.max(1.5, 0.07 * r), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  // ==========================================================================
  // 8. Unit #11: USA Comanche Stealth Attack Helicopter (RAH-66)
  //    Matches assets/refs/usa_comanche_diorama_ref.png
  // ==========================================================================
  const COMANCHE_DEFAULT_PARAMS = {
    hullScale: 1.0,
    hullLength: 1.0,
    wingSpan: 1.0,
    rotorSpan: 1.0,
    armorBaseColor: '#627048',
    armorHighlightColor: '#7f8f61',
    panelLineColor: '#26201b',
    glassColor: '#6cc0e6',
    showRocketPods: true,
    showNoseGatling: true,
    showMainRotor: true
  };

  const COMANCHE_PARAM_SCHEMA = [
    {
      group: '1. Faceted RAH-66 Stealth Airframe',
      fields: [
        { key: 'hullScale', label: 'Overall Helicopter Scale', type: 'range', min: 0.75, max: 1.35, step: 0.02 },
        { key: 'hullLength', label: 'Airframe & Tail Boom Length', type: 'range', min: 0.85, max: 1.25, step: 0.02 },
        { key: 'wingSpan', label: 'Stub-Wing Weapon Sponson Span', type: 'range', min: 0.75, max: 1.35, step: 0.05 }
      ]
    },
    {
      group: '2. 5-Blade Stealth Rotor & Fenestron Tail',
      fields: [
        { key: 'rotorSpan', label: '5-Blade Main Rotor Span', type: 'range', min: 0.75, max: 1.35, step: 0.05 },
        { key: 'extrusionDepth', label: 'Chine & Canopy Profile Height', type: 'range', min: 0.80, max: 1.30, step: 0.05 }
      ]
    },
    {
      group: '3. 20mm XM301 Gatling & Rocket Pods',
      fields: [
        { key: 'barrelLength', label: 'Nose Gatling Barrel Length', type: 'range', min: 0.80, max: 1.40, step: 0.05 },
        { key: 'weathering', label: 'Rotor Exhaust & Carbon Soot', type: 'range', min: 0.0, max: 1.0, step: 0.05 }
      ]
    },
    {
      group: '4. Stealth Olive Diorama Palette',
      fields: [
        { key: 'armorBaseColor', label: 'Tactical Olive-Drab Airframe', type: 'color' },
        { key: 'armorHighlightColor', label: 'Top Spine Highlight', type: 'color' },
        { key: 'panelLineColor', label: 'Ligne-Claire Ink Outline', type: 'color' },
        { key: 'glassColor', label: 'Tandem Canopy Glass', type: 'color' }
      ]
    },
    {
      group: '5. Component Visibility Toggles',
      fields: [
        { key: 'showRocketPods', label: 'Stub-Wing Hydra Rocket & Hellfire Pods', type: 'checkbox' },
        { key: 'showNoseGatling', label: '20mm 3-Barrel Nose Gatling Turret', type: 'checkbox' },
        { key: 'showMainRotor', label: '5-Blade Stealth Main Rotor', type: 'checkbox' }
      ]
    }
  ];

  const COMANCHE_PRESETS = {
    DIORAMA_DEFAULT: { name: '1. Olive Stealth Gunship (Default)', params: Object.assign({}, COMANCHE_DEFAULT_PARAMS) },
    NIGHT_STEALTH: { name: '2. Radar-Absorbent Matte Black', params: Object.assign({}, COMANCHE_DEFAULT_PARAMS, { armorBaseColor: '#1e293b', armorHighlightColor: '#334155', glassColor: '#eab308' }) },
    DESERT_CAVALRY: { name: '3. Desert Cavalry Recon', params: Object.assign({}, COMANCHE_DEFAULT_PARAMS, { armorBaseColor: '#c29f6d', armorHighlightColor: '#dec092' }) },
    GRANGER_ACE: { name: '4. Gen. Granger Stealth Ace', params: Object.assign({}, COMANCHE_DEFAULT_PARAMS, { armorBaseColor: '#475569', armorHighlightColor: '#64748b', wingSpan: 1.15 }) },
    CLEAN_SCOUT: { name: '5. Clean Internal-Bay Recon', params: Object.assign({}, COMANCHE_DEFAULT_PARAMS, { showRocketPods: false }) }
  };

  function renderComancheModel(ctx, u, faction, customParams, options) {
    const p = Object.assign({}, COMANCHE_DEFAULT_PARAMS, customParams || {});
    const opts = options || {};

    const rawR = (u && u.radius) || 16;
    const r = rawR * (p.hullScale || 1.0);
    const L = p.hullLength || 1.0;
    const W = p.wingSpan || 1.0;
    const hullAngle = (u && u.angle !== undefined) ? u.angle : 0;
    const turretAngle = (u && u.turretAngle !== undefined) ? u.turretAngle : hullAngle;
    const recoil = (u && u.recoilOffset) || 0;
    const phase = (u && u.treadPhase) || (typeof performance !== 'undefined' ? (performance.now() * 0.003) % 1 : 0);
    const hoverZ = Math.sin(phase * Math.PI * 2) * 0.045 * r;
    const pitchScale = opts.pitchScale !== undefined ? opts.pitchScale : 1.0;
    const zScale = opts.zScale !== undefined ? opts.zScale : 0.42;

    const oliveBase = p.armorBaseColor || '#627048';
    const oliveHi = p.armorHighlightColor || '#7f8f61';
    const seamCol = p.panelLineColor || '#26201b';
    const glassCol = p.glassColor || '#6cc0e6';

    const proj = createProjector(hullAngle, pitchScale, zScale, 0, 0, 0, 0);

    // Shadow
    const shadowPts = [
      proj.project(-1.32 * r * L, -0.62 * r * W, 0),
      proj.project(1.20 * r * L, -0.62 * r * W, 0),
      proj.project(1.20 * r * L, 0.62 * r * W, 0),
      proj.project(-1.32 * r * L, 0.62 * r * W, 0)
    ].map((pt) => ({ x: pt.x + 4.5, y: pt.y + 6.0 }));
    drawPolyPts(ctx, shadowPts, 'rgba(65, 50, 40, 0.28)', null, 0);

    const faces = [];

    // 0. Retractable Wheeled Landing Gear (2 Front Main Wheels + Rear Tail Wheel matching usa_comanche_diorama_ref.png)
    for (const side of [-1, 1]) {
      const wy = side * 0.34 * r;
      const wx = 0.12 * r * L;
      faces.push({
        depth: proj.project(wx, wy, 0.12 * r + hoverZ).depth - 0.5,
        customDraw(c) {
          const sPt = proj.project(wx, wy * 0.85, 0.24 * r + hoverZ);
          const wPt = proj.project(wx, wy, 0.11 * r + hoverZ);
          c.strokeStyle = '#475569';
          c.lineWidth = 1.5;
          c.beginPath();
          c.moveTo(sPt.x, sPt.y);
          c.lineTo(wPt.x, wPt.y);
          c.stroke();

          c.fillStyle = '#1e293b';
          c.strokeStyle = seamCol;
          c.lineWidth = 1.0;
          c.beginPath();
          c.arc(wPt.x, wPt.y, Math.max(2.0, 0.09 * r), 0, Math.PI * 2);
          c.fill();
          c.stroke();
        }
      });
    }

    // 1. Stub-Wing Weapon Sponsons + Dual Under-Wing Pods (Inner 19-Tube Hydra-70 Pod + Outer Hellfire Pod)
    if (p.showRocketPods !== false) {
      for (const side of [-1, 1]) {
        const yIn = side * 0.28 * r;
        const yOut = side * 0.84 * r * W;
        const yMin = Math.min(yIn, yOut);
        const yMax = Math.max(yIn, yOut);
        // Faceted stub wing with canted tip endplate
        pushBox3D(faces, proj, -0.18 * r * L, 0.26 * r * L, yMin, yMax, 0.30 * r + hoverZ, 0.44 * r + hoverZ, oliveBase, seamCol, 1.05, 0.1, 0.05 * r, 0.02 * r);

        // Inner Pod: Cylindrical 19-tube Hydra-70 rocket pod with silver perforated front face
        const yHydra = side * 0.50 * r * W;
        pushTubeSegment3D(faces, proj, -0.22 * r * L, yHydra, 0.20 * r + hoverZ, 0, 0, 0.54 * r * L, 0.105 * r, 0.105 * r, '#475569', seamCol, 0.95, 0.05);
        pushTubeSegment3D(faces, proj, 0.26 * r * L, yHydra, 0.20 * r + hoverZ, 0, 0, 0.08 * r * L, 0.105 * r, 0.095 * r, '#cbd5e1', seamCol, 0.9, 0.08);

        // Outer Pod: Dark-olive Hellfire / 70mm pod with yellow nose band
        const yOuter = side * 0.74 * r * W;
        const mSlide = clamp(recoil * 0.06 * r, 0, 0.32 * r);
        pushTubeSegment3D(faces, proj, -0.18 * r * L + mSlide, yOuter, 0.22 * r + hoverZ, 0, 0, 0.48 * r * L, 0.085 * r, 0.085 * r, '#3f4734', seamCol, 0.95, 0.06);
        pushTubeSegment3D(faces, proj, 0.24 * r * L + mSlide, yOuter, 0.22 * r + hoverZ, 0, 0, 0.09 * r * L, 0.085 * r, 0.065 * r, '#eab308', seamCol, 0.9, 0.09);
      }
    }

    // 2. Faceted Diamond Stealth Fuselage + Sharp Chine Line + Tapered Tail Boom
    const fuseBot = [
      [-1.26 * r * L, -0.10 * r, 0.34 * r + hoverZ],
      [-0.36 * r * L, -0.40 * r, 0.22 * r + hoverZ],
      [0.46 * r * L, -0.36 * r, 0.22 * r + hoverZ],
      [1.10 * r * L, -0.11 * r, 0.26 * r + hoverZ],
      [1.10 * r * L, 0.11 * r, 0.26 * r + hoverZ],
      [0.46 * r * L, 0.36 * r, 0.22 * r + hoverZ],
      [-0.36 * r * L, 0.40 * r, 0.22 * r + hoverZ],
      [-1.26 * r * L, 0.10 * r, 0.34 * r + hoverZ]
    ];
    const fuseTop = [
      [-1.22 * r * L, -0.07 * r, 0.56 * r + hoverZ],
      [-0.28 * r * L, -0.26 * r, 0.74 * r + hoverZ],
      [0.38 * r * L, -0.22 * r, 0.70 * r + hoverZ],
      [0.94 * r * L, -0.08 * r, 0.42 * r + hoverZ],
      [0.94 * r * L, 0.08 * r, 0.42 * r + hoverZ],
      [0.38 * r * L, 0.22 * r, 0.70 * r + hoverZ],
      [-0.28 * r * L, 0.26 * r, 0.74 * r + hoverZ],
      [-1.22 * r * L, 0.07 * r, 0.56 * r + hoverZ]
    ];
    pushFrustumFaces(faces, proj, fuseBot, fuseTop, oliveBase, seamCol, 1.15, 0.35);

    // Raised Dorsal Engine Doghouse Spine behind Rotor Mast
    pushBox3D(faces, proj, -0.52 * r * L, 0.16 * r * L, -0.18 * r, 0.18 * r, 0.68 * r + hoverZ, 0.80 * r + hoverZ, oliveHi, seamCol, 1.05, 0.55, 0.06 * r, 0.03 * r);

    // Shrouded Fenestron Tail Fin + Recessed Spinning Fan Duct + Canted T-Tail Horizontal Stabilizer
    pushBox3D(faces, proj, -1.36 * r * L, -0.94 * r * L, -0.09 * r, 0.09 * r, 0.38 * r + hoverZ, 0.98 * r + hoverZ, oliveHi, seamCol, 1.1, 0.65, 0.06 * r, 0.01 * r);
    pushBox3D(faces, proj, -1.38 * r * L, -1.04 * r * L, -0.38 * r, 0.38 * r, 0.95 * r + hoverZ, 1.04 * r + hoverZ, oliveHi, seamCol, 1.05, 0.78);

    // Fenestron Shrouded Tail Rotor Duct & Spinning Fan Blades
    faces.push({
      depth: proj.project(-1.15 * r * L, 0, 0.60 * r + hoverZ).depth + 0.72,
      customDraw(c) {
        for (const side of [-1, 1]) {
          const fPt = proj.project(-1.15 * r * L, side * 0.10 * r, 0.58 * r + hoverZ);
          const fRad = Math.max(2.2, 0.14 * r);
          c.fillStyle = '#1e293b';
          c.strokeStyle = seamCol;
          c.lineWidth = 1.05;
          c.beginPath();
          c.ellipse(fPt.x, fPt.y, fRad, fRad * 0.88, 0, 0, Math.PI * 2);
          c.fill();
          c.stroke();

          // Spinning internal Fenestron fan blades
          c.strokeStyle = '#64748b';
          c.lineWidth = 1.0;
          const fanA = phase * Math.PI * 4;
          for (let fb = 0; fb < 4; fb++) {
            const a = fanA + (fb * Math.PI) / 4;
            c.beginPath();
            c.moveTo(fPt.x - Math.cos(a) * fRad * 0.78, fPt.y - Math.sin(a) * fRad * 0.70);
            c.lineTo(fPt.x + Math.cos(a) * fRad * 0.78, fPt.y + Math.sin(a) * fRad * 0.70);
            c.stroke();
          }
          c.fillStyle = oliveHi;
          c.beginPath();
          c.arc(fPt.x, fPt.y, Math.max(1.0, fRad * 0.32), 0, Math.PI * 2);
          c.fill();
        }
      }
    });

    // 3. Stepped 3-Piece Tandem Armored Glass Canopy + Nose EO/IR FLIR Sensor Turret + 3-Barrel 20mm Gatling
    // Nose EO/IR FLIR optical turret box above chin
    pushBox3D(faces, proj, 0.88 * r * L, 1.14 * r * L, -0.11 * r, 0.11 * r, 0.28 * r + hoverZ, 0.42 * r + hoverZ, '#4a5535', seamCol, 1.05, 0.72, 0.03 * r, 0.02 * r);

    const gunProj = createProjector(turretAngle, pitchScale, zScale, 0.92 * r * L, 0, 0.20 * r + hoverZ, hullAngle);
    faces.push({
      depth: proj.project(0.52 * r * L, 0, 0.60 * r + hoverZ).depth + 0.88,
      customDraw(c) {
        // Side Turbine Air Intakes & Tail Exhaust Vents
        for (const side of [-1, 1]) {
          const intakePts = [
            proj.project(-0.08 * r * L, side * 0.24 * r, 0.66 * r + hoverZ),
            proj.project(0.14 * r * L, side * 0.22 * r, 0.64 * r + hoverZ),
            proj.project(0.08 * r * L, side * 0.20 * r, 0.74 * r + hoverZ)
          ];
          drawPolyPts(c, intakePts, '#1e293b', seamCol, 0.95);

          // Tail boom IR-suppressed exhaust slit
          drawLine3D(c, proj, -0.78 * r * L, side * 0.18 * r, 0.50 * r + hoverZ, -0.46 * r * L, side * 0.26 * r, 0.54 * r + hoverZ, '#1e293b', 2.0);
        }

        // Stepped Tandem Canopy: Rear Pilot Roof Pane, Mid Gunner Roof Pane, Sloped Front Windshield + Side Panes
        const rearPane = [
          [-0.04 * r * L, -0.19 * r, 0.72 * r + hoverZ],
          [-0.04 * r * L, 0.19 * r, 0.72 * r + hoverZ],
          [0.34 * r * L, 0.18 * r, 0.62 * r + hoverZ],
          [0.34 * r * L, -0.18 * r, 0.62 * r + hoverZ]
        ];
        const midPane = [
          [0.36 * r * L, -0.18 * r, 0.61 * r + hoverZ],
          [0.36 * r * L, 0.18 * r, 0.61 * r + hoverZ],
          [0.64 * r * L, 0.15 * r, 0.50 * r + hoverZ],
          [0.64 * r * L, -0.15 * r, 0.50 * r + hoverZ]
        ];
        const frontPane = [
          [0.66 * r * L, -0.14 * r, 0.49 * r + hoverZ],
          [0.66 * r * L, 0.14 * r, 0.49 * r + hoverZ],
          [0.92 * r * L, 0.09 * r, 0.40 * r + hoverZ],
          [0.92 * r * L, -0.09 * r, 0.40 * r + hoverZ]
        ];
        drawGlassPane3D(c, proj, rearPane, glassCol, seamCol, 1.05);
        drawGlassPane3D(c, proj, midPane, glassCol, seamCol, 1.05);
        drawGlassPane3D(c, proj, frontPane, glassCol, seamCol, 1.05);

        // Glowing amber/red FLIR optical sensor lens on nose turret
        const flirPt = proj.project(1.14 * r * L, 0, 0.35 * r + hoverZ);
        c.fillStyle = '#ef4444';
        c.strokeStyle = seamCol;
        c.lineWidth = 0.85;
        c.beginPath();
        c.arc(flirPt.x, flirPt.y, Math.max(1.5, 0.065 * r), 0, Math.PI * 2);
        c.fill();
        c.stroke();

        // Slewing 3-Barrel 20mm XM301 Nose Gatling Cannon
        if (p.showNoseGatling !== false) {
          for (const bOff of [-0.035 * r, 0, 0.035 * r]) {
            drawLine3D(c, gunProj, 0, bOff, 0, 0.52 * r * L, bOff, -0.05 * r, '#1e293b', 1.45);
          }
          // Barrel clamp band
          drawLine3D(c, gunProj, 0.38 * r * L, -0.045 * r, -0.035 * r, 0.38 * r * L, 0.045 * r, -0.035 * r, '#94a3b8', 1.8);

          if (recoil > 0.6) {
            const muzPt = gunProj.project(0.56 * r * L, 0, -0.05 * r);
            c.fillStyle = 'rgba(251, 191, 36, 0.92)';
            c.beginPath();
            c.arc(muzPt.x, muzPt.y, Math.max(2.6, (recoil / 6) * 0.30 * r), 0, Math.PI * 2);
            c.fill();
            c.fillStyle = '#ffffff';
            c.beginPath();
            c.arc(muzPt.x, muzPt.y, Math.max(1.2, (recoil / 6) * 0.14 * r), 0, Math.PI * 2);
            c.fill();
          }
        }
      }
    });

    flushFaces(ctx, faces);

    // 4. 3D 5-Blade Swept-Tip Stealth Main Rotor Assembly
    if (p.showMainRotor !== false) {
      const rSpan = 1.18 * r * (p.rotorSpan || 1.0);
      const zRotor = 0.85 * r + hoverZ;
      const hubX = -0.04 * r * L;
      const hubPt = proj.project(hubX, 0, zRotor);
      const baseA = phase * Math.PI * 2;
      const chord = 0.075 * r;

      ctx.save();
      // Subtle rotor disc blur ring
      ctx.strokeStyle = 'rgba(38, 32, 27, 0.18)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(hubPt.x, hubPt.y, rSpan, rSpan * pitchScale, 0, 0, Math.PI * 2);
      ctx.stroke();

      for (let b = 0; b < 5; b++) {
        const a = baseA + (b * Math.PI * 2) / 5;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const pa = -sa * chord;
        const pb = ca * chord;

        // Swept-tip stealth rotor blade polygon
        const bladePts = [
          proj.project(hubX + ca * rSpan * 0.12 - pa * 0.45, sa * rSpan * 0.12 - pb * 0.45, zRotor),
          proj.project(hubX + ca * rSpan * 0.85 - pa * 0.65, sa * rSpan * 0.85 - pb * 0.65, zRotor),
          proj.project(hubX + ca * rSpan * 1.00 + pa * 0.15, sa * rSpan * 1.00 + pb * 0.15, zRotor),
          proj.project(hubX + ca * rSpan * 0.85 + pa * 0.75, sa * rSpan * 0.85 + pb * 0.75, zRotor),
          proj.project(hubX + ca * rSpan * 0.12 + pa * 0.45, sa * rSpan * 0.12 + pb * 0.45, zRotor)
        ];
        drawPolyPts(ctx, bladePts, '#2d3626', seamCol, 0.95);
        // Tan/yellow tip marker
        drawLine3D(ctx, proj, hubX + ca * rSpan * 0.86, sa * rSpan * 0.86, zRotor, hubX + ca * rSpan * 0.98, sa * rSpan * 0.98, zRotor, '#d4b07b', 1.6);
      }

      // Faceted Stealth Rotor Hub Dome
      ctx.fillStyle = oliveHi;
      ctx.strokeStyle = seamCol;
      ctx.lineWidth = 1.15;
      ctx.beginPath();
      ctx.arc(hubPt.x, hubPt.y, Math.max(2.8, 0.14 * r), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = oliveBase;
      ctx.beginPath();
      ctx.arc(hubPt.x, hubPt.y, Math.max(1.4, 0.07 * r), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ==========================================================================
  // 9. Unit #12 & #13: USA F-22 Raptor & King Raptor Stealth Fighter
  //    Matches assets/refs/usa_raptor_diorama_ref.png
  // ==========================================================================
  const RAPTOR_DEFAULT_PARAMS = {
    hullScale: 1.0,
    wingSpan: 1.0,
    fuselageLength: 1.0,
    armorBaseColor: '#94a3b8',
    camoPatchColor: '#64748b',
    panelLineColor: '#26201b',
    canopyColor: '#eab308',
    stripeColor: '#2563eb',
    showWingMissiles: true,
    showAfterburners: true,
    showCanards: false
  };

  const KING_RAPTOR_DEFAULT_PARAMS = Object.assign({}, RAPTOR_DEFAULT_PARAMS, {
    hullScale: 1.06,
    wingSpan: 1.08,
    armorBaseColor: '#cbd5e1',
    camoPatchColor: '#475569',
    stripeColor: '#1d4ed8',
    showCanards: true
  });

  const RAPTOR_PARAM_SCHEMA = [
    {
      group: '1. Stealth Delta Airframe & Wings',
      fields: [
        { key: 'hullScale', label: 'Overall Fighter Scale', type: 'range', min: 0.75, max: 1.35, step: 0.02 },
        { key: 'fuselageLength', label: 'Fuselage & Radome Length', type: 'range', min: 0.85, max: 1.25, step: 0.02 },
        { key: 'wingSpan', label: 'Diamond Delta Wingspan', type: 'range', min: 0.80, max: 1.35, step: 0.05 }
      ]
    },
    {
      group: '2. Canted Twin Tails & Bubble Canopy',
      fields: [
        { key: 'extrusionDepth', label: 'Spine & Canopy Profile Height', type: 'range', min: 0.80, max: 1.30, step: 0.05 }
      ]
    },
    {
      group: '3. Thrust-Vectoring Nozzles & Ordnance',
      fields: [
        { key: 'weathering', label: 'Afterburner Soot & Leading-Edge Wear', type: 'range', min: 0.0, max: 1.0, step: 0.05 }
      ]
    },
    {
      group: '4. Air-Superiority Diorama Palette',
      fields: [
        { key: 'armorBaseColor', label: 'Gull-Grey Stealth Skin', type: 'color' },
        { key: 'camoPatchColor', label: 'Tactical Slate Camo', type: 'color' },
        { key: 'canopyColor', label: 'Golden-Amber Bubble Canopy', type: 'color' },
        { key: 'stripeColor', label: 'Squadron Trim / Canard Color', type: 'color' },
        { key: 'panelLineColor', label: 'Ligne-Claire Ink Outline', type: 'color' }
      ]
    },
    {
      group: '5. Component Visibility Toggles',
      fields: [
        { key: 'showWingMissiles', label: 'Under-Wing AIM-9X / JDAM Missiles', type: 'checkbox' },
        { key: 'showAfterburners', label: 'Twin Glowing Amber Afterburners', type: 'checkbox' },
        { key: 'showCanards', label: 'King Raptor Forward Canards', type: 'checkbox' }
      ]
    }
  ];

  const RAPTOR_PRESETS = {
    DIORAMA_DEFAULT: { name: '1. USAF Air Superiority (Default)', params: Object.assign({}, RAPTOR_DEFAULT_PARAMS) },
    KING_RAPTOR: { name: '2. Gen. Granger King Raptor', params: Object.assign({}, KING_RAPTOR_DEFAULT_PARAMS) },
    AGGRESSOR_CAMO: { name: '3. Nellis Aggressor Flanker Camo', params: Object.assign({}, RAPTOR_DEFAULT_PARAMS, { armorBaseColor: '#7dd3fc', camoPatchColor: '#1e3a8a' }) },
    NIGHT_INTERCEPTOR: { name: '4. Midnight Stealth Interceptor', params: Object.assign({}, RAPTOR_DEFAULT_PARAMS, { armorBaseColor: '#334155', camoPatchColor: '#0f172a' }) },
    DESERT_FALCON: { name: '5. Desert Storm Strike Camo', params: Object.assign({}, RAPTOR_DEFAULT_PARAMS, { armorBaseColor: '#d6bc8b', camoPatchColor: '#9c7c4e' }) }
  };

  function renderRaptorModel(ctx, u, faction, customParams, options) {
    const isKing = u && u.defId === 'USA_KING_RAPTOR';
    const baseDef = isKing ? KING_RAPTOR_DEFAULT_PARAMS : RAPTOR_DEFAULT_PARAMS;
    const p = Object.assign({}, baseDef, customParams || {});
    const opts = options || {};

    const rawR = (u && u.radius) || 16;
    const r = rawR * (p.hullScale || 1.0);
    const L = p.fuselageLength || 1.0;
    const W = p.wingSpan || 1.0;
    const hullAngle = (u && u.angle !== undefined) ? u.angle : 0;
    const recoil = (u && u.recoilOffset) || 0;
    const phase = (u && u.treadPhase) || (typeof performance !== 'undefined' ? (performance.now() * 0.003) % 1 : 0);
    const hoverZ = Math.sin(phase * Math.PI * 2) * 0.038 * r;
    const pitchScale = opts.pitchScale !== undefined ? opts.pitchScale : 1.0;
    const zScale = opts.zScale !== undefined ? opts.zScale : 0.42;

    const greyBase = p.armorBaseColor || '#94a3b8';
    const slateCamo = p.camoPatchColor || '#64748b';
    const seamCol = p.panelLineColor || '#26201b';
    const canopyCol = p.canopyColor || '#eab308';

    const proj = createProjector(hullAngle, pitchScale, zScale, 0, 0, 0, 0);

    // Shadow
    const shadowPts = [
      proj.project(-1.22 * r * L, -1.08 * r * W, 0),
      proj.project(1.36 * r * L, 0, 0),
      proj.project(-1.22 * r * L, 1.08 * r * W, 0)
    ].map((pt) => ({ x: pt.x + 4.5, y: pt.y + 6.5 }));
    drawPolyPts(ctx, shadowPts, 'rgba(65, 50, 40, 0.28)', null, 0);

    const faces = [];
    const zWing = 0.28 * r + hoverZ;

    // 1. 2D Thrust-Vectoring Rectangular Nozzles & Multi-Stage Amber Afterburner Cones
    for (const side of [-1, 1]) {
      const ny = side * 0.17 * r;
      pushBox3D(faces, proj, -1.14 * r * L, -0.92 * r * L, ny - 0.09 * r, ny + 0.09 * r, zWing - 0.01 * r, zWing + 0.11 * r, '#334155', seamCol, 1.0, 0.12);
    }

    if (p.showAfterburners !== false) {
      const surge = 1.0 + Math.sin(phase * Math.PI * 6) * 0.08 + clamp(recoil * 0.08, 0, 0.35);
      faces.push({
        depth: proj.project(-1.32 * r * L, 0, zWing).depth - 0.5,
        customDraw(c) {
          for (const side of [-1, 1]) {
            const ny = side * 0.17 * r;
            const p0 = proj.project(-1.08 * r * L, ny, zWing + 0.04 * r);
            const p1 = proj.project(-1.58 * r * L * surge, ny * 1.06, zWing + 0.04 * r);
            const pMid = proj.project(-1.34 * r * L * surge, ny * 1.03, zWing + 0.04 * r);
            // Outer orange plume
            c.strokeStyle = 'rgba(249, 115, 22, 0.88)';
            c.lineWidth = 4.6;
            c.lineCap = 'round';
            c.beginPath();
            c.moveTo(p0.x, p0.y);
            c.lineTo(p1.x, p1.y);
            c.stroke();
            // Mid golden-amber shock cone
            c.strokeStyle = '#fbbf24';
            c.lineWidth = 3.0;
            c.beginPath();
            c.moveTo(p0.x, p0.y);
            c.lineTo(pMid.x, pMid.y);
            c.stroke();
            // White-hot core
            c.strokeStyle = '#fef9c3';
            c.lineWidth = 1.6;
            c.beginPath();
            c.moveTo(p0.x, p0.y);
            c.lineTo((p0.x + pMid.x) * 0.5, (p0.y + pMid.y) * 0.5);
            c.stroke();
          }
        }
      });
    }

    // 2. Dual Under-Wing Ordnance: Outer White AIM-9X Sidewinders + Inner Olive/Orange JDAM/AMRAAMs
    if (p.showWingMissiles !== false) {
      const mSlide = clamp(recoil * 0.09 * r, 0, 0.45 * r);
      for (const side of [-1, 1]) {
        // Inner Heavy Strike Missile / Bomb (Olive body + Orange nose tip, slides forward on fire!)
        const yIn = side * 0.52 * r * W;
        pushTubeSegment3D(faces, proj, -0.44 * r * L + mSlide, yIn, zWing - 0.06 * r, 0, 0, 0.54 * r * L, 0.065 * r, 0.065 * r, '#475569', seamCol, 0.9, 0.05);
        pushTubeSegment3D(faces, proj, 0.08 * r * L + mSlide, yIn, zWing - 0.06 * r, 0, 0, 0.14 * r * L, 0.065 * r, 0.035 * r, '#f97316', seamCol, 0.85, 0.08);

        // Outer AIM-9X White Air-to-Air Missile with Red Seeker Tip & Fins
        const yOut = side * 0.80 * r * W;
        faces.push({
          depth: proj.project(-0.20 * r * L, yOut, zWing - 0.08 * r).depth - 0.18,
          customDraw(c) {
            drawLine3D(c, proj, -0.52 * r * L, yOut, zWing - 0.05 * r, 0.18 * r * L, yOut, zWing - 0.05 * r, seamCol, 3.4);
            drawLine3D(c, proj, -0.50 * r * L, yOut, zWing - 0.05 * r, 0.14 * r * L, yOut, zWing - 0.05 * r, '#f8fafc', 2.2);
            drawLine3D(c, proj, 0.10 * r * L, yOut, zWing - 0.05 * r, 0.20 * r * L, yOut, zWing - 0.05 * r, '#ef4444', 2.2);
          }
        });
      }
    }

    // 3. Swept Horizontal Tailerons (Aft of Main Delta Wings)
    for (const side of [-1, 1]) {
      const tBot = [
        [-1.18 * r * L, side * 0.28 * r * W, zWing - 0.02 * r],
        [-1.08 * r * L, side * 0.72 * r * W, zWing - 0.02 * r],
        [-0.82 * r * L, side * 0.62 * r * W, zWing - 0.02 * r],
        [-0.76 * r * L, side * 0.28 * r * W, zWing - 0.02 * r]
      ];
      if (side < 0) tBot.reverse();
      const tTop = tBot.map((v) => [v[0], v[1], v[2] + 0.05 * r]);
      pushFrustumFaces(faces, proj, tBot, tTop, slateCamo, seamCol, 1.05, 0.16);
    }

    // 4. Diamond Delta Main Wings + Caretaker Cheek Air Intakes
    for (const side of [-1, 1]) {
      const iy = side * 0.30 * r * W;
      pushBox3D(faces, proj, 0.08 * r * L, 0.56 * r * L, iy - 0.10 * r, iy + 0.10 * r, zWing - 0.10 * r, zWing + 0.02 * r, '#1e293b', seamCol, 1.0, 0.15);
    }

    const wingBot = [
      [-0.96 * r * L, -0.46 * r * W, zWing - 0.03 * r],
      [-0.56 * r * L, -1.18 * r * W, zWing - 0.02 * r],
      [-0.12 * r * L, -1.10 * r * W, zWing - 0.02 * r],
      [0.46 * r * L, -0.32 * r * W, zWing],
      [1.38 * r * L, 0, zWing],
      [0.46 * r * L, 0.32 * r * W, zWing],
      [-0.12 * r * L, 1.10 * r * W, zWing - 0.02 * r],
      [-0.56 * r * L, 1.18 * r * W, zWing - 0.02 * r],
      [-0.96 * r * L, 0.46 * r * W, zWing - 0.03 * r]
    ];
    const wingTop = wingBot.map((v) => [v[0], v[1], v[2] + 0.08 * r]);
    pushFrustumFaces(faces, proj, wingBot, wingTop, greyBase, seamCol, 1.15, 0.22);

    // King Raptor Forward Canards
    if (p.showCanards || isKing) {
      for (const side of [-1, 1]) {
        const cPts = [
          proj.project(0.28 * r * L, side * 0.22 * r, zWing + 0.09 * r),
          proj.project(0.60 * r * L, side * 0.20 * r, zWing + 0.09 * r),
          proj.project(0.36 * r * L, side * 0.58 * r * W, zWing + 0.09 * r)
        ];
        faces.push({
          depth: proj.project(0.42 * r * L, side * 0.35 * r, zWing + 0.1 * r).depth + 0.32,
          pts: cPts,
          fill: p.stripeColor || '#1d4ed8',
          stroke: seamCol,
          lineWidth: 1.05
        });
      }
    }

    // 5. Raised Spine Fuselage + Two-Tone Slate Camo Patches, Nose Radome & USAF Wing Roundel
    pushBox3D(faces, proj, -0.96 * r * L, 0.90 * r * L, -0.26 * r, 0.26 * r, zWing + 0.06 * r, zWing + 0.27 * r, slateCamo, seamCol, 1.05, 0.45, 0.24 * r * L, 0.06 * r);

    faces.push({
      depth: proj.project(0.10 * r * L, 0, zWing + 0.12 * r).depth + 0.36,
      customDraw(c) {
        // Geometric Slate-Blue Stealth Camo Patches on Both Wings + Flap Hinge Lines
        for (const side of [-1, 1]) {
          const patchPts = [
            proj.project(-0.66 * r * L, side * 0.44 * r * W, zWing + 0.085 * r),
            proj.project(-0.46 * r * L, side * 0.94 * r * W, zWing + 0.085 * r),
            proj.project(-0.18 * r * L, side * 0.88 * r * W, zWing + 0.085 * r),
            proj.project(0.08 * r * L, side * 0.38 * r * W, zWing + 0.085 * r)
          ];
          drawPolyPts(c, patchPts, slateCamo, seamCol, 0.85);

          // Trailing-edge flaperon seam
          drawLine3D(c, proj, -0.82 * r * L, side * 0.48 * r * W, zWing + 0.085 * r, -0.52 * r * L, side * 1.06 * r * W, zWing + 0.085 * r, seamCol, 0.85);
        }

        // Lighter Gull-Grey Radar Nose Radome Cone + Pitot Tip
        const radomePts = [
          proj.project(0.92 * r * L, -0.17 * r * W, zWing + 0.085 * r),
          proj.project(1.38 * r * L, 0, zWing + 0.085 * r),
          proj.project(0.92 * r * L, 0.17 * r * W, zWing + 0.085 * r),
          proj.project(0.98 * r * L, 0, zWing + 0.14 * r)
        ];
        drawPolyPts(c, radomePts, '#e2e8f0', seamCol, 0.95);
        drawLine3D(c, proj, 1.36 * r * L, 0, zWing + 0.05 * r, 1.50 * r * L, 0, zWing + 0.05 * r, seamCol, 1.2);

        // USAF Roundel on Port Wing
        const rPt = proj.project(-0.34 * r * L, -0.72 * r * W, zWing + 0.09 * r);
        c.fillStyle = '#1e3a8a';
        c.strokeStyle = '#f8fafc';
        c.lineWidth = 0.8;
        c.beginPath();
        c.arc(rPt.x, rPt.y, Math.max(1.8, 0.085 * r), 0, Math.PI * 2);
        c.fill();
        c.stroke();
      }
    });

    // 6. 3D Golden-Amber Bubble Canopy with Frame Bow & Double White Specular Slashes
    const canBot = [
      [0.10 * r * L, -0.18 * r, zWing + 0.23 * r],
      [0.86 * r * L, -0.09 * r, zWing + 0.14 * r],
      [0.86 * r * L, 0.09 * r, zWing + 0.14 * r],
      [0.10 * r * L, 0.18 * r, zWing + 0.23 * r]
    ];
    const canTop = [
      [0.22 * r * L, -0.11 * r, zWing + 0.45 * r],
      [0.70 * r * L, -0.06 * r, zWing + 0.35 * r],
      [0.70 * r * L, 0.06 * r, zWing + 0.35 * r],
      [0.22 * r * L, 0.11 * r, zWing + 0.45 * r]
    ];
    pushFrustumFaces(faces, proj, canBot, canTop, canopyCol, seamCol, 1.05, 0.75);
    faces.push({
      depth: proj.project(0.48 * r * L, 0, zWing + 0.46 * r).depth + 0.9,
      customDraw(c) {
        // Canopy bow frame arch
        drawLine3D(c, proj, 0.44 * r * L, -0.14 * r, zWing + 0.21 * r, 0.46 * r * L, 0, zWing + 0.41 * r, seamCol, 1.15);
        drawLine3D(c, proj, 0.46 * r * L, 0, zWing + 0.41 * r, 0.44 * r * L, 0.14 * r, zWing + 0.21 * r, seamCol, 1.15);
        // Specular slashes
        drawLine3D(c, proj, 0.26 * r * L, -0.04 * r, zWing + 0.43 * r, 0.42 * r * L, -0.02 * r, zWing + 0.39 * r, 'rgba(255,255,255,0.88)', 1.5);
        drawLine3D(c, proj, 0.50 * r * L, -0.03 * r, zWing + 0.38 * r, 0.66 * r * L, -0.01 * r, zWing + 0.34 * r, 'rgba(255,255,255,0.85)', 1.4);
      }
    });

    // 7. Canted Twin Vertical Tail Stabilizers with Rudder Seams & Top Fin Caps
    for (const side of [-1, 1]) {
      const yBase = side * 0.26 * r;
      const yTip = side * 0.48 * r;
      const finPts = [
        proj.project(-0.98 * r * L, yBase, zWing + 0.12 * r),
        proj.project(-0.34 * r * L, yBase, zWing + 0.12 * r),
        proj.project(-0.56 * r * L, yTip, zWing + 0.70 * r),
        proj.project(-0.94 * r * L, yTip, zWing + 0.70 * r)
      ];
      faces.push({
        depth: proj.project(-0.68 * r * L, yTip, zWing + 0.45 * r).depth + 0.95,
        customDraw(c) {
          drawPolyPts(c, finPts, slateCamo, seamCol, 1.15);
          // Contrasting top fin tip band & rudder seam
          drawLine3D(c, proj, -0.92 * r * L, yTip * 0.96, zWing + 0.64 * r, -0.57 * r * L, yTip * 0.96, zWing + 0.64 * r, greyBase, 1.8);
          drawLine3D(c, proj, -0.84 * r * L, yBase * 1.05, zWing + 0.16 * r, -0.82 * r * L, yTip * 0.92, zWing + 0.60 * r, seamCol, 0.9);
        }
      });
    }

    flushFaces(ctx, faces);
  }

  // ==========================================================================
  // 10. Unit #14 & #15: USA Aurora & Aurora Alpha Hypersonic Bomber
  //     Matches assets/refs/usa_aurora_diorama_ref.png
  // ==========================================================================
  const AURORA_DEFAULT_PARAMS = {
    hullScale: 1.0,
    fuselageLength: 1.0,
    wingSpan: 1.0,
    armorBaseColor: '#f8fafc',
    stripeColor: '#2563eb',
    panelLineColor: '#26201b',
    scramjetColor: '#22d3ee',
    showScramjetGlow: true,
    showRacingStripes: true
  };

  const AURORA_ALPHA_DEFAULT_PARAMS = Object.assign({}, AURORA_DEFAULT_PARAMS, {
    hullScale: 1.06,
    armorBaseColor: '#e2e8f0',
    stripeColor: '#f59e0b',
    scramjetColor: '#38bdf8'
  });

  const AURORA_PARAM_SCHEMA = [
    {
      group: '1. Hypersonic Wave-Rider Delta Airframe',
      fields: [
        { key: 'hullScale', label: 'Overall Bomber Scale', type: 'range', min: 0.75, max: 1.35, step: 0.02 },
        { key: 'fuselageLength', label: 'Needle-Nose Fuselage Length', type: 'range', min: 0.85, max: 1.30, step: 0.02 },
        { key: 'wingSpan', label: 'Cranked-Delta Wing Span', type: 'range', min: 0.80, max: 1.35, step: 0.05 }
      ]
    },
    {
      group: '2. Twin Dorsal Scramjet Nacelles & Fins',
      fields: [
        { key: 'extrusionDepth', label: 'Scramjet Spine & Fin Height', type: 'range', min: 0.80, max: 1.30, step: 0.05 }
      ]
    },
    {
      group: '3. Thermobaric Bay & Mach-6 Shock Plume',
      fields: [
        { key: 'weathering', label: 'Re-Entry Thermal Scorch', type: 'range', min: 0.0, max: 1.0, step: 0.05 }
      ]
    },
    {
      group: '4. Titanium & Scramjet Palette',
      fields: [
        { key: 'armorBaseColor', label: 'Titanium White Airframe', type: 'color' },
        { key: 'stripeColor', label: 'Tactical Racing Stripes', type: 'color' },
        { key: 'scramjetColor', label: 'Scramjet Plasma Exhaust', type: 'color' },
        { key: 'panelLineColor', label: 'Ligne-Claire Ink Outline', type: 'color' }
      ]
    },
    {
      group: '5. Component Visibility Toggles',
      fields: [
        { key: 'showRacingStripes', label: 'Wing & Spine Tactical Stripes', type: 'checkbox' },
        { key: 'showScramjetGlow', label: 'Twin Cyan Scramjet Exhaust Plumes', type: 'checkbox' }
      ]
    }
  ];

  const AURORA_PRESETS = {
    DIORAMA_DEFAULT: { name: '1. Titanium Blue Wave-Rider (Default)', params: Object.assign({}, AURORA_DEFAULT_PARAMS) },
    AURORA_ALPHA: { name: '2. Gen. Alexander Aurora Alpha (Gold)', params: Object.assign({}, AURORA_ALPHA_DEFAULT_PARAMS) },
    SR71_BLACKBIRD: { name: '3. SR-71 Habu Matte Black', params: Object.assign({}, AURORA_DEFAULT_PARAMS, { armorBaseColor: '#1e293b', stripeColor: '#dc2626', scramjetColor: '#f59e0b' }) },
    ORBITAL_CHROME: { name: '4. High-Altitude Silver Chrome', params: Object.assign({}, AURORA_DEFAULT_PARAMS, { armorBaseColor: '#cbd5e1', stripeColor: '#0284c7' }) },
    STEALTH_PROTOTYPE: { name: '5. Area-51 Skunkworks Prototype', params: Object.assign({}, AURORA_DEFAULT_PARAMS, { armorBaseColor: '#475569', stripeColor: '#22d3ee', showRacingStripes: false }) }
  };

  function renderAuroraModel(ctx, u, faction, customParams, options) {
    const isAlpha = u && u.defId === 'USA_AURORA_ALPHA';
    const baseDef = isAlpha ? AURORA_ALPHA_DEFAULT_PARAMS : AURORA_DEFAULT_PARAMS;
    const p = Object.assign({}, baseDef, customParams || {});
    const opts = options || {};

    const rawR = (u && u.radius) || 18;
    const r = rawR * (p.hullScale || 1.0);
    const L = p.fuselageLength || 1.0;
    const W = p.wingSpan || 1.0;
    const hullAngle = (u && u.angle !== undefined) ? u.angle : 0;
    const recoil = (u && u.recoilOffset) || 0;
    const phase = (u && u.treadPhase) || (typeof performance !== 'undefined' ? (performance.now() * 0.003) % 1 : 0);
    const hoverZ = Math.sin(phase * Math.PI * 2) * 0.04 * r;
    const pitchScale = opts.pitchScale !== undefined ? opts.pitchScale : 1.0;
    const zScale = opts.zScale !== undefined ? opts.zScale : 0.42;

    const bodyCol = p.armorBaseColor || '#f8fafc';
    const stripeCol = p.stripeColor || '#2563eb';
    const seamCol = p.panelLineColor || '#26201b';
    const glowCol = p.scramjetColor || '#22d3ee';

    const proj = createProjector(hullAngle, pitchScale, zScale, 0, 0, 0, 0);

    // Shadow
    const shadowPts = [
      proj.project(-1.16 * r * L, -1.10 * r * W, 0),
      proj.project(1.56 * r * L, 0, 0),
      proj.project(-1.16 * r * L, 1.10 * r * W, 0)
    ].map((pt) => ({ x: pt.x + 4.5, y: pt.y + 6.5 }));
    drawPolyPts(ctx, shadowPts, 'rgba(65, 50, 40, 0.28)', null, 0);

    const faces = [];
    const zWing = 0.26 * r + hoverZ;

    // 1. Twin Segmented Metallic Exhaust Nozzles & Pulsing Cyan Shock-Diamond Scramjet Plumes
    for (const side of [-1, 1]) {
      const ny = side * 0.22 * r;
      pushTubeSegment3D(faces, proj, -1.16 * r * L, ny, zWing + 0.09 * r, 0, 0, 0.20 * r * L, 0.10 * r, 0.12 * r, '#334155', seamCol, 1.0, 0.15);
    }

    if (p.showScramjetGlow !== false) {
      const surge = 1.0 + Math.sin(phase * Math.PI * 8) * 0.09 + clamp(recoil * 0.10, 0, 0.40);
      faces.push({
        depth: proj.project(-1.32 * r * L, 0, zWing).depth - 0.5,
        customDraw(c) {
          for (const side of [-1, 1]) {
            const ny = side * 0.22 * r;
            const p0 = proj.project(-1.12 * r * L, ny, zWing + 0.09 * r);
            const p1 = proj.project(-1.66 * r * L * surge, ny * 1.08, zWing + 0.09 * r);
            const pMid = proj.project(-1.38 * r * L * surge, ny * 1.04, zWing + 0.09 * r);
            c.strokeStyle = glowCol;
            c.lineWidth = 5.0;
            c.lineCap = 'round';
            c.beginPath();
            c.moveTo(p0.x, p0.y);
            c.lineTo(p1.x, p1.y);
            c.stroke();

            c.strokeStyle = '#bae6fd';
            c.lineWidth = 3.0;
            c.beginPath();
            c.moveTo(p0.x, p0.y);
            c.lineTo(pMid.x, pMid.y);
            c.stroke();

            c.strokeStyle = '#ffffff';
            c.lineWidth = 1.6;
            c.beginPath();
            c.moveTo(p0.x, p0.y);
            c.lineTo((p0.x + pMid.x) * 0.55, (p0.y + pMid.y) * 0.55);
            c.stroke();
          }
        }
      });
    }

    // 2. Ventral Blue-Trimmed Scramjet Wedge Air Intakes (beneath forward wing roots)
    for (const side of [-1, 1]) {
      const iy = side * 0.26 * r * W;
      pushBox3D(faces, proj, 0.16 * r * L, 0.68 * r * L, iy - 0.09 * r, iy + 0.09 * r, zWing - 0.09 * r, zWing + 0.01 * r, stripeCol, seamCol, 1.0, 0.12);
    }

    // 3. Sleek Needle-Nosed Cranked-Delta Wave-Rider Airframe (matching usa_aurora_diorama_ref.png!)
    const deltaBot = [
      [-1.04 * r * L, -0.38 * r * W, zWing],
      [-0.80 * r * L, -1.18 * r * W, zWing],
      [-0.26 * r * L, -1.04 * r * W, zWing],
      [0.44 * r * L, -0.28 * r * W, zWing],
      [1.56 * r * L, 0, zWing],
      [0.44 * r * L, 0.28 * r * W, zWing],
      [-0.26 * r * L, 1.04 * r * W, zWing],
      [-0.80 * r * L, 1.18 * r * W, zWing],
      [-1.04 * r * L, 0.38 * r * W, zWing]
    ];
    const deltaTop = deltaBot.map((v) => [v[0], v[1], v[2] + 0.09 * r]);
    pushFrustumFaces(faces, proj, deltaBot, deltaTop, bodyCol, seamCol, 1.15, 0.22);

    // 4. Raised Central Scramjet Spine + Twin Dorsal Cylindrical Engine Nacelle Humps
    pushBox3D(faces, proj, -0.96 * r * L, 1.12 * r * L, -0.20 * r, 0.20 * r, zWing + 0.08 * r, zWing + 0.28 * r, bodyCol, seamCol, 1.1, 0.45, 0.36 * r * L, 0.06 * r);
    for (const side of [-1, 1]) {
      const ny = side * 0.22 * r;
      pushTubeSegment3D(faces, proj, -1.00 * r * L, ny, zWing + 0.12 * r, 0, 0, 0.92 * r * L, 0.115 * r, 0.085 * r, bodyCol, seamCol, 1.05, 0.48);
    }

    // 5. Royal-Blue Livery Stripes, Needle-Nose Pitot, Thermal Nose Cone & 3-Pane Cockpit Visor
    faces.push({
      depth: proj.project(0.24 * r * L, 0, zWing + 0.30 * r).depth + 0.68,
      customDraw(c) {
        // Thermal-shielded grey nose tip cone + hypersonic needle pitot probe
        const nosePts = [
          proj.project(1.22 * r * L, -0.09 * r * W, zWing + 0.09 * r),
          proj.project(1.56 * r * L, 0, zWing + 0.09 * r),
          proj.project(1.22 * r * L, 0.09 * r * W, zWing + 0.09 * r)
        ];
        drawPolyPts(c, nosePts, '#94a3b8', seamCol, 0.95);
        drawLine3D(c, proj, 1.54 * r * L, 0, zWing + 0.05 * r, 1.80 * r * L, 0, zWing + 0.05 * r, seamCol, 1.35);

        if (p.showRacingStripes !== false) {
          // Dorsal spine racing stripe with white mid-avionics hatch cutout
          const spineStripe = [
            proj.project(-0.88 * r * L, -0.10 * r, zWing + 0.29 * r),
            proj.project(1.06 * r * L, -0.05 * r, zWing + 0.17 * r),
            proj.project(1.06 * r * L, 0.05 * r, zWing + 0.17 * r),
            proj.project(-0.88 * r * L, 0.10 * r, zWing + 0.29 * r)
          ];
          drawPolyPts(c, spineStripe, stripeCol, seamCol, 0.85);

          // White avionics hatch cutout on spine
          const hatchPts = [
            proj.project(-0.14 * r * L, -0.05 * r, zWing + 0.295 * r),
            proj.project(0.18 * r * L, -0.05 * r, zWing + 0.295 * r),
            proj.project(0.18 * r * L, 0.05 * r, zWing + 0.295 * r),
            proj.project(-0.14 * r * L, 0.05 * r, zWing + 0.295 * r)
          ];
          drawPolyPts(c, hatchPts, bodyCol, seamCol, 0.8);

          // Double Geometric L-Shaped Wing Stripes + Elevon Hinge Seams
          for (const side of [-1, 1]) {
            drawLine3D(c, proj, -0.74 * r * L, side * 1.06 * r * W, zWing + 0.095 * r, -0.26 * r * L, side * 0.92 * r * W, zWing + 0.095 * r, stripeCol, 2.5);
            drawLine3D(c, proj, -0.74 * r * L, side * 1.06 * r * W, zWing + 0.095 * r, -0.74 * r * L, side * 0.46 * r * W, zWing + 0.095 * r, stripeCol, 2.2);
            drawLine3D(c, proj, -0.54 * r * L, side * 0.90 * r * W, zWing + 0.095 * r, -0.10 * r * L, side * 0.68 * r * W, zWing + 0.095 * r, stripeCol, 1.6);
            // Trailing-edge elevon panel line
            drawLine3D(c, proj, -0.90 * r * L, side * 0.42 * r * W, zWing + 0.095 * r, -0.76 * r * L, side * 1.12 * r * W, zWing + 0.095 * r, seamCol, 0.85);
          }
        }

        // 3-Pane Curved Flush Hypersonic Cockpit Visor with Specular Glint
        const visorPts = [
          proj.project(0.62 * r * L, -0.15 * r, zWing + 0.27 * r),
          proj.project(0.96 * r * L, -0.08 * r, zWing + 0.18 * r),
          proj.project(0.96 * r * L, 0.08 * r, zWing + 0.18 * r),
          proj.project(0.62 * r * L, 0.15 * r, zWing + 0.27 * r)
        ];
        drawPolyPts(c, visorPts, '#1e293b', seamCol, 1.05);
        drawLine3D(c, proj, 0.68 * r * L, -0.06 * r, zWing + 0.26 * r, 0.88 * r * L, -0.02 * r, zWing + 0.20 * r, '#bae6fd', 1.3);
      }
    });

    // 6. Twin Canted Tail Fins with Blue/Gold Upper Tip Caps & Rudder Seams
    for (const side of [-1, 1]) {
      const yBase = side * 0.28 * r;
      const yTip = side * 0.44 * r;
      const finPts = [
        proj.project(-1.00 * r * L, yBase, zWing + 0.14 * r),
        proj.project(-0.42 * r * L, yBase, zWing + 0.14 * r),
        proj.project(-0.62 * r * L, yTip, zWing + 0.66 * r),
        proj.project(-0.96 * r * L, yTip, zWing + 0.66 * r)
      ];
      const capPts = [
        proj.project(-0.95 * r * L, yTip * 0.94, zWing + 0.52 * r),
        proj.project(-0.57 * r * L, yTip * 0.94, zWing + 0.52 * r),
        proj.project(-0.62 * r * L, yTip, zWing + 0.66 * r),
        proj.project(-0.96 * r * L, yTip, zWing + 0.66 * r)
      ];
      faces.push({
        depth: proj.project(-0.72 * r * L, yTip, zWing + 0.42 * r).depth + 0.88,
        customDraw(c) {
          drawPolyPts(c, finPts, bodyCol, seamCol, 1.15);
          drawPolyPts(c, capPts, stripeCol, seamCol, 1.0);
          drawLine3D(c, proj, -0.86 * r * L, yBase * 1.04, zWing + 0.16 * r, -0.84 * r * L, yTip * 0.90, zWing + 0.52 * r, seamCol, 0.85);
        }
      });
    }

    flushFaces(ctx, faces);
  }

  // ==========================================================================
  // 11. Unit #16, #17, #18: USA Chibi-Tactical Infantry Trio
  //     (Ranger, Missile Defender, Pathfinder)
  //     Matches assets/refs/usa_infantry_diorama_ref.png
  // ==========================================================================
  const INFANTRY_DEFAULT_PARAMS = {
    hullScale: 1.0,
    headScale: 1.0,
    weaponScale: 1.0,
    helmetColor: '#7c765a',
    uniformColor: '#a89674',
    vestColor: '#6b6852',
    skinColor: '#a87556',
    panelLineColor: '#26201b',
    showGoggles: true,
    showStatusBubble: true
  };

  const MISSILE_DEFENDER_DEFAULT_PARAMS = Object.assign({}, INFANTRY_DEFAULT_PARAMS, {
    helmetColor: '#6b7a52',
    uniformColor: '#7d8a63',
    vestColor: '#556140',
    skinColor: '#8d5b3e',
    showGoggles: false
  });

  const PATHFINDER_DEFAULT_PARAMS = Object.assign({}, INFANTRY_DEFAULT_PARAMS, {
    helmetColor: '#6c7356',
    uniformColor: '#697257',
    vestColor: '#4f5741',
    skinColor: '#e0b191',
    showGoggles: false
  });

  const INFANTRY_PARAM_SCHEMA = [
    {
      group: '1. Chibi-Tactical Body Proportions',
      fields: [
        { key: 'hullScale', label: 'Overall Soldier Scale', type: 'range', min: 0.75, max: 1.45, step: 0.02 },
        { key: 'headScale', label: 'Helmet & Head Scale', type: 'range', min: 0.80, max: 1.35, step: 0.05 }
      ]
    },
    {
      group: '2. Tactical Vest, Backpack & Rigging',
      fields: [
        { key: 'extrusionDepth', label: 'Torso & Plate Carrier Bulk', type: 'range', min: 0.85, max: 1.30, step: 0.05 }
      ]
    },
    {
      group: '3. Oversized Diorama Weapon & Optics',
      fields: [
        { key: 'weaponScale', label: 'Primary Weapon Scale', type: 'range', min: 0.80, max: 1.45, step: 0.05 },
        { key: 'weathering', label: 'Field Mud & Boot Scuffing', type: 'range', min: 0.0, max: 1.0, step: 0.05 }
      ]
    },
    {
      group: '4. Diorama Uniform & Gear Palette',
      fields: [
        { key: 'helmetColor', label: 'Helmet / Beret / Keffiyeh Color', type: 'color' },
        { key: 'uniformColor', label: 'Fatigues / Tunic Color', type: 'color' },
        { key: 'vestColor', label: 'Tactical Plate Carrier / Vest', type: 'color' },
        { key: 'skinColor', label: 'Skin Tone', type: 'color' },
        { key: 'panelLineColor', label: 'Ligne-Claire Ink Outline', type: 'color' }
      ]
    },
    {
      group: '5. Component Visibility Toggles',
      fields: [
        { key: 'showGoggles', label: 'Ballistic Goggles / Visor / Shades', type: 'checkbox' },
        { key: 'showStatusBubble', label: 'Floating Comic Status Callout Bubble', type: 'checkbox' }
      ]
    }
  ];

  const INFANTRY_PRESETS = {
    DIORAMA_DEFAULT: { name: '1. Standard Issue Kit (Default)', params: Object.assign({}, INFANTRY_DEFAULT_PARAMS) },
    DESERT_STORM: { name: '2. Desert Tri-Color Camo', params: Object.assign({}, INFANTRY_DEFAULT_PARAMS, { helmetColor: '#c9a673', uniformColor: '#dec092', vestColor: '#8c6d43' }) },
    WOODLAND_RECON: { name: '3. Woodland Gillie Recon', params: Object.assign({}, PATHFINDER_DEFAULT_PARAMS) },
    URBAN_SWAT: { name: '4. Urban Night Ops Slate', params: Object.assign({}, INFANTRY_DEFAULT_PARAMS, { helmetColor: '#1e293b', uniformColor: '#334155', vestColor: '#0f172a' }) },
    ELITE_COMMANDO: { name: '5. Elite Special Forces Kit', params: Object.assign({}, MISSILE_DEFENDER_DEFAULT_PARAMS, { weaponScale: 1.18, headScale: 1.08 }) }
  };

  function renderInfantryModel(ctx, u, faction, customParams, options) {
    const defId = (u && u.defId) || 'USA_RANGER';
    const isMissile = defId === 'USA_MISSILE_DEFENDER' || defId === 'CHINA_TANK_HUNTER' || defId === 'GLA_RPG_TROOPER';
    const isPathfinder = defId === 'USA_PATHFINDER' || defId === 'GLA_JARMEN_KELL';
    const isBurton = defId === 'USA_COLONEL_BURTON';
    const isMinigunner = defId === 'CHINA_MINIGUNNER';
    const isHacker = defId === 'CHINA_HACKER' || defId === 'CHINA_SUPER_HACKER';
    const isLotus = defId === 'CHINA_BLACK_LOTUS';
    const isWorker = defId === 'GLA_WORKER';
    const isTerrorist = defId === 'GLA_TERRORIST';
    const isHijacker = defId === 'GLA_HIJACKER';
    const isMob = defId === 'GLA_ANGRY_MOB';
    const isGla = defId.startsWith('GLA_');
    const isChina = defId.startsWith('CHINA_');

    const baseDef = isMissile
      ? MISSILE_DEFENDER_DEFAULT_PARAMS
      : (isPathfinder || isBurton)
        ? PATHFINDER_DEFAULT_PARAMS
        : INFANTRY_DEFAULT_PARAMS;
    const p = Object.assign({}, baseDef, customParams || {});
    const opts = options || {};

    const rawR = Math.max((u && u.radius) || 9, 10);
    const r = rawR * (p.hullScale || 1.0);
    const hScale = p.headScale || 1.0;
    const wScale = p.weaponScale || 1.0;
    const angle = (u && u.angle !== undefined) ? u.angle : 0;
    const turretAngle = (u && u.turretAngle !== undefined) ? u.turretAngle : angle;
    const recoil = (u && u.recoilOffset) || 0;
    const phase = (u && u.treadPhase) || 0;
    const bob = Math.sin(phase * Math.PI * 2) * 0.07 * r;

    const pitchScale = opts.pitchScale !== undefined ? opts.pitchScale : 1.0;
    const zScale = opts.zScale !== undefined ? opts.zScale : 0.42;
    const seamCol = p.panelLineColor || '#26201b';
    const helmetCol = isBurton ? '#881337' : isLotus ? '#0f172a' : isTerrorist ? '#dc2626' : (p.helmetColor || '#7c765a');
    const uniformCol = isLotus ? '#1e293b' : (p.uniformColor || '#a89674');
    const vestCol = isBurton ? '#3f4d34' : isTerrorist ? '#b91c1c' : (p.vestColor || '#6b6852');
    const skinCol = p.skinColor || '#a87556';

    const proj = createProjector(angle, pitchScale, zScale, 0, 0, 0, 0);
    const upperProj = createProjector(turretAngle, pitchScale, zScale, 0, 0, 0, angle);

    // Oval Ground Contact Shadow
    const basePt = proj.project(0, 0, 0);
    ctx.save();
    ctx.fillStyle = 'rgba(75, 58, 46, 0.34)';
    ctx.beginPath();
    ctx.ellipse(basePt.x, basePt.y + 2.0, r * (isMob ? 1.05 : 0.72), r * (isMob ? 0.65 : 0.45) * pitchScale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const faces = [];

    // Angry Mob Flanking Rioters (2 extra mini-figures flanking the lead insurgent!)
    if (isMob) {
      for (const side of [-1, 1]) {
        const ox = -0.34 * r;
        const oy = side * 0.56 * r;
        pushBox3D(faces, proj, ox - 0.16 * r, ox + 0.16 * r, oy - 0.22 * r, oy + 0.22 * r, 0.12 * r, 0.86 * r + bob, '#78716c', seamCol, 1.0, -0.3);
        pushCylinderZ3D(faces, proj, ox, oy, 0.86 * r + bob, 1.32 * r + bob, 0.24 * r, 0.24 * r, 6, '#d6bc8b', seamCol, 1.0, -0.1);
      }
    }

    // 1. Boots & Knee-Padded Camo Legs (aligned with walking angle)
    for (const side of [-1, 1]) {
      const stride = side * Math.sin(phase * Math.PI * 2) * 0.16 * r;
      const ly = side * 0.24 * r;
      pushBox3D(faces, proj, stride - 0.16 * r, stride + 0.20 * r, ly - 0.14 * r, ly + 0.14 * r, 0, 0.18 * r, '#4a3b2c', seamCol, 1.05, 0.1);
      pushBox3D(faces, proj, stride * 0.5 - 0.17 * r, stride * 0.5 + 0.17 * r, ly - 0.15 * r, ly + 0.15 * r, 0.18 * r, 0.56 * r + bob, uniformCol, seamCol, 1.05, 0.25);
    }

    // 2. Armored Tactical Torso + Plate Carrier Vest + Shoulder Pads (slews with turretAngle!)
    pushBox3D(faces, upperProj, -0.26 * r, 0.26 * r, -0.38 * r, 0.38 * r, 0.52 * r + bob, 1.18 * r + bob, uniformCol, seamCol, 1.15, 0.55, 0.02 * r, 0.03 * r);
    pushBox3D(faces, upperProj, -0.22 * r, 0.28 * r, -0.30 * r, 0.30 * r, 0.58 * r + bob, 1.10 * r + bob, vestCol, seamCol, 1.05, 0.65);

    // Satchel Bag / C4 Pack / Terrorist Dynamite Straps / Hacker Backpack
    if (isPathfinder || isBurton || isHacker || isLotus || isTerrorist || isWorker) {
      const packCol = isTerrorist ? '#ef4444' : isHacker || isLotus ? '#334155' : isWorker ? '#b45309' : '#925e36';
      pushBox3D(faces, upperProj, -0.34 * r, 0.12 * r, 0.28 * r, 0.48 * r, 0.48 * r + bob, 0.88 * r + bob, packCol, seamCol, 1.0, 0.72);
    }

    // 3. Chibi-Tactical Head & Rounded Kevlar Helmet / Maroon Beret / GLA Keffiyeh
    const zHeadBot = 1.16 * r + bob;
    const zHeadMid = 1.54 * r * hScale + bob;
    const zHelmetTop = (isBurton || isLotus ? 1.82 : 1.92) * r * hScale + bob;
    pushCylinderZ3D(faces, upperProj, 0.04 * r, 0, zHeadBot, zHeadMid, 0.34 * r * hScale, 0.36 * r * hScale, 8, skinCol, seamCol, 1.1, 1.1);
    pushCylinderZ3D(faces, upperProj, isBurton ? -0.04 * r : 0, isBurton ? 0.05 * r : 0, zHeadMid - 0.08 * r, zHelmetTop, 0.46 * r * hScale, (isBurton || isGla) ? 0.42 * r * hScale : 0.36 * r * hScale, 8, helmetCol, seamCol, 1.15, 1.25);

    // Facial eyes, tactical sunglasses, China Red Star badge, or Helmet Ballistic Goggles
    faces.push({
      depth: upperProj.project(0.38 * r * hScale, 0, zHeadMid).depth + 1.45,
      customDraw(c) {
        for (const side of [-1, 1]) {
          const eyePt = upperProj.project(0.34 * r * hScale, side * 0.13 * r * hScale, zHeadBot + 0.22 * r * hScale);
          c.fillStyle = (isBurton || isLotus || isHijacker) ? '#0f172a' : seamCol;
          c.beginPath();
          c.arc(eyePt.x, eyePt.y, Math.max(1.2, (isBurton ? 0.065 : 0.04) * r), 0, Math.PI * 2);
          c.fill();
        }
        if (isChina) {
          const starPt = upperProj.project(0.42 * r * hScale, 0, zHeadMid + 0.16 * r * hScale);
          c.fillStyle = '#ef4444';
          c.beginPath();
          c.arc(starPt.x, starPt.y, Math.max(1.6, 0.08 * r), 0, Math.PI * 2);
          c.fill();
        }
        if (p.showGoggles !== false && !isMissile && !isBurton && !isWorker) {
          const gQuad = [
            [0.42 * r * hScale, -0.30 * r * hScale, zHeadMid - 0.02 * r],
            [0.42 * r * hScale, 0.30 * r * hScale, zHeadMid - 0.02 * r],
            [0.40 * r * hScale, 0.28 * r * hScale, zHeadMid + 0.16 * r * hScale],
            [0.40 * r * hScale, -0.28 * r * hScale, zHeadMid + 0.16 * r * hScale]
          ];
          drawGlassPane3D(c, upperProj, gQuad, isLotus ? '#ec4899' : isMinigunner ? '#f59e0b' : '#78909c', seamCol, 1.05);
        }
      }
    });

    // 4. Oversized Readable Diorama Weapons / Tools with 3D Recoil & Muzzle Flash
    const recDist = clamp(recoil * 0.04 * r, 0, 0.18 * r);
    if (isMissile) {
      pushTubeSegment3D(
        faces,
        upperProj,
        -0.58 * r * wScale - recDist,
        0.34 * r,
        1.12 * r + bob,
        -0.10,
        0,
        1.42 * r * wScale,
        0.18 * r * wScale,
        0.20 * r * wScale,
        isGla ? '#854d0e' : '#6b7a52',
        seamCol,
        1.1,
        1.65
      );
    } else if (isMinigunner) {
      pushTubeSegment3D(faces, upperProj, -0.10 * r, 0.32 * r, 0.78 * r + bob, 0, 0, 1.15 * r * wScale, 0.16 * r * wScale, 0.15 * r * wScale, '#334155', seamCol, 1.1, 1.65);
    } else if (isHacker || isLotus) {
      // Ruggedized Field Cyber Laptop with glowing green/magenta screen
      pushBox3D(faces, upperProj, 0.18 * r, 0.64 * r * wScale, -0.24 * r, 0.24 * r, 0.72 * r + bob, 0.80 * r + bob, '#334155', seamCol, 1.0, 1.65);
      pushBox3D(faces, upperProj, 0.56 * r * wScale, 0.64 * r * wScale, -0.22 * r, 0.22 * r, 0.80 * r + bob, 1.08 * r + bob, isLotus ? '#ec4899' : '#10b981', seamCol, 1.0, 1.72);
    }

    const wDepth = upperProj.project(0.45 * r, 0.28 * r, 0.95 * r + bob).depth + 1.75;
    faces.push({
      depth: wDepth,
      customDraw(c) {
        let muzPt = null;
        if (isMissile) {
          const mTip = upperProj.project(0.82 * r * wScale - recDist, 0.34 * r, 0.96 * r + bob);
          c.fillStyle = isGla ? '#b91c1c' : '#3b4230';
          c.strokeStyle = seamCol;
          c.lineWidth = 1.2;
          c.beginPath();
          c.arc(mTip.x, mTip.y, Math.max(2.0, 0.18 * r * wScale), 0, Math.PI * 2);
          c.fill();
          c.stroke();
          muzPt = mTip;
        } else if (isPathfinder) {
          drawLine3D(c, upperProj, -0.10 * r - recDist, 0.26 * r, 0.86 * r + bob, 1.28 * r * wScale - recDist, 0.12 * r, 0.82 * r + bob, seamCol, 2.8);
          drawLine3D(c, upperProj, 0.15 * r - recDist, 0.22 * r, 0.98 * r + bob, 0.62 * r * wScale - recDist, 0.18 * r, 0.96 * r + bob, '#475569', 2.2);
          muzPt = upperProj.project(1.28 * r * wScale - recDist, 0.12 * r, 0.82 * r + bob);
        } else if (isBurton) {
          drawLine3D(c, upperProj, -0.18 * r - recDist, 0.28 * r, 0.88 * r + bob, 1.08 * r * wScale - recDist, 0.14 * r, 0.80 * r + bob, '#3f4d34', 3.4);
          drawLine3D(c, upperProj, -0.18 * r - recDist, 0.28 * r, 0.88 * r + bob, 1.08 * r * wScale - recDist, 0.14 * r, 0.80 * r + bob, seamCol, 1.2);
          muzPt = upperProj.project(1.08 * r * wScale - recDist, 0.14 * r, 0.80 * r + bob);
        } else if (isWorker) {
          // Pickaxe / Hammer across shoulder
          drawLine3D(c, upperProj, -0.10 * r, 0.30 * r, 0.72 * r + bob, 0.76 * r * wScale, 0.22 * r, 1.18 * r + bob, '#78350f', 2.6);
          drawLine3D(c, upperProj, 0.62 * r * wScale, 0.22 * r, 1.32 * r + bob, 0.88 * r * wScale, 0.22 * r, 1.02 * r + bob, '#64748b', 3.0);
        } else if (isTerrorist) {
          // Detonator switch in raised hand
          drawLine3D(c, upperProj, 0.18 * r, 0.30 * r, 0.92 * r + bob, 0.56 * r, 0.32 * r, 1.32 * r + bob, '#dc2626', 2.8);
        } else if (isHijacker) {
          // Curved tactical blade
          drawLine3D(c, upperProj, 0.18 * r, 0.28 * r, 0.84 * r + bob, 0.78 * r * wScale, 0.16 * r, 0.92 * r + bob, '#cbd5e1', 2.6);
        } else if (!isHacker && !isLotus) {
          // M4A1 / Type-81 / AK-47 Assault Rifle held across chest
          const gunCol = isGla || isChina ? '#78350f' : '#334155';
          drawLine3D(c, upperProj, -0.14 * r - recDist, 0.26 * r, 0.88 * r + bob, 0.96 * r * wScale - recDist, 0.16 * r, 0.78 * r + bob, gunCol, 2.9);
          drawLine3D(c, upperProj, -0.14 * r - recDist, 0.26 * r, 0.88 * r + bob, 0.96 * r * wScale - recDist, 0.16 * r, 0.78 * r + bob, seamCol, 1.1);
          drawLine3D(c, upperProj, 0.32 * r - recDist, 0.22 * r, 0.82 * r + bob, 0.38 * r - recDist, 0.22 * r, 0.62 * r + bob, seamCol, 2.2);
          muzPt = upperProj.project(0.96 * r * wScale - recDist, 0.16 * r, 0.78 * r + bob);
        }
        if (recoil > 0.8 && muzPt) {
          const fR = Math.max(2.5, (recoil / 6) * 0.38 * r);
          c.fillStyle = isMissile ? 'rgba(249, 115, 22, 0.92)' : 'rgba(251, 191, 36, 0.92)';
          c.beginPath();
          c.arc(muzPt.x, muzPt.y, fR, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = '#ffffff';
          c.beginPath();
          c.arc(muzPt.x, muzPt.y, fR * 0.45, 0, Math.PI * 2);
          c.fill();
        }
      }
    });

    flushFaces(ctx, faces);

    // 5. Floating Ligne-Claire Comic Status Callout Bubble above Soldier
    if (p.showStatusBubble !== false && (opts.pitchScale !== undefined && opts.pitchScale < 0.95)) {
      const bubbleTop = upperProj.project(0, 0, zHelmetTop + 0.85 * r);
      const bx = bubbleTop.x;
      const by = bubbleTop.y;
      const bw = Math.max(16, r * 1.15);
      const bh = Math.max(14, r * 0.98);
      ctx.save();
      ctx.fillStyle = '#faf8f5';
      ctx.strokeStyle = seamCol;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(bx - bw * 0.5, by - bh, bw, bh, 4);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(bx - 3.5, by);
      ctx.lineTo(bx, by + 4.5);
      ctx.lineTo(bx + 3.5, by);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.font = `${Math.max(10, Math.round(r * 0.62))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const icon = isMissile ? '🛡️' : isPathfinder ? '🔭' : isBurton ? '💣' : isHacker || isLotus ? '💻' : isWorker ? '⛏️' : isTerrorist ? '🧨' : isMob ? '🔥' : '🎯';
      ctx.fillText(icon, bx, by - bh * 0.48);
      ctx.restore();
    }
  }

  // ==========================================================================
  // 12. Bonus Unit: China Overlord & Emperor Overlord Tank
  //     Matches assets/refs/china_overlord_diorama_ref.png from asset_sheet.png
  // ==========================================================================
  const OVERLORD_DEFAULT_PARAMS = {
    hullScale: 1.0,
    hullLength: 1.0,
    hullWidth: 1.0,
    extrusionDepth: 1.0,
    barrelLength: 1.0,
    armorBaseColor: '#738256',
    armorHighlightColor: '#8fa06d',
    armorShadowColor: '#4f5b3a',
    panelLineColor: '#26201b',
    houseColor: '#dc2626',
    showRoadWheels: true,
    showRoofGatling: true
  };

  const OVERLORD_PARAM_SCHEMA = [
    {
      group: '1. Super-Heavy Twin-Track Hull Proportions',
      fields: [
        { key: 'hullScale', label: 'Overall Overlord Scale', type: 'range', min: 0.75, max: 1.35, step: 0.02 },
        { key: 'hullLength', label: 'Twin-Track Hull Length', type: 'range', min: 0.85, max: 1.25, step: 0.02 },
        { key: 'hullWidth', label: 'Super-Heavy Hull Width', type: 'range', min: 0.85, max: 1.25, step: 0.02 }
      ]
    },
    {
      group: '2. Cast Turret & Dorsal Tower Geometry',
      fields: [
        { key: 'extrusionDepth', label: 'Hull & Turret Armor Height', type: 'range', min: 0.80, max: 1.35, step: 0.05 }
      ]
    },
    {
      group: '3. Twin 125mm Cannons & Gattling / Speaker Tower',
      fields: [
        { key: 'barrelLength', label: 'Twin 125mm Barrel Length', type: 'range', min: 0.80, max: 1.35, step: 0.05 },
        { key: 'weathering', label: 'Track Mud & Diesel Soot', type: 'range', min: 0.0, max: 1.0, step: 0.05 }
      ]
    },
    {
      group: '4. PLA Heavy Armor Ligne-Claire Palette',
      fields: [
        { key: 'armorBaseColor', label: 'PLA Olive-Green Base', type: 'color' },
        { key: 'armorHighlightColor', label: 'Upper Turret Highlight', type: 'color' },
        { key: 'armorShadowColor', label: 'Suspension & Track Shadow', type: 'color' },
        { key: 'houseColor', label: 'PLA Red Star & Banner Trim', type: 'color' },
        { key: 'panelLineColor', label: 'Ligne-Claire Ink Outline', type: 'color' }
      ]
    },
    {
      group: '5. Component Visibility Toggles',
      fields: [
        { key: 'showRoadWheels', label: '6-Wheel Heavy Track Bogies', type: 'checkbox' },
        { key: 'showRoofGatling', label: 'Dorsal Gattling / Speaker Tower', type: 'checkbox' }
      ]
    }
  ];

  const OVERLORD_PRESETS = {
    DIORAMA_DEFAULT: { name: '1. PLA Heavy Olive (Default)', params: Object.assign({}, OVERLORD_DEFAULT_PARAMS) },
    EMPEROR_KWAI: { name: '2. Gen. Kwai Emperor Overlord', params: Object.assign({}, OVERLORD_DEFAULT_PARAMS, { hullScale: 1.08, armorBaseColor: '#5c6b43', armorHighlightColor: '#788a59' }) },
    NUCLEar_TAO: { name: '3. Gen. Tao Isotope Reactor', params: Object.assign({}, OVERLORD_DEFAULT_PARAMS, { armorBaseColor: '#657351', houseColor: '#84cc16' }) },
    BEIJING_PARADE: { name: '4. Beijing Red Guard Parade', params: Object.assign({}, OVERLORD_DEFAULT_PARAMS, { armorBaseColor: '#4b5563', armorHighlightColor: '#6b7280', houseColor: '#ef4444' }) },
    GOBI_DESERT: { name: '5. Gobi Desert Heavy Armor', params: Object.assign({}, OVERLORD_DEFAULT_PARAMS, { armorBaseColor: '#b59b6d', armorHighlightColor: '#cfb687', armorShadowColor: '#7d6845' }) }
  };

  const AMBULANCE_PARAM_SCHEMA = HUMVEE_PARAM_SCHEMA;
  const AMBULANCE_PRESETS = {
    DIORAMA_DEFAULT: { name: '1. Desert Medevac (Default)', params: Object.assign({}, HUMVEE_DEFAULT_PARAMS) },
    UN_WHITE: { name: '2. UN Peacekeeper White Med-Box', params: Object.assign({}, HUMVEE_DEFAULT_PARAMS, { armorBaseColor: '#f8fafc', armorHighlightColor: '#ffffff' }) },
    NATO_OLIVE: { name: '3. Woodland Field Hospital', params: Object.assign({}, HUMVEE_DEFAULT_PARAMS, { armorBaseColor: '#657351', armorHighlightColor: '#7f8f66' }) },
    HAZMAT_GOLD: { name: '4. NBC Chemical Decon Yellow', params: Object.assign({}, HUMVEE_DEFAULT_PARAMS, { armorBaseColor: '#eab308', armorHighlightColor: '#fde047' }) },
    ARCTIC_RESCUE: { name: '5. Arctic Rescue Red/White', params: Object.assign({}, HUMVEE_DEFAULT_PARAMS, { armorBaseColor: '#e2e8f0', houseColor: '#dc2626' }) }
  };

  const MICROWAVE_TANK_PARAM_SCHEMA = PALADIN_PARAM_SCHEMA;
  const MICROWAVE_TANK_PRESETS = {
    DIORAMA_DEFAULT: { name: '1. Desert Directed-Energy (Default)', params: Object.assign({}, PALADIN_DEFAULT_PARAMS) },
    ALEXANDER_SUPERWEAPON: { name: '2. Gen. Alexander Blue Emitter', params: Object.assign({}, PALADIN_DEFAULT_PARAMS, { armorBaseColor: '#cbd5e1', armorHighlightColor: '#f1f5f9', houseColor: '#0284c7' }) },
    TOWNES_PROTOTYPE: { name: '3. Lab Prototype Titanium', params: Object.assign({}, PALADIN_DEFAULT_PARAMS, { armorBaseColor: '#64748b', armorHighlightColor: '#94a3b8' }) },
    NATO_WOODLAND: { name: '4. Woodland Emitter Rig', params: Object.assign({}, PALADIN_DEFAULT_PARAMS, { armorBaseColor: '#5f6f46', armorHighlightColor: '#788a5b' }) },
    NIGHT_BLACKOUT: { name: '5. Grid-Blackout Night Camo', params: Object.assign({}, PALADIN_DEFAULT_PARAMS, { armorBaseColor: '#1e293b', armorHighlightColor: '#334155' }) }
  };

  const BATTLE_DRONE_PARAM_SCHEMA = HUMVEE_PARAM_SCHEMA;
  const BATTLE_DRONE_PRESETS = {
    DIORAMA_DEFAULT: { name: '1. Desert Recon Drone (Default)', params: Object.assign({}, HUMVEE_DEFAULT_PARAMS) },
    HEAVY_SENTRY: { name: '2. Up-Armored Combat Drone', params: Object.assign({}, HUMVEE_DEFAULT_PARAMS, { hullScale: 1.15, armorBaseColor: '#64748b' }) },
    SPEC_OPS_BLACK: { name: '3. Night-Ops Stealth Drone', params: Object.assign({}, HUMVEE_DEFAULT_PARAMS, { armorBaseColor: '#1e293b', armorHighlightColor: '#334155' }) },
    REPAIR_GOLD: { name: '4. Engineering Utility Yellow', params: Object.assign({}, HUMVEE_DEFAULT_PARAMS, { armorBaseColor: '#eab308', armorHighlightColor: '#fde047' }) },
    ARCTIC_SCOUT: { name: '5. Snow Camo Telemetry Drone', params: Object.assign({}, HUMVEE_DEFAULT_PARAMS, { armorBaseColor: '#e2e8f0', armorHighlightColor: '#f8fafc' }) }
  };

  const STEALTH_FIGHTER_PARAM_SCHEMA = RAPTOR_PARAM_SCHEMA;
  const STEALTH_FIGHTER_PRESETS = {
    DIORAMA_DEFAULT: { name: '1. Tonopah Nighthawk Black (Default)', params: Object.assign({}, RAPTOR_DEFAULT_PARAMS, { armorBaseColor: '#334155', camoPatchColor: '#1e293b' }) },
    HAVE_BLUE_GREY: { name: '2. Have-Blue Daylight Grey', params: Object.assign({}, RAPTOR_DEFAULT_PARAMS, { armorBaseColor: '#94a3b8', camoPatchColor: '#64748b' }) },
    DESERT_STORM_91: { name: '3. Khamis Mushait Night Strike', params: Object.assign({}, RAPTOR_DEFAULT_PARAMS, { armorBaseColor: '#1e293b', camoPatchColor: '#0f172a', canopyColor: '#f59e0b' }) },
    GRANGER_BUNKER_BUSTER: { name: '4. Gen. Granger Bunker-Buster', params: Object.assign({}, RAPTOR_DEFAULT_PARAMS, { armorBaseColor: '#312e81', camoPatchColor: '#1e1b4b' }) },
    CLEAN_STEALTH: { name: '5. Internal Bay Only (Clean Wing)', params: Object.assign({}, RAPTOR_DEFAULT_PARAMS, { armorBaseColor: '#334155', showWingMissiles: false }) }
  };

  function renderOverlordModel(ctx, u, faction, customParams, options) {
    const p = Object.assign({}, OVERLORD_DEFAULT_PARAMS, customParams || {});
    const opts = options || {};

    const rawR = (u && u.radius) || 23;
    const r = rawR * (p.hullScale || 1.0);
    const L = p.hullLength || 1.0;
    const W = p.hullWidth || 1.0;
    const H = p.extrusionDepth || 1.0;

    const hullAngle = (u && u.angle !== undefined) ? u.angle : 0;
    const turretAngle = (u && u.turretAngle !== undefined) ? u.turretAngle : hullAngle;
    const recoil = (u && u.recoilOffset) || 0;
    const treadPhase = (u && u.treadPhase) || 0;
    const pitchScale = opts.pitchScale !== undefined ? opts.pitchScale : 1.0;
    const zScale = opts.zScale !== undefined ? opts.zScale : 0.42;

    const armorBase = p.armorBaseColor || '#738256';
    const armorHi = p.armorHighlightColor || '#8fa06d';
    const armorDark = p.armorShadowColor || '#4f5b3a';
    const seamCol = p.panelLineColor || '#26201b';

    const hullProj = createProjector(hullAngle, pitchScale, zScale, 0, 0, 0, 0);

    const shadowPts = [
      hullProj.project(-1.22 * r * L, -0.94 * r * W, 0),
      hullProj.project(1.22 * r * L, -0.94 * r * W, 0),
      hullProj.project(1.22 * r * L, 0.94 * r * W, 0),
      hullProj.project(-1.22 * r * L, 0.94 * r * W, 0)
    ].map((pt) => ({ x: pt.x + 4.0, y: pt.y + 5.0 }));
    drawPolyPts(ctx, shadowPts, 'rgba(65, 50, 40, 0.38)', null, 0);

    const hullFaces = [];
    pushTrackedSuspension3D(hullFaces, hullProj, r, -1.16 * r * L, 1.16 * r * L, 0.50 * r * W, 0.88 * r * W, 0.28 * r * H, 6, armorDark, seamCol, treadPhase, p.showRoadWheels !== false, -2.0);

    pushBox3D(hullFaces, hullProj, -1.14 * r * L, 1.12 * r * L, -0.90 * r * W, 0.90 * r * W, 0.18 * r * H, 0.48 * r * H, armorBase, seamCol, 1.2, 0, 0.08 * r * L, 0.06 * r * W);
    flushFaces(ctx, hullFaces);

    const turProj = createProjector(turretAngle, pitchScale, zScale, -0.05 * r * L, 0, 0, hullAngle);
    const turFaces = [];
    const zTurBot = 0.48 * r * H;
    const zTurTop = 0.94 * r * H;
    pushBox3D(turFaces, turProj, -0.92 * r * L, 0.58 * r * L, -0.68 * r * W, 0.68 * r * W, zTurBot, zTurTop, armorBase, seamCol, 1.2, 1.0, 0.14 * r * L, 0.12 * r * W);

    // Twin 125mm Heavy Cannons (matching china_overlord_diorama_ref.png!)
    const bLen = p.barrelLength || 1.0;
    const recDist = clamp(recoil * 0.05 * r, 0, 0.30 * r);
    for (const side of [-1, 1]) {
      const by = side * 0.22 * r * W;
      pushTubeSegment3D(turFaces, turProj, 0.44 * r * L - recDist, by, (zTurBot + zTurTop) * 0.52, 0, 0, 1.65 * r * bLen, 0.105 * r, 0.088 * r, armorHi, seamCol, 1.05, 1.55);
    }

    // Roof Gatling Turret Box
    if (p.showRoofGatling !== false) {
      pushCylinderZ3D(turFaces, turProj, -0.10 * r * L, 0.14 * r * W, zTurTop, zTurTop + 0.12 * r * H, 0.24 * r, 0.20 * r, 8, armorDark, seamCol, 1.05, 1.75);
      pushBox3D(turFaces, turProj, -0.24 * r * L, 0.08 * r * L, 0.02 * r * W, 0.26 * r * W, zTurTop + 0.12 * r * H, zTurTop + 0.34 * r * H, armorHi, seamCol, 1.05, 1.85);
      pushTubeSegment3D(turFaces, turProj, 0.08 * r * L, 0.14 * r * W, zTurTop + 0.23 * r * H, 0, 0, 0.48 * r, 0.065 * r, 0.065 * r, '#334155', seamCol, 1.0, 1.95);
    }

    flushFaces(ctx, turFaces);
  }

  // ==========================================================================
  // 12B. Additional Dedicated 3D Articulated USA Allied Unit Renderers
  //      (Ambulance, Microwave Tank, Battle Drone, F-117A Stealth Fighter)
  // ==========================================================================
  function renderAmbulanceModel(ctx, u, faction, customParams, options) {
    const p = Object.assign({}, HUMVEE_DEFAULT_PARAMS, customParams || {});
    const opts = options || {};
    const rawR = (u && u.radius) || 15;
    const r = rawR * (p.hullScale || 1.0);
    const L = p.hullLength || 1.0;
    const W = p.hullWidth || 1.0;
    const H = p.extrusionDepth || 1.0;

    const hullAngle = (u && u.angle !== undefined) ? u.angle : 0;
    const turretAngle = (u && u.turretAngle !== undefined) ? u.turretAngle : hullAngle;
    const treadPhase = (u && u.treadPhase) || 0;
    const recoil = (u && u.recoilOffset) || 0;
    const pitchScale = opts.pitchScale !== undefined ? opts.pitchScale : 1.0;
    const zScale = opts.zScale !== undefined ? opts.zScale : 0.42;

    const armorBase = p.armorBaseColor || '#d4b07b';
    const medBoxCol = '#f3ede0';
    const seamCol = p.panelLineColor || '#26201b';
    const glassCol = p.glassColor || '#6e8c9e';
    const tireCol = p.tireColor || '#262320';

    const hullProj = createProjector(hullAngle, pitchScale, zScale, 0, 0, 0, 0);

    const shadowPts = [
      hullProj.project(-1.12 * r * L, -0.82 * r * W, 0),
      hullProj.project(1.12 * r * L, -0.82 * r * W, 0),
      hullProj.project(1.12 * r * L, 0.82 * r * W, 0),
      hullProj.project(-1.12 * r * L, 0.82 * r * W, 0)
    ].map((pt) => ({ x: pt.x + 3.0, y: pt.y + 4.0 }));
    drawPolyPts(ctx, shadowPts, 'rgba(75, 58, 46, 0.36)', null, 0);

    const faces = [];
    // 1. 4x4 Rolling Off-Road Rubber Tires
    for (const ax of [-0.66 * r * L, 0.68 * r * L]) {
      pushWheelAxle3D(faces, hullProj, ax, 0.62 * r * W, 0.33 * r, 0.24 * r * W, tireCol, '#9e7c4c', seamCol, treadPhase, -1.5);
    }

    // 2. Forward Desert-Tan Hood & Cab
    const zBot = 0.16 * r * H;
    const zHood = 0.52 * r * H;
    const zCabTop = 0.88 * r * H;
    pushBox3D(faces, hullProj, -1.04 * r * L, 1.04 * r * L, -0.68 * r * W, 0.68 * r * W, zBot, zHood, armorBase, seamCol, 1.15, 0, 0.04 * r * L, 0.04 * r * W);
    pushBox3D(faces, hullProj, 0.05 * r * L, 0.56 * r * L, -0.64 * r * W, 0.64 * r * W, zHood, zCabTop, armorBase, seamCol, 1.15, 0.3, 0.12 * r * L, 0.05 * r * W);

    // 2-Pane Split Blue Windshield
    const wDepth = hullProj.project(0.54 * r * L, 0, (zHood + zCabTop) * 0.5).depth + 0.45;
    faces.push({
      depth: wDepth,
      customDraw(c) {
        for (const side of [-1, 1]) {
          const yIn = side * 0.05 * r * W;
          const yOut = side * 0.54 * r * W;
          const pane = [
            [0.57 * r * L, yIn, zHood + 0.04 * r * H],
            [0.57 * r * L, yOut, zHood + 0.04 * r * H],
            [0.45 * r * L, yOut * 0.92, zCabTop - 0.04 * r * H],
            [0.45 * r * L, yIn, zCabTop - 0.04 * r * H]
          ];
          drawGlassPane3D(c, hullProj, pane, glassCol, seamCol, 1.05);
        }
      }
    });

    // 3. Tall Rear Medical Box Body with 3D Red Cross Emblems
    const zMedTop = 1.08 * r * H;
    pushBox3D(faces, hullProj, -1.04 * r * L, 0.08 * r * L, -0.72 * r * W, 0.72 * r * W, zHood - 0.04 * r * H, zMedTop, medBoxCol, seamCol, 1.2, 0.55, 0.03 * r * L, 0.03 * r * W);

    // 3D-Projected Red Cross on Roof & Sides
    const zRoof = zMedTop + 0.015 * r * H;
    const cx = -0.48 * r * L;
    const cw = 0.24 * r;
    const ct = 0.08 * r;
    const roofCrossDepth = hullProj.project(cx, 0, zRoof).depth + 0.85;
    faces.push({
      depth: roofCrossDepth,
      customDraw(c) {
        drawPolyPts(c, [
          hullProj.project(cx - cw, -ct, zRoof),
          hullProj.project(cx + cw, -ct, zRoof),
          hullProj.project(cx + cw, ct, zRoof),
          hullProj.project(cx - cw, ct, zRoof)
        ], '#dc2626', null, 0);
        drawPolyPts(c, [
          hullProj.project(cx - ct, -cw, zRoof),
          hullProj.project(cx + ct, -cw, zRoof),
          hullProj.project(cx + ct, cw, zRoof),
          hullProj.project(cx - ct, cw, zRoof)
        ], '#dc2626', null, 0);
      }
    });

    for (const side of [-1, 1]) {
      const sy = side * 0.73 * r * W;
      const cz = (zHood + zMedTop) * 0.52;
      const sDepth = hullProj.project(cx, sy, cz).depth + 0.78;
      faces.push({
        depth: sDepth,
        customDraw(c) {
          drawPolyPts(c, [
            hullProj.project(cx - cw * 0.85, sy, cz - ct * 0.85),
            hullProj.project(cx + cw * 0.85, sy, cz - ct * 0.85),
            hullProj.project(cx + cw * 0.85, sy, cz + ct * 0.85),
            hullProj.project(cx - cw * 0.85, sy, cz + ct * 0.85)
          ], '#dc2626', null, 0);
          drawPolyPts(c, [
            hullProj.project(cx - ct * 0.85, sy, cz - cw * 0.85),
            hullProj.project(cx + ct * 0.85, sy, cz - cw * 0.85),
            hullProj.project(cx + ct * 0.85, sy, cz + cw * 0.85),
            hullProj.project(cx - ct * 0.85, sy, cz + cw * 0.85)
          ], '#dc2626', null, 0);
        }
      });
    }

    // 4. Roof Emergency Strobe Lightbar & Rotating Decon Sprayer Turret (slews with turretAngle!)
    const strobeRed = Math.sin(treadPhase * Math.PI * 6) > 0;
    pushBox3D(faces, hullProj, -0.02 * r * L, 0.14 * r * L, -0.44 * r * W, 0, zMedTop, zMedTop + 0.14 * r * H, strobeRed ? '#ef4444' : '#991b1b', seamCol, 1.0, 1.1);
    pushBox3D(faces, hullProj, -0.02 * r * L, 0.14 * r * L, 0, 0.44 * r * W, zMedTop, zMedTop + 0.14 * r * H, !strobeRed ? '#38bdf8' : '#1e40af', seamCol, 1.0, 1.1);

    const deconProj = createProjector(turretAngle, pitchScale, zScale, -0.48 * r * L, 0, 0, hullAngle);
    pushCylinderZ3D(faces, deconProj, 0, 0, zMedTop, zMedTop + 0.15 * r * H, 0.18 * r, 0.14 * r, 8, '#cbd5e1', seamCol, 1.0, 1.25);
    pushTubeSegment3D(faces, deconProj, 0.10 * r, 0, zMedTop + 0.10 * r * H, 0.08, 0, 0.42 * r, 0.065 * r, 0.055 * r, '#38bdf8', seamCol, 1.0, 1.35);

    flushFaces(ctx, faces);

    // NBC Decon / Med-Aura Pulse when firing or active
    if (recoil > 0.5) {
      const topPt = deconProj.project(0.52 * r, 0, zMedTop + 0.14 * r * H);
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.arc(topPt.x, topPt.y, (1 - recoil / 7) * 0.85 * r + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function renderMicrowaveTankModel(ctx, u, faction, customParams, options) {
    const p = Object.assign({}, PALADIN_DEFAULT_PARAMS, customParams || {});
    const opts = options || {};
    const rawR = (u && u.radius) || 19;
    const r = rawR * (p.hullScale || 1.0);
    const L = p.hullLength || 1.0;
    const W = p.hullWidth || 1.0;
    const H = p.extrusionDepth || 1.0;

    const hullAngle = (u && u.angle !== undefined) ? u.angle : 0;
    const turretAngle = (u && u.turretAngle !== undefined) ? u.turretAngle : hullAngle;
    const treadPhase = (u && u.treadPhase) || 0;
    const recoil = (u && u.recoilOffset) || 0;
    const pitchScale = opts.pitchScale !== undefined ? opts.pitchScale : 1.0;
    const zScale = opts.zScale !== undefined ? opts.zScale : 0.42;

    const armorBase = p.armorBaseColor || '#d4b07b';
    const armorHi = p.armorHighlightColor || '#e8cc9c';
    const armorDark = p.armorShadowColor || '#9e7c4c';
    const seamCol = p.panelLineColor || '#26201b';

    const hullProj = createProjector(hullAngle, pitchScale, zScale, 0, 0, 0, 0);
    const shadowPts = [
      hullProj.project(-1.14 * r * L, -0.88 * r * W, 0),
      hullProj.project(1.14 * r * L, -0.88 * r * W, 0),
      hullProj.project(1.14 * r * L, 0.88 * r * W, 0),
      hullProj.project(-1.14 * r * L, 0.88 * r * W, 0)
    ].map((pt) => ({ x: pt.x + 3.2, y: pt.y + 4.2 }));
    drawPolyPts(ctx, shadowPts, 'rgba(75, 58, 46, 0.36)', null, 0);

    const hullFaces = [];
    pushTrackedSuspension3D(hullFaces, hullProj, r, -1.06 * r * L, 1.06 * r * L, 0.46 * r * W, 0.82 * r * W, 0.25 * r * H, 5, armorDark, seamCol, treadPhase, true, -2.0);
    pushBox3D(hullFaces, hullProj, -1.06 * r * L, 1.04 * r * L, -0.84 * r * W, 0.84 * r * W, 0.16 * r * H, 0.46 * r * H, armorBase, seamCol, 1.15, 0, 0.08 * r * L, 0.05 * r * W);
    // Rear Directed-Energy Capacitor Coils
    pushBox3D(hullFaces, hullProj, -0.98 * r * L, -0.42 * r * L, -0.58 * r * W, 0.58 * r * W, 0.46 * r * H, 0.68 * r * H, '#38bdf8', seamCol, 1.05, 0.4);
    flushFaces(ctx, hullFaces);

    // 2. Rotating 3D Parabolic Microwave Dish Turret (slews with turretAngle!)
    const turProj = createProjector(turretAngle, pitchScale, zScale, 0.06 * r * L, 0, 0, hullAngle);
    const turFaces = [];
    const zTurBot = 0.46 * r * H;
    const zTurMid = 0.82 * r * H;
    pushCylinderZ3D(turFaces, turProj, 0, 0, zTurBot, zTurMid, 0.48 * r, 0.38 * r, 8, armorBase, seamCol, 1.15, 1.0);

    // Dish Support Pedestal & Forward-Facing 3D Octagonal Parabolic Dish
    pushBox3D(turFaces, turProj, -0.18 * r * L, 0.22 * r * L, -0.22 * r * W, 0.22 * r * W, zTurMid, zTurMid + 0.42 * r * H, armorDark, seamCol, 1.1, 1.25);
    const zDishCenter = zTurMid + 0.34 * r * H;
    pushTubeSegment3D(turFaces, turProj, 0.14 * r * L, 0, zDishCenter, 0.12, 0, 0.24 * r, 0.28 * r, 0.62 * r, armorHi, seamCol, 1.2, 1.5);
    // Central Cyan-Gold Microwave Feed Horn
    pushTubeSegment3D(turFaces, turProj, 0.22 * r * L, 0, zDishCenter + 0.02 * r * H, 0.12, 0, 0.56 * r, 0.09 * r, 0.14 * r, '#38bdf8', seamCol, 1.1, 1.75);

    const hornDepth = turProj.project(0.78 * r * L, 0, zDishCenter + 0.08 * r * H).depth + 2.0;
    turFaces.push({
      depth: hornDepth,
      customDraw(c) {
        const hornPt = turProj.project(0.76 * r * L, 0, zDishCenter + 0.08 * r * H);
        // Glowing feed horn core
        c.fillStyle = '#fef08a';
        c.strokeStyle = seamCol;
        c.lineWidth = 1.1;
        c.beginPath();
        c.arc(hornPt.x, hornPt.y, Math.max(2.4, 0.14 * r), 0, Math.PI * 2);
        c.fill();
        c.stroke();

        // Expanding 3D Directed-Energy Microwave Rings along turretAngle!
        for (let i = 0; i < 2; i++) {
          const waveProg = ((treadPhase * 1.4 + i * 0.5) % 1.0 + 1.0) % 1.0;
          const waveDist = (0.82 + waveProg * (recoil > 0.5 ? 1.65 : 0.95)) * r * L;
          const wPt = turProj.project(waveDist, 0, zDishCenter + 0.12 * r * H);
          const wr = (0.18 + waveProg * 0.48) * r;
          c.strokeStyle = `rgba(56, 189, 248, ${(1 - waveProg) * (recoil > 0.5 ? 0.95 : 0.65)})`;
          c.lineWidth = recoil > 0.5 ? 2.2 : 1.5;
          c.beginPath();
          c.ellipse(wPt.x, wPt.y, wr * 0.65, wr, 0, 0, Math.PI * 2);
          c.stroke();
        }
      }
    });

    flushFaces(ctx, turFaces);
  }

  function renderBattleDroneModel(ctx, u, faction, customParams, options) {
    const p = Object.assign({}, HUMVEE_DEFAULT_PARAMS, customParams || {});
    const opts = options || {};
    const rawR = Math.max((u && u.radius) || 10, 11);
    const r = rawR * (p.hullScale || 1.0);
    const L = p.hullLength || 1.0;
    const W = p.hullWidth || 1.0;
    const H = p.extrusionDepth || 1.0;

    const hullAngle = (u && u.angle !== undefined) ? u.angle : 0;
    const turretAngle = (u && u.turretAngle !== undefined) ? u.turretAngle : hullAngle;
    const treadPhase = (u && u.treadPhase) || 0;
    const recoil = (u && u.recoilOffset) || 0;
    const pitchScale = opts.pitchScale !== undefined ? opts.pitchScale : 1.0;
    const zScale = opts.zScale !== undefined ? opts.zScale : 0.42;

    const armorBase = p.armorBaseColor || '#d4b07b';
    const armorHi = p.armorHighlightColor || '#e8cc9c';
    const armorDark = p.armorShadowColor || '#9e7c4c';
    const seamCol = p.panelLineColor || '#26201b';

    const hullProj = createProjector(hullAngle, pitchScale, zScale, 0, 0, 0, 0);
    const basePt = hullProj.project(0, 0, 0);
    ctx.save();
    ctx.fillStyle = 'rgba(75, 58, 46, 0.34)';
    ctx.beginPath();
    ctx.ellipse(basePt.x + 2, basePt.y + 3, r * 0.95, r * 0.62 * pitchScale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const hullFaces = [];
    // Compact Mini-Tracked Chassis
    pushTrackedSuspension3D(hullFaces, hullProj, r, -0.82 * r * L, 0.82 * r * L, 0.42 * r * W, 0.76 * r * W, 0.28 * r * H, 3, armorDark, seamCol, treadPhase, true, -1.5);
    pushBox3D(hullFaces, hullProj, -0.76 * r * L, 0.76 * r * L, -0.52 * r * W, 0.52 * r * W, 0.16 * r * H, 0.48 * r * H, armorBase, seamCol, 1.15, 0, 0.06 * r * L, 0.06 * r * W);
    flushFaces(ctx, hullFaces);

    // Rotating 3D Sensor Head & Twin Minigun Pods (slews with turretAngle!)
    const turProj = createProjector(turretAngle, pitchScale, zScale, 0, 0, 0, hullAngle);
    const turFaces = [];
    const zTurBot = 0.48 * r * H;
    const zTurTop = 0.96 * r * H;
    pushBox3D(turFaces, turProj, -0.48 * r * L, 0.48 * r * L, -0.46 * r * W, 0.46 * r * W, zTurBot, zTurTop, armorHi, seamCol, 1.15, 0.8, 0.08 * r * L, 0.08 * r * W);

    // Twin Side Miniguns with Recoil
    const recDist = clamp(recoil * 0.04 * r, 0, 0.18 * r);
    for (const side of [-1, 1]) {
      const gy = side * 0.54 * r * W;
      pushTubeSegment3D(turFaces, turProj, -0.10 * r * L - recDist, gy, (zTurBot + zTurTop) * 0.52, 0, 0, 0.95 * r * L, 0.11 * r, 0.09 * r, '#334155', seamCol, 1.05, 1.25);
    }

    // Glowing Cyan Optical Eye Lens & Muzzle Flashes
    const lensDepth = turProj.project(0.50 * r * L, 0, (zTurBot + zTurTop) * 0.55).depth + 1.6;
    turFaces.push({
      depth: lensDepth,
      customDraw(c) {
        const eyePt = turProj.project(0.50 * r * L, 0, (zTurBot + zTurTop) * 0.55);
        c.fillStyle = '#38bdf8';
        c.strokeStyle = seamCol;
        c.lineWidth = 1.1;
        c.beginPath();
        c.arc(eyePt.x, eyePt.y, Math.max(2.2, 0.18 * r), 0, Math.PI * 2);
        c.fill();
        c.stroke();

        if (recoil > 0.8) {
          for (const side of [-1, 1]) {
            const mPt = turProj.project(0.86 * r * L - recDist, side * 0.54 * r * W, (zTurBot + zTurTop) * 0.52);
            const fR = Math.max(2.2, (recoil / 6) * 0.34 * r);
            c.fillStyle = 'rgba(251, 191, 36, 0.92)';
            c.beginPath();
            c.arc(mPt.x, mPt.y, fR, 0, Math.PI * 2);
            c.fill();
          }
        }
      }
    });

    flushFaces(ctx, turFaces);
  }

  function renderStealthFighterModel(ctx, u, faction, customParams, options) {
    const p = Object.assign({}, RAPTOR_DEFAULT_PARAMS, {
      armorBaseColor: '#334155',
      armorHighlightColor: '#475569',
      armorShadowColor: '#1e293b',
      glassColor: '#f59e0b',
      houseColor: '#dc2626'
    }, customParams || {});
    const opts = options || {};

    const rawR = (u && u.radius) || 19;
    const r = rawR * (p.hullScale || 1.0);
    const L = p.hullLength || p.fuselageLength || 1.0;
    const W = p.hullWidth || p.wingSpan || 1.0;
    const H = p.extrusionDepth || 1.0;

    const hullAngle = (u && u.angle !== undefined) ? u.angle : 0;
    const phase = (u && u.treadPhase) || (typeof performance !== 'undefined' ? (performance.now() * 0.003) % 1 : 0);
    const recoil = (u && u.recoilOffset) || 0;
    const hoverZ = Math.sin(phase * Math.PI * 2) * 0.045 * r;
    const pitchScale = opts.pitchScale !== undefined ? opts.pitchScale : 1.0;
    const zScale = opts.zScale !== undefined ? opts.zScale : 0.42;

    const armorBase = p.armorBaseColor || '#334155';
    const armorHi = p.armorHighlightColor || '#475569';
    const armorDark = p.armorShadowColor || '#1e293b';
    const seamCol = p.panelLineColor || '#26201b';
    const glassCol = p.glassColor || '#f59e0b';

    const proj = createProjector(hullAngle, pitchScale, zScale, 0, 0, 0, 0);

    // Ground Contact Shadow
    const shadowPts = [
      proj.project(-1.08 * r * L, -1.28 * r * W, 0),
      proj.project(1.40 * r * L, 0, 0),
      proj.project(-1.08 * r * L, 1.28 * r * W, 0)
    ].map((pt) => ({ x: pt.x + 5.0, y: pt.y + 7.0 }));
    drawPolyPts(ctx, shadowPts, 'rgba(30, 41, 59, 0.30)', null, 0);

    const faces = [];
    const zAir = 0.30 * r * H + hoverZ;

    // 0. Tricycle Landing Gear Wheels + Twin GBU-27 Paveway III Bunker-Buster Laser-Guided Bombs
    const mSlide = clamp(recoil * 0.09 * r, 0, 0.48 * r);
    for (const side of [-1, 1]) {
      // Main landing gear wheel under inner wing root
      const wy = side * 0.38 * r * W;
      const wx = -0.22 * r * L;
      faces.push({
        depth: proj.project(wx, wy, zAir - 0.14 * r).depth - 0.45,
        customDraw(c) {
          const sPt = proj.project(wx, wy * 0.9, zAir);
          const wPt = proj.project(wx, wy, zAir - 0.14 * r);
          c.strokeStyle = '#64748b';
          c.lineWidth = 1.5;
          c.beginPath();
          c.moveTo(sPt.x, sPt.y);
          c.lineTo(wPt.x, wPt.y);
          c.stroke();

          c.fillStyle = '#0f172a';
          c.strokeStyle = seamCol;
          c.lineWidth = 1.0;
          c.beginPath();
          c.arc(wPt.x, wPt.y, Math.max(2.0, 0.09 * r), 0, Math.PI * 2);
          c.fill();
          c.stroke();
        }
      });

      // Under-wing / Internal Bay GBU-27 Bunker-Buster Bomb (Olive/Slate casing + Yellow live-ordnance band + Paveway seeker tip)
      if (p.showWingMissiles !== false) {
        const my = side * 0.64 * r * W;
        pushTubeSegment3D(faces, proj, -0.48 * r * L + mSlide, my, zAir - 0.06 * r * H, 0, 0, 0.62 * r * L, 0.075 * r, 0.075 * r, '#475569', seamCol, 0.95, 0.08);
        pushTubeSegment3D(faces, proj, 0.10 * r * L + mSlide, my, zAir - 0.06 * r * H, 0, 0, 0.18 * r * L, 0.075 * r, 0.035 * r, '#eab308', seamCol, 0.9, 0.10);
      }
    }

    // 1. Sharp Swept F-117A Faceted Stealth Delta Wings (with W-shaped trailing edge matching usa_stealth_fighter_diorama_ref.png!)
    const wingBot = [
      [-0.86 * r * L, 0, zAir],
      [-1.04 * r * L, -0.44 * r * W, zAir],
      [-0.82 * r * L, -1.28 * r * W, zAir],
      [0.36 * r * L, -0.36 * r * W, zAir],
      [1.38 * r * L, 0, zAir],
      [0.36 * r * L, 0.36 * r * W, zAir],
      [-0.82 * r * L, 1.28 * r * W, zAir],
      [-1.04 * r * L, 0.44 * r * W, zAir]
    ];
    const wingTop = wingBot.map((pt) => [pt[0], pt[1], zAir + 0.11 * r * H]);
    pushFrustumFaces(faces, proj, wingBot, wingTop, armorBase, seamCol, 1.2, 0.20);

    // 2. Angular Pyramid Faceted Stealth Fuselage Spine
    const fuseBot = [
      [-0.92 * r * L, -0.36 * r * W, zAir + 0.11 * r * H],
      [0.36 * r * L, -0.34 * r * W, zAir + 0.11 * r * H],
      [1.26 * r * L, 0, zAir + 0.11 * r * H],
      [0.36 * r * L, 0.34 * r * W, zAir + 0.11 * r * H],
      [-0.92 * r * L, 0.36 * r * W, zAir + 0.11 * r * H]
    ];
    const fuseTop = [
      [-0.56 * r * L, -0.14 * r * W, zAir + 0.44 * r * H],
      [0.10 * r * L, -0.16 * r * W, zAir + 0.48 * r * H],
      [0.64 * r * L, 0, zAir + 0.42 * r * H],
      [0.10 * r * L, 0.16 * r * W, zAir + 0.48 * r * H],
      [-0.56 * r * L, 0.14 * r * W, zAir + 0.44 * r * H]
    ];
    pushFrustumFaces(faces, proj, fuseBot, fuseTop, armorHi, seamCol, 1.2, 0.55);

    // 3. Faceted Stealth Ridge Lines, Gridded Over-Wing Intakes, FLIR Sensor Well, Twin Pitot Prongs & 5-Pane Serrated Golden Canopy
    const canDepth = proj.project(0.38 * r * L, 0, zAir + 0.48 * r * H).depth + 0.88;
    faces.push({
      depth: canDepth,
      customDraw(c) {
        // Twin Nose Pitot Prongs at Diamond Apex
        for (const side of [-1, 1]) {
          drawLine3D(c, proj, 1.34 * r * L, side * 0.05 * r * W, zAir + 0.08 * r * H, 1.56 * r * L, side * 0.05 * r * W, zAir + 0.08 * r * H, seamCol, 1.3);
        }

        // Faceted Stealth Wing Triangles & Diagonal Ridge Seams
        for (const side of [-1, 1]) {
          const outerFacet = [
            proj.project(0.36 * r * L, side * 0.36 * r * W, zAir + 0.115 * r * H),
            proj.project(-0.82 * r * L, side * 1.28 * r * W, zAir + 0.115 * r * H),
            proj.project(-0.94 * r * L, side * 0.78 * r * W, zAir + 0.115 * r * H)
          ];
          drawPolyPts(c, outerFacet, armorDark, seamCol, 0.95);

          // Ridge crease from fuselage shoulder to wingtip & trailing edge
          drawLine3D(c, proj, 0.10 * r * L, side * 0.16 * r * W, zAir + 0.48 * r * H, 0.36 * r * L, side * 0.34 * r * W, zAir + 0.12 * r * H, seamCol, 1.05);
          drawLine3D(c, proj, -0.56 * r * L, side * 0.14 * r * W, zAir + 0.44 * r * H, -0.92 * r * L, side * 0.36 * r * W, zAir + 0.12 * r * H, seamCol, 1.05);

          // Gridded Over-Wing Engine Intake Grille flanking the cockpit pyramid
          const intakePts = [
            proj.project(0.08 * r * L, side * 0.20 * r * W, zAir + 0.26 * r * H),
            proj.project(0.30 * r * L, side * 0.28 * r * W, zAir + 0.18 * r * H),
            proj.project(0.16 * r * L, side * 0.32 * r * W, zAir + 0.14 * r * H),
            proj.project(-0.04 * r * L, side * 0.24 * r * W, zAir + 0.22 * r * H)
          ];
          drawPolyPts(c, intakePts, '#0f172a', seamCol, 1.0);

          // Wide Flat Slot-Type Stealth Exhaust Trough at Trailing Edge
          drawLine3D(c, proj, -0.88 * r * L, side * 0.08 * r * W, zAir + 0.12 * r * H, -1.00 * r * L, side * 0.40 * r * W, zAir + 0.12 * r * H, '#0f172a', 2.4);
        }

        // Central Nose Spine Ridge Line & Recessed Golden FLIR Sensor Well ahead of Canopy
        drawLine3D(c, proj, 0.64 * r * L, 0, zAir + 0.42 * r * H, 1.38 * r * L, 0, zAir + 0.11 * r * H, seamCol, 1.15);
        const flirPt = proj.project(0.84 * r * L, 0, zAir + 0.29 * r * H);
        c.fillStyle = glassCol;
        c.strokeStyle = seamCol;
        c.lineWidth = 0.9;
        c.beginPath();
        c.arc(flirPt.x, flirPt.y, Math.max(1.6, 0.065 * r), 0, Math.PI * 2);
        c.fill();
        c.stroke();

        // Red Rescue/Danger Triangle Marking below Cockpit Cheek
        const redPt = proj.project(0.52 * r * L, -0.22 * r * W, zAir + 0.22 * r * H);
        c.fillStyle = '#dc2626';
        c.beginPath();
        c.arc(redPt.x, redPt.y, Math.max(1.5, 0.055 * r), 0, Math.PI * 2);
        c.fill();

        // 5-Pane Serrated Golden-Amber Stealth Canopy (Front V-Panes + Side Trapezoid Panes)
        for (const side of [-1, 1]) {
          const frontPane = [
            [0.34 * r * L, side * 0.02 * r * W, zAir + 0.45 * r * H],
            [0.34 * r * L, side * 0.18 * r * W, zAir + 0.27 * r * H],
            [0.64 * r * L, side * 0.11 * r * W, zAir + 0.23 * r * H],
            [0.62 * r * L, side * 0.02 * r * W, zAir + 0.41 * r * H]
          ];
          const sidePane = [
            [0.06 * r * L, side * 0.03 * r * W, zAir + 0.47 * r * H],
            [0.06 * r * L, side * 0.21 * r * W, zAir + 0.28 * r * H],
            [0.31 * r * L, side * 0.18 * r * W, zAir + 0.27 * r * H],
            [0.31 * r * L, side * 0.03 * r * W, zAir + 0.45 * r * H]
          ];
          drawGlassPane3D(c, proj, sidePane, glassCol, seamCol, 1.1);
          drawGlassPane3D(c, proj, frontPane, '#fbbf24', seamCol, 1.1);
        }
      }
    });

    // 4. Canted V-Tail Butterfly Stabilizers
    for (const side of [-1, 1]) {
      const yBase = side * 0.18 * r * W;
      const yTip = side * 0.44 * r * W;
      const finPts = [
        proj.project(-0.96 * r * L, yBase, zAir + 0.14 * r * H),
        proj.project(-0.48 * r * L, yBase, zAir + 0.18 * r * H),
        proj.project(-0.66 * r * L, yTip, zAir + 0.66 * r * H),
        proj.project(-0.98 * r * L, yTip, zAir + 0.62 * r * H)
      ];
      faces.push({
        depth: proj.project(-0.74 * r * L, yTip, zAir + 0.46 * r * H).depth + 1.05,
        customDraw(c) {
          drawPolyPts(c, finPts, armorDark, seamCol, 1.15);
          drawLine3D(c, proj, -0.78 * r * L, yBase, zAir + 0.16 * r * H, -0.82 * r * L, yTip, zAir + 0.64 * r * H, seamCol, 0.95);
        }
      });
    }

    flushFaces(ctx, faces);
  }


  // ==========================================================================
  // 12C. Dedicated 3D China & GLA Vehicle and Aircraft Renderers
  // ==========================================================================
  function createFactionSchema(groupTitle, specificControls) {
    const norm = (arr) => arr.map((c) => Object.assign({}, c, {
      type: c.type === 'toggle' ? 'checkbox' : (c.type || 'range')
    }));
    return [
      {
        group: '1. Chassis & Hull Proportions',
        fields: norm([
          { key: 'hullScale',      label: 'Overall Model Scale', min: 0.80, max: 1.25, step: 0.01, default: 1.00 },
          { key: 'hullLength',     label: 'Hull Length Scale',   min: 0.80, max: 1.25, step: 0.01, default: 1.00 },
          { key: 'hullWidth',      label: 'Hull Width Scale',    min: 0.80, max: 1.25, step: 0.01, default: 1.00 },
          { key: 'extrusionDepth', label: 'Vertical Relief (3D)', min: 0.80, max: 1.30, step: 0.01, default: 1.00 }
        ])
      },
      {
        group: `2. ${groupTitle}`,
        fields: norm(specificControls)
      },
      {
        group: '3. Running Gear & Mobility',
        fields: norm([
          { key: 'trackWidth',  label: 'Track / Tire Width', min: 0.75, max: 1.35, step: 0.01, default: 1.00 },
          { key: 'skirtHeight', label: 'Side Skirt / Armor', min: 0.50, max: 1.35, step: 0.01, default: 1.00 }
        ])
      },
      {
        group: '4. Tactical Kit & Upgrades',
        fields: norm([
          { key: 'ShowFactionEmblem', label: 'Show Faction Insignia', type: 'checkbox', default: true },
          { key: 'ShowUpgradeKit',    label: 'Field Upgrade Kit',     type: 'checkbox', default: true },
          { key: 'ShowHazardBeacons', label: 'Tactical Beacons / LEDs', type: 'checkbox', default: true }
        ])
      },
      {
        group: '5. Surface & Ligne-Claire Palette',
        fields: norm([
          { key: 'armorBaseColor',      label: 'Primary Armor Tone', type: 'color', default: '#9c6e4e' },
          { key: 'armorHighlightColor', label: 'Sunlit Deck Tone',   type: 'color', default: '#b88662' },
          { key: 'armorShadowColor',    label: 'Shadow Flank Tone',  type: 'color', default: '#6e4a32' },
          { key: 'houseColor',          label: 'Faction Trim Color', type: 'color', default: '#dc2626' }
        ])
      }
    ];
  }


  function createFactionPresets(unitName, p1, p2, p3, p4) {
    return {
      DIORAMA_DEFAULT: { name: `${unitName} (Standard Issue)`, params: {} },
      ASSAULT_SPEC:    { name: p1.name, params: p1.params },
      FORTIFIED_SPEC:  { name: p2.name, params: p2.params },
      VETERAN_SPEC:    { name: p3.name, params: p3.params },
      ELITE_SPEC:      { name: p4.name, params: p4.params }
    };
  }

  const CHINA_TANK_PARAM_SCHEMA = createFactionSchema('Turret & Primary Weapon System', [
    { key: 'turretScale',  label: 'Turret / Mount Scale', min: 0.80, max: 1.30, step: 0.01, default: 1.00 },
    { key: 'barrelLength', label: 'Weapon Barrel Length', min: 0.75, max: 1.35, step: 0.01, default: 1.00 },
    { key: 'ShowAutoloader', label: 'Autoloader / Drum Pod', type: 'toggle', default: true }
  ]);
  const CHINA_TANK_PRESETS = createFactionPresets('PLA Armored Tank',
    { name: 'Red Army Breakthrough', params: { turretScale: 1.08, barrelLength: 1.15, ShowAutoloader: true } },
    { name: 'Nationalism Horde Spec', params: { hullWidth: 1.08, ShowFactionEmblem: true, ShowUpgradeKit: true } },
    { name: 'Depleted Uranium Spec', params: { barrelLength: 1.22, armorBaseColor: '#7c8464', houseColor: '#84cc16' } },
    { name: 'General Kwai Red Guard Division', params: { hullScale: 1.08, turretScale: 1.12, extrusionDepth: 1.12 } }
  );

  const CHINA_ARTILLERY_PARAM_SCHEMA = createFactionSchema('Ordnance & Stabilizer System', [
    { key: 'barrelLength',  label: 'Ordnance Tube Length', min: 0.80, max: 1.40, step: 0.01, default: 1.00 },
    { key: 'gunElevation',  label: 'Firing Elevation (rad)', min: 0.15, max: 0.85, step: 0.01, default: 0.45 },
    { key: 'DeployOutriggers', label: 'Deploy Stabilizer Spades', type: 'toggle', default: true }
  ]);
  const CHINA_ARTILLERY_PRESETS = createFactionPresets('PLA Siege Artillery',
    { name: 'Black Napalm Firestorm', params: { barrelLength: 1.15, gunElevation: 0.54, houseColor: '#f97316' } },
    { name: 'Deployed Siege Battery', params: { DeployOutriggers: true, hullWidth: 1.10, gunElevation: 0.62 } },
    { name: 'Neutron Shell Spec', params: { barrelLength: 1.25, armorBaseColor: '#7a8262', houseColor: '#84cc16' } },
    { name: 'General Tao Tactical Nuke', params: { hullScale: 1.10, barrelLength: 1.28, extrusionDepth: 1.15 } }
  );

  const CHINA_WHEELED_PARAM_SCHEMA = createFactionSchema('Superstructure & Payload Bay', [
    { key: 'cargoScale',   label: 'Payload / Bay Volume', min: 0.80, max: 1.30, step: 0.01, default: 1.00 },
    { key: 'antennaScale', label: 'Mast / Dish Height',   min: 0.75, max: 1.40, step: 0.01, default: 1.00 }
  ]);
  const CHINA_WHEELED_PRESETS = createFactionPresets('PLA Tactical Transport',
    { name: 'Heavy Red Guard Convoy', params: { cargoScale: 1.14, hullLength: 1.08 } },
    { name: 'Stealth Telemetry Array', params: { antennaScale: 1.25, ShowHazardBeacons: true } },
    { name: 'General Fai Assault Spec', params: { hullWidth: 1.10, cargoScale: 1.12, houseColor: '#dc2626' } },
    { name: 'Up-Armored Command Carrier', params: { hullScale: 1.08, extrusionDepth: 1.14, antennaScale: 1.18 } }
  );

  const HELIX_PARAM_SCHEMA = createFactionSchema('Coaxial Rotors & Underbelly Pod', [
    { key: 'rotorScale',  label: 'Coaxial Rotor Span', min: 0.80, max: 1.30, step: 0.01, default: 1.00 },
    { key: 'podScale',    label: 'Underbelly Module Scale', min: 0.75, max: 1.35, step: 0.01, default: 1.00 },
    { key: 'ShowChinGun', label: 'Chin Cannon Turret', type: 'toggle', default: true }
  ]);
  const HELIX_PRESETS = createFactionPresets('Ka-58 Helix Gunship',
    { name: 'Concrete Bunker Pod', params: { podScale: 1.22, extrusionDepth: 1.12 } },
    { name: 'Overlord Gattling Pod', params: { ShowChinGun: true, podScale: 1.12, rotorScale: 1.08 } },
    { name: 'Propaganda Speaker Tower', params: { podScale: 1.18, ShowHazardBeacons: true, houseColor: '#ef4444' } },
    { name: 'Napalm Bomb Bay Spec', params: { hullScale: 1.08, rotorScale: 1.15, houseColor: '#f97316' } }
  );

  const MIG_PARAM_SCHEMA = createFactionSchema('Delta Wing & Afterburner Array', [
    { key: 'wingSpan',    label: 'Delta Wing Span',   min: 0.80, max: 1.30, step: 0.01, default: 1.00 },
    { key: 'canardScale', label: 'Forward Canard Size', min: 0.75, max: 1.35, step: 0.01, default: 1.00 },
    { key: 'ShowNapalmPods', label: 'Underwing Napalm Pods', type: 'toggle', default: true }
  ]);
  const MIG_PRESETS = createFactionPresets('MiG-1.44 Strike Fighter',
    { name: 'Black Napalm Firestorm', params: { ShowNapalmPods: true, houseColor: '#f97316' } },
    { name: 'MiG Armor Plating Upgrade', params: { hullWidth: 1.12, wingSpan: 1.10, extrusionDepth: 1.12 } },
    { name: 'Supersonic Interceptor', params: { hullLength: 1.14, canardScale: 1.18 } },
    { name: 'General Tao Tactical Nuke MiG', params: { armorBaseColor: '#7c8464', houseColor: '#84cc16', ShowNapalmPods: true } }
  );

  const GLA_TANK_PARAM_SCHEMA = createFactionSchema('Salvage Turret & Ordnance', [
    { key: 'turretScale',  label: 'Turret / Mount Scale', min: 0.80, max: 1.30, step: 0.01, default: 1.00 },
    { key: 'barrelLength', label: 'Cannon / Tube Length', min: 0.75, max: 1.35, step: 0.01, default: 1.00 },
    { key: 'ScrapLevel',   label: 'Salvage Up-Armor Plates', type: 'toggle', default: true }
  ]);
  const GLA_TANK_PRESETS = createFactionPresets('GLA Armored Vehicle',
    { name: 'Scorpion Rocket / Salvage Tier 1', params: { ShowUpgradeKit: true, barrelLength: 1.12 } },
    { name: 'Double-Scrap Salvage Tier 2', params: { ScrapLevel: true, turretScale: 1.15, barrelLength: 1.20 } },
    { name: 'Anthrax Beta / Gamma Infusion', params: { houseColor: '#65a30d', ShowHazardBeacons: true } },
    { name: 'Prince Kassad Camo Net Spec', params: { hullHeight: 0.92, armorBaseColor: '#a89060', houseColor: '#4d7c0f' } }
  );

  const GLA_WHEELED_PARAM_SCHEMA = createFactionSchema('Chassis Cage & Mounted Ordnance', [
    { key: 'weaponScale',  label: 'Mounted Weapon Scale', min: 0.80, max: 1.35, step: 0.01, default: 1.00 },
    { key: 'payloadPitch', label: 'Launcher / Mount Pitch', min: 0.05, max: 0.75, step: 0.01, default: 0.34 }
  ]);
  const GLA_WHEELED_PRESETS = createFactionPresets('GLA Strike Vehicle',
    { name: 'Salvage Tier 1 Up-Gun', params: { weaponScale: 1.15, ShowUpgradeKit: true } },
    { name: 'Salvage Tier 2 Heavy Ordnance', params: { weaponScale: 1.26, hullWidth: 1.10 } },
    { name: 'Anthrax Gamma Warhead', params: { payloadPitch: 0.48, houseColor: '#65a30d' } },
    { name: 'General Juhziz High-Explosive Spec', params: { hullScale: 1.08, weaponScale: 1.22, houseColor: '#dc2626' } }
  );

  function renderChinaTankModel(ctx, u, faction, customParams, options) {
    const p = Object.assign({
      hullScale: 1.0, hullLength: 1.0, hullWidth: 1.0, extrusionDepth: 1.0,
      turretScale: 1.0, barrelLength: 1.0, trackWidth: 1.0, skirtHeight: 1.0,
      ShowFactionEmblem: true, ShowUpgradeKit: true, ShowAutoloader: true,
      armorBaseColor: '#9c6e4e', armorHighlightColor: '#b88662', armorShadowColor: '#6e4a32', houseColor: '#dc2626'
    }, customParams || {});
    const opts = options || {};
    const defId = String((u && u.defId) || 'CHINA_BATTLEMASTER');
    const isNuke = defId.includes('NUKE');
    const rawR = (u && u.radius) || 18;
    const r = rawR * (p.hullScale || 1.0);
    const L = p.hullLength || 1.0, W = p.hullWidth || 1.0, H = p.extrusionDepth || 1.0;
    const TS = p.turretScale || 1.0, BL = p.barrelLength || 1.0;

    const hullAngle = (u && u.angle !== undefined) ? u.angle : 0;
    const turretAngle = (u && u.turretAngle !== undefined) ? u.turretAngle : hullAngle;
    const treadPhase = (u && u.treadPhase) || 0;
    const recoil = (u && u.recoilOffset) || 0;
    const pitchScale = opts.pitchScale !== undefined ? opts.pitchScale : 1.0;
    const zScale = opts.zScale !== undefined ? opts.zScale : 0.42;

    const armorBase = isNuke ? '#848c6a' : (p.armorBaseColor || '#9c6e4e');
    const armorHi   = isNuke ? '#9ea882' : (p.armorHighlightColor || '#b88662');
    const armorDark = isNuke ? '#586046' : (p.armorShadowColor || '#6e4a32');
    const crimson   = isNuke ? '#84cc16' : (p.houseColor || '#dc2626');
    const seamCol   = '#241a14';

    const hullProj = createProjector(hullAngle, pitchScale, zScale, 0, 0, 0, 0);
    const shadowPts = [
      hullProj.project(-1.12 * r * L, -0.86 * r * W, 0),
      hullProj.project( 1.12 * r * L, -0.86 * r * W, 0),
      hullProj.project( 1.12 * r * L,  0.86 * r * W, 0),
      hullProj.project(-1.12 * r * L,  0.86 * r * W, 0)
    ].map((pt) => ({ x: pt.x + 3.0, y: pt.y + 4.0 }));
    drawPolyPts(ctx, shadowPts, 'rgba(60, 44, 34, 0.36)', null, 0);

    const hullFaces = [];
    pushTrackedSuspension3D(hullFaces, hullProj, r, -1.06 * r * L, 1.06 * r * L, 0.46 * r * W, 0.82 * r * W, 0.25 * r * H, 6, armorDark, seamCol, treadPhase, true, -2.0);
    pushBox3D(hullFaces, hullProj, -1.06 * r * L, 1.04 * r * L, -0.78 * r * W, 0.78 * r * W, 0.16 * r * H, 0.46 * r * H, armorBase, seamCol, 1.15, 0, 0.10 * r * L, 0.06 * r * W);
    // Rear Twin External Fuel Drums / Engine Deck
    pushBox3D(hullFaces, hullProj, -1.16 * r * L, -0.88 * r * L, -0.62 * r * W, 0.62 * r * W, 0.26 * r * H, 0.50 * r * H, armorDark, seamCol, 1.05, 0.3);

    if (defId === 'CHINA_DRAGON_TANK') {
      // Twin pressurized crimson napalm tanks mounted on rear deck
      for (const side of [-1, 1]) {
        pushBox3D(hullFaces, hullProj, -0.96 * r * L, -0.24 * r * L, side * 0.16 * r * W, side * 0.68 * r * W, 0.46 * r * H, 0.76 * r * H, '#dc2626', seamCol, 1.1, 0.55);
      }
    }
    flushFaces(ctx, hullFaces);

    const turProj = createProjector(turretAngle, pitchScale, zScale, 0.06 * r * L, 0, 0, hullAngle);
    const turFaces = [];
    const zTurBot = 0.46 * r * H;
    const zTurTop = 0.80 * r * H;
    const recDist = clamp(recoil * 0.04 * r, 0, 0.22 * r);

    if (defId === 'CHINA_DRAGON_TANK') {
      pushCylinderZ3D(turFaces, turProj, 0.10 * r * L, 0, zTurBot, zTurTop, 0.44 * r * TS, 0.36 * r * TS, 10, armorHi, seamCol, 1.15, 1.0);
      pushTubeSegment3D(turFaces, turProj, 0.32 * r * TS, 0, (zTurBot + zTurTop) * 0.52, 0.04, 0, 0.92 * r * BL, 0.12 * r, 0.16 * r, '#dc2626', seamCol, 1.15, 1.4);
      if (recoil > 0.4) {
        pushTubeSegment3D(turFaces, turProj, (0.32 + 0.92 * BL) * r, 0, (zTurBot + zTurTop) * 0.54, 0.04, 0, 0.65 * r, 0.18 * r, 0.36 * r, '#f97316', '#ea580c', 0.8, 1.8);
      }
    } else if (defId === 'CHINA_GATTLING_TANK') {
      pushBox3D(turFaces, turProj, -0.44 * r * TS, 0.42 * r * TS, -0.48 * r * TS, 0.48 * r * TS, zTurBot, zTurTop, armorHi, seamCol, 1.15, 1.0, 0.06 * r, 0.06 * r);
      for (const side of [-1, 1]) {
        const gy = side * 0.54 * r * TS;
        pushBox3D(turFaces, turProj, -0.18 * r * TS, 0.28 * r * TS, gy - 0.12 * r, gy + 0.12 * r, zTurBot + 0.04 * r * H, zTurTop - 0.02 * r * H, crimson, seamCol, 1.05, 1.2);
        pushTubeSegment3D(turFaces, turProj, 0.24 * r * TS - recDist, gy, (zTurBot + zTurTop) * 0.52, 0.08, 0, 0.96 * r * BL, 0.10 * r, 0.09 * r, '#475569', seamCol, 1.1, 1.45);
      }
      // Roof Spinning Radar Dish
      pushBox3D(turFaces, turProj, -0.32 * r * TS, -0.14 * r * TS, -0.34 * r * TS, 0.34 * r * TS, zTurTop, zTurTop + 0.22 * r * H, '#e2e8f0', seamCol, 1.05, 1.6);
    } else if (defId === 'CHINA_ECM_TANK') {
      pushCylinderZ3D(turFaces, turProj, 0, 0, zTurBot, zTurTop - 0.06 * r * H, 0.48 * r * TS, 0.40 * r * TS, 10, armorHi, seamCol, 1.15, 1.0);
      pushBox3D(turFaces, turProj, -0.14 * r * TS, 0.22 * r * TS, -0.58 * r * TS, 0.58 * r * TS, zTurTop - 0.04 * r * H, zTurTop + 0.38 * r * H, '#10b981', seamCol, 1.15, 1.45, 0.04 * r, 0.08 * r);
    } else {
      // Type-98 Battlemaster / Nuclear Battlemaster Rounded Cast Turret + 125mm Cannon
      pushCylinderZ3D(turFaces, turProj, 0, 0, zTurBot, zTurTop, 0.54 * r * TS, 0.44 * r * TS, 12, armorHi, seamCol, 1.18, 1.0);
      if (p.ShowAutoloader !== false) {
        pushBox3D(turFaces, turProj, -0.68 * r * TS, -0.28 * r * TS, -0.36 * r * TS, 0.36 * r * TS, zTurBot + 0.04 * r * H, zTurTop - 0.02 * r * H, crimson, seamCol, 1.1, 1.15);
      }
      pushTubeSegment3D(turFaces, turProj, 0.36 * r * TS - recDist, 0, (zTurBot + zTurTop) * 0.52, 0.03, 0, 1.18 * r * BL, 0.10 * r, 0.085 * r, armorBase, seamCol, 1.15, 1.45);
      pushTubeSegment3D(turFaces, turProj, 0.64 * r * TS - recDist, 0, (zTurBot + zTurTop) * 0.53, 0.03, 0, 0.28 * r * BL, 0.135 * r, 0.135 * r, crimson, seamCol, 1.1, 1.55);
    }
    flushFaces(ctx, turFaces);
  }

  function renderChinaArtilleryModel(ctx, u, faction, customParams, options) {
    const p = Object.assign({
      hullScale: 1.0, hullLength: 1.0, hullWidth: 1.0, extrusionDepth: 1.0,
      barrelLength: 1.0, gunElevation: 0.45, DeployOutriggers: true,
      armorBaseColor: '#9c6e4e', armorHighlightColor: '#b88662', armorShadowColor: '#6e4a32', houseColor: '#dc2626'
    }, customParams || {});
    const opts = options || {};
    const defId = String((u && u.defId) || 'CHINA_INFERNO_CANNON');
    const isNuke = defId === 'CHINA_NUKE_CANNON';
    const rawR = (u && u.radius) || (isNuke ? 22 : 18);
    const r = rawR * (p.hullScale || 1.0);
    const L = (p.hullLength || 1.0) * (isNuke ? 1.15 : 1.0);
    const W = p.hullWidth || 1.0, H = p.extrusionDepth || 1.0, BL = p.barrelLength || 1.0;

    const hullAngle = (u && u.angle !== undefined) ? u.angle : 0;
    const turretAngle = (u && u.turretAngle !== undefined) ? u.turretAngle : hullAngle;
    const treadPhase = (u && u.treadPhase) || 0;
    const recoil = (u && u.recoilOffset) || 0;
    const pitchScale = opts.pitchScale !== undefined ? opts.pitchScale : 1.0;
    const zScale = opts.zScale !== undefined ? opts.zScale : 0.42;

    const armorBase = isNuke ? '#84886c' : (p.armorBaseColor || '#9c6e4e');
    const armorHi   = isNuke ? '#a0a686' : (p.armorHighlightColor || '#b88662');
    const armorDark = isNuke ? '#565a46' : (p.armorShadowColor || '#6e4a32');
    const crimson   = p.houseColor || '#dc2626';
    const seamCol   = '#241a14';

    const hullProj = createProjector(hullAngle, pitchScale, zScale, 0, 0, 0, 0);
    const shadowPts = [
      hullProj.project(-1.18 * r * L, -0.88 * r * W, 0),
      hullProj.project( 1.18 * r * L, -0.88 * r * W, 0),
      hullProj.project( 1.18 * r * L,  0.88 * r * W, 0),
      hullProj.project(-1.18 * r * L,  0.88 * r * W, 0)
    ].map((pt) => ({ x: pt.x + 3.2, y: pt.y + 4.2 }));
    drawPolyPts(ctx, shadowPts, 'rgba(60, 44, 34, 0.36)', null, 0);

    const hullFaces = [];
    pushTrackedSuspension3D(hullFaces, hullProj, r, -1.10 * r * L, 1.10 * r * L, 0.48 * r * W, 0.84 * r * W, 0.25 * r * H, isNuke ? 7 : 6, armorDark, seamCol, treadPhase, true, -2.0);

    if (isNuke || p.DeployOutriggers) {
      for (const sx of [-0.72 * r * L, 0.72 * r * L]) {
        for (const sy of [-1, 1]) {
          pushBox3D(hullFaces, hullProj, sx - 0.14 * r, sx + 0.14 * r, sy * 0.82 * r * W, sy * 1.12 * r * W, 0.04 * r * H, 0.16 * r * H, crimson, seamCol, 1.05, -1.2);
        }
      }
    }

    pushBox3D(hullFaces, hullProj, -1.08 * r * L, 1.08 * r * L, -0.80 * r * W, 0.80 * r * W, 0.16 * r * H, 0.44 * r * H, armorBase, seamCol, 1.15, 0, 0.08 * r * L, 0.05 * r * W);
    // Forward Armored Crew Cab
    pushBox3D(hullFaces, hullProj, 0.36 * r * L, 1.02 * r * L, -0.72 * r * W, 0.72 * r * W, 0.44 * r * H, 0.72 * r * H, armorHi, seamCol, 1.15, 0.35, 0.08 * r * L, 0.04 * r * W);
    flushFaces(ctx, hullFaces);

    const turProj = createProjector(turretAngle, pitchScale, zScale, -0.22 * r * L, 0, 0, hullAngle);
    const turFaces = [];
    const zBase = 0.44 * r * H;
    const recDist = clamp(recoil * 0.05 * r, 0, 0.28 * r);
    const elev = p.gunElevation || (isNuke ? 0.52 : 0.44);

    pushBox3D(turFaces, turProj, -0.46 * r, 0.38 * r, -0.48 * r * W, 0.48 * r * W, zBase, zBase + 0.42 * r * H, armorHi, seamCol, 1.15, 1.0, 0.06 * r, 0.06 * r);
    // Heavy Breech Sleeve + Long Siege Barrel
    pushTubeSegment3D(turFaces, turProj, -0.18 * r - recDist, 0, zBase + 0.28 * r * H, elev, 0, (isNuke ? 0.68 : 0.52) * r * BL, isNuke ? 0.20 * r : 0.15 * r, isNuke ? 0.18 * r : 0.14 * r, crimson, seamCol, 1.15, 1.35);
    pushTubeSegment3D(turFaces, turProj,  0.12 * r - recDist, 0, zBase + 0.36 * r * H, elev, 0, (isNuke ? 1.65 : 1.28) * r * BL, isNuke ? 0.13 * r : 0.095 * r, isNuke ? 0.12 * r : 0.085 * r, armorBase, seamCol, 1.2, 1.55);
    if (isNuke) {
      pushTubeSegment3D(turFaces, turProj, 0.68 * r - recDist, 0, zBase + 0.66 * r * H, elev, 0, 0.32 * r * BL, 0.16 * r, 0.16 * r, '#84cc16', seamCol, 1.1, 1.7);
    }
    flushFaces(ctx, turFaces);
  }

  function renderChinaWheeledModel(ctx, u, faction, customParams, options) {
    const p = Object.assign({
      hullScale: 1.0, hullLength: 1.0, hullWidth: 1.0, extrusionDepth: 1.0,
      cargoScale: 1.0, antennaScale: 1.0,
      armorBaseColor: '#9c6e4e', armorHighlightColor: '#b88662', armorShadowColor: '#6e4a32', houseColor: '#dc2626'
    }, customParams || {});
    const opts = options || {};
    const defId = String((u && u.defId) || 'CHINA_TROOP_CRAWLER');
    const rawR = (u && u.radius) || 17;
    const r = rawR * (p.hullScale || 1.0);
    const L = p.hullLength || 1.0, W = p.hullWidth || 1.0, H = p.extrusionDepth || 1.0;

    const hullAngle = (u && u.angle !== undefined) ? u.angle : 0;
    const turretAngle = (u && u.turretAngle !== undefined) ? u.turretAngle : hullAngle;
    const treadPhase = (u && u.treadPhase) || 0;
    const pitchScale = opts.pitchScale !== undefined ? opts.pitchScale : 1.0;
    const zScale = opts.zScale !== undefined ? opts.zScale : 0.42;

    const armorBase = p.armorBaseColor || '#9c6e4e';
    const armorHi   = p.armorHighlightColor || '#b88662';
    const crimson   = p.houseColor || '#dc2626';
    const seamCol   = '#241a14';

    const hullProj = createProjector(hullAngle, pitchScale, zScale, 0, 0, 0, 0);
    const shadowPts = [
      hullProj.project(-1.14 * r * L, -0.82 * r * W, 0),
      hullProj.project( 1.14 * r * L, -0.82 * r * W, 0),
      hullProj.project( 1.14 * r * L,  0.82 * r * W, 0),
      hullProj.project(-1.14 * r * L,  0.82 * r * W, 0)
    ].map((pt) => ({ x: pt.x + 3.0, y: pt.y + 4.0 }));
    drawPolyPts(ctx, shadowPts, 'rgba(60, 44, 34, 0.35)', null, 0);

    const faces = [];
    const axles = defId.includes('CRAWLER') ? [-0.78, -0.26, 0.26, 0.78] : [-0.66, 0.68];
    for (const ax of axles) {
      pushWheelAxle3D(faces, hullProj, ax * r * L, 0.64 * r * W, 0.30 * r, 0.22 * r * W, '#262320', '#7c543a', seamCol, treadPhase, -1.5);
    }

    if (defId === 'CHINA_SUPPLY_TRUCK') {
      // Forward Red/Tan Cab + Covered Olive Canvas Cargo Bed
      pushBox3D(faces, hullProj, -1.04 * r * L, 1.04 * r * L, -0.68 * r * W, 0.68 * r * W, 0.16 * r * H, 0.42 * r * H, armorBase, seamCol, 1.15, 0);
      pushBox3D(faces, hullProj, 0.28 * r * L, 1.02 * r * L, -0.64 * r * W, 0.64 * r * W, 0.42 * r * H, 0.92 * r * H, crimson, seamCol, 1.15, 0.35, 0.08 * r * L, 0.04 * r * W);
      pushBox3D(faces, hullProj, -1.04 * r * L, 0.22 * r * L, -0.72 * r * W, 0.72 * r * W, 0.42 * r * H, 1.06 * r * H * (p.cargoScale || 1.0), '#8c7a5b', seamCol, 1.15, 0.55, 0.04 * r * L, 0.04 * r * W);
    } else if (defId.includes('OUTPOST')) {
      // Stealth Reconnaissance Van + Rotating Roof Telemetry Dish
      pushBox3D(faces, hullProj, -1.04 * r * L, 1.04 * r * L, -0.70 * r * W, 0.70 * r * W, 0.18 * r * H, 0.88 * r * H, armorBase, seamCol, 1.15, 0, 0.10 * r * L, 0.06 * r * W);
      flushFaces(ctx, faces);
      const dishProj = createProjector(turretAngle + treadPhase * 2.5, pitchScale, zScale, -0.18 * r * L, 0, 0, hullAngle);
      const dishFaces = [];
      pushCylinderZ3D(dishFaces, dishProj, 0, 0, 0.88 * r * H, 1.08 * r * H, 0.18 * r, 0.14 * r, 8, crimson, seamCol, 1.05, 1.1);
      pushBox3D(dishFaces, dishProj, -0.12 * r, 0.16 * r, -0.54 * r * W * (p.antennaScale || 1.0), 0.54 * r * W * (p.antennaScale || 1.0), 1.04 * r * H, 1.38 * r * H, '#e2e8f0', seamCol, 1.1, 1.35);
      flushFaces(ctx, dishFaces);
      return;
    } else {
      // 8x8 Armored Troop Crawler APC + Roof Hatch & Radar Mast
      pushBox3D(faces, hullProj, -1.12 * r * L, 1.12 * r * L, -0.76 * r * W, 0.76 * r * W, 0.18 * r * H, 0.76 * r * H, armorBase, seamCol, 1.18, 0, 0.16 * r * L, 0.08 * r * W);
      pushBox3D(faces, hullProj, -0.62 * r * L, 0.54 * r * L, -0.52 * r * W, 0.52 * r * W, 0.76 * r * H, 0.96 * r * H, armorHi, seamCol, 1.12, 0.5, 0.08 * r * L, 0.06 * r * W);
      pushBox3D(faces, hullProj, 0.12 * r * L, 0.44 * r * L, -0.32 * r * W, 0.32 * r * W, 0.96 * r * H, 1.12 * r * H, crimson, seamCol, 1.05, 0.85);
    }

    flushFaces(ctx, faces);
  }

  function renderHelixModel(ctx, u, faction, customParams, options) {
    const p = Object.assign({
      hullScale: 1.0, hullLength: 1.0, hullWidth: 1.0, extrusionDepth: 1.0,
      rotorScale: 1.0, podScale: 1.0, ShowChinGun: true,
      armorBaseColor: '#9c6e4e', armorHighlightColor: '#b88662', armorShadowColor: '#6e4a32', houseColor: '#dc2626'
    }, customParams || {});
    const opts = options || {};
    const rawR = (u && u.radius) || 22;
    const r = rawR * (p.hullScale || 1.0);
    const L = p.hullLength || 1.0, W = p.hullWidth || 1.0, H = p.extrusionDepth || 1.0;
    const RS = p.rotorScale || 1.0, PS = p.podScale || 1.0;

    const hullAngle = (u && u.angle !== undefined) ? u.angle : 0;
    const phase = (u && u.treadPhase) || (typeof performance !== 'undefined' ? (performance.now() * 0.003) % 1 : 0);
    const hoverZ = Math.sin(phase * Math.PI * 2) * 0.05 * r;
    const pitchScale = opts.pitchScale !== undefined ? opts.pitchScale : 1.0;
    const zScale = opts.zScale !== undefined ? opts.zScale : 0.42;

    const armorBase = p.armorBaseColor || '#9c6e4e';
    const armorHi   = p.armorHighlightColor || '#b88662';
    const armorDark = p.armorShadowColor || '#6e4a32';
    const crimson   = p.houseColor || '#dc2626';
    const seamCol   = '#241a14';

    const proj = createProjector(hullAngle, pitchScale, zScale, 0, 0, 0, 0);
    const shadowPts = [
      proj.project(-1.18 * r * L, -0.82 * r * W, 0),
      proj.project( 1.18 * r * L, -0.82 * r * W, 0),
      proj.project( 1.18 * r * L,  0.82 * r * W, 0),
      proj.project(-1.18 * r * L,  0.82 * r * W, 0)
    ].map((pt) => ({ x: pt.x + 5.0, y: pt.y + 7.0 }));
    drawPolyPts(ctx, shadowPts, 'rgba(45, 34, 26, 0.30)', null, 0);

    const faces = [];
    const zAir = 0.36 * r * H + hoverZ;

    // 1. Underbelly Modular Bunker / Gattling / Napalm Pod
    pushBox3D(faces, proj, -0.46 * r * L * PS, 0.52 * r * L * PS, -0.56 * r * W * PS, 0.56 * r * W * PS, zAir - 0.24 * r * H, zAir + 0.04 * r * H, armorDark, seamCol, 1.15, -0.3, 0.06 * r, 0.06 * r);
    // 2. Main Heavy Gunship Fuselage & Stub Wings
    pushBox3D(faces, proj, -0.82 * r * L, 0.96 * r * L, -0.64 * r * W, 0.64 * r * W, zAir + 0.02 * r * H, zAir + 0.56 * r * H, armorBase, seamCol, 1.2, 0.2, 0.18 * r * L, 0.08 * r * W);
    pushBox3D(faces, proj, -0.24 * r * L, 0.32 * r * L, -1.24 * r * W, 1.24 * r * W, zAir + 0.18 * r * H, zAir + 0.32 * r * H, crimson, seamCol, 1.1, 0.35);
    // Tail Boom & Twin Fins
    pushBox3D(faces, proj, -1.48 * r * L, -0.78 * r * L, -0.24 * r * W, 0.24 * r * W, zAir + 0.20 * r * H, zAir + 0.46 * r * H, armorHi, seamCol, 1.15, 0.4);
    for (const side of [-1, 1]) {
      pushBox3D(faces, proj, -1.48 * r * L, -1.16 * r * L, side * 0.24 * r * W, side * 0.34 * r * W, zAir + 0.26 * r * H, zAir + 0.72 * r * H, crimson, seamCol, 1.05, 0.65);
    }
    if (p.ShowChinGun !== false) {
      pushTubeSegment3D(faces, proj, 0.88 * r * L, 0, zAir + 0.08 * r * H, -0.06, 0, 0.48 * r, 0.08 * r, 0.065 * r, '#334155', seamCol, 1.05, 0.75);
    }

    // 3. Coaxial Counter-Rotating Mast & Dual 4-Blade Rotors
    pushCylinderZ3D(faces, proj, 0.08 * r * L, 0, zAir + 0.56 * r * H, zAir + 0.98 * r * H, 0.16 * r, 0.12 * r, 8, '#334155', seamCol, 1.1, 1.1);
    flushFaces(ctx, faces);

    for (const [zOff, dir] of [[0.78, 1], [0.96, -1]]) {
      const rProj = createProjector(hullAngle + dir * phase * Math.PI * 4, pitchScale, zScale, 0.08 * r * L, 0, 0, hullAngle);
      const rFaces = [];
      pushBox3D(rFaces, rProj, -1.42 * r * RS, 1.42 * r * RS, -0.09 * r, 0.09 * r, zAir + zOff * r * H, zAir + (zOff + 0.04) * r * H, '#1e293b', seamCol, 1.0, 1.5);
      pushBox3D(rFaces, rProj, -0.09 * r, 0.09 * r, -1.42 * r * RS, 1.42 * r * RS, zAir + zOff * r * H, zAir + (zOff + 0.04) * r * H, crimson, seamCol, 1.0, 1.5);
      flushFaces(ctx, rFaces);
    }
  }

  function renderMigModel(ctx, u, faction, customParams, options) {
    const p = Object.assign({
      hullScale: 1.0, hullLength: 1.0, hullWidth: 1.0, extrusionDepth: 1.0,
      wingSpan: 1.0, canardScale: 1.0, ShowNapalmPods: true,
      armorBaseColor: '#a67b5b', armorHighlightColor: '#c29674', armorShadowColor: '#6e4e36', houseColor: '#dc2626'
    }, customParams || {});
    const opts = options || {};
    const defId = String((u && u.defId) || 'CHINA_MIG');
    const isNuke = defId.includes('NUKE');
    const rawR = (u && u.radius) || 19;
    const r = rawR * (p.hullScale || 1.0);
    const L = p.hullLength || 1.0, W = (p.hullWidth || 1.0) * (p.wingSpan || 1.0), H = p.extrusionDepth || 1.0;

    const hullAngle = (u && u.angle !== undefined) ? u.angle : 0;
    const phase = (u && u.treadPhase) || (typeof performance !== 'undefined' ? (performance.now() * 0.003) % 1 : 0);
    const hoverZ = Math.sin(phase * Math.PI * 2) * 0.045 * r;
    const pitchScale = opts.pitchScale !== undefined ? opts.pitchScale : 1.0;
    const zScale = opts.zScale !== undefined ? opts.zScale : 0.42;

    const armorBase = isNuke ? '#848c6a' : (p.armorBaseColor || '#a67b5b');
    const armorHi   = isNuke ? '#a2ab84' : (p.armorHighlightColor || '#c29674');
    const crimson   = isNuke ? '#84cc16' : (p.houseColor || '#dc2626');
    const seamCol   = '#241a14';

    const proj = createProjector(hullAngle, pitchScale, zScale, 0, 0, 0, 0);
    const shadowPts = [
      proj.project(-1.05 * r * L, -1.25 * r * W, 0),
      proj.project( 1.35 * r * L, 0, 0),
      proj.project(-1.05 * r * L,  1.25 * r * W, 0)
    ].map((pt) => ({ x: pt.x + 5.0, y: pt.y + 7.0 }));
    drawPolyPts(ctx, shadowPts, 'rgba(45, 34, 26, 0.30)', null, 0);

    const faces = [];
    const zAir = 0.32 * r * H + hoverZ;

    // 1. Swept Delta Wings + Forward Canards + Underwing Napalm/Nuke Missiles
    const wingBot = [
      [-0.92 * r * L, -1.28 * r * W, zAir],
      [ 0.24 * r * L, -0.32 * r * W, zAir],
      [ 1.38 * r * L,  0,            zAir],
      [ 0.24 * r * L,  0.32 * r * W, zAir],
      [-0.92 * r * L,  1.28 * r * W, zAir]
    ];
    const wingTop = wingBot.map((pt) => [pt[0], pt[1], zAir + 0.10 * r * H]);
    pushFrustumFaces(faces, proj, wingBot, wingTop, armorBase, seamCol, 1.18, 0.2);

    const CS = p.canardScale || 1.0;
    pushBox3D(faces, proj, 0.36 * r * L, 0.72 * r * L, -0.68 * r * W * CS, 0.68 * r * W * CS, zAir + 0.04 * r * H, zAir + 0.12 * r * H, crimson, seamCol, 1.05, 0.35);

    if (p.ShowNapalmPods !== false) {
      for (const side of [-1, 1]) {
        pushTubeSegment3D(faces, proj, -0.58 * r * L, side * 0.68 * r * W, zAir - 0.06 * r * H, 0, 0, 0.72 * r * L, 0.085 * r, 0.055 * r, crimson, seamCol, 1.0, 0.1);
      }
    }

    // 2. Central Supersonic Spine, Canopy & Twin Canted Tails
    pushBox3D(faces, proj, -1.04 * r * L, 0.92 * r * L, -0.26 * r * W, 0.26 * r * W, zAir + 0.10 * r * H, zAir + 0.38 * r * H, armorHi, seamCol, 1.15, 0.55, 0.24 * r * L, 0.06 * r * W);
    pushBox3D(faces, proj,  0.14 * r * L, 0.76 * r * L, -0.16 * r * W, 0.16 * r * W, zAir + 0.36 * r * H, zAir + 0.50 * r * H, '#38bdf8', seamCol, 1.1, 0.75, 0.12 * r * L, 0.04 * r * W);

    for (const side of [-1, 1]) {
      pushBox3D(faces, proj, -1.02 * r * L, -0.52 * r * L, side * 0.24 * r * W, side * 0.32 * r * W, zAir + 0.22 * r * H, zAir + 0.72 * r * H, crimson, seamCol, 1.1, 0.85);
      pushTubeSegment3D(faces, proj, -1.18 * r * L, side * 0.13 * r * W, zAir + 0.16 * r * H, 0, 0, 0.24 * r * L, 0.10 * r, 0.12 * r, isNuke ? '#84cc16' : '#f97316', seamCol, 1.0, 0.45);
    }

    flushFaces(ctx, faces);
  }

  function renderGlaTankModel(ctx, u, faction, customParams, options) {
    const p = Object.assign({
      hullScale: 1.0, hullLength: 1.0, hullWidth: 1.0, extrusionDepth: 1.0,
      turretScale: 1.0, barrelLength: 1.0, ScrapLevel: true, ShowUpgradeKit: true,
      armorBaseColor: '#c4ab72', armorHighlightColor: '#dcbf84', armorShadowColor: '#8c7444', houseColor: '#587838'
    }, customParams || {});
    const opts = options || {};
    const defId = String((u && u.defId) || 'GLA_SCORPION');
    const rawR = (u && u.radius) || 18;
    const r = rawR * (p.hullScale || 1.0);
    const L = p.hullLength || 1.0, W = p.hullWidth || 1.0, H = p.extrusionDepth || 1.0;
    const TS = p.turretScale || 1.0, BL = p.barrelLength || 1.0;

    const hullAngle = (u && u.angle !== undefined) ? u.angle : 0;
    const turretAngle = (u && u.turretAngle !== undefined) ? u.turretAngle : hullAngle;
    const treadPhase = (u && u.treadPhase) || 0;
    const recoil = (u && u.recoilOffset) || 0;
    const pitchScale = opts.pitchScale !== undefined ? opts.pitchScale : 1.0;
    const zScale = opts.zScale !== undefined ? opts.zScale : 0.42;

    const sandBase = p.armorBaseColor || '#c4ab72';
    const sandHi   = p.armorHighlightColor || '#dcbf84';
    const sandDark = p.armorShadowColor || '#8c7444';
    const olive    = p.houseColor || '#587838';
    const seamCol  = '#241c12';

    const hullProj = createProjector(hullAngle, pitchScale, zScale, 0, 0, 0, 0);
    const shadowPts = [
      hullProj.project(-1.10 * r * L, -0.82 * r * W, 0),
      hullProj.project( 1.10 * r * L, -0.82 * r * W, 0),
      hullProj.project( 1.10 * r * L,  0.82 * r * W, 0),
      hullProj.project(-1.10 * r * L,  0.82 * r * W, 0)
    ].map((pt) => ({ x: pt.x + 3.0, y: pt.y + 4.0 }));
    drawPolyPts(ctx, shadowPts, 'rgba(60, 48, 32, 0.35)', null, 0);

    const hullFaces = [];
    pushTrackedSuspension3D(hullFaces, hullProj, r, -1.04 * r * L, 1.04 * r * L, 0.46 * r * W, 0.80 * r * W, 0.24 * r * H, 5, sandDark, seamCol, treadPhase, true, -2.0);
    pushBox3D(hullFaces, hullProj, -1.02 * r * L, 1.02 * r * L, -0.76 * r * W, 0.76 * r * W, 0.16 * r * H, 0.44 * r * H, sandBase, seamCol, 1.15, 0, 0.10 * r * L, 0.05 * r * W);

    if (defId === 'GLA_MARAUDER') {
      // Front Salvage Scrap Dozer Shield
      pushBox3D(hullFaces, hullProj, 0.96 * r * L, 1.14 * r * L, -0.84 * r * W, 0.84 * r * W, 0.12 * r * H, 0.42 * r * H, olive, seamCol, 1.15, 0.45);
    } else if (defId === 'GLA_TOXIN_TRACTOR') {
      // Twin Glowing Lime-Green Anthrax Vats on Rear Deck
      for (const side of [-1, 1]) {
        pushBox3D(hullFaces, hullProj, -0.94 * r * L, -0.12 * r * L, side * 0.14 * r * W, side * 0.70 * r * W, 0.44 * r * H, 0.78 * r * H, '#65a30d', seamCol, 1.15, 0.55);
      }
    }
    flushFaces(ctx, hullFaces);

    const turProj = createProjector(turretAngle, pitchScale, zScale, 0.02 * r * L, 0, 0, hullAngle);
    const turFaces = [];
    const zTurBot = 0.44 * r * H;
    const zTurTop = 0.78 * r * H;
    const recDist = clamp(recoil * 0.04 * r, 0, 0.22 * r);

    if (defId === 'GLA_QUAD_CANNON') {
      pushBox3D(turFaces, turProj, -0.44 * r * TS, 0.36 * r * TS, -0.48 * r * TS, 0.48 * r * TS, zTurBot, zTurTop + 0.12 * r * H, olive, seamCol, 1.15, 1.0, 0.05 * r, 0.05 * r);
      for (const sy of [-0.22 * r * TS, 0.22 * r * TS]) {
        for (const sz of [zTurBot + 0.14 * r * H, zTurBot + 0.32 * r * H]) {
          pushTubeSegment3D(turFaces, turProj, 0.18 * r * TS - recDist, sy, sz, 0.12, 0, 0.96 * r * BL, 0.055 * r, 0.048 * r, '#334155', seamCol, 1.0, 1.45);
        }
      }
    } else if (defId === 'GLA_TOXIN_TRACTOR') {
      pushBox3D(turFaces, turProj, -0.18 * r * TS, 0.42 * r * TS, -0.36 * r * TS, 0.36 * r * TS, zTurBot, zTurTop, olive, seamCol, 1.15, 1.0);
      pushTubeSegment3D(turFaces, turProj, 0.36 * r * TS, 0, (zTurBot + zTurTop) * 0.52, 0.04, 0, 0.88 * r * BL, 0.095 * r, 0.12 * r, '#84cc16', seamCol, 1.15, 1.45);
    } else if (defId === 'GLA_MARAUDER') {
      pushBox3D(turFaces, turProj, -0.48 * r * TS, 0.48 * r * TS, -0.54 * r * TS, 0.54 * r * TS, zTurBot, zTurTop + 0.06 * r * H, sandHi, seamCol, 1.18, 1.0, 0.08 * r, 0.06 * r);
      const bSides = p.ScrapLevel !== false ? [-0.20 * r * TS, 0.20 * r * TS] : [0];
      for (const by of bSides) {
        pushTubeSegment3D(turFaces, turProj, 0.36 * r * TS - recDist, by, (zTurBot + zTurTop) * 0.54, 0.03, 0, 1.16 * r * BL, 0.095 * r, 0.082 * r, olive, seamCol, 1.15, 1.45);
      }
    } else {
      // Scorpion Light Tank + Overhead Scorpion Rocket Launcher
      pushBox3D(turFaces, turProj, -0.42 * r * TS, 0.38 * r * TS, -0.42 * r * TS, 0.42 * r * TS, zTurBot, zTurTop, sandHi, seamCol, 1.15, 1.0, 0.08 * r, 0.06 * r);
      pushTubeSegment3D(turFaces, turProj, 0.32 * r * TS - recDist, 0, (zTurBot + zTurTop) * 0.52, 0.03, 0, 0.96 * r * BL, 0.078 * r, 0.068 * r, sandBase, seamCol, 1.12, 1.35);
      if (p.ShowUpgradeKit !== false) {
        pushTubeSegment3D(turFaces, turProj, -0.28 * r * TS, -0.18 * r * TS, zTurTop + 0.14 * r * H, 0.16, 0, 0.84 * r * BL, 0.095 * r, 0.075 * r, '#dc2626', seamCol, 1.1, 1.65);
      }
    }

    flushFaces(ctx, turFaces);
  }

  function renderGlaWheeledModel(ctx, u, faction, customParams, options) {
    const p = Object.assign({
      hullScale: 1.0, hullLength: 1.0, hullWidth: 1.0, extrusionDepth: 1.0,
      weaponScale: 1.0, payloadPitch: 0.34,
      armorBaseColor: '#c4ab72', armorHighlightColor: '#dcbf84', armorShadowColor: '#8c7444', houseColor: '#587838'
    }, customParams || {});
    const opts = options || {};
    const defId = String((u && u.defId) || 'GLA_TECHNICAL');
    const rawR = (u && u.radius) || 16;
    const r = rawR * (p.hullScale || 1.0);
    const L = p.hullLength || 1.0, W = p.hullWidth || 1.0, H = p.extrusionDepth || 1.0, WS = p.weaponScale || 1.0;

    const hullAngle = (u && u.angle !== undefined) ? u.angle : 0;
    const turretAngle = (u && u.turretAngle !== undefined) ? u.turretAngle : hullAngle;
    const treadPhase = (u && u.treadPhase) || 0;
    const pitchScale = opts.pitchScale !== undefined ? opts.pitchScale : 1.0;
    const zScale = opts.zScale !== undefined ? opts.zScale : 0.42;

    const sandBase = p.armorBaseColor || '#c4ab72';
    const sandHi   = p.armorHighlightColor || '#dcbf84';
    const olive    = p.houseColor || '#587838';
    const seamCol  = '#241c12';

    const hullProj = createProjector(hullAngle, pitchScale, zScale, 0, 0, 0, 0);
    const shadowPts = [
      hullProj.project(-1.08 * r * L, -0.76 * r * W, 0),
      hullProj.project( 1.08 * r * L, -0.76 * r * W, 0),
      hullProj.project( 1.08 * r * L,  0.76 * r * W, 0),
      hullProj.project(-1.08 * r * L,  0.76 * r * W, 0)
    ].map((pt) => ({ x: pt.x + 2.8, y: pt.y + 3.8 }));
    drawPolyPts(ctx, shadowPts, 'rgba(60, 48, 32, 0.34)', null, 0);

    const faces = [];

    if (defId === 'GLA_COMBAT_CYCLE') {
      // 2-Wheel Offroad Dirtbike + Rider + Twin Side Rockets
      pushWheelAxle3D(faces, hullProj, -0.58 * r * L, 0.08 * r * W, 0.30 * r, 0.14 * r, '#262320', '#8c7444', seamCol, treadPhase, -1.2);
      pushWheelAxle3D(faces, hullProj,  0.58 * r * L, 0.08 * r * W, 0.30 * r, 0.14 * r, '#262320', '#8c7444', seamCol, treadPhase, -1.2);
      pushBox3D(faces, hullProj, -0.56 * r * L, 0.56 * r * L, -0.18 * r * W, 0.18 * r * W, 0.22 * r * H, 0.52 * r * H, sandBase, seamCol, 1.15, 0.2);
      pushBox3D(faces, hullProj, -0.22 * r * L, 0.22 * r * L, -0.24 * r * W, 0.24 * r * W, 0.52 * r * H, 0.92 * r * H, olive, seamCol, 1.1, 0.65);
      flushFaces(ctx, faces);
      return;
    }

    const axles = (defId === 'GLA_SCUD_LAUNCHER' || defId === 'GLA_BATTLE_BUS')
      ? [-0.82, -0.28, 0.28, 0.82]
      : [-0.66, 0.68];
    for (const ax of axles) {
      pushWheelAxle3D(faces, hullProj, ax * r * L, 0.62 * r * W, 0.30 * r, 0.22 * r * W, '#262320', '#8c7444', seamCol, treadPhase, -1.5);
    }

    if (defId === 'GLA_SCUD_LAUNCHER') {
      // 8x8 MAZ TEL Chassis + Split Forward Cab + Giant Scud-B Ballistic Missile
      pushBox3D(faces, hullProj, -1.16 * r * L, 1.14 * r * L, -0.74 * r * W, 0.74 * r * W, 0.18 * r * H, 0.42 * r * H, sandBase, seamCol, 1.15, 0);
      for (const side of [-1, 1]) {
        pushBox3D(faces, hullProj, 0.46 * r * L, 1.12 * r * L, side * 0.16 * r * W, side * 0.72 * r * W, 0.42 * r * H, 0.78 * r * H, sandHi, seamCol, 1.12, 0.35);
      }
      const elev = p.payloadPitch || 0.36;
      pushTubeSegment3D(faces, hullProj, -0.96 * r * L, 0, 0.48 * r * H, elev, 0, 1.96 * r * L * WS, 0.18 * r, 0.16 * r, '#e2e8f0', seamCol, 1.2, 0.85);
      pushTubeSegment3D(faces, hullProj, (-0.96 + Math.cos(elev) * 1.92 * WS) * r * L, 0, (0.48 + Math.sin(elev) * 1.92 * WS) * r * H, elev, 0, 0.44 * r * WS, 0.16 * r, 0.04 * r, '#84cc16', seamCol, 1.15, 1.15);
      flushFaces(ctx, faces);
      return;
    }

    if (defId === 'GLA_BATTLE_BUS') {
      // Up-Armored Scrap School Bus + Roof Fortified Bunker + Front Scrap Plow
      pushBox3D(faces, hullProj, 1.08 * r * L, 1.24 * r * L, -0.80 * r * W, 0.80 * r * W, 0.14 * r * H, 0.46 * r * H, '#64748b', seamCol, 1.15, 0.4);
      pushBox3D(faces, hullProj, -1.14 * r * L, 1.12 * r * L, -0.74 * r * W, 0.74 * r * W, 0.20 * r * H, 0.88 * r * H, '#eab308', seamCol, 1.18, 0.2, 0.08 * r * L, 0.05 * r * W);
      pushBox3D(faces, hullProj, -0.92 * r * L, 0.68 * r * L, -0.68 * r * W, 0.68 * r * W, 0.88 * r * H, 1.14 * r * H, olive, seamCol, 1.15, 0.75);
      flushFaces(ctx, faces);
      return;
    }

    if (defId === 'GLA_BOMB_TRUCK') {
      // Disguised Cargo Truck + Volatile Explosive Drum Payload
      pushBox3D(faces, hullProj, 0.28 * r * L, 1.02 * r * L, -0.66 * r * W, 0.66 * r * W, 0.20 * r * H, 0.86 * r * H, sandHi, seamCol, 1.15, 0.3, 0.08 * r * L, 0.04 * r * W);
      pushBox3D(faces, hullProj, -1.04 * r * L, 0.24 * r * L, -0.72 * r * W, 0.72 * r * W, 0.20 * r * H, 0.98 * r * H, olive, seamCol, 1.15, 0.55);
      pushBox3D(faces, hullProj, -0.88 * r * L, 0.08 * r * L, -0.52 * r * W, 0.52 * r * W, 0.98 * r * H, 1.12 * r * H, '#dc2626', seamCol, 1.05, 0.85);
      flushFaces(ctx, faces);
      return;
    }

    // GLA Technical Pickup OR Rocket Buggy
    pushBox3D(faces, hullProj, -1.02 * r * L, 1.02 * r * L, -0.66 * r * W, 0.66 * r * W, 0.18 * r * H, 0.48 * r * H, sandBase, seamCol, 1.15, 0, 0.10 * r * L, 0.05 * r * W);
    pushBox3D(faces, hullProj, -0.10 * r * L, 0.54 * r * L, -0.62 * r * W, 0.62 * r * W, 0.48 * r * H, 0.82 * r * H, sandHi, seamCol, 1.12, 0.35, 0.10 * r * L, 0.05 * r * W);
    flushFaces(ctx, faces);

    const turProj = createProjector(turretAngle, pitchScale, zScale, -0.44 * r * L, 0, 0, hullAngle);
    const turFaces = [];
    if (defId === 'GLA_ROCKET_BUGGY') {
      pushBox3D(turFaces, turProj, -0.38 * r * WS, 0.38 * r * WS, -0.48 * r * WS, 0.48 * r * WS, 0.52 * r * H, 0.88 * r * H, '#dc2626', seamCol, 1.15, 1.1);
    } else {
      pushCylinderZ3D(turFaces, turProj, 0, 0, 0.48 * r * H, 0.74 * r * H, 0.14 * r, 0.10 * r, 8, olive, seamCol, 1.05, 1.0);
      pushTubeSegment3D(turFaces, turProj, -0.12 * r, 0, 0.72 * r * H, 0.04, 0, 0.88 * r * WS, 0.065 * r, 0.055 * r, '#334155', seamCol, 1.1, 1.35);
    }
    flushFaces(ctx, turFaces);
  }


  // ==========================================================================
  // 13. Complete Registry of All USA, China & GLA Units (47 Units + Variants)
  // ==========================================================================
  const FACTION_VEHICLE_DEFAULTS = {
    hullScale: 1.0,
    hullLength: 1.0,
    hullWidth: 1.0,
    extrusionDepth: 1.0,
    turretScale: 1.0,
    barrelLength: 1.0,
    gunElevation: 0.45,
    DeployOutriggers: true,
    cargoScale: 1.0,
    antennaScale: 1.0,
    rotorScale: 1.0,
    podScale: 1.0,
    ShowChinGun: true,
    wingSpan: 1.0,
    canardScale: 1.0,
    ShowNapalmPods: true,
    ScrapLevel: true,
    weaponScale: 1.0,
    payloadPitch: 0.34,
    trackWidth: 1.0,
    skirtHeight: 1.0,
    ShowFactionEmblem: true,
    ShowUpgradeKit: true,
    ShowHazardBeacons: true,
    ShowAutoloader: true,
    armorBaseColor: '#9c6e4e',
    armorHighlightColor: '#b88662',
    armorShadowColor: '#6e4a32',
    houseColor: '#dc2626'
  };

  const MODEL_REGISTRY = {
    // --- WAR FACTORY ---
    USA_CRUSADER: {
      defId: 'USA_CRUSADER',
      modelCode: 'USA — M1A9 CRUSADER TANK',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_crusader_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_crusader.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • 5 Road Wheels • Roof Pintle .50 Cal MG • 120mm Cannon',
      defaultParams: CRUSADER_DEFAULT_PARAMS,
      paramSchema: CRUSADER_PARAM_SCHEMA,
      presets: CRUSADER_PRESETS,
      render: renderCrusaderModel
    },
    USA_LASER_CRUSADER: {
      defId: 'USA_LASER_CRUSADER',
      modelCode: 'USA — M1A9 LASER CRUSADER (GEN. TOWNES)',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_crusader_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_crusader.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Directed-Energy Capacitor Barrel • Point-Defense Diode',
      defaultParams: LASER_CRUSADER_DEFAULT_PARAMS,
      paramSchema: CRUSADER_PARAM_SCHEMA,
      presets: CRUSADER_PRESETS,
      render: renderCrusaderModel
    },
    USA_PALADIN: {
      defId: 'USA_PALADIN',
      modelCode: 'USA — PALADIN FRONTLINE BATTLE TANK',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_paladin_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_paladin.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Heavy Sloped Armor • Glowing Cyan Point-Defense Laser Dome',
      defaultParams: PALADIN_DEFAULT_PARAMS,
      paramSchema: PALADIN_PARAM_SCHEMA,
      presets: PALADIN_PRESETS,
      render: renderPaladinModel
    },
    USA_LASER_TANK: {
      defId: 'USA_LASER_TANK',
      modelCode: 'USA — LASER PALADIN TANK (GEN. TOWNES)',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_paladin_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_paladin.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Titanium Beam Chassis • Point-Defense Laser Dome',
      defaultParams: LASER_TANK_DEFAULT_PARAMS,
      paramSchema: PALADIN_PARAM_SCHEMA,
      presets: PALADIN_PRESETS,
      render: renderPaladinModel
    },
    USA_HUMVEE: {
      defId: 'USA_HUMVEE',
      modelCode: 'USA — M1114 HUMVEE ARMORED SCOUT',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_humvee_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_humvee.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • X-Stamped Doors • 2-Pane Glass Windshield • Roof .50 Cal + TOW',
      defaultParams: HUMVEE_DEFAULT_PARAMS,
      paramSchema: HUMVEE_PARAM_SCHEMA,
      presets: HUMVEE_PRESETS,
      render: renderHumveeOrAvengerModel
    },
    USA_AVENGER: {
      defId: 'USA_AVENGER',
      modelCode: 'USA — M1097 AVENGER AIR-DEFENSE SYSTEM',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_avenger_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_avenger.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Twin 4-Cell Olive Missile/Laser Pods • Target Acquisition Optics',
      defaultParams: AVENGER_DEFAULT_PARAMS,
      paramSchema: HUMVEE_PARAM_SCHEMA,
      presets: AVENGER_PRESETS,
      render: renderHumveeOrAvengerModel
    },
    USA_TOMAHAWK: {
      defId: 'USA_TOMAHAWK',
      modelCode: 'USA — BGM-109 TOMAHAWK LAUNCHER (8×8 HEMTT)',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_tomahawk_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_tomahawk.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • 8×8 Tandem HEMTT • 6-Cell Erector Box • Roll-Bar Gantry & Winged BGM-109 Cruise Missile',
      defaultParams: TOMAHAWK_DEFAULT_PARAMS,
      paramSchema: TOMAHAWK_PARAM_SCHEMA,
      presets: TOMAHAWK_PRESETS,
      render: renderTomahawkModel
    },
    USA_AMBULANCE: {
      defId: 'USA_AMBULANCE',
      modelCode: 'USA — ARMORED FIELD AMBULANCE & NBC DECON',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_ambulance_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_ambulance.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Red Cross Med-Box • Roof Emergency Strobe Bar • NBC Decon',
      defaultParams: HUMVEE_DEFAULT_PARAMS,
      paramSchema: AMBULANCE_PARAM_SCHEMA,
      presets: AMBULANCE_PRESETS,
      render: renderAmbulanceModel
    },
    USA_MICROWAVE_TANK: {
      defId: 'USA_MICROWAVE_TANK',
      modelCode: 'USA — DIRECTED-ENERGY MICROWAVE TANK',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_microwave_tank_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_microwave_tank.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Rotating Parabolic Microwave Dish • Cyan-Gold Feed Horn',
      defaultParams: PALADIN_DEFAULT_PARAMS,
      paramSchema: MICROWAVE_TANK_PARAM_SCHEMA,
      presets: MICROWAVE_TANK_PRESETS,
      render: renderMicrowaveTankModel
    },
    USA_BATTLE_DRONE: {
      defId: 'USA_BATTLE_DRONE',
      modelCode: 'USA — AUTONOMOUS BATTLE & SENTRY DRONE',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_battle_drone_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_battle_drone.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Miniaturized Tracked Recon/Combat Drone • Twin Miniguns',
      defaultParams: HUMVEE_DEFAULT_PARAMS,
      paramSchema: BATTLE_DRONE_PARAM_SCHEMA,
      presets: BATTLE_DRONE_PRESETS,
      render: renderBattleDroneModel
    },

    // --- COMMAND CENTER / LOGISTICS (2 Units) ---
    USA_DOZER: {
      defId: 'USA_DOZER',
      modelCode: 'USA — CATERPILLAR ARMORED CONSTRUCTION DOZER',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_dozer_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_dozer.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Curved Moldboard Blade • C-Frame Push Beams • ROPS Glass Cabin',
      defaultParams: DOZER_DEFAULT_PARAMS,
      paramSchema: DOZER_PARAM_SCHEMA,
      presets: DOZER_PRESETS,
      render: renderDozerModel
    },
    USA_CHINOOK: {
      defId: 'USA_CHINOOK',
      modelCode: 'USA — CH-47D CHINOOK HEAVY TRANSPORT',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_chinook_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_chinook.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Twin-Tandem Rotors • Olive/Tan Camo • Side Fuel Sponsons',
      defaultParams: CHINOOK_DEFAULT_PARAMS,
      paramSchema: CHINOOK_PARAM_SCHEMA,
      presets: CHINOOK_PRESETS,
      render: renderChinookModel
    },

    // --- AIRFIELD ---
    USA_COMBAT_CHINOOK: {
      defId: 'USA_COMBAT_CHINOOK',
      modelCode: 'USA — MH-47E COMBAT CHINOOK GUNSHIP (GEN. GRANGER)',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_chinook_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_chinook.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Side-Firing Cabin Gun Ports • Twin-Tandem Rotors',
      defaultParams: COMBAT_CHINOOK_DEFAULT_PARAMS,
      paramSchema: CHINOOK_PARAM_SCHEMA,
      presets: CHINOOK_PRESETS,
      render: renderChinookModel
    },
    USA_COMANCHE: {
      defId: 'USA_COMANCHE',
      modelCode: 'USA — RAH-66 COMANCHE STEALTH GUNSHIP',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_comanche_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_comanche.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Tandem Glass Canopy • Fenestron Tail • Stub-Wing Rocket Pods',
      defaultParams: COMANCHE_DEFAULT_PARAMS,
      paramSchema: COMANCHE_PARAM_SCHEMA,
      presets: COMANCHE_PRESETS,
      render: renderComancheModel
    },
    USA_RAPTOR: {
      defId: 'USA_RAPTOR',
      modelCode: 'USA — F-22 RAPTOR STEALTH FIGHTER',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_raptor_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_raptor.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Golden-Amber Canopy • Canted Twin Tails • Twin Afterburners',
      defaultParams: RAPTOR_DEFAULT_PARAMS,
      paramSchema: RAPTOR_PARAM_SCHEMA,
      presets: RAPTOR_PRESETS,
      render: renderRaptorModel
    },
    USA_KING_RAPTOR: {
      defId: 'USA_KING_RAPTOR',
      modelCode: 'USA — F-22X KING RAPTOR (GEN. GRANGER)',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_raptor_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_raptor.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Forward Canards • Heavy Wing Ordnance • Point-Defense Laser',
      defaultParams: KING_RAPTOR_DEFAULT_PARAMS,
      paramSchema: RAPTOR_PARAM_SCHEMA,
      presets: RAPTOR_PRESETS,
      render: renderRaptorModel
    },
    USA_STEALTH_FIGHTER: {
      defId: 'USA_STEALTH_FIGHTER',
      modelCode: 'USA — F-117A NIGHTHAWK STEALTH FIGHTER',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_stealth_fighter_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_stealth_fighter.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Faceted Matte-Black Stealth Delta • Bunker-Buster Missiles',
      defaultParams: RAPTOR_DEFAULT_PARAMS,
      paramSchema: STEALTH_FIGHTER_PARAM_SCHEMA,
      presets: STEALTH_FIGHTER_PRESETS,
      render: renderStealthFighterModel
    },
    USA_AURORA: {
      defId: 'USA_AURORA',
      modelCode: 'USA — B-70 AURORA HYPERSONIC BOMBER',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_aurora_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_aurora.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Needle-Nosed Wave-Rider Delta • Cyan Scramjet Exhaust',
      defaultParams: AURORA_DEFAULT_PARAMS,
      paramSchema: AURORA_PARAM_SCHEMA,
      presets: AURORA_PRESETS,
      render: renderAuroraModel
    },
    USA_AURORA_ALPHA: {
      defId: 'USA_AURORA_ALPHA',
      modelCode: 'USA — AURORA ALPHA THERMOBARIC BOMBER (GEN. ALEXANDER)',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_aurora_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_aurora.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Gold Tactical Trim • Fuel-Air Thermobaric Payload',
      defaultParams: AURORA_ALPHA_DEFAULT_PARAMS,
      paramSchema: AURORA_PARAM_SCHEMA,
      presets: AURORA_PRESETS,
      render: renderAuroraModel
    },

    // --- BARRACKS INFANTRY ---
    USA_RANGER: {
      defId: 'USA_RANGER',
      modelCode: 'USA — US ARMY RANGER (CHIBI-TACTICAL DIORAMA)',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_ranger_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_ranger.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Kevlar Helmet + Goggles • M4A1 Carbine • [🎯] Callout',
      defaultParams: INFANTRY_DEFAULT_PARAMS,
      paramSchema: INFANTRY_PARAM_SCHEMA,
      presets: INFANTRY_PRESETS,
      render: renderInfantryModel
    },
    USA_MISSILE_DEFENDER: {
      defId: 'USA_MISSILE_DEFENDER',
      modelCode: 'USA — MISSILE DEFENDER (CHIBI-TACTICAL DIORAMA)',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_missile_defender_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_missile_defender.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Shoulder-Fired Anti-Tank Launcher • [🛡️] Callout',
      defaultParams: MISSILE_DEFENDER_DEFAULT_PARAMS,
      paramSchema: INFANTRY_PARAM_SCHEMA,
      presets: INFANTRY_PRESETS,
      render: renderInfantryModel
    },
    USA_PATHFINDER: {
      defId: 'USA_PATHFINDER',
      modelCode: 'USA — PATHFINDER ELITE SNIPER (CHIBI-TACTICAL DIORAMA)',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_pathfinder_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_pathfinder.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Gillie Recon Uniform • Long-Range Sniper Rifle • [🔭] Callout',
      defaultParams: PATHFINDER_DEFAULT_PARAMS,
      paramSchema: INFANTRY_PARAM_SCHEMA,
      presets: INFANTRY_PRESETS,
      render: renderInfantryModel
    },
    USA_COLONEL_BURTON: {
      defId: 'USA_COLONEL_BURTON',
      modelCode: 'USA — COLONEL BURTON ELITE COMMANDO',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_colonel_burton_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_colonel_burton.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Maroon Beret • Heavy Camo Rifle • C4 Timed/Remote Charges',
      defaultParams: PATHFINDER_DEFAULT_PARAMS,
      paramSchema: INFANTRY_PARAM_SCHEMA,
      presets: INFANTRY_PRESETS,
      render: renderInfantryModel
    },

    // --- CHINA PEOPLE'S LIBERATION ARMY (PLA) UNITS ---
    CHINA_DOZER: {
      defId: 'CHINA_DOZER',
      modelCode: 'CHINA — PLA CONSTRUCTION DOZER',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_dozer_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_dozer.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Heavy Hydraulic Bulldozer Blade • PLA Red Star Emblem',
      defaultParams: Object.assign({}, DOZER_DEFAULT_PARAMS, { armorBaseColor: '#9c6e4e', armorHighlightColor: '#b88662', houseColor: '#dc2626' }),
      paramSchema: DOZER_PARAM_SCHEMA,
      presets: DOZER_PRESETS,
      render: renderDozerModel
    },
    CHINA_SUPPLY_TRUCK: {
      defId: 'CHINA_SUPPLY_TRUCK',
      modelCode: 'CHINA — PLA SUPPLY CARGO TRUCK',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_overlord_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_overlord.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Covered PLA Logistics Cargo Hauler • Supply Depot Shuttle',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS),
      paramSchema: CHINA_WHEELED_PARAM_SCHEMA,
      presets: CHINA_WHEELED_PRESETS,
      render: renderChinaWheeledModel
    },
    CHINA_BATTLEMASTER: {
      defId: 'CHINA_BATTLEMASTER',
      modelCode: 'CHINA — TYPE-98 BATTLEMASTER MBT',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_overlord_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_overlord.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Rounded Cast Turret • 125mm Cannon • Red Star & Nationalism Banner',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS),
      paramSchema: CHINA_TANK_PARAM_SCHEMA,
      presets: CHINA_TANK_PRESETS,
      render: renderChinaTankModel
    },
    CHINA_NUKE_BATTLEMASTER: {
      defId: 'CHINA_NUKE_BATTLEMASTER',
      modelCode: 'CHINA — NUCLEAR BATTLEMASTER (GEN. TAO)',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_overlord_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_overlord.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Depleted Uranium Shells • Isotope Reactor Drive',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS, { armorBaseColor: '#7c8464', armorHighlightColor: '#98a37a', houseColor: '#84cc16' }),
      paramSchema: CHINA_TANK_PARAM_SCHEMA,
      presets: CHINA_TANK_PRESETS,
      render: renderChinaTankModel
    },
    CHINA_GATTLING_TANK: {
      defId: 'CHINA_GATTLING_TANK',
      modelCode: 'CHINA — DUAL ROTARY GATTLING TANK',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_overlord_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_overlord.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Twin 6-Barrel Rotary Cannons • Anti-Air / Anti-Infantry Tracking Radar',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS),
      paramSchema: CHINA_TANK_PARAM_SCHEMA,
      presets: CHINA_TANK_PRESETS,
      render: renderChinaTankModel
    },
    CHINA_DRAGON_TANK: {
      defId: 'CHINA_DRAGON_TANK',
      modelCode: 'CHINA — DRAGON FLAME TANK',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_overlord_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_overlord.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Pressurized Crimson Napalm Rear Drums • High-Pressure Flame Projector',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS, { armorBaseColor: '#99583d', armorHighlightColor: '#b86b4b', houseColor: '#f97316' }),
      paramSchema: CHINA_TANK_PARAM_SCHEMA,
      presets: CHINA_TANK_PRESETS,
      render: renderChinaTankModel
    },
    CHINA_INFERNO_CANNON: {
      defId: 'CHINA_INFERNO_CANNON',
      modelCode: 'CHINA — INFERNO NAPALM ARTILLERY',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_overlord_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_overlord.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Long-Range Incendiary Howitzer • Firestorm Salvo Support',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS, { houseColor: '#ea580c' }),
      paramSchema: CHINA_ARTILLERY_PARAM_SCHEMA,
      presets: CHINA_ARTILLERY_PRESETS,
      render: renderChinaArtilleryModel
    },
    CHINA_NUKE_CANNON: {
      defId: 'CHINA_NUKE_CANNON',
      modelCode: 'CHINA — TACTICAL NUCLEAR SIEGE CANNON',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_overlord_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_overlord.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Articulated Twin-Track Chassis • Stabilizer Spades • Heavy Nuclear Ordnance',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS, { hullScale: 1.08, houseColor: '#dc2626' }),
      paramSchema: CHINA_ARTILLERY_PARAM_SCHEMA,
      presets: CHINA_ARTILLERY_PRESETS,
      render: renderChinaArtilleryModel
    },
    CHINA_ECM_TANK: {
      defId: 'CHINA_ECM_TANK',
      modelCode: 'CHINA — ECM ELECTRONIC WARFARE TANK',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_overlord_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_overlord.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Phased-Array Jamming Dome • Vehicle Disabler & Missile Deflector',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS, { houseColor: '#10b981' }),
      paramSchema: CHINA_TANK_PARAM_SCHEMA,
      presets: CHINA_TANK_PRESETS,
      render: renderChinaTankModel
    },
    CHINA_OVERLORD: {
      defId: 'CHINA_OVERLORD',
      modelCode: 'CHINA — OVERLORD SUPER-HEAVY BATTLE TANK',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_overlord_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_overlord.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Twin 125mm Cannons • Roof Gatling Turret • 6 Road Wheels',
      defaultParams: OVERLORD_DEFAULT_PARAMS,
      paramSchema: OVERLORD_PARAM_SCHEMA,
      presets: OVERLORD_PRESETS,
      render: renderOverlordModel
    },
    CHINA_EMPEROR_OVERLORD: {
      defId: 'CHINA_EMPEROR_OVERLORD',
      modelCode: 'CHINA — EMPEROR OVERLORD (GEN. KWAI)',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_overlord_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_overlord.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Twin 125mm Cannons • Speaker & Gatling Tower',
      defaultParams: OVERLORD_DEFAULT_PARAMS,
      paramSchema: OVERLORD_PARAM_SCHEMA,
      presets: OVERLORD_PRESETS,
      render: renderOverlordModel
    },
    CHINA_TROOP_CRAWLER: {
      defId: 'CHINA_TROOP_CRAWLER',
      modelCode: 'CHINA — 8x8 ARMORED TROOP CRAWLER',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_overlord_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_overlord.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • 8x8 Heavy APC • Red Star Banner • Stealth Detector • Carries 8 Red Guards',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS),
      paramSchema: CHINA_WHEELED_PARAM_SCHEMA,
      presets: CHINA_WHEELED_PRESETS,
      render: renderChinaWheeledModel
    },
    CHINA_ASSAULT_CRAWLER: {
      defId: 'CHINA_ASSAULT_CRAWLER',
      modelCode: 'CHINA — ASSAULT TROOP CRAWLER (GEN. FAI)',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_overlord_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_overlord.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • 8x8 Heavy Assault APC • Carries 8 Elite Minigunners',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS, { armorBaseColor: '#7d8462', armorHighlightColor: '#98a178' }),
      paramSchema: CHINA_WHEELED_PARAM_SCHEMA,
      presets: CHINA_WHEELED_PRESETS,
      render: renderChinaWheeledModel
    },
    CHINA_ASSAULT_TROOP_CRAWLER: {
      defId: 'CHINA_ASSAULT_TROOP_CRAWLER',
      modelCode: 'CHINA — ASSAULT TROOP CRAWLER (GEN. FAI)',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_overlord_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_overlord.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • 8x8 Heavy Assault APC • Carries 8 Elite Minigunners',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS, { armorBaseColor: '#7d8462', armorHighlightColor: '#98a178' }),
      paramSchema: CHINA_WHEELED_PARAM_SCHEMA,
      presets: CHINA_WHEELED_PRESETS,
      render: renderChinaWheeledModel
    },
    CHINA_LISTENING_OUTPOST: {
      defId: 'CHINA_LISTENING_OUTPOST',
      modelCode: 'CHINA — STEALTH LISTENING OUTPOST',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_overlord_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_overlord.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Dual Parabolic Telemetry Dish • Stealth Recon & Tank Hunter Fireports',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS),
      paramSchema: CHINA_WHEELED_PARAM_SCHEMA,
      presets: CHINA_WHEELED_PRESETS,
      render: renderChinaWheeledModel
    },
    CHINA_ATTACK_OUTPOST: {
      defId: 'CHINA_ATTACK_OUTPOST',
      modelCode: 'CHINA — ASSAULT LISTENING OUTPOST (GEN. FAI)',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_overlord_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_overlord.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Armored Telemetry Recon Van • Heavy Fireports • Stealth When Stationary',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS, { armorBaseColor: '#7d8462', armorHighlightColor: '#98a178' }),
      paramSchema: CHINA_WHEELED_PARAM_SCHEMA,
      presets: CHINA_WHEELED_PRESETS,
      render: renderChinaWheeledModel
    },
    CHINA_HELIX: {
      defId: 'CHINA_HELIX',
      modelCode: 'CHINA — KA-58 HELIX HEAVY ASSAULT GUNSHIP',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_overlord_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_overlord.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Coaxial Counter-Rotating Rotors • Chin Gatling Cannon • Bunker / Speaker / Napalm Hardpoints',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS),
      paramSchema: HELIX_PARAM_SCHEMA,
      presets: HELIX_PRESETS,
      render: renderHelixModel
    },
    CHINA_MIG: {
      defId: 'CHINA_MIG',
      modelCode: 'CHINA — MIG-1.44 FIRESTORM STRIKE FIGHTER',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_overlord_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_overlord.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Forward Canards • Twin Afterburners • Napalm Firestorm Missiles',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS),
      paramSchema: MIG_PARAM_SCHEMA,
      presets: MIG_PRESETS,
      render: renderMigModel
    },
    CHINA_NUKE_MIG: {
      defId: 'CHINA_NUKE_MIG',
      modelCode: 'CHINA — TACTICAL NUCLEAR MIG (GEN. TAO)',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_overlord_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_overlord.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Tactical Nuclear Air-to-Surface Missiles • Supersonic Interceptor',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS, { armorBaseColor: '#828766', armorHighlightColor: '#9ca37c', houseColor: '#84cc16' }),
      paramSchema: MIG_PARAM_SCHEMA,
      presets: MIG_PRESETS,
      render: renderMigModel
    },
    CHINA_TACTICAL_NUKEMIG: {
      defId: 'CHINA_TACTICAL_NUKEMIG',
      modelCode: 'CHINA — TACTICAL NUCLEAR MIG (GEN. TAO)',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_overlord_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_overlord.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Tactical Nuclear Air-to-Surface Missiles • Supersonic Interceptor',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS, { armorBaseColor: '#828766', armorHighlightColor: '#9ca37c', houseColor: '#84cc16' }),
      paramSchema: MIG_PARAM_SCHEMA,
      presets: MIG_PRESETS,
      render: renderMigModel
    },
    CHINA_RED_GUARD: {
      defId: 'CHINA_RED_GUARD',
      modelCode: 'CHINA — PLA RED GUARD RIFLE SQUAD',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_overlord_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_overlord.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Type-81 Semi-Auto Rifle • Red Star Helmet • Nationalism Horde Bonus',
      defaultParams: Object.assign({}, INFANTRY_DEFAULT_PARAMS, { helmetColor: '#7a5438', uniformColor: '#9c6e4e', vestColor: '#7f1d1d' }),
      paramSchema: INFANTRY_PARAM_SCHEMA,
      presets: INFANTRY_PRESETS,
      render: renderInfantryModel
    },
    CHINA_MINIGUNNER: {
      defId: 'CHINA_MINIGUNNER',
      modelCode: 'CHINA — ELITE GATTLING MINIGUNNER (GEN. FAI)',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_overlord_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_overlord.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Handheld Rotary Gattling Minigun • Anti-Infantry & Anti-Air Suppression',
      defaultParams: Object.assign({}, INFANTRY_DEFAULT_PARAMS, { helmetColor: '#7f1d1d', uniformColor: '#7c583c', vestColor: '#991b1b' }),
      paramSchema: INFANTRY_PARAM_SCHEMA,
      presets: INFANTRY_PRESETS,
      render: renderInfantryModel
    },
    CHINA_TANK_HUNTER: {
      defId: 'CHINA_TANK_HUNTER',
      modelCode: 'CHINA — PLA ANTI-ARMOR TANK HUNTER',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_overlord_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_overlord.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Shoulder-Fired Anti-Tank Rocket Launcher • TNT Demolition Charge',
      defaultParams: Object.assign({}, MISSILE_DEFENDER_DEFAULT_PARAMS, { helmetColor: '#7a5438', uniformColor: '#8d6245', vestColor: '#7f1d1d' }),
      paramSchema: INFANTRY_PARAM_SCHEMA,
      presets: INFANTRY_PRESETS,
      render: renderInfantryModel
    },
    CHINA_HACKER: {
      defId: 'CHINA_HACKER',
      modelCode: 'CHINA — PLA CYBER WARFARE HACKER',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_overlord_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_overlord.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Ruggedized Field Laptop • Satellite Cash Siphon & Building Disable',
      defaultParams: Object.assign({}, PATHFINDER_DEFAULT_PARAMS, { helmetColor: '#3f4d34', uniformColor: '#5c6650', vestColor: '#1e293b' }),
      paramSchema: INFANTRY_PARAM_SCHEMA,
      presets: INFANTRY_PRESETS,
      render: renderInfantryModel
    },
    CHINA_SUPER_HACKER: {
      defId: 'CHINA_SUPER_HACKER',
      modelCode: 'CHINA — ELITE STEALTH HACKER (GEN. FAI)',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_overlord_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_overlord.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Stealthed Cyber Operative • Accelerated Cash Siphon & Vehicle Subversion',
      defaultParams: Object.assign({}, PATHFINDER_DEFAULT_PARAMS, { helmetColor: '#334155', uniformColor: '#475569', vestColor: '#0f172a' }),
      paramSchema: INFANTRY_PARAM_SCHEMA,
      presets: INFANTRY_PRESETS,
      render: renderInfantryModel
    },
    CHINA_BLACK_LOTUS: {
      defId: 'CHINA_BLACK_LOTUS',
      modelCode: 'CHINA — BLACK LOTUS ELITE CYBER AGENT',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_overlord_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_overlord.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Stealth Cyber Commando • Remote Building Capture, Cash Hack & Vehicle Disable',
      defaultParams: Object.assign({}, PATHFINDER_DEFAULT_PARAMS, { helmetColor: '#0f172a', uniformColor: '#1e293b', vestColor: '#831843' }),
      paramSchema: INFANTRY_PARAM_SCHEMA,
      presets: INFANTRY_PRESETS,
      render: renderInfantryModel
    },

    // --- GLOBAL LIBERATION ARMY (GLA) UNITS ---
    GLA_WORKER: {
      defId: 'GLA_WORKER',
      modelCode: 'GLA — FIELD LABORER & BUILDER WORKER',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_ranger_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_ranger.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Desert Keffiyeh • Pickaxe & Crate Harness • [⛏️] Callout',
      defaultParams: Object.assign({}, INFANTRY_DEFAULT_PARAMS, { helmetColor: '#d6bc8b', uniformColor: '#a88b5c', vestColor: '#785c38', showGoggles: false }),
      paramSchema: INFANTRY_PARAM_SCHEMA,
      presets: INFANTRY_PRESETS,
      render: renderInfantryModel
    },
    GLA_REBEL: {
      defId: 'GLA_REBEL',
      modelCode: 'GLA — GUERRILLA REBEL FIGHTER',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_ranger_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_ranger.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Olive Keffiyeh • AK-47 Assault Rifle • Booby-Trap & Capture Kit',
      defaultParams: Object.assign({}, INFANTRY_DEFAULT_PARAMS, { helmetColor: '#4d7c0f', uniformColor: '#b89862', vestColor: '#5c6b43' }),
      paramSchema: INFANTRY_PARAM_SCHEMA,
      presets: INFANTRY_PRESETS,
      render: renderInfantryModel
    },
    GLA_RPG_TROOPER: {
      defId: 'GLA_RPG_TROOPER',
      modelCode: 'GLA — ANTI-ARMOR RPG-7 TROOPER',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_missile_defender_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_missile_defender.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Shoulder-Fired RPG-7 Warhead • Tunnel Defender • [🛡️] Callout',
      defaultParams: Object.assign({}, MISSILE_DEFENDER_DEFAULT_PARAMS, { helmetColor: '#4d7c0f', uniformColor: '#a88b5c', vestColor: '#65a30d' }),
      paramSchema: INFANTRY_PARAM_SCHEMA,
      presets: INFANTRY_PRESETS,
      render: renderInfantryModel
    },
    GLA_TERRORIST: {
      defId: 'GLA_TERRORIST',
      modelCode: 'GLA — DEMOLITION SABOTEUR',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_ranger_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_ranger.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • High-Explosive Demolition Vest • Dead-Man Trigger • [🧨] Callout',
      defaultParams: Object.assign({}, INFANTRY_DEFAULT_PARAMS, { helmetColor: '#dc2626', uniformColor: '#b89862', vestColor: '#b91c1c' }),
      paramSchema: INFANTRY_PARAM_SCHEMA,
      presets: INFANTRY_PRESETS,
      render: renderInfantryModel
    },
    GLA_HIJACKER: {
      defId: 'GLA_HIJACKER',
      modelCode: 'GLA — STEALTH VEHICLE HIJACKER (PRINCE KASSAD)',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_pathfinder_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_pathfinder.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Camouflaged Infiltrator • Vehicle Breaching Blade',
      defaultParams: Object.assign({}, PATHFINDER_DEFAULT_PARAMS, { helmetColor: '#3f6212', uniformColor: '#5c6b43', vestColor: '#1e293b' }),
      paramSchema: INFANTRY_PARAM_SCHEMA,
      presets: INFANTRY_PRESETS,
      render: renderInfantryModel
    },
    GLA_ANGRY_MOB: {
      defId: 'GLA_ANGRY_MOB',
      modelCode: 'GLA — ANGRY INSURGENT MOB (AK-47 & MOLOTOV)',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_ranger_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_ranger.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Multi-Figure Insurgent Squad • AK-47s & Molotov Cocktails • [🔥] Callout',
      defaultParams: Object.assign({}, INFANTRY_DEFAULT_PARAMS, { helmetColor: '#b45309', uniformColor: '#a88b5c', vestColor: '#78350f' }),
      paramSchema: INFANTRY_PARAM_SCHEMA,
      presets: INFANTRY_PRESETS,
      render: renderInfantryModel
    },
    GLA_JARMEN_KELL: {
      defId: 'GLA_JARMEN_KELL',
      modelCode: 'GLA — JARMEN KELL LEGENDARY SNIPER HERO',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_pathfinder_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_pathfinder.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Desert Sniper Wrap • Long-Barrel Dragunov Rifle • Vehicle Pilot Snipe',
      defaultParams: Object.assign({}, PATHFINDER_DEFAULT_PARAMS, { helmetColor: '#4d7c0f', uniformColor: '#8c734b', vestColor: '#3f6212' }),
      paramSchema: INFANTRY_PARAM_SCHEMA,
      presets: INFANTRY_PRESETS,
      render: renderInfantryModel
    },
    GLA_SCORPION: {
      defId: 'GLA_SCORPION',
      modelCode: 'GLA — SCORPION LIGHT BATTLE TANK',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_crusader_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_crusader.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Low-Profile Salvage Hull • 90mm Cannon • Roof Scorpion Rocket Rail',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS, { armorBaseColor: '#c29b61', armorHighlightColor: '#d9b57c', armorShadowColor: '#8c6b3c', houseColor: '#65a30d' }),
      paramSchema: GLA_TANK_PARAM_SCHEMA,
      presets: GLA_TANK_PRESETS,
      render: renderGlaTankModel
    },
    GLA_MARAUDER: {
      defId: 'GLA_MARAUDER',
      modelCode: 'GLA — MARAUDER SALVAGE HEAVY TANK',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_paladin_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_paladin.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Heavy Welded Casemate Superstructure • Salvage Twin-Barrel Upgrade',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS, { armorBaseColor: '#b58d52', armorHighlightColor: '#cca76c', armorShadowColor: '#826132', houseColor: '#65a30d' }),
      paramSchema: GLA_TANK_PARAM_SCHEMA,
      presets: GLA_TANK_PRESETS,
      render: renderGlaTankModel
    },
    GLA_QUAD_CANNON: {
      defId: 'GLA_QUAD_CANNON',
      modelCode: 'GLA — ZSU-23-4 QUAD CANNON HALF-TRACK',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_avenger_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_avenger.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Armored Half-Track • 360° Quad-Barrel Anti-Air / Anti-Infantry Flak Turret',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS, { armorBaseColor: '#c29b61', armorHighlightColor: '#d9b57c', armorShadowColor: '#8c6b3c', houseColor: '#65a30d' }),
      paramSchema: GLA_TANK_PARAM_SCHEMA,
      presets: GLA_TANK_PRESETS,
      render: renderGlaTankModel
    },
    GLA_TOXIN_TRACTOR: {
      defId: 'GLA_TOXIN_TRACTOR',
      modelCode: 'GLA — ANTHRAX BIO-TOXIN TRACTOR',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_dozer_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_dozer.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Pressurized Neon-Green Anthrax Vats • Turreted Bio-Sprayer Nozzle',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS, { armorBaseColor: '#a39262', armorHighlightColor: '#bdb07d', armorShadowColor: '#73653f', houseColor: '#84cc16' }),
      paramSchema: GLA_TANK_PARAM_SCHEMA,
      presets: GLA_TANK_PRESETS,
      render: renderGlaTankModel
    },
    GLA_TECHNICAL: {
      defId: 'GLA_TECHNICAL',
      modelCode: 'GLA — IMPROVISED TECHNICAL PICKUP',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_humvee_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_humvee.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • 4x4 Desert Pickup • Roll-Bar Cage • 360° Bed-Mounted DShK / Recoilless Gun',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS, { armorBaseColor: '#c29b61', armorHighlightColor: '#d9b57c', armorShadowColor: '#8c6b3c', houseColor: '#65a30d' }),
      paramSchema: GLA_WHEELED_PARAM_SCHEMA,
      presets: GLA_WHEELED_PRESETS,
      render: renderGlaWheeledModel
    },
    GLA_COMBAT_CYCLE: {
      defId: 'GLA_COMBAT_CYCLE',
      modelCode: 'GLA — DEMOLITION COMBAT CYCLE (GEN. JUHZIZ)',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_battle_drone_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_battle_drone.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Off-Road Cliff-Climbing Motorcycle • Twin Side-Mounted Rocket Pods',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS, { armorBaseColor: '#c29b61', armorHighlightColor: '#d9b57c', armorShadowColor: '#8c6b3c', houseColor: '#dc2626' }),
      paramSchema: GLA_WHEELED_PARAM_SCHEMA,
      presets: GLA_WHEELED_PRESETS,
      render: renderGlaWheeledModel
    },
    GLA_ROCKET_BUGGY: {
      defId: 'GLA_ROCKET_BUGGY',
      modelCode: 'GLA — HIGH-SPEED ARTILLERY ROCKET BUGGY',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_humvee_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_humvee.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Tubular Sand-Rail Buggy • Roof Multi-Tube Katyusha Rocket Rack',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS, { armorBaseColor: '#c29b61', armorHighlightColor: '#d9b57c', armorShadowColor: '#8c6b3c', houseColor: '#dc2626' }),
      paramSchema: GLA_WHEELED_PARAM_SCHEMA,
      presets: GLA_WHEELED_PRESETS,
      render: renderGlaWheeledModel
    },
    GLA_BOMB_TRUCK: {
      defId: 'GLA_BOMB_TRUCK',
      modelCode: 'GLA — DISGUISED HIGH-EXPLOSIVE BOMB TRUCK',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_tomahawk_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_tomahawk.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Heavy Cargo Dump Truck • Concealed HE Warhead & Anthrax Drums',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS, { armorBaseColor: '#b58d52', armorHighlightColor: '#cca76c', armorShadowColor: '#826132', houseColor: '#dc2626' }),
      paramSchema: GLA_WHEELED_PARAM_SCHEMA,
      presets: GLA_WHEELED_PRESETS,
      render: renderGlaWheeledModel
    },
    GLA_SCUD_LAUNCHER: {
      defId: 'GLA_SCUD_LAUNCHER',
      modelCode: 'GLA — MAZ-543 SCUD-B BALLISTIC MISSILE LAUNCHER',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_tomahawk_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_tomahawk.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • 8x8 Split-Cab TEL Chassis • Elevating Scud-B HE/Anthrax Ballistic Missile',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS, { armorBaseColor: '#b58d52', armorHighlightColor: '#cca76c', armorShadowColor: '#826132', houseColor: '#65a30d' }),
      paramSchema: GLA_WHEELED_PARAM_SCHEMA,
      presets: GLA_WHEELED_PRESETS,
      render: renderGlaWheeledModel
    },
    GLA_BATTLE_BUS: {
      defId: 'GLA_BATTLE_BUS',
      modelCode: 'GLA — UP-ARMORED FORTIFIED BATTLE BUS',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/usa_ambulance_diorama_ref.png',
      spriteImage: 'assets/diorama/units/usa_ambulance.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Scrap-Armored Cowcatcher Bus • 8 Garrison Firing Slits • Second-Life Bunker',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS, { armorBaseColor: '#c29b61', armorHighlightColor: '#d9b57c', armorShadowColor: '#8c6b3c', houseColor: '#65a30d' }),
      paramSchema: GLA_WHEELED_PARAM_SCHEMA,
      presets: GLA_WHEELED_PRESETS,
      render: renderGlaWheeledModel
    }
  };

  // ==========================================================================
  // 14. Ligne-Claire Illustrated Sprite Cache & 60 FPS Tactical Overlay Engine
  // ==========================================================================
  const spriteCache = {};

  function getLoadedSprite(entry) {
    if (!entry || !entry.spriteImage) return null;
    if (typeof Image === 'undefined') return null;

    // Support inline base64 data URL map when embedded in standalone HTML widgets
    const preloadedSrc =
      (typeof window !== 'undefined' &&
        window.UNIT_SPRITE_DATA_URLS &&
        (window.UNIT_SPRITE_DATA_URLS[entry.defId] || window.UNIT_SPRITE_DATA_URLS[entry.spriteImage])) ||
      entry.spriteImage;

    let img = spriteCache[preloadedSrc];
    if (!img) {
      img = new Image();
      img.src = preloadedSrc;
      spriteCache[preloadedSrc] = img;
    }
    if (img.complete && img.naturalWidth > 0) {
      return img;
    }
    return null;
  }

  function renderIllustratedUnitSprite(ctx, u, faction, entry, params, options) {
    const img = getLoadedSprite(entry);
    if (!img || typeof ctx.drawImage !== 'function') return false;

    const p = params || {};
    const opts = options || {};
    const rawR = Math.max((u && u.radius) || 18, 10);
    const scaleMult = p.hullScale || 1.0;
    const defId = u.defId || entry.defId;
    const isInfantry =
      defId === 'USA_RANGER' ||
      defId === 'USA_MISSILE_DEFENDER' ||
      defId === 'USA_PATHFINDER' ||
      defId === 'USA_COLONEL_BURTON' ||
      defId === 'CHINA_RED_GUARD' ||
      defId === 'CHINA_MINIGUNNER' ||
      defId === 'CHINA_TANK_HUNTER' ||
      defId === 'CHINA_HACKER' ||
      defId === 'CHINA_SUPER_HACKER' ||
      defId === 'CHINA_BLACK_LOTUS';
    const isAir =
      Boolean(u.def && u.def.isAir) ||
      defId.includes('RAPTOR') ||
      defId.includes('AURORA') ||
      defId.includes('COMANCHE') ||
      defId.includes('CHINOOK') ||
      defId.includes('STEALTH') ||
      defId.includes('MIG') ||
      defId === 'CHINA_HELIX';

    // Target visual bounding size proportional to unit radius
    const targetSpan = isInfantry
      ? rawR * 3.85 * scaleMult
      : isAir
        ? rawR * 3.35 * scaleMult
        : rawR * 3.15 * scaleMult;

    const aspect = img.naturalWidth / Math.max(1, img.naturalHeight);
    let drawW;
    let drawH;
    if (aspect >= 1) {
      drawW = targetSpan;
      drawH = targetSpan / aspect;
    } else {
      drawH = targetSpan;
      drawW = targetSpan * aspect;
    }

    const phase = (u && u.treadPhase) || ((typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.0025);
    const recoil = (u && u.recoilOffset) || 0;
    const angle = (u && u.angle !== undefined) ? u.angle : 0;

    // Horizontal flip when facing right so the 3/4 isometric sprite naturally tracks facing direction
    const cosA = Math.cos(angle);
    const flipX = cosA > 0.25 ? -1 : 1;
    const bobY = isAir
      ? Math.sin(phase * Math.PI * 2) * (rawR * 0.09)
      : isInfantry
        ? Math.abs(Math.sin(phase * Math.PI * 2)) * (-rawR * 0.06)
        : Math.sin(phase * Math.PI * 4) * (rawR * 0.018);
    const recoilKickX = recoil > 0.1 ? recoil * (rawR * 0.045) : 0;

    ctx.save();
    ctx.translate(0, bobY);
    ctx.scale(flipX, 1);
    ctx.translate(recoilKickX, 0);

    // 1. Draw the authentic Ligne-Claire illustrated unit sprite
    ctx.drawImage(img, -drawW * 0.5, -drawH * 0.5, drawW, drawH);

    // 2. Live 60 FPS Ligne-Claire Tactical Animation & Sub-Variant Overlays
    const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;

    // --- PALADIN & LASER PALADIN: Glowing Cyan Point-Defense Laser (PDL) Dome ---
    if (defId === 'USA_PALADIN' || defId === 'USA_LASER_TANK') {
      const domeX = drawW * 0.04;
      const domeY = -drawH * 0.26;
      const pulseR = drawW * (0.065 + 0.018 * Math.sin(t * 6.0));
      const grad = ctx.createRadialGradient(domeX, domeY, 1, domeX, domeY, pulseR * 1.9);
      grad.addColorStop(0, 'rgba(224, 242, 254, 0.95)');
      grad.addColorStop(0.45, 'rgba(56, 189, 248, 0.65)');
      grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(domeX, domeY, pulseR * 1.9, 0, Math.PI * 2);
      ctx.fill();

      // Rotating PDL scanner sweep arc
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = Math.max(1.2, drawW * 0.018);
      ctx.beginPath();
      ctx.arc(domeX, domeY, pulseR * 1.15, t * 4.5, t * 4.5 + 1.35);
      ctx.stroke();
    }

    // --- LASER CRUSADER & LASER TANK (Gen. Townes): Directed-Energy Capacitor Glow ---
    if (defId === 'USA_LASER_CRUSADER' || defId === 'USA_LASER_TANK') {
      const muzX = -drawW * 0.42;
      const muzY = -drawH * 0.11;
      const emitterR = drawW * (0.048 + 0.014 * Math.sin(t * 8.0));
      ctx.fillStyle = 'rgba(56, 189, 248, 0.82)';
      ctx.beginPath();
      ctx.arc(muzX, muzY, emitterR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = Math.max(1.1, drawW * 0.015);
      ctx.stroke();
    }

    // --- AVENGER: Target Designator Laser Diode & Pod Status ---
    if (defId === 'USA_AVENGER') {
      const optX = -drawW * 0.06;
      const optY = -drawH * 0.25;
      ctx.fillStyle = Math.sin(t * 9.0) > 0 ? '#ef4444' : '#38bdf8';
      ctx.beginPath();
      ctx.arc(optX, optY, Math.max(2.0, drawW * 0.032), 0, Math.PI * 2);
      ctx.fill();
    }

    // --- AMBULANCE: Alternating Red / Blue Roof Emergency Strobe Bar ---
    if (defId === 'USA_AMBULANCE') {
      const strobeSide = Math.sin(t * 10.0) > 0 ? -1 : 1;
      const sx = strobeSide * drawW * 0.06;
      const sy = -drawH * 0.27;
      const sCol = strobeSide < 0 ? 'rgba(239, 68, 68, 0.85)' : 'rgba(56, 189, 248, 0.85)';
      ctx.fillStyle = sCol;
      ctx.beginPath();
      ctx.arc(sx, sy, drawW * 0.065, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- MICROWAVE TANK: Expanding Directed-Energy Wave Rings ---
    if (defId === 'USA_MICROWAVE_TANK') {
      const dishX = -drawW * 0.14;
      const dishY = -drawH * 0.22;
      for (let i = 0; i < 2; i++) {
        const waveProg = (t * 1.6 + i * 0.5) % 1.0;
        const wr = drawW * (0.06 + waveProg * 0.22);
        ctx.strokeStyle = `rgba(56, 189, 248, ${(1 - waveProg) * 0.85})`;
        ctx.lineWidth = Math.max(1.2, drawW * 0.018);
        ctx.beginPath();
        ctx.arc(dishX - waveProg * drawW * 0.12, dishY, wr, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // --- CHINOOK & COMBAT CHINOOK: Spinning Twin-Tandem Ligne-Claire Rotor Blades ---
    if (defId === 'USA_CHINOOK' || defId === 'USA_COMBAT_CHINOOK') {
      const rotors = [
        { x: -drawW * 0.20, y: -drawH * 0.23, rx: drawW * 0.28, ry: drawH * 0.11, dir: 1 },
        { x: drawW * 0.22, y: -drawH * 0.27, rx: drawW * 0.28, ry: drawH * 0.11, dir: -1 }
      ];
      for (const rt of rotors) {
        ctx.strokeStyle = 'rgba(38, 32, 27, 0.42)';
        ctx.lineWidth = Math.max(1.1, drawW * 0.015);
        ctx.beginPath();
        ctx.ellipse(rt.x, rt.y, rt.rx, rt.ry, 0, 0, Math.PI * 2);
        ctx.stroke();

        for (let b = 0; b < 3; b++) {
          const ba = t * 18.0 * rt.dir + (b * Math.PI * 2) / 3;
          ctx.strokeStyle = 'rgba(38, 32, 27, 0.72)';
          ctx.lineWidth = Math.max(1.5, drawW * 0.022);
          ctx.beginPath();
          ctx.moveTo(rt.x, rt.y);
          ctx.lineTo(rt.x + Math.cos(ba) * rt.rx, rt.y + Math.sin(ba) * rt.ry);
          ctx.stroke();
        }
      }
      // Combat Chinook gunfire flashes from side cabin ports
      if (defId === 'USA_COMBAT_CHINOOK') {
        const flashOn = Math.sin(t * 24.0) > 0.2;
        if (flashOn) {
          ctx.fillStyle = '#fbbf24';
          ctx.beginPath();
          ctx.arc(-drawW * 0.04, drawH * 0.04, Math.max(2.2, drawW * 0.035), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // --- COMANCHE: Spinning 5-Blade Stealth Main Rotor ---
    if (defId === 'USA_COMANCHE') {
      const rx = -drawW * 0.05;
      const ry = -drawH * 0.25;
      const radX = drawW * 0.36;
      const radY = drawH * 0.13;
      ctx.strokeStyle = 'rgba(38, 32, 27, 0.35)';
      ctx.lineWidth = Math.max(1.0, drawW * 0.014);
      ctx.beginPath();
      ctx.ellipse(rx, ry, radX, radY, 0, 0, Math.PI * 2);
      ctx.stroke();
      for (let b = 0; b < 5; b++) {
        const ba = t * 20.0 + (b * Math.PI * 2) / 5;
        ctx.strokeStyle = 'rgba(38, 32, 27, 0.68)';
        ctx.lineWidth = Math.max(1.4, drawW * 0.02);
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx + Math.cos(ba) * radX, ry + Math.sin(ba) * radY);
        ctx.stroke();
      }
    }

    // --- RAPTOR, KING RAPTOR, STEALTH FIGHTER & AURORA: Flickering Afterburner / Scramjet Plumes ---
    if (defId === 'USA_RAPTOR' || defId === 'USA_KING_RAPTOR' || defId === 'USA_AURORA' || defId === 'USA_AURORA_ALPHA' || defId === 'USA_STEALTH_FIGHTER') {
      const isAurora = defId.includes('AURORA');
      const exX = drawW * 0.36;
      const exY = -drawH * 0.08;
      const flk = 0.82 + 0.26 * Math.sin(t * 28.0);
      const pR = drawW * 0.065 * flk;
      ctx.fillStyle = isAurora
        ? (defId === 'USA_AURORA_ALPHA' ? 'rgba(245, 158, 11, 0.82)' : 'rgba(56, 189, 248, 0.82)')
        : 'rgba(251, 146, 60, 0.82)';
      ctx.beginPath();
      ctx.arc(exX, exY, pR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(exX, exY, pR * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- CHINA OVERLORD / EMPEROR OVERLORD / HELIX / ASSAULT CRAWLER: Propaganda Speaker Sonic Buff Waves ---
    if (
      defId === 'CHINA_EMPEROR_OVERLORD' ||
      defId === 'CHINA_ASSAULT_CRAWLER' ||
      defId === 'CHINA_ASSAULT_TROOP_CRAWLER' ||
      ((defId === 'CHINA_OVERLORD' || defId === 'CHINA_HELIX') &&
        u &&
        (u.overlordUpgrade === 'SPEAKER' || u.helixUpgrade === 'SPEAKER' || (u.def && u.def.isPropagandaCarrier) || p.showSpeakerWaves))
    ) {
      const spkX = drawW * 0.05;
      const spkY = -drawH * 0.30;
      for (let i = 0; i < 2; i++) {
        const waveProg = (t * 1.35 + i * 0.5) % 1.0;
        const wr = drawW * (0.08 + waveProg * 0.28);
        ctx.strokeStyle = `rgba(239, 68, 68, ${(1 - waveProg) * 0.78})`;
        ctx.lineWidth = Math.max(1.3, drawW * 0.018);
        ctx.beginPath();
        ctx.ellipse(spkX, spkY, wr, wr * 0.55, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // --- CHINA GATTLING TANK: Spinning Rotary Barrel Glint & Radar Dish Sweep ---
    if (defId === 'CHINA_GATTLING_TANK') {
      const rX = drawW * 0.06;
      const rY = -drawH * 0.28;
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.82)';
      ctx.lineWidth = Math.max(1.2, drawW * 0.018);
      ctx.beginPath();
      ctx.arc(rX, rY, drawW * 0.065, t * 5.5, t * 5.5 + 1.4);
      ctx.stroke();
    }

    // --- CHINA DRAGON TANK: Flickering Pressurized Pilot Flame Nozzle ---
    if (defId === 'CHINA_DRAGON_TANK') {
      const flX = -drawW * 0.36;
      const flY = -drawH * 0.08;
      const flR = drawW * (0.042 + 0.016 * Math.sin(t * 22.0));
      ctx.fillStyle = 'rgba(249, 115, 22, 0.88)';
      ctx.beginPath();
      ctx.arc(flX, flY, flR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(flX, flY, flR * 0.48, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- CHINA ECM TANK: Sweeping Emerald Electromagnetic Deflection Arcs ---
    if (defId === 'CHINA_ECM_TANK') {
      const domeX = -drawW * 0.04;
      const domeY = -drawH * 0.16;
      for (let i = 0; i < 2; i++) {
        const waveProg = (t * 1.5 + i * 0.5) % 1.0;
        const wr = drawW * (0.06 + waveProg * 0.20);
        ctx.strokeStyle = `rgba(16, 185, 129, ${(1 - waveProg) * 0.85})`;
        ctx.lineWidth = Math.max(1.2, drawW * 0.018);
        ctx.beginPath();
        ctx.arc(domeX - waveProg * drawW * 0.10, domeY, wr, Math.PI * 0.65, Math.PI * 1.35);
        ctx.stroke();
      }
    }

    // --- CHINA NUKE CANNON & NUKE BATTLEMASTER: Pulsing Isotope / Radiation Hazard Beacon ---
    if (defId === 'CHINA_NUKE_CANNON' || defId === 'CHINA_NUKE_BATTLEMASTER') {
      const hazX = defId === 'CHINA_NUKE_CANNON' ? -drawW * 0.06 : 0;
      const hazY = defId === 'CHINA_NUKE_CANNON' ? -drawH * 0.18 : -drawH * 0.22;
      const pulse = 0.55 + 0.45 * Math.sin(t * 6.5);
      ctx.fillStyle = `rgba(132, 204, 22, ${0.75 * pulse})`;
      ctx.beginPath();
      ctx.arc(hazX, hazY, drawW * 0.048, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- CHINA LISTENING OUTPOST & ATTACK OUTPOST: Rotating Reconnaissance Telemetry Sweep ---
    if (defId === 'CHINA_LISTENING_OUTPOST' || defId === 'CHINA_ATTACK_OUTPOST') {
      const dishX = 0;
      const dishY = -drawH * 0.28;
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.78)';
      ctx.lineWidth = Math.max(1.2, drawW * 0.017);
      ctx.beginPath();
      ctx.arc(dishX, dishY, drawW * 0.075, t * 4.2, t * 4.2 + 1.3);
      ctx.stroke();
    }

    // --- CHINA HELIX: Coaxial Counter-Rotating 8-Blade Assault Rotor Sweep ---
    if (defId === 'CHINA_HELIX') {
      const rx = -drawW * 0.02;
      const ry = -drawH * 0.27;
      const radX = drawW * 0.40;
      const radY = drawH * 0.14;
      ctx.strokeStyle = 'rgba(38, 32, 27, 0.36)';
      ctx.lineWidth = Math.max(1.1, drawW * 0.015);
      ctx.beginPath();
      ctx.ellipse(rx, ry, radX, radY, 0, 0, Math.PI * 2);
      ctx.stroke();
      for (let b = 0; b < 4; b++) {
        const ba1 = t * 18.0 + (b * Math.PI * 2) / 4;
        const ba2 = -t * 18.0 + (b * Math.PI * 2) / 4 + 0.4;
        ctx.strokeStyle = 'rgba(38, 32, 27, 0.68)';
        ctx.lineWidth = Math.max(1.4, drawW * 0.02);
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx + Math.cos(ba1) * radX, ry + Math.sin(ba1) * radY);
        ctx.moveTo(rx, ry - drawH * 0.03);
        ctx.lineTo(rx + Math.cos(ba2) * (radX * 0.92), ry - drawH * 0.03 + Math.sin(ba2) * (radY * 0.92));
        ctx.stroke();
      }
    }

    // --- CHINA MIG & TACTICAL NUKE MIG: Twin Crimson/Amber Afterburner Cones ---
    if (defId === 'CHINA_MIG' || defId === 'CHINA_NUKE_MIG' || defId === 'CHINA_TACTICAL_NUKEMIG') {
      const exX = drawW * 0.35;
      const exY = -drawH * 0.06;
      const flk = 0.84 + 0.25 * Math.sin(t * 30.0);
      const pR = drawW * 0.062 * flk;
      ctx.fillStyle = (defId === 'CHINA_NUKE_MIG' || defId === 'CHINA_TACTICAL_NUKEMIG') ? 'rgba(132, 204, 22, 0.85)' : 'rgba(249, 115, 22, 0.85)';
      ctx.beginPath();
      ctx.arc(exX, exY, pR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(exX, exY, pR * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- CHINA HACKER / SUPER HACKER / BLACK LOTUS: Cyber Uplink Pulse ---
    if (defId === 'CHINA_HACKER' || defId === 'CHINA_SUPER_HACKER' || defId === 'CHINA_BLACK_LOTUS') {
      const pulseProg = (t * 1.4) % 1.0;
      const pr = drawW * (0.05 + pulseProg * 0.14);
      ctx.strokeStyle = defId === 'CHINA_BLACK_LOTUS'
        ? `rgba(236, 72, 153, ${(1 - pulseProg) * 0.85})`
        : `rgba(16, 185, 129, ${(1 - pulseProg) * 0.85})`;
      ctx.lineWidth = Math.max(1.1, drawW * 0.016);
      ctx.beginPath();
      ctx.arc(drawW * 0.18, -drawH * 0.15, pr, 0, Math.PI * 2);
      ctx.stroke();
    }

    // --- Firing / Recoil Muzzle Burst ---
    if (recoil > 1.5) {
      const isLaser = defId.includes('LASER') || defId === 'USA_AVENGER' || defId === 'USA_MICROWAVE_TANK';
      const fx = -drawW * 0.44;
      const fy = -drawH * 0.08;
      const fR = (recoil / 6) * drawW * 0.14;
      ctx.fillStyle = isLaser ? 'rgba(56, 189, 248, 0.88)' : 'rgba(251, 191, 36, 0.90)';
      ctx.beginPath();
      ctx.arc(fx, fy, fR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(fx, fy, fR * 0.48, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
    return true;
  }

  const customParamsByUnit = {};

  function loadStoredParams() {
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem) {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            for (const [defId, params] of Object.entries(parsed)) {
              if (params && typeof params === 'object') {
                customParamsByUnit[defId] = Object.assign({}, params);
              }
            }
          }
        }
      }
    } catch (_) {
      // Ignore storage errors in sandboxed/headless environments
    }
  }

  function saveStoredParams() {
    try {
      if (typeof localStorage !== 'undefined' && localStorage.setItem) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(customParamsByUnit));
      }
    } catch (_) {
      // Ignore storage errors
    }
  }

  const DEEP_ENGINEERED_UNIT_IDS = new Set(Object.keys(MODEL_REGISTRY));
  const activePresetByUnit = {};

  loadStoredParams();

  function isDeepEngineeredUnit(defId) {
    return Boolean(defId && DEEP_ENGINEERED_UNIT_IDS.has(defId));
  }

  function hasBespokeModel(defId) {
    return Boolean(defId && MODEL_REGISTRY[defId]);
  }

  function getModelEntry(defId) {
    return (defId && MODEL_REGISTRY[defId]) || null;
  }

  function getParams(defId) {
    const entry = getModelEntry(defId);
    const defaults = entry ? entry.defaultParams : {};
    return Object.assign({}, defaults, customParamsByUnit[defId] || {});
  }

  function setParams(defId, newParams, persist = true) {
    if (!defId) return;
    const entry = getModelEntry(defId);
    const defaults = entry ? entry.defaultParams : {};
    customParamsByUnit[defId] = Object.assign({}, defaults, customParamsByUnit[defId] || {}, newParams || {});
    if (persist) saveStoredParams();
    return customParamsByUnit[defId];
  }

  function resetParams(defId, persist = true) {
    if (!defId) return;
    delete customParamsByUnit[defId];
    activePresetByUnit[defId] = 'DIORAMA_DEFAULT';
    if (persist) saveStoredParams();
    return getParams(defId);
  }

  function getActivePresetKey(defId) {
    return (defId && activePresetByUnit[defId]) || 'DIORAMA_DEFAULT';
  }

  function applyPreset(defId, presetKey, persist = true) {
    const entry = getModelEntry(defId);
    if (!entry || !entry.presets || !entry.presets[presetKey]) return getParams(defId);
    const preset = entry.presets[presetKey];
    activePresetByUnit[defId] = presetKey;
    customParamsByUnit[defId] = Object.assign({}, entry.defaultParams || {}, preset.params || {});
    if (persist) saveStoredParams();
    return customParamsByUnit[defId];
  }

  function cyclePreset(defId, persist = true) {
    const entry = getModelEntry(defId);
    if (!entry || !entry.presets) return null;
    const keys = Object.keys(entry.presets);
    if (!keys.length) return null;
    const curKey = getActivePresetKey(defId);
    const curIdx = keys.indexOf(curKey);
    const nextKey = keys[(curIdx + 1) % keys.length];
    applyPreset(defId, nextKey, persist);
    return { key: nextKey, preset: entry.presets[nextKey] };
  }

  function renderUnitIfBespoke(ctx, u, faction, options) {
    if (!u || !u.defId) return false;
    const opts = options || {};
    if (!opts.allowAllUnits && !DEEP_ENGINEERED_UNIT_IDS.has(u.defId)) return false;
    const entry = MODEL_REGISTRY[u.defId];
    if (!entry) return false;
    const params = getParams(u.defId);

    // By default, render the articulated 3D Ligne-Claire procedural rig (Crusader-style 360° hull,
    // independent 3D turret slewing, rolling treads/wheels/rotors, and 3D recoil).
    // Only use static 2D sprite overlay when explicitly requested via forceSprite or ILLUSTRATED_SPRITE mode.
    if ((opts.forceSprite || params.renderMode === 'ILLUSTRATED_SPRITE') && !opts.forceProcedural) {
      if (renderIllustratedUnitSprite(ctx, u, faction, entry, params, opts)) {
        return true;
      }
    }

    entry.render(ctx, u, faction, params, opts);
    return true;
  }

  return {
    MODEL_REGISTRY,
    DEEP_ENGINEERED_UNIT_IDS,
    CRUSADER_DEFAULT_PARAMS,
    CRUSADER_PARAM_SCHEMA,
    CRUSADER_PRESETS,
    TOMAHAWK_DEFAULT_PARAMS,
    TOMAHAWK_PARAM_SCHEMA,
    TOMAHAWK_PRESETS,
    DOZER_DEFAULT_PARAMS,
    DOZER_PARAM_SCHEMA,
    DOZER_PRESETS,
    isDeepEngineeredUnit,
    hasBespokeModel,
    getModelEntry,
    getParams,
    setParams,
    resetParams,
    getActivePresetKey,
    applyPreset,
    cyclePreset,
    renderUnitIfBespoke,
    renderIllustratedUnitSprite,
    renderCrusaderModel,
    renderPaladinModel,
    renderHumveeOrAvengerModel,
    renderTomahawkModel,
    renderAmbulanceModel,
    renderMicrowaveTankModel,
    renderBattleDroneModel,
    renderDozerModel,
    renderChinookModel,
    renderComancheModel,
    renderRaptorModel,
    renderStealthFighterModel,
    renderAuroraModel,
    renderInfantryModel,
    renderOverlordModel,
    renderChinaTankModel,
    renderChinaArtilleryModel,
    renderChinaWheeledModel,
    renderHelixModel,
    renderMigModel,
    renderGlaTankModel,
    renderGlaWheeledModel
  };
})();

if (typeof window !== 'undefined') window.ZH_UNIT_MODELS = ZH_UNIT_MODELS;
if (typeof module !== 'undefined' && module.exports) module.exports = ZH_UNIT_MODELS;
