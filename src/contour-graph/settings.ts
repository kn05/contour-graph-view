import { normalizePath, type App } from "obsidian";
import {
  DEFAULT_SETTINGS,
  MAX_EXCLUDED_FOLDERS,
  MAX_FOLDER_PATH_LENGTH,
  MAX_POSITIONS,
  SCHEMA_VERSION
} from "./constants";
import { compactFolders, normalizeFolder } from "./folders";
import { parseQuery } from "./query";
import type {
  ColorGroup,
  ContourGraphSettings,
  FolderOpts,
  GraphOpts,
  Result,
  SavedPoint
} from "./types";

type RawMap = Record<string, unknown>;

function isMap(value: unknown): value is RawMap {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBool(map: RawMap, key: string, fallback: boolean): boolean {
  return typeof map[key] === "boolean" ? map[key] : fallback;
}

function readNum(map: RawMap, key: string, fallback: number, min: number, max: number): number {
  const value = map[key];
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return value < min || value > max ? fallback : value;
}

function readText(map: RawMap, key: string, fallback: string): string {
  return typeof map[key] === "string" ? map[key] : fallback;
}

function rgbToHex(rgb: number, alpha: number): string {
  const color = Math.min(0xffffff, Math.max(0, Math.round(rgb)));
  const opacity = Math.min(255, Math.max(0, Math.round(alpha * 255)));
  return `#${color.toString(16).padStart(6, "0")}${opacity.toString(16).padStart(2, "0")}`;
}

function readCoreGroups(value: unknown): ColorGroup[] {
  if (!Array.isArray(value)) return [];

  const groups: ColorGroup[] = [];
  for (const entry of value) {
    if (!isMap(entry) || typeof entry.query !== "string" || !isMap(entry.color)) continue;
    const rgb = entry.color.rgb;
    const alpha = entry.color.a;
    if (typeof rgb !== "number" || typeof alpha !== "number") continue;
    if (!Number.isFinite(rgb) || !Number.isFinite(alpha)) continue;
    if (rgb < 0 || rgb > 0xffffff || alpha < 0 || alpha > 1) continue;
    groups.push({ query: entry.query, color: rgbToHex(rgb, alpha) });
  }
  return groups;
}

function readSavedGroups(value: unknown): ColorGroup[] {
  if (!Array.isArray(value)) return [];
  const groups: ColorGroup[] = [];
  for (const entry of value) {
    if (!isMap(entry) || typeof entry.query !== "string" || typeof entry.color !== "string") continue;
    if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/iu.test(entry.color)) continue;
    const parsed = parseQuery(entry.query);
    if (!parsed.ok || parsed.value === null) continue;
    groups.push({ query: entry.query, color: entry.color });
  }
  return groups;
}

function cloneDefaults(): ContourGraphSettings {
  return structuredClone(DEFAULT_SETTINGS);
}

function parseGraph(value: unknown, fallback: GraphOpts): GraphOpts {
  if (!isMap(value)) return structuredClone(fallback);
  return {
    showTags: readBool(value, "showTags", fallback.showTags),
    showAttachments: readBool(value, "showAttachments", fallback.showAttachments),
    hideUnresolved: readBool(value, "hideUnresolved", fallback.hideUnresolved),
    showOrphans: readBool(value, "showOrphans", fallback.showOrphans),
    showArrow: readBool(value, "showArrow", fallback.showArrow),
    nodeSize: readNum(value, "nodeSize", fallback.nodeSize, 0.1, 8),
    lineSize: readNum(value, "lineSize", fallback.lineSize, 0.1, 8),
    textFade: readNum(value, "textFade", fallback.textFade, -5, 5),
    centerStrength: readNum(value, "centerStrength", fallback.centerStrength, 0, 2),
    repelStrength: readNum(value, "repelStrength", fallback.repelStrength, 0.1, 100),
    linkStrength: readNum(value, "linkStrength", fallback.linkStrength, 0, 5),
    linkDistance: readNum(value, "linkDistance", fallback.linkDistance, 10, 1_000),
    scale: readNum(value, "scale", fallback.scale, 0.01, 20),
    search: readText(value, "search", fallback.search),
    colorGroups: readSavedGroups(value.colorGroups)
  };
}

