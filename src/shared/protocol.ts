export type SaveExpandState = 'preserve' | 'expandAll' | 'level1' | 'level2' | 'level3';
export type ExportImageFormat = 'png' | 'svg';
export type ExportFileFormat = ExportImageFormat | 'xmind';
export type ExportImageEncoding = 'utf8' | 'base64';

export type HostToWebviewMessage =
  | {
      type: 'init';
      text: string;
      filename: string;
      config: WebviewConfig;
    }
  | {
      type: 'documentReplaced';
      text: string;
    }
  | {
      type: 'configChanged';
      config: WebviewConfig;
    }
  | {
      type: 'error';
      message: string;
    }
  | {
      type: 'importWarnings';
      warnings: string[];
    }
  | {
      type: 'exportImage';
      requestId: string;
      format: ExportImageFormat;
      backgroundColor: string | null;
    }
  | {
      type: 'exportXmind';
      requestId: string;
    };

export interface WebviewConfig {
  saveExpandState: SaveExpandState;
}

export type WebviewToHostMessage =
  | {
      type: 'ready';
    }
  | {
      type: 'applyEdit';
      text: string;
    }
  | {
      type: 'revealSourceJson';
    }
  | {
      type: 'showWarning';
      warning: string;
    }
  | {
      type: 'requestExportFile';
    }
  | {
      type: 'saveExportedImage';
      requestId: string;
      format: ExportImageFormat;
      encoding: ExportImageEncoding;
      data: string;
    }
  | {
      type: 'saveExportedXmind';
      requestId: string;
      text: string;
    };
