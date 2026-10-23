import { describe, expect, it } from 'vitest';
import { richtextDocSchema } from '../content/richtextSchema.ts';
import { assertConvertible, convertFieldValue, convertibleTypes, richtextToText, textToRichtext } from './fieldConversion.ts';

const IMAGE = { src: '/images/a.webp', alt: 'A' };
const COLLECTION_FIELDS = [
  { fieldName: 'caption', contentType: 'EditableText' },
  { fieldName: 'picture', contentType: 'EditableImage', imageWidth: 300, imageHeight: 200 },
];

describe('textToRichtext', () => {
  it('turns every non-empty line into a paragraph and keeps the doc valid', () => {
    const doc = textToRichtext('One\n\nTwo');
    expect(doc.content).toHaveLength(2);
    expect(richtextDocSchema.safeParse(doc).success).toBe(true);
  });

  it('gives an empty paragraph for an empty text', () => {
    const doc = textToRichtext('');
    expect(doc).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
    expect(richtextDocSchema.safeParse(doc).success).toBe(true);
  });
});

describe('richtextToText', () => {
  it('keeps a single plain paragraph without loss', () => {
    expect(richtextToText(textToRichtext('Hello'))).toEqual({ text: 'Hello', lossy: false });
  });

  it('joins paragraphs and list items and reports formatting as lost', () => {
    const doc = {
      type: 'doc' as const,
      content: [
        { type: 'paragraph', content: [{ type: 'text' as const, text: 'Intro ' }, { type: 'text' as const, text: 'bold', marks: [{ type: 'bold' }] }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text' as const, text: 'Item' }] }] }] },
      ],
    };
    expect(richtextToText(doc)).toEqual({ text: 'Intro bold Item', lossy: true });
  });
});

describe('convertFieldValue', () => {
  it('wraps a value into a new collection item and drops the mobile image', () => {
    const from = { contentType: 'EditableImage' };
    const to = { contentType: 'EditableCollection', itemFields: COLLECTION_FIELDS, itemField: 'picture' };
    const { value, lossy } = convertFieldValue(from, to, { ...IMAGE, mobile: { src: '/images/a-mobile.webp', mode: 'auto' } });

    expect(value).toEqual([{ id: expect.any(String), caption: expect.any(String), picture: IMAGE }]);
    expect(lossy).toBe(true);
  });

  it('takes the item field of the first item and reports further items as lost', () => {
    const from = { contentType: 'EditableCollection', itemFields: COLLECTION_FIELDS, itemField: 'picture' };
    const items = [
      { id: '1', caption: 'A', picture: IMAGE },
      { id: '2', caption: 'B', picture: IMAGE },
    ];

    expect(convertFieldValue(from, { contentType: 'EditableImage' }, items)).toEqual({ value: IMAGE, lossy: true });
    expect(convertFieldValue(from, { contentType: 'EditableImage' }, []).value).toMatchObject({ src: '/images/placeholder.webp' });
  });

  it('keeps the value when the type stays the same', () => {
    expect(convertFieldValue({ contentType: 'EditableText' }, { contentType: 'EditableText' }, 'x')).toEqual({ value: 'x', lossy: false });
  });
});

describe('assertConvertible', () => {
  it('rejects conversions without a meaningful mapping', () => {
    expect(() => assertConvertible({ contentType: 'EditableText' }, { contentType: 'EditableImage' })).toThrow(/Cannot change/);
    expect(convertibleTypes('EditableText')).not.toContain('EditableImage');
  });

  it('requires an item field of the matching type', () => {
    const to = { contentType: 'EditableCollection', itemFields: COLLECTION_FIELDS };
    expect(() => assertConvertible({ contentType: 'EditableImage' }, to)).toThrow(/itemField/);
    expect(() => assertConvertible({ contentType: 'EditableImage' }, { ...to, itemField: 'caption' })).toThrow(/is EditableText/);
  });
});
