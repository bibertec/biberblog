---
name: change-field
description: Renames an editable field of a biberblog module or changes its type (text ↔ richtext, image → collection, collection → image …) while content already exists – plans the change with the user, runs `module:change-field` via `npm run scaffold`, which converts the content on every page, then fixes the markup around the field and runs the CI checks. Use when the user wants to rename a field, turn a text into a richtext, an image into a gallery/slider/collection, or otherwise restructure a field of an existing module.
---

# Change a field

Renames an editable field and/or changes its type in a module that is already used on pages. The generator `module:change-field` does the deterministic part – code, registries, default content and the content of every page; this skill plans it, runs it and finishes the markup. Reference: `src/system/docs/cli.md`, "Change a field" and "Non-interactive". Nothing is committed.

One field per run. Never edit `schema.ts`, `fieldKinds.json`, `defaultContent.json`, `imageFieldRegistry.ts` or the page JSON files by hand for the change itself – the generator keeps them consistent.

## 1. Starting point

- **Working tree:** `git status --porcelain` should be clean, so the change is one reviewable diff that `git checkout`/`git clean` can undo. If not, ask the user to commit or stash first; don't do it yourself.
- **Latest content:** the customer's publishes commit page JSON files to `main`. Suggest `git pull` (on `main`, or merge `main` into the branch) so the conversion runs on the current content – otherwise the next publish or merge brings the old structure back.

## 2. Understand the field

Find the module and field the user means (`src/project/components/modules/<Module>/`), then read:

- `fieldKinds.json` – the field's current type (only `kind: "editable"` fields can be changed),
- `<Module>.tsx` – where and how the field is rendered (wrapper elements, `className`, other props such as `link`, `bulletIcon`, `preload`),
- for collections `CollectionFields.client.tsx` – the item fields (`<field>ItemFields`) and the item markup,
- `src/project/content/imageFieldRegistry.ts` – sizes of image fields and image item fields,
- the instances: `grep -l '"type": "<Module>"' src/project/content/*.json`, and the current values of the field there.

## 3. Plan and confirm

Supported changes (anything else is rejected by the generator):

| From → to | Content |
|---|---|
| same type, new name | unchanged |
| `EditableText` → `EditableRichtext` | one paragraph per line |
| `EditableRichtext` → `EditableText` | plain text – formatting, links, lists and paragraph breaks are lost |
| text, richtext or image → `EditableCollection` | becomes the only item, in the item field `itemField` (same type); the image loses its mobile variant |
| `EditableCollection` → text, richtext or image | the item field `itemField` of the first item – further items and the other item fields are lost |

Not supported: e.g. text ↔ image, changing the item fields of a collection, custom (non-editable) fields. Image sizes are not a field change – they are edited in `imageFieldRegistry.ts` (`src/system/docs/images.md`). For anything else, explain the alternative (remove the field and add a new one – its content is lost) and let the user decide.

Show the plan and **wait for confirmation**:

- the answers: new name (camelCase, not used in the module), new type, and for a new type what `module:add-editable-field` would ask – image sizes (default: the sizes of the image the content comes from, from the registry), item fields with `titleField` (an `EditableText` item field) and `itemField`;
- per page and instance, what happens to the content – name every instance where content is lost (formatted richtext, more than one item, a mobile image) and what exactly;
- what you will change in the markup afterwards (step 5).

## 4. Run the generator

```bash
npm run scaffold -- module:change-field '{"moduleName":"<Module>","fieldName":"<field>","newFieldName":"<new>","contentType":"<Type>", …}'
```

Answer keys: `src/system/docs/cli.md`, "Answers per generator". On invalid answers it fails with exit code 1 and changes nothing – fix the answers. The output says on how many pages the content was converted and in how many instances content was dropped; compare that with your plan.

## 5. Finish the markup

The generator put the new element where the old one was, kept its `className` and dropped every other prop. Look at `git diff -- src/project/components/modules/<Module>/` and make the result right:

- **Wrappers that no longer fit:** richtext renders block elements (`<p>`, lists) – move it out of headings, `<span>`, `<p>` or `<a>` wrappers. A text that used to be richtext may need a wrapper for its text styles.
- **Props of the old element:** carry over what still applies to the new type (e.g. `link` only exists on `EditableText`, `bulletIcon` only on `EditableRichtext`, loading props such as `preload` only on `EditableImage`); drop the rest.
- **New collections:** style `render<Field>Item` in `CollectionFields.client.tsx` and the layout of the items (phone-first, Tailwind utilities and the tokens in `src/project/styles/globals.css`, like the existing markup of the module). The image of the first item should look like the old single image where that makes sense.
- **Other references:** `grep -rn "<field>" src/project app` for uses the generator does not cover (e.g. custom code passing `content.<field>` to helpers in other files). `content.<field>` inside the module component is renamed already.

Keep the naming contracts (`src/system/docs/plop.md`, "What the codemods rely on").

## 6. Check

```bash
npm run generate -- --check
npm run lint
npm run typecheck
npm run test
```

Then report:

- the change (`<field>`: old type → new type, new name),
- the pages converted, and every instance where content was dropped – these the customer should check in the editor after the deployment,
- what you changed in the markup,
- the check results.

Suggest the commit (e.g. `refactor(<Module>): turn <field> into a collection`) and that it is deployed before the customer edits the module again. Don't commit.
