import { describe, expect, it } from "vitest";
import {
  buildRegionPartition,
  circlePolygon,
  isInside,
  regionBoundaries,
  regionFrame
} from "../src/contour-graph/regions";

describe("folder region partition", () => {
  it("builds one enclosing circular frame around graph points", () => {
    const frame = regionFrame([{ x: -100, y: 20 }, { x: 100, y: 20 }], 15);
    expect(frame).toEqual({ center: { x: 0, y: 20 }, radius: 115 });
    if (frame === null) return;
    expect(circlePolygon(frame)).toHaveLength(64);
  });

  it("gives a lone folder the entire circle", () => {
    const frame = { center: { x: 50, y: 40 }, radius: 100 };
    const partition = buildRegionPartition([
      { id: "Only.md", path: "/Only", position: { x: 50, y: 40 } }
    ], frame);
    const { cells } = partition;
    expect(cells).toHaveLength(1);
    expect(cells[0]?.path).toBe("/Only");
    expect(cells[0]?.points).toHaveLength(64);
    expect(isInside(frame.center, cells[0]?.points ?? [])).toBe(true);
    expect(partition.pathAt(frame.center)).toBe("/Only");
    expect(partition.pathAt({ x: 200, y: 200 })).toBeNull();
  });

  it("keeps every graph node inside its deterministic folder cell", () => {
    const frame = { center: { x: 0, y: 0 }, radius: 120 };
    const seeds = [
      { id: "Large/A.md", path: "/Large", position: { x: -45, y: 0 } },
      { id: "Top/B.md", path: "/Top", position: { x: 45, y: -35 } },
      { id: "Bottom/C.md", path: "/Bottom", position: { x: 45, y: 35 } }
    ];
    const first = buildRegionPartition(seeds, frame);
    const second = buildRegionPartition(seeds, frame);
    expect(first.cells).toEqual(second.cells);
    expect(first.boundaries).toEqual(second.boundaries);
    expect(first.cells).toHaveLength(seeds.length);
    for (const seed of seeds) expect(first.pathAt(seed.position)).toBe(seed.path);
    for (const cell of first.cells) {
      expect(isInside(cell.center, cell.points)).toBe(true);
      for (const other of first.cells) {
        if (other.path === cell.path) continue;
        expect(isInside(cell.center, other.points)).toBe(false);
      }
    }
  });

  it("removes internal edges between adjacent cells in the same folder", () => {
    const cells = [
      {
        id: "A.md",
        path: "/Same",
        center: { x: 0.5, y: 0.5 },
        points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]
      },
      {
        id: "B.md",
        path: "/Same",
        center: { x: 1.5, y: 0.5 },
        points: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 1, y: 1 }]
      }
    ];
    const boundaries = regionBoundaries(cells);
    expect(boundaries).toHaveLength(6);
    expect(boundaries.some((edge) => {
      return edge.start.x === 1 && edge.end.x === 1;
    })).toBe(false);
  });

  it("rejects points outside a region", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 }
    ];
    expect(isInside({ x: 5, y: 5 }, square)).toBe(true);
    expect(isInside({ x: 15, y: 5 }, square)).toBe(false);
  });
});
