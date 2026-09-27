import { RichtextRenderer } from './RichtextRenderer';
import type { EditableRichtextProps } from './EditableRichtext.client';

export function EditableRichtextDisplay({ className, value }: EditableRichtextProps) {
  return <RichtextRenderer doc={value} className={`richtext ${className ?? ''}`.trim()} />;
}
