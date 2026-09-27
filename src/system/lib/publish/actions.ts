'use server';

import { z } from 'zod';
import { pageRegistry } from '@/src/generated/pageRegistry';
import { moduleRegistry } from '@/src/generated/moduleRegistry';
import { pageContentSchema, type PageContent } from '@/src/system/content/pageContentSchema';
import type { ModuleRegistryEntry, PageRegistryEntry } from '@/src/system/content/registryTypes';
import { tempImageDraftSchema, type ImageValue } from '@/src/system/content/imageSchema';
import { SEO_FIELD_ID, seoSchema } from '@/src/system/content/seo';
import {
  imageFieldRegistry,
  imageFieldRegistryKey,
  type ImageFieldRules,
} from '@/src/project/content/imageFieldRegistry';
import { parseDraftKey } from '@/src/system/store/editor-mode';
import { checkEditorSession } from '@/src/system/lib/auth/actions';
import {
  commitFiles,
  type FileChange,
  type FileDelete,
  type FileWrite,
} from '@/src/system/lib/publish/github';
import { readTempBlobBytes, deleteTempBlob, ImageBlobError } from '@/src/system/lib/images/blob';
import { processImageCrop, ImageProcessingError } from '@/src/system/lib/images/process';
import { translations } from '@/src/project/config/translations';

const COMMIT_MESSAGE = 'content: customer update';

/**
 * Only images produced by the publish flow (`/images/<uuid>.webp`) may be deleted when replaced –
 * never the default placeholder or images added by the developer.
 */
const GENERATED_IMAGE_SRC_PATTERN =
  /^\/images\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;

export type PublishResult =
  | {
      success: true;
      commitSha: string;
      /** `true` only on the production deployment – only there does the commit trigger a deployment whose go-live the same domain can observe. */
      trackDeployment: boolean;
    }
  | {
      success: false;
      error: string;
    };

function parseFieldId(fieldId: string): {
  moduleId: string;
  fieldName: string;
} {
  const separatorIndex = fieldId.indexOf('.');
  if (separatorIndex === -1) {
    throw new Error(`Invalid fieldId: "${fieldId}"`);
  }

  return {
    moduleId: fieldId.slice(0, separatorIndex),
    fieldName: fieldId.slice(separatorIndex + 1),
  };
}

function assetIdFromTempPathname(pathname: string): string {
  const withoutPrefix = pathname.slice('temp/'.length);

  return withoutPrefix.slice(0, withoutPrefix.lastIndexOf('.'));
}

/**
 * Validates a merged page and returns the parsed form. This parse result (not the input) is what
 * gets committed, so that unknown keys from drafts never end up in `content.json`.
 */
function validateMergedPage(content: PageContent, repoPath: string): PageContent {
  const page = pageContentSchema.parse(content);
  const registry = moduleRegistry as Record<string, ModuleRegistryEntry>;
  const modules: PageContent['modules'] = {};
  for (const [instanceId, moduleEntry] of Object.entries(page.modules)) {
    const registryEntry = registry[moduleEntry.type];
    if (!registryEntry) {
      throw new Error(
        `${repoPath}: unknown module type "${moduleEntry.type}" (instance "${instanceId}")`,
      );
    }
    modules[instanceId] = {
      type: moduleEntry.type,
      content: registryEntry.schema.parse(moduleEntry.content),
    };
  }

  return { ...page, modules };
}

type ImageWork = {
  files: FileWrite[];
  tempPathnames: string[];
};

async function resolveImageDraft(
  registryKey: string,
  draft: z.infer<typeof tempImageDraftSchema>,
  work: ImageWork,
): Promise<ImageValue> {
  const rules = imageFieldRegistry[registryKey as keyof typeof imageFieldRegistry] as
    | ImageFieldRules
    | undefined;
  if (!rules) {
    throw new Error(`"${registryKey}" is not a known image field.`);
  }
  const bytes = await readTempBlobBytes(draft.temp.pathname);
  if (bytes.length !== draft.temp.size) {
    throw new ImageBlobError(translations.errors.tempImageMismatch);
  }
  const output = await processImageCrop(bytes, draft.crop, rules);
  const finalPath = `/images/${assetIdFromTempPathname(draft.temp.pathname)}.webp`;
  work.files.push({
    repoPath: `public${finalPath}`,
    content: output.toString('base64'),
    encoding: 'base64',
  });
  work.tempPathnames.push(draft.temp.pathname);

  return { src: finalPath, alt: draft.alt };
}

/**
 * Resolves a field draft: an image draft becomes the final `{ src, alt }` value; in a collection
 * (array of items), image drafts in the item fields are resolved the same way. Everything else is
 * taken over as is (and validated later against the module schema).
 */
