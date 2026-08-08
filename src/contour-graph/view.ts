import { ItemView, Notice, setIcon, type WorkspaceLeaf } from "obsidian";
import { VIEW_NAME, VIEW_TYPE } from "./constants";
import { buildGraph } from "./model";
import { GraphRenderer } from "./renderer";
import type { ContourGraphSettings, SavedPoint } from "./types";

export interface ViewHost {
  getSettings: () => ContourGraphSettings;
  savePositions: (positions: Record<string, SavedPoint>) => void;
}

export class ContourGraphView extends ItemView {
  private renderer: GraphRenderer | null = null;
  private stage: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly host: ViewHost) {
    super(leaf);
  }

  override getViewType(): string {
    return VIEW_TYPE;
  }

  override getDisplayText(): string {
    return VIEW_NAME;
  }

  override getIcon(): string {
    return "orbit";
  }

  override onOpen(): Promise<void> {
    this.mountView();
    this.renderGraph();
    return Promise.resolve();
  }

  override onClose(): Promise<void> {
    this.renderer?.kill();
    this.renderer = null;
    this.stage = null;
    return Promise.resolve();
  }

  refresh(): void {
    this.renderGraph();
  }

  private mountView(): void {
    this.contentEl.empty();
    this.contentEl.addClass("contour-graph-view");

    const toolbar = this.contentEl.createDiv({ cls: "contour-graph-toolbar" });
    this.stage = this.contentEl.createDiv({ cls: "contour-graph-stage" });
    this.addButton(toolbar, "refresh-cw", "Rebuild graph", () => this.refresh());
    this.addButton(toolbar, "locate-fixed", "Fit graph", () => this.renderer?.resetCamera());
    this.addButton(toolbar, "play", "Restart layout", () => this.renderer?.restartLayout());
  }

  private renderGraph(): void {
    const stage = this.stage;
    if (stage === null) return;
    const settings = this.host.getSettings();
    const result = buildGraph(this.app, settings);
    if (!result.ok) {
      if (this.renderer === null) this.showError(stage, result.error);
      else new Notice(`Contour Graph View: ${result.error}`);
      return;
    }
    for (const warning of result.warnings) new Notice(`Contour Graph View: ${warning}`);
    if (result.value.nodes.length === 0) {
      this.renderer?.kill();
      this.renderer = null;
      stage.empty();
      this.showError(stage, "No files match the current graph settings.");
      return;
    }

    try {
      if (this.renderer !== null) {
        this.renderer.update(result.value, settings);
        return;
      }
      stage.empty();
      this.renderer = new GraphRenderer(this.app, stage, result.value, settings, {
        savePositions: (positions) => this.host.savePositions(positions),
        showError: (message) => new Notice(`Contour Graph View: ${message}`)
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not start the graph renderer.";
      this.showError(stage, message);
    }
  }

  private addButton(parent: HTMLElement, icon: string, label: string, onClick: () => void): void {
    const button = parent.createEl("button", {
      cls: "clickable-icon contour-graph-tool",
      attr: { "aria-label": label, type: "button" }
    });
    setIcon(button, icon);
    this.registerDomEvent(button, "click", onClick);
  }

  private showError(parent: HTMLElement, message: string): void {
    parent.createDiv({ cls: "contour-graph-error", text: message });
  }
}
