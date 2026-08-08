import { DirectedGraph } from "graphology";
import Sigma from "sigma";
import { createEdgeArrowProgram } from "sigma/rendering";
import type { Attributes } from "graphology-types";
import type { App } from "obsidian";
import {
  BASE_EDGE_SIZE,
  DEFAULT_EDGE_COLOR,
  DEFAULT_LABEL_COLOR,
  MAX_REGION_DELAY,
  NODE_COLORS,
  REGION_DRAW_DELAY,
  REGION_NODE_DELAY,
  REGION_STYLE,
  RENDER_OPTS,
  STAGE_OPTS
} from "./constants";
import { anchorId } from "./folders";
import { LayoutRunner } from "./layout";
import { buildRegionPartition, buildRegionPath, regionFrame } from "./regions";
import type { RegionBoundary, RegionSeed } from "./regions";
import { planNodeStage, stageBatchSize } from "./staging";
import type {
  ContourGraphSettings,
  FolderRegion,
  GraphEdge,
  GraphModel,
  GraphNode,
  NodeKind,
  Point,
  SavedPoint
} from "./types";

interface NodeAttrs extends Attributes {
  label: string;
  kind: NodeKind;
  path: string | null;
  folder: string | null;
  x: number;
  y: number;
  size: number;
  color: string;
  hidden: boolean;
  fixed: boolean;
}

interface EdgeAttrs extends Attributes {
  kind: GraphEdge["kind"];
  weight: number;
  size: number;
  color: string;
  hidden: boolean;
  type: "line" | "arrow";
}

interface DrawnRegion {
  folder: FolderRegion;
  center: Point;
  path: Path2D;
}

export interface RenderHooks {
  savePositions: (positions: Record<string, SavedPoint>) => void;
  showError: (message: string) => void;
}

function supportsWebGL2(): boolean {
  const canvas = document.createElement("canvas");
  return canvas.getContext("webgl2") !== null;
}

function isMouseEvent(event: MouseEvent | TouchEvent): event is MouseEvent {
  return "button" in event;
}

function readLabelColor(container: HTMLElement): string {
  const color = window.getComputedStyle(container).color.trim();
  return color.length === 0 ? DEFAULT_LABEL_COLOR : color;
}

function readRegionBorderColor(container: HTMLElement): string {
  const color = window.getComputedStyle(container)
    .getPropertyValue("--background-modifier-border")
    .trim();
  return color.length === 0 ? DEFAULT_EDGE_COLOR : color;
}

function labelThreshold(settings: ContourGraphSettings): number {
  return Math.max(1, RENDER_OPTS.labelBase + settings.graph.textFade * RENDER_OPTS.labelFadeFactor);
}

function nodeAttrs(node: GraphNode, isStaged = false): NodeAttrs {
  return {
    label: node.label,
    kind: node.kind,
    path: node.path,
    folder: node.folder,
    x: node.x,
    y: node.y,
    size: node.size,
    color: node.color,
    hidden: node.hidden || isStaged,
    fixed: node.fixed
  };
}

function edgeAttrs(edge: GraphEdge, settings: ContourGraphSettings): EdgeAttrs {
  return {
    kind: edge.kind,
    weight: Math.max(0.001, edge.weight),
    size: BASE_EDGE_SIZE * settings.graph.lineSize,
    color: DEFAULT_EDGE_COLOR,
    hidden: edge.hidden,
    type: settings.graph.showArrow && edge.kind !== "folder" ? "arrow" : "line"
  };
}

function mapGraph(
  model: GraphModel,
  settings: ContourGraphSettings,
  staged: ReadonlySet<string>
): DirectedGraph<NodeAttrs, EdgeAttrs> {
  const graph = new DirectedGraph<NodeAttrs, EdgeAttrs>({ allowSelfLoops: false });
  for (const node of model.nodes) {
    graph.addNode(node.id, nodeAttrs(node, staged.has(node.id)));
  }
  for (const edge of model.edges) {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) continue;
    graph.addDirectedEdgeWithKey(edge.id, edge.source, edge.target, edgeAttrs(edge, settings));
  }
  return graph;
}

