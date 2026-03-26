export type HostToWebviewMessage =
  | {
      type: 'init';
      text: string;
      filename: string;
    }
  | {
      type: 'documentReplaced';
      text: string;
    }
  | {
      type: 'error';
      message: string;
    }
  | {
      type: 'importWarnings';
      warnings: string[];
    };

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
