export type NodeKind = "file" | "attachment" | "tag" | "unresolved" | "folder";

export interface Point {
  x: number;
  y: number;
}

export interface SavedPoint extends Point {
  fixed: boolean;
}

export interface ColorGroup {
  query: string;
  color: string;
}

export interface GraphOpts {
  showTags: boolean;
  showAttachments: boolean;
  hideUnresolved: boolean;
  showOrphans: boolean;
  showArrow: boolean;
  nodeSize: number;
  lineSize: number;
  textFade: number;
  centerStrength: number;
  repelStrength: number;
  linkStrength: number;
  linkDistance: number;
  scale: number;
  search: string;
  colorGroups: ColorGroup[];
}

export interface FolderOpts {
  maxDepth: number | null;
  clusterStrength: number;
  separationStrength: number;
  contourOpacity: number;
  contourPadding: number;
  minNodes: number;
  excluded: string[];
  colors: Record<string, string>;
}

export interface ContourGraphSettings {
  schemaVersion: number;
  graph: GraphOpts;
  folder: FolderOpts;
  positions: Record<string, SavedPoint>;
  didImport: boolean;
  importedAt: number | null;
}

export interface GraphNode {
  id: string;
  label: string;
  kind: NodeKind;
  path: string | null;
  folder: string | null;
  tags: string[];
  color: string;
  size: number;
  x: number;
  y: number;
  hidden: boolean;
  fixed: boolean;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: "link" | "tag" | "folder";
  weight: number;
  hidden: boolean;
}

export interface FolderGroup {
  path: string;
  depth: number;
  nodes: string[];
  color: string;
}

export interface GraphModel {
  nodes: GraphNode[];
  edges: GraphEdge[];
  folders: FolderGroup[];
}

export type Result<T> =
  | { ok: true; value: T; warnings: string[] }
  | { ok: false; error: string };

export interface MatchCtx {
  path: string;
  name: string;
  tags: ReadonlySet<string>;
}

export type QueryNode =
  | { kind: "term"; field: "path" | "file" | "tag" | null; value: string }
  | { kind: "not"; node: QueryNode }
  | { kind: "and"; left: QueryNode; right: QueryNode }
  | { kind: "or"; left: QueryNode; right: QueryNode };
