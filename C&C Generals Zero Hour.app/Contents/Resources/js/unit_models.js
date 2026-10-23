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

  function lerp(a, b, t) {
    return a + (b - a) * t;
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

  const shadeCache = new Map();

  function shadeHex(hex, factor, alpha = 1) {
    const qFactor = Math.round(factor * 100);
    const cacheKey = alpha >= 0.999 ? `${hex}|${qFactor}` : null;
    if (cacheKey) {
      const hit = shadeCache.get(cacheKey);
      if (hit) return hit;
    }
    const rgb = hexToRgb(hex);
    let out;
    if (factor >= 1) {
      const t = clamp(factor - 1, 0, 1);
      out = rgbToCss({
        r: rgb.r + (255 - rgb.r) * t,
        g: rgb.g + (255 - rgb.g) * t,
        b: rgb.b + (255 - rgb.b) * t
      }, alpha);
    } else {
      const f = clamp(factor, 0, 1);
      out = rgbToCss({
        r: rgb.r * f,
        g: rgb.g * f,
        b: rgb.b * f
      }, alpha);
    }
    if (cacheKey) {
      if (shadeCache.size > 4096) shadeCache.clear();
      shadeCache.set(cacheKey, out);
    }
    return out;
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

  let activeStrokeScale = 1.0;

  function setZoomStrokeScale(zoom) {
    const z = clamp(Number(zoom) || 1.0, 0.5, 2.2);
    activeStrokeScale = clamp(1.12 / Math.sqrt(z), 0.78, 1.38);
  }

  function flushFaces(ctx, faceList) {
    faceList.sort((a, b) => a.depth - b.depth);
    for (let i = 0; i < faceList.length; i++) {
      const f = faceList[i];
      if (f.customDraw) {
        f.customDraw(ctx);
      } else {
        const lw = f.lineWidth ? f.lineWidth * activeStrokeScale : undefined;
        drawPolyPts(ctx, f.pts, f.fill, f.stroke, lw);
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

    // ========================================================================
    // 7B. Rear-Mounted Angled Engineering Crane Boom, Tension Cables & Hoist Hook
    //     (Matches assets/refs/china_dozer_diorama_ref.png!)
    // ========================================================================
    const isChinaDozer = Boolean(u && u.defId === 'CHINA_DOZER');
    if (p.showRearCrane === true || (isChinaDozer && p.showRearCrane !== false)) {
      const crBaseX = -0.82 * r * L;
      const crBaseZ = 0.56 * r * H;
      const crTipX = -1.48 * r * L;
      const crTipZ = 1.62 * r * H;
      const hookZ = 0.88 * r * H;

      // Rear winch pedestal housing behind cab
      pushBox3D(
        faces,
        proj,
        -0.98 * r * L,
        -0.66 * r * L,
        -0.28 * r * W,
        0.28 * r * W,
        0.42 * r * H,
        0.68 * r * H,
        yellowDark,
        seamCol,
        1.1,
        0.95
      );

      // Angled tubular crane boom arm extending up and aft
      pushTubeSegment3D(
        faces,
        proj,
        crBaseX,
        0,
        crBaseZ,
        Math.atan2(crTipZ - crBaseZ, crBaseX - crTipX),
        Math.PI,
        Math.hypot(crTipX - crBaseX, crTipZ - crBaseZ),
        0.095 * r,
        0.072 * r,
        yellowHi,
        seamCol,
        1.15,
        1.32
      );

      // Dual tension stay cables from cab roof to crane tip + pulley sheave + hanging hoist cable & hook
      faces.push({
        depth: proj.project(crTipX, 0, crTipZ).depth + 1.48,
        customDraw(c) {
          // Dual upper stay cables from rear of ROPS roof to boom tip
          for (const side of [-1, 1]) {
            drawLine3D(
              c,
              proj,
              -0.58 * r * L,
              side * 0.24 * r * W,
              1.18 * r * H,
              crTipX + 0.04 * r * L,
              side * 0.05 * r * W,
              crTipZ - 0.02 * r * H,
              '#475569',
              1.15
            );
          }

          // Vertical hanging hoist cable from boom tip to hook block
          drawLine3D(c, proj, crTipX, 0, crTipZ, crTipX, 0, hookZ, seamCol, 1.5);

          // Boom-tip pulley sheave wheel
          const tipPt = proj.project(crTipX, 0, crTipZ);
          c.fillStyle = '#475569';
          c.strokeStyle = seamCol;
          c.lineWidth = 1.2;
          c.beginPath();
          c.arc(tipPt.x, tipPt.y, Math.max(2.4, 0.09 * r), 0, Math.PI * 2);
          c.fill();
          c.stroke();

          // Hanging pulley block & curved steel crane hook
          const hkPt = proj.project(crTipX, 0, hookZ);
          c.fillStyle = yellowBase;
          c.strokeStyle = seamCol;
          c.lineWidth = 1.15;
          c.beginPath();
          c.arc(hkPt.x, hkPt.y, Math.max(2.2, 0.08 * r), 0, Math.PI * 2);
          c.fill();
          c.stroke();

          c.strokeStyle = seamCol;
          c.lineWidth = 2.0;
          c.beginPath();
          c.arc(hkPt.x + 1.0, hkPt.y + Math.max(3.5, 0.14 * r), Math.max(2.4, 0.09 * r), -Math.PI * 0.3, Math.PI * 1.1);
          c.stroke();
        }
      });
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
    const H = p.extrusionDepth || 1.0;
    const hullAngle = (u && u.angle !== undefined) ? u.angle : 0;
    const turretAngle = (u && u.turretAngle !== undefined) ? u.turretAngle : hullAngle;
    const recoil = (u && u.recoilOffset) || 0;
    const phase = (u && u.treadPhase) || (typeof performance !== 'undefined' ? (performance.now() * 0.003) % 1 : 0);
    const hoverZ = Math.sin(phase * Math.PI * 2) * 0.045 * r;
    const pitchScale = opts.pitchScale !== undefined ? opts.pitchScale : 1.0;
    const zScale = opts.zScale !== undefined ? opts.zScale : 0.42;

    const oliveBase = p.armorBaseColor || '#627048';
    const oliveHi = p.armorHighlightColor || '#7f8f61';
    const oliveDark = '#465233';
    const oliveDeep = '#333c24';
    const seamCol = p.panelLineColor || '#26201b';
    const glassCol = p.glassColor || '#6cc0e6';
    const sideGlassCol = '#4d7aa6';

    const proj = createProjector(hullAngle, pitchScale, zScale, 0, 0, 0, 0);

    // Soft Warm Diorama Drop Shadow (including rotor blades & tail shadow)
    const shadowPts = [
      proj.project(-1.38 * r * L, -0.58 * r * W, 0),
      proj.project(1.24 * r * L, -0.58 * r * W, 0),
      proj.project(1.24 * r * L, 0.58 * r * W, 0),
      proj.project(-1.38 * r * L, 0.58 * r * W, 0)
    ].map((pt) => ({ x: pt.x + 4.5, y: pt.y + 6.5 }));
    drawPolyPts(ctx, shadowPts, 'rgba(65, 50, 40, 0.28)', null, 0);

    const faces = [];

    // ========================================================================
    // 0. Retractable 3-Wheel Tricycle Landing Gear (2 Front Main + 1 Rear Tail Wheel)
    // ========================================================================
    for (const side of [-1, 1]) {
      const wy = side * 0.36 * r;
      const wx = 0.24 * r * L;
      faces.push({
        depth: proj.project(wx, wy, 0.10 * r + hoverZ).depth - 0.55,
        customDraw(c) {
          const sTop = proj.project(wx + 0.06 * r * L, wy * 0.80, 0.28 * r + hoverZ);
          const sKnee = proj.project(wx - 0.02 * r * L, wy * 0.95, 0.18 * r + hoverZ);
          const wPt = proj.project(wx, wy, 0.09 * r + hoverZ);
          // Oleo strut + torque link scissor
          c.strokeStyle = seamCol;
          c.lineWidth = 2.6;
          c.beginPath();
          c.moveTo(sTop.x, sTop.y);
          c.lineTo(wPt.x, wPt.y);
          c.stroke();
          c.strokeStyle = '#64748b';
          c.lineWidth = 1.4;
          c.beginPath();
          c.moveTo(sTop.x, sTop.y);
          c.lineTo(sKnee.x, sKnee.y);
          c.lineTo(wPt.x, wPt.y);
          c.stroke();

          // Rubber tire + metallic hubcap
          const rad = Math.max(2.4, 0.105 * r);
          c.fillStyle = '#1e293b';
          c.strokeStyle = seamCol;
          c.lineWidth = 1.1;
          c.beginPath();
          c.arc(wPt.x, wPt.y, rad, 0, Math.PI * 2);
          c.fill();
          c.stroke();
          c.fillStyle = '#64748b';
          c.beginPath();
          c.arc(wPt.x, wPt.y, rad * 0.45, 0, Math.PI * 2);
          c.fill();
        }
      });
    }
    // Rear Tail Landing Gear Wheel under Fenestron base (matching usa_comanche_diorama_ref.png!)
    faces.push({
      depth: proj.project(-1.02 * r * L, 0, 0.22 * r + hoverZ).depth - 0.50,
      customDraw(c) {
        const sTop = proj.project(-0.98 * r * L, 0, 0.36 * r + hoverZ);
        const wPt = proj.project(-1.04 * r * L, 0, 0.22 * r + hoverZ);
        c.strokeStyle = seamCol;
        c.lineWidth = 2.2;
        c.beginPath();
        c.moveTo(sTop.x, sTop.y);
        c.lineTo(wPt.x, wPt.y);
        c.stroke();
        const rad = Math.max(1.8, 0.075 * r);
        c.fillStyle = '#1e293b';
        c.strokeStyle = seamCol;
        c.lineWidth = 1.0;
        c.beginPath();
        c.arc(wPt.x, wPt.y, rad, 0, Math.PI * 2);
        c.fill();
        c.stroke();
        c.fillStyle = '#64748b';
        c.beginPath();
        c.arc(wPt.x, wPt.y, rad * 0.42, 0, Math.PI * 2);
        c.fill();
      }
    });

    // ========================================================================
    // 1. Stub-Wing Weapon Sponsons + Dual Under-Wing Pods (Hydra-70 + Hellfire)
    // ========================================================================
    if (p.showRocketPods !== false) {
      for (const side of [-1, 1]) {
        const yIn = side * 0.26 * r;
        const yOut = side * 0.86 * r * W;
        const yMin = Math.min(yIn, yOut);
        const yMax = Math.max(yIn, yOut);

        // Thick 3D Faceted Stub-Wing Pylon with beveled leading edge & tip plate
        pushBox3D(faces, proj, -0.22 * r * L, 0.24 * r * L, yMin, yMax, 0.30 * r + hoverZ, 0.43 * r + hoverZ, oliveHi, seamCol, 1.15, 0.08, 0.06 * r, 0.02 * r);
        // Angled wingtip endplate fairing
        const tipYMin = side < 0 ? yOut - 0.04 * r : yOut - 0.02 * r;
        const tipYMax = side < 0 ? yOut + 0.02 * r : yOut + 0.04 * r;
        pushBox3D(faces, proj, -0.24 * r * L, 0.26 * r * L, tipYMin, tipYMax, 0.25 * r + hoverZ, 0.45 * r + hoverZ, oliveDark, seamCol, 1.05, 0.12);

        // Inner Pod: 19-Tube Hydra-70 Cylindrical Pod with Silver Perforated Multi-Bore Faceplate
        const yHydra = side * 0.48 * r * W;
        const zHydra = 0.20 * r + hoverZ;
        pushTubeSegment3D(faces, proj, -0.26 * r * L, yHydra, zHydra, 0, 0, 0.52 * r * L, 0.105 * r, 0.105 * r, '#52525b', seamCol, 1.0, 0.04);
        pushTubeSegment3D(faces, proj, 0.22 * r * L, yHydra, zHydra, 0, 0, 0.09 * r * L, 0.105 * r, 0.098 * r, '#e2e8f0', seamCol, 0.95, 0.07);

        // Outer Pod: Dark Olive Multi-Tube / AGM-114 Pod with Gold Band Collar & Dark Bore Face
        const yOuter = side * 0.73 * r * W;
        const zOuter = 0.20 * r + hoverZ;
        const mSlide = clamp(recoil * 0.06 * r, 0, 0.32 * r);
        pushTubeSegment3D(faces, proj, -0.24 * r * L + mSlide, yOuter, zOuter, 0, 0, 0.50 * r * L, 0.095 * r, 0.095 * r, '#3f4734', seamCol, 1.0, 0.06);
        pushTubeSegment3D(faces, proj, 0.20 * r * L + mSlide, yOuter, zOuter, 0, 0, 0.10 * r * L, 0.095 * r, 0.088 * r, '#d97706', seamCol, 0.95, 0.09);

        // Detailed front rocket-bore circles on both pods + stub-wing panel seam
        faces.push({
          depth: proj.project(0.32 * r * L, yOuter, zOuter).depth + 0.16,
          customDraw(c) {
            // Stub-wing top panel line
            drawLine3D(c, proj, 0.02 * r * L, yIn, 0.435 * r + hoverZ, 0.02 * r * L, yOut, 0.435 * r + hoverZ, seamCol, 0.9);

            // Inner Hydra-70 silver face + 7 dark micro rocket tube bores
            const hFace = proj.project(0.315 * r * L, yHydra, zHydra);
            const hRad = Math.max(2.0, 0.09 * r);
            c.fillStyle = '#e2e8f0';
            c.strokeStyle = seamCol;
            c.lineWidth = 0.95;
            c.beginPath();
            c.arc(hFace.x, hFace.y, hRad, 0, Math.PI * 2);
            c.fill();
            c.stroke();
            c.fillStyle = '#1e293b';
            c.beginPath();
            c.arc(hFace.x, hFace.y, Math.max(0.7, hRad * 0.26), 0, Math.PI * 2);
            c.fill();
            for (let k = 0; k < 6; k++) {
              const ka = (k * Math.PI) / 3;
              c.beginPath();
              c.arc(hFace.x + Math.cos(ka) * hRad * 0.58, hFace.y + Math.sin(ka) * hRad * 0.58, Math.max(0.6, hRad * 0.22), 0, Math.PI * 2);
              c.fill();
            }

            // Outer pod dark multi-tube face with gold rim dots
            const oFace = proj.project(0.305 * r * L + mSlide, yOuter, zOuter);
            const oRad = Math.max(1.8, 0.082 * r);
            c.fillStyle = '#1e293b';
            c.strokeStyle = '#f59e0b';
            c.lineWidth = 1.1;
            c.beginPath();
            c.arc(oFace.x, oFace.y, oRad, 0, Math.PI * 2);
            c.fill();
            c.stroke();
            c.fillStyle = '#94a3b8';
            for (let k = 0; k < 5; k++) {
              const ka = (k * Math.PI * 2) / 5;
              c.beginPath();
              c.arc(oFace.x + Math.cos(ka) * oRad * 0.50, oFace.y + Math.sin(ka) * oRad * 0.50, Math.max(0.55, oRad * 0.22), 0, Math.PI * 2);
              c.fill();
            }
          }
        });
      }
    }

    // ========================================================================
    // 2. Multi-Tier Faceted Stealth Fuselage, Side Chine Sponsons & Tail Boom
    // ========================================================================
    // Lower V-hull belly pan
    const bellyBot = [
      [-1.22 * r * L, -0.07 * r, 0.32 * r + hoverZ],
      [-0.34 * r * L, -0.26 * r, 0.16 * r + hoverZ],
      [0.52 * r * L, -0.24 * r, 0.16 * r + hoverZ],
      [1.08 * r * L, -0.09 * r, 0.22 * r + hoverZ],
      [1.08 * r * L, 0.09 * r, 0.22 * r + hoverZ],
      [0.52 * r * L, 0.24 * r, 0.16 * r + hoverZ],
      [-0.34 * r * L, 0.26 * r, 0.16 * r + hoverZ],
      [-1.22 * r * L, 0.07 * r, 0.32 * r + hoverZ]
    ];
    // Mid-hull sharp stealth chine ridge (widest point of diamond cross-section)
    const chineLoop = [
      [-1.26 * r * L, -0.11 * r, 0.40 * r + hoverZ],
      [-0.36 * r * L, -0.42 * r, 0.34 * r + hoverZ],
      [0.48 * r * L, -0.38 * r, 0.32 * r + hoverZ],
      [1.14 * r * L, -0.14 * r, 0.28 * r + hoverZ],
      [1.14 * r * L, 0.14 * r, 0.28 * r + hoverZ],
      [0.48 * r * L, 0.38 * r, 0.32 * r + hoverZ],
      [-0.36 * r * L, 0.42 * r, 0.34 * r + hoverZ],
      [-1.26 * r * L, 0.11 * r, 0.40 * r + hoverZ]
    ];
    pushFrustumFaces(faces, proj, bellyBot, chineLoop, oliveDark, seamCol, 1.1, 0.22);

    // Upper faceted fuselage deck tapering inward to canopy sill & tail spine
    const deckTop = [
      [-1.22 * r * L, -0.08 * r, 0.58 * r + hoverZ],
      [-0.28 * r * L, -0.28 * r, 0.66 * r + hoverZ],
      [0.44 * r * L, -0.24 * r, 0.48 * r + hoverZ],
      [1.04 * r * L, -0.10 * r, 0.38 * r + hoverZ],
      [1.04 * r * L, 0.10 * r, 0.38 * r + hoverZ],
      [0.44 * r * L, 0.24 * r, 0.48 * r + hoverZ],
      [-0.28 * r * L, 0.28 * r, 0.66 * r + hoverZ],
      [-1.22 * r * L, 0.08 * r, 0.58 * r + hoverZ]
    ];
    pushFrustumFaces(faces, proj, chineLoop, deckTop, oliveBase, seamCol, 1.2, 0.35);

    // Forward Cheek Avionics / Landing-Gear Sponson Boxes (prominent in usa_comanche_diorama_ref.png!)
    for (const side of [-1, 1]) {
      const yIn = side * 0.26 * r;
      const yOut = side * 0.45 * r;
      pushBox3D(
        faces,
        proj,
        0.10 * r * L,
        0.54 * r * L,
        Math.min(yIn, yOut),
        Math.max(yIn, yOut),
        0.22 * r + hoverZ,
        0.36 * r + hoverZ,
        oliveHi,
        seamCol,
        1.1,
        0.42,
        0.04 * r,
        0.02 * r
      );
    }

    // ========================================================================
    // 3. Tall Sculpted T800 Engine Doghouse & Rotor Mast Pylon (behind Canopy)
    // ========================================================================
    const dogBot = [
      [-0.64 * r * L, -0.26 * r, 0.58 * r + hoverZ],
      [0.08 * r * L, -0.24 * r, 0.58 * r + hoverZ],
      [0.08 * r * L, 0.24 * r, 0.58 * r + hoverZ],
      [-0.64 * r * L, 0.26 * r, 0.58 * r + hoverZ]
    ];
    const dogTop = [
      [-0.48 * r * L, -0.16 * r, 0.84 * r + hoverZ],
      [0.04 * r * L, -0.16 * r, 0.86 * r + hoverZ],
      [0.04 * r * L, 0.16 * r, 0.86 * r + hoverZ],
      [-0.48 * r * L, 0.16 * r, 0.84 * r + hoverZ]
    ];
    pushFrustumFaces(faces, proj, dogBot, dogTop, oliveHi, seamCol, 1.15, 0.58);

    // Cylindrical Rotor Mast Collar below Hub
    pushCylinderZ3D(faces, proj, -0.06 * r * L, 0, 0.84 * r + hoverZ, 0.94 * r + hoverZ, 0.14 * r, 0.14 * r, 8, oliveDark, seamCol, 1.05, 0.72);

    // ========================================================================
    // 4. Shrouded Fenestron Tail Fin, Deep Fan Duct & Canted T-Tail Stabilizer
    // ========================================================================
    // Lower Thick Shrouded Fenestron Housing
    const fenBot = [
      [-1.42 * r * L, -0.10 * r, 0.34 * r + hoverZ],
      [-0.94 * r * L, -0.11 * r, 0.36 * r + hoverZ],
      [-0.94 * r * L, 0.11 * r, 0.36 * r + hoverZ],
      [-1.42 * r * L, 0.10 * r, 0.34 * r + hoverZ]
    ];
    const fenMid = [
      [-1.46 * r * L, -0.09 * r, 0.68 * r + hoverZ],
      [-0.96 * r * L, -0.10 * r, 0.70 * r + hoverZ],
      [-0.96 * r * L, 0.10 * r, 0.70 * r + hoverZ],
      [-1.46 * r * L, 0.09 * r, 0.68 * r + hoverZ]
    ];
    pushFrustumFaces(faces, proj, fenBot, fenMid, oliveBase, seamCol, 1.15, 0.62);

    // Upper Swept Vertical Fin Pylon supporting the T-Tail
    const finTop = [
      [-1.36 * r * L, -0.07 * r, 1.06 * r + hoverZ],
      [-1.06 * r * L, -0.07 * r, 1.06 * r + hoverZ],
      [-1.06 * r * L, 0.07 * r, 1.06 * r + hoverZ],
      [-1.36 * r * L, 0.07 * r, 1.06 * r + hoverZ]
    ];
    pushFrustumFaces(faces, proj, fenMid, finTop, oliveHi, seamCol, 1.15, 0.68);

    // Wide High-Mounted T-Tail Horizontal Stabilizer with Beveled Endplates
    pushBox3D(faces, proj, -1.40 * r * L, -1.02 * r * L, -0.44 * r, 0.44 * r, 1.04 * r + hoverZ, 1.12 * r + hoverZ, oliveHi, seamCol, 1.15, 0.82, 0.04 * r, 0.03 * r);

    // Deep Recessed Fenestron Circular Duct, Stator Vanes & 8-Blade Spinning Tail Rotor
    faces.push({
      depth: proj.project(-1.20 * r * L, 0, 0.54 * r + hoverZ).depth + 0.75,
      customDraw(c) {
        // T-Tail elevator seam line
        drawLine3D(c, proj, -1.30 * r * L, -0.40 * r, 1.125 * r + hoverZ, -1.30 * r * L, 0.40 * r, 1.125 * r + hoverZ, seamCol, 0.9);
        // Vertical fin panel seam
        drawLine3D(c, proj, -1.22 * r * L, -0.08 * r, 0.72 * r + hoverZ, -1.22 * r * L, -0.07 * r, 1.03 * r + hoverZ, seamCol, 0.9);
        drawLine3D(c, proj, -1.22 * r * L, 0.08 * r, 0.72 * r + hoverZ, -1.22 * r * L, 0.07 * r, 1.03 * r + hoverZ, seamCol, 0.9);

        for (const side of [-1, 1]) {
          const fPt = proj.project(-1.20 * r * L, side * 0.11 * r, 0.53 * r + hoverZ);
          const fRad = Math.max(2.6, 0.155 * r);
          // Outer dark shroud bezel
          c.fillStyle = oliveDeep;
          c.strokeStyle = seamCol;
          c.lineWidth = 1.15;
          c.beginPath();
          c.ellipse(fPt.x, fPt.y, fRad, fRad * 0.90, 0, 0, Math.PI * 2);
          c.fill();
          c.stroke();

          // Inner deep shadow ring
          c.fillStyle = '#141812';
          c.beginPath();
          c.ellipse(fPt.x, fPt.y, fRad * 0.82, fRad * 0.74, 0, 0, Math.PI * 2);
          c.fill();

          // 8 Spinning Fenestron Fan Blades
          c.strokeStyle = '#7c8a66';
          c.lineWidth = 1.15;
          const fanA = phase * Math.PI * 4;
          for (let fb = 0; fb < 4; fb++) {
            const a = fanA + (fb * Math.PI) / 4;
            c.beginPath();
            c.moveTo(fPt.x - Math.cos(a) * fRad * 0.78, fPt.y - Math.sin(a) * fRad * 0.70);
            c.lineTo(fPt.x + Math.cos(a) * fRad * 0.78, fPt.y + Math.sin(a) * fRad * 0.70);
            c.stroke();
          }
          // Central tail gearbox hub
          c.fillStyle = oliveHi;
          c.strokeStyle = seamCol;
          c.lineWidth = 0.9;
          c.beginPath();
          c.arc(fPt.x, fPt.y, Math.max(1.2, fRad * 0.32), 0, Math.PI * 2);
          c.fill();
          c.stroke();
        }
      }
    });

    // ========================================================================
    // 5. 3D Stepped Tandem Cockpit Canopy (With Both Roof AND Sloped Side Windows!)
    // ========================================================================
    // Build true 3D canopy volume so side glass panes are clearly visible in 3/4 view!
    const canBot = [
      [-0.02 * r * L, -0.22 * r, 0.56 * r + hoverZ],
      [0.44 * r * L, -0.21 * r, 0.47 * r + hoverZ],
      [0.88 * r * L, -0.12 * r, 0.38 * r + hoverZ],
      [0.88 * r * L, 0.12 * r, 0.38 * r + hoverZ],
      [0.44 * r * L, 0.21 * r, 0.47 * r + hoverZ],
      [-0.02 * r * L, 0.22 * r, 0.56 * r + hoverZ]
    ];
    const canTop = [
      [-0.04 * r * L, -0.15 * r, 0.78 * r + hoverZ],
      [0.38 * r * L, -0.15 * r, 0.69 * r + hoverZ],
      [0.72 * r * L, -0.09 * r, 0.53 * r + hoverZ],
      [0.72 * r * L, 0.09 * r, 0.53 * r + hoverZ],
      [0.38 * r * L, 0.15 * r, 0.69 * r + hoverZ],
      [-0.04 * r * L, 0.15 * r, 0.78 * r + hoverZ]
    ];
    pushFrustumFaces(faces, proj, canBot, canTop, oliveBase, seamCol, 1.15, 0.65);

    // 2-Tier Nose EO/IR TADS/PNVS Optical Sensor Turret Stack (matching usa_comanche_diorama_ref.png!)
    pushBox3D(faces, proj, 0.88 * r * L, 1.16 * r * L, -0.13 * r, 0.13 * r, 0.25 * r + hoverZ, 0.39 * r + hoverZ, oliveBase, seamCol, 1.1, 0.72, 0.04 * r, 0.02 * r);
    pushBox3D(faces, proj, 0.86 * r * L, 1.06 * r * L, -0.09 * r, 0.09 * r, 0.39 * r + hoverZ, 0.48 * r + hoverZ, oliveHi, seamCol, 1.05, 0.76, 0.03 * r, 0.02 * r);

    const gunProj = createProjector(turretAngle, pitchScale, zScale, 0.94 * r * L, 0, 0.20 * r + hoverZ, hullAngle);

    faces.push({
      depth: proj.project(0.46 * r * L, 0, 0.68 * r + hoverZ).depth + 0.92,
      customDraw(c) {
        // Fuselage Chines, Access Panels, Engine Intakes & Tail Boom Seams
        for (const side of [-1, 1]) {
          // Sharp chine line from nose to tail
          drawLine3D(c, proj, -1.20 * r * L, side * 0.11 * r, 0.41 * r + hoverZ, -0.34 * r * L, side * 0.42 * r, 0.35 * r + hoverZ, seamCol, 1.1);
          drawLine3D(c, proj, -0.34 * r * L, side * 0.42 * r, 0.35 * r + hoverZ, 0.98 * r * L, side * 0.15 * r, 0.30 * r + hoverZ, seamCol, 1.1);
          // Vertical panel ribs on tail boom & mid fuselage
          drawLine3D(c, proj, -0.78 * r * L, side * 0.22 * r, 0.37 * r + hoverZ, -0.76 * r * L, side * 0.16 * r, 0.59 * r + hoverZ, seamCol, 0.9);
          drawLine3D(c, proj, -0.46 * r * L, side * 0.36 * r, 0.35 * r + hoverZ, -0.44 * r * L, side * 0.24 * r, 0.62 * r + hoverZ, seamCol, 0.9);

          // Trapezoidal Dark Turbine Air Intake on Engine Doghouse Flank
          const intakePts = [
            proj.project(-0.18 * r * L, side * 0.25 * r, 0.56 * r + hoverZ),
            proj.project(0.02 * r * L, side * 0.23 * r, 0.54 * r + hoverZ),
            proj.project(-0.02 * r * L, side * 0.19 * r, 0.67 * r + hoverZ),
            proj.project(-0.16 * r * L, side * 0.21 * r, 0.65 * r + hoverZ)
          ];
          drawPolyPts(c, intakePts, '#1e293b', seamCol, 1.0);

          // Circular avionics cooling port on doghouse flank
          const portPt = proj.project(-0.28 * r * L, side * 0.24 * r, 0.68 * r + hoverZ);
          c.fillStyle = '#1e293b';
          c.beginPath();
          c.arc(portPt.x, portPt.y, Math.max(1.2, 0.04 * r), 0, Math.PI * 2);
          c.fill();

          // Sloped Side Cockpit Glass Windows (Rear Pilot Side Pane + Front Gunner Side Pane with White Reflection Slashes!)
          const yBot = side * 0.215 * r;
          const yTop = side * 0.155 * r;
          const rearSideWin = [
            [-0.01 * r * L, yBot, 0.57 * r + hoverZ],
            [0.38 * r * L, yBot * 0.96, 0.49 * r + hoverZ],
            [0.35 * r * L, yTop, 0.68 * r + hoverZ],
            [-0.03 * r * L, yTop, 0.76 * r + hoverZ]
          ];
          const frontSideWin = [
            [0.42 * r * L, yBot * 0.94, 0.48 * r + hoverZ],
            [0.82 * r * L, side * 0.125 * r, 0.39 * r + hoverZ],
            [0.69 * r * L, side * 0.095 * r, 0.52 * r + hoverZ],
            [0.39 * r * L, yTop, 0.67 * r + hoverZ]
          ];
          drawGlassPane3D(c, proj, rearSideWin, sideGlassCol, seamCol, 1.1);
          drawGlassPane3D(c, proj, frontSideWin, sideGlassCol, seamCol, 1.1);
        }

        // Dark square sensor aperture on front face of rotor pylon above rear canopy
        const pylonSensor = [
          proj.project(0.05 * r * L, -0.07 * r, 0.78 * r + hoverZ),
          proj.project(0.05 * r * L, 0.07 * r, 0.78 * r + hoverZ),
          proj.project(0.03 * r * L, 0.06 * r, 0.84 * r + hoverZ),
          proj.project(0.03 * r * L, -0.06 * r, 0.84 * r + hoverZ)
        ];
        drawPolyPts(c, pylonSensor, '#1e293b', seamCol, 0.9);

        // 3 Bright Sky-Blue Top Canopy Roof Panes + Sloped Front Windshield
        const rearRoofPane = [
          [-0.03 * r * L, -0.145 * r, 0.785 * r + hoverZ],
          [-0.03 * r * L, 0.145 * r, 0.785 * r + hoverZ],
          [0.36 * r * L, 0.145 * r, 0.695 * r + hoverZ],
          [0.36 * r * L, -0.145 * r, 0.695 * r + hoverZ]
        ];
        const midRoofPane = [
          [0.39 * r * L, -0.145 * r, 0.688 * r + hoverZ],
          [0.39 * r * L, 0.145 * r, 0.688 * r + hoverZ],
          [0.70 * r * L, 0.088 * r, 0.535 * r + hoverZ],
          [0.70 * r * L, -0.088 * r, 0.535 * r + hoverZ]
        ];
        const frontWindshield = [
          [0.72 * r * L, -0.088 * r, 0.528 * r + hoverZ],
          [0.72 * r * L, 0.088 * r, 0.528 * r + hoverZ],
          [0.92 * r * L, 0.105 * r, 0.39 * r + hoverZ],
          [0.92 * r * L, -0.105 * r, 0.39 * r + hoverZ]
        ];
        drawGlassPane3D(c, proj, rearRoofPane, glassCol, seamCol, 1.1);
        drawGlassPane3D(c, proj, midRoofPane, glassCol, seamCol, 1.1);
        drawGlassPane3D(c, proj, frontWindshield, glassCol, seamCol, 1.15);

        // Glowing Red/Orange FLIR Optical Window + Yellow Laser Brow on Nose Turret
        const flirQuad = [
          proj.project(1.165 * r * L, -0.06 * r, 0.27 * r + hoverZ),
          proj.project(1.165 * r * L, 0.06 * r, 0.27 * r + hoverZ),
          proj.project(1.155 * r * L, 0.06 * r, 0.35 * r + hoverZ),
          proj.project(1.155 * r * L, -0.06 * r, 0.35 * r + hoverZ)
        ];
        drawPolyPts(c, flirQuad, '#ef4444', seamCol, 0.95);
        drawLine3D(c, proj, 1.15 * r * L, -0.06 * r, 0.37 * r + hoverZ, 1.15 * r * L, 0.06 * r, 0.37 * r + hoverZ, '#fde047', 1.8);

        // Articulated 3-Barrel 20mm XM301 Nose Gatling Cannon + Gun Cradle + Dual Barrel Bands
        if (p.showNoseGatling !== false) {
          const bLen = p.barrelLength || 1.0;
          // Gun cradle housing under nose chin
          drawLine3D(c, gunProj, -0.06 * r * L, 0, 0.02 * r, 0.16 * r * L, 0, 0, '#334155', 4.2);
          // 3 parallel 20mm barrels
          for (const bOff of [-0.038 * r, 0, 0.038 * r]) {
            drawLine3D(c, gunProj, 0.04 * r * L, bOff, 0, 0.58 * r * L * bLen, bOff, -0.05 * r, seamCol, 2.2);
            drawLine3D(c, gunProj, 0.04 * r * L, bOff, 0, 0.58 * r * L * bLen, bOff, -0.05 * r, '#475569', 1.15);
          }
          // Mid & muzzle barrel clamp bands
          for (const bx of [0.32 * r * L * bLen, 0.52 * r * L * bLen]) {
            const bz = (-0.05 * r * bx) / (0.58 * r * L * bLen);
            drawLine3D(c, gunProj, bx, -0.048 * r, bz, bx, 0.048 * r, bz, '#cbd5e1', 1.9);
          }

          if (recoil > 0.6) {
            const muzPt = gunProj.project(0.62 * r * L * bLen, 0, -0.055 * r);
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

    // ========================================================================
    // 6. 3D 5-Blade Swept-Tip Stealth Main Rotor Assembly & Hub Turret
    // ========================================================================
    if (p.showMainRotor !== false) {
      const rSpan = 1.24 * r * (p.rotorSpan || 1.0);
      const zRotor = 0.95 * r + hoverZ;
      const hubX = -0.06 * r * L;
      const hubPt = proj.project(hubX, 0, zRotor);
      const baseA = phase * Math.PI * 2;
      const chord = 0.082 * r;

      ctx.save();
      // Subtle rotor motion-blur ring
      ctx.strokeStyle = 'rgba(38, 32, 27, 0.16)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(hubPt.x, hubPt.y, rSpan, rSpan * pitchScale, 0, 0, Math.PI * 2);
      ctx.stroke();

      for (let b = 0; b < 5; b++) {
        const a = baseA + (b * Math.PI * 2) / 5;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const pa = -sa * chord;
        const pb = ca * chord;

        // Blade root cuff fairing
        const cuffPts = [
          proj.project(hubX + ca * rSpan * 0.08 - pa * 0.38, sa * rSpan * 0.08 - pb * 0.38, zRotor),
          proj.project(hubX + ca * rSpan * 0.20 - pa * 0.45, sa * rSpan * 0.20 - pb * 0.45, zRotor),
          proj.project(hubX + ca * rSpan * 0.20 + pa * 0.45, sa * rSpan * 0.20 + pb * 0.45, zRotor),
          proj.project(hubX + ca * rSpan * 0.08 + pa * 0.38, sa * rSpan * 0.08 + pb * 0.38, zRotor)
        ];
        drawPolyPts(ctx, cuffPts, oliveDark, seamCol, 0.95);

        // Swept-tip stealth rotor blade polygon (matching usa_comanche_diorama_ref.png!)
        const bladePts = [
          proj.project(hubX + ca * rSpan * 0.18 - pa * 0.48, sa * rSpan * 0.18 - pb * 0.48, zRotor),
          proj.project(hubX + ca * rSpan * 0.88 - pa * 0.65, sa * rSpan * 0.88 - pb * 0.65, zRotor),
          proj.project(hubX + ca * rSpan * 1.00 + pa * 0.25, sa * rSpan * 1.00 + pb * 0.25, zRotor),
          proj.project(hubX + ca * rSpan * 0.86 + pa * 0.82, sa * rSpan * 0.86 + pb * 0.82, zRotor),
          proj.project(hubX + ca * rSpan * 0.18 + pa * 0.48, sa * rSpan * 0.18 + pb * 0.48, zRotor)
        ];
        drawPolyPts(ctx, bladePts, '#475246', seamCol, 1.05);

        // Leading-edge metallic erosion strip highlight
        drawLine3D(
          ctx,
          proj,
          hubX + ca * rSpan * 0.22 - pa * 0.35,
          sa * rSpan * 0.22 - pb * 0.35,
          zRotor,
          hubX + ca * rSpan * 0.86 - pa * 0.50,
          sa * rSpan * 0.86 - pb * 0.50,
          zRotor,
          '#7c8a7a',
          1.15
        );
      }

      // Sculpted 2-Tier Olive Stealth Rotor Hub Cap
      const hubR = Math.max(3.2, 0.16 * r);
      ctx.fillStyle = oliveBase;
      ctx.strokeStyle = seamCol;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(hubPt.x, hubPt.y, hubR, hubR * 0.78, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = oliveHi;
      ctx.beginPath();
      ctx.ellipse(hubPt.x, hubPt.y - 1.2, hubR * 0.78, hubR * 0.56, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
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
    const H = p.extrusionDepth || 1.0;
    const hullAngle = (u && u.angle !== undefined) ? u.angle : 0;
    const recoil = (u && u.recoilOffset) || 0;
    const phase = (u && u.treadPhase) || (typeof performance !== 'undefined' ? (performance.now() * 0.003) % 1 : 0);
    const hoverZ = Math.sin(phase * Math.PI * 2) * 0.038 * r;
    const pitchScale = opts.pitchScale !== undefined ? opts.pitchScale : 1.0;
    const zScale = opts.zScale !== undefined ? opts.zScale : 0.42;

    const greyBase = p.armorBaseColor || '#94a3b8';
    const greyHi = '#cbd5e1';
    const slateCamo = p.camoPatchColor || '#64748b';
    const slateDark = '#475569';
    const seamCol = p.panelLineColor || '#26201b';
    const canopyCol = p.canopyColor || '#d99b26';

    const proj = createProjector(hullAngle, pitchScale, zScale, 0, 0, 0, 0);

    // Full Jet Silhouette Ground Shadow
    const shadowPts = [
      proj.project(-1.26 * r * L, -1.12 * r * W, 0),
      proj.project(1.42 * r * L, 0, 0),
      proj.project(-1.26 * r * L, 1.12 * r * W, 0)
    ].map((pt) => ({ x: pt.x + 5.0, y: pt.y + 7.0 }));
    drawPolyPts(ctx, shadowPts, 'rgba(65, 50, 40, 0.28)', null, 0);

    const faces = [];
    const zWing = 0.28 * r * H + hoverZ;

    // ========================================================================
    // 1. 2D Thrust-Vectoring Rectangular Nozzles, Central Tail Boom & Amber Afterburners
    // ========================================================================
    for (const side of [-1, 1]) {
      const ny = side * 0.18 * r;
      // Metallic heat-shielded rectangular vectoring nozzle petals
      pushBox3D(faces, proj, -1.16 * r * L, -0.92 * r * L, ny - 0.10 * r, ny + 0.10 * r, zWing - 0.01 * r, zWing + 0.12 * r, '#78716c', seamCol, 1.05, 0.10, 0.03 * r, 0.02 * r);
      pushBox3D(faces, proj, -1.22 * r * L, -1.10 * r * L, ny - 0.08 * r, ny + 0.08 * r, zWing + 0.01 * r, zWing + 0.10 * r, '#d97706', seamCol, 0.95, 0.11);
    }
    // Central tail-sting boom between the twin nozzles (matching usa_raptor_diorama_ref.png!)
    pushBox3D(faces, proj, -1.20 * r * L, -0.90 * r * L, -0.05 * r, 0.05 * r, zWing + 0.02 * r, zWing + 0.12 * r, greyBase, seamCol, 0.95, 0.12, 0.04 * r, 0.02 * r);

    if (p.showAfterburners !== false) {
      const surge = 1.0 + Math.sin(phase * Math.PI * 6) * 0.08 + clamp(recoil * 0.08, 0, 0.35);
      faces.push({
        depth: proj.project(-1.36 * r * L, 0, zWing).depth - 0.5,
        customDraw(c) {
          for (const side of [-1, 1]) {
            const ny = side * 0.18 * r;
            const p0 = proj.project(-1.14 * r * L, ny, zWing + 0.05 * r);
            const p1 = proj.project(-1.68 * r * L * surge, ny * 1.06, zWing + 0.05 * r);
            const pMid = proj.project(-1.42 * r * L * surge, ny * 1.03, zWing + 0.05 * r);
            // Outer warm orange afterburner plume
            c.strokeStyle = 'rgba(249, 115, 22, 0.85)';
            c.lineWidth = 5.2;
            c.lineCap = 'round';
            c.beginPath();
            c.moveTo(p0.x, p0.y);
            c.lineTo(p1.x, p1.y);
            c.stroke();
            // Mid golden-amber shock cone
            c.strokeStyle = '#fbbf24';
            c.lineWidth = 3.2;
            c.beginPath();
            c.moveTo(p0.x, p0.y);
            c.lineTo(pMid.x, pMid.y);
            c.stroke();
            // White-hot shock diamond core
            c.strokeStyle = '#fef9c3';
            c.lineWidth = 1.6;
            c.beginPath();
            c.moveTo(p0.x, p0.y);
            c.lineTo((p0.x + pMid.x) * 0.55, (p0.y + pMid.y) * 0.55);
            c.stroke();
          }
        }
      });
    }

    // ========================================================================
    // 2. Under-Wing Ordnance: Outer White Finned AIM-9X + Inner Slate/Amber AMRAAM/JDAM
    // ========================================================================
    if (p.showWingMissiles !== false) {
      const mSlide = clamp(recoil * 0.09 * r, 0, 0.45 * r);
      for (const side of [-1, 1]) {
        // Inner Heavy Strike Missile / JDAM (Slate body + Golden-Amber nose cone protruding ahead of leading edge!)
        const yIn = side * 0.54 * r * W;
        pushTubeSegment3D(faces, proj, -0.34 * r * L + mSlide, yIn, zWing - 0.06 * r, 0, 0, 0.58 * r * L, 0.062 * r, 0.062 * r, '#475569', seamCol, 0.95, 0.04);
        pushTubeSegment3D(faces, proj, 0.22 * r * L + mSlide, yIn, zWing - 0.06 * r, 0, 0, 0.16 * r * L, 0.062 * r, 0.025 * r, '#f59e0b', seamCol, 0.9, 0.06);

        // Outer AIM-9X White Air-to-Air Missile with Cruciform Forward Canard Fins & Seeker Tip
        const yOut = side * 0.78 * r * W;
        pushTubeSegment3D(faces, proj, -0.36 * r * L, yOut, zWing - 0.05 * r, 0, 0, 0.62 * r * L, 0.048 * r, 0.048 * r, '#f8fafc', seamCol, 0.95, 0.05);
        faces.push({
          depth: proj.project(0.20 * r * L, yOut, zWing - 0.05 * r).depth - 0.12,
          customDraw(c) {
            // Forward cruciform steering fins on AIM-9X (visible in usa_raptor_diorama_ref.png!)
            drawLine3D(c, proj, 0.14 * r * L, yOut - 0.08 * r, zWing - 0.05 * r, 0.08 * r * L, yOut + 0.08 * r, zWing - 0.05 * r, seamCol, 1.5);
            drawLine3D(c, proj, 0.14 * r * L, yOut, zWing - 0.11 * r, 0.08 * r * L, yOut, zWing + 0.01 * r, seamCol, 1.5);
            // Dark seeker tip
            drawLine3D(c, proj, 0.24 * r * L, yOut, zWing - 0.05 * r, 0.30 * r * L, yOut, zWing - 0.05 * r, seamCol, 2.2);
          }
        });
      }
    }

    // ========================================================================
    // 3. Swept Horizontal Tailerons (with Two-Tone Slate Camo Patch)
    // ========================================================================
    for (const side of [-1, 1]) {
      const tBot = [
        [-1.20 * r * L, side * 0.24 * r * W, zWing - 0.02 * r],
        [-1.08 * r * L, side * 0.78 * r * W, zWing - 0.02 * r],
        [-0.78 * r * L, side * 0.68 * r * W, zWing - 0.02 * r],
        [-0.70 * r * L, side * 0.24 * r * W, zWing - 0.02 * r]
      ];
      if (side < 0) tBot.reverse();
      const tTop = tBot.map((v) => [v[0], v[1], v[2] + 0.055 * r]);
      pushFrustumFaces(faces, proj, tBot, tTop, greyBase, seamCol, 1.1, 0.15);

      faces.push({
        depth: proj.project(-0.95 * r * L, side * 0.50 * r * W, zWing + 0.04 * r).depth + 0.18,
        customDraw(c) {
          const tCamo = [
            proj.project(-1.12 * r * L, side * 0.32 * r * W, zWing + 0.038 * r),
            proj.project(-1.04 * r * L, side * 0.68 * r * W, zWing + 0.038 * r),
            proj.project(-0.84 * r * L, side * 0.58 * r * W, zWing + 0.038 * r),
            proj.project(-0.80 * r * L, side * 0.30 * r * W, zWing + 0.038 * r)
          ];
          drawPolyPts(c, tCamo, slateCamo, null, 0);
        }
      });
    }

    // ========================================================================
    // 4. Deep Caretaker Cheek Air Intakes & Forward Chined Fuselage Trunk
    // ========================================================================
    for (const side of [-1, 1]) {
      const iy = side * 0.28 * r * W;
      // Outer intake housing box under forward wing root
      pushBox3D(faces, proj, -0.08 * r * L, 0.58 * r * L, iy - 0.12 * r, iy + 0.12 * r, zWing - 0.13 * r, zWing + 0.02 * r, slateDark, seamCol, 1.15, 0.16);
      // Dark recessed intake mouth on front face (matching usa_raptor_diorama_ref.png!)
      faces.push({
        depth: proj.project(0.59 * r * L, iy, zWing - 0.06 * r).depth + 0.20,
        customDraw(c) {
          const mPts = [
            proj.project(0.585 * r * L, iy - 0.09 * r, zWing - 0.11 * r),
            proj.project(0.585 * r * L, iy + 0.09 * r, zWing - 0.11 * r),
            proj.project(0.565 * r * L, iy + 0.09 * r, zWing - 0.01 * r),
            proj.project(0.565 * r * L, iy - 0.09 * r, zWing - 0.01 * r)
          ];
          drawPolyPts(c, mPts, '#0f172a', seamCol, 1.0);
        }
      });
    }

    // ========================================================================
    // 5. Diamond Delta Main Wings + Chined Forward Fuselage
    // ========================================================================
    const wingBot = [
      [-0.96 * r * L, -0.44 * r * W, zWing - 0.02 * r],
      [-0.56 * r * L, -1.20 * r * W, zWing - 0.02 * r],
      [-0.14 * r * L, -1.12 * r * W, zWing - 0.02 * r],
      [0.44 * r * L, -0.36 * r * W, zWing],
      [0.84 * r * L, -0.22 * r * W, zWing],
      [1.40 * r * L, 0, zWing],
      [0.84 * r * L, 0.22 * r * W, zWing],
      [0.44 * r * L, 0.36 * r * W, zWing],
      [-0.14 * r * L, 1.12 * r * W, zWing - 0.02 * r],
      [-0.56 * r * L, 1.20 * r * W, zWing - 0.02 * r],
      [-0.96 * r * L, 0.44 * r * W, zWing - 0.02 * r]
    ];
    const wingTop = wingBot.map((v) => [v[0], v[1], v[2] + 0.08 * r]);
    pushFrustumFaces(faces, proj, wingBot, wingTop, greyBase, seamCol, 1.2, 0.24);

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

    // ========================================================================
    // 6. Sculpted Raised Spine + Twin F119 Engine Nacelle Humps
    // ========================================================================
    const spineBot = [
      [-0.96 * r * L, -0.28 * r, zWing + 0.07 * r],
      [0.36 * r * L, -0.28 * r, zWing + 0.07 * r],
      [0.98 * r * L, -0.14 * r, zWing + 0.07 * r],
      [0.98 * r * L, 0.14 * r, zWing + 0.07 * r],
      [0.36 * r * L, 0.28 * r, zWing + 0.07 * r],
      [-0.96 * r * L, 0.28 * r, zWing + 0.07 * r]
    ];
    const spineTop = [
      [-0.92 * r * L, -0.20 * r, zWing + 0.23 * r],
      [0.28 * r * L, -0.20 * r, zWing + 0.25 * r],
      [0.88 * r * L, -0.10 * r, zWing + 0.16 * r],
      [0.88 * r * L, 0.10 * r, zWing + 0.16 * r],
      [0.28 * r * L, 0.20 * r, zWing + 0.25 * r],
      [-0.92 * r * L, 0.20 * r, zWing + 0.23 * r]
    ];
    pushFrustumFaces(faces, proj, spineBot, spineTop, greyBase, seamCol, 1.1, 0.44);

    // ========================================================================
    // 7. Rich Wing & Spine Camo Patches, Flaperons, Louvers, Radome & USAF Insignia
    // ========================================================================
    faces.push({
      depth: proj.project(0.05 * r * L, 0, zWing + 0.25 * r).depth + 0.56,
      customDraw(c) {
        // Central Slate-Blue Camo Saddle across Mid-Spine & Wing Roots
        const centerCamo = [
          proj.project(-0.42 * r * L, -0.20 * r, zWing + 0.24 * r),
          proj.project(0.28 * r * L, -0.20 * r, zWing + 0.25 * r),
          proj.project(0.28 * r * L, 0.20 * r, zWing + 0.25 * r),
          proj.project(-0.42 * r * L, 0.20 * r, zWing + 0.24 * r)
        ];
        drawPolyPts(c, centerCamo, slateCamo, null, 0);

        // Light Gull-Grey Dorsal Spine Strip between Twin Tails (matching usa_raptor_diorama_ref.png!)
        const aftStrip = [
          proj.project(-0.92 * r * L, -0.07 * r, zWing + 0.245 * r),
          proj.project(-0.34 * r * L, -0.07 * r, zWing + 0.245 * r),
          proj.project(-0.34 * r * L, 0.07 * r, zWing + 0.245 * r),
          proj.project(-0.92 * r * L, 0.07 * r, zWing + 0.245 * r)
        ];
        drawPolyPts(c, aftStrip, greyHi, seamCol, 0.85);
        // Dark circular fuel/APU cap at front of dorsal strip
        const apuPt = proj.project(-0.38 * r * L, 0, zWing + 0.25 * r);
        c.fillStyle = '#334155';
        c.beginPath();
        c.arc(apuPt.x, apuPt.y, Math.max(1.5, 0.05 * r), 0, Math.PI * 2);
        c.fill();

        // Dark Trapezoidal Auxiliary Louver / Airbrake Panel directly behind Canopy
        const louverBack = [
          proj.project(0.06 * r * L, -0.09 * r, zWing + 0.255 * r),
          proj.project(0.18 * r * L, -0.08 * r, zWing + 0.255 * r),
          proj.project(0.18 * r * L, 0.08 * r, zWing + 0.255 * r),
          proj.project(0.06 * r * L, 0.09 * r, zWing + 0.255 * r)
        ];
        drawPolyPts(c, louverBack, '#334155', seamCol, 0.85);

        for (const side of [-1, 1]) {
          // Large Multi-Point Slate-Blue Camo Patch on Each Delta Wing
          const wingCamo = [
            proj.project(-0.68 * r * L, side * 0.42 * r * W, zWing + 0.085 * r),
            proj.project(-0.48 * r * L, side * 0.96 * r * W, zWing + 0.085 * r),
            proj.project(-0.18 * r * L, side * 0.90 * r * W, zWing + 0.085 * r),
            proj.project(0.14 * r * L, side * 0.42 * r * W, zWing + 0.085 * r),
            proj.project(-0.14 * r * L, side * 0.34 * r * W, zWing + 0.085 * r)
          ];
          drawPolyPts(c, wingCamo, slateCamo, null, 0);

          // Leading-edge flap seam, wingtip aileron box, and trailing-edge flaperon seams
          drawLine3D(c, proj, 0.38 * r * L, side * 0.36 * r * W, zWing + 0.086 * r, -0.12 * r * L, side * 1.04 * r * W, zWing + 0.086 * r, seamCol, 0.85);
          drawLine3D(c, proj, -0.18 * r * L, side * 1.08 * r * W, zWing + 0.086 * r, -0.52 * r * L, side * 1.14 * r * W, zWing + 0.086 * r, seamCol, 0.9);
          drawLine3D(c, proj, -0.84 * r * L, side * 0.46 * r * W, zWing + 0.086 * r, -0.54 * r * L, side * 1.08 * r * W, zWing + 0.086 * r, seamCol, 0.9);

          // White rectangular wing-root formation light / access blister (matching usa_raptor_diorama_ref.png!)
          const rectBlister = [
            proj.project(-0.24 * r * L, side * 0.48 * r * W, zWing + 0.088 * r),
            proj.project(-0.14 * r * L, side * 0.48 * r * W, zWing + 0.088 * r),
            proj.project(-0.14 * r * L, side * 0.56 * r * W, zWing + 0.088 * r),
            proj.project(-0.24 * r * L, side * 0.56 * r * W, zWing + 0.088 * r)
          ];
          drawPolyPts(c, rectBlister, '#e2e8f0', seamCol, 0.75);

          // Semi-recessed circular cooling exhaust port on engine shoulder
          const ventPt = proj.project(-0.36 * r * L, side * 0.28 * r * W, zWing + 0.14 * r);
          c.fillStyle = '#f8fafc';
          c.strokeStyle = seamCol;
          c.lineWidth = 0.8;
          c.beginPath();
          c.arc(ventPt.x, ventPt.y, Math.max(1.5, 0.055 * r), 0, Math.PI * 2);
          c.fill();
          c.stroke();
          c.fillStyle = '#1e293b';
          c.beginPath();
          c.arc(ventPt.x, ventPt.y, Math.max(0.8, 0.03 * r), 0, Math.PI * 2);
          c.fill();

          // Dark gun-port & avionics vents on forward cheek ahead of intake
          drawLine3D(c, proj, 0.46 * r * L, side * 0.24 * r, zWing + 0.12 * r, 0.54 * r * L, side * 0.22 * r, zWing + 0.14 * r, '#1e293b', 1.8);
          drawLine3D(c, proj, 0.32 * r * L, side * 0.26 * r, zWing + 0.12 * r, 0.38 * r * L, side * 0.25 * r, zWing + 0.15 * r, '#1e293b', 1.6);
        }

        // USAF Low-Vis Star-and-Bars Insignia on Port Outer Wing (matching usa_raptor_diorama_ref.png!)
        const insX = -0.44 * r * L;
        const insY = 0.86 * r * W;
        const insPt = proj.project(insX, insY, zWing + 0.09 * r);
        drawLine3D(c, proj, insX - 0.02 * r, insY - 0.12 * r, zWing + 0.09 * r, insX + 0.02 * r, insY + 0.12 * r, zWing + 0.09 * r, '#cbd5e1', 1.5);
        c.fillStyle = '#64748b';
        c.strokeStyle = '#cbd5e1';
        c.lineWidth = 1.1;
        c.beginPath();
        c.arc(insPt.x, insPt.y, Math.max(1.8, 0.065 * r), 0, Math.PI * 2);
        c.fill();
        c.stroke();

        // Lighter Gull-Grey Sawtooth Nose Radome Cone
        const radomePts = [
          proj.project(1.02 * r * L, -0.14 * r * W, zWing + 0.085 * r),
          proj.project(1.40 * r * L, 0, zWing + 0.085 * r),
          proj.project(1.02 * r * L, 0.14 * r * W, zWing + 0.085 * r),
          proj.project(1.08 * r * L, 0, zWing + 0.13 * r)
        ];
        drawPolyPts(c, radomePts, greyHi, seamCol, 1.0);
      }
    });

    // ========================================================================
    // 8. 3D Teardrop Golden-Amber Bubble Canopy with Crown Highlight & Frame Sill
    // ========================================================================
    const canBot = [
      [0.14 * r * L, -0.17 * r, zWing + 0.23 * r],
      [0.54 * r * L, -0.16 * r, zWing + 0.20 * r],
      [0.92 * r * L, -0.08 * r, zWing + 0.15 * r],
      [0.92 * r * L, 0.08 * r, zWing + 0.15 * r],
      [0.54 * r * L, 0.16 * r, zWing + 0.20 * r],
      [0.14 * r * L, 0.17 * r, zWing + 0.23 * r]
    ];
    const canTop = [
      [0.24 * r * L, -0.10 * r, zWing + 0.44 * r],
      [0.54 * r * L, -0.10 * r, zWing + 0.45 * r],
      [0.78 * r * L, -0.05 * r, zWing + 0.34 * r],
      [0.78 * r * L, 0.05 * r, zWing + 0.34 * r],
      [0.54 * r * L, 0.10 * r, zWing + 0.45 * r],
      [0.24 * r * L, 0.10 * r, zWing + 0.44 * r]
    ];
    pushFrustumFaces(faces, proj, canBot, canTop, canopyCol, seamCol, 1.15, 0.76);

    faces.push({
      depth: proj.project(0.52 * r * L, 0, zWing + 0.46 * r).depth + 0.90,
      customDraw(c) {
        // Pale-gold crown specular highlight oval along top of bubble canopy
        const specPts = [
          proj.project(0.32 * r * L, -0.06 * r, zWing + 0.445 * r),
          proj.project(0.68 * r * L, -0.04 * r, zWing + 0.39 * r),
          proj.project(0.68 * r * L, 0.03 * r, zWing + 0.39 * r),
          proj.project(0.32 * r * L, 0.04 * r, zWing + 0.445 * r)
        ];
        drawPolyPts(c, specPts, '#fde68a', null, 0);
        // Crisp white diagonal reflection slash
        drawLine3D(c, proj, 0.42 * r * L, -0.03 * r, zWing + 0.445 * r, 0.64 * r * L, -0.01 * r, zWing + 0.395 * r, '#ffffff', 1.6);
      }
    });

    // ========================================================================
    // 9. Canted Twin Vertical Tail Stabilizers with Slate Camo Center & Rudder Seams
    // ========================================================================
    for (const side of [-1, 1]) {
      const yBase = side * 0.24 * r;
      const yTip = side * 0.48 * r;
      const finPts = [
        proj.project(-0.98 * r * L, yBase, zWing + 0.14 * r),
        proj.project(-0.32 * r * L, yBase, zWing + 0.14 * r),
        proj.project(-0.54 * r * L, yTip, zWing + 0.74 * r),
        proj.project(-0.94 * r * L, yTip, zWing + 0.74 * r)
      ];
      const finCamo = [
        proj.project(-0.88 * r * L, yBase * 1.15, zWing + 0.22 * r),
        proj.project(-0.46 * r * L, yBase * 1.15, zWing + 0.22 * r),
        proj.project(-0.60 * r * L, yTip * 0.88, zWing + 0.62 * r),
        proj.project(-0.86 * r * L, yTip * 0.88, zWing + 0.62 * r)
      ];
      faces.push({
        depth: proj.project(-0.68 * r * L, yTip, zWing + 0.48 * r).depth + 0.98,
        customDraw(c) {
          drawPolyPts(c, finPts, greyBase, seamCol, 1.2);
          drawPolyPts(c, finCamo, slateCamo, null, 0);
          // Rudder hinge seam line
          drawLine3D(c, proj, -0.82 * r * L, yBase * 1.05, zWing + 0.16 * r, -0.80 * r * L, yTip * 0.94, zWing + 0.70 * r, seamCol, 0.95);
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
    const H = p.extrusionDepth || 1.0;
    const hullAngle = (u && u.angle !== undefined) ? u.angle : 0;
    const recoil = (u && u.recoilOffset) || 0;
    const phase = (u && u.treadPhase) || (typeof performance !== 'undefined' ? (performance.now() * 0.003) % 1 : 0);
    const hoverZ = Math.sin(phase * Math.PI * 2) * 0.04 * r;
    const pitchScale = opts.pitchScale !== undefined ? opts.pitchScale : 1.0;
    const zScale = opts.zScale !== undefined ? opts.zScale : 0.42;

    const bodyCol = p.armorBaseColor || '#f8fafc';
    const bodyShade = '#dde5ef';
    const stripeCol = p.stripeColor || '#2563eb';
    const seamCol = p.panelLineColor || '#26201b';
    const glowCol = p.scramjetColor || '#22d3ee';

    const proj = createProjector(hullAngle, pitchScale, zScale, 0, 0, 0, 0);

    // Shadow
    const shadowPts = [
      proj.project(-1.18 * r * L, -1.14 * r * W, 0),
      proj.project(1.62 * r * L, 0, 0),
      proj.project(-1.18 * r * L, 1.14 * r * W, 0)
    ].map((pt) => ({ x: pt.x + 4.8, y: pt.y + 6.8 }));
    drawPolyPts(ctx, shadowPts, 'rgba(65, 50, 40, 0.28)', null, 0);

    const faces = [];
    const zWing = 0.26 * r * H + hoverZ;

    // ========================================================================
    // 1. Twin Multi-Ring Segmented Titanium Exhaust Nozzles & Cyan Shock Plumes
    // ========================================================================
    for (const side of [-1, 1]) {
      const ny = side * 0.24 * r;
      // Outer metallic collar + inner dark turkey-feather nozzle cone
      pushTubeSegment3D(faces, proj, -1.08 * r * L, ny, zWing + 0.11 * r, 0, 0, 0.14 * r * L, 0.12 * r, 0.125 * r, '#64748b', seamCol, 1.0, 0.14);
      pushTubeSegment3D(faces, proj, -1.22 * r * L, ny, zWing + 0.11 * r, 0, 0, 0.16 * r * L, 0.105 * r, 0.12 * r, '#334155', seamCol, 1.05, 0.15);
    }

    if (p.showScramjetGlow !== false) {
      const surge = 1.0 + Math.sin(phase * Math.PI * 8) * 0.09 + clamp(recoil * 0.10, 0, 0.40);
      faces.push({
        depth: proj.project(-1.36 * r * L, 0, zWing).depth - 0.5,
        customDraw(c) {
          for (const side of [-1, 1]) {
            const ny = side * 0.24 * r;
            const p0 = proj.project(-1.18 * r * L, ny, zWing + 0.11 * r);
            const p1 = proj.project(-1.74 * r * L * surge, ny * 1.08, zWing + 0.11 * r);
            const pMid = proj.project(-1.46 * r * L * surge, ny * 1.04, zWing + 0.11 * r);
            c.strokeStyle = glowCol;
            c.lineWidth = 5.4;
            c.lineCap = 'round';
            c.beginPath();
            c.moveTo(p0.x, p0.y);
            c.lineTo(p1.x, p1.y);
            c.stroke();

            c.strokeStyle = '#bae6fd';
            c.lineWidth = 3.2;
            c.beginPath();
            c.moveTo(p0.x, p0.y);
            c.lineTo(pMid.x, pMid.y);
            c.stroke();

            c.strokeStyle = '#ffffff';
            c.lineWidth = 1.8;
            c.beginPath();
            c.moveTo(p0.x, p0.y);
            c.lineTo((p0.x + pMid.x) * 0.58, (p0.y + pMid.y) * 0.58);
            c.stroke();
          }
        }
      });
    }

    // ========================================================================
    // 2. Ventral Royal-Blue Scramjet Wedge Air Intakes (beneath forward wing roots)
    // ========================================================================
    for (const side of [-1, 1]) {
      const iy = side * 0.26 * r * W;
      pushBox3D(faces, proj, 0.08 * r * L, 0.58 * r * L, iy - 0.10 * r, iy + 0.10 * r, zWing - 0.11 * r, zWing + 0.01 * r, stripeCol, seamCol, 1.1, 0.12, 0.05 * r, 0.02 * r);
      faces.push({
        depth: proj.project(0.58 * r * L, iy, zWing - 0.06 * r).depth + 0.15,
        customDraw(c) {
          const vMouth = [
            proj.project(0.57 * r * L, iy - 0.08 * r, zWing - 0.09 * r),
            proj.project(0.57 * r * L, iy + 0.08 * r, zWing - 0.09 * r),
            proj.project(0.55 * r * L, iy + 0.08 * r, zWing - 0.01 * r),
            proj.project(0.55 * r * L, iy - 0.08 * r, zWing - 0.01 * r)
          ];
          drawPolyPts(c, vMouth, '#0f172a', seamCol, 0.95);
        }
      });
    }

    // ========================================================================
    // 3. Needle-Nosed Cranked-Delta Wave-Rider Airframe & Central Tail Cone
    // ========================================================================
    const deltaBot = [
      [-1.18 * r * L, 0, zWing],
      [-1.02 * r * L, -0.38 * r * W, zWing],
      [-0.78 * r * L, -1.20 * r * W, zWing],
      [-0.56 * r * L, -1.22 * r * W, zWing],
      [0.36 * r * L, -0.34 * r * W, zWing],
      [0.82 * r * L, -0.18 * r * W, zWing],
      [1.58 * r * L, 0, zWing],
      [0.82 * r * L, 0.18 * r * W, zWing],
      [0.36 * r * L, 0.34 * r * W, zWing],
      [-0.56 * r * L, 1.22 * r * W, zWing],
      [-0.78 * r * L, 1.20 * r * W, zWing],
      [-1.02 * r * L, 0.38 * r * W, zWing]
    ];
    const deltaTop = deltaBot.map((v) => [v[0], v[1], v[2] + 0.085 * r]);
    pushFrustumFaces(faces, proj, deltaBot, deltaTop, bodyCol, seamCol, 1.2, 0.22);

    // ========================================================================
    // 4. Sculpted Central Spine & Twin Dorsal Box-to-Cylindrical Scramjet Nacelles
    //    (With Forward Dark Intake Mouths on Top of Wing Roots!)
    // ========================================================================
    const spineBot = [
      [-1.16 * r * L, -0.12 * r, zWing + 0.08 * r],
      [0.36 * r * L, -0.20 * r, zWing + 0.08 * r],
      [1.18 * r * L, -0.09 * r, zWing + 0.08 * r],
      [1.18 * r * L, 0.09 * r, zWing + 0.08 * r],
      [0.36 * r * L, 0.20 * r, zWing + 0.08 * r],
      [-1.16 * r * L, 0.12 * r, zWing + 0.08 * r]
    ];
    const spineTop = [
      [-1.12 * r * L, -0.04 * r, zWing + 0.24 * r],
      [0.32 * r * L, -0.13 * r, zWing + 0.29 * r],
      [0.98 * r * L, -0.06 * r, zWing + 0.17 * r],
      [0.98 * r * L, 0.06 * r, zWing + 0.17 * r],
      [0.32 * r * L, 0.13 * r, zWing + 0.29 * r],
      [-1.12 * r * L, 0.04 * r, zWing + 0.24 * r]
    ];
    pushFrustumFaces(faces, proj, spineBot, spineTop, bodyCol, seamCol, 1.15, 0.44);

    // Twin Dorsal Scramjet Engine Nacelles (Forward Boxy Intake Shoulders + Aft Cylindrical Tunnels)
    for (const side of [-1, 1]) {
      const ny = side * 0.24 * r;
      // Forward boxy intake fairing on wing root (matching usa_aurora_diorama_ref.png!)
      pushBox3D(faces, proj, -0.22 * r * L, 0.30 * r * L, ny - 0.10 * r, ny + 0.10 * r, zWing + 0.08 * r, zWing + 0.23 * r, bodyShade, seamCol, 1.05, 0.46, 0.04 * r, 0.02 * r);
      // Aft rounded scramjet nacelle tunnel
      pushTubeSegment3D(faces, proj, -0.96 * r * L, ny, zWing + 0.12 * r, 0, 0, 0.80 * r * L, 0.12 * r, 0.11 * r, bodyCol, seamCol, 1.1, 0.48);

      // Dark rectangular dorsal intake mouth at x = 0.30 * r * L
      faces.push({
        depth: proj.project(0.31 * r * L, ny, zWing + 0.16 * r).depth + 0.52,
        customDraw(c) {
          const dIntake = [
            proj.project(0.305 * r * L, ny - 0.08 * r, zWing + 0.09 * r),
            proj.project(0.305 * r * L, ny + 0.08 * r, zWing + 0.09 * r),
            proj.project(0.285 * r * L, ny + 0.07 * r, zWing + 0.21 * r),
            proj.project(0.285 * r * L, ny - 0.07 * r, zWing + 0.21 * r)
          ];
          drawPolyPts(c, dIntake, '#1e293b', seamCol, 1.0);
        }
      });
    }

    // ========================================================================
    // 5. Royal-Blue Livery Stripes, Wing Elevon Grid, Nose Cone & 3-Pane Visor
    // ========================================================================
    faces.push({
      depth: proj.project(0.20 * r * L, 0, zWing + 0.30 * r).depth + 0.72,
      customDraw(c) {
        // Thermal-shielded grey nose cone + long hypersonic needle pitot boom
        const nosePts = [
          proj.project(1.24 * r * L, -0.09 * r * W, zWing + 0.09 * r),
          proj.project(1.58 * r * L, 0, zWing + 0.09 * r),
          proj.project(1.24 * r * L, 0.09 * r * W, zWing + 0.09 * r),
          proj.project(1.20 * r * L, 0, zWing + 0.14 * r)
        ];
        drawPolyPts(c, nosePts, '#94a3b8', seamCol, 1.0);
        drawLine3D(c, proj, 1.56 * r * L, 0, zWing + 0.06 * r, 1.84 * r * L, 0, zWing + 0.04 * r, seamCol, 1.5);

        if (p.showRacingStripes !== false) {
          // Dorsal spine racing stripe tapering to aft tail-cone tip
          const spineStripe = [
            proj.project(-0.88 * r * L, 0, zWing + 0.255 * r),
            proj.project(0.36 * r * L, -0.10 * r, zWing + 0.295 * r),
            proj.project(0.56 * r * L, -0.09 * r, zWing + 0.26 * r),
            proj.project(0.56 * r * L, 0.09 * r, zWing + 0.26 * r),
            proj.project(0.36 * r * L, 0.10 * r, zWing + 0.295 * r)
          ];
          drawPolyPts(c, spineStripe, stripeCol, null, 0);

          // White rounded-rectangle dorsal avionics hatch inside the blue spine stripe!
          const hatchPts = [
            proj.project(-0.02 * r * L, -0.06 * r, zWing + 0.298 * r),
            proj.project(0.24 * r * L, -0.06 * r, zWing + 0.298 * r),
            proj.project(0.24 * r * L, 0.06 * r, zWing + 0.298 * r),
            proj.project(-0.02 * r * L, 0.06 * r, zWing + 0.298 * r)
          ];
          drawPolyPts(c, hatchPts, bodyCol, seamCol, 0.85);

          for (const side of [-1, 1]) {
            // Cheek stripe stepping up from below cockpit visor to dorsal spine
            drawLine3D(c, proj, 0.86 * r * L, side * 0.12 * r, zWing + 0.12 * r, 0.56 * r * L, side * 0.16 * r, zWing + 0.16 * r, stripeCol, 1.8);
            drawLine3D(c, proj, 0.56 * r * L, side * 0.16 * r, zWing + 0.16 * r, 0.44 * r * L, side * 0.09 * r, zWing + 0.28 * r, stripeCol, 1.8);

            // Bold Leading-Edge Wing Stripe + Double Parallel Trailing-Edge Chevron Bars (matching usa_aurora_diorama_ref.png!)
            drawLine3D(c, proj, 0.22 * r * L, side * 0.36 * r * W, zWing + 0.092 * r, -0.58 * r * L, side * 1.06 * r * W, zWing + 0.092 * r, stripeCol, 2.5);
            drawLine3D(c, proj, -0.34 * r * L, side * 0.82 * r * W, zWing + 0.092 * r, -0.76 * r * L, side * 0.62 * r * W, zWing + 0.092 * r, stripeCol, 2.2);
            drawLine3D(c, proj, -0.42 * r * L, side * 0.89 * r * W, zWing + 0.092 * r, -0.82 * r * L, side * 0.70 * r * W, zWing + 0.092 * r, stripeCol, 1.5);
          }
        }

        // Wing Elevon & Leading-Edge Flap Structural Panel Grid
        for (const side of [-1, 1]) {
          drawLine3D(c, proj, -0.92 * r * L, side * 0.42 * r * W, zWing + 0.092 * r, -0.70 * r * L, side * 1.12 * r * W, zWing + 0.092 * r, seamCol, 0.9);
          drawLine3D(c, proj, -0.82 * r * L, side * 0.78 * r * W, zWing + 0.092 * r, -0.94 * r * L, side * 0.78 * r * W, zWing + 0.092 * r, seamCol, 0.85);
          // Nacelle ring seam
          drawLine3D(c, proj, -0.48 * r * L, side * 0.16 * r, zWing + 0.24 * r, -0.48 * r * L, side * 0.32 * r, zWing + 0.20 * r, seamCol, 0.85);
        }

        // Small circular astro-tracker dome on spine behind cockpit
        const astroPt = proj.project(0.50 * r * L, 0, zWing + 0.275 * r);
        c.strokeStyle = seamCol;
        c.lineWidth = 0.85;
        c.beginPath();
        c.arc(astroPt.x, astroPt.y, Math.max(1.4, 0.045 * r), 0, Math.PI * 2);
        c.stroke();

        // 3-Pane Curved Flush Dark Hypersonic Cockpit Visor with Frame Mullions & Glint
        for (const side of [-1, 1]) {
          const sideVisor = [
            proj.project(0.62 * r * L, side * 0.14 * r, zWing + 0.21 * r),
            proj.project(0.84 * r * L, side * 0.11 * r, zWing + 0.17 * r),
            proj.project(0.84 * r * L, side * 0.04 * r, zWing + 0.20 * r),
            proj.project(0.66 * r * L, side * 0.05 * r, zWing + 0.25 * r)
          ];
          drawPolyPts(c, sideVisor, '#334155', seamCol, 1.0);
        }
        const centerVisor = [
          proj.project(0.66 * r * L, -0.05 * r, zWing + 0.25 * r),
          proj.project(0.86 * r * L, -0.04 * r, zWing + 0.20 * r),
          proj.project(0.86 * r * L, 0.04 * r, zWing + 0.20 * r),
          proj.project(0.66 * r * L, 0.05 * r, zWing + 0.25 * r)
        ];
        drawPolyPts(c, centerVisor, '#1e293b', seamCol, 1.05);
        drawLine3D(c, proj, 0.70 * r * L, -0.08 * r, zWing + 0.22 * r, 0.82 * r * L, -0.03 * r, zWing + 0.19 * r, '#bae6fd', 1.2);
      }
    });

    // ========================================================================
    // 6. Twin Canted Tail Fins with Blue/Gold Upper Tip Caps & Rudder Seams
    // ========================================================================
    for (const side of [-1, 1]) {
      const yBase = side * 0.30 * r;
      const yTip = side * 0.46 * r;
      const finPts = [
        proj.project(-0.98 * r * L, yBase, zWing + 0.14 * r),
        proj.project(-0.38 * r * L, yBase, zWing + 0.14 * r),
        proj.project(-0.58 * r * L, yTip, zWing + 0.68 * r),
        proj.project(-0.94 * r * L, yTip, zWing + 0.68 * r)
      ];
      const capPts = [
        proj.project(-0.93 * r * L, yTip * 0.94, zWing + 0.54 * r),
        proj.project(-0.53 * r * L, yTip * 0.94, zWing + 0.54 * r),
        proj.project(-0.58 * r * L, yTip, zWing + 0.68 * r),
        proj.project(-0.94 * r * L, yTip, zWing + 0.68 * r)
      ];
      faces.push({
        depth: proj.project(-0.72 * r * L, yTip, zWing + 0.44 * r).depth + 0.92,
        customDraw(c) {
          drawPolyPts(c, finPts, bodyCol, seamCol, 1.15);
          drawPolyPts(c, capPts, stripeCol, seamCol, 1.05);
          drawLine3D(c, proj, -0.84 * r * L, yBase * 1.04, zWing + 0.16 * r, -0.82 * r * L, yTip * 0.90, zWing + 0.54 * r, seamCol, 0.9);
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
    const helmetCol = isBurton
      ? '#881337'
      : isLotus
        ? '#27272a'
        : isTerrorist
          ? '#dc2626'
          : (p.helmetColor || (isChina ? '#6e7b4f' : '#7c765a'));
    const uniformCol = isLotus
      ? (p.uniformColor || '#b91c1c')
      : (p.uniformColor || (isChina ? '#6e7b4f' : '#a89674'));
    const vestCol = isBurton
      ? '#3f4d34'
      : isLotus
        ? (p.vestColor || '#dc2626')
        : isTerrorist
          ? '#b91c1c'
          : (p.vestColor || (isChina ? '#4a5434' : '#6b6852'));
    const skinCol = p.skinColor || (isLotus ? '#d6a586' : '#a87556');

    const proj = createProjector(angle, pitchScale, zScale, 0, 0, 0, 0);
    const upperProj = createProjector(turretAngle, pitchScale, zScale, 0, 0, 0, angle);

    // Oval Ground Contact Shadow
    const basePt = proj.project(isWorker ? 0.25 * r : 0, 0, 0);
    ctx.save();
    ctx.fillStyle = 'rgba(75, 58, 46, 0.34)';
    ctx.beginPath();
    ctx.ellipse(
      basePt.x,
      basePt.y + 2.0,
      r * (isWorker ? 1.18 : isMob ? 1.05 : 0.72),
      r * (isWorker ? 0.58 : isMob ? 0.65 : 0.45) * pitchScale,
      0,
      0,
      Math.PI * 2
    );
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

    // 1. Boots & Knee-Padded Camo Legs (or Black Lotus dark leggings + crimson trench coat skirt)
    for (const side of [-1, 1]) {
      const stride = side * Math.sin(phase * Math.PI * 2) * 0.16 * r;
      const ly = side * 0.24 * r;
      const bootCol = isLotus ? '#18181b' : '#4a3b2c';
      const legCol = isLotus ? '#27272a' : uniformCol;
      pushBox3D(faces, proj, stride - 0.16 * r, stride + 0.20 * r, ly - 0.14 * r, ly + 0.14 * r, 0, 0.18 * r, bootCol, seamCol, 1.05, 0.1);
      pushBox3D(faces, proj, stride * 0.5 - 0.17 * r, stride * 0.5 + 0.17 * r, ly - 0.15 * r, ly + 0.15 * r, 0.18 * r, 0.56 * r + bob, legCol, seamCol, 1.05, 0.25);
    }

    // 2. Armored Tactical Torso + Plate Carrier Vest (or Black Lotus Crimson Belted Trench Coat)
    if (isLotus) {
      // Flared lower trench coat hem + belted crimson upper coat + dark inner collar
      pushBox3D(faces, upperProj, -0.28 * r, 0.28 * r, -0.38 * r, 0.38 * r, 0.36 * r + bob, 0.66 * r + bob, uniformCol, seamCol, 1.1, 0.45, 0.03 * r, 0.03 * r);
      pushBox3D(faces, upperProj, -0.25 * r, 0.26 * r, -0.36 * r, 0.36 * r, 0.62 * r + bob, 1.18 * r + bob, vestCol, seamCol, 1.15, 0.55, 0.03 * r, 0.04 * r);
      // Black waist belt + gold buckle
      pushBox3D(faces, upperProj, -0.26 * r, 0.27 * r, -0.37 * r, 0.37 * r, 0.62 * r + bob, 0.70 * r + bob, '#18181b', seamCol, 1.0, 0.62);
      // Flowing long dark charcoal hair cascades over shoulders
      pushBox3D(faces, upperProj, -0.32 * r, 0.16 * r, -0.38 * r, 0.38 * r, 0.94 * r + bob, 1.46 * r + bob, '#27272a', seamCol, 1.05, 0.85, 0.04 * r, 0.04 * r);
    } else {
      pushBox3D(faces, upperProj, -0.26 * r, 0.26 * r, -0.38 * r, 0.38 * r, 0.52 * r + bob, 1.18 * r + bob, uniformCol, seamCol, 1.15, 0.55, 0.02 * r, 0.03 * r);
      pushBox3D(faces, upperProj, -0.22 * r, 0.28 * r, -0.30 * r, 0.30 * r, 0.58 * r + bob, 1.10 * r + bob, vestCol, seamCol, 1.05, 0.65);
    }

    // Satchel Bag / C4 Pack / Terrorist Dynamite Straps / Hacker Backpack / Black Lotus Hip Satchel
    if (isPathfinder || isBurton || isHacker || isLotus || isTerrorist) {
      const packCol = isTerrorist ? '#ef4444' : isLotus ? '#18181b' : isHacker ? '#4a5434' : '#785238';
      pushBox3D(faces, upperProj, -0.30 * r, 0.16 * r, 0.28 * r, 0.48 * r, (isLotus ? 0.38 : 0.48) * r + bob, (isLotus ? 0.80 : 0.88) * r + bob, packCol, seamCol, 1.05, 0.72);
    }

    // GLA Worker 3D Wooden Supply Crate with Timber Frame & Diagonal Cross-Brace (matching gla_worker_diorama_ref.png!)
    if (isWorker) {
      const cx0 = 0.26 * r, cx1 = 0.98 * r * wScale;
      const cy0 = -0.38 * r, cy1 = 0.38 * r;
      const cz0 = 0.06 * r + bob * 0.4, cz1 = 0.80 * r + bob * 0.4;
      // Main wooden supply box
      pushBox3D(faces, upperProj, cx0, cx1, cy0, cy1, cz0, cz1, '#c69f68', seamCol, 1.18, 1.35);
      // Top timber rim cap
      pushBox3D(faces, upperProj, cx0 - 0.02 * r, cx1 + 0.02 * r, cy0 - 0.02 * r, cy1 + 0.02 * r, cz1, cz1 + 0.09 * r, '#a67c46', seamCol, 1.12, 1.48);
      // Worker's outstretched olive arms gripping top-rear corners of crate
      for (const side of [-1, 1]) {
        pushBox3D(faces, upperProj, 0.10 * r, 0.38 * r, side * 0.24 * r, side * 0.38 * r, 0.76 * r + bob, 0.96 * r + bob, uniformCol, seamCol, 1.05, 1.52);
      }
      // Diagonal wooden cross-braces on crate sides & front
      faces.push({
        depth: upperProj.project((cx0 + cx1) * 0.5, cy1, (cz0 + cz1) * 0.5).depth + 1.55,
        customDraw(c) {
          drawLine3D(c, upperProj, cx0 + 0.05 * r, cy1 + 0.01 * r, cz0 + 0.05 * r, cx1 - 0.05 * r, cy1 + 0.01 * r, cz1 - 0.05 * r, '#785230', 1.8);
          drawLine3D(c, upperProj, cx0 + 0.05 * r, cy1 + 0.01 * r, cz1 - 0.05 * r, cx1 - 0.05 * r, cy1 + 0.01 * r, cz0 + 0.05 * r, '#785230', 1.8);
          drawLine3D(c, upperProj, cx1 + 0.01 * r, cy0 + 0.05 * r, cz0 + 0.05 * r, cx1 + 0.01 * r, cy1 - 0.05 * r, cz1 - 0.05 * r, '#785230', 1.8);
          drawLine3D(c, upperProj, cx1 + 0.01 * r, cy0 + 0.05 * r, cz1 - 0.05 * r, cx1 + 0.01 * r, cy1 - 0.05 * r, cz0 + 0.05 * r, '#785230', 1.8);
        }
      });
    }

    // 3. Chibi-Tactical Head & Rounded Kevlar Helmet / Maroon Beret / Black Lotus Hair / GLA Field Cap
    const zHeadBot = 1.16 * r + bob;
    const zHeadMid = 1.54 * r * hScale + bob;
    const zHelmetTop = (isBurton || isLotus || isWorker ? 1.82 : 1.92) * r * hScale + bob;
    pushCylinderZ3D(faces, upperProj, 0.04 * r, 0, zHeadBot, zHeadMid, 0.34 * r * hScale, 0.36 * r * hScale, 8, skinCol, seamCol, 1.1, 1.1);
    pushCylinderZ3D(faces, upperProj, isBurton ? -0.04 * r : 0, isBurton ? 0.05 * r : 0, zHeadMid - 0.08 * r, zHelmetTop, isLotus ? 0.42 * r * hScale : 0.46 * r * hScale, (isBurton || isGla) ? 0.42 * r * hScale : 0.36 * r * hScale, 8, helmetCol, seamCol, 1.15, 1.25);

    // Protruding Front Visor Bill for GLA Worker's Olive Field Cap
    if (isWorker) {
      pushBox3D(faces, upperProj, 0.22 * r * hScale, 0.56 * r * hScale, -0.28 * r * hScale, 0.28 * r * hScale, zHeadMid - 0.06 * r, zHeadMid + 0.04 * r, helmetCol, seamCol, 1.05, 1.32);
    }

    // Facial eyes, tactical sunglasses, China Red Star badge, Hacker glasses, or Helmet Ballistic Goggles
    faces.push({
      depth: upperProj.project(0.38 * r * hScale, 0, zHeadMid).depth + 1.45,
      customDraw(c) {
        if (isLotus) {
          // Dark wrap-around agent sunglasses (matching china_black_lotus_diorama_ref.png!)
          const sgQuad = [
            [0.36 * r * hScale, -0.26 * r * hScale, zHeadBot + 0.16 * r * hScale],
            [0.36 * r * hScale, 0.26 * r * hScale, zHeadBot + 0.16 * r * hScale],
            [0.36 * r * hScale, 0.24 * r * hScale, zHeadBot + 0.30 * r * hScale],
            [0.36 * r * hScale, -0.24 * r * hScale, zHeadBot + 0.30 * r * hScale]
          ];
          drawGlassPane3D(c, upperProj, sgQuad, '#18181b', seamCol, 1.15);
        } else if (isHacker) {
          // Round optical glasses for PLA Hacker (matching china_hacker_diorama_ref.png!)
          for (const side of [-1, 1]) {
            const eyePt = upperProj.project(0.35 * r * hScale, side * 0.14 * r * hScale, zHeadBot + 0.22 * r * hScale);
            c.fillStyle = '#cbd5e1';
            c.strokeStyle = seamCol;
            c.lineWidth = 1.1;
            c.beginPath();
            c.arc(eyePt.x, eyePt.y, Math.max(1.8, 0.085 * r), 0, Math.PI * 2);
            c.fill();
            c.stroke();
          }
        } else {
          for (const side of [-1, 1]) {
            const eyePt = upperProj.project(0.34 * r * hScale, side * 0.13 * r * hScale, zHeadBot + 0.22 * r * hScale);
            c.fillStyle = (isBurton || isHijacker) ? '#0f172a' : seamCol;
            c.beginPath();
            c.arc(eyePt.x, eyePt.y, Math.max(1.2, (isBurton ? 0.065 : 0.04) * r), 0, Math.PI * 2);
            c.fill();
          }
        }
        if (isChina && !isLotus) {
          const starPt = upperProj.project(0.42 * r * hScale, 0, zHeadMid + 0.16 * r * hScale);
          c.fillStyle = '#dc2626';
          c.beginPath();
          c.arc(starPt.x, starPt.y, Math.max(1.5, 0.075 * r), 0, Math.PI * 2);
          c.fill();
        }
        if (p.showGoggles !== false && !isMissile && !isBurton && !isWorker && !isLotus && !isHacker) {
          const gQuad = [
            [0.42 * r * hScale, -0.30 * r * hScale, zHeadMid - 0.02 * r],
            [0.42 * r * hScale, 0.30 * r * hScale, zHeadMid - 0.02 * r],
            [0.40 * r * hScale, 0.28 * r * hScale, zHeadMid + 0.16 * r * hScale],
            [0.40 * r * hScale, -0.28 * r * hScale, zHeadMid + 0.16 * r * hScale]
          ];
          drawGlassPane3D(c, upperProj, gQuad, isMinigunner ? '#f59e0b' : '#94a3b8', seamCol, 1.05);
        }
      }
    });

    // 4. Oversized Readable Diorama Weapons / Tools with 3D Recoil & Muzzle Flash
    const recDist = clamp(recoil * 0.04 * r, 0, 0.18 * r);
    if (isMissile) {
      // Heavy Shoulder-Fired Anti-Tank Rocket Tube / RPG-7 Launcher (matching china_tank_hunter_diorama_ref.png & gla_rpg_trooper_diorama_ref.png!)
      const tubeCol = isGla ? '#5c6e46' : isChina ? '#5c6b43' : '#6b7a52';
      const collarCol = isGla ? '#78350f' : '#3b4230';
      pushTubeSegment3D(
        faces,
        upperProj,
        -0.62 * r * wScale - recDist,
        0.34 * r,
        1.14 * r + bob,
        -0.08,
        0,
        1.48 * r * wScale,
        0.19 * r * wScale,
        0.20 * r * wScale,
        tubeCol,
        seamCol,
        1.15,
        1.65
      );
      // Flared Rear Exhaust Cone & Front Launch Collar / PG-7V Conical Warhead
      pushTubeSegment3D(faces, upperProj, -0.68 * r * wScale - recDist, 0.34 * r, 1.15 * r + bob, -0.08, 0, 0.22 * r * wScale, 0.25 * r * wScale, 0.21 * r * wScale, collarCol, seamCol, 1.1, 1.68);
      if (isGla) {
        // Protruding conical PG-7V RPG warhead nosecone (matching gla_rpg_trooper_diorama_ref.png!)
        pushTubeSegment3D(faces, upperProj, 0.68 * r * wScale - recDist, 0.34 * r, 1.03 * r + bob, -0.08, 0, 0.42 * r * wScale, 0.24 * r * wScale, 0.07 * r * wScale, '#4b5938', seamCol, 1.15, 1.72);
      } else {
        pushTubeSegment3D(faces, upperProj, 0.72 * r * wScale - recDist, 0.34 * r, 1.03 * r + bob, -0.08, 0, 0.22 * r * wScale, 0.22 * r * wScale, 0.25 * r * wScale, collarCol, seamCol, 1.15, 1.72);
      }
    } else if (isMinigunner) {
      pushTubeSegment3D(faces, upperProj, -0.10 * r, 0.32 * r, 0.78 * r + bob, 0, 0, 1.15 * r * wScale, 0.16 * r * wScale, 0.15 * r * wScale, '#334155', seamCol, 1.1, 1.65);
    } else if (isHacker) {
      // Open Silver-Grey Field Laptop held at waist (matching china_hacker_diorama_ref.png!)
      pushBox3D(faces, upperProj, 0.16 * r, 0.58 * r * wScale, -0.26 * r, 0.26 * r, 0.70 * r + bob, 0.78 * r + bob, '#475569', seamCol, 1.05, 1.65);
      pushBox3D(faces, upperProj, 0.50 * r * wScale, 0.60 * r * wScale, -0.26 * r, 0.26 * r, 0.78 * r + bob, 1.10 * r + bob, '#94a3b8', seamCol, 1.1, 1.72);
    }

    const wDepth = upperProj.project(0.45 * r, 0.28 * r, 0.95 * r + bob).depth + 1.75;
    faces.push({
      depth: wDepth,
      customDraw(c) {
        let muzPt = null;
        if (isMissile) {
          const mTip = upperProj.project((isGla ? 1.06 : 0.90) * r * wScale - recDist, 0.34 * r, 1.00 * r + bob);
          c.fillStyle = isGla ? '#3b462b' : '#1e293b';
          c.strokeStyle = seamCol;
          c.lineWidth = 1.2;
          c.beginPath();
          c.arc(mTip.x, mTip.y, Math.max(1.8, (isGla ? 0.11 : 0.17) * r * wScale), 0, Math.PI * 2);
          c.fill();
          c.stroke();
          muzPt = mTip;
        } else if (isHacker) {
          // Small white emblem dot on the back of the Hacker's silver laptop lid
          const lidLogo = upperProj.project(0.61 * r * wScale, 0, 0.94 * r + bob);
          c.fillStyle = '#f8fafc';
          c.beginPath();
          c.arc(lidLogo.x, lidLogo.y, Math.max(1.4, 0.055 * r), 0, Math.PI * 2);
          c.fill();
        } else if (isPathfinder) {
          // Long-Barreled Sniper Rifle with Telescopic Scope (matching gla_jarmen_kell_diorama_ref.png & usa_pathfinder_diorama_ref.png!)
          const bodyCol = isGla ? '#4b5938' : '#334155';
          drawLine3D(c, upperProj, -0.14 * r - recDist, 0.26 * r, 0.88 * r + bob, 1.34 * r * wScale - recDist, 0.12 * r, 0.82 * r + bob, seamCol, 3.8);
          drawLine3D(c, upperProj, -0.14 * r - recDist, 0.26 * r, 0.88 * r + bob, 1.34 * r * wScale - recDist, 0.12 * r, 0.82 * r + bob, bodyCol, 2.2);
          drawLine3D(c, upperProj, 0.12 * r - recDist, 0.22 * r, 1.00 * r + bob, 0.64 * r * wScale - recDist, 0.18 * r, 0.98 * r + bob, '#334155', 2.5);
          muzPt = upperProj.project(1.34 * r * wScale - recDist, 0.12 * r, 0.82 * r + bob);
        } else if (isBurton) {
          drawLine3D(c, upperProj, -0.18 * r - recDist, 0.28 * r, 0.88 * r + bob, 1.08 * r * wScale - recDist, 0.14 * r, 0.80 * r + bob, '#3f4d34', 3.4);
          drawLine3D(c, upperProj, -0.18 * r - recDist, 0.28 * r, 0.88 * r + bob, 1.08 * r * wScale - recDist, 0.14 * r, 0.80 * r + bob, seamCol, 1.2);
          muzPt = upperProj.project(1.08 * r * wScale - recDist, 0.14 * r, 0.80 * r + bob);
        } else if (isTerrorist) {
          // Detonator switch in raised hand
          drawLine3D(c, upperProj, 0.18 * r, 0.30 * r, 0.92 * r + bob, 0.56 * r, 0.32 * r, 1.32 * r + bob, '#dc2626', 2.8);
        } else if (isHijacker) {
          // Curved tactical breaching tool / blade
          drawLine3D(c, upperProj, 0.18 * r, 0.28 * r, 0.84 * r + bob, 0.78 * r * wScale, 0.16 * r, 0.92 * r + bob, '#cbd5e1', 2.6);
        } else if (!isLotus && !isWorker) {
          // M4A1 / Type-81 / AK-47 Assault Rifle held across chest (matching china_red_guard_diorama_ref.png & gla_rebel_diorama_ref.png!)
          const gunCol = isGla ? '#334155' : '#334155';
          drawLine3D(c, upperProj, -0.14 * r - recDist, 0.26 * r, 0.88 * r + bob, 0.98 * r * wScale - recDist, 0.16 * r, 0.78 * r + bob, seamCol, 4.0);
          drawLine3D(c, upperProj, -0.14 * r - recDist, 0.26 * r, 0.88 * r + bob, 0.98 * r * wScale - recDist, 0.16 * r, 0.78 * r + bob, gunCol, 2.5);
          drawLine3D(c, upperProj, 0.32 * r - recDist, 0.22 * r, 0.82 * r + bob, 0.40 * r - recDist, 0.22 * r, 0.60 * r + bob, seamCol, 2.4);
          muzPt = upperProj.project(0.98 * r * wScale - recDist, 0.16 * r, 0.78 * r + bob);
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
    //    (Matches China, USA & GLA reference cards: Red Guard/Rebel crosshair, RPG Trooper blue shield, Jarmen Kell wrench, Tank Hunter rocket, Hacker wifi, Black Lotus flower!)
    if (!isWorker && p.showStatusBubble !== false && (opts.pitchScale !== undefined && opts.pitchScale < 0.95)) {
      const bubbleTop = upperProj.project(0, 0, zHelmetTop + 0.85 * r);
      const bx = bubbleTop.x;
      const by = bubbleTop.y;
      const bw = Math.max(16, r * 1.18);
      const bh = Math.max(14, r * 1.00);
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

      const cx = bx;
      const cy = by - bh * 0.5;
      const ir = Math.max(4.5, r * 0.32);

      if (defId === 'CHINA_TANK_HUNTER') {
        // Diagonal grey finned anti-tank rocket icon (matching china_tank_hunter_diorama_ref.png!)
        ctx.strokeStyle = '#475569';
        ctx.fillStyle = '#64748b';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(cx - ir * 0.7, cy + ir * 0.7);
        ctx.lineTo(cx + ir * 0.7, cy - ir * 0.7);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx + ir * 0.55, cy - ir * 0.55, ir * 0.28, 0, Math.PI * 2);
        ctx.fill();
      } else if (defId === 'GLA_RPG_TROOPER' || defId === 'USA_MISSILE_DEFENDER') {
        // Light-Blue Heater Shield Vector Icon (matching gla_rpg_trooper_diorama_ref.png & usa_missile_defender_diorama_ref.png!)
        ctx.fillStyle = '#60a5fa';
        ctx.strokeStyle = seamCol;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(cx, cy - ir * 0.85);
        ctx.lineTo(cx + ir * 0.72, cy - ir * 0.52);
        ctx.lineTo(cx + ir * 0.62, cy + ir * 0.18);
        ctx.lineTo(cx, cy + ir * 0.88);
        ctx.lineTo(cx - ir * 0.62, cy + ir * 0.18);
        ctx.lineTo(cx - ir * 0.72, cy - ir * 0.52);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (defId === 'GLA_JARMEN_KELL' || defId === 'GLA_HIJACKER') {
        // Diagonal Grey Wrench Vector Icon (matching gla_jarmen_kell_diorama_ref.png!)
        ctx.strokeStyle = '#475569';
        ctx.fillStyle = '#94a3b8';
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.moveTo(cx - ir * 0.65, cy + ir * 0.65);
        ctx.lineTo(cx + ir * 0.45, cy - ir * 0.45);
        ctx.stroke();
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.arc(cx + ir * 0.52, cy - ir * 0.52, ir * 0.34, 0.3, Math.PI * 1.65);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx - ir * 0.62, cy + ir * 0.62, ir * 0.22, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (isHacker) {
        // Wireless signal arcs ((•)) (matching china_hacker_diorama_ref.png!)
        ctx.fillStyle = '#475569';
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1.35;
        ctx.beginPath();
        ctx.arc(cx, cy + ir * 0.45, 1.6, 0, Math.PI * 2);
        ctx.fill();
        for (const rad of [ir * 0.55, ir * 0.95]) {
          ctx.beginPath();
          ctx.arc(cx, cy + ir * 0.45, rad, -Math.PI * 0.78, -Math.PI * 0.22);
          ctx.stroke();
        }
      } else if (isLotus) {
        // 5-Petal Stylized Lotus Blossom Icon (matching china_black_lotus_diorama_ref.png!)
        ctx.fillStyle = '#64748b';
        ctx.strokeStyle = seamCol;
        ctx.lineWidth = 0.9;
        for (const ang of [-0.9, -0.45, 0, 0.45, 0.9]) {
          ctx.save();
          ctx.translate(cx, cy + ir * 0.35);
          ctx.rotate(ang);
          ctx.beginPath();
          ctx.ellipse(0, -ir * 0.55, ir * 0.24, ir * 0.52, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      } else if (defId === 'CHINA_RED_GUARD' || defId === 'USA_RANGER' || defId === 'GLA_REBEL') {
        // Red Crosshair Reticle Icon (matching china_red_guard_diorama_ref.png & gla_rebel_diorama_ref.png!)
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 1.35;
        ctx.beginPath();
        ctx.arc(cx, cy, ir * 0.72, 0, Math.PI * 2);
        ctx.moveTo(cx - ir, cy);
        ctx.lineTo(cx + ir, cy);
        ctx.moveTo(cx, cy - ir);
        ctx.lineTo(cx, cy + ir);
        ctx.stroke();
      } else {
        ctx.font = `${Math.max(10, Math.round(r * 0.62))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const icon = isPathfinder ? '🔭' : isBurton ? '💣' : isTerrorist ? '🧨' : isMob ? '🔥' : '🎯';
        ctx.fillText(icon, cx, cy);
      }
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
    const defId = String((u && u.defId) || 'CHINA_OVERLORD');
    const isEmperor = defId === 'CHINA_EMPEROR_OVERLORD';

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
    const crimson = p.houseColor || '#dc2626';
    const seamCol = p.panelLineColor || '#26201b';

    const hullProj = createProjector(hullAngle, pitchScale, zScale, 0, 0, 0, 0);

    const shadowPts = [
      hullProj.project(-1.24 * r * L, -0.96 * r * W, 0),
      hullProj.project(1.24 * r * L, -0.96 * r * W, 0),
      hullProj.project(1.24 * r * L, 0.96 * r * W, 0),
      hullProj.project(-1.24 * r * L, 0.96 * r * W, 0)
    ].map((pt) => ({ x: pt.x + 4.0, y: pt.y + 5.0 }));
    drawPolyPts(ctx, shadowPts, 'rgba(65, 50, 40, 0.38)', null, 0);

    const hullFaces = [];
    pushTrackedSuspension3D(hullFaces, hullProj, r, -1.16 * r * L, 1.16 * r * L, 0.50 * r * W, 0.90 * r * W, 0.28 * r * H, 6, armorDark, seamCol, treadPhase, p.showRoadWheels !== false, -2.0);

    // Super-Heavy Hull with Sloped Glacis, Side Skirts & Rear Engine Louver Deck
    pushBox3D(hullFaces, hullProj, -1.16 * r * L, 1.14 * r * L, -0.92 * r * W, 0.92 * r * W, 0.18 * r * H, 0.50 * r * H, armorBase, seamCol, 1.2, 0, 0.10 * r * L, 0.06 * r * W);
    // Raised Center Engine Deck & Front Glacis Hatch Block
    pushBox3D(hullFaces, hullProj, -1.08 * r * L, -0.52 * r * L, -0.64 * r * W, 0.64 * r * W, 0.50 * r * H, 0.58 * r * H, armorDark, seamCol, 1.05, 0.25);
    pushBox3D(hullFaces, hullProj, 0.68 * r * L, 1.06 * r * L, -0.32 * r * W, 0.32 * r * W, 0.48 * r * H, 0.56 * r * H, armorHi, seamCol, 1.05, 0.3);
    flushFaces(ctx, hullFaces);

    const turProj = createProjector(turretAngle, pitchScale, zScale, -0.04 * r * L, 0, 0, hullAngle);
    const turFaces = [];
    const zTurBot = 0.50 * r * H;
    const zTurTop = 0.96 * r * H;

    // Massive Cast/Welded Turret with Sloped Composite Cheek Blocks
    pushBox3D(turFaces, turProj, -0.88 * r * L, 0.58 * r * L, -0.70 * r * W, 0.70 * r * W, zTurBot, zTurTop, armorBase, seamCol, 1.2, 1.0, 0.16 * r * L, 0.14 * r * W);
    // Red Insignia Cheek Stripes & Rear Stowage Bustle Basket
    for (const side of [-1, 1]) {
      pushBox3D(turFaces, turProj, -0.18 * r * L, 0.32 * r * L, side * 0.65 * r * W, side * 0.72 * r * W, zTurBot + 0.12 * r * H, zTurTop - 0.10 * r * H, crimson, seamCol, 1.0, 1.15);
    }
    pushBox3D(turFaces, turProj, -1.12 * r * L, -0.86 * r * L, -0.52 * r * W, 0.52 * r * W, zTurBot + 0.08 * r * H, zTurTop - 0.06 * r * H, armorDark, seamCol, 1.05, 1.1);

    // Armored Twin-Gun Mantlet Box
    pushBox3D(turFaces, turProj, 0.44 * r * L, 0.70 * r * L, -0.42 * r * W, 0.42 * r * W, zTurBot + 0.08 * r * H, zTurTop - 0.06 * r * H, armorDark, seamCol, 1.15, 1.28);

    // Twin 125mm Heavy Cannons with Bore Evacuators & Muzzle Brakes (matching china_overlord_diorama_ref.png!)
    const bLen = p.barrelLength || 1.0;
    const recDist = clamp(recoil * 0.05 * r, 0, 0.30 * r);
    const zGun = (zTurBot + zTurTop) * 0.52;
    for (const side of [-1, 1]) {
      const by = side * 0.24 * r * W;
      pushTubeSegment3D(turFaces, turProj, 0.54 * r * L - recDist, by, zGun, 0, 0, 1.58 * r * bLen, 0.105 * r, 0.088 * r, armorHi, seamCol, 1.1, 1.50);
      // Mid-barrel fume extractor (bore evacuator)
      pushTubeSegment3D(turFaces, turProj, (0.54 + 0.62 * bLen) * r * L - recDist, by, zGun, 0, 0, 0.32 * r * bLen, 0.138 * r, 0.135 * r, armorBase, seamCol, 1.1, 1.56);
      // Dark gunmetal muzzle brake collar
      pushTubeSegment3D(turFaces, turProj, (0.54 + 1.44 * bLen) * r * L - recDist, by, zGun, 0, 0, 0.20 * r * bLen, 0.125 * r, 0.125 * r, '#334155', seamCol, 1.1, 1.62);
    }

    // Dorsal Gattling Cannon / Propaganda Speaker Tower & Dual Whip Antennas
    if (p.showRoofGatling !== false) {
      pushCylinderZ3D(turFaces, turProj, -0.14 * r * L, 0.12 * r * W, zTurTop, zTurTop + 0.14 * r * H, 0.26 * r, 0.22 * r, 8, armorDark, seamCol, 1.05, 1.75);
      pushBox3D(turFaces, turProj, -0.32 * r * L, 0.08 * r * L, -0.06 * r * W, 0.30 * r * W, zTurTop + 0.14 * r * H, zTurTop + 0.38 * r * H, armorHi, seamCol, 1.1, 1.85);
      pushTubeSegment3D(turFaces, turProj, 0.06 * r * L, 0.12 * r * W, zTurTop + 0.26 * r * H, 0, 0, 0.54 * r, 0.075 * r, 0.070 * r, '#334155', seamCol, 1.05, 1.95);
      if (isEmperor) {
        // Emperor Overlord Propaganda Speaker Array Mast behind cupola
        pushBox3D(turFaces, turProj, -0.68 * r * L, -0.42 * r * L, -0.32 * r * W, 0.32 * r * W, zTurTop, zTurTop + 0.52 * r * H, crimson, seamCol, 1.1, 1.92);
      }
    }

    turFaces.push({
      depth: turProj.project(-0.98 * r * L, 0, zTurTop + 0.55 * r * H).depth + 2.05,
      customDraw(c) {
        for (const side of [-1, 1]) {
          drawLine3D(c, turProj, -0.96 * r * L, side * 0.44 * r * W, zTurTop, -1.04 * r * L, side * 0.48 * r * W, zTurTop + 0.72 * r * H, seamCol, 1.2);
        }
      }
    });

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
      armorHighlightColor: '#4c586e',
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
    const armorMid = '#3b4659';
    const armorHi = p.armorHighlightColor || '#4c586e';
    const armorDark = p.armorShadowColor || '#1e293b';
    const seamCol = p.panelLineColor || '#26201b';
    const glassCol = p.glassColor || '#f59e0b';

    const proj = createProjector(hullAngle, pitchScale, zScale, 0, 0, 0, 0);

    // Ground Contact Shadow (sharp W-tail delta silhouette)
    const shadowPts = [
      proj.project(-1.08 * r * L, -1.30 * r * W, 0),
      proj.project(1.42 * r * L, 0, 0),
      proj.project(-1.08 * r * L, 1.30 * r * W, 0),
      proj.project(-0.88 * r * L, 0, 0)
    ].map((pt) => ({ x: pt.x + 5.0, y: pt.y + 7.0 }));
    drawPolyPts(ctx, shadowPts, 'rgba(30, 41, 59, 0.30)', null, 0);

    const faces = [];
    const zAir = 0.30 * r * H + hoverZ;

    // 0. Tricycle Landing Gear (Nose Wheel + 2 Main Gear Wheels) & Finned GBU-27 Paveway III Bunker-Buster Bombs
    const mSlide = clamp(recoil * 0.09 * r, 0, 0.48 * r);
    // Forward Nose Landing Gear Wheel under cockpit nose
    faces.push({
      depth: proj.project(0.56 * r * L, 0, zAir - 0.15 * r).depth - 0.50,
      customDraw(c) {
        const sPt = proj.project(0.58 * r * L, 0, zAir);
        const wPt = proj.project(0.56 * r * L, 0, zAir - 0.15 * r);
        c.strokeStyle = '#94a3b8';
        c.lineWidth = 1.4;
        c.beginPath();
        c.moveTo(sPt.x, sPt.y);
        c.lineTo(wPt.x, wPt.y);
        c.stroke();

        c.fillStyle = '#0f172a';
        c.strokeStyle = seamCol;
        c.lineWidth = 1.0;
        c.beginPath();
        c.arc(wPt.x, wPt.y, Math.max(1.8, 0.075 * r), 0, Math.PI * 2);
        c.fill();
        c.stroke();
      }
    });

    for (const side of [-1, 1]) {
      // Main landing gear wheel + oleo strut under inner wing root
      const wy = side * 0.38 * r * W;
      const wx = -0.22 * r * L;
      faces.push({
        depth: proj.project(wx, wy, zAir - 0.15 * r).depth - 0.45,
        customDraw(c) {
          const sPt = proj.project(wx, wy * 0.88, zAir);
          const wPt = proj.project(wx, wy, zAir - 0.15 * r);
          c.strokeStyle = '#94a3b8';
          c.lineWidth = 1.6;
          c.beginPath();
          c.moveTo(sPt.x, sPt.y);
          c.lineTo(wPt.x, wPt.y);
          c.stroke();

          c.fillStyle = '#0f172a';
          c.strokeStyle = seamCol;
          c.lineWidth = 1.05;
          c.beginPath();
          c.arc(wPt.x, wPt.y, Math.max(2.2, 0.095 * r), 0, Math.PI * 2);
          c.fill();
          c.stroke();

          c.fillStyle = '#64748b';
          c.beginPath();
          c.arc(wPt.x, wPt.y, Math.max(0.9, 0.038 * r), 0, Math.PI * 2);
          c.fill();
        }
      });

      // Under-wing / Internal Bay GBU-27 Paveway III Bunker-Buster Bomb with Cruciform Tail Fins & Seeker Nose
      if (p.showWingMissiles !== false) {
        const my = side * 0.64 * r * W;
        const mz = zAir - 0.07 * r * H;
        pushTubeSegment3D(faces, proj, -0.50 * r * L + mSlide, my, mz, 0, 0, 0.60 * r * L, 0.078 * r, 0.078 * r, '#475569', seamCol, 0.95, 0.08);
        // Yellow live-ordnance band + Paveway guidance collar + seeker nose tip
        pushTubeSegment3D(faces, proj, 0.08 * r * L + mSlide, my, mz, 0, 0, 0.14 * r * L, 0.078 * r, 0.062 * r, '#eab308', seamCol, 0.9, 0.10);
        pushTubeSegment3D(faces, proj, 0.22 * r * L + mSlide, my, mz, 0, 0, 0.14 * r * L, 0.058 * r, 0.020 * r, '#b45309', seamCol, 0.85, 0.12);
        faces.push({
          depth: proj.project(-0.46 * r * L + mSlide, my, mz).depth + 0.13,
          customDraw(c) {
            drawPolyPts(c, [
              proj.project(-0.52 * r * L + mSlide, my - 0.13 * r * W, mz),
              proj.project(-0.36 * r * L + mSlide, my, mz),
              proj.project(-0.52 * r * L + mSlide, my + 0.13 * r * W, mz)
            ], '#334155', seamCol, 0.85);
          }
        });
      }
    }

    // 1. Sharp Swept F-117A Faceted Stealth Delta Wings (with W-shaped trailing edge & beaver-tail center)
    const wingBot = [
      [-0.86 * r * L, 0, zAir],
      [-1.06 * r * L, -0.44 * r * W, zAir],
      [-0.82 * r * L, -1.30 * r * W, zAir],
      [0.36 * r * L, -0.36 * r * W, zAir],
      [1.40 * r * L, 0, zAir],
      [0.36 * r * L, 0.36 * r * W, zAir],
      [-0.82 * r * L, 1.30 * r * W, zAir],
      [-1.06 * r * L, 0.44 * r * W, zAir]
    ];
    const wingTop = wingBot.map((pt) => [pt[0], pt[1], zAir + 0.11 * r * H]);
    pushFrustumFaces(faces, proj, wingBot, wingTop, armorBase, seamCol, 1.2, 0.20);

    // 2. Angular Pyramid Faceted Stealth Fuselage Spine (Forward Chined Nose + Upper Cockpit Pyramid + Flat-Sided Aft Engine Box)
    const fuseBot = [
      [-0.96 * r * L, -0.40 * r * W, zAir + 0.11 * r * H],
      [0.36 * r * L, -0.36 * r * W, zAir + 0.11 * r * H],
      [1.36 * r * L, 0, zAir + 0.11 * r * H],
      [0.36 * r * L, 0.36 * r * W, zAir + 0.11 * r * H],
      [-0.96 * r * L, 0.40 * r * W, zAir + 0.11 * r * H]
    ];
    const fuseTop = [
      [-0.60 * r * L, -0.16 * r * W, zAir + 0.44 * r * H],
      [0.08 * r * L, -0.18 * r * W, zAir + 0.50 * r * H],
      [0.64 * r * L, 0, zAir + 0.43 * r * H],
      [0.08 * r * L, 0.18 * r * W, zAir + 0.50 * r * H],
      [-0.60 * r * L, 0.16 * r * W, zAir + 0.44 * r * H]
    ];
    pushFrustumFaces(faces, proj, fuseBot, fuseTop, armorHi, seamCol, 1.2, 0.55);

    // 3. Multi-Tone Origami Planar Facets, Cross-Hatched Over-Wing Intakes, FLIR Sensor Well, Stepped Pitot Prongs, USAF Insignia & 5-Pane Serrated Golden Canopy
    const canDepth = proj.project(0.32 * r * L, 0, zAir + 0.50 * r * H).depth + 0.88;
    faces.push({
      depth: canDepth,
      customDraw(c) {
        const zW = zAir + 0.115 * r * H;

        // 3A. Stepped Twin Nose Pitot Prongs at Diamond Apex
        for (const side of [-1, 1]) {
          drawLine3D(c, proj, 1.34 * r * L, side * 0.045 * r * W, zAir + 0.09 * r * H, 1.58 * r * L, side * 0.045 * r * W, zAir + 0.09 * r * H, seamCol, 1.35);
          drawLine3D(c, proj, 1.44 * r * L, side * 0.045 * r * W, zAir + 0.09 * r * H, 1.48 * r * L, side * 0.075 * r * W, zAir + 0.11 * r * H, '#64748b', 1.0);
        }

        // 3B. Multi-Tone Planar Wing & Fuselage Origami Facets + Elevons + USAF Insignia
        for (const side of [-1, 1]) {
          // Outer Wing Mid-Slate Triangle Facet
          drawPolyPts(c, [
            proj.project(0.36 * r * L, side * 0.36 * r * W, zW),
            proj.project(-0.42 * r * L, side * 0.94 * r * W, zW),
            proj.project(-0.74 * r * L, side * 0.52 * r * W, zW)
          ], armorMid, seamCol, 0.95);

          // Wingtip Dark-Charcoal Triangle Facet
          drawPolyPts(c, [
            proj.project(-0.42 * r * L, side * 0.94 * r * W, zW),
            proj.project(-0.82 * r * L, side * 1.30 * r * W, zW),
            proj.project(-0.94 * r * L, side * 0.84 * r * W, zW),
            proj.project(-0.74 * r * L, side * 0.52 * r * W, zW)
          ], armorDark, seamCol, 0.95);

          // Inboard & Outboard Trailing-Edge Elevon Control Surfaces
          drawPolyPts(c, [
            proj.project(-0.74 * r * L, side * 0.44 * r * W, zW),
            proj.project(-0.82 * r * L, side * 0.84 * r * W, zW),
            proj.project(-0.94 * r * L, side * 0.84 * r * W, zW),
            proj.project(-1.05 * r * L, side * 0.44 * r * W, zW)
          ], armorHi, seamCol, 0.90);
          drawPolyPts(c, [
            proj.project(-0.72 * r * L, side * 0.84 * r * W, zW),
            proj.project(-0.74 * r * L, side * 1.22 * r * W, zW),
            proj.project(-0.82 * r * L, side * 1.28 * r * W, zW),
            proj.project(-0.94 * r * L, side * 0.84 * r * W, zW)
          ], armorBase, seamCol, 0.90);

          // Forward Nose Cheek Planar Triangle Facet (Directional Lighting Contrast!)
          drawPolyPts(c, [
            proj.project(1.36 * r * L, 0, zW),
            proj.project(0.64 * r * L, 0, zAir + 0.43 * r * H),
            proj.project(0.36 * r * L, side * 0.36 * r * W, zW)
          ], side > 0 ? armorHi : armorMid, seamCol, 1.05);

          // Mid-Fuselage Shoulder Facet & Aft Flat-Sided Engine Box Facet
          drawPolyPts(c, [
            proj.project(0.36 * r * L, side * 0.36 * r * W, zW),
            proj.project(0.08 * r * L, side * 0.18 * r * W, zAir + 0.50 * r * H),
            proj.project(-0.60 * r * L, side * 0.16 * r * W, zAir + 0.44 * r * H),
            proj.project(-0.96 * r * L, side * 0.40 * r * W, zW)
          ], side > 0 ? armorMid : armorDark, seamCol, 1.05);

          // Ridge creases across pyramid hull
          drawLine3D(c, proj, 0.64 * r * L, 0, zAir + 0.43 * r * H, 0.36 * r * L, side * 0.36 * r * W, zW, seamCol, 1.1);
          drawLine3D(c, proj, 0.08 * r * L, side * 0.18 * r * W, zAir + 0.50 * r * H, 0.36 * r * L, side * 0.36 * r * W, zW, seamCol, 1.1);
          drawLine3D(c, proj, -0.32 * r * L, side * 0.17 * r * W, zAir + 0.47 * r * H, -0.44 * r * L, side * 0.38 * r * W, zW, seamCol, 0.95);
          drawLine3D(c, proj, -0.60 * r * L, side * 0.16 * r * W, zAir + 0.44 * r * H, -0.96 * r * L, side * 0.40 * r * W, zW, seamCol, 1.1);

          // Large Rectangular Cross-Hatched Over-Wing Engine Intake Grille on Pyramid Shoulder
          const ix0 = 0.00 * r * L;
          const ix1 = 0.32 * r * L;
          const iy0 = side * 0.20 * r * W;
          const iy1 = side * 0.34 * r * W;
          const iz0 = zAir + 0.28 * r * H;
          const iz1 = zAir + 0.14 * r * H;
          drawPolyPts(c, [
            proj.project(ix0, iy0, iz0),
            proj.project(ix1, iy0 * 0.95, iz0 - 0.02 * r * H),
            proj.project(ix1 - 0.04 * r * L, iy1, iz1),
            proj.project(ix0 - 0.06 * r * L, iy1 * 0.96, iz1 + 0.02 * r * H)
          ], '#0f172a', seamCol, 1.05);
          // Cross-hatch grille bars inside intake
          for (const t of [0.28, 0.52, 0.76]) {
            const gx = lerp(ix0, ix1, t);
            drawLine3D(c, proj, gx, iy0, iz0 - 0.01 * r * H, gx - 0.04 * r * L, iy1, iz1 + 0.01 * r * H, '#475569', 0.85);
          }
          drawLine3D(c, proj, ix0 - 0.02 * r * L, (iy0 + iy1) * 0.5, (iz0 + iz1) * 0.5, ix1 - 0.02 * r * L, (iy0 + iy1) * 0.5, (iz0 + iz1) * 0.5, '#475569', 0.85);

          // Wide Flat Beaver-Tail Slot Exhaust Trough at Trailing Edge + Subtle Amber Heat Shimmer
          drawPolyPts(c, [
            proj.project(-0.88 * r * L, side * 0.05 * r * W, zAir + 0.14 * r * H),
            proj.project(-1.03 * r * L, side * 0.42 * r * W, zAir + 0.14 * r * H),
            proj.project(-1.06 * r * L, side * 0.42 * r * W, zAir + 0.09 * r * H),
            proj.project(-0.91 * r * L, side * 0.05 * r * W, zAir + 0.09 * r * H)
          ], '#0f172a', seamCol, 1.0);
          drawLine3D(c, proj, -0.90 * r * L, side * 0.08 * r * W, zAir + 0.115 * r * H, -1.03 * r * L, side * 0.39 * r * W, zAir + 0.115 * r * H, recoil > 0.2 ? '#fbbf24' : '#d97706', 1.4);

          // Low-Vis USAF Star-and-Bars Insignia on Outer Wing & Aft Fuselage Side Facet
          const wStar = proj.project(-0.62 * r * L, side * 0.72 * r * W, zW + 0.005 * r * H);
          drawLine3D(c, proj, -0.62 * r * L, side * 0.63 * r * W, zW + 0.005 * r * H, -0.62 * r * L, side * 0.81 * r * W, zW + 0.005 * r * H, '#94a3b8', 1.6);
          c.fillStyle = '#cbd5e1';
          c.strokeStyle = seamCol;
          c.lineWidth = 0.75;
          c.beginPath();
          c.arc(wStar.x, wStar.y, Math.max(1.6, 0.058 * r), 0, Math.PI * 2);
          c.fill();
          c.stroke();

          // Fuselage Side Star-and-Bars + Squadron Shield Badge
          const fStar = proj.project(-0.46 * r * L, side * 0.28 * r * W, zAir + 0.26 * r * H);
          drawLine3D(c, proj, -0.54 * r * L, side * 0.28 * r * W, zAir + 0.26 * r * H, -0.38 * r * L, side * 0.28 * r * W, zAir + 0.26 * r * H, '#94a3b8', 1.4);
          c.fillStyle = '#94a3b8';
          c.beginPath();
          c.arc(fStar.x, fStar.y, Math.max(1.4, 0.048 * r), 0, Math.PI * 2);
          c.fill();

          const badgePt = proj.project(-0.18 * r * L, side * 0.25 * r * W, zAir + 0.30 * r * H);
          c.fillStyle = '#cbd5e1';
          c.beginPath();
          c.arc(badgePt.x, badgePt.y, Math.max(1.2, 0.040 * r), 0, Math.PI * 2);
          c.fill();

          // Red-Bordered White Rescue Triangle & Red Cheek Warning Stencils below Cockpit
          const triPt = proj.project(0.46 * r * L, side * 0.21 * r * W, zAir + 0.24 * r * H);
          c.fillStyle = '#fef2f2';
          c.strokeStyle = '#dc2626';
          c.lineWidth = 1.0;
          c.beginPath();
          c.arc(triPt.x, triPt.y, Math.max(1.5, 0.048 * r), 0, Math.PI * 2);
          c.fill();
          c.stroke();
          drawLine3D(c, proj, 0.62 * r * L, side * 0.16 * r * W, zAir + 0.22 * r * H, 0.72 * r * L, side * 0.19 * r * W, zAir + 0.19 * r * H, '#dc2626', 1.3);
        }

        // 3C. Central Nose Spine Ridge Line & Recessed Diamond Golden FLIR Sensor Turret Well ahead of Canopy
        drawLine3D(c, proj, 0.64 * r * L, 0, zAir + 0.43 * r * H, 1.38 * r * L, 0, zAir + 0.11 * r * H, seamCol, 1.25);
        drawPolyPts(c, [
          proj.project(0.96 * r * L, 0, zAir + 0.25 * r * H),
          proj.project(0.84 * r * L, -0.07 * r * W, zAir + 0.29 * r * H),
          proj.project(0.74 * r * L, 0, zAir + 0.34 * r * H),
          proj.project(0.84 * r * L, 0.07 * r * W, zAir + 0.29 * r * H)
        ], '#0f172a', seamCol, 0.95);
        const flirPt = proj.project(0.84 * r * L, 0, zAir + 0.30 * r * H);
        c.fillStyle = '#fbbf24';
        c.beginPath();
        c.arc(flirPt.x, flirPt.y, Math.max(1.5, 0.052 * r), 0, Math.PI * 2);
        c.fill();

        // 3D. 5-Pane Serrated Golden-Amber Stealth Canopy (2 Front V-Windshield Panes + 2 Side Trapezoid Panes + 1 Top Crown Triangle Pane)
        for (const side of [-1, 1]) {
          const frontPane = [
            [0.34 * r * L, side * 0.025 * r * W, zAir + 0.46 * r * H],
            [0.34 * r * L, side * 0.185 * r * W, zAir + 0.27 * r * H],
            [0.64 * r * L, side * 0.115 * r * W, zAir + 0.23 * r * H],
            [0.62 * r * L, side * 0.020 * r * W, zAir + 0.42 * r * H]
          ];
          const sidePane = [
            [0.04 * r * L, side * 0.035 * r * W, zAir + 0.48 * r * H],
            [0.04 * r * L, side * 0.215 * r * W, zAir + 0.28 * r * H],
            [0.31 * r * L, side * 0.185 * r * W, zAir + 0.27 * r * H],
            [0.31 * r * L, side * 0.030 * r * W, zAir + 0.46 * r * H]
          ];
          drawGlassPane3D(c, proj, sidePane, glassCol, seamCol, 1.15);
          drawGlassPane3D(c, proj, frontPane, '#fbbf24', seamCol, 1.15);
        }
        // Top Rear 5th Triangular Crown Pane + Red Dorsal Rescue Stencil
        const topCrownPane = [
          [-0.14 * r * L, 0, zAir + 0.48 * r * H],
          [0.04 * r * L, -0.09 * r * W, zAir + 0.49 * r * H],
          [0.26 * r * L, 0, zAir + 0.49 * r * H],
          [0.04 * r * L, 0.09 * r * W, zAir + 0.49 * r * H]
        ];
        drawGlassPane3D(c, proj, topCrownPane, '#fef08a', seamCol, 1.05);
        drawLine3D(c, proj, -0.26 * r * L, -0.05 * r * W, zAir + 0.47 * r * H, -0.26 * r * L, 0.05 * r * W, zAir + 0.47 * r * H, '#dc2626', 1.4);
      }
    });

    // 4. Tall Canted V-Tail Butterfly Stabilizers (with Multi-Faceted Crease & Rudder Seam)
    for (const side of [-1, 1]) {
      const yBase = side * 0.16 * r * W;
      const yTip = side * 0.46 * r * W;
      const finPts = [
        proj.project(-0.96 * r * L, yBase, zAir + 0.16 * r * H),
        proj.project(-0.46 * r * L, yBase, zAir + 0.20 * r * H),
        proj.project(-0.64 * r * L, yTip, zAir + 0.70 * r * H),
        proj.project(-0.98 * r * L, yTip, zAir + 0.65 * r * H)
      ];
      const finAftPts = [
        proj.project(-0.96 * r * L, yBase, zAir + 0.16 * r * H),
        proj.project(-0.76 * r * L, yBase, zAir + 0.18 * r * H),
        proj.project(-0.82 * r * L, yTip, zAir + 0.67 * r * H),
        proj.project(-0.98 * r * L, yTip, zAir + 0.65 * r * H)
      ];
      faces.push({
        depth: proj.project(-0.74 * r * L, yTip, zAir + 0.48 * r * H).depth + 1.05,
        customDraw(c) {
          drawPolyPts(c, finPts, side > 0 ? armorMid : armorDark, seamCol, 1.15);
          drawPolyPts(c, finAftPts, armorDark, seamCol, 0.95);
          // Fin tip cap highlight
          drawLine3D(c, proj, -0.64 * r * L, yTip, zAir + 0.70 * r * H, -0.98 * r * L, yTip, zAir + 0.65 * r * H, '#94a3b8', 1.3);
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
          { key: 'armorBaseColor',      label: 'Primary Armor Tone', type: 'color', default: '#6e7b4f' },
          { key: 'armorHighlightColor', label: 'Sunlit Deck Tone',   type: 'color', default: '#879663' },
          { key: 'armorShadowColor',    label: 'Shadow Flank Tone',  type: 'color', default: '#4a5434' },
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
    { key: 'ShowAutoloader', label: 'Bustle Rack / Rear Stowage', type: 'toggle', default: true }
  ]);
  const CHINA_TANK_PRESETS = createFactionPresets('PLA Olive Armor',
    { name: 'Red Army Breakthrough', params: { turretScale: 1.08, barrelLength: 1.15, ShowAutoloader: true } },
    { name: 'Nationalism Horde Spec', params: { hullWidth: 1.08, ShowFactionEmblem: true, ShowUpgradeKit: true } },
    { name: 'Depleted Uranium Spec', params: { barrelLength: 1.22, armorBaseColor: '#5c6b43', houseColor: '#84cc16' } },
    { name: 'General Kwai Red Guard Division', params: { hullScale: 1.08, turretScale: 1.12, extrusionDepth: 1.12 } }
  );

  const CHINA_ARTILLERY_PARAM_SCHEMA = createFactionSchema('Ordnance & Stabilizer System', [
    { key: 'barrelLength',  label: 'Ordnance Tube Length', min: 0.80, max: 1.40, step: 0.01, default: 1.00 },
    { key: 'gunElevation',  label: 'Firing Elevation (rad)', min: 0.15, max: 0.85, step: 0.01, default: 0.48 },
    { key: 'DeployOutriggers', label: 'Deploy Stabilizer Spades', type: 'toggle', default: true }
  ]);
  const CHINA_ARTILLERY_PRESETS = createFactionPresets('PLA Siege Artillery',
    { name: 'Black Napalm Firestorm', params: { barrelLength: 1.15, gunElevation: 0.54, houseColor: '#f97316' } },
    { name: 'Deployed Siege Battery', params: { DeployOutriggers: true, hullWidth: 1.10, gunElevation: 0.62 } },
    { name: 'Neutron Shell Spec', params: { barrelLength: 1.25, armorBaseColor: '#5c6b43', houseColor: '#eab308' } },
    { name: 'General Tao Tactical Nuke', params: { hullScale: 1.10, barrelLength: 1.28, extrusionDepth: 1.15 } }
  );

  const CHINA_WHEELED_PARAM_SCHEMA = createFactionSchema('Superstructure & Payload Bay', [
    { key: 'cargoScale',   label: 'Canvas Canopy / Bay Volume', min: 0.80, max: 1.30, step: 0.01, default: 1.00 },
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
    { key: 'ShowNapalmPods', label: 'Underwing Missiles', type: 'toggle', default: true }
  ]);
  const MIG_PRESETS = createFactionPresets('MiG-1.44 Strike Fighter',
    { name: 'Black Napalm Firestorm', params: { ShowNapalmPods: true, houseColor: '#f97316' } },
    { name: 'MiG Armor Plating Upgrade', params: { hullWidth: 1.12, wingSpan: 1.10, extrusionDepth: 1.12 } },
    { name: 'Supersonic Air Superiority Grey', params: { armorBaseColor: '#94a3b8', armorHighlightColor: '#cbd5e1', armorShadowColor: '#475569' } },
    { name: 'General Tao Tactical Nuke MiG', params: { armorBaseColor: '#6e7b4f', armorHighlightColor: '#879663', houseColor: '#84cc16', ShowNapalmPods: true } }
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
      armorBaseColor: '#6e7b4f', armorHighlightColor: '#879663', armorShadowColor: '#4a5434', houseColor: '#dc2626'
    }, customParams || {});
    const opts = options || {};
    const defId = String((u && u.defId) || 'CHINA_BATTLEMASTER');
    const isNuke = defId.includes('NUKE');
    const isDragon = defId === 'CHINA_DRAGON_TANK';
    const isGattling = defId === 'CHINA_GATTLING_TANK';
    const isEcm = defId === 'CHINA_ECM_TANK';
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

    const armorBase = isNuke ? '#657351' : (p.armorBaseColor || '#6e7b4f');
    const armorHi   = isNuke ? '#84946b' : (p.armorHighlightColor || '#879663');
    const armorDark = isNuke ? '#434d34' : (p.armorShadowColor || '#4a5434');
    const crimson   = isNuke ? '#84cc16' : (p.houseColor || '#dc2626');
    const seamCol   = '#241f1a';

    const hullProj = createProjector(hullAngle, pitchScale, zScale, 0, 0, 0, 0);
    const shadowPts = [
      hullProj.project(-1.14 * r * L, -0.88 * r * W, 0),
      hullProj.project( 1.14 * r * L, -0.88 * r * W, 0),
      hullProj.project( 1.14 * r * L,  0.88 * r * W, 0),
      hullProj.project(-1.14 * r * L,  0.88 * r * W, 0)
    ].map((pt) => ({ x: pt.x + 3.0, y: pt.y + 4.0 }));
    drawPolyPts(ctx, shadowPts, 'rgba(60, 48, 36, 0.36)', null, 0);

    const hullFaces = [];
    const wheelCount = (isDragon || isGattling) ? 5 : 6;
    pushTrackedSuspension3D(
      hullFaces,
      hullProj,
      r,
      -1.06 * r * L,
      1.06 * r * L,
      0.46 * r * W,
      0.84 * r * W,
      0.26 * r * H,
      wheelCount,
      isDragon ? '#b91c1c' : armorDark,
      seamCol,
      treadPhase,
      true,
      -2.0
    );

    // Main Olive-Green Armored Hull with Beveled Glacis & Side Skirts
    pushBox3D(hullFaces, hullProj, -1.06 * r * L, 1.06 * r * L, -0.80 * r * W, 0.80 * r * W, 0.16 * r * H, 0.46 * r * H, armorBase, seamCol, 1.18, 0, 0.12 * r * L, 0.06 * r * W);
    // Rear Engine Louver Deck
    pushBox3D(hullFaces, hullProj, -1.02 * r * L, -0.48 * r * L, -0.60 * r * W, 0.60 * r * W, 0.46 * r * H, 0.52 * r * H, armorDark, seamCol, 1.05, 0.25);

    // Glacis Details: Dragon Tank Flame Nose Paint OR Gattling Tank 3 Lower Glacis Blocks + Driver Hatch
    hullFaces.push({
      depth: hullProj.project(0.96 * r * L, 0, 0.36 * r * H).depth + 0.42,
      customDraw(c) {
        if (isDragon) {
          // Fiery Orange & Yellow Dragon Flame Stripes across the front glacis nose (matching china_dragon_tank_diorama_ref.png!)
          for (const fy of [-0.46, 0, 0.46]) {
            const flamePoly = [
              hullProj.project(1.06 * r * L, (fy - 0.22) * r * W, 0.24 * r * H),
              hullProj.project(1.06 * r * L, (fy + 0.22) * r * W, 0.24 * r * H),
              hullProj.project(0.64 * r * L, fy * r * W, 0.46 * r * H)
            ];
            drawPolyPts(c, flamePoly, '#ea580c', seamCol, 0.85);
            const innerFlame = [
              hullProj.project(1.06 * r * L, (fy - 0.11) * r * W, 0.23 * r * H),
              hullProj.project(1.06 * r * L, (fy + 0.11) * r * W, 0.23 * r * H),
              hullProj.project(0.78 * r * L, fy * r * W, 0.44 * r * H)
            ];
            drawPolyPts(c, innerFlame, '#facc15', null, 0);
          }
        } else {
          // 3 Recessed Lower-Glacis ERA/Tow Blocks + Upper Glacis Driver Hatch (matching china_gattling_tank & china_battlemaster!)
          for (const bx of [-0.42, 0, 0.42]) {
            const blk = [
              hullProj.project(1.05 * r * L, (bx - 0.14) * r * W, 0.20 * r * H),
              hullProj.project(1.05 * r * L, (bx + 0.14) * r * W, 0.20 * r * H),
              hullProj.project(0.96 * r * L, (bx + 0.14) * r * W, 0.34 * r * H),
              hullProj.project(0.96 * r * L, (bx - 0.14) * r * W, 0.34 * r * H)
            ];
            drawPolyPts(c, blk, armorDark, seamCol, 0.9);
          }
          // Upper glacis driver periscope hatch
          const hatch = [
            hullProj.project(0.68 * r * L, -0.20 * r * W, 0.465 * r * H),
            hullProj.project(0.68 * r * L,  0.20 * r * W, 0.465 * r * H),
            hullProj.project(0.90 * r * L,  0.18 * r * W, 0.455 * r * H),
            hullProj.project(0.90 * r * L, -0.18 * r * W, 0.455 * r * H)
          ];
          drawPolyPts(c, hatch, armorDark, seamCol, 0.95);
        }
      }
    });

    if (isDragon) {
      // Transverse Horizontal Crimson-Red Cylindrical Napalm Fuel Drum strapped across the rear deck
      // with two grey metallic clamp bands (matching china_dragon_tank_diorama_ref.png!)
      const drumX = -0.68 * r * L;
      const drumZ = 0.66 * r * H;
      pushTubeSegment3D(
        hullFaces,
        hullProj,
        drumX,
        -0.68 * r * W,
        drumZ,
        0,
        Math.PI * 0.5,
        1.36 * r * W,
        0.22 * r * H,
        0.22 * r * H,
        '#dc2626',
        seamCol,
        1.15,
        0.65
      );
      // Two grey metallic mounting straps around the crimson napalm cylinder
      for (const sy of [-0.36 * r * W, 0.36 * r * W]) {
        pushTubeSegment3D(
          hullFaces,
          hullProj,
          drumX,
          sy - 0.05 * r * W,
          drumZ,
          0,
          Math.PI * 0.5,
          0.10 * r * W,
          0.235 * r * H,
          0.235 * r * H,
          '#64748b',
          seamCol,
          1.05,
          0.72
        );
      }
    }
    flushFaces(ctx, hullFaces);

    const turProj = createProjector(turretAngle, pitchScale, zScale, (isDragon ? 0.16 : 0.06) * r * L, 0, 0, hullAngle);
    const turFaces = [];
    const zTurBot = 0.46 * r * H;
    const zTurTop = 0.82 * r * H;
    const recDist = clamp(recoil * 0.04 * r, 0, 0.22 * r);

    if (isDragon) {
      // ======================================================================
      // CHINA DRAGON TANK: Sculpted Crimson-Orange Chinese Dragon Head Turret Cowl
      // with Swept Horns, Glowing Yellow Eyes, Open Jaws & Erupting Fireball!
      // (Matches assets/refs/china_dragon_tank_diorama_ref.png!)
      // ======================================================================
      // Olive armored turret collar base
      pushCylinderZ3D(turFaces, turProj, -0.06 * r * TS, 0, zTurBot, zTurBot + 0.18 * r * H, 0.46 * r * TS, 0.42 * r * TS, 10, armorBase, seamCol, 1.1, 0.95);
      // Crimson-red sculpted Dragon Head upper cranium & snout
      pushBox3D(turFaces, turProj, -0.34 * r * TS, 0.48 * r * TS, -0.44 * r * TS, 0.44 * r * TS, zTurBot + 0.08 * r * H, zTurTop + 0.08 * r * H, '#dc2626', seamCol, 1.18, 1.1, 0.14 * r * TS, 0.10 * r * TS);
      // Swept-back orange-gold Dragon Horns / Mane Spikes on left & right temples
      for (const side of [-1, 1]) {
        pushTubeSegment3D(
          turFaces,
          turProj,
          -0.06 * r * TS,
          side * 0.36 * r * TS,
          zTurTop + 0.02 * r * H,
          0.32,
          Math.PI + side * 0.28,
          0.56 * r * TS,
          0.11 * r * TS,
          0.03 * r * TS,
          '#f59e0b',
          seamCol,
          1.1,
          1.35
        );
        // Secondary lower cheek horn fin
        pushTubeSegment3D(
          turFaces,
          turProj,
          -0.12 * r * TS,
          side * 0.42 * r * TS,
          zTurBot + 0.22 * r * H,
          0.12,
          Math.PI + side * 0.38,
          0.42 * r * TS,
          0.09 * r * TS,
          0.025 * r * TS,
          '#ea580c',
          seamCol,
          1.05,
          1.25
        );
      }
      // Slanted glowing yellow Dragon Eyes & Brow Ridge
      turFaces.push({
        depth: turProj.project(0.38 * r * TS, 0, zTurTop).depth + 1.48,
        customDraw(c) {
          for (const side of [-1, 1]) {
            const eyePts = [
              turProj.project(0.36 * r * TS, side * 0.14 * r * TS, zTurTop - 0.06 * r * H),
              turProj.project(0.20 * r * TS, side * 0.38 * r * TS, zTurTop + 0.02 * r * H),
              turProj.project(0.14 * r * TS, side * 0.34 * r * TS, zTurTop - 0.10 * r * H)
            ];
            drawPolyPts(c, eyePts, '#fef08a', seamCol, 1.05);
          }
        }
      });
      // Central High-Pressure Igniter Nozzle emerging from the Dragon's open jaws
      const zNoz = (zTurBot + zTurTop) * 0.54;
      pushTubeSegment3D(turFaces, turProj, 0.38 * r * TS, 0, zNoz, 0.05, 0, 0.62 * r * BL, 0.14 * r, 0.16 * r, '#334155', seamCol, 1.15, 1.42);
      // Pilot flame / Erupting Napalm Fireball Plume at the Dragon Muzzle (matching china_dragon_tank_diorama_ref.png!)
      const fbLen = (recoil > 0.2 ? 0.85 : 0.48) * r * BL;
      const fbRad = (recoil > 0.2 ? 0.34 : 0.22) * r;
      pushTubeSegment3D(turFaces, turProj, (0.38 * TS + 0.56 * BL) * r, 0, zNoz + 0.03 * r * H, 0.06, 0, fbLen, 0.14 * r, fbRad, '#f97316', '#ea580c', 1.0, 1.75);
      pushTubeSegment3D(turFaces, turProj, (0.38 * TS + 0.68 * BL) * r, 0, zNoz + 0.04 * r * H, 0.06, 0, fbLen * 0.65, 0.09 * r, fbRad * 0.68, '#fde047', '#f59e0b', 0.85, 1.85);
    } else if (isGattling) {
      // ======================================================================
      // CHINA GATTLING TANK: Rounded Cast Olive Turret, Sloped Mantlet Shroud
      // & Central 6-Barrel Gunmetal Rotary Gattling Cannon Bundle!
      // (Matches assets/refs/china_gattling_tank_diorama_ref.png!)
      // ======================================================================
      pushCylinderZ3D(turFaces, turProj, -0.06 * r * TS, 0, zTurBot, zTurTop, 0.52 * r * TS, 0.44 * r * TS, 12, armorBase, seamCol, 1.18, 1.0);
      // Roof Commander Cupola Hatch
      pushCylinderZ3D(turFaces, turProj, -0.14 * r * TS, -0.10 * r * TS, zTurTop, zTurTop + 0.10 * r * H, 0.20 * r * TS, 0.18 * r * TS, 8, armorHi, seamCol, 1.05, 1.35);
      // Sloped Front Armored Mantlet Shroud
      pushBox3D(turFaces, turProj, 0.22 * r * TS, 0.54 * r * TS, -0.28 * r * TS, 0.28 * r * TS, zTurBot + 0.04 * r * H, zTurTop - 0.04 * r * H, armorHi, seamCol, 1.15, 1.25, 0.08 * r, 0.06 * r);

      // Central 6-Barrel Gunmetal Rotary Gattling Bundle with Mid-Barrel Clamp Collar & Muzzle Disk
      const zGun = (zTurBot + zTurTop) * 0.52;
      const gStart = 0.48 * r * TS - recDist;
      const gLen = 1.08 * r * BL;
      // Core bundle shaft
      pushTubeSegment3D(turFaces, turProj, gStart, 0, zGun, 0.04, 0, gLen, 0.145 * r, 0.145 * r, '#334155', seamCol, 1.15, 1.48);
      // Individual 6 outer rotary barrels drawn around circumference
      for (let b = 0; b < 6; b++) {
        const bAng = (b / 6) * Math.PI * 2 + treadPhase * Math.PI * 4;
        const by = Math.cos(bAng) * 0.095 * r;
        const bz = zGun + Math.sin(bAng) * 0.095 * r;
        pushTubeSegment3D(turFaces, turProj, gStart, by, bz, 0.04, 0, gLen, 0.042 * r, 0.042 * r, '#64748b', seamCol, 0.95, 1.52);
      }
      // Mid-barrel support clamp ring & perforated muzzle cap disk
      pushTubeSegment3D(turFaces, turProj, gStart + gLen * 0.52, 0, zGun + 0.02 * r, 0.04, 0, 0.12 * r, 0.175 * r, 0.175 * r, '#475569', seamCol, 1.1, 1.58);
      pushTubeSegment3D(turFaces, turProj, gStart + gLen * 0.90, 0, zGun + 0.035 * r, 0.04, 0, 0.12 * r, 0.18 * r, 0.18 * r, '#1e293b', seamCol, 1.15, 1.62);
    } else if (isEcm) {
      // CHINA ECM TANK: Olive Turret + Curved Phased-Array Electronic Warfare Jamming Dish
      pushCylinderZ3D(turFaces, turProj, 0, 0, zTurBot, zTurTop - 0.06 * r * H, 0.48 * r * TS, 0.40 * r * TS, 10, armorHi, seamCol, 1.15, 1.0);
      pushBox3D(turFaces, turProj, -0.14 * r * TS, 0.22 * r * TS, -0.58 * r * TS, 0.58 * r * TS, zTurTop - 0.04 * r * H, zTurTop + 0.40 * r * H, '#10b981', seamCol, 1.15, 1.45, 0.04 * r, 0.08 * r);
      pushTubeSegment3D(turFaces, turProj, 0.18 * r * TS, 0, zTurTop + 0.18 * r * H, 0, 0, 0.34 * r * TS, 0.08 * r, 0.12 * r, armorDark, seamCol, 1.1, 1.55);
    } else {
      // ======================================================================
      // CHINA TYPE-98 BATTLEMASTER / NUCLEAR BATTLEMASTER:
      // Angular Welded/Cast Turret with Sloped Cheek Armor, Rear Bustle Basket,
      // Dual Whip Antennas, Roof Cupola + Pintle MG & 125mm Bore-Evacuated Cannon!
      // (Matches assets/refs/china_battlemaster_diorama_ref.png!)
      // ======================================================================
      pushBox3D(turFaces, turProj, -0.56 * r * TS, 0.48 * r * TS, -0.54 * r * TS, 0.54 * r * TS, zTurBot, zTurTop, armorBase, seamCol, 1.2, 1.0, 0.16 * r * TS, 0.12 * r * TS);
      // Raised Turret Roof Plate & Commander Cupola Hatch
      pushBox3D(turFaces, turProj, -0.42 * r * TS, 0.30 * r * TS, -0.38 * r * TS, 0.38 * r * TS, zTurTop, zTurTop + 0.06 * r * H, armorHi, seamCol, 1.05, 1.18);
      pushCylinderZ3D(turFaces, turProj, -0.12 * r * TS, -0.16 * r * TS, zTurTop + 0.04 * r * H, zTurTop + 0.16 * r * H, 0.18 * r * TS, 0.16 * r * TS, 8, armorDark, seamCol, 1.05, 1.32);

      // Rear Turret Bustle Stowage Rack Basket
      if (p.ShowAutoloader !== false) {
        pushBox3D(turFaces, turProj, -0.86 * r * TS, -0.54 * r * TS, -0.42 * r * TS, 0.42 * r * TS, zTurBot + 0.06 * r * H, zTurTop - 0.04 * r * H, armorDark, seamCol, 1.1, 1.15);
      }

      // Roof Pintle Heavy Machine Gun + Dual Rear Whip Antennas
      pushTubeSegment3D(turFaces, turProj, -0.06 * r * TS, -0.16 * r * TS, zTurTop + 0.20 * r * H, 0.04, 0, 0.46 * r, 0.045 * r, 0.038 * r, '#334155', seamCol, 1.0, 1.65);
      turFaces.push({
        depth: turProj.project(-0.78 * r * TS, 0, zTurTop + 0.45 * r * H).depth + 1.75,
        customDraw(c) {
          for (const side of [-1, 1]) {
            drawLine3D(c, turProj, -0.78 * r * TS, side * 0.36 * r * TS, zTurTop, -0.86 * r * TS, side * 0.40 * r * TS, zTurTop + 0.68 * r * H, seamCol, 1.15);
          }
        }
      });

      // Armored Gun Mantlet & Long 125mm Smoothbore Cannon with Bore Evacuator & Muzzle Brake
      const zGun = (zTurBot + zTurTop) * 0.52;
      pushBox3D(turFaces, turProj, 0.38 * r * TS, 0.60 * r * TS, -0.20 * r * TS, 0.20 * r * TS, zTurBot + 0.08 * r * H, zTurTop - 0.06 * r * H, armorDark, seamCol, 1.1, 1.35);
      pushTubeSegment3D(turFaces, turProj, 0.48 * r * TS - recDist, 0, zGun, 0.02, 0, 1.34 * r * BL, 0.098 * r, 0.082 * r, armorHi, seamCol, 1.15, 1.48);
      // Mid-barrel Bore Evacuator (Fume Extractor)
      pushTubeSegment3D(turFaces, turProj, (0.48 * TS + 0.54 * BL) * r - recDist, 0, zGun + 0.01 * r, 0.02, 0, 0.30 * r * BL, 0.132 * r, 0.128 * r, armorBase, seamCol, 1.12, 1.56);
      // Reinforced Muzzle Collar
      pushTubeSegment3D(turFaces, turProj, (0.48 * TS + 1.20 * BL) * r - recDist, 0, zGun + 0.025 * r, 0.02, 0, 0.18 * r * BL, 0.115 * r, 0.115 * r, '#334155', seamCol, 1.12, 1.62);
    }
    flushFaces(ctx, turFaces);
  }

  function renderChinaArtilleryModel(ctx, u, faction, customParams, options) {
    const p = Object.assign({
      hullScale: 1.0, hullLength: 1.0, hullWidth: 1.0, extrusionDepth: 1.0,
      barrelLength: 1.0, gunElevation: 0.48, DeployOutriggers: true,
      armorBaseColor: '#6e7b4f', armorHighlightColor: '#879663', armorShadowColor: '#4a5434', houseColor: '#dc2626'
    }, customParams || {});
    const opts = options || {};
    const defId = String((u && u.defId) || 'CHINA_INFERNO_CANNON');
    const isNuke = defId === 'CHINA_NUKE_CANNON';
    const rawR = (u && u.radius) || (isNuke ? 22 : 18);
    const r = rawR * (p.hullScale || 1.0);
    const L = (p.hullLength || 1.0) * (isNuke ? 1.18 : 1.0);
    const W = p.hullWidth || 1.0, H = p.extrusionDepth || 1.0, BL = p.barrelLength || 1.0;

    const hullAngle = (u && u.angle !== undefined) ? u.angle : 0;
    const turretAngle = (u && u.turretAngle !== undefined) ? u.turretAngle : hullAngle;
    const treadPhase = (u && u.treadPhase) || 0;
    const recoil = (u && u.recoilOffset) || 0;
    const pitchScale = opts.pitchScale !== undefined ? opts.pitchScale : 1.0;
    const zScale = opts.zScale !== undefined ? opts.zScale : 0.42;

    const armorBase = p.armorBaseColor || '#6e7b4f';
    const armorHi   = p.armorHighlightColor || '#879663';
    const armorDark = p.armorShadowColor || '#4a5434';
    const seamCol   = '#241f1a';

    const hullProj = createProjector(hullAngle, pitchScale, zScale, 0, 0, 0, 0);
    const shadowPts = [
      hullProj.project(-1.20 * r * L, -0.90 * r * W, 0),
      hullProj.project( 1.20 * r * L, -0.90 * r * W, 0),
      hullProj.project( 1.20 * r * L,  0.90 * r * W, 0),
      hullProj.project(-1.20 * r * L,  0.90 * r * W, 0)
    ].map((pt) => ({ x: pt.x + 3.2, y: pt.y + 4.2 }));
    drawPolyPts(ctx, shadowPts, 'rgba(60, 48, 36, 0.36)', null, 0);

    const hullFaces = [];
    if (isNuke) {
      // ======================================================================
      // CHINA NUKE CANNON: Articulated Twin-Bogie Tracked Carrier
      // (Separate Front 4-Wheel Track Bogie + Rear 4-Wheel Track Bogie!)
      // (Matches assets/refs/china_nuke_cannon_diorama_ref.png!)
      // ======================================================================
      pushTrackedSuspension3D(hullFaces, hullProj, r, -1.14 * r * L, -0.18 * r * L, 0.48 * r * W, 0.86 * r * W, 0.25 * r * H, 4, armorDark, seamCol, treadPhase, true, -2.0);
      pushTrackedSuspension3D(hullFaces, hullProj, r,  0.18 * r * L,  1.14 * r * L, 0.48 * r * W, 0.86 * r * W, 0.25 * r * H, 4, armorDark, seamCol, treadPhase, true, -2.0);

      // Center Hydraulic Outrigger Bay & Deployed Stabilizer Spades
      if (p.DeployOutriggers !== false) {
        for (const side of [-1, 1]) {
          pushBox3D(hullFaces, hullProj, -0.16 * r * L, 0.16 * r * L, side * 0.76 * r * W, side * 1.12 * r * W, 0.04 * r * H, 0.22 * r * H, '#eab308', seamCol, 1.05, -1.2);
        }
      }
      // Heavy Rear Recoil Stabilizer Spade Dozer Blade
      pushBox3D(hullFaces, hullProj, -1.26 * r * L, -1.08 * r * L, -0.68 * r * W, 0.68 * r * W, 0.04 * r * H, 0.28 * r * H, armorDark, seamCol, 1.1, -1.0);

      // Flatbed Carrier Deck + Boxy Forward Crew/Engine Cab with Front Radiator Louvers
      pushBox3D(hullFaces, hullProj, -1.10 * r * L, 1.10 * r * L, -0.80 * r * W, 0.80 * r * W, 0.18 * r * H, 0.42 * r * H, armorBase, seamCol, 1.18, 0, 0.06 * r * L, 0.04 * r * W);
      pushBox3D(hullFaces, hullProj,  0.34 * r * L, 1.12 * r * L, -0.76 * r * W, 0.76 * r * W, 0.42 * r * H, 0.74 * r * H, armorHi, seamCol, 1.18, 0.35, 0.08 * r * L, 0.04 * r * W);
      // Front vertical radiator grille block on Nuke Cannon cab nose
      pushBox3D(hullFaces, hullProj,  1.04 * r * L, 1.14 * r * L, -0.52 * r * W, 0.52 * r * W, 0.44 * r * H, 0.68 * r * H, '#27272a', seamCol, 1.05, 0.45);
    } else {
      // ======================================================================
      // CHINA INFERNO CANNON: Compact Olive Tracked Artillery Hull with
      // Sloped Glacis, Circular Front Hatch, Louvers & Rear Recoil Spade!
      // (Matches assets/refs/china_inferno_cannon_diorama_ref.png!)
      // ======================================================================
      pushTrackedSuspension3D(hullFaces, hullProj, r, -1.04 * r * L, 1.04 * r * L, 0.46 * r * W, 0.84 * r * W, 0.25 * r * H, 5, armorDark, seamCol, treadPhase, true, -2.0);
      // Rear upturned recoil spade
      pushBox3D(hullFaces, hullProj, -1.18 * r * L, -0.98 * r * L, -0.64 * r * W, 0.64 * r * W, 0.08 * r * H, 0.34 * r * H, armorDark, seamCol, 1.1, -1.0);
      // Main Tracked Hull
      pushBox3D(hullFaces, hullProj, -1.04 * r * L, 1.04 * r * L, -0.78 * r * W, 0.78 * r * W, 0.16 * r * H, 0.48 * r * H, armorBase, seamCol, 1.18, 0, 0.14 * r * L, 0.06 * r * W);
      // Front Glacis Circular Crew Hatch & Louver Grille
      hullFaces.push({
        depth: hullProj.project(0.72 * r * L, 0, 0.48 * r * H).depth + 0.40,
        customDraw(c) {
          const hPt = hullProj.project(0.68 * r * L, 0.24 * r * W, 0.48 * r * H);
          c.fillStyle = armorHi;
          c.strokeStyle = seamCol;
          c.lineWidth = 1.1;
          c.beginPath();
          c.arc(hPt.x, hPt.y, Math.max(2.5, 0.16 * r), 0, Math.PI * 2);
          c.fill();
          c.stroke();

          const grille = [
            hullProj.project(0.54 * r * L, -0.52 * r * W, 0.48 * r * H),
            hullProj.project(0.54 * r * L, -0.06 * r * W, 0.48 * r * H),
            hullProj.project(0.84 * r * L, -0.06 * r * W, 0.44 * r * H),
            hullProj.project(0.84 * r * L, -0.52 * r * W, 0.44 * r * H)
          ];
          drawPolyPts(c, grille, armorDark, seamCol, 0.95);
        }
      });
    }
    flushFaces(ctx, hullFaces);

    const turProj = createProjector(turretAngle, pitchScale, zScale, (isNuke ? -0.28 : -0.16) * r * L, 0, 0, hullAngle);
    const turFaces = [];
    const zBase = (isNuke ? 0.42 : 0.48) * r * H;
    const recDist = clamp(recoil * 0.05 * r, 0, 0.28 * r);
    const elev = p.gunElevation || (isNuke ? 0.48 : 0.44);

    if (isNuke) {
      // ======================================================================
      // CHINA NUKE CANNON ORDNANCE: Angled Trunnion A-Frame Cheek Supports,
      // Massive Bulbous Conical Olive Breech Housing with Yellow Warning Band,
      // Radiation Trefoil Badge (☢), Dorsal Fin & Long Heavy Nuclear Barrel!
      // (Matches assets/refs/china_nuke_cannon_diorama_ref.png!)
      // ======================================================================
      // Twin A-frame trunnion cheek supports
      for (const side of [-1, 1]) {
        pushBox3D(turFaces, turProj, -0.38 * r, 0.24 * r, side * 0.34 * r * W, side * 0.52 * r * W, zBase, zBase + 0.56 * r * H, armorDark, seamCol, 1.15, 0.95, 0.10 * r, 0.02 * r);
      }
      // Massive Bulbous Conical Olive-Green Breech Shroud Housing
      const zPivot = zBase + 0.48 * r * H;
      pushTubeSegment3D(turFaces, turProj, -0.54 * r - recDist * 0.6, 0, zPivot - 0.18 * r, elev, 0, 0.92 * r * BL, 0.36 * r, 0.24 * r, armorBase, seamCol, 1.22, 1.25);
      // Yellow Circumferential Warning Band at front of conical breech shroud
      pushTubeSegment3D(turFaces, turProj, (-0.54 + 0.78 * BL * Math.cos(elev)) * r - recDist * 0.6, 0, zPivot - 0.18 * r + 0.78 * BL * Math.sin(elev) * r, elev, 0, 0.16 * r * BL, 0.25 * r, 0.23 * r, '#eab308', seamCol, 1.15, 1.32);
      // Dorsal Recoil Recuperator Fin on top of conical breech housing
      pushTubeSegment3D(turFaces, turProj, -0.32 * r - recDist * 0.6, 0, zPivot + 0.14 * r, elev, 0, 0.68 * r * BL, 0.12 * r, 0.09 * r, armorHi, seamCol, 1.1, 1.38);

      // Circular Yellow Radiation Trefoil Emblem (☢) on side of conical breech housing!
      turFaces.push({
        depth: turProj.project(-0.10 * r, 0.36 * r, zPivot).depth + 1.45,
        customDraw(c) {
          for (const side of [-1, 1]) {
            const radPt = turProj.project(-0.12 * r - recDist * 0.6, side * 0.32 * r, zPivot + 0.02 * r);
            const badgeR = Math.max(3.2, 0.16 * r);
            c.fillStyle = '#facc15';
            c.strokeStyle = seamCol;
            c.lineWidth = 1.1;
            c.beginPath();
            c.arc(radPt.x, radPt.y, badgeR, 0, Math.PI * 2);
            c.fill();
            c.stroke();
            // 3 black radiation trefoil sectors
            c.fillStyle = '#1c1917';
            for (let s = 0; s < 3; s++) {
              const a0 = s * (Math.PI * 2 / 3) - Math.PI * 0.5;
              c.beginPath();
              c.moveTo(radPt.x, radPt.y);
              c.arc(radPt.x, radPt.y, badgeR * 0.78, a0 - 0.35, a0 + 0.35);
              c.closePath();
              c.fill();
            }
          }
        }
      });

      // Long Heavy Nuclear Siege Barrel + Mid-Collar + Perforated Muzzle Brake
      const bStartX = (-0.54 + 0.88 * BL * Math.cos(elev)) * r - recDist;
      const bStartZ = zPivot - 0.18 * r + 0.88 * BL * Math.sin(elev) * r;
      pushTubeSegment3D(turFaces, turProj, bStartX, 0, bStartZ, elev, 0, 1.56 * r * BL, 0.135 * r, 0.115 * r, '#64748b', seamCol, 1.2, 1.55);
      // Mid-barrel reinforcement sleeve
      pushTubeSegment3D(turFaces, turProj, bStartX + 0.52 * BL * Math.cos(elev) * r, 0, bStartZ + 0.52 * BL * Math.sin(elev) * r, elev, 0, 0.26 * r * BL, 0.165 * r, 0.160 * r, armorDark, seamCol, 1.12, 1.62);
      // Heavy Perforated Muzzle Brake at tip
      pushTubeSegment3D(turFaces, turProj, bStartX + 1.40 * BL * Math.cos(elev) * r, 0, bStartZ + 1.40 * BL * Math.sin(elev) * r, elev, 0, 0.24 * r * BL, 0.175 * r, 0.175 * r, '#334155', seamCol, 1.18, 1.70);
    } else {
      // ======================================================================
      // CHINA INFERNO CANNON ORDNANCE: Tall Open-Top Twin-Cheek Armored Trunnion
      // Pedestal, Circular Pivot Bearings, Dorsal Recuperator & Stepped Howitzer!
      // (Matches assets/refs/china_inferno_cannon_diorama_ref.png!)
      // ======================================================================
      // Tall open-top twin-cheek gun mount walls
      for (const side of [-1, 1]) {
        pushBox3D(turFaces, turProj, -0.44 * r, 0.32 * r, side * 0.26 * r * W, side * 0.44 * r * W, zBase, zBase + 0.56 * r * H, armorHi, seamCol, 1.18, 1.0, 0.08 * r, 0.02 * r);
      }
      // Rear Breech Block between cheek walls
      const zPivot = zBase + 0.42 * r * H;
      pushBox3D(turFaces, turProj, -0.58 * r - recDist, 0.16 * r - recDist, -0.26 * r * W, 0.26 * r * W, zBase + 0.16 * r * H, zBase + 0.54 * r * H, armorDark, seamCol, 1.15, 1.15);

      // Circular Trunnion Pivot Bearings on outer cheek walls
      turFaces.push({
        depth: turProj.project(-0.04 * r, 0.44 * r * W, zPivot).depth + 1.22,
        customDraw(c) {
          for (const side of [-1, 1]) {
            const pPt = turProj.project(-0.04 * r, side * 0.45 * r * W, zPivot);
            c.fillStyle = armorDark;
            c.strokeStyle = seamCol;
            c.lineWidth = 1.15;
            c.beginPath();
            c.arc(pPt.x, pPt.y, Math.max(2.6, 0.14 * r), 0, Math.PI * 2);
            c.fill();
            c.stroke();
          }
        }
      });

      // Dorsal Hydropneumatic Recuperator Cylinder above breech + Stepped Recoil Sleeve + Main Barrel + Muzzle Collar
      pushTubeSegment3D(turFaces, turProj, -0.22 * r - recDist, 0, zPivot + 0.16 * r, elev, 0, 0.56 * r * BL, 0.11 * r, 0.095 * r, armorDark, seamCol, 1.1, 1.38);
      pushTubeSegment3D(turFaces, turProj, -0.18 * r - recDist, 0, zPivot, elev, 0, 0.54 * r * BL, 0.185 * r, 0.155 * r, armorHi, seamCol, 1.18, 1.35);
      pushTubeSegment3D(turFaces, turProj,  0.14 * r - recDist, 0, zPivot + 0.14 * r, elev, 0, 1.24 * r * BL, 0.115 * r, 0.105 * r, armorBase, seamCol, 1.2, 1.55);
      // Thick Muzzle Collar Ring
      pushTubeSegment3D(
        turFaces,
        turProj,
        (0.14 + 1.08 * BL * Math.cos(elev)) * r - recDist,
        0,
        zPivot + (0.14 + 1.08 * BL * Math.sin(elev)) * r,
        elev,
        0,
        0.20 * r * BL,
        0.145 * r,
        0.145 * r,
        armorDark,
        seamCol,
        1.15,
        1.65
      );
    }
    flushFaces(ctx, turFaces);
  }

  function renderChinaWheeledModel(ctx, u, faction, customParams, options) {
    const p = Object.assign({
      hullScale: 1.0, hullLength: 1.0, hullWidth: 1.0, extrusionDepth: 1.0,
      cargoScale: 1.0, antennaScale: 1.0,
      armorBaseColor: '#6e7b4f', armorHighlightColor: '#879663', armorShadowColor: '#4a5434', houseColor: '#dc2626'
    }, customParams || {});
    const opts = options || {};
    const defId = String((u && u.defId) || 'CHINA_TROOP_CRAWLER');
    const isSupplyTruck = defId === 'CHINA_SUPPLY_TRUCK';
    const rawR = (u && u.radius) || 17;
    const r = rawR * (p.hullScale || 1.0);
    const L = p.hullLength || 1.0, W = p.hullWidth || 1.0, H = p.extrusionDepth || 1.0;

    const hullAngle = (u && u.angle !== undefined) ? u.angle : 0;
    const turretAngle = (u && u.turretAngle !== undefined) ? u.turretAngle : hullAngle;
    const treadPhase = (u && u.treadPhase) || 0;
    const pitchScale = opts.pitchScale !== undefined ? opts.pitchScale : 1.0;
    const zScale = opts.zScale !== undefined ? opts.zScale : 0.42;

    const armorBase = p.armorBaseColor || '#6e7b4f';
    const armorHi   = p.armorHighlightColor || '#879663';
    const armorDark = p.armorShadowColor || '#4a5434';
    const crimson   = p.houseColor || '#dc2626';
    const seamCol   = '#241f1a';

    const hullProj = createProjector(hullAngle, pitchScale, zScale, 0, 0, 0, 0);
    const shadowPts = [
      hullProj.project(-1.16 * r * L, -0.84 * r * W, 0),
      hullProj.project( 1.16 * r * L, -0.84 * r * W, 0),
      hullProj.project( 1.16 * r * L,  0.84 * r * W, 0),
      hullProj.project(-1.16 * r * L,  0.84 * r * W, 0)
    ].map((pt) => ({ x: pt.x + 3.0, y: pt.y + 4.0 }));
    drawPolyPts(ctx, shadowPts, 'rgba(60, 48, 36, 0.35)', null, 0);

    const faces = [];
    // CHINA_SUPPLY_TRUCK has 3 axles (6x6: 1 front steering axle, 2 rear tandem axles) matching china_supply_truck_diorama_ref.png!
    const axles = defId.includes('CRAWLER')
      ? [-0.78, -0.26, 0.26, 0.78]
      : isSupplyTruck
        ? [-0.78, -0.34, 0.68]
        : [-0.66, 0.68];
    for (const ax of axles) {
      pushWheelAxle3D(faces, hullProj, ax * r * L, 0.64 * r * W, 0.30 * r, 0.22 * r * W, '#262320', armorDark, seamCol, treadPhase, -1.5);
    }

    if (isSupplyTruck) {
      // ======================================================================
      // CHINA SUPPLY TRUCK: 6x6 Olive-Green Military Cargo Truck with Short
      // Nose Hood, Radiator Grille & Headlights, Split 2-Pane Blue Windshield,
      // Side Fuel Tank, Olive Drop-Side Bed & Arched Khaki-Tan Canvas Tarp!
      // (Matches assets/refs/china_supply_truck_diorama_ref.png!)
      // ======================================================================
      const CS = p.cargoScale || 1.0;
      // Chassis frame & front bumper
      pushBox3D(faces, hullProj, -1.08 * r * L, 1.08 * r * L, -0.66 * r * W, 0.66 * r * W, 0.18 * r * H, 0.38 * r * H, armorDark, seamCol, 1.12, 0);
      // Side cylindrical diesel fuel tank between front & rear tandem wheels
      for (const side of [-1, 1]) {
        pushBox3D(faces, hullProj, 0.02 * r * L, 0.34 * r * L, side * 0.52 * r * W, side * 0.72 * r * W, 0.20 * r * H, 0.38 * r * H, '#475569', seamCol, 1.0, 0.12);
      }
      // Forward Engine Nose Hood (x: 0.66..1.08)
      pushBox3D(faces, hullProj, 0.64 * r * L, 1.08 * r * L, -0.60 * r * W, 0.60 * r * W, 0.38 * r * H, 0.68 * r * H, armorHi, seamCol, 1.15, 0.30, 0.06 * r * L, 0.04 * r * W);
      // Olive Driver Cab (x: 0.22..0.66)
      pushBox3D(faces, hullProj, 0.20 * r * L, 0.66 * r * L, -0.64 * r * W, 0.64 * r * W, 0.38 * r * H, 0.96 * r * H, armorBase, seamCol, 1.18, 0.42, 0.06 * r * L, 0.04 * r * W);

      // Front Radiator Grille, Twin Headlights, Split 2-Pane Blue Windshield & Side Windows
      faces.push({
        depth: hullProj.project(0.82 * r * L, 0, 0.72 * r * H).depth + 0.65,
        customDraw(c) {
          // Dark front radiator grille
          const grille = [
            hullProj.project(1.09 * r * L, -0.34 * r * W, 0.40 * r * H),
            hullProj.project(1.09 * r * L,  0.34 * r * W, 0.40 * r * H),
            hullProj.project(1.09 * r * L,  0.34 * r * W, 0.64 * r * H),
            hullProj.project(1.09 * r * L, -0.34 * r * W, 0.64 * r * H)
          ];
          drawPolyPts(c, grille, '#1e293b', seamCol, 1.0);
          // Twin circular yellow headlights
          for (const side of [-1, 1]) {
            const hlPt = hullProj.project(1.09 * r * L, side * 0.46 * r * W, 0.50 * r * H);
            c.fillStyle = '#fef08a';
            c.strokeStyle = seamCol;
            c.lineWidth = 0.95;
            c.beginPath();
            c.arc(hlPt.x, hlPt.y, Math.max(1.6, 0.075 * r), 0, Math.PI * 2);
            c.fill();
            c.stroke();
          }
          // Split 2-Pane Blue Front Windshield
          for (const side of [-1, 1]) {
            const y0 = side > 0 ? 0.04 * r * W : -0.56 * r * W;
            const y1 = side > 0 ? 0.56 * r * W : -0.04 * r * W;
            const wPane = [
              [0.66 * r * L, y0, 0.68 * r * H],
              [0.66 * r * L, y1, 0.68 * r * H],
              [0.61 * r * L, y1 * 0.94, 0.91 * r * H],
              [0.61 * r * L, y0 * 0.94, 0.91 * r * H]
            ];
            drawGlassPane3D(c, hullProj, wPane, '#7dd3fc', seamCol, 1.0);
          }
          // Side cab door windows
          for (const side of [-1, 1]) {
            const sy = side * 0.645 * r * W;
            const sWin = [
              [0.28 * r * L, sy, 0.66 * r * H],
              [0.58 * r * L, sy, 0.66 * r * H],
              [0.55 * r * L, sy * 0.95, 0.90 * r * H],
              [0.28 * r * L, sy * 0.95, 0.90 * r * H]
            ];
            drawGlassPane3D(c, hullProj, sWin, '#7dd3fc', seamCol, 0.95);
          }
        }
      });

      // Olive Drop-Side Cargo Bed Walls (x: -1.08..0.18, z: 0.38..0.64)
      pushBox3D(faces, hullProj, -1.08 * r * L, 0.18 * r * L, -0.72 * r * W, 0.72 * r * W, 0.38 * r * H, 0.64 * r * H, armorBase, seamCol, 1.15, 0.50);
      // Tall Arched Khaki-Tan Canvas Tarpaulin Cover with Rib Seams (matching china_supply_truck_diorama_ref.png!)
      const zTarpTop = 1.18 * r * H * CS;
      pushBox3D(faces, hullProj, -1.06 * r * L, 0.16 * r * L, -0.70 * r * W, 0.70 * r * W, 0.64 * r * H, zTarpTop, '#a69776', seamCol, 1.18, 0.62, 0.04 * r * L, 0.14 * r * W);
      faces.push({
        depth: hullProj.project(-0.45 * r * L, 0, zTarpTop).depth + 0.78,
        customDraw(c) {
          // 4 Canvas Hoop Rib Seams across the khaki tarpaulin cover
          for (const rx of [-0.82, -0.52, -0.22, 0.04]) {
            drawLine3D(c, hullProj, rx * r * L, -0.70 * r * W, 0.64 * r * H, rx * r * L, -0.56 * r * W, zTarpTop, seamCol, 1.0);
            drawLine3D(c, hullProj, rx * r * L, -0.56 * r * W, zTarpTop, rx * r * L,  0.56 * r * W, zTarpTop, seamCol, 1.0);
            drawLine3D(c, hullProj, rx * r * L,  0.56 * r * W, zTarpTop, rx * r * L,  0.70 * r * W, 0.64 * r * H, seamCol, 1.0);
          }
        }
      });
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
      armorBaseColor: '#6e7b4f', armorHighlightColor: '#879663', armorShadowColor: '#4a5434', houseColor: '#dc2626'
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

    const armorBase = p.armorBaseColor || '#6e7b4f';
    const armorHi   = p.armorHighlightColor || '#879663';
    const armorDark = p.armorShadowColor || '#4a5434';
    const crimson   = p.houseColor || '#dc2626';
    const seamCol   = '#241f1a';

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
    // 2. Main Heavy Gunship Fuselage, Stepped Blue Glass Cockpit & Stub Wings
    pushBox3D(faces, proj, -0.82 * r * L, 0.98 * r * L, -0.64 * r * W, 0.64 * r * W, zAir + 0.02 * r * H, zAir + 0.56 * r * H, armorBase, seamCol, 1.2, 0.2, 0.18 * r * L, 0.08 * r * W);
    pushBox3D(faces, proj,  0.42 * r * L, 0.94 * r * L, -0.44 * r * W, 0.44 * r * W, zAir + 0.26 * r * H, zAir + 0.54 * r * H, '#38bdf8', seamCol, 1.1, 0.48, 0.12 * r * L, 0.06 * r * W);
    pushBox3D(faces, proj, -0.24 * r * L, 0.32 * r * L, -1.24 * r * W, 1.24 * r * W, zAir + 0.18 * r * H, zAir + 0.32 * r * H, armorHi, seamCol, 1.1, 0.35);
    // Twin Turbine Engine Nacelles on Roof
    for (const side of [-1, 1]) {
      pushBox3D(faces, proj, -0.44 * r * L, 0.34 * r * L, side * 0.20 * r * W, side * 0.48 * r * W, zAir + 0.54 * r * H, zAir + 0.72 * r * H, armorDark, seamCol, 1.05, 0.52);
    }
    // Tail Boom & Twin Fins with Crimson PLA Trim
    pushBox3D(faces, proj, -1.48 * r * L, -0.78 * r * L, -0.24 * r * W, 0.24 * r * W, zAir + 0.20 * r * H, zAir + 0.46 * r * H, armorHi, seamCol, 1.15, 0.4);
    for (const side of [-1, 1]) {
      pushBox3D(faces, proj, -1.48 * r * L, -1.16 * r * L, side * 0.24 * r * W, side * 0.34 * r * W, zAir + 0.26 * r * H, zAir + 0.72 * r * H, crimson, seamCol, 1.05, 0.65);
    }
    if (p.ShowChinGun !== false) {
      pushTubeSegment3D(faces, proj, 0.88 * r * L, 0, zAir + 0.08 * r * H, -0.06, 0, 0.48 * r, 0.08 * r, 0.065 * r, '#334155', seamCol, 1.05, 0.75);
    }

    // 3. Coaxial Counter-Rotating Mast & Dual 4-Blade Rotors
    pushCylinderZ3D(faces, proj, 0.08 * r * L, 0, zAir + 0.56 * r * H, zAir + 1.02 * r * H, 0.16 * r, 0.12 * r, 8, '#334155', seamCol, 1.1, 1.1);
    flushFaces(ctx, faces);

    for (const [zOff, dir] of [[0.80, 1], [0.98, -1]]) {
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
      armorBaseColor: '#94a3b8', armorHighlightColor: '#cbd5e1', armorShadowColor: '#475569', houseColor: '#dc2626'
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

    const armorBase = isNuke ? '#6e7b4f' : (p.armorBaseColor || '#94a3b8');
    const armorHi   = isNuke ? '#879663' : (p.armorHighlightColor || '#cbd5e1');
    const armorDark = isNuke ? '#4a5434' : (p.armorShadowColor || '#475569');
    const crimson   = isNuke ? '#84cc16' : (p.houseColor || '#dc2626');
    const seamCol   = '#1e293b';

    const proj = createProjector(hullAngle, pitchScale, zScale, 0, 0, 0, 0);
    const shadowPts = [
      proj.project(-1.08 * r * L, -1.28 * r * W, 0),
      proj.project( 1.42 * r * L, 0, 0),
      proj.project(-1.08 * r * L,  1.28 * r * W, 0)
    ].map((pt) => ({ x: pt.x + 5.0, y: pt.y + 7.0 }));
    drawPolyPts(ctx, shadowPts, 'rgba(35, 42, 52, 0.30)', null, 0);

    const faces = [];
    const zAir = 0.32 * r * H + hoverZ;

    // 0. Tricycle Landing Gear & 4 Underwing White/Grey Missiles (matching china_mig_diorama_ref.png!)
    for (const [gx, gy] of [[0.68 * r * L, 0], [-0.42 * r * L, -0.38 * r * W], [-0.42 * r * L, 0.38 * r * W]]) {
      faces.push({
        depth: proj.project(gx, gy, zAir - 0.14 * r * H).depth - 0.25,
        customDraw(c) {
          drawLine3D(c, proj, gx, gy, zAir, gx, gy, zAir - 0.18 * r * H, '#64748b', 1.6);
          const wPt = proj.project(gx, gy, zAir - 0.20 * r * H);
          c.fillStyle = '#0f172a';
          c.strokeStyle = seamCol;
          c.lineWidth = 1.0;
          c.beginPath();
          c.arc(wPt.x, wPt.y, Math.max(2.0, 0.095 * r), 0, Math.PI * 2);
          c.fill();
          c.stroke();
        }
      });
    }

    if (p.ShowNapalmPods !== false) {
      for (const side of [-1, 1]) {
        for (const myOff of [0.54, 0.86]) {
          const my = side * myOff * r * W;
          pushTubeSegment3D(faces, proj, -0.62 * r * L, my, zAir - 0.06 * r * H, 0, 0, 0.74 * r * L, 0.068 * r, 0.060 * r, '#f8fafc', seamCol, 1.0, 0.08);
          pushTubeSegment3D(faces, proj,  0.08 * r * L, my, zAir - 0.06 * r * H, 0, 0, 0.16 * r * L, 0.060 * r, 0.020 * r, crimson, seamCol, 0.95, 0.10);
        }
      }
    }

    // 1. Wide Cropped Delta Wings + Forward Swept Canards
    const wingBot = [
      [-0.94 * r * L, -0.34 * r * W, zAir],
      [-0.86 * r * L, -1.32 * r * W, zAir],
      [-0.58 * r * L, -1.32 * r * W, zAir],
      [ 0.26 * r * L, -0.34 * r * W, zAir],
      [ 1.38 * r * L,  0,            zAir],
      [ 0.26 * r * L,  0.34 * r * W, zAir],
      [-0.58 * r * L,  1.32 * r * W, zAir],
      [-0.86 * r * L,  1.32 * r * W, zAir],
      [-0.94 * r * L,  0.34 * r * W, zAir]
    ];
    const wingTop = wingBot.map((pt) => [pt[0], pt[1], zAir + 0.10 * r * H]);
    pushFrustumFaces(faces, proj, wingBot, wingTop, armorBase, seamCol, 1.18, 0.22);

    // Forward Swept Canards (matching MiG-1.44 silhouette in china_mig_diorama_ref.png!)
    const CS = p.canardScale || 1.0;
    for (const side of [-1, 1]) {
      const canBot = [
        [0.30 * r * L, side * 0.24 * r * W, zAir + 0.10 * r * H],
        [0.24 * r * L, side * 0.66 * r * W * CS, zAir + 0.10 * r * H],
        [0.44 * r * L, side * 0.56 * r * W * CS, zAir + 0.10 * r * H],
        [0.68 * r * L, side * 0.22 * r * W, zAir + 0.10 * r * H]
      ];
      const canTop = canBot.map((pt) => [pt[0], pt[1], zAir + 0.15 * r * H]);
      pushFrustumFaces(faces, proj, canBot, canTop, armorHi, seamCol, 1.1, 0.35);
    }

    // 2. Central Supersonic Fuselage Spine, Twin Dorsal Engine Nacelles & Dark Gunmetal Vectoring Nozzles
    pushBox3D(faces, proj, -1.02 * r * L, 0.92 * r * L, -0.28 * r * W, 0.28 * r * W, zAir + 0.10 * r * H, zAir + 0.36 * r * H, armorHi, seamCol, 1.18, 0.52, 0.26 * r * L, 0.06 * r * W);
    // Pointed Dark Charcoal Radome Nose Cone & Pitot Sting
    pushTubeSegment3D(faces, proj, 0.86 * r * L, 0, zAir + 0.18 * r * H, -0.04, 0, 0.56 * r * L, 0.18 * r, 0.025 * r, '#334155', seamCol, 1.15, 0.62);

    // Twin Engine Nacelles & Dark Gunmetal Afterburner Nozzles
    for (const side of [-1, 1]) {
      pushBox3D(faces, proj, -1.04 * r * L, -0.18 * r * L, side * 0.04 * r * W, side * 0.28 * r * W, zAir + 0.12 * r * H, zAir + 0.34 * r * H, armorBase, seamCol, 1.1, 0.56);
      pushTubeSegment3D(faces, proj, -1.24 * r * L, side * 0.16 * r * W, zAir + 0.20 * r * H, 0, 0, 0.24 * r * L, 0.115 * r, 0.135 * r, '#1e293b', seamCol, 1.15, 0.48);
    }

    // 3. Blue Bubble Canopy, PLA Red Star Wing Roundels & Twin Outward-Canted Vertical Tail Fins
    pushBox3D(faces, proj, 0.18 * r * L, 0.82 * r * L, -0.17 * r * W, 0.17 * r * W, zAir + 0.34 * r * H, zAir + 0.52 * r * H, '#38bdf8', seamCol, 1.12, 0.78, 0.16 * r * L, 0.05 * r * W);

    faces.push({
      depth: proj.project(-0.42 * r * L, 0, zAir + 0.15 * r * H).depth + 0.42,
      customDraw(c) {
        // Forward Pitot Sting at nose apex
        drawLine3D(c, proj, 1.40 * r * L, 0, zAir + 0.16 * r * H, 1.62 * r * L, 0, zAir + 0.16 * r * H, seamCol, 1.3);
        // PLA Red Star Roundels on upper delta wings (matching china_mig_diorama_ref.png!)
        if (p.ShowFactionEmblem !== false) {
          for (const side of [-1, 1]) {
            const starPt = proj.project(-0.48 * r * L, side * 0.78 * r * W, zAir + 0.11 * r * H);
            c.fillStyle = crimson;
            c.strokeStyle = '#fef08a';
            c.lineWidth = 0.8;
            c.beginPath();
            c.arc(starPt.x, starPt.y, Math.max(2.6, 0.14 * r), 0, Math.PI * 2);
            c.fill();
            c.stroke();
          }
        }
      }
    });

    // Twin Outward-Canted Vertical Tail Fins with Dark Slate Fin-Caps & Red Star Markings
    for (const side of [-1, 1]) {
      const yBase = side * 0.26 * r * W;
      const yTip  = side * 0.44 * r * W;
      const finPts = [
        proj.project(-1.02 * r * L, yBase, zAir + 0.24 * r * H),
        proj.project(-0.44 * r * L, yBase, zAir + 0.28 * r * H),
        proj.project(-0.66 * r * L, yTip,  zAir + 0.80 * r * H),
        proj.project(-1.04 * r * L, yTip,  zAir + 0.78 * r * H)
      ];
      const capPts = [
        proj.project(-1.03 * r * L, yTip * 0.92, zAir + 0.68 * r * H),
        proj.project(-0.62 * r * L, yTip * 0.92, zAir + 0.70 * r * H),
        proj.project(-0.66 * r * L, yTip,        zAir + 0.80 * r * H),
        proj.project(-1.04 * r * L, yTip,        zAir + 0.78 * r * H)
      ];
      faces.push({
        depth: proj.project(-0.78 * r * L, yTip, zAir + 0.56 * r * H).depth + 0.88,
        customDraw(c) {
          drawPolyPts(c, finPts, armorHi, seamCol, 1.15);
          drawPolyPts(c, capPts, armorDark, seamCol, 1.0);
          const fStar = proj.project(-0.80 * r * L, (yBase + yTip) * 0.5, zAir + 0.52 * r * H);
          c.fillStyle = crimson;
          c.beginPath();
          c.arc(fStar.x, fStar.y, Math.max(1.8, 0.085 * r), 0, Math.PI * 2);
          c.fill();
        }
      });
    }

    flushFaces(ctx, faces);
  }

  function renderGlaTankModel(ctx, u, faction, customParams, options) {
    const defId = String((u && u.defId) || 'GLA_SCORPION');
    const isOliveDefault = defId === 'GLA_MARAUDER' || defId === 'GLA_QUAD_CANNON' || defId === 'GLA_TOXIN_TRACTOR';
    const p = Object.assign({
      hullScale: 1.0, hullLength: 1.0, hullWidth: 1.0, extrusionDepth: 1.0,
      turretScale: 1.0, barrelLength: 1.0, ScrapLevel: true, ShowUpgradeKit: true,
      armorBaseColor: isOliveDefault ? '#637349' : '#d6b278',
      armorHighlightColor: isOliveDefault ? '#7a8c5b' : '#e8c992',
      armorShadowColor: isOliveDefault ? '#445032' : '#9c7a44',
      houseColor: '#587838'
    }, customParams || {});
    const opts = options || {};
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

    const baseCol = p.armorBaseColor || (isOliveDefault ? '#637349' : '#d6b278');
    const hiCol   = p.armorHighlightColor || (isOliveDefault ? '#7a8c5b' : '#e8c992');
    const darkCol = p.armorShadowColor || (isOliveDefault ? '#445032' : '#9c7a44');
    const olive   = p.houseColor || '#587838';
    const seamCol = '#241c12';

    const hullProj = createProjector(hullAngle, pitchScale, zScale, 0, 0, 0, 0);
    const shadowPts = [
      hullProj.project(-1.14 * r * L, -0.84 * r * W, 0),
      hullProj.project( 1.14 * r * L, -0.84 * r * W, 0),
      hullProj.project( 1.14 * r * L,  0.84 * r * W, 0),
      hullProj.project(-1.14 * r * L,  0.84 * r * W, 0)
    ].map((pt) => ({ x: pt.x + 3.0, y: pt.y + 4.0 }));
    drawPolyPts(ctx, shadowPts, 'rgba(60, 48, 32, 0.35)', null, 0);

    const hullFaces = [];
    const recDist = clamp(recoil * 0.04 * r, 0, 0.22 * r);

    // =========================================================================
    // CASE A: GLA TOXIN TRACTOR (6-Wheeled Tractor Truck + 3 Glowing Anthrax Vats)
    //         Matches assets/refs/gla_toxin_tractor_diorama_ref.png
    // =========================================================================
    if (defId === 'GLA_TOXIN_TRACTOR') {
      // 3 Axles (6 heavy off-road wheels with olive hubs)
      for (const ax of [-0.78, -0.20, 0.64]) {
        pushWheelAxle3D(hullFaces, hullProj, ax * r * L, 0.64 * r * W, 0.29 * r, 0.22 * r * W, '#242220', darkCol, seamCol, treadPhase, -1.6);
      }
      // Lower flatbed chassis frame
      pushBox3D(hullFaces, hullProj, -1.08 * r * L, 1.04 * r * L, -0.72 * r * W, 0.72 * r * W, 0.16 * r * H, 0.40 * r * H, baseCol, seamCol, 1.15, 0, 0.04 * r * L, 0.03 * r * W);
      // Front wheel fenders (lighter olive-tan trim)
      for (const side of [-1, 1]) {
        pushBox3D(hullFaces, hullProj, 0.42 * r * L, 0.88 * r * L, side * 0.56 * r * W, side * 0.78 * r * W, 0.28 * r * H, 0.44 * r * H, hiCol, seamCol, 1.05, 0.22);
      }
      // Forward armored tractor engine & cab block
      pushBox3D(hullFaces, hullProj, 0.22 * r * L, 1.04 * r * L, -0.58 * r * W, 0.58 * r * W, 0.40 * r * H, 0.82 * r * H, hiCol, seamCol, 1.18, 0.35, 0.06 * r * L, 0.04 * r * W);
      // Front bumper bar & dark radiator grille
      pushBox3D(hullFaces, hullProj, 1.00 * r * L, 1.10 * r * L, -0.68 * r * W, 0.68 * r * W, 0.14 * r * H, 0.28 * r * H, darkCol, seamCol, 1.1, 0.42);
      hullFaces.push({
        depth: hullProj.project(1.05 * r * L, 0, 0.58 * r * H).depth + 0.55,
        customDraw(c) {
          // Dark vertical-slat front radiator grille
          const gQuad = [
            [1.05 * r * L, -0.38 * r * W, 0.42 * r * H],
            [1.05 * r * L,  0.38 * r * W, 0.42 * r * H],
            [1.05 * r * L,  0.36 * r * W, 0.72 * r * H],
            [1.05 * r * L, -0.36 * r * W, 0.72 * r * H]
          ];
          drawGlassPane3D(c, hullProj, gQuad, '#1e293b', seamCol, 1.1);
          // Side cab vision slit
          for (const side of [-1, 1]) {
            const sQuad = [
              [0.36 * r * L, side * 0.59 * r * W, 0.56 * r * H],
              [0.68 * r * L, side * 0.59 * r * W, 0.56 * r * H],
              [0.66 * r * L, side * 0.59 * r * W, 0.72 * r * H],
              [0.38 * r * L, side * 0.59 * r * W, 0.72 * r * H]
            ];
            drawGlassPane3D(c, hullProj, sQuad, '#334155', seamCol, 1.0);
          }
        }
      });

      // Three Tall Vertical Cylindrical Glowing Neon-Green Anthrax Vats on Rear Flatbed
      const vatPositions = [
        [-0.78 * r * L, -0.34 * r * W],
        [-0.78 * r * L,  0.34 * r * W],
        [-0.22 * r * L, -0.34 * r * W]
      ];
      for (let i = 0; i < vatPositions.length; i++) {
        const [vx, vy] = vatPositions[i];
        const dOff = 0.65 + i * 0.08;
        // Bottom metal pedestal ring
        pushCylinderZ3D(hullFaces, hullProj, vx, vy, 0.40 * r * H, 0.48 * r * H, 0.24 * r, 0.24 * r, 10, '#64748b', seamCol, 1.05, dOff);
        // Glowing neon-green glass bio-toxin cylinder
        pushCylinderZ3D(hullFaces, hullProj, vx, vy, 0.48 * r * H, 1.08 * r * H, 0.22 * r, 0.22 * r, 10, '#4ade80', seamCol, 1.15, dOff + 0.05);
        // Stepped grey metal top cap & valve dome
        pushCylinderZ3D(hullFaces, hullProj, vx, vy, 1.08 * r * H, 1.18 * r * H, 0.24 * r, 0.20 * r, 10, '#94a3b8', seamCol, 1.1, dOff + 0.12);
        pushCylinderZ3D(hullFaces, hullProj, vx, vy, 1.18 * r * H, 1.26 * r * H, 0.12 * r, 0.10 * r, 8, '#475569', seamCol, 1.0, dOff + 0.16);
        // Bio-bubbles inside each glowing green vat
        hullFaces.push({
          depth: hullProj.project(vx + 0.12 * r, vy + 0.12 * r, 0.78 * r * H).depth + dOff + 0.09,
          customDraw(c) {
            for (const [bz, br] of [[0.64, 0.045], [0.82, 0.06], [0.95, 0.038]]) {
              const bPt = hullProj.project(vx + 0.08 * r, vy + 0.08 * r, bz * r * H);
              c.fillStyle = '#bbf7d0';
              c.beginPath();
              c.arc(bPt.x, bPt.y, Math.max(1.3, br * r), 0, Math.PI * 2);
              c.fill();
            }
          }
        });
      }
      flushFaces(ctx, hullFaces);

      // Slewing Bio-Toxin Sprayer Nozzle mounted on right-rear deck / cab shoulder
      const turProj = createProjector(turretAngle, pitchScale, zScale, 0.18 * r * L, 0.26 * r * W, 0, hullAngle);
      const turFaces = [];
      pushCylinderZ3D(turFaces, turProj, 0, 0, 0.42 * r * H, 0.78 * r * H, 0.18 * r * TS, 0.15 * r * TS, 8, baseCol, seamCol, 1.1, 1.0);
      pushTubeSegment3D(turFaces, turProj, 0.10 * r * TS, 0, 0.66 * r * H, 0.05, 0, 0.92 * r * BL, 0.085 * r, 0.11 * r, '#4ade80', seamCol, 1.15, 1.45);
      flushFaces(ctx, turFaces);
      return;
    }

    // =========================================================================
    // CASE B: GLA QUAD CANNON (Armored Half-Track + Twin Boxy Quad-AA Pods)
    //         Matches assets/refs/gla_quad_cannon_diorama_ref.png
    // =========================================================================
    if (defId === 'GLA_QUAD_CANNON') {
      // Rear 4-wheel tracked bogie (-1.08*r..0.24*r) + Front steered rubber wheel axle (0.72*r)
      pushTrackedSuspension3D(hullFaces, hullProj, r, -1.08 * r * L, 0.24 * r * L, 0.46 * r * W, 0.78 * r * W, 0.24 * r * H, 4, darkCol, seamCol, treadPhase, true, -2.0);
      pushWheelAxle3D(hullFaces, hullProj, 0.72 * r * L, 0.62 * r * W, 0.28 * r, 0.20 * r * W, '#242220', '#9c9458', seamCol, treadPhase, -1.5);

      // Rear flatbed deck + Front engine hood & armored half-track cab
      pushBox3D(hullFaces, hullProj, -1.08 * r * L, 0.28 * r * L, -0.74 * r * W, 0.74 * r * W, 0.18 * r * H, 0.42 * r * H, baseCol, seamCol, 1.15, 0, 0.04 * r * L, 0.04 * r * W);
      // Warm olive-tan front wheel fenders
      for (const side of [-1, 1]) {
        pushBox3D(hullFaces, hullProj, 0.46 * r * L, 0.98 * r * L, side * 0.52 * r * W, side * 0.78 * r * W, 0.26 * r * H, 0.42 * r * H, '#9c9458', seamCol, 1.08, 0.18);
      }
      // Long front engine hood (x = 0.28*r..1.08*r)
      pushBox3D(hullFaces, hullProj, 0.28 * r * L, 1.08 * r * L, -0.52 * r * W, 0.52 * r * W, 0.20 * r * H, 0.56 * r * H, baseCol, seamCol, 1.15, 0.28, 0.06 * r * L, 0.04 * r * W);
      // Armored enclosed cab behind hood (x = -0.22*r..0.34*r)
      pushBox3D(hullFaces, hullProj, -0.22 * r * L, 0.34 * r * L, -0.60 * r * W, 0.60 * r * W, 0.40 * r * H, 0.80 * r * H, hiCol, seamCol, 1.18, 0.45, 0.08 * r * L, 0.05 * r * W);

      // Split 2-pane blue-grey windshield, side windows, front grille & headlights
      hullFaces.push({
        depth: hullProj.project(0.36 * r * L, 0, 0.62 * r * H).depth + 0.58,
        customDraw(c) {
          for (const side of [-1, 1]) {
            const wQuad = [
              [0.35 * r * L, side * 0.05 * r * W, 0.46 * r * H],
              [0.35 * r * L, side * 0.50 * r * W, 0.46 * r * H],
              [0.27 * r * L, side * 0.46 * r * W, 0.72 * r * H],
              [0.27 * r * L, side * 0.05 * r * W, 0.72 * r * H]
            ];
            drawGlassPane3D(c, hullProj, wQuad, '#64748b', seamCol, 1.05);
          }
          // Front radiator grille & headlights on nose
          const gQuad = [
            [1.09 * r * L, -0.34 * r * W, 0.24 * r * H],
            [1.09 * r * L,  0.34 * r * W, 0.24 * r * H],
            [1.09 * r * L,  0.32 * r * W, 0.50 * r * H],
            [1.09 * r * L, -0.32 * r * W, 0.50 * r * H]
          ];
          drawGlassPane3D(c, hullProj, gQuad, '#334155', seamCol, 1.05);
          for (const side of [-1, 1]) {
            const hl = hullProj.project(1.09 * r * L, side * 0.42 * r * W, 0.40 * r * H);
            c.fillStyle = '#fef3c7';
            c.strokeStyle = seamCol;
            c.lineWidth = 1.0;
            c.beginPath();
            c.arc(hl.x, hl.y, Math.max(1.5, 0.055 * r), 0, Math.PI * 2);
            c.fill();
            c.stroke();
          }
        }
      });
      flushFaces(ctx, hullFaces);

      // Rear-Mounted 360° Slewing Quad-AA Turret (Twin Boxy Olive Weapon Pods + Recessed Copper/Red Quad Muzzles)
      const turProj = createProjector(turretAngle, pitchScale, zScale, -0.58 * r * L, 0, 0, hullAngle);
      const turFaces = [];
      const zTurBot = 0.42 * r * H;
      pushCylinderZ3D(turFaces, turProj, 0, 0, zTurBot, zTurBot + 0.16 * r * H, 0.34 * r * TS, 0.30 * r * TS, 10, darkCol, seamCol, 1.1, 0.9);
      // Central trunnion pillar
      pushBox3D(turFaces, turProj, -0.26 * r * TS, 0.18 * r * TS, -0.14 * r * TS, 0.14 * r * TS, zTurBot + 0.14 * r * H, zTurBot + 0.62 * r * H, baseCol, seamCol, 1.12, 1.05);
      // Twin Large Boxy Rectangular Weapon Pods (left & right of trunnion)
      for (const side of [-1, 1]) {
        const py0 = side < 0 ? -0.50 * r * TS : 0.14 * r * TS;
        const py1 = side < 0 ? -0.14 * r * TS : 0.50 * r * TS;
        pushBox3D(turFaces, turProj, -0.44 * r * TS - recDist * 0.5, 0.42 * r * TS - recDist * 0.5, py0, py1, zTurBot + 0.18 * r * H, zTurBot + 0.68 * r * H, hiCol, seamCol, 1.18, 1.2, 0.03 * r, 0.02 * r);
        // Recessed copper-red front muzzle plate on each pod
        turFaces.push({
          depth: turProj.project(0.43 * r * TS - recDist * 0.5, (py0 + py1) * 0.5, zTurBot + 0.43 * r * H).depth + 1.32,
          customDraw(c) {
            const mQuad = [
              [0.43 * r * TS - recDist * 0.5, py0 + 0.04 * r * TS, zTurBot + 0.24 * r * H],
              [0.43 * r * TS - recDist * 0.5, py1 - 0.04 * r * TS, zTurBot + 0.24 * r * H],
              [0.43 * r * TS - recDist * 0.5, py1 - 0.04 * r * TS, zTurBot + 0.62 * r * H],
              [0.43 * r * TS - recDist * 0.5, py0 + 0.04 * r * TS, zTurBot + 0.62 * r * H]
            ];
            drawGlassPane3D(c, turProj, mQuad, '#9a3412', seamCol, 1.05);
          }
        });
        // 4 Dual-Tier AA Barrels protruding from the two pods
        for (const sz of [zTurBot + 0.30 * r * H, zTurBot + 0.52 * r * H]) {
          pushTubeSegment3D(turFaces, turProj, 0.38 * r * TS - recDist, (py0 + py1) * 0.5, sz, 0.10, 0, 0.52 * r * BL, 0.048 * r, 0.042 * r, '#334155', seamCol, 1.0, 1.48);
        }
      }
      flushFaces(ctx, turFaces);
      return;
    }

    // =========================================================================
    // CASE C: GLA SCORPION LIGHT TANK & GLA MARAUDER HEAVY TANK
    //         Matches assets/refs/gla_scorpion_diorama_ref.png & gla_marauder_diorama_ref.png
    // =========================================================================
    const isMarauder = defId === 'GLA_MARAUDER';
    const numWheels = isMarauder ? 6 : 5;
    pushTrackedSuspension3D(hullFaces, hullProj, r, -1.06 * r * L, 1.06 * r * L, 0.48 * r * W, 0.82 * r * W, 0.25 * r * H, numWheels, darkCol, seamCol, treadPhase, true, -2.0);

    // Lower armored hull & side skirts
    pushBox3D(hullFaces, hullProj, -1.04 * r * L, 1.06 * r * L, -0.78 * r * W, 0.78 * r * W, 0.16 * r * H, 0.46 * r * H, baseCol, seamCol, 1.18, 0, 0.12 * r * L, 0.05 * r * W);
    // Upper sloped glacis & engine deck
    pushBox3D(hullFaces, hullProj, -0.96 * r * L, 0.92 * r * L, -0.68 * r * W, 0.68 * r * W, 0.44 * r * H, 0.54 * r * H, hiCol, seamCol, 1.12, 0.25, 0.08 * r * L, 0.04 * r * W);

    // Front glacis details: driver hatch, headlights, tow shackles, side skirt seams & Scorpion '6' numeral
    hullFaces.push({
      depth: hullProj.project(0.96 * r * L, 0, 0.44 * r * H).depth + 0.42,
      customDraw(c) {
        // Side skirt vertical armor panel seams
        for (const sx of [-0.55, -0.10, 0.35, 0.75]) {
          drawLine3D(c, hullProj, sx * r * L, 0.79 * r * W, 0.18 * r * H, sx * r * L, 0.79 * r * W, 0.44 * r * H, seamCol, 1.0);
        }
        // Front driver viewport / hatch on glacis
        const dQuad = [
          [0.64 * r * L, -0.26 * r * W, 0.48 * r * H],
          [0.64 * r * L,  0.12 * r * W, 0.48 * r * H],
          [0.86 * r * L,  0.10 * r * W, 0.42 * r * H],
          [0.86 * r * L, -0.24 * r * W, 0.42 * r * H]
        ];
        drawGlassPane3D(c, hullProj, dQuad, darkCol, seamCol, 1.05);
        // Front headlights
        for (const side of [-1, 1]) {
          const hl = hullProj.project(0.98 * r * L, side * 0.56 * r * W, 0.40 * r * H);
          c.fillStyle = '#fef3c7';
          c.strokeStyle = seamCol;
          c.lineWidth = 1.0;
          c.beginPath();
          c.arc(hl.x, hl.y, Math.max(1.5, 0.055 * r), 0, Math.PI * 2);
          c.fill();
          c.stroke();
        }
        // Scorpion front-right fender '6' tactical stencil marking
        if (!isMarauder) {
          const numPt = hullProj.project(0.84 * r * L, 0.44 * r * W, 0.46 * r * H);
          c.fillStyle = seamCol;
          c.font = `bold ${Math.max(7, Math.round(r * 0.34))}px sans-serif`;
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText('6', numPt.x, numPt.y);
        }
      }
    });
    flushFaces(ctx, hullFaces);

    const turProj = createProjector(turretAngle, pitchScale, zScale, (isMarauder ? -0.04 : -0.02) * r * L, 0, 0, hullAngle);
    const turFaces = [];
    const zTurBot = 0.52 * r * H;
    const zTurTop = (isMarauder ? 0.88 : 0.84) * r * H;

    if (isMarauder) {
      // Heavy Welded Olive Casemate/Turret + Commander Cupola + Loader Hatch + Whip Antenna + Twin Heavy Barrels
      pushBox3D(turFaces, turProj, -0.58 * r * TS, 0.52 * r * TS, -0.58 * r * TS, 0.58 * r * TS, zTurBot, zTurTop, hiCol, seamCol, 1.2, 1.0, 0.12 * r * TS, 0.08 * r * TS);
      // Wide armored front gun mantlet
      pushBox3D(turFaces, turProj, 0.42 * r * TS, 0.62 * r * TS, -0.38 * r * TS, 0.38 * r * TS, zTurBot + 0.06 * r * H, zTurTop - 0.04 * r * H, baseCol, seamCol, 1.15, 1.15);
      // Raised commander cupola & optics block on turret roof
      pushBox3D(turFaces, turProj, -0.34 * r * TS, 0.08 * r * TS, -0.38 * r * TS, -0.04 * r * TS, zTurTop, zTurTop + 0.16 * r * H, baseCol, seamCol, 1.12, 1.28);
      // Circular loader hatch on right turret roof
      pushCylinderZ3D(turFaces, turProj, -0.14 * r * TS, 0.24 * r * TS, zTurTop, zTurTop + 0.08 * r * H, 0.16 * r * TS, 0.15 * r * TS, 8, baseCol, seamCol, 1.08, 1.30);
      // Twin parallel heavy olive cannon barrels with bore evacuators & muzzle collars
      const bSides = p.ScrapLevel !== false ? [-0.20 * r * TS, 0.20 * r * TS] : [0];
      for (const by of bSides) {
        const zB = (zTurBot + zTurTop) * 0.52;
        pushTubeSegment3D(turFaces, turProj, 0.52 * r * TS - recDist, by, zB, 0.03, 0, 1.18 * r * BL, 0.095 * r, 0.084 * r, baseCol, seamCol, 1.18, 1.45);
        pushTubeSegment3D(turFaces, turProj, 0.92 * r * TS - recDist, by, zB + 0.01 * r, 0.03, 0, 0.26 * r * BL, 0.115 * r, 0.112 * r, hiCol, seamCol, 1.12, 1.50);
      }
      // Rear vertical whip antenna
      turFaces.push({
        depth: turProj.project(-0.52 * r * TS, -0.44 * r * TS, zTurTop).depth + 1.55,
        customDraw(c) {
          drawLine3D(c, turProj, -0.52 * r * TS, -0.44 * r * TS, zTurTop, -0.58 * r * TS, -0.44 * r * TS, zTurTop + 0.68 * r * H, seamCol, 1.4);
        }
      });
    } else {
      // Scorpion Light Tank: Faceted Octagonal Desert-Tan Turret + Twin Roof Hatches + Whip Antenna + 90mm Cannon + Optional Scorpion Rocket
      pushBox3D(turFaces, turProj, -0.50 * r * TS, 0.46 * r * TS, -0.48 * r * TS, 0.48 * r * TS, zTurBot, zTurTop, hiCol, seamCol, 1.18, 1.0, 0.12 * r * TS, 0.08 * r * TS);
      // Sloped front mantlet collar
      pushBox3D(turFaces, turProj, 0.38 * r * TS, 0.56 * r * TS, -0.22 * r * TS, 0.22 * r * TS, zTurBot + 0.05 * r * H, zTurTop - 0.05 * r * H, baseCol, seamCol, 1.12, 1.15);
      // Twin circular commander & gunner roof hatches (matching gla_scorpion_diorama_ref.png!)
      for (const hy of [-0.18 * r * TS, 0.18 * r * TS]) {
        pushCylinderZ3D(turFaces, turProj, -0.10 * r * TS, hy, zTurTop, zTurTop + 0.08 * r * H, 0.14 * r * TS, 0.13 * r * TS, 8, baseCol, seamCol, 1.08, 1.28);
      }
      // Single 90mm desert-tan main cannon barrel with mid-barrel fume extractor
      const zB = (zTurBot + zTurTop) * 0.52;
      pushTubeSegment3D(turFaces, turProj, 0.48 * r * TS - recDist, 0, zB, 0.03, 0, 1.06 * r * BL, 0.082 * r, 0.072 * r, baseCol, seamCol, 1.15, 1.40);
      pushTubeSegment3D(turFaces, turProj, 0.84 * r * TS - recDist, 0, zB + 0.01 * r, 0.03, 0, 0.22 * r * BL, 0.102 * r, 0.100 * r, hiCol, seamCol, 1.10, 1.45);
      // Optional Scorpion Rocket Upgrade Tube on roof
      if (p.ShowUpgradeKit === true && customParams && customParams.ShowUpgradeKit === true) {
        pushTubeSegment3D(turFaces, turProj, -0.28 * r * TS, -0.22 * r * TS, zTurTop + 0.16 * r * H, 0.14, 0, 0.80 * r * BL, 0.090 * r, 0.075 * r, olive, seamCol, 1.1, 1.65);
      }
      // Rear vertical whip antenna
      turFaces.push({
        depth: turProj.project(-0.44 * r * TS, -0.36 * r * TS, zTurTop).depth + 1.55,
        customDraw(c) {
          drawLine3D(c, turProj, -0.44 * r * TS, -0.36 * r * TS, zTurTop, -0.50 * r * TS, -0.36 * r * TS, zTurTop + 0.66 * r * H, seamCol, 1.4);
        }
      });
    }

    flushFaces(ctx, turFaces);
  }

  function renderGlaWheeledModel(ctx, u, faction, customParams, options) {
    const defId = String((u && u.defId) || 'GLA_TECHNICAL');
    const isOliveDefault = defId === 'GLA_SCUD_LAUNCHER' || defId === 'GLA_COMBAT_CYCLE';
    const p = Object.assign({
      hullScale: 1.0, hullLength: 1.0, hullWidth: 1.0, extrusionDepth: 1.0,
      weaponScale: 1.0, payloadPitch: 0.34,
      armorBaseColor: isOliveDefault ? '#637349' : '#c8a064',
      armorHighlightColor: isOliveDefault ? '#7a8c5b' : '#dfb87c',
      armorShadowColor: isOliveDefault ? '#445032' : '#8c6b3c',
      houseColor: '#5c6e46'
    }, customParams || {});
    const opts = options || {};
    const rawR = (u && u.radius) || 16;
    const r = rawR * (p.hullScale || 1.0);
    const L = p.hullLength || 1.0, W = p.hullWidth || 1.0, H = p.extrusionDepth || 1.0, WS = p.weaponScale || 1.0;

    const hullAngle = (u && u.angle !== undefined) ? u.angle : 0;
    const turretAngle = (u && u.turretAngle !== undefined) ? u.turretAngle : hullAngle;
    const treadPhase = (u && u.treadPhase) || 0;
    const recoil = (u && u.recoilOffset) || 0;
    const pitchScale = opts.pitchScale !== undefined ? opts.pitchScale : 1.0;
    const zScale = opts.zScale !== undefined ? opts.zScale : 0.42;

    const baseCol = p.armorBaseColor || (isOliveDefault ? '#637349' : '#c8a064');
    const hiCol   = p.armorHighlightColor || (isOliveDefault ? '#7a8c5b' : '#dfb87c');
    const darkCol = p.armorShadowColor || (isOliveDefault ? '#445032' : '#8c6b3c');
    const olive   = p.houseColor || '#5c6e46';
    const seamCol = '#241c12';

    const hullProj = createProjector(hullAngle, pitchScale, zScale, 0, 0, 0, 0);
    const shadowW = defId === 'GLA_COMBAT_CYCLE' ? 0.38 : 0.78;
    const shadowPts = [
      hullProj.project(-1.10 * r * L, -shadowW * r * W, 0),
      hullProj.project( 1.10 * r * L, -shadowW * r * W, 0),
      hullProj.project( 1.10 * r * L,  shadowW * r * W, 0),
      hullProj.project(-1.10 * r * L,  shadowW * r * W, 0)
    ].map((pt) => ({ x: pt.x + 2.8, y: pt.y + 3.8 }));
    drawPolyPts(ctx, shadowPts, 'rgba(60, 48, 32, 0.34)', null, 0);

    const faces = [];

    // =========================================================================
    // 1. GLA COMBAT CYCLE (Agile Off-Road Motocross Dirtbike)
    //    Matches assets/refs/gla_combat_cycle_diorama_ref.png
    // =========================================================================
    if (defId === 'GLA_COMBAT_CYCLE') {
      // Front & rear knobby black motocross tires with silver spoked hubs
      pushWheelAxle3D(faces, hullProj, -0.62 * r * L, 0.06 * r * W, 0.34 * r, 0.14 * r, '#242220', '#cbd5e1', seamCol, treadPhase, -1.2);
      pushWheelAxle3D(faces, hullProj,  0.62 * r * L, 0.06 * r * W, 0.34 * r, 0.14 * r, '#242220', '#cbd5e1', seamCol, treadPhase, -1.2);
      // Silver engine block & crankcase + rear swingarm
      pushBox3D(faces, hullProj, -0.28 * r * L, 0.24 * r * L, -0.14 * r * W, 0.14 * r * W, 0.22 * r * H, 0.52 * r * H, '#94a3b8', seamCol, 1.12, 0.15);
      // Upswept rear exhaust muffler pipe (silver)
      pushTubeSegment3D(faces, hullProj, -0.18 * r * L, 0.16 * r * W, 0.38 * r * H, 0.28, Math.PI, 0.58 * r * L, 0.065 * r, 0.075 * r, '#cbd5e1', seamCol, 1.05, 0.35);
      // Olive-green fuel tank & side radiator shrouds + high rear tail fender
      pushBox3D(faces, hullProj, -0.68 * r * L, -0.18 * r * L, -0.14 * r * W, 0.14 * r * W, 0.50 * r * H, 0.66 * r * H, hiCol, seamCol, 1.12, 0.45);
      pushBox3D(faces, hullProj, -0.04 * r * L, 0.42 * r * L, -0.18 * r * W, 0.18 * r * W, 0.50 * r * H, 0.82 * r * H, baseCol, seamCol, 1.15, 0.55, 0.04 * r, 0.03 * r);
      // Dark contoured motorcycle saddle seat
      pushBox3D(faces, hullProj, -0.44 * r * L, 0.04 * r * L, -0.15 * r * W, 0.15 * r * W, 0.54 * r * H, 0.72 * r * H, '#334155', seamCol, 1.1, 0.62);
      // High front motocross mudguard fender over front wheel
      pushBox3D(faces, hullProj, 0.42 * r * L, 0.80 * r * L, -0.12 * r * W, 0.12 * r * W, 0.56 * r * H, 0.68 * r * H, hiCol, seamCol, 1.1, 0.70);
      // Angled silver telescopic front fork tubes, number plate, and wide handlebars with mirrors
      faces.push({
        depth: hullProj.project(0.48 * r * L, 0.12 * r * W, 0.72 * r * H).depth + 0.85,
        customDraw(c) {
          for (const side of [-1, 1]) {
            drawLine3D(c, hullProj, 0.62 * r * L, side * 0.10 * r * W, 0.34 * r * H, 0.34 * r * L, side * 0.12 * r * W, 0.96 * r * H, '#cbd5e1', 2.4);
            drawLine3D(c, hullProj, 0.62 * r * L, side * 0.10 * r * W, 0.34 * r * H, 0.34 * r * L, side * 0.12 * r * W, 0.96 * r * H, seamCol, 0.9);
          }
          // Wide handlebars
          drawLine3D(c, hullProj, 0.32 * r * L, -0.36 * r * W, 0.98 * r * H, 0.32 * r * L, 0.36 * r * W, 0.98 * r * H, seamCol, 2.2);
          // Rear swingarm strut
          drawLine3D(c, hullProj, -0.16 * r * L, 0.12 * r * W, 0.34 * r * H, -0.62 * r * L, 0.12 * r * W, 0.34 * r * H, '#94a3b8', 2.4);
        }
      });
      flushFaces(ctx, faces);
      return;
    }

    // =========================================================================
    // 2. GLA SCUD LAUNCHER (8x8 Olive MAZ-543 TEL + Twin Scud-B Missiles)
    //    Matches assets/refs/gla_scud_launcher_diorama_ref.png
    // =========================================================================
    if (defId === 'GLA_SCUD_LAUNCHER') {
      for (const ax of [-0.84, -0.30, 0.26, 0.82]) {
        pushWheelAxle3D(faces, hullProj, ax * r * L, 0.64 * r * W, 0.30 * r, 0.22 * r * W, '#242220', darkCol, seamCol, treadPhase, -1.5);
      }
      // Rear vertical hydraulic stabilizer outrigger jacks at tail (x = -1.16*r)
      for (const side of [-1, 1]) {
        pushCylinderZ3D(faces, hullProj, -1.14 * r * L, side * 0.60 * r * W, 0.08 * r * H, 0.56 * r * H, 0.11 * r, 0.11 * r, 8, darkCol, seamCol, 1.1, -0.2);
      }
      // Long 8x8 olive chassis & mid-body equipment bays
      pushBox3D(faces, hullProj, -1.14 * r * L, 1.16 * r * L, -0.74 * r * W, 0.74 * r * W, 0.18 * r * H, 0.48 * r * H, baseCol, seamCol, 1.18, 0);
      pushBox3D(faces, hullProj, -0.96 * r * L, 0.40 * r * L, -0.68 * r * W, 0.68 * r * W, 0.48 * r * H, 0.66 * r * H, darkCol, seamCol, 1.12, 0.22);
      // Forward armored TEL cab (x = 0.40*r..1.16*r) with split 2-pane windshield, side door windows, grille & roof beacons
      pushBox3D(faces, hullProj, 0.40 * r * L, 1.16 * r * L, -0.72 * r * W, 0.72 * r * W, 0.48 * r * H, 0.90 * r * H, hiCol, seamCol, 1.18, 0.38, 0.08 * r * L, 0.04 * r * W);
      // Twin amber roof hazard beacons on cab roof
      for (const side of [-1, 1]) {
        pushCylinderZ3D(faces, hullProj, 0.78 * r * L, side * 0.44 * r * W, 0.90 * r * H, 1.00 * r * H, 0.07 * r, 0.06 * r, 6, '#f59e0b', seamCol, 1.0, 0.52);
      }
      faces.push({
        depth: hullProj.project(1.17 * r * L, 0, 0.68 * r * H).depth + 0.55,
        customDraw(c) {
          // Split 2-pane blue-grey cab windshield
          for (const side of [-1, 1]) {
            const wQuad = [
              [1.15 * r * L, side * 0.06 * r * W, 0.56 * r * H],
              [1.15 * r * L, side * 0.62 * r * W, 0.56 * r * H],
              [1.07 * r * L, side * 0.58 * r * W, 0.84 * r * H],
              [1.07 * r * L, side * 0.06 * r * W, 0.84 * r * H]
            ];
            drawGlassPane3D(c, hullProj, wQuad, '#64748b', seamCol, 1.05);
            // Side door window
            const sQuad = [
              [0.56 * r * L, side * 0.73 * r * W, 0.58 * r * H],
              [0.98 * r * L, side * 0.73 * r * W, 0.58 * r * H],
              [0.94 * r * L, side * 0.73 * r * W, 0.82 * r * H],
              [0.58 * r * L, side * 0.73 * r * W, 0.82 * r * H]
            ];
            drawGlassPane3D(c, hullProj, sQuad, '#64748b', seamCol, 1.0);
          }
          // Front vertical radiator grille & twin headlights
          const gQuad = [
            [1.17 * r * L, -0.38 * r * W, 0.22 * r * H],
            [1.17 * r * L,  0.38 * r * W, 0.22 * r * H],
            [1.17 * r * L,  0.36 * r * W, 0.46 * r * H],
            [1.17 * r * L, -0.36 * r * W, 0.46 * r * H]
          ];
          drawGlassPane3D(c, hullProj, gQuad, '#1e293b', seamCol, 1.05);
          for (const side of [-1, 1]) {
            const hl = hullProj.project(1.17 * r * L, side * 0.54 * r * W, 0.34 * r * H);
            c.fillStyle = '#fef3c7';
            c.strokeStyle = seamCol;
            c.lineWidth = 1.0;
            c.beginPath();
            c.arc(hl.x, hl.y, Math.max(1.6, 0.06 * r), 0, Math.PI * 2);
            c.fill();
            c.stroke();
          }
        }
      });

      // Twin Side-by-Side Olive Scud-B Ballistic Missiles with Red/Orange Warhead Bands & Tail Fins (matching gla_scud_launcher_diorama_ref.png!)
      const elev = (customParams && customParams.payloadPitch !== undefined) ? customParams.payloadPitch : 0.06;
      const mLen = 1.72 * r * L * WS;
      for (const side of [-1, 1]) {
        const my = side * 0.24 * r * W;
        const x0 = -1.06 * r * L;
        const z0 = 0.74 * r * H;
        // Main olive missile body
        pushTubeSegment3D(faces, hullProj, x0, my, z0, elev, 0, mLen, 0.16 * r, 0.15 * r, hiCol, seamCol, 1.18, 0.85 + side * 0.05);
        // Red-orange warhead separation band near forward third
        const xBand = x0 + Math.cos(elev) * mLen * 0.74;
        const zBand = z0 + Math.sin(elev) * mLen * 0.74;
        pushTubeSegment3D(faces, hullProj, xBand, my, zBand, elev, 0, mLen * 0.14, 0.165 * r, 0.155 * r, '#ea580c', seamCol, 1.1, 0.95 + side * 0.05);
        // Conical olive warhead nosecone
        const xTip = x0 + Math.cos(elev) * mLen;
        const zTip = z0 + Math.sin(elev) * mLen;
        pushTubeSegment3D(faces, hullProj, xTip, my, zTip, elev, 0, 0.42 * r * WS, 0.15 * r, 0.03 * r, baseCol, seamCol, 1.15, 1.10 + side * 0.05);
        // Rear stabilizer tail fins
        pushBox3D(faces, hullProj, x0 - 0.06 * r, x0 + 0.22 * r, my - 0.22 * r, my + 0.22 * r, z0 - 0.18 * r, z0 + 0.18 * r, darkCol, seamCol, 1.05, 0.82 + side * 0.05);
      }
      flushFaces(ctx, faces);
      return;
    }

    // =========================================================================
    // 3. GLA BATTLE BUS (Up-Armored Fortified Bus + Cowcatcher Plow + Roof Bunker)
    // =========================================================================
    if (defId === 'GLA_BATTLE_BUS') {
      for (const ax of [-0.82, -0.28, 0.28, 0.82]) {
        pushWheelAxle3D(faces, hullProj, ax * r * L, 0.62 * r * W, 0.30 * r, 0.22 * r * W, '#242220', darkCol, seamCol, treadPhase, -1.5);
      }
      // Front steel cowcatcher scrap plow
      pushBox3D(faces, hullProj, 1.08 * r * L, 1.26 * r * L, -0.80 * r * W, 0.80 * r * W, 0.12 * r * H, 0.48 * r * H, '#64748b', seamCol, 1.15, 0.4);
      // Armored yellow/tan bus body
      pushBox3D(faces, hullProj, -1.14 * r * L, 1.12 * r * L, -0.74 * r * W, 0.74 * r * W, 0.20 * r * H, 0.88 * r * H, '#eab308', seamCol, 1.18, 0.2, 0.08 * r * L, 0.05 * r * W);
      // Fortified olive rooftop firing bunker
      pushBox3D(faces, hullProj, -0.92 * r * L, 0.68 * r * L, -0.68 * r * W, 0.68 * r * W, 0.88 * r * H, 1.16 * r * H, olive, seamCol, 1.15, 0.75);
      // Armored firing slits along sides & front windshield slit
      faces.push({
        depth: hullProj.project(0.20 * r * L, 0.75 * r * W, 0.62 * r * H).depth + 0.55,
        customDraw(c) {
          for (const sx of [-0.78, -0.38, 0.02, 0.42]) {
            const fQuad = [
              [sx * r * L, 0.75 * r * W, 0.56 * r * H],
              [(sx + 0.24) * r * L, 0.75 * r * W, 0.56 * r * H],
              [(sx + 0.24) * r * L, 0.75 * r * W, 0.74 * r * H],
              [sx * r * L, 0.75 * r * W, 0.74 * r * H]
            ];
            drawGlassPane3D(c, hullProj, fQuad, '#1e293b', seamCol, 1.0);
          }
        }
      });
      flushFaces(ctx, faces);
      return;
    }

    // =========================================================================
    // 4. GLA BOMB TRUCK (Disguised Cargo Truck + Volatile HE & Anthrax Drums)
    // =========================================================================
    if (defId === 'GLA_BOMB_TRUCK') {
      for (const ax of [-0.68, 0.68]) {
        pushWheelAxle3D(faces, hullProj, ax * r * L, 0.62 * r * W, 0.30 * r, 0.22 * r * W, '#242220', darkCol, seamCol, treadPhase, -1.5);
      }
      // Forward truck cab + windshield
      pushBox3D(faces, hullProj, 0.28 * r * L, 1.04 * r * L, -0.66 * r * W, 0.66 * r * W, 0.20 * r * H, 0.88 * r * H, hiCol, seamCol, 1.15, 0.3, 0.08 * r * L, 0.04 * r * W);
      // Rear cargo dump bed + volatile explosive & bio drums
      pushBox3D(faces, hullProj, -1.06 * r * L, 0.24 * r * L, -0.72 * r * W, 0.72 * r * W, 0.20 * r * H, 0.76 * r * H, olive, seamCol, 1.15, 0.55);
      for (const [dx, dy, col] of [[-0.74, -0.30, '#dc2626'], [-0.74, 0.30, '#dc2626'], [-0.20, 0, '#4ade80']]) {
        pushCylinderZ3D(faces, hullProj, dx * r * L, dy * r * W, 0.76 * r * H, 1.14 * r * H, 0.22 * r, 0.22 * r, 8, col, seamCol, 1.1, 0.82);
      }
      flushFaces(ctx, faces);
      return;
    }

    // =========================================================================
    // 5. GLA ROCKET BUGGY (Tubular Sand-Rail Dune Buggy + Red-Tipped Rocket Rack)
    //    Matches assets/refs/gla_rocket_buggy_diorama_ref.png
    // =========================================================================
    if (defId === 'GLA_ROCKET_BUGGY') {
      // Exposed large rear off-road tires & slightly smaller front tires
      pushWheelAxle3D(faces, hullProj, -0.68 * r * L, 0.68 * r * W, 0.35 * r, 0.22 * r * W, '#242220', darkCol, seamCol, treadPhase, -1.5);
      pushWheelAxle3D(faces, hullProj,  0.68 * r * L, 0.64 * r * W, 0.29 * r, 0.20 * r * W, '#242220', darkCol, seamCol, treadPhase, -1.5);

      // Low-profile desert-tan sand-rail floor pan & sloped nose hood
      pushBox3D(faces, hullProj, -0.88 * r * L, 0.30 * r * L, -0.52 * r * W, 0.52 * r * W, 0.16 * r * H, 0.38 * r * H, baseCol, seamCol, 1.15, 0);
      pushBox3D(faces, hullProj, 0.24 * r * L, 1.04 * r * L, -0.46 * r * W, 0.46 * r * W, 0.18 * r * H, 0.46 * r * H, hiCol, seamCol, 1.15, 0.25, 0.12 * r * L, 0.06 * r * W);
      // Front tubular skid bumper & dark cockpit bucket seat cavity
      pushBox3D(faces, hullProj, 0.98 * r * L, 1.12 * r * L, -0.42 * r * W, 0.42 * r * W, 0.14 * r * H, 0.28 * r * H, darkCol, seamCol, 1.1, 0.35);
      pushBox3D(faces, hullProj, -0.46 * r * L, 0.24 * r * L, -0.42 * r * W, 0.42 * r * W, 0.36 * r * H, 0.50 * r * H, '#334155', seamCol, 1.08, 0.32);

      // 3D Desert-Tan Tubular Roll-Cage Bars & Olive Nose Emblem
      faces.push({
        depth: hullProj.project(0.0, 0.46 * r * W, 0.68 * r * H).depth + 0.65,
        customDraw(c) {
          for (const side of [-1, 1]) {
            const yCage = side * 0.44 * r * W;
            // Front A-pillar
            drawLine3D(c, hullProj, 0.32 * r * L, yCage, 0.42 * r * H, 0.08 * r * L, yCage * 0.92, 0.86 * r * H, hiCol, 2.8);
            drawLine3D(c, hullProj, 0.32 * r * L, yCage, 0.42 * r * H, 0.08 * r * L, yCage * 0.92, 0.86 * r * H, seamCol, 1.0);
            // Roof longitudinal bar
            drawLine3D(c, hullProj, 0.08 * r * L, yCage * 0.92, 0.86 * r * H, -0.48 * r * L, yCage * 0.92, 0.86 * r * H, hiCol, 2.8);
            // Rear B-pillar & engine diagonal brace
            drawLine3D(c, hullProj, -0.48 * r * L, yCage * 0.92, 0.86 * r * H, -0.56 * r * L, yCage, 0.38 * r * H, hiCol, 2.8);
            drawLine3D(c, hullProj, -0.48 * r * L, yCage * 0.92, 0.86 * r * H, -0.86 * r * L, yCage * 0.85, 0.38 * r * H, darkCol, 2.4);
          }
          // Crossbars
          drawLine3D(c, hullProj, 0.08 * r * L, -0.40 * r * W, 0.86 * r * H, 0.08 * r * L, 0.40 * r * W, 0.86 * r * H, hiCol, 2.6);
          drawLine3D(c, hullProj, -0.48 * r * L, -0.40 * r * W, 0.86 * r * H, -0.48 * r * L, 0.40 * r * W, 0.86 * r * H, hiCol, 2.6);
          // Olive tactical emblem on sloped nose hood
          const emb = hullProj.project(0.68 * r * L, 0, 0.45 * r * H);
          c.fillStyle = olive;
          c.beginPath();
          c.arc(emb.x, emb.y, Math.max(2.0, 0.11 * r), 0, Math.PI * 2);
          c.fill();
        }
      });
      flushFaces(ctx, faces);

      // Roof-Mounted Multi-Rocket Artillery Rack (Olive Rockets with Bright Red Conical Nosecones!)
      const turProj = createProjector(turretAngle, pitchScale, zScale, -0.22 * r * L, 0, 0, hullAngle);
      const turFaces = [];
      const zRack = 0.88 * r * H;
      // Support frame cradle
      pushBox3D(turFaces, turProj, -0.34 * r * WS, 0.26 * r * WS, -0.38 * r * WS, 0.38 * r * WS, zRack - 0.06 * r * H, zRack + 0.08 * r * H, darkCol, seamCol, 1.1, 1.0);
      // 3 Side-by-Side Olive Rockets with Bright Red Conical Warhead Tips
      for (const ry of [-0.24 * r * WS, 0, 0.24 * r * WS]) {
        pushTubeSegment3D(turFaces, turProj, -0.44 * r * WS, ry, zRack + 0.12 * r * H, 0.14, 0, 0.72 * r * WS, 0.095 * r, 0.090 * r, olive, seamCol, 1.12, 1.25);
        pushTubeSegment3D(turFaces, turProj,  0.24 * r * WS, ry, zRack + 0.22 * r * H, 0.14, 0, 0.26 * r * WS, 0.090 * r, 0.025 * r, '#dc2626', seamCol, 1.12, 1.42);
      }
      flushFaces(ctx, turFaces);
      return;
    }

    // =========================================================================
    // 6. GLA TECHNICAL PICKUP TRUCK (4x4 Desert Pickup + Bed-Mounted Olive DShK)
    //    Matches assets/refs/gla_technical_diorama_ref.png
    // =========================================================================
    for (const ax of [-0.66, 0.68]) {
      pushWheelAxle3D(faces, hullProj, ax * r * L, 0.64 * r * W, 0.31 * r, 0.22 * r * W, '#242220', baseCol, seamCol, treadPhase, -1.5);
    }
    // Lower pickup body (hood + cab lower doors + rear cargo bed floor)
    pushBox3D(faces, hullProj, -1.06 * r * L, 1.06 * r * L, -0.68 * r * W, 0.68 * r * W, 0.18 * r * H, 0.50 * r * H, baseCol, seamCol, 1.18, 0, 0.06 * r * L, 0.04 * r * W);
    // Open Rear Cargo Bed Sidewalls & Tailgate (x = -1.06*r..-0.16*r)
    for (const side of [-1, 1]) {
      pushBox3D(faces, hullProj, -1.06 * r * L, -0.16 * r * L, side * 0.56 * r * W, side * 0.68 * r * W, 0.50 * r * H, 0.64 * r * H, hiCol, seamCol, 1.1, 0.22);
    }
    pushBox3D(faces, hullProj, -1.06 * r * L, -0.96 * r * L, -0.58 * r * W, 0.58 * r * W, 0.50 * r * H, 0.62 * r * H, darkCol, seamCol, 1.08, 0.20);
    // Enclosed Pickup Cab Upper Greenhouse (x = -0.16*r..0.46*r)
    pushBox3D(faces, hullProj, -0.16 * r * L, 0.46 * r * L, -0.64 * r * W, 0.64 * r * W, 0.50 * r * H, 0.88 * r * H, hiCol, seamCol, 1.18, 0.38, 0.10 * r * L, 0.05 * r * W);
    // Front steel bumper bar
    pushBox3D(faces, hullProj, 1.02 * r * L, 1.12 * r * L, -0.70 * r * W, 0.70 * r * W, 0.14 * r * H, 0.28 * r * H, '#475569', seamCol, 1.1, 0.42);

    // Blue-grey glass windshield, side door windows, black vertical-slat radiator grille & rectangular headlights
    faces.push({
      depth: hullProj.project(0.48 * r * L, 0, 0.68 * r * H).depth + 0.55,
      customDraw(c) {
        // Front sloped glass windshield
        const wQuad = [
          [0.47 * r * L, -0.56 * r * W, 0.52 * r * H],
          [0.47 * r * L,  0.56 * r * W, 0.52 * r * H],
          [0.37 * r * L,  0.52 * r * W, 0.82 * r * H],
          [0.37 * r * L, -0.52 * r * W, 0.82 * r * H]
        ];
        drawGlassPane3D(c, hullProj, wQuad, '#64748b', seamCol, 1.1);
        // Side cab door windows
        for (const side of [-1, 1]) {
          const sQuad = [
            [-0.08 * r * L, side * 0.65 * r * W, 0.54 * r * H],
            [ 0.34 * r * L, side * 0.65 * r * W, 0.54 * r * H],
            [ 0.28 * r * L, side * 0.65 * r * W, 0.80 * r * H],
            [-0.06 * r * L, side * 0.65 * r * W, 0.80 * r * H]
          ];
          drawGlassPane3D(c, hullProj, sQuad, '#64748b', seamCol, 1.0);
        }
        // Front black radiator grille & twin rectangular headlights
        const gQuad = [
          [1.07 * r * L, -0.40 * r * W, 0.28 * r * H],
          [1.07 * r * L,  0.40 * r * W, 0.28 * r * H],
          [1.07 * r * L,  0.38 * r * W, 0.46 * r * H],
          [1.07 * r * L, -0.38 * r * W, 0.46 * r * H]
        ];
        drawGlassPane3D(c, hullProj, gQuad, '#1e293b', seamCol, 1.05);
        for (const side of [-1, 1]) {
          const hQuad = [
            [1.07 * r * L, side * 0.42 * r * W, 0.30 * r * H],
            [1.07 * r * L, side * 0.62 * r * W, 0.30 * r * H],
            [1.07 * r * L, side * 0.60 * r * W, 0.46 * r * H],
            [1.07 * r * L, side * 0.42 * r * W, 0.46 * r * H]
          ];
          drawGlassPane3D(c, hullProj, hQuad, '#fef3c7', seamCol, 1.0);
        }
      }
    });
    flushFaces(ctx, faces);

    // Bed-Mounted 360° Slewing Olive-Green Heavy Machine Gun / Recoilless Gun with Twin Gun-Shield Plates
    const recDist = clamp(recoil * 0.04 * r, 0, 0.18 * r);
    const turProj = createProjector(turretAngle, pitchScale, zScale, -0.58 * r * L, 0, 0, hullAngle);
    const turFaces = [];
    // Pedestal tripod post in pickup bed
    pushCylinderZ3D(turFaces, turProj, 0, 0, 0.50 * r * H, 0.86 * r * H, 0.12 * r, 0.09 * r, 8, darkCol, seamCol, 1.08, 1.0);
    // Olive gun receiver & side ammo box
    pushBox3D(turFaces, turProj, -0.26 * r * WS - recDist, 0.20 * r * WS - recDist, -0.14 * r * WS, 0.22 * r * WS, 0.84 * r * H, 1.04 * r * H, olive, seamCol, 1.15, 1.2);
    // Sloped olive gun shield plates flanking the barrel
    pushBox3D(turFaces, turProj, 0.14 * r * WS - recDist, 0.24 * r * WS - recDist, -0.28 * r * WS, 0.28 * r * WS, 0.80 * r * H, 1.12 * r * H, olive, seamCol, 1.15, 1.32);
    // Long heavy perforated DShK barrel
    pushTubeSegment3D(turFaces, turProj, 0.20 * r * WS - recDist, 0, 0.94 * r * H, 0.04, 0, 0.94 * r * WS, 0.068 * r, 0.056 * r, '#334155', seamCol, 1.12, 1.45);
    flushFaces(ctx, turFaces);
  }

  // ==========================================================================
  // 12B. Deep-Engineered 3D Ligne-Claire Building Schemas, Presets & Renderers
  //      (31 Military Structures: 10 USA, 12 China, 9 GLA + 4 Tech Buildings)
  // ==========================================================================
  const BUILDING_DEFAULT_PARAMS = {
    footprintScale: 1.0,
    plinthHeight: 1.0,
    structureHeight: 1.0,
    extrusionDepth: 1.0,
    turretScale: 1.0,
    barrelLength: 1.0,
    radarScale: 1.0,
    superstructureScale: 1.0,
    ShowUpgradeKit: true,
    ShowHazardBeacons: true,
    ShowGantryCrane: true,
    ShowPerimeterWall: true,
    ShowFactionEmblem: true,
    armorBaseColor: '#cbd5e1',
    armorHighlightColor: '#f1f5f9',
    armorShadowColor: '#64748b',
    houseColor: '#2563eb'
  };

  const USA_BUILDING_PARAM_SCHEMA = [
    {
      group: 'Plinth & Foundation',
      fields: [
        { key: 'footprintScale', label: 'Compound Footprint Scale', type: 'range', min: 0.80, max: 1.25, step: 0.02 },
        { key: 'plinthHeight', label: 'Concrete Plinth Elevation', type: 'range', min: 0.65, max: 1.50, step: 0.05 },
        { key: 'ShowPerimeterWall', label: 'Perimeter Blast Bollards', type: 'checkbox' }
      ]
    },
    {
      group: 'Superstructure & Halls',
      fields: [
        { key: 'structureHeight', label: 'Main Hall Elevation', type: 'range', min: 0.75, max: 1.40, step: 0.02 },
        { key: 'superstructureScale', label: 'Command Bridge / Bay Mass', type: 'range', min: 0.80, max: 1.35, step: 0.02 },
        { key: 'extrusionDepth', label: '3D Isometric Relief Depth', type: 'range', min: 0.70, max: 1.40, step: 0.05 }
      ]
    },
    {
      group: 'Turrets, Emitters & Gantries',
      fields: [
        { key: 'turretScale', label: 'Patriot / Emitter / Crane Scale', type: 'range', min: 0.75, max: 1.35, step: 0.02 },
        { key: 'barrelLength', label: 'Launcher / Array Extension', type: 'range', min: 0.75, max: 1.45, step: 0.02 },
        { key: 'ShowGantryCrane', label: 'Deploy Service Gantries', type: 'checkbox' }
      ]
    },
    {
      group: 'Radar, Reactor & Upgrades',
      fields: [
        { key: 'radarScale', label: 'Radar / Telemetry Array Scale', type: 'range', min: 0.70, max: 1.45, step: 0.05 },
        { key: 'ShowUpgradeKit', label: 'Control Rods / Strategy Upgrade', type: 'checkbox' },
        { key: 'ShowHazardBeacons', label: 'Runway & Helipad Strobe Lights', type: 'checkbox' },
        { key: 'ShowFactionEmblem', label: 'Allied Star Marking', type: 'checkbox' }
      ]
    },
    {
      group: 'Materials & Livery',
      fields: [
        { key: 'armorBaseColor', label: 'Composite Wall Cladding', type: 'color' },
        { key: 'armorHighlightColor', label: 'Sunlit Roof & Trim Cladding', type: 'color' },
        { key: 'armorShadowColor', label: 'Structural Steel Shadow', type: 'color' },
        { key: 'houseColor', label: 'USA Tactical Blue Accent', type: 'color' }
      ]
    }
  ];

  const USA_BUILDING_PRESETS = {
    DIORAMA_DEFAULT: {
      name: 'Standard High Command',
      params: {
        footprintScale: 1.0, plinthHeight: 1.0, structureHeight: 1.0, extrusionDepth: 1.0,
        turretScale: 1.0, barrelLength: 1.0, radarScale: 1.0, superstructureScale: 1.0,
        ShowUpgradeKit: true, ShowHazardBeacons: true, ShowGantryCrane: true, ShowPerimeterWall: true, ShowFactionEmblem: true,
        armorBaseColor: '#cbd5e1', armorHighlightColor: '#f1f5f9', armorShadowColor: '#64748b', houseColor: '#2563eb'
      }
    },
    DESERT_FOB: {
      name: 'Desert Forward Operating Base',
      params: {
        footprintScale: 1.04, plinthHeight: 1.1, structureHeight: 1.0, extrusionDepth: 1.05,
        turretScale: 1.05, barrelLength: 1.05, radarScale: 1.05, superstructureScale: 1.02,
        ShowUpgradeKit: true, ShowHazardBeacons: true, ShowGantryCrane: true, ShowPerimeterWall: true, ShowFactionEmblem: true,
        armorBaseColor: '#d6c7b2', armorHighlightColor: '#ede4d3', armorShadowColor: '#8c7a62', houseColor: '#0284c7'
      }
    },
    SUPERWEAPON_GENERAL: {
      name: 'Superweapon General Grid',
      params: {
        footprintScale: 1.05, plinthHeight: 1.15, structureHeight: 1.12, extrusionDepth: 1.15,
        turretScale: 1.15, barrelLength: 1.2, radarScale: 1.2, superstructureScale: 1.1,
        ShowUpgradeKit: true, ShowHazardBeacons: true, ShowGantryCrane: true, ShowPerimeterWall: true, ShowFactionEmblem: true,
        armorBaseColor: '#cbd5e1', armorHighlightColor: '#e0f2fe', armorShadowColor: '#475569', houseColor: '#06b6d4'
      }
    },
    AIR_FORCE_GENERAL: {
      name: 'Air Force Command Wing',
      params: {
        footprintScale: 1.08, plinthHeight: 0.95, structureHeight: 1.05, extrusionDepth: 1.05,
        turretScale: 1.08, barrelLength: 1.1, radarScale: 1.25, superstructureScale: 1.06,
        ShowUpgradeKit: true, ShowHazardBeacons: true, ShowGantryCrane: true, ShowPerimeterWall: true, ShowFactionEmblem: true,
        armorBaseColor: '#94a3b8', armorHighlightColor: '#cbd5e1', armorShadowColor: '#475569', houseColor: '#3b82f6'
      }
    },
    SPEC_OPS_BLACK: {
      name: 'Spec-Ops Classified Site',
      params: {
        footprintScale: 1.0, plinthHeight: 1.05, structureHeight: 1.08, extrusionDepth: 1.1,
        turretScale: 1.1, barrelLength: 1.15, radarScale: 1.15, superstructureScale: 1.08,
        ShowUpgradeKit: true, ShowHazardBeacons: true, ShowGantryCrane: true, ShowPerimeterWall: true, ShowFactionEmblem: true,
        armorBaseColor: '#475569', armorHighlightColor: '#64748b', armorShadowColor: '#1e293b', houseColor: '#38bdf8'
      }
    }
  };

  const CHINA_BUILDING_PARAM_SCHEMA = [
    {
      group: 'Fortress Plinth & Bastions',
      fields: [
        { key: 'footprintScale', label: 'Fortress Plinth Scale', type: 'range', min: 0.80, max: 1.25, step: 0.02 },
        { key: 'plinthHeight', label: 'Reinforced Concrete Base', type: 'range', min: 0.65, max: 1.50, step: 0.05 },
        { key: 'ShowPerimeterWall', label: 'Brutalist Corner Bastions', type: 'checkbox' }
      ]
    },
    {
      group: 'Foundry & Citadel Mass',
      fields: [
        { key: 'structureHeight', label: 'Citadel / Tower Elevation', type: 'range', min: 0.75, max: 1.40, step: 0.02 },
        { key: 'superstructureScale', label: 'Furnace / Cooling Tower Mass', type: 'range', min: 0.80, max: 1.35, step: 0.02 },
        { key: 'extrusionDepth', label: '3D Isometric Relief Depth', type: 'range', min: 0.70, max: 1.40, step: 0.05 }
      ]
    },
    {
      group: 'Gattling, Silo & Gantries',
      fields: [
        { key: 'turretScale', label: 'Gattling / Silo Collar Scale', type: 'range', min: 0.75, max: 1.35, step: 0.02 },
        { key: 'barrelLength', label: 'Barrel / Warhead Extension', type: 'range', min: 0.75, max: 1.45, step: 0.02 },
        { key: 'ShowGantryCrane', label: 'Foundry Gantries & Smokestacks', type: 'checkbox' }
      ]
    },
    {
      group: 'Propaganda, Cyber & Mines',
      fields: [
        { key: 'radarScale', label: 'Radar / Speaker / Sat Scale', type: 'range', min: 0.70, max: 1.45, step: 0.05 },
        { key: 'ShowUpgradeKit', label: 'Subliminal / Overcharge Upgrade', type: 'checkbox' },
        { key: 'ShowHazardBeacons', label: 'Reactor & Warning Beacons', type: 'checkbox' },
        { key: 'ShowFactionEmblem', label: 'PLA Red Star Pediment', type: 'checkbox' }
      ]
    },
    {
      group: 'Materials & Livery',
      fields: [
        { key: 'armorBaseColor', label: 'Reinforced Concrete / Steel', type: 'color' },
        { key: 'armorHighlightColor', label: 'Sunlit Brutalist Trim', type: 'color' },
        { key: 'armorShadowColor', label: 'Foundry Iron Shadow', type: 'color' },
        { key: 'houseColor', label: 'PLA Crimson Banner Accent', type: 'color' }
      ]
    }
  ];

  const CHINA_BUILDING_PRESETS = {
    DIORAMA_DEFAULT: {
      name: 'PLA State Citadel',
      params: {
        footprintScale: 1.0, plinthHeight: 1.0, structureHeight: 1.0, extrusionDepth: 1.0,
        turretScale: 1.0, barrelLength: 1.0, radarScale: 1.0, superstructureScale: 1.0,
        ShowUpgradeKit: true, ShowHazardBeacons: true, ShowGantryCrane: true, ShowPerimeterWall: true, ShowFactionEmblem: true,
        armorBaseColor: '#94a3b8', armorHighlightColor: '#cbd5e1', armorShadowColor: '#475569', houseColor: '#dc2626'
      }
    },
    RED_GUARD_GARRISON: {
      name: 'Red Guard Parade Complex',
      params: {
        footprintScale: 1.04, plinthHeight: 1.08, structureHeight: 1.06, extrusionDepth: 1.05,
        turretScale: 1.05, barrelLength: 1.05, radarScale: 1.1, superstructureScale: 1.05,
        ShowUpgradeKit: true, ShowHazardBeacons: true, ShowGantryCrane: true, ShowPerimeterWall: true, ShowFactionEmblem: true,
        armorBaseColor: '#b8a99a', armorHighlightColor: '#dfd3c3', armorShadowColor: '#6b5e52', houseColor: '#ef4444'
      }
    },
    NUCLEAR_GENERAL: {
      name: 'Nuclear General Enrichment Site',
      params: {
        footprintScale: 1.06, plinthHeight: 1.15, structureHeight: 1.15, extrusionDepth: 1.15,
        turretScale: 1.12, barrelLength: 1.18, radarScale: 1.15, superstructureScale: 1.15,
        ShowUpgradeKit: true, ShowHazardBeacons: true, ShowGantryCrane: true, ShowPerimeterWall: true, ShowFactionEmblem: true,
        armorBaseColor: '#64748b', armorHighlightColor: '#94a3b8', armorShadowColor: '#334155', houseColor: '#f97316'
      }
    },
    TANK_GENERAL_FOUNDRY: {
      name: 'Tank General Armor Foundry',
      params: {
        footprintScale: 1.08, plinthHeight: 1.12, structureHeight: 1.05, extrusionDepth: 1.1,
        turretScale: 1.18, barrelLength: 1.15, radarScale: 1.0, superstructureScale: 1.12,
        ShowUpgradeKit: true, ShowHazardBeacons: true, ShowGantryCrane: true, ShowPerimeterWall: true, ShowFactionEmblem: true,
        armorBaseColor: '#657359', armorHighlightColor: '#849477', armorShadowColor: '#3f4a36', houseColor: '#dc2626'
      }
    },
    INFANTRY_FORTRESS: {
      name: 'Infantry General Bastion',
      params: {
        footprintScale: 1.02, plinthHeight: 1.18, structureHeight: 1.08, extrusionDepth: 1.08,
        turretScale: 1.15, barrelLength: 1.12, radarScale: 1.08, superstructureScale: 1.06,
        ShowUpgradeKit: true, ShowHazardBeacons: true, ShowGantryCrane: true, ShowPerimeterWall: true, ShowFactionEmblem: true,
        armorBaseColor: '#78716c', armorHighlightColor: '#a8a29e', armorShadowColor: '#44403c', houseColor: '#b91c1c'
      }
    }
  };

  const GLA_BUILDING_PARAM_SCHEMA = [
    {
      group: 'Earthworks & Sandbag Revetment',
      fields: [
        { key: 'footprintScale', label: 'Compound Earthwork Scale', type: 'range', min: 0.80, max: 1.25, step: 0.02 },
        { key: 'plinthHeight', label: 'Sandbag & Adobe Foundation', type: 'range', min: 0.65, max: 1.50, step: 0.05 },
        { key: 'ShowPerimeterWall', label: 'Sandbag & Scrap Revetments', type: 'checkbox' }
      ]
    },
    {
      group: 'Adobe Halls & Camo Canopy',
      fields: [
        { key: 'structureHeight', label: 'Bastion / Dome Elevation', type: 'range', min: 0.75, max: 1.40, step: 0.02 },
        { key: 'superstructureScale', label: 'Workshop / Palace Mass', type: 'range', min: 0.80, max: 1.35, step: 0.02 },
        { key: 'extrusionDepth', label: '3D Isometric Relief Depth', type: 'range', min: 0.70, max: 1.40, step: 0.05 }
      ]
    },
    {
      group: 'DShK, Stinger & Scud Clusters',
      fields: [
        { key: 'turretScale', label: 'Turret / Scud Cluster Scale', type: 'range', min: 0.75, max: 1.35, step: 0.02 },
        { key: 'barrelLength', label: 'Launcher / Gun Extension', type: 'range', min: 0.75, max: 1.45, step: 0.02 },
        { key: 'ShowGantryCrane', label: 'Salvage Hoists & Camo Nets', type: 'checkbox' }
      ]
    },
    {
      group: 'Fortified Bunker & Anthrax Upgrades',
      fields: [
        { key: 'radarScale', label: 'Smuggler Dish / Banner Scale', type: 'range', min: 0.70, max: 1.45, step: 0.05 },
        { key: 'ShowUpgradeKit', label: 'Camo Netting & Anthrax Vat', type: 'checkbox' },
        { key: 'ShowHazardBeacons', label: 'Brazier & Toxin Beacons', type: 'checkbox' },
        { key: 'ShowFactionEmblem', label: 'GLA Scorpion Banner', type: 'checkbox' }
      ]
    },
    {
      group: 'Materials & Livery',
      fields: [
        { key: 'armorBaseColor', label: 'Sandstone & Adobe Brick', type: 'color' },
        { key: 'armorHighlightColor', label: 'Sun-Bleached Plaster', type: 'color' },
        { key: 'armorShadowColor', label: 'Scrap Iron & Mud Shadow', type: 'color' },
        { key: 'houseColor', label: 'GLA Scorpion Olive-Green', type: 'color' }
      ]
    }
  ];

  const GLA_BUILDING_PRESETS = {
    DIORAMA_DEFAULT: {
      name: 'Desert Insurgent Stronghold',
      params: {
        footprintScale: 1.0, plinthHeight: 1.0, structureHeight: 1.0, extrusionDepth: 1.0,
        turretScale: 1.0, barrelLength: 1.0, radarScale: 1.0, superstructureScale: 1.0,
        ShowUpgradeKit: true, ShowHazardBeacons: true, ShowGantryCrane: true, ShowPerimeterWall: true, ShowFactionEmblem: true,
        armorBaseColor: '#d4b483', armorHighlightColor: '#ead2ac', armorShadowColor: '#8c6d46', houseColor: '#65a30d'
      }
    },
    TOXIN_GENERAL: {
      name: 'Dr. Thrax Toxin Refinery',
      params: {
        footprintScale: 1.04, plinthHeight: 1.08, structureHeight: 1.08, extrusionDepth: 1.08,
        turretScale: 1.1, barrelLength: 1.12, radarScale: 1.08, superstructureScale: 1.08,
        ShowUpgradeKit: true, ShowHazardBeacons: true, ShowGantryCrane: true, ShowPerimeterWall: true, ShowFactionEmblem: true,
        armorBaseColor: '#b5a886', armorHighlightColor: '#d4c9ab', armorShadowColor: '#69624c', houseColor: '#84cc16'
      }
    },
    STEALTH_GENERAL: {
      name: 'Prince Kassad Camo Network',
      params: {
        footprintScale: 1.0, plinthHeight: 0.92, structureHeight: 0.95, extrusionDepth: 0.98,
        turretScale: 1.05, barrelLength: 1.08, radarScale: 1.15, superstructureScale: 0.96,
        ShowUpgradeKit: true, ShowHazardBeacons: false, ShowGantryCrane: true, ShowPerimeterWall: true, ShowFactionEmblem: true,
        armorBaseColor: '#a8987e', armorHighlightColor: '#c7b89e', armorShadowColor: '#635847', houseColor: '#4d7c0f'
      }
    },
    DEMO_GENERAL: {
      name: 'General Juhziz Ordnance Bastion',
      params: {
        footprintScale: 1.06, plinthHeight: 1.12, structureHeight: 1.06, extrusionDepth: 1.1,
        turretScale: 1.15, barrelLength: 1.15, radarScale: 1.05, superstructureScale: 1.1,
        ShowUpgradeKit: true, ShowHazardBeacons: true, ShowGantryCrane: true, ShowPerimeterWall: true, ShowFactionEmblem: true,
        armorBaseColor: '#c29b6b', armorHighlightColor: '#dfb98a', armorShadowColor: '#7d5a32', houseColor: '#ca8a04'
      }
    },
    PALACE_GUARD: {
      name: 'Royal Scorpion Citadel',
      params: {
        footprintScale: 1.08, plinthHeight: 1.15, structureHeight: 1.12, extrusionDepth: 1.12,
        turretScale: 1.1, barrelLength: 1.1, radarScale: 1.1, superstructureScale: 1.12,
        ShowUpgradeKit: true, ShowHazardBeacons: true, ShowGantryCrane: true, ShowPerimeterWall: true, ShowFactionEmblem: true,
        armorBaseColor: '#dfc18b', armorHighlightColor: '#f5deb3', armorShadowColor: '#967846', houseColor: '#16a34a'
      }
    }
  };

  function pushTaperedBox3D(faceList, proj, x0, x1, y0, y1, tx0, tx1, ty0, ty1, z0, z1, baseHex, strokeHex, strokeW = 1.15, bias = 0) {
    const bot = [
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y1, z0],
      [x0, y1, z0]
    ];
    const top = [
      [tx0, ty0, z1],
      [tx1, ty0, z1],
      [tx1, ty1, z1],
      [tx0, ty1, z1]
    ];
    pushFrustumFaces(faceList, proj, bot, top, baseHex, strokeHex, strokeW, bias);
  }

  function pushHazardRamp3D(faces, proj, x0, x1, y0, y1, z0, z1, seamCol, stripes = 4) {
    pushTaperedBox3D(faces, proj, x0, x1, y0, y1, x0, x1 * 0.96 + x0 * 0.04, y0 * 0.94 + y1 * 0.06, y1 * 0.94 + y0 * 0.06, z0, z1, '#eab308', seamCol, 1.1, 2);
    const dy = (y1 - y0) / (stripes * 2);
    for (let i = 0; i < stripes; i++) {
      const sy0 = y0 + (i * 2 + 0.4) * dy;
      const sy1 = Math.min(y1, sy0 + dy * 0.95);
      pushBox3D(faces, proj, x0 + (x1 - x0) * 0.12, x1 - (x1 - x0) * 0.08, sy0, sy1, z0 + (z1 - z0) * 0.2, z1 + 0.5, '#1e293b', seamCol, 0.9, 4);
    }
  }

  function pushLatticeTower3D(faces, proj, cx, cy, zBase, zTop, wBase, wTop, col, seamCol) {
    const tiers = 3;
    const dz = (zTop - zBase) / tiers;
    for (let i = 0; i < tiers; i++) {
      const t0 = i / tiers;
      const t1 = (i + 1) / tiers;
      const w0 = wBase + (wTop - wBase) * t0;
      const w1 = wBase + (wTop - wBase) * t1;
      const za = zBase + i * dz;
      const zb = za + dz;
      pushTaperedBox3D(faces, proj, cx - w0, cx + w0, cy - w0, cy + w0, cx - w1, cx + w1, cy - w1, cy + w1, za, zb, col, seamCol, 1.05, 5);
      pushBox3D(faces, proj, cx - w1 * 1.12, cx + w1 * 1.12, cy - w1 * 1.12, cy + w1 * 1.12, zb - dz * 0.14, zb, '#334155', seamCol, 0.95, 6);
    }
  }

  function renderBuildingCompoundBase3D(ctx, faces, proj, r, p, baseCol, hiCol, shCol, houseCol, seamCol, isOctagonal) {
    const FS = p.footprintScale || 1.0;
    const PH = (p.plinthHeight || 1.0) * (p.extrusionDepth || 1.0);
    const W = r * 1.18 * FS;

    // 1. Soft ground shadow on canvas before 3D faces flush
    ctx.fillStyle = 'rgba(20, 17, 14, 0.42)';
    ctx.beginPath();
    ctx.ellipse(4, r * 0.14, W * 1.18, W * 0.64, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. 3D beveled concrete compound plinth with panel joints & curb step
    if (isOctagonal) {
      pushCylinderZ3D(faces, proj, 0, 0, 0, 0.14 * r * PH, W * 1.04, W * 0.95, 8, '#b8ab96', seamCol, 1.02, 1.35);
      pushCylinderZ3D(faces, proj, 0, 0, 0.14 * r * PH, 0.19 * r * PH, W * 0.92, W * 0.89, 8, houseCol, seamCol, 1.08, 1.1);
      pushCylinderZ3D(faces, proj, 0, 0, 0.19 * r * PH, 0.24 * r * PH, W * 0.86, W * 0.84, 8, '#475569', seamCol, 0.95, 1.05);
      // 8 radial sloped concrete buttress ribs around the octagonal perimeter
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const rx = Math.cos(a) * W * 0.88;
        const ry = Math.sin(a) * W * 0.88;
        pushBox3D(faces, proj, rx - 0.08 * r, rx + 0.08 * r, ry - 0.08 * r, ry + 0.08 * r, 0.04 * r * PH, 0.25 * r * PH, shCol, seamCol, 1.0, 1.05);
      }
    } else {
      pushTaperedBox3D(faces, proj, -W, W, -W, W, -W * 0.93, W * 0.93, -W * 0.93, W * 0.93, 0, 0.15 * r * PH, '#b8ab96', seamCol, 1.35);
      // Faction perimeter trim band
      pushBox3D(faces, proj, -W * 0.91, W * 0.91, -W * 0.91, W * 0.91, 0.15 * r * PH, 0.19 * r * PH, houseCol, seamCol, 1.08, 1.05);
      // Inner asphalt/concrete tarmac deck
      pushBox3D(faces, proj, -W * 0.86, W * 0.86, -W * 0.86, W * 0.86, 0.19 * r * PH, 0.23 * r * PH, '#475569', seamCol, 0.95, 1.0);
    }

    // 3. Corner blast bollards & hazard beacons
    if (p.ShowPerimeterWall !== false) {
      const cOff = W * 0.83;
      const corners = [[-cOff, -cOff], [cOff, -cOff], [cOff, cOff], [-cOff, cOff]];
      for (const [cx, cy] of corners) {
        pushTaperedBox3D(faces, proj, cx - 0.10 * r, cx + 0.10 * r, cy - 0.10 * r, cy + 0.10 * r, cx - 0.07 * r, cx + 0.07 * r, cy - 0.07 * r, cy + 0.07 * r, 0.15 * r * PH, 0.34 * r * PH, shCol, seamCol, 1.1, 2);
        if (p.ShowHazardBeacons !== false) {
          pushBox3D(faces, proj, cx - 0.045 * r, cx + 0.045 * r, cy - 0.045 * r, cy + 0.045 * r, 0.34 * r * PH, 0.41 * r * PH, '#fbbf24', seamCol, 1.25, 3);
        }
      }
    }
    return 0.23 * r * PH;
  }

  function renderUsaBuildingModel(ctx, u, faction, params, options) {
    const p = Object.assign({}, BUILDING_DEFAULT_PARAMS, params || {});
    const opts = options || {};
    const defId = u.defId || (u.def && u.def.id) || 'USA_COMMAND_CENTER';
    const r = (u.radius || ((u.def && u.def.size) ? u.def.size * 0.46 : 36)) * (p.footprintScale || 1.0);
    const H = (p.structureHeight || 1.0) * (p.extrusionDepth || 1.0);
    const SS = p.superstructureScale || 1.0;
    const TS = p.turretScale || 1.0;
    const BL = p.barrelLength || 1.0;
    const RS = p.radarScale || 1.0;
    const t = (typeof performance !== 'undefined' ? performance.now() * 0.001 : 0) + (u.treadPhase || 0) * 6.0;
    const baseAngle = (u.angle !== undefined ? u.angle : 0.68);
    const turretAngle = (u.turretAngle !== undefined ? u.turretAngle : baseAngle);
    const recoil = (u.recoilOffset || 0) * 0.05 * r;
    const pitchScale = opts.pitchScale !== undefined ? opts.pitchScale : 0.64;
    const zScale = opts.zScale !== undefined ? opts.zScale : 0.78;

    const baseCol = p.armorBaseColor || '#cbd5e1';
    const hiCol = p.armorHighlightColor || '#f1f5f9';
    const shCol = p.armorShadowColor || '#64748b';
    const houseCol = (faction && faction.color) || p.houseColor || '#2563eb';
    const seamCol = '#2b241f';

    const proj = createProjector(baseAngle, pitchScale, zScale);
    const faces = [];

    if (defId === 'USA_COMMAND_CENTER') {
      // Authentic Ligne-Claire 3D Sculpture matching assets/diorama/buildings/usa_command_center.png:
      // Warm putty-concrete sloped fortress hull with chamfered corners, dual slate-navy wrap bands,
      // Front-Left (+Y) projecting Dozer portal with recessed shutter, Front-Right (+X) elevated Command Garage Bastion
      // with inverted triangle chevron, recessed rooftop terrace, central chamfered octagonal citadel + 360° blue-glass
      // observation bridge + airlock doorway, open-truss steel microwave tower, and 3 true 3D concave parabolic dishes.
      const ccAngle = (u.angle !== undefined && Math.abs(u.angle - 0.68) > 0.01) ? u.angle : 0.75;
      const ccProj = createProjector(ccAngle, pitchScale, zScale);
      const R = r * 1.16 * SS;
      const wallCol = (p.armorBaseColor && p.armorBaseColor !== '#cbd5e1') ? p.armorBaseColor : '#d6d0c4';
      const roofCol = (p.armorHighlightColor && p.armorHighlightColor !== '#f1f5f9') ? p.armorHighlightColor : '#e6e1d6';
      const darkWallCol = (p.armorShadowColor && p.armorShadowColor !== '#64748b') ? p.armorShadowColor : '#9c968b';
      const navyCol = (p.houseColor && p.houseColor !== '#2563eb') ? p.houseColor : '#485b80';
      const zDeck = 0.50 * R * H;
      const zBastion = 0.63 * R * H;

      // Helper: Interpolate between two 3D polygon loops [zFull0 -> zFull1] at slice [zA -> zB]
      const pushLoopSlice3D = (loopBot, loopTop, zFull0, zFull1, zA, zB, col, strokeW = 1.2, bias = 0) => {
        const f0 = (zA - zFull0) / (zFull1 - zFull0);
        const f1 = (zB - zFull0) / (zFull1 - zFull0);
        const sliceBot = loopBot.map((p0, idx) => {
          const p1 = loopTop[idx];
          return [lerp(p0[0], p1[0], f0), lerp(p0[1], p1[1], f0), zA];
        });
        const sliceTop = loopBot.map((p0, idx) => {
          const p1 = loopTop[idx];
          return [lerp(p0[0], p1[0], f1), lerp(p0[1], p1[1], f1), zB];
        });
        pushFrustumFaces(faces, ccProj, sliceBot, sliceTop, col, seamCol, strokeW, bias);
      };

      // Helper: Push a true 3D Circular Parabolic Satellite Dish with rear housing, concave bowl, rim & 3-strut feed-horn tripod
      const pushParabolicDish3D = (dx, dy, dz, dishRad, aimAng, aspect = 0.62, hasTripod = true, bias = 8) => {
        const dCenter = ccProj.project(dx, dy, dz);
        faces.push({
          depth: dCenter.depth + bias,
          customDraw(c) {
            const cx = dCenter.x;
            const cy = dCenter.y;
            const nx = Math.cos(aimAng);
            const ny = Math.sin(aimAng);
            const ux = -Math.sin(aimAng);
            const uy = Math.cos(aimAng);

            const ptDish = (rho, theta, h) => {
              const st = Math.sin(theta);
              const ct = Math.cos(theta);
              const alongU = rho * st;
              const alongN = h + rho * ct * aspect;
              return {
                x: cx + alongU * ux + alongN * nx,
                y: cy + alongU * uy + alongN * ny
              };
            };

            const N = 24;
            const backPts = [];
            const rimPts = [];
            const innerPts = [];
            const hubPts = [];
            for (let i = 0; i < N; i++) {
              const a = (i / N) * Math.PI * 2;
              backPts.push(ptDish(dishRad * 0.72, a, -dishRad * 0.26));
              rimPts.push(ptDish(dishRad, a, 0));
              innerPts.push(ptDish(dishRad * 0.90, a, -dishRad * 0.04));
              hubPts.push(ptDish(dishRad * 0.18, a, -dishRad * 0.08));
            }

            // 1. Rear curved metallic housing behind the dish rim
            const hullPts = [];
            for (let i = 0; i <= N / 2; i++) {
              const a = Math.PI * 0.5 + (i / (N / 2)) * Math.PI;
              hullPts.push(ptDish(dishRad, a, 0));
            }
            for (let i = N / 2; i >= 0; i--) {
              const a = Math.PI * 0.5 + (i / (N / 2)) * Math.PI;
              hullPts.push(ptDish(dishRad * 0.76, a, -dishRad * 0.28));
            }
            drawPolyPts(c, hullPts, '#8f9aa8', seamCol, 1.3 * activeStrokeScale);

            // 2. Outer Dish Beveled Rim Ring
            drawPolyPts(c, rimPts, '#d0d6de', seamCol, 1.45 * activeStrokeScale);

            // 3. Concave Reflector Bowl Interior
            drawPolyPts(c, innerPts, '#e3e8ef', seamCol, 1.15 * activeStrokeScale);

            // 4. Shaded Crescent inside Reflector Bowl + Subtle Radial Ribs
            const crescPts = [];
            for (let i = 0; i <= 12; i++) {
              const a = Math.PI * 0.55 + (i / 12) * Math.PI * 0.90;
              crescPts.push(ptDish(dishRad * 0.88, a, -dishRad * 0.04));
            }
            for (let i = 12; i >= 0; i--) {
              const a = Math.PI * 0.55 + (i / 12) * Math.PI * 0.90;
              crescPts.push(ptDish(dishRad * 0.46, a, -dishRad * 0.08));
            }
            drawPolyPts(c, crescPts, '#bcc5d1', null, 0);

            for (const ra of [-2.4, -1.2, 0.0, 1.2, 2.4]) {
              const pIn = ptDish(dishRad * 0.18, ra, -dishRad * 0.08);
              const pOut = ptDish(dishRad * 0.89, ra, -dishRad * 0.04);
              c.strokeStyle = 'rgba(43, 36, 31, 0.28)';
              c.lineWidth = 0.85 * activeStrokeScale;
              c.beginPath();
              c.moveTo(pIn.x, pIn.y);
              c.lineTo(pOut.x, pOut.y);
              c.stroke();
            }

            // 5. Central Reflector Hub Cap
            drawPolyPts(c, hubPts, '#949ca8', seamCol, 1.15 * activeStrokeScale);

            // 6. Tripod Feed-Horn Struts & Receiver Capsule
            if (hasTripod) {
              const hornBase = ptDish(0, 0, dishRad * 0.58);
              const hornTip = ptDish(0, 0, dishRad * 0.78);
              const strutFeet = [
                ptDish(dishRad * 0.76, -1.22, -dishRad * 0.03),
                ptDish(dishRad * 0.76, 1.22, -dishRad * 0.03),
                ptDish(dishRad * 0.05, 3.14, -dishRad * 0.08)
              ];
              for (const foot of strutFeet) {
                c.fillStyle = '#949ca8';
                c.strokeStyle = seamCol;
                c.lineWidth = 1.0 * activeStrokeScale;
                c.beginPath();
                c.arc(foot.x, foot.y, Math.max(1.4, dishRad * 0.065), 0, Math.PI * 2);
                c.fill();
                c.stroke();

                c.lineCap = 'round';
                c.strokeStyle = seamCol;
                c.lineWidth = Math.max(2.2, dishRad * 0.12) * activeStrokeScale;
                c.beginPath();
                c.moveTo(foot.x, foot.y);
                c.lineTo(hornBase.x, hornBase.y);
                c.stroke();

                c.strokeStyle = '#d8dee6';
                c.lineWidth = Math.max(1.0, dishRad * 0.05) * activeStrokeScale;
                c.beginPath();
                c.moveTo(foot.x, foot.y);
                c.lineTo(hornBase.x, hornBase.y);
                c.stroke();
              }

              // Receiver capsule cylinder at focal point
              c.lineCap = 'round';
              c.strokeStyle = seamCol;
              c.lineWidth = Math.max(3.4, dishRad * 0.22) * activeStrokeScale;
              c.beginPath();
              c.moveTo(hornBase.x, hornBase.y);
              c.lineTo(hornTip.x, hornTip.y);
              c.stroke();

              c.strokeStyle = '#94a3b8';
              c.lineWidth = Math.max(1.8, dishRad * 0.11) * activeStrokeScale;
              c.beginPath();
              c.moveTo(hornBase.x, hornBase.y);
              c.lineTo(hornTip.x, hornTip.y);
              c.stroke();
            } else {
              // Short central feed-horn pin (for small tower-top dish)
              const pinTip = ptDish(0, 0, dishRad * 0.24);
              c.lineCap = 'round';
              c.strokeStyle = seamCol;
              c.lineWidth = 2.5 * activeStrokeScale;
              c.beginPath();
              c.moveTo(cx, cy);
              c.lineTo(pinTip.x, pinTip.y);
              c.stroke();
              c.strokeStyle = '#cbd5e1';
              c.lineWidth = 1.15 * activeStrokeScale;
              c.beginPath();
              c.moveTo(cx, cy);
              c.lineTo(pinTip.x, pinTip.y);
              c.stroke();
            }
          }
        });
      };

      // Helper: Draw a closed 3D polygon panel outline / filled decal on a sloped surface
      const drawPanel3D = (c, pts3D, fillCol, strokeCol = seamCol, lineW = 1.0) => {
        const pts2D = pts3D.map(([x, y, z]) => ccProj.project(x, y, z));
        drawPolyPts(c, pts2D, fillCol, strokeCol, lineW * activeStrokeScale);
      };

      // 1. Soft Contoured Ground Apron & Drop Shadow under the Command Center Footprint
      ctx.fillStyle = 'rgba(20, 17, 14, 0.34)';
      ctx.beginPath();
      ctx.ellipse(2, R * 0.09, R * 1.25, R * 0.68, 0, 0, Math.PI * 2);
      ctx.fill();

      // 2. Main Sloped Fortress Bunker Hull with Chamfered Corners & Dual Slate-Navy Wrap Bands
      const bx0 = -0.95 * R, bx1 = 0.85 * R, by0 = -0.92 * R, by1 = 0.95 * R;
      const tx0 = -0.80 * R, tx1 = 0.72 * R, ty0 = -0.78 * R, ty1 = 0.80 * R;
      const makeMainHullLoop = (x0, x1, y0, y1, ch, chFront, z) => [
        [x0 + ch, y0, z],
        [x1 - ch, y0, z],
        [x1, y0 + ch, z],
        [x1, y1 - chFront, z],
        [x1 - chFront, y1, z],
        [x0 + ch, y1, z],
        [x0, y1 - ch, z],
        [x0, y0 + ch, z]
      ];
      const hullBot = makeMainHullLoop(bx0, bx1, by0, by1, 0.13 * R, 0.22 * R, 0);
      const hullTop = makeMainHullLoop(tx0, tx1, ty0, ty1, 0.11 * R, 0.18 * R, zDeck);
      pushLoopSlice3D(hullBot, hullTop, 0, zDeck, 0, 0.085 * R * H, navyCol, 1.25, 0);
      pushLoopSlice3D(hullBot, hullTop, 0, zDeck, 0.085 * R * H, 0.31 * R * H, wallCol, 1.25, 0.1);
      pushLoopSlice3D(hullBot, hullTop, 0, zDeck, 0.31 * R * H, 0.395 * R * H, navyCol, 1.2, 0.2);
      pushLoopSlice3D(hullBot, hullTop, 0, zDeck, 0.395 * R * H, zDeck, wallCol, 1.25, 0.3);

      // Recessed Rooftop Concrete Terrace + Raised Perimeter Parapet Curbs
      pushFrustumFaces(faces, ccProj,
        makeMainHullLoop(tx0 + 0.05 * R, tx1 - 0.05 * R, ty0 + 0.05 * R, ty1 - 0.05 * R, 0.09 * R, 0.15 * R, zDeck - 0.01 * R * H),
        makeMainHullLoop(tx0 + 0.05 * R, tx1 - 0.05 * R, ty0 + 0.05 * R, ty1 - 0.05 * R, 0.09 * R, 0.15 * R, zDeck + 0.01 * R * H),
        roofCol, seamCol, 1.0, 0.45
      );
      const pw = 0.068 * R;
      const zParapet = zDeck + 0.075 * R * H;
      // Back-Left (-X), Back-Right (-Y), Front-Left (+Y), and Front-Right (+X back section) parapet curbs
      pushBox3D(faces, ccProj, tx0, tx0 + pw, ty0 + 0.08 * R, ty1 - 0.08 * R, zDeck, zParapet, roofCol, seamCol, 1.15, 0.6);
      pushBox3D(faces, ccProj, tx0 + 0.08 * R, tx1 - 0.08 * R, ty0, ty0 + pw, zDeck, zParapet, roofCol, seamCol, 1.15, 0.6);
      pushBox3D(faces, ccProj, tx0 + 0.08 * R, tx1 - 0.16 * R, ty1 - pw, ty1, zDeck, zParapet, roofCol, seamCol, 1.15, 0.72);
      pushBox3D(faces, ccProj, tx1 - pw, tx1, ty0 + 0.08 * R, -0.26 * R, zDeck, zParapet, roofCol, seamCol, 1.15, 0.65);

      // Subtle concrete slab expansion joints on the rooftop deck
      const deckGridDepth = ccProj.project(0, 0, zDeck + 0.015 * R * H).depth + 0.48;
      faces.push({
        depth: deckGridDepth,
        customDraw(c) {
          const gridCol = 'rgba(43, 36, 31, 0.18)';
          for (const gx of [-0.42 * R, -0.06 * R, 0.30 * R]) {
            drawLine3D(c, ccProj, gx, ty0 + pw, zDeck + 0.012 * R * H, gx, ty1 - pw, zDeck + 0.012 * R * H, gridCol, 0.9);
          }
          for (const gy of [-0.38 * R, 0.02 * R, 0.42 * R]) {
            drawLine3D(c, ccProj, tx0 + pw, gy, zDeck + 0.012 * R * H, tx1 - pw, gy, zDeck + 0.012 * R * H, gridCol, 0.9);
          }
        }
      });

      // 3. Front-Left (+Y) Projecting Dozer Garage Portal with Seamless Monolithic Inverted-U Frame, Recessed Bay & Hazard Ramp
      const flX0 = -0.58 * R, flX1 = 0.08 * R;
      const bay1X0 = flX0 + 0.095 * R, bay1X1 = flX1 - 0.095 * R;
      const flZDoor = 0.24 * R * H, flZTop = 0.32 * R * H;
      const yWallAtZ = (z) => lerp(by1 - 0.015 * R, ty1 - 0.015 * R, z / zDeck);
      const yPortalFrontAtZ = (z) => yWallAtZ(z) + 0.105 * R;
      const flYBase = yPortalFrontAtZ(0);
      const portal1Depth = ccProj.project(0.08 * R, flYBase, flZTop).depth + 4.0;
      faces.push({
        depth: portal1Depth,
        customDraw(c) {
          const xL0 = flX0, xL1 = flX0 + 0.025 * R;
          const xR0 = flX1, xR1 = flX1 - 0.025 * R;
          const yIn0 = yWallAtZ(0) + 0.01 * R;
          const yInDoor = yWallAtZ(flZDoor) + 0.01 * R;
          const yShut = (z) => yPortalFrontAtZ(z) - 0.042 * R;

          // 1. Dark recessed bay interior back wall & concrete floor
          drawPanel3D(c, [
            [bay1X0, yIn0, 0],
            [bay1X1, yIn0, 0],
            [bay1X1, yInDoor, flZDoor],
            [bay1X0, yInDoor, flZDoor]
          ], '#353b44', seamCol, 1.0);
          drawPanel3D(c, [
            [bay1X0, yIn0, 0.008 * R * H],
            [bay1X1, yIn0, 0.008 * R * H],
            [bay1X1, flYBase - 0.015 * R, 0.008 * R * H],
            [bay1X0, flYBase - 0.015 * R, 0.008 * R * H]
          ], '#58606d', seamCol, 0.95);

          // 2. Inner right-facing jamb wall of the left pier (x = bay1X0)
          drawPanel3D(c, [
            [bay1X0, yWallAtZ(0), 0],
            [bay1X0, yPortalFrontAtZ(0), 0],
            [bay1X0, yPortalFrontAtZ(flZDoor), flZDoor],
            [bay1X0, yWallAtZ(flZDoor), flZDoor]
          ], shadeHex(wallCol, 0.74), seamCol, 1.15);

          // 3. Recessed horizontal-ribbed steel roll-up shutter door inside upper part of bay 1
          const zShut0 = 0.115 * R * H;
          drawPanel3D(c, [
            [bay1X0, yShut(zShut0), zShut0],
            [bay1X1, yShut(zShut0), zShut0],
            [bay1X1, yShut(flZDoor), flZDoor],
            [bay1X0, yShut(flZDoor), flZDoor]
          ], '#8f98a6', seamCol, 1.1);
          for (const sz of [0.145 * R * H, 0.178 * R * H, 0.210 * R * H]) {
            drawLine3D(c, ccProj, bay1X0 + 0.005 * R, yShut(sz), sz, bay1X1 - 0.005 * R, yShut(sz), sz, seamCol, 0.95 * activeStrokeScale);
          }

          // 4. Yellow & black 5-stripe hazard threshold ramp at ground level of bay 1
          const ramp1Y0 = flYBase - 0.062 * R, ramp1Y1 = flYBase + 0.006 * R, ramp1Z = 0.036 * R * H;
          drawPanel3D(c, [[bay1X0, ramp1Y0, ramp1Z], [bay1X1, ramp1Y0, ramp1Z], [bay1X1, ramp1Y1, ramp1Z], [bay1X0, ramp1Y1, ramp1Z]], '#eab308', seamCol, 1.05);
          drawPanel3D(c, [[bay1X0, ramp1Y1, 0], [bay1X1, ramp1Y1, 0], [bay1X1, ramp1Y1, ramp1Z], [bay1X0, ramp1Y1, ramp1Z]], '#ca8a04', seamCol, 1.05);
          drawPanel3D(c, [[bay1X1, ramp1Y0, 0], [bay1X1, ramp1Y1, 0], [bay1X1, ramp1Y1, ramp1Z], [bay1X1, ramp1Y0, ramp1Z]], '#a16207', seamCol, 1.0);
          const span = bay1X1 - bay1X0;
          for (let sIdx = 0; sIdx < 5; sIdx++) {
            const sx0 = bay1X0 + (sIdx * 2 + 0.45) * (span / 10);
            const sx1 = sx0 + span / 10.5;
            drawPanel3D(c, [[sx0, ramp1Y0, ramp1Z], [sx1, ramp1Y0, ramp1Z], [sx1, ramp1Y1, ramp1Z], [sx0, ramp1Y1, ramp1Z]], '#231f20', seamCol, 0.7);
            drawPanel3D(c, [[sx0, ramp1Y1, 0], [sx1, ramp1Y1, 0], [sx1, ramp1Y1, ramp1Z], [sx0, ramp1Y1, ramp1Z]], '#181516', seamCol, 0.7);
          }

          // 5. Top sloped roof ledge of the portal frame (z = flZTop)
          drawPanel3D(c, [
            [xL1, yWallAtZ(flZTop), flZTop],
            [xR1, yWallAtZ(flZTop), flZTop],
            [xR1, yPortalFrontAtZ(flZTop), flZTop],
            [xL1, yPortalFrontAtZ(flZTop), flZTop]
          ], shadeHex(roofCol, 1.04), seamCol, 1.2);

          // 6. Outer right-facing side cheek of the right pier (x = xR0 -> xR1)
          drawPanel3D(c, [
            [xR0, yWallAtZ(0), 0],
            [xR1, yWallAtZ(flZTop), flZTop],
            [xR1, yPortalFrontAtZ(flZTop), flZTop],
            [xR0, yPortalFrontAtZ(0), 0]
          ], shadeHex(wallCol, 0.78), seamCol, 1.2);

          // 7. Monolithic Inverted-U (∩) front face of the portal frame
          drawPanel3D(c, [
            [xL0, yPortalFrontAtZ(0), 0],
            [xL1, yPortalFrontAtZ(flZTop), flZTop],
            [xR1, yPortalFrontAtZ(flZTop), flZTop],
            [xR0, yPortalFrontAtZ(0), 0],
            [bay1X1, yPortalFrontAtZ(0), 0],
            [bay1X1, yPortalFrontAtZ(flZDoor), flZDoor],
            [bay1X0, yPortalFrontAtZ(flZDoor), flZDoor],
            [bay1X0, yPortalFrontAtZ(0), 0]
          ], shadeHex(wallCol, ccProj.shadeNormal(0, 0.96, 0.28)), seamCol, 1.25);
        }
      });

      // 4. Front-Right (+X) Elevated Command Gatehouse Bastion with Sunken U-Parapet Terrace, Chevron & Recessed Bay 2
      const frY0 = -0.30 * R, frY1 = 0.56 * R;
      const bay2Y0 = -0.12 * R, bay2Y1 = 0.38 * R;
      const frXBack = 0.56 * R, frXBase = 1.03 * R, frXTop = 0.88 * R;
      const frZDoor = 0.35 * R * H;
      const xBastAtZ = (z) => lerp(frXBase, frXTop, z / zBastion);

      // Recessed dark vehicle bay 2 interior floor & back wall (drawn behind bastion piers)
      pushBox3D(faces, ccProj, frXBack + 0.14 * R, frXBase - 0.08 * R, bay2Y0, bay2Y1, 0.015 * R * H, frZDoor, '#484f59', seamCol, 1.0, 1.35);
      pushBox3D(faces, ccProj, frXBack + 0.16 * R, frXBase - 0.06 * R, bay2Y0, bay2Y1, 0.005 * R * H, 0.032 * R * H, '#68707d', seamCol, 0.9, 1.42);
      // Recessed horizontal-ribbed steel roll-up shutter door inside upper part of bay 2
      pushBox3D(faces, ccProj, frXBase - 0.15 * R, frXBase - 0.085 * R, bay2Y0, bay2Y1, 0.20 * R * H, frZDoor, '#949ca6', seamCol, 1.1, 1.5);
      faces.push({
        depth: ccProj.project(frXBase - 0.08 * R, (bay2Y0 + bay2Y1) * 0.5, 0.27 * R * H).depth + 1.58,
        customDraw(c) {
          for (const sz of [0.24 * R * H, 0.28 * R * H, 0.32 * R * H]) {
            drawLine3D(c, ccProj, frXBase - 0.082 * R, bay2Y0 + 0.01 * R, sz, frXBase - 0.082 * R, bay2Y1 - 0.01 * R, sz, seamCol, 1.0 * activeStrokeScale);
          }
        }
      });
      // Yellow & black striped hazard threshold ramp at ground level of bay 2
      const ramp2X0 = frXBase - 0.08 * R, ramp2X1 = frXBase + 0.008 * R, ramp2Z = 0.038 * R * H;
      pushBox3D(faces, ccProj, ramp2X0, ramp2X1, bay2Y0, bay2Y1, 0, ramp2Z, '#eab308', seamCol, 1.1, 1.65);
      const ramp2StripeDepth = ccProj.project(ramp2X1, (bay2Y0 + bay2Y1) * 0.5, ramp2Z).depth + 1.72;
      faces.push({
        depth: ramp2StripeDepth,
        customDraw(c) {
          const span = bay2Y1 - bay2Y0;
          for (let sIdx = 0; sIdx < 5; sIdx++) {
            const sy0 = bay2Y0 + (sIdx * 2 + 0.45) * (span / 10);
            const sy1 = sy0 + span / 10.5;
            // Top face of black hazard stripe
            drawPanel3D(c, [[ramp2X0, sy0, ramp2Z], [ramp2X1, sy0, ramp2Z], [ramp2X1, sy1, ramp2Z], [ramp2X0, sy1, ramp2Z]], '#231f20', seamCol, 0.7);
            // Front (+X) face of black hazard stripe
            drawPanel3D(c, [[ramp2X1, sy0, 0], [ramp2X1, sy1, 0], [ramp2X1, sy1, ramp2Z], [ramp2X1, sy0, ramp2Z]], '#181516', seamCol, 0.7);
          }
        }
      });

      // Left (+Y side) and Right (-Y side) Sloped Bastion Piers flanking Bay 2 (with lower navy wrap band)
      const makePierLoop = (x0, x1, y0, y1, chLeft, chRight, z) => [
        [x0, y0, z],
        [x1 - chRight, y0, z],
        [x1, y0 + chRight, z],
        [x1, y1 - chLeft, z],
        [x1 - chLeft, y1, z],
        [x0, y1, z]
      ];
      // Right/Back Pier (frY0 to bay2Y0)
      const rPierBot = makePierLoop(frXBack, frXBase, frY0, bay2Y0, 0, 0.09 * R, 0);
      const rPierTop = makePierLoop(frXBack, xBastAtZ(frZDoor), frY0 + 0.02 * R, bay2Y0, 0, 0.08 * R, frZDoor);
      pushLoopSlice3D(rPierBot, rPierTop, 0, frZDoor, 0, 0.085 * R * H, navyCol, 1.2, 1.8);
      pushLoopSlice3D(rPierBot, rPierTop, 0, frZDoor, 0.085 * R * H, frZDoor, wallCol, 1.2, 1.85);
      // Left/Front Pier (bay2Y1 to frY1)
      const lPierBot = makePierLoop(frXBack, frXBase, bay2Y1, frY1, 0.09 * R, 0, 0);
      const lPierTop = makePierLoop(frXBack, xBastAtZ(frZDoor), bay2Y1, frY1 - 0.02 * R, 0.08 * R, 0, frZDoor);
      pushLoopSlice3D(lPierBot, lPierTop, 0, frZDoor, 0, 0.085 * R * H, navyCol, 1.2, 1.9);
      pushLoopSlice3D(lPierBot, lPierTop, 0, frZDoor, 0.085 * R * H, frZDoor, wallCol, 1.2, 1.95);

      // Upper Continuous Command Bastion Lintel [frZDoor -> zDeck + 0.02*R*H] with Upper Navy Band & Sunken Terrace Deck
      const zBastDeck = zDeck + 0.02 * R * H;
      const bastLintelBot = makePierLoop(frXBack, xBastAtZ(frZDoor), frY0 + 0.02 * R, frY1 - 0.02 * R, 0.08 * R, 0.08 * R, frZDoor);
      const bastLintelMid = makePierLoop(frXBack, xBastAtZ(zBastDeck), frY0 + 0.03 * R, frY1 - 0.03 * R, 0.075 * R, 0.075 * R, zBastDeck);
      pushLoopSlice3D(bastLintelBot, bastLintelMid, frZDoor, zBastDeck, frZDoor, 0.40 * R * H, wallCol, 1.2, 2.05);
      pushLoopSlice3D(bastLintelBot, bastLintelMid, frZDoor, zBastDeck, 0.40 * R * H, 0.485 * R * H, navyCol, 1.2, 2.1);
      pushLoopSlice3D(bastLintelBot, bastLintelMid, frZDoor, zBastDeck, 0.485 * R * H, zBastDeck, roofCol, 1.2, 2.15);

      // Raised U-Shaped Gatehouse Bastion Parapet Wall [zBastDeck -> zBastion] around the Sunken Front-Right Terrace
      const zBastWallTop = zBastion + 0.04 * R * H;
      // Front sloped bastion wall (+X edge)
      const fwBot = makePierLoop(xBastAtZ(zBastDeck) - 0.09 * R, xBastAtZ(zBastDeck), frY0 + 0.03 * R, frY1 - 0.03 * R, 0.075 * R, 0.075 * R, zBastDeck);
      const fwTop = makePierLoop(frXTop - 0.09 * R, frXTop, frY0 + 0.04 * R, frY1 - 0.04 * R, 0.07 * R, 0.07 * R, zBastWallTop);
      pushLoopSlice3D(fwBot, fwTop, zBastDeck, zBastWallTop, zBastDeck, zBastWallTop, roofCol, 1.2, 2.25);
      // Right return arm (-Y edge of U-parapet) and Left return arm (+Y edge of U-parapet)
      pushBox3D(faces, ccProj, frXBack + 0.02 * R, frXTop - 0.06 * R, frY0 + 0.035 * R, frY0 + 0.035 * R + pw, zBastDeck, zBastWallTop, roofCol, seamCol, 1.15, 2.22);
      pushBox3D(faces, ccProj, frXBack + 0.02 * R, frXTop - 0.06 * R, frY1 - 0.035 * R - pw, frY1 - 0.035 * R, zBastDeck, zBastWallTop, roofCol, seamCol, 1.15, 2.28);

      // Inverted Blue Triangle US Command Chevron Emblem (▼) centered above Front-Right Garage Bay
      if (p.ShowFactionEmblem !== false) {
        const embY = (bay2Y0 + bay2Y1) * 0.5;
        const embDepth = ccProj.project(frXBase, embY, zBastWallTop).depth + 3.0;
        faces.push({
          depth: embDepth,
          customDraw(c) {
            const xTop = xBastAtZ(0.56 * R * H) + 0.012 * R;
            const xBot = xBastAtZ(0.40 * R * H) + 0.012 * R;
            const pL = ccProj.project(xTop, embY + 0.14 * R, 0.56 * R * H);
            const pR = ccProj.project(xTop, embY - 0.14 * R, 0.56 * R * H);
            const pB = ccProj.project(xBot, embY, 0.40 * R * H);
            drawPolyPts(c, [pL, pR, pB], '#cbd5e1', seamCol, 1.25 * activeStrokeScale);
            const iL = ccProj.project(xTop + 0.002 * R, embY + 0.098 * R, 0.54 * R * H);
            const iR = ccProj.project(xTop + 0.002 * R, embY - 0.098 * R, 0.54 * R * H);
            const iB = ccProj.project(xBot + 0.002 * R, embY, 0.43 * R * H);
            drawPolyPts(c, [iL, iR, iB], navyCol, seamCol, 0.9 * activeStrokeScale);
          }
        });
      }

      // 5. Central Chamfered Octagonal Command Citadel & 360° Blue-Glass Observation Tower
      const tcx = -0.05 * R, tcy = -0.06 * R;
      const makeOctLoop = (rx, ry, ch, z) => [
        [tcx - rx + ch, tcy - ry, z],
        [tcx + rx - ch, tcy - ry, z],
        [tcx + rx, tcy - ry + ch, z],
        [tcx + rx, tcy + ry - ch, z],
        [tcx + rx - ch, tcy + ry, z],
        [tcx - rx + ch, tcy + ry, z],
        [tcx - rx, tcy + ry - ch, z],
        [tcx - rx, tcy - ry + ch, z]
      ];
      const zCit0 = zDeck;
      const zCitBand0 = zDeck + 0.25 * R * H;
      const zCitBand1 = zDeck + 0.33 * R * H;
      const zCitTop = zDeck + 0.47 * R * H;
      const citBot = makeOctLoop(0.39 * R, 0.39 * R, 0.11 * R, zCit0);
      const citTop = makeOctLoop(0.30 * R, 0.30 * R, 0.085 * R, zCitTop);
      pushLoopSlice3D(citBot, citTop, zCit0, zCitTop, zCit0, zCitBand0, wallCol, 1.2, 2.6);
      pushLoopSlice3D(citBot, citTop, zCit0, zCitTop, zCitBand0, zCitBand1, navyCol, 1.15, 2.75);
      pushLoopSlice3D(citBot, citTop, zCit0, zCitTop, zCitBand1, zCitTop, wallCol, 1.15, 2.85);

      // Etched armor relief panels on upper citadel walls + access door on right citadel wall
      const citPanelDepth = ccProj.project(tcx + 0.32 * R, tcy + 0.32 * R, zCitBand1 + 0.05 * R * H).depth + 2.95;
      faces.push({
        depth: citPanelDepth,
        customDraw(c) {
          // Upper-left (+Y) blast shutter relief panel above navy stripe
          drawPanel3D(c, [
            [tcx - 0.16 * R, tcy + 0.325 * R, zCitBand1 + 0.03 * R * H],
            [tcx + 0.14 * R, tcy + 0.325 * R, zCitBand1 + 0.03 * R * H],
            [tcx + 0.13 * R, tcy + 0.305 * R, zCitTop - 0.025 * R * H],
            [tcx - 0.15 * R, tcy + 0.305 * R, zCitTop - 0.025 * R * H]
          ], null, 'rgba(43, 36, 31, 0.55)', 0.95);
          // Upper-right (+X) blast shutter relief panel above navy stripe
          drawPanel3D(c, [
            [tcx + 0.325 * R, tcy + 0.14 * R, zCitBand1 + 0.03 * R * H],
            [tcx + 0.325 * R, tcy - 0.16 * R, zCitBand1 + 0.03 * R * H],
            [tcx + 0.305 * R, tcy - 0.15 * R, zCitTop - 0.025 * R * H],
            [tcx + 0.305 * R, tcy + 0.13 * R, zCitTop - 0.025 * R * H]
          ], null, 'rgba(43, 36, 31, 0.55)', 0.95);
          // Lower-right (+X) flush personnel door etched on right sloped wall
          drawPanel3D(c, [
            [tcx + 0.382 * R, tcy + 0.06 * R, zCit0 + 0.01 * R * H],
            [tcx + 0.382 * R, tcy - 0.08 * R, zCit0 + 0.01 * R * H],
            [tcx + 0.352 * R, tcy - 0.075 * R, zCit0 + 0.18 * R * H],
            [tcx + 0.352 * R, tcy + 0.055 * R, zCit0 + 0.18 * R * H]
          ], null, 'rgba(43, 36, 31, 0.60)', 0.95);
        }
      });

      // Protruding Front-Left (+Y) Blast Doorway Airlock on Central Citadel Base
      pushTaperedBox3D(faces, ccProj, tcx - 0.13 * R, tcx + 0.11 * R, tcy + 0.34 * R, tcy + 0.44 * R, tcx - 0.11 * R, tcx + 0.09 * R, tcy + 0.32 * R, tcy + 0.41 * R, zCit0, zCit0 + 0.21 * R * H, roofCol, seamCol, 1.15, 3.1);
      pushBox3D(faces, ccProj, tcx - 0.08 * R, tcx + 0.06 * R, tcy + 0.37 * R, tcy + 0.442 * R, zCit0 + 0.01 * R * H, zCit0 + 0.165 * R * H, '#7c8b99', seamCol, 1.0, 3.25);
      // Small utility junction box at bottom-front corner of citadel
      pushBox3D(faces, ccProj, tcx + 0.21 * R, tcx + 0.28 * R, tcy + 0.31 * R, tcy + 0.38 * R, zCit0, zCit0 + 0.09 * R * H, darkWallCol, seamCol, 1.0, 3.2);

      // Upper Overhanging Blue-Glass Observation Control Room
      const zGlass0 = zCitTop;
      const zGlassSill = zCitTop + 0.045 * R * H;
      const zGlassTop = zCitTop + 0.21 * R * H;
      const zRoofCap = zCitTop + 0.30 * R * H;
      pushFrustumFaces(faces, ccProj,
        makeOctLoop(0.31 * R, 0.31 * R, 0.07 * R, zGlass0),
        makeOctLoop(0.33 * R, 0.33 * R, 0.075 * R, zGlassSill),
        '#2b5b84', seamCol, 1.15, 3.4
      );
      pushFrustumFaces(faces, ccProj,
        makeOctLoop(0.33 * R, 0.33 * R, 0.075 * R, zGlassSill),
        makeOctLoop(0.365 * R, 0.365 * R, 0.08 * R, zGlassTop),
        '#3b9bd9', seamCol, 1.2, 3.55
      );
      // Window mullions & white diagonal reflection slashes on the observation bridge
      const glassDetailDepth = ccProj.project(tcx + 0.25 * R, tcy + 0.25 * R, zGlassTop).depth + 3.68;
      faces.push({
        depth: glassDetailDepth,
        customDraw(c) {
          for (const mx of [tcx - 0.10 * R, tcx + 0.10 * R]) {
            drawLine3D(c, ccProj, mx, tcy + 0.33 * R, zGlassSill, mx, tcy + 0.365 * R, zGlassTop, seamCol, 1.2 * activeStrokeScale);
          }
          for (const my of [tcy - 0.10 * R, tcy + 0.10 * R]) {
            drawLine3D(c, ccProj, tcx + 0.33 * R, my, zGlassSill, tcx + 0.365 * R, my, zGlassTop, seamCol, 1.2 * activeStrokeScale);
          }
          drawLine3D(c, ccProj, tcx - 0.20 * R, tcy + 0.34 * R, zGlassSill + 0.03 * R * H, tcx - 0.13 * R, tcy + 0.36 * R, zGlassTop - 0.02 * R * H, 'rgba(255,255,255,0.72)', 1.3);
          drawLine3D(c, ccProj, tcx + 0.34 * R, tcy + 0.20 * R, zGlassSill + 0.03 * R * H, tcx + 0.36 * R, tcy + 0.13 * R, zGlassTop - 0.02 * R * H, 'rgba(255,255,255,0.65)', 1.3);
        }
      });

      // Beveled Concrete Tower Roof Cornice & Recessed Roof Tray
      pushFrustumFaces(faces, ccProj,
        makeOctLoop(0.38 * R, 0.38 * R, 0.08 * R, zGlassTop),
        makeOctLoop(0.37 * R, 0.37 * R, 0.08 * R, zRoofCap),
        roofCol, seamCol, 1.25, 3.8
      );
      pushFrustumFaces(faces, ccProj,
        makeOctLoop(0.305 * R, 0.305 * R, 0.06 * R, zRoofCap),
        makeOctLoop(0.305 * R, 0.305 * R, 0.06 * R, zRoofCap + 0.015 * R * H),
        '#c4beb0', seamCol, 1.05, 3.95
      );

      // Control Tower Rooftop Telemetry Array (Small Dish + Tall Whip Mast + Stub Aerial)
      // 5a. Small rooftop parabolic dish on left-back of tower roof (aiming Up-Left)
      const smDishX = tcx - 0.12 * R, smDishY = tcy + 0.06 * R;
      pushCylinderZ3D(faces, ccProj, smDishX, smDishY, zRoofCap, zRoofCap + 0.055 * R * H, 0.072 * R, 0.062 * R, 8, darkWallCol, seamCol, 1.0, 4.1);
      pushCylinderZ3D(faces, ccProj, smDishX, smDishY, zRoofCap + 0.055 * R * H, zRoofCap + 0.15 * R * H, 0.030 * R, 0.026 * R, 6, '#949ca6', seamCol, 0.95, 4.2);
      pushParabolicDish3D(smDishX, smDishY, zRoofCap + 0.22 * R * H, 0.135 * R * RS, -2.55, 0.72, false, 4.5);

      // 5b. Tall central multi-stage whip antenna mast
      const mastX = tcx + 0.02 * R, mastY = tcy - 0.10 * R;
      pushCylinderZ3D(faces, ccProj, mastX, mastY, zRoofCap, zRoofCap + 0.055 * R * H, 0.065 * R, 0.055 * R, 8, darkWallCol, seamCol, 1.0, 4.1);
      pushCylinderZ3D(faces, ccProj, mastX, mastY, zRoofCap + 0.055 * R * H, zRoofCap + 0.24 * R * H, 0.028 * R, 0.022 * R, 6, '#949ca6', seamCol, 0.95, 4.2);
      const whipDepth = ccProj.project(mastX, mastY, zRoofCap + 0.50 * R * H).depth + 4.6;
      faces.push({
        depth: whipDepth,
        customDraw(c) {
          drawLine3D(c, ccProj, mastX, mastY, zRoofCap + 0.24 * R * H, mastX, mastY, zRoofCap + 0.74 * R * H, seamCol, 2.0 * activeStrokeScale);
        }
      });

      // 5c. Secondary UHF rod antenna on right-front of tower roof
      const rodX = tcx + 0.14 * R, rodY = tcy + 0.06 * R;
      pushCylinderZ3D(faces, ccProj, rodX, rodY, zRoofCap, zRoofCap + 0.09 * R * H, 0.052 * R, 0.042 * R, 8, darkWallCol, seamCol, 1.0, 4.15);
      faces.push({
        depth: whipDepth + 0.1,
        customDraw(c) {
          drawLine3D(c, ccProj, rodX, rodY, zRoofCap + 0.09 * R * H, rodX, rodY, zRoofCap + 0.36 * R * H, seamCol, 1.8 * activeStrokeScale);
        }
      });

      // 6. Back-Left Open-Truss Steel Lattice Microwave Tower with Dual Relay Drum Dishes
      // Positioned clearly to the left of the central citadel so all 5 truss tiers are unobstructed
      const twX = -0.60 * R, twY = 0.08 * R;
      const twZ0 = zDeck, twZ1 = zDeck + 0.98 * R * H;
      const twDepth = ccProj.project(twX, twY, (twZ0 + twZ1) * 0.5).depth + 3.0;
      faces.push({
        depth: twDepth,
        customDraw(c) {
          const tiers = 5;
          const wBot = 0.095 * R * RS;
          const wTop = 0.048 * R * RS;
          const cornersAt = (f) => {
            const w = lerp(wBot, wTop, f);
            const z = lerp(twZ0, twZ1, f);
            return [
              [twX - w, twY - w, z],
              [twX + w, twY - w, z],
              [twX + w, twY + w, z],
              [twX - w, twY + w, z]
            ];
          };

          for (let ti = 0; ti < tiers; ti++) {
            const c0 = cornersAt(ti / tiers);
            const c1 = cornersAt((ti + 1) / tiers);
            for (let s = 0; s < 4; s++) {
              const nxt = (s + 1) % 4;
              drawLine3D(c, ccProj, c0[s][0], c0[s][1], c0[s][2], c1[s][0], c1[s][1], c1[s][2], seamCol, 1.6 * activeStrokeScale);
              drawLine3D(c, ccProj, c1[s][0], c1[s][1], c1[s][2], c1[nxt][0], c1[nxt][1], c1[nxt][2], seamCol, 1.15 * activeStrokeScale);
              drawLine3D(c, ccProj, c0[s][0], c0[s][1], c0[s][2], c1[nxt][0], c1[nxt][1], c1[nxt][2], '#475569', 0.95 * activeStrokeScale);
              drawLine3D(c, ccProj, c0[nxt][0], c0[nxt][1], c0[nxt][2], c1[s][0], c1[s][1], c1[s][2], '#475569', 0.95 * activeStrokeScale);
            }
          }

          // Top spire pole & horizontal crossbar for dual microwave drum dishes
          const zCross = twZ1 + 0.13 * R * H;
          drawLine3D(c, ccProj, twX, twY, twZ1, twX, twY, twZ1 + 0.28 * R * H, seamCol, 2.2 * activeStrokeScale);
          drawLine3D(c, ccProj, twX - 0.08 * R, twY + 0.11 * R, zCross, twX + 0.08 * R, twY - 0.11 * R, zCross, seamCol, 2.2 * activeStrokeScale);

          // Left & right circular microwave relay drum dishes at top of lattice tower
          for (const side of [-1, 1]) {
            const dx = twX - side * 0.085 * R;
            const dy = twY + side * 0.115 * R;
            const dp = ccProj.project(dx, dy, zCross);
            const rx = 0.062 * R * RS;
            const ry = 0.102 * R * RS;
            c.save();
            c.translate(dp.x, dp.y);
            c.rotate(-0.18 * side);
            c.fillStyle = '#949ca6';
            c.strokeStyle = seamCol;
            c.lineWidth = 1.25 * activeStrokeScale;
            c.beginPath();
            c.ellipse(-side * 2.2, 0, rx, ry, 0, 0, Math.PI * 2);
            c.fill();
            c.stroke();
            c.fillStyle = '#dce1e8';
            c.beginPath();
            c.ellipse(0, 0, rx * 0.88, ry * 0.88, 0, 0, Math.PI * 2);
            c.fill();
            c.stroke();
            c.fillStyle = '#64748b';
            c.beginPath();
            c.arc(0, 0, Math.max(1.4, rx * 0.28), 0, Math.PI * 2);
            c.fill();
            c.stroke();
            c.restore();
          }
        }
      });
      // Small steel transmitter collar box at top of lattice truss
      pushBox3D(faces, ccProj, twX - 0.055 * R, twX + 0.055 * R, twY - 0.055 * R, twY + 0.055 * R, twZ1 - 0.02 * R * H, twZ1 + 0.05 * R * H, '#949ca6', seamCol, 1.1, 3.2);

      // 7. Left-Front Medium Parabolic Satellite Dish & Pedestal (aiming Up-Left as in sprite)
      const ldX = -0.44 * R, ldY = 0.54 * R;
      pushBox3D(faces, ccProj, ldX - 0.11 * R, ldX + 0.11 * R, ldY - 0.11 * R, ldY + 0.11 * R, zDeck, zDeck + 0.15 * R * H, '#b8b2a6', seamCol, 1.15, 4.0);
      pushCylinderZ3D(faces, ccProj, ldX, ldY, zDeck + 0.15 * R * H, zDeck + 0.29 * R * H, 0.046 * R, 0.040 * R, 8, '#949ca6', seamCol, 1.0, 4.2);
      const leftDishAim = -2.48 + Math.sin(t * 1.15) * 0.08;
      pushParabolicDish3D(ldX - 0.03 * R, ldY + 0.02 * R, zDeck + 0.39 * R * H, 0.22 * R * RS, leftDishAim, 0.62, true, 5.2);

      // 8. Right-Back Giant Primary SATCOM Parabolic Dish & Heavy Gimbal Pedestal (aiming Up-Right as in sprite)
      const rdX = 0.24 * R, rdY = -0.55 * R;
      pushBox3D(faces, ccProj, rdX - 0.15 * R, rdX + 0.15 * R, rdY - 0.15 * R, rdY + 0.15 * R, zDeck, zDeck + 0.06 * R * H, '#949ca6', seamCol, 1.15, 4.0);
      pushBox3D(faces, ccProj, rdX - 0.13 * R, rdX + 0.13 * R, rdY - 0.13 * R, rdY + 0.13 * R, zDeck + 0.06 * R * H, zDeck + 0.18 * R * H, '#b8b2a6', seamCol, 1.15, 4.15);
      pushTaperedBox3D(faces, ccProj, rdX - 0.08 * R, rdX + 0.08 * R, rdY - 0.08 * R, rdY + 0.08 * R, rdX - 0.05 * R, rdX + 0.05 * R, rdY - 0.05 * R, rdY + 0.05 * R, zDeck + 0.18 * R * H, zDeck + 0.44 * R * H, '#949ca6', seamCol, 1.15, 4.3);
      const rightDishAim = -0.58 + Math.sin(t * 0.95) * 0.08;
      pushParabolicDish3D(rdX + 0.05 * R, rdY - 0.08 * R, zDeck + 0.58 * R * H, 0.35 * R * RS, rightDishAim, 0.60, true, 6.0);

      flushFaces(ctx, faces);
      return;
    }

    if (defId === 'USA_REACTOR') {
      // =========================================================================
      // USA COLD FUSION CRYOGENIC REACTOR — Ligne-Claire 3D Procedural Sculpture
      // Reference: assets/diorama/buildings/usa_reactor.png
      // =========================================================================
      const R = r * 1.22 * SS;
      const polys = faces;
      const ccAngle = (u.angle !== undefined && Math.abs(u.angle - 0.68) > 0.01) ? u.angle : 0.75;
      const ccProj = createProjector(ccAngle, pitchScale, zScale);

      const projectPoly3D = (pts3d) => {
        const pts = pts3d.map(pt => ccProj.project(pt.x, pt.y, pt.z));
        const depth = pts.reduce((acc, p0) => acc + p0.depth, 0) / (pts.length || 1);
        return { pts, depth };
      };

      const pushQuad = (pts3d, hex, stroke = '#1e2630', sw = 1.0, bias = 0) => {
        if (pts3d.length >= 3) {
          const ux = pts3d[1].x - pts3d[0].x, uy = pts3d[1].y - pts3d[0].y, uz = pts3d[1].z - pts3d[0].z;
          const vx = pts3d[2].x - pts3d[0].x, vy = pts3d[2].y - pts3d[0].y, vz = pts3d[2].z - pts3d[0].z;
          let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
          const nl = Math.hypot(nx, ny, nz) || 1;
          nx /= nl; ny /= nl; nz /= nl;
          const shade = ccProj.shadeNormal(nx, ny, Math.max(0, nz));
          const pr = projectPoly3D(pts3d);
          polys.push({
            pts: pr.pts,
            depth: pr.depth + bias,
            fill: shadeHex(hex, shade),
            stroke,
            lineWidth: sw
          });
        }
      };

      const pushRingFrustum = (cx, cy, zBot, zTop, rBot, rTop, segs, sideHex, topHex, stroke = '#1e2630', sw = 0.95, bias = 0) => {
        const topPts = [];
        for (let i = 0; i < segs; i++) {
          const a0 = (i / segs) * Math.PI * 2;
          const a1 = ((i + 1) / segs) * Math.PI * 2;
          const c0 = Math.cos(a0), s0 = Math.sin(a0);
          const c1 = Math.cos(a1), s1 = Math.sin(a1);
          topPts.push({ x: cx + c0 * rTop, y: cy + s0 * rTop, z: zTop });
          const am = (a0 + a1) * 0.5;
          const shade = ccProj.shadeNormal(Math.cos(am), Math.sin(am), 0.18);
          const q = [
            { x: cx + c0 * rBot, y: cy + s0 * rBot, z: zBot },
            { x: cx + c1 * rBot, y: cy + s1 * rBot, z: zBot },
            { x: cx + c1 * rTop, y: cy + s1 * rTop, z: zTop },
            { x: cx + c0 * rTop, y: cy + s0 * rTop, z: zTop }
          ];
          const pr = projectPoly3D(q);
          polys.push({
            pts: pr.pts,
            depth: pr.depth + bias,
            fill: shadeHex(sideHex, shade),
            stroke,
            lineWidth: sw
          });
        }
        if (topHex) {
          const tpr = projectPoly3D(topPts);
          polys.push({
            pts: tpr.pts,
            depth: tpr.depth + 0.08 + bias,
            fill: shadeHex(topHex, ccProj.shadeNormal(0, 0, 1)),
            stroke,
            lineWidth: sw
          });
        }
      };

      // 1. Ground Shadow & Base Drum Plinth (20-segment cylindrical concrete bunker)
      const zDrumTop = 0.24 * R * H;
      pushRingFrustum(0, 0, 0, 0.04 * R * H, 0.70 * R, 0.68 * R, 20, '#64707d', '#828e9c', '#1e2630', 1.0, -4.0);
      pushRingFrustum(0, 0, 0.04 * R * H, zDrumTop, 0.67 * R, 0.64 * R, 20, '#9ea8b4', '#c4cdd6', '#1e2630', 1.0, -3.0);

      // Perimeter concrete buttress lugs: front-bottom apex (+X/+Y = 0.25*PI) and far-left (0.82*PI)
      for (const ang of [Math.PI * 0.24, Math.PI * 0.78]) {
        const ux = Math.cos(ang), uy = Math.sin(ang);
        const tx = -uy, ty = ux;
        const rIn = 0.60 * R, rOut = 0.73 * R, hw = 0.068 * R;
        const zL0 = 0, zL1 = 0.17 * R * H;
        const b0 = { x: ux * rIn - tx * hw, y: uy * rIn - ty * hw };
        const b1 = { x: ux * rOut - tx * hw * 0.85, y: uy * rOut - ty * hw * 0.85 };
        const b2 = { x: ux * rOut + tx * hw * 0.85, y: uy * rOut + ty * hw * 0.85 };
        const b3 = { x: ux * rIn + tx * hw, y: uy * rIn + ty * hw };
        pushQuad([{ ...b0, z: zL0 }, { ...b1, z: zL0 }, { ...b1, z: zL1 }, { ...b0, z: zL1 }], '#8c98a6', '#1e2630', 0.95, -0.5);
        pushQuad([{ ...b1, z: zL0 }, { ...b2, z: zL0 }, { ...b2, z: zL1 }, { ...b1, z: zL1 }], '#a4b0bc', '#1e2630', 0.95, -0.4);
        pushQuad([{ ...b2, z: zL0 }, { ...b3, z: zL0 }, { ...b3, z: zL1 }, { ...b2, z: zL1 }], '#7c8896', '#1e2630', 0.95, -0.5);
        pushQuad([{ ...b0, z: zL1 }, { ...b1, z: zL1 }, { ...b2, z: zL1 }, { ...b3, z: zL1 }], '#cad2dc', '#1e2630', 0.95, -0.3);
      }

      // 2. Sunken Cryo-Coolant Ring Moat & Radial Pipe Struts on Drum Deck
      polys.push({
        depth: ccProj.project(0, 0, zDrumTop).depth - 1.2,
        customDraw(ctx2) {
          ctx2.save();
          const moatPts = [];
          const innerRimPts = [];
          const segs = 28;
          for (let i = 0; i < segs; i++) {
            const a = (i / segs) * Math.PI * 2;
            moatPts.push(ccProj.project(Math.cos(a) * 0.56 * R, Math.sin(a) * 0.56 * R, zDrumTop + 0.004 * R));
            innerRimPts.push(ccProj.project(Math.cos(a) * 0.42 * R, Math.sin(a) * 0.42 * R, zDrumTop + 0.015 * R));
          }
          ctx2.beginPath();
          moatPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
          ctx2.closePath();
          ctx2.fillStyle = '#38bdf8';
          ctx2.fill();
          ctx2.strokeStyle = '#1e2630';
          ctx2.lineWidth = 1.15;
          ctx2.stroke();

          // Bright inner cyan glow ring inside moat
          ctx2.beginPath();
          for (let i = 0; i < segs; i++) {
            const a = (i / segs) * Math.PI * 2;
            const p0 = ccProj.project(Math.cos(a) * 0.49 * R, Math.sin(a) * 0.49 * R, zDrumTop + 0.008 * R);
            if (i === 0) ctx2.moveTo(p0.x, p0.y);
            else ctx2.lineTo(p0.x, p0.y);
          }
          ctx2.closePath();
          ctx2.strokeStyle = '#a5f3fc';
          ctx2.lineWidth = 2.6;
          ctx2.stroke();

          // Inner core collar ring
          ctx2.beginPath();
          innerRimPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
          ctx2.closePath();
          ctx2.fillStyle = '#7c8b99';
          ctx2.fill();
          ctx2.strokeStyle = '#1e2630';
          ctx2.lineWidth = 1.15;
          ctx2.stroke();

          // 12 Radial tubular strut ribs bridging the coolant moat
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
            const pIn = ccProj.project(Math.cos(a) * 0.35 * R, Math.sin(a) * 0.35 * R, zDrumTop + 0.06 * R);
            const pOut = ccProj.project(Math.cos(a) * 0.56 * R, Math.sin(a) * 0.56 * R, zDrumTop + 0.01 * R);
            ctx2.beginPath();
            ctx2.moveTo(pIn.x, pIn.y);
            ctx2.lineTo(pOut.x, pOut.y);
            ctx2.strokeStyle = '#1e2630';
            ctx2.lineWidth = 4.6;
            ctx2.stroke();
            ctx2.strokeStyle = '#9aa8b8';
            ctx2.lineWidth = 2.6;
            ctx2.stroke();
          }
          ctx2.restore();
        }
      });

      // 3. Helper to build each of the 4 Radial Sloped Cooling Fins / Buttress Blades
      // In the sprite, the 2 back-side fins (Left-Back and Right-Back) are taller and wider to frame the glass cylinder,
      // while the 2 front fins (Front-Left and Front-Right) are shorter (stopping at ~0.78R) so the glowing plasma rings remain unobstructed!
      const buildCoolingFin = (ang, isFront, depthOffset) => {
        const ux = Math.cos(ang), uy = Math.sin(ang);
        const tx = -uy, ty = ux;
        const hw = (isFront ? 0.068 : 0.076) * R;
        const zBase0 = 0.02 * R * H;
        const zFootTop = 0.27 * R * H;
        const zFinTop = (isFront ? 0.78 : 1.06) * R * H;
        const zShoulderTop = (isFront ? 0.83 : 1.11) * R * H;

        // Stepped outer foot block at drum perimeter
        const rFootIn = 0.52 * R, rFootOut = (isFront ? 0.76 : 0.78) * R, rFootMid = (isFront ? 0.69 : 0.72) * R;
        const fPts = (rVal, wScale = 1) => [
          { x: ux * rVal - tx * hw * wScale, y: uy * rVal - ty * hw * wScale },
          { x: ux * rVal + tx * hw * wScale, y: uy * rVal + ty * hw * wScale }
        ];
        const [fbInL, fbInR] = fPts(rFootIn, 1.12);
        const [fbOutL, fbOutR] = fPts(rFootOut, 0.94);
        const [ftInL, ftInR] = fPts(rFootIn, 1.04);
        const [ftOutL, ftOutR] = fPts(rFootMid, 0.88);

        pushQuad([{ ...fbInL, z: zBase0 }, { ...fbOutL, z: zBase0 }, { ...ftOutL, z: zFootTop }, { ...ftInL, z: zFootTop }], '#8e9ba8', '#1e2630', 1.0, depthOffset);
        pushQuad([{ ...fbOutR, z: zBase0 }, { ...fbInR, z: zBase0 }, { ...ftInR, z: zFootTop }, { ...ftOutR, z: zFootTop }], '#8e9ba8', '#1e2630', 1.0, depthOffset);
        pushQuad([{ ...fbOutL, z: zBase0 }, { ...fbOutR, z: zBase0 }, { ...ftOutR, z: zFootTop }, { ...ftOutL, z: zFootTop }], '#a8b4c2', '#1e2630', 1.0, depthOffset + 0.1);
        pushQuad([{ ...ftInL, z: zFootTop }, { ...ftOutL, z: zFootTop }, { ...ftOutR, z: zFootTop }, { ...ftInR, z: zFootTop }], '#cad4e0', '#1e2630', 1.0, depthOffset + 0.15);

        // Cyan data panel inset on outer sloped foot face
        const [pBotL, pBotR] = fPts(rFootOut + 0.005 * R, 0.48);
        const [pTopL, pTopR] = fPts(rFootMid + 0.005 * R, 0.44);
        pushQuad([
          { ...pBotL, z: zBase0 + 0.04 * R * H },
          { ...pBotR, z: zBase0 + 0.04 * R * H },
          { ...pTopR, z: zFootTop - 0.04 * R * H },
          { ...pTopL, z: zFootTop - 0.04 * R * H }
        ], '#3898c8', '#1e2630', 0.9, depthOffset + 2.5);

        // Tall sloped fin blade
        const rBladeIn = 0.34 * R;
        const rBladeOutBot = (isFront ? 0.65 : 0.69) * R;
        const rBladeOutTop = (isFront ? 0.46 : 0.51) * R;
        const [bInL, bInR] = fPts(rBladeIn, 0.90);
        const [bOutBotL, bOutBotR] = fPts(rBladeOutBot, 0.85);
        const [bOutTopL, bOutTopR] = fPts(rBladeOutTop, 0.80);
        const [bTopInL, bTopInR] = fPts(rBladeIn, 0.80);

        // Left side wall of blade
        pushQuad([
          { ...bInL, z: zDrumTop },
          { ...bOutBotL, z: zFootTop },
          { ...bOutTopL, z: zFinTop },
          { ...bTopInL, z: zShoulderTop }
        ], '#9aa6b4', '#1e2630', 1.05, depthOffset + 0.3);
        // Right side wall of blade
        pushQuad([
          { ...bOutBotR, z: zFootTop },
          { ...bInR, z: zDrumTop },
          { ...bTopInR, z: zShoulderTop },
          { ...bOutTopR, z: zFinTop }
        ], '#9aa6b4', '#1e2630', 1.05, depthOffset + 0.3);
        // Outer sloped spine face of blade
        pushQuad([
          { ...bOutBotL, z: zFootTop },
          { ...bOutBotR, z: zFootTop },
          { ...bOutTopR, z: zFinTop },
          { ...bOutTopL, z: zFinTop }
        ], '#b8c4d0', '#1e2630', 1.05, depthOffset + 0.45);
        // Top shoulder cap of blade
        pushQuad([
          { ...bTopInL, z: zShoulderTop },
          { ...bOutTopL, z: zFinTop },
          { ...bOutTopR, z: zFinTop },
          { ...bTopInR, z: zShoulderTop }
        ], '#dce4ec', '#1e2630', 1.0, depthOffset + 0.55);

        // Long glowing cyan vertical cooling slot recessed into the sloped outer spine
        const [sBotL, sBotR] = fPts(rBladeOutBot + 0.005 * R, 0.38);
        const [sTopL, sTopR] = fPts(rBladeOutTop + 0.005 * R, 0.36);
        pushQuad([
          { ...sBotL, z: zFootTop + 0.04 * R * H },
          { ...sBotR, z: zFootTop + 0.04 * R * H },
          { ...sTopR, z: zFinTop - 0.05 * R * H },
          { ...sTopL, z: zFinTop - 0.05 * R * H }
        ], '#2e8bc0', '#1e2630', 0.9, depthOffset + 2.8);

        // On the two back fins, the inner vertical edge facing the plasma tube has a bright cyan vertical light strip
        if (!isFront) {
          const [iBotL, iBotR] = fPts(rBladeIn - 0.008 * R, 0.55);
          const [iTopL, iTopR] = fPts(rBladeIn - 0.008 * R, 0.55);
          pushQuad([
            { ...iBotL, z: zDrumTop + 0.05 * R * H },
            { ...iBotR, z: zDrumTop + 0.05 * R * H },
            { ...iTopR, z: zShoulderTop - 0.04 * R * H },
            { ...iTopL, z: zShoulderTop - 0.04 * R * H }
          ], '#38bdf8', '#1e2630', 0.9, depthOffset + 2.2);
        }
      };

      // Build the two BACK-SIDE cooling fins first (Left-Back at 0.82*PI and Right-Back at 1.66*PI)
      buildCoolingFin(Math.PI * 0.82, false, -2.5);
      buildCoolingFin(Math.PI * 1.66, false, -2.5);

      // 4. Central Cryo-Glass Plasma Containment Cylinder + Internal Rod + 4 Neon Torus Rings
      const zGlassBot = zDrumTop + 0.03 * R * H;
      const zGlassTop = 1.18 * R * H;
      const rGlass = 0.35 * R;
      const pulse = 0.97 + 0.03 * Math.sin(t * 5.0);

      polys.push({
        depth: ccProj.project(0, 0, (zGlassBot + zGlassTop) * 0.5).depth,
        customDraw(ctx2) {
          ctx2.save();
          const botPts = [];
          const topPts = [];
          const segs = 24;
          for (let i = 0; i < segs; i++) {
            const a = (i / segs) * Math.PI * 2;
            botPts.push(ccProj.project(Math.cos(a) * rGlass, Math.sin(a) * rGlass, zGlassBot));
            topPts.push(ccProj.project(Math.cos(a) * rGlass, Math.sin(a) * rGlass, zGlassTop));
          }

          let minIdx = 0, maxIdx = 0;
          for (let i = 1; i < segs; i++) {
            if (botPts[i].x < botPts[minIdx].x) minIdx = i;
            if (botPts[i].x > botPts[maxIdx].x) maxIdx = i;
          }

          // 4a. Translucent cyan glass cylinder backdrop fill
          ctx2.beginPath();
          ctx2.moveTo(topPts[minIdx].x, topPts[minIdx].y);
          ctx2.lineTo(botPts[minIdx].x, botPts[minIdx].y);
          for (let i = 0; i <= segs; i++) {
            const idx = (minIdx + i) % segs;
            ctx2.lineTo(botPts[idx].x, botPts[idx].y);
            if (idx === maxIdx) break;
          }
          ctx2.lineTo(topPts[maxIdx].x, topPts[maxIdx].y);
          ctx2.closePath();
          ctx2.fillStyle = 'rgba(72, 224, 255, 0.38)';
          ctx2.fill();

          // Bottom glowing cyan plasma pool inside glass cylinder
          ctx2.beginPath();
          botPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
          ctx2.closePath();
          ctx2.fillStyle = 'rgba(56, 232, 255, 0.72)';
          ctx2.fill();
          ctx2.strokeStyle = '#befbff';
          ctx2.lineWidth = 2.2;
          ctx2.stroke();

          // 4b. Central vertical reaction core rod inside the glass tube
          const rCore = 0.125 * R;
          const cLeftBot = ccProj.project(-rCore * 0.707, rCore * 0.707, zGlassBot);
          const cRightBot = ccProj.project(rCore * 0.707, -rCore * 0.707, zGlassBot);
          const cRightTop = ccProj.project(rCore * 0.707, -rCore * 0.707, zGlassTop);
          const cLeftTop = ccProj.project(-rCore * 0.707, rCore * 0.707, zGlassTop);

          ctx2.beginPath();
          ctx2.moveTo(cLeftBot.x, cLeftBot.y);
          ctx2.lineTo(cRightBot.x, cRightBot.y);
          ctx2.lineTo(cRightTop.x, cRightTop.y);
          ctx2.lineTo(cLeftTop.x, cLeftTop.y);
          ctx2.closePath();
          ctx2.fillStyle = '#385c78';
          ctx2.fill();
          ctx2.strokeStyle = '#1e2630';
          ctx2.lineWidth = 1.2;
          ctx2.stroke();

          // Glowing cyan vertical core spine down the center of the rod
          const cMidBot = ccProj.project(0, 0, zGlassBot + 0.02 * R);
          const cMidTop = ccProj.project(0, 0, zGlassTop - 0.02 * R);
          ctx2.beginPath();
          ctx2.moveTo(cMidBot.x, cMidBot.y);
          ctx2.lineTo(cMidTop.x, cMidTop.y);
          ctx2.strokeStyle = '#67e8f9';
          ctx2.lineWidth = 5.4;
          ctx2.stroke();
          ctx2.strokeStyle = '#e0ffff';
          ctx2.lineWidth = 2.2;
          ctx2.stroke();

          // 4c. 4 Stacked Horizontal Glowing Neon-Cyan Plasma Torus Rings
          const rRing = 0.275 * R * pulse;
          for (let k = 0; k < 4; k++) {
            const rz = zGlassBot + (0.14 + k * 0.195) * R * H;
            const ringPts = [];
            for (let i = 0; i <= 32; i++) {
              const a = (i / 32) * Math.PI * 2;
              ringPts.push(ccProj.project(Math.cos(a) * rRing, Math.sin(a) * rRing, rz));
            }
            ctx2.beginPath();
            ringPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
            ctx2.strokeStyle = 'rgba(0, 229, 255, 0.45)';
            ctx2.lineWidth = 9.0;
            ctx2.lineCap = 'round';
            ctx2.stroke();

            ctx2.beginPath();
            ringPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
            ctx2.strokeStyle = '#00e5ff';
            ctx2.lineWidth = 5.0;
            ctx2.stroke();

            ctx2.beginPath();
            ringPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
            ctx2.strokeStyle = '#ffffff';
            ctx2.lineWidth = 2.2;
            ctx2.stroke();
          }

          // 4d. Front glass specular highlight streaks & crisp silhouette edges
          const gl1Bot = ccProj.project(-rGlass * 0.45, rGlass * 0.88, zGlassBot + 0.04 * R);
          const gl1Top = ccProj.project(-rGlass * 0.45, rGlass * 0.88, zGlassTop - 0.04 * R);
          ctx2.beginPath();
          ctx2.moveTo(gl1Bot.x, gl1Bot.y);
          ctx2.lineTo(gl1Top.x, gl1Top.y);
          ctx2.strokeStyle = 'rgba(224, 255, 255, 0.65)';
          ctx2.lineWidth = 3.2;
          ctx2.stroke();

          ctx2.beginPath();
          ctx2.moveTo(topPts[minIdx].x, topPts[minIdx].y);
          ctx2.lineTo(botPts[minIdx].x, botPts[minIdx].y);
          ctx2.moveTo(topPts[maxIdx].x, topPts[maxIdx].y);
          ctx2.lineTo(botPts[maxIdx].x, botPts[maxIdx].y);
          ctx2.strokeStyle = '#1e2630';
          ctx2.lineWidth = 1.35;
          ctx2.stroke();

          ctx2.restore();
        }
      });

      // Build the two FRONT cooling fins (Front-Left at 0.50*PI and Front-Right at -0.02*PI)
      buildCoolingFin(Math.PI * 0.50, true, 1.8);
      buildCoolingFin(-Math.PI * 0.02, true, 1.5);

      // 5. Top Cylindrical Reactor Crown / Cap + 4 Clamp Lugs + Concentric Rim & Glowing Cyan Lens
      const zCap0 = 1.15 * R * H;
      const zCap1 = 1.21 * R * H;
      const zCap2 = 1.35 * R * H;
      const zCap3 = 1.40 * R * H;
      const capBias = 4.5;

      pushRingFrustum(0, 0, zCap0, zCap1, 0.37 * R, 0.42 * R, 20, '#647280', '#8c9aa8', '#1e2630', 0.95, capBias);
      pushRingFrustum(0, 0, zCap1, zCap2, 0.42 * R, 0.40 * R, 20, '#a4b2c0', '#cad4e0', '#1e2630', 1.0, capBias + 0.3);

      // 4 Trapezoidal clamp lugs around the cap rim
      for (const ang of [Math.PI * 0.06, Math.PI * 0.44, Math.PI * 1.06, Math.PI * 1.44]) {
        const ux = Math.cos(ang), uy = Math.sin(ang);
        const tx = -uy, ty = ux;
        const hw = 0.046 * R;
        const rIn = 0.38 * R, rOut = 0.445 * R;
        const zL0 = zCap1 + 0.02 * R * H, zL1 = zCap2 - 0.015 * R * H;
        const q = [
          { x: ux * rOut - tx * hw, y: uy * rOut - ty * hw, z: zL0 },
          { x: ux * rOut + tx * hw, y: uy * rOut + ty * hw, z: zL0 },
          { x: ux * rIn + tx * hw * 0.85, y: uy * rIn + ty * hw * 0.85, z: zL1 },
          { x: ux * rIn - tx * hw * 0.85, y: uy * rIn - ty * hw * 0.85, z: zL1 }
        ];
        pushQuad(q, '#4a627a', '#1e2630', 0.95, capBias + 1.8);
      }

      // Concentric recessed dark trough + inner raised metallic collar + glowing cyan circular lens on top of the crown
      pushRingFrustum(0, 0, zCap2, zCap2 + 0.015 * R * H, 0.33 * R, 0.32 * R, 20, '#475569', '#526070', '#1e2630', 0.95, capBias + 0.7);
      pushRingFrustum(0, 0, zCap2 + 0.015 * R * H, zCap3, 0.25 * R, 0.24 * R, 20, '#8896a6', '#cfd8e2', '#1e2630', 0.95, capBias + 0.9);
      pushRingFrustum(0, 0, zCap3, zCap3 + 0.012 * R * H, 0.175 * R, 0.17 * R, 20, '#0284c7', '#7ef4ff', '#1e2630', 0.95, capBias + 1.1);

      // 6. Front-Right (+X, slightly -Y) Auxiliary Cryo-Chiller & Transformer Unit with 4 Curved Cryo-Pipes
      const chX0 = 0.36 * R, chX1 = 0.82 * R;
      const chY0 = -0.24 * R, chY1 = 0.20 * R;
      const chZ0 = 0, chZ1 = 0.42 * R * H, chZ2 = 0.46 * R * H;
      const chBias = 16.0;

      // Rear-right dark-grey electrical junction sub-box
      pushBox3D(polys, ccProj, chX1 - 0.06 * R, chX1 + 0.09 * R, chY0 - 0.04 * R, chY0 + 0.16 * R, 0, 0.30 * R * H, '#52606e', '#1e2630', 1.0, chBias - 0.5);

      // Main chiller body + beveled roof cap
      pushBox3D(polys, ccProj, chX0, chX1, chY0, chY1, chZ0, chZ1, '#b2bcc8', '#1e2630', 1.06, chBias);
      pushBox3D(polys, ccProj, chX0, chX1, chY0, chY1, chZ1, chZ2, '#d6dfe8', '#1e2630', 1.06, chBias + 0.3, 0.035 * R, 0.035 * R);

      // Chiller details (slatted roof exhaust grille, side louver vents, amber warning plate, and 4 curved cryo-pipes)
      polys.push({
        depth: ccProj.project(chX1, chY1, chZ2).depth + chBias + 1.0,
        customDraw(ctx2) {
          ctx2.save();
          // Roof dark slatted heat-exchanger grille
          const gX0 = chX0 + 0.16 * R, gX1 = chX1 - 0.10 * R;
          const gY0 = chY0 + 0.10 * R, gY1 = chY1 - 0.12 * R;
          const gPts = [
            ccProj.project(gX0, gY0, chZ2 + 0.003 * R),
            ccProj.project(gX1, gY0, chZ2 + 0.003 * R),
            ccProj.project(gX1, gY1, chZ2 + 0.003 * R),
            ccProj.project(gX0, gY1, chZ2 + 0.003 * R)
          ];
          ctx2.beginPath();
          gPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
          ctx2.closePath();
          ctx2.fillStyle = '#334155';
          ctx2.fill();
          ctx2.strokeStyle = '#1e2630';
          ctx2.lineWidth = 1.0;
          ctx2.stroke();
          for (let s = 1; s <= 4; s++) {
            const fy = gY0 + (s / 5) * (gY1 - gY0);
            const pA = ccProj.project(gX0 + 0.02 * R, fy, chZ2 + 0.004 * R);
            const pB = ccProj.project(gX1 - 0.02 * R, fy, chZ2 + 0.004 * R);
            ctx2.beginPath();
            ctx2.moveTo(pA.x, pA.y);
            ctx2.lineTo(pB.x, pB.y);
            ctx2.strokeStyle = '#1e2630';
            ctx2.lineWidth = 1.1;
            ctx2.stroke();
          }

          // Front-Left (+Y) wall amber warning plate
          const wX0 = chX0 + 0.30 * R, wX1 = chX0 + 0.44 * R;
          const wZ0 = 0.22 * R * H, wZ1 = 0.37 * R * H;
          const wPts = [
            ccProj.project(wX0, chY1 + 0.003 * R, wZ0),
            ccProj.project(wX1, chY1 + 0.003 * R, wZ0),
            ccProj.project(wX1, chY1 + 0.003 * R, wZ1),
            ccProj.project(wX0, chY1 + 0.003 * R, wZ1)
          ];
          ctx2.beginPath();
          wPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
          ctx2.closePath();
          ctx2.fillStyle = '#b48232';
          ctx2.fill();
          ctx2.strokeStyle = '#1e2630';
          ctx2.lineWidth = 0.9;
          ctx2.stroke();

          // Front-Right (+X) wall dark louver vent
          const vY0 = chY0 + 0.10 * R, vY1 = chY0 + 0.32 * R;
          const vZ0 = 0.20 * R * H, vZ1 = 0.39 * R * H;
          const vPts = [
            ccProj.project(chX1 + 0.003 * R, vY0, vZ0),
            ccProj.project(chX1 + 0.003 * R, vY1, vZ0),
            ccProj.project(chX1 + 0.003 * R, vY1, vZ1),
            ccProj.project(chX1 + 0.003 * R, vY0, vZ1)
          ];
          ctx2.beginPath();
          vPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
          ctx2.closePath();
          ctx2.fillStyle = '#475569';
          ctx2.fill();
          ctx2.strokeStyle = '#1e2630';
          ctx2.lineWidth = 0.9;
          ctx2.stroke();

          // Helper to draw a curved 3D cryo-pipe with wall & ground flanges
          const drawCryoPipe = (pStart, pKnee, pEnd) => {
            const s = ccProj.project(pStart.x, pStart.y, pStart.z);
            const k = ccProj.project(pKnee.x, pKnee.y, pKnee.z);
            const e = ccProj.project(pEnd.x, pEnd.y, pEnd.z);
            // Ground flange disc
            ctx2.beginPath();
            ctx2.ellipse(e.x, e.y, 4.8, 2.7, 0, 0, Math.PI * 2);
            ctx2.fillStyle = '#64748b';
            ctx2.fill();
            ctx2.strokeStyle = '#1e2630';
            ctx2.lineWidth = 1.1;
            ctx2.stroke();

            // Pipe dark outline
            ctx2.beginPath();
            ctx2.moveTo(s.x, s.y);
            ctx2.quadraticCurveTo(k.x, k.y, e.x, e.y);
            ctx2.strokeStyle = '#1e2630';
            ctx2.lineWidth = 6.2;
            ctx2.lineCap = 'round';
            ctx2.stroke();
            // Pipe metallic body
            ctx2.strokeStyle = '#5c6b7a';
            ctx2.lineWidth = 4.0;
            ctx2.stroke();
            // Pipe highlight
            ctx2.strokeStyle = '#8fa0b2';
            ctx2.lineWidth = 1.4;
            ctx2.stroke();
          };

          // 2 curved pipes on Front-Left (+Y) face
          drawCryoPipe(
            { x: chX0 + 0.14 * R, y: chY1, z: 0.13 * R * H },
            { x: chX0 + 0.14 * R, y: chY1 + 0.11 * R, z: 0.12 * R * H },
            { x: chX0 + 0.14 * R, y: chY1 + 0.10 * R, z: 0 }
          );
          drawCryoPipe(
            { x: chX0 + 0.28 * R, y: chY1, z: 0.13 * R * H },
            { x: chX0 + 0.28 * R, y: chY1 + 0.11 * R, z: 0.12 * R * H },
            { x: chX0 + 0.28 * R, y: chY1 + 0.10 * R, z: 0 }
          );
          // 2 curved pipes on Front-Right (+X) face
          drawCryoPipe(
            { x: chX1, y: chY1 - 0.14 * R, z: 0.13 * R * H },
            { x: chX1 + 0.11 * R, y: chY1 - 0.14 * R, z: 0.12 * R * H },
            { x: chX1 + 0.10 * R, y: chY1 - 0.14 * R, z: 0 }
          );
          drawCryoPipe(
            { x: chX1, y: chY1 - 0.30 * R, z: 0.13 * R * H },
            { x: chX1 + 0.11 * R, y: chY1 - 0.30 * R, z: 0.12 * R * H },
            { x: chX1 + 0.10 * R, y: chY1 - 0.30 * R, z: 0 }
          );
          ctx2.restore();
        }
      });

      flushFaces(ctx, faces);
      return;
    }

    if (defId === 'USA_SUPPLY_CENTER') {
      // High-Fidelity Ligne-Claire 3D Model matching usa_supply_center.png:
      // 1. Left (-X, +Y) Elevated Chinook Helipad on 3 visible square concrete pillars with yellow/black hazard border, dark asphalt deck & circular tan "H" marking
      // 2. Back-left (-X, -Y) Concrete Platform Extension stacked with 4 ribbed olive-drab military cargo containers
      // 3. Right (+X) Main Raised Concrete Loading Dock with overhanging slab lip, expansion joints & 2 vertical steel access ladders
      // 4. Yellow Double-Girder Overhead Bridge Gantry Crane with 2 lattice A-frame towers, top silver motor cabin & suspended yellow spreader bar
      // 5. Roller Conveyor Belt running under the gantry crane + wooden/blue crates on deck
      // 6. Front-left ground olive military crates & front-right ground blue-tarped wooden supply pallets
      const scAngle = 0.75;
      const scProj = createProjector(scAngle, pitchScale, zScale);
      const R = r * 1.18 * SS;
      const polys = faces;

      const pushQuad = (pts3d, fill, stroke = '#1e242b', lineWidth = 1.0, bias = 0) => {
        const projPts = pts3d.map(pt => scProj.project(pt.x, pt.y, pt.z));
        const depth = projPts.reduce((acc, pt) => acc + pt.depth, 0) / projPts.length + bias;
        polys.push({ pts: projPts, depth, fill, stroke, lineWidth });
      };

      const extrudeBox = (x0, x1, y0, y1, z0, z1, topCol, leftCol, rightCol, bias = 0, lw = 1.0) => {
        // Back faces (-X and -Y)
        pushQuad([
          { x: x0, y: y0, z: z0 }, { x: x1, y: y0, z: z0 },
          { x: x1, y: y0, z: z1 }, { x: x0, y: y0, z: z1 }
        ], rightCol, '#1e242b', lw, bias - 0.3);
        pushQuad([
          { x: x0, y: y0, z: z0 }, { x: x0, y: y1, z: z0 },
          { x: x0, y: y1, z: z1 }, { x: x0, y: y0, z: z1 }
        ], leftCol, '#1e242b', lw, bias - 0.3);
        // Front-Left (+Y) face
        pushQuad([
          { x: x0, y: y1, z: z0 }, { x: x1, y: y1, z: z0 },
          { x: x1, y: y1, z: z1 }, { x: x0, y: y1, z: z1 }
        ], leftCol, '#1e242b', lw, bias + 0.15);
        // Front-Right (+X) face
        pushQuad([
          { x: x1, y: y0, z: z0 }, { x: x1, y: y1, z: z0 },
          { x: x1, y: y1, z: z1 }, { x: x1, y: y0, z: z1 }
        ], rightCol, '#1e242b', lw, bias + 0.15);
        // Top (+Z) face
        pushQuad([
          { x: x0, y: y0, z: z1 }, { x: x1, y: y0, z: z1 },
          { x: x1, y: y1, z: z1 }, { x: x0, y: y1, z: z1 }
        ], topCol, '#1e242b', lw, bias + 0.3);
      };

      // Helper for ribbed olive-drab military crate
      const pushOliveCrate = (x0, x1, y0, y1, z0, z1, bias = 0) => {
        extrudeBox(x0, x1, y0, y1, z0, z1, '#7a8a59', '#657348', '#525e3a', bias, 0.95);
        // Top rim lip
        const lipH = Math.min(0.032 * R * H, (z1 - z0) * 0.25);
        extrudeBox(
          x0 - 0.005 * R, x1 + 0.005 * R,
          y0 - 0.005 * R, y1 + 0.005 * R,
          z1 - lipH, z1,
          '#899966', '#6f7e50', '#5a6740', bias + 0.35, 0.9
        );
        // Vertical ribs on visible front faces (+Y and +X) and lid slats
        const dBias = scProj.project(x1, y1, (z0 + z1) * 0.5).depth + bias + 0.7;
        polys.push({
          depth: dBias,
          customDraw(ctx2) {
            ctx2.save();
            ctx2.strokeStyle = '#2d351e';
            ctx2.lineWidth = 1.05;
            for (const fx of [x0 + (x1 - x0) * 0.33, x0 + (x1 - x0) * 0.67]) {
              const pB = scProj.project(fx, y1 + 0.002 * R, z0 + 0.015 * R * H);
              const pT = scProj.project(fx, y1 + 0.002 * R, z1 - lipH);
              ctx2.beginPath();
              ctx2.moveTo(pB.x, pB.y);
              ctx2.lineTo(pT.x, pT.y);
              ctx2.stroke();
            }
            for (const fy of [y0 + (y1 - y0) * 0.33, y0 + (y1 - y0) * 0.67]) {
              const pB = scProj.project(x1 + 0.002 * R, fy, z0 + 0.015 * R * H);
              const pT = scProj.project(x1 + 0.002 * R, fy, z1 - lipH);
              ctx2.beginPath();
              ctx2.moveTo(pB.x, pB.y);
              ctx2.lineTo(pT.x, pT.y);
              ctx2.stroke();
            }
            ctx2.restore();
          }
        });
      };

      const dockZ1 = 0.19 * R * H, dockZ2 = 0.25 * R * H;

      // 1. Back-Left (-X, -Y) Concrete Extension Deck + 4 Stacked Olive Military Crates
      const extX0 = -0.92 * R, extX1 = -0.24 * R;
      const extY0 = -0.82 * R, extY1 = -0.14 * R;
      extrudeBox(extX0, extX1, extY0, extY1, 0, dockZ1, '#b8bec4', '#989ea4', '#7f858b', -18.0, 1.0);
      extrudeBox(extX0 - 0.015 * R, extX1, extY0 - 0.015 * R, extY1, dockZ1, dockZ2, '#d5dade', '#b4bac0', '#969ca2', -17.0, 1.0);

      // 4 olive military supply crates arranged along the back-left (-X, -Y) extension (all to the left of the gantry crane)
      const cW = 0.145 * R, cD = 0.21 * R, cH = 0.175 * R * H;
      pushOliveCrate(-0.88 * R, -0.88 * R + cW, -0.74 * R, -0.74 * R + cD, dockZ2, dockZ2 + cH, -8.0);
      pushOliveCrate(-0.88 * R, -0.88 * R + cW, -0.74 * R, -0.74 * R + cD, dockZ2 + cH, dockZ2 + 2.0 * cH, -7.2);

      pushOliveCrate(-0.72 * R, -0.72 * R + cW, -0.70 * R, -0.70 * R + cD, dockZ2, dockZ2 + cH, -6.4);
      pushOliveCrate(-0.72 * R, -0.72 * R + cW, -0.70 * R, -0.70 * R + cD, dockZ2 + cH, dockZ2 + 1.85 * cH, -5.6);

      pushOliveCrate(-0.56 * R, -0.56 * R + cW, -0.66 * R, -0.66 * R + cD, dockZ2, dockZ2 + cH, -4.8);
      pushOliveCrate(-0.56 * R, -0.56 * R + cW, -0.66 * R, -0.66 * R + cD, dockZ2 + cH, dockZ2 + 1.75 * cH, -4.0);

      pushOliveCrate(-0.40 * R, -0.40 * R + cW, -0.62 * R, -0.62 * R + cD, dockZ2, dockZ2 + 1.15 * cH, -3.2);

      // 2. Main Right (+X) Raised Concrete Loading Dock
      const dkX0 = -0.24 * R, dkX1 = 0.88 * R;
      const dkY0 = -0.82 * R, dkY1 = 0.56 * R;
      extrudeBox(dkX0, dkX1, dkY0, dkY1, 0, dockZ1, '#b8bec4', '#989ea4', '#7f858b', -15.0, 1.05);
      extrudeBox(dkX0 - 0.015 * R, dkX1 + 0.02 * R, dkY0 - 0.015 * R, dkY1 + 0.02 * R, dockZ1, dockZ2, '#d5dade', '#b4bac0', '#969ca2', -14.0, 1.05);

      // Concrete dock surface expansion joint grid lines
      polys.push({
        depth: scProj.project((dkX0 + dkX1) * 0.5, (dkY0 + dkY1) * 0.5, dockZ2).depth - 12.5,
        customDraw(ctx2) {
          ctx2.save();
          ctx2.strokeStyle = 'rgba(85, 92, 102, 0.55)';
          ctx2.lineWidth = 1.0;
          for (const gx of [0.16 * R, 0.52 * R]) {
            const p0 = scProj.project(gx, dkY0 + 0.04 * R, dockZ2 + 0.002 * R);
            const p1 = scProj.project(gx, dkY1 - 0.04 * R, dockZ2 + 0.002 * R);
            ctx2.beginPath();
            ctx2.moveTo(p0.x, p0.y);
            ctx2.lineTo(p1.x, p1.y);
            ctx2.stroke();
          }
          for (const gy of [-0.46 * R, -0.10 * R, 0.24 * R]) {
            const p0 = scProj.project(dkX0 + 0.04 * R, gy, dockZ2 + 0.002 * R);
            const p1 = scProj.project(dkX1 - 0.04 * R, gy, dockZ2 + 0.002 * R);
            ctx2.beginPath();
            ctx2.moveTo(p0.x, p0.y);
            ctx2.lineTo(p1.x, p1.y);
            ctx2.stroke();
          }
          ctx2.restore();
        }
      });

      // Two vertical steel access ladders on the Front-Right (+X) wall of the concrete dock
      polys.push({
        depth: scProj.project(dkX1 + 0.03 * R, 0.35 * R, dockZ1).depth + 6.0,
        customDraw(ctx2) {
          ctx2.save();
          ctx2.strokeStyle = '#252b33';
          ctx2.lineWidth = 1.8;
          for (const ly of [0.36 * R, -0.56 * R]) {
            const r0 = scProj.project(dkX1 + 0.024 * R, ly - 0.035 * R, 0);
            const r1 = scProj.project(dkX1 + 0.024 * R, ly - 0.035 * R, dockZ2 + 0.035 * R * H);
            const l0 = scProj.project(dkX1 + 0.024 * R, ly + 0.035 * R, 0);
            const l1 = scProj.project(dkX1 + 0.024 * R, ly + 0.035 * R, dockZ2 + 0.035 * R * H);
            ctx2.beginPath();
            ctx2.moveTo(r0.x, r0.y); ctx2.lineTo(r1.x, r1.y);
            ctx2.moveTo(l0.x, l0.y); ctx2.lineTo(l1.x, l1.y);
            ctx2.stroke();
            for (let k = 1; k <= 4; k++) {
              const fz = (k / 4.5) * dockZ2;
              const sA = scProj.project(dkX1 + 0.024 * R, ly - 0.035 * R, fz);
              const sB = scProj.project(dkX1 + 0.024 * R, ly + 0.035 * R, fz);
              ctx2.beginPath();
              ctx2.moveTo(sA.x, sA.y); ctx2.lineTo(sB.x, sB.y);
              ctx2.stroke();
            }
          }
          ctx2.restore();
        }
      });

      // 3. Elevated Left (-X, +Y) Chinook Helipad on Concrete Pillars
      const hpX0 = -1.18 * R, hpX1 = -0.24 * R;
      const hpY0 = -0.14 * R, hpY1 = 0.74 * R;
      const hpZ0 = 0.29 * R * H, hpZ1 = 0.37 * R * H;

      // Under-deck dark shadow slab on ground
      pushQuad([
        { x: hpX0 + 0.04 * R, y: hpY0 + 0.04 * R, z: 0.002 * R },
        { x: hpX1, y: hpY0 + 0.04 * R, z: 0.002 * R },
        { x: hpX1, y: hpY1 - 0.02 * R, z: 0.002 * R },
        { x: hpX0 + 0.04 * R, y: hpY1 - 0.02 * R, z: 0.002 * R }
      ], 'rgba(38, 42, 48, 0.38)', 'transparent', 0, -20.0);

      // 3 Front-Left (+Y) Square Concrete Support Pillars
      const pW = 0.095 * R;
      for (const [px, py, pBias] of [
        [hpX0 + 0.09 * R, hpY1 - 0.11 * R, -2.0],
        [(hpX0 + hpX1) * 0.5, hpY1 - 0.11 * R, -1.0],
        [hpX1 - 0.09 * R, hpY1 - 0.11 * R, 0.0]
      ]) {
        extrudeBox(px - pW * 0.5, px + pW * 0.5, py - pW * 0.5, py + pW * 0.5, 0, hpZ0, '#b0b6bc', '#989ea4', '#7e848a', pBias, 1.05);
      }

      // Helipad Deck Base Box (Yellow Hazard Rim)
      extrudeBox(hpX0, hpX1, hpY0, hpY1, hpZ0, hpZ1, '#ebb529', '#d8a11f', '#b88616', 2.0, 1.1);

      // Sloped dark-grey steel transition ramp/chute from Helipad (+X edge) down to Main Dock
      const rmpY0 = 0.06 * R, rmpY1 = 0.42 * R;
      const rmpX0 = hpX1, rmpX1 = hpX1 + 0.15 * R;
      pushQuad([
        { x: rmpX0, y: rmpY0, z: hpZ1 - 0.01 * R * H },
        { x: rmpX1, y: rmpY0, z: dockZ2 },
        { x: rmpX1, y: rmpY1, z: dockZ2 },
        { x: rmpX0, y: rmpY1, z: hpZ1 - 0.01 * R * H }
      ], '#767d85', '#1e242b', 1.05, 4.5);
      pushQuad([
        { x: rmpX0, y: rmpY1, z: dockZ2 },
        { x: rmpX1, y: rmpY1, z: dockZ2 },
        { x: rmpX0, y: rmpY1, z: hpZ1 - 0.01 * R * H }
      ], '#555b62', '#1e242b', 1.0, 4.7);

      // Helipad Top Asphalt Surface, Hazard Stripes on Rim & Side Walls, and Circular "H" Landing Markings
      polys.push({
        depth: scProj.project((hpX0 + hpX1) * 0.5, (hpY0 + hpY1) * 0.5, hpZ1).depth + 3.5,
        customDraw(ctx2) {
          ctx2.save();

          // Draw black diagonal hazard chevrons along the Front-Left (+Y) vertical side rim of the helipad
          ctx2.fillStyle = '#262a30';
          const nStripesX = 7;
          for (let i = 0; i < nStripesX; i++) {
            const xA = hpX0 + (i / nStripesX) * (hpX1 - hpX0);
            const xB = xA + 0.48 * ((hpX1 - hpX0) / nStripesX);
            const sPts = [
              scProj.project(xA, hpY1 + 0.002 * R, hpZ0),
              scProj.project(xB, hpY1 + 0.002 * R, hpZ0),
              scProj.project(Math.min(hpX1, xB + 0.04 * R), hpY1 + 0.002 * R, hpZ1),
              scProj.project(Math.min(hpX1, xA + 0.04 * R), hpY1 + 0.002 * R, hpZ1)
            ];
            ctx2.beginPath();
            sPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
            ctx2.closePath();
            ctx2.fill();
          }

          // Top perimeter black hazard blocks along the 4 edges of the yellow border
          const padInset = 0.058 * R;
          for (let i = 0; i < 7; i++) {
            const f0 = (i + 0.15) / 7, f1 = (i + 0.62) / 7;
            const xa0 = hpX0 + f0 * (hpX1 - hpX0), xa1 = hpX0 + f1 * (hpX1 - hpX0);
            const t1 = [
              scProj.project(xa0, hpY1 - padInset, hpZ1 + 0.001 * R),
              scProj.project(xa1, hpY1 - padInset, hpZ1 + 0.001 * R),
              scProj.project(xa1, hpY1, hpZ1 + 0.001 * R),
              scProj.project(xa0, hpY1, hpZ1 + 0.001 * R)
            ];
            ctx2.beginPath();
            t1.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
            ctx2.closePath();
            ctx2.fill();

            const t2 = [
              scProj.project(xa0, hpY0, hpZ1 + 0.001 * R),
              scProj.project(xa1, hpY0, hpZ1 + 0.001 * R),
              scProj.project(xa1, hpY0 + padInset, hpZ1 + 0.001 * R),
              scProj.project(xa0, hpY0 + padInset, hpZ1 + 0.001 * R)
            ];
            ctx2.beginPath();
            t2.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
            ctx2.closePath();
            ctx2.fill();

            const ya0 = hpY0 + f0 * (hpY1 - hpY0), ya1 = hpY0 + f1 * (hpY1 - hpY0);
            const t3 = [
              scProj.project(hpX0, ya0, hpZ1 + 0.001 * R),
              scProj.project(hpX0 + padInset, ya0, hpZ1 + 0.001 * R),
              scProj.project(hpX0 + padInset, ya1, hpZ1 + 0.001 * R),
              scProj.project(hpX0, ya1, hpZ1 + 0.001 * R)
            ];
            ctx2.beginPath();
            t3.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
            ctx2.closePath();
            ctx2.fill();

            const t4 = [
              scProj.project(hpX1 - padInset, ya0, hpZ1 + 0.001 * R),
              scProj.project(hpX1, ya0, hpZ1 + 0.001 * R),
              scProj.project(hpX1, ya1, hpZ1 + 0.001 * R),
              scProj.project(hpX1 - padInset, ya1, hpZ1 + 0.001 * R)
            ];
            ctx2.beginPath();
            t4.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
            ctx2.closePath();
            ctx2.fill();
          }

          // Inner Dark Asphalt Landing Pad Polygon
          const inPts = [
            scProj.project(hpX0 + padInset, hpY0 + padInset, hpZ1 + 0.002 * R),
            scProj.project(hpX1 - padInset, hpY0 + padInset, hpZ1 + 0.002 * R),
            scProj.project(hpX1 - padInset, hpY1 - padInset, hpZ1 + 0.002 * R),
            scProj.project(hpX0 + padInset, hpY1 - padInset, hpZ1 + 0.002 * R)
          ];
          ctx2.beginPath();
          inPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
          ctx2.closePath();
          ctx2.fillStyle = '#686b6e';
          ctx2.fill();
          ctx2.strokeStyle = '#1e242b';
          ctx2.lineWidth = 1.1;
          ctx2.stroke();

          // Centered Circular Tan/Gold Helipad Ring + "H" Symbol
          const hCx = (hpX0 + hpX1) * 0.5;
          const hCy = (hpY0 + hpY1) * 0.5;
          const rOuter = 0.29 * R;
          const rInner = 0.255 * R;
          const drawIsoRing = (rad, lw, color, dashed = false) => {
            ctx2.beginPath();
            for (let i = 0; i <= 32; i++) {
              const a = (i / 32) * Math.PI * 2;
              const pt = scProj.project(hCx + Math.cos(a) * rad, hCy + Math.sin(a) * rad, hpZ1 + 0.003 * R);
              if (i === 0) ctx2.moveTo(pt.x, pt.y);
              else ctx2.lineTo(pt.x, pt.y);
            }
            ctx2.strokeStyle = color;
            ctx2.lineWidth = lw;
            if (dashed) ctx2.setLineDash([4, 3]);
            else ctx2.setLineDash([]);
            ctx2.stroke();
            ctx2.setLineDash([]);
          };
          drawIsoRing(rOuter, 2.2, '#d8c38e', true);
          drawIsoRing(rInner, 1.8, '#d8c38e', false);

          // Isometric "H" in center of helipad
          const hPoly = (xA, xB, yA, yB) => {
            const pts = [
              scProj.project(hCx + xA, hCy + yA, hpZ1 + 0.004 * R),
              scProj.project(hCx + xB, hCy + yA, hpZ1 + 0.004 * R),
              scProj.project(hCx + xB, hCy + yB, hpZ1 + 0.004 * R),
              scProj.project(hCx + xA, hCy + yB, hpZ1 + 0.004 * R)
            ];
            ctx2.beginPath();
            pts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
            ctx2.closePath();
            ctx2.fillStyle = '#d8c38e';
            ctx2.fill();
            ctx2.strokeStyle = '#4a4538';
            ctx2.lineWidth = 0.8;
            ctx2.stroke();
          };
          hPoly(-0.125 * R, -0.068 * R, -0.135 * R, 0.135 * R);
          hPoly(0.068 * R, 0.125 * R, -0.135 * R, 0.135 * R);
          hPoly(-0.068 * R, 0.068 * R, -0.028 * R, 0.028 * R);

          ctx2.restore();
        }
      });

      // 4. Roller Conveyor Belt on Main Concrete Loading Dock
      const cvX0 = 0.14 * R, cvX1 = 0.32 * R;
      const cvY0 = -0.42 * R, cvY1 = 0.34 * R;
      const cvZ0 = dockZ2, cvZ1 = dockZ2 + 0.055 * R * H, cvZ2 = dockZ2 + 0.115 * R * H;
      for (const ly of [-0.36 * R, -0.12 * R, 0.10 * R, 0.28 * R]) {
        extrudeBox(cvX0 + 0.02 * R, cvX1 - 0.02 * R, ly - 0.02 * R, ly + 0.02 * R, cvZ0, cvZ1, '#47525e', '#3b424c', '#2d333b', 3.0, 0.85);
      }
      extrudeBox(cvX0, cvX1, cvY0, cvY1, cvZ1, cvZ2, '#9ca6b0', '#7e8892', '#646e78', 4.0, 1.0);
      polys.push({
        depth: scProj.project((cvX0 + cvX1) * 0.5, (cvY0 + cvY1) * 0.5, cvZ2).depth + 5.0,
        customDraw(ctx2) {
          ctx2.save();
          const rPts = [
            scProj.project(cvX0 + 0.025 * R, cvY0 + 0.025 * R, cvZ2 + 0.002 * R),
            scProj.project(cvX1 - 0.025 * R, cvY0 + 0.025 * R, cvZ2 + 0.002 * R),
            scProj.project(cvX1 - 0.025 * R, cvY1 - 0.025 * R, cvZ2 + 0.002 * R),
            scProj.project(cvX0 + 0.025 * R, cvY1 - 0.025 * R, cvZ2 + 0.002 * R)
          ];
          ctx2.beginPath();
          rPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
          ctx2.closePath();
          ctx2.fillStyle = '#47525e';
          ctx2.fill();
          ctx2.strokeStyle = '#1e242b';
          ctx2.lineWidth = 0.9;
          ctx2.stroke();
          ctx2.strokeStyle = '#2d353e';
          ctx2.lineWidth = 0.9;
          for (let i = 1; i <= 9; i++) {
            const ry = cvY0 + 0.025 * R + (i / 10) * (cvY1 - cvY0 - 0.05 * R);
            const pA = scProj.project(cvX0 + 0.028 * R, ry, cvZ2 + 0.003 * R);
            const pB = scProj.project(cvX1 - 0.028 * R, ry, cvZ2 + 0.003 * R);
            ctx2.beginPath();
            ctx2.moveTo(pA.x, pA.y);
            ctx2.lineTo(pB.x, pB.y);
            ctx2.stroke();
          }
          ctx2.restore();
        }
      });

      // Small Wooden & Blue Crates on the right side of the concrete loading dock
      extrudeBox(0.50 * R, 0.63 * R, 0.02 * R, 0.15 * R, dockZ2, dockZ2 + 0.13 * R * H, '#c89b56', '#ab8040', '#8c6630', 6.5, 0.95);
      extrudeBox(0.54 * R, 0.67 * R, -0.14 * R, -0.01 * R, dockZ2, dockZ2 + 0.13 * R * H, '#d2a560', '#b48948', '#946e36', 6.0, 0.95);
      extrudeBox(0.58 * R, 0.71 * R, -0.30 * R, -0.17 * R, dockZ2, dockZ2 + 0.13 * R * H, '#5ea2dc', '#4888c0', '#366ea0', 5.5, 0.95);

      // 5. Yellow Double-Girder Overhead Bridge Gantry Crane Straddling the Loading Dock along Y
      const crX0 = -0.02 * R, crX1 = 0.16 * R;
      const crYFront = 0.40 * R, crYBack = -0.58 * R;
      const zPlinth = dockZ2 + 0.055 * R * H;
      const zBeam0 = dockZ2 + 0.66 * R * H;
      const zBeam1 = dockZ2 + 0.76 * R * H;
      const crBias = 8.0;

      const buildCraneTower = (yCenter, tBias) => {
        const y0 = yCenter - 0.045 * R, y1 = yCenter + 0.045 * R;
        // Concrete foundation plinth spanning across X under both legs
        extrudeBox(crX0 - 0.035 * R, crX1 + 0.035 * R, y0 - 0.03 * R, y1 + 0.03 * R, dockZ2, zPlinth, '#9ea4ac', '#80868e', '#686e76', tBias, 1.0);
        // 2 Vertical yellow legs separated along X (one under each girder!)
        const colW = 0.042 * R;
        extrudeBox(crX0, crX0 + colW, y0, y1, zPlinth, zBeam0, '#f0b82d', '#dfa522', '#bd8918', tBias + 0.4, 1.0);
        extrudeBox(crX1 - colW, crX1, y0, y1, zPlinth, zBeam0, '#f0b82d', '#dfa522', '#bd8918', tBias + 0.8, 1.0);

        // X-bracing lattice between the two X-separated vertical legs
        polys.push({
          depth: scProj.project((crX0 + crX1) * 0.5, y1, (zPlinth + zBeam0) * 0.5).depth + tBias + 0.6,
          customDraw(ctx2) {
            ctx2.save();
            const levels = 3;
            for (let k = 0; k < levels; k++) {
              const za = zPlinth + (k / levels) * (zBeam0 - zPlinth);
              const zb = zPlinth + ((k + 1) / levels) * (zBeam0 - zPlinth);
              const p1 = scProj.project(crX0 + colW, yCenter, za);
              const p2 = scProj.project(crX1 - colW, yCenter, zb);
              const p3 = scProj.project(crX1 - colW, yCenter, za);
              const p4 = scProj.project(crX0 + colW, yCenter, zb);
              ctx2.strokeStyle = '#1e242b';
              ctx2.lineWidth = 3.4;
              ctx2.beginPath();
              ctx2.moveTo(p1.x, p1.y); ctx2.lineTo(p2.x, p2.y);
              ctx2.moveTo(p3.x, p3.y); ctx2.lineTo(p4.x, p4.y);
              ctx2.stroke();
              ctx2.strokeStyle = '#d99b22';
              ctx2.lineWidth = 1.8;
              ctx2.beginPath();
              ctx2.moveTo(p1.x, p1.y); ctx2.lineTo(p2.x, p2.y);
              ctx2.moveTo(p3.x, p3.y); ctx2.lineTo(p4.x, p4.y);
              ctx2.stroke();
            }
            ctx2.restore();
          }
        });
      };

      buildCraneTower(crYBack, crBias - 1.5);
      buildCraneTower(crYFront, crBias + 3.0);

      // Suspended Hoist Trolley, Cable, Hook & Yellow Spreader Bar under the crane beam
      const spY = -0.06 * R + Math.sin(t * 1.5) * 0.06 * R;
      const spX = (crX0 + crX1) * 0.5;
      extrudeBox(spX - 0.045 * R, spX + 0.045 * R, spY - 0.055 * R, spY + 0.055 * R, zBeam0 - 0.07 * R * H, zBeam0, '#64748b', '#475569', '#334155', crBias + 1.5, 0.95);
      const spZ0 = zBeam0 - 0.25 * R * H, spZ1 = zBeam0 - 0.20 * R * H;
      extrudeBox(spX - 0.032 * R, spX + 0.032 * R, spY - 0.15 * R, spY + 0.15 * R, spZ0, spZ1, '#f4c038', '#dfa522', '#b88416', crBias + 1.8, 0.95);
      polys.push({
        depth: scProj.project(spX, spY, spZ1).depth + crBias + 2.0,
        customDraw(ctx2) {
          ctx2.save();
          const pTop = scProj.project(spX, spY, zBeam0 - 0.07 * R * H);
          const pBot = scProj.project(spX, spY, spZ1);
          ctx2.beginPath();
          ctx2.moveTo(pTop.x, pTop.y);
          ctx2.lineTo(pBot.x, pBot.y);
          ctx2.strokeStyle = '#1e242b';
          ctx2.lineWidth = 2.2;
          ctx2.stroke();
          const pMid = scProj.project(spX, spY, (zBeam0 - 0.07 * R * H + spZ1) * 0.5);
          ctx2.beginPath();
          ctx2.arc(pMid.x, pMid.y, 2.6, 0, Math.PI * 2);
          ctx2.stroke();
          ctx2.restore();
        }
      });

      // Double-Girder Overhead Yellow Bridge Beams spanning across Y (two parallel girders with gap)
      const gSpanY0 = crYBack - 0.10 * R, gSpanY1 = crYFront + 0.10 * R;
      extrudeBox(crX0 - 0.01 * R, crX0 + 0.042 * R, gSpanY0, gSpanY1, zBeam0, zBeam1, '#f5c23b', '#dfa522', '#bd8918', crBias + 4.2, 1.05);
      extrudeBox(crX1 - 0.042 * R, crX1 + 0.01 * R, gSpanY0, gSpanY1, zBeam0, zBeam1, '#f5c23b', '#dfa522', '#bd8918', crBias + 4.8, 1.05);

      // Top Light-Grey Hoist Motor & Control Cabin perched on Back-Right end of the yellow crane bridge
      const mhX0 = crX0 - 0.015 * R, mhX1 = crX1 + 0.025 * R;
      const mhY0 = crYBack - 0.04 * R, mhY1 = crYBack + 0.16 * R;
      const mhZ0 = zBeam1, mhZ1 = mhZ0 + 0.15 * R * H;
      extrudeBox(mhX0, mhX1, mhY0, mhY1, mhZ0, mhZ1, '#d2d8de', '#b0b8c0', '#8f97a0', crBias + 6.0, 1.05);

      // 6. Front-Left (+Y) Ground Olive Military Crates (in front of concrete dock wall)
      const gY0 = dkY1 + 0.04 * R, gY1 = dkY1 + 0.25 * R;
      pushOliveCrate(-0.38 * R, -0.22 * R, gY0, gY1, 0, 0.175 * R * H, 14.0);
      pushOliveCrate(-0.21 * R, -0.05 * R, gY0, gY1, 0, 0.175 * R * H, 14.5);
      pushOliveCrate(0.02 * R, 0.18 * R, gY0, gY1, 0, 0.175 * R * H, 15.0);
      pushOliveCrate(0.02 * R, 0.18 * R, gY0, gY1, 0.175 * R * H, 0.33 * R * H, 15.5);
      pushOliveCrate(0.19 * R, 0.35 * R, gY0, gY1, 0, 0.175 * R * H, 16.0);
      pushOliveCrate(0.19 * R, 0.35 * R, gY0, gY1, 0.175 * R * H, 0.33 * R * H, 16.5);

      // 7. Front-Right (+X) Ground Blue-Tarped Wooden Pallets
      const pushBluePallet = (px0, px1, py0, py1, pBias) => {
        const pzPal = 0.045 * R * H;
        const pzMid = 0.12 * R * H;
        const pzTop = 0.23 * R * H;
        extrudeBox(px0, px1, py0, py1, 0, pzPal, '#bf9052', '#a4783e', '#845e2e', pBias, 0.95);
        extrudeBox(px0 + 0.015 * R, px1 - 0.015 * R, py0 + 0.015 * R, py1 - 0.015 * R, pzPal, pzMid, '#657852', '#556644', '#445236', pBias + 0.3, 0.95);
        extrudeBox(px0 + 0.015 * R, px1 - 0.015 * R, py0 + 0.015 * R, py1 - 0.015 * R, pzMid, pzTop, '#72b0e0', '#5896c8', '#427aa8', pBias + 0.6, 1.0);
        polys.push({
          depth: scProj.project(px1, py1, pzTop).depth + pBias + 1.0,
          customDraw(ctx2) {
            ctx2.save();
            ctx2.strokeStyle = '#1e242b';
            ctx2.lineWidth = 1.0;
            const mx = (px0 + px1) * 0.5;
            const my = (py0 + py1) * 0.5;
            const pX0 = scProj.project(px0 + 0.015 * R, my, pzTop + 0.002 * R);
            const pX1 = scProj.project(px1 - 0.015 * R, my, pzTop + 0.002 * R);
            const pX2 = scProj.project(px1 - 0.015 * R, my, pzPal);
            const pY0 = scProj.project(mx, py0 + 0.015 * R, pzTop + 0.002 * R);
            const pY1 = scProj.project(mx, py1 - 0.015 * R, pzTop + 0.002 * R);
            const pY2 = scProj.project(mx, py1 - 0.015 * R, pzPal);
            ctx2.beginPath();
            ctx2.moveTo(pX0.x, pX0.y); ctx2.lineTo(pX1.x, pX1.y); ctx2.lineTo(pX2.x, pX2.y);
            ctx2.moveTo(pY0.x, pY0.y); ctx2.lineTo(pY1.x, pY1.y); ctx2.lineTo(pY2.x, pY2.y);
            ctx2.stroke();
            ctx2.restore();
          }
        });
      };

      pushBluePallet(dkX1 + 0.05 * R, dkX1 + 0.31 * R, 0.02 * R, 0.28 * R, 16.0);
      pushBluePallet(dkX1 + 0.05 * R, dkX1 + 0.31 * R, -0.34 * R, -0.08 * R, 15.0);

      flushFaces(ctx, faces);
      return;
    }

    if (defId === 'USA_BARRACKS') {
      // High-Fidelity Ligne-Claire 3D Model matching usa_barracks.png:
      // 1. Dark asphalt muster courtyard with 2 dashed tan/white rectangular squad formation markings & olive supply crates
      // 2. Main Barracks Hall in Back-Right (-Y) with tapered concrete pilasters, wide roll-up troop door (+Y), yellow/black hazard threshold ramp, 2 horizontal blue windows (+X), navy frieze & flat roof with USAF Star-and-Bars roundel + satellite dish & antennas
      // 3. Sloped concrete perimeter blast wall with exterior buttresses, navy base trim & open front-left (+Y) courtyard gate
      // 4. Left (-X, +Y) Guard Watchtower with concrete base, 2-tier stacked sandbag collar, blue-glass observation cab & 2 roof searchlights
      const brAngle = 0.75;
      const brProj = createProjector(brAngle, pitchScale, zScale);
      const R = r * 1.15 * SS;
      const polys = faces;

      const pushQuad = (pts3d, fill, stroke = '#1e242b', lineWidth = 1.0, bias = 0) => {
        const projPts = pts3d.map(pt => brProj.project(pt.x, pt.y, pt.z));
        const depth = projPts.reduce((acc, pt) => acc + pt.depth, 0) / projPts.length + bias;
        polys.push({ pts: projPts, depth, fill, stroke, lineWidth });
      };

      const extrudeBox = (x0, x1, y0, y1, z0, z1, topCol, leftCol, rightCol, bias = 0, lw = 1.0) => {
        pushQuad([
          { x: x0, y: y0, z: z0 }, { x: x1, y: y0, z: z0 },
          { x: x1, y: y0, z: z1 }, { x: x0, y: y0, z: z1 }
        ], rightCol, '#1e242b', lw, bias - 0.3);
        pushQuad([
          { x: x0, y: y0, z: z0 }, { x: x0, y: y1, z: z0 },
          { x: x0, y: y1, z: z1 }, { x: x0, y: y0, z: z1 }
        ], leftCol, '#1e242b', lw, bias - 0.3);
        pushQuad([
          { x: x0, y: y1, z: z0 }, { x: x1, y: y1, z: z0 },
          { x: x1, y: y1, z: z1 }, { x: x0, y: y1, z: z1 }
        ], leftCol, '#1e242b', lw, bias + 0.15);
        pushQuad([
          { x: x1, y: y0, z: z0 }, { x: x1, y: y1, z: z0 },
          { x: x1, y: y1, z: z1 }, { x: x1, y: y0, z: z1 }
        ], rightCol, '#1e242b', lw, bias + 0.15);
        pushQuad([
          { x: x0, y: y0, z: z1 }, { x: x1, y: y0, z: z1 },
          { x: x1, y: y1, z: z1 }, { x: x0, y: y1, z: z1 }
        ], topCol, '#1e242b', lw, bias + 0.3);
      };

      const extrudeTaperedBox = (bx0, bx1, by0, by1, tx0, tx1, ty0, ty1, z0, z1, topCol, leftCol, rightCol, bias = 0, lw = 1.0) => {
        pushQuad([
          { x: bx0, y: by0, z: z0 }, { x: bx1, y: by0, z: z0 },
          { x: tx1, y: ty0, z: z1 }, { x: tx0, y: ty0, z: z1 }
        ], rightCol, '#1e242b', lw, bias - 0.3);
        pushQuad([
          { x: bx0, y: by0, z: z0 }, { x: bx0, y: by1, z: z0 },
          { x: tx0, y: ty1, z: z1 }, { x: tx0, y: ty0, z: z1 }
        ], leftCol, '#1e242b', lw, bias - 0.3);
        pushQuad([
          { x: bx0, y: by1, z: z0 }, { x: bx1, y: by1, z: z0 },
          { x: tx1, y: ty1, z: z1 }, { x: tx0, y: ty1, z: z1 }
        ], leftCol, '#1e242b', lw, bias + 0.15);
        pushQuad([
          { x: bx1, y: by0, z: z0 }, { x: bx1, y: by1, z: z0 },
          { x: tx1, y: ty1, z: z1 }, { x: tx1, y: ty0, z: z1 }
        ], rightCol, '#1e242b', lw, bias + 0.15);
        pushQuad([
          { x: tx0, y: ty0, z: z1 }, { x: tx1, y: ty0, z: z1 },
          { x: tx1, y: ty1, z: z1 }, { x: tx0, y: ty1, z: z1 }
        ], topCol, '#1e242b', lw, bias + 0.3);
      };

      // 1. Dark Asphalt Muster Courtyard Slab + 2 Dashed Squad Boxes
      const cyX0 = -0.84 * R, cyX1 = 0.84 * R;
      const cyY0 = -0.80 * R, cyY1 = 0.86 * R;
      const zCourt = 0.03 * R * H;
      extrudeBox(cyX0, cyX1, cyY0, cyY1, 0, zCourt, '#6c7075', '#585c60', '#484c50', -24.0, 1.0);

      // Dashed tan/white squad assembly boxes painted on the front courtyard asphalt
      polys.push({
        depth: brProj.project(-0.10 * R, 0.50 * R, zCourt).depth - 18.0,
        customDraw(ctx2) {
          ctx2.save();
          ctx2.strokeStyle = '#d8cfb8';
          ctx2.lineWidth = 1.6;
          ctx2.setLineDash([4, 3]);
          const drawSquadRect = (rx0, rx1, ry0, ry1) => {
            const pts = [
              brProj.project(rx0, ry0, zCourt + 0.002 * R),
              brProj.project(rx1, ry0, zCourt + 0.002 * R),
              brProj.project(rx1, ry1, zCourt + 0.002 * R),
              brProj.project(rx0, ry1, zCourt + 0.002 * R)
            ];
            ctx2.beginPath();
            pts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
            ctx2.closePath();
            ctx2.stroke();
          };
          drawSquadRect(-0.42 * R, -0.06 * R, 0.28 * R, 0.68 * R);
          drawSquadRect(0.02 * R, 0.36 * R, 0.28 * R, 0.68 * R);
          ctx2.setLineDash([]);
          ctx2.restore();
        }
      });

      // Back-Left (-X) Perimeter Wall Segment & Olive Supply Crates in courtyard behind watchtower
      const wH = 0.28 * R * H;
      const wBaseH = 0.06 * R * H;
      // Back-left perimeter wall running along X = -0.84R..-0.72R from watchtower (Y = +0.44R) to Y = -0.34R, then turning to meet main hall at X = -0.38R
      extrudeTaperedBox(-0.84 * R, -0.72 * R, -0.34 * R, 0.44 * R, -0.82 * R, -0.74 * R, -0.32 * R, 0.44 * R, zCourt, zCourt + wH, '#d4d8dc', '#b4b8be', '#969ca2', -6.0, 1.0);
      extrudeBox(-0.845 * R, -0.715 * R, -0.345 * R, 0.44 * R, zCourt, zCourt + wBaseH, '#3e5478', '#384c6e', '#2b3b56', -5.7, 0.95);
      extrudeTaperedBox(-0.84 * R, -0.36 * R, -0.36 * R, -0.24 * R, -0.82 * R, -0.36 * R, -0.34 * R, -0.26 * R, zCourt, zCourt + wH, '#d4d8dc', '#b4b8be', '#969ca2', -5.5, 1.0);
      // 2 Olive Military Crates in the courtyard between the watchtower (+Y) and main hall (-Y)
      const pushOliveCrate = (cx0, cx1, cy0, cy1, cz0, cz1, cBias) => {
        extrudeBox(cx0, cx1, cy0, cy1, cz0, cz1, '#849462', '#6d7c4f', '#55623d', cBias, 0.95);
        polys.push({
          depth: brProj.project((cx0 + cx1) * 0.5, cy1, cz1).depth + cBias + 0.4,
          customDraw(ctx2) {
            ctx2.save();
            ctx2.strokeStyle = '#384227';
            ctx2.lineWidth = 0.85;
            const p0 = brProj.project(cx0 + 0.02 * R, cy1 + 0.002 * R, cz0 + 0.02 * R * H);
            const p1 = brProj.project(cx1 - 0.02 * R, cy1 + 0.002 * R, cz1 - 0.02 * R * H);
            ctx2.beginPath(); ctx2.moveTo(p0.x, p0.y); ctx2.lineTo(p1.x, p1.y); ctx2.stroke();
            ctx2.restore();
          }
        });
      };
      pushOliveCrate(-0.68 * R, -0.53 * R, 0.04 * R, 0.22 * R, zCourt, zCourt + 0.17 * R * H, 1.5);
      pushOliveCrate(-0.52 * R, -0.37 * R, -0.10 * R, 0.08 * R, zCourt, zCourt + 0.17 * R * H, 2.0);

      // 2. Main Barracks Hall in Back-Right (X: -0.38R..+0.56R, Y: -0.78R..+0.18R)
      const mbX0 = -0.38 * R, mbX1 = 0.56 * R;
      const mbY0 = -0.78 * R, mbY1 = 0.18 * R;
      const mbZWall = zCourt + 0.50 * R * H;
      const mbZFrieze = zCourt + 0.58 * R * H;
      const mbZRoof = zCourt + 0.65 * R * H;
      const mbBias = -2.0;

      // Main hall lower body (slightly tapered concrete walls)
      extrudeTaperedBox(
        mbX0, mbX1, mbY0, mbY1,
        mbX0 + 0.03 * R, mbX1 - 0.03 * R, mbY0 + 0.03 * R, mbY1 - 0.03 * R,
        zCourt, mbZWall,
        '#d0d4d8', '#bcc0c6', '#9ea4aa', mbBias, 1.05
      );
      // Navy-blue base trim along +X and +Y walls
      extrudeBox(mbX0 - 0.005 * R, mbX1 + 0.005 * R, mbY0 - 0.005 * R, mbY1 + 0.005 * R, zCourt, zCourt + 0.065 * R * H, '#3e5478', '#384c6e', '#2b3b56', mbBias + 0.4, 0.95);

      // Tapered Concrete Pilasters / Buttresses on Front-Left (+Y) and Front-Right (+X) facades
      extrudeTaperedBox(mbX0, mbX0 + 0.13 * R, mbY1 - 0.04 * R, mbY1 + 0.045 * R, mbX0 + 0.03 * R, mbX0 + 0.13 * R, mbY1 - 0.04 * R, mbY1 - 0.01 * R, zCourt, mbZWall, '#d4d8dc', '#c4c8ce', '#a0a6ac', mbBias + 0.8, 1.0);
      extrudeTaperedBox(mbX1 - 0.13 * R, mbX1, mbY1 - 0.04 * R, mbY1 + 0.045 * R, mbX1 - 0.13 * R, mbX1 - 0.03 * R, mbY1 - 0.04 * R, mbY1 - 0.01 * R, zCourt, mbZWall, '#d4d8dc', '#c4c8ce', '#a0a6ac', mbBias + 1.2, 1.0);

      // 3 Tapered Pilasters along the Front-Right (+X) window wall
      for (const [py0, py1, pB] of [
        [mbY0, mbY0 + 0.11 * R, mbBias + 0.6],
        [-0.36 * R, -0.24 * R, mbBias + 1.0],
        [mbY1 - 0.12 * R, mbY1, mbBias + 1.4]
      ]) {
        extrudeTaperedBox(mbX1 - 0.04 * R, mbX1 + 0.045 * R, py0, py1, mbX1 - 0.04 * R, mbX1 - 0.01 * R, py0 + 0.01 * R, py1 - 0.01 * R, zCourt, mbZWall, '#d4d8dc', '#b8bcc2', '#989ea4', pB, 1.0);
      }

      // Upper Navy-Blue Frieze Band & Overhanging Light-Grey Roof Cornice
      extrudeBox(mbX0 + 0.02 * R, mbX1 - 0.02 * R, mbY0 + 0.02 * R, mbY1 - 0.02 * R, mbZWall, mbZFrieze, '#48628c', '#3c5378', '#2d3f5e', mbBias + 1.8, 1.05);
      extrudeBox(mbX0, mbX1, mbY0, mbY1, mbZFrieze, mbZRoof, '#dce0e4', '#c2c7cc', '#a4aab0', mbBias + 2.2, 1.1);

      // Anchor depth on the top-front edge of the main hall so roof & facade details ALWAYS sort on top of the roof slab!
      const mbRoofTopDepth = brProj.project((mbX0 + mbX1) * 0.5, (mbY0 + mbY1) * 0.5, mbZRoof).depth + mbBias + 3.5;
      const mbFrontTopDepth = brProj.project((mbX0 + mbX1) * 0.5, mbY1, mbZRoof).depth + mbBias + 3.5;

      // Recessed Flat Roof Deck + USAF Star-and-Bars Roundel + Roll-Up Troop Door + 2 Side Windows
      polys.push({
        depth: Math.max(mbRoofTopDepth, mbFrontTopDepth),
        customDraw(ctx2) {
          ctx2.save();

          // 1) Corrugated Roll-Up Troop Bay Door on +Y facade
          const dX0 = mbX0 + 0.16 * R, dX1 = mbX1 - 0.16 * R;
          const dY = mbY1 + 0.005 * R;
          const dZ0 = zCourt + 0.04 * R * H, dZ1 = mbZWall - 0.04 * R * H;
          const doorPts = [
            brProj.project(dX0, dY, dZ0),
            brProj.project(dX1, dY, dZ0),
            brProj.project(dX1, dY, dZ1),
            brProj.project(dX0, dY, dZ1)
          ];
          ctx2.beginPath();
          doorPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
          ctx2.closePath();
          ctx2.fillStyle = '#9aa0a6';
          ctx2.fill();
          ctx2.strokeStyle = '#1e242b';
          ctx2.lineWidth = 1.2;
          ctx2.stroke();

          // Horizontal roll-up door slats
          ctx2.strokeStyle = '#484e56';
          ctx2.lineWidth = 1.0;
          for (let k = 1; k <= 6; k++) {
            const sz = dZ0 + (k / 7) * (dZ1 - dZ0);
            const pA = brProj.project(dX0 + 0.015 * R, dY + 0.002 * R, sz);
            const pB = brProj.project(dX1 - 0.015 * R, dY + 0.002 * R, sz);
            ctx2.beginPath();
            ctx2.moveTo(pA.x, pA.y);
            ctx2.lineTo(pB.x, pB.y);
            ctx2.stroke();
          }

          // Yellow & Black Diagonal Hazard Threshold Ramp in front of the troop door
          const rY0 = mbY1, rY1 = mbY1 + 0.095 * R;
          const rPts = [
            brProj.project(dX0, rY0, zCourt + 0.045 * R * H),
            brProj.project(dX1, rY0, zCourt + 0.045 * R * H),
            brProj.project(dX1, rY1, zCourt + 0.004 * R),
            brProj.project(dX0, rY1, zCourt + 0.004 * R)
          ];
          ctx2.beginPath();
          rPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
          ctx2.closePath();
          ctx2.fillStyle = '#eab308';
          ctx2.fill();
          ctx2.strokeStyle = '#1e242b';
          ctx2.lineWidth = 1.05;
          ctx2.stroke();

          // Black hazard stripes on ramp
          ctx2.fillStyle = '#1e242b';
          const nHaz = 5;
          for (let i = 0; i < nHaz; i++) {
            const hx0 = dX0 + ((i + 0.15) / nHaz) * (dX1 - dX0);
            const hx1 = dX0 + ((i + 0.58) / nHaz) * (dX1 - dX0);
            const hp = [
              brProj.project(hx0, rY0, zCourt + 0.046 * R * H),
              brProj.project(hx1, rY0, zCourt + 0.046 * R * H),
              brProj.project(hx1, rY1, zCourt + 0.005 * R),
              brProj.project(hx0, rY1, zCourt + 0.005 * R)
            ];
            ctx2.beginPath();
            hp.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
            ctx2.closePath();
            ctx2.fill();
          }

          // 2) Two Horizontal Blue-Grey Windows on the +X Right Wall
          for (const [wy0, wy1] of [[-0.64 * R, -0.39 * R], [-0.20 * R, 0.05 * R]]) {
            const wz0 = zCourt + 0.18 * R * H, wz1 = zCourt + 0.36 * R * H;
            const wx = mbX1 - 0.005 * R;
            const winPts = [
              brProj.project(wx, wy0, wz0),
              brProj.project(wx, wy1, wz0),
              brProj.project(wx, wy1, wz1),
              brProj.project(wx, wy0, wz1)
            ];
            ctx2.beginPath();
            winPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
            ctx2.closePath();
            ctx2.fillStyle = '#5c7c99';
            ctx2.fill();
            ctx2.strokeStyle = '#1e242b';
            ctx2.lineWidth = 1.05;
            ctx2.stroke();
            const mA = brProj.project(wx + 0.002 * R, (wy0 + wy1) * 0.5, wz0);
            const mB = brProj.project(wx + 0.002 * R, (wy0 + wy1) * 0.5, wz1);
            ctx2.beginPath();
            ctx2.moveTo(mA.x, mA.y);
            ctx2.lineTo(mB.x, mB.y);
            ctx2.stroke();
          }

          // 3) Recessed Flat Roof Surface & Large Painted USAF Star-and-Bars Roundel
          const rfInset = 0.055 * R;
          const rfPts = [
            brProj.project(mbX0 + rfInset, mbY0 + rfInset, mbZRoof + 0.002 * R),
            brProj.project(mbX1 - rfInset, mbY0 + rfInset, mbZRoof + 0.002 * R),
            brProj.project(mbX1 - rfInset, mbY1 - rfInset, mbZRoof + 0.002 * R),
            brProj.project(mbX0 + rfInset, mbY1 - rfInset, mbZRoof + 0.002 * R)
          ];
          ctx2.beginPath();
          rfPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
          ctx2.closePath();
          ctx2.fillStyle = '#c8cdd2';
          ctx2.fill();
          ctx2.strokeStyle = '#1e242b';
          ctx2.lineWidth = 1.0;
          ctx2.stroke();

          // Roof USAF Star-and-Bars Insignia
          const rCx = (mbX0 + mbX1) * 0.5;
          const rCy = (mbY0 + mbY1) * 0.5 + 0.04 * R;
          const rCz = mbZRoof + 0.004 * R;
          const barPts = [
            brProj.project(rCx - 0.30 * R, rCy - 0.065 * R, rCz),
            brProj.project(rCx + 0.30 * R, rCy - 0.065 * R, rCz),
            brProj.project(rCx + 0.30 * R, rCy + 0.065 * R, rCz),
            brProj.project(rCx - 0.30 * R, rCy + 0.065 * R, rCz)
          ];
          ctx2.beginPath();
          barPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
          ctx2.closePath();
          ctx2.fillStyle = '#334b70';
          ctx2.fill();
          ctx2.strokeStyle = '#1e242b';
          ctx2.lineWidth = 0.9;
          ctx2.stroke();

          const barInPts = [
            brProj.project(rCx - 0.28 * R, rCy - 0.032 * R, rCz + 0.001 * R),
            brProj.project(rCx + 0.28 * R, rCy - 0.032 * R, rCz + 0.001 * R),
            brProj.project(rCx + 0.28 * R, rCy + 0.032 * R, rCz + 0.001 * R),
            brProj.project(rCx - 0.28 * R, rCy + 0.032 * R, rCz + 0.001 * R)
          ];
          ctx2.beginPath();
          barInPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
          ctx2.closePath();
          ctx2.fillStyle = '#e5d8b0';
          ctx2.fill();

          const radDisc = 0.145 * R;
          ctx2.beginPath();
          for (let i = 0; i <= 24; i++) {
            const a = (i / 24) * Math.PI * 2;
            const pt = brProj.project(rCx + Math.cos(a) * radDisc, rCy + Math.sin(a) * radDisc, rCz + 0.002 * R);
            if (i === 0) ctx2.moveTo(pt.x, pt.y);
            else ctx2.lineTo(pt.x, pt.y);
          }
          ctx2.closePath();
          ctx2.fillStyle = '#334b70';
          ctx2.fill();
          ctx2.strokeStyle = '#1e242b';
          ctx2.lineWidth = 1.0;
          ctx2.stroke();

          ctx2.beginPath();
          for (let i = 0; i < 10; i++) {
            const a = -Math.PI * 0.25 + (i * Math.PI) / 5;
            const rStar = i % 2 === 0 ? radDisc * 0.88 : radDisc * 0.36;
            const pt = brProj.project(rCx + Math.cos(a) * rStar, rCy + Math.sin(a) * rStar, rCz + 0.003 * R);
            if (i === 0) ctx2.moveTo(pt.x, pt.y);
            else ctx2.lineTo(pt.x, pt.y);
          }
          ctx2.closePath();
          ctx2.fillStyle = '#e5d8b0';
          ctx2.fill();
          ctx2.strokeStyle = '#1e242b';
          ctx2.lineWidth = 0.7;
          ctx2.stroke();

          // 4) Circular USAF Star Crest Badge Centered Above the Troop Door on +Y Frieze/Cornice
          const bCx = (dX0 + dX1) * 0.5;
          const bCy = mbY1 + 0.015 * R;
          const bCz = (mbZWall + mbZFrieze) * 0.5;
          const wPts = [
            brProj.project(bCx - 0.16 * R, bCy, bCz - 0.025 * R * H),
            brProj.project(bCx + 0.16 * R, bCy, bCz - 0.025 * R * H),
            brProj.project(bCx + 0.16 * R, bCy, bCz + 0.025 * R * H),
            brProj.project(bCx - 0.16 * R, bCy, bCz + 0.025 * R * H)
          ];
          ctx2.beginPath();
          wPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
          ctx2.closePath();
          ctx2.fillStyle = '#d8cfb8';
          ctx2.fill();
          ctx2.strokeStyle = '#1e242b';
          ctx2.lineWidth = 0.9;
          ctx2.stroke();

          const cCenter = brProj.project(bCx, bCy + 0.005 * R, bCz);
          ctx2.beginPath();
          ctx2.arc(cCenter.x, cCenter.y, 8.2, 0, Math.PI * 2);
          ctx2.fillStyle = '#334b70';
          ctx2.fill();
          ctx2.strokeStyle = '#1e242b';
          ctx2.lineWidth = 1.15;
          ctx2.stroke();

          ctx2.beginPath();
          for (let i = 0; i < 10; i++) {
            const a = -Math.PI * 0.5 + (i * Math.PI) / 5;
            const rad = i % 2 === 0 ? 6.4 : 2.6;
            const sx = cCenter.x + Math.cos(a) * rad;
            const sy = cCenter.y + Math.sin(a) * rad;
            if (i === 0) ctx2.moveTo(sx, sy);
            else ctx2.lineTo(sx, sy);
          }
          ctx2.closePath();
          ctx2.fillStyle = '#e5d8b0';
          ctx2.fill();

          ctx2.restore();
        }
      });

      // Roof Satellite Dish & Twin Whip Antennas along Back-Right (-Y) Roof Edge (bias +22 so they sort on top of the roof slab)
      const antY = mbY0 + 0.12 * R;
      extrudeBox(-0.24 * R, -0.15 * R, antY - 0.045 * R, antY + 0.045 * R, mbZRoof, mbZRoof + 0.05 * R * H, '#b8bec4', '#989ea4', '#7e848a', mbBias + 22.0, 0.9);
      extrudeBox(-0.02 * R, 0.08 * R, antY - 0.05 * R, antY + 0.05 * R, mbZRoof, mbZRoof + 0.06 * R * H, '#b8bec4', '#989ea4', '#7e848a', mbBias + 22.5, 0.9);
      extrudeBox(0.24 * R, 0.33 * R, antY - 0.045 * R, antY + 0.045 * R, mbZRoof, mbZRoof + 0.05 * R * H, '#b8bec4', '#989ea4', '#7e848a', mbBias + 23.0, 0.9);

      polys.push({
        depth: Math.max(mbRoofTopDepth, mbFrontTopDepth) + 5.0,
        customDraw(ctx2) {
          ctx2.save();
          ctx2.strokeStyle = '#1e242b';
          // Left whip antenna
          const l0 = brProj.project(-0.195 * R, antY, mbZRoof + 0.05 * R * H);
          const l1 = brProj.project(-0.195 * R, antY, mbZRoof + 0.34 * R * H);
          ctx2.lineWidth = 2.0;
          ctx2.beginPath(); ctx2.moveTo(l0.x, l0.y); ctx2.lineTo(l1.x, l1.y); ctx2.stroke();
          // Right whip antenna + short secondary mast
          const r0 = brProj.project(0.285 * R, antY, mbZRoof + 0.05 * R * H);
          const r1 = brProj.project(0.285 * R, antY, mbZRoof + 0.34 * R * H);
          const r2 = brProj.project(0.35 * R, antY + 0.04 * R, mbZRoof + 0.02 * R * H);
          const r3 = brProj.project(0.35 * R, antY + 0.04 * R, mbZRoof + 0.18 * R * H);
          ctx2.beginPath();
          ctx2.moveTo(r0.x, r0.y); ctx2.lineTo(r1.x, r1.y);
          ctx2.moveTo(r2.x, r2.y); ctx2.lineTo(r3.x, r3.y);
          ctx2.stroke();

          // Center Satellite Dish Mast & Parabolic Dish
          const dBase = brProj.project(0.03 * R, antY, mbZRoof + 0.06 * R * H);
          const dHub = brProj.project(0.03 * R, antY, mbZRoof + 0.25 * R * H);
          ctx2.lineWidth = 2.8;
          ctx2.beginPath(); ctx2.moveTo(dBase.x, dBase.y); ctx2.lineTo(dHub.x, dHub.y); ctx2.stroke();

          ctx2.translate(dHub.x, dHub.y);
          ctx2.rotate(-0.35);
          ctx2.beginPath();
          ctx2.ellipse(0, 0, 10.5, 13.5, 0, 0, Math.PI * 2);
          ctx2.fillStyle = '#dce2e8';
          ctx2.fill();
          ctx2.lineWidth = 1.3;
          ctx2.strokeStyle = '#1e242b';
          ctx2.stroke();
          ctx2.beginPath();
          ctx2.moveTo(0, 0);
          ctx2.lineTo(-5, 4);
          ctx2.stroke();
          ctx2.restore();
        }
      });

      // 3. Left Corner Guard Watchtower + Sandbag Revetment + Left Perimeter Wall (-X, +Y)
      const wtX0 = -0.84 * R, wtX1 = -0.50 * R;
      const wtY0 = 0.44 * R, wtY1 = 0.78 * R;
      const zWtBase = zCourt + 0.34 * R * H;
      const zWtBags = zCourt + 0.47 * R * H;
      const zWtCab = zCourt + 0.66 * R * H;
      const zWtRoof = zCourt + 0.73 * R * H;
      const wtBias = 8.0;

      // Sloped Perimeter Blast Wall below/around the Watchtower (-X and +Y left gate wing)
      extrudeTaperedBox(-0.86 * R, -0.44 * R, 0.38 * R, 0.88 * R, -0.82 * R, -0.46 * R, 0.42 * R, 0.84 * R, zCourt, zCourt + wH, '#d4d8dc', '#c2c7cc', '#9ca2a8', wtBias - 1.5, 1.05);
      extrudeBox(-0.865 * R, -0.435 * R, 0.375 * R, 0.885 * R, zCourt, zCourt + wBaseH, '#3e5478', '#384c6e', '#2b3b56', wtBias - 1.2, 0.95);
      // Exterior sloped buttress ribs on the watchtower perimeter wall (+Y face)
      extrudeTaperedBox(-0.74 * R, -0.66 * R, 0.82 * R, 0.91 * R, -0.74 * R, -0.66 * R, 0.82 * R, 0.84 * R, zCourt, zCourt + wH, '#d4d8dc', '#c6cbd0', '#969ca2', wtBias - 0.8, 1.0);

      // Watchtower lower concrete bunker block with doorway facing courtyard (+X)
      extrudeBox(wtX0, wtX1, wtY0, wtY1, zCourt, zWtBase, '#c8cdd2', '#b8bdc4', '#949aa2', wtBias, 1.05);
      extrudeBox(wtX0 - 0.005 * R, wtX1 + 0.005 * R, wtY0 - 0.005 * R, wtY1 + 0.005 * R, zWtBase - 0.07 * R * H, zWtBase - 0.015 * R * H, '#3e5478', '#384c6e', '#2b3b56', wtBias + 0.3, 0.95);
      pushQuad([
        { x: wtX1 + 0.004 * R, y: wtY0 + 0.10 * R, z: zCourt },
        { x: wtX1 + 0.004 * R, y: wtY1 - 0.10 * R, z: zCourt },
        { x: wtX1 + 0.004 * R, y: wtY1 - 0.10 * R, z: zCourt + 0.21 * R * H },
        { x: wtX1 + 0.004 * R, y: wtY0 + 0.10 * R, z: zCourt + 0.21 * R * H }
      ], '#262c34', '#1e242b', 1.0, wtBias + 0.6);

      // 2-Tier Stacked Tan Sandbag Collar around the Watchtower mid-deck
      const sbZMid = (zWtBase + zWtBags) * 0.5;
      extrudeBox(wtX0 - 0.025 * R, wtX1 + 0.025 * R, wtY0 - 0.025 * R, wtY1 + 0.025 * R, zWtBase, sbZMid, '#c4ae82', '#b29b70', '#947e56', wtBias + 1.0, 1.0);
      extrudeBox(wtX0 - 0.02 * R, wtX1 + 0.02 * R, wtY0 - 0.02 * R, wtY1 + 0.02 * R, sbZMid, zWtBags, '#cbb68a', '#b8a276', '#9a845c', wtBias + 1.4, 1.0);
      polys.push({
        depth: brProj.project(wtX1, wtY1, sbZMid).depth + wtBias + 1.6,
        customDraw(ctx2) {
          ctx2.save();
          ctx2.strokeStyle = '#4a3f2b';
          ctx2.lineWidth = 0.95;
          for (const fx of [wtX0 + 0.11 * R, wtX0 + 0.23 * R]) {
            const p0 = brProj.project(fx, wtY1 + 0.026 * R, zWtBase);
            const p1 = brProj.project(fx, wtY1 + 0.026 * R, zWtBags);
            ctx2.beginPath(); ctx2.moveTo(p0.x, p0.y); ctx2.lineTo(p1.x, p1.y); ctx2.stroke();
          }
          for (const fy of [wtY0 + 0.11 * R, wtY0 + 0.23 * R]) {
            const p0 = brProj.project(wtX1 + 0.026 * R, fy, zWtBase);
            const p1 = brProj.project(wtX1 + 0.026 * R, fy, zWtBags);
            ctx2.beginPath(); ctx2.moveTo(p0.x, p0.y); ctx2.lineTo(p1.x, p1.y); ctx2.stroke();
          }
          ctx2.restore();
        }
      });

      // Watchtower Glass Observation Cab & Overhanging Flat Concrete Roof
      extrudeBox(wtX0 + 0.02 * R, wtX1 - 0.02 * R, wtY0 + 0.02 * R, wtY1 - 0.02 * R, zWtBags, zWtCab, '#688aa8', '#5c7e9c', '#486682', wtBias + 2.0, 1.05);
      extrudeBox(wtX0 + 0.015 * R, wtX1 - 0.015 * R, wtY0 + 0.015 * R, wtY1 - 0.015 * R, zWtCab, zWtRoof, '#dedbd0', '#c4c0b4', '#a4a096', wtBias + 2.6, 1.1);

      // Dual Circular Yellow-Lensed Searchlights on Watchtower Roof Corners
      polys.push({
        depth: brProj.project(wtX1, wtY1, zWtRoof + 0.06 * R * H).depth + wtBias + 4.5,
        customDraw(ctx2) {
          ctx2.save();
          for (const [lx, ly] of [[wtX0 + 0.03 * R, wtY1 - 0.03 * R], [wtX1 - 0.03 * R, wtY0 + 0.03 * R]]) {
            const pBase = brProj.project(lx, ly, zWtRoof);
            const pHead = brProj.project(lx, ly, zWtRoof + 0.075 * R * H);
            ctx2.strokeStyle = '#1e242b';
            ctx2.lineWidth = 2.2;
            ctx2.beginPath(); ctx2.moveTo(pBase.x, pBase.y); ctx2.lineTo(pHead.x, pHead.y); ctx2.stroke();
            ctx2.beginPath();
            ctx2.arc(pHead.x, pHead.y, 5.2, 0, Math.PI * 2);
            ctx2.fillStyle = '#47525e';
            ctx2.fill();
            ctx2.lineWidth = 1.2;
            ctx2.stroke();
            ctx2.beginPath();
            ctx2.arc(pHead.x - 0.8, pHead.y + 0.8, 3.6, 0, Math.PI * 2);
            ctx2.fillStyle = '#f6d04d';
            ctx2.fill();
            ctx2.stroke();
          }
          ctx2.restore();
        }
      });

      // 4. Front-Bottom & Right (+X, +Y) Sloped Concrete Perimeter Blast Wall + Buttresses
      const fwBias = 12.0;
      // Olive military crates tucked inside the front-bottom wall corner (tall enough to peek over wall)
      pushOliveCrate(0.10 * R, 0.27 * R, 0.54 * R, 0.72 * R, zCourt, zCourt + 0.24 * R * H, fwBias - 1.5);
      pushOliveCrate(0.28 * R, 0.45 * R, 0.54 * R, 0.72 * R, zCourt, zCourt + 0.24 * R * H, fwBias - 1.2);

      // Right Wall segment running along X = +0.74R..+0.86R from Y = -0.78R to +0.86R
      extrudeTaperedBox(0.74 * R, 0.86 * R, -0.78 * R, 0.86 * R, 0.75 * R, 0.82 * R, -0.76 * R, 0.82 * R, zCourt, zCourt + wH, '#d4d8dc', '#b8bdc4', '#989ea4', fwBias, 1.05);
      extrudeBox(0.735 * R, 0.865 * R, -0.785 * R, 0.865 * R, zCourt, zCourt + wBaseH, '#3e5478', '#384c6e', '#2b3b56', fwBias + 0.3, 0.95);

      // Front-Bottom Wall segment running along Y = +0.74R..+0.86R from X = +0.06R (right side of gate) to +0.86R
      extrudeTaperedBox(0.06 * R, 0.86 * R, 0.74 * R, 0.86 * R, 0.08 * R, 0.82 * R, 0.75 * R, 0.82 * R, zCourt, zCourt + wH, '#d4d8dc', '#c2c7cc', '#989ea4', fwBias + 1.0, 1.05);
      extrudeBox(0.055 * R, 0.865 * R, 0.735 * R, 0.865 * R, zCourt, zCourt + wBaseH, '#3e5478', '#384c6e', '#2b3b56', fwBias + 1.3, 0.95);

      // Exterior Sloped Buttress Ribs along the Front-Bottom (+Y) and Front-Right (+X) Perimeter Walls
      extrudeTaperedBox(0.24 * R, 0.32 * R, 0.82 * R, 0.91 * R, 0.24 * R, 0.32 * R, 0.82 * R, 0.84 * R, zCourt, zCourt + wH, '#d4d8dc', '#c6cbd0', '#969ca2', fwBias + 1.8, 1.0);
      extrudeTaperedBox(0.54 * R, 0.62 * R, 0.82 * R, 0.91 * R, 0.54 * R, 0.62 * R, 0.82 * R, 0.84 * R, zCourt, zCourt + wH, '#d4d8dc', '#c6cbd0', '#969ca2', fwBias + 2.0, 1.0);

      for (const by of [0.52 * R, 0.16 * R, -0.20 * R, -0.56 * R]) {
        extrudeTaperedBox(0.82 * R, 0.91 * R, by, by + 0.08 * R, 0.82 * R, 0.84 * R, by, by + 0.08 * R, zCourt, zCourt + wH, '#d4d8dc', '#b8bdc4', '#90969c', fwBias + 2.2, 1.0);
      }

      flushFaces(ctx, faces);
      return;
    }

    if (defId === 'USA_WAR_FACTORY') {
      // High-Fidelity Ligne-Claire 3D Model matching usa_war_factory.png:
      // 1. Fitted concrete perimeter apron & front dark-asphalt bay threshold (no oversized square pad)
      // 2. Back-Right (-Y, +X) generator shed & twin tall cylindrical exhaust smokestacks with dark bands & organic smoke plumes
      // 3. Large Quonset / Barrel-Vaulted Vehicle Assembly Hangar:
      //    - Corrugated steel side walls with 4 horizontal framed workshop windows high on the +X wall
      //    - Smoothly segmented curved barrel-vault roof with central raised spine ridge, transverse arch ribs & 4 framed rectangular skylights
      //    - Wide open front (+Y) assembly bay with yellow/black hazard threshold strip, interior blue tool bench, spare engine & M1A1 Crusader battle tank inside
      // 4. Left (-X) Yellow Steel Overhead Gantry Crane with lattice legs, double bridge girders, rear hoist motor house & suspended hook
      // 5. Right (+X) Yard Props: 4 cylindrical steel oil drums with orange bands, stacked spare tank tread loops with roadwheel slots, olive ammo crates & 2 wooden crates
      const wfAngle = 0.75;
      const wfProj = createProjector(wfAngle, pitchScale, zScale);
      const R = r * 1.18 * SS;
      const polys = faces;

      const pushQuad = (pts3d, fill, stroke = '#1e242b', lineWidth = 1.0, bias = 0) => {
        const projPts = pts3d.map(pt => wfProj.project(pt.x, pt.y, pt.z));
        const depth = projPts.reduce((acc, pt) => acc + pt.depth, 0) / projPts.length + bias;
        polys.push({ pts: projPts, depth, fill, stroke, lineWidth });
      };

      const extrudeBox = (x0, x1, y0, y1, z0, z1, topCol, leftCol, rightCol, bias = 0, lw = 1.0) => {
        pushQuad([
          { x: x0, y: y0, z: z0 }, { x: x1, y: y0, z: z0 },
          { x: x1, y: y0, z: z1 }, { x: x0, y: y0, z: z1 }
        ], rightCol, '#1e242b', lw, bias - 0.3);
        pushQuad([
          { x: x0, y: y0, z: z0 }, { x: x0, y: y1, z: z0 },
          { x: x0, y: y1, z: z1 }, { x: x0, y: y0, z: z1 }
        ], leftCol, '#1e242b', lw, bias - 0.3);
        pushQuad([
          { x: x0, y: y1, z: z0 }, { x: x1, y: y1, z: z0 },
          { x: x1, y: y1, z: z1 }, { x: x0, y: y1, z: z1 }
        ], leftCol, '#1e242b', lw, bias + 0.15);
        pushQuad([
          { x: x1, y: y0, z: z0 }, { x: x1, y: y1, z: z0 },
          { x: x1, y: y1, z: z1 }, { x: x1, y: y0, z: z1 }
        ], rightCol, '#1e242b', lw, bias + 0.15);
        pushQuad([
          { x: x0, y: y0, z: z1 }, { x: x1, y: y0, z: z1 },
          { x: x1, y: y1, z: z1 }, { x: x0, y: y1, z: z1 }
        ], topCol, '#1e242b', lw, bias + 0.3);
      };

      const zPad = 0.02 * R * H;
      const hgX0 = -0.54 * R, hgX1 = 0.46 * R;
      const hgY0 = -0.68 * R, hgY1 = 0.52 * R;
      const hgCx = (hgX0 + hgX1) * 0.5;
      const hgRx = (hgX1 - hgX0) * 0.5;
      const zEave = zPad + 0.42 * R * H;
      const archRz = 0.36 * R * H;
      const hgBias = 0.0;

      // 1. Fitted Concrete Yard Apron under the Hangar & Right Prop Yard (matching sprite footprint)
      extrudeBox(hgX0 - 0.04 * R, hgX1 + 0.36 * R, hgY0 - 0.06 * R, hgY1 + 0.05 * R, 0, zPad, '#b5afa4', '#9c968c', '#827d74', -28.0, 0.95);

      // 2. Back-Right (-Y, +X) Generator Annex & Twin Tall Cylindrical Exhaust Smokestacks (sorted BEHIND hangar roof)
      const rearBias = -32.0;
      extrudeBox(0.32 * R, 0.66 * R, -0.70 * R, -0.34 * R, zPad, zPad + 0.32 * R * H, '#aeb4ba', '#989ea4', '#7e848a', rearBias + 4.0, 1.0);
      extrudeBox(0.34 * R, 0.64 * R, -0.68 * R, -0.36 * R, zPad + 0.32 * R * H, zPad + 0.36 * R * H, '#c4cad0', '#a8aeb4', '#8a9096', rearBias + 4.5, 0.95);

      const pushSmokestack = (sx, sy, sBias) => {
        const zS0 = zPad + 0.38 * R * H;
        const zS1 = zPad + 1.00 * R * H;
        const rBot = 0.068 * R, rTop = 0.062 * R;
        const N = 10;
        for (let i = 0; i < N; i++) {
          const a0 = (i / N) * Math.PI * 2;
          const a1 = ((i + 1) / N) * Math.PI * 2;
          const am = (a0 + a1) * 0.5;
          const col = Math.sin(am + 0.6) > 0.2 ? '#b4bac0' : (Math.sin(am + 0.6) > -0.3 ? '#949aa0' : '#747a80');
          pushQuad([
            { x: sx + Math.cos(a0) * rBot, y: sy + Math.sin(a0) * rBot, z: zS0 },
            { x: sx + Math.cos(a1) * rBot, y: sy + Math.sin(a1) * rBot, z: zS0 },
            { x: sx + Math.cos(a1) * rTop, y: sy + Math.sin(a1) * rTop, z: zS1 },
            { x: sx + Math.cos(a0) * rTop, y: sy + Math.sin(a0) * rTop, z: zS1 }
          ], col, '#1e242b', 0.85, sBias);
        }
        polys.push({
          depth: wfProj.project(sx, sy, zS1).depth + sBias + 1.0,
          customDraw(ctx2) {
            ctx2.save();
            // Dark band near top + dark opening rim
            for (const fz of [0.76, 0.98]) {
              const zz = zS0 + fz * (zS1 - zS0);
              const rr = rTop * 1.02;
              ctx2.beginPath();
              for (let i = 0; i <= 16; i++) {
                const a = (i / 16) * Math.PI * 2;
                const pt = wfProj.project(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr, zz);
                if (i === 0) ctx2.moveTo(pt.x, pt.y);
                else ctx2.lineTo(pt.x, pt.y);
              }
              ctx2.closePath();
              if (fz > 0.9) {
                ctx2.fillStyle = '#363c44';
                ctx2.fill();
              }
              ctx2.strokeStyle = '#1e242b';
              ctx2.lineWidth = 1.2;
              ctx2.stroke();
            }
            // Organic cel-shaded steam/smoke plume drifting up-right
            const pTop = wfProj.project(sx, sy, zS1 + 0.03 * R * H);
            ctx2.fillStyle = 'rgba(235, 238, 242, 0.92)';
            ctx2.strokeStyle = '#687078';
            ctx2.lineWidth = 0.85;
            ctx2.beginPath();
            ctx2.arc(pTop.x + 2, pTop.y - 5, 5.5, 0, Math.PI * 2);
            ctx2.arc(pTop.x + 7, pTop.y - 10, 7.0, 0, Math.PI * 2);
            ctx2.arc(pTop.x + 13, pTop.y - 15, 5.2, 0, Math.PI * 2);
            ctx2.fill();
            ctx2.restore();
          }
        });
      };
      pushSmokestack(0.06 * R, -0.78 * R, rearBias - 8.0);
      pushSmokestack(0.24 * R, -0.72 * R, rearBias - 6.0);

      // 3. Main Quonset / Barrel-Vaulted Vehicle Assembly Hangar
      // Lower vertical hangar walls (zPad..zEave) + dark slate base plinth band
      extrudeBox(hgX0, hgX1, hgY0, hgY1, zPad, zEave, '#c4c9ce', '#d0d5da', '#a6acb2', hgBias, 1.05);
      extrudeBox(hgX0 - 0.005 * R, hgX1 + 0.005 * R, hgY0 - 0.005 * R, hgY1 + 0.005 * R, zPad, zPad + 0.075 * R * H, '#525c68', '#5c6775', '#424a54', hgBias + 0.3, 0.95);

      // Segmented Barrel-Vaulted Roof (10 longitudinal arch strips x 4 transverse bays)
      const nBays = 4;
      const nArch = 10;
      for (let j = 0; j < nBays; j++) {
        const by0 = hgY0 + (j / nBays) * (hgY1 - hgY0);
        const by1 = hgY0 + ((j + 1) / nBays) * (hgY1 - hgY0);
        for (let i = 0; i < nArch; i++) {
          const t0 = Math.PI * (1 - i / nArch);
          const t1 = Math.PI * (1 - (i + 1) / nArch);
          const x0 = hgCx + hgRx * Math.cos(t0);
          const z0 = zEave + archRz * Math.sin(t0);
          const x1 = hgCx + hgRx * Math.cos(t1);
          const z1 = zEave + archRz * Math.sin(t1);
          const roofPanelCol = i < 3 ? '#949fa8' : (i < 6 ? '#808b94' : (i < 8 ? '#707b84' : '#626c75'));
          pushQuad([
            { x: x0, y: by0, z: z0 },
            { x: x1, y: by0, z: z1 },
            { x: x1, y: by1, z: z1 },
            { x: x0, y: by1, z: z0 }
          ], roofPanelCol, '#323a42', 0.75, hgBias + 1.2 + j * 0.15);
        }
      }

      // Overhanging Curved Eave Trim Lips along -X and +X roof edges
      extrudeBox(hgX0 - 0.025 * R, hgX0 + 0.015 * R, hgY0 - 0.01 * R, hgY1 + 0.01 * R, zEave - 0.015 * R * H, zEave + 0.025 * R * H, '#88929c', '#747e88', '#5c646e', hgBias + 1.8, 0.95);
      extrudeBox(hgX1 - 0.015 * R, hgX1 + 0.025 * R, hgY0 - 0.01 * R, hgY1 + 0.01 * R, zEave - 0.015 * R * H, zEave + 0.025 * R * H, '#88929c', '#747e88', '#5c646e', hgBias + 2.2, 0.95);

      // Raised Central Longitudinal Roof Spine Ridge along the crown of the barrel vault
      extrudeBox(hgCx - 0.06 * R, hgCx + 0.06 * R, hgY0 - 0.01 * R, hgY1 + 0.01 * R, zEave + archRz - 0.015 * R * H, zEave + archRz + 0.038 * R * H, '#98a2ac', '#848e98', '#6c7680', hgBias + 2.8, 1.0);

      // Front & Back Curved Arch Gable Rim Bands (matching sprite's thick curved front/back roof arches)
      for (const [ry0, ry1, rBias] of [[hgY0 - 0.01 * R, hgY0 + 0.04 * R, hgBias + 2.9], [hgY1 - 0.04 * R, hgY1 + 0.015 * R, hgBias + 3.4]]) {
        for (let i = 0; i < nArch; i++) {
          const t0 = Math.PI * (1 - i / nArch);
          const t1 = Math.PI * (1 - (i + 1) / nArch);
          const x0 = hgCx + (hgRx + 0.02 * R) * Math.cos(t0);
          const z0 = zEave + (archRz + 0.022 * R * H) * Math.sin(t0);
          const x1 = hgCx + (hgRx + 0.02 * R) * Math.cos(t1);
          const z1 = zEave + (archRz + 0.022 * R * H) * Math.sin(t1);
          pushQuad([
            { x: x0, y: ry0, z: z0 },
            { x: x1, y: ry0, z: z1 },
            { x: x1, y: ry1, z: z1 },
            { x: x0, y: ry1, z: z0 }
          ], i < 5 ? '#98a2ac' : '#78828c', '#1e242b', 0.95, rBias);
        }
      }

      // 4 Framed Rectangular Skylights on the Barrel-Vault Roof (2 on left slope, 2 on right slope)
      const pushRoofSkylight = (theta0, theta1, sy0, sy1, skBias) => {
        const x0 = hgCx + (hgRx + 0.012 * R) * Math.cos(theta0);
        const z0 = zEave + (archRz + 0.012 * R * H) * Math.sin(theta0);
        const x1 = hgCx + (hgRx + 0.012 * R) * Math.cos(theta1);
        const z1 = zEave + (archRz + 0.012 * R * H) * Math.sin(theta1);
        // Outer light-grey skylight frame
        pushQuad([
          { x: x0, y: sy0, z: z0 },
          { x: x1, y: sy0, z: z1 },
          { x: x1, y: sy1, z: z1 },
          { x: x0, y: sy1, z: z0 }
        ], '#b8c0c8', '#1e242b', 1.0, skBias);
        // Inner cyan-blue glass pane
        const xm0 = x0 + (x1 - x0) * 0.16, zm0 = z0 + (z1 - z0) * 0.16;
        const xm1 = x0 + (x1 - x0) * 0.84, zm1 = z0 + (z1 - z0) * 0.84;
        pushQuad([
          { x: xm0, y: sy0 + 0.025 * R, z: zm0 + 0.002 * R * H },
          { x: xm1, y: sy0 + 0.025 * R, z: zm1 + 0.002 * R * H },
          { x: xm1, y: sy1 - 0.025 * R, z: zm1 + 0.002 * R * H },
          { x: xm0, y: sy1 - 0.025 * R, z: zm0 + 0.002 * R * H }
        ], '#88b4cc', '#1e242b', 0.85, skBias + 0.2);
      };
      pushRoofSkylight(Math.PI * 0.72, Math.PI * 0.58, -0.44 * R, -0.08 * R, hgBias + 3.6);
      pushRoofSkylight(Math.PI * 0.72, Math.PI * 0.58, 0.04 * R, 0.38 * R, hgBias + 3.8);
      pushRoofSkylight(Math.PI * 0.40, Math.PI * 0.26, -0.44 * R, -0.08 * R, hgBias + 3.7);
      pushRoofSkylight(Math.PI * 0.40, Math.PI * 0.26, 0.04 * R, 0.38 * R, hgBias + 3.9);

      // Front-Left (+Y) Arch Tympanum Wall, Open Tank Assembly Bay & +X Side Windows
      const frontBayDepth = wfProj.project(hgCx, hgY1, zEave + archRz).depth + hgBias + 5.0;
      polys.push({
        depth: frontBayDepth,
        customDraw(ctx2) {
          ctx2.save();

          // 1) Vertical Corrugated Siding Lines & 4 Framed Horizontal Windows on +X Right Wall
          const wx = hgX1 + 0.004 * R;
          ctx2.strokeStyle = '#7e848a';
          ctx2.lineWidth = 0.8;
          for (let k = 1; k < 12; k++) {
            const sy = hgY0 + (k / 12) * (hgY1 - hgY0);
            const p0 = wfProj.project(wx, sy, zPad + 0.075 * R * H);
            const p1 = wfProj.project(wx, sy, zEave - 0.015 * R * H);
            ctx2.beginPath(); ctx2.moveTo(p0.x, p0.y); ctx2.lineTo(p1.x, p1.y); ctx2.stroke();
          }

          for (let j = 0; j < nBays; j++) {
            const wy0 = hgY0 + ((j + 0.16) / nBays) * (hgY1 - hgY0);
            const wy1 = hgY0 + ((j + 0.84) / nBays) * (hgY1 - hgY0);
            const wz0 = zEave - 0.16 * R * H, wz1 = zEave - 0.055 * R * H;
            // Light-grey window frame
            const fPts = [
              wfProj.project(wx + 0.002 * R, wy0 - 0.015 * R, wz0 - 0.015 * R * H),
              wfProj.project(wx + 0.002 * R, wy1 + 0.015 * R, wz0 - 0.015 * R * H),
              wfProj.project(wx + 0.002 * R, wy1 + 0.015 * R, wz1 + 0.015 * R * H),
              wfProj.project(wx + 0.002 * R, wy0 - 0.015 * R, wz1 + 0.015 * R * H)
            ];
            ctx2.beginPath();
            fPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
            ctx2.closePath();
            ctx2.fillStyle = '#c4c9ce';
            ctx2.fill();
            ctx2.strokeStyle = '#1e242b';
            ctx2.lineWidth = 0.95;
            ctx2.stroke();

            const wPts = [
              wfProj.project(wx + 0.004 * R, wy0, wz0),
              wfProj.project(wx + 0.004 * R, wy1, wz0),
              wfProj.project(wx + 0.004 * R, wy1, wz1),
              wfProj.project(wx + 0.004 * R, wy0, wz1)
            ];
            ctx2.beginPath();
            wPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
            ctx2.closePath();
            ctx2.fillStyle = '#708ea6';
            ctx2.fill();
            ctx2.stroke();
          }

          // 2) Front (+Y) Semi-Elliptical Arch Gable Tympanum Wall (with vertical corrugated seams)
          const fy = hgY1 + 0.004 * R;
          ctx2.beginPath();
          const pBL = wfProj.project(hgX0, fy, zPad);
          const pBR = wfProj.project(hgX1, fy, zPad);
          ctx2.moveTo(pBL.x, pBL.y);
          ctx2.lineTo(pBR.x, pBR.y);
          for (let i = nArch; i >= 0; i--) {
            const tA = Math.PI * (1 - i / nArch);
            const px = hgCx + hgRx * Math.cos(tA);
            const pz = zEave + archRz * Math.sin(tA);
            const pt = wfProj.project(px, fy, pz);
            ctx2.lineTo(pt.x, pt.y);
          }
          ctx2.closePath();
          ctx2.fillStyle = '#d0d5da';
          ctx2.fill();
          ctx2.strokeStyle = '#1e242b';
          ctx2.lineWidth = 1.15;
          ctx2.stroke();

          // Dark-grey base plinth blocks on left & right of front bay door
          const dX0 = hgCx - 0.36 * R, dX1 = hgCx + 0.36 * R;
          for (const [bx0, bx1] of [[hgX0, dX0], [dX1, hgX1]]) {
            const bp = [
              wfProj.project(bx0, fy + 0.001 * R, zPad),
              wfProj.project(bx1, fy + 0.001 * R, zPad),
              wfProj.project(bx1, fy + 0.001 * R, zPad + 0.075 * R * H),
              wfProj.project(bx0, fy + 0.001 * R, zPad + 0.075 * R * H)
            ];
            ctx2.beginPath();
            bp.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
            ctx2.closePath();
            ctx2.fillStyle = '#5c6775';
            ctx2.fill();
            ctx2.stroke();
          }

          // Vertical corrugated steel siding lines on the front arch gable wall
          ctx2.strokeStyle = '#8c949c';
          ctx2.lineWidth = 0.85;
          for (let k = 1; k < 10; k++) {
            const frac = k / 10;
            const sx = hgX0 + frac * (hgX1 - hgX0);
            const cosT = (sx - hgCx) / hgRx;
            const szTop = zEave + archRz * Math.sqrt(Math.max(0, 1 - cosT * cosT));
            const p0 = wfProj.project(sx, fy + 0.001 * R, zPad + 0.075 * R * H);
            const p1 = wfProj.project(sx, fy + 0.001 * R, szTop);
            ctx2.beginPath(); ctx2.moveTo(p0.x, p0.y); ctx2.lineTo(p1.x, p1.y); ctx2.stroke();
          }

          // Upper horizontal louver/skylight sign panel above the vehicle bay door
          const sX0 = hgCx - 0.16 * R, sX1 = hgCx + 0.16 * R;
          const sZ0 = zEave + 0.06 * R * H, sZ1 = zEave + 0.17 * R * H;
          const sPts = [
            wfProj.project(sX0, fy + 0.003 * R, sZ0),
            wfProj.project(sX1, fy + 0.003 * R, sZ0),
            wfProj.project(sX1, fy + 0.003 * R, sZ1),
            wfProj.project(sX0, fy + 0.003 * R, sZ1)
          ];
          ctx2.beginPath();
          sPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
          ctx2.closePath();
          ctx2.fillStyle = '#8c98a4';
          ctx2.fill();
          ctx2.strokeStyle = '#1e242b';
          ctx2.lineWidth = 1.05;
          ctx2.stroke();

          // 3) Wide Open Vehicle Assembly Bay Doorway (X: dX0..dX1, Z: zPad..zEave)
          const dZ0 = zPad, dZ1 = zEave;
          const dPts = [
            wfProj.project(dX0, fy + 0.003 * R, dZ0),
            wfProj.project(dX1, fy + 0.003 * R, dZ0),
            wfProj.project(dX1, fy + 0.003 * R, dZ1),
            wfProj.project(dX0, fy + 0.003 * R, dZ1)
          ];
          ctx2.beginPath();
          dPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
          ctx2.closePath();
          ctx2.fillStyle = '#222830';
          ctx2.fill();
          ctx2.strokeStyle = '#1e242b';
          ctx2.lineWidth = 1.3;
          ctx2.stroke();

          if (typeof ctx2.clip === 'function') {
            ctx2.save();
            ctx2.beginPath();
            const cPts = [
              wfProj.project(dX0 - 0.02 * R, fy + 0.14 * R, dZ0 - 0.02 * R * H),
              wfProj.project(dX1 + 0.02 * R, fy + 0.14 * R, dZ0 - 0.02 * R * H),
              wfProj.project(dX1, fy + 0.003 * R, dZ1),
              wfProj.project(dX0, fy + 0.003 * R, dZ1)
            ];
            cPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
            ctx2.closePath();
            ctx2.clip();
          }

          // Recessed concrete bay floor (strictly bounded within the doorway polygon dPts)
          const dW = dX1 - dX0, dH = dZ1 - dZ0;
          const fPts = [
            wfProj.project(dX0, fy + 0.003 * R, dZ0),
            wfProj.project(dX1, fy + 0.003 * R, dZ0),
            wfProj.project(dX1, fy + 0.003 * R, dZ0 + 0.56 * dH),
            wfProj.project(dX0 + 0.25 * dW, fy + 0.003 * R, dZ0 + 0.72 * dH),
            wfProj.project(dX0, fy + 0.003 * R, dZ0 + 0.52 * dH)
          ];
          ctx2.beginPath();
          fPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
          ctx2.closePath();
          ctx2.fillStyle = '#5e646c';
          ctx2.fill();

          // Helper to draw a 3D box immediately onto ctx2 inside the bay
          const drawBayBox = (bx0, bx1, by0, by1, bz0, bz1, topC, leftC, rightC) => {
            const faces3d = [
              { pts: [{ x: bx0, y: by0, z: bz0 }, { x: bx1, y: by0, z: bz0 }, { x: bx1, y: by0, z: bz1 }, { x: bx0, y: by0, z: bz1 }], col: rightC },
              { pts: [{ x: bx0, y: by0, z: bz0 }, { x: bx0, y: by1, z: bz0 }, { x: bx0, y: by1, z: bz1 }, { x: bx0, y: by0, z: bz1 }], col: leftC },
              { pts: [{ x: bx0, y: by1, z: bz0 }, { x: bx1, y: by1, z: bz0 }, { x: bx1, y: by1, z: bz1 }, { x: bx0, y: by1, z: bz1 }], col: leftC },
              { pts: [{ x: bx1, y: by0, z: bz0 }, { x: bx1, y: by1, z: bz0 }, { x: bx1, y: by1, z: bz1 }, { x: bx1, y: by0, z: bz1 }], col: rightC },
              { pts: [{ x: bx0, y: by0, z: bz1 }, { x: bx1, y: by0, z: bz1 }, { x: bx1, y: by1, z: bz1 }, { x: bx0, y: by1, z: bz1 }], col: topC }
            ];
            for (const f of faces3d) {
              const pp = f.pts.map(pt => wfProj.project(pt.x, pt.y, pt.z));
              ctx2.beginPath();
              pp.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
              ctx2.closePath();
              ctx2.fillStyle = f.col;
              ctx2.fill();
              ctx2.strokeStyle = '#1e242b';
              ctx2.lineWidth = 0.95;
              ctx2.stroke();
            }
          };

          // Interior Left Blue-Grey Tool Bench & Spare Tan Engine Block (positioned so screen projection stays inside doorway)
          drawBayBox(dX0 + 0.02 * R, dX0 + 0.18 * R, fy - 0.14 * R, fy - 0.01 * R, dZ0, dZ0 + 0.13 * R * H, '#708ea6', '#58748c', '#42586c');
          drawBayBox(dX0 + 0.04 * R, dX0 + 0.16 * R, fy - 0.24 * R, fy - 0.14 * R, dZ0, dZ0 + 0.14 * R * H, '#c8b282', '#ae9868', '#8e7a50');

          // Desert-Tan M1A1 Crusader Battle Tank inside the open assembly bay
          const tkCx = hgCx + 0.02 * R;
          const tkY0 = fy - 0.22 * R, tkY1 = fy + 0.01 * R;
          // Left & right armored track sponsons
          drawBayBox(tkCx - 0.16 * R, tkCx - 0.09 * R, tkY0, tkY1, dZ0, dZ0 + 0.09 * R * H, '#4a5058', '#3c4248', '#2c3036');
          drawBayBox(tkCx + 0.09 * R, tkCx + 0.16 * R, tkY0, tkY1, dZ0, dZ0 + 0.09 * R * H, '#4a5058', '#3c4248', '#2c3036');
          // Desert-tan armored glacis hull
          drawBayBox(tkCx - 0.13 * R, tkCx + 0.13 * R, tkY0 + 0.01 * R, tkY1 - 0.01 * R, dZ0 + 0.04 * R * H, dZ0 + 0.14 * R * H, '#d8c396', '#c2ac7e', '#a48e62');
          // Angular Abrams turret + commander cupola
          drawBayBox(tkCx - 0.095 * R, tkCx + 0.095 * R, tkY0 + 0.04 * R, tkY1 - 0.04 * R, dZ0 + 0.14 * R * H, dZ0 + 0.22 * R * H, '#e2cfa4', '#cbb68a', '#ab966c');
          drawBayBox(tkCx - 0.035 * R, tkCx + 0.035 * R, tkY0 + 0.06 * R, tkY0 + 0.13 * R, dZ0 + 0.22 * R * H, dZ0 + 0.25 * R * H, '#ead8b0', '#cbb68a', '#ab966c');
          // 120mm Main Gun Barrel pointing +Y out the hangar bay door
          drawBayBox(tkCx - 0.02 * R, tkCx + 0.02 * R, tkY1 - 0.06 * R, tkY1 + 0.11 * R, dZ0 + 0.16 * R * H, dZ0 + 0.20 * R * H, '#d8c396', '#b8a276', '#948058');

          if (typeof ctx2.clip === 'function') {
            ctx2.restore();
          }

          // Yellow & Black Diagonal Hazard Threshold Strip across the Bay Doorway
          const rY0 = fy - 0.01 * R, rY1 = fy + 0.065 * R;
          const rPts = [
            wfProj.project(dX0, rY0, zPad + 0.01 * R * H),
            wfProj.project(dX1, rY0, zPad + 0.01 * R * H),
            wfProj.project(dX1, rY1, zPad + 0.003 * R * H),
            wfProj.project(dX0, rY1, zPad + 0.003 * R * H)
          ];
          ctx2.beginPath();
          rPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
          ctx2.closePath();
          ctx2.fillStyle = '#eab308';
          ctx2.fill();
          ctx2.strokeStyle = '#1e242b';
          ctx2.lineWidth = 1.05;
          ctx2.stroke();

          ctx2.fillStyle = '#1e242b';
          const nHaz = 7;
          for (let i = 0; i < nHaz; i++) {
            const hx0 = dX0 + ((i + 0.15) / nHaz) * (dX1 - dX0);
            const hx1 = dX0 + ((i + 0.58) / nHaz) * (dX1 - dX0);
            const hp = [
              wfProj.project(hx0, rY0, zPad + 0.011 * R * H),
              wfProj.project(hx1, rY0, zPad + 0.011 * R * H),
              wfProj.project(hx1, rY1, zPad + 0.004 * R * H),
              wfProj.project(hx0, rY1, zPad + 0.004 * R * H)
            ];
            ctx2.beginPath();
            hp.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
            ctx2.closePath();
            ctx2.fill();
          }

          ctx2.restore();
        }
      });

      // 4. Left (-X) Yellow Steel Overhead Gantry Crane (X: -0.84R..-0.60R, Y: -0.56R..+0.48R)
      if (p.ShowGantryCrane !== false) {
        const gcX0 = -0.84 * R, gcX1 = -0.60 * R;
        const gcY0 = -0.56 * R, gcY1 = 0.48 * R;
        const zGcTop = zPad + 0.56 * R * H;
        const gcBias = 10.0;

        // Concrete crane footing plinth at front-left
        extrudeBox(gcX0 - 0.03 * R, gcX1 + 0.03 * R, gcY1 - 0.14 * R, gcY1 + 0.03 * R, 0, zPad + 0.05 * R * H, '#b5afa4', '#9c968c', '#827d74', gcBias - 1.0, 0.95);

        // Front & Back Yellow Steel Portal Frame Uprights
        for (const [py0, py1, pB] of [[gcY0, gcY0 + 0.07 * R, gcBias - 0.5], [gcY1 - 0.07 * R, gcY1, gcBias + 0.5]]) {
          extrudeBox(gcX0, gcX0 + 0.05 * R, py0, py1, zPad + 0.05 * R * H, zGcTop, '#eab308', '#d99b06', '#b47d04', pB, 0.95);
          extrudeBox(gcX1 - 0.05 * R, gcX1, py0, py1, zPad + 0.05 * R * H, zGcTop, '#eab308', '#d99b06', '#b47d04', pB + 0.2, 0.95);
          extrudeBox(gcX0 - 0.01 * R, gcX1 + 0.01 * R, py0 - 0.01 * R, py1 + 0.01 * R, zGcTop - 0.05 * R * H, zGcTop, '#facc15', '#eab308', '#ca8a04', pB + 0.4, 0.95);
        }

        // Longitudinal Yellow Double-Girder Overhead Bridge Rails (spanning Y from gcY0 - 0.06R to gcY1 + 0.04R)
        extrudeBox(gcX0, gcX0 + 0.055 * R, gcY0 - 0.06 * R, gcY1 + 0.04 * R, zGcTop, zGcTop + 0.065 * R * H, '#facc15', '#eab308', '#ca8a04', gcBias + 1.2, 1.0);
        extrudeBox(gcX1 - 0.055 * R, gcX1, gcY0 - 0.06 * R, gcY1 + 0.04 * R, zGcTop, zGcTop + 0.065 * R * H, '#facc15', '#eab308', '#ca8a04', gcBias + 1.4, 1.0);

        // Rear Elevated Silver/Grey Hoist Motor Machinery Cabin (compact box on top of bridge at -Y)
        extrudeBox(gcX0 + 0.01 * R, gcX1 - 0.01 * R, gcY0 + 0.02 * R, gcY0 + 0.22 * R, zGcTop + 0.065 * R * H, zGcTop + 0.17 * R * H, '#c8ced4', '#acb2b8', '#8c9298', gcBias + 2.0, 1.0);

        // Lattice X-Bracing & Suspended Hoist Hook on Front Crane Tower
        polys.push({
          depth: wfProj.project((gcX0 + gcX1) * 0.5, gcY1, zGcTop).depth + gcBias + 2.5,
          customDraw(ctx2) {
            ctx2.save();
            ctx2.strokeStyle = '#1e242b';
            ctx2.lineWidth = 1.15;
            const xL = gcX0 + 0.025 * R, xR = gcX1 - 0.025 * R;
            const yF = gcY1 - 0.035 * R;
            for (let k = 0; k < 3; k++) {
              const zA = zPad + (0.05 + k * 0.15) * R * H;
              const zB = zPad + (0.05 + (k + 1) * 0.15) * R * H;
              const p00 = wfProj.project(xL, yF, zA);
              const p10 = wfProj.project(xR, yF, zA);
              const p01 = wfProj.project(xL, yF, zB);
              const p11 = wfProj.project(xR, yF, zB);
              ctx2.beginPath();
              ctx2.moveTo(p00.x, p00.y); ctx2.lineTo(p11.x, p11.y);
              ctx2.moveTo(p10.x, p10.y); ctx2.lineTo(p01.x, p01.y);
              ctx2.stroke();
            }
            ctx2.restore();
          }
        });
      }

      // 5. Right (+X) Yard Props: 4 Cylindrical Steel Oil Drums, Stacked Spare Tank Tread Loops & Olive/Wooden Crates
      const ydBias = 16.0;
      // 4 Cylindrical Dark-Grey Steel Oil Drums with Rust/Orange Bands in Back-Right (+X, -Y)
      for (const [dx, dy, dB] of [
        [0.54 * R, -0.44 * R, ydBias - 2.0],
        [0.65 * R, -0.46 * R, ydBias - 1.8],
        [0.54 * R, -0.32 * R, ydBias - 1.4],
        [0.65 * R, -0.34 * R, ydBias - 1.2]
      ]) {
        const rDrum = 0.048 * R;
        const zD0 = zPad, zD1 = zPad + 0.13 * R * H;
        for (let i = 0; i < 8; i++) {
          const a0 = (i / 8) * Math.PI * 2;
          const a1 = ((i + 1) / 8) * Math.PI * 2;
          const col = i < 4 ? '#687078' : '#4a5058';
          pushQuad([
            { x: dx + Math.cos(a0) * rDrum, y: dy + Math.sin(a0) * rDrum, z: zD0 },
            { x: dx + Math.cos(a1) * rDrum, y: dy + Math.sin(a1) * rDrum, z: zD0 },
            { x: dx + Math.cos(a1) * rDrum, y: dy + Math.sin(a1) * rDrum, z: zD1 },
            { x: dx + Math.cos(a0) * rDrum, y: dy + Math.sin(a0) * rDrum, z: zD1 }
          ], col, '#1e242b', 0.8, dB);
        }
        // Top circular lid + middle orange-brown band
        polys.push({
          depth: wfProj.project(dx, dy, zD1).depth + dB + 0.3,
          customDraw(ctx2) {
            ctx2.save();
            ctx2.beginPath();
            for (let i = 0; i <= 12; i++) {
              const a = (i / 12) * Math.PI * 2;
              const pt = wfProj.project(dx + Math.cos(a) * rDrum, dy + Math.sin(a) * rDrum, zD1);
              if (i === 0) ctx2.moveTo(pt.x, pt.y);
              else ctx2.lineTo(pt.x, pt.y);
            }
            ctx2.closePath();
            ctx2.fillStyle = '#7c848c';
            ctx2.fill();
            ctx2.strokeStyle = '#1e242b';
            ctx2.lineWidth = 0.9;
            ctx2.stroke();
            ctx2.restore();
          }
        });
      }

      // 3 Spare Tank Tread / Caterpillar Track Assemblies on Ground + 1 Stacked on Top (Mid-Right +X)
      const pushTankTrackLoop = (tx0, tx1, ty0, ty1, tz0, tz1, tB) => {
        extrudeBox(tx0, tx1, ty0, ty1, tz0, tz1, '#586068', '#464c54', '#34383e', tB, 0.95);
        // Dark hollow track interior & sprocket wheel slots on the +X face
        polys.push({
          depth: wfProj.project(tx1, (ty0 + ty1) * 0.5, tz1).depth + tB + 0.4,
          customDraw(ctx2) {
            ctx2.save();
            const sPts = [
              wfProj.project(tx0 + 0.03 * R, ty1 + 0.002 * R, tz0 + 0.02 * R * H),
              wfProj.project(tx1 - 0.03 * R, ty1 + 0.002 * R, tz0 + 0.02 * R * H),
              wfProj.project(tx1 - 0.03 * R, ty1 + 0.002 * R, tz1 - 0.02 * R * H),
              wfProj.project(tx0 + 0.03 * R, ty1 + 0.002 * R, tz1 - 0.02 * R * H)
            ];
            ctx2.beginPath();
            sPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
            ctx2.closePath();
            ctx2.fillStyle = '#22262c';
            ctx2.fill();
            ctx2.strokeStyle = '#1e242b';
            ctx2.lineWidth = 0.85;
            for (let m = 1; m <= 5; m++) {
              const mx = tx0 + (m / 6) * (tx1 - tx0);
              const pA = wfProj.project(mx, ty0, tz1 + 0.002 * R * H);
              const pB = wfProj.project(mx, ty1, tz1 + 0.002 * R * H);
              ctx2.beginPath(); ctx2.moveTo(pA.x, pA.y); ctx2.lineTo(pB.x, pB.y); ctx2.stroke();
            }
            ctx2.restore();
          }
        });
      };
      pushTankTrackLoop(0.49 * R, 0.74 * R, -0.22 * R, -0.11 * R, zPad, zPad + 0.085 * R * H, ydBias);
      pushTankTrackLoop(0.49 * R, 0.74 * R, -0.09 * R, 0.02 * R, zPad, zPad + 0.085 * R * H, ydBias + 0.6);
      pushTankTrackLoop(0.50 * R, 0.73 * R, -0.18 * R, -0.06 * R, zPad + 0.085 * R * H, zPad + 0.165 * R * H, ydBias + 1.2);
      pushTankTrackLoop(0.56 * R, 0.81 * R, 0.04 * R, 0.16 * R, zPad, zPad + 0.085 * R * H, ydBias + 1.8);

      // Front-Right (+X, +Y) Stacked Olive-Drab Military Crates & 2 Tan Wooden Crates (matching sprite)
      extrudeBox(0.48 * R, 0.61 * R, 0.18 * R, 0.30 * R, zPad, zPad + 0.09 * R * H, '#7a8a59', '#657348', '#525e3a', ydBias + 2.4, 0.9);
      extrudeBox(0.48 * R, 0.61 * R, 0.18 * R, 0.30 * R, zPad + 0.09 * R * H, zPad + 0.17 * R * H, '#849462', '#6d7c4f', '#55623d', ydBias + 2.7, 0.9);
      extrudeBox(0.56 * R, 0.69 * R, 0.24 * R, 0.36 * R, zPad, zPad + 0.09 * R * H, '#7a8a59', '#657348', '#525e3a', ydBias + 3.0, 0.9);
      extrudeBox(0.56 * R, 0.69 * R, 0.24 * R, 0.36 * R, zPad + 0.09 * R * H, zPad + 0.17 * R * H, '#849462', '#6d7c4f', '#55623d', ydBias + 3.3, 0.9);
      // 2 Tan Wooden Slatted Crates at the front-right corner
      extrudeBox(0.48 * R, 0.59 * R, 0.36 * R, 0.47 * R, zPad, zPad + 0.11 * R * H, '#c8ae7e', '#b29868', '#947c50', ydBias + 3.8, 0.95);
      extrudeBox(0.39 * R, 0.50 * R, 0.43 * R, 0.54 * R, zPad, zPad + 0.11 * R * H, '#c8ae7e', '#b29868', '#947c50', ydBias + 4.2, 0.95);

      flushFaces(ctx, faces);
      return;
    }

    if (defId === 'USA_AIRFIELD') {
      // High-Fidelity Ligne-Claire 3D Model matching usa_airfield.png:
      // 1. Large rectangular concrete runway/apron slab with beveled curbing, expansion joints & white dashed perimeter stripes
      // 2. 4 Dark-asphalt chamfered octagonal jet hardstands (2x2 grid) with yellow outlines, curved yellow taxiway guidelines & tire skid marks on the empty front-right pad
      // 3. 3 Parked White-and-Blue USAF F-22 Raptor Stealth Fighter Jets (Jets 1 & 2 on left pads pointed +X down-right; Jet 3 on back-right pad pointed +Y down-left, matching the sprite!)
      // 4. Back-Right (-Y) 1-Story Concrete Operations Building (roll-up garage door, cyan windows, rooftop HVAC fan unit) & Tall ATC Control Tower (beige concrete shaft, flared gallery with railing, sloped turquoise glass cab with mullions, roof railing, central motor drum & wide slotted horizontal ASR radar bar)
      // 5. Right (+X, -Y) Twin Horizontal Cylindrical Steel Aviation Fuel Tanks on saddle piers inside a piped containment bund, with yellow-and-black diagonal hazard bands
      const afAngle = 0.75;
      const afProj = createProjector(afAngle, pitchScale, zScale);
      const R = r * 1.22 * SS;
      const polys = faces;

      const pushQuad = (pts3d, fill, stroke = '#1e242b', lineWidth = 1.0, bias = 0) => {
        const projPts = pts3d.map(pt => afProj.project(pt.x, pt.y, pt.z));
        const depth = projPts.reduce((acc, pt) => acc + pt.depth, 0) / projPts.length + bias;
        polys.push({ pts: projPts, depth, fill, stroke, lineWidth });
      };

      const extrudeBox = (x0, x1, y0, y1, z0, z1, topCol, leftCol, rightCol, bias = 0, lw = 1.0) => {
        pushQuad([
          { x: x0, y: y0, z: z0 }, { x: x1, y: y0, z: z0 },
          { x: x1, y: y0, z: z1 }, { x: x0, y: y0, z: z1 }
        ], rightCol, '#1e242b', lw, bias - 0.3);
        pushQuad([
          { x: x0, y: y0, z: z0 }, { x: x0, y: y1, z: z0 },
          { x: x0, y: y1, z: z1 }, { x: x0, y: y0, z: z1 }
        ], leftCol, '#1e242b', lw, bias - 0.3);
        pushQuad([
          { x: x0, y: y1, z: z0 }, { x: x1, y: y1, z: z0 },
          { x: x1, y: y1, z: z1 }, { x: x0, y: y1, z: z1 }
        ], leftCol, '#1e242b', lw, bias + 0.15);
        pushQuad([
          { x: x1, y: y0, z: z0 }, { x: x1, y: y1, z: z0 },
          { x: x1, y: y1, z: z1 }, { x: x1, y: y0, z: z1 }
        ], rightCol, '#1e242b', lw, bias + 0.15);
        pushQuad([
          { x: x0, y: y0, z: z1 }, { x: x1, y: y0, z: z1 },
          { x: x1, y: y1, z: z1 }, { x: x0, y: y1, z: z1 }
        ], topCol, '#1e242b', lw, bias + 0.3);
      };

      // 1. Concrete Runway / Apron Slab (X: -0.90R..+0.90R, Y: -0.84R..+0.88R)
      // Anchor tarmac depth at the far back corner (-0.90R, -0.84R, 0) so all buildings, jets & tanks draw cleanly on top!
      const zPad = 0.042 * R * H;
      const apX0 = -0.90 * R, apX1 = 0.90 * R;
      const apY0 = -0.84 * R, apY1 = 0.88 * R;
      const farBackDepth = afProj.project(apX0, apY0, 0).depth;
      extrudeBox(apX0, apX1, apY0, apY1, 0, zPad, '#c4c0b8', '#9c9890', '#78746c', -95.0, 1.15);

      // 2. Tarmac Details, White Dashed Runway Perimeter Stripes, 4 Octagonal Jet Hardstands & Yellow Taxiway Lines
      // dir: 'X' means jet nose points +X (down-right); 'Y' means jet nose points +Y (down-left)
      const pads = [
        { cx: -0.46 * R, cy: -0.04 * R, hasJet: true,  dir: 'X' }, // Pad 1: Back-Left (Jet points +X)
        { cx: -0.46 * R, cy:  0.50 * R, hasJet: true,  dir: 'X' }, // Pad 2: Front-Left (Jet points +X)
        { cx:  0.22 * R, cy:  0.02 * R, hasJet: true,  dir: 'Y' }, // Pad 3: Back-Right (Jet points +Y, matching sprite!)
        { cx:  0.22 * R, cy:  0.52 * R, hasJet: false, dir: 'Y' }  // Pad 4: Front-Right (Empty with tire skid marks)
      ];

      polys.push({
        depth: -82.0,
        customDraw(ctx2) {
          ctx2.save();

          // Inset concrete tarmac surface
          const inPad = [
            afProj.project(apX0 + 0.04 * R, apY0 + 0.04 * R, zPad + 0.002 * R * H),
            afProj.project(apX1 - 0.04 * R, apY0 + 0.04 * R, zPad + 0.002 * R * H),
            afProj.project(apX1 - 0.04 * R, apY1 - 0.04 * R, zPad + 0.002 * R * H),
            afProj.project(apX0 + 0.04 * R, apY1 - 0.04 * R, zPad + 0.002 * R * H)
          ];
          ctx2.beginPath();
          inPad.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
          ctx2.closePath();
          ctx2.fillStyle = '#b5b0a8';
          ctx2.fill();
          ctx2.strokeStyle = '#6e6a64';
          ctx2.lineWidth = 0.95;
          ctx2.stroke();

          // Subtle concrete expansion joint grid lines
          ctx2.strokeStyle = 'rgba(70, 66, 60, 0.30)';
          ctx2.lineWidth = 0.75;
          for (const gx of [-0.55 * R, -0.12 * R, 0.35 * R]) {
            const p0 = afProj.project(gx, apY0 + 0.05 * R, zPad + 0.003 * R * H);
            const p1 = afProj.project(gx, apY1 - 0.05 * R, zPad + 0.003 * R * H);
            ctx2.beginPath(); ctx2.moveTo(p0.x, p0.y); ctx2.lineTo(p1.x, p1.y); ctx2.stroke();
          }
          for (const gy of [-0.36 * R, 0.24 * R]) {
            const p0 = afProj.project(apX0 + 0.05 * R, gy, zPad + 0.003 * R * H);
            const p1 = afProj.project(apX1 - 0.05 * R, gy, zPad + 0.003 * R * H);
            ctx2.beginPath(); ctx2.moveTo(p0.x, p0.y); ctx2.lineTo(p1.x, p1.y); ctx2.stroke();
          }

          // White dashed perimeter runway stripes along Back-Left (X = -0.82R) and Front-Left (Y = +0.81R)
          ctx2.fillStyle = '#f1f5f9';
          ctx2.strokeStyle = '#57534e';
          ctx2.lineWidth = 0.6;
          for (let i = 0; i < 8; i++) {
            const yA = -0.68 * R + i * 0.185 * R;
            const yB = yA + 0.11 * R;
            const dPts = [
              afProj.project(-0.83 * R, yA, zPad + 0.004 * R * H),
              afProj.project(-0.79 * R, yA, zPad + 0.004 * R * H),
              afProj.project(-0.79 * R, yB, zPad + 0.004 * R * H),
              afProj.project(-0.83 * R, yB, zPad + 0.004 * R * H)
            ];
            ctx2.beginPath();
            dPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
            ctx2.closePath();
            ctx2.fill();
            ctx2.stroke();
          }
          for (let i = 0; i < 8; i++) {
            const xA = -0.74 * R + i * 0.19 * R;
            const xB = xA + 0.115 * R;
            const dPts = [
              afProj.project(xA, 0.79 * R, zPad + 0.004 * R * H),
              afProj.project(xB, 0.79 * R, zPad + 0.004 * R * H),
              afProj.project(xB, 0.83 * R, zPad + 0.004 * R * H),
              afProj.project(xA, 0.83 * R, zPad + 0.004 * R * H)
            ];
            ctx2.beginPath();
            dPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
            ctx2.closePath();
            ctx2.fill();
            ctx2.stroke();
          }

          // 4 Dark-Asphalt Chamfered Octagonal Jet Parking Hardstands
          const rx = 0.245 * R, ry = 0.215 * R;
          const cxK = 0.62, cyK = 0.62;
          for (const pad of pads) {
            const oct3d = [
              { x: pad.cx - rx,       y: pad.cy - ry * cyK },
              { x: pad.cx - rx * cxK, y: pad.cy - ry },
              { x: pad.cx + rx * cxK, y: pad.cy - ry },
              { x: pad.cx + rx,       y: pad.cy - ry * cyK },
              { x: pad.cx + rx,       y: pad.cy + ry * cyK },
              { x: pad.cx + rx * cxK, y: pad.cy + ry },
              { x: pad.cx - rx * cxK, y: pad.cy + ry },
              { x: pad.cx - rx,       y: pad.cy + ry * cyK }
            ];
            const octPts = oct3d.map(pt => afProj.project(pt.x, pt.y, zPad + 0.005 * R * H));
            ctx2.beginPath();
            octPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
            ctx2.closePath();
            ctx2.fillStyle = '#48494c';
            ctx2.fill();
            ctx2.strokeStyle = '#eab308';
            ctx2.lineWidth = 1.35;
            ctx2.stroke();

            // Dark rubber tire skid marks on the empty front-right pad (Pad 4)
            if (!pad.hasJet) {
              ctx2.strokeStyle = '#2d2f33';
              ctx2.lineWidth = 2.2;
              for (const sx of [-0.06 * R, 0.05 * R]) {
                const s0 = afProj.project(pad.cx + sx - 0.04 * R, pad.cy - 0.14 * R, zPad + 0.007 * R * H);
                const s1 = afProj.project(pad.cx + sx + 0.03 * R, pad.cy + 0.14 * R, zPad + 0.007 * R * H);
                ctx2.beginPath(); ctx2.moveTo(s0.x, s0.y); ctx2.lineTo(s1.x, s1.y); ctx2.stroke();
              }
            }
          }

          // Yellow Taxiway Centerline & Curved Lead-In Branches connecting the 4 Hardstands
          ctx2.strokeStyle = '#eab308';
          ctx2.lineWidth = 1.85;
          const taxX = -0.12 * R;
          const tStart = afProj.project(taxX, -0.32 * R, zPad + 0.006 * R * H);
          const tEnd = afProj.project(taxX, 0.72 * R, zPad + 0.006 * R * H);
          ctx2.beginPath(); ctx2.moveTo(tStart.x, tStart.y); ctx2.lineTo(tEnd.x, tEnd.y); ctx2.stroke();

          // Curved yellow lead-in lines branching from the central taxiway spine into each hardstand
          for (const pad of pads) {
            const pSpine = afProj.project(taxX, pad.cy + 0.14 * R, zPad + 0.006 * R * H);
            const pCtrl = afProj.project(taxX, pad.cy, zPad + 0.006 * R * H);
            const pPad = afProj.project(pad.cx, pad.cy, zPad + 0.006 * R * H);
            ctx2.beginPath();
            ctx2.moveTo(pSpine.x, pSpine.y);
            ctx2.quadraticCurveTo(pCtrl.x, pCtrl.y, pPad.x, pPad.y);
            ctx2.stroke();
          }

          ctx2.restore();
        }
      });

      // 3. 3 Parked White-and-Blue USAF F-22 Raptor Stealth Fighter Jets (on Pads 1, 2 & 3)
      for (let pIdx = 0; pIdx < pads.length; pIdx++) {
        const pad = pads[pIdx];
        if (!pad.hasJet) continue;
        const jx = pad.cx, jy = pad.cy;
        const zJet = zPad + 0.035 * R * H;
        const jetDepth = afProj.project(jx, jy, zJet + 0.08 * R * H).depth + 4.0 + pIdx * 1.5;

        // Local coordinate mapper so the jet can point along +X (dir === 'X') or +Y (dir === 'Y')
        const mapJetPt = (u, v, z) => {
          if (pad.dir === 'Y') {
            return { x: jx - v, y: jy + u, z };
          }
          return { x: jx + u, y: jy + v, z };
        };

        polys.push({
          depth: jetDepth,
          customDraw(ctx2) {
            ctx2.save();
            const drawPoly3D = (uvzPts, fill, stroke = '#1e242b', lw = 0.95) => {
              const pp = uvzPts.map(([u, v, z]) => {
                const pt = mapJetPt(u, v, z);
                return afProj.project(pt.x, pt.y, pt.z);
              });
              ctx2.beginPath();
              pp.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
              ctx2.closePath();
              ctx2.fillStyle = fill;
              ctx2.fill();
              if (stroke) {
                ctx2.strokeStyle = stroke;
                ctx2.lineWidth = lw;
                ctx2.stroke();
              }
            };

            // Soft ground shadow beneath F-22 Raptor
            drawPoly3D([
              [-0.19 * R, -0.18 * R, zPad + 0.008 * R * H],
              [ 0.22 * R, -0.02 * R, zPad + 0.008 * R * H],
              [-0.19 * R,  0.18 * R, zPad + 0.008 * R * H]
            ], 'rgba(18, 22, 28, 0.42)', null, 0);

            // Underwing white AIM-120 missiles
            for (const mv of [-0.145 * R, 0.145 * R]) {
              drawPoly3D([
                [-0.08 * R, mv - 0.014 * R, zJet - 0.005 * R * H],
                [ 0.09 * R, mv - 0.014 * R, zJet - 0.005 * R * H],
                [ 0.12 * R, mv,             zJet - 0.005 * R * H],
                [ 0.09 * R, mv + 0.014 * R, zJet - 0.005 * R * H],
                [-0.08 * R, mv + 0.014 * R, zJet - 0.005 * R * H]
              ], '#f8fafc', '#1e242b', 0.75);
            }

            // Swept Horizontal Stabilators (Tailplanes) at rear (-u)
            drawPoly3D([
              [-0.22 * R, -0.11 * R, zJet + 0.01 * R * H],
              [-0.12 * R, -0.14 * R, zJet + 0.01 * R * H],
              [-0.09 * R, -0.03 * R, zJet + 0.01 * R * H],
              [-0.09 * R,  0.03 * R, zJet + 0.01 * R * H],
              [-0.12 * R,  0.14 * R, zJet + 0.01 * R * H],
              [-0.22 * R,  0.11 * R, zJet + 0.01 * R * H]
            ], '#cbd5e1', '#1e242b', 0.85);

            // Main Swept Diamond Stealth Wings
            drawPoly3D([
              [-0.11 * R, -0.05 * R, zJet + 0.02 * R * H],
              [ 0.07 * R, -0.05 * R, zJet + 0.02 * R * H],
              [-0.04 * R, -0.22 * R, zJet + 0.015 * R * H],
              [-0.13 * R, -0.19 * R, zJet + 0.015 * R * H],
              [-0.14 * R,  0,        zJet + 0.02 * R * H],
              [-0.13 * R,  0.19 * R, zJet + 0.015 * R * H],
              [-0.04 * R,  0.22 * R, zJet + 0.015 * R * H],
              [ 0.07 * R,  0.05 * R, zJet + 0.02 * R * H],
              [-0.11 * R,  0.05 * R, zJet + 0.02 * R * H]
            ], '#e2e8f0', '#1e242b', 1.0);

            // Blue USAF Wing Camo Stripes on left & right wings
            for (const sgn of [-1, 1]) {
              drawPoly3D([
                [ 0.02 * R, sgn * 0.06 * R, zJet + 0.022 * R * H],
                [-0.04 * R, sgn * 0.18 * R, zJet + 0.018 * R * H],
                [-0.09 * R, sgn * 0.17 * R, zJet + 0.018 * R * H],
                [-0.04 * R, sgn * 0.06 * R, zJet + 0.022 * R * H]
              ], '#3b6ea5', '#1e242b', 0.65);
            }

            // Central Chined Stealth Fuselage Spine + Pointed Nose Cone (+u)
            drawPoly3D([
              [-0.19 * R, -0.046 * R, zJet + 0.025 * R * H],
              [ 0.10 * R, -0.042 * R, zJet + 0.028 * R * H],
              [ 0.24 * R,  0,         zJet + 0.022 * R * H],
              [ 0.10 * R,  0.042 * R, zJet + 0.028 * R * H],
              [-0.19 * R,  0.046 * R, zJet + 0.025 * R * H]
            ], '#f1f5f9', '#1e242b', 1.0);

            // Dark-grey radar nose tip & twin rectangular vector-thrust exhaust nozzles at rear (-u)
            drawPoly3D([
              [ 0.18 * R, -0.018 * R, zJet + 0.025 * R * H],
              [ 0.24 * R,  0,         zJet + 0.022 * R * H],
              [ 0.18 * R,  0.018 * R, zJet + 0.025 * R * H]
            ], '#475569', '#1e242b', 0.75);
            drawPoly3D([
              [-0.21 * R, -0.036 * R, zJet + 0.022 * R * H],
              [-0.17 * R, -0.036 * R, zJet + 0.022 * R * H],
              [-0.17 * R,  0.036 * R, zJet + 0.022 * R * H],
              [-0.21 * R,  0.036 * R, zJet + 0.022 * R * H]
            ], '#334155', '#1e242b', 0.8);

            // Golden-Amber Tinted Bubble Cockpit Canopy
            drawPoly3D([
              [ 0.00 * R, -0.026 * R, zJet + 0.035 * R * H],
              [ 0.11 * R, -0.022 * R, zJet + 0.035 * R * H],
              [ 0.16 * R,  0,         zJet + 0.030 * R * H],
              [ 0.11 * R,  0.022 * R, zJet + 0.035 * R * H],
              [ 0.00 * R,  0.026 * R, zJet + 0.035 * R * H],
              [-0.03 * R,  0,         zJet + 0.055 * R * H]
            ], '#e0a028', '#1e242b', 0.85);

            // Twin Outward-Canted Vertical Tail Fins with Blue USAF Flashes
            for (const sgn of [-1, 1]) {
              drawPoly3D([
                [-0.18 * R, sgn * 0.042 * R, zJet + 0.028 * R * H],
                [-0.08 * R, sgn * 0.042 * R, zJet + 0.028 * R * H],
                [-0.11 * R, sgn * 0.078 * R, zJet + 0.105 * R * H],
                [-0.19 * R, sgn * 0.078 * R, zJet + 0.105 * R * H]
              ], '#3b6ea5', '#1e242b', 0.9);
            }

            ctx2.restore();
          }
        });
      }

      // 4. Back-Right (-Y) Operations / Maintenance Building & Tall ATC Control Tower
      // 4a. Continuous 1-Story Concrete Operations Building along Y ∈ [-0.78R, -0.42R], X ∈ [-0.68R, +0.36R]
      const zOps = zPad + 0.24 * R * H;
      const opsBias = 6.0;
      extrudeBox(-0.68 * R, 0.36 * R, -0.78 * R, -0.42 * R, zPad, zOps, '#d2c8bc', '#b8aea2', '#968c80', opsBias, 1.05);
      // Raised roof parapet ledge around the operations building
      extrudeBox(-0.69 * R, 0.37 * R, -0.79 * R, -0.41 * R, zOps, zOps + 0.035 * R * H, '#dcd2c6', '#c2b8ac', '#9e9488', opsBias + 0.8, 0.95);

      // Rooftop Square HVAC Fan Box on Left Operations Wing
      extrudeBox(-0.58 * R, -0.42 * R, -0.68 * R, -0.52 * R, zOps + 0.035 * R * H, zOps + 0.085 * R * H, '#c8beb2', '#aea498', '#8c8278', opsBias + 24.0, 0.9);

      // Roll-up corrugated garage door (with horizontal slats), cyan windows & double entry doors on the front-left (+Y = -0.42R) wall of Operations Building
      polys.push({
        depth: afProj.project(-0.16 * R, -0.416 * R, (zPad + zOps) * 0.5).depth + opsBias + 2.0,
        customDraw(ctx2) {
          ctx2.save();
          const drawWallRect = (x0, x1, z0, z1, fill, lw = 0.95) => {
            const pts = [
              afProj.project(x0, -0.416 * R, z0),
              afProj.project(x1, -0.416 * R, z0),
              afProj.project(x1, -0.416 * R, z1),
              afProj.project(x0, -0.416 * R, z1)
            ];
            ctx2.beginPath();
            pts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
            ctx2.closePath();
            ctx2.fillStyle = fill;
            ctx2.fill();
            ctx2.strokeStyle = '#1e242b';
            ctx2.lineWidth = lw;
            ctx2.stroke();
          };
          // Corrugated roll-up garage door on left wing
          drawWallRect(-0.61 * R, -0.37 * R, zPad, zPad + 0.185 * R * H, '#78716c', 1.0);
          ctx2.strokeStyle = '#1e242b';
          ctx2.lineWidth = 0.75;
          for (let k = 1; k <= 3; k++) {
            const zk = zPad + (k / 4) * 0.185 * R * H;
            const p0 = afProj.project(-0.61 * R, -0.416 * R, zk);
            const p1 = afProj.project(-0.37 * R, -0.416 * R, zk);
            ctx2.beginPath(); ctx2.moveTo(p0.x, p0.y); ctx2.lineTo(p1.x, p1.y); ctx2.stroke();
          }
          // Cyan window on left wing
          drawWallRect(-0.33 * R, -0.21 * R, zPad + 0.095 * R * H, zPad + 0.17 * R * H, '#67e8f9', 0.9);
          // Double glass entry doors under the ATC tower (+Y face)
          drawWallRect(-0.09 * R,  0.05 * R, zPad, zPad + 0.165 * R * H, '#527a8a', 0.95);
          const dMid0 = afProj.project(-0.02 * R, -0.416 * R, zPad);
          const dMid1 = afProj.project(-0.02 * R, -0.416 * R, zPad + 0.165 * R * H);
          ctx2.beginPath(); ctx2.moveTo(dMid0.x, dMid0.y); ctx2.lineTo(dMid1.x, dMid1.y); ctx2.stroke();
          // Cyan window on right wing
          drawWallRect(0.14 * R, 0.28 * R, zPad + 0.095 * R * H, zPad + 0.17 * R * H, '#67e8f9', 0.9);
          ctx2.restore();
        }
      });

      // 4b. Tall Chamfered-Square Concrete Air Traffic Control (ATC) Tower rising from the Operations Building at (tcx = -0.02R, tcy = -0.58R)
      const tcx = -0.02 * R, tcy = -0.58 * R;
      // Helper for a chamfered-square (4 broad cardinal faces + 4 narrow 45-deg corner chamfers, matching usa_airfield.png!)
      const pushChamferBox = (zB, zT, rxB, ryB, rxT, ryT, ch, sidePalette, topCol, biasBase, lw = 1.05) => {
        const ring = (rx, ry) => [
          { x: tcx - rx * (1 - ch), y: tcy - ry },
          { x: tcx + rx * (1 - ch), y: tcy - ry },
          { x: tcx + rx,            y: tcy - ry * (1 - ch) },
          { x: tcx + rx,            y: tcy + ry * (1 - ch) },
          { x: tcx + rx * (1 - ch), y: tcy + ry },
          { x: tcx - rx * (1 - ch), y: tcy + ry },
          { x: tcx - rx,            y: tcy + ry * (1 - ch) },
          { x: tcx - rx,            y: tcy - ry * (1 - ch) }
        ];
        const bPts = ring(rxB, ryB);
        const tPts = ring(rxT, ryT);
        for (let i = 0; i < 8; i++) {
          const ni = (i + 1) % 8;
          const p0B = { ...bPts[i], z: zB };
          const p1B = { ...bPts[ni], z: zB };
          const p1T = { ...tPts[ni], z: zT };
          const p0T = { ...tPts[i], z: zT };
          const nx = (p1B.y - p0B.y), ny = -(p1B.x - p0B.x);
          const shade = afProj.shadeNormal(nx, ny, 0.15);
          const col = shade > 1.02 ? sidePalette[0] : (shade > 0.88 ? sidePalette[1] : sidePalette[2]);
          pushQuad([p0B, p1B, p1T, p0T], col, '#1e242b', lw, biasBase);
        }
        if (topCol) {
          const projTop = tPts.map(pt => afProj.project(pt.x, pt.y, zT));
          const dTop = projTop.reduce((s, pt) => s + pt.depth, 0) / 8 + biasBase + 0.6;
          polys.push({ pts: projTop, depth: dTop, fill: topCol, stroke: '#1e242b', lineWidth: lw });
        }
      };

      const zShaftTop = zOps + 0.30 * R * H;
      const zDeckTop = zShaftTop + 0.10 * R * H;
      const zCabTop = zDeckTop + 0.22 * R * H;
      const zRoofTop = zCabTop + 0.08 * R * H;

      // Beige-concrete chamfered-square ATC tower shaft rising out of the operations roof
      pushChamferBox(zOps + 0.035 * R * H, zShaftTop, 0.20 * R, 0.18 * R, 0.19 * R, 0.17 * R, 0.22, ['#dfd5c8', '#c8beb0', '#a69c8e'], '#d2c8ba', 26.0, 1.05);
      // Small grey utility box on the right (+X) side of the tower shaft (matching sprite)
      extrudeBox(tcx + 0.16 * R, tcx + 0.25 * R, tcy - 0.06 * R, tcy + 0.08 * R, zOps + 0.035 * R * H, zOps + 0.13 * R * H, '#94a3b8', '#64748b', '#475569', 27.2, 0.9);

      // Stepped Overhanging Concrete Gallery Collar
      pushChamferBox(zShaftTop, zDeckTop, 0.21 * R, 0.19 * R, 0.25 * R, 0.23 * R, 0.22, ['#d2c8ba', '#b8aea0', '#968c7e'], '#dcd2c4', 28.0, 1.05);

      // 360-deg Outward-Sloping Turquoise-Cyan Glass Control Cab with crisp window mullions
      pushChamferBox(zDeckTop, zCabTop, 0.21 * R, 0.19 * R, 0.26 * R, 0.24 * R, 0.22, ['#5eead4', '#2dd4bf', '#0d9488'], '#99f6e4', 30.0, 1.1);

      // Flat Chamfered-Square ATC Roof Cap
      pushChamferBox(zCabTop, zRoofTop, 0.27 * R, 0.25 * R, 0.24 * R, 0.22 * R, 0.22, ['#dfd5c8', '#c4bab0', '#9e9488'], '#d6ccc0', 32.0, 1.05);

      // Roof Railing, Central Cylindrical Radar Motor Pedestal & Broad Horizontal Slotted ASR Airport Radar Bar
      polys.push({
        depth: afProj.project(tcx, tcy, zRoofTop + 0.22 * R * H).depth + 36.0,
        customDraw(ctx2) {
          ctx2.save();

          // Roof safety handrail posts & top rail
          const rxR = 0.22 * R, ryR = 0.20 * R, chR = 0.22;
          const rRing = [
            { x: tcx - rxR * (1 - chR), y: tcy - ryR },
            { x: tcx + rxR * (1 - chR), y: tcy - ryR },
            { x: tcx + rxR,             y: tcy - ryR * (1 - chR) },
            { x: tcx + rxR,             y: tcy + ryR * (1 - chR) },
            { x: tcx + rxR * (1 - chR), y: tcy + ryR },
            { x: tcx - rxR * (1 - chR), y: tcy + ryR },
            { x: tcx - rxR,             y: tcy + ryR * (1 - chR) },
            { x: tcx - rxR,             y: tcy - ryR * (1 - chR) }
          ];
          ctx2.strokeStyle = '#334155';
          ctx2.lineWidth = 1.05;
          ctx2.beginPath();
          rRing.forEach((pt, idx) => {
            const p = afProj.project(pt.x, pt.y, zRoofTop + 0.055 * R * H);
            if (idx === 0) ctx2.moveTo(p.x, p.y);
            else ctx2.lineTo(p.x, p.y);
          });
          ctx2.closePath();
          ctx2.stroke();
          for (const pt of rRing) {
            const p0 = afProj.project(pt.x, pt.y, zRoofTop);
            const p1 = afProj.project(pt.x, pt.y, zRoofTop + 0.055 * R * H);
            ctx2.beginPath(); ctx2.moveTo(p0.x, p0.y); ctx2.lineTo(p1.x, p1.y); ctx2.stroke();
          }

          // Cylindrical radar motor housing drum in center of ATC roof
          const mBase = afProj.project(tcx, tcy, zRoofTop + 0.02 * R * H);
          const mTop = afProj.project(tcx, tcy, zRoofTop + 0.11 * R * H);
          ctx2.fillStyle = '#6b5e54';
          ctx2.strokeStyle = '#1e242b';
          ctx2.lineWidth = 1.1;
          ctx2.beginPath();
          ctx2.rect(mTop.x - 7, mTop.y, 14, mBase.y - mTop.y);
          ctx2.fill();
          ctx2.stroke();

          // Wide Horizontal Slotted Rectangular ASR Airport Surveillance Radar Bar (facing broadside toward camera like sprite!)
          const radYaw = -0.62 + t * 2.2;
          const rxDir = Math.cos(radYaw) * 0.25 * R * RS;
          const ryDir = Math.sin(radYaw) * 0.25 * R * RS;
          const rz0 = zRoofTop + 0.11 * R * H;
          const rz1 = zRoofTop + 0.19 * R * H;
          const rPts = [
            afProj.project(tcx - rxDir, tcy - ryDir, rz0),
            afProj.project(tcx + rxDir, tcy + ryDir, rz0),
            afProj.project(tcx + rxDir, tcy + ryDir, rz1),
            afProj.project(tcx - rxDir, tcy - ryDir, rz1)
          ];
          ctx2.beginPath();
          rPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
          ctx2.closePath();
          ctx2.fillStyle = '#cbd5e1';
          ctx2.fill();
          ctx2.strokeStyle = '#1e242b';
          ctx2.lineWidth = 1.25;
          ctx2.stroke();

          // Slotted dark waveguide vents across the radar bar
          ctx2.strokeStyle = '#334155';
          ctx2.lineWidth = 0.9;
          for (let k = -4; k <= 4; k++) {
            const f = k / 5.0;
            const s0 = afProj.project(tcx + rxDir * f, tcy + ryDir * f, rz0 + 0.015 * R * H);
            const s1 = afProj.project(tcx + rxDir * f, tcy + ryDir * f, rz1 - 0.015 * R * H);
            ctx2.beginPath(); ctx2.moveTo(s0.x, s0.y); ctx2.lineTo(s1.x, s1.y); ctx2.stroke();
          }

          ctx2.restore();
        }
      });

      // 5. Right (+X, -Y) Twin Horizontal Cylindrical Steel Aviation Fuel Tanks with Yellow/Black Hazard Stripes
      const ftY0 = -0.70 * R, ftY1 = -0.26 * R;
      const rTank = 0.082 * R;
      const zTankC = zPad + 0.115 * R * H;
      extrudeBox(0.41 * R, 0.83 * R, ftY0 - 0.05 * R, ftY1 + 0.05 * R, zPad, zPad + 0.03 * R * H, '#9ca3af', '#6b7280', '#4b5563', 4.0, 0.9);

      for (const [tIdx, fx] of [[0, 0.52 * R], [1, 0.72 * R]]) {
        const tBias = 5.5 + tIdx * 1.5;
        extrudeBox(fx - 0.065 * R, fx + 0.065 * R, ftY0 + 0.05 * R, ftY0 + 0.11 * R, zPad, zTankC - 0.02 * R * H, '#94a3b8', '#64748b', '#475569', tBias - 0.5, 0.85);
        extrudeBox(fx - 0.065 * R, fx + 0.065 * R, ftY1 - 0.11 * R, ftY1 - 0.05 * R, zPad, zTankC - 0.02 * R * H, '#94a3b8', '#64748b', '#475569', tBias - 0.5, 0.85);

        const nSeg = 12;
        for (let i = 0; i < nSeg; i++) {
          const a0 = (i / nSeg) * Math.PI * 2;
          const a1 = ((i + 1) / nSeg) * Math.PI * 2;
          const x0 = fx + Math.cos(a0) * rTank;
          const z0 = zTankC + Math.sin(a0) * rTank * H;
          const x1 = fx + Math.cos(a1) * rTank;
          const z1 = zTankC + Math.sin(a1) * rTank * H;
          const am = (a0 + a1) * 0.5;
          const shade = afProj.shadeNormal(Math.cos(am), 0, Math.sin(am));
          const col = shade > 1.04 ? '#e2e8f0' : (shade > 0.90 ? '#cbd5e1' : '#94a3b8');
          pushQuad([
            { x: x0, y: ftY0, z: z0 },
            { x: x0, y: ftY1, z: z0 },
            { x: x1, y: ftY1, z: z1 },
            { x: x1, y: ftY0, z: z1 }
          ], col, '#475569', 0.65, tBias);
        }

        polys.push({
          depth: afProj.project(fx + rTank, (ftY0 + ftY1) * 0.5, zTankC + rTank * H).depth + tBias + 1.0,
          customDraw(ctx2) {
            ctx2.save();
            ctx2.beginPath();
            for (let i = 0; i <= 14; i++) {
              const a = (i / 14) * Math.PI * 2;
              const pt = afProj.project(fx + Math.cos(a) * rTank, ftY1, zTankC + Math.sin(a) * rTank * H);
              if (i === 0) ctx2.moveTo(pt.x, pt.y);
              else ctx2.lineTo(pt.x, pt.y);
            }
            ctx2.closePath();
            ctx2.fillStyle = '#94a3b8';
            ctx2.fill();
            ctx2.strokeStyle = '#1e242b';
            ctx2.lineWidth = 1.05;
            ctx2.stroke();

            const hX = fx + rTank * 0.92;
            const hZ0 = zTankC - 0.022 * R * H, hZ1 = zTankC + 0.032 * R * H;
            const hY0 = ftY0 + 0.04 * R, hY1 = ftY1 - 0.04 * R;
            const bPts = [
              afProj.project(hX, hY0, hZ0),
              afProj.project(hX, hY1, hZ0),
              afProj.project(hX, hY1, hZ1),
              afProj.project(hX, hY0, hZ1)
            ];
            ctx2.beginPath();
            bPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
            ctx2.closePath();
            ctx2.fillStyle = '#eab308';
            ctx2.fill();
            ctx2.strokeStyle = '#1e242b';
            ctx2.lineWidth = 0.8;
            ctx2.stroke();

            ctx2.fillStyle = '#1e242b';
            for (let k = 0; k < 5; k++) {
              const sy0 = hY0 + ((k + 0.15) / 5) * (hY1 - hY0);
              const sy1 = hY0 + ((k + 0.55) / 5) * (hY1 - hY0);
              const sPts = [
                afProj.project(hX + 0.002 * R, sy0, hZ0),
                afProj.project(hX + 0.002 * R, sy1, hZ0),
                afProj.project(hX + 0.002 * R, sy1, hZ1),
                afProj.project(hX + 0.002 * R, sy0, hZ1)
              ];
              ctx2.beginPath();
              sPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
              ctx2.closePath();
              ctx2.fill();
            }
            ctx2.restore();
          }
        });
      }

      flushFaces(ctx, faces);
      return;
    }

    if (defId === 'USA_STRATEGY_CENTER') {
      // High-Fidelity Ligne-Claire 3D Model matching usa_strategy_center.png:
      // 1. Symmetrical Cruciform / 8-Sided Star Fortified Command Bunker:
      //    - 4 Projecting Sloped Corner Bastions (Left, Bottom/Front, Right, Top/Back) with dark navy-slate base skirts, cream-white sloped concrete walls & glowing cyan horizontal light strips
      //    - 3 Automated Twin-Barrel Point-Defense Gun Turrets in dark gunmetal armor on circular pedestals on the Left, Front & Right corner bastions
      //    - Sloped Trapezoidal Armored Entry Portals between the corner bastions with navy-slate base cheeks, recessed corrugated steel blast doors, glowing cyan lintel lights & roof skylights
      // 2. Stepped Octagonal Upper Command Tier with sloped cream-white armor plates, individual framed glowing cyan observation windows, dark slate lower panels & perimeter cyan beacon cylinders
      // 3. Large Central White Geodesic Radar Dome (Radome) at (0,0) on a dark slate collar with triangulated geodesic panel seams
      // 4. 4 Open Parabolic Satellite Dishes & 2 Telemetry Whip Antennas flanking the geodesic dome on the back-left & back-right upper decks
      const scAngle = 0.75;
      const scProj = createProjector(scAngle, pitchScale, zScale);
      const R = r * 1.28 * SS;
      const polys = faces;

      const pushQuad = (pts3d, fill, stroke = '#1e242b', lineWidth = 1.0, bias = 0) => {
        const projPts = pts3d.map(pt => scProj.project(pt.x, pt.y, pt.z));
        const depth = projPts.reduce((acc, pt) => acc + pt.depth, 0) / projPts.length + bias;
        polys.push({ pts: projPts, depth, fill, stroke, lineWidth });
      };

      const pushOctFrustum = (cx, cy, zB, zT, rB, rT, sidePalette, topCol, biasBase, lw = 1.05) => {
        const n = 8;
        const topPts = [];
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI * 2 + Math.PI / 8;
          const a1 = ((i + 1) / n) * Math.PI * 2 + Math.PI / 8;
          const p0B = { x: cx + Math.cos(a0) * rB, y: cy + Math.sin(a0) * rB, z: zB };
          const p1B = { x: cx + Math.cos(a1) * rB, y: cy + Math.sin(a1) * rB, z: zB };
          const p1T = { x: cx + Math.cos(a1) * rT, y: cy + Math.sin(a1) * rT, z: zT };
          const p0T = { x: cx + Math.cos(a0) * rT, y: cy + Math.sin(a0) * rT, z: zT };
          topPts.push(p0T);
          const am = (a0 + a1) * 0.5;
          const shade = scProj.shadeNormal(Math.cos(am), Math.sin(am), 0.25);
          const col = shade > 1.02 ? sidePalette[0] : (shade > 0.88 ? sidePalette[1] : sidePalette[2]);
          pushQuad([p0B, p1B, p1T, p0T], col, '#1e242b', lw, biasBase);
        }
        if (topCol) {
          const projTop = topPts.map(pt => scProj.project(pt.x, pt.y, pt.z));
          const dTop = projTop.reduce((s, pt) => s + pt.depth, 0) / n + biasBase + 0.5;
          polys.push({ pts: projTop, depth: dTop, fill: topCol, stroke: '#1e242b', lineWidth: lw });
        }
      };

      // Helper for sloped trapezoidal box (inward-sloping bunker portals & bastions)
      const pushSlopedBox = (x0B, x1B, y0B, y1B, x0T, x1T, y0T, y1T, zB, zT, topCol, leftCol, rightCol, bias = 0, lw = 1.05) => {
        pushQuad([{ x: x0B, y: y0B, z: zB }, { x: x1B, y: y0B, z: zB }, { x: x1T, y: y0T, z: zT }, { x: x0T, y: y0T, z: zT }], rightCol, '#1e242b', lw, bias - 0.3);
        pushQuad([{ x: x0B, y: y0B, z: zB }, { x: x0B, y: y1B, z: zB }, { x: x0T, y: y1T, z: zT }, { x: x0T, y: y0T, z: zT }], leftCol, '#1e242b', lw, bias - 0.3);
        pushQuad([{ x: x0B, y: y1B, z: zB }, { x: x1B, y: y1B, z: zB }, { x: x1T, y: y1T, z: zT }, { x: x0T, y: y1T, z: zT }], leftCol, '#1e242b', lw, bias + 0.15);
        pushQuad([{ x: x1B, y: y0B, z: zB }, { x: x1B, y: y1B, z: zB }, { x: x1T, y: y1T, z: zT }, { x: x1T, y: y0T, z: zT }], rightCol, '#1e242b', lw, bias + 0.15);
        if (topCol) {
          pushQuad([{ x: x0T, y: y0T, z: zT }, { x: x1T, y: y0T, z: zT }, { x: x1T, y: y1T, z: zT }, { x: x0T, y: y1T, z: zT }], topCol, '#1e242b', lw, bias + 0.3);
        }
      };

      // 1. Subtle Sand-Concrete Perimeter Ground Trim (matching sprite's tight contoured base)
      const zPad = 0.025 * R * H;
      pushOctFrustum(0, 0, 0, zPad, 0.84 * R, 0.82 * R, ['#c8baa6', '#b0a28e', '#948674'], '#d2c4b0', -22.0, 0.9);

      // 2. Central Lower Octagonal Bunker Core (z: zPad..zTier1)
      const zTier1 = zPad + 0.38 * R * H;
      pushOctFrustum(0, 0, zPad, zPad + 0.12 * R * H, 0.68 * R, 0.65 * R, ['#4c627d', '#3b4e66', '#2b3a4d'], null, -8.0, 1.05);
      pushOctFrustum(0, 0, zPad + 0.12 * R * H, zTier1, 0.65 * R, 0.56 * R, ['#e6e0d4', '#cec8bc', '#b0aaa0'], '#dcd6ca', -6.0, 1.1);

      // 3. 4 Projecting Corner Sloped Bastions (Top -3pi/4, Right -pi/4, Left 3pi/4, Front/Bottom pi/4)
      const bastions = [
        { a: -3 * Math.PI / 4, hasTurret: false, bias: -4.0 }, // Top / Back (-X, -Y)
        { a: -Math.PI / 4,     hasTurret: true,  bias:  1.5 }, // Right (+X, -Y)
        { a:  3 * Math.PI / 4, hasTurret: true,  bias:  1.5 }, // Left (-X, +Y)
        { a:  Math.PI / 4,     hasTurret: true,  bias:  4.5 }  // Bottom / Front (+X, +Y)
      ];

      for (const b of bastions) {
        const bx = Math.cos(b.a) * 0.56 * R;
        const by = Math.sin(b.a) * 0.56 * R;
        const zSkirt = zPad + 0.13 * R * H;
        const zBastTop = zPad + 0.40 * R * H;

        // Dark Navy-Slate Base Armor Skirt
        pushOctFrustum(bx, by, zPad, zSkirt, 0.31 * R, 0.275 * R, ['#4c627d', '#3b4e66', '#2b3a4d'], null, b.bias, 1.05);
        // Sloped Cream-White Concrete Bastion Armor Walls
        pushOctFrustum(bx, by, zSkirt, zBastTop, 0.275 * R, 0.205 * R, ['#ece6da', '#d4cec2', '#b6b0a4'], '#e0dad0', b.bias + 0.8, 1.08);
        // Glowing Cyan Horizontal Light Strip Collar near top of Bastion
        pushOctFrustum(bx, by, zBastTop - 0.08 * R * H, zBastTop - 0.035 * R * H, 0.222 * R, 0.212 * R, ['#67e8f9', '#22d3ee', '#0891b2'], null, b.bias + 1.4, 0.9);

        // Automated Twin-Barrel Point-Defense Gun Turret in Dark Gunmetal Armor on Left, Front & Right Corner Bastions
        if (b.hasTurret) {
          const tx = bx * 0.95, ty = by * 0.95;
          // Circular grey armored turret ring pedestal
          pushOctFrustum(tx, ty, zBastTop, zBastTop + 0.055 * R * H, 0.125 * R, 0.105 * R, ['#94a3b8', '#64748b', '#475569'], '#94a3b8', b.bias + 2.2, 0.95);
          // Dark gunmetal-grey armored gunhouse (matching sprite!)
          pushOctFrustum(tx, ty, zBastTop + 0.055 * R * H, zBastTop + 0.145 * R * H, 0.095 * R, 0.075 * R, ['#64748b', '#475569', '#334155'], '#64748b', b.bias + 2.8, 1.0);

          // Twin heavy dark cannon barrels + gun breeches pointing radially outward along b.a
          polys.push({
            depth: scProj.project(tx, ty, zBastTop + 0.16 * R * H).depth + b.bias + 4.2,
            customDraw(ctx2) {
              ctx2.save();
              const cosA = Math.cos(b.a), sinA = Math.sin(b.a);
              const px = -sinA * 0.030 * R, py = cosA * 0.030 * R;
              for (const sgn of [-1, 1]) {
                const p0 = scProj.project(tx + sgn * px + cosA * 0.03 * R, ty + sgn * py + sinA * 0.03 * R, zBastTop + 0.10 * R * H);
                const p1 = scProj.project(tx + sgn * px + cosA * 0.22 * R, ty + sgn * py + sinA * 0.22 * R, zBastTop + 0.105 * R * H);
                ctx2.strokeStyle = '#1e242b';
                ctx2.lineWidth = 3.2;
                ctx2.lineCap = 'round';
                ctx2.beginPath(); ctx2.moveTo(p0.x, p0.y); ctx2.lineTo(p1.x, p1.y); ctx2.stroke();
                ctx2.strokeStyle = '#64748b';
                ctx2.lineWidth = 1.4;
                ctx2.beginPath(); ctx2.moveTo(p0.x, p0.y); ctx2.lineTo(p1.x, p1.y); ctx2.stroke();
              }
              ctx2.restore();
            }
          });
        }
      }

      // 4. Front-Left (+Y) & Front-Right (+X) Sloped Trapezoidal Armored Entry Portals between the Corner Bastions
      const zPortSkirt = zPad + 0.10 * R * H;
      const zPortTop = zPad + 0.34 * R * H;

      // Portal 1 (+Y Bottom-Left face): Sloped concrete portal with dark navy base skirt, recessed corrugated steel blast door, glowing cyan lintel & roof skylight
      pushSlopedBox(-0.20 * R, 0.20 * R, 0.44 * R, 0.70 * R, -0.17 * R, 0.17 * R, 0.44 * R, 0.65 * R, zPad, zPortSkirt, null, '#3b4e66', '#2b3a4d', 2.2, 1.05);
      pushSlopedBox(-0.17 * R, 0.17 * R, 0.44 * R, 0.65 * R, -0.13 * R, 0.13 * R, 0.42 * R, 0.57 * R, zPortSkirt, zPortTop, '#dcd6ca', '#d4cec2', '#b6b0a4', 2.5, 1.05);
      // Recessed dark steel blast door + horizontal door ribs + glowing cyan lintel light on +Y portal
      polys.push({
        depth: scProj.project(0, 0.68 * R, zPortTop).depth + 3.2,
        customDraw(ctx2) {
          ctx2.save();
          const dPts = [
            scProj.project(-0.095 * R, 0.67 * R, zPad),
            scProj.project( 0.095 * R, 0.67 * R, zPad),
            scProj.project( 0.082 * R, 0.61 * R, zPad + 0.21 * R * H),
            scProj.project(-0.082 * R, 0.61 * R, zPad + 0.21 * R * H)
          ];
          ctx2.beginPath();
          dPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
          ctx2.closePath();
          ctx2.fillStyle = '#475569';
          ctx2.fill();
          ctx2.strokeStyle = '#1e242b';
          ctx2.lineWidth = 1.05;
          ctx2.stroke();
          for (let k = 1; k <= 3; k++) {
            const f = k / 4;
            const zL = zPad + f * 0.21 * R * H;
            const yL = 0.67 * R - f * 0.06 * R;
            const xL = (0.095 - f * 0.013) * R;
            const p0 = scProj.project(-xL, yL, zL);
            const p1 = scProj.project( xL, yL, zL);
            ctx2.beginPath(); ctx2.moveTo(p0.x, p0.y); ctx2.lineTo(p1.x, p1.y); ctx2.stroke();
          }
          // Glowing cyan lintel light above door
          const lPts = [
            scProj.project(-0.085 * R, 0.605 * R, zPad + 0.23 * R * H),
            scProj.project( 0.085 * R, 0.605 * R, zPad + 0.23 * R * H),
            scProj.project( 0.078 * R, 0.585 * R, zPad + 0.275 * R * H),
            scProj.project(-0.078 * R, 0.585 * R, zPad + 0.275 * R * H)
          ];
          ctx2.beginPath();
          lPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
          ctx2.closePath();
          ctx2.fillStyle = '#22d3ee';
          ctx2.fill();
          ctx2.stroke();
          // Roof skylight slot on top of portal
          const sPts = [
            scProj.project(-0.09 * R, 0.48 * R, zPortTop + 0.003 * R * H),
            scProj.project( 0.09 * R, 0.48 * R, zPortTop + 0.003 * R * H),
            scProj.project( 0.09 * R, 0.54 * R, zPortTop + 0.003 * R * H),
            scProj.project(-0.09 * R, 0.54 * R, zPortTop + 0.003 * R * H)
          ];
          ctx2.beginPath();
          sPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
          ctx2.closePath();
          ctx2.fillStyle = '#7dd3fc';
          ctx2.fill();
          ctx2.stroke();
          ctx2.restore();
        }
      });

      // Portal 2 (+X Bottom-Right face): Sloped concrete portal with dark navy base skirt, recessed corrugated steel blast door, glowing cyan lintel & roof skylight
      pushSlopedBox(0.44 * R, 0.70 * R, -0.20 * R, 0.20 * R, 0.44 * R, 0.65 * R, -0.17 * R, 0.17 * R, zPad, zPortSkirt, null, '#3b4e66', '#2b3a4d', 2.2, 1.05);
      pushSlopedBox(0.44 * R, 0.65 * R, -0.17 * R, 0.17 * R, 0.42 * R, 0.57 * R, -0.13 * R, 0.13 * R, zPortSkirt, zPortTop, '#dcd6ca', '#d4cec2', '#b6b0a4', 2.5, 1.05);
      polys.push({
        depth: scProj.project(0.68 * R, 0, zPortTop).depth + 3.2,
        customDraw(ctx2) {
          ctx2.save();
          const dPts = [
            scProj.project(0.67 * R, -0.095 * R, zPad),
            scProj.project(0.67 * R,  0.095 * R, zPad),
            scProj.project(0.61 * R,  0.082 * R, zPad + 0.21 * R * H),
            scProj.project(0.61 * R, -0.082 * R, zPad + 0.21 * R * H)
          ];
          ctx2.beginPath();
          dPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
          ctx2.closePath();
          ctx2.fillStyle = '#475569';
          ctx2.fill();
          ctx2.strokeStyle = '#1e242b';
          ctx2.lineWidth = 1.05;
          ctx2.stroke();
          for (let k = 1; k <= 3; k++) {
            const f = k / 4;
            const zL = zPad + f * 0.21 * R * H;
            const xL = 0.67 * R - f * 0.06 * R;
            const yL = (0.095 - f * 0.013) * R;
            const p0 = scProj.project(xL, -yL, zL);
            const p1 = scProj.project(xL,  yL, zL);
            ctx2.beginPath(); ctx2.moveTo(p0.x, p0.y); ctx2.lineTo(p1.x, p1.y); ctx2.stroke();
          }
          // Glowing cyan lintel light above door
          const lPts = [
            scProj.project(0.605 * R, -0.085 * R, zPad + 0.23 * R * H),
            scProj.project(0.605 * R,  0.085 * R, zPad + 0.23 * R * H),
            scProj.project(0.585 * R,  0.078 * R, zPad + 0.275 * R * H),
            scProj.project(0.585 * R, -0.078 * R, zPad + 0.275 * R * H)
          ];
          ctx2.beginPath();
          lPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
          ctx2.closePath();
          ctx2.fillStyle = '#22d3ee';
          ctx2.fill();
          ctx2.stroke();
          // Roof skylight slot on top of portal
          const sPts = [
            scProj.project(0.48 * R, -0.09 * R, zPortTop + 0.003 * R * H),
            scProj.project(0.54 * R, -0.09 * R, zPortTop + 0.003 * R * H),
            scProj.project(0.54 * R,  0.09 * R, zPortTop + 0.003 * R * H),
            scProj.project(0.48 * R,  0.09 * R, zPortTop + 0.003 * R * H)
          ];
          ctx2.beginPath();
          sPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
          ctx2.closePath();
          ctx2.fillStyle = '#7dd3fc';
          ctx2.fill();
          ctx2.stroke();
          ctx2.restore();
        }
      });

      // 5. Stepped Octagonal Upper Command Tier (z: zTier1..zTier2) with Individual Framed Glowing Cyan Windows & Dark Slate Lower Panels
      const zTier2 = zTier1 + 0.27 * R * H;
      const rU0 = 0.52 * R, rU1 = 0.42 * R;
      pushOctFrustum(0, 0, zTier1, zTier2, rU0, rU1, ['#ece6da', '#d4cec2', '#b6b0a4'], '#e2dcd0', 6.0, 1.1);

      // Draw individual framed glowing cyan window slits & dark navy-slate lower panels on the visible octagonal faces of Upper Tier
      for (let i = 0; i < 8; i++) {
        const a0 = (i / 8) * Math.PI * 2 + Math.PI / 8;
        const a1 = ((i + 1) / 8) * Math.PI * 2 + Math.PI / 8;
        const lerpPt = (u, v) => {
          const rCur = (1 - v) * rU0 + v * rU1 + 0.003 * R;
          const x0 = Math.cos(a0) * rCur, y0 = Math.sin(a0) * rCur;
          const x1 = Math.cos(a1) * rCur, y1 = Math.sin(a1) * rCur;
          return {
            x: (1 - u) * x0 + u * x1,
            y: (1 - u) * y0 + u * y1,
            z: (1 - v) * zTier1 + v * zTier2
          };
        };
        // Dark navy-slate lower trapezoid panel on each face
        pushQuad([lerpPt(0.18, 0.0), lerpPt(0.82, 0.0), lerpPt(0.78, 0.38), lerpPt(0.22, 0.38)], '#3b4e66', '#1e242b', 0.9, 6.8);
        // Framed glowing cyan observation window slit above the dark panel
        pushQuad([lerpPt(0.16, 0.52), lerpPt(0.84, 0.52), lerpPt(0.82, 0.76), lerpPt(0.18, 0.76)], '#22d3ee', '#1e242b', 0.95, 7.0);
      }

      // Ring of 8 Glowing Cyan Cylindrical Beacons around the Upper Roof Ledge (zTier2)
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        const lx = Math.cos(a) * 0.40 * R;
        const ly = Math.sin(a) * 0.40 * R;
        polys.push({
          depth: scProj.project(lx, ly, zTier2 + 0.06 * R * H).depth + 8.2,
          customDraw(ctx2) {
            ctx2.save();
            const p0 = scProj.project(lx, ly, zTier2 + 0.025 * R * H);
            ctx2.fillStyle = '#67e8f9';
            ctx2.strokeStyle = '#1e242b';
            ctx2.lineWidth = 0.9;
            ctx2.beginPath();
            ctx2.arc(p0.x, p0.y, 3.2, 0, Math.PI * 2);
            ctx2.fill();
            ctx2.stroke();
            ctx2.restore();
          }
        });
      }

      // 6. Central White Geodesic Radar Dome (Radome) on Dark Slate Collar (z: zTier2..zTier2 + 0.42R)
      const zCollar = zTier2 + 0.065 * R * H;
      const rDome = 0.29 * R;
      pushOctFrustum(0, 0, zTier2, zCollar, 0.32 * R, 0.30 * R, ['#64748b', '#475569', '#334155'], '#475569', 9.0, 1.05);

      // Geodesic Hemisphere Dome with Triangulated Panel Seams
      const latSteps = 4, lonSteps = 10;
      for (let i = 0; i < latSteps; i++) {
        const p0 = (i / latSteps) * (Math.PI * 0.5);
        const p1 = ((i + 1) / latSteps) * (Math.PI * 0.5);
        const r0 = Math.cos(p0) * rDome, z0 = zCollar + Math.sin(p0) * rDome * 1.05 * H;
        const r1 = Math.cos(p1) * rDome, z1 = zCollar + Math.sin(p1) * rDome * 1.05 * H;
        for (let j = 0; j < lonSteps; j++) {
          const a0 = (j / lonSteps) * Math.PI * 2;
          const a1 = ((j + 1) / lonSteps) * Math.PI * 2;
          const am = (a0 + a1) * 0.5;
          const pm = (p0 + p1) * 0.5;
          const shade = scProj.shadeNormal(Math.cos(am) * Math.cos(pm), Math.sin(am) * Math.cos(pm), Math.sin(pm));
          const col = shade > 1.06 ? '#f8fafc' : (shade > 0.92 ? '#e5e9ec' : '#cbd5e1');
          const q00 = { x: Math.cos(a0) * r0, y: Math.sin(a0) * r0, z: z0 };
          const q10 = { x: Math.cos(a1) * r0, y: Math.sin(a1) * r0, z: z0 };
          const q11 = { x: Math.cos(a1) * r1, y: Math.sin(a1) * r1, z: z1 };
          const q01 = { x: Math.cos(a0) * r1, y: Math.sin(a0) * r1, z: z1 };
          if (i < latSteps - 1) {
            pushQuad([q00, q10, q11, q00], col, '#475569', 0.75, 11.0 + i * 0.8);
            pushQuad([q00, q11, q01, q00], col, '#475569', 0.75, 11.0 + i * 0.8);
          } else {
            pushQuad([q00, q10, q11, q01], col, '#475569', 0.75, 11.0 + i * 0.8);
          }
        }
      }

      // 7. 4 Open Parabolic Satellite Dishes & 2 Cyan-Tipped Telemetry Whip Antennas flanking the Geodesic Dome
      // Positioned using screen-space (wx, wy) converted to world (x, y) so the 4 dishes sit on the exact left & right shoulders of the geodesic dome as in usa_strategy_center.png!
      const cosSC = Math.cos(scAngle), sinSC = Math.sin(scAngle);
      const fromScreenXY = (wx, wy) => ({
        x: wx * cosSC + wy * sinSC,
        y: -wx * sinSC + wy * cosSC
      });
      const tier2RoofDepth = scProj.project(0, 0, zTier2).depth;
      const dishes = [
        { ...fromScreenXY(-0.42 * R, -0.02 * R), z: zTier2 + 0.08 * R * H, rx: 13 * RS, ry: 10 * RS, tilt: -0.48, feedDx: -6, feedDy: -4, depth: tier2RoofDepth + 10.5 },
        { ...fromScreenXY(-0.27 * R, -0.22 * R), z: zTier2 + 0.24 * R * H, rx: 18 * RS, ry: 14 * RS, tilt: -0.38, feedDx: -8, feedDy: -6, depth: tier2RoofDepth + 10.2 },
        { ...fromScreenXY( 0.27 * R, -0.22 * R), z: zTier2 + 0.25 * R * H, rx: 22 * RS, ry: 17 * RS, tilt:  0.38, feedDx:  9, feedDy: -7, depth: tier2RoofDepth + 10.2 },
        { ...fromScreenXY( 0.42 * R, -0.02 * R), z: zTier2 + 0.08 * R * H, rx: 13 * RS, ry: 10 * RS, tilt:  0.48, feedDx:  6, feedDy: -4, depth: tier2RoofDepth + 10.5 }
      ];
      for (const d of dishes) {
        polys.push({
          depth: d.depth,
          customDraw(ctx2) {
            ctx2.save();
            const pBase = scProj.project(d.x, d.y, d.z - 0.12 * R * H);
            const pCenter = scProj.project(d.x, d.y, d.z);
            // Dark pedestal mast
            ctx2.strokeStyle = '#334155';
            ctx2.lineWidth = 3.2;
            ctx2.beginPath(); ctx2.moveTo(pBase.x, pBase.y); ctx2.lineTo(pCenter.x, pCenter.y); ctx2.stroke();

            // Parabolic dish bowl (tilted ellipse in screen space)
            ctx2.beginPath();
            for (let i = 0; i <= 20; i++) {
              const a = (i / 20) * Math.PI * 2;
              const u = Math.cos(a) * d.rx;
              const v = Math.sin(a) * d.ry;
              const sx = pCenter.x + u * Math.cos(d.tilt) - v * Math.sin(d.tilt);
              const sy = pCenter.y + u * Math.sin(d.tilt) + v * Math.cos(d.tilt);
              if (i === 0) ctx2.moveTo(sx, sy);
              else ctx2.lineTo(sx, sy);
            }
            ctx2.closePath();
            ctx2.fillStyle = '#e2e8f0';
            ctx2.fill();
            ctx2.strokeStyle = '#1e242b';
            ctx2.lineWidth = 1.15;
            ctx2.stroke();

            // Tripod struts & feedhorn receiver
            const fx = pCenter.x + d.feedDx, fy = pCenter.y + d.feedDy;
            ctx2.strokeStyle = '#1e242b';
            ctx2.lineWidth = 1.0;
            for (const ang of [-1.2, 0.0, 1.2]) {
              const rx0 = pCenter.x + Math.cos(ang) * d.rx * 0.65;
              const ry0 = pCenter.y + Math.sin(ang) * d.ry * 0.65;
              ctx2.beginPath(); ctx2.moveTo(rx0, ry0); ctx2.lineTo(fx, fy); ctx2.stroke();
            }
            ctx2.fillStyle = '#475569';
            ctx2.beginPath(); ctx2.arc(fx, fy, 2.2, 0, Math.PI * 2); ctx2.fill();
            ctx2.restore();
          }
        });
      }

      // 2 Vertical Telemetry Whip Antennas with glowing cyan tip beacons behind the dome
      for (const [wx, wy, hAnt] of [[-0.08 * R, -0.26 * R, 0.36 * R * H], [-0.01 * R, -0.28 * R, 0.44 * R * H]]) {
        const antPt = fromScreenXY(wx, wy);
        polys.push({
          depth: tier2RoofDepth + 10.0,
          customDraw(ctx2) {
            ctx2.save();
            const p0 = scProj.project(antPt.x, antPt.y, zTier2 + 0.10 * R * H);
            const p1 = scProj.project(antPt.x, antPt.y, zTier2 + hAnt);
            ctx2.strokeStyle = '#1e242b';
            ctx2.lineWidth = 1.4;
            ctx2.beginPath(); ctx2.moveTo(p0.x, p0.y); ctx2.lineTo(p1.x, p1.y); ctx2.stroke();
            ctx2.fillStyle = '#22d3ee';
            ctx2.strokeStyle = '#1e242b';
            ctx2.lineWidth = 0.8;
            ctx2.beginPath(); ctx2.arc(p1.x, p1.y, 2.6, 0, Math.PI * 2); ctx2.fill(); ctx2.stroke();
            ctx2.restore();
          }
        });
      }

      flushFaces(ctx, faces);
      return;
    }

    if (defId === 'USA_SUPPLY_DROP_ZONE') {
      // High-Fidelity Ligne-Claire 3D Model matching usa_supply_drop_zone.png:
      // 1. Beveled Octagonal Concrete Drop Pad with recessed ramp notches on visible faces & radial concrete expansion joints
      // 2. Concentric Yellow Target Circles + Central Dark-Slate Octagonal Bullseye & Inner Light-Grey Target Ring
      // 3. 10 Glowing Cyan Cylindrical Perimeter Landing Beacons around the outer octagonal rim
      // 4. Back-Right Concrete Telemetry & Control Shed with steel door, cyan window, side HVAC unit, parabolic dish & Yagi antenna mast
      // 5. Twin Tall Steel Lattice/Column Floodlight Towers on the Far-Left and Far-Right corners with 2x3 warm-white floodlight banks
      // 6. Descending X-Braced Wooden Supply Crate suspended by 8 white shroud lines under a ribbed olive-drab hemispherical parachute canopy
      const dzAngle = 0.75;
      const dzProj = createProjector(dzAngle, pitchScale, zScale);
      const R = r * 1.28 * SS;
      const polys = faces;
      const cosDZ = Math.cos(dzAngle), sinDZ = Math.sin(dzAngle);
      const fromScreen = (wx, wy) => ({
        x: wx * cosDZ + wy * sinDZ,
        y: -wx * sinDZ + wy * cosDZ
      });

      const pushQuad = (pts3d, fill, stroke = '#1e242b', lineWidth = 1.0, bias = 0) => {
        const projPts = pts3d.map(pt => dzProj.project(pt.x, pt.y, pt.z));
        const depth = projPts.reduce((acc, pt) => acc + pt.depth, 0) / projPts.length + bias;
        polys.push({ pts: projPts, depth, fill, stroke, lineWidth });
      };

      const extrudeBox = (x0, x1, y0, y1, z0, z1, topCol, leftCol, rightCol, bias = 0, lw = 1.0) => {
        pushQuad([{ x: x0, y: y0, z: z0 }, { x: x1, y: y0, z: z0 }, { x: x1, y: y0, z: z1 }, { x: x0, y: y0, z: z1 }], leftCol, '#1e242b', lw, bias - 0.5);
        pushQuad([{ x: x0, y: y0, z: z0 }, { x: x0, y: y1, z: z0 }, { x: x0, y: y1, z: z1 }, { x: x0, y: y0, z: z1 }], rightCol, '#1e242b', lw, bias - 0.5);
        pushQuad([{ x: x0, y: y1, z: z0 }, { x: x1, y: y1, z: z0 }, { x: x1, y: y1, z: z1 }, { x: x0, y: y1, z: z1 }], leftCol, '#1e242b', lw, bias + 0.15);
        pushQuad([{ x: x1, y: y0, z: z0 }, { x: x1, y: y1, z: z0 }, { x: x1, y: y1, z: z1 }, { x: x1, y: y0, z: z1 }], rightCol, '#1e242b', lw, bias + 0.15);
        pushQuad([{ x: x0, y: y0, z: z1 }, { x: x1, y: y0, z: z1 }, { x: x1, y: y1, z: z1 }, { x: x0, y: y1, z: z1 }], topCol, '#1e242b', lw, bias + 0.3);
      };

      // 1. Beveled Octagonal Concrete Drop Pad (screen-aligned octagon so flat edges face Top/Bottom/Left/Right and 45-deg diagonals match sprite!)
      const zPad = 0.085 * R * H;
      const rOut = 0.88 * R, rIn = 0.81 * R;
      const nOct = 8;
      const topOctPts = [];
      for (let i = 0; i < nOct; i++) {
        const a0 = (i / nOct) * Math.PI * 2 + Math.PI / 8;
        const a1 = ((i + 1) / nOct) * Math.PI * 2 + Math.PI / 8;
        const b0 = fromScreen(Math.cos(a0) * rOut, Math.sin(a0) * rOut);
        const b1 = fromScreen(Math.cos(a1) * rOut, Math.sin(a1) * rOut);
        const t1 = fromScreen(Math.cos(a1) * rIn,  Math.sin(a1) * rIn);
        const t0 = fromScreen(Math.cos(a0) * rIn,  Math.sin(a0) * rIn);
        topOctPts.push({ ...t0, z: zPad });
        const am = (a0 + a1) * 0.5;
        const col = Math.sin(am) > 0.2 ? (Math.cos(am) < 0 ? '#b4aca0' : '#968e82') : '#c8c0b4';
        pushQuad([
          { ...b0, z: 0 }, { ...b1, z: 0 },
          { ...t1, z: zPad }, { ...t0, z: zPad }
        ], col, '#1e242b', 1.1, -30.0);

        // Recessed concrete ramp notch on each visible front/side bevel face
        if (Math.sin(am) > -0.2) {
          const lerpP = (pA, pB, f) => ({ x: pA.x + (pB.x - pA.x) * f, y: pA.y + (pB.y - pA.y) * f });
          const nb0 = lerpP(b0, b1, 0.30), nb1 = lerpP(b0, b1, 0.70);
          const nt0 = lerpP(t0, t1, 0.34), nt1 = lerpP(t0, t1, 0.66);
          pushQuad([
            { ...nb0, z: 0 }, { ...nb1, z: 0 },
            { ...nt1, z: zPad * 0.85 }, { ...nt0, z: zPad * 0.85 }
          ], '#78716c', '#1e242b', 0.9, -28.5);
        }
      }
      const projTopOct = topOctPts.map(pt => dzProj.project(pt.x, pt.y, pt.z));
      const padTopDepth = projTopOct.reduce((s, pt) => s + pt.depth, 0) / nOct - 25.0;
      polys.push({ pts: projTopOct, depth: padTopDepth, fill: '#cec6ba', stroke: '#1e242b', lineWidth: 1.15 });

      // 2. Concentric Yellow Target Circles, Concrete Expansion Seams & Central Bullseye + 10 Glowing Cyan Perimeter Beacons
      polys.push({
        depth: padTopDepth + 1.5,
        customDraw(ctx2) {
          ctx2.save();

          // Inner recessed octagonal concrete border seam
          ctx2.beginPath();
          for (let i = 0; i < nOct; i++) {
            const a = (i / nOct) * Math.PI * 2 + Math.PI / 8;
            const wPt = fromScreen(Math.cos(a) * 0.75 * R, Math.sin(a) * 0.75 * R);
            const p = dzProj.project(wPt.x, wPt.y, zPad);
            if (i === 0) ctx2.moveTo(p.x, p.y);
            else ctx2.lineTo(p.x, p.y);
          }
          ctx2.closePath();
          ctx2.fillStyle = '#c4bcb0';
          ctx2.fill();
          ctx2.strokeStyle = '#6e665e';
          ctx2.lineWidth = 0.95;
          ctx2.stroke();

          // Helper to draw projected 3D circles on zPad
          const drawRing3D = (rad, fill, stroke = '#1e242b', lw = 1.05, segs = 32) => {
            ctx2.beginPath();
            for (let i = 0; i <= segs; i++) {
              const a = (i / segs) * Math.PI * 2;
              const p = dzProj.project(Math.cos(a) * rad, Math.sin(a) * rad, zPad);
              if (i === 0) ctx2.moveTo(p.x, p.y);
              else ctx2.lineTo(p.x, p.y);
            }
            ctx2.closePath();
            if (fill) {
              ctx2.fillStyle = fill;
              ctx2.fill();
            }
            if (stroke) {
              ctx2.strokeStyle = stroke;
              ctx2.lineWidth = lw;
              ctx2.stroke();
            }
          };

          // Outer yellow target ring
          drawRing3D(0.60 * R, '#eab308', '#1e242b', 1.1);
          drawRing3D(0.51 * R, '#c4bcb0', '#1e242b', 1.0);
          // Inner yellow target ring
          drawRing3D(0.35 * R, '#eab308', '#1e242b', 1.05);
          drawRing3D(0.26 * R, '#b8b0a4', '#1e242b', 0.95);

          // Radial concrete expansion lines from bullseye to outer octagon
          ctx2.strokeStyle = 'rgba(60, 56, 50, 0.45)';
          ctx2.lineWidth = 0.85;
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
            const w0 = fromScreen(Math.cos(a) * 0.20 * R, Math.sin(a) * 0.20 * R);
            const w1 = fromScreen(Math.cos(a) * 0.75 * R, Math.sin(a) * 0.75 * R);
            const p0 = dzProj.project(w0.x, w0.y, zPad);
            const p1 = dzProj.project(w1.x, w1.y, zPad);
            ctx2.beginPath(); ctx2.moveTo(p0.x, p0.y); ctx2.lineTo(p1.x, p1.y); ctx2.stroke();
          }

          // Central dark-grey octagonal/diamond bullseye pad + inner light-grey circle
          drawRing3D(0.19 * R, '#78716c', '#1e242b', 1.1, 8);
          drawRing3D(0.10 * R, '#d6d3cd', '#1e242b', 1.0, 20);

          // 10 Glowing Cyan Cylindrical Perimeter Landing Beacons around the octagonal rim
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2 + 0.15;
            const wPt = fromScreen(Math.cos(a) * 0.70 * R, Math.sin(a) * 0.70 * R);
            const pB = dzProj.project(wPt.x, wPt.y, zPad);
            const pT = dzProj.project(wPt.x, wPt.y, zPad + 0.035 * R * H);
            ctx2.fillStyle = '#334155';
            ctx2.strokeStyle = '#1e242b';
            ctx2.lineWidth = 0.9;
            ctx2.beginPath();
            ctx2.arc(pB.x, pB.y, 3.6, 0, Math.PI * 2);
            ctx2.fill();
            ctx2.stroke();
            ctx2.fillStyle = '#22d3ee';
            ctx2.beginPath();
            ctx2.arc(pT.x, pT.y, 3.1, 0, Math.PI * 2);
            ctx2.fill();
            ctx2.stroke();
          }

          ctx2.restore();
        }
      });

      // 3. Back-Right Telemetry & Control Shed (along the Top-Right edge of the octagonal deck: world X ∈ [-0.14R, 0.18R], Y ∈ [-0.72R, -0.44R])
      const zShed = zPad + 0.24 * R * H;
      const shedAnchor = padTopDepth + 12.0;
      const pushShedBox = (x0, x1, y0, y1, z0, z1, topC, leftC, rightC, bias = 0, lw = 1.0) => {
        const p000 = { x: x0, y: y0, z: z0 }, p100 = { x: x1, y: y0, z: z0 };
        const p110 = { x: x1, y: y1, z: z0 }, p010 = { x: x0, y: y1, z: z0 };
        const p001 = { x: x0, y: y0, z: z1 }, p101 = { x: x1, y: y0, z: z1 };
        const p111 = { x: x1, y: y1, z: z1 }, p011 = { x: x0, y: y1, z: z1 };
        const addF = (pts3d, fill, dOff) => {
          polys.push({
            pts: pts3d.map(pt => dzProj.project(pt.x, pt.y, pt.z)),
            depth: shedAnchor + bias + dOff,
            fill,
            stroke: '#1e242b',
            lineWidth: lw
          });
        };
        addF([p010, p110, p111, p011], leftC, 0.2);
        addF([p100, p110, p111, p101], rightC, 0.4);
        addF([p001, p101, p111, p011], topC, 0.8);
      };

      // Shed main concrete cabin + dark roof trim + overhanging flat roof slab + side HVAC unit
      pushShedBox(-0.12 * R, 0.20 * R, -0.70 * R, -0.44 * R, zPad, zShed, '#dcd4c8', '#c8c0b4', '#9e968c', 0.0, 1.05);
      pushShedBox(-0.13 * R, 0.21 * R, -0.71 * R, -0.43 * R, zShed - 0.04 * R * H, zShed, '#64748b', '#64748b', '#475569', 1.0, 0.95);
      pushShedBox(-0.14 * R, 0.22 * R, -0.72 * R, -0.42 * R, zShed, zShed + 0.035 * R * H, '#b8b0a4', '#ccc4ba', '#9e968c', 2.0, 1.0);
      pushShedBox(0.20 * R, 0.27 * R, -0.62 * R, -0.48 * R, zPad, zPad + 0.11 * R * H, '#94a3b8', '#64748b', '#475569', 2.5, 0.95);

      // Steel door, window, rooftop parabolic dish & tall multi-element Yagi antenna on Control Shed
      polys.push({
        depth: shedAnchor + 4.0,
        customDraw(ctx2) {
          ctx2.save();
          // Steel door on +Y (front-left) face of shed
          const dPts = [
            dzProj.project(-0.08 * R, -0.436 * R, zPad),
            dzProj.project( 0.02 * R, -0.436 * R, zPad),
            dzProj.project( 0.02 * R, -0.436 * R, zPad + 0.16 * R * H),
            dzProj.project(-0.08 * R, -0.436 * R, zPad + 0.16 * R * H)
          ];
          ctx2.beginPath();
          dPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
          ctx2.closePath();
          ctx2.fillStyle = '#64748b';
          ctx2.fill();
          ctx2.strokeStyle = '#1e242b';
          ctx2.lineWidth = 0.95;
          ctx2.stroke();

          // Dark-tinted observation window next to door
          const wPts = [
            dzProj.project(0.05 * R, -0.436 * R, zPad + 0.07 * R * H),
            dzProj.project(0.16 * R, -0.436 * R, zPad + 0.07 * R * H),
            dzProj.project(0.16 * R, -0.436 * R, zPad + 0.15 * R * H),
            dzProj.project(0.05 * R, -0.436 * R, zPad + 0.15 * R * H)
          ];
          ctx2.beginPath();
          wPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
          ctx2.closePath();
          ctx2.fillStyle = '#475569';
          ctx2.fill();
          ctx2.stroke();

          // Rooftop parabolic dish on shed roof
          const pDish = dzProj.project(-0.01 * R, -0.56 * R, zShed + 0.13 * R * H);
          const pDishBase = dzProj.project(-0.01 * R, -0.56 * R, zShed + 0.035 * R * H);
          ctx2.strokeStyle = '#1e242b';
          ctx2.lineWidth = 2.4;
          ctx2.beginPath(); ctx2.moveTo(pDishBase.x, pDishBase.y); ctx2.lineTo(pDish.x, pDish.y); ctx2.stroke();
          ctx2.fillStyle = '#e2e8f0';
          ctx2.strokeStyle = '#1e242b';
          ctx2.lineWidth = 1.1;
          ctx2.beginPath();
          ctx2.ellipse(pDish.x, pDish.y, 10.5 * RS, 8.0 * RS, -0.35, 0, Math.PI * 2);
          ctx2.fill();
          ctx2.stroke();
          // Feed horn on dish
          ctx2.beginPath();
          ctx2.moveTo(pDish.x, pDish.y);
          ctx2.lineTo(pDish.x - 5 * RS, pDish.y - 4 * RS);
          ctx2.stroke();

          // Tall Yagi crossbar telemetry antenna mast behind dish on shed roof
          const m0 = dzProj.project(0.08 * R, -0.62 * R, zShed + 0.035 * R * H);
          const m1 = dzProj.project(0.08 * R, -0.62 * R, zShed + 0.44 * R * H);
          ctx2.strokeStyle = '#1e242b';
          ctx2.lineWidth = 1.6;
          ctx2.beginPath(); ctx2.moveTo(m0.x, m0.y); ctx2.lineTo(m1.x, m1.y); ctx2.stroke();
          // Horizontal boom & vertical dipole crossbars matching usa_supply_drop_zone.png
          const bL = { x: m1.x - 12, y: m1.y - 6 };
          const bR = { x: m1.x + 12, y: m1.y + 6 };
          ctx2.beginPath(); ctx2.moveTo(bL.x, bL.y); ctx2.lineTo(bR.x, bR.y); ctx2.stroke();
          for (const f of [-0.85, -0.4, 0.0, 0.4, 0.85]) {
            const bx = m1.x + f * 12;
            const by = m1.y + f * 6;
            ctx2.beginPath(); ctx2.moveTo(bx, by - 6); ctx2.lineTo(bx, by + 6); ctx2.stroke();
          }
          ctx2.restore();
        }
      });

      // 4. Twin Tall Steel Floodlight Towers Standing Outside Far-Left (wx = -0.88R, wy = +0.06R) and Far-Right (wx = +0.88R, wy = +0.06R) Corners
      const towers = [
        { ...fromScreen(-0.88 * R, 0.06 * R), tiltX:  1, bias: 20.0 },
        { ...fromScreen( 0.88 * R, 0.06 * R), tiltX: -1, bias: 20.0 }
      ];
      for (const tw of towers) {
        const zTwTop = zPad + 0.66 * R * H;
        // Concrete/steel square base plinth on ground (z = 0..zPad)
        pushShedBox(tw.x - 0.055 * R, tw.x + 0.055 * R, tw.y - 0.055 * R, tw.y + 0.055 * R, 0, zPad + 0.03 * R * H, '#b8b0a4', '#9e968c', '#78716c', tw.bias, 1.0);
        // Vertical cylindrical/I-beam light-grey steel pole
        pushShedBox(tw.x - 0.022 * R, tw.x + 0.022 * R, tw.y - 0.022 * R, tw.y + 0.022 * R, zPad + 0.03 * R * H, zTwTop, '#d6d2c8', '#b8b4aa', '#78716c', tw.bias + 1.0, 1.0);

        // 2x3 Floodlight Bank + Soft Warm Light Halo at Top of Mast
        polys.push({
          depth: shedAnchor + tw.bias + 4.0,
          customDraw(ctx2) {
            ctx2.save();
            const pTop = dzProj.project(tw.x, tw.y, zTwTop + 0.04 * R * H);

            // Soft warm floodlight glow halo behind/around the lamp head (pure-JS canvas safe concentric rgba circles)
            for (const halo of [
              { rad: 24, col: 'rgba(254, 249, 195, 0.14)' },
              { rad: 17, col: 'rgba(254, 249, 195, 0.22)' },
              { rad: 11, col: 'rgba(254, 249, 195, 0.32)' }
            ]) {
              ctx2.fillStyle = halo.col;
              ctx2.beginPath();
              ctx2.arc(pTop.x + tw.tiltX * 4, pTop.y + 2, halo.rad, 0, Math.PI * 2);
              ctx2.fill();
            }

            // Isometric 2x3 Floodlight Rectangular Housing tilted inward toward the pad
            ctx2.save();
            ctx2.translate(pTop.x, pTop.y);
            ctx2.transform(1, tw.tiltX * 0.42, 0, 1, 0, 0);
            const bw = 22, bh = 16;
            // Back depth rim
            ctx2.fillStyle = '#78716c';
            ctx2.strokeStyle = '#1e242b';
            ctx2.lineWidth = 1.1;
            ctx2.beginPath();
            ctx2.rect(-bw * 0.5 - tw.tiltX * 2.5, -bh * 0.5 - 1.5, bw, bh);
            ctx2.fill();
            ctx2.stroke();
            // Front light-grey/tan lamp bezel
            ctx2.fillStyle = '#d6d2c8';
            ctx2.beginPath();
            ctx2.rect(-bw * 0.5, -bh * 0.5, bw, bh);
            ctx2.fill();
            ctx2.stroke();
            // 2x3 grid of warm glowing circular/oval floodlight bulbs
            for (let rIdx = 0; rIdx < 2; rIdx++) {
              for (let cIdx = 0; cIdx < 3; cIdx++) {
                const lx = -bw * 0.5 + 4.2 + cIdx * 6.8;
                const ly = -bh * 0.5 + 4.5 + rIdx * 7.0;
                ctx2.fillStyle = '#fef9c3';
                ctx2.strokeStyle = '#57534e';
                ctx2.lineWidth = 0.85;
                ctx2.beginPath();
                ctx2.arc(lx, ly, 2.5, 0, Math.PI * 2);
                ctx2.fill();
                ctx2.stroke();
              }
            }
            ctx2.restore();
            ctx2.restore();
          }
        });
      }

      // 5. Descending X-Braced Wooden Supply Crate + 10 White Shroud Lines + Ribbed Olive-Drab Parachute Canopy
      const dropBob = Math.sin(t * 1.8) * 0.025 * R * H;
      const crateCenter = fromScreen(-0.02 * R, -0.14 * R);
      const cxCrate = crateCenter.x, cyCrate = crateCenter.y;
      const zCrateB = zPad + 0.14 * R * H + dropBob;
      const zCrateT = zCrateB + 0.25 * R * H;
      const rCr = 0.13 * R;
      const crateAnchor = padTopDepth + 35.0;

      // Soft ground shadow beneath the descending crate
      polys.push({
        depth: padTopDepth + 2.8,
        customDraw(ctx2) {
          ctx2.save();
          const pSh = dzProj.project(cxCrate, cyCrate, zPad);
          ctx2.fillStyle = 'rgba(20, 24, 30, 0.35)';
          ctx2.beginPath();
          ctx2.ellipse(pSh.x, pSh.y, 19, 11, 0, 0, Math.PI * 2);
          ctx2.fill();
          ctx2.restore();
        }
      });

      // Wooden Supply Crate + X-Bracing + 10 Suspension Shroud Lines + Ribbed Hemispherical Olive-Drab Parachute Canopy
      const zCanopyB = zCrateT + 0.48 * R * H;
      const rCanopy = 0.38 * R;
      polys.push({
        depth: crateAnchor + 10.0,
        customDraw(ctx2) {
          ctx2.save();

          // Project 3D crate vertices (aligned with pad axes around cxCrate, cyCrate)
          const c000 = dzProj.project(cxCrate - rCr, cyCrate - rCr, zCrateB);
          const c100 = dzProj.project(cxCrate + rCr, cyCrate - rCr, zCrateB);
          const c110 = dzProj.project(cxCrate + rCr, cyCrate + rCr, zCrateB);
          const c010 = dzProj.project(cxCrate - rCr, cyCrate + rCr, zCrateB);
          const c001 = dzProj.project(cxCrate - rCr, cyCrate - rCr, zCrateT);
          const c101 = dzProj.project(cxCrate + rCr, cyCrate - rCr, zCrateT);
          const c111 = dzProj.project(cxCrate + rCr, cyCrate + rCr, zCrateT);
          const c011 = dzProj.project(cxCrate - rCr, cyCrate + rCr, zCrateT);

          const drawCrateFace = (pts, fillCol, braceCol) => {
            ctx2.beginPath();
            pts.forEach((p0, i) => i === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
            ctx2.closePath();
            ctx2.fillStyle = fillCol;
            ctx2.fill();
            ctx2.strokeStyle = '#1e242b';
            ctx2.lineWidth = 1.15;
            ctx2.stroke();
            // Wooden X-braces + vertical plank lines
            ctx2.strokeStyle = braceCol;
            ctx2.lineWidth = 1.6;
            ctx2.beginPath();
            ctx2.moveTo(pts[0].x, pts[0].y); ctx2.lineTo(pts[2].x, pts[2].y);
            ctx2.moveTo(pts[1].x, pts[1].y); ctx2.lineTo(pts[3].x, pts[3].y);
            ctx2.stroke();
          };

          // Front-Left (+Y), Front-Right (+X), and Top (+Z) wooden crate faces
          drawCrateFace([c010, c110, c111, c011], '#b89466', '#4a3520');
          drawCrateFace([c100, c110, c111, c101], '#9a784c', '#3d2b18');
          drawCrateFace([c001, c101, c111, c011], '#d2b082', '#5c4228');

          // 10 White/Grey Parachute Shroud Lines from Crate Top Center/Corners to Canopy Rim
          const crateTie = dzProj.project(cxCrate, cyCrate, zCrateT - 0.01 * R * H);
          const crateCorners = [c001, c101, c111, c011, crateTie];
          const nGores = 10;
          const rimPts = [];
          for (let i = 0; i < nGores; i++) {
            const a = (i / nGores) * Math.PI * 2;
            const wPt = fromScreen(Math.cos(a) * rCanopy, Math.sin(a) * rCanopy);
            rimPts.push(dzProj.project(cxCrate + wPt.x, cyCrate + wPt.y, zCanopyB));
          }
          for (let i = 0; i < nGores; i++) {
            const cPt = crateCorners[i % 4];
            const rPt = rimPts[i];
            ctx2.strokeStyle = '#1e242b';
            ctx2.lineWidth = 2.1;
            ctx2.beginPath(); ctx2.moveTo(crateTie.x, crateTie.y); ctx2.lineTo(rPt.x, rPt.y); ctx2.stroke();
            ctx2.strokeStyle = '#e2e8f0';
            ctx2.lineWidth = 1.05;
            ctx2.beginPath(); ctx2.moveTo(cPt.x, cPt.y); ctx2.lineTo(rPt.x, rPt.y); ctx2.stroke();
          }

          // Dark-olive interior underside of parachute canopy
          ctx2.beginPath();
          rimPts.forEach((p0, idx) => idx === 0 ? ctx2.moveTo(p0.x, p0.y) : ctx2.lineTo(p0.x, p0.y));
          ctx2.closePath();
          ctx2.fillStyle = '#3a3f31';
          ctx2.fill();
          ctx2.strokeStyle = '#1e242b';
          ctx2.lineWidth = 1.2;
          ctx2.stroke();

          // Ribbed Hemispherical Olive-Drab Parachute Canopy Dome (4 latitude rings x 10 gores + top vent cap)
          const latRings = 4;
          for (let lat = 0; lat < latRings; lat++) {
            const p0 = (lat / latRings) * (Math.PI * 0.5);
            const p1 = ((lat + 1) / latRings) * (Math.PI * 0.5);
            const r0 = Math.cos(p0) * rCanopy, z0C = zCanopyB + Math.sin(p0) * rCanopy * 0.80 * H;
            const r1 = Math.cos(p1) * rCanopy, z1C = zCanopyB + Math.sin(p1) * rCanopy * 0.80 * H;
            for (let i = 0; i < nGores; i++) {
              const a0 = (i / nGores) * Math.PI * 2;
              const a1 = ((i + 1) / nGores) * Math.PI * 2;
              const w00 = fromScreen(Math.cos(a0) * r0, Math.sin(a0) * r0);
              const w10 = fromScreen(Math.cos(a1) * r0, Math.sin(a1) * r0);
              const w11 = fromScreen(Math.cos(a1) * r1, Math.sin(a1) * r1);
              const w01 = fromScreen(Math.cos(a0) * r1, Math.sin(a0) * r1);
              const q = [
                dzProj.project(cxCrate + w00.x, cyCrate + w00.y, z0C),
                dzProj.project(cxCrate + w10.x, cyCrate + w10.y, z0C),
                dzProj.project(cxCrate + w11.x, cyCrate + w11.y, z1C),
                dzProj.project(cxCrate + w01.x, cyCrate + w01.y, z1C)
              ];
              const am = (a0 + a1) * 0.5;
              const col = Math.cos(am + 0.8) > 0.2 ? '#848c6a' : (Math.cos(am + 0.8) > -0.35 ? '#6d7456' : '#535940');
              ctx2.beginPath();
              q.forEach((pt, idx) => idx === 0 ? ctx2.moveTo(pt.x, pt.y) : ctx2.lineTo(pt.x, pt.y));
              ctx2.closePath();
              ctx2.fillStyle = col;
              ctx2.fill();
              ctx2.strokeStyle = '#262b20';
              ctx2.lineWidth = 0.95;
              ctx2.stroke();
            }
          }
          // Apex circular parachute vent cap
          const pApex = dzProj.project(cxCrate, cyCrate, zCanopyB + rCanopy * 0.80 * H);
          ctx2.fillStyle = '#848c6a';
          ctx2.strokeStyle = '#1e242b';
          ctx2.lineWidth = 1.1;
          ctx2.beginPath();
          ctx2.ellipse(pApex.x, pApex.y, 7.5, 4.8, 0, 0, Math.PI * 2);
          ctx2.fill();
          ctx2.stroke();

          ctx2.restore();
        }
      });

      flushFaces(ctx, faces);
      return;
    }

    if (defId === 'USA_PATRIOT' || defId === 'USA_FIREBASE') {
      // High-Fidelity Ligne-Claire 3D Model matching usa_patriot.png:
      // 1. Sloped Octagonal Reinforced Concrete Bunker Emplacement with vertical panel seams
      // 2. Continuous Yellow-and-Black Diagonal Hazard Stripe Collar around the upper rim of all octagonal faces
      // 3. Front-Left (+Y) Protruding Framed Steel Blast Door with Cyan Window & Hazard Threshold + Front-Right (+X) Protruding Cyan Sensor Box with Hazard Threshold
      // 4. Stacked Tan Sandbag Revetment Walls curving around the base corners (Left, Front-Bottom, Right)
      // 5. Sunken Circular Turret Well & Rotating Tan/Steel Pedestal with twin front hydraulic elevation pistons
      // 6. Elevated 4-Tube Twin-Pod Rectangular Desert-Tan MIM-104 Patriot Missile Canister + High Rear-Right Square Cyan Phased-Array Radar Screen
      const ptAngle = 0.75;
      const ptProj = createProjector(ptAngle, pitchScale, zScale);
      const R = r * 1.25 * SS;
      const polys = faces;
      const cosPT = Math.cos(ptAngle), sinPT = Math.sin(ptAngle);
      const fromScreen = (wx, wy) => ({
        x: wx * cosPT + wy * sinPT,
        y: -wx * sinPT + wy * cosPT
      });

      const zBunk = 0.34 * R * H;
      const zHazB = zBunk - 0.08 * R * H;
      const rB = 0.78 * R, rHaz = 0.67 * R, rT = 0.64 * R;
      const bunkRoofDepth = ptProj.project(0, 0, zBunk).depth;

      const pushAnchoredQuad = (pts3d, fill, stroke = '#1e242b', lineWidth = 1.0, offset = 0) => {
        const projPts = pts3d.map(pt => ptProj.project(pt.x, pt.y, pt.z));
        polys.push({ pts: projPts, depth: bunkRoofDepth + offset, fill, stroke, lineWidth });
      };

      // 1. Sloped Octagonal Concrete Bunker Emplacement (z: 0..zBunk)
      const nOct = 8;
      const topPts = [];

      for (let i = 0; i < nOct; i++) {
        const a0 = (i / nOct) * Math.PI * 2 + Math.PI / 8;
        const a1 = ((i + 1) / nOct) * Math.PI * 2 + Math.PI / 8;
        const p0B = { ...fromScreen(Math.cos(a0) * rB,   Math.sin(a0) * rB),   z: 0 };
        const p1B = { ...fromScreen(Math.cos(a1) * rB,   Math.sin(a1) * rB),   z: 0 };
        const p1H = { ...fromScreen(Math.cos(a1) * rHaz, Math.sin(a1) * rHaz), z: zHazB };
        const p0H = { ...fromScreen(Math.cos(a0) * rHaz, Math.sin(a0) * rHaz), z: zHazB };
        const p1T = { ...fromScreen(Math.cos(a1) * rT,   Math.sin(a1) * rT),   z: zBunk };
        const p0T = { ...fromScreen(Math.cos(a0) * rT,   Math.sin(a0) * rT),   z: zBunk };
        topPts.push(p0T);

        const am = (a0 + a1) * 0.5;
        const faceOrder = Math.sin(am) * 4.0;
        const col = Math.sin(am) > 0.15 ? (Math.cos(am) < 0 ? '#c8c2b8' : '#b2aba0') : '#969086';
        // Lower sloped concrete wall face
        pushAnchoredQuad([p0B, p1B, p1H, p0H], col, '#1e242b', 1.15, -10.0 + faceOrder);
        // Upper yellow hazard collar band
        pushAnchoredQuad([p0H, p1H, p1T, p0T], '#eab308', '#1e242b', 1.05, -9.2 + faceOrder);

        // Diagonal black hazard stripes along each visible face of the upper collar
        if (Math.sin(am) > -0.25) {
          const nStripes = 4;
          for (let s = 0; s < nStripes; s++) {
            const u0 = (s + 0.15) / nStripes;
            const u1 = (s + 0.55) / nStripes;
            const lerp = (A, B, f) => ({ x: A.x + (B.x - A.x) * f, y: A.y + (B.y - A.y) * f, z: A.z + (B.z - A.z) * f });
            pushAnchoredQuad([
              lerp(p0H, p1H, u0),
              lerp(p0H, p1H, u1),
              lerp(p0T, p1T, Math.min(1, u1 + 0.08)),
              lerp(p0T, p1T, Math.min(1, u0 + 0.08))
            ], '#1e242b', null, 0, -8.8 + faceOrder);
          }
        }
      }

      // Bunker Roof Deck
      const projTop = topPts.map(pt => ptProj.project(pt.x, pt.y, pt.z));
      polys.push({ pts: projTop, depth: bunkRoofDepth, fill: '#b8b2a8', stroke: '#1e242b', lineWidth: 1.15 });

      // 2. Sunken Turret Well, Raised Octagonal Parapet Lip, Front-Left Framed Blast Door, Front-Right Protruding Cyan Sensor Box & Sandbag Revetment Walls
      polys.push({
        depth: bunkRoofDepth + 4.0,
        customDraw(ctx2) {
          ctx2.save();

          // Inner octagonal parapet lip & sunken flat roof deck inside the octagon
          ctx2.beginPath();
          for (let i = 0; i <= nOct; i++) {
            const a = (i / nOct) * Math.PI * 2 + Math.PI / 8;
            const w = fromScreen(Math.cos(a) * 0.56 * R, Math.sin(a) * 0.56 * R);
            const p = ptProj.project(w.x, w.y, zBunk - 0.03 * R * H);
            if (i === 0) ctx2.moveTo(p.x, p.y);
            else ctx2.lineTo(p.x, p.y);
          }
          ctx2.closePath();
          ctx2.fillStyle = '#9e968c';
          ctx2.fill();
          ctx2.strokeStyle = '#1e242b';
          ctx2.lineWidth = 1.1;
          ctx2.stroke();

          // Circular rotating steel turntable base plate on bunker deck
          for (const ring of [
            { rad: 0.36 * R, z: zBunk - 0.02 * R * H, fill: '#948b78' },
            { rad: 0.31 * R, z: zBunk + 0.01 * R * H, fill: '#b5a892' }
          ]) {
            ctx2.beginPath();
            for (let i = 0; i <= 24; i++) {
              const a = (i / 24) * Math.PI * 2;
              const p = ptProj.project(Math.cos(a) * ring.rad, Math.sin(a) * ring.rad, ring.z);
              if (i === 0) ctx2.moveTo(p.x, p.y);
              else ctx2.lineTo(p.x, p.y);
            }
            ctx2.closePath();
            ctx2.fillStyle = ring.fill;
            ctx2.fill();
            ctx2.strokeStyle = '#1e242b';
            ctx2.lineWidth = 1.1;
            ctx2.stroke();
          }

          // Helper to project points on or protruding from an octagonal wall face (aA..aB)
          const facePt = (aA, aB, u, v, outDist = 0) => {
            const z = v * zHazB;
            const aM = 0.5 * (aA + aB);
            const pA = fromScreen(Math.cos(aA) * ((1 - v) * rB + v * rHaz) + Math.cos(aM) * outDist, Math.sin(aA) * ((1 - v) * rB + v * rHaz) + Math.sin(aM) * outDist);
            const pB = fromScreen(Math.cos(aB) * ((1 - v) * rB + v * rHaz) + Math.cos(aM) * outDist, Math.sin(aB) * ((1 - v) * rB + v * rHaz) + Math.sin(aM) * outDist);
            return ptProj.project(pA.x + (pB.x - pA.x) * u, pA.y + (pB.y - pA.y) * u, z);
          };

          const drawPoly = (pts, fill, lw = 1.05) => {
            ctx2.beginPath();
            pts.forEach((p, idx) => idx === 0 ? ctx2.moveTo(p.x, p.y) : ctx2.lineTo(p.x, p.y));
            ctx2.closePath();
            ctx2.fillStyle = fill;
            ctx2.fill();
            ctx2.strokeStyle = '#1e242b';
            ctx2.lineWidth = lw;
            ctx2.stroke();
          };

          // Front-Left (face i=2: a ∈ [5pi/8, 7pi/8]) Protruding Concrete Blast Door Frame + Recessed Steel Door + Cyan Viewport + Yellow/Black Hazard Threshold
          const aFL0 = 5 * Math.PI / 8, aFL1 = 7 * Math.PI / 8;
          drawPoly([facePt(aFL0, aFL1, 0.16, 0.0, 0.04 * R), facePt(aFL0, aFL1, 0.84, 0.0, 0.04 * R), facePt(aFL0, aFL1, 0.82, 0.90, 0.04 * R), facePt(aFL0, aFL1, 0.18, 0.90, 0.04 * R)], '#c8c2b8', 1.1);
          drawPoly([facePt(aFL0, aFL1, 0.28, 0.10, 0.02 * R), facePt(aFL0, aFL1, 0.72, 0.10, 0.02 * R), facePt(aFL0, aFL1, 0.70, 0.76, 0.02 * R), facePt(aFL0, aFL1, 0.30, 0.76, 0.02 * R)], '#64748b', 1.0);
          drawPoly([facePt(aFL0, aFL1, 0.38, 0.48, 0.025 * R), facePt(aFL0, aFL1, 0.62, 0.48, 0.025 * R), facePt(aFL0, aFL1, 0.61, 0.64, 0.025 * R), facePt(aFL0, aFL1, 0.39, 0.64, 0.025 * R)], '#67e8f9', 0.85);
          drawPoly([facePt(aFL0, aFL1, 0.14, 0.0, 0.07 * R), facePt(aFL0, aFL1, 0.86, 0.0, 0.07 * R), facePt(aFL0, aFL1, 0.84, 0.16, 0.04 * R), facePt(aFL0, aFL1, 0.16, 0.16, 0.04 * R)], '#eab308', 1.0);

          // Front-Right (face i=0: a ∈ [pi/8, 3pi/8]) Protruding Bunker Sensor Box + Glowing Cyan Slit + Yellow/Black Hazard Step
          const aFR0 = 1 * Math.PI / 8, aFR1 = 3 * Math.PI / 8;
          drawPoly([facePt(aFR0, aFR1, 0.22, 0.56, 0.01 * R), facePt(aFR0, aFR1, 0.78, 0.56, 0.01 * R), facePt(aFR0, aFR1, 0.76, 0.84, 0.01 * R), facePt(aFR0, aFR1, 0.24, 0.84, 0.01 * R)], '#38bdf8', 1.0);
          drawPoly([facePt(aFR0, aFR1, 0.18, 0.14, 0.08 * R), facePt(aFR0, aFR1, 0.82, 0.14, 0.08 * R), facePt(aFR0, aFR1, 0.80, 0.54, 0.08 * R), facePt(aFR0, aFR1, 0.20, 0.54, 0.08 * R)], '#b2aba0', 1.05);
          drawPoly([facePt(aFR0, aFR1, 0.20, 0.54, 0.08 * R), facePt(aFR0, aFR1, 0.80, 0.54, 0.08 * R), facePt(aFR0, aFR1, 0.78, 0.56, 0.01 * R), facePt(aFR0, aFR1, 0.22, 0.56, 0.01 * R)], '#d6d0c4', 1.0);
          drawPoly([facePt(aFR0, aFR1, 0.16, 0.0, 0.09 * R), facePt(aFR0, aFR1, 0.84, 0.0, 0.09 * R), facePt(aFR0, aFR1, 0.82, 0.16, 0.08 * R), facePt(aFR0, aFR1, 0.18, 0.16, 0.08 * R)], '#eab308', 1.0);

          // Stacked Tan Sandbag Revetment Walls around the Left, Front-Bottom, and Right base corners (matching usa_patriot.png!)
          const drawSandbagCluster = (wxC, wyC, tangAngle, rows = 3, cols = 4) => {
            for (let row = 0; row < rows; row++) {
              const rowCols = cols - (row === rows - 1 ? 1 : 0);
              for (let col = 0; col < rowCols; col++) {
                const offset = (col - (rowCols - 1) * 0.5) * 0.115 * R;
                const wx = wxC + Math.cos(tangAngle) * offset;
                const wy = wyC + Math.sin(tangAngle) * offset;
                const wPt = fromScreen(wx, wy);
                const p = ptProj.project(wPt.x, wPt.y, (row + 0.45) * 0.048 * R * H);
                ctx2.fillStyle = row === rows - 1 ? '#cbb68e' : (row === 1 ? '#b8a27a' : '#9e8862');
                ctx2.strokeStyle = '#2b241f';
                ctx2.lineWidth = 1.05;
                ctx2.beginPath();
                ctx2.ellipse(p.x, p.y, 9.2, 4.8, Math.sin(tangAngle) * 0.25, 0, Math.PI * 2);
                ctx2.fill();
                ctx2.stroke();
              }
            }
          };
          drawSandbagCluster(-0.76 * R,  0.06 * R,  1.35, 4, 3); // Left corner sandbag wall
          drawSandbagCluster(-0.02 * R,  0.76 * R,  0.02, 3, 4); // Front-bottom corner sandbag wall
          drawSandbagCluster( 0.76 * R,  0.06 * R, -1.35, 4, 3); // Right corner sandbag wall

          ctx2.restore();
        }
      });

      // 3. Central Rotating Turret Pedestal + Twin Front Hydraulic Pistons + 5-Bay Pitched Patriot Canister + High Rear-Right Cyan Radar Screen
      const yawDelta = (u.turretAngle !== undefined ? (u.turretAngle - baseAngle) : 0);
      const podAngle = ptAngle + yawDelta;
      const podProj = createProjector(podAngle, pitchScale, zScale);
      const cosP = Math.cos(podAngle), sinP = Math.sin(podAngle);
      const fromPodScreen = (wx, wy) => ({
        x: wx * cosP + wy * sinP,
        y: -wx * sinP + wy * cosP
      });

      polys.push({
        depth: bunkRoofDepth + 18.0,
        customDraw(ctx2) {
          ctx2.save();

          const projPod = (wx, wy, z) => {
            const w = fromPodScreen(wx, wy);
            return podProj.project(w.x, w.y, z);
          };

          const drawPodPoly = (pts2d, fill, stroke = '#1e242b', lw = 1.1) => {
            ctx2.beginPath();
            pts2d.forEach((p, idx) => idx === 0 ? ctx2.moveTo(p.x, p.y) : ctx2.lineTo(p.x, p.y));
            ctx2.closePath();
            ctx2.fillStyle = fill;
            ctx2.fill();
            if (stroke) {
              ctx2.strokeStyle = stroke;
              ctx2.lineWidth = lw;
              ctx2.stroke();
            }
          };

          // A) Rotating Rectangular Tan-and-Steel Turret Pedestal Block inside Turret Ring (matching usa_patriot.png!)
          const zPedB = zBunk + 0.01 * R * H;
          const zPedT = zBunk + 0.13 * R * H;
          const pedPts = (z) => [
            projPod(-0.20 * R, -0.02 * R, z),
            projPod( 0.04 * R, -0.14 * R, z),
            projPod( 0.22 * R,  0.02 * R, z),
            projPod(-0.02 * R,  0.16 * R, z)
          ];
          const pB = pedPts(zPedB), pT = pedPts(zPedT);
          drawPodPoly([pB[0], pB[3], pT[3], pT[0]], '#a89678');
          drawPodPoly([pB[3], pB[2], pT[2], pT[3]], '#8c7b60');
          drawPodPoly(pT, '#cbb99a');

          // Central darker pivot block under canister middle
          const pvB = [projPod(-0.08 * R, -0.02 * R, zPedT), projPod(0.08 * R, -0.09 * R, zPedT), projPod(0.14 * R, 0.01 * R, zPedT), projPod(-0.02 * R, 0.08 * R, zPedT)];
          const pvT = [projPod(-0.08 * R, -0.02 * R, zBunk + 0.30 * R * H), projPod(0.08 * R, -0.09 * R, zBunk + 0.30 * R * H), projPod(0.14 * R, 0.01 * R, zBunk + 0.30 * R * H), projPod(-0.02 * R, 0.08 * R, zBunk + 0.30 * R * H)];
          drawPodPoly([pvB[0], pvB[3], pvT[3], pvT[0]], '#786b54');
          drawPodPoly([pvB[3], pvB[2], pvT[2], pvT[3]], '#635844');

          // B) Twin Prominent Angled Hydraulic Elevation Pistons (left-front & right-front of turntable up to underside of canister, matching usa_patriot.png!)
          for (const hyd of [
            { bx: -0.15 * R, by: 0.02 * R, tx: -0.22 * R, ty: -0.02 * R, tz: 0.44 },
            { bx:  0.01 * R, by: 0.11 * R, tx: -0.03 * R, ty:  0.07 * R, tz: 0.35 }
          ]) {
            const hBase = projPod(hyd.bx, hyd.by, zPedT);
            const hMid  = projPod((hyd.bx + hyd.tx) * 0.5, (hyd.by + hyd.ty) * 0.5, zBunk + (hyd.tz * 0.5 + 0.06) * R * H);
            const hTop  = projPod(hyd.tx, hyd.ty, zBunk + hyd.tz * R * H);
            // Outer lower cylinder sleeve
            ctx2.strokeStyle = '#1e242b';
            ctx2.lineWidth = 6.2;
            ctx2.lineCap = 'round';
            ctx2.beginPath(); ctx2.moveTo(hBase.x, hBase.y); ctx2.lineTo(hMid.x, hMid.y); ctx2.stroke();
            ctx2.strokeStyle = '#78716c';
            ctx2.lineWidth = 3.8;
            ctx2.beginPath(); ctx2.moveTo(hBase.x, hBase.y); ctx2.lineTo(hMid.x, hMid.y); ctx2.stroke();
            // Inner upper chrome piston rod
            ctx2.strokeStyle = '#1e242b';
            ctx2.lineWidth = 4.6;
            ctx2.beginPath(); ctx2.moveTo(hMid.x, hMid.y); ctx2.lineTo(hTop.x, hTop.y); ctx2.stroke();
            ctx2.strokeStyle = '#cbd5e1';
            ctx2.lineWidth = 2.4;
            ctx2.beginPath(); ctx2.moveTo(hMid.x, hMid.y); ctx2.lineTo(hTop.x, hTop.y); ctx2.stroke();
          }

          // C) Elevated High Rear-Right Square Phased-Array Radar Panel with Glowing Cyan Grid Face (stands ABOVE the canister!)
          // Articulated tan support neck & brackets behind radar
          const mB = projPod(0.08 * R, -0.10 * R, zBunk + 0.46 * R * H);
          const mT = projPod(0.08 * R, -0.14 * R, zBunk + 0.72 * R * H);
          ctx2.strokeStyle = '#1e242b';
          ctx2.lineWidth = 9.0;
          ctx2.beginPath(); ctx2.moveTo(mB.x, mB.y); ctx2.lineTo(mT.x, mT.y); ctx2.stroke();
          ctx2.strokeStyle = '#cbb99a';
          ctx2.lineWidth = 5.8;
          ctx2.beginPath(); ctx2.moveTo(mB.x, mB.y); ctx2.lineTo(mT.x, mT.y); ctx2.stroke();

          // Radar 3D Box tilted toward front-left (centered at wx = +0.06R, wy = -0.18R, z = zBunk + 0.88R)
          const radPt = (u, v, w) => {
            const wx = (0.06 * R + u * 0.14 * R * TS - w * 0.04 * R);
            const wy = (-0.18 * R + u * 0.07 * R * TS + w * 0.04 * R);
            const z  = zBunk + (0.87 + (v - u * 0.22) * 0.19 * TS + w * 0.02) * R * H;
            return projPod(wx, wy, z);
          };
          const rB00 = radPt(-1, -1, -1), rB10 = radPt(1, -1, -1), rB11 = radPt(1, 1, -1), rB01 = radPt(-1, 1, -1);
          const rF00 = radPt(-1, -1,  1), rF10 = radPt(1, -1,  1), rF11 = radPt(1, 1,  1), rF01 = radPt(-1, 1,  1);
          drawPodPoly([rB01, rB11, rF11, rF01], '#dfd2b8');
          drawPodPoly([rB10, rB11, rF11, rF10], '#a8987c');
          drawPodPoly([rF00, rF10, rF11, rF01], '#cbb99a', '#1e242b', 1.2);
          // Glowing Cyan Phased-Array Radar Grid Screen
          drawPodPoly([radPt(-0.80, -0.80, 1.05), radPt(0.80, -0.80, 1.05), radPt(0.80, 0.80, 1.05), radPt(-0.80, 0.80, 1.05)], '#22d3ee', '#1e242b', 1.05);
          // Inner bright cyan center highlight + fine 5x5 grid lines on cyan radar face
          drawPodPoly([radPt(-0.48, -0.48, 1.055), radPt(0.48, -0.48, 1.055), radPt(0.48, 0.48, 1.055), radPt(-0.48, 0.48, 1.055)], '#67e8f9', null, 0);
          ctx2.strokeStyle = '#0891b2';
          ctx2.lineWidth = 0.85;
          for (const g of [-0.48, -0.16, 0.16, 0.48]) {
            const h0 = radPt(-0.78, g, 1.06), h1 = radPt(0.78, g, 1.06);
            const v0 = radPt(g, -0.78, 1.06), v1 = radPt(g, 0.78, 1.06);
            ctx2.beginPath();
            ctx2.moveTo(h0.x, h0.y); ctx2.lineTo(h1.x, h1.y);
            ctx2.moveTo(v0.x, v0.y); ctx2.lineTo(v1.x, v1.y);
            ctx2.stroke();
          }

          // D) Elevated Pitched 5-Bay MIM-104 Patriot Missile Canister Beam (matching usa_patriot.png 1:1!)
          // Look at usa_patriot.png:
          // s ∈ [-1, +1] runs from Top-Left Muzzle (s = -1: wx = -0.44R, wy = -0.14R, z = 0.64R) down-right to Rear Breech (s = +1: wx = +0.34R, wy = +0.12R, z = 0.36R)
          // v ∈ [-1, +1] is vertical height across the 2 stacked rows of tubes
          // w ∈ [0, +1] is 3D depth toward Back-Right (for the sunlit top roof strip and shaded right end face)
          const canBeamPt = (s, v, w = 0) => {
            const rec = recoil * 0.35;
            const wx = (-0.05 * R + s * 0.39 * R * BL + rec) + v * 0.055 * R * TS + w * 0.11 * R * TS;
            const wy = (-0.01 * R + s * 0.13 * R * BL)       - v * 0.035 * R * TS - w * 0.09 * R * TS;
            const z  = zBunk + (0.50 - s * 0.14 * BL + v * 0.135 * TS + w * 0.03 * TS) * R * H;
            return projPod(wx, wy, z);
          };

          // 1) Top Roof Strip of the Canister (w ∈ [0, 1] at v = +1)
          drawPodPoly([canBeamPt(-1, 1, 0), canBeamPt(1, 1, 0), canBeamPt(1, 1, 1), canBeamPt(-1, 1, 1)], '#dfd2b8', '#1e242b', 1.1);
          // 2) Right Rear End Face of the Canister (s = +1, v ∈ [-1, 1], w ∈ [0, 1])
          drawPodPoly([canBeamPt(1, -1, 0), canBeamPt(1, -1, 1), canBeamPt(1, 1, 1), canBeamPt(1, 1, 0)], '#8c7b60', '#1e242b', 1.1);
          // 3) Main Front-Facing Side Wall of the Canister (w = 0, s ∈ [-1, 1], v ∈ [-1, 1])
          drawPodPoly([canBeamPt(-1, -1, 0), canBeamPt(1, -1, 0), canBeamPt(1, 1, 0), canBeamPt(-1, 1, 0)], '#c8b696', '#1e242b', 1.2);

          // Horizontal split seam between upper row (v > 0) and lower row (v < 0) across front & right end faces
          const hSeam0 = canBeamPt(-1, 0, 0), hSeam1 = canBeamPt(1, 0, 0), hSeam2 = canBeamPt(1, 0, 1);
          ctx2.strokeStyle = '#1e242b';
          ctx2.lineWidth = 1.6;
          ctx2.beginPath();
          ctx2.moveTo(hSeam0.x, hSeam0.y); ctx2.lineTo(hSeam1.x, hSeam1.y); ctx2.lineTo(hSeam2.x, hSeam2.y);
          ctx2.stroke();

          // Vertical bay dividers along s ∈ [-1, +1] matching the 5 bays in usa_patriot.png:
          // Bay 1: s ∈ [-1.00, -0.60] (Left column of 2 circular missile tubes)
          // Bay 2: s ∈ [-0.60, -0.20] (Second column of 2 circular missile tubes)
          // Bay 3: s ∈ [-0.20, +0.08] (Front structural rib collar with 2 diagonal-striped square hatches)
          // Bay 4: s ∈ [+0.08, +0.72] (Long rectangular smooth tan canister body panels)
          // Bay 5: s ∈ [+0.72, +1.00] (Rear structural rib collar with 2 diagonal-striped square hatches)
          for (const sDiv of [-0.60, -0.20, 0.08, 0.72]) {
            const dB = canBeamPt(sDiv, -1, 0);
            const dT = canBeamPt(sDiv,  1, 0);
            const dR = canBeamPt(sDiv,  1, 1);
            ctx2.strokeStyle = '#1e242b';
            ctx2.lineWidth = 1.35;
            ctx2.beginPath();
            ctx2.moveTo(dB.x, dB.y); ctx2.lineTo(dT.x, dT.y); ctx2.lineTo(dR.x, dR.y);
            ctx2.stroke();
          }

          // Bays 1 & 2 (s = -0.80 and s = -0.40): 2x2 Recessed Square Cells with Large Dark Circular Missile Launch Tubes!
          for (const sTube of [-0.80, -0.40]) {
            for (const vTube of [-0.50, 0.50]) {
              const cellPts = [
                canBeamPt(sTube - 0.16, vTube - 0.39, 0),
                canBeamPt(sTube + 0.16, vTube - 0.39, 0),
                canBeamPt(sTube + 0.16, vTube + 0.39, 0),
                canBeamPt(sTube - 0.16, vTube + 0.39, 0)
              ];
              drawPodPoly(cellPts, '#a89678', '#1e242b', 0.95);
              // Dark circular missile tube opening inside cell
              const cp = canBeamPt(sTube, vTube, 0);
              ctx2.fillStyle = '#3a352f';
              ctx2.strokeStyle = '#1e242b';
              ctx2.lineWidth = 1.2;
              ctx2.beginPath();
              ctx2.ellipse(cp.x, cp.y, 5.6 * TS, 6.4 * TS, 0.15, 0, Math.PI * 2);
              ctx2.fill();
              ctx2.stroke();
              // Inner dark warhead ring
              ctx2.fillStyle = '#575047';
              ctx2.beginPath();
              ctx2.ellipse(cp.x + 0.8, cp.y + 0.5, 3.0 * TS, 3.5 * TS, 0.15, 0, Math.PI * 2);
              ctx2.fill();
            }
          }

          // Bays 3 & 5 (s = -0.06 and s = +0.86): Recessed Square Hatches with Diagonal Stripes (matching usa_patriot.png!)
          for (const sHatch of [-0.06, 0.86]) {
            for (const vHatch of [-0.50, 0.50]) {
              const hPts = [
                canBeamPt(sHatch - 0.09, vHatch - 0.34, 0),
                canBeamPt(sHatch + 0.09, vHatch - 0.34, 0),
                canBeamPt(sHatch + 0.09, vHatch + 0.34, 0),
                canBeamPt(sHatch - 0.09, vHatch + 0.34, 0)
              ];
              drawPodPoly(hPts, '#b5a282', '#1e242b', 0.95);
              // Two diagonal louver lines inside each square hatch
              ctx2.strokeStyle = '#1e242b';
              ctx2.lineWidth = 0.9;
              ctx2.beginPath();
              ctx2.moveTo(hPts[0].x, hPts[0].y); ctx2.lineTo(hPts[2].x, hPts[2].y);
              ctx2.stroke();
            }
          }

          // Bay 4 (s ∈ [+0.08, +0.72]): Subtle sunlit bevel along upper half of each long rectangular body panel
          for (const vPanel of [-0.50, 0.50]) {
            const pStrip = [
              canBeamPt(0.11, vPanel + 0.12, 0),
              canBeamPt(0.69, vPanel + 0.12, 0),
              canBeamPt(0.69, vPanel + 0.42, 0),
              canBeamPt(0.11, vPanel + 0.42, 0)
            ];
            drawPodPoly(pStrip, '#dfd0b4', null, 0);
          }

          ctx2.restore();
        }
      });

      flushFaces(ctx, faces);
      return;
    }

    if (defId === 'USA_PARTICLE_CANNON') {
      // Sprite Sheet Match (usa_particle_cannon.png):
      // 1. Circular sunken concrete containment ring & deep accelerator pit with glowing cyan inner ring & vertical plasma slots
      // 2. 4 Radial diagonal semi-cylindrical glowing cyan plasma capacitor pods on exterior concrete cradles + pairs of curved dark ribbed power conduits
      // 3. Central tiered cylindrical particle emitter tower with glowing cyan equatorial ring & vertical cooling slots
      // 4. 4 Tall open reflective mirror petals (light-grey armored backs, glowing cyan inner faces) framing a blazing cyan-white vertical particle beam with electric arcs
      const pcAngle = baseAngle;
      const pcProj = createProjector(pcAngle, pitchScale, zScale);
      const R = r * SS;
      const cosA = Math.cos(pcAngle), sinA = Math.sin(pcAngle);
      const fromScreen = (wx, wy) => ({
        x: wx * cosA + wy * sinA,
        y: -wx * sinA + wy * cosA
      });

      const polys = [];
      const pushPoly = (pts3d, fill, stroke = '#1e242b', lw = 1.0, bias = 0) => {
        const projPts = pts3d.map(pt => pcProj.project(pt.x, pt.y, pt.z));
        let depth = 0;
        for (const pt of projPts) depth += pt.depth;
        depth = depth / projPts.length + bias;
        polys.push({ pts: projPts, depth, fill, stroke, lineWidth: lw });
      };

      const zPitFloor = 0.04 * R * H;
      const zRing = 0.24 * R * H;
      const rOuterB = 0.86 * R;
      const rOuterT = 0.74 * R;
      const rPit = 0.60 * R;
      const pitCenterDepth = pcProj.project(0, 0, zPitFloor).depth;
      const ringTopDepth = pcProj.project(0, 0, zRing).depth;

      // 1. Sunken Pit Floor + Inner Pit Wall (with glowing cyan accelerator ring) + Outer Sloped Concrete Containment Ring
      polys.push({
        depth: pitCenterDepth - 25.0,
        customDraw(ctx2) {
          ctx2.save();

          // Dark ground shadow skirt under containment ring
          ctx2.beginPath();
          for (let i = 0; i <= 32; i++) {
            const a = (i / 32) * Math.PI * 2;
            const p = pcProj.project(Math.cos(a) * (rOuterB + 0.03 * R), Math.sin(a) * (rOuterB + 0.03 * R), 0);
            if (i === 0) ctx2.moveTo(p.x, p.y);
            else ctx2.lineTo(p.x, p.y);
          }
          ctx2.closePath();
          ctx2.fillStyle = '#262b33';
          ctx2.fill();
          ctx2.strokeStyle = '#1e242b';
          ctx2.lineWidth = 1.25;
          ctx2.stroke();

          // Sunken Circular Accelerator Pit Floor (z = zPitFloor)
          ctx2.beginPath();
          for (let i = 0; i <= 32; i++) {
            const a = (i / 32) * Math.PI * 2;
            const p = pcProj.project(Math.cos(a) * rPit, Math.sin(a) * rPit, zPitFloor);
            if (i === 0) ctx2.moveTo(p.x, p.y);
            else ctx2.lineTo(p.x, p.y);
          }
          ctx2.closePath();
          ctx2.fillStyle = '#1e242b';
          ctx2.fill();

          // Concentric pit floor rings & radial structural ribs inside the pit
          for (const rf of [0.52 * R, 0.42 * R]) {
            ctx2.beginPath();
            for (let i = 0; i <= 32; i++) {
              const a = (i / 32) * Math.PI * 2;
              const p = pcProj.project(Math.cos(a) * rf, Math.sin(a) * rf, zPitFloor);
              if (i === 0) ctx2.moveTo(p.x, p.y);
              else ctx2.lineTo(p.x, p.y);
            }
            ctx2.closePath();
            ctx2.strokeStyle = '#334155';
            ctx2.lineWidth = 1.0;
            ctx2.stroke();
          }
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            const p0 = pcProj.project(Math.cos(a) * 0.34 * R, Math.sin(a) * 0.34 * R, zPitFloor);
            const p1 = pcProj.project(Math.cos(a) * rPit, Math.sin(a) * rPit, zPitFloor);
            ctx2.strokeStyle = '#334155';
            ctx2.lineWidth = 0.9;
            ctx2.beginPath(); ctx2.moveTo(p0.x, p0.y); ctx2.lineTo(p1.x, p1.y); ctx2.stroke();
          }

          // Inner Vertical Pit Wall (visible along the back half wy < 0, plus full 360 rim) with glowing cyan accelerator band & vertical cyan energy slots
          const N = 24;
          for (let i = 0; i < N; i++) {
            const a0 = (i / N) * Math.PI * 2;
            const a1 = ((i + 1) / N) * Math.PI * 2;
            const aMid = 0.5 * (a0 + a1);
            if (Math.sin(aMid) < 0.35) {
              const w0 = fromScreen(Math.cos(a0) * rPit, Math.sin(a0) * rPit);
              const w1 = fromScreen(Math.cos(a1) * rPit, Math.sin(a1) * rPit);
              const b0 = pcProj.project(w0.x, w0.y, zPitFloor);
              const b1 = pcProj.project(w1.x, w1.y, zPitFloor);
              const t1 = pcProj.project(w1.x, w1.y, zRing);
              const t0 = pcProj.project(w0.x, w0.y, zRing);
              ctx2.beginPath();
              ctx2.moveTo(b0.x, b0.y); ctx2.lineTo(b1.x, b1.y); ctx2.lineTo(t1.x, t1.y); ctx2.lineTo(t0.x, t0.y);
              ctx2.closePath();
              ctx2.fillStyle = Math.cos(aMid) < 0 ? '#64748b' : '#475569';
              ctx2.fill();
              ctx2.strokeStyle = '#1e242b';
              ctx2.lineWidth = 0.9;
              ctx2.stroke();

              // Glowing cyan horizontal accelerator channel midway up inner pit wall
              const c0B = pcProj.project(w0.x, w0.y, zPitFloor + 0.07 * R * H);
              const c1B = pcProj.project(w1.x, w1.y, zPitFloor + 0.07 * R * H);
              const c1T = pcProj.project(w1.x, w1.y, zPitFloor + 0.13 * R * H);
              const c0T = pcProj.project(w0.x, w0.y, zPitFloor + 0.13 * R * H);
              ctx2.beginPath();
              ctx2.moveTo(c0B.x, c0B.y); ctx2.lineTo(c1B.x, c1B.y); ctx2.lineTo(c1T.x, c1T.y); ctx2.lineTo(c0T.x, c0T.y);
              ctx2.closePath();
              ctx2.fillStyle = (i % 2 === 0) ? '#22d3ee' : '#67e8f9';
              ctx2.fill();
              ctx2.strokeStyle = '#0e7490';
              ctx2.lineWidth = 0.8;
              ctx2.stroke();
            }
          }

          // Outer Sloped Concrete Containment Ring Wall (24 segments around perimeter)
          for (let i = 0; i < N; i++) {
            const a0 = (i / N) * Math.PI * 2;
            const a1 = ((i + 1) / N) * Math.PI * 2;
            const aMid = 0.5 * (a0 + a1);
            const w0B = fromScreen(Math.cos(a0) * rOuterB, Math.sin(a0) * rOuterB);
            const w1B = fromScreen(Math.cos(a1) * rOuterB, Math.sin(a1) * rOuterB);
            const w1T = fromScreen(Math.cos(a1) * rOuterT, Math.sin(a1) * rOuterT);
            const w0T = fromScreen(Math.cos(a0) * rOuterT, Math.sin(a0) * rOuterT);
            const p0B = pcProj.project(w0B.x, w0B.y, 0);
            const p1B = pcProj.project(w1B.x, w1B.y, 0);
            const p1T = pcProj.project(w1T.x, w1T.y, zRing);
            const p0T = pcProj.project(w0T.x, w0T.y, zRing);
            if (Math.sin(aMid) > -0.35) {
              ctx2.beginPath();
              ctx2.moveTo(p0B.x, p0B.y); ctx2.lineTo(p1B.x, p1B.y); ctx2.lineTo(p1T.x, p1T.y); ctx2.lineTo(p0T.x, p0T.y);
              ctx2.closePath();
              const light = -Math.cos(aMid) * 0.5 + Math.sin(aMid) * 0.5;
              ctx2.fillStyle = light > 0.15 ? '#d6d2c8' : (light > -0.2 ? '#b8b4aa' : '#908c82');
              ctx2.fill();
              ctx2.strokeStyle = '#1e242b';
              ctx2.lineWidth = 0.95;
              ctx2.stroke();
            }
          }

          // Top Flat Concrete Containment Ring Walkway (annulus between rOuterT and rPit at z = zRing)
          for (let i = 0; i < N; i++) {
            const a0 = (i / N) * Math.PI * 2;
            const a1 = ((i + 1) / N) * Math.PI * 2;
            const w0O = fromScreen(Math.cos(a0) * rOuterT, Math.sin(a0) * rOuterT);
            const w1O = fromScreen(Math.cos(a1) * rOuterT, Math.sin(a1) * rOuterT);
            const w1I = fromScreen(Math.cos(a1) * rPit, Math.sin(a1) * rPit);
            const w0I = fromScreen(Math.cos(a0) * rPit, Math.sin(a0) * rPit);
            const p0O = pcProj.project(w0O.x, w0O.y, zRing);
            const p1O = pcProj.project(w1O.x, w1O.y, zRing);
            const p1I = pcProj.project(w1I.x, w1I.y, zRing);
            const p0I = pcProj.project(w0I.x, w0I.y, zRing);
            ctx2.beginPath();
            ctx2.moveTo(p0O.x, p0O.y); ctx2.lineTo(p1O.x, p1O.y); ctx2.lineTo(p1I.x, p1I.y); ctx2.lineTo(p0I.x, p0I.y);
            ctx2.closePath();
            ctx2.fillStyle = (i % 2 === 0) ? '#e4e0d8' : '#d6d2c8';
            ctx2.fill();
            ctx2.strokeStyle = '#475569';
            ctx2.lineWidth = 0.85;
            ctx2.stroke();
          }

          // Crisp outer & inner ring borders on top of containment wall
          for (const rad of [rOuterT, rPit]) {
            ctx2.beginPath();
            for (let i = 0; i <= 32; i++) {
              const a = (i / 32) * Math.PI * 2;
              const p = pcProj.project(Math.cos(a) * rad, Math.sin(a) * rad, zRing);
              if (i === 0) ctx2.moveTo(p.x, p.y);
              else ctx2.lineTo(p.x, p.y);
            }
            ctx2.closePath();
            ctx2.strokeStyle = '#1e242b';
            ctx2.lineWidth = 1.15;
            ctx2.stroke();
          }

          ctx2.restore();
        }
      });

      // 2. Four Long Tangential Semi-Cylindrical Glowing Cyan Plasma Capacitor Pods on Exterior Concrete Cradles + Curved Perimeter Power Conduits
      const diagPods = [
        { a: -3 * Math.PI / 4, bias: -8.0 }, // Top-Left (Back-Left)
        { a: -1 * Math.PI / 4, bias: -8.0 }, // Top-Right (Back-Right)
        { a:  3 * Math.PI / 4, bias: 22.0 }, // Bottom-Left (Front-Left)
        { a:  1 * Math.PI / 4, bias: 22.0 }  // Bottom-Right (Front-Right)
      ];

      const podLocalPt = (aDiag, rDist, tangDist, z) => {
        const ca = Math.cos(aDiag), sa = Math.sin(aDiag);
        const wx = ca * rDist - sa * tangDist;
        const wy = sa * rDist + ca * tangDist;
        return { ...fromScreen(wx, wy), z };
      };

      for (const pod of diagPods) {
        const aD = pod.a;
        const anchorDepth = ringTopDepth + pod.bias;
        const rIn = 0.82 * R, rOut = 1.08 * R, rMid = 0.95 * R, rRad = 0.125 * R;
        const tLen = 0.34 * R;
        const zCradleB = 0.01 * R * H;
        const zCradleT = 0.14 * R * H;
        const zPodTop  = 0.34 * R * H;

        polys.push({
          depth: anchorDepth,
          customDraw(ctx2) {
            ctx2.save();

            const projP = (rDist, tangDist, z) => {
              const pt = podLocalPt(aD, rDist, tangDist, z);
              return pcProj.project(pt.x, pt.y, pt.z);
            };
            const drawQ = (pts, fill, stroke = '#1e242b', lw = 1.05) => {
              ctx2.beginPath();
              pts.forEach((p, idx) => idx === 0 ? ctx2.moveTo(p.x, p.y) : ctx2.lineTo(p.x, p.y));
              ctx2.closePath();
              ctx2.fillStyle = fill;
              ctx2.fill();
              if (stroke) {
                ctx2.strokeStyle = stroke;
                ctx2.lineWidth = lw;
                ctx2.stroke();
              }
            };

            // A) Stepped Rectangular Concrete Cradle Base under the Tangential Capacitor Pod
            const cr00B = projP(rIn,  -tLen * 1.08, zCradleB);
            const cr10B = projP(rOut, -tLen * 1.08, zCradleB);
            const cr11B = projP(rOut,  tLen * 1.08, zCradleB);
            const cr01B = projP(rIn,   tLen * 1.08, zCradleB);
            const cr00T = projP(rIn,  -tLen * 1.04, zCradleT);
            const cr10T = projP(rOut, -tLen * 1.04, zCradleT);
            const cr11T = projP(rOut,  tLen * 1.04, zCradleT);
            const cr01T = projP(rIn,   tLen * 1.04, zCradleT);

            drawQ([cr00B, cr10B, cr10T, cr00T], '#969086');
            drawQ([cr01B, cr11B, cr11T, cr01T], '#b8b2a6');
            drawQ([cr10B, cr11B, cr11T, cr10T], '#a8a296');
            drawQ([cr00T, cr10T, cr11T, cr01T], '#d2ccc0');

            // B) Long Tangential Semi-Cylindrical Glowing Cyan Plasma Tube (axis along tangDist ∈ [-tLen, +tLen], arched across rDist ∈ [rIn, rOut])
            const tCapIn = tLen * 0.82;
            const nArch = 6;
            for (let k = 0; k < nArch; k++) {
              const u0 = -1 + (k / nArch) * 2;
              const u1 = -1 + ((k + 1) / nArch) * 2;
              const r0 = rMid + u0 * rRad;
              const r1 = rMid + u1 * rRad;
              const z0 = zCradleT + Math.sqrt(Math.max(0, 1 - u0 * u0)) * (zPodTop - zCradleT);
              const z1 = zCradleT + Math.sqrt(Math.max(0, 1 - u1 * u1)) * (zPodTop - zCradleT);

              const isCrown = (k === 2 || k === 3);
              const col = isCrown ? '#a5f3fc' : (k === 1 || k === 4 ? '#38bdf8' : '#06b6d4');
              drawQ([
                projP(r0, -tCapIn, z0),
                projP(r1, -tCapIn, z1),
                projP(r1,  tCapIn, z1),
                projP(r0,  tCapIn, z0)
              ], col, '#0891b2', 0.65);
            }

            // Bright crackling white-cyan plasma bolt running tangentially inside the cyan tube
            const pBolt0 = projP(rMid, -tCapIn * 0.88, zCradleT + 0.86 * (zPodTop - zCradleT));
            const pBoltM = projP(rMid + 0.02 * R, 0,   zCradleT + 0.96 * (zPodTop - zCradleT));
            const pBolt1 = projP(rMid,  tCapIn * 0.88, zCradleT + 0.86 * (zPodTop - zCradleT));
            ctx2.strokeStyle = '#ecfeff';
            ctx2.lineWidth = 2.6;
            ctx2.beginPath();
            ctx2.moveTo(pBolt0.x, pBolt0.y);
            ctx2.quadraticCurveTo(pBoltM.x, pBoltM.y, pBolt1.x, pBolt1.y);
            ctx2.stroke();

            // C) Thick Rounded Grey-Steel End-Cap Hoods at Both Tangential Ends ([-tLen..-tCapIn] and [+tCapIn..+tLen])
            for (const sEnd of [-1, 1]) {
              const tA = sEnd * tCapIn;
              const tB = sEnd * tLen;
              for (let k = 0; k < nArch; k++) {
                const u0 = -1 + (k / nArch) * 2;
                const u1 = -1 + ((k + 1) / nArch) * 2;
                const r0 = rMid + u0 * (rRad * 1.06);
                const r1 = rMid + u1 * (rRad * 1.06);
                const z0 = zCradleT + Math.sqrt(Math.max(0, 1 - u0 * u0)) * (zPodTop - zCradleT) * 1.04;
                const z1 = zCradleT + Math.sqrt(Math.max(0, 1 - u1 * u1)) * (zPodTop - zCradleT) * 1.04;
                const capCol = (k >= 1 && k <= 4) ? '#b8b2a6' : '#8c867c';
                drawQ([
                  projP(r0, tA, z0),
                  projP(r1, tA, z1),
                  projP(r1, tB, z1),
                  projP(r0, tB, z0)
                ], capCol, '#1e242b', 0.95);
              }
              const endFace = [];
              for (let k = 0; k <= nArch; k++) {
                const u = -1 + (k / nArch) * 2;
                const rU = rMid + u * (rRad * 1.06);
                const zU = zCradleT + Math.sqrt(Math.max(0, 1 - u * u)) * (zPodTop - zCradleT) * 1.04;
                endFace.push(projP(rU, tB, zU));
              }
              drawQ(endFace, '#969086', '#1e242b', 1.1);

              // D) Heavy Curved Dark-Steel Ribbed Power Conduit Pipe emerging from each end-cap (tB) and curving into the containment ring wall!
              const pPipe0 = projP(rMid, sEnd * (tLen * 1.02), zCradleT + 0.08 * R * H);
              const pPipe1 = projP(rMid * 0.96, sEnd * (tLen * 1.38), zCradleT + 0.05 * R * H);
              const pPipe2 = projP(rOuterB * 0.88, sEnd * (tLen * 1.24), zRing * 0.65);

              ctx2.strokeStyle = '#1e242b';
              ctx2.lineWidth = 7.0;
              ctx2.lineCap = 'round';
              ctx2.beginPath();
              ctx2.moveTo(pPipe0.x, pPipe0.y);
              ctx2.quadraticCurveTo(pPipe1.x, pPipe1.y, pPipe2.x, pPipe2.y);
              ctx2.stroke();

              ctx2.strokeStyle = '#525866';
              ctx2.lineWidth = 4.6;
              ctx2.beginPath();
              ctx2.moveTo(pPipe0.x, pPipe0.y);
              ctx2.quadraticCurveTo(pPipe1.x, pPipe1.y, pPipe2.x, pPipe2.y);
              ctx2.stroke();

              ctx2.strokeStyle = '#262b33';
              ctx2.lineWidth = 4.8;
              ctx2.setLineDash([2.0, 4.5]);
              ctx2.beginPath();
              ctx2.moveTo(pPipe0.x, pPipe0.y);
              ctx2.quadraticCurveTo(pPipe1.x, pPipe1.y, pPipe2.x, pPipe2.y);
              ctx2.stroke();
              ctx2.setLineDash([]);
            }

            // E) Two sloped concrete buttress struts connecting the containment ring slope to the inner side of the capacitor cradle
            for (const tStrut of [-0.14 * R, 0.14 * R]) {
              const st0 = projP(rOuterT, tStrut - 0.04 * R, zRing);
              const st1 = projP(rOuterT, tStrut + 0.04 * R, zRing);
              const st2 = projP(rIn,     tStrut + 0.05 * R, zCradleT);
              const st3 = projP(rIn,     tStrut - 0.05 * R, zCradleT);
              drawQ([st0, st1, st2, st3], '#c8c2b8', '#1e242b', 1.0);
            }

            ctx2.restore();
          }
        });
      }

      // 3. Central Tiered Cylindrical Particle Emitter Core + 4 Sloped Pit Buttresses + 4 Wide Reflective Mirror Petals + Vertical Particle Beam
      const zDrumTop = 0.28 * R * H;
      const zColTop  = 0.52 * R * H * BL;
      const zThroat  = 0.62 * R * H * BL;
      const coreDepth = ringTopDepth + 6.0;

      polys.push({
        depth: coreDepth,
        customDraw(ctx2) {
          ctx2.save();

          const projW = (wx, wy, z) => {
            const w = fromScreen(wx, wy);
            return pcProj.project(w.x, w.y, z);
          };
          const drawQ = (pts, fill, stroke = '#1e242b', lw = 1.05) => {
            ctx2.beginPath();
            pts.forEach((p, idx) => idx === 0 ? ctx2.moveTo(p.x, p.y) : ctx2.lineTo(p.x, p.y));
            ctx2.closePath();
            ctx2.fillStyle = fill;
            ctx2.fill();
            if (stroke) {
              ctx2.strokeStyle = stroke;
              ctx2.lineWidth = lw;
              ctx2.stroke();
            }
          };

          const drawCyl = (zB, zT, rB, rT, segs, colLight, colMid, colDark) => {
            for (let i = 0; i < segs; i++) {
              const a0 = (i / segs) * Math.PI * 2;
              const a1 = ((i + 1) / segs) * Math.PI * 2;
              const aMid = 0.5 * (a0 + a1);
              if (Math.sin(aMid) > -0.35) {
                const p0B = projW(Math.cos(a0) * rB, Math.sin(a0) * rB, zB);
                const p1B = projW(Math.cos(a1) * rB, Math.sin(a1) * rB, zB);
                const p1T = projW(Math.cos(a1) * rT, Math.sin(a1) * rT, zT);
                const p0T = projW(Math.cos(a0) * rT, Math.sin(a0) * rT, zT);
                const light = -Math.cos(aMid) * 0.55 + Math.sin(aMid) * 0.45;
                const fill = light > 0.15 ? colLight : (light > -0.2 ? colMid : colDark);
                drawQ([p0B, p1B, p1T, p0T], fill, '#1e242b', 0.95);
              }
            }
            const capPts = [];
            for (let i = 0; i < segs; i++) {
              const a = (i / segs) * Math.PI * 2;
              capPts.push(projW(Math.cos(a) * rT, Math.sin(a) * rT, zT));
            }
            drawQ(capPts, colLight, '#1e242b', 1.1);
          };

          // A) Lower central emitter pedestal inside the pit + 4 heavy sloped buttress legs with glowing cyan bottom vents
          drawCyl(zPitFloor, zDrumTop, 0.34 * R * TS, 0.28 * R * TS, 12, '#a8b0b8', '#848e98', '#5e6770');
          for (const aLeg of [-3 * Math.PI / 4, -Math.PI / 4, 3 * Math.PI / 4, Math.PI / 4]) {
            if (Math.sin(aLeg) > -0.8) {
              const ca = Math.cos(aLeg), sa = Math.sin(aLeg);
              const legPt = (rD, tD, z) => projW(ca * rD - sa * tD, sa * rD + ca * tD, z);
              drawQ([
                legPt(0.26 * R, -0.06 * R, zDrumTop),
                legPt(0.26 * R,  0.06 * R, zDrumTop),
                legPt(0.42 * R,  0.07 * R, zPitFloor),
                legPt(0.42 * R, -0.07 * R, zPitFloor)
              ], ca < 0 ? '#b8c0c8' : '#848e98', '#1e242b', 1.05);
            }
          }

          // B) Middle concrete-and-steel collar with cyan indicator rivets + narrower dark mechanical neck
          drawCyl(zDrumTop, zDrumTop + 0.08 * R * H, 0.26 * R * TS, 0.24 * R * TS, 12, '#cbd5e1', '#94a3b8', '#64748b');
          drawCyl(zDrumTop + 0.08 * R * H, zColTop, 0.20 * R * TS, 0.17 * R * TS, 12, '#64748b', '#475569', '#334155');
          drawCyl(zColTop, zThroat, 0.19 * R * TS, 0.15 * R * TS, 12, '#67e8f9', '#22d3ee', '#0891b2');

          // C) Helper to draw each of the 4 Wide Outward-Flaring Reflective Mirror Petals (matching usa_particle_cannon.png!)
          const drawMirrorPetal = (aPetal) => {
            const ca = Math.cos(aPetal), sa = Math.sin(aPetal);
            const ptPetal = (rDist, tangDist, z) => projW(ca * rDist - sa * tangDist, sa * rDist + ca * tangDist, z);

            const h0 = projW(ca * 0.15 * R, sa * 0.15 * R, zDrumTop + 0.10 * R * H);
            const h1 = projW(ca * 0.25 * R, sa * 0.25 * R, zThroat - 0.02 * R * H);
            ctx2.strokeStyle = '#1e242b';
            ctx2.lineWidth = 6.0;
            ctx2.beginPath(); ctx2.moveTo(h0.x, h0.y); ctx2.lineTo(h1.x, h1.y); ctx2.stroke();
            ctx2.strokeStyle = '#64748b';
            ctx2.lineWidth = 3.5;
            ctx2.beginPath(); ctx2.moveTo(h0.x, h0.y); ctx2.lineTo(h1.x, h1.y); ctx2.stroke();

            const rBase = 0.20 * R * TS;
            const rMid  = 0.30 * R * TS;
            const rTip  = 0.36 * R * TS;
            const rBackOffset = 0.055 * R * TS;
            const wBase = 0.08 * R * TS;
            const wMid  = 0.14 * R * TS;
            const wTip  = 0.09 * R * TS;
            const zB = zThroat - 0.04 * R * H;
            const zM = zThroat + 0.18 * R * H * BL;
            const zT = zThroat + 0.38 * R * H * BL;

            const inPts = [
              ptPetal(rBase, -wBase, zB),
              ptPetal(rMid,  -wMid,  zM),
              ptPetal(rTip,  -wTip,  zT),
              ptPetal(rTip,   wTip,  zT),
              ptPetal(rMid,   wMid,  zM),
              ptPetal(rBase,  wBase, zB)
            ];
            const outPts = [
              ptPetal(rBase + rBackOffset, -wBase * 1.12, zB),
              ptPetal(rMid  + rBackOffset, -wMid * 1.12,  zM),
              ptPetal(rTip  + rBackOffset, -wTip * 1.12,  zT),
              ptPetal(rTip  + rBackOffset,  wTip * 1.12,  zT),
              ptPetal(rMid  + rBackOffset,  wMid * 1.12,  zM),
              ptPetal(rBase + rBackOffset,  wBase * 1.12, zB)
            ];

            drawQ([inPts[0], inPts[1], inPts[2], outPts[2], outPts[1], outPts[0]], '#94a3b8', '#1e242b', 0.95);
            drawQ([inPts[3], inPts[4], inPts[5], outPts[5], outPts[4], outPts[3]], '#64748b', '#1e242b', 0.95);
            drawQ([inPts[2], inPts[3], outPts[3], outPts[2]], '#cbd5e1', '#1e242b', 0.95);

            const drawOuterBack = () => {
              drawQ(outPts, ca < 0 ? '#cbd5e1' : '#94a3b8', '#1e242b', 1.15);
              const pSub = [
                ptPetal(rBase + rBackOffset * 1.02, -wBase * 0.65, zB + 0.04 * R * H),
                ptPetal(rMid  + rBackOffset * 1.02, -wMid * 0.72,  zM),
                ptPetal(rTip  + rBackOffset * 1.02, -wTip * 0.65,  zT - 0.04 * R * H),
                ptPetal(rTip  + rBackOffset * 1.02,  wTip * 0.65,  zT - 0.04 * R * H),
                ptPetal(rMid  + rBackOffset * 1.02,  wMid * 0.72,  zM),
                ptPetal(rBase + rBackOffset * 1.02,  wBase * 0.65, zB + 0.04 * R * H)
              ];
              drawQ(pSub, '#e2e8f0', '#475569', 0.85);
            };

            const drawInnerMirror = () => {
              drawQ(inPts, '#cbd5e1', '#1e242b', 1.1);
              const mInset = [
                ptPetal(rBase - 0.005 * R, -wBase * 0.72, zB + 0.04 * R * H),
                ptPetal(rMid  - 0.005 * R, -wMid * 0.76,  zM),
                ptPetal(rTip  - 0.005 * R, -wTip * 0.72,  zT - 0.04 * R * H),
                ptPetal(rTip  - 0.005 * R,  wTip * 0.72,  zT - 0.04 * R * H),
                ptPetal(rMid  - 0.005 * R,  wMid * 0.76,  zM),
                ptPetal(rBase - 0.005 * R,  wBase * 0.72, zB + 0.04 * R * H)
              ];
              drawQ(mInset, '#67e8f9', '#0891b2', 1.0);
              const cB = ptPetal(rBase, 0, zB + 0.08 * R * H);
              const cT = ptPetal(rTip,  0, zT - 0.08 * R * H);
              ctx2.strokeStyle = '#ecfeff';
              ctx2.lineWidth = 2.4;
              ctx2.beginPath(); ctx2.moveTo(cB.x, cB.y); ctx2.lineTo(cT.x, cT.y); ctx2.stroke();
            };

            if (sa < 0) {
              drawOuterBack();
              drawInnerMirror();
            } else {
              drawInnerMirror();
              drawOuterBack();
            }
          };

          // 1) Draw Back-Left (-3pi/4) and Back-Right (-pi/4) mirror petals
          drawMirrorPetal(-3 * Math.PI / 4);
          drawMirrorPetal(-1 * Math.PI / 4);

          // 2) Draw Front-Left (+3pi/4) and Front-Right (+pi/4) mirror petals
          drawMirrorPetal(3 * Math.PI / 4);
          drawMirrorPetal(1 * Math.PI / 4);

          // 3) Central Blazing Cyan-White Vertical Particle Beam + Crackling Branching Lightning Arcs & Floating Plasma Orbs (matching usa_particle_cannon.png!)
          const pBeamBase = pcProj.project(0, 0, zThroat);
          const pBeamTop  = pcProj.project(0, 0, zThroat + 0.76 * R * H * BL);

          // Pure-JS canvas safe concentric cyan plasma glow rings at focal point between the 4 mirrors
          for (const halo of [
            { rad: 24, col: 'rgba(34, 211, 238, 0.16)' },
            { rad: 16, col: 'rgba(103, 232, 249, 0.28)' },
            { rad: 10, col: 'rgba(236, 254, 255, 0.55)' }
          ]) {
            ctx2.fillStyle = halo.col;
            ctx2.beginPath();
            ctx2.arc(pBeamBase.x, pBeamBase.y - 6, halo.rad, 0, Math.PI * 2);
            ctx2.fill();
          }

          // Outer cyan plasma beam aura
          ctx2.strokeStyle = '#22d3ee';
          ctx2.lineWidth = 11.5 * TS;
          ctx2.lineCap = 'round';
          ctx2.beginPath();
          ctx2.moveTo(pBeamBase.x, pBeamBase.y);
          ctx2.lineTo(pBeamTop.x, pBeamTop.y);
          ctx2.stroke();

          // Blazing white core beam
          ctx2.strokeStyle = '#ecfeff';
          ctx2.lineWidth = 5.4 * TS;
          ctx2.beginPath();
          ctx2.moveTo(pBeamBase.x, pBeamBase.y);
          ctx2.lineTo(pBeamTop.x, pBeamTop.y);
          ctx2.stroke();

          // Central cyan energy split line inside the white core (giving the twin-spiked beam look in usa_particle_cannon.png!)
          ctx2.strokeStyle = '#06b6d4';
          ctx2.lineWidth = 1.5;
          ctx2.beginPath();
          ctx2.moveTo(pBeamBase.x, pBeamBase.y - 8);
          ctx2.lineTo(pBeamTop.x, pBeamTop.y);
          ctx2.stroke();

          // Jagged crackling cyan-white lightning arcs branching from the central beam to the 4 mirror petals
          const arcs = [
            [[-2, -6], [-14, -14], [-22, -10], [-30, -18]],
            [[ 2, -6], [ 14, -14], [ 22, -10], [ 30, -18]],
            [[-2, -18], [-12, -26], [-20, -24], [-28, -36]],
            [[ 2, -18], [ 12, -26], [ 20, -24], [ 28, -36]],
            [[-2, -32], [-10, -42], [-18, -52]],
            [[ 2, -32], [ 10, -42], [ 18, -52]]
          ];
          for (const arc of arcs) {
            ctx2.strokeStyle = '#22d3ee';
            ctx2.lineWidth = 3.2;
            ctx2.beginPath();
            arc.forEach((pt, idx) => idx === 0 ? ctx2.moveTo(pBeamBase.x + pt[0], pBeamBase.y + pt[1]) : ctx2.lineTo(pBeamBase.x + pt[0], pBeamBase.y + pt[1]));
            ctx2.stroke();

            ctx2.strokeStyle = '#ecfeff';
            ctx2.lineWidth = 1.4;
            ctx2.beginPath();
            arc.forEach((pt, idx) => idx === 0 ? ctx2.moveTo(pBeamBase.x + pt[0], pBeamBase.y + pt[1]) : ctx2.lineTo(pBeamBase.x + pt[0], pBeamBase.y + pt[1]));
            ctx2.stroke();
          }

          // Floating cyan plasma droplets/sparks around the beam crown
          for (const sp of [[-18, -44], [18, -44], [-10, -58], [11, -56], [-26, -30], [26, -30], [-6, -68], [6, -66]]) {
            ctx2.fillStyle = '#ecfeff';
            ctx2.strokeStyle = '#22d3ee';
            ctx2.lineWidth = 1.2;
            ctx2.beginPath();
            ctx2.arc(pBeamBase.x + sp[0], pBeamBase.y + sp[1], 2.2, 0, Math.PI * 2);
            ctx2.fill();
            ctx2.stroke();
          }

          ctx2.restore();
        }
      });

      flushFaces(ctx, polys);
      return;
    }

    flushFaces(ctx, faces);
  }

  function renderChinaBuildingModel(ctx, u, faction, params, options) {
    const p = Object.assign({}, BUILDING_DEFAULT_PARAMS, {
      armorBaseColor: '#94a3b8',
      armorHighlightColor: '#cbd5e1',
      armorShadowColor: '#475569',
      houseColor: '#dc2626'
    }, params || {});
    const opts = options || {};
    const defId = u.defId || (u.def && u.def.id) || 'CHINA_COMMAND_CENTER';
    const r = (u.radius || ((u.def && u.def.size) ? u.def.size * 0.46 : 36)) * (p.footprintScale || 1.0);
    const H = (p.structureHeight || 1.0) * (p.extrusionDepth || 1.0);
    const SS = p.superstructureScale || 1.0;
    const TS = p.turretScale || 1.0;
    const BL = p.barrelLength || 1.0;
    const RS = p.radarScale || 1.0;
    const t = (typeof performance !== 'undefined' ? performance.now() * 0.001 : 0) + (u.treadPhase || 0) * 6.0;
    const baseAngle = (u.angle !== undefined ? u.angle : 0.68);
    const turretAngle = (u.turretAngle !== undefined ? u.turretAngle : baseAngle);
    const recoil = (u.recoilOffset || 0) * 0.05 * r;
    const pitchScale = opts.pitchScale !== undefined ? opts.pitchScale : 0.64;
    const zScale = opts.zScale !== undefined ? opts.zScale : 0.78;

    const baseCol = p.armorBaseColor || '#94a3b8';
    const hiCol = p.armorHighlightColor || '#cbd5e1';
    const shCol = p.armorShadowColor || '#475569';
    const houseCol = (faction && faction.color) || p.houseColor || '#dc2626';
    const seamCol = '#2b241f';

    const proj = createProjector(baseAngle, pitchScale, zScale);
    const faces = [];

    // Shared Ligne-Claire helpers for China buildings (45-degree symmetric isometric projector: +Y = SW/front-left, +X = SE/front-right, -X = NW/back-left, -Y = NE/back-right)
    const chAngle = Math.PI / 4;
    const chProj = createProjector(chAngle, pitchScale, zScale);
    const chStroke = '#26201b';

    const pushChQuad = (pts3d, fill, stroke = chStroke, lineWidth = 1.0, bias = 0) => {
      const projPts = pts3d.map(pt => chProj.project(pt.x, pt.y, pt.z));
      const depth = projPts.reduce((acc, pt) => acc + pt.depth, 0) / projPts.length + bias;
      faces.push({ pts: projPts, depth, fill, stroke, lineWidth });
    };

    const pushChQuadFixed = (pts3d, fill, stroke = chStroke, lineWidth = 1.0, fixedDepth = 0) => {
      const projPts = pts3d.map(pt => chProj.project(pt.x, pt.y, pt.z));
      faces.push({ pts: projPts, depth: fixedDepth, fill, stroke, lineWidth });
    };

    const pushChLine = (p0, p1, stroke = chStroke, lineWidth = 1.0, fixedDepth = 0) => {
      const q0 = chProj.project(p0.x, p0.y, p0.z);
      const q1 = chProj.project(p1.x, p1.y, p1.z);
      faces.push({
        pts: [q0, q1],
        depth: fixedDepth,
        customDraw(ctx2) {
          ctx2.save();
          ctx2.strokeStyle = stroke;
          ctx2.lineWidth = lineWidth;
          ctx2.lineCap = 'round';
          ctx2.beginPath();
          ctx2.moveTo(q0.x, q0.y);
          ctx2.lineTo(q1.x, q1.y);
          ctx2.stroke();
          ctx2.restore();
        }
      });
    };

    const pushChBox = (x0, x1, y0, y1, zB, zT, topCol, swCol, seCol, nwCol, neCol, depthAnchor = null, lw = 1.0) => {
      const p00B = { x: x0, y: y0, z: zB }, p10B = { x: x1, y: y0, z: zB }, p11B = { x: x1, y: y1, z: zB }, p01B = { x: x0, y: y1, z: zB };
      const p00T = { x: x0, y: y0, z: zT }, p10T = { x: x1, y: y0, z: zT }, p11T = { x: x1, y: y1, z: zT }, p01T = { x: x0, y: y1, z: zT };
      const pushF = (pts, col, dOff) => {
        if (!col) return;
        if (depthAnchor !== null) pushChQuadFixed(pts, col, chStroke, lw, depthAnchor + dOff);
        else pushChQuad(pts, col, chStroke, lw, dOff);
      };
      pushF([p00B, p10B, p10T, p00T], neCol || seCol, 0.1);
      pushF([p00B, p01B, p01T, p00T], nwCol || swCol, 0.2);
      pushF([p01B, p11B, p11T, p01T], swCol, 0.4);
      pushF([p10B, p11B, p11T, p10T], seCol, 0.5);
      pushF([p00T, p10T, p11T, p01T], topCol, 0.7);
    };

    const pushChFrustum = (x0B, x1B, y0B, y1B, x0T, x1T, y0T, y1T, zB, zT, topCol, swCol, seCol, nwCol, neCol, depthAnchor = null, lw = 1.05) => {
      const p00B = { x: x0B, y: y0B, z: zB }, p10B = { x: x1B, y: y0B, z: zB }, p11B = { x: x1B, y: y1B, z: zB }, p01B = { x: x0B, y: y1B, z: zB };
      const p00T = { x: x0T, y: y0T, z: zT }, p10T = { x: x1T, y: y0T, z: zT }, p11T = { x: x1T, y: y1T, z: zT }, p01T = { x: x0T, y: y1T, z: zT };
      const pushF = (pts, col, dOff) => {
        if (!col) return;
        if (depthAnchor !== null) pushChQuadFixed(pts, col, chStroke, lw, depthAnchor + dOff);
        else pushChQuad(pts, col, chStroke, lw, dOff);
      };
      pushF([p00B, p10B, p10T, p00T], neCol || seCol, 0.1);
      pushF([p00B, p01B, p01T, p00T], nwCol || swCol, 0.2);
      pushF([p01B, p11B, p11T, p01T], swCol, 0.4);
      pushF([p10B, p11B, p11T, p10T], seCol, 0.5);
      pushF([p00T, p10T, p11T, p01T], topCol, 0.7);
    };

    // Draw a gold-bordered crimson (or solid gold) 5-pointed star on any 3D plane (center3d, uVec, vVec, rOuter)
    const pushChStar3D = (center3d, uVec, vVec, rOuter, fixedDepth, innerCol = '#dc2626') => {
      const mkStarPts = (radOut, radIn) => {
        const pts = [];
        for (let i = 0; i < 10; i++) {
          const ang = -Math.PI / 2 + (i * Math.PI) / 5;
          const rad = (i % 2 === 0) ? radOut : radIn;
          const cu = Math.cos(ang) * rad;
          const cv = -Math.sin(ang) * rad; // +vVec is UP
          pts.push({
            x: center3d.x + uVec.x * cu + vVec.x * cv,
            y: center3d.y + uVec.y * cu + vVec.y * cv,
            z: center3d.z + uVec.z * cu + vVec.z * cv
          });
        }
        return pts;
      };
      pushChQuadFixed(mkStarPts(rOuter, rOuter * 0.44), '#eab308', chStroke, 1.0, fixedDepth);
      if (innerCol) {
        pushChQuadFixed(mkStarPts(rOuter * 0.72, rOuter * 0.32), innerCol, '#7f1d1d', 0.65, fixedDepth + 0.05);
      }
    };

    // Sweeping Chinese pagoda hip roof with upturned corner eaves, vertical tile rib lines, and diagonal hip spines
    const pushPagodaRoof3D = (x0B, x1B, y0B, y1B, x0T, x1T, y0T, y1T, zB, zT, topCol, numRibs, depthBase, flare = 0.06 * r) => {
      const zEave = zB + (zT - zB) * 0.28;
      const x0M = x0B * 0.70 + x0T * 0.30, x1M = x1B * 0.70 + x1T * 0.30;
      const y0M = y0B * 0.70 + y0T * 0.30, y1M = y1B * 0.70 + y1T * 0.30;

      // 4 Eave corners flared slightly outward & upward for authentic Chinese upturned roof silhouette
      const c00B = { x: x0B - flare, y: y0B - flare, z: zB + flare * 0.35 };
      const c10B = { x: x1B + flare, y: y0B - flare, z: zB + flare * 0.35 };
      const c11B = { x: x1B + flare, y: y1B + flare, z: zB + flare * 0.35 };
      const c01B = { x: x0B - flare, y: y1B + flare, z: zB + flare * 0.35 };

      const m00 = { x: x0M, y: y0M, z: zEave }, m10 = { x: x1M, y: y0M, z: zEave }, m11 = { x: x1M, y: y1M, z: zEave }, m01 = { x: x0M, y: y1M, z: zEave };
      const t00 = { x: x0T, y: y0T, z: zT }, t10 = { x: x1T, y: y0T, z: zT }, t11 = { x: x1T, y: y1T, z: zT }, t01 = { x: x0T, y: y1T, z: zT };

      // Fascia lip under front eaves
      const fH = Math.max(1.8, (zT - zB) * 0.16);
      pushChQuadFixed([{ x: c01B.x, y: c01B.y, z: zB - fH }, { x: c11B.x, y: c11B.y, z: zB - fH }, c11B, c01B], '#991b1b', chStroke, 0.95, depthBase + 0.15);
      pushChQuadFixed([{ x: c10B.x, y: c10B.y, z: zB - fH }, { x: c11B.x, y: c11B.y, z: zB - fH }, c11B, c10B], '#7f1d1d', chStroke, 0.95, depthBase + 0.20);

      // Back slopes (NE and NW)
      pushChQuadFixed([c00B, c10B, m10, m00], '#7f1d1d', chStroke, 0.95, depthBase + 0.05);
      pushChQuadFixed([m00, m10, t10, t00], '#991b1b', chStroke, 0.95, depthBase + 0.10);
      pushChQuadFixed([c00B, c01B, m01, m00], '#991b1b', chStroke, 0.95, depthBase + 0.12);
      pushChQuadFixed([m00, m01, t01, t00], '#b91c1c', chStroke, 0.95, depthBase + 0.16);

      // Front-left (SW, +Y) 2-band concave slope
      pushChQuadFixed([c01B, c11B, m11, m01], '#b91c1c', chStroke, 1.05, depthBase + 0.30);
      pushChQuadFixed([m01, m11, t11, t01], '#dc2626', chStroke, 1.05, depthBase + 0.35);

      // Front-right (SE, +X) 2-band concave slope
      pushChQuadFixed([c10B, c11B, m11, m10], '#991b1b', chStroke, 1.05, depthBase + 0.40);
      pushChQuadFixed([m10, m11, t11, t10], '#b91c1c', chStroke, 1.05, depthBase + 0.45);

      // Tile rib lines on SW (+Y) and SE (+X) slopes
      for (let i = 1; i < numRibs; i++) {
        const s = i / numRibs;
        // SW slope rib
        const bxSW = c01B.x + (c11B.x - c01B.x) * s;
        const mxSW = m01.x + (m11.x - m01.x) * s;
        const txSW = t01.x + (t11.x - t01.x) * s;
        pushChLine({ x: bxSW, y: c01B.y, z: zB }, { x: mxSW, y: m01.y, z: zEave }, '#7f1d1d', 0.85, depthBase + 0.38);
        pushChLine({ x: mxSW, y: m01.y, z: zEave }, { x: txSW, y: t01.y, z: zT }, '#7f1d1d', 0.85, depthBase + 0.38);

        // SE slope rib
        const bySE = c10B.y + (c11B.y - c10B.y) * s;
        const mySE = m10.y + (m11.y - m10.y) * s;
        const tySE = t10.y + (t11.y - t10.y) * s;
        pushChLine({ x: c10B.x, y: bySE, z: zB }, { x: m10.x, y: mySE, z: zEave }, '#450a0a', 0.85, depthBase + 0.48);
        pushChLine({ x: m10.x, y: mySE, z: zEave }, { x: t10.x, y: tySE, z: zT }, '#450a0a', 0.85, depthBase + 0.48);
      }

      // 4 Upturned diagonal corner hip ridge spines + curved Chinese pagoda horn tips
      for (const [cB, mP, tP, dBias, sx, sy] of [
        [c01B, m01, t01, 0.52, -1,  1],
        [c11B, m11, t11, 0.56,  1,  1],
        [c10B, m10, t10, 0.52,  1, -1],
        [c00B, m00, t00, 0.22, -1, -1]
      ]) {
        const hornTip = { x: cB.x + sx * flare * 0.55, y: cB.y + sy * flare * 0.55, z: cB.z + flare * 0.95 };
        pushChQuadFixed([
          hornTip,
          { x: cB.x + sx * flare * 0.15, y: cB.y - sy * flare * 0.25, z: zB },
          mP
        ], '#dc2626', chStroke, 0.95, depthBase + dBias - 0.02);
        pushChLine(hornTip, cB, '#ef4444', 2.4, depthBase + dBias);
        pushChLine(cB, mP, '#ef4444', 2.2, depthBase + dBias);
        pushChLine(mP, tP, '#ef4444', 2.0, depthBase + dBias);
        pushChLine(hornTip, cB, chStroke, 0.9, depthBase + dBias + 0.01);
      }

      if (topCol) {
        pushChQuadFixed([t00, t10, t11, t01], topCol, chStroke, 1.05, depthBase + 0.60);
      }
    };

    if (defId === 'CHINA_COMMAND_CENTER') {
      // High-Fidelity Ligne-Claire 3D Model matching china_command_center.png:
      // 1. Sloped brutalist warm-grey concrete fortress base with crimson bottom skirt
      // 2. SW (+Y) Corrugated roll-up Dozer bay + SE (+X) wide interlocking double blast gate with gold zig-zag seam, both with yellow/black hazard stripe threshold ramps
      // 3. 4 Protruding sloped concrete buttress pilasters flanking the doors, each with a recessed glowing red-orange vertical light bar
      // 4. Glowing amber clerestory windows under the first-tier sweeping crimson pagoda roof
      // 5. Raised concrete star pediment on SW (+Y) facade with giant gold-bordered crimson 5-pointed star breaking the lower eave
      // 6. Upper concrete terrace deck + sloped command penthouse (SW door, SE 3 armored HVAC louver boxes, red observation slits) + second-tier sweeping crimson pagoda roof
      // 7. Rooftop comms suite: NW lattice tower with twin microwave drums, West parabolic dish, large East parabolic dish, and top pagoda dish + 4 whip antennas
      const R = r * 1.16 * SS;
      const zBase0 = 0.02 * R * H;
      const zWallT = 0.54 * R * H;
      const dRef = chProj.project(0, 0, zWallT).depth;

      // 1. Contoured concrete ground apron
      pushChBox(-0.98 * R, 0.98 * R, -0.98 * R, 0.98 * R, 0, zBase0, '#cfc8bd', '#a8a29e', '#78716c', '#a8a29e', '#78716c', dRef - 40, 0.9);

      // 2. Sloped Brutalist Concrete Fortress Base (crimson bottom trim + warm-grey sloped concrete walls)
      const zTrimT = zBase0 + 0.08 * R * H;
      pushChFrustum(-0.90 * R, 0.90 * R, -0.90 * R, 0.90 * R, -0.88 * R, 0.88 * R, -0.88 * R, 0.88 * R, zBase0, zTrimT, null, '#b91c1c', '#991b1b', '#b91c1c', '#7f1d1d', dRef - 30, 1.05);
      pushChFrustum(-0.88 * R, 0.88 * R, -0.88 * R, 0.88 * R, -0.76 * R, 0.76 * R, -0.76 * R, 0.76 * R, zTrimT, zWallT, '#9ca3af', '#c7c2ba', '#9ca3af', '#c7c2ba', '#78716c', dRef - 28, 1.15);

      // Helper to interpolate wall coordinate along height z in [zBase0, zWallT]
      const wallCoord = (z) => 0.90 * R - ((z - zBase0) / (zWallT - zBase0)) * 0.14 * R;

      // Vertical concrete panel seams on SW (+Y) and SE (+X) walls
      for (const sPos of [-0.72 * R, -0.44 * R, 0.44 * R, 0.72 * R]) {
        pushChLine({ x: sPos, y: wallCoord(zTrimT), z: zTrimT }, { x: sPos * 0.88, y: wallCoord(zWallT), z: zWallT }, '#78716c', 0.8, dRef - 27.2);
      }

      // 3. SW (+Y) Central Dozer Roll-Up Garage Door + Hazard Threshold Ramp
      const zDoorT = zBase0 + 0.36 * R * H;
      const yDoorB = wallCoord(zBase0), yDoorT = wallCoord(zDoorT);
      // Outer concrete door frame
      pushChQuadFixed([
        { x: -0.42 * R, y: yDoorB + 0.02 * R, z: zBase0 },
        { x:  0.42 * R, y: yDoorB + 0.02 * R, z: zBase0 },
        { x:  0.40 * R, y: yDoorT + 0.02 * R, z: zDoorT + 0.03 * R * H },
        { x: -0.40 * R, y: yDoorT + 0.02 * R, z: zDoorT + 0.03 * R * H }
      ], '#a8a29e', chStroke, 1.05, dRef - 24);
      // Recessed corrugated roll-up door
      pushChQuadFixed([
        { x: -0.35 * R, y: yDoorB + 0.01 * R, z: zBase0 + 0.04 * R * H },
        { x:  0.35 * R, y: yDoorB + 0.01 * R, z: zBase0 + 0.04 * R * H },
        { x:  0.34 * R, y: yDoorT + 0.01 * R, z: zDoorT },
        { x: -0.34 * R, y: yDoorT + 0.01 * R, z: zDoorT }
      ], '#78716c', chStroke, 1.0, dRef - 23.5);
      for (let k = 1; k <= 4; k++) {
        const zk = zBase0 + (0.04 + k * 0.064) * R * H;
        const yk = wallCoord(zk) + 0.012 * R;
        pushChLine({ x: -0.34 * R, y: yk, z: zk }, { x: 0.34 * R, y: yk, z: zk }, '#44403c', 1.1, dRef - 23.2);
      }
      // Yellow/black diagonal hazard stripe ramp on SW (+Y) door threshold
      const yRampOut = yDoorB + 0.09 * R;
      pushChQuadFixed([
        { x: -0.36 * R, y: yDoorB, z: zBase0 + 0.04 * R * H },
        { x:  0.36 * R, y: yDoorB, z: zBase0 + 0.04 * R * H },
        { x:  0.36 * R, y: yRampOut, z: zBase0 },
        { x: -0.36 * R, y: yRampOut, z: zBase0 }
      ], '#eab308', chStroke, 0.95, dRef - 23.0);
      for (let k = 0; k < 6; k++) {
        const sx0 = -0.34 * R + k * 0.115 * R;
        pushChQuadFixed([
          { x: sx0, y: yDoorB, z: zBase0 + 0.04 * R * H },
          { x: sx0 + 0.055 * R, y: yDoorB, z: zBase0 + 0.04 * R * H },
          { x: sx0 + 0.035 * R, y: yRampOut, z: zBase0 },
          { x: sx0 - 0.02 * R, y: yRampOut, z: zBase0 }
        ], '#1e242b', null, 0, dRef - 22.8);
      }

      // 4. SE (+X) Wide Double Interlocking Blast Gate + Hazard Threshold Ramp
      pushChQuadFixed([
        { x: yDoorB + 0.02 * R, y: -0.46 * R, z: zBase0 },
        { x: yDoorB + 0.02 * R, y:  0.46 * R, z: zBase0 },
        { x: yDoorT + 0.02 * R, y:  0.44 * R, z: zDoorT + 0.03 * R * H },
        { x: yDoorT + 0.02 * R, y: -0.44 * R, z: zDoorT + 0.03 * R * H }
      ], '#8c857b', chStroke, 1.05, dRef - 24);
      pushChQuadFixed([
        { x: yDoorB + 0.01 * R, y: -0.40 * R, z: zBase0 + 0.04 * R * H },
        { x: yDoorB + 0.01 * R, y:  0.40 * R, z: zBase0 + 0.04 * R * H },
        { x: yDoorT + 0.01 * R, y:  0.39 * R, z: zDoorT },
        { x: yDoorT + 0.01 * R, y: -0.39 * R, z: zDoorT }
      ], '#57534e', chStroke, 1.0, dRef - 23.5);
      // Gold interlocking center seam & horizontal stiffeners on SE blast gate
      const zMidG1 = zBase0 + 0.14 * R * H, zMidG2 = zBase0 + 0.25 * R * H;
      pushChLine({ x: wallCoord(zMidG1) + 0.015 * R, y: -0.39 * R, z: zMidG1 }, { x: wallCoord(zMidG1) + 0.015 * R, y: 0.39 * R, z: zMidG1 }, '#eab308', 1.4, dRef - 23.2);
      pushChLine({ x: wallCoord(zMidG2) + 0.015 * R, y: -0.39 * R, z: zMidG2 }, { x: wallCoord(zMidG2) + 0.015 * R, y: 0.39 * R, z: zMidG2 }, '#eab308', 1.4, dRef - 23.2);
      pushChLine({ x: yDoorB + 0.015 * R, y: 0, z: zBase0 + 0.04 * R * H }, { x: yDoorT + 0.015 * R, y: 0, z: zDoorT }, '#eab308', 1.8, dRef - 23.1);
      // Yellow/black hazard threshold ramp on SE (+X) blast gate
      pushChQuadFixed([
        { x: yDoorB, y: -0.40 * R, z: zBase0 + 0.04 * R * H },
        { x: yDoorB, y:  0.40 * R, z: zBase0 + 0.04 * R * H },
        { x: yRampOut, y:  0.40 * R, z: zBase0 },
        { x: yRampOut, y: -0.40 * R, z: zBase0 }
      ], '#eab308', chStroke, 0.95, dRef - 23.0);
      for (let k = 0; k < 6; k++) {
        const sy0 = -0.38 * R + k * 0.125 * R;
        pushChQuadFixed([
          { x: yDoorB, y: sy0, z: zBase0 + 0.04 * R * H },
          { x: yDoorB, y: sy0 + 0.06 * R, z: zBase0 + 0.04 * R * H },
          { x: yRampOut, y: sy0 + 0.04 * R, z: zBase0 },
          { x: yRampOut, y: sy0 - 0.02 * R, z: zBase0 }
        ], '#1e242b', null, 0, dRef - 22.8);
      }

      // 5. Four Sloped Concrete Buttress Pilasters with Recessed Glowing Red-Orange Light Bars
      const zButT = zBase0 + 0.42 * R * H;
      const yButB = wallCoord(zBase0), yButT = wallCoord(zButT);
      // SW (+Y) buttresses at x = -0.58R and x = +0.58R
      for (const bx of [-0.58 * R, 0.58 * R]) {
        pushChFrustum(
          bx - 0.095 * R, bx + 0.095 * R, yButB - 0.02 * R, yButB + 0.08 * R,
          bx * 0.90 - 0.08 * R, bx * 0.90 + 0.08 * R, yButT - 0.02 * R, yButT + 0.06 * R,
          zBase0, zButT, '#d6d3d1', '#c7c2ba', '#8c857b', '#d6d3d1', '#78716c', dRef + 0.8, 1.05
        );
        // Glowing red-orange vertical slot on SW face of buttress
        pushChQuadFixed([
          { x: bx - 0.032 * R, y: yButB + 0.082 * R, z: zBase0 + 0.03 * R * H },
          { x: bx + 0.032 * R, y: yButB + 0.082 * R, z: zBase0 + 0.03 * R * H },
          { x: bx * 0.90 + 0.028 * R, y: yButT + 0.062 * R, z: zButT - 0.03 * R * H },
          { x: bx * 0.90 - 0.028 * R, y: yButT + 0.062 * R, z: zButT - 0.03 * R * H }
        ], '#b91c1c', chStroke, 0.85, dRef + 1.6);
        pushChQuadFixed([
          { x: bx * 0.93 - 0.024 * R, y: yButT + 0.066 * R, z: zButT - 0.13 * R * H },
          { x: bx * 0.93 + 0.024 * R, y: yButT + 0.066 * R, z: zButT - 0.13 * R * H },
          { x: bx * 0.90 + 0.024 * R, y: yButT + 0.063 * R, z: zButT - 0.035 * R * H },
          { x: bx * 0.90 - 0.024 * R, y: yButT + 0.063 * R, z: zButT - 0.035 * R * H }
        ], '#fb923c', null, 0, dRef + 1.7);
      }
      // SE (+X) buttresses at y = +0.58R and y = -0.58R
      for (const by of [0.58 * R, -0.58 * R]) {
        pushChFrustum(
          yButB - 0.02 * R, yButB + 0.08 * R, by - 0.095 * R, by + 0.095 * R,
          yButT - 0.02 * R, yButT + 0.06 * R, by * 0.90 - 0.08 * R, by * 0.90 + 0.08 * R,
          zBase0, zButT, '#d6d3d1', '#c7c2ba', '#8c857b', '#c7c2ba', '#78716c', dRef + 0.8, 1.05
        );
        pushChQuadFixed([
          { x: yButB + 0.082 * R, y: by - 0.032 * R, z: zBase0 + 0.03 * R * H },
          { x: yButB + 0.082 * R, y: by + 0.032 * R, z: zBase0 + 0.03 * R * H },
          { x: yButT + 0.062 * R, y: by * 0.90 + 0.028 * R, z: zButT - 0.03 * R * H },
          { x: yButT + 0.062 * R, y: by * 0.90 - 0.028 * R, z: zButT - 0.03 * R * H }
        ], '#b91c1c', chStroke, 0.85, dRef + 1.6);
        pushChQuadFixed([
          { x: yButT + 0.066 * R, y: by * 0.93 - 0.024 * R, z: zButT - 0.13 * R * H },
          { x: yButT + 0.066 * R, y: by * 0.93 + 0.024 * R, z: zButT - 0.13 * R * H },
          { x: yButT + 0.063 * R, y: by * 0.90 + 0.024 * R, z: zButT - 0.035 * R * H },
          { x: yButT + 0.063 * R, y: by * 0.90 - 0.024 * R, z: zButT - 0.035 * R * H }
        ], '#fb923c', null, 0, dRef + 1.7);
      }

      // 6. Glowing Amber-Gold Clerestory Windows directly below First-Tier Pagoda Eave
      const zWin0 = zWallT - 0.11 * R * H, zWin1 = zWallT - 0.045 * R * H;
      const yW0 = wallCoord(zWin0) + 0.012 * R, yW1 = wallCoord(zWin1) + 0.012 * R;
      for (const [wx0, wx1] of [[-0.66 * R, -0.42 * R], [0.42 * R, 0.66 * R]]) {
        pushChQuadFixed([
          { x: wx0, y: yW0, z: zWin0 }, { x: wx1, y: yW0, z: zWin0 },
          { x: wx1, y: yW1, z: zWin1 }, { x: wx0, y: yW1, z: zWin1 }
        ], '#f59e0b', chStroke, 0.9, dRef + 0.65);
      }
      for (const [wy0, wy1] of [[-0.64 * R, -0.42 * R], [-0.30 * R, -0.06 * R], [0.06 * R, 0.30 * R], [0.42 * R, 0.64 * R]]) {
        pushChQuadFixed([
          { x: yW0, y: wy0, z: zWin0 }, { x: yW0, y: wy1, z: zWin0 },
          { x: yW1, y: wy1, z: zWin1 }, { x: yW1, y: wy0, z: zWin1 }
        ], '#f59e0b', chStroke, 0.9, dRef + 0.65);
      }

      // 7. First-Tier Sweeping Crimson Pagoda Roof & SW Star Pediment
      const zRoof1T = zWallT + 0.17 * R * H;
      pushPagodaRoof3D(-0.83 * R, 0.83 * R, -0.83 * R, 0.83 * R, -0.64 * R, 0.64 * R, -0.64 * R, 0.64 * R, zWallT, zRoof1T, '#a8a29e', 14, dRef, 0.055 * R);

      // Raised concrete star pediment breaking through the SW (+Y) lower pagoda eave
      pushChFrustum(
        -0.29 * R, 0.29 * R, 0.63 * R, 0.82 * R,
        -0.26 * R, 0.26 * R, 0.61 * R, 0.78 * R,
        zWallT - 0.08 * R * H, zRoof1T - 0.01 * R * H,
        '#b91c1c', '#d6d3d1', '#9ca3af', '#c7c2ba', '#78716c', dRef + 1.8, 1.05
      );
      pushChStar3D(
        { x: 0, y: 0.805 * R, z: zWallT + 0.05 * R * H },
        { x: 1, y: 0, z: 0 },
        { x: 0, y: -0.14, z: 1 },
        0.155 * R,
        dRef + 2.6
      );

      // 8. Upper Terrace Parapet Rim & Second-Tier Command Penthouse
      const zPentB = zRoof1T + 0.03 * R * H;
      const zPentT = zRoof1T + 0.38 * R * H;
      // Low crimson-trimmed parapet rim around the upper terrace
      pushChBox(-0.62 * R, 0.62 * R, -0.62 * R, 0.62 * R, zRoof1T, zPentB, '#b8b2a8', '#b91c1c', '#991b1b', '#b91c1c', '#7f1d1d', dRef + 3.0, 0.95);

      // Sloped concrete command penthouse (taller wall exposure so doors, HVAC louvers & red windows are clearly visible below upper pagoda eave)
      pushChFrustum(
        -0.41 * R, 0.41 * R, -0.41 * R, 0.41 * R,
        -0.34 * R, 0.34 * R, -0.34 * R, 0.34 * R,
        zPentB, zPentT,
        '#9ca3af', '#c7c2ba', '#8c857b', '#c7c2ba', '#78716c', dRef + 5.0, 1.1
      );
      // Penthouse SW (+Y) framed double blast doorway flush against SW penthouse wall
      pushChQuadFixed([
        { x: -0.15 * R, y: 0.405 * R, z: zPentB },
        { x:  0.15 * R, y: 0.405 * R, z: zPentB },
        { x:  0.14 * R, y: 0.375 * R, z: zPentB + 0.21 * R * H },
        { x: -0.14 * R, y: 0.375 * R, z: zPentB + 0.21 * R * H }
      ], '#d6d3d1', chStroke, 0.95, dRef + 5.8);
      pushChQuadFixed([
        { x: -0.10 * R, y: 0.408 * R, z: zPentB },
        { x:  0.10 * R, y: 0.408 * R, z: zPentB },
        { x:  0.095 * R, y: 0.382 * R, z: zPentB + 0.17 * R * H },
        { x: -0.095 * R, y: 0.382 * R, z: zPentB + 0.17 * R * H }
      ], '#78716c', chStroke, 0.9, dRef + 5.9);
      pushChLine({ x: 0, y: 0.41 * R, z: zPentB }, { x: 0, y: 0.382 * R, z: zPentB + 0.17 * R * H }, '#26201b', 1.0, dRef + 6.0);
      // Penthouse SE (+X) 3 armored HVAC louver boxes
      for (const hy of [-0.21 * R, 0, 0.21 * R]) {
        pushChBox(0.35 * R, 0.42 * R, hy - 0.052 * R, hy + 0.052 * R, zPentB + 0.01 * R * H, zPentB + 0.17 * R * H, '#cbd5e1', '#9ca3af', '#64748b', '#94a3b8', '#475569', dRef + 5.9, 0.9);
      }
      // Penthouse upper red-orange observation window slits (positioned cleanly below upper pagoda eave)
      const zPWin0 = zPentB + 0.21 * R * H, zPWin1 = zPentB + 0.27 * R * H;
      for (const [wx0, wx1] of [[-0.25 * R, -0.05 * R], [0.05 * R, 0.25 * R]]) {
        pushChQuadFixed([
          { x: wx0, y: 0.375 * R, z: zPWin0 },
          { x: wx1, y: 0.375 * R, z: zPWin0 },
          { x: wx1, y: 0.362 * R, z: zPWin1 },
          { x: wx0, y: 0.362 * R, z: zPWin1 }
        ], '#fb923c', chStroke, 0.85, dRef + 6.9);
        pushChQuadFixed([
          { x: 0.375 * R, y: wx0, z: zPWin0 },
          { x: 0.375 * R, y: wx1, z: zPWin0 },
          { x: 0.362 * R, y: wx1, z: zPWin1 },
          { x: 0.362 * R, y: wx0, z: zPWin1 }
        ], '#fb923c', chStroke, 0.85, dRef + 6.9);
      }

      // 9. Second-Tier Sweeping Crimson Pagoda Roof (sits at zPentT so penthouse doorway, louvers & red window slits are completely visible)
      const zRoof2T = zPentT + 0.18 * R * H;
      pushPagodaRoof3D(-0.37 * R, 0.37 * R, -0.37 * R, 0.37 * R, -0.16 * R, 0.16 * R, -0.16 * R, 0.16 * R, zPentT, zRoof2T, '#cbd5e1', 8, dRef + 6.8, 0.046 * R);
      pushChBox(-0.15 * R, 0.15 * R, -0.15 * R, 0.15 * R, zRoof2T, zRoof2T + 0.03 * R * H, '#d6d3d1', '#9ca3af', '#6b7280', '#9ca3af', '#6b7280', dRef + 8.0, 0.95);

      // 10. Rooftop Communications & Radar Suite
      // Helper to draw a parabolic satellite dish in 2D/3D screen space
      const pushParabolicDish = (cx, cy, zBase, dishR, faceDirX, faceDirY, dSort) => {
        pushChBox(cx - 0.065 * R, cx + 0.065 * R, cy - 0.065 * R, cy + 0.065 * R, zBase, zBase + 0.08 * R * H, '#d6d3d1', '#a8a29e', '#78716c', '#a8a29e', '#78716c', dSort, 0.9);
        const pCenter = chProj.project(cx, cy, zBase + 0.19 * R * H);
        faces.push({
          pts: [pCenter],
          depth: dSort + 0.5,
          customDraw(ctx2) {
            ctx2.save();
            ctx2.translate(pCenter.x, pCenter.y);
            const tilt = Math.atan2(faceDirY, faceDirX);
            ctx2.rotate(tilt);
            // Outer dish bowl
            ctx2.fillStyle = '#cbd5e1';
            ctx2.strokeStyle = chStroke;
            ctx2.lineWidth = 1.1;
            ctx2.beginPath();
            ctx2.ellipse(0, 0, dishR * 0.76, dishR, 0, 0, Math.PI * 2);
            ctx2.fill();
            ctx2.stroke();
            // Inner concave shaded bowl
            ctx2.fillStyle = '#e2e8f0';
            ctx2.beginPath();
            ctx2.ellipse(dishR * 0.10, 0, dishR * 0.58, dishR * 0.82, 0, 0, Math.PI * 2);
            ctx2.fill();
            ctx2.stroke();
            // Tripodal feed horn struts
            const fx = dishR * 0.52, fy = -dishR * 0.12;
            ctx2.strokeStyle = '#334155';
            ctx2.lineWidth = 1.0;
            for (const [sx, sy] of [[-dishR * 0.2, -dishR * 0.65], [-dishR * 0.2, dishR * 0.65], [-dishR * 0.5, 0]]) {
              ctx2.beginPath();
              ctx2.moveTo(sx, sy);
              ctx2.lineTo(fx, fy);
              ctx2.stroke();
            }
            ctx2.fillStyle = '#475569';
            ctx2.beginPath();
            ctx2.arc(fx, fy, 2.2, 0, Math.PI * 2);
            ctx2.fill();
            ctx2.restore();
          }
        });
      };

      // West terrace parabolic dish (foreground left of penthouse)
      pushParabolicDish(-0.24 * R, 0.52 * R, zPentB, 0.13 * R * RS, -0.8, -0.5, dRef + 9.2);
      // East terrace large parabolic dish (foreground right of penthouse)
      pushParabolicDish(0.52 * R, -0.18 * R, zPentB, 0.16 * R * RS, 0.8, -0.5, dRef + 9.4);
      // Top pagoda small parabolic dish
      pushParabolicDish(-0.09 * R, 0.07 * R, zRoof2T + 0.03 * R * H, 0.095 * R * RS, -0.7, -0.5, dRef + 10.2);

      // NW terrace tall lattice radio mast with twin microwave drums
      const mx = -0.45 * R, my = 0.24 * R, mzB = zPentB, mzT = zRoof2T + 0.22 * R * H;
      const mLevels = 5;
      for (let i = 0; i < mLevels; i++) {
        const s0 = i / mLevels, s1 = (i + 1) / mLevels;
        const z0L = mzB + (mzT - mzB) * s0, z1L = mzB + (mzT - mzB) * s1;
        const w0 = (0.065 - 0.04 * s0) * R, w1 = (0.065 - 0.04 * s1) * R;
        const dM = dRef + 8.5;
        pushChLine({ x: mx - w0, y: my + w0, z: z0L }, { x: mx - w1, y: my + w1, z: z1L }, '#334155', 1.2, dM);
        pushChLine({ x: mx + w0, y: my + w0, z: z0L }, { x: mx + w1, y: my + w1, z: z1L }, '#334155', 1.2, dM);
        pushChLine({ x: mx + w0, y: my - w0, z: z0L }, { x: mx + w1, y: my - w1, z: z1L }, '#334155', 1.2, dM);
        pushChLine({ x: mx - w0, y: my + w0, z: z0L }, { x: mx + w1, y: my + w1, z: z1L }, '#475569', 0.9, dM);
        pushChLine({ x: mx + w0, y: my + w0, z: z0L }, { x: mx - w1, y: my + w1, z: z1L }, '#475569', 0.9, dM);
      }
      // Twin circular microwave drums at top of lattice mast
      const pMastTop = chProj.project(mx, my, mzT);
      faces.push({
        pts: [pMastTop],
        depth: dRef + 10.5,
        customDraw(ctx2) {
          ctx2.save();
          ctx2.strokeStyle = chStroke;
          ctx2.lineWidth = 1.0;
          for (const dx of [-7, 7]) {
            ctx2.fillStyle = '#cbd5e1';
            ctx2.beginPath();
            ctx2.ellipse(pMastTop.x + dx, pMastTop.y - 2, 4.2, 6.2, 0, 0, Math.PI * 2);
            ctx2.fill();
            ctx2.stroke();
          }
          ctx2.beginPath();
          ctx2.moveTo(pMastTop.x, pMastTop.y + 4);
          ctx2.lineTo(pMastTop.x, pMastTop.y - 12);
          ctx2.stroke();
          ctx2.restore();
        }
      });

      // 4 Vertical telemetry whip antennas on top pagoda cap
      for (const [ax, ay, ah] of [[0.02 * R, 0.10 * R, 0.18 * R * H], [0.06 * R, -0.02 * R, 0.28 * R * H], [-0.04 * R, -0.08 * R, 0.22 * R * H], [0.12 * R, 0.06 * R, 0.14 * R * H]]) {
        pushChLine({ x: ax, y: ay, z: zRoof2T + 0.03 * R * H }, { x: ax, y: ay, z: zRoof2T + 0.03 * R * H + ah }, '#e2e8f0', 1.6, dRef + 11.0);
        pushChLine({ x: ax, y: ay, z: zRoof2T + 0.03 * R * H }, { x: ax, y: ay, z: zRoof2T + 0.03 * R * H + ah }, chStroke, 0.8, dRef + 11.1);
      }

      flushFaces(ctx, faces);
      return;
    }

    if (defId === 'CHINA_REACTOR') {
      // High-Fidelity Ligne-Claire 3D Model matching china_reactor.png:
      // 1. Contoured concrete industrial pad hugging the cooling tower, containment dome, manifold & transformer boxes
      // 2. Left (-X, +Y) Tall Hyperboloid Concrete Cooling Tower with base buttress feet, horizontal construction seams, double concrete lip & billowing cel-shaded steam plumes
      // 3. Right (+X, -Y) Spherical Steel Containment Dome with glowing lime-green equatorial core window band (with radiation trefoil ☢), 6 arching external steel buttress ribs, and top circular glowing green oculus
      // 4. Front coolant pipe manifold block with 2 thick elbow pipes into cooling tower, 3 front manifold pipes, sweeping dome collar pipe, right transformer sub-station box with green display, and rear auxiliary chiller boxes
      const R = r * 1.15 * SS;
      const zPad = 0.03 * R * H;
      const cxT = -0.34 * R, cyT = 0.26 * R;   // Left hyperboloid cooling tower
      const cxD = 0.24 * R, cyD = -0.12 * R;   // Right spherical containment dome
      const dRef = chProj.project(0, 0, 0.40 * R * H).depth;

      // Helper for 16-sided smooth cylindrical/conical frustum
      const pushCyl16 = (cx, cy, zB, zT, rB, rT, palette, topCol, dBase, lw = 0.95) => {
        const n = 16;
        const topPts = [];
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI * 2;
          const a1 = ((i + 1) / n) * Math.PI * 2;
          const p0B = { x: cx + Math.cos(a0) * rB, y: cy + Math.sin(a0) * rB, z: zB };
          const p1B = { x: cx + Math.cos(a1) * rB, y: cy + Math.sin(a1) * rB, z: zB };
          const p1T = { x: cx + Math.cos(a1) * rT, y: cy + Math.sin(a1) * rT, z: zT };
          const p0T = { x: cx + Math.cos(a0) * rT, y: cy + Math.sin(a0) * rT, z: zT };
          topPts.push(p0T);
          const am = (a0 + a1) * 0.5;
          const shade = chProj.shadeNormal(Math.cos(am), Math.sin(am), 0.20);
          const col = shade > 1.03 ? palette[0] : (shade > 0.90 ? palette[1] : palette[2]);
          const faceOrder = (Math.cos(am - chAngle) + Math.sin(am - chAngle)) * 0.35;
          pushChQuadFixed([p0B, p1B, p1T, p0T], col, chStroke, lw, dBase + faceOrder);
        }
        if (topCol) {
          pushChQuadFixed(topPts, topCol, chStroke, lw + 0.1, dBase + 0.6);
        }
      };

      // 1. Contoured concrete ground foundation pads
      pushCyl16(cxT, cyT, 0, zPad, 0.52 * R, 0.50 * R, ['#cfc8bd', '#a8a29e', '#78716c'], '#d6d3d1', dRef - 35, 0.9);
      pushCyl16(cxD, cyD, 0, zPad, 0.56 * R, 0.54 * R, ['#cfc8bd', '#a8a29e', '#78716c'], '#d6d3d1', dRef - 34, 0.9);
      pushChBox(-0.18 * R, 0.78 * R, -0.52 * R, 0.62 * R, 0, zPad, '#d6d3d1', '#a8a29e', '#78716c', '#a8a29e', '#78716c', dRef - 36, 0.9);

      // 2. Rear Auxiliary Chiller / Generator Boxes (-X, -Y)
      pushChBox(-0.22 * R, 0.08 * R, -0.50 * R, -0.18 * R, zPad, zPad + 0.42 * R * H, '#cbd5e1', '#94a3b8', '#64748b', '#94a3b8', '#475569', dRef - 24, 1.0);
      pushChBox(0.24 * R, 0.58 * R, -0.58 * R, -0.28 * R, zPad, zPad + 0.36 * R * H, '#cbd5e1', '#94a3b8', '#64748b', '#94a3b8', '#475569', dRef - 23, 1.0);

      // 3. Left Hyperboloid Concrete Cooling Tower (warm cream-tan concrete matching sprite)
      const palTower = ['#dfd7ca', '#c7bdb0', '#9c9284'];
      // Base collar + protruding sloped concrete buttress feet
      pushCyl16(cxT, cyT, zPad, zPad + 0.11 * R * H, 0.46 * R, 0.44 * R, ['#d1c7b8', '#b0a699', '#847b6f'], null, dRef - 18, 1.0);
      for (const footAng of [0.25, 1.15, 2.05, 2.95]) {
        const fx = cxT + Math.cos(footAng) * 0.44 * R, fy = cyT + Math.sin(footAng) * 0.44 * R;
        pushChBox(fx - 0.05 * R, fx + 0.05 * R, fy - 0.05 * R, fy + 0.05 * R, zPad, zPad + 0.12 * R * H, '#dfd7ca', '#b0a699', '#786b5c', '#b0a699', '#786b5c', dRef - 16.5, 0.95);
      }
      // 3-Tier waisted hyperboloid shell
      const zT1 = zPad + 0.11 * R * H, zT2 = zPad + 0.48 * R * H, zT3 = zPad + 0.84 * R * H, zT4 = zPad + 1.18 * R * H;
      pushCyl16(cxT, cyT, zT1, zT2, 0.42 * R, 0.33 * R, palTower, null, dRef - 15, 0.9);
      pushCyl16(cxT, cyT, zT2, zT3, 0.33 * R, 0.29 * R, palTower, null, dRef - 14, 0.9);
      pushCyl16(cxT, cyT, zT3, zT4, 0.29 * R, 0.32 * R, palTower, '#dfd7ca', dRef - 13, 0.9);
      // Top concrete lip & warm tan recessed throat
      pushCyl16(cxT, cyT, zT4, zT4 + 0.05 * R * H, 0.34 * R, 0.34 * R, ['#ebe4d8', '#d1c7b8', '#9c9284'], '#ebe4d8', dRef - 12, 1.05);
      pushCyl16(cxT, cyT, zT4 + 0.05 * R * H, zT4 + 0.055 * R * H, 0.28 * R, 0.28 * R, ['#cbbba8', '#a69683', '#786b5c'], '#cbbba8', dRef - 11.2, 1.0);

      // Billowing Cel-Shaded Steam Plume rising from Cooling Tower throat
      const pThroat = chProj.project(cxT, cyT, zT4 + 0.05 * R * H);
      faces.push({
        pts: [pThroat],
        depth: dRef + 18,
        customDraw(ctx2) {
          ctx2.save();
          const clouds = [
            { dx: -2, dy: -8, rx: 16, ry: 11 },
            { dx: 8, dy: -18, rx: 18, ry: 12 },
            { dx: 20, dy: -30, rx: 16, ry: 11 },
            { dx: 34, dy: -42, rx: 14, ry: 9 },
            { dx: 12, dy: -42, rx: 12, ry: 8 },
            { dx: 38, dy: -60, rx: 9, ry: 6 },
            { dx: 58, dy: -52, rx: 7, ry: 5 }
          ];
          ctx2.fillStyle = '#78716c';
          for (const c of clouds) {
            ctx2.beginPath();
            ctx2.ellipse(pThroat.x + c.dx, pThroat.y + c.dy, c.rx + 1.4, c.ry + 1.4, -0.2, 0, Math.PI * 2);
            ctx2.fill();
          }
          ctx2.fillStyle = '#cfc8bd';
          for (const c of clouds) {
            ctx2.beginPath();
            ctx2.ellipse(pThroat.x + c.dx, pThroat.y + c.dy, c.rx, c.ry, -0.2, 0, Math.PI * 2);
            ctx2.fill();
          }
          ctx2.fillStyle = '#f5f5f4';
          for (const c of clouds) {
            ctx2.beginPath();
            ctx2.ellipse(pThroat.x + c.dx - 1.5, pThroat.y + c.dy - 1.5, c.rx * 0.78, c.ry * 0.76, -0.2, 0, Math.PI * 2);
            ctx2.fill();
          }
          ctx2.restore();
        }
      });

      // 4. Right Spherical Steel Nuclear Containment Dome
      const palDome = ['#d6d3d1', '#a8a29e', '#78716c'];
      const zD1 = zPad + 0.12 * R * H, zD2 = zPad + 0.28 * R * H, zD3 = zPad + 0.54 * R * H;
      // Stepped lower concrete pedestal + cylindrical lower wall
      pushCyl16(cxD, cyD, zPad, zD1, 0.49 * R, 0.48 * R, ['#9ca3af', '#6b7280', '#4b5563'], '#d6d3d1', dRef - 8.0, 1.0);
      pushCyl16(cxD, cyD, zD1, zD2, 0.44 * R, 0.44 * R, palDome, '#a8a29e', dRef - 7.0, 1.0);

      // Glowing Lime-Green Equatorial Core Window Band
      pushCyl16(cxD, cyD, zD2, zD3, 0.42 * R, 0.42 * R, ['#86efac', '#4ade80', '#22c55e'], '#4ade80', dRef - 5.5, 1.0);

      // Hemispherical Steel Upper Dome (3 stacked frustums)
      const zD4 = zPad + 0.70 * R * H, zD5 = zPad + 0.84 * R * H, zD6 = zPad + 0.92 * R * H;
      pushCyl16(cxD, cyD, zD3, zD4, 0.44 * R, 0.37 * R, palDome, null, dRef - 4.0, 0.95);
      pushCyl16(cxD, cyD, zD4, zD5, 0.37 * R, 0.25 * R, palDome, null, dRef - 3.0, 0.95);
      pushCyl16(cxD, cyD, zD5, zD6, 0.25 * R, 0.15 * R, palDome, '#a8a29e', dRef - 2.0, 0.95);

      // Top Circular Oculus Collar & Glowing Lime-Green Core Cap
      pushCyl16(cxD, cyD, zD6, zD6 + 0.05 * R * H, 0.17 * R, 0.16 * R, palDome, '#d6d3d1', dRef - 1.0, 1.05);
      pushCyl16(cxD, cyD, zD6 + 0.05 * R * H, zD6 + 0.058 * R * H, 0.115 * R, 0.115 * R, ['#4ade80', '#22c55e', '#16a34a'], '#86efac', dRef - 0.2, 0.95);

      // 6 Heavy Arching External Steel Buttress Ribs around Containment Dome
      for (let k = 0; k < 6; k++) {
        const rAng = (k / 6) * Math.PI * 2 + 0.24;
        const cA = Math.cos(rAng), sA = Math.sin(rAng);
        const tA = -sA * 0.035 * R, tB = cA * 0.035 * R;
        const fOrder = (Math.cos(rAng - chAngle) + Math.sin(rAng - chAngle));
        if (fOrder < -0.55) continue;
        const dRib = fOrder < -0.10 ? (dRef - 8.5) : (dRef - 0.8 + fOrder * 0.5);
        const rCol = fOrder > 0.2 ? '#d6d3d1' : '#a8a29e';
        const segs = [
          [0.47 * R, zD1, 0.47 * R, zD3],
          [0.47 * R, zD3, 0.39 * R, zD4],
          [0.39 * R, zD4, 0.27 * R, zD5],
          [0.27 * R, zD5, 0.17 * R, zD6 + 0.02 * R * H]
        ];
        for (const [rad0, z0R, rad1, z1R] of segs) {
          pushChQuadFixed([
            { x: cxD + cA * rad0 - tA, y: cyD + sA * rad0 - tB, z: z0R },
            { x: cxD + cA * rad0 + tA, y: cyD + sA * rad0 + tB, z: z0R },
            { x: cxD + cA * rad1 + tA, y: cyD + sA * rad1 + tB, z: z1R },
            { x: cxD + cA * rad1 - tA, y: cyD + sA * rad1 - tB, z: z1R }
          ], rCol, chStroke, 0.95, dRib);
        }
      }

      // Inner bright green core glow + dark radiation trefoil symbol (☢) centered in front bay between the 2 front ribs
      const pCoreFront = chProj.project(cxD + 0.29 * R, cyD + 0.29 * R, (zD2 + zD3) * 0.5);
      faces.push({
        pts: [pCoreFront],
        depth: dRef + 1.2,
        customDraw(ctx2) {
          ctx2.save();
          ctx2.fillStyle = '#bbf7d0';
          ctx2.beginPath();
          ctx2.arc(pCoreFront.x, pCoreFront.y, 7.5, 0, Math.PI * 2);
          ctx2.fill();
          ctx2.fillStyle = '#15803d';
          for (let b = 0; b < 3; b++) {
            const a0 = -Math.PI / 2 + (b * Math.PI * 2) / 3 - 0.38;
            const a1 = a0 + 0.76;
            ctx2.beginPath();
            ctx2.moveTo(pCoreFront.x, pCoreFront.y);
            ctx2.arc(pCoreFront.x, pCoreFront.y, 6.2, a0, a1);
            ctx2.closePath();
            ctx2.fill();
          }
          ctx2.fillStyle = '#86efac';
          ctx2.beginPath();
          ctx2.arc(pCoreFront.x, pCoreFront.y, 2.2, 0, Math.PI * 2);
          ctx2.fill();
          ctx2.fillStyle = '#15803d';
          ctx2.beginPath();
          ctx2.arc(pCoreFront.x, pCoreFront.y, 1.2, 0, Math.PI * 2);
          ctx2.fill();
          ctx2.restore();
        }
      });

      // 5. Low-Profile Front Coolant Manifold Block, Curved Elbow Pipes & Right Transformer Sub-Station
      // Front-Left Manifold Block (positioned between cooling tower & dome front-left so it never overlaps the center window)
      pushChBox(-0.08 * R, 0.18 * R, 0.36 * R, 0.60 * R, zPad, zPad + 0.15 * R * H, '#cbd5e1', '#94a3b8', '#64748b', '#94a3b8', '#475569', dRef + 2.0, 1.05);
      pushChBox(-0.04 * R, 0.14 * R, 0.32 * R, 0.48 * R, zPad + 0.15 * R * H, zPad + 0.22 * R * H, '#e2e8f0', '#cbd5e1', '#64748b', '#cbd5e1', '#475569', dRef + 2.6, 1.0);

      // 2 Thick 90-degree bent elbow pipes from cooling tower wall down into manifold top
      for (const [pyOff, pxElbow] of [[0.34 * R, -0.02 * R], [0.42 * R, 0.05 * R]]) {
        const pTower = { x: -0.14 * R, y: pyOff, z: zPad + 0.34 * R * H };
        const pElbow = { x: pxElbow, y: pyOff, z: zPad + 0.34 * R * H };
        const pManif = { x: pxElbow, y: pyOff, z: zPad + 0.20 * R * H };
        pushChLine(pTower, pElbow, chStroke, 5.8, dRef + 3.0);
        pushChLine(pElbow, pManif, chStroke, 5.8, dRef + 3.0);
        pushChLine(pTower, pElbow, '#94a3b8', 3.6, dRef + 3.1);
        pushChLine(pElbow, pManif, '#94a3b8', 3.6, dRef + 3.1);
      }
      // 3 Parallel bent coolant pipes down the front-left face of manifold
      for (const pxOff of [-0.03 * R, 0.04 * R, 0.11 * R]) {
        pushChLine({ x: pxOff, y: 0.60 * R, z: zPad + 0.12 * R * H }, { x: pxOff, y: 0.67 * R, z: zPad + 0.02 * R * H }, chStroke, 4.4, dRef + 3.4);
        pushChLine({ x: pxOff, y: 0.60 * R, z: zPad + 0.12 * R * H }, { x: pxOff, y: 0.67 * R, z: zPad + 0.02 * R * H }, '#94a3b8', 2.6, dRef + 3.5);
      }
      // Thick sweeping pipe wrapping around lower dome collar from front manifold to right transformer box
      const pPipe0 = { x: 0.16 * R, y: 0.44 * R, z: zPad + 0.07 * R * H };
      const pPipeM = { x: 0.42 * R, y: 0.34 * R, z: zPad + 0.07 * R * H };
      const pPipe1 = { x: 0.60 * R, y: 0.16 * R, z: zPad + 0.07 * R * H };
      pushChLine(pPipe0, pPipeM, chStroke, 7.2, dRef + 3.8);
      pushChLine(pPipeM, pPipe1, chStroke, 7.2, dRef + 3.8);
      pushChLine(pPipe0, pPipeM, '#64748b', 4.8, dRef + 3.9);
      pushChLine(pPipeM, pPipe1, '#64748b', 4.8, dRef + 3.9);

      // Right Transformer / Control Box (positioned to the front-right of the dome perimeter so the central green core window & ☢ trefoil are 100% unobstructed)
      pushChBox(0.56 * R, 0.80 * R, -0.02 * R, 0.24 * R, 0, zPad + 0.20 * R * H, '#cbd5e1', '#94a3b8', '#64748b', '#94a3b8', '#475569', dRef + 4.5, 1.05);
      pushChBox(0.59 * R, 0.75 * R, 0.02 * R, 0.18 * R, zPad + 0.20 * R * H, zPad + 0.24 * R * H, '#e2e8f0', '#cbd5e1', '#64748b', '#cbd5e1', '#475569', dRef + 4.8, 0.95);
      // Glowing green monitor screen on SE (+X) face of transformer box
      pushChQuadFixed([
        { x: 0.805 * R, y: 0.06 * R, z: zPad + 0.08 * R * H },
        { x: 0.805 * R, y: 0.18 * R, z: zPad + 0.08 * R * H },
        { x: 0.805 * R, y: 0.18 * R, z: zPad + 0.16 * R * H },
        { x: 0.805 * R, y: 0.06 * R, z: zPad + 0.16 * R * H }
      ], '#4ade80', chStroke, 0.85, dRef + 5.2);

      flushFaces(ctx, faces);
      return;
    }

    if (defId === 'CHINA_SUPPLY_CENTER') {
      // High-Fidelity Ligne-Claire 3D Model matching china_supply_center.png:
      // 1. Back-left (-X / NW) long rectangular warehouse with sweeping crimson gable roof, upturned red gable coping, SW (+Y) loading dock with gold-bordered red star, and 3 glowing green clerestory windows between concrete pilasters
      // 2. Crimson PLA Supply Truck (red cab + windshield + headlights + red cargo box + visible black wheels) backing up the SW concrete ramp into the warehouse loading dock
      // 3. Front-right (+X / SE) elevated concrete sorting platform with grid slab seams & 2 vertical steel ladders on SE wall
      // 4. Central dark-grey roller conveyor belt spanned by a tall burnt-orange cross-braced H-frame overhead gantry crane with NE operator cab (blue windows) & suspended 2-claw spreader bar
      // 5. Stacked olive-green military crates along SW ground edge & platform back-left, tan/red crates on platform SE edge, and 2 strapped cargo pallets (olive boxes & crimson tarp) on SE ground
      const R = r * 1.18 * SS;
      const zPad = 0.02 * R * H;
      const dRef = chProj.project(0, 0, 0.35 * R * H).depth;

      // 1. Back-Left (-X) Logistics Warehouse (x = -0.88R..-0.22R, y = -0.80R..+0.64R)
      const wx0 = -0.88 * R, wx1 = -0.22 * R, wy0 = -0.80 * R, wy1 = 0.64 * R;
      const zWhWall = 0.62 * R * H, zWhPeak = 0.90 * R * H;
      pushChBox(wx0, wx1, wy0, wy1, zPad, zWhWall, null, '#c7c2ba', '#9ca3af', '#b4afa8', '#78716c', dRef - 26, 1.1);

      // SW (+Y) & NE (-Y) Triangular Gable Pediment End Walls
      const wxMid = (wx0 + wx1) * 0.5;
      pushChQuadFixed([
        { x: wx0, y: wy1, z: zWhWall },
        { x: wx1, y: wy1, z: zWhWall },
        { x: wxMid, y: wy1, z: zWhPeak }
      ], '#c7c2ba', chStroke, 1.05, dRef - 24.5);
      pushChQuadFixed([
        { x: wx0, y: wy0, z: zWhWall },
        { x: wx1, y: wy0, z: zWhWall },
        { x: wxMid, y: wy0, z: zWhPeak }
      ], '#78716c', chStroke, 1.0, dRef - 27.0);

      // Gold-bordered crimson star on SW (+Y) gable pediment
      pushChStar3D(
        { x: wxMid, y: wy1 + 0.01 * R, z: zWhWall + 0.13 * R * H },
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
        0.095 * R,
        dRef - 20.2
      );

      // Sweeping Crimson Ribbed Gable Roof (eave ends cleanly at zWhWall + 0.01*R*H so SE green clerestory windows below are 100% visible)
      const rx0 = wx0 - 0.05 * R, rx1 = wx1 + 0.02 * R, ry0 = wy0 - 0.04 * R, ry1 = wy1 + 0.04 * R;
      const zEaveWh = zWhWall + 0.01 * R * H;
      // NW roof slope
      pushChQuadFixed([
        { x: rx0, y: ry0, z: zEaveWh },
        { x: rx0, y: ry1, z: zEaveWh },
        { x: wxMid, y: ry1, z: zWhPeak },
        { x: wxMid, y: ry0, z: zWhPeak }
      ], '#b91c1c', chStroke, 1.05, dRef - 23.0);
      // SE roof slope (broadly visible)
      pushChQuadFixed([
        { x: wxMid, y: ry0, z: zWhPeak },
        { x: wxMid, y: ry1, z: zWhPeak },
        { x: rx1, y: ry1, z: zEaveWh },
        { x: rx1, y: ry0, z: zEaveWh }
      ], '#991b1b', chStroke, 1.05, dRef - 22.5);
      // Tile rib lines along SE and NW roof slopes
      for (let i = 1; i < 12; i++) {
        const sy = ry0 + ((ry1 - ry0) * i) / 12;
        pushChLine({ x: wxMid, y: sy, z: zWhPeak }, { x: rx1, y: sy, z: zEaveWh }, '#450a0a', 0.85, dRef - 22.2);
        pushChLine({ x: wxMid, y: sy, z: zWhPeak }, { x: rx0, y: sy, z: zEaveWh }, '#7f1d1d', 0.85, dRef - 22.8);
      }
      // Raised crimson ridge beam + upturned SW/NE gable coping fascia & peak finials
      pushChBox(wxMid - 0.028 * R, wxMid + 0.028 * R, ry0, ry1, zWhPeak - 0.01 * R * H, zWhPeak + 0.04 * R * H, '#ef4444', '#dc2626', '#991b1b', '#dc2626', '#7f1d1d', dRef - 21.8, 0.95);
      for (const fy of [ry0, ry1]) {
        pushChBox(wxMid - 0.032 * R, wxMid + 0.032 * R, fy - 0.02 * R, fy + 0.02 * R, zWhPeak, zWhPeak + 0.08 * R * H, '#ef4444', '#dc2626', '#991b1b', '#dc2626', '#7f1d1d', dRef - 21.6, 0.9);
      }
      pushChLine({ x: rx0 - 0.02 * R, y: ry1, z: zEaveWh }, { x: wxMid, y: ry1, z: zWhPeak + 0.02 * R * H }, '#ef4444', 3.0, dRef - 21.5);
      pushChLine({ x: rx1 + 0.02 * R, y: ry1, z: zEaveWh }, { x: wxMid, y: ry1, z: zWhPeak + 0.02 * R * H }, '#dc2626', 3.0, dRef - 21.5);

      // 3 Glowing mint-green clerestory windows + vertical concrete pilasters along SE (x = wx1) warehouse wall (high on wall so visible above gantry girder)
      for (const pyPil of [-0.74 * R, -0.30 * R, 0.14 * R, 0.56 * R]) {
        pushChBox(wx1 - 0.01 * R, wx1 + 0.025 * R, pyPil - 0.025 * R, pyPil + 0.025 * R, zPad + 0.22 * R * H, zWhWall, null, '#b4afa8', '#8c857b', '#b4afa8', '#78716c', dRef - 21.3, 0.85);
      }
      for (const py of [-0.52 * R, -0.08 * R, 0.35 * R]) {
        pushChQuadFixed([
          { x: wx1 + 0.012 * R, y: py - 0.13 * R, z: zWhWall - 0.14 * R * H },
          { x: wx1 + 0.012 * R, y: py + 0.13 * R, z: zWhWall - 0.14 * R * H },
          { x: wx1 + 0.012 * R, y: py + 0.13 * R, z: zWhWall - 0.03 * R * H },
          { x: wx1 + 0.012 * R, y: py - 0.13 * R, z: zWhWall - 0.03 * R * H }
        ], '#86efac', chStroke, 0.9, dRef - 21.1);
      }

      // SW (+Y) Recessed Truck Loading Dock Door & Concrete Ramp
      pushChQuadFixed([
        { x: wxMid - 0.19 * R, y: wy1 + 0.004 * R, z: zPad + 0.04 * R * H },
        { x: wxMid + 0.19 * R, y: wy1 + 0.004 * R, z: zPad + 0.04 * R * H },
        { x: wxMid + 0.19 * R, y: wy1 + 0.004 * R, z: zWhWall - 0.06 * R * H },
        { x: wxMid - 0.19 * R, y: wy1 + 0.004 * R, z: zWhWall - 0.06 * R * H }
      ], '#a8a29e', chStroke, 1.0, dRef - 20.6);
      pushChQuadFixed([
        { x: wxMid - 0.16 * R, y: wy1 + 0.006 * R, z: zPad + 0.04 * R * H },
        { x: wxMid + 0.16 * R, y: wy1 + 0.006 * R, z: zPad + 0.04 * R * H },
        { x: wxMid + 0.16 * R, y: wy1 + 0.006 * R, z: zWhWall - 0.10 * R * H },
        { x: wxMid - 0.16 * R, y: wy1 + 0.006 * R, z: zPad + 0.04 * R * H }
      ].slice(0, 0).concat([
        { x: wxMid - 0.16 * R, y: wy1 + 0.006 * R, z: zPad + 0.04 * R * H },
        { x: wxMid + 0.16 * R, y: wy1 + 0.006 * R, z: zPad + 0.04 * R * H },
        { x: wxMid + 0.16 * R, y: wy1 + 0.006 * R, z: zWhWall - 0.10 * R * H },
        { x: wxMid - 0.16 * R, y: wy1 + 0.006 * R, z: zWhWall - 0.10 * R * H }
      ]), '#57534e', chStroke, 0.95, dRef - 20.5);
      // Sloped concrete truck ramp
      pushChQuadFixed([
        { x: wxMid - 0.18 * R, y: wy1, z: zPad + 0.08 * R * H },
        { x: wxMid + 0.18 * R, y: wy1, z: zPad + 0.08 * R * H },
        { x: wxMid + 0.18 * R, y: wy1 + 0.34 * R, z: 0 },
        { x: wxMid - 0.18 * R, y: wy1 + 0.34 * R, z: 0 }
      ], '#a8a29e', chStroke, 0.95, dRef - 20.0);

      // 2. Crimson PLA Supply Truck Backing into SW Loading Dock
      const tx0 = wxMid - 0.13 * R, tx1 = wxMid + 0.13 * R;
      // Dark truck chassis
      pushChBox(tx0 + 0.01 * R, tx1 - 0.01 * R, wy1 - 0.02 * R, wy1 + 0.44 * R, zPad + 0.04 * R * H, zPad + 0.11 * R * H, '#1e293b', '#1e293b', '#0f172a', '#1e293b', '#0f172a', dRef - 18.5, 0.9);
      // Crimson cargo bed (backed into dock)
      pushChBox(tx0, tx1, wy1 - 0.04 * R, wy1 + 0.28 * R, zPad + 0.11 * R * H, zPad + 0.35 * R * H, '#dc2626', '#b91c1c', '#991b1b', '#dc2626', '#7f1d1d', dRef - 18.0, 1.0);
      // Crimson cab & windshield at front (+Y) of truck
      pushChBox(tx0 + 0.01 * R, tx1 - 0.01 * R, wy1 + 0.29 * R, wy1 + 0.45 * R, zPad + 0.10 * R * H, zPad + 0.29 * R * H, '#ef4444', '#dc2626', '#991b1b', '#dc2626', '#7f1d1d', dRef - 17.2, 1.0);
      pushChQuadFixed([
        { x: tx0 + 0.025 * R, y: wy1 + 0.453 * R, z: zPad + 0.18 * R * H },
        { x: tx1 - 0.025 * R, y: wy1 + 0.453 * R, z: zPad + 0.18 * R * H },
        { x: tx1 - 0.025 * R, y: wy1 + 0.453 * R, z: zPad + 0.26 * R * H },
        { x: tx0 + 0.025 * R, y: wy1 + 0.453 * R, z: zPad + 0.26 * R * H }
      ], '#475569', chStroke, 0.85, dRef - 16.8);
      // Silver front bumper & 3 visible black wheels along SE side of truck
      pushChLine({ x: tx0 + 0.02 * R, y: wy1 + 0.456 * R, z: zPad + 0.08 * R * H }, { x: tx1 - 0.02 * R, y: wy1 + 0.456 * R, z: zPad + 0.08 * R * H }, '#cbd5e1', 2.2, dRef - 16.6);
      for (const wyW of [wy1 + 0.05 * R, wy1 + 0.18 * R, wy1 + 0.36 * R]) {
        const pW = chProj.project(tx1 + 0.005 * R, wyW, zPad + 0.06 * R * H);
        faces.push({
          pts: [pW],
          depth: dRef - 16.5,
          customDraw(ctx2) {
            ctx2.save();
            ctx2.fillStyle = '#0f172a';
            ctx2.strokeStyle = chStroke;
            ctx2.lineWidth = 0.9;
            ctx2.beginPath();
            ctx2.ellipse(pW.x, pW.y, 3.6, 4.8, 0.25, 0, Math.PI * 2);
            ctx2.fill();
            ctx2.stroke();
            ctx2.fillStyle = '#64748b';
            ctx2.beginPath();
            ctx2.arc(pW.x, pW.y, 1.5, 0, Math.PI * 2);
            ctx2.fill();
            ctx2.restore();
          }
        });
      }

      // 3. Front-Right (+X / SE) Elevated Concrete Sorting Platform (x = -0.22R..+0.80R, y = -0.78R..+0.64R)
      const px0 = -0.22 * R, px1 = 0.80 * R, py0 = -0.78 * R, py1 = 0.64 * R;
      const zPlat = 0.22 * R * H;
      pushChBox(px0, px1, py0, py1, 0, zPlat, '#d6d3d1', '#9ca3af', '#78716c', '#9ca3af', '#6b655e', dRef - 15.0, 1.1);
      // Raised perimeter concrete curb around platform top
      pushChLine({ x: px0, y: py1, z: zPlat }, { x: px1, y: py1, z: zPlat }, '#78716c', 1.4, dRef - 14.2);
      pushChLine({ x: px1, y: py0, z: zPlat }, { x: px1, y: py1, z: zPlat }, '#57534e', 1.4, dRef - 14.2);
      // Concrete slab seam grid on platform deck
      for (const gx of [0.12 * R, 0.46 * R]) {
        pushChLine({ x: gx, y: py0, z: zPlat }, { x: gx, y: py1, z: zPlat }, '#a8a29e', 0.75, dRef - 14.1);
      }
      for (const gy of [-0.42 * R, -0.06 * R, 0.30 * R]) {
        pushChLine({ x: px0, y: gy, z: zPlat }, { x: px1, y: gy, z: zPlat }, '#a8a29e', 0.75, dRef - 14.1);
      }
      // 2 Vertical black steel access ladders on SE (x = px1) platform wall
      for (const ly of [0.42 * R, -0.56 * R]) {
        pushChLine({ x: px1 + 0.01 * R, y: ly - 0.035 * R, z: 0 }, { x: px1 + 0.01 * R, y: ly - 0.035 * R, z: zPlat + 0.02 * R * H }, chStroke, 1.3, dRef - 13.5);
        pushChLine({ x: px1 + 0.01 * R, y: ly + 0.035 * R, z: 0 }, { x: px1 + 0.01 * R, y: ly + 0.035 * R, z: zPlat + 0.02 * R * H }, chStroke, 1.3, dRef - 13.5);
        for (let rStep = 1; rStep <= 4; rStep++) {
          const zr = (zPlat * rStep) / 4.5;
          pushChLine({ x: px1 + 0.01 * R, y: ly - 0.035 * R, z: zr }, { x: px1 + 0.01 * R, y: ly + 0.035 * R, z: zr }, chStroke, 1.0, dRef - 13.4);
        }
      }

      // 4. Central Raised Roller Conveyor Belt (x = 0.11R..0.27R, y = -0.56R..+0.44R)
      const cx0 = 0.11 * R, cx1 = 0.27 * R, cy0 = -0.56 * R, cy1 = 0.44 * R;
      const zConvB = zPlat + 0.08 * R * H, zConvT = zPlat + 0.14 * R * H;
      for (const ly of [-0.50 * R, -0.06 * R, 0.38 * R]) {
        pushChBox(cx0 + 0.01 * R, cx0 + 0.04 * R, ly - 0.02 * R, ly + 0.02 * R, zPlat, zConvB, null, '#475569', '#334155', '#475569', '#334155', dRef - 10.5, 0.85);
        pushChBox(cx1 - 0.04 * R, cx1 - 0.01 * R, ly - 0.02 * R, ly + 0.02 * R, zPlat, zConvB, null, '#475569', '#334155', '#475569', '#334155', dRef - 10.5, 0.85);
      }
      pushChBox(cx0, cx1, cy0, cy1, zConvB, zConvT, '#64748b', '#94a3b8', '#475569', '#94a3b8', '#334155', dRef - 10.0, 1.0);
      for (let i = 1; i < 10; i++) {
        const ry = cy0 + ((cy1 - cy0) * i) / 10;
        pushChLine({ x: cx0, y: ry, z: zConvT }, { x: cx1, y: ry, z: zConvT }, '#1e293b', 0.9, dRef - 9.2);
      }

      // 5. Sleek Burnt-Orange Cross-Braced Overhead Gantry Crane + NE Operator Cab
      const zGantryB = zPlat + 0.05 * R * H, zGantryT = zPlat + 0.54 * R * H;
      for (const [gy, dLeg] of [[-0.64 * R, dRef - 8.0], [0.48 * R, dRef + 2.0]]) {
        // Concrete base plinth
        pushChBox(0.06 * R, 0.32 * R, gy - 0.06 * R, gy + 0.06 * R, zPlat, zGantryB, '#cbd5e1', '#9ca3af', '#6b7280', '#9ca3af', '#6b7280', dLeg - 0.5, 0.95);
        // Left & right burnt-orange vertical steel columns
        pushChBox(0.09 * R, 0.14 * R, gy - 0.032 * R, gy + 0.032 * R, zGantryB, zGantryT, '#ea580c', '#c2410c', '#9a3412', '#c2410c', '#7c2d12', dLeg, 0.95);
        pushChBox(0.24 * R, 0.29 * R, gy - 0.032 * R, gy + 0.032 * R, zGantryB, zGantryT, '#ea580c', '#c2410c', '#9a3412', '#c2410c', '#7c2d12', dLeg + 0.2, 0.95);
        // Diagonal steel X-bracing between columns
        for (let b = 0; b < 3; b++) {
          const zb0 = zGantryB + ((zGantryT - zGantryB) * b) / 3;
          const zb1 = zGantryB + ((zGantryT - zGantryB) * (b + 1)) / 3;
          pushChLine({ x: 0.14 * R, y: gy, z: zb0 }, { x: 0.24 * R, y: gy, z: zb1 }, '#7c2d12', 1.25, dLeg + 0.1);
          pushChLine({ x: 0.24 * R, y: gy, z: zb0 }, { x: 0.14 * R, y: gy, z: zb1 }, '#7c2d12', 1.25, dLeg + 0.1);
        }
      }
      // Sleek narrow horizontal double-girder bridge beam spanning between the 2 towers
      const zGirderT = zGantryT + 0.055 * R * H;
      pushChBox(0.11 * R, 0.27 * R, -0.70 * R, 0.54 * R, zGantryT, zGirderT, '#d97706', '#c2410c', '#9a3412', '#b45309', '#7c2d12', dRef + 6.0, 1.0);
      // I-beam web line along SE face & yellow end bumpers on SW end of bridge girder
      pushChLine({ x: 0.272 * R, y: -0.69 * R, z: zGantryT + 0.028 * R * H }, { x: 0.272 * R, y: 0.53 * R, z: zGantryT + 0.028 * R * H }, '#451a03', 0.95, dRef + 6.6);
      pushChQuadFixed([
        { x: 0.11 * R, y: 0.543 * R, z: zGantryT },
        { x: 0.27 * R, y: 0.543 * R, z: zGantryT },
        { x: 0.27 * R, y: 0.543 * R, z: zGirderT },
        { x: 0.11 * R, y: 0.543 * R, z: zGirderT }
      ], '#eab308', chStroke, 0.85, dRef + 6.7);

      // Central hoist trolley + cable + 2-claw orange spreader bar over conveyor
      pushChBox(0.13 * R, 0.25 * R, -0.14 * R, 0.02 * R, zGantryT - 0.05 * R * H, zGantryT, '#64748b', '#64748b', '#334155', '#64748b', '#334155', dRef + 5.2, 0.95);
      pushChLine({ x: 0.19 * R, y: -0.06 * R, z: zGantryT - 0.05 * R * H }, { x: 0.19 * R, y: -0.06 * R, z: zConvT + 0.18 * R * H }, chStroke, 1.5, dRef + 5.3);
      pushChBox(0.15 * R, 0.23 * R, -0.22 * R, 0.10 * R, zConvT + 0.14 * R * H, zConvT + 0.18 * R * H, '#ea580c', '#c2410c', '#9a3412', '#c2410c', '#9a3412', dRef + 5.4, 0.9);
      for (const cyClaw of [-0.20 * R, 0.08 * R]) {
        pushChBox(0.16 * R, 0.22 * R, cyClaw - 0.02 * R, cyClaw + 0.02 * R, zConvT + 0.06 * R * H, zConvT + 0.14 * R * H, null, '#c2410c', '#9a3412', '#c2410c', '#7c2d12', dRef + 5.5, 0.85);
      }

      // NE Crane Operator Cab perched on top of NE end of bridge girder
      const zCabB = zGirderT, zCabT = zCabB + 0.14 * R * H;
      pushChBox(0.09 * R, 0.29 * R, -0.68 * R, -0.46 * R, zCabB, zCabT, '#dc2626', '#cbd5e1', '#94a3b8', '#cbd5e1', '#64748b', dRef + 7.5, 1.0);
      // Blue glass windows on SW (+Y) and SE (+X) faces of crane cab
      pushChQuadFixed([
        { x: 0.115 * R, y: -0.458 * R, z: zCabB + 0.035 * R * H },
        { x: 0.265 * R, y: -0.458 * R, z: zCabB + 0.035 * R * H },
        { x: 0.265 * R, y: -0.458 * R, z: zCabT - 0.025 * R * H },
        { x: 0.115 * R, y: -0.458 * R, z: zCabT - 0.025 * R * H }
      ], '#7dd3fc', chStroke, 0.8, dRef + 8.2);
      pushChQuadFixed([
        { x: 0.292 * R, y: -0.65 * R, z: zCabB + 0.035 * R * H },
        { x: 0.292 * R, y: -0.49 * R, z: zCabB + 0.035 * R * H },
        { x: 0.292 * R, y: -0.49 * R, z: zCabT - 0.025 * R * H },
        { x: 0.292 * R, y: -0.65 * R, z: zCabT - 0.025 * R * H }
      ], '#38bdf8', chStroke, 0.8, dRef + 8.2);

      // 6. Cargo Crates & Strapped Pallets
      // Back-left platform olive crates (against warehouse wall)
      pushChBox(-0.20 * R, -0.04 * R, 0.34 * R, 0.58 * R, zPlat, zPlat + 0.14 * R * H, '#788652', '#5c693d', '#46512d', '#5c693d', '#353d22', dRef - 11.5, 0.9);
      pushChBox(-0.20 * R, -0.06 * R, 0.38 * R, 0.54 * R, zPlat + 0.14 * R * H, zPlat + 0.26 * R * H, '#788652', '#5c693d', '#46512d', '#5c693d', '#353d22', dRef - 11.0, 0.9);
      // SE platform edge crates (2 tan wooden + 1 red)
      pushChBox(0.46 * R, 0.62 * R, 0.02 * R, 0.18 * R, zPlat, zPlat + 0.13 * R * H, '#d97706', '#b45309', '#92400e', '#b45309', '#78350f', dRef - 6.0, 0.9);
      pushChBox(0.46 * R, 0.62 * R, -0.16 * R, 0.00 * R, zPlat, zPlat + 0.13 * R * H, '#d97706', '#b45309', '#92400e', '#b45309', '#78350f', dRef - 6.5, 0.9);
      pushChBox(0.46 * R, 0.62 * R, -0.34 * R, -0.18 * R, zPlat, zPlat + 0.13 * R * H, '#ef4444', '#dc2626', '#991b1b', '#dc2626', '#7f1d1d', dRef - 7.0, 0.9);

      // SW ground edge stacked olive-green military crates (in front of platform SW wall)
      for (const [cxB, cyB, czH, dCr] of [
        [-0.22 * R, 0.66 * R, 0.15 * R * H, dRef + 3.0],
        [-0.04 * R, 0.66 * R, 0.15 * R * H, dRef + 3.5],
        [ 0.14 * R, 0.66 * R, 0.16 * R * H, dRef + 4.0],
        [ 0.32 * R, 0.66 * R, 0.16 * R * H, dRef + 4.5],
        [ 0.14 * R, 0.82 * R, 0.14 * R * H, dRef + 5.0],
        [ 0.32 * R, 0.82 * R, 0.24 * R * H, dRef + 5.5]
      ]) {
        pushChBox(cxB, cxB + 0.16 * R, cyB, cyB + 0.15 * R, 0, czH, '#788652', '#5c693d', '#46512d', '#5c693d', '#353d22', dCr, 0.9);
      }

      // SE ground edge 2 large wooden cargo pallets with tiedown straps (front olive boxes + rear crimson tarp)
      // Front pallet (olive-grey strapped boxes)
      pushChBox(0.82 * R, 1.10 * R, 0.06 * R, 0.36 * R, 0, 0.04 * R * H, '#d97706', '#b45309', '#78350f', '#b45309', '#78350f', dRef + 4.2, 0.85);
      pushChBox(0.84 * R, 1.08 * R, 0.08 * R, 0.34 * R, 0.04 * R * H, 0.22 * R * H, '#a3b19b', '#84917a', '#5c6654', '#84917a', '#4a5244', dRef + 4.6, 0.95);
      pushChLine({ x: 0.96 * R, y: 0.08 * R, z: 0.222 * R * H }, { x: 0.96 * R, y: 0.34 * R, z: 0.222 * R * H }, '#26201b', 1.0, dRef + 5.4);
      pushChLine({ x: 0.84 * R, y: 0.21 * R, z: 0.222 * R * H }, { x: 1.08 * R, y: 0.21 * R, z: 0.222 * R * H }, '#26201b', 1.0, dRef + 5.4);
      // Rear pallet (crimson tarp-covered cargo with cross straps)
      pushChBox(0.82 * R, 1.10 * R, -0.44 * R, -0.14 * R, 0, 0.04 * R * H, '#d97706', '#b45309', '#78350f', '#b45309', '#78350f', dRef + 2.2, 0.85);
      pushChBox(0.84 * R, 1.08 * R, -0.42 * R, -0.16 * R, 0.04 * R * H, 0.22 * R * H, '#ef4444', '#dc2626', '#991b1b', '#dc2626', '#7f1d1d', dRef + 2.6, 0.95);
      pushChLine({ x: 0.96 * R, y: -0.42 * R, z: 0.222 * R * H }, { x: 0.96 * R, y: -0.16 * R, z: 0.222 * R * H }, '#450a0a', 1.0, dRef + 3.4);
      pushChLine({ x: 0.84 * R, y: -0.29 * R, z: 0.222 * R * H }, { x: 1.08 * R, y: -0.29 * R, z: 0.222 * R * H }, '#450a0a', 1.0, dRef + 3.4);

      flushFaces(ctx, faces);
      return;
    }

    if (defId === 'CHINA_BARRACKS') {
      // High-Fidelity Ligne-Claire 3D Model matching china_barracks.png:
      // 1. Fortified rectangular PLA compound with broad open grey concrete parade courtyard & outer apron
      // 2. Back-right (-Y / NE) Compact Main Troop Barracks Hall (hy0 = -0.76R .. hy1 = -0.20R) with battered corner pilasters, crimson base trim, protruding entrance porch with red eave, and sweeping crimson hip-and-gable pagoda roof with horned ridge beam
      // 3. Sloped concrete perimeter curtain walls with crimson base trim, 3 SE exterior buttress pilasters, and 2 olive crates inside NW wall
      // 4. SW (+Y) Central Concrete Gatehouse with half-open steel-barred gate, gold-bordered crimson star on upper stone fascia, and 2 flanking vertical crimson swallowtail banners with gold stars
      // 5. Three Corner Bastion Watchtowers: West & South towers with sandbag collars, enclosed guard pillboxes & twin yellow searchlights; East tower with sandbagged emplacement pit
      const R = r * 1.16 * SS;
      const zPad = 0.03 * R * H;
      const dRef = chProj.project(0, 0, 0.35 * R * H).depth;

      // 1. Compound Ground Courtyard & Apron
      pushChBox(-0.96 * R, 0.96 * R, -0.96 * R, 0.96 * R, 0, zPad, '#8c857b', '#a8a29e', '#78716c', '#a8a29e', '#78716c', dRef - 40, 0.95);

      // 2. Back-Right (-Y / NE) Main PLA Troop Barracks Hall (compact along Y: x = -0.52R..+0.42R, y = -0.76R..-0.20R so the central parade courtyard and East bastion are wide open!)
      const hx0 = -0.52 * R, hx1 = 0.42 * R, hy0 = -0.76 * R, hy1 = -0.20 * R;
      const hMidX = (hx0 + hx1) * 0.5;
      const zHallT = zPad + 0.44 * R * H;
      // Crimson base stripe + grey concrete hall walls
      pushChBox(hx0, hx1, hy0, hy1, zPad, zPad + 0.07 * R * H, null, '#b91c1c', '#991b1b', '#b91c1c', '#7f1d1d', dRef - 28, 1.0);
      pushChBox(hx0, hx1, hy0, hy1, zPad + 0.07 * R * H, zHallT, '#9ca3af', '#c7c2ba', '#9ca3af', '#c7c2ba', '#78716c', dRef - 27, 1.1);
      // 3 Visible battered corner pilasters on main hall (SW-left, SW-right, NE-right)
      for (const [px, py] of [[hx0 + 0.05 * R, hy1 - 0.04 * R], [hx1 - 0.05 * R, hy1 - 0.04 * R], [hx1 - 0.05 * R, hy0 + 0.05 * R]]) {
        pushChFrustum(px - 0.06 * R, px + 0.06 * R, py - 0.06 * R, py + 0.06 * R, px - 0.042 * R, px + 0.042 * R, py - 0.042 * R, py + 0.042 * R, zPad, zHallT, null, '#d6d3d1', '#8c857b', '#d6d3d1', '#78716c', dRef - 25.5, 0.95);
      }
      // Hall windows on SW (+Y) and SE (+X) faces
      for (const wx of [hMidX - 0.27 * R, hMidX + 0.27 * R]) {
        pushChQuadFixed([
          { x: wx - 0.07 * R, y: hy1 + 0.005 * R, z: zPad + 0.16 * R * H },
          { x: wx + 0.07 * R, y: hy1 + 0.005 * R, z: zPad + 0.16 * R * H },
          { x: wx + 0.07 * R, y: hy1 + 0.005 * R, z: zPad + 0.34 * R * H },
          { x: wx - 0.07 * R, y: hy1 + 0.005 * R, z: zPad + 0.34 * R * H }
        ], '#64748b', chStroke, 0.85, dRef - 25.0);
      }
      for (const wy of [-0.60 * R, -0.35 * R]) {
        pushChQuadFixed([
          { x: hx1 + 0.005 * R, y: wy - 0.08 * R, z: zPad + 0.22 * R * H },
          { x: hx1 + 0.005 * R, y: wy + 0.08 * R, z: zPad + 0.22 * R * H },
          { x: hx1 + 0.005 * R, y: wy + 0.08 * R, z: zPad + 0.35 * R * H },
          { x: hx1 + 0.005 * R, y: wy - 0.08 * R, z: zPad + 0.35 * R * H }
        ], '#64748b', chStroke, 0.85, dRef - 25.0);
      }

      // Protruding SW (+Y) Entrance Porch + Crimson Porch Roof Eave
      pushChBox(hMidX - 0.15 * R, hMidX + 0.15 * R, hy1, hy1 + 0.15 * R, zPad, zPad + 0.27 * R * H, '#9ca3af', '#c7c2ba', '#8c857b', '#c7c2ba', '#78716c', dRef - 23.0, 1.0);
      pushChQuadFixed([
        { x: hMidX - 0.085 * R, y: hy1 + 0.155 * R, z: zPad },
        { x: hMidX + 0.085 * R, y: hy1 + 0.155 * R, z: zPad },
        { x: hMidX + 0.085 * R, y: hy1 + 0.155 * R, z: zPad + 0.20 * R * H },
        { x: hMidX - 0.085 * R, y: hy1 + 0.155 * R, z: zPad + 0.20 * R * H }
      ], '#475569', chStroke, 0.9, dRef - 22.5);
      pushPagodaRoof3D(hMidX - 0.19 * R, hMidX + 0.19 * R, hy1 - 0.02 * R, hy1 + 0.18 * R, hMidX - 0.12 * R, hMidX + 0.12 * R, hy1, hy1 + 0.10 * R, zPad + 0.27 * R * H, zPad + 0.35 * R * H, '#991b1b', 5, dRef - 21.5, 0.026 * R);

      // Sweeping Crimson Hip-and-Gable Pagoda Roof over Main Hall
      const zHallRoofT = zHallT + 0.21 * R * H;
      pushPagodaRoof3D(hx0 - 0.04 * R, hx1 + 0.04 * R, hy0 - 0.04 * R, hy1 + 0.04 * R, hMidX - 0.27 * R, hMidX + 0.27 * R, -0.52 * R, -0.44 * R, zHallT - 0.01 * R * H, zHallRoofT, '#b91c1c', 11, dRef - 18.0, 0.05 * R);
      // Raised main crimson ridge beam with upturned horn finials at both ends
      pushChBox(hMidX - 0.29 * R, hMidX + 0.29 * R, -0.51 * R, -0.45 * R, zHallRoofT - 0.01 * R * H, zHallRoofT + 0.04 * R * H, '#ef4444', '#dc2626', '#991b1b', '#dc2626', '#7f1d1d', dRef - 16.5, 1.0);
      for (const fx of [hMidX - 0.29 * R, hMidX + 0.29 * R]) {
        pushChBox(fx - 0.022 * R, fx + 0.022 * R, -0.52 * R, -0.44 * R, zHallRoofT, zHallRoofT + 0.08 * R * H, '#ef4444', '#dc2626', '#991b1b', '#dc2626', '#7f1d1d', dRef - 16.0, 0.95);
      }

      // 3. NW (-X) & SE (+X) Perimeter Curtain Walls + 2 Olive Courtyard Crates
      const zCurtT = zPad + 0.34 * R * H;
      // NW (-X) back-left curtain wall
      pushChFrustum(-0.88 * R, -0.74 * R, -0.78 * R, 0.66 * R, -0.85 * R, -0.77 * R, -0.76 * R, 0.66 * R, zPad, zCurtT, '#d6d3d1', '#b4afa8', '#9ca3af', '#b4afa8', '#78716c', dRef - 20.0, 1.0);
      // 2 Olive-green supply crates stacked inside courtyard against NW wall
      pushChBox(-0.72 * R, -0.56 * R, 0.12 * R, 0.28 * R, zPad, zPad + 0.13 * R * H, '#788652', '#5c693d', '#46512d', '#5c693d', '#353d22', dRef - 15.0, 0.9);
      pushChBox(-0.72 * R, -0.56 * R, 0.30 * R, 0.46 * R, zPad, zPad + 0.13 * R * H, '#788652', '#5c693d', '#46512d', '#5c693d', '#353d22', dRef - 14.5, 0.9);

      // SE (+X) right curtain wall + crimson base stripe + 3 exterior sloped buttress pilasters
      pushChBox(0.74 * R, 0.88 * R, -0.66 * R, 0.66 * R, zPad, zPad + 0.06 * R * H, null, '#b91c1c', '#991b1b', '#b91c1c', '#7f1d1d', dRef - 8.5, 1.0);
      pushChFrustum(0.74 * R, 0.88 * R, -0.66 * R, 0.66 * R, 0.77 * R, 0.85 * R, -0.66 * R, 0.66 * R, zPad + 0.06 * R * H, zCurtT, '#d6d3d1', '#b4afa8', '#9ca3af', '#b4afa8', '#78716c', dRef - 8.0, 1.05);
      for (const by of [0.38 * R, 0, -0.38 * R]) {
        pushChFrustum(0.84 * R, 0.92 * R, by - 0.05 * R, by + 0.05 * R, 0.82 * R, 0.87 * R, by - 0.04 * R, by + 0.04 * R, zPad, zCurtT, '#d6d3d1', '#b4afa8', '#8c857b', '#b4afa8', '#6b655e', dRef - 7.0, 0.95);
      }

      // 4. SW (+Y) Front Curtain Wall Segments & Swallowtail Crimson Military Banners
      for (const [wx0, wx1, bx] of [[-0.64 * R, -0.26 * R, -0.43 * R], [0.26 * R, 0.64 * R, 0.45 * R]]) {
        pushChBox(wx0, wx1, 0.74 * R, 0.88 * R, zPad, zPad + 0.06 * R * H, null, '#b91c1c', '#991b1b', '#b91c1c', '#7f1d1d', dRef - 5.5, 1.0);
        pushChFrustum(wx0, wx1, 0.74 * R, 0.88 * R, wx0, wx1, 0.77 * R, 0.85 * R, zPad + 0.06 * R * H, zCurtT, '#d6d3d1', '#c7c2ba', '#9ca3af', '#c7c2ba', '#78716c', dRef - 5.0, 1.05);
        // Vertical crimson swallowtail banner with gold star (drawn at dRef + 5.8 so watchtowers never occlude it)
        pushChQuadFixed([
          { x: bx - 0.062 * R, y: 0.875 * R, z: zPad + 0.07 * R * H },
          { x: bx,             y: 0.875 * R, z: zPad + 0.12 * R * H },
          { x: bx + 0.062 * R, y: 0.875 * R, z: zPad + 0.07 * R * H },
          { x: bx + 0.062 * R, y: 0.860 * R, z: zCurtT - 0.02 * R * H },
          { x: bx - 0.062 * R, y: 0.860 * R, z: zCurtT - 0.02 * R * H }
        ], '#dc2626', chStroke, 0.9, dRef + 5.8);
        pushChStar3D(
          { x: bx, y: 0.872 * R, z: zPad + 0.21 * R * H },
          { x: 1, y: 0, z: 0 },
          { x: 0, y: 0, z: 1 },
          0.044 * R,
          dRef + 6.0,
          null
        );
      }

      // 5. SW (+Y) Central Concrete Gatehouse with Half-Open Barred Gate & Gold-Bordered Red Star
      const zGateT = zPad + 0.50 * R * H;
      pushChBox(-0.26 * R, 0.26 * R, 0.70 * R, 0.92 * R, zPad, zPad + 0.06 * R * H, null, '#b91c1c', '#991b1b', '#b91c1c', '#7f1d1d', dRef + 1.0, 1.0);
      pushChFrustum(-0.26 * R, 0.26 * R, 0.70 * R, 0.92 * R, -0.24 * R, 0.24 * R, 0.72 * R, 0.89 * R, zPad + 0.06 * R * H, zGateT, '#d6d3d1', '#c7c2ba', '#9ca3af', '#c7c2ba', '#78716c', dRef + 1.5, 1.1);
      // Crimson upper frieze band near top + stepped parapet cap on gatehouse
      pushChBox(-0.245 * R, 0.245 * R, 0.715 * R, 0.895 * R, zGateT - 0.05 * R * H, zGateT - 0.01 * R * H, null, '#b91c1c', '#991b1b', '#b91c1c', '#7f1d1d', dRef + 2.0, 0.95);
      pushChBox(-0.22 * R, 0.22 * R, 0.73 * R, 0.88 * R, zGateT, zGateT + 0.06 * R * H, '#e7e5e4', '#d6d3d1', '#9ca3af', '#d6d3d1', '#78716c', dRef + 2.5, 1.0);
      // Recessed gateway frame + dark portal + steel-barred inner gate door
      pushChQuadFixed([
        { x: -0.15 * R, y: 0.904 * R, z: zPad },
        { x:  0.15 * R, y: 0.904 * R, z: zPad },
        { x:  0.15 * R, y: 0.898 * R, z: zPad + 0.28 * R * H },
        { x: -0.15 * R, y: 0.898 * R, z: zPad + 0.28 * R * H }
      ], '#a8a29e', chStroke, 1.0, dRef + 2.1);
      pushChQuadFixed([
        { x: -0.12 * R, y: 0.906 * R, z: zPad },
        { x:  0.12 * R, y: 0.906 * R, z: zPad },
        { x:  0.12 * R, y: 0.900 * R, z: zPad + 0.25 * R * H },
        { x: -0.12 * R, y: 0.900 * R, z: zPad + 0.25 * R * H }
      ], '#26201b', chStroke, 1.0, dRef + 2.2);
      // Half-open barred gate leaf inside doorway
      pushChQuadFixed([
        { x: -0.11 * R, y: 0.904 * R, z: zPad + 0.01 * R * H },
        { x: -0.02 * R, y: 0.855 * R, z: zPad + 0.01 * R * H },
        { x: -0.02 * R, y: 0.855 * R, z: zPad + 0.23 * R * H },
        { x: -0.11 * R, y: 0.904 * R, z: zPad + 0.23 * R * H }
      ], '#a16207', chStroke, 0.85, dRef + 2.4);
      // Gold-bordered crimson star centered on stone fascia above doorway
      pushChStar3D(
        { x: 0, y: 0.905 * R, z: zGateT - 0.12 * R * H },
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
        0.088 * R,
        dRef + 3.0
      );

      // 6. Three Corner Bastion Watchtowers (West, South, East)
      const pushWatchtower = (tx, ty, hasPillbox, dTow) => {
        const zTowB = zPad + 0.42 * R * H;
        // Crimson base band + battered trapezoidal concrete tower base
        pushChBox(tx - 0.16 * R, tx + 0.16 * R, ty - 0.16 * R, ty + 0.16 * R, zPad, zPad + 0.06 * R * H, null, '#b91c1c', '#991b1b', '#b91c1c', '#7f1d1d', dTow, 1.0);
        pushChFrustum(
          tx - 0.16 * R, tx + 0.16 * R, ty - 0.16 * R, ty + 0.16 * R,
          tx - 0.125 * R, tx + 0.125 * R, ty - 0.125 * R, ty + 0.125 * R,
          zPad + 0.06 * R * H, zTowB, '#d6d3d1', '#c7c2ba', '#9ca3af', '#c7c2ba', '#78716c', dTow + 0.5, 1.05
        );
        // 2-tier tan sandbag collar
        pushChBox(tx - 0.14 * R, tx + 0.14 * R, ty - 0.14 * R, ty + 0.14 * R, zTowB, zTowB + 0.05 * R * H, '#e5c99b', '#d4b483', '#a6895b', '#d4b483', '#8c6d46', dTow + 1.2, 0.9);
        pushChBox(tx - 0.135 * R, tx + 0.135 * R, ty - 0.135 * R, ty + 0.135 * R, zTowB + 0.05 * R * H, zTowB + 0.10 * R * H, '#e5c99b', '#d4b483', '#a6895b', '#d4b483', '#8c6d46', dTow + 1.5, 0.9);
        if (hasPillbox) {
          const zPillB = zTowB + 0.10 * R * H, zPillT = zPillB + 0.18 * R * H;
          pushChBox(tx - 0.115 * R, tx + 0.115 * R, ty - 0.115 * R, ty + 0.115 * R, zPillB, zPillT, '#e7e5e4', '#d6d3d1', '#9ca3af', '#d6d3d1', '#78716c', dTow + 2.0, 1.0);
          // Blue-slate armored observation slits
          pushChQuadFixed([
            { x: tx - 0.085 * R, y: ty + 0.118 * R, z: zPillB + 0.06 * R * H },
            { x: tx + 0.085 * R, y: ty + 0.118 * R, z: zPillB + 0.06 * R * H },
            { x: tx + 0.085 * R, y: ty + 0.118 * R, z: zPillT - 0.04 * R * H },
            { x: tx - 0.085 * R, y: ty + 0.118 * R, z: zPillT - 0.04 * R * H }
          ], '#64748b', chStroke, 0.8, dTow + 2.5);
          pushChQuadFixed([
            { x: tx + 0.118 * R, y: ty - 0.085 * R, z: zPillB + 0.06 * R * H },
            { x: tx + 0.118 * R, y: ty + 0.085 * R, z: zPillB + 0.06 * R * H },
            { x: tx + 0.118 * R, y: ty + 0.085 * R, z: zPillT - 0.04 * R * H },
            { x: tx + 0.118 * R, y: ty - 0.085 * R, z: zPillT - 0.04 * R * H }
          ], '#475569', chStroke, 0.8, dTow + 2.5);
          // Twin yellow searchlights mounted on pillbox roof corners
          const pRoofL = chProj.project(tx - 0.09 * R, ty + 0.09 * R, zPillT + 0.05 * R * H);
          const pRoofR = chProj.project(tx + 0.09 * R, ty - 0.09 * R, zPillT + 0.05 * R * H);
          faces.push({
            pts: [pRoofL, pRoofR],
            depth: dTow + 3.2,
            customDraw(ctx2) {
              ctx2.save();
              for (const pt of [pRoofL, pRoofR]) {
                ctx2.fillStyle = '#475569';
                ctx2.strokeStyle = chStroke;
                ctx2.lineWidth = 1.0;
                ctx2.beginPath();
                ctx2.arc(pt.x, pt.y, 4.2, 0, Math.PI * 2);
                ctx2.fill();
                ctx2.stroke();
                ctx2.fillStyle = '#fde047';
                ctx2.beginPath();
                ctx2.arc(pt.x - 0.6, pt.y - 0.4, 2.8, 0, Math.PI * 2);
                ctx2.fill();
              }
              ctx2.restore();
            }
          });
        } else {
          // Open sandbagged gun pit on East bastion top
          pushChQuadFixed([
            { x: tx - 0.075 * R, y: ty - 0.075 * R, z: zTowB + 0.102 * R * H },
            { x: tx + 0.075 * R, y: ty - 0.075 * R, z: zTowB + 0.102 * R * H },
            { x: tx + 0.075 * R, y: ty + 0.075 * R, z: zTowB + 0.102 * R * H },
            { x: tx - 0.075 * R, y: ty + 0.075 * R, z: zTowB + 0.102 * R * H }
          ], '#57534e', chStroke, 0.9, dTow + 2.3);
          pushChLine({ x: tx, y: ty - 0.135 * R, z: zTowB + 0.102 * R * H }, { x: tx, y: ty + 0.135 * R, z: zTowB + 0.102 * R * H }, '#786b5c', 0.85, dTow + 2.25);
          pushChLine({ x: tx - 0.135 * R, y: ty, z: zTowB + 0.102 * R * H }, { x: tx + 0.135 * R, y: ty, z: zTowB + 0.102 * R * H }, '#786b5c', 0.85, dTow + 2.25);
        }
      };

      pushWatchtower(-0.78 * R,  0.78 * R, true,  dRef - 2.0); // West corner watchtower
      pushWatchtower( 0.78 * R, -0.78 * R, false, dRef - 6.0); // East corner sandbagged bastion
      pushWatchtower( 0.78 * R,  0.78 * R, true,  dRef + 5.0); // South (front) corner watchtower

      flushFaces(ctx, faces);
      return;
    }

    if (defId === 'CHINA_WAR_FACTORY') {
      // High-Fidelity Ligne-Claire 3D Model matching china_war_factory.png:
      // 1. Main Barrel-Vaulted Hangar Hall running along Y (from NE -Y to SW +Y) with vertical ribbed grey walls & 4 framed rectangular windows on SE (+X) wall
      // 2. Smooth Curved Dark-Slate Barrel-Vaulted Roof with crimson fascia eaves, bold crimson central ridge spine, and 4 framed sky-blue glass skylights (2 per slope)
      // 3. SW (+Y) Front Gable Facade with wide open tank rollout bay, yellow/black hazard threshold ramp, interior blue tool cabinets, and olive-drab & crimson PLA Battlemaster Tank emerging
      // 4. NW (-X) Exterior Grey Steel Cross-Braced Overhead Gantry Crane with wheeled top hoist trolley
      // 5. NE (-Y) Rear Utility Annex Shed & Twin Tall Cylindrical Steel Smokestacks with crimson rings and billowing smoke plumes
      // 6. SE (+X) Exterior Stacked Wooden Crates, Olive-Green Military Crates, and 4 Dark-Grey Steel Oil Drums
      const R = r * 1.18 * SS;
      const zPad = 0.02 * R * H;
      const dRef = chProj.project(0, 0, 0.40 * R * H).depth;

      // 1. Rear NE (-Y) Utility Annex Shed & Twin Tall Cylindrical Smokestacks
      pushChBox(0.32 * R, 0.74 * R, -0.92 * R, -0.56 * R, zPad, zPad + 0.36 * R * H, '#94a3b8', '#94a3b8', '#64748b', '#94a3b8', '#475569', dRef - 32, 1.0);
      // Twin cylindrical smokestacks at NE (-Y) end of hangar
      for (const [sx, sy, dStk] of [[0.04 * R, -0.82 * R, dRef - 30], [0.28 * R, -0.80 * R, dRef - 28]]) {
        const zStkB = zPad + 0.40 * R * H, zStkT = zPad + 1.22 * R * H;
        const nS = 12;
        const rS = 0.066 * R;
        for (let i = 0; i < nS; i++) {
          const a0 = (i / nS) * Math.PI * 2, a1 = ((i + 1) / nS) * Math.PI * 2;
          const fAng = Math.cos((a0 + a1) * 0.5 - chAngle);
          if (fAng < -0.25) continue;
          const col = fAng > 0.2 ? '#64748b' : '#94a3b8';
          pushChQuadFixed([
            { x: sx + Math.cos(a0) * rS, y: sy + Math.sin(a0) * rS, z: zStkB },
            { x: sx + Math.cos(a1) * rS, y: sy + Math.sin(a1) * rS, z: zStkB },
            { x: sx + Math.cos(a1) * rS, y: sy + Math.sin(a1) * rS, z: zStkT },
            { x: sx + Math.cos(a0) * rS, y: sy + Math.sin(a0) * rS, z: zStkT }
          ], col, chStroke, 0.75, dStk + fAng * 0.1);
          // 2 Solid crimson rings near top of each smokestack
          for (const zbBand of [zStkT - 0.16 * R * H, zStkT - 0.08 * R * H]) {
            pushChQuadFixed([
              { x: sx + Math.cos(a0) * (rS * 1.02), y: sy + Math.sin(a0) * (rS * 1.02), z: zbBand },
              { x: sx + Math.cos(a1) * (rS * 1.02), y: sy + Math.sin(a1) * (rS * 1.02), z: zbBand },
              { x: sx + Math.cos(a1) * (rS * 1.02), y: sy + Math.sin(a1) * (rS * 1.02), z: zbBand + 0.038 * R * H },
              { x: sx + Math.cos(a0) * (rS * 1.02), y: sy + Math.sin(a0) * (rS * 1.02), z: zbBand + 0.038 * R * H }
            ], '#b91c1c', null, 0, dStk + 0.3 + fAng * 0.1);
          }
        }
        // Dark flue rim at top of smokestack + billowing smoke plume
        const pFlue = chProj.project(sx, sy, zStkT);
        faces.push({
          pts: [pFlue],
          depth: dStk + 1.0,
          customDraw(ctx2) {
            ctx2.save();
            ctx2.fillStyle = '#334155';
            ctx2.strokeStyle = chStroke;
            ctx2.lineWidth = 1.0;
            ctx2.beginPath();
            ctx2.ellipse(pFlue.x, pFlue.y, 6.2, 3.2, 0, 0, Math.PI * 2);
            ctx2.fill();
            ctx2.stroke();
            const puffs = [
              { dx: 4, dy: -6, rx: 7, ry: 5 },
              { dx: 12, dy: -14, rx: 9, ry: 6 },
              { dx: 22, dy: -22, rx: 8, ry: 5.5 }
            ];
            ctx2.fillStyle = '#64748b';
            for (const pf of puffs) {
              ctx2.beginPath();
              ctx2.ellipse(pFlue.x + pf.dx, pFlue.y + pf.dy, pf.rx + 1.2, pf.ry + 1.2, -0.3, 0, Math.PI * 2);
              ctx2.fill();
            }
            ctx2.fillStyle = '#e2e8f0';
            for (const pf of puffs) {
              ctx2.beginPath();
              ctx2.ellipse(pFlue.x + pf.dx, pFlue.y + pf.dy, pf.rx, pf.ry, -0.3, 0, Math.PI * 2);
              ctx2.fill();
            }
            ctx2.restore();
          }
        });
      }

      // 2. NW (-X) Exterior Steel Overhead Gantry Crane (x = -0.82R..-0.58R, y = -0.60R..+0.66R)
      const gx0 = -0.82 * R, gx1 = -0.60 * R, zCrT = zPad + 0.80 * R * H;
      for (const [gy, dLeg] of [[-0.52 * R, dRef - 24], [0.58 * R, dRef - 16]]) {
        pushChBox(gx0 - 0.03 * R, gx1 + 0.03 * R, gy - 0.08 * R, gy + 0.08 * R, 0, zPad + 0.05 * R * H, '#cbd5e1', '#94a3b8', '#64748b', '#94a3b8', '#64748b', dLeg - 0.5, 0.9);
        pushChBox(gx0, gx0 + 0.045 * R, gy - 0.04 * R, gy + 0.04 * R, zPad + 0.05 * R * H, zCrT, '#cbd5e1', '#94a3b8', '#64748b', '#94a3b8', '#475569', dLeg, 0.9);
        pushChBox(gx1 - 0.045 * R, gx1, gy - 0.04 * R, gy + 0.04 * R, zPad + 0.05 * R * H, zCrT, '#cbd5e1', '#94a3b8', '#64748b', '#94a3b8', '#475569', dLeg + 0.1, 0.9);
        for (let b = 0; b < 3; b++) {
          const zb0 = zPad + (0.06 + b * 0.24) * R * H;
          const zb1 = zPad + (0.06 + (b + 1) * 0.24) * R * H;
          pushChLine({ x: gx0 + 0.03 * R, y: gy + 0.04 * R, z: zb0 }, { x: gx1 - 0.03 * R, y: gy + 0.04 * R, z: zb1 }, '#334155', 1.4, dLeg + 0.65);
          pushChLine({ x: gx1 - 0.03 * R, y: gy + 0.04 * R, z: zb0 }, { x: gx0 + 0.03 * R, y: gy + 0.04 * R, z: zb1 }, '#334155', 1.4, dLeg + 0.65);
          pushChLine({ x: gx0 + 0.03 * R, y: gy + 0.04 * R, z: zb1 }, { x: gx1 - 0.03 * R, y: gy + 0.04 * R, z: zb1 }, '#475569', 1.1, dLeg + 0.66);
        }
      }
      // Sleek horizontal double-girder steel bridge beam + top wheeled hoist trolley box
      pushChBox(gx0 + 0.01 * R, gx1 - 0.01 * R, -0.60 * R, 0.68 * R, zCrT, zCrT + 0.07 * R * H, '#cbd5e1', '#94a3b8', '#64748b', '#94a3b8', '#475569', dRef - 15.0, 1.0);
      pushChLine({ x: gx1 - 0.005 * R, y: -0.58 * R, z: zCrT + 0.035 * R * H }, { x: gx1 - 0.005 * R, y: 0.66 * R, z: zCrT + 0.035 * R * H }, '#334155', 1.2, dRef - 14.4);
      pushChBox(gx0, gx1, -0.36 * R, -0.14 * R, zCrT + 0.07 * R * H, zCrT + 0.18 * R * H, '#e2e8f0', '#94a3b8', '#64748b', '#94a3b8', '#475569', dRef - 14.2, 0.95);

      // 3. Main Hangar Hall Base & NW/NE Back Walls (x = -0.48R..+0.56R, y = -0.74R..+0.74R)
      const hx0 = -0.48 * R, hx1 = 0.56 * R, hy0 = -0.74 * R, hy1 = 0.74 * R;
      const zEave = zPad + 0.54 * R * H;
      pushChBox(hx0, hx1, hy0, hy1, 0, zPad + 0.10 * R * H, null, '#64748b', '#475569', '#64748b', '#334155', dRef - 12.0, 1.0);
      pushChBox(hx0, hx1, hy0, hy1, zPad + 0.10 * R * H, zEave, '#64748b', '#cbd5e1', '#94a3b8', '#cbd5e1', '#64748b', dRef - 11.0, 1.1);

      // 4. Curved Barrel-Vaulted Roof (arching across x in [hx0..hx1], spanning y in [hy0..hy1])
      const xCenter = (hx0 + hx1) * 0.5, xHalf = (hx1 - hx0) * 0.5;
      const archH = 0.42 * R * H;
      const archPt = (u, yVal, rScale = 1.0) => ({
        x: xCenter + u * xHalf * rScale,
        y: yVal,
        z: zEave + Math.cos(u * Math.PI * 0.5) * archH * rScale
      });

      // NE (-Y) Rear Semicircular Gable Wall
      const nArch = 10;
      const neArchPts = [];
      for (let i = nArch; i >= 0; i--) {
        const u = -1 + (2 * i) / nArch;
        neArchPts.push(archPt(u, hy0, 1.0));
      }
      pushChQuadFixed(neArchPts, '#64748b', chStroke, 1.0, dRef - 10.5);

      // Barrel-Vaulted Roof Longitudinal Strips
      const ry0 = hy0 - 0.03 * R, ry1 = hy1 + 0.03 * R;
      for (let i = 0; i < nArch; i++) {
        const u0 = -1 + (2 * i) / nArch, u1 = -1 + (2 * (i + 1)) / nArch;
        const uMid = (u0 + u1) * 0.5;
        const col = uMid < -0.2 ? '#94a3b8' : (uMid < 0.25 ? '#788496' : '#576375');
        pushChQuadFixed([
          archPt(u0, ry0, 1.04),
          archPt(u0, ry1, 1.04),
          archPt(u1, ry1, 1.04),
          archPt(u1, ry0, 1.04)
        ], col, chStroke, 0.85, dRef - 9.6 + (1 - Math.abs(uMid)) * 0.4);
      }
      pushChLine(archPt(1, ry0, 1.05), archPt(1, ry1, 1.05), '#b91c1c', 3.2, dRef - 9.0);
      pushChLine(archPt(-1, ry0, 1.05), archPt(-1, ry1, 1.05), '#dc2626', 2.8, dRef - 9.0);

      // Bold Crimson Central Ridge Spine running down the crest of the barrel vault
      pushChQuadFixed([
        archPt(-0.09, ry0, 1.06),
        archPt(-0.09, ry1, 1.06),
        archPt( 0.09, ry1, 1.06),
        archPt( 0.09, ry0, 1.06)
      ], '#dc2626', chStroke, 1.0, dRef - 8.6);

      // 4 Framed Sky-Blue Rectangular Skylights (2 on NW roof slope, 2 on SE roof slope)
      for (const [uA, uB] of [[-0.58, -0.24], [0.24, 0.58]]) {
        for (const [syA, syB] of [[-0.52 * R, -0.10 * R], [0.10 * R, 0.52 * R]]) {
          pushChQuadFixed([
            archPt(uA, syA, 1.055),
            archPt(uA, syB, 1.055),
            archPt(uB, syB, 1.055),
            archPt(uB, syA, 1.055)
          ], '#cbd5e1', chStroke, 0.95, dRef - 8.2);
          const uAi = uA + 0.05, uBi = uB - 0.05;
          const syAi = syA + 0.04 * R, syBi = syB - 0.04 * R;
          pushChQuadFixed([
            archPt(uAi, syAi, 1.06),
            archPt(uAi, syBi, 1.06),
            archPt(uBi, syBi, 1.06),
            archPt(uBi, syAi, 1.06)
          ], '#bae6fd', chStroke, 0.8, dRef - 8.0);
        }
      }

      // 5. Recessed Interior Tank Bay, Blue Tool Cabinets & Emerging PLA Battlemaster Tank
      // Wide portal opening (bx0 = hx0 + 0.11R, bx1 = hx1 - 0.11R) matching sprite proportions
      const bx0 = hx0 + 0.11 * R, bx1 = hx1 - 0.11 * R;
      const zDoorH = zEave - 0.04 * R * H;
      // Dark interior back wall & shadow backdrop inside doorway opening
      pushChQuadFixed([
        { x: bx0, y: hy1, z: zPad },
        { x: bx1, y: hy1, z: zPad },
        { x: bx1, y: hy1, z: zDoorH },
        { x: bx0, y: hy1, z: zDoorH }
      ], '#1e293b', null, 0, dRef - 7.4);
      // Interior concrete bay floor
      pushChQuadFixed([
        { x: bx0, y: 0.36 * R, z: zPad },
        { x: bx1, y: 0.36 * R, z: zPad },
        { x: bx1, y: hy1, z: zPad },
        { x: bx0, y: hy1, z: zPad }
      ], '#475569', chStroke, 0.85, dRef - 7.2);
      // Blue tool cabinets along interior left wall of tank bay
      pushChBox(bx0 + 0.02 * R, bx0 + 0.14 * R, 0.44 * R, 0.70 * R, zPad, zPad + 0.17 * R * H, '#60a5fa', '#3b82f6', '#2563eb', '#3b82f6', '#1d4ed8', dRef - 7.0, 0.85);

      // Olive-Drab & Crimson PLA Battlemaster Tank emerging cleanly through the open SW (+Y) bay
      const tkX = xCenter + 0.02 * R, tkY0 = 0.42 * R, tkY1 = 0.75 * R;
      // Left & right armored treads
      pushChBox(tkX - 0.15 * R, tkX - 0.09 * R, tkY0, tkY1, zPad, zPad + 0.09 * R * H, '#334155', '#1e293b', '#0f172a', '#1e293b', '#0f172a', dRef - 6.8, 0.9);
      pushChBox(tkX + 0.09 * R, tkX + 0.15 * R, tkY0, tkY1, zPad, zPad + 0.09 * R * H, '#334155', '#1e293b', '#0f172a', '#1e293b', '#0f172a', dRef - 6.7, 0.9);
      // Olive-drab hull + crimson front track fenders
      pushChBox(tkX - 0.14 * R, tkX + 0.14 * R, tkY0 + 0.02 * R, tkY1 - 0.01 * R, zPad + 0.05 * R * H, zPad + 0.16 * R * H, '#657542', '#4d5b31', '#3b4725', '#657542', '#313b1e', dRef - 6.5, 0.95);
      pushChBox(tkX - 0.16 * R, tkX - 0.08 * R, tkY1 - 0.11 * R, tkY1 + 0.01 * R, zPad + 0.06 * R * H, zPad + 0.15 * R * H, '#ef4444', '#dc2626', '#991b1b', '#dc2626', '#7f1d1d', dRef - 6.3, 0.9);
      pushChBox(tkX + 0.08 * R, tkX + 0.16 * R, tkY1 - 0.11 * R, tkY1 + 0.01 * R, zPad + 0.06 * R * H, zPad + 0.15 * R * H, '#ef4444', '#dc2626', '#991b1b', '#dc2626', '#7f1d1d', dRef - 6.25, 0.9);
      // Olive-drab low-profile turret
      pushChFrustum(
        tkX - 0.11 * R, tkX + 0.11 * R, tkY0 + 0.06 * R, tkY1 - 0.08 * R,
        tkX - 0.075 * R, tkX + 0.075 * R, tkY0 + 0.09 * R, tkY1 - 0.11 * R,
        zPad + 0.16 * R * H, zPad + 0.25 * R * H, '#7c8f52', '#657542', '#4d5b31', '#657542', '#3b4725', dRef - 6.1, 0.95
      );

      // 5B. SW (+Y) Front Gable Portal Walls & SE (+X) Side Wall (drawn at dRef - 5.8 .. -5.0 to frame the open bay cleanly)
      // Left SW wall pier (x: hx0 .. bx0)
      pushChQuadFixed([
        { x: hx0, y: hy1, z: 0 },
        { x: bx0, y: hy1, z: 0 },
        { x: bx0, y: hy1, z: zPad + 0.10 * R * H },
        { x: hx0, y: hy1, z: zPad + 0.10 * R * H }
      ], '#64748b', chStroke, 1.0, dRef - 5.85);
      pushChQuadFixed([
        { x: hx0, y: hy1, z: zPad + 0.10 * R * H },
        { x: bx0, y: hy1, z: zPad + 0.10 * R * H },
        { x: bx0, y: hy1, z: zEave },
        { x: hx0, y: hy1, z: zEave }
      ], '#cbd5e1', chStroke, 1.05, dRef - 5.8);
      // Right SW wall pier (x: bx1 .. hx1)
      pushChQuadFixed([
        { x: bx1, y: hy1, z: 0 },
        { x: hx1, y: hy1, z: 0 },
        { x: hx1, y: hy1, z: zPad + 0.10 * R * H },
        { x: bx1, y: hy1, z: zPad + 0.10 * R * H }
      ], '#64748b', chStroke, 1.0, dRef - 5.65);
      pushChQuadFixed([
        { x: bx1, y: hy1, z: zPad + 0.10 * R * H },
        { x: hx1, y: hy1, z: zPad + 0.10 * R * H },
        { x: hx1, y: hy1, z: zEave },
        { x: bx1, y: hy1, z: zEave }
      ], '#cbd5e1', chStroke, 1.05, dRef - 5.6);

      // Upper SW Semicircular Arched Gable Wall above doorway lintel (z: zDoorH .. arch)
      const swArchPts = [
        { x: hx0, y: hy1, z: zDoorH },
        { x: hx1, y: hy1, z: zDoorH }
      ];
      for (let i = nArch; i >= 0; i--) {
        const u = -1 + (2 * i) / nArch;
        swArchPts.push(archPt(u, hy1, 1.0));
      }
      pushChQuadFixed(swArchPts, '#d6d3d1', chStroke, 1.05, dRef - 5.5);
      // Heavy steel doorway lintel & jamb trim
      pushChLine({ x: bx0, y: hy1, z: zPad }, { x: bx0, y: hy1, z: zDoorH }, '#334155', 2.2, dRef - 5.45);
      pushChLine({ x: bx1, y: hy1, z: zPad }, { x: bx1, y: hy1, z: zDoorH }, '#334155', 2.2, dRef - 5.45);
      pushChLine({ x: bx0, y: hy1, z: zDoorH }, { x: bx1, y: hy1, z: zDoorH }, '#334155', 2.6, dRef - 5.45);
      // Rectangular grey sign plaque above SW tank bay door
      pushChQuadFixed([
        { x: xCenter - 0.18 * R, y: hy1 + 0.005 * R, z: zEave + 0.06 * R * H },
        { x: xCenter + 0.18 * R, y: hy1 + 0.005 * R, z: zEave + 0.06 * R * H },
        { x: xCenter + 0.18 * R, y: hy1 + 0.005 * R, z: zEave + 0.18 * R * H },
        { x: xCenter - 0.18 * R, y: hy1 + 0.005 * R, z: zEave + 0.18 * R * H }
      ], '#94a3b8', chStroke, 0.9, dRef - 5.4);
      // Crimson Eave Fascia Arch Trim on SW (+Y) Front Gable
      for (let i = 0; i < nArch; i++) {
        const u0 = -1 + (2 * i) / nArch, u1 = -1 + (2 * (i + 1)) / nArch;
        pushChQuadFixed([
          archPt(u0, ry1 - 0.05 * R, 1.05),
          archPt(u0, ry1, 1.05),
          archPt(u1, ry1, 1.05),
          archPt(u1, ry1 - 0.05 * R, 1.05)
        ], '#b91c1c', chStroke, 0.9, dRef - 5.3);
      }

      // SE (+X) Hangar Side Wall & 4 Framed Windows (occludes interior bay on the right)
      pushChQuadFixed([
        { x: hx1, y: hy0, z: 0 },
        { x: hx1, y: hy1, z: 0 },
        { x: hx1, y: hy1, z: zPad + 0.10 * R * H },
        { x: hx1, y: hy0, z: zPad + 0.10 * R * H }
      ], '#475569', chStroke, 1.0, dRef - 5.25);
      pushChQuadFixed([
        { x: hx1, y: hy0, z: zPad + 0.10 * R * H },
        { x: hx1, y: hy1, z: zPad + 0.10 * R * H },
        { x: hx1, y: hy1, z: zEave },
        { x: hx1, y: hy0, z: zEave }
      ], '#94a3b8', chStroke, 1.1, dRef - 5.2);
      for (let i = 1; i < 8; i++) {
        const sy = hy0 + ((hy1 - hy0) * i) / 8;
        pushChLine({ x: hx1 + 0.003 * R, y: sy, z: zPad + 0.10 * R * H }, { x: hx1 + 0.003 * R, y: sy, z: zEave }, '#64748b', 0.8, dRef - 5.1);
      }
      for (const wy of [0.48 * R, 0.16 * R, -0.16 * R, -0.48 * R]) {
        pushChQuadFixed([
          { x: hx1 + 0.006 * R, y: wy - 0.10 * R, z: zEave - 0.20 * R * H },
          { x: hx1 + 0.006 * R, y: wy + 0.10 * R, z: zEave - 0.20 * R * H },
          { x: hx1 + 0.006 * R, y: wy + 0.10 * R, z: zEave - 0.08 * R * H },
          { x: hx1 + 0.006 * R, y: wy - 0.10 * R, z: zEave - 0.08 * R * H }
        ], '#cbd5e1', chStroke, 0.9, dRef - 5.0);
        pushChQuadFixed([
          { x: hx1 + 0.008 * R, y: wy - 0.08 * R, z: zEave - 0.18 * R * H },
          { x: hx1 + 0.008 * R, y: wy + 0.08 * R, z: zEave - 0.18 * R * H },
          { x: hx1 + 0.008 * R, y: wy + 0.08 * R, z: zEave - 0.10 * R * H },
          { x: hx1 + 0.008 * R, y: wy - 0.08 * R, z: zEave - 0.10 * R * H }
        ], '#475569', chStroke, 0.75, dRef - 4.9);
      }

      // Yellow/black diagonal hazard stripe threshold ramp in front of SW (+Y) tank bay
      pushChQuadFixed([
        { x: bx0, y: hy1, z: zPad + 0.02 * R * H },
        { x: bx1, y: hy1, z: zPad + 0.02 * R * H },
        { x: bx1, y: hy1 + 0.11 * R, z: 0 },
        { x: bx0, y: hy1 + 0.11 * R, z: 0 }
      ], '#eab308', chStroke, 0.95, dRef - 4.8);
      for (let k = 0; k < 7; k++) {
        const sx0 = bx0 + 0.02 * R + k * 0.112 * R;
        pushChQuadFixed([
          { x: sx0, y: hy1, z: zPad + 0.02 * R * H },
          { x: sx0 + 0.052 * R, y: hy1, z: zPad + 0.02 * R * H },
          { x: sx0 + 0.032 * R, y: hy1 + 0.11 * R, z: 0 },
          { x: sx0 - 0.02 * R, y: hy1 + 0.11 * R, z: 0 }
        ], '#1e242b', null, 0, dRef - 4.7);
      }
      // Main cannon barrel extending out of the bay over the ramp
      pushChLine({ x: tkX, y: tkY1 - 0.10 * R, z: zPad + 0.21 * R * H }, { x: tkX - 0.04 * R, y: tkY1 + 0.16 * R, z: zPad + 0.19 * R * H }, chStroke, 5.0, dRef - 4.5);
      pushChLine({ x: tkX, y: tkY1 - 0.10 * R, z: zPad + 0.21 * R * H }, { x: tkX - 0.04 * R, y: tkY1 + 0.16 * R, z: zPad + 0.19 * R * H }, '#dc2626', 2.8, dRef - 4.4);

      // 6. SE (+X) Exterior Stacked Crates & Steel Oil Drums
      // 2 Brown wooden crates near front SE corner
      pushChBox(hx1 + 0.02 * R, hx1 + 0.18 * R, 0.52 * R, 0.68 * R, 0, 0.14 * R * H, '#d97706', '#b45309', '#92400e', '#b45309', '#78350f', dRef + 4.5, 0.9);
      pushChBox(hx1 + 0.02 * R, hx1 + 0.18 * R, 0.35 * R, 0.51 * R, 0, 0.14 * R * H, '#d97706', '#b45309', '#92400e', '#b45309', '#78350f', dRef + 4.2, 0.9);
      // Stacked olive-green military crates in middle of SE wall
      pushChBox(hx1 + 0.02 * R, hx1 + 0.18 * R, 0.12 * R, 0.28 * R, 0, 0.14 * R * H, '#788652', '#5c693d', '#46512d', '#5c693d', '#353d22', dRef + 3.8, 0.9);
      pushChBox(hx1 + 0.02 * R, hx1 + 0.18 * R, -0.05 * R, 0.11 * R, 0, 0.14 * R * H, '#788652', '#5c693d', '#46512d', '#5c693d', '#353d22', dRef + 3.5, 0.9);
      pushChBox(hx1 + 0.02 * R, hx1 + 0.16 * R, 0.04 * R, 0.20 * R, 0.14 * R * H, 0.26 * R * H, '#788652', '#5c693d', '#46512d', '#5c693d', '#353d22', dRef + 4.0, 0.9);
      // 4 Dark-grey steel oil drums/barrels near rear of SE wall (drawn at explicit depth dBrl > dRef + 2.0 so SE wall never clips them)
      for (const [bx, by, dBrl] of [
        [hx1 + 0.09 * R, -0.50 * R, dRef + 2.4],
        [hx1 + 0.21 * R, -0.44 * R, dRef + 2.6],
        [hx1 + 0.09 * R, -0.34 * R, dRef + 2.8],
        [hx1 + 0.09 * R, -0.20 * R, dRef + 3.0]
      ]) {
        const rB = 0.055 * R, zBrlT = 0.15 * R * H;
        const nB = 8;
        const topBrlPts = [];
        for (let i = 0; i < nB; i++) {
          const a0 = (i / nB) * Math.PI * 2, a1 = ((i + 1) / nB) * Math.PI * 2;
          topBrlPts.push({ x: bx + Math.cos(a0) * rB, y: by + Math.sin(a0) * rB, z: zBrlT });
          const fAng = Math.cos((a0 + a1) * 0.5 - chAngle);
          if (fAng < -0.2) continue;
          pushChQuadFixed([
            { x: bx + Math.cos(a0) * rB, y: by + Math.sin(a0) * rB, z: 0 },
            { x: bx + Math.cos(a1) * rB, y: by + Math.sin(a1) * rB, z: 0 },
            { x: bx + Math.cos(a1) * rB, y: by + Math.sin(a1) * rB, z: zBrlT },
            { x: bx + Math.cos(a0) * rB, y: by + Math.sin(a0) * rB, z: zBrlT }
          ], fAng > 0.2 ? '#475569' : '#64748b', chStroke, 0.8, dBrl + fAng * 0.05);
        }
        pushChQuadFixed(topBrlPts, '#94a3b8', chStroke, 0.85, dBrl + 0.1);
      }

      flushFaces(ctx, faces);
      return;
    }

    const isRound = defId === 'CHINA_GATTLING_CANNON' || defId === 'CHINA_BUNKER' || defId === 'CHINA_SPEAKER_TOWER' || defId === 'CHINA_NUCLEAR_SILO' || defId === 'CHINA_INTERNET_CENTER' || defId === 'CHINA_MINES';
    const z0 = renderBuildingCompoundBase3D(ctx, faces, proj, r, p, baseCol, hiCol, shCol, houseCol, seamCol, isRound);


    if (defId === 'CHINA_AIRFIELD') {
      // Sprite Sheet Match: Concrete apron with yellow parking boxes + white dashed taxi line + 2 parked grey/crimson delta-wing MiG-1.44 fighters + twin cylindrical fuel tanks + red-and-white striped ATC radar tower
      pushBox3D(faces, proj, -0.84 * r, 0.84 * r, -0.82 * r, 0.82 * r, z0, z0 + 0.08 * r * H, '#94a3b8', seamCol, 1.04, 1.2);
      pushBox3D(faces, proj, -0.76 * r, 0.76 * r, -0.04 * r, 0.04 * r, z0 + 0.08 * r * H, z0 + 0.11 * r * H, '#f8fafc', seamCol, 1.25, 1.0, 2);
      // 4 Yellow-bordered jet parking boxes + 2 parked grey/crimson MiG-1.44 delta-wing fighters
      const pads = [[-0.38 * r, -0.44 * r, false], [0.36 * r, -0.44 * r, true], [-0.38 * r, 0.44 * r, false], [0.36 * r, 0.44 * r, true]];
      for (const [px, py, hasMig] of pads) {
        pushBox3D(faces, proj, px - 0.32 * r, px + 0.32 * r, py - 0.28 * r, py + 0.28 * r, z0 + 0.08 * r * H, z0 + 0.11 * r * H, '#eab308', seamCol, 1.15, 1.05, 2);
        pushBox3D(faces, proj, px - 0.28 * r, px + 0.28 * r, py - 0.24 * r, py + 0.24 * r, z0 + 0.11 * r * H, z0 + 0.13 * r * H, '#334155', seamCol, 0.95, 1.0, 3);
        if (hasMig) {
          // Miniature grey-and-crimson MiG-1.44 delta-wing fighter
          pushTaperedBox3D(faces, proj, px - 0.20 * r, px + 0.10 * r, py - 0.24 * r, py + 0.24 * r, px - 0.08 * r, px + 0.04 * r, py - 0.05 * r, py + 0.05 * r, z0 + 0.14 * r * H, z0 + 0.20 * r * H, houseCol, seamCol, 1.15, 4);
          pushTaperedBox3D(faces, proj, px - 0.24 * r, px + 0.28 * r, py - 0.08 * r, py + 0.08 * r, px - 0.18 * r, px + 0.32 * r, py - 0.03 * r, py + 0.03 * r, z0 + 0.14 * r * H, z0 + 0.25 * r * H, hiCol, seamCol, 1.2, 5);
        }
      }
      // Twin horizontal cylindrical fuel tanks on back-left (-X, -Y)
      pushTubeSegment3D(faces, proj, -0.76 * r, -0.68 * r, z0 + 0.22 * r * H, 0, 0, 0.42 * r, 0.12 * r, 0.12 * r, hiCol, seamCol, 1.15, 1.15, 3);
      pushTubeSegment3D(faces, proj, -0.76 * r, -0.48 * r, z0 + 0.22 * r * H, 0, 0, 0.42 * r, 0.12 * r, 0.12 * r, hiCol, seamCol, 1.15, 1.15, 3);
      // Red-and-white striped ATC radar tower on back-right (-X, +Y)
      pushTaperedBox3D(faces, proj, -0.72 * r, -0.38 * r, 0.26 * r, 0.64 * r, -0.64 * r, -0.44 * r, 0.34 * r, 0.56 * r, z0 + 0.08 * r * H, z0 + 0.96 * r * H, baseCol, seamCol, 1.2);
      pushBox3D(faces, proj, -0.68 * r, -0.40 * r, 0.30 * r, 0.60 * r, z0 + 0.56 * r * H, z0 + 0.74 * r * H, houseCol, seamCol, 1.15, 1.15, 3);
      pushTaperedBox3D(faces, proj, -0.70 * r, -0.38 * r, 0.28 * r, 0.62 * r, -0.76 * r, -0.32 * r, 0.22 * r, 0.68 * r, z0 + 0.96 * r * H, z0 + 1.24 * r * H, '#38bdf8', seamCol, 1.25);
      pushTaperedBox3D(faces, proj, -0.78 * r, -0.30 * r, 0.20 * r, 0.70 * r, -0.66 * r, -0.42 * r, 0.32 * r, 0.58 * r, z0 + 1.24 * r * H, z0 + 1.38 * r * H, houseCol, seamCol, 1.2);
      flushFaces(ctx, faces);
      return;
    }

    if (defId === 'CHINA_PROPAGANDA_CENTER') {
      // Sprite Sheet Match: Monumental brutalist square fortress with 4 corner towers + vertical concrete buttress fins + crimson vertical military banners with gold stars between fins + stepped amber-lit roof podium + tall central lattice broadcast tower with 4 red megaphone horns
      pushTaperedBox3D(faces, proj, -0.82 * r * SS, 0.82 * r * SS, -0.80 * r * SS, 0.80 * r * SS, -0.70 * r * SS, 0.70 * r * SS, -0.68 * r * SS, 0.68 * r * SS, z0, z0 + 0.66 * r * H, baseCol, seamCol, 1.3);
      // 4 Corner concrete towers with crimson caps
      for (const [cx, cy] of [[-0.68 * r, -0.66 * r], [0.68 * r, -0.66 * r], [0.68 * r, 0.66 * r], [-0.68 * r, 0.66 * r]]) {
        pushBox3D(faces, proj, cx - 0.16 * r, cx + 0.16 * r, cy - 0.16 * r, cy + 0.16 * r, z0, z0 + 0.82 * r * H, shCol, seamCol, 1.06, 1.2, 2);
        pushBox3D(faces, proj, cx - 0.18 * r, cx + 0.18 * r, cy - 0.18 * r, cy + 0.18 * r, z0 + 0.82 * r * H, z0 + 0.92 * r * H, houseCol, seamCol, 1.15, 1.15, 3);
      }
      // Vertical crimson military banners with gold stars on front (+X) & right (+Y) facades
      for (const by of [-0.30 * r, 0.0, 0.30 * r]) {
        pushBox3D(faces, proj, 0.66 * r * SS, 0.78 * r * SS, by - 0.09 * r, by + 0.09 * r, z0 + 0.14 * r * H, z0 + 0.60 * r * H, houseCol, seamCol, 1.18, 1.1, 4);
        pushBox3D(faces, proj, 0.70 * r * SS, 0.80 * r * SS, by - 0.04 * r, by + 0.04 * r, z0 + 0.42 * r * H, z0 + 0.52 * r * H, '#fbbf24', seamCol, 1.3, 1.05, 5);
      }
      // Stepped upper podium with glowing amber tactical windows
      pushBox3D(faces, proj, -0.52 * r * SS, 0.52 * r * SS, -0.52 * r * SS, 0.52 * r * SS, z0 + 0.66 * r * H, z0 + 0.96 * r * H, hiCol, seamCol, 1.1, 1.25);
      pushBox3D(faces, proj, -0.54 * r * SS, 0.54 * r * SS, -0.54 * r * SS, 0.54 * r * SS, z0 + 0.74 * r * H, z0 + 0.86 * r * H, '#fbbf24', seamCol, 1.32, 1.1, 3);
      pushTaperedBox3D(faces, proj, -0.56 * r * SS, 0.56 * r * SS, -0.56 * r * SS, 0.56 * r * SS, -0.40 * r * SS, 0.40 * r * SS, -0.40 * r * SS, 0.40 * r * SS, z0 + 0.96 * r * H, z0 + 1.12 * r * H, houseCol, seamCol, 1.2);
      // Central lattice broadcast tower + 4 directional megaphone speaker horns
      pushLatticeTower3D(faces, proj, 0, 0, z0 + 1.12 * r * H, z0 + 1.68 * r * H, 0.16 * r * RS, 0.06 * r * RS, shCol, seamCol);
      pushBox3D(faces, proj, -0.38 * r * RS, 0.38 * r * RS, -0.14 * r * RS, 0.14 * r * RS, z0 + 1.48 * r * H, z0 + 1.64 * r * H, houseCol, seamCol, 1.2, 1.15, 7);
      pushBox3D(faces, proj, -0.14 * r * RS, 0.14 * r * RS, -0.38 * r * RS, 0.38 * r * RS, z0 + 1.48 * r * H, z0 + 1.64 * r * H, houseCol, seamCol, 1.2, 1.15, 7);
      flushFaces(ctx, faces);
      return;
    }

    if (defId === 'CHINA_INTERNET_CENTER') {
      // Sprite Sheet Match: Octagonal dark-gunmetal cyber-warfare bunker + crimson upper corner blocks + glowing matrix-green horizontal server louvers on all faces + oversized rotating white-and-crimson parabolic satellite uplink dish on roof
      pushCylinderZ3D(faces, proj, 0, 0, z0, z0 + 0.64 * r * H, 0.82 * r * SS, 0.72 * r * SS, 8, '#334155', seamCol, 1.0, 1.3);
      // 3 Stacked glowing matrix-green server cooling louver bands
      for (const lz of [0.16, 0.32, 0.48]) {
        pushCylinderZ3D(faces, proj, 0, 0, z0 + lz * r * H, z0 + (lz + 0.08) * r * H, 0.79 * r * SS, 0.77 * r * SS, 8, '#4ade80', seamCol, 1.35, 1.1, 3);
      }
      // Crimson armored upper parapet ring + dark roof deck
      pushCylinderZ3D(faces, proj, 0, 0, z0 + 0.64 * r * H, z0 + 0.80 * r * H, 0.76 * r * SS, 0.66 * r * SS, 8, houseCol, seamCol, 1.15, 1.25);
      pushCylinderZ3D(faces, proj, 0, 0, z0 + 0.80 * r * H, z0 + 0.92 * r * H, 0.44 * r * RS, 0.34 * r * RS, 8, shCol, seamCol, 1.05, 1.2);
      flushFaces(ctx, faces);

      // Oversized rotating white-and-crimson parabolic satellite dish on roof
      const dishCenter = proj.project(0, 0, z0 + 1.12 * r * H);
      ctx.save();
      ctx.translate(dishCenter.x, dishCenter.y);
      const dProj = createProjector(baseAngle + t * 0.75, pitchScale, zScale);
      const dFaces = [];
      pushTaperedBox3D(dFaces, dProj, -0.18 * r * RS, 0.22 * r * RS, -0.58 * r * RS, 0.58 * r * RS, -0.06 * r * RS, 0.38 * r * RS, -0.68 * r * RS, 0.68 * r * RS, -0.16 * r, 0.24 * r, '#f8fafc', seamCol, 1.28);
      pushBox3D(dFaces, dProj, -0.10 * r * RS, 0.34 * r * RS, -0.64 * r * RS, 0.64 * r * RS, 0.02 * r, 0.14 * r, houseCol, seamCol, 1.18, 1.15, 2);
      pushTubeSegment3D(dFaces, dProj, 0.18 * r * RS, 0, 0.08 * r, 0.35, 0, 0.46 * r * RS, 0.05 * r, 0.03 * r, '#1e293b', seamCol, 1.1, 1.15, 4);
      flushFaces(ctx, dFaces);
      ctx.restore();
      return;
    }

    if (defId === 'CHINA_GATTLING_CANNON') {
      // Sprite Sheet Match: Octagonal concrete emplacement with yellow/black hazard base collar + crimson armor ring + swiveling dual-pod 6-barrel rotary Gattling turret with twin brass ammo drums
      pushCylinderZ3D(faces, proj, 0, 0, z0, z0 + 0.34 * r * H, 0.78 * r * SS, 0.68 * r * SS, 8, baseCol, seamCol, 1.06, 1.25);
      pushCylinderZ3D(faces, proj, 0, 0, z0 + 0.34 * r * H, z0 + 0.48 * r * H, 0.68 * r * SS, 0.62 * r * SS, 8, '#eab308', seamCol, 1.18, 1.2, 2);
      pushCylinderZ3D(faces, proj, 0, 0, z0 + 0.48 * r * H, z0 + 0.64 * r * H, 0.58 * r * TS, 0.52 * r * TS, 8, houseCol, seamCol, 1.15, 1.2);
      flushFaces(ctx, faces);

      const turProj = createProjector(turretAngle, pitchScale, zScale);
      const turFaces = [];
      pushTaperedBox3D(turFaces, turProj, -0.40 * r * TS, 0.34 * r * TS, -0.38 * r * TS, 0.38 * r * TS, -0.30 * r * TS, 0.24 * r * TS, -0.28 * r * TS, 0.28 * r * TS, z0 + 0.64 * r * H, z0 + 1.12 * r * H, hiCol, seamCol, 1.22);
      pushBox3D(turFaces, turProj, -0.26 * r * TS, 0.20 * r * TS, -0.24 * r * TS, 0.24 * r * TS, z0 + 1.12 * r * H, z0 + 1.22 * r * H, houseCol, seamCol, 1.15, 1.15);
      // Twin side brass ammo drums + 6-barrel rotary Gattling clusters with muzzle clamps
      for (const sy of [-0.44 * r * TS, 0.44 * r * TS]) {
        pushBox3D(turFaces, turProj, -0.32 * r * TS, 0.14 * r * TS, sy - 0.14 * r * TS, sy + 0.14 * r * TS, z0 + 0.72 * r * H, z0 + 1.04 * r * H, '#ca8a04', seamCol, 1.18, 1.15, 3);
        pushTubeSegment3D(turFaces, turProj, -0.06 * r - recoil, sy, z0 + 0.90 * r * H, 0.20, 0, 1.02 * r * BL, 0.12 * r * TS, 0.10 * r * TS, '#1e293b', seamCol, 1.1, 1.25, 4);
        pushTubeSegment3D(turFaces, turProj, 0.58 * r - recoil, sy, z0 + 1.03 * r * H, 0.20, 0, 0.16 * r * BL, 0.14 * r * TS, 0.14 * r * TS, '#94a3b8', seamCol, 1.2, 1.15, 5);
      }
      flushFaces(ctx, turFaces);
      return;
    }

    if (defId === 'CHINA_BUNKER' || defId === 'CHINA_MINES') {
      // Sprite Sheet Match: Octagonal reinforced concrete pillbox + corner sandbag revetments + dark horizontal armored firing slits + sloped concrete roof with circular crimson hatch & gold star emblem + periscope
      pushCylinderZ3D(faces, proj, 0, 0, z0, z0 + 0.44 * r * H, 0.84 * r * SS, 0.78 * r * SS, 8, baseCol, seamCol, 1.06, 1.25);
      // 4 Corner sandbag revetment stacks
      for (const [sx, sy] of [[-0.58 * r, -0.58 * r], [0.58 * r, -0.58 * r], [0.58 * r, 0.58 * r], [-0.58 * r, 0.58 * r]]) {
        pushBox3D(faces, proj, sx - 0.18 * r, sx + 0.18 * r, sy - 0.18 * r, sy + 0.18 * r, z0, z0 + 0.26 * r * H, '#d4b483', seamCol, 1.08, 1.15, 2);
      }
      // Dark horizontal armored firing slit band
      pushCylinderZ3D(faces, proj, 0, 0, z0 + 0.44 * r * H, z0 + 0.62 * r * H, 0.74 * r * SS, 0.74 * r * SS, 8, '#0f172a', seamCol, 0.82, 1.2, 3);
      // Sloped concrete roof cap + circular crimson hatch with gold star
      pushCylinderZ3D(faces, proj, 0, 0, z0 + 0.62 * r * H, z0 + 0.88 * r * H, 0.82 * r * SS, 0.56 * r * SS, 8, hiCol, seamCol, 1.12, 1.25, 4);
      pushCylinderZ3D(faces, proj, 0, 0, z0 + 0.88 * r * H, z0 + 0.96 * r * H, 0.38 * r * SS, 0.34 * r * SS, 8, houseCol, seamCol, 1.18, 1.2, 5);
      pushCylinderZ3D(faces, proj, 0, 0, z0 + 0.96 * r * H, z0 + 1.01 * r * H, 0.16 * r * SS, 0.14 * r * SS, 5, '#fbbf24', seamCol, 1.3, 1.1, 6);
      // Periscope / whip antenna on roof
      pushBox3D(faces, proj, -0.26 * r, -0.18 * r, -0.04 * r, 0.04 * r, z0 + 0.88 * r * H, z0 + 1.26 * r * H, shCol, seamCol, 1.05, 1.1, 6);
      flushFaces(ctx, faces);
      return;
    }

    if (defId === 'CHINA_SPEAKER_TOWER') {
      // Sprite Sheet Match: Octagonal concrete base with yellow/black hazard collar + tall crimson-and-steel cross-braced lattice tower + 4 flared directional red megaphone horns with gold rims + glowing red beacon finial
      pushCylinderZ3D(faces, proj, 0, 0, z0, z0 + 0.28 * r * H, 0.60 * r * SS, 0.50 * r * SS, 8, baseCol, seamCol, 1.06, 1.2);
      pushCylinderZ3D(faces, proj, 0, 0, z0 + 0.28 * r * H, z0 + 0.38 * r * H, 0.50 * r * SS, 0.44 * r * SS, 8, '#eab308', seamCol, 1.18, 1.15, 2);
      pushLatticeTower3D(faces, proj, 0, 0, z0 + 0.38 * r * H, z0 + 1.40 * r * H, 0.24 * r * SS, 0.11 * r * SS, houseCol, seamCol);
      // 4 Flared megaphone loudspeaker horns at top
      for (const [hx, hy, wx, wy] of [
        [-0.32 * r * RS, 0, 0.18 * r * RS, 0.16 * r * RS],
        [0.32 * r * RS, 0, 0.18 * r * RS, 0.16 * r * RS],
        [0, -0.32 * r * RS, 0.16 * r * RS, 0.18 * r * RS],
        [0, 0.32 * r * RS, 0.16 * r * RS, 0.18 * r * RS]
      ]) {
        pushTaperedBox3D(faces, proj, hx * 0.4 - wx * 0.5, hx * 0.4 + wx * 0.5, hy * 0.4 - wy * 0.5, hy * 0.4 + wy * 0.5, hx - wx, hx + wx, hy - wy, hy + wy, z0 + 1.24 * r * H, z0 + 1.48 * r * H, houseCol, seamCol, 1.22, 6);
      }
      // Pulsing red top beacon
      pushCylinderZ3D(faces, proj, 0, 0, z0 + 1.48 * r * H, z0 + 1.66 * r * H, 0.10 * r * RS, 0.06 * r * RS, 8, '#ef4444', seamCol, 1.38, 1.15, 7);
      flushFaces(ctx, faces);
      return;
    }

    if (defId === 'CHINA_NUCLEAR_SILO') {
      // Sprite Sheet Match: Octagonal subterranean silo bunker + 4 glowing lime-green radiation vents + 4 open yellow/black hazard-striped blast doors folded outward + glowing green silo pit + tall crimson steel launch gantry arm + red-and-white thermonuclear ICBM emerging
      pushCylinderZ3D(faces, proj, 0, 0, z0, z0 + 0.46 * r * H, 0.86 * r * SS, 0.74 * r * SS, 8, baseCol, seamCol, 1.06, 1.3);
      // 4 Glowing lime-green radiation vents around the sloped bunker collar
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2 + Math.PI / 4;
        const vx = Math.cos(a) * 0.64 * r * SS;
        const vy = Math.sin(a) * 0.64 * r * SS;
        pushBox3D(faces, proj, vx - 0.14 * r, vx + 0.14 * r, vy - 0.14 * r, vy + 0.14 * r, z0 + 0.18 * r * H, z0 + 0.44 * r * H, '#4ade80', seamCol, 1.35, 1.15, 3);
      }
      // Glowing green subterranean silo pit ring
      pushCylinderZ3D(faces, proj, 0, 0, z0 + 0.46 * r * H, z0 + 0.58 * r * H, 0.52 * r * SS, 0.48 * r * SS, 8, '#22c55e', seamCol, 1.35, 1.2, 3);
      // 4 Open yellow/black hazard-striped blast doors folded outward
      for (const [dx, dy, wx, wy] of [
        [-0.56 * r * SS, 0, 0.16 * r, 0.28 * r],
        [0.56 * r * SS, 0, 0.16 * r, 0.28 * r],
        [0, -0.56 * r * SS, 0.28 * r, 0.16 * r],
        [0, 0.56 * r * SS, 0.28 * r, 0.16 * r]
      ]) {
        pushBox3D(faces, proj, dx - wx, dx + wx, dy - wy, dy + wy, z0 + 0.46 * r * H, z0 + 0.56 * r * H, '#eab308', seamCol, 1.2, 1.15, 4);
      }
      // Tall crimson lattice umbilical launch gantry tower on -Y side + horizontal stabilizer arm
      pushLatticeTower3D(faces, proj, -0.18 * r, -0.46 * r, z0 + 0.46 * r * H, z0 + 1.54 * r * H, 0.14 * r, 0.09 * r, houseCol, seamCol);
      pushBox3D(faces, proj, -0.22 * r, 0.06 * r, -0.46 * r, -0.06 * r, z0 + 1.26 * r * H, z0 + 1.38 * r * H, houseCol, seamCol, 1.18, 1.15, 6);
      // Central white-and-crimson DF-31 ICBM warhead emerging from silo pit
      pushCylinderZ3D(faces, proj, 0, 0, z0 + 0.56 * r * H, z0 + 1.34 * r * H * BL, 0.24 * r * TS, 0.22 * r * TS, 8, '#f8fafc', seamCol, 1.22, 1.25, 5);
      pushCylinderZ3D(faces, proj, 0, 0, z0 + 0.96 * r * H, z0 + 1.12 * r * H * BL, 0.23 * r * TS, 0.23 * r * TS, 8, houseCol, seamCol, 1.18, 1.15, 6);
      pushCylinderZ3D(faces, proj, 0, 0, z0 + 1.34 * r * H * BL, z0 + 1.72 * r * H * BL, 0.22 * r * TS, 0.03 * r * TS, 8, houseCol, seamCol, 1.25, 1.2, 7);
      flushFaces(ctx, faces);
      return;
    }

    flushFaces(ctx, faces);
  }

  function renderGlaBuildingModel(ctx, u, faction, params, options) {
    const p = Object.assign({}, BUILDING_DEFAULT_PARAMS, {
      armorBaseColor: '#d4b483',
      armorHighlightColor: '#ead2ac',
      armorShadowColor: '#8c6d46',
      houseColor: '#65a30d'
    }, params || {});
    const opts = options || {};
    const defId = u.defId || (u.def && u.def.id) || 'GLA_COMMAND_CENTER';
    const r = (u.radius || ((u.def && u.def.size) ? u.def.size * 0.46 : 36)) * (p.footprintScale || 1.0);
    const H = (p.structureHeight || 1.0) * (p.extrusionDepth || 1.0);
    const SS = p.superstructureScale || 1.0;
    const TS = p.turretScale || 1.0;
    const BL = p.barrelLength || 1.0;
    const RS = p.radarScale || 1.0;
    const t = (typeof performance !== 'undefined' ? performance.now() * 0.001 : 0) + (u.treadPhase || 0) * 6.0;
    const baseAngle = (u.angle !== undefined ? u.angle : 0.68);
    const turretAngle = (u.turretAngle !== undefined ? u.turretAngle : baseAngle);
    const recoil = (u.recoilOffset || 0) * 0.05 * r;
    const pitchScale = opts.pitchScale !== undefined ? opts.pitchScale : 0.64;
    const zScale = opts.zScale !== undefined ? opts.zScale : 0.78;

    const baseCol = p.armorBaseColor || '#d4b483';
    const hiCol = p.armorHighlightColor || '#ead2ac';
    const shCol = p.armorShadowColor || '#8c6d46';
    const houseCol = (faction && faction.color) || p.houseColor || '#65a30d';
    const seamCol = '#2b241f';

    const proj = createProjector(baseAngle, pitchScale, zScale);
    const faces = [];
    const isRound = defId === 'GLA_TUNNEL_NETWORK' || defId === 'GLA_STINGER_SITE' || defId === 'GLA_DEMO_TRAP';
    const z0 = renderBuildingCompoundBase3D(ctx, faces, proj, r, p, baseCol, hiCol, shCol, houseCol, seamCol, isRound);

    if (defId === 'GLA_COMMAND_CENTER') {
      // GLA Command Center: Two-tier desert sandstone adobe fortress with crenelated parapet,
      // corrugated rusty sheet-metal awnings on poles, draped olive-camo netting tarp,
      // rooftop wire-mesh radar + lattice mast + parabolic dish, and stacked oil drums/crates in yard
      pushBox3D(faces, proj, -0.82 * r * SS, 0.46 * r * SS, -0.76 * r * SS, 0.76 * r * SS, z0, z0 + 0.56 * r * H, baseCol, seamCol, 1.05, 1.3);
      // Crenelated merlons around lower bastion perimeter
      for (const mx of [-0.74 * r, -0.44 * r, -0.14 * r, 0.16 * r, 0.38 * r]) {
        pushBox3D(faces, proj, mx - 0.08 * r, mx + 0.08 * r, -0.78 * r * SS, -0.68 * r * SS, z0 + 0.56 * r * H, z0 + 0.68 * r * H, hiCol, seamCol, 1.1, 1.1);
        pushBox3D(faces, proj, mx - 0.08 * r, mx + 0.08 * r, 0.68 * r * SS, 0.78 * r * SS, z0 + 0.56 * r * H, z0 + 0.68 * r * H, hiCol, seamCol, 1.1, 1.1);
      }
      // Second-tier central sandstone keep + crenelations
      pushBox3D(faces, proj, -0.66 * r * SS, 0.18 * r * SS, -0.54 * r * SS, 0.54 * r * SS, z0 + 0.56 * r * H, z0 + 1.02 * r * H, hiCol, seamCol, 1.1, 1.25);
      for (const my of [-0.46 * r, -0.16 * r, 0.16 * r, 0.46 * r]) {
        pushBox3D(faces, proj, 0.10 * r * SS, 0.20 * r * SS, my - 0.07 * r, my + 0.07 * r, z0 + 1.02 * r * H, z0 + 1.14 * r * H, baseCol, seamCol, 1.12, 1.1);
      }
      // Narrow horizontal fortress firing slits
      for (const wy of [-0.36 * r, 0, 0.36 * r]) {
        pushBox3D(faces, proj, 0.16 * r * SS, 0.20 * r * SS, wy - 0.09 * r, wy + 0.09 * r, z0 + 0.74 * r * H, z0 + 0.86 * r * H, '#1e293b', seamCol, 0.85, 1.05);
      }
      // Corrugated rusty sheet-metal awning on timber poles over right/front yard
      pushTaperedBox3D(faces, proj, 0.16 * r, 0.82 * r, -0.64 * r, 0.16 * r, 0.20 * r, 0.78 * r, -0.58 * r, 0.12 * r, z0 + 0.48 * r * H, z0 + 0.64 * r * H, '#9a3412', seamCol, 1.15);
      for (const py of [-0.56 * r, 0.08 * r]) {
        pushBox3D(faces, proj, 0.70 * r, 0.76 * r, py - 0.03 * r, py + 0.03 * r, z0, z0 + 0.50 * r * H, '#57534e', seamCol, 0.96, 1.05);
      }
      // Olive-camo netting tarp draped across right flank
      pushTaperedBox3D(faces, proj, -0.12 * r, 0.64 * r, 0.16 * r, 0.78 * r, -0.06 * r, 0.56 * r, 0.22 * r, 0.72 * r, z0 + 0.44 * r * H, z0 + 0.68 * r * H, houseCol, seamCol, 1.16);
      // Armored underground tunnel hatch + stacked red/green oil drums in front yard
      pushBox3D(faces, proj, 0.38 * r, 0.74 * r, 0.24 * r, 0.62 * r, z0, z0 + 0.14 * r * H, '#475569', seamCol, 1.02, 1.15);
      pushCylinderZ3D(faces, proj, 0.54 * r, -0.36 * r, z0, z0 + 0.28 * r * H, 0.11 * r, 0.11 * r, 8, '#dc2626', seamCol, 1.12, 1.05);
      pushCylinderZ3D(faces, proj, 0.36 * r, -0.44 * r, z0, z0 + 0.28 * r * H, 0.11 * r, 0.11 * r, 8, '#84cc16', seamCol, 1.2, 1.05);
      // Rooftop lattice radio mast + rotating wire-mesh radar + parabolic dish
      if (p.ShowRadarDish !== false) {
        pushLatticeTower3D(faces, proj, -0.44 * r, -0.28 * r, z0 + 1.02 * r * H, z0 + 1.66 * r * H * RS, 0.12 * r, 0.03 * r, '#57534e', seamCol);
        pushCylinderZ3D(faces, proj, -0.14 * r, 0.22 * r, z0 + 1.02 * r * H, z0 + 1.24 * r * H, 0.10 * r * RS, 0.26 * r * RS, 8, hiCol, seamCol, 1.2, 1.15);
        const rAng = t * 1.6;
        const rx = Math.cos(rAng) * 0.22 * r * RS, ry = Math.sin(rAng) * 0.22 * r * RS;
        pushBox3D(faces, proj, -0.14 * r - Math.abs(rx) - 0.04 * r, -0.14 * r + Math.abs(rx) + 0.04 * r, -0.22 * r - Math.abs(ry) - 0.04 * r, -0.22 * r + Math.abs(ry) + 0.04 * r, z0 + 1.18 * r * H, z0 + 1.30 * r * H, '#78716c', seamCol, 1.15, 1.1);
      }
      flushFaces(ctx, faces);
      return;
    }

    if (defId === 'GLA_SUPPLY_STASH') {
      // GLA Supply Stash: Sandy pad with corrugated tin & timber cargo sorting shed shaded by
      // olive-camo pitched tarp roof, front wooden plank stairs, stacked olive ammo crates,
      // and glowing lime-green anthrax toxin drums
      // Raised timber & sandstone dock platform
      pushBox3D(faces, proj, -0.82 * r * SS, 0.16 * r * SS, -0.76 * r * SS, 0.76 * r * SS, z0, z0 + 0.24 * r * H, shCol, seamCol, 1.02, 1.2);
      // Front wooden plank loading ramp/stairs
      pushTaperedBox3D(faces, proj, 0.16 * r * SS, 0.48 * r * SS, -0.32 * r, 0.32 * r, 0.16 * r * SS, 0.22 * r * SS, -0.30 * r, 0.30 * r, z0, z0 + 0.24 * r * H, '#a16207', seamCol, 1.12);
      // Corrugated tin & sandstone shed walls
      pushBox3D(faces, proj, -0.78 * r * SS, 0.08 * r * SS, -0.70 * r * SS, 0.70 * r * SS, z0 + 0.24 * r * H, z0 + 0.68 * r * H, baseCol, seamCol, 1.06, 1.25);
      // Dark open sorting bay interior
      pushBox3D(faces, proj, -0.06 * r * SS, 0.10 * r * SS, -0.48 * r, 0.48 * r, z0 + 0.26 * r * H, z0 + 0.62 * r * H, '#1e293b', seamCol, 0.85, 1.1);
      // Pitched olive-camo tarp roof + rusty corrugated iron ridge
      pushTaperedBox3D(faces, proj, -0.84 * r * SS, 0.16 * r * SS, -0.76 * r * SS, 0.76 * r * SS, -0.68 * r * SS, 0.02 * r * SS, -0.58 * r * SS, 0.58 * r * SS, z0 + 0.68 * r * H, z0 + 0.94 * r * H, houseCol, seamCol, 1.18);
      pushBox3D(faces, proj, -0.70 * r * SS, 0.04 * r * SS, -0.22 * r, 0.22 * r, z0 + 0.92 * r * H, z0 + 1.00 * r * H, '#9a3412', seamCol, 1.12, 1.1);
      // Stacked wooden & olive military ammo crates in front courtyard
      if (p.ShowSupplyPallets !== false) {
        pushBox3D(faces, proj, 0.24 * r, 0.66 * r, -0.68 * r, -0.24 * r, z0, z0 + 0.30 * r * H, '#a16207', seamCol, 1.12, 1.15);
        pushBox3D(faces, proj, 0.30 * r, 0.60 * r, -0.62 * r, -0.30 * r, z0 + 0.30 * r * H, z0 + 0.52 * r * H, '#4d7c0f', seamCol, 1.16, 1.1);
        // Glowing lime-green anthrax toxin drums on right side
        for (const [dx, dy] of [[0.34 * r, 0.32 * r], [0.58 * r, 0.28 * r], [0.46 * r, 0.54 * r]]) {
          pushCylinderZ3D(faces, proj, dx, dy, z0, z0 + 0.34 * r * H, 0.11 * r, 0.11 * r, 8, '#15803d', seamCol, 1.1, 1.1);
          pushCylinderZ3D(faces, proj, dx, dy, z0 + 0.32 * r * H, z0 + 0.38 * r * H, 0.10 * r, 0.09 * r, 8, '#84cc16', seamCol, 1.35, 1.05);
        }
      }
      flushFaces(ctx, faces);
      return;
    }

    if (defId === 'GLA_BARRACKS') {
      // GLA Barracks: Sandstone adobe bunker with front arched tunnel doorway flanked by vertical
      // olive military banners, rooftop sandbag parapet ring, exterior RPG weapon racks,
      // and tall 4-legged wooden watchtower with searchlight on the roof
      pushBox3D(faces, proj, -0.80 * r * SS, 0.38 * r * SS, -0.74 * r * SS, 0.74 * r * SS, z0, z0 + 0.62 * r * H, baseCol, seamCol, 1.05, 1.3);
      // Crenelated sandstone + sandbag parapet ring on roof
      pushBox3D(faces, proj, -0.76 * r * SS, 0.34 * r * SS, -0.70 * r * SS, 0.70 * r * SS, z0 + 0.62 * r * H, z0 + 0.74 * r * H, hiCol, seamCol, 1.1, 1.2);
      for (const my of [-0.56 * r, -0.20 * r, 0.20 * r, 0.56 * r]) {
        pushBox3D(faces, proj, 0.24 * r * SS, 0.38 * r * SS, my - 0.10 * r, my + 0.10 * r, z0 + 0.74 * r * H, z0 + 0.84 * r * H, '#a8a29e', seamCol, 1.08, 1.1);
      }
      // Front arched bunker deployment tunnel portal
      pushBox3D(faces, proj, 0.26 * r * SS, 0.50 * r * SS, -0.34 * r, 0.34 * r, z0, z0 + 0.54 * r * H, shCol, seamCol, 1.04, 1.2);
      pushBox3D(faces, proj, 0.32 * r * SS, 0.52 * r * SS, -0.24 * r, 0.24 * r, z0, z0 + 0.44 * r * H, '#1e293b', seamCol, 0.82, 1.15);
      // Vertical olive-green GLA banners flanking doorway
      for (const by of [-0.46 * r, 0.46 * r]) {
        pushBox3D(faces, proj, 0.34 * r * SS, 0.40 * r * SS, by - 0.08 * r, by + 0.08 * r, z0 + 0.16 * r * H, z0 + 0.56 * r * H, houseCol, seamCol, 1.18, 1.1);
        pushBox3D(faces, proj, 0.36 * r * SS, 0.41 * r * SS, by - 0.04 * r, by + 0.04 * r, z0 + 0.30 * r * H, z0 + 0.42 * r * H, '#eab308', seamCol, 1.25, 1.05);
      }
      // Exterior wooden RPG / AK-47 weapon rack + sandbag firing line on right apron
      pushBox3D(faces, proj, 0.44 * r, 0.62 * r, 0.36 * r, 0.70 * r, z0, z0 + 0.32 * r * H, '#78350f', seamCol, 1.08, 1.1);
      pushBox3D(faces, proj, 0.56 * r, 0.80 * r, -0.68 * r, -0.28 * r, z0, z0 + 0.20 * r * H, '#a8a29e', seamCol, 1.05, 1.1);
      // Tall 4-legged wooden/steel watchtower on back-left roof with corrugated canopy & spotlight
      pushLatticeTower3D(faces, proj, -0.46 * r, -0.36 * r, z0 + 0.74 * r * H, z0 + 1.38 * r * H, 0.22 * r, 0.16 * r, '#78350f', seamCol);
      pushBox3D(faces, proj, -0.66 * r, -0.26 * r, -0.56 * r, -0.16 * r, z0 + 1.36 * r * H, z0 + 1.48 * r * H, baseCol, seamCol, 1.12, 1.15);
      pushTaperedBox3D(faces, proj, -0.70 * r, -0.22 * r, -0.60 * r, -0.12 * r, -0.58 * r, -0.34 * r, -0.48 * r, -0.24 * r, z0 + 1.58 * r * H, z0 + 1.72 * r * H, houseCol, seamCol, 1.18);
      if (p.ShowHazardBeacons !== false) {
        pushCylinderZ3D(faces, proj, -0.30 * r, -0.36 * r, z0 + 1.48 * r * H, z0 + 1.58 * r * H, 0.07 * r, 0.07 * r, 6, '#fef08a', seamCol, 1.35, 1.05);
      }
      flushFaces(ctx, faces);
      return;
    }

    if (defId === 'GLA_ARMS_DEALER') {
      // GLA Arms Dealer: Sandstone perimeter courtyard wall, arched corrugated steel hangar
      // draped in desert camo netting, tan Scorpion tank inside the front bay, stacked tires/treads
      // on the right, twin rear exhaust pipes, and left yellow gantry crane
      // Sandstone bastion side walls
      pushBox3D(faces, proj, -0.84 * r * SS, 0.44 * r * SS, -0.78 * r * SS, 0.78 * r * SS, z0, z0 + 0.66 * r * H, baseCol, seamCol, 1.05, 1.3);
      // Arched corrugated steel hangar barrel roof
      pushTaperedBox3D(faces, proj, -0.80 * r * SS, 0.42 * r * SS, -0.72 * r * SS, 0.72 * r * SS, -0.72 * r * SS, 0.36 * r * SS, -0.52 * r * SS, 0.52 * r * SS, z0 + 0.66 * r * H, z0 + 0.96 * r * H, '#94a3b8', seamCol, 1.18);
      pushTaperedBox3D(faces, proj, -0.72 * r * SS, 0.36 * r * SS, -0.52 * r * SS, 0.52 * r * SS, -0.66 * r * SS, 0.30 * r * SS, -0.26 * r * SS, 0.26 * r * SS, z0 + 0.96 * r * H, z0 + 1.12 * r * H, '#cbd5e1', seamCol, 1.22);
      // Olive-green camouflage netting draped across hangar roof
      pushTaperedBox3D(faces, proj, -0.54 * r * SS, 0.26 * r * SS, -0.68 * r * SS, 0.48 * r * SS, -0.44 * r * SS, 0.18 * r * SS, -0.42 * r * SS, 0.36 * r * SS, z0 + 0.76 * r * H, z0 + 1.15 * r * H, houseCol, seamCol, 1.15);
      // Wide dark interior vehicle bay + hazard rollout ramp
      pushBox3D(faces, proj, 0.22 * r * SS, 0.46 * r * SS, -0.48 * r, 0.48 * r, z0, z0 + 0.56 * r * H, '#1e293b', seamCol, 0.82, 1.15);
      pushHazardRamp3D(faces, proj, 0.42 * r * SS, 0.84 * r, -0.52 * r, 0.52 * r, z0, z0 + 0.08 * r * H, seamCol);
      // Miniature Tan & Olive Scorpion Tank being assembled inside front bay
      pushBox3D(faces, proj, 0.18 * r, 0.56 * r, -0.24 * r, 0.24 * r, z0 + 0.08 * r * H, z0 + 0.26 * r * H, '#d4b483', seamCol, 1.12, 1.15);
      pushBox3D(faces, proj, 0.24 * r, 0.46 * r, -0.16 * r, 0.16 * r, z0 + 0.26 * r * H, z0 + 0.40 * r * H, houseCol, seamCol, 1.18, 1.1);
      pushTubeSegment3D(faces, proj, 0.38 * r, 0, z0 + 0.34 * r * H, 0.08, 0, 0.38 * r, 0.04 * r, 0.03 * r, '#475569', seamCol, 1.15, 1.1);
      // Left industrial yellow A-frame hoist gantry crane
      if (p.ShowGantryCrane !== false) {
        for (const gx of [-0.62 * r, 0.18 * r]) {
          pushBox3D(faces, proj, gx - 0.06 * r, gx + 0.06 * r, -0.86 * r, -0.72 * r, z0, z0 + 1.16 * r * H * TS, '#eab308', seamCol, 1.18, 1.15);
        }
        pushBox3D(faces, proj, -0.68 * r, 0.26 * r, -0.88 * r, -0.70 * r, z0 + 1.12 * r * H * TS, z0 + 1.26 * r * H * TS, '#eab308', seamCol, 1.24, 1.2);
      }
      // Twin rear exhaust smokestacks + right yard spare tires & treads
      for (const sy of [-0.46 * r, 0.46 * r]) {
        pushCylinderZ3D(faces, proj, -0.74 * r, sy, z0 + 0.66 * r * H, z0 + 1.32 * r * H, 0.09 * r, 0.07 * r, 8, '#57534e', seamCol, 1.08, 1.15);
      }
      pushCylinderZ3D(faces, proj, 0.14 * r, 0.68 * r, z0, z0 + 0.28 * r * H, 0.12 * r, 0.12 * r, 8, '#1e293b', seamCol, 0.92, 1.05);
      flushFaces(ctx, faces);
      return;
    }

    if (defId === 'GLA_PALACE') {
      // GLA Palace: Massive Middle Eastern citadel bunker with crenelated battlements,
      // 4 corner crenelated bastion towers, central two-tier keep with sandbagged RPG awnings,
      // octagonal drum + ribbed golden dome, and outer anti-tank dragon's-teeth obstacles
      // Outer anti-tank concrete dragon's-teeth around front & flank perimeter
      for (const d of [-0.66 * r, -0.34 * r, 0.34 * r, 0.66 * r]) {
        pushTaperedBox3D(faces, proj, 0.78 * r, 0.90 * r, d - 0.06 * r, d + 0.06 * r, 0.82 * r, 0.86 * r, d - 0.02 * r, d + 0.02 * r, z0, z0 + 0.18 * r * H, '#94a3b8', seamCol, 1.15);
      }
      // Lower sandstone citadel fortress block + arched gatehouse
      pushBox3D(faces, proj, -0.78 * r * SS, 0.72 * r * SS, -0.78 * r * SS, 0.78 * r * SS, z0, z0 + 0.68 * r * H, baseCol, seamCol, 1.06, 1.3);
      pushBox3D(faces, proj, 0.56 * r * SS, 0.76 * r * SS, -0.26 * r, 0.26 * r, z0, z0 + 0.52 * r * H, '#1e293b', seamCol, 0.85, 1.15);
      // Sandbagged firing embrasure awnings on front & side walls
      for (const wy of [-0.46 * r, 0.46 * r]) {
        pushBox3D(faces, proj, 0.68 * r * SS, 0.78 * r * SS, wy - 0.14 * r, wy + 0.14 * r, z0 + 0.34 * r * H, z0 + 0.48 * r * H, '#1e293b', seamCol, 0.85, 1.1);
        pushTaperedBox3D(faces, proj, 0.66 * r * SS, 0.82 * r * SS, wy - 0.16 * r, wy + 0.16 * r, 0.66 * r * SS, 0.76 * r * SS, wy - 0.14 * r, wy + 0.14 * r, z0 + 0.48 * r * H, z0 + 0.58 * r * H, houseCol, seamCol, 1.15);
      }
      // 4 Corner crenelated bastion watchtowers
      for (const [bx, by] of [[-0.68 * r, -0.68 * r], [0.64 * r, -0.68 * r], [0.64 * r, 0.68 * r], [-0.68 * r, 0.68 * r]]) {
        pushBox3D(faces, proj, bx - 0.20 * r * SS, bx + 0.20 * r * SS, by - 0.20 * r * SS, by + 0.20 * r * SS, z0, z0 + 1.06 * r * H, hiCol, seamCol, 1.1, 1.25);
        pushBox3D(faces, proj, bx - 0.22 * r * SS, bx + 0.22 * r * SS, by - 0.22 * r * SS, by + 0.22 * r * SS, z0 + 1.06 * r * H, z0 + 1.18 * r * H, baseCol, seamCol, 1.14, 1.15);
        pushCylinderZ3D(faces, proj, bx, by, z0 + 1.18 * r * H, z0 + 1.38 * r * H, 0.16 * r, 0.05 * r, 8, houseCol, seamCol, 1.18, 1.1);
      }
      // Upper second-tier inner keep + octagonal dome drum + ribbed golden dome + finial spire
      pushBox3D(faces, proj, -0.48 * r * SS, 0.44 * r * SS, -0.48 * r * SS, 0.48 * r * SS, z0 + 0.68 * r * H, z0 + 1.02 * r * H, hiCol, seamCol, 1.1, 1.25);
      pushCylinderZ3D(faces, proj, -0.02 * r, 0, z0 + 1.02 * r * H, z0 + 1.24 * r * H, 0.40 * r * SS, 0.38 * r * SS, 8, houseCol, seamCol, 1.15, 1.2);
      pushCylinderZ3D(faces, proj, -0.02 * r, 0, z0 + 1.24 * r * H, z0 + 1.62 * r * H, 0.38 * r * SS, 0.10 * r * SS, 8, '#eab308', seamCol, 1.28, 1.25);
      pushCylinderZ3D(faces, proj, -0.02 * r, 0, z0 + 1.62 * r * H, z0 + 1.84 * r * H, 0.04 * r, 0.01 * r, 6, '#fef08a', seamCol, 1.35, 1.1);
      flushFaces(ctx, faces);
      return;
    }

    if (defId === 'GLA_BLACK_MARKET') {
      // GLA Black Market: Sandstone vault with steel bank-vault door, 3 olive canvas bazaar canopies
      // on poles, roof ridge tent + camouflaged satellite dish, wooden crates, and glowing green anthrax barrels
      pushBox3D(faces, proj, -0.80 * r * SS, 0.38 * r * SS, -0.74 * r * SS, 0.74 * r * SS, z0, z0 + 0.66 * r * H, baseCol, seamCol, 1.06, 1.3);
      // Crenelated parapet edge
      pushBox3D(faces, proj, -0.82 * r * SS, 0.40 * r * SS, -0.76 * r * SS, 0.76 * r * SS, z0 + 0.66 * r * H, z0 + 0.76 * r * H, hiCol, seamCol, 1.1, 1.2);
      // Heavy circular steel bank-vault door on front facade
      pushCylinderZ3D(faces, proj, 0.38 * r * SS, -0.14 * r, z0 + 0.12 * r * H, z0 + 0.52 * r * H, 0.18 * r, 0.18 * r, 8, '#475569', seamCol, 1.08, 1.2);
      pushCylinderZ3D(faces, proj, 0.42 * r * SS, -0.14 * r, z0 + 0.22 * r * H, z0 + 0.42 * r * H, 0.10 * r, 0.10 * r, 6, '#94a3b8', seamCol, 1.18, 1.1);
      // 3 Slanted olive-drab market bazaar canvas canopies along front & right courtyard
      for (const cy of [-0.52 * r, 0.04 * r, 0.52 * r]) {
        pushTaperedBox3D(faces, proj, 0.34 * r * SS, 0.78 * r, cy - 0.22 * r, cy + 0.22 * r, 0.34 * r * SS, 0.72 * r, cy - 0.20 * r, cy + 0.20 * r, z0 + 0.38 * r * H, z0 + 0.54 * r * H, houseCol, seamCol, 1.16);
      }
      // Rooftop merchant ridge tent + large rotating camouflaged satellite uplink dish
      pushTaperedBox3D(faces, proj, -0.68 * r * SS, 0.04 * r * SS, -0.54 * r * SS, 0.22 * r * SS, -0.56 * r * SS, -0.08 * r * SS, -0.36 * r * SS, 0.06 * r * SS, z0 + 0.76 * r * H, z0 + 1.04 * r * H, '#4d7c0f', seamCol, 1.18);
      if (p.ShowRadarDish !== false) {
        pushCylinderZ3D(faces, proj, -0.16 * r, 0.38 * r, z0 + 0.76 * r * H, z0 + 1.02 * r * H, 0.12 * r * RS, 0.10 * r * RS, 8, '#57534e', seamCol, 1.08, 1.1);
        pushCylinderZ3D(faces, proj, -0.16 * r, 0.38 * r, z0 + 1.02 * r * H, z0 + 1.32 * r * H, 0.12 * r * RS, 0.34 * r * RS, 8, hiCol, seamCol, 1.22, 1.2);
      }
      // Contraband rocket crates + glowing green anthrax barrels in front yard
      if (p.ShowSupplyPallets !== false) {
        pushBox3D(faces, proj, 0.44 * r, 0.76 * r, -0.66 * r, -0.28 * r, z0, z0 + 0.26 * r * H, '#a16207', seamCol, 1.12, 1.1);
        pushCylinderZ3D(faces, proj, 0.56 * r, 0.36 * r, z0, z0 + 0.32 * r * H, 0.11 * r, 0.11 * r, 8, '#15803d', seamCol, 1.1, 1.1);
        pushCylinderZ3D(faces, proj, 0.56 * r, 0.36 * r, z0 + 0.30 * r * H, z0 + 0.36 * r * H, 0.10 * r, 0.09 * r, 8, '#84cc16', seamCol, 1.35, 1.05);
      }
      flushFaces(ctx, faces);
      return;
    }

    if (defId === 'GLA_TUNNEL_NETWORK') {
      // GLA Tunnel Network: Earthen/sandstone mound with circular concrete tunnel portal,
      // corrugated scrap metal patches, flank camo tarps on poles, and rooftop sandbagged twin-barrel heavy MG turret
      // Sloped earthen & sandstone mound + sandbag perimeter ring
      pushCylinderZ3D(faces, proj, 0, 0, z0, z0 + 0.24 * r * H, 0.88 * r * SS, 0.82 * r * SS, 8, '#a8a29e', seamCol, 1.04, 1.2);
      pushCylinderZ3D(faces, proj, -0.06 * r, 0, z0 + 0.16 * r * H, z0 + 0.64 * r * H, 0.78 * r * SS, 0.58 * r * SS, 8, baseCol, seamCol, 1.08, 1.25);
      // Corrugated scrap metal patch panels on sides
      for (const sy of [-0.56 * r, 0.56 * r]) {
        pushBox3D(faces, proj, -0.38 * r, 0.22 * r, sy - 0.10 * r, sy + 0.10 * r, z0 + 0.26 * r * H, z0 + 0.56 * r * H, '#9a3412', seamCol, 1.12, 1.15);
      }
      // Flank olive camouflage tarp awnings on poles
      for (const sy of [-0.68 * r, 0.68 * r]) {
        pushTaperedBox3D(faces, proj, -0.44 * r, 0.34 * r, sy - 0.18 * r, sy + 0.18 * r, -0.36 * r, 0.26 * r, sy - 0.14 * r, sy + 0.14 * r, z0 + 0.42 * r * H, z0 + 0.58 * r * H, houseCol, seamCol, 1.16);
      }
      // Circular concrete subterranean tunnel portal arch + dark underground entrance
      pushBox3D(faces, proj, 0.22 * r * SS, 0.68 * r * SS, -0.44 * r, 0.44 * r, z0 + 0.08 * r * H, z0 + 0.58 * r * H, '#94a3b8', seamCol, 1.1, 1.25);
      pushBox3D(faces, proj, 0.34 * r * SS, 0.72 * r * SS, -0.32 * r, 0.32 * r, z0 + 0.08 * r * H, z0 + 0.48 * r * H, '#0f172a', seamCol, 0.78, 1.15);
      pushHazardRamp3D(faces, proj, 0.56 * r * SS, 0.88 * r, -0.38 * r, 0.38 * r, z0, z0 + 0.08 * r * H, seamCol);
      flushFaces(ctx, faces);

      // Rooftop sandbagged DShK twin-barrel heavy machine-gun turret
      const turProj = createProjector(turretAngle, pitchScale, zScale);
      const turFaces = [];
      pushCylinderZ3D(turFaces, turProj, -0.10 * r, 0, z0 + 0.64 * r * H, z0 + 0.82 * r * H, 0.36 * r * TS, 0.32 * r * TS, 8, '#a8a29e', seamCol, 1.08, 1.15);
      pushBox3D(turFaces, turProj, -0.28 * r * TS, 0.16 * r * TS, -0.24 * r * TS, 0.24 * r * TS, z0 + 0.82 * r * H, z0 + 1.08 * r * H, houseCol, seamCol, 1.15, 1.2);
      // Gunner armor shield + twin heavy MG barrels
      pushBox3D(turFaces, turProj, 0.12 * r * TS, 0.22 * r * TS, -0.28 * r * TS, 0.28 * r * TS, z0 + 0.86 * r * H, z0 + 1.16 * r * H, hiCol, seamCol, 1.18, 1.15);
      for (const by of [-0.08 * r * TS, 0.08 * r * TS]) {
        pushTubeSegment3D(turFaces, turProj, 0.16 * r - recoil, by, z0 + 0.98 * r * H, 0.12, 0, 0.76 * r * BL, 0.05 * r * TS, 0.04 * r * TS, '#1e293b', seamCol, 1.1, 1.2);
      }
      flushFaces(ctx, turFaces);
      return;
    }

    if (defId === 'GLA_STINGER_SITE') {
      // GLA Stinger Site: Circular sandbagged pit with olive-tan camo netting canopy over
      // 4 angled steel poles, green missile crates inside, and central tripod quad-Stinger SAM launcher turret
      // Outer double-tier circular sandbag revetment wall
      pushCylinderZ3D(faces, proj, 0, 0, z0, z0 + 0.32 * r * H, 0.86 * r * SS, 0.80 * r * SS, 8, baseCol, seamCol, 1.05, 1.25);
      pushCylinderZ3D(faces, proj, 0, 0, z0 + 0.32 * r * H, z0 + 0.52 * r * H, 0.80 * r * SS, 0.74 * r * SS, 8, hiCol, seamCol, 1.1, 1.2);
      // Recessed dark bunker floor pit + stacked green Stinger reload crates
      pushCylinderZ3D(faces, proj, 0, 0, z0 + 0.18 * r * H, z0 + 0.26 * r * H, 0.64 * r * SS, 0.64 * r * SS, 8, '#334155', seamCol, 0.88, 1.1);
      pushBox3D(faces, proj, -0.48 * r, -0.18 * r, 0.24 * r, 0.52 * r, z0 + 0.26 * r * H, z0 + 0.46 * r * H, '#4d7c0f', seamCol, 1.12, 1.1);
      // 4 Corner steel support poles + overhead olive-tan camouflage netting canopy ring
      for (const [px, py] of [[-0.56 * r, -0.56 * r], [0.56 * r, -0.56 * r], [0.56 * r, 0.56 * r], [-0.56 * r, 0.56 * r]]) {
        pushBox3D(faces, proj, px - 0.04 * r, px + 0.04 * r, py - 0.04 * r, py + 0.04 * r, z0 + 0.44 * r * H, z0 + 1.18 * r * H, '#57534e', seamCol, 1.05, 1.1);
      }
      pushTaperedBox3D(faces, proj, -0.74 * r * SS, 0.74 * r * SS, -0.74 * r * SS, 0.74 * r * SS, -0.52 * r * SS, 0.52 * r * SS, -0.52 * r * SS, 0.52 * r * SS, z0 + 1.14 * r * H, z0 + 1.34 * r * H, houseCol, seamCol, 1.16);
      flushFaces(ctx, faces);

      // Central swiveling tripod + dual 2-tube Stinger SAM launcher pods
      const turProj = createProjector(turretAngle, pitchScale, zScale);
      const turFaces = [];
      pushCylinderZ3D(turFaces, turProj, 0, 0, z0 + 0.26 * r * H, z0 + 0.64 * r * H, 0.22 * r * TS, 0.16 * r * TS, 8, '#475569', seamCol, 1.08, 1.15);
      pushBox3D(turFaces, turProj, -0.24 * r * TS, 0.24 * r * TS, -0.28 * r * TS, 0.28 * r * TS, z0 + 0.64 * r * H, z0 + 0.92 * r * H, baseCol, seamCol, 1.12, 1.2);
      for (const sy of [-0.32 * r * TS, 0.32 * r * TS]) {
        pushTubeSegment3D(turFaces, turProj, -0.14 * r - recoil, sy, z0 + 0.80 * r * H, 0.38, 0, 0.78 * r * BL, 0.11 * r * TS, 0.10 * r * TS, '#4d7c0f', seamCol, 1.16, 1.2);
        pushTubeSegment3D(turFaces, turProj, 0.42 * r - recoil, sy, z0 + 1.08 * r * H, 0.38, 0, 0.12 * r * BL, 0.08 * r * TS, 0.06 * r * TS, '#ef4444', seamCol, 1.25, 1.1);
      }
      flushFaces(ctx, turFaces);
      return;
    }

    if (defId === 'GLA_SCUD_STORM') {
      // GLA Scud Storm Superweapon: Square sandstone fortress with 4 sloped corner bastions,
      // yellow/black hazard stripe bands, 3 glowing lime-green exterior anthrax fuel vats on front-right wall,
      // and 9 inclined 45° green/yellow Scud-B missiles on steel erector launch gantries
      // Main fortified sandstone launch bunker + 4 sloped corner bastions
      pushBox3D(faces, proj, -0.82 * r * SS, 0.82 * r * SS, -0.82 * r * SS, 0.82 * r * SS, z0, z0 + 0.56 * r * H, baseCol, seamCol, 1.06, 1.3);
      for (const [bx, by] of [[-0.74 * r, -0.74 * r], [0.74 * r, -0.74 * r], [0.74 * r, 0.74 * r], [-0.74 * r, 0.74 * r]]) {
        pushTaperedBox3D(faces, proj, bx - 0.22 * r, bx + 0.22 * r, by - 0.22 * r, by + 0.22 * r, bx - 0.16 * r, bx + 0.16 * r, by - 0.16 * r, by + 0.16 * r, z0, z0 + 0.68 * r * H, hiCol, seamCol, 1.14);
      }
      // Yellow/black hazard stripe trim along launch bay deck
      pushHazardRamp3D(faces, proj, -0.68 * r, 0.68 * r, -0.68 * r, 0.68 * r, z0 + 0.56 * r * H, z0 + 0.64 * r * H, seamCol);
      // 3 Glowing lime-green cylindrical Anthrax toxin fuel vats mounted on front-right wall
      for (const vx of [-0.36 * r, 0, 0.36 * r]) {
        pushCylinderZ3D(faces, proj, vx, 0.84 * r * SS, z0 + 0.08 * r * H, z0 + 0.52 * r * H, 0.13 * r, 0.13 * r, 8, '#15803d', seamCol, 1.12, 1.15);
        pushCylinderZ3D(faces, proj, vx, 0.84 * r * SS, z0 + 0.20 * r * H, z0 + 0.42 * r * H, 0.14 * r, 0.14 * r, 8, '#84cc16', seamCol, 1.35, 1.1);
      }
      // 3x3 Array of 9 inclined Scud-B ballistic missiles on steel erector rails with green/yellow warheads
      const offsets = [-0.38 * r, 0, 0.38 * r];
      for (const mx of offsets) {
        for (const my of offsets) {
          // Steel erector gantry rail
          pushTubeSegment3D(faces, proj, mx - 0.06 * r, my - 0.05 * r, z0 + 0.64 * r * H, 0.82, 0, 0.72 * r * H * BL, 0.05 * r * TS, 0.04 * r * TS, '#475569', seamCol, 1.05, 1.1);
          // Olive-green Scud-B missile body
          pushTubeSegment3D(faces, proj, mx, my, z0 + 0.66 * r * H, 0.82, 0, 0.68 * r * H * BL, 0.10 * r * TS, 0.09 * r * TS, houseCol, seamCol, 1.16, 1.2);
          // Glowing lime-green & yellow Anthrax warhead nosecone
          const tipX = mx + Math.cos(0.82) * 0.68 * r * H * BL;
          const tipZ = z0 + 0.66 * r * H + Math.sin(0.82) * 0.68 * r * H * BL;
          pushTubeSegment3D(faces, proj, tipX, my, tipZ, 0.82, 0, 0.24 * r * H * BL, 0.09 * r * TS, 0.02 * r * TS, '#84cc16', seamCol, 1.35, 1.15);
        }
      }
      flushFaces(ctx, faces);
      return;
    }

    // GLA_DEMO_TRAP: Camouflaged sandbag & scrap-metal IED mound with clustered red/green explosive barrels + blinking fuse
    pushCylinderZ3D(faces, proj, 0, 0, z0, z0 + 0.28 * r * H, 0.76 * r * SS, 0.66 * r * SS, 8, baseCol, seamCol, 1.05, 1.2);
    pushTaperedBox3D(faces, proj, -0.54 * r, 0.54 * r, -0.54 * r, 0.54 * r, -0.38 * r, 0.38 * r, -0.38 * r, 0.38 * r, z0 + 0.24 * r * H, z0 + 0.46 * r * H, houseCol, seamCol, 1.15);
    for (const [bx, by, col] of [[-0.22 * r, -0.18 * r, '#dc2626'], [0.22 * r, -0.14 * r, '#dc2626'], [0, 0.22 * r, '#84cc16']]) {
      pushCylinderZ3D(faces, proj, bx, by, z0 + 0.28 * r * H, z0 + 0.66 * r * H, 0.16 * r, 0.16 * r, 8, col, seamCol, 1.2, 1.15);
    }
    const pulse = 0.5 + 0.5 * Math.sin(t * 6.0);
    pushCylinderZ3D(faces, proj, 0, 0, z0 + 0.66 * r * H, z0 + 0.82 * r * H, 0.08 * r, 0.08 * r, 6, pulse > 0.5 ? '#ef4444' : '#fef08a', seamCol, 1.35, 1.1);
    flushFaces(ctx, faces);
  }

  function renderTechBuildingModel(ctx, u, faction, params, options) {
    const p = Object.assign({}, BUILDING_DEFAULT_PARAMS, {
      armorBaseColor: '#e2e8f0',
      armorHighlightColor: '#f8fafc',
      armorShadowColor: '#64748b',
      houseColor: '#0ea5e9'
    }, params || {});
    const opts = options || {};
    const defId = u.defId || (u.def && u.def.id) || 'TECH_OIL_DERRICK';
    const r = (u.radius || ((u.def && u.def.size) ? u.def.size * 0.46 : 32)) * (p.footprintScale || 1.0);
    const H = (p.structureHeight || 1.0) * (p.extrusionDepth || 1.0);
    const SS = p.superstructureScale || 1.0;
    const t = (typeof performance !== 'undefined' ? performance.now() * 0.001 : 0) + (u.treadPhase || 0) * 6.0;
    const baseAngle = (u.angle !== undefined ? u.angle : 0.68);
    const pitchScale = opts.pitchScale !== undefined ? opts.pitchScale : 0.64;
    const zScale = opts.zScale !== undefined ? opts.zScale : 0.78;

    const baseCol = p.armorBaseColor || '#e2e8f0';
    const hiCol = p.armorHighlightColor || '#f8fafc';
    const shCol = p.armorShadowColor || '#64748b';
    const houseCol = (faction && faction.color) || p.houseColor || '#0ea5e9';
    const seamCol = '#2b241f';

    const proj = createProjector(baseAngle, pitchScale, zScale);
    const faces = [];
    const z0 = renderBuildingCompoundBase3D(ctx, faces, proj, r, p, baseCol, hiCol, shCol, houseCol, seamCol, false);

    if (defId === 'TECH_OIL_DERRICK') {
      // Twin white/grey crude oil storage tanks + pipelines + tall steel lattice derrick tower + reciprocating pumpjack horsehead
      for (const ty of [-0.46 * r, 0.46 * r]) {
        pushCylinderZ3D(faces, proj, -0.48 * r, ty, z0, z0 + 0.68 * r * H, 0.26 * r * SS, 0.26 * r * SS, 8, hiCol, seamCol, 1.12, 1.2);
        pushCylinderZ3D(faces, proj, -0.48 * r, ty, z0 + 0.28 * r * H, z0 + 0.40 * r * H, 0.27 * r * SS, 0.27 * r * SS, 8, houseCol, seamCol, 1.18, 1.1);
      }
      // Pump control generator shed + hazard trim
      pushBox3D(faces, proj, -0.22 * r, 0.36 * r, -0.68 * r, -0.28 * r, z0, z0 + 0.42 * r * H, baseCol, seamCol, 1.06, 1.2);
      // Tall open-frame steel lattice derrick tower + red/white crown block
      pushLatticeTower3D(faces, proj, 0.18 * r, 0.14 * r, z0, z0 + 1.56 * r * H, 0.34 * r * SS, 0.12 * r * SS, '#475569', seamCol);
      pushBox3D(faces, proj, 0.04 * r, 0.32 * r, 0.00 * r, 0.28 * r, z0 + 1.56 * r * H, z0 + 1.70 * r * H, '#ef4444', seamCol, 1.25, 1.15);
      // Animated nodding-donkey walking beam + yellow horsehead
      const nod = Math.sin(t * 2.8) * 0.20;
      pushBox3D(faces, proj, -0.06 * r, 0.12 * r, -0.08 * r, 0.08 * r, z0, z0 + 0.72 * r * H, '#334155', seamCol, 1.05, 1.15);
      pushTubeSegment3D(faces, proj, -0.24 * r, 0, z0 + 0.74 * r * H, nod, 0, 0.76 * r, 0.09 * r, 0.11 * r, '#f59e0b', seamCol, 1.22, 1.2);
      flushFaces(ctx, faces);
      return;
    }

    if (defId === 'TECH_HOSPITAL') {
      // Multi-wing white-and-red Military Field Hospital + emergency ambulance bay + rooftop Red Cross helipad
      pushBox3D(faces, proj, -0.82 * r * SS, 0.68 * r * SS, -0.76 * r * SS, 0.76 * r * SS, z0, z0 + 0.64 * r * H, hiCol, seamCol, 1.1, 1.25);
      // Blue-tinted hospital window ribbon bands
      pushBox3D(faces, proj, -0.84 * r * SS, 0.70 * r * SS, -0.78 * r * SS, 0.78 * r * SS, z0 + 0.32 * r * H, z0 + 0.46 * r * H, '#38bdf8', seamCol, 1.2, 1.1);
      // Upper surgical ward tower
      pushBox3D(faces, proj, -0.66 * r * SS, 0.36 * r * SS, -0.58 * r * SS, 0.58 * r * SS, z0 + 0.64 * r * H, z0 + 1.14 * r * H, baseCol, seamCol, 1.08, 1.25);
      // Front emergency ambulance canopy + Red Cross emblem on roof & facade
      pushBox3D(faces, proj, 0.36 * r * SS, 0.82 * r * SS, -0.36 * r, 0.36 * r, z0 + 0.34 * r * H, z0 + 0.48 * r * H, '#ef4444', seamCol, 1.2, 1.15);
      pushCylinderZ3D(faces, proj, -0.15 * r, 0, z0 + 1.14 * r * H, z0 + 1.18 * r * H, 0.38 * r, 0.38 * r, 8, '#f8fafc', seamCol, 1.2, 1.1);
      pushBox3D(faces, proj, -0.36 * r, 0.06 * r, -0.09 * r, 0.09 * r, z0 + 1.18 * r * H, z0 + 1.24 * r * H, '#ef4444', seamCol, 1.28, 1.1);
      pushBox3D(faces, proj, -0.24 * r, -0.06 * r, -0.21 * r, 0.21 * r, z0 + 1.18 * r * H, z0 + 1.24 * r * H, '#ef4444', seamCol, 1.28, 1.1);
      flushFaces(ctx, faces);
      return;
    }

    if (defId === 'TECH_REPAIR_BAY') {
      // Heavy Armored Vehicle Repair Depot + service pit apron + overhead yellow bridge crane + welding beacons
      pushBox3D(faces, proj, -0.82 * r * SS, 0.16 * r * SS, -0.76 * r * SS, 0.76 * r * SS, z0, z0 + 0.68 * r * H, baseCol, seamCol, 1.06, 1.25);
      pushTaperedBox3D(faces, proj, -0.84 * r * SS, 0.18 * r * SS, -0.78 * r * SS, 0.78 * r * SS, -0.68 * r * SS, 0.08 * r * SS, -0.60 * r * SS, 0.60 * r * SS, z0 + 0.68 * r * H, z0 + 0.90 * r * H, shCol, seamCol, 1.16);
      // Open front vehicle repair pad with hazard stripes & dark inspection pit
      pushHazardRamp3D(faces, proj, 0.16 * r, 0.84 * r, -0.68 * r, 0.68 * r, z0, z0 + 0.08 * r * H, seamCol);
      pushBox3D(faces, proj, 0.28 * r, 0.72 * r, -0.44 * r, 0.44 * r, z0 + 0.08 * r * H, z0 + 0.14 * r * H, '#1e293b', seamCol, 0.85, 1.15);
      // Overhead yellow steel service gantry spanning the repair pad
      for (const gy of [-0.66 * r, 0.66 * r]) {
        pushBox3D(faces, proj, 0.38 * r, 0.54 * r, gy - 0.06 * r, gy + 0.06 * r, z0 + 0.08 * r * H, z0 + 1.06 * r * H, '#eab308', seamCol, 1.18, 1.15);
      }
      pushBox3D(faces, proj, 0.34 * r, 0.58 * r, -0.72 * r, 0.72 * r, z0 + 1.02 * r * H, z0 + 1.18 * r * H, '#eab308', seamCol, 1.24, 1.2);
      flushFaces(ctx, faces);
      return;
    }

    // CIV_GARRISON_BUNKER: Fortified concrete urban command blockhouse with sandbagged roof & 2 tiers of firing slits
    pushBox3D(faces, proj, -0.76 * r * SS, 0.76 * r * SS, -0.76 * r * SS, 0.76 * r * SS, z0, z0 + 0.46 * r * H, baseCol, seamCol, 1.06, 1.25);
    pushBox3D(faces, proj, -0.78 * r * SS, 0.78 * r * SS, -0.78 * r * SS, 0.78 * r * SS, z0 + 0.46 * r * H, z0 + 0.58 * r * H, '#1e293b', seamCol, 0.82, 1.15);
    pushBox3D(faces, proj, -0.76 * r * SS, 0.76 * r * SS, -0.76 * r * SS, 0.76 * r * SS, z0 + 0.58 * r * H, z0 + 0.96 * r * H, hiCol, seamCol, 1.1, 1.25);
    pushBox3D(faces, proj, -0.78 * r * SS, 0.78 * r * SS, -0.78 * r * SS, 0.78 * r * SS, z0 + 0.96 * r * H, z0 + 1.08 * r * H, '#1e293b', seamCol, 0.82, 1.15);
    pushBox3D(faces, proj, -0.80 * r * SS, 0.80 * r * SS, -0.80 * r * SS, 0.80 * r * SS, z0 + 1.08 * r * H, z0 + 1.24 * r * H, baseCol, seamCol, 1.14, 1.2);
    pushBox3D(faces, proj, -0.58 * r * SS, 0.58 * r * SS, -0.58 * r * SS, 0.58 * r * SS, z0 + 1.24 * r * H, z0 + 1.38 * r * H, houseCol, seamCol, 1.18, 1.15);
    flushFaces(ctx, faces);
  }


  // ==========================================================================
  // 13. Complete Registry of All USA, China & GLA Units + 35 Buildings
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
    armorBaseColor: '#6e7b4f',
    armorHighlightColor: '#879663',
    armorShadowColor: '#4a5434',
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
      referenceImage: 'assets/refs/china_dozer_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_dozer.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Olive PLA Bulldozer • Rear Crane Boom & Winch Hook • Red Star Emblem',
      defaultParams: Object.assign({}, DOZER_DEFAULT_PARAMS, { armorBaseColor: '#6e7b4f', armorHighlightColor: '#879663', armorShadowColor: '#4a5434', houseColor: '#dc2626', showRearCrane: true }),
      paramSchema: DOZER_PARAM_SCHEMA,
      presets: DOZER_PRESETS,
      render: renderDozerModel
    },
    CHINA_SUPPLY_TRUCK: {
      defId: 'CHINA_SUPPLY_TRUCK',
      modelCode: 'CHINA — PLA SUPPLY CARGO TRUCK',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_supply_truck_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_supply_truck.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • 6×6 Olive Military Hauler • Arched Khaki-Tan Canvas Tarpaulin Bed',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS),
      paramSchema: CHINA_WHEELED_PARAM_SCHEMA,
      presets: CHINA_WHEELED_PRESETS,
      render: renderChinaWheeledModel
    },
    CHINA_BATTLEMASTER: {
      defId: 'CHINA_BATTLEMASTER',
      modelCode: 'CHINA — TYPE-98 BATTLEMASTER MBT',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_battlemaster_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_battlemaster.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Sloped Turret Cheeks • 125mm Bore-Evacuator Cannon • Rear Stowage Basket',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS),
      paramSchema: CHINA_TANK_PARAM_SCHEMA,
      presets: CHINA_TANK_PRESETS,
      render: renderChinaTankModel
    },
    CHINA_NUKE_BATTLEMASTER: {
      defId: 'CHINA_NUKE_BATTLEMASTER',
      modelCode: 'CHINA — NUCLEAR BATTLEMASTER (GEN. TAO)',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_battlemaster_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_battlemaster.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Depleted Uranium Shells • Isotope Reactor Drive • 125mm Cannon',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS, { armorBaseColor: '#7c8464', armorHighlightColor: '#98a37a', houseColor: '#84cc16' }),
      paramSchema: CHINA_TANK_PARAM_SCHEMA,
      presets: CHINA_TANK_PRESETS,
      render: renderChinaTankModel
    },
    CHINA_GATTLING_TANK: {
      defId: 'CHINA_GATTLING_TANK',
      modelCode: 'CHINA — ROTARY GATTLING TANK',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_gattling_tank_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_gattling_tank.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • 6-Barrel Rotary Gattling Cannon • 5 Road Wheels • Anti-Air / Anti-Infantry',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS),
      paramSchema: CHINA_TANK_PARAM_SCHEMA,
      presets: CHINA_TANK_PRESETS,
      render: renderChinaTankModel
    },
    CHINA_DRAGON_TANK: {
      defId: 'CHINA_DRAGON_TANK',
      modelCode: 'CHINA — DRAGON FLAME TANK',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_dragon_tank_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_dragon_tank.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Sculpted Dragon Head Flame Cowl • Transverse Crimson Napalm Tank • Flame Plume',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS, { armorBaseColor: '#6e7b4f', armorHighlightColor: '#879663', armorShadowColor: '#4a5434', houseColor: '#dc2626' }),
      paramSchema: CHINA_TANK_PARAM_SCHEMA,
      presets: CHINA_TANK_PRESETS,
      render: renderChinaTankModel
    },
    CHINA_INFERNO_CANNON: {
      defId: 'CHINA_INFERNO_CANNON',
      modelCode: 'CHINA — INFERNO NAPALM ARTILLERY',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_inferno_cannon_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_inferno_cannon.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Open-Top Trunnion Pedestal • Stepped Napalm Howitzer • Rear Recoil Spade',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS, { houseColor: '#dc2626' }),
      paramSchema: CHINA_ARTILLERY_PARAM_SCHEMA,
      presets: CHINA_ARTILLERY_PRESETS,
      render: renderChinaArtilleryModel
    },
    CHINA_NUKE_CANNON: {
      defId: 'CHINA_NUKE_CANNON',
      modelCode: 'CHINA — TACTICAL NUCLEAR SIEGE CANNON',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_nuke_cannon_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_nuke_cannon.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Articulated Twin-Track Carrier • Bulbous Nuclear Breech • Radiation Trefoil ☢',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS, { hullScale: 1.08, houseColor: '#dc2626' }),
      paramSchema: CHINA_ARTILLERY_PARAM_SCHEMA,
      presets: CHINA_ARTILLERY_PRESETS,
      render: renderChinaArtilleryModel
    },
    CHINA_ECM_TANK: {
      defId: 'CHINA_ECM_TANK',
      modelCode: 'CHINA — ECM ELECTRONIC WARFARE TANK',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_gattling_tank_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_gattling_tank.png',
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
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Twin 125mm Bore-Evacuator Cannons • Roof Gatling Turret • 6 Road Wheels',
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
      referenceImage: 'assets/refs/china_supply_truck_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_supply_truck.png',
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
      referenceImage: 'assets/refs/china_supply_truck_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_supply_truck.png',
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
      referenceImage: 'assets/refs/china_supply_truck_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_supply_truck.png',
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
      referenceImage: 'assets/refs/china_supply_truck_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_supply_truck.png',
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
      referenceImage: 'assets/refs/china_supply_truck_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_supply_truck.png',
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
      referenceImage: 'assets/refs/china_mig_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_mig.png',
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
      referenceImage: 'assets/refs/china_mig_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_mig.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Slate-Grey MiG-1.44 Delta-Canard • Twin Canted Tails • 4 Underwing Firestorm Missiles',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS, { armorBaseColor: '#94a3b8', armorHighlightColor: '#cbd5e1', armorShadowColor: '#475569', houseColor: '#dc2626' }),
      paramSchema: MIG_PARAM_SCHEMA,
      presets: MIG_PRESETS,
      render: renderMigModel
    },
    CHINA_NUKE_MIG: {
      defId: 'CHINA_NUKE_MIG',
      modelCode: 'CHINA — TACTICAL NUCLEAR MIG (GEN. TAO)',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_mig_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_mig.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Tactical Nuclear Air-to-Surface Missiles • Supersonic Interceptor',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS, { armorBaseColor: '#7c8464', armorHighlightColor: '#98a37a', armorShadowColor: '#4a5434', houseColor: '#84cc16' }),
      paramSchema: MIG_PARAM_SCHEMA,
      presets: MIG_PRESETS,
      render: renderMigModel
    },
    CHINA_TACTICAL_NUKEMIG: {
      defId: 'CHINA_TACTICAL_NUKEMIG',
      modelCode: 'CHINA — TACTICAL NUCLEAR MIG (GEN. TAO)',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_mig_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_mig.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Tactical Nuclear Air-to-Surface Missiles • Supersonic Interceptor',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS, { armorBaseColor: '#7c8464', armorHighlightColor: '#98a37a', armorShadowColor: '#4a5434', houseColor: '#84cc16' }),
      paramSchema: MIG_PARAM_SCHEMA,
      presets: MIG_PRESETS,
      render: renderMigModel
    },
    CHINA_RED_GUARD: {
      defId: 'CHINA_RED_GUARD',
      modelCode: 'CHINA — PLA RED GUARD RIFLE SQUAD',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_red_guard_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_red_guard.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Olive Helmet + Red Star • Khaki-Olive Camo Fatigues • Type-81 Rifle • [⊕] Callout',
      defaultParams: Object.assign({}, INFANTRY_DEFAULT_PARAMS, { helmetColor: '#6e7b4f', uniformColor: '#8c8265', vestColor: '#5c6446' }),
      paramSchema: INFANTRY_PARAM_SCHEMA,
      presets: INFANTRY_PRESETS,
      render: renderInfantryModel
    },
    CHINA_MINIGUNNER: {
      defId: 'CHINA_MINIGUNNER',
      modelCode: 'CHINA — ELITE GATTLING MINIGUNNER (GEN. FAI)',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_red_guard_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_red_guard.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Handheld Rotary Gattling Minigun • Anti-Infantry & Anti-Air Suppression',
      defaultParams: Object.assign({}, INFANTRY_DEFAULT_PARAMS, { helmetColor: '#7f1d1d', uniformColor: '#6e7b4f', vestColor: '#991b1b' }),
      paramSchema: INFANTRY_PARAM_SCHEMA,
      presets: INFANTRY_PRESETS,
      render: renderInfantryModel
    },
    CHINA_TANK_HUNTER: {
      defId: 'CHINA_TANK_HUNTER',
      modelCode: 'CHINA — PLA ANTI-ARMOR TANK HUNTER',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_tank_hunter_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_tank_hunter.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Olive Helmet + Red Star • Shoulder-Fired Anti-Tank Rocket Tube • [🚀] Callout',
      defaultParams: Object.assign({}, MISSILE_DEFENDER_DEFAULT_PARAMS, { helmetColor: '#6e7b4f', uniformColor: '#6e7b4f', vestColor: '#4a5434', showGoggles: false }),
      paramSchema: INFANTRY_PARAM_SCHEMA,
      presets: INFANTRY_PRESETS,
      render: renderInfantryModel
    },
    CHINA_HACKER: {
      defId: 'CHINA_HACKER',
      modelCode: 'CHINA — PLA CYBER WARFARE HACKER',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_hacker_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_hacker.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Olive Helmet + Round Glasses • Open Silver Field Laptop • [((•))] Callout',
      defaultParams: Object.assign({}, PATHFINDER_DEFAULT_PARAMS, { helmetColor: '#6e7b4f', uniformColor: '#6e7b4f', vestColor: '#4a5434' }),
      paramSchema: INFANTRY_PARAM_SCHEMA,
      presets: INFANTRY_PRESETS,
      render: renderInfantryModel
    },
    CHINA_SUPER_HACKER: {
      defId: 'CHINA_SUPER_HACKER',
      modelCode: 'CHINA — ELITE STEALTH HACKER (GEN. FAI)',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_hacker_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_hacker.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Stealthed Cyber Operative • Open Field Laptop • Accelerated Cash Siphon',
      defaultParams: Object.assign({}, PATHFINDER_DEFAULT_PARAMS, { helmetColor: '#475569', uniformColor: '#64748b', vestColor: '#334155' }),
      paramSchema: INFANTRY_PARAM_SCHEMA,
      presets: INFANTRY_PRESETS,
      render: renderInfantryModel
    },
    CHINA_BLACK_LOTUS: {
      defId: 'CHINA_BLACK_LOTUS',
      modelCode: 'CHINA — BLACK LOTUS ELITE CYBER AGENT',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/china_black_lotus_diorama_ref.png',
      spriteImage: 'assets/diorama/units/china_black_lotus.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Dark Hair & Wrap Sunglasses • Belted Crimson Trench Coat • [🪷] Lotus Callout',
      defaultParams: Object.assign({}, PATHFINDER_DEFAULT_PARAMS, { helmetColor: '#27272a', uniformColor: '#b91c1c', vestColor: '#dc2626' }),
      paramSchema: INFANTRY_PARAM_SCHEMA,
      presets: INFANTRY_PRESETS,
      render: renderInfantryModel
    },

    // --- GLOBAL LIBERATION ARMY (GLA) UNITS ---
    GLA_WORKER: {
      defId: 'GLA_WORKER',
      modelCode: 'GLA — FIELD LABORER & BUILDER WORKER',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/gla_worker_diorama_ref.png',
      spriteImage: 'assets/diorama/units/gla_worker.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Olive Field Cap • 3D Wooden Supply Crate with Diagonal Cross-Brace',
      defaultParams: Object.assign({}, INFANTRY_DEFAULT_PARAMS, { helmetColor: '#7c8a5e', uniformColor: '#6b7a52', vestColor: '#55623e', showGoggles: false, showStatusBubble: false }),
      paramSchema: INFANTRY_PARAM_SCHEMA,
      presets: INFANTRY_PRESETS,
      render: renderInfantryModel
    },
    GLA_REBEL: {
      defId: 'GLA_REBEL',
      modelCode: 'GLA — GUERRILLA REBEL FIGHTER',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/gla_rebel_diorama_ref.png',
      spriteImage: 'assets/diorama/units/gla_rebel.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Olive Helmet + Ballistic Goggles • Desert Camo Fatigues • AK-47 Rifle • [⊕] Callout',
      defaultParams: Object.assign({}, INFANTRY_DEFAULT_PARAMS, { helmetColor: '#6e7b4f', uniformColor: '#a89870', vestColor: '#6b7052' }),
      paramSchema: INFANTRY_PARAM_SCHEMA,
      presets: INFANTRY_PRESETS,
      render: renderInfantryModel
    },
    GLA_RPG_TROOPER: {
      defId: 'GLA_RPG_TROOPER',
      modelCode: 'GLA — ANTI-ARMOR RPG-7 TROOPER',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/gla_rpg_trooper_diorama_ref.png',
      spriteImage: 'assets/diorama/units/gla_rpg_trooper.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Olive Kevlar Helmet • Shoulder-Fired RPG-7 Conical Warhead • [🛡️] Blue Shield Callout',
      defaultParams: Object.assign({}, MISSILE_DEFENDER_DEFAULT_PARAMS, { helmetColor: '#637349', uniformColor: '#5c6e46', vestColor: '#4b5938' }),
      paramSchema: INFANTRY_PARAM_SCHEMA,
      presets: INFANTRY_PRESETS,
      render: renderInfantryModel
    },
    GLA_TERRORIST: {
      defId: 'GLA_TERRORIST',
      modelCode: 'GLA — DEMOLITION SABOTEUR',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/gla_rebel_diorama_ref.png',
      spriteImage: 'assets/diorama/units/gla_rebel.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • High-Explosive Demolition Vest • Dead-Man Trigger • [🧨] Callout',
      defaultParams: Object.assign({}, INFANTRY_DEFAULT_PARAMS, { helmetColor: '#dc2626', uniformColor: '#a89870', vestColor: '#b91c1c' }),
      paramSchema: INFANTRY_PARAM_SCHEMA,
      presets: INFANTRY_PRESETS,
      render: renderInfantryModel
    },
    GLA_HIJACKER: {
      defId: 'GLA_HIJACKER',
      modelCode: 'GLA — STEALTH VEHICLE HIJACKER (PRINCE KASSAD)',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/gla_jarmen_kell_diorama_ref.png',
      spriteImage: 'assets/diorama/units/gla_jarmen_kell.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Camouflaged Vehicle Infiltrator • Breaching Tool • [🔧] Wrench Callout',
      defaultParams: Object.assign({}, PATHFINDER_DEFAULT_PARAMS, { helmetColor: '#4b5938', uniformColor: '#5c6e46', vestColor: '#3b462b' }),
      paramSchema: INFANTRY_PARAM_SCHEMA,
      presets: INFANTRY_PRESETS,
      render: renderInfantryModel
    },
    GLA_ANGRY_MOB: {
      defId: 'GLA_ANGRY_MOB',
      modelCode: 'GLA — ANGRY INSURGENT MOB (AK-47 & MOLOTOV)',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/gla_rebel_diorama_ref.png',
      spriteImage: 'assets/diorama/units/gla_rebel.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Multi-Figure Insurgent Squad • AK-47s & Molotov Cocktails • [🔥] Callout',
      defaultParams: Object.assign({}, INFANTRY_DEFAULT_PARAMS, { helmetColor: '#b45309', uniformColor: '#a89870', vestColor: '#78350f' }),
      paramSchema: INFANTRY_PARAM_SCHEMA,
      presets: INFANTRY_PRESETS,
      render: renderInfantryModel
    },
    GLA_JARMEN_KELL: {
      defId: 'GLA_JARMEN_KELL',
      modelCode: 'GLA — JARMEN KELL LEGENDARY SNIPER HERO',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/gla_jarmen_kell_diorama_ref.png',
      spriteImage: 'assets/diorama/units/gla_jarmen_kell.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Olive Helmet & Tunic • Long-Barrel Scoped Sniper Rifle • [🔧] Wrench Callout',
      defaultParams: Object.assign({}, PATHFINDER_DEFAULT_PARAMS, { helmetColor: '#637349', uniformColor: '#5c6e46', vestColor: '#4b5938' }),
      paramSchema: INFANTRY_PARAM_SCHEMA,
      presets: INFANTRY_PRESETS,
      render: renderInfantryModel
    },
    GLA_SCORPION: {
      defId: 'GLA_SCORPION',
      modelCode: 'GLA — SCORPION LIGHT BATTLE TANK',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/gla_scorpion_diorama_ref.png',
      spriteImage: 'assets/diorama/units/gla_scorpion.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Desert-Tan Hull ("6" Stencil) • Twin Turret Hatches • 90mm Cannon • Whip Antenna',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS, { armorBaseColor: '#d6b278', armorHighlightColor: '#e8c992', armorShadowColor: '#9c7a44', houseColor: '#5c6e46', ShowUpgradeKit: false }),
      paramSchema: GLA_TANK_PARAM_SCHEMA,
      presets: GLA_TANK_PRESETS,
      render: renderGlaTankModel
    },
    GLA_MARAUDER: {
      defId: 'GLA_MARAUDER',
      modelCode: 'GLA — MARAUDER SALVAGE HEAVY TANK',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/gla_marauder_diorama_ref.png',
      spriteImage: 'assets/diorama/units/gla_marauder.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Heavy Olive-Drab Armor • 6 Road Wheels • Commander Cupola • Twin Heavy Cannons',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS, { armorBaseColor: '#637349', armorHighlightColor: '#7a8c5b', armorShadowColor: '#445032', houseColor: '#587838' }),
      paramSchema: GLA_TANK_PARAM_SCHEMA,
      presets: GLA_TANK_PRESETS,
      render: renderGlaTankModel
    },
    GLA_QUAD_CANNON: {
      defId: 'GLA_QUAD_CANNON',
      modelCode: 'GLA — ZSU-23-4 QUAD CANNON HALF-TRACK',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/gla_quad_cannon_diorama_ref.png',
      spriteImage: 'assets/diorama/units/gla_quad_cannon.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Olive Half-Track (Front Steered Wheels + Rear Tracks) • Split Windshield • Twin Boxy Quad-AA Pods',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS, { armorBaseColor: '#637349', armorHighlightColor: '#7a8c5b', armorShadowColor: '#445032', houseColor: '#9a3412' }),
      paramSchema: GLA_TANK_PARAM_SCHEMA,
      presets: GLA_TANK_PRESETS,
      render: renderGlaTankModel
    },
    GLA_TOXIN_TRACTOR: {
      defId: 'GLA_TOXIN_TRACTOR',
      modelCode: 'GLA — ANTHRAX BIO-TOXIN TRACTOR',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/gla_toxin_tractor_diorama_ref.png',
      spriteImage: 'assets/diorama/units/gla_toxin_tractor.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • 6-Wheeled Olive Tractor Truck • 3 Glowing Neon-Green Cylindrical Anthrax Vats • Bio-Sprayer Nozzle',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS, { armorBaseColor: '#637349', armorHighlightColor: '#7a8c5b', armorShadowColor: '#445032', houseColor: '#4ade80' }),
      paramSchema: GLA_TANK_PARAM_SCHEMA,
      presets: GLA_TANK_PRESETS,
      render: renderGlaTankModel
    },
    GLA_TECHNICAL: {
      defId: 'GLA_TECHNICAL',
      modelCode: 'GLA — IMPROVISED TECHNICAL PICKUP',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/gla_technical_diorama_ref.png',
      spriteImage: 'assets/diorama/units/gla_technical.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Desert-Tan 4×4 Pickup • Glass Cab & Black Grille • Bed-Mounted Olive DShK Gun with Shield',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS, { armorBaseColor: '#c8a064', armorHighlightColor: '#dfb87c', armorShadowColor: '#8c6b3c', houseColor: '#5c6e46' }),
      paramSchema: GLA_WHEELED_PARAM_SCHEMA,
      presets: GLA_WHEELED_PRESETS,
      render: renderGlaWheeledModel
    },
    GLA_COMBAT_CYCLE: {
      defId: 'GLA_COMBAT_CYCLE',
      modelCode: 'GLA — DEMOLITION COMBAT CYCLE (GEN. JUHZIZ)',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/gla_combat_cycle_diorama_ref.png',
      spriteImage: 'assets/diorama/units/gla_combat_cycle.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Off-Road Motocross Dirtbike • Knobby Tires & Silver Forks • Olive Fairings & Contoured Seat',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS, { armorBaseColor: '#6e843b', armorHighlightColor: '#849b48', armorShadowColor: '#4b5928', houseColor: '#cbd5e1' }),
      paramSchema: GLA_WHEELED_PARAM_SCHEMA,
      presets: GLA_WHEELED_PRESETS,
      render: renderGlaWheeledModel
    },
    GLA_ROCKET_BUGGY: {
      defId: 'GLA_ROCKET_BUGGY',
      modelCode: 'GLA — HIGH-SPEED ARTILLERY ROCKET BUGGY',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/gla_rocket_buggy_diorama_ref.png',
      spriteImage: 'assets/diorama/units/gla_rocket_buggy.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Desert-Tan Tubular Sand-Rail Buggy • 3D Roll-Cage • Roof Olive Rockets with Red Warhead Tips',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS, { armorBaseColor: '#c8a064', armorHighlightColor: '#dfb87c', armorShadowColor: '#8c6b3c', houseColor: '#5c6e46' }),
      paramSchema: GLA_WHEELED_PARAM_SCHEMA,
      presets: GLA_WHEELED_PRESETS,
      render: renderGlaWheeledModel
    },
    GLA_BOMB_TRUCK: {
      defId: 'GLA_BOMB_TRUCK',
      modelCode: 'GLA — DISGUISED HIGH-EXPLOSIVE BOMB TRUCK',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/gla_toxin_tractor_diorama_ref.png',
      spriteImage: 'assets/diorama/units/gla_toxin_tractor.png',
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
      referenceImage: 'assets/refs/gla_scud_launcher_diorama_ref.png',
      spriteImage: 'assets/diorama/units/gla_scud_launcher.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • 8×8 Olive Split-Cab TEL • Rear Stabilizer Jacks • Twin Scud-B Missiles with Red Warhead Bands',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS, { armorBaseColor: '#637349', armorHighlightColor: '#7a8c5b', armorShadowColor: '#445032', houseColor: '#ea580c', payloadPitch: 0.06 }),
      paramSchema: GLA_WHEELED_PARAM_SCHEMA,
      presets: GLA_WHEELED_PRESETS,
      render: renderGlaWheeledModel
    },
    GLA_BATTLE_BUS: {
      defId: 'GLA_BATTLE_BUS',
      modelCode: 'GLA — UP-ARMORED FORTIFIED BATTLE BUS',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/refs/gla_quad_cannon_diorama_ref.png',
      spriteImage: 'assets/diorama/units/gla_quad_cannon.png',
      credits: 'Illustrated Isometric Ligne-Claire Diorama • Scrap-Armored Cowcatcher Bus • 8 Garrison Firing Slits • Second-Life Bunker',
      defaultParams: Object.assign({}, FACTION_VEHICLE_DEFAULTS, { armorBaseColor: '#c29b61', armorHighlightColor: '#d9b57c', armorShadowColor: '#8c6b3c', houseColor: '#65a30d' }),
      paramSchema: GLA_WHEELED_PARAM_SCHEMA,
      presets: GLA_WHEELED_PRESETS,
      render: renderGlaWheeledModel
    },

    // ========================================================================
    // --- USA MILITARY BUILDINGS (10 STRUCTURES) ---
    // ========================================================================
    USA_COMMAND_CENTER: {
      defId: 'USA_COMMAND_CENTER',
      modelCode: 'USA — HIGH COMMAND PENTAGON CITADEL',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/diorama/buildings/usa_command_center.png',
      spriteImage: 'assets/diorama/buildings/usa_command_center.png',
      credits: '3D Ligne-Claire Architectural CAD • Armored Blue Glass Command Bridge • Helipad Wing • 360° Rotating Dual-Wing Radar Array',
      defaultParams: Object.assign({}, BUILDING_DEFAULT_PARAMS),
      paramSchema: USA_BUILDING_PARAM_SCHEMA,
      presets: USA_BUILDING_PRESETS,
      render: renderUsaBuildingModel
    },
    USA_REACTOR: {
      defId: 'USA_REACTOR',
      modelCode: 'USA — COLD FUSION CRYOGENIC REACTOR',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/diorama/buildings/usa_reactor.png',
      spriteImage: 'assets/diorama/buildings/usa_reactor.png',
      credits: '3D Ligne-Claire Architectural CAD • Octagonal Containment Vessel • 4 Cryo Heat-Exchanger Wings • Pulsing Cyan Plasma Core & Control Rods',
      defaultParams: Object.assign({}, BUILDING_DEFAULT_PARAMS),
      paramSchema: USA_BUILDING_PARAM_SCHEMA,
      presets: USA_BUILDING_PRESETS,
      render: renderUsaBuildingModel
    },
    USA_SUPPLY_CENTER: {
      defId: 'USA_SUPPLY_CENTER',
      modelCode: 'USA — CHINOOK LOGISTICS & SUPPLY DEPOT',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/diorama/buildings/usa_supply_center.png',
      spriteImage: 'assets/diorama/buildings/usa_supply_center.png',
      credits: '3D Ligne-Claire Architectural CAD • 3-Bay Cargo Warehouse • Overhead Yellow Bridge Crane • Illuminated Chinook Helipad Deck',
      defaultParams: Object.assign({}, BUILDING_DEFAULT_PARAMS),
      paramSchema: USA_BUILDING_PARAM_SCHEMA,
      presets: USA_BUILDING_PRESETS,
      render: renderUsaBuildingModel
    },
    USA_BARRACKS: {
      defId: 'USA_BARRACKS',
      modelCode: 'USA — ALLIED INFANTRY GARRISON BARRACKS',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/diorama/buildings/usa_barracks.png',
      spriteImage: 'assets/diorama/buildings/usa_barracks.png',
      credits: '3D Ligne-Claire Architectural CAD • Twin Quonset Troop Halls • Central Command Watchtower • Sandbagged Parade Muster Deck',
      defaultParams: Object.assign({}, BUILDING_DEFAULT_PARAMS),
      paramSchema: USA_BUILDING_PARAM_SCHEMA,
      presets: USA_BUILDING_PRESETS,
      render: renderUsaBuildingModel
    },
    USA_WAR_FACTORY: {
      defId: 'USA_WAR_FACTORY',
      modelCode: 'USA — HEAVY ARMOR ASSEMBLY PLANT',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/diorama/buildings/usa_war_factory.png',
      spriteImage: 'assets/diorama/buildings/usa_war_factory.png',
      credits: '3D Ligne-Claire Architectural CAD • Sawtooth Skylight Assembly Bays • Exterior Service Gantry Crane • Armored Tank Rollout Apron',
      defaultParams: Object.assign({}, BUILDING_DEFAULT_PARAMS),
      paramSchema: USA_BUILDING_PARAM_SCHEMA,
      presets: USA_BUILDING_PRESETS,
      render: renderUsaBuildingModel
    },
    USA_AIRFIELD: {
      defId: 'USA_AIRFIELD',
      modelCode: 'USA — TACTICAL JET & GUNSHIP AIRBASE',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/diorama/buildings/usa_airfield.png',
      spriteImage: 'assets/diorama/buildings/usa_airfield.png',
      credits: '3D Ligne-Claire Architectural CAD • 4-Pad Concrete Flight Apron • Munitions Hangar • Elevated ATC Glass Tower & Rotating Radar',
      defaultParams: Object.assign({}, BUILDING_DEFAULT_PARAMS),
      paramSchema: USA_BUILDING_PARAM_SCHEMA,
      presets: USA_BUILDING_PRESETS,
      render: renderUsaBuildingModel
    },
    USA_STRATEGY_CENTER: {
      defId: 'USA_STRATEGY_CENTER',
      modelCode: 'USA — PENTAGON STRATEGIC BATTLE NEXUS',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/diorama/buildings/usa_strategy_center.png',
      spriteImage: 'assets/diorama/buildings/usa_strategy_center.png',
      credits: '3D Ligne-Claire Architectural CAD • Tri-Wing Command Bastion • Central Holographic Battle Dome • Rooftop Bombardment Cannon',
      defaultParams: Object.assign({}, BUILDING_DEFAULT_PARAMS),
      paramSchema: USA_BUILDING_PARAM_SCHEMA,
      presets: USA_BUILDING_PRESETS,
      render: renderUsaBuildingModel
    },
    USA_SUPPLY_DROP_ZONE: {
      defId: 'USA_SUPPLY_DROP_ZONE',
      modelCode: 'USA — C-130 AIRLIFT SUPPLY DROP ZONE',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/diorama/buildings/usa_supply_drop_zone.png',
      spriteImage: 'assets/diorama/buildings/usa_supply_drop_zone.png',
      credits: '3D Ligne-Claire Architectural CAD • Illuminated Air-Drop Tarmac • Telemetry Guidance Van • Parachute Supply Cargo Pallets',
      defaultParams: Object.assign({}, BUILDING_DEFAULT_PARAMS),
      paramSchema: USA_BUILDING_PARAM_SCHEMA,
      presets: USA_BUILDING_PRESETS,
      render: renderUsaBuildingModel
    },
    USA_PATRIOT: {
      defId: 'USA_PATRIOT',
      modelCode: 'USA — MIM-104 PATRIOT PAC-3 SAM BATTERY',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/diorama/buildings/usa_patriot.png',
      spriteImage: 'assets/diorama/buildings/usa_patriot.png',
      credits: '3D Ligne-Claire Architectural CAD • Cruciform Outrigger Emplacement • 360° Slewing 4-Cell PAC-3 Missile Pod • Phased-Array Radar',
      defaultParams: Object.assign({}, BUILDING_DEFAULT_PARAMS),
      paramSchema: USA_BUILDING_PARAM_SCHEMA,
      presets: USA_BUILDING_PRESETS,
      render: renderUsaBuildingModel
    },
    USA_FIREBASE: {
      defId: 'USA_FIREBASE',
      modelCode: 'USA — FORTIFIED 155MM ARTILLERY FIREBASE',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/diorama/buildings/usa_patriot.png',
      spriteImage: 'assets/diorama/buildings/usa_patriot.png',
      credits: '3D Ligne-Claire Architectural CAD • 8-Sided Sloped Sandbag & Armor Blast Wall Ring • 4 Infantry Firing Bunkers • 360° Slewing 155mm Howitzer',
      defaultParams: Object.assign({}, BUILDING_DEFAULT_PARAMS),
      paramSchema: USA_BUILDING_PARAM_SCHEMA,
      presets: USA_BUILDING_PRESETS,
      render: renderUsaBuildingModel
    },
    USA_PARTICLE_CANNON: {
      defId: 'USA_PARTICLE_CANNON',
      modelCode: 'USA — ORBITAL PARTICLE UPLINK SUPERWEAPON',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/diorama/buildings/usa_particle_cannon.png',
      spriteImage: 'assets/diorama/buildings/usa_particle_cannon.png',
      credits: '3D Ligne-Claire Architectural CAD • Cryo Accelerator Ring • 3 High-Voltage Capacitor Buttresses • Articulated Orbital Beam Emitter',
      defaultParams: Object.assign({}, BUILDING_DEFAULT_PARAMS),
      paramSchema: USA_BUILDING_PARAM_SCHEMA,
      presets: USA_BUILDING_PRESETS,
      render: renderUsaBuildingModel
    },

    // ========================================================================
    // --- CHINA MILITARY BUILDINGS (13 STRUCTURES) ---
    // ========================================================================
    CHINA_COMMAND_CENTER: {
      defId: 'CHINA_COMMAND_CENTER',
      modelCode: 'CHINA — PLA CENTRAL COMMAND CITADEL',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/diorama/buildings/china_command_center.png',
      spriteImage: 'assets/diorama/buildings/china_command_center.png',
      credits: '3D Ligne-Claire Architectural CAD • Brutalist Gunmetal & Crimson Bastion • Twin Smokestacks • Rotating Hexagonal Phased-Array Radar',
      defaultParams: Object.assign({}, BUILDING_DEFAULT_PARAMS, { armorBaseColor: '#94a3b8', armorHighlightColor: '#cbd5e1', armorShadowColor: '#475569', houseColor: '#dc2626' }),
      paramSchema: CHINA_BUILDING_PARAM_SCHEMA,
      presets: CHINA_BUILDING_PRESETS,
      render: renderChinaBuildingModel
    },
    CHINA_REACTOR: {
      defId: 'CHINA_REACTOR',
      modelCode: 'CHINA — TWIN-TOWER NUCLEAR FISSION REACTOR',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/diorama/buildings/china_reactor.png',
      spriteImage: 'assets/diorama/buildings/china_reactor.png',
      credits: '3D Ligne-Claire Architectural CAD • Twin Hyperbolic Cooling Towers • Crimson Turbine Hall • Glowing Emerald-Green Isotope Core',
      defaultParams: Object.assign({}, BUILDING_DEFAULT_PARAMS, { armorBaseColor: '#94a3b8', armorHighlightColor: '#cbd5e1', armorShadowColor: '#475569', houseColor: '#dc2626' }),
      paramSchema: CHINA_BUILDING_PARAM_SCHEMA,
      presets: CHINA_BUILDING_PRESETS,
      render: renderChinaBuildingModel
    },
    CHINA_SUPPLY_CENTER: {
      defId: 'CHINA_SUPPLY_CENTER',
      modelCode: 'CHINA — STATE INDUSTRIAL SUPPLY DEPOT',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/diorama/buildings/china_supply_center.png',
      spriteImage: 'assets/diorama/buildings/china_supply_center.png',
      credits: '3D Ligne-Claire Architectural CAD • Crimson Steel Truss Warehouse • Supply Truck Loading Dock • Overhead Ore Gantry',
      defaultParams: Object.assign({}, BUILDING_DEFAULT_PARAMS, { armorBaseColor: '#94a3b8', armorHighlightColor: '#cbd5e1', armorShadowColor: '#475569', houseColor: '#dc2626' }),
      paramSchema: CHINA_BUILDING_PARAM_SCHEMA,
      presets: CHINA_BUILDING_PRESETS,
      render: renderChinaBuildingModel
    },
    CHINA_BARRACKS: {
      defId: 'CHINA_BARRACKS',
      modelCode: 'CHINA — RED GUARD INFANTRY BARRACKS',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/diorama/buildings/china_barracks.png',
      spriteImage: 'assets/diorama/buildings/china_barracks.png',
      credits: '3D Ligne-Claire Architectural CAD • Sloped Crimson Roof Pediment • Gold Star Crest • Twin Armored Guard Watchtowers',
      defaultParams: Object.assign({}, BUILDING_DEFAULT_PARAMS, { armorBaseColor: '#94a3b8', armorHighlightColor: '#cbd5e1', armorShadowColor: '#475569', houseColor: '#dc2626' }),
      paramSchema: CHINA_BUILDING_PARAM_SCHEMA,
      presets: CHINA_BUILDING_PRESETS,
      render: renderChinaBuildingModel
    },
    CHINA_WAR_FACTORY: {
      defId: 'CHINA_WAR_FACTORY',
      modelCode: 'CHINA — STATE HEAVY ARMOR FOUNDRY',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/diorama/buildings/china_war_factory.png',
      spriteImage: 'assets/diorama/buildings/china_war_factory.png',
      credits: '3D Ligne-Claire Architectural CAD • Heavy Blast Furnace Smokestacks • Crimson Sloped Foundry Roof • Overlord Rollout Bay',
      defaultParams: Object.assign({}, BUILDING_DEFAULT_PARAMS, { armorBaseColor: '#94a3b8', armorHighlightColor: '#cbd5e1', armorShadowColor: '#475569', houseColor: '#dc2626' }),
      paramSchema: CHINA_BUILDING_PARAM_SCHEMA,
      presets: CHINA_BUILDING_PRESETS,
      render: renderChinaBuildingModel
    },
    CHINA_AIRFIELD: {
      defId: 'CHINA_AIRFIELD',
      modelCode: 'CHINA — PLA FORTIFIED MIG AIRBASE',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/diorama/buildings/china_airfield.png',
      spriteImage: 'assets/diorama/buildings/china_airfield.png',
      credits: '3D Ligne-Claire Architectural CAD • 4 Armored Blast Revetment Bays • Subterranean Munitions Bunker • Crimson ATC Radar Tower',
      defaultParams: Object.assign({}, BUILDING_DEFAULT_PARAMS, { armorBaseColor: '#94a3b8', armorHighlightColor: '#cbd5e1', armorShadowColor: '#475569', houseColor: '#dc2626' }),
      paramSchema: CHINA_BUILDING_PARAM_SCHEMA,
      presets: CHINA_BUILDING_PRESETS,
      render: renderChinaBuildingModel
    },
    CHINA_PROPAGANDA_CENTER: {
      defId: 'CHINA_PROPAGANDA_CENTER',
      modelCode: 'CHINA — STATE PROPAGANDA BROADCAST MINISTRY',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/diorama/buildings/china_propaganda_center.png',
      spriteImage: 'assets/diorama/buildings/china_propaganda_center.png',
      credits: '3D Ligne-Claire Architectural CAD • Stepped Brutalist Crimson Podium • Gold Star Broadcast Screen • Twin Megaphone Pylons',
      defaultParams: Object.assign({}, BUILDING_DEFAULT_PARAMS, { armorBaseColor: '#94a3b8', armorHighlightColor: '#cbd5e1', armorShadowColor: '#475569', houseColor: '#dc2626' }),
      paramSchema: CHINA_BUILDING_PARAM_SCHEMA,
      presets: CHINA_BUILDING_PRESETS,
      render: renderChinaBuildingModel
    },
    CHINA_INTERNET_CENTER: {
      defId: 'CHINA_INTERNET_CENTER',
      modelCode: 'CHINA — CYBER-WARFARE INTERNET CENTER',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/diorama/buildings/china_internet_center.png',
      spriteImage: 'assets/diorama/buildings/china_internet_center.png',
      credits: '3D Ligne-Claire Architectural CAD • Shielded 8-Hacker Faraday Dome • Twin Parabolic Satellite Uplink Dishes',
      defaultParams: Object.assign({}, BUILDING_DEFAULT_PARAMS, { armorBaseColor: '#94a3b8', armorHighlightColor: '#cbd5e1', armorShadowColor: '#475569', houseColor: '#dc2626' }),
      paramSchema: CHINA_BUILDING_PARAM_SCHEMA,
      presets: CHINA_BUILDING_PRESETS,
      render: renderChinaBuildingModel
    },
    CHINA_GATTLING_CANNON: {
      defId: 'CHINA_GATTLING_CANNON',
      modelCode: 'CHINA — DUAL-POD ROTARY GATTLING CANNON',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/diorama/buildings/china_gattling_cannon.png',
      spriteImage: 'assets/diorama/buildings/china_gattling_cannon.png',
      credits: '3D Ligne-Claire Architectural CAD • Octagonal Steel Gun Emplacement • 360° Slewing Dual-Pod 6-Barrel Rotary Gattling Turret',
      defaultParams: Object.assign({}, BUILDING_DEFAULT_PARAMS, { armorBaseColor: '#94a3b8', armorHighlightColor: '#cbd5e1', armorShadowColor: '#475569', houseColor: '#dc2626' }),
      paramSchema: CHINA_BUILDING_PARAM_SCHEMA,
      presets: CHINA_BUILDING_PRESETS,
      render: renderChinaBuildingModel
    },
    CHINA_BUNKER: {
      defId: 'CHINA_BUNKER',
      modelCode: 'CHINA — REINFORCED GARRISON PILLBOX BUNKER',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/diorama/buildings/china_bunker.png',
      spriteImage: 'assets/diorama/buildings/china_bunker.png',
      credits: '3D Ligne-Claire Architectural CAD • Octagonal Concrete Pillbox • 360° Armored Firing Slits • Sloped Crimson Blast Cap',
      defaultParams: Object.assign({}, BUILDING_DEFAULT_PARAMS, { armorBaseColor: '#94a3b8', armorHighlightColor: '#cbd5e1', armorShadowColor: '#475569', houseColor: '#dc2626' }),
      paramSchema: CHINA_BUILDING_PARAM_SCHEMA,
      presets: CHINA_BUILDING_PRESETS,
      render: renderChinaBuildingModel
    },
    CHINA_MINES: {
      defId: 'CHINA_MINES',
      modelCode: 'CHINA — LANDMINE PERIMETER CLUSTER FIELD',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/diorama/buildings/china_bunker.png',
      spriteImage: 'assets/diorama/buildings/china_bunker.png',
      credits: '3D Ligne-Claire Architectural CAD • Anti-Tank & Anti-Personnel Pressure Mine Cluster • Pulsing Crimson Proximity Beacons',
      defaultParams: Object.assign({}, BUILDING_DEFAULT_PARAMS, { armorBaseColor: '#94a3b8', armorHighlightColor: '#cbd5e1', armorShadowColor: '#475569', houseColor: '#dc2626' }),
      paramSchema: CHINA_BUILDING_PARAM_SCHEMA,
      presets: CHINA_BUILDING_PRESETS,
      render: renderChinaBuildingModel
    },
    CHINA_SPEAKER_TOWER: {
      defId: 'CHINA_SPEAKER_TOWER',
      modelCode: 'CHINA — SUBLIMINAL PROPAGANDA SPEAKER TOWER',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/diorama/buildings/china_speaker_tower.png',
      spriteImage: 'assets/diorama/buildings/china_speaker_tower.png',
      credits: '3D Ligne-Claire Architectural CAD • Lattice Steel Broadcast Pylon • 4 Directional Megaphone Horns • Inspiration Aura Finial',
      defaultParams: Object.assign({}, BUILDING_DEFAULT_PARAMS, { armorBaseColor: '#94a3b8', armorHighlightColor: '#cbd5e1', armorShadowColor: '#475569', houseColor: '#dc2626' }),
      paramSchema: CHINA_BUILDING_PARAM_SCHEMA,
      presets: CHINA_BUILDING_PRESETS,
      render: renderChinaBuildingModel
    },
    CHINA_NUCLEAR_SILO: {
      defId: 'CHINA_NUCLEAR_SILO',
      modelCode: 'CHINA — DF-31 THERMONUCLEAR MISSILE SILO',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/diorama/buildings/china_nuclear_silo.png',
      spriteImage: 'assets/diorama/buildings/china_nuclear_silo.png',
      credits: '3D Ligne-Claire Architectural CAD • Subterranean Blast Collar • 4 Lightning Arrestor Gantry Towers • Elevated ICBM Nuclear Warhead',
      defaultParams: Object.assign({}, BUILDING_DEFAULT_PARAMS, { armorBaseColor: '#94a3b8', armorHighlightColor: '#cbd5e1', armorShadowColor: '#475569', houseColor: '#dc2626' }),
      paramSchema: CHINA_BUILDING_PARAM_SCHEMA,
      presets: CHINA_BUILDING_PRESETS,
      render: renderChinaBuildingModel
    },

    // ========================================================================
    // --- GLA MILITARY BUILDINGS (10 STRUCTURES) ---
    // ========================================================================
    GLA_COMMAND_CENTER: {
      defId: 'GLA_COMMAND_CENTER',
      modelCode: 'GLA — DESERT WARLORD COMMAND COMPOUND',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/diorama/buildings/gla_command_center.png',
      spriteImage: 'assets/diorama/buildings/gla_command_center.png',
      credits: '3D Ligne-Claire Architectural CAD • Sandstone Adobe Citadel • Olive Camo Tarp Muster Canopy • Watchtower Dome',
      defaultParams: Object.assign({}, BUILDING_DEFAULT_PARAMS, { armorBaseColor: '#d4b483', armorHighlightColor: '#ead2ac', armorShadowColor: '#8c6d46', houseColor: '#65a30d' }),
      paramSchema: GLA_BUILDING_PARAM_SCHEMA,
      presets: GLA_BUILDING_PRESETS,
      render: renderGlaBuildingModel
    },
    GLA_SUPPLY_STASH: {
      defId: 'GLA_SUPPLY_STASH',
      modelCode: 'GLA — FORTIFIED DESERT SUPPLY STASH',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/diorama/buildings/gla_supply_stash.png',
      spriteImage: 'assets/diorama/buildings/gla_supply_stash.png',
      credits: '3D Ligne-Claire Architectural CAD • Adobe Bazaar Hall • Camo Netting Awning • Stacked Fuel Drums & Contraband Crates',
      defaultParams: Object.assign({}, BUILDING_DEFAULT_PARAMS, { armorBaseColor: '#d4b483', armorHighlightColor: '#ead2ac', armorShadowColor: '#8c6d46', houseColor: '#65a30d' }),
      paramSchema: GLA_BUILDING_PARAM_SCHEMA,
      presets: GLA_BUILDING_PRESETS,
      render: renderGlaBuildingModel
    },
    GLA_BARRACKS: {
      defId: 'GLA_BARRACKS',
      modelCode: 'GLA — INSURGENT TRAINING GARRISON',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/diorama/buildings/gla_barracks.png',
      spriteImage: 'assets/diorama/buildings/gla_barracks.png',
      credits: '3D Ligne-Claire Architectural CAD • Mud-Brick Muster Hall • Sandbagged Courtyard • Rooftop Lookout Tower',
      defaultParams: Object.assign({}, BUILDING_DEFAULT_PARAMS, { armorBaseColor: '#d4b483', armorHighlightColor: '#ead2ac', armorShadowColor: '#8c6d46', houseColor: '#65a30d' }),
      paramSchema: GLA_BUILDING_PARAM_SCHEMA,
      presets: GLA_BUILDING_PRESETS,
      render: renderGlaBuildingModel
    },
    GLA_ARMS_DEALER: {
      defId: 'GLA_ARMS_DEALER',
      modelCode: 'GLA — IMPROVISED ARMS DEALER WORKSHOP',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/diorama/buildings/gla_arms_dealer.png',
      spriteImage: 'assets/diorama/buildings/gla_arms_dealer.png',
      credits: '3D Ligne-Claire Architectural CAD • Corrugated Steel Vehicle Hangar • A-Frame Salvage Hoist Gantry • Rollout Bay',
      defaultParams: Object.assign({}, BUILDING_DEFAULT_PARAMS, { armorBaseColor: '#d4b483', armorHighlightColor: '#ead2ac', armorShadowColor: '#8c6d46', houseColor: '#65a30d' }),
      paramSchema: GLA_BUILDING_PARAM_SCHEMA,
      presets: GLA_BUILDING_PRESETS,
      render: renderGlaBuildingModel
    },
    GLA_PALACE: {
      defId: 'GLA_PALACE',
      modelCode: 'GLA — FORTIFIED SCORPION COMMAND PALACE',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/diorama/buildings/gla_palace.png',
      spriteImage: 'assets/diorama/buildings/gla_palace.png',
      credits: '3D Ligne-Claire Architectural CAD • 4 Corner Crenelated Minaret Bastions • Central Golden Onion Dome • 5-Squad Garrison Embrasures',
      defaultParams: Object.assign({}, BUILDING_DEFAULT_PARAMS, { armorBaseColor: '#d4b483', armorHighlightColor: '#ead2ac', armorShadowColor: '#8c6d46', houseColor: '#65a30d' }),
      paramSchema: GLA_BUILDING_PARAM_SCHEMA,
      presets: GLA_BUILDING_PRESETS,
      render: renderGlaBuildingModel
    },
    GLA_BLACK_MARKET: {
      defId: 'GLA_BLACK_MARKET',
      modelCode: 'GLA — CLANDESTINE BLACK MARKET BAZAAR',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/diorama/buildings/gla_black_market.png',
      spriteImage: 'assets/diorama/buildings/gla_black_market.png',
      credits: '3D Ligne-Claire Architectural CAD • Reinforced Merchant Vault • Smuggler Satellite Dish • Salvage Upgrade Depot',
      defaultParams: Object.assign({}, BUILDING_DEFAULT_PARAMS, { armorBaseColor: '#d4b483', armorHighlightColor: '#ead2ac', armorShadowColor: '#8c6d46', houseColor: '#65a30d' }),
      paramSchema: GLA_BUILDING_PARAM_SCHEMA,
      presets: GLA_BUILDING_PRESETS,
      render: renderGlaBuildingModel
    },
    GLA_TUNNEL_NETWORK: {
      defId: 'GLA_TUNNEL_NETWORK',
      modelCode: 'GLA — SUBTERRANEAN TUNNEL NETWORK PORTAL',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/diorama/buildings/gla_tunnel_network.png',
      spriteImage: 'assets/diorama/buildings/gla_tunnel_network.png',
      credits: '3D Ligne-Claire Architectural CAD • Timber-Shored Tunnel Arch • Sandbag Revetment • 360° Slewing Roof DShK Heavy MG Turret',
      defaultParams: Object.assign({}, BUILDING_DEFAULT_PARAMS, { armorBaseColor: '#d4b483', armorHighlightColor: '#ead2ac', armorShadowColor: '#8c6d46', houseColor: '#65a30d' }),
      paramSchema: GLA_BUILDING_PARAM_SCHEMA,
      presets: GLA_BUILDING_PRESETS,
      render: renderGlaBuildingModel
    },
    GLA_STINGER_SITE: {
      defId: 'GLA_STINGER_SITE',
      modelCode: 'GLA — CAMOUFLAGED STINGER SAM EMPLACEMENT',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/diorama/buildings/gla_stinger_site.png',
      spriteImage: 'assets/diorama/buildings/gla_stinger_site.png',
      credits: '3D Ligne-Claire Architectural CAD • Circular Sandbagged AA Pit • 360° Slewing Twin Stinger Missile Launcher Pod',
      defaultParams: Object.assign({}, BUILDING_DEFAULT_PARAMS, { armorBaseColor: '#d4b483', armorHighlightColor: '#ead2ac', armorShadowColor: '#8c6d46', houseColor: '#65a30d' }),
      paramSchema: GLA_BUILDING_PARAM_SCHEMA,
      presets: GLA_BUILDING_PRESETS,
      render: renderGlaBuildingModel
    },
    GLA_SCUD_STORM: {
      defId: 'GLA_SCUD_STORM',
      modelCode: 'GLA — 9-CELL SCUD STORM ANTHRAX SUPERWEAPON',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/diorama/buildings/gla_scud_storm.png',
      spriteImage: 'assets/diorama/buildings/gla_scud_storm.png',
      credits: '3D Ligne-Claire Architectural CAD • Circular Revetment Pit • 9 Inclined Scud-B Ballistic Missiles with Glowing Anthrax Warheads',
      defaultParams: Object.assign({}, BUILDING_DEFAULT_PARAMS, { armorBaseColor: '#d4b483', armorHighlightColor: '#ead2ac', armorShadowColor: '#8c6d46', houseColor: '#65a30d' }),
      paramSchema: GLA_BUILDING_PARAM_SCHEMA,
      presets: GLA_BUILDING_PRESETS,
      render: renderGlaBuildingModel
    },
    GLA_DEMO_TRAP: {
      defId: 'GLA_DEMO_TRAP',
      modelCode: 'GLA — CAMOUFLAGED IED DEMOLITION TRAP',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/diorama/buildings/gla_stinger_site.png',
      spriteImage: 'assets/diorama/buildings/gla_stinger_site.png',
      credits: '3D Ligne-Claire Architectural CAD • Camouflaged Sandbag Mound • Clustered Explosive & Anthrax Drums • Proximity Detonator',
      defaultParams: Object.assign({}, BUILDING_DEFAULT_PARAMS, { armorBaseColor: '#d4b483', armorHighlightColor: '#ead2ac', armorShadowColor: '#8c6d46', houseColor: '#65a30d' }),
      paramSchema: GLA_BUILDING_PARAM_SCHEMA,
      presets: GLA_BUILDING_PRESETS,
      render: renderGlaBuildingModel
    },

    // ========================================================================
    // --- NEUTRAL TECH BUILDINGS (4 CAPTURABLE STRUCTURES) ---
    // ========================================================================
    TECH_OIL_DERRICK: {
      defId: 'TECH_OIL_DERRICK',
      modelCode: 'TECH — INDUSTRIAL CRUDE OIL DERRICK & PUMPJACK',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/diorama/buildings/usa_supply_center.png',
      spriteImage: 'assets/diorama/buildings/usa_supply_center.png',
      credits: '3D Ligne-Claire Architectural CAD • Steel Lattice Derrick Tower • Reciprocating Nodding-Donkey Pumpjack • Twin Crude Storage Tanks',
      defaultParams: Object.assign({}, BUILDING_DEFAULT_PARAMS, { armorBaseColor: '#e2e8f0', armorHighlightColor: '#f8fafc', armorShadowColor: '#64748b', houseColor: '#f59e0b' }),
      paramSchema: USA_BUILDING_PARAM_SCHEMA,
      presets: USA_BUILDING_PRESETS,
      render: renderTechBuildingModel
    },
    TECH_HOSPITAL: {
      defId: 'TECH_HOSPITAL',
      modelCode: 'TECH — CIVILIAN TRAUMA MEDICAL HOSPITAL',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/diorama/buildings/usa_barracks.png',
      spriteImage: 'assets/diorama/buildings/usa_barracks.png',
      credits: '3D Ligne-Claire Architectural CAD • Multi-Story Medical Ward • Rooftop Red Cross Helipad • Global Infantry Regenerative Aura',
      defaultParams: Object.assign({}, BUILDING_DEFAULT_PARAMS, { armorBaseColor: '#f1f5f9', armorHighlightColor: '#ffffff', armorShadowColor: '#64748b', houseColor: '#ef4444' }),
      paramSchema: USA_BUILDING_PARAM_SCHEMA,
      presets: USA_BUILDING_PRESETS,
      render: renderTechBuildingModel
    },
    TECH_REPAIR_BAY: {
      defId: 'TECH_REPAIR_BAY',
      modelCode: 'TECH — HEAVY ARMOR MAINTENANCE & REPAIR DEPOT',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/diorama/buildings/usa_war_factory.png',
      spriteImage: 'assets/diorama/buildings/usa_war_factory.png',
      credits: '3D Ligne-Claire Architectural CAD • Dual Service Hangar Bays • Heavy Hydraulic Repair Gantry Crane • Global Vehicle Repair Aura',
      defaultParams: Object.assign({}, BUILDING_DEFAULT_PARAMS, { armorBaseColor: '#cbd5e1', armorHighlightColor: '#f1f5f9', armorShadowColor: '#475569', houseColor: '#f59e0b' }),
      paramSchema: USA_BUILDING_PARAM_SCHEMA,
      presets: USA_BUILDING_PRESETS,
      render: renderTechBuildingModel
    },
    CIV_GARRISON_BUNKER: {
      defId: 'CIV_GARRISON_BUNKER',
      modelCode: 'TECH — REINFORCED URBAN GARRISON BLOCKHOUSE',
      status: 'BESPOKE_HD',
      referenceImage: 'assets/diorama/buildings/china_bunker.png',
      spriteImage: 'assets/diorama/buildings/china_bunker.png',
      credits: '3D Ligne-Claire Architectural CAD • Multi-Story Reinforced Concrete Blockhouse • 360° Window Firing Slits • Rooftop Parapet',
      defaultParams: Object.assign({}, BUILDING_DEFAULT_PARAMS, { armorBaseColor: '#cbd5e1', armorHighlightColor: '#e2e8f0', armorShadowColor: '#64748b', houseColor: '#0ea5e9' }),
      paramSchema: USA_BUILDING_PARAM_SCHEMA,
      presets: USA_BUILDING_PRESETS,
      render: renderTechBuildingModel
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

  const resolvedParamsCache = new Map();
  const staticBuildingImpostorCache = new Map();

  const STATIC_CACHEABLE_BUILDINGS = new Set([
    'USA_COMMAND_CENTER', 'USA_SUPPLY_CENTER', 'USA_BARRACKS', 'USA_WAR_FACTORY', 'USA_AIRFIELD', 'USA_DETENTION_CAMP',
    'CHINA_COMMAND_CENTER', 'CHINA_SUPPLY_CENTER', 'CHINA_BARRACKS', 'CHINA_WAR_FACTORY', 'CHINA_AIRFIELD', 'CHINA_INTERNET_CENTER',
    'GLA_COMMAND_CENTER', 'GLA_SUPPLY_STASH', 'GLA_BARRACKS', 'GLA_ARMS_DEALER', 'GLA_PALACE', 'GLA_BLACK_MARKET', 'GLA_TUNNEL_NETWORK'
  ]);

  function invalidateModelCaches(defId) {
    if (defId) {
      resolvedParamsCache.delete(defId);
      for (const k of staticBuildingImpostorCache.keys()) {
        if (k.startsWith(defId + '|')) staticBuildingImpostorCache.delete(k);
      }
    } else {
      resolvedParamsCache.clear();
      staticBuildingImpostorCache.clear();
    }
  }

  function getParams(defId) {
    if (defId && resolvedParamsCache.has(defId)) {
      return resolvedParamsCache.get(defId);
    }
    const entry = getModelEntry(defId);
    const defaults = entry ? entry.defaultParams : {};
    const merged = Object.assign({}, defaults, customParamsByUnit[defId] || {});
    if (defId) resolvedParamsCache.set(defId, merged);
    return merged;
  }

  function setParams(defId, newParams, persist = true) {
    if (!defId) return;
    const entry = getModelEntry(defId);
    const defaults = entry ? entry.defaultParams : {};
    customParamsByUnit[defId] = Object.assign({}, defaults, customParamsByUnit[defId] || {}, newParams || {});
    invalidateModelCaches(defId);
    if (persist) saveStoredParams();
    return customParamsByUnit[defId];
  }

  function resetParams(defId, persist = true) {
    if (!defId) return;
    delete customParamsByUnit[defId];
    activePresetByUnit[defId] = 'DIORAMA_DEFAULT';
    invalidateModelCaches(defId);
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
    customParamsByUnit[defId] = Object.assign({}, entry.defaultParams || {}, preset.params || preset.values || {});
    invalidateModelCaches(defId);
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

    if ((opts.forceSprite || params.renderMode === 'ILLUSTRATED_SPRITE') && !opts.forceProcedural) {
      if (renderIllustratedUnitSprite(ctx, u, faction, entry, params, opts)) {
        return true;
      }
    }

    // Apply tactical battlefield silhouette scale so infantry & vehicles read crisply at 1.0x zoom
    if (!opts.isStudio) {
      const origR = u.radius || 14;
      const isInf = Boolean(u.def && u.def.isInfantry);
      const visualMult = isInf ? 1.52 : 1.24;
      u.radius = origR * visualMult;
      try {
        entry.render(ctx, u, faction, params, opts);
      } finally {
        u.radius = origR;
      }
    } else {
      entry.render(ctx, u, faction, params, opts);
    }
    return true;
  }

  function renderBuildingIfBespoke(ctx, b, team, gameTime, options) {
    if (!b) return false;
    const defId = b.defId || (b.def && b.def.id);
    if (!defId) return false;
    const entry = MODEL_REGISTRY[defId];
    if (!entry) return false;
    const baseParams = getParams(defId);
    const opts = options || {};
    if ((opts.forceSprite || baseParams.renderMode === 'ILLUSTRATED_SPRITE') && !opts.forceProcedural) {
      return false;
    }

    const size = (b.def && b.def.size) || b.size || 72;
    const prog = b.constructed === false ? Math.max(0.25, Math.min(1, b.buildProgress || 0.35)) : 1.0;
    const factionColor = (team && team.faction && team.faction.color) || baseParams.houseColor || '#2563eb';
    const faction = (team && team.faction) || {
      id: (b.def && b.def.faction) || 'USA',
      color: factionColor
    };

    // Fast path: Offscreen 2D Canvas impostor cache for static completed structures in real browser DOM
    const canCacheImpostor =
      !opts.isStudio &&
      prog >= 0.999 &&
      STATIC_CACHEABLE_BUILDINGS.has(defId) &&
      typeof HTMLCanvasElement !== 'undefined' &&
      typeof document !== 'undefined' &&
      typeof document.createElement === 'function' &&
      typeof ctx.drawImage === 'function';

    if (canCacheImpostor) {
      const cacheKey = `${defId}|${factionColor}|${size}`;
      let cached = staticBuildingImpostorCache.get(cacheKey);
      if (!cached) {
        const pad = Math.ceil(size * 1.45);
        const dim = pad * 2;
        const offCanvas = document.createElement('canvas');
        if (offCanvas && typeof offCanvas.getContext === 'function') {
          offCanvas.width = dim * 2;
          offCanvas.height = dim * 2;
          const offCtx = offCanvas.getContext('2d');
          if (offCtx && typeof offCtx.scale === 'function') {
            offCtx.scale(2, 2);
            offCtx.translate(pad, pad);
            const staticMock = {
              defId,
              def: b.def || { id: defId, size },
              radius: b.radius || size * 0.44,
              angle: 0.68,
              turretAngle: 0.68,
              recoilOffset: 0,
              treadPhase: 0,
              hp: 1000,
              maxHp: 1000
            };
            entry.render(offCtx, staticMock, faction, baseParams, opts);
            cached = { canvas: offCanvas, pad, dim };
            if (staticBuildingImpostorCache.size > 64) staticBuildingImpostorCache.clear();
            staticBuildingImpostorCache.set(cacheKey, cached);
          }
        }
      }
      if (cached) {
        ctx.drawImage(cached.canvas, -cached.pad, -cached.pad, cached.dim, cached.dim);
        return true;
      }
    }

    const params = prog < 1.0
      ? Object.assign({}, baseParams, { structureHeight: (baseParams.structureHeight || 1.0) * prog })
      : baseParams;

    // Only use b.turretAngle when the building actually has an active weapon turret; otherwise animate radar/rotors with gameTime
    const hasCombatTurret = Boolean(b.def && b.def.range > 0);
    const resolvedTurretAngle = (hasCombatTurret && b.turretAngle !== undefined)
      ? b.turretAngle
      : (0.68 + (gameTime || 0) * 0.75);

    const mockState = {
      defId,
      def: b.def || { id: defId, size },
      radius: b.radius || size * 0.44,
      angle: b.angle !== undefined ? b.angle : 0.68,
      turretAngle: resolvedTurretAngle,
      recoilOffset: b.recoilOffset || 0,
      treadPhase: (gameTime || 0) * 0.25,
      hp: b.hp !== undefined ? b.hp : 1000,
      maxHp: b.maxHp !== undefined ? b.maxHp : 1000
    };

    entry.render(ctx, mockState, faction, params, opts);
    return true;
  }

  // Bespoke 3D Ligne-Claire Supply Dock Warehouse & Pallet Stack Renderer
  function renderSupplyDock3D(ctx, s, timeSec = 0) {
    const proj = createProjector(0.68, 0.56, 0.88);
    const faces = [];
    const r = 46;
    const seam = '#2b241f';

    // 1. Concrete Foundation Apron with Yellow/Black Hazard Curb
    pushBox3D(faces, proj, -1.05 * r, -0.82 * r, 0, 1.05 * r, 0.82 * r, 0.10 * r, '#78716c', seam, 1.25);
    pushBox3D(faces, proj, -1.06 * r, 0.72 * r, 0.01 * r, 1.06 * r, 0.83 * r, 0.11 * r, '#eab308', seam, 1.05);

    // 2. Corrugated Steel Logistics Warehouse Shed (Left Wing)
    pushBox3D(faces, proj, -0.92 * r, -0.66 * r, 0.10 * r, -0.08 * r, 0.42 * r, 0.68 * r, '#94a3b8', seam, 1.25);
    // Pitched Steel Roof
    pushPrism3D(faces, proj, [
      [-0.96 * r, -0.70 * r, 0.68 * r],
      [-0.04 * r, -0.70 * r, 0.68 * r],
      [-0.04 * r, 0.46 * r, 0.68 * r],
      [-0.96 * r, 0.46 * r, 0.68 * r]
    ], [
      [-0.90 * r, -0.55 * r, 0.88 * r],
      [-0.10 * r, -0.55 * r, 0.88 * r],
      [-0.10 * r, 0.30 * r, 0.88 * r],
      [-0.90 * r, 0.30 * r, 0.88 * r]
    ], '#475569', seam, 1.2);

    // 3. Dynamic 3D Supply Crates & Blue Tarpaulin Pallets (Right Yard — scales with remaining credits!)
    const ratio = clamp((s.amount || 0) / (s.maxAmount || 25000), 0, 1);
    const crateSlots = [
      [0.12, -0.56, 0.10, '#d97706'],
      [0.54, -0.56, 0.10, '#2563eb'],
      [0.12, -0.12, 0.10, '#ca8a04'],
      [0.54, -0.12, 0.10, '#b45309'],
      [0.12, 0.30, 0.10, '#16a34a'],
      [0.54, 0.30, 0.10, '#d97706'],
      [0.16, -0.52, 0.36, '#eab308'],
      [0.56, -0.52, 0.36, '#3b82f6'],
      [0.16, -0.08, 0.36, '#f59e0b'],
      [0.56, -0.08, 0.36, '#ca8a04']
    ];
    const activeCrates = Math.ceil(ratio * crateSlots.length);
    for (let i = 0; i < activeCrates; i++) {
      const [cx, cy, cz, col] = crateSlots[i];
      pushBox3D(faces, proj, cx * r, cy * r, cz * r, (cx + 0.34) * r, (cy + 0.34) * r, (cz + 0.25) * r, col, seam, 1.1);
    }

    // 4. Loading Gantry Crane Arm & Rotating Amber Beacon
    pushBox3D(faces, proj, 0.78 * r, -0.68 * r, 0.10 * r, 0.92 * r, -0.54 * r, 0.96 * r, '#f59e0b', seam, 1.15);
    pushBox3D(faces, proj, 0.18 * r, -0.65 * r, 0.88 * r, 0.92 * r, -0.56 * r, 0.98 * r, '#eab308', seam, 1.1);

    flushFaces(ctx, faces);

    // Blinking logistics beacon on crane tip
    const pulse = 0.55 + 0.45 * Math.sin(timeSec * 6);
    const tip = proj.project(-0.50 * r, -0.12 * r, 0.92 * r);
    ctx.fillStyle = `rgba(250, 204, 21, ${pulse.toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Bespoke 3D Ligne-Claire GLA Salvage Crate Renderer
  function renderSalvageCrate3D(ctx, c, timeSec = 0) {
    const yaw = 0.65 + Math.sin(timeSec * 1.8 + (c.x || 0) * 0.05) * 0.12;
    const proj = createProjector(yaw, 0.56, 0.88);
    const faces = [];
    const r = 13;
    const seam = '#2b241f';
    pushBox3D(faces, proj, -0.85 * r, -0.65 * r, 0, 0.85 * r, 0.65 * r, 0.95 * r, '#854d0e', seam, 1.2);
    pushBox3D(faces, proj, -0.90 * r, -0.70 * r, 0.72 * r, 0.90 * r, 0.70 * r, 0.98 * r, '#a16207', seam, 1.15);
    pushBox3D(faces, proj, -0.25 * r, -0.72 * r, 0.02 * r, 0.25 * r, 0.72 * r, 1.00 * r, '#eab308', seam, 1.0);
    flushFaces(ctx, faces);
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
    BUILDING_DEFAULT_PARAMS,
    USA_BUILDING_PARAM_SCHEMA,
    USA_BUILDING_PRESETS,
    CHINA_BUILDING_PARAM_SCHEMA,
    CHINA_BUILDING_PRESETS,
    GLA_BUILDING_PARAM_SCHEMA,
    GLA_BUILDING_PRESETS,
    isDeepEngineeredUnit,
    hasBespokeModel,
    getModelEntry,
    getParams,
    setParams,
    resetParams,
    getActivePresetKey,
    applyPreset,
    cyclePreset,
    setZoomStrokeScale,
    renderUnitIfBespoke,
    renderBuildingIfBespoke,
    renderSupplyDock3D,
    renderSalvageCrate3D,
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
    renderGlaWheeledModel,
    renderUsaBuildingModel,
    renderChinaBuildingModel,
    renderGlaBuildingModel,
    renderTechBuildingModel
  };
})();

if (typeof window !== 'undefined') window.ZH_UNIT_MODELS = ZH_UNIT_MODELS;
if (typeof module !== 'undefined' && module.exports) module.exports = ZH_UNIT_MODELS;
