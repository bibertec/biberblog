// `text-base` must stay at least 16px: iOS Safari zooms into any focused field with a smaller font
// size and keeps the zoom after the dialog closes (the page then overflows horizontally).
const fieldBase = 'bg-background border-b-2 border-foreground px-4 py-2 text-base outline-hidden';

/**
 * Shared look of all editor form fields. On focus the bottom border grows from 2px to 5px; the
 * bottom padding shrinks by the same 3px (8px → 5px) so the field keeps its height.
 */
export const fieldClassName = `${fieldBase} focus:border-b-5 focus:border-accent focus:pb-1.25`;

/** Same look for wrappers whose focus sits on a nested element (e.g. Tiptap's contenteditable). */
export const fieldWithinClassName = `${fieldBase} focus-within:border-b-5 focus-within:border-accent focus-within:pb-1.25`;

/** Appends extra classes (layout only – there is no class merging, conflicting utilities are not resolved). */
export function withFieldClassName(className: string | undefined, base = fieldClassName) {
  return className ? `${base} ${className}` : base;
}
