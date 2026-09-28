import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  latestRelease,
  type Manifest,
  mergePackageJson,
  normalizeVersion,
  selectMigrations,
  systemPaths,
} from './update';

function manifest(overrides: Partial<Manifest> = {}): Manifest {
  return {
    version: '1.0.0',
    repository: 'https://github.com/bibertec/biberblog',
    files: [],
    dependencies: {},
    devDependencies: {},
    scripts: {},
    ...overrides,
  };
}

describe('versions', () => {
  it.each([
    ['1.2.3', '1.2.3'],
    ['v1.2.3', '1.2.3'],
    [' v10.0.1 ', '10.0.1'],
    ['1.2', undefined],
    ['v1.2.3-beta.1', undefined],
    ['latest', undefined],
  ])('normalizeVersion(%j) is %j', (value, expected) => {
    expect(normalizeVersion(value)).toBe(expected);
  });

  it('compares numerically, not alphabetically', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
    expect(compareVersions('2.0.0', '2.0.0')).toBe(0);
  });

  it('finds the latest release in the output of git ls-remote', () => {
    const output = [
      'a1\trefs/tags/v1.0.0',
      'b2\trefs/tags/v1.10.0',
      'c3\trefs/tags/v1.9.2',
      'd4\trefs/tags/v2.0.0-beta.1',
      'e5\trefs/tags/some-tag',
      '',
    ].join('\n');

    expect(latestRelease(output)).toBe('1.10.0');
    expect(latestRelease('')).toBeUndefined();
  });
});

describe('systemPaths', () => {
  it('combines src/system with the files of all manifests', () => {
    const from = manifest({ files: ['app/api/a/route.ts', '.github/workflows/biberblog.yml'] });
    const to = manifest({ files: ['app/api/b/route.ts', '.github/workflows/biberblog.yml'] });

    expect(systemPaths(from, to)).toEqual([
      '.github/workflows/biberblog.yml',
      'app/api/a/route.ts',
      'app/api/b/route.ts',
      'src/system',
    ]);
  });
});

describe('mergePackageJson', () => {
  const from = manifest({
    dependencies: { next: '16.3.5', old: '^1.0.0', zod: '^4.0.0' },
    scripts: { dev: 'next dev' },
  });
  const to = manifest({
    dependencies: { added: '^2.0.0', next: '16.4.0', zod: '^4.1.0' },
    scripts: { dev: 'next dev', 'system:update': 'node src/system/cli/bin/update.ts' },
  });

  it('moves unchanged system entries to the new manifest and keeps project entries', () => {
    const pkg = {
      name: 'customer-site',
      dependencies: { next: '16.3.5', old: '^1.0.0', own: '^3.0.0', zod: '^4.0.0' },
      scripts: { dev: 'next dev', custom: 'echo custom' },
    };
    const { pkg: merged, changed, kept } = mergePackageJson(pkg, from, to);

    expect(Object.entries(merged.dependencies ?? {})).toEqual([
      ['added', '^2.0.0'],
      ['next', '16.4.0'],
      ['own', '^3.0.0'],
      ['zod', '^4.1.0'],
    ]);
    expect(merged.scripts).toEqual({
      dev: 'next dev',
      custom: 'echo custom',
      'system:update': 'node src/system/cli/bin/update.ts',
    });
    expect(merged.name).toBe('customer-site');
    expect(changed).toHaveLength(5);
    expect(kept).toEqual([]);
    expect(pkg.dependencies.next).toBe('16.3.5');
  });

  it('keeps values the project changed on purpose and reports them', () => {
    const pkg = { dependencies: { next: '16.3.9', old: '^1.5.0', zod: '^4.0.0' } };
    const { pkg: merged, kept } = mergePackageJson(pkg, from, to);

    expect(merged.dependencies).toMatchObject({ next: '16.3.9', old: '^1.5.0', zod: '^4.1.0' });
    expect(kept).toHaveLength(2);
  });

  it('adds no empty sections', () => {
    expect(mergePackageJson({ name: 'x' }, manifest(), manifest()).pkg).toEqual({ name: 'x' });
  });
});

describe('selectMigrations', () => {
  it('selects the versions after the current one up to the target, in order', () => {
    expect(selectMigrations(['1.3.0', '1.0.0', '1.1.0', '2.0.0', '1.2.0'], '1.0.0', '1.3.0')).toEqual([
      '1.1.0',
      '1.2.0',
      '1.3.0',
    ]);
  });
});
