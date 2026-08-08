import { describe, expect, it } from "vitest";
import { GenGate } from "../src/contour-graph/generation";

describe("worker generation gate", () => {
  it("rejects stale work after restart or invalidation", () => {
    const gate = new GenGate();
    const first = gate.next();
    expect(gate.isCurrent(first)).toBe(true);
    const second = gate.next();
    expect(gate.isCurrent(first)).toBe(false);
    expect(gate.isCurrent(second)).toBe(true);
    gate.invalidate();
    expect(gate.isCurrent(second)).toBe(false);
  });
});
