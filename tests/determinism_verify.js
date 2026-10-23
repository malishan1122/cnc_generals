// ============================================================================
// Command & Conquer: Generals – Zero Hour (macOS Clean-Room Edition)
// tests/determinism_verify.js — Tickets P1-03, P1-04, P1-05, P1-06 Verification
// ============================================================================
// Verifies:
//   1. Zero unseeded Math.random() calls in js/engine.js and js/ai.js.
//   2. Two engines with the same seed + command schedule produce identical
//      computeStateHash() across all 300-tick checkpoints in a 3,600-tick match.
//   3. Different seeds diverge.
//   4. Authoritative command validation (foreign unit/building rejection,
//      hero uniqueness, prerequisite enforcement) & replay export/re-execution.
//   5. Mid-match save/load at tick N + 600 ticks matches uninterrupted run,
//      and corrupted save payloads fail cleanly without throwing.
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

  const storageMap = new Map();
  const localStorageObj = {
    getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
    setItem: (k, v) => storageMap.set(k, String(v)),
    removeItem: (k) => storageMap.delete(k)
  };

  const windowObj = {
    innerWidth: 1440,
    innerHeight: 900,
    devicePixelRatio: 2,
    performance,
    localStorage: localStorageObj,
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

function runMatchWithCheckpoints(win, seed, commandSchedule, totalTicks = 3600, checkpointInterval = 300) {
  const engine = new win.ZH_ENGINE.GameEngine(
    win.document.getElementById('game-canvas'),
    win.document.getElementById('minimap-canvas')
  );
  engine.initMatch({
    mode: 'SKIRMISH',
    playerGeneralId: 'USA_GRANGER',
    aiGeneralId: 'CHINA_KWAI',
    difficulty: 'HARD',
    mapId: 'TOURNAMENT_DESERT',
    seed
  });

  const checkpoints = {};
  for (let tick = 1; tick <= totalTicks; tick++) {
    const cmds = commandSchedule[tick] || [];
    // Also drive Team 0 AI every tick for full AI-vs-AI combat coverage
    win.ZH_AI.updateTeam(engine, 0, 1 / 30);
    const hash = engine.step(tick, cmds);
    if (tick % checkpointInterval === 0 || tick === totalTicks) {
      checkpoints[tick] = hash;
    }
  }
  return { engine, checkpoints, finalHash: checkpoints[totalTicks] };
}

function main() {
  const root = path.resolve(__dirname, '..');
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
  console.log(' C&C Generals Zero Hour — Determinism, Command & Save Verification');
  console.log('================================================================');

  // 1. Static check: zero Math.random in js/engine.js and js/ai.js
  const engineSrc = fs.readFileSync(path.join(root, 'js/engine.js'), 'utf8');
  const aiSrc = fs.readFileSync(path.join(root, 'js/ai.js'), 'utf8');
  const engineRandomHits = (engineSrc.match(/Math\.random/g) || []).length;
  const aiRandomHits = (aiSrc.match(/Math\.random/g) || []).length;
  assert(
    engineRandomHits === 0 && aiRandomHits === 0,
    `Zero unseeded Math.random() calls in js/engine.js (${engineRandomHits}) and js/ai.js (${aiRandomHits})`
  );

  // 2. 3,600-tick AI-vs-AI match determinism with 300-tick checkpoints
  const schedule = {
    10: [{ type: 'BUILD', teamId: 0, defId: 'USA_REACTOR', x: 640, y: 2420 }],
    45: [{ type: 'QUEUE_PRODUCTION', teamId: 0, buildingId: 1, itemType: 'UNIT', itemId: 'USA_DOZER' }],
    120: [{ type: 'CAST_POWER', teamId: 0, powerId: 'GP_USA_SPY_DRONE', x: 1400, y: 1400 }]
  };

  const runA = runMatchWithCheckpoints(win, 20261022, schedule, 3600, 300);
  const runB = runMatchWithCheckpoints(win, 20261022, schedule, 3600, 300);
  const runC = runMatchWithCheckpoints(win, 19950902, schedule, 3600, 300);

  const checkpointKeys = Object.keys(runA.checkpoints);
  const all300Match = checkpointKeys.every(k => runA.checkpoints[k] === runB.checkpoints[k]);
  assert(
    all300Match && checkpointKeys.length === 12,
    `Two 3,600-tick AI-vs-AI runs with seed 20261022 match across all ${checkpointKeys.length} (300-tick) checkpoints (final=${runA.finalHash})`,
    JSON.stringify({ runA: runA.checkpoints, runB: runB.checkpoints })
  );

  assert(
    runA.finalHash !== runC.finalHash,
    `Different seeds (20261022 vs 19950902) diverge cleanly (${runA.finalHash} vs ${runC.finalHash})`
  );

  // 3. Authoritative Command Validation & Structured Rejection Events (P1-04 / P1-05)
  const valEngine = new win.ZH_ENGINE.GameEngine(
    win.document.getElementById('game-canvas'),
    win.document.getElementById('minimap-canvas')
  );
  valEngine.initMatch({
    mode: 'SKIRMISH',
    playerGeneralId: 'USA_GRANGER',
    aiGeneralId: 'CHINA_KWAI',
    difficulty: 'NORMAL',
    mapId: 'TOURNAMENT_DESERT',
    seed: 101
  });
  const wf = valEngine.spawnBuilding('USA_WAR_FACTORY', 0, 720, 2260, true);
  const raks = valEngine.spawnBuilding('USA_BARRACKS', 0, 560, 2260, true);
  valEngine.teams[0].credits = 10000;

  const illegalForeignUnit = valEngine.issueCommand({
    type: 'QUEUE_PRODUCTION',
    teamId: 0,
    buildingId: wf.id,
    itemType: 'UNIT',
    itemId: 'CHINA_OVERLORD'
  });
  assert(
    illegalForeignUnit.ok === false && wf.queue.length === 0 && valEngine.teams[0].credits === 10000,
    `issueCommand rejects training foreign CHINA_OVERLORD from USA_WAR_FACTORY (${illegalForeignUnit.reason})`
  );

  const illegalForeignBld = valEngine.issueCommand({
    type: 'BUILD',
    teamId: 0,
    defId: 'GLA_PALACE',
    x: 840,
    y: 2260
  });
  assert(
    illegalForeignBld.ok === false && valEngine.teams[0].credits === 10000,
    `issueCommand rejects placing foreign GLA_PALACE as USA (${illegalForeignBld.reason})`
  );

  // Hero uniqueness check: spawn Black Lotus on Team 1 (China), then attempt to queue a second Black Lotus
  const chinaRaks = valEngine.spawnBuilding('CHINA_BARRACKS', 1, 2100, 620, true);
  valEngine.spawnBuilding('CHINA_PROPAGANDA_CENTER', 1, 2220, 620, true);
  valEngine.recalculatePower(1);
  valEngine.spawnUnit('CHINA_BLACK_LOTUS', 1, 2100, 700);
  const secondHero = valEngine.issueCommand({
    type: 'QUEUE_PRODUCTION',
    teamId: 1,
    buildingId: chinaRaks.id,
    itemType: 'UNIT',
    itemId: 'CHINA_BLACK_LOTUS'
  });
  assert(
    secondHero.ok === false && secondHero.code === 'HERO_LIMIT_REACHED',
    `issueCommand enforces hero uniqueness and rejects second CHINA_BLACK_LOTUS (${secondHero.code}: ${secondHero.reason})`
  );

  // Replay export & re-execution (P1-04)
  const replayEngine = new win.ZH_ENGINE.GameEngine(
    win.document.getElementById('game-canvas'),
    win.document.getElementById('minimap-canvas')
  );
  const replayResult = replayEngine.runReplay(runA.engine.exportReplay(), {
    onBeforeStep: (eng) => {
      win.ZH_AI.updateTeam(eng, 0, 1 / 30);
    }
  });
  assert(
    replayResult.ok && replayResult.finalHash === runA.finalHash,
    `exportReplay() + runReplay() reproduces identical 3,600-tick final state hash (${replayResult.finalHash})`
  );

  // 4. Mid-match Save/Load Determinism with active projectiles, beams, drones, gunships, and transports (P1-06)
  function createMidMatchEngine() {
    const eng = new win.ZH_ENGINE.GameEngine(
      win.document.getElementById('game-canvas'),
      win.document.getElementById('minimap-canvas')
    );
    eng.initMatch({
      mode: 'SKIRMISH',
      playerGeneralId: 'USA_GRANGER',
      aiGeneralId: 'CHINA_KWAI',
      difficulty: 'HARD',
      mapId: 'TOURNAMENT_DESERT',
      seed: 777888
    });
    // Spawn combat forces in firing range plus transport passengers, spy drone, and gunship
    const humvee = eng.spawnUnit('USA_HUMVEE', 0, 1320, 1400);
    const ranger = eng.spawnUnit('USA_RANGER', 0, 1325, 1405);
    if (humvee && ranger) {
      eng.enterTransport(ranger, humvee);
    }
    eng.spawnUnit('USA_CRUSADER', 0, 1350, 1400);
    eng.spawnUnit('CHINA_BATTLEMASTER', 1, 1470, 1400);
    eng.spyDrones.push({ id: eng.allocId(), team: 0, x: 1400, y: 1400, radius: 320, timer: 25 });
    eng.spectreGunships.push({
      id: eng.allocId(),
      team: 0,
      cx: 1450,
      cy: 1400,
      x: 1650,
      y: 1400,
      angle: 0.5,
      timer: 12,
      shotTimer: 0.4
    });
    return eng;
  }

  const uninterrupted = createMidMatchEngine();
  for (let t = 1; t <= 300; t++) {
    win.ZH_AI.updateTeam(uninterrupted, 0, 1 / 30);
    uninterrupted.step(t, []);
  }
  const snapshotAt300 = JSON.parse(JSON.stringify(uninterrupted.serializeState()));

  // Continue uninterrupted for 600 more ticks (to tick 900)
  for (let t = 301; t <= 900; t++) {
    win.ZH_AI.updateTeam(uninterrupted, 0, 1 / 30);
    uninterrupted.step(t, []);
  }
  const hashUninterrupted900 = uninterrupted.computeStateHash();

  // Restore snapshot into a fresh engine and advance 600 ticks (to tick 900)
  const restored = new win.ZH_ENGINE.GameEngine(
    win.document.getElementById('game-canvas'),
    win.document.getElementById('minimap-canvas')
  );
  const loadOk = restored.deserializeState(snapshotAt300);
  for (let t = 301; t <= 900; t++) {
    win.ZH_AI.updateTeam(restored, 0, 1 / 30);
    restored.step(t, []);
  }
  const hashRestored900 = restored.computeStateHash();

  assert(
    loadOk && hashUninterrupted900 === hashRestored900,
    `Mid-match Save/Load at tick 300 + 600 ticks matches uninterrupted 900-tick state hash (${hashRestored900})`,
    `uninterrupted=${hashUninterrupted900}, restored=${hashRestored900}`
  );

  // Verify corrupted save payloads fail cleanly without throwing
  const corruptJsonOk = restored.importSaveJSON('{corrupted_json!!!');
  const missingFieldsOk = restored.deserializeState({ version: '2.1', teams: [] });
  assert(
    corruptJsonOk === false && missingFieldsOk === false && restored.units.length > 0,
    'Corrupted JSON and incomplete save payloads return false cleanly without crashing or wiping active match'
  );

  console.log('----------------------------------------------------------------');
  console.log(` Determinism Verification Summary: ${passed}/${passed + failed} PASSED`);
  console.log('================================================================');
  process.exit(failed > 0 ? 1 : 0);
}

main();
