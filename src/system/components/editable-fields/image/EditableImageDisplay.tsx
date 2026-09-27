import Image from 'next/image';
import type { ResolvedImage } from '@/src/system/lib/images/loadContentImage';
import type { ImageFieldRules } from '@/src/project/content/imageFieldRegistry';

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

export function EditableImageDisplay({ className, image, rules, alt, loading = 'lazy', preload = false }: EditableImageDisplayProps) {
  return (
    <Image
      src={image.src}
      width={rules.maxWidth}
      height={rules.maxHeight}
      alt={alt}
      preload={preload}
      loading={preload ? undefined : loading}
      className={className}
      style={{ objectFit: 'cover' }}
    />
  );
}
