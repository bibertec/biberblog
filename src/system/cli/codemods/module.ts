import fs from 'node:fs';
import { Node, SyntaxKind, type SourceFile } from 'ts-morph';
import type { NodePlopAPI } from 'plop';
import {
  editSourceFile,
  ensureDefaultImport,
  ensureNamedImport,
  findJsxElementsByAttribute,
  getFunction,
  getObjectLiteral,
  getReturnedJsxElement,
  hasProperty,
  insertJsxChild,
  readSourceFile,
  removeDeclarations,
  removeImportIfUnused,
  removeNodeWithLine,
  removeProperty,
  renameIdentifiers,
  renameProperty,
  replaceRanges,
  setProperty,
} from '../ast.ts';
import {
  COLLECTION_IMPORT_NAMES,
  COMPONENT_IMPORT_NAMES,
  SCHEMA_IMPORTS,
  imageRegistryKey,
  collectionImportsFor,
  componentFieldJsx,
  componentImportsFor,
  loadStatementFor,
  loadVariableFor,
  schemaImportsFor,
  zodSchemaFor,
  type Import,
} from '../codeGen.ts';
import {
  COLLECTION_FIELDS_FILE_TEMPLATE,
  COLLECTION_FIELD_WRAPPER_TEMPLATE,
  COLLECTION_ITEM_SCHEMA_TEMPLATE,
} from '../constants.ts';
import { moduleFile } from '../content.ts';
import { renderTemplateFile } from '../helpers.ts';
import { lowerFirst, toPascalCase } from '../names.ts';
import type { ItemFieldAnswer } from '../types.ts';

type EditableField = { fieldName: string; contentType: string; itemFields?: ItemFieldAnswer[]; titleField?: string };

function ensureImports(sourceFile: SourceFile, imports: readonly Import[]): void {
  for (const [specifier, name, kind] of imports) {
    if (kind === 'default') ensureDefaultImport(sourceFile, specifier, name);
    else ensureNamedImport(sourceFile, specifier, name, { typeOnly: kind === 'type' });
  }
}

const schemaVariable = (moduleName: string) => `${lowerFirst(moduleName)}Schema`;

// --- schema.ts --------------------------------------------------------------------------------

export function addSchemaField(plop: NodePlopAPI, moduleName: string, field: EditableField): void {
  editSourceFile(moduleFile(moduleName, 'schema.ts'), (sourceFile) => {
    schemaImportsFor(field).forEach((name) => ensureNamedImport(sourceFile, SCHEMA_IMPORTS[name], name));
    if (field.contentType === 'EditableCollection' && !sourceFile.getVariableStatement(`${field.fieldName}ItemSchema`)) {
      const schemaStatement = sourceFile.getVariableStatementOrThrow(schemaVariable(moduleName));
      sourceFile.insertStatements(
        schemaStatement.getChildIndex(),
        renderTemplateFile(plop, COLLECTION_ITEM_SCHEMA_TEMPLATE, { moduleName, fieldName: field.fieldName, itemFields: field.itemFields ?? [] }),
      );
    }
    setProperty(getObjectLiteral(sourceFile, schemaVariable(moduleName)), field.fieldName, zodSchemaFor(field));
  });
}

export function addCustomSchemaField(moduleName: string, fieldName: string, zodExpression: string): void {
  editSourceFile(moduleFile(moduleName, 'schema.ts'), (sourceFile) => {
    setProperty(getObjectLiteral(sourceFile, schemaVariable(moduleName)), fieldName, zodExpression);
  });
}

export function removeSchemaField(moduleName: string, fieldName: string, contentType: string): void {
  editSourceFile(moduleFile(moduleName, 'schema.ts'), (sourceFile) => {
    removeProperty(getObjectLiteral(sourceFile, schemaVariable(moduleName)), fieldName);
    if (contentType === 'EditableCollection') {
      const pascal = toPascalCase(fieldName);
      removeDeclarations(sourceFile, [`${fieldName}ItemSchema`, `${pascal}Item`, `create${pascal}Item`]);
    }
    Object.keys(SCHEMA_IMPORTS).forEach((name) => removeImportIfUnused(sourceFile, name));
  });
}

export function schemaHasField(moduleName: string, fieldName: string): boolean {
  let result = false;
  editSourceFile(moduleFile(moduleName, 'schema.ts'), (sourceFile) => {
    result = hasProperty(getObjectLiteral(sourceFile, schemaVariable(moduleName)), fieldName);
  });

  return result;
}

