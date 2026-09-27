import { describe, expect, it } from 'vitest';
import { richtextDocSchema } from './richtextSchema';

type Mark = Record<string, unknown>;

function docWithText(text: string, marks?: Mark[]) {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text, ...(marks ? { marks } : {}) }] }],
  };
}

function docWithLink(href: string, isExternal: boolean) {
  return docWithText('Link', [{ type: 'link', attrs: { href, isExternal } }]);
}

function listDoc(type: 'bulletList' | 'orderedList', items: unknown[]) {
  return { type: 'doc', content: [{ type, content: items }] };
}

const item = (text: string) => ({
  type: 'listItem',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

describe('richtextDocSchema: structure', () => {
  it('accepts paragraphs with bold text and lists', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hallo ' },
            { type: 'text', text: 'Welt', marks: [{ type: 'bold' }] },
          ],
        },
        { type: 'paragraph' },
        { type: 'bulletList', content: [item('a'), item('b')] },
        { type: 'orderedList', content: [item('1')] },
      ],
    };

    expect(richtextDocSchema.safeParse(doc).success).toBe(true);
  });

  it.each([
    ['an empty document', { type: 'doc', content: [] }],
    ['a heading', { type: 'doc', content: [{ type: 'heading', content: [{ type: 'text', text: 'x' }] }] }],
    ['a code block', { type: 'doc', content: [{ type: 'codeBlock', content: [{ type: 'text', text: 'x' }] }] }],
    ['an empty text node', docWithText('')],
    ['an unknown mark (italic)', docWithText('x', [{ type: 'italic' }])],
    ['more than two marks', docWithText('x', [{ type: 'bold' }, { type: 'bold' }, { type: 'bold' }])],
    ['an empty list', listDoc('bulletList', [])],
    [
      'a list item with two paragraphs',
      listDoc('bulletList', [{ ...item('a'), content: [...item('a').content, ...item('b').content] }]),
    ],
    ['a nested list', listDoc('bulletList', [{ type: 'listItem', content: [listDoc('bulletList', [item('x')]).content[0]] }])],
    ['a wrong root type', { type: 'paragraph', content: [] }],
  ])('rejects %s', (_, doc) => {
    expect(richtextDocSchema.safeParse(doc).success).toBe(false);
  });
});

describe('richtextDocSchema: links', () => {
  it.each(['https://example.com', 'http://example.com/path?q=1#x'])('accepts the external link %s', (href) => {
    expect(richtextDocSchema.safeParse(docWithLink(href, true)).success).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'mailto:info@example.com',
    '//example.com',
    '/relative',
    'not a url',
  ])('rejects the external link %s', (href) => {
    expect(richtextDocSchema.safeParse(docWithLink(href, true)).success).toBe(false);
  });

  it('accepts an internal link to a known page', () => {
    expect(richtextDocSchema.safeParse(docWithLink('/', false)).success).toBe(true);
  });

  it.each(['/unknown-page', 'https://example.com', 'javascript:alert(1)', ''])(
    'rejects the internal link %s',
    (href) => {
      expect(richtextDocSchema.safeParse(docWithLink(href, false)).success).toBe(false);
    },
  );

  it('rejects link marks without isExternal', () => {
    const doc = docWithText('x', [{ type: 'link', attrs: { href: 'https://example.com' } }]);

    expect(richtextDocSchema.safeParse(doc).success).toBe(false);
  });
});
