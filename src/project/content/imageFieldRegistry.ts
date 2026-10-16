import type { ImageFieldRules } from '@/src/system/content/imageFieldRules';

export type { ImageFieldRules };

/**
 * `'<Module>.<field>'` for an image field, `'<Module>.<collectionField>.<itemField>'` for an image
 * item field inside a collection.
 */
export function imageFieldRegistryKey(moduleType: string, ...fieldPath: [string] | [string, string]): string {
  return [moduleType, ...fieldPath].join('.');
}

export const imageFieldRegistry = {} satisfies Record<string, ImageFieldRules>;
