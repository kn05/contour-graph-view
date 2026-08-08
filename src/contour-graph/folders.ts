import {
  CONTOUR_POINTS,
  FOLDER_PREFIX,
  ROOT_FOLDER
} from "./constants";
import type { FolderGroup, Point } from "./types";

export function normalizeFolder(path: string): string {
  const parts = path.split("/").filter((part) => part.length > 0);
  return parts.length === 0 ? ROOT_FOLDER : `/${parts.join("/")}`;
}

export function parentFolder(path: string): string {
  const folder = normalizeFolder(path);
  if (folder === ROOT_FOLDER) return ROOT_FOLDER;
  const parts = folder.slice(1).split("/");
  parts.pop();
  return parts.length === 0 ? ROOT_FOLDER : `/${parts.join("/")}`;
}

export function fileFolder(path: string): string {
  const split = path.lastIndexOf("/");
  return split < 0 ? ROOT_FOLDER : normalizeFolder(path.slice(0, split));
}

export function folderDepth(path: string): number {
  const folder = normalizeFolder(path);
  return folder === ROOT_FOLDER ? 0 : folder.slice(1).split("/").length;
}

export function isFolderExcluded(path: string, excluded: readonly string[]): boolean {
  const folder = normalizeFolder(path);
  return excluded.some((entry) => {
    const base = normalizeFolder(entry);
    return base !== ROOT_FOLDER && (folder === base || folder.startsWith(`${base}/`));
  });
}

export function compactFolders(paths: readonly string[]): string[] {
  const folders = [...new Set(paths.map(normalizeFolder))]
    .filter((folder) => folder !== ROOT_FOLDER)
    .sort((left, right) => {
      const gap = folderDepth(left) - folderDepth(right);
      return gap === 0 ? left.localeCompare(right) : gap;
    });
  return folders.filter((folder, index) => {
    return !isFolderExcluded(folder, folders.slice(0, index));
  });
}

export function folderChain(path: string, maxDepth: number | null): string[] {
  const folder = normalizeFolder(path);
  if (folder === ROOT_FOLDER) return [];
  const parts = folder.slice(1).split("/");
  const limit = maxDepth === null ? parts.length : Math.min(maxDepth, parts.length);
  const chain: string[] = [];
  for (let depth = 1; depth <= limit; depth += 1) {
    chain.push(`/${parts.slice(0, depth).join("/")}`);
  }
  return chain;
}

export function anchorId(path: string): string {
  return `${FOLDER_PREFIX}${normalizeFolder(path)}`;
}

export function hashText(text: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export function initialPoint(id: string): Point {
  const hash = hashText(id);
  const angle = (hash % 3_600) * Math.PI / 1_800;
  const radius = 25 + ((hash >>> 12) % 1_000) * 0.18;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

export function folderColor(path: string, custom: Record<string, string>, isDark = true): string {
  const folder = normalizeFolder(path);
  const saved = custom[folder];
  if (saved !== undefined) return saved;
  const hue = hashText(folder) % 360;
  const lightness = isDark ? 62 : 42;
  return `hsl(${hue} 66% ${lightness}%)`;
}

export function sortFolders(groups: readonly FolderGroup[]): FolderGroup[] {
  return [...groups].sort((left, right) => {
    if (left.depth !== right.depth) return left.depth - right.depth;
    return left.path.localeCompare(right.path);
  });
}

export function expandPoint(point: Point, radius: number): Point[] {
  const points: Point[] = [];
  for (let index = 0; index < CONTOUR_POINTS; index += 1) {
    const angle = index * Math.PI * 2 / CONTOUR_POINTS;
    points.push({
      x: point.x + Math.cos(angle) * radius,
      y: point.y + Math.sin(angle) * radius
    });
  }
  return points;
}
