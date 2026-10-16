import { z } from 'zod';

export const repositoryImagePathSchema = z
  .string()
  .regex(/^\/images\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.webp$/, 'Invalid image path');

/**
 * Where the mobile image of a field comes from: `auto` – derived from the desktop image (regenerated
 * whenever it changes), `custom` – chosen or cropped by the customer (kept when the desktop image
 * changes).
 */
export const mobileImageModeSchema = z.enum(['auto', 'custom']);

export type MobileImageMode = z.infer<typeof mobileImageModeSchema>;

export const imageValueSchema = z.object({
  src: repositoryImagePathSchema,
  alt: z.string().trim().min(1),
  /** Only for fields with a mobile variant (`imageFieldRegistry`); missing before the first publish. */
  mobile: z
    .object({
      src: repositoryImagePathSchema,
      mode: mobileImageModeSchema,
    })
    .optional(),
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

export const tempImageSchema = z.object({
  pathname: z
    .string()
    .regex(/^temp\/[a-zA-Z0-9_-]+\.(?:jpe?g|png|webp)$/, 'Invalid temporary image path'),
  mimeType: z.enum(ALLOWED_UPLOAD_MIME_TYPES),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});

export type TempImage = z.infer<typeof tempImageSchema>;

export const tempImageDraftSchema = z.object({
  alt: z.string().trim().min(1),
  crop: cropSchema,
  temp: tempImageSchema,
});

export type TempImageDraft = z.infer<typeof tempImageDraftSchema>;

/** One variant of a `ResponsiveImageDraft`: a new crop of an uploaded original … */
const tempVariantDraftSchema = z.object({
  temp: tempImageSchema,
  crop: cropSchema,
});

/** … or the published file of that variant, kept as is. */
const publishedVariantDraftSchema = z.object({
  src: repositoryImagePathSchema,
});

/**
 * The draft of a field with a mobile variant as soon as one of its two files has to be (re)generated.
 * Desktop and mobile may share the same temp blob (the same upload, cropped twice).
 */
export const responsiveImageDraftSchema = z.object({
  alt: z.string().trim().min(1),
  desktop: z.union([tempVariantDraftSchema, publishedVariantDraftSchema]),
  mobile: z.union([
    tempVariantDraftSchema.extend({ mode: mobileImageModeSchema }),
    publishedVariantDraftSchema.extend({ mode: mobileImageModeSchema }),
  ]),
});

export type ResponsiveImageDraft = z.infer<typeof responsiveImageDraftSchema>;
export type VariantDraft = ResponsiveImageDraft['desktop'];

/**
 * The value of an image while editing: either a newly uploaded/re-cropped image (`TempImageDraft`,
 * processed on publish) or a published image, possibly with a changed alt text (`ImageValue`, taken
 * over as is on publish – no WEBP re-encoding).
 */
export type ImageDraft = TempImageDraft | ImageValue;

/** The value of a top-level image field while editing – fields with a mobile variant use `ResponsiveImageDraft`. */
export type FieldImageDraft = ImageDraft | ResponsiveImageDraft;

export function isTempImageDraft(value: FieldImageDraft | undefined): value is TempImageDraft {
  return value !== undefined && 'temp' in value;
}

export function isResponsiveImageDraft(value: FieldImageDraft | undefined): value is ResponsiveImageDraft {
  return value !== undefined && 'desktop' in value;
}

export function isTempVariantDraft<T extends VariantDraft>(variant: T): variant is Extract<T, { temp: TempImage }> {
  return 'temp' in variant;
}

/** Temp blobs an image draft refers to (any draft value; non-image values have none). */
export function tempPathnamesOf(value: unknown): string[] {
  const temp = tempImageDraftSchema.safeParse(value);
  if (temp.success) return [temp.data.temp.pathname];
  const responsive = responsiveImageDraftSchema.safeParse(value);
  if (!responsive.success) return [];
  const pathnames = [responsive.data.desktop, responsive.data.mobile].flatMap((variant) =>
    isTempVariantDraft(variant) ? [variant.temp.pathname] : [],
  );

  return [...new Set(pathnames)];
}

export function isSameImageValue(a: ImageValue, b: ImageValue): boolean {
  return a.src === b.src && a.alt === b.alt && a.mobile?.src === b.mobile?.src && a.mobile?.mode === b.mobile?.mode;
}