function parseColors(value: unknown): Record<string, string> {
  if (!isMap(value)) return {};
  const colors: Record<string, string> = {};
  for (const [path, color] of Object.entries(value)) {
    if (typeof color === "string" && /^#[0-9a-f]{6}([0-9a-f]{2})?$/iu.test(color)) {
      colors[normalizeFolder(path)] = color;
    }
  }
  return colors;
}

function parseExcluded(value: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const folders: string[] = [];
  for (const entry of value.slice(0, MAX_EXCLUDED_FOLDERS)) {
    if (typeof entry !== "string") continue;
    const path = entry.trim();
    if (path.length === 0 || path.length > MAX_FOLDER_PATH_LENGTH || path.includes("\0")) continue;
    folders.push(path);
  }
  return compactFolders(folders);
}

function parseFolder(value: unknown, fallback: FolderOpts): FolderOpts {
  if (!isMap(value)) return structuredClone(fallback);
  return {
    regionOpacity: readNum(value, "regionOpacity", fallback.regionOpacity, 0, 0.5),
    regionPadding: readNum(value, "regionPadding", fallback.regionPadding, 4, 120),
    excluded: parseExcluded(value.excluded, fallback.excluded),
    colors: parseColors(value.colors)
  };
}

function parsePositions(value: unknown): Record<string, SavedPoint> {
  if (!isMap(value)) return {};
  const positions: Record<string, SavedPoint> = {};
  for (const [path, point] of Object.entries(value).slice(0, MAX_POSITIONS)) {
    if (path.length === 0) continue;
    if (!isMap(point)) continue;
    const { x, y, fixed } = point;
    const isValid = typeof x === "number" && Number.isFinite(x)
      && typeof y === "number" && Number.isFinite(y);
    if (!isValid) continue;
    positions[path] = { x, y, fixed: fixed === true };
  }
  return positions;
}

function migrateV0(value: RawMap): RawMap {
  return { ...value, schemaVersion: 1 };
}

function migrateV1(value: RawMap): RawMap {
  const folder = isMap(value.folder) ? value.folder : {};
  return {
    ...value,
    folder: { ...folder, excluded: Array.isArray(folder.excluded) ? folder.excluded : [] },
    schemaVersion: 2
  };
}

function migrateV2(value: RawMap): RawMap {
  return { ...value, schemaVersion: 3 };
}

function migrateV3(value: RawMap): RawMap {
  const folder = isMap(value.folder) ? { ...value.folder } : {};
  delete folder.clusterStrength;
  delete folder.separationStrength;
  if (folder.contourOpacity === 0.09) folder.contourOpacity = 0.055;
  if (folder.contourPadding === 24) folder.contourPadding = 14;
  const positions = isMap(value.positions)
    ? Object.fromEntries(Object.entries(value.positions).filter(([, point]) => {
      return isMap(point) && point.fixed === true;
    }))
    : {};
  return { ...value, folder, positions, schemaVersion: 4 };
}

function migrateV4(value: RawMap): RawMap {
  const folder = isMap(value.folder) ? { ...value.folder } : {};
  const oldOpacity = typeof folder.contourOpacity === "number" ? folder.contourOpacity : null;
  const oldPadding = typeof folder.contourPadding === "number" ? folder.contourPadding : null;
  folder.regionOpacity = oldOpacity ?? DEFAULT_SETTINGS.folder.regionOpacity;
  folder.regionPadding = oldPadding ?? DEFAULT_SETTINGS.folder.regionPadding;
  if (oldOpacity === 0.055) folder.regionOpacity = DEFAULT_SETTINGS.folder.regionOpacity;
  if (oldPadding === 14) folder.regionPadding = DEFAULT_SETTINGS.folder.regionPadding;
  delete folder.maxDepth;
  delete folder.contourOpacity;
  delete folder.contourPadding;
  delete folder.minNodes;
  return { ...value, folder, schemaVersion: 5 };
}

const MIGRATIONS: Readonly<Record<number, (value: RawMap) => RawMap>> = {
  0: migrateV0,
  1: migrateV1,
  2: migrateV2,
  3: migrateV3,
  4: migrateV4
};

