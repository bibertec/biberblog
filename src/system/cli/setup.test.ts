import { describe, expect, it } from 'vitest';
import {
  escapeDollarSigns,
  isMissingValue,
  readEnvValue,
  repoFromRemoteUrl,
  setEnvValue,
  unescapeDollarSigns,
} from './setup';

const HASH = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA';

describe('env file helpers', () => {
  const pulled = [
    '# Created by Vercel CLI',
    'BLOB_STORE_ID="store_123"',
    `EDITOR_PASSWORD_HASH="${HASH}"`,
    "export QUOTED='single'",
    '',
  ].join('\n');

  it('reads values without quotes', () => {
    expect(readEnvValue(pulled, 'BLOB_STORE_ID')).toBe('store_123');
    expect(readEnvValue(pulled, 'EDITOR_PASSWORD_HASH')).toBe(HASH);
    expect(readEnvValue(pulled, 'QUOTED')).toBe('single');
    expect(readEnvValue(pulled, 'MISSING')).toBeUndefined();
  });

  it('replaces an existing line in place and keeps everything else', () => {
    const updated = setEnvValue(pulled, 'BLOB_STORE_ID', 'store_456');

    expect(updated.split('\n')).toEqual(pulled.replace('"store_123"', 'store_456').split('\n'));
  });

  it('appends new keys with a trailing newline', () => {
    expect(setEnvValue('A=1\n', 'B', '2')).toBe('A=1\nB=2\n');
    expect(setEnvValue('A=1', 'B', '2')).toBe('A=1\nB=2\n');
    expect(setEnvValue('', 'B', '2')).toBe('B=2\n');
  });

  it.each([
    [undefined, true],
    ['', true],
    ['  ', true],
    ['...', true],
    ['value', false],
  ])('isMissingValue(%j) is %s', (value, expected) => {
    expect(isMissingValue(value)).toBe(expected);
  });
});

describe('escapeDollarSigns', () => {
  it('escapes every $ of a hash and is idempotent', () => {
    const escaped = escapeDollarSigns(HASH);

    expect(escaped).toBe('\\$argon2id\\$v=19\\$m=19456,t=2,p=1\\$c2FsdA\\$aGFzaA');
    expect(escapeDollarSigns(escaped)).toBe(escaped);
    expect(unescapeDollarSigns(escaped)).toBe(HASH);
  });
});

describe('repoFromRemoteUrl', () => {
  it.each([
    ['https://github.com/bibertec/kunde-website.git', { owner: 'bibertec', slug: 'kunde-website' }],
    ['https://github.com/bibertec/kunde-website', { owner: 'bibertec', slug: 'kunde-website' }],
    ['git@github.com:bibertec/kunde.website.git\n', { owner: 'bibertec', slug: 'kunde.website' }],
    ['https://gitlab.com/bibertec/kunde-website.git', undefined],
  ])('%s', (url, expected) => {
    expect(repoFromRemoteUrl(url)).toEqual(expected);
  });
});
