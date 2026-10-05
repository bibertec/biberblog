# Changelog

Changes to the biberblog system (`src/system/` and the system files listed in `manifest.json`). The version is `version` in `src/system/manifest.json`.

## 1.2.1 – 2026-10-05

- Fix: `EditableText` links to an anchor on the current page (`link={{ href: '#section' }}`) scroll on every click. They are now rendered as a native `<a>` instead of `next/link`, which only scrolls when the hash changes – with the hash already in the URL, a second click did nothing. Use `#section` (not `/#section`) for anchors on the current page.

## 1.2.0 – 2026-09-30

- `EditableRichtext` has an optional `bulletIcon` prop: an icon element (e.g. `<CircleCheckBig className="size-[1em]" />` from Lucide) that replaces the markers of bullet lists. The icon sits next to the text and never overlaps it; its size and the gap to the text (margin, e.g. `me-4`) come from the icon's own classes. Numbered lists keep their numbers. `RichtextRenderer` accepts the same prop, e.g. for richtext item fields in a collection's `render<Field>Item` callback. Details: `src/system/docs/richtext.md`.
- Fix: richtext item fields in collections are rendered with the `.richtext` styles from `globals.css`, like `EditableRichtext` – before, their lists had no bullets or numbers and paragraphs no spacing. `RichtextRenderer` now adds the `richtext` class itself; utility classes passed via `className` still override these styles.

## 1.1.1 – 2026-09-29

- Fix: `EditableImage` and `CollectionImage` always render in the format from `imageFieldRegistry` (`maxWidth / maxHeight`). Before, the browser switched to the file's own aspect ratio once it had loaded, so changing a field's format (e.g. 4:3 → 16:9) had no effect on images published under the old rules. They are now cropped by CSS (`object-fit: cover`, centered) until a new image or crop is published for the field.

## 1.1.0 – 2026-09-28

- System updates: `npm run system:update` merges a newer release into the project (3-way merge with Git, `package.json` entries from the manifest, versioned migrations), `npm run system:status` shows the version, newer releases and local changes to system files. Details: `src/system/docs/update.md`.
- Fix: inline editable fields no longer stretch to the full width inside flex containers (`self-start` on the inline wrapper in `EditableFieldWrapper`).
- `manifest.json`: `repository` points to the public repository `bibertec/biberblog`.
- The project README written by `npm run setup` mentions the update commands.

## 1.0.0 – 2026-09-27

First public release – the starting point for all further versions.

- Three zones: `src/project/` (the developer's code), `src/system/` (the editor, identical in every project), `src/generated/` (registries derived by `npm run generate`).
- On-page editor mode behind one project password (Argon2id hash, long-lived session), rendered by `<BiberblogEditor />` in the layout.
- Field types `EditableText`, `EditableRichtext`, `EditableCollection` (with text, richtext and image item fields) and `EditableImage` (upload with zoom, pan and rotate crop).
- SEO title and description per page, edited in the editor.
- Publish via one GitHub commit to `main`, deployment tracking on Vercel.
- Editor UI texts per project in `src/project/config/translations.ts`.
- Scaffolding CLI for pages, modules and fields (`src/system/cli/`), `npm run generate`, `npm run setup`.
- CI workflow `.github/workflows/biberblog.yml` (generated files, lint, type check, tests).
- Ships without example content: the home page is empty, there are no modules yet.