// --- <Module>.tsx -----------------------------------------------------------------------------

const fieldIdMatcher = (fieldName: string) => (initializerText: string) =>
  new RegExp(`\\.${fieldName}\`\\s*}$`).test(initializerText.trim());

/**
 * `placement`: placement comment the new field is inserted before (default `PLOP_INJECT_FIELD`);
 * `attributes`: extra JSX attributes, e.g. the `className` of a field it replaces.
 */
export function addComponentField(
  moduleName: string,
  field: EditableField,
  { placement = 'PLOP_INJECT_FIELD', attributes }: { placement?: string; attributes?: string } = {},
): void {
  editSourceFile(moduleFile(moduleName, `${moduleName}.tsx`), (sourceFile) => {
    ensureImports(sourceFile, componentImportsFor(field));
    const component = getFunction(sourceFile, moduleName);
    const loadVariable = loadVariableFor(field);
    if (loadVariable && !component.getVariableStatement(loadVariable)) {
      // Images are resolved before the JSX, which makes the component async.
      component.setIsAsync(true);
      const returnIndex = component.getStatements().findIndex((statement) => Node.isReturnStatement(statement));
      component.insertStatements(Math.max(returnIndex, 0), loadStatementFor(field));
    }
    const root = getReturnedJsxElement(component);
    if (findJsxElementsByAttribute(root, 'fieldId', fieldIdMatcher(field.fieldName)).length === 0) {
      const jsx = componentFieldJsx(field, moduleName);
      insertJsxChild(root, attributes ? jsx.replace(/^<([\w.]+)/, `<$1 ${attributes}`) : jsx, placement);
    }
  });
}

export function removeComponentField(moduleName: string, fieldName: string): void {
  editSourceFile(moduleFile(moduleName, `${moduleName}.tsx`), (sourceFile) => {
    // Raw text removal invalidates nodes, so the elements are looked up again after every removal.
    for (;;) {
      const [element] = findJsxElementsByAttribute(getFunction(sourceFile, moduleName), 'fieldId', fieldIdMatcher(fieldName));
      if (!element) break;
      removeNodeWithLine(element);
    }
    const component = getFunction(sourceFile, moduleName);
    // Image variables: `<field>` (image field) or `<field>Images` (collection with image items).
    [fieldName, `${fieldName}Images`].forEach((variable) => component.getVariableStatement(variable)?.remove());
    if (component.isAsync() && component.getDescendantsOfKind(SyntaxKind.AwaitExpression).length === 0) {
      component.setIsAsync(false);
    }
    [...COMPONENT_IMPORT_NAMES, `${toPascalCase(fieldName)}Field`].forEach((name) => removeImportIfUnused(sourceFile, name));
  });
}

// --- CollectionFields.client.tsx --------------------------------------------------------------

const COLLECTION_FILE = 'CollectionFields.client.tsx';

export function addCollectionFieldWrapper(plop: NodePlopAPI, moduleName: string, field: EditableField): void {
  const filePath = moduleFile(moduleName, COLLECTION_FILE);
  if (!fs.existsSync(filePath)) {
    // Same template as `module:create`, just without fields – yields the base imports.
    fs.writeFileSync(filePath, `${renderTemplateFile(plop, COLLECTION_FIELDS_FILE_TEMPLATE, { fields: [] })}\n`);
  }
  const pascal = toPascalCase(field.fieldName);
  editSourceFile(filePath, (sourceFile) => {
    ensureNamedImport(sourceFile, './schema', `${pascal}Item`, { typeOnly: true });
    ensureNamedImport(sourceFile, './schema', `create${pascal}Item`);
    ensureImports(sourceFile, collectionImportsFor(field));
    if (!sourceFile.getFunction(`${pascal}Field`)) {
      sourceFile.addStatements(
        renderTemplateFile(plop, COLLECTION_FIELD_WRAPPER_TEMPLATE, {
          moduleName,
          fieldName: field.fieldName,
          itemFields: field.itemFields ?? [],
          titleField: field.titleField ?? '',
        }),
      );
    }
  });
}

