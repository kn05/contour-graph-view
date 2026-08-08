import { Notice, PluginSettingTab, Setting, type App, type Plugin } from "obsidian";
import { FolderPicker } from "./folder-picker";
import { normalizeFolder } from "./folders";
import { parseQuery } from "./query";
import type { ColorGroup, ContourGraphSettings, FolderOpts, GraphOpts, Result } from "./types";

export interface SettingsHost {
  getSettings: () => ContourGraphSettings;
  setSettings: (settings: ContourGraphSettings) => void;
  importCore: () => Promise<Result<GraphOpts>>;
}

function parseColors(text: string): Result<Record<string, string>> {
  const colors: Record<string, string> = {};
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.length === 0) continue;
    const split = line.lastIndexOf("=");
    if (split < 1) return { ok: false, error: `Invalid color override: ${line}` };
    const path = line.slice(0, split).trim();
    const color = line.slice(split + 1).trim();
    if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/iu.test(color)) {
      return { ok: false, error: `Invalid color for ${path}. Use #RRGGBB or #RRGGBBAA.` };
    }
    colors[normalizeFolder(path)] = color;
  }
  return { ok: true, value: colors, warnings: [] };
}

function parseGroupText(text: string): Result<ColorGroup[]> {
  const groups: ColorGroup[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.length === 0) continue;
    const split = line.lastIndexOf("=");
    const query = line.slice(0, split).trim();
    const color = line.slice(split + 1).trim();
    if (split < 1 || query.length === 0 || !/^#[0-9a-f]{6}([0-9a-f]{2})?$/iu.test(color)) {
      return { ok: false, error: `Invalid color group: ${line}` };
    }
    const parsed = parseQuery(query);
    if (!parsed.ok || parsed.value === null) {
      const reason = parsed.ok ? "the search is empty" : parsed.error;
      return { ok: false, error: `Invalid color group search: ${reason}` };
    }
    groups.push({ query, color });
  }
  return { ok: true, value: groups, warnings: [] };
}

function groupText(groups: readonly ColorGroup[]): string {
  return groups.map((group) => `${group.query} = ${group.color}`).join("\n");
}

function colorText(colors: Record<string, string>): string {
  return Object.entries(colors)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, color]) => `${path} = ${color}`)
    .join("\n");
}

function excludedText(folders: readonly string[]): string {
  if (folders.length === 0) return "No folders are excluded from attraction and contours.";
  const shown = folders.slice(0, 3).join(", ");
  const extra = folders.length > 3 ? ` and ${folders.length - 3} more` : "";
  return `Excluded: ${shown}${extra}. Notes and regular links remain visible.`;
}

export class ContourGraphSettingTab extends PluginSettingTab {
  constructor(app: App, plugin: Plugin, private readonly host: SettingsHost) {
    super(app, plugin);
  }

  override display(): void {
    this.renderSettings();
  }

  private renderSettings(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Contour Graph View" });
    this.addImport();
    this.addGraphSettings();
    this.addFolderSettings();
  }

  private addImport(): void {
    const settings = this.host.getSettings();
    const status = settings.importedAt === null
      ? "Core Graph settings have not been imported."
      : `Last imported ${new Date(settings.importedAt).toLocaleString()}.`;
    new Setting(this.containerEl)
      .setName("Import from Graph settings")
      .setDesc(`${status} This never changes the core Graph configuration.`)
      .addButton((button) => button
        .setButtonText("Import")
        .setCta()
        .onClick(async () => {
          const confirmed = window.confirm(
            "Replace supported Contour Graph settings with the current Core Graph settings?"
          );
          if (!confirmed) return;
          const result = await this.host.importCore();
          if (!result.ok) {
            new Notice(`Contour Graph View: ${result.error}`);
            return;
          }
          new Notice("Contour Graph View: Core Graph settings imported.");
          for (const warning of result.warnings) new Notice(`Contour Graph View: ${warning}`);
          this.renderSettings();
        }));
  }

  private addGraphSettings(): void {
    this.containerEl.createEl("h3", { text: "Graph" });
    this.addToggle("Show tags", "Display tags as graph nodes.", "showTags");
    this.addToggle("Show attachments", "Display linked non-Markdown files.", "showAttachments");
    this.addToggle("Hide unresolved", "Hide links to notes that do not exist.", "hideUnresolved");
    this.addToggle("Show orphans", "Display files with no visible connections.", "showOrphans");
    this.addToggle("Show arrows", "Draw link direction arrows.", "showArrow");

    new Setting(this.containerEl)
      .setName("Search")
      .setDesc("Supports path:, file:, tag:, negation, AND, OR, and parentheses.")
      .addText((text) => text
        .setPlaceholder("path:Projects -tag:archive")
        .setValue(this.host.getSettings().graph.search)
        .onChange((value) => this.updateGraph({ search: value })));

    this.addGraphSlider("Node size", "Scale graph nodes.", "nodeSize", 0.1, 4, 0.1);
    this.addGraphSlider("Line size", "Scale visible graph links.", "lineSize", 0.1, 4, 0.1);
    this.addGraphSlider("Label fade", "Control how early labels appear while zooming.", "textFade", -5, 5, 0.1);
    this.addGraphSlider("Initial scale", "Set the camera scale when the view opens.", "scale", 0.05, 10, 0.05);
    this.addGraphSlider("Center strength", "Pull the layout toward its center.", "centerStrength", 0, 2, 0.02);
    this.addGraphSlider("Repel strength", "Push nodes away from each other.", "repelStrength", 0.1, 40, 0.1);
    this.addGraphSlider("Link strength", "Pull linked nodes together.", "linkStrength", 0.1, 3, 0.05);
    this.addGraphSlider("Link distance", "Set the approximate spacing of linked notes.", "linkDistance", 20, 600, 5);

    let draft = groupText(this.host.getSettings().graph.colorGroups);
    new Setting(this.containerEl)
      .setName("Color groups")
      .setDesc("One search and color per line: path:Projects = #7c3aed")
      .addTextArea((area) => area
        .setPlaceholder("tag:project = #7c3aed")
        .setValue(draft)
        .onChange((value) => {
          draft = value;
        }))
      .addButton((button) => button
        .setButtonText("Apply")
        .onClick(() => {
          const result = parseGroupText(draft);
          if (!result.ok) {
            new Notice(`Contour Graph View: ${result.error}`);
            return;
          }
          this.updateGraph({ colorGroups: result.value });
          new Notice("Contour Graph View: Color groups updated.");
        }));
  }

