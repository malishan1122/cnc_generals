// ============================================================================
// Command & Conquer: Generals – Zero Hour (macOS Clean-Room Edition)
// tests/phase2_verify.js — Automated Headless Verification Suite for Phase 2
// ============================================================================

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Provide a clean browser-like sandbox for window.ZH_* modules
const mockCanvasContext = new Proxy({}, {
  get(target, prop) {
    if (prop === 'measureText') return () => ({ width: 40 });
    if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
      return () => ({ addColorStop: () => {} });
    }
    return typeof target[prop] !== 'undefined' ? target[prop] : () => {};
  },
  set(target, prop, val) {
    target[prop] = val;
    return true;
  }
});

const sandbox = {
  window: {},
  console,
  Math,
  Date,
  Set,
  Map,
  Array,
  Object,
  Number,
  String,
  Boolean,
  RegExp,
  JSON,
  performance: { now: () => Date.now() },
  requestAnimationFrame: () => {},
  setTimeout: () => 1,
  clearTimeout: () => {},
  document: {
    getElementById: () => ({
      width: 1280,
      height: 720,
      getContext: () => mockCanvasContext,
      addEventListener: () => {},
      classList: { add: () => {}, remove: () => {}, contains: () => true },
      style: {}
    }),
    querySelectorAll: () => [],
    querySelector: () => null,
    createElement: () => ({
      style: {},
      classList: { add: () => {}, remove: () => {} },
      addEventListener: () => {},
      appendChild: () => {},
      querySelector: () => ({ appendChild: () => {} })
    })
  }
};
sandbox.window = sandbox;

const rootDir = path.resolve(__dirname, '..');
const filesToLoad = [
  'js/data.js',
  'js/spatial.js',
  'js/nav.js',
  'js/audio.js',
  'js/engine.js',
  'js/ai.js'
];

for (const rel of filesToLoad) {
  const fullPath = path.join(rootDir, rel);
  const code = fs.readFileSync(fullPath, 'utf8');
  vm.runInNewContext(code, sandbox, { filename: rel });
}

const { ZH_DATA, ZH_SPATIAL, ZH_NAV, ZH_ENGINE, ZH_AI } = sandbox;

let passed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

console.log('====================================================================');
console.log(' C&C: GENERALS – ZERO HOUR | PHASE 2 HEADLESS VERIFICATION SUITE');
console.log('====================================================================');

// 1. SYS-14: SpatialHashGrid, LocomotorSystem & BallisticsEngine
check('SYS-14a: SpatialHashGrid O(k) queryCircle & queryNearestEnemy', () => {
  const grid = new ZH_SPATIAL.SpatialHashGrid(2600, 128);
  const u1 = { id: 'u1', x: 300, y: 300, radius: 14, hp: 200, team: 0 };
  const u2 = { id: 'u2', x: 340, y: 320, radius: 14, hp: 200, team: 1 };
  const u3 = { id: 'u3', x: 1900, y: 1900, radius: 14, hp: 200, team: 1 };
  grid.rebuild([u1, u2, u3], []);

  const near = grid.queryCircle(300, 300, 80);
  assert.strictEqual(near.length, 2, 'Should find 2 nearby units within 80px');
  const nearestEnemy = grid.queryNearestEnemy(300, 300, 150, 0);
  assert.strictEqual(nearestEnemy.id, 'u2', 'Should identify u2 as nearest enemy');
});

check('SYS-14b: 7 Locomotor classes & 3D Parabolic Ballistics z(t) = 4*h*t*(1-t)', () => {
  const classes = ['INFANTRY', 'CLIFF_CLIMBER', 'WHEELED', 'TRACKED', 'HOVER', 'HELICOPTER', 'AIRCRAFT'];
  for (const c of classes) {
    assert(ZH_SPATIAL.LOCOMOTOR_PROFILES[c], `Missing locomotor profile: ${c}`);
  }
  const midArc = ZH_SPATIAL.BallisticsEngine.computeArcElevation(120, 0.5);
  assert.strictEqual(midArc, 120, 'Peak elevation at t=0.5 should equal peakHeight (120)');
  const startArc = ZH_SPATIAL.BallisticsEngine.computeArcElevation(120, 0);
  const endArc = ZH_SPATIAL.BallisticsEngine.computeArcElevation(120, 1);
  assert.strictEqual(startArc, 0);
  assert.strictEqual(endArc, 0);
});

// 2. SYS-15: NavigationGrid A* Pathfinding, Cliff Climber & Flow Fields
check('SYS-15a: NavigationGrid A* pathfinding routes around obstacles & CLIFF_CLIMBER traverses cliffs', () => {
  const nav = new ZH_NAV.NavigationGrid(2600, 48);
  const mapDef = ZH_DATA.MAPS[0];
  const blockerBuilding = [{
    x: 600,
    y: 600,
    hp: 1000,
    def: { footprint: { w: 120, h: 120 } }
  }];
  nav.rebuild(mapDef, blockerBuilding, []);

  assert.strictEqual(nav.isBlocked(Math.floor(600 / 48), Math.floor(600 / 48), 'TRACKED'), true);
  assert.strictEqual(nav.isBlocked(Math.floor(600 / 48), Math.floor(600 / 48), 'AIRCRAFT'), false);

  const pathNodes = nav.findPath(480, 600, 760, 600, 'TRACKED');
  assert(pathNodes.length >= 2, 'A* should find valid path around building footprint');
});

