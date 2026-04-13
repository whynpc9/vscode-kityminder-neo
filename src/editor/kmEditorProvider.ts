import * as vscode from 'vscode';

import type { HostToWebviewMessage, WebviewToHostMessage, WebviewConfig, SaveExpandState } from '../shared/protocol';
import {
  replaceCustomEditorWithPlainText,
  shouldUsePlainTextInsteadOfCustomEditor,
} from './plainTextFallback';

export const KM_EDITOR_VIEW_TYPE = 'kityminder-neo.kmEditor';

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
      content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com; script-src 'nonce-${nonce}' 'unsafe-eval'; font-src ${webview.cspSource} https://fonts.gstatic.com;"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(document.fileName)}</title>
    <link rel="stylesheet" href="${stylesUri}" />
  </head>
  <body>
    <div class="app">
      <!-- Header -->
      <header class="header">
        <div class="header-brand">
          <div class="logo">KM</div>
          <div class="header-info">
            <div class="header-title">KityMinder Neo</div>
            <div class="header-filename" id="filename"></div>
          </div>
        </div>
        <div class="header-actions">
          <button id="btn-open-source" class="btn link icon-btn" title="源码 JSON"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/></svg></button>
        </div>
      </header>

      <!-- Toolbar -->
      <div class="toolbar">
        <div class="toolbar-group">
          <span class="toolbar-label">节点</span>
          <button id="btn-add-child" class="btn icon-btn" title="添加子节点"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg></button>
          <button id="btn-add-sibling" class="btn icon-btn" title="添加同级节点"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 12H3"/><path d="M16 6H3"/><path d="M16 18H3"/><path d="M18 9v6"/><path d="M21 12h-6"/></svg></button>
          <button id="btn-add-parent" class="btn icon-btn" title="添加父节点"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/></svg></button>
          <button id="btn-delete" class="btn danger icon-btn" title="删除节点"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
        </div>
        <div class="toolbar-divider"></div>
        <div class="toolbar-group">
          <span class="toolbar-label">展开</span>
          <button id="btn-expand" class="btn icon-btn" title="展开"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg></button>
          <button id="btn-collapse" class="btn icon-btn" title="收起"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 20 5-5 5 5"/><path d="m7 4 5 5 5-5"/></svg></button>
          <button id="btn-level-1" class="btn">1</button>
          <button id="btn-level-2" class="btn">2</button>
          <button id="btn-level-3" class="btn">3</button>
          <button id="btn-expand-all" class="btn">全部</button>
        </div>
        <div class="toolbar-divider"></div>
        <div class="toolbar-group">
          <span class="toolbar-label">布局</span>
          <button class="btn tpl-btn" data-template="default">脑图</button>
          <button class="btn tpl-btn" data-template="right">右展</button>
          <button class="btn tpl-btn" data-template="structure">组织</button>
          <button id="btn-reset-layout" class="btn icon-btn" title="整理布局"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg></button>
        </div>
        <div class="toolbar-divider"></div>
        <div class="toolbar-group">
          <button id="btn-zoom-in" class="btn icon-btn" title="放大 (⌘+)"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6"/><path d="M8 11h6"/></svg></button>
          <button id="btn-zoom-out" class="btn icon-btn" title="缩小 (⌘-)"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6"/></svg></button>
          <button id="btn-center" class="btn icon-btn" title="居中"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v4"/><path d="M12 18v4"/><path d="M2 12h4"/><path d="M18 12h4"/></svg></button>
          <button id="btn-zoom-fit" class="btn icon-btn" title="适应画布"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg></button>
        </div>
        <div class="toolbar-divider"></div>
        <div class="toolbar-group">
          <button id="btn-undo" class="btn icon-btn" title="撤销 (Ctrl+Z)"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11"/></svg></button>
          <button id="btn-redo" class="btn icon-btn" title="重做 (Ctrl+Shift+Z)"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5 5.5 5.5 0 0 0 9.5 20H13"/></svg></button>
        </div>
      </div>

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
        <div class="canvas-area">
          <div id="mindmap-container" class="canvas-container"></div>
          <div id="error-overlay" class="error-overlay hidden">
            <div class="error-card">
              <h3>无法在图形编辑器中打开此文件</h3>
              <p id="error-message"></p>
              <button id="btn-open-source-error" class="btn accent">使用文本编辑器打开</button>
            </div>
          </div>
        </div>

        <aside class="sidebar" id="sidebar">
          <div class="sidebar-header">
            <span>节点属性</span>
            <div class="sidebar-meta" id="selection-meta">未选择节点</div>
          </div>
          <div class="sidebar-content">
            <div class="field">
              <label for="node-title">标题</label>
              <input id="node-title" type="text" placeholder="选择节点后编辑标题" disabled />
            </div>
            <div class="field field-grow">
              <label for="node-note">备注</label>
              <textarea
                id="node-note"
                placeholder="支持 Markdown 格式，留空移除备注"
                disabled
              ></textarea>
            </div>
          </div>
        </aside>
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

  private postMessage(webview: vscode.Webview, message: HostToWebviewMessage) {
    void webview.postMessage(message);
  }
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
