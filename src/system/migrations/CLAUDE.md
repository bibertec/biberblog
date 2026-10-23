# biberblog migrations

Guidance for Claude Code on `src/system/migrations/`. Part of the system, kept up to date by `npm run system:update`.

- A migration is needed whenever a system change requires a change in a project-owned file that `system:update` doesn't touch – e.g. new keys in `src/project/config/translations.ts`, `src/project/content/imageFieldRegistry.ts`, a line in `app/layout.tsx`, the root `CLAUDE.md`.
- One file per release: `<version>.ts` (only files matching `x.y.z.ts` are picked up) plus `<version>.test.ts`. Export `description` and a default `migrate()` that runs with the project root as working directory. Use the upcoming version; the maintainer renames it if the release gets another number.
- Only Node built-ins and relative `.ts` imports (native type stripping).
- Idempotent: running twice or on an already-changed project does no harm. If a change can't be made safely (the project rewrote the code), print what the developer has to do instead of failing.
- Keep the transformation in an exported pure function (`source → result`) and test that; `migrate()` only reads and writes the file. Examples: `1.5.0.ts`, `1.6.0.ts`.
- Mention the migration in `src/system/CHANGELOG.md`.

Details: `src/system/docs/update.md`, "Migrations".
