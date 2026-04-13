# KityMinder Neo

A VS Code extension for viewing and editing [KityMinder](https://github.com/nickel-org/kityminder) `.km` mindmap files, with `.xmind` import support.

## Features

- Keep `.km` files in VS Code's normal text and diff flows by default
- Open `.km` files in an interactive visual mindmap editor on demand
- Add, delete, drag, and inline-edit nodes on a canvas
- Copy / cut / paste subtrees — works across files
- Switch between **mind map**, **right-expand**, and **org chart** layouts
- Search nodes by title or note content
- Sidebar panel for editing node title and Markdown note
- Undo / Redo (up to 50 steps)
- Import `.xmind` files and convert them to `.km`
- Configurable expand-state normalization on save
- Preserve JSON-based Source Control diffs for `.km` files

## Installation

Search **KityMinder Neo** in the VS Code Extensions panel, or install from the command line:

```bash
code --install-extension whynpc9.vscode-kityminder-neo
```

## Quick Start

1. Open a `.km` file normally to view or diff its raw JSON in the standard text editor.
2. To launch the visual editor, use one of these entry points:
   - Explorer: right-click a `.km` file → *Open Mindmap Editor*
   - Editor title menu: *Open Mindmap Editor*
   - Command palette: `KityMinder Neo: Open Mindmap Editor`
3. **Select** a node by clicking it; navigate with arrow keys.
4. **Edit** a node by double-clicking or pressing `F2`.
5. **Add** a child node with `Tab`, a sibling with `Enter`.
6. **Delete** a node with `Delete` / `Backspace`.
7. **Import XMind**: right-click a `.xmind` file in Explorer → *Import XMind to KM*.

## Diff Behavior

KityMinder Neo intentionally does **not** replace VS Code's normal text/diff experience for `.km` files by default.

- Opening `.km` from Source Control keeps the standard JSON diff view
- Opening `.km` from regular file navigation also stays in the text editor unless you explicitly choose the mindmap editor
- This makes it easier to review structural changes in git using raw JSON

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| Tab | Add child node and edit |
| Enter | Add sibling node and edit |
| Delete / Backspace | Delete selected node and subtree |
| F2 | Enter inline edit |
| Escape | Cancel edit |
| Space | Toggle expand / collapse |
| Arrow keys | Navigate between nodes |
| Alt + Up / Down | Reorder among siblings |
| Ctrl+C / Cmd+C | Copy |
| Ctrl+X / Cmd+X | Cut |
| Ctrl+V / Cmd+V | Paste |
| Ctrl+Z / Cmd+Z | Undo |
| Ctrl+Shift+Z / Cmd+Shift+Z | Redo |
| Ctrl+F / Cmd+F | Search |
| Ctrl+= / Cmd+= | Zoom in |
| Ctrl+- / Cmd+- | Zoom out |
| Ctrl+0 / Cmd+0 | Fit to canvas |

## Configuration

| Setting | Default | Description |
|---|---|---|
| `kityminderNeo.saveExpandState` | `preserve` | How to handle node expand/collapse state when saving |

`saveExpandState` values:

| Value | Behavior |
|---|---|
| `preserve` | Keep current expand/collapse state (default) |
| `expandAll` | Remove all `expandState` — fully expanded on save |
| `level1` | Expand to level 1 on save |
| `level2` | Expand to level 2 on save |
| `level3` | Expand to level 3 on save |

> Values other than `preserve` normalize the `expandState` field in the saved JSON while letting you freely expand/collapse in the editor. Useful when you want to keep expand-state changes out of git diffs.

## Development

```bash
npm install
npm run build
```

Press `F5` in VS Code to launch an Extension Development Host.

```bash
npm run build && npm test && npx tsc --noEmit
```

## License

[MIT](LICENSE)
