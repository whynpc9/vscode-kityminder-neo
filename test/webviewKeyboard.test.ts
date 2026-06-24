import { describe, expect, it } from 'vitest';

import {
  isImeCompositionKeyEvent,
  isInlineEditNativeTextShortcut,
} from '../src/webview/keyboard';

describe('webview keyboard helpers', () => {
  it('detects IME composition key events', () => {
    expect(isImeCompositionKeyEvent({ isComposing: true, keyCode: 13 })).toBe(true);
    expect(isImeCompositionKeyEvent({ isComposing: false, keyCode: 229 })).toBe(true);
    expect(isImeCompositionKeyEvent({ isComposing: false, keyCode: 13 })).toBe(false);
  });

  it('lets native inline edit text shortcuts reach the host', () => {
    expect(isInlineEditNativeTextShortcut({
      altKey: false,
      ctrlKey: false,
      key: 'c',
      metaKey: true,
    })).toBe(true);
    expect(isInlineEditNativeTextShortcut({
      altKey: false,
      ctrlKey: true,
      key: 'C',
      metaKey: false,
    })).toBe(true);
    expect(isInlineEditNativeTextShortcut({
      altKey: true,
      ctrlKey: false,
      key: 'c',
      metaKey: true,
    })).toBe(false);
    expect(isInlineEditNativeTextShortcut({
      altKey: false,
      ctrlKey: false,
      key: 'c',
      metaKey: false,
    })).toBe(false);
  });
});
