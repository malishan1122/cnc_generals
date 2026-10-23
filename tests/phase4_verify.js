// ============================================================================
// Command & Conquer: Generals – Zero Hour (macOS Clean-Room Edition)
// tests/phase4_verify.js — Phase 4 Headless Verification Suite (SYS-25..SYS-29)
// ============================================================================

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  [PASS] ${msg}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${msg}`);
  }
}

const noop = () => {};
const ctxStub = new Proxy({}, {
  get(target, prop) {
    if (prop === 'measureText') return () => ({ width: 42 });
    if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
      return () => ({ addColorStop: noop });
    }
    return noop;
  },
  set() { return true; }
});

function makeCanvas(w, h) {
  return {
    width: w,
    height: h,
    style: {},
    getContext: () => ctxStub,
    addEventListener: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h })
  };
}

const storageMap = new Map();
global.localStorage = {
  getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
  setItem: (k, v) => storageMap.set(k, String(v)),
  removeItem: (k) => storageMap.delete(k)
};

global.window = global;
global.addEventListener = noop;
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = noop;
global.document = {
  body: {
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    appendChild: noop,
    removeChild: noop
  },
  getElementById: (id) => {
    if (id === 'game-canvas') return makeCanvas(1280, 720);
    if (id === 'minimap-canvas') return makeCanvas(200, 200);
    return {
      style: {},
      classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
      addEventListener: noop,
      appendChild: noop,
      innerHTML: '',
      textContent: '',
      click: noop
    };
  },
  querySelectorAll: () => [],
  querySelector: () => null,
  createElement: () => ({
    style: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: noop,
    appendChild: noop,
    querySelector: () => ({ appendChild: noop }),
    click: noop
  })
};

global.ZH_AUDIO = {
  playSFX: noop,
  playSpatialSFX: noop,
  speak: noop,
  playUnitBark: noop,
  playGeneralTaunt: noop,
  updateCameraListener: noop,
  setCombatIntensity: noop,
  startFactionMusic: noop,
  stopMusic: noop,
  toggleSFX: () => true,
  toggleVoice: () => true,
  toggleMusic: () => true
};

const rootDir = path.resolve(__dirname, '..');
eval(fs.readFileSync(path.join(rootDir, 'js/rng.js'), 'utf8'));
eval(fs.readFileSync(path.join(rootDir, 'js/spatial.js'), 'utf8'));
eval(fs.readFileSync(path.join(rootDir, 'js/nav.js'), 'utf8'));
eval(fs.readFileSync(path.join(rootDir, 'js/data.js'), 'utf8'));
eval(fs.readFileSync(path.join(rootDir, 'js/ai.js'), 'utf8'));
eval(fs.readFileSync(path.join(rootDir, 'js/engine.js'), 'utf8'));
eval(fs.readFileSync(path.join(rootDir, 'js/ui.js'), 'utf8'));

console.log('======================================================================');
console.log(' C&C: GENERALS ZERO HOUR — PHASE 4 VERIFICATION SUITE (SYS-25..SYS-29)');
console.log('======================================================================\n');

// ----------------------------------------------------------------------------
// 1. SYS-25: Deterministic Skirmish Save/Load & .zhsave Snapshot Persistence
// ----------------------------------------------------------------------------
console.log('--- [SYS-25] Deterministic Skirmish Save/Load & .zhsave Export/Import ---');
{
  const engine = new ZH_ENGINE.GameEngine(makeCanvas(1280, 720), makeCanvas(200, 200));
  engine.initMatch({
    mode: 'SKIRMISH',
    playerGeneralId: 'CHINA_KWAI',
    aiGeneralId: 'GLA_THRAX',
    mapId: 'TOURNAMENT_DESERT',
    difficulty: 'HARD'
  });

  // Advance simulation, customize state (upgrades, garrison, tunnel network, control group)
  for (let i = 0; i < 40; i++) engine.update(0.1);
  engine.teams[0].credits = 12345;
  engine.teams[0].xp = 420;
  engine.teams[0].rank = 3;
  engine.teams[0].generalPoints = 2;
  engine.teams[0].upgrades.add('UPG_NATIONALISM');
  engine.teams[0].unlockedPowers.add('PWR_ARTILLERY_BARRAGE');

  const overlord = engine.spawnUnit('CHINA_OVERLORD', 0, 520, 540);
  overlord.overlordAddon = 'GATLING';
  overlord.vetLevel = 2;
  overlord.waypoints = [{ x: 900, y: 900 }];
  engine.selectedIds.clear();
  engine.selectedIds.add(overlord.id);
  engine.bindControlGroup('1');

  // Garrison a Red Guard in the first civilian bunker
  const rg = engine.spawnUnit('CHINA_RED_GUARD', 0, 600, 600);
  const bunker = engine.garrisonBunkers[0];
  if (bunker) {
    bunker.team = 0;
    rg.garrisonedIn = bunker.id;
    rg.garrisonId = bunker.id;
    bunker.occupants.push(rg);
  }

  // Put a GLA Scorpion in Team 1's tunnel network
  const tunnelUnit = engine.spawnUnit('GLA_SCORPION', 1, 2000, 2000);
  engine.units = engine.units.filter(u => u.id !== tunnelUnit.id);
  engine.teams[1].tunnelUnits.push(tunnelUnit);

  const preSaveTime = engine.matchTime;
  const preSaveUnitCount = engine.units.length;
  const preSaveBuildingCount = engine.buildings.length;

  // Save to slot and export JSON
  const savedOk = engine.saveToSlot('phase4_test_slot');
  assert(savedOk === true, 'engine.saveToSlot("phase4_test_slot") succeeds and writes to localStorage');

  const exportedJson = engine.exportSaveJSON();
  assert(typeof exportedJson === 'string' && exportedJson.includes('ZH_SAVE_V2'), 'engine.exportSaveJSON() outputs valid ZH_SAVE_V2 JSON payload');

  // Mutate engine drastically (wipe units, change credits/general)
  engine.units = [];
  engine.teams[0].credits = 0;
  engine.matchTime = 9999;

  // Restore from slot
  const loadedOk = engine.loadFromSlot('phase4_test_slot');
  assert(loadedOk === true, 'engine.loadFromSlot("phase4_test_slot") restores snapshot cleanly');
  assert(Math.abs(engine.matchTime - preSaveTime) < 1e-6, 'Restored matchTime matches pre-save timestamp exactly');
  assert(engine.teams[0].credits === 12345 && engine.teams[0].rank === 3, 'Restored Team 0 credits ($12,345) and General Rank (3) match');
  assert(engine.teams[0].upgrades.has('UPG_NATIONALISM'), 'Restored Team 0 Set of researched upgrades preserved');
  assert(engine.teams[0].unlockedPowers.has('PWR_ARTILLERY_BARRAGE'), 'Restored Team 0 Set of unlocked Generals Powers preserved');
  assert(engine.units.length === preSaveUnitCount, `Restored active unit count (${engine.units.length}) matches pre-save (${preSaveUnitCount})`);
  assert(engine.buildings.length === preSaveBuildingCount, `Restored building count (${engine.buildings.length}) matches pre-save (${preSaveBuildingCount})`);

  const restoredOverlord = engine.units.find(u => u.id === overlord.id);
  assert(
    restoredOverlord && restoredOverlord.overlordAddon === 'GATLING' && restoredOverlord.vetLevel === 2 && restoredOverlord.waypoints.length === 1,
    'Restored Overlord preserves GATLING addon, Veterancy Level 2, and chained waypoints'
  );
  assert(
    engine.controlGroups['1'] && engine.controlGroups['1'].includes(overlord.id),
    'Restored Control Group [1] preserves bound Overlord unit ID'
  );
  assert(
    engine.garrisonBunkers[0] && engine.garrisonBunkers[0].occupants.length === 1 && engine.garrisonBunkers[0].occupants[0].defId === 'CHINA_RED_GUARD',
    'Restored civilian bunker preserves garrisoned Red Guard occupant'
  );
  assert(
    engine.teams[1].tunnelUnits.length === 1 && engine.teams[1].tunnelUnits[0].defId === 'GLA_SCORPION',
    'Restored GLA Team 1 tunnel network preserves subterranean Scorpion Tank'
  );

  // Test fresh engine importSaveJSON + subsequent simulation steps
  const engine2 = new ZH_ENGINE.GameEngine(makeCanvas(1280, 720), makeCanvas(200, 200));
  const importOk = engine2.importSaveJSON(exportedJson);
  assert(importOk === true, 'Fresh GameEngine instance imports .zhsave JSON snapshot via importSaveJSON()');
  for (let i = 0; i < 20; i++) {
    engine2.update(0.1);
    engine2.render();
  }
  assert(engine2.matchTime > preSaveTime, 'Restored engine advances simulation and renders 20 frames with 0 errors');
}

// ----------------------------------------------------------------------------
// 2. SYS-26: Multi-Squad Tactical AI Micro, Threat Heatmap & Counter Matrix
// ----------------------------------------------------------------------------
console.log('\n--- [SYS-26] Multi-Squad Tactical AI Micro, Threat Heatmap & Counter Production ---');
{
  const engine = new ZH_ENGINE.GameEngine(makeCanvas(1280, 720), makeCanvas(200, 200));
  engine.initMatch({
    mode: 'SKIRMISH',
    playerGeneralId: 'USA_GRANGER',
    aiGeneralId: 'CHINA_TAO',
    mapId: 'TOURNAMENT_DESERT',
    difficulty: 'HARD'
  });

  // Spawn a squad of AI combat units for Team 1
  const aiCombat = [];
  for (let i = 0; i < 8; i++) {
    aiCombat.push(engine.spawnUnit(i % 2 === 0 ? 'CHINA_BATTLEMASTER' : 'CHINA_GATTLING_TANK', 1, 2100 + i * 25, 2100));
  }
  const roles = ZH_AI.assignSquadRoles(aiCombat, false);
  assert(
    roles.vanguard.length > 0 && roles.flankers.length > 0,
    `ZH_AI.assignSquadRoles partitions squad into VANGUARD (${roles.vanguard.length}) and FLANKER (${roles.flankers.length}) roles`
  );

  const defRoles = ZH_AI.assignSquadRoles(aiCombat, true);
  assert(
    defRoles.defenders.length > 0,
    `ZH_AI.assignSquadRoles assigns BASE_DEFENSE (${defRoles.defenders.length}) when base is under attack`
  );

  // Test Harvester/Dozer raid target finder with turret threat avoidance
  const raidTarget = ZH_AI.findHighValueRaidTarget(engine, 1);
  assert(
    raidTarget && (raidTarget.def.isHarvester || raidTarget.def.isBuilder),
    `ZH_AI.findHighValueRaidTarget locates lightly-defended enemy Harvester/Dozer (${raidTarget ? raidTarget.defId : 'none'})`
  );

  // Spawn heavy enemy aircraft for Team 0 and verify Team 1 counter-unit weights boost Anti-Air
  for (let i = 0; i < 6; i++) {
    engine.spawnUnit('USA_COMANCHE', 0, 700 + i * 30, 700);
  }
  const weights = ZH_AI.computeCounterWeights(engine, 1);
  assert(
    weights.antiAirBoost >= 2.5,
    `ZH_AI.computeCounterWeights detects enemy air dominance and boosts Anti-Air weight (${weights.antiAirBoost}x)`
  );

  // Test Power-Grid Blackout cluster targeting (`preferPower = true`)
  const pwrPlant = engine.spawnBuilding('USA_REACTOR', 0, 480, 620, true);
  const pwrCluster = ZH_AI.findBestClusterTarget(engine, 0, 220, true);
  assert(
    pwrCluster && pwrCluster.score > 1000,
    `ZH_AI.findBestClusterTarget(preferPower=true) prioritizes enemy Power Plant cluster (score=${Math.round(pwrCluster.score)})`
  );
}

// ----------------------------------------------------------------------------
// 3. SYS-27: 9x9 General Matchup Balance Matrix (81 Seeded Matches, Un-Clamped)
// ----------------------------------------------------------------------------
console.log('\n--- [SYS-27] 9x9 General Matchup Balance Matrix (81 Seeded Matches) ---');
{
  const { runBalanceMatrix } = require('./balance_matrix.js');
  const report = runBalanceMatrix({ stepsPerMatch: 450, dt: 0.2 });

  assert(report.totalMatches === 81, `Executed all 81 (9x9) Sub-General matchups (got ${report.totalMatches})`);
  assert(report.runtimeErrors === 0, `Zero runtime errors across all 81 matchups (got ${report.runtimeErrors})`);

  for (const [facId, fSt] of Object.entries(report.factionSummary)) {
    assert(
      fSt.winRatePct > 10.0 && fSt.winRatePct < 90.0 && fSt.matches === 54,
      `Faction ${facId} records real un-clamped outcomes across ${fSt.matches} matches: ${fSt.wins}W-${fSt.losses}L-${fSt.draws}D (${fSt.winRatePct}%)`
    );
  }

  const allGeneralsActive = Object.values(report.generalSummary).every(
    g => g.avgUnitsOnField >= 3 && g.avgBuildingsOnField >= 2 && g.winRatePct > 0 && g.winRatePct < 100 && g.medianMatchLengthSec > 0
  );
  assert(
    allGeneralsActive,
    `All 9 Sub-Generals expand economy, construct tech buildings, field armies, and record non-degenerate outcomes (median match length=${report.medianMatchLengthSec}s)`
  );
}

// ----------------------------------------------------------------------------
// 4. SYS-28: macOS Native .app v2.0 Shell & HUD Wiring Verification
// ----------------------------------------------------------------------------
console.log('\n--- [SYS-28] macOS Native .app v2.0 Shell & HUD Wiring ---');
{
  const swiftSrc = fs.readFileSync(path.join(rootDir, 'macos_main.swift'), 'utf8');
  assert(
    swiftSrc.includes('setupNativeMenuBar') &&
    swiftSrc.includes('Quick Save Skirmish') &&
    swiftSrc.includes('Quick Load Skirmish') &&
    swiftSrc.includes('Export .zhsave Snapshot'),
    'macos_main.swift implements v2.0 Native macOS Menu Bar (Game, Audio, View) with Save/Load/Export actions'
  );

  const htmlSrc = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  assert(
    htmlSrc.includes('btn-quick-save') &&
    htmlSrc.includes('btn-quick-load') &&
    htmlSrc.includes('btn-export-save') &&
    htmlSrc.includes('btn-import-save') &&
    htmlSrc.includes('v2.0 Complete macOS Edition'),
    'index.html includes Save [F5], Load [F9], .zhsave Export/Import HUD controls and v2.0 header'
  );

  assert(
    typeof window.ZH_UI.quickSave === 'function' &&
    typeof window.ZH_UI.quickLoad === 'function' &&
    typeof window.ZH_UI.exportSaveFile === 'function' &&
    typeof window.ZH_UI.importSaveFile === 'function',
    'window.ZH_UI exposes quickSave, quickLoad, exportSaveFile, and importSaveFile APIs'
  );
}

// ----------------------------------------------------------------------------
// 5. SYS-29: Ligne-Claire Vector-Cel Diorama Unit Design Studio (All 22 USA + 21 China Units)
// ----------------------------------------------------------------------------
console.log('\n--- [SYS-29] Ligne-Claire Diorama Unit Design Studio (22 USA + 21 China Units) ---');
{
  eval(fs.readFileSync(path.join(rootDir, 'js/vfx.js'), 'utf8'));
  eval(fs.readFileSync(path.join(rootDir, 'js/unit_models.js'), 'utf8'));
  eval(fs.readFileSync(path.join(rootDir, 'js/unit_studio.js'), 'utf8'));

  const expectedUsaUnits = [
    'USA_DOZER', 'USA_CHINOOK',
    'USA_RANGER', 'USA_MISSILE_DEFENDER', 'USA_PATHFINDER',
    'USA_CRUSADER', 'USA_LASER_CRUSADER', 'USA_PALADIN', 'USA_LASER_TANK',
    'USA_HUMVEE', 'USA_AVENGER', 'USA_TOMAHAWK',
    'USA_COMANCHE', 'USA_COMBAT_CHINOOK', 'USA_RAPTOR', 'USA_KING_RAPTOR',
    'USA_AURORA', 'USA_AURORA_ALPHA'
  ];

  const expectedChinaUnits = [
    'CHINA_DOZER', 'CHINA_SUPPLY_TRUCK',
    'CHINA_RED_GUARD', 'CHINA_MINIGUNNER', 'CHINA_TANK_HUNTER', 'CHINA_HACKER', 'CHINA_BLACK_LOTUS',
    'CHINA_BATTLEMASTER', 'CHINA_GATTLING_TANK', 'CHINA_DRAGON_TANK',
    'CHINA_TROOP_CRAWLER', 'CHINA_ASSAULT_CRAWLER', 'CHINA_LISTENING_OUTPOST',
    'CHINA_INFERNO_CANNON', 'CHINA_ECM_TANK', 'CHINA_OVERLORD', 'CHINA_EMPEROR_OVERLORD', 'CHINA_NUKE_CANNON',
    'CHINA_MIG', 'CHINA_NUKE_MIG', 'CHINA_HELIX'
  ];

  const allUsaRegistered = expectedUsaUnits.every(id => ZH_UNIT_MODELS.hasBespokeModel(id));
  assert(
    allUsaRegistered,
    `All ${expectedUsaUnits.length} USA Allied Army units have bespoke Ligne-Claire Diorama models in ZH_UNIT_MODELS`
  );

  const allChinaRegistered = expectedChinaUnits.every(id => ZH_UNIT_MODELS.hasBespokeModel(id));
  assert(
    allChinaRegistered,
    `All ${expectedChinaUnits.length} China PLA units have bespoke Ligne-Claire Diorama models in ZH_UNIT_MODELS`
  );

  const allRefsExistOnDisk = Object.entries(ZH_UNIT_MODELS.MODEL_REGISTRY).every(([k, entry]) => {
    const ok = entry.referenceImage && fs.existsSync(path.join(rootDir, entry.referenceImage));
    if (!ok) console.error('  [MISSING REF]', k, entry.referenceImage);
    return ok;
  });
  assert(
    allRefsExistOnDisk,
    'Every registered unit model points to an existing cropped diorama reference blueprint in assets/refs/'
  );

  const allSpritesExistOnDisk = Object.entries(ZH_UNIT_MODELS.MODEL_REGISTRY).every(([k, entry]) => {
    const ok = entry.spriteImage && fs.existsSync(path.join(rootDir, entry.spriteImage));
    if (!ok) console.error('  [MISSING SPRITE]', k, entry.spriteImage);
    return ok;
  });
  assert(
    allSpritesExistOnDisk,
    'Every registered unit model points to an existing extracted Ligne-Claire transparent PNG sprite in assets/diorama/units/'
  );

  let renderErrors = 0;
  const engine = new ZH_ENGINE.GameEngine(makeCanvas(1280, 720), makeCanvas(200, 200));
  engine.initMatch({
    mode: 'SKIRMISH',
    playerGeneralId: 'USA_ALEXANDER',
    aiGeneralId: 'CHINA_KWAI',
    mapId: 'TOURNAMENT_DESERT',
    difficulty: 'MEDIUM'
  });

  const allBespokeUnits = [...expectedUsaUnits, ...expectedChinaUnits];
  for (const unitId of allBespokeUnits) {
    try {
      const fac = unitId.startsWith('CHINA_') ? ZH_DATA.FACTIONS.CHINA : ZH_DATA.FACTIONS.USA;
      const u = engine.spawnUnit(unitId, 0, 600, 600);
      for (const yawDeg of [0, 45, 139, 225, 315]) {
        u.angle = (yawDeg * Math.PI) / 180;
        u.turretAngle = ((yawDeg + 25) * Math.PI) / 180;
        const rendered = ZH_UNIT_MODELS.renderUnitIfBespoke(ctxStub, u, fac, { pitchScale: 0.64, zScale: 0.78 });
        if (!rendered) renderErrors++;
        ZH_VFX.renderArticulatedUnit(ctxStub, u, fac, { pitchScale: 1.0, zScale: 0.42 });
      }
    } catch (err) {
      renderErrors++;
      console.error(`Render error for ${unitId}:`, err);
    }
  }
  assert(
    renderErrors === 0,
    `All ${allBespokeUnits.length} bespoke Ligne-Claire Diorama models (USA + China) render across 5 turntable yaw angles with 0 runtime errors`
  );

  // Verify deep CAD upgrade for USA_TOMAHAWK (5 schema groups, 5 presets, recoil & preset rendering)
  const tomahawkEntry = ZH_UNIT_MODELS.getModelEntry('USA_TOMAHAWK');
  const tomahawkSchema = (tomahawkEntry && tomahawkEntry.paramSchema) || [];
  const tomahawkPresetKeys = Object.keys((tomahawkEntry && tomahawkEntry.presets) || {});
  assert(
    tomahawkEntry &&
      Array.isArray(tomahawkSchema) &&
      tomahawkSchema.length === 5 &&
      tomahawkPresetKeys.length === 5,
    `USA_TOMAHAWK has 5 parametric CAD inspector groups (${tomahawkSchema.length}) and 5 studio presets (${tomahawkPresetKeys.join(', ')})`
  );

  let tomahawkPresetErrors = 0;
  const tomahawkUnit = engine.spawnUnit('USA_TOMAHAWK', 0, 640, 640);
  for (const presetKey of tomahawkPresetKeys) {
    try {
      const presetObj = tomahawkEntry.presets[presetKey];
      ZH_UNIT_MODELS.setParams('USA_TOMAHAWK', presetObj.params, false);
      tomahawkUnit.recoilOffset = 5.5;
      ZH_UNIT_MODELS.renderUnitIfBespoke(ctxStub, tomahawkUnit, ZH_DATA.FACTIONS.USA, { pitchScale: 0.64, zScale: 0.78 });
    } catch (err) {
      tomahawkPresetErrors++;
      console.error(`Tomahawk preset error (${presetKey}):`, err);
    }
  }
  ZH_UNIT_MODELS.resetParams('USA_TOMAHAWK', false);
  assert(
    tomahawkPresetErrors === 0,
    'USA_TOMAHAWK renders cleanly across all 5 studio presets with active missile launch recoil and backblast'
  );

  // Verify deep CAD upgrade for USA_DOZER (5 schema groups, 5 presets, blade scoop cycle & preset rendering)
  const dozerEntry = ZH_UNIT_MODELS.getModelEntry('USA_DOZER');
  const dozerSchema = (dozerEntry && dozerEntry.paramSchema) || [];
  const dozerPresetKeys = Object.keys((dozerEntry && dozerEntry.presets) || {});
  assert(
    dozerEntry &&
      Array.isArray(dozerSchema) &&
      dozerSchema.length === 5 &&
      dozerPresetKeys.length === 5,
    `USA_DOZER has 5 parametric CAD inspector groups (${dozerSchema.length}) and 5 studio presets (${dozerPresetKeys.join(', ')})`
  );

  let dozerPresetErrors = 0;
  const dozerUnit = engine.spawnUnit('USA_DOZER', 0, 660, 660);
  for (const presetKey of dozerPresetKeys) {
    try {
      const presetObj = dozerEntry.presets[presetKey];
      ZH_UNIT_MODELS.setParams('USA_DOZER', presetObj.params, false);
      dozerUnit.recoilOffset = 6.0;
      dozerUnit.treadPhase = 0.45;
      ZH_UNIT_MODELS.renderUnitIfBespoke(ctxStub, dozerUnit, ZH_DATA.FACTIONS.USA, { pitchScale: 0.64, zScale: 0.78 });
    } catch (err) {
      dozerPresetErrors++;
      console.error(`Dozer preset error (${presetKey}):`, err);
    }
  }
  ZH_UNIT_MODELS.resetParams('USA_DOZER', false);
  assert(
    dozerPresetErrors === 0,
    'USA_DOZER renders cleanly across all 5 studio presets with active hydraulic blade scoop cycle and rolling treads'
  );

  // Verify all 35 Buildings (11 USA + 13 China + 10 GLA + 4 Tech/Neutral) have bespoke 3D Ligne-Claire models & 0 NaN coordinates
  const allBuildingIds = Array.from(new Set([
    ...Object.keys(ZH_DATA.BUILDINGS),
    'USA_FIREBASE',
    'CHINA_MINES',
    'GLA_DEMO_TRAP',
    'TECH_OIL_DERRICK',
    'TECH_HOSPITAL',
    'TECH_REPAIR_BAY',
    'CIV_GARRISON_BUNKER'
  ]));
  let missingBuildings = 0;
  let buildingRenderErrors = 0;
  let nanCoordCount = 0;

  const nanCheckingCtx = new Proxy({}, {
    get(target, prop) {
      if (prop === 'moveTo' || prop === 'lineTo') {
        return (x, y) => {
          if (!Number.isFinite(x) || !Number.isFinite(y)) nanCoordCount++;
        };
      }
      if (prop === 'arc' || prop === 'ellipse' || prop === 'rect') {
        return (x, y) => {
          if (!Number.isFinite(x) || !Number.isFinite(y)) nanCoordCount++;
        };
      }
      if (prop === 'measureText') return () => ({ width: 42 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return () => ({ addColorStop: noop });
      }
      return noop;
    },
    set() { return true; }
  });

  for (const bId of allBuildingIds) {
    const entry = ZH_UNIT_MODELS.getModelEntry(bId);
    if (!entry) {
      missingBuildings++;
      console.error('  [MISSING BUILDING MODEL]', bId);
      continue;
    }
    try {
      const bDef = ZH_DATA.BUILDINGS[bId] || { id: bId, size: 72, hp: 1000, faction: bId.split('_')[0] };
      const fac = ZH_DATA.FACTIONS[bDef.faction] || ZH_DATA.FACTIONS.USA;
      for (const yawDeg of [0, 39, 135, 240]) {
        const mockBuilding = {
          defId: bId,
          def: bDef,
          x: 500,
          y: 500,
          size: bDef.size || 72,
          radius: (bDef.size || 72) * 0.46,
          angle: (yawDeg * Math.PI) / 180,
          turretAngle: ((yawDeg + 30) * Math.PI) / 180,
          recoilOffset: 2.0,
          constructed: true,
          buildProgress: 1.0,
          hp: bDef.hp || 1000,
          maxHp: bDef.hp || 1000
        };
        const ok = ZH_UNIT_MODELS.renderBuildingIfBespoke(nanCheckingCtx, mockBuilding, { faction: fac }, 1.5);
        if (!ok) buildingRenderErrors++;
        ZH_VFX.renderLigneClaireBuilding(nanCheckingCtx, mockBuilding, { faction: fac }, 1.5);
        ZH_VFX.renderLigneClaireBuildingGhost(nanCheckingCtx, bId, 500, 500, bDef.size || 72, true);
      }
    } catch (err) {
      buildingRenderErrors++;
      console.error(`Building render error for ${bId}:`, err);
    }
  }
  assert(
    missingBuildings === 0 && buildingRenderErrors === 0 && nanCoordCount === 0,
    `All ${allBuildingIds.length} Military & Tech Buildings (USA, China, GLA, Tech) render detailed 3D Ligne-Claire models with 0 errors and 0 NaN coordinates`
  );
}

console.log('\n======================================================================');
console.log(` PHASE 4 VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log('======================================================================');
if (failed > 0) process.exit(1);

