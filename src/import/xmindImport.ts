import { DOMParser } from '@xmldom/xmldom';
import JSZip from 'jszip';

import {
  KM_DOCUMENT_LIMITS,
  KM_VERSION,
  type KmDocumentJson,
  type KmNodeJson
} from '../shared/km';

export interface XMindImportResult {
  km: KmDocumentJson;
  warnings: string[];
}

type JsonTopic = Record<string, unknown>;
type JsonSheet = Record<string, unknown>;

export const XMIND_IMPORT_LIMITS = {
  maxArchiveBytes: 20 * 1024 * 1024,
  maxEntries: 512,
  maxTotalUncompressedBytes: 20 * 1024 * 1024,
  maxContentBytes: KM_DOCUMENT_LIMITS.maxDocumentChars,
  maxTopics: KM_DOCUMENT_LIMITS.maxNodes,
  maxTopicDepth: KM_DOCUMENT_LIMITS.maxDepth
} as const;

const UNSUPPORTED_WARNING_MAP: Record<string, string> = {
  sheetRelationships: 'Ignored XMind relationships.',
  topicSummaries: 'Ignored XMind summaries.',
  topicBoundaries: 'Ignored XMind boundaries.',
  topicMarkers: 'Ignored XMind markers.',
  topicLabels: 'Ignored XMind labels.',
  topicImage: 'Ignored XMind images.',
  topicStyle: 'Ignored XMind styles and appearance metadata.',
  topicLink: 'Ignored XMind hyperlinks.',
  floatingTopics: 'Ignored XMind floating or detached topics.',
  topicExtensions: 'Ignored XMind extensions and advanced metadata.'
};

function asPlainObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray<T = unknown>(value: unknown): T[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? (value as T[]) : [value as T];
}

function addWarning(warnings: Set<string>, key: string) {
  const warning = UNSUPPORTED_WARNING_MAP[key];
  if (warning) {
    warnings.add(warning);
  }
}

function byteLength(data: Uint8Array | ArrayBuffer): number {
  return data.byteLength;
}

function utf8ByteLength(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

function getZipEntryUncompressedSize(entry: JSZip.JSZipObject): number | null {
  const compressedData = (entry as unknown as {
    _data?: {
      uncompressedSize?: unknown;
    };
  })._data;
  return typeof compressedData?.uncompressedSize === 'number'
    ? compressedData.uncompressedSize
    : null;
}

function validateArchiveInput(data: Uint8Array | ArrayBuffer) {
  const size = byteLength(data);
  if (size > XMIND_IMPORT_LIMITS.maxArchiveBytes) {
    throw new Error(`The XMind archive exceeds the maximum size of ${XMIND_IMPORT_LIMITS.maxArchiveBytes} bytes.`);
  }
}

function validateZipEntries(zip: JSZip) {
  let entryCount = 0;
  let declaredUncompressedBytes = 0;

  for (const entry of Object.values(zip.files)) {
    if (entry.dir) {
      continue;
    }

    entryCount += 1;
    if (entryCount > XMIND_IMPORT_LIMITS.maxEntries) {
      throw new Error(`The XMind archive exceeds the maximum file count of ${XMIND_IMPORT_LIMITS.maxEntries}.`);
    }

    const uncompressedSize = getZipEntryUncompressedSize(entry);
    if (uncompressedSize === null) {
      continue;
    }

    declaredUncompressedBytes += uncompressedSize;
    if (declaredUncompressedBytes > XMIND_IMPORT_LIMITS.maxTotalUncompressedBytes) {
      throw new Error(
        `The XMind archive exceeds the maximum uncompressed size of ${XMIND_IMPORT_LIMITS.maxTotalUncompressedBytes} bytes.`
      );
    }
  }
}

async function readContentEntry(entry: JSZip.JSZipObject, fileName: string): Promise<string> {
  const uncompressedSize = getZipEntryUncompressedSize(entry);
  if (uncompressedSize !== null && uncompressedSize > XMIND_IMPORT_LIMITS.maxContentBytes) {
    throw new Error(`The XMind ${fileName} file exceeds the maximum size of ${XMIND_IMPORT_LIMITS.maxContentBytes} bytes.`);
  }

  const text = await entry.async('string');
  if (utf8ByteLength(text) > XMIND_IMPORT_LIMITS.maxContentBytes) {
    throw new Error(`The XMind ${fileName} file exceeds the maximum size of ${XMIND_IMPORT_LIMITS.maxContentBytes} bytes.`);
  }
  return text;
}

function validateTopicTree<T>(
  rootTopic: T,
  getChildren: (topic: T) => T[],
  topicDescription: string
) {
  let topicCount = 0;
  const stack: Array<{ topic: T; depth: number }> = [{ topic: rootTopic, depth: 0 }];

  while (stack.length > 0) {
    const { topic, depth } = stack.pop()!;
    topicCount += 1;
    if (topicCount > XMIND_IMPORT_LIMITS.maxTopics) {
      throw new Error(`The XMind ${topicDescription} tree exceeds the maximum topic count of ${XMIND_IMPORT_LIMITS.maxTopics}.`);
    }
    if (depth > XMIND_IMPORT_LIMITS.maxTopicDepth) {
      throw new Error(`The XMind ${topicDescription} tree exceeds the maximum depth of ${XMIND_IMPORT_LIMITS.maxTopicDepth}.`);
    }

    const children = getChildren(topic);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ topic: children[index], depth: depth + 1 });
    }
  }
}

