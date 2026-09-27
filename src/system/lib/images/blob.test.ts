import { describe, expect, it, vi } from 'vitest';
import { ImageBlobError, assertTempPathname } from './blob';

// Next.js resolves `server-only` itself; outside of Next it is a no-op.
vi.mock('server-only', () => ({}));

describe('assertTempPathname', () => {
  it.each(['temp/aaaaaaaa-0000-4000-8000-000000000001.jpg', 'temp/a.jpeg', 'temp/a_b.png', 'temp/a.webp'])(
    'accepts %s',
    (pathname) => {
      expect(() => assertTempPathname(pathname)).not.toThrow();
    },
  );

  it.each([
    'temp/../images/a.jpg',
    'temp/sub/a.jpg',
    'images/a.jpg',
    '/temp/a.jpg',
    'temp/a.gif',
    'temp/a.jpg.exe',
    'temp/.jpg',
  ])('rejects %s', (pathname) => {
    expect(() => assertTempPathname(pathname)).toThrow(ImageBlobError);
  });
});
