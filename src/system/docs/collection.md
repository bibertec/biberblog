# Collection

Reference for the `EditableCollection` field. For the high-level overview see `architecture.md`, for the store mechanism see [Store](./store.md), for the Plop conventions see [Plop templates](./plop.md).

## Concept

`EditableCollection` is a third content type at field level, on a par with `EditableText`/`EditableRichtext` – not a separate module type. A module can, for example, have a heading (`EditableText`) plus a list of team members (`EditableCollection`). In the editor, the customer maintains the values, number and order of the elements ("items"); the **structure** of an item (which fields, of which type) is defined once by the developer during scaffolding and does not change at runtime.

Allowed item field types: `EditableText`, `EditableRichtext`, `EditableImage` – **no nested collections** (deliberate YAGNI, see `AVAILABLE_ITEM_CONTENT_TYPES` in `src/system/cli/constants.ts`).

## Data model

Each item has a system-assigned, persisted `id` (stable React keys when reordering/editing/deleting) plus the fields defined by the developer:

```json
[
  { "id": "3f2a...", "name": "Anna Musterfrau", "bio": { "type": "doc", "content": [...] } },
  { "id": "9c1b...", "name": "Max Mustermann", "bio": { "type": "doc", "content": [...] } }
]
```

Accordingly, the field value in the content schema is `z.array(<item>ItemSchema)`, where `<item>ItemSchema` is a `z.object({...})` generated during scaffolding (see below).

## Draft store: one entry for the whole collection

As with richtext, the complete value (here: the entire item array) is ONE store entry under the field's draft key (`${pathname}::${moduleId}.${fieldName}`) – there is no per-item store concept. Adding/removing/reordering/editing an item internally produces a new array, which ends up in the same draft entry; publish simply commits "field value = current draft value" (see [Publish](./publish.md)), without special handling for collections.

## Editor UI

`EditableCollection.editor.client.tsx` shows the items as an accordion (one item at a time, not all expanded at once – better performance, since otherwise every visible richtext item field would run its own Tiptap instance). Per item: a tile with the title (from the `EditableText` field marked as `titleField`, fallback "Element N") and an edit icon – the whole title row toggles the item – plus a delete button, up/down buttons for reordering stacked to the right of the tile (deliberately no drag & drop dependency – more robust on touch devices), and "+ Add item" at the end of the list, styled as a not-yet-existing item (same shape as a collapsed tile, dashed border, no background) so it stands apart from "Reset to original". Deleting takes two clicks: the first shows "Really delete?" next to the trash icon and replaces the title with a "No, keep it" button (not enough room for both on phones), the second removes the item; "No, keep it" or any other action in the list cancels it. Reordering, adding and removing items is animated with `@formkit/auto-animate` (`autoAnimate` in a ref callback on the list container, with the ref cleanup destroying the registration – deliberately not the `useAutoAnimate` hook: under React 19 Strict Mode in development it registers twice on the same element, and the second registration cancels every animation of the first, so nothing moves): without it, a move only swaps the tile texts in place and is barely noticeable – and since the arrows stay where they are, a second tap on the same spot moves the *other* item back. It only watches the list's direct children, so expanding an item or typing in it is not animated; with "reduce motion" enabled in the OS, it is off.

As with text/richtext, nothing changes the store until the dialog is confirmed with "Apply" – "Cancel" discards all changes (including adding/removing/reordering).

## Reused raw input components

The item fields use the same input UI as the top-level fields (text input, Tiptap editor + toolbar), but without their own dialog/save/cancel/draft key. There are two pure input components for this:

- `text/TextFieldInput.client.tsx` – plain `<textarea>` input (`value`/`onChange`).
- `richtext/RichtextFieldInput.client.tsx` – toolbar + Tiptap editor + link panel (`value`/`onChange`), styled as one field: toolbar and link panel sit directly on top of the text area with the same background, separated only by a hairline. Important: `value` only determines the *initial* content when the Tiptap instance is created (ProseMirror does not pick up later external `value` changes automatically) – a caller that wants to reset the content (opening, "Reset to original") has to remount the component with a new `key`. `EditableRichtext.editor.client.tsx` and `EditableCollection.editor.client.tsx` each use an incremented `key` for this (or `sessionKey` per item).

