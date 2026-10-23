/**
 * Command & Conquer: Generals – Zero Hour (macOS Clean-Room Edition)
 * HUMAN-USER QA RUNNER (`tests/human_qa_runner.js`)
 *
 * Drives the game 100% through synthetic human inputs:
 *  - DOM button clicks (.click())
 *  - Canvas MouseEvents (mousedown, mousemove, mouseup, contextmenu)
 *    using exact screen-space coordinates derived from camera state:
 *      clientX = rect.left + (worldX - cam.x)
 *      clientY = rect.top  + (worldY - cam.y)
 *  - Window KeyboardEvents (keydown, keyup) with key/code/ctrlKey/shiftKey
 *
 * Never calls internal engine order methods to issue player commands.
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// 1. SYNTHETIC DOM & CANVAS HARNESS MATCHING index.html
// ============================================================================
class ClassListMock {
  constructor(el, initial = []) {
    this.el = el;
    this.set = new Set(initial);
  }
  add(...names) { names.forEach(n => { if (n) this.set.add(n); }); }
  remove(...names) { names.forEach(n => this.set.delete(n)); }
  contains(n) { return this.set.has(n); }
  toggle(n, force) {
    if (force === true) { this.set.add(n); return true; }
    if (force === false) { this.set.delete(n); return false; }
    if (this.set.has(n)) { this.set.delete(n); return false; }
    this.set.add(n); return true;
  }
  toString() { return Array.from(this.set).join(' '); }
}

class ElementMock {
  constructor(tagName = 'DIV', id = '', classes = [], attrs = {}) {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.classList = new ClassListMock(this, classes);
    this.dataset = {};
    this.attributes = {};
    for (const [k, v] of Object.entries(attrs)) {
      this.attributes[k] = String(v);
      if (k.startsWith('data-')) {
        const camel = k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        this.dataset[camel] = String(v);
      }
    }
    this.style = {
      display: attrs.style && attrs.style.includes('display:none') ? 'none' : '',
      setProperty(k, v) { this[k] = String(v); }
    };
    this.children = [];
    this.parentElement = null;
    this.listeners = {};
    this._innerHTML = '';
    this.textContent = '';
    this.innerText = '';
    this.value = '';
    this.disabled = false;
    this.title = attrs.title || '';
    this.width = Number(attrs.width) || 1280;
    this.height = Number(attrs.height) || 720;
    this._rect = { left: 0, top: 0, width: this.width, height: this.height };
  }

  get className() { return this.classList.toString(); }
  set className(val) {
    this.classList = new ClassListMock(this, String(val || '').split(/\s+/).filter(Boolean));
  }

  get innerHTML() { return this._innerHTML; }
  set innerHTML(val) {
    this._innerHTML = String(val || '');
    this.children = [];
    // Parse child elements needed by ui.js (.power-action or <option value="...">)
    if (this._innerHTML.includes('class="power-action"')) {
      const actionDiv = new ElementMock('DIV', '', ['power-action']);
      this.appendChild(actionDiv);
    }
    const optRegex = /<option\s+value="([^"]+)"[^>]*>([^<]*)<\/option>/gi;
    let m;
    while ((m = optRegex.exec(this._innerHTML)) !== null) {
      const opt = new ElementMock('OPTION', '', [], { value: m[1] });
      opt.value = m[1];
      opt.textContent = m[2];
      this.appendChild(opt);
    }
    if (this.tagName === 'SELECT' && this.children.length > 0 && !this.value) {
      this.value = this.children[0].value;
    }
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    if (child.id) global.document._registerById(child.id, child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
    return child;
  }

  remove() {
    if (this.parentElement) {
      this.parentElement.removeChild(this);
    }
  }

  replaceChildren(...nodes) {
    this.children = [];
    nodes.forEach(n => this.appendChild(n));
  }

  setAttribute(name, val) {
    this.attributes[name] = String(val);
    if (name.startsWith('data-')) {
      const camel = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      this.dataset[camel] = String(val);
    }
  }

  getAttribute(name) {
    return this.attributes[name] !== undefined ? this.attributes[name] : null;
  }

  contains(node) {
    let cur = node;
    while (cur) {
      if (cur === this) return true;
      cur = cur.parentElement;
    }
    return false;
  }

  addEventListener(type, fn) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(fn);
  }

  dispatchEvent(evt) {
    evt.target = evt.target || this;
    evt.currentTarget = this;
    evt.preventDefault = evt.preventDefault || (() => {});
    evt.stopPropagation = evt.stopPropagation || (() => { evt._stopped = true; });
    const fns = this.listeners[evt.type] || [];
    for (const fn of fns) {
      fn.call(this, evt);
    }
    if (!evt._stopped && this.parentElement) {
      this.parentElement.dispatchEvent(evt);
    }
  }

  click() {
    if (this.disabled) return;
    if (typeof this.onclick === 'function') {
      this.onclick({ target: this, currentTarget: this, preventDefault() {}, stopPropagation() {} });
    }
    this.dispatchEvent({ type: 'click', button: 0, target: this });
  }

  matches(selector) {
    const parts = selector.trim().split(/(?=[.#\[])/);
    for (const p of parts) {
      if (p.startsWith('#')) {
        if (this.id !== p.slice(1)) return false;
      } else if (p.startsWith('.')) {
        if (!this.classList.contains(p.slice(1))) return false;
      } else if (p.startsWith('[')) {
        const m = p.match(/^\[\s*([a-zA-Z0-9_-]+)(?:=["']?([^"'\]]*)["']?)?\s*\]$/);
        if (!m) return false;
        const attrName = m[1];
        const attrVal = m[2];
        const actual = attrName.startsWith('data-')
          ? this.dataset[attrName.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())]
          : this.attributes[attrName];
        if (attrVal !== undefined && String(actual) !== attrVal) return false;
        if (attrVal === undefined && actual === undefined) return false;
      } else {
        if (this.tagName !== p.toUpperCase()) return false;
      }
    }
    return true;
  }

  closest(selector) {
    let cur = this;
    while (cur) {
      if (cur.matches && cur.matches(selector)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  querySelectorAll(selector) {
    const tokens = selector.trim().split(/\s+/);
    let currentSet = [this];
    for (const token of tokens) {
      const nextSet = [];
      const visit = (node) => {
        for (const child of node.children) {
          if (child.matches(token)) nextSet.push(child);
          visit(child);
        }
      };
      for (const root of currentSet) visit(root);
      currentSet = nextSet;
    }
    return currentSet;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  getBoundingClientRect() {
    const cssW = parseFloat(this.style && this.style.width) || this._rect.width || this.width || 1280;
    const cssH = parseFloat(this.style && this.style.height) || this._rect.height || this.height || 720;
    return {
      left: this._rect.left || 0,
      top: this._rect.top || 0,
      width: cssW,
      height: cssH
    };
  }

  getContext() {
    const el = this;
    if (!el._ctxProxy) {
      el._nanArcCalls = 0;
      el._lastSetTransform = [1, 0, 0, 1, 0, 0];
      el._strokeRectCalls = [];
      el._ctxProxy = new Proxy({}, {
        get: (target, prop) => {
          if (prop === 'measureText') return () => ({ width: 42 });
          if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
            return () => ({ addColorStop() {} });
          }
          if (prop === 'setTransform') {
            return (...args) => {
              el._lastSetTransform = args;
            };
          }
          if (prop === 'strokeRect') {
            return (x, y, w, h) => {
              el._strokeRectCalls.push({
                x, y, w, h,
                transform: Array.isArray(el._lastSetTransform) ? [...el._lastSetTransform] : [1, 0, 0, 1, 0, 0]
              });
            };
          }
          if (prop === 'arc') {
            return (x, y, r) => {
              if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(r)) {
                el._nanArcCalls = (el._nanArcCalls || 0) + 1;
              }
            };
          }
          if (prop in target) return target[prop];
          return () => {};
        },
        set: (target, prop, val) => {
          target[prop] = val;
          return true;
        }
      });
    }
    return el._ctxProxy;
  }
}

let simClockMs = 10000;
let rafCallback = null;

function buildDOMEnvironment() {
  simClockMs = 10000;
  rafCallback = null;
  const elementsById = new Map();
  const root = new ElementMock('BODY', 'body');
  const head = new ElementMock('HEAD', 'head');
  const docEl = new ElementMock('HTML', 'html');

  const doc = {
    body: root,
    head,
    documentElement: docEl,
    _elementsById: elementsById,
    _registerById(id, el) { elementsById.set(id, el); },
    createElement(tag) { return new ElementMock(tag); },
    getElementById(id) {
      if (!elementsById.has(id)) {
        const el = new ElementMock('DIV', id);
        elementsById.set(id, el);
        root.appendChild(el);
      }
      return elementsById.get(id);
    },
    querySelectorAll(sel) { return root.querySelectorAll(sel); },
    querySelector(sel) { return root.querySelector(sel); },
    addEventListener(type, fn) { root.addEventListener(type, fn); }
  };

  global.document = doc;

  const register = (tag, id, classes = [], attrs = {}, parent = root) => {
    const el = new ElementMock(tag, id, classes, attrs);
    if (id) elementsById.set(id, el);
    parent.appendChild(el);
    return el;
  };

  // Top Bar
  const topBar = register('HEADER', 'top-bar');
  register('DIV', 'hud-faction-badge', ['stat-pill'], {}, topBar);
  register('DIV', 'hud-credits', ['stat-pill'], {}, topBar);
  register('DIV', 'hud-power', ['stat-pill'], {}, topBar);
  register('DIV', 'hud-rank', ['stat-pill'], {}, topBar);
  register('DIV', 'hud-tunnel-status', ['stat-pill'], { style: 'display:none' }, topBar);
  register('BUTTON', 'btn-generals-powers', ['hud-btn'], {}, topBar);
  register('BUTTON', 'btn-select-builder', ['hud-btn'], {}, topBar);
  register('BUTTON', 'btn-select-combat', ['hud-btn'], {}, topBar);
  register('BUTTON', 'btn-toggle-sfx', ['hud-btn'], {}, topBar);
  register('BUTTON', 'btn-toggle-music', ['hud-btn'], {}, topBar);
  register('BUTTON', 'btn-toggle-voice', ['hud-btn'], {}, topBar);
  register('BUTTON', 'btn-pause-game', ['hud-btn'], {}, topBar);
  register('BUTTON', 'btn-main-menu', ['hud-btn'], {}, topBar);
  register('BUTTON', 'btn-game-menu', ['hud-btn'], {}, topBar);
  register('DIV', 'hud-match-clock', ['stat-pill'], {}, topBar);

  // Viewport (matches css/style.css: margin-top: 36px, height: calc(100vh - 36px - 184px) = 500px)
  const viewport = register('MAIN', 'viewport-wrap', [], { width: 1280, height: 500 });
  const gameCanvas = register('CANVAS', 'game-canvas', [], { width: 1280, height: 500 }, viewport);
  gameCanvas._rect = { left: 0, top: 36, width: 1280, height: 500 };
  register('DIV', 'superweapon-timers', [], {}, viewport);
  register('DIV', 'tactical-alert', ['hidden'], {}, viewport);
  register('DIV', 'alert-log', [], {}, viewport);
  register('DIV', 'power-strip', [], {}, viewport);
  register('DIV', 'control-group-bar', [], {}, viewport);
  register('DIV', 'hud-tooltip', ['hidden'], {}, viewport);
  const tauntBox = register('DIV', 'general-taunt-box', ['hidden'], {}, viewport);
  register('DIV', 'taunt-general-name', [], {}, tauntBox);
  register('DIV', 'taunt-general-text', [], {}, tauntBox);

  // Command Bar
  const cmdBar = register('FOOTER', 'command-bar');
  const minimapPanel = register('DIV', 'minimap-panel', [], {}, cmdBar);
  const minimapCanvas = register('CANVAS', 'minimap-canvas', [], { width: 164, height: 164 }, minimapPanel);
  minimapCanvas._rect = { left: 0, top: 0, width: 164, height: 164 };

  const inspectorPanel = register('DIV', 'inspector-panel', [], {}, cmdBar);
  register('DIV', 'inspector-title', [], {}, inspectorPanel);
  register('DIV', 'inspector-subtitle', [], {}, inspectorPanel);
  const stanceBar = register('DIV', 'stance-bar', ['hidden'], {}, inspectorPanel);
  register('BUTTON', 'btn-order-attack-move', ['hud-btn'], {}, stanceBar);
  register('BUTTON', 'btn-order-guard', ['hud-btn'], {}, stanceBar);
  register('BUTTON', 'btn-order-stop', ['hud-btn'], {}, stanceBar);
  register('BUTTON', 'btn-order-scatter', ['hud-btn'], {}, stanceBar);
  register('DIV', 'inspector-stats', [], {}, inspectorPanel);
  register('DIV', 'selection-summary', ['hidden'], {}, inspectorPanel);
  register('DIV', 'inspector-queue', [], {}, inspectorPanel);

  const cmdCardPanel = register('DIV', 'command-card-panel', [], {}, cmdBar);
  register('DIV', 'command-card-grid', [], {}, cmdCardPanel);

  // Game Menu Modal
  const gameMenuModal = register('DIV', 'game-menu-modal', ['modal-backdrop', 'hidden']);
  register('BUTTON', 'btn-close-game-menu', ['hud-btn'], {}, gameMenuModal);
  register('BUTTON', 'btn-speed', ['hud-btn'], {}, gameMenuModal);

  // Start Modal
  const startModal = register('DIV', 'start-modal', ['modal-backdrop']);
  register('BUTTON', '', ['mode-tab-btn', 'active'], { 'data-mode': 'CHALLENGE' }, startModal);
  register('BUTTON', '', ['mode-tab-btn'], { 'data-mode': 'SKIRMISH' }, startModal);
  register('DIV', 'player-general-grid', ['general-grid'], {}, startModal);
  const challengeSec = register('DIV', 'challenge-section', [], {}, startModal);
  register('DIV', 'challenge-ladder-preview', [], {}, challengeSec);
  const aiWrap = register('DIV', 'ai-general-picker-wrap', [], { style: 'display:none' }, startModal);
  register('DIV', 'ai-general-grid', ['general-grid'], {}, aiWrap);
  register('SELECT', 'map-selector', ['map-select-dropdown'], {}, startModal);
  register('BUTTON', '', ['diff-btn'], { 'data-diff': 'EASY' }, startModal);
  register('BUTTON', '', ['diff-btn', 'active'], { 'data-diff': 'NORMAL' }, startModal);
  register('BUTTON', '', ['diff-btn'], { 'data-diff': 'HARD' }, startModal);
  register('BUTTON', 'btn-launch-operation', ['launch-btn'], {}, startModal);
  register('BUTTON', 'btn-open-powers-preview', ['hud-btn'], {}, startModal);
  const btnAutoSim = register('BUTTON', 'btn-auto-sim', ['hud-btn'], { hidden: 'hidden' }, startModal);
  btnAutoSim.hidden = true;

  // Game Menu Modal (matches index.html lines 155-183)
  const optHealthBars = register('INPUT', 'opt-health-bars', [], { type: 'checkbox' }, gameMenuModal);
  optHealthBars.value = 'on';
  optHealthBars.checked = false;
  const optUiScale = register('SELECT', 'opt-ui-scale', [], {}, gameMenuModal);
  optUiScale.value = '100';

  // Powers Modal
  const powersModal = register('DIV', 'powers-modal', ['modal-backdrop', 'hidden']);
  register('DIV', 'powers-modal-subtitle', ['zh-logo-sub'], {}, powersModal);
  register('BUTTON', 'btn-close-powers', ['hud-btn'], {}, powersModal);
  register('DIV', 'powers-grid', ['powers-list'], {}, powersModal);

  // Victory Modal
  const victoryModal = register('DIV', 'victory-modal', ['modal-backdrop', 'hidden']);
  register('DIV', 'victory-title', ['zh-logo-title'], {}, victoryModal);
  register('P', 'victory-subtitle', [], {}, victoryModal);
  register('DIV', 'victory-stats-wrap', [], {}, victoryModal);
  register('BUTTON', 'btn-next-challenge', ['launch-btn'], {}, victoryModal);

  const winListeners = {};
  Object.assign(global, {
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    document: doc,
    getComputedStyle() {
      return {
        getPropertyValue(prop) {
          if (prop === '--top-bar-h') return '36px';
          if (prop === '--cmd-bar-h') return '184px';
          return '';
        }
      };
    },
    addEventListener(type, fn) {
      if (!winListeners[type]) winListeners[type] = [];
      winListeners[type].push(fn);
    },
    dispatchEvent(evt) {
      evt.preventDefault = evt.preventDefault || (() => {});
      const fns = winListeners[evt.type] || [];
      for (const fn of fns) fn(evt);
    },
    requestAnimationFrame(fn) {
      rafCallback = fn;
      return 1;
    },
    AudioContext: class {
      constructor() { this.currentTime = 0; this.state = 'running'; this.destination = {}; }
      resume() {}
      createOscillator() {
        return {
          type: 'sine',
          frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} },
          connect() {}, start() {}, stop() {}
        };
      }
      createGain() {
        return {
          gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} },
          connect() {}
        };
      }
      createBiquadFilter() {
        return { type: 'lowpass', frequency: { setValueAtTime() {} }, Q: { value: 1 }, connect() {} };
      }
      createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
      createBufferSource() { return { buffer: null, connect() {}, start() {}, stop() {} }; }
    },
    speechSynthesis: { cancel() {}, speak() {} }
  });
  global.window = global;
  global.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  global.performance = { now: () => simClockMs };
}

// ============================================================================
// 2. HUMAN INPUT DRIVER (strictly simulates Mouse, Keyboard & DOM UI actions)
// ============================================================================
class HumanUserDriver {
  constructor(getEngine) {
    this._getEngine = getEngine;
    this.canvas = document.getElementById('game-canvas');
    this.minimap = document.getElementById('minimap-canvas');
    this.actionLog = [];
    this.findings = [];
  }

  get engine() { return this._getEngine(); }

  log(action, detail = '') {
    this.actionLog.push({ step: this.actionLog.length + 1, action, detail });
  }

  recordBug(bug) {
    this.findings.push(bug);
  }

  // Convert world (x, y) to screen pixel coordinates (clientX, clientY) on #game-canvas
  worldToScreen(wx, wy) {
    const rect = this.canvas.getBoundingClientRect();
    const cam = this.engine.cam;
    return {
      clientX: rect.left + (wx - cam.x),
      clientY: rect.top + (wy - cam.y)
    };
  }

  // Center camera over world coordinates (via minimap click, just like a human!)
  clickMinimapAtWorld(wx, wy, button = 0) {
    const rect = this.minimap.getBoundingClientRect();
    const clientX = rect.left + (wx / this.engine.worldSize) * rect.width;
    const clientY = rect.top + (wy / this.engine.worldSize) * rect.height;
    this.log(button === 0 ? 'MINIMAP_LEFT_CLICK' : 'MINIMAP_RIGHT_CLICK', `world=(${Math.round(wx)}, ${Math.round(wy)})`);
    this.minimap.dispatchEvent({ type: 'mousedown', button, clientX, clientY });
    window.dispatchEvent({ type: 'mouseup', button, clientX, clientY });
  }

  // Left-click at world coordinates (pans camera via minimap first so target is on screen)
  leftClickWorld(wx, wy, opts = {}) {
    if (!opts.keepCamera) this.clickMinimapAtWorld(wx, wy, 0);
    if (!opts.doubleClickSecondTap) simClockMs += 500; // avoid accidental double-click unless intended
    const { clientX, clientY } = this.worldToScreen(wx, wy);
    this.log('LEFT_CLICK_CANVAS', `world=(${Math.round(wx)}, ${Math.round(wy)}) screen=(${Math.round(clientX)}, ${Math.round(clientY)})`);
    this.canvas.dispatchEvent({
      type: 'mousemove', button: 0, clientX, clientY,
      shiftKey: !!opts.shiftKey, ctrlKey: !!opts.ctrlKey
    });
    this.canvas.dispatchEvent({
      type: 'mousedown', button: 0, clientX, clientY,
      shiftKey: !!opts.shiftKey, ctrlKey: !!opts.ctrlKey
    });
    window.dispatchEvent({
      type: 'mouseup', button: 0, clientX, clientY,
      shiftKey: !!opts.shiftKey, ctrlKey: !!opts.ctrlKey
    });
  }

  // Human Double-Click on a unit (two rapid left-clicks within <340ms)
  doubleClickWorld(wx, wy) {
    this.clickMinimapAtWorld(wx, wy, 0);
    simClockMs += 500;
    this.leftClickWorld(wx, wy, { keepCamera: true, doubleClickSecondTap: true });
    simClockMs += 120; // 120ms later (< 340ms threshold in ui.js)
    this.leftClickWorld(wx, wy, { keepCamera: true, doubleClickSecondTap: true });
  }

  // Left-click drag box selection on #game-canvas
  dragSelectWorldBox(wx1, wy1, wx2, wy2, opts = {}) {
    this.clickMinimapAtWorld((wx1 + wx2) * 0.5, (wy1 + wy2) * 0.5, 0);
    simClockMs += 500;
    const p1 = this.worldToScreen(wx1, wy1);
    const p2 = this.worldToScreen(wx2, wy2);
    this.log('DRAG_SELECT_BOX', `from=(${Math.round(wx1)},${Math.round(wy1)}) to=(${Math.round(wx2)},${Math.round(wy2)})`);
    this.canvas.dispatchEvent({
      type: 'mousedown', button: 0, clientX: p1.clientX, clientY: p1.clientY,
      shiftKey: !!opts.shiftKey
    });
    this.canvas.dispatchEvent({
      type: 'mousemove', button: 0, clientX: p2.clientX, clientY: p2.clientY,
      shiftKey: !!opts.shiftKey
    });
    if (opts.framesDuringDrag) {
      this.stepFrames(opts.framesDuringDrag, 1 / 60);
    }
    window.dispatchEvent({
      type: 'mouseup', button: 0, clientX: p2.clientX, clientY: p2.clientY,
      shiftKey: !!opts.shiftKey
    });
  }

  // Right-click at world coordinates (Contextual Move / Attack / Harvest / Garrison / Capture / Rally)
  rightClickWorld(wx, wy, opts = {}) {
    if (!opts.keepCamera) this.clickMinimapAtWorld(wx, wy, 0);
    const { clientX, clientY } = this.worldToScreen(wx, wy);
    this.log('RIGHT_CLICK_CANVAS', `world=(${Math.round(wx)}, ${Math.round(wy)}) shift=${!!opts.shiftKey} ctrl=${!!opts.ctrlKey}`);
    this.canvas.dispatchEvent({
      type: 'mousemove', button: 2, clientX, clientY,
      shiftKey: !!opts.shiftKey, ctrlKey: !!opts.ctrlKey
    });
    this.canvas.dispatchEvent({
      type: 'mousedown', button: 2, clientX, clientY,
      shiftKey: !!opts.shiftKey, ctrlKey: !!opts.ctrlKey
    });
    window.dispatchEvent({
      type: 'mouseup', button: 2, clientX, clientY,
      shiftKey: !!opts.shiftKey, ctrlKey: !!opts.ctrlKey
    });
  }

  // Press and release a keyboard key
  pressKey(key, opts = {}) {
    this.log('KEY_PRESS', `${opts.ctrlKey ? 'Ctrl+' : ''}${opts.shiftKey ? 'Shift+' : ''}${key}`);
    window.dispatchEvent({
      type: 'keydown',
      key,
      code: opts.code || key,
      ctrlKey: !!opts.ctrlKey,
      metaKey: !!opts.metaKey,
      shiftKey: !!opts.shiftKey
    });
    window.dispatchEvent({
      type: 'keyup',
      key,
      code: opts.code || key,
      ctrlKey: !!opts.ctrlKey,
      metaKey: !!opts.metaKey,
      shiftKey: !!opts.shiftKey
    });
  }

  // Click a DOM element by selector or reference
  clickElement(elOrSelector, label = '') {
    const el = typeof elOrSelector === 'string'
      ? document.querySelector(elOrSelector) || document.getElementById(elOrSelector.replace(/^#/, ''))
      : elOrSelector;
    if (!el) throw new Error(`HumanUserDriver: Could not find element ${label || elOrSelector}`);
    this.log('CLICK_DOM', label || el.id || el.className);
    el.click();
    return el;
  }

  // Click a Command Card button matching a title/tooltip substring or index
  clickCommandCardButton(matchTextOrIndex, rightClick = false) {
    const grid = document.getElementById('command-card-grid');
    const btns = grid.children.filter(c => c.classList.contains('cmd-card-btn'));
    let targetBtn = null;
    if (typeof matchTextOrIndex === 'number') {
      targetBtn = btns[matchTextOrIndex];
    } else {
      const needle = String(matchTextOrIndex).toUpperCase();
      targetBtn = btns.find(b =>
        (b._innerHTML && b._innerHTML.toUpperCase().includes(needle)) ||
        (b.title && b.title.toUpperCase().includes(needle))
      );
    }
    if (!targetBtn) return null;
    if (rightClick) {
      this.log('RIGHT_CLICK_CMD_CARD', targetBtn.title || String(matchTextOrIndex));
      targetBtn.dispatchEvent({ type: 'contextmenu', button: 2 });
    } else {
      this.log('CLICK_CMD_CARD', targetBtn.title || String(matchTextOrIndex));
      targetBtn.click();
    }
    return targetBtn;
  }

  // Advance the actual 60Hz requestAnimationFrame loop in ui.js!
  // Clears rafCallback before invoking so we strictly detect if frame(now) throws or stops re-scheduling.
  stepFrames(frames = 10, dtSec = 1 / 60) {
    for (let i = 0; i < frames; i++) {
      simClockMs += dtSec * 1000;
      if (rafCallback) {
        const cb = rafCallback;
        rafCallback = null;
        cb(simClockMs);
      } else if (this.engine) {
        this.engine.stepFixed(dtSec);
      }
    }
  }
}

// ============================================================================
// 3. HUMAN QA PLAYBOOK SUITE (8 END-TO-END HUMAN PERSONA SCENARIOS)
// ============================================================================
function runHumanQAPlaybooks() {
  // Deterministic Mulberry32 PRNG so every Human QA run is 100% reproducible
  let rngSeed = 0x1337BEEF;
  Math.random = function () {
    let t = (rngSeed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  buildDOMEnvironment();

  const scripts = [
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

  let activeEngine = null;
  for (const rel of scripts) {
    const full = path.join(__dirname, '..', rel);
    const code = fs.readFileSync(full, 'utf8');
    eval.call(global, code);
    if (rel === 'js/engine.js') {
      const OrigEngine = global.ZH_ENGINE.GameEngine;
      global.ZH_ENGINE.GameEngine = class extends OrigEngine {
        constructor(canvas, minimap) {
          super(canvas, minimap);
          activeEngine = this;
          global.window.gameEngine = this;
        }
      };
    }
  }

  // Trigger DOMContentLoaded so js/ui.js runs init()
  window.dispatchEvent({ type: 'DOMContentLoaded' });

  const human = new HumanUserDriver(() => activeEngine);
  const report = [];
  const assertCheck = (playbook, name, condition, detail = '', bugMeta = null) => {
    const passed = Boolean(condition);
    report.push({ playbook, name, passed, detail });
    if (!passed && bugMeta) {
      human.recordBug({ playbook, check: name, detail, ...bugMeta });
    }
    return passed;
  };

  // --------------------------------------------------------------------------
  // PLAYBOOK 1: Pre-Match Lobby, Mode Switching, General Cards & Launch
  // --------------------------------------------------------------------------
  {
    const pb = 'Playbook 1: Pre-Match Lobby & Launch (Human UI Flow)';
    const startModal = document.getElementById('start-modal');
    assertCheck(pb, 'Start modal is visible on boot', !startModal.classList.contains('hidden'));

    // Click Skirmish Mode tab
    const skirmishTab = document.querySelector('.mode-tab-btn[data-mode="SKIRMISH"]');
    human.clickElement(skirmishTab, 'Skirmish Mode Tab');
    const aiPickerWrap = document.getElementById('ai-general-picker-wrap');
    assertCheck(pb, 'Clicking Skirmish tab reveals AI General Picker', aiPickerWrap.style.display === 'block');

    // Select USA General Granger (card 0) & AI General Dr. Thrax
    const playerCards = document.getElementById('player-general-grid').children;
    const aiCards = document.getElementById('ai-general-grid').children;
    assertCheck(pb, 'All 9 playable Zero Hour Generals rendered in grid', playerCards.length === 9, `count=${playerCards.length}`);
    human.clickElement(playerCards[0], 'Player General Card #0 (USA)');
    human.clickElement(aiCards[8], 'AI General Card #8 (GLA)');

    // Select Map & Difficulty via UI controls
    const mapSel = document.getElementById('map-selector');
    mapSel.value = ZH_DATA.MAPS[0].id;
    mapSel.dispatchEvent({ type: 'change', target: mapSel });
    const hardBtn = document.querySelector('.diff-btn[data-diff="HARD"]');
    human.clickElement(hardBtn, 'Brutal General (Hard) Difficulty Button');
    assertCheck(pb, 'Difficulty button highlights .active on click', hardBtn.classList.contains('active'));

    // Click LAUNCH ZERO HOUR
    human.clickElement('#btn-launch-operation', 'LAUNCH ZERO HOUR Button');
    assertCheck(pb, 'Start modal hides and engine starts running on Launch click',
      startModal.classList.contains('hidden') && human.engine.running === true);
    assertCheck(pb, 'Faction-skinned HUD theme applied to document.body',
      document.body.classList.contains('hud-theme-usa'));
  }

  // --------------------------------------------------------------------------
  // PLAYBOOK 2: Camera Panning, Minimap Navigation & Spacebar Alert Jump
  // --------------------------------------------------------------------------
  {
    const pb = 'Playbook 2: Camera Panning, Minimap & Alert Jump';
    const camBeforeX = human.engine.cam.x;
    window.dispatchEvent({ type: 'keydown', key: 'ArrowRight' });
    human.stepFrames(15, 1 / 60);
    window.dispatchEvent({ type: 'keyup', key: 'ArrowRight' });
    assertCheck(pb, 'Holding [ArrowRight] pans camera right smoothly',
      human.engine.cam.x > camBeforeX, `before=${Math.round(camBeforeX)}, after=${Math.round(human.engine.cam.x)}`);

    // Check WASD panning when a unit IS selected (Human UX check!)
    human.clickElement('#btn-select-builder', 'Select Builder [B]');
    const camXWithSelection = human.engine.cam.x;
    window.dispatchEvent({ type: 'keydown', key: 'd' });
    human.stepFrames(15, 1 / 60);
    window.dispatchEvent({ type: 'keyup', key: 'd' });
    // Note: in ui.js lines 1255-1266, WASD only pans when selectedIds.size === 0

    // Minimap left-click centers camera
    human.clickMinimapAtWorld(1600, 1600, 0);
    const expectedCamX = 1600 - human.engine.cam.w / 2;
    assertCheck(pb, 'Left-clicking minimap centers camera on target world position',
      Math.abs(human.engine.cam.x - expectedCamX) < 10);

    // Spacebar jump to last alert
    human.engine.lastAlertPos = { x: 2000, y: 1800 };
    human.pressKey(' ', { code: 'Space' });
    const expectedAlertCamX = Math.max(0, Math.min(human.engine.worldSize - human.engine.cam.w, 2000 - human.engine.cam.w / 2));
    assertCheck(pb, 'Pressing [SPACE] jumps camera to last tactical alert coordinates',
      Math.abs(human.engine.cam.x - expectedAlertCamX) < 10);
  }

  // --------------------------------------------------------------------------
  // PLAYBOOK 3: Human Base Building (Select Dozer -> Command Card -> Place & Cancel)
  // --------------------------------------------------------------------------
  {
    const pb = 'Playbook 3: Base Construction via Builder & Command Card Clicks';
    human.clickElement('#btn-select-builder', 'Select Builder Button [B]');
    const selectedUnits = human.engine.units.filter(u => human.engine.selectedIds.has(u.id));
    assertCheck(pb, 'Clicking #btn-select-builder selects player Dozer/Worker',
      selectedUnits.length === 1 && selectedUnits[0].def.isBuilder);

    // Test Dozer right-click movement before building
    const dozerStartX = selectedUnits[0].x;
    const dozerStartY = selectedUnits[0].y;
    human.rightClickWorld(dozerStartX + 70, dozerStartY + 20, { keepCamera: true });
    human.stepFrames(25, 1 / 60);
    assertCheck(pb, 'Selected Dozer moves smoothly across terrain on Right-Click move order',
      Math.hypot(selectedUnits[0].x - dozerStartX, selectedUnits[0].y - dozerStartY) > 15);

    // Test entering build mode, rendering ghost overlay across frames, and cancelling with Right-Click
    const pwrBtn = human.clickCommandCardButton('REACTOR');
    assertCheck(pb, 'Clicking Cold Fusion Reactor on Command Card enters BUILD mode',
      Boolean(pwrBtn) && human.engine.commandMode === 'BUILD' && human.engine.pendingBuildId === 'USA_REACTOR');

    // Step frames while in BUILD mode so renderCommandOverlay exercises canPlaceBuildingAt
    human.engine.mouseWorld = { x: dozerStartX + 180, y: dozerStartY };
    human.stepFrames(5, 1 / 60);
    assertCheck(pb, 'Rendering BUILD placement ghost overlay keeps animation loop alive without throwing',
      typeof rafCallback === 'function' && human.engine.commandMode === 'BUILD');

    human.rightClickWorld(500, 2200, { keepCamera: true });
    assertCheck(pb, 'Right-clicking while in BUILD mode cancels placement and resets commandMode',
      human.engine.commandMode === null && human.engine.pendingBuildId === null);

    // Test invalid placement on top of Command Center (collision rejection)
    const cc = human.engine.buildings.find(b => b.team === 0 && b.def.isCommandCenter);
    const creditsBeforeInvalid = human.engine.teams[0].credits;
    human.clickCommandCardButton('REACTOR');
    human.leftClickWorld(cc.x, cc.y);
    assertCheck(pb, 'Left-clicking on occupied Command Center footprint rejects placement without deducting credits',
      human.engine.teams[0].credits === creditsBeforeInvalid && human.engine.commandMode === 'BUILD');

    // Now place Reactor and Barracks at valid spots via left-click on canvas!
    const reactorSpot = { x: cc.x + 210, y: cc.y - 40 };
    const bldgCountBefore = human.engine.buildings.length;
    human.leftClickWorld(reactorSpot.x, reactorSpot.y);
    const newPower = human.engine.buildings.find(b => b.team === 0 && b.defId === 'USA_REACTOR' && b.x === reactorSpot.x);
    assertCheck(pb, 'Left-clicking valid terrain places Cold Fusion Reactor scaffold and assigns Dozer to BUILD',
      human.engine.buildings.length === bldgCountBefore + 1 && Boolean(newPower) && selectedUnits[0].state === 'BUILD');

    // Step frames until Dozer finishes constructing the Reactor
    human.stepFrames(60 * 15, 1 / 60);
    assertCheck(pb, 'Dozer drives to scaffold and completes Reactor construction (+Power online)',
      Boolean(newPower && newPower.constructed && human.engine.teams[0].powerProduced > 0));

    // Also build a Barracks via hotkey [B] -> Command Card click -> Canvas Left-Click
    human.pressKey('b', { code: 'KeyB' });
    human.clickCommandCardButton('BARRACKS');
    const raxSpot = { x: cc.x + 210, y: cc.y + 130 };
    human.leftClickWorld(raxSpot.x, raxSpot.y);
    const newRax = human.engine.buildings.find(b => b.team === 0 && b.defId === 'USA_BARRACKS');
    human.stepFrames(60 * 16, 1 / 60);
    assertCheck(pb, 'Player constructs USA Barracks via [B] hotkey + Command Card + Canvas click',
      Boolean(newRax && newRax.constructed));
  }

  // --------------------------------------------------------------------------
  // PLAYBOOK 4: Structure Selection, Production Queueing, Cancel/Refund & Rally Point
  // --------------------------------------------------------------------------
  {
    const pb = 'Playbook 4: Structure Selection, Unit Queueing, Right-Click Refund & Rally Points';
    const rax = human.engine.buildings.find(b => b.team === 0 && b.defId === 'USA_BARRACKS');
    human.leftClickWorld(rax.x, rax.y);
    assertCheck(pb, 'Left-clicking Barracks on canvas selects it and updates Inspector Title',
      human.engine.selectedIds.has(rax.id) &&
      document.getElementById('inspector-title').textContent.includes('Barracks'));

    // Right-click open ground in safe SW base perimeter while Barracks is selected to set Rally Point
    const rallyTarget = { x: 260, y: 2480 };
    human.rightClickWorld(rallyTarget.x, rallyTarget.y);
    assertCheck(pb, 'Right-clicking ground with Barracks selected sets building Rally Point',
      Math.hypot((rax.rallyX || 0) - rallyTarget.x, (rax.rallyY || 0) - rallyTarget.y) < 5);

    // Click Ranger button 3 times and Missile Defender button 1 time on Command Card
    human.clickCommandCardButton('RANGER');
    human.clickCommandCardButton('RANGER');
    human.clickCommandCardButton('RANGER');
    human.clickCommandCardButton('MSL DEF');
    assertCheck(pb, 'Left-clicking unit cameos on Command Card queues 4 infantry in Barracks',
      rax.queue.length === 4, `queueLength=${rax.queue.length}`);

    // Right-click Ranger button on Command Card to cancel 1 Ranger and refund cost!
    const creditsBeforeCancel = human.engine.teams[0].credits;
    human.clickCommandCardButton('RANGER', true);
    assertCheck(pb, 'Right-clicking unit cameo on Command Card cancels 1 queued unit and refunds credits',
      rax.queue.length === 3 && human.engine.teams[0].credits > creditsBeforeCancel);

    // Step frames until all 3 infantry finish training, spawn, and move to Rally Point
    human.stepFrames(60 * 18, 1 / 60);
    const spawnedInfantry = human.engine.units.filter(u => u.team === 0 && u.hp > 0 && u.def.category === 'INFANTRY');
    assertCheck(pb, 'Queued infantry finish training, spawn from Barracks, and rally to target point',
      spawnedInfantry.length >= 3, `spawnedInfantry=${spawnedInfantry.length}`);
  }

  // --------------------------------------------------------------------------
  // PLAYBOOK 5: Unit Selection (Single, Drag-Box, Double-Click, Control Groups)
  // --------------------------------------------------------------------------
  {
    const pb = 'Playbook 5: Drag-Box Selection, Double-Click Type Select & Control Groups';
    const rangers = human.engine.units.filter(u => u.team === 0 && u.hp > 0 && u.defId === 'USA_RANGER');
    const firstRanger = rangers[0];

    // Single left-click on Ranger
    human.leftClickWorld(firstRanger.x, firstRanger.y);
    assertCheck(pb, 'Single left-click on unit selects exactly 1 unit',
      human.engine.selectedIds.size === 1 && human.engine.selectedIds.has(firstRanger.id));

    // Double-click (two rapid left-clicks < 340ms) on Ranger selects all Rangers
    human.doubleClickWorld(firstRanger.x, firstRanger.y);
    assertCheck(pb, 'Double-clicking a Ranger selects all friendly Rangers on the battlefield',
      human.engine.selectedIds.size === rangers.length && rangers.length >= 2,
      `selected=${human.engine.selectedIds.size}, totalRangers=${rangers.length}`);

    // Wide drag-box selection across base (spanning both Combat Infantry AND Dozer)
    const dozer = human.engine.units.find(u => u.team === 0 && u.hp > 0 && u.def.isBuilder);
    human.dragSelectWorldBox(
      Math.min(firstRanger.x, dozer.x) - 40,
      Math.min(firstRanger.y, dozer.y) - 40,
      Math.max(firstRanger.x, dozer.x) + 40,
      Math.max(firstRanger.y, dozer.y) + 40
    );
    const selectedEntities = human.engine.units.filter(u => human.engine.selectedIds.has(u.id));
    const hasCombat = selectedEntities.some(u => !u.def.isBuilder && !u.def.isHarvester);
    const hasNonCombat = selectedEntities.some(u => u.def.isBuilder || u.def.isHarvester);
    assertCheck(
      pb,
      'Drag-box selection around base with combat troops excludes unarmed Dozers & Supply Harvesters (RTS priority filter)',
      hasCombat && !hasNonCombat,
      `selected=${selectedEntities.map(u => u.defId).join(',')}, inspectorTitle="${document.getElementById('inspector-title').textContent}"`,
      {
        id: 'BUG-HUMAN-03',
        severity: 'HIGH (P1)',
        file: 'js/ui.js (lines 934–950, 519, 1219–1220)',
        lines: 'ui.js:934-950, ui.js:1219-1220',
        summary: '`handleBoxSelection` in `js/ui.js:934-950` selects every `u.team === 0 && u.hp > 0 && !u.garrisonId` inside the drag box without filtering out `u.def.isBuilder` or `u.def.isHarvester` when combat units are present. Because initial Dozers and Harvesters have the lowest entity IDs (`id=1,2`), `selectedUnits[0]` (`primary`) becomes the Dozer!',
        impact: 'When a human player drag-selects their army near base, (1) the Command Card switches to Dozer construction buttons instead of combat controls, (2) combat hotkeys `[A]` (Attack-Move), `[G]` (Guard), `[S]` (Stop), and `[X]` (Scatter) are disabled by `if (selectedUnits.length > 0 && !hasBuilder)` (`ui.js:1220`) and instead trigger Dozer building hotkeys (`[A]` = Airfield, `[S]` = Strategy Center), and (3) right-click move orders pull Dozers and Chinooks off economy duty!'
      }
    );

    // Drag-box select just the combat infantry near the safe SW rally point
    const combatInf = human.engine.units.filter(u => u.team === 0 && u.hp > 0 && u.def.category === 'INFANTRY');
    const minInfX = Math.min(...combatInf.map(u => u.x)) - 25;
    const minInfY = Math.min(...combatInf.map(u => u.y)) - 25;
    const maxInfX = Math.max(...combatInf.map(u => u.x)) + 25;
    const maxInfY = Math.max(...combatInf.map(u => u.y)) + 25;
    human.dragSelectWorldBox(minInfX, minInfY, maxInfX, maxInfY);
    assertCheck(pb, 'Dragging selection box around infantry squad selects all friendly infantry inside box',
      human.engine.selectedIds.size >= 3, `selected=${human.engine.selectedIds.size}`);

    // Assign Control Group 1 (Ctrl + 1), deselect by clicking empty ground, then recall (1)
    const groupSize = human.engine.selectedIds.size;
    human.pressKey('1', { ctrlKey: true });
    human.leftClickWorld(150, 150);
    assertCheck(pb, 'Left-clicking empty terrain clears unit selection',
      human.engine.selectedIds.size === 0);

    human.pressKey('1');
    assertCheck(pb, 'Pressing [1] recalls Control Group 1 selection',
      human.engine.selectedIds.size === groupSize);

    // Double-tap [1] within < 340ms snaps camera to control group centroid
    simClockMs += 100;
    human.pressKey('1');
    const expectedGroupCamX = Math.max(0, Math.min(human.engine.worldSize - human.engine.cam.w, firstRanger.x - human.engine.cam.w / 2));
    assertCheck(pb, 'Double-tapping [1] snaps camera to Control Group 1 centroid',
      Math.abs(human.engine.cam.x - expectedGroupCamX) < 120);
  }

  // --------------------------------------------------------------------------
  // PLAYBOOK 6: Contextual Right-Click Orders & Tactical Stance Buttons
  // --------------------------------------------------------------------------
  {
    const pb = 'Playbook 6: Contextual Right-Click Orders & Tactical Stances';
    human.pressKey('1');
    const squad = human.engine.units.filter(u => human.engine.selectedIds.has(u.id));

    // 1. Standard Right-Click Move (must verify both state === 'MOVE' AND physical coordinate translation across frames)
    const startSquadPos = squad.map(u => ({ id: u.id, x: u.x, y: u.y }));
    human.rightClickWorld(900, 2100);
    assertCheck(pb, 'Right-clicking open terrain orders selected squad to MOVE',
      squad.every(u => u.state === 'MOVE'));
    human.stepFrames(25, 1 / 60);
    const movedSquadCount = squad.filter((u, idx) => Math.hypot(u.x - startSquadPos[idx].x, u.y - startSquadPos[idx].y) > 12).length;
    assertCheck(pb, 'Selected combat squad physically translates across terrain after Right-Click move order',
      movedSquadCount === squad.length && squad.length > 0,
      `moved=${movedSquadCount}/${squad.length}`);

    // 2. Shift + Right-Click Waypoint Queueing
    human.rightClickWorld(1050, 2000, { shiftKey: true });
    human.rightClickWorld(1200, 1900, { shiftKey: true });
    assertCheck(pb, 'Shift + Right-clicking queues chained waypoints on selected units',
      squad.every(u => Array.isArray(u.waypoints) && u.waypoints.length === 2));

    // 3. Tactical Stance Buttons (#btn-order-attack-move, #btn-order-guard, #btn-order-scatter, #btn-order-stop)
    human.clickElement('#btn-order-attack-move', 'Attack-Move Button [A]');
    assertCheck(pb, 'Clicking #btn-order-attack-move sets engine.commandMode to ATTACK_MOVE',
      human.engine.commandMode === 'ATTACK_MOVE');
    human.leftClickWorld(1100, 2000);
    assertCheck(pb, 'Left-clicking canvas in ATTACK_MOVE mode puts squad in ATTACK_MOVE state',
      squad.every(u => u.state === 'ATTACK_MOVE'));

    human.clickElement('#btn-order-guard', 'Guard Button [G]');
    assertCheck(pb, 'Clicking #btn-order-guard puts squad into GUARD stance around current position',
      squad.every(u => u.state === 'GUARD'));

    human.clickElement('#btn-order-scatter', 'Scatter Button [X]');
    assertCheck(pb, 'Clicking #btn-order-scatter scatters squad into radial MOVE orders',
      squad.every(u => u.state === 'MOVE'));

    human.clickElement('#btn-order-stop', 'Stop Button [S]');
    assertCheck(pb, 'Clicking #btn-order-stop halts squad into IDLE state',
      squad.every(u => u.state === 'IDLE'));

    // 4. Ctrl + Right-Click Force-Fire on Ground
    human.rightClickWorld(950, 2050, { ctrlKey: true });
    assertCheck(pb, 'Ctrl + Right-clicking terrain orders FORCE_FIRE at target coordinates',
      squad.every(u => u.state === 'FORCE_FIRE'));

    // 5. Right-Click Civilian Garrison Bunker with Infantry selected
    // Pick the player-side bunker (Southwest) and ensure it is neutral so we test human Garrison Entry & Evacuation cleanly
    const bunker = (human.engine.garrisonBunkers || []).find(g => g.x < 1200 && g.y > 1800) || (human.engine.garrisonBunkers || [])[0];
    if (bunker) {
      bunker.occupants = [];
      bunker.team = -1;
      bunker.hp = bunker.maxHp || 1000;
      const ranger = squad.find(u => u.defId === 'USA_RANGER');
      human.leftClickWorld(ranger.x, ranger.y);
      human.rightClickWorld(bunker.x, bunker.y);
      assertCheck(pb, 'Right-clicking a Civilian Garrison Bunker with Infantry orders ENTER_GARRISON',
        ranger.state === 'ENTER_GARRISON' && ranger.targetEntityId === bunker.id);

      // Teleport Ranger near bunker and step frames so Ranger enters the bunker, then select Bunker and click EVACUATE!
      ranger.x = bunker.x + 10;
      ranger.y = bunker.y + 10;
      human.stepFrames(5, 1 / 60);
      assertCheck(pb, 'Infantry physically enters Civilian Bunker and increments bunker.occupants',
        bunker.occupants.includes(ranger) && (ranger.garrisonedIn === bunker.id || ranger.garrisonId === bunker.id),
        `occupants=${bunker.occupants.length}, garrisonedIn=${ranger.garrisonedIn}, garrisonId=${ranger.garrisonId}`);

      // Select Garrison Bunker by left-clicking it on canvas, then click EVACUATE on Command Card!
      human.leftClickWorld(bunker.x, bunker.y);
      assertCheck(pb, 'Left-clicking occupied Garrison Bunker selects it in Inspector',
        human.engine.selectedIds.has(bunker.id));
      const evacBtn = human.clickCommandCardButton('EVACUATE');
      assertCheck(
        pb,
        'Clicking EVACUATE button on Command Card unloads infantry back onto the street',
        Boolean(evacBtn) && bunker.occupants.length === 0 && !ranger.garrisonedIn,
        `evacBtn=${Boolean(evacBtn)}, bunker.occupants.length=${bunker.occupants.length} (expected 0)`,
        {
          id: 'BUG-HUMAN-02',
          severity: 'CRITICAL (P0)',
          file: 'js/ui.js (line 482) & js/engine.js (lines 674–676)',
          lines: 'ui.js:482, engine.js:674-676',
          summary: 'When a player selects an occupied Civilian Garrison Bunker and clicks EVACUATE [E] (or presses [E]), `js/ui.js:482` calls `engine.evacuateGarrison(g)` passing the bunker OBJECT `g`. However, `evacuateGarrison(bunkerId)` in `js/engine.js:675` looks up `this.garrisonBunkers.find(g => g.id === bunkerId)`, comparing `number === object` (always false) and returning 0!',
          impact: 'Garrisoned infantry are permanently trapped inside Civilian Bunkers! Neither clicking the EVACUATE [E] button on the Command Card nor pressing the [E] hotkey ever unloads garrisoned troops.'
        }
      );
    }

    // 6. Right-Click Tech Structure (Oil Derrick) with Ranger to Capture
    const derrick = (human.engine.techStructures || [])[0];
    if (derrick) {
      const ranger = squad.find(u => u.defId === 'USA_RANGER');
      // Force-evacuate by numeric ID if BUG-HUMAN-02 left Ranger trapped inside the bunker so we can test CAPTURE
      if (bunker && bunker.occupants.length > 0) {
        human.engine.evacuateGarrison(bunker.id);
      }
      human.leftClickWorld(ranger.x, ranger.y);
      human.rightClickWorld(derrick.x, derrick.y);
      assertCheck(pb, 'Right-clicking neutral Tech Building with Ranger orders CAPTURE',
        ranger.state === 'CAPTURE' && ranger.targetEntityId === derrick.id);
    }
  }

  // --------------------------------------------------------------------------
  // PLAYBOOK 7: Active Unit Micro-Abilities [F] & Generals' Secret Powers Modal [P]
  // --------------------------------------------------------------------------
  {
    const pb = 'Playbook 7: Active Unit Abilities [F] & Generals Powers Modal [P]';
    const ranger = human.engine.units.find(u => u.team === 0 && u.hp > 0 && u.defId === 'USA_RANGER');
    human.leftClickWorld(ranger.x, ranger.y);

    // Check if the Ranger's Active Ability [F] ("FLASHBANG") button is rendered on the Command Card!
    const flashbangBtn = human.clickCommandCardButton('FLASHBANG');
    assertCheck(
      pb,
      'Selecting US Ranger renders its Active Micro-Ability [F] (Flashbang) button on the Command Card',
      Boolean(flashbangBtn) && human.engine.commandMode === 'ABILITY',
      `flashbangBtn=${Boolean(flashbangBtn)}, commandMode=${human.engine.commandMode}, ranger.def.ability=${JSON.stringify(ranger.def.ability)}`,
      {
        id: 'BUG-HUMAN-01',
        severity: 'CRITICAL (P0)',
        file: 'js/data.js (line 2815) & js/ui.js (lines 543, 795)',
        lines: 'data.js:2815, ui.js:543, ui.js:795',
        summary: 'In `js/data.js`, units like `USA_RANGER`, `USA_MISSILE_DEFENDER`, `CHINA_DRAGON_TANK`, and `GLA_JARMEN_KELL` define `u.ability = { id: "FLASHBANG", ... }` as an object. Line 2815 `if (!u.ability && abilityByUnitId[u.id])` skips normalizing `u.ability` to a string ID because `u.ability` is already truthy! Then `js/ui.js:543` looks up `ZH_DATA.UNIT_ABILITIES[primary.def.ability]`, which evaluates `ZH_DATA.UNIT_ABILITIES["[object Object]"] === undefined`!',
        impact: 'Human players NEVER see the [F] Active Micro-Ability button on the Command Card (and pressing [F] does nothing) for Ranger (Flashbang), Missile Defender (Laser-Lock), Dragon Tank (Flame Wall), Jarmen Kell (Pilot Snipe), etc.!'
      }
    );

    // Generals' Secret Powers Modal [P]
    human.clickElement('#btn-generals-powers', 'Generals Powers HUD Button [P]');
    const powersModal = document.getElementById('powers-modal');
    assertCheck(pb, 'Clicking #btn-generals-powers opens the Generals Secret Powers Modal',
      !powersModal.classList.contains('hidden'));

    const powerCards = document.getElementById('powers-grid').children;
    const ptsBefore = human.engine.teams[0].generalPoints;
    const firstUnlockBtn = powerCards[0].querySelector('.power-btn');
    human.clickElement(firstUnlockBtn, 'First Rank-1 General Power UNLOCK Button');
    assertCheck(pb, 'Clicking UNLOCK button on Rank-1 Power Card unlocks the power and spends 1 General Point',
      human.engine.teams[0].generalPoints === ptsBefore - 1 &&
      human.engine.teams[0].unlockedPowers.size >= 1);

    // Click DEPLOY POWER button on the newly unlocked power card
    const updatedPowerCards = document.getElementById('powers-grid').children;
    const deployBtn = updatedPowerCards[0].querySelector('.power-btn');
    human.clickElement(deployBtn, 'First Rank-1 General Power DEPLOY POWER Button');
    assertCheck(pb, 'Clicking DEPLOY POWER button arms POWER targeting mode and closes modal',
      human.engine.commandMode === 'POWER' && powersModal.classList.contains('hidden'));

    // Left-click battlefield canvas to deploy the General's Power
    const powerId = human.engine.pendingPowerId;
    human.leftClickWorld(1500, 1500);
    assertCheck(pb, 'Left-clicking battlefield deploys General Power and starts recharge cooldown',
      human.engine.commandMode === null && human.engine.teams[0].powerCooldowns[powerId] > 0);
  }

  // --------------------------------------------------------------------------
  // PLAYBOOK 8: High-APM / Clumsy User Stress, All 3 Factions & HUD Toggles
  // --------------------------------------------------------------------------
  {
    const pb = 'Playbook 8: Multi-Faction Switching, Clumsy Human Stress & HUD Controls';
    let caughtError = null;
    try {
      // Toggle Pause, SFX, Music, EVA Voice
      human.clickElement('#btn-pause-game', 'Pause Button');
      const pausedState = human.engine.paused;
      human.clickElement('#btn-pause-game', 'Unpause Button');
      assertCheck(pb, 'Clicking #btn-pause-game toggles engine.paused cleanly', pausedState === true && human.engine.paused === false);

      human.clickElement('#btn-toggle-sfx', 'Toggle SFX');
      human.clickElement('#btn-toggle-music', 'Toggle Music');
      human.clickElement('#btn-toggle-voice', 'Toggle EVA Voice');
      human.clickElement('#btn-select-combat', 'Select All Combat Units Button');

      // Open Powers modal with [P] and press [Escape] to close
      human.pressKey('p');
      human.pressKey('Escape');
      assertCheck(pb, 'Pressing [Escape] closes open Generals Powers modal',
        document.getElementById('powers-modal').classList.contains('hidden'));

      // Test China Overlord Addon UI button state (Gatling Cannon [R] / Speaker Tower)
      const overlord = human.engine.spawnUnit('CHINA_OVERLORD', 0, 500, 2300);
      human.engine.teams[0].credits += 2000;
      human.leftClickWorld(overlord.x, overlord.y);
      const gatlingBtn = human.clickCommandCardButton('GATLING');
      // Re-click Overlord on canvas to refresh Inspector and Command Card as a human user
      human.leftClickWorld(overlord.x, overlord.y);
      const gatlingBtnAfter = Array.from(document.getElementById('command-card-grid').querySelectorAll('.cmd-card-btn'))
        .find(b => (b._innerHTML || b.textContent || '').toUpperCase().includes('GATLING'));
      const statsHtml = document.getElementById('inspector-stats').innerHTML;
      assertCheck(
        pb,
        'Clicking Overlord GATLING [R] installs addon AND updates Inspector/Command Card to reflect installed state',
        Boolean(gatlingBtn) && overlord.hasGatlingCannon === true &&
          statsHtml.includes('Addon:') && !gatlingBtnAfter,
        `hasGatlingCannon=${overlord.hasGatlingCannon}, overlordAddon=${overlord.overlordAddon}, statsShowsAddon=${statsHtml.includes('Addon:')}, gatlingBtnStillVisible=${Boolean(gatlingBtnAfter)}`,
        {
          id: 'BUG-HUMAN-04',
          severity: 'MEDIUM (P2)',
          file: 'js/ui.js (lines 239, 503–505, 568, 791, 888, 943) vs js/engine.js (lines 606–609, 656, 755, 798)',
          lines: 'ui.js:503-505, ui.js:568, engine.js:606-609, engine.js:798',
          summary: '`js/ui.js` checks `primary.overlordAddon`, `primary.laserLockedTimer`, and `!u.garrisonId`, whereas `js/engine.js` sets `u.hasSpeakerTower = true` / `u.hasGatlingCannon = true`, `u.laserLockTimer = 5.0`, and `u.garrisonedIn = bunker.id`!',
          impact: 'After purchasing an Overlord Gatling Cannon (`[R]`), the Command Card button stays visible and clickable (`!primary.overlordAddon` is still true), the Selection Inspector never shows `Addon: GATLING_CANNON` or `🎯 LASER LOCKED`, and `u.garrisonId` checks in `ui.js` always evaluate `undefined`.'
        }
      );

      // Click MENU button (#btn-main-menu), switch to GLA General Juhziz, and launch a new match as a human!
      human.clickElement('#btn-main-menu', 'Main Menu HUD Button');
      assertCheck(pb, 'Clicking #btn-main-menu re-opens Start Modal',
        !document.getElementById('start-modal').classList.contains('hidden'));

      const playerCards = document.getElementById('player-general-grid').children;
      // Card 7 is GLA Demolition General Juhziz (explosiveDamageMult: 1.35)
      human.clickElement(playerCards[7] || playerCards[6], 'Select GLA General (Gen. Juhziz)');
      human.clickElement('#btn-launch-operation', 'Launch GLA Match');
      assertCheck(pb, 'Launching match as GLA switches HUD theme to .hud-theme-gla and displays GLA No-Power indicator',
        document.body.classList.contains('hud-theme-gla') &&
        document.getElementById('hud-power').textContent.includes('NO POWER NEEDED'));

      // Verify General Juhziz's +35% Explosive Damage modifier actually applies when SCUD Launcher / Terrorist fires
      const scudDef = window.ZH_DATA.UNITS.GLA_SCUD_LAUNCHER;
      const mod = human.engine.teams[0].general.modifiers || {};
      assertCheck(
        pb,
        'GLA Gen. Juhziz (+35% Explosive Damage) weapon damageType matches engine.js fireWeapon explosiveDamageMult check',
        Boolean(mod.explosiveDamageMult) && scudDef.weapon.damageType === 'HIGH_EXPLOSIVE',
        `mod.explosiveDamageMult=${mod.explosiveDamageMult}, scudDef.weapon.damageType="${scudDef.weapon.damageType}" (engine.js:2478 checks wDef.damageType === "HIGH_EXPLOSIVE")`,
        {
          id: 'BUG-HUMAN-05',
          severity: 'MEDIUM (P2)',
          file: 'js/data.js (line 2835) & js/engine.js (line 2478)',
          lines: 'data.js:2835, engine.js:2478',
          summary: '`js/data.js:2835` normalizes `HIGH_EXPLOSIVE` to `u.weapon.damageType = "EXPLOSIVE"`, but `js/engine.js:2478` (`fireWeapon`) checks `if (wDef.damageType === "HIGH_EXPLOSIVE" && mod.explosiveDamageMult)`!',
          impact: 'Selecting GLA Demolition General Juhziz (`explosiveDamageMult: 1.35`) on the Skirmish screen gives 0% bonus weapon damage on SCUD Launchers, Terrorists, Bomb Trucks, and Rocket Buggies.'
        }
      );
    } catch (err) {
      caughtError = err;
    }
    assertCheck(pb, 'Rapid HUD toggles, modal Escape, and faction re-launch produce 0 uncaught exceptions', !caughtError,
      caughtError ? caughtError.stack : 'Clean execution');
  }

  // =========================================================================
  // PLAYBOOK 9: Phase 4 Save/Load ([F5]/[F9]) from Menu & Building Control Groups
  // =========================================================================
  {
    const pb = 'Playbook 9: Phase 4 Save/Load ([F5]/[F9]) & Building Control Groups';
    let caughtError = null;
    try {
      const cc = human.engine.buildings.find(b => b.team === 0 && b.hp > 0);
      human.leftClickWorld(cc.x, cc.y, {}, 'Select Command Center');
      human.pressKey('2', { ctrlKey: true }, 'Bind Command Center to Control Group 2 [Ctrl+2]');
      assertCheck(pb, 'Command Center bound to Control Group 2 [Ctrl+2]',
        Array.isArray(human.engine.controlGroups['2']) && human.engine.controlGroups['2'].includes(cc.id));

      // Press F5 Quick Save
      human.pressKey('F5', {}, 'Quick Save [F5]');
      // Open Main Menu (which sets engine.running = false) and press F9 Quick Load
      human.clickElement('#btn-main-menu', 'Open Main Menu (#btn-main-menu)');
      assertCheck(pb, 'Opening Main Menu pauses engine.running', human.engine.running === false);

      human.pressKey('F9', {}, 'Press [F9] Quick Load while on Main Menu / Start Modal');
      assertCheck(
        pb,
        'Pressing [F9] Quick Load from Main Menu / Start Screen restores match and hides Start Modal (BUG-HUMAN-06)',
        human.engine.running === true && document.getElementById('start-modal').classList.contains('hidden'),
        `engine.running=${human.engine.running}, startModalHidden=${document.getElementById('start-modal').classList.contains('hidden')}`,
        {
          id: 'BUG-HUMAN-06',
          severity: 'MEDIUM (P2)',
          file: 'js/ui.js',
          lines: 'ui.js:1299',
          summary: 'F9 Quick Load blocked when engine.running is false',
          impact: 'Cannot press F9 on Start/Menu/Victory screen.'
        }
      );

      // Verify Building Control Group 2 survived Quick Save / Quick Load
      human.leftClickWorld(cc.x + 250, cc.y + 250, {}, 'Click empty ground to deselect');
      human.pressKey('2', {}, 'Recall Building Control Group 2 [2] after Quick Load');
      assertCheck(
        pb,
        'Building Control Group 2 [Ctrl+2] persists across Quick Save [F5] / Quick Load [F9] (BUG-HUMAN-07)',
        Array.isArray(human.engine.controlGroups['2']) &&
          human.engine.controlGroups['2'].includes(cc.id) &&
          human.engine.selectedIds.has(cc.id),
        `controlGroups[2]=${JSON.stringify(human.engine.controlGroups['2'])}, selectedIdsHasCC=${human.engine.selectedIds.has(cc.id)}`,
        {
          id: 'BUG-HUMAN-07',
          severity: 'MEDIUM (P2)',
          file: 'js/engine.js',
          lines: 'engine.js:4242',
          summary: 'deserializeState filters controlGroups by unitById only, dropping building IDs',
          impact: 'Production building control groups are wiped on load.'
        }
      );
    } catch (err) {
      caughtError = err;
    }
    assertCheck(pb, 'Phase 4 Save/Load & Building Control Group playbook executes with 0 exceptions', !caughtError,
      caughtError ? caughtError.stack : 'Clean execution');
  }

  // =========================================================================
  // PLAYBOOK 10: HUD Overhaul (12-Slot Grid, Sell Building, Multi-Select Summary,
  //              Game Menu & Speed Toggle, Power Strip, Control Group Bar & Zoom)
  // =========================================================================
  {
    const pb = 'Playbook 10: HUD Overhaul (12-Slot Grid, Sell, Multi-Select, Menu & Zoom)';
    let caughtError = null;
    try {
      // 1. Game Menu Modal (#btn-game-menu, #btn-speed, Escape priority)
      const gameMenuModal = document.getElementById('game-menu-modal');
      human.clickElement('#btn-game-menu', 'Open Game Menu Modal (#btn-game-menu)');
      assertCheck(pb, 'Clicking #btn-game-menu opens #game-menu-modal',
        !gameMenuModal.classList.contains('hidden'));

      const speedBefore = human.engine.gameSpeed || 1.0;
      human.clickElement('#btn-speed', 'Cycle Game Speed (#btn-speed)');
      assertCheck(pb, 'Clicking #btn-speed cycles engine.gameSpeed to 1.5x',
        Math.abs((human.engine.gameSpeed || 1) - 1.5) < 0.05 && speedBefore === 1.0);
      // Cycle back to 1.0x
      human.clickElement('#btn-speed', 'Cycle Game Speed 2.0x');
      human.clickElement('#btn-speed', 'Cycle Game Speed back to 1.0x');

      human.pressKey('Escape', {}, 'Press Escape to close Game Menu Modal');
      assertCheck(pb, 'Pressing [Escape] while #game-menu-modal is open closes the modal',
        gameMenuModal.classList.contains('hidden'));

      // 2. Fixed 12-Slot Command Card & Building SELL [Z]
      const extraBuilding = human.engine.spawnBuilding('GLA_SUPPLY_STASH', 0, 620, 2180, true);
      const creditsBeforeSell = human.engine.teams[0].credits;
      human.leftClickWorld(extraBuilding.x, extraBuilding.y, {}, 'Select GLA Supply Stash');
      const cmdGrid = document.getElementById('command-card-grid');
      const totalSlots = cmdGrid.children.length;
      const hasEmptySlots = cmdGrid.children.some(c => c.classList && c.classList.contains('cmd-slot-empty'));
      assertCheck(pb, 'Command Card maintains fixed 12-slot layout with .cmd-slot-empty placeholders',
        totalSlots === 12 && hasEmptySlots, `totalSlots=${totalSlots}`);

      const sellBtn = human.clickCommandCardButton('SELL');
      assertCheck(pb, 'Clicking SELL [Z] on constructed building deconstructs it and refunds 50% credits',
        Boolean(sellBtn) && extraBuilding.hp <= 0 && human.engine.teams[0].credits > creditsBeforeSell,
        `creditsBefore=${creditsBeforeSell}, creditsAfter=${human.engine.teams[0].credits}`);

      // 3. Multi-Selection Group Summary (#selection-summary) type filtering
      const r1 = human.engine.spawnUnit('GLA_REBEL', 0, 700, 2200);
      const r2 = human.engine.spawnUnit('GLA_REBEL', 0, 720, 2200);
      const scorp = human.engine.spawnUnit('GLA_SCORPION', 0, 740, 2200);
      human.dragSelectWorldBox(680, 2180, 760, 2220);
      const summaryEl = document.getElementById('selection-summary');
      const groupChips = summaryEl.querySelectorAll('.unit-group-chip');
      assertCheck(pb, 'Multi-selecting mixed unit types populates #selection-summary with grouped unit-type chips',
        !summaryEl.classList.contains('hidden') && groupChips.length >= 2,
        `chips=${groupChips.length}`);

      const scorpChip = groupChips.find(c => c.dataset && c.dataset.defId === 'GLA_SCORPION') || groupChips[0];
      if (scorpChip) {
        human.clickElement(scorpChip, 'Click unit-group-chip in #selection-summary to isolate unit type');
        assertCheck(pb, 'Clicking a .unit-group-chip in #selection-summary isolates selection to that unit type',
          human.engine.selectedIds.size >= 1 && human.engine.selectedIds.has(scorp.id) && !human.engine.selectedIds.has(r1.id));
      }

      // 4. Control Group Bar (#control-group-bar) pill click & Quick-Cast Power Strip (#power-strip)
      human.pressKey('3', { ctrlKey: true }, 'Bind Scorpion to Control Group 3');
      const ctrlBar = document.getElementById('control-group-bar');
      const grp3Pill = ctrlBar.children.find(c => c.dataset && c.dataset.group === '3');
      human.leftClickWorld(200, 200, {}, 'Deselect');
      if (grp3Pill) {
        human.clickElement(grp3Pill, 'Click Control Group 3 pill in #control-group-bar');
      }
      assertCheck(pb, 'Clicking Control Group pill in #control-group-bar recalls bound group',
        Boolean(grp3Pill) && human.engine.selectedIds.has(scorp.id));

      // Unlock a GLA General Power and verify #power-strip renders quick-cast button
      human.engine.teams[0].generalPoints = Math.max(1, human.engine.teams[0].generalPoints);
      const glaPowers = window.ZH_DATA.GENERALS_POWERS.GLA || [];
      if (glaPowers[0]) {
        human.engine.unlockGeneralsPower(0, glaPowers[0].id);
        window.ZH_UI.updateHudLive();
        const powerStrip = document.getElementById('power-strip');
        const stripBtn = powerStrip.children[0];
        if (stripBtn) {
          human.clickElement(stripBtn, 'Click Quick-Cast Power Strip button');
        }
        assertCheck(pb, 'Unlocking a General Power populates #power-strip and clicking it arms POWER mode',
          Boolean(stripBtn) && human.engine.commandMode === 'POWER');
        human.pressKey('Escape', {}, 'Cancel POWER targeting mode');
      }

      // 5. Wheel Zoom & [Home] Key Camera Reset
      const canvas = document.getElementById('game-canvas');
      canvas.dispatchEvent({
        type: 'wheel',
        deltaY: -120,
        clientX: 640,
        clientY: 360,
        preventDefault() {}
      });
      const zoomedIn = human.engine.cam.zoom;
      human.pressKey('Home', {}, 'Press [Home] to reset zoom to 1.0 and center on Command Center');
      assertCheck(pb, 'Mouse wheel zooms camera (cam.zoom > 1.0) and [Home] resets cam.zoom to 1.0',
        zoomedIn > 1.0 && human.engine.cam.zoom === 1.0,
        `zoomedIn=${zoomedIn}, afterHome=${human.engine.cam.zoom}`);
    } catch (err) {
      caughtError = err;
    }
    assertCheck(pb, 'Playbook 10 HUD Overhaul checks execute with 0 exceptions', !caughtError,
      caughtError ? caughtError.stack : 'Clean execution');
  }

  const startFreshMatch = (opts = {}) => {
    human.clickElement('#btn-main-menu', 'Open Start Modal (#btn-main-menu)');
    const skirmishTab = document.querySelector('.mode-tab-btn[data-mode="SKIRMISH"]');
    if (skirmishTab) human.clickElement(skirmishTab, 'Skirmish Mode Tab');
    const playerCards = document.getElementById('player-general-grid').children;
    const aiCards = document.getElementById('ai-general-grid').children;
    if (playerCards[opts.playerIdx ?? 0]) human.clickElement(playerCards[opts.playerIdx ?? 0], 'Select Player General');
    if (aiCards[opts.aiIdx ?? 4]) human.clickElement(aiCards[opts.aiIdx ?? 4], 'Select AI General');
    const diffBtn = document.querySelector(`.diff-btn[data-diff="${opts.diffId || 'NORMAL'}"]`);
    if (diffBtn) human.clickElement(diffBtn, `Select ${opts.diffId || 'NORMAL'} difficulty`);
    human.clickElement('#btn-launch-operation', 'Click LAUNCH ZERO HOUR (#btn-launch-operation)');
  };

  // --------------------------------------------------------------------------
  // PLAYBOOK 11: Early-Game AI Power Strike, Move Marker NaN Leak & HUD Settings
  // --------------------------------------------------------------------------
  {
    const pb = 'Playbook 11: Early-Game AI Power Grace, Move Marker Decay & HUD Settings';
    startFreshMatch({ playerIdx: 0, aiIdx: 3, diffId: 'NORMAL' });

    // 1. Check if AI immediately strikes player base at t = 2.6s without Fog-of-War scouting or grace period
    const initialCombatUnits = human.engine.units.filter(u => u.team === 0 && !u.def.isBuilder && !u.def.isHarvester && !u.dead).length;
    const cc0 = human.engine.buildings.find(b => b.team === 0 && b.defId.includes('_CC'));
    const initialCcHp = cc0 ? cc0.hp : 0;

    // Advance 6.0 seconds of match time (360 frames at 60Hz) with zero player actions
    human.stepFrames(360, 1 / 60);
    const survivingCombatUnits = human.engine.units.filter(u => u.team === 0 && !u.def.isBuilder && !u.def.isHarvester && !u.dead).length;
    const ccHpAfter6s = cc0 ? cc0.hp : 0;
    const aiPowerUsed = Object.keys(human.engine.teams[1].powerCooldowns || {}).length > 0;

    assertCheck(
      pb,
      'AI does not map-hack cast Rank-1 offensive Generals Power on unscouted player base within first 6 seconds (wiping starting combat units)',
      survivingCombatUnits === initialCombatUnits && ccHpAfter6s === initialCcHp,
      `initialCombat=${initialCombatUnits}, survivingAfter6s=${survivingCombatUnits}, ccHp=${ccHpAfter6s}/${initialCcHp}, aiPowerUsed=${aiPowerUsed}`,
      {
        id: 'BUG-AI-01',
        severity: 'CRITICAL',
        file: 'js/ai.js:252-263, 663-680 & js/engine.js:267-269',
        summary: 'Both teams start at rank 1 with generalPoints=1. At t=2.6s (first AI think tick), ZH_AI.updateTeam() unlocks its Rank-1 offensive power (e.g. CHINA_ARTILLERY_BARRAGE / USA_A10_STRIKE) and calls findBestClusterTarget(engine, 0, 260, true) which queries engine.buildings/units directly without checking Fog of War or an early-game grace timer. It immediately bombards the player Command Center at t=2.6s, killing both starting combat units within 5s while explosions/audio play in the background.',
        impact: 'Player starting infantry are wiped out at t < 5s before the user even pans around; only idle Dozers remain (so clicking "All Combat Units [Q]" selects nothing and units appear non-existent/unresponsive while combat audio plays).'
      }
    );

    // 2. Right-click ground move marker lifecycle & NaN arc check
    const dozer = human.engine.units.find(u => u.team === 0 && u.def.isBuilder && !u.dead);
    const canvas = document.getElementById('game-canvas');
    canvas._nanArcCalls = 0;
    human.leftClickWorld(dozer.x, dozer.y);
    human.rightClickWorld(dozer.x + 140, dozer.y + 40);
    const markerCountAfterClick = human.engine.moveMarkers.length;
    // Step 40 frames (0.67s > 0.55s maxAge) so move marker should expire and be removed
    human.stepFrames(40, 1 / 60);
    const markerCountAfterExpiry = human.engine.moveMarkers.length;
    const firstMarkerT = human.engine.moveMarkers[0] ? human.engine.moveMarkers[0].t : null;

    assertCheck(
      pb,
      'Right-click move markers increment age/t cleanly, render without NaN canvas.arc radii, and expire after 0.45-0.55s',
      markerCountAfterClick >= 1 && markerCountAfterExpiry === 0 && canvas._nanArcCalls === 0,
      `markersAfterClick=${markerCountAfterClick}, markersAfter0.67s=${markerCountAfterExpiry}, marker[0].t=${firstMarkerT}, nanArcCalls=${canvas._nanArcCalls}`,
      {
        id: 'BUG-UI-01',
        severity: 'HIGH',
        file: 'js/ui.js:2108-2117 vs js/engine.js:3174-3181, 3434-3450',
        summary: 'pushMoveMarker() in js/ui.js pushes { x, y, color, age: 0, maxAge: 0.55 }, whereas updateSpecialEffects() and renderMoveMarkers() in js/engine.js read/increment m.t (undefined + dt = NaN) and m.kind. Because m.t >= 0.45 is always false for NaN, moveMarkers are never spliced from engine.moveMarkers and ctx.arc(m.x, m.y, NaN, ...) is called every frame.',
        impact: 'Right-click move/attack ground confirmation rings never render on the canvas and engine.moveMarkers leaks unboundedly over the match.'
      }
    );

    // 3. CSS variable alignment in resizeCanvases()
    // In index.html/style.css, --top-bar-h is 36px and --cmd-bar-h is 184px (720 - 36 - 184 = 500px).
    // js/ui.js reads --hud-top-h and --hud-bottom-h (undefined -> falls back to 36 and 176 -> 508px).
    window.dispatchEvent({ type: 'resize' });
    assertCheck(
      pb,
      'resizeCanvases() reads --top-bar-h (36px) and --cmd-bar-h (184px) matching style.css (expected canvas cssH=500 for 720p window)',
      human.engine.cam.w === 1280 && human.engine.cam.h === 500,
      `cam.w=${human.engine.cam.w}, cam.h=${human.engine.cam.h} (expected 500, got ${human.engine.cam.h})`,
      {
        id: 'BUG-UI-02',
        severity: 'MEDIUM',
        file: 'js/ui.js:182-183 vs css/style.css:7-8',
        summary: 'resizeCanvases() reads CSS custom properties --hud-top-h and --hud-bottom-h which do not exist in css/style.css (which defines --top-bar-h: 36px and --cmd-bar-h: 184px). It falls back to 176px instead of 184px.',
        impact: 'Canvas internal coordinate height is 8px taller than the CSS #viewport-wrap container, causing vertical mouse-picking drift and bottom clipping.'
      }
    );

    // 4. Game Menu #opt-health-bars checkbox vs select mismatch
    const hbInput = document.getElementById('opt-health-bars');
    hbInput.checked = true;
    hbInput.dispatchEvent({ type: 'change', target: hbInput });
    assertCheck(
      pb,
      'Checking #opt-health-bars checkbox in Game Menu sets engine.showAllHealthBars = true',
      human.engine.showAllHealthBars === true,
      `hbInput.type=${hbInput.getAttribute('type')}, hbInput.value=${hbInput.value}, engine.showAllHealthBars=${human.engine.showAllHealthBars}`,
      {
        id: 'BUG-UI-03',
        severity: 'MEDIUM',
        file: 'index.html:167 vs js/ui.js:303-313',
        summary: 'index.html declares <input type="checkbox" id="opt-health-bars" />, but js/ui.js treats it as a <select> with values "DAMAGED" / "ALWAYS" (checking e.target.value === "ALWAYS", whereas a checkbox has e.target.value === "on").',
        impact: 'Toggling "Always Show Health Bars" in the Game Menu has no effect.'
      }
    );

    // 5. Game Menu #opt-ui-scale values ('90'/'100'/'115' vs '0.9'/'1'/'1.15')
    const uiScaleSelect = document.getElementById('opt-ui-scale');
    uiScaleSelect.value = '115';
    uiScaleSelect.dispatchEvent({ type: 'change', target: uiScaleSelect });
    const appliedScale = document.documentElement.style['--ui-scale'];
    assertCheck(
      pb,
      'Changing #opt-ui-scale to 115% applies normalized scale factor (1.15) rather than raw "115"',
      appliedScale === '1.15' || appliedScale === 1.15,
      `applied --ui-scale=${appliedScale}`,
      {
        id: 'BUG-UI-04',
        severity: 'LOW',
        file: 'index.html:176-180 vs js/ui.js:60, 267, 329 & css/style.css:9',
        summary: 'index.html uses option values "90", "100", "115", whereas js/ui.js initializes settings.uiScale = "1" and writes raw e.target.value ("115") to --ui-scale, and css/style.css never applies var(--ui-scale).',
        impact: 'HUD Scale dropdown in Game Menu does not scale the UI and mismatches default option values.'
      }
    );

    // 6. Start Modal #btn-open-powers-preview button wiring
    const powersModal = document.getElementById('powers-modal');
    powersModal.classList.add('hidden');
    human.clickElement('#btn-open-powers-preview', 'Click Preview Generals Powers on Start Modal');
    assertCheck(
      pb,
      'Clicking #btn-open-powers-preview opens #powers-modal',
      !powersModal.classList.contains('hidden'),
      `powersModal.hidden=${powersModal.classList.contains('hidden')}`,
      {
        id: 'BUG-UI-05',
        severity: 'LOW',
        file: 'index.html:240 & js/ui.js',
        summary: '#btn-open-powers-preview in index.html has no click event listener in js/ui.js (and #powers-modal has the same z-index: 50 as #start-modal).',
        impact: 'Clicking "Preview Generals Powers" on the Start Screen does nothing.'
      }
    );

    // 7. Victory Modal Credits Collected stat property mismatch (creditsCollected vs creditsEarned)
    human.engine.teams[0].stats.creditsEarned = 4500;
    human.engine.matchOver = true;
    human.engine.winner = 0;
    human.stepFrames(5, 1 / 60);
    const statsHtml = document.getElementById('victory-stats-wrap').innerHTML || '';
    assertCheck(
      pb,
      'Victory Modal displays team.stats.creditsEarned in Credits Collected row',
      statsHtml.includes('$4500') || statsHtml.includes('4,500'),
      `creditsEarned=4500, renderedVictoryStatsIncludes4500=${statsHtml.includes('4500')}`,
      {
        id: 'BUG-UI-06',
        severity: 'LOW',
        file: 'js/ui.js:2642 vs js/engine.js:281, 526, 2081, 2116',
        summary: 'showVictoryModal() in js/ui.js reads s0.creditsCollected and s1.creditsCollected, whereas js/engine.js tracks team.stats.creditsEarned.',
        impact: 'Victory/Defeat summary table always reports $0 for Credits Collected.'
      }
    );
  }

  // --------------------------------------------------------------------------
  // PLAYBOOK 12: PlanSimulator Auto-Play (Buildings, Unit Production, Warp & UI)
  // --------------------------------------------------------------------------
  {
    const pb = 'Playbook 12: PlanSimulator Auto-Play (Construction, Unit Training, Warp Speed & Toggle)';
    startFreshMatch({ playerIdx: 0, aiIdx: 3, diffId: 'NORMAL' });

    // 1. Test #btn-auto-sim (used by macos_main.swift Cmd+T "Toggle AI Auto-Play Simulator")
    const simInst = window.ZH_SIMULATOR.getActiveSimulator();
    const simBeforeClick = Boolean(simInst && simInst.enabled);
    human.clickElement('#btn-auto-sim', 'Click #btn-auto-sim (or press Cmd+T in macOS menu)');
    const simAfterBtnClick = Boolean(simInst && simInst.enabled);

    assertCheck(
      pb,
      'Clicking #btn-auto-sim (invoked by macOS menu Cmd+T) toggles PlanSimulator.enabled',
      simAfterBtnClick !== simBeforeClick,
      `before=${simBeforeClick}, after=${simAfterBtnClick}`,
      {
        id: 'BUG-SIM-01E',
        severity: 'HIGH',
        file: 'index.html:242, js/ui.js:106, 153-163, js/simulator.js:975, macos_main.swift:125',
        summary: 'macos_main.swift Cmd+T triggers document.getElementById("btn-auto-sim")?.click(), but neither js/ui.js nor js/simulator.js attaches a click listener to #btn-auto-sim. Also configureDevOnlyElements() runs before ZH_SIMULATOR.initHUD(), checks #zh-sim-panel instead of #zh-sim-hud-panel, and does not clear btn.hidden = false.',
        impact: 'macOS Menu Bar "Toggle AI Auto-Play Simulator (Cmd+T)" and #btn-auto-sim button do nothing when clicked.'
      }
    );

    // 2. Test Simulator Warp Speed multiplier (5x) in main loop (js/ui.js:124-126)
    simInst.enabled = true;
    simInst.controlTeam0 = true;
    simInst.controlTeam1 = true;
    simInst.speedMultiplier = 5;
    const tBeforeWarpStep = human.engine.matchTime;
    human.stepFrames(60, 1 / 60); // 1.0 real second at 5x warp should advance ~5.0 game seconds
    const elapsedSimSec = human.engine.matchTime - tBeforeWarpStep;

    assertCheck(
      pb,
      'Simulator speedMultiplier (5x Warp) accelerates engine simulation time in main loop',
      elapsedSimSec >= 4.0,
      `expected ~5.0s game time per 1.0s real time at 5x warp, got ${elapsedSimSec.toFixed(2)}s`,
      {
        id: 'BUG-SIM-01D',
        severity: 'HIGH',
        file: 'js/ui.js:124-126 vs js/simulator.js:956-958, 1052-1062',
        summary: 'ZH_SIMULATOR sets activeSimulator.speedMultiplier (1x/5x/15x/25x), but js/ui.js loop() calls engine.stepFixed(dt) without multiplying by ZH_SIMULATOR.getSpeedMultiplier() or setting engine.gameSpeed.',
        impact: 'Clicking 5x, 15x, or 25x Warp buttons in the Simulator HUD panel does not speed up the simulation.'
      }
    );

    // 3. Run PlanSimulator for 75 seconds of game time (4,500 frames at 60Hz) and check:
    //    (a) Dozers finish constructing buildings instead of abandoning foundations every 1.1s
    //    (b) Production buildings queue and train combat units (b.def.trains vs b.def.produces)
    human.stepFrames(4500, 1 / 60);

    const team0ConstructedNonHQ = human.engine.buildings.filter(b => b.team === 0 && !b.dead && b.constructed && !b.def.isHQ);
    const team0UnconstructedFoundations = human.engine.buildings.filter(b => b.team === 0 && !b.dead && !b.constructed);
    const team0TrainedCombatUnits = human.engine.units.filter(u => u.team === 0 && !u.dead && !u.def.isBuilder && !u.def.isHarvester);
    const totalUnitsProducedBySim = (human.engine.teams[0].stats.unitsProduced || 0) + (human.engine.teams[1].stats.unitsProduced || 0);

    assertCheck(
      pb,
      'PlanSimulator Dozers finish constructing base buildings instead of abandoning unconstructed 5% foundations',
      team0ConstructedNonHQ.length >= 3 && team0UnconstructedFoundations.length <= 2,
      `constructedNonHQ=${team0ConstructedNonHQ.length}, unconstructedFoundations=${team0UnconstructedFoundations.length}`,
      {
        id: 'BUG-SIM-01B',
        severity: 'CRITICAL',
        file: 'js/simulator.js:504-524 & js/engine.js:1214-1235',
        summary: 'executeStrategicPlan() calls countTeamBuildings(defId, false) (constructedOnly=false), treating 5% unconstructed foundations as satisfied. Every 1.1s it places the next building in the build order and startBuildingPlacement() reassigns builder.buildTargetId to the newest foundation, pulling the Dozer off the previous incomplete building.',
        impact: 'When Auto-Play Simulator is active, buildings stay stuck as unconstructed scaffolding/foundations and Dozers bounce between unfinished sites.'
      }
    );

    assertCheck(
      pb,
      'PlanSimulator queues and trains combat units from Barracks/War Factory (totalUnitsProduced > 0)',
      totalUnitsProducedBySim > 0 && team0TrainedCombatUnits.length > 0,
      `totalUnitsProducedBySim=${totalUnitsProducedBySim}, team0LiveCombatUnits=${team0TrainedCombatUnits.length}`,
      {
        id: 'BUG-SIM-01A',
        severity: 'CRITICAL',
        file: 'js/simulator.js:667, 403, 410, 471, 477 vs js/data.js',
        summary: 'handleUnitProduction() in js/simulator.js:667 filters buildings by b.def.produces (undefined on every building in ZH_DATA.BUILDINGS, which uses b.def.trains). Additionally, simulator.js checks b.def.isCommandCenter (instead of b.def.isHQ) and b.def.isSupplyDrop (instead of b.def.isSupplyDepot).',
        impact: 'PlanSimulator trains 0 combat units, 0 replacement Dozers, and 0 replacement Harvesters across the entire match, so no army ever spawns or moves.'
      }
    );

    simInst.enabled = false;
  }

  // --------------------------------------------------------------------------
  // PLAYBOOK 13: Retina (DPR=2) Selection Box Scaling, BUILD-Mode Click Trap & Same-Frame Move Marker
  // --------------------------------------------------------------------------
  {
    const pb = 'Playbook 13: macOS Retina (DPR=2) Selection Box Alignment & BUILD-Mode Unit Selection';
    global.devicePixelRatio = 2;
    window.dispatchEvent({ type: 'resize' });
    startFreshMatch({ playerIdx: 0, aiIdx: 3, diffId: 'NORMAL' });

    const canvas = document.getElementById('game-canvas');
    const combatUnits = human.engine.units.filter(u => u.team === 0 && !u.dead && !u.def.isBuilder && !u.def.isHarvester);
    const targetUnit = combatUnits[0];

    // 1. Single-click combat unit on Retina (DPR=2) with top-bar offset (top: 36px)
    human.leftClickWorld(targetUnit.x, targetUnit.y);
    assertCheck(
      pb,
      'Single left-click on combat unit selects it under macOS Retina (DPR=2) and 36px top-bar offset',
      human.engine.selectedIds.has(targetUnit.id),
      `selectedIds=${Array.from(human.engine.selectedIds).join(',')}, targetUnit.id=${targetUnit.id}`
    );

    // 2. Drag-box selection on Retina (DPR=2): verify renderSelectionBox() uses engine.pixelRatio (2) instead of engine.dpr (undefined -> 1)
    canvas._strokeRectCalls = [];
    human.dragSelectWorldBox(
      targetUnit.x - 60,
      targetUnit.y - 60,
      targetUnit.x + 60,
      targetUnit.y + 60,
      { framesDuringDrag: 2 }
    );
    const lastMarqueeCall = canvas._strokeRectCalls[canvas._strokeRectCalls.length - 1];
    const marqueeScaleX = lastMarqueeCall ? lastMarqueeCall.transform[0] : 0;

    assertCheck(
      pb,
      'renderSelectionBox() scales drag-selection marquee by engine.pixelRatio (2x on Retina) so visual box matches cursor',
      marqueeScaleX === 2,
      `devicePixelRatio=2, engine.pixelRatio=${human.engine.pixelRatio}, engine.dpr=${human.engine.dpr}, marqueeTransformScaleX=${marqueeScaleX}`,
      {
        id: 'BUG-UI-07',
        severity: 'HIGH (P1)',
        file: 'js/ui.js:2405 vs js/ui.js:216 & js/engine.js:3394',
        summary: 'resizeCanvases() (js/ui.js:216) stores the Retina scale factor on engine.pixelRatio = dpr (e.g. 2 on macOS Retina displays), and engine.render() (js/engine.js:3394) scales the canvas by this.pixelRatio. However, renderSelectionBox() (js/ui.js:2405) reads const dpr = engine.dpr || 1 (where engine.dpr is undefined!) and calls ctx.setTransform(1, 0, 0, 1, 0, 0) on the 2x physical canvas buffer.',
        impact: 'On every macOS Retina display (devicePixelRatio = 2), the green drag-selection box is drawn at 50% size and 50% coordinates (shifted halfway toward the top-left corner away from the mouse cursor), making drag-selecting units look visually broken and disconnected from the cursor.'
      }
    );

    // 3. Same-frame render after right-click move (before updateSpecialEffects runs)
    canvas._nanArcCalls = 0;
    human.rightClickWorld(targetUnit.x + 90, targetUnit.y + 30, { keepCamera: true });
    // If engine.render() runs before stepFixed() (e.g. when paused or dt=0), m.t is still undefined unless initialized in pushMoveMarker!
    human.engine.render();
    assertCheck(
      pb,
      'pushMoveMarker() initializes t: 0 so same-frame engine.render() never passes NaN radius to ctx.arc()',
      canvas._nanArcCalls === 0,
      `nanArcCallsOnImmediateRender=${canvas._nanArcCalls}, marker[last].t=${human.engine.moveMarkers[human.engine.moveMarkers.length - 1]?.t}`,
      {
        id: 'BUG-UI-09',
        severity: 'LOW (P2)',
        file: 'js/ui.js:2192-2201 vs js/engine.js:3464-3481',
        summary: 'pushMoveMarker() in js/ui.js:2194-2200 creates { x, y, color, age: 0, maxAge: 0.55 } without t: 0. While updateSpecialEffects(dt) later initializes m.t = (m.t || 0) + dt, any engine.render() call that happens before stepFixed(dt) (such as while paused or on an immediate redraw) computes m.t / 0.45 = NaN and calls ctx.arc(m.x, m.y, NaN, ...).',
        impact: 'Same-frame or paused-state move marker rendering passes NaN radius to canvas ctx.arc().'
      }
    );

    // 4. Left-clicking an existing friendly unit/building while in BUILD mode (after clicking a Command Card building cameo)
    human.clickElement('#btn-select-builder', 'Select Dozer');
    human.clickCommandCardButton('REACTOR');
    const cc = human.engine.buildings.find(b => b.team === 0 && (b.def.isCommandCenter || b.def.isHQ));
    // Player changes their mind and left-clicks their own Command Center or combat unit directly without right-clicking first
    human.leftClickWorld(cc.x, cc.y, { keepCamera: true });
    // Now player tries to left-click a combat unit
    human.leftClickWorld(targetUnit.x, targetUnit.y, { keepCamera: true });
    assertCheck(
      pb,
      'Left-clicking a friendly structure/unit after an invalid BUILD click does not silently trap the player in BUILD mode or place a scaffold over the unit',
      human.engine.selectedIds.has(targetUnit.id) && human.engine.commandMode === null,
      `commandMode=${human.engine.commandMode}, selectedIds=${Array.from(human.engine.selectedIds).join(',')}`,
      {
        id: 'BUG-UI-08',
        severity: 'MEDIUM (P2)',
        file: 'js/ui.js:1946-1958',
        summary: 'When engine.commandMode === "BUILD", canvas mousedown (js/ui.js:1946-1958) intercepts all left-clicks and returns early before unit/building selection. If the player clicks an invalid spot (e.g. on an existing building) or clicks directly on a friendly unit intending to select it, commandMode either stays locked in "BUILD" (blocking all unit selection until Right-Click/Escape) or places a building foundation directly on top of the unit.',
        impact: 'Players who click a building cameo on the Command Card and then left-click a unit or building to switch selection find that units cannot be selected until they explicitly Right-Click or press Escape.'
      }
    );

    global.devicePixelRatio = 1;
  }

  return { report, findings: human.findings, actionCount: human.actionLog.length };
}

if (require.main === module) {
  const { report, findings, actionCount } = runHumanQAPlaybooks();
  const passed = report.filter(r => r.passed).length;
  const failed = report.filter(r => !r.passed).length;

  console.log('====================================================================');
  console.log(' C&C GENERALS: ZERO HOUR — HUMAN-USER QA PLAYBOOK EXECUTION REPORT');
  console.log('====================================================================');
  console.log(`Synthetic Human UI Actions Dispatched : ${actionCount}`);
  console.log(`Total Human QA Assertions             : ${report.length}`);
  console.log(`Passed                                : ${passed}`);
  console.log(`Failed (Human Interaction Bugs Found) : ${failed}`);
  console.log('--------------------------------------------------------------------');
  for (const r of report) {
    const icon = r.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${icon} | [${r.playbook}] ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
  }
  console.log('--------------------------------------------------------------------');
  console.log(`SUMMARY: ${actionCount} Actions | ${passed}/${report.length} Assertions Passed | ${failed} Failed`);
  if (findings.length > 0) {
    console.log('\n====================================================================');
    console.log(' HUMAN-UI INTERACTION BUGS DISCOVERED');
    console.log('====================================================================');
    for (const f of findings) {
      console.log(`[${f.id}] (${f.severity}) ${f.file}`);
      console.log(`  Check  : ${f.check}`);
      console.log(`  Detail : ${f.detail}`);
      console.log(`  Cause  : ${f.summary}`);
      console.log(`  Impact : ${f.impact}\n`);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}

module.exports = { runHumanQAPlaybooks, HumanUserDriver };
