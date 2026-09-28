import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

/**
 * `npm run system:update [-- <version>]` and `npm run system:status`: keep the project's copy of
 * the biberblog system up to date (see `src/system/docs/update.md`).
 *
 * The system is `src/system/` plus the files listed in `manifest.json`. An update is a 3-way merge
 * done by Git: base = the release the project is on (`version` in its manifest), theirs = the
 * target release, ours = the project. Both release tags are fetched from `manifest.repository`
 * into `refs/biberblog/*` (local refs, never pushed), and their diff – limited to the system
 * files – is applied with `git apply --3way`. Local changes to system files survive; changes to
 * the same lines end up as conflict markers.
 *
 * Afterwards the system entries in package.json follow the new manifest, the migrations of the new
 * versions run, then `npm install` and `npm run generate`. Nothing is committed.
 *
 * Only Node built-ins are imported, so a project whose system has no updater yet can run this file
 * from a newer biberblog checkout: `node <biberblog>/src/system/cli/bin/update.ts`.
 */

export type Manifest = {
  version: string;
  repository: string;
  files: string[];
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
};

type PackageSection = 'dependencies' | 'devDependencies' | 'scripts';
type PackageJson = Partial<Record<PackageSection, Record<string, string>>> & Record<string, unknown>;

const MANIFEST_FILE = 'src/system/manifest.json';
const SYSTEM_DIR = 'src/system';
const MIGRATIONS_DIR = 'src/system/migrations';
const PACKAGE_SECTIONS: PackageSection[] = ['dependencies', 'devDependencies', 'scripts'];

export class UpdateError extends Error {}

// --- pure helpers -----------------------------------------------------------------------------

const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)$/;

/** `1.2.3` for `1.2.3` or `v1.2.3`, `undefined` for anything else (no pre-releases). */
export function normalizeVersion(value: string): string | undefined {
  const match = VERSION_PATTERN.exec(value.trim());

  return match ? `${match[1]}.${match[2]}.${match[3]}` : undefined;
}

export function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (partsA[i] !== partsB[i]) return partsA[i] - partsB[i];
  }

  return 0;
}

/** Highest release in the output of `git ls-remote --tags --refs` (`<sha>\trefs/tags/v1.2.3`). */
export function latestRelease(lsRemoteOutput: string): string | undefined {
  return lsRemoteOutput
    .split('\n')
    .map((line) => normalizeVersion(line.split('refs/tags/')[1] ?? ''))
    .filter((version): version is string => version !== undefined)
    .sort(compareVersions)
    .at(-1);
}

/** Paths that belong to the system in any of the given manifests (for `git diff -- <paths>`). */
export function systemPaths(...manifests: Manifest[]): string[] {
  return [...new Set([SYSTEM_DIR, ...manifests.flatMap((manifest) => manifest.files)])].sort();
}

function sortKeys(entries: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b, 'en')));
}

export type PackageMerge = { pkg: PackageJson; changed: string[]; kept: string[] };

/**
 * Moves the system entries of package.json from the old to the new manifest. An entry only changes
 * where the project still has the old system value (or none) – values the project changed on
 * purpose are kept and reported. Dependencies stay sorted like npm writes them.
 */
export function mergePackageJson(pkg: PackageJson, from: Manifest, to: Manifest): PackageMerge {
  const result: PackageJson = structuredClone(pkg);
  const changed: string[] = [];
  const kept: string[] = [];

  for (const section of PACKAGE_SECTIONS) {
    const entries = { ...result[section] };
    const oldEntries = from[section] ?? {};
    const newEntries = to[section] ?? {};

    for (const [name, value] of Object.entries(newEntries)) {
      const current = entries[name];
      if (current === value) continue;
      if (current === undefined || current === oldEntries[name]) {
        entries[name] = value;
        changed.push(`${section}.${name}: ${current ?? '(new)'} → ${value}`);
      } else {
        kept.push(`${section}.${name}: project value ${current} kept (system: ${oldEntries[name] ?? '–'} → ${value})`);
      }
    }

    for (const [name, oldValue] of Object.entries(oldEntries)) {
      if (name in newEntries || !(name in entries)) continue;
      if (entries[name] === oldValue) {
        delete entries[name];
        changed.push(`${section}.${name}: removed`);
      } else {
        kept.push(`${section}.${name}: no longer part of the system, project value ${entries[name]} kept`);
      }
    }

    if (section in result || Object.keys(entries).length > 0) {
      result[section] = section === 'scripts' ? entries : sortKeys(entries);
    }
  }

  return { pkg: result, changed, kept };
}

