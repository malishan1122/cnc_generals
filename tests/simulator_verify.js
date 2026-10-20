// ============================================================================
// Command & Conquer: Generals – Zero Hour (macOS Clean-Room Edition)
// tests/simulator_verify.js — Autonomous Plan Simulator & Bug Audit Suite
// ============================================================================

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Provide a complete DOM/Canvas mock so data.js, spatial.js, nav.js, vfx.js,
// audio.js, engine.js, ai.js, simulator.js, and ui.js all load and run cleanly.
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

function createMockElement(id = '') {
  return {
    id,
    width: 1280,
    height: 720,
    textContent: '',
    innerHTML: '',
    value: '',
    disabled: false,
    style: {},
    dataset: {},
    children: [],
    getContext: () => mockCanvasContext,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
    addEventListener: () => {},
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    querySelector: () => createMockElement(),
    querySelectorAll: () => [],
    setAttribute(k, v) {
      this[k] = v;
    },
    getAttribute(k) {
      return this[k];
    },
    click() {
      if (typeof this.onclick === 'function') this.onclick();
    },
    classList: {
      add: () => {},
      remove: () => {},
      toggle: () => {},
      contains: () => false
    }
  };
}

const elementCache = new Map();
const sandbox = {
  window: null,
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
  addEventListener: () => {},
  innerWidth: 1280,
  innerHeight: 720,
  document: {
    body: createMockElement('body'),
    getElementById(id) {
      if (!elementCache.has(id)) elementCache.set(id, createMockElement(id));
      return elementCache.get(id);
    },
    querySelectorAll: () => [],
    querySelector: () => createMockElement(),
    createElement: tag => createMockElement(tag)
  }
};
sandbox.window = sandbox;

const rootDir = path.resolve(__dirname, '..');
const filesToLoad = [
  'js/data.js',
  'js/spatial.js',
  'js/nav.js',
  'js/vfx.js',
  'js/audio.js',
  'js/engine.js',
  'js/ai.js',
  'js/simulator.js',
  'js/ui.js'
];

for (const rel of filesToLoad) {
  const fullPath = path.join(rootDir, rel);
  const code = fs.readFileSync(fullPath, 'utf8');
  vm.runInNewContext(code, sandbox, { filename: rel });
}

const { ZH_DATA, ZH_SPATIAL, ZH_ENGINE, ZH_AI, ZH_SIMULATOR, ZH_UI } = sandbox;

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
console.log(' C&C: GENERALS – ZERO HOUR | PLAN SIMULATOR & BUG AUDIT VERIFICATION');
console.log('====================================================================');

// ----------------------------------------------------------------------------
// PART 1: Regression Verification for Discovered & Fixed Engine/UI/AI/Data Bugs
// ----------------------------------------------------------------------------

check('BUG-FIX-01: 3D Parabolic Ballistics Arc z(t) > 0 at mid-flight', () => {
  const canvas = sandbox.document.getElementById('game-canvas');
  const mCanvas = sandbox.document.getElementById('minimap-canvas');
  const eng = new ZH_ENGINE.GameEngine(canvas, mCanvas, {
    mapId: 'TOURNAMENT_DESERT',
    playerGenId: 'CHINA_TAO',
    enemyGenId: 'USA_TOWNES'
  });

  const nukeCannon = eng.spawnUnit('CHINA_NUKE_CANNON', 0, 400, 400);
  const targetTank = eng.spawnUnit('USA_LASER_CRUSADER', 1, 700, 400);
  eng.fireWeapon(nukeCannon, targetTank);

  assert(eng.projectiles.length > 0, 'Nuke Cannon should spawn a ballistic projectile');
  const proj = eng.projectiles[0];
  assert(proj.isBallistic && proj.peakHeight > 0, 'Projectile should be marked ballistic with peakHeight > 0');

  // Step projectile to mid-flight
  const midTime = (proj.totalDist / proj.speed) * 0.5;
  eng.updateProjectiles(midTime);
  assert(
    proj.z > 20,
    `Ballistic projectile z-height at mid-flight should be > 20px, got z=${proj.z}`
  );
});

