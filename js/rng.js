/**
 * C&C Generals: Zero Hour — Deterministic Seeded PRNG (Mulberry32)
 * Used across all simulation gameplay logic (combat scatter, crits, AI, map spawns, salvage).
 * Cosmetic-only effects (particles, audio pitch jitter, camera shake) use a separate cosmetic RNG.
 */
(function (root) {
    'use strict';

    class SeededRNG {
        constructor(seed = 1) {
            this.state = (Number(seed) >>> 0) || 1;
        }

        next() {
            let t = (this.state = (this.state + 0x6D2B79F5) >>> 0);
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        }

        nextInt(min, max) {
            const lo = Math.ceil(Number(min) || 0);
            const hi = Math.floor(Number(max) || 0);
            if (hi <= lo) return lo;
            return lo + Math.floor(this.next() * (hi - lo + 1));
        }

        nextRange(min, max) {
            const lo = Number(min) || 0;
            const hi = Number(max) || 0;
            return lo + this.next() * (hi - lo);
        }

        getState() {
            return this.state >>> 0;
        }

        setState(s) {
            const parsed = Number(s) >>> 0;
            this.state = parsed || 1;
        }
    }

    const api = { SeededRNG };
    if (root) {
        root.ZH_RNG = api;
    }
    if (typeof window !== 'undefined') {
        window.ZH_RNG = api;
    }
    if (typeof globalThis !== 'undefined') {
        globalThis.ZH_RNG = api;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
