import Link from 'next/link';
import { EditableTextProps } from './EditableText.client';

export function EditableTextDisplay({ className, value, link }: EditableTextProps) {
  // Anchor on the same page: a native link. `next/link` only scrolls when the hash changes – with the
  // hash already in the URL, another click would do nothing. The browser scrolls on every click.
  if (link?.href.startsWith('#')) {
    return (
      <a href={link.href} className={className}>
        {value}
      </a>
    );
  }
  if (link?.href && !link?.isExternal) {
    return (
      <Link href={link.href} className={className}>
        {value}
      </Link>
    );
  }
  if (link?.href && link?.isExternal) {
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer" className={className}>
        {value}
      </a>
    );
  }
  return <span className={className}>{value}</span>;
}
