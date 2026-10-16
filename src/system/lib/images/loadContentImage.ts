import type { StaticImageData } from 'next/image';
import {
  imageValueSchema,
  repositoryImagePathSchema,
  type ImageValue,
} from '@/src/system/content/imageSchema';

export type ResolvedImage = {
  src: string;
  /** Hash-versioned URL of the mobile file – only if the value has one (`value.mobile`). */
  mobileSrc?: string;
};

/** Published `src` (`/images/<name>.webp`) → hash-versioned URL, for the images of a collection. */
export type ResolvedImages = Record<string, string>;

async function resolveImageSrc(value: string): Promise<string> {
  const src = repositoryImagePathSchema.parse(value);
  const filename = src.slice('/images/'.length, -'.webp'.length);
  const {
    default: image,
  }: {
    default: StaticImageData;
  } = await import(`../../../../public/images/${filename}.webp`);
  return image.src;
}

export async function loadContentImage(value: ImageValue): Promise<ResolvedImage> {
  const [src, mobileSrc] = await Promise.all([
    resolveImageSrc(value.src),
    value.mobile ? resolveImageSrc(value.mobile.src) : undefined,
  ]);

  return mobileSrc ? { src, mobileSrc } : { src };
}

/**
 * Resolves the images of the given item fields of a collection. The module component (Server
 * Component) passes the result to the collection, whose items are rendered on the client.
 */
export async function loadCollectionImages<TItem extends Record<string, unknown>>(
  items: readonly TItem[],
  imageFieldNames: readonly (keyof TItem & string)[],
): Promise<ResolvedImages> {
  const srcs = new Set<string>();
  for (const item of items) {
    for (const fieldName of imageFieldNames) {
      const image = imageValueSchema.safeParse(item[fieldName]);
      if (image.success) srcs.add(image.data.src);
    }
  }
  const entries = await Promise.all(
    Array.from(srcs, async (src) => [src, (await loadContentImage({ src, alt: '' })).src] as const),
  );

  return Object.fromEntries(entries);
}
