import { describe, it, expect } from 'vitest';
import {
  parseTimestampSec,
  splitSessionInto10MinChunks,
  groupFilesIntoClips,
  formatFolderGroup,
  ClipItem,
} from '../src/core/clipScanner';

function mockClip(timestampRaw: string): ClipItem {
  return {
    id: `TeslaCam/${timestampRaw}`,
    safeId: `TeslaCam_${timestampRaw}`,
    folder: 'TeslaCam',
    timestampStr: timestampRaw.replace('_', ' '),
    timestampRaw,
    cams: {},
    durationSec: 60.0,
    totalFrames: 2160,
  };
}

describe('clipScanner - timestamp and chunking', () => {
  it('parseTimestampSec parses TeslaCam timestamps correctly', () => {
    const sec1 = parseTimestampSec('2026-08-17_12-37-37');
    const sec2 = parseTimestampSec('2026-08-17_12-38-37');
    expect(sec2 - sec1).toBe(60);

    const secColon = parseTimestampSec('2026-08-17_12:37:37');
    expect(secColon).toBe(sec1);
  });

  it('splitSessionInto10MinChunks preserves small sessions and merges leftover < 3', () => {
    // 8 clips -> [8]
    const s8 = Array.from({ length: 8 }, (_, i) => mockClip(`2026-08-17_12-${String(i).padStart(2, '0')}-00`));
    const c8 = splitSessionInto10MinChunks(s8);
    expect(c8.length).toBe(1);
    expect(c8[0].length).toBe(8);

    // 10 clips -> [10]
    const s10 = Array.from({ length: 10 }, (_, i) => mockClip(`2026-08-17_12-${String(i).padStart(2, '0')}-00`));
    const c10 = splitSessionInto10MinChunks(s10);
    expect(c10.length).toBe(1);
    expect(c10[0].length).toBe(10);

    // 11 clips -> leftover 1 < 3 merged -> [11]
    const s11 = Array.from({ length: 11 }, (_, i) => mockClip(`2026-08-17_12-${String(i).padStart(2, '0')}-00`));
    const c11 = splitSessionInto10MinChunks(s11);
    expect(c11.length).toBe(1);
    expect(c11[0].length).toBe(11);

    // 12 clips -> leftover 2 < 3 merged -> [12]
    const s12 = Array.from({ length: 12 }, (_, i) => mockClip(`2026-08-17_12-${String(i).padStart(2, '0')}-00`));
    const c12 = splitSessionInto10MinChunks(s12);
    expect(c12.length).toBe(1);
    expect(c12[0].length).toBe(12);

    // 13 clips -> leftover 3 >= 3 -> [10, 3]
    const s13 = Array.from({ length: 13 }, (_, i) => mockClip(`2026-08-17_12-${String(i).padStart(2, '0')}-00`));
    const c13 = splitSessionInto10MinChunks(s13);
    expect(c13.length).toBe(2);
    expect(c13[0].length).toBe(10);
    expect(c13[1].length).toBe(3);

    // 21 clips -> [10, 11]
    const s21 = Array.from({ length: 21 }, (_, i) => mockClip(`2026-08-17_12-${String(i).padStart(2, '0')}-00`));
    const c21 = splitSessionInto10MinChunks(s21);
    expect(c21.length).toBe(2);
    expect(c21[0].length).toBe(10);
    expect(c21[1].length).toBe(11);

    // 22 clips -> [10, 12]
    const s22 = Array.from({ length: 22 }, (_, i) => mockClip(`2026-08-17_12-${String(i).padStart(2, '0')}-00`));
    const c22 = splitSessionInto10MinChunks(s22);
    expect(c22.length).toBe(2);
    expect(c22[0].length).toBe(10);
    expect(c22[1].length).toBe(12);

    // 25 clips -> [10, 10, 5]
    const s25 = Array.from({ length: 25 }, (_, i) => mockClip(`2026-08-17_12-${String(i).padStart(2, '0')}-00`));
    const c25 = splitSessionInto10MinChunks(s25);
    expect(c25.length).toBe(3);
    expect(c25[0].length).toBe(10);
    expect(c25[1].length).toBe(10);
    expect(c25[2].length).toBe(5);
  });
});

