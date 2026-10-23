import { runScaffold, ScaffoldError, SCAFFOLD_GENERATORS } from '../scaffold.ts';

// `npm run scaffold -- <generator> '<answers-json>'` – a generator without its prompts.
const [generator, answersJson] = process.argv.slice(2);
if (!generator || answersJson === undefined) {
  console.error(`Usage: npm run scaffold -- <generator> '<answers-json>' (generators: ${SCAFFOLD_GENERATORS.join(', ')})`);
  process.exit(1);
}

try {
  let answers: unknown;
  try {
    answers = JSON.parse(answersJson);
  } catch {
    throw new ScaffoldError('The answers are not valid JSON.');
  }
  for (const change of await runScaffold(generator, answers)) console.log(change);
} catch (error) {
  console.error(error instanceof ScaffoldError ? error.message : error);
  process.exit(1);
}
