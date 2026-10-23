import path from 'node:path';
import nodePlop from 'node-plop';

/**
 * Runs a Plop generator without its prompts: the answers are passed in directly and validated by the
 * actions themselves (see `src/system/docs/plop.md`). Used by `npm run scaffold` (scripts, Claude
 * Code) and by the generator tests.
 */

/** Generators `npm run scaffold` may run. Destructive ones stay interactive. */
export const SCAFFOLD_GENERATORS = ['page:add', 'page:add-module', 'module:create'];

export class ScaffoldError extends Error {}

export async function runScaffold(
  generator: string,
  answers: unknown,
  { allowAll = false }: { allowAll?: boolean } = {},
): Promise<string[]> {
  if (!allowAll && !SCAFFOLD_GENERATORS.includes(generator)) {
    throw new ScaffoldError(`"${generator}" cannot be run non-interactively. Allowed: ${SCAFFOLD_GENERATORS.join(', ')}.`);
  }
  if (typeof answers !== 'object' || answers === null || Array.isArray(answers)) {
    throw new ScaffoldError('The answers must be a JSON object.');
  }
  const plop = await nodePlop(path.join(process.cwd(), 'src/system/cli/plopfile.ts'), { force: false, destBasePath: process.cwd() });
  if (!plop.getGeneratorList().some(({ name }) => name === generator)) {
    throw new ScaffoldError(`Generator "${generator}" does not exist.`);
  }
  const { changes, failures } = await plop.getGenerator(generator).runActions(answers);
  // Plop aborts after the first failed action and lists every following one as "Aborted …".
  if (failures.length > 0) throw new ScaffoldError(String(failures[0].error));

  return changes.map((change) => change.path);
}
