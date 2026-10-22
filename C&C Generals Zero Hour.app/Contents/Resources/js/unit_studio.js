// ============================================================================
// Command & Conquer: Generals – Zero Hour (macOS Clean-Room Edition)
// js/unit_studio.js — Interactive 3D/2.5D Unit Design Studio & Workbench
// ============================================================================

window.ZH_UNIT_STUDIO = (function () {
  'use strict';

  let isStudioOpen = false;
  let selectedUnitId = 'USA_DOZER';
  let activeFactionFilter = 'ALL';
  let activeInspectorTab = 'ALL'; // 'ALL' | 'GEOMETRY' | 'COLORS' | 'DETAILS'
  let searchQuery = '';

  // Camera & Turntable state
  // Default angle 2.42 rad (~139 deg) faces down-left, matching the C&C Untitled M1A9 Crusader, Tomahawk & Dozer reference renders!
  let viewMode = 'ISO_3D'; // 'ISO_3D' | 'REF_COMPARE' | 'SPLIT_COMPARE' | 'TACTICAL_25D' | 'TOP_ORTHO'
  let backdropMode = 'DIORAMA_CREAM'; // 'DIORAMA_CREAM' | 'UNTITLED_BLUE' | 'DESERT' | 'GRID_DARK' | 'GRASS'
  let zoomLevel = 4.6;
  let hullDeg = 139;
  let turretRelDeg = 0;
  let cameraPitch = 0.64;
  let cameraZScale = 0.78;

  // Interactive animation toggles
  let autoSpin = false;
  let mouseAimTurret = false;
  let driveTracks = true;
  let treadPhase = 0;
  let recoilOffset = 0;
  let damageState = 'PRISTINE'; // 'PRISTINE' | 'DAMAGED' | 'CRITICAL' | 'UNMANNED'
  let studioProjectiles = [];
  let studioParticles = [];

  // Pointer drag state on main canvas
  let isDraggingOrbit = false;
  let dragLastX = 0;
  let dragLastY = 0;

  // Reference image cache
  const refImages = {};
  const customRefDataUrls = {};

  function getRefImage(src) {
    if (!src || typeof Image === 'undefined') return null;
    if (refImages[src]) return refImages[src];
    const img = new Image();
    img.src = src;
    refImages[src] = img;
    return img;
  }

  function setViewMode(mode) {
    viewMode = mode || 'ISO_3D';
    const viewSel = document.getElementById('studio-view-mode');
    if (viewSel) viewSel.value = viewMode;

    const modePills = document.querySelectorAll('.studio-mode-pill[data-view-mode]');
    for (const pill of modePills) {
      pill.classList.toggle('active', pill.getAttribute('data-view-mode') === viewMode);
    }

    const compareRefBtn = document.getElementById('btn-studio-compare-ref');
    if (compareRefBtn) {
      compareRefBtn.classList.toggle('active', viewMode === 'REF_COMPARE');
      compareRefBtn.textContent = viewMode === 'REF_COMPARE' ? '✓ Split Active' : '🔀 Split View';
    }
  }

  function syncAngleSnapButtons() {
    const snapBtns = document.querySelectorAll('.studio-snap-btn[data-snap-yaw]');
    const roundedYaw = ((Math.round(hullDeg) % 360) + 360) % 360;
    for (const btn of snapBtns) {
      const targetYaw = parseInt(btn.getAttribute('data-snap-yaw'), 10);
      btn.classList.toggle('active', Math.abs(roundedYaw - targetYaw) <= 2);
    }
  }

  // ==========================================================================
  // 1. Studio Initialization & Modal Lifecycle
  // ==========================================================================
  function initStudio() {
    const modal = document.getElementById('unit-studio-modal');
    if (!modal) return;

    bindStudioToolbarEvents();
    bindMainCanvasEvents();
    renderRosterSidebar();
    selectUnit(selectedUnitId);

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => {
        if (isStudioOpen) resizeStudioCanvases();
      });
    }

    // Check if ?studio=1 or ?unit=UNIT_ID query param is present
    try {
      if (typeof window !== 'undefined' && window.location && typeof window.location.search === 'string') {
        const params = new URLSearchParams(window.location.search);
        const requestedUnit = params.get('unit') || 'USA_DOZER';
        if (params.get('studio') === '1' || window.location.search.indexOf('studio=1') !== -1) {
          openStudio(requestedUnit);
        }
      }
    } catch (_) {}

    let lastNow = performance.now();
    function studioLoop(now) {
      requestAnimationFrame(studioLoop);
      if (!isStudioOpen) return;
      const dt = Math.min(0.1, Math.max(0, (now - lastNow) / 1000));
      lastNow = now;
      stepStudioSimulation(dt);
      renderMainShowroomCanvas();
      renderSquadPreviewCanvas();
    }
    requestAnimationFrame(studioLoop);
  }

  function resolveStudioEntityDef(defId) {
    if (!window.ZH_DATA || !defId) return null;
    if (window.ZH_DATA.UNITS && window.ZH_DATA.UNITS[defId]) {
      return window.ZH_DATA.UNITS[defId];
    }
    if (window.ZH_DATA.BUILDINGS && window.ZH_DATA.BUILDINGS[defId]) {
      const b = window.ZH_DATA.BUILDINGS[defId];
      return Object.assign({}, b, {
        category: b.isSuperweapon ? 'SUPERWEAPON' : b.isDefense ? 'DEFENSE' : 'BUILDING',
        radius: Math.round((b.size || 72) * 0.34),
        speed: 0
      });
    }
    if (window.ZH_DATA.TECH_BUILDINGS && window.ZH_DATA.TECH_BUILDINGS[defId]) {
      const tb = window.ZH_DATA.TECH_BUILDINGS[defId];
      return Object.assign({}, tb, {
        faction: 'USA',
        category: 'TECH_BUILDING',
        cost: 0,
        radius: Math.round((tb.size || 62) * 0.34),
        speed: 0
      });
    }
    return null;
  }

  function openStudio(unitId) {
    const modal = document.getElementById('unit-studio-modal');
    if (!modal) return;

    if (unitId && resolveStudioEntityDef(unitId)) {
      selectedUnitId = unitId;
    }

    // Hide other modals cleanly so only 1 modal is active
    for (const id of ['start-modal', 'game-menu-modal', 'powers-modal', 'victory-modal']) {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    }

    modal.classList.remove('hidden');
    isStudioOpen = true;

    renderRosterSidebar();
    selectUnit(selectedUnitId);
    resizeStudioCanvases();
  }

  function closeStudio() {
    const modal = document.getElementById('unit-studio-modal');
    if (modal) modal.classList.add('hidden');
    isStudioOpen = false;

    // If no match is currently running, restore the Start Modal
    const startModal = document.getElementById('start-modal');
    const isRunning = window.ZH_UI && typeof window.ZH_UI.isMatchRunning === 'function'
      ? window.ZH_UI.isMatchRunning()
      : false;
    if (!isRunning && startModal) {
      startModal.classList.remove('hidden');
    }
  }

  function resizeStudioCanvases() {
    const mainCanvas = document.getElementById('studio-main-canvas');
    if (mainCanvas && mainCanvas.parentElement) {
      const rect = mainCanvas.parentElement.getBoundingClientRect();
      const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
      const w = Math.max(460, Math.floor(rect.width || 680));
      const h = Math.max(260, Math.floor(rect.height || 360));
      mainCanvas.width = Math.round(w * dpr);
      mainCanvas.height = Math.round(h * dpr);
    }

    const squadCanvas = document.getElementById('studio-squad-canvas');
    if (squadCanvas && squadCanvas.parentElement) {
      const rect = squadCanvas.parentElement.getBoundingClientRect();
      const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
      const w = Math.max(280, Math.floor(rect.width || 340));
      const h = Math.max(92, Math.floor(rect.height || 104));
      squadCanvas.width = Math.round(w * dpr);
      squadCanvas.height = Math.round(h * dpr);
    }
  }

  // ==========================================================================
  // 2. Unit & Building Roster Sidebar (Full 93-Asset Upgrade Workflow)
  // ==========================================================================
  function getAllUnitsList() {
    if (!window.ZH_DATA) return [];
    const units = Object.values(window.ZH_DATA.UNITS || {});
    const buildings = Object.values(window.ZH_DATA.BUILDINGS || {}).map((b) => resolveStudioEntityDef(b.id));
    const techBuildings = Object.values(window.ZH_DATA.TECH_BUILDINGS || {}).map((tb) => resolveStudioEntityDef(tb.id));
    return units.concat(buildings, techBuildings).filter(Boolean);
  }

  function getFilteredUnitsList() {
    const allUnits = getAllUnitsList();
    const filtered = allUnits.filter((u) => {
      if (activeFactionFilter === 'BESPOKE') {
        if (!window.ZH_UNIT_MODELS || !window.ZH_UNIT_MODELS.hasBespokeModel(u.id)) return false;
      } else if (activeFactionFilter !== 'ALL' && u.faction !== activeFactionFilter) {
        return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchName = (u.name || '').toLowerCase().includes(q);
        const matchId = (u.id || '').toLowerCase().includes(q);
        const matchCat = (u.category || '').toLowerCase().includes(q);
        if (!matchName && !matchId && !matchCat) return false;
      }
      return true;
    });

    // Sort so Bespoke HD units appear first, keeping USA_DOZER, USA_TOMAHAWK and USA_CRUSADER at top
    const topPriority = { USA_DOZER: 3, USA_TOMAHAWK: 2, USA_CRUSADER: 1 };
    filtered.sort((a, b) => {
      const aTop = topPriority[a.id] || 0;
      const bTop = topPriority[b.id] || 0;
      if (aTop !== bTop) return bTop - aTop;
      const aBespoke = window.ZH_UNIT_MODELS && window.ZH_UNIT_MODELS.hasBespokeModel(a.id) ? 1 : 0;
      const bBespoke = window.ZH_UNIT_MODELS && window.ZH_UNIT_MODELS.hasBespokeModel(b.id) ? 1 : 0;
      if (aBespoke !== bBespoke) return bBespoke - aBespoke;
      return 0;
    });
    return filtered;
  }

  function stepSelectedUnit(delta) {
    const list = getFilteredUnitsList();
    const pool = list.length > 0 ? list : getAllUnitsList();
    if (pool.length === 0) return;
    const idx = pool.findIndex((u) => u.id === selectedUnitId);
    const nextIdx = idx === -1 ? 0 : (idx + delta + pool.length) % pool.length;
    selectUnit(pool[nextIdx].id);
  }

  function renderRosterSidebar() {
    const listEl = document.getElementById('studio-unit-list');
    const progEl = document.getElementById('studio-upgrade-progress');
    const progBarEl = document.getElementById('studio-upgrade-bar');
    if (!listEl) return;

    const allUnits = getAllUnitsList();
    const bespokeCount = allUnits.filter(
      (u) => window.ZH_UNIT_MODELS && window.ZH_UNIT_MODELS.hasBespokeModel(u.id)
    ).length;

    if (progEl) {
      progEl.textContent = `${bespokeCount} / ${allUnits.length} Assets Upgraded (HD 3D)`;
    }
    if (progBarEl && allUnits.length > 0) {
      const pct = Math.max(6, Math.round((bespokeCount / allUnits.length) * 100));
      progBarEl.style.width = `${pct}%`;
    }

    const filtered = getFilteredUnitsList();

    listEl.innerHTML = '';
    for (const u of filtered) {
      const isBespoke = window.ZH_UNIT_MODELS && window.ZH_UNIT_MODELS.hasBespokeModel(u.id);
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `studio-roster-item ${u.id === selectedUnitId ? 'active' : ''} ${isBespoke ? 'is-bespoke' : ''}`;
      const icon = (window.ZH_DATA && window.ZH_DATA.CAMEO_ICONS && window.ZH_DATA.CAMEO_ICONS[u.id]) || '🏛️';
      const facBadge = u.faction === 'USA' ? '🦅 USA' : u.faction === 'CHINA' ? '🐉 CHN' : '🦂 GLA';

      item.innerHTML = `
        <div class="studio-roster-icon">${icon}</div>
        <div class="studio-roster-info">
          <div class="studio-roster-name">${u.name}</div>
          <div class="studio-roster-meta">${facBadge} • ${u.category} • $${u.cost}</div>
        </div>
        <span class="studio-status-badge ${isBespoke ? 'badge-hd' : 'badge-queue'}">
          ${isBespoke ? '★ HD 3D' : 'QUEUE'}
        </span>
      `;
      item.addEventListener('click', () => selectUnit(u.id));
      listEl.appendChild(item);
    }
  }

  function selectUnit(defId) {
    selectedUnitId = defId;
    renderRosterSidebar();
    renderParameterInspector();
    updateReferenceCard();

    const unitDef = resolveStudioEntityDef(defId);
    const entry = window.ZH_UNIT_MODELS && window.ZH_UNIT_MODELS.getModelEntry(defId);
    const titleEl = document.getElementById('studio-unit-header-title');
    const subEl = document.getElementById('studio-unit-header-sub');
    const statsEl = document.getElementById('studio-unit-stats-strip');
    const fireBtn = document.getElementById('btn-studio-fire');

    if (fireBtn) {
      if (defId.includes('DOZER')) {
        fireBtn.textContent = '🚜 Scoop Blade';
      } else if (defId.includes('TOMAHAWK') || defId.includes('SCUD') || defId.includes('PATRIOT') || defId.includes('STINGER') || defId.includes('SILO')) {
        fireBtn.textContent = '🚀 Launch Missile';
      } else {
        fireBtn.textContent = '💥 Fire Weapon';
      }
    }

    if (titleEl && unitDef) {
      titleEl.textContent = entry ? entry.modelCode : `${unitDef.faction} — ${unitDef.name.toUpperCase()}`;
    }
    if (subEl && unitDef) {
      subEl.textContent = entry
        ? entry.credits
        : `${unitDef.description} • Select or load a reference image below to craft a bespoke 3D rig`;
    }
    if (statsEl && unitDef) {
      const isBespoke = Boolean(entry);
      const wpRange = (unitDef.weapon && unitDef.weapon.range) || 0;
      const wpDmg = (unitDef.weapon && unitDef.weapon.damage) || 0;
      statsEl.innerHTML = `
        <span class="studio-stat-pill ${isBespoke ? 'stat-hd' : 'stat-legacy'}">${isBespoke ? '★ BESPOKE 3D' : 'LEGACY RIG'}</span>
        <span class="studio-stat-pill">COST <strong>$${unitDef.cost}</strong></span>
        <span class="studio-stat-pill">HP <strong>${unitDef.hp}</strong></span>
        <span class="studio-stat-pill">DMG <strong>${wpDmg}</strong></span>
        <span class="studio-stat-pill">RNG <strong>${wpRange}</strong></span>
        <span class="studio-stat-pill">SPD <strong>${unitDef.speed || 0}</strong></span>
      `;
    }
  }

  function getActiveRefSrc() {
    const entry = window.ZH_UNIT_MODELS && window.ZH_UNIT_MODELS.getModelEntry(selectedUnitId);
    return customRefDataUrls[selectedUnitId] || (entry && entry.referenceImage) || 'assets/refs/usa_crusader_diorama_ref.png';
  }

  function updateReferenceCard() {
    const entry = window.ZH_UNIT_MODELS && window.ZH_UNIT_MODELS.getModelEntry(selectedUnitId);
    const refImgEl = document.getElementById('studio-ref-img');
    const refCaptionEl = document.getElementById('studio-ref-caption');
    const refTagsEl = document.getElementById('studio-ref-tags');
    const customUrl = customRefDataUrls[selectedUnitId];
    const refSrc = getActiveRefSrc();

    // Preload into refImages cache for canvas split-view rendering
    getRefImage(refSrc);

    if (refImgEl) {
      refImgEl.src = refSrc;
      refImgEl.style.display = 'block';
    }
    if (refCaptionEl) {
      if (customUrl) {
        refCaptionEl.textContent = `Custom Reference (${selectedUnitId})`;
      } else if (entry) {
        refCaptionEl.textContent = `Ref: ${entry.modelCode}`;
      } else {
        refCaptionEl.textContent = `Reference Slot (${selectedUnitId})`;
      }
    }
    if (refTagsEl && entry && entry.paramSchema) {
      const tags = ['✓ Ligne-Claire #26201b Ink', '✓ Warm Vector-Cel Shading'];
      for (const group of entry.paramSchema) {
        for (const f of group.fields || []) {
          if (f.type === 'checkbox' && tags.length < 5) {
            tags.push(`✓ ${f.label}`);
          }
        }
      }
      refTagsEl.innerHTML = tags.map((t) => `<span>${t}</span>`).join('');
    }
  }

  // ==========================================================================
  // 3. Parametric Design Inspector & Live Controls
  // ==========================================================================
  function matchesInspectorTab(group, groupIdx, tab) {
    if (!tab || tab === 'ALL') return true;
    const title = (group.group || '').toUpperCase();
    if (tab === 'GEOMETRY') {
      return title.includes('GEOMETRY') || title.includes('PROPORTION') || title.includes('HULL') || title.includes('BLADE') || title.includes('CABIN') || groupIdx === 0;
    }
    if (tab === 'COLORS') {
      return title.includes('PALETTE') || title.includes('COLOR') || title.includes('CAMO') || group.fields.some((f) => f.type === 'color');
    }
    if (tab === 'DETAILS') {
      return title.includes('DETAIL') || title.includes('MARKING') || title.includes('PART') || group.fields.some((f) => f.type === 'checkbox');
    }
    return true;
  }

  function renderParameterInspector() {
    const container = document.getElementById('studio-inspector-body');
    const presetSelect = document.getElementById('studio-preset-select');
    if (!container) return;

    const entry = window.ZH_UNIT_MODELS && window.ZH_UNIT_MODELS.getModelEntry(selectedUnitId);

    // Populate Presets dropdown
    if (presetSelect) {
      presetSelect.innerHTML = '';
      if (entry && entry.presets) {
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = '🎨 Load Visual Preset / Camo...';
        presetSelect.appendChild(placeholder);
        for (const [pKey, pObj] of Object.entries(entry.presets)) {
          const opt = document.createElement('option');
          opt.value = pKey;
          opt.textContent = `Preset: ${pObj.name || pObj.label || pKey}`;
          presetSelect.appendChild(opt);
        }
      } else {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'Default Procedural Rig';
        presetSelect.appendChild(opt);
      }
    }

    container.innerHTML = '';

    if (!entry || !entry.paramSchema) {
      const notice = document.createElement('div');
      notice.className = 'studio-legacy-notice';
      notice.innerHTML = `
        <div class="studio-legacy-title">🛠️ Ready for Bespoke 3D Upgrade</div>
        <div class="studio-legacy-desc">
          <strong>${selectedUnitId}</strong> currently uses the baseline procedural rig.
          Load a reference blueprint on the bottom-left or ask to upgrade <strong>${selectedUnitId}</strong> next with bespoke 3D geometry!
        </div>
      `;
      container.appendChild(notice);
      return;
    }

    const currentParams = window.ZH_UNIT_MODELS.getParams(selectedUnitId);
    const defaultParams = entry.defaultParams || {};

    entry.paramSchema.forEach((group, groupIdx) => {
      if (!matchesInspectorTab(group, groupIdx, activeInspectorTab)) return;

      const card = document.createElement('div');
      card.className = 'studio-param-group';

      const header = document.createElement('div');
      header.className = 'studio-param-group-title';
      header.innerHTML = `<span>${group.group}</span><span class="studio-group-hint">dbl-click slider to reset</span>`;
      card.appendChild(header);

      const rangeAndSelectFields = group.fields.filter((f) => f.type === 'range' || f.type === 'select');
      const colorFields = group.fields.filter((f) => f.type === 'color');
      const checkboxFields = group.fields.filter((f) => f.type === 'checkbox');

      // 1. Render range & select fields cleanly
      for (const field of rangeAndSelectFields) {
        const val = currentParams[field.key];
        if (field.type === 'range') {
          const row = document.createElement('div');
          row.className = 'studio-param-row';

          const labelWrap = document.createElement('div');
          labelWrap.className = 'studio-param-label-row';
          const lbl = document.createElement('span');
          lbl.textContent = field.label;
          const valBadge = document.createElement('span');
          valBadge.className = 'studio-param-val';
          valBadge.textContent = Number(val).toFixed(field.step < 0.1 ? 2 : 1);
          labelWrap.appendChild(lbl);
          labelWrap.appendChild(valBadge);

          const input = document.createElement('input');
          input.type = 'range';
          input.min = String(field.min);
          input.max = String(field.max);
          input.step = String(field.step);
          input.value = String(val);
          input.title = 'Double-click to reset parameter to default';
          input.addEventListener('input', () => {
            const num = parseFloat(input.value);
            valBadge.textContent = num.toFixed(field.step < 0.1 ? 2 : 1);
            window.ZH_UNIT_MODELS.setParams(selectedUnitId, { [field.key]: num });
          });
          input.addEventListener('dblclick', () => {
            if (defaultParams[field.key] !== undefined) {
              const defVal = Number(defaultParams[field.key]);
              input.value = String(defVal);
              valBadge.textContent = defVal.toFixed(field.step < 0.1 ? 2 : 1);
              window.ZH_UNIT_MODELS.setParams(selectedUnitId, { [field.key]: defVal });
            }
          });

          row.appendChild(labelWrap);
          row.appendChild(input);
          card.appendChild(row);
        } else if (field.type === 'select') {
          const row = document.createElement('div');
          row.className = 'studio-param-row studio-param-inline';
          const lbl = document.createElement('span');
          lbl.textContent = field.label;
          const sel = document.createElement('select');
          sel.className = 'studio-compact-select';
          for (const opt of field.options) {
            const o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.label;
            if (opt.value === val) o.selected = true;
            sel.appendChild(o);
          }
          sel.addEventListener('change', () => {
            window.ZH_UNIT_MODELS.setParams(selectedUnitId, { [field.key]: sel.value });
          });
          row.appendChild(lbl);
          row.appendChild(sel);
          card.appendChild(row);
        }
      }

      // 2. Render color fields in a compact 2-column swatch grid
      if (colorFields.length > 0) {
        const colorGrid = document.createElement('div');
        colorGrid.className = 'studio-color-grid';
        for (const field of colorFields) {
          const val = String(currentParams[field.key] || '#ffffff');
          const chip = document.createElement('label');
          chip.className = 'studio-color-chip';

          const input = document.createElement('input');
          input.type = 'color';
          input.value = val;
          input.className = 'studio-color-input';

          const meta = document.createElement('div');
          meta.appendChild(Object.assign(document.createElement('span'), {
            className: 'studio-color-name',
            textContent: field.label
          }));
          const hexSpan = document.createElement('code');
          hexSpan.className = 'studio-color-hex';
          hexSpan.textContent = val.toUpperCase();
          meta.className = 'studio-color-meta';
          meta.appendChild(hexSpan);

          input.addEventListener('input', () => {
            hexSpan.textContent = input.value.toUpperCase();
            window.ZH_UNIT_MODELS.setParams(selectedUnitId, { [field.key]: input.value });
          });

          chip.appendChild(input);
          chip.appendChild(meta);
          colorGrid.appendChild(chip);
        }
        card.appendChild(colorGrid);
      }

      // 3. Render checkbox fields in a compact 2-column interactive toggle chip grid
      if (checkboxFields.length > 0) {
        const chipGrid = document.createElement('div');
        chipGrid.className = 'studio-toggle-chip-grid';
        for (const field of checkboxFields) {
          const isChecked = currentParams[field.key] !== false;
          const lbl = document.createElement('label');
          lbl.className = `studio-toggle-chip ${isChecked ? 'active' : ''}`;
          const chk = document.createElement('input');
          chk.type = 'checkbox';
          chk.checked = isChecked;
          chk.addEventListener('change', () => {
            lbl.classList.toggle('active', chk.checked);
            window.ZH_UNIT_MODELS.setParams(selectedUnitId, { [field.key]: chk.checked });
          });
          const txt = document.createElement('span');
          txt.textContent = field.label;
          lbl.appendChild(chk);
          lbl.appendChild(txt);
          chipGrid.appendChild(lbl);
        }
        card.appendChild(chipGrid);
      }

      container.appendChild(card);
    });
  }

  // ==========================================================================
  // 4. Simulation Step (Turntable, Treads, Cannon Fire Recoil & Particles)
  // ==========================================================================
  function triggerFireCannon() {
    recoilOffset = 6.5;
    const unitDef = resolveStudioEntityDef(selectedUnitId) || {};
    const baseR = unitDef.isBuilding
      ? Math.min(26, Math.max(20, Math.round((unitDef.radius || 32) * 0.58)))
      : (unitDef.radius || 18);
    const r = baseR * zoomLevel;
    const hullRad = (hullDeg * Math.PI) / 180;
    const totalTurretRad = ((hullDeg + turretRelDeg) * Math.PI) / 180;

    // Special case: Construction Dozer performs a hydraulic blade earth-moving scoop with flying dirt clods & diesel smoke!
    if (selectedUnitId.includes('DOZER')) {
      const bladeDist = r * 1.18;
      const bx = Math.cos(hullRad) * bladeDist;
      const by = Math.sin(hullRad) * bladeDist * cameraPitch;
      for (let i = 0; i < 16; i++) {
        const spread = (Math.random() - 0.5) * 1.15;
        const spd = 38 + Math.random() * 88;
        studioParticles.push({
          x: bx + Math.sin(hullRad) * (Math.random() - 0.5) * r * 1.1,
          y: by - Math.cos(hullRad) * (Math.random() - 0.5) * r * 1.1 * cameraPitch,
          vx: Math.cos(hullRad + spread) * spd,
          vy: Math.sin(hullRad + spread) * spd * cameraPitch - (24 + Math.random() * 28),
          r: 3.5 + Math.random() * 4.5,
          color: i < 6 ? '#785c3c' : i < 11 ? '#a18058' : 'rgba(214, 202, 184, 0.82)',
          timer: 0.52,
          maxTimer: 0.52
        });
      }
      return;
    }

    const isMissile =
      selectedUnitId.includes('TOMAHAWK') ||
      selectedUnitId.includes('SCUD') ||
      selectedUnitId.includes('PATRIOT') ||
      selectedUnitId.includes('STINGER') ||
      selectedUnitId.includes('NUCLEAR') ||
      selectedUnitId.includes('BUGGY');
    const isLaser =
      selectedUnitId.includes('LASER') ||
      selectedUnitId.includes('AVENGER') ||
      selectedUnitId.includes('PARTICLE');

    const muzzleDist = isMissile ? r * 1.15 : r * 2.15;
    const elevZ = isMissile ? r * 1.25 * cameraZScale : r * 0.65 * cameraZScale;
    const mx = Math.cos(totalTurretRad) * muzzleDist;
    const my = Math.sin(totalTurretRad) * muzzleDist * cameraPitch - elevZ;

    studioProjectiles.push({
      x: mx,
      y: my,
      vx: Math.cos(totalTurretRad) * (isMissile ? 520 : 680),
      vy: Math.sin(totalTurretRad) * (isMissile ? 520 : 680) * cameraPitch - (isMissile ? 210 * cameraZScale : 0),
      color: isLaser ? '#38bdf8' : isMissile ? '#ef4444' : '#fde047',
      isLaser,
      isMissile,
      timer: isMissile ? 0.68 : 0.45
    });

    const pCount = isMissile ? 18 : 12;
    for (let i = 0; i < pCount; i++) {
      const isBackblast = isMissile && i >= 8;
      const baseAngle = isBackblast ? totalTurretRad + Math.PI : totalTurretRad;
      const spread = (Math.random() - 0.5) * (isBackblast ? 0.85 : 0.65);
      const spd = (isBackblast ? 65 : 45) + Math.random() * 115;
      const spawnX = isBackblast ? -Math.cos(totalTurretRad) * (r * 0.85) : mx;
      const spawnY = isBackblast
        ? -Math.sin(totalTurretRad) * (r * 0.85) * cameraPitch - r * 0.55 * cameraZScale
        : my;
      studioParticles.push({
        x: spawnX,
        y: spawnY,
        vx: Math.cos(baseAngle + spread) * spd,
        vy: Math.sin(baseAngle + spread) * spd * cameraPitch - 18,
        r: (isBackblast ? 4.5 : 3) + Math.random() * 5,
        color: i < 6 ? '#fbbf24' : i < 10 ? '#f97316' : 'rgba(226, 232, 240, 0.78)',
        timer: 0.48,
        maxTimer: 0.48
      });
    }

    if (window.ZH_AUDIO && window.ZH_AUDIO.playSFX) {
      window.ZH_AUDIO.playSFX(isLaser ? 'LASER' : isMissile ? 'MISSILE' : 'CANNON');
    }
  }

  function stepStudioSimulation(dt) {
    if (autoSpin && !isDraggingOrbit) {
      hullDeg = (hullDeg + dt * 28) % 360;
      const hullSlider = document.getElementById('studio-hull-angle');
      const hullVal = document.getElementById('studio-hull-angle-val');
      if (hullSlider) hullSlider.value = String(Math.round(hullDeg));
      if (hullVal) hullVal.textContent = `${Math.round(hullDeg)}°`;
    }

    if (driveTracks) {
      treadPhase = (treadPhase + dt * 1.85) % 1;
    }

    if (recoilOffset > 0) {
      recoilOffset = Math.max(0, recoilOffset - dt * 20);
    }

    // Damage smoke/fire particles in showroom
    if (damageState === 'DAMAGED' || damageState === 'CRITICAL') {
      if (Math.random() < (damageState === 'CRITICAL' ? 0.45 : 0.22)) {
        studioParticles.push({
          x: (Math.random() - 0.5) * 28,
          y: -18 + (Math.random() - 0.5) * 18,
          vx: (Math.random() - 0.5) * 18,
          vy: -38 - Math.random() * 24,
          r: 4 + Math.random() * 4,
          color: damageState === 'CRITICAL' && Math.random() < 0.5 ? '#f97316' : 'rgba(30, 41, 59, 0.82)',
          timer: 0.65,
          maxTimer: 0.65
        });
      }
    }

    for (let i = studioProjectiles.length - 1; i >= 0; i--) {
      const p = studioProjectiles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.timer -= dt;
      if (p.timer <= 0) studioProjectiles.splice(i, 1);
    }

    for (let i = studioParticles.length - 1; i >= 0; i--) {
      const pt = studioParticles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.timer -= dt;
      if (pt.timer <= 0) studioParticles.splice(i, 1);
    }
  }

  // ==========================================================================
  // 5. Rendering Main Showroom Canvas & 1x/2x Live Squad Preview Canvas
  // ==========================================================================
  function getMockUnitState(defId, angleRad, turretAngleRad) {
    const def = resolveStudioEntityDef(defId) || {
      id: defId,
      faction: 'USA',
      name: 'Crusader Tank',
      category: 'TANK',
      locomotor: 'TRACKED',
      radius: 18,
      hp: 680,
      weapon: { projType: 'SHELL' }
    };
    const maxHp = def.hp || 680;
    const hp = damageState === 'CRITICAL'
      ? maxHp * 0.18
      : damageState === 'DAMAGED'
        ? maxHp * 0.42
        : maxHp;
    const studioRadius = def.isBuilding
      ? Math.min(26, Math.max(20, Math.round((def.radius || 32) * 0.58)))
      : (def.radius || 18);

    return {
      id: 999,
      defId: def.id,
      def,
      radius: studioRadius,
      angle: angleRad,
      turretAngle: turretAngleRad,
      recoilOffset,
      treadPhase,
      hp,
      maxHp,
      unmanned: damageState === 'UNMANNED',
      vetLevel: 3
    };
  }

  function renderShowroomBackground(ctx, w, h, unitDef, entry) {
    if (backdropMode === 'DIORAMA_CREAM') {
      // Illustrated Isometric Ligne-Claire Diorama Asset Sheet Backdrop (#f4efe6)
      const grad = ctx.createRadialGradient(w * 0.5, h * 0.5, 24, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
      grad.addColorStop(0, '#f8f4ec');
      grad.addColorStop(1, '#ebe2d3');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Subtle warm drafting grid lines
      ctx.strokeStyle = 'rgba(110, 88, 63, 0.085)';
      ctx.lineWidth = 1;
      const step = 44;
      for (let x = (w / 2) % step; x < w; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 34);
        ctx.lineTo(x, h - 32);
        ctx.stroke();
      }
      for (let y = (h / 2) % step; y < h - 32; y += step) {
        if (y < 34) continue;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Top & Bottom Dark Espresso Ligne-Claire Ink Bars (#26201b)
      ctx.fillStyle = '#26201b';
      ctx.fillRect(0, 0, w, 34);
      ctx.fillRect(0, h - 32, w, 32);

      // Top-Left Studio Title
      ctx.fillStyle = '#f4efe6';
      ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, monospace';
      ctx.textAlign = 'left';
      ctx.fillText('COMMAND & CONQUER: ZERO HOUR • LIGNE-CLAIRE DIORAMA STUDIO', 14, 21);

      // Bottom Caption Bar
      ctx.fillStyle = '#edd3a4';
      ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'left';
      const titleStr = entry ? entry.modelCode : `${unitDef.faction} - ${unitDef.name.toUpperCase()}`;
      ctx.fillText(titleStr, 14, h - 11);

      ctx.fillStyle = '#d6cab8';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(
        `ZOOM: ${zoomLevel.toFixed(1)}× | HULL: ${Math.round(hullDeg)}° | TURRET: ${Math.round(turretRelDeg)}°`,
        w - 14,
        h - 11
      );
    } else if (backdropMode === 'UNTITLED_BLUE') {
      // Iconic C&C Untitled Royal Blue Showroom with Cinema Bars
      const grad = ctx.createRadialGradient(w * 0.5, h * 0.5, 20, w * 0.5, h * 0.5, Math.max(w, h) * 0.65);
      grad.addColorStop(0, '#0a2aff');
      grad.addColorStop(1, '#0012c4');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Subtle perspective floor grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      const step = 44;
      for (let x = (w / 2) % step; x < w; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 34);
        ctx.lineTo(x, h - 32);
        ctx.stroke();
      }
      for (let y = (h / 2) % step; y < h - 32; y += step) {
        if (y < 34) continue;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Top & Bottom Black Cinema Bars (matching reference photo!)
      ctx.fillStyle = '#02040a';
      ctx.fillRect(0, 0, w, 34);
      ctx.fillRect(0, h - 32, w, 32);

      // Top-Left C&C Logo Text
      ctx.fillStyle = '#e2d5b5';
      ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, monospace';
      ctx.textAlign = 'left';
      ctx.fillText('COMMAND & CONQUER: ZERO HOUR • 3D UNIT STUDIO', 14, 21);

      // Bottom Caption Bar matching reference photo
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'left';
      const titleStr = entry ? entry.modelCode : `${unitDef.faction} - ${unitDef.name.toUpperCase()}`;
      ctx.fillText(titleStr, 14, h - 11);

      ctx.fillStyle = '#cbd5e1';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(
        `ZOOM: ${zoomLevel.toFixed(1)}× | HULL: ${Math.round(hullDeg)}° | TURRET: ${Math.round(turretRelDeg)}°`,
        w - 14,
        h - 11
      );
    } else if (backdropMode === 'DESERT') {
      const grad = ctx.createRadialGradient(w * 0.5, h * 0.5, 30, w * 0.5, h * 0.5, w * 0.7);
      grad.addColorStop(0, '#c2a675');
      grad.addColorStop(1, '#8c7248');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(69, 49, 22, 0.16)';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 48) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y < h; y += 48) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
    } else if (backdropMode === 'GRASS') {
      const grad = ctx.createRadialGradient(w * 0.5, h * 0.5, 30, w * 0.5, h * 0.5, w * 0.7);
      grad.addColorStop(0, '#365338');
      grad.addColorStop(1, '#1e3320');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    } else {
      // Dark Engineering Grid
      ctx.fillStyle = '#090f1d';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y < h; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
    }
  }

  function renderMainShowroomCanvas() {
    const canvas = document.getElementById('studio-main-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    const hullRad = (hullDeg * Math.PI) / 180;
    const turretRad = ((hullDeg + turretRelDeg) * Math.PI) / 180;
    const u = getMockUnitState(selectedUnitId, hullRad, turretRad);
    const faction = (window.ZH_DATA && window.ZH_DATA.FACTIONS && window.ZH_DATA.FACTIONS[u.def.faction]) || {
      color: '#3b82f6',
      accent: '#93c5fd'
    };
    const entry = window.ZH_UNIT_MODELS && window.ZH_UNIT_MODELS.getModelEntry(selectedUnitId);
    const isLightBg = backdropMode === 'DIORAMA_CREAM' || backdropMode === 'DESERT';

    ctx.save();
    ctx.scale(dpr, dpr);

    renderShowroomBackground(ctx, w, h, u.def, entry);

    let pitch = cameraPitch;
    let zSc = cameraZScale;
    if (viewMode === 'TACTICAL_25D') {
      pitch = 1.0;
      zSc = 0.42;
    } else if (viewMode === 'TOP_ORTHO') {
      pitch = 1.0;
      zSc = 0.0;
    }

    if (viewMode === 'ALL_UNITS_SHEET') {
      // 5x4 Ligne-Claire Diorama Asset Sheet Preview of all 20 bespoke models
      const registryKeys = window.ZH_UNIT_MODELS && window.ZH_UNIT_MODELS.MODEL_REGISTRY
        ? Object.keys(window.ZH_UNIT_MODELS.MODEL_REGISTRY)
        : [selectedUnitId];
      const cols = 5;
      const rows = Math.ceil(registryKeys.length / cols);
      const padX = 12;
      const topY = 38;
      const botY = h - 36;
      const cellW = (w - padX * 2) / cols;
      const cellH = (botY - topY) / rows;

      registryKeys.forEach((uid, idx) => {
        const c = idx % cols;
        const rIdx = Math.floor(idx / cols);
        const cx = padX + (c + 0.5) * cellW;
        const cy = topY + (rIdx + 0.48) * cellH;
        const isSel = uid === selectedUnitId;

        ctx.save();
        if (isSel) {
          ctx.fillStyle = isLightBg ? 'rgba(217, 184, 130, 0.28)' : 'rgba(56, 189, 248, 0.16)';
          ctx.strokeStyle = isLightBg ? '#26201b' : '#38bdf8';
          ctx.lineWidth = 1.6;
          ctx.fillRect(padX + c * cellW + 3, topY + rIdx * cellH + 2, cellW - 6, cellH - 4);
          ctx.strokeRect(padX + c * cellW + 3, topY + rIdx * cellH + 2, cellW - 6, cellH - 4);
        }

        const uCell = getMockUnitState(uid, hullRad, turretRad);
        const facCell = (window.ZH_DATA && window.ZH_DATA.FACTIONS && window.ZH_DATA.FACTIONS[uCell.def.faction]) || faction;
        const unitScale = Math.min(cellW, cellH) / (Math.max(14, uCell.radius) * 3.15);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(unitScale, unitScale);
        if (window.ZH_VFX && window.ZH_VFX.renderArticulatedUnit) {
          window.ZH_VFX.renderArticulatedUnit(ctx, uCell, facCell, { pitchScale: pitch, zScale: zSc });
        }
        ctx.restore();

        ctx.fillStyle = isLightBg ? '#26201b' : '#f8fafc';
        ctx.font = 'bold 8.5px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(uCell.def.name.toUpperCase(), cx, topY + (rIdx + 1) * cellH - 6);
        ctx.restore();
      });
    } else if (viewMode === 'REF_COMPARE') {
      // Left Half: Reference Image Blueprint
      const refSrc = getActiveRefSrc();
      const refImg = getRefImage(refSrc);
      const boxX = 14;
      const boxY = 56;
      const boxW = w * 0.5 - 26;
      const boxH = h - 98;

      ctx.save();
      ctx.fillStyle = isLightBg ? '#f4efe6' : 'rgba(2, 6, 18, 0.55)';
      ctx.strokeStyle = isLightBg ? 'rgba(38, 32, 27, 0.45)' : 'rgba(148, 163, 184, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.strokeRect(boxX, boxY, boxW, boxH);

      if (refImg && refImg.complete && refImg.naturalWidth > 0) {
        const imgAspect = refImg.naturalWidth / refImg.naturalHeight;
        const boxAspect = boxW / boxH;
        let drawW = boxW;
        let drawH = boxH;
        if (imgAspect > boxAspect) {
          drawH = boxW / imgAspect;
        } else {
          drawW = boxH * imgAspect;
        }
        const dx = boxX + (boxW - drawW) * 0.5;
        const dy = boxY + (boxH - drawH) * 0.5;
        ctx.drawImage(refImg, dx, dy, drawW, drawH);
      } else {
        ctx.fillStyle = isLightBg ? '#574a3d' : '#94a3b8';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Reference Image Loading...', boxX + boxW * 0.5, boxY + boxH * 0.5);
      }
      ctx.restore();

      // Center Divider & Headers
      ctx.strokeStyle = isLightBg ? 'rgba(38, 32, 27, 0.45)' : 'rgba(56, 189, 248, 0.55)';
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(w * 0.5, 36);
      ctx.lineTo(w * 0.5, h - 36);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = isLightBg ? '#26201b' : '#93c5fd';
      ctx.font = 'bold 10.5px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('🖼️ TARGET REFERENCE BLUEPRINT', w * 0.25, 49);
      ctx.fillStyle = isLightBg ? '#9a3412' : '#fde047';
      ctx.fillText('📐 LIVE 3D PARAMETRIC MODEL (DRAG TO ORBIT)', w * 0.75, 49);

      // Right Half: Live 3D Model
      ctx.save();
      ctx.translate(w * 0.75, h * 0.55);
      ctx.scale(zoomLevel * 0.85, zoomLevel * 0.85);
      if (window.ZH_VFX && window.ZH_VFX.renderArticulatedUnit) {
        window.ZH_VFX.renderArticulatedUnit(ctx, u, faction, { pitchScale: pitch, zScale: zSc, allowAllUnits: true });
      }
      ctx.restore();
    } else if (viewMode === 'SPLIT_COMPARE') {
      // Left side: Legacy Box Render
      ctx.save();
      ctx.translate(w * 0.27, h * 0.55);
      ctx.scale(zoomLevel * 0.82, zoomLevel * 0.82);
      if (window.ZH_VFX && window.ZH_VFX.renderArticulatedUnit) {
        window.ZH_VFX.renderArticulatedUnit(ctx, u, faction, { forceLegacy: true });
      }
      ctx.restore();

      // Divider & Labels
      ctx.strokeStyle = isLightBg ? 'rgba(38, 32, 27, 0.35)' : 'rgba(255,255,255,0.35)';
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(w * 0.5, 36);
      ctx.lineTo(w * 0.5, h - 36);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = isLightBg ? '#574a3d' : '#94a3b8';
      ctx.font = 'bold 10.5px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('BEFORE: LEGACY PHASE 3 BOX', w * 0.27, 50);
      ctx.fillStyle = isLightBg ? '#26201b' : '#fde047';
      ctx.fillText('AFTER: LIGNE-CLAIRE DIORAMA 3D RIG', w * 0.73, 50);

      // Right side: New Bespoke 3D Rig
      ctx.save();
      ctx.translate(w * 0.73, h * 0.55);
      ctx.scale(zoomLevel * 0.82, zoomLevel * 0.82);
      if (window.ZH_VFX && window.ZH_VFX.renderArticulatedUnit) {
        window.ZH_VFX.renderArticulatedUnit(ctx, u, faction, { pitchScale: pitch, zScale: zSc, allowAllUnits: true });
      }
      ctx.restore();
    } else {
      // Full Center Showroom Turntable
      ctx.save();
      ctx.translate(w * 0.5, h * 0.54);

      // Subtle tactical selection ring underneath unit
      ctx.strokeStyle = isLightBg ? 'rgba(22, 163, 74, 0.65)' : 'rgba(34, 197, 94, 0.55)';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.ellipse(0, 6, u.radius * zoomLevel * 1.28, u.radius * zoomLevel * 1.28 * pitch, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Asset Sheet Unit Name Plate underneath the turntable (matching assets/diorama/asset_sheet.png)
      if (backdropMode === 'DIORAMA_CREAM') {
        ctx.fillStyle = '#26201b';
        ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(u.def.name.toUpperCase(), 0, Math.min(h * 0.34, u.radius * zoomLevel * 1.28 * pitch + 28));
      }

      ctx.save();
      ctx.scale(zoomLevel, zoomLevel);
      if (window.ZH_VFX && window.ZH_VFX.renderArticulatedUnit) {
        window.ZH_VFX.renderArticulatedUnit(ctx, u, faction, { pitchScale: pitch, zScale: zSc, allowAllUnits: true });
      }
      ctx.restore();

      // Render flying cannon shells, cruise missiles & muzzle smoke particles
      for (const pr of studioProjectiles) {
        if (pr.isMissile) {
          const ang = Math.atan2(pr.vy, pr.vx);
          ctx.save();
          ctx.translate(pr.x, pr.y);
          ctx.rotate(ang);
          // Exhaust rocket flame plume
          ctx.fillStyle = '#f97316';
          ctx.beginPath();
          ctx.moveTo(-14, -3.5);
          ctx.lineTo(-32, 0);
          ctx.lineTo(-14, 3.5);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#fde047';
          ctx.beginPath();
          ctx.moveTo(-14, -2);
          ctx.lineTo(-23, 0);
          ctx.lineTo(-14, 2);
          ctx.closePath();
          ctx.fill();
          // Swept red cruise wings
          ctx.fillStyle = '#ef4444';
          ctx.strokeStyle = '#26201b';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(2, 0);
          ctx.lineTo(-5, -13);
          ctx.lineTo(-9, -12);
          ctx.lineTo(-4, 0);
          ctx.lineTo(-9, 12);
          ctx.lineTo(-5, 13);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          // White cylindrical fuselage + red nose cone
          ctx.fillStyle = '#f8fafc';
          ctx.beginPath();
          ctx.roundRect(-14, -3, 22, 6, 2.5);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.moveTo(8, -3);
          ctx.lineTo(15, 0);
          ctx.lineTo(8, 3);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        } else {
          ctx.strokeStyle = pr.color;
          ctx.lineWidth = pr.isLaser ? 3.5 : 2.8;
          ctx.beginPath();
          ctx.moveTo(pr.x, pr.y);
          ctx.lineTo(pr.x - pr.vx * 0.035, pr.y - pr.vy * 0.035);
          ctx.stroke();
        }
      }

      for (const pt of studioParticles) {
        ctx.globalAlpha = Math.max(0, pt.timer / pt.maxTimer);
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    ctx.restore();
  }

  function renderSquadPreviewCanvas() {
    const canvas = document.getElementById('studio-squad-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    const uBase = getMockUnitState(selectedUnitId, 0, 0);
    const faction = (window.ZH_DATA && window.ZH_DATA.FACTIONS && window.ZH_DATA.FACTIONS[uBase.def.faction]) || {
      color: '#3b82f6',
      accent: '#93c5fd'
    };

    ctx.save();
    ctx.scale(dpr, dpr);

    // Desert tactical terrain mini-strip
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#a68b5b');
    grad.addColorStop(1, '#8c7246');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.2)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 24) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 24) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    const midY = Math.round(h * 0.54);
    const poses = [
      { x: Math.round(w * 0.18), y: midY, scale: 1.0, label: '1.0× Map', hAng: 0.35, tAng: 0.35 },
      { x: Math.round(w * 0.49), y: midY, scale: 1.35, label: '1.35× Tactical', hAng: (hullDeg * Math.PI) / 180, tAng: ((hullDeg + turretRelDeg) * Math.PI) / 180 },
      { x: Math.round(w * 0.82), y: midY, scale: 1.7, label: '1.7× Close-Up', hAng: -0.55, tAng: 0.25 }
    ];

    for (const pose of poses) {
      const u = getMockUnitState(selectedUnitId, pose.hAng, pose.tAng);
      ctx.save();
      ctx.translate(pose.x, pose.y);
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(0, 2, (u.radius + 3) * pose.scale, (u.radius + 3) * 0.65 * pose.scale, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.scale(pose.scale, pose.scale);
      if (window.ZH_VFX && window.ZH_VFX.renderArticulatedUnit) {
        window.ZH_VFX.renderArticulatedUnit(ctx, u, faction, { pitchScale: 0.66, zScale: 0.76, allowAllUnits: true });
      }
      ctx.restore();

      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(pose.label, pose.x, h - 5);
    }

    ctx.restore();
  }

  // ==========================================================================
  // 6. Event Listeners, Export JSON & Spawn on Live Battlefield
  // ==========================================================================
  function bindStudioToolbarEvents() {
    // Open / Close buttons
    for (const btnId of ['btn-open-unit-studio', 'btn-open-unit-studio-top', 'btn-hud-unit-studio']) {
      const btn = document.getElementById(btnId);
      if (btn) {
        btn.addEventListener('click', () => openStudio(selectedUnitId || 'USA_CRUSADER'));
      }
    }
    const closeBtn = document.getElementById('btn-close-unit-studio');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeStudio);
    }

    // Prev / Next Unit Stepper buttons
    const prevUnitBtn = document.getElementById('btn-studio-prev-unit');
    if (prevUnitBtn) {
      prevUnitBtn.addEventListener('click', () => stepSelectedUnit(-1));
    }
    const nextUnitBtn = document.getElementById('btn-studio-next-unit');
    if (nextUnitBtn) {
      nextUnitBtn.addEventListener('click', () => stepSelectedUnit(1));
    }

    // Faction filter buttons
    const facBtns = document.querySelectorAll('[data-studio-faction]');
    for (const b of facBtns) {
      b.addEventListener('click', () => {
        for (const other of facBtns) other.classList.remove('active');
        b.classList.add('active');
        activeFactionFilter = b.getAttribute('data-studio-faction') || 'ALL';
        renderRosterSidebar();
      });
    }

    // Search input
    const searchIn = document.getElementById('studio-unit-search');
    if (searchIn) {
      searchIn.addEventListener('input', () => {
        searchQuery = searchIn.value.trim();
        renderRosterSidebar();
      });
    }

    // View mode pills & hidden select
    const modePills = document.querySelectorAll('.studio-mode-pill[data-view-mode]');
    for (const pill of modePills) {
      pill.addEventListener('click', () => {
        setViewMode(pill.getAttribute('data-view-mode') || 'ISO_3D');
      });
    }

    const viewSel = document.getElementById('studio-view-mode');
    if (viewSel) {
      viewSel.addEventListener('change', () => {
        setViewMode(viewSel.value);
      });
    }

    // Quick Angle Snap buttons
    const snapBtns = document.querySelectorAll('.studio-snap-btn[data-snap-yaw]');
    for (const btn of snapBtns) {
      btn.addEventListener('click', () => {
        const yaw = parseFloat(btn.getAttribute('data-snap-yaw'));
        const tur = parseFloat(btn.getAttribute('data-snap-turret') || '0');
        if (!Number.isNaN(yaw)) {
          hullDeg = yaw;
          turretRelDeg = Number.isNaN(tur) ? 0 : tur;
          cameraPitch = 0.64;
          cameraZScale = 0.78;
          const hullIn = document.getElementById('studio-hull-angle');
          const hullVal = document.getElementById('studio-hull-angle-val');
          const turIn = document.getElementById('studio-turret-angle');
          const turVal = document.getElementById('studio-turret-angle-val');
          if (hullIn) hullIn.value = String(Math.round(hullDeg));
          if (hullVal) hullVal.textContent = `${Math.round(hullDeg)}°`;
          if (turIn) turIn.value = String(Math.round(turretRelDeg));
          if (turVal) turVal.textContent = `${Math.round(turretRelDeg)}°`;
          syncAngleSnapButtons();
        }
      });
    }

    // Reference Split-View Toggle Button & Clickable Preview
    const compareRefBtn = document.getElementById('btn-studio-compare-ref');
    if (compareRefBtn) {
      compareRefBtn.addEventListener('click', () => {
        setViewMode(viewMode === 'REF_COMPARE' ? 'ISO_3D' : 'REF_COMPARE');
      });
    }
    const refClickPreview = document.getElementById('studio-ref-click-preview');
    if (refClickPreview) {
      refClickPreview.addEventListener('click', () => {
        setViewMode(viewMode === 'REF_COMPARE' ? 'ISO_3D' : 'REF_COMPARE');
      });
    }

    // Inspector Category Tabs
    const inspTabs = document.querySelectorAll('.studio-insp-tab[data-insp-tab]');
    for (const tab of inspTabs) {
      tab.addEventListener('click', () => {
        for (const other of inspTabs) other.classList.remove('active');
        tab.classList.add('active');
        activeInspectorTab = tab.getAttribute('data-insp-tab') || 'ALL';
        renderParameterInspector();
      });
    }

    // Backdrop select
    const bgSel = document.getElementById('studio-backdrop-mode');
    if (bgSel) {
      bgSel.addEventListener('change', () => {
        backdropMode = bgSel.value;
      });
    }

    // Zoom slider
    const zoomIn = document.getElementById('studio-zoom-slider');
    const zoomVal = document.getElementById('studio-zoom-val');
    if (zoomIn) {
      zoomIn.addEventListener('input', () => {
        zoomLevel = parseFloat(zoomIn.value) || 4.6;
        if (zoomVal) zoomVal.textContent = `${zoomLevel.toFixed(1)}×`;
      });
    }

    // Hull & Turret sliders
    const hullIn = document.getElementById('studio-hull-angle');
    const hullVal = document.getElementById('studio-hull-angle-val');
    if (hullIn) {
      hullIn.addEventListener('input', () => {
        hullDeg = parseFloat(hullIn.value) || 0;
        if (hullVal) hullVal.textContent = `${Math.round(hullDeg)}°`;
        syncAngleSnapButtons();
      });
    }

    const turIn = document.getElementById('studio-turret-angle');
    const turVal = document.getElementById('studio-turret-angle-val');
    if (turIn) {
      turIn.addEventListener('input', () => {
        turretRelDeg = parseFloat(turIn.value) || 0;
        if (turVal) turVal.textContent = `${Math.round(turretRelDeg)}°`;
      });
    }

    // Animation toggles & Fire button
    const spinChk = document.getElementById('studio-chk-autospin');
    if (spinChk) {
      spinChk.addEventListener('change', () => {
        autoSpin = spinChk.checked;
      });
    }
    const aimChk = document.getElementById('studio-chk-mouseaim');
    if (aimChk) {
      aimChk.addEventListener('change', () => {
        mouseAimTurret = aimChk.checked;
      });
    }
    const driveChk = document.getElementById('studio-chk-drivetracks');
    if (driveChk) {
      driveChk.addEventListener('change', () => {
        driveTracks = driveChk.checked;
      });
    }
    const dmgSel = document.getElementById('studio-damage-state');
    if (dmgSel) {
      dmgSel.addEventListener('change', () => {
        damageState = dmgSel.value;
      });
    }

    const fireBtn = document.getElementById('btn-studio-fire');
    if (fireBtn) {
      fireBtn.addEventListener('click', triggerFireCannon);
    }

    // Presets dropdown
    const presetSel = document.getElementById('studio-preset-select');
    if (presetSel) {
      presetSel.addEventListener('change', () => {
        const entry = window.ZH_UNIT_MODELS && window.ZH_UNIT_MODELS.getModelEntry(selectedUnitId);
        if (entry && entry.presets && entry.presets[presetSel.value]) {
          window.ZH_UNIT_MODELS.setParams(selectedUnitId, entry.presets[presetSel.value].params);
          renderParameterInspector();
        }
      });
    }

    // Reset button
    const resetBtn = document.getElementById('btn-studio-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (window.ZH_UNIT_MODELS) {
          window.ZH_UNIT_MODELS.resetParams(selectedUnitId);
          hullDeg = 139;
          turretRelDeg = 0;
          cameraPitch = 0.64;
          cameraZScale = 0.78;
          const hullInEl = document.getElementById('studio-hull-angle');
          const hullValEl = document.getElementById('studio-hull-angle-val');
          const turInEl = document.getElementById('studio-turret-angle');
          const turValEl = document.getElementById('studio-turret-angle-val');
          if (hullInEl) hullInEl.value = '139';
          if (hullValEl) hullValEl.textContent = '139°';
          if (turInEl) turInEl.value = '0';
          if (turValEl) turValEl.textContent = '0°';
          syncAngleSnapButtons();
          renderParameterInspector();
        }
      });
    }

    // Export JSON button
    const exportBtn = document.getElementById('btn-studio-export');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const params = window.ZH_UNIT_MODELS ? window.ZH_UNIT_MODELS.getParams(selectedUnitId) : {};
        const json = JSON.stringify({ unitId: selectedUnitId, params }, null, 2);
        try {
          if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(json);
          }
        } catch (_) {}
        exportBtn.textContent = '✅ Copied!';
        setTimeout(() => {
          exportBtn.textContent = '📋 Copy JSON';
        }, 1800);
      });
    }

    // Test on Live Battlefield button
    const testBattleBtn = document.getElementById('btn-studio-test-battlefield');
    if (testBattleBtn) {
      testBattleBtn.addEventListener('click', () => {
        closeStudio();
        const launchBtn = document.getElementById('btn-launch-operation');
        const isRunning = window.ZH_UI && typeof window.ZH_UI.isMatchRunning === 'function'
          ? window.ZH_UI.isMatchRunning()
          : false;
        if (!isRunning && launchBtn) {
          launchBtn.click();
        }
        if (window.ZH_UI && typeof window.ZH_UI.spawnStudioTestSquad === 'function') {
          window.ZH_UI.spawnStudioTestSquad(selectedUnitId);
        }
      });
    }

    // Custom Reference Image File Input
    const refInput = document.getElementById('studio-ref-file-input');
    const refUploadBtn = document.getElementById('btn-studio-upload-ref');
    if (refUploadBtn && refInput) {
      refUploadBtn.addEventListener('click', () => refInput.click());
      refInput.addEventListener('change', () => {
        const file = refInput.files && refInput.files[0];
        if (!file || typeof FileReader === 'undefined') return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          customRefDataUrls[selectedUnitId] = ev.target.result;
          updateReferenceCard();
        };
        reader.readAsDataURL(file);
      });
    }
  }

  function bindMainCanvasEvents() {
    const canvas = document.getElementById('studio-main-canvas');
    if (!canvas) return;

    canvas.addEventListener('mousedown', (e) => {
      if (mouseAimTurret && e.button === 0) {
        triggerFireCannon();
        return;
      }
      isDraggingOrbit = true;
      dragLastX = e.clientX;
      dragLastY = e.clientY;
    });

    window.addEventListener('mouseup', () => {
      isDraggingOrbit = false;
    });

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const cx = rect.left + rect.width * (viewMode === 'REF_COMPARE' || viewMode === 'SPLIT_COMPARE' ? 0.74 : 0.5);
      const cy = rect.top + rect.height * 0.54;

      if (mouseAimTurret) {
        const dx = e.clientX - cx;
        const dy = (e.clientY - cy) / Math.max(0.35, cameraPitch);
        const worldDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
        turretRelDeg = ((worldDeg - hullDeg + 540) % 360) - 180;
        const turIn = document.getElementById('studio-turret-angle');
        const turVal = document.getElementById('studio-turret-angle-val');
        if (turIn) turIn.value = String(Math.round(turretRelDeg));
        if (turVal) turVal.textContent = `${Math.round(turretRelDeg)}°`;
        return;
      }

      if (isDraggingOrbit) {
        const dx = e.clientX - dragLastX;
        const dy = e.clientY - dragLastY;
        dragLastX = e.clientX;
        dragLastY = e.clientY;

        hullDeg = (hullDeg + dx * 0.65 + 360) % 360;
        cameraPitch = Math.max(0.42, Math.min(1.0, cameraPitch + dy * 0.003));
        cameraZScale = Math.max(0.15, Math.min(1.05, 1.15 - cameraPitch * 0.58));

        const hullIn = document.getElementById('studio-hull-angle');
        const hullVal = document.getElementById('studio-hull-angle-val');
        if (hullIn) hullIn.value = String(Math.round(hullDeg));
        if (hullVal) hullVal.textContent = `${Math.round(hullDeg)}°`;
        syncAngleSnapButtons();
      }
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.25 : 0.25;
      zoomLevel = Math.max(1.2, Math.min(8.0, zoomLevel + delta));
      const zoomIn = document.getElementById('studio-zoom-slider');
      const zoomVal = document.getElementById('studio-zoom-val');
      if (zoomIn) zoomIn.value = String(zoomLevel);
      if (zoomVal) zoomVal.textContent = `${zoomLevel.toFixed(1)}×`;
    }, { passive: false });
  }

  return {
    initStudio,
    openStudio,
    closeStudio,
    selectUnit,
    triggerFireCannon,
    isOpen: () => isStudioOpen
  };
})();