export class GraphRenderer {
  private readonly graph: DirectedGraph<NodeAttrs, EdgeAttrs>;
  private readonly sigma: Sigma<NodeAttrs, EdgeAttrs>;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly label: HTMLDivElement;
  private readonly abort = new AbortController();
  private readonly layout: LayoutRunner<NodeAttrs, EdgeAttrs>;
  private readonly stageIds: string[];
  private stageIndex = 0;
  private stageTimer: number | null = null;
  private regionTimer: number | null = null;
  private regionFrame: number | null = null;
  private hoverFrame: number | null = null;
  private hoverPoint: Point | null = null;
  private regionTime = 0;
  private regions: DrawnRegion[] = [];
  private boundaries: RegionBoundary[] = [];
  private regionAt: (point: Point) => string | null = () => null;
  private activeFolder: string | null = null;
  private activePoint: Point | null = null;
  private dragNode: string | null = null;
  private didDrag = false;
  private isKilled = false;

  constructor(
    private readonly app: App,
    private readonly container: HTMLElement,
    private model: GraphModel,
    private settings: ContourGraphSettings,
    private readonly hooks: RenderHooks
  ) {
    if (!supportsWebGL2()) throw new Error("Contour Graph View requires WebGL2.");
    this.stageIds = planNodeStage(model);
    this.graph = mapGraph(model, settings, new Set(this.stageIds));
    this.layout = new LayoutRunner(this.graph, {
      save: () => this.persistPositions(),
      showError: (message) => this.hooks.showError(message)
    });
    this.sigma = new Sigma<NodeAttrs, EdgeAttrs>(this.graph, container, {
      allowInvalidContainer: false,
      defaultEdgeColor: DEFAULT_EDGE_COLOR,
      defaultNodeColor: NODE_COLORS.fileDark,
      edgeProgramClasses: { arrow: createEdgeArrowProgram<NodeAttrs, EdgeAttrs>() },
      hideEdgesOnMove: true,
      hideLabelsOnMove: true,
      labelColor: { color: readLabelColor(container) },
      labelDensity: RENDER_OPTS.labelDensity,
      labelRenderedSizeThreshold: labelThreshold(settings),
      minEdgeThickness: RENDER_OPTS.minEdgeThickness,
      renderEdgeLabels: false,
      renderLabels: true,
      stagePadding: RENDER_OPTS.stagePadding,
      zIndex: false
    });
    this.canvas = this.sigma.createCanvas("regions", { beforeLayer: "edges" });
    const ctx = this.canvas.getContext("2d");
    if (ctx === null) throw new Error("Could not create the region canvas.");
    this.ctx = ctx;
    this.label = container.createDiv({ cls: "contour-graph-folder-label" });
    this.label.hidden = true;
    this.bindEvents();
    this.setCamera();
    this.drawRegions();
    this.startStage();
    this.layout.start(this.settings);
  }

  resetCamera(): void {
    void this.sigma.getCamera().animatedReset({ duration: RENDER_OPTS.cameraDuration });
  }

  restartLayout(): void {
    if (this.isKilled) return;
    this.finishStage();
    this.layout.stop();
    this.layout.start(this.settings);
  }

  update(model: GraphModel, settings: ContourGraphSettings): void {
    if (this.isKilled) return;
    this.finishStage();
    this.layout.stop();
    const didScaleChange = settings.graph.scale !== this.settings.graph.scale;
    this.model = model;
    this.settings = settings;
    this.cancelHover();
    this.activeFolder = null;
    this.activePoint = null;
    this.syncGraph();
    this.sigma.setSetting("labelColor", { color: readLabelColor(this.container) });
    this.sigma.setSetting("labelRenderedSizeThreshold", labelThreshold(settings));
    this.sigma.refresh();
    if (didScaleChange) this.setCamera();
    this.drawRegions();
    this.layout.start(this.settings);
  }

