// Ported & adapted from ui/main_window.py (scan_and_populate_tree)
import { CameraKey } from './constants';

export interface ClipItem {
  id: string; // e.g. "SavedClips/2026-08-17_12-48-22/2026-08-17_12-37-37"
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

const CAM_REGEX = /(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})-(front|back|left_repeater|right_repeater|left_pillar|right_pillar)\.mp4$/i;

export function groupFilesIntoClips(files: File[]): FolderGroup[] {
  const mapByFolderAndTimestamp = new Map<string, { folder: string; timestampRaw: string; cams: Partial<Record<CameraKey, File>> }>();

  for (const file of files) {
    const relPath = file.webkitRelativePath || file.name;
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
    for await (const entry of (handle as any).values()) {
      const entryPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
      if (entry.kind === 'file') {
        const file = await (entry as FileSystemFileHandle).getFile();
        // store relative path for groupFilesIntoClips
        Object.defineProperty(file, 'webkitRelativePath', {
          value: entryPath,
          writable: false,
        });
        files.push(file);
      } else if (entry.kind === 'directory') {
        await traverse(entry as FileSystemDirectoryHandle, entryPath);
      }
    }
  }

  await traverse(dirHandle, dirHandle.name);
  return files;
}
