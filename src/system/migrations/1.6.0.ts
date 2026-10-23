import fs from 'node:fs';

/**
 * 1.6.0 – the Claude Code guidance of the system moved to `src/system/CLAUDE.md`, which
 * `system:update` keeps up to date. The project's root `CLAUDE.md` stays project-owned and only
 * imports it (`@src/system/CLAUDE.md`).
 */

export const description = 'Imports the system guidance src/system/CLAUDE.md into the root CLAUDE.md';

const CLAUDE_MD_PATH = 'CLAUDE.md';
const SYSTEM_IMPORT = '@src/system/CLAUDE.md';

/** The root CLAUDE.md of new projects (same as the template's). */
export const DEFAULT_CLAUDE_MD = `# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md
${SYSTEM_IMPORT}

## Project

<!-- Project-specific notes for Claude Code. The biberblog system guidance is imported above from
src/system/CLAUDE.md, which \`npm run system:update\` keeps up to date – don't copy it here. -->
`;

type Result = { source: string; changed: boolean; customized: boolean };

/** Adds the system import to a root CLAUDE.md (`null`: file missing). Up to 1.5.0 it only contained `@AGENTS.md`. */
export function importSystemGuidance(source: string | null): Result {
  if (source === null || source.trim() === '' || source.trim() === '@AGENTS.md') {
    return { source: DEFAULT_CLAUDE_MD, changed: true, customized: false };
  }
  if (new RegExp(`^${SYSTEM_IMPORT}\\s*$`, 'm').test(source)) return { source, changed: false, customized: false };

  const agents = /^@AGENTS\.md[ \t]*$/m.exec(source);
  if (!agents) return { source: `${SYSTEM_IMPORT}\n\n${source}`, changed: true, customized: true };
  const end = agents.index + agents[0].length;

  return { source: `${source.slice(0, end)}\n${SYSTEM_IMPORT}${source.slice(end)}`, changed: true, customized: true };
}

export default function migrate(): void {
  const source = fs.existsSync(CLAUDE_MD_PATH) ? fs.readFileSync(CLAUDE_MD_PATH, 'utf-8') : null;
  const result = importSystemGuidance(source);
  if (!result.changed) return;
  fs.writeFileSync(CLAUDE_MD_PATH, result.source);
  if (result.customized) {
    console.log(`  Added "${SYSTEM_IMPORT}" to ${CLAUDE_MD_PATH} – remove biberblog system guidance you copied into it before, it is now kept up to date in src/system/CLAUDE.md.`);
  }
}