describe('clipScanner - groupFilesIntoClips & formatFolderGroup', () => {
  it('groups files with 3-minute gap into separate driving sessions', async () => {
    // Session 1: 12:00, 12:01, 12:02 (gap = 60s)
    // Gap: 12:02 to 12:10 (8 mins >= 180s)
    // Session 2: 12:10, 12:11 (gap = 60s)
    const files = [
      { name: '2026-08-17_12-00-00-front.mp4', relativePath: 'RecentClips/2026-08-17_12-00-00-front.mp4' },
      { name: '2026-08-17_12-01-00-front.mp4', relativePath: 'RecentClips/2026-08-17_12-01-00-front.mp4' },
      { name: '2026-08-17_12-02-00-front.mp4', relativePath: 'RecentClips/2026-08-17_12-02-00-front.mp4' },
      { name: '2026-08-17-12-10-00-front.mp4', relativePath: 'RecentClips/2026-08-17-12-10-00-front.mp4' },
      { name: '2026-08-17_12-11-00-front.mp4', relativePath: 'RecentClips/2026-08-17_12-11-00-front.mp4' },
    ];

    const groups = await groupFilesIntoClips(files);
    expect(groups.length).toBe(2);
    expect(groups[0].clips.length).toBe(3);
    expect(groups[1].clips.length).toBe(2);

    const f0 = formatFolderGroup(groups[0].folderName, groups[0].clips);
    expect(f0.type).toBe('recent');
    expect(f0.displayTitle).toContain('2026-08-17 12:00 ~ 12:03 (3분)');

    const f1 = formatFolderGroup(groups[1].folderName, groups[1].clips);
    expect(f1.type).toBe('recent');
    expect(f1.displayTitle).toContain('2026-08-17 12:10 ~ 12:12 (2분)');
  });

  it('formats SavedClips and SentryClips with respective type and color', () => {
    const saved = formatFolderGroup('SavedClips/2026-08-17_12-48-22');
    expect(saved.type).toBe('saved');
    expect(saved.color).toBe('#ffffff');
    expect(saved.displayTitle).toContain('저장된 클립 - 2026-08-17 12:48:22');

    const sentry = formatFolderGroup('SentryClips/2026-08-17_15-30-00');
    expect(sentry.type).toBe('sentry');
    expect(sentry.color).toBe('#f85149');
    expect(sentry.displayTitle).toContain('센트리 클립 - 2026-08-17 15:30:00');
  });

  it('detects and ignores files in EncryptedClips directory and triggers callback', async () => {
    let encryptedDetected = false;
    const files = [
      { name: '2026-08-17_12-00-00-front.mp4', relativePath: 'RecentClips/2026-08-17_12-00-00-front.mp4' },
      { name: '2026-08-17_12-05-00-front.mp4', relativePath: 'EncryptedClips/2026-08-17_12-05-00-front.mp4' },
      { name: '2026-08-17_12-05-00-back.mp4', relativePath: 'TeslaCam/EncryptedClips/2026-08-17_12-05-00-back.mp4' },
    ];

    const groups = await groupFilesIntoClips(
      files,
      undefined,
      () => { encryptedDetected = true; }
    );

    expect(encryptedDetected).toBe(true);
    expect(groups.length).toBe(1);
    expect(groups[0].clips.length).toBe(1);
    expect(groups[0].clips[0].timestampRaw).toBe('2026-08-17_12-00-00');
  });

  it('verifies isAndroid and isIOSOrAndroid detection helpers', async () => {
    const { isAndroid, isIOSOrAndroid } = await import('../src/core/i18n');
    expect(typeof isAndroid).toBe('function');
    expect(typeof isIOSOrAndroid).toBe('function');
  });
});
