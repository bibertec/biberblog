import { beforeEach, describe, expect, it, vi } from 'vitest';
import { publishContent } from './actions';
import { checkEditorSession } from '@/src/system/lib/auth/actions';
import { commitFiles, type FileChange } from '@/src/system/lib/publish/github';
import { deleteTempBlob, readTempBlobBytes } from '@/src/system/lib/images/blob';
import { ImageProcessingError, processImageCrop } from '@/src/system/lib/images/process';
import { pageRegistry } from '@/src/generated/pageRegistry';
import { translations } from '@/src/project/config/translations';

// Next.js resolves `server-only` itself; outside of Next it is a no-op.
vi.mock('server-only', () => ({}));

// --- Fixtures ---------------------------------------------------------------------------------

// `vi.hoisted`: these values are used inside the (hoisted) `vi.mock` factories below.
const { PLACEHOLDER, GENERATED_A, GENERATED_B, GENERATED_C, TEMP_ASSET_ID, TEMP_ASSET_ID_2 } = vi.hoisted(() => ({
  PLACEHOLDER: '/images/placeholder.webp',
  GENERATED_A: '/images/aaaaaaaa-0000-4000-8000-000000000001.webp',
  GENERATED_B: '/images/bbbbbbbb-0000-4000-8000-000000000002.webp',
  GENERATED_C: '/images/dddddddd-0000-4000-8000-000000000004.webp',
  TEMP_ASSET_ID: 'cccccccc-0000-4000-8000-000000000003',
  TEMP_ASSET_ID_2: 'eeeeeeee-0000-4000-8000-000000000005',
}));

vi.mock('@/src/generated/pageRegistry', () => {
  // `members` is a collection whose items have an image field (`photo`).
  const team = (title: string, src: string, memberSrc = '/images/placeholder.webp') => ({
    type: 'Team',
    content: {
      title,
      photo: { src, alt: 'Photo' },
      members: [{ id: 'm1', name: 'Anna', photo: { src: memberSrc, alt: 'Anna' } }],
    },
  });

  return {
    pageRegistry: {
      '/': {
        repoPath: 'src/project/content/home.json',
        content: { label: 'Home', seo: { title: 'Home', description: '' }, modules: { team1: team('Home title', PLACEHOLDER) } },
      },
      '/about': {
        repoPath: 'src/project/content/about.json',
        content: {
          label: 'About',
          seo: { title: 'About', description: '' },
          modules: {
            // team1 and team2 share the same generated image, team3 has its own.
            team1: team('About 1', GENERATED_A),
            team2: team('About 2', GENERATED_A),
            team3: team('About 3', GENERATED_B, GENERATED_C),
          },
        },
      },
    },
  };
});

vi.mock('@/src/generated/moduleRegistry', async () => {
  const { z } = await import('zod');
  const { imageValueSchema } = await import('@/src/system/content/imageSchema');

  return {
    moduleRegistry: {
      Team: {
        schema: z.object({
          title: z.string(),
          photo: imageValueSchema,
          members: z.array(z.object({ id: z.string(), name: z.string(), photo: imageValueSchema })),
        }),
      },
    },
  };
});

vi.mock('@/src/project/content/imageFieldRegistry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/src/project/content/imageFieldRegistry')>()),
  imageFieldRegistry: {
    'Team.photo': { aspectRatio: 1, maxWidth: 100, maxHeight: 100 },
    'Team.members.photo': { aspectRatio: 2, maxWidth: 100, maxHeight: 50 },
  },
}));

vi.mock('@/src/system/lib/auth/actions', () => ({ checkEditorSession: vi.fn() }));

vi.mock('@/src/system/lib/publish/github', () => ({ commitFiles: vi.fn() }));

vi.mock('@/src/system/lib/images/blob', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/src/system/lib/images/blob')>()),
  readTempBlobBytes: vi.fn(),
  deleteTempBlob: vi.fn(),
}));

