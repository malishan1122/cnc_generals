// ============================================================================
// Command & Conquer: Generals – Zero Hour (macOS Clean-Room Edition)
// js/ui.js — Phase 2 Tactical HUD, Command Card, Active Abilities, Garrison UI
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

  // Input state
  const keys = {};
  let isDraggingBox = false;
  let dragStartScreen = { x: 0, y: 0 };
  let dragCurrentScreen = { x: 0, y: 0 };
  let lastClickTime = 0;
  let lastClickedDefId = null;

  function init() {
    const canvas = document.getElementById('game-canvas');
    const minimap = document.getElementById('minimap-canvas');
    engine = new ZH_ENGINE.GameEngine(canvas, minimap);

    engine.onAlert = showTacticalAlert;
    engine.onTaunt = showGeneralTaunt;
    engine.onStateChange = refreshCommandBar;
    engine.onGameOver = handleGameOver;

    resizeCanvases();
    window.addEventListener('resize', resizeCanvases);

    setupStartScreen();
    setupHUDButtons();
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
      if (engine.running) {
        engine.stepFixed(dt);
        if (window.ZH_SIMULATOR && ZH_SIMULATOR.update) {
          ZH_SIMULATOR.update(dt * (engine.gameSpeed || 1));
        }
        engine.render();
        renderSelectionBox();
        updateTopBarAndTimers();
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function resizeCanvases() {
    const canvas = document.getElementById('game-canvas');
    const hudHeight = 192;
    canvas.width = window.innerWidth;
    canvas.height = Math.max(360, window.innerHeight - hudHeight);
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
        ZH_AUDIO.playSFX('click');
      });
    });

    renderGeneralCards('player-general-grid', true);
    renderGeneralCards('ai-general-grid', false);
    renderChallengeLadder();
    renderMapAndDiffSelectors();

    document.getElementById('btn-launch-operation').addEventListener('click', () => {
      ZH_AUDIO.playSFX('promote');
      startNewMatch();
    });
  }

  function renderGeneralCards(containerId, isPlayer) {
    const container = document.getElementById(containerId);
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
        ZH_AUDIO.playSFX('click');
      });

      container.appendChild(card);
    });
  }

  function renderChallengeLadder() {
    const wrap = document.getElementById('challenge-ladder-preview');
    const ladder = ZH_DATA.CHALLENGE_LADDER.filter(id => id !== selectedPlayerGeneralId);
    const currentOpponentId = ladder[challengeStageIndex % ladder.length];
    selectedAiGeneralId = currentOpponentId;

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
    mapSel.innerHTML = ZH_DATA.MAPS.map(m =>
      `<option value="${m.id}">${m.name} — ${m.subtitle}</option>`
    ).join('');
    mapSel.addEventListener('change', (e) => {
      selectedMapId = e.target.value;
    });

    const diffBtns = document.querySelectorAll('.diff-btn');
    diffBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        diffBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedDifficulty = btn.dataset.diff;
        ZH_AUDIO.playSFX('click');
      });
    });
  }

  function startNewMatch() {
    if (!engine) {
      const canvas = document.getElementById('game-canvas');
      const minimap = document.getElementById('minimap-canvas');
      engine = new ZH_ENGINE.GameEngine(canvas, minimap);
      engine.onAlert = showTacticalAlert;
      engine.onTaunt = showGeneralTaunt;
      engine.onStateChange = refreshCommandBar;
      engine.onGameOver = handleGameOver;
    }

    if (selectedMode === 'CHALLENGE') {
      const ladder = ZH_DATA.CHALLENGE_LADDER.filter(id => id !== selectedPlayerGeneralId);
      selectedAiGeneralId = ladder[challengeStageIndex % ladder.length];
    }

    document.getElementById('start-modal').classList.add('hidden');
    document.getElementById('victory-modal').classList.add('hidden');

    engine.initMatch({
      mode: selectedMode,
      challengeIndex: challengeStageIndex,
      playerGeneralId: selectedPlayerGeneralId,
      aiGeneralId: selectedAiGeneralId,
      mapId: selectedMapId,
      difficulty: selectedDifficulty
    });

    if (window.ZH_SIMULATOR && ZH_SIMULATOR.attachEngine) {
      ZH_SIMULATOR.attachEngine(engine, window.ZH_AI);
    }

    // Phase 3 SYS-20: Apply authentic faction-skinned HUD theme
    document.body.classList.remove('hud-theme-usa', 'hud-theme-china', 'hud-theme-gla');
    if (engine.teams[0] && engine.teams[0].factionId) {
      document.body.classList.add(`hud-theme-${engine.teams[0].factionId.toLowerCase()}`);
    }

    refreshCommandBar();
    updateTopBarAndTimers();
  }

  // ==========================================================================
  // HUD Buttons & Generals Powers Modal
  // ==========================================================================
  function setupHUDButtons() {
    document.getElementById('btn-generals-powers').addEventListener('click', () => {
      toggleGeneralsPowersModal();
    });

    document.getElementById('btn-close-powers').addEventListener('click', () => {
      document.getElementById('powers-modal').classList.add('hidden');
    });

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
      document.getElementById('start-modal').classList.remove('hidden');
    });

    // Phase 3 SYS-19: Stance & Tactical Order Bar (Attack-Move, Guard, Stop, Scatter)
    document.getElementById('btn-order-attack-move').addEventListener('click', () => {
      if (!engine || engine.selectedIds.size === 0) return;
      engine.commandMode = 'ATTACK_MOVE';
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
    if (!engine) return false;
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
    if (!engine) return false;
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
    const powers = ZH_DATA.GENERALS_POWERS[team.factionId] || [];
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
          });
        }
      }

      actionWrap.appendChild(btn);
      list.appendChild(card);
    });
  }

  // ==========================================================================
  // Top Bar, Superweapon Timers & Command Card Rendering
  // ==========================================================================
  function updateTopBarAndTimers() {
    const pTeam = engine.teams[0];
    const aiTeam = engine.teams[1];
    if (!pTeam || !aiTeam) return;

    document.getElementById('hud-faction-badge').textContent =
      `${pTeam.general.badge} ${pTeam.general.name}`;
    document.getElementById('hud-credits').textContent = `$${Math.floor(pTeam.credits).toLocaleString()}`;

    const pwrEl = document.getElementById('hud-power');
    if (!pTeam.faction.usesPower) {
      pwrEl.textContent = '⚡ GLA: NO POWER NEEDED';
      pwrEl.style.color = '#eab308';
    } else {
      pwrEl.textContent = `⚡ ${pTeam.powerConsumed} / ${pTeam.powerProduced}`;
      pwrEl.style.color = pTeam.isLowPower ? '#ef4444' : '#22c55e';
    }

    const rankObj = ZH_DATA.GENERAL_RANKS[pTeam.rank - 1];
    const nextRankObj = ZH_DATA.GENERAL_RANKS[pTeam.rank];
    const xpText = nextRankObj ? `${pTeam.xp}/${nextRankObj.xpReq} XP` : 'MAX RANK';
    document.getElementById('hud-rank').textContent =
      `★ Rank ${pTeam.rank} (${xpText})`;

    const pBtn = document.getElementById('btn-generals-powers');
    pBtn.textContent = `⚡ Generals Powers [P] (${pTeam.generalPoints} Pt)`;
    if (pTeam.generalPoints > 0) {
      pBtn.classList.add('pulse-glow');
    } else {
      pBtn.classList.remove('pulse-glow');
    }

    // GLA Tunnel Network HUD indicator
    const tunnelHud = document.getElementById('hud-tunnel-status');
    if (pTeam.factionId === 'GLA') {
      tunnelHud.style.display = 'inline-flex';
      tunnelHud.textContent = `🕳️ Tunnel Garrison: ${pTeam.tunnelUnits.length}/10`;
    } else {
      tunnelHud.style.display = 'none';
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
    swPanel.innerHTML = swHtml.join('');
  }

  function refreshCommandBar() {
    if (!engine || !engine.running) return;
    const inspectorTitle = document.getElementById('inspector-title');
    const inspectorSub = document.getElementById('inspector-subtitle');
    const inspectorStats = document.getElementById('inspector-stats');
    const queueStrip = document.getElementById('inspector-queue');
    const cmdGrid = document.getElementById('command-card-grid');

    cmdGrid.innerHTML = '';
    queueStrip.innerHTML = '';

    const selectedUnits = engine.units.filter(u => engine.selectedIds.has(u.id));
    const selectedBuildings = engine.buildings.filter(b => engine.selectedIds.has(b.id));
    const selectedBunkers = (engine.garrisonBunkers || []).filter(g => engine.selectedIds.has(g.id));

    if (selectedUnits.length === 0 && selectedBuildings.length === 0 && selectedBunkers.length === 0) {
      inspectorTitle.textContent = 'No Tactical Selection';
      inspectorSub.textContent = 'Left-click or drag a box to select units/structures. Press [B] for Dozer/Worker.';
      inspectorStats.innerHTML = '';
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
          cost: `${g.occupants.length} INF`,
          tooltip: 'Evacuate all garrisoned infantry back onto the street [E].',
          onClick: () => {
            engine.evacuateGarrison(g);
            refreshCommandBar();
          }
        });
      }
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
          createCommandButton(cmdGrid, {
            hotkey: hotkeys[buildSlotIdx++] || '',
            title: bDef.shortName,
            cost: `$${cost}`,
            tooltip: `${bDef.name} ($${cost}) — ${bDef.description}`,
            disabled: !unlocked,
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
        const alreadyInstalled = ab.targetType === 'SELF_ADDON' && hasAddonInstalled;
        if (!alreadyInstalled) {
          createCommandButton(cmdGrid, {
            hotkey: ab.hotkey || 'F',
            title: ab.shortName,
            cost: cd > 0 ? `${cd}s CD` : ab.cost ? `$${ab.cost}` : 'READY [F]',
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
            hotkey: 'R',
            title: gatAb.shortName,
            cost: `$${gatAb.cost}`,
            tooltip: `${gatAb.name} — ${gatAb.desc}`,
            onClick: () => {
              engine.triggerUnitAbility(primary, 'OVERLORD_GATLING', primary.x, primary.y, null);
              refreshCommandBar();
            }
          });
        }
      }
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

    // Show Production Queue
    if (b.queue.length > 0) {
      queueStrip.innerHTML = b.queue.map((q, idx) => {
        const pct = idx === 0 ? Math.round((1 - q.timer / q.totalTime) * 100) : 0;
        return `<span class="queue-pill">${q.name} ${idx === 0 ? pct + '%' : ''}</span>`;
      }).join('');
    }

    if (b.team !== 0 || !b.constructed) return;

    const hotkeys = ['Q', 'W', 'E', 'R', 'A', 'S', 'D', 'F', 'Z', 'X', 'C', 'V'];
    let slotIdx = 0;

    // 1. Trainable Units (Phase 3 SYS-20: Cameo queue badges + right-click cancel/refund)
    if (b.def.trains) {
      b.def.trains.forEach(uId => {
        const uDef = ZH_DATA.UNITS[uId];
        if (!uDef) return;
        if (uDef.generalOnly && uDef.generalOnly !== engine.teams[0].generalId) return;
        const unlocked = engine.isEntityUnlocked(uId, 0);
        const cost = engine.getModifiedCost(uId, 0);
        const qCount = b.queue.filter(q => q.id === uId).length;
        const progPct = (b.queue[0] && b.queue[0].id === uId)
          ? Math.round((1 - b.queue[0].timer / b.queue[0].totalTime) * 100)
          : 0;
        createCommandButton(cmdGrid, {
          hotkey: hotkeys[slotIdx++] || '',
          title: uDef.shortName,
          cost: `$${cost}`,
          tooltip: `${uDef.name} ($${cost}) — ${uDef.description} [Right-Click to Cancel/Refund]`,
          disabled: !unlocked,
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
        const qCount = b.queue.filter(q => q.id === upgId).length;
        const progPct = (b.queue[0] && b.queue[0].id === upgId)
          ? Math.round((1 - b.queue[0].timer / b.queue[0].totalTime) * 100)
          : 0;
        createCommandButton(cmdGrid, {
          hotkey: hotkeys[slotIdx++] || '',
          title: upg.shortName,
          cost: owned ? 'OWNED' : `$${upg.cost}`,
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
        cost: b.overcharged ? 'ACTIVE' : '+50% PWR',
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
  }

  function createCommandButton(container, cfg) {
    const btn = document.createElement('button');
    btn.className = `cmd-card-btn ${cfg.disabled ? 'disabled' : ''}`;
    btn.title = cfg.tooltip || '';
    btn.dataset.hotkey = cfg.hotkey || '';
    btn.innerHTML = `
      <span class="cmd-hotkey">${cfg.hotkey || ''}</span>
      ${cfg.queueCount > 0 ? `<span class="cmd-queue-badge">x${cfg.queueCount}</span>` : ''}
      <span class="cmd-title">${cfg.title}</span>
      <span class="cmd-cost">${cfg.lockedText || cfg.cost}</span>
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
    container.appendChild(btn);
  }

  // ==========================================================================
  // Canvas & Minimap Mouse Input
  // ==========================================================================
  function setupCanvasInput(canvas, minimap) {
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    minimap.addEventListener('contextmenu', e => e.preventDefault());

    canvas.addEventListener('mousemove', e => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      dragCurrentScreen = { x: sx, y: sy };
      if (engine) {
        engine.mouseWorld.x = sx + engine.cam.x;
        engine.mouseWorld.y = sy + engine.cam.y;
      }
    });

    canvas.addEventListener('mousedown', e => {
      if (!engine || !engine.running) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const wx = sx + engine.cam.x;
      const wy = sy + engine.cam.y;

      // Left-Click (Button 0)
      if (e.button === 0) {
        // 1. Handle active Command Mode (BUILD, POWER, SUPERWEAPON, ABILITY, ATTACK_MOVE, GUARD)
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
          return;
        }
        if (engine.commandMode === 'GUARD') {
          engine.orderGuardSelected(wx, wy);
          engine.commandMode = null;
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
      if (!isDraggingBox || e.button !== 0) return;
      isDraggingBox = false;
      if (!engine || !engine.running) return;

      const dx = Math.abs(dragCurrentScreen.x - dragStartScreen.x);
      const dy = Math.abs(dragCurrentScreen.y - dragStartScreen.y);

      if (dx < 6 && dy < 6) {
        handleSingleClickSelection(
          dragCurrentScreen.x + engine.cam.x,
          dragCurrentScreen.y + engine.cam.y,
          e.shiftKey
        );
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
    const x0 = Math.min(dragStartScreen.x, dragCurrentScreen.x) + engine.cam.x;
    const x1 = Math.max(dragStartScreen.x, dragCurrentScreen.x) + engine.cam.x;
    const y0 = Math.min(dragStartScreen.y, dragCurrentScreen.y) + engine.cam.y;
    const y1 = Math.max(dragStartScreen.y, dragCurrentScreen.y) + engine.cam.y;

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
    engine.spawnBurst(wx, wy, forceAttackMove ? '#ef4444' : '#22c55e', 6);
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
      if (!engine || !engine.running) return;

      // Escape cancels placement/targeting
      if (e.key === 'Escape') {
        engine.commandMode = null;
        engine.pendingBuildId = null;
        engine.pendingPowerId = null;
        engine.pendingAbilityId = null;
        document.getElementById('powers-modal').classList.add('hidden');
        return;
      }

      // Phase 3 SYS-19: Control Groups (0..9) + Double-Tap Camera Snap
      if (/^[0-9]$/.test(e.key)) {
        const grp = e.key;
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          engine.bindControlGroup(grp);
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

      // Phase 4 SYS-25: F5 Quick Save & F9 Quick Load
      if (e.key === 'F5') {
        e.preventDefault();
        quickSave();
        return;
      }
      if (e.key === 'F9') {
        e.preventDefault();
        quickLoad();
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
  // Alerts, Taunts & Victory/Defeat Handling
  // ==========================================================================
  let alertTimeout = null;
  function showTacticalAlert(msg, color = '#38bdf8') {
    const banner = document.getElementById('tactical-alert');
    banner.textContent = msg;
    banner.style.borderColor = color;
    banner.style.color = color;
    banner.classList.remove('hidden');
    clearTimeout(alertTimeout);
    alertTimeout = setTimeout(() => banner.classList.add('hidden'), 4500);
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

    nextBtn.onclick = () => {
      startNewMatch();
    };
  }

  window.ZH_UI = {
    init,
    startNewMatch,
    refreshCommandBar,
    issueRightClickOrder,
    quickSave,
    quickLoad,
    exportSaveFile,
    importSaveFile,
    getEngine: () => engine
  };

  window.addEventListener('DOMContentLoaded', init);
})();
