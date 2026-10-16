import {
  isResponsiveImageDraft,
  isTempImageDraft,
  isTempVariantDraft,
  type CropData,
  type FieldImageDraft,
  type ImageValue,
  type MobileImageMode,
  type ResponsiveImageDraft,
  type TempImage,
  type TempImageDraft,
  type VariantDraft,
} from '@/src/system/content/imageSchema';
import { deriveCrop } from '@/src/system/lib/images/cropMath';
import type { ResolvedImage } from '@/src/system/lib/images/loadContentImage';
import { translations } from '@/src/project/config/translations';

/**
 * What the image dialog turns into a field value on "Apply" – pure decisions, no React and no
 * network (the upload is passed in), so every case can be tested on its own.
 */

/** Where the pixels of a variant come from while the dialog is open. */
export type CropSource =
  | { kind: 'published'; src: string; url: string }
  | { kind: 'temp'; temp: TempImage; crop: CropData }
  | { kind: 'file'; file: File; url: string };

export type UploadableSource = Exclude<CropSource, { kind: 'temp' }>;

export type Upload = (source: UploadableSource) => Promise<TempImage>;

/** Uploads each source at most once per save – desktop and mobile may be crops of the same image. */
export function uploadOncePerSource(upload: Upload): Upload {
  const uploads = new Map<File | string, Promise<TempImage>>();

  return (source) => {
    const key = source.kind === 'file' ? source.file : source.url;
    let pending = uploads.get(key);
    if (!pending) {
      pending = upload(source);
      uploads.set(key, pending);
    }

    return pending;
  };
}

/** One variant as the dialog shows it at the moment of saving. */
export type VariantSnapshot = {
  /** `null` for the mobile variant while it follows the desktop image. */
  source: CropSource | null;
  status: 'idle' | 'loading' | 'decoding' | 'ready' | 'error';
  error: string | null;
  /** From the sliders – `undefined` while the source has not loaded (dimensions unknown). */
  crop: CropData | undefined;
  /** Sliders at zoom 1, no panning, no rotation. */
  untouched: boolean;
};

/** The sources the dialog opens with: from the current value (published image or draft). */
export function initialSources(
  current: FieldImageDraft,
  currentImage: ResolvedImage,
): { desktop: CropSource; mobile: CropSource | null; mobileMode: MobileImageMode } {
  const mobileUrl = currentImage.mobileSrc ?? currentImage.src;
  if (isTempImageDraft(current)) {
    return { desktop: { kind: 'temp', temp: current.temp, crop: current.crop }, mobile: null, mobileMode: 'auto' };
  }
  if (isResponsiveImageDraft(current)) {
    const toSource = (variant: VariantDraft, url: string): CropSource =>
      isTempVariantDraft(variant)
        ? { kind: 'temp', temp: variant.temp, crop: variant.crop }
        : { kind: 'published', src: variant.src, url };

    return {
      desktop: toSource(current.desktop, currentImage.src),
      mobile: current.mobile.mode === 'custom' ? toSource(current.mobile, mobileUrl) : null,
      mobileMode: current.mobile.mode,
    };
  }

  return {
    desktop: { kind: 'published', src: current.src, url: currentImage.src },
    mobile: current.mobile?.mode === 'custom' ? { kind: 'published', src: current.mobile.src, url: mobileUrl } : null,
    mobileMode: current.mobile?.mode ?? 'auto',
  };
}

/**
 * The draft of one variant. Uploads only if necessary:
 * - temp blob (existing draft) → reused with the new crop;
 * - the variant's own published file with an untouched crop → kept as is (`{ src }`);
 * - otherwise the chosen file (or the published WEBP for a new crop) is uploaded as a temp blob.
 */
async function variantDraft(variant: VariantSnapshot, ownPublishedSrc: string | undefined, upload: Upload): Promise<VariantDraft> {
  const { source, crop } = variant;
  if (!source || variant.status === 'error') {
    throw new Error(variant.error ?? translations.image.notReady);
  }
  if (source.kind === 'temp') return { temp: source.temp, crop: crop ?? source.crop };
  if (source.kind === 'published' && source.src === ownPublishedSrc && variant.untouched) {
    return { src: source.src };
  }
  if (!crop) throw new Error(translations.image.notReady);

  return { temp: await upload(source), crop };
}

