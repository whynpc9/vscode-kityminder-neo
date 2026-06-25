import type { ExportImageEncoding } from './protocol';

export function normalizeExportBackgroundColor(value: string): string | null | undefined {
  const normalized = value.trim().toLowerCase();
  if (normalized === '' || normalized === 'transparent') {
    return null;
  }
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(normalized)) {
    return normalized;
  }
  return undefined;
}

export function validateExportBackgroundColorInput(value: string): string | undefined {
  return normalizeExportBackgroundColor(value) === undefined
    ? '请输入 transparent 或十六进制颜色，例如 #ffffff。'
    : undefined;
}

export function decodeExportedImageData(data: string, encoding: ExportImageEncoding): Uint8Array {
  if (encoding === 'utf8') {
    return new TextEncoder().encode(data);
  }

  const base64 = data.replace(/^data:image\/png;base64,/i, '').trim();
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 === 1) {
    throw new Error('Invalid base64 image data.');
  }
  return Buffer.from(base64, 'base64');
}
