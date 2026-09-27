import fs from 'node:fs';
import type { NodePlopAPI } from 'plop';
import { ensurePlaceholderImage, fieldUsesImages } from '../assets.ts';
import { removeImageFieldRules, setImageFieldRulesFor } from '../codemods/imageFieldRegistry.ts';
import { PASCAL_CASE_PATTERN } from '../constants.ts';
import { assertModuleExists, findModuleUsages, moduleDir } from '../content.ts';
import type { ModuleFieldAnswer } from '../types.ts';
import { generate } from '../generate.ts';
import { assertPattern, assertValidFieldDefinition } from '../validation.ts';

export function registerModuleActions(plop: NodePlopAPI) {
  plop.setActionType('validateNewModule', async (answers) => {
    const { moduleName, fields } = answers as { moduleName: string; fields: ModuleFieldAnswer[] };
    assertPattern(moduleName, PASCAL_CASE_PATTERN, `Module name "${moduleName}" must be PascalCase.`);
    if (fs.existsSync(moduleDir(moduleName))) {
      throw new Error(`A module named "${moduleName}" already exists.`);
    }
    if (!Array.isArray(fields) || fields.length === 0) {
      throw new Error('A module needs at least one field.');
    }
    const names = new Set<string>();
    for (const field of fields) {
      assertValidFieldDefinition(field);
      if (names.has(field.fieldName)) throw new Error(`Field "${field.fieldName}" is defined twice.`);
      names.add(field.fieldName);
    }

    return `Module "${moduleName}" is valid`;
  });

  plop.setActionType('registerModule', async (answers) => {
    const { moduleName, fields } = answers as { moduleName: string; fields: ModuleFieldAnswer[] };
    fields.forEach((field) => setImageFieldRulesFor(moduleName, field));
    if (fields.some(fieldUsesImages)) ensurePlaceholderImage();
    generate();

    return `Module "${moduleName}" registered`;
  });

  plop.setActionType('removeModule', async (answers) => {
    const { moduleName } = answers as { moduleName: string };
    assertModuleExists(moduleName);
    const usages = findModuleUsages(moduleName);
    if (usages.length > 0) {
      throw new Error(
        `Module "${moduleName}" is still in use: ${usages.join(', ')}. Please remove it with page:remove-module first.`,
      );
    }
    removeImageFieldRules(moduleName);
    fs.rmSync(moduleDir(moduleName), { recursive: true, force: true });
    generate();

    return `Module "${moduleName}" removed completely`;
  });
}
