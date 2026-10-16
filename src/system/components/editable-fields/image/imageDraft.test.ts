import { describe, expect, it, vi } from 'vitest';
import type { CropData, ImageValue, ResponsiveImageDraft, TempImage } from '@/src/system/content/imageSchema';
import { deriveCrop } from '@/src/system/lib/images/cropMath';
import { translations } from '@/src/project/config/translations';
import {
  buildImageDraft,
  initialSources,
  uploadOncePerSource,
  type CropSource,
  type UploadableSource,
  type VariantSnapshot,
} from './imageDraft';

// Desktop 2:1, mobile 1:2 (as in a `imageFieldRegistry` entry with `mobile`).
const MOBILE_ASPECT_RATIO = 0.5;

const DESKTOP_SRC = '/images/aaaaaaaa-0000-4000-8000-000000000001.webp';
const MOBILE_SRC = '/images/aaaaaaaa-0000-4000-8000-000000000001-mobile.webp';
const DESKTOP_URL = '/_next/static/media/desktop.123.webp';
const MOBILE_URL = '/_next/static/media/mobile.456.webp';
const PUBLISHED_AUTO: ImageValue = { src: DESKTOP_SRC, alt: 'Hero', mobile: { src: MOBILE_SRC, mode: 'auto' } };
const PUBLISHED_CUSTOM: ImageValue = { ...PUBLISHED_AUTO, mobile: { src: MOBILE_SRC, mode: 'custom' } };
const PUBLISHED_LEGACY: ImageValue = { src: '/images/placeholder.webp', alt: 'Hero' };

const FULL_CROP: CropData = { x: 0, y: 0, width: 400, height: 200, rotation: 0 };
const MOVED_CROP: CropData = { x: 100, y: 50, width: 200, height: 100, rotation: 0 };
const MOBILE_CROP: CropData = { x: 10, y: 0, width: 100, height: 200, rotation: 0 };
const EXISTING_TEMP: TempImage = { pathname: 'temp/existing.jpg', mimeType: 'image/jpeg', size: 10 };

function snapshot(source: CropSource | null, overrides: Partial<VariantSnapshot> = {}): VariantSnapshot {
  return { source, status: source ? 'ready' : 'idle', error: null, crop: FULL_CROP, untouched: true, ...overrides };
}

const published = (src: string, url: string): CropSource & { kind: 'published' } => ({ kind: 'published', src, url });
const file = (name = 'photo.jpg'): CropSource & { kind: 'file' } => ({
  kind: 'file',
  file: new File([new Uint8Array(4)], name, { type: 'image/jpeg' }),
  url: `blob:${name}`,
});
const AUTO = snapshot(null, { crop: undefined });

function uploader() {
  let count = 0;

  return vi.fn(async (source: UploadableSource): Promise<TempImage> => {
    count += 1;

    return { pathname: `temp/upload-${count}.jpg`, mimeType: 'image/jpeg', size: source.kind === 'file' ? source.file.size : 99 };
  });
}

type Input = Parameters<typeof buildImageDraft>[0];

function responsive(overrides: Partial<Input> & Pick<Input, 'desktop'>, upload = uploader()) {
  return {
    upload,
    result: buildImageDraft({
      alt: 'Hero',
      mobile: AUTO,
      mobileMode: 'auto',
      mobileAspectRatio: MOBILE_ASPECT_RATIO,
      published: PUBLISHED_AUTO,
      current: overrides.published ?? PUBLISHED_AUTO,
      upload,
      ...overrides,
    }),
  };
}

describe('initialSources', () => {
  const image = { src: DESKTOP_URL, mobileSrc: MOBILE_URL };

  it('lets the mobile image follow the desktop image unless it is custom', () => {
    expect(initialSources(PUBLISHED_AUTO, image)).toEqual({
      desktop: published(DESKTOP_SRC, DESKTOP_URL),
      mobile: null,
      mobileMode: 'auto',
    });
    expect(initialSources(PUBLISHED_LEGACY, { src: DESKTOP_URL })).toMatchObject({ mobile: null, mobileMode: 'auto' });
    expect(initialSources(PUBLISHED_CUSTOM, image)).toEqual({
      desktop: published(DESKTOP_SRC, DESKTOP_URL),
      mobile: published(MOBILE_SRC, MOBILE_URL),
      mobileMode: 'custom',
    });
  });

  it('reopens the temp blobs and crops of a draft', () => {
    const draft: ResponsiveImageDraft = {
      alt: 'Hero',
      desktop: { src: DESKTOP_SRC },
      mobile: { mode: 'custom', temp: EXISTING_TEMP, crop: MOBILE_CROP },
    };

    expect(initialSources(draft, image)).toEqual({
      desktop: published(DESKTOP_SRC, DESKTOP_URL),
      mobile: { kind: 'temp', temp: EXISTING_TEMP, crop: MOBILE_CROP },
      mobileMode: 'custom',
    });
    expect(initialSources({ alt: 'Hero', temp: EXISTING_TEMP, crop: MOVED_CROP }, image)).toEqual({
      desktop: { kind: 'temp', temp: EXISTING_TEMP, crop: MOVED_CROP },
      mobile: null,
      mobileMode: 'auto',
    });
  });
});

