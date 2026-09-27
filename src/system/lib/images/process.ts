import 'server-only';
import sharp from 'sharp';
import type { CropData } from '../../content/imageSchema';
import type { ImageFieldRules } from '@/src/project/content/imageFieldRegistry';
import { translations } from '@/src/project/config/translations';

const WEBP_QUALITY = 80;

const MAX_INPUT_PIXELS = 268402689;

const ASPECT_RATIO_TOLERANCE = 0.001;

export class ImageProcessingError extends Error {}

export function assertCropAspectRatio(crop: CropData, rules: ImageFieldRules): void {
  const actualRatio = crop.width / crop.height;
  if (Math.abs(actualRatio - rules.aspectRatio) > ASPECT_RATIO_TOLERANCE) {
    throw new ImageProcessingError(translations.errors.cropFormatMismatch);
  }
}

export async function processImageCrop(
  input: Buffer,
  crop: CropData,
  rules: ImageFieldRules,
): Promise<Buffer> {
  assertCropAspectRatio(crop, rules);
  try {
    // autoOrient: browsers display (and crop in canvas) images EXIF-corrected – without this step
    // the crop coordinates would not match the raw pixels of smartphone photos.
    // According to the sharp docs, the editorial rotation (`rotate`) always applies AFTER auto-orientation.
    return await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
      .autoOrient()
      .rotate(crop.rotation)
      .extract({
        left: Math.round(crop.x),
        top: Math.round(crop.y),
        width: Math.round(crop.width),
        height: Math.round(crop.height),
      })
      .resize({
        width: rules.maxWidth,
        height: rules.maxHeight,
      })
      .toColorspace('srgb')
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch (error) {
    if (error instanceof ImageProcessingError) throw error;
    throw new ImageProcessingError(
      translations.errors.cropFailed(error instanceof Error ? error.message : String(error)),
    );
  }
}
