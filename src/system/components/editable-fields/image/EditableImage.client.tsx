'use client';
import dynamic from 'next/dynamic';
import { EditorFieldProps } from '../types';
import { useEditorMode } from '@/src/system/store/editor-mode';
import { EditableImageDisplay, type ImageLoadingProps } from './EditableImageDisplay';
import type { ImageValue } from '@/src/system/content/imageSchema';
import type { ImageFieldRules } from '@/src/project/content/imageFieldRegistry';
import type { ResolvedImage } from '@/src/system/lib/images/loadContentImage';

const EditableImageEditor = dynamic(() => import('./EditableImage.editor.client'), {
  ssr: false,
  loading: () => null,
});

export type EditableImageProps = EditorFieldProps &
  ImageLoadingProps & {
    value: ImageValue;
    image: ResolvedImage;
    rules: ImageFieldRules;
  };

export default function EditableImage({ className, value, image, rules, fieldId, ...loadingProps }: EditableImageProps) {
  const isEditorMode = useEditorMode((state) => state.editMode);

  if (!isEditorMode) {
    return <EditableImageDisplay className={className} image={image} rules={rules} alt={value.alt} {...loadingProps} />;
  }

  return <EditableImageEditor className={className} value={value} image={image} rules={rules} fieldId={fieldId} {...loadingProps} />;
}
