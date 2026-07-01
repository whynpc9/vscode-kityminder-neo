import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const scriptPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../scripts/run-undo-redo-browser-test.mjs',
);

describe('MindmapEngine undo/redo (browser harness)', () => {
  it('passes all history operation tests in a real browser', () => {
    let output = '';
    try {
      output = execFileSync(process.execPath, [scriptPath], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      const failed = error as { stdout?: string; stderr?: string; status?: number };
      throw new Error(
        [failed.stdout, failed.stderr].filter(Boolean).join('\n') || 'undo/redo harness failed',
      );
    }

    expect(output).toMatch(/\d+\/\d+ passed/);
    expect(output).not.toMatch(/✗/);
  });
});
