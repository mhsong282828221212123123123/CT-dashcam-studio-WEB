// Face mosaic (blur_face) port of core/privacy_filter.py (YuNet detector + BoxTracker + mosaic).
//
// Lazily loaded: this module is loaded on demand when the face blur option is enabled.
//
// Model: src/assets/models/face_detection_yunet_dynamic.onnx (imported with ?url so it is only
// emitted when this module is bundled)
//   Derived from the original OpenCV `face_detection_yunet.onnx` by making the input H/W dynamic
//   (the original is fixed 1x3x640x640 and ONNX Runtime rejects any other size, while OpenCV feeds it
//   320xN). Verified to reproduce cv2.FaceDetectorYN boxes/scores exactly at 320x256.
import type { CameraKey } from './constants';

export type Rect = [number, number, number, number]; // x, y, w, h
export type FrameSources = Partial<Record<CameraKey, CanvasImageSource | null | undefined>>;
export type ProcessedFrames = Partial<Record<CameraKey, CanvasImageSource>>;

/** Shared export hook; optional coordinate pre-analysis enables temporal look-ahead. */
export interface ExportFrameProcessor {
  reset(): void;
  beginExportAnalysis?(): void;
  beginExportSegment?(sampleIntervalSec: number): void;
  analyzeExport?(frames: FrameSources, baseTimeSec: number): Promise<void>;
  finishExportAnalysis?(): void;
  clearExportAnalysis?(): void;
  processExport(frames: FrameSources, sourceTimeSec?: number): Promise<ProcessedFrames>;
}

// ── Parameters mirrored from privacy_filter.py ──────────────────────────────────────────────────
export const SCORE_THRESHOLD = 0.45;
export const NMS_THRESHOLD = 0.3;
export const TOP_K = 5000;
export const DETECT_WIDTH = 320;
export const DETECT_INTERVAL = 4;
const FACE_PAD_RATIO = 0.15;
const STRIDES = [8, 16, 32];

// ── Pure helpers (unit-testable, no DOM) ────────────────────────────────────────────────────────

function iou(a: Rect, b: Rect): number {
  const ix1 = Math.max(a[0], b[0]);
  const iy1 = Math.max(a[1], b[1]);
  const ix2 = Math.min(a[0] + a[2], b[0] + b[2]);
  const iy2 = Math.min(a[1] + a[3], b[1] + b[3]);
  if (ix2 <= ix1 || iy2 <= iy1) return 0;
  const inter = (ix2 - ix1) * (iy2 - iy1);
  const union = a[2] * a[3] + b[2] * b[3] - inter;
  return union > 0 ? inter / union : 0;
}

/** Same semantics as cv2.dnn.NMSBoxes: keep a box when IoU with every kept box is <= nmsThr. */
export function nmsBoxes(boxes: Rect[], scores: number[], scoreThr: number, nmsThr: number, topK: number): number[] {
  const order: number[] = [];
  for (let i = 0; i < boxes.length; i++) {
    if (scores[i] > scoreThr) order.push(i);
  }
  order.sort((p, q) => scores[q] - scores[p]);
  const candidates = topK > 0 ? order.slice(0, topK) : order;
  const keep: number[] = [];
  for (const idx of candidates) {
    let ok = true;
    for (const k of keep) {
      if (iou(boxes[idx], boxes[k]) > nmsThr) {
        ok = false;
        break;
      }
    }
    if (ok) keep.push(idx);
  }
  return keep;
}

export interface FaceDet {
  box: Rect; // in (padded) detector input coordinates
  score: number;
}

/**
 * Decode YuNet's 12 output tensors (cls/obj/bbox/kps per stride 8/16/32).
 * Mirrors OpenCV's FaceDetectorYN: score = sqrt(clamp(cls) * clamp(obj)),
 * box center = (col + dx) * stride, size = exp(dw/dh) * stride.
 */
export function decodeYuNet(
  outputs: Record<string, Float32Array>,
  padW: number,
  padH: number,
  scoreThr = SCORE_THRESHOLD,
  nmsThr = NMS_THRESHOLD,
  topK = TOP_K
): FaceDet[] {
  const boxes: Rect[] = [];
  const scores: number[] = [];
  for (const stride of STRIDES) {
    const cols = Math.floor(padW / stride);
    const rows = Math.floor(padH / stride);
    const cls = outputs[`cls_${stride}`];
    const obj = outputs[`obj_${stride}`];
    const bb = outputs[`bbox_${stride}`];
    if (!cls || !obj || !bb) throw new Error(`YuNet output tensors for stride ${stride} are missing`);
    if (cls.length !== rows * cols) {
      throw new Error(`YuNet output size mismatch at stride ${stride}: got ${cls.length}, expected ${rows * cols}`);
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const sc = Math.sqrt(Math.min(1, Math.max(0, cls[i])) * Math.min(1, Math.max(0, obj[i])));
        if (sc < scoreThr) continue;
        const cx = (c + bb[i * 4]) * stride;
        const cy = (r + bb[i * 4 + 1]) * stride;
        const w = Math.exp(bb[i * 4 + 2]) * stride;
        const h = Math.exp(bb[i * 4 + 3]) * stride;
        boxes.push([cx - w / 2, cy - h / 2, w, h]);
        scores.push(sc);
      }
    }
  }
  if (boxes.length === 0) return [];
  return nmsBoxes(boxes, scores, scoreThr, nmsThr, topK).map((i) => ({ box: boxes[i], score: scores[i] }));
}

