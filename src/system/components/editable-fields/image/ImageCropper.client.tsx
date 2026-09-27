'use client';

import { useEffect, useRef } from 'react';
import { MoveHorizontal, MoveVertical, ZoomIn } from 'lucide-react';
import type { CropData } from '@/src/system/content/imageSchema';
import { ALLOWED_UPLOAD_MIME_TYPES, MAX_UPLOAD_BYTES } from '@/src/system/content/imageSchema';
import { paintCropPreview } from '@/src/system/lib/images/cropCanvas';
import { Input } from '@/src/system/components/forms/Input';
import { translations } from '@/src/project/config/translations';

const PREVIEW_WIDTH = 480;
const BUTTON_CLASS_NAME = 'rounded-xl border px-3 py-1.5 text-sm disabled:opacity-40';
// Tailwind has no writing-mode utility; `vertical-lr` is the standard way to render a vertical range
// input (min at the top – `dir="rtl"` flips it so the min is at the bottom). `touch-none` keeps a
// vertical drag on the slider from scrolling the dialog content instead.
const VERTICAL_SLIDER_CLASS_NAME = 'min-h-0 w-full flex-1 touch-none accent-accent [writing-mode:vertical-lr]';

export type ImageCropperProps = {
  aspectRatio: number;
  sourceUrl: string | undefined;
  sourceStatus: 'idle' | 'loading' | 'decoding' | 'ready' | 'error';
  sourceError: string | null;
  crop: CropData;
  /** `false`: the crop already fills the source on that axis – the pan slider is disabled. */
  canPanX: boolean;
  canPanY: boolean;
  zoom: number;
  panX: number;
  panY: number;
  alt: string;
  onFileSelected: (file: File) => void;
  onImageLoaded: (width: number, height: number) => void;
  onZoomChange: (zoom: number) => void;
  onPanXChange: (panX: number) => void;
  onPanYChange: (panY: number) => void;
  onRotate: () => void;
  onResetCrop: () => void;
  onAltChange: (alt: string) => void;
};

export function ImageCropper({
  aspectRatio,
  sourceUrl,
  sourceStatus,
  sourceError,
  crop,
  canPanX,
  canPanY,
  zoom,
  panX,
  panY,
  alt,
  onFileSelected,
  onImageLoaded,
  onZoomChange,
  onPanXChange,
  onPanYChange,
  onRotate,
  onResetCrop,
  onAltChange,
}: ImageCropperProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!sourceUrl) return;
    const image = new window.Image();
    imageRef.current = null;
    // The stage stays mounted while the new source loads – don't show the previous image meanwhile.
    const canvas = canvasRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    image.onload = () => {
      imageRef.current = image;
      onImageLoaded(image.naturalWidth, image.naturalHeight);
    };
    image.src = sourceUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceUrl]);
  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;
    paintCropPreview(canvas, image, crop);
  }, [crop]);
  const previewHeight = Math.round(PREVIEW_WIDTH / aspectRatio);
  const isReady = sourceStatus === 'ready';
  // Preview and controls are rendered while loading, too (disabled), so the dialog keeps its height.
  const showStage = sourceStatus === 'loading' || sourceStatus === 'decoding' || isReady;
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <input
          ref={fileInputRef}
          type="file"
          hidden
          accept={ALLOWED_UPLOAD_MIME_TYPES.join(',')}
          onChange={(event) => {
            const selected = event.target.files?.[0];
            if (selected) onFileSelected(selected);
            event.target.value = '';
          }}
        />
        <button type="button" onClick={() => fileInputRef.current?.click()} className={BUTTON_CLASS_NAME}>
          {translations.image.chooseFile}
        </button>
        <p className="text-xs text-gray-500">
          {translations.image.allowedFormats(Math.round(MAX_UPLOAD_BYTES / (1024 * 1024)))}
        </p>
      </div>

      {sourceStatus === 'error' && (
        <p role="alert" className="text-sm text-red-600">
          {sourceError ?? translations.image.loadFailed}
        </p>
      )}

      {showStage && (
        <>
          {/*
            Preview framed by its sliders: zoom on the left, vertical pan on the right, horizontal pan
            below. Side columns use w-5 (w-12 for coarse pointers) + gap-2; matching margins align
            the horizontal control with the preview. Touch targets grow without scaling the native
            slider appearance. The vertical sliders span the preview height. The preview
            is always a square stage, so the sliders keep the same length for every field format;
            `object-contain` letterboxes the crop inside it (bars left/right for portrait, top/bottom
            for landscape).
          */}
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <div className={`flex w-5 shrink-0 flex-col items-center gap-2 pointer-coarse:w-12 ${isReady ? '' : 'opacity-40'}`}>
                <ZoomIn size={20} aria-hidden />
                <input
                  type="range"
                  dir="rtl"
                  disabled={!isReady}
                  aria-label={translations.image.zoom}
                  min={1}
                  max={4}
                  step={0.01}
                  value={zoom}
                  onChange={(event) => onZoomChange(Number(event.target.value))}
                  className={VERTICAL_SLIDER_CLASS_NAME}
                />
              </div>
              <div className="relative min-w-0 flex-1 self-start">
                <canvas
                  ref={canvasRef}
                  width={PREVIEW_WIDTH}
                  height={previewHeight}
                  aria-label={translations.image.cropPreview}
                  className="block aspect-square w-full rounded-xl border bg-foreground/20 object-contain"
                />
                {!isReady && (
                  <p className="absolute inset-0 flex items-center justify-center text-sm">
                    {translations.image.loading}
                  </p>
                )}
              </div>
              <div className={`flex w-5 shrink-0 flex-col items-center gap-2 pointer-coarse:w-12 ${canPanY ? '' : 'opacity-40'}`}>
                <MoveVertical size={20} aria-hidden />
                <input
                  type="range"
                  disabled={!canPanY}
                  aria-label={translations.image.panVertical}
                  min={-1}
                  max={1}
                  step={0.01}
                  value={panY}
                  onChange={(event) => onPanYChange(Number(event.target.value))}
                  className={VERTICAL_SLIDER_CLASS_NAME}
                />
              </div>
            </div>
            <div className={`mx-7 flex items-center gap-2 pointer-coarse:mx-14 ${canPanX ? '' : 'opacity-40'}`}>
              <input
                type="range"
                disabled={!canPanX}
                aria-label={translations.image.panHorizontal}
                min={-1}
                max={1}
                step={0.01}
                value={panX}
                onChange={(event) => onPanXChange(Number(event.target.value))}
                className="min-w-0 flex-1 touch-none accent-accent pointer-coarse:h-12"
              />
              <MoveHorizontal size={20} aria-hidden className="shrink-0" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onRotate} disabled={!isReady} className={BUTTON_CLASS_NAME}>
              {translations.image.rotate}
            </button>
            <button type="button" onClick={onResetCrop} disabled={!isReady} className={BUTTON_CLASS_NAME}>
              {translations.image.resetCrop}
            </button>
          </div>
        </>
      )}

      <label className="flex flex-col gap-1 text-sm">
        {translations.image.altText}
        <Input
          type="text"
          value={alt}
          onChange={(event) => onAltChange(event.target.value)}
          aria-describedby="image-alt-help"
        />
        <span id="image-alt-help" className="text-xs text-gray-500">
          {translations.image.altTextHelp}
        </span>
      </label>
    </div>
  );
}
