import { build, context } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const vendorDir = path.join(rootDir, 'media', 'vendor');
const watchMode = process.argv.includes('--watch');

async function copyVendorAssets() {
  await mkdir(vendorDir, { recursive: true });

  const copies = [
    ['node_modules/kity/dist/kity.min.js', 'kity.min.js'],
    ['node_modules/kityminder-core/dist/kityminder.core.min.js', 'kityminder.core.min.js'],
    ['node_modules/kityminder-core/dist/kityminder.core.css', 'kityminder.core.css']
  ];

  await Promise.all(
    copies.map(([from, to]) =>
      cp(path.join(rootDir, from), path.join(vendorDir, to), { force: true })
    )
  );
}

async function prepare() {
  await rm(distDir, { recursive: true, force: true });
  await rm(vendorDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
  await copyVendorAssets();
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
