export const KM_VERSION = '1.4.50';

export interface KmNodeJson {
  data: Record<string, unknown>;
  children: KmNodeJson[];
}

export interface KmDocumentJson {
  root: KmNodeJson;
  template?: string;
  theme?: string | null;
  version?: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeKmNode(value: unknown, path = 'root'): KmNodeJson {
  if (!isPlainObject(value)) {
    throw new Error(`${path} must be an object.`);
  }

  if (!isPlainObject(value.data)) {
    throw new Error(`${path}.data must be an object.`);
  }

  const childrenSource = value.children;
  if (childrenSource !== undefined && !Array.isArray(childrenSource)) {
    throw new Error(`${path}.children must be an array when present.`);
  }

  return {
    data: { ...value.data },
    children: (childrenSource ?? []).map((child, index) =>
      normalizeKmNode(child, `${path}.children[${index}]`)
    )
  };
}

export function normalizeKmDocument(value: unknown): KmDocumentJson {
  if (!isPlainObject(value)) {
    throw new Error('KM document must be a JSON object.');
  }

  if (!('root' in value)) {
    throw new Error('KM document is missing the root field.');
  }

  return {
    root: normalizeKmNode(value.root),
    template: typeof value.template === 'string' ? value.template : value.template === undefined ? undefined : String(value.template),
    theme:
      value.theme === null || value.theme === undefined
        ? value.theme ?? undefined
        : typeof value.theme === 'string'
          ? value.theme
          : String(value.theme),
    version: typeof value.version === 'string' ? value.version : value.version === undefined ? undefined : String(value.version)
  };
}

export function parseKmDocument(text: string): KmDocumentJson {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON: ${message}`);
  }
  return normalizeKmDocument(parsed);
}

export function createDefaultKmDocument(title = 'Central Topic'): KmDocumentJson {
  return {
    root: {
      data: {
        text: title
      },
      children: []
    },
    template: 'default',
    theme: null,
    version: KM_VERSION
  };
}

export function stringifyKmDocument(document: KmDocumentJson): string {
  const normalized = normalizeKmDocument(document);
  return `${JSON.stringify(
    {
      root: normalized.root,
      template: normalized.template ?? 'default',
      theme: normalized.theme ?? null,
      version: normalized.version ?? KM_VERSION
    },
    null,
    2
  )}\n`;
}
