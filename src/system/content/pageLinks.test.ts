import { describe, expect, it } from 'vitest';
import { isKnownPagePath, pageLinks } from './pageLinks';
import { pageRegistry } from '@/src/generated/pageRegistry';

describe('pageLinks', () => {
  it('knows every registered page path', () => {
    for (const { pathname } of pageLinks) {
      expect(isKnownPagePath(pathname)).toBe(true);
    }
  });

  it.each(['/does-not-exist', '', 'https://example.com', '/?x=1'])('does not know %s', (href) => {
    expect(isKnownPagePath(href)).toBe(false);
  });

  it('lists exactly the pages of pageRegistry (runtime counterpart of the type check)', () => {
    expect(pageLinks.map((page) => page.pathname).sort()).toEqual(Object.keys(pageRegistry).sort());
  });
});
