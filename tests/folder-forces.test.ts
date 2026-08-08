import { describe, expect, it } from "vitest";
import {
  buildFolderShifts,
  buildVirtualLinkShifts,
  type FolderPoint
} from "../src/contour-graph/folder-forces";

function point(
  id: string,
  folder: string,
  x: number,
  y: number,
  opts: Partial<Pick<FolderPoint, "isAnchor" | "isFixed">> = {}
): FolderPoint {
  return {
    id,
    folder,
    x,
    y,
    isAnchor: opts.isAnchor ?? false,
    isFixed: opts.isFixed ?? false
  };
}

describe("folder forces", () => {
  it("pushes overlapping top-level families in opposite directions", () => {
    const shifts = buildFolderShifts([
      point("a", "/A/One", 0, 0),
      point("anchor-a", "/A", 0, 0, { isAnchor: true }),
      point("b", "/B/One", 1, 1),
      point("anchor-b", "/B", 1, 1, { isAnchor: true })
    ], 0.12);
    const a = shifts.get("/A");
    const b = shifts.get("/B");
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect((a?.x ?? 0) + (b?.x ?? 0)).toBeCloseTo(0);
    expect((a?.y ?? 0) + (b?.y ?? 0)).toBeCloseTo(0);
    expect(Math.hypot(a?.x ?? 0, a?.y ?? 0)).toBeGreaterThan(0);
  });

  it("keeps sibling subfolders in one separation family", () => {
    const shifts = buildFolderShifts([
      point("a", "/A/One", -1, 0),
      point("anchor-a", "/A/One", -1, 0, { isAnchor: true }),
      point("b", "/A/Two", 1, 0),
      point("anchor-b", "/A/Two", 1, 0, { isAnchor: true })
    ], 0.12);
    expect(shifts).toEqual(new Map([["/A", { x: 0, y: 0 }]]));
  });

  it("does not move already separated families", () => {
    const shifts = buildFolderShifts([
      point("a", "/A", -20, 0),
      point("anchor-a", "/A", -20, 0, { isAnchor: true }),
      point("b", "/B", 20, 0),
      point("anchor-b", "/B", 20, 0, { isAnchor: true })
    ], 0.12);
    expect(shifts.get("/A")).toEqual({ x: 0, y: 0 });
    expect(shifts.get("/B")).toEqual({ x: 0, y: 0 });
  });

  it("pulls every member toward one virtual folder anchor", () => {
    const shifts = buildVirtualLinkShifts([
      point("anchor", "/A", 0, 0, { isAnchor: true }),
      point("right", "/A", 20, 0),
      point("left", "/A", -4, 0)
    ], 0.18);
    expect(shifts.get("right")?.x).toBeLessThan(0);
    expect(shifts.get("left")?.x).toBeGreaterThan(0);
    expect(shifts.get("anchor")?.x).toBeGreaterThan(0);
  });

  it("connects folder anchors to their parent including the root", () => {
    const shifts = buildVirtualLinkShifts([
      point("root", "/", 0, 0, { isAnchor: true }),
      point("parent", "/A", 30, 0, { isAnchor: true }),
      point("child", "/A/B", 60, 0, { isAnchor: true })
    ], 0.18);
    expect(shifts.get("root")?.x).toBeGreaterThan(0);
    expect(shifts.get("child")?.x).toBeLessThan(0);
  });

  it("leaves coincident and fixed notes alone", () => {
    const shifts = buildVirtualLinkShifts([
      point("anchor", "/A", 0, 0, { isAnchor: true }),
      point("same", "/A", 0, 0),
      point("fixed", "/A", 100, 0, { isFixed: true })
    ], 0.18);
    expect(shifts.has("same")).toBe(false);
    expect(shifts.has("fixed")).toBe(false);
    expect(shifts.has("anchor")).toBe(false);
  });

  it("scales movement with frame time", () => {
    const points = [
      point("anchor", "/A", 0, 0, { isAnchor: true }),
      point("node", "/A", 20, 0)
    ];
    const half = buildVirtualLinkShifts(points, 0.18, 0.5).get("node");
    const full = buildVirtualLinkShifts(points, 0.18, 1).get("node");
    expect(Math.abs(half?.x ?? 0)).toBeLessThan(Math.abs(full?.x ?? 0));
  });

  it("bounds neighbor checks for five thousand folder families", () => {
    const points: FolderPoint[] = [];
    for (let index = 0; index < 5_000; index += 1) {
      const folder = `/F${index}/Nested`;
      points.push(
        point(`N${index}`, folder, index % 10, index % 7),
        point(`A${index}`, folder, index % 10, index % 7, { isAnchor: true })
      );
    }
    const started = performance.now();
    const shifts = buildFolderShifts(points, 0.12);
    expect(shifts.size).toBe(5_000);
    expect(performance.now() - started).toBeLessThan(2_000);
  });
});
