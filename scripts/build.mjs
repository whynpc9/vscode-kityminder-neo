import { build, context } from 'esbuild';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const watchMode = process.argv.includes('--watch');

async function prepare() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
}

const sharedBuildOptions = {
  bundle: true,
  sourcemap: true,
  logLevel: 'info',
  color: true
};

const extensionBuild = {
  ...sharedBuildOptions,
  entryPoints: [path.join(rootDir, 'src', 'extension.ts')],
  outfile: path.join(distDir, 'extension.js'),
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode']
};

const webviewBuild = {
  ...sharedBuildOptions,
  entryPoints: [path.join(rootDir, 'src', 'webview', 'index.ts')],
  outfile: path.join(distDir, 'webview.js'),
  platform: 'browser',
  format: 'iife',
  target: 'chrome120',
  loader: {
    '.css': 'css'
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(watchMode ? 'development' : 'production')
  }
};

await prepare();

if (watchMode) {
  const extensionContext = await context(extensionBuild);
  const webviewContext = await context(webviewBuild);
  await Promise.all([extensionContext.watch(), webviewContext.watch()]);
  console.log('Watching extension and webview bundles...');
} else {
  await Promise.all([build(extensionBuild), build(webviewBuild)]);
}
