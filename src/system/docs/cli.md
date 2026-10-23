# CLI commands

All commands are run from the project root. They generate and remove pages, modules and fields and keep all registries and content files in sync – never do these steps by hand. How the generators work internally: [Plop templates](./plop.md).

> Commands marked as **destructive** delete files or content immediately, without asking for confirmation. Commit your work first.

## Project

### Set up a new project

```bash
npm run setup
```

Prepares a project created from the biberblog template: writes `.env.local` (session secret, password hash, repository variables – existing values are never overwritten), prints the variables to add in Vercel and, on the first run, replaces the biberblog README and removes the root `LICENSE` and `CONTRIBUTING.md`. Run it again after every `vercel env pull .env.local`. Details: README, "Quickstart".

### Regenerate `src/generated/`

```bash
npm run generate            # rewrite the generated registries
npm run generate -- --check # only check (CI)
```

Runs automatically after the page and module commands and before `npm run dev`/`npm run build`. Needed by hand after changing a page `label` in its JSON file.

### Sync the version

```bash
npm run version:sync
```

Copies `version` from `src/system/manifest.json` into `package.json` and the root version fields of `package-lock.json`. Runs automatically before `npm run dev`/`npm run build` – needed by hand only to update `package.json` right away, e.g. after `npm run system:update` or when preparing a release.

### Update the system

```bash
npm run system:status            # version, newer release, local changes to system files
npm run system:update            # merge the latest biberblog release
npm run system:update -- 1.2.0   # merge a specific release
```

Merges a newer biberblog release into the project (3-way merge – local changes to `src/system/` are kept where the release does not touch the same lines) and updates the system entries in `package.json`. Nothing is committed. Details: [Updates](./update.md).

## Pages

### Add a page

```bash
npm run page:add
```

Enter the slug in kebab-case (e.g. `about-us`) and the label of the page (the name in the editor's link dropdown, default derived from the slug, e.g. "About us"). Creates the content file (`src/project/content/<slug>.json`, SEO title = label) and the page file (`app/<slug>/page.tsx`, with the `metadata` export from the page's SEO values), and updates `src/generated/`.

Optionally pick an existing page whose module layout the new page copies (e.g. a new `terms` page built like `privacy`): the new page gets instances of the modules the existing page renders, in the same order (instances left only in its JSON are skipped), each with the module's default content – the texts of the existing page are not copied. To rename the page later, change `label` in its JSON file and run `npm run generate`.

### Remove a page (destructive)

```bash
npm run page:remove
```

Select the page. Deletes the content file and the complete page folder in `app/*`. The home page cannot be removed.

## Modules

### Create a module

```bash
npm run module:create
```

Name the module (PascalCase) and add any number of editable fields (`EditableText`, `EditableRichtext`, `EditableCollection`, `EditableImage`). For collections you define the item fields (`EditableText`, `EditableRichtext`, `EditableImage`) and the title field; for images – also image item fields – the fixed target width and height in pixels, and for top-level image fields optionally a smartphone variant with its own width and height. The module is created in `src/project/components/modules/<Module>/` – from there, markup, styling and the order of the fields are entirely up to you.

### Add a module to a page

```bash
npm run page:add-module
```

Select the page and one or more modules. The order of the modules on the page can be changed freely in the page file afterwards.

### Remove a module from a page (destructive)

```bash
npm run page:remove-module
```

Select the page and the module instance. Its content on that page is deleted.

### Remove a module completely (destructive)

```bash
npm run module:remove
```

Deletes the module folder and its registry entries. Only works if the module is no longer used on any page – remove its instances with `page:remove-module` first.

## Fields

### Add an editable field

```bash
npm run module:add-editable-field
```

Select the module, the field type and a field name. For `EditableImage`, also enter the fixed target width and height in pixels and, optionally, the size of a smartphone variant (see [Image](./images.md)). The field is added with a default value to every page that already uses the module.

### Remove an editable field (destructive)

```bash
npm run module:remove-editable-field
```

The field's content is lost on every page that uses the module.

### Add a custom (non-editable) field

```bash
npm run module:add-custom-field
```

