import './styles.css';

import { parseKmDocument, stringifyKmDocument } from '../shared/km';
import type { HostToWebviewMessage, WebviewToHostMessage } from '../shared/protocol';
import { MindmapEngine, type MindmapNode, type TemplateType, type SearchResult } from './mindmap-engine';
import { renderSafeMarkdown } from './safeMarkdown';
import { getHistoryShortcut, isImeCompositionKeyEvent } from './keyboard';

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
  private readonly noteStats = this.el<HTMLSpanElement>('note-stats');
  private readonly nodeName = this.el<HTMLDivElement>('node-name');
  private readonly notePreview = this.el<HTMLDivElement>('node-preview');
  private readonly noteTabs = this.el<HTMLDivElement>('note-tabs');
  private readonly noteToolbar = this.el<HTMLDivElement>('note-toolbar');
  private readonly segLevel = this.el<HTMLDivElement>('seg-level');
  private readonly zoomValue = this.el<HTMLButtonElement>('btn-zoom-value');
  private readonly canvasArea = this.el<HTMLDivElement>('canvas-area');
  private readonly popover = this.el<HTMLDivElement>('node-popover');
  private readonly popoverPinBtn = this.el<HTMLButtonElement>('btn-popover-pin');
  private readonly breadcrumb = this.el<HTMLSpanElement>('node-breadcrumb');
  private readonly searchBar = this.el<HTMLDivElement>('search-bar');
  private readonly searchInput = this.el<HTMLInputElement>('search-input');
  private readonly searchCount = this.el<HTMLSpanElement>('search-count');
  private readonly toolbarNav = document.querySelector<HTMLElement>('.top-bar-toolbar')!;
  private readonly toolbarMoreBtn = this.el<HTMLButtonElement>('btn-toolbar-more');
  private readonly toolbarMenu = this.el<HTMLDivElement>('toolbar-menu');
  private readonly toolbarMenuDynamic = this.el<HTMLDivElement>('toolbar-menu-dynamic');
  private readonly toolbarSlots = Array.from(
    document.querySelectorAll<HTMLElement>('.top-bar-toolbar .toolbar-slot'),
  );
  private readonly templateButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('.tpl-btn'),
  );

  private engine!: MindmapEngine;
  private pendingSync: number | undefined;
  private formEditTimer: number | undefined;
  private pendingFormEdits = new Map<'title' | 'note', () => void>();
  private updatingForm = false;
  private hasValidDocument = false;
  private currentSerialized = '';
  private popoverPinned = false;
  private toolbarMenuOpen = false;
  private readonly narrowMq = window.matchMedia('(max-width: 900px)');
  private selectedNodeId: string | null = null;
  private filePath = '';
  private noteTab: 'edit' | 'preview' = 'edit';

  bootstrap() {
    this.engine = new MindmapEngine(this.container);
    this.engine.onContentChange = () => {
      this.refreshTopBarTitle();
      this.refreshNodeContext();
      this.scheduleSync();
    };
    this.engine.onSelectionChange = (node) => this.refreshSelection(node);
    this.engine.onViewChange = () => this.updateZoomDisplay();
    this.container.tabIndex = 0;
    this.bindUi();
    this.setupToolbarOverflow();
    this.narrowMq.addEventListener('change', () => {
      this.syncPinnedLayout(!this.popover.hidden);
    });
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
    this.btn('btn-expand', () => { this.engine.expand(); this.setActiveLevel(null); });
    this.btn('btn-collapse', () => { this.engine.collapse(); this.setActiveLevel(null); });
    this.btn('btn-expand-all', () => { this.engine.expandAll(); this.setActiveLevel('all'); });
    this.btn('btn-level-1', () => { this.engine.expandToLevel(1); this.setActiveLevel('1'); });
    this.btn('btn-level-2', () => { this.engine.expandToLevel(2); this.setActiveLevel('2'); });
    this.btn('btn-level-3', () => { this.engine.expandToLevel(3); this.setActiveLevel('3'); });
    this.btn('btn-reset-layout', () => this.engine.resetLayout());
    this.btn('btn-zoom-in', () => this.engine.zoomIn());
    this.btn('btn-zoom-out', () => this.engine.zoomOut());
    this.btn('btn-zoom-value', () => this.engine.zoomToReadable());
    this.btn('btn-center', () => this.engine.centerContent());
    this.btn('btn-zoom-readable', () => this.engine.zoomToReadable());
    this.btn('btn-zoom-fit', () => this.engine.zoomToFit());
    this.btn('btn-undo', () => this.applyHistory('undo'));
    this.btn('btn-redo', () => this.applyHistory('redo'));
    this.btn('btn-search-prev', () => this.searchPrev());
    this.btn('btn-search-next', () => this.searchNext());
    this.btn('btn-search-close', () => this.closeSearch());
    this.btn('btn-open-source', () => this.openSource());
    this.btn('btn-open-source-error', () => this.openSource());
    this.btn('btn-export-image', () => this.requestExportFile());
    this.btn('btn-popover-close', () => this.closePopover());
    this.btn('btn-popover-pin', () => this.togglePopoverPin());

    this.popover.addEventListener('mousedown', (e) => e.stopPropagation());

    let searchTimer: number | undefined;
    this.searchInput.addEventListener('input', () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => this.performSearch(), 120);
    });
    this.searchInput.addEventListener('keydown', (e) => {
      // Keep native text editing keys away from the mindmap shortcuts.
      e.stopPropagation();
      if (isImeCompositionKeyEvent(e)) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) this.searchPrev(); else this.searchNext();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.closeSearch();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (isImeCompositionKeyEvent(e)) return;
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.km-edit-input') || this.engine.isEditing()) return;

      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      // VS Code's webview preload calls preventDefault() on find/undo/save/print
      // and (on desktop) copy/cut/paste chords before they reach this handler,
      // routing them through the workbench — which no-ops for this custom editor.
      // We still own find and canvas clipboard chords, so only respect
      // `defaultPrevented` for keys outside that set. Undo/redo stay with the
      // workbench, which performs them as document-level edits.
      const isPreemptedCanvasChord =
        mod && !e.altKey && !e.shiftKey && ['f', 'c', 'x', 'v'].includes(key);
      if (e.defaultPrevented && !isPreemptedCanvasChord) return;

      // With no valid document (error overlay), leave all keys to the page so
      // Tab navigation and the fallback button stay reachable.
      if (!this.hasValidDocument) return;

      const history = getHistoryShortcut(e);
      const isPopoverInput = this.popover.contains(target);
      const isTextInput = target.closest('input, textarea, select') ||
        (target instanceof HTMLElement && target.isContentEditable);

      if (mod && !e.altKey && !e.shiftKey && key === 'f') {
        e.preventDefault(); this.openSearch();
        return;
      }
      if (isPopoverInput) {
        if (history) { e.preventDefault(); this.applyHistory(history); }
        else if (e.key === 'Escape' && !mod && !e.altKey && !e.shiftKey) {
          e.preventDefault();
          this.container.focus();
        }
        return;
      }
      if (isTextInput) return;

      if (history) {
        e.preventDefault(); this.applyHistory(history);
      } else if (mod && !e.altKey) {
        if (!e.shiftKey && key === 'c') {
          e.preventDefault(); void this.engine.copySelected();
        } else if (!e.shiftKey && key === 'x') {
          e.preventDefault(); void this.engine.cutSelected();
        } else if (!e.shiftKey && key === 'v') {
          e.preventDefault(); void this.engine.pasteAsChild();
        }
      } else if (mod) {
        return;
      // Zoom uses bare keys: Cmd/Ctrl+=/-/0/1 are owned by the workbench
      // (window zoom, sidebar/editor-group focus) and would double-fire.
      } else if (!e.altKey && (key === '=' || key === '+' || key === '-')) {
        e.preventDefault();
        if (key === '-') this.engine.zoomOut(); else this.engine.zoomIn();
      } else if (!e.altKey && !e.shiftKey && key === '1') {
        e.preventDefault(); this.engine.zoomToReadable();
      } else if (!e.altKey && !e.shiftKey && key === '0') {
        e.preventDefault(); this.engine.zoomToFit();
      } else if (e.shiftKey) {
        return;
      } else if (e.key === 'Escape' && !e.altKey) {
        if (this.toolbarMenuOpen) {
          e.preventDefault();
          this.setToolbarMenuOpen(false);
          this.toolbarMoreBtn.focus();
        } else if (!this.searchBar.classList.contains('hidden')) {
          e.preventDefault(); this.closeSearch();
        } else if (this.engine.getSelectedNode()) {
          e.preventDefault(); this.closePopover();
          this.container.focus();
        }
      } else if (target.closest('button, a[href], [role="button"], [role="link"]')) {
        // Let focused controls activate and participate in native Tab navigation.
        return;
      } else if (e.altKey) {
        if (e.key === 'ArrowUp') { e.preventDefault(); this.engine.moveNodeUp(); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); this.engine.moveNodeDown(); }
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
        if (this.engine.template === 'structure') this.engine.navigateToParent();
        else this.engine.navigateUp();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (this.engine.template === 'structure') this.engine.navigateToChild();
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

    this.titleInput.addEventListener('input', () => {
      if (this.updatingForm) return;
      this.nodeName.textContent = this.titleInput.value.trim() || '（无标题）';
      const id = this.selectedNodeId;
      const value = this.titleInput.value;
      this.queueFormEdit('title', () => this.engine.updateText(value, id));
    });

    this.noteInput.addEventListener('input', () => {
      this.updateNoteStats();
      if (this.noteTab === 'preview') this.renderNotePreview();
      if (this.updatingForm) return;
      const id = this.selectedNodeId;
      const value = this.noteInput.value;
      this.queueFormEdit('note', () => this.engine.updateNote(value.trim() ? value : null, id));
    });
    this.titleInput.addEventListener('blur', () => this.flushFormEdits());
    this.noteInput.addEventListener('blur', () => this.flushFormEdits());

    this.noteTabs.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('.md-tab') as HTMLElement | null;
      const tab = t?.dataset.tab;
      if (tab === 'edit' || tab === 'preview') this.setNoteTab(tab);
    });

    this.noteToolbar.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('.md-btn') as HTMLElement | null;
      if (b?.dataset.md) this.applyMarkdown(b.dataset.md);
    });
  }

  private queueFormEdit(field: 'title' | 'note', apply: () => void) {
    this.pendingFormEdits.set(field, apply);
    window.clearTimeout(this.formEditTimer);
    this.formEditTimer = window.setTimeout(() => this.flushFormEdits(), 150);
  }

  private flushFormEdits() {
    window.clearTimeout(this.formEditTimer);
    const edits = [...this.pendingFormEdits.values()];
    this.pendingFormEdits.clear();
    for (const apply of edits) apply();
  }

  private applyHistory(action: 'undo' | 'redo') {
    this.flushFormEdits();
    this.engine[action]();
  }

  // ── Expand-level segmented control ──────────────────────────────

  private setActiveLevel(level: string | null) {
    for (const el of this.segLevel.querySelectorAll<HTMLElement>('.seg-item[data-level]')) {
      el.classList.toggle('active', level !== null && el.dataset.level === level);
    }
  }

  // ── Toolbar overflow menu ───────────────────────────────────────

  private setupToolbarOverflow() {
    const topBar = this.toolbarNav.closest('.top-bar');
    if (topBar) {
      new ResizeObserver(() => this.layoutToolbar()).observe(topBar);
    }
    this.layoutToolbar();

    this.toolbarMoreBtn.addEventListener('click', () =>
      this.setToolbarMenuOpen(!this.toolbarMenuOpen),
    );
    // Capture phase so clicks inside the popover (which stops propagation)
    // still dismiss the menu.
    document.addEventListener('mousedown', (e) => {
      if (!this.toolbarMenuOpen) return;
      const t = e.target;
      if (
        t instanceof Node &&
        !this.toolbarMenu.contains(t) &&
        !this.toolbarMoreBtn.contains(t)
      ) {
        this.setToolbarMenuOpen(false);
      }
    }, true);
    this.toolbarMenu.addEventListener('click', (e) => {
      // Menus close after the chosen action runs (this bubbles up last).
      const b = (e.target as HTMLElement).closest('button');
      if (b && b !== this.toolbarMoreBtn) this.setToolbarMenuOpen(false);
    });
  }

  private setToolbarMenuOpen(open: boolean) {
    this.toolbarMenuOpen = open;
    this.toolbarMenu.classList.toggle('hidden', !open);
    this.toolbarMoreBtn.classList.toggle('active', open);
    this.toolbarMoreBtn.setAttribute('aria-expanded', String(open));
  }

  /** Keeps as many toolbar groups visible as fit; moves the rest into the ⋯ menu. */
  private layoutToolbar() {
    for (const slot of this.toolbarSlots) this.toolbarNav.appendChild(slot);
    const available = this.toolbarNav.clientWidth;
    let used = 0;
    let fitCount = this.toolbarSlots.length;
    for (let i = 0; i < this.toolbarSlots.length; i++) {
      used += this.toolbarSlots[i].offsetWidth + 2;
      if (used > available) {
        fitCount = i;
        break;
      }
    }
    for (let i = fitCount; i < this.toolbarSlots.length; i++) {
      this.toolbarMenuDynamic.appendChild(this.toolbarSlots[i]);
    }
    this.toolbarMoreBtn.classList.toggle('has-items', fitCount < this.toolbarSlots.length);
  }

  // ── Markdown note editor ────────────────────────────────────────

  private setNoteTab(tab: 'edit' | 'preview') {
    this.noteTab = tab;
    for (const el of this.noteTabs.querySelectorAll<HTMLElement>('.md-tab')) {
      el.classList.toggle('active', el.dataset.tab === tab);
    }
    if (tab === 'preview') {
      this.renderNotePreview();
      this.noteInput.classList.add('hidden');
      this.notePreview.classList.remove('hidden');
    } else {
      this.notePreview.classList.add('hidden');
      this.noteInput.classList.remove('hidden');
    }
  }

  private renderNotePreview() {
    const value = this.noteInput.value;
    if (!value.trim()) {
      this.notePreview.innerHTML = '<p class="note-empty">暂无备注</p>';
      return;
    }
    this.notePreview.innerHTML = renderSafeMarkdown(value);
  }

  private applyMarkdown(kind: string) {
    if (this.noteInput.disabled) return;
    if (this.noteTab !== 'edit') this.setNoteTab('edit');
    this.noteInput.focus();

    const start = this.noteInput.selectionStart;
    const end = this.noteInput.selectionEnd;
    const value = this.noteInput.value;
    const selected = value.slice(start, end);

    const wraps: Record<string, [string, string]> = {
      b: ['**', '**'],
      i: ['*', '*'],
      code: ['`', '`'],
    };
    const prefixes: Record<string, string> = {
      h: '# ',
      ul: '- ',
      ol: '1. ',
      todo: '- [ ] ',
    };

    if (wraps[kind]) {
      const [open, close] = wraps[kind];
      const inner = selected || '文本';
      this.noteInput.value = value.slice(0, start) + open + inner + close + value.slice(end);
      const caret = start + open.length;
      this.noteInput.setSelectionRange(caret, caret + inner.length);
    } else if (kind === 'link') {
      const inner = selected || '链接';
      this.noteInput.value = value.slice(0, start) + '[' + inner + '](https://)' + value.slice(end);
      const caret = start + 1;
      this.noteInput.setSelectionRange(caret, caret + inner.length);
    } else if (prefixes[kind]) {
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      this.noteInput.value = value.slice(0, lineStart) + prefixes[kind] + value.slice(lineStart);
      const caret = start + prefixes[kind].length;
      this.noteInput.setSelectionRange(caret, caret);
    } else {
      return;
    }

    this.noteInput.dispatchEvent(new Event('input'));
  }

  private updateZoomDisplay() {
    const zoom = this.engine.getZoom();
    if (!Number.isFinite(zoom) || zoom <= 0) return;
    this.zoomValue.textContent = `${Math.round(zoom * 100)}%`;
  }

  // ── Host messaging ──────────────────────────────────────────────

  private handleHost(msg: HostToWebviewMessage) {
    switch (msg.type) {
      case 'init':
        this.filePath = msg.filename;
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
        this.hasValidDocument = false;
        this.showError(msg.message);
        break;
      case 'importWarnings':
        this.showWarnings(msg.warnings);
        break;
      case 'exportImage':
        void this.exportImage(msg);
        break;
      case 'exportXmind':
        this.exportXmind(msg);
        break;
    }
  }

  private applyConfig(config: { saveExpandState?: string }) {
    if (config.saveExpandState) {
      this.engine.saveExpandState = config.saveExpandState as any;
    }
  }

  private loadDocument(text: string) {
    this.flushFormEdits();
    try {
      const doc = parseKmDocument(text);
      const normalized = stringifyKmDocument(doc);
      if (normalized === this.currentSerialized && this.hasValidDocument) return;
      this.hasValidDocument = true;
      this.hideError();
      this.engine.importDocument(doc);
      this.currentSerialized = stringifyKmDocument(this.engine.exportForSave());
      this.updateTemplateButtons();
      this.refreshTopBarTitle();
    } catch (error) {
      this.hasValidDocument = false;
      this.showError(error instanceof Error ? error.message : String(error));
    }
  }

  // ── Selection state ─────────────────────────────────────────────

  private refreshSelection(node: MindmapNode | null) {
    this.flushFormEdits();
    if (node?.id !== this.selectedNodeId) {
      this.selectedNodeId = node?.id ?? null;
    }

    this.updatingForm = true;
    this.titleInput.disabled = !node;
    this.noteInput.disabled = !node;
    this.titleInput.value = node?.text ?? '';
    this.noteInput.value = node?.note ?? '';
    this.updatingForm = false;

    if (!node) {
      this.nodeName.textContent = '未选择节点';
      this.breadcrumb.innerHTML = '';
      this.setNoteTab('edit');
      this.hidePopover();
      this.updateNoteStats();
      return;
    }

    this.nodeName.textContent = node.text?.trim() || '（无标题）';
    this.renderBreadcrumb(this.engine.getNodeBreadcrumb(node.id));
    this.setNoteTab('edit');
    this.updateNoteStats();
    this.showPopover();
  }

  private refreshNodeContext() {
    const node = this.engine.getSelectedNode();
    if (!node) return;
    this.nodeName.textContent = node.text?.trim() || '（无标题）';
    this.renderBreadcrumb(this.engine.getNodeBreadcrumb(node.id));
  }

  private renderBreadcrumb(parts: string[]) {
    const ancestors = parts.slice(0, -1);
    if (ancestors.length === 0) {
      this.breadcrumb.innerHTML = '<span class="bc bc-root">根节点</span>';
      return;
    }
    const sep = '<span class="bc-sep" aria-hidden="true">›</span>';
    this.breadcrumb.innerHTML = ancestors
      .map((part) => `<span class="bc">${esc(part)}</span>`)
      .join(sep);
  }

  private showPopover() {
    this.popover.hidden = false;
    this.popover.classList.remove('hidden');
    this.syncPinnedLayout(true);
  }

  private hidePopover() {
    this.syncPinnedLayout(false);
    this.popover.hidden = true;
    this.popover.classList.add('hidden');
  }

  private closePopover() {
    this.engine.selectNode(null);
  }

  private togglePopoverPin() {
    this.popoverPinned = !this.popoverPinned;
    this.syncPinnedLayout(!this.popover.hidden);
  }

  private syncPinnedLayout(isVisible: boolean) {
    // On narrow viewports the floating popover would cover too much of the
    // canvas, so it always docks (as a bottom sheet via the media query).
    const docked = (this.popoverPinned || this.narrowMq.matches) && isVisible;
    this.popover.classList.toggle('is-pinned', docked);
    this.canvasArea.classList.toggle('is-popover-pinned', docked);
    this.popoverPinBtn.classList.toggle('active', docked);
    this.popoverPinBtn.title = this.popoverPinned ? '取消固定' : '固定面板';
    this.popover.style.left = '';
    this.popover.style.top = '';
  }

  private updateNoteStats() {
    const v = this.noteInput.value;
    const len = v.length;
    if (len === 0) {
      this.noteStats.textContent = '0 字符';
      return;
    }
    const lines = v.split('\n').length;
    this.noteStats.textContent = `${len} 字符 · ${lines} 行`;
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
    this.refreshTopBarTitle();
    this.errorMessage.textContent = message;
    this.errorOverlay.classList.remove('hidden');
  }

  private hideError() {
    this.errorOverlay.classList.add('hidden');
    this.errorMessage.textContent = '';
  }

  // ── Sync ────────────────────────────────────────────────────────

  private refreshTopBarTitle() {
    const title = this.hasValidDocument ? this.engine.getRootTitle() : null;
    this.filename.textContent = title ?? this.filePath;
    const brand = this.filename.closest('.top-bar-brand');
    if (brand instanceof HTMLElement) {
      brand.title = this.filePath || 'KityMinder Neo';
    }
  }

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

  private requestExportFile() {
    if (!this.hasValidDocument) {
      this.vscode.postMessage({ type: 'showWarning', warning: '当前 KM 文档无法导出。' });
      return;
    }
    this.vscode.postMessage({ type: 'requestExportFile' });
  }

  private async exportImage(options: Extract<HostToWebviewMessage, { type: 'exportImage' }>) {
    if (!this.hasValidDocument) {
      this.vscode.postMessage({ type: 'showWarning', warning: '当前 KM 文档无法导出。' });
      return;
    }

    try {
      if (this.engine.isEditing()) {
        this.engine.commitEdit();
      }
      const result = await this.engine.exportImage({
        format: options.format,
        backgroundColor: options.backgroundColor,
      });
      this.vscode.postMessage({
        type: 'saveExportedImage',
        requestId: options.requestId,
        format: result.format,
        encoding: result.encoding,
        data: result.data,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.vscode.postMessage({
        type: 'showWarning',
        warning: `导出图片失败：${message}`,
      });
    }
  }

  private exportXmind(options: Extract<HostToWebviewMessage, { type: 'exportXmind' }>) {
    if (!this.hasValidDocument) {
      this.vscode.postMessage({ type: 'showWarning', warning: '当前 KM 文档无法导出。' });
      return;
    }

    try {
      if (this.engine.isEditing()) {
        this.engine.commitEdit();
      }
      this.vscode.postMessage({
        type: 'saveExportedXmind',
        requestId: options.requestId,
        text: stringifyKmDocument(this.engine.exportDocument()),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.vscode.postMessage({
        type: 'showWarning',
        warning: `导出 XMind 失败：${message}`,
      });
    }
  }

  // ── Search ─────────────────────────────────────────────────────

  private openSearch() {
    this.setToolbarMenuOpen(false);
    this.searchBar.classList.remove('hidden');
    this.searchInput.focus();
    this.searchInput.select();
  }

  private closeSearch() {
    const hadFocus = this.searchBar.contains(document.activeElement);
    this.searchBar.classList.add('hidden');
    this.searchInput.value = '';
    this.searchCount.textContent = '';
    this.engine.clearSearch();
    this.clearNoteHighlight();
    if (hadFocus) this.container.focus();
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
    if (this.searchInput.value !== this.engine.searchQuery) {
      this.performSearch();
      return;
    }
    if (this.engine.searchResults.length === 0 && this.searchInput.value) {
      this.performSearch();
      return;
    }
    this.engine.nextSearchResult();
    this.updateSearchDisplay();
  }

  private searchPrev() {
    if (this.searchInput.value !== this.engine.searchQuery) {
      this.performSearch();
      return;
    }
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

    // Highlight without moving typing focus out of search (or a search button).
    this.noteInput.setSelectionRange(pos, pos + q.length);

    const lineHeight = 18;
    const approxLine = note.slice(0, pos).split('\n').length - 1;
    this.noteInput.scrollTop = Math.max(0, approxLine * lineHeight - 30);
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
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', handler);
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
