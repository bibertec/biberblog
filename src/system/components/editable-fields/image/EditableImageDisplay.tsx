import Image, { getImageProps } from 'next/image';
import { preload as preloadResource } from 'react-dom';
import type { CSSProperties } from 'react';
import type { ResolvedImage } from '@/src/system/lib/images/loadContentImage';
import { DESKTOP_IMAGE_MEDIA_QUERY, MOBILE_IMAGE_MEDIA_QUERY, type ImageFieldRules } from '@/src/system/content/imageFieldRules';

/**
 * Loading behavior of a published image. `next/image` rejects `preload` combined with `loading`,
 * so the two are mutually exclusive.
 */
export type ImageLoadingProps =
  | {
      /** `'eager'` for images above the fold. Defaults to `'lazy'`. */
      loading?: 'lazy' | 'eager';
      preload?: false;
    }
  | {
      loading?: never;
      /** Adds `<link rel="preload">` to `<head>` – only for the LCP image (typically the hero). */
      preload: true;
    };

type EditableImageDisplayProps = ImageLoadingProps & {
  className?: string;
  image: ResolvedImage;
  rules: ImageFieldRules;
  alt: string;
};

/** Switches the inline `aspect-ratio` to the mobile format below `md` (see `MOBILE_IMAGE_MEDIA_QUERY`). */
const RESPONSIVE_RATIO_CLASS_NAME =
  '[--editable-image-ratio:var(--editable-image-ratio-desktop)] max-md:[--editable-image-ratio:var(--editable-image-ratio-mobile)]';

export function EditableImageDisplay({ className, image, rules, alt, loading = 'lazy', preload = false }: EditableImageDisplayProps) {
  // The rendered format always follows `imageFieldRegistry`, not the file: an image published under
  // older rules (or the placeholder) is cropped by `objectFit: 'cover'`. `width`/`height` alone are
  // not enough – with `height: auto` (Tailwind preflight) the browser switches to the file's natural
  // ratio once it has loaded. No `width` here: the image keeps its size (`maxWidth`, shrunk to the
  // container) and a width from `className` still applies.
  if (!rules.mobile) {
    return (
      <Image
        src={image.src}
        width={rules.maxWidth}
        height={rules.maxHeight}
        alt={alt}
        preload={preload}
        loading={preload ? undefined : loading}
        className={className}
        style={{ aspectRatio: `${rules.maxWidth} / ${rules.maxHeight}`, objectFit: 'cover' }}
      />
    );
  }

  // Art direction (https://nextjs.org/docs/app/api-reference/components/image#art-direction): the
  // browser downloads only the source that matches the viewport. Until the field is published with
  // a mobile variant, the desktop file is used in the mobile format (cropped like the derived crop).
  const { mobile } = rules;
  const loadingProps = preload ? { preload: true } : { loading };
  const { props: mobileProps } = getImageProps({
    src: image.mobileSrc ?? image.src,
    width: mobile.maxWidth,
    height: mobile.maxHeight,
    alt,
  });
  const { props } = getImageProps({ src: image.src, width: rules.maxWidth, height: rules.maxHeight, alt, ...loadingProps });
  if (preload) {
    // `getImageProps` does not insert the preload of `next/image` – one per variant here. The media
    // queries make the browser fetch only the matching one.
    preloadResource(mobileProps.src, { as: 'image', imageSrcSet: mobileProps.srcSet, media: MOBILE_IMAGE_MEDIA_QUERY });
    preloadResource(props.src, { as: 'image', imageSrcSet: props.srcSet, media: DESKTOP_IMAGE_MEDIA_QUERY });
  }
  // The aspect ratio stays inline (it overrides an `aspect-*` class, as for a single image); only the
  // variable it reads switches with the breakpoint.
  const style = {
    ...props.style,
    '--editable-image-ratio-desktop': `${rules.maxWidth} / ${rules.maxHeight}`,
    '--editable-image-ratio-mobile': `${mobile.maxWidth} / ${mobile.maxHeight}`,
    aspectRatio: `var(--editable-image-ratio, ${rules.maxWidth} / ${rules.maxHeight})`,
    objectFit: 'cover',
  } as CSSProperties;

  // `contents`: in flex and grid layouts the `<img>` stays the item, as without `<picture>`.
  return (
    <picture className="contents">
      <source media={MOBILE_IMAGE_MEDIA_QUERY} srcSet={mobileProps.srcSet} width={mobile.maxWidth} height={mobile.maxHeight} />
      <img {...props} alt={alt} className={`${RESPONSIVE_RATIO_CLASS_NAME} ${className ?? ''}`} style={style} />
    </picture>
  );
}
