// Ported & adapted from ui/main_window.py (scan_and_populate_tree)
import { CameraKey } from './constants';

export interface ClipItem {
  id: string; // e.g. "SavedClips/2026-08-17_12-48-22/2026-08-17_12-37-37"
  safeId: string; // precomputed for DOM ID: e.g. "SavedClips_2026-08-17_12-48-22_2026-08-17_12-37-37"
  folder: string; // e.g. "SavedClips/2026-08-17_12-48-22"
  timestampStr: string; // "2026-08-17 12:37:37"
  timestampRaw: string; // "2026-08-17_12-37-37"
  cams: Partial<Record<CameraKey, File>>;
  durationSec: number;
  totalFrames: number;
  isParking?: boolean;
}

export interface FolderGroup {
  folderName: string;
  clips: ClipItem[];
}

export const CAM_REGEX = /(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})-(front|back|left_repeater|right_repeater|left_pillar|right_pillar)(?: \(\d+\))?\.mp4$/i;

export function isTeslaCamVideo(filename: string): boolean {
  return CAM_REGEX.test(filename);
}

export function groupFilesIntoClips(files: File[]): FolderGroup[] {
  const mapByFolderAndTimestamp = new Map<string, { folder: string; timestampRaw: string; cams: Partial<Record<CameraKey, File>> }>();

  for (const file of files) {
    const relPath = (file as any)._relativePath || file.webkitRelativePath || file.name;
    const match = relPath.match(CAM_REGEX);
    if (!match) continue;

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
      });
    }

    mapByFolderAndTimestamp.get(groupKey)!.cams[camKey] = file;
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

export async function scanFileSystemDirectory(dirHandle: FileSystemDirectoryHandle): Promise<File[]> {
  const files: File[] = [];

  async function traverse(handle: FileSystemDirectoryHandle, currentPath: string) {
    const entries: any[] = [];
    for await (const entry of (handle as any).values()) {
      entries.push(entry);
    }

    // Filter candidate video files before getFile() to avoid loading thumb.png, event.json, etc.
    const fileEntries = entries.filter((e) => e.kind === 'file' && isTeslaCamVideo(e.name));
    const dirEntries = entries.filter((e) => e.kind === 'directory');

    // Concurrency pool (max 6) to keep memory usage low on mobile
    const CONCURRENCY = 6;
    for (let i = 0; i < fileEntries.length; i += CONCURRENCY) {
      const batch = fileEntries.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (entry) => {
          try {
            const file = await (entry as FileSystemFileHandle).getFile();
            const entryPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
            try {
              Object.defineProperty(file, 'webkitRelativePath', {
                value: entryPath,
                writable: false,
                configurable: true,
              });
            } catch {
              (file as any)._relativePath = entryPath;
            }
            files.push(file);
          } catch (err) {
            console.warn('[Scanner] Failed to read file handle:', entry.name, err);
          }
        })
      );
    }

    for (const dirEntry of dirEntries) {
      const dirPath = currentPath ? `${currentPath}/${dirEntry.name}` : dirEntry.name;
      await traverse(dirEntry as FileSystemDirectoryHandle, dirPath);
    }
  }

  await traverse(dirHandle, dirHandle.name);
  return files;
}
