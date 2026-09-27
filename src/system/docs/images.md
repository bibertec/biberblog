# Image

Reference for the fourth field type, `EditableImage`. For the high-level overview see `architecture.md`, for the draft store see [Store](./store.md), for the publish mechanics see [Publish](./publish.md), for scaffolding see [Plop templates](./plop.md).

## Concept

- `EditableImage` always renders `next/image` with target dimensions fixed by the developer during scaffolding (`imageWidth`/`imageHeight`, see [Plop templates](./plop.md)) – editors cannot change them; only the crop (zoom/pan/rotation) is editable.
- Loading behavior is decided by the developer per usage – `EditableImage` and `CollectionImage` accept either `loading` or `preload` (passed to `next/image`, type `ImageLoadingProps`):
  - no prop: `loading="lazy"` (default).
  - `loading="eager"`: loads immediately – for images above the fold. In most cases the right choice.
  - `preload`: additionally inserts `<link rel="preload">` into `<head>`, so loading starts before the image is discovered in `<body>`. Only for the one image that is the LCP element (typically the hero) – not for several images or images whose LCP role depends on the viewport.
  - `preload` together with `loading` is a type error (`next/image` throws for `preload` + `loading="lazy"`).
  - In editor mode, unpublished drafts are drawn on a canvas; the props do not apply to them.
- Deliberately no on-the-fly server-side cropping per request (no image proxy, no `next/image` loader middleware): the crop is applied destructively once on publish, and the result lands in the repository as a finished WEBP – consistent with the project's "no external database, everything static in the repo" philosophy.
- While editing, the original image is NOT in the repository but stored as a private, temporary blob in **Vercel Blob** (`temp/{uuid}.{ext}`) – only on publish does it become a finished `public/images/*.webp`.
- The published field value (`imageValueSchema`) deliberately contains no crop data, only `{ src, alt }` – after publishing, only the finished WEBP exists; a stored crop rectangle without the original would be useless. Re-cropping a published image therefore works on the published WEBP, not on the original (see "Applying without unnecessary re-encoding").

## Content model (`src/system/content/imageSchema.ts`)

- `imageValueSchema` – published field value in `content.json`: `{ src: "/images/<name>.webp", alt }`. `src` follows the existing path convention for editorial images (see also `transform-images.mjs`).
- `cropSchema` (`CropData`) – crop rectangle in pixel coordinates of the already rotated original image: `{ x, y, width, height, rotation }`, `rotation` ∈ `{0, 90, 180, 270}`.
- `tempImageDraftSchema` (`TempImageDraft`) – the draft value in the store for a new or re-cropped image: `{ alt, crop, temp: { pathname, mimeType, size } }`. `temp.pathname` points to the private blob (`temp/{uuid}.{ext}`), NOT to a `public/images` image.
- If only the alt text changes, the draft is an `imageValueSchema` value instead (`{ src, alt }`, see "Applying without unnecessary re-encoding").
- A `TempImageDraft` is thus structurally distinguishable from every other draft type (string for `EditableText`, JSON document for `EditableRichtext`, array for `EditableCollection`) – the publish flow relies on exactly that to detect image drafts (`tempImageDraftSchema.safeParse`, see below).

## imageFieldRegistry.ts

Developer-owned rules per image *field* (not per module – a module can have several image fields):

```ts
export const imageFieldRegistry = {
  'Team.photo': { aspectRatio: 800 / 800, maxWidth: 800, maxHeight: 800 },
} satisfies Record<string, ImageFieldRules>;
```

