import { DirectedGraph } from "graphology";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, LAYOUT_OPTS } from "../src/contour-graph/constants";
import {
  easeLayoutPoint,
  LayoutRunner,
  mapLayoutOpts,
  tweenLayoutPoint
} from "../src/contour-graph/layout";

interface NodeAttrs {
  x: number;
  y: number;
  size: number;
  fixed: boolean;
}

interface EdgeAttrs {
  weight: number;
}

const stats = vi.hoisted(() => ({
  live: 0,
  starts: 0,
  stops: 0,
  kills: 0,
  reducer: null as ((id: string, attrs: NodeAttrs) => NodeAttrs) | null
}));

let nextFrame: FrameRequestCallback | null = null;
let frameId = 0;

vi.mock("graphology-layout-forceatlas2/worker", () => ({
  default: class FakeLayout {
    private isKilled = false;

    constructor(
      _graph: unknown,
      params?: { outputReducer?: (id: string, attrs: NodeAttrs) => NodeAttrs }
    ) {
      stats.live += 1;
      stats.reducer = params?.outputReducer ?? null;
    }

    start(): void {
      stats.starts += 1;
    }

    stop(): void {
      stats.stops += 1;
    }

    kill(): void {
      if (this.isKilled) return;
      this.isKilled = true;
      stats.live -= 1;
      stats.kills += 1;
    }
  }
}));

function makeGraph(): DirectedGraph<NodeAttrs, EdgeAttrs> {
  const graph = new DirectedGraph<NodeAttrs, EdgeAttrs>();
  graph.addNode("A", { x: 1, y: 2, size: 4, fixed: false });
  return graph;
}

describe("layout worker lifecycle", () => {
  beforeEach(() => {
    stats.live = 0;
    stats.starts = 0;
    stats.stops = 0;
    stats.kills = 0;
    stats.reducer = null;
    nextFrame = null;
    frameId = 0;
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      nextFrame = callback;
      frameId += 1;
      return frameId;
    });
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not leak workers over ten restart cycles", () => {
    const runner = new LayoutRunner(makeGraph(), { save: () => undefined, showError: () => undefined });
    for (let run = 0; run < 10; run += 1) {
      runner.start(DEFAULT_SETTINGS);
      expect(stats.live).toBe(1);
      runner.stop();
      expect(stats.live).toBe(0);
    }
    runner.kill();
    runner.kill();
    expect(stats.starts).toBe(10);
    expect(stats.stops).toBe(10);
    expect(stats.kills).toBe(10);
  });

  it("uses the generation gate to reject a stale worker position", () => {
    const graph = makeGraph();
    const runner = new LayoutRunner(graph, { save: () => undefined, showError: () => undefined });
    runner.start(DEFAULT_SETTINGS);
    const reducer = stats.reducer;
    if (reducer === null) throw new Error("The worker reducer was not registered.");
    const raw = graph.getNodeAttributes("A");
    raw.x = 9;
    raw.y = 9;
    const reduced = reducer("A", raw);
    expect(reduced.x).toBe(1);
    expect(reduced.y).toBe(2);
    graph.replaceNodeAttributes("A", reduced);
    const frame = nextFrame;
    if (frame === null) throw new Error("The motion frame was not scheduled.");
    frame(16);
    const next = graph.getNodeAttributes("A");
    expect(next.x).toBeGreaterThan(1);
    expect(Math.hypot(next.x - 1, next.y - 2)).toBeLessThanOrEqual(LAYOUT_OPTS.maxNodeStep);
    runner.stop();
    const stale = reducer("A", { x: 99, y: 99, size: 4, fixed: false });
    expect(stale).toEqual(graph.getNodeAttributes("A"));
  });

  it("can settle hidden nodes without smoothing before reveal", () => {
    const graph = makeGraph();
    const runner = new LayoutRunner(graph, { save: () => undefined, showError: () => undefined });
    runner.setSmoothing(false);
    runner.start(DEFAULT_SETTINGS);
    const reducer = stats.reducer;
    if (reducer === null) throw new Error("The worker reducer was not registered.");
    expect(reducer("A", { x: 90, y: 80, size: 4, fixed: false })).toEqual({
      x: 90,
      y: 80,
      size: 4,
      fixed: false
    });
    runner.kill();
  });

  it("eases small moves and caps large worker jumps", () => {
    expect(easeLayoutPoint({ x: 0, y: 0 }, { x: 1, y: 0 })).toEqual({
      x: LAYOUT_OPTS.moveEase,
      y: 0
    });
    const point = easeLayoutPoint({ x: 0, y: 0 }, { x: 100, y: 100 });
    expect(Math.hypot(point.x, point.y)).toBeCloseTo(LAYOUT_OPTS.maxNodeStep);
    expect(easeLayoutPoint({ x: 2, y: 3 }, { x: Number.NaN, y: 4 })).toEqual({ x: 2, y: 3 });
  });

  it("interpolates layout targets using elapsed frame time", () => {
    const early = tweenLayoutPoint({ x: 0, y: 0 }, { x: 10, y: 0 }, 16);
    const late = tweenLayoutPoint({ x: 0, y: 0 }, { x: 10, y: 0 }, 32);
    expect(early.x).toBeGreaterThan(0);
    expect(late.x).toBeGreaterThan(early.x);
    expect(late.x).toBeLessThan(10);
    expect(tweenLayoutPoint({ x: 1, y: 2 }, { x: 1, y: 2 }, 16)).toEqual({ x: 1, y: 2 });
  });

  it("normalizes Core Graph forces to ForceAtlas2 ranges", () => {
    const base = mapLayoutOpts(DEFAULT_SETTINGS, 100);
    const spread = structuredClone(DEFAULT_SETTINGS);
    spread.graph.repelStrength *= 2;
    spread.graph.linkDistance *= 2;
    spread.graph.centerStrength *= 1.5;
    const stronger = mapLayoutOpts(spread, 1_000);

    expect(base.scalingRatio).toBeCloseTo(1);
    expect(base.strongGravityMode).toBe(true);
    expect(base.adjustSizes).toBe(false);
    expect(base.barnesHutOptimize).toBe(false);
    expect(stronger.scalingRatio).toBeGreaterThan(base.scalingRatio ?? 0);
    expect(stronger.gravity).toBeGreaterThan(base.gravity ?? 0);
    expect(stronger.barnesHutOptimize).toBe(true);
  });
});
