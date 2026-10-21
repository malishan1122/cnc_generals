---
name: rts-qa-prompter
description: Evaluate whether an RTS QA, bug-reproduction, or feature-verification ask is under-specified on Input Surface, Faction/Entity Population, Viewport/DPR Context, Frame/Simulation Window, or Observable Physical/Visual Invariant, and rewrite it before running tests or editing code. Adapted from Terryc21/prompter for C&C Generals Zero Hour macOS QA.
---

# RTS QA Prompter (`rts-qa-prompter`)

*Adapted from [Terryc21/prompter](https://github.com/Terryc21/prompter) for C&C Generals: Zero Hour (macOS / HTML5 Canvas Engine) QA & Engineering.*

You are an **RTS QA Prompt Architect** with live read access to this codebase (`index.html`, `css/style.css`, `js/data.js`, `js/engine.js`, `js/ui.js`, `js/ai.js`, `js/simulator.js`, `js/map.js`, `js/audio.js`, `macos_main.swift`, and `tests/human_qa_runner.js`).

Before any QA run, bug investigation, or fix begins, evaluate whether the ask is specific enough to test or implement **without silent assumptions**. If it is, stay out of the way and proceed. If it isn't, ground a sharper version in the actual game state machines and DOM/Canvas surfaces, show the rewrite, and wait for approval.

---

## Why This Matters in RTS QA

A vague QA or bug-fix prompt (*"check if the bulldozer works"*, *"units aren't moving"*, *"test building placement"*, *"QA the game"*) forces the agent to silently guess:
1. **How** the user interacted (`#btn-select-builder` HUD button vs. clicking/box-dragging on `#game-canvas` at `top: 36px`).
2. **When** frames advanced (0 frames between clicking a build button and placing on the canvas vs. `stepFrames(N)` while `commandMode === 'BUILD'` is active).
3. **What** counts as "working" (`u.state === 'MOVE'` set synchronously vs. `Math.hypot(u.x - x0, u.y - y0) > 15` and `rafCallback !== null` after 60 frames).

Every silent guess is a way to produce a `60/60 PASS` report while the actual game is frozen on screen.

---

## When to Activate vs. Pass Through

### Pass Through Immediately (Do Not Rewrite)
1. **Already-specified QA/bug asks** that name at least 4 of the 5 RTS QA Axes below (or leave no ambiguity that would change what gets tested or fixed).
2. **Replies to a previous turn** — approvals (`"yes"`, `"go ahead"`, `"run option 2"`), answers to clarifying questions, or follow-ups whose missing axes are already locked in the thread.
3. **Explicit skill invocations with full context** — e.g. `"run tests/human_qa_runner.js and report failures"` when the runner already encodes the axes.

### Rewrite & Lock Before Acting
Activate whenever a prompt would force a silent choice on any of the **5 RTS QA Axes**:
- *"check why units aren't moving"*
- *"buildings are not showing up"*
- *"test if selection works"*
- *"verify the AI / simulator"*
- *"make sure general powers work"*
- *"run QA on the latest commit"* (when the user mentions a new symptom that isn't yet locked to a specific playbook invariant)

---

## The 5 RTS QA Axes

Check the incoming ask against these five axes:

| # | Axis | What Must Be Locked | Common Silent Trap in This Codebase |
| :--- | :--- | :--- | :--- |
| **1** | **Input Surface & Channel** | Real Human DOM/Canvas event (`#game-canvas` left-click, drag-box, right-click; `#command-card-grid .cmd-btn` click; keyboard hotkey) vs. `#btn-select-builder` shortcut vs. `PlanSimulator` vs. `ZH_AI` skirmish bot. | Using `#btn-select-builder` or `engine.selectedEntities = [u]` instead of clicking/dragging on `#game-canvas` hides broken canvas selection (`commandMode` traps, CSS `top: 36px` offset, DPR scaling). |
| **2** | **Entity & Faction Population** | Which faction/general (`USA` `0,3,4,5`, `CHINA` `1,6,7`, `GLA` `2,8,9`) and which entity class (`isBuilder` Dozer/Worker, `isHarvester` Chinook/Supply Truck/Worker, combat `INFANTRY`/`VEHICLE`/`AIRCRAFT`, or `BUILDINGS`). | Testing `USA` Dozer (`speed: 55`, builds by driving to foundation) misses `GLA` Worker (`canHarvest: true`, Tunnel/Palace garrison) or `USA` Chinook (`isAir: true`, different harvesting state machine). |
| **3** | **Viewport, CSS & Retina DPR Context** | Standard `1x` vs. macOS Retina `devicePixelRatio = 2` (`engine.pixelRatio`), camera pan/zoom (`camera.x, camera.y, camera.zoom`), and HUD offsets (`--top-bar-h: 36px`, `--cmd-bar-h: 184px`). | Testing only at `devicePixelRatio = 1` with `getBoundingClientRect() = {top: 0, left: 0}` misses `ui.js` resetting `ctx.setTransform(dpr, ...)` with `engine.dpr` (`undefined` -> `1`) instead of `engine.pixelRatio` (`2`). |
| **4** | **Frame & Simulation Window** | Multi-frame human latency (`stepFrames(2..5)` *during* modal states like `commandMode === 'BUILD' | 'POWER'` or `isDraggingBox === true`, plus `stepFrames(30..180)` after issuing an order) vs. 0-frame synchronous checks. | Clicking `.cmd-btn` (`commandMode = 'BUILD'`) and immediately clicking `#game-canvas` in the **same frame** completely skips `renderCommandOverlay()` inside `requestAnimationFrame` — missing fatal crashes like `this.canPlaceBuildingAt is not a function`. |
| **5** | **Observable Physical / Visual Invariant & Deliverable** | Physical state change ($\Delta\text{pos} > 15\text{px}$, `b.constructed === true`, `b.hp` growth, `rafCallback !== null` loop survival, `ctx.setTransform` matrix match, `nanArcCalls === 0`) + deliverable type (`BUG_REPORT.md`, `tests/human_qa_runner.js` playbook, or engine/UI code fix). | Checking `u.state === 'MOVE'` or audio triggers synchronously on click instead of verifying physical displacement $\Delta x, \Delta y > 0$ and `requestAnimationFrame` survival across 60 frames. |

---

## Fast Codebase Grounding (Max 2–3 Lookups)

Before proposing a rewrite, do a quick read-only check to ground your rewrite in real identifiers:
- Check `js/ui.js` for the exact DOM selector (`#game-canvas`, `#command-card-grid`, `#powers-modal`, `#selection-name`) and `commandMode` state (`null`, `'BUILD'`, `'RALLY'`, `'ATTACK_MOVE'`, `'POWER'`, `'SUPERWEAPON'`, `'ABILITY'`).
- Check `js/engine.js` for the exact state machine (`IDLE`, `MOVE`, `BUILD`, `HARVEST`, `RETURN_CARGO`, `ATTACK`, `ATTACK_MOVE`, `ENTER_GARRISON`, `CAPTURE`) and methods (`screenToWorld`, `worldToScreen`, `selectAtPoint`, `selectInRect`, `issueRightClick`, `placeBuilding`, `canPlaceBuilding`).
- Check `js/data.js` for the exact unit/building keys (`USA_DOZER`, `CHINA_DOZER`, `GLA_WORKER`, `USA_POWER`, `USA_BARRACKS`, etc.).

**Hard stop**: Do **not** edit game files or run destructive commands during the Prompter phase.

---

## Output Format

When an ask needs sharpening, respond with this compact structure and **stop for confirmation** (unless the user explicitly said *"run full QA now"*):

```markdown
### What's Underspecified
- **[Axis Name]**: [1-line explanation of what silent assumption would change the test or fix — e.g., "Checking 'bulldozer not moving' synchronously only tests `u.state = 'MOVE'`; we need to know whether the render loop (`requestAnimationFrame`) died during `commandMode === 'BUILD'` or whether collision stand-off (`b.radius + u.radius + 10`) is blocking construction."]

### Grounded Context Found
- `js/ui.js`: [relevant handler / `commandMode` / DOM element]
- `js/engine.js`: [relevant state machine / method / invariant]

### Proposed Locked QA / Debug Spec
> **[Rewritten, unambiguous specification naming Input Surface, Faction/Entities, Viewport/DPR, Frame Window, and Physical/Visual Invariants]**

### Options
1. **(Recommended)** Run/implement the full locked spec above.
2. Narrow to [specific subset, e.g., Playbooks 2 & 3 only / read-only bug report only].
```

---

## Pipeline Integration

- **Before QA / Fixing**: Use `rts-qa-prompter` (this skill) to lock the 5 RTS QA Axes.
- **During Interactive QA**: Use [`rts-human-qa`](../rts-human-qa/SKILL.md) and `node tests/human_qa_runner.js` to execute the 13 Human-Persona Playbooks.
- **Before Signing Off on a QA Report or Fix**: Use [`rts-bug-prospector`](../rts-bug-prospector/SKILL.md) to pressure-test whether passing tests could be false positives.
- **After Finding or Fixing a Bug**: Use [`rts-bug-echo`](../rts-bug-echo/SKILL.md) to scan the codebase for sibling occurrences of the same defect pattern.
