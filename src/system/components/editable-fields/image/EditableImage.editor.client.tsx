'use client';

import { usePathname } from 'next/navigation';
import { EditableImageProps } from './EditableImage.client';
import { EditableImageDisplay } from './EditableImageDisplay';
import { EditableImageDraftPreview, ResponsiveImageDraftPreview } from './EditableImageDraftPreview.client';
import { ImageCropper } from './ImageCropper.client';
import { useImageCropEditor } from './useImageCropEditor.client';
import EditableFieldWrapper from '../../editable-field-wrapper/EditableFieldWrapper.client';
import { useEditorMode, draftKey } from '@/src/system/store/editor-mode';
import {
  isResponsiveImageDraft,
  isSameImageValue,
  isTempImageDraft,
  tempPathnamesOf,
  type FieldImageDraft,
} from '@/src/system/content/imageSchema';
import { discardTempImage } from '@/src/system/lib/images/actions';
import { translations } from '@/src/project/config/translations';

export default function EditableImageEditor({
  className,
  value,
  image,
  rules,
  fieldId,
  ...loadingProps
}: EditableImageProps) {
  const pathname = usePathname();
  const key = draftKey(pathname, fieldId);
  const draft = useEditorMode((state) => state.drafts[key] as FieldImageDraft | undefined);
  const setDraft = useEditorMode((state) => state.setDraft);
  const revertDraft = useEditorMode((state) => state.revertDraft);
  const editor = useImageCropEditor({ current: draft ?? value, currentImage: image, rules, published: value });

  async function handleSave(): Promise<void> {
    const next = await editor.save();
    const isPublishedValue = !isTempImageDraft(next) && !isResponsiveImageDraft(next) && isSameImageValue(next, value);
    if (isPublishedValue) {
      revertDraft(key);
    } else {
      setDraft(key, next);
    }
    // Replaced temp uploads are no longer referenced anywhere.
    const kept = new Set(tempPathnamesOf(next));
    for (const previousTempPathname of tempPathnamesOf(draft)) {
      if (!kept.has(previousTempPathname)) void discardTempImage(previousTempPathname);
    }
  }

  function handleRevert() {
    const previousTempPathnames = tempPathnamesOf(draft);
    revertDraft(key);
    previousTempPathnames.forEach((previousTempPathname) => void discardTempImage(previousTempPathname));
    editor.reset(value);
  }

  function draftPreview() {
    if (isResponsiveImageDraft(draft) && rules.mobile) {
      return <ResponsiveImageDraftPreview className={className} draft={draft} image={image} rules={{ ...rules, mobile: rules.mobile }} />;
    }
    if (isTempImageDraft(draft)) {
      return (
        <EditableImageDraftPreview
          key={`${draft.temp.pathname}:${draft.crop.x}:${draft.crop.y}:${draft.crop.width}:${draft.crop.height}:${draft.crop.rotation}`}
          className={className}
          tempPathname={draft.temp.pathname}
          crop={draft.crop}
          width={rules.maxWidth}
          height={rules.maxHeight}
          alt={draft.alt}
        />
      );
    }

    return <EditableImageDisplay className={className} image={image} rules={rules} alt={draft?.alt ?? value.alt} {...loadingProps} />;
  }

  return (
    <EditableFieldWrapper
      title={translations.image.dialogTitle}
      isDirty={draft !== undefined}
      confirmLabel={translations.common.apply}
      displayContent={<div className="relative inline-block">{draftPreview()}</div>}
      modalContent={<ImageCropper key={editor.cropperKey} {...editor.cropperProps} />}
      onOpen={editor.open}
      onSave={handleSave}
      onClose={editor.close}
      onRevert={handleRevert}
    />
  );
}
