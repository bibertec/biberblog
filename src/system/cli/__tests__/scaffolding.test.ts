import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { translations } from '../../../project/config/translations.ts';
import { createTestProject, type TestProject } from './testProject.ts';

/**
 * End-to-end tests for the scaffolding CLI: every generator runs against a temporary copy of the
 * project, exactly like `npm run …` would (minus the interactive prompts).
 *
 * The assertions deliberately check behavior – which files exist, what the content JSON contains,
 * which registry entries exist, and that the generated project type-checks – instead of the exact
 * text of the generated code. That way the tests stay valid when the generators move from string
 * manipulation to AST-based code changes.
 *
 * The tests of this file build on each other and run in order (one scaffolding "session").
 * Unusual names avoid collisions with modules/pages of a real project.
 */

const TEAM = 'PlopTestTeam';
const SIMPLE = 'PlopTestSimple';
const PAGE = 'plop-test-page';
const PAGE_CONTENT = `src/project/content/${PAGE}.json`;
// Every page imports its content JSON for the metadata (`seo`), even without modules.
const BASE_PAGE_IMPORTS = [
  `import plopTestPageContent from '@/src/project/content/${PAGE}.json';`,
  `import { pageMetadata } from '@/src/system/content/seo';`,
];
const pageImports = (source: string) => source.split('\n').filter((line) => line.startsWith('import '));
const PAGE_FILE = `app/${PAGE}/page.tsx`;
const COPY = 'plop-test-copy';
const REGISTRIES = {
  modules: 'src/generated/moduleRegistry.ts',
  pages: 'src/generated/pageRegistry.ts',
  pageLinks: 'src/generated/pageLinks.ts',
  images: 'src/project/content/imageFieldRegistry.ts',
};
const PLACEHOLDER_IMAGE = { src: '/images/placeholder.webp', alt: translations.placeholders.imageAlt };
const PLACEHOLDER_DOC = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: translations.placeholders.text }] }],
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type ModuleEntry = { type: string; content: Record<string, unknown> };
type PageContent = { label: string; seo: { title: string; description: string }; modules: Record<string, ModuleEntry> };

let project: TestProject;
let originalRegistries: Record<string, string>;

const moduleDir = (name: string) => `src/project/components/modules/${name}`;

function instancesOf(type: string): [string, ModuleEntry][] {
  return Object.entries(project.readJson<PageContent>(PAGE_CONTENT).modules).filter(
    ([, entry]) => entry.type === type,
  );
}

function expectTypeCheckToPass() {
  const { ok, output } = project.typeCheck();
  expect(ok, output).toBe(true);
}

/** Registry entries are code; match them loosely so formatting changes don't break the tests. */
function registryHas(file: string, pattern: RegExp) {
  return pattern.test(project.read(file));
}

beforeAll(() => {
  project = createTestProject();
  originalRegistries = Object.fromEntries(
    Object.entries(REGISTRIES).map(([key, file]) => [key, project.read(file)]),
  );
});

afterAll(() => {
  project?.remove();
});

