import { Graph, Cell, Shape, Path } from '@antv/x6';
import { compactBox as compactBoxLayout } from '@antv/hierarchy';
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

// ── Color palette ─────────────────────────────────────────────────────

const BRANCH_PALETTE = [
  { main: '#3b82f6', light: '#dbeafe', dark: '#1e40af' },
  { main: '#10b981', light: '#d1fae5', dark: '#065f46' },
  { main: '#f59e0b', light: '#fef3c7', dark: '#92400e' },
  { main: '#ef4444', light: '#fee2e2', dark: '#991b1b' },
  { main: '#8b5cf6', light: '#ede9fe', dark: '#5b21b6' },
  { main: '#06b6d4', light: '#cffafe', dark: '#155e75' },
  { main: '#f97316', light: '#ffedd5', dark: '#9a3412' },
  { main: '#ec4899', light: '#fce7f3', dark: '#9d174d' },
];

function branchColor(idx: number) {
  return BRANCH_PALETTE[idx % BRANCH_PALETTE.length];
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
  private _theme: string | null = null;
  private _version: string = KM_VERSION;
  private seq = 0;
  private undoStack: KmDocumentJson[] = [];
  private redoStack: KmDocumentJson[] = [];
  private static readonly MAX_UNDO = 50;

  public onContentChange: (() => void) | null = null;
  public onSelectionChange: ((node: MindmapNode | null) => void) | null = null;

  constructor(container: HTMLElement) {
    this.graph = new Graph({
      container,
      autoResize: true,
      panning: { enabled: true, eventTypes: ['leftMouseDown', 'rightMouseDown'] },
      mousewheel: { enabled: true, factor: 1.04, zoomAtMousePosition: true },
      interacting: { nodeMovable: false },
      connecting: { enabled: false } as Record<string, unknown>,
      background: { color: 'transparent' },
    });
    this.bindGraphEvents();
  }

  // ── Getters ───────────────────────────────────────────────────────

  get template(): TemplateType {
    return this._template;
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
    this.centerContent();
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
    this.graph.dispose();
  }

  // ── Internal: Graph events ────────────────────────────────────────

  private bindGraphEvents() {
    this.graph.on('node:click', ({ node }) => this.selectNode(node.id));
    this.graph.on('node:dblclick', ({ node }) => {
      const n = this.nodeMap.get(node.id);
      if (n && n.children.length > 0) this.toggleCollapse(node.id);
    });
    this.graph.on('blank:click', () => this.selectNode(null));
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

    const hData = this.buildHierData(this.root, 0);
    const isVert = this._template === 'structure';
    const direction =
      this._template === 'right' ? 'LR' : this._template === 'structure' ? 'TB' : 'H';

    const result = compactBoxLayout(hData, {
      direction,
      getWidth: (d: Record<string, unknown>) => (d._w as number) ?? 120,
      getHeight: (d: Record<string, unknown>) => (d._h as number) ?? 40,
      getHGap: (d: Record<string, unknown>) => {
        const depth = (d._depth as number) ?? 0;
        if (isVert) return depth === 0 ? 16 : 10;
        if (depth === 0) return 50;
        if (depth === 1) return 36;
        return Math.max(16, 30 - depth * 3);
      },
      getVGap: (d: Record<string, unknown>) => {
        const depth = (d._depth as number) ?? 0;
        if (isVert) return depth === 0 ? 24 : 14;
        if (depth === 0) return 14;
        if (depth === 1) return 8;
        return 5;
      },
      getSubTreeSep: (d: Record<string, unknown>) => {
        const depth = (d._depth as number) ?? 0;
        if (depth === 0) return 14;
        return 8;
      },
    });

    const cells: Cell[] = [];
    this.collectCells(result as unknown as Record<string, unknown>, cells, 0, -1, isVert);
    this.graph.resetCells(cells);
    this.applySelectionVisual();
  }

  private buildHierData(node: MindmapNode, depth: number): Record<string, unknown> {
    const isRoot = depth === 0;
    const fs = isRoot ? 16 : depth === 1 ? 14 : 13;
    const fw = isRoot ? 700 : depth === 1 ? 600 : 400;
    const tw = textWidth(node.text || ' ', fs, fw);
    const pad = isRoot ? 48 : depth === 1 ? 32 : 24;
    const w = Math.min(260, Math.max(isRoot ? 100 : 56, tw + pad));
    const h = isRoot ? 48 : depth === 1 ? 36 : 30;

    return {
      id: node.id,
      _w: w,
      _h: h,
      _isRoot: isRoot,
      _depth: depth,
      _text: node.text,
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
    const w = ln.width as number;
    const h = ln.height as number;
    const x = (ln.x as number) - w / 2;
    const y = (ln.y as number) - h / 2;
    const nodeText = (ln.data as Record<string, unknown>)?._text as string || '';
    const note = (ln.data as Record<string, unknown>)?._note as string | null;
    const childCount = (ln.data as Record<string, unknown>)?._childCount as number || 0;
    const isCollapsed = (ln.data as Record<string, unknown>)?._collapsed as boolean;
    const style = this.nodeStyle(depth, branch);
    const maxChars = Math.max(6, Math.floor((w - 12) / (depth === 0 ? 10 : 8)));
    let label = nodeText.length > maxChars ? nodeText.slice(0, maxChars - 1) + '…' : nodeText;
    if (isCollapsed && childCount > 0) label += ` [${childCount}]`;

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
          filter: depth === 0 ? 'drop-shadow(0 4px 12px rgba(30,41,59,0.18))' : 'none',
        },
        label: {
          text: label || ' ',
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
      node.attr('body/strokeDasharray', '');
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

  private nodeStyle(depth: number, branch: number) {
    if (depth === 0) {
      return {
        fill: '#1e293b',
        stroke: '#334155',
        strokeWidth: 0,
        rx: 16,
        ry: 16,
        textFill: '#f1f5f9',
        fontSize: 16,
        fontWeight: 700,
      };
    }
    const c = branchColor(branch);
    if (depth === 1) {
      return {
        fill: c.main,
        stroke: c.main,
        strokeWidth: 0,
        rx: 10,
        ry: 10,
        textFill: '#ffffff',
        fontSize: 14,
        fontWeight: 600,
      };
    }
    return {
      fill: c.light,
      stroke: `${c.main}44`,
      strokeWidth: 1,
      rx: 8,
      ry: 8,
      textFill: c.dark,
      fontSize: 13,
      fontWeight: 400,
    };
  }

  private edgeColor(depth: number, branch: number): string {
    const c = branchColor(branch);
    return depth <= 1 ? c.main : `${c.main}88`;
  }

  private applySelectionVisual() {
    for (const cell of this.graph.getNodes()) {
      const d = cell.getData() as { depth: number; branch: number } | undefined;
      const base = this.nodeStyle(d?.depth ?? 0, d?.branch ?? 0);
      cell.attr('body/stroke', base.stroke);
      cell.attr('body/strokeWidth', base.strokeWidth);
    }
    if (this.selectedId) {
      const cell = this.graph.getCellById(this.selectedId);
      if (cell?.isNode()) {
        cell.attr('body/stroke', '#0d9488');
        cell.attr('body/strokeWidth', 3);
      }
    }
  }

  private emitChange() {
    this.onContentChange?.();
  }
}
