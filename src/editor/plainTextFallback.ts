import * as vscode from 'vscode';

/**
 * Git diff 左侧（只读）使用 `git:` scheme，见
 * https://github.com/microsoft/vscode/issues/97683
 */
export function isGitVirtualDocument(uri: vscode.Uri): boolean {
  return uri.scheme === 'git';
}

function uriMatchesDiffSide(uri: vscode.Uri, side: vscode.Uri): boolean {
  if (uri.scheme === 'file' && side.scheme === 'file') {
    return uri.fsPath === side.fsPath;
  }
  return uri.toString() === side.toString();
}

/** 当前文档 URI 是否为某个文本 diff 标签页中的一侧（含 SCM 中工作区文件一侧）。 */
export function isUriPartOfTextDiffTab(uri: vscode.Uri): boolean {
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      const input = tab.input;
      if (input instanceof vscode.TabInputTextDiff) {
        if (uriMatchesDiffSide(uri, input.original) || uriMatchesDiffSide(uri, input.modified)) {
          return true;
        }
      }
    }
  }
  return false;
}

function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForDiffTabMatch(
  uri: vscode.Uri,
  timeoutMs: number,
  pollIntervalMs: number
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  if (isUriPartOfTextDiffTab(uri)) {
    return true;
  }

  return await new Promise<boolean>((resolve) => {
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    let timeout: NodeJS.Timeout | undefined;

    const finish = (matched: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearInterval(timer);
      }
      if (timeout) {
        clearTimeout(timeout);
      }
      tabChangeDisposable.dispose();
      resolve(matched);
    };

    const probe = () => {
      if (isUriPartOfTextDiffTab(uri)) {
        finish(true);
        return;
      }
      if (Date.now() >= deadline) {
        finish(false);
      }
    };

    const tabChangeDisposable = vscode.window.tabGroups.onDidChangeTabs(() => {
      probe();
    });

    timer = setInterval(probe, pollIntervalMs);
    timeout = setTimeout(() => finish(false), timeoutMs);
  });
}

/**
 * Source Control / compare 打开的 diff 标签页，在 custom editor resolve 时常常还没完成注册。
 * 这里给一个短暂但更可靠的观察窗口，让 diff 场景回退文本编辑器。
 */
export async function shouldUsePlainTextInsteadOfCustomEditor(uri: vscode.Uri): Promise<boolean> {
  if (isGitVirtualDocument(uri)) {
    return true;
  }
  if (isUriPartOfTextDiffTab(uri)) {
    return true;
  }

  await delay(0);
  if (isUriPartOfTextDiffTab(uri)) {
    return true;
  }

  return await waitForDiffTabMatch(uri, 1200, 25);
}

export async function replaceCustomEditorWithPlainText(
  uri: vscode.Uri,
  webviewPanel: vscode.WebviewPanel
): Promise<void> {
  const column = webviewPanel.viewColumn ?? vscode.ViewColumn.Active;
  webviewPanel.dispose();
  await vscode.commands.executeCommand('vscode.openWith', uri, 'default', column);
}
