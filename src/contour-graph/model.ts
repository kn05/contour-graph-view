import { getAllTags, type App, type CachedMetadata, type TFile } from "obsidian";
import {
  BASE_NODE_SIZE,
  NODE_COLORS,
  ROOT_FOLDER,
  TAG_PREFIX,
  UNRESOLVED_PREFIX
} from "./constants";
import {
  anchorId,
  fileFolder,
  folderChain,
  folderColor,
  folderDepth,
  initialPoint,
  isFolderExcluded,
  sortFolders
} from "./folders";
import { matchQuery, parseQuery } from "./query";
import type {
  ColorGroup,
  ContourGraphSettings,
  FolderGroup,
  GraphEdge,
  GraphModel,
  GraphNode,
  MatchCtx,
  QueryNode,
  Result,
  SavedPoint
} from "./types";

interface FileInfo {
  file: TFile;
  folder: string;
  tags: string[];
  kind: "file" | "attachment";
}

interface ParsedGroup extends ColorGroup {
  node: QueryNode;
}

function usesDarkTheme(): boolean {
  return typeof document === "undefined" || document.body.classList.contains("theme-dark");
}

function fileTags(cache: CachedMetadata | null): string[] {
  const tags = cache === null ? null : getAllTags(cache);
  if (tags === null) return [];
  return tags.map((tag) => tag.replace(/^#/u, ""));
}

function matchCtx(info: FileInfo): MatchCtx {
  return {
    path: info.file.path,
    name: info.file.basename,
    tags: new Set(info.tags)
  };
}

function parseGroups(groups: readonly ColorGroup[], warnings: string[]): ParsedGroup[] {
  const parsed: ParsedGroup[] = [];
  for (const group of groups) {
    const result = parseQuery(group.query);
    if (!result.ok || result.value === null) {
      warnings.push(result.ok ? "Skipped an empty color group." : `Skipped color group: ${result.error}`);
      continue;
    }
    parsed.push({ ...group, node: result.value });
  }
  return parsed;
}

function nodeColor(info: FileInfo, groups: readonly ParsedGroup[]): string {
  const ctx = matchCtx(info);
  for (const group of groups) {
    if (matchQuery(group.node, ctx)) return group.color;
  }
  return info.kind === "attachment" ? NODE_COLORS.muted : NODE_COLORS.file;
}

function addFileNode(
  nodes: Map<string, GraphNode>,
  info: FileInfo,
  settings: ContourGraphSettings,
  groups: readonly ParsedGroup[]
): void {
  const saved = settings.positions[info.file.path];
  const point = saved ?? initialPoint(info.file.path);
  nodes.set(info.file.path, {
    id: info.file.path,
    label: info.file.basename,
    kind: info.kind,
    path: info.file.path,
    folder: info.folder,
    tags: info.tags,
    color: nodeColor(info, groups),
    size: BASE_NODE_SIZE * settings.graph.nodeSize,
    x: point.x,
    y: point.y,
    hidden: false,
    fixed: saved?.fixed ?? false
  });
}

function edgeId(kind: GraphEdge["kind"], source: string, target: string): string {
  return `${kind}\u0000${source}\u0000${target}`;
}

function addEdge(edges: Map<string, GraphEdge>, edge: Omit<GraphEdge, "id">): void {
  if (edge.source === edge.target) return;
  const id = edgeId(edge.kind, edge.source, edge.target);
  if (!edges.has(id)) edges.set(id, { ...edge, id });
}

function addFileLinks(
  app: App,
  nodes: Map<string, GraphNode>,
  edges: Map<string, GraphEdge>,
  settings: ContourGraphSettings
): void {
  const resolved = app.metadataCache.resolvedLinks;
  const unresolved = app.metadataCache.unresolvedLinks;

  for (const source of nodes.keys()) {
    const node = nodes.get(source);
    if (node?.kind !== "file") continue;
    for (const target of Object.keys(resolved[source] ?? {})) {
      if (!nodes.has(target)) continue;
      addEdge(edges, {
        source,
        target,
        kind: "link",
        weight: settings.graph.linkStrength,
        hidden: false
      });
    }
    if (settings.graph.hideUnresolved) continue;
    for (const name of Object.keys(unresolved[source] ?? {})) {
      const id = `${UNRESOLVED_PREFIX}${name}`;
      if (!nodes.has(id)) {
        const point = initialPoint(id);
        nodes.set(id, {
          id,
          label: name,
          kind: "unresolved",
          path: null,
          folder: null,
          tags: [],
          color: NODE_COLORS.muted,
          size: BASE_NODE_SIZE * 0.8 * settings.graph.nodeSize,
          x: point.x,
          y: point.y,
          hidden: false,
          fixed: false
        });
      }
      addEdge(edges, {
        source,
        target: id,
        kind: "link",
        weight: settings.graph.linkStrength,
        hidden: false
      });
    }
  }
}

function addTagNodes(
  nodes: Map<string, GraphNode>,
  edges: Map<string, GraphEdge>,
  settings: ContourGraphSettings
): void {
  if (!settings.graph.showTags) return;
  const files = [...nodes.values()].filter((node) => node.kind === "file");
  for (const file of files) {
    for (const tag of file.tags) {
      const id = `${TAG_PREFIX}${tag}`;
      if (!nodes.has(id)) {
        const point = initialPoint(id);
        nodes.set(id, {
          id,
          label: `#${tag}`,
          kind: "tag",
          path: null,
          folder: null,
          tags: [],
          color: NODE_COLORS.tag,
          size: BASE_NODE_SIZE * settings.graph.nodeSize,
          x: point.x,
          y: point.y,
          hidden: false,
          fixed: false
        });
      }
      addEdge(edges, {
        source: file.id,
        target: id,
        kind: "tag",
        weight: settings.graph.linkStrength,
        hidden: false
      });
    }
  }
}

function dropOrphans(nodes: Map<string, GraphNode>, edges: Map<string, GraphEdge>): void {
  const linked = new Set<string>();
  for (const edge of edges.values()) {
    linked.add(edge.source);
    linked.add(edge.target);
  }
  for (const node of nodes.values()) {
    const isOrphan = (node.kind === "file" || node.kind === "attachment") && !linked.has(node.id);
    if (isOrphan) nodes.delete(node.id);
  }
  for (const [id, edge] of edges) {
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) edges.delete(id);
  }
}

function addFolders(
  nodes: Map<string, GraphNode>,
  settings: ContourGraphSettings
): FolderGroup[] {
  const members = new Map<string, Set<string>>();
  const anchors = new Set<string>();
  const files = [...nodes.values()].filter((node) => {
    return node.path !== null && node.folder !== null
      && !isFolderExcluded(node.folder, settings.folder.excluded);
  });
  const isDark = usesDarkTheme();
  for (const node of nodes.values()) {
    const isFile = node.kind === "file" || node.kind === "attachment";
    if (isFile && node.folder !== null && isFolderExcluded(node.folder, settings.folder.excluded)) {
      node.folder = null;
    }
  }
  if (files.length > 0) anchors.add(ROOT_FOLDER);

  for (const file of files) {
    const chain = folderChain(file.folder ?? ROOT_FOLDER, null);
    for (const folder of chain) anchors.add(folder);
    for (const folder of chain) {
      const isVisible = settings.folder.maxDepth === null || folderDepth(folder) <= settings.folder.maxDepth;
      if (!isVisible) continue;
      const set = members.get(folder) ?? new Set<string>();
      set.add(file.id);
      members.set(folder, set);
    }

    const direct = chain.at(-1) ?? ROOT_FOLDER;
    anchors.add(direct);
  }

  for (const folder of anchors) {
    ensureFolderNode(nodes, folder, settings, isDark);
  }

  const groups = [...members].map(([path, ids]) => ({
    path,
    depth: folderDepth(path),
    nodes: [...ids],
    color: folderColor(path, settings.folder.colors, isDark)
  }));
  return sortFolders(groups);
}

function ensureFolderNode(
  nodes: Map<string, GraphNode>,
  folder: string,
  settings: ContourGraphSettings,
  isDark: boolean
): void {
  const id = anchorId(folder);
  if (nodes.has(id)) return;
  const point = initialPoint(id);
  nodes.set(id, {
    id,
    label: folder,
    kind: "folder",
    path: null,
    folder,
    tags: [],
    color: folderColor(folder, settings.folder.colors, isDark),
    size: 0.1,
    x: point.x,
    y: point.y,
    hidden: true,
    fixed: false
  });
}

function collectFiles(app: App, settings: ContourGraphSettings): FileInfo[] {
  const files = new Map<string, FileInfo>();
  for (const file of app.vault.getMarkdownFiles()) {
    files.set(file.path, {
      file,
      folder: fileFolder(file.path),
      tags: fileTags(app.metadataCache.getFileCache(file)),
      kind: "file"
    });
  }
  if (!settings.graph.showAttachments) return [...files.values()];

  for (const links of Object.values(app.metadataCache.resolvedLinks)) {
    for (const path of Object.keys(links)) {
      const file = app.vault.getFileByPath(path);
      if (file === null || file.extension === "md" || files.has(path)) continue;
      files.set(path, { file, folder: fileFolder(path), tags: [], kind: "attachment" });
    }
  }
  return [...files.values()];
}

export function buildGraph(app: App, settings: ContourGraphSettings): Result<GraphModel> {
  const warnings: string[] = [];
  const query = parseQuery(settings.graph.search);
  const filter = query.ok ? query.value : null;
  if (!query.ok) warnings.push(`Ignored Graph search: ${query.error}`);

  const groups = parseGroups(settings.graph.colorGroups, warnings);
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const files = collectFiles(app, settings);

  for (const info of files) {
    if (filter !== null && !matchQuery(filter, matchCtx(info))) continue;
    addFileNode(nodes, info, settings, groups);
  }
  addFileLinks(app, nodes, edges, settings);
  addTagNodes(nodes, edges, settings);
  if (!settings.graph.showOrphans) dropOrphans(nodes, edges);
  const folders = addFolders(nodes, settings);

  return {
    ok: true,
    value: { nodes: [...nodes.values()], edges: [...edges.values()], folders },
    warnings
  };
}

export function savePositions(model: GraphModel): Record<string, SavedPoint> {
  const positions: Record<string, SavedPoint> = {};
  for (const node of model.nodes) {
    if (node.path === null) continue;
    positions[node.path] = { x: node.x, y: node.y, fixed: node.fixed };
  }
  return positions;
}

export function movePosition(
  positions: Record<string, SavedPoint>,
  oldPath: string,
  newPath: string
): Record<string, SavedPoint> {
  if (oldPath === newPath) return { ...positions };
  const next: Record<string, SavedPoint> = {};
  const prefix = `${oldPath}/`;
  for (const [path, point] of Object.entries(positions)) {
    if (path === oldPath) next[newPath] = point;
    else if (path.startsWith(prefix)) next[`${newPath}${path.slice(oldPath.length)}`] = point;
    else next[path] = point;
  }
  return next;
}

export function dropPositions(
  positions: Record<string, SavedPoint>,
  path: string
): Record<string, SavedPoint> {
  const prefix = `${path}/`;
  return Object.fromEntries(Object.entries(positions).filter(([key]) => {
    return key !== path && !key.startsWith(prefix);
  }));
}
