import { Mark, type Extensions } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Bold from '@tiptap/extension-bold';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';
import { isKnownPagePath } from '@/src/system/content/pageLinks';

export type RichtextLinkAttrs = {
  href: string;
  isExternal: boolean;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    richtextLink: {
      setRichtextLink: (attrs: RichtextLinkAttrs) => ReturnType;
      unsetRichtextLink: () => ReturnType;
    };
  }
}

const RichtextLink = Mark.create({
  name: 'link',
  inclusive: false,
  addAttributes() {
    return {
      href: { default: null },
      isExternal: { default: true },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'a[href]',
        getAttrs: (element) => {
          if (typeof element === 'string') return false;
          const href = element.getAttribute('href') ?? '';
          if (!href) return false;
          return { href, isExternal: !isKnownPagePath(href) };
        },
      },
    ];
  },
  renderHTML({ mark }) {
    const isExternal = mark.attrs.isExternal;
    return [
      'a',
      {
        href: mark.attrs.href,
        target: isExternal ? '_blank' : null,
        rel: isExternal ? 'noopener noreferrer' : null,
      },
      0,
    ];
  },
  addCommands() {
    return {
      setRichtextLink:
        (attrs: RichtextLinkAttrs) =>
        ({ chain }) =>
          chain().setMark(this.name, attrs).run(),
      unsetRichtextLink:
        () =>
        ({ chain }) =>
          chain().unsetMark(this.name).run(),
    };
  },
});

export const richtextExtensions: Extensions = [
  Document,
  Paragraph,
  Text,
  Bold,
  BulletList,
  OrderedList,
  ListItem.extend({ content: 'paragraph' }),
  RichtextLink,
];
