'use client';
import { useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronDown, ChevronUp, Plus, SquarePen, Trash2, X } from 'lucide-react';
import autoAnimate from '@formkit/auto-animate';
import { EditableCollectionDisplay } from './EditableCollectionDisplay';
import TextFieldInput from '../text/TextFieldInput.client';
import RichtextFieldInput from '../richtext/RichtextFieldInput.client';
import ImageFieldInput from '../image/ImageFieldInput.client';
import EditableFieldWrapper from '../../editable-field-wrapper/EditableFieldWrapper.client';
import { useEditorMode, draftKey } from '@/src/system/store/editor-mode';
import type { CollectionItem, ItemFieldDef } from './collectionTypes';
import type { RichtextDoc } from '@/src/system/content/richtextSchema';
import { tempImageDraftSchema, type ImageDraft } from '@/src/system/content/imageSchema';
import { discardTempImage } from '@/src/system/lib/images/actions';
import { translations } from '@/src/project/config/translations';

type EditableCollectionEditorProps = {
  className?: string;
  fieldId: string;
  value: CollectionItem[];
  itemFields: ItemFieldDef[];
  titleField: string;
  renderItem: (item: CollectionItem) => ReactNode;
  createItem: () => CollectionItem;
};

function itemsAreEqual(a: CollectionItem[], b: CollectionItem[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Pathnames of the temp uploads (unpublished images) referenced by the items. */
function tempPathnamesIn(items: CollectionItem[] | undefined): Set<string> {
  const pathnames = new Set<string>();
  for (const item of items ?? []) {
    for (const fieldValue of Object.values(item)) {
      const draft = tempImageDraftSchema.safeParse(fieldValue);
      if (draft.success) pathnames.add(draft.data.temp.pathname);
    }
  }

  return pathnames;
}

function discardTempImagesExcept(pathnames: Iterable<string>, keep: Set<string>): void {
  for (const pathname of pathnames) {
    if (!keep.has(pathname)) void discardTempImage(pathname);
  }
}

/**
 * Ref callback of the item list: animates reordering, adding and removing items (direct children
 * only, so expanding an item or typing in it is not animated; off with "reduce motion").
 * Deliberately not `useAutoAnimate`: in React 19 Strict Mode (dev) the hook registers twice on the
 * same element, and the second registration cancels every animation of the first. The ref cleanup
 * destroys the previous registration, so there is always exactly one.
 */
function animateList(list: HTMLDivElement | null) {
  if (!list) return;
  const controller = autoAnimate(list);
  return () => controller.destroy?.();
}

function itemLabel(item: CollectionItem, titleField: string, index: number): string {
  const raw = item[titleField];
  return typeof raw === 'string' && raw.trim() !== '' ? raw : translations.collection.itemFallbackTitle(index + 1);
}

export default function EditableCollectionEditor({
  className,
  value,
  fieldId,
  itemFields,
  titleField,
  renderItem,
  createItem,
}: EditableCollectionEditorProps) {
  const pathname = usePathname();
  const key = draftKey(pathname, fieldId);

  const draftValue = useEditorMode((state) => state.drafts[key] as CollectionItem[] | undefined);
  const setDraft = useEditorMode((state) => state.setDraft);
  const revertDraft = useEditorMode((state) => state.revertDraft);

  const displayValue = draftValue ?? value;
  const [items, setItems] = useState<CollectionItem[]>(displayValue);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  // Item whose trash button was clicked once – the second click removes it, any other action resets.
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const [sessionKey, setSessionKey] = useState(0);
  // Temp uploads made in the open dialog – discarded if they end up unused (cancel, replaced).
  const sessionTempPathnamesRef = useRef(new Set<string>());

  function handleOpen() {
    setItems(displayValue);
    setExpandedItemId(null);
    setPendingRemoveId(null);
    setSessionKey((k) => k + 1);
    sessionTempPathnamesRef.current = new Set();
  }

  function handleSave() {
    if (itemsAreEqual(items, value)) {
      revertDraft(key);
    } else {
      setDraft(key, items);
    }
    discardTempImagesExcept(
      [...tempPathnamesIn(draftValue), ...sessionTempPathnamesRef.current],
      tempPathnamesIn(items),
    );
    sessionTempPathnamesRef.current = new Set();
  }

  function handleClose() {
    setExpandedItemId(null);
    setPendingRemoveId(null);
    discardTempImagesExcept(sessionTempPathnamesRef.current, tempPathnamesIn(draftValue));
    sessionTempPathnamesRef.current = new Set();
  }

  function handleRevert() {
    discardTempImagesExcept([...tempPathnamesIn(draftValue), ...sessionTempPathnamesRef.current], new Set());
    sessionTempPathnamesRef.current = new Set();
    revertDraft(key);
    setItems(value);
    setExpandedItemId(null);
    setPendingRemoveId(null);
    setSessionKey((k) => k + 1);
  }

  function addItem() {
    const newItem = createItem();
    setItems((prev) => [...prev, newItem]);
    setExpandedItemId(newItem.id);
    setPendingRemoveId(null);
  }

  function toggleItem(id: string) {
    setExpandedItemId((current) => (current === id ? null : id));
    setPendingRemoveId(null);
  }

  function requestRemoveItem(id: string) {
    if (pendingRemoveId === id) {
      removeItem(id);
    } else {
      setPendingRemoveId(id);
    }
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
    setExpandedItemId((current) => (current === id ? null : current));
    setPendingRemoveId(null);
  }

  function moveItem(id: string, direction: -1 | 1) {
    setPendingRemoveId(null);
    setItems((prev) => {
      const index = prev.findIndex((item) => item.id === id);
      const targetIndex = index + direction;
      if (index === -1 || targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }

  function updateItemField(id: string, fieldName: string, fieldValue: string | RichtextDoc | ImageDraft) {
    if (typeof fieldValue === 'object' && 'temp' in fieldValue) {
      sessionTempPathnamesRef.current.add(fieldValue.temp.pathname);
    }
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, [fieldName]: fieldValue } : item)));
  }

  return (
    <EditableFieldWrapper
      title={translations.collection.dialogTitle}
      isDirty={draftValue !== undefined}
      confirmLabel={translations.common.apply}
      displayContent={
        <EditableCollectionDisplay className={className} value={displayValue} renderItem={renderItem} />
      }
      modalContent={
        <>
          <div ref={animateList} className="flex flex-col gap-2 empty:hidden">
            {items.map((item, index) => {
              const isExpanded = expandedItemId === item.id;
              const isPendingRemove = pendingRemoveId === item.id;
              return (
                <div key={item.id} className="flex items-start gap-1">
                  <div className={`flex-1 border rounded ${isExpanded ? '' : 'bg-background'}`}>
                    <div className="flex items-center gap-1 p-2">
                      {/* While the removal is pending, "keep it" replaces the title (not enough room for both on phones). */}
                      {isPendingRemove ? (
                        <button
                          type="button"
                          onClick={() => setPendingRemoveId(null)}
                          className="mr-auto flex items-center gap-1 whitespace-nowrap py-1 text-sm text-green-600"
                        >
                          <X size={16} />
                          {translations.collection.keepItem}
                        </button>
                      ) : (
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          onClick={() => toggleItem(item.id)}
                          className="flex flex-1 items-center justify-between gap-2 text-left text-sm cursor-pointer"
                        >
                          {itemLabel(item, titleField, index)}
                          <SquarePen size={16} className="shrink-0" />
                        </button>
                      )}
                      {/* Text appears left of the icon, so the icon stays in place for the second click. */}
                      <button
                        type="button"
                        aria-label={isPendingRemove ? undefined : translations.collection.removeItem}
                        onClick={() => requestRemoveItem(item.id)}
                        className="flex items-center gap-1 whitespace-nowrap p-1 text-sm text-red-600"
                      >
                        {isPendingRemove && translations.collection.confirmRemoveItem}
                        <Trash2 size={16} />
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="flex flex-col gap-2 p-2 border-t">
                        {itemFields.map((field) => (
                          <div key={field.name} className="flex flex-col gap-1">
                            {field.type === 'EditableImage' ? (
                              <ImageFieldInput
                                value={item[field.name] as ImageDraft}
                                rules={field.rules}
                                onChange={(image) => updateItemField(item.id, field.name, image)}
                              />
                            ) : field.type === 'EditableRichtext' ? (
                              <RichtextFieldInput
                                key={`${sessionKey}-${item.id}-${field.name}`}
                                value={item[field.name] as RichtextDoc}
                                onChange={(doc) => updateItemField(item.id, field.name, doc)}
                              />
                            ) : (
                              <TextFieldInput
                                value={item[field.name] as string}
                                onChange={(text) => updateItemField(item.id, field.name, text)}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col">
                    <button
                      type="button"
                      aria-label={translations.collection.moveUp}
                      disabled={index === 0}
                      onClick={() => moveItem(item.id, -1)}
                      className="px-1 py-0.5 disabled:opacity-30"
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label={translations.collection.moveDown}
                      disabled={index === items.length - 1}
                      onClick={() => moveItem(item.id, 1)}
                      className="px-1 py-0.5 disabled:opacity-30"
                    >
                      <ChevronDown size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/*
            Styled as a not-yet-existing item: same shape and height (42px) as a collapsed tile, dashed
            and without background. `mr-7` = arrow column (24px) + gap (4px), so it lines up with the tiles.
          */}
          <button
            type="button"
            onClick={addItem}
            className="mr-7 flex cursor-pointer items-center gap-1 rounded border border-dashed px-2 py-2.5 text-sm"
          >
            <Plus size={16} />
            {translations.collection.addItem}
          </button>
        </>
      }
      onOpen={handleOpen}
      onSave={handleSave}
      onClose={handleClose}
      onRevert={handleRevert}
    />
  );
}