describe('scaffolding CLI', { timeout: 120_000 }, () => {
  it('module:create generates a module with all editable field types', () => {
    expect(project.exists('public/images/placeholder.webp')).toBe(false);
    project.run('module:create', {
      moduleName: TEAM,
      fields: [
        { fieldName: 'title', contentType: 'EditableText' },
        { fieldName: 'bio', contentType: 'EditableRichtext' },
        {
          fieldName: 'members',
          contentType: 'EditableCollection',
          itemFields: [
            { fieldName: 'name', contentType: 'EditableText' },
            { fieldName: 'text', contentType: 'EditableRichtext' },
            { fieldName: 'portrait', contentType: 'EditableImage', imageWidth: 300, imageHeight: 400 },
          ],
          titleField: 'name',
        },
        { fieldName: 'photo', contentType: 'EditableImage', imageWidth: 400, imageHeight: 300 },
      ],
    });

    for (const file of ['schema.ts', `${TEAM}.tsx`, 'CollectionFields.client.tsx', 'defaultContent.json', 'fieldKinds.json']) {
      expect(project.exists(`${moduleDir(TEAM)}/${file}`), file).toBe(true);
    }

    const defaults = project.readJson(`${moduleDir(TEAM)}/defaultContent.json`);
    expect(defaults.title).toBe(translations.placeholders.text);
    expect(defaults.bio).toEqual(PLACEHOLDER_DOC);
    expect(defaults.photo).toEqual(PLACEHOLDER_IMAGE);
    expect(defaults.members).toEqual([
      { id: expect.stringMatching(UUID), name: translations.placeholders.text, text: PLACEHOLDER_DOC, portrait: PLACEHOLDER_IMAGE },
    ]);

    expect(project.readJson(`${moduleDir(TEAM)}/fieldKinds.json`)).toEqual({
      title: { kind: 'editable', type: 'EditableText' },
      bio: { kind: 'editable', type: 'EditableRichtext' },
      members: { kind: 'editable', type: 'EditableCollection' },
      photo: { kind: 'editable', type: 'EditableImage' },
    });

    expect(registryHas(REGISTRIES.modules, new RegExp(`\\b${TEAM}\\s*:`))).toBe(true);
    expect(
      registryHas(REGISTRIES.images, new RegExp(`['"]${TEAM}\\.photo['"]\\s*:\\s*\\{[^}]*maxWidth:\\s*400[^}]*maxHeight:\\s*300`)),
    ).toBe(true);
    // Image item field of a collection: own registry key, images resolved on the server.
    expect(
      registryHas(REGISTRIES.images, new RegExp(`['"]${TEAM}\\.members\\.portrait['"]\\s*:\\s*\\{[^}]*maxWidth:\\s*300[^}]*maxHeight:\\s*400`)),
    ).toBe(true);
    expect(project.read(`${moduleDir(TEAM)}/${TEAM}.tsx`)).toMatch(/loadCollectionImages\(content\.members, \['portrait'\]\)/);
    // The first image field copies the placeholder into the project (then a normal project asset).
    expect(project.exists('public/images/placeholder.webp')).toBe(true);
  });

  it('module:create generates a module without collection file if it has no collection', () => {
    project.run('module:create', {
      moduleName: SIMPLE,
      fields: [{ fieldName: 'headline', contentType: 'EditableText' }],
    });

    expect(project.exists(`${moduleDir(SIMPLE)}/CollectionFields.client.tsx`)).toBe(false);
    expect(project.readJson(`${moduleDir(SIMPLE)}/defaultContent.json`)).toEqual({
      headline: translations.placeholders.text,
    });
  });

  it('page:add creates the page and registers it in pageRegistry and pageLinks', () => {
    project.run('page:add', { pageSlug: PAGE, label: 'Plop test page' });

    expect(project.exists(PAGE_FILE)).toBe(true);
    // A page without modules only needs the imports for its metadata.
    expect(pageImports(project.read(PAGE_FILE))).toEqual(BASE_PAGE_IMPORTS);
    expect(project.read(PAGE_FILE)).toContain('export const metadata = pageMetadata(plopTestPageContent);');
    expect(project.readJson<PageContent>(PAGE_CONTENT)).toEqual({
      label: 'Plop test page',
      seo: { title: 'Plop test page', description: '' },
      modules: {},
    });
    expect(registryHas(REGISTRIES.pages, new RegExp(`['"]/${PAGE}['"]\\s*:`))).toBe(true);
    expect(registryHas(REGISTRIES.pageLinks, new RegExp(`pathname:\\s*['"]/${PAGE}['"],\\s*label:\\s*'Plop test page'`))).toBe(true);
  });

  it('npm run generate picks up a label changed by hand; --check detects outdated files', () => {
    const page = project.readJson<PageContent>(PAGE_CONTENT);
    project.write(PAGE_CONTENT, `${JSON.stringify({ ...page, label: "Über 'uns'" }, null, 2)}\n`);

    expect(project.generate({ check: true }).ok).toBe(false);
    expect(project.generate().ok).toBe(true);
    expect(project.generate({ check: true }).ok).toBe(true);
    expect(project.read(REGISTRIES.pageLinks)).toContain(`label: 'Über \\'uns\\''`);

    project.write(PAGE_CONTENT, `${JSON.stringify(page, null, 2)}\n`);
    expect(project.generate().ok).toBe(true);
  });

  it('npm run generate rejects a page without label with a clear message', () => {
    const page = project.readJson<PageContent>(PAGE_CONTENT);
    project.write(PAGE_CONTENT, `${JSON.stringify({ ...page, label: undefined }, null, 2)}\n`);

    const result = project.generate();
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(new RegExp(`${PAGE}\\.json is not a valid page: label`));

    project.write(PAGE_CONTENT, `${JSON.stringify(page, null, 2)}\n`);
  });

  it('page:add-module adds module instances with their default content', () => {
    project.run('page:add-module', { pageSlug: PAGE, modulesToAdd: [TEAM, SIMPLE, SIMPLE] });

    const teamDefaults = project.readJson(`${moduleDir(TEAM)}/defaultContent.json`);
    expect(instancesOf(TEAM).map(([, entry]) => entry.content)).toEqual([teamDefaults]);

    const simpleIds = instancesOf(SIMPLE).map(([id]) => id);
    expect(simpleIds).toHaveLength(2);
    expect(new Set(simpleIds).size).toBe(2);

    const page = project.read(PAGE_FILE);
    expect(page).toMatch(new RegExp(`<${TEAM}\\b`));
    expect(page.match(new RegExp(`<${SIMPLE}\\b`, 'g'))).toHaveLength(2);
    expect(page).toMatch(new RegExp(`^import plopTestPageContent from '@/src/project/content/${PAGE}\\.json';$`, 'm'));
    expect(page.match(/^import \{ resolveModuleContent \}/gm)).toHaveLength(1);
    // The content import from the page template is reused, not duplicated.
    expect(page.match(/^import plopTestPageContent /gm)).toHaveLength(1);
  });

  it('page:add with a base page copies its rendered modules in render order, with default content', () => {
    // The developer reordered the modules in the page file: that order counts, not the JSON order.
    const [teamLine] = project.read(PAGE_FILE).split('\n').filter((line) => line.includes(`<${TEAM} `));
    project.write(PAGE_FILE, project.read(PAGE_FILE).replace(`${teamLine}\n`, '').replace('</main>', `${teamLine}\n      </main>`));

    // An instance only left in the JSON (no longer rendered) is not copied.
    const basePage = project.readJson<PageContent>(PAGE_CONTENT);
    const stale = { ...basePage, modules: { ...basePage.modules, stale1: { type: SIMPLE, content: {} } } };
    project.write(PAGE_CONTENT, `${JSON.stringify(stale, null, 2)}\n`);

    project.run('page:add', { pageSlug: COPY, label: 'Plop test copy', basePageSlug: PAGE });
    project.write(PAGE_CONTENT, `${JSON.stringify(basePage, null, 2)}\n`);

    const copy = project.readJson<PageContent>(`src/project/content/${COPY}.json`);
    expect(Object.values(copy.modules).map((entry) => entry.type)).toEqual([SIMPLE, SIMPLE, TEAM]);
    expect(copy.modules[`${TEAM.toLowerCase()}1`].content).toEqual(project.readJson(`${moduleDir(TEAM)}/defaultContent.json`));
    const renderedTypes = (file: string) => [...project.read(file).matchAll(/<(PlopTest\w+) id=/g)].map((match) => match[1]);
    expect(renderedTypes(`app/${COPY}/page.tsx`)).toEqual([SIMPLE, SIMPLE, TEAM]);
    expect(renderedTypes(`app/${COPY}/page.tsx`)).toEqual(renderedTypes(PAGE_FILE));
    expect(registryHas(REGISTRIES.pages, new RegExp(`['"]/${COPY}['"]\\s*:`))).toBe(true);
    expectTypeCheckToPass();

    // Later tests remove the modules, which must not be in use on another page.
    project.run('page:remove', { pageSlug: COPY });
  });

  it('module:add-editable-field adds fields to the module and to every existing instance', () => {
    project.run('module:add-editable-field', {
      moduleName: SIMPLE,
      contentType: 'EditableCollection',
      fieldName: 'faqs',
      itemFields: [
        { fieldName: 'question', contentType: 'EditableText' },
        { fieldName: 'answer', contentType: 'EditableRichtext' },
        { fieldName: 'icon', contentType: 'EditableImage', imageWidth: 64, imageHeight: 64 },
      ],
      titleField: 'question',
    });
    project.run('module:add-editable-field', {
      moduleName: SIMPLE,
      contentType: 'EditableImage',
      fieldName: 'banner',
      imageWidth: 800,
      imageHeight: 400,
      imageMobileWidth: 400,
      imageMobileHeight: 600,
    });
    project.run('module:add-editable-field', { moduleName: SIMPLE, contentType: 'EditableText', fieldName: 'subtitle' });

    // First collection field of the module → the collection file is created on demand.
    expect(project.exists(`${moduleDir(SIMPLE)}/CollectionFields.client.tsx`)).toBe(true);
    expect(
      registryHas(REGISTRIES.images, new RegExp(`['"]${SIMPLE}\\.banner['"]\\s*:\\s*\\{[^}]*maxWidth:\\s*800[^}]*maxHeight:\\s*400`)),
    ).toBe(true);
    // Optional mobile variant: nested in the same entry, as an exact fraction like the desktop format.
    expect(
      registryHas(
        REGISTRIES.images,
        new RegExp(`['"]${SIMPLE}\\.banner['"]\\s*:[^}]*mobile:\\s*\\{\\s*aspectRatio:\\s*400 / 600,\\s*maxWidth:\\s*400,\\s*maxHeight:\\s*600\\s*\\}`),
      ),
    ).toBe(true);
    // Collection item images never get one.
    expect(registryHas(REGISTRIES.images, new RegExp(`['"]${SIMPLE}\\.faqs\\.icon['"]\\s*:[^}]*mobile`))).toBe(false);
    expect(registryHas(REGISTRIES.images, new RegExp(`['"]${SIMPLE}\\.faqs\\.icon['"]\\s*:`))).toBe(true);

    for (const [, entry] of instancesOf(SIMPLE)) {
      expect(entry.content).toMatchObject({
        headline: translations.placeholders.text,
        subtitle: translations.placeholders.text,
        banner: PLACEHOLDER_IMAGE,
        faqs: [
          {
            id: expect.stringMatching(UUID),
            question: translations.placeholders.text,
            answer: PLACEHOLDER_DOC,
            icon: PLACEHOLDER_IMAGE,
          },
        ],
      });
    }
    expect(Object.keys(project.readJson(`${moduleDir(SIMPLE)}/fieldKinds.json`))).toEqual([
      'headline',
      'faqs',
      'banner',
      'subtitle',
    ]);
  });

  it('module:add-custom-field adds a non-editable field from a blueprint', () => {
    project.run('module:add-custom-field', { moduleName: SIMPLE, fieldName: 'isHighlighted', blueprintName: 'flag' });

    expect(project.readJson(`${moduleDir(SIMPLE)}/fieldKinds.json`).isHighlighted).toEqual({
      kind: 'custom',
      type: 'flag',
    });
    for (const [, entry] of instancesOf(SIMPLE)) {
      expect(entry.content.isHighlighted).toBe(false);
    }
  });

  it('rejects invalid or conflicting input in the actions themselves (not only in the prompts)', () => {
    expect(() => project.run('module:create', { moduleName: TEAM, fields: [{ fieldName: 'x', contentType: 'EditableText' }] })).toThrow(
      /already exists/,
    );
    expect(() => project.run('module:create', { moduleName: 'lowercase', fields: [{ fieldName: 'x', contentType: 'EditableText' }] })).toThrow(
      /PascalCase/,
    );
    expect(() => project.run('module:add-editable-field', { moduleName: SIMPLE, contentType: 'EditableText', fieldName: 'headline' })).toThrow(
      /already exists/,
    );
    expect(() =>
      project.run('module:add-editable-field', {
        moduleName: SIMPLE,
        contentType: 'EditableCollection',
        fieldName: 'noTitle',
        itemFields: [{ fieldName: 'body', contentType: 'EditableRichtext' }],
        titleField: 'body',
      }),
    ).toThrow(/title field/);
    expect(() => project.run('module:add-editable-field', { moduleName: SIMPLE, contentType: 'EditableImage', fieldName: 'noSize' })).toThrow(
      /positive integer/,
    );
    expect(() =>
      project.run('module:add-editable-field', {
        moduleName: SIMPLE,
        contentType: 'EditableImage',
        fieldName: 'halfMobile',
        imageWidth: 800,
        imageHeight: 400,
        imageMobileWidth: 400,
      }),
    ).toThrow(/Mobile image height must be a positive integer/);
    expect(() =>
      project.run('module:add-editable-field', { moduleName: SIMPLE, contentType: 'EditableText', fieldName: 'textMobile', imageMobileWidth: 400, imageMobileHeight: 600 }),
    ).toThrow(/Only "EditableImage" fields have a mobile variant/);
    expect(() =>
      project.run('module:add-editable-field', {
        moduleName: SIMPLE,
        contentType: 'EditableCollection',
        fieldName: 'noItemSize',
        itemFields: [
          { fieldName: 'label', contentType: 'EditableText' },
          { fieldName: 'picture', contentType: 'EditableImage' },
        ],
        titleField: 'label',
      }),
    ).toThrow(/positive integer/);
    expect(() => project.run('module:add-custom-field', { moduleName: SIMPLE, fieldName: 'x', blueprintName: 'missing' })).toThrow(
      /does not exist/,
    );
    expect(() => project.run('module:remove', { moduleName: TEAM })).toThrow(/still in use/);
    expect(() => project.run('page:remove', { pageSlug: 'home' })).toThrow(/home page cannot be removed/);
    expect(() => project.run('page:add', { pageSlug: PAGE })).toThrow(/already exists/);
    expect(() => project.run('page:add', { pageSlug: COPY, basePageSlug: 'missing' })).toThrow(/does not exist/);
    expect(project.exists(`src/project/content/${COPY}.json`)).toBe(false);
    expect(() => project.run('page:remove-module', { pageSlug: PAGE, instanceIdToRemove: 'nope1' })).toThrow(/does not exist/);
  });

  it('keeps working after the developer reformatted and restructured the generated code', () => {
    const schemaPath = `${moduleDir(TEAM)}/schema.ts`;
    const componentPath = `${moduleDir(TEAM)}/${TEAM}.tsx`;
    // Multi-line field definition, no trailing comma, and a developer-added field in between.
    project.write(
      schemaPath,
      project
        .read(schemaPath)
        .replace('title: z.string(),', 'title: z\n    .string()\n    .min(1),\n  // developer note\n')
        .replace('photo: imageValueSchema,', 'photo: imageValueSchema'),
    );
    // Removed placement comment, wrapped JSX, extra markup around the fields.
    project.write(
      componentPath,
      project
        .read(componentPath)
        .replace(/\s*\{\/\* PLOP_INJECT_FIELD[^}]*\}/, '')
        .replace(/<EditableText fieldId=\{`\$\{id\}\.title`\} value=\{content\.title\} \/>/, '<h2 className="title">\n        <EditableText\n          fieldId={`${id}.title`}\n          value={content.title}\n        />\n      </h2>'),
    );
    // Double quotes in the registry.
    project.write(REGISTRIES.images, project.read(REGISTRIES.images).replace(`'${TEAM}.photo'`, `"${TEAM}.photo"`));
    expect(project.read(schemaPath)).toContain('.min(1)');
    expect(project.read(componentPath)).toContain('<h2 className="title">');
    expect(project.read(componentPath)).not.toContain('PLOP_INJECT_FIELD');
    expect(project.read(REGISTRIES.images)).toContain(`"${TEAM}.photo"`);

    project.run('module:add-editable-field', { moduleName: TEAM, contentType: 'EditableText', fieldName: 'subtitle' });
    project.run('module:remove-editable-field', { moduleName: TEAM, fieldName: 'title' });
    project.run('module:remove-editable-field', { moduleName: TEAM, fieldName: 'photo' });

    const schema = project.read(schemaPath);
    expect(schema).not.toMatch(/\btitle\s*:/);
    expect(schema).not.toMatch(/\bphoto\s*:/);
    expect(schema).toMatch(/\bsubtitle\s*:\s*z\.string\(\)/);
    // Still needed by the image item field of the collection.
    expect(schema).toMatch(/\bportrait\s*:\s*imageValueSchema/);

    const component = project.read(componentPath);
    expect(component).not.toContain('.title`');
    expect(component).not.toMatch(/\bloadContentImage\b(?!')/);
    // The collection images are still resolved before the JSX → the component stays async.
    expect(component).toMatch(/\basync function\b/);
    expect(component).toContain('loadCollectionImages(');
    expect(component).toContain('.subtitle`');
    // Developer markup stays untouched.
    expect(component).toContain('<h2 className="title">');
    expect(registryHas(REGISTRIES.images, new RegExp(`${TEAM}\\.photo`))).toBe(false);

    for (const [, entry] of instancesOf(TEAM)) {
      expect(Object.keys(entry.content).sort()).toEqual(['bio', 'members', 'subtitle']);
    }
    expectTypeCheckToPass();
  });

  it('the generated project type-checks', () => {
    expectTypeCheckToPass();
  });

  it('module:change-field renames fields and changes their type, converting the content on every page', () => {
    const schemaPath = `${moduleDir(TEAM)}/schema.ts`;
    const componentPath = `${moduleDir(TEAM)}/${TEAM}.tsx`;
    const collectionPath = `${moduleDir(TEAM)}/CollectionFields.client.tsx`;
    const [[teamId]] = instancesOf(TEAM);
    const teamContent = () => project.readJson<PageContent>(PAGE_CONTENT).modules[teamId].content;
    const setTeamContent = (patch: Record<string, unknown>) => {
      const page = project.readJson<PageContent>(PAGE_CONTENT);
      page.modules[teamId].content = { ...page.modules[teamId].content, ...patch };
      project.write(PAGE_CONTENT, `${JSON.stringify(page, null, 2)}\n`);
    };
    setTeamContent({ subtitle: 'Line one\nLine two' });
    // Styling added by the developer stays with the field.
    project.write(
      componentPath,
      project.read(componentPath).replace(/<EditableText fieldId=\{`\$\{id\}\.subtitle`\}/, '<EditableText className="text-lg" fieldId={`${id}.subtitle`}'),
    );

    // Rename only: code, registry and content keep everything but the name.
    project.run('module:change-field', { moduleName: TEAM, fieldName: 'subtitle', newFieldName: 'tagline' });
    expect(project.read(schemaPath)).toMatch(/\btagline\s*:\s*z\.string\(\)/);
    expect(project.read(schemaPath)).not.toMatch(/\bsubtitle\b/);
    expect(project.read(componentPath)).toContain('<EditableText className="text-lg" fieldId={`${id}.tagline`} value={content.tagline} />');
    expect(project.readJson(`${moduleDir(TEAM)}/fieldKinds.json`).tagline).toEqual({ kind: 'editable', type: 'EditableText' });
    expect(teamContent().tagline).toBe('Line one\nLine two');
    expect(teamContent()).not.toHaveProperty('subtitle');

    // Text → richtext: same place in the markup, one paragraph per line.
    project.run('module:change-field', { moduleName: TEAM, fieldName: 'tagline', contentType: 'EditableRichtext' });
    expect(project.read(componentPath)).toContain('<EditableRichtext className="text-lg" fieldId={`${id}.tagline`} value={content.tagline} />');
    expect(project.read(componentPath)).not.toMatch(/<EditableText\b/);
    expect(project.read(schemaPath)).toMatch(/\btagline\s*:\s*richtextDocSchema/);
    expect(teamContent().tagline).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Line one' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Line two' }] },
      ],
    });

    // Renaming a collection renames its generated names and the registry keys of its item images.
    project.run('module:change-field', { moduleName: TEAM, fieldName: 'members', newFieldName: 'people' });
    const collection = project.read(collectionPath);
    expect(collection).toContain('peopleItemFields');
    expect(collection).toContain('export function PeopleField(');
    expect(collection).toContain(`'${TEAM}.people.portrait'`);
    expect(collection).not.toMatch(/members|Members/);
    expect(project.read(componentPath)).toContain('<PeopleField fieldId={`${id}.people`} value={content.people} images={peopleImages} />');
    expect(project.read(schemaPath)).toMatch(/const peopleItemSchema\b[\s\S]*export type PeopleItem\b[\s\S]*function createPeopleItem\b/);
    expect(registryHas(REGISTRIES.images, new RegExp(`${TEAM}\\.people\\.portrait['"]\\s*:`))).toBe(true);
    expect(registryHas(REGISTRIES.images, new RegExp(`${TEAM}\\.members`))).toBe(false);
    expectTypeCheckToPass();

    // Collection → image: the image of the first item, further items are dropped.
    const portrait = { src: '/images/team.webp', alt: 'Team' };
    const [item] = teamContent().people as Record<string, unknown>[];
    setTeamContent({ people: [{ ...item, portrait }, { ...item, id: 'second' }] });
    project.run('module:change-field', {
      moduleName: TEAM,
      fieldName: 'people',
      newFieldName: 'photo',
      contentType: 'EditableImage',
      imageWidth: 800,
      imageHeight: 600,
      itemField: 'portrait',
    });
    expect(teamContent().photo).toEqual(portrait);
    expect(project.exists(collectionPath)).toBe(false);
    expect(project.read(componentPath)).toContain('loadContentImage(content.photo)');
    expect(project.read(componentPath)).not.toContain('loadCollectionImages');
    expect(registryHas(REGISTRIES.images, new RegExp(`${TEAM}\\.photo['"]\\s*:\\s*\\{[^}]*maxWidth:\\s*800`))).toBe(true);
    expect(registryHas(REGISTRIES.images, new RegExp(`${TEAM}\\.people`))).toBe(false);
    expect(project.read(schemaPath)).not.toMatch(/people|People/);

    // Image → collection: the image becomes the only item.
    project.run('module:change-field', {
      moduleName: TEAM,
      fieldName: 'photo',
      newFieldName: 'gallery',
      contentType: 'EditableCollection',
      itemFields: [
        { fieldName: 'caption', contentType: 'EditableText' },
        { fieldName: 'picture', contentType: 'EditableImage', imageWidth: 300, imageHeight: 200 },
      ],
      titleField: 'caption',
      itemField: 'picture',
    });
    expect(teamContent().gallery).toEqual([{ id: expect.stringMatching(UUID), caption: translations.placeholders.text, picture: portrait }]);
    expect(project.read(collectionPath)).toContain('export function GalleryField(');
    expect(project.read(componentPath)).toContain('loadCollectionImages(content.gallery, [\'picture\'])');
    expect(registryHas(REGISTRIES.images, new RegExp(`${TEAM}\\.gallery\\.picture['"]\\s*:`))).toBe(true);
    expect(registryHas(REGISTRIES.images, new RegExp(`${TEAM}\\.photo`))).toBe(false);
    expect(Object.keys(project.readJson(`${moduleDir(TEAM)}/fieldKinds.json`))).toEqual(['bio', 'gallery', 'tagline']);
    expectTypeCheckToPass();
  });

  it('module:change-field rejects unsupported or incomplete changes before changing anything', () => {
    const files = [`${moduleDir(TEAM)}/schema.ts`, `${moduleDir(TEAM)}/${TEAM}.tsx`, PAGE_CONTENT, REGISTRIES.images];
    const before = files.map((file) => project.read(file));
    const change = (answers: Record<string, unknown>) => () => project.run('module:change-field', { moduleName: TEAM, ...answers });

    expect(change({ fieldName: 'bio', contentType: 'EditableImage', imageWidth: 10, imageHeight: 10 })).toThrow(/Cannot change/);
    expect(change({ fieldName: 'bio', contentType: 'EditableRichtext' })).toThrow(/Nothing to change/);
    expect(change({ fieldName: 'bio', newFieldName: 'gallery' })).toThrow(/already exists/);
    expect(change({ fieldName: 'bio', newFieldName: 'Bio' })).toThrow(/camelCase/);
    expect(change({ fieldName: 'bio', newFieldName: 'about', imageWidth: 10 })).toThrow(/without a type change/);
    expect(
      change({
        fieldName: 'bio',
        contentType: 'EditableCollection',
        itemFields: [{ fieldName: 'label', contentType: 'EditableText' }],
        titleField: 'label',
        itemField: 'label',
      }),
    ).toThrow(/is EditableText, but the field is EditableRichtext/);
    expect(change({ fieldName: 'missing', newFieldName: 'other' })).toThrow(/has no editable field/);
    expect(files.map((file) => project.read(file))).toEqual(before);
  });

  it('module:remove-editable-field removes fields everywhere, including collection and image leftovers', () => {
    project.run('module:remove-editable-field', { moduleName: SIMPLE, fieldName: 'faqs', contentType: 'EditableCollection' });
    project.run('module:remove-editable-field', { moduleName: SIMPLE, fieldName: 'banner', contentType: 'EditableImage' });

    // Last collection field removed → the collection file is removed as well.
    expect(project.exists(`${moduleDir(SIMPLE)}/CollectionFields.client.tsx`)).toBe(false);
    expect(registryHas(REGISTRIES.images, new RegExp(`${SIMPLE}\\.(banner|faqs)`))).toBe(false);
    const component = project.read(`${moduleDir(SIMPLE)}/${SIMPLE}.tsx`);
    expect(component).not.toMatch(/\basync function\b/);
    expect(component).not.toContain('loadCollectionImages');
    expect(Object.keys(project.readJson(`${moduleDir(SIMPLE)}/defaultContent.json`)).sort()).toEqual([
      'headline',
      'isHighlighted',
      'subtitle',
    ]);
    for (const [, entry] of instancesOf(SIMPLE)) {
      expect(entry.content).not.toHaveProperty('faqs');
      expect(entry.content).not.toHaveProperty('banner');
    }
  });

  it('module:remove-custom-field removes the field from the module and all instances', () => {
    project.run('module:remove-custom-field', { moduleName: SIMPLE, fieldName: 'isHighlighted' });

    expect(project.readJson(`${moduleDir(SIMPLE)}/fieldKinds.json`)).not.toHaveProperty('isHighlighted');
    for (const [, entry] of instancesOf(SIMPLE)) {
      expect(entry.content).not.toHaveProperty('isHighlighted');
    }
  });

  it('the project still type-checks after removing fields', () => {
    expectTypeCheckToPass();
  });

  it('page:remove-module removes single instances from content and page file', () => {
    const [firstSimpleId] = instancesOf(SIMPLE)[0];
    project.run('page:remove-module', { pageSlug: PAGE, instanceIdToRemove: firstSimpleId });

    expect(instancesOf(SIMPLE)).toHaveLength(1);
    // The module is still used once → its import and one usage remain.
    expect(project.read(PAGE_FILE).match(new RegExp(`<${SIMPLE}\\b`, 'g'))).toHaveLength(1);

    for (const [id] of [...instancesOf(SIMPLE), ...instancesOf(TEAM)]) {
      project.run('page:remove-module', { pageSlug: PAGE, instanceIdToRemove: id });
    }
    expect(project.readJson<PageContent>(PAGE_CONTENT).modules).toEqual({});
    expect(project.read(PAGE_FILE)).not.toMatch(new RegExp(`\\b(${SIMPLE}|${TEAM})\\b`));
    // The content import stays: the metadata still uses it.
    expect(pageImports(project.read(PAGE_FILE))).toEqual(BASE_PAGE_IMPORTS);
  });

  it('module:remove deletes the modules and their registry entries', () => {
    project.run('module:remove', { moduleName: TEAM });
    project.run('module:remove', { moduleName: SIMPLE });

    expect(project.exists(moduleDir(TEAM))).toBe(false);
    expect(project.exists(moduleDir(SIMPLE))).toBe(false);
    expect(registryHas(REGISTRIES.modules, new RegExp(`${TEAM}|${SIMPLE}|plopTestTeam|plopTestSimple`))).toBe(false);
    expect(registryHas(REGISTRIES.images, new RegExp(`${TEAM}\\.`))).toBe(false);
  });

  it('page:remove deletes the page and its registry entries', () => {
    project.run('page:remove', { pageSlug: PAGE });

    expect(project.exists(PAGE_CONTENT)).toBe(false);
    expect(project.exists(PAGE_FILE)).toBe(false);
    expect(registryHas(REGISTRIES.pages, new RegExp(PAGE))).toBe(false);
    expect(registryHas(REGISTRIES.pageLinks, new RegExp(PAGE))).toBe(false);
  });

  it('leaves no residue: all registries are back to their original state', () => {
    for (const [key, file] of Object.entries(REGISTRIES)) {
      expect(project.read(file), file).toBe(originalRegistries[key]);
    }
    expectTypeCheckToPass();
  });
});
