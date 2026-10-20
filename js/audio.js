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

  function ensureContext() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        ctx = new AudioCtx();
      }
    }
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  function createNoiseBuffer(durationSec) {
    const c = ensureContext();
    if (!c) return null;
    const bufferSize = Math.max(1, Math.floor(c.sampleRate * durationSec));
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
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
    const peak = Math.max(0.002, baseGain * gainMult);
    gain.gain.setValueAtTime(peak, now);
    gain.gain.exponentialRampToValueAtTime(0.001, stopTime);

    sourceNode.connect(gain);
    if (typeof c.createStereoPanner === 'function') {
      const panner = c.createStereoPanner();
      panner.pan.setValueAtTime(pan, now);
      gain.connect(panner);
      panner.connect(c.destination);
    } else {
      gain.connect(c.destination);
    }
    return gain;
  }

  function playSFX(type, worldX, worldY, cam) {
    if (!sfxEnabled) return;
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

        case 'superweapon': {
          for (let i = 0; i < 3; i++) {
            const osc = c.createOscillator();
            const gain = c.createGain();
            osc.type = 'sawtooth';
            const t0 = now + i * 0.35;
            osc.frequency.setValueAtTime(440, t0);
            osc.frequency.linearRampToValueAtTime(880, t0 + 0.22);
            osc.frequency.linearRampToValueAtTime(440, t0 + 0.34);
            gain.gain.setValueAtTime(0.11, t0);
            gain.gain.exponentialRampToValueAtTime(0.005, t0 + 0.34);
            osc.connect(gain);
            gain.connect(c.destination);
            osc.start(t0);
            osc.stop(t0 + 0.35);
          }
          break;
        }

        case 'promote': {
          const notes = [523.25, 659.25, 783.99, 1046.5];
          notes.forEach((freq, idx) => {
            const osc = c.createOscillator();
            const gain = c.createGain();
            osc.type = 'triangle';
            const t0 = now + idx * 0.085;
            osc.frequency.setValueAtTime(freq, t0);
            gain.gain.setValueAtTime(0.11, t0);
            gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.24);
            osc.connect(gain);
            gain.connect(c.destination);
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
    const c = ensureContext();
    if (!c || c.state !== 'running') return;

    const theme = FACTION_THEMES[currentFactionMusic] || FACTION_THEMES.USA;
    const now = c.currentTime;
    const freq = theme.notes[musicStep % theme.notes.length];
    const isDownbeat = (musicStep % 4) === 0;

    try {
      // Bass / Brass Motif Note
      const osc = c.createOscillator();
      const filter = c.createBiquadFilter();
      const gain = c.createGain();

      osc.type = theme.wave;
      osc.frequency.setValueAtTime(isDownbeat ? freq * 0.5 : freq, now);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(theme.filterFreq + combatIntensity * 600, now);

      const baseVol = 0.024 + combatIntensity * 0.015;
      gain.gain.setValueAtTime(baseVol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(c.destination);
      osc.start(now);
      osc.stop(now + 0.29);

      // Combat Percussion Layer (Taiko / Snare / Darbuka hit on beats when combatIntensity > 0.2)
      if (isDownbeat || (combatIntensity > 0.3 && musicStep % 2 === 1)) {
        const drumOsc = c.createOscillator();
        const drumGain = c.createGain();
        drumOsc.type = 'sine';
        drumOsc.frequency.setValueAtTime(currentFactionMusic === 'CHINA' ? 95 : 130, now);
        drumOsc.frequency.exponentialRampToValueAtTime(32, now + 0.14);
        drumGain.gain.setValueAtTime(0.035 + combatIntensity * 0.025, now);
        drumGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        drumOsc.connect(drumGain);
        drumGain.connect(c.destination);
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
    const c = ensureContext();
    if (!c) return;
    try {
      const now = c.currentTime;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1950, now);
      osc.frequency.setValueAtTime(2450, now + 0.018);
      gain.gain.setValueAtTime(0.025, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(now);
      osc.stop(now + 0.038);
    } catch (_) {}
  }

  function speak(text, options = {}) {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;
    const now = performance.now();
    if (!options.priority && now - lastSpeakTime < 1500) return;
    lastSpeakTime = now;

    playRadioSquelch();

    try {
      if (options.priority) {
        window.speechSynthesis.cancel();
      }
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = options.rate || 1.06;
      utter.pitch = options.pitch || 0.96;
      utter.volume = options.volume || 0.85;
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
    speak,
    computeSpatialParams,
    startMusic,
    stopMusic,
    setCombatIntensity,
    toggleSFX,
    toggleVoice,
    toggleMusic,
    isSFXEnabled: () => sfxEnabled,
    isVoiceEnabled: () => voiceEnabled,
    isMusicEnabled: () => musicEnabled
  };
})();