/** Detector-space boxes -> source-frame rects with 15% padding (privacy_filter.py `_detect_faces`). */
export function mapDetections(dets: FaceDet[], dw: number, dh: number, srcW: number, srcH: number): Rect[] {
  const sx = srcW / dw;
  const sy = srcH / dh;
  const out: Rect[] = [];
  for (const { box } of dets) {
    const [x, y, w, h] = box;
    const px = Math.trunc(w * FACE_PAD_RATIO);
    const py = Math.trunc(h * FACE_PAD_RATIO);
    const rx = Math.max(0, Math.trunc((x - px) * sx));
    const ry = Math.max(0, Math.trunc((y - py) * sy));
    const rw = Math.min(srcW - rx, Math.trunc((w + px * 2) * sx));
    const rh = Math.min(srcH - ry, Math.trunc((h + py * 2) * sy));
    out.push([rx, ry, rw, rh]);
  }
  return out;
}

/** RGBA pixels -> planar BGR float32 (raw 0..255, no normalisation), zero padded bottom/right. */
export function fillTensor(rgba: Uint8ClampedArray, w: number, h: number, padW: number, padH: number, out: Float32Array): void {
  const plane = padW * padH;
  for (let y = 0; y < h; y++) {
    let src = y * w * 4;
    let dst = y * padW;
    for (let x = 0; x < w; x++) {
      out[dst] = rgba[src + 2]; // B
      out[plane + dst] = rgba[src + 1]; // G
      out[plane * 2 + dst] = rgba[src]; // R
      src += 4;
      dst++;
    }
  }
}

// ── Template matching (replacement for cv2.matchTemplate TM_CCOEFF_NORMED) ──────────────────────

export interface GrayPatch {
  data: Uint8Array;
  w: number;
  h: number;
  /** top-left of the patch inside the frame */
  x: number;
  y: number;
}

/** Lazy grayscale view of the current (unmasked) frame; only requested regions are read back. */
export interface GraySource {
  width: number;
  height: number;
  region(x1: number, y1: number, x2: number, y2: number): GrayPatch | null;
}

function downsample2(src: Uint8Array, w: number, h: number): { data: Uint8Array; w: number; h: number } {
  const nw = Math.floor(w / 2);
  const nh = Math.floor(h / 2);
  const out = new Uint8Array(nw * nh);
  for (let y = 0; y < nh; y++) {
    const r0 = y * 2 * w;
    const r1 = r0 + w;
    for (let x = 0; x < nw; x++) {
      const i = x * 2;
      out[y * nw + x] = (src[r0 + i] + src[r0 + i + 1] + src[r1 + i] + src[r1 + i + 1]) >> 2;
    }
  }
  return { data: out, w: nw, h: nh };
}

/**
 * Normalised cross-correlation (TM_CCOEFF_NORMED). Returns the best top-left position of `tpl`
 * inside `img` and its score in [-1, 1]. O(positions * template) for the correlation term; the
 * window mean / variance come from integral images.
 */
export function matchTemplateNCC(
  img: Uint8Array, iw: number, ih: number,
  tpl: Uint8Array, tw: number, th: number
): { score: number; x: number; y: number } | null {
  if (tw <= 0 || th <= 0 || iw < tw || ih < th) return null;
  const n = tw * th;

  let sumT = 0;
  for (let i = 0; i < n; i++) sumT += tpl[i];
  const meanT = sumT / n;
  const tz = new Float32Array(n);
  let sumTT = 0;
  for (let i = 0; i < n; i++) {
    const v = tpl[i] - meanT;
    tz[i] = v;
    sumTT += v * v;
  }
  if (sumTT < 1e-6) return null; // flat template: correlation undefined

  // integral images of img and img^2 (size (iw+1)*(ih+1))
  const stride = iw + 1;
  const integ = new Float64Array(stride * (ih + 1));
  const integ2 = new Float64Array(stride * (ih + 1));
  for (let y = 0; y < ih; y++) {
    let rowSum = 0;
    let rowSum2 = 0;
    for (let x = 0; x < iw; x++) {
      const v = img[y * iw + x];
      rowSum += v;
      rowSum2 += v * v;
      integ[(y + 1) * stride + x + 1] = integ[y * stride + x + 1] + rowSum;
      integ2[(y + 1) * stride + x + 1] = integ2[y * stride + x + 1] + rowSum2;
    }
  }

  let best = -2;
  let bx = 0;
  let by = 0;
  const maxX = iw - tw;
  const maxY = ih - th;
  for (let y = 0; y <= maxY; y++) {
    for (let x = 0; x <= maxX; x++) {
      const a = y * stride + x;
      const b = a + tw;
      const c = (y + th) * stride + x;
      const d = c + tw;
      const sumI = integ[d] - integ[b] - integ[c] + integ[a];
      const sumII = integ2[d] - integ2[b] - integ2[c] + integ2[a];
      const varI = sumII - (sumI * sumI) / n;
      if (varI < 1e-6) continue;

      // sum(tz * I) (tz is zero-mean so the window mean cancels out)
      let num = 0;
      let ti = 0;
      for (let ty = 0; ty < th; ty++) {
        const rowBase = (y + ty) * iw + x;
        for (let tx = 0; tx < tw; tx++) {
          num += tz[ti++] * img[rowBase + tx];
        }
      }
      const score = num / Math.sqrt(sumTT * varI);
      if (score > best) {
        best = score;
        bx = x;
        by = y;
      }
    }
  }
  return best < -1.5 ? null : { score: best, x: bx, y: by };
}

