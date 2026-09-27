import fs from 'node:fs';
import path from 'node:path';
import type { NodePlopAPI } from 'plop';
import { AVAILABLE_CONTENT_TYPES, CAMEL_CASE_PATTERN, MODULES_DIR } from '../constants.ts';
import { promptCollectionItemFields, promptImageDimensions } from '../prompts.ts';

export function registerModuleAddEditableFieldGenerator(plop: NodePlopAPI) {
  plop.setGenerator('module:add-editable-field', {
    description: 'Adds an editable field to an existing module',
    prompts: async (inquirer) => {
      const availableModules = fs
        .readdirSync(MODULES_DIR)
        .filter((entry) => fs.statSync(path.join(MODULES_DIR, entry)).isDirectory());
      const { moduleName } = await inquirer.prompt([
        {
          type: 'list',
          name: 'moduleName',
          message: 'Which module should an editable field be added to?',
          choices: availableModules,
        },
      ]);
      const defaultContentPath = path.join(MODULES_DIR, moduleName, 'defaultContent.json');
      const existingFields = Object.keys(JSON.parse(fs.readFileSync(defaultContentPath, 'utf-8')));
      const { contentType } = await inquirer.prompt([
        {
          type: 'list',
          name: 'contentType',
          message: 'Which content type do you want to add?',
          choices: [...AVAILABLE_CONTENT_TYPES],
        },
      ]);
      const { fieldName } = await inquirer.prompt([
        {
          type: 'input',
          name: 'fieldName',
          message: 'What should the new field be called?',
          validate: (input: string) => {
            if (!CAMEL_CASE_PATTERN.test(input)) {
              return 'Field name must be camelCase — no spaces, special characters or leading digit.';
            }
            if (existingFields.includes(input)) {
              return `Field "${input}" already exists in "${moduleName}".`;
            }

            return true;
          },
        },
      ]);
      if (contentType === 'EditableImage') {
        return { moduleName, contentType, fieldName, ...(await promptImageDimensions(inquirer)) };
      }
      if (contentType === 'EditableCollection') {
        return { moduleName, contentType, fieldName, ...(await promptCollectionItemFields(inquirer)) };
      }

      return { moduleName, contentType, fieldName };
    },
    actions: [{ type: 'addEditableField' }],
  });
}