/** Removes the wrapper of a collection field. Returns `true` if the file was deleted (last collection). */
export function removeCollectionFieldWrapper(moduleName: string, fieldName: string): boolean {
  const filePath = moduleFile(moduleName, COLLECTION_FILE);
  if (!fs.existsSync(filePath)) return false;
  const pascal = toPascalCase(fieldName);
  let isEmpty = false;
  editSourceFile(filePath, (sourceFile: SourceFile) => {
    removeDeclarations(sourceFile, [`${fieldName}ItemFields`, `render${pascal}Item`, `${pascal}Field`]);
    [`${pascal}Item`, `create${pascal}Item`, ...COLLECTION_IMPORT_NAMES].forEach((name) => removeImportIfUnused(sourceFile, name));
    isEmpty = sourceFile.getFunctions().every((fn) => !fn.isExported());
  });
  if (isEmpty) fs.unlinkSync(filePath);

  return isEmpty;
}

// --- Changing a field (module:change-field) ---------------------------------------------------

/** Names derived from a collection field in `schema.ts` and `CollectionFields.client.tsx`. */
const collectionNames = (fieldName: string) => {
  const pascal = toPascalCase(fieldName);
  return [`${fieldName}ItemSchema`, `${pascal}Item`, `create${pascal}Item`, `${fieldName}ItemFields`, `render${pascal}Item`, `${pascal}Field`];
};

/** Renames the registry keys `'<Module>.<field>'` and `'<Module>.<field>.<itemField>'` used in the file. */
function renameRegistryKeysIn(sourceFile: SourceFile, oldPrefix: string, newPrefix: string): void {
  const ranges = sourceFile
    .getDescendantsOfKind(SyntaxKind.StringLiteral)
    .filter((literal) => literal.getLiteralText() === oldPrefix || literal.getLiteralText().startsWith(`${oldPrefix}.`))
    .map((literal) => {
      const quote = literal.getText()[0];
      return [literal.getStart(), literal.getEnd(), `${quote}${newPrefix}${literal.getLiteralText().slice(oldPrefix.length)}${quote}`] as [number, number, string];
    });
  replaceRanges(sourceFile, ranges);
}

function renameCollectionNames(sourceFile: SourceFile, fieldName: string, newFieldName: string): void {
  const newNames = collectionNames(newFieldName);
  collectionNames(fieldName).forEach((name, index) => renameIdentifiers(sourceFile, name, newNames[index]));
}

export function renameSchemaField(moduleName: string, fieldName: string, newFieldName: string, contentType: string): void {
  editSourceFile(moduleFile(moduleName, 'schema.ts'), (sourceFile) => {
    renameProperty(getObjectLiteral(sourceFile, schemaVariable(moduleName)), fieldName, newFieldName);
    if (contentType === 'EditableCollection') renameCollectionNames(sourceFile, fieldName, newFieldName);
  });
}

/** Changes the type of a schema field in place (and its name, if `field.fieldName` differs). */
export function replaceSchemaField(plop: NodePlopAPI, moduleName: string, fieldName: string, contentType: string, field: EditableField): void {
  editSourceFile(moduleFile(moduleName, 'schema.ts'), (sourceFile) => {
    renameProperty(getObjectLiteral(sourceFile, schemaVariable(moduleName)), fieldName, field.fieldName);
    if (contentType === 'EditableCollection') {
      const pascal = toPascalCase(fieldName);
      removeDeclarations(sourceFile, [`${fieldName}ItemSchema`, `${pascal}Item`, `create${pascal}Item`]);
    }
  });
  addSchemaField(plop, moduleName, field);
  editSourceFile(moduleFile(moduleName, 'schema.ts'), (sourceFile) => {
    Object.keys(SCHEMA_IMPORTS).forEach((name) => removeImportIfUnused(sourceFile, name));
  });
}

