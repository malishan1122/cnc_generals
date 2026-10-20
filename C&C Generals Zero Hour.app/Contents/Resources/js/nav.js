// ============================================================================
// Command & Conquer: Generals - Zero Hour (macOS Edition)
// Phase 2: SAGE NavigationGrid, 8-Way A* Pathfinding & BFS Flow Fields
// ============================================================================

(function () {
  const WORLD_SIZE = 3200;

  class NavigationGrid {
    constructor(worldWidth = WORLD_SIZE, worldHeightOrCellSize = WORLD_SIZE, cellSize = 48) {
      if (worldHeightOrCellSize <= 256) {
        this.worldWidth = worldWidth;
        this.worldHeight = worldWidth;
        this.cellSize = worldHeightOrCellSize || 48;
      } else {
        this.worldWidth = worldWidth;
        this.worldHeight = worldHeightOrCellSize;
        this.cellSize = cellSize;
      }
      this.cols = Math.ceil(this.worldWidth / this.cellSize);
      this.rows = Math.ceil(this.worldHeight / this.cellSize);
      const total = this.cols * this.rows;
      // 0 = passable, 1 = water/cliff obstacle, 2 = building footprint
      this.obstacles = new Uint8Array(total);
      this.costField = new Uint16Array(total);
      this.flowX = new Float32Array(total);
      this.flowY = new Float32Array(total);
      this.flowCache = new Map();
      this.flowCacheTick = 0;
    }

    worldToCell(x, y) {
      const col = Math.max(0, Math.min(this.cols - 1, Math.floor(x / this.cellSize)));
      const row = Math.max(0, Math.min(this.rows - 1, Math.floor(y / this.cellSize)));
      return { col, row, idx: row * this.cols + col };
    }

    cellToWorld(col, row) {
      return {
        x: (col + 0.5) * this.cellSize,
        y: (row + 0.5) * this.cellSize
      };
    }

    inBounds(col, row) {
      return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
    }

    isBlocked(col, row, locomotor = 'TRACKED') {
      if (!this.inBounds(col, row)) return true;
      if (locomotor === 'AIRCRAFT' || locomotor === 'HELICOPTER') return false;
      const val = this.obstacles[row * this.cols + col];
      if (val === 0) return false;
      // CLIFF_CLIMBER and HOVER can traverse terrain obstacles (1), but not buildings (2)
      if ((locomotor === 'CLIFF_CLIMBER' || locomotor === 'HOVER') && val === 1) {
        return false;
      }
      return true;
    }

    isPassable(worldX, worldY, canPassCliff = false, canCrossWater = false) {
      const cell = this.worldToCell(worldX, worldY);
      const loco = canPassCliff ? 'CLIFF_CLIMBER' : canCrossWater ? 'HOVER' : 'TRACKED';
      return !this.isBlocked(cell.col, cell.row, loco);
    }

    rebuild(engineOrMapDef, buildingsArg, garrisonBunkersArg) {
      this.obstacles.fill(0);
      this.flowCache.clear();

      const isEngineObj = engineOrMapDef && (Array.isArray(engineOrMapDef.buildings) || engineOrMapDef.mapDef);
      const mapData = isEngineObj ? (engineOrMapDef.mapDef || engineOrMapDef.mapData) : engineOrMapDef;
      const buildings = isEngineObj ? engineOrMapDef.buildings : (buildingsArg || []);
      const garrisons = isEngineObj ? (engineOrMapDef.garrisonBunkers || []) : (garrisonBunkersArg || []);
      const techStructures = isEngineObj ? (engineOrMapDef.techStructures || []) : [];

      // 1. Rasterize map terrain features (rivers/cliffs if defined on map)
      if (mapData && Array.isArray(mapData.obstacles)) {
        for (const obs of mapData.obstacles) {
          const minCol = Math.max(0, Math.floor((obs.x - obs.r) / this.cellSize));
          const maxCol = Math.min(this.cols - 1, Math.floor((obs.x + obs.r) / this.cellSize));
          const minRow = Math.max(0, Math.floor((obs.y - obs.r) / this.cellSize));
          const maxRow = Math.min(this.rows - 1, Math.floor((obs.y + obs.r) / this.cellSize));
          for (let r = minRow; r <= maxRow; r++) {
            for (let c = minCol; c <= maxCol; c++) {
              const cw = this.cellToWorld(c, r);
              if (Math.hypot(cw.x - obs.x, cw.y - obs.y) <= obs.r) {
                this.obstacles[r * this.cols + c] = 1;
              }
            }
          }
        }
      }

      // 2. Rasterize buildings using cell-center footprint check so 48px grid quantization
      // does not inflate blocked cells over building doorways / spawn exits
      if (Array.isArray(buildings)) {
        for (const b of buildings) {
          if (!b || b.hp <= 0) continue;
          const bRad = b.radius || (b.def && b.def.size ? b.def.size * 0.5 : 42);
          const blockRad = Math.max(22, bRad * 0.82);
          const minCol = Math.max(0, Math.floor((b.x - blockRad) / this.cellSize));
          const maxCol = Math.min(this.cols - 1, Math.floor((b.x + blockRad) / this.cellSize));
          const minRow = Math.max(0, Math.floor((b.y - blockRad) / this.cellSize));
          const maxRow = Math.min(this.rows - 1, Math.floor((b.y + blockRad) / this.cellSize));
          for (let r = minRow; r <= maxRow; r++) {
            for (let c = minCol; c <= maxCol; c++) {
              const cw = this.cellToWorld(c, r);
              if (Math.hypot(cw.x - b.x, cw.y - b.y) <= blockRad) {
                this.obstacles[r * this.cols + c] = 2;
              }
            }
          }
        }
      }

      // 3. Rasterize neutral tech buildings & garrison bunkers (slight footprint)
      const extras = [...techStructures, ...garrisons];
      for (const s of extras) {
        if (!s || s.hp <= 0) continue;
        const c = this.worldToCell(s.x, s.y);
        this.obstacles[c.idx] = 2;
      }
    }

    findNearestPassable(col, row, locomotor = 'TRACKED', maxRadius = 6) {
      if (!this.isBlocked(col, row, locomotor)) return { col, row };
      for (let rad = 1; rad <= maxRadius; rad++) {
        let bestCell = null;
        let bestDistSq = Infinity;
        for (let dr = -rad; dr <= rad; dr++) {
          for (let dc = -rad; dc <= rad; dc++) {
            if (Math.abs(dr) !== rad && Math.abs(dc) !== rad) continue;
            const nc = col + dc;
            const nr = row + dr;
            if (!this.isBlocked(nc, nr, locomotor)) {
              const dSq = dr * dr + dc * dc;
              if (dSq < bestDistSq) {
                bestDistSq = dSq;
                bestCell = { col: nc, row: nr };
              }
            }
          }
        }
        if (bestCell) return bestCell;
      }
      return { col, row };
    }

    // Bounded 8-way A* pathfinder returning an array of world-space waypoints
    findPath(startX, startY, goalX, goalY, locomotor = 'TRACKED', maxIterations = 650) {
      if (locomotor === 'AIRCRAFT' || locomotor === 'HELICOPTER') {
        return [{ x: goalX, y: goalY }];
      }

      const sCell = this.worldToCell(startX, startY);
      const gCellRaw = this.worldToCell(goalX, goalY);
      const start = this.findNearestPassable(sCell.col, sCell.row, locomotor, 4);
      const goal = this.findNearestPassable(gCellRaw.col, gCellRaw.row, locomotor, 5);

      if (start.col === goal.col && start.row === goal.row) {
        return [{ x: goalX, y: goalY }];
      }

      // Check direct line-of-sight first (fast path)
      if (this.hasLineOfSight(start.col, start.row, goal.col, goal.row, locomotor)) {
        return [{ x: goalX, y: goalY }];
      }

      const cols = this.cols;
      const total = cols * this.rows;
      const gScore = new Float32Array(total);
      gScore.fill(Infinity);
      const cameFrom = new Int32Array(total);
      cameFrom.fill(-1);
      const closed = new Uint8Array(total);

      const startIdx = start.row * cols + start.col;
      const goalIdx = goal.row * cols + goal.col;
      gScore[startIdx] = 0;

      // Simple binary min-heap on [fScore, idx]
      const openIdx = [startIdx];
      const openF = [Math.hypot(goal.col - start.col, goal.row - start.row)];

      const dirs = [
        [1, 0, 1.0], [-1, 0, 1.0], [0, 1, 1.0], [0, -1, 1.0],
        [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]
      ];

      let bestIdx = startIdx;
      let bestDist = Math.hypot(goal.col - start.col, goal.row - start.row);
      let iter = 0;

      while (openIdx.length > 0 && iter++ < maxIterations) {
        // Pop lowest F
        let minPos = 0;
        for (let i = 1; i < openF.length; i++) {
          if (openF[i] < openF[minPos]) minPos = i;
        }
        const currIdx = openIdx[minPos];
        openIdx[minPos] = openIdx[openIdx.length - 1];
        openF[minPos] = openF[openF.length - 1];
        openIdx.pop();
        openF.pop();

        if (currIdx === goalIdx) {
          bestIdx = goalIdx;
          break;
        }
        if (closed[currIdx]) continue;
        closed[currIdx] = 1;

        const cCol = currIdx % cols;
        const cRow = (currIdx / cols) | 0;
        const dGoal = Math.hypot(goal.col - cCol, goal.row - cRow);
        if (dGoal < bestDist) {
          bestDist = dGoal;
          bestIdx = currIdx;
        }

        for (let d = 0; d < 8; d++) {
          const nc = cCol + dirs[d][0];
          const nr = cRow + dirs[d][1];
          if (this.isBlocked(nc, nr, locomotor)) continue;
          const nIdx = nr * cols + nc;
          if (closed[nIdx]) continue;

          // Prevent corner cutting across diagonal obstacles
          if (dirs[d][2] > 1.1) {
            if (this.isBlocked(cCol + dirs[d][0], cRow, locomotor) ||
                this.isBlocked(cCol, cRow + dirs[d][1], locomotor)) {
              continue;
            }
          }

          const tentativeG = gScore[currIdx] + dirs[d][2];
          if (tentativeG < gScore[nIdx]) {
            cameFrom[nIdx] = currIdx;
            gScore[nIdx] = tentativeG;
            const h = Math.hypot(goal.col - nc, goal.row - nr);
            openIdx.push(nIdx);
            openF.push(tentativeG + h * 1.15);
          }
        }
      }

      // Reconstruct path
      const rawCells = [];
      let trace = bestIdx;
      let safety = 0;
      while (trace !== -1 && trace !== startIdx && safety++ < 256) {
        const tc = trace % cols;
        const tr = (trace / cols) | 0;
        rawCells.push({ col: tc, row: tr });
        trace = cameFrom[trace];
      }
      rawCells.reverse();

      if (rawCells.length === 0) {
        return [{ x: goalX, y: goalY }];
      }

      // String-pulling path smoothing
      const waypoints = [];
      let anchor = start;
      let i = 0;
      while (i < rawCells.length) {
        let furthest = i;
        for (let j = rawCells.length - 1; j > i; j--) {
          if (this.hasLineOfSight(anchor.col, anchor.row, rawCells[j].col, rawCells[j].row, locomotor)) {
            furthest = j;
            break;
          }
        }
        const pt = this.cellToWorld(rawCells[furthest].col, rawCells[furthest].row);
        waypoints.push(pt);
        anchor = rawCells[furthest];
        i = furthest + 1;
      }

      // Replace final waypoint with exact goal coordinates
      waypoints[waypoints.length - 1] = { x: goalX, y: goalY };
      return waypoints;
    }

    hasLineOfSight(c0, r0, c1, r1, locomotor = 'TRACKED') {
      let x0 = c0, y0 = r0, x1 = c1, y1 = r1;
      const dx = Math.abs(x1 - x0);
      const dy = Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1;
      const sy = y0 < y1 ? 1 : -1;
      let err = dx - dy;
      let steps = 0;
      while (steps++ < 200) {
        if (this.isBlocked(x0, y0, locomotor)) return false;
        if (x0 === x1 && y0 === y1) return true;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx) { err += dx; y0 += sy; }
      }
      return true;
    }

    // BFS Flow-Field generation for large multi-unit group move orders
    computeFlowField(goalX, goalY, locomotor = 'TRACKED') {
      const gCellRaw = this.worldToCell(goalX, goalY);
      const goal = this.findNearestPassable(gCellRaw.col, gCellRaw.row, locomotor, 5);
      const key = `${goal.col},${goal.row},${locomotor}`;
      if (this.flowCache.has(key)) {
        return this.flowCache.get(key);
      }

      const cols = this.cols;
      const rows = this.rows;
      const total = cols * rows;
      const dist = new Uint16Array(total);
      dist.fill(65535);
      const fx = new Float32Array(total);
      const fy = new Float32Array(total);

      const goalIdx = goal.row * cols + goal.col;
      dist[goalIdx] = 0;

      const queue = new Int32Array(total);
      let head = 0, tail = 0;
      queue[tail++] = goalIdx;

      const dirs4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      while (head < tail) {
        const curr = queue[head++];
        const cc = curr % cols;
        const cr = (curr / cols) | 0;
        const nextDist = dist[curr] + 1;
        for (let d = 0; d < 4; d++) {
          const nc = cc + dirs4[d][0];
          const nr = cr + dirs4[d][1];
          if (this.isBlocked(nc, nr, locomotor)) continue;
          const nIdx = nr * cols + nc;
          if (nextDist < dist[nIdx]) {
            dist[nIdx] = nextDist;
            queue[tail++] = nIdx;
          }
        }
      }

      // Compute gradient vectors pointing toward lowest neighbor cost
      const dirs8 = [
        [1, 0], [-1, 0], [0, 1], [0, -1],
        [1, 1], [1, -1], [-1, 1], [-1, -1]
      ];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const idx = r * cols + c;
          if (dist[idx] === 0 || dist[idx] === 65535) continue;
          let bestD = dist[idx];
          let vx = 0, vy = 0;
          for (let d = 0; d < 8; d++) {
            const nc = c + dirs8[d][0];
            const nr = r + dirs8[d][1];
            if (!this.inBounds(nc, nr)) continue;
            const nd = dist[nr * cols + nc];
            if (nd < bestD) {
              bestD = nd;
              vx = dirs8[d][0];
              vy = dirs8[d][1];
            }
          }
          const len = Math.hypot(vx, vy);
          if (len > 0) {
            fx[idx] = vx / len;
            fy[idx] = vy / len;
          }
        }
      }

      const field = { goal, fx, fy, dist };
      if (this.flowCache.size > 16) {
        const firstKey = this.flowCache.keys().next().value;
        this.flowCache.delete(firstKey);
      }
      this.flowCache.set(key, field);
      return field;
    }

    sampleFlowVector(field, x, y) {
      if (!field) return { vx: 0, vy: 0 };
      const cell = this.worldToCell(x, y);
      return {
        vx: field.fx[cell.idx] || 0,
        vy: field.fy[cell.idx] || 0
      };
    }
  }

  window.ZH_NAV = {
    NavigationGrid
  };
})();