/** NCC of `tpl` against `img` at one exact offset (used to refine a coarse half-resolution match). */
function nccAt(
  img: Uint8Array, iw: number, ih: number,
  tpl: Uint8Array, tw: number, th: number,
  x: number, y: number
): number {
  if (x < 0 || y < 0 || x + tw > iw || y + th > ih) return -2;
  const n = tw * th;
  let sumT = 0;
  let sumI = 0;
  let sumII = 0;
  for (let ty = 0; ty < th; ty++) {
    const base = (y + ty) * iw + x;
    for (let tx = 0; tx < tw; tx++) {
      const iv = img[base + tx];
      sumT += tpl[ty * tw + tx];
      sumI += iv;
      sumII += iv * iv;
    }
  }
  const meanT = sumT / n;
  const varI = sumII - (sumI * sumI) / n;
  let num = 0;
  let sumTT = 0;
  for (let ty = 0; ty < th; ty++) {
    const base = (y + ty) * iw + x;
    for (let tx = 0; tx < tw; tx++) {
      const tz = tpl[ty * tw + tx] - meanT;
      num += tz * img[base + tx];
      sumTT += tz * tz;
    }
  }
  if (varI < 1e-6 || sumTT < 1e-6) return -2;
  return num / Math.sqrt(sumTT * varI);
}

/** Match at half resolution when the template is big enough (≈16x cheaper), then refine at full resolution. */
function matchPatch(roi: GrayPatch, tpl: GrayPatch): { score: number; x: number; y: number } | null {
  if (tpl.w >= 20 && tpl.h >= 16 && roi.w >= 2 * 8 && roi.h >= 2 * 8) {
    const dt = downsample2(tpl.data, tpl.w, tpl.h);
    const dr = downsample2(roi.data, roi.w, roi.h);
    const m = matchTemplateNCC(dr.data, dr.w, dr.h, dt.data, dt.w, dt.h);
    if (!m) return null;
    // refine in a +-2px window at full resolution
    let best = { score: -2, x: m.x * 2, y: m.y * 2 };
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const s = nccAt(roi.data, roi.w, roi.h, tpl.data, tpl.w, tpl.h, m.x * 2 + dx, m.y * 2 + dy);
        if (s > best.score) best = { score: s, x: m.x * 2 + dx, y: m.y * 2 + dy };
      }
    }
    return best.score > -1.5 ? best : { score: m.score, x: m.x * 2, y: m.y * 2 };
  }
  return matchTemplateNCC(roi.data, roi.w, roi.h, tpl.data, tpl.w, tpl.h);
}

/** Canvas-backed GraySource (BT.601 luma like cv2.cvtColor). */
export function canvasGray(ctx: CanvasRenderingContext2D, width: number, height: number): GraySource {
  return {
    width,
    height,
    region(x1, y1, x2, y2) {
      const rx1 = Math.max(0, Math.floor(x1));
      const ry1 = Math.max(0, Math.floor(y1));
      const rx2 = Math.min(width, Math.ceil(x2));
      const ry2 = Math.min(height, Math.ceil(y2));
      const w = rx2 - rx1;
      const h = ry2 - ry1;
      if (w <= 0 || h <= 0) return null;
      const rgba = ctx.getImageData(rx1, ry1, w, h).data;
      const g = new Uint8Array(w * h);
      for (let i = 0, j = 0; i < g.length; i++, j += 4) {
        g[i] = (rgba[j] * 299 + rgba[j + 1] * 587 + rgba[j + 2] * 114) / 1000;
      }
      return { data: g, w, h, x: rx1, y: ry1 };
    },
  };
}

// ── Tracker (port of BoxTracker incl. template-matching inter-frame tracking) ───────────────────

interface Track {
  lastDetection?: Rect;
  rect: Rect;
  center: [number, number];
  velocity: [number, number];
  size: [number, number];
  hits: number;
  ttl: number;
  confirmed: boolean;
  template: GrayPatch | null;
}

export class BoxTracker {
  tracks = new Map<number, Track>();
  private nextId = 0;

  constructor(private minHits = 1, private maxTtl = 48) {}

  private static center(r: Rect): [number, number] {
    return [r[0] + r[2] / 2, r[1] + r[3] / 2];
  }

  private static dist(a: Rect, b: Rect): number {
    const [ax, ay] = BoxTracker.center(a);
    const [bx, by] = BoxTracker.center(b);
    return Math.hypot(ax - bx, ay - by);
  }

  private expire(): void {
    for (const [id, t] of [...this.tracks]) {
      if (t.ttl - 1 <= 0) this.tracks.delete(id);
    }
    for (const t of this.tracks.values()) t.ttl -= 1;
  }

  private static rectFrom(cx: number, cy: number, fw: number, fh: number): Rect {
    return [Math.trunc(cx - fw / 2), Math.trunc(cy - fh / 2), Math.trunc(fw), Math.trunc(fh)];
  }

  private static grabTemplate(gray: GraySource, rect: Rect): GrayPatch | null {
    const x1 = Math.max(0, rect[0]);
    const y1 = Math.max(0, rect[1]);
    const x2 = Math.min(gray.width, rect[0] + rect[2]);
    const y2 = Math.min(gray.height, rect[1] + rect[3]);
    if (x2 - x1 >= 8 && y2 - y1 >= 6) return gray.region(x1, y1, x2, y2);
    return null;
  }