  kill(): void {
    if (this.isKilled) return;
    this.persistPositions();
    this.isKilled = true;
    this.clearStage();
    this.layout.kill();
    if (this.regionTimer !== null) window.clearTimeout(this.regionTimer);
    if (this.regionFrame !== null) window.cancelAnimationFrame(this.regionFrame);
    if (this.hoverFrame !== null) window.cancelAnimationFrame(this.hoverFrame);
    this.regionTimer = null;
    this.regionFrame = null;
    this.hoverFrame = null;
    this.hoverPoint = null;
    this.abort.abort();
    this.sigma.kill();
    this.label.remove();
  }

  private startStage(): void {
    if (this.stageIds.length === 0) return;
    this.layout.setSmoothing(false);
    this.stageTimer = window.setTimeout(() => {
      this.stageTimer = null;
      this.layout.setSmoothing(true);
      this.revealStage();
    }, STAGE_OPTS.warmupDelay);
  }

  private revealStage(): void {
    if (this.isKilled || this.stageIndex >= this.stageIds.length) return;
    const end = Math.min(
      this.stageIds.length,
      this.stageIndex + stageBatchSize(this.stageIds.length)
    );
    for (; this.stageIndex < end; this.stageIndex += 1) {
      const id = this.stageIds[this.stageIndex];
      if (id !== undefined && this.graph.hasNode(id)) this.graph.setNodeAttribute(id, "hidden", false);
    }
    if (this.stageIndex < this.stageIds.length) {
      this.stageTimer = window.setTimeout(() => {
        this.stageTimer = null;
        this.revealStage();
      }, STAGE_OPTS.batchDelay);
    }
  }

  private finishStage(): void {
    this.clearStage();
    this.layout.setSmoothing(true);
    for (; this.stageIndex < this.stageIds.length; this.stageIndex += 1) {
      const id = this.stageIds[this.stageIndex];
      if (id !== undefined && this.graph.hasNode(id)) this.graph.setNodeAttribute(id, "hidden", false);
    }
  }

  private clearStage(): void {
    if (this.stageTimer !== null) window.clearTimeout(this.stageTimer);
    this.stageTimer = null;
  }

  private setCamera(): void {
    const ratio = Math.min(
      RENDER_OPTS.cameraMaxRatio,
      Math.max(RENDER_OPTS.cameraMinRatio, 1 / this.settings.graph.scale)
    );
    this.sigma.getCamera().setState({ ratio });
  }

  private bindEvents(): void {
    this.sigma.on("afterRender", () => this.scheduleRegions());
    this.sigma.on("enterNode", ({ node }) => this.setNodeFolder(node));
    this.sigma.on("leaveNode", () => this.setActiveFolder(null, null));
    this.sigma.on("clickNode", ({ node, event }) => {
      if (this.didDrag) {
        this.didDrag = false;
        return;
      }
      void this.openNode(node, event.original);
    });
    this.sigma.on("downNode", ({ node, event }) => {
      if (!isMouseEvent(event.original) || event.original.button !== 0) return;
      event.preventSigmaDefault();
      this.dragNode = node;
      this.didDrag = false;
      this.cancelHover();
      this.finishStage();
      this.layout.stop();
      this.sigma.getCamera().disable();
      this.graph.setNodeAttribute(node, "fixed", true);
      this.layout.start(this.settings);
    });

    this.container.addEventListener("pointermove", (event) => this.onPointerMove(event), {
      signal: this.abort.signal
    });
    window.addEventListener("pointerup", () => this.endDrag(), { signal: this.abort.signal });
    this.container.addEventListener("pointerleave", () => {
      if (this.dragNode === null) {
        this.cancelHover();
        this.setActiveFolder(null, null);
      }
    }, { signal: this.abort.signal });
  }

