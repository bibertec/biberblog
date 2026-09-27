import Link from 'next/link';
import { EditableTextProps } from './EditableText.client';

export function EditableTextDisplay({ className, value, link }: EditableTextProps) {
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