  /** Detection frame: match detections to tracks, update, create new tracks. */
  update(detected: Rect[], gray?: GraySource): Rect[] {
    this.expire();
    const matched = new Set<number>();

    for (const t of this.tracks.values()) {
      let bestScore = 0;
      let bestIdx = -1;
      const [tw, th] = [t.rect[2], t.rect[3]];
      const maxDist = Math.max(tw * 3.0, th * 4.5, 120.0);
      const [vx, vy] = t.velocity;
      const pred: Rect = [t.rect[0] + vx, t.rect[1] + vy, tw, th];

      detected.forEach((d, i) => {
        if (matched.has(i)) return;
        const ov = Math.max(iou(t.rect, d), iou(pred, d));
        const dist = Math.min(BoxTracker.dist(t.rect, d), BoxTracker.dist(pred, d));
        if (ov >= 0.08 || (dist < maxDist && ov > 0.01)) {
          const score = ov + Math.max(0, 1 - dist / maxDist);
          if (score > bestScore) {
            bestScore = score;
            bestIdx = i;
          }
        }
      });

      if (bestIdx >= 0) {
        matched.add(bestIdx);
        const [dx, dy, dw, dh] = detected[bestIdx];
        t.lastDetection = [dx, dy, dw, dh];
        const dcx = dx + dw / 2;
        const dcy = dy + dh / 2;
        const [curCx, curCy] = t.center;
        const [curW, curH] = t.size;

        const shift = Math.hypot(dcx - curCx, dcy - curCy);
        let a: number;
        let vxMeas: number;
        let vyMeas: number;
        if (shift < 4.0) {
          a = 0.25;
          vxMeas = 0;
          vyMeas = 0;
        } else if (shift < 20.0) {
          a = 0.6;
          vxMeas = (dcx - curCx) * 0.6;
          vyMeas = (dcy - curCy) * 0.6;
        } else {
          a = 0.85;
          vxMeas = dcx - curCx;
          vyMeas = dcy - curCy;
        }
        t.center = [a * dcx + (1 - a) * curCx, a * dcy + (1 - a) * curCy];

        const vxC = Math.max(-45, Math.min(45, vxMeas));
        const vyC = Math.max(-45, Math.min(45, vyMeas));
        t.velocity = [0.65 * vxC + 0.35 * t.velocity[0], 0.65 * vyC + 0.35 * t.velocity[1]];

        t.size = [Math.trunc(0.4 * dw + 0.6 * curW), Math.trunc(0.4 * dh + 0.6 * curH)];
        t.rect = BoxTracker.rectFrom(t.center[0], t.center[1], t.size[0], t.size[1]);
        t.hits += 1;
        if (t.hits >= this.minHits) {
          t.confirmed = true;
          t.ttl = this.maxTtl;
        } else {
          t.ttl = 10;
        }
        if (gray) {
          // Template comes from the detection itself (python cuts it from the EMA-smoothed rect, which
          // bakes a constant offset of up to ~5px into every later template-matched frame).
          const p = BoxTracker.grabTemplate(gray, [dx, dy, dw, dh]);
          if (p) t.template = p;
        }
      } else {
        // No detection for this track: inertial motion
        let [vx2, vy2] = t.velocity;
        if (Math.abs(vx2) < 1 && Math.abs(vy2) < 1) {
          vx2 = 0;
          vy2 = 0;
        }
        t.center = [t.center[0] + vx2, t.center[1] + vy2];
        t.velocity = [vx2 * 0.8, vy2 * 0.8];
        t.rect = BoxTracker.rectFrom(t.center[0], t.center[1], t.size[0], t.size[1]);
      }
    }

    detected.forEach((d, i) => {
      if (matched.has(i)) return;
      this.nextId += 1;
      this.tracks.set(this.nextId, {
        lastDetection: [...d],
        rect: [d[0], d[1], d[2], d[3]],
        center: BoxTracker.center(d),
        velocity: [0, 0],
        size: [d[2], d[3]],
        hits: 1,
        ttl: 8,
        confirmed: this.minHits <= 1,
        template: gray ? BoxTracker.grabTemplate(gray, d) : null,
      });
    });

    return this.current();
  }

