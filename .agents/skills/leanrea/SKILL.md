---
name: leanrea
description: >-
  Reverse engineer shipped software, game engines, binaries, and SaaS applications
  with plain local CLI tools and clean-room specification ledgers (no MCP overhead).
  Covers Electron/JS bundles, native Mach-O/ELF/PE, Go/Rust/.NET/Flutter/WASM binaries,
  APKs, game data archives (INI/BIG), SQLite, pcaps, firmware, and web apps.
  Use to explain how a feature or game works, build an Obligation Ledger (Seen/Inferred/Unknown),
  and perform clean-room rebuilds.
---

# leanrea: Reverse Engineer Anything (Fast CLI & Clean-Room Rebuild Skill)

You already know these tools. This skill lists the fastest command for each target, the traps to avoid, the **Obligation Ledger** protocol, and the **Clean-Room Rebuild** workflow.

## 1. Core Rules
- **Work on a copy** (`cp -c` on APFS is instant). Put each extraction in a new dir under `$TMPDIR/re/<name>` or a dedicated project workspace. Reuse an extraction if one exists.
- **Route by `file -b T` and magic bytes first.** Run the cheapest inventory next. Only then decompile or read code.
- **`rg` skips hidden and ignored files**, and bundlers hide code (Electron: `.webpack/`, `.vite/`). Always search extracted trees with `rg -uu`.
- **Never `cat` a big or minified file.** Slice it: `rg -o '.{0,200}NEEDLE.{0,200}' F | head`. Dump a disassembly once to a file, then grep that file.
- **Batch independent probes into ONE shell call** with `;` and `echo '--- name'` markers (quoted: zsh expands a bare `==x`). Cap every output with `head` or `-m`.
- **Maintain an Obligation Ledger (Anti-Hallucination):**
  Every architectural claim, formula, data table, or state transition must be logged in `OBLIGATION_LEDGER.md` under one of three statuses:
  - **SEEN**: Verified directly from source code, INI data tables, symbols, strings, or binary offsets (cite `file:offset` or symbol/table name).
  - **INFERRED**: Derived logically from surrounding evidence or standard engine behavior.
  - **UNKNOWN**: Not directly observed; must either be probed further or explicitly documented as a clean-room design choice.
- **Turns cost more than bytes.** Aim for 2–4 tool calls: one batched recon call, one or two targeted slices, then synthesize into `OBLIGATION_LEDGER.md` and `BUILD.md`.

---

## 2. First Moves: One Call Each, Paste and Run

### Native (macOS Mach-O)
```sh
T=./bin; D=$TMPDIR/re/$(basename $T); mkdir -p $D; file $T; lipo -info $T; otool -L $T; echo '--- EXPORTS'; nm -gU $T | head -150; echo '--- IMPORTS'; nm -u $T | rg -v '^__Z|napi_' | tr '\n' ' '; echo; echo '--- STRINGS'; strings -a -n 6 $T | rg -v '^[_$.]' | head -400; otool -tV $T > $D/dis.txt; echo '--- FUNCS'; rg '^[_a-zA-Z].*:$' $D/dis.txt | rg -v '^_?_?Z?N?St3' | head -150
```
Then read one function:
```sh
awk '/^FUNC_LABEL:$/{p=1;next} p&&/^[_a-zA-Z].*:$/{exit} p' $D/dis.txt | rg 'bl|b\.|cmp|literal|mov\s+w2'
```

### Electron (`app.asar`)
```sh
A=./app.asar; X=$TMPDIR/re/asar; rm -rf $X; npx -y @electron/asar extract $A $X && jq '{name,version,main}' $X/package.json; find $X -path '*/node_modules' -prune -o -type f \( -name '*.js' -o -name '*.node' \) -print | head -60; ls ${A}.unpacked/node_modules 2>/dev/null; rg -uu -l --glob '!node_modules' 'exposeInMainWorld' $X
```
Then slice the needle across the bundle:
```sh
rg -uu -o --glob '!node_modules' '.{0,250}NEEDLE.{0,250}' $X | head -20
```

### Go Binary
```sh
go version -m T
```

---

## 3. Target Router

| Target (detect) | Fastest path |
|---|---|
| **Electron app** (`*.app/Contents/Resources/app.asar`) | `npx -y @electron/asar extract app.asar X` (also see `app.asar.unpacked/` for `.node` addons). Entry point: `jq .main X/package.json`. Surface: `rg -n -o '.{0,120}(ipcMain\.(handle|handleOnce|on|once)|ipcRenderer\.(invoke|send|sendSync|on)|contextBridge\.exposeIn(Main|Isolated)World|webPreferences|preload:|nodeIntegration|contextIsolation|sandbox|\.node\b).{0,160}' -uu X --glob '!node_modules'`. |
| **Web bundle / minified JS** | Find `sourceMappingURL`. If the map has `sourcesContent`, dump the sources: `jq -r '.sources[]'`. For webpack, grep the module ids, then slice around the hit. For pretty-print: `npx -y prettier --parser babel F > F.pretty.js`. |
| **Mach-O** (`file`: Mach-O) | `lipo -info` (thin first: `lipo -thin arm64 -o T1 T`). Then: `otool -L` (libs); `xcrun dyld_info -exports -imports`; `nm -gU` (exports) / `nm -u` (imports = capability map); `strings -a -n 6`; `codesign -d --entitlements :- T`; `otool -ov` (ObjC classes/methods); `xcrun swift-demangle --compact`. |
| **ELF / PE Native** | `llvm-objdump -d -M intel --demangle T` or `objdump -d -C T`; `llvm-readobj --NeededLibraries --symbols T`; Ghidra headless (`analyzeHeadless`) or `rizin`/`r2 -AA -qc 'afl; iz' T`. |
| **Game Engines (SAGE / Unity / Godot / Unreal)** | Extract data tables first: for SAGE/Westwood (`.big` / `Data/INI/*.ini`), parse `Object`, `Weapon`, `Armor`, `SpecialPower`, `Science`, `PlayerTemplate`, and `CommandSet` blocks. For Unity (`global-metadata.dat`), inspect IL2CPP types/methods. For Godot (`.pck`), extract scenes and GDScript resources. |
| **SQLite / Local DBs** | `sqlite3 -readonly T ".schema" ".tables"`; sample rows with `SELECT * FROM tbl LIMIT 10;`. |
| **Android APK** | `jadx -d out app.apk` and `apktool d app.apk -o res_out`; inspect `AndroidManifest.xml` and `rg -uu` across decompiled Java/Kotlin. |

---

## 4. Clean-Room Rebuild Protocol
When asked to reverse engineer and recreate an application or game:
1. **Inventory & Evidence Gathering:** Inspect available source repositories, data files (e.g., `INI` definitions, schemas, network captures), or binary symbols.
2. **Write `OBLIGATION_LEDGER.md`:** Document:
   - Core state machines & game/app loop timing
   - Entity/Object schemas, stats, costs, and relationships (marked `SEEN` / `INFERRED` / `UNKNOWN`)
   - UI/HUD layout, control schemes, and audio/visual feedback loops
3. **Write `BUILD.md`:** Define the clean-room target architecture for the host OS (e.g., macOS native app bundle + hardware-accelerated WebGL/Canvas runtime) with zero proprietary binary dependencies.
4. **Implement & Verify:** Build the clean-room implementation, verify all ledger obligations pass, and package for one-click execution.
