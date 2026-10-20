// ============================================================================
// Command & Conquer: Generals – Zero Hour (macOS Clean-Room Edition)
// js/ui.js — Overhauled Tactical HUD, 12-Slot Command Card, Camera & Settings
// ============================================================================

(function () {
  'use strict';

  let engine = null;
  let selectedMode = 'CHALLENGE'; // 'CHALLENGE' | 'SKIRMISH'
  let selectedPlayerGeneralId = 'USA_GRANGER';
  let selectedAiGeneralId = 'GLA_THRAX';
  let selectedMapId = 'TOURNAMENT_DESERT';
  let selectedDifficulty = 'NORMAL';
  let challengeStageIndex = 0;

  // Input & camera state
  const keys = {};
  let isDraggingBox = false;
  let isMiddlePanning = false;
  let middlePanLast = { x: 0, y: 0 };
  let dragStartScreen = { x: 0, y: 0 };
  let dragCurrentScreen = { x: 0, y: 0 };
  let pointerClient = { x: -1, y: -1, insideViewport: false };
  let lastClickTime = 0;
  let lastClickedDefId = null;

  // HUD live-update tier state
  let hudLiveAccum = 0;
  let lastCmdSignature = '';
  let lastPowerStripSignature = '';
  let lastCtrlGroupSignature = '';
  const topBarCache = {
    badge: '',
    credits: '',
    powerText: '',
    powerColor: '',
    rank: '',
    clock: '',
    powersBtn: '',
    powersGlow: false,
    tunnelDisplay: '',
    tunnelText: '',
    swHtml: ''
  };

  // Rolling tactical alert log
  const alertHistory = [];

  // Persisted user settings
  const SETTINGS_STORAGE_KEY = 'zh_settings_v1';
  const settings = {
    masterVol: 80,
    musicVol: 50,
    sfxVol: 80,
    voiceVol: 90,
    edgeScroll: false,
    healthBars: 'DAMAGED', // 'DAMAGED' | 'ALWAYS' | 'SELECTED'
    reducedMotion: false,
    uiScale: '1'
  };

  // Custom inline SVG tactical cursors
  const CURSOR_URIS = {
    DEFAULT: 'default',
    SELECT: 'pointer',
    MOVE: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><circle cx='12' cy='12' r='8' fill='none' stroke='%2322c55e' stroke-width='2'/><path d='M12 2v5M12 17v5M2 12h5M17 12h5' stroke='%2322c55e' stroke-width='2'/></svg>") 12 12, crosshair`,
    ATTACK: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><circle cx='12' cy='12' r='9' fill='none' stroke='%23ef4444' stroke-width='2'/><circle cx='12' cy='12' r='2' fill='%23ef4444'/><path d='M12 1v6M12 17v6M1 12h6M17 12h6' stroke='%23ef4444' stroke-width='2'/></svg>") 12 12, crosshair`,
    FORCE_FIRE: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><polygon points='12,2 22,12 12,22 2,12' fill='none' stroke='%23f97316' stroke-width='2'/><circle cx='12' cy='12' r='2.5' fill='%23f97316'/></svg>") 12 12, crosshair`,
    TARGET: 'crosshair',
    GARRISON: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><rect x='4' y='5' width='16' height='14' fill='none' stroke='%2338bdf8' stroke-width='2'/><path d='M12 17V9M9 12l3-3 3 3' fill='none' stroke='%2338bdf8' stroke-width='2'/></svg>") 12 12, pointer`,
    REPAIR: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><circle cx='12' cy='12' r='9' fill='none' stroke='%23fde047' stroke-width='2'/><path d='M12 7v10M7 12h10' stroke='%23fde047' stroke-width='2.5'/></svg>") 12 12, pointer`,
    HARVEST: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><rect x='4' y='4' width='16' height='16' rx='3' fill='none' stroke='%23eab308' stroke-width='2'/><circle cx='12' cy='12' r='3' fill='%23eab308'/></svg>") 12 12, pointer`,
    CAPTURE: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><path d='M6 3v18M6 4l12 4-12 4' fill='none' stroke='%2338bdf8' stroke-width='2'/></svg>") 12 12, pointer`
  };
  let lastCursorIntent = '';

  // ==========================================================================
  // Engine Lifecycle & Initialization
  // ==========================================================================
  function ensureEngine() {
    if (!engine) {
      const canvas = document.getElementById('game-canvas');
      const minimap = document.getElementById('minimap-canvas');
      engine = new ZH_ENGINE.GameEngine(canvas, minimap);
      engine.onAlert = showTacticalAlert;
      engine.onTaunt = showGeneralTaunt;
      engine.onStateChange = refreshCommandBar;
      engine.onGameOver = handleGameOver;
      resizeCanvases();
    }
    return engine;
  }

  function init() {
    loadSettings();
    ensureEngine();
    applySettingsToRuntime();

    const canvas = document.getElementById('game-canvas');
    const minimap = document.getElementById('minimap-canvas');

    resizeCanvases();
    window.addEventListener('resize', resizeCanvases);

    configureDevOnlyElements();
    setupStartScreen();
    setupHUDButtons();
    setupSettingsControls();
    setupCanvasInput(canvas, minimap);
    setupKeyboardInput();
    if (window.ZH_SIMULATOR && ZH_SIMULATOR.initHUD) {
      ZH_SIMULATOR.initHUD();
    }

    // Main 60Hz Fixed-Timestep Accumulator Loop (Phase 2 SYS-01)
    let lastTime = performance.now();
    function frame(now) {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      handleCameraPan(dt);
      if (engine && engine.running) {
        engine.stepFixed(dt);
        if (window.ZH_SIMULATOR && ZH_SIMULATOR.update) {
          ZH_SIMULATOR.update(dt * (engine.gameSpeed || 1));
        }
        engine.render();
        renderSelectionBox();

        hudLiveAccum += dt;
        if (hudLiveAccum >= 0.1) {
          hudLiveAccum = 0;
          updateHudLive();
        } else {
          updateTopBarAndTimers();
        }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function configureDevOnlyElements() {
    let isDev = false;
    try {
      if (typeof window !== 'undefined' && window.location && typeof window.location.search === 'string') {
        isDev = window.location.search.indexOf('dev=1') !== -1;
      }
    } catch (_) {
      isDev = false;
    }
    const autoSimBtn = document.getElementById('btn-auto-sim');
    if (autoSimBtn) {
      if (isDev) {
        autoSimBtn.classList.remove('hidden');
      } else {
        autoSimBtn.classList.add('hidden');
      }
    }
    const simPanel = document.getElementById('zh-sim-panel');
    if (simPanel && !isDev) {
      const body = document.getElementById('zh-sim-body');
      const collapseBtn = document.getElementById('zh-sim-collapse-btn');
      if (body && !body.classList.contains('hidden')) {
        body.classList.add('hidden');
        if (collapseBtn) collapseBtn.textContent = '▸';
      }
    }
  }

  function resizeCanvases() {
    const canvas = document.getElementById('game-canvas');
    const minimap = document.getElementById('minimap-canvas');
    if (!canvas) return;

    let topH = 36;
    let bottomH = 176;
    try {
      if (typeof getComputedStyle === 'function' && document.documentElement) {
        const rs = getComputedStyle(document.documentElement);
        const parsedTop = parseInt(rs.getPropertyValue('--hud-top-h'), 10);
        const parsedBottom = parseInt(rs.getPropertyValue('--hud-bottom-h'), 10);
        if (!isNaN(parsedTop) && parsedTop > 0) topH = parsedTop;
        if (!isNaN(parsedBottom) && parsedBottom > 0) bottomH = parsedBottom;
      }
    } catch (_) {
      // Fallback to defaults in headless test runner
    }

    const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
    const viewW = (typeof window !== 'undefined' && window.innerWidth) || 1280;
    const rawH = (typeof window !== 'undefined' && window.innerHeight) || 800;
    const viewH = Math.max(360, rawH - topH - bottomH);

    if (canvas.style) {
      canvas.style.width = `${viewW}px`;
      canvas.style.height = `${viewH}px`;
    }
    canvas.width = Math.round(viewW * dpr);
    canvas.height = Math.round(viewH * dpr);

    if (engine) {
      engine.pixelRatio = dpr;
      engine.viewW = viewW;
      engine.viewH = viewH;
      const z = (engine.cam && engine.cam.zoom) || 1;
      engine.cam.w = viewW / z;
      engine.cam.h = viewH / z;
    }

    if (minimap) {
      const miniCss = 164;
      if (minimap.style) {
        minimap.style.width = `${miniCss}px`;
        minimap.style.height = `${miniCss}px`;
      }
      minimap.width = Math.round(miniCss * dpr);
      minimap.height = Math.round(miniCss * dpr);
    }
  }

  // ==========================================================================
  // Settings Persistence & Controls
  // ==========================================================================
  function loadSettings() {
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem) {
        const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            Object.assign(settings, parsed);
          }
        }
      }
    } catch (_) {
      // Ignore storage errors in sandboxed/headless environments
    }
  }

  function saveSettings() {
    try {
      if (typeof localStorage !== 'undefined' && localStorage.setItem) {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
      }
    } catch (_) {
      // Ignore storage errors
    }
  }

  function applySettingsToRuntime() {
    if (window.ZH_AUDIO && ZH_AUDIO.setVolume) {
      ZH_AUDIO.setVolume('master', (settings.masterVol ?? 80) / 100);
      ZH_AUDIO.setVolume('music', (settings.musicVol ?? 50) / 100);
      ZH_AUDIO.setVolume('sfx', (settings.sfxVol ?? 80) / 100);
      ZH_AUDIO.setVolume('voice', (settings.voiceVol ?? 90) / 100);
    }
    if (engine) {
      engine.showAllHealthBars = settings.healthBars === 'ALWAYS';
    }
    if (document.body && document.body.classList) {
      document.body.classList.toggle('reduced-motion', Boolean(settings.reducedMotion));
    }
    try {
      if (document.documentElement && document.documentElement.style && document.documentElement.style.setProperty) {
        document.documentElement.style.setProperty('--ui-scale', String(settings.uiScale || '1'));
      }
    } catch (_) {}
  }

  function setupSettingsControls() {
    const bindSlider = (id, key, bus) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = String(settings[key]);
      const handler = (e) => {
        const val = Math.max(0, Math.min(100, Number(e.target.value) || 0));
        settings[key] = val;
        if (window.ZH_AUDIO && ZH_AUDIO.setVolume) {
          ZH_AUDIO.setVolume(bus, val / 100);
        }
        saveSettings();
      };
      el.addEventListener('input', handler);
      el.addEventListener('change', handler);
    };

    bindSlider('vol-master', 'masterVol', 'master');
    bindSlider('vol-music', 'musicVol', 'music');
    bindSlider('vol-sfx', 'sfxVol', 'sfx');
    bindSlider('vol-voice', 'voiceVol', 'voice');

    const edgeEl = document.getElementById('opt-edge-scroll');
    if (edgeEl) {
      edgeEl.checked = Boolean(settings.edgeScroll);
      edgeEl.addEventListener('change', (e) => {
        settings.edgeScroll = Boolean(e.target.checked);
        saveSettings();
      });
    }

    const hbEl = document.getElementById('opt-health-bars');
    if (hbEl) {
      hbEl.value = settings.healthBars || 'DAMAGED';
      hbEl.addEventListener('change', (e) => {
        settings.healthBars = e.target.value || 'DAMAGED';
        if (engine) {
          engine.showAllHealthBars = settings.healthBars === 'ALWAYS';
        }
        saveSettings();
      });
    }

    const rmEl = document.getElementById('opt-reduced-motion');
    if (rmEl) {
      rmEl.checked = Boolean(settings.reducedMotion);
      rmEl.addEventListener('change', (e) => {
        settings.reducedMotion = Boolean(e.target.checked);
        if (document.body && document.body.classList) {
          document.body.classList.toggle('reduced-motion', settings.reducedMotion);
        }
        saveSettings();
      });
    }

    const scaleEl = document.getElementById('opt-ui-scale');
    if (scaleEl) {
      scaleEl.value = String(settings.uiScale || '1');
      scaleEl.addEventListener('change', (e) => {
        settings.uiScale = e.target.value || '1';
        applySettingsToRuntime();
        saveSettings();
      });
    }
  }

  // ==========================================================================
  // Start Screen & Generals Selection (Generals' Challenge + Skirmish)
  // ==========================================================================
  function setupStartScreen() {
    const modeBtns = document.querySelectorAll('.mode-tab-btn');
    modeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        modeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedMode = btn.dataset.mode;
        document.getElementById('ai-general-picker-wrap').style.display =
          selectedMode === 'SKIRMISH' ? 'block' : 'none';
        document.getElementById('challenge-ladder-preview').style.display =
          selectedMode === 'CHALLENGE' ? 'flex' : 'none';
        if (selectedMode === 'CHALLENGE') {
          renderChallengeLadder();
        }
        updateStartMatchupSummary();
        ZH_AUDIO.playSFX('click');
      });
    });

    renderGeneralCards('player-general-grid', true);
    renderGeneralCards('ai-general-grid', false);
    renderChallengeLadder();
    renderMapAndDiffSelectors();
    renderMapPreview();
    updateStartMatchupSummary();

    document.getElementById('btn-launch-operation').addEventListener('click', () => {
      ZH_AUDIO.playSFX('promote');
      startNewMatch();
    });

    const loadSaveMenuBtn = document.getElementById('btn-import-save-menu');
    const fileInput = document.getElementById('zhsave-file-input');
    if (loadSaveMenuBtn && fileInput) {
      loadSaveMenuBtn.addEventListener('click', () => fileInput.click());
    }
  }

  function renderGeneralCards(containerId, isPlayer) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    Object.values(ZH_DATA.GENERALS).forEach(gen => {
      const fac = ZH_DATA.FACTIONS[gen.faction];
      const card = document.createElement('div');
      const isSelected = isPlayer
        ? gen.id === selectedPlayerGeneralId
        : gen.id === selectedAiGeneralId;

      card.className = `general-card ${isSelected ? 'selected' : ''}`;
      card.style.borderColor = isSelected ? fac.color : 'rgba(148,163,184,0.22)';
      card.innerHTML = `
        <div class="gen-card-header" style="background: linear-gradient(90deg, ${fac.darkColor}88, transparent)">
          <span class="gen-badge">${gen.badge}</span>
          <div>
            <div class="gen-name">${gen.name}</div>
            <div class="gen-title" style="color:${fac.accent}">${fac.shortName} • ${gen.title}</div>
          </div>
        </div>
        <div class="gen-specialty">${gen.specialty}</div>
        <ul class="gen-perks">
          ${gen.perks.map(p => `<li>${p}</li>`).join('')}
        </ul>
      `;

      card.addEventListener('click', () => {
        if (isPlayer) {
          selectedPlayerGeneralId = gen.id;
          renderGeneralCards('player-general-grid', true);
          renderChallengeLadder();
        } else {
          selectedAiGeneralId = gen.id;
          renderGeneralCards('ai-general-grid', false);
        }
        updateStartMatchupSummary();
        ZH_AUDIO.playSFX('click');
      });

      container.appendChild(card);
    });
  }

  function renderChallengeLadder() {
    const wrap = document.getElementById('challenge-ladder-preview');
    if (!wrap) return;
    const ladder = ZH_DATA.CHALLENGE_LADDER.filter(id => id !== selectedPlayerGeneralId);
    const currentOpponentId = ladder[challengeStageIndex % ladder.length];
    if (selectedMode === 'CHALLENGE') {
      selectedAiGeneralId = currentOpponentId;
    }

    wrap.innerHTML = ladder.map((gId, idx) => {
      const g = ZH_DATA.GENERALS[gId];
      const stateClass = idx < challengeStageIndex ? 'defeated'
        : idx === challengeStageIndex ? 'current'
        : 'locked';
      return `
        <div class="ladder-step ${stateClass}">
          <span class="step-num">#${idx + 1}</span>
          <span class="step-icon">${g.badge}</span>
          <span class="step-name">${g.name}</span>
        </div>
      `;
    }).join('');
  }

  function renderMapAndDiffSelectors() {
    const mapSel = document.getElementById('map-selector');
    if (mapSel) {
      mapSel.innerHTML = ZH_DATA.MAPS.map(m =>
        `<option value="${m.id}">${m.name} — ${m.subtitle}</option>`
      ).join('');
      mapSel.addEventListener('change', (e) => {
        selectedMapId = e.target.value;
        renderMapPreview();
        updateStartMatchupSummary();
      });
    }

    const diffBtns = document.querySelectorAll('.diff-btn');
    diffBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        diffBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedDifficulty = btn.dataset.diff;
        updateStartMatchupSummary();
        ZH_AUDIO.playSFX('click');
      });
    });
  }

  function renderMapPreview() {
    const mapDef = ZH_DATA.MAPS.find(m => m.id === selectedMapId) || ZH_DATA.MAPS[0];
    if (!mapDef) return;

    const metaEl = document.getElementById('map-preview-meta');
    if (metaEl) {
      metaEl.textContent = `${mapDef.name} • ${mapDef.subtitle || '2-Player Tactical Theater'}`;
    }

    const previewCanvas = document.getElementById('map-preview-canvas');
    if (!previewCanvas || !previewCanvas.getContext) return;
    const ctx = previewCanvas.getContext('2d');
    if (!ctx) return;

    const w = previewCanvas.width || 110;
    const h = previewCanvas.height || 110;
    ctx.fillStyle = mapDef.groundColor || '#c2a675';
    ctx.fillRect(0, 0, w, h);

    // Subtle tactical grid
    ctx.strokeStyle = mapDef.gridColor || 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let x = 22; x < w; x += 22) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 22; y < h; y += 22) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Center ridge / river accent
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(12, h - 12);
    ctx.lineTo(w - 12, 12);
    ctx.stroke();

    // Supply dock markers (gold squares)
    ctx.fillStyle = '#eab308';
    ctx.fillRect(24, 24, 7, 7);
    ctx.fillRect(w - 31, h - 31, 7, 7);
    ctx.fillRect(w / 2 - 4, h / 2 - 4, 8, 8);

    // Spawn markers (Player bottom-left blue, Enemy top-right red)
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(20, h - 20, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(w - 20, 20, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  function updateStartMatchupSummary() {
    const summaryEl = document.getElementById('start-matchup-summary');
    if (!summaryEl) return;
    const pGen = ZH_DATA.GENERALS[selectedPlayerGeneralId] || Object.values(ZH_DATA.GENERALS)[0];
    const aiGen = ZH_DATA.GENERALS[selectedAiGeneralId] || Object.values(ZH_DATA.GENERALS)[1];
    const mapDef = ZH_DATA.MAPS.find(m => m.id === selectedMapId) || ZH_DATA.MAPS[0];
    if (!pGen || !aiGen || !mapDef) return;
    summaryEl.textContent =
      `${pGen.badge} ${pGen.name} vs ${aiGen.badge} ${aiGen.name} • ${mapDef.name} (${selectedDifficulty})`;
  }

  function startNewMatch() {
    ensureEngine();
    resizeCanvases();

    if (selectedMode === 'CHALLENGE') {
      const ladder = ZH_DATA.CHALLENGE_LADDER.filter(id => id !== selectedPlayerGeneralId);
      selectedAiGeneralId = ladder[challengeStageIndex % ladder.length];
    }

    document.getElementById('start-modal').classList.add('hidden');
    document.getElementById('victory-modal').classList.add('hidden');
    const gameMenu = document.getElementById('game-menu-modal');
    if (gameMenu) gameMenu.classList.add('hidden');

    engine.initMatch({
      mode: selectedMode,
      challengeIndex: challengeStageIndex,
      playerGeneralId: selectedPlayerGeneralId,
      aiGeneralId: selectedAiGeneralId,
      mapId: selectedMapId,
      difficulty: selectedDifficulty
    });

    applySettingsToRuntime();

    const speedBtn = document.getElementById('btn-speed');
    if (speedBtn) speedBtn.textContent = `${(engine.gameSpeed || 1).toFixed(1)}x`;

    if (window.ZH_SIMULATOR && ZH_SIMULATOR.attachEngine) {
      ZH_SIMULATOR.attachEngine(engine, window.ZH_AI);
    }

    // Phase 3 SYS-20: Apply authentic faction-skinned HUD theme
    document.body.classList.remove('hud-theme-usa', 'hud-theme-china', 'hud-theme-gla');
    if (engine.teams[0] && engine.teams[0].factionId) {
      document.body.classList.add(`hud-theme-${engine.teams[0].factionId.toLowerCase()}`);
    }

    alertHistory.length = 0;
    renderAlertLog();
    lastCmdSignature = '';
    lastPowerStripSignature = '';
    lastCtrlGroupSignature = '';
    refreshCommandBar();
    updateTopBarAndTimers();
  }

  // ==========================================================================
  // HUD Buttons, Game Menu Modal & Generals Powers Modal
  // ==========================================================================
  function setupHUDButtons() {
    document.getElementById('btn-generals-powers').addEventListener('click', () => {
      toggleGeneralsPowersModal();
    });

    document.getElementById('btn-close-powers').addEventListener('click', () => {
      document.getElementById('powers-modal').classList.add('hidden');
    });

    const gameMenuBtn = document.getElementById('btn-game-menu');
    const gameMenuModal = document.getElementById('game-menu-modal');
    const closeGameMenuBtn = document.getElementById('btn-close-game-menu');
    if (gameMenuBtn && gameMenuModal) {
      gameMenuBtn.addEventListener('click', () => {
        const isHidden = gameMenuModal.classList.contains('hidden');
        if (isHidden) {
          gameMenuModal.classList.remove('hidden');
        } else {
          gameMenuModal.classList.add('hidden');
        }
        ZH_AUDIO.playSFX('click');
      });
    }
    if (closeGameMenuBtn && gameMenuModal) {
      closeGameMenuBtn.addEventListener('click', () => {
        gameMenuModal.classList.add('hidden');
        ZH_AUDIO.playSFX('click');
      });
    }

    const speedBtn = document.getElementById('btn-speed');
    if (speedBtn) {
      speedBtn.addEventListener('click', () => {
        if (!engine) return;
        const speeds = [1.0, 1.5, 2.0];
        const cur = engine.gameSpeed || 1.0;
        const nextIdx = (speeds.findIndex(s => Math.abs(s - cur) < 0.05) + 1) % speeds.length;
        engine.gameSpeed = speeds[nextIdx];
        speedBtn.textContent = `${engine.gameSpeed.toFixed(1)}x`;
        ZH_AUDIO.playSFX('click');
      });
    }

    document.getElementById('btn-select-builder').addEventListener('click', () => {
      if (!engine || !engine.running) return;
      const builders = engine.units.filter(u => u.team === 0 && u.def.isBuilder && u.hp > 0);
      if (builders.length > 0) {
        const b = builders[0];
        engine.selectedIds.clear();
        engine.selectedIds.add(b.id);
        centerCameraOn(b.x, b.y);
        refreshCommandBar();
        ZH_AUDIO.playSFX('click');
      } else {
        showTacticalAlert('No active Dozer or Worker! Train one at your Command Center.', '#ef4444');
      }
    });

    document.getElementById('btn-select-combat').addEventListener('click', () => {
      if (!engine || !engine.running) return;
      const combat = engine.units.filter(
        u => u.team === 0 && !u.def.isBuilder && !u.def.isHarvester && u.hp > 0 && !(u.garrisonedIn || u.garrisonId)
      );
      if (combat.length > 0) {
        engine.selectedIds.clear();
        combat.forEach(u => engine.selectedIds.add(u.id));
        refreshCommandBar();
        ZH_AUDIO.playSFX('click');
      }
    });

    const musicBtn = document.getElementById('btn-toggle-music');
    if (musicBtn) {
      musicBtn.addEventListener('click', (e) => {
        const on = ZH_AUDIO.toggleMusic();
        e.currentTarget.textContent = on ? '🎵 Music: ON' : '🔇 Music: OFF';
      });
    }

    document.getElementById('btn-toggle-sfx').addEventListener('click', (e) => {
      const on = ZH_AUDIO.toggleSFX();
      e.currentTarget.textContent = on ? '🔊 SFX: ON' : '🔇 SFX: OFF';
    });

    document.getElementById('btn-toggle-voice').addEventListener('click', (e) => {
      const on = ZH_AUDIO.toggleVoice();
      e.currentTarget.textContent = on ? '🎙️ EVA: ON' : '🔕 EVA: OFF';
    });

    document.getElementById('btn-pause-game').addEventListener('click', (e) => {
      if (!engine) return;
      engine.paused = !engine.paused;
      e.currentTarget.textContent = engine.paused ? '▶ RESUME' : '⏸ PAUSE';
    });

    // Phase 4 SYS-25: Deterministic Skirmish Save/Load & .zhsave Export/Import
    const saveBtn = document.getElementById('btn-quick-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => quickSave());
    }
    const loadBtn = document.getElementById('btn-quick-load');
    if (loadBtn) {
      loadBtn.addEventListener('click', () => quickLoad());
    }
    const exportBtn = document.getElementById('btn-export-save');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => exportSaveFile());
    }
    const importBtn = document.getElementById('btn-import-save');
    const fileInput = document.getElementById('zhsave-file-input');
    if (importBtn && fileInput) {
      importBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          importSaveFile(ev.target.result);
          fileInput.value = '';
        };
        reader.readAsText(file);
      });
    }

    document.getElementById('btn-main-menu').addEventListener('click', () => {
      if (engine) engine.running = false;
      ZH_AUDIO.stopMusic();
      if (gameMenuModal) gameMenuModal.classList.add('hidden');
      document.getElementById('victory-modal').classList.add('hidden');
      document.getElementById('start-modal').classList.remove('hidden');
    });

    const victoryMenuBtn = document.getElementById('btn-victory-main-menu');
    if (victoryMenuBtn) {
      victoryMenuBtn.addEventListener('click', () => {
        if (engine) engine.running = false;
        ZH_AUDIO.stopMusic();
        document.getElementById('victory-modal').classList.add('hidden');
        document.getElementById('start-modal').classList.remove('hidden');
      });
    }

    const rematchBtn = document.getElementById('btn-rematch');
    if (rematchBtn) {
      rematchBtn.addEventListener('click', () => {
        startNewMatch();
      });
    }

    // Phase 3 SYS-19: Stance & Tactical Order Bar (Attack-Move, Guard, Stop, Scatter)
    document.getElementById('btn-order-attack-move').addEventListener('click', () => {
      if (!engine || engine.selectedIds.size === 0) return;
      engine.commandMode = 'ATTACK_MOVE';
      refreshCommandBar();
      showTacticalAlert('ATTACK-MOVE [A]: Left-click or Right-click destination to assault along path.', '#fde047');
    });

    const guardBtn = document.getElementById('btn-order-guard');
    if (guardBtn) {
      guardBtn.addEventListener('click', () => {
        if (!engine || engine.selectedIds.size === 0) return;
        engine.orderGuardSelected();
      });
    }

    document.getElementById('btn-order-stop').addEventListener('click', () => {
      if (!engine) return;
      issueStopToSelected();
    });

    document.getElementById('btn-order-scatter').addEventListener('click', () => {
      if (!engine) return;
      engine.orderScatterSelected();
    });
  }

  function applyLoadedHudTheme() {
    document.body.classList.remove('hud-theme-usa', 'hud-theme-china', 'hud-theme-gla');
    if (engine && engine.teams[0] && engine.teams[0].factionId) {
      document.body.classList.add(`hud-theme-${engine.teams[0].factionId.toLowerCase()}`);
    }
    document.getElementById('start-modal').classList.add('hidden');
    document.getElementById('victory-modal').classList.add('hidden');
    const gameMenu = document.getElementById('game-menu-modal');
    if (gameMenu) gameMenu.classList.add('hidden');
    lastCmdSignature = '';
    lastPowerStripSignature = '';
    lastCtrlGroupSignature = '';
    refreshCommandBar();
    updateTopBarAndTimers();
  }

  function quickSave(slotName = 'quicksave') {
    if (!engine || !engine.running) return false;
    const ok = engine.saveToSlot(slotName);
    if (ok) ZH_AUDIO.playSFX('click');
    return ok;
  }

  function quickLoad(slotName = 'quicksave') {
    ensureEngine();
    const ok = engine.loadFromSlot(slotName);
    if (ok) {
      applyLoadedHudTheme();
      ZH_AUDIO.playSFX('promote');
    }
    return ok;
  }

  function exportSaveFile() {
    if (!engine || !engine.running) return null;
    const json = engine.exportSaveJSON();
    if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && URL.createObjectURL) {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const genId = (engine.teams[0] && engine.teams[0].generalId) || 'match';
      a.href = url;
      a.download = `zh_${genId.toLowerCase()}_${Math.floor(engine.matchTime || 0)}s.zhsave`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
    showTacticalAlert('EXPEDITED .ZHSAVE SNAPSHOT EXPORTED!', '#22c55e');
    ZH_AUDIO.playSFX('click');
    return json;
  }

  function importSaveFile(jsonStr) {
    ensureEngine();
    const ok = engine.importSaveJSON(jsonStr);
    if (ok) {
      applyLoadedHudTheme();
      ZH_AUDIO.playSFX('promote');
    }
    return ok;
  }

  function toggleGeneralsPowersModal() {
    const modal = document.getElementById('powers-modal');
    const isHidden = modal.classList.contains('hidden');
    if (isHidden) {
      renderGeneralsPowersModal();
      modal.classList.remove('hidden');
      ZH_AUDIO.playSFX('click');
    } else {
      modal.classList.add('hidden');
    }
  }

  function renderGeneralsPowersModal() {
    if (!engine || !engine.teams[0]) return;
    const team = engine.teams[0];
    const rawPowers = ZH_DATA.GENERALS_POWERS[team.factionId] || [];
    const powers = [...rawPowers].sort((a, b) => (a.rankReq || 1) - (b.rankReq || 1));
    const rankObj = ZH_DATA.GENERAL_RANKS[team.rank - 1] || ZH_DATA.GENERAL_RANKS[0];

    document.getElementById('powers-modal-subtitle').textContent =
      `${team.general.name} • ${rankObj.title} • Available Generals Points: ${team.generalPoints}`;

    const list = document.getElementById('powers-grid');
    list.innerHTML = '';

    powers.forEach(p => {
      const unlocked = team.unlockedPowers.has(p.id);
      const cd = Math.ceil(team.powerCooldowns[p.id] || 0);
      const canUnlock = !unlocked && team.rank >= p.rankReq && team.generalPoints >= p.costPoints;

      const card = document.createElement('div');
      card.className = `power-card ${unlocked ? 'unlocked' : ''}`;
      card.innerHTML = `
        <div class="power-icon">${p.icon}</div>
        <div class="power-info">
          <div class="power-title">${p.name} <span class="rank-badge">Rank ${p.rankReq}</span></div>
          <div class="power-desc">${p.desc}</div>
        </div>
        <div class="power-action"></div>
      `;

      const actionWrap = card.querySelector('.power-action');
      const btn = document.createElement('button');
      if (unlocked) {
        if (cd > 0) {
          btn.className = 'power-btn cooldown';
          btn.textContent = `RECHARGING (${cd}s)`;
          btn.disabled = true;
        } else {
          btn.className = 'power-btn ready';
          btn.textContent = 'DEPLOY POWER';
          btn.addEventListener('click', () => {
            document.getElementById('powers-modal').classList.add('hidden');
            engine.commandMode = 'POWER';
            engine.pendingPowerId = p.id;
            showTacticalAlert(`TARGETING ${p.name.toUpperCase()} — Click on the battlefield!`, '#38bdf8');
          });
        }
      } else {
        btn.className = `power-btn ${canUnlock ? 'unlockable' : 'locked'}`;
        btn.textContent = canUnlock ? `UNLOCK (${p.costPoints} PT)` : `REQUIRES RANK ${p.rankReq}`;
        btn.disabled = !canUnlock;
        if (canUnlock) {
          btn.addEventListener('click', () => {
            engine.unlockGeneralsPower(0, p.id);
            renderGeneralsPowersModal();
            updatePowerStrip(true);
          });
        }
      }

      actionWrap.appendChild(btn);
      list.appendChild(card);
    });
  }

  // ==========================================================================
  // Quick-Cast Power Strip & Control Group Bar
  // ==========================================================================
  function updatePowerStrip(force = false) {
    if (!engine || !engine.teams[0]) return;
    const strip = document.getElementById('power-strip');
    if (!strip) return;
    const team = engine.teams[0];
    const powers = ZH_DATA.GENERALS_POWERS[team.factionId] || [];
    const unlockedList = powers.filter(p => team.unlockedPowers.has(p.id));

    const sig = unlockedList.map(p => `${p.id}:${Math.ceil(team.powerCooldowns[p.id] || 0)}`).join('|');
    if (!force && sig === lastPowerStripSignature) return;
    lastPowerStripSignature = sig;

    strip.innerHTML = '';
    unlockedList.forEach(p => {
      const cd = Math.ceil(team.powerCooldowns[p.id] || 0);
      const btn = document.createElement('button');
      btn.className = `power-strip-btn ${cd > 0 ? 'cooldown' : 'ready'}`;
      btn.title = `${p.name} — ${p.desc}`;
      btn.dataset.powerId = p.id;
      btn.innerHTML = `
        <span class="power-icon">${p.icon || '⚡'}</span>
        <span class="power-cd">${cd > 0 ? cd + 's' : 'RDY'}</span>
      `;
      if (cd <= 0) {
        btn.addEventListener('click', () => {
          engine.commandMode = 'POWER';
          engine.pendingPowerId = p.id;
          showTacticalAlert(`TARGETING ${p.name.toUpperCase()} — Click on the battlefield!`, '#38bdf8');
        });
      }
      strip.appendChild(btn);
    });
  }

  function updateControlGroupBar(force = false) {
    if (!engine || !engine.controlGroups) return;
    const bar = document.getElementById('control-group-bar');
    if (!bar) return;

    const groups = [];
    for (let g = 1; g <= 9; g++) {
      const set = engine.controlGroups[g];
      if (!set || set.size === 0) continue;
      const aliveIds = [];
      set.forEach(id => {
        const u = engine.units.find(x => x.id === id && x.hp > 0);
        const b = engine.buildings.find(x => x.id === id && x.hp > 0);
        if (u || b) aliveIds.push(id);
      });
      if (aliveIds.length > 0) {
        const isActive = aliveIds.every(id => engine.selectedIds.has(id)) && engine.selectedIds.size === aliveIds.length;
        groups.push({ key: String(g), count: aliveIds.length, active: isActive });
      }
    }

    const sig = groups.map(g => `${g.key}:${g.count}:${g.active ? 1 : 0}`).join('|');
    if (!force && sig === lastCtrlGroupSignature) return;
    lastCtrlGroupSignature = sig;

    bar.innerHTML = '';
    groups.forEach(g => {
      const pill = document.createElement('button');
      pill.className = `ctrl-group-pill ${g.active ? 'active' : ''}`;
      pill.dataset.group = g.key;
      pill.title = `Control Group #${g.key} (${g.count} units/buildings) — Click to select, Double-click to center`;
      pill.innerHTML = `<span class="grp-num">[${g.key}]</span><span class="grp-cnt">${g.count}</span>`;
      pill.addEventListener('click', () => {
        const now = performance.now();
        const isDoubleTap = (lastGroupTapKey === g.key && now - lastGroupTapTime < 340);
        lastGroupTapKey = g.key;
        lastGroupTapTime = now;
        engine.selectControlGroup(g.key, isDoubleTap);
        refreshCommandBar();
      });
      bar.appendChild(pill);
    });
  }

  // ==========================================================================
  // Top Bar, Superweapon Timers, 10Hz Live HUD & Command Card Rendering
  // ==========================================================================
  function updateTopBarAndTimers() {
    if (!engine) return;
    const pTeam = engine.teams[0];
    const aiTeam = engine.teams[1];
    if (!pTeam || !aiTeam) return;

    const badgeText = `${pTeam.general.badge} ${pTeam.general.name}`;
    if (badgeText !== topBarCache.badge) {
      topBarCache.badge = badgeText;
      document.getElementById('hud-faction-badge').textContent = badgeText;
    }

    const creditsText = `$${Math.floor(pTeam.credits).toLocaleString()}`;
    if (creditsText !== topBarCache.credits) {
      topBarCache.credits = creditsText;
      document.getElementById('hud-credits').textContent = creditsText;
    }

    const pwrEl = document.getElementById('hud-power');
    let pwrText = '';
    let pwrColor = '';
    if (!pTeam.faction.usesPower) {
      pwrText = '⚡ GLA: NO POWER NEEDED';
      pwrColor = '#eab308';
    } else {
      pwrText = `⚡ ${pTeam.powerConsumed} / ${pTeam.powerProduced}`;
      pwrColor = pTeam.isLowPower ? '#ef4444' : '#22c55e';
    }
    if (pwrText !== topBarCache.powerText || pwrColor !== topBarCache.powerColor) {
      topBarCache.powerText = pwrText;
      topBarCache.powerColor = pwrColor;
      pwrEl.textContent = pwrText;
      pwrEl.style.color = pwrColor;
    }

    const rankObj = ZH_DATA.GENERAL_RANKS[pTeam.rank - 1];
    const nextRankObj = ZH_DATA.GENERAL_RANKS[pTeam.rank];
    const xpText = nextRankObj ? `${pTeam.xp}/${nextRankObj.xpReq} XP` : 'MAX RANK';
    const rankStr = `★ Rank ${pTeam.rank} (${xpText})`;
    if (rankStr !== topBarCache.rank) {
      topBarCache.rank = rankStr;
      document.getElementById('hud-rank').textContent = rankStr;
    }

    const clockEl = document.getElementById('hud-match-clock');
    if (clockEl) {
      const totalSec = Math.floor(engine.matchTime || 0);
      const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
      const ss = String(totalSec % 60).padStart(2, '0');
      const clockStr = `${mm}:${ss}`;
      if (clockStr !== topBarCache.clock) {
        topBarCache.clock = clockStr;
        clockEl.textContent = clockStr;
      }
    }

    const pBtn = document.getElementById('btn-generals-powers');
    const pBtnText = `⚡ Generals Powers [P] (${pTeam.generalPoints} Pt)`;
    if (pBtnText !== topBarCache.powersBtn) {
      topBarCache.powersBtn = pBtnText;
      pBtn.textContent = pBtnText;
    }
    const shouldGlow = pTeam.generalPoints > 0;
    if (shouldGlow !== topBarCache.powersGlow) {
      topBarCache.powersGlow = shouldGlow;
      if (shouldGlow) {
        pBtn.classList.add('pulse-glow');
      } else {
        pBtn.classList.remove('pulse-glow');
      }
    }

    // GLA Tunnel Network HUD indicator
    const tunnelHud = document.getElementById('hud-tunnel-status');
    const tunnelDisplay = pTeam.factionId === 'GLA' ? 'inline-flex' : 'none';
    const tunnelText = pTeam.factionId === 'GLA' ? `🕳️ Tunnel Garrison: ${pTeam.tunnelUnits.length}/10` : '';
    if (tunnelDisplay !== topBarCache.tunnelDisplay || tunnelText !== topBarCache.tunnelText) {
      topBarCache.tunnelDisplay = tunnelDisplay;
      topBarCache.tunnelText = tunnelText;
      tunnelHud.style.display = tunnelDisplay;
      if (tunnelText) tunnelHud.textContent = tunnelText;
    }

    // Active Superweapon Countdown Timers & Ready Powers
    const swPanel = document.getElementById('superweapon-timers');
    const swHtml = [];
    for (const b of engine.buildings) {
      if (!b.constructed || !b.def.isSuperweapon || b.hp <= 0) continue;
      const isFriendly = b.team === 0;
      const mins = Math.floor(b.superweaponTimer / 60);
      const secs = Math.floor(b.superweaponTimer % 60).toString().padStart(2, '0');
      const status = b.superweaponReady ? 'READY TO LAUNCH!' : `${mins}:${secs}`;
      const col = isFriendly ? '#38bdf8' : '#ef4444';
      swHtml.push(`
        <div class="sw-timer-row" style="border-left: 4px solid ${col}">
          <span>${isFriendly ? 'ALLY' : 'ENEMY'} ${b.def.name}:</span>
          <strong>${status}</strong>
        </div>
      `);
    }
    const joinedSw = swHtml.join('');
    if (joinedSw !== topBarCache.swHtml) {
      topBarCache.swHtml = joinedSw;
      swPanel.innerHTML = joinedSw;
    }
  }

  function computeCommandSignature() {
    if (!engine || !engine.running) return 'stopped';
    const pTeam = engine.teams[0];
    if (!pTeam) return 'noteam';
    const sel = [...engine.selectedIds].sort((a, b) => a - b).join(',');
    const upg = [...pTeam.upgrades].sort().join(',');
    const unlockedBuildings = engine.buildings
      .filter(b => b.team === 0 && b.constructed && b.hp > 0)
      .map(b => b.defId)
      .sort()
      .join(',');
    const selUnits = engine.units.filter(u => engine.selectedIds.has(u.id));
    const selBuildings = engine.buildings.filter(b => engine.selectedIds.has(b.id));
    const selBunkers = (engine.garrisonBunkers || []).filter(g => engine.selectedIds.has(g.id));
    let extra = `mode:${engine.commandMode || ''}`;
    if (selUnits.length === 1) {
      const u = selUnits[0];
      extra += `|u:${u.overlordAddon || ''}:${u.hasGatlingCannon ? 1 : 0}:${u.hasSpeakerTower ? 1 : 0}:${Math.ceil(u.abilityCooldown || 0) > 0 ? 1 : 0}`;
    }
    if (selBuildings.length > 0) {
      const b = selBuildings[0];
      const qSig = b.queue.map(q => q.id).join(',');
      extra += `|b:${b.constructed ? 1 : 0}:${b.overcharged ? 1 : 0}:${b.superweaponReady ? 1 : 0}:${qSig}:${pTeam.tunnelUnits.length}`;
    }
    if (selBunkers.length > 0) {
      extra += `|g:${selBunkers[0].occupants.length}`;
    }
    return `${sel}#${upg}#${unlockedBuildings}#${pTeam.rank}#${extra}`;
  }

  function updateHudLive() {
    if (!engine || !engine.running) return;
    updateTopBarAndTimers();
    updatePowerStrip(false);
    updateControlGroupBar(false);

    // Check if structural state changed (e.g. building finished constructing, queue completed, etc.)
    const sig = computeCommandSignature();
    if (lastCmdSignature && sig !== lastCmdSignature) {
      refreshCommandBar();
      return;
    }

    const pTeam = engine.teams[0];
    const inspectorStats = document.getElementById('inspector-stats');
    const selectedUnits = engine.units.filter(u => engine.selectedIds.has(u.id));
    const selectedBuildings = engine.buildings.filter(b => engine.selectedIds.has(b.id));
    const selectedBunkers = (engine.garrisonBunkers || []).filter(g => engine.selectedIds.has(g.id));

    // Live-update inspector stats & queue progress
    if (selectedBunkers.length > 0) {
      const g = selectedBunkers[0];
      inspectorStats.innerHTML = `
        <span>Integrity: ${Math.ceil(g.hp)}/${g.maxHp}</span>
        <span style="color:#fde047">Occupants: ${g.occupants.length}/${g.maxOccupants}</span>
        ${g.occupants.map(u => `<span class="unit-chip">${u.def.shortName}</span>`).join('')}
      `;
    } else if (selectedUnits.length === 1) {
      const primary = selectedUnits[0];
      const vet = ZH_DATA.VETERANCY_LEVELS[primary.vetLevel] || ZH_DATA.VETERANCY_LEVELS[0];
      const addonLabel = primary.overlordAddon ||
        (primary.hasGatlingCannon ? 'GATLING_CANNON' : primary.hasSpeakerTower ? 'SPEAKER_TOWER' : null);
      inspectorStats.innerHTML = `
        <span>HP: ${Math.ceil(primary.hp)}/${primary.maxHp}</span>
        <span>Rank: ${vet.name} ${'★'.repeat(primary.vetLevel)}</span>
        ${primary.def.locomotor ? `<span style="color:#94a3b8">${primary.def.locomotor}</span>` : ''}
        ${primary.salvageTier > 0 ? `<span>Salvage: Tier ${primary.salvageTier}</span>` : ''}
        ${addonLabel ? `<span style="color:#38bdf8">Addon: ${addonLabel}</span>` : ''}
        ${primary.stealthed ? `<span style="color:#a855f7">🕵️ STEALTH</span>` : ''}
        ${(primary.laserLockedTimer > 0 || primary.laserLockTimer > 0) ? `<span style="color:#ef4444">🎯 LASER LOCKED</span>` : ''}
        ${primary.empTimer > 0 ? `<span style="color:#38bdf8">⚡ EMP DISABLED</span>` : ''}
        ${primary.inHorde ? '<span style="color:#fde047">★ HORDE BONUS (+ROF)</span>' : ''}
        ${primary.inPropaganda ? '<span style="color:#22c55e">🔊 PROPAGANDA HEAL</span>' : ''}
      `;
    } else if (selectedUnits.length > 1) {
      inspectorStats.innerHTML = selectedUnits.slice(0, 8).map(u =>
        `<span class="unit-chip">${u.def.shortName} (${Math.round(u.hp / u.maxHp * 100)}%)</span>`
      ).join('');
      renderSelectionSummary(selectedUnits);
    } else if (selectedBuildings.length > 0) {
      const b = selectedBuildings[0];
      inspectorStats.innerHTML = `
        <span>HP: ${Math.ceil(b.hp)}/${b.maxHp}</span>
        <span>Power: ${b.def.power >= 0 ? '+' + b.def.power : b.def.power}</span>
        <span>Status: ${b.constructed ? 'ONLINE' : `BUILDING (${Math.round(b.buildProgress * 100)}%)`}</span>
      `;
      renderProductionQueueStrip(b);
    }

    // Update command button affordability & live progress bars
    const cmdGrid = document.getElementById('command-card-grid');
    if (cmdGrid && cmdGrid.children && pTeam) {
      const b = selectedBuildings[0] || null;
      for (const child of cmdGrid.children) {
        if (!child.classList || !child.classList.contains('cmd-card-btn')) continue;
        const costNum = Number(child.dataset && child.dataset.costNum);
        const prereqLocked = child.classList.contains('cmd-prereq-locked');
        if (!isNaN(costNum) && costNum > 0 && !prereqLocked) {
          child.classList.toggle('cmd-cant-afford', pTeam.credits < costNum);
        }
        if (b && b.queue && b.queue.length > 0 && child.dataset && child.dataset.defId) {
          const defId = child.dataset.defId;
          if (b.queue[0].id === defId && child.querySelector) {
            const bar = child.querySelector('.cmd-progress-bar');
            if (bar && bar.style) {
              const pct = Math.round((1 - b.queue[0].timer / b.queue[0].totalTime) * 100);
              bar.style.width = `${pct}%`;
            }
          }
        }
      }
    }
  }

  function renderProductionQueueStrip(b) {
    const queueStrip = document.getElementById('inspector-queue');
    if (!queueStrip) return;
    queueStrip.innerHTML = '';
    if (!b || !b.queue || b.queue.length === 0) return;

    b.queue.forEach((q, idx) => {
      const pct = idx === 0 ? Math.round((1 - q.timer / q.totalTime) * 100) : 0;
      const def = ZH_DATA.UNITS[q.id] || ZH_DATA.UPGRADES[q.id];
      const icon = def && ZH_DATA.iconFor ? ZH_DATA.iconFor(def) : '⚙️';
      const pill = document.createElement('span');
      pill.className = 'queue-pill';
      pill.title = `Click to cancel ${q.name} and refund credits`;
      pill.innerHTML = `${icon} ${q.name} ${idx === 0 ? pct + '%' : ''}`;
      pill.addEventListener('click', () => {
        if (idx === 0 || b.queue.filter(x => x.id === q.id).length === 1) {
          engine.cancelProduction(b, q.id);
        } else {
          const removed = b.queue.splice(idx, 1)[0];
          if (removed && engine.teams[b.team]) {
            engine.teams[b.team].credits += removed.cost || 0;
          }
        }
        refreshCommandBar();
      });
      queueStrip.appendChild(pill);
    });
  }

  function renderSelectionSummary(selectedUnits) {
    const summaryEl = document.getElementById('selection-summary');
    if (!summaryEl) return;
    if (!selectedUnits || selectedUnits.length <= 1) {
      summaryEl.classList.add('hidden');
      summaryEl.innerHTML = '';
      return;
    }

    summaryEl.classList.remove('hidden');
    summaryEl.innerHTML = '';

    const groups = new Map();
    selectedUnits.forEach(u => {
      if (!groups.has(u.defId)) {
        groups.set(u.defId, []);
      }
      groups.get(u.defId).push(u);
    });

    groups.forEach((units, defId) => {
      const def = units[0].def;
      const icon = ZH_DATA.iconFor ? ZH_DATA.iconFor(def) : '🪖';
      const avgHpPct = Math.round(
        (units.reduce((acc, u) => acc + u.hp / Math.max(1, u.maxHp), 0) / units.length) * 100
      );
      const hpColor = avgHpPct > 55 ? '#22c55e' : avgHpPct > 25 ? '#eab308' : '#ef4444';

      const chip = document.createElement('button');
      chip.className = 'unit-group-chip';
      chip.dataset.defId = defId;
      chip.title = `${def.name} (x${units.length}) — Click to isolate type, Shift+Click to remove type`;
      chip.innerHTML = `
        <span class="chip-icon">${icon}</span>
        <span class="chip-count">x${units.length}</span>
        <span class="chip-name">${def.shortName}</span>
        <div class="chip-hp-bar"><div class="chip-hp-fill" style="width:${avgHpPct}%;background:${hpColor}"></div></div>
      `;
      chip.addEventListener('click', (e) => {
        if (e.shiftKey) {
          units.forEach(u => engine.selectedIds.delete(u.id));
        } else {
          engine.selectedIds.clear();
          units.forEach(u => engine.selectedIds.add(u.id));
        }
        refreshCommandBar();
        ZH_AUDIO.playSFX('click');
      });
      summaryEl.appendChild(chip);
    });
  }

  function padCommandCardTo12(cmdGrid) {
    if (!cmdGrid || !cmdGrid.children) return;
    while (cmdGrid.children.length < 12) {
      const empty = document.createElement('div');
      empty.className = 'cmd-slot-empty';
      cmdGrid.appendChild(empty);
    }
  }

  function refreshCommandBar() {
    if (!engine || !engine.running) return;
    hideHudTooltip();

    const inspectorTitle = document.getElementById('inspector-title');
    const inspectorSub = document.getElementById('inspector-subtitle');
    const inspectorStats = document.getElementById('inspector-stats');
    const queueStrip = document.getElementById('inspector-queue');
    const cmdGrid = document.getElementById('command-card-grid');
    const stanceBar = document.getElementById('stance-bar');

    cmdGrid.innerHTML = '';
    queueStrip.innerHTML = '';

    const selectedUnits = engine.units.filter(u => engine.selectedIds.has(u.id));
    const selectedBuildings = engine.buildings.filter(b => engine.selectedIds.has(b.id));
    const selectedBunkers = (engine.garrisonBunkers || []).filter(g => engine.selectedIds.has(g.id));

    const hasCombatUnits = selectedUnits.some(
      u => u.team === 0 && !u.def.isBuilder && !u.def.isHarvester
    );
    if (stanceBar) {
      stanceBar.classList.toggle('hidden', !hasCombatUnits);
      const atkMoveBtn = document.getElementById('btn-order-attack-move');
      if (atkMoveBtn) {
        atkMoveBtn.classList.toggle('active', engine.commandMode === 'ATTACK_MOVE');
      }
    }

    renderSelectionSummary(selectedUnits);
    lastCmdSignature = computeCommandSignature();

    if (selectedUnits.length === 0 && selectedBuildings.length === 0 && selectedBunkers.length === 0) {
      inspectorTitle.textContent = 'No Tactical Selection';
      inspectorSub.textContent = 'Left-click or drag a box to select units/structures. Press [B] for Dozer/Worker.';
      inspectorStats.innerHTML = '';
      padCommandCardTo12(cmdGrid);
      updateHudLive();
      return;
    }

    // CASE 0: Civilian Garrison Bunker Selected (Phase 2 SYS-15)
    if (selectedBunkers.length > 0) {
      const g = selectedBunkers[0];
      inspectorTitle.textContent = `${g.name} (Garrisoned)`;
      inspectorSub.textContent = 'Fortified urban structure (+40% armor, +25% range for firing ports). Vulnerable to Flame/Toxin & Flashbangs.';
      inspectorStats.innerHTML = `
        <span>Integrity: ${Math.ceil(g.hp)}/${g.maxHp}</span>
        <span style="color:#fde047">Occupants: ${g.occupants.length}/${g.maxOccupants}</span>
        ${g.occupants.map(u => `<span class="unit-chip">${u.def.shortName}</span>`).join('')}
      `;
      if (g.team === 0 && g.occupants.length > 0) {
        createCommandButton(cmdGrid, {
          hotkey: 'E',
          title: 'EVACUATE',
          icon: '🚪',
          cost: `${g.occupants.length} INF`,
          tooltip: 'Evacuate all garrisoned infantry back onto the street [E].',
          onClick: () => {
            engine.evacuateGarrison(g);
            refreshCommandBar();
          }
        });
      }
      padCommandCardTo12(cmdGrid);
      updateHudLive();
      return;
    }

    // CASE A: Single or Multiple Units Selected
    if (selectedUnits.length > 0) {
      const primary = selectedUnits[0];
      const vet = ZH_DATA.VETERANCY_LEVELS[primary.vetLevel] || ZH_DATA.VETERANCY_LEVELS[0];

      if (selectedUnits.length === 1) {
        const addonLabel = primary.overlordAddon ||
          (primary.hasGatlingCannon ? 'GATLING_CANNON' : primary.hasSpeakerTower ? 'SPEAKER_TOWER' : null);
        inspectorTitle.textContent = primary.def.name;
        inspectorSub.textContent = primary.def.description;
        inspectorStats.innerHTML = `
          <span>HP: ${Math.ceil(primary.hp)}/${primary.maxHp}</span>
          <span>Rank: ${vet.name} ${'★'.repeat(primary.vetLevel)}</span>
          ${primary.def.locomotor ? `<span style="color:#94a3b8">${primary.def.locomotor}</span>` : ''}
          ${primary.salvageTier > 0 ? `<span>Salvage: Tier ${primary.salvageTier}</span>` : ''}
          ${addonLabel ? `<span style="color:#38bdf8">Addon: ${addonLabel}</span>` : ''}
          ${primary.stealthed ? `<span style="color:#a855f7">🕵️ STEALTH</span>` : ''}
          ${(primary.laserLockedTimer > 0 || primary.laserLockTimer > 0) ? `<span style="color:#ef4444">🎯 LASER LOCKED</span>` : ''}
          ${primary.empTimer > 0 ? `<span style="color:#38bdf8">⚡ EMP DISABLED</span>` : ''}
          ${primary.inHorde ? '<span style="color:#fde047">★ HORDE BONUS (+ROF)</span>' : ''}
          ${primary.inPropaganda ? '<span style="color:#22c55e">🔊 PROPAGANDA HEAL</span>' : ''}
        `;
      } else {
        inspectorTitle.textContent = `Strike Group (${selectedUnits.length} Units Selected)`;
        inspectorSub.textContent = `Primary: ${primary.def.name} • Right-click to move, garrison buildings, or engage targets.`;
        inspectorStats.innerHTML = selectedUnits.slice(0, 8).map(u =>
          `<span class="unit-chip">${u.def.shortName} (${Math.round(u.hp / u.maxHp * 100)}%)</span>`
        ).join('');
      }

      // If primary unit is a Dozer / GLA Worker, populate its Building Construction buttons!
      if (primary.team === 0 && primary.def.isBuilder && primary.def.builds) {
        const hotkeys = ['Q', 'W', 'E', 'R', 'A', 'S', 'D', 'F', 'Z', 'X', 'C', 'V'];
        let buildSlotIdx = 0;
        primary.def.builds.forEach((bId) => {
          const bDef = ZH_DATA.BUILDINGS[bId];
          if (!bDef) return;
          if (bDef.generalOnly && bDef.generalOnly !== engine.teams[0].generalId) return;
          const unlocked = engine.isEntityUnlocked(bId, 0);
          const cost = engine.getModifiedCost(bId, 0);
          const cantAfford = unlocked && engine.teams[0].credits < cost;
          createCommandButton(cmdGrid, {
            defId: bId,
            def: bDef,
            hotkey: hotkeys[buildSlotIdx++] || '',
            title: bDef.shortName,
            icon: bDef.icon,
            cost: `$${cost}`,
            costNum: cost,
            tooltip: `${bDef.name} ($${cost}) — ${bDef.description}`,
            disabled: !unlocked,
            prereqLocked: !unlocked,
            cantAfford,
            lockedText: !unlocked ? 'REQ TECH' : '',
            onClick: () => {
              engine.commandMode = 'BUILD';
              engine.pendingBuildId = bId;
              showTacticalAlert(`PLACING ${bDef.name.toUpperCase()} — Left-click on map to build, Right-click to cancel.`, '#22c55e');
            }
          });
        });
      }

      // Phase 2 Active Unit Micro-Abilities ([F])
      const hasAddonInstalled = Boolean(primary.overlordAddon || primary.hasGatlingCannon || (primary.hasSpeakerTower && primary.defId === 'CHINA_OVERLORD'));
      if (primary.team === 0 && primary.def.ability && ZH_DATA.UNIT_ABILITIES && ZH_DATA.UNIT_ABILITIES[primary.def.ability]) {
        const ab = ZH_DATA.UNIT_ABILITIES[primary.def.ability];
        const cd = Math.ceil(primary.abilityCooldown || 0);
        const totalCd = ab.cooldown || 20;
        const cooldownPct = cd > 0 ? Math.min(100, Math.round((cd / totalCd) * 100)) : 0;
        const alreadyInstalled = ab.targetType === 'SELF_ADDON' && hasAddonInstalled;
        if (!alreadyInstalled) {
          createCommandButton(cmdGrid, {
            defId: ab.id,
            def: ab,
            hotkey: ab.hotkey || 'F',
            title: ab.shortName,
            icon: ab.icon,
            cost: cd > 0 ? `${cd}s CD` : ab.cost ? `$${ab.cost}` : 'READY [F]',
            costNum: ab.cost || 0,
            cooldownPct,
            tooltip: `${ab.name} — ${ab.desc}`,
            disabled: cd > 0,
            onClick: () => {
              if (ab.targetType === 'SELF_ADDON') {
                engine.triggerUnitAbility(primary, ab.id, primary.x, primary.y, null);
                refreshCommandBar();
              } else {
                engine.commandMode = 'ABILITY';
                engine.pendingAbilityId = ab.id;
                engine.pendingAbilityUnitId = primary.id;
                showTacticalAlert(`ABILITY [${ab.name.toUpperCase()}] — Left-click target on the battlefield!`, '#fde047');
              }
            }
          });
        }
      }

      // Overlord Optional Gatling Cannon Addon ([R])
      if (primary.team === 0 && primary.defId === 'CHINA_OVERLORD' && !hasAddonInstalled) {
        const gatAb = ZH_DATA.UNIT_ABILITIES.OVERLORD_GATLING;
        if (gatAb) {
          createCommandButton(cmdGrid, {
            defId: gatAb.id,
            def: gatAb,
            hotkey: 'R',
            title: gatAb.shortName,
            icon: gatAb.icon,
            cost: `$${gatAb.cost}`,
            costNum: gatAb.cost || 0,
            tooltip: `${gatAb.name} — ${gatAb.desc}`,
            onClick: () => {
              engine.triggerUnitAbility(primary, 'OVERLORD_GATLING', primary.x, primary.y, null);
              refreshCommandBar();
            }
          });
        }
      }
      padCommandCardTo12(cmdGrid);
      updateHudLive();
      return;
    }

    // CASE B: Building Selected
    const b = selectedBuildings[0];
    inspectorTitle.textContent = b.def.name;
    inspectorSub.textContent = b.def.description;
    inspectorStats.innerHTML = `
      <span>HP: ${Math.ceil(b.hp)}/${b.maxHp}</span>
      <span>Power: ${b.def.power >= 0 ? '+' + b.def.power : b.def.power}</span>
      <span>Status: ${b.constructed ? 'ONLINE' : `BUILDING (${Math.round(b.buildProgress * 100)}%)`}</span>
    `;

    // Show interactive Production Queue chips
    renderProductionQueueStrip(b);

    if (b.team !== 0 || !b.constructed) {
      padCommandCardTo12(cmdGrid);
      updateHudLive();
      return;
    }

    const hotkeys = ['Q', 'W', 'E', 'R', 'A', 'S', 'D', 'F', 'X', 'C', 'V'];
    let slotIdx = 0;

    // 1. Trainable Units (Phase 3 SYS-20: Cameo queue badges + right-click cancel/refund)
    if (b.def.trains) {
      b.def.trains.forEach(uId => {
        const uDef = ZH_DATA.UNITS[uId];
        if (!uDef) return;
        if (uDef.generalOnly && uDef.generalOnly !== engine.teams[0].generalId) return;
        const unlocked = engine.isEntityUnlocked(uId, 0);
        const cost = engine.getModifiedCost(uId, 0);
        const cantAfford = unlocked && engine.teams[0].credits < cost;
        const qCount = b.queue.filter(q => q.id === uId).length;
        const progPct = (b.queue[0] && b.queue[0].id === uId)
          ? Math.round((1 - b.queue[0].timer / b.queue[0].totalTime) * 100)
          : 0;
        createCommandButton(cmdGrid, {
          defId: uId,
          def: uDef,
          hotkey: hotkeys[slotIdx++] || '',
          title: uDef.shortName,
          icon: uDef.icon,
          cost: `$${cost}`,
          costNum: cost,
          tooltip: `${uDef.name} ($${cost}) — ${uDef.description} [Right-Click to Cancel/Refund]`,
          disabled: !unlocked,
          prereqLocked: !unlocked,
          cantAfford,
          lockedText: !unlocked ? 'REQ TECH' : '',
          queueCount: qCount,
          progressPct: progPct,
          onClick: () => {
            engine.queueProduction(b, uId);
            refreshCommandBar();
          },
          onRightClick: () => {
            engine.cancelProduction(b, uId);
            refreshCommandBar();
          }
        });
      });
    }

    // 2. Researchable Upgrades
    if (b.def.upgrades) {
      b.def.upgrades.forEach(upgId => {
        const upg = ZH_DATA.UPGRADES[upgId];
        if (!upg) return;
        const owned = engine.teams[0].upgrades.has(upgId);
        const cantAfford = !owned && engine.teams[0].credits < upg.cost;
        const qCount = b.queue.filter(q => q.id === upgId).length;
        const progPct = (b.queue[0] && b.queue[0].id === upgId)
          ? Math.round((1 - b.queue[0].timer / b.queue[0].totalTime) * 100)
          : 0;
        createCommandButton(cmdGrid, {
          defId: upgId,
          def: upg,
          hotkey: hotkeys[slotIdx++] || '',
          title: upg.shortName,
          icon: upg.icon,
          cost: owned ? 'OWNED' : `$${upg.cost}`,
          costNum: owned ? 0 : upg.cost,
          cantAfford,
          tooltip: `${upg.name} ($${upg.cost}) — ${upg.desc} [Right-Click to Cancel/Refund]`,
          disabled: owned,
          queueCount: qCount,
          progressPct: progPct,
          onClick: () => {
            engine.queueProduction(b, upgId);
            refreshCommandBar();
          },
          onRightClick: () => {
            engine.cancelProduction(b, upgId);
            refreshCommandBar();
          }
        });
      });
    }

    // 3. China Nuclear Reactor Overcharge Toggle
    if (b.def.canOvercharge) {
      createCommandButton(cmdGrid, {
        hotkey: 'O',
        title: b.overcharged ? 'NORMAL PWR' : 'OVERCHARGE',
        icon: '☢️',
        cost: b.overcharged ? 'ACTIVE' : '+50% PWR',
        active: Boolean(b.overcharged),
        tooltip: 'Toggles Nuclear Reactor Overcharge (+50% Power output at the cost of gradual hull damage).',
        onClick: () => {
          b.overcharged = !b.overcharged;
          engine.recalculatePower(0);
          refreshCommandBar();
        }
      });
    }

    // 4. GLA Tunnel Network Garrison Exit Button
    if (b.def.isTunnel) {
      const count = engine.teams[0].tunnelUnits.length;
      createCommandButton(cmdGrid, {
        hotkey: 'E',
        title: 'EXIT TUNNEL',
        icon: '🕳️',
        cost: `${count}/10 UNITS`,
        tooltip: 'Instantly deploys all units inside the global GLA Tunnel Network out of THIS tunnel entrance!',
        onClick: () => engine.deployFromTunnel(b)
      });
    }

    // 5. Superweapon Launch Button
    if (b.def.isSuperweapon) {
      createCommandButton(cmdGrid, {
        hotkey: 'F',
        title: b.superweaponReady ? '🔥 LAUNCH!' : 'CHARGING',
        icon: '🚀',
        cost: b.superweaponReady ? 'READY' : `${Math.ceil(b.superweaponTimer)}s`,
        tooltip: `Launch ${b.def.name} at target enemy coordinates!`,
        disabled: !b.superweaponReady,
        onClick: () => {
          engine.commandMode = 'SUPERWEAPON';
          engine.pendingSuperweaponBuildingId = b.id;
          showTacticalAlert(`TARGETING ${b.def.name.toUpperCase()} — Click enemy base to launch!`, '#ef4444');
        }
      });
    }

    // 6. Rally Point Button (for production structures)
    if (b.def.trains && b.def.trains.length > 0) {
      createCommandButton(cmdGrid, {
        hotkey: 'Y',
        title: 'RALLY PT',
        icon: '🚩',
        cost: 'SET',
        tooltip: 'Set Rally Point [Y] — Left-click or Right-click on the battlefield to set rally coordinates.',
        onClick: () => {
          engine.commandMode = 'RALLY';
          showTacticalAlert(`RALLY POINT [Y] — Click on the battlefield to set ${b.def.name} rally point.`, '#fde047');
        }
      });
    }

    // 7. Sell Building Button ([Z])
    const refund = Math.floor((b.def.cost || 0) * 0.5 * (b.hp / Math.max(1, b.maxHp)));
    createCommandButton(cmdGrid, {
      hotkey: 'Z',
      title: 'SELL',
      icon: '💲',
      cost: `+$${refund}`,
      tooltip: `Sell ${b.def.name} [Z] — Deconstructs structure and refunds +$${refund} (50% scaled by integrity).`,
      onClick: () => {
        engine.sellBuilding(b);
        refreshCommandBar();
      }
    });

    padCommandCardTo12(cmdGrid);
    updateHudLive();
  }

  function createCommandButton(container, cfg) {
    const btn = document.createElement('button');
    const classes = ['cmd-card-btn'];
    if (cfg.disabled) classes.push('disabled');
    if (cfg.cantAfford) classes.push('cmd-cant-afford');
    if (cfg.prereqLocked) classes.push('cmd-prereq-locked');
    if (cfg.active) classes.push('cmd-active');
    btn.className = classes.join(' ');
    btn.title = cfg.tooltip || cfg.title || '';
    btn.dataset.hotkey = cfg.hotkey || '';
    if (cfg.defId) btn.dataset.defId = cfg.defId;
    if (cfg.costNum !== undefined) btn.dataset.costNum = String(cfg.costNum);

    const icon = cfg.icon || (cfg.def && ZH_DATA.iconFor ? ZH_DATA.iconFor(cfg.def) : '⚙️');
    btn.innerHTML = `
      <span class="cmd-hotkey">${cfg.hotkey || ''}</span>
      ${cfg.queueCount > 0 ? `<span class="cmd-queue-badge">x${cfg.queueCount}</span>` : ''}
      <span class="cmd-icon" aria-hidden="true">${icon}</span>
      <span class="cmd-title">${cfg.title}</span>
      <span class="cmd-cost">${cfg.lockedText || cfg.cost || ''}</span>
      ${cfg.cooldownPct > 0 ? `<div class="cmd-cooldown-fill" style="height:${cfg.cooldownPct}%"></div>` : ''}
      ${cfg.progressPct > 0 ? `<div class="cmd-progress-bar" style="width:${cfg.progressPct}%"></div>` : ''}
    `;

    if (!cfg.disabled && cfg.onClick) {
      btn.addEventListener('click', cfg.onClick);
    }
    if (cfg.onRightClick) {
      btn.addEventListener('contextmenu', e => {
        e.preventDefault();
        cfg.onRightClick();
      });
    }

    btn.addEventListener('mouseenter', () => showHudTooltip(btn, cfg));
    btn.addEventListener('mouseleave', () => hideHudTooltip());

    container.appendChild(btn);
  }

  function showHudTooltip(anchorEl, cfg) {
    const tip = document.getElementById('hud-tooltip');
    if (!tip) return;

    const def = cfg.def || (cfg.defId && (ZH_DATA.BUILDINGS[cfg.defId] || ZH_DATA.UNITS[cfg.defId] || ZH_DATA.UPGRADES[cfg.defId]));
    const name = (def && def.name) || cfg.title || 'Command';
    const desc = (def && (def.description || def.desc)) || cfg.tooltip || '';
    const missing = (cfg.defId && engine && engine.getMissingPrereqs) ? engine.getMissingPrereqs(cfg.defId, 0) : [];

    const metaPills = [];
    if (cfg.cost) metaPills.push(`<span>Cost: ${cfg.cost}</span>`);
    if (def && def.buildTime) metaPills.push(`<span>Build: ${def.buildTime}s</span>`);
    if (def && def.power !== undefined && def.power !== 0) {
      metaPills.push(`<span>Power: ${def.power > 0 ? '+' + def.power : def.power}</span>`);
    }

    const statItems = [];
    if (def) {
      if (def.maxHp) statItems.push(`<span>HP: ${def.maxHp}</span>`);
      if (def.weapon) {
        statItems.push(`<span>DMG: ${def.weapon.damage} (${def.weapon.type || 'STD'})</span>`);
        statItems.push(`<span>RNG: ${def.weapon.range}</span>`);
      }
      if (def.speed) statItems.push(`<span>SPD: ${def.speed}</span>`);
    }

    tip.innerHTML = `
      <div class="tip-header">
        <span class="tip-title">${name}</span>
        ${cfg.hotkey ? `<span class="tip-hotkey">[${cfg.hotkey}]</span>` : ''}
      </div>
      ${metaPills.length > 0 ? `<div class="tip-meta">${metaPills.join('')}</div>` : ''}
      <div class="tip-desc">${desc}</div>
      ${statItems.length > 0 ? `<div class="tip-stats">${statItems.join('')}</div>` : ''}
      ${missing.length > 0 ? `<div class="tip-prereq">Requires: ${missing.join(', ')}</div>` : ''}
    `;

    tip.classList.remove('hidden');
    if (anchorEl && anchorEl.getBoundingClientRect && tip.style) {
      const r = anchorEl.getBoundingClientRect();
      const vw = (typeof window !== 'undefined' && window.innerWidth) || 1280;
      const left = Math.max(12, Math.min(vw - 280, r.left));
      tip.style.left = `${left}px`;
    }
  }

  function hideHudTooltip() {
    const tip = document.getElementById('hud-tooltip');
    if (tip) tip.classList.add('hidden');
  }

  // ==========================================================================
  // Cursor Intent & Hit-Test Helpers
  // ==========================================================================
  function findHoverEntityAt(wx, wy) {
    if (!engine) return null;
    for (const u of engine.units) {
      if (u.hp <= 0 || u.garrisonedIn || u.garrisonId) continue;
      if (Math.hypot(u.x - wx, u.y - wy) <= u.radius + 12) return u;
    }
    for (const g of (engine.garrisonBunkers || [])) {
      if (g.hp > 0 && Math.hypot(g.x - wx, g.y - wy) <= g.radius + 12) return g;
    }
    for (const b of engine.buildings) {
      if (b.hp > 0 && Math.hypot(b.x - wx, b.y - wy) <= b.radius + 10) return b;
    }
    for (const d of (engine.supplyDocks || [])) {
      if (d.amount > 0 && Math.hypot(d.x - wx, d.y - wy) <= d.radius + 14) {
        return { id: d.id, isSupplyDock: true, x: d.x, y: d.y };
      }
    }
    for (const t of (engine.techStructures || engine.oilDerricks || [])) {
      if (Math.hypot(t.x - wx, t.y - wy) <= t.radius + 14) {
        return { id: t.id, isTechStructure: true, team: t.team, x: t.x, y: t.y };
      }
    }
    return null;
  }

  function getCursorIntent(wx, wy, ctrlHeld) {
    if (!engine || !engine.running) return 'DEFAULT';
    if (engine.commandMode) return 'TARGET';

    const hovered = findHoverEntityAt(wx, wy);
    engine.hoveredEntityId = hovered && hovered.id ? hovered.id : null;

    const selUnits = engine.units.filter(u => engine.selectedIds.has(u.id) && u.team === 0 && !(u.garrisonedIn || u.garrisonId));
    if (selUnits.length > 0) {
      if (ctrlHeld) return 'FORCE_FIRE';
      if (hovered) {
        if (hovered.isSupplyDock && selUnits.some(u => u.def.isHarvester)) return 'HARVEST';
        if (hovered.isTechStructure && hovered.team !== 0 && selUnits.some(u => u.def.canCapture)) return 'CAPTURE';
        if (hovered.occupants !== undefined && (hovered.team === -1 || hovered.team === 0) &&
            hovered.occupants.length < hovered.maxOccupants && selUnits.some(u => u.def.type === 'INFANTRY' && !u.def.isBuilder)) {
          return 'GARRISON';
        }
        if (hovered.team === 0 && hovered.def && hovered.def.isTunnel) return 'GARRISON';
        if (hovered.team === 0 && hovered.constructed !== undefined && (!hovered.constructed || hovered.hp < hovered.maxHp) &&
            selUnits.some(u => u.def.isBuilder)) {
          return 'REPAIR';
        }
        if (hovered.team !== undefined && hovered.team !== 0 && hovered.team !== -1) return 'ATTACK';
      }
      return 'MOVE';
    }

    if (hovered && hovered.team === 0) return 'SELECT';
    return 'DEFAULT';
  }

  function applyCanvasCursor(canvas, intent) {
    if (!canvas || !canvas.style || intent === lastCursorIntent) return;
    lastCursorIntent = intent;
    canvas.style.cursor = CURSOR_URIS[intent] || 'default';
  }

  // ==========================================================================
  // Canvas & Minimap Mouse Input
  // ==========================================================================
  function setupCanvasInput(canvas, minimap) {
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    minimap.addEventListener('contextmenu', e => e.preventDefault());

    window.addEventListener('mousemove', e => {
      pointerClient.x = e.clientX;
      pointerClient.y = e.clientY;
      pointerClient.insideViewport = true;
      if (isMiddlePanning && engine) {
        const dx = (e.clientX - middlePanLast.x) / (engine.cam.zoom || 1);
        const dy = (e.clientY - middlePanLast.y) / (engine.cam.zoom || 1);
        middlePanLast.x = e.clientX;
        middlePanLast.y = e.clientY;
        engine.cam.x = Math.max(0, Math.min(engine.worldSize - engine.cam.w, engine.cam.x - dx));
        engine.cam.y = Math.max(0, Math.min(engine.worldSize - engine.cam.h, engine.cam.y - dy));
      }
    });

    canvas.addEventListener('mousemove', e => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      dragCurrentScreen = { x: sx, y: sy };
      if (engine) {
        const wpt = engine.screenToWorld(sx, sy);
        engine.mouseWorld.x = wpt.x;
        engine.mouseWorld.y = wpt.y;
        const intent = getCursorIntent(wpt.x, wpt.y, e.ctrlKey || e.metaKey);
        applyCanvasCursor(canvas, intent);
      }
    });

    canvas.addEventListener('wheel', e => {
      if (!engine || !engine.running) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const before = engine.screenToWorld(sx, sy);
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const nextZoom = Math.max(0.6, Math.min(1.4, (engine.cam.zoom || 1) * factor));
      engine.cam.zoom = Number(nextZoom.toFixed(3));
      const vw = engine.viewW || (rect.width || 1280);
      const vh = engine.viewH || (rect.height || 600);
      engine.cam.w = vw / engine.cam.zoom;
      engine.cam.h = vh / engine.cam.zoom;
      engine.cam.x = Math.max(0, Math.min(engine.worldSize - engine.cam.w, before.x - sx / engine.cam.zoom));
      engine.cam.y = Math.max(0, Math.min(engine.worldSize - engine.cam.h, before.y - sy / engine.cam.zoom));
    }, { passive: false });

    canvas.addEventListener('mousedown', e => {
      if (!engine || !engine.running) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const wpt = engine.screenToWorld(sx, sy);
      const wx = wpt.x;
      const wy = wpt.y;

      // Middle-Click (Button 1): Drag Pan
      if (e.button === 1) {
        e.preventDefault();
        isMiddlePanning = true;
        middlePanLast = { x: e.clientX, y: e.clientY };
        return;
      }

      // Left-Click (Button 0)
      if (e.button === 0) {
        // 1. Handle active Command Mode (BUILD, POWER, SUPERWEAPON, ABILITY, ATTACK_MOVE, GUARD, RALLY)
        if (engine.commandMode === 'BUILD' && engine.pendingBuildId) {
          const placed = engine.startBuildingPlacement(engine.pendingBuildId, 0, wx, wy);
          if (placed && !e.shiftKey) {
            engine.commandMode = null;
            engine.pendingBuildId = null;
          }
          return;
        }
        if (engine.commandMode === 'POWER' && engine.pendingPowerId) {
          engine.castGeneralsPower(0, engine.pendingPowerId, wx, wy);
          engine.commandMode = null;
          engine.pendingPowerId = null;
          updatePowerStrip(true);
          return;
        }
        if (engine.commandMode === 'SUPERWEAPON' && engine.pendingSuperweaponBuildingId) {
          engine.fireSuperweapon(engine.pendingSuperweaponBuildingId, wx, wy);
          engine.commandMode = null;
          engine.pendingSuperweaponBuildingId = null;
          return;
        }
        if (engine.commandMode === 'ABILITY' && engine.pendingAbilityId) {
          const targetEntity =
            engine.units.find(u => u.team !== 0 && !(u.garrisonedIn || u.garrisonId) && Math.hypot(u.x - wx, u.y - wy) <= u.radius + 18) ||
            engine.buildings.find(b => b.team !== 0 && Math.hypot(b.x - wx, b.y - wy) <= b.radius + 16);

          const casters = engine.units.filter(
            u => engine.selectedIds.has(u.id) && u.team === 0 && u.def.ability === engine.pendingAbilityId
          );
          if (casters.length > 0) {
            casters.forEach(c =>
              engine.triggerUnitAbility(c, engine.pendingAbilityId, wx, wy, targetEntity ? targetEntity.id : null)
            );
          }
          engine.commandMode = null;
          engine.pendingAbilityId = null;
          engine.pendingAbilityUnitId = null;
          refreshCommandBar();
          return;
        }
        if (engine.commandMode === 'ATTACK_MOVE') {
          issueRightClickOrder(wx, wy, true, e.shiftKey);
          engine.commandMode = null;
          refreshCommandBar();
          return;
        }
        if (engine.commandMode === 'GUARD') {
          engine.orderGuardSelected(wx, wy);
          engine.commandMode = null;
          refreshCommandBar();
          return;
        }
        if (engine.commandMode === 'RALLY') {
          issueRightClickOrder(wx, wy, false, false);
          engine.commandMode = null;
          refreshCommandBar();
          return;
        }

        // Start Selection Box Drag
        isDraggingBox = true;
        dragStartScreen = { x: sx, y: sy };
        dragCurrentScreen = { x: sx, y: sy };
      }

      // Right-Click (Button 2)
      if (e.button === 2) {
        if (engine.commandMode) {
          engine.commandMode = null;
          engine.pendingBuildId = null;
          engine.pendingPowerId = null;
          engine.pendingAbilityId = null;
          engine.pendingSuperweaponBuildingId = null;
          refreshCommandBar();
          return;
        }
        // Phase 3 SYS-19: Ctrl+RightClick Force-Fire on Ground or Entity
        if (e.ctrlKey || e.metaKey) {
          const clickedEntity =
            engine.units.find(u => !(u.garrisonedIn || u.garrisonId) && Math.hypot(u.x - wx, u.y - wy) <= u.radius + 14) ||
            engine.buildings.find(b => Math.hypot(b.x - wx, b.y - wy) <= b.radius + 12) ||
            (engine.garrisonBunkers || []).find(g => g.hp > 0 && Math.hypot(g.x - wx, g.y - wy) <= g.radius + 14);
          engine.orderForceFireSelected(wx, wy, clickedEntity || null);
          return;
        }
        issueRightClickOrder(wx, wy, false, e.shiftKey);
      }
    });

    window.addEventListener('mouseup', e => {
      if (e.button === 1) {
        isMiddlePanning = false;
      }
      if (!isDraggingBox || e.button !== 0) return;
      isDraggingBox = false;
      if (!engine || !engine.running) return;

      const dx = Math.abs(dragCurrentScreen.x - dragStartScreen.x);
      const dy = Math.abs(dragCurrentScreen.y - dragStartScreen.y);

      if (dx < 6 && dy < 6) {
        const wpt = engine.screenToWorld(dragCurrentScreen.x, dragCurrentScreen.y);
        handleSingleClickSelection(wpt.x, wpt.y, e.shiftKey);
      } else {
        handleBoxSelection(e.shiftKey);
      }
    });

    // Minimap Click (Left-click pan camera, Right-click move/attack-move)
    minimap.addEventListener('mousedown', e => {
      if (!engine || !engine.running) return;
      const rect = minimap.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / rect.width;
      const my = (e.clientY - rect.top) / rect.height;
      const wx = mx * engine.worldSize;
      const wy = my * engine.worldSize;

      if (e.button === 0) {
        centerCameraOn(wx, wy);
      } else if (e.button === 2) {
        issueRightClickOrder(wx, wy, true, e.shiftKey);
      }
    });
  }

  function handleSingleClickSelection(wx, wy, additive) {
    if (!additive) engine.selectedIds.clear();

    // Check friendly units first
    const clickedUnit = engine.units.find(
      u => u.team === 0 && !(u.garrisonedIn || u.garrisonId) && Math.hypot(u.x - wx, u.y - wy) <= u.radius + 8
    );

    if (clickedUnit) {
      const now = performance.now();
      // Double-click selects all visible units of the same type!
      if (now - lastClickTime < 340 && lastClickedDefId === clickedUnit.defId) {
        for (const u of engine.units) {
          if (u.team === 0 && !(u.garrisonedIn || u.garrisonId) && u.defId === clickedUnit.defId) {
            engine.selectedIds.add(u.id);
          }
        }
      } else {
        engine.selectedIds.add(clickedUnit.id);
      }
      lastClickTime = now;
      lastClickedDefId = clickedUnit.defId;
      ZH_AUDIO.playSFX('click');
      if (clickedUnit.def.voiceSelect) ZH_AUDIO.speak(clickedUnit.def.voiceSelect);
      refreshCommandBar();
      return;
    }

    // Check friendly Garrison Bunkers (Phase 2 SYS-15)
    const clickedBunker = (engine.garrisonBunkers || []).find(
      g => g.team === 0 && g.hp > 0 && Math.hypot(g.x - wx, g.y - wy) <= g.radius + 8
    );
    if (clickedBunker) {
      engine.selectedIds.add(clickedBunker.id);
      ZH_AUDIO.playSFX('click');
      refreshCommandBar();
      return;
    }

    // Check friendly buildings
    const clickedBuilding = engine.buildings.find(
      b => b.team === 0 && Math.hypot(b.x - wx, b.y - wy) <= b.radius + 6
    );
    if (clickedBuilding) {
      engine.selectedIds.add(clickedBuilding.id);
      ZH_AUDIO.playSFX('click');
      if (clickedBuilding.def.voiceSelect) ZH_AUDIO.speak(clickedBuilding.def.voiceSelect);
    }
    refreshCommandBar();
  }

  function handleBoxSelection(additive) {
    if (!additive) engine.selectedIds.clear();
    const p0 = engine.screenToWorld(
      Math.min(dragStartScreen.x, dragCurrentScreen.x),
      Math.min(dragStartScreen.y, dragCurrentScreen.y)
    );
    const p1 = engine.screenToWorld(
      Math.max(dragStartScreen.x, dragCurrentScreen.x),
      Math.max(dragStartScreen.y, dragCurrentScreen.y)
    );
    const x0 = p0.x;
    const x1 = p1.x;
    const y0 = p0.y;
    const y1 = p1.y;

    const boxUnits = [];
    for (const u of engine.units) {
      if (u.team === 0 && !(u.garrisonedIn || u.garrisonId) && u.x >= x0 && u.x <= x1 && u.y >= y0 && u.y <= y1) {
        boxUnits.push(u);
      }
    }
    const hasCombat = boxUnits.some(u => !u.def.isBuilder && !u.def.isHarvester);
    const filtered = hasCombat
      ? boxUnits.filter(u => !u.def.isBuilder && !u.def.isHarvester)
      : boxUnits;
    for (const u of filtered) {
      engine.selectedIds.add(u.id);
    }
    if (engine.selectedIds.size > 0) {
      ZH_AUDIO.playSFX('click');
    }
    refreshCommandBar();
  }

  function pushMoveMarker(wx, wy, color) {
    if (!engine || !engine.moveMarkers) return;
    engine.moveMarkers.push({
      x: wx,
      y: wy,
      color: color || '#22c55e',
      age: 0,
      maxAge: 0.55
    });
  }

  function issueRightClickOrder(wx, wy, forceAttackMove, shiftWaypoints = false) {
    const selectedUnits = engine.units.filter(u => engine.selectedIds.has(u.id) && u.team === 0 && !(u.garrisonedIn || u.garrisonId));
    const selectedBuildings = engine.buildings.filter(b => engine.selectedIds.has(b.id) && b.team === 0);

    // Set Rally Point if only buildings are selected
    if (selectedUnits.length === 0 && selectedBuildings.length > 0) {
      for (const b of selectedBuildings) {
        b.rallyX = wx;
        b.rallyY = wy;
      }
      engine.spawnBurst(wx, wy, '#fde047', 6);
      pushMoveMarker(wx, wy, '#fde047');
      ZH_AUDIO.playSFX('click');
      return;
    }

    if (selectedUnits.length === 0) return;

    // Phase 3 SYS-19: Shift+RightClick Chained Waypoint Queuing
    if (shiftWaypoints) {
      selectedUnits.forEach(u => {
        if (!u.waypoints) u.waypoints = [];
        u.waypoints.push({ x: wx, y: wy });
        if (u.state === 'IDLE') {
          const nextWp = u.waypoints.shift();
          u.state = forceAttackMove ? 'ATTACK_MOVE' : 'MOVE';
          u.path = null;
          u.targetX = nextWp.x;
          u.targetY = nextWp.y;
        }
      });
      engine.spawnBurst(wx, wy, '#22c55e', 5);
      pushMoveMarker(wx, wy, '#22c55e');
      ZH_AUDIO.playSFX('click');
      return;
    }

    // Clear queued waypoints on fresh un-shifted order
    selectedUnits.forEach(u => { u.waypoints = []; });

    // 0. Check if right-clicked an Unmanned Neutral Vehicle (Jarmen Kell Pilot Snipe re-crew!)
    const unmannedVehicle = engine.units.find(
      u => u.unmanned && u.hp > 0 && Math.hypot(u.x - wx, u.y - wy) <= u.radius + 16
    );
    if (unmannedVehicle && !forceAttackMove) {
      let assigned = false;
      for (const u of selectedUnits) {
        if (u.def.type === 'INFANTRY') {
          u.state = 'RECREW_VEHICLE';
          u.targetEntityId = unmannedVehicle.id;
          assigned = true;
          break;
        }
      }
      if (assigned) {
        engine.spawnBurst(unmannedVehicle.x, unmannedVehicle.y, '#22c55e', 8);
        ZH_AUDIO.playSFX('click');
        return;
      }
    }

    // 1. Check if right-clicked a Civilian Garrison Bunker (Infantry enter garrison!)
    const clickedBunker = (engine.garrisonBunkers || []).find(
      g => g.hp > 0 && (g.team === -1 || g.team === 0) && g.occupants.length < g.maxOccupants &&
           Math.hypot(g.x - wx, g.y - wy) <= g.radius + 16
    );
    if (clickedBunker && !forceAttackMove) {
      let anyInfantry = false;
      for (const u of selectedUnits) {
        if (u.def.type === 'INFANTRY' && !u.def.isBuilder) {
          u.state = 'ENTER_GARRISON';
          u.targetEntityId = clickedBunker.id;
          anyInfantry = true;
        }
      }
      if (anyInfantry) {
        engine.spawnBurst(clickedBunker.x, clickedBunker.y, '#38bdf8', 8);
        ZH_AUDIO.playSFX('click');
        return;
      }
    }

    // 2. Check if right-clicked an Enemy Unit or Building
    const enemyTarget =
      engine.units.find(u => u.team !== 0 && !u.unmanned && !(u.garrisonedIn || u.garrisonId) && Math.hypot(u.x - wx, u.y - wy) <= u.radius + 14) ||
      engine.buildings.find(b => b.team !== 0 && Math.hypot(b.x - wx, b.y - wy) <= b.radius + 12) ||
      (engine.garrisonBunkers || []).find(g => g.team === 1 && g.hp > 0 && Math.hypot(g.x - wx, g.y - wy) <= g.radius + 14);

    if (enemyTarget && !forceAttackMove) {
      for (const u of selectedUnits) {
        if (u.defId === 'GLA_HIJACKER' && enemyTarget.def && enemyTarget.def.type === 'VEHICLE') {
          u.state = 'HIJACK_VEHICLE';
          u.targetEntityId = enemyTarget.id;
        } else if (u.def.weapon) {
          u.state = 'ATTACK';
          u.targetEntityId = enemyTarget.id;
        } else {
          u.state = 'MOVE';
          u.path = null;
          u.targetX = wx;
          u.targetY = wy;
        }
      }
      engine.spawnBurst(enemyTarget.x, enemyTarget.y, '#ef4444', 8);
      pushMoveMarker(enemyTarget.x, enemyTarget.y, '#ef4444');
      ZH_AUDIO.playSFX('click');
      return;
    }

    // 3. Check if right-clicked an Unfinished or Damaged Friendly Building (Dozer/Worker construct/repair)
    const unfinishedSite = engine.buildings.find(
      b => b.team === 0 && (!b.constructed || b.hp < b.maxHp) && b.hp > 0 && Math.hypot(b.x - wx, b.y - wy) <= b.radius + 12
    );
    if (unfinishedSite && !forceAttackMove) {
      let anyBuilder = false;
      for (const u of selectedUnits) {
        if (u.def.isBuilder) {
          u.state = 'BUILD';
          u.buildTargetId = unfinishedSite.id;
          anyBuilder = true;
        }
      }
      if (anyBuilder) {
        ZH_AUDIO.playSFX('click');
        return;
      }
    }

    // 4. Check if right-clicked a Friendly GLA Tunnel Network (Enter subterranean network!)
    const friendlyTunnel = engine.buildings.find(
      b => b.team === 0 && b.constructed && b.def.isTunnel && Math.hypot(b.x - wx, b.y - wy) <= b.radius + 14
    );
    if (friendlyTunnel) {
      for (const u of selectedUnits) {
        if (!u.def.isAir) {
          u.state = 'ENTER_TUNNEL';
          u.targetEntityId = friendlyTunnel.id;
        }
      }
      engine.spawnBurst(friendlyTunnel.x, friendlyTunnel.y, '#eab308', 8);
      ZH_AUDIO.playSFX('click');
      return;
    }

    // 5. Check if right-clicked a Supply Dock (Send Harvesters / GLA Workers)
    const clickedDock = engine.supplyDocks.find(
      d => d.amount > 0 && Math.hypot(d.x - wx, d.y - wy) <= d.radius + 18
    );
    if (clickedDock) {
      for (const u of selectedUnits) {
        if (u.def.isHarvester) {
          u.state = 'HARVEST';
          u.supplyDockId = clickedDock.id;
        }
      }
      ZH_AUDIO.playSFX('click');
      return;
    }

    // 6. Check if right-clicked a Capturable Tech Structure (Oil Derrick, Hospital, Repair Bay)
    const clickedTech = (engine.techStructures || engine.oilDerricks || []).find(
      o => o.team !== 0 && Math.hypot(o.x - wx, o.y - wy) <= o.radius + 16
    );
    if (clickedTech) {
      for (const u of selectedUnits) {
        if (u.def.canCapture) {
          u.state = 'CAPTURE';
          u.targetEntityId = clickedTech.id;
        } else {
          u.state = 'MOVE';
          u.path = null;
          u.targetX = wx;
          u.targetY = wy;
        }
      }
      ZH_AUDIO.playSFX('click');
      return;
    }

    // 7. Standard Formation Move or Attack-Move
    const cols = Math.ceil(Math.sqrt(selectedUnits.length));
    selectedUnits.forEach((u, idx) => {
      const r = Math.floor(idx / cols) - Math.floor(cols / 2);
      const c = (idx % cols) - Math.floor(cols / 2);
      u.state = forceAttackMove ? 'ATTACK_MOVE' : 'MOVE';
      u.path = null;
      u.targetX = wx + c * 32;
      u.targetY = wy + r * 32;
    });

    if (selectedUnits[0].def.voiceMove) {
      ZH_AUDIO.speak(selectedUnits[0].def.voiceMove);
    }
    const markerCol = forceAttackMove ? '#ef4444' : '#22c55e';
    engine.spawnBurst(wx, wy, markerCol, 6);
    pushMoveMarker(wx, wy, markerCol);
    ZH_AUDIO.playSFX('click');
  }

  function renderSelectionBox() {
    if (!isDraggingBox || !engine) return;
    const ctx = engine.ctx;
    const x = Math.min(dragStartScreen.x, dragCurrentScreen.x);
    const y = Math.min(dragStartScreen.y, dragCurrentScreen.y);
    const w = Math.abs(dragCurrentScreen.x - dragStartScreen.x);
    const h = Math.abs(dragCurrentScreen.y - dragStartScreen.y);

    ctx.save();
    ctx.strokeStyle = '#22c55e';
    ctx.fillStyle = 'rgba(34, 197, 94, 0.14)';
    ctx.lineWidth = 1.5;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  // ==========================================================================
  // Keyboard Shortcuts & Camera Panning
  // ==========================================================================
  let lastGroupTapKey = null;
  let lastGroupTapTime = 0;

  function setupKeyboardInput() {
    window.addEventListener('keydown', e => {
      keys[e.key.toLowerCase()] = true;
      if (e.key === 'Alt' && engine) {
        engine.showAllHealthBars = true;
      }
      if (e.key === 'F9') {
        e.preventDefault();
        quickLoad();
        return;
      }
      if (!engine || !engine.running) return;

      // Priority Escape Order:
      // 1. Cancel active commandMode
      // 2. Close #powers-modal
      // 3. Close #game-menu-modal
      // 4. Deselect active selection
      // 5. Open #game-menu-modal
      if (e.key === 'Escape') {
        if (engine.commandMode) {
          engine.commandMode = null;
          engine.pendingBuildId = null;
          engine.pendingPowerId = null;
          engine.pendingAbilityId = null;
          engine.pendingSuperweaponBuildingId = null;
          refreshCommandBar();
          return;
        }
        const powersModal = document.getElementById('powers-modal');
        if (powersModal && !powersModal.classList.contains('hidden')) {
          powersModal.classList.add('hidden');
          return;
        }
        const gameMenuModal = document.getElementById('game-menu-modal');
        if (gameMenuModal && !gameMenuModal.classList.contains('hidden')) {
          gameMenuModal.classList.add('hidden');
          return;
        }
        if (engine.selectedIds.size > 0) {
          engine.selectedIds.clear();
          refreshCommandBar();
          return;
        }
        if (gameMenuModal) {
          gameMenuModal.classList.remove('hidden');
        }
        return;
      }

      // Home resets zoom to 1.0 and centers camera on player's Command Center
      if (e.key === 'Home') {
        e.preventDefault();
        engine.cam.zoom = 1.0;
        engine.cam.w = engine.viewW || 1280;
        engine.cam.h = engine.viewH || 600;
        const cc = engine.buildings.find(b => b.team === 0 && b.hp > 0);
        if (cc) {
          centerCameraOn(cc.x, cc.y);
        }
        return;
      }

      // Phase 3 SYS-19: Control Groups (0..9) + Double-Tap Camera Snap
      if (/^[0-9]$/.test(e.key)) {
        const grp = e.key;
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          engine.bindControlGroup(grp);
          updateControlGroupBar(true);
        } else {
          const now = performance.now();
          const isDoubleTap = (lastGroupTapKey === grp && now - lastGroupTapTime < 340);
          lastGroupTapKey = grp;
          lastGroupTapTime = now;
          engine.selectControlGroup(grp, isDoubleTap);
          refreshCommandBar();
        }
        return;
      }

      // Phase 4 SYS-25: F5 Quick Save
      if (e.key === 'F5') {
        e.preventDefault();
        quickSave();
        return;
      }

      const k = e.key.toUpperCase();
      if (k === 'P') {
        toggleGeneralsPowersModal();
        return;
      }
      if (k === 'B') {
        document.getElementById('btn-select-builder').click();
        return;
      }
      if (k === 'M') {
        const musicBtn = document.getElementById('btn-toggle-music');
        if (musicBtn) musicBtn.click();
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        engine.jumpToLastAlert();
        return;
      }

      // Phase 3 SYS-19: Combat unit tactical hotkeys (G = Guard, X = Scatter, S = Stop, A = Attack-Move)
      const selectedUnits = engine.units.filter(u => engine.selectedIds.has(u.id) && u.team === 0);
      const hasBuilder = selectedUnits.some(u => u.def.isBuilder);
      if (selectedUnits.length > 0 && !hasBuilder) {
        if (k === 'G') {
          engine.orderGuardSelected();
          return;
        }
        if (k === 'X') {
          engine.orderScatterSelected();
          return;
        }
        if (k === 'S') {
          issueStopToSelected();
          return;
        }
        if (k === 'A') {
          engine.commandMode = 'ATTACK_MOVE';
          refreshCommandBar();
          showTacticalAlert('ATTACK-MOVE [A]: Click destination to assault along path.', '#fde047');
          return;
        }
      }

      // Trigger matching Command Card hotkey button
      const cmdBtn = document.querySelector(`.cmd-card-btn[data-hotkey="${k}"]`);
      if (cmdBtn && !cmdBtn.disabled) {
        cmdBtn.click();
      }
    });

    window.addEventListener('keyup', e => {
      keys[e.key.toLowerCase()] = false;
      if (e.key === 'Alt' && engine) {
        engine.showAllHealthBars = settings.healthBars === 'ALWAYS';
      }
    });
  }

  function handleCameraPan(dt) {
    if (!engine || !engine.running) return;
    const panSpeed = 720 * dt;
    if (keys['arrowleft'] || (keys['a'] && engine.selectedIds.size === 0)) {
      engine.cam.x = Math.max(0, engine.cam.x - panSpeed);
    }
    if (keys['arrowright'] || (keys['d'] && engine.selectedIds.size === 0)) {
      engine.cam.x = Math.min(engine.worldSize - engine.cam.w, engine.cam.x + panSpeed);
    }
    if (keys['arrowup'] || (keys['w'] && engine.selectedIds.size === 0)) {
      engine.cam.y = Math.max(0, engine.cam.y - panSpeed);
    }
    if (keys['arrowdown'] || (keys['s'] && engine.selectedIds.size === 0)) {
      engine.cam.y = Math.min(engine.worldSize - engine.cam.h, engine.cam.y + panSpeed);
    }

    // Window-edge scrolling when enabled in settings
    if (settings.edgeScroll && pointerClient.insideViewport && !isMiddlePanning) {
      const vw = (typeof window !== 'undefined' && window.innerWidth) || 1280;
      const vh = (typeof window !== 'undefined' && window.innerHeight) || 800;
      const margin = 18;
      if (pointerClient.x >= 0 && pointerClient.x <= margin) {
        engine.cam.x = Math.max(0, engine.cam.x - panSpeed);
      } else if (pointerClient.x >= vw - margin && pointerClient.x <= vw) {
        engine.cam.x = Math.min(engine.worldSize - engine.cam.w, engine.cam.x + panSpeed);
      }
      if (pointerClient.y >= 0 && pointerClient.y <= margin) {
        engine.cam.y = Math.max(0, engine.cam.y - panSpeed);
      } else if (pointerClient.y >= vh - margin && pointerClient.y <= vh) {
        engine.cam.y = Math.min(engine.worldSize - engine.cam.h, engine.cam.y + panSpeed);
      }
    }
  }

  function centerCameraOn(wx, wy) {
    if (!engine) return;
    engine.cam.x = Math.max(0, Math.min(engine.worldSize - engine.cam.w, wx - engine.cam.w / 2));
    engine.cam.y = Math.max(0, Math.min(engine.worldSize - engine.cam.h, wy - engine.cam.h / 2));
  }

  function issueStopToSelected() {
    for (const u of engine.units) {
      if (engine.selectedIds.has(u.id)) {
        u.state = 'IDLE';
        u.path = null;
        u.waypoints = [];
        u.targetEntityId = null;
      }
    }
    ZH_AUDIO.playSFX('click');
  }

  // ==========================================================================
  // Alerts, Alert Log, Taunts & Victory/Defeat Handling
  // ==========================================================================
  let alertTimeout = null;
  function showTacticalAlert(msg, color = '#38bdf8', worldPos = null) {
    const banner = document.getElementById('tactical-alert');
    banner.textContent = msg;
    banner.style.borderColor = color;
    banner.style.color = color;
    banner.classList.remove('hidden');
    clearTimeout(alertTimeout);
    alertTimeout = setTimeout(() => banner.classList.add('hidden'), 4500);

    const pos = worldPos || (engine && engine.lastAlertPos ? { x: engine.lastAlertPos.x, y: engine.lastAlertPos.y } : null);
    alertHistory.unshift({
      msg,
      color,
      pos,
      time: engine ? Math.floor(engine.matchTime || 0) : 0
    });
    if (alertHistory.length > 4) alertHistory.length = 4;
    renderAlertLog();
  }

  function renderAlertLog() {
    const logEl = document.getElementById('alert-log');
    if (!logEl) return;
    logEl.innerHTML = '';
    alertHistory.forEach(item => {
      const row = document.createElement('div');
      row.className = 'alert-log-item';
      row.style.borderLeftColor = item.color || '#38bdf8';
      row.textContent = item.msg;
      row.title = 'Click to center camera on alert coordinates [Space]';
      row.addEventListener('click', () => {
        if (item.pos) {
          centerCameraOn(item.pos.x, item.pos.y);
        } else if (engine) {
          engine.jumpToLastAlert();
        }
      });
      logEl.appendChild(row);
    });
  }

  let tauntTimeout = null;
  function showGeneralTaunt(generalDef, text) {
    const box = document.getElementById('general-taunt-box');
    document.getElementById('taunt-general-name').textContent =
      `${generalDef.badge} ${generalDef.name} (${generalDef.title})`;
    document.getElementById('taunt-general-text').textContent = `"${text}"`;
    box.classList.remove('hidden');
    clearTimeout(tauntTimeout);
    tauntTimeout = setTimeout(() => box.classList.add('hidden'), 7000);
  }

  function handleGameOver(winnerTeam) {
    const modal = document.getElementById('victory-modal');
    const title = document.getElementById('victory-title');
    const sub = document.getElementById('victory-subtitle');
    const nextBtn = document.getElementById('btn-next-challenge');
    const statsWrap = document.getElementById('gameover-stats');

    modal.classList.remove('hidden');
    if (winnerTeam === 0) {
      title.textContent = '⭐ VICTORY — GENERAL DEFEATED! ⭐';
      title.style.color = '#22c55e';
      const defeatedGen = engine.teams[1].general;
      sub.textContent = `You have crushed ${defeatedGen.name} (${defeatedGen.title}) on ${engine.mapDef.name}!`;
      if (selectedMode === 'CHALLENGE') {
        challengeStageIndex++;
        renderChallengeLadder();
        nextBtn.textContent = 'NEXT CHALLENGER IN GAUNTLET ▶';
      } else {
        nextBtn.textContent = 'PLAY ANOTHER SKIRMISH ▶';
      }
    } else {
      title.textContent = '💀 DEFEAT — COMMAND CENTER LOST 💀';
      title.style.color = '#ef4444';
      sub.textContent = `${engine.teams[1].general.name}'s forces overwhelmed your perimeter.`;
      nextBtn.textContent = 'RETRY OPERATION ↻';
    }

    if (statsWrap && engine && engine.teams[0] && engine.teams[1]) {
      const p0 = engine.teams[0];
      const p1 = engine.teams[1];
      const s0 = p0.stats || {};
      const s1 = p1.stats || {};
      statsWrap.innerHTML = `
        <table class="gameover-stats-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th>${p0.general.badge} ${p0.general.name}</th>
              <th>${p1.general.badge} ${p1.general.name}</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Units Produced</td><td>${s0.unitsProduced || 0}</td><td>${s1.unitsProduced || 0}</td></tr>
            <tr><td>Units Lost</td><td>${s0.unitsLost || 0}</td><td>${s1.unitsLost || 0}</td></tr>
            <tr><td>Structures Built</td><td>${s0.buildingsBuilt || 0}</td><td>${s1.buildingsBuilt || 0}</td></tr>
            <tr><td>Structures Destroyed</td><td>${s0.buildingsDestroyed || 0}</td><td>${s1.buildingsDestroyed || 0}</td></tr>
            <tr><td>Credits Collected</td><td>$${Math.floor(s0.creditsCollected || 0).toLocaleString()}</td><td>$${Math.floor(s1.creditsCollected || 0).toLocaleString()}</td></tr>
            <tr><td>Generals Powers Cast</td><td>${s0.powersUsed || 0}</td><td>${s1.powersUsed || 0}</td></tr>
          </tbody>
        </table>
      `;
    }

    nextBtn.onclick = () => {
      startNewMatch();
    };
  }

  window.ZH_UI = {
    init,
    startNewMatch,
    refreshCommandBar,
    updateHudLive,
    issueRightClickOrder,
    quickSave,
    quickLoad,
    exportSaveFile,
    importSaveFile,
    getEngine: () => engine
  };

  window.addEventListener('DOMContentLoaded', init);
})();