  private syncGraph(): void {
    const nodes = new Map(this.model.nodes.map((node) => [node.id, node]));
    const edges = new Map(this.model.edges.map((edge) => [edge.id, edge]));
    const oldEdges: string[] = [];
    const oldNodes: string[] = [];
    this.graph.forEachEdge((id) => {
      if (!edges.has(id)) oldEdges.push(id);
    });
    for (const id of oldEdges) this.graph.dropEdge(id);
    this.graph.forEachNode((id) => {
      if (!nodes.has(id)) oldNodes.push(id);
    });
    for (const id of oldNodes) this.graph.dropNode(id);

    for (const [id, node] of nodes) {
      const attrs = nodeAttrs(node);
      if (!this.graph.hasNode(id)) {
        this.graph.addNode(id, attrs);
        continue;
      }
      const old = this.graph.getNodeAttributes(id);
      this.graph.replaceNodeAttributes(id, {
        ...attrs,
        x: old.x,
        y: old.y,
        fixed: old.fixed || attrs.fixed
      });
    }
    for (const [id, edge] of edges) {
      if (!this.graph.hasNode(edge.source) || !this.graph.hasNode(edge.target)) continue;
      const attrs = edgeAttrs(edge, this.settings);
      if (this.graph.hasEdge(id)) {
        this.graph.replaceEdgeAttributes(id, attrs);
      } else {
        this.graph.addDirectedEdgeWithKey(id, edge.source, edge.target, attrs);
      }
    }
  }

  private persistPositions(): void {
    const positions: Record<string, SavedPoint> = {};
    this.graph.forEachNode((id, attrs) => {
      if (attrs.path === null || !attrs.fixed) return;
      positions[id] = { x: attrs.x, y: attrs.y, fixed: attrs.fixed };
    });
    this.hooks.savePositions(positions);
  }

  private onPointerMove(event: PointerEvent): void {
    const rect = this.container.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    if (this.dragNode !== null) {
      const graphPoint = this.sigma.viewportToGraph(point);
      this.layout.setPoint(this.dragNode, graphPoint);
      this.graph.mergeNodeAttributes(this.dragNode, { x: graphPoint.x, y: graphPoint.y, fixed: true });
      this.didDrag = true;
      this.sigma.refresh({ partialGraph: { nodes: [this.dragNode] }, skipIndexation: false });
      return;
    }
    this.hoverPoint = point;
    if (this.hoverFrame !== null) return;
    this.hoverFrame = window.requestAnimationFrame(() => this.updateHover());
  }

  private updateHover(): void {
    this.hoverFrame = null;
    const point = this.hoverPoint;
    if (point === null || this.dragNode !== null || this.activePoint !== null || this.isKilled) return;
    this.setActiveFolder(this.regionAt(point), null);
  }

  private cancelHover(): void {
    if (this.hoverFrame !== null) window.cancelAnimationFrame(this.hoverFrame);
    this.hoverFrame = null;
    this.hoverPoint = null;
  }

  private endDrag(): void {
    if (this.dragNode === null) return;
    this.dragNode = null;
    this.sigma.getCamera().enable();
    this.persistPositions();
  }

  private setNodeFolder(id: string): void {
    if (!this.graph.hasNode(id)) return;
    const attrs = this.graph.getNodeAttributes(id);
    const point = this.sigma.graphToViewport({ x: attrs.x, y: attrs.y });
    this.setActiveFolder(attrs.folder, point);
  }

  private setActiveFolder(folder: string | null, point: Point | null): void {
    if (folder === this.activeFolder && point === this.activePoint) return;
    this.activeFolder = folder;
    this.activePoint = point;
    this.paintRegions();
  }

  private scheduleRegions(): void {
    if (this.isKilled || this.regionTimer !== null || this.regionFrame !== null) return;
    const elapsed = performance.now() - this.regionTime;
    const interval = Math.min(MAX_REGION_DELAY, REGION_DRAW_DELAY + this.graph.order * REGION_NODE_DELAY);
    const delay = Math.max(0, interval - elapsed);
    this.regionTimer = window.setTimeout(() => {
      this.regionTimer = null;
      this.regionFrame = window.requestAnimationFrame(() => {
        this.regionFrame = null;
        this.drawRegions();
      });
    }, delay);
  }

  private async openNode(id: string, event: MouseEvent | TouchEvent): Promise<void> {
    if (!this.graph.hasNode(id)) return;
    const path = this.graph.getNodeAttribute(id, "path");
    if (path === null) return;
    const file = this.app.vault.getFileByPath(path);
    if (file === null) return;
    const newTab = isMouseEvent(event) && (event.metaKey || event.ctrlKey);
    const leaf = this.app.workspace.getLeaf(newTab ? "tab" : false);
    await leaf.openFile(file, { active: true });
  }

