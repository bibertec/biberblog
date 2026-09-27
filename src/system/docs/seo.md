# SEO

The customer maintains the SEO title and description of every page in the editor. The values live in the `seo` section of the page's content JSON and are published like all other content.

## Concept

- **Content model:** `seo: { title, description }` in `src/project/content/<slug>.json` (`seoSchema`, `src/system/content/seo.ts`; part of `pageContentSchema`).
- **Output:** every page file exports `export const metadata = pageMetadata(<slug>Content);`. `pageMetadata` trims the values and omits empty ones, so the defaults from `metadata` in `app/layout.tsx` apply. The page template of `page:add` contains this line; the content import it needs is shared with the modules (`page:add-module` reuses it, `page:remove-module` keeps it).
- **Defaults of a new page:** title = the page `label`, description empty.
- Only `title` and `description` – no Open Graph, no canonical URL, no per-page robots settings. The developer can extend `metadata` in the page file or the layout.

## Editing (`SeoDialog`)

- The "SEO" entry in the flyout of the `EditorNavbar` (`EditorNavbarMenu`) opens `SeoDialog.client.tsx` (wrapper: `Dialog`). It is only mounted while open.
- On opening, the Server Action `loadSeoPages()` (`src/system/lib/seo/actions.ts`, session check) returns label, pathname and published `seo` values of all pages from `pageRegistry` – the state of the last build, i.e. the same base the publish merge uses. Loaded on demand, so the SEO values of all pages are not part of the client bundle (`pageLinks` is also used on the website itself).
- Each page gets a "Title" input and a "Description" textarea, pre-filled with the open draft if there is one, otherwise with the published value. A page with an open SEO draft is marked "Unsaved".
- **Character counter** below each field (`48 / 60`), turns amber above the recommended length (`SEO_RECOMMENDED_LENGTH`: title 60, description 160 characters). Only a hint – longer values are accepted.
- "Apply" trims the values and writes one draft per page that differs from its published value (`draftKey(pathname, 'seo')`, value `{ title, description }`); a page that matches its published value again gets its draft removed (store invariant, see [Store](./store.md)). "Cancel" discards all changes in the dialog.

## Publish

The SEO draft of a page has the field id `SEO_FIELD_ID` (`'seo'`). `publishContent` recognizes it before resolving module fields, validates it with `seoSchema` (unknown keys are stripped) and writes it into the page's `seo` section. It is committed together with all other drafts in the same commit (see [Publish](./publish.md)). A module field id always has the form `moduleId.fieldName`, so there is no collision.

## Files

- `src/system/content/seo.ts` – `SEO_FIELD_ID`, `seoSchema`, `SEO_RECOMMENDED_LENGTH`, `pageMetadata`.
- `src/system/lib/seo/actions.ts` (`'use server'`) – `loadSeoPages`.
- `src/system/components/editor-navbar/SeoDialog.client.tsx` – the dialog.
- `src/system/cli/templates/page/page.tsx.hbs`, `content.json.hbs` – metadata export and default values of new pages.
