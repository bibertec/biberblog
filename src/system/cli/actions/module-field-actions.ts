import fs from 'node:fs';
import path from 'node:path';
import type { NodePlopAPI } from 'plop';
import {
  addCollectionFieldWrapper,
  addComponentField,
  addCustomSchemaField,
  addSchemaField,
  removeCollectionFieldWrapper,
  removeComponentField,
  removeSchemaField,
} from '../codemods/module.ts';
import { ensurePlaceholderImage, fieldUsesImages } from '../assets.ts';
import { removeImageFieldRules, setImageFieldRulesFor } from '../codemods/imageFieldRegistry.ts';
import { imageRegistryKey } from '../codeGen.ts';
import { BLUEPRINTS_DIR, CAMEL_CASE_PATTERN } from '../constants.ts';
import { assertModuleExists, moduleFile, readFieldKinds, readJson, updateJson, updateModuleInstances, type FieldKinds } from '../content.ts';
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
