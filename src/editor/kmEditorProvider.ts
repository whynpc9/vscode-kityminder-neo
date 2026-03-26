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
        vscode.Uri.joinPath(this.context.extensionUri, 'media')
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
    const webviewScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js')
    );
    const webviewStylesUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.css')
    );
    const kityScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'kity.min.js')
    );
    const kityMinderScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'kityminder.core.min.js')
    );
    const kityMinderStylesUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'kityminder.core.css')
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
    <link rel="stylesheet" href="${kityMinderStylesUri}" />
    <link rel="stylesheet" href="${webviewStylesUri}" />
  </head>
  <body>
    <div id="app" class="app-shell">
      <div class="topbar">
        <div class="brand">
          <div class="brand-mark">KM</div>
          <div>
            <div class="brand-title">KityMinder Neo</div>
            <div class="brand-subtitle" id="filename"></div>
          </div>
        </div>
        <div class="toolbar">
          <button id="btn-add-child" class="toolbar-btn">子节点</button>
          <button id="btn-add-sibling" class="toolbar-btn">同级</button>
          <button id="btn-add-parent" class="toolbar-btn">父节点</button>
          <button id="btn-delete" class="toolbar-btn danger">删除</button>
          <span class="toolbar-separator"></span>
          <button id="btn-expand" class="toolbar-btn">展开</button>
          <button id="btn-collapse" class="toolbar-btn">收起</button>
          <button id="btn-expand-all" class="toolbar-btn">展开全部</button>
          <span class="toolbar-separator"></span>
          <button id="btn-template-default" class="toolbar-btn template-btn" data-template="default">默认</button>
          <button id="btn-template-right" class="toolbar-btn template-btn" data-template="right">右侧</button>
          <button id="btn-template-structure" class="toolbar-btn template-btn" data-template="structure">结构</button>
          <button id="btn-reset-layout" class="toolbar-btn">整理布局</button>
          <button id="btn-position-mode" class="toolbar-btn accent">位置模式</button>
        </div>
      </div>

      <div id="warning-banner" class="banner hidden"></div>

      <div class="workspace">
        <div class="canvas-panel">
          <div class="panel-header">
            <div>思维导图</div>
            <div class="panel-actions">
              <button id="btn-center" class="link-btn">居中</button>
              <button id="btn-open-source" class="link-btn">源码 JSON</button>
            </div>
          </div>
          <div id="mindmap-container" class="mindmap-container"></div>
          <div id="error-overlay" class="error-overlay hidden">
            <div class="error-card">
              <div class="error-title">无法在图形编辑器中打开此文件</div>
              <p id="error-message" class="error-message"></p>
              <button id="btn-open-source-error" class="toolbar-btn">使用文本编辑器打开</button>
            </div>
          </div>
        </div>

        <aside class="sidebar">
          <div class="panel-header">节点属性</div>
          <div class="field-group">
            <label class="field-label" for="node-title">标题</label>
            <input id="node-title" class="text-field" type="text" placeholder="选择节点后编辑标题" />
          </div>
          <div class="field-group grow">
            <label class="field-label" for="node-note">备注</label>
            <textarea
              id="node-note"
              class="text-area"
              placeholder="支持 Markdown 文本，空内容会移除备注"
            ></textarea>
          </div>
          <div class="panel-header">查看</div>
          <div class="view-grid">
            <button id="btn-level-1" class="toolbar-btn">一级</button>
            <button id="btn-level-2" class="toolbar-btn">二级</button>
            <button id="btn-level-3" class="toolbar-btn">三级</button>
            <button id="btn-level-all" class="toolbar-btn">全部</button>
          </div>
          <div class="meta-block" id="selection-meta">未选择节点</div>
        </aside>
      </div>
    </div>

    <script nonce="${nonce}" src="${kityScriptUri}"></script>
    <script nonce="${nonce}" src="${kityMinderScriptUri}"></script>
    <script nonce="${nonce}" src="${webviewScriptUri}"></script>
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
