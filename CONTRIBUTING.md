<!-- biberblog:template-contributing -->

# Contributing to biberblog

Thanks for your interest in biberblog! Bug reports, fixes, documentation improvements and ideas are all welcome.

biberblog is maintained by a single developer and is meant to stay small, predictable and easy to update in every project. This guide explains what fits, where changes belong and what a pull request needs.

## Before you start

- Read the [README](README.md), especially "Requirements & limitations". biberblog is built for **one editor per website** who updates content occasionally, on **GitHub + Vercel**. Several editors, roles, other hosting providers or frequently published content are out of scope – for these, an established CMS is the better fit.
- Read [`src/system/docs/decisions.md`](src/system/docs/decisions.md). It lists what is deliberately **not** implemented (e.g. no conflict check on publish, no login rate limiting) and why. These are not bugs – changing one of them is a product decision and needs an issue first.

## Ways to contribute

### Report a bug

Open an issue and include:

- the biberblog version (`npm run system:status`, or `version` in `src/system/manifest.json`) and your Node.js version,
- the steps to reproduce, what you expected and what happened instead,
- relevant log lines – biberblog prefixes its messages with `[biberblog]` (dev server terminal, Vercel build and function logs),
- whether your project has local changes to `src/system/` (`npm run system:status` lists them).

Never post the contents of `.env.local`, tokens or password hashes.

### Report a security issue

Please do **not** open a public issue. Report it privately via [GitHub's private vulnerability reporting](https://github.com/bibertec/biberblog/security/advisories/new) instead.

### Suggest a feature

Open an issue that describes the use case – what the customer or the developer wants to achieve – rather than a specific implementation. The approach is agreed on there, before any code is written.

### Open a pull request

| Change | How |
| --- | --- |
| Bug fix, documentation fix, missing test, small improvement | Open a pull request directly. |
| New feature or field type, new dependency, change to the CLI or the file structure, anything listed in `decisions.md` | Open an issue first and wait for agreement. |

Pull requests that skip this agreement may be closed, even if the code is good – this is about keeping biberblog small, not about the quality of your work.

## Where changes belong

This repository is the template every project is created from. It has three zones (details: [`src/system/docs/architecture.md`](src/system/docs/architecture.md)):

| Zone | Role in this repository |
| --- | --- |
| `src/system/` | The editor, identical in every project – most contributions go here. |
| System files outside `src/system/` | The files and `package.json` entries listed in `src/system/manifest.json` (route files, CI workflow, dependencies, scripts). |
| `src/project/`, `app/`, `public/` | The empty starting point of new projects. Change it only if new projects need it. |
| `src/generated/` | Never edited by hand – run `npm run generate`. |

- **Existing projects receive changes through `npm run system:update`**, which only merges the system files (see [`src/system/docs/update.md`](src/system/docs/update.md)). If they also need a change outside them – e.g. a new key in `src/project/config/translations.ts` or a changed line in `app/layout.tsx` – add a migration in `src/system/migrations/`.
- **Found the bug in your own project?** Fix it here, not only there. `npm run system:status` shows your project's local changes to the system – a good starting point for a pull request.

## Development setup

You need Node.js as specified in `.nvmrc`.

```bash
npm install
npm run dev
```

Without the environment variables, the site runs without editor mode – enough for many changes (CLI, renderers, docs, tests). To try the full editor flow (login, image upload, publish), set up your own GitHub repository, Vercel project and blob store as described in the README's "Quickstart".

- Publishing commits to `main` of the repository configured in `.env.local` and triggers a production deployment. Use a test repository for this.
- In a fork, `npm run setup` treats the repository like a new project and offers to replace the README and remove `LICENSE` and this file – answer "no" to these questions.

## Guidelines

- **Keep changes focused.** One concern per pull request, no unrelated refactorings or reformatting.
- **The website stays static.** Code that runs while pages render must not use request-time APIs such as `cookies()` or `headers()`. Editor code is loaded lazily when it is needed, so it never weighs on the website itself.
- **Server first.** Server Components by default; `'use client'` only where interactivity requires it, as small and as deep in the tree as possible. Server Actions for mutations from the UI; route handlers only where they are required (e.g. binary uploads).
- **Validate input with Zod** – Server Action payloads, content and API responses.
- **Tailwind utilities only.** No new CSS files, and no arbitrary values unless there is no alternative.
- **Texts:** everything the customer sees in the editor goes into the translations (type `EditorTranslations` in `src/system/config/editorTranslations.ts`, values in `src/project/config/translations.ts`). Code comments, logs and developer-facing messages are written in English.
- **Phones first:** the editor is designed for editing on a phone. Check editor UI changes on a small viewport, ideally in iOS Safari as well (see "Editor UI on phones" in [`architecture.md`](src/system/docs/architecture.md)).
- **Dependencies:** only with a concrete reason, agreed in an issue. New system dependencies go into `src/system/manifest.json` and the dependency table in `architecture.md`.
- **CLI:** the generators change existing files via the syntax tree – read [`src/system/docs/plop.md`](src/system/docs/plop.md) before changing them.
- **Docs:** update the matching document in `src/system/docs/` (and the README, if affected) in the same pull request.

## Checks

Run the same checks as CI (`.github/workflows/biberblog.yml`) before opening a pull request:

```bash
npm run generate -- --check
npm run lint
npm run typecheck
npm run test
```

Tests live next to the code they test (`*.test.ts`, Vitest). A bug fix should come with a test that fails without it, wherever that is practical.

## Commits and pull requests

- Commit subjects follow the [Conventional Commits](https://www.conventionalcommits.org/) style, e.g. `fix(system): …`, `feat(system): …`, `docs: …`.
- In the pull request, describe what changes for existing projects and suggest an entry for `src/system/CHANGELOG.md`, including any manual steps.
- Do **not** change `version` in `src/system/manifest.json` and do not create tags. Releases are made by the maintainer (see "Releasing" in [`update.md`](src/system/docs/update.md)); the version of a new migration is set then as well.

## License

By contributing, you agree that your contribution is licensed under the project's [MIT License](LICENSE).
