import * as vscode from 'vscode';

import { exportXmindArchive } from '../export/xmindExport';
import {
  decodeExportedImageData,
  normalizeExportBackgroundColor,
  validateExportBackgroundColorInput,
} from '../shared/imageExport';
import { parseKmDocument } from '../shared/km';
import type {
  ExportFileFormat,
  HostToWebviewMessage,
  SaveExpandState,
  WebviewConfig,
  WebviewToHostMessage,
} from '../shared/protocol';
import {
  replaceCustomEditorWithPlainText,
  shouldUsePlainTextInsteadOfCustomEditor,
} from './plainTextFallback';

export const KM_EDITOR_VIEW_TYPE = 'kityminder-neo.kmEditor';

interface ExportFormatQuickPickItem extends vscode.QuickPickItem {
  format: ExportFileFormat;
}

interface ImageBackgroundQuickPickItem extends vscode.QuickPickItem {
  backgroundColor: string | null;
}

interface ExportFileOptions {
  format: ExportFileFormat;
  backgroundColor?: string | null;
}

export class KmEditorProvider implements vscode.CustomTextEditorProvider {
  public static register(
    context: vscode.ExtensionContext,
    importWarnings: Map<string, string[]>
  ): vscode.Disposable {
    const provider = new KmEditorProvider(context, importWarnings);
    const providerRegistration = vscode.window.registerCustomEditorProvider(
      KM_EDITOR_VIEW_TYPE,
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true
        }
      }
    );

    return providerRegistration;
  }

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly importWarnings: Map<string, string[]>
  ) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    token: vscode.CancellationToken
  ): Promise<void> {
    if (await shouldUsePlainTextInsteadOfCustomEditor(document.uri)) {
      if (!token.isCancellationRequested) {
        await replaceCustomEditorWithPlainText(document.uri, webviewPanel);
      }
      return;
    }

    const webview = webviewPanel.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
      ]
    };
    webview.html = this.getHtml(webview, document);
    const pendingExports = new Map<string, vscode.Uri>();

    const updateWebview = () => {
      this.postMessage(webview, {
        type: 'documentReplaced',
        text: document.getText()
      });
    };

    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() === document.uri.toString()) {
        updateWebview();
      }
    });

    const changeConfigSubscription = vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('kityminderNeo.saveExpandState')) {
        this.postMessage(webview, {
          type: 'configChanged',
          config: this.readConfig(),
        });
      }
    });

    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
      changeConfigSubscription.dispose();
    });

    webview.onDidReceiveMessage(async (message: WebviewToHostMessage) => {
      switch (message.type) {
        case 'ready': {
          this.postMessage(webview, {
            type: 'init',
            text: document.getText(),
            filename: vscode.workspace.asRelativePath(document.uri, false),
            config: this.readConfig(),
          });

          const warnings = this.importWarnings.get(document.uri.toString());
          if (warnings?.length) {
            this.importWarnings.delete(document.uri.toString());
            this.postMessage(webview, {
              type: 'importWarnings',
              warnings
            });
          }
          break;
        }

        case 'applyEdit':
          await this.updateTextDocument(document, message.text);
          break;

        case 'revealSourceJson':
          await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default');
          break;

        case 'showWarning':
          void vscode.window.showWarningMessage(message.warning);
          break;

        case 'requestExportFile':
          await this.requestExportFile(document, webview, pendingExports);
          break;

        case 'saveExportedImage':
          await this.saveExportedImage(message, pendingExports);
          break;

        case 'saveExportedXmind':
          await this.saveExportedXmind(message, pendingExports);
          break;
      }
    });
  }

  private async updateTextDocument(document: vscode.TextDocument, text: string): Promise<void> {
    if (text === document.getText()) {
      return;
    }

    const edit = new vscode.WorkspaceEdit();
    const lastLine = document.lineAt(document.lineCount - 1);
    const fullRange = new vscode.Range(0, 0, document.lineCount - 1, lastLine.range.end.character);
    edit.replace(document.uri, fullRange, text);
    await vscode.workspace.applyEdit(edit);
  }

  private getHtml(webview: vscode.Webview, document: vscode.TextDocument): string {
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js')
    );
    const stylesUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.css')
    );

    return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${webview.cspSource} https: data: blob:; style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com; script-src 'nonce-${nonce}' 'unsafe-eval'; font-src ${webview.cspSource} https://fonts.gstatic.com;"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(document.fileName)}</title>
    <link rel="stylesheet" href="${stylesUri}" />
  </head>
  <body>
    <div class="app">
      <!-- Top bar: brand + toolbar + actions in one row -->
      <header class="top-bar">
        <div class="top-bar-brand">
          <div class="logo" title="KityMinder Neo">KM</div>
          <div class="header-filename" id="filename"></div>
        </div>
        <div class="toolbar-divider top-bar-divider" aria-hidden="true"></div>
        <nav class="top-bar-toolbar" aria-label="编辑器工具栏">
        <div class="toolbar-group">
          <span class="toolbar-label">节点</span>
          <div class="toolbar-group-row">
            <button id="btn-add-child" class="btn icon-btn" title="添加子节点 (Tab)"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg></button>
            <button id="btn-add-sibling" class="btn icon-btn" title="添加同级节点 (Enter)"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 12H3"/><path d="M16 6H3"/><path d="M16 18H3"/><path d="M18 9v6"/><path d="M21 12h-6"/></svg></button>
            <button id="btn-add-parent" class="btn icon-btn" title="添加父节点"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/></svg></button>
            <button id="btn-delete" class="btn danger icon-btn" title="删除节点 (Delete)"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
          </div>
        </div>
        <div class="toolbar-divider"></div>
        <div class="toolbar-group">
          <span class="toolbar-label">展开层级</span>
          <div class="toolbar-group-row">
            <button id="btn-expand" class="btn icon-btn" title="展开选中节点"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg></button>
            <button id="btn-collapse" class="btn icon-btn" title="收起选中节点"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 20 5-5 5 5"/><path d="m7 4 5 5 5-5"/></svg></button>
            <div class="seg" id="seg-level" role="group" aria-label="展开到层级">
              <button id="btn-level-1" class="seg-item" data-level="1" title="展开到一级">1</button>
              <button id="btn-level-2" class="seg-item" data-level="2" title="展开到二级">2</button>
              <button id="btn-level-3" class="seg-item" data-level="3" title="展开到三级">3</button>
              <button id="btn-expand-all" class="seg-item" data-level="all" title="全部展开">全部</button>
            </div>
          </div>
        </div>
        <div class="toolbar-divider"></div>
        <div class="toolbar-group">
          <span class="toolbar-label">布局</span>
          <div class="toolbar-group-row">
            <div class="seg seg-layout" id="seg-layout" role="group" aria-label="布局模式">
              <button class="seg-item tpl-btn" data-template="default" title="思维导图"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="19" cy="18" r="2"/><path d="M7 12h4M11 12 17 6M11 12l6 6"/></svg>脑图</button>
              <button class="seg-item tpl-btn" data-template="right" title="向右展开"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h6M9 7v10M9 9h7M9 15h7"/></svg>右展</button>
              <button class="seg-item tpl-btn" data-template="structure" title="组织结构图"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-2h12v2"/></svg>组织</button>
            </div>
            <button id="btn-reset-layout" class="btn icon-btn" title="整理布局"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg></button>
          </div>
        </div>
        <div class="toolbar-divider"></div>
        <div class="toolbar-group">
          <span class="toolbar-label">视图</span>
          <div class="toolbar-group-row">
            <div class="stepper">
              <button id="btn-zoom-out" title="缩小 (⌘-)"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg></button>
              <button id="btn-zoom-value" class="zoom-val" title="可读视图 (⌘1)">100%</button>
              <button id="btn-zoom-in" title="放大 (⌘+)"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg></button>
            </div>
            <button id="btn-zoom-fit" class="btn icon-btn" title="适应画布 (⌘0)"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg></button>
            <button id="btn-center" class="btn icon-btn" title="居中"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v4"/><path d="M12 18v4"/><path d="M2 12h4"/><path d="M18 12h4"/></svg></button>
          </div>
        </div>
        <div class="toolbar-divider"></div>
        <div class="toolbar-group">
          <span class="toolbar-label">历史</span>
          <div class="toolbar-group-row">
            <button id="btn-undo" class="btn icon-btn" title="撤销 (Ctrl+Z)"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11"/></svg></button>
            <button id="btn-redo" class="btn icon-btn" title="重做 (Ctrl+Shift+Z)"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5 5.5 5.5 0 0 0 9.5 20H13"/></svg></button>
          </div>
        </div>
        </nav>
        <div class="top-bar-actions">
          <button id="btn-export-image" class="btn icon-btn" title="导出"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg></button>
          <button id="btn-open-source" class="btn icon-btn" title="源码 JSON"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/></svg></button>
        </div>
      </header>

      <!-- Warning banner -->
      <div id="warning-banner" class="warning-banner hidden"></div>

      <!-- Search bar -->
      <div id="search-bar" class="search-bar hidden">
        <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input id="search-input" type="text" placeholder="搜索标题或备注…" />
        <span id="search-count" class="search-count"></span>
        <button id="btn-search-prev" class="btn icon-btn" title="上一个 (Shift+Enter)"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg></button>
        <button id="btn-search-next" class="btn icon-btn" title="下一个 (Enter)"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button>
        <button id="btn-search-close" class="btn icon-btn" title="关闭 (Escape)"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
      </div>

      <!-- Main -->
      <div class="main-content">
        <div class="canvas-area" id="canvas-area">
          <div id="mindmap-container" class="canvas-container"></div>

          <div id="node-popover" class="node-popover hidden" hidden>
            <div class="node-popover-panel">
              <div class="node-popover-head">
                <div class="node-popover-head-top">
                  <span class="popover-eyebrow"><span class="popover-dot" aria-hidden="true"></span>节点属性</span>
                  <div class="node-popover-actions">
                    <button id="btn-popover-pin" class="btn icon-btn" title="固定面板"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1z"/></svg></button>
                    <button id="btn-popover-close" class="btn icon-btn" title="关闭"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
                  </div>
                </div>
                <div class="node-identity">
                  <div class="node-swatch" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/></svg></div>
                  <div class="node-identity-text">
                    <div class="node-name" id="node-name">未选择节点</div>
                    <div class="node-breadcrumb" id="node-breadcrumb"></div>
                  </div>
                </div>
              </div>

              <div class="node-popover-fields">
                <div class="field">
                  <div class="field-head">
                    <label for="node-title">标题</label>
                  </div>
                  <input id="node-title" type="text" placeholder="选择节点后编辑标题" disabled />
                </div>
                <div class="field field-grow note-field">
                  <div class="note-toolbar" id="note-toolbar" aria-label="Markdown 工具">
                    <button class="md-btn" data-md="h" title="标题" type="button">H</button>
                    <button class="md-btn" data-md="b" title="加粗" type="button">B</button>
                    <button class="md-btn" data-md="i" title="斜体" type="button" style="font-style:italic;font-weight:600;">i</button>
                    <span class="md-sep" aria-hidden="true"></span>
                    <button class="md-btn" data-md="ul" title="无序列表" type="button"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg></button>
                    <button class="md-btn" data-md="ol" title="有序列表" type="button"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4l2-2.5V14H4"/></svg></button>
                    <button class="md-btn" data-md="todo" title="任务列表" type="button"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="6" height="6" rx="1"/><path d="m3 17 2 2 4-4M13 6h8M13 18h8"/></svg></button>
                    <span class="md-sep" aria-hidden="true"></span>
                    <button class="md-btn" data-md="link" title="链接" type="button"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg></button>
                    <button class="md-btn" data-md="code" title="行内代码" type="button"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/></svg></button>
                    <div class="md-tabs" id="note-tabs">
                      <button class="md-tab active" data-tab="edit" type="button">编辑</button>
                      <button class="md-tab" data-tab="preview" type="button">预览</button>
                    </div>
                  </div>
                  <div class="note-stack" id="note-stack">
                    <textarea
                      id="node-note"
                      class="note-area"
                      placeholder="在此添加备注…支持 Markdown"
                      disabled
                    ></textarea>
                    <div class="note-preview md hidden" id="node-preview"></div>
                  </div>
                  <div class="field-foot">
                    <span class="field-stat" id="note-stats">0 字符</span>
                    <span class="field-tip">支持 Markdown · GFM</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div id="error-overlay" class="error-overlay hidden">
            <div class="error-card">
              <h3>无法在图形编辑器中打开此文件</h3>
              <p id="error-message"></p>
              <button id="btn-open-source-error" class="btn accent">使用文本编辑器打开</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
  }

  private readConfig(): WebviewConfig {
    const cfg = vscode.workspace.getConfiguration('kityminderNeo');
    const raw = cfg.get<string>('saveExpandState', 'preserve');
    const valid: SaveExpandState[] = ['preserve', 'expandAll', 'level1', 'level2', 'level3'];
    return {
      saveExpandState: valid.includes(raw as SaveExpandState) ? raw as SaveExpandState : 'preserve',
    };
  }

  private async requestExportFile(
    document: vscode.TextDocument,
    webview: vscode.Webview,
    pendingExports: Map<string, vscode.Uri>
  ): Promise<void> {
    const options = await pickExportOptions();
    if (!options) {
      return;
    }

    const targetUri = await vscode.window.showSaveDialog({
      defaultUri: withExtension(document.uri, `.${options.format}`),
      filters: exportFileFilters(options.format),
      saveLabel: `Export ${options.format.toUpperCase()}`,
    });
    if (!targetUri) {
      return;
    }

    const requestId = createRequestId();
    pendingExports.set(requestId, targetUri);
    if (options.format === 'xmind') {
      this.postMessage(webview, {
        type: 'exportXmind',
        requestId,
      });
      return;
    }

    this.postMessage(webview, {
      type: 'exportImage',
      requestId,
      format: options.format,
      backgroundColor: options.backgroundColor ?? null,
    });
  }

  private async saveExportedImage(
    message: Extract<WebviewToHostMessage, { type: 'saveExportedImage' }>,
    pendingExports: Map<string, vscode.Uri>
  ): Promise<void> {
    const targetUri = pendingExports.get(message.requestId);
    if (!targetUri) {
      void vscode.window.showWarningMessage('No pending image export target was found.');
      return;
    }
    pendingExports.delete(message.requestId);

    try {
      await vscode.workspace.fs.writeFile(
        targetUri,
        decodeExportedImageData(message.data, message.encoding)
      );
      void vscode.window.showInformationMessage(
        `Exported ${message.format.toUpperCase()} image: ${vscode.workspace.asRelativePath(targetUri, false)}`
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`Failed to save exported image: ${detail}`);
    }
  }

  private async saveExportedXmind(
    message: Extract<WebviewToHostMessage, { type: 'saveExportedXmind' }>,
    pendingExports: Map<string, vscode.Uri>
  ): Promise<void> {
    const targetUri = pendingExports.get(message.requestId);
    if (!targetUri) {
      void vscode.window.showWarningMessage('No pending XMind export target was found.');
      return;
    }
    pendingExports.delete(message.requestId);

    try {
      const archive = await exportXmindArchive(parseKmDocument(message.text));
      await vscode.workspace.fs.writeFile(targetUri, archive);
      void vscode.window.showInformationMessage(
        `Exported XMind file: ${vscode.workspace.asRelativePath(targetUri, false)}`
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`Failed to save exported XMind file: ${detail}`);
    }
  }

  private postMessage(webview: vscode.Webview, message: HostToWebviewMessage) {
    void webview.postMessage(message);
  }
}

