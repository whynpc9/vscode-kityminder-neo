import { describe, expect, it } from 'vitest';

import {
  KM_DOCUMENT_LIMITS,
  createDefaultKmDocument,
  normalizeKmDocument,
  parseKmDocument,
  stringifyKmDocument
} from '../src/shared/km';

function buildNestedKmNode(depth: number) {
  let node = {
    data: {
      text: `Node ${depth}`
    },
    children: [] as unknown[]
  };

  for (let index = depth - 1; index >= 0; index -= 1) {
    node = {
      data: {
        text: `Node ${index}`
      },
      children: [node]
    };
  }

  return node;
}

describe('km helpers', () => {
  it('parses and normalizes km documents', () => {
    const document = parseKmDocument(
      JSON.stringify({
        root: {
          data: {
            text: 'Root',
            custom: 'kept'
          }
        }
      })
    );

    expect(document.root.data.text).toBe('Root');
    expect(document.root.data.custom).toBe('kept');
    expect(document.root.children).toEqual([]);
  });

  it('serializes km documents with stable formatting', () => {
    const serialized = stringifyKmDocument(createDefaultKmDocument('Hello'));
    const reparsed = parseKmDocument(serialized);

    expect(reparsed.root.data.text).toBe('Hello');
    expect(serialized.endsWith('\n')).toBe(true);
  });

  it('rejects invalid structures', () => {
    expect(() => normalizeKmDocument({ nope: true })).toThrow(/root/);
    expect(() => parseKmDocument('[]')).toThrow(/KM document/);
  });

  it('rejects documents that exceed parser limits before recursive rendering paths', () => {
    expect(() =>
      normalizeKmDocument({
        root: buildNestedKmNode(KM_DOCUMENT_LIMITS.maxDepth + 1)
      })
    ).toThrow(/maximum KM tree depth/);

    expect(() => parseKmDocument(' '.repeat(KM_DOCUMENT_LIMITS.maxDocumentChars + 1))).toThrow(
      /maximum size/
    );
  });
});
