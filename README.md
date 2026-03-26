# vscode-kityminder-neo

A minimal VS Code extension for viewing and editing KityMinder `.km` mindmap files, with `.xmind` import support.

## Features

- Open and edit `.km` files in a custom visual editor
- Edit node structure, title, and note
- Expand and collapse nodes
- Switch between `default`, `right`, and `structure` templates
- Reset layout or manually adjust node positions in position mode
- Import `.xmind` files and convert them to `.km`

## Development

```bash
npm install
npm run build
```

Then press `F5` in VS Code to launch an Extension Development Host.

## Validation

```bash
npm run build
npm test
npx tsc --noEmit
```
