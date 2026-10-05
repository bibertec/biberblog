import { syncVersion } from '../version.ts';

try {
  const { version, changed } = syncVersion();
  console.log(`biberblog v${version}: ${changed.length ? `updated ${changed.join(', ')}` : 'version is up to date'}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
