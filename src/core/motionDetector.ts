// Ported from core/scanner.py (LightMotionScanner)
import { SENSITIVITY_LEVELS, SensitivityPreset } from './constants';

export interface EventBlock {
  startFrame: number;
  endFrame: number;
  startTimeSec: number;
  endTimeSec: number;
}

export class MotionDetector {
  static readonly WIDTH = 160;
  static readonly HEIGHT = 90;

  static countDifference(
    grayCurrent: Uint8Array,
    grayOld: Uint8Array,
    pixelDiffThresh: number
  ): number {
    const totalPixels = this.WIDTH * this.HEIGHT;
    let changed = 0;
    for (let i = 0; i < totalPixels; i++) {
      const diff = Math.abs(grayCurrent[i] - grayOld[i]);
      if (diff >= pixelDiffThresh) {
        changed++;
      }
    }
    return changed;
  }

  static mergeRawEvents(
    rawFrames: number[],
    fps: number,
    leadInSec = 1.5,
    leadOutSec = 2.0,
    mergeGapSec = 4.0
  ): EventBlock[] {
    if (rawFrames.length === 0) return [];

    const sortedFrames = Array.from(new Set(rawFrames)).sort((a, b) => a - b);
    const leadIn = Math.round(fps * leadInSec);
    const leadOut = Math.round(fps * leadOutSec);
    const mergeGap = Math.round(fps * mergeGapSec);

    const blocks: [number, number][] = [];

    for (const ef of sortedFrames) {
      const startF = Math.max(0, ef - leadIn);
      const endF = ef + leadOut;

      if (blocks.length === 0) {
        blocks.push([startF, endF]);
      } else {
        const last = blocks[blocks.length - 1];
        if (startF <= last[1] + mergeGap) {
          last[1] = Math.max(last[1], endF);
        } else {
          blocks.push([startF, endF]);
        }
      }
    }

    return blocks.map(([startFrame, endFrame]) => ({
      startFrame,
      endFrame,
      startTimeSec: startFrame / fps,
      endTimeSec: endFrame / fps,
    }));
  }

  static rgbaToGrayscale160x90(
    rgba: Uint8ClampedArray,
    srcWidth: number,
    srcHeight: number
  ): Uint8Array {
    const gray = new Uint8Array(this.WIDTH * this.HEIGHT);
    const xRatio = srcWidth / this.WIDTH;
    const yRatio = srcHeight / this.HEIGHT;

    for (let dy = 0; dy < this.HEIGHT; dy++) {
      const sy = Math.floor(dy * yRatio);
      const rowOffset = sy * srcWidth;
      const targetOffset = dy * this.WIDTH;

      for (let dx = 0; dx < this.WIDTH; dx++) {
        const sx = Math.floor(dx * xRatio);
        const idx = (rowOffset + sx) * 4;
        const r = rgba[idx];
        const g = rgba[idx + 1];
        const b = rgba[idx + 2];
        // Standard Rec. 601 grayscale
        gray[targetOffset + dx] = (r * 299 + g * 587 + b * 114 + 500) / 1000;
      }
    }
    return gray;
  }
}
