import { Plugin } from "obsidian";
import { VIEW_TYPE } from "./contour-graph/constants";
import { GraphController } from "./contour-graph/controller";
import { ContourGraphSettingTab } from "./contour-graph/settings-tab";
import { ContourGraphView } from "./contour-graph/view";

export default class ContourGraphPlugin extends Plugin {
  private ctrl: GraphController | null = null;

  override async onload(): Promise<void> {
    const ctrl = new GraphController(this);
    this.ctrl = ctrl;
    await ctrl.load();

    this.registerView(VIEW_TYPE, (leaf) => new ContourGraphView(leaf, {
      getSettings: () => ctrl.getSettings(),
      savePositions: (positions) => ctrl.savePositions(positions)
    }));
    this.addRibbonIcon("orbit", "Open Contour Graph View", () => {
      void this.openGraph();
    });
    this.addCommand({
      id: "open-graph",
      name: "Open graph",
      callback: () => {
        void this.openGraph();
      }
    });
    this.addSettingTab(new ContourGraphSettingTab(this.app, this, {
      getSettings: () => ctrl.getSettings(),
      setSettings: (settings) => ctrl.setSettings(settings),
      importCore: () => ctrl.importCore()
    }));
    ctrl.registerEvents();
  }

  override onunload(): void {
    this.ctrl?.stop();
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
    void this.ctrl?.flush();
    this.ctrl = null;
  }

  private async openGraph(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (existing !== undefined) {
      await this.app.workspace.revealLeaf(existing);
      return;
    }
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }
}
