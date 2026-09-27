# Plop templates & scaffolding

Reference for how the scaffolding CLI works internally. For how to use the commands, see [CLI commands](./cli.md).

## Three ways of generating code

| Situation | Mechanism |
|---|---|
| **New files** (`module:create`, `page:add`) | Handlebars templates in `src/system/cli/templates/` rendered by Plop's `add` action. |
| **Changing existing files you work with** (adding/removing fields, modules on a page, image field rules) | Codemods on the syntax tree (AST) via [ts-morph](https://ts-morph.com/) in `src/system/cli/codemods/`. |
| **Registries in `src/generated/`** (modules, pages, page links) | Rewritten completely from their sources by `generate()` – see below. |

## Generated registries (`src/generated/`)

The project has three zones: `src/project/` (you work here), `src/system/` (the editor, identical in every project) and `src/generated/` (derived from your project, never edited by hand). `src/generated/` contains:

| File | Derived from | Used for |
|---|---|---|
| `moduleRegistry.ts` | the folders in `src/project/components/modules/` (with `schema.ts`) | module schemas for rendering (`resolveModuleContent`) and publish validation |
| `pageRegistry.ts` | `src/project/content/*.json` | pathname → content file; merge base on publish (see [Publish](./publish.md)) |
| `pageLinks.ts` | pathname and `label` of the same JSON files | page list of the richtext link dialog, internal link validation (see [Richtext](./richtext.md)) |

`generate()` (`src/system/cli/generate.ts`) validates every page JSON (`pageContentSchema`) and writes the three files from scratch, in a fixed order (home page first, then alphabetically). It runs:

- at the end of `module:create`, `module:remove`, `page:add` and `page:remove`,
- via `npm run generate` – e.g. after changing a page `label` by hand,
- automatically before `npm run dev` and `npm run build` (`predev`/`prebuild`), so a deployment can never use outdated registries,
- in CI as `npm run generate -- --check`, which fails if the committed files are outdated.

The files are committed so that changes show up in diffs and type checks work without a build step. Since they are always rewritten, a change of their format needs no migration.

## Codemods

The codemods do not search for text or anchor comments. They look up the actual code structure – "the `z.object({ … })` of `teamSchema`", "the JSX returned by the function `Team`" – and change it there. Consequences:

- **Formatting doesn't matter.** Line breaks, indentation, quote style, trailing commas or extra code the developer added do not break the generators. Untouched code stays exactly as it is.
- **Precise.** Only the named property, declaration or JSX element is changed – e.g. removing the field `title` never touches a `title` inside another object.
- **Loud failures.** If the expected structure is missing (e.g. the schema variable was renamed), the generator stops with a message naming the file and what it could not find, instead of silently doing nothing.
- **Clean-up included.** Imports that are no longer used after a removal are removed; a component without image fields is no longer `async`; an emptied `CollectionFields.client.tsx` is deleted. A page imports its content JSON and `resolveModuleContent` only while it renders at least one module – the imports are added with the first module and removed with the last.

### What the codemods rely on

These names are the contract between generated code and codemods. Keep them when editing generated code:

| File | Expected structure |
|---|---|
| `src/project/content/imageFieldRegistry.ts` | `const imageFieldRegistry = { … }` |
| `<Module>/schema.ts` | `const <moduleName>Schema = z.object({ … })` (camelCase module name) |
| `<Module>/<Module>.tsx` | `function <Module>(…)` that returns a JSX element; fields are identified by their `fieldId={`${id}.<field>`}` attribute |
| `<Module>/CollectionFields.client.tsx` | `<field>ItemFields`, `render<Field>Item`, `<Field>Field` per collection field |
| Page file (`app/**/page.tsx`) | default-exported function `<PascalSlug>Page` (e.g. `AboutUsPage`, avoids name clashes with modules) returning JSX, plus `export const metadata = pageMetadata(<camelSlug>Content)` (see [SEO](./seo.md)); modules go into `<main>` (or the outermost element), identified by their `id="…"` attribute |

### Optional placement comments

Where exactly a new field or module appears in the markup is a layout decision the syntax tree cannot make. By default, new fields are appended as the last child of the element the module component returns, and new modules as the last child of `<main>` on the page. Two optional JSX comments override this:

| Comment | File | Effect |
|---|---|---|
| `{/* PLOP_INJECT_FIELD … */}` | `<Module>/<Module>.tsx` | New fields are inserted right before it |
| `{/* PLOP_INJECT_MODULE … */}` | Page file | New modules are inserted right before it |

Both are included in newly generated files and can be moved or deleted freely. All other `PLOP_INJECT_*` comments of earlier versions are no longer used and can be removed.

## Validation

Every action validates its input itself (names, existing modules/fields/pages, collection item fields, image dimensions, blueprints, "module still in use", "home page cannot be removed"), before any file is changed. The prompts keep their own validation for immediate feedback, but the actions do not depend on it – so the generators behave the same when run without prompts (tests, scripts). Shared checks live in `src/system/cli/validation.ts`.

## Content types

`AVAILABLE_CONTENT_TYPES` (`src/system/cli/constants.ts`) lists the types selectable at module field level: `EditableText`, `EditableRichtext`, `EditableCollection`, `EditableImage`. `AVAILABLE_ITEM_CONTENT_TYPES` lists the types allowed *inside* a collection item – `EditableText`, `EditableRichtext`, `EditableImage`, deliberately without `EditableCollection` itself (no nested collections).

The code snippets per field type exist exactly once, in `src/system/cli/codeGen.ts`, and are used by both the templates (as Handlebars helpers) and the codemods:

| Function | Produces | Template helper |
|---|---|---|
| `zodSchemaFor` | Zod expression of a field or item field | `{{{zodSchemaFor this}}}` |
| `schemaImportsFor` | schema imports of a field (incl. its item fields) | `{{{schemaFileImports fields}}}` |
| `componentFieldJsx` | JSX line of the field in the module component | `{{{componentFieldJsx this ../moduleName}}}` |
| `loadStatementFor` | `const <field> = await loadContentImage(…)` (image field) or `const <field>Images = await loadCollectionImages(…)` (collection with image items) before the JSX | `{{{loadStatementFor this}}}` |
| `componentImportsFor` | imports the component needs for a field | `{{{componentFileImports fields}}}` |
| `collectionImportsFor` | imports `CollectionFields.client.tsx` needs for the item fields | `{{{collectionFileImports fields}}}` |
| `itemFieldDef`, `collectionItemJsx` | entry of the `<field>ItemFields` descriptor, markup of an item field in `render<Field>Item` | `{{{itemFieldDef this @root.moduleName ../fieldName}}}`, `{{{collectionItemJsx …}}}` |

`importDeclarations` turns the import lists into code for new files (one declaration per module); the codemods add the same imports to existing files one by one.

Multi-line blocks of collections come from two Handlebars partials, rendered by `module:create` as partials and by the codemods via `renderTemplateFile` (`src/system/cli/helpers.ts`):

- `collectionItemSchema.ts.hbs` – item schema, item type and `create<Field>Item` factory in `schema.ts`
- `collectionFieldWrapper.tsx.hbs` – `<field>ItemFields`, `render<Field>Item` and `<Field>Field` in `CollectionFields.client.tsx`

A new "simple" content type needs: an entry in `AVAILABLE_CONTENT_TYPES` (and `AVAILABLE_ITEM_CONTENT_TYPES` if usable as an item field), a case in `defaultValueForContentType` (`src/system/cli/helpers.ts`; placeholder texts come from `translations.placeholders` in `src/project/config/translations.ts`), and the corresponding cases in `src/system/cli/codeGen.ts` (plus the collection partials if usable as an item field). Details on the existing types: [Richtext](./richtext.md), [Collection](./collection.md), [Image](./images.md).

### EditableCollection: item fields

If `EditableCollection` is chosen in `module:create` or `module:add-editable-field`, a nested prompt loop asks for the item fields (name + content type, plus width/height for image item fields) and the `titleField` – an `EditableText` item field shown as title in the editor's item list. A collection without such a field is rejected. The prompt steps shared by both generators live in `src/system/cli/prompts.ts`.

### EditableImage: target dimensions & registry

For `EditableImage`, the generators ask for the target width/height in pixels (fixed by the developer, not editable by editors). The rules are stored per image *field* in `src/project/content/imageFieldRegistry.ts`, key `'<Module>.<field>'` (image item fields: `'<Module>.<collection>.<itemField>'`), with the aspect ratio written as a fraction (`aspectRatio: 400 / 300`) – exact and self-documenting. Adding/removing an image field or a collection and removing a module keep this registry in sync: removals delete a key together with everything below it (`'Team'` → all image fields of the module).

New image fields start with the placeholder `/images/placeholder.webp`. The first image field of a project copies it from `src/system/assets/placeholder.webp` into `public/images/`; from then on it is a normal project asset (never deleted by publishing, never touched by system updates).

The module component becomes an `async function` with at least one `EditableImage` field and resolves each image before the JSX via `loadContentImage`; when the last image field is removed, `async` and the imports are removed again.

## Module structure

Each module lives in `src/project/components/modules/<ModuleName>/`:

| File | Content |
|---|---|
| `schema.ts` | Zod schema + `type <ModuleName>Content`; for collections additionally item schemas/factories |
| `<ModuleName>.tsx` | Component (`{ id, content }` props, Server Component) rendering the editable fields; for collections only the generated `<Field>Field` wrapper is used, no functions are passed (see [Collection](./collection.md)) |
| `CollectionFields.client.tsx` | Only present with at least one `EditableCollection` field: `'use client'` file with the wrappers per collection field |
| `defaultContent.json` | Default values, flat map `fieldName -> value` (for collections: one dummy item) |
| `fieldKinds.json` | Bookkeeping: `fieldName -> { kind: "editable" \| "custom", type: string }` — tells the generators which fields exist and of which type; only read by the Plop scripts |

## Content model

One JSON file per page at `src/project/content/<slug>.json`:

```json
{
  "label": "Home",
  "seo": { "title": "Home", "description": "" },
  "modules": {
    "hero1": { "type": "Hero", "content": { "eyebrow": "..." } }
  }
}
```

`label` is the name of the page in the editor (link dialog), not shown on the website; `page:add` asks for it (default derived from the slug). `seo` is maintained by the customer in the editor's SEO dialog; a new page starts with its label as title and an empty description (see [SEO](./seo.md)).

Module instance ids follow the convention `lowercase(module type) + number`, unique per page (not globally).

## Blueprints (custom fields)

Non-editable field types live in `src/project/content/blueprints/*.json`:

```json
{ "zodType": "string" | "number" | "boolean", "defaultValue": <matching value> }
```

Display name = file name without `.json`. New types: add a new file, no code changes needed. The `addCustomField` action reads the blueprint itself.

## Code organization

| File/folder | Content |
|---|---|
| `src/system/cli/plopfile.ts` | wiring only, calls `register*(plop)` |
| `src/system/cli/generators/` | one generator per file: prompts + list of actions |
| `src/system/cli/actions/` | custom action types: validation, then codemods and JSON updates |
| `src/system/cli/codemods/` | AST changes per file type: `module.ts` (schema, component, collection file), `page.ts`, `imageFieldRegistry.ts` |
| `src/system/cli/generate.ts`, `src/system/cli/bin/generate.ts` | `generate()` for `src/generated/` and its command line entry (`npm run generate [-- --check]`) |
| `src/system/cli/assets.ts` | copies the placeholder image into the project on demand |
| `src/system/cli/ast.ts` | small ts-morph toolkit (objects, imports, JSX, formatting) |
| `src/system/cli/codeGen.ts` | code snippets per field type (single source for templates and codemods) |
| `src/system/cli/content.ts` | helpers for module/page JSON files |
| `src/system/cli/validation.ts` | shared input validation |
| `src/system/cli/prompts.ts` | prompt steps shared by several generators (image size, collection item fields) |
| `src/system/cli/names.ts` | naming conventions (camelCase, PascalCase, paths) |
| `src/system/cli/constants.ts` | paths, patterns, available content types |
| `src/system/cli/helpers.ts` | Handlebars helpers and partials, default values |
| `src/system/cli/templates/` | Handlebars templates for new files |

**Important:** relative imports between these files need the explicit `.ts` extension (`from '../helpers.ts'`) — Node runs `src/system/cli/plopfile.ts` via native TypeScript type stripping, which, unlike bundlers/`tsx`, does not rewrite paths.

## Tests

`src/system/cli/__tests__/scaffolding.test.ts` runs every generator against a temporary copy of the project (`src/system/cli/__tests__/testProject.ts`), exactly like the CLI does – plain Node with native type stripping, only the interactive prompts are replaced by fixed answers. The tests form one scaffolding session: create modules, add a page and module instances, add and remove editable and custom fields, reject invalid input, keep working after the generated code was reformatted by hand, remove everything again, and finally check that all registries are back to their original state. In between, the generated project is type-checked with `tsc`.

The assertions check behavior (files, content JSON, registry entries, type check) rather than the exact generated text.
