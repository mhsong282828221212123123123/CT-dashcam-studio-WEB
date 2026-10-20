// Ported & adapted from ui/main_window.py (scan_and_populate_tree)
import { CameraKey } from './constants';
import { i18n } from './i18n';

export interface ClipItem {
  id: string; // e.g. "SavedClips/2026-08-17_12-48-22/2026-08-17_12-37-37"
  safeId: string; // precomputed for DOM ID: e.g. "SavedClips_2026-08-17_12-48-22_2026-08-17_12-37-37"
  folder: string; // e.g. "SavedClips/2026-08-17_12-48-22"
  timestampStr: string; // "2026-08-17 12:37:37"
  timestampRaw: string; // "2026-08-17_12-37-37"
  cams: Partial<Record<CameraKey, File>>;
  camHandles?: Partial<Record<CameraKey, FileSystemFileHandle>>;
  durationSec: number;
  totalFrames: number;
}

export interface FolderGroup {
  folderName: string;
  clips: ClipItem[];
}

export interface FolderDisplayInfo {
  type: 'recent' | 'saved' | 'sentry' | 'default';
  displayTitle: string;
  color: string;
}

/**
 * iOS Safari / WebKit 및 모바일 브라우저에서 메인 스레드 멈춤(Freezing/Watchdog Kill)을 방지하고
 * DOM 업데이트(진행도 바, 텍스트)를 화면에 즉각 페인트할 수 있도록 1프레임을 양보하는 헬퍼
 */
export function yieldToCompositor(): Promise<void> {
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    return new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        setTimeout(resolve, 0);
      });
    });
  }
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

export function formatFolderGroup(folderName: string, clips?: ClipItem[]): FolderDisplayInfo {
  const normalized = folderName.replace(/\\/g, '/');

  // Extract date/time pattern (e.g. 2026-10-06_09-43-38 or 2026-10-06-09-43-38)
  const dtMatch = normalized.match(/(\d{4}-\d{2}-\d{2})[_-](\d{2})[-:](\d{2})[-:](\d{2})/);
  let dateTimeStr = '';
  if (dtMatch) {
    dateTimeStr = `${dtMatch[1]} ${dtMatch[2]}:${dtMatch[3]}:${dtMatch[4]}`;
  } else if (clips && clips.length > 0 && clips[0].timestampStr) {
    dateTimeStr = clips[0].timestampStr;
  }

  // 1. RecentClips -> 최근클립 (녹색)
  if (/RecentClips|Recent/i.test(normalized)) {
    return {
      type: 'recent',
      displayTitle: i18n.t('folder_recent'),
      color: '#3fb950',
    };
  }

  // 2. SentryClips -> 센트리 클립 - 날짜시간 (빨간색)
  if (/SentryClips|Sentry/i.test(normalized)) {
    const title = dateTimeStr ? `${i18n.t('folder_sentry')} - ${dateTimeStr}` : i18n.t('folder_sentry');
    return {
      type: 'sentry',
      displayTitle: title,
      color: '#f85149',
    };
  }

  // 3. SavedClips -> 저장된 클립 - 날짜시간 (흰색)
  if (/SavedClips|Saved/i.test(normalized)) {
    const title = dateTimeStr ? `${i18n.t('folder_saved')} - ${dateTimeStr}` : i18n.t('folder_saved');
    return {
      type: 'saved',
      displayTitle: title,
      color: '#ffffff',
    };
  }

  // Fallback: If folder name has date/time pattern
  if (dateTimeStr) {
    return {
      type: 'saved',
      displayTitle: `${i18n.t('folder_saved')} - ${dateTimeStr}`,
      color: '#ffffff',
    };
  }

  // Default fallback
  const baseName = normalized.split('/').pop() || folderName;
  return {
    type: 'default',
    displayTitle: baseName,
    color: '#c9d1d9',
  };
}

export interface ScannedFileItem {
  name: string;
  relativePath: string;
  file?: File;
  handle?: FileSystemFileHandle;
}

export const CAM_REGEX = /(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})-(front|back|left_repeater|right_repeater|left_pillar|right_pillar)(?: \(\d+\))?\.mp4$/i;

export function isTeslaCamVideo(filename: string): boolean {
  return CAM_REGEX.test(filename);
}

export async function getClipFile(clip: ClipItem, camKey: CameraKey): Promise<File | null> {
  if (clip.cams[camKey]) {
    return clip.cams[camKey]!;
  }
  if (clip.camHandles && clip.camHandles[camKey]) {
    try {
      const file = await clip.camHandles[camKey]!.getFile();
      const entryPath = `${clip.folder}/${file.name}`;
      try {
        Object.defineProperty(file, 'webkitRelativePath', {
          value: entryPath,
          writable: false,
          configurable: true,
        });
      } catch {
        (file as any)._relativePath = entryPath;
      }
      clip.cams[camKey] = file;
      return file;
    } catch (err) {
      console.warn(`[Scanner] Failed to resolve File handle for ${clip.id} ${camKey}:`, err);
      return null;
    }
  }
  return null;
}

export async function ensureClipFiles(clip: ClipItem): Promise<Partial<Record<CameraKey, File>>> {
  const keys: CameraKey[] = ['front', 'back', 'left_repeater', 'right_repeater', 'left_pillar', 'right_pillar'];
  await Promise.all(
    keys.map(async (k) => {
      if (!clip.cams[k] && clip.camHandles?.[k]) {
        await getClipFile(clip, k);
      }
    })
  );
  return clip.cams;
}

