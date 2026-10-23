#!/usr/bin/env node
'use strict';

/**
 * C&C Generals: Zero Hour (macOS) — Ligne-Claire 3D Model Sculptor CLI Tool
 * Zero-dependency Node.js CLI for:
 *   1. inspect --id <DEF_ID> --output <json_path>
 *   2. render  --id <DEF_ID> --output <preview_png> [--compare <compare_png>] [--angle <rad>] [--radius <px>]
 *   3. sync    --id <DEF_ID> --output <report_json>
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const vm = require('vm');
const { execFileSync } = require('child_process');

// Resolve workspace root and Resources directory automatically
const SCRIPT_DIR = __dirname;
const WORKSPACE_ROOT = path.resolve(SCRIPT_DIR, '../../../..');
const APP_RESOURCES = path.join(WORKSPACE_ROOT, 'C&C Generals Zero Hour.app/Contents/Resources');
const MASTER_MODELS_JS = path.join(APP_RESOURCES, 'js/unit_models.js');
const ROOT_MODELS_JS = path.join(WORKSPACE_ROOT, 'js/unit_models.js');
const APP_DIORAMA_HTML = path.join(APP_RESOURCES, 'usa-units-diorama.html');
const ROOT_DIORAMA_HTML = path.join(WORKSPACE_ROOT, 'usa-units-diorama.html');

// ============================================================================
// 1. Pure-JS PNG Encoder & Decoder (8-bit RGB / RGBA / Palette / Grayscale)
// ============================================================================
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8-bit
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    const rowStart = y * width * 4;
    raw.set(rgba.subarray(rowStart, rowStart + width * 4), y * stride + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 6 });
  return Buffer.concat([sig, makeChunk('IHDR', ihdr), makeChunk('IDAT', idat), makeChunk('IEND', Buffer.alloc(0))]);
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePng(buf) {
  let offset = 8;
  let width = 0, height = 0, bitDepth = 8, colorType = 6;
  let palette = null;
  let trns = null;
  const idatParts = [];

  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    offset += 12 + len;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'PLTE') {
      palette = data;
    } else if (type === 'tRNS') {
      trns = data;
    } else if (type === 'IDAT') {
      idatParts.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  const inflated = zlib.inflateSync(Buffer.concat(idatParts));
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : 1;
  const rowBytes = width * bpp;
  const recon = new Uint8Array(width * height * bpp);

  for (let y = 0; y < height; y++) {
    const filter = inflated[y * (rowBytes + 1)];
    const srcOff = y * (rowBytes + 1) + 1;
    const dstOff = y * rowBytes;
    for (let i = 0; i < rowBytes; i++) {
      const x = inflated[srcOff + i];
      const a = i >= bpp ? recon[dstOff + i - bpp] : 0;
      const b = y > 0 ? recon[dstOff - rowBytes + i] : 0;
      const c = (y > 0 && i >= bpp) ? recon[dstOff - rowBytes + i - bpp] : 0;
      let val = x;
      if (filter === 1) val = (x + a) & 255;
      else if (filter === 2) val = (x + b) & 255;
      else if (filter === 3) val = (x + ((a + b) >> 1)) & 255;
      else if (filter === 4) val = (x + paethPredictor(a, b, c)) & 255;
      recon[dstOff + i] = val;
    }
  }

  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    const di = p * 4;
    if (colorType === 6) {
      const si = p * 4;
      rgba[di] = recon[si];
      rgba[di + 1] = recon[si + 1];
      rgba[di + 2] = recon[si + 2];
      rgba[di + 3] = recon[si + 3];
    } else if (colorType === 2) {
      const si = p * 3;
      rgba[di] = recon[si];
      rgba[di + 1] = recon[si + 1];
      rgba[di + 2] = recon[si + 2];
      rgba[di + 3] = 255;
    } else if (colorType === 3 && palette) {
      const idx = recon[p];
      rgba[di] = palette[idx * 3] || 0;
      rgba[di + 1] = palette[idx * 3 + 1] || 0;
      rgba[di + 2] = palette[idx * 3 + 2] || 0;
      rgba[di + 3] = (trns && idx < trns.length) ? trns[idx] : 255;
    } else if (colorType === 4) {
      const si = p * 2;
      rgba[di] = rgba[di + 1] = rgba[di + 2] = recon[si];
      rgba[di + 3] = recon[si + 1];
    } else {
      rgba[di] = rgba[di + 1] = rgba[di + 2] = recon[p];
      rgba[di + 3] = 255;
    }
  }
  return { width, height, rgba };
}

// ============================================================================
// 2. Zero-Dependency 2x SSAA Software Canvas2D Rasterizer
// ============================================================================
function parseColor(str) {
  if (!str || typeof str !== 'string') return [0, 0, 0, 255];
  if (typeof str === 'object' && str._stops) {
    return str._stops.length ? parseColor(str._stops[0].color) : [180, 180, 180, 255];
  }
  const s = str.trim();
  if (s === 'transparent' || s === 'none') return [0, 0, 0, 0];
  if (s.startsWith('#')) {
    let h = s.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const num = parseInt(h, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255, 255];
  }
  const m = s.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
  if (m) {
    return [
      Math.round(Number(m[1])),
      Math.round(Number(m[2])),
      Math.round(Number(m[3])),
      m[4] !== undefined ? Math.round(Number(m[4]) * 255) : 255
    ];
  }
  return [128, 128, 128, 255];
}

class SoftCanvas {
  constructor(w, h) {
    this.width = w;
    this.height = h;
    this.data = new Uint8ClampedArray(w * h * 4);
    this.stack = [];
    this.mat = [1, 0, 0, 1, 0, 0];
    this.fillStyle = '#000000';
    this.strokeStyle = '#000000';
    this.lineWidth = 1;
    this.globalAlpha = 1;
    this.lineJoin = 'miter';
    this.lineCap = 'butt';
    this.subpaths = [];
    this.curr = [];
  }
  getContext() { return this; }
  clearBackground(r, g, b, a = 255) {
    for (let i = 0; i < this.data.length; i += 4) {
      this.data[i] = r;
      this.data[i + 1] = g;
      this.data[i + 2] = b;
      this.data[i + 3] = a;
    }
  }
  save() {
    this.stack.push({
      mat: [...this.mat],
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
      globalAlpha: this.globalAlpha
    });
  }
  restore() {
    const s = this.stack.pop();
    if (s) {
      this.mat = s.mat;
      this.fillStyle = s.fillStyle;
      this.strokeStyle = s.strokeStyle;
      this.lineWidth = s.lineWidth;
      this.globalAlpha = s.globalAlpha;
    }
  }
  setTransform(a, b, c, d, e, f) { this.mat = [a, b, c, d, e, f]; }
  transform(a, b, c, d, e, f) {
    const m = this.mat;
    this.mat = [
      m[0] * a + m[2] * b,
      m[1] * a + m[3] * b,
      m[0] * c + m[2] * d,
      m[1] * c + m[3] * d,
      m[0] * e + m[2] * f + m[4],
      m[1] * e + m[3] * f + m[5]
    ];
  }
  translate(tx, ty) { this.transform(1, 0, 0, 1, tx, ty); }
  scale(sx, sy) { this.transform(sx, 0, 0, sy, 0, 0); }
  rotate(ang) {
    const c = Math.cos(ang), s = Math.sin(ang);
    this.transform(c, s, -s, c, 0, 0);
  }
  tx(x, y) {
    const m = this.mat;
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  }
  setLineDash() {}
  createLinearGradient() {
    return { _stops: [], addColorStop(t, color) { this._stops.push({ t, color }); } };
  }
  createRadialGradient() {
    return { _stops: [], addColorStop(t, color) { this._stops.push({ t, color }); } };
  }
  beginPath() {
    this.subpaths = [];
    this.curr = [];
  }
  moveTo(x, y) {
    if (this.curr.length > 0) this.subpaths.push({ pts: this.curr, closed: false });
    this.curr = [this.tx(x, y)];
  }
  lineTo(x, y) {
    if (this.curr.length === 0) this.curr = [this.tx(x, y)];
    else this.curr.push(this.tx(x, y));
  }
  quadraticCurveTo(cpx, cpy, x, y) {
    if (this.curr.length === 0) this.moveTo(cpx, cpy);
    const p0 = this.curr[this.curr.length - 1];
    const p1 = this.tx(cpx, cpy);
    const p2 = this.tx(x, y);
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, mt = 1 - t;
      this.curr.push([
        mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0],
        mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1]
      ]);
    }
  }
  bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
    if (this.curr.length === 0) this.moveTo(cp1x, cp1y);
    const p0 = this.curr[this.curr.length - 1];
    const p1 = this.tx(cp1x, cp1y);
    const p2 = this.tx(cp2x, cp2y);
    const p3 = this.tx(x, y);
    const steps = 16;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, mt = 1 - t;
      this.curr.push([
        mt * mt * mt * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t * t * t * p3[0],
        mt * mt * mt * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t * t * t * p3[1]
      ]);
    }
  }
  closePath() {
    if (this.curr.length > 0) {
      this.subpaths.push({ pts: this.curr, closed: true });
      this.curr = [];
    }
  }
  rect(x, y, w, h) {
    this.moveTo(x, y);
    this.lineTo(x + w, y);
    this.lineTo(x + w, y + h);
    this.lineTo(x, y + h);
    this.closePath();
  }
  roundRect(x, y, w, h) { this.rect(x, y, w, h); }
  fillRect(x, y, w, h) {
    this.beginPath();
    this.rect(x, y, w, h);
    this.fill();
  }
  strokeRect(x, y, w, h) {
    this.beginPath();
    this.rect(x, y, w, h);
    this.stroke();
  }
  clearRect(x, y, w, h) {
    const p0 = this.tx(x, y), p1 = this.tx(x + w, y + h);
    const x0 = Math.max(0, Math.floor(Math.min(p0[0], p1[0])));
    const x1 = Math.min(this.width - 1, Math.ceil(Math.max(p0[0], p1[0])));
    const y0 = Math.max(0, Math.floor(Math.min(p0[1], p1[1])));
    const y1 = Math.min(this.height - 1, Math.ceil(Math.max(p0[1], p1[1])));
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const idx = (py * this.width + px) * 4;
        this.data[idx + 3] = 0;
      }
    }
  }
  arc(x, y, r, a0, a1, ccw = false) {
    this.ellipse(x, y, r, r, 0, a0, a1, ccw);
  }
  ellipse(x, y, rx, ry, rot, a0, a1, ccw = false) {
    const steps = 36;
    let span = a1 - a0;
    if (!ccw && span < 0) span += Math.PI * 2;
    if (ccw && span > 0) span -= Math.PI * 2;
    const cR = Math.cos(rot), sR = Math.sin(rot);
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (i / steps) * span;
      const lx = Math.cos(a) * rx;
      const ly = Math.sin(a) * ry;
      const px = x + lx * cR - ly * sR;
      const py = y + lx * sR + ly * cR;
      if (i === 0 && this.curr.length === 0) this.moveTo(px, py);
      else this.lineTo(px, py);
    }
  }
  blendPixel(px, py, r, g, b, a) {
    if (px < 0 || px >= this.width || py < 0 || py >= this.height || a <= 0) return;
    const idx = (py * this.width + px) * 4;
    const alpha = (a / 255) * this.globalAlpha;
    const inv = 1 - alpha;
    this.data[idx] = Math.round(r * alpha + this.data[idx] * inv);
    this.data[idx + 1] = Math.round(g * alpha + this.data[idx + 1] * inv);
    this.data[idx + 2] = Math.round(b * alpha + this.data[idx + 2] * inv);
    this.data[idx + 3] = 255;
  }
  allSubpaths() {
    const list = [...this.subpaths];
    if (this.curr.length > 0) list.push({ pts: this.curr, closed: false });
    return list;
  }
  fill() {
    const [r, g, b, a] = parseColor(this.fillStyle);
    if (a <= 0) return;
    for (const sp of this.allSubpaths()) {
      const pts = sp.pts;
      if (pts.length < 3) continue;
      let minY = Infinity, maxY = -Infinity;
      for (const p of pts) {
        if (p[1] < minY) minY = p[1];
        if (p[1] > maxY) maxY = p[1];
      }
      const y0 = Math.max(0, Math.floor(minY));
      const y1 = Math.min(this.height - 1, Math.ceil(maxY));
      for (let y = y0; y <= y1; y++) {
        const sy = y + 0.5;
        const xs = [];
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const yi = pts[i][1], yj = pts[j][1];
          if ((yi > sy) !== (yj > sy)) {
            const x = pts[i][0] + ((pts[j][0] - pts[i][0]) * (sy - yi)) / (yj - yi);
            xs.push(x);
          }
        }
        xs.sort((u, v) => u - v);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          const xStart = Math.max(0, Math.floor(xs[k]));
          const xEnd = Math.min(this.width - 1, Math.ceil(xs[k + 1]));
          for (let x = xStart; x <= xEnd; x++) {
            this.blendPixel(x, y, r, g, b, a);
          }
        }
      }
    }
  }
  stroke() {
    const [r, g, b, a] = parseColor(this.strokeStyle);
    if (a <= 0) return;
    const scale = Math.hypot(this.mat[0], this.mat[1]);
    const halfW = Math.max(0.65, (this.lineWidth * scale) * 0.5);
    const rSq = halfW * halfW;
    for (const sp of this.allSubpaths()) {
      const pts = sp.pts;
      if (pts.length < 2) continue;
      const count = sp.closed ? pts.length : pts.length - 1;
      for (let i = 0; i < count; i++) {
        const p0 = pts[i];
        const p1 = pts[(i + 1) % pts.length];
        const minX = Math.max(0, Math.floor(Math.min(p0[0], p1[0]) - halfW - 1));
        const maxX = Math.min(this.width - 1, Math.ceil(Math.max(p0[0], p1[0]) + halfW + 1));
        const minY = Math.max(0, Math.floor(Math.min(p0[1], p1[1]) - halfW - 1));
        const maxY = Math.min(this.height - 1, Math.ceil(Math.max(p0[1], p1[1]) + halfW + 1));
        const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
        const lenSq = dx * dx + dy * dy;
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            let t = 0;
            if (lenSq > 1e-6) {
              t = ((x - p0[0]) * dx + (y - p0[1]) * dy) / lenSq;
              if (t < 0) t = 0;
              else if (t > 1) t = 1;
            }
            const cx = p0[0] + t * dx, cy = p0[1] + t * dy;
            const dSq = (x - cx) * (x - cx) + (y - cy) * (y - cy);
            if (dSq <= rSq) {
              this.blendPixel(x, y, r, g, b, a);
            }
          }
        }
      }
    }
  }
}

function downsample2x(canvas2x, outW, outH) {
  const out = new Uint8ClampedArray(outW * outH * 4);
  const w2 = canvas2x.width;
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const i00 = ((y * 2) * w2 + (x * 2)) * 4;
      const i10 = ((y * 2) * w2 + (x * 2 + 1)) * 4;
      const i01 = ((y * 2 + 1) * w2 + (x * 2)) * 4;
      const i11 = ((y * 2 + 1) * w2 + (x * 2 + 1)) * 4;
      const dst = (y * outW + x) * 4;
      for (let c = 0; c < 4; c++) {
        out[dst + c] = (canvas2x.data[i00 + c] + canvas2x.data[i10 + c] + canvas2x.data[i01 + c] + canvas2x.data[i11 + c]) >> 2;
      }
    }
  }
  return out;
}

// Bilinear + alpha-composite a decoded PNG sprite centered inside a target rect on an RGBA buffer
function blitDecodedSpriteIntoPanel(dstRgba, dstW, dstH, panelX, panelY, panelW, panelH, srcImg, margin = 24) {
  const maxW = panelW - margin * 2;
  const maxH = panelH - margin * 2;
  const scale = Math.min(maxW / srcImg.width, maxH / srcImg.height);
  const drawW = Math.round(srcImg.width * scale);
  const drawH = Math.round(srcImg.height * scale);
  const startX = panelX + Math.round((panelW - drawW) * 0.5);
  const startY = panelY + Math.round((panelH - drawH) * 0.5);

  for (let dy = 0; dy < drawH; dy++) {
    const py = startY + dy;
    if (py < 0 || py >= dstH) continue;
    const sy = ((dy + 0.5) / drawH) * srcImg.height - 0.5;
    const y0 = Math.max(0, Math.min(srcImg.height - 1, Math.floor(sy)));
    const y1 = Math.max(0, Math.min(srcImg.height - 1, y0 + 1));
    const fy = Math.max(0, sy - y0);

    for (let dx = 0; dx < drawW; dx++) {
      const px = startX + dx;
      if (px < 0 || px >= dstW) continue;
      const sx = ((dx + 0.5) / drawW) * srcImg.width - 0.5;
      const x0 = Math.max(0, Math.min(srcImg.width - 1, Math.floor(sx)));
      const x1 = Math.max(0, Math.min(srcImg.width - 1, x0 + 1));
      const fx = Math.max(0, sx - x0);

      const i00 = (y0 * srcImg.width + x0) * 4;
      const i10 = (y0 * srcImg.width + x1) * 4;
      const i01 = (y1 * srcImg.width + x0) * 4;
      const i11 = (y1 * srcImg.width + x1) * 4;

      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      const r = srcImg.rgba[i00] * w00 + srcImg.rgba[i10] * w10 + srcImg.rgba[i01] * w01 + srcImg.rgba[i11] * w11;
      const g = srcImg.rgba[i00 + 1] * w00 + srcImg.rgba[i10 + 1] * w10 + srcImg.rgba[i01 + 1] * w01 + srcImg.rgba[i11 + 1] * w11;
      const b = srcImg.rgba[i00 + 2] * w00 + srcImg.rgba[i10 + 2] * w10 + srcImg.rgba[i01 + 2] * w01 + srcImg.rgba[i11 + 2] * w11;
      const a = (srcImg.rgba[i00 + 3] * w00 + srcImg.rgba[i10 + 3] * w10 + srcImg.rgba[i01 + 3] * w01 + srcImg.rgba[i11 + 3] * w11) / 255;

      if (a > 0.005) {
        const di = (py * dstW + px) * 4;
        const inv = 1 - a;
        dstRgba[di] = Math.round(r * a + dstRgba[di] * inv);
        dstRgba[di + 1] = Math.round(g * a + dstRgba[di + 1] * inv);
        dstRgba[di + 2] = Math.round(b * a + dstRgba[di + 2] * inv);
        dstRgba[di + 3] = 255;
      }
    }
  }
}

// ============================================================================
// 3. Model Registry Loader & Source Code Extractor
// ============================================================================
function loadModelsSandbox() {
  const code = fs.readFileSync(MASTER_MODELS_JS, 'utf8');
  const sandbox = {
    window: {},
    module: { exports: {} },
    performance: { now: () => 0 },
    Math, Object, Array, Map, Set, Number, String, Boolean, parseInt, parseFloat, isNaN, console
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return { code, ZH_UNIT_MODELS: sandbox.module.exports };
}

function guessParentSpriteSheets(defId, isBuilding) {
  const id = defId.toUpperCase();
  const sheets = [];
  if (id.startsWith('USA_')) {
    if (isBuilding) {
      sheets.push('assets/diorama/usa_buildings_sheet_1.png', 'assets/diorama/usa_buildings_sheet_2.png');
    } else {
      sheets.push('assets/diorama/usa_allied_units_sheet.png', 'assets/diorama/usa_allied_units_sheet_2.png');
    }
    sheets.push('assets/diorama/usa_faction_sprite_sheet.png');
  } else if (id.startsWith('CHINA_')) {
    if (isBuilding) {
      sheets.push('assets/diorama/china_buildings_sheet_1.png', 'assets/diorama/china_buildings_sheet_2.png');
    }
    sheets.push('assets/diorama/china_faction_sprite_sheet.png');
  } else if (id.startsWith('GLA_')) {
    if (isBuilding) {
      sheets.push('assets/diorama/gla_buildings_sheet_1.png', 'assets/diorama/gla_buildings_sheet_2.png');
    }
    sheets.push('assets/diorama/gla_faction_sprite_sheet.png');
  } else {
    sheets.push('assets/diorama/urban_and_tech_sprite_sheet.png');
  }
  return sheets
    .map(rel => path.join(APP_RESOURCES, rel))
    .filter(abs => fs.existsSync(abs));
}

function extractModelSourceBlock(code, defId, renderFnName) {
  const lines = code.split('\n');

  // Case 1: Building or shared renderer with `if (defId === '<DEF_ID>') {`
  const branchRe = new RegExp(`if\\s*\\([^)]*defId\\s*===\\s*['"]${defId}['"][^)]*\\)\\s*\\{`);
  for (let i = 0; i < lines.length; i++) {
    if (branchRe.test(lines[i])) {
      let depth = 0;
      let started = false;
      let endLine = i;
      for (let j = i; j < lines.length; j++) {
        for (const ch of lines[j]) {
          if (ch === '{') { depth++; started = true; }
          else if (ch === '}') depth--;
        }
        if (started && depth <= 0) {
          endLine = j;
          break;
        }
      }
      return {
        kind: 'defId_branch',
        functionName: renderFnName,
        startLine: i + 1,
        endLine: endLine + 1,
        source: lines.slice(i, endLine + 1).join('\n')
      };
    }
  }

  // Case 2: Dedicated unit renderer function `function <renderFnName>(...) {`
  if (renderFnName) {
    const fnRe = new RegExp(`^\\s*function\\s+${renderFnName}\\s*\\(`);
    for (let i = 0; i < lines.length; i++) {
      if (fnRe.test(lines[i])) {
        let depth = 0;
        let started = false;
        let endLine = i;
        for (let j = i; j < lines.length; j++) {
          for (const ch of lines[j]) {
            if (ch === '{') { depth++; started = true; }
            else if (ch === '}') depth--;
          }
          if (started && depth <= 0) {
            endLine = j;
            break;
          }
        }
        return {
          kind: 'dedicated_function',
          functionName: renderFnName,
          startLine: i + 1,
          endLine: endLine + 1,
          source: lines.slice(i, endLine + 1).join('\n')
        };
      }
    }
  }

  return null;
}

function checkCompoundBaseActive(code, defId, renderFnName, blockStartLine) {
  if (!renderFnName || !renderFnName.includes('Building')) return false;
  const lines = code.split('\n');
  const fnRe = new RegExp(`^\\s*function\\s+${renderFnName}\\s*\\(`);
  let fnLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (fnRe.test(lines[i])) {
      fnLine = i + 1;
      break;
    }
  }
  if (fnLine === -1 || !blockStartLine) return false;
  for (let ln = fnLine; ln < blockStartLine; ln++) {
    if (lines[ln - 1].includes('renderBuildingCompoundBase3D')) {
      return true;
    }
  }
  return false;
}

// ============================================================================
// 4. Subcommands: inspect, render, sync
// ============================================================================
function parseArgs(argv) {
  const sub = argv[2];
  const opts = {};
  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const val = (i + 1 < argv.length && !argv[i + 1].startsWith('--')) ? argv[++i] : true;
      opts[key] = val;
    }
  }
  if (!opts.id && opts['def-id']) {
    opts.id = opts['def-id'];
  }
  return { sub, opts };
}

function cmdInspect(opts) {
  if (!opts.id) {
    console.error('Usage: node model_sculpt_tool.js inspect --id <DEF_ID> [--output <json_path>]');
    process.exit(1);
  }
  const defId = String(opts.id).toUpperCase();
  const { code, ZH_UNIT_MODELS } = loadModelsSandbox();
  const registry = ZH_UNIT_MODELS.MODEL_REGISTRY || {};
  const entry = registry[defId];

  if (!entry) {
    const allIds = Object.keys(registry);
    const suggestions = allIds.filter(k => k.includes(defId) || defId.includes(k)).slice(0, 12);
    console.error(`Error: DEF_ID '${defId}' not found in MODEL_REGISTRY. Closest matches: ${suggestions.join(', ') || allIds.slice(0, 15).join(', ')}`);
    process.exit(1);
  }

  const renderFnName = entry.render && entry.render.name ? entry.render.name : null;
  const isBuilding = Boolean(renderFnName && renderFnName.includes('Building'));
  const lowerId = defId.toLowerCase();

  // Resolve cropped sprite path
  const candidateSprites = [
    entry.spriteImage ? path.join(APP_RESOURCES, entry.spriteImage) : null,
    entry.referenceImage ? path.join(APP_RESOURCES, entry.referenceImage) : null,
    path.join(APP_RESOURCES, `assets/diorama/buildings/${lowerId}.png`),
    path.join(APP_RESOURCES, `assets/diorama/units/${lowerId}.png`)
  ].filter(Boolean);
  const resolvedSprite = candidateSprites.find(p => fs.existsSync(p)) || null;
  const parentSheets = guessParentSpriteSheets(defId, isBuilding);
  const extracted = extractModelSourceBlock(code, defId, renderFnName);
  const compoundBaseActiveBeforeBlock = extracted
    ? checkCompoundBaseActive(code, defId, renderFnName, extracted.startLine)
    : false;

  const result = {
    defId,
    modelCode: entry.modelCode || '',
    category: isBuilding ? 'BUILDING' : 'UNIT',
    renderFunction: renderFnName,
    masterFile: MASTER_MODELS_JS,
    croppedReferenceSprite: resolvedSprite,
    parentSpriteSheets: parentSheets,
    compoundBaseActiveBeforeBlock,
    defaultParams: entry.defaultParams || {},
    extractedBlock: extracted
  };

  if (opts.output) {
    fs.mkdirSync(path.dirname(path.resolve(opts.output)), { recursive: true });
    fs.writeFileSync(opts.output, JSON.stringify(result, null, 2), 'utf8');
  }
  const summary = Object.assign({}, result, {
    extractedBlock: extracted
      ? { type: extracted.type, startLine: extracted.startLine, endLine: extracted.endLine }
      : null
  });
  console.log(JSON.stringify(summary, null, 2));
  if (opts.output) {
    console.log(`Success! Inspected ${defId} (${renderFnName}, lines ${extracted ? `${extracted.startLine}-${extracted.endLine}` : 'N/A'}). Metadata written to: ${opts.output}`);
  }
}

function cmdRender(opts) {
  if (!opts.id || !opts.output) {
    console.error('Usage: node model_sculpt_tool.js render --id <DEF_ID> --output <preview_png> [--compare <compare_png>] [--angle <rad>] [--radius <px>]');
    process.exit(1);
  }
  const defId = String(opts.id).toUpperCase();
  const { ZH_UNIT_MODELS } = loadModelsSandbox();
  const registry = ZH_UNIT_MODELS.MODEL_REGISTRY || {};
  const entry = registry[defId];

  if (!entry) {
    console.error(`Error: DEF_ID '${defId}' not found in MODEL_REGISTRY.`);
    process.exit(1);
  }

  const renderFnName = entry.render && entry.render.name ? entry.render.name : '';
  const isBuilding = renderFnName.includes('Building');
  const outW = 480, outH = 400;
  const canvas2x = new SoftCanvas(outW * 2, outH * 2);
  // Warm desert parchment backdrop matching reference sprites (#bfac8b)
  canvas2x.clearBackground(191, 172, 139, 255);
  canvas2x.save();
  canvas2x.scale(2, 2);
  canvas2x.translate(outW * 0.5, outH * 0.60);

  const defaultRadius = isBuilding ? 124 : 76;
  const radius = opts.radius ? Number(opts.radius) : defaultRadius;
  const angle = opts.angle !== undefined ? Number(opts.angle) : 0.68;
  const factionPrefix = defId.split('_')[0];
  const defaultColor = factionPrefix === 'CHINA' ? '#dc2626' : factionPrefix === 'GLA' ? '#65a30d' : '#2563eb';
  const faction = { id: factionPrefix, color: (entry.defaultParams && entry.defaultParams.houseColor) || defaultColor };
  const params = Object.assign({}, entry.defaultParams || {}, { renderMode: 'PROCEDURAL_3D' });

  const mockEntity = {
    defId,
    def: { id: defId, size: radius * 2, faction: factionPrefix },
    radius,
    angle,
    turretAngle: angle,
    recoilOffset: 0,
    treadPhase: 0,
    hp: 1000,
    maxHp: 1000
  };

  entry.render(canvas2x, mockEntity, faction, params, { forceProcedural: true, isStudio: true });
  canvas2x.restore();

  const previewRgba = downsample2x(canvas2x, outW, outH);
  fs.mkdirSync(path.dirname(path.resolve(opts.output)), { recursive: true });
  fs.writeFileSync(opts.output, encodePng(outW, outH, previewRgba));
  console.log(`Success! 3D preview written to: ${opts.output}`);

  if (opts.compare) {
    const lowerId = defId.toLowerCase();
    const candidateSprites = [
      entry.spriteImage ? path.join(APP_RESOURCES, entry.spriteImage) : null,
      entry.referenceImage ? path.join(APP_RESOURCES, entry.referenceImage) : null,
      path.join(APP_RESOURCES, `assets/diorama/buildings/${lowerId}.png`),
      path.join(APP_RESOURCES, `assets/diorama/units/${lowerId}.png`)
    ].filter(Boolean);
    const resolvedSprite = candidateSprites.find(p => fs.existsSync(p));

    const compW = outW * 2, compH = outH;
    const compRgba = new Uint8ClampedArray(compW * compH * 4);
    // Fill background with warm desert parchment (#bfac8b)
    for (let i = 0; i < compRgba.length; i += 4) {
      compRgba[i] = 191;
      compRgba[i + 1] = 172;
      compRgba[i + 2] = 139;
      compRgba[i + 3] = 255;
    }

    // Left panel: Original Reference Sprite
    if (resolvedSprite) {
      try {
        const decoded = decodePng(fs.readFileSync(resolvedSprite));
        blitDecodedSpriteIntoPanel(compRgba, compW, compH, 0, 0, outW, outH, decoded, 20);
      } catch (err) {
        console.warn(`Warning: Failed to decode reference sprite ${resolvedSprite}: ${err.message}`);
      }
    }

    // Right panel: 3D Procedural Render
    for (let y = 0; y < outH; y++) {
      for (let x = 0; x < outW; x++) {
        const si = (y * outW + x) * 4;
        const di = (y * compW + (outW + x)) * 4;
        compRgba[di] = previewRgba[si];
        compRgba[di + 1] = previewRgba[si + 1];
        compRgba[di + 2] = previewRgba[si + 2];
        compRgba[di + 3] = 255;
      }
    }

    // Center divider line (dark ink #2b241f)
    for (let y = 0; y < compH; y++) {
      for (let dx = -1; dx <= 1; dx++) {
        const di = (y * compW + (outW + dx)) * 4;
        compRgba[di] = 43;
        compRgba[di + 1] = 36;
        compRgba[di + 2] = 31;
        compRgba[di + 3] = 255;
      }
    }

    fs.mkdirSync(path.dirname(path.resolve(opts.compare)), { recursive: true });
    fs.writeFileSync(opts.compare, encodePng(compW, compH, compRgba));
    console.log(`Success! Side-by-side comparison PNG written to: ${opts.compare}`);
  }
}

function cmdSync(opts) {
  // 1. Validate syntax of master js/unit_models.js
  execFileSync(process.execPath, ['--check', MASTER_MODELS_JS]);

  const masterCode = fs.readFileSync(MASTER_MODELS_JS, 'utf8');
  const syncedFiles = [MASTER_MODELS_JS];

  // 2. Sync root js/unit_models.js
  fs.writeFileSync(ROOT_MODELS_JS, masterCode, 'utf8');
  execFileSync(process.execPath, ['--check', ROOT_MODELS_JS]);
  syncedFiles.push(ROOT_MODELS_JS);

  // 3. Sync inline ZH_UNIT_MODELS inside both usa-units-diorama.html files
  const mStart = masterCode.indexOf('const ZH_UNIT_MODELS = (function () {');
  const mEnd = masterCode.indexOf('  return {\n    MODEL_REGISTRY,');

  if (mStart !== -1 && mEnd !== -1) {
    // Sync each building/unit renderer function in usa-units-diorama.html
    const fnNames = [
      'renderUsaBuildingModel',
      'renderChinaBuildingModel',
      'renderGlaBuildingModel',
      'renderTechBuildingModel',
      'renderCrusaderModel',
      'renderPaladinModel',
      'renderHumveeOrAvengerModel',
      'renderTomahawkModel',
      'renderAmbulanceModel',
      'renderMicrowaveTankModel',
      'renderBattleDroneModel',
      'renderDozerModel',
      'renderChinookModel',
      'renderComancheModel',
      'renderRaptorModel',
      'renderStealthFighterModel',
      'renderAuroraModel',
      'renderInfantryModel',
      'renderOverlordModel',
      'renderChinaTankModel',
      'renderChinaArtilleryModel',
      'renderChinaWheeledModel',
      'renderHelixModel',
      'renderMigModel',
      'renderGlaTankModel',
      'renderGlaWheeledModel'
    ];

    for (const dioPath of [APP_DIORAMA_HTML, ROOT_DIORAMA_HTML]) {
      if (!fs.existsSync(dioPath)) continue;
      let dioHtml = fs.readFileSync(dioPath, 'utf8');
      let updatedCount = 0;

      for (const fnName of fnNames) {
        const masterFn = extractModelSourceBlock(masterCode, '__NONE__', fnName);
        const dioFn = extractModelSourceBlock(dioHtml, '__NONE__', fnName);
        if (masterFn && dioFn && masterFn.source !== dioFn.source) {
          const dioLines = dioHtml.split('\n');
          dioLines.splice(dioFn.startLine - 1, dioFn.endLine - dioFn.startLine + 1, masterFn.source);
          dioHtml = dioLines.join('\n');
          updatedCount++;
        }
      }

      if (updatedCount > 0) {
        fs.writeFileSync(dioPath, dioHtml, 'utf8');
      }
      syncedFiles.push(dioPath);
    }
  }

  const report = {
    status: 'OK',
    defId: opts.id ? String(opts.id).toUpperCase() : 'ALL',
    syntaxCheckPassed: true,
    syncedFiles
  };

  if (opts.output) {
    fs.mkdirSync(path.dirname(path.resolve(opts.output)), { recursive: true });
    fs.writeFileSync(opts.output, JSON.stringify(report, null, 2), 'utf8');
    console.log(`Success! Synced ${syncedFiles.length} files and verified syntax. Report written to: ${opts.output}`);
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
}

// ============================================================================
// Main Entrypoint
// ============================================================================
const { sub, opts } = parseArgs(process.argv);
if (sub === 'inspect') cmdInspect(opts);
else if (sub === 'render') cmdRender(opts);
else if (sub === 'sync') cmdSync(opts);
else {
  console.error('Usage: node model_sculpt_tool.js <inspect|render|sync> --id <DEF_ID> --output <file_path> [--compare <png_path>]');
  process.exit(1);
}
