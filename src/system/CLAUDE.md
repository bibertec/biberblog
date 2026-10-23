# biberblog system

Guidance for Claude Code on the biberblog system. This file is part of the system: `npm run system:update` keeps it up to date, and the project's root `CLAUDE.md` imports it with `@src/system/CLAUDE.md`. Project-specific notes belong in the root `CLAUDE.md`, not here. Paths below are relative to the repository root.

## What this is

biberblog is an on-page content editor layered on a static Next.js (App Router) site. Content lives as JSON in the repo; the customer edits fields directly on the live page, and "Publish" pushes all changes as one commit to `main` on GitHub, which triggers a Vercel deployment. No database, no CMS. Projects are created from the biberblog template repository and receive system updates via `npm run system:update`.

System files may be changed in a project, but they are meant to stay identical to the release: `npm run system:update` 3-way-merges every release into them, and changes to the same lines end up as conflicts. If a project has modified system files (`npm run system:status` lists them), don't run `system:update` without asking.

## Commands

Node version: see `.nvmrc` (Node 24). CLI scripts are `.ts` files run directly with `node` (native type stripping), so they must not use TS-only runtime syntax (enums, namespaces, parameter properties), and they import each other with relative paths and explicit `.ts` extensions (no `@/` alias).

```bash
npm run dev                    # predev runs version:sync + generate first
npm run build
npm run lint                   # eslint, --max-warnings 0
npm run typecheck              # next typegen && tsc --noEmit
npm run test                   # vitest run (src/**/*.test.ts)
npx vitest run src/system/content/seo.test.ts   # single file
npx vitest run -t "name of test"                # single test by name
npm run generate               # rewrite src/generated/ registries
npm run generate -- --check    # CI check that src/generated/ is up to date
npm run setup                  # interactive local setup (.env.local, editor secrets)
npm run editor:set-password    # set/rotate the editor password hash
npm run system:status          # system version vs. latest release, locally modified system files
npm run system:update          # apply system updates from newer releases
```

CI (`.github/workflows/biberblog.yml`) runs exactly: `generate -- --check`, `lint`, `typecheck`, `test`. Run all four before considering a change done.

Scaffolding (Plop): `module:create`, `module:remove`, `module:add-editable-field`, `module:remove-editable-field`, `module:add-custom-field`, `module:remove-custom-field`, `page:add`, `page:remove`, `page:add-module`, `page:remove-module`. These are interactive; some are destructive without confirmation. Full reference: `src/system/docs/cli.md`.

## Three zones

| Zone | Role |
|---|---|
| `src/system/` | The editor itself, identical in every project. |
| `src/project/` | Project-owned: modules (`components/modules/`), content JSON (`content/*.json`), styles, editor UI texts (`config/translations.ts`), image field sizes (`content/imageFieldRegistry.ts`). In the template repository it's the empty starting point for new projects. |
| `src/generated/` | `moduleRegistry.ts`, `pageRegistry.ts`, `pageLinks.ts` – fully rewritten by `npm run generate`. **Never edit by hand.** |

System files outside `src/system/` (route re-exports in `app/api/editor/`, the CI workflow) and the system deps/scripts in `package.json` are listed in `src/system/manifest.json`. `app/layout.tsx` (which renders `<BiberblogEditor />`) and the root `CLAUDE.md` are project-owned, so changes to them need a migration. A test checks `package.json` still contains everything the manifest requires. New system dependencies must be added to the manifest and to the dependency table in `src/system/docs/architecture.md`.

## Architecture essentials

- **Pages, modules and editable fields are never created/removed by hand.** The Plop generators create new files from Handlebars templates (`src/system/cli/templates/`) and modify existing files via ts-morph AST codemods (`src/system/cli/codemods/`). Codemods rely on naming contracts – e.g. `const <camelName>Schema = z.object(...)` in a module's `schema.ts`, `function <Module>()` returning JSX, fields identified by `fieldId={`${id}.<field>`}`, page default export `<PascalSlug>Page` plus `export const metadata = pageMetadata(<camelSlug>Content)`. See `src/system/docs/plop.md` before touching generated code or generators. Per-field-type code snippets exist once in `src/system/cli/codeGen.ts` and are shared by templates and codemods.
- **Field types:** `EditableText`, `EditableRichtext` (restricted Tiptap JSON, not HTML), `EditableCollection` (no nesting), `EditableImage` (fixed output size, crop only; optional mobile variant). Each lives in `src/system/components/editable-fields/<type>/` split into a server `*Display.tsx`, a thin `*.client.tsx`, and a lazily loaded `*.editor.client.tsx` so editor code never weighs on the public site.
- **Editor state:** one Zustand store `useEditorMode` (`src/system/store/editor-mode.ts`) holding `editMode` and `drafts`, keyed `` `${pathname}::${fieldId}` ``. Invariant: a draft exists only if it differs from the published value. SEO uses the reserved fieldId `seo`.
- **Publish** (`src/system/lib/publish/`): Server Action merges drafts into the page content JSON (via `pageRegistry`), validates with Zod against the module schemas, processes image drafts (temporary private Vercel Blob → sharp crop → WEBP in `public/`), and commits everything in one GitHub commit; the client then polls `app/api/editor/deployment` until the new deployment is live.
- **Auth** (`src/system/lib/auth/`): single password per project (Argon2id hash in env), signed session cookie. Editor mode is silently disabled if any env var in `REQUIRED_EDITOR_ENV_VARS` (`src/system/config/envVars.ts`) is missing – the Blob/OIDC vars come from Vercel, locally via `vercel env pull .env.local` (logged with a `[biberblog]` prefix).
- **System updates** (`src/system/cli/update.ts`): 3-way `git apply` of the diff between release tags, limited to system files. Changes a project needs outside system files (e.g. new translation keys, a changed line in `app/layout.tsx`) require a migration in `src/system/migrations/<version>.ts` with a test.

Design rationale and deliberately unimplemented features (no publish conflict check, no login rate limiting, etc.) are in `src/system/docs/decisions.md` – don't "fix" those without an agreed issue. Topic docs: `src/system/docs/*.md`; update the matching doc in the same change.

## Conventions

- **Pages stay static:** code that runs during page render must not use request-time APIs (`cookies()`, `headers()`).
- Server Components by default; `'use client'` as small and deep as possible. Server Actions for mutations; route handlers only where required (binary uploads, deployment polling).
- Validate Server Action payloads, content and API responses with Zod.
- Tailwind utilities only – no new CSS files, avoid arbitrary values. Form fields must stay ≥16px (`text-base`) to prevent iOS zoom; the editor is designed phone-first (see "Editor UI on phones" in `architecture.md`).
- Every customer-facing editor text goes through `EditorTranslations` (`src/system/config/editorTranslations.ts`, values in `src/project/config/translations.ts`). Comments, logs and developer messages are in English in code.
- Tests live next to the code (`*.test.ts`); generator tests are in `src/system/cli/`.
- Publishing from a local dev server commits to `main` of the repo configured in `.env.local` and triggers a production deploy.

## In the biberblog template repository

When working in the template repository itself (not in a project created from it):

- Most contributions go into `src/system/`. The root `CLAUDE.md`, `src/project/` and `app/` are copied into every new project – change them only if new projects need it.
- Conventional Commits (`feat(system): …`, `fix(system): …`, `docs: …`). Don't bump `version` in `src/system/manifest.json` or create tags – releases are done by the maintainer (`src/system/docs/update.md`, "Releasing").
