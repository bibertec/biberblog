import { Fragment, type ReactNode } from 'react';
import type { CollectionItem } from './collectionTypes';

type EditableCollectionDisplayProps<TItem extends CollectionItem> = {
  className?: string;
  value: TItem[];
  renderItem: (item: TItem) => ReactNode;
};

export function EditableCollectionDisplay<TItem extends CollectionItem>({
  className,
  value,
  renderItem,
}: EditableCollectionDisplayProps<TItem>) {
  return (
    <div className={className}>
      {value.map((item) => (
        <Fragment key={item.id}>{renderItem(item)}</Fragment>
      ))}
    </div>
  );
}