async function pickExportOptions(): Promise<ExportFileOptions | undefined> {
  const format = await vscode.window.showQuickPick(
    [
      {
        label: 'PNG',
        description: '位图图片',
        format: 'png',
      },
      {
        label: 'SVG',
        description: '矢量图片',
        format: 'svg',
      },
      {
        label: 'XMind',
        description: '可编辑 .xmind 文件',
        format: 'xmind',
      },
    ] satisfies ExportFormatQuickPickItem[],
    {
      title: '导出格式',
      placeHolder: '选择导出格式',
    }
  );
  if (!format) {
    return undefined;
  }
  if (format.format === 'xmind') {
    return {
      format: 'xmind',
    };
  }

  const background = await vscode.window.showQuickPick(
    [
      {
        label: '透明',
        description: '默认',
        backgroundColor: null,
      },
      {
        label: '白色',
        description: '#ffffff',
        backgroundColor: '#ffffff',
      },
      {
        label: '自定义颜色...',
        description: '输入十六进制颜色',
        backgroundColor: 'custom',
      },
    ] satisfies ImageBackgroundQuickPickItem[],
    {
      title: '导出背景颜色',
      placeHolder: '选择背景颜色',
    }
  );
  if (!background) {
    return undefined;
  }

  let backgroundColor: string | null;
  if (background.backgroundColor === 'custom') {
    const input = await vscode.window.showInputBox({
      title: '导出背景颜色',
      prompt: '输入 transparent 或十六进制颜色，例如 #ffffff。',
      value: 'transparent',
      validateInput: validateExportBackgroundColorInput,
    });
    if (input === undefined) {
      return undefined;
    }

    const normalized = normalizeExportBackgroundColor(input);
    if (normalized === undefined) {
      return undefined;
    }
    backgroundColor = normalized;
  } else {
    backgroundColor = background.backgroundColor;
  }

  return {
    format: format.format,
    backgroundColor,
  };
}

function exportFileFilters(format: ExportFileFormat): Record<string, string[]> {
  if (format === 'png') {
    return { 'PNG Image': ['png'] };
  }
  if (format === 'svg') {
    return { 'SVG Image': ['svg'] };
  }
  return { 'XMind': ['xmind'] };
}

function withExtension(uri: vscode.Uri, extension: string): vscode.Uri {
  const nextPath = uri.path.replace(/\.[^/.]+$/, '');
  return uri.with({
    path: `${nextPath}${extension}`,
  });
}

function createRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function getNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let index = 0; index < 32; index += 1) {
    nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return nonce;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
