# Publish

Reference for the publish flow: how editing drafts from the editor mode are finally written into the `content.json` files and committed to GitHub. For the high-level overview see `architecture.md`, for auth-specific details see [Authentication](./auth.md), for the draft store see [Store](./store.md), for image-specific processing see [Image](./images.md).

## Concept

- A publish always includes all open drafts of the current session, across any number of pages – never just a single page.
- All affected `content.json` files are pushed to `main` in exactly one commit, with the fixed commit message `content: customer update`.
- The commit automatically triggers a new Vercel deployment; after approx. 30–60 seconds the change is live. The editor waits for it (see "Waiting for the deployment") and then reloads the page.
- Deliberately no conflict check and no editor lock: the merge base is the content state of the **last build** (`pageRegistry`), not the current state of `main`. The new commit is always based on the current `main`, so there is no Git conflict. Changes that landed on `main` since the last build are, however, silently overwritten. This is an accepted risk, see [Decisions](./decisions.md). The final ref update only fails if `main` changes exactly during the few API calls of a publish (no force push).
- Image drafts (`EditableImage`, also image item fields inside a collection) are detected automatically during the merge (`tempImageDraftSchema.safeParse`) and processed on the server into a finished `public/images/*.webp` before the commit runs – **one** commit then contains both the changed `content.json` files and the new image(s). Details on crop processing: [Image](./images.md).

## pageRegistry.ts

Generated file `src/generated/pageRegistry.ts` (see [Plop templates](./plop.md), "Generated registries"). Deliberately static (no `fs.readdirSync` at runtime) for two reasons: the website is fully predefined anyway, and a dynamically computed `fs` path is not reliably included in the serverless bundle by Next.js' file tracing on Vercel – a static import is.

```ts
export const pageRegistry = {
  '/': { repoPath: 'src/project/content/home.json', content: homeContent },
} satisfies Record<string, PageRegistryEntry>;
```

- Key: URL pathname, identical to the pathname part of the store's `draftKey`.
- `repoPath`: Git path of the file for the commit.
- `content`: the state bundled at build time – also serves as the merge base for publishing (saves an extra GitHub read).
- `satisfies Record<string, PageRegistryEntry>` lets TypeScript check at build time that every content file matches the `PageContent` shape.
- Generated together with the lightweight page list `pageLinks.ts` (see [Richtext](./richtext.md)) from the same JSON files – the two cannot drift apart.

## GitHub client (`src/system/lib/publish/github.ts`)

A plain fetch wrapper around the GitHub Git Data API; it knows nothing about drafts, pages or the commit message – it takes finished file contents + a message. Its only public function is `commitFiles(files, message)`. It supports writing (`FileWrite`, UTF-8 or base64) and deleting (`FileDelete`) files in the same commit.

Steps per call:

1. Read the current `main` ref (`GET .../git/ref/heads/main`).
2. Read the corresponding tree SHA via the commit.
3. Create a blob for each changed file.
4. Create a new tree (`base_tree` = current tree).
5. Create a new commit (`parents` = current `main` SHA).
6. Update the `main` ref to the new commit (`PATCH .../git/refs/heads/main`, deliberately without `force`).

**Retry policy:** automatic retries only for network errors or 5xx responses (max. 3 attempts, 4 seconds apart). A 4xx (wrong token, missing permissions, non-fast-forward on the ref update) is passed on immediately as an error, without retry.

**Two GitHub API quirks**, implemented this way on purpose: reading the ref uses the singular path `/git/ref/heads/main`, updating it uses the plural path `/git/refs/heads/main` – not an inconsistency in the code but a real quirk of the GitHub API itself.

The commit author is not overridden – it automatically appears under the identity that owns `GITHUB_TOKEN` (deliberately no separate bot user, see [Decisions](./decisions.md)).

## Merge & validation (`src/system/lib/publish/actions.ts`)

`publishContent(drafts)` (Server Action, `'use server'`):

