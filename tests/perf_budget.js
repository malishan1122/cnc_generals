// ============================================================================
// Command & Conquer: Generals – Zero Hour (macOS Clean-Room Edition)
// tests/perf_budget.js — Ticket P2-05: 1,000-Unit Simulation Performance Budget
// ============================================================================
// Spawns 1,000 active units (500 vs 500) across two teams and measures 600
// simulation ticks in headless Node.
// Acceptance criteria:
//   - Average tick time <= 6.0 ms
//   - p99 tick time     <= 12.0 ms
// Also verifies binary min-heap A* pathfinding and blocked-goal routing (P1-08).
// ============================================================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { performance } = require('perf_hooks');

function createHarness() {
  const noop = () => {};
  const makeCtx = () => new Proxy({}, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'measureText') return (t) => ({ width: String(t || '').length * 7 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return () => ({ addColorStop: noop });
      }
      return noop;
    },
    set(target, prop, val) {
      target[prop] = val;
      return true;
    }
  });

  const windowObj = {
    innerWidth: 1440,
    innerHeight: 900,
    devicePixelRatio: 2,
    performance,
    requestAnimationFrame: noop,
    addEventListener: noop,
    speechSynthesis: { speak: noop, cancel: noop }
  };

  const documentObj = {
    getElementById: () => ({
      width: 1440,
      height: 900,
      style: {},
      classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
      addEventListener: noop,
      getContext: () => makeCtx(),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1440, height: 900 })
    }),
    createElement: () => ({
      width: 256,
      height: 256,
      style: {},
      getContext: () => makeCtx()
    }),
    querySelectorAll: () => [],
    addEventListener: noop
  };

  windowObj.window = windowObj;
  windowObj.document = documentObj;
  Object.assign(windowObj, {
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
    JSON,
    Float32Array,
    Uint8Array,
    Int32Array,
    Uint8ClampedArray,
    setTimeout: noop,
    clearTimeout: noop
  });

  const context = vm.createContext(windowObj);
  const root = path.resolve(__dirname, '..');
  for (const rel of ['js/rng.js', 'js/data.js', 'js/spatial.js', 'js/nav.js', 'js/audio.js', 'js/vfx.js', 'js/ai.js', 'js/engine.js']) {
    const code = fs.readFileSync(path.join(root, rel), 'utf8');
    vm.runInContext(code, context, { filename: rel });
  }
  return windowObj;
}

function main() {
  const win = createHarness();
  let passed = 0;
  let failed = 0;

  function assert(cond, label, detail = '') {
    if (cond) {
      passed++;
      console.log(`  [PASS] ${label}`);
    } else {
      failed++;
      console.error(`  [FAIL] ${label}${detail ? ' — ' + detail : ''}`);
    }
  }

  console.log('================================================================');
  console.log(' C&C Generals Zero Hour — 1,000-Unit Performance Budget (P2-05)');
  console.log('================================================================');

  // 1. P1-08: Verify blocked-goal A* pathfinding routes to nearest walkable cell
  // and does not append the blocked building center as the final waypoint.
  const navEngine = new win.ZH_ENGINE.GameEngine(
    win.document.getElementById('game-canvas'),
    win.document.getElementById('minimap-canvas')
  );
  navEngine.initMatch({
    mode: 'SKIRMISH',
    playerGeneralId: 'USA_GRANGER',
    aiGeneralId: 'CHINA_KWAI',
    difficulty: 'NORMAL',
    mapId: 'TOURNAMENT_DESERT',
    seed: 20261022
  });
  const wallBld = navEngine.spawnBuilding('USA_WAR_FACTORY', 0, 1100, 1100, true);
  navEngine.navGrid.rebuild(navEngine);
  const pathToBlocked = navEngine.navGrid.findPath(900, 1100, wallBld.x, wallBld.y);
  const finalWp = pathToBlocked[pathToBlocked.length - 1];
  const finalCell = navEngine.navGrid.worldToCell(finalWp.x, finalWp.y);
  assert(
    pathToBlocked.length > 0 && !navEngine.navGrid.isBlocked(finalCell.col, finalCell.row),
    `Blocked-goal A* pathfinding ends on a walkable perimeter cell (${finalCell.col}, ${finalCell.row}) instead of inside the blocked building`
  );

  // 2. P2-05: 1,000-unit simulation benchmark across 600 ticks
  const perfEngine = new win.ZH_ENGINE.GameEngine(
    win.document.getElementById('game-canvas'),
    win.document.getElementById('minimap-canvas')
  );
  perfEngine.initMatch({
    mode: 'SKIRMISH',
    playerGeneralId: 'CHINA_KWAI',
    aiGeneralId: 'GLA_THRAX',
    difficulty: 'HARD',
    mapId: 'TOURNAMENT_DESERT',
    seed: 1000
  });

  // Clear starting units so we control exact 1,000-unit count
  perfEngine.units = [];
  const cols = 25;
  for (let i = 0; i < 500; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const u0 = perfEngine.spawnUnit(
      i % 2 === 0 ? 'CHINA_RED_GUARD' : 'CHINA_BATTLEMASTER',
      0,
      220 + col * 28,
      1950 + row * 28
    );
    const u1 = perfEngine.spawnUnit(
      i % 2 === 0 ? 'GLA_REBEL' : 'GLA_SCORPION',
      1,
      1900 + col * 28,
      220 + row * 28
    );
    if (u0 && i % 4 === 0) {
      u0.state = 'ATTACK_MOVE';
      u0.targetX = 1400;
      u0.targetY = 1400;
    }
    if (u1 && i % 4 === 0) {
      u1.state = 'ATTACK_MOVE';
      u1.targetX = 1400;
      u1.targetY = 1400;
    }
  }

  assert(
    perfEngine.units.length === 1000,
    `Spawned ${perfEngine.units.length} active units across 2 teams (500 vs 500)`
  );

  const tickCount = 600;
  const durations = [];
  for (let t = 1; t <= tickCount; t++) {
    const start = performance.now();
    perfEngine.step(t, []);
    durations.push(performance.now() - start);
  }

  const sum = durations.reduce((a, b) => a + b, 0);
  const avgMs = sum / durations.length;
  const sorted = [...durations].sort((a, b) => a - b);
  const p99Ms = sorted[Math.floor(sorted.length * 0.99)];

  assert(
    avgMs <= 6.0,
    `1,000-unit 600-tick average step time is ${avgMs.toFixed(2)}ms (budget <= 6.00ms)`
  );
  assert(
    p99Ms <= 12.0,
    `1,000-unit 600-tick p99 step time is ${p99Ms.toFixed(2)}ms (budget <= 12.00ms)`
  );

  console.log('----------------------------------------------------------------');
  console.log(` Performance Budget Summary: ${passed}/${passed + failed} PASSED`);
  console.log('================================================================');
  process.exit(failed > 0 ? 1 : 0);
}

main();
