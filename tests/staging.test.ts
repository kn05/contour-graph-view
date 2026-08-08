import { describe, expect, it } from "vitest";
import { STAGE_OPTS } from "../src/contour-graph/constants";
import { planNodeStage, stageBatchSize } from "../src/contour-graph/staging";
import type { GraphEdge, GraphModel, GraphNode } from "../src/contour-graph/types";

function makeNode(id: string, fixed = false): GraphNode {
  return {
    id,
    label: id,
    kind: "file",
    path: `${id}.md`,
    folder: "/A",
    tags: [],
    color: "#fff",
    size: 6,
    x: 0,
    y: 0,
    hidden: false,
    fixed
  };
}

function makeEdge(source: string, target: string): GraphEdge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    kind: "link",
    weight: 1,
    hidden: false
  };
}

describe("progressive graph staging", () => {
  it("reveals high-degree nodes first and excludes fixed nodes", () => {
    const nodes = Array.from({ length: STAGE_OPTS.minNodes }, (_, index) => makeNode(`N${index}`));
    nodes[1] = makeNode("N1", true);
    const model: GraphModel = {
      nodes,
      edges: [
        makeEdge("N5", "N2"),
        makeEdge("N5", "N3"),
        makeEdge("N5", "N6"),
        makeEdge("N2", "N4")
      ],
      folders: []
    };
    const ids = planNodeStage(model);
    expect(ids[0]).toBe("N5");
    expect(ids).not.toContain("N1");
  });

  it("skips staging tiny graphs and bounds adaptive batches", () => {
    const model: GraphModel = {
      nodes: [makeNode("A"), makeNode("B")],
      edges: [],
      folders: []
    };
    expect(planNodeStage(model)).toEqual([]);
    expect(stageBatchSize(0)).toBe(0);
    expect(stageBatchSize(STAGE_OPTS.singleNodeLimit)).toBe(1);
    expect(stageBatchSize(5_000)).toBeLessThanOrEqual(STAGE_OPTS.maxBatch);
    expect(stageBatchSize(5_000)).toBeGreaterThan(1);
  });
});
