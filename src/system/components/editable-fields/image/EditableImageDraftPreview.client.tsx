'use client';

import { useEffect, useRef, useState } from 'react';
import { isTempVariantDraft, type CropData, type ResponsiveImageDraft } from '@/src/system/content/imageSchema';
import { desktopRules, type ImageFieldRules, type ImageVariantRules } from '@/src/system/content/imageFieldRules';
import type { ResolvedImage } from '@/src/system/lib/images/loadContentImage';
import { EditableImageDisplay } from './EditableImageDisplay';
import { paintCropPreview } from '@/src/system/lib/images/cropCanvas';
import { requestTempImagePreview } from '@/src/system/lib/images/actions';
import { translations } from '@/src/project/config/translations';

type EditableImageDraftPreviewProps = {
  className?: string;
  tempPathname: string;
  crop: CropData;
  width: number;
  height: number;
  alt: string;
};

export function EditableImageDraftPreview({
  className,
  tempPathname,
  crop,
  width,
  height,
  alt,
}: EditableImageDraftPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    let cancelled = false;
    void requestTempImagePreview(tempPathname).then((result) => {
      if (cancelled) return;
      if (!result.success) {
        setStatus('error');
        return;
      }
      const image = new window.Image();
      image.onload = () => {
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (canvas) paintCropPreview(canvas, image, crop);
        setStatus('ready');
      };
      image.onerror = () => {
        if (!cancelled) setStatus('error');
      };
      image.src = result.data.previewUrl;
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tempPathname, crop.x, crop.y, crop.width, crop.height, crop.rotation]);

  // Sized like the published `<img>` (Tailwind preflight: `max-width: 100%; height: auto`, which it
  // does not apply to canvas): `width`/`height` are the target size and the aspect ratio, the canvas
  // shrinks to the container. A fixed-size wrapper would overflow narrow layouts.
  return (
    <div className="relative inline-block max-w-full">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        role="img"
        aria-label={alt}
        className={`h-auto max-w-full ${className ?? ''}`}
      />
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-xs text-gray-500">
          {translations.image.previewLoading}
        </div>
      )}
      {status === 'error' && (
        <div
          role="alert"
          className="absolute inset-0 flex items-center justify-center bg-red-50 text-xs text-red-600"
        >
          {translations.image.previewFailed}
        </div>
      )}
    </div>
  );
}

function cropKey(variant: { temp: { pathname: string }; crop: CropData }): string {
  const { crop } = variant;

  return `${variant.temp.pathname}:${crop.x}:${crop.y}:${crop.width}:${crop.height}:${crop.rotation}`;
}

type ResponsiveImageDraftPreviewProps = {
  className?: string;
  draft: ResponsiveImageDraft;
  /** The published files – shown for a variant the draft keeps as is (`{ src }`). */
  image: ResolvedImage;
  rules: ImageFieldRules & { mobile: ImageVariantRules };
};

/**
 * Live preview of a field with a mobile variant: follows the viewport like the published
 * `<picture>` – the desktop variant from `md` up, the mobile one below.
 */
export function ResponsiveImageDraftPreview({ className, draft, image, rules }: ResponsiveImageDraftPreviewProps) {
  const variants = [
    { name: 'desktop', variant: draft.desktop, rules: desktopRules(rules), src: image.src, wrapper: 'max-md:hidden' },
    { name: 'mobile', variant: draft.mobile, rules: rules.mobile, src: image.mobileSrc ?? image.src, wrapper: 'md:hidden' },
  ] as const;

  return (
    <>
      {variants.map(({ name, variant, rules: variantRules, src, wrapper }) => (
        <div key={name} className={wrapper}>
          {isTempVariantDraft(variant) ? (
            <EditableImageDraftPreview
              key={cropKey(variant)}
              className={className}
              tempPathname={variant.temp.pathname}
              crop={variant.crop}
              width={variantRules.maxWidth}
              height={variantRules.maxHeight}
              alt={draft.alt}
            />
          ) : (
            <EditableImageDisplay className={className} image={{ src }} rules={variantRules} alt={draft.alt} />
          )}
        </div>
      ))}
    </>
  );
}
