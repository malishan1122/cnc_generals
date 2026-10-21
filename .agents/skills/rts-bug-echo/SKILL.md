---
name: rts-bug-echo
description: After discovering or fixing an RTS engine, UI, AI, simulator, or QA runner bug, scan the codebase for other places with the same defect pattern. Use when the user says "where else is this wrong", "echo this fix", "scan for the same mistake", "same bug in other files", or after fixing a schema mismatch, modal render crash, DPR/coordinate bug, commandMode trap, or collision deadlock. Read-only until the user picks findings to fix. Adapted from Terryc21/bug-echo.
---

# RTS Bug Echo (`rts-bug-echo`)

*Adapted from [Terryc21/bug-echo](https://github.com/Terryc21/bug-echo) for C&C Generals: Zero Hour (macOS / HTML5 Canvas Engine).*

A bug rarely lives in one place. In an RTS engine where `js/data.js`, `js/engine.js`, `js/ui.js`, `js/ai.js`, `js/simulator.js`, `index.html`, and `tests/human_qa_runner.js` share untyped object properties, canvas transforms, and modal state machines, the same wrong property name, missing `constructed` guard, or Retina DPR assumption gets copy-pasted across files.

When a bug is found or fixed in one place, the others keep failing silently. **RTS Bug Echo** takes the defect you just identified or fixed, reduces it to its **searchable ingredient**, and scans the rest of the repository for sibling occurrences.

It is **strictly read-only** until the user chooses which findings to fix.

---

## When to Activate

- Explicit user phrases: *"where else is this wrong"*, *"echo this fix"*, *"scan for the same mistake"*, *"check if other files have this bug"*, *"bug-echo"*.
- Immediately after fixing or diagnosing a concrete bug in `js/*.js`, `index.html`, `css/style.css`, `macos_main.swift`, or `tests/*.js`.

---

## Workflow

### Step 1: Extract the Defect Seed (Before Touching Search Tools)

State the seed in **three lines**:
1. **What was wrong**: The concrete code or test pattern before the fix (e.g., `ui.js` read `engine.dpr || 1` in `render()`, resetting `ctx.setTransform` to `1x` on a `2x` Retina canvas).
2. **What made it right**: The corrected pattern (e.g., `engine.pixelRatio || 1`, matching `engine.js` `resize()`).
3. **The searchable ingredient**: The token, property name, method call, or missing companion check that marks a sibling candidate (e.g., `\.dpr\b`, `setTransform`, `devicePixelRatio`).

Match the seed against [`patterns.md`](patterns.md) to load the known RTS defect shape, its sibling search tokens, and its false-positive traps.

If no bug was fixed in the current thread and the user didn't name one, ask one question: *"Which bug or fix should I echo across the codebase?"* and stop.

---

### Step 2: Map the Search Scope

Always scan all layers of the C&C Generals: Zero Hour stack in order of blast radius:
1. **Core Simulation & Data**: `js/engine.js`, `js/data.js`, `js/map.js`
2. **Player HUD, Input & Audio**: `js/ui.js`, `js/audio.js`, `index.html`, `css/style.css`
3. **Autonomous Agents & Warp Simulator**: `js/ai.js`, `js/simulator.js`
4. **Native macOS Wrapper**: `macos_main.swift`, `build_app.sh`
5. **QA & Test Harnesses**: `tests/human_qa_runner.js`, `QA_PLAYBOOK.md`

---

### Step 3: Search for Siblings (Including Inverse & Structural Variants)

Don't just grep for the exact typo string. Search for **three rings of siblings**:
1. **Exact token siblings**: Other occurrences of the broken property/method across all files (e.g., every `.produces`, `.isHQ`, `.dpr`, `.canPlaceBuildingAt`).
2. **Same-family schema siblings**: Other properties on the same producer/consumer boundary (`js/data.js` $\leftrightarrow$ `js/ai.js` / `js/simulator.js` / `js/ui.js`, or `index.html` $\leftrightarrow$ `js/ui.js`). For example, if `ai.js` used `def.produces` instead of `def.trains`, check every `def.*` and `stats.*` property read in `ai.js` and `simulator.js` against `data.js` and `engine.js`.
3. **Structural state-machine siblings**: Other branches of the same state machine. For example:
   - If `BUILD` stand-off distance (`b.radius + u.radius + 10`) deadlocked against collision pushback (`b.radius + u.radius + 14`), check `HARVEST`, `RETURN_CARGO`, `ENTER_GARRISON`, and `CAPTURE` arrival radii against `resolveCollisions()`.
   - If `commandMode === 'BUILD'` trapped left-clicks on `#game-canvas`, check `'RALLY'`, `'ATTACK_MOVE'`, `'POWER'`, `'SUPERWEAPON'`, and `'ABILITY'`.
   - If `moveMarkers.push(...)` forgot `t: 0`, check `particles.push`, `shockwaves.push`, `projectiles.push`, `floatingTexts.push`, and `pings.push`.

---

### Step 4: Classify Every Candidate

Read the surrounding context of every hit and classify it into one of five buckets:

| Classification | Meaning |
| :--- | :--- |
| **`BUG`** | Same defect, live code path, no compensating guard downstream. Breaks gameplay, rendering, AI, or QA accuracy. |
| **`WATCH`** | Same pattern, but currently masked by a fallback (e.g., `def.isCommandCenter \|\| def.isHQ`) or only reachable in an edge mode. Worth cleaning up to prevent regression. |
| **`OK`** | Superficially similar token, but intentionally different or already guarded (state why in 1 phrase). |
| **`OK (CANON)`** | The already-fixed site or the canonical definition in `js/data.js` / `js/engine.js` that the seed came from. |
| **`REVIEW`** | Ambiguous intent (e.g., game balance vs. bug); needs a human design decision. |

---

### Step 5: Report & Wait for User Selection

Output the structured Echo Report and **stop** before editing any files:

```markdown
## RTS Bug Echo Report

### Seed
- **Was**: [1-line description of the original bug]
- **Fix**: [1-line description of the fix]
- **Pattern**: [Matched pattern from `patterns.md` + searchable tokens]

### Findings
| # | Status | File & Lines | Snippet / Pattern | Impact & Proposed Fix |
| :- | :--- | :--- | :--- | :--- |
| 1 | **`BUG`** | [file.js](file:///.../file.js#L10-L15) | `...` | [What breaks + 1-line fix] |
| 2 | **`WATCH`** | [file.js](file:///.../file.js#L40-L45) | `...` | [Why it's fragile + cleanup] |
| 3 | **`OK (CANON)`** | [file.js](file:///.../file.js#L80-L85) | `...` | [Canonical definition / already fixed] |

### Summary
Found **X BUG**, **Y WATCH**, **Z REVIEW** across N files.
Which items (`#1`, `#2`, or `all BUGs`) would you like me to fix and verify with `tests/human_qa_runner.js`?
```
