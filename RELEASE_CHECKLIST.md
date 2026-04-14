# Release Checklist

## Before publishing

- Verify [README.md](/Users/wanghongyi/Projects/vscode-kityminder-neo/README.md) matches current behavior
- Update [CHANGELOG.md](/Users/wanghongyi/Projects/vscode-kityminder-neo/CHANGELOG.md) with the release date and notable changes
- Confirm [package.json](/Users/wanghongyi/Projects/vscode-kityminder-neo/package.json) `version`, `description`, `publisher`, `icon`, and repository links are correct
- Confirm marketplace assets are present:
  - [resources/icon.png](/Users/wanghongyi/Projects/vscode-kityminder-neo/resources/icon.png)
  - optional screenshots/GIFs referenced by the README

## Validation

- Run `npm run check`
- Run `npm run package`
- Install the generated VSIX locally and verify:
  - opening `.km` defaults to text editor
  - `Open Mindmap Editor` opens the visual editor
  - Source Control diff for `.km` stays in JSON text mode
  - `.xmind` import still works

## Publish

- Ensure `vsce` is authenticated for publisher `whynpc9`
- Run `npm run publish:vsce`
- Verify the Marketplace page renders the README and icon correctly
