import { toPascalCase } from './names.ts';

/**
 * Single source for the small code snippets per field. Used by the Handlebars templates (via
 * helpers, for new files) and by the codemods (for existing files).
 */

type ItemField = { fieldName: string; contentType: string };
type Field = ItemField & { itemFields?: ItemField[] };
export type Import = readonly [moduleSpecifier: string, name: string, kind: 'default' | 'named' | 'type'];

const IMPORTS = {
  EditableText: '@/src/system/components/editable-fields/text/EditableText.client',
  EditableRichtext: '@/src/system/components/editable-fields/richtext/EditableRichtext.client',
  EditableImage: '@/src/system/components/editable-fields/image/EditableImage.client',
  loadContentImage: '@/src/system/lib/images/loadContentImage',
  imageFieldRegistry: '@/src/project/content/imageFieldRegistry',
  CollectionImages: '@/src/system/components/editable-fields/collection/CollectionImages.client',
} as const;

export const SCHEMA_IMPORTS = {
  richtextDocSchema: '@/src/system/content/richtextSchema',
  imageValueSchema: '@/src/system/content/imageSchema',
} as const;

export const RICHTEXT_RENDERER_IMPORT = '@/src/system/components/editable-fields/richtext/RichtextRenderer';

/** Key in `imageFieldRegistry`: `'<Module>.<field>'` or `'<Module>.<collection>.<itemField>'`. */
export function imageRegistryKey(moduleName: string, ...fieldPath: string[]): string {
  return [moduleName, ...fieldPath].join('.');
}

export function imageRegistryEntry(width: number, height: number): string {
  return `{ aspectRatio: ${width} / ${height}, maxWidth: ${width}, maxHeight: ${height} }`;
}

/** Names of the image item fields of a collection field. */
export function itemImageFieldNames(field: Field): string[] {
  return (field.itemFields ?? []).filter((itemField) => itemField.contentType === 'EditableImage').map((itemField) => itemField.fieldName);
}

export const hasItemFieldOfType = (field: Field, contentType: string) =>
  (field.itemFields ?? []).some((itemField) => itemField.contentType === contentType);

// --- schema.ts --------------------------------------------------------------------------------

/** Zod schema of a field – also of an item field inside a collection. */
export function zodSchemaFor({ fieldName, contentType }: ItemField): string {
  switch (contentType) {
    case 'EditableText':
      return 'z.string()';
    case 'EditableRichtext':
      return 'richtextDocSchema';
    case 'EditableCollection':
      return `z.array(${fieldName}ItemSchema)`;
    case 'EditableImage':
      return 'imageValueSchema';
    default:
      throw new Error(`No schema defined for content type "${contentType}" (plop/codeGen.ts).`);
  }
}

/** Schema imports the fields need (including the item fields of collections). */
export function schemaImportsFor(field: Field): (keyof typeof SCHEMA_IMPORTS)[] {
  const types = [field.contentType, ...(field.itemFields ?? []).map((itemField) => itemField.contentType)];
  const names: (keyof typeof SCHEMA_IMPORTS)[] = [];
  if (types.includes('EditableRichtext')) names.push('richtextDocSchema');
  if (types.includes('EditableImage')) names.push('imageValueSchema');

  return names;
}

// --- <Module>.tsx -----------------------------------------------------------------------------

/** Variable the module component resolves before the JSX (only fields with images). */
export function loadVariableFor(field: Field): string | undefined {
  if (field.contentType === 'EditableImage') return field.fieldName;
  if (field.contentType === 'EditableCollection' && itemImageFieldNames(field).length > 0) return `${field.fieldName}Images`;

  return undefined;
}

/** Statement that resolves the images of a field before the JSX (empty for fields without images). */
export function loadStatementFor(field: Field): string {
  const variable = loadVariableFor(field);
  if (!variable) return '';
  if (field.contentType === 'EditableImage') {
    return `const ${variable} = await loadContentImage(content.${field.fieldName});`;
  }
  const names = itemImageFieldNames(field).map((name) => `'${name}'`).join(', ');

  return `const ${variable} = await loadCollectionImages(content.${field.fieldName}, [${names}]);`;
}

export function componentFieldJsx(field: Field, moduleName: string): string {
  const { fieldName, contentType } = field;
  const common = `fieldId={\`\${id}.${fieldName}\`} value={content.${fieldName}}`;
  switch (contentType) {
    case 'EditableText':
      return `<EditableText ${common} />`;
    case 'EditableRichtext':
      return `<EditableRichtext ${common} />`;
    case 'EditableCollection': {
      const images = loadVariableFor(field);
      return `<${toPascalCase(fieldName)}Field ${common}${images ? ` images={${images}}` : ''} />`;
    }
    case 'EditableImage':
      return `<EditableImage ${common} image={${fieldName}} rules={imageFieldRegistry['${imageRegistryKey(moduleName, fieldName)}']} />`;
    default:
      throw new Error(`No JSX defined for content type "${contentType}" (plop/codeGen.ts).`);
  }
}

