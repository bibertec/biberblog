import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import migrate, { addImageVariantTexts, useSystemImageFieldRules } from './1.5.0.ts';

// The two project files as shipped up to 1.4.0 (relevant parts).
const TRANSLATIONS_1_4 = `export const translations = {
  image: {
    dialogTitle: 'Edit image',
    change: 'Change image',
    chooseFile: 'Choose a different image',
    allowedFormats: (maxMegabytes) => \`Allowed: JPEG, PNG, WEBP · max. \${maxMegabytes} MB\`,
  },
} satisfies EditorTranslations;
`;

const REGISTRY_1_4 = `export type ImageFieldRules = {
  aspectRatio: number;
  maxWidth: number;
  maxHeight: number;
};

export function imageFieldRegistryKey(moduleType: string, ...fieldPath: [string] | [string, string]): string {
  return [moduleType, ...fieldPath].join('.');
}

export const imageFieldRegistry = {
  'Team.photo': { aspectRatio: 800 / 800, maxWidth: 800, maxHeight: 800 },
} satisfies Record<string, ImageFieldRules>;
`;

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

describe('1.5.0: addImageVariantTexts', () => {
  it('adds the three texts right after chooseFile, with the same indentation', () => {
    const result = addImageVariantTexts(TRANSLATIONS_1_4);

    expect(result).toMatchObject({ changed: true });
    expect(result.source).toContain(
      [
        "    chooseFile: 'Choose a different image',",
        "    desktopVariant: 'Desktop image',",
        "    mobileVariant: 'Smartphone image',",
        "    useDesktopImage: 'Use desktop image',",
        '    allowedFormats:',
      ].join('\n'),
    );
  });

  it('keeps a project translation and only adds missing keys', () => {
    const german = TRANSLATIONS_1_4.replace("'Choose a different image'", "'Anderes Bild wählen'").replace(
      "    chooseFile:",
      "    desktopVariant: 'Desktop-Bild',\n    chooseFile:",
    );
    const result = addImageVariantTexts(german);

    expect(result.source).toContain("desktopVariant: 'Desktop-Bild'");
    expect(result.source).not.toContain("desktopVariant: 'Desktop image'");
    expect(result.source).toContain("mobileVariant: 'Smartphone image'");
  });

  it('uses the quote style of the file', () => {
    const result = addImageVariantTexts(TRANSLATIONS_1_4.replace("'Choose a different image'", '"Choose a different image"'));

    expect(result.source).toContain('desktopVariant: "Desktop image",');
  });

  it('is idempotent', () => {
    const once = addImageVariantTexts(TRANSLATIONS_1_4).source!;

    expect(addImageVariantTexts(once)).toEqual({ source: once, changed: false });
  });

  it('does not change the current template', () => {
    const template = fs.readFileSync(path.join(REPO_ROOT, 'src/project/config/translations.ts'), 'utf-8');

    expect(addImageVariantTexts(template)).toEqual({ source: template, changed: false });
  });

  it('returns instructions instead of guessing when chooseFile is missing', () => {
    const result = addImageVariantTexts('export const translations = { image: {} };\n');

    expect(result.source).toBeNull();
    if (result.source === null) expect(result.instructions).toContain("desktopVariant: 'Desktop image'");
  });
});

describe('1.5.0: useSystemImageFieldRules', () => {
  it('replaces the local type by the system type and keeps the entries', () => {
    const result = useSystemImageFieldRules(REGISTRY_1_4);

    expect(result).toMatchObject({ changed: true });
    expect(result.source).toMatch(
      /^import type \{ ImageFieldRules \} from '@\/src\/system\/content\/imageFieldRules';\n\nexport type \{ ImageFieldRules \};\n\n/,
    );
    expect(result.source).not.toContain('export type ImageFieldRules = {');
    expect(result.source).toContain("'Team.photo': { aspectRatio: 800 / 800, maxWidth: 800, maxHeight: 800 },");
  });

  it('is idempotent and does not change the current template', () => {
    const template = fs.readFileSync(path.join(REPO_ROOT, 'src/project/content/imageFieldRegistry.ts'), 'utf-8');
    const once = useSystemImageFieldRules(REGISTRY_1_4).source!;

    expect(useSystemImageFieldRules(once)).toEqual({ source: once, changed: false });
    expect(useSystemImageFieldRules(template)).toEqual({ source: template, changed: false });
  });

  it('returns instructions for a rewritten type', () => {
    const result = useSystemImageFieldRules(REGISTRY_1_4.replace('maxHeight: number;\n', 'maxHeight: number;\n  quality?: number;\n'));

    expect(result.source).toBeNull();
  });
});

describe('1.5.0: migrate', () => {
  let dir: string | undefined;
  const cwd = process.cwd();

  afterEach(() => {
    process.chdir(cwd);
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('changes both files in the project root and tells the developer about the English texts', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'biberblog-migration-'));
    fs.mkdirSync(path.join(dir, 'src/project/config'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'src/project/content'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/project/config/translations.ts'), TRANSLATIONS_1_4);
    fs.writeFileSync(path.join(dir, 'src/project/content/imageFieldRegistry.ts'), REGISTRY_1_4);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    process.chdir(dir);

    migrate();
    const translations = fs.readFileSync('src/project/config/translations.ts', 'utf-8');
    const registry = fs.readFileSync('src/project/content/imageFieldRegistry.ts', 'utf-8');
    migrate();

    expect(translations).toContain("useDesktopImage: 'Use desktop image',");
    expect(registry).toContain("from '@/src/system/content/imageFieldRules'");
    expect(fs.readFileSync('src/project/config/translations.ts', 'utf-8')).toBe(translations);
    expect(fs.readFileSync('src/project/content/imageFieldRegistry.ts', 'utf-8')).toBe(registry);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toContain('translate them');
  });
});
