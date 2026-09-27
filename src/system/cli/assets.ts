import fs from 'node:fs';
import path from 'node:path';
import { itemImageFieldNames } from './codeGen.ts';
import { PLACEHOLDER_IMAGE_SOURCE, PLACEHOLDER_IMAGE_SRC } from './constants.ts';
import type { ModuleFieldAnswer } from './types.ts';

/** `true` for an image field and for a collection with image item fields. */
export function fieldUsesImages(field: ModuleFieldAnswer): boolean {
  return field.contentType === 'EditableImage' || itemImageFieldNames(field).length > 0;
}

/**
 * Copies the placeholder image into `public/images/` if it is not there yet. From then on it is a
 * normal project asset: new image fields point to it until the customer uploads an image.
 */
export function ensurePlaceholderImage(): void {
  const target = path.join('public', PLACEHOLDER_IMAGE_SRC);
  if (fs.existsSync(target)) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(PLACEHOLDER_IMAGE_SOURCE, target);
}
