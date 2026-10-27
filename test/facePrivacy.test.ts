import { describe, it, expect } from 'vitest';
import {
  nmsBoxes, decodeYuNet, mapDetections, fillTensor, BoxTracker, matchTemplateNCC, Rect, GraySource,
} from '../src/core/facePrivacy';

/** Deterministic textured grayscale frame; `drawBlob` paints a distinctive patch at (bx, by). */
function makeFrame(w: number, h: number, bx: number, by: number, bw = 40, bh = 48) {
  const data = new Uint8Array(w * h);
  let seed = 12345;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    data[i] = 90 + (seed % 20); // low-contrast background noise
  }
  let s2 = 777;
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      s2 = (s2 * 1103515245 + 12345) & 0x7fffffff;
      data[(by + y) * w + (bx + x)] = (s2 >> 8) % 256; // high-contrast "face" texture
    }
  }
  return data;
}

function graySourceOf(data: Uint8Array, w: number, h: number): GraySource {
  return {
    width: w,
    height: h,
    region(x1, y1, x2, y2) {
      const rx1 = Math.max(0, Math.floor(x1));
      const ry1 = Math.max(0, Math.floor(y1));
      const rx2 = Math.min(w, Math.ceil(x2));
      const ry2 = Math.min(h, Math.ceil(y2));
      const pw = rx2 - rx1;
      const ph = ry2 - ry1;
      if (pw <= 0 || ph <= 0) return null;
      const out = new Uint8Array(pw * ph);
      for (let y = 0; y < ph; y++) {
        for (let x = 0; x < pw; x++) out[y * pw + x] = data[(ry1 + y) * w + rx1 + x];
      }
      return { data: out, w: pw, h: ph, x: rx1, y: ry1 };
    },
  };
}

describe('matchTemplateNCC (TM_CCOEFF_NORMED)', () => {
  it('locates the template at its exact offset with a near-perfect score', () => {
    const W = 200, H = 160;
    const img = makeFrame(W, H, 70, 55);
    const tpl = new Uint8Array(40 * 48);
    for (let y = 0; y < 48; y++) for (let x = 0; x < 40; x++) tpl[y * 40 + x] = img[(55 + y) * W + 70 + x];
    const m = matchTemplateNCC(img, W, H, tpl, 40, 48)!;
    expect(m.x).toBe(70);
    expect(m.y).toBe(55);
    expect(m.score).toBeGreaterThan(0.99);
  });

  it('returns null for a flat template and for a template larger than the image', () => {
    expect(matchTemplateNCC(new Uint8Array(100), 10, 10, new Uint8Array(16).fill(5), 4, 4)).toBeNull();
    expect(matchTemplateNCC(new Uint8Array(16), 4, 4, new Uint8Array(100), 10, 10)).toBeNull();
  });
});

describe('nmsBoxes (cv2.dnn.NMSBoxes semantics)', () => {
  it('keeps highest score and suppresses overlapping lower scores', () => {
    const boxes: Rect[] = [[0, 0, 10, 10], [1, 1, 10, 10], [50, 50, 10, 10]];
    const keep = nmsBoxes(boxes, [0.6, 0.9, 0.5], 0.45, 0.3, 5000);
    expect(keep).toEqual([1, 2]);
  });

  it('drops boxes at or below the score threshold', () => {
    const keep = nmsBoxes([[0, 0, 5, 5], [20, 20, 5, 5]], [0.45, 0.46], 0.45, 0.3, 5000);
    expect(keep).toEqual([1]);
  });
});

function emptyOutputs(padW: number, padH: number): Record<string, Float32Array> {
  const o: Record<string, Float32Array> = {};
  for (const s of [8, 16, 32]) {
    const n = Math.floor(padW / s) * Math.floor(padH / s);
    o[`cls_${s}`] = new Float32Array(n);
    o[`obj_${s}`] = new Float32Array(n);
    o[`bbox_${s}`] = new Float32Array(n * 4);
    o[`kps_${s}`] = new Float32Array(n * 10);
  }
  return o;
}

describe('decodeYuNet', () => {
  it('decodes a single anchor using OpenCV FaceDetectorYN math', () => {
    const outs = emptyOutputs(64, 64);
    // stride 8 -> 8 cols; anchor (row 2, col 3)
    const i = 2 * 8 + 3;
    outs.cls_8[i] = 0.81;
    outs.obj_8[i] = 0.81; // score = sqrt(0.81*0.81) = 0.81
    outs.bbox_8.set([0.5, 0.25, Math.log(2), Math.log(3)], i * 4);
    const dets = decodeYuNet(outs, 64, 64);
    expect(dets).toHaveLength(1);
    const [x, y, w, h] = dets[0].box;
    // cx=(3+0.5)*8=28, cy=(2+0.25)*8=18, w=2*8=16, h=3*8=24
    expect(w).toBeCloseTo(16, 5);
    expect(h).toBeCloseTo(24, 5);
    expect(x).toBeCloseTo(28 - 8, 5);
    expect(y).toBeCloseTo(18 - 12, 5);
    expect(dets[0].score).toBeCloseTo(0.81, 5);
  });

  it('returns nothing when all scores are below threshold', () => {
    expect(decodeYuNet(emptyOutputs(64, 64), 64, 64)).toEqual([]);
  });

  it('rejects mismatched output sizes instead of silently misdecoding', () => {
    const outs = emptyOutputs(64, 64);
    expect(() => decodeYuNet(outs, 96, 64)).toThrow(/mismatch/);
  });
});