function directChildElements(element: Element, tagName: string): Element[] {
  const matches: Element[] = [];
  for (let index = 0; index < element.childNodes.length; index += 1) {
    const child = element.childNodes[index];
    if (child.nodeType === child.ELEMENT_NODE && (child as Element).tagName === tagName) {
      matches.push(child as Element);
    }
  }
  return matches;
}

function directChildText(element: Element, tagName: string): string | undefined {
  const child = directChildElements(element, tagName)[0];
  const value = child?.textContent?.trim();
  return value || undefined;
}

function findZipEntry(zip: JSZip, fileName: string): JSZip.JSZipObject | null {
  const direct = zip.file(fileName);
  if (direct) {
    return direct;
  }

  const lower = fileName.toLowerCase();
  for (const [name, entry] of Object.entries(zip.files)) {
    if (name.toLowerCase() === lower) {
      return entry;
    }
  }
  return null;
}

function getJsonSheetList(content: unknown): JsonSheet[] {
  if (Array.isArray(content)) {
    return content.filter((item): item is JsonSheet => Boolean(asPlainObject(item)));
  }

  const object = asPlainObject(content);
  if (!object) {
    return [];
  }

  if (Array.isArray(object.sheets)) {
    return object.sheets.filter((item): item is JsonSheet => Boolean(asPlainObject(item)));
  }

  if (object.rootTopic) {
    return [object];
  }

  return [];
}

function getJsonAttachedChildren(topic: JsonTopic): JsonTopic[] {
  const topicChildren = asPlainObject(topic.children);
  if (!topicChildren) {
    return [];
  }

  const attached = topicChildren.attached;
  if (Array.isArray(attached)) {
    return attached.filter((item): item is JsonTopic => Boolean(asPlainObject(item)));
  }

  const topics = topicChildren.topics;
  const groups = asArray<Record<string, unknown>>(topics);
  const collected: JsonTopic[] = [];

  for (const group of groups) {
    const groupObject = asPlainObject(group);
    if (!groupObject) {
      continue;
    }

    const groupType = String(groupObject.type ?? '');
    if (groupType && groupType !== 'attached') {
      if (groupType === 'detached' || groupType === 'floating') {
        continue;
      }
    }

    for (const topicNode of asArray<JsonTopic>(groupObject.topic ?? groupObject.topics)) {
      if (asPlainObject(topicNode)) {
        collected.push(topicNode);
      }
    }
  }

  return collected;
}

