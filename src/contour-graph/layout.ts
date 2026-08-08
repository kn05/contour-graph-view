import FA2Layout from "graphology-layout-forceatlas2/worker";
import type { ForceAtlas2Settings } from "graphology-layout-forceatlas2";
import type Graph from "graphology-types";
import type { Attributes } from "graphology-types";
import {
  LAYOUT_OPTS,
  LAYOUT_RUN_TIME,
  LAYOUT_SAVE_DELAY
} from "./constants";
import { GenGate } from "./generation";
import type { ContourGraphSettings, Point } from "./types";

export interface LayoutHooks {
  save: () => void;
  showError: (message: string) => void;
}

interface LayoutNode extends Point {
  fixed: boolean;
}

export function easeLayoutPoint(current: Point, next: Point): Point {
  if (!Number.isFinite(next.x) || !Number.isFinite(next.y)) return current;
  const dx = next.x - current.x;
  const dy = next.y - current.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return next;
  const ratio = Math.min(LAYOUT_OPTS.moveEase, LAYOUT_OPTS.maxNodeStep / distance);
  return {
    x: current.x + dx * ratio,
    y: current.y + dy * ratio
  };
}

export function tweenLayoutPoint(current: Point, target: Point, elapsed: number): Point {
  if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) return current;
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  if (Math.hypot(dx, dy) <= LAYOUT_OPTS.settleDistance) return target;
  const time = Math.min(LAYOUT_OPTS.frameMaxDelay, Math.max(0, elapsed));
  const ratio = 1 - Math.exp(-time / LAYOUT_OPTS.frameEaseMs);
  return {
    x: current.x + dx * ratio,
    y: current.y + dy * ratio
  };
}

export function mapLayoutOpts(settings: ContourGraphSettings, order: number): ForceAtlas2Settings {
  const repel = settings.graph.repelStrength / LAYOUT_OPTS.repelBase;
  const distance = Math.sqrt(settings.graph.linkDistance / LAYOUT_OPTS.distanceBase);
  const rawScale = repel * distance;
  const scalingRatio = Math.min(
    LAYOUT_OPTS.scaleCeiling,
    Math.max(LAYOUT_OPTS.scaleFloor, rawScale)
  );
  const slowDown = Math.max(
    LAYOUT_OPTS.slowDownFloor,
    LAYOUT_OPTS.slowDownBase / Math.max(LAYOUT_OPTS.linkStrengthFloor, settings.graph.linkStrength)
  );
  return {
    adjustSizes: false,
    barnesHutOptimize: order > LAYOUT_OPTS.barnesHutMinNodes,
    barnesHutTheta: LAYOUT_OPTS.barnesHutTheta,
    edgeWeightInfluence: LAYOUT_OPTS.edgeWeightInfluence,
    gravity: Math.max(
      LAYOUT_OPTS.gravityFloor,
      settings.graph.centerStrength * LAYOUT_OPTS.gravityFactor
    ),
    scalingRatio,
    slowDown,
    strongGravityMode: true
  };
}

export class LayoutRunner<
  NodeAttrs extends Attributes & LayoutNode,
  EdgeAttrs extends Attributes
