import { DirectedGraph } from "graphology";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../src/contour-graph/constants";
import { LayoutRunner, mapLayoutOpts } from "../src/contour-graph/layout";

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
    vi.stubGlobal("window", globalThis);
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
    expect(reducer("A", { x: 9, y: 9, size: 4, fixed: false }).x).toBe(9);
    runner.stop();
    expect(reducer("A", { x: 99, y: 99, size: 4, fixed: false })).toEqual(
      graph.getNodeAttributes("A")
    );
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