describe('mapDetections', () => {
  it('scales to source and pads 15% per side, clamped to the frame', () => {
    const rects = mapDetections([{ box: [100, 50, 20, 40], score: 0.9 }], 320, 240, 1280, 960);
    // px=trunc(20*.15)=3, py=trunc(40*.15)=6, sx=sy=4
    expect(rects[0]).toEqual([(100 - 3) * 4, (50 - 6) * 4, (20 + 6) * 4, (40 + 12) * 4]);
    const edge = mapDetections([{ box: [0, 0, 20, 40], score: 0.9 }], 320, 240, 1280, 960);
    expect(edge[0][0]).toBe(0);
    expect(edge[0][1]).toBe(0);
  });
});

describe('fillTensor', () => {
  it('writes planar BGR in raw 0..255 and leaves the padding zero', () => {
    // 2x1 image: pixel0 RGBA=(10,20,30,255), pixel1 RGBA=(40,50,60,255); padded to 4x2
    const rgba = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]);
    const out = new Float32Array(3 * 4 * 2);
    fillTensor(rgba, 2, 1, 4, 2, out);
    const plane = 8;
    expect(Array.from(out.slice(0, 4))).toEqual([30, 60, 0, 0]); // B
    expect(Array.from(out.slice(plane, plane + 4))).toEqual([20, 50, 0, 0]); // G
    expect(Array.from(out.slice(plane * 2, plane * 2 + 4))).toEqual([10, 40, 0, 0]); // R
    expect(Array.from(out.slice(4, 8))).toEqual([0, 0, 0, 0]); // padded row
  });
});

describe('BoxTracker', () => {
  it('confirms a new detection immediately (min_hits=1)', () => {
    const t = new BoxTracker(1, 48);
    expect(t.update([[100, 100, 40, 50]])).toEqual([[100, 100, 40, 50]]);
  });

  it('follows a moving face and extrapolates with inertia between detections', () => {
    const t = new BoxTracker(1, 48);
    t.update([[100, 100, 40, 50]]);
    t.update([[130, 100, 40, 50]]); // moved +30px -> velocity learned
    const before = t.current()[0][0];
    const next = t.trackInterframe()[0][0];
    expect(next).toBeGreaterThan(before);
  });

  it('expires tracks after the TTL so ghost boxes disappear', () => {
    // python: a freshly created track starts with ttl=8; a matched track gets max_ttl
    const fresh = new BoxTracker(1, 48);
    fresh.update([[100, 100, 40, 50]]);
    let n = 0;
    while (fresh.current().length > 0 && n < 100) {
      fresh.trackInterframe();
      n++;
    }
    expect(fresh.current()).toHaveLength(0);
    expect(n).toBeLessThanOrEqual(8);

    const matched = new BoxTracker(1, 5);
    matched.update([[100, 100, 40, 50]]);
    matched.update([[100, 100, 40, 50]]); // matched -> ttl = max_ttl (5)
    n = 0;
    while (matched.current().length > 0 && n < 100) {
      matched.trackInterframe();
      n++;
    }
    expect(matched.current()).toHaveLength(0);
    expect(n).toBeLessThanOrEqual(5);
  });

  it('reset clears all tracks', () => {
    const t = new BoxTracker();
    t.update([[1, 1, 10, 10]]);
    t.reset();
    expect(t.current()).toEqual([]);
  });

  it('follows a moving face by template matching between detections (no inertia drift)', () => {
    const W = 300, H = 200;
    // face (40x48 texture) moves +9px/frame to the right; the detector fires every 4th frame
    const t = new BoxTracker(1, 48);
    let x = 60;
    t.update([[x, 70, 40, 48]], graySourceOf(makeFrame(W, H, x, 70), W, H));
    for (let i = 1; i <= 16; i++) {
      x += 9;
      const gray = graySourceOf(makeFrame(W, H, x, 70), W, H);
      if (i % 4 === 0) {
        t.update([[x, 70, 40, 48]], gray); // detection frame
      } else {
        const boxes = t.trackInterframe(gray); // template-matching frame
        expect(boxes).toHaveLength(1);
        // the box must stay glued to the face on every in-between frame
        expect(Math.abs(boxes[0][0] - x)).toBeLessThanOrEqual(3);
        expect(Math.abs(boxes[0][1] - 70)).toBeLessThanOrEqual(3);
      }
    }
  });

  it('without a gray source it falls back to inertia (and keeps working)', () => {
    const t = new BoxTracker(1, 48);
    t.update([[100, 100, 40, 50]]);
    t.update([[130, 100, 40, 50]]);
    expect(t.trackInterframe()).toHaveLength(1);
  });
});
