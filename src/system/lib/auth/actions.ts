'use server';

import { cookies } from 'next/headers';
import { verify } from '@node-rs/argon2';
import {
  createSessionToken,
  verifySessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from './session.ts';
import { translations } from '@/src/project/config/translations';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict' as const,
  path: '/',
  maxAge: SESSION_MAX_AGE_SECONDS,
};

function getPasswordHash(): string {
  const hash = process.env.EDITOR_PASSWORD_HASH;
  if (!hash) throw new Error('Missing environment variable: EDITOR_PASSWORD_HASH');

  return hash;
}

export async function checkEditorSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token || !verifySessionToken(token)) {
    return false;
  }
  cookieStore.set(SESSION_COOKIE_NAME, token, COOKIE_OPTIONS);

  return true;
}

export async function loginEditor(password: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const isValid = await verify(getPasswordHash(), password);
  if (!isValid) {
    return { success: false, error: translations.login.wrongPassword };
  }
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, createSessionToken(), COOKIE_OPTIONS);

  return { success: true };
}

export async function logoutEditor(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
