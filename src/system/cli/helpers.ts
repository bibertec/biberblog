import fs from 'node:fs';
import type { NodePlopAPI } from 'plop';
import type { ItemFieldAnswer, ModuleFieldAnswer } from './types.ts';
import { translations } from '../../project/config/translations.ts';
import { COLLECTION_FIELD_WRAPPER_TEMPLATE, COLLECTION_ITEM_SCHEMA_TEMPLATE, PLACEHOLDER_IMAGE_SRC } from './constants.ts';
import {
  SCHEMA_IMPORTS,
  collectionImportsFor,
  collectionItemJsx,
  componentFieldJsx,
  componentImportsFor,
  importDeclarations,
  itemFieldDef,
  itemImageFieldNames,
  loadStatementFor,
  loadVariableFor,
  schemaImportsFor,
  zodSchemaFor,
} from './codeGen.ts';
import { defaultPageLabel, pageContentVarFor, pagePathFor, toPascalCase } from './names.ts';

export { lowerFirst, pagePathFor, pathnameFor, toCamelCase, toPascalCase } from './names.ts';

export function defaultValueForContentType(
  contentType: string,
  itemFields?: ItemFieldAnswer[],
): unknown {
  switch (contentType) {
    case 'EditableText':
      return translations.placeholders.text;
    case 'EditableRichtext':
      return {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: translations.placeholders.text }],
          },
        ],
      };
    case 'EditableImage':
      return { src: PLACEHOLDER_IMAGE_SRC, alt: translations.placeholders.imageAlt };
    case 'EditableCollection': {
      const dummyItem: Record<string, unknown> = { id: crypto.randomUUID() };
      for (const itemField of itemFields ?? []) {
        dummyItem[itemField.fieldName] = defaultValueForContentType(itemField.contentType);
      }
      return [dummyItem];
    }
    default:
      throw new Error(
        `No default value defined for content type "${contentType}". Please add it in plop/helpers.ts (function "defaultValueForContentType").`,
      );
  }
}

export function zodExpressionFor(zodType: string): string {
  switch (zodType) {
    case 'string':
      return 'z.string()';
    case 'number':
      return 'z.number()';
    case 'boolean':
      return 'z.boolean()';
    default:
      throw new Error(
        `Unknown zodType "${zodType}" in blueprint. Allowed: string, number, boolean.`,
      );
  }
}

const COLLECTION_BASE_IMPORTS = [
  ['@/src/system/components/editable-fields/collection/EditableCollection.client', 'EditableCollection', 'default'],
  ['@/src/system/components/editable-fields/collection/collectionTypes', 'ItemFieldDef', 'type'],
] as const;

/** Import block of a new `schema.ts`. */
export function schemaFileImports(fields: ModuleFieldAnswer[]): string {
  const names = new Set(fields.flatMap(schemaImportsFor));

  return importDeclarations([['zod', 'z', 'named'], ...Array.from(names, (name) => [SCHEMA_IMPORTS[name], name, 'named'] as const)]);
}

/** Import block of a new `<Module>.tsx`. */
export function componentFileImports(fields: ModuleFieldAnswer[]): string {
  return importDeclarations(fields.flatMap(componentImportsFor));
}

/** Import block of a new `CollectionFields.client.tsx`. */
export function collectionFileImports(fields: ModuleFieldAnswer[]): string {
  const collections = fields.filter((field) => field.contentType === 'EditableCollection');

  return importDeclarations([
    ...COLLECTION_BASE_IMPORTS,
    ...collections.flatMap(collectionImportsFor),
    ...collections.flatMap((field) => {
      const pascal = toPascalCase(field.fieldName);
      return [
        ['./schema', `create${pascal}Item`, 'named'],
        ['./schema', `${pascal}Item`, 'type'],
      ] as const;
    }),
  ]);
}

/**
 * Renders a template file (e.g. a collection partial) as a string – for custom actions that
 * insert code into existing files outside Plop's own template pipeline.
 * This way `module:create` and `module:add-editable-field` use exactly the same templates.
 */
export function renderTemplateFile(
  plop: NodePlopAPI,
  templatePath: string,
  data: Record<string, unknown>,
): string {
  return plop.renderString(fs.readFileSync(templatePath, 'utf-8'), data).trimEnd();
}

export function registerHelpers(plop: NodePlopAPI) {
  plop.setHelper('zodExpressionFor', zodExpressionFor);
  plop.setHelper('defaultValueFor', (contentType: string, itemFields?: ItemFieldAnswer[]) =>
    JSON.stringify(defaultValueForContentType(contentType, itemFields)),
  );
  plop.setHelper('pagePath', (pageSlug: string) => pagePathFor(pageSlug));
  plop.setHelper('pageContentVar', (pageSlug: string) => pageContentVarFor(pageSlug));
  plop.setHelper('json', (value: unknown) => JSON.stringify(value));
  plop.setHelper('pageLabel', (label: unknown, pageSlug: string) =>
    typeof label === 'string' && label.trim() !== '' ? label.trim() : defaultPageLabel(pageSlug),
  );
  plop.setHelper('eq', (a: unknown, b: unknown) => a === b);
  // Code snippets per field – same functions as the codemods use (plop/codeGen.ts).
  plop.setHelper('zodSchemaFor', (field: { fieldName: string; contentType: string }) => zodSchemaFor(field));
  plop.setHelper('componentFieldJsx', (field: ModuleFieldAnswer, moduleName: string) =>
    componentFieldJsx(field, moduleName),
  );
  plop.setHelper('loadStatementFor', (field: ModuleFieldAnswer) => loadStatementFor(field));
  plop.setHelper('needsAsyncComponent', (fields: ModuleFieldAnswer[]) => fields.some((field) => loadVariableFor(field) !== undefined));
  plop.setHelper('hasItemImages', (field: ModuleFieldAnswer) => itemImageFieldNames(field).length > 0);
  plop.setHelper('itemFieldDef', (itemField: ItemFieldAnswer, moduleName: string, collectionFieldName: string) =>
    itemFieldDef(itemField, moduleName, collectionFieldName),
  );
  plop.setHelper('collectionItemJsx', (itemField: ItemFieldAnswer, moduleName: string, collectionFieldName: string) =>
    collectionItemJsx(itemField, moduleName, collectionFieldName),
  );
  plop.setHelper('schemaFileImports', schemaFileImports);
  plop.setHelper('componentFileImports', componentFileImports);
  plop.setHelper('collectionFileImports', collectionFileImports);
}

export function registerPartials(plop: NodePlopAPI) {
  plop.setPartial(
    'collectionItemSchema',
    fs.readFileSync(COLLECTION_ITEM_SCHEMA_TEMPLATE, 'utf-8'),
  );
  plop.setPartial(
    'collectionFieldWrapper',
    fs.readFileSync(COLLECTION_FIELD_WRAPPER_TEMPLATE, 'utf-8'),
  );
}
