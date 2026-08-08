import { Modal, Setting, TFolder, type App } from "obsidian";
import { compactFolders, normalizeFolder } from "./folders";

export class FolderPicker extends Modal {
  private readonly selected: Set<string>;

  constructor(
    app: App,
    current: readonly string[],
    private readonly save: (folders: string[]) => void
  ) {
    super(app);
    this.selected = new Set(current.map(normalizeFolder));
  }

  override onOpen(): void {
    this.setTitle("Excluded folders");
    this.modalEl.addClass("contour-graph-folder-modal");
    this.contentEl.createEl("p", {
      text: "Selected folders and all their descendants stay in the graph, but receive no folder attraction or contour."
    });
    const search = this.contentEl.createEl("input", {
      cls: "contour-graph-folder-search",
      attr: { type: "search", placeholder: "Search folders" }
    });
    const list = this.contentEl.createDiv({ cls: "contour-graph-folder-picker" });
    const folders = this.app.vault.getAllLoadedFiles()
      .filter((file): file is TFolder => file instanceof TFolder && !file.isRoot())
      .map((folder) => normalizeFolder(folder.path))
      .sort((left, right) => left.localeCompare(right));

    const render = (): void => {
      list.empty();
      const query = search.value.trim().toLocaleLowerCase();
      for (const path of folders) {
        if (query.length > 0 && !path.toLocaleLowerCase().includes(query)) continue;
        const row = list.createEl("label", { cls: "contour-graph-folder-option" });
        const checkbox = row.createEl("input", { attr: { type: "checkbox" } });
        checkbox.checked = this.selected.has(path);
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) this.selected.add(path);
          else this.selected.delete(path);
        });
        row.createSpan({ text: path });
      }
      if (list.childElementCount === 0) {
        list.createDiv({ cls: "setting-item-description", text: "No matching folders." });
      }
    };

    search.addEventListener("input", render);
    render();
    new Setting(this.contentEl)
      .addButton((button) => button
        .setButtonText("Clear")
        .onClick(() => {
          this.selected.clear();
          render();
        }))
      .addButton((button) => button
        .setButtonText("Cancel")
        .onClick(() => this.close()))
      .addButton((button) => button
        .setButtonText("Save")
        .setCta()
        .onClick(() => {
          this.save(compactFolders([...this.selected]));
          this.close();
        }));
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}
