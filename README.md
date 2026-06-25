# KityMinder Neo

[English](README.md) | [简体中文](README.zh-CN.md)

A VS Code extension for viewing and editing [fex-team/kityminder](https://github.com/fex-team/kityminder) `.km` mindmap files, including files from 百度脑图. KityMinder Neo keeps `.km` files in VS Code's normal JSON text and diff workflow by default, then gives you an on-demand visual editor when you want to work on the map directly.

It also imports `.xmind` files and converts them to `.km`, and can export visual-editor maps as `.png`, `.svg`, or `.xmind`.

## Screenshots

![KityMinder Neo visual editor](media/kityminder-neo-editor.png)

![Search and node notes](media/kityminder-neo-search-note.png)

## Features

- Keep `.km` files in the standard VS Code text editor unless you explicitly open the visual editor.
- Preserve readable JSON diffs for Source Control and compare views.
- Open a `.km` file with the mindmap editor from Explorer, the editor title menu, or the Command Palette.
- Add child, sibling, and parent nodes; delete nodes and subtrees.
- Inline-edit node titles, or edit the selected node title from the node properties panel.
- Drag nodes to reorder them or move them under another parent.
- Copy, cut, and paste subtrees, including across files; plain text paste creates a child node.
- Switch between mind map, right-expand, and org chart layouts.
- Expand or collapse the selected node, expand all, or expand to level 1, 2, or 3.
- Zoom in, zoom out, center content, fit to canvas, or use a readable zoom.
- Search node titles and notes; matching collapsed ancestors are expanded automatically.
- Edit Markdown notes in the node properties panel.
- Show note badges on nodes and render note previews through a safer Markdown path.
- Open the current `.km` source JSON from the visual editor.
- Export from the visual editor as PNG, SVG, or XMind.
- Undo and redo up to 50 editing steps.
- Import `.xmind` archives, with warnings for unsupported XMind features.
- Validate `.km` and `.xmind` inputs with size, node-count, and depth limits.
- Normalize saved expand state to reduce noisy git diffs when desired.

## Installation

Search for **KityMinder Neo** in the VS Code Extensions panel, or install from the command line:

```bash
code --install-extension whynpc9.vscode-kityminder-neo
```

## Quick Start

1. Open a `.km` file normally to view or diff its raw JSON.
2. Launch the visual editor from one of these entry points:
   - Explorer context menu: right-click a `.km` file and choose **Open Mindmap Editor**.
   - Editor title context menu: choose **Open Mindmap Editor**.
   - Command Palette: run **KityMinder Neo: Open Mindmap Editor**.
3. Select a node by clicking it. Use the node properties panel to edit its title and Markdown note.
4. Double-click a node, or press `F2`, to edit its title inline.
5. Press `Tab` to add a child node, or `Enter` to add a sibling node.
6. Import XMind from Explorer by right-clicking a `.xmind` file and choosing **Import XMind to KM**.
7. Export from the visual editor with the download button; PNG and SVG exports can use transparent, white, or custom hex backgrounds.

## Diff Behavior

KityMinder Neo intentionally does not replace VS Code's normal text and diff experience for `.km` files by default.

- Opening `.km` files from Source Control keeps the standard JSON diff view.
- Opening `.km` files from regular file navigation keeps the text editor unless you explicitly choose the mindmap editor.
- If the custom editor is asked to resolve a git virtual document or an active text diff side, it falls back to the plain text editor.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Tab` | Add child node and start editing |
| `Enter` | Add sibling node and start editing |
| `Delete` / `Backspace` | Delete selected node and subtree |
| `F2` | Enter inline title edit |
| `Escape` | Cancel edit, close search, or close the node panel |
| `Space` | Toggle expand or collapse |
| Arrow keys | Navigate between nodes |
| `Alt+Up` / `Alt+Down` | Reorder among siblings |
| `Ctrl/Cmd+C` | Copy selected subtree |
| `Ctrl/Cmd+X` | Cut selected subtree |
| `Ctrl/Cmd+V` | Paste as child |
| `Ctrl/Cmd+Z` | Undo |
| `Ctrl/Cmd+Shift+Z` | Redo |
| `Ctrl/Cmd+Y` | Redo |
| `Ctrl/Cmd+F` | Search titles and notes |
| `Ctrl/Cmd+=` or `Ctrl/Cmd++` | Zoom in |
| `Ctrl/Cmd+-` | Zoom out |
| `Ctrl/Cmd+0` | Fit to canvas |
| `Ctrl/Cmd+1` | Readable view |

## Configuration

| Setting | Default | Description |
|---|---|---|
| `kityminderNeo.saveExpandState` | `preserve` | Controls how node expand and collapse state is written when saving `.km` files. |

`saveExpandState` values:

| Value | Behavior |
|---|---|
| `preserve` | Keep the current expand and collapse state. |
| `expandAll` | Save as fully expanded by removing `expandState`. |
| `level1` | Save with nodes expanded through level 1. |
| `level2` | Save with nodes expanded through level 2. |
| `level3` | Save with nodes expanded through level 3. |

Values other than `preserve` only normalize the saved JSON. You can still expand and collapse freely while editing.

## Development

```bash
npm install
npm run build
```

Press `F5` in VS Code to launch an Extension Development Host.

Run the main checks:

```bash
npm run check
```

## Packaging

Create a local VSIX:

```bash
npm run package
```

Publish to the Visual Studio Marketplace:

```bash
npm run publish:vsce
```

This assumes the publisher is already created and `vsce` is logged in.

## License

[MIT](LICENSE)
