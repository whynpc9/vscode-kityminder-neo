import { describe, expect, it } from 'vitest';

import { isImeCompositionKeyEvent } from '../src/webview/keyboard';

describe('webview keyboard helpers', () => {
  it('detects IME composition key events', () => {
    expect(isImeCompositionKeyEvent({ isComposing: true, keyCode: 13 })).toBe(true);
    expect(isImeCompositionKeyEvent({ isComposing: false, keyCode: 229 })).toBe(true);
    expect(isImeCompositionKeyEvent({ isComposing: false, keyCode: 13 })).toBe(false);
  });
});
