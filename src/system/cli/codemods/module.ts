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
  removeDeclarations,
  removeImportIfUnused,
  removeNodeWithLine,
  removeProperty,
  setProperty,
} from '../ast.ts';
import {
  COLLECTION_IMPORT_NAMES,
  COMPONENT_IMPORT_NAMES,
  SCHEMA_IMPORTS,
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

export function addComponentField(moduleName: string, field: EditableField): void {
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
      insertJsxChild(root, componentFieldJsx(field, moduleName), 'PLOP_INJECT_FIELD');
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
