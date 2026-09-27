import { describe, expect, it } from 'vitest';
import { pageMetadata } from './seo';

describe('pageMetadata', () => {
  it('returns title and description', () => {
    expect(pageMetadata({ seo: { title: 'About us', description: 'Who we are' } })).toEqual({
      title: 'About us',
      description: 'Who we are',
    });
  });

  it('omits empty values so the layout defaults apply', () => {
    expect(pageMetadata({ seo: { title: '  ', description: '' } })).toEqual({});
  });

  it('trims the values', () => {
    expect(pageMetadata({ seo: { title: ' About ', description: ' Text ' } })).toEqual({
      title: 'About',
      description: 'Text',
    });
  });
});
