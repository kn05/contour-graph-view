import { describe, expect, it } from "vitest";
import { buildFolderShifts, type FolderPoint } from "../src/contour-graph/separation";

function point(id: string, folder: string, x: number, y: number, isAnchor = false): FolderPoint {
  return { id, folder, x, y, isAnchor };
}

describe("folder separation", () => {
  it("pushes overlapping unrelated groups in opposite directions", () => {
    const shifts = buildFolderShifts([
      point("a", "/A", 0, 0),
      point("anchor-a", "/A", 0, 0, true),
      point("b", "/B", 1, 1),
      point("anchor-b", "/B", 1, 1, true)
    ], 0.12);
    const a = shifts.get("/A");
    const b = shifts.get("/B");
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect((a?.x ?? 0) + (b?.x ?? 0)).toBeCloseTo(0);
    expect((a?.y ?? 0) + (b?.y ?? 0)).toBeCloseTo(0);
    expect(Math.hypot(a?.x ?? 0, a?.y ?? 0)).toBeGreaterThan(0);
  });

  it("allows nested groups and already separated groups to overlap naturally", () => {
    const nested = buildFolderShifts([
      point("a", "/A", 0, 0),
      point("anchor-a", "/A", 0, 0, true),
      point("b", "/A/B", 0, 0),
      point("anchor-b", "/A/B", 0, 0, true)
    ], 0.12);
    expect(nested.get("/A")).toEqual({ x: 0, y: 0 });
    expect(nested.get("/A/B")).toEqual({ x: 0, y: 0 });

    const separate = buildFolderShifts([
      point("a", "/A", -20, 0),
      point("anchor-a", "/A", -20, 0, true),
      point("b", "/B", 20, 0),
      point("anchor-b", "/B", 20, 0, true)
    ], 0.12);
    expect(separate.get("/A")).toEqual({ x: 0, y: 0 });
    expect(separate.get("/B")).toEqual({ x: 0, y: 0 });
  });

  it("bounds neighbor checks for five thousand folders", () => {
    const points: FolderPoint[] = [];
    for (let index = 0; index < 5_000; index += 1) {
      const folder = `/F${index}`;
      points.push(
        point(`N${index}`, folder, index % 10, index % 7),
        point(`A${index}`, folder, index % 10, index % 7, true)
      );
    }
    const started = performance.now();
    const shifts = buildFolderShifts(points, 0.12);
    expect(shifts.size).toBe(5_000);
    expect(performance.now() - started).toBeLessThan(2_000);
  });
});
