import fs from 'node:fs';
import path from 'node:path';
import type { NodePlopAPI } from 'plop';
import {
  addCollectionFieldWrapper,
  addComponentField,
  addCustomSchemaField,
  addSchemaField,
  readCollectionItemFields,
  removeCollectionFieldWrapper,
  removeComponentField,
  removeSchemaField,
  renameCollectionFieldWrapper,
  renameComponentField,
  renameSchemaField,
  replaceComponentField,
  replaceSchemaField,
} from '../codemods/module.ts';
import { ensurePlaceholderImage, fieldUsesImages } from '../assets.ts';
import { removeImageFieldRules, renameImageFieldRules, setImageFieldRulesFor } from '../codemods/imageFieldRegistry.ts';
import { imageRegistryKey } from '../codeGen.ts';
import { BLUEPRINTS_DIR, CAMEL_CASE_PATTERN } from '../constants.ts';
import {
  assertModuleExists,
  moduleFile,
  readFieldKinds,
  readJson,
  renameKey,
  updateJson,
  updateModuleInstances,
  type FieldKinds,
} from '../content.ts';
import { assertConvertible, convertFieldValue, type ConversionField } from '../fieldConversion.ts';
import { defaultValueForContentType, zodExpressionFor } from '../helpers.ts';
import { assertPattern, assertValidFieldDefinition, type FieldDefinition } from '../validation.ts';

type Blueprint = { zodType: string; defaultValue: unknown };

function assertFieldIsNew(moduleName: string, fieldName: string): void {
  if (fieldName in readFieldKinds(moduleName)) {
    throw new Error(`Field "${fieldName}" already exists in "${moduleName}".`);
  }
}

function getFieldKind(moduleName: string, fieldName: string, kind: 'editable' | 'custom') {
  const fieldKind = readFieldKinds(moduleName)[fieldName];
  if (!fieldKind || fieldKind.kind !== kind) {
    throw new Error(`"${moduleName}" has no ${kind} field "${fieldName}".`);
  }

  return fieldKind;
}

/** Adds or removes a field in defaultContent.json, fieldKinds.json and all module instances. */
function setFieldData(moduleName: string, fieldName: string, value: unknown, kind: FieldKinds[string]): string[] {
  updateJson<Record<string, unknown>>(moduleFile(moduleName, 'defaultContent.json'), (defaults) => {
    defaults[fieldName] = value;
  });
  updateJson<FieldKinds>(moduleFile(moduleName, 'fieldKinds.json'), (kinds) => {
    kinds[fieldName] = kind;
  });

  return updateModuleInstances(moduleName, (content) => {
    content[fieldName] = value;
  });
}

function deleteFieldData(moduleName: string, fieldName: string): string[] {
  updateJson<Record<string, unknown>>(moduleFile(moduleName, 'defaultContent.json'), (defaults) => {
    delete defaults[fieldName];
  });
  updateJson<FieldKinds>(moduleFile(moduleName, 'fieldKinds.json'), (kinds) => {
    delete kinds[fieldName];
  });

  return updateModuleInstances(moduleName, (content) => {
    delete content[fieldName];
  });
}

const pagesNote = (pages: string[]) => `${pages.length} page(s)${pages.length > 0 ? ` (${pages.join(', ')})` : ''}`;