/** Migrations to run for an update from `from` (exclusive) to `to` (inclusive), in order. */
export function selectMigrations(available: string[], from: string, to: string): string[] {
  return available
    .filter((version) => compareVersions(version, from) > 0 && compareVersions(version, to) <= 0)
    .sort(compareVersions);
}

// --- git, files, processes ----------------------------------------------------------------------

type GitResult = { status: number; stdout: string; stderr: string };

function git(args: string[], input?: string): GitResult {
  const result = spawnSync('git', args, {
    input,
    encoding: 'utf-8',
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  });
  if (result.error) throw new UpdateError(`git could not be started: ${result.error.message}`);

  return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
}

function gitOrFail(args: string[], input?: string): string {
  const result = git(args, input);
  if (result.status !== 0) throw new UpdateError(`git ${args[0]} failed:\n${result.stderr.trim()}`);

  return result.stdout;
}

function lines(text: string): string[] {
  return text.split('\n').filter(Boolean);
}

const releaseRef = (version: string) => `refs/biberblog/v${version}`;

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
}

function readLocalManifest(): Manifest {
  if (!fs.existsSync(MANIFEST_FILE)) {
    throw new UpdateError(`${MANIFEST_FILE} not found – run this in the root folder of a biberblog project.`);
  }

  return readJson<Manifest>(MANIFEST_FILE);
}

function listReleases(repository: string): string {
  const result = git(['ls-remote', '--tags', '--refs', repository, 'refs/tags/v*']);
  if (result.status !== 0) {
    throw new UpdateError(`Could not read the releases of ${repository}:\n${result.stderr.trim()}`);
  }

  return result.stdout;
}

function fetchReleases(repository: string, versions: string[]): void {
  const refspecs = [...new Set(versions)].map((version) => `+refs/tags/v${version}:${releaseRef(version)}`);
  const result = git(['fetch', '--no-tags', '--quiet', repository, ...refspecs]);
  if (result.status !== 0) {
    const tags = versions.map((version) => `v${version}`).join(', ');
    throw new UpdateError(`Could not fetch ${tags} from ${repository}:\n${result.stderr.trim()}`);
  }
}

function manifestAt(version: string): Manifest {
  return JSON.parse(gitOrFail(['show', `${releaseRef(version)}:${MANIFEST_FILE}`])) as Manifest;
}

function conflictedFiles(): string[] {
  return lines(gitOrFail(['diff', '--name-only', '--diff-filter=U']));
}

function run(command: string, args: string[]): boolean {
  return spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' }).status === 0;
}

function availableMigrations(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];

  return fs
    .readdirSync(MIGRATIONS_DIR)
    .map((file) => /^(\d+\.\d+\.\d+)\.ts$/.exec(file)?.[1])
    .filter((version): version is string => version !== undefined);
}

type Migration = { default: () => unknown; description?: string };

/** Runs the migrations of the new versions – read from disk, i.e. the code of the new release. */
async function runMigrations(from: string, to: string): Promise<string[]> {
  const done: string[] = [];
  for (const version of selectMigrations(availableMigrations(), from, to)) {
    const file = pathToFileURL(path.resolve(MIGRATIONS_DIR, `${version}.ts`)).href;
    const migration = (await import(file)) as Migration;
    await migration.default();
    done.push(migration.description ? `${version}: ${migration.description}` : version);
  }

  return done;
}

function parseCliArgs(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      repository: { type: 'string' },
      'skip-install': { type: 'boolean', default: false },
    },
  });

  return { version: positionals[0], repository: values.repository, skipInstall: values['skip-install'] };
}

function printSection(title: string, entries: string[]): void {
  if (entries.length === 0) return;
  console.log(`\n${title}:`);
  for (const entry of entries) console.log(`  ${entry}`);
}

// --- commands -----------------------------------------------------------------------------------

