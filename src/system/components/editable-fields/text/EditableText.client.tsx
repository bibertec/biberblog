'use client';
import { EditorFieldProps } from '../types';
import dynamic from 'next/dynamic';
import { useEditorMode } from '@/src/system/store/editor-mode';
import { EditableTextDisplay } from './EditableTextDisplay';

const EditableTextEditor = dynamic(() => import('./EditableText.editor.client'), {
  ssr: false,
  loading: () => null,
});

export type EditableTextProps = EditorFieldProps & {
  value: string;
  link?: {
    /**
     * A page path (`/about`, rendered with `next/link`), an anchor on the current page (`#section`,
     * a native link that scrolls on every click) or, with `isExternal`, an external URL (new tab).
     */
    href: string;
    isExternal?: boolean;
  };
};

export default function EditableText({ className, value, link, fieldId }: EditableTextProps) {
  const isEditorMode = useEditorMode((state) => state.editMode);

  if (!isEditorMode) {
    return (
      <EditableTextDisplay className={className} value={value} link={link} fieldId={fieldId} />
    );
  }

  return <EditableTextEditor className={className} value={value} fieldId={fieldId} />;
}
