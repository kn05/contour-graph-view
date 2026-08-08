import { FOLDER_PREFIX, ROOT_FOLDER } from "./constants";
import type { FolderRegion, Point } from "./types";

const FOLDER_HUES = [4, 30, 48, 142, 174, 199, 215, 244, 272, 300, 332] as const;

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

export function topFolder(path: string): string {
  const folder = normalizeFolder(path);
  if (folder === ROOT_FOLDER) return ROOT_FOLDER;
  const top = folder.slice(1).split("/")[0];
  return top === undefined ? ROOT_FOLDER : `/${top}`;
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

export function folderChain(path: string): string[] {
  const folder = normalizeFolder(path);
  if (folder === ROOT_FOLDER) return [];
  const parts = folder.slice(1).split("/");
  const chain: string[] = [];
  for (let depth = 1; depth <= parts.length; depth += 1) {
    chain.push(`/${parts.slice(0, depth).join("/")}`);
  }
  return chain;
}

export function anchorId(path: string): string {
  return `${FOLDER_PREFIX}${normalizeFolder(path)}`;
}

export function folderLabel(path: string): string {
  const folder = normalizeFolder(path);
  if (folder === ROOT_FOLDER) return "Vault";
  return folder.split("/").at(-1) ?? folder;
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
  let cursor: string | null = folder;
  while (cursor !== null) {
    const saved = custom[cursor];
    if (saved !== undefined) return saved;
    cursor = cursor === ROOT_FOLDER ? null : parentFolder(cursor);
  }
  if (folder === ROOT_FOLDER) return isDark ? "hsl(215 18% 68%)" : "hsl(215 16% 48%)";
  const family = topFolder(folder);
  const hue = FOLDER_HUES[hashText(family) % FOLDER_HUES.length] ?? 215;
  const tone = (hashText(folder) >>> 8) % 7 - 3;
  const saturation = isDark ? 54 : 48;
  const lightness = (isDark ? 68 : 46) + tone;
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

export function sortRegions(regions: readonly FolderRegion[]): FolderRegion[] {
  return [...regions].sort((left, right) => left.path.localeCompare(right.path));
}
