import type { App, TFile } from "obsidian";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/contour-graph/constants";
import { buildGraph, dropPositions, movePosition, savePositions } from "../src/contour-graph/model";
import type { ContourGraphSettings, SavedPoint } from "../src/contour-graph/types";

interface AppSeed {
  files: TFile[];
  resolved?: Record<string, Record<string, number>>;
  unresolved?: Record<string, Record<string, number>>;
  tags?: Record<string, string[]>;
}

function makeFile(path: string): TFile {
  const name = path.split("/").at(-1) ?? path;
  const split = name.lastIndexOf(".");
  const basename = split < 0 ? name : name.slice(0, split);
  const extension = split < 0 ? "" : name.slice(split + 1);
  return { path, name, basename, extension } as TFile;
}

function makeApp(seed: AppSeed): App {
  const files = new Map(seed.files.map((file) => [file.path, file]));
  return {
    vault: {
      getMarkdownFiles: () => seed.files.filter((file) => file.extension === "md"),
      getFileByPath: (path: string) => files.get(path) ?? null
    },
    metadataCache: {
      resolvedLinks: seed.resolved ?? {},
      unresolvedLinks: seed.unresolved ?? {},
      getFileCache: (file: TFile) => ({
        tags: (seed.tags?.[file.path] ?? []).map((tag) => ({ tag: `#${tag}`, position: null }))
      })
    }
  } as unknown as App;
}

function makeSettings(
  graph: Partial<ContourGraphSettings["graph"]> = {},
  folder: Partial<ContourGraphSettings["folder"]> = {}
): ContourGraphSettings {
  return {
    ...structuredClone(DEFAULT_SETTINGS),
    graph: { ...DEFAULT_SETTINGS.graph, ...graph },
    folder: { ...DEFAULT_SETTINGS.folder, ...folder }
  };
}

