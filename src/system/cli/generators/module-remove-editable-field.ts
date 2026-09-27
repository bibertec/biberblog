import fs from 'node:fs';
import path from 'node:path';
import type { NodePlopAPI } from 'plop';
import { MODULES_DIR } from '../constants.ts';

export function registerModuleRemoveEditableFieldGenerator(plop: NodePlopAPI) {
  plop.setGenerator('module:remove-editable-field', {
    description: 'Removes an editable field from a module',
    prompts: async (inquirer) => {
      const availableModules = fs
        .readdirSync(MODULES_DIR)
        .filter((entry) => fs.statSync(path.join(MODULES_DIR, entry)).isDirectory());
      const { moduleName } = await inquirer.prompt([
        {
          type: 'list',
          name: 'moduleName',
          message: 'Which module should a field be removed from?',
          choices: availableModules,
        },
      ]);
      const fieldKindsPath = path.join(MODULES_DIR, moduleName, 'fieldKinds.json');
      const fieldKinds = JSON.parse(fs.readFileSync(fieldKindsPath, 'utf-8')) as Record<
        string,
        {
          kind: 'editable' | 'custom';
          type: string;
        }
      >;
      const editableFields = Object.keys(fieldKinds).filter(
        (f) => fieldKinds[f].kind === 'editable',
      );
      const { fieldName } = await inquirer.prompt([
        {
          type: 'list',
          name: 'fieldName',
          message: 'Which field do you want to remove?',
          choices: editableFields,
        },
      ]);

      return { moduleName, fieldName, contentType: fieldKinds[fieldName].type };
    },
    actions: [{ type: 'removeEditableField' }],
  });
}
