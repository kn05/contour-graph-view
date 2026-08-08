# Contour Graph View

Contour Graph View is a desktop-only Obsidian plugin that renders a separate,
folder-aware global graph. It keeps the link-driven graph, adds visible folder
nodes and hierarchy links in the style of Folders to Graph, then partitions one
circular map into mutually exclusive, file-count-weighted folder regions.

## Beta installation with BRAT

1. Install and enable BRAT in Obsidian.
2. Run **BRAT: Add a beta plugin for testing**.
3. Enter `kn05/contour-graph-view`.
4. Enable **Contour Graph View** in Community plugins.

The plugin requires Obsidian 1.8.0 or newer, a desktop client, and WebGL2.

## Usage

Run **Contour Graph View: Open graph** or use the ribbon icon. On the first
load, supported values from the core Global Graph settings become this
plugin's defaults. Later changes are stored independently. Use **Import from
Graph settings** in the plugin settings to import again.

Use **Excluded folders** under **Folders and regions** to keep selected folder
notes and their regular links visible while removing folder nodes, structural
links, and regions for the selected folder subtree.

Folder nodes connect to their direct files and child folders through ordinary
graph links. The region layer never applies layout forces, so the visible
graph structure—not the colored regions—determines where nodes settle. Each
file belongs to exactly one direct-folder region; parent folders no longer add
overlapping translucent layers.

## Development

```bash
npm install
npm run dev
```

For a production build:

```bash
npm run check
```

The BRAT release assets are `main.js`, `manifest.json`, and `styles.css`.

## Privacy

Contour Graph View reads vault metadata and the core graph configuration. It
does not modify notes or core graph settings, and it makes no network requests.

## License

MIT
