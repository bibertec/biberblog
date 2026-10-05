import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { syncVersion } from './version';

describe('syncVersion', () => {
  let root: string;

  afterEach(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  function fixture(lockfile = true) {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'biberblog-version-'));
    fs.mkdirSync(path.join(root, 'src/system'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/system/manifest.json'), JSON.stringify({ version: '1.3.0' }));
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'project', version: '1.2.0', scripts: { build: 'next build' } }));
    if (lockfile) {
      fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({ version: '1.3.0', lockfileVersion: 3, packages: { '': { version: '1.2.0' }, 'node_modules/example': { version: '4.0.0' } } }));
    }
  }

  it('updates both root lockfile versions, preserves other fields and avoids rewriting unchanged files', () => {
    fixture();
    expect(syncVersion(root)).toEqual({ version: '1.3.0', changed: ['package.json', 'package-lock.json'] });
    expect(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'))).toEqual({ name: 'project', version: '1.3.0', scripts: { build: 'next build' } });
    expect(JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf-8'))).toEqual({ version: '1.3.0', lockfileVersion: 3, packages: { '': { version: '1.3.0' }, 'node_modules/example': { version: '4.0.0' } } });
    const modified = fs.statSync(path.join(root, 'package.json')).mtimeMs;
    expect(syncVersion(root).changed).toEqual([]);
    expect(fs.statSync(path.join(root, 'package.json')).mtimeMs).toBe(modified);
  });

  it('also works without a lockfile', () => {
    fixture(false);
    expect(syncVersion(root).changed).toEqual(['package.json']);
    expect(fs.existsSync(path.join(root, 'package-lock.json'))).toBe(false);
  });

  it('leaves package.json untouched when another input is invalid', () => {
    fixture();
    const original = fs.readFileSync(path.join(root, 'package.json'), 'utf-8');
    fs.writeFileSync(path.join(root, 'package-lock.json'), '{broken');
    expect(() => syncVersion(root)).toThrow();
    expect(fs.readFileSync(path.join(root, 'package.json'), 'utf-8')).toBe(original);
    fs.writeFileSync(path.join(root, 'src/system/manifest.json'), '{broken');
    expect(() => syncVersion(root)).toThrow();
    expect(fs.readFileSync(path.join(root, 'package.json'), 'utf-8')).toBe(original);
  });

  it.each([undefined, null, 123, '01.2.0', '1.2', 'invalid', '1.2.0-beta.1'])('rejects an invalid manifest version: %s', (version) => {
    fixture();
    const original = fs.readFileSync(path.join(root, 'package.json'), 'utf-8');
    fs.writeFileSync(path.join(root, 'src/system/manifest.json'), JSON.stringify({ version }));
    expect(() => syncVersion(root)).toThrow('expected "version" in the form "X.Y.Z"');
    expect(fs.readFileSync(path.join(root, 'package.json'), 'utf-8')).toBe(original);
  });
});
