# Architecture

## Project structure

Three zones inside `src/`:

| Zone | Who edits it | Content |
|---|---|---|
| `src/project/` | the developer | modules, content JSON, styles, editor UI texts, image sizes |
| `src/system/` | nobody – identical in every project | editor components, publish/image/auth logic, CLI (`cli/`), API route handlers (`api/`), assets, these docs, `LICENSE`, `.env.example` |
| `src/generated/` | the CLI (`npm run generate`) | registries derived from the module folders and page JSON files |

The system reaches outside `src/system/` only where Next.js or the tooling requires it – each of these is a thin, fixed file or line:

- `app/api/editor/deployment/route.ts`, `app/api/editor/image/upload/route.ts` – re-export the handlers from `src/system/api/` (plus the route config Next.js needs in the route file itself).
- `<BiberblogEditor />` in `app/layout.tsx` – the only editor line in the project's layout.
- `.github/workflows/biberblog.yml` – the CI checks of the system; own workflows go into separate files.
- `package.json` – the dependencies and the npm scripts of the system (CLI commands, `generate`, `predev`/`prebuild`).

Everything else in the repository root belongs to the project. The system only relies on the default `@/*` path alias in `tsconfig.json`.

`src/system/manifest.json` records this boundary in machine-readable form: the system `version`, the upstream `repository`, the system `files` outside `src/system/`, and the `dependencies`, `devDependencies` and `scripts` the system needs in `package.json` (a test checks that the project still has all of them). Changes per version: `src/system/CHANGELOG.md`. The manifest is the basis of system updates (`npm run system:update`, see [Updates](./update.md)).

## Content scaffolding

