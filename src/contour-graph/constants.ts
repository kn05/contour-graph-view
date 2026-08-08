import type { ContourGraphSettings } from "./types";

export const VIEW_TYPE = "contour-graph-view";
export const VIEW_NAME = "Contour Graph View";
export const SCHEMA_VERSION = 5;
export const ROOT_FOLDER = "/";
export const FOLDER_PREFIX = "folder:";
export const TAG_PREFIX = "tag:";
export const UNRESOLVED_PREFIX = "unresolved:";
export const EVENT_DELAY = 180;
export const SAVE_DELAY = 600;
export const LAYOUT_SAVE_DELAY = 1_000;
export const LAYOUT_RUN_TIME = 8_000;
export const REGION_DRAW_DELAY = 160;
export const REGION_NODE_DELAY = 0.04;
export const MAX_REGION_DELAY = 520;
export const MAX_POSITIONS = 12_000;
export const MAX_QUERY_LENGTH = 4_096;
export const MAX_QUERY_TOKENS = 512;
export const MAX_EXCLUDED_FOLDERS = 512;
export const MAX_FOLDER_PATH_LENGTH = 1_024;
export const BASE_NODE_SIZE = 4;
export const BASE_EDGE_SIZE = 0.8;
export const NODE_SIZE_OPTS = {
  base: 0.76,
  degreeStep: 0.24,
  max: 2.4,
  folderFactor: 1.12,
  mutedFactor: 0.82
} as const;
export const REGION_OPTS = {
  circlePoints: 64,
  edgePrecision: 1_000,
  minRadius: 56,
  siteJitter: 0.01
} as const;
export const DEFAULT_EDGE_COLOR = "#7f8796";
export const DEFAULT_LABEL_COLOR = "#d7dce5";
export const NODE_COLORS = {
  fileDark: "#b8bdc7",
  fileLight: "#737985",
  muted: "#9298a3",
  tag: "#f59e0b"
} as const;

export const LAYOUT_OPTS = {
  repelBase: 10,
  distanceBase: 250,
  barnesHutMinNodes: 150,
  barnesHutTheta: 0.6,
  edgeWeightInfluence: 1,
  gravityFloor: 0.1,
  gravityFactor: 1.9,
  scaleFloor: 0.15,
  scaleCeiling: 12,
  slowDownFloor: 1,
  slowDownBase: 4,
  linkStrengthFloor: 0.1,
  moveEase: 0.32,
  maxNodeStep: 2,
  frameBaseDelay: 16,
  frameEaseMs: 90,
  frameMaxDelay: 34,
  settleDistance: 0.002
} as const;

export const RENDER_OPTS = {
  labelDensity: 0.75,
  labelBase: 6,
  labelFadeFactor: 2,
  minEdgeThickness: 0.5,
  stagePadding: 40,
  cameraMinRatio: 0.05,
  cameraMaxRatio: 10,
  cameraDuration: 250
} as const;

export const STAGE_OPTS = {
  minNodes: 12,
  warmupDelay: 280,
  batchDelay: 8,
  singleNodeLimit: 240,
  targetSteps: 90,
  maxBatch: 192
} as const;

export const REGION_STYLE = {
  maxAlpha: 0.18,
  activeFill: 1.8,
  borderAlpha: 0.34,
  activeBorderAlpha: 0.8,
  activeWidth: 1.5,
  idleWidth: 0.75
} as const;

export const DEFAULT_SETTINGS: ContourGraphSettings = {
  schemaVersion: SCHEMA_VERSION,
  graph: {
    showTags: false,
    showAttachments: false,
    hideUnresolved: false,
    showOrphans: true,
    showArrow: false,
    nodeSize: 1,
    lineSize: 1,
    textFade: 0,
    centerStrength: 0.52,
    repelStrength: 10,
    linkStrength: 1,
    linkDistance: 250,
    scale: 1,
    search: "",
    colorGroups: []
  },
  folder: {
    regionOpacity: 0.065,
    regionPadding: 18,
    excluded: [],
    colors: {}
  },
  positions: {},
  didImport: false,
  importedAt: null
};
