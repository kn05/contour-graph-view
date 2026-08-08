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
import type { ContourGraphSettings } from "./types";

export interface LayoutHooks {
  save: () => void;
  showError: (message: string) => void;
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

export class LayoutRunner<NodeAttrs extends Attributes, EdgeAttrs extends Attributes> {
  private layout: FA2Layout<NodeAttrs, EdgeAttrs> | null = null;
  private stopTimer: number | null = null;
  private saveTimer: number | null = null;
  private readonly gen = new GenGate();
  private isKilled = false;

  constructor(
    private readonly graph: Graph<NodeAttrs, EdgeAttrs>,
    private readonly hooks: LayoutHooks
  ) {}

  start(settings: ContourGraphSettings): void {
    if (this.isKilled || this.graph.order === 0 || this.layout !== null) return;
    const gen = this.gen.next();
    try {
      this.layout = new FA2Layout<NodeAttrs, EdgeAttrs>(this.graph, {
        getEdgeWeight: "weight",
        outputReducer: (id: string, attrs: NodeAttrs): NodeAttrs => {
          if (this.gen.isCurrent(gen) || !this.graph.hasNode(id)) return attrs;
          return this.graph.getNodeAttributes(id);
        },
        settings: mapLayoutOpts(settings, this.graph.order)
      });
      this.layout.start();
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
}
