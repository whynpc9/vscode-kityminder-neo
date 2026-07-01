# Agent Notes

## Release preflight

Use [RELEASE_CHECKLIST.md](/Users/wanghongyi/Projects/vscode-kityminder-neo/RELEASE_CHECKLIST.md) as the human checklist, but run the concrete gates below before publishing a new Marketplace version.

1. Inspect the current release scope.
   - Run `git status --short` and preserve unrelated local changes.
   - Compare local commits and staged/unstaged changes with the current published baseline, usually `origin/main`.
   - Check Marketplace state with `npx @vscode/vsce show whynpc9.vscode-kityminder-neo --json`; avoid republishing an existing version.

2. Generate the changelog from real changes.
   - Start from `git log --oneline origin/main..HEAD`, then include staged and unstaged release changes from `git diff --stat` and `git diff --cached --stat`.
   - Summarize user-facing features and bug fixes in [CHANGELOG.md](/Users/wanghongyi/Projects/vscode-kityminder-neo/CHANGELOG.md) with the release date.
   - Bump with `npm version <version> --no-git-tag-version` so `package.json` and `package-lock.json` stay in sync.

3. Regress the mentioned features and fixes.
   - Run `npm run check`; this covers build, Vitest, and `tsc --noEmit`.
   - When webview history, keyboard handling, drag/drop, or export behavior changed, also run `node scripts/run-undo-redo-browser-test.mjs`.
   - For export changes, verify PNG/SVG browser export behavior and XMind round-trip coverage. Keep generated harness output such as `test/undoRedo.harness.js` out of source control.

4. Run security checks.
   - Run `npm audit --audit-level=moderate` and `npm audit --omit=dev --audit-level=moderate`.
   - Review webview-sensitive paths touched by the release: CSP, `postMessage` request flow, `showSaveDialog`/`workspace.fs.writeFile`, `innerHTML`, safe Markdown rendering, Blob/data URLs, and XMind/JSZip size and depth limits.
   - Treat VS Code or `vsce` `url.parse()` deprecation warnings as toolchain warnings unless `npm audit` or code review identifies a project vulnerability.

5. Package and smoke-test the VSIX.
   - Run `npm run package`.
   - Install the generated VSIX into temporary directories with:
     `tmp_ext=$(mktemp -d /tmp/kityminder-ext-XXXXXX); tmp_user=$(mktemp -d /tmp/kityminder-user-XXXXXX); code --extensions-dir "$tmp_ext" --user-data-dir "$tmp_user" --install-extension vscode-kityminder-neo-<version>.vsix --force`.
   - Confirm with `code --extensions-dir "$tmp_ext" --user-data-dir "$tmp_user" --list-extensions --show-versions` that `whynpc9.vscode-kityminder-neo@<version>` is installed.

6. Publish only after the gates pass.
   - Run `npm run publish:vsce`.
   - The success oracle is the `DONE  Published whynpc9.vscode-kityminder-neo v<version>.` line. Marketplace readback can lag for a few minutes after a successful upload.
