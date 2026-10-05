import fs from 'node:fs';
import path from 'node:path';

const MANIFEST = 'src/system/manifest.json';

/** Only version metadata changes; dependencies and all other package fields are preserved. */
export function syncVersion(root = process.cwd()): { version: string; changed: string[] } {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, MANIFEST), 'utf-8'));
  const version: unknown = manifest?.version;
  if (typeof version !== 'string' || !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(version)) {
    throw new Error(`${MANIFEST}: expected "version" in the form "X.Y.Z".`);
  }
  const files = ['package.json', 'package-lock.json'];
  // Parse all files before writing, so invalid JSON cannot leave a partially updated version.
  const updates = files.flatMap((relativePath) => {
    const target = path.join(root, relativePath);
    if (relativePath === 'package-lock.json' && !fs.existsSync(target)) return [];
    const original = fs.readFileSync(target, 'utf-8');
    const data = JSON.parse(original);
    let changed = data.version !== version;
    data.version = version;
    if (relativePath === 'package-lock.json' && data.packages?.['']) {
      changed ||= data.packages[''].version !== version;
      data.packages[''].version = version;
    }
    return changed ? [{ relativePath, target, content: `${JSON.stringify(data, null, 2)}\n` }] : [];
  });
  for (const { target, content } of updates) fs.writeFileSync(target, content);
  return { version, changed: updates.map(({ relativePath }) => relativePath) };
}
