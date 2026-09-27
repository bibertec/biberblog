import { describe, expect, it } from 'vitest';
import {
  MAX_UPLOAD_BYTES,
  imageValueSchema,
  repositoryImagePathSchema,
  tempImageDraftSchema,
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
