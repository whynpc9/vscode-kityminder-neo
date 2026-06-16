import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { XMIND_IMPORT_LIMITS, importXmindArchive } from '../src/import/xmindImport';

async function buildArchive(files: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [name, value] of Object.entries(files)) {
    zip.file(name, value);
  }
  return zip.generateAsync({ type: 'uint8array' });
}

function buildNestedJsonTopic(depth: number): Record<string, unknown> {
  let topic: Record<string, unknown> = {
    title: `Topic ${depth}`
  };

  for (let index = depth - 1; index >= 0; index -= 1) {
    topic = {
      title: `Topic ${index}`,
      children: {
        attached: [topic]
      }
    };
  }

  return topic;
}

function buildNestedXmlTopic(depth: number): string {
  let xml = '<topic><title>Topic ' + depth + '</title></topic>';
  for (let index = depth - 1; index >= 0; index -= 1) {
    xml = `<topic><title>Topic ${index}</title><children><topics type="attached">${xml}</topics></children></topic>`;
  }
  return xml;
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

  it('rejects oversized compressed content before importing', async () => {
    const archive = await buildArchive({
      'content.json': 'x'.repeat(XMIND_IMPORT_LIMITS.maxContentBytes + 1)
    });

    await expect(importXmindArchive(archive)).rejects.toThrow(/maximum size/);
  });

  it('rejects JSON topic trees that exceed import depth limits', async () => {
    const archive = await buildArchive({
      'content.json': JSON.stringify([
        {
          rootTopic: buildNestedJsonTopic(XMIND_IMPORT_LIMITS.maxTopicDepth + 1)
        }
      ])
    });

    await expect(importXmindArchive(archive)).rejects.toThrow(/maximum depth/);
  });

  it('rejects XML topic trees that exceed import depth limits', async () => {
    const archive = await buildArchive({
      'content.xml': `<?xml version="1.0" encoding="UTF-8"?>
<xmap-content>
  <sheet id="sheet-1">
    ${buildNestedXmlTopic(XMIND_IMPORT_LIMITS.maxTopicDepth + 1)}
  </sheet>
</xmap-content>`
    });

    await expect(importXmindArchive(archive)).rejects.toThrow(/maximum depth/);
  });
});
