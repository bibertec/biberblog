import fs from 'node:fs';

/**
 * 1.5.0 – optional mobile variant of image fields. Two project files need a change:
 * - `src/project/config/translations.ts`: three new editor texts (`image.desktopVariant`,
 *   `image.mobileVariant`, `image.useDesktopImage`);
 * - `src/project/content/imageFieldRegistry.ts`: `ImageFieldRules` now comes from the system
 *   (`src/system/content/imageFieldRules.ts`), so a registry entry may contain `mobile`.
 */

export const description = 'Adds the editor texts of the image variant toggle and lets imageFieldRegistry.ts use mobile variants';

const TRANSLATIONS_PATH = 'src/project/config/translations.ts';
const IMAGE_FIELD_REGISTRY_PATH = 'src/project/content/imageFieldRegistry.ts';

const NEW_IMAGE_TEXTS: [key: string, value: string][] = [
  ['desktopVariant', 'Desktop image'],
  ['mobileVariant', 'Smartphone image'],
  ['useDesktopImage', 'Use desktop image'],
];

const SYSTEM_RULES_IMPORT = "import type { ImageFieldRules } from '@/src/system/content/imageFieldRules';";
const LOCAL_RULES_TYPE = /export type ImageFieldRules = \{\s*aspectRatio: number;\s*maxWidth: number;\s*maxHeight: number;?\s*\};?\n/;

type Result = { source: string; changed: boolean } | { source: null; instructions: string };

/** Inserts the new texts after `chooseFile` in the `image` section (keeps indentation and quotes). */
export function addImageVariantTexts(source: string): Result {
  const missing = NEW_IMAGE_TEXTS.filter(([key]) => !new RegExp(`\\b${key}\\s*:`).test(source));
  if (missing.length === 0) return { source, changed: false };
  const chooseFile = /^([ \t]*)chooseFile\s*:.*,[ \t]*$/m.exec(source);
  if (!chooseFile) {
    return {
      source: null,
      instructions: `Add to the "image" section of ${TRANSLATIONS_PATH}: ${missing.map(([key, value]) => `${key}: '${value}'`).join(', ')}`,
    };
  }
  const quote = /chooseFile\s*:\s*"/.test(chooseFile[0]) ? '"' : "'";
  const lines = missing.map(([key, value]) => `${chooseFile[1]}${key}: ${quote}${value}${quote},`).join('\n');
  const end = chooseFile.index + chooseFile[0].length;

  return { source: `${source.slice(0, end)}\n${lines}${source.slice(end)}`, changed: true };
}

/** Replaces the project's own `ImageFieldRules` type (without `mobile`) by the system type. */
export function useSystemImageFieldRules(source: string): Result {
  if (source.includes("from '@/src/system/content/imageFieldRules'")) return { source, changed: false };
  if (!LOCAL_RULES_TYPE.test(source)) {
    return {
      source: null,
      instructions: `In ${IMAGE_FIELD_REGISTRY_PATH}, replace the ImageFieldRules type by:\n  ${SYSTEM_RULES_IMPORT}\n  export type { ImageFieldRules };`,
    };
  }

  return {
    source: source.replace(LOCAL_RULES_TYPE, `${SYSTEM_RULES_IMPORT}\n\nexport type { ImageFieldRules };\n`),
    changed: true,
  };
}

function migrateFile(path: string, transform: (source: string) => Result): void {
  if (!fs.existsSync(path)) {
    console.log(`  ${path} not found – skipped.`);
    return;
  }
  const result = transform(fs.readFileSync(path, 'utf-8'));
  if (result.source === null) {
    console.log(`  Could not change ${path} automatically. ${result.instructions}`);
    return;
  }
  if (result.changed) fs.writeFileSync(path, result.source);
}

export default function migrate(): void {
  const translations = fs.existsSync(TRANSLATIONS_PATH) ? fs.readFileSync(TRANSLATIONS_PATH, 'utf-8') : '';
  migrateFile(TRANSLATIONS_PATH, addImageVariantTexts);
  if (translations && translations !== fs.readFileSync(TRANSLATIONS_PATH, 'utf-8')) {
    console.log(`  Added the English texts ${NEW_IMAGE_TEXTS.map(([key]) => `image.${key}`).join(', ')} to ${TRANSLATIONS_PATH} – translate them if your editor texts are in another language.`);
  }
  migrateFile(IMAGE_FIELD_REGISTRY_PATH, useSystemImageFieldRules);
}