/** `content.<field>` anywhere in the file, `fieldId={`${id}.<field>`}`, the image variables and the registry keys. */
export function renameComponentField(moduleName: string, fieldName: string, newFieldName: string, contentType: string): void {
  editSourceFile(moduleFile(moduleName, `${moduleName}.tsx`), (sourceFile) => {
    const fieldIds = findJsxElementsByAttribute(getFunction(sourceFile, moduleName), 'fieldId', fieldIdMatcher(fieldName)).flatMap((element) => {
      const opening = Node.isJsxElement(element) ? element.getOpeningElement() : element;
      const attribute = Node.isJsxSelfClosingElement(opening) || Node.isJsxOpeningElement(opening) ? opening.getAttribute('fieldId') : undefined;
      const initializer = attribute && Node.isJsxAttribute(attribute) ? attribute.getInitializer() : undefined;
      if (!initializer) return [];
      const text = initializer.getText().replace(new RegExp(`\\.${fieldName}\`(\\s*})$`), `.${newFieldName}\`$1`);
      return [[initializer.getStart(), initializer.getEnd(), text] as [number, number, string]];
    });
    const contentAccesses = sourceFile
      .getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)
      .filter((access) => access.getExpression().getText() === 'content' && access.getName() === fieldName)
      .map((access) => [access.getNameNode().getStart(), access.getNameNode().getEnd(), newFieldName] as [number, number, string]);
    replaceRanges(sourceFile, [...fieldIds, ...contentAccesses]);

    const component = getFunction(sourceFile, moduleName);
    if (contentType === 'EditableImage' && component.getVariableStatement(fieldName)) {
      renameIdentifiers(component, fieldName, newFieldName);
    }
    if (contentType === 'EditableCollection') {
      renameIdentifiers(getFunction(sourceFile, moduleName), `${fieldName}Images`, `${newFieldName}Images`);
      renameIdentifiers(sourceFile, `${toPascalCase(fieldName)}Field`, `${toPascalCase(newFieldName)}Field`);
    }
    renameRegistryKeysIn(sourceFile, imageRegistryKey(moduleName, fieldName), imageRegistryKey(moduleName, newFieldName));
  });
}

const CHANGE_MARKER = 'PLOP_CHANGE_FIELD';

/**
 * Replaces the markup of a field with the one of `field` (new type, maybe new name) at the same
 * place, keeping a `className`. Without markup of the old field, the new one is added like a new field.
 */
export function replaceComponentField(moduleName: string, fieldName: string, field: EditableField): void {
  const componentPath = moduleFile(moduleName, `${moduleName}.tsx`);
  let attributes: string | undefined;
  let marked = false;
  editSourceFile(componentPath, (sourceFile) => {
    const [first] = findJsxElementsByAttribute(getFunction(sourceFile, moduleName), 'fieldId', fieldIdMatcher(fieldName));
    if (!first) return;
    const opening = Node.isJsxElement(first) ? first.getOpeningElement() : first;
    const className = Node.isJsxSelfClosingElement(opening) || Node.isJsxOpeningElement(opening) ? opening.getAttribute('className') : undefined;
    attributes = className?.getText();
    first.replaceWithText(`{/* ${CHANGE_MARKER} */}`);
    marked = true;
  });
  removeComponentField(moduleName, fieldName);
  addComponentField(moduleName, field, marked ? { placement: CHANGE_MARKER, attributes } : {});
  if (!marked) return;
  editSourceFile(componentPath, (sourceFile) => {
    const marker = sourceFile
      .getDescendantsOfKind(SyntaxKind.JsxExpression)
      .find((expression) => expression.getExpression() === undefined && expression.getText().includes(CHANGE_MARKER));
    if (marker) removeNodeWithLine(marker);
  });
}

export function renameCollectionFieldWrapper(moduleName: string, fieldName: string, newFieldName: string): void {
  editSourceFile(moduleFile(moduleName, COLLECTION_FILE), (sourceFile) => {
    renameCollectionNames(sourceFile, fieldName, newFieldName);
    renameRegistryKeysIn(sourceFile, imageRegistryKey(moduleName, fieldName), imageRegistryKey(moduleName, newFieldName));
  });
}

/** Item fields of a collection field, read from its `<field>ItemFields` descriptor (`{ name, type }` entries). */
export function readCollectionItemFields(moduleName: string, fieldName: string): ItemFieldAnswer[] {
  const sourceFile = readSourceFile(moduleFile(moduleName, COLLECTION_FILE));
  const initializer = sourceFile.getVariableDeclaration(`${fieldName}ItemFields`)?.getInitializer();
  if (!initializer || !Node.isArrayLiteralExpression(initializer)) {
    throw new Error(`${sourceFile.getFilePath()}: "${fieldName}ItemFields" not found or not an array (see src/system/docs/plop.md)`);
  }

  return initializer.getElements().flatMap((element) => {
    if (!Node.isObjectLiteralExpression(element)) return [];
    const stringValue = (name: string) => {
      const property = element.getProperty(name);
      const value = property && Node.isPropertyAssignment(property) ? property.getInitializer() : undefined;
      return value && Node.isStringLiteral(value) ? value.getLiteralText() : undefined;
    };
    const [itemFieldName, contentType] = [stringValue('name'), stringValue('type')];
    return itemFieldName && contentType ? [{ fieldName: itemFieldName, contentType }] : [];
  });
}
