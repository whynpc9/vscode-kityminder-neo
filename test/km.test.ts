import { describe, expect, it } from 'vitest';

import {
  createDefaultKmDocument,
  normalizeKmDocument,
  parseKmDocument,
  stringifyKmDocument
} from '../src/shared/km';

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
});