  /**
   * Frames without detection: follow each face by template matching in a window around the
   * predicted position (python `track_interframe`); fall back to inertia when matching fails.
   */
  trackInterframe(gray?: GraySource): Rect[] {
    if (this.tracks.size === 0) return [];
    this.expire();

    for (const t of this.tracks.values()) {
      if (!t.confirmed) continue;
      const [cx, cy] = t.center;
      const [fw, fh] = t.size;
      let [vx, vy] = t.velocity;

      let matched = false;
      const tpl = t.template;
      if (gray && tpl && tpl.w >= 8 && tpl.h >= 6) {
        const predCx = cx + vx;
        const predCy = cy + vy;
        const padX = Math.max(25, Math.trunc(tpl.w * 0.6));
        const padY = Math.max(18, Math.trunc(tpl.h * 0.8));
        const sx1 = Math.max(0, Math.trunc(predCx - tpl.w / 2 - padX));
        const sy1 = Math.max(0, Math.trunc(predCy - tpl.h / 2 - padY));
        const sx2 = Math.min(gray.width, Math.trunc(predCx + tpl.w / 2 + padX));
        const sy2 = Math.min(gray.height, Math.trunc(predCy + tpl.h / 2 + padY));
        const roi = gray.region(sx1, sy1, sx2, sy2);
        if (roi && roi.w >= tpl.w && roi.h >= tpl.h) {
          const m = matchPatch(roi, tpl);
          if (m && m.score >= 0.5) {
            matched = true;
            const matchedX = roi.x + m.x;
            const matchedY = roi.y + m.y;
            const mcx = matchedX + tpl.w / 2;
            const mcy = matchedY + tpl.h / 2;
            const vxC = Math.max(-45, Math.min(45, mcx - cx));
            const vyC = Math.max(-45, Math.min(45, mcy - cy));
            t.velocity = [0.7 * vxC + 0.3 * vx, 0.7 * vyC + 0.3 * vy];
            t.center = [mcx, mcy];
            t.rect = BoxTracker.rectFrom(mcx, mcy, fw, fh);
            // gradual template adaptation (only when the full-size patch is available)
            const nx1 = Math.max(0, Math.trunc(matchedX));
            const ny1 = Math.max(0, Math.trunc(matchedY));
            const nx2 = Math.min(gray.width, Math.trunc(matchedX + tpl.w));
            const ny2 = Math.min(gray.height, Math.trunc(matchedY + tpl.h));
            if (nx2 - nx1 === tpl.w && ny2 - ny1 === tpl.h) {
              const p = gray.region(nx1, ny1, nx2, ny2);
              if (p) t.template = p;
            }
          }
        }
      }

      if (!matched) {
        if (Math.abs(vx) < 1 && Math.abs(vy) < 1) {
          vx = 0;
          vy = 0;
        }
        t.center = [cx + vx, cy + vy];
        t.velocity = [vx * 0.9, vy * 0.9];
        t.rect = BoxTracker.rectFrom(t.center[0], t.center[1], fw, fh);
      }
    }
    return this.current();
  }

  /** Re-grab templates for all confirmed tracks from a clean frame (after an async detection update). */
  refreshTemplates(gray: GraySource): void {
    for (const t of this.tracks.values()) {
      if (!t.confirmed) continue;
      const p = BoxTracker.grabTemplate(gray, t.rect);
      if (p) t.template = p;
    }
  }

  current(): Rect[] {
    const out: Rect[] = [];
    for (const t of this.tracks.values()) {
      if (t.confirmed) out.push([t.rect[0], t.rect[1], t.rect[2], t.rect[3]]);
    }
    return out;
  }

  reset(): void {
    this.tracks.clear();
    this.nextId = 0;
  }
}

// ── Mosaic ──────────────────────────────────────────────────────────────────────────────────────

export const EXPORT_FACE_MARGIN_SEC = 0.5;
interface FaceSample { time: number; rect: Rect }

/** Coordinate-only history; no video frames are retained by the look-ahead pass. */
export class FaceExportTimeline {
  private episodes = new Map<CameraKey, FaceSample[][]>();
  private index: Map<CameraKey, Map<number, FaceSample[][]>> | null = null;
  private associations = new Map<CameraKey, {
    tracker: BoxTracker; lastTime: number; width: number; height: number;
    byId: Map<number, FaceSample[]>;
  }>();
  private ttl = 6;

  clear(): void { this.episodes.clear(); this.associations.clear(); this.index = null; }

  finalize(): void {
    this.index = new Map();
    for (const [key, episodes] of this.episodes) {
      const bins = new Map<number, FaceSample[][]>();
      for (const samples of episodes) {
        const start = Math.floor(samples[0].time - EXPORT_FACE_MARGIN_SEC - 1e-7);
        const end = Math.floor(samples[samples.length - 1].time + EXPORT_FACE_MARGIN_SEC + 1e-7);
        for (let second = start; second <= end; second++) {
          const bin = bins.get(second) || [];
          bin.push(samples);
          bins.set(second, bin);
        }
      }
      this.index.set(key, bins);
    }
  }

  beginSegment(sampleIntervalSec: number): void {
    this.associations.clear();
    this.ttl = Math.max(2, Math.ceil(EXPORT_FACE_MARGIN_SEC / sampleIntervalSec) + 1);
  }

  record(key: CameraKey, time: number, rects: Rect[], width: number, height: number): void {
    let state = this.associations.get(key);
    if (!state || state.width !== width || state.height !== height || time - state.lastTime > EXPORT_FACE_MARGIN_SEC) {
      state = { tracker: new BoxTracker(1, this.ttl), lastTime: -Infinity, width, height, byId: new Map() };
      this.associations.set(key, state);
    }
    // A shorter camera may already be on its last frame. Do not extend its lifetime
    // by repeatedly recording that frame with another camera's later timestamp.
    if (time <= state.lastTime + 1e-7) return;
    this.index = null;
    state.lastTime = time;
    const previousHits = new Map([...state.tracker.tracks].map(([id, track]) => [id, track.hits]));
    state.tracker.update(rects);
    for (const [id, track] of state.tracker.tracks) {
      if (track.hits <= (previousHits.get(id) || 0)) continue;
      let samples = state.byId.get(id);
      if (!samples || time - samples[samples.length - 1].time > EXPORT_FACE_MARGIN_SEC) {
        samples = [];
        state.byId.set(id, samples);
        const episodes = this.episodes.get(key) || [];
        episodes.push(samples);
        this.episodes.set(key, episodes);
      }
      const [x, y, w, h] = track.lastDetection || track.rect;
      samples.push({ time, rect: [x / width, y / height, w / width, h / height] });
    }
  }

