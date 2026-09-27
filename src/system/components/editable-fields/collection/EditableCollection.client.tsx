'use client';
import { type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useEditorMode } from '@/src/system/store/editor-mode';
import { EditableCollectionDisplay } from './EditableCollectionDisplay';
import { EditorFieldProps } from '../types';
import { CollectionImagesProvider } from './CollectionImages.client';
import type { CollectionItem, ItemFieldDef } from './collectionTypes';
import type { ResolvedImages } from '@/src/system/lib/images/loadContentImage';

const NO_IMAGES: ResolvedImages = {};

const EditableCollectionEditor = dynamic(() => import('./EditableCollection.editor.client'), {
  ssr: false,
  loading: () => null,
});

export type EditableCollectionProps<TItem extends CollectionItem> = EditorFieldProps & {
  value: TItem[];
  itemFields: ItemFieldDef[];
  titleField: keyof TItem & string;
  renderItem: (item: TItem) => ReactNode;
  createItem: () => TItem;
  /** Image URLs of image item fields, resolved on the server (`loadCollectionImages`). */
  images?: ResolvedImages;
};

export default function EditableCollection<TItem extends CollectionItem>({
  className,
  value,
  fieldId,
  itemFields,
  titleField,
  renderItem,
  createItem,
  images = NO_IMAGES,
}: EditableCollectionProps<TItem>) {
  const isEditorMode = useEditorMode((state) => state.editMode);

  return (
    <CollectionImagesProvider images={images}>
      {isEditorMode ? (
        <EditableCollectionEditor
          className={className}
          value={value}
          fieldId={fieldId}
          itemFields={itemFields}
          titleField={titleField}
          renderItem={renderItem as (item: CollectionItem) => ReactNode}
          createItem={createItem as () => CollectionItem}
        />
      ) : (
        <EditableCollectionDisplay className={className} value={value} renderItem={renderItem} />
      )}
    </CollectionImagesProvider>
  );
}
