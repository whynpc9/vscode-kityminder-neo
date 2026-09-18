// Empirical keyboard test inside the real VS Code workbench (Electron).
// Drives the extension via --extensionDevelopmentPath, focuses the mindmap
// canvas, then presses search/clipboard/zoom/history shortcuts and records
// whether the workbench also reacts (double-dispatch) or steals focus.
//
// Usage: npm run build && node scripts/run-vscode-keyboard-e2e.mjs
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron } from 'playwright';

const root = new URL('../', import.meta.url).pathname;
const vscodeExe = '/Applications/Visual Studio Code.app/Contents/MacOS/Code';

const tmp = mkdtempSync(join(tmpdir(), 'km-e2e-'));
const extensionsDir = join(tmp, 'ext');
const userDataDir = join(tmp, 'user');
const workspaceDir = join(tmp, 'ws');
mkdirSync(join(userDataDir, 'User'), { recursive: true });
mkdirSync(workspaceDir, { recursive: true });

// Open *.km with the custom editor by default.
writeFileSync(
  join(userDataDir, 'User', 'settings.json'),
  JSON.stringify({
    'workbench.editorAssociations': { '*.km': 'kityminder-neo.kmEditor' },
    'window.zoomLevel': 0,
  }),
);
writeFileSync(
  join(workspaceDir, 'test.km'),
  JSON.stringify({
    root: {
      data: { id: 'root', text: 'Root' },
      children: [
        { data: { id: 'alpha', text: 'Alpha' }, children: [] },
        { data: { id: 'beta', text: 'Beta' }, children: [] },
      ],
    },
    template: 'right',
    version: '1.4.43',
  }),
);

console.log('Launching VS Code (Electron)…');
const app = await electron.launch({
  executablePath: vscodeExe,
  args: [
    '--no-sandbox',
    '--disable-updates',
    '--skip-welcome',
    '--skip-release-notes',
    '--disable-workspace-trust',
    '--disable-telemetry',
    '--extensions-dir', extensionsDir,
    '--user-data-dir', userDataDir,
    '--extensionDevelopmentPath', root,
    join(workspaceDir, 'test.km'),
  ],
  timeout: 120_000,
});

const page = await app.firstWindow();
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
};

const getZoomLevel = () =>
  app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((w) => w.webContents.getZoomLevel()));

const activeElementInfo = () =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return 'null';
    return `${el.tagName}.${String(el.className).split(' ').slice(0, 3).join('.')}`;
  });

await page.waitForSelector('.monaco-workbench', { timeout: 60_000 });

// The custom editor content lives in a nested iframe whose URL stays on
// fake.html (content is written via document.write), so poll page.frames().
let view = null;
for (let i = 0; i < 60 && !view; i++) {
  for (const f of page.frames()) {
    if (f.url().includes('fake.html')) {
      try {
        if ((await f.locator('#mindmap-container').count()) > 0) { view = f; break; }
      } catch { /* frame swapped while probing */ }
    }
  }
  if (!view) await page.waitForTimeout(1000);
}
if (!view) {
  console.error('✗ mindmap webview never appeared');
  await app.close();
  process.exit(1);
}
await view.locator('.x6-node[data-cell-id="root"]').waitFor();
console.log('Custom editor webview ready.');

// Keyboard-driven selection keeps the canvas focused without click flakiness.
await view.locator('.x6-node[data-cell-id="root"]').click();
await page.waitForTimeout(300);
const selectedTitle = () => view.locator('#node-title').inputValue();
const zoomText = () => view.locator('#btn-zoom-value').textContent();
const initialZoomText = await zoomText();
const initialWorkbenchZoom = await getZoomLevel();
console.log(`baseline: canvas zoom=${initialZoomText} workbench zoom=${initialWorkbenchZoom} focus=${await activeElementInfo()}`);

// 1. Canvas navigation (root starts selected; 'right' template).
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(200);
check('ArrowRight navigates to first child', (await selectedTitle()) === 'Alpha');
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(200);
check('ArrowDown navigates to next sibling', (await selectedTitle()) === 'Beta');

// 2. Cmd+F must reach the webview search bar despite the preload preempting it.
await page.keyboard.press('Meta+f');
await page.waitForTimeout(400);
check('Cmd+F opens custom search bar', await view.locator('#search-bar').isVisible());
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

// 3. Canvas clipboard: copy Alpha, paste under Root.
await page.keyboard.press('ArrowUp');
await page.waitForTimeout(150);
await page.keyboard.press('ArrowLeft');
await page.waitForTimeout(150);
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(150);
check('selection is Alpha before copy', (await selectedTitle()) === 'Alpha');
await page.keyboard.press('Meta+c');
await page.waitForTimeout(400);
await page.keyboard.press('ArrowLeft'); // back to Root
await page.waitForTimeout(150);
await page.keyboard.press('Meta+v');
await page.waitForTimeout(600);
check('canvas Cmd+C / Cmd+V pastes subtree', (await view.locator('.x6-node').count()) === 4,
  `selected=${await selectedTitle()}`);

// 4. Undo the paste via Cmd+Z (workbench document-level undo).
await page.keyboard.press('Meta+z');
await page.waitForTimeout(600);
check('Cmd+Z undoes the paste', (await view.locator('.x6-node').count()) === 3);

// 5. Bare zoom keys: canvas zooms, focus stays, workbench zoom untouched.
await page.keyboard.press('=');
await page.waitForTimeout(300);
const afterZoomIn = await zoomText();
check('bare = zooms the canvas in', afterZoomIn !== initialZoomText, `${initialZoomText} -> ${afterZoomIn}`);
await page.keyboard.press('-');
await page.waitForTimeout(300);
check('bare - restores canvas zoom', (await zoomText()) === initialZoomText);
await page.keyboard.press('0');
await page.waitForTimeout(300);
await page.keyboard.press('1');
await page.waitForTimeout(300);
check('bare 0/1 (fit/readable) keep focus in editor', /webview/i.test(await activeElementInfo()));
check('bare zoom keys do NOT zoom the whole VS Code UI',
  (await getZoomLevel()).join() === initialWorkbenchZoom.join());

// 6. Cmd+= belongs to the workbench: the canvas must not react.
await page.keyboard.press('Meta+Equal');
await page.waitForTimeout(500);
check('Cmd+= leaves canvas zoom to the workbench', (await zoomText()) === initialZoomText,
  `canvas=${await zoomText()} workbench=${await getZoomLevel()}`);

await app.close();
console.log(failures.length === 0 ? '\nAll VS Code e2e keyboard checks passed' : `\n${failures.length} check(s) failed`);
process.exitCode = failures.length === 0 ? 0 : 1;
