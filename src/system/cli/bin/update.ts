import { reportError, runUpdate } from '../update.ts';

await runUpdate(process.argv.slice(2)).catch(reportError);
