'use client';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { EditableTextProps } from './EditableText.client';
import { EditableTextDisplay } from './EditableTextDisplay';
import TextFieldInput from './TextFieldInput.client';
import EditableFieldWrapper from '../../editable-field-wrapper/EditableFieldWrapper.client';
import { useEditorMode, draftKey } from '@/src/system/store/editor-mode';
import { translations } from '@/src/project/config/translations';

export default function EditableTextEditor({ className, value, fieldId }: EditableTextProps) {
  const pathname = usePathname();
  const key = draftKey(pathname, fieldId);

  const draftValue = useEditorMode((state) => state.drafts[key] as string | undefined);
  const setDraft = useEditorMode((state) => state.setDraft);
  const revertDraft = useEditorMode((state) => state.revertDraft);

  const displayValue = draftValue ?? value;
  const [draftText, setDraftText] = useState(displayValue);

  function handleOpen() {
    setDraftText(displayValue);
  }

  function handleSave() {
    if (draftText === value) {
      revertDraft(key);
    } else {
      setDraft(key, draftText);
    }
  }

  function handleRevert() {
    revertDraft(key);
    setDraftText(value);
  }

  return (
    <EditableFieldWrapper
      title={translations.text.dialogTitle}
      layout="inline"
      isDirty={draftValue !== undefined}
      confirmLabel={translations.common.apply}
      displayContent={
        <EditableTextDisplay className={className} value={displayValue} fieldId={fieldId} />
      }
      modalContent={<TextFieldInput value={draftText} onChange={setDraftText} autoFocus />}
      onOpen={handleOpen}
      onSave={handleSave}
      onClose={() => {}}
      onRevert={handleRevert}
    />
  );
}