1. **Session check** via the existing `checkEditorSession()` (see [Authentication](./auth.md)) – no valid session, no publish.
2. **Merge:** Drafts are grouped by pathname; for each pathname a `structuredClone` copy of `pageRegistry[pathname].content` is used as the base (the clone is mandatory; otherwise a warm serverless context would permanently mutate the imported registry object across requests). Each draft key is resolved via `parseDraftKey` (pathname/fieldId, counterpart of `draftKey` from the [Store](./store.md)). The SEO draft of a page (fieldId `seo`) is validated with `seoSchema` and written into the page's `seo` section (see [SEO](./seo.md)); all other field ids are resolved via `parseFieldId` (module instance id/field name, format `moduleId.fieldName`). An image draft – as the field value or as an item field value inside a collection – is additionally detected (`tempImageDraftSchema.safeParse`) and resolved via `resolveImageDraft` (load temp blob, crop/resize via `sharp`, see [Image](./images.md)) into the final `{ src, alt }` value before it is written into the copy. All other draft types are taken over unchanged – including an image draft that only changes the alt text (`{ src, alt }`, see [Image](./images.md)); the image is then not reprocessed.
3. **Validation (two levels), before every commit:**
   - `pageContentSchema.parse(content)` checks the envelope (`seo`/`modules`).
   - In addition, every module instance is parsed against its `moduleRegistry` schema (`moduleRegistry[type].schema.parse(...)`) – this is the actual protection, because `pageContentSchema` itself has `content: z.unknown()` and does not check field values at all.
   - The **parse result** is committed, not the input. Zod strips unknown keys in the process, so only fields from the module schema end up in `content.json`.
4. **Cleaning up replaced images:** When an image is replaced, the new WEBP always gets a new file name. Every image the changed field referenced before (including images of replaced or removed collection items) is deleted in the same commit if it was produced by the publish flow (file name `<uuid>.webp`) and is no longer referenced by any page. The default placeholder and images added by the developer are never deleted. Details: [Image](./images.md).
5. **All or nothing:** First all affected pages are merged and validated, only then is `commitFiles(...)` called exactly once – the processed image files are added to this one call as additional `FileWrite`s, no separate commit. If any validation fails, nothing is committed. The processed temp blobs are only deleted AFTER a successful commit (`Promise.allSettled`) – if the commit fails, they are kept.
6. Return value `PublishResult`: on success `{ success: true, commitSha, trackDeployment }`, otherwise `{ success: false, error }`. `error` is a customer-facing text from `translations.ts`: image errors (`ImageBlobError`, `ImageProcessingError`) are passed on as is, all other errors as `errors.publishFailed(detail)` (see [Architecture](./architecture.md), "Editor UI texts"). `trackDeployment` is only `true` on the production deployment (`VERCEL_ENV === 'production'` and `VERCEL_GIT_COMMIT_SHA` set) – only there can the same domain report that the new commit is live.

`parseDraftKey` deliberately lives in `editor-mode.ts` (next to `draftKey`) instead of being duplicated in the Server Action – a pure function without hook character, so it can safely be imported from `'use server'` code without pulling Zustand/React into the server bundle.

## UI flow (`EditorNavbar`)

- The "Publish" button is only enabled if `drafts` has at least one entry. It shows a loading label during the request.
- **Success:** `clearDrafts()` immediately empties the entire store (all pages), then `PublishStatusDialog` takes over (see "Waiting for the deployment").
- **Error:** a separate error dialog; drafts and editor mode stay untouched – the customer can retry right away.
- **`Dialog` component:** `hideCancel` for dialogs with only a confirm button (Escape then triggers the same handler as the button), `hideConfirm` to hide the confirm button, and `dismissible={false}` for dialogs that must not be closed with Escape (e.g. while waiting for the deployment).
- **`beforeunload` guard:** directly in `EditorNavbar` (active exactly as long as the component is mounted = editor mode active); warns before leaving/reloading with open drafts. Modern browsers only show their own generic text; custom wording is not possible.
- **Exit / Log out with open drafts:** asks first ("Leave editor?", texts `navbar.leave*`), then discards all drafts (`clearDrafts`) and deletes their temp uploads right away (`discardTempImage`, best effort – before the logout, since deleting needs the session). Without drafts, both act immediately.
- **Switching pages:** in editor mode, links on the page itself open the edit dialog instead of navigating, and typing a URL reloads the page (drafts lost). The navbar therefore has a "Pages" button (`BookOpen`) whose flyout lists all pages from `pageLinks` (current page highlighted, pages with unpublished drafts – SEO included – marked with an amber dot like the field marker) as `next/link` links: client-side navigation keeps the store and thus the drafts of all pages, so one publish can cover several pages. Disabled while publishing.
- The navbar itself only shows the frequent actions "Pages", "Publish" and "Exit editor mode" (no logout). Less frequent actions sit in a flyout behind the "Logs" icon (`EditorNavbarMenu`): "SEO" opens the SEO dialog for all pages (see [SEO](./seo.md)), "Log out" logs out. A new action only needs a new entry in the `items` array. The "Pages" flyout is the same component (`EditorNavbarMenu` with `icon`/`label`/`showLabel` for the trigger and `href` items instead of `onClick`). The flyout opens upwards across the full navbar width (the same for both flyouts, so the "Pages" list does not look like it belongs to the leftmost button), the opening button stays highlighted while it is open, long labels are truncated (full text as `title`). It closes on item click, outside click and Escape.
- **Bottom spacing:** while the navbar is mounted (= editor mode), `body` gets a `padding-bottom` of the measured navbar height (`ResizeObserver`) plus twice its bottom offset, so the fixed navbar never covers the last content of the page (e.g. footer fields). The cleanup restores the previous value – the static site is unaffected.

