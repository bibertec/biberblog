---
name: system-update
description: Updates the biberblog system of a project to a newer release with `npm run system:update` – checks local changes to system files first, explains what the release brings, resolves merge conflicts with the release diff, finishes the manual steps of migrations and runs the CI checks. Use when the user wants to update biberblog, the system or the editor, or asks whether a newer release is available.
---

# System update

Brings the project's copy of the biberblog system to a newer release. `npm run system:update` does the merge; this skill prepares it, explains it and finishes it. How the update works: `src/system/docs/update.md`.

If the user named a version (e.g. `/system-update 1.6.0`), update to that release; otherwise to the latest one. Nothing is committed – neither by the command nor by you.

## 1. Check the starting point

- **Template repository:** if `git remote get-url origin` is the `repository` from `src/system/manifest.json` (ignoring `.git` and a trailing slash), this is biberblog itself – stop: releases are made there, not merged in (`src/system/docs/update.md`, "Releasing").
- **Working tree:** `git status --porcelain --untracked-files=no` must be empty – the update refuses otherwise, so that it stays a diff of its own. If not, show the changes and ask the user to commit or stash them; don't do it yourself.
- **Branch:** suggest running the update on its own branch (e.g. `chore/biberblog-<version>`) and create it if the user agrees.

## 2. Status and local changes

Run `npm run system:status`. It shows the project's version (`<from>`), the latest release (`<to>`, or the version the user named) and every deviation from release `<from>`.

- **Up to date:** say so and stop.
- **Fetch the target release** (the same local ref the update uses, never pushed):

  ```bash
  git fetch --no-tags --quiet <repository> +refs/tags/v<to>:refs/biberblog/v<to>
  ```

- **What's coming:** read the entries between `<from>` and `<to>` in `git show refs/biberblog/v<to>:src/system/CHANGELOG.md` and summarize them in a few lines – especially new opt-ins, manual steps and anything a major version requires.
- **Local changes to system files:** for each file `system:status` lists, look at `git diff refs/biberblog/v<from> -- <file>` and explain in one line what the project changed. Then check which of them the release changes too – there the merge may conflict:

  ```bash
  git diff --name-only refs/biberblog/v<from> refs/biberblog/v<to> -- <files listed by system:status>
  ```

  If the release contains the same fix, say so – the deviation disappears with the merge.
- **package.json deviations:** name them; the update keeps project values and reports them.

If there are local changes to system files, **ask before updating** and say which files may conflict. Without local changes, summarize what's coming and continue.

## 3. Run the update

```bash
npm run system:update            # latest release
npm run system:update -- <to>    # the version the user named
```

The output lists the staged system files, the `package.json` changes, the migrations that ran (with their messages) and conflicts. Exit code 1 means conflicts or a failed `npm install`/`npm run generate` – read the output; don't simply run it again.

## 4. Resolve conflicts

Conflicted files contain markers: `ours` = the project, `theirs` = the release. For each file, compare both intentions:

```bash
git diff refs/biberblog/v<from> refs/biberblog/v<to> -- <file>   # what the release changed
git diff refs/biberblog/v<from> HEAD -- <file>                    # what the project changed
```

- The release already does what the local change did (same fix, or it replaces it): take the release version.
- The local change is still needed: take the release version and re-apply the local change on top of it, adapted to the new code.
- If the intentions contradict each other or you're unsure, show both sides and ask the user.

Remove every marker, then `git add <file>`. Once no conflicts are left (`git diff --name-only --diff-filter=U` is empty), run `npm run generate` – the update skips it while conflicts exist.

Local changes that stay after the update remain deviations from the release. Suggest bringing them upstream (an issue or pull request in the biberblog repository) so they don't have to be merged again with every release.

## 5. Finish migrations and package.json

- **Migration messages:** a migration prints what it could not do automatically ("Could not change … automatically", "translate them if …"). Do these steps in the project files – e.g. translate new editor texts in `src/project/config/translations.ts` into the language of the existing texts, or make the change by hand that the migration describes. Show what you changed.
- **"project values kept, please check":** for each entry, explain the project's value and the new system value, and recommend one. Change it only after the user agrees, then run `npm install` if a dependency changed.
- **Opt-ins from the CHANGELOG** that `system:update` doesn't apply (e.g. project-owned files to copy by hand): offer them, don't apply them unasked.

## 6. Check

```bash
npm run generate -- --check
npm run lint
npm run typecheck
npm run test
```

If project code (modules, pages, `src/project/`) no longer fits the new system, fix it according to the CHANGELOG. Don't change system files to make project code work – that creates new deviations.

Then report to the user:

- `<from>` → `<to>` and the most important changes from the CHANGELOG,
- conflicts and how they were resolved, local changes that remain,
- migrations and the manual steps you did,
- open points (opt-ins, kept `package.json` values),
- the check results.

Suggest the commit (`chore: update biberblog system to <to>`) and how to abort the whole update (`git reset --hard`, the working tree was clean before). Don't commit.
