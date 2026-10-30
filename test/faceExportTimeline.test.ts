import { afterEach, describe, expect, it, vi } from 'vitest';
import { FaceDetector, FaceExportTimeline, FacePrivacyProcessor, Rect } from '../src/core/facePrivacy';

afterEach(() => vi.unstubAllGlobals());

describe('export face timeline in source seconds', () => {
  const box: Rect = [100, 100, 40, 50];
  function timeline() {
    const t = new FaceExportTimeline();
    t.beginSegment(0.1);
    t.record('front', 1, [box], 1000, 1000);
    return t;
  }
  it('covers the first detection from exactly 0.5 seconds earlier', () => {
    const t = timeline();
    expect(t.boxesAt('front', 0.499, 1000, 1000)).toEqual([]);
    expect(t.boxesAt('front', 0.5, 1000, 1000)).toEqual([box]);
    expect(t.boxesAt('front', 1, 1000, 1000)).toEqual([box]);
  });
  it('holds the actual final location for 0.5 seconds, without inertial drift', () => {
    const t = timeline();
    const last: Rect = [110, 100, 40, 50];
    t.record('front', 1.1, [last], 1000, 1000);
    t.record('front', 1.2, [], 1000, 1000);
    t.record('front', 1.3, [], 1000, 1000);
    expect(t.boxesAt('front', 1.6, 1000, 1000)).toEqual([last]);
    expect(t.boxesAt('front', 1.601, 1000, 1000)).toEqual([]);
  });
  it('covers both bounding positions while a detected face moves', () => {
    const t = timeline();
    t.record('front', 1.1, [[110, 100, 40, 50]], 1000, 1000);
    const [rect] = t.boxesAt('front', 1.05, 1000, 1000);
    expect(rect[0]).toBe(100);
    expect(rect[0] + rect[2]).toBeCloseTo(150);
  });
  it('does not renew a shorter camera by counting its last frame repeatedly', () => {
    const t = timeline();
    for (let i = 0; i < 20; i++) t.record('front', 1, [box], 1000, 1000);
    expect(t.boxesAt('front', 1.501, 1000, 1000)).toEqual([]);
  });
  it('keeps cameras separate and keeps multiple detected faces', () => {
    const t = timeline();
    t.record('front', 1.1, [box, [800, 500, 40, 50]], 1000, 1000);
    expect(t.boxesAt('front', 1.1, 1000, 1000)).toHaveLength(2);
    expect(t.boxesAt('back', 1.1, 1000, 1000)).toEqual([]);
  });
  it('does not interpolate across a long disappearance', () => {
    const t = timeline();
    t.record('front', 3, [[600, 600, 40, 50]], 1000, 1000);
    expect(t.boxesAt('front', 2, 1000, 1000)).toEqual([]);
  });
  it('carries boundary coverage across files while scaling normalized coordinates', () => {
    const t = new FaceExportTimeline();
    t.beginSegment(0.1);
    t.record('front', 59.9, [box], 1000, 1000);
    t.beginSegment(0.1);
    t.record('front', 60.2, [[200, 200, 80, 100]], 2000, 2000);
    expect(t.boxesAt('front', 59.8, 1000, 1000)).toHaveLength(2);
    expect(t.boxesAt('front', 60.1, 2000, 2000)[0]).toEqual([200, 200, 80, 100]);
  });
  it.each([15, 30, 60])('does not use frame counts to time the hold (%s fps)', (fps) => {
    const t = new FaceExportTimeline();
    t.beginSegment(4 / fps);
    t.record('front', 1, [box], 1000, 1000);
    expect(t.boxesAt('front', 1.5, 1000, 1000)).toEqual([box]);
    expect(t.boxesAt('front', 1.5 + 1 / fps, 1000, 1000)).toEqual([]);
  });
  it('clears all history before another export', () => {
    const t = timeline(); t.clear();
    expect(t.boxesAt('front', 1, 1000, 1000)).toEqual([]);
  });
  it('indexes long exports without changing time-window boundaries', () => {
    const t = timeline();
    const before = [0.49, 0.5, 1, 1.5, 1.51].map(time => t.boxesAt('front', time, 1000, 1000));
    t.finalize();
    expect([0.49, 0.5, 1, 1.5, 1.51].map(time => t.boxesAt('front', time, 1000, 1000))).toEqual(before);
    t.record('front', 3, [box], 1000, 1000);
    expect(t.boxesAt('front', 3, 1000, 1000)).toHaveLength(1);
  });
});

it('applies future detections to earlier export frames without another inference', async () => {
  const contexts: any[] = [];
  vi.stubGlobal('document', {
    createElement: () => {
      const ctx = { drawImage: vi.fn(), imageSmoothingEnabled: true };
      contexts.push(ctx);
      return { width: 0, height: 0, getContext: () => ctx };
    },
  });
  const source = { videoWidth: 200, videoHeight: 100, readyState: 2, currentTime: 0 } as HTMLVideoElement;
  const detector = {
    grab: () => ({ time: source.currentTime }),
    run: vi.fn(async ({ time }: { time: number }) => time >= 1 && time <= 1.2 ? [[20, 20, 30, 30]] : []),
  };
  const processor = new FacePrivacyProcessor(detector as unknown as FaceDetector);
  processor.beginExportAnalysis(); processor.beginExportSegment(0.1);
  for (const time of [0.8, 1, 1.1, 1.2, 1.4, 1.7]) {
    source.currentTime = time;
    await processor.analyzeExport({ front: source }, 0);
  }
  processor.finishExportAnalysis();
  processor.reset(); // The exporter's per-segment reset must not discard the completed history.
  const calls = detector.run.mock.calls.length;
  for (const [time, masked] of [[0.49, false], [0.5, true], [1.7, true], [1.71, false]] as const) {
    contexts[0].drawImage.mockClear();
    source.currentTime = time;
    const frames = await processor.processExport({ front: source }, time);
    expect(frames.front).not.toBe(source);
    expect(contexts[0].drawImage.mock.calls.some((args: any[]) => args.length === 9)).toBe(masked);
  }
  expect(detector.run).toHaveBeenCalledTimes(calls);
});
