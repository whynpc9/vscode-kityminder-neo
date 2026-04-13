import * as vscode from 'vscode';

import { KmEditorProvider, KM_EDITOR_VIEW_TYPE } from './editor/kmEditorProvider';
import { importXmindArchive } from './import/xmindImport';
import { stringifyKmDocument } from './shared/km';

export function activate(context: vscode.ExtensionContext) {
  const importWarnings = new Map<string, string[]>();

  context.subscriptions.push(KmEditorProvider.register(context, importWarnings));

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'kityminderNeo.openMindmapEditor',
      async (resource?: vscode.Uri) => {
        const target = resource ?? getActiveResourceUri();
        if (!target) {
          void vscode.window.showWarningMessage('No KM file available to open in the mindmap editor.');
          return;
        }
        await vscode.commands.executeCommand('vscode.openWith', target, KM_EDITOR_VIEW_TYPE);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'kityminderNeo.importXmindToKm',
      async (resource?: vscode.Uri) => {
        await importXmindToKm(importWarnings, resource);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'kityminderNeo.revealSourceJson',
      async (resource?: vscode.Uri) => {
        const target = resource ?? getActiveResourceUri();
        if (!target) {
          void vscode.window.showWarningMessage('No active KM document to open as JSON.');
          return;
        }
        await vscode.commands.executeCommand('vscode.openWith', target, 'default');
      }
    )
  );
}

export function deactivate() {}

async function importXmindToKm(
  importWarnings: Map<string, string[]>,
  resource?: vscode.Uri
): Promise<void> {
  const sourceUri =
    resource ??
    (
      await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: {
          XMind: ['xmind']
        },
        openLabel: 'Select XMind file'
      })
    )?.[0];

  if (!sourceUri) {
    return;
  }

  try {
    const archive = await vscode.workspace.fs.readFile(sourceUri);
    const result = await importXmindArchive(archive);
    const targetUri = await vscode.window.showSaveDialog({
      defaultUri: withExtension(sourceUri, '.km'),
      filters: {
        'KityMinder KM': ['km']
      },
      saveLabel: 'Save KM file'
    });

    if (!targetUri) {
      return;
    }

    await vscode.workspace.fs.writeFile(
      targetUri,
      Buffer.from(stringifyKmDocument(result.km), 'utf8')
    );

    if (result.warnings.length > 0) {
      importWarnings.set(targetUri.toString(), result.warnings);
      void vscode.window.showWarningMessage(
        `Imported with ${result.warnings.length} warning${result.warnings.length > 1 ? 's' : ''}.`
      );
    }

    await vscode.commands.executeCommand('vscode.openWith', targetUri, KM_EDITOR_VIEW_TYPE);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`Failed to import XMind file: ${message}`);
  }
}

function withExtension(uri: vscode.Uri, extension: string): vscode.Uri {
  const nextPath = uri.path.replace(/\.[^/.]+$/, '');
  return uri.with({
    path: `${nextPath}${extension}`
  });
}

function getActiveResourceUri(): vscode.Uri | undefined {
  const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
  if (!activeTab) {
    return vscode.window.activeTextEditor?.document.uri;
  }

  const input = activeTab.input;
  if (input instanceof vscode.TabInputCustom) {
    return input.uri;
  }
  if (input instanceof vscode.TabInputText) {
    return input.uri;
  }
  if (input instanceof vscode.TabInputNotebook) {
    return input.uri;
  }

  return vscode.window.activeTextEditor?.document.uri;
}