- `image/ImageFieldInput.client.tsx` – thumbnail plus "Change image", which opens the same crop dialog as the top-level image field (`value`/`onChange`). The dialog state and upload logic live in the hook `image/useImageCropEditor.client.ts`, shared with `EditableImage.editor.client.tsx`.

Both top-level fields (`EditableText.editor.client.tsx`, `EditableRichtext.editor.client.tsx`) use these components as well; `EditableCollection.editor.client.tsx` uses exactly the same components per item field.

## Image item fields

An item field of type `EditableImage` works like the top-level image field (fixed target size, crop, alt text, see [Image](./images.md)), with these differences:

- **Registry key:** `'<Module>.<collectionField>.<itemField>'` in `imageFieldRegistry.ts`, e.g. `'Team.members.photo'`. The generated `itemFields` descriptor passes these rules to the editor (`{ name: 'photo', type: 'EditableImage', rules: imageFieldRegistry['Team.members.photo'] }`).
- **Draft value inside the item:** there is no store entry per image; the item simply holds the image value – `{ src, alt }` or, after a new upload/crop, a `TempImageDraft`. The whole item array stays one draft entry.
- **Nested dialog:** "Change image" opens the crop dialog on top of the collection dialog. It is rendered through a portal (`createPortal` to `document.body`, no nested `<form>`); `Dialog.client.tsx` only reacts to `close`/`cancel`/`submit` events of its own `<dialog>`, because React propagates them along the component tree across the portal. The image is uploaded when the image dialog is confirmed; the collection draft is only written with "Apply" of the collection dialog.
- **Temp uploads:** uploads that end up unused (collection dialog cancelled, image replaced again, item deleted, "reset to original") are discarded right away; everything else is cleaned up by the usual ~24h cleanup.
- **Rendering:** the item markup is rendered on the client (`render<Field>Item` in `CollectionFields.client.tsx`), but published images are resolved on the server. The module component therefore calls `loadCollectionImages(content.<field>, ['<imageItemField>', …])` (like `loadContentImage` for single images, which makes it `async`) and passes the result as `images` to `<Field>Field`. `EditableCollection` provides it via context, and the generated `<CollectionImage value={item.photo} rules={…} />` (`collection/CollectionImages.client.tsx`) shows the published image – or, for an unpublished draft, the crop preview (lazy-loaded, editor mode only). Images not resolved on the server (e.g. the placeholder of an item added in the editor) fall back to their public path.
- **Publish:** image drafts inside items are processed like top-level image drafts, with the rules of the item field. Generated images of replaced or removed items are deleted if nothing references them anymore (see [Image](./images.md)).

## Rendering (live view) – `renderItem` callback

For the layout of the items in the live view (outside the editor dialog) there is deliberately no generic system rendering, but a `render<Field>Item` callback generated during scaffolding (freely adjustable by the developer, just like the rest of the generated module files). For richtext item fields this callback uses `RichtextRenderer` directly (not `EditableRichtext`/`EditableRichtextDisplay` – those are tied to their own store draft addressing, which individual collection items do not have).

`EditableCollectionDisplay.tsx` (generic, no Tiptap dependency, therefore safe in the main bundle) only calls `renderItem(item)` per item, wrapped in a `Fragment` (no extra wrapper element per item – full layout control stays with the `renderItem` callback).

## Server/client boundary: `CollectionFields.client.tsx`

`renderItem` and `createItem` are functions. Functions must not be passed as props from a Server Component to a Client Component (only serializable values or Server Actions). `EditableCollection.client.tsx` is – like `EditableText`/`EditableRichtext` – a Client Component, because it switches between display and editor via `useEditorMode`. If `<Module>.tsx` passed the functions directly, it would break at runtime with `Functions cannot be passed directly to Client Components`.

**Requirement:** `<Module>.tsx` stays a Server Component, even if the module has a collection field. The collection is rendered on the server like any other content type; the editor code only reaches the browser when editor mode is active.