vi.mock('@/src/system/lib/images/process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/src/system/lib/images/process')>()),
  processImageCrop: vi.fn(),
}));

const TEMP_BYTES = Buffer.from([1, 2, 3, 4]);
const PROCESSED_BYTES = Buffer.from('processed-webp');

function tempImageDraft(overrides: { size?: number; assetId?: string } = {}) {
  const assetId = overrides.assetId ?? TEMP_ASSET_ID;

  return {
    alt: 'New photo',
    crop: { x: 0, y: 0, width: 100, height: 100, rotation: 0 },
    temp: { pathname: `temp/${assetId}.jpg`, mimeType: 'image/jpeg', size: overrides.size ?? TEMP_BYTES.length },
  };
}

const anna = { id: 'm1', name: 'Anna', photo: { src: PLACEHOLDER, alt: 'Anna' } };

// --- Helpers ----------------------------------------------------------------------------------

function committedFiles(): FileChange[] {
  expect(commitFiles).toHaveBeenCalledTimes(1);

  return vi.mocked(commitFiles).mock.calls[0][0];
}

function committedJson(repoPath: string) {
  const file = committedFiles().find((f) => f.repoPath === repoPath);
  if (!file || 'delete' in file) throw new Error(`No content written for ${repoPath}`);

  return JSON.parse(file.content);
}

function deletedPaths(): string[] {
  return committedFiles()
    .filter((f) => 'delete' in f)
    .map((f) => f.repoPath);
}

beforeEach(() => {
  vi.mocked(checkEditorSession).mockReset().mockResolvedValue(true);
  vi.mocked(commitFiles).mockReset().mockResolvedValue({ commitSha: 'sha-123' });
  vi.mocked(readTempBlobBytes).mockReset().mockResolvedValue(TEMP_BYTES);
  vi.mocked(deleteTempBlob).mockReset().mockResolvedValue(undefined);
  vi.mocked(processImageCrop).mockReset().mockResolvedValue(PROCESSED_BYTES);
});

// --- Tests ------------------------------------------------------------------------------------

describe('publishContent: guards', () => {
  it('refuses to publish without a valid session', async () => {
    vi.mocked(checkEditorSession).mockResolvedValue(false);

    const result = await publishContent({ '/::team1.title': 'x' });

    expect(result).toEqual({ success: false, error: translations.errors.notAuthenticated });
    expect(commitFiles).not.toHaveBeenCalled();
  });

  it('refuses to publish without drafts', async () => {
    const result = await publishContent({});

    expect(result).toEqual({ success: false, error: translations.errors.noChanges });
    expect(commitFiles).not.toHaveBeenCalled();
  });

  it.each([
    ['an unknown page', { '/unknown::team1.title': 'x' }, 'Unknown page "/unknown"'],
    ['an unknown module instance', { '/::team9.title': 'x' }, 'module instance "team9" does not exist'],
    ['a malformed draft key', { 'no-separator': 'x' }, 'Invalid draft key'],
    ['a malformed field id', { '/::title': 'x' }, 'Invalid fieldId'],
  ])('rejects %s without committing', async (_, drafts, detail) => {
    const result = await publishContent(drafts);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain(detail);
    expect(commitFiles).not.toHaveBeenCalled();
  });
});

