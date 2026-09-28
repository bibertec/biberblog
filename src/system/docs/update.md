# Updates

Every project has its own copy of the system (`src/system/` plus the files listed in `src/system/manifest.json`). New versions are released in the upstream repository (`repository` in the manifest) and merged into a project with one command – no npm package, the code stays visible in the project.

## Commands

```bash
npm run system:status            # version, newer release, local changes to system files
npm run system:update            # update to the latest release
npm run system:update -- 1.2.0   # update to a specific release
```

Options (for both): `--repository <url or path>` uses another upstream repository (e.g. a local biberblog checkout for testing); `system:update` also accepts `--skip-install`.

Requirements: no uncommitted changes to tracked files, and access to the upstream repository (a public GitHub repository – no token needed).

## What an update does

1. Reads `version` and `repository` from the project's manifest. The target is the highest release tag `vX.Y.Z` of the repository, or the given version.
2. Fetches both release tags into `refs/biberblog/vX.Y.Z` – local refs that are never pushed (`git for-each-ref refs/biberblog` lists them, `git update-ref -d <ref>` removes one).
3. **System files:** applies the diff between the two releases, limited to `src/system/` and the `files` of both manifests, with `git apply --3way`. This is a 3-way merge: base = the old release, theirs = the new release, ours = the project. New, removed and renamed system files are included. The changes are staged.
4. **package.json:** the `dependencies`, `devDependencies` and `scripts` of the system follow the new manifest:

   | Project value | Result |
   |---|---|
   | missing or equal to the old manifest | set to the new value (new entries are added, entries no longer in the manifest are removed) |
   | changed by the project | kept and listed as "project values kept, please check" |

   Entries of the project itself are never touched.
5. **Migrations** of all versions after the old one up to the new one run in order (see below).
6. `npm install` (only if dependencies changed) and `npm run generate`.

Nothing is committed – review the result like any other change (`git status`, `git diff --staged`, `src/system/CHANGELOG.md`), run `npm run typecheck && npm run lint && npm run test`, then commit.

## Conflicts

If the project changed the same lines of a system file as the release, the file gets conflict markers (`ours` = project, `theirs` = release) and the command exits with code 1. Resolve the markers, then `git add <file>`, `npm run generate`, check and commit. To abort the whole update: `git reset --hard` (the working tree was clean before).

## Local changes to system files

`src/system/` is meant to be identical in every project. A fix or feature belongs upstream, released as a new version – a change in a single project is only a stopgap.

`npm run system:status` lists every deviation from the release the project is on (changed, added and deleted system files, and system entries in `package.json` with other values). Updates keep such changes as long as the release does not touch the same lines. Once a release contains the same change, the merge recognizes it and the deviation disappears.

## Migrations

Changes outside the system files – e.g. new keys in `src/project/config/translations.ts` or a changed line in `app/layout.tsx` – are made by a migration: `src/system/migrations/<version>.ts`, run by the update to that version.

```ts
export const description = 'Adds the editor texts for …';

export default function migrate(): void {
  // runs with the project root as working directory
}
```

- The update runs the migration code of the new release (read from disk after step 3).
- Only Node built-ins, relative imports with `.ts` extension – the file runs through Node's type stripping, like the other CLI scripts.
- Idempotent: running it twice, or on a project that already has the change, must do no harm. If it cannot make a change safely (e.g. the project rewrote the affected code), it prints what the developer has to do instead of failing.

## Releasing (upstream repository only)

1. Make and test the changes (`src/system/`, the files in the manifest, the manifest's `dependencies`/`devDependencies`/`scripts`). Add a migration if projects need changes outside the system files.
2. Raise `version` in `src/system/manifest.json` (patch: fix, minor: feature, major: change that needs manual steps) and add the entry in `src/system/CHANGELOG.md`.
3. Commit, tag and push – the tag is the release:

   ```bash
   git tag v1.2.0
   git push origin main v1.2.0
   ```

The tag must point to a commit whose manifest has exactly that version; the update refuses releases where they differ.

## Projects without `system:update`

Projects created from 1.0.0 do not have the command yet. Run the updater of a newer biberblog checkout once in the project root:

```bash
node ../biberblog/src/system/cli/bin/update.ts --repository https://github.com/bibertec/biberblog
```

`--repository` is needed because the 1.0.0 manifest still points to the old repository address. The updater only uses Node built-ins, so it runs from any checkout. Afterwards `npm run system:update` is available.

## Planned

A GitHub Action in every project (scheduled and manual) that runs `npm run system:update` and opens the result as a pull request with a Vercel preview.