  private drawRegions(): void {
    if (this.isKilled) return;
    if (this.regionTimer !== null) window.clearTimeout(this.regionTimer);
    if (this.regionFrame !== null) window.cancelAnimationFrame(this.regionFrame);
    this.regionTimer = null;
    this.regionFrame = null;
    this.regionTime = performance.now();

    const seeds: RegionSeed[] = [];
    for (const folder of this.model.regions) {
      for (const id of [anchorId(folder.path), ...folder.nodes]) {
        const position = this.viewportPoint(id);
        if (position === null) continue;
        seeds.push({ id, path: folder.path, position });
      }
    }

    const frame = regionFrame(seeds.map((seed) => seed.position), this.settings.folder.regionPadding);
    if (frame === null || seeds.length === 0) {
      this.regions = [];
      this.boundaries = [];
      this.regionAt = () => null;
      this.paintRegions();
      return;
    }
    const folders = new Map(this.model.regions.map((folder) => [folder.path, folder]));
    const partition = buildRegionPartition(seeds, frame);
    this.regions = partition.cells.flatMap((cell): DrawnRegion[] => {
      const folder = folders.get(cell.path);
      if (folder === undefined) return [];
      return [{
        folder,
        center: cell.center,
        path: buildRegionPath(cell.points)
      }];
    });
    this.boundaries = partition.boundaries;
    this.regionAt = partition.pathAt;
    this.paintRegions();
  }

  private paintRegions(): void {
    if (this.isKilled) return;
    const size = this.sigma.getDimensions();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(size.width * ratio));
    const height = Math.max(1, Math.round(size.height * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.canvas.style.width = `${size.width}px`;
      this.canvas.style.height = `${size.height}px`;
    }
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.ctx.clearRect(0, 0, size.width, size.height);
    for (const region of this.regions) {
      const isActive = region.folder.path === this.activeFolder;
      const multiplier = isActive ? REGION_STYLE.activeFill : 1;
      this.ctx.globalAlpha = Math.min(
        REGION_STYLE.maxAlpha,
        this.settings.folder.regionOpacity * multiplier
      );
      this.ctx.fillStyle = region.folder.color;
      this.ctx.fill(region.path);
    }
    const borderColor = readRegionBorderColor(this.container);
    this.strokeBoundaries(
      this.boundaries,
      borderColor,
      REGION_STYLE.borderAlpha,
      REGION_STYLE.idleWidth
    );
    if (this.activeFolder !== null) {
      const folder = this.model.regions.find((entry) => entry.path === this.activeFolder);
      if (folder !== undefined) {
        this.strokeBoundaries(
          this.boundaries.filter((boundary) => boundary.paths.includes(folder.path)),
          folder.color,
          REGION_STYLE.activeBorderAlpha,
          REGION_STYLE.activeWidth
        );
      }
    }
    this.ctx.globalAlpha = 1;
    this.drawLabel();
  }

  private viewportPoint(id: string): Point | null {
    if (!this.graph.hasNode(id)) return null;
    const attrs = this.graph.getNodeAttributes(id);
    return this.sigma.graphToViewport({ x: attrs.x, y: attrs.y });
  }

  private strokeBoundaries(
    boundaries: readonly RegionBoundary[],
    color: string,
    alpha: number,
    width: number
  ): void {
    if (boundaries.length === 0) return;
    this.ctx.beginPath();
    for (const boundary of boundaries) {
      this.ctx.moveTo(boundary.start.x, boundary.start.y);
      this.ctx.lineTo(boundary.end.x, boundary.end.y);
    }
    this.ctx.globalAlpha = alpha;
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = width;
    this.ctx.stroke();
  }

  private drawLabel(): void {
    if (this.activeFolder === null) {
      this.label.hidden = true;
      return;
    }
    const region = this.regions.find((entry) => entry.folder.path === this.activeFolder);
    const point = this.activePoint ?? region?.center;
    if (point === undefined) {
      this.label.hidden = true;
      return;
    }
    this.label.hidden = false;
    this.label.setText(this.activeFolder);
    this.label.style.left = `${point.x}px`;
    this.label.style.top = `${point.y}px`;
  }
}
