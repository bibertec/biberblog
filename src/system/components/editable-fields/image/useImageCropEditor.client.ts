'use client';

import { useEffect, useRef, useState } from 'react';
import { uploadPresigned } from '@vercel/blob/client';
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  type AllowedUploadMimeType,
  isTempImageDraft,
  type CropData,
  type ImageDraft,
  type ImageValue,
  type TempImageDraft,
} from '@/src/system/content/imageSchema';
import type { ImageFieldRules } from '@/src/project/content/imageFieldRegistry';
import { canPan, computeCrop, slidersFromCrop } from '@/src/system/lib/images/cropMath';
import { requestTempImagePreview } from '@/src/system/lib/images/actions';
import { translations } from '@/src/project/config/translations';
import type { ImageCropperProps } from './ImageCropper.client';

type SourceStatus = ImageCropperProps['sourceStatus'];
type Rotation = CropData['rotation'];

function isUntouchedCrop(zoom: number, panX: number, panY: number, rotation: number): boolean {
  return zoom === 1 && panX === 0 && panY === 0 && rotation === 0;
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

type UseImageCropEditorOptions = {
  /** The value the dialog starts from (published image or existing draft). */
  current: ImageDraft;
  /** Displayable URL of `current` if it is a published image. */
  currentImageUrl: string;
  rules: ImageFieldRules;
};

/**
 * State and logic of the image dialog (file selection, crop sliders, alt text, upload), shared by
 * the top-level image field and image fields inside collection items. The caller decides where the
 * result of `save()` goes (store draft or collection item).
 */
export function useImageCropEditor({ current, currentImageUrl, rules }: UseImageCropEditorOptions) {
  const currentTemp = isTempImageDraft(current) ? current : undefined;
  const currentPublished = isTempImageDraft(current) ? undefined : current;
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | undefined>(undefined);
  const [sourceStatus, setSourceStatus] = useState<SourceStatus>('idle');
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [sourceDimensions, setSourceDimensions] = useState<{ width: number; height: number } | null>(null);
  const [altText, setAltText] = useState(current.alt);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [rotation, setRotation] = useState<Rotation>(0);
  // New key per opening: remounts the cropper so it loads the source image again, even if the
  // URL is the same as last time (otherwise a reopened dialog would hang in the loading state).
  const [cropperKey, setCropperKey] = useState(0);
  const objectUrlRef = useRef<string | null>(null);
  const slidersInitializedRef = useRef(false);

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  function releaseObjectUrl() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }

  function resetCrop() {
    setZoom(1);
    setPanX(0);
    setPanY(0);
    setRotation(0);
  }

  function open() {
    setCropperKey((key) => key + 1);
    setFile(null);
    setAltText(current.alt);
    setSourceDimensions(null);
    setSourceError(null);
    slidersInitializedRef.current = false;
    if (currentTemp) {
      setSourceStatus('loading');
      void requestTempImagePreview(currentTemp.temp.pathname).then((result) => {
        if (result.success) {
          setSourceUrl(result.data.previewUrl);
          setSourceStatus('decoding');
        } else {
          setSourceStatus('error');
          setSourceError(result.error);
        }
      });
    } else {
      resetCrop();
      setSourceUrl(currentImageUrl);
      setSourceStatus('decoding');
    }
  }

  function close() {
    releaseObjectUrl();
    setFile(null);
  }

  /**
   * Back to the published image after "reset to original". The dialog stays open, so the published
   * image is loaded into the cropper again (new key: its URL may be the one already shown).
   */
  function reset(alt: string) {
    close();
    setCropperKey((key) => key + 1);
    setAltText(alt);
    setSourceDimensions(null);
    setSourceError(null);
    resetCrop();
    // The reverted draft's crop must not be applied to the published image.
    slidersInitializedRef.current = true;
    setSourceUrl(currentImageUrl);
    setSourceStatus('decoding');
  }

  function handleFileSelected(selected: File) {
    const isAllowedType = ALLOWED_UPLOAD_MIME_TYPES.some((type) => type === selected.type);
    if (!isAllowedType) {
      setSourceStatus('error');
      setSourceError(translations.image.invalidType);
      return;
    }
    if (selected.size > MAX_UPLOAD_BYTES) {
      setSourceStatus('error');
      setSourceError(translations.image.tooLarge(Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))));
      return;
    }
    releaseObjectUrl();
    const url = URL.createObjectURL(selected);
    objectUrlRef.current = url;
    slidersInitializedRef.current = true;
    setFile(selected);
    setSourceDimensions(null);
    resetCrop();
    setSourceUrl(url);
    setSourceStatus('decoding');
    setSourceError(null);
  }

  function handleImageLoaded(width: number, height: number) {
    setSourceDimensions({ width, height });
    if (currentTemp && !slidersInitializedRef.current) {
      const sliders = slidersFromCrop(currentTemp.crop, width, height, rules.aspectRatio);
      setZoom(sliders.zoom);
      setPanX(sliders.panX);
      setPanY(sliders.panY);
      setRotation(sliders.rotation);
    }
    slidersInitializedRef.current = true;
    setSourceStatus('ready');
  }

  function cropFor(dimensions: { width: number; height: number }): CropData {
    return computeCrop({
      sourceWidth: dimensions.width,
      sourceHeight: dimensions.height,
      rotation,
      zoom,
      panX,
      panY,
      aspectRatio: rules.aspectRatio,
    });
  }

  /**
   * Returns the new value. Uploads only if necessary:
   * - existing temp draft without a new file → reuses the uploaded original with the new crop/alt;
   * - published image with untouched crop → `{ src, alt }` (only the alt text changes);
   * - otherwise the new file (or the published WEBP for a new crop) is uploaded as a temp blob.
   */
  async function save(): Promise<ImageDraft> {
    const trimmedAlt = altText.trim();
    if (!trimmedAlt) {
      throw new Error(translations.image.altTextRequired);
    }
    if (sourceStatus !== 'ready' || !sourceDimensions || !sourceUrl) {
      throw new Error(translations.image.notReady);
    }
    const nextCrop = cropFor(sourceDimensions);
    if (!file && currentTemp) {
      return { ...currentTemp, alt: trimmedAlt, crop: nextCrop } satisfies TempImageDraft;
    }
    if (!file && currentPublished && isUntouchedCrop(zoom, panX, panY, rotation)) {
      return { src: currentPublished.src, alt: trimmedAlt } satisfies ImageValue;
    }
    const uploadFile = file ?? (await fetchExistingAsFile(sourceUrl));
    const meta = resolveUploadMeta(uploadFile);
    const pathname = `temp/${crypto.randomUUID()}.${meta.extension}`;
    await uploadPresigned(pathname, uploadFile, {
      access: 'private',
      contentType: meta.mimeType,
      handleUploadUrl: '/api/editor/image/upload',
    });

    return {
      alt: trimmedAlt,
      crop: nextCrop,
      temp: { pathname, mimeType: meta.mimeType, size: uploadFile.size },
    } satisfies TempImageDraft;
  }

  const crop: CropData = sourceDimensions
    ? cropFor(sourceDimensions)
    : { x: 0, y: 0, width: 1, height: 1, rotation: 0 };
  const pannable = sourceDimensions
    ? canPan(crop, sourceDimensions.width, sourceDimensions.height)
    : { x: false, y: false };

  const cropperProps: ImageCropperProps = {
    aspectRatio: rules.aspectRatio,
    sourceUrl,
    sourceStatus,
    sourceError,
    crop,
    canPanX: pannable.x,
    canPanY: pannable.y,
    zoom,
    panX,
    panY,
    alt: altText,
    onFileSelected: handleFileSelected,
    onImageLoaded: handleImageLoaded,
    onZoomChange: setZoom,
    onPanXChange: setPanX,
    onPanYChange: setPanY,
    onRotate: () => setRotation((previous) => ((previous + 90) % 360) as Rotation),
    onResetCrop: resetCrop,
    onAltChange: setAltText,
  };

  return { cropperKey, cropperProps, open, close, reset, save };
}