**Solution:** `renderItem`, `createItem` and the `itemFields` descriptor live in a separate file generated per module, `CollectionFields.client.tsx` (`'use client'`). For each collection field it exports a thin wrapper component (`<FieldName>Field`) that internally renders `<EditableCollection renderItem={...} createItem={...} .../>` – within the same client file, so nothing crosses the boundary. `<Module>.tsx` only imports `<FieldName>Field` and passes data exclusively (`fieldId`, `value`) – the same pattern as for `EditableText`/`EditableRichtext`. `CollectionFields.client.tsx` only exists if the module has at least one collection field.

## Generic component vs. generated code

| File | Generic (system) or generated (per module)? |
|---|---|
| `EditableCollection.client.tsx`, `.editor.client.tsx`, `EditableCollectionDisplay.tsx`, `collectionTypes.ts` | generic, `src/system/components/editable-fields/collection/` |
| `<fieldName>ItemSchema`, `<FieldName>Item` type, `create<FieldName>Item` | generated, in `<Module>/schema.ts` |
| `<fieldName>ItemFields` descriptor, `render<FieldName>Item`, `<FieldName>Field` wrapper | generated, in `<Module>/CollectionFields.client.tsx` (not in `<Module>.tsx` – see "Server/client boundary" above) |

`EditableCollection` is generic over the item type (`<TItem extends CollectionItem>`); the editor implementation, lazy-loaded via `next/dynamic`, internally works with the broader `CollectionItem` shape (`{ id: string } & Record<string, unknown>`), because `next/dynamic` cannot type a generic component. The two casts at this single spot (`EditableCollection.client.tsx`) are type-safe, because every concrete `TItem` is structurally compatible with `CollectionItem` according to the generic constraint.

## Plop scaffolding

The item schema/factory block of a collection is inserted into `<Module>/schema.ts` before the main schema; the rendering/wrapper block (`itemFields` descriptor, `renderXItem`, `<Field>Field`) goes into `<Module>/CollectionFields.client.tsx`, which is created when needed (first collection field of a module). Both come from the same Handlebars partials as in `module:create`. Details: [Plop templates](./plop.md).

For an `EditableCollection`, `module:remove-editable-field` additionally removes the generated item schema/factory block (`<fieldName>ItemSchema`, `<FieldName>Item` type, `create<FieldName>Item`) from `schema.ts`, the wrapper block (`<fieldName>ItemFields`, `render<FieldName>Item`, `<FieldName>Field`) from `CollectionFields.client.tsx`, and the import of `<FieldName>Field` from `<Module>.tsx`. If the removed field was the module's last collection, `CollectionFields.client.tsx` is deleted entirely instead of remaining as an empty shell; imports still needed by another collection of the module (`RichtextRenderer`, `CollectionImage`, …) are kept. Image item fields additionally lose their `imageFieldRegistry` entries (`'<Module>.<field>.*'`) and the `loadCollectionImages` statement in `<Module>.tsx`. This logic lives in the `removeEditableField` action and the codemods in `src/system/cli/codemods/module.ts`.

## Default content of a new collection: one dummy item

An `EditableCollection` newly created via Plop (through `module:create` or `module:add-editable-field`) starts with exactly one dummy item, not with an empty array – analogous to `EditableText`/`EditableRichtext`, which also provide a visible placeholder right away. An empty collection would look like a missing section on the freshly generated page.

**Implementation:** For `'EditableCollection'`, `defaultValueForContentType(contentType, itemFields?)` (`src/system/cli/helpers.ts`) builds an item (`{ id: crypto.randomUUID(), ...default value per item field }`) and returns it as a one-element array. The `id` is generated once during scaffolding. Call sites: the Handlebars helper `{{{defaultValueFor contentType itemFields}}}` (in `defaultContent.json.hbs`; for non-collection fields `itemFields` is `undefined`) and the custom action `addEditableFieldToModuleAndContentJsons` (`src/system/cli/actions/module-field-actions.ts`).

Existing collections stored as `[]` in a `content.json` are not filled retroactively.