  boxesAt(key: CameraKey, time: number, width: number, height: number): Rect[] {
    const boxes: Rect[] = [];
    const candidates = this.index ? this.index.get(key)?.get(Math.floor(time)) || [] : this.episodes.get(key) || [];
    for (const samples of candidates) {
      const first = samples[0], last = samples[samples.length - 1];
      if (time < first.time - EXPORT_FACE_MARGIN_SEC - 1e-7 || time > last.time + EXPORT_FACE_MARGIN_SEC + 1e-7) continue;
      let rect: Rect;
      if (time <= first.time) rect = first.rect;
      else if (time >= last.time) rect = last.rect;
      else {
        let lo = 0, hi = samples.length - 1;
        while (hi - lo > 1) {
          const mid = (lo + hi) >>> 1;
          if (samples[mid].time <= time) lo = mid; else hi = mid;
        }
        // Cover both neighboring positions instead of guessing motion between samples.
        const a = samples[lo].rect, b = samples[hi].rect;
        const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]);
        rect = [x, y, Math.max(a[0] + a[2], b[0] + b[2]) - x, Math.max(a[1] + a[3], b[1] + b[3]) - y];
      }
      boxes.push([rect[0] * width, rect[1] * height, rect[2] * width, rect[3] * height]);
    }
    return boxes;
  }
}

let mosaicScratch: HTMLCanvasElement | null = null;

/**
 * Pixelate rects in-place. Deliberately avoids ctx.filter (unsupported on iOS Safari) and uses
 * down-scale / nearest-neighbour up-scale instead.
 */
export function applyMosaic(canvas: HTMLCanvasElement, rects: Rect[]): void {
  if (rects.length === 0) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  if (!mosaicScratch) mosaicScratch = document.createElement('canvas');
  const sctx = mosaicScratch.getContext('2d');
  if (!sctx) return;

  for (const [rx, ry, rw, rh] of rects) {
    const x1 = Math.max(0, Math.floor(rx));
    const y1 = Math.max(0, Math.floor(ry));
    const x2 = Math.min(canvas.width, Math.ceil(rx + rw));
    const y2 = Math.min(canvas.height, Math.ceil(ry + rh));
    const w = x2 - x1;
    const h = y2 - y1;
    if (w < 2 || h < 2) continue;

    const block = Math.max(8, Math.min(w, h) / 6);
    const bw = Math.max(2, Math.round(w / block));
    const bh = Math.max(2, Math.round(h / block));
    mosaicScratch.width = bw;
    mosaicScratch.height = bh;
    sctx.imageSmoothingEnabled = true;
    sctx.drawImage(canvas, x1, y1, w, h, 0, 0, bw, bh);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(mosaicScratch, 0, 0, bw, bh, x1, y1, w, h);
    ctx.imageSmoothingEnabled = true;
  }
}

// ── Detector (ONNX Runtime Web, wasm EP) ────────────────────────────────────────────────────────

export interface DetectInput {
  rgba: Uint8ClampedArray;
  w: number; // detector-space width (e.g. 320)
  h: number;
  srcW: number;
  srcH: number;
}

export class FaceDetector {
  private chain: Promise<unknown> = Promise.resolve();
  private buf: Float32Array | null = null;
  private bufKey = '';
  private scratch: HTMLCanvasElement | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private constructor(private ort: any, private session: any, private inputName: string, private outputNames: string[]) {}

  static async create(): Promise<FaceDetector> {
    // GitHub Pages cannot send COOP/COEP headers -> no SharedArrayBuffer -> single-threaded wasm.
    // @ts-ignore -- package "exports" subpaths are not visible to moduleResolution "Node"
    const ort = await import('onnxruntime-web/wasm');
    // @ts-ignore
    const wasmUrl: string = (await import('onnxruntime-web/ort-wasm-simd-threaded.wasm?url')).default;
    // @ts-ignore
    const mjsUrl: string = (await import('onnxruntime-web/ort-wasm-simd-threaded.mjs?url')).default;
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: mjsUrl };

    const modelUrl: string = (await import('../assets/models/face_detection_yunet_dynamic.onnx?url')).default;
    const res = await fetch(modelUrl);
    if (!res.ok) throw new Error(`face model fetch failed (${res.status})`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
    return new FaceDetector(ort, session, session.inputNames[0], [...session.outputNames]);
  }

  /** Synchronously snapshot a source into detector-sized RGBA (so later mosaic edits can't leak in). */
  grab(source: CanvasImageSource, srcW: number, srcH: number): DetectInput {
    const w = DETECT_WIDTH;
    const h = Math.max(1, Math.floor((srcH * w) / srcW));
    if (!this.scratch) this.scratch = document.createElement('canvas');
    if (this.scratch.width !== w || this.scratch.height !== h) {
      this.scratch.width = w;
      this.scratch.height = h;
    }
    const ctx = this.scratch.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2D canvas context unavailable for face detection');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, w, h);
    const rgba = ctx.getImageData(0, 0, w, h).data;
    return { rgba, w, h, srcW, srcH };
  }

  /** Serialized inference (single reusable tensor buffer). */
  run(input: DetectInput): Promise<Rect[]> {
    const p = this.chain.then(
      () => this.infer(input),
      () => this.infer(input)
    );
    this.chain = p.catch(() => undefined);
    return p;
  }

  private async infer(input: DetectInput): Promise<Rect[]> {
    const { rgba, w, h, srcW, srcH } = input;
    const padW = (Math.floor((w - 1) / 32) + 1) * 32;
    const padH = (Math.floor((h - 1) / 32) + 1) * 32;
    const key = `${padW}x${padH}`;
    if (!this.buf || this.bufKey !== key) {
      this.buf = new Float32Array(3 * padW * padH); // zero padded
      this.bufKey = key;
    }
    fillTensor(rgba, w, h, padW, padH, this.buf);
    const feeds = { [this.inputName]: new this.ort.Tensor('float32', this.buf, [1, 3, padH, padW]) };
    const results = await this.session.run(feeds);
    const outs: Record<string, Float32Array> = {};
    for (const name of this.outputNames) outs[name] = results[name].data as Float32Array;
    return mapDetections(decodeYuNet(outs, padW, padH), w, h, srcW, srcH);
  }
}

