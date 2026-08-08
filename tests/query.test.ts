import { describe, expect, it } from "vitest";
import { matchQuery, parseQuery } from "../src/contour-graph/query";
import type { MatchCtx } from "../src/contour-graph/types";

const ctx: MatchCtx = {
  path: "Projects/Alpha Plan.md",
  name: "Alpha Plan",
  tags: new Set(["project", "active"])
};

function matches(query: string): boolean {
  const parsed = parseQuery(query);
  if (!parsed.ok) throw new Error(parsed.error);
  return matchQuery(parsed.value, ctx);
}

describe("graph search", () => {
  it("supports fields, quotes, implicit AND, and negation", () => {
    expect(matches("path:Projects file:\"Alpha Plan\" -tag:archive")).toBe(true);
    expect(matches("tag:#project AND file:Alpha")).toBe(true);
    expect(matches("tag:archive")).toBe(false);
  });

  it("uses AND precedence over OR and supports parentheses", () => {
    expect(matches("tag:missing OR tag:project AND file:Alpha")).toBe(true);
    expect(matches("(tag:missing OR tag:project) AND -file:Beta")).toBe(true);
    expect(matches("(tag:missing OR file:Beta) AND tag:project")).toBe(false);
  });

  it("rejects unsupported or malformed expressions", () => {
    expect(parseQuery("line:12").ok).toBe(false);
    expect(parseQuery("path:").ok).toBe(false);
    expect(parseQuery("(tag:project").ok).toBe(false);
    expect(parseQuery("\"unfinished").ok).toBe(false);
    expect(parseQuery("a".repeat(5_000)).ok).toBe(false);
  });

  it("handles generated input without throwing", () => {
    const parts = ["path:A", "file:B", "tag:c", "-tag:d", "AND", "OR", "(", ")", "\"x y\""];
    let state = 17;
    for (let run = 0; run < 2_000; run += 1) {
      state = Math.imul(state, 1_664_525) + 1_013_904_223;
      const count = Math.abs(state % 10);
      const query = Array.from({ length: count }, (_, index) => {
        const pick = Math.abs((state + index * 31) % parts.length);
        return parts[pick] ?? "";
      }).join(" ");
      expect(() => {
        const parsed = parseQuery(query);
        if (parsed.ok) matchQuery(parsed.value, ctx);
      }).not.toThrow();
    }
  });
});
