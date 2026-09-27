'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Logs, type LucideIcon } from 'lucide-react';
import { translations } from '@/src/project/config/translations';

export type EditorNavbarMenuItem = {
  icon?: LucideIcon;
  label: string;
  disabled?: boolean;
  /** Highlights the entry and sets `aria-current="page"` (e.g. the page currently shown). */
  current?: boolean;
  /** Amber dot, same color as the field marker: e.g. a page with unpublished changes. */
  isDirty?: boolean;
} & (
  | { onClick: () => void; href?: never }
  /** Client-side navigation via `next/link` – keeps the editor state (drafts) across pages. */
  | { href: string; onClick?: never }
);

type EditorNavbarMenuProps = {
  items: EditorNavbarMenuItem[];
  /** Trigger icon and label; default: the "more options" icon button. */
  icon?: LucideIcon;
  label?: string;
  /** Shows the label below the icon, like the other navbar buttons. */
  showLabel?: boolean;
  disabled?: boolean;
};

/**
 * Flyout for navbar actions or links: the less frequently used actions ("more options") and the page
 * list ("Pages"). A new action only needs a new entry in `items`.
 *
 * Opens upwards (the navbar sits at the bottom of the viewport). The wrapper is deliberately not
 * `relative`: the flyout is positioned against the navbar itself (nearest positioned ancestor) and
 * spans its full width, like a sheet on top of the navbar – the same for every flyout, whichever
 * button opened it. That button stays highlighted while its flyout is open. Long labels are
 * truncated. Closes on item click, outside click and Escape.
 */
export function EditorNavbarMenu({
  items,
  icon: TriggerIcon = Logs,
  label = translations.navbar.moreOptions,
  showLabel = false,
  disabled = false,
}: EditorNavbarMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={menuRef}>
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => setIsOpen((open) => !open)}
        className={`inline-flex items-center justify-center rounded-xl px-3 py-2 enabled:hover:bg-slate-950/5 aria-expanded:bg-slate-950/5 disabled:opacity-50 ${showLabel ? 'flex-col gap-0 text-center' : ''}`}
      >
        <TriggerIcon />
        {showLabel && label}
      </button>

      {isOpen && (
        // No backdrop-blur: inside the blurred navbar it would not blur the page behind the flyout.
        <div className="absolute inset-x-0 bottom-full mb-2 flex flex-col rounded-2xl border border-white/60 bg-white/90 p-1.5 shadow-xl ring-1 ring-inset ring-slate-950/5">
          {items.map((item) => {
            const className = `inline-flex items-center gap-2 rounded-xl px-3 py-2 text-left ${item.current ? 'bg-slate-950/5 font-medium' : ''}`;
            const content = (
              <>
                {item.icon && <item.icon className="shrink-0" />}
                <span className="truncate">{item.label}</span>
                {item.isDirty && (
                  <>
                    <span aria-hidden className="ml-auto size-2 shrink-0 rounded-full bg-amber-500" />
                    <span className="sr-only">{translations.common.unsaved}</span>
                  </>
                )}
              </>
            );

            return item.href !== undefined ? (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                aria-current={item.current ? 'page' : undefined}
                onClick={() => setIsOpen(false)}
                className={`${className} hover:bg-slate-950/5`}
              >
                {content}
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                disabled={item.disabled}
                title={item.label}
                aria-label={item.label}
                aria-current={item.current ? 'page' : undefined}
                onClick={() => {
                  setIsOpen(false);
                  item.onClick();
                }}
                className={`${className} enabled:hover:bg-slate-950/5 disabled:opacity-50`}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