describe('publishContent: merge & validation', () => {
  it('merges a text draft and commits the page in one commit', async () => {
    const result = await publishContent({ '/::team1.title': 'New home title' });

    expect(result).toMatchObject({ success: true, commitSha: 'sha-123' });
    expect(vi.mocked(commitFiles).mock.calls[0][1]).toBe('content: customer update');
    expect(committedFiles().map((f) => f.repoPath)).toEqual(['src/project/content/home.json']);

    const home = committedJson('src/project/content/home.json');
    expect(home.modules.team1.content.title).toBe('New home title');
    // Untouched fields keep their published values.
    expect(home.modules.team1.content.photo).toEqual({ src: PLACEHOLDER, alt: 'Photo' });
    expect(home.modules.team1.content.members).toEqual([anna]);
  });

  it('writes pretty-printed JSON with a trailing newline', async () => {
    await publishContent({ '/::team1.title': 'New' });
    const file = committedFiles()[0];

    expect('content' in file && file.content.endsWith('}\n')).toBe(true);
    expect('content' in file && file.content).toContain('\n  "seo": {');
  });

  it('commits drafts of several pages together in a single commit', async () => {
    await publishContent({ '/::team1.title': 'A', '/about::team2.title': 'B' });

    expect(committedFiles().map((f) => f.repoPath).sort()).toEqual([
      'src/project/content/about.json',
      'src/project/content/home.json',
    ]);
    expect(committedJson('src/project/content/about.json').modules.team2.content.title).toBe('B');
  });

  it('replaces whole collection values (the item array is one draft)', async () => {
    const members = [{ id: 'm2', name: 'Max', photo: { src: PLACEHOLDER, alt: 'Max' } }, anna];
    await publishContent({ '/::team1.members': members });

    expect(committedJson('src/project/content/home.json').modules.team1.content.members).toEqual(members);
  });

  it('does not mutate the bundled registry content (merge works on a clone)', async () => {
    const before = structuredClone(pageRegistry['/'].content);

    await publishContent({ '/::team1.title': 'Changed' });

    expect(pageRegistry['/'].content).toEqual(before);
  });

  it('strips unknown fields and nested keys instead of committing them', async () => {
    await publishContent({
      '/::team1.injected': 'should not be committed',
      '/::team1.members': [{ ...anna, extra: true }],
    });

    const content = committedJson('src/project/content/home.json').modules.team1.content;
    expect(content).not.toHaveProperty('injected');
    expect(content.members).toEqual([anna]);
  });

  it('rejects values that do not match the module schema and commits nothing', async () => {
    const result = await publishContent({ '/::team1.title': 123 });

    expect(result.success).toBe(false);
    if (!result.success) {
      // Technical errors are wrapped in the translated generic message plus the Zod detail.
      expect(result.error.startsWith(translations.errors.publishFailed(''))).toBe(true);
      expect(result.error).toContain('title');
    }
    expect(commitFiles).not.toHaveBeenCalled();
  });

  it('commits nothing if only one of several pages is invalid (all or nothing)', async () => {
    const result = await publishContent({ '/::team1.title': 'valid', '/about::team1.title': 42 });

    expect(result.success).toBe(false);
    expect(commitFiles).not.toHaveBeenCalled();
  });
});

describe('publishContent: SEO', () => {
  it('writes an SEO draft into the seo section of the page', async () => {
    const result = await publishContent({ '/about::seo': { title: 'About us', description: 'Who we are' } });

    expect(result.success).toBe(true);
    const about = committedJson('src/project/content/about.json');
    expect(about.seo).toEqual({ title: 'About us', description: 'Who we are' });
    // Modules stay untouched.
    expect(about.modules.team1.content.title).toBe('About 1');
  });

  it('commits SEO and module drafts of the same page together', async () => {
    await publishContent({ '/::seo': { title: 'Welcome', description: '' }, '/::team1.title': 'New' });

    const home = committedJson('src/project/content/home.json');
    expect(home.seo).toEqual({ title: 'Welcome', description: '' });
    expect(home.modules.team1.content.title).toBe('New');
  });

  it('strips unknown keys from an SEO draft', async () => {
    await publishContent({ '/::seo': { title: 'Welcome', description: '', keywords: 'x' } });

    expect(committedJson('src/project/content/home.json').seo).toEqual({ title: 'Welcome', description: '' });
  });

  it('rejects an invalid SEO draft and commits nothing', async () => {
    const result = await publishContent({ '/::seo': { title: 42 } });

    expect(result.success).toBe(false);
    expect(commitFiles).not.toHaveBeenCalled();
  });
});

