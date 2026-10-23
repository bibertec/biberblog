import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import migrate, { DEFAULT_CLAUDE_MD, importSystemGuidance } from './1.6.0.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

const CUSTOMIZED = `# Acme website

@AGENTS.md

## Project
- Customer texts are German.
`;

describe('1.6.0: importSystemGuidance', () => {
  it('replaces the CLAUDE.md shipped up to 1.5.0 by the new default', () => {
    expect(importSystemGuidance('@AGENTS.md\n')).toEqual({ source: DEFAULT_CLAUDE_MD, changed: true, customized: false });
  });

  it('creates the default for a missing or empty file', () => {
    expect(importSystemGuidance(null).source).toBe(DEFAULT_CLAUDE_MD);
    expect(importSystemGuidance('\n').source).toBe(DEFAULT_CLAUDE_MD);
  });

  it('adds the import right after @AGENTS.md in a customized file and keeps the project notes', () => {
    const result = importSystemGuidance(CUSTOMIZED);

    expect(result).toMatchObject({ changed: true, customized: true });
    expect(result.source).toBe(CUSTOMIZED.replace('@AGENTS.md\n', '@AGENTS.md\n@src/system/CLAUDE.md\n'));
  });

  it('puts the import first if the file does not import AGENTS.md', () => {
    expect(importSystemGuidance('# Notes\n').source).toBe('@src/system/CLAUDE.md\n\n# Notes\n');
  });

  it('is idempotent', () => {
    const once = importSystemGuidance(CUSTOMIZED).source;

    expect(importSystemGuidance(once)).toEqual({ source: once, changed: false, customized: false });
  });

  it('matches the template and does not change it', () => {
    const template = fs.readFileSync(path.join(REPO_ROOT, 'CLAUDE.md'), 'utf-8');

    expect(template).toBe(DEFAULT_CLAUDE_MD);
    expect(importSystemGuidance(template).changed).toBe(false);
  });
});

describe('1.6.0: migrate', () => {
  let dir: string | undefined;
  const cwd = process.cwd();

  afterEach(() => {
    process.chdir(cwd);
    vi.restoreAllMocks();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('changes the root CLAUDE.md once and tells the developer about copied guidance', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'biberblog-migration-'));
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), CUSTOMIZED);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    process.chdir(dir);

    migrate();
    const migrated = fs.readFileSync('CLAUDE.md', 'utf-8');
    migrate();

    expect(migrated).toContain('@AGENTS.md\n@src/system/CLAUDE.md\n');
    expect(fs.readFileSync('CLAUDE.md', 'utf-8')).toBe(migrated);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('creates a missing CLAUDE.md silently', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'biberblog-migration-'));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    process.chdir(dir);

    migrate();

    expect(fs.readFileSync('CLAUDE.md', 'utf-8')).toBe(DEFAULT_CLAUDE_MD);
    expect(log).not.toHaveBeenCalled();
  });
});
