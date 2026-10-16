'use client';

import { useEffect, useRef, useState } from 'react';
import { uploadPresigned } from '@vercel/blob/client';
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  type AllowedUploadMimeType,
  type CropData,
  type FieldImageDraft,
  type ImageDraft,
  type ImageValue,
  type MobileImageMode,
  type TempImage,
} from '@/src/system/content/imageSchema';
import type { ImageFieldRules, ImageVariantRules } from '@/src/system/content/imageFieldRules';
import { canPan, computeCrop, deriveCrop, slidersFromCrop, type CropSliders } from '@/src/system/lib/images/cropMath';
import { requestTempImagePreview } from '@/src/system/lib/images/actions';
import type { ResolvedImage } from '@/src/system/lib/images/loadContentImage';
import { translations } from '@/src/project/config/translations';
import type { ImageCropperProps, ImageVariantName } from './ImageCropper.client';
import {
  buildImageDraft,
  initialSources,
  uploadOncePerSource,
  type CropSource,
  type UploadableSource,
  type VariantSnapshot,
} from './imageDraft';

type SourceStatus = ImageCropperProps['sourceStatus'];
type Rotation = CropData['rotation'];
type Dimensions = { width: number; height: number };

type VariantState = {
  /** `null` for the mobile variant while it follows the desktop image (`auto`). */
  source: CropSource | null;
  /** What the cropper loads – for a temp blob only once its preview URL has been issued. */
  sourceUrl: string | undefined;
  status: SourceStatus;
  error: string | null;
  dimensions: Dimensions | null;
  sliders: CropSliders;
  /** Stored crop of a reopened temp draft, turned into slider positions once the source has loaded. */
  pendingCrop: CropData | null;
};

const IDENTITY_SLIDERS: CropSliders = { zoom: 1, panX: 0, panY: 0, rotation: 0 };
const EMPTY_VARIANT: VariantState = {
  source: null,
  sourceUrl: undefined,
  status: 'idle',
  error: null,
  dimensions: null,
  sliders: IDENTITY_SLIDERS,
  pendingCrop: null,
};
const PLACEHOLDER_CROP: CropData = { x: 0, y: 0, width: 1, height: 1, rotation: 0 };

function isIdentity(sliders: CropSliders): boolean {
  return sliders.zoom === 1 && sliders.panX === 0 && sliders.panY === 0 && sliders.rotation === 0;
}

function variantFor(source: CropSource | null): VariantState {
  if (!source) return EMPTY_VARIANT;
  if (source.kind === 'temp') return { ...EMPTY_VARIANT, source, status: 'loading', pendingCrop: source.crop };

  return { ...EMPTY_VARIANT, source, sourceUrl: source.url, status: 'decoding' };
}

function cropOf(variant: VariantState, aspectRatio: number): CropData | undefined {
  if (!variant.dimensions) return undefined;

  return computeCrop({
    sourceWidth: variant.dimensions.width,
    sourceHeight: variant.dimensions.height,
    ...variant.sliders,
    aspectRatio,
  });
}

function snapshotOf(variant: VariantState, aspectRatio: number): VariantSnapshot {
  return {
    source: variant.source,
    status: variant.status,
    error: variant.error,
    crop: cropOf(variant, aspectRatio),
    untouched: isIdentity(variant.sliders),
  };
}

function resolveUploadMeta(file: File): { extension: string; mimeType: AllowedUploadMimeType } {
  const match = ALLOWED_UPLOAD_MIME_TYPES.find((type) => type === file.type);
  if (!match) {
    throw new Error(translations.image.invalidType);
  }
  const extension = match === 'image/jpeg' ? 'jpg' : match === 'image/png' ? 'png' : 'webp';

  return { extension, mimeType: match };
}

async function fetchExistingAsFile(url: string): Promise<File> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(translations.image.existingImageLoadFailed);
  }
  const blob = await response.blob();

  return new File([blob], 'image', { type: blob.type });
}

async function uploadSource(source: UploadableSource): Promise<TempImage> {
  const file = source.kind === 'file' ? source.file : await fetchExistingAsFile(source.url);
  const meta = resolveUploadMeta(file);
  const pathname = `temp/${crypto.randomUUID()}.${meta.extension}`;
  await uploadPresigned(pathname, file, {
    access: 'private',
    contentType: meta.mimeType,
    handleUploadUrl: '/api/editor/image/upload',
  });

  return { pathname, mimeType: meta.mimeType, size: file.size };
}

type SingleVariantOptions = {
  /** The value the dialog starts from (published image or existing draft). */
  current: ImageDraft;
  /** Displayable URL of `current` if it is a published image. */
  currentImage: ResolvedImage;
  rules: ImageVariantRules & { mobile?: undefined };
};