export function migrateSettings(value: unknown): Result<RawMap> {
  if (!isMap(value)) return { ok: false, error: "Plugin settings are not an object." };
  const rawVersion = value.schemaVersion;
  const version = rawVersion === undefined ? 0 : rawVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 0) {
    return { ok: false, error: "Plugin settings have an invalid schema version." };
  }
  if (version > SCHEMA_VERSION) {
    return { ok: false, error: `Plugin settings use unsupported schema version ${version}.` };
  }

  let next = { ...value };
  for (let current = version; current < SCHEMA_VERSION; current += 1) {
    const migrate = MIGRATIONS[current];
    if (migrate === undefined) {
      return { ok: false, error: `No migration exists for schema version ${current}.` };
    }
    next = migrate(next);
  }
  return { ok: true, value: next, warnings: [] };
}

export function parseSettings(value: unknown): ContourGraphSettings {
  const fallback = cloneDefaults();
  const migrated = migrateSettings(value);
  if (!migrated.ok) return fallback;
  const map = migrated.value;

  return {
    schemaVersion: SCHEMA_VERSION,
    graph: parseGraph(map.graph, fallback.graph),
    folder: parseFolder(map.folder, fallback.folder),
    positions: parsePositions(map.positions),
    didImport: readBool(map, "didImport", false),
    importedAt: typeof map.importedAt === "number" && Number.isFinite(map.importedAt)
      ? map.importedAt
      : null
  };
}

export function parseCoreGraph(value: unknown): Result<GraphOpts> {
  if (!isMap(value)) return { ok: false, error: "Core Graph settings are not an object." };
  const fallback = DEFAULT_SETTINGS.graph;
  const warnings: string[] = [];
  const rawSearch = readText(value, "search", fallback.search);
  const parsedSearch = parseQuery(rawSearch);
  const search = parsedSearch.ok ? rawSearch : fallback.search;
  if (!parsedSearch.ok) warnings.push(`Skipped Core Graph search: ${parsedSearch.error}`);
  const colorGroups = readCoreGroups(value.colorGroups).filter((group) => {
    const parsed = parseQuery(group.query);
    if (parsed.ok && parsed.value !== null) return true;
    const reason = parsed.ok ? "the query is empty" : parsed.error;
    warnings.push(`Skipped Core Graph color group because ${reason}.`);
    return false;
  });
  const graph: GraphOpts = {
    showTags: readBool(value, "showTags", fallback.showTags),
    showAttachments: readBool(value, "showAttachments", fallback.showAttachments),
    hideUnresolved: readBool(value, "hideUnresolved", fallback.hideUnresolved),
    showOrphans: readBool(value, "showOrphans", fallback.showOrphans),
    showArrow: readBool(value, "showArrow", fallback.showArrow),
    nodeSize: readNum(value, "nodeSizeMultiplier", fallback.nodeSize, 0.1, 8),
    lineSize: readNum(value, "lineSizeMultiplier", fallback.lineSize, 0.1, 8),
    textFade: readNum(value, "textFadeMultiplier", fallback.textFade, -5, 5),
    centerStrength: readNum(value, "centerStrength", fallback.centerStrength, 0, 2),
    repelStrength: readNum(value, "repelStrength", fallback.repelStrength, 0.1, 100),
    linkStrength: readNum(value, "linkStrength", fallback.linkStrength, 0, 5),
    linkDistance: readNum(value, "linkDistance", fallback.linkDistance, 10, 1_000),
    scale: readNum(value, "scale", fallback.scale, 0.01, 20),
    search,
    colorGroups
  };
  return { ok: true, value: graph, warnings };
}

export async function loadCoreOpts(app: App): Promise<Result<GraphOpts>> {
  const path = normalizePath(`${app.vault.configDir}/graph.json`);
  try {
    if (!(await app.vault.adapter.exists(path))) {
      return { ok: false, error: `Core Graph settings were not found at ${path}.` };
    }
    const text = await app.vault.adapter.read(path);
    const value: unknown = JSON.parse(text);
    return parseCoreGraph(value);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Unknown read error";
    return { ok: false, error: `Could not read Core Graph settings: ${message}` };
  }
}

export function applyCoreOpts(settings: ContourGraphSettings, graph: GraphOpts, now: number): ContourGraphSettings {
  return {
    ...settings,
    graph: structuredClone(graph),
    didImport: true,
    importedAt: now
  };
}