describe('buildImageDraft: single image (no mobile variant)', () => {
  const single = (overrides: Partial<Input> & Pick<Input, 'desktop' | 'current'>, upload = uploader()) => ({
    upload,
    result: buildImageDraft({ alt: 'Photo', mobile: AUTO, mobileMode: 'auto', upload, ...overrides }),
  });

  it('only changes the alt text of an untouched published image – keeping the rest of the value', async () => {
    const current = { src: DESKTOP_SRC, alt: 'Old', mobile: { src: MOBILE_SRC, mode: 'auto' as const } };
    const { result, upload } = single({ current, desktop: snapshot(published(DESKTOP_SRC, DESKTOP_URL)) });

    expect(await result).toEqual({ ...current, alt: 'Photo' });
    expect(upload).not.toHaveBeenCalled();
  });

  it('uploads the published WEBP for a new crop', async () => {
    const { result, upload } = single({
      current: { src: DESKTOP_SRC, alt: 'Photo' },
      desktop: snapshot(published(DESKTOP_SRC, DESKTOP_URL), { crop: MOVED_CROP, untouched: false }),
    });

    expect(await result).toEqual({ alt: 'Photo', crop: MOVED_CROP, temp: { pathname: 'temp/upload-1.jpg', mimeType: 'image/jpeg', size: 99 } });
    expect(upload).toHaveBeenCalledWith(published(DESKTOP_SRC, DESKTOP_URL));
  });

  it('reuses the temp blob of a reopened draft with the new crop', async () => {
    const { result, upload } = single({
      current: { alt: 'Photo', temp: EXISTING_TEMP, crop: FULL_CROP },
      desktop: snapshot({ kind: 'temp', temp: EXISTING_TEMP, crop: FULL_CROP }, { crop: MOVED_CROP, untouched: false }),
    });

    expect(await result).toEqual({ alt: 'Photo', crop: MOVED_CROP, temp: EXISTING_TEMP });
    expect(upload).not.toHaveBeenCalled();
  });

  it('requires an alt text and a loaded image', async () => {
    const desktop = snapshot(published(DESKTOP_SRC, DESKTOP_URL));
    const current = { src: DESKTOP_SRC, alt: 'Photo' };

    await expect(single({ current, desktop, alt: '  ' }).result).rejects.toThrow(translations.image.altTextRequired);
    await expect(single({ current, desktop: { ...desktop, status: 'decoding', crop: undefined } }).result).rejects.toThrow(
      translations.image.notReady,
    );
  });
});

