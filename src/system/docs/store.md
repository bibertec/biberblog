# Store

Reference for the Zustand store of the editor mode. For the high-level overview see `architecture.md`, for auth-specific details see [Authentication](./auth.md).

## Concept

- A single store, `useEditorMode` (`src/system/store/editor-mode.ts`), covers both the editor mode (`editMode`, `enterEditMode`, `exitEditMode`) and the editing drafts (`drafts`, `setDraft`, `revertDraft`, `clearDrafts`).
- Deliberately no second, separate store: there is no scenario in which `editMode` would sensibly need to change independently of the drafts – splitting them would suggest an independence that does not exist. As soon as editing is possible, the mode is active anyway.

```ts
interface EditorState {
  editMode: boolean;
  enterEditMode: () => void;
  exitEditMode: () => void;
  drafts: Record<string, unknown>;
  setDraft: (key: string, value: unknown) => void;
  revertDraft: (key: string) => void;
  clearDrafts: () => void;
}
```

`drafts` is deliberately `Record<string, unknown>`, not `Record<string, string>`: EditableText stores a string, EditableRichtext a whole JSON document (see [Richtext](./richtext.md)), EditableImage a `TempImageDraft` (reference to a temporary blob + crop rectangle + alt text) or – for an alt-text-only change – a `{ src, alt }` value (see [Image](./images.md)). The store itself treats draft values as opaque throughout – `setDraft`/`revertDraft`/`clearDrafts` never inspect the value. The only exception is the publish merge in `publish/actions.ts`, which recognizes an image draft by its shape (`tempImageDraftSchema.safeParse`) to process it on the server before writing (see [Publish](./publish.md)) – all other draft types remain untouched there as well.

## Draft keys

- Drafts are addressed via a flat composite key: `` `${pathname}::${fieldId}` `` (helper `draftKey(pathname, fieldId)`, exported from `editor-mode.ts`).
- Reason for the flat key instead of a nested `Record<pathname, Record<fieldId, string>>`: no nested immutable updates needed, easier to read.
- The pathname part prevents identical `fieldId`s on different pages from colliding.
- Module fields use `moduleId.fieldName` as `fieldId`. The SEO values of a page use the reserved `fieldId` `seo` (`SEO_FIELD_ID`) with a `{ title, description }` value – they are edited for all pages from one dialog, so the pathname part is not necessarily the current page (see [SEO](./seo.md)).

## Live preview mechanism

- An editable component reads its display value reactively as `displayValue = draftValue ?? value` (`draftValue` from the store, `value` the original value from `content.json`).
- The text currently being edited lives in local component state meanwhile, not directly in the store – otherwise every keystroke would immediately change the live preview instead of only after an explicit "Apply".
- Only a `setDraft(key, ...)` call writes to the store and thereby reactively updates every place that reads the same key.

## Revert

- `revertDraft(key)` deletes the store entry for exactly one field; other fields/pages are not affected.
- **Invariant:** an entry in `drafts` always means an actual deviation from the published value. An entry whose value exactly matches the original is never written – an editable component checks this itself when applying (`draftText !== value`) and otherwise calls `revertDraft` instead of `setDraft`. Without this check, a revert followed by another "Apply" without further changes could create a phantom entry that looks like a real change.
- This invariant matters for later features such as a "changed" indicator or a publish gate, which can then rely solely on "key exists in `drafts`" without comparing values.

## DevTools

- The `devtools` middleware from `zustand/middleware` wraps the state creator, including action labels as the third `set()` argument (e.g. `set(..., false, 'enterEditMode')`) for readable entries in the DevTools panel.
- Only active outside production (`enabled: process.env.NODE_ENV !== 'production'`) – the store is not exposed to the Redux DevTools on the live site.
- Deliberately two explicit actions `enterEditMode`/`exitEditMode` instead of a toggle: if a handler is accidentally called twice, the state still stays correct.
- Uses the npm package `@redux-devtools/extension` (dev dependency, required for `devtools` according to the Zustand docs) plus the Redux DevTools browser extension.

## Files

- `src/system/store/editor-mode.ts` – the store itself, incl. `draftKey`.
- `src/system/components/editable-field-wrapper/EditableFieldWrapper.client.tsx` – generic dialog wrapper with `onOpen`/`onSave`/`onClose`/`onRevert`. The display content sits `inert` in a neutral container (`layout="inline"` → `span`, `layout="block"` → `div`), covered by an invisible full-size button (`aria-label` = dialog title) that opens the dialog. This keeps the HTML valid even if the display contains links or block elements. The button also carries the edit marker (dashed white outline over a colored ring, both outside the box, so no layout impact): sky by default, amber when `isDirty` (the field has an unpublished draft). The "Reset to original" button lives here centrally (instead of being duplicated in every Editable* component); the field-specific reset logic stays in `handleRevert` of the consuming component.
- `src/system/components/editable-fields/text/EditableText.editor.client.tsx` – simplest example: reads/writes drafts for a text field, incl. revert.

All four field types (`EditableText`, `EditableRichtext`, `EditableCollection`, `EditableImage`) use the same mechanism: one store entry per field; the draft value is a string, a richtext document, an item array, or a `TempImageDraft`/`{ src, alt }` respectively. Image item fields of a collection have no store entry of their own: their `TempImageDraft`/`{ src, alt }` value sits inside the item array (see [Collection](./collection.md)).
