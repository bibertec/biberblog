import type { CropData } from '@/src/system/content/imageSchema';

export function paintCropPreview(
  target: HTMLCanvasElement,
  source: HTMLImageElement,
  crop: CropData,
): void {
  const context = target.getContext('2d');
  if (!context) return;
  const rotatedWidth = crop.rotation % 180 === 0 ? source.naturalWidth : source.naturalHeight;
  const rotatedHeight = crop.rotation % 180 === 0 ? source.naturalHeight : source.naturalWidth;
  const rotated = document.createElement('canvas');
  rotated.width = rotatedWidth;
  rotated.height = rotatedHeight;
  const rotatedContext = rotated.getContext('2d');
  if (!rotatedContext) return;
  rotatedContext.translate(rotatedWidth / 2, rotatedHeight / 2);
  rotatedContext.rotate((crop.rotation * Math.PI) / 180);
  rotatedContext.drawImage(source, -source.naturalWidth / 2, -source.naturalHeight / 2);
  context.clearRect(0, 0, target.width, target.height);
  context.drawImage(
    rotated,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    target.width,
    target.height,
  );
}
