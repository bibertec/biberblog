import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const AVAILABLE_CONTENT_TYPES = [
  'EditableText',
  'EditableRichtext',
  'EditableCollection',
  'EditableImage',
] as const;

export const AVAILABLE_ITEM_CONTENT_TYPES = ['EditableText', 'EditableRichtext', 'EditableImage'] as const;

export const CAMEL_CASE_PATTERN = /^[a-z][a-zA-Z0-9]*$/;

export const PASCAL_CASE_PATTERN = /^[A-Z][a-zA-Z0-9]*$/;

export const KEBAB_CASE_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export const MODULES_DIR = path.join(process.cwd(), 'src/project/components/modules');

export const CONTENT_DIR = 'src/project/content';

export const GENERATED_DIR = 'src/generated';

/** Source of the placeholder image; copied once into the project when the first image field is created. */
export const PLACEHOLDER_IMAGE_SOURCE = 'src/system/assets/placeholder.webp';

/** Path of the project's copy – the default value of new image fields. */
export const PLACEHOLDER_IMAGE_SRC = '/images/placeholder.webp';

export const BLUEPRINTS_DIR = 'src/project/content/blueprints';

export const IMAGE_FIELD_REGISTRY_PATH = 'src/project/content/imageFieldRegistry.ts';

/**
 * The CLI runs from the project root (npm scripts), so project paths are relative to the working
 * directory. Its own templates are resolved relative to this file instead.
 */
const TEMPLATES_DIR = fileURLToPath(new URL('./templates/', import.meta.url));

export const templatePath = (relativePath: string) => path.join(TEMPLATES_DIR, relativePath);

export const COLLECTION_ITEM_SCHEMA_TEMPLATE = templatePath('module/collectionItemSchema.ts.hbs');

export const COLLECTION_FIELD_WRAPPER_TEMPLATE = templatePath('module/collectionFieldWrapper.tsx.hbs');

export const COLLECTION_FIELDS_FILE_TEMPLATE = templatePath('module/CollectionFields.client.tsx.hbs');
