import JSZip from 'jszip';

import { normalizeKmDocument, type KmDocumentJson, type KmNodeJson } from '../shared/km';

interface XmindTopicJson {
  id: string;
  class: 'topic';
  title: string;
  notes?: {
    plain: {
      content: string;
    };
  };
  children?: {
    attached: XmindTopicJson[];
  };
}

interface XmindSheetJson {
  id: string;
  class: 'sheet';
  title: string;
  rootTopic: XmindTopicJson;
}

export async function exportXmindArchive(document: KmDocumentJson): Promise<Uint8Array> {
  const normalized = normalizeKmDocument(document);
  let sequence = 0;

  const rootTopic = toXmindTopic(normalized.root, () => {
    sequence += 1;
    return `topic-${sequence}`;
  });
  const sheet: XmindSheetJson = {
    id: 'sheet-1',
    class: 'sheet',
    title: rootTopic.title || 'Sheet 1',
    rootTopic,
  };
  const metadata = {
    creator: {
      name: 'vscode-kityminder-neo',
    },
    dataStructureVersion: '2',
  };
  const manifest = {
    'file-entries': {
      'content.json': {},
      'metadata.json': {},
    },
  };

  const zip = new JSZip();
  zip.file('content.json', JSON.stringify([sheet]));
  zip.file('metadata.json', JSON.stringify(metadata));
  zip.file('manifest.json', JSON.stringify(manifest));
  return zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
}

function toXmindTopic(node: KmNodeJson, nextId: () => string): XmindTopicJson {
  const note = readString(node.data.note);
  const children = node.children.map((child) => toXmindTopic(child, nextId));
  const topic: XmindTopicJson = {
    id: nextId(),
    class: 'topic',
    title: readString(node.data.text) ?? 'Untitled',
  };

  if (note) {
    topic.notes = {
      plain: {
        content: note,
      },
    };
  }
  if (children.length > 0) {
    topic.children = {
      attached: children,
    };
  }

  return topic;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