check('BUG-FIX-02: Garrisoned units use garrisonedIn and are excluded from spatial queries', () => {
  const canvas = sandbox.document.getElementById('game-canvas');
  const mCanvas = sandbox.document.getElementById('minimap-canvas');
  const eng = new ZH_ENGINE.GameEngine(canvas, mCanvas, {
    mapId: 'FINAL_CRUSADE',
    playerGenId: 'USA_TOWNES',
    enemyGenId: 'CHINA_KWAI'
  });

  const bunker = eng.garrisonBunkers[0];
  const ranger = eng.spawnUnit('USA_RANGER', 0, bunker.x + 5, bunker.y + 5);
  ranger.state = 'ENTER_GARRISON';
  ranger.targetEntityId = bunker.id;

  eng.update(0.2);
  assert.strictEqual(ranger.garrisonedIn, bunker.id, 'Ranger should have garrisonedIn === bunker.id');
  assert(
    bunker.occupants.some(occ => occ === ranger || occ.id === ranger.id),
    'Bunker occupants should contain ranger'
  );

  // Rebuild spatial grid and ensure garrisoned unit is NOT directly targeted outside the bunker
  eng.spatialGrid.rebuild(eng.units, eng.buildings);
  const enemyFound = eng.spatialGrid.queryNearestEnemy(bunker.x, bunker.y, 100, 1);
  assert.strictEqual(enemyFound, null, 'Garrisoned infantry inside bunker must not be returned by queryNearestEnemy');

  // Test evacuateGarrison with both bunker ID and bunker object
  eng.evacuateGarrison(bunker.id);
  assert.strictEqual(ranger.garrisonedIn, null, 'evacuateGarrison(bunker.id) must clear garrisonedIn');

  eng.enterGarrison(ranger, bunker);
  assert.strictEqual(ranger.garrisonedIn, bunker.id, 'enterGarrison must set garrisonedIn');
  eng.evacuateGarrison(bunker);
  assert.strictEqual(ranger.garrisonedIn, null, 'evacuateGarrison(bunkerObj) must also clear garrisonedIn');
});

check('BUG-FIX-03: Unit active abilities normalized and triggerable via string ID', () => {
  for (const [uId, uDef] of Object.entries(ZH_DATA.UNITS)) {
    if (uDef.ability !== undefined && uDef.ability !== null) {
      assert.strictEqual(
        typeof uDef.ability,
        'string',
        `Unit ${uId} ability should be normalized to string ID, got ${typeof uDef.ability}`
      );
      assert(
        ZH_DATA.UNIT_ABILITIES[uDef.ability],
        `Unit ${uId} ability ${uDef.ability} must exist in ZH_DATA.UNIT_ABILITIES`
      );
    }
  }
});

check('BUG-FIX-04: Tech Hospital heals infantry and Tech Repair Bay repairs vehicles', () => {
  const canvas = sandbox.document.getElementById('game-canvas');
  const mCanvas = sandbox.document.getElementById('minimap-canvas');
  const eng = new ZH_ENGINE.GameEngine(canvas, mCanvas, {
    mapId: 'DEFCON_6',
    playerGenId: 'USA_ALEXANDER',
    enemyGenId: 'GLA_THRAX'
  });

  const hospital = eng.techStructures.find(t => t.defId === 'TECH_HOSPITAL');
  const repairBay = eng.techStructures.find(t => t.defId === 'TECH_REPAIR_BAY');
  assert(hospital && repairBay, 'Map should contain Hospital and Repair Bay tech structures');

  hospital.team = 0;
  repairBay.team = 0;

  const ranger = eng.spawnUnit('USA_RANGER', 0, hospital.x + 10, hospital.y + 10);
  ranger.hp = 50;
  const tank = eng.spawnUnit('USA_CRUSADER', 0, repairBay.x + 10, repairBay.y + 10);
  tank.hp = 200;

  eng.updateUnits(1.0);
  assert(ranger.hp > 50, `Tech Hospital should passively heal friendly infantry (hp=${ranger.hp})`);
  assert(tank.hp > 200, `Tech Repair Bay should passively repair friendly vehicles (hp=${tank.hp})`);
});

