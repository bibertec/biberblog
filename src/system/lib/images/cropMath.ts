import type { CropData } from '@/src/system/content/imageSchema';

export type CropSliders = {
  zoom: number;
  panX: number;
  panY: number;
  rotation: 0 | 90 | 180 | 270;
};

type CropGeometryInput = CropSliders & {
  sourceWidth: number;
  sourceHeight: number;
  aspectRatio: number;
};

function maxCropSize(
  rotatedWidth: number,
  rotatedHeight: number,
  aspectRatio: number,
): {
  maxWidth: number;
  maxHeight: number;
} {
  const sourceRatio = rotatedWidth / rotatedHeight;
  return sourceRatio > aspectRatio
    ? { maxWidth: rotatedHeight * aspectRatio, maxHeight: rotatedHeight }
    : { maxWidth: rotatedWidth, maxHeight: rotatedWidth / aspectRatio };
}

export function computeCrop({
  sourceWidth,
  sourceHeight,
  rotation,
  zoom,
  panX,
  panY,
  aspectRatio,
}: CropGeometryInput): CropData {
  const rotatedWidth = rotation % 180 === 0 ? sourceWidth : sourceHeight;
  const rotatedHeight = rotation % 180 === 0 ? sourceHeight : sourceWidth;
  const { maxWidth, maxHeight } = maxCropSize(rotatedWidth, rotatedHeight, aspectRatio);
  const width = maxWidth / zoom;
  const height = maxHeight / zoom;
  const rangeX = rotatedWidth - width;
  const rangeY = rotatedHeight - height;
  const x = Math.max(0, Math.min(rangeX, (rangeX * (panX + 1)) / 2));
  const y = Math.max(0, Math.min(rangeY, (rangeY * (panY + 1)) / 2));
  return { x, y, width, height, rotation };
}

export function slidersFromCrop(
  crop: CropData,
  sourceWidth: number,
  sourceHeight: number,
  aspectRatio: number,
): CropSliders {
  const rotatedWidth = crop.rotation % 180 === 0 ? sourceWidth : sourceHeight;
  const rotatedHeight = crop.rotation % 180 === 0 ? sourceHeight : sourceWidth;
  const { maxWidth } = maxCropSize(rotatedWidth, rotatedHeight, aspectRatio);
  const zoom = crop.width > 0 ? maxWidth / crop.width : 1;
  const rangeX = rotatedWidth - crop.width;
  const rangeY = rotatedHeight - crop.height;
  const panX = rangeX > 0 ? (crop.x / rangeX) * 2 - 1 : 0;
  const panY = rangeY > 0 ? (crop.y / rangeY) * 2 - 1 : 0;
  return { zoom, panX, panY, rotation: crop.rotation };
}

/** Less than one source pixel of play is no usable panning (also absorbs floating-point noise). */
const MIN_PAN_RANGE = 1;

/**
 * Whether the crop can still move along each axis. It cannot on an axis it already fills completely
 * (e.g. vertically for a landscape photo in a square crop at zoom 1) – the pan slider for that axis
 * would have no effect.
 */
export function canPan(crop: CropData, sourceWidth: number, sourceHeight: number): { x: boolean; y: boolean } {
  const rotatedWidth = crop.rotation % 180 === 0 ? sourceWidth : sourceHeight;
  const rotatedHeight = crop.rotation % 180 === 0 ? sourceHeight : sourceWidth;
  return {
    x: rotatedWidth - crop.width >= MIN_PAN_RANGE,
    y: rotatedHeight - crop.height >= MIN_PAN_RANGE,
  };
}
