---
name: rts-model-sculptor
description: Inspect reference 2D sprite sheets vs. current procedural 3D models in C&C Generals Zero Hour, decompose their architectural/mechanical silhouette into a Ligne-Claire Obligation Ledger, re-sculpt high-fidelity 3D geometry in unit_models.js, render side-by-side 2x SSAA comparison previews, and sync across all 4 app/root/diorama files. Use when the user asks to fix, re-sculpt, upgrade, or compare a building or unit 3D model against its original sprite.
---

# RTS 3D Procedural Model Sculptor (`rts-model-sculptor`)

This skill codifies the complete workflow for comparing any **building or unit** in C&C Generals Zero Hour (USA, China, GLA, or Civilian/Tech) against its reference 2D sprite (`assets/sprites/...`), decomposing the visual gap into a clean-room architectural specification, sculpting high-fidelity procedural 3D Ligne-Claire geometry in `js/unit_models.js`, verifying via side-by-side 2x SSAA offscreen renders, and synchronizing all 4 runtime and diorama files.

## Dependencies

This skill builds upon:
- **`leanrea`** (`.agents/skills/leanrea/SKILL.md`) — Used to construct a structured **Visual Obligation Ledger** (`Seen in Sprite` / `Current 3D Defect` / `Target 3D Geometry`) before writing any geometry code.
- **`rts-bug-echo`** (`.agents/skills/rts-bug-echo/SKILL.md`) — Used to ensure every edit to `js/unit_models.js` is echoed and verified across all 4 synchronized model files in the repository.

---

## Quick Start

Run all commands from `/Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/C&C Generals Zero Hour.app/Contents/Resources`:

```bash
# 1. Inspect a model's sprite path, faction, and exact line range in unit_models.js
node "../../../.agents/skills/rts-model-sculptor/scripts/model_sculpt_tool.js" inspect \
  --def-id USA_COMMAND_CENTER

# 2. Render both a standalone 3D preview and a side-by-side Sprite vs. 3D comparison PNG
node "../../../.agents/skills/rts-model-sculptor/scripts/model_sculpt_tool.js" render \
  --def-id USA_COMMAND_CENTER \
  --output /tmp/cc_preview.png \
  --compare /tmp/cc_compare.png

# 3. After sculpting in Contents/Resources/js/unit_models.js, sync all 4 files & syntax-check
node "../../../.agents/skills/rts-model-sculptor/scripts/model_sculpt_tool.js" sync
```

---

## Utility Scripts

### `scripts/model_sculpt_tool.js`

A zero-dependency Node + headless Chrome helper script supporting three subcommands:

1. **`inspect --def-id <DEF_ID>`**
   - Resolves `<DEF_ID>` (e.g., `USA_COMMAND_CENTER`, `CHINA_BARRACKS`, `GLA_SCUD_STORM`, `USA_CRUSADER_TANK`).
   - Prints a JSON manifest containing:
     - `spriteRelPath` and `spriteAbsPath` (resolved from `BUILDING_SPRITE_PATH_BY_DEF` or `UNIT_SPRITE_PATH_BY_DEF`).
     - `rendererFn` (`renderUsaBuildingModel`, `renderChinaBuildingModel`, `renderGlaBuildingModel`, `renderCivicBuildingModel`, or `renderUnitProceduralModel`).
     - Exact `startLine` and `endLine` of the `defId` block in `C&C Generals Zero Hour.app/Contents/Resources/js/unit_models.js`.
     - `callsCompoundBaseBeforeBlock`: whether `renderBuildingCompoundBase3D` is executed before this `defId` branch.

2. **`render --def-id <DEF_ID> --output <PNG_PATH> [--compare <COMPARE_PNG_PATH>]`**
   - Spins up a temporary local HTTP server and headless Chrome instance (`deviceScaleFactor: 2`).
   - Loads `js/data.js` and `js/unit_models.js`, constructs a mock entity for `<DEF_ID>`, and renders the procedural 3D model onto an offscreen canvas (`USA_3D_STYLE_ENABLED = true`).
   - Saves the standalone 3D preview to `--output` and (when `--compare` is passed) renders a **side-by-side comparison PNG** showing the original 2D reference sprite (`assets/sprites/...`) on the left and the current 3D procedural model on the right.