describe('publishContent: images', () => {
  it('processes a new image draft and commits it under a new name with the content', async () => {
    await publishContent({ '/::team1.photo': tempImageDraft() });

    expect(readTempBlobBytes).toHaveBeenCalledWith(`temp/${TEMP_ASSET_ID}.jpg`);
    expect(processImageCrop).toHaveBeenCalledWith(TEMP_BYTES, tempImageDraft().crop, {
      aspectRatio: 1,
      maxWidth: 100,
      maxHeight: 100,
    });

    const newSrc = `/images/${TEMP_ASSET_ID}.webp`;
    expect(committedJson('src/project/content/home.json').modules.team1.content.photo).toEqual({
      src: newSrc,
      alt: 'New photo',
    });
    expect(committedFiles()).toContainEqual({
      repoPath: `public${newSrc}`,
      content: PROCESSED_BYTES.toString('base64'),
      encoding: 'base64',
    });
  });

  it('never deletes the shared placeholder when it is replaced', async () => {
    await publishContent({ '/::team1.photo': tempImageDraft() });

    expect(deletedPaths()).toEqual([]);
  });

  it('deletes a replaced generated image that is no longer referenced', async () => {
    await publishContent({ '/about::team3.photo': tempImageDraft() });

    expect(deletedPaths()).toEqual([`public${GENERATED_B}`]);
  });

  it('keeps a replaced generated image that another module still references', async () => {
    await publishContent({ '/about::team1.photo': tempImageDraft() });

    expect(deletedPaths()).toEqual([]);
  });

  it('deletes a shared generated image once when all references are replaced', async () => {
    await publishContent({
      '/about::team1.photo': tempImageDraft(),
      '/about::team2.photo': tempImageDraft(),
    });

    expect(deletedPaths()).toEqual([`public${GENERATED_A}`]);
  });

  it('deletes the temp blob only after a successful commit', async () => {
    await publishContent({ '/::team1.photo': tempImageDraft() });

    expect(deleteTempBlob).toHaveBeenCalledWith(`temp/${TEMP_ASSET_ID}.jpg`);
    expect(vi.mocked(commitFiles).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(deleteTempBlob).mock.invocationCallOrder[0],
    );
  });

  it('keeps the temp blob if the commit fails, so a retry needs no new upload', async () => {
    vi.mocked(commitFiles).mockRejectedValue(new Error('GitHub API error 500'));

    const result = await publishContent({ '/::team1.photo': tempImageDraft() });

    expect(result).toEqual({
      success: false,
      error: translations.errors.publishFailed('GitHub API error 500'),
    });
    expect(deleteTempBlob).not.toHaveBeenCalled();
  });

  it('applies an alt-text-only draft without touching the image', async () => {
    await publishContent({ '/::team1.photo': { src: PLACEHOLDER, alt: 'Better alt text' } });

    expect(readTempBlobBytes).not.toHaveBeenCalled();
    expect(processImageCrop).not.toHaveBeenCalled();
    expect(committedFiles()).toHaveLength(1);
    expect(committedJson('src/project/content/home.json').modules.team1.content.photo).toEqual({
      src: PLACEHOLDER,
      alt: 'Better alt text',
    });
  });

  it('rejects an upload whose size differs from the draft with a customer-facing message', async () => {
    const result = await publishContent({ '/::team1.photo': tempImageDraft({ size: 999 }) });

    expect(result).toEqual({ success: false, error: translations.errors.tempImageMismatch });
    expect(commitFiles).not.toHaveBeenCalled();
  });

  it('passes image processing errors through as customer-facing messages', async () => {
    vi.mocked(processImageCrop).mockRejectedValue(
      new ImageProcessingError(translations.errors.cropFormatMismatch),
    );

    const result = await publishContent({ '/::team1.photo': tempImageDraft() });

    expect(result).toEqual({ success: false, error: translations.errors.cropFormatMismatch });
    expect(commitFiles).not.toHaveBeenCalled();
  });

  it('rejects an image draft for a field that is not a registered image field', async () => {
    const result = await publishContent({ '/::team1.title': tempImageDraft() });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('"Team.title" is not a known image field');
    expect(commitFiles).not.toHaveBeenCalled();
  });
});

