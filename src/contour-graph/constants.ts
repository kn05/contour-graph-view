import type { ContourGraphSettings } from "./types";

export const VIEW_TYPE = "contour-graph-view";
export const VIEW_NAME = "Contour Graph View";
export const SCHEMA_VERSION = 2;
export const ROOT_FOLDER = "/";
export const FOLDER_PREFIX = "folder:";
export const TAG_PREFIX = "tag:";
export const UNRESOLVED_PREFIX = "unresolved:";
export const EVENT_DELAY = 180;
export const SAVE_DELAY = 600;
export const LAYOUT_SAVE_DELAY = 1_000;
export const LAYOUT_RUN_TIME = 8_000;
export const CONTOUR_DRAW_DELAY = 48;
export const CONTOUR_NODE_DELAY = 0.025;
export const MAX_CONTOUR_DELAY = 180;
export const MAX_POSITIONS = 12_000;
export const MAX_QUERY_LENGTH = 4_096;
export const MAX_QUERY_TOKENS = 512;
export const MAX_EXCLUDED_FOLDERS = 512;
export const MAX_FOLDER_PATH_LENGTH = 1_024;
export const BASE_NODE_SIZE = 6;
export const BASE_EDGE_SIZE = 1.6;
export const FOLDER_EDGE_WEIGHT = 0.18;
export const PARENT_EDGE_FACTOR = 0.5;
export const CONTOUR_POINTS = 6;
export const CONTOUR_CONCAVITY = 2.5;
export const CONTOUR_MIN_EDGE_FACTOR = 0.2;
export const CONTOUR_SMOOTH_STEPS = 2;
export const MAX_CONTOUR_VERTICES = 2_048;
export const MIN_CONTOUR_ALPHA = 0.012;
export const MAX_CONTOUR_ALPHA = 0.2;
export const DEFAULT_EDGE_COLOR = "#7f8796";
export const DEFAULT_LABEL_COLOR = "#d7dce5";
export const NODE_COLORS = {
  file: "#8b9cff",
  muted: "#94a3b8",
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
  moveEase: 0.12,
  maxNodeStep: 1.5
} as const;

export const RENDER_OPTS = {
  labelDensity: 0.75,
  labelBase: 6,
  labelFadeFactor: 2,
  minEdgeThickness: 1,
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

export const CONTOUR_STYLE = {
  parentAlpha: 0.08,
  childAlpha: 0.92,
  depthPower: 1.6,
  activeFill: 2.2,
  activeStroke: 0.72,
  strokeAlpha: 0.34,
  strokeFactor: 2.4,
  activeWidth: 2,
  idleWidth: 1
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
    maxDepth: null,
    clusterStrength: FOLDER_EDGE_WEIGHT,
    contourOpacity: 0.09,
    contourPadding: 24,
    minNodes: 2,
    excluded: [],
    colors: {}
  },
  positions: {},
  didImport: false,
  importedAt: null
};
