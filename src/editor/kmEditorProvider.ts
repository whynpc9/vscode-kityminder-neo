import * as vscode from 'vscode';

import type { HostToWebviewMessage, WebviewToHostMessage } from '../shared/protocol';

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
    webviewPanel: vscode.WebviewPanel
  ): Promise<void> {
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

    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
    });

    webview.onDidReceiveMessage(async (message: WebviewToHostMessage) => {
      switch (message.type) {
        case 'ready': {
          this.postMessage(webview, {
            type: 'init',
            text: document.getText(),
            filename: vscode.workspace.asRelativePath(document.uri, false)
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
      content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' 'unsafe-eval'; font-src ${webview.cspSource};"
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
          <button id="btn-open-source" class="btn link">源码 JSON</button>
        </div>
      </header>

      <!-- Toolbar -->
      <div class="toolbar">
        <div class="toolbar-group">
          <span class="toolbar-label">节点</span>
          <button id="btn-add-child" class="btn">子节点</button>
          <button id="btn-add-sibling" class="btn">同级</button>
          <button id="btn-add-parent" class="btn">父级</button>
          <button id="btn-delete" class="btn danger">删除</button>
        </div>
        <div class="toolbar-divider"></div>
        <div class="toolbar-group">
          <span class="toolbar-label">展开</span>
          <button id="btn-expand" class="btn">展开</button>
          <button id="btn-collapse" class="btn">收起</button>
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
          <button id="btn-reset-layout" class="btn">整理</button>
        </div>
        <div class="toolbar-divider"></div>
        <div class="toolbar-group">
          <button id="btn-center" class="btn">居中</button>
          <button id="btn-zoom-fit" class="btn">适应</button>
        </div>
        <div class="toolbar-divider"></div>
        <div class="toolbar-group">
          <button id="btn-undo" class="btn" title="撤销 (Ctrl+Z)">撤销</button>
          <button id="btn-redo" class="btn" title="重做 (Ctrl+Shift+Z)">重做</button>
        </div>
      </div>

      <!-- Warning banner -->
      <div id="warning-banner" class="warning-banner hidden"></div>

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
