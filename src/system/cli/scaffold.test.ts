import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestProject, type TestProject } from './__tests__/testProject.ts';
import { runScaffold } from './scaffold.ts';

let project: TestProject;

/** Runs `npm run scaffold -- …` in the temporary project. */
function scaffold(...args: string[]) {
  const result = spawnSync(process.execPath, ['src/system/cli/bin/scaffold.ts', ...args], { cwd: project.root, encoding: 'utf-8' });

  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

beforeAll(() => {
  project = createTestProject();
});

afterAll(() => {
  project?.remove();
});

describe('npm run scaffold', { timeout: 60_000 }, () => {
  it('runs an allowed generator with the given answers', () => {
    const answers = { moduleName: 'PlopScaffoldTest', fields: [{ fieldName: 'headline', contentType: 'EditableText' }] };
    const result = scaffold('module:create', JSON.stringify(answers));

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('src/project/components/modules/PlopScaffoldTest/schema.ts');
    expect(project.exists('src/project/components/modules/PlopScaffoldTest/PlopScaffoldTest.tsx')).toBe(true);
  });

  it('fails with the message of the failed action', () => {
    const result = scaffold('module:create', JSON.stringify({ moduleName: 'lowercase', fields: [] }));

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/PascalCase/);
    expect(project.exists('src/project/components/modules/lowercase')).toBe(false);
  });

  it('rejects destructive generators, invalid JSON and missing arguments', () => {
    expect(scaffold('module:remove', '{"moduleName":"PlopScaffoldTest"}').stderr).toMatch(/cannot be run non-interactively/);
    expect(project.exists('src/project/components/modules/PlopScaffoldTest')).toBe(true);
    expect(scaffold('page:add', '{pageSlug: x}').stderr).toMatch(/not valid JSON/);
    expect(scaffold('page:add', '["x"]').stderr).toMatch(/must be a JSON object/);
    expect(scaffold('page:add').stderr).toMatch(/Usage/);
  });

  it('rejects unknown generators even when every generator is allowed', async () => {
    await expect(runScaffold('nope', {}, { allowAll: true })).rejects.toThrow(/does not exist/);
  });
});
