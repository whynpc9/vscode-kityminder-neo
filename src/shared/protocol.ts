export type SaveExpandState = 'preserve' | 'expandAll' | 'level1' | 'level2' | 'level3';

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
    };
