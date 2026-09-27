import { after, NextResponse } from 'next/server';
import { issueSignedToken } from '@vercel/blob';
import { handleUploadPresigned, type HandleUploadPresignedBody } from '@vercel/blob/client';
import { checkEditorSession } from '@/src/system/lib/auth/actions';
import { assertTempPathname, cleanupOrphanTempBlobs } from '@/src/system/lib/images/blob';
import { ALLOWED_UPLOAD_MIME_TYPES, MAX_UPLOAD_BYTES } from '@/src/system/content/imageSchema';
import { translations } from '@/src/project/config/translations';

/** `POST /api/editor/image/upload` (route file: `app/api/editor/image/upload/route.ts`). */

const SIGNED_TOKEN_TTL_MS = 5 * 60 * 1000;

export async function POST(request: Request): Promise<NextResponse> {
  const isAuthenticated = await checkEditorSession();
  if (!isAuthenticated) {
    return NextResponse.json({ error: translations.errors.notAuthenticated }, { status: 401 });
  }
  after(() => cleanupOrphanTempBlobs());
  try {
    const body: HandleUploadPresignedBody = await request.json();
    const result = await handleUploadPresigned({
      body,
      request,
      getSignedToken: async (pathname, _clientPayload, multipart) => {
        if (multipart) {
          throw new Error('Multipart uploads are not supported for temporary images.');
        }
        assertTempPathname(pathname);
        const token = await issueSignedToken({
          pathname,
          operations: ['put'],
          allowedContentTypes: [...ALLOWED_UPLOAD_MIME_TYPES],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          validUntil: Date.now() + SIGNED_TOKEN_TTL_MS,
        });

        return { token };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    // The blob client only shows the generic "Failed to retrieve the presigned URL" and drops this
    // response body – log the actual cause (e.g. missing blob credentials) to the server console.
    console.error('[biberblog] Image upload: issuing the presigned URL failed.', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : translations.errors.uploadFailed },
      { status: 400 },
    );
  }
}
