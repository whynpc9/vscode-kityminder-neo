import { Graph, Cell, Shape, Path } from '@antv/x6';
import { mindmap as mindmapLayout } from '@antv/hierarchy';
import type { KmDocumentJson, KmNodeJson } from '../shared/km';
import { KM_VERSION, createDefaultKmDocument } from '../shared/km';

// ── Types ─────────────────────────────────────────────────────────────

export interface MindmapNode {
  id: string;
  text: string;
  note: string | null;
  collapsed: boolean;
  children: MindmapNode[];
  extra: Record<string, unknown>;
}

export type TemplateType = 'default' | 'right' | 'structure';
export type CatppuccinFlavor = 'latte' | 'frappe' | 'macchiato' | 'mocha';

interface DropTarget {
  type: 'child' | 'before' | 'after';
  targetId: string;
}

// ── Catppuccin palette ───────────────────────────────────────────────

interface CatppuccinColors {
  rosewater: string; flamingo: string; pink: string; mauve: string;
  red: string; maroon: string; peach: string; yellow: string;
  green: string; teal: string; sky: string; sapphire: string;
  blue: string; lavender: string;
  text: string; subtext1: string; subtext0: string;
  overlay2: string; overlay1: string; overlay0: string;
  surface2: string; surface1: string; surface0: string;
  base: string; mantle: string; crust: string;
}

const CATPPUCCIN: Record<CatppuccinFlavor, CatppuccinColors> = {
  latte: {
    rosewater: '#dc8a78', flamingo: '#dd7878', pink: '#ea76cb', mauve: '#8839ef',
    red: '#d20f39', maroon: '#e64553', peach: '#fe640b', yellow: '#df8e1d',
    green: '#40a02b', teal: '#179299', sky: '#04a5e5', sapphire: '#209fb5',
    blue: '#1e66f5', lavender: '#7287fd',
    text: '#4c4f69', subtext1: '#5c5f77', subtext0: '#6c6f85',
    overlay2: '#7c7f93', overlay1: '#8c8fa1', overlay0: '#9ca0b0',
    surface2: '#acb0be', surface1: '#bcc0cc', surface0: '#ccd0da',
    base: '#eff1f5', mantle: '#e6e9ef', crust: '#dce0e8',
  },
  frappe: {
    rosewater: '#f2d5cf', flamingo: '#eebebe', pink: '#f4b8e4', mauve: '#ca9ee6',
    red: '#e78284', maroon: '#ea999c', peach: '#ef9f76', yellow: '#e5c890',
    green: '#a6d189', teal: '#81c8be', sky: '#99d1db', sapphire: '#85c1dc',
    blue: '#8caaee', lavender: '#babbf1',
    text: '#c6d0f5', subtext1: '#b5bfe2', subtext0: '#a5adce',
    overlay2: '#949cbb', overlay1: '#838ba7', overlay0: '#737994',
    surface2: '#626880', surface1: '#51576d', surface0: '#414559',
    base: '#303446', mantle: '#292c3c', crust: '#232634',
  },
  macchiato: {
    rosewater: '#f4dbd6', flamingo: '#f0c6c6', pink: '#f5bde6', mauve: '#c6a0f6',
    red: '#ed8796', maroon: '#ee99a0', peach: '#f5a97f', yellow: '#eed49f',
    green: '#a6da95', teal: '#8bd5ca', sky: '#91d7e3', sapphire: '#7dc4e4',
    blue: '#8aadf4', lavender: '#b7bdf8',
    text: '#cad3f5', subtext1: '#b8c0e0', subtext0: '#a5adcb',
    overlay2: '#939ab7', overlay1: '#8087a2', overlay0: '#6e738d',
    surface2: '#5b6078', surface1: '#494d64', surface0: '#363a4f',
    base: '#24273a', mantle: '#1e2030', crust: '#181926',
  },
  mocha: {
    rosewater: '#f5e0dc', flamingo: '#f2cdcd', pink: '#f5c2e7', mauve: '#cba6f7',
    red: '#f38ba8', maroon: '#eba0ac', peach: '#fab387', yellow: '#f9e2af',
    green: '#a6e3a1', teal: '#94e2d5', sky: '#89dceb', sapphire: '#74c7ec',
    blue: '#89b4fa', lavender: '#b4befe',
    text: '#cdd6f4', subtext1: '#bac2de', subtext0: '#a6adc8',
    overlay2: '#9399b2', overlay1: '#7f849c', overlay0: '#6c7086',
    surface2: '#585b70', surface1: '#45475a', surface0: '#313244',
    base: '#1e1e2e', mantle: '#181825', crust: '#11111b',
  },
};

const FLAVOR_LABELS: Record<CatppuccinFlavor, string> = {
  latte: 'Latte', frappe: 'Frappé', macchiato: 'Macchiato', mocha: 'Mocha',
};

function isLightFlavor(f: CatppuccinFlavor): boolean {
  return f === 'latte';
}

