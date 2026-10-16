import type { PlopGeneratorConfig } from 'plop';
import { AVAILABLE_ITEM_CONTENT_TYPES, CAMEL_CASE_PATTERN } from './constants.ts';
import type { ItemFieldAnswer } from './types.ts';

/** Interactive prompt steps shared by `module:create` and `module:add-editable-field`. */

type Inquirer = Parameters<Extract<PlopGeneratorConfig['prompts'], (...args: never[]) => unknown>>[0];

const positiveInteger = (input: number | undefined) =>
  (typeof input === 'number' && Number.isInteger(input) && input > 0) || 'Please enter a positive integer.';

type ImageDimensions = {
  imageWidth: number;
  imageHeight: number;
  /** Optional mobile variant – only offered for top-level image fields, not inside collections. */
  imageMobileWidth?: number;
  imageMobileHeight?: number;
};

export async function promptImageDimensions(
  inquirer: Inquirer,
  { offerMobileVariant = false }: { offerMobileVariant?: boolean } = {},
): Promise<ImageDimensions> {
  const dimensions: ImageDimensions = await inquirer.prompt([
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
  if (!offerMobileVariant) return dimensions;
  const { withMobileVariant } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'withMobileVariant',
      message: 'Add a smartphone variant (own format below 768 px, editors can choose a different image or crop)?',
      default: false,
    },
  ]);
  if (!withMobileVariant) return dimensions;
  const mobile = await inquirer.prompt([
    {
      type: 'number',
      name: 'imageMobileWidth',
      message: 'Smartphone target width in pixels?',
      validate: positiveInteger,
    },
    {
      type: 'number',
      name: 'imageMobileHeight',
      message: 'Smartphone target height in pixels?',
      validate: positiveInteger,
    },
  ]);

  return { ...dimensions, ...mobile };
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