type BuildImageDraftInput = {
  alt: string;
  desktop: VariantSnapshot;
  /** Only with `mobileAspectRatio`. */
  mobile: VariantSnapshot;
  mobileMode: MobileImageMode;
  /** Set for a field with a mobile variant – without, the result is a single-image draft. */
  mobileAspectRatio?: number;
  /** The published field value (required with `mobileAspectRatio`). */
  published?: ImageValue;
  /** The value the dialog was opened with (published value or draft). */
  current: FieldImageDraft;
  upload: Upload;
};

/**
 * The new value of the field. A field with a mobile variant gets:
 * - the published value itself if nothing changed (the caller discards the draft);
 * - an `ImageValue` if both files stay and only the alt text changed;
 * - otherwise a `ResponsiveImageDraft`: the mobile image follows the desktop image (`auto`, derived
 *   crop of the same upload – or, if the desktop file stays, of that file) or keeps its own
 *   image/crop (`custom`).
 */
export async function buildImageDraft({
  alt: altText,
  desktop,
  mobile,
  mobileMode,
  mobileAspectRatio,
  published,
  current,
  upload,
}: BuildImageDraftInput): Promise<FieldImageDraft> {
  const alt = altText.trim();
  if (!alt) {
    throw new Error(translations.image.altTextRequired);
  }
  if (desktop.status !== 'ready' || !desktop.crop) {
    throw new Error(desktop.error ?? translations.image.notReady);
  }
  if (mobileAspectRatio === undefined) {
    // A single image: every published source is the field's own file.
    const ownSrc = desktop.source?.kind === 'published' ? desktop.source.src : undefined;
    const draft = await variantDraft(desktop, ownSrc, upload);
    if (isTempVariantDraft(draft)) return { alt, crop: draft.crop, temp: draft.temp } satisfies TempImageDraft;

    // Only the alt text changes – everything else of the published value stays.
    return isTempImageDraft(current) || isResponsiveImageDraft(current) ? ({ src: draft.src, alt } satisfies ImageValue) : { ...current, alt };
  }
  if (!published) {
    throw new Error('buildImageDraft: `published` is required for a field with a mobile variant.');
  }
  const publishedMobile = published.mobile;
  const isUnchanged =
    alt === published.alt &&
    desktop.source?.kind === 'published' &&
    desktop.source.src === published.src &&
    desktop.untouched &&
    mobileMode === (publishedMobile?.mode ?? 'auto') &&
    (mobileMode === 'auto' ||
      (mobile.source?.kind === 'published' && mobile.source.src === publishedMobile?.src && mobile.untouched));
  if (isUnchanged) return published;

  const desktopDraft = await variantDraft(desktop, published.src, upload);
  let mobileDraft: ResponsiveImageDraft['mobile'];
  if (mobileMode === 'custom') {
    const ownSrc = publishedMobile?.mode === 'custom' ? publishedMobile.src : undefined;
    mobileDraft = { mode: 'custom', ...(await variantDraft(mobile, ownSrc, upload)) };
  } else if (isTempVariantDraft(desktopDraft)) {
    mobileDraft = { mode: 'auto', temp: desktopDraft.temp, crop: deriveCrop(desktopDraft.crop, mobileAspectRatio) };
  } else if (publishedMobile?.mode === 'auto') {
    // The desktop file stays, so does the mobile file derived from it.
    mobileDraft = { mode: 'auto', src: publishedMobile.src };
  } else if (
    isResponsiveImageDraft(current) &&
    !isTempVariantDraft(current.desktop) &&
    current.mobile.mode === 'auto' &&
    isTempVariantDraft(current.mobile)
  ) {
    // Derived from the same (unchanged) desktop file in an earlier save – no second upload.
    mobileDraft = current.mobile;
  } else {
    // The desktop file stays as it is; the mobile file is generated from it (first publish with a
    // mobile variant, or back from a custom mobile image).
    mobileDraft = { mode: 'auto', temp: await upload(desktop.source as UploadableSource), crop: deriveCrop(desktop.crop, mobileAspectRatio) };
  }
  if (!isTempVariantDraft(desktopDraft) && !isTempVariantDraft(mobileDraft)) {
    // Both files stay – only the alt text changed.
    return { src: desktopDraft.src, alt, mobile: { src: mobileDraft.src, mode: mobileDraft.mode } } satisfies ImageValue;
  }

  return { alt, desktop: desktopDraft, mobile: mobileDraft } satisfies ResponsiveImageDraft;
}
