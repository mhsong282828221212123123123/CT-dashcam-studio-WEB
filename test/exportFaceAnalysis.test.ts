import { afterEach, expect, it, vi } from 'vitest';
import { WebCodecsExporter, MultiClipExportConfig } from '../src/core/exporter';
import { DEFAULT_RENDER_OPTIONS } from '../src/core/renderer';
import { ClipItem } from '../src/core/clipScanner';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function fixture() {
  const videos: HTMLVideoElement[] = [];
  const revoke = vi.spyOn(URL, 'revokeObjectURL');
  vi.stubGlobal('document', {
    getElementById: () => ({ appendChild: vi.fn() }),
    createElement: () => {
      let time = 0;
      const v = Object.assign(new EventTarget(), {
        duration: 60, readyState: 2, videoWidth: 1920, seeking: false,
        pause: vi.fn(), load: vi.fn(), remove: vi.fn(), removeAttribute: vi.fn(),
        setAttribute: vi.fn(), style: { cssText: '' },
      });
      Object.defineProperty(v, 'currentTime', {
        get: () => time,
        set: (value: number) => { time = value; v.dispatchEvent(new Event('seeked')); },
      });
      videos.push(v as unknown as HTMLVideoElement);
      return v;
    },
  });
  const exporter = new WebCodecsExporter();
  Object.assign(exporter, { warmupSegmentVideos: vi.fn(async () => {}) });
  const samples: number[] = [];
  const processor = {
    reset: vi.fn(), beginExportAnalysis: vi.fn(), beginExportSegment: vi.fn(),
    finishExportAnalysis: vi.fn(), processExport: vi.fn(),
    analyzeExport: vi.fn(async () => { samples.push(videos[videos.length - 1].currentTime); }),
  };
  const clip: ClipItem = {
    id: 'clip', safeId: 'clip', folder: 'TeslaCam', timestampRaw: '2026-10-30_12-00-00',
    timestampStr: '2026-10-30 12:00:00', cams: { front: new File(['video'], 'front.mp4') },
    durationSec: 60, totalFrames: 2160,
  };
  const progress = vi.fn();
  const config: MultiClipExportConfig = {
    segments: [{ clip, startSec: 10, endSec: 10.2, baseTimeStr: clip.timestampStr }],
    sourceFps: 36, targetFps: 30, exportSpeed: 4,
    resolutionName: 'FHD (1920x1080) - 권장 표준',
    options: { ...DEFAULT_RENDER_OPTIONS, layout: '단일 카메라' },
    getClipDecoder: async () => null, onProgress: vi.fn(),
    onFaceAnalysisProgress: progress, frameProcessor: processor,
  };
  const analyze = () => (exporter as unknown as {
    analyzeExportFaces(config: MultiClipExportConfig, ios: boolean): Promise<void>;
  }).analyzeExportFaces(config, false);
  return { exporter, processor, samples, videos, revoke, progress, config, analyze };
}

it('analyzes 0.5 seconds beyond both range edges even at 4x export speed', async () => {
  const f = fixture();
  await f.analyze();
  expect(f.samples[0]).toBeCloseTo(9.5);
  expect(f.samples[f.samples.length - 1]).toBeCloseTo(10.7);
  expect(f.processor.beginExportAnalysis).toHaveBeenCalledOnce();
  expect(f.processor.finishExportAnalysis).toHaveBeenCalledOnce();
  expect(f.progress).toHaveBeenLastCalledWith(100, 1, 1);
  expect(f.videos[0].remove).toHaveBeenCalledOnce();
  expect(f.revoke).toHaveBeenCalledOnce();
});

it('does not mark partial analysis ready after cancellation and releases videos', async () => {
  const f = fixture();
  f.processor.analyzeExport.mockImplementation(async () => { f.exporter.cancel(); });
  await expect(f.analyze()).rejects.toThrow();
  expect(f.processor.finishExportAnalysis).not.toHaveBeenCalled();
  expect(f.videos[0].remove).toHaveBeenCalledOnce();
  expect(f.revoke).toHaveBeenCalledOnce();
});

it('propagates inference failures instead of continuing without analyzed masks', async () => {
  const f = fixture();
  f.processor.analyzeExport.mockRejectedValue(new Error('model failed'));
  await expect(f.analyze()).rejects.toThrow('model failed');
  expect(f.processor.finishExportAnalysis).not.toHaveBeenCalled();
  expect(f.videos[0].remove).toHaveBeenCalledOnce();
});
