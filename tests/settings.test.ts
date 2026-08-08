import type { App } from "obsidian";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, SCHEMA_VERSION } from "../src/contour-graph/constants";
import {
  applyCoreOpts,
  loadCoreOpts,
  migrateSettings,
  parseCoreGraph,
  parseSettings
} from "../src/contour-graph/settings";

describe("plugin settings", () => {
  it("migrates unversioned settings without changing the source", () => {
    const source = { graph: { showTags: true } };
    const before = structuredClone(source);
    const migrated = migrateSettings(source);
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    expect(migrated.value.schemaVersion).toBe(SCHEMA_VERSION);
    expect(source).toEqual(before);
  });

  it("rejects unknown and invalid schema versions", () => {
    expect(migrateSettings({ schemaVersion: SCHEMA_VERSION + 1 }).ok).toBe(false);
    expect(migrateSettings({ schemaVersion: Number.NaN }).ok).toBe(false);
    expect(migrateSettings({ schemaVersion: -1 }).ok).toBe(false);
  });

  it("migrates schema one with an empty excluded-folder list", () => {
    const migrated = migrateSettings({ schemaVersion: 1, folder: { contourPadding: 30 } });
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    expect(migrated.value).toEqual(expect.objectContaining({
      schemaVersion: SCHEMA_VERSION,
      folder: { contourPadding: 30, excluded: [] }
    }));
  });

  it("restores defaults for invalid numbers and keeps valid saved groups", () => {
    const settings = parseSettings({
      schemaVersion: 1,
      graph: {
        nodeSize: Number.NaN,
        lineSize: Number.POSITIVE_INFINITY,
        repelStrength: 1_000,
        colorGroups: [
          { query: "tag:work", color: "#123456" },
          { query: "bad", color: "red" }
        ]
      },
      folder: {
        maxDepth: 9,
        contourPadding: -10,
        excluded: ["00_Meta", "/00_Meta/Sources", "/", 42]
      },
      positions: {
        "Good.md": { x: 1, y: 2 },
        "Bad.md": { x: Number.NaN, y: 2, fixed: true }
      }
    });
    expect(settings.graph.nodeSize).toBe(DEFAULT_SETTINGS.graph.nodeSize);
    expect(settings.graph.lineSize).toBe(DEFAULT_SETTINGS.graph.lineSize);
    expect(settings.graph.repelStrength).toBe(DEFAULT_SETTINGS.graph.repelStrength);
    expect(settings.graph.colorGroups).toEqual([{ query: "tag:work", color: "#123456" }]);
    expect(settings.folder.maxDepth).toBeNull();
    expect(settings.folder.contourPadding).toBe(DEFAULT_SETTINGS.folder.contourPadding);
    expect(settings.folder.excluded).toEqual(["/00_Meta"]);
    expect(settings.positions).toEqual({ "Good.md": { x: 1, y: 2, fixed: false } });
  });

  it("imports only validated Core Graph values and skips unsupported searches", () => {
    const result = parseCoreGraph({
      showTags: true,
      nodeSizeMultiplier: 2,
      lineSizeMultiplier: -2,
      search: "line:12",
      colorGroups: [
        { query: "tag:work", color: { rgb: 0x123456, a: 0.5 } },
        { query: "unsupported:value", color: { rgb: 0xffffff, a: 1 } }
      ]
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.showTags).toBe(true);
    expect(result.value.nodeSize).toBe(2);
    expect(result.value.lineSize).toBe(DEFAULT_SETTINGS.graph.lineSize);
    expect(result.value.search).toBe("");
    expect(result.value.colorGroups).toEqual([{ query: "tag:work", color: "#12345680" }]);
    expect(result.warnings).toHaveLength(2);
  });

  it("reports damaged Core Graph JSON without writing it", async () => {
    let didWrite = false;
    const app = {
      vault: {
        configDir: ".obsidian",
        adapter: {
          exists: () => Promise.resolve(true),
          read: () => Promise.resolve("{broken"),
          write: () => {
            didWrite = true;
            return Promise.resolve();
          }
        }
      }
    } as unknown as App;
    const result = await loadCoreOpts(app);
    expect(result.ok).toBe(false);
    expect(didWrite).toBe(false);
  });

  it("applies imported options immutably", () => {
    const settings = parseSettings({ schemaVersion: 1 });
    const graph = { ...settings.graph, showTags: true };
    const next = applyCoreOpts(settings, graph, 123);
    expect(next).not.toBe(settings);
    expect(next.graph).not.toBe(graph);
    expect(next.didImport).toBe(true);
    expect(next.importedAt).toBe(123);
  });
});