- Deliberately located in `src/project/content/`, not in `src/generated/` (like `moduleRegistry.ts`/`pageRegistry.ts`): the file contains project-specific design decisions (concrete pixel dimensions per field) that cannot be derived from anything else – analogous to `src/project/content/blueprints/*.json`. Plop still adds and removes entries automatically (via the syntax tree, so you may reformat the file and adjust sizes).
- Key: `` `${moduleType}.${fieldName}` `` – module *type*, not module instance id (`imageFieldRegistryKey`), because the rules apply per module type, not per page instance. Image item fields of a collection: `` `${moduleType}.${collectionField}.${itemField}` `` (see [Collection](./collection.md)).
- `aspectRatio` is written during scaffolding as a literal fraction expression (`400 / 300`), not as a precomputed float – exact, self-documenting, no rounding errors.
- Maintained automatically by `module:create`/`module:add-editable-field`/`module:remove-editable-field` (details: [Plop templates](./plop.md)).
- Authoritative on the server: the client does not decide the aspect ratio; `assertCropAspectRatio` (`src/system/lib/images/process.ts`) checks against exactly this registry on publish before anything is processed.

## Upload & crop UX

### Presigned upload (Vercel Blob signed URLs)

- `POST /api/editor/image/upload` (`src/system/api/imageUpload.ts`) issues presigned PUT URLs for `temp/*` paths (`@vercel/blob`'s `issueSignedToken` on the server, `handleUploadPresigned`/`uploadPresigned` as the client/server counterparts). The actual image bytes flow directly from the browser to Vercel Blob, never through this route – it is a pure control path.
- Authorization per request via the existing editor session (`checkEditorSession`); the delegation token itself additionally enforces the path pattern (`assertTempPathname`), allowed content types and maximum size (`MAX_UPLOAD_BYTES`, 20 MB), with a short validity (5 minutes).
- **Important:** `handleUploadPresigned` throws `BlobError("Missing webhook public key")` if `BLOB_WEBHOOK_PUBLIC_KEY` is not set – even without any `onUploadCompleted` callback. That is why the variable is required (see env vars below), although this project implements no webhook handler.
- `access` (private) is NOT negotiated in the delegation token but set on the client via `uploadPresigned`'s own `access` option and sent as a header on the actual PUT request.
- On every token request, as a side task (best effort, via `after()` once the response is sent, non-blocking): `cleanupOrphanTempBlobs()` – cleans up abandoned edits without revert/publish (~24h lifetime, no cron, see `src/system/lib/images/blob.ts`).

### Crop editor (Canvas 2D, no server round trip)

- Zoom/pan/rotation sliders ↔ crop rectangle: `computeCrop()`/`slidersFromCrop()` (exact inverse functions, `src/system/lib/images/cropMath.ts`) – pure geometry, framework-agnostic.
- Dialog layout (`ImageCropper.client.tsx`): the preview is a fixed square stage framed by its sliders (zoom left, vertical pan right, horizontal pan below), so the sliders keep the same length for every field format. The crop is letterboxed into the stage via `object-contain` (tinted `bg-foreground/20` bars left/right for portrait, top/bottom for landscape formats – calmer than black and still distinct from light and dark images). A pan slider is disabled while the crop already fills the source on that axis (`canPan()` in `cropMath.ts`, e.g. vertically for a landscape photo in a square crop at zoom 1). The vertical sliders use `writing-mode: vertical-lr` (vertical form controls: Chrome/Edge 124+, Safari/iOS 17.4+, Firefox 120+).
- The preview itself is drawn with native Canvas 2D, not with CSS `object-position`/`transform`: `paintCropPreview()` (`cropCanvas.ts`) renders the source image into a rotated offscreen canvas and blits the scaled crop area into the target canvas.
- **Live preview in the full layout, not just in the dialog:** the closed field view (`EditableImageDraftPreview.client.tsx`) draws the same crop at the real field dimensions directly in its real place in the layout while an unpublished draft exists – not just an isolated preview in the editing dialog. Reason: the customer has to be able to check the decision in the actual page context; a dialog preview detached from the layout is not enough. A `key` prop built from `tempPathname` + all crop fields forces a clean remount on every change instead of a manual state reset inside an effect (avoids `react-hooks/set-state-in-effect`).
- The preview URL for a temp blob is provided by `requestTempImagePreview` (presigned GET URL, valid for 10 minutes) – without downloading the image on the server.
- **Applying without unnecessary re-encoding** (`save` in `useImageCropEditor.client.ts`):
  - Only the alt text changed (no new file, crop unchanged: zoom 1, no panning, no rotation) → the draft is a plain `{ src, alt }` value (`imageValueSchema`). No upload; on publish only the alt text is applied and the WEBP stays unchanged. If the alt text is unchanged as well, the draft is discarded.
  - An existing temp draft is edited again (without a new file) → the already uploaded original is reused with the new crop/alt text; no new upload.
  - Only when the crop of an **already published** image is changed is its WEBP uploaded again and reprocessed. This costs some quality, because the original no longer exists after publishing (see Concept). To get a new crop without quality loss, upload the original image again.
- Reopening an existing draft: `slidersFromCrop()` reconstructs the slider positions from the stored crop rectangle so that editing can continue where it left off.

## Processing on publish

`resolveImageDraft()` (`src/system/lib/publish/actions.ts`) detects an image draft (`tempImageDraftSchema.safeParse`) during the merge – as a field value or as an item field value inside a collection – and converts it into the final `{ src, alt }` value (several images are processed one after the other, as `sharp` needs a lot of memory):

1. Load the temp blob (`readTempBlobBytes`) and check the byte length against `temp.size` from the draft.
2. `processImageCrop()` (`src/system/lib/images/process.ts`, `sharp`): verify the aspect ratio on the server against `imageFieldRegistry` (`assertCropAspectRatio`), then `.autoOrient().rotate(crop.rotation).extract(crop).resize({ width: maxWidth, height: maxHeight }).toColorspace('srgb').webp({ quality: 80 })`.
   - `autoOrient()` applies the EXIF orientation first. Browsers display images (including in canvas) EXIF-corrected, so the crop coordinates refer to the correctly oriented image. Without this step they would not match the raw pixels for smartphone photos.
   - The output is **always exactly** `maxWidth × maxHeight` – fixed image dimensions per spec, not a maximum. Since the crop is already locked to the target aspect ratio via `assertCropAspectRatio`, `resize` only scales (up or down). Zooming far into a small source image can therefore lead to visible quality loss – an accepted consequence of fixed image dimensions, not a bug.
3. File name: every published image gets a new name from the upload's asset id (`temp/{assetId}.{ext}` → `/images/{assetId}.webp`, asset id = UUID). The previous path is never overwritten – otherwise, for example, the first publish would replace the shared placeholder (`/images/placeholder.webp`, copied from `src/system/assets/` when the first image field is created) for all other fields.
   - Every image the changed field referenced before (also images of replaced or removed collection items) is deleted in the same commit if it was produced by the publish flow (file name `<uuid>.webp`) and is no longer referenced by any page. The placeholder and images added by the developer are always kept.
4. The finished WEBP is added as another file (`FileWrite`, base64) to the same commit as the changed `content.json` files – **one** commit for text and image changes together, no separate image commit.
5. The temp blob is only deleted AFTER a successful commit (`Promise.allSettled`) – if the commit fails, it is kept, and another publish attempt does not need a new upload.

Conversely, `loadContentImage()` (`src/system/lib/images/loadContentImage.ts`) resolves a published field value to a hash-versioned `src` URL when rendering the page – via a dynamic, dependency-free import from `public/images/*.webp` (Next.js' static image import provides this automatically). Deliberately ONLY `src`, not the file's actual pixel dimensions: the display size is determined solely by `imageFieldRegistry` (`rules.maxWidth`/`rules.maxHeight`), not by whichever file happens to be referenced – before the first edit, every field shows the same default placeholder, whose native dimensions have nothing to do with the target dimensions of the respective field (`EditableImageDisplay` accordingly renders with `width={rules.maxWidth}`/`height={rules.maxHeight}` and `objectFit: 'cover'`). That is why the module component is an `async function` as soon as it has at least one `EditableImage` field (details: [Plop templates](./plop.md)).

## Env vars

| Variable | Purpose |
|---|---|
| `BLOB_STORE_ID` | Vercel Blob store binding (OIDC auth instead of a static token) |
| `BLOB_WEBHOOK_PUBLIC_KEY` | Required by `handleUploadPresigned`, even without an implemented webhook handler (see above) |
| `VERCEL_OIDC_TOKEN` | OIDC credential for blob access |

All three are part of `REQUIRED_EDITOR_ENV_VARS` (`session.ts`, see [Authentication](./auth.md)) – if one of them is missing, the entire editor UI is hidden. Exception: on Vercel, `VERCEL_OIDC_TOKEN` is not checked at runtime, because functions receive it per request instead of as an environment variable (details in [Authentication](./auth.md)). Setup steps (creating the blob store, `vercel env pull`): see the README, "Quickstart".

**Local development – token renewal:** the `VERCEL_OIDC_TOKEN` written by `vercel env pull` is only valid for about 12 hours. `@vercel/blob` renews it automatically (via `@vercel/oidc`), but only if the directory is linked via `.vercel/project.json` (`vercel link --project <name>`) and the Vercel CLI is logged in (`vercel login`). A repository link (`.vercel/repo.json`) is not enough – `vercel link` creates one when you pick the project suggested as "(linked by git)", and `@vercel/oidc` only reads `project.json`. Without it, the renewal fails silently, `issueSignedToken` finds no credentials and the upload route answers with 400. The client (`uploadPresigned`) ignores the response body and only shows the generic "Failed to retrieve the presigned URL" – the route therefore logs the actual cause in the dev server terminal (`[biberblog] Image upload: …`).

## Known limitations

- **No on-the-fly server-side cropping:** Changing the target dimensions in `imageFieldRegistry.ts` (e.g. because the layout changes) only affects future publishes – already published images keep their old dimensions until the customer edits and saves them again.

## Files

- `src/system/content/imageSchema.ts` – `imageValueSchema`, `cropSchema`, `tempImageDraftSchema`, `ImageDraft` (either of the two while editing).
- `src/project/content/imageFieldRegistry.ts` – developer-owned rules per image field.
- `src/system/lib/images/blob.ts` (`server-only`) – Vercel Blob helpers (`assertTempPathname`, `readTempBlobBytes`, `deleteTempBlob`, `issueTempPreviewUrl`, `cleanupOrphanTempBlobs`).
- `src/system/lib/images/process.ts` (`server-only`) – `sharp` processing (`assertCropAspectRatio`, `processImageCrop`).
- `src/system/lib/images/actions.ts` (`'use server'`) – `requestTempImagePreview`, `discardTempImage`.
- `src/system/lib/images/loadContentImage.ts` – `loadContentImage` resolves a published field value to a hash-versioned `src` URL (no pixel dimensions, see above); `loadCollectionImages` does the same for the image item fields of a collection.
- `src/system/lib/images/cropMath.ts` – `computeCrop`/`slidersFromCrop`, pure geometry.
- `src/system/lib/images/cropCanvas.ts` – `paintCropPreview`, Canvas 2D rendering.
- `src/system/api/imageUpload.ts` – route handler for presigned uploads (route file `app/api/editor/image/upload/route.ts` only re-exports it).
- `src/system/components/editable-fields/image/` – `EditableImage.client.tsx` (gate, analogous to the other field types: `next/dynamic`, `ssr: false`), `EditableImageDisplay.tsx` (static `next/image`), `EditableImage.editor.client.tsx` (editor field), `useImageCropEditor.client.ts` (dialog state, upload decision – shared with image item fields), `ImageCropper.client.tsx` (dialog content), `ImageFieldInput.client.tsx` (image item field in the collection editor), `EditableImageDraftPreview.client.tsx` (live preview in the full layout).
- `src/system/components/editable-fields/collection/CollectionImages.client.tsx` – `CollectionImage` for the images of collection items (see [Collection](./collection.md)).
