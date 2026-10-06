import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { hash } from '@node-rs/argon2';
import inquirer from 'inquirer';
import { GIT_REPO_ENV_VARS, VERCEL_PROVIDED_ENV_VARS } from '../config/envVars.ts';
import manifest from '../manifest.json' with { type: 'json' };

/**
 * `npm run setup`: prepares a project created from the biberblog template. Idempotent – run it
 * again after every `vercel env pull .env.local` (which overwrites `.env.local`):
 *
 * - `.env.local`: generates what is missing (session secret, password hash, repository variables),
 *   escapes `$` in the password hash and never overwrites existing values.
 * - Prints the variables that still have to be added in Vercel.
 * - First run only: replaces the biberblog README with a project README and removes biberblog's
 *   root LICENSE (it stays in `src/system/LICENSE`) and CONTRIBUTING.md.
 */

const ENV_FILE = '.env.local';
const TEMPLATE_README_MARKER = '<!-- biberblog:template-readme -->';
const TEMPLATE_CONTRIBUTING_MARKER = '<!-- biberblog:template-contributing -->';
const SYSTEM_LICENSE = 'src/system/LICENSE';

// --- .env helpers (pure) ----------------------------------------------------------------------

const ENV_LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

function unquote(value: string): string {
  return /^(["']).*\1$/.test(value) ? value.slice(1, -1) : value;
}

/** Value of `key` in an env file (without quotes), `undefined` if absent. */
export function readEnvValue(text: string, key: string): string | undefined {
  for (const line of text.split('\n')) {
    const match = ENV_LINE.exec(line);
    if (match?.[1] === key) return unquote(match[2].trim());
  }

  return undefined;
}

/** Sets `key=value`, replacing an existing line or appending a new one. Other lines stay untouched. */
export function setEnvValue(text: string, key: string, value: string): string {
  const lines = text === '' ? [] : text.replace(/\n$/, '').split('\n');
  const index = lines.findIndex((line) => ENV_LINE.exec(line)?.[1] === key);
  if (index === -1) lines.push(`${key}=${value}`);
  else lines[index] = `${key}=${value}`;

  return `${lines.join('\n')}\n`;
}

/** Missing, empty or still the `...` placeholder of `.env.example`. */
export function isMissingValue(value: string | undefined): boolean {
  return value === undefined || value.trim() === '' || value.trim() === '...';
}

/** Next.js expands `$VAR` in `.env*` files – an Argon2 hash needs every `$` escaped as `\$`. */
export function escapeDollarSigns(value: string): string {
  return value.replace(/(?<!\\)\$/g, '\\$');
}

export function unescapeDollarSigns(value: string): string {
  return value.replace(/\\\$/g, '$');
}

/** Owner and repository name of a GitHub remote URL (HTTPS or SSH). */
export function repoFromRemoteUrl(url: string): { owner: string; slug: string } | undefined {
  const match = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(url.trim());

  return match ? { owner: match[1], slug: match[2] } : undefined;
}

export function projectReadme(name: string): string {
  return `# ${name}

Website based on [biberblog](${manifest.repository}) – a static Next.js site whose content the customer edits directly on the page.

## Development

\`\`\`bash
npm install
npm run dev
\`\`\`

After \`vercel env pull .env.local\`, run \`npm run setup\` again – it restores the local adjustments of \`.env.local\`.

## biberblog updates

\`\`\`bash
npm run system:status   # version, newer releases, local changes to the editor
npm run system:update   # merge the latest biberblog release
\`\`\`

Details: \`src/system/docs/update.md\`

## Documentation

- biberblog: \`src/system/docs/\` (commands: \`src/system/docs/cli.md\`)
- biberblog version: \`src/system/manifest.json\`
`;
}

// --- Steps ------------------------------------------------------------------------------------

function gitRemoteRepo(): { owner: string; slug: string } | undefined {
  try {
    return repoFromRemoteUrl(execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf-8' }));
  } catch {
    return undefined;
  }
}

async function promptPassword(): Promise<string> {
  for (;;) {
    const { password } = await inquirer.prompt([
      {
        type: 'password',
        name: 'password',
        mask: '*',
        message: "Customer's editor password:",
        validate: (value: string) => value.length >= 8 || 'At least 8 characters.',
      },
    ]);
    const { confirm } = await inquirer.prompt([{ type: 'password', name: 'confirm', mask: '*', message: 'Repeat password:' }]);
    if (password === confirm) return password;
    console.log('The two entries do not match – please try again.');
  }
}

async function confirm(message: string, defaultValue: boolean): Promise<boolean> {
  const { answer } = await inquirer.prompt([{ type: 'confirm', name: 'answer', message, default: defaultValue }]);

  return answer;
}

type EnvResult = { text: string; forVercel: Record<string, string>; missing: string[] };

async function setUpEnv(text: string, repo: { owner: string; slug: string } | undefined): Promise<EnvResult> {
  let env = text;
  const forVercel: Record<string, string> = {};
  const missing: string[] = [];

  if (isMissingValue(readEnvValue(env, 'EDITOR_SESSION_SECRET'))) {
    const secret = randomBytes(32).toString('base64');
    env = setEnvValue(env, 'EDITOR_SESSION_SECRET', secret);
    forVercel.EDITOR_SESSION_SECRET = secret;
  }

  // To change an existing password later: `npm run editor:set-password`.
  const currentHash = readEnvValue(env, 'EDITOR_PASSWORD_HASH');
  if (currentHash === undefined || isMissingValue(currentHash)) {
    const passwordHash = await hash(await promptPassword());
    env = setEnvValue(env, 'EDITOR_PASSWORD_HASH', escapeDollarSigns(passwordHash));
    forVercel.EDITOR_PASSWORD_HASH = passwordHash;
  } else {
    // Values pulled from Vercel are unescaped (and quoted) – write the escaped form back.
    env = setEnvValue(env, 'EDITOR_PASSWORD_HASH', escapeDollarSigns(currentHash));
  }

  if (isMissingValue(readEnvValue(env, 'GITHUB_TOKEN'))) {
    const { token } = await inquirer.prompt([
      {
        type: 'password',
        name: 'token',
        mask: '*',
        message: 'GitHub token (fine-grained, only this repository, "Contents: Read & write") – leave empty to add it later:',
      },
    ]);
    if (token.trim() === '') {
      missing.push('GITHUB_TOKEN');
    } else {
      env = setEnvValue(env, 'GITHUB_TOKEN', token.trim());
      forVercel.GITHUB_TOKEN = token.trim();
    }
  }

  for (const [key, value] of [
    [GIT_REPO_ENV_VARS[0], repo?.owner],
    [GIT_REPO_ENV_VARS[1], repo?.slug],
  ] as const) {
    if (!isMissingValue(readEnvValue(env, key))) continue;
    if (value) env = setEnvValue(env, key, value);
    else missing.push(key);
  }

  missing.push(...VERCEL_PROVIDED_ENV_VARS.filter((key) => isMissingValue(readEnvValue(env, key))));

  return { text: env, forVercel, missing };
}

function isBiberblogRepository(repo: { owner: string; slug: string } | undefined): boolean {
  return repo !== undefined && manifest.repository.toLowerCase().endsWith(`/${repo.owner}/${repo.slug}`.toLowerCase());
}

async function initializeProject(repo: { owner: string; slug: string } | undefined): Promise<void> {
  if (isBiberblogRepository(repo)) return;
  const readme = fs.existsSync('README.md') ? fs.readFileSync('README.md', 'utf-8') : '';
  if (readme.startsWith(TEMPLATE_README_MARKER) && (await confirm('Replace the biberblog README with a README for this project?', true))) {
    fs.writeFileSync('README.md', projectReadme(repo?.slug ?? 'Website'));
    console.log('README.md replaced.');
  }
  const isBiberblogLicense =
    fs.existsSync('LICENSE') && fs.readFileSync('LICENSE', 'utf-8') === fs.readFileSync(SYSTEM_LICENSE, 'utf-8');
  if (isBiberblogLicense && (await confirm(`Remove the biberblog LICENSE from the project root? (It stays in ${SYSTEM_LICENSE}.)`, true))) {
    fs.unlinkSync('LICENSE');
    console.log('LICENSE removed.');
  }
  const contributing = fs.existsSync('CONTRIBUTING.md') ? fs.readFileSync('CONTRIBUTING.md', 'utf-8') : '';
  if (contributing.startsWith(TEMPLATE_CONTRIBUTING_MARKER) && (await confirm('Remove the biberblog CONTRIBUTING.md from the project root?', true))) {
    fs.unlinkSync('CONTRIBUTING.md');
    console.log('CONTRIBUTING.md removed.');
  }
}

export async function runSetup(): Promise<void> {
  const repo = gitRemoteRepo();
  const before = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf-8') : '';
  const { text, forVercel, missing } = await setUpEnv(before, repo);
  if (text !== before) {
    fs.writeFileSync(ENV_FILE, text);
    console.log(`${ENV_FILE} updated.`);
  } else {
    console.log(`${ENV_FILE} is up to date.`);
  }

  await initializeProject(repo);

  const vercelEntries = Object.entries(forVercel);
  if (vercelEntries.length > 0) {
    console.log('\nAdd these variables in Vercel (project → Settings → Environment Variables, Production and Development), then redeploy:\n');
    for (const [key, value] of vercelEntries) console.log(`${key}=${value}`);
    if (forVercel.EDITOR_PASSWORD_HASH) console.log('\n(Enter the password hash exactly as shown – unescaped – in Vercel.)');
  }
  if (missing.length > 0) {
    console.log(`\nStill missing locally: ${missing.join(', ')}.`);
    if (missing.some((key) => (VERCEL_PROVIDED_ENV_VARS as readonly string[]).includes(key))) {
      console.log('Run "vercel env pull .env.local" and then "npm run setup" again.');
    }
    console.log('Until everything is set, the site runs without editor mode.');
  }
}
