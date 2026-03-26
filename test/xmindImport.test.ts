import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { importXmindArchive } from '../src/import/xmindImport';

async function buildArchive(files: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [name, value] of Object.entries(files)) {
    zip.file(name, value);
  }
  return zip.generateAsync({ type: 'uint8array' });
}

describe('xmind import', () => {
  it('imports the first sheet from content.json and maps notes', async () => {
    const archive = await buildArchive({
      'content.json': JSON.stringify([
        {
          title: 'Sheet 1',
          rootTopic: {
            title: 'Root topic',
            notes: {
              plain: {
                content: 'Root note'
              }
            },
            summaries: [{ id: 'summary-1' }],
            children: {
              attached: [
                {
                  title: 'Child topic',
                  href: 'https://example.com'
                }
              ]
            }
          },
          relationships: [{ id: 'rel-1' }]
        },
        {
          title: 'Sheet 2',
          rootTopic: {
            title: 'Ignored topic'
          }
        }
      ])
    });

    const result = await importXmindArchive(archive);

    expect(result.km.root.data.text).toBe('Root topic');
    expect(result.km.root.data.note).toBe('Root note');
    expect(result.km.root.children[0]?.data.text).toBe('Child topic');
    expect(result.warnings).toContain('Imported only the first XMind sheet. Additional sheets were ignored.');
    expect(result.warnings).toContain('Ignored XMind summaries.');
    expect(result.warnings).toContain('Ignored XMind relationships.');
    expect(result.warnings).toContain('Ignored XMind hyperlinks.');
  });

  it('falls back to content.xml when content.json is missing', async () => {
    const archive = await buildArchive({
      'content.xml': `<?xml version="1.0" encoding="UTF-8"?>
<xmap-content>
  <sheet id="sheet-1">
    <topic id="root">
      <title>XML Root</title>
      <notes>
        <plain>XML note</plain>
      </notes>
      <children>
        <topics type="attached">
          <topic id="child-1">
            <title>XML Child</title>
          </topic>
        </topics>
      </children>
    </topic>
  </sheet>
</xmap-content>`
    });

    const result = await importXmindArchive(archive);

    expect(result.km.root.data.text).toBe('XML Root');
    expect(result.km.root.data.note).toBe('XML note');
    expect(result.km.root.children[0]?.data.text).toBe('XML Child');
  });
});