describe('publishContent: images in collection items', () => {
  const newSrc = `/images/${TEMP_ASSET_ID}.webp`;

  it('processes an image draft inside an item with the rules of the item field', async () => {
    await publishContent({ '/::team1.members': [{ ...anna, photo: tempImageDraft() }] });

    expect(processImageCrop).toHaveBeenCalledWith(TEMP_BYTES, tempImageDraft().crop, {
      aspectRatio: 2,
      maxWidth: 100,
      maxHeight: 50,
    });
    expect(committedJson('src/project/content/home.json').modules.team1.content.members).toEqual([
      { ...anna, photo: { src: newSrc, alt: 'New photo' } },
    ]);
    expect(committedFiles()).toContainEqual({
      repoPath: `public${newSrc}`,
      content: PROCESSED_BYTES.toString('base64'),
      encoding: 'base64',
    });
    expect(deleteTempBlob).toHaveBeenCalledWith(`temp/${TEMP_ASSET_ID}.jpg`);
  });

  it('processes several item images in one commit, keeping the item order', async () => {
    await publishContent({
      '/::team1.members': [
        { id: 'm2', name: 'Max', photo: tempImageDraft({ assetId: TEMP_ASSET_ID_2 }) },
        { ...anna, photo: tempImageDraft() },
      ],
    });

    expect(processImageCrop).toHaveBeenCalledTimes(2);
    const members = committedJson('src/project/content/home.json').modules.team1.content.members;
    expect(members.map((member: { photo: { src: string } }) => member.photo.src)).toEqual([
      `/images/${TEMP_ASSET_ID_2}.webp`,
      newSrc,
    ]);
    expect(committedFiles().filter((file) => file.repoPath.startsWith('public/images/'))).toHaveLength(2);
  });

  it('deletes the generated image of a replaced item image', async () => {
    await publishContent({
      '/about::team3.members': [{ id: 'm1', name: 'Anna', photo: tempImageDraft() }],
    });

    expect(deletedPaths()).toEqual([`public${GENERATED_C}`]);
  });

  it('deletes the generated image of a removed item', async () => {
    await publishContent({ '/about::team3.members': [] });

    expect(deletedPaths()).toEqual([`public${GENERATED_C}`]);
  });

  it('keeps item images that are only moved or get a new alt text', async () => {
    await publishContent({
      '/about::team3.members': [
        { id: 'm2', name: 'Max', photo: { src: PLACEHOLDER, alt: 'Max' } },
        { id: 'm1', name: 'Anna', photo: { src: GENERATED_C, alt: 'Better alt text' } },
      ],
    });

    expect(processImageCrop).not.toHaveBeenCalled();
    expect(deletedPaths()).toEqual([]);
  });

  it('rejects an image draft in an item field that is not a registered image field', async () => {
    const result = await publishContent({ '/::team1.members': [{ ...anna, name: tempImageDraft() }] });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('"Team.members.name" is not a known image field');
    expect(commitFiles).not.toHaveBeenCalled();
  });
});

describe('publishContent: deployment tracking', () => {
  it('tracks the deployment on production with a commit SHA', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'deployed-sha');

    const result = await publishContent({ '/::team1.title': 'x' });

    expect(result).toMatchObject({ success: true, trackDeployment: true });
  });

  it.each([
    ['preview deployments', 'preview', 'deployed-sha'],
    ['local development', '', ''],
  ])('does not track the deployment for %s', async (_, env, sha) => {
    vi.stubEnv('VERCEL_ENV', env);
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', sha);

    const result = await publishContent({ '/::team1.title': 'x' });

    expect(result).toMatchObject({ success: true, trackDeployment: false });
  });
});
