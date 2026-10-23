# Changelog

Changes to the biberblog system (`src/system/` and the system files listed in `manifest.json`). The version is `version` in `src/system/manifest.json`.

## 1.6.0 – 2026-10-23

- Claude Code: the guidance for the biberblog system moved to `src/system/CLAUDE.md`, which `npm run system:update` keeps up to date. The root `CLAUDE.md` stays project-owned and only imports it (`@src/system/CLAUDE.md`); the 1.6.0 migration adds that import. If your root `CLAUDE.md` had other content, the migration keeps it – remove biberblog guidance you copied into it before. Guidance only needed for the CLI and the migrations is in `src/system/cli/CLAUDE.md` and `src/system/migrations/CLAUDE.md`, which Claude Code loads only when working there.
- Claude Code skills, added to existing projects by `system:update` (new system files in `manifest.json`, `.claude/skills/<name>/SKILL.md`). Details: new doc `src/system/docs/claude-code.md`.
  - `/module-from-figma` builds one module from a Figma frame (Figma MCP) or a screenshot: proposes fields and image sizes for confirmation, maps the design to the tokens in `globals.css` (new tokens only after confirmation), scaffolds the module and writes phone-first Tailwind markup. The Figma MCP is set up once per developer in the user scope – see the doc.
  - `/change-field` renames a field or changes its type while pages already have content: plans the change with you (including what content is lost), runs `module:change-field`, adapts the markup to the new type and runs the checks.
  - `/system-update` runs `npm run system:update` guided: summarizes the release, explains local changes to system files and asks before updating, resolves conflicts with the release diff, does the manual steps of migrations and runs the checks. Your update to 1.6.0 itself still runs without it.
- New generator `npm run module:change-field`: renames an editable field and/or changes its type and converts its content on every page – text ↔ richtext; text, richtext or image → collection (the value becomes the only item); collection → text, richtext or image (from the first item). The field keeps its place in the markup and its `className`; code, `imageFieldRegistry.ts` and default content are updated. The output reports instances where content was dropped (formatting, further items, the mobile image). Details: `src/system/docs/cli.md`, "Change a field".
- `npm run scaffold -- <generator> '<answers-json>'` runs `page:add`, `page:add-module`, `module:create` and `module:change-field` without prompts – the answers as JSON, validated by the actions like an interactive run; destructive generators stay interactive. Examples: `src/system/docs/cli.md`, "Non-interactive". New system devDependency `node-plop` (before only a transitive dependency of `plop`), installed by `system:update`.
- `npm run page:add` can copy the module layout of an existing page (new prompt "Copy the module layout of an existing page?", answer `basePageSlug`): the new page gets instances of the modules the base page renders, in the order of its page file, each with the module's default content – the base page's texts are not copied. Instances left only in the base page's JSON are skipped and listed in the output. Details: `src/system/docs/cli.md`, "Add a page".

## 1.5.0 – 2026-10-16

- Images: an `EditableImage` field can have an optional mobile variant – its own format below Tailwind's `md` breakpoint (768 px) with its own file. In the image dialog, two icon buttons (desktop/smartphone) switch between the variants; by default the mobile image follows the desktop image (the largest centered crop in the mobile format), and the customer can crop it differently or choose another image ("Use desktop image" goes back). On publish, such a field always gets two WEBPs (`<uuid>.webp`, `<uuid>-mobile.webp`), the page renders `<picture>` and phones download only the mobile file. `preload` adds one preload per variant. Opt-in per field: `module:create`/`module:add-editable-field` offer the smartphone variant for top-level image fields; for an existing field, add `mobile: { aspectRatio, maxWidth, maxHeight }` to its entry in `imageFieldRegistry.ts` – module code and content stay unchanged, and until the field is published again, phones get the desktop file in the mobile format. Not yet available for image item fields of collections. Details: `src/system/docs/images.md`, "Mobile variant".
- `ImageFieldRules` now comes from the system (`src/system/content/imageFieldRules.ts`). The 1.5.0 migration switches `src/project/content/imageFieldRegistry.ts` to it and adds the editor texts `image.desktopVariant`, `image.mobileVariant` and `image.useDesktopImage` (English) to `src/project/config/translations.ts` – translate them if your editor texts are in another language. If a file was rewritten, the migration prints what to change by hand.

## 1.4.0 – 2026-10-07

- SEO: new projects now ship `app/robots.ts` and `app/sitemap.ts`, which serve `/robots.txt` and `/sitemap.xml` from the pages in `src/generated/pageLinks.ts` and an absolute origin from `src/project/config/siteUrl.ts`. All three files belong to the project, so `npm run system:update` does not add them to existing projects – copy the three files by hand to opt in. Details: `src/system/docs/seo.md`.

## 1.3.2 – 2026-10-07

- Docs: `decisions.md` and `architecture.md` no longer refer to rules in `AGENTS.md`, which the public file does not contain. They now state directly that changing a documented decision or adding a dependency needs an issue in the biberblog repository first.
- Fix (template only): the English default for `navbar.moreOptions` – the label of the menu button in the editor navbar, shown as tooltip and read by screen readers – was German ("Weitere Optionen"). New projects now get "More options". `src/project/config/translations.ts` belongs to the project, so `npm run system:update` does not change it: in existing projects with English editor texts, change it by hand.

## 1.3.1 – 2026-10-06

- On the first run, `npm run setup` also offers to remove biberblog's `CONTRIBUTING.md` from the root of a new project (recognized by its first line, like the template README) – the guide is only meant for the biberblog repository itself.

## 1.3.0 – 2026-10-05

- `npm run version:sync` copies `version` from `src/system/manifest.json` into `package.json` and the root version fields of `package-lock.json` (other fields stay untouched, unchanged files are not rewritten). It runs automatically before `npm run dev` and `npm run build` (`predev`/`prebuild`), so the project's `package.json` always shows the biberblog version it runs on. Details: `src/system/docs/cli.md`.

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