describe('buildImageDraft: field with a mobile variant', () => {
  const desktopUntouched = snapshot(published(DESKTOP_SRC, DESKTOP_URL));

  it('returns the published value itself when nothing changed (the draft is discarded)', async () => {
    const { result, upload } = responsive({ desktop: desktopUntouched });

    expect(await result).toBe(PUBLISHED_AUTO);
    expect(upload).not.toHaveBeenCalled();
  });

  it('keeps both files when only the alt text changed', async () => {
    const { result, upload } = responsive({
      alt: 'Better alt',
      published: PUBLISHED_CUSTOM,
      mobileMode: 'custom',
      desktop: desktopUntouched,
      mobile: snapshot(published(MOBILE_SRC, MOBILE_URL)),
    });

    expect(await result).toEqual({ ...PUBLISHED_CUSTOM, alt: 'Better alt' });
    expect(upload).not.toHaveBeenCalled();
  });

  it('derives the mobile crop from the new desktop crop of the same upload', async () => {
    const chosen = file();
    const { result, upload } = responsive({ desktop: snapshot(chosen, { crop: MOVED_CROP, untouched: false }) });
    const temp = { pathname: 'temp/upload-1.jpg', mimeType: 'image/jpeg', size: 4 };

    expect(await result).toEqual({
      alt: 'Hero',
      desktop: { temp, crop: MOVED_CROP },
      mobile: { mode: 'auto', temp, crop: deriveCrop(MOVED_CROP, MOBILE_ASPECT_RATIO) },
    });
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('keeps a custom mobile file when the desktop image changes', async () => {
    const { result } = responsive({
      published: PUBLISHED_CUSTOM,
      mobileMode: 'custom',
      desktop: snapshot(file()),
      mobile: snapshot(published(MOBILE_SRC, MOBILE_URL)),
    });

    expect(await result).toMatchObject({ desktop: { crop: FULL_CROP }, mobile: { mode: 'custom', src: MOBILE_SRC } });
  });

  it('keeps the desktop file when only the mobile crop changes (crop of the desktop image)', async () => {
    const { result, upload } = responsive({
      mobileMode: 'custom',
      desktop: desktopUntouched,
      // A slider moved in the smartphone view: the mobile image is now a crop of the desktop file.
      mobile: snapshot(published(DESKTOP_SRC, DESKTOP_URL), { crop: MOBILE_CROP, untouched: false }),
    });

    expect(await result).toEqual({
      alt: 'Hero',
      desktop: { src: DESKTOP_SRC },
      mobile: { mode: 'custom', temp: { pathname: 'temp/upload-1.jpg', mimeType: 'image/jpeg', size: 99 }, crop: MOBILE_CROP },
    });
    expect(upload).toHaveBeenCalledWith(published(DESKTOP_SRC, DESKTOP_URL));
  });

  it('uploads a different mobile image on its own', async () => {
    const { result, upload } = responsive({
      mobileMode: 'custom',
      desktop: snapshot(file('desktop.jpg')),
      mobile: snapshot(file('mobile.jpg'), { crop: MOBILE_CROP }),
    });

    expect(await result).toMatchObject({
      desktop: { temp: { pathname: 'temp/upload-1.jpg' } },
      mobile: { mode: 'custom', temp: { pathname: 'temp/upload-2.jpg' }, crop: MOBILE_CROP },
    });
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it('generates the mobile file from the unchanged desktop file when the field had none yet', async () => {
    const legacyDesktop = snapshot(published(PUBLISHED_LEGACY.src, DESKTOP_URL));
    const { result, upload } = responsive({ alt: 'New alt', published: PUBLISHED_LEGACY, desktop: legacyDesktop });

    expect(await result).toEqual({
      alt: 'New alt',
      desktop: { src: PUBLISHED_LEGACY.src },
      mobile: { mode: 'auto', temp: { pathname: 'temp/upload-1.jpg', mimeType: 'image/jpeg', size: 99 }, crop: deriveCrop(FULL_CROP, MOBILE_ASPECT_RATIO) },
    });
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('does not create a draft for a field without mobile file when nothing changed', async () => {
    const { result, upload } = responsive({ published: PUBLISHED_LEGACY, desktop: snapshot(published(PUBLISHED_LEGACY.src, DESKTOP_URL)) });

    expect(await result).toBe(PUBLISHED_LEGACY);
    expect(upload).not.toHaveBeenCalled();
  });

  it('goes back from a custom mobile image to the derived one ("use desktop image")', async () => {
    const { result } = responsive({ published: PUBLISHED_CUSTOM, mobileMode: 'auto', desktop: desktopUntouched });

    expect(await result).toMatchObject({
      desktop: { src: DESKTOP_SRC },
      mobile: { mode: 'auto', temp: { pathname: 'temp/upload-1.jpg' }, crop: deriveCrop(FULL_CROP, MOBILE_ASPECT_RATIO) },
    });
  });

  it('reuses a mobile file derived from the unchanged desktop file in an earlier save', async () => {
    const current: ResponsiveImageDraft = {
      alt: 'Hero',
      desktop: { src: DESKTOP_SRC },
      mobile: { mode: 'auto', temp: EXISTING_TEMP, crop: MOBILE_CROP },
    };
    const { result, upload } = responsive({ published: PUBLISHED_CUSTOM, current, alt: 'Changed', desktop: desktopUntouched });

    expect(await result).toEqual({ ...current, alt: 'Changed' });
    expect(upload).not.toHaveBeenCalled();
  });

  it('uses the stored crop of a custom mobile draft that was not shown again', async () => {
    const { result, upload } = responsive({
      mobileMode: 'custom',
      desktop: desktopUntouched,
      alt: 'Changed',
      mobile: snapshot({ kind: 'temp', temp: EXISTING_TEMP, crop: MOBILE_CROP }, { status: 'decoding', crop: undefined }),
    });

    expect(await result).toMatchObject({ mobile: { mode: 'custom', temp: EXISTING_TEMP, crop: MOBILE_CROP } });
    expect(upload).not.toHaveBeenCalled();
  });

  it('refuses a mobile image that has not loaded or failed', async () => {
    const notLoaded = responsive({ mobileMode: 'custom', desktop: desktopUntouched, mobile: snapshot(file(), { status: 'decoding', crop: undefined }) });
    const failed = responsive({
      mobileMode: 'custom',
      desktop: desktopUntouched,
      mobile: snapshot(null, { status: 'error', error: translations.image.invalidType }),
    });

    await expect(notLoaded.result).rejects.toThrow(translations.image.notReady);
    await expect(failed.result).rejects.toThrow(translations.image.invalidType);
  });
});

describe('uploadOncePerSource', () => {
  it('uploads the same file or published image only once', async () => {
    const upload = uploader();
    const once = uploadOncePerSource(upload);
    const chosen = file();

    const [a, b] = await Promise.all([once(chosen), once({ ...chosen })]);
    const c = await once(published(DESKTOP_SRC, DESKTOP_URL));

    expect(a).toBe(b);
    expect(c).not.toBe(a);
    expect(upload).toHaveBeenCalledTimes(2);
  });
});
