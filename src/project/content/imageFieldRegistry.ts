export type ImageFieldRules = {
  aspectRatio: number;
  maxWidth: number;
  maxHeight: number;
};

/**
 * `'<Module>.<field>'` for an image field, `'<Module>.<collectionField>.<itemField>'` for an image
 * item field inside a collection.
 */
export function imageFieldRegistryKey(moduleType: string, ...fieldPath: [string] | [string, string]): string {
  return [moduleType, ...fieldPath].join('.');
}

export const imageFieldRegistry = {} satisfies Record<string, ImageFieldRules>;
