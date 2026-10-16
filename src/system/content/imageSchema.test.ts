import { describe, expect, it } from 'vitest';
import {
  MAX_UPLOAD_BYTES,
  imageValueSchema,
  isSameImageValue,
  repositoryImagePathSchema,
  responsiveImageDraftSchema,
  tempImageDraftSchema,
  tempPathnamesOf,
} from './imageSchema';

describe('repositoryImagePathSchema', () => {
  it.each(['/images/photo.webp', '/images/aaaaaaaa-0000-4000-8000-000000000001.webp', '/images/a_b-c.1.webp'])(
    'accepts %s',
    (path) => {
      expect(repositoryImagePathSchema.safeParse(path).success).toBe(true);
    },
  );

  it.each([
    '/images/../secret.webp',
    '/images/sub/photo.webp',
    '/images/.hidden.webp',
    '/images/photo.png',
    '/images/photo.webp?x=1',
    'images/photo.webp',
    '/public/images/photo.webp',
    'https://example.com/images/photo.webp',
  ])('rejects %s', (path) => {
    expect(repositoryImagePathSchema.safeParse(path).success).toBe(false);
  });
});

describe('imageValueSchema', () => {
  it('requires a non-empty alt text', () => {
    expect(imageValueSchema.safeParse({ src: '/images/a.webp', alt: 'A' }).success).toBe(true);
    expect(imageValueSchema.safeParse({ src: '/images/a.webp', alt: '   ' }).success).toBe(false);
  });

  it('accepts an optional mobile file with its mode', () => {
    const value = { src: '/images/a.webp', alt: 'A', mobile: { src: '/images/a-mobile.webp', mode: 'auto' } };

    expect(imageValueSchema.parse(value)).toEqual(value);
    expect(imageValueSchema.safeParse({ ...value, mobile: { ...value.mobile, mode: 'other' } }).success).toBe(false);
    expect(imageValueSchema.safeParse({ ...value, mobile: { ...value.mobile, src: '/elsewhere/a.webp' } }).success).toBe(false);
  });
});

describe('responsiveImageDraftSchema', () => {
  const temp = { pathname: 'temp/abc-123.jpg', mimeType: 'image/jpeg', size: 1000 };
  const crop = { x: 0, y: 0, width: 100, height: 100, rotation: 0 };
  const valid = { alt: 'Hero', desktop: { temp, crop }, mobile: { mode: 'auto', temp, crop } };

  it.each([
    ['both variants from one upload', valid],
    ['a kept desktop file', { ...valid, desktop: { src: '/images/a.webp' } }],
    ['a kept custom mobile file', { ...valid, mobile: { mode: 'custom', src: '/images/a-mobile.webp' } }],
  ])('accepts %s', (_, draft) => {
    expect(responsiveImageDraftSchema.safeParse(draft).success).toBe(true);
  });

  it.each([
    ['a mobile variant without mode', { ...valid, mobile: { temp, crop } }],
    ['an invalid temp path', { ...valid, mobile: { mode: 'auto', temp: { ...temp, pathname: 'public/a.jpg' }, crop } }],
    ['an invalid kept file', { ...valid, desktop: { src: '/images/../a.webp' } }],
    ['an empty alt text', { ...valid, alt: ' ' }],
  ])('rejects %s', (_, draft) => {
    expect(responsiveImageDraftSchema.safeParse(draft).success).toBe(false);
  });

  it('is not confused with the other image drafts', () => {
    expect(tempImageDraftSchema.safeParse(valid).success).toBe(false);
    expect(imageValueSchema.safeParse(valid).success).toBe(false);
    expect(responsiveImageDraftSchema.safeParse({ alt: 'A', crop, temp }).success).toBe(false);
    expect(responsiveImageDraftSchema.safeParse({ src: '/images/a.webp', alt: 'A' }).success).toBe(false);
  });

  it('lists a temp blob shared by both variants once', () => {
    expect(tempPathnamesOf(valid)).toEqual(['temp/abc-123.jpg']);
    expect(tempPathnamesOf({ ...valid, mobile: { mode: 'custom', temp: { ...temp, pathname: 'temp/def.png' }, crop } })).toEqual([
      'temp/abc-123.jpg',
      'temp/def.png',
    ]);
    expect(tempPathnamesOf({ ...valid, desktop: { src: '/images/a.webp' } })).toEqual(['temp/abc-123.jpg']);
    expect(tempPathnamesOf({ alt: 'A', crop, temp })).toEqual(['temp/abc-123.jpg']);
    expect(tempPathnamesOf({ src: '/images/a.webp', alt: 'A' })).toEqual([]);
    expect(tempPathnamesOf('text')).toEqual([]);
  });
});

describe('isSameImageValue', () => {
  const value = { src: '/images/a.webp', alt: 'A', mobile: { src: '/images/a-mobile.webp', mode: 'auto' as const } };

  it('compares both files, the mode and the alt text', () => {
    expect(isSameImageValue(value, { ...value })).toBe(true);
    expect(isSameImageValue(value, { ...value, alt: 'B' })).toBe(false);
    expect(isSameImageValue(value, { ...value, mobile: { ...value.mobile, mode: 'custom' } })).toBe(false);
    expect(isSameImageValue(value, { src: value.src, alt: value.alt })).toBe(false);
  });
});

describe('tempImageDraftSchema', () => {
  const valid = {
    alt: 'Photo',
    crop: { x: 0, y: 0, width: 100, height: 100, rotation: 90 },
    temp: { pathname: 'temp/abc-123.jpg', mimeType: 'image/jpeg', size: 1000 },
  };

  it('accepts a valid draft', () => {
    expect(tempImageDraftSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ['a path outside temp/', { ...valid, temp: { ...valid.temp, pathname: 'public/abc.jpg' } }],
    ['a path traversal', { ...valid, temp: { ...valid.temp, pathname: 'temp/../abc.jpg' } }],
    ['an unsupported extension', { ...valid, temp: { ...valid.temp, pathname: 'temp/abc.gif' } }],
    ['an unsupported mime type', { ...valid, temp: { ...valid.temp, mimeType: 'image/gif' } }],
    ['a file above the size limit', { ...valid, temp: { ...valid.temp, size: MAX_UPLOAD_BYTES + 1 } }],
    ['a rotation other than 0/90/180/270', { ...valid, crop: { ...valid.crop, rotation: 45 } }],
    ['a negative crop position', { ...valid, crop: { ...valid.crop, x: -1 } }],
    ['a zero-sized crop', { ...valid, crop: { ...valid.crop, width: 0 } }],
    ['an empty alt text', { ...valid, alt: '' }],
  ])('rejects %s', (_, draft) => {
    expect(tempImageDraftSchema.safeParse(draft).success).toBe(false);
  });

  it('is not confused with a published image value (alt-text-only drafts)', () => {
    expect(tempImageDraftSchema.safeParse({ src: '/images/a.webp', alt: 'A' }).success).toBe(false);
  });
});
