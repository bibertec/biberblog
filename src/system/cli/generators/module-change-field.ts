import fs from 'node:fs';
import path from 'node:path';
import type { NodePlopAPI } from 'plop';
import { CAMEL_CASE_PATTERN, MODULES_DIR } from '../constants.ts';
import { readCollectionItemFields } from '../codemods/module.ts';
import { readFieldKinds } from '../content.ts';
import { convertibleTypes } from '../fieldConversion.ts';
import { promptCollectionItemFields, promptImageDimensions, type Inquirer } from '../prompts.ts';

export function registerModuleChangeFieldGenerator(plop: NodePlopAPI) {
  plop.setGenerator('module:change-field', {
    description: 'Renames an editable field or changes its type, converting its content on every page',
    prompts: async (inquirer) => {
      const availableModules = fs
        .readdirSync(MODULES_DIR)
        .filter((entry) => fs.statSync(path.join(MODULES_DIR, entry)).isDirectory());
      const { moduleName } = await inquirer.prompt([
        {
          type: 'list',
          name: 'moduleName',
          message: 'Which module has the field?',
          choices: availableModules,
        },
      ]);
      const fieldKinds = readFieldKinds(moduleName);
      const { fieldName } = await inquirer.prompt([
        {
          type: 'list',
          name: 'fieldName',
          message: 'Which field do you want to change?',
          choices: Object.keys(fieldKinds).filter((name) => fieldKinds[name].kind === 'editable'),
        },
      ]);
      const oldType = fieldKinds[fieldName].type;
      const { newFieldName, contentType } = await inquirer.prompt([
        {
          type: 'input',
          name: 'newFieldName',
          message: 'Name of the field (keep it to only change the type)?',
          default: fieldName,
          validate: (input: string) => {
            if (!CAMEL_CASE_PATTERN.test(input)) {
              return 'Field name must be camelCase — no spaces, special characters or leading digit.';
            }
            if (input !== fieldName && input in fieldKinds) {
              return `Field "${input}" already exists in "${moduleName}".`;
            }

            return true;
          },
        },
        {
          type: 'list',
          name: 'contentType',
          message: `Content type (now ${oldType})?`,
          choices: convertibleTypes(oldType),
          default: oldType,
        },
      ]);
      const base = { moduleName, fieldName, newFieldName, contentType };
      if (contentType === oldType) return base;
      if (contentType === 'EditableImage') {
        const dimensions = await promptImageDimensions(inquirer, { offerMobileVariant: true });
        return { ...base, ...dimensions, ...(await promptItemField(inquirer, readCollectionItemFields(moduleName, fieldName), contentType, 'gives')) };
      }
      if (contentType === 'EditableCollection') {
        const collection = await promptCollectionItemFields(inquirer);
        return { ...base, ...collection, ...(await promptItemField(inquirer, collection.itemFields, oldType, 'takes')) };
      }
      if (oldType === 'EditableCollection') {
        return { ...base, ...(await promptItemField(inquirer, readCollectionItemFields(moduleName, fieldName), contentType, 'gives')) };
      }

      return base;
    },
    actions: [{ type: 'changeEditableField' }],
  });
}

/** The item field of a collection that takes the old value (→ collection) or gives the new one (collection →). */
async function promptItemField(
  inquirer: Inquirer,
  itemFields: { fieldName: string; contentType: string }[],
  contentType: string,
  role: 'takes' | 'gives',
): Promise<{ itemField: string }> {
  const candidates = itemFields.filter((itemField) => itemField.contentType === contentType).map((itemField) => itemField.fieldName);
  if (candidates.length === 0) {
    throw new Error(`The collection needs an item field of type "${contentType}" that ${role} the value.`);
  }

  return inquirer.prompt([
    {
      type: 'list',
      name: 'itemField',
      message: role === 'takes' ? 'Which item field takes the current value?' : 'Which item field (of the first item) gives the new value?',
      choices: candidates,
    },
  ]);
}
