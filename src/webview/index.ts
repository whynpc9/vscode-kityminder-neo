import './styles.css';

import { parseKmDocument, stringifyKmDocument } from '../shared/km';
import type { HostToWebviewMessage, WebviewToHostMessage } from '../shared/protocol';
import { MindmapEngine, type MindmapNode, type TemplateType, type SearchResult } from './mindmap-engine';

declare const acquireVsCodeApi: () => {
  postMessage(message: WebviewToHostMessage): void;
  setState(state: unknown): void;
  getState(): unknown;
};

class App {
  private readonly vscode = acquireVsCodeApi();
  private readonly filename = this.el<HTMLDivElement>('filename');
  private readonly warningBanner = this.el<HTMLDivElement>('warning-banner');
  private readonly container = this.el<HTMLDivElement>('mindmap-container');
  private readonly errorOverlay = this.el<HTMLDivElement>('error-overlay');
  private readonly errorMessage = this.el<HTMLParagraphElement>('error-message');
  private readonly titleInput = this.el<HTMLInputElement>('node-title');
  private readonly noteInput = this.el<HTMLTextAreaElement>('node-note');
  private readonly selectionMeta = this.el<HTMLDivElement>('selection-meta');
  private readonly searchBar = this.el<HTMLDivElement>('search-bar');
  private readonly searchInput = this.el<HTMLInputElement>('search-input');
  private readonly searchCount = this.el<HTMLSpanElement>('search-count');
  private readonly templateButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('.tpl-btn'),
  );

  private engine!: MindmapEngine;
  private pendingSync: number | undefined;
  private updatingForm = false;
  private hasValidDocument = false;
  private currentSerialized = '';

  bootstrap() {
    this.engine = new MindmapEngine(this.container);
    this.engine.onContentChange = () => this.scheduleSync();
    this.engine.onSelectionChange = (node) => this.refreshSelection(node);
    this.bindUi();
    window.addEventListener('message', (e: MessageEvent<HostToWebviewMessage>) =>
      this.handleHost(e.data),
    );
    this.vscode.postMessage({ type: 'ready' });
  }

  // ── UI bindings ─────────────────────────────────────────────────

  private bindUi() {
    this.btn('btn-add-child', () => this.engine.addChild('新节点'));
    this.btn('btn-add-sibling', () => this.engine.addSibling('新节点'));
    this.btn('btn-add-parent', () => this.engine.addParent('新节点'));
    this.btn('btn-delete', () => this.engine.removeSelected());
    this.btn('btn-expand', () => this.engine.expand());
    this.btn('btn-collapse', () => this.engine.collapse());
    this.btn('btn-expand-all', () => this.engine.expandAll());
    this.btn('btn-level-1', () => this.engine.expandToLevel(1));
    this.btn('btn-level-2', () => this.engine.expandToLevel(2));
    this.btn('btn-level-3', () => this.engine.expandToLevel(3));
    this.btn('btn-reset-layout', () => this.engine.resetLayout());
    this.btn('btn-zoom-in', () => this.engine.zoomIn());
    this.btn('btn-zoom-out', () => this.engine.zoomOut());
    this.btn('btn-center', () => this.engine.centerContent());
    this.btn('btn-zoom-fit', () => this.engine.zoomToFit());
    this.btn('btn-undo', () => this.engine.undo());
    this.btn('btn-redo', () => this.engine.redo());
    this.btn('btn-search-prev', () => this.searchPrev());
    this.btn('btn-search-next', () => this.searchNext());
    this.btn('btn-search-close', () => this.closeSearch());
    this.btn('btn-open-source', () => this.openSource());
    this.btn('btn-open-source-error', () => this.openSource());

    let searchTimer: number | undefined;
    this.searchInput.addEventListener('input', () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => this.performSearch(), 120);
    });
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) this.searchPrev(); else this.searchNext();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.closeSearch();
      }
    });

    window.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement;
      const isEditInput = target.classList.contains('km-edit-input');
      const isSidebarInput = !isEditInput && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');

      if (isEditInput) return;

      if (this.engine.isEditing()) return;

      if (isSidebarInput) {
        if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); this.engine.undo(); }
        else if (mod && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); this.engine.redo(); }
        else if (mod && e.key === 'y') { e.preventDefault(); this.engine.redo(); }
        return;
      }

      if (mod && e.key === 'f') {
        e.preventDefault(); this.openSearch();
      } else if (mod && (e.key === '=' || e.key === '+')) {
        e.preventDefault(); this.engine.zoomIn();
      } else if (mod && e.key === '-') {
        e.preventDefault(); this.engine.zoomOut();
      } else if (mod && e.key === '0') {
        e.preventDefault(); this.engine.zoomToFit();
      } else if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault(); this.engine.undo();
      } else if (mod && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault(); this.engine.redo();
      } else if (mod && e.key === 'y') {
        e.preventDefault(); this.engine.redo();
      } else if (mod && e.key === 'c') {
        e.preventDefault(); void this.engine.copySelected();
      } else if (mod && e.key === 'x') {
        e.preventDefault(); void this.engine.cutSelected();
      } else if (mod && e.key === 'v') {
        e.preventDefault(); void this.engine.pasteAsChild();
      } else if (e.key === 'Tab') {
        e.preventDefault(); this.engine.addChildAndEdit();
      } else if (e.key === 'Enter') {
        e.preventDefault(); this.engine.addSiblingAndEdit();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault(); this.engine.removeSelected();
      } else if (e.key === 'F2') {
        e.preventDefault(); this.engine.startEditing();
      } else if (e.key === ' ') {
        e.preventDefault(); this.engine.toggleCollapse();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (e.altKey) this.engine.moveNodeUp();
        else if (this.engine.template === 'structure') this.engine.navigateToParent();
        else this.engine.navigateUp();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (e.altKey) this.engine.moveNodeDown();
        else if (this.engine.template === 'structure') this.engine.navigateToChild();
        else this.engine.navigateDown();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (this.engine.template === 'structure') this.engine.navigateUp();
        else this.engine.navigateLeft();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (this.engine.template === 'structure') this.engine.navigateDown();
        else this.engine.navigateRight();
      }
    });

    for (const b of this.templateButtons) {
      b.addEventListener('click', () => {
        const t = b.dataset.template as TemplateType | undefined;
        if (t) this.engine.setTemplate(t);
        this.updateTemplateButtons();
      });
    }

    let titleTimer: number | undefined;
    this.titleInput.addEventListener('input', () => {
      if (this.updatingForm) return;
      window.clearTimeout(titleTimer);
      titleTimer = window.setTimeout(() => this.engine.updateText(this.titleInput.value), 150);
    });

    let noteTimer: number | undefined;
    this.noteInput.addEventListener('input', () => {
      if (this.updatingForm) return;
      window.clearTimeout(noteTimer);
      noteTimer = window.setTimeout(() => {
        const v = this.noteInput.value.trim();
        this.engine.updateNote(v.length > 0 ? this.noteInput.value : null);
      }, 150);
    });
  }

  // ── Host messaging ──────────────────────────────────────────────

  private handleHost(msg: HostToWebviewMessage) {
    switch (msg.type) {
      case 'init':
        this.filename.textContent = msg.filename;
        this.applyConfig(msg.config);
        this.loadDocument(msg.text);
        break;
      case 'documentReplaced':
        this.loadDocument(msg.text);
        break;
      case 'configChanged':
        this.applyConfig(msg.config);
        this.scheduleSync();
        break;
      case 'error':
        this.showError(msg.message);
        break;
      case 'importWarnings':
        this.showWarnings(msg.warnings);
        break;
    }
  }

  private applyConfig(config: { saveExpandState?: string }) {
    if (config.saveExpandState) {
      this.engine.saveExpandState = config.saveExpandState as any;
    }
  }

  private loadDocument(text: string) {
    try {
      const doc = parseKmDocument(text);
      const normalized = stringifyKmDocument(doc);
      if (normalized === this.currentSerialized && this.hasValidDocument) return;
      this.hasValidDocument = true;
      this.hideError();
      this.engine.importDocument(doc);
      this.currentSerialized = stringifyKmDocument(this.engine.exportForSave());
      this.updateTemplateButtons();
    } catch (error) {
      this.hasValidDocument = false;
      this.showError(error instanceof Error ? error.message : String(error));
    }
  }

  // ── Selection state ─────────────────────────────────────────────

  private refreshSelection(node: MindmapNode | null) {
    this.updatingForm = true;
    this.titleInput.disabled = !node;
    this.noteInput.disabled = !node;
    this.titleInput.value = node?.text ?? '';
    this.noteInput.value = node?.note ?? '';
    this.updatingForm = false;

    if (node) {
      const isRoot = this.engine.isNodeRoot(node.id);
      const depth = this.engine.nodeDepth(node.id);
      const kids = node.children.length;
      this.selectionMeta.textContent = `${isRoot ? '根节点' : `层级 ${depth}`} · ${kids} 个子节点`;
    } else {
      this.selectionMeta.textContent = '未选择节点';
    }
  }

  // ── Templates ───────────────────────────────────────────────────

  private updateTemplateButtons() {
    const cur = this.engine.template;
    for (const b of this.templateButtons) {
      b.classList.toggle('active', b.dataset.template === cur);
    }
  }

  // ── Warnings / Errors ─────────────────────────────────────────

  private showWarnings(warnings: string[]) {
    if (warnings.length === 0) {
      this.warningBanner.classList.add('hidden');
      this.warningBanner.textContent = '';
      return;
    }
    this.warningBanner.classList.remove('hidden');
    this.warningBanner.innerHTML = `
      <strong>导入提示</strong>
      <ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>`;
  }

  private showError(message: string) {
    this.errorMessage.textContent = message;
    this.errorOverlay.classList.remove('hidden');
  }

  private hideError() {
    this.errorOverlay.classList.add('hidden');
    this.errorMessage.textContent = '';
  }

  // ── Sync ────────────────────────────────────────────────────────

  private scheduleSync() {
    window.clearTimeout(this.pendingSync);
    this.pendingSync = window.setTimeout(() => {
      if (!this.hasValidDocument) return;
      const serialized = stringifyKmDocument(this.engine.exportForSave());
      if (serialized === this.currentSerialized) return;
      this.currentSerialized = serialized;
      this.vscode.postMessage({ type: 'applyEdit', text: serialized });
    }, 150);
  }

  private openSource() {
    this.vscode.postMessage({ type: 'revealSourceJson' });
  }

  // ── Search ─────────────────────────────────────────────────────

  private openSearch() {
    this.searchBar.classList.remove('hidden');
    this.searchInput.focus();
    this.searchInput.select();
  }

  private closeSearch() {
    this.searchBar.classList.add('hidden');
    this.searchInput.value = '';
    this.searchCount.textContent = '';
    this.engine.clearSearch();
    this.clearNoteHighlight();
  }

  private performSearch() {
    const q = this.searchInput.value;
    if (!q) {
      this.searchCount.textContent = '';
      this.engine.clearSearch();
      this.clearNoteHighlight();
      return;
    }
    this.engine.search(q);
    this.updateSearchDisplay();
  }

  private searchNext() {
    if (this.engine.searchResults.length === 0 && this.searchInput.value) {
      this.performSearch();
      return;
    }
    this.engine.nextSearchResult();
    this.updateSearchDisplay();
  }

  private searchPrev() {
    if (this.engine.searchResults.length === 0 && this.searchInput.value) {
      this.performSearch();
      return;
    }
    this.engine.prevSearchResult();
    this.updateSearchDisplay();
  }

  private updateSearchDisplay() {
    const results = this.engine.searchResults;
    const idx = this.engine.searchIndex;
    if (results.length === 0) {
      this.searchCount.textContent = this.searchInput.value ? '无结果' : '';
    } else {
      this.searchCount.textContent = `${idx + 1} / ${results.length}`;
    }
    this.highlightNoteMatch();
  }

  private highlightNoteMatch() {
    const result = this.engine.getCurrentSearchResult();
    if (!result?.noteMatch) {
      this.clearNoteHighlight();
      return;
    }
    const q = this.engine.searchQuery.toLowerCase();
    const note = this.noteInput.value;
    const pos = note.toLowerCase().indexOf(q);
    if (pos < 0) { this.clearNoteHighlight(); return; }

    this.noteInput.focus();
    this.noteInput.setSelectionRange(pos, pos + q.length);

    const lineHeight = 18;
    const approxLine = note.slice(0, pos).split('\n').length - 1;
    this.noteInput.scrollTop = Math.max(0, approxLine * lineHeight - 30);

    setTimeout(() => this.searchInput.focus(), 80);
  }

  private clearNoteHighlight() {
    this.noteInput.setSelectionRange(0, 0);
  }

  // ── Helpers ─────────────────────────────────────────────────────

  private el<T extends HTMLElement>(id: string): T {
    const e = document.getElementById(id);
    if (!e) throw new Error(`Missing element: ${id}`);
    return e as T;
  }

  private btn(id: string, handler: () => void) {
    this.el<HTMLButtonElement>(id).addEventListener('click', handler);
  }
}

function esc(v: string): string {
  return v
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const __app = new App();
__app.bootstrap();