function depthAccentColors(p: CatppuccinColors): string[] {
  return [p.blue, p.green, p.peach, p.mauve, p.pink, p.teal, p.sapphire, p.yellow, p.red, p.lavender, p.flamingo, p.sky];
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function mixColors(c1: string, c2: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(c1);
  const [r2, g2, b2] = hexToRgb(c2);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return `${hex}${a}`;
}

// ── Clipboard format ──────────────────────────────────────────────────

const CLIPBOARD_MARKER = 'kityminder-subtree';

interface ClipboardPayload {
  type: typeof CLIPBOARD_MARKER;
  version: number;
  data: KmNodeJson;
}

// ── Text measurement ──────────────────────────────────────────────────

let _ctx: CanvasRenderingContext2D | null = null;

function textWidth(text: string, size: number, weight: string | number = 400): number {
  if (!_ctx) {
    _ctx = document.createElement('canvas').getContext('2d')!;
  }
  _ctx.font = `${weight} ${size}px "IBM Plex Sans","PingFang SC",system-ui,sans-serif`;
  return Math.ceil(_ctx.measureText(text).width);
}

function wrapText(
  text: string,
  maxWidth: number,
  size: number,
  weight: string | number = 400
): { text: string; lines: number } {
  const sanitized = text.replace(/\t/g, ' ').trim();
  if (!sanitized || maxWidth <= 0) return { text: sanitized || ' ', lines: 1 };
  if (!_ctx) {
    _ctx = document.createElement('canvas').getContext('2d')!;
  }
  _ctx.font = `${weight} ${size}px "IBM Plex Sans","PingFang SC",system-ui,sans-serif`;
  const lines: string[] = [];
  let currentLine = '';
  let currentWidth = 0;

  for (const char of sanitized) {
    const cw = _ctx.measureText(char).width;
    if (currentWidth + cw > maxWidth && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = char;
      currentWidth = cw;
    } else {
      currentLine += char;
      currentWidth += cw;
    }
  }
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }
  if (lines.length === 0) lines.push(sanitized);
  return { text: lines.join('\n'), lines: lines.length };
}

// ── Custom connector ──────────────────────────────────────────────────

Graph.registerConnector(
  'mindmap',
  (s, t, _v, args) => {
    const vertical = (args as Record<string, unknown>).direction === 'vertical';
    const path = new Path();
    path.appendSegment(Path.createSegment('M', s.x, s.y));
    if (vertical) {
      const midY = (s.y + t.y) / 2;
      path.appendSegment(Path.createSegment('C', s.x, midY, t.x, midY, t.x, t.y));
    } else {
      const midX = (s.x + t.x) / 2;
      path.appendSegment(Path.createSegment('C', midX, s.y, midX, t.y, t.x, t.y));
    }
    return path;
  },
  true,
);

// ── Engine ────────────────────────────────────────────────────────────

export class MindmapEngine {
  private graph: Graph;
  private root: MindmapNode | null = null;
  private nodeMap = new Map<string, MindmapNode>();
  private parentMap = new Map<string, MindmapNode>();
  private selectedId: string | null = null;
  private _template: TemplateType = 'default';
  private _flavor: CatppuccinFlavor = 'latte';
  private _theme: string | null = null;
  private _version: string = KM_VERSION;
  private seq = 0;
  private undoStack: KmDocumentJson[] = [];
  private redoStack: KmDocumentJson[] = [];
  private static readonly MAX_UNDO = 50;

  private _container: HTMLElement;

  // Inline editing state
  private _editingId: string | null = null;
  private _editOverlay: HTMLDivElement | null = null;
  private _editInput: HTMLInputElement | null = null;
  private _editOrigText = '';

  // Internal clipboard (VS Code webview clipboard API is unreliable)
  private _clipboard: string | null = null;

  // Drag state
  private _drag: {
    nodeId: string;
    startX: number;
    startY: number;
    active: boolean;
  } | null = null;
  private _dragGhost: HTMLDivElement | null = null;
  private _dropIndicator: HTMLDivElement | null = null;
  private _dropTarget: DropTarget | null = null;
  private _dragNodeRects: Map<string, { x: number; y: number; w: number; h: number }> | null = null;

  public onContentChange: (() => void) | null = null;
  public onSelectionChange: ((node: MindmapNode | null) => void) | null = null;
  public onFlavorChange: ((flavor: CatppuccinFlavor) => void) | null = null;

  constructor(container: HTMLElement) {
    this._container = container;
    this.graph = new Graph({
      container,
      autoResize: true,
      panning: { enabled: true, eventTypes: ['rightMouseDown'] },
      mousewheel: { enabled: true, factor: 1.04, zoomAtMousePosition: true },
      interacting: { nodeMovable: false },
      connecting: { enabled: false } as Record<string, unknown>,
      background: { color: this.pal.base },
    });
    this.bindGraphEvents();
  }

  // ── Getters ───────────────────────────────────────────────────────

  get template(): TemplateType {
    return this._template;
  }

  get flavor(): CatppuccinFlavor {
    return this._flavor;
  }

  private get pal(): CatppuccinColors {
    return CATPPUCCIN[this._flavor];
  }

  setFlavor(f: CatppuccinFlavor) {
    if (this._flavor === f) return;
    this._flavor = f;
    this.applyCanvasBackground();
    this.render();
    this.onFlavorChange?.(f);
  }

  private applyCanvasBackground() {
    const bg = isLightFlavor(this._flavor) ? this.pal.base : this.pal.base;
    this.graph.drawBackground({ color: bg });
  }

  getSelectedNode(): MindmapNode | null {
    return this.selectedId ? (this.nodeMap.get(this.selectedId) ?? null) : null;
  }

  isNodeRoot(id: string): boolean {
    return this.root?.id === id;
  }

  nodeDepth(id: string): number {
    let d = 0;
    let cur = id;
    while (this.parentMap.has(cur)) {
      d++;
      cur = this.parentMap.get(cur)!.id;
    }
    return d;
  }

  // ── Document I/O ──────────────────────────────────────────────────

  importDocument(doc: KmDocumentJson) {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.importDocumentSilent(doc);
    this.zoomToFit();
  }

  exportDocument(): KmDocumentJson {
    if (!this.root) return createDefaultKmDocument();
    return {
      root: this.toKm(this.root),
      template: this._template,
      theme: this._theme,
      version: this._version,
    };
  }

  private importDocumentSilent(doc: KmDocumentJson) {
    const prevSelectedId = this.selectedId;
    this._template = (doc.template as TemplateType) || 'default';
    this._theme = doc.theme ?? null;
    this._version = doc.version ?? KM_VERSION;
    this.nodeMap.clear();
    this.parentMap.clear();
    this.root = this.fromKm(doc.root);
    this.buildIndices(this.root, null);
    this.render();
    const restoreId =
      prevSelectedId && this.nodeMap.has(prevSelectedId)
        ? prevSelectedId
        : (this.root?.id ?? null);
    this.selectNode(restoreId);
  }