// ── Processor (per-camera state) ────────────────────────────────────────────────────────────────

interface CamState {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tracker: BoxTracker;
  frameCount: number;
  lastTime: number;
  needsDetect: boolean;
  needsTemplateRefresh: boolean;
  hasContent: boolean;
  /** preview only: a new video frame was presented since the last snapshot (requestVideoFrameCallback) */
  newFrame: boolean;
  rvfcSrc: HTMLVideoElement | null;
}

function sourceSize(src: CanvasImageSource): [number, number] {
  const s = src as { videoWidth?: number; videoHeight?: number; width?: number; height?: number };
  return [s.videoWidth || s.width || 0, s.videoHeight || s.height || 0];
}

function isReady(src: CanvasImageSource): boolean {
  const v = src as HTMLVideoElement;
  if (typeof v.readyState === 'number') return v.readyState >= 2 && v.videoWidth > 0;
  return true;
}

export class FacePrivacyProcessor implements ExportFrameProcessor {
  private cams = new Map<CameraKey, CamState>();
  private previewBusy = false;
  private exportTimeline = new FaceExportTimeline();
  private exportAnalysisReady = false;
  private analysisFrameTimes = new Map<CameraKey, number>();

  constructor(private detector: FaceDetector, private detectInterval = DETECT_INTERVAL) {}

  beginExportAnalysis(): void {
    this.clearExportAnalysis();
    // Detach any pending asynchronous preview result from the analysis canvases.
    this.cams.clear();
  }

  beginExportSegment(sampleIntervalSec: number): void {
    this.analysisFrameTimes.clear();
    this.exportTimeline.beginSegment(sampleIntervalSec);
  }

  async analyzeExport(frames: FrameSources, baseTimeSec: number): Promise<void> {
    for (const key of Object.keys(frames) as CameraKey[]) {
      const src = frames[key];
      if (!src) continue;
      const time = baseTimeSec + (src as HTMLVideoElement).currentTime;
      if (time <= (this.analysisFrameTimes.get(key) ?? -Infinity) + 1e-7) continue;
      const st = this.snapshot(key, src);
      if (!st) throw new Error(`Face analysis: no decoded frame for ${key}`);
      const boxes = await this.detector.run(this.detector.grab(st.canvas, st.canvas.width, st.canvas.height));
      this.exportTimeline.record(key, time, boxes, st.canvas.width, st.canvas.height);
      this.analysisFrameTimes.set(key, time);
    }
  }

  finishExportAnalysis(): void { this.exportTimeline.finalize(); this.exportAnalysisReady = true; }
  clearExportAnalysis(): void {
    this.exportAnalysisReady = false;
    this.exportTimeline.clear();
    this.analysisFrameTimes.clear();
  }

  reset(): void {
    for (const st of this.cams.values()) {
      st.tracker.reset();
      st.frameCount = 0;
      st.lastTime = -1;
      st.needsDetect = true;
      st.needsTemplateRefresh = false;
    }
  }

  private state(key: CameraKey, w: number, h: number): CamState | null {
    let st = this.cams.get(key);
    if (st && (st.canvas.width !== w || st.canvas.height !== h)) {
      this.cams.delete(key);
      st = undefined;
    }
    if (!st) {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      // Keep this canvas GPU-backed: drawImage(video) stays on the GPU and only small template ROIs are
      // read back. (willReadFrequently/CPU canvas was measured ~3x slower in preview: full-frame video readbacks.)
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      st = {
        canvas,
        ctx,
        tracker: new BoxTracker(1, 48),
        frameCount: 0,
        lastTime: -1,
        needsDetect: true,
        needsTemplateRefresh: false,
        hasContent: false,
        newFrame: true,
        rvfcSrc: null,
      };
      this.cams.set(key, st);
    }
    return st;
  }

  /**
   * Preview only: the render loop runs at display rate (60-144Hz) but videos only produce a new frame
   * at 24-36fps. Track real frame presentation so unchanged frames are not re-copied / re-mosaicked.
   */
  private watchFrames(key: CameraKey, st: CamState, src: CanvasImageSource): void {
    const v = src as HTMLVideoElement;
    if (typeof v.requestVideoFrameCallback !== 'function' || st.rvfcSrc === v) return;
    st.rvfcSrc = v;
    const cb = () => {
      if (st.rvfcSrc !== v || this.cams.get(key) !== st) return; // stale state: stop the loop
      st.newFrame = true;
      v.requestVideoFrameCallback(cb);
    };
    v.requestVideoFrameCallback(cb);
  }

  /** Copy the current video frame into the per-camera canvas. Returns null when no frame is available. */
  private snapshot(key: CameraKey, src: CanvasImageSource): CamState | null {
    const [w, h] = sourceSize(src);
    if (w <= 0 || h <= 0) return null;
    const st = this.state(key, w, h);
    if (!st) return null;
    if (!isReady(src)) return null;
    st.ctx.drawImage(src, 0, 0, w, h);
    st.hasContent = true;
    return st;
  }

  private isDue(st: CamState): boolean {
    return this.detectInterval <= 1 || st.frameCount % this.detectInterval === 1;
  }