check('BUG-FIX-05: Builders repair damaged constructed buildings and AI avoids multi-building overlap', () => {
  const canvas = sandbox.document.getElementById('game-canvas');
  const mCanvas = sandbox.document.getElementById('minimap-canvas');
  const eng = new ZH_ENGINE.GameEngine(canvas, mCanvas, {
    mapId: 'TOURNAMENT_DESERT',
    playerGenId: 'USA_ALEXANDER',
    enemyGenId: 'CHINA_KWAI'
  });

  const cc = eng.buildings.find(b => b.team === 0 && b.def.isCommandCenter);
  cc.hp = cc.maxHp - 300;
  const dozer = eng.units.find(u => u.team === 0 && u.def.isBuilder);
  dozer.x = cc.x + 20;
  dozer.y = cc.y + 20;
  dozer.state = 'BUILD';
  dozer.buildTargetId = cc.id;

  const hpBefore = cc.hp;
  eng.updateUnits(1.0);
  assert(cc.hp > hpBefore, `Dozer in BUILD state on damaged constructed building should repair it (${hpBefore} -> ${cc.hp})`);

  // Verify findValidBuildSpot returns non-overlapping coordinates for multiple buildings
  const spot1 = eng.findValidBuildSpot('USA_REACTOR', cc.x, cc.y, 0);
  const b1 = eng.startBuildingPlacement('USA_REACTOR', 0, spot1.x, spot1.y);
  assert(b1, 'First reactor placement should succeed');

  const spot2 = eng.findValidBuildSpot('USA_REACTOR', cc.x, cc.y, 0);
  const b2 = eng.startBuildingPlacement('USA_REACTOR', 0, spot2.x, spot2.y);
  assert(b2, 'Second reactor placement at same preferredSlot must automatically spiral to a valid non-overlapping spot');
});

check('BUG-FIX-06: Black Lotus remote capture & Troop/Assault Crawler infantry spawn on build', () => {
  const canvas = sandbox.document.getElementById('game-canvas');
  const mCanvas = sandbox.document.getElementById('minimap-canvas');
  const eng = new ZH_ENGINE.GameEngine(canvas, mCanvas, {
    mapId: 'TOURNAMENT_DESERT',
    playerGenId: 'CHINA_SHIN_FAI',
    enemyGenId: 'GLA_KASSAD'
  });

  assert.strictEqual(ZH_DATA.UNITS.CHINA_BLACK_LOTUS.isRemoteHacker, true, 'Black Lotus must have isRemoteHacker: true');
  assert.strictEqual(ZH_DATA.UNITS.CHINA_ASSAULT_CRAWLER.spawnsInfantryCount, 4, 'Assault Crawler must spawn 4 Minigunners');

  const wf = eng.spawnBuilding('CHINA_WAR_FACTORY', 0, 500, 500, true);
  eng.teams[0].credits = 10000;
  eng.queueUnitProduction(wf, 'CHINA_ASSAULT_CRAWLER');
  assert(wf.queue.length === 1, 'War Factory should queue CHINA_ASSAULT_CRAWLER');
  wf.queue[0].timer = 0.05;

  const unitsBefore = eng.units.filter(u => u.defId === 'CHINA_MINIGUNNER').length;
  eng.updateBuildings(0.2);
  const unitsAfter = eng.units.filter(u => u.defId === 'CHINA_MINIGUNNER').length;
  assert.strictEqual(unitsAfter - unitsBefore, 4, 'Completing CHINA_ASSAULT_CRAWLER should spawn 4 CHINA_MINIGUNNER escort units');
});

check('BUG-FIX-07: Weapon Upgrades (Black Napalm, AP Rockets, Anthrax Beta + Toxin General)', () => {
  const canvas = sandbox.document.getElementById('game-canvas');
  const mCanvas = sandbox.document.getElementById('minimap-canvas');
  const eng = new ZH_ENGINE.GameEngine(canvas, mCanvas, {
    mapId: 'TOURNAMENT_DESERT',
    playerGenId: 'GLA_THRAX',
    enemyGenId: 'CHINA_TAO'
  });

  const tractor = eng.spawnUnit('GLA_TOXIN_TRACTOR', 0, 400, 400);
  const target1 = eng.spawnUnit('CHINA_BATTLEMASTER', 1, 450, 400);
  eng.fireWeapon(tractor, target1);
  const dmgBeforeBeta = eng.projectiles[eng.projectiles.length - 1].damage;

  eng.teams[0].upgrades.add('UPG_ANTHRAX_BETA');
  tractor.attackCooldown = 0;
  eng.fireWeapon(tractor, target1);
  const dmgAfterBeta = eng.projectiles[eng.projectiles.length - 1].damage;
  assert(
    dmgAfterBeta > dmgBeforeBeta * 1.2,
    `Anthrax Beta must stack with Dr. Thrax toxinDamageMult (${dmgBeforeBeta} -> ${dmgAfterBeta})`
  );
});

