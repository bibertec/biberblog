import fs from 'node:fs';
import path from 'node:path';
import type { NodePlopAPI } from 'plop';
import { MODULES_DIR } from '../constants.ts';

export function registerModuleRemoveCustomFieldGenerator(plop: NodePlopAPI) {
  plop.setGenerator('module:remove-custom-field', {
    description: 'Removes a non-editable (custom) field from a module',
    prompts: async (inquirer) => {
      const availableModules = fs
        .readdirSync(MODULES_DIR)
        .filter((entry) => fs.statSync(path.join(MODULES_DIR, entry)).isDirectory());

      const { moduleName } = await inquirer.prompt([
        {
          type: 'list',
          name: 'moduleName',
          message: 'Which module should a custom field be removed from?',
          choices: availableModules,
        },
      ]);

      const fieldKindsPath = path.join(MODULES_DIR, moduleName, 'fieldKinds.json');
      const fieldKinds = JSON.parse(fs.readFileSync(fieldKindsPath, 'utf-8')) as Record<
        string,
        { kind: 'editable' | 'custom'; type: string }
      >;
      const customFields = Object.keys(fieldKinds).filter((f) => fieldKinds[f].kind === 'custom');

      const { fieldName } = await inquirer.prompt([
        {
          type: 'list',
          name: 'fieldName',
          message: 'Which custom field do you want to remove?',
          choices: customFields,
        },
      ]);

      return { moduleName, fieldName };
    },
    actions: [{ type: 'removeCustomField' }],
  });
}