## Waiting for the deployment

`GET /api/editor/deployment` (`src/system/api/deployment.ts`) returns `{ commitSha }` = `VERCEL_GIT_COMMIT_SHA` of the deployment serving the response. The route is `force-static`: it is generated once at build time and served by the CDN per deployment – polling costs no function invocations, and once the new deployment is promoted, its response is served automatically.

After the commit, `PublishStatusDialog.client.tsx` (in `EditorNavbar`) shows:

1. **Publishing:** "Your new content is being published. This can take up to 60 seconds." with a spinner, no button, and cannot be closed with Escape (`dismissible={false}`). The route is polled every 3 seconds (`cache: 'no-store'`).
2. **Live:** Once the route returns the SHA of the new commit → "Your new content is now live!" with the button "View page". Clicking it (or Escape) reloads the page – this automatically ends the editor mode, because the store starts empty; afterwards the editor runs on the new build.
3. **Timeout:** After 5 minutes without going live (e.g. a failed build, or a newer commit was deployed first), a message asks the customer to reload the page later and to contact the developer if the problem persists. "Got it" ends the editor mode.
4. **Without deployment tracking** (local development, preview deployments): a message that the changes were committed to GitHub and that there is no deployment to wait for here. Note: a publish from local development also pushes to `main` and thereby triggers the production deployment.

A failed build is deliberately detected only via the timeout, not via the Vercel or GitHub API (see [Decisions](./decisions.md)).

## Env vars

| Variable | Purpose |
|---|---|
| `GITHUB_TOKEN` | Fine-grained personal access token, Contents: Read & write, restricted to the repository |
| `VERCEL_GIT_REPO_OWNER` | Repository owner – set automatically on Vercel, set manually in `.env.local` locally |
| `VERCEL_GIT_REPO_SLUG` | Repository name – set automatically on Vercel, set manually in `.env.local` locally |

All three are part of `REQUIRED_EDITOR_ENV_VARS` (`session.ts`) – if one of them is missing, the entire editor UI is hidden (see [Authentication](./auth.md)).

`VERCEL_ENV` and `VERCEL_GIT_COMMIT_SHA` (deployment tracking) are Vercel system variables and do not need to be configured.

## Files

- `src/generated/pageRegistry.ts` – pathname → content file + merge base (generated).
- `src/system/lib/publish/github.ts` (`server-only`) – GitHub Git Data API client (`commitFiles`).
- `src/system/lib/publish/actions.ts` (`'use server'`) – `publishContent`, merge and validation logic, incl. `resolveImageDraft` for image drafts (see [Image](./images.md)).
- `src/system/api/deployment.ts` – static route with the commit SHA of the serving deployment (route file `app/api/editor/deployment/route.ts` only re-exports it).
- `src/system/components/editor-navbar/PublishStatusDialog.client.tsx` – waiting/live/timeout dialog after publishing.
- `src/system/components/editor-navbar/SeoDialog.client.tsx` – SEO dialog (see [SEO](./seo.md)).
- `src/system/components/editor-navbar/EditorNavbarMenu.client.tsx` – flyout for less frequent navbar actions (SEO, log out).