describe("vault graph model", () => {
  it("assigns descendants to every visible parent but never creates a root contour", () => {
    const app = makeApp({
      files: [
        makeFile("Root.md"),
        makeFile("A/B/C/Deep.md"),
        makeFile("Left/Shared/One.md"),
        makeFile("Right/Shared/Two.md")
      ]
    });
    const result = buildGraph(app, makeSettings({}, { maxDepth: 2 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const folders = new Map(result.value.folders.map((folder) => [folder.path, folder.nodes]));
    expect(folders.has("/")).toBe(false);
    expect(folders.get("/A")).toContain("A/B/C/Deep.md");
    expect(folders.get("/A/B")).toContain("A/B/C/Deep.md");
    expect(folders.has("/A/B/C")).toBe(false);
    expect(result.value.nodes.some((node) => node.id === "folder:/")).toBe(true);
    expect(result.value.nodes.some((node) => node.id === "folder:/A/B/C")).toBe(true);
    expect(result.value.edges).toContainEqual(expect.objectContaining({
      source: "folder:/",
      target: "folder:/A",
      kind: "folder"
    }));
    expect(result.value.edges).toContainEqual(expect.objectContaining({
      source: "folder:/A/B/C",
      target: "A/B/C/Deep.md",
      kind: "folder"
    }));
    expect(folders.has("/Left/Shared")).toBe(true);
    expect(folders.has("/Right/Shared")).toBe(true);
  });

  it("collects resolved links, unresolved links, tags, and linked attachments", () => {
    const app = makeApp({
      files: [
        makeFile("A.md"),
        makeFile("Folder/B.md"),
        makeFile("Orphan.md"),
        makeFile("image.png")
      ],
      resolved: { "A.md": { "A.md": 1, "Folder/B.md": 1, "image.png": 1 } },
      unresolved: { "A.md": { Ghost: 1 } },
      tags: { "A.md": ["project"] }
    });
    const settings = makeSettings({ showAttachments: true, showTags: true, showOrphans: false });
    const result = buildGraph(app, settings);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const nodes = new Map(result.value.nodes.map((node) => [node.id, node]));
    expect(nodes.get("image.png")?.kind).toBe("attachment");
    expect(nodes.get("tag:project")?.kind).toBe("tag");
    expect(nodes.get("unresolved:Ghost")?.kind).toBe("unresolved");
    expect(nodes.has("Orphan.md")).toBe(false);
    expect(result.value.edges.filter((edge) => edge.kind === "link")).toHaveLength(3);
    expect(result.value.edges.filter((edge) => edge.kind === "tag")).toHaveLength(1);
  });

  it("uses saved fixed positions and deterministic positions for new nodes", () => {
    const app = makeApp({ files: [makeFile("Saved.md"), makeFile("New.md")] });
    const settings = makeSettings();
    settings.positions["Saved.md"] = { x: 12, y: -4, fixed: true };
    const first = buildGraph(app, settings);
    const second = buildGraph(app, settings);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    const firstNodes = new Map(first.value.nodes.map((node) => [node.id, node]));
    const secondNodes = new Map(second.value.nodes.map((node) => [node.id, node]));
    expect(firstNodes.get("Saved.md")).toEqual(expect.objectContaining({ x: 12, y: -4, fixed: true }));
    expect(firstNodes.get("New.md")?.x).toBe(secondNodes.get("New.md")?.x);
    expect(firstNodes.get("New.md")?.y).toBe(secondNodes.get("New.md")?.y);
  });

  it("keeps excluded-folder notes and links but omits their folder force and contour", () => {
    const app = makeApp({
      files: [makeFile("00_Meta/One.md"), makeFile("00_Meta/Sources/Two.md"), makeFile("Keep/Three.md")],
      resolved: { "00_Meta/One.md": { "Keep/Three.md": 1 } }
    });
    const settings = makeSettings();
    settings.folder.excluded = ["/00_Meta"];
    const result = buildGraph(app, settings);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.nodes.some((node) => node.id === "00_Meta/One.md")).toBe(true);
    expect(result.value.edges).toContainEqual(expect.objectContaining({
      source: "00_Meta/One.md",
      target: "Keep/Three.md",
      kind: "link"
    }));
    expect(result.value.nodes.some((node) => node.id === "folder:/00_Meta")).toBe(false);
    expect(result.value.nodes.find((node) => node.id === "00_Meta/One.md")?.folder).toBeNull();
    expect(result.value.folders.some((folder) => folder.path.startsWith("/00_Meta"))).toBe(false);
  });

  it("adds Folders to Graph-style structural nodes and links", () => {
    const app = makeApp({
      files: [
        makeFile("Folder/Linked.md"),
        makeFile("Folder/Target.md"),
        makeFile("Folder/Unlinked.md")
      ],
      resolved: { "Folder/Linked.md": { "Folder/Target.md": 1 } }
    });
    const result = buildGraph(app, makeSettings());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.nodes.some((node) => node.id === "folder:/Folder")).toBe(true);
    expect(result.value.edges).toContainEqual(expect.objectContaining({
      source: "Folder/Linked.md",
      target: "Folder/Target.md",
      kind: "link"
    }));
    expect(result.value.edges).toContainEqual(expect.objectContaining({
      source: "folder:/",
      target: "folder:/Folder",
      kind: "folder",
      hidden: false
    }));
    expect(result.value.edges.filter((edge) => {
      return edge.kind === "folder" && edge.source === "folder:/Folder";
    })).toHaveLength(3);
    expect(result.value.nodes.find((node) => node.id === "folder:/Folder")).toEqual(
      expect.objectContaining({ hidden: false, kind: "folder" })
    );
    const folder = result.value.nodes.find((node) => node.id === "folder:/Folder");
    const leaf = result.value.nodes.find((node) => node.id === "Folder/Unlinked.md");
    expect(folder?.size ?? 0).toBeGreaterThan(leaf?.size ?? 0);
  });

  it("persists pinned notes only", () => {
    const app = makeApp({ files: [makeFile("Free.md"), makeFile("Pinned.md")] });
    const result = buildGraph(app, makeSettings());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const pinned = result.value.nodes.find((node) => node.id === "Pinned.md");
    if (pinned === undefined) throw new Error("Pinned fixture node is missing.");
    pinned.fixed = true;
    const positions = savePositions(result.value);
    expect(Object.keys(positions)).toEqual(["Pinned.md"]);
    expect(positions["Pinned.md"]).toEqual({ x: pinned.x, y: pinned.y, fixed: true });
  });

  it("moves and deletes file or folder position subtrees", () => {
    const positions: Record<string, SavedPoint> = {
      "A/One.md": { x: 1, y: 2, fixed: false },
      "A/B/Two.md": { x: 3, y: 4, fixed: true },
      "Keep.md": { x: 5, y: 6, fixed: false }
    };
    const moved = movePosition(positions, "A", "Renamed");
    expect(moved["Renamed/One.md"]).toEqual(positions["A/One.md"]);
    expect(moved["Renamed/B/Two.md"]).toEqual(positions["A/B/Two.md"]);
    expect(moved["A/One.md"]).toBeUndefined();
    expect(dropPositions(moved, "Renamed")).toEqual({ "Keep.md": positions["Keep.md"] });
  });

  it("builds a 5k-note and 15k-link fixture within the beta budget", { timeout: 15_000 }, () => {
    const count = 5_000;
    const files = Array.from({ length: count }, (_, index) => makeFile(`F${index % 100}/N${index}.md`));
    const resolved: Record<string, Record<string, number>> = {};
    for (let index = 0; index < count; index += 1) {
      const source = files[index];
      if (source === undefined) continue;
      resolved[source.path] = {
        [files[(index + 1) % count]?.path ?? ""]: 1,
        [files[(index + 2) % count]?.path ?? ""]: 1,
        [files[(index + 3) % count]?.path ?? ""]: 1
      };
    }
    const started = performance.now();
    const result = buildGraph(makeApp({ files, resolved }), makeSettings());
    const elapsed = performance.now() - started;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.nodes.filter((node) => node.kind === "file")).toHaveLength(count);
    expect(result.value.edges.filter((edge) => edge.kind === "link")).toHaveLength(15_000);
    expect(elapsed).toBeLessThan(5_000);
  });
});
