// ============================================================================
// Command & Conquer: Generals – Zero Hour (macOS Clean-Room Edition)
// tests/balance_matrix.js — Phase 4 (SYS-27 / P1-09) 9x9 Seeded AI Match Matrix
// ============================================================================
// Runs all 81 (9 Generals x 9 Generals) seeded AI-vs-AI matches up to a tick
// cap (default 180s = 3 minutes simulated match time) or until victory.
// Reports real wins, losses, draws, un-clamped score ratios, and median match
// length without artificial 15–85% score ratio clamping.
// ============================================================================

const fs = require('fs');
const path = require('path');

function createHeadlessEnv() {
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

  const makeCanvas = (w, h) => ({
    width: w,
    height: h,
    style: {},
    getContext: () => ctxStub,
    addEventListener: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h })
  });

  const storageMap = new Map();
  global.localStorage = {
    getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
    setItem: (k, v) => storageMap.set(k, String(v)),
    removeItem: (k) => storageMap.delete(k)
  };

  global.window = global;
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
        textContent: ''
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
  if (!global.ZH_DATA) {
    for (const rel of ['js/rng.js', 'js/spatial.js', 'js/nav.js', 'js/data.js', 'js/ai.js', 'js/engine.js']) {
      const p = path.join(rootDir, rel);
      if (fs.existsSync(p)) {
        eval(fs.readFileSync(p, 'utf8'));
      }
    }
  }

  return { makeCanvas };
}

function computeTeamScore(engine, teamId) {
  const team = engine.teams[teamId];
  let unitValue = 0;
  let combatHp = 0;
  for (const u of engine.units) {
    if (u.team !== teamId || u.hp <= 0) continue;
    const cost = (u.def && u.def.cost) || 400;
    const hpRatio = u.hp / Math.max(1, u.maxHp);
    unitValue += cost * (0.45 + 0.55 * hpRatio) * (1 + (u.vetLevel || 0) * 0.15);
    if (!u.def.isBuilder && !u.def.isHarvester) {
      combatHp += u.hp;
    }
  }

  let buildingValue = 0;
  for (const b of engine.buildings) {
    if (b.team !== teamId || b.hp <= 0) continue;
    const cost = (b.def && b.def.cost) || 800;
    const hpRatio = b.hp / Math.max(1, b.maxHp);
    buildingValue += cost * (0.5 + 0.5 * hpRatio);
  }

  const techScore = (team.upgrades ? team.upgrades.size * 450 : 0) + (team.rank || 1) * 350;
  const econScore = Math.min(2500, (team.credits || 0) * 0.35);
  return unitValue + buildingValue + techScore + econScore + combatHp * 0.35;
}

