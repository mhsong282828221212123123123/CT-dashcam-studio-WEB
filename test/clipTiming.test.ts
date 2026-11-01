import { describe, expect, it } from 'vitest';
import { clampSegmentToMedia, rememberClipDuration } from '../src/core/clipTiming';
import type { ClipItem } from '../src/core/clipScanner';
const clip = () => ({ durationSec: 60 } as ClipItem);
describe('short SavedClip boundaries', () => {
  it('replaces scanner estimates when preview metadata arrives', () => {
    const c = clip();
    expect(rememberClipDuration(c, 8)).toBe(true);
    expect(c.durationSec).toBe(8);
    expect(rememberClipDuration(c, NaN)).toBe(false);
    expect(c.durationSec).toBe(8);
  });
  it('joins an eight-second tail and a 56-second clip without a frozen 52-second pad', () => {
    const segments = [8, 56].map(duration => clampSegmentToMedia({ clip: clip(), startSec: 0, endSec: 60 }, duration));
    expect(segments.reduce((sum, s) => sum + s.endSec - s.startSec, 0)).toBe(64);
    expect(segments[0].clip.durationSec).toBe(8);
    expect(segments[1].clip.durationSec).toBe(56);
  });
  it('preserves user-selected partial ranges and base timestamps', () => {
    expect(clampSegmentToMedia({ clip: clip(), startSec: 2, endSec: 6, baseTimeStr: '2026-10-31 13:00:23' }, 8))
      .toMatchObject({ startSec: 2, endSec: 6, baseTimeStr: '2026-10-31 13:00:23' });
  });
  it.each([0, NaN, Infinity, -1])('rejects unreadable duration %s instead of freezing for 60 seconds', duration => {
    expect(() => clampSegmentToMedia({ clip: clip(), startSec: 0, endSec: 60 }, duration)).toThrow();
  });
  it('rejects ranges entirely outside the file', () => {
    expect(() => clampSegmentToMedia({ clip: clip(), startSec: 20, endSec: 60 }, 8)).toThrow();
  });
});
