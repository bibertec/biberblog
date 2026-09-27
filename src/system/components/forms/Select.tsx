import type { ComponentProps } from 'react';
import { withFieldClassName } from './fieldStyles';

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={withFieldClassName(className)} {...props} />;
}
