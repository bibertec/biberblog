'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Dialog } from '../../dialog/Dialog.client';
import { ImageCropper } from './ImageCropper.client';
import { useImageCropEditor } from './useImageCropEditor.client';
import { CollectionImage, useCollectionImageUrl } from '../collection/CollectionImages.client';
import { isTempImageDraft, type ImageDraft } from '@/src/system/content/imageSchema';
import type { ImageFieldRules } from '@/src/project/content/imageFieldRegistry';
import { translations } from '@/src/project/config/translations';

const THUMBNAIL_WIDTH = 128;

type ImageFieldInputProps = {
  value: ImageDraft;
  rules: ImageFieldRules;
  onChange: (value: ImageDraft) => void;
};

/**
 * Raw image input for an image field inside a collection item: thumbnail plus a button that opens
 * the same crop dialog as the top-level image field. The dialog is rendered through a portal
 * because it is opened from within the collection dialog (no nested forms).
 */
export default function ImageFieldInput({ value, rules, onChange }: ImageFieldInputProps) {
  const imageUrl = useCollectionImageUrl(isTempImageDraft(value) ? '' : value.src);
  const editor = useImageCropEditor({ current: value, currentImageUrl: imageUrl, rules });
  const [isOpen, setIsOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpen() {
    setError(null);
    editor.open();
    setIsOpen(true);
  }

  function handleCancel() {
    editor.close();
    setError(null);
    setIsOpen(false);
  }

  async function handleConfirm() {
    setError(null);
    setIsConfirming(true);
    try {
      onChange(await editor.save());
      editor.close();
      setIsOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : translations.common.saveFailed);
    } finally {
      setIsConfirming(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <CollectionImage value={value} rules={rules} width={THUMBNAIL_WIDTH} className="rounded border" />
      <button type="button" onClick={handleOpen} className="px-3 py-1.5 rounded border text-sm">
        {translations.image.change}
      </button>
      {isOpen &&
        createPortal(
          <Dialog
            open
            title={translations.image.dialogTitle}
            confirmLabel={translations.common.apply}
            error={error}
            isConfirming={isConfirming}
            onCancel={handleCancel}
            onConfirm={handleConfirm}
          >
            <ImageCropper key={editor.cropperKey} {...editor.cropperProps} />
          </Dialog>,
          document.body,
        )}
    </div>
  );
}
