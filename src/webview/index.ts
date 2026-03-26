import './styles.css';

import { createDefaultKmDocument, parseKmDocument, stringifyKmDocument } from '../shared/km';
import type { HostToWebviewMessage, WebviewToHostMessage } from '../shared/protocol';

declare const acquireVsCodeApi: () => {
  postMessage(message: WebviewToHostMessage): void;
  setState(state: unknown): void;
  getState(): unknown;
};

declare global {
  interface Window {
    kity: any;
    kityminder: any;
  }
}

class KityMinderWebviewApp {
  private readonly vscode = acquireVsCodeApi();
  private readonly filename = this.getElement<HTMLDivElement>('filename');
  private readonly warningBanner = this.getElement<HTMLDivElement>('warning-banner');
  private readonly container = this.getElement<HTMLDivElement>('mindmap-container');
  private readonly errorOverlay = this.getElement<HTMLDivElement>('error-overlay');
  private readonly errorMessage = this.getElement<HTMLParagraphElement>('error-message');
  private readonly titleInput = this.getElement<HTMLInputElement>('node-title');
  private readonly noteInput = this.getElement<HTMLTextAreaElement>('node-note');
  private readonly selectionMeta = this.getElement<HTMLDivElement>('selection-meta');
  private readonly templateButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('.template-btn')
  );

  private minder!: any;
  private pendingSync: number | undefined;
  private suppressSync = false;
  private updatingForm = false;
  private hasValidDocument = false;
  private currentSerialized = '';
  private positionMode = false;
  private positionDrag:
    | {
        node: any;
        startMouse: any;
        startOffset: any;
      }
    | undefined;

  public bootstrap() {
    this.createMinder();
    this.bindUi();
    window.addEventListener('message', (event: MessageEvent<HostToWebviewMessage>) => {
      this.handleHostMessage(event.data);
    });
    window.addEventListener('mouseup', () => this.finishPositionDrag());
    this.vscode.postMessage({ type: 'ready' });
  }

  private createMinder() {
    const { kityminder } = window;
    const minder = new kityminder.Minder({
      enableAnimation: true,
      enableKeyReceiver: false
    });

    minder.renderTo(this.container);
    minder.importJson(createDefaultKmDocument());
    minder.select(minder.getRoot(), true);
    minder.execCommand('camera');

    minder.on('contentchange', () => {
      if (!this.suppressSync && this.hasValidDocument) {
        this.scheduleSync();
      }
    });

    minder.on('selectionchange interactchange layoutallfinish', () => {
      this.refreshSelectionState();
    });

    minder.on('position.mousedown', (event: any) => this.handlePositionMouseDown(event));
    minder.on('position.mousemove', (event: any) => this.handlePositionMouseMove(event));
    minder.on('position.mouseup', () => this.finishPositionDrag());

    this.minder = minder;
  }

  private bindUi() {
    this.getElement<HTMLButtonElement>('btn-add-child').addEventListener('click', () => {
      this.executeCommand('AppendChildNode', '新节点');
    });
    this.getElement<HTMLButtonElement>('btn-add-sibling').addEventListener('click', () => {
      this.executeCommand('AppendSiblingNode', '新节点');
    });
    this.getElement<HTMLButtonElement>('btn-add-parent').addEventListener('click', () => {
      this.executeCommand('AppendParentNode', '新节点');
    });
    this.getElement<HTMLButtonElement>('btn-delete').addEventListener('click', () => {
      this.executeCommand('RemoveNode');
    });
    this.getElement<HTMLButtonElement>('btn-expand').addEventListener('click', () => {
      this.executeCommand('expand');
    });
    this.getElement<HTMLButtonElement>('btn-collapse').addEventListener('click', () => {
      this.executeCommand('collapse');
    });
    this.getElement<HTMLButtonElement>('btn-expand-all').addEventListener('click', () => {
      this.executeCommand('expandtolevel', 9999);
    });
    this.getElement<HTMLButtonElement>('btn-level-1').addEventListener('click', () => {
      this.executeCommand('expandtolevel', 1);
    });
    this.getElement<HTMLButtonElement>('btn-level-2').addEventListener('click', () => {
      this.executeCommand('expandtolevel', 2);
    });
    this.getElement<HTMLButtonElement>('btn-level-3').addEventListener('click', () => {
      this.executeCommand('expandtolevel', 3);
    });
    this.getElement<HTMLButtonElement>('btn-level-all').addEventListener('click', () => {
      this.executeCommand('expandtolevel', 9999);
    });
    this.getElement<HTMLButtonElement>('btn-reset-layout').addEventListener('click', () => {
      const selected = this.minder.getSelectedNode();
      this.minder.select(this.minder.getRoot(), true);
      this.executeCommand('resetlayout');
      if (selected) {
        this.minder.select(selected, true);
      }
    });
    this.getElement<HTMLButtonElement>('btn-center').addEventListener('click', () => {
      this.executeCommand('camera');
    });
    this.getElement<HTMLButtonElement>('btn-open-source').addEventListener('click', () => {
      this.openSourceJson();
    });
    this.getElement<HTMLButtonElement>('btn-open-source-error').addEventListener('click', () => {
      this.openSourceJson();
    });
    this.getElement<HTMLButtonElement>('btn-position-mode').addEventListener('click', () => {
      this.setPositionMode(!this.positionMode);
    });

    for (const button of this.templateButtons) {
      button.addEventListener('click', () => {
        const template = button.dataset.template;
        if (template) {
          this.executeCommand('template', template);
        }
      });
    }

    let titleTimer: number | undefined;
    this.titleInput.addEventListener('input', () => {
      if (this.updatingForm) {
        return;
      }

      window.clearTimeout(titleTimer);
      titleTimer = window.setTimeout(() => {
        const node = this.minder.getSelectedNode();
        if (!node) {
          return;
        }
        this.minder.execCommand('text', this.titleInput.value);
      }, 120);
    });

    let noteTimer: number | undefined;
    this.noteInput.addEventListener('input', () => {
      if (this.updatingForm) {
        return;
      }

      window.clearTimeout(noteTimer);
      noteTimer = window.setTimeout(() => {
        const note = this.noteInput.value.trim();
        this.minder.execCommand('note', note.length > 0 ? this.noteInput.value : null);
      }, 120);
    });
  }

  private handleHostMessage(message: HostToWebviewMessage) {
    switch (message.type) {
      case 'init':
        this.filename.textContent = message.filename;
        this.loadDocument(message.text);
        break;
      case 'documentReplaced':
        this.loadDocument(message.text);
        break;
      case 'error':
        this.showError(message.message);
        break;
      case 'importWarnings':
        this.showWarnings(message.warnings);
        break;
    }
  }

  private loadDocument(text: string) {
    try {
      const parsed = parseKmDocument(text);
      this.hasValidDocument = true;
      this.hideError();
      this.suppressSync = true;
      this.minder.importJson(parsed);
      this.minder.select(this.minder.getRoot(), true);
      this.minder.execCommand('camera');
      this.currentSerialized = stringifyKmDocument(this.minder.exportJson());
      this.suppressSync = false;
      this.refreshSelectionState();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.hasValidDocument = false;
      this.showError(message);
    }
  }

  private showWarnings(warnings: string[]) {
    if (warnings.length === 0) {
      this.warningBanner.classList.add('hidden');
      this.warningBanner.textContent = '';
      return;
    }

    this.warningBanner.classList.remove('hidden');
    this.warningBanner.innerHTML = `
      <div class="banner-title">导入提示</div>
      <ul class="warning-list">${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>
    `;
  }

  private showError(message: string) {
    this.errorMessage.textContent = message;
    this.errorOverlay.classList.remove('hidden');
  }

  private hideError() {
    this.errorOverlay.classList.add('hidden');
    this.errorMessage.textContent = '';
  }

  private refreshSelectionState() {
    const node = this.minder.getSelectedNode();
    const hasNode = Boolean(node);

    this.updatingForm = true;
    this.titleInput.disabled = !hasNode;
    this.noteInput.disabled = !hasNode;
    this.titleInput.value = hasNode ? node.getData('text') ?? node.getText?.() ?? '' : '';
    this.noteInput.value = hasNode ? node.getData('note') ?? '' : '';
    this.updatingForm = false;

    if (hasNode) {
      const childCount = Array.isArray(node.children) ? node.children.length : 0;
      const isRoot = typeof node.isRoot === 'function' ? node.isRoot() : false;
      this.selectionMeta.textContent = `${isRoot ? '根节点' : `层级 ${node.getLevel?.() ?? '-'}`} / ${childCount} 个子节点${this.positionMode ? ' / 位置模式' : ''}`;
    } else {
      this.selectionMeta.textContent = '未选择节点';
    }

    this.updateTemplateButtons();
    this.updatePositionButton();
  }

  private updateTemplateButtons() {
    const currentTemplate = this.minder.queryCommandValue('template') ?? 'default';
    for (const button of this.templateButtons) {
      button.classList.toggle('active', button.dataset.template === currentTemplate);
    }
  }

  private updatePositionButton() {
    const button = this.getElement<HTMLButtonElement>('btn-position-mode');
    button.classList.toggle('active', this.positionMode);
    button.textContent = this.positionMode ? '退出位置模式' : '位置模式';
  }

  private openSourceJson() {
    this.vscode.postMessage({ type: 'revealSourceJson' });
  }

  private executeCommand(command: string, value?: unknown) {
    if (!this.hasValidDocument) {
      return;
    }

    if (value === undefined) {
      this.minder.execCommand(command);
    } else {
      this.minder.execCommand(command, value);
    }
    this.refreshSelectionState();
  }

  private setPositionMode(enabled: boolean) {
    this.positionMode = enabled;
    this.finishPositionDrag();
    this.minder.setStatus(enabled ? 'position' : 'normal', true);
    this.updatePositionButton();
    this.refreshSelectionState();
  }

  private handlePositionMouseDown(event: any) {
    if (!this.positionMode) {
      return;
    }

    const node = this.minder.getSelectedNode();
    const target = event.getTargetNode();
    if (!node || !target || node !== target || node.isRoot()) {
      return;
    }

    this.positionDrag = {
      node,
      startMouse: event.getPosition(),
      startOffset: node.getLayoutOffset()
    };
    event.preventDefault?.();
    event.stopPropagation?.();
  }

  private handlePositionMouseMove(event: any) {
    if (!this.positionDrag) {
      return;
    }

    const delta = window.kity.Vector.fromPoints(
      this.positionDrag.startMouse,
      event.getPosition()
    );
    const nextOffset = this.positionDrag.startOffset.offset(delta);
    this.positionDrag.node.setLayoutOffset(nextOffset);
    this.minder.applyLayoutResult(this.positionDrag.node, 0);
  }

  private finishPositionDrag() {
    if (!this.positionDrag) {
      return;
    }

    this.positionDrag = undefined;
    this.minder.fire('contentchange');
  }

  private scheduleSync() {
    window.clearTimeout(this.pendingSync);
    this.pendingSync = window.setTimeout(() => {
      const serialized = stringifyKmDocument(this.minder.exportJson());
      if (serialized === this.currentSerialized) {
        return;
      }
      this.currentSerialized = serialized;
      this.vscode.postMessage({
        type: 'applyEdit',
        text: serialized
      });
    }, 120);
  }

  private getElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Missing required element: ${id}`);
    }
    return element as T;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

new KityMinderWebviewApp().bootstrap();