export function registerModuleFieldActions(plop: NodePlopAPI) {
  plop.setActionType('addEditableField', async (answers) => {
    const { moduleName, ...field } = answers as FieldDefinition & { moduleName: string };
    assertModuleExists(moduleName);
    assertValidFieldDefinition(field);
    assertFieldIsNew(moduleName, field.fieldName);

    addSchemaField(plop, moduleName, field);
    if (field.contentType === 'EditableCollection') {
      addCollectionFieldWrapper(plop, moduleName, field);
    }
    addComponentField(moduleName, field);
    setImageFieldRulesFor(moduleName, field);
    if (fieldUsesImages(field)) ensurePlaceholderImage();
    const pages = setFieldData(moduleName, field.fieldName, defaultValueForContentType(field.contentType, field.itemFields), {
      kind: 'editable',
      type: field.contentType,
    });

    return `Field "${field.fieldName}" added to "${moduleName}" and ${pagesNote(pages)}`;
  });

  plop.setActionType('removeEditableField', async (answers) => {
    const { moduleName, fieldName } = answers as { moduleName: string; fieldName: string };
    assertModuleExists(moduleName);
    const { type: contentType } = getFieldKind(moduleName, fieldName, 'editable');

    removeComponentField(moduleName, fieldName);
    const collectionFileRemoved =
      contentType === 'EditableCollection' && removeCollectionFieldWrapper(moduleName, fieldName);
    removeSchemaField(moduleName, fieldName, contentType);
    if (contentType === 'EditableImage' || contentType === 'EditableCollection') {
      removeImageFieldRules(imageRegistryKey(moduleName, fieldName));
    }
    const pages = deleteFieldData(moduleName, fieldName);

    return `Field "${fieldName}" removed from "${moduleName}" and ${pagesNote(pages)}${collectionFileRemoved ? ' (CollectionFields.client.tsx removed)' : ''}`;
  });

  plop.setActionType('changeEditableField', async (answers) => {
    const { moduleName, fieldName, newFieldName = fieldName, contentType, itemField, ...typeAnswers } = answers as Partial<FieldDefinition> & {
      moduleName: string;
      fieldName: string;
      newFieldName?: string;
      itemField?: string;
    };
    assertModuleExists(moduleName);
    const { type: oldType } = getFieldKind(moduleName, fieldName, 'editable');
    const newType = contentType ?? oldType;
    if (newFieldName !== fieldName) {
      assertPattern(newFieldName, CAMEL_CASE_PATTERN, `Field name "${newFieldName}" must be camelCase.`);
      assertFieldIsNew(moduleName, newFieldName);
    }
    const typeChanged = newType !== oldType;
    if (!typeChanged) {
      if (newFieldName === fieldName) throw new Error(`Nothing to change: "${fieldName}" already is ${oldType}.`);
      if (Object.values(typeAnswers).some((value) => value !== undefined) || itemField !== undefined) {
        throw new Error('Item fields and image sizes cannot be changed without a type change – see src/system/docs/cli.md, "Change a field".');
      }
    }
    const field = { ...typeAnswers, fieldName: newFieldName, contentType: newType };
    const from: ConversionField = { contentType: oldType, itemField };
    const to: ConversionField = { contentType: newType, itemFields: field.itemFields, itemField };
    if (typeChanged) {
      assertValidFieldDefinition(field);
      if (oldType === 'EditableCollection') from.itemFields = readCollectionItemFields(moduleName, fieldName);
      assertConvertible(from, to);
    }

    if (typeChanged) {
      replaceComponentField(moduleName, fieldName, field);
      if (oldType === 'EditableCollection') removeCollectionFieldWrapper(moduleName, fieldName);
      if (newType === 'EditableCollection') addCollectionFieldWrapper(plop, moduleName, field);
      replaceSchemaField(plop, moduleName, fieldName, oldType, field);
      removeImageFieldRules(imageRegistryKey(moduleName, fieldName));
      setImageFieldRulesFor(moduleName, field);
      if (fieldUsesImages(field)) ensurePlaceholderImage();
    } else {
      renameComponentField(moduleName, fieldName, newFieldName, oldType);
      if (oldType === 'EditableCollection') renameCollectionFieldWrapper(moduleName, fieldName, newFieldName);
      renameSchemaField(moduleName, fieldName, newFieldName, oldType);
      renameImageFieldRules(imageRegistryKey(moduleName, fieldName), imageRegistryKey(moduleName, newFieldName));
    }

    updateJson<Record<string, unknown>>(moduleFile(moduleName, 'defaultContent.json'), (defaults) => {
      const value = typeChanged ? defaultValueForContentType(newType, field.itemFields) : defaults[fieldName];
      renameKey(defaults, fieldName, newFieldName, value);
    });
    updateJson<FieldKinds>(moduleFile(moduleName, 'fieldKinds.json'), (kinds) => {
      renameKey(kinds, fieldName, newFieldName, { kind: 'editable', type: newType });
    });
    let lossy = 0;
    const pages = updateModuleInstances(moduleName, (content) => {
      if (!(fieldName in content)) return;
      const converted = convertFieldValue(from, to, content[fieldName]);
      if (converted.lossy) lossy += 1;
      renameKey(content, fieldName, newFieldName, converted.value);
    });

    const changes = [typeChanged && `${oldType} → ${newType}`, newFieldName !== fieldName && `renamed to "${newFieldName}"`].filter(Boolean);
    const lossyNote = lossy > 0 ? `; content dropped in ${lossy} instance(s) (formatting, further items, other item fields or the mobile image) – check the diff` : '';

    return `Field "${fieldName}" of "${moduleName}" changed (${changes.join(', ')}) on ${pagesNote(pages)}${lossyNote}`;
  });

  plop.setActionType('addCustomField', async (answers) => {
    const { moduleName, fieldName, blueprintName } = answers as { moduleName: string; fieldName: string; blueprintName: string };
    assertModuleExists(moduleName);
    assertPattern(fieldName, CAMEL_CASE_PATTERN, `Field name "${fieldName}" must be camelCase.`);
    assertFieldIsNew(moduleName, fieldName);
    const blueprintPath = path.join(BLUEPRINTS_DIR, `${blueprintName}.json`);
    if (!fs.existsSync(blueprintPath)) {
      throw new Error(`Blueprint "${blueprintName}" does not exist (${blueprintPath}).`);
    }
    const blueprint = readJson<Blueprint>(blueprintPath);

    addCustomSchemaField(moduleName, fieldName, zodExpressionFor(blueprint.zodType));
    const pages = setFieldData(moduleName, fieldName, blueprint.defaultValue, { kind: 'custom', type: blueprintName });

    return `Custom field "${fieldName}" added to "${moduleName}" and ${pagesNote(pages)}`;
  });

  plop.setActionType('removeCustomField', async (answers) => {
    const { moduleName, fieldName } = answers as { moduleName: string; fieldName: string };
    assertModuleExists(moduleName);
    getFieldKind(moduleName, fieldName, 'custom');

    removeSchemaField(moduleName, fieldName, 'custom');
    const pages = deleteFieldData(moduleName, fieldName);

    return `Custom field "${fieldName}" removed from "${moduleName}" and ${pagesNote(pages)}`;
  });
}
