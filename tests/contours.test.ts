import { describe, expect, it } from "vitest";
import {
  buildCapsuleContour,
  buildContour,
  contourAlpha,
  isInside,
  polygonCenter
} from "../src/contour-graph/contours";

describe("folder contours", () => {
  it("builds a hull around two expanded file nodes", () => {
    const polygon = buildCapsuleContour([
      { point: { x: 0, y: 0 }, radius: 5 },
      { point: { x: 20, y: 0 }, radius: 5 }
    ]);
    expect(polygon.length).toBeGreaterThanOrEqual(3);
    expect(polygon.length).toBeGreaterThan(6);
    expect(isInside({ x: 0, y: 0 }, polygon)).toBe(true);
    expect(isInside({ x: 20, y: 0 }, polygon)).toBe(true);
    expect(isInside({ x: 100, y: 100 }, polygon)).toBe(false);
  });

  it("returns stable empty geometry for insufficient points", () => {
    expect(buildContour([])).toEqual([]);
    expect(buildContour([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toEqual([]);
    expect(polygonCenter([])).toEqual({ x: 0, y: 0 });
  });

  it("keeps parent alpha lower while enforcing safe bounds", () => {
    const parent = contourAlpha(1, 4, 0.09);
    const child = contourAlpha(4, 4, 0.09);
    expect(parent).toBeLessThan(child);
    expect(contourAlpha(1, 1, 100)).toBeLessThanOrEqual(0.2);
    expect(contourAlpha(1, 1, 0)).toBe(0);
  });
});
