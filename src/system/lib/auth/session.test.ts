import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken, verifySessionToken } from './session';

// Next.js resolves `server-only` itself; outside of Next it is a no-op.
vi.mock('server-only', () => ({}));

const PASSWORD_HASH = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHQ$aGFzaGhhc2hoYXNo';
const SESSION_SECRET = 'test-session-secret';

const REQUIRED_ENV = {
  EDITOR_PASSWORD_HASH: PASSWORD_HASH,
  EDITOR_SESSION_SECRET: SESSION_SECRET,
  GITHUB_TOKEN: 'token',
  VERCEL_GIT_REPO_OWNER: 'owner',
  VERCEL_GIT_REPO_SLUG: 'repo',
  BLOB_STORE_ID: 'store',
  BLOB_WEBHOOK_PUBLIC_KEY: 'key',
  VERCEL_OIDC_TOKEN: 'oidc',
};

function stubEnv(values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) {
    vi.stubEnv(name, value);
  }
}

describe('session token', () => {
  beforeEach(() => {
    stubEnv({ EDITOR_PASSWORD_HASH: PASSWORD_HASH, EDITOR_SESSION_SECRET: SESSION_SECRET });
  });

  it('creates a token of the form <16 hex fingerprint>.<64 hex signature>', () => {
    expect(createSessionToken()).toMatch(/^[0-9a-f]{16}\.[0-9a-f]{64}$/);
  });

  it('accepts a freshly created token', () => {
    expect(verifySessionToken(createSessionToken())).toBe(true);
  });

  it('is deterministic for the same password hash and secret', () => {
    expect(createSessionToken()).toBe(createSessionToken());
  });

  it.each([undefined, null, ''])('rejects an empty token (%s)', (token) => {
    expect(verifySessionToken(token)).toBe(false);
  });

  it('rejects a token with a modified signature', () => {
    const [fingerprint, signature] = createSessionToken().split('.');
    const flipped = signature.slice(0, -1) + (signature.endsWith('0') ? '1' : '0');

    expect(verifySessionToken(`${fingerprint}.${flipped}`)).toBe(false);
  });

  it('rejects a token with an appended character (Buffer.from hex truncation)', () => {
    expect(verifySessionToken(`${createSessionToken()}x`)).toBe(false);
  });

  it('rejects a token with a non-hex signature of the correct length', () => {
    const [fingerprint] = createSessionToken().split('.');

    expect(verifySessionToken(`${fingerprint}.${'z'.repeat(64)}`)).toBe(false);
  });

  it.each(['abc', 'a.b.c', '.'])('rejects a malformed token (%s)', (token) => {
    expect(verifySessionToken(token)).toBe(false);
  });

  it('rejects a token whose fingerprint was replaced', () => {
    const [, signature] = createSessionToken().split('.');

    expect(verifySessionToken(`${'0'.repeat(16)}.${signature}`)).toBe(false);
  });

  it('invalidates existing sessions when the password hash changes', () => {
    const token = createSessionToken();
    vi.stubEnv('EDITOR_PASSWORD_HASH', `${PASSWORD_HASH}-changed`);

    expect(verifySessionToken(token)).toBe(false);
  });

  it('invalidates existing sessions when the session secret changes', () => {
    const token = createSessionToken();
    vi.stubEnv('EDITOR_SESSION_SECRET', 'another-secret');

    expect(verifySessionToken(token)).toBe(false);
  });

  it('throws if a required secret is missing', () => {
    vi.stubEnv('EDITOR_SESSION_SECRET', '');

    expect(() => createSessionToken()).toThrow('Missing environment variable: EDITOR_SESSION_SECRET');
  });
});

describe('isEditorModeConfigured', () => {
  // The "warn only once" flag is module state, so every test gets a fresh module instance.
  async function loadFreshModule() {
    vi.resetModules();

    return import('./session');
  }

  it('returns true when all required variables are set', async () => {
    stubEnv(REQUIRED_ENV);
    const { isEditorModeConfigured } = await loadFreshModule();

    expect(isEditorModeConfigured()).toBe(true);
  });

  it('returns false and names the missing variables', async () => {
    stubEnv({ ...REQUIRED_ENV, GITHUB_TOKEN: '', BLOB_STORE_ID: '' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { isEditorModeConfigured } = await loadFreshModule();

    expect(isEditorModeConfigured()).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('GITHUB_TOKEN, BLOB_STORE_ID');
  });

  it('warns only once per module instance', async () => {
    stubEnv({ ...REQUIRED_ENV, VERCEL_OIDC_TOKEN: '' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { isEditorModeConfigured } = await loadFreshModule();

    isEditorModeConfigured();
    isEditorModeConfigured();

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('does not require VERCEL_OIDC_TOKEN on Vercel (provided per request at runtime there)', async () => {
    stubEnv({ ...REQUIRED_ENV, VERCEL_OIDC_TOKEN: '', VERCEL: '1' });
    const { isEditorModeConfigured } = await loadFreshModule();

    expect(isEditorModeConfigured()).toBe(true);
  });
});
