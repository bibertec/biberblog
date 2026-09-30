'use client';
import type { ReactNode } from 'react';
import { EditorFieldProps } from '../types';
import dynamic from 'next/dynamic';
import { useEditorMode } from '@/src/system/store/editor-mode';
import { EditableRichtextDisplay } from './EditableRichtextDisplay';
import type { RichtextDoc } from '@/src/system/content/richtextSchema';

const EditableRichtextEditor = dynamic(() => import('./EditableRichtext.editor.client'), {
  ssr: false,
  loading: () => null,
});

export type EditableRichtextProps = EditorFieldProps & {
  value: RichtextDoc;
  bulletIcon?: ReactNode;
};

export default function EditableRichtext({ className, value, fieldId, bulletIcon }: EditableRichtextProps) {
  const isEditorMode = useEditorMode((state) => state.editMode);

  if (!isEditorMode) {
    return <EditableRichtextDisplay className={className} value={value} fieldId={fieldId} bulletIcon={bulletIcon} />;
  }

  return <EditableRichtextEditor className={className} value={value} fieldId={fieldId} bulletIcon={bulletIcon} />;
}
