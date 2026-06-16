import { marked, Renderer, type Tokens } from 'marked';

const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

function getSafeHref(href: string): string | null {
  const trimmed = href.trim();
  const compact = trimmed.replace(/[\u0000-\u001f\u007f\s]+/g, '');
  if (compact.length === 0 || compact.startsWith('//')) {
    return null;
  }

  const protocolMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(compact);
  if (protocolMatch && !SAFE_LINK_PROTOCOLS.has(protocolMatch[1].toLowerCase() + ':')) {
    return null;
  }

  return trimmed;
}

const safeRenderer = new Renderer<string, string>();

safeRenderer.html = ({ text }: Tokens.HTML | Tokens.Tag) => escapeHtml(text);

safeRenderer.link = function safeLinkRenderer({ href, title, tokens }: Tokens.Link) {
  const body = this.parser.parseInline(tokens);
  const safeHref = getSafeHref(href);
  if (!safeHref) {
    return body;
  }

  const titleAttribute = title ? ` title="${escapeAttribute(title)}"` : '';
  return `<a href="${escapeAttribute(safeHref)}"${titleAttribute}>${body}</a>`;
};

safeRenderer.image = ({ text }: Tokens.Image) => {
  return escapeHtml(text);
};

export function renderSafeMarkdown(markdown: string): string {
  return marked.parse(markdown, {
    async: false,
    breaks: true,
    gfm: true,
    renderer: safeRenderer
  }) as string;
}