function collectJsonWarnings(sheet: JsonSheet, warnings: Set<string>) {
  if (Array.isArray(sheet.relationships) && sheet.relationships.length > 0) {
    addWarning(warnings, 'sheetRelationships');
  }

  const walk = (topic: JsonTopic) => {
    if (Array.isArray(topic.summaries) && topic.summaries.length > 0) {
      addWarning(warnings, 'topicSummaries');
    }
    if (Array.isArray(topic.boundaries) && topic.boundaries.length > 0) {
      addWarning(warnings, 'topicBoundaries');
    }
    if (Array.isArray(topic.markers) && topic.markers.length > 0) {
      addWarning(warnings, 'topicMarkers');
    }
    if (topic.labels) {
      addWarning(warnings, 'topicLabels');
    }
    if (topic.image) {
      addWarning(warnings, 'topicImage');
    }
    if (topic.style || topic.class || topic.branch || topic.structureClass) {
      addWarning(warnings, 'topicStyle');
    }
    if (topic.href) {
      addWarning(warnings, 'topicLink');
    }
    if (Array.isArray(topic.extensions) && topic.extensions.length > 0) {
      addWarning(warnings, 'topicExtensions');
    }

    const children = asPlainObject(topic.children);
    if (children) {
      const hasFloatingTopics = ['detached', 'floating'].some((key) => asArray(children[key]).length > 0);
      if (hasFloatingTopics) {
        addWarning(warnings, 'floatingTopics');
      }
    }

    for (const child of getJsonAttachedChildren(topic)) {
      walk(child);
    }
  };

  const rootTopic = asPlainObject(sheet.rootTopic);
  if (rootTopic) {
    walk(rootTopic);
  }
}

function convertJsonTopic(topic: JsonTopic): KmNodeJson {
  const noteValue = asPlainObject(topic.notes)?.plain;
  const note =
    typeof noteValue === 'string'
      ? noteValue
      : typeof asPlainObject(noteValue)?.content === 'string'
        ? String(asPlainObject(noteValue)?.content)
        : undefined;

  return {
    data: {
      text: typeof topic.title === 'string' ? topic.title : 'Untitled',
      ...(note ? { note } : {})
    },
    children: getJsonAttachedChildren(topic).map((child) => convertJsonTopic(child))
  };
}

function convertJsonSheet(sheet: JsonSheet, warnings: Set<string>): XMindImportResult {
  const rootTopic = asPlainObject(sheet.rootTopic);
  if (!rootTopic) {
    throw new Error('The XMind content.json file does not contain a root topic.');
  }

  validateTopicTree(rootTopic, getJsonAttachedChildren, 'JSON topic');
  collectJsonWarnings(sheet, warnings);

  return {
    km: {
      root: convertJsonTopic(rootTopic),
      template: 'default',
      theme: null,
      version: KM_VERSION
    },
    warnings: [...warnings]
  };
}

function collectXmlWarnings(rootTopic: Element, sheetElement: Element, warnings: Set<string>) {
  const relationshipNodes = directChildElements(sheetElement, 'relationships');
  if (relationshipNodes.length > 0) {
    addWarning(warnings, 'sheetRelationships');
  }

  const walk = (topicElement: Element) => {
    if (directChildElements(topicElement, 'summaries').length > 0) {
      addWarning(warnings, 'topicSummaries');
    }
    if (directChildElements(topicElement, 'boundaries').length > 0) {
      addWarning(warnings, 'topicBoundaries');
    }
    if (directChildElements(topicElement, 'marker-refs').length > 0) {
      addWarning(warnings, 'topicMarkers');
    }
    if (directChildElements(topicElement, 'labels').length > 0) {
      addWarning(warnings, 'topicLabels');
    }
    if (directChildElements(topicElement, 'xhtml:img').length > 0 || directChildElements(topicElement, 'img').length > 0) {
      addWarning(warnings, 'topicImage');
    }
    if (topicElement.getAttribute('style-id') || topicElement.getAttribute('structure-class')) {
      addWarning(warnings, 'topicStyle');
    }
    if (topicElement.getAttribute('href')) {
      addWarning(warnings, 'topicLink');
    }
    if (directChildElements(topicElement, 'extensions').length > 0) {
      addWarning(warnings, 'topicExtensions');
    }

    const childrenElement = directChildElements(topicElement, 'children')[0];
    if (childrenElement) {
      const floatingGroups = directChildElements(childrenElement, 'topics').filter((group) => {
        const type = group.getAttribute('type');
        return type === 'detached' || type === 'floating';
      });
      if (floatingGroups.length > 0) {
        addWarning(warnings, 'floatingTopics');
      }
    }

    for (const child of getXmlAttachedChildren(topicElement)) {
      walk(child);
    }
  };

  walk(rootTopic);
}

