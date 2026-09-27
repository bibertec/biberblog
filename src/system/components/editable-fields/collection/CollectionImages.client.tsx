'use client';
import { createContext, useContext, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { EditableImageDisplay, type ImageLoadingProps } from '../image/EditableImageDisplay';
import type { ImageFieldRules } from '@/src/project/content/imageFieldRegistry';
import { isTempImageDraft, type ImageDraft } from '@/src/system/content/imageSchema';
import type { ResolvedImages } from '@/src/system/lib/images/loadContentImage';

// Only needed for unpublished drafts (editor mode) – kept out of the bundle for visitors.
const EditableImageDraftPreview = dynamic(
  () => import('../image/EditableImageDraftPreview.client').then((module) => module.EditableImageDraftPreview),
  { ssr: false, loading: () => null },
);

const CollectionImagesContext = createContext<ResolvedImages>({});

/** Provides the image URLs resolved on the server (`loadCollectionImages`) to the items. */
export function CollectionImagesProvider({ images, children }: { images: ResolvedImages; children: ReactNode }) {
  return <CollectionImagesContext value={images}>{children}</CollectionImagesContext>;
}

/**
 * Displayable URL of a published image. Falls back to the plain public path for images that were
 * not resolved on the server (e.g. the placeholder of an item added in the editor).
 */
export function useCollectionImageUrl(src: string): string {
  return useContext(CollectionImagesContext)[src] ?? src;
}

type CollectionImageProps = ImageLoadingProps & {
  /** In editor mode an item can hold an unpublished draft (`TempImageDraft`) instead of `ImageValue`. */
  value: ImageDraft;
  rules: ImageFieldRules;
  className?: string;
  /** Rendered size; defaults to the target size from `imageFieldRegistry`. */
  width?: number;
};

/** Image of a collection item – for the generated `render<Field>Item` callbacks. */
export function CollectionImage({ value, rules, className, width = rules.maxWidth, ...loadingProps }: CollectionImageProps) {
  const height = Math.round(width / rules.aspectRatio);
  const publishedSrc = useCollectionImageUrl(isTempImageDraft(value) ? '' : value.src);

  if (isTempImageDraft(value)) {
    const { crop } = value;
    return (
      <EditableImageDraftPreview
        key={`${value.temp.pathname}:${crop.x}:${crop.y}:${crop.width}:${crop.height}:${crop.rotation}`}
        className={className}
        tempPathname={value.temp.pathname}
        crop={crop}
        width={width}
        height={height}
        alt={value.alt}
      />
    );
  }

  return (
    <EditableImageDisplay
      className={className}
      image={{ src: publishedSrc }}
      rules={{ ...rules, maxWidth: width, maxHeight: height }}
      alt={value.alt}
      {...loadingProps}
    />
  );
}
