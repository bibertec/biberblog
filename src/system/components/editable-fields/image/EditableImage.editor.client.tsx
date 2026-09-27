'use client';

import { usePathname } from 'next/navigation';
import { EditableImageProps } from './EditableImage.client';
import { EditableImageDisplay } from './EditableImageDisplay';
import { EditableImageDraftPreview } from './EditableImageDraftPreview.client';
import { ImageCropper } from './ImageCropper.client';
import { useImageCropEditor } from './useImageCropEditor.client';
import EditableFieldWrapper from '../../editable-field-wrapper/EditableFieldWrapper.client';
import { useEditorMode, draftKey } from '@/src/system/store/editor-mode';
import { isTempImageDraft, type ImageDraft } from '@/src/system/content/imageSchema';
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
  const draft = useEditorMode((state) => state.drafts[key] as ImageDraft | undefined);
  const tempDraft = isTempImageDraft(draft) ? draft : undefined;
  const setDraft = useEditorMode((state) => state.setDraft);
  const revertDraft = useEditorMode((state) => state.revertDraft);
  const editor = useImageCropEditor({ current: draft ?? value, currentImageUrl: image.src, rules });

  async function handleSave(): Promise<void> {
    const next = await editor.save();
    const isPublishedValue = !isTempImageDraft(next) && next.src === value.src && next.alt === value.alt;
    if (isPublishedValue) {
      revertDraft(key);
    } else {
      setDraft(key, next);
    }
    // A replaced temp upload is no longer referenced anywhere.
    const previousTempPathname = tempDraft?.temp.pathname;
    if (previousTempPathname && (!isTempImageDraft(next) || next.temp.pathname !== previousTempPathname)) {
      void discardTempImage(previousTempPathname);
    }
  }

  function handleRevert() {
    const previousTempPathname = tempDraft?.temp.pathname;
    revertDraft(key);
    if (previousTempPathname) {
      void discardTempImage(previousTempPathname);
    }
    editor.reset(value.alt);
  }

  const closedContent = (
    <div className="relative inline-block">
      {tempDraft ? (
        <EditableImageDraftPreview
          key={`${tempDraft.temp.pathname}:${tempDraft.crop.x}:${tempDraft.crop.y}:${tempDraft.crop.width}:${tempDraft.crop.height}:${tempDraft.crop.rotation}`}
          className={className}
          tempPathname={tempDraft.temp.pathname}
          crop={tempDraft.crop}
          width={rules.maxWidth}
          height={rules.maxHeight}
          alt={tempDraft.alt}
        />
      ) : (
        <EditableImageDisplay
          className={className}
          image={image}
          rules={rules}
          alt={draft?.alt ?? value.alt}
          {...loadingProps}
        />
      )}
    </div>
  );

  return (
    <EditableFieldWrapper
      title={translations.image.dialogTitle}
      isDirty={draft !== undefined}
      confirmLabel={translations.common.apply}
      displayContent={closedContent}
      modalContent={<ImageCropper key={editor.cropperKey} {...editor.cropperProps} />}
      onOpen={editor.open}
      onSave={handleSave}
      onClose={editor.close}
      onRevert={handleRevert}
    />
  );
}
