# Editor mode authentication

Reference for the authentication concept of the editor mode. For the setup itself (setting env variables) see the "Quickstart" section in the README.

## Concept

- Exactly one editor password per project/deployment. No username, no user management, no roles, no password reset flow, no external auth provider.
- The plain-text password is never stored. The developer hashes it locally (Argon2id) with a script and stores the hash as `EDITOR_PASSWORD_HASH`. A second value, `EDITOR_SESSION_SECRET`, signs the session cookie via HMAC.

## Session token

- The token payload only contains a short fingerprint of `EDITOR_PASSWORD_HASH` – deliberately no expiry date in the payload and no separate `EDITOR_SESSION_VERSION`.
- When the developer changes the password, the hash and therefore the fingerprint change automatically – existing sessions become invalid on the next check without any explicit versioning.

## Cookie

- HttpOnly, Secure, SameSite, Max-Age approx. 1 year.
- Sliding expiry: every successful session check sets the cookie again with a fresh lifetime. Goal: customers practically never have to enter their password again.

## Static rendering is preserved

- Server Components must not read `cookies()` while rendering – that would render the page dynamically and break the core promise of a "static website".
- The session check therefore runs on the client, triggered by clicking the editor button.
- Plain `process.env` access (e.g. in `isEditorModeConfigured()`) is not affected: Next.js does not count it as a "dynamic API" because the value is constant per deployment (not per request like `cookies()`).

## UX flow

1. Click on the editor button → the button turns into a spinner while `checkEditorSession()` runs.
2. Valid session → switch directly into editor mode + editor navbar (incl. logout).
3. No/invalid session → a dialog with a password field opens, without an error message. A generic error message only appears after an actually failed login attempt.
4. Logout only removes the local auth cookie of the current browser/device. Ending all sessions is only possible with a new password or a new `EDITOR_SESSION_SECRET` (see [Decisions](./decisions.md)).

## Mechanism: Server Actions

`checkEditorSession`, `loginEditor` and `logoutEditor` are Server Actions (not Route Handlers) – idiomatic for App Router mutations and co-located with the components. Next.js automatically protects Server Actions with an origin check, which covers CSRF for these actions without extra effort.

## Rate limiting

Deliberately none – rationale and risk: see [Decisions](./decisions.md). Protection comes only from the computational cost of Argon2id and generic error messages.

## Feature gating

`isEditorModeConfigured()` (in `session.ts`) checks a list of required env vars (`REQUIRED_EDITOR_ENV_VARS` in `session.ts` – look up the current list there instead of duplicating it here; it includes `EDITOR_PASSWORD_HASH`/`EDITOR_SESSION_SECRET` as well as the publish- and image-specific variables, see [Publish](./publish.md)/[Image](./images.md)). If anything is missing:

- `<BiberblogEditor />` in the root layout renders nothing at all (no broken button for visitors).
- A `console.warn` listing the missing variable names is logged once (throttled via a module flag) – it ends up in the server/build logs, not in the rendered HTML.

Future editor features simply add more names to `REQUIRED_EDITOR_ENV_VARS`.

**Exception `VERCEL_OIDC_TOKEN`:** on Vercel it is an environment variable only during the build; at runtime, functions receive the token per request (header `x-vercel-oidc-token`, read by `@vercel/blob` itself). `isEditorModeConfigured()` therefore skips it when `VERCEL` is set. Without this exception, every runtime render hid the editor – visible after "Edit": `checkEditorSession()` refreshes the session cookie, a cookie change in a server action re-renders the route on the server, and the layout came back without `<BiberblogEditor />`. The fields were editable (the store said "editor mode"), but the navbar was gone. The static HTML from the build still had the edit button, so the bug only showed up after entering editor mode – on every device.

## Pitfalls

- **`$` escaping in `.env.local`:** Argon2id hashes contain many `$` characters (`$argon2id$v=19$...`). Next.js automatically expands `$VAR` references in `.env*` files (`dotenv-expand`) – every `$` in the hash must be escaped there as `\$`, otherwise the hash is silently corrupted while parsing and the login fails without a visible error. This only applies to local `.env*` files; variables entered in the Vercel dashboard are not expanded, so enter the hash unescaped there.
- **Hex parsing when verifying the signature:** `Buffer.from(str, 'hex')` does not throw on invalid or surplus characters but silently returns only the valid beginning. An appended character (`token + 'x'`) would therefore be ignored and the signature still accepted. That is why `verifySessionToken` checks before hex parsing that `token.split('.')` yields exactly two parts and that the signature is exactly 64 characters long (SHA-256 hex).

## Files

All auth files live under `src/system/*` (biberblog's tool infrastructure), not under `src/project/*` (customer project content):

- `src/system/lib/auth/session.ts` (`server-only`) – `createSessionToken`, `verifySessionToken`, `isEditorModeConfigured`, constants `SESSION_COOKIE_NAME` / `SESSION_MAX_AGE_SECONDS`.
- `src/system/lib/auth/actions.ts` (`'use server'`) – `checkEditorSession`, `loginEditor`, `logoutEditor`.
- `src/system/scripts/auth/set-editor-password.ts` – generates the Argon2id hash for `EDITOR_PASSWORD_HASH` (`npm run editor:set-password`).
