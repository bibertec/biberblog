# Changelog

Changes to the biberblog system (`src/system/` and the system files listed in `manifest.json`). The version is `version` in `src/system/manifest.json`.

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