3. **`sync`**
   - Runs `node --check` on `C&C Generals Zero Hour.app/Contents/Resources/js/unit_models.js`.
   - Copies `C&C Generals Zero Hour.app/Contents/Resources/js/unit_models.js` to `/Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/js/unit_models.js`.
   - Splices the updated `/* === BEGIN FULL UNIT_MODELS.JS === */ ... /* === END FULL UNIT_MODELS.JS === */` block into both:
     - `/Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/usa-units-diorama.html`
     - `/Users/muhammad.shan/Documents/cnc-generals-zero-hour-mac/C&C Generals Zero Hour.app/Contents/Resources/usa-units-diorama.html`
   - Verifies that both `unit_models.js` copies and both `usa-units-diorama.html` copies are byte-identical (`md5`).

---

## Step-by-Step Sculpting Workflow

### Step 1: Inspect & Render the "Before" Comparison
1. Run `model_sculpt_tool.js inspect --def-id <DEF_ID>` to locate the reference sprite and current code block in `C&C Generals Zero Hour.app/Contents/Resources/js/unit_models.js`.
2. Run `model_sculpt_tool.js render --def-id <DEF_ID> --output <scratch>/before_3d.png --compare <scratch>/before_compare.png`.
3. Call `view_file` on **both** the raw sprite (`spriteAbsPath`) and `<scratch>/before_compare.png` so you can inspect every proportion, angle, and detail at full resolution.

### Step 2: Build the Visual Obligation Ledger
Before writing code, decompose the sprite into 6–10 distinct anatomical zones from ground to roof:

| Zone | Seen in Reference Sprite | Current 3D Defect | Target 3D Geometry (`x, y, z` in `R` units) |
| :--- | :--- | :--- | :--- |
| **1. Base / Foundation** | Does the sprite sit on the generic dark-grey square compound pad with 4 yellow bollards, or does it have a custom contoured foundation? | Generic `renderBuildingCompoundBase3D` square pad clips or clashes with custom footprint | Bypass `renderBuildingCompoundBase3D` if standalone; build custom beveled plinth + corner anchor blocks |
| **2. Primary Hull Massing** | Multi-tier stepped/chamfered bunker, octagonal bastion, cylindrical silo, or sloped chassis | Flat rectangular `pushBox3D` slabs | Stacked chamfered frustum slices (`pushFrustumFaces`) with dark recessed horizontal seam bands between tiers |
| **3. Front / Side Facades** | Protruding vehicle deployment bays, blast shutters, loading ramps, warning chevrons, cyan glass observation slits | Tiny flat 2D boxes or wrong centroid depth sorting | Monolithic inverted-U (`∩`) portal frames + recessed dark bay + horizontal shutter slats + yellow/black hazard ramp |
| **4. Flanks & Bastions** | Asymmetric side wings, sunken octagonal radar pits, fuel spheres, exhaust stacks, buttress ribs | Missing or symmetric placeholder blocks | Custom polygon bastions (`octPts`), recessed floor pits, U-shaped perimeter parapets, angled armored ribs |
| **5. Upper Deck & Penthouse** | Elevated command bridge, wrap-around cyan glass windows, gold/white roof panels, HVAC vents | Boxy grey block with tiny window dots | Chamfered penthouse with recess band, wrap-around cyan glass strips + dark vertical mullions + specular glint lines |
| **6. Superstructure & Animate Props** | Open-truss lattice comms tower, rotating concave parabolic radar dishes, blinking aviation beacons | Solid grey pole or flat disc | 4-legged open-truss lattice tower with X-bracing (`customDraw`), 16-segment 3D concave dish bowl + 3-strut feedhorn tripod |

