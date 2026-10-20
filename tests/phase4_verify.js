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
// 3. SYS-27: 9x9 General Matchup Balance Matrix (81 Matchups)
// ----------------------------------------------------------------------------
console.log('\n--- [SYS-27] 9x9 General Matchup Balance Matrix (81 Matchups) ---');
{
  const { runBalanceMatrix } = require('./balance_matrix.js');
  const report = runBalanceMatrix({ stepsPerMatch: 140 });

  assert(report.totalMatches === 81, `Executed all 81 (9x9) Sub-General matchups (got ${report.totalMatches})`);
  assert(report.runtimeErrors === 0, `Zero runtime errors across all 81 matchups (got ${report.runtimeErrors})`);

  for (const [facId, fSt] of Object.entries(report.factionSummary)) {
    assert(
      fSt.winRatePct >= 42.0 && fSt.winRatePct <= 58.0,
      `Faction ${facId} tournament win-rate parity is balanced: ${fSt.winRatePct}% (target 42%..58%)`
    );
  }

  const allGeneralsActive = Object.values(report.generalSummary).every(
    g => g.avgUnitsOnField >= 3 && g.avgBuildingsOnField >= 2 && g.winRatePct >= 35 && g.winRatePct <= 65
  );
  assert(
    allGeneralsActive,
    'All 9 Sub-Generals actively expand economy, construct tech buildings, field armies, and maintain 35%..65% matchup balance'
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

console.log('\n======================================================================');
console.log(` PHASE 4 VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log('======================================================================');
if (failed > 0) process.exit(1);
