import { editSourceFile, getObjectLiteral, propertyNames, removeProperty, setProperty } from '../ast.ts';
import { imageRegistryEntry, imageRegistryKey } from '../codeGen.ts';
import { IMAGE_FIELD_REGISTRY_PATH } from '../constants.ts';
import type { ModuleFieldAnswer } from '../types.ts';
import { assertPositiveInteger } from '../validation.ts';

/**
 * `src/project/content/imageFieldRegistry.ts` belongs to the project (the developer may reformat
 * it and adjust the sizes), so it is changed via the syntax tree instead of being generated.
 */

/** `key`: `'<Module>.<field>'` or `'<Module>.<collection>.<itemField>'` (see `imageRegistryKey`). */
export function setImageFieldRules(key: string, width: number, height: number): void {
  editSourceFile(IMAGE_FIELD_REGISTRY_PATH, (sourceFile) => {
    setProperty(getObjectLiteral(sourceFile, 'imageFieldRegistry'), key, imageRegistryEntry(width, height));
  });
}

/** Registers the rules of an image field, or of the image item fields of a collection field. */
export function setImageFieldRulesFor(moduleName: string, field: ModuleFieldAnswer): void {
  const entries =
    field.contentType === 'EditableImage'
      ? [{ key: imageRegistryKey(moduleName, field.fieldName), width: field.imageWidth, height: field.imageHeight }]
      : (field.itemFields ?? [])
          .filter((itemField) => itemField.contentType === 'EditableImage')
          .map((itemField) => ({
            key: imageRegistryKey(moduleName, field.fieldName, itemField.fieldName),
            width: itemField.imageWidth,
            height: itemField.imageHeight,
          }));
  for (const { key, width, height } of entries) {
    assertPositiveInteger(width, `Image width of "${key}"`);
    assertPositiveInteger(height, `Image height of "${key}"`);
    setImageFieldRules(key, width, height);
  }
}

/**
 * Removes the rules of `prefix` and everything below it: `'Team'` removes all image fields of the
 * module, `'Team.members'` the image field `members` or all image item fields of the collection.
 */
export function removeImageFieldRules(prefix: string): void {
  editSourceFile(IMAGE_FIELD_REGISTRY_PATH, (sourceFile) => {
    const matches = (key: string) => key === prefix || key.startsWith(`${prefix}.`);
    // Looked up again per key: formatting fixes after a removal invalidate earlier nodes.
    for (const key of propertyNames(getObjectLiteral(sourceFile, 'imageFieldRegistry')).filter(matches)) {
      removeProperty(getObjectLiteral(sourceFile, 'imageFieldRegistry'), key);
    }
  });
}