### Step 3: Check Compound Base Pad Bypass (Buildings Only)
In `renderUsaBuildingModel`, `renderChinaBuildingModel`, and `renderGlaBuildingModel`, a call to `renderBuildingCompoundBase3D(...)` draws a generic dark-grey square compound pad with 4 yellow-topped corner bollards.
- **Rule**: Inspect the reference sprite's ground footprint.
  - If the sprite is a **standalone contoured building** without the generic square compound pad (e.g., `USA_COMMAND_CENTER`), place its `if (defId === '...')` block **before** `renderBuildingCompoundBase3D(...)` (or add `defId !== '...'` to the `renderBuildingCompoundBase3D` guard) and sculpt its custom foundation directly.
  - If the sprite genuinely sits on a rectangular compound apron, keep `renderBuildingCompoundBase3D` or customize its parameters.

### Step 4: Sculpt the 3D Procedural Model in `unit_models.js`
Edit `C&C Generals Zero Hour.app/Contents/Resources/js/unit_models.js` using the **3D Primitives & Ligne-Claire Architecture Reference** below.
- Express all coordinates relative to `R` (`const R = b * 0.90` for buildings, or chassis scale for units) so the model scales cleanly at any zoom level.
- Maintain a consistent palette per faction:
  - **USA**: Cool military slate-blue/grey hull (`#a8b6c4`, `#8e9eae`, `#738496`), warm beige/gold terrace trim (`#dfd5c0`, `#e6dcc8`), glowing cyan optics/windows (`#4ae8ff`, `#bcfaff`), yellow/black hazard stripes (`#eab308`, `#161b22`).
  - **China**: Heavy industrial gunmetal/olive-grey (`#7c8584`, `#5a6363`), crimson/red faction banners & trim (`#b91c1c`, `#dc2626`), warm amber/red industrial glow (`#f59e0b`, `#ef4444`), corrugated steel roofs.
  - **GLA**: Sun-bleached desert sandstone/ochre (`#d4b483`, `#b89463`), rusted corrugated scrap metal (`#7c4d36`, `#5c3a28`), olive/emerald toxin or camo accents (`#4d7c0f`, `#65a30d`), timber/sandbag fortifications.

