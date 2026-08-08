import { describe, expect, it } from "vitest";
import {
  buildRegionCells,
  circlePolygon,
  isInside,
  regionFrame
} from "../src/contour-graph/regions";
import type { Point } from "../src/contour-graph/types";

function polygonArea(points: readonly Point[]): number {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (current !== undefined && next !== undefined) sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) / 2;
}

describe("folder region partition", () => {
  it("builds one enclosing circular frame around graph points", () => {
    const frame = regionFrame([{ x: -100, y: 20 }, { x: 100, y: 20 }], 15);
    expect(frame).toEqual({ center: { x: 0, y: 20 }, radius: 115 });
    if (frame === null) return;
    expect(circlePolygon(frame)).toHaveLength(64);
  });

  it("gives a lone folder the entire circle", () => {
    const frame = { center: { x: 50, y: 40 }, radius: 100 };
    const cells = buildRegionCells([
      { path: "/Only", position: { x: 50, y: 40 }, weight: 4 }
    ], frame);
    expect(cells).toHaveLength(1);
    expect(cells[0]?.path).toBe("/Only");
    expect(cells[0]?.points).toHaveLength(64);
    expect(isInside(frame.center, cells[0]?.points ?? [])).toBe(true);
  });

  it("creates deterministic, mutually exclusive cells weighted by file count", () => {
    const frame = { center: { x: 0, y: 0 }, radius: 120 };
    const seeds = [
      { path: "/Large", position: { x: -45, y: 0 }, weight: 8 },
      { path: "/Top", position: { x: 45, y: -35 }, weight: 1 },
      { path: "/Bottom", position: { x: 45, y: 35 }, weight: 1 }
    ];
    const first = buildRegionCells(seeds, frame);
    const second = buildRegionCells(seeds, frame);
    expect(first).toEqual(second);
    expect(first).toHaveLength(seeds.length);
    for (const cell of first) expect(isInside(cell.center, cell.points)).toBe(true);

    const large = first.find((cell) => cell.path === "/Large");
    const small = first.find((cell) => cell.path === "/Top");
    expect(polygonArea(large?.points ?? [])).toBeGreaterThan(polygonArea(small?.points ?? []));

    for (const cell of first) {
      for (const other of first) {
        if (other.path === cell.path) continue;
        expect(isInside(cell.center, other.points)).toBe(false);
      }
    }
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
