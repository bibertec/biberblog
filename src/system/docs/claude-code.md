# Claude Code

biberblog ships what Claude Code needs to work on a project: guidance in `CLAUDE.md` files (`src/system/CLAUDE.md`, imported by the root `CLAUDE.md`, plus path-scoped ones next to the code), a non-interactive entry to the generators, and skills for building modules from designs, for changing fields with existing content and for system updates. All of it is part of the system and comes with `npm run system:update`.

## Generators without prompts

Claude Code does not drive the interactive Plop prompts. It runs the same generators with `npm run scaffold -- <generator> '<answers-json>'` (see [CLI commands](./cli.md), "Non-interactive"). The actions validate the answers themselves, so the result is identical to an interactive run.

## Skill `/change-field`

`.claude/skills/change-field/SKILL.md` renames an editable field or changes its type while pages already have content – e.g. a text into a richtext, or a single image into a collection for a slider. It runs `module:change-field` ([CLI commands](./cli.md), "Change a field"), which changes the code and registries and converts the content on every page, and does the rest:

1. checks the starting point (clean working tree, latest content from `main`),
2. reads the field's code, registry entries and instances,
3. proposes the answers (name, type, image sizes, item fields) and shows per instance what happens to the content, especially what is lost – and waits for confirmation,
4. runs `npm run scaffold -- module:change-field …`,
5. adapts the markup to the new type (wrappers, props, collection item layout) and finds references the generator does not cover,
6. runs `generate -- --check`, `lint`, `typecheck` and `test`.

Run it with `/change-field` or just ask Claude to rename or restructure a field. One field per run; nothing is committed.

## Skill `/system-update`

`.claude/skills/system-update/SKILL.md` runs `npm run system:update` ([Updates](./update.md)) and does what the command leaves to you:

1. checks the starting point (clean working tree, not the template repository) and suggests a branch,
2. runs `npm run system:status`, summarizes the release from its CHANGELOG, explains local changes to system files and which of them may conflict – and asks before updating if there are any,
3. runs the update,
4. resolves conflicts by comparing what the release and the project changed (`git diff refs/biberblog/v<from> refs/biberblog/v<to>` vs. `… HEAD`) and asks when the intentions contradict,
5. does the manual steps printed by migrations (e.g. translating new editor texts), explains kept `package.json` values and offers opt-ins from the CHANGELOG,
6. runs `generate -- --check`, `lint`, `typecheck` and `test` and fixes project code that no longer fits.

Run it with `/system-update` or `/system-update <version>`. Nothing is committed. The skill comes with the system itself, so projects get it with their first update to 1.6.0 – that update is done with `npm run system:update` alone.

## Skill `/module-from-figma`

`.claude/skills/module-from-figma/SKILL.md` builds **one module per run** from a Figma frame or a screenshot:

1. reads the design (Figma MCP, or a screenshot as fallback),
2. proposes the module name, the editable fields and the image sizes – and waits for confirmation,
3. maps colors and type sizes to the tokens in `src/project/styles/globals.css`; missing tokens are proposed and only added after confirmation,
4. creates the module with `npm run scaffold -- module:create …`,
5. writes phone-first Tailwind markup around the generated fields, keeping the naming contracts ([Plop templates](./plop.md)),
6. runs `generate -- --check`, `lint`, `typecheck` and `test`.

Run it with `/module-from-figma <Figma frame link>` or just ask Claude to build a module from a design. Putting the module on a page stays a separate step (`npm run page:add-module`, or `npm run page:add` with a base page).

### Figma access

The skill works best with Figma's official MCP server, which gives Claude the frame's structure, exact sizes, variables and a screenshot.

Add it once per developer in the **user scope** – it then works in every biberblog project and nothing is committed:

```bash
claude mcp add --scope user --transport http figma https://mcp.figma.com/mcp
```

Then run `/mcp` in Claude Code and log in to Figma. Check the current URL and requirements (Dev Mode access; alternatively the local server of the Figma desktop app) in Figma's guide for its MCP server.

Why not in the repository (`.mcp.json`): the Figma login is personal anyway, every project created from the template would inherit the server whether it uses Figma or not, and the skill works without it. Why not as a Claude Code plugin: the skill depends on the system version (`npm run scaffold`, answer formats, naming contracts), so it ships with the system via `npm run system:update` instead of being versioned separately.

Without it, give Claude a screenshot or PNG export of the frame – ideally desktop and mobile. Sizes and spacing are then estimated, so check image sizes and spacing in the proposed plan more carefully.

### Limits

- One module per run; no page assembly.
- Images from the design are not downloaded – image fields start with the placeholder image, the customer uploads the real images in the editor.
- The result is a starting point: review the markup like any other code before committing.
