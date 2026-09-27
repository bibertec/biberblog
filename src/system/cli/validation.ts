import { AVAILABLE_CONTENT_TYPES, AVAILABLE_ITEM_CONTENT_TYPES, CAMEL_CASE_PATTERN } from './constants.ts';
import type { ItemFieldAnswer } from './types.ts';

/**
 * Checks that run inside the actions, so they also apply when a generator is run without its
 * prompts (tests, scripts). The prompts keep their own validation for immediate feedback.
 */

export function assertPattern(value: unknown, pattern: RegExp, message: string): asserts value is string {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new Error(message);
  }
}

export function assertPositiveInteger(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
}

export type FieldDefinition = {
  fieldName: string;
  contentType: string;
  itemFields?: ItemFieldAnswer[];
  titleField?: string;
  imageWidth?: number;
  imageHeight?: number;
};

export function assertValidFieldDefinition(field: FieldDefinition): void {
  assertPattern(field.fieldName, CAMEL_CASE_PATTERN, `Field name "${field.fieldName}" must be camelCase.`);
  if (!(AVAILABLE_CONTENT_TYPES as readonly string[]).includes(field.contentType)) {
    throw new Error(`Unknown content type "${field.contentType}".`);
  }
  if (field.contentType === 'EditableImage') {
    assertPositiveInteger(field.imageWidth, 'Image width');
    assertPositiveInteger(field.imageHeight, 'Image height');
  }
  if (field.contentType === 'EditableCollection') {
    const itemFields = field.itemFields ?? [];
    if (itemFields.length === 0) {
      throw new Error(`Collection "${field.fieldName}" needs at least one item field.`);
    }
    const names = new Set<string>();
    for (const itemField of itemFields) {
      assertPattern(itemField.fieldName, CAMEL_CASE_PATTERN, `Item field name "${itemField.fieldName}" must be camelCase.`);
      if (itemField.fieldName === 'id' || names.has(itemField.fieldName)) {
        throw new Error(`Item field name "${itemField.fieldName}" is reserved or used twice.`);
      }
      if (!(AVAILABLE_ITEM_CONTENT_TYPES as readonly string[]).includes(itemField.contentType)) {
        throw new Error(`Content type "${itemField.contentType}" is not allowed inside a collection.`);
      }
      if (itemField.contentType === 'EditableImage') {
        assertPositiveInteger(itemField.imageWidth, `Image width of "${itemField.fieldName}"`);
        assertPositiveInteger(itemField.imageHeight, `Image height of "${itemField.fieldName}"`);
      }
      names.add(itemField.fieldName);
    }
    const titleField = itemFields.find((itemField) => itemField.fieldName === field.titleField);
    if (!titleField || titleField.contentType !== 'EditableText') {
      throw new Error(`Collection "${field.fieldName}" needs an "EditableText" item field as its title field.`);
    }
  }
}