For values used in the markup that the customer must not edit (e.g. a flag or a fixed number). Select the module, the field type ("blueprint", see `src/project/content/blueprints/*`) and a field name. Using the value in the markup is up to you.

New blueprint types: add a JSON file `{ "zodType": "string" | "number" | "boolean", "defaultValue": ... }` to `src/project/content/blueprints/`.

### Remove a custom field (destructive)

```bash
npm run module:remove-custom-field
```

If the field is still used in the markup, TypeScript reports an error – remove the usage by hand.

## Non-interactive (scripts, Claude Code)

```bash
npm run scaffold -- <generator> '<answers-json>'
```

Runs `page:add`, `page:add-module` or `module:create` without the prompts: the answers are passed as one JSON object and validated by the generator's actions, exactly as if they had been entered interactively. Prints the changed files; on invalid answers it fails with the error message and exit code 1. The destructive generators can only be run interactively.

Put the JSON in single quotes so the shell passes it unchanged. The answers are the same as in the interactive prompts – type: `ModuleFieldAnswer` in `src/system/cli/types.ts`.

### Example: a new page with two new modules

```bash
# 1. Module with a text field
npm run scaffold -- module:create '{"moduleName":"Hero","fields":[{"fieldName":"headline","contentType":"EditableText"}]}'

# 2. Module with every field type
npm run scaffold -- module:create '{
  "moduleName": "Features",
  "fields": [
    { "fieldName": "headline", "contentType": "EditableText" },
    { "fieldName": "intro", "contentType": "EditableRichtext" },
    { "fieldName": "image", "contentType": "EditableImage", "imageWidth": 1600, "imageHeight": 900,
      "imageMobileWidth": 800, "imageMobileHeight": 1000 },
    { "fieldName": "items", "contentType": "EditableCollection", "titleField": "title",
      "itemFields": [
        { "fieldName": "title", "contentType": "EditableText" },
        { "fieldName": "text", "contentType": "EditableRichtext" },
        { "fieldName": "icon", "contentType": "EditableImage", "imageWidth": 160, "imageHeight": 160 }
      ] }
  ]
}'

# 3. Page (label optional, default derived from the slug: "about-us" → "About us")
npm run scaffold -- page:add '{"pageSlug":"services","label":"Services"}'

# 4. Put the modules on the page (in this order)
npm run scaffold -- page:add-module '{"pageSlug":"services","modulesToAdd":["Hero","Features"]}'
```

A page built like an existing one (modules with their default content, see "Add a page"):

```bash
npm run scaffold -- page:add '{"pageSlug":"terms","label":"Terms","basePageSlug":"privacy"}'
```

### Answers per generator

| Generator | Keys |
|---|---|
| `page:add` | `pageSlug` (kebab-case), optional `label`, optional `basePageSlug` |
| `page:add-module` | `pageSlug`, `modulesToAdd` (module names, added in this order; a name may appear several times) |
| `module:create` | `moduleName` (PascalCase), `fields` (at least one) |

Per entry in `fields`:

| `contentType` | Additional keys |
|---|---|
| `EditableText`, `EditableRichtext` | – |
| `EditableImage` | `imageWidth`, `imageHeight` (output size in px); optional both `imageMobileWidth` and `imageMobileHeight` |
| `EditableCollection` | `itemFields` (entries like above, but only `EditableText`, `EditableRichtext`, `EditableImage` – images without mobile variant), `titleField` (name of an `EditableText` item field) |

Field names are camelCase and unique within the module.

Used by the Claude Code skill `/module-from-figma` – see [Claude Code](./claude-code.md).

## Images

### Optimize static images

```bash
npm run transform:images
```

Converts all `.jpg`/`.png` files in `public/images` into `.webp`. **The original files are deleted** – keep a copy if you still need them. (Images edited by the customer are processed automatically on publish; this command is for images you add yourself.)

## Editor password

```bash
npm run editor:set-password
```

Asks for the customer's password and prints its Argon2id hash for `EDITOR_PASSWORD_HASH`. Setting a new hash ends all existing editor sessions (see [Authentication](./auth.md)).
