import type { ComponentProps } from 'react';
import { withFieldClassName } from './fieldStyles';

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={withFieldClassName(className)} {...props} />;
}