Modules and pages are never created by hand. They are generated and kept in sync by [Plop](https://plopjs.com/) generators; new files come from Handlebars templates, changes to existing files are made on the syntax tree with ts-morph, and `src/generated/` is rewritten from its sources (details: [Plop templates](./plop.md)).

## Editor mode & authentication

Customers edit content directly on the page in a password-protected editor mode (one password per project/deployment, no user management) – details: [Authentication](./auth.md).

## Richtext

Second field type next to `EditableText`: a deliberately narrow richtext editor (lists, bold, internal/external links), stored as a restricted JSON document rather than an HTML string – details: [Richtext](./richtext.md).

## Collection

Third field type: a list of items the customer maintains (add/remove/reorder). The developer defines the item structure during scaffolding – details: [Collection](./collection.md).

## Image

Fourth field type: `next/image` with target dimensions fixed by the developer; editors can only change the crop (zoom/pan/rotation). While editing, the original is stored as a temporary, private blob in Vercel Blob. Only on publish is the crop applied destructively on the server (sharp), and the finished WEBP lands in the same commit as the text/content changes – details: [Image](./images.md).

## Store

State management uses [Zustand](https://zustand.docs.pmnd.rs/). A single store covers both the editor mode and the editing drafts (details: [Store](./store.md)).

## Publish

Clicking "Publish" merges all open drafts of the session into the matching `content.json` files and pushes them in one commit directly to `main`, which automatically triggers a new Vercel deployment – no CMS, no database (details: [Publish](./publish.md)).

## Editor UI texts

All texts the customer sees in the editor – buttons, dialogs, hints, error messages returned by the server, and the placeholder content Plop writes into new fields – live in `src/project/config/translations.ts`. Its shape is defined by the `EditorTranslations` type (`src/system/config/editorTranslations.ts`); `satisfies EditorTranslations` makes TypeScript report missing or misspelled keys. Texts with values are small functions (e.g. `tooLarge: (maxMegabytes) => ...`).

- One language per project, no i18n library, no language switching. The file ships with English texts; for a customer who speaks another language, replace the values in this one file.
- Developer-facing texts (code comments, logs, internal errors, Plop prompts and output, scripts) are not part of it and are written in English directly in the code.
- The file has no runtime imports (only a relative `import type`), so Plop can load it via plain Node as well.
- Server errors: customer-facing errors (e.g. "not authenticated", image errors) use the translated texts directly. Unexpected technical errors during publishing are shown as `errors.publishFailed(detail)`, i.e. a translated generic message plus the technical detail.

## Editor UI on phones

- **Field font size:** all form fields use `text-base` (`src/system/components/forms/fieldStyles.ts`). It must stay at least 16px – the project's `--text-base` included: iOS Safari zooms into a focused field with a smaller font and keeps the zoom after the dialog closes; the page then overflows sideways, and the fixed navbar can end up outside the visible area.
- **Scroll lock:** while a `Dialog` is open, the page behind it does not scroll (`overflow: hidden` on `<html>`, counted so nested dialogs work, classic scrollbar gutter kept to avoid a sideways shift). The dialog's content area uses `overscroll-contain`, so scrolling to its end does not hand the scroll over to the page.
- **Dialog height:** at most `90svh` (the one arbitrary value, deliberately): iOS 26 Safari does not draw fixed content in the area of its floating bottom bar, so a taller dialog was cut off at the bottom (buttons included).
- **Dialog layout:** only the content (title included) scrolls; the footer always stays visible – error message, `footerStart` on the left (e.g. "Reset to original" from `EditableFieldWrapper`), Cancel/Confirm on the right (wraps onto a second line if a translation is too long). The content fades out over its bottom padding via a CSS mask, so it disappears softly behind the footer instead of being cut off hard; once scrolled to the end, only the empty padding is faded. The mask uses the *top* mask utilities running bottom-up (`mask-t-from-transparent mask-t-to-black mask-t-to-6`: transparent at the bottom edge, opaque 1.5rem above) – the `mask-b-*` utilities measure from the top edge and would need an arbitrary `calc(100% - …)` value. Dialog content should not bring its own scroll container.
- **Initial focus:** browsers focus the first focusable element of a dialog. `Dialog` keeps that only for text entry (login, text dialog); otherwise the dialog itself takes the focus – e.g. the richtext "Bold" button would get a focus ring on iOS and look selected.

## Updates

Every project has its own copy of the system. `npm run system:update` merges a newer release into it (3-way merge with Git, `package.json` entries from the manifest, versioned migrations); `npm run system:status` shows the version and local changes to system files – details: [Updates](./update.md).

## Dependencies

Runtime:

| Package | Why |
|---|---|
| `next`, `react`, `react-dom` | The framework: App Router, static rendering, Server Actions, `next/image`. |
| `zod` | Validates content (page and module schemas, richtext) at build time and before every publish. |
| `zustand` | One small store for the editor mode and the drafts, without a provider around the app. |
| `@tiptap/*` | Richtext editor; only the individual extensions actually needed (no `StarterKit`), all pinned to the same version. |
| `@node-rs/argon2` | Argon2id hashing/verification of the editor password (native, fast, no build step). |
| `@vercel/blob` | Private temporary storage for images while editing, with presigned uploads directly from the browser. |
| `sharp` | Crops, resizes and converts images to WEBP on publish (and in `transform:images`). |
| `lucide-react` | Icons in the editor UI; also recommended for project code. |
| `@formkit/auto-animate` | Animates reordering, adding and removing items in the collection dialog, so a move is visible instead of a text swap in place. ~3 KB, no dependencies, editor bundle only; respects "reduce motion". |

Development:

| Package | Why |
|---|---|
| `plop`, `inquirer` | CLI scaffolding for pages, modules and fields; `inquirer` also for the prompts of `npm run setup` and `editor:set-password`. |
| `ts-morph` | Lets the CLI change existing code via the syntax tree (AST) instead of text search – robust against formatting and manual changes. |
| `tailwindcss`, `@tailwindcss/postcss` | Styling of the project and the editor UI. |
| `typescript`, `@types/*` | Type checking; `satisfies` checks tie registries, content and translations together. |
| `eslint`, `eslint-config-next` | Linting with the Next.js rules (incl. Core Web Vitals). |
| `vitest` | Unit and integration tests (`npm run test`); test files live next to the code they test (`*.test.ts`), generator tests in `src/system/cli/`. |
| `@redux-devtools/extension` | Types for Zustand's `devtools` middleware (store inspection during development only). |

No state, fetching or styling library beyond these; new dependencies need a concrete reason and are agreed on in an issue in the biberblog repository first.

## Deliberate decisions

What is intentionally not implemented and which risks are accepted in return (e.g. no conflict check on publish, no login rate limiting): [Decisions](./decisions.md).
