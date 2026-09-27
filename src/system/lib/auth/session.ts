import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { REQUIRED_EDITOR_ENV_VARS } from '@/src/system/config/envVars';

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

function currentFingerprint(): string {
  const passwordHash = getEnv('EDITOR_PASSWORD_HASH');

  return createHash('sha256').update(passwordHash).digest('hex').slice(0, 16);
}

function sign(payload: string): string {
  const secret = getEnv('EDITOR_SESSION_SECRET');

  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function createSessionToken(): string {
  const fingerprint = currentFingerprint();

  return `${fingerprint}.${sign(fingerprint)}`;
}

const SIGNATURE_HEX_LENGTH = 64;

export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [fingerprint, signature] = parts;
  if (signature.length !== SIGNATURE_HEX_LENGTH) return false;
  if (fingerprint !== currentFingerprint()) return false;
  const expected = Buffer.from(sign(fingerprint), 'hex');
  const actual = Buffer.from(signature, 'hex');
  if (expected.length !== actual.length) return false;

  return timingSafeEqual(actual, expected);
}

export const SESSION_COOKIE_NAME = 'biberblog_editor_session';

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

let hasWarnedAboutMissingEnvVars = false;

/**
 * On Vercel, `VERCEL_OIDC_TOKEN` is only an environment variable during the build. At runtime, functions
 * get the token per request (header `x-vercel-oidc-token`, read by `@vercel/blob` itself). Requiring it
 * in `process.env` there disabled the editor in every runtime render – e.g. the re-render after the
 * server action that refreshes the session cookie, which removed the editor navbar from the page.
 */
function requiredEditorEnvVars(): readonly string[] {
  return process.env.VERCEL
    ? REQUIRED_EDITOR_ENV_VARS.filter((name) => name !== 'VERCEL_OIDC_TOKEN')
    : REQUIRED_EDITOR_ENV_VARS;
}

export function isEditorModeConfigured(): boolean {
  const missing = requiredEditorEnvVars().filter((name) => !process.env[name]);
  if (missing.length > 0) {
    if (!hasWarnedAboutMissingEnvVars) {
      console.warn(
        `[biberblog] Editor mode is disabled, the following environment variables are missing: ${missing.join(', ')}`,
      );
      hasWarnedAboutMissingEnvVars = true;
    }
    return false;
  }

  return true;
}
