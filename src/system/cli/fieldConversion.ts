import { defaultValueForContentType } from './helpers.ts';
import type { ItemFieldAnswer } from './types.ts';

/**
 * Converts the content of an editable field when `module:change-field` changes its type. Pure
 * functions on JSON values – the action applies them to every module instance on every page.
 */

/** Target or source field of a conversion. `itemField`: the item field of a collection that takes or gives the value. */
export type ConversionField = { contentType: string; itemFields?: ItemFieldAnswer[]; itemField?: string };

/** Type changes with a conversion, as `<from> → <to>`. Same type means rename only. */
export const SUPPORTED_CONVERSIONS = [
  'EditableText → EditableRichtext',
  'EditableRichtext → EditableText',
  'EditableText | EditableRichtext | EditableImage → EditableCollection (value becomes the only item)',
  'EditableCollection → EditableText | EditableRichtext | EditableImage (value of the first item)',
];

const SINGLE_TYPES = ['EditableText', 'EditableRichtext', 'EditableImage'];

/** Types a field of type `from` can be changed to (including its own type: rename only). */
export function convertibleTypes(from: string): string[] {
  if (from === 'EditableCollection') return [from, ...SINGLE_TYPES];
  const textTypes = ['EditableText', 'EditableRichtext'];

  return [from, ...(textTypes.includes(from) ? textTypes.filter((type) => type !== from) : []), 'EditableCollection'];
}

type TextNode = { type: 'text'; text: string; marks?: unknown[] };
type Block = { type: string; content?: (Block | TextNode)[] };
type Doc = { type: 'doc'; content: Block[] };

/** Plain text → richtext: one paragraph per line (empty lines are skipped, an empty text gives an empty paragraph). */
export function textToRichtext(text: string): Doc {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) return { type: 'doc', content: [{ type: 'paragraph' }] };

  return { type: 'doc', content: lines.map((line) => ({ type: 'paragraph', content: [{ type: 'text', text: line }] })) };
}

/** Text of a block: paragraphs directly, lists one entry per list item. */
function blockTexts(block: Block): string[] {
  if (block.type === 'paragraph') {
    return [(block.content ?? []).map((node) => ('text' in node ? node.text : '')).join('')];
  }

  return (block.content ?? []).flatMap((child) => ('content' in child || child.type !== 'text' ? blockTexts(child as Block) : []));
}

/** Richtext → plain text: blocks and list items joined with a space; formatting (bold, links, lists) is lost. */
export function richtextToText(doc: Doc): { text: string; lossy: boolean } {
  const texts = doc.content.flatMap(blockTexts).map((text) => text.trim()).filter(Boolean);
  const hasMarks = JSON.stringify(doc).includes('"marks"');
  const hasLists = doc.content.some((block) => block.type !== 'paragraph');

  return { text: texts.join(' '), lossy: hasMarks || hasLists || texts.length > 1 };
}

/** Converts a single value (text, richtext or image) between two of these types. */
function convertSingle(from: string, to: string, value: unknown): { value: unknown; lossy: boolean } {
  if (from === to) return { value, lossy: false };
  if (from === 'EditableText' && to === 'EditableRichtext') return { value: textToRichtext(String(value)), lossy: false };
  if (from === 'EditableRichtext' && to === 'EditableText') {
    const { text, lossy } = richtextToText(value as Doc);
    return { value: text, lossy };
  }
  throw new Error(`Cannot convert ${from} to ${to}.`);
}

/** Collection images have no mobile variant – its file is dropped, the desktop image stays. */
function withoutMobile(contentType: string, value: unknown): { value: unknown; lossy: boolean } {
  if (contentType !== 'EditableImage' || typeof value !== 'object' || value === null || !('mobile' in value)) {
    return { value, lossy: false };
  }
  const rest = { ...(value as Record<string, unknown>) };
  delete rest.mobile;

  return { value: rest, lossy: true };
}

function itemFieldOf(field: ConversionField, role: 'target' | 'source'): ItemFieldAnswer {
  const itemField = (field.itemFields ?? []).find((candidate) => candidate.fieldName === field.itemField);
  if (!itemField) {
    throw new Error(
      `"itemField" must name the item field of the collection that ${role === 'target' ? 'takes' : 'gives'} the value` +
        `${field.itemField ? ` ("${field.itemField}" does not exist)` : ''}.`,
    );
  }

  return itemField;
}

/**
 * Checks that `from → to` is supported and that the item field (for collections) fits. Throws
 * before any file is changed.
 */
export function assertConvertible(from: ConversionField, to: ConversionField): void {
  const unsupported = () =>
    new Error(`Cannot change ${from.contentType} to ${to.contentType}. Supported:\n- ${SUPPORTED_CONVERSIONS.join('\n- ')}`);
  if (from.contentType === to.contentType) return;
  if (to.contentType === 'EditableCollection') {
    if (!SINGLE_TYPES.includes(from.contentType)) throw unsupported();
    const itemField = itemFieldOf(to, 'target');
    if (itemField.contentType !== from.contentType) {
      throw new Error(`Item field "${itemField.fieldName}" is ${itemField.contentType}, but the field is ${from.contentType}.`);
    }
    return;
  }
  if (from.contentType === 'EditableCollection') {
    if (!SINGLE_TYPES.includes(to.contentType)) throw unsupported();
    const itemField = itemFieldOf(from, 'source');
    if (itemField.contentType !== to.contentType) {
      throw new Error(`Item field "${itemField.fieldName}" is ${itemField.contentType}, but the new field is ${to.contentType}.`);
    }
    return;
  }
  const pair = `${from.contentType} → ${to.contentType}`;
  if (pair !== 'EditableText → EditableRichtext' && pair !== 'EditableRichtext → EditableText') throw unsupported();
}

/**
 * Converts one field value. `lossy` is true if content was dropped (formatting, further items,
 * other item fields, the mobile image).
 */
export function convertFieldValue(from: ConversionField, to: ConversionField, value: unknown): { value: unknown; lossy: boolean } {
  assertConvertible(from, to);
  if (from.contentType === to.contentType) return { value, lossy: false };
  if (to.contentType === 'EditableCollection') {
    const itemField = itemFieldOf(to, 'target');
    const [item] = defaultValueForContentType('EditableCollection', to.itemFields) as Record<string, unknown>[];
    const converted = withoutMobile(from.contentType, value);
    item[itemField.fieldName] = converted.value;
    return { value: [item], lossy: converted.lossy };
  }
  if (from.contentType === 'EditableCollection') {
    const itemField = itemFieldOf(from, 'source');
    const items = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
    if (items.length === 0) return { value: defaultValueForContentType(to.contentType), lossy: false };
    const otherItemFields = (from.itemFields ?? []).some((candidate) => candidate.fieldName !== itemField.fieldName);
    return { value: items[0][itemField.fieldName], lossy: items.length > 1 || otherItemFields };
  }

  return convertSingle(from.contentType, to.contentType, value);
}
