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

function renderBlock(node: RichtextBlockNode, key: string, bulletIcon?: ReactNode): ReactNode {
  if (node.type === 'paragraph') {
    return <p key={key}>{renderInlineContent(node.content, key)}</p>;
  }

  if (node.type === 'bulletList' && bulletIcon != null) {
    // The icon replaces the list marker as a flex item next to the text, so it never overlaps the text, whatever its
    // size: centered on the first line, a larger icon makes the item taller. Gap: `gap-2` plus the icon's own margin.
    // `role="list"`: Safari/VoiceOver no longer announce a list with `list-style: none` otherwise.
    return (
      <ul key={key} role="list" className="list-none ps-0">
        {node.content.map((item, itemIndex) => (
          <li key={`${key}-li${itemIndex}`} className="flex items-start gap-2">
            <span aria-hidden="true" className="flex min-h-lh shrink-0 items-center">
              {bulletIcon}
            </span>
            <span className="min-w-0">{renderInlineContent(item.content[0].content, `${key}-li${itemIndex}`)}</span>
          </li>
        ))}
      </ul>
    );
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

/**
 * Always adds the `richtext` class (styles in `src/project/styles/globals.css`), so richtext looks the same in
 * `EditableRichtext` and in collection items. Utility classes in `className` override these styles.
 */
export function RichtextRenderer({ doc, className, bulletIcon }: { doc: RichtextDoc; className?: string; bulletIcon?: ReactNode }) {
  return (
    <div className={`richtext ${className ?? ''}`.trim()}>
      {doc.content.map((node, index) => renderBlock(node, `b${index}`, bulletIcon))}
    </div>
  );
}
