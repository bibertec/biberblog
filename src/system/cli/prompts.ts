import type { PlopGeneratorConfig } from 'plop';
import { AVAILABLE_ITEM_CONTENT_TYPES, CAMEL_CASE_PATTERN } from './constants.ts';
import type { ItemFieldAnswer } from './types.ts';

/** Interactive prompt steps shared by `module:create` and `module:add-editable-field`. */

type Inquirer = Parameters<Extract<PlopGeneratorConfig['prompts'], (...args: never[]) => unknown>>[0];

const positiveInteger = (input: number | undefined) =>
  (typeof input === 'number' && Number.isInteger(input) && input > 0) || 'Please enter a positive integer.';

export async function promptImageDimensions(
  inquirer: Inquirer,
): Promise<{ imageWidth: number; imageHeight: number }> {
  return inquirer.prompt([
    {
      type: 'number',
      name: 'imageWidth',
      message: 'Target width in pixels (fixed by the developer, not editable by editors)?',
      validate: positiveInteger,
    },
    {
      type: 'number',
      name: 'imageHeight',
      message: 'Target height in pixels (fixed by the developer, not editable by editors)?',
      validate: positiveInteger,
    },
  ]);
}

/** Item fields of a new collection plus the item field shown as title in the editor's item list. */
export async function promptCollectionItemFields(
  inquirer: Inquirer,
): Promise<{ itemFields: ItemFieldAnswer[]; titleField: string }> {
  const itemFields: ItemFieldAnswer[] = [];
  while (true) {
    const { itemContentType } = await inquirer.prompt([
      {
        type: 'list',
        name: 'itemContentType',
        message: 'Which content type should this item field have?',
        choices: [...AVAILABLE_ITEM_CONTENT_TYPES],
      },
    ]);
    const { itemFieldName } = await inquirer.prompt([
      {
        type: 'input',
        name: 'itemFieldName',
        message: 'What should this item field be called? (e.g. name, bio, photo)',
        validate: (input: string) => {
          if (!CAMEL_CASE_PATTERN.test(input)) {
            return 'Field name must be camelCase — no spaces, special characters or leading digit.';
          }
          if (input === 'id') {
            return '"id" is reserved (assigned automatically to every item).';
          }
          if (itemFields.some((f) => f.fieldName === input)) {
            return `Field name "${input}" is already used in this item.`;
          }

          return true;
        },
      },
    ]);
    const dimensions = itemContentType === 'EditableImage' ? await promptImageDimensions(inquirer) : {};
    itemFields.push({ fieldName: itemFieldName, contentType: itemContentType, ...dimensions });
    const { itemAction } = await inquirer.prompt([
      {
        type: 'list',
        name: 'itemAction',
        message: 'What would you like to do?',
        choices: ['Add another item field', 'Done'],
      },
    ]);
    if (itemAction === 'Done') break;
  }
  const titleFieldCandidates = itemFields.filter((f) => f.contentType === 'EditableText').map((f) => f.fieldName);
  if (titleFieldCandidates.length === 0) {
    throw new Error(
      'A collection needs at least one item field of type "EditableText" that serves as the title in the item list.',
    );
  }
  const { titleField } = await inquirer.prompt([
    {
      type: 'list',
      name: 'titleField',
      message: 'Which field should be shown as the title in the item list?',
      choices: titleFieldCandidates,
    },
  ]);

  return { itemFields, titleField };
}
