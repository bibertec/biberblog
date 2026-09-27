# Richtext

Reference for the `EditableRichtext` field. For the high-level overview see `architecture.md`, for the store mechanism (drafts, live preview, revert) see [Store](./store.md), for the Plop conventions see [Plop templates](./plop.md).

## Allowed content

Deliberately narrow, not a generic richtext editor:

- Bullet lists (`ul`) and numbered lists (`ol`), no nesting
- Bold (`bold`)
- External link (always rendered with `target="_blank" rel="noopener noreferrer"`, regardless of what is stored)
- Internal link (`next/link`); the target is chosen in the editor from a dropdown of the entries in `pageLinks.ts` (see below)

No headings, no blockquote, no code, no colors/styles, no nested lists.

## Storage format & security model

The field value is a restricted JSON document (compatible with the Tiptap/ProseMirror JSON format), not an HTML string:

```json
{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "Hallo " },
        { "type": "text", "text": "Welt", "marks": [{ "type": "bold" }] }
      ]
    }
  ]
}
```

**Deliberate architecture decision (no sanitized HTML string):** There is no HTML string and no `dangerouslySetInnerHTML` in the rendering path. Instead:

1. **Editor** (`src/system/components/editable-fields/richtext/richtextExtensions.ts`): [Tiptap](https://tiptap.dev/) with a deliberately minimal, individually assembled extension set (not the full `StarterKit`) – only `Document`/`Paragraph`/`Text`/`Bold`/`BulletList`/`OrderedList`/`ListItem` (restricted to `content: 'paragraph'`, no nested lists) plus a custom `link` mark (not `@tiptap/extension-link`, since its autolink/click features are not needed here). ProseMirror normalizes pasted content (e.g. from Word) against this schema – anything that is not a registered node/mark type is dropped while parsing/pasting.
2. **Renderer** (`RichtextRenderer.tsx`): recursively translates the document into real React elements (`p`, `ul`/`ol`/`li`, `strong`, `a`/`next/link`). Only the node/mark types explicitly handled here can be produced at all – code injection is therefore structurally impossible rather than merely filtered.
3. **Zod schema** (`src/system/content/richtextSchema.ts`, `richtextDocSchema`): validates exactly the same structure on the server, among others on publish (`moduleRegistry[type].schema.parse(...)`, see [Publish](./publish.md)) and while rendering (`resolveModuleContent`). External links must be `http:`/`https:`, internal links must be a known path from `pageLinks.ts` (`isKnownPagePath`) – both are checked via `.refine(...)`.

All three layers independently know only the same narrow set of allowed node/mark types; no single layer is the sole protection mechanism.

## Link attribute `isExternal`

The custom `link` mark stores `{ href, isExternal }` instead of `target`/`rel` (those are never stored but fixed at render time – analogous to the existing `EditableText` `link` prop, which also uses `{ href, isExternal? }`). When HTML is pasted (copy & paste, e.g. from Word or a website), `isExternal` is derived heuristically from whether the pasted `href` matches a known path from `pageLinks.ts`.

## Page list `pageLinks.ts`

The dropdown and the link validation deliberately do not use `pageRegistry.ts` but the lightweight generated list `src/generated/pageLinks.ts` (`{ pathname, label }` per page; helpers such as `isKnownPagePath` in `src/system/content/pageLinks.ts`). `pageRegistry.ts` imports the complete content JSON of every page; via the richtext editor and the richtext schema (which also ends up in `CollectionFields.client.tsx`), all page content would otherwise be in the client bundle.

- Generated from the page JSON files (see [Plop templates](./plop.md), "Generated registries"). The `label` comes from the page's `label` field – `page:add` asks for it (default from the slug: `about-us` → "About us"). To rename a page in the dropdown, change `label` in the JSON and run `npm run generate`.
- `pageRegistry.ts` is generated from the same files, so the two lists always contain the same pages.

## Files

- `src/system/content/richtextSchema.ts` – Zod schema (`richtextDocSchema`) + derived types.
- `src/generated/pageLinks.ts` – page list for the link dropdown and link validation (generated); `src/system/content/pageLinks.ts` – `isKnownPagePath`, `PagePathname`.
- `src/system/components/editable-fields/richtext/richtextExtensions.ts` – Tiptap extension set incl. the custom `link` mark.
- `src/system/components/editable-fields/richtext/RichtextRenderer.tsx` – document → React elements (read-only, no `dangerouslySetInnerHTML`).
- `src/system/components/editable-fields/richtext/EditableRichtextDisplay.tsx` – wrapper around the renderer with the `.richtext` CSS class (styles already in `globals.css`).
- `src/system/components/editable-fields/richtext/EditableRichtext.client.tsx` – gate component (display vs. lazy-loaded editor), analogous to `EditableText.client.tsx`.
- `src/system/components/editable-fields/richtext/EditableRichtext.editor.client.tsx` – editing dialog: toolbar (bold/list/link), Tiptap `EditorContent`, revert – uses the same store mechanism as `EditableText` (see [Store](./store.md)).

## Dependencies

External dependencies (see `package.json`, all pinned to the same Tiptap version): `@tiptap/core`, `@tiptap/react`, `@tiptap/pm`, `@tiptap/extension-document`, `@tiptap/extension-paragraph`, `@tiptap/extension-text`, `@tiptap/extension-bold`, `@tiptap/extension-bullet-list`, `@tiptap/extension-ordered-list`, `@tiptap/extension-list-item`.

## Known pitfall: "Could not reference an opaque temporary reference"

This Next.js/React error occurred when calling the `publishContent` Server Action with a richtext draft (not inside its body — the error is thrown while serializing the arguments, before the function runs at all). Cause: `editor.getJSON()` (Tiptap/ProseMirror) partly returns objects without the standard prototype (`Object.create(null)`) for `attrs`. React's Server Action argument serialization does not reliably recognize such objects as "plain" and falls back to a "temporary reference" mechanism that is not configured for a Server Action call.

**Fix:** In `EditorNavbar.client.tsx`, the drafts are cloned once via `JSON.parse(JSON.stringify(drafts))` right before calling `publishContent` — this guarantees a plain JS structure (which is exactly what ends up in `content.json` anyway) and resolves the error. In addition, `handlePublish` is guarded with `try/catch/finally` so that the "Publish" button does not get stuck on "Publishing…" after an unexpected error.
