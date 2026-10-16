/** Target format of one image variant, fixed by the developer in `imageFieldRegistry.ts`. */
export type ImageVariantRules = {
  aspectRatio: number;
  maxWidth: number;
  maxHeight: number;
};

/**
 * Rules of an image field: the (desktop) format, optionally a mobile variant that applies below
 * Tailwind's `md` breakpoint (`MOBILE_IMAGE_MEDIA_QUERY`). Image item fields of a collection have
 * no mobile variant – a `mobile` entry there is ignored.
 */
export type ImageFieldRules = ImageVariantRules & {
  mobile?: ImageVariantRules;
};

/**
 * Viewports that get the mobile variant: below Tailwind's default `md` breakpoint (48rem = 768 px).
 * Must match the `max-md:` classes in `EditableImageDisplay` and the editor preview.
 */
export const MOBILE_IMAGE_MEDIA_QUERY = '(width < 48rem)';
export const DESKTOP_IMAGE_MEDIA_QUERY = '(width >= 48rem)';

/** The format of a field without its mobile variant (collections, single-variant drafts). */
export function desktopRules(rules: ImageVariantRules): ImageVariantRules {
  return { aspectRatio: rules.aspectRatio, maxWidth: rules.maxWidth, maxHeight: rules.maxHeight };
}
