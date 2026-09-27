import fs from 'node:fs';
import path from 'node:path';
import type { ActionType, NodePlopAPI } from 'plop';
import { AVAILABLE_CONTENT_TYPES, CAMEL_CASE_PATTERN, PASCAL_CASE_PATTERN, MODULES_DIR, templatePath } from '../constants.ts';
import { promptCollectionItemFields, promptImageDimensions } from '../prompts.ts';
import type { ModuleFieldAnswer } from '../types.ts';

export function registerModuleCreateGenerator(plop: NodePlopAPI) {
  plop.setGenerator('module:create', {
    description: 'Creates a new content module',
    prompts: async (inquirer) => {
      const { moduleName } = await inquirer.prompt([
        {
          type: 'input',
          name: 'moduleName',
          message: 'What should the module be called? (e.g. Hero, Dummy)',
          validate: (input: string) => {
            if (!PASCAL_CASE_PATTERN.test(input)) {
              return 'Module name must be PascalCase (e.g. "Hero", "HeroBanner") — no spaces, special characters or lowercase first letter.';
            }
            if (fs.existsSync(path.join(MODULES_DIR, input))) {
              return `A module named "${input}" already exists.`;
            }

            return true;
          },
        },
      ]);
      const fields: ModuleFieldAnswer[] = [];
      while (true) {
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
            message: 'What should this field be called? (e.g. eyebrow, headline)',
            validate: (input: string) => {
              if (!CAMEL_CASE_PATTERN.test(input)) {
                return 'Field name must be camelCase (e.g. "headline", "eyebrowText") — no spaces, special characters or leading digit.';
              }
              if (fields.some((f) => f.fieldName === input)) {
                return `Field name "${input}" is already used in this module.`;
              }

              return true;
            },
          },
        ]);
        if (contentType === 'EditableCollection') {
          fields.push({ fieldName, contentType, ...(await promptCollectionItemFields(inquirer)) });
        } else if (contentType === 'EditableImage') {
          fields.push({ fieldName, contentType, ...(await promptImageDimensions(inquirer)) });
        } else {
          fields.push({ fieldName, contentType });
        }
        const { action } = await inquirer.prompt([
          {
            type: 'list',
            name: 'action',
            message: 'What would you like to do?',
            choices: ['Add another content type', 'Create'],
          },
        ]);
        if (action === 'Create') break;
      }

      return { moduleName, fields };
    },
    actions: (answers) => {
      const { fields } = answers as { fields: ModuleFieldAnswer[] };
      const hasCollectionField = fields.some((f) => f.contentType === 'EditableCollection');
      const actions: ActionType[] = [
        { type: 'validateNewModule' },
        {
          type: 'add',
          path: 'src/project/components/modules/{{moduleName}}/schema.ts',
          templateFile: templatePath('module/schema.ts.hbs'),
        },
        {
          type: 'add',
          path: 'src/project/components/modules/{{moduleName}}/{{moduleName}}.tsx',
          templateFile: templatePath('module/Component.tsx.hbs'),
        },
      ];
      if (hasCollectionField) {
        actions.push({
          type: 'add',
          path: 'src/project/components/modules/{{moduleName}}/CollectionFields.client.tsx',
          templateFile: templatePath('module/CollectionFields.client.tsx.hbs'),
        });
      }
      actions.push(
        {
          type: 'add',
          path: 'src/project/components/modules/{{moduleName}}/defaultContent.json',
          templateFile: templatePath('module/defaultContent.json.hbs'),
        },
        {
          type: 'add',
          path: 'src/project/components/modules/{{moduleName}}/fieldKinds.json',
          templateFile: templatePath('module/fieldKinds.json.hbs'),
        },
        { type: 'registerModule' },
      );

      return actions;
    },
  });
}
