import { describe, expect, it } from "vitest";
import {
  anchorId,
  fileFolder,
  folderChain,
  folderColor,
  folderDepth,
  initialPoint,
  isFolderExcluded,
  compactFolders,
  normalizeFolder,
  parentFolder
} from "../src/contour-graph/folders";

describe("folder paths", () => {
  it("normalizes nested, root, and repeated separators", () => {
    expect(normalizeFolder("//Work///Active/")).toBe("/Work/Active");
    expect(normalizeFolder("/")).toBe("/");
    expect(fileFolder("Root.md")).toBe("/");
    expect(fileFolder("Work/Note.md")).toBe("/Work");
    expect(parentFolder("/Work/Active")).toBe("/Work");
    expect(parentFolder("/Work")).toBe("/");
    expect(folderDepth("/Work/Active")).toBe(2);
  });

  it("builds all ancestors and applies only the requested visible depth", () => {
    expect(folderChain("/A/B/C", null)).toEqual(["/A", "/A/B", "/A/B/C"]);
    expect(folderChain("/A/B/C", 2)).toEqual(["/A", "/A/B"]);
    expect(folderChain("/", null)).toEqual([]);
  });

  it("excludes selected folder subtrees and removes redundant descendants", () => {
    const excluded = compactFolders(["/Meta/Sources", "Meta", "/Work", "/Work/Archive"]);
    expect(excluded).toEqual(["/Meta", "/Work"]);
    expect(isFolderExcluded("/Meta/Sources/Books", excluded)).toBe(true);
    expect(isFolderExcluded("/Metadata", excluded)).toBe(false);
    expect(isFolderExcluded("/Other/Meta", excluded)).toBe(false);
  });

  it("uses the full folder path for identity and color", () => {
    expect(anchorId("/One/Shared")).not.toBe(anchorId("/Two/Shared"));
    expect(folderColor("/One/Shared", {})).not.toBe(folderColor("/Two/Shared", {}));
    expect(folderColor("/One", {}, false)).toMatch(/42%\)$/u);
    expect(folderColor("/One", { "/One": "#123456" })).toBe("#123456");
  });

  it("places new nodes deterministically", () => {
    expect(initialPoint("A.md")).toEqual(initialPoint("A.md"));
    expect(initialPoint("A.md")).not.toEqual(initialPoint("B.md"));
  });

  it("does not throw for generated folder paths", () => {
    for (let index = 0; index < 2_000; index += 1) {
      const parts = Array.from({ length: index % 9 }, (_, part) => `p${index}-${part}`);
      const path = `${index % 2 === 0 ? "/" : ""}${parts.join("//")}`;
      const folder = normalizeFolder(path);
      expect(() => folderChain(folder, index % 5 || null)).not.toThrow();
    }
  });
});