function computeMedian(values) {
  if (!values || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function runBalanceMatrix(options = {}) {
  const { makeCanvas } = createHeadlessEnv();
  const generalIds = Object.keys(ZH_DATA.GENERALS);
  const stepsPerMatch = options.stepsPerMatch || 900; // 900 steps * 0.2s = 180s (3 minutes simulated match time)
  const dt = options.dt || 0.2;

  const matrix = {};
  const generalStats = {};
  const factionStats = {
    USA: { wins: 0, losses: 0, draws: 0, matches: 0, scoreSum: 0 },
    CHINA: { wins: 0, losses: 0, draws: 0, matches: 0, scoreSum: 0 },
    GLA: { wins: 0, losses: 0, draws: 0, matches: 0, scoreSum: 0 }
  };

  for (const gId of generalIds) {
    matrix[gId] = {};
    generalStats[gId] = {
      id: gId,
      name: ZH_DATA.GENERALS[gId].name,
      faction: ZH_DATA.GENERALS[gId].faction,
      wins: 0,
      losses: 0,
      draws: 0,
      matches: 0,
      scoreRatioSum: 0,
      unitsTrained: 0,
      buildingsConstructed: 0,
      matchLengths: []
    };
  }

  let totalMatches = 0;
  let runtimeErrors = 0;
  const allMatchLengths = [];

  for (let i = 0; i < generalIds.length; i++) {
    for (let j = 0; j < generalIds.length; j++) {
      const g0 = generalIds[i];
      const g1 = generalIds[j];
      totalMatches++;

      try {
        const seed = 20261022 + i * 97 + j * 13;
        const engine = new ZH_ENGINE.GameEngine(makeCanvas(1280, 720), makeCanvas(200, 200));
        engine.initMatch({
          mode: 'SKIRMISH',
          playerGeneralId: g0,
          aiGeneralId: g1,
          mapId: ZH_DATA.MAPS[(i + j) % ZH_DATA.MAPS.length].id,
          difficulty: 'HARD',
          seed
        });

        let stepsRun = 0;
        for (let s = 0; s < stepsPerMatch; s++) {
          if (!engine.running || engine.victoryState) break;
          ZH_AI.updateTeam(engine, 0, dt);
          engine.update(dt);
          stepsRun++;
        }

        const matchDurationSec = Number((stepsRun * dt).toFixed(1));
        allMatchLengths.push(matchDurationSec);
        generalStats[g0].matchLengths.push(matchDurationSec);
        generalStats[g1].matchLengths.push(matchDurationSec);

        const score0 = computeTeamScore(engine, 0);
        const score1 = computeTeamScore(engine, 1);
        const ratio0 = score0 / Math.max(1, score0 + score1);

        // Determine actual un-clamped match outcome
        let outcome0 = 'DRAW';
        if (engine.victoryState === 'VICTORY') {
          outcome0 = 'WIN';
        } else if (engine.victoryState === 'DEFEAT') {
          outcome0 = 'LOSS';
        } else if (Math.abs(ratio0 - 0.5) >= 0.03) {
          outcome0 = score0 > score1 ? 'WIN' : 'LOSS';
        }

        // Record un-clamped score share in matrix
        matrix[g0][g1] = Number((ratio0 * 100).toFixed(1));

        const f0 = ZH_DATA.GENERALS[g0].faction;
        const f1 = ZH_DATA.GENERALS[g1].faction;

        if (outcome0 === 'WIN') {
          generalStats[g0].wins += 1;
          generalStats[g1].losses += 1;
          factionStats[f0].wins += 1;
          factionStats[f1].losses += 1;
        } else if (outcome0 === 'LOSS') {
          generalStats[g0].losses += 1;
          generalStats[g1].wins += 1;
          factionStats[f0].losses += 1;
          factionStats[f1].wins += 1;
        } else {
          generalStats[g0].draws += 1;
          generalStats[g1].draws += 1;
          factionStats[f0].draws += 1;
          factionStats[f1].draws += 1;
        }

        generalStats[g0].matches += 1;
        generalStats[g0].scoreRatioSum += ratio0;
        generalStats[g0].unitsTrained += engine.units.filter(u => u.team === 0).length;
        generalStats[g0].buildingsConstructed += engine.buildings.filter(b => b.team === 0).length;

        generalStats[g1].matches += 1;
        generalStats[g1].scoreRatioSum += (1 - ratio0);

        factionStats[f0].matches += 1;
        factionStats[f0].scoreSum += score0;

        factionStats[f1].matches += 1;
        factionStats[f1].scoreSum += score1;
      } catch (err) {
        runtimeErrors++;
        console.error(`Error in matchup ${g0} vs ${g1}:`, err);
      }
    }
  }

  const generalSummary = {};
  for (const gId of generalIds) {
    const st = generalStats[gId];
    const effectiveWins = st.wins + st.draws * 0.5;
    generalSummary[gId] = {
      name: st.name,
      faction: st.faction,
      wins: st.wins,
      losses: st.losses,
      draws: st.draws,
      matches: st.matches,
      winRatePct: Number(((effectiveWins / Math.max(1, st.matches)) * 100).toFixed(1)),
      rawScoreSharePct: Number(((st.scoreRatioSum / Math.max(1, st.matches)) * 100).toFixed(1)),
      medianMatchLengthSec: Number(computeMedian(st.matchLengths).toFixed(1)),
      avgUnitsOnField: Number((st.unitsTrained / Math.max(1, generalIds.length)).toFixed(1)),
      avgBuildingsOnField: Number((st.buildingsConstructed / Math.max(1, generalIds.length)).toFixed(1))
    };
  }

  const factionSummary = {};
  for (const [facId, fSt] of Object.entries(factionStats)) {
    const effectiveWins = fSt.wins + fSt.draws * 0.5;
    factionSummary[facId] = {
      wins: fSt.wins,
      losses: fSt.losses,
      draws: fSt.draws,
      matches: fSt.matches,
      winRatePct: Number(((effectiveWins / Math.max(1, fSt.matches)) * 100).toFixed(1))
    };
  }

  return {
    totalMatches,
    runtimeErrors,
    medianMatchLengthSec: Number(computeMedian(allMatchLengths).toFixed(1)),
    generalIds,
    matrix,
    generalSummary,
    factionSummary
  };
}

function runFullMatchVictoryCheck() {
  const { makeCanvas } = createHeadlessEnv();
  const engine = new ZH_ENGINE.GameEngine(makeCanvas(1280, 720), makeCanvas(200, 200));
  engine.initMatch({
    mode: 'SKIRMISH',
    playerGeneralId: 'CHINA_KWAI',
    aiGeneralId: 'GLA_JUHZIZ',
    mapId: 'TOURNAMENT_DESERT',
    difficulty: 'HARD',
    seed: 20261022
  });

  // Spawn an overwhelming Vanguard assault force at enemy base perimeter to verify full victory resolution
  const enemyCc = engine.buildings.find(b => b.team === 1);
  if (enemyCc) {
    for (let k = 0; k < 6; k++) {
      engine.spawnUnit('CHINA_EMPEROR_OVERLORD', 0, enemyCc.x - 160 + (k % 3) * 55, enemyCc.y - 120 + Math.floor(k / 3) * 55);
    }
  }

  const dt = 0.1;
  let steps = 0;
  const maxSteps = 1200;
  while (engine.running && !engine.victoryState && steps < maxSteps) {
    ZH_AI.updateTeam(engine, 0, dt);
    engine.update(dt);
    steps++;
  }

  return {
    completedToVictory: Boolean(engine.victoryState),
    victoryState: engine.victoryState,
    steps
  };
}

if (require.main === module) {
  console.log('======================================================================');
  console.log(' C&C: GENERALS ZERO HOUR — 9x9 SEEDED AI MATCH MATRIX & VICTORY CHECK');
  console.log('======================================================================');
  const report = runBalanceMatrix();
  const victoryCheck = runFullMatchVictoryCheck();
  console.log(`Total Matchups Simulated: ${report.totalMatches} (seeded AI-vs-AI matches, no artificial score clamping)`);
  console.log(`Median Match Length:      ${report.medianMatchLengthSec}s`);
  console.log(`Runtime Exceptions:       ${report.runtimeErrors}`);
  console.log(`Full-Match Victory Check: ${victoryCheck.completedToVictory ? 'PASS' : 'FAIL'} (state=${victoryCheck.victoryState}, steps=${victoryCheck.steps})`);
  console.log('\n--- FACTION OUTCOME SUMMARY (W / L / D) ---');
  for (const [fac, st] of Object.entries(report.factionSummary)) {
    console.log(`  ${fac.padEnd(8)} : ${st.winRatePct.toFixed(1)}% (${st.wins}W-${st.losses}L-${st.draws}D across ${st.matches} matches)`);
  }
  console.log('\n--- SUB-GENERAL TELEMETRY (UN-CLAMPED) ---');
  for (const [gId, st] of Object.entries(report.generalSummary)) {
    console.log(
      `  ${gId.padEnd(16)} (${st.name.padEnd(18)}): ${String(st.wins).padStart(2)}W-${String(st.losses).padStart(2)}L-${String(st.draws).padStart(2)}D (${st.winRatePct.toFixed(1)}%) | ScoreShare=${st.rawScoreSharePct.toFixed(1)}% | MedLen=${st.medianMatchLengthSec}s | AvgUnits=${st.avgUnitsOnField} | AvgBldgs=${st.avgBuildingsOnField}`
    );
  }
  if (report.runtimeErrors > 0 || !victoryCheck.completedToVictory) {
    process.exit(1);
  }
}

module.exports = { runBalanceMatrix, runFullMatchVictoryCheck };
