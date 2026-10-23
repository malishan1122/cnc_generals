// ============================================================================
// Command & Conquer: Generals – Zero Hour (macOS Clean-Room Edition)
// tests/game_speed_verify.js — Ticket P1-01: Game Speed Scaling Verification
// ============================================================================
// Verifies that advancing 1.0s of wall time via stepFixed(frameDt) at gameSpeed
// settings 1, 1.5, 2, and 3 increases matchTime by 1.0s, 1.5s, 2.0s, and 3.0s
// (±1 fixed tick = 1/30s) and never double-scales dt inside update(dt).
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
  console.log(' C&C Generals Zero Hour — Game Speed Scaling Verification (P1-01)');
  console.log('================================================================');

  const speeds = [1, 1.5, 2, 3];
  const tickTolerance = (1 / 30) + 1e-6; // ±1 simulation tick

  for (const spd of speeds) {
    const engine = new win.ZH_ENGINE.GameEngine(
      win.document.getElementById('game-canvas'),
      win.document.getElementById('minimap-canvas')
    );
    engine.initMatch({
      mode: 'SKIRMISH',
      playerGeneralId: 'USA_GRANGER',
      aiGeneralId: 'CHINA_KWAI',
      difficulty: 'NORMAL',
      mapId: 'TOURNAMENT_DESERT',
      seed: 20261022
    });
    engine.gameSpeed = spd;

    // Advance 60 frames of 1/60s wall time (= 1.000s wall time)
    const frames = 60;
    const frameDt = 1 / 60;
    for (let f = 0; f < frames; f++) {
      engine.stepFixed(frameDt);
    }

    const expectedSimTime = 1.0 * spd;
    const diff = Math.abs(engine.matchTime - expectedSimTime);
    assert(
      diff <= tickTolerance,
      `1.0s wall time at ${spd}x speed advances matchTime by ${engine.matchTime.toFixed(4)}s (expected ${expectedSimTime.toFixed(2)}s ±${(1 / 30).toFixed(4)}s)`,
      `matchTime=${engine.matchTime}, expected=${expectedSimTime}, diff=${diff}`
    );
  }

  // Also verify direct update(dt) does not multiply dt by gameSpeed a second time
  const directEngine = new win.ZH_ENGINE.GameEngine(
    win.document.getElementById('game-canvas'),
    win.document.getElementById('minimap-canvas')
  );
  directEngine.initMatch({
    mode: 'SKIRMISH',
    playerGeneralId: 'USA_GRANGER',
    aiGeneralId: 'CHINA_KWAI',
    difficulty: 'NORMAL',
    mapId: 'TOURNAMENT_DESERT',
    seed: 20261022
  });
  directEngine.gameSpeed = 2.0;
  directEngine.update(0.1);
  assert(
    Math.abs(directEngine.matchTime - 0.1) < 1e-6,
    `update(0.1) with gameSpeed=2.0 advances matchTime by exactly 0.100s (got ${directEngine.matchTime.toFixed(4)}s)`
  );

  console.log('----------------------------------------------------------------');
  console.log(` Game Speed Verification Summary: ${passed}/${passed + failed} PASSED`);
  console.log('================================================================');
  process.exit(failed > 0 ? 1 : 0);
}

main();