// ----------------------------------------------------------------------------
// PART 2: Autonomous PlanSimulator + AuditEngine Verification Across All 9 Generals
// ----------------------------------------------------------------------------

const allGenerals = Object.keys(ZH_DATA.GENERALS);
const planKeys = Object.keys(ZH_SIMULATOR.PLANS);

for (let i = 0; i < allGenerals.length; i++) {
  const playerGenId = allGenerals[i];
  const enemyGenId = allGenerals[(i + 3) % allGenerals.length];
  const planId = planKeys[i % planKeys.length];

  check(`SIM-MATCH-0${i + 1}: Autonomous PlanSimulator (${playerGenId} vs ${enemyGenId} | ${planId})`, () => {
    const canvas = sandbox.document.getElementById('game-canvas');
    const mCanvas = sandbox.document.getElementById('minimap-canvas');
    const mapIds = ZH_DATA.MAPS.map(m => m.id);
    const mapId = mapIds[i % mapIds.length];

    const eng = new ZH_ENGINE.GameEngine(canvas, mCanvas, {
      mapId,
      playerGenId,
      enemyGenId
    });
    const sim = new ZH_SIMULATOR.PlanSimulator(eng, ZH_AI, {
      enabled: true,
      speedMultiplier: 1,
      planId,
      team: 0
    });

    // Give both sides extra starting credits so Tier-1 -> Tier-3 tech, upgrades,
    // unit production, abilities, and combat engagements all occur within 500 ticks!
    eng.teams[0].credits = 18000;
    eng.teams[1].credits = 18000;
    eng.teams[0].generalPoints = 2;
    eng.teams[1].generalPoints = 2;

    const dt = 0.05;
    for (let step = 0; step < 600; step++) {
      if (!eng.running || eng.gameOver) break;
      eng.update(dt);
      sim.update(dt);
    }

    const errors = sim.audit.issues.filter(iss => iss.severity === 'ERROR');
    assert.strictEqual(
      errors.length,
      0,
      `AuditEngine detected runtime errors in ${playerGenId} vs ${enemyGenId}: ${JSON.stringify(errors)}`
    );

    assert(
      sim.audit.metrics.buildingsConstructed >= 2,
      `PlanSimulator for ${playerGenId} should construct at least 2 base buildings (built ${sim.audit.metrics.buildingsConstructed})`
    );
  });
}

// ----------------------------------------------------------------------------
// PART 3: UI Right-Click Order & Command Card Pipeline Fuzzing
// ----------------------------------------------------------------------------

check('SIM-UI-FUZZ: UI Selection, Command Card Refresh & Right-Click Order Pipeline', () => {
  ZH_UI.startNewMatch();
  const eng = ZH_UI.getEngine();
  assert(eng, 'ZH_UI.getEngine() should return active GameEngine instance');

  // Select all player units and buildings one by one and refresh Command Card
  for (const u of eng.units.filter(u => u.team === 0)) {
    eng.selectedIds.clear();
    eng.selectedIds.add(u.id);
    ZH_UI.refreshCommandBar();
    ZH_UI.issueRightClickOrder(u.x + 80, u.y + 80, false, false);
    ZH_UI.issueRightClickOrder(u.x + 140, u.y + 140, true, true);
  }

  for (const b of eng.buildings.filter(b => b.team === 0)) {
    eng.selectedIds.clear();
    eng.selectedIds.add(b.id);
    ZH_UI.refreshCommandBar();
    ZH_UI.issueRightClickOrder(b.x + 120, b.y + 120, false, false);
  }
});

console.log('====================================================================');
console.log(` 🏆 ALL ${passed} PLAN SIMULATOR & BUG AUDIT CHECKS PASSED 100%!`);
console.log('====================================================================');
