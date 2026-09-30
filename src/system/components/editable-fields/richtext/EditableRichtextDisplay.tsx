import { RichtextRenderer } from './RichtextRenderer';
import type { EditableRichtextProps } from './EditableRichtext.client';

export function EditableRichtextDisplay({ className, value, bulletIcon }: EditableRichtextProps) {
  return <RichtextRenderer doc={value} className={className} bulletIcon={bulletIcon} />;
}