> {
  private layout: FA2Layout<NodeAttrs, EdgeAttrs> | null = null;
  private stopTimer: number | null = null;
  private saveTimer: number | null = null;
  private readonly gen = new GenGate();
  private readonly points = new Map<string, Point>();
  private readonly targets = new Map<string, Point>();
  private motionFrame: number | null = null;
  private motionTime: number | null = null;
  private isSmooth = true;
  private isKilled = false;

  constructor(
    private readonly graph: Graph<NodeAttrs, EdgeAttrs>,
    private readonly hooks: LayoutHooks
  ) {}

  setSmoothing(isSmooth: boolean): void {
    this.isSmooth = isSmooth;
  }

  setPoint(id: string, point: Point): void {
    if (!this.graph.hasNode(id) || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    const next = { x: point.x, y: point.y };
    this.points.set(id, next);
    this.targets.set(id, next);
  }

  start(settings: ContourGraphSettings): void {
    if (this.isKilled || this.graph.order === 0 || this.layout !== null) return;
    const gen = this.gen.next();
    this.points.clear();
    this.targets.clear();
    this.graph.forEachNode((id, attrs) => {
      const point = { x: attrs.x, y: attrs.y };
      this.points.set(id, point);
      this.targets.set(id, point);
    });
    try {
      this.layout = new FA2Layout<NodeAttrs, EdgeAttrs>(this.graph, {
        getEdgeWeight: "weight",
        outputReducer: (id: string, attrs: NodeAttrs): NodeAttrs => {
          if (!this.graph.hasNode(id)) return attrs;
          const current = this.points.get(id);
          if (current === undefined) return attrs;
          if (!this.gen.isCurrent(gen)) return { ...attrs, ...current };
          if (!this.isSmooth) {
            const point = { x: attrs.x, y: attrs.y };
            this.points.set(id, point);
            this.targets.set(id, point);
            return attrs;
          }
          if (attrs.fixed) {
            this.targets.set(id, current);
            return { ...attrs, ...current };
          }
          this.targets.set(id, easeLayoutPoint(current, attrs));
          return { ...attrs, ...current };
        },
        settings: mapLayoutOpts(settings, this.graph.order)
      });
      this.layout.start();
      this.startMotion(gen);
      this.saveTimer = window.setInterval(() => {
        if (this.gen.isCurrent(gen)) this.hooks.save();
      }, LAYOUT_SAVE_DELAY);
      this.stopTimer = window.setTimeout(() => {
        if (!this.gen.isCurrent(gen)) return;
        this.stop();
        this.hooks.save();
      }, LAYOUT_RUN_TIME);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unknown layout error";
      this.hooks.showError(`Layout stopped: ${message}`);
      this.killWorker();
    }
  }

  stop(): void {
    this.gen.invalidate();
    if (this.stopTimer !== null) window.clearTimeout(this.stopTimer);
    if (this.saveTimer !== null) window.clearInterval(this.saveTimer);
    this.stopTimer = null;
    this.saveTimer = null;
    this.stopMotion();
    this.killWorker();
  }

  kill(): void {
    if (this.isKilled) return;
    this.isKilled = true;
    this.stop();
  }

  private killWorker(): void {
    if (this.layout === null) return;
    const layout = this.layout;
    this.layout = null;
    try {
      layout.stop();
    } catch {
      // Continue to terminate a worker that failed while stopping.
    }
    try {
      layout.kill();
    } catch {
      // The worker is already unusable.
    }
  }

  private startMotion(gen: number): void {
    this.stopMotion();
    const move = (time: number): void => {
      this.motionFrame = null;
      if (!this.gen.isCurrent(gen) || this.layout === null || this.isKilled) return;
      const elapsed = this.motionTime === null ? LAYOUT_OPTS.frameBaseDelay : time - this.motionTime;
      this.motionTime = time;
      const moves = new Map<string, Point>();
      for (const [id, current] of this.points) {
        const target = this.targets.get(id);
        if (target === undefined || !this.graph.hasNode(id)) continue;
        const attrs = this.graph.getNodeAttributes(id);
        const point = attrs.fixed ? current : tweenLayoutPoint(current, target, elapsed);
        if (point.x === current.x && point.y === current.y) continue;
        this.points.set(id, point);
        moves.set(id, point);
      }
      if (moves.size > 0) {
        this.graph.updateEachNodeAttributes((id, attrs) => {
          const point = moves.get(id);
          if (point === undefined) return attrs;
          attrs.x = point.x;
          attrs.y = point.y;
          return attrs;
        }, { attributes: ["x", "y"] });
      }
      this.motionFrame = window.requestAnimationFrame(move);
    };
    this.motionFrame = window.requestAnimationFrame(move);
  }

  private stopMotion(): void {
    if (this.motionFrame !== null) window.cancelAnimationFrame(this.motionFrame);
    this.motionFrame = null;
    this.motionTime = null;
  }
}
