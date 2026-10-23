# biberblog CLI

Guidance for Claude Code on `src/system/cli/` (Plop generators, `generate`, `setup`, `system:update`). Part of the system, kept up to date by `npm run system:update`. Paths are relative to the repository root.

## Running scripts

CLI scripts are `.ts` files run directly with `node` (native type stripping), so they must not use TS-only runtime syntax (enums, namespaces, parameter properties), and they import each other with relative paths and explicit `.ts` extensions (no `@/` alias). The same applies to `src/system/scripts/` and `src/system/migrations/`.

## Generators

- New files come from Handlebars templates (`src/system/cli/templates/`); existing files are modified via ts-morph AST codemods (`src/system/cli/codemods/`).
- Codemods rely on naming contracts – e.g. `const <camelName>Schema = z.object(...)` in a module's `schema.ts`, `function <Module>()` returning JSX, fields identified by `fieldId={`${id}.<field>`}`, page default export `<PascalSlug>Page` plus `export const metadata = pageMetadata(<camelSlug>Content)`. Templates and codemods must keep producing and matching exactly these shapes.
- Per-field-type code snippets exist once in `src/system/cli/codeGen.ts` and are shared by templates and codemods – don't duplicate them.
- Generator tests are in `src/system/cli/` (`__tests__/` and `*.test.ts`).

Read `src/system/docs/plop.md` before touching generated code or generators; command reference in `src/system/docs/cli.md`.

## System updates

`update.ts` applies the diff between release tags as a 3-way `git apply`, limited to system files (`src/system/` plus the files listed in `src/system/manifest.json`), then syncs the system entries in `package.json` and runs the migrations of the new versions. Changes a project needs outside system files require a migration – see `src/system/migrations/CLAUDE.md`. Details: `src/system/docs/update.md`.