  /**
   * Export: snapshot every camera first (consistent frames), then await detection on due frames,
   * then mosaic. Errors propagate so an export never silently finishes without the mosaic.
   * All tracker reads (templates) happen on the clean snapshot, before any mosaic is drawn.
   */
  async processExport(frames: FrameSources, sourceTimeSec?: number): Promise<ProcessedFrames> {
    if (this.exportAnalysisReady && sourceTimeSec !== undefined) {
      const out: ProcessedFrames = {};
      for (const key of Object.keys(frames) as CameraKey[]) {
        const src = frames[key];
        if (!src) continue;
        const st = this.snapshot(key, src);
        if (!st) throw new Error(`Face mosaic: no decoded frame for ${key}`);
        applyMosaic(st.canvas, this.exportTimeline.boxesAt(key, sourceTimeSec, st.canvas.width, st.canvas.height));
        out[key] = st.canvas;
      }
      return out;
    }
    const out: ProcessedFrames = {};
    const active: Array<{ key: CameraKey; st: CamState; gray: GraySource }> = [];

    for (const key of Object.keys(frames) as CameraKey[]) {
      const src = frames[key];
      if (!src) continue;
      const st = this.snapshot(key, src);
      if (st) {
        st.frameCount += 1;
        active.push({ key, st, gray: canvasGray(st.ctx, st.canvas.width, st.canvas.height) });
      } else {
        // No decoded frame available: never fall back to the raw video (could expose faces).
        const existing = this.cams.get(key);
        if (existing && existing.hasContent) out[key] = existing.canvas;
      }
    }

    const inputs = new Map<CameraKey, DetectInput>();
    for (const { key, st } of active) {
      if (this.isDue(st)) inputs.set(key, this.detector.grab(st.canvas, st.canvas.width, st.canvas.height));
    }

    const results = new Map<CameraKey, Rect[]>();
    for (const [key, input] of inputs) {
      results.set(key, await this.detector.run(input));
    }

    const boxesByKey = new Map<CameraKey, Rect[]>();
    for (const { key, st, gray } of active) {
      const rects = results.get(key);
      boxesByKey.set(key, rects ? st.tracker.update(rects, gray) : st.tracker.trackInterframe(gray));
    }
    // Mosaic only after every read from the clean snapshots is done
    for (const { key, st } of active) {
      applyMosaic(st.canvas, boxesByKey.get(key) || []);
      out[key] = st.canvas;
    }
    return out;
  }

  /**
   * Preview: never blocks. Detection runs asynchronously (one in flight at a time); until a result
   * arrives the tracker follows the face by template matching. The tracker only advances when the
   * video time actually moved, so paused frames keep their boxes.
   */
  processPreview(frames: FrameSources): ProcessedFrames {
    const out: ProcessedFrames = {};
    const pending: Array<{ key: CameraKey; st: CamState; boxes: Rect[] }> = [];

    for (const key of Object.keys(frames) as CameraKey[]) {
      const src = frames[key];
      if (!src) continue;

      // Skip the whole pass when the video has not presented a new frame (canvas still holds the
      // already-mosaicked previous result). Never skip when work is pending for this camera.
      const cached = this.cams.get(key);
      if (
        cached && cached.hasContent && cached.rvfcSrc === src && !cached.newFrame &&
        !cached.needsTemplateRefresh && !(cached.needsDetect && !this.previewBusy)
      ) {
        out[key] = cached.canvas;
        continue;
      }

      const st = this.snapshot(key, src);
      if (!st) {
        const existing = this.cams.get(key);
        if (existing && existing.hasContent) out[key] = existing.canvas;
        continue;
      }
      this.watchFrames(key, st, src);
      st.newFrame = false; // the frame we just copied is the current one
      const gray = canvasGray(st.ctx, st.canvas.width, st.canvas.height);

      const t = (src as HTMLVideoElement).currentTime ?? 0;
      if (st.lastTime >= 0 && Math.abs(t - st.lastTime) > 1.0) {
        st.tracker.reset();
        st.needsDetect = true;
      }
      const advanced = Math.abs(t - st.lastTime) > 1e-4;
      let boxes: Rect[];
      if (st.needsTemplateRefresh) {
        // an async detection just updated the boxes: take fresh templates from this clean frame
        st.tracker.refreshTemplates(gray);
        st.needsTemplateRefresh = false;
        boxes = st.tracker.current();
      } else if (advanced) {
        boxes = st.tracker.trackInterframe(gray);
      } else {
        boxes = st.tracker.current();
      }
      if (advanced) {
        st.lastTime = t;
        st.frameCount += 1;
      }

      if (!this.previewBusy && (st.needsDetect || (advanced && this.isDue(st)))) {
        this.previewBusy = true;
        st.needsDetect = false;
        const input = this.detector.grab(st.canvas, st.canvas.width, st.canvas.height); // clean frame
        this.detector
          .run(input)
          .then((rects) => {
            st.tracker.update(rects);
            st.needsTemplateRefresh = true;
          })
          .catch((e) => {
            console.warn('[FacePrivacy] preview detection failed:', e);
            st.needsDetect = true;
          })
          .finally(() => {
            this.previewBusy = false;
          });
      }
      pending.push({ key, st, boxes });
    }

    // Mosaic only after all clean-frame reads / grabs are done
    for (const { key, st, boxes } of pending) {
      applyMosaic(st.canvas, boxes);
      out[key] = st.canvas;
    }
    return out;
  }
}
