import { build } from 'esbuild';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const testDir = path.join(rootDir, 'test');
const harnessJs = path.join(testDir, 'undoRedo.harness.js');

console.log('Building harness bundle…');
await build({
  entryPoints: [path.join(testDir, 'undoRedo.harness.ts')],
  outfile: harnessJs,
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'chrome120',
  logLevel: 'warning',
});

console.log('Starting test server…');
const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const filePath =
    url.pathname === '/' || url.pathname === '/index.html'
      ? path.join(testDir, 'undoRedo.harness.html')
      : path.join(testDir, path.basename(url.pathname));

  import('node:fs/promises')
    .then((fs) => fs.readFile(filePath))
    .then((data) => {
      const ext = path.extname(filePath);
      const type =
        ext === '.html'
          ? 'text/html; charset=utf-8'
          : ext === '.js'
            ? 'text/javascript; charset=utf-8'
            : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type });
      res.end(data);
    })
    .catch(() => {
      res.writeHead(404);
      res.end('Not found');
    });
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') {
  throw new Error('Failed to start test server');
}

const pageUrl = `http://127.0.0.1:${address.port}/`;

console.log(`Opening ${pageUrl} in headless Chromium…`);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.setDefaultTimeout(30_000);

try {
  await page.goto(pageUrl, { waitUntil: 'load', timeout: 30_000 });
  const results = await page.evaluate(() => {
    const run = window.runUndoRedoHarness;
    if (typeof run !== 'function') {
      throw new Error('runUndoRedoHarness is unavailable');
    }
    return run();
  });
  const failed = results.filter((result) => !result.passed);

  for (const result of results) {
    if (result.passed) {
      console.log(`✓ ${result.name}`);
    } else {
      console.error(`✗ ${result.name}`);
      if (result.error) console.error(`  ${result.error}`);
    }
  }

  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
} finally {
  await browser.close();
  server.close();
}
