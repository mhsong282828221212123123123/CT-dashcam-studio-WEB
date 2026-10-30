import { afterEach, expect, it, vi } from 'vitest';
import { seekAnalysisFrame } from '../src/core/exportAnalysisSeek';

afterEach(() => vi.useRealTimers());

function video() {
  return Object.assign(new EventTarget(), {
    duration: 59.8, currentTime: 0, seeking: true, readyState: 1, videoWidth: 1920,
  }) as unknown as HTMLVideoElement;
}

it('never treats a timeout as a decoded analysis frame', async () => {
  vi.useFakeTimers();
  const v = video();
  const result = seekAnalysisFrame(v, 10, 30, () => false).catch(error => error);
  await vi.advanceTimersByTimeAsync(3000);
  expect((await result).message).toContain('Timed out');
  expect(vi.getTimerCount()).toBe(0);
});

it('waits for ready data after a seek event and clamps to a shorter camera', async () => {
  const v = video();
  let completed = false;
  const result = seekAnalysisFrame(v, 60, 30, () => false).then(() => { completed = true; });
  expect(v.currentTime).toBeCloseTo(59.8 - 0.5 / 30);
  v.dispatchEvent(new Event('seeked'));
  await Promise.resolve();
  expect(completed).toBe(false);
  Object.assign(v, { seeking: false, readyState: 2 });
  v.dispatchEvent(new Event('loadeddata'));
  await result;
  expect(completed).toBe(true);
});

it('cancels an analysis seek promptly and removes its timers', async () => {
  vi.useFakeTimers();
  let cancelled = false;
  const result = seekAnalysisFrame(video(), 10, 30, () => cancelled).catch(error => error);
  cancelled = true;
  await vi.advanceTimersByTimeAsync(40);
  expect((await result).message).toContain('cancelled');
  expect(vi.getTimerCount()).toBe(0);
});
