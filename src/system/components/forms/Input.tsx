import type { ComponentProps } from 'react';
import { withFieldClassName } from './fieldStyles';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={withFieldClassName(className)} {...props} />;
}
