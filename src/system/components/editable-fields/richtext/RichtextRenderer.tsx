import { Fragment, type ReactNode } from 'react';
import Link from 'next/link';
import type {
  RichtextDoc,
  RichtextBlockNode,
  RichtextTextNode,
  RichtextMark,
} from '@/src/system/content/richtextSchema';

function renderMarks(text: string, marks: RichtextMark[] | undefined, key: string): ReactNode {
  if (!marks || marks.length === 0) {
    return text;
  }

  return marks.reduce<ReactNode>((content, mark, index) => {
    if (mark.type === 'bold') {
      return <strong key={`${key}-bold-${index}`}>{content}</strong>;
    }

    if (mark.attrs.isExternal) {
      return (
        <a key={`${key}-link-${index}`} href={mark.attrs.href} target="_blank" rel="noopener noreferrer">
          {content}
        </a>
      );
    }

    return (
      <Link key={`${key}-link-${index}`} href={mark.attrs.href}>
        {content}
      </Link>
    );
  }, text);
}

function renderInlineContent(nodes: RichtextTextNode[] | undefined, keyPrefix: string): ReactNode {
  return nodes?.map((node, index) => (
    <Fragment key={`${keyPrefix}-t${index}`}>
      {renderMarks(node.text, node.marks, `${keyPrefix}-t${index}`)}
    </Fragment>
  ));
}

function renderBlock(node: RichtextBlockNode, key: string): ReactNode {
  if (node.type === 'paragraph') {
    return <p key={key}>{renderInlineContent(node.content, key)}</p>;
  }

  const ListTag = node.type === 'bulletList' ? 'ul' : 'ol';

  return (
    <ListTag key={key}>
      {node.content.map((item, itemIndex) => {
        const paragraph = item.content[0];
        return (
          <li key={`${key}-li${itemIndex}`}>
            {renderInlineContent(paragraph.content, `${key}-li${itemIndex}`)}
          </li>
        );
      })}
    </ListTag>
  );
}

export function RichtextRenderer({ doc, className }: { doc: RichtextDoc; className?: string }) {
  return <div className={className}>{doc.content.map((node, index) => renderBlock(node, `b${index}`))}</div>;
}
