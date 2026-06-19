# Changelog

## 0.1.3 - 2026-06-19

- Refresh the editor toolbar with grouped node, layout, view, and history controls
- Rework the node popover into a focused property panel with Markdown note editing and preview
- Update release tooling lockfile dependencies to clear current `npm audit` findings

## 0.1.2 - 2026-06-17

- Refresh Marketplace documentation with bilingual README updates and screenshots
- Refactor node property editing into a focused popover panel
- Add readable view zoom mode for quickly returning large maps to a legible canvas

## 0.1.1 - 2026-06-16

- Refresh the sidebar note editing experience and node note indicators
- Render Markdown notes through a safer webview path
- Add archive size and tree-depth limits for `.km` and `.xmind` import paths
- Update package lock dependencies to clear current `npm audit` findings

## 0.1.0 — 2026-04-14

Initial release.

- On-demand visual editor for `.km` (KityMinder) mindmap files
- Interactive canvas: select, drag, inline-edit nodes
- Add child / sibling / parent nodes; delete nodes
- Copy, cut, paste node subtrees (cross-file supported)
- Undo / Redo (up to 50 steps)
- Switch layouts: default (mind map), right, structure (org chart)
- Expand / collapse nodes; expand to level 1 / 2 / 3
- Keyboard navigation and shortcuts
- Search nodes by title or note (Ctrl+F / Cmd+F)
- Sidebar panel for editing node title and note (Markdown)
- Import `.xmind` files and convert to `.km`
- Configurable save-time expand state normalization
- Preserve standard JSON text and diff workflows by default
