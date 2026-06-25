import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { exportXmindArchive } from '../src/export/xmindExport';
import { importXmindArchive } from '../src/import/xmindImport';

describe('xmind export', () => {
  it('exports a KM document as an importable XMind archive', async () => {
    const archive = await exportXmindArchive({
      root: {
        data: {
          text: 'Root topic',
          note: 'Root note',
        },
        children: [
          {
            data: {
              text: 'Child topic',
            },
            children: [],
          },
        ],
      },
      template: 'default',
      theme: null,
      version: '1.4.50',
    });

    const zip = await JSZip.loadAsync(archive);
    expect(zip.file('content.json')).toBeTruthy();
    expect(zip.file('metadata.json')).toBeTruthy();
    expect(zip.file('manifest.json')).toBeTruthy();

    const imported = await importXmindArchive(archive);
    expect(imported.km.root.data.text).toBe('Root topic');
    expect(imported.km.root.data.note).toBe('Root note');
    expect(imported.km.root.children[0]?.data.text).toBe('Child topic');
  });
});
