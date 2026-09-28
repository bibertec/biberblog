# Deliberate decisions & accepted risks

This document lists things that are deliberately **not** implemented or deliberately kept simple. They are not bugs or forgotten tasks. Changing one of these decisions is a product or architecture decision (see the decision boundaries in `AGENTS.md`).

Base assumption for all points: each website has **one** customer acting as editor, who updates content rarely. The developer manages GitHub and Vercel.

## Publish

### No conflict check; the merge base is the build state

`publishContent` merges the drafts onto the state of the `content.json` files from the **last build** (`pageRegistry`), not onto the current state of `main`.

- **Risk:** Changes that landed on `main` after the last build are silently overwritten by the next publish. This affects a manual content commit by the developer while the customer is in editor mode, and two devices editing at the same time. A second publish before the first one is live is practically impossible, because the editor stays in the waiting dialog until then and reloads afterwards (not guaranteed only after a timeout). Git reports no conflict, because the commit is always based on the current `main`.
- **Why accepted:** With a single editor who updates rarely, this is very unlikely. Conflict handling would make the code considerably more complex.
- **Rule for developers:** Do not change `src/project/content/*` by hand while the customer is actively editing.

### Deployment status only via the commit SHA, failures only via timeout

After publishing, the editor waits until its own production deployment serves the SHA of the new commit and then reloads the page (details: [Publish](./publish.md), "Waiting for the deployment"). There is deliberately no integration with the Vercel or GitHub API.

- **Consequence:** A failed build is only reported after 5 minutes (timeout), without a cause. The same applies if a newer commit happens to be deployed before our own.
- **Possible later:** Query the commit status on GitHub (Vercel reports the build result there) to detect failures after about one minute. This additionally requires the token permission "Commit statuses: read".

## Authentication

### No rate limiting on login

Login attempts are not limited. This keeps the code free of additional dependencies (no external store, no Vercel Firewall rule). Protection comes only from the computational cost of Argon2id and generic error messages. Therefore choose a **strong password**; the minimum length of 8 characters in the script is only a lower bound.

### One session for all devices, no revocation of individual sessions

- The session token only contains a fingerprint of the password hash plus the HMAC signature. It is identical for all devices and has no expiry date in the token itself (cookie with sliding expiry, approx. 1 year).
- "Log out" only removes the cookie in the current browser.
- **Risk:** A stolen session cookie remains valid until the password or `EDITOR_SESSION_SECRET` changes.
- **Ending all sessions:** Set a new password (`npm run editor:set-password`, store the new hash in Vercel, redeploy) or rotate `EDITOR_SESSION_SECRET`.

Details: [Authentication](./auth.md).

## GitHub & Vercel

### The developer manages GitHub and Vercel

- `GITHUB_TOKEN` is a fine-grained personal access token of the developer (Contents: Read & write, this repository only). Commits appear under the developer's identity; there is no separate bot user and no GitHub App.
- Depending on its settings, the token expires. After that, publishing fails with a GitHub error until the developer stores a new token in Vercel and redeploys. The developer has to keep track of the expiry date.
- Publishing only works if the token may push directly to `main`. Branch protection with required pull requests or required checks prevents publishing.

## Editor UX

### Drafts are not stored in the browser

Open drafts only live in memory (Zustand store). They are lost on reload or when the tab is closed; the `beforeunload` prompt warns about this. "Exit" and "Log out" discard them as well, after a confirmation ("Leave editor?") – otherwise they would silently reappear on the next "Edit". This way there are no stale drafts in `localStorage`/`sessionStorage`.

### SEO is maintained by the customer, only title and description

The SEO title and description of every page are edited in one dialog in the editor navbar, not per page and not by the developer. Deliberately only these two values: they cover search results and the browser tab; everything beyond (Open Graph, canonical, robots) stays with the developer in the page file or the layout. The recommended lengths are only shown as a hint, not enforced. See [SEO](./seo.md).

### The editor button is visible to all visitors on all pages

The entry point to the editor mode is deliberately a visible button in the layout – no dedicated route, no hidden keyboard shortcut. The button only appears when all required env variables are set (see [Authentication](./auth.md), "Feature gating").

### Vertical crop sliders need browsers from 2024 on

The zoom and vertical pan sliders of the image dialog are native range inputs rotated with `writing-mode: vertical-lr` (vertical form controls: Chrome/Edge 124+, Safari/iOS 17.4+, Firefox 120+).

- **Risk:** In older browsers (e.g. iPhone 8/X, which stop at iOS 16) these two sliders render as squeezed horizontal sliders and are practically unusable. Upload, horizontal pan, rotation, alt text and applying keep working. CSS cannot detect this (`@supports (writing-mode: …)` is also true in old browsers, because the property exists for text), and the legacy `appearance: slider-vertical` is deprecated.
- **Why accepted:** It only affects the editor, never the site's visitors, and there is one editor per project. A custom slider (`div` + pointer events, `role="slider"`) would work everywhere, but is only worth it once an affected customer exists.

## Project structure & updates

### Three zones in `src/`

`src/project/` belongs to the developer, `src/system/` is the editor and identical in every project, `src/generated/` is derived from the project (module folders, page JSON files) and never edited by hand. The rule "`src/system/` is the same everywhere" is what makes system updates simple and reviewable – changes to the system belong upstream, not into a single project.

### Registries are generated, not edited

`moduleRegistry`, `pageRegistry` and `pageLinks` are rewritten completely by `npm run generate` from their sources instead of being edited entry by entry. They are committed (reviewable diffs, type checks without a build step), regenerated before `dev`/`build`, and CI fails if they are outdated. A change of their format needs no migration.

### Page labels live in the page JSON

The name of a page in the editor (`label`) is a property of the page and lives in its content JSON. The generated `pageLinks.ts` copies it, so the client bundle does not contain all page contents.

### Minimal system surface outside `src/system/`

Outside `src/system/`, the system consists only of two thin route files, one line in the layout (`<BiberblogEditor />`), its CI workflow (`biberblog.yml`) and its entries in `package.json` – listed in `src/system/manifest.json`. Everything else in the repository belongs to the project and is never touched by the system.

### New projects: GitHub template + `npm run setup`

A new customer project is created from the GitHub template. `npm run setup` does the local preparation (`.env.local`, values for Vercel, project README); the Vercel project, blob store and dashboard variables stay manual steps.

### The placeholder image becomes a project asset

The placeholder of new image fields is copied from `src/system/assets/` into `public/images/` once. From then on it belongs to the project – publishing never deletes it and system updates never touch it.

### Updates: 3-way merge with Git, no npm package

No npm package – the code stays visible and editable in the project. `npm run system:update` merges the diff between two releases into the project with `git apply --3way`, moves the system entries in `package.json` to the new manifest and runs versioned migrations (details: [Updates](./update.md)).

- **Releases are Git tags** (`vX.Y.Z`, equal to `version` in the manifest). Projects update from release to release, and every migration belongs to exactly one version.
- **Git does the merge**, no own merge logic: familiar conflict markers, and new, removed, renamed and binary files are handled. The price: the release tags are fetched into the project repository (`refs/biberblog/*`, never pushed).
- **Nothing is committed automatically** – an update is reviewed like any other change.
- **Pull, not push:** every project fetches its updates itself. The upstream repository needs no list of projects and no access to them.
- **Planned:** a GitHub Action per project that runs the update and opens it as a pull request with a Vercel preview.