export async function runUpdate(args: string[]): Promise<void> {
  const options = parseCliArgs(args);
  const local = readLocalManifest();
  const repository = options.repository ?? local.repository;
  const from = local.version;

  if (gitOrFail(['status', '--porcelain', '--untracked-files=no']).trim()) {
    throw new UpdateError('The working tree has uncommitted changes – commit or stash them first, so the update stays a diff of its own.');
  }

  const to = options.version ? normalizeVersion(options.version) : latestRelease(listReleases(repository));
  if (!to) {
    throw new UpdateError(
      options.version ? `"${options.version}" is not a version (e.g. 1.2.0).` : `No releases (tags vX.Y.Z) found in ${repository}.`,
    );
  }
  if (compareVersions(to, from) <= 0) {
    console.log(`The system is on ${from}${options.version ? '' : ' (latest release)'} – nothing to update.`);
    return;
  }

  console.log(`Updating the biberblog system from ${from} to ${to} (${repository}) …`);
  fetchReleases(repository, [from, to]);
  const fromManifest = manifestAt(from);
  const toManifest = manifestAt(to);
  for (const [version, manifest] of [[from, fromManifest], [to, toManifest]] as const) {
    if (manifest.version !== version) {
      throw new UpdateError(`Release tag v${version} contains manifest version ${manifest.version} – the release is broken.`);
    }
  }
  const paths = systemPaths(fromManifest, toManifest);

  // 1. System files: 3-way merge of the release diff into the project.
  const files = lines(gitOrFail(['diff', '--name-status', releaseRef(from), releaseRef(to), '--', ...paths]));
  const patch = gitOrFail(['diff', '--binary', '--full-index', releaseRef(from), releaseRef(to), '--', ...paths]);
  if (patch.trim()) {
    const applied = git(['apply', '--3way', '--whitespace=nowarn'], patch);
    if (applied.status !== 0 && conflictedFiles().length === 0) {
      throw new UpdateError(`The system files could not be updated (check "git status"):\n${applied.stderr.trim()}`);
    }
  }
  const conflicts = conflictedFiles();

  // 2. package.json: system entries follow the new manifest.
  const merge = mergePackageJson(readJson<PackageJson>('package.json'), fromManifest, toManifest);
  if (merge.changed.length > 0) fs.writeFileSync('package.json', `${JSON.stringify(merge.pkg, null, 2)}\n`);

  // 3. Migrations of the new versions (changes outside of the system files).
  const migrations = await runMigrations(from, to);

  // 4. Dependencies and generated files.
  const dependenciesChanged = merge.changed.some((entry) => !entry.startsWith('scripts.'));
  const installFailed = dependenciesChanged && !options.skipInstall && !run('npm', ['install']);
  const generateFailed = conflicts.length === 0 && !run('npm', ['run', 'generate']);

  console.log(`\nbiberblog system ${from} → ${to}`);
  printSection('System files (staged)', files);
  printSection('package.json', merge.changed);
  printSection('package.json – project values kept, please check', merge.kept);
  printSection('Migrations', migrations);
  printSection('Conflicts – resolve the conflict markers, then run "npm run generate"', conflicts);
  if (installFailed) console.log('\n"npm install" failed – run it again before continuing.');
  if (dependenciesChanged && options.skipInstall) console.log('\nDependencies changed – run "npm install".');
  if (generateFailed) console.log('\n"npm run generate" failed – see the output above.');

  console.log(`
Next steps:
  1. Review the changes: git status, git diff --staged, src/system/CHANGELOG.md
  2. Check: npm run typecheck && npm run lint && npm run test
  3. Commit: git add -A && git commit -m "chore: update biberblog system to ${to}"`);

  if (conflicts.length > 0 || installFailed || generateFailed) process.exitCode = 1;
}

export async function runStatus(args: string[]): Promise<void> {
  const options = parseCliArgs(args);
  const local = readLocalManifest();
  const repository = options.repository ?? local.repository;
  const { version } = local;

  console.log(`biberblog system ${version} (${repository})`);
  let latest: string | undefined;
  try {
    latest = latestRelease(listReleases(repository));
  } catch (error) {
    console.log(`\n${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
    return;
  }
  if (latest && compareVersions(latest, version) > 0) {
    console.log(`Newer release available: ${latest} – run "npm run system:update".`);
  } else {
    console.log('Up to date.');
  }

  fetchReleases(repository, [version]);
  const paths = systemPaths(manifestAt(version), local);
  const changed = lines(gitOrFail(['diff', '--name-status', releaseRef(version), '--', ...paths]));
  const untracked = lines(gitOrFail(['ls-files', '--others', '--exclude-standard', '--', ...paths])).map(
    (file) => `?\t${file}`,
  );
  const pkg = readJson<PackageJson>('package.json');
  const packageDeviations = PACKAGE_SECTIONS.flatMap((section) =>
    Object.entries(local[section] ?? {})
      .filter(([name, value]) => pkg[section]?.[name] !== value)
      .map(([name, value]) => `${section}.${name}: project ${pkg[section]?.[name] ?? '(missing)'}, system ${value}`),
  );

  if (changed.length + untracked.length + packageDeviations.length === 0) {
    console.log(`\nNo local changes to the system – identical to release ${version}.`);
    return;
  }
  printSection(`System files changed locally (compared to release ${version})`, [...changed, ...untracked]);
  printSection('package.json differs from the manifest', packageDeviations);
  console.log(`
Local changes to system files are kept by updates as long as the release does not change the same
lines. Fixes and features belong upstream (${repository}), so every project gets them.`);
}

export function reportError(error: unknown): void {
  if (error instanceof UpdateError) console.error(`\n${error.message}`);
  else console.error(error);
  process.exitCode = 1;
}
