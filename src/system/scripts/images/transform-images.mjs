import { randomUUID } from 'node:crypto';
import { readdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

const SOURCE_DIR = path.join(process.cwd(), 'public', 'images');

const TARGET_DIR = path.join(process.cwd(), 'public', 'images');

const SOURCE_PATTERN = /\.(?:jpe?g|png)$/i;

const DEFAULT_MAX_SIZE = 2400;

const DEFAULT_QUALITY = 80;

const MAX_INPUT_PIXELS = 268402689;

export function targetFilename(sourceFilename) {
  const basename = sourceFilename
    .replace(SOURCE_PATTERN, '')
    .replaceAll('ß', 'ss')
    .normalize('NFKD')
    .replace(/\p{Mark}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!basename) {
    throw new Error(`Cannot derive a valid image name from "${sourceFilename}".`);
  }

  return `${basename}.webp`;
}

export async function createTransformPlan(sourceDirectory) {
  const entries = await readdir(sourceDirectory, {
    withFileTypes: true,
  });
  const sources = entries.filter((entry) => entry.isFile() && SOURCE_PATTERN.test(entry.name));
  const claimedTargets = new Map();
  const plan = sources.map((entry) => {
    const target = targetFilename(entry.name);
    const previousSource = claimedTargets.get(target);
    if (previousSource) {
      throw new Error(
        `Name collision: "${previousSource}" and "${entry.name}" would both produce "${target}".`,
      );
    }
    claimedTargets.set(target, entry.name);

    return {
      source: entry.name,
      target,
    };
  });

  return plan.sort((left, right) => left.source.localeCompare(right.source, 'de'));
}

export async function transformImages(
  sourceDirectory,
  targetDirectory,
  { dryRun = false, maxSize = DEFAULT_MAX_SIZE, quality = DEFAULT_QUALITY, log = console.log } = {},
) {
  const plan = await createTransformPlan(sourceDirectory);
  if (!plan.length) {
    log('No JPG, JPEG or PNG files found.');
    return [];
  }
  for (const item of plan) {
    log(`${dryRun ? 'Would convert' : 'Converting'}: ${item.source} -> ${item.target}`);
  }
  if (dryRun) {
    return plan;
  }
  const prepared = [];
  try {
    for (const item of plan) {
      const sourcePath = path.join(sourceDirectory, item.source);
      const targetPath = path.join(targetDirectory, item.target);
      const temporaryPath = path.join(targetDirectory, `.${item.target}.${randomUUID()}.tmp`);
      const preparedItem = {
        ...item,
        sourcePath,
        targetPath,
        temporaryPath,
      };
      prepared.push(preparedItem);
      await sharp(sourcePath, {
        limitInputPixels: MAX_INPUT_PIXELS,
        failOn: 'error',
      })
        .rotate()
        .resize({
          width: maxSize,
          height: maxSize,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .toColorspace('srgb')
        .webp({
          quality,
        })
        .toFile(temporaryPath);
    }
  } catch (error) {
    await Promise.allSettled(prepared.map((item) => unlink(item.temporaryPath)));
    throw error;
  }
  for (const item of prepared) {
    await rename(item.temporaryPath, item.targetPath);
    await unlink(item.sourcePath);
  }
  log(
    `${prepared.length} image${prepared.length === 1 ? '' : 's'} optimized. ` +
      'The JPG/PNG sources were deleted.',
  );

  return plan;
}

async function main() {
  const { values } = parseArgs({
    options: {
      'dry-run': {
        type: 'boolean',
        default: false,
      },
    },
  });
  await transformImages(SOURCE_DIR, TARGET_DIR, {
    dryRun: values['dry-run'],
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
