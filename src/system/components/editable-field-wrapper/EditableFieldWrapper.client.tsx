'use client';
import { useState, type ReactNode } from 'react';
import { Undo2 } from 'lucide-react';
import { Dialog } from '../dialog/Dialog.client';
import { translations } from '@/src/project/config/translations';

type EditableFieldWrapperProps = {
  title: string;
  /**
   * `inline` for fields that can appear in running text (e.g. `EditableText` inside a heading),
   * `block` for fields with block content (paragraphs, lists, images). Only determines the wrapper
   * element (`span` or `div`) so that the markup stays valid.
   */
  layout?: 'inline' | 'block';
  /** The field has an unpublished draft – switches the edit marker from sky to amber. */
  isDirty: boolean;
  confirmLabel?: string;
  displayContent: ReactNode;
  modalContent: ReactNode;
  onSave: () => void | Promise<void>;
  onClose: () => void;
  onOpen?: () => void;
  onRevert: () => void;
};

export default function EditableFieldWrapper({
  title,
  layout = 'block',
  isDirty,
  confirmLabel,
  displayContent,
  modalContent,
  onSave,
  onClose,
  onOpen,
  onRevert,
}: EditableFieldWrapperProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpen() {
    setError(null);
    onOpen?.();
    setIsModalOpen(true);
  }

  function handleClose() {
    onClose();
    setError(null);
    setIsModalOpen(false);
  }

  async function handleSave() {
    setError(null);
    setIsConfirming(true);
    try {
      await onSave();
      setIsModalOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : translations.common.saveFailed);
    } finally {
      setIsConfirming(false);
    }
  }

  // Edit marker: dashed white outline painted over a colored ring of the same size. Both are drawn
  // outside the box (no layout impact) and the two tones keep it visible on any background.
  const markerColor = isDirty
    ? 'ring-amber-500 active:bg-amber-500/10 focus-visible:outline-amber-500'
    : 'ring-sky-600/80 active:bg-sky-500/10 focus-visible:outline-sky-600';

  const editButton = (
    <button
      type="button"
      aria-label={title}
      onClick={handleOpen}
      className={`absolute inset-0 cursor-pointer rounded-sm outline-1 outline-dashed outline-white/90 ring-1 hover:outline-2 hover:ring-2 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 ${markerColor}`}
    />
  );

  return (
    <>
      {/*
        The display content can contain links and block elements, which would be invalid inside a
        <button>. It therefore sits `inert` (not clickable/focusable) in a neutral container, covered
        by an invisible button spanning the whole area that opens the dialog.
      */}
      {layout === 'inline' ? (
        <span className="relative inline-block">
          <span inert>{displayContent}</span>
          {editButton}
        </span>
      ) : (
        <div className="relative">
          <div inert>{displayContent}</div>
          {editButton}
        </div>
      )}

      <Dialog
        open={isModalOpen}
        title={title}
        confirmLabel={confirmLabel}
        error={error}
        isConfirming={isConfirming}
        onCancel={handleClose}
        onConfirm={handleSave}
        footerStart={
          <button type="button" onClick={onRevert} disabled={isConfirming} className="flex items-center gap-1 text-sm">
            <Undo2 size={14} />
            {translations.common.resetToOriginal}
          </button>
        }
      >
        <div className="flex flex-col gap-2">{modalContent}</div>
      </Dialog>
    </>
  );
}