### Step 5: Render "After" Comparison & Iterate
1. Run `model_sculpt_tool.js render --def-id <DEF_ID> --output <scratch>/after_3d.png --compare <scratch>/after_compare.png`.
2. View `<scratch>/after_compare.png` with `view_file`.
3. Check specifically for:
   - **Silhouette & Massing Match**: Do the left/right asymmetries, roof heights, and footprint proportions match the reference sprite?
   - **Painter's Algorithm Depth Artifacts**: Are any background wall faces bleeding over foreground portals, ramps, hazard stripes, or towers? (See Pitfall #3 below.)
   - **Shading & Crispness**: Are any faces unexpectedly pitch-black or washed-out desert tan? (See Pitfalls #1 and #2 below.)
4. Iterate on `unit_models.js` and re-render until the 3D model is an unmistakable, crisp Ligne-Claire 3D realization of the reference sprite.

### Step 6: Sync All 4 Files
Run `model_sculpt_tool.js sync` to validate syntax and synchronize:
1. `C&C Generals Zero Hour.app/Contents/Resources/js/unit_models.js`
2. `js/unit_models.js`
3. `usa-units-diorama.html`
4. `C&C Generals Zero Hour.app/Contents/Resources/usa-units-diorama.html`

---

## 3D Primitives & Ligne-Claire Architecture Reference

### Coordinate System (`createIsoProjector`)
- **`+X`**: Front-Right (South-East on screen, down-right along `26.57°` iso axis)
- **`-X`**: Back-Left (North-West on screen, up-left)
- **`+Y`**: Front-Left (South-West on screen, down-left along `26.57°` iso axis)
- **`-Y`**: Back-Right (North-East on screen, up-right)
- **`+Z`**: Vertical height up (`z = 0` is ground plane)
- **Camera Depth**: `depth = x + y + z * 0.12` (larger `depth` is closer to the viewer and drawn later by `flush3DPolys`).

### Core Helper Pattern (`pushFrustumFaces` & `chamferRect`)
For non-boxy, beveled architectural hulls and octagonal bastions, define local polygon helpers inside the model block:

```javascript
const chamferRect = (x0, x1, y0, y1, cx, cy) => [
  { x: x0 + cx, y: y0 },
  { x: x1 - cx, y: y0 },
  { x: x1,      y: y0 + cy },
  { x: x1,      y: y1 - cy },
  { x: x1 - cx, y: y1 },
  { x: x0 + cx, y: y1 },
  { x: x0,      y: y1 - cy },
  { x: x0,      y: y0 + cy }
];

const pushFrustumFaces = (botPts, topPts, z0, z1, baseHex, topHex, strokeHex = 'rgba(18, 26, 36, 0.55)', strokeW = 0.85, depthBias = 0) => {
  const n = botPts.length;
  for (let i = 0; i < n; i++) {
    const ni = (i + 1) % n;
    const b0 = botPts[i], b1 = botPts[ni];
    const t0 = topPts[i], t1 = topPts[ni];
    const dx = b1.x - b0.x, dy = b1.y - b0.y;
    const len = Math.hypot(dx, dy) || 1;
    // CCW polygon outward normal in (x, y)
    const nx = dy / len, ny = -dx / len;
    const dz = (z1 - z0) || 1;
    const inset = ((b0.x - t0.x) * nx + (b0.y - t0.y) * ny);
    const nz = Math.max(0, inset / Math.hypot(dz, inset));
    const shade = ccProj.shadeNormal(nx, ny, nz);
    const facePts = [
      { x: b0.x, y: b0.y, z: z0 },
      { x: b1.x, y: b1.y, z: z0 },
      { x: t1.x, y: t1.y, z: z1 },
      { x: t0.x, y: t0.y, z: z1 }
    ];
    const p = ccProj.projectPoly(facePts);
    polys.push({
      pts: p.pts,
      depth: p.depth + depthBias,
      fill: shadeHex(baseHex, shade),
      stroke: strokeHex,
      strokeWidth: strokeW
    });
  }
  if (topHex) {
    const topFacePts = topPts.map(pt => ({ x: pt.x, y: pt.y, z: z1 }));
    const tp = ccProj.projectPoly(topFacePts);
    polys.push({
      pts: tp.pts,
      depth: tp.depth + 0.08 + depthBias,
      fill: shadeHex(topHex, ccProj.shadeNormal(0, 0, 1)),
      stroke: strokeHex,
      strokeWidth: strokeW
    });
  }
};
```

### Reusable Architectural Recipes
1. **Protruding Monolithic Vehicle Portal (`∩` Frame + Recessed Door + Hazard Ramp)**:
   - Draw the entire assembly inside a single `customDraw` entry with `depth: ccProj.project(frontX, frontY, topZ).depth + 4.0` so wide hull walls never clip the portal or hazard stripes.
   - Draw in strict back-to-front order:
     1. Recessed dark doorway interior (`#141c24`).
     2. Metallic grey roll-up blast door with horizontal slat lines and cyan status light strip.
     3. Sloped concrete apron ramp + 5 alternating yellow (`#eab308`) and dark (`#161b22`) chevron stripes projected directly onto the ramp slope.
     4. Monolithic inverted-U (`∩`) 6-vertex front face (`#e4dcc8`), inner reveal jambs, right outer side wall, and 3-quad top hood cap.
2. **3D Concave Parabolic Dish + 3-Strut Feedhorn Tripod**:
   - Build a 16-segment ring (`dishSegs = 16`) with an outer rim radius `rRim` and depressed inner floor radius `rInner`, tilted toward the dish's look vector `(ux, uy, uz)`.
   - Draw a central dark feed emitter cone at the bowl center, 3 thin metallic tripod struts converging to a focal receiver pod at distance `fLen` along `(ux, uy, uz)`, and a blinking red/cyan telemetry tip.
3. **Open-Truss Lattice Mast (`customDraw`)**:
   - Use 4 corner legs tapering from `wBot` at `z0` to `wTop` at `z1`.
   - Loop through `bayCount` vertical bays and draw the 4 horizontal ring struts + X-diagonal cross braces per face (`strokeStyle = '#607286'` for back faces, `'#a6b8ca'` for front faces), topped by a cantilevered steel platform and blinking red dual aviation beacons.

---

## Common Mistakes & Pitfalls (MUST AVOID)

### 1. `shadeHex(hex, factor)` Uses `1.0` as Neutral (Never Pass Negative Deltas!)
- **How `shadeHex` works**:
  - `factor === 1.0`: returns original color unchanged.
  - `factor < 1.0`: multiplies RGB by `clamp(factor, 0, 1)` toward black (`0` = pure black `#000000`).
  - `factor > 1.0`: lerps RGB toward white `255` (`1.25` = 25% brighter toward white).
- **Bug**: Passing negative numbers like `shadeHex('#24303c', -0.14)` clamps `factor` to `0` and renders `rgb(0, 0, 0)` pitch black!
- **Fix**: Always pass factors in `[0.60, 1.30]` or use `ccProj.shadeNormal(nx, ny, nz)`.

### 2. `hexToRgb` Cannot Parse `rgb(...)` Strings Returned by `mixHex`
- **How `hexToRgb` works**: It expects a `#rrggbb` or `#rgb` string. If given an `rgb(r, g, b)` string (which `mixHex` and `shadeHex` return), `hexToRgb` fails and **silently falls back to desert tan `{ r: 212, g: 176, b: 123 }`**.
- **Bug**: Passing `mixHex(teamColor, '#38bdf8', 0.55)` into `pushBox3D` or `shadeHex` turns your object desert tan!
- **Fix**: Always pass literal `#rrggbb` hex strings to `pushBox3D`, `pushFrustumFaces`, and `shadeHex`.

### 3. Painter's Algorithm Centroid Depth Clashes on Wide Hull Faces
- **How `flush3DPolys` sorts**: Every polygon is sorted by its vertex-average centroid `depth = avgX + avgY + avgZ * 0.12`.
- **Bug A**: A wide front-left (`+Y`) hull wall spanning `x = -0.82R .. +0.63R` has midpoint `x = -0.095R`. A narrow protruding portal located on the left half of that wall (`x = -0.58R .. -0.10R`, midpoint `x = -0.34R`) has a **smaller** `x + y` centroid depth than the wall behind it, causing the main wall to paint right over the portal!
- **Bug B**: Individual `pushBox3D` hazard stripes on the upper-left half of a sloped ramp have smaller `x + y` centroids than the full-width ramp slab (`x = -0.34R`), so the ramp slab paints over its own stripes!
- **Fix**: Group any protruding facade feature (portal frame + recessed door + sloped ramp + hazard stripes) or rooftop tower into a deterministic back-to-front `customDraw` callback anchored at the feature's foreground depth (`ccProj.project(frontX, frontY, topZ).depth + bias`).

### 4. Generic Compound Base Pad (`renderBuildingCompoundBase3D`) Clashing with Custom Footprints
- **Bug**: By default, `renderUsaBuildingModel`, `renderChinaBuildingModel`, and `renderGlaBuildingModel` call `renderBuildingCompoundBase3D(...)` near the top of the function, drawing a generic square slab and 4 yellow-topped corner bollards under every building.
- **Fix**: Check whether the reference sprite actually has that generic square pad. If the sprite is a standalone contoured structure (like `USA_COMMAND_CENTER`), place its `if (defId === '...')` branch **before** `renderBuildingCompoundBase3D(...)` and `return;` at the end of the block.
