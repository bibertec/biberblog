import fs from 'node:fs';
import path from 'node:path';
import type { NodePlopAPI } from 'plop';
import { CAMEL_CASE_PATTERN, MODULES_DIR } from '../constants.ts';

export function registerModuleAddCustomFieldGenerator(plop: NodePlopAPI) {
  plop.setGenerator('module:add-custom-field', {
    description: 'Adds a non-editable field to an existing module',
    prompts: async (inquirer) => {
      const availableModules = fs
        .readdirSync(MODULES_DIR)
        .filter((entry) => fs.statSync(path.join(MODULES_DIR, entry)).isDirectory());
      const { moduleName } = await inquirer.prompt([
        {
          type: 'list',
          name: 'moduleName',
          message: 'Which module should a non-editable field be added to?',
          choices: availableModules,
        },
      ]);
      const blueprintsDir = path.join(process.cwd(), 'src/project/content/blueprints');
      const availableBlueprints = fs
        .readdirSync(blueprintsDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace(/\.json$/, ''));
      const { blueprintName } = await inquirer.prompt([
        {
          type: 'list',
          name: 'blueprintName',
          message: 'Which blueprint should be applied?',
          choices: availableBlueprints,
        },
      ]);
      const defaultContentPath = path.join(MODULES_DIR, moduleName, 'defaultContent.json');
      const existingFields = Object.keys(JSON.parse(fs.readFileSync(defaultContentPath, 'utf-8')));
      const { fieldName } = await inquirer.prompt([
        {
          type: 'input',
          name: 'fieldName',
          message: 'What should the new field be called?',
          validate: (input: string) => {
            if (!CAMEL_CASE_PATTERN.test(input)) {
              return 'Field name must be camelCase.';
            }
            if (existingFields.includes(input)) {
              return `Field "${input}" already exists in "${moduleName}".`;
            }

            return true;
          },
        },
      ]);

      return { moduleName, fieldName, blueprintName };
    },
    actions: [{ type: 'addCustomField' }],
  });
}