  private addFolderSettings(): void {
    this.containerEl.createEl("h3", { text: "Folders and contours" });
    new Setting(this.containerEl)
      .setName("Maximum folder depth")
      .setDesc("Draw parent and child contours together up to this depth.")
      .addDropdown((dropdown) => dropdown
        .addOptions({ all: "All", "1": "1", "2": "2", "3": "3", "4": "4" })
        .setValue(this.host.getSettings().folder.maxDepth?.toString() ?? "all")
        .onChange((value) => this.updateFolder({ maxDepth: value === "all" ? null : Number(value) })));

    const excluded = this.host.getSettings().folder.excluded;
    new Setting(this.containerEl)
      .setName("Excluded folders")
      .setDesc(excludedText(excluded))
      .addButton((button) => button
        .setButtonText("Choose")
        .onClick(() => {
          new FolderPicker(this.app, excluded, (folders) => {
            this.updateFolder({ excluded: folders });
            new Notice("Contour Graph View: Excluded folders updated.");
            this.renderSettings();
          }).open();
        }));

    this.addFolderSlider(
      "Folder attraction",
      "Add virtual springs from notes to direct folders and from folders to their parents.",
      "clusterStrength",
      0,
      1,
      0.01
    );
    this.addFolderSlider(
      "Folder separation",
      "Push overlapping, unrelated top-level folder families apart.",
      "separationStrength",
      0,
      0.5,
      0.01
    );
    this.addFolderSlider("Contour opacity", "Set the resting contour opacity.", "contourOpacity", 0, 0.3, 0.01);
    this.addFolderSlider("Contour padding", "Set the space around folder nodes.", "contourPadding", 4, 80, 1);
    this.addFolderSlider("Minimum files", "Only draw contours with at least this many files.", "minNodes", 2, 20, 1);

    let draft = colorText(this.host.getSettings().folder.colors);
    new Setting(this.containerEl)
      .setName("Folder color overrides")
      .setDesc("One folder per line: /Folder = #RRGGBB")
      .addTextArea((area) => area
        .setPlaceholder("/Projects = #7c3aed")
        .setValue(draft)
        .onChange((value) => {
          draft = value;
        }))
      .addButton((button) => button
        .setButtonText("Apply")
        .onClick(() => {
          const result = parseColors(draft);
          if (!result.ok) {
            new Notice(`Contour Graph View: ${result.error}`);
            return;
          }
          this.updateFolder({ colors: result.value });
          new Notice("Contour Graph View: Folder colors updated.");
        }));
  }

  private addToggle(name: string, desc: string, key: keyof Pick<GraphOpts,
    "showTags" | "showAttachments" | "hideUnresolved" | "showOrphans" | "showArrow"
  >): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(desc)
      .addToggle((toggle) => toggle
        .setValue(this.host.getSettings().graph[key])
        .onChange((value) => this.updateGraph({ [key]: value })));
  }

  private addGraphSlider(
    name: string,
    desc: string,
    key: keyof Pick<GraphOpts,
      "nodeSize" | "lineSize" | "textFade" | "scale" | "centerStrength" | "repelStrength"
      | "linkStrength" | "linkDistance"
    >,
    min: number,
    max: number,
    step: number
  ): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(desc)
      .addSlider((slider) => slider
        .setLimits(min, max, step)
        .setValue(this.host.getSettings().graph[key])
        .onChange((value) => this.updateGraph({ [key]: value })));
  }

  private addFolderSlider(
    name: string,
    desc: string,
    key: keyof Pick<FolderOpts,
      "clusterStrength" | "separationStrength" | "contourOpacity" | "contourPadding" | "minNodes"
    >,
    min: number,
    max: number,
    step: number
  ): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(desc)
      .addSlider((slider) => slider
        .setLimits(min, max, step)
        .setValue(this.host.getSettings().folder[key])
        .onChange((value) => this.updateFolder({ [key]: value })));
  }

  private updateGraph(patch: Partial<GraphOpts>): void {
    const settings = this.host.getSettings();
    this.host.setSettings({ ...settings, graph: { ...settings.graph, ...patch } });
  }

  private updateFolder(patch: Partial<FolderOpts>): void {
    const settings = this.host.getSettings();
    this.host.setSettings({ ...settings, folder: { ...settings.folder, ...patch } });
  }
}