/** Imports a module component needs for a field. */
export function componentImportsFor(field: Field): Import[] {
  switch (field.contentType) {
    case 'EditableText':
      return [[IMPORTS.EditableText, 'EditableText', 'default']];
    case 'EditableRichtext':
      return [[IMPORTS.EditableRichtext, 'EditableRichtext', 'default']];
    case 'EditableCollection':
      return [
        ['./CollectionFields.client', `${toPascalCase(field.fieldName)}Field`, 'named'],
        ...(itemImageFieldNames(field).length > 0 ? [[IMPORTS.loadContentImage, 'loadCollectionImages', 'named'] satisfies Import] : []),
      ];
    case 'EditableImage':
      return [
        [IMPORTS.EditableImage, 'EditableImage', 'default'],
        [IMPORTS.loadContentImage, 'loadContentImage', 'named'],
        [IMPORTS.imageFieldRegistry, 'imageFieldRegistry', 'named'],
      ];
    default:
      return [];
  }
}

/** All names the module component may import for its fields – used to clean up unused imports. */
export const COMPONENT_IMPORT_NAMES = [
  'EditableText',
  'EditableRichtext',
  'EditableImage',
  'loadContentImage',
  'loadCollectionImages',
  'imageFieldRegistry',
];

/** Import declarations as code, one per module, in order of first use (for new files). */
export function importDeclarations(imports: readonly Import[]): string {
  const byModule = new Map<string, { default?: string; named: string[]; type: string[] }>();
  for (const [specifier, name, kind] of imports) {
    const entry = byModule.get(specifier) ?? { named: [], type: [] };
    if (kind === 'default') entry.default = name;
    else if (!entry[kind].includes(name)) entry[kind].push(name);
    byModule.set(specifier, entry);
  }
  const lines: string[] = [];
  for (const [specifier, entry] of byModule) {
    const named = entry.named.length > 0 ? `{ ${entry.named.join(', ')} }` : '';
    if (entry.default || named) {
      lines.push(`import ${[entry.default, named].filter(Boolean).join(', ')} from '${specifier}';`);
    }
    if (entry.type.length > 0) lines.push(`import type { ${entry.type.join(', ')} } from '${specifier}';`);
  }

  return lines.join('\n');
}

// --- CollectionFields.client.tsx --------------------------------------------------------------

/** Imports `CollectionFields.client.tsx` needs for the item fields of a collection field. */
export function collectionImportsFor(field: Field): Import[] {
  const imports: Import[] = [];
  if (hasItemFieldOfType(field, 'EditableRichtext')) imports.push([RICHTEXT_RENDERER_IMPORT, 'RichtextRenderer', 'named']);
  if (itemImageFieldNames(field).length > 0) {
    imports.push(
      [IMPORTS.CollectionImages, 'CollectionImage', 'named'],
      [IMPORTS.imageFieldRegistry, 'imageFieldRegistry', 'named'],
      [IMPORTS.loadContentImage, 'ResolvedImages', 'type'],
    );
  }

  return imports;
}

/** All names `CollectionFields.client.tsx` may import for item fields – used to clean up unused imports. */
export const COLLECTION_IMPORT_NAMES = ['RichtextRenderer', 'CollectionImage', 'imageFieldRegistry', 'ResolvedImages'];

/** Entry of the `<field>ItemFields` descriptor. */
export function itemFieldDef(itemField: ItemField, moduleName: string, collectionFieldName: string): string {
  const base = `name: '${itemField.fieldName}', type: '${itemField.contentType}'`;
  if (itemField.contentType !== 'EditableImage') return `{ ${base} }`;

  return `{ ${base}, rules: imageFieldRegistry['${imageRegistryKey(moduleName, collectionFieldName, itemField.fieldName)}'] }`;
}

/** Markup of an item field in the generated `render<Field>Item` callback. */
export function collectionItemJsx(itemField: ItemField, moduleName: string, collectionFieldName: string): string {
  const value = `item.${itemField.fieldName}`;
  switch (itemField.contentType) {
    case 'EditableText':
      return `<p>{${value}}</p>`;
    case 'EditableRichtext':
      return `<RichtextRenderer doc={${value}} />`;
    case 'EditableImage':
      return `<CollectionImage value={${value}} rules={imageFieldRegistry['${imageRegistryKey(moduleName, collectionFieldName, itemField.fieldName)}']} />`;
    default:
      throw new Error(`No item markup defined for content type "${itemField.contentType}" (plop/codeGen.ts).`);
  }
}