type FieldOptions = {
  current: FieldImageDraft;
  currentImage: ResolvedImage;
  rules: ImageFieldRules;
  /** The published field value – the reference for what has to be (re)generated. */
  published: ImageValue;
};

export type ImageCropEditor<TDraft> = {
  cropperKey: number;
  cropperProps: ImageCropperProps;
  open: () => void;
  close: () => void;
  /** Back to the published image after "reset to original" (the dialog stays open). */
  reset: (published: ImageValue) => void;
  save: () => Promise<TDraft>;
};

/**
 * State and logic of the image dialog (file selection, crop sliders, alt text, upload), shared by
 * the top-level image field and image fields inside collection items. The caller decides where the
 * result of `save()` goes (store draft or collection item).
 *
 * With `rules.mobile`, the dialog edits two variants: the desktop image and a mobile image that
 * follows it (`auto`, derived crop) until the customer crops it differently or chooses another
 * image (`custom`). Without, it works on a single image exactly as before.
 */
export function useImageCropEditor(options: SingleVariantOptions): ImageCropEditor<ImageDraft>;
export function useImageCropEditor(options: FieldOptions): ImageCropEditor<FieldImageDraft>;
export function useImageCropEditor({
  current,
  currentImage,
  rules,
  published,
}: Omit<FieldOptions, 'published'> & { published?: ImageValue }): ImageCropEditor<FieldImageDraft> {
  const mobileRules = rules.mobile;
  const [desktop, setDesktop] = useState<VariantState>(EMPTY_VARIANT);
  const [mobile, setMobile] = useState<VariantState>(EMPTY_VARIANT);
  const [mobileMode, setMobileMode] = useState<MobileImageMode>('auto');
  const [activeVariant, setActiveVariant] = useState<ImageVariantName>('desktop');
  const [altText, setAltText] = useState(current.alt);
  // New key per opening: remounts the cropper so it loads the source image again, even if the
  // URL is the same as last time (otherwise a reopened dialog would hang in the loading state).
  const [cropperKey, setCropperKey] = useState(0);
  // Object URLs of chosen files – both variants may show the same file, so they are only released
  // when the dialog closes.
  const objectUrlsRef = useRef<string[]>([]);

  useEffect(
    () => () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );

  function releaseObjectUrls() {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];
  }

  function setVariant(name: ImageVariantName, update: (variant: VariantState) => VariantState) {
    (name === 'desktop' ? setDesktop : setMobile)(update);
  }

  function aspectRatioOf(name: ImageVariantName): number {
    return name === 'mobile' && mobileRules ? mobileRules.aspectRatio : rules.aspectRatio;
  }

  /** Puts the sources of `value` into the dialog; temp blobs get their preview URLs (once per blob). */
  function load(value: FieldImageDraft) {
    const sources = initialSources(value, currentImage);
    const variants = { desktop: variantFor(sources.desktop), mobile: variantFor(mobileRules ? sources.mobile : null) };
    setDesktop(variants.desktop);
    setMobile(variants.mobile);
    setMobileMode(mobileRules ? sources.mobileMode : 'auto');
    const previews = new Map<string, ReturnType<typeof requestTempImagePreview>>();
    for (const name of ['desktop', 'mobile'] as const) {
      const { source } = variants[name];
      if (source?.kind !== 'temp') continue;
      const { pathname } = source.temp;
      if (!previews.has(pathname)) previews.set(pathname, requestTempImagePreview(pathname));
      void previews.get(pathname)!.then((result) => {
        setVariant(name, (variant) => {
          // Meanwhile replaced (other file, "use desktop image", dialog reopened)?
          if (variant.source !== source) return variant;

          return result.success
            ? { ...variant, sourceUrl: result.data.previewUrl, status: 'decoding' }
            : { ...variant, status: 'error', error: result.error };
        });
      });
    }
  }

  function open() {
    releaseObjectUrls();
    setCropperKey((key) => key + 1);
    setActiveVariant('desktop');
    setAltText(current.alt);
    load(current);
  }

  function close() {
    releaseObjectUrls();
  }

  function reset(publishedValue: ImageValue) {
    releaseObjectUrls();
    setCropperKey((key) => key + 1);
    setAltText(publishedValue.alt);
    load(publishedValue);
  }

  const isMobileView = mobileRules !== undefined && activeVariant === 'mobile';
  const followsDesktop = isMobileView && mobileMode === 'auto';
  const shownName: ImageVariantName = isMobileView && !followsDesktop ? 'mobile' : 'desktop';
  const shown = shownName === 'mobile' ? mobile : desktop;
  const shownAspectRatio = aspectRatioOf(isMobileView ? 'mobile' : 'desktop');
  const desktopCrop = cropOf(desktop, rules.aspectRatio);
  const shownCrop = followsDesktop
    ? desktopCrop && deriveCrop(desktopCrop, shownAspectRatio)
    : cropOf(shown, shownAspectRatio);
  const shownSliders =
    followsDesktop && shownCrop && desktop.dimensions
      ? slidersFromCrop(shownCrop, desktop.dimensions.width, desktop.dimensions.height, shownAspectRatio)
      : shown.sliders;

  function updateSliders(update: (sliders: CropSliders) => CropSliders) {
    if (!followsDesktop) {
      setVariant(shownName, (variant) => ({ ...variant, sliders: update(variant.sliders) }));
      return;
    }
    // The first change of the derived crop makes it the mobile image's own crop of the same image.
    setMobile({ ...desktop, pendingCrop: null, sliders: update(shownSliders) });
    setMobileMode('custom');
  }

  function handleFileSelected(selected: File) {
    const target: ImageVariantName = isMobileView ? 'mobile' : 'desktop';
    if (target === 'mobile') setMobileMode('custom');
    const isAllowedType = ALLOWED_UPLOAD_MIME_TYPES.some((type) => type === selected.type);
    if (!isAllowedType) {
      setVariant(target, () => ({ ...EMPTY_VARIANT, status: 'error', error: translations.image.invalidType }));
      return;
    }
    if (selected.size > MAX_UPLOAD_BYTES) {
      setVariant(target, () => ({
        ...EMPTY_VARIANT,
        status: 'error',
        error: translations.image.tooLarge(Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))),
      }));
      return;
    }
    const url = URL.createObjectURL(selected);
    objectUrlsRef.current.push(url);
    setVariant(target, () => variantFor({ kind: 'file', file: selected, url }));
  }

  function handleImageLoaded(name: ImageVariantName, width: number, height: number) {
    setVariant(name, (variant) => ({
      ...variant,
      dimensions: { width, height },
      sliders: variant.pendingCrop ? slidersFromCrop(variant.pendingCrop, width, height, aspectRatioOf(name)) : variant.sliders,
      pendingCrop: null,
      status: 'ready',
    }));
  }

  function followDesktopImage() {
    setMobileMode('auto');
    setMobile(EMPTY_VARIANT);
  }

  /** Returns the new value of the field – see `buildImageDraft` for what is uploaded when. */
  async function save(): Promise<FieldImageDraft> {
    return buildImageDraft({
      alt: altText,
      desktop: snapshotOf(desktop, rules.aspectRatio),
      mobile: snapshotOf(mobile, aspectRatioOf('mobile')),
      mobileMode,
      mobileAspectRatio: mobileRules?.aspectRatio,
      published,
      current,
      upload: uploadOncePerSource(uploadSource),
    });
  }

  const pannable =
    shownCrop && shown.dimensions ? canPan(shownCrop, shown.dimensions.width, shown.dimensions.height) : { x: false, y: false };

  const cropperProps: ImageCropperProps = {
    aspectRatio: shownAspectRatio,
    sourceUrl: shown.sourceUrl,
    sourceStatus: shown.status,
    sourceError: shown.error,
    crop: shownCrop ?? PLACEHOLDER_CROP,
    canPanX: pannable.x,
    canPanY: pannable.y,
    zoom: shownSliders.zoom,
    panX: shownSliders.panX,
    panY: shownSliders.panY,
    alt: altText,
    variants: mobileRules
      ? {
          active: activeVariant,
          onSelect: setActiveVariant,
          onUseDesktopImage: isMobileView && mobileMode === 'custom' ? followDesktopImage : undefined,
        }
      : undefined,
    onFileSelected: handleFileSelected,
    onImageLoaded: (width, height) => handleImageLoaded(shownName, width, height),
    onZoomChange: (zoom) => updateSliders((sliders) => ({ ...sliders, zoom })),
    onPanXChange: (panX) => updateSliders((sliders) => ({ ...sliders, panX })),
    onPanYChange: (panY) => updateSliders((sliders) => ({ ...sliders, panY })),
    onRotate: () => updateSliders((sliders) => ({ ...sliders, rotation: ((sliders.rotation + 90) % 360) as Rotation })),
    onResetCrop: () => updateSliders(() => IDENTITY_SLIDERS),
    onAltChange: setAltText,
  };

  return { cropperKey, cropperProps, open, close, reset, save };
}
