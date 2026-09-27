'use server';

import { checkEditorSession } from '@/src/system/lib/auth/actions';
import { deleteTempBlob, issueTempPreviewUrl, ImageBlobError } from './blob';
import { translations } from '@/src/project/config/translations';

export type TempImagePreview = {
  previewUrl: string;
};

export type TempImagePreviewResult =
  | {
      success: true;
      data: TempImagePreview;
    }
  | {
      success: false;
      error: string;
    };

export async function requestTempImagePreview(
  tempPathname: string,
): Promise<TempImagePreviewResult> {
  const isAuthenticated = await checkEditorSession();
  if (!isAuthenticated) {
    return { success: false, error: translations.errors.notAuthenticated };
  }
  try {
    const previewUrl = await issueTempPreviewUrl(tempPathname);
    return { success: true, data: { previewUrl } };
  } catch (error) {
    if (error instanceof ImageBlobError) {
      return { success: false, error: error.message };
    }
    return { success: false, error: translations.errors.previewFailed };
  }
}

export async function discardTempImage(tempPathname: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const isAuthenticated = await checkEditorSession();
  if (!isAuthenticated) {
    return { success: false, error: translations.errors.notAuthenticated };
  }
  try {
    await deleteTempBlob(tempPathname);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof ImageBlobError ? error.message : translations.errors.discardFailed,
    };
  }
}