export async function groupFilesIntoClips(
  files: (File | ScannedFileItem)[] | FileList | ArrayLike<any>,
  onProgress?: (processed: number, total: number, clipCount: number) => void
): Promise<FolderGroup[]> {
  const mapByFolderAndTimestamp = new Map<
    string,
    {
      folder: string;
      timestampRaw: string;
      cams: Partial<Record<CameraKey, File>>;
      camHandles?: Partial<Record<CameraKey, FileSystemFileHandle>>;
    }
  >();

  const total = files.length;
  // iOS Safari 및 모바일 기기에서 UI 프리징 없이 실시간 진행도가 그려지도록 청크 크기 설정
  const CHUNK_SIZE = 60;

  for (let i = 0; i < total; i++) {
    const item = files[i];
    const isRealFile = item instanceof File || ('size' in item && typeof (item as any).slice === 'function');
    const fileObj = isRealFile ? (item as File) : (item as ScannedFileItem).file;
    const handleObj = !isRealFile ? (item as ScannedFileItem).handle : undefined;
    const relPath =
      (fileObj as any)?._relativePath ||
      fileObj?.webkitRelativePath ||
      (item as ScannedFileItem).relativePath ||
      item.name || '';

    const match = relPath.match(CAM_REGEX);
    if (match) {
      const timestampRaw = match[1];
      const camKey = match[2].toLowerCase() as CameraKey;

      // Determine folder from relative path
      const pathParts = relPath.split(/[\/\\]/);
      let folder = "TeslaCam";
      if (pathParts.length >= 3) {
        folder = pathParts.slice(0, -1).join("/");
      } else if (pathParts.length === 2) {
        folder = pathParts[0];
      }

      const groupKey = `${folder}/${timestampRaw}`;
      if (!mapByFolderAndTimestamp.has(groupKey)) {
        mapByFolderAndTimestamp.set(groupKey, {
          folder,
          timestampRaw,
          cams: {},
          camHandles: {},
        });
      }

      const groupEntry = mapByFolderAndTimestamp.get(groupKey)!;
      if (fileObj) {
        groupEntry.cams[camKey] = fileObj;
      }
      if (handleObj) {
        if (!groupEntry.camHandles) groupEntry.camHandles = {};
        groupEntry.camHandles[camKey] = handleObj;
      }
    }

    if ((i + 1) % CHUNK_SIZE === 0 || i === total - 1) {
      if (onProgress) {
        onProgress(i + 1, total, mapByFolderAndTimestamp.size);
      }
      // iOS 및 모바일 브라우저에 페인트 프레임을 양보하여 진행도 UI가 실시간으로 갱신되도록 보장
      await yieldToCompositor();
    }
  }

  // Group into FolderGroups
  const folderMap = new Map<string, ClipItem[]>();

  for (const [groupKey, info] of mapByFolderAndTimestamp.entries()) {
    const parts = info.timestampRaw.split("_");
    const formattedTime = parts.length === 2 ? `${parts[0]} ${parts[1].replace(/-/g, ":")}` : info.timestampRaw;

    const clipItem: ClipItem = {
      id: groupKey,
      safeId: groupKey.replace(/[^a-zA-Z0-9_-]/g, '_'),
      folder: info.folder,
      timestampStr: formattedTime,
      timestampRaw: info.timestampRaw,
      cams: info.cams,
      camHandles: info.camHandles,
      durationSec: 60.0, // default 1 min
      totalFrames: 2160, // default 36fps * 60s
    };

    if (!folderMap.has(info.folder)) {
      folderMap.set(info.folder, []);
    }
    folderMap.get(info.folder)!.push(clipItem);
  }

  const result: FolderGroup[] = [];
  for (const [folderName, clips] of folderMap.entries()) {
    clips.sort((a, b) => a.timestampRaw.localeCompare(b.timestampRaw));
    result.push({
      folderName,
      clips,
    });
  }

  result.sort((a, b) => a.folderName.localeCompare(b.folderName));
  return result;
}

export async function scanFileSystemDirectory(
  dirHandle: FileSystemDirectoryHandle,
  onProgress?: (scannedFiles: number, scannedDirs: number) => void
): Promise<ScannedFileItem[]> {
  const items: ScannedFileItem[] = [];
  let scannedDirs = 0;

  async function traverse(handle: FileSystemDirectoryHandle, currentPath: string) {
    scannedDirs++;
    const entries: any[] = [];
    for await (const entry of (handle as any).values()) {
      entries.push(entry);
    }

    // Filter candidate video files without calling getFile()!
    const fileEntries = entries.filter((e) => e.kind === 'file' && isTeslaCamVideo(e.name));
    const dirEntries = entries.filter((e) => e.kind === 'directory');

    for (const entry of fileEntries) {
      const entryPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
      items.push({
        name: entry.name,
        relativePath: entryPath,
        handle: entry as FileSystemFileHandle,
      });
    }

    if (onProgress) {
      onProgress(items.length, scannedDirs);
    }

    if (scannedDirs % 5 === 0) {
      await yieldToCompositor();
    }

    for (const dirEntry of dirEntries) {
      const dirPath = currentPath ? `${currentPath}/${dirEntry.name}` : dirEntry.name;
      await traverse(dirEntry as FileSystemDirectoryHandle, dirPath);
    }
  }

  await traverse(dirHandle, dirHandle.name);
  return items;
}