async function resolveFieldDraft(
  moduleType: string,
  fieldName: string,
  value: unknown,
  work: ImageWork,
): Promise<unknown> {
  const imageDraft = tempImageDraftSchema.safeParse(value);
  if (imageDraft.success) {
    return resolveImageDraft(imageFieldRegistryKey(moduleType, fieldName), imageDraft.data, work);
  }
  if (!Array.isArray(value)) return value;

  // Sequential on purpose: each image is decoded and encoded with sharp, which is memory-hungry.
  const items: unknown[] = [];
  for (const item of value as unknown[]) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      items.push(item);
      continue;
    }
    const resolvedItem: Record<string, unknown> = {};
    for (const [itemFieldName, itemValue] of Object.entries(item)) {
      const itemImageDraft = tempImageDraftSchema.safeParse(itemValue);
      resolvedItem[itemFieldName] = itemImageDraft.success
        ? await resolveImageDraft(
            imageFieldRegistryKey(moduleType, fieldName, itemFieldName),
            itemImageDraft.data,
            work,
          )
        : itemValue;
    }
    items.push(resolvedItem);
  }

  return items;
}

function collectReferencedImageSrcs(value: unknown, result: Set<string>): Set<string> {
  if (Array.isArray(value)) {
    for (const entry of value) collectReferencedImageSrcs(entry, result);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (key === 'src' && typeof entry === 'string') {
        result.add(entry);
      } else {
        collectReferencedImageSrcs(entry, result);
      }
    }
  }

  return result;
}

function obsoleteImageDeletes(
  previousSrcs: string[],
  registry: Record<string, PageRegistryEntry>,
  contentByPathname: Map<string, PageContent>,
): FileDelete[] {
  const referenced = new Set<string>();
  for (const [pathname, entry] of Object.entries(registry)) {
    collectReferencedImageSrcs(contentByPathname.get(pathname) ?? entry.content, referenced);
  }
  const obsolete = new Set(
    previousSrcs.filter((src) => GENERATED_IMAGE_SRC_PATTERN.test(src) && !referenced.has(src)),
  );

  return Array.from(obsolete, (src) => ({ repoPath: `public${src}`, delete: true as const }));
}

export async function publishContent(drafts: Record<string, unknown>): Promise<PublishResult> {
  const isAuthenticated = await checkEditorSession();
  if (!isAuthenticated) {
    return { success: false, error: translations.errors.notAuthenticated };
  }
  const draftEntries = Object.entries(drafts);
  if (draftEntries.length === 0) {
    return { success: false, error: translations.errors.noChanges };
  }
  const registry = pageRegistry as Record<string, PageRegistryEntry>;
  const contentByPathname = new Map<string, PageContent>();
  const imageWork: ImageWork = { files: [], tempPathnames: [] };
  // Every image the changed fields referenced before – deleted if generated and no longer used.
  const previousImageSrcs = new Set<string>();
  try {
    for (const [key, value] of draftEntries) {
      const { pathname, fieldId } = parseDraftKey(key);
      const registryEntry = registry[pathname];
      if (!registryEntry) {
        throw new Error(`Unknown page "${pathname}" (no page in src/project/content/)`);
      }
      if (!contentByPathname.has(pathname)) {
        contentByPathname.set(pathname, structuredClone(registryEntry.content));
      }
      const content = contentByPathname.get(pathname)!;
      if (fieldId === SEO_FIELD_ID) {
        content.seo = seoSchema.parse(value);
        continue;
      }
      const { moduleId, fieldName } = parseFieldId(fieldId);
      const moduleEntry = content.modules[moduleId];
      if (!moduleEntry) {
        throw new Error(`${pathname}: module instance "${moduleId}" does not exist`);
      }
      const moduleContent = moduleEntry.content as Record<string, unknown>;
      collectReferencedImageSrcs(moduleContent[fieldName], previousImageSrcs);
      moduleContent[fieldName] = await resolveFieldDraft(moduleEntry.type, fieldName, value, imageWork);
    }
    const contentFiles: FileChange[] = Array.from(contentByPathname.entries()).map(
      ([pathname, content]) => {
        const { repoPath } = registry[pathname];
        const validated = validateMergedPage(content, repoPath);

        return { repoPath, content: JSON.stringify(validated, null, 2) + '\n' };
      },
    );
    const imageDeletes = obsoleteImageDeletes([...previousImageSrcs], registry, contentByPathname);
    const { commitSha } = await commitFiles(
      [...contentFiles, ...imageWork.files, ...imageDeletes],
      COMMIT_MESSAGE,
    );
    await Promise.allSettled(imageWork.tempPathnames.map((pathname) => deleteTempBlob(pathname)));
    return {
      success: true,
      commitSha,
      trackDeployment:
        process.env.VERCEL_ENV === 'production' && Boolean(process.env.VERCEL_GIT_COMMIT_SHA),
    };
  } catch (error) {
    // Image errors are already customer-facing texts; everything else is a technical error that is
    // shown with a generic message plus the detail (helpful when the customer reports it).
    if (error instanceof ImageBlobError || error instanceof ImageProcessingError) {
      return { success: false, error: error.message };
    }
    const detail = error instanceof Error ? error.message : String(error);

    return { success: false, error: translations.errors.publishFailed(detail) };
  }
}
