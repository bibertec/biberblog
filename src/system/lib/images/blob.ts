import 'server-only';
import { del, get, list, issueSignedToken, presignUrl } from '@vercel/blob';
import { translations } from '@/src/project/config/translations';

const TEMP_PREFIX = 'temp/';

const TEMP_PATHNAME_PATTERN = /^temp\/[a-zA-Z0-9_-]+\.(?:jpe?g|png|webp)$/;

const ORPHAN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const PREVIEW_URL_TTL_MS = 10 * 60 * 1000;

export class ImageBlobError extends Error {}

export function assertTempPathname(pathname: string): void {
  if (!TEMP_PATHNAME_PATTERN.test(pathname)) {
    throw new ImageBlobError('Invalid temporary image path.');
  }
}

export async function readTempBlobBytes(pathname: string): Promise<Buffer> {
  assertTempPathname(pathname);
  const source = await get(pathname, { access: 'private', useCache: false });
  if (!source || source.statusCode !== 200 || !source.stream) {
    throw new ImageBlobError(translations.errors.tempImageNotFound);
  }

  return Buffer.from(await new Response(source.stream).arrayBuffer());
}

export async function deleteTempBlob(pathname: string): Promise<void> {
  assertTempPathname(pathname);
  try {
    await del(pathname);
  } catch {}
}

export async function issueTempPreviewUrl(pathname: string): Promise<string> {
  assertTempPathname(pathname);
  const token = await issueSignedToken({
    pathname,
    operations: ['get'],
    validUntil: Date.now() + PREVIEW_URL_TTL_MS,
  });
  const { presignedUrl } = await presignUrl(token, {
    operation: 'get',
    pathname,
    access: 'private',
  });

  return presignedUrl;
}

export async function cleanupOrphanTempBlobs(now = Date.now()): Promise<void> {
  let cursor: string | undefined;
  do {
    const result = await list({ prefix: TEMP_PREFIX, limit: 1000, cursor });
    const expired = result.blobs.filter(
      (blob: { uploadedAt: Date }) => now - blob.uploadedAt.getTime() > ORPHAN_MAX_AGE_MS,
    );
    if (expired.length > 0) {
      try {
        await del(expired.map((blob: { url: string }) => blob.url));
      } catch {}
    }
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);
}