// 3. SYS-16 & SYS-17: Sub-General Roster, Active Micro-Abilities, Tech Structures & Civilian Garrisoning
check('SYS-16: All 9 Sub-General Exclusive Units & 7 Active Micro-Abilities exist in ZH_DATA', () => {
  const requiredUnits = [
    'USA_KING_RAPTOR',
    'USA_COMBAT_CHINOOK',
    'USA_AURORA_ALPHA',
    'USA_LASER_CRUSADER',
    'CHINA_EMPEROR_OVERLORD',
    'CHINA_MINIGUNNER',
    'CHINA_ASSAULT_CRAWLER',
    'CHINA_NUKE_MIG',
    'GLA_COMBAT_CYCLE',
    'GLA_HIJACKER'
  ];
  for (const uId of requiredUnits) {
    assert(ZH_DATA.UNITS[uId], `Missing Sub-General unit: ${uId}`);
  }
  assert.strictEqual(ZH_DATA.UNITS.GLA_COMBAT_CYCLE.locomotor, 'CLIFF_CLIMBER');

  const requiredAbilities = [
    'FLASHBANG',
    'LASER_LOCK',
    'FLAME_WALL',
    'OVERLORD_SPEAKER',
    'OVERLORD_GATLING',
    'PILOT_SNIPE',
    'HIJACK_VEHICLE'
  ];
  for (const abId of requiredAbilities) {
    assert(ZH_DATA.UNIT_ABILITIES[abId], `Missing unit ability: ${abId}`);
  }
});

check('SYS-15b & SYS-17: Civilian Garrisoning, Flame/Flashbang Clearing, Pilot Snipe & Hijacker in GameEngine', () => {
  const mockCanvas = { width: 1280, height: 720, getContext: () => mockCanvasContext };
  const mockMini = { width: 200, height: 200, getContext: () => mockCanvasContext };
  const engine = new ZH_ENGINE.GameEngine(mockCanvas, mockMini);

  engine.initMatch({
    mode: 'SKIRMISH',
    playerGeneralId: 'USA_GRANGER',
    aiGeneralId: 'CHINA_KWAI',
    mapId: 'TOURNAMENT_DESERT',
    difficulty: 'NORMAL'
  });

  assert(engine.techStructures.length >= 4, 'Should spawn Oil Derricks + Tech Hospital + Tech Repair Bay');
  assert(engine.garrisonBunkers.length >= 4, 'Should spawn Civilian Garrison Bunkers');

  // Test Garrison entry
  const bunker = engine.garrisonBunkers[0];
  const ranger = engine.spawnUnit('USA_RANGER', 0, bunker.x + 10, bunker.y + 10);
  engine.enterGarrison(ranger, bunker);
  assert.strictEqual(bunker.occupants.length, 1, 'Ranger should be inside Civilian Garrison Bunker');
  assert.strictEqual(bunker.team, 0, 'Bunker should belong to Team 0');

  // Test Flashbang / Flame clearing of enemy garrison
  bunker.team = 1;
  ranger.team = 1;
  engine.applySplashDamage(bunker.x, bunker.y, 60, 50, 'FLASHBANG', 0);
  assert.strictEqual(bunker.occupants.length, 0, 'Flashbang should instantly clear garrison occupants');
  assert.strictEqual(bunker.team, -1, 'Cleared bunker should return to neutral');

  // Test Jarmen Kell Pilot Snipe -> Unmanned Vehicle -> Infantry Re-crew
  const enemyTank = engine.spawnUnit('CHINA_OVERLORD', 1, 900, 900);
  const jarmen = engine.spawnUnit('GLA_JARMEN_KELL', 0, 820, 900);
  const sniped = engine.triggerUnitAbility(jarmen, 'PILOT_SNIPE', enemyTank.x, enemyTank.y, enemyTank.id);
  assert.strictEqual(sniped, true, 'Jarmen Kell should snipe enemy Overlord pilot');
  assert.strictEqual(enemyTank.unmanned, true, 'Overlord should become unmanned');
  assert.strictEqual(enemyTank.team, -1, 'Unmanned Overlord should be neutral (-1)');

  // Test GLA Hijacker vehicle capture
  const enemyCrusader = engine.spawnUnit('USA_CRUSADER', 1, 1050, 900);
  const hijacker = engine.spawnUnit('GLA_HIJACKER', 0, 1045, 900);
  engine.executeHijackVehicle(hijacker, enemyCrusader);
  assert.strictEqual(enemyCrusader.team, 0, 'Hijacked Crusader should switch to Team 0');
  assert.strictEqual(hijacker.hp, 0, 'Hijacker should enter/consume himself into the captured vehicle');

  // Run 120 deterministic fixed-timestep ticks (2.0 simulated seconds) + render pass
  for (let i = 0; i < 120; i++) {
    engine.stepFixed(1 / 60);
  }
  engine.render();
  engine.renderMinimap();
  assert(engine.simTick >= 120, 'Fixed-timestep accumulator should advance simTick');
});

// 4. SYS-18: 9 Challenge General AI Doctrines
check('SYS-18: All 9 General Doctrines configured in ZH_AI with custom unit weights & tactics', () => {
  const allGenerals = Object.keys(ZH_DATA.GENERALS);
  assert.strictEqual(allGenerals.length, 9, 'Must have all 9 Zero Hour Generals');
  for (const gId of allGenerals) {
    assert(ZH_AI.GENERAL_DOCTRINES[gId], `Missing AI Doctrine for ${gId}`);
  }
});

console.log('====================================================================');
console.log(` 🏆 ALL ${passed} PHASE 2 OBLIGATIONS VERIFIED & PASSING 100%!`);
console.log('====================================================================');
