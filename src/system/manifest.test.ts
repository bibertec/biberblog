import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import manifest from './manifest.json';
import packageJson from '../../package.json';

/**
 * The manifest describes what belongs to the system outside of `src/system/` (see
 * `src/system/docs/architecture.md`, "Project structure"). These checks keep it truthful: the
 * project may add its own dependencies and scripts or change versions, but must not lose any of the
 * system's.
 */
describe('manifest.json', () => {
  it('has a semantic version', () => {
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it.each(manifest.files)('system file %s exists', (file) => {
    expect(fs.existsSync(file)).toBe(true);
  });

  it('every system dependency is installed', () => {
    const installed = { ...packageJson.dependencies, ...packageJson.devDependencies };
    const required = [...Object.keys(manifest.dependencies), ...Object.keys(manifest.devDependencies)];

    expect(required.filter((name) => !(name in installed))).toEqual([]);
  });

  it('every system script exists', () => {
    expect(Object.keys(manifest.scripts).filter((name) => !(name in packageJson.scripts))).toEqual([]);
  });
});
