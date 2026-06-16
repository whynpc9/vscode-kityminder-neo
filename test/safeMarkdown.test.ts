import { describe, expect, it } from 'vitest';

import { renderSafeMarkdown } from '../src/webview/safeMarkdown';

describe('safe markdown rendering', () => {
  it('keeps common markdown while escaping raw html', () => {
    const html = renderSafeMarkdown('**Bold** <style>body{display:none}</style> <img src=x onerror=alert(1)>');

    expect(html).toContain('<strong>Bold</strong>');
    expect(html).not.toContain('<style>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;style&gt;body{display:none}&lt;/style&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('drops unsafe link targets and keeps safe links', () => {
    const html = renderSafeMarkdown('[bad](javascript:alert(1)) [good](https://example.com?a=1&b=2)');

    expect(html).not.toContain('javascript:');
    expect(html).toContain('bad');
    expect(html).toContain('<a href="https://example.com?a=1&amp;b=2">good</a>');
  });
});
