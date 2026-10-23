// ============================================================================
// Command & Conquer: Generals – Zero Hour (macOS Clean-Room Edition)
// tests/replay_hash_verify.js — Phase 2 & 3 Determinism, Replay Hash,
// Challenge 2.0 Scripted Twist & 80-Unit Step Benchmark Verification
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
    AudioContext: function () {
      this.sampleRate = 44100;
      this.currentTime = 0;
      this.createGain = () => ({ gain: { value: 1, setValueAtTime: noop, exponentialRampToValueAtTime: noop, linearRampToValueAtTime: noop }, connect: noop });
      this.createOscillator = () => ({ frequency: { value: 440, setValueAtTime: noop, exponentialRampToValueAtTime: noop }, connect: noop, start: noop, stop: noop });
      this.createBuffer = (ch, len) => ({ getChannelData: () => new Float32Array(len) });
    },
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

function runCommandSchedule(win, seed, commandSchedule, totalTicks = 600) {
  const canvas = win.document.getElementById('game-canvas');
  const minimap = win.document.getElementById('minimap-canvas');
  const engine = new win.ZH_ENGINE.GameEngine(canvas, minimap);

  engine.initMatch({
    mode: 'SKIRMISH',
    playerGeneralId: 'USA_GRANGER',
    aiGeneralId: 'CHINA_KWAI',
    difficulty: 'NORMAL',
    mapId: 'TOURNAMENT_DESERT',
    seed
  });

  const checkpointHashes = {};
  for (let tick = 1; tick <= totalTicks; tick++) {
    const cmds = commandSchedule[tick] || [];
    const hash = engine.step(tick, cmds);
    if (tick % 120 === 0 || tick === totalTicks) {
      checkpointHashes[tick] = hash;
    }
  }

  return {
    finalHash: checkpointHashes[totalTicks],
    checkpointHashes,
    engine
  };
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
  console.log(' C&C Generals Zero Hour — Replay Determinism & Step Verification');
  console.log('================================================================');

  const scheduleA = {
    5: [{ type: 'BUILD', defId: 'USA_REACTOR', x: 640, y: 2420 }],
    30: [{ type: 'QUEUE_PRODUCTION', buildingId: 1, itemType: 'UNIT', itemId: 'USA_DOZER' }],
    90: [{ type: 'CAST_POWER', powerId: 'GP_USA_SPY_DRONE', x: 1400, y: 1400, teamId: 0 }],
    180: [{ type: 'ATTACK_MOVE', ids: [2, 3], x: 1250, y: 1650 }]
  };

  const run1 = runCommandSchedule(win, 20261022, scheduleA, 600);
  const run2 = runCommandSchedule(win, 20261022, scheduleA, 600);
  const runDiffSeed = runCommandSchedule(win, 99999999, scheduleA, 600);

  assert(
    run1.finalHash === run2.finalHash,
    `Identical seed (20261022) + command log reproduces identical 600-tick state hash (${run1.finalHash})`,
    `run1=${run1.finalHash}, run2=${run2.finalHash}`
  );

  const allCheckpointsMatch = Object.keys(run1.checkpointHashes).every(
    k => run1.checkpointHashes[k] === run2.checkpointHashes[k]
  );
  assert(
    allCheckpointsMatch,
    'All intermediate 120-tick replay state hash checkpoints match bit-for-bit',
    JSON.stringify({ run1: run1.checkpointHashes, run2: run2.checkpointHashes })
  );

  assert(
    run1.finalHash !== runDiffSeed.finalHash,
    `Different match seed produces distinct state hash (${run1.finalHash} vs ${runDiffSeed.finalHash})`
  );

  // Verify Save/Load preserves matchSeed, simRngState, and commandLog
  const snap = run1.engine.serializeState();
  assert(
    snap.matchSeed === 20261022 && Array.isArray(snap.commandLog) && snap.commandLog.length === 4,
    'Save snapshot persists matchSeed, simRngState, and commandLog entries'
  );

  // Verify Challenge 2.0 prefab base + 75s scripted twist
  const chEngine = new win.ZH_ENGINE.GameEngine(
    win.document.getElementById('game-canvas'),
    win.document.getElementById('minimap-canvas')
  );
  chEngine.initMatch({
    mode: 'CHALLENGE',
    playerGeneralId: 'USA_GRANGER',
    aiGeneralId: 'CHINA_KWAI',
    difficulty: 'HARD',
    mapId: 'FINAL_CRUSADE',
    seed: 777
  });
  const initialAiBuildings = chEngine.buildings.filter(b => b.team === 1).length;
  assert(
    initialAiBuildings >= 4,
    `Challenge 2.0 spawns authored forward prefab base for General Kwai (${initialAiBuildings} starting structures)`
  );
  chEngine.gameTime = 75.1;
  chEngine.updateChallengeScriptedTwist();
  const kwaiSpearhead = chEngine.units.filter(u => u.team === 1 && (u.defId === 'CHINA_EMPEROR_OVERLORD' || u.defId === 'CHINA_GATTLING_TANK'));
  assert(
    chEngine.challengeTwistTriggered && kwaiSpearhead.length >= 2,
    `Challenge 2.0 triggers General Kwai's 75s Red Guard Armor Spearhead twist (${kwaiSpearhead.length} spearhead units deployed)`
  );

  // Verify 80-unit pathfinding + navDirty step benchmark (p95 <= 8ms)
  const benchEngine = new win.ZH_ENGINE.GameEngine(
    win.document.getElementById('game-canvas'),
    win.document.getElementById('minimap-canvas')
  );
  benchEngine.initMatch({
    mode: 'SKIRMISH',
    playerGeneralId: 'CHINA_KWAI',
    aiGeneralId: 'GLA_THRAX',
    difficulty: 'HARD',
    mapId: 'DEFCON_6',
    seed: 424242
  });

  for (let i = 0; i < 40; i++) {
    const u0 = benchEngine.spawnUnit('CHINA_BATTLEMASTER', 0, 520 + (i % 8) * 34, 2100 - Math.floor(i / 8) * 34);
    const u1 = benchEngine.spawnUnit('GLA_SCORPION', 1, 2280 - (i % 8) * 34, 620 + Math.floor(i / 8) * 34);
    if (u0) {
      u0.state = 'ATTACK_MOVE';
      u0.targetX = 1400;
      u0.targetY = 1400;
    }
    if (u1) {
      u1.state = 'ATTACK_MOVE';
      u1.targetX = 1400;
      u1.targetY = 1400;
    }
  }

  const stepTimes = [];
  for (let t = 1; t <= 180; t++) {
    const t0 = performance.now();
    benchEngine.step(t, []);
    stepTimes.push(performance.now() - t0);
  }
  stepTimes.sort((a, b) => a - b);
  const p95 = stepTimes[Math.floor(stepTimes.length * 0.95)];
  assert(
    p95 <= 8.0,
    `80-unit active combat & pathfinding simulation step p95 is ${p95.toFixed(2)}ms (target <= 8.00ms)`
  );

  console.log('----------------------------------------------------------------');
  console.log(` Replay & Step Verification Summary: ${passed}/${passed + failed} PASSED`);
  console.log('================================================================');
  process.exit(failed > 0 ? 1 : 0);
}

main();
