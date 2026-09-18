import { describe, expect, it } from 'vitest';

import {
  getHistoryShortcut,
  isImeCompositionKeyEvent,
  isInlineEditNativeTextShortcut,
} from '../src/webview/keyboard';

describe('webview keyboard helpers', () => {
  it('matches history shortcuts by modifiers rather than letter casing', () => {
    const base = { ctrlKey: true, metaKey: false, altKey: false, shiftKey: false };
    expect(getHistoryShortcut({ ...base, key: 'Z' })).toBe('undo');
    expect(getHistoryShortcut({ ...base, key: 'z', shiftKey: true })).toBe('redo');
    expect(getHistoryShortcut({ ...base, key: 'Y' })).toBe('redo');
    expect(getHistoryShortcut({ ...base, key: 'z', altKey: true })).toBeNull();
    expect(getHistoryShortcut({ ...base, key: 'y', shiftKey: true })).toBeNull();
    expect(getHistoryShortcut({ ...base, key: 'z', ctrlKey: false })).toBeNull();
    expect(getHistoryShortcut({ ...base, key: 'Z', ctrlKey: false, metaKey: true })).toBe('undo');
  });

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
