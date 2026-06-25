import { describe, expect, it } from 'vitest';

import {
  decodeExportedImageData,
  normalizeExportBackgroundColor,
  validateExportBackgroundColorInput,
} from '../src/shared/imageExport';

describe('image export helpers', () => {
  it('normalizes transparent and hex background colors', () => {
    expect(normalizeExportBackgroundColor('')).toBeNull();
    expect(normalizeExportBackgroundColor(' transparent ')).toBeNull();
    expect(normalizeExportBackgroundColor('#FFF')).toBe('#fff');
    expect(normalizeExportBackgroundColor('#ffffff')).toBe('#ffffff');
    expect(normalizeExportBackgroundColor('#336699cc')).toBe('#336699cc');
  });

  it('rejects unsupported background color input', () => {
    expect(normalizeExportBackgroundColor('white')).toBeUndefined();
    expect(validateExportBackgroundColorInput('rgb(255, 255, 255)')).toMatch(/十六进制颜色/);
  });

  it('decodes exported text and base64 image data', () => {
    const svg = decodeExportedImageData('<svg></svg>', 'utf8');
    expect(new TextDecoder().decode(svg)).toBe('<svg></svg>');

    const png = decodeExportedImageData('data:image/png;base64,aGVsbG8=', 'base64');
    expect(Buffer.from(png).toString('utf8')).toBe('hello');
  });

  it('rejects invalid base64 image data', () => {
    expect(() => decodeExportedImageData('not base64?', 'base64')).toThrow(/Invalid base64/);
  });
});