  // ── Node operations ───────────────────────────────────────────────

  addChild(text = '新节点') {
    const parent = this.getSelectedNode();
    if (!parent) return;
    this.pushUndo();
    if (parent.collapsed) parent.collapsed = false;
    const child = this.createNode(text);
    parent.children.push(child);
    this.nodeMap.set(child.id, child);
    this.parentMap.set(child.id, parent);
    this.render();
    this.selectNode(child.id);
    this.emitChange();
  }

  addSibling(text = '新节点') {
    const cur = this.getSelectedNode();
    if (!cur) return;
    const parent = this.parentMap.get(cur.id);
    if (!parent) return;
    this.pushUndo();
    const sibling = this.createNode(text);
    const idx = parent.children.indexOf(cur);
    parent.children.splice(idx + 1, 0, sibling);
    this.nodeMap.set(sibling.id, sibling);
    this.parentMap.set(sibling.id, parent);
    this.render();
    this.selectNode(sibling.id);
    this.emitChange();
  }

  addParent(text = '新节点') {
    const cur = this.getSelectedNode();
    if (!cur) return;
    const parent = this.parentMap.get(cur.id);
    if (!parent) return;
    this.pushUndo();
    const wrapper = this.createNode(text);
    wrapper.children.push(cur);
    const idx = parent.children.indexOf(cur);
    parent.children[idx] = wrapper;
    this.nodeMap.set(wrapper.id, wrapper);
    this.parentMap.set(wrapper.id, parent);
    this.parentMap.set(cur.id, wrapper);
    this.render();
    this.selectNode(wrapper.id);
    this.emitChange();
  }

  removeSelected() {
    const cur = this.getSelectedNode();
    if (!cur) return;
    const parent = this.parentMap.get(cur.id);
    if (!parent) return;
    this.pushUndo();
    const idx = parent.children.indexOf(cur);
    parent.children.splice(idx, 1);
    this.purgeIndices(cur);
    this.render();
    this.selectNode(parent.id);
    this.emitChange();
  }

  updateText(text: string) {
    const cur = this.getSelectedNode();
    if (!cur) return;
    this.pushUndo();
    cur.text = text;
    this.render();
    this.emitChange();
  }

  updateNote(note: string | null) {
    const cur = this.getSelectedNode();
    if (!cur) return;
    this.pushUndo();
    cur.note = note;
    this.render();
    this.emitChange();
  }

  // ── Add + Edit (combined operations) ──────────────────────────────

  addChildAndEdit(text = '') {
    const parent = this.getSelectedNode();
    if (!parent) return;
    this.pushUndo();
    if (parent.collapsed) parent.collapsed = false;
    const child = this.createNode(text);
    parent.children.push(child);
    this.nodeMap.set(child.id, child);
    this.parentMap.set(child.id, parent);
    this.render();
    this.selectNode(child.id);
    this.emitChange();
    this._deferStartEditing(child.id);
  }

  addSiblingAndEdit(text = '') {
    const cur = this.getSelectedNode();
    if (!cur) return;
    const parent = this.parentMap.get(cur.id);
    if (!parent) {
      this.startEditing(cur.id);
      return;
    }
    this.pushUndo();
    const sibling = this.createNode(text);
    const idx = parent.children.indexOf(cur);
    parent.children.splice(idx + 1, 0, sibling);
    this.nodeMap.set(sibling.id, sibling);
    this.parentMap.set(sibling.id, parent);
    this.render();
    this.selectNode(sibling.id);
    this.emitChange();
    this._deferStartEditing(sibling.id);
  }

  private _deferStartEditing(id: string, attempt = 0) {
    if (attempt > 10) return;
    setTimeout(() => {
      const rect = this.getNodeContainerRect(id);
      if (rect && rect.w > 0 && rect.h > 0) {
        this.startEditing(id);
      } else {
        this._deferStartEditing(id, attempt + 1);
      }
    }, attempt === 0 ? 50 : 30);
  }

  // ── Inline editing ────────────────────────────────────────────────

  isEditing(): boolean {
    return this._editingId !== null;
  }

  startEditing(id?: string) {
    const targetId = id ?? this.selectedId;
    if (!targetId) return;
    const node = this.nodeMap.get(targetId);
    if (!node) return;

    if (this._editingId) this.commitEdit();
    this.selectNode(targetId);

    const rect = this.getNodeContainerRect(targetId);
    if (!rect) return;

    this._editingId = targetId;
    this._editOrigText = node.text;

    const depth = this.nodeDepth(targetId);
    const fontSize = depth === 0 ? 16 : depth === 1 ? 14 : 13;
    const fontWeight = depth === 0 ? 700 : depth === 1 ? 600 : 400;

    const overlay = document.createElement('div');
    overlay.className = 'km-edit-overlay';
    overlay.style.left = `${rect.x}px`;
    overlay.style.top = `${rect.y}px`;
    overlay.style.width = `${rect.w}px`;
    overlay.style.height = `${rect.h}px`;

    const input = document.createElement('input');
    input.className = 'km-edit-input';
    input.type = 'text';
    input.value = node.text;
    input.style.fontSize = `${fontSize}px`;
    input.style.fontWeight = String(fontWeight);
    input.style.width = `${Math.max(rect.w - 4, 80)}px`;
    input.style.height = `${Math.max(rect.h - 4, 28)}px`;

    const light = isLightFlavor(this._flavor);
    input.style.background = light ? '#fff' : this.pal.surface0;
    input.style.color = this.pal.text;
    input.style.borderColor = this.pal.lavender;

    input.addEventListener('blur', () => {
      setTimeout(() => this.commitEdit(), 0);
    });
    input.addEventListener('keydown', (e) => this._handleEditKeyDown(e));

    overlay.appendChild(input);
    this._container.appendChild(overlay);
    this._editOverlay = overlay;
    this._editInput = input;

    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }

  commitEdit() {
    if (!this._editingId || !this._editInput) return;
    const node = this.nodeMap.get(this._editingId);
    const newText = this._editInput.value.trim() || this._editOrigText;
    const id = this._editingId;
    this._destroyEditOverlay();

    if (node && newText !== node.text) {
      this.pushUndo();
      node.text = newText;
      this.render();
      this.selectNode(id);
      this.emitChange();
    }
  }

  cancelEdit() {
    this._destroyEditOverlay();
  }

  private _destroyEditOverlay() {
    if (this._editOverlay) {
      this._editOverlay.remove();
      this._editOverlay = null;
    }
    this._editInput = null;
    this._editingId = null;
    this._editOrigText = '';
  }

  private _handleEditKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.cancelEdit();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      this.commitEdit();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      const inputVal = this._editInput?.value.trim() || this._editOrigText;
      const editId = this._editingId;
      this._destroyEditOverlay();
      if (editId) {
        const node = this.nodeMap.get(editId);
        if (node && inputVal !== node.text) {
          this.pushUndo();
          node.text = inputVal;
          this.render();
          this.selectNode(editId);
          this.emitChange();
        }
      }
      this.addChildAndEdit();
    }
    e.stopPropagation();
  }

  // ── Clipboard ──────────────────────────────────────────────────────

  async copySelected(): Promise<void> {
    const node = this.getSelectedNode();
    if (!node) return;
    const payload: ClipboardPayload = {
      type: CLIPBOARD_MARKER,
      version: 1,
      data: this.toKm(node),
    };
    const json = JSON.stringify(payload);
    this._clipboard = json;
    try {
      await navigator.clipboard.writeText(json);
    } catch { /* clipboard access denied in webview */ }
  }

  async cutSelected(): Promise<void> {
    const node = this.getSelectedNode();
    if (!node) return;
    if (!this.parentMap.has(node.id)) return;
    await this.copySelected();
    this.removeSelected();
  }

  async pasteAsChild(): Promise<void> {
    const parent = this.getSelectedNode();
    if (!parent) return;

    let text: string | null = null;
    try {
      text = await navigator.clipboard.readText();
    } catch { /* clipboard access denied in webview */ }
    if (!text) text = this._clipboard;
    if (!text) return;

    let kmNode: KmNodeJson | null = null;
    try {
      const parsed = JSON.parse(text);
      if (parsed?.type === CLIPBOARD_MARKER && parsed.data) {
        kmNode = parsed.data as KmNodeJson;
      }
    } catch { /* not JSON – treat as plain text */ }

    this.pushUndo();
    if (parent.collapsed) parent.collapsed = false;

    if (kmNode) {
      const existingIds = new Set(this.nodeMap.keys());
      const child = this.fromKm(kmNode, existingIds);
      parent.children.push(child);
      this.buildIndices(child, parent);
      this.render();
      this.selectNode(child.id);
    } else if (text.trim()) {
      const child = this.createNode(text.trim());
      parent.children.push(child);
      this.nodeMap.set(child.id, child);
      this.parentMap.set(child.id, parent);
      this.render();
      this.selectNode(child.id);
    }
    this.emitChange();
  }

  // ── Navigation ─────────────────────────────────────────────────────

  navigateUp() {
    const cur = this.getSelectedNode();
    if (!cur) { this.selectNode(this.root?.id ?? null); return; }
    const parent = this.parentMap.get(cur.id);
    if (!parent) return;
    const idx = parent.children.indexOf(cur);
    if (idx > 0) {
      this.selectNode(parent.children[idx - 1].id);
    }
  }

  navigateDown() {
    const cur = this.getSelectedNode();
    if (!cur) { this.selectNode(this.root?.id ?? null); return; }
    const parent = this.parentMap.get(cur.id);
    if (!parent) return;
    const idx = parent.children.indexOf(cur);
    if (idx < parent.children.length - 1) {
      this.selectNode(parent.children[idx + 1].id);
    }
  }

  navigateLeft() {
    if (this._template === 'structure') {
      this.navigateUp();
      return;
    }
    const cur = this.getSelectedNode();
    if (!cur) { this.selectNode(this.root?.id ?? null); return; }
    const parent = this.parentMap.get(cur.id);
    if (parent) {
      this.selectNode(parent.id);
    }
  }

  navigateRight() {
    if (this._template === 'structure') {
      this.navigateDown();
      return;
    }
    const cur = this.getSelectedNode();
    if (!cur) { this.selectNode(this.root?.id ?? null); return; }
    if (cur.children.length > 0) {
      if (cur.collapsed) {
        this.expand(cur.id);
      }
      this.selectNode(cur.children[0].id);
    }
  }

  navigateToParent() {
    if (this._template === 'structure') {
      const cur = this.getSelectedNode();
      if (!cur) return;
      const parent = this.parentMap.get(cur.id);
      if (parent) this.selectNode(parent.id);
      return;
    }
    this.navigateLeft();
  }

  navigateToChild() {
    if (this._template === 'structure') {
      const cur = this.getSelectedNode();
      if (!cur) return;
      if (cur.children.length > 0) {
        if (cur.collapsed) this.expand(cur.id);
        this.selectNode(cur.children[0].id);
      }
      return;
    }
    this.navigateRight();
  }

  // ── Reorder (within same parent) ──────────────────────────────────

  moveNodeUp() {
    const cur = this.getSelectedNode();
    if (!cur) return;
    const parent = this.parentMap.get(cur.id);
    if (!parent) return;
    const idx = parent.children.indexOf(cur);
    if (idx <= 0) return;
    this.pushUndo();
    parent.children.splice(idx, 1);
    parent.children.splice(idx - 1, 0, cur);
    this.render();
    this.selectNode(cur.id);
    this.emitChange();
  }

  moveNodeDown() {
    const cur = this.getSelectedNode();
    if (!cur) return;
    const parent = this.parentMap.get(cur.id);
    if (!parent) return;
    const idx = parent.children.indexOf(cur);
    if (idx >= parent.children.length - 1) return;
    this.pushUndo();
    parent.children.splice(idx, 1);
    parent.children.splice(idx + 1, 0, cur);
    this.render();
    this.selectNode(cur.id);
    this.emitChange();
  }

  // ── Undo / Redo ──────────────────────────────────────────────────

  undo(): boolean {
    if (this.undoStack.length === 0) return false;
    this.redoStack.push(this.exportDocument());
    const snapshot = this.undoStack.pop()!;
    this.importDocumentSilent(snapshot);
    this.emitChange();
    return true;
  }

  redo(): boolean {
    if (this.redoStack.length === 0) return false;
    this.undoStack.push(this.exportDocument());
    const snapshot = this.redoStack.pop()!;
    this.importDocumentSilent(snapshot);
    this.emitChange();
    return true;
  }

  private pushUndo() {
    this.undoStack.push(this.exportDocument());
    if (this.undoStack.length > MindmapEngine.MAX_UNDO) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  // ── Selection ─────────────────────────────────────────────────────

  selectNode(id: string | null) {
    if (this.selectedId === id) return;
    this.selectedId = id;
    this.applySelectionVisual();
    this.onSelectionChange?.(this.getSelectedNode());
  }

  // ── View ──────────────────────────────────────────────────────────

  centerContent() {
    this.graph.centerContent({ padding: 80 });
  }

  zoomToFit() {
    this.graph.zoomToFit({ padding: 80, maxScale: 1.5 });
  }

  expand(id?: string) {
    const node = this.nodeMap.get(id ?? this.selectedId ?? '');
    if (!node || !node.collapsed) return;
    this.pushUndo();
    node.collapsed = false;
    this.render();
    this.emitChange();
  }

  collapse(id?: string) {
    const node = this.nodeMap.get(id ?? this.selectedId ?? '');
    if (!node || node.collapsed || node.children.length === 0) return;
    this.pushUndo();
    node.collapsed = true;
    this.render();
    this.emitChange();
  }

  toggleCollapse(id?: string) {
    const node = this.nodeMap.get(id ?? this.selectedId ?? '');
    if (!node || node.children.length === 0) return;
    this.pushUndo();
    node.collapsed = !node.collapsed;
    this.render();
    this.emitChange();
  }

  expandToLevel(level: number) {
    if (!this.root) return;
    this.pushUndo();
    this.walkSetExpand(this.root, 0, level);
    this.render();
    this.emitChange();
  }

  expandAll() {
    this.expandToLevel(9999);
  }

  setTemplate(t: TemplateType) {
    this.pushUndo();
    this._template = t;
    this.render();
    this.centerContent();
    this.emitChange();
  }

  resetLayout() {
    this.pushUndo();
    if (this.root) this.walkClearOffsets(this.root);
    this.render();
    this.centerContent();
    this.emitChange();
  }

  dispose() {
    this._destroyEditOverlay();
    this._endDrag(true);
    this.graph.dispose();
  }

  // ── Drag and Drop ─────────────────────────────────────────────────

  private _initDrag(nodeId: string, clientX: number, clientY: number) {
    if (this.isNodeRoot(nodeId)) return;
    if (this._editingId) return;
    this._drag = { nodeId, startX: clientX, startY: clientY, active: false };

    const onMove = (e: MouseEvent) => this._onDragMove(e);
    const onUp = (e: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      this._onDragEnd(e);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  private _onDragMove(e: MouseEvent) {
    if (!this._drag) return;
    const dx = e.clientX - this._drag.startX;
    const dy = e.clientY - this._drag.startY;

    if (!this._drag.active) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      this._drag.active = true;
      this._startDragVisual();
    }

    if (this._dragGhost) {
      this._dragGhost.style.left = `${e.clientX + 12}px`;
      this._dragGhost.style.top = `${e.clientY}px`;
    }

    this._updateDropTarget(e.clientX, e.clientY);
  }

  private _onDragEnd(_e: MouseEvent) {
    if (!this._drag) return;
    const wasDragging = this._drag.active;
    const dropTarget = this._dropTarget;
    const dragNodeId = this._drag.nodeId;
    this._endDrag(false);

    if (wasDragging && dropTarget) {
      this._moveNodeTo(dragNodeId, dropTarget);
    }
  }

  private _startDragVisual() {
    if (!this._drag) return;
    const node = this.nodeMap.get(this._drag.nodeId);
    if (!node) return;

    const ghost = document.createElement('div');
    ghost.className = 'km-drag-ghost';
    ghost.textContent = node.text || '(empty)';
    document.body.appendChild(ghost);
    this._dragGhost = ghost;

    const indicator = document.createElement('div');
    indicator.className = 'km-drop-indicator';
    indicator.style.display = 'none';
    this._container.appendChild(indicator);
    this._dropIndicator = indicator;

    this._cacheNodeRects(this._drag.nodeId);
  }

  private _endDrag(disposing: boolean) {
    if (this._dragGhost) {
      this._dragGhost.remove();
      this._dragGhost = null;
    }
    if (this._dropIndicator) {
      this._dropIndicator.remove();
      this._dropIndicator = null;
    }
    this._drag = null;
    this._dropTarget = null;
    this._dragNodeRects = null;
  }

  private _cacheNodeRects(excludeId: string) {
    this._dragNodeRects = new Map();
    for (const [id] of this.nodeMap) {
      if (id === excludeId || this._isDescendantOf(id, excludeId)) continue;
      const rect = this.getNodeContainerRect(id);
      if (rect) this._dragNodeRects.set(id, rect);
    }
  }

  private _updateDropTarget(clientX: number, clientY: number) {
    if (!this._drag || !this._dragNodeRects || !this._dropIndicator) return;

    const containerRect = this._container.getBoundingClientRect();
    const cx = clientX - containerRect.left;
    const cy = clientY - containerRect.top;
    const isVert = this._template === 'structure';

    let best: DropTarget | null = null;
    let bestDist = Infinity;

    for (const [id, rect] of this._dragNodeRects) {
      const nodeCx = rect.x + rect.w / 2;
      const nodeCy = rect.y + rect.h / 2;
      const dx = cx - nodeCx;
      const dy = cy - nodeCy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= bestDist || dist > 120) continue;

      const inside = cx >= rect.x && cx <= rect.x + rect.w &&
                     cy >= rect.y && cy <= rect.y + rect.h;

      if (inside) {
        bestDist = dist;
        best = { type: 'child', targetId: id };
      } else if (this.parentMap.has(id)) {
        const edgeDist = isVert
          ? Math.min(Math.abs(cy - rect.y), Math.abs(cy - (rect.y + rect.h)))
          : Math.min(Math.abs(cy - rect.y), Math.abs(cy - (rect.y + rect.h)));

        if (edgeDist < 20) {
          bestDist = dist;
          if (isVert) {
            best = { type: cx < nodeCx ? 'before' : 'after', targetId: id };
          } else {
            best = { type: cy < nodeCy ? 'before' : 'after', targetId: id };
          }
        } else if (dist < 80) {
          bestDist = dist;
          best = { type: 'child', targetId: id };
        }
      }
    }

    this._dropTarget = best;
    this._showDropIndicator(best);
  }

  private _showDropIndicator(target: DropTarget | null) {
    const indicator = this._dropIndicator;
    if (!indicator) return;

    if (!target) {
      indicator.style.display = 'none';
      return;
    }

    const rect = this._dragNodeRects?.get(target.targetId);
    if (!rect) { indicator.style.display = 'none'; return; }

    indicator.style.display = 'block';

    if (target.type === 'child') {
      indicator.className = 'km-drop-indicator km-drop-indicator--child';
      indicator.style.left = `${rect.x - 3}px`;
      indicator.style.top = `${rect.y - 3}px`;
      indicator.style.width = `${rect.w + 6}px`;
      indicator.style.height = `${rect.h + 6}px`;
    } else {
      indicator.className = 'km-drop-indicator km-drop-indicator--line';
      const y = target.type === 'before' ? rect.y - 2 : rect.y + rect.h + 2;
      indicator.style.left = `${rect.x}px`;
      indicator.style.top = `${y}px`;
      indicator.style.width = `${rect.w}px`;
      indicator.style.height = '3px';
    }
  }

  private _moveNodeTo(nodeId: string, target: DropTarget) {
    const node = this.nodeMap.get(nodeId);
    if (!node) return;
    const oldParent = this.parentMap.get(nodeId);
    if (!oldParent) return;
    const targetNode = this.nodeMap.get(target.targetId);
    if (!targetNode) return;
    if (nodeId === target.targetId || this._isDescendantOf(target.targetId, nodeId)) return;

    this.pushUndo();

    const oldIdx = oldParent.children.indexOf(node);
    oldParent.children.splice(oldIdx, 1);

    if (target.type === 'child') {
      if (targetNode.collapsed) targetNode.collapsed = false;
      targetNode.children.push(node);
      this.parentMap.set(nodeId, targetNode);
    } else {
      const newParent = this.parentMap.get(target.targetId);
      if (!newParent) {
        oldParent.children.splice(oldIdx, 0, node);
        return;
      }
      const targetIdx = newParent.children.indexOf(targetNode);
      const insertIdx = target.type === 'before' ? targetIdx : targetIdx + 1;
      newParent.children.splice(insertIdx, 0, node);
      this.parentMap.set(nodeId, newParent);
    }

    this.render();
    this.selectNode(nodeId);
    this.emitChange();
  }

  private _isDescendantOf(nodeId: string, ancestorId: string): boolean {
    let cur = nodeId;
    while (this.parentMap.has(cur)) {
      const p = this.parentMap.get(cur)!;
      if (p.id === ancestorId) return true;
      cur = p.id;
    }
    return false;
  }

  // ── Internal: Coordinate helpers ──────────────────────────────────

  private getNodeContainerRect(nodeId: string): { x: number; y: number; w: number; h: number } | null {
    const cell = this.graph.getCellById(nodeId);
    if (!cell?.isNode()) return null;
    const view = this.graph.findViewByCell(cell);
    if (!view) return null;
    const svgEl = (view as any).container as SVGElement | null;
    if (!svgEl) return null;
    const containerRect = this._container.getBoundingClientRect();
    const nodeRect = svgEl.getBoundingClientRect();
    return {
      x: nodeRect.left - containerRect.left,
      y: nodeRect.top - containerRect.top,
      w: nodeRect.width,
      h: nodeRect.height,
    };
  }

  // ── Internal: Graph events ────────────────────────────────────────

  private bindGraphEvents() {
    this.graph.on('node:click', ({ node }: any) => {
      if (this._drag?.active) return;
      if (this._editingId && this._editingId !== node.id) {
        this.commitEdit();
      }
      this.selectNode(node.id);
    });

    this.graph.on('node:dblclick', ({ node }: any) => {
      this.startEditing(node.id);
    });

    this.graph.on('blank:click', () => {
      if (this._editingId) this.commitEdit();
      this.selectNode(null);
    });

    this.graph.on('node:mousedown', ({ node, e }: any) => {
      const evt = e.originalEvent ?? e;
      const clientX = evt.clientX ?? 0;
      const clientY = evt.clientY ?? 0;
      this._initDrag(node.id, clientX, clientY);
    });
  }

  // ── Internal: Tree ↔ KM ───────────────────────────────────────────

  private fromKm(km: KmNodeJson, seenIds = new Set<string>()): MindmapNode {
    let id = typeof km.data.id === 'string' && km.data.id ? km.data.id : '';
    if (!id || seenIds.has(id)) id = this.genId();
    seenIds.add(id);
    const extra: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(km.data)) {
      if (!['text', 'note', 'id', 'expandState'].includes(k)) extra[k] = v;
    }
    return {
      id,
      text: typeof km.data.text === 'string' ? km.data.text : '',
      note: typeof km.data.note === 'string' ? km.data.note : null,
      collapsed: km.data.expandState === 'collapse',
      children: km.children.map((c) => this.fromKm(c, seenIds)),
      extra,
    };
  }

  private toKm(node: MindmapNode): KmNodeJson {
    const data: Record<string, unknown> = { ...node.extra, id: node.id, text: node.text };
    if (node.note) data.note = node.note;
    if (node.collapsed && node.children.length > 0) data.expandState = 'collapse';
    return { data, children: node.children.map((c) => this.toKm(c)) };
  }

  // ── Internal: Index helpers ───────────────────────────────────────

  private buildIndices(node: MindmapNode, parent: MindmapNode | null) {
    this.nodeMap.set(node.id, node);
    if (parent) this.parentMap.set(node.id, parent);
    for (const c of node.children) this.buildIndices(c, node);
  }

  private purgeIndices(node: MindmapNode) {
    this.nodeMap.delete(node.id);
    this.parentMap.delete(node.id);
    for (const c of node.children) this.purgeIndices(c);
  }

  private genId(): string {
    return `n${Date.now().toString(36)}${(++this.seq).toString(36)}`;
  }

  private createNode(text: string): MindmapNode {
    return { id: this.genId(), text, note: null, collapsed: false, children: [], extra: {} };
  }

  // ── Internal: Walk helpers ────────────────────────────────────────

  private walkSetExpand(node: MindmapNode, depth: number, maxLevel: number) {
    if (node.children.length > 0) node.collapsed = depth >= maxLevel;
    for (const c of node.children) this.walkSetExpand(c, depth + 1, maxLevel);
  }

  private walkClearOffsets(node: MindmapNode) {
    delete node.extra.layout_right_offset;
    delete node.extra.layout_left_offset;
    for (const c of node.children) this.walkClearOffsets(c);
  }

  // ── Internal: Layout + Render ─────────────────────────────────────

  private render() {
    if (!this.root) {
      this.graph.clearCells();
      return;
    }

    const sx = this.graph.transform.getScale().sx;
    const tx = this.graph.transform.getTranslation();

    const hData = this.buildHierData(this.root, 0);
    const isVert = this._template === 'structure';
    const direction =
      this._template === 'right' ? 'LR' : this._template === 'structure' ? 'TB' : 'H';

    const result = mindmapLayout(hData, {
      direction,
      getWidth: (d: Record<string, unknown>) => (d._w as number) ?? 120,
      getHeight: (d: Record<string, unknown>) => (d._h as number) ?? 40,
      getHGap: (d: Record<string, unknown>) => {
        const depth = (d._depth as number) ?? 0;
        if (isVert) return depth === 0 ? 40 : 28;
        if (depth === 0) return 60;
        if (depth === 1) return 36;
        return Math.max(24, 32 - depth * 1);
      },
      getVGap: (d: Record<string, unknown>) => {
        const depth = (d._depth as number) ?? 0;
        if (isVert) return depth === 0 ? 60 : 40;
        if (depth === 0) return 20;
        if (depth === 1) return 14;
        return 10;
      },
      getSubTreeSep: (d: Record<string, unknown>) => {
        const depth = (d._depth as number) ?? 0;
        if (depth === 0) return 24;
        if (depth === 1) return 16;
        return 10;
      },
    });

    const cells: Cell[] = [];
    this.collectCells(result as unknown as Record<string, unknown>, cells, 0, -1, isVert);
    this.graph.resetCells(cells);

    this.graph.zoomTo(sx);
    this.graph.translate(tx.tx, tx.ty);

    this.applySelectionVisual();
  }

  private buildHierData(node: MindmapNode, depth: number): Record<string, unknown> {
    const isRoot = depth === 0;
    const fs = isRoot ? 16 : depth === 1 ? 14 : 13;
    const fw = isRoot ? 700 : depth === 1 ? 600 : 400;
    const sanitizedText = (node.text || ' ').replace(/\t/g, ' ');
    const tw = textWidth(sanitizedText, fs, fw);

    const maxNodeWidth = isRoot ? 420 : depth === 1 ? 340 : 300;
    const minNodeWidth = isRoot ? 140 : depth === 1 ? 120 : 100;
    const padX = isRoot ? 32 : depth === 1 ? 26 : 22;
    const padY = isRoot ? 20 : depth === 1 ? 16 : 14;

    const w = Math.min(maxNodeWidth, Math.max(minNodeWidth, tw + padX));
    const maxTextWidth = Math.max(minNodeWidth - padX, (w - padX) * 0.92);
    const wrapped = wrapText(sanitizedText, maxTextWidth, fs, fw);
    const lineHeight = Math.round(fs * 1.5);
    const h = Math.max(
      isRoot ? 68 : depth === 1 ? 52 : 48,
      wrapped.lines * lineHeight + padY + (depth >= 2 ? 18 : 12)
    );

    return {
      id: node.id,
      _w: w,
      _h: h,
      _padX: padX,
      _isRoot: isRoot,
      _depth: depth,
      _text: wrapped.text,
      _rawText: sanitizedText,
      _note: node.note,
      _childCount: node.children.length,
      _collapsed: node.collapsed,
      children: node.collapsed ? [] : node.children.map((c) => this.buildHierData(c, depth + 1)),
    };
  }

  private collectCells(
    ln: Record<string, unknown>,
    cells: Cell[],
    depth: number,
    branch: number,
    isVert: boolean,
  ) {
    const id = ln.id as string;
    const data = ln.data as Record<string, unknown> | undefined;
    const layoutW = ln.width as number;
    const layoutH = ln.height as number;
    const w = (data?._w as number) ?? layoutW;
    const h = (data?._h as number) ?? layoutH;
    const cx = (ln.x as number) + layoutW / 2;
    const cy = (ln.y as number) + layoutH / 2;
    const x = cx - w / 2;
    const y = cy - h / 2;
    const wrappedText = data?._text as string || '';
    const rawText = data?._rawText as string || wrappedText;
    const note = data?._note as string | null;
    const childCount = (data?._childCount as number) || 0;
    const isCollapsed = data?._collapsed as boolean;
    const style = this.nodeStyle(depth, branch);
    const padX = (data?._padX as number) ?? 8;
    const displayText = isCollapsed && childCount > 0 ? `${rawText} [${childCount}]` : wrappedText;

    const node = new Shape.Rect({
      id,
      x,
      y,
      width: w,
      height: h,
      attrs: {
        body: {
          fill: style.fill,
          stroke: style.stroke,
          strokeWidth: style.strokeWidth,
          rx: style.rx,
          ry: style.ry,
          cursor: 'pointer',
          filter: depth === 0
            ? `drop-shadow(0 4px 12px ${withAlpha(this.pal.crust, 0.35)})`
            : 'none',
        },
        label: {
          ref: 'body',
          refX: 0.5,
          refY: 0.5,
          textAnchor: 'middle',
          textVerticalAnchor: 'middle',
          textWrap: {
            text: displayText || ' ',
            width: -padX,
            height: '100%',
            ellipsis: true,
            breakWord: true,
          },
          fill: style.textFill,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          fontFamily: '"IBM Plex Sans","PingFang SC",system-ui,sans-serif',
          cursor: 'pointer',
        },
      },
      data: { depth, branch, hasNote: Boolean(note) },
    });

    if (note) {
      node.attr('body/strokeDasharray', '3 2');
      node.attr('body/strokeWidth', Math.max(1.5, style.strokeWidth));
    }

    cells.push(node);

    const children = (ln.children as Record<string, unknown>[]) ?? [];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const childBranch = depth === 0 ? i : branch;
      const side = (child.side as string) || 'right';
      const srcAnchor = isVert ? 'bottom' : side === 'left' ? 'left' : 'right';
      const tgtAnchor = isVert ? 'top' : side === 'left' ? 'right' : 'left';
      const edgeColor = this.edgeColor(depth + 1, childBranch);
      const edgeW = Math.max(1.5, 3 - depth * 0.5);

      const edge = new Shape.Edge({
        id: `e_${id}_${child.id as string}`,
        source: { cell: id, anchor: { name: srcAnchor } },
        target: { cell: child.id as string, anchor: { name: tgtAnchor } },
        connector: { name: 'mindmap', args: { direction: isVert ? 'vertical' : 'horizontal' } },
        attrs: {
          line: {
            stroke: edgeColor,
            strokeWidth: edgeW,
            targetMarker: null,
            sourceMarker: null,
          },
        },
        zIndex: -1,
      });

      cells.push(edge);
      this.collectCells(child, cells, depth + 1, childBranch, isVert);
    }
  }

  // ── Internal: Styling ─────────────────────────────────────────────

  private depthColor(depth: number): string {
    const accents = depthAccentColors(this.pal);
    if (depth <= 0) return accents[0];
    return accents[(depth - 1) % accents.length];
  }

  private nodeStyle(depth: number, _branch: number) {
    const p = this.pal;
    const light = isLightFlavor(this._flavor);

    if (depth === 0) {
      return {
        fill: light ? p.text : p.crust,
        stroke: light ? p.subtext0 : p.surface0,
        strokeWidth: 0,
        rx: 16,
        ry: 16,
        textFill: light ? p.base : p.text,
        fontSize: 16,
        fontWeight: 700,
      };
    }

    const accent = this.depthColor(depth);

    if (depth === 1) {
      return {
        fill: accent,
        stroke: accent,
        strokeWidth: 0,
        rx: 10,
        ry: 10,
        textFill: light ? p.base : p.crust,
        fontSize: 14,
        fontWeight: 600,
      };
    }

    const bg = light
      ? mixColors(p.base, accent, 0.12)
      : mixColors(p.surface0, accent, 0.18);

    return {
      fill: bg,
      stroke: withAlpha(accent, 0.35),
      strokeWidth: 1,
      rx: 8,
      ry: 8,
      textFill: light ? p.text : p.text,
      fontSize: 13,
      fontWeight: 400,
    };
  }

  private edgeColor(depth: number, _branch: number): string {
    const accent = this.depthColor(depth);
    return depth <= 1 ? accent : withAlpha(accent, 0.65);
  }

  private applySelectionVisual() {
    const p = this.pal;
    const selectionColor = p.lavender;

    for (const cell of this.graph.getNodes()) {
      const d = cell.getData() as { depth: number; branch: number } | undefined;
      const base = this.nodeStyle(d?.depth ?? 0, d?.branch ?? 0);
      cell.attr('body/stroke', base.stroke);
      cell.attr('body/strokeWidth', base.strokeWidth);
    }
    if (this.selectedId) {
      const cell = this.graph.getCellById(this.selectedId);
      if (cell?.isNode()) {
        cell.attr('body/stroke', selectionColor);
        cell.attr('body/strokeWidth', 3);
      }
    }
  }

  private emitChange() {
    this.onContentChange?.();
  }
}
