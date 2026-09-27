import { generate, outdatedGeneratedFiles } from '../generate.ts';

// `npm run generate` writes src/generated/; `npm run generate -- --check` only checks (CI).
if (process.argv.includes('--check')) {
  const outdated = outdatedGeneratedFiles();
  if (outdated.length > 0) {
    console.error(`Outdated generated files: ${outdated.join(', ')}. Run "npm run generate" and commit the result.`);
    process.exit(1);
  }
  console.log('Generated files are up to date.');
} else {
  const changed = generate();
  console.log(changed.length > 0 ? `Updated: ${changed.join(', ')}` : 'Generated files are up to date.');
}
