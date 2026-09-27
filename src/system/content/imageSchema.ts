import { z } from 'zod';

export const repositoryImagePathSchema = z
  .string()
  .regex(/^\/images\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.webp$/, 'Invalid image path');

export const imageValueSchema = z.object({
  src: repositoryImagePathSchema,
  alt: z.string().trim().min(1),
});

export type ImageValue = z.infer<typeof imageValueSchema>;

export const cropSchema = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
});

export type CropData = z.infer<typeof cropSchema>;

export const ALLOWED_UPLOAD_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedUploadMimeType = (typeof ALLOWED_UPLOAD_MIME_TYPES)[number];

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const tempImageDraftSchema = z.object({
  alt: z.string().trim().min(1),
  crop: cropSchema,
  temp: z.object({
    pathname: z
      .string()
      .regex(/^temp\/[a-zA-Z0-9_-]+\.(?:jpe?g|png|webp)$/, 'Invalid temporary image path'),
    mimeType: z.enum(ALLOWED_UPLOAD_MIME_TYPES),
    size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  }),
});

export type TempImageDraft = z.infer<typeof tempImageDraftSchema>;

/**
 * The value of an image while editing: either a newly uploaded/re-cropped image (`TempImageDraft`,
 * processed on publish) or a published image, possibly with a changed alt text (`ImageValue`, taken
 * over as is on publish – no WEBP re-encoding).
 */
export type ImageDraft = TempImageDraft | ImageValue;

export function isTempImageDraft(value: ImageDraft | undefined): value is TempImageDraft {
  return value !== undefined && 'temp' in value;
}