function getXmlAttachedChildren(topicElement: Element): Element[] {
  const childrenElement = directChildElements(topicElement, 'children')[0];
  if (!childrenElement) {
    return [];
  }

  const groups = directChildElements(childrenElement, 'topics').filter((group) => {
    const type = group.getAttribute('type');
    return !type || type === 'attached';
  });

  const attached: Element[] = [];
  for (const group of groups) {
    attached.push(...directChildElements(group, 'topic'));
  }
  return attached;
}

function convertXmlTopic(topicElement: Element): KmNodeJson {
  const noteContainer = directChildElements(topicElement, 'notes')[0];
  const note = noteContainer
    ? directChildText(noteContainer, 'plain') ??
      directChildText(noteContainer, 'content')
    : undefined;

  return {
    data: {
      text: directChildText(topicElement, 'title') ?? 'Untitled',
      ...(note ? { note } : {})
    },
    children: getXmlAttachedChildren(topicElement).map((child) => convertXmlTopic(child))
  };
}

function convertXmlContent(xmlText: string, warnings: Set<string>): XMindImportResult {
  const parser = new DOMParser();
  const document = parser.parseFromString(xmlText, 'application/xml');
  const sheets = Array.from(document.getElementsByTagName('sheet'));

  if (sheets.length === 0) {
    throw new Error('The XMind content.xml file does not contain a sheet.');
  }

  if (sheets.length > 1) {
    warnings.add('Imported only the first XMind sheet. Additional sheets were ignored.');
  }

  const sheetElement = sheets[0];
  const rootTopic = directChildElements(sheetElement, 'topic')[0];
  if (!rootTopic) {
    throw new Error('The XMind content.xml file does not contain a root topic.');
  }

  validateTopicTree(rootTopic, getXmlAttachedChildren, 'XML topic');
  collectXmlWarnings(rootTopic, sheetElement, warnings);

  return {
    km: {
      root: convertXmlTopic(rootTopic),
      template: 'default',
      theme: null,
      version: KM_VERSION
    },
    warnings: [...warnings]
  };
}

export async function importXmindArchive(data: Uint8Array | ArrayBuffer): Promise<XMindImportResult> {
  validateArchiveInput(data);
  const zip = await JSZip.loadAsync(data);
  validateZipEntries(zip);
  const warnings = new Set<string>();

  const jsonEntry = findZipEntry(zip, 'content.json');
  if (jsonEntry) {
    const jsonText = await readContentEntry(jsonEntry, 'content.json');
    const content = JSON.parse(jsonText) as unknown;
    const sheets = getJsonSheetList(content);
    if (sheets.length === 0) {
      throw new Error('The XMind content.json file does not contain any sheets.');
    }
    if (sheets.length > 1) {
      warnings.add('Imported only the first XMind sheet. Additional sheets were ignored.');
    }
    return convertJsonSheet(sheets[0], warnings);
  }

  const xmlEntry = findZipEntry(zip, 'content.xml');
  if (xmlEntry) {
    const xmlText = await readContentEntry(xmlEntry, 'content.xml');
    return convertXmlContent(xmlText, warnings);
  }

  throw new Error('The selected .xmind file does not contain content.json or content.xml.');
}
