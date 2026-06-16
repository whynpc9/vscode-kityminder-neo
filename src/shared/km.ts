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

export const KM_DOCUMENT_LIMITS = {
  maxDocumentChars: 5 * 1024 * 1024,
  maxNodes: 10000,
  maxDepth: 200
} as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface NormalizedNodeSeed {
  node: KmNodeJson;
  childrenSource: unknown[];
}

function readKmNode(value: unknown, path: string, depth: number): NormalizedNodeSeed {
  if (depth > KM_DOCUMENT_LIMITS.maxDepth) {
    throw new Error(`${path} exceeds the maximum KM tree depth of ${KM_DOCUMENT_LIMITS.maxDepth}.`);
  }

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
    node: {
      data: { ...value.data },
      children: []
    },
    childrenSource: childrenSource ?? []
  };
}

function normalizeKmNode(value: unknown, path = 'root'): KmNodeJson {
  const rootSeed = readKmNode(value, path, 0);
  let nodeCount = 1;
  const stack = rootSeed.childrenSource.map((child, index) => ({
    value: child,
    parent: rootSeed.node,
    index,
    path: `${path}.children[${index}]`,
    depth: 1
  }));

  while (stack.length > 0) {
    const frame = stack.pop()!;
    nodeCount += 1;
    if (nodeCount > KM_DOCUMENT_LIMITS.maxNodes) {
      throw new Error(`KM document exceeds the maximum node count of ${KM_DOCUMENT_LIMITS.maxNodes}.`);
    }

    const seed = readKmNode(frame.value, frame.path, frame.depth);
    frame.parent.children[frame.index] = seed.node;

    for (let index = seed.childrenSource.length - 1; index >= 0; index -= 1) {
      stack.push({
        value: seed.childrenSource[index],
        parent: seed.node,
        index,
        path: `${frame.path}.children[${index}]`,
        depth: frame.depth + 1
      });
    }
  }

  return rootSeed.node;
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
  if (text.length > KM_DOCUMENT_LIMITS.maxDocumentChars) {
    throw new Error(
      `KM document exceeds the maximum size of ${KM_DOCUMENT_LIMITS.maxDocumentChars} characters.`
    );
  }

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
