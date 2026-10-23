// ============================================================================
// Command & Conquer: Generals – Zero Hour (macOS Clean-Room Edition)
// js/audio.js — Phase 3: 2.5D Spatial WebAudio Panning, Dynamic Faction Music
//               Sequencer & Radio-Filtered EVA / Unit Bark Engine
// ============================================================================

window.ZH_AUDIO = (function () {
  'use strict';

  let ctx = null;
  let sfxEnabled = true;
  let voiceEnabled = true;
  let musicEnabled = true;
  let lastSpeakTime = 0;

  // Dynamic Faction Music Sequencer State
  let currentFactionMusic = null;
  let musicStep = 0;
  let musicIntervalId = null;
  let combatIntensity = 0; // 0.0 (peace) -> 1.0 (heavy battle)

  const FACTION_THEMES = {
    USA: {
      tempoMs: 360,
      wave: 'sawtooth',
      filterFreq: 950,
      notes: [146.83, 146.83, 220.00, 146.83, 174.61, 196.00, 220.00, 196.00] // D minor / martial fifths
    },
    CHINA: {
      tempoMs: 400,
      wave: 'square',
      filterFreq: 720,
      notes: [130.81, 130.81, 196.00, 155.56, 174.61, 130.81, 116.54, 130.81] // C minor pentatonic / industrial brass
    },
    GLA: {
      tempoMs: 310,
      wave: 'triangle',
      filterFreq: 1200,
      notes: [164.81, 174.61, 207.65, 220.00, 246.94, 220.00, 207.65, 174.61] // E Phrygian dominant modal
    }
  };

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  let masterCompressor = null;
  let masterGain = null;
  const busGains = {
    master: null,
    sfx: null,
    music: null,
    voice: null
  };
  const noiseCache = new Map();
  let lastEvaSpeakTime = 0;
  let lastUnitSpeakTime = 0;
  let voiceDuckUntil = 0;

  const UNIT_VOICE_PROFILES = {
    EVA: { pitch: 1.04, rate: 1.08 },
    USA_INFANTRY: { pitch: 0.96, rate: 1.10 },
    USA_ARMOR: { pitch: 0.80, rate: 0.98 },
    USA_AIR: { pitch: 1.08, rate: 1.16 },
    CHINA_INFANTRY: { pitch: 0.92, rate: 1.06 },
    CHINA_ARMOR: { pitch: 0.68, rate: 0.90 },
    CHINA_OVERLORD: { pitch: 0.56, rate: 0.84 },
    GLA_INFANTRY: { pitch: 1.02, rate: 1.14 },
    GLA_ARMOR: { pitch: 0.84, rate: 1.04 }
  };

  function syncBusGainValues() {
    if (!ctx) return;
    const now = ctx.currentTime || 0;
    if (masterGain && masterGain.gain) {
      masterGain.gain.setValueAtTime(volumes.master, now);
    }
    ['sfx', 'music', 'voice'].forEach(bus => {
      const g = busGains[bus];
      if (g && g.gain && volumes[bus] !== undefined) {
        g.gain.setValueAtTime(volumes[bus], now);
      }
    });
  }

  function ensureContext() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        ctx = new AudioCtx();
        if (typeof ctx.createDynamicsCompressor === 'function') {
          masterCompressor = ctx.createDynamicsCompressor();
          masterCompressor.threshold.setValueAtTime(-16, ctx.currentTime);
          masterCompressor.knee.setValueAtTime(18, ctx.currentTime);
          masterCompressor.ratio.setValueAtTime(6, ctx.currentTime);
          masterCompressor.attack.setValueAtTime(0.004, ctx.currentTime);
          masterCompressor.release.setValueAtTime(0.18, ctx.currentTime);
          masterCompressor.connect(ctx.destination);
        }
        if (typeof ctx.createGain === 'function' && masterCompressor) {
          masterGain = ctx.createGain();
          busGains.master = masterGain;
          masterGain.connect(masterCompressor);
          ['sfx', 'music', 'voice'].forEach(bus => {
            const g = ctx.createGain();
            busGains[bus] = g;
            g.connect(masterGain);
          });
          syncBusGainValues();
        }
      }
    }
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  function getOutputNode(c, bus = 'sfx') {
    if (bus && busGains[bus]) return busGains[bus];
    if (masterGain) return masterGain;
    return masterCompressor;
  }

  function createNoiseBuffer(durationSec) {
    const c = ensureContext();
    if (!c) return null;
    const key = Math.round(durationSec * 100);
    if (noiseCache.has(key)) return noiseCache.get(key);
    const sr = Number(c.sampleRate) > 0 ? Number(c.sampleRate) : 44100;
    const bufferSize = Math.max(1, Math.floor(sr * (Number(durationSec) || 0.05)));
    const buffer = c.createBuffer(1, bufferSize, sr);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    noiseCache.set(key, buffer);
    return buffer;
  }

  // Phase 3: Compute 2.5D stereo pan [-1, 1] and distance attenuation [0.12, 1.0]
  function computeSpatialParams(worldX, worldY, cam) {
    if (worldX === undefined || worldY === undefined || !cam) {
      return { pan: 0, gainMult: 1.0 };
    }
    const cx = cam.x + (cam.w || 1200) * 0.5;
    const cy = cam.y + (cam.h || 800) * 0.5;
    const dx = worldX - cx;
    const dy = worldY - cy;
    const pan = clamp(dx / ((cam.w || 1200) * 0.65), -1, 1);
    const d = Math.hypot(dx, dy);
    const maxHearDist = Math.max(1100, (cam.w || 1200) * 1.35);
    const gainMult = clamp(1.15 - d / maxHearDist, 0.12, 1.0);
    return { pan, gainMult };
  }

  function connectSpatialOutput(c, sourceNode, baseGain, now, stopTime, worldX, worldY, cam) {
    const { pan, gainMult } = computeSpatialParams(worldX, worldY, cam);
    const gain = c.createGain();
    const sfxMult = volumes ? (volumes.master * volumes.sfx) : 1.0;
    const peak = Math.max(0.0005, baseGain * gainMult * sfxMult);
    gain.gain.setValueAtTime(peak, now);
    gain.gain.exponentialRampToValueAtTime(0.001, stopTime);

    const dest = getOutputNode(c, 'sfx');
    if (!dest) return gain;
    sourceNode.connect(gain);
    if (typeof c.createStereoPanner === 'function') {
      const panner = c.createStereoPanner();
      panner.pan.setValueAtTime(pan, now);
      gain.connect(panner);
      panner.connect(dest);
    } else {
      gain.connect(dest);
    }
    return gain;
  }

  function playSFX(type, worldX, worldY, cam) {
    if (!sfxEnabled) return;
    if (volumes && (volumes.master <= 0.0001 || volumes.sfx <= 0.0001)) return;
    const c = ensureContext();
    if (!c) return;
    const now = c.currentTime;

    try {
      switch (type) {
        case 'click': {
          const osc = c.createOscillator();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(880, now);
          osc.frequency.exponentialRampToValueAtTime(420, now + 0.045);
          connectSpatialOutput(c, osc, 0.08, now, now + 0.045, worldX, worldY, cam);
          osc.start(now);
          osc.stop(now + 0.05);
          break;
        }

        case 'alert': {
          const osc = c.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(660, now);
          osc.frequency.setValueAtTime(880, now + 0.09);
          connectSpatialOutput(c, osc, 0.095, now, now + 0.22, worldX, worldY, cam);
          osc.start(now);
          osc.stop(now + 0.23);
          break;
        }

        case 'cash': {
          const osc = c.createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1046.5, now);
          osc.frequency.setValueAtTime(1318.5, now + 0.06);
          connectSpatialOutput(c, osc, 0.07, now, now + 0.16, worldX, worldY, cam);
          osc.start(now);
          osc.stop(now + 0.17);
          break;
        }

        case 'bullet': {
          const noise = c.createBufferSource();
          noise.buffer = createNoiseBuffer(0.05);
          const filter = c.createBiquadFilter();
          filter.type = 'bandpass';
          filter.frequency.value = 1400;
          noise.connect(filter);
          connectSpatialOutput(c, filter, 0.048, now, now + 0.05, worldX, worldY, cam);
          noise.start(now);
          break;
        }

        case 'sniper': {
          const osc = c.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(1600, now);
          osc.frequency.exponentialRampToValueAtTime(140, now + 0.11);
          connectSpatialOutput(c, osc, 0.09, now, now + 0.11, worldX, worldY, cam);
          osc.start(now);
          osc.stop(now + 0.12);
          break;
        }

        case 'laser': {
          const osc = c.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(1420, now);
          osc.frequency.exponentialRampToValueAtTime(280, now + 0.16);
          connectSpatialOutput(c, osc, 0.085, now, now + 0.16, worldX, worldY, cam);
          osc.start(now);
          osc.stop(now + 0.17);
          break;
        }

        case 'pdl': {
          const osc = c.createOscillator();
          osc.type = 'square';
          osc.frequency.setValueAtTime(2200, now);
          osc.frequency.exponentialRampToValueAtTime(640, now + 0.09);
          connectSpatialOutput(c, osc, 0.065, now, now + 0.09, worldX, worldY, cam);
          osc.start(now);
          osc.stop(now + 0.095);
          break;
        }

        case 'cannon': {
          const osc = c.createOscillator();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(165, now);
          osc.frequency.exponentialRampToValueAtTime(36, now + 0.22);
          connectSpatialOutput(c, osc, 0.14, now, now + 0.23, worldX, worldY, cam);
          osc.start(now);
          osc.stop(now + 0.24);
          break;
        }

        case 'missile': {
          const noise = c.createBufferSource();
          noise.buffer = createNoiseBuffer(0.18);
          const filter = c.createBiquadFilter();
          filter.type = 'highpass';
          filter.frequency.value = 900;
          noise.connect(filter);
          connectSpatialOutput(c, filter, 0.065, now, now + 0.18, worldX, worldY, cam);
          noise.start(now);
          break;
        }

        case 'explosion': {
          const noise = c.createBufferSource();
          noise.buffer = createNoiseBuffer(0.38);
          const filter = c.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(480, now);
          filter.frequency.exponentialRampToValueAtTime(70, now + 0.38);
          noise.connect(filter);
          connectSpatialOutput(c, filter, 0.16, now, now + 0.38, worldX, worldY, cam);
          noise.start(now);
          break;
        }

        case 'superweapon':
        case 'superweapon_stinger': {
          const sfxMult = volumes ? (volumes.master * volumes.sfx) : 1.0;
          const dest = getOutputNode(c);
          voiceDuckUntil = (typeof performance !== 'undefined' ? performance.now() : Date.now()) + 1900;
          // Sub-bass warhorn stinger
          const subOsc = c.createOscillator();
          const subGain = c.createGain();
          subOsc.type = 'triangle';
          subOsc.frequency.setValueAtTime(110, now);
          subOsc.frequency.exponentialRampToValueAtTime(42, now + 0.85);
          subGain.gain.setValueAtTime(Math.max(0.001, 0.16 * sfxMult), now);
          subGain.gain.exponentialRampToValueAtTime(0.002, now + 0.88);
          subOsc.connect(subGain);
          subGain.connect(dest);
          subOsc.start(now);
          subOsc.stop(now + 0.9);
          // 3-pulse tactical klaxon
          for (let i = 0; i < 3; i++) {
            const osc = c.createOscillator();
            const gain = c.createGain();
            osc.type = 'sawtooth';
            const t0 = now + i * 0.35;
            osc.frequency.setValueAtTime(440, t0);
            osc.frequency.linearRampToValueAtTime(880, t0 + 0.22);
            osc.frequency.linearRampToValueAtTime(440, t0 + 0.34);
            gain.gain.setValueAtTime(Math.max(0.001, 0.11 * sfxMult), t0);
            gain.gain.exponentialRampToValueAtTime(0.005, t0 + 0.34);
            osc.connect(gain);
            gain.connect(dest);
            osc.start(t0);
            osc.stop(t0 + 0.35);
          }
          break;
        }

        case 'promote': {
          const sfxMult = volumes ? (volumes.master * volumes.sfx) : 1.0;
          const dest = getOutputNode(c);
          const notes = [523.25, 659.25, 783.99, 1046.5];
          notes.forEach((freq, idx) => {
            const osc = c.createOscillator();
            const gain = c.createGain();
            osc.type = 'triangle';
            const t0 = now + idx * 0.085;
            osc.frequency.setValueAtTime(freq, t0);
            gain.gain.setValueAtTime(Math.max(0.001, 0.11 * sfxMult), t0);
            gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.24);
            osc.connect(gain);
            gain.connect(dest);
            osc.start(t0);
            osc.stop(t0 + 0.25);
          });
          break;
        }
      }
    } catch (_) {
      // Ignore WebAudio transient errors
    }
  }

  // ==========================================================================
  // Phase 3: Procedural Interactive Faction Music Sequencer
  // ==========================================================================
  function tickMusicStep() {
    if (!musicEnabled || !currentFactionMusic) return;
    if (volumes && (volumes.master <= 0.0001 || volumes.music <= 0.0001)) return;
    const c = ensureContext();
    if (!c || c.state !== 'running') return;
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const duckMult = nowMs < voiceDuckUntil ? 0.36 : 1.0;
    const musicMult = (volumes ? (volumes.master * volumes.music) : 0.4) * duckMult;
    if (musicMult <= 0.001) return;

    const theme = FACTION_THEMES[currentFactionMusic] || FACTION_THEMES.USA;
    const now = c.currentTime;
    const freq = theme.notes[musicStep % theme.notes.length];
    const isDownbeat = (musicStep % 4) === 0;
    const dest = getOutputNode(c, 'music');
    if (!dest) return;

    try {
      // Bass / Brass Motif Note
      const osc = c.createOscillator();
      const filter = c.createBiquadFilter();
      const gain = c.createGain();

      osc.type = theme.wave;
      osc.frequency.setValueAtTime(isDownbeat ? freq * 0.5 : freq, now);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(theme.filterFreq + combatIntensity * 600, now);

      const baseVol = Math.max(0.001, (0.042 + combatIntensity * 0.025) * musicMult);
      gain.gain.setValueAtTime(baseVol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.29);

      // Combat Percussion Layer (Taiko / Snare / Darbuka hit on beats when combatIntensity > 0.2)
      if (isDownbeat || (combatIntensity > 0.3 && musicStep % 2 === 1)) {
        const drumOsc = c.createOscillator();
        const drumGain = c.createGain();
        drumOsc.type = 'sine';
        drumOsc.frequency.setValueAtTime(currentFactionMusic === 'CHINA' ? 95 : 130, now);
        drumOsc.frequency.exponentialRampToValueAtTime(32, now + 0.14);
        drumGain.gain.setValueAtTime(Math.max(0.001, (0.055 + combatIntensity * 0.035) * musicMult), now);
        drumGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        drumOsc.connect(drumGain);
        drumGain.connect(dest);
        drumOsc.start(now);
        drumOsc.stop(now + 0.15);
      }
    } catch (_) {
      // Ignore transient errors
    }

    musicStep++;
  }

  function startMusic(factionId = 'USA') {
    currentFactionMusic = factionId;
    musicStep = 0;
    if (musicIntervalId) {
      clearInterval(musicIntervalId);
      musicIntervalId = null;
    }
    const theme = FACTION_THEMES[factionId] || FACTION_THEMES.USA;
    if (typeof setInterval === 'function') {
      musicIntervalId = setInterval(tickMusicStep, theme.tempoMs);
    }
  }

  function stopMusic() {
    if (musicIntervalId) {
      clearInterval(musicIntervalId);
      musicIntervalId = null;
    }
  }

  function setCombatIntensity(level) {
    combatIntensity = clamp(level, 0, 1);
  }

  // Radio comms squelch + speech synthesis
  function playRadioSquelch() {
    if (!sfxEnabled) return;
    if (volumes && (volumes.master <= 0.0001 || volumes.voice <= 0.0001 || volumes.sfx <= 0.0001)) return;
    const c = ensureContext();
    if (!c) return;
    const dest = getOutputNode(c, 'voice');
    if (!dest) return;
    try {
      const now = c.currentTime;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1950, now);
      osc.frequency.setValueAtTime(2450, now + 0.018);
      gain.gain.setValueAtTime(Math.max(0.0005, 0.025 * (volumes.master * volumes.voice)), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.038);
    } catch (_) {}
  }

  const volumes = {
    master: 0.8,
    music: 0.5,
    sfx: 0.8,
    voice: 0.9
  };

  function setVolume(bus, val) {
    if (volumes[bus] !== undefined) {
      volumes[bus] = clamp(Number(val) || 0, 0, 1);
      syncBusGainValues();
    }
    return volumes[bus];
  }

  function getVolume(bus) {
    return volumes[bus] !== undefined ? volumes[bus] : 1;
  }

  function resolveVoiceProfile(options) {
    if (options.voiceProfile && UNIT_VOICE_PROFILES[options.voiceProfile]) {
      return UNIT_VOICE_PROFILES[options.voiceProfile];
    }
    if (options.unitDef) {
      const d = options.unitDef;
      const f = d.faction || 'USA';
      if (d.id && d.id.includes('OVERLORD')) return UNIT_VOICE_PROFILES.CHINA_OVERLORD;
      if (d.isAir) return UNIT_VOICE_PROFILES.USA_AIR;
      if (d.isInfantry) return UNIT_VOICE_PROFILES[`${f}_INFANTRY`] || UNIT_VOICE_PROFILES.USA_INFANTRY;
      return UNIT_VOICE_PROFILES[`${f}_ARMOR`] || UNIT_VOICE_PROFILES.USA_ARMOR;
    }
    return UNIT_VOICE_PROFILES.EVA;
  }

  function speak(text, options = {}) {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;
    if (volumes && (volumes.master <= 0.0001 || volumes.voice <= 0.0001)) return;
    const now = performance.now();
    const isEva = Boolean(options.priority || options.isEva);
    if (isEva) {
      if (!options.priority && now - lastEvaSpeakTime < 900) return;
      lastEvaSpeakTime = now;
    } else {
      if (now - lastUnitSpeakTime < 1500) return;
      lastUnitSpeakTime = now;
    }
    lastSpeakTime = now;
    voiceDuckUntil = now + (isEva ? 1600 : 950);

    playRadioSquelch();

    try {
      if (options.priority) {
        window.speechSynthesis.cancel();
      }
      const profile = resolveVoiceProfile(options);
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = options.rate || profile.rate || 1.06;
      utter.pitch = options.pitch || profile.pitch || 0.96;
      const baseVol = options.volume || 0.85;
      utter.volume = clamp(baseVol * volumes.master * volumes.voice, 0, 1);
      window.speechSynthesis.speak(utter);
    } catch (_) {
      // Ignore synthesis errors
    }
  }

  function toggleSFX() {
    sfxEnabled = !sfxEnabled;
    return sfxEnabled;
  }

  function toggleVoice() {
    voiceEnabled = !voiceEnabled;
    if (!voiceEnabled && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    return voiceEnabled;
  }

  function toggleMusic() {
    musicEnabled = !musicEnabled;
    return musicEnabled;
  }

  return {
    playSFX,
    playRadioClick: playRadioSquelch,
    speak,
    computeSpatialParams,
    startMusic,
    startFactionMusic: startMusic,
    stopMusic,
    setCombatIntensity,
    toggleSFX,
    toggleVoice,
    toggleMusic,
    setVolume,
    getVolume,
    isSFXEnabled: () => sfxEnabled,
    isVoiceEnabled: () => voiceEnabled,
    isMusicEnabled: () => musicEnabled
  };
})();

