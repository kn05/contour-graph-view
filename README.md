# Contour Graph View

Contour Graph View is a desktop-only Obsidian plugin that renders a separate,
folder-aware global graph. Notes keep their link-driven structure while a
gentle folder force gathers related files into nested, cloud-like contours.

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

Use **Excluded folders** under **Folders and contours** to keep selected folder
notes and their regular links visible while removing folder attraction and
contours for the selected folder subtree.

**Folder attraction** adds virtual springs from notes to their direct folder
and from folders to their parents. These springs do not become graph edges or
increase ForceAtlas2 repulsion, so regular links can pull against them naturally.
**Folder separation** pushes unrelated top-level folder families apart without
forcing sibling subfolders inside the same family away from one another.

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
