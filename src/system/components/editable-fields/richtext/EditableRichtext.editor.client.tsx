'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { EditableRichtextProps } from './EditableRichtext.client';
import { EditableRichtextDisplay } from './EditableRichtextDisplay';
import RichtextFieldInput from './RichtextFieldInput.client';
import EditableFieldWrapper from '../../editable-field-wrapper/EditableFieldWrapper.client';
import { useEditorMode, draftKey } from '@/src/system/store/editor-mode';
import type { RichtextDoc } from '@/src/system/content/richtextSchema';
import { translations } from '@/src/project/config/translations';

function docsAreEqual(a: RichtextDoc, b: RichtextDoc): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export default function EditableRichtextEditor({
  className,
  value,
  fieldId,
  bulletIcon,
}: EditableRichtextProps) {
  const pathname = usePathname();
  const key = draftKey(pathname, fieldId);
  const draftValue = useEditorMode((state) => state.drafts[key] as RichtextDoc | undefined);
  const setDraft = useEditorMode((state) => state.setDraft);
  const revertDraft = useEditorMode((state) => state.revertDraft);
  const displayValue = draftValue ?? value;
  const [draftDoc, setDraftDoc] = useState<RichtextDoc>(displayValue);
  const [editorInstanceKey, setEditorInstanceKey] = useState(0);

  function handleOpen() {
    setDraftDoc(displayValue);
    setEditorInstanceKey((k) => k + 1);
  }

  function handleSave() {
    if (docsAreEqual(draftDoc, value)) {
      revertDraft(key);
    } else {
      setDraft(key, draftDoc);
    }
  }

  function handleRevert() {
    revertDraft(key);
    setDraftDoc(value);
    setEditorInstanceKey((k) => k + 1);
  }

  return (
    <EditableFieldWrapper
      title={translations.richtext.dialogTitle}
      isDirty={draftValue !== undefined}
      confirmLabel={translations.common.apply}
      displayContent={
        <EditableRichtextDisplay className={className} value={displayValue} fieldId={fieldId} bulletIcon={bulletIcon} />
      }
      modalContent={
        <RichtextFieldInput key={editorInstanceKey} value={draftDoc} onChange={setDraftDoc} />
      }
      onOpen={handleOpen}
      onSave={handleSave}
      onClose={() => {}}
      onRevert={handleRevert}
    />
  );
}
