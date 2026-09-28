import { reportError, runStatus } from '../update.ts';

await runStatus(process.argv.slice(2)).catch(reportError);
