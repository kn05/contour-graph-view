import { Notice, type Plugin, type TAbstractFile } from "obsidian";
import {
  EVENT_DELAY,
  MAX_POSITIONS,
  SAVE_DELAY,
  VIEW_TYPE
} from "./constants";
import { dropPositions, movePosition } from "./model";
import { applyCoreOpts, loadCoreOpts, migrateSettings, parseSettings } from "./settings";
import type { ContourGraphSettings, GraphOpts, Result, SavedPoint } from "./types";
import { ContourGraphView } from "./view";

export class GraphController {
  private opts = parseSettings(null);
  private refreshTimer: number | null = null;
  private saveTimer: number | null = null;
  private savedJson = "";
  private queuedJson = "";
  private saveTask: Promise<void> = Promise.resolve();
  private isStopped = false;

  constructor(private readonly plugin: Plugin) {}

  async load(): Promise<void> {
    let saved: unknown = null;
    let loadFailed = false;
    try {
      saved = await this.plugin.loadData();
    } catch (cause) {
      loadFailed = true;
      const message = cause instanceof Error ? cause.message : "Unknown read error";
      new Notice(`Contour Graph View: Could not read plugin settings: ${message}. Defaults were restored.`);
    }
    const migrated = migrateSettings(saved);
    const shouldRepair = saved !== null && saved !== undefined && !migrated.ok;
    if (shouldRepair) {
      new Notice(`Contour Graph View: ${migrated.error} Defaults were restored.`);
    }
    this.opts = parseSettings(saved);
    const optsJson = JSON.stringify(this.opts);
    const hasSaved = saved !== null && saved !== undefined;
    const shouldNormalize = loadFailed || (hasSaved && JSON.stringify(saved) !== optsJson);
    this.savedJson = shouldNormalize ? "" : optsJson;
    this.queuedJson = this.savedJson;
    await this.importInitial();
    if (shouldNormalize) await this.flush();
  }

  stop(): void {
    this.isStopped = true;
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.refreshTimer = null;
    this.saveTimer = null;
  }

  getSettings(): ContourGraphSettings {
    return this.opts;
  }

  setSettings(settings: ContourGraphSettings): void {
    this.opts = parseSettings(settings);
    this.scheduleSave();
    this.scheduleRefresh();
  }

  async importCore(): Promise<Result<GraphOpts>> {
    const result = await loadCoreOpts(this.plugin.app);
    if (!result.ok) return result;
    this.opts = applyCoreOpts(this.opts, result.value, Date.now());
    this.scheduleSave();
    this.scheduleRefresh();
    return result;
  }

  savePositions(positions: Record<string, SavedPoint>): void {
    const next = { ...this.opts.positions, ...positions };
    const valid = Object.entries(next)
      .filter(([path]) => this.plugin.app.vault.getAbstractFileByPath(path) !== null)
      .slice(-MAX_POSITIONS);
    this.opts = { ...this.opts, positions: Object.fromEntries(valid) };
    this.scheduleSave();
  }

  registerEvents(): void {
    const app = this.plugin.app;
    this.plugin.registerEvent(app.vault.on("create", () => this.scheduleRefresh()));
    this.plugin.registerEvent(app.vault.on("delete", (file) => this.onDelete(file)));
    this.plugin.registerEvent(app.vault.on("modify", () => this.scheduleRefresh()));
    this.plugin.registerEvent(app.vault.on("rename", (file, oldPath) => this.onRename(file, oldPath)));
    this.plugin.registerEvent(app.metadataCache.on("resolved", () => this.scheduleRefresh()));
    this.plugin.registerEvent(app.workspace.on("css-change", () => this.scheduleRefresh()));
  }

  flush(): Promise<void> {
    const json = JSON.stringify(this.opts);
    if (json === this.savedJson || json === this.queuedJson) return this.saveTask;
    const opts = structuredClone(this.opts);
    this.queuedJson = json;
    this.saveTask = this.saveTask.then(async () => {
      await this.plugin.saveData(opts);
      this.savedJson = json;
    }).catch((cause: unknown) => {
      if (this.queuedJson === json) this.queuedJson = "";
      const message = cause instanceof Error ? cause.message : "Unknown save error";
      new Notice(`Contour Graph View: Could not save settings: ${message}`);
    });
    return this.saveTask;
  }

  private async importInitial(): Promise<void> {
    if (this.opts.didImport) return;
    const result = await loadCoreOpts(this.plugin.app);
    if (!result.ok) return;
    this.opts = applyCoreOpts(this.opts, result.value, Date.now());
    for (const warning of result.warnings) new Notice(`Contour Graph View: ${warning}`);
    await this.flush();
  }

  private scheduleSave(): void {
    if (this.isStopped) return;
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      void this.flush();
    }, SAVE_DELAY);
  }

  private scheduleRefresh(): void {
    if (this.isStopped) return;
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      this.refreshViews();
    }, EVENT_DELAY);
  }

  private refreshViews(): void {
    for (const leaf of this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof ContourGraphView) leaf.view.refresh();
    }
  }

  private onRename(file: TAbstractFile, oldPath: string): void {
    this.opts = {
      ...this.opts,
      positions: movePosition(this.opts.positions, oldPath, file.path)
    };
    this.scheduleSave();
    this.scheduleRefresh();
  }

  private onDelete(file: TAbstractFile): void {
    this.opts = {
      ...this.opts,
      positions: dropPositions(this.opts.positions, file.path)
    };
    this.scheduleSave();
    this.scheduleRefresh();
  }
}
