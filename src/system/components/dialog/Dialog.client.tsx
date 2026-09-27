'use client';
import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type SubmitEvent,
  type SyntheticEvent,
} from 'react';
import { translations } from '@/src/project/config/translations';

/**
 * Locks page scrolling while a dialog is open – otherwise the page behind scrolls along (scroll
 * chaining), especially on phones. Counts open dialogs, since one can open on top of another; the
 * page is unlocked when the last one closes. With a classic (space-taking) scrollbar, its gutter is
 * kept so the page does not shift sideways.
 */
let openDialogCount = 0;

function lockPageScroll(): () => void {
  const root = document.documentElement;
  if (openDialogCount === 0) {
    if (window.innerWidth > root.clientWidth) root.style.scrollbarGutter = 'stable';
    root.style.overflow = 'hidden';
  }
  openDialogCount += 1;

  return () => {
    openDialogCount -= 1;
    if (openDialogCount === 0) {
      root.style.overflow = '';
      root.style.scrollbarGutter = '';
    }
  };
}

const TEXT_ENTRY_SELECTOR =
  'textarea, select, [contenteditable="true"], input:not([type="file"], [type="range"], [type="checkbox"], [type="radio"])';

type DialogProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  isConfirming?: boolean;
  confirmDisabled?: boolean;
  hideCancel?: boolean;
  /** Hides the confirm button (e.g. during a loading state). */
  hideConfirm?: boolean;
  /** `false`: the dialog cannot be closed with Escape (e.g. while an operation is running). */
  dismissible?: boolean;
  /** Left side of the footer, opposite the buttons (e.g. "Reset to original"). */
  footerStart?: ReactNode;
};

export function Dialog({
  open,
  title,
  children,
  error,
  onCancel,
  onConfirm,
  confirmLabel = translations.common.save,
  cancelLabel = translations.common.cancel,
  isConfirming = false,
  confirmDisabled = false,
  hideCancel = false,
  hideConfirm = false,
  dismissible = true,
  footerStart,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialogElement = dialogRef.current;
    if (!dialogElement) return;

    if (open) {
      dialogElement.showModal();
      // The browser focuses the first focusable element. Keep that for text entry (login, text dialog),
      // but not for a button such as the richtext "Bold" button: iOS then shows a focus ring as if it
      // were selected. The dialog itself takes the focus instead (keyboard users continue with Tab).
      if (!document.activeElement?.matches(TEXT_ENTRY_SELECTOR)) dialogElement.focus();
      return lockPageScroll();
    } else if (dialogElement.open) {
      dialogElement.close();
    }
  }, [open]);

  function handleClose(event: SyntheticEvent<HTMLDialogElement>) {
    if (event.target !== event.currentTarget || !open) return;
    if (!dismissible) {
      dialogRef.current?.showModal();
      return;
    }
    onCancel();
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    onConfirm();
  }

  const showButtons = !(hideCancel && hideConfirm);
  const showFooter = Boolean(error || footerStart) || showButtons;

  return (
    <dialog
      ref={dialogRef}
      onClose={handleClose}
      onCancel={(event) => {
        if (event.target === event.currentTarget && !dismissible) event.preventDefault();
      }}
      aria-labelledby={titleId}
      tabIndex={-1}
      className="fixed inset-0 m-auto max-h-[90svh] w-11/12 max-w-md origin-center flex-col overflow-hidden rounded-3xl outline-hidden border border-white/60 bg-white/40 p-0 text-sm text-slate-950 shadow-xl ring-1 ring-inset ring-white/40 backdrop-blur-xl backdrop-saturate-150 transition duration-200 ease-out starting:open:scale-95 starting:open:opacity-0 motion-reduce:transition-none backdrop:bg-black/40 backdrop:transition-opacity backdrop:duration-300 backdrop:ease-out starting:open:backdrop:opacity-0 motion-reduce:backdrop:transition-none open:flex"
    >
      <form method="dialog" className="flex min-h-0 flex-col" onSubmit={handleSubmit}>
        {/*
          Only the content scrolls, the footer always stays visible. The content fades out over its
          bottom padding (mask: transparent at the bottom edge, opaque 1.5rem above), so it disappears
          softly behind the footer – and once scrolled to the end, only the empty padding is faded.
        */}
        <div className="min-h-0 overflow-y-auto overscroll-contain scroll-pb-6 px-6.25 pt-6.25 pb-6 mask-t-from-transparent mask-t-to-black mask-t-to-6">
          <div className="flex flex-col gap-3">
            <h2 id={titleId} className="text-sm font-medium">
              {title}
            </h2>
            {children}
          </div>
        </div>
        {showFooter && (
          <div className="flex flex-col gap-3 px-6.25 pb-6.25">
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            {(footerStart || showButtons) && (
              <div className="flex flex-wrap items-center gap-2">
                {footerStart}
                {showButtons && (
                  <div className="ml-auto flex gap-2">
                    {!hideCancel && (
                      <button
                        type="button"
                        onClick={onCancel}
                        disabled={isConfirming}
                        className="rounded-xl border border-white/60 bg-white/30 px-3 py-1.5 transition-colors hover:bg-white/60 disabled:opacity-50"
                      >
                        {cancelLabel}
                      </button>
                    )}
                    {!hideConfirm && (
                      <button
                        type="submit"
                        disabled={isConfirming || confirmDisabled}
                        className="rounded-xl bg-slate-950 px-3 py-1.5 text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
                      >
                        {isConfirming ? translations.common.pleaseWait : confirmLabel}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </form>
    </dialog>
  );
}
