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
- Optionally, a field has a **mobile variant** (art direction): its own format below Tailwind's `md` breakpoint, its own file, and the customer can crop it differently or choose another image. Opt-in per field by the developer (`mobile` in `imageFieldRegistry`, see "Mobile variant" below).

## Content model (`src/system/content/imageSchema.ts`)

- `imageValueSchema` – published field value in `content.json`: `{ src: "/images/<name>.webp", alt }`. `src` follows the existing path convention for editorial images (see also `transform-images.mjs`). Fields with a mobile variant additionally have `mobile: { src: "/images/<name>-mobile.webp", mode: "auto" | "custom" }` once they were published with it (`auto`: derived from the desktop image, `custom`: chosen or cropped by the customer).
- `cropSchema` (`CropData`) – crop rectangle in pixel coordinates of the already rotated original image: `{ x, y, width, height, rotation }`, `rotation` ∈ `{0, 90, 180, 270}`.
- `tempImageDraftSchema` (`TempImageDraft`) – the draft value in the store for a new or re-cropped image: `{ alt, crop, temp: { pathname, mimeType, size } }`. `temp.pathname` points to the private blob (`temp/{uuid}.{ext}`), NOT to a `public/images` image.
- `responsiveImageDraftSchema` (`ResponsiveImageDraft`) – the draft of a field with a mobile variant as soon as one of its files has to be (re)generated: `{ alt, desktop, mobile }`. Each variant is either `{ temp, crop }` (processed on publish) or `{ src }` (the published file, kept as is); `mobile` also has its `mode`. Desktop and mobile may point to the same temp blob (one upload, cropped twice).
- If only the alt text changes, the draft is an `imageValueSchema` value instead (`{ src, alt }` – with `mobile` if the field has one, see "Applying without unnecessary re-encoding").
- `TempImageDraft` and `ResponsiveImageDraft` are thus structurally distinguishable from each other and from every other draft type (string for `EditableText`, JSON document for `EditableRichtext`, array for `EditableCollection`) – the publish flow relies on exactly that to detect image drafts (`tempImageDraftSchema.safeParse`/`responsiveImageDraftSchema.safeParse`, see below). `tempPathnamesOf()` lists the temp blobs of any draft value (used to discard them).

## imageFieldRegistry.ts

Developer-owned rules per image *field* (not per module – a module can have several image fields):

```ts
export const imageFieldRegistry = {
  'Team.photo': { aspectRatio: 800 / 800, maxWidth: 800, maxHeight: 800 },
  'Hero.image': {
    aspectRatio: 1600 / 900,
    maxWidth: 1600,
    maxHeight: 900,
    // Optional mobile variant (below 768 px) – top-level image fields only:
    mobile: { aspectRatio: 750 / 1000, maxWidth: 750, maxHeight: 1000 },
  },
} satisfies Record<string, ImageFieldRules>;
```

- The types `ImageFieldRules`/`ImageVariantRules` live in the system (`src/system/content/imageFieldRules.ts`); the registry file imports and re-exports `ImageFieldRules`. (Up to 1.4.0 the file declared the type itself, without `mobile` – the 1.5.0 migration switches it to the system type.)

- Deliberately located in `src/project/content/`, not in `src/generated/` (like `moduleRegistry.ts`/`pageRegistry.ts`): the file contains project-specific design decisions (concrete pixel dimensions per field) that cannot be derived from anything else – analogous to `src/project/content/blueprints/*.json`. Plop still adds and removes entries automatically (via the syntax tree, so you may reformat the file and adjust sizes).
- Key: `` `${moduleType}.${fieldName}` `` – module *type*, not module instance id (`imageFieldRegistryKey`), because the rules apply per module type, not per page instance. Image item fields of a collection: `` `${moduleType}.${collectionField}.${itemField}` `` (see [Collection](./collection.md)).
- `aspectRatio` is written during scaffolding as a literal fraction expression (`400 / 300`), not as a precomputed float – exact, self-documenting, no rounding errors.
- Maintained automatically by `module:create`/`module:add-editable-field`/`module:remove-editable-field` (details: [Plop templates](./plop.md)).
- Authoritative on the server: the client does not decide the aspect ratio; `assertCropAspectRatio` (`src/system/lib/images/process.ts`) checks against exactly this registry on publish before anything is processed – for the mobile file against `mobile`.
- `mobile` is ignored for image item fields of collections (not supported yet, see "Known limitations"); Plop only offers it for top-level image fields.

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
- The decisions of "Apply" are a pure function, `buildImageDraft()` (`imageDraft.ts`, unit-tested); the hook only passes the dialog state and the upload. Each source is uploaded at most once per apply (`uploadOncePerSource`) – desktop and mobile may be crops of the same image.

## Mobile variant (art direction)

For fields with `mobile` in `imageFieldRegistry`, the visitor gets the mobile file below Tailwind's `md` breakpoint (`(width < 48rem)`, `MOBILE_IMAGE_MEDIA_QUERY` in `src/system/content/imageFieldRules.ts`) and the desktop file from `md` up. Two goals: a different crop or image on phones, and smaller files there – a field with a mobile variant always gets two files on publish, even if the mobile one is only derived.

### Dialog

- Two icon toggle buttons at the top of the dialog (Lucide `Monitor`/`Smartphone`, `aria-pressed`, label as `aria-label`/tooltip), desktop selected by default. Upload, preview and sliders below apply to the selected variant; the alt text is shared (`<picture>` has a single `alt`).
- Mobile `auto` (default): the smartphone view shows the desktop image with the **derived crop** – `deriveCrop()` (`cropMath.ts`): the largest rectangle in the mobile format inside the desktop crop, centered (same format → same crop). That is exactly what `object-fit: cover` shows of the desktop file in the mobile format, so a field without a mobile file looks the same.
- The first slider change in the smartphone view (zoom, pan, rotate, reset) turns it into a crop of its own of the same image (`custom`); "Choose a different image" in the smartphone view chooses an image of its own (`custom`). "Use desktop image" (only shown for `custom`) goes back to `auto`.
- `auto` follows every desktop change (new image or crop); `custom` stays when the desktop image changes.

### What "Apply" creates (`buildImageDraft`)

- Nothing changed → the published value (the draft is discarded).
- Only the alt text changed and both files stay → `{ src, alt, mobile }`.
- New desktop image/crop with `auto` → `ResponsiveImageDraft` whose mobile variant uses the same temp blob with the derived crop – one upload.
- Desktop file stays, mobile needs a new file (custom crop of the desktop image, back to `auto` from `custom`, or the field has no mobile file yet) → the published desktop WEBP is uploaded as the source of the mobile file; the desktop file itself is not re-encoded. A mobile file derived this way in an earlier apply is reused.
- A custom mobile image is uploaded on its own; a custom mobile crop of a reopened draft that was not shown again keeps its stored crop.

### Publishing

`resolveResponsiveImageDraft()` (`src/system/lib/publish/actions.ts`): every variant with a temp blob becomes a WEBP in its own dimensions (`processImageCrop` with the desktop rules or `mobile`), a variant `{ src }` keeps its file. File names: `/images/<uuid>.webp` and `/images/<uuid>-mobile.webp` (`<uuid>` = asset id of the respective upload), so one upload cropped twice does not collide. A blob used by both variants is downloaded once. Replaced files (desktop and mobile) are deleted like other generated images – the pattern for generated images includes the `-mobile` suffix.

### Rendering

- `EditableImageDisplay` renders `<picture>` via `getImageProps()` (the documented Next.js way for [art direction](https://nextjs.org/docs/app/api-reference/components/image#art-direction)): a `<source media="(width < 48rem)">` with the mobile `srcSet` (and its `width`/`height`), the `<img>` with the desktop props. The browser downloads only the matching source.
- `<picture class="contents">`: in flex and grid layouts the `<img>` stays the item, as without `<picture>`; `className` still goes to the `<img>`.
- Aspect ratio per breakpoint without giving up the 1.1.1 fix: the inline style sets `--editable-image-ratio-desktop`/`-mobile` and `aspect-ratio: var(--editable-image-ratio, <desktop>)`; a static class switches `--editable-image-ratio` with `max-md:`. The aspect ratio stays inline, so it still overrides an `aspect-*` class.
- `preload`: `getImageProps` does not insert the preload of `next/image`, so `EditableImageDisplay` calls `ReactDOM.preload` once per variant with a media query (`(width < 48rem)` / `(width >= 48rem)`) – only the matching file is fetched early. React's automatic image preloading skips images inside `<picture>`.
- Without a mobile file (published before the field had `mobile`), the `<source>` points to the desktop file in the mobile dimensions – cropped by CSS like the derived crop, and still downloaded in a smaller size. The next publish of the field generates the mobile file (also for an alt-text-only change).
- Editor mode: `ResponsiveImageDraftPreview` (`EditableImageDraftPreview.client.tsx`) shows the desktop variant from `md` up and the mobile variant below (`max-md:hidden`/`md:hidden`) – each as canvas preview (temp blob) or as the published file.
- Generated module code is the same for fields with and without mobile variant: `loadContentImage()` also resolves `mobile.src` (`mobileSrc`), `EditableImage` gets the rules from the registry.

## Processing on publish

`resolveImageDraft()` (`src/system/lib/publish/actions.ts`) detects an image draft (`tempImageDraftSchema.safeParse`; for fields with a mobile variant `responsiveImageDraftSchema.safeParse`, see "Mobile variant") during the merge – as a field value or as an item field value inside a collection – and converts it into the final `{ src, alt }` value (several images are processed one after the other, as `sharp` needs a lot of memory):

1. Load the temp blob (`readTempBlobBytes`) and check the byte length against `temp.size` from the draft.
2. `processImageCrop()` (`src/system/lib/images/process.ts`, `sharp`): verify the aspect ratio on the server against `imageFieldRegistry` (`assertCropAspectRatio`), then `.autoOrient().rotate(crop.rotation).extract(crop).resize({ width: maxWidth, height: maxHeight }).toColorspace('srgb').webp({ quality: 80 })`.
   - `autoOrient()` applies the EXIF orientation first. Browsers display images (including in canvas) EXIF-corrected, so the crop coordinates refer to the correctly oriented image. Without this step they would not match the raw pixels for smartphone photos.
   - The output is **always exactly** `maxWidth × maxHeight` – fixed image dimensions per spec, not a maximum. Since the crop is already locked to the target aspect ratio via `assertCropAspectRatio`, `resize` only scales (up or down). Zooming far into a small source image can therefore lead to visible quality loss – an accepted consequence of fixed image dimensions, not a bug.
3. File name: every published image gets a new name from the upload's asset id (`temp/{assetId}.{ext}` → `/images/{assetId}.webp`, asset id = UUID). The previous path is never overwritten – otherwise, for example, the first publish would replace the shared placeholder (`/images/placeholder.webp`, copied from `src/system/assets/` when the first image field is created) for all other fields.
   - Every image the changed field referenced before (also images of replaced or removed collection items) is deleted in the same commit if it was produced by the publish flow (file name `<uuid>.webp`) and is no longer referenced by any page. The placeholder and images added by the developer are always kept.
4. The finished WEBP is added as another file (`FileWrite`, base64) to the same commit as the changed `content.json` files – **one** commit for text and image changes together, no separate image commit.
5. The temp blob is only deleted AFTER a successful commit (`Promise.allSettled`) – if the commit fails, it is kept, and another publish attempt does not need a new upload.

Conversely, `loadContentImage()` (`src/system/lib/images/loadContentImage.ts`) resolves a published field value to a hash-versioned `src` URL (and `mobileSrc` for `value.mobile`) when rendering the page – via a dynamic, dependency-free import from `public/images/*.webp` (Next.js' static image import provides this automatically). Deliberately ONLY the URLs, not the files' actual pixel dimensions: the display size is determined solely by `imageFieldRegistry` (`rules.maxWidth`/`rules.maxHeight`), not by whichever file happens to be referenced – before the first edit, every field shows the same default placeholder, whose native dimensions have nothing to do with the target dimensions of the respective field (`EditableImageDisplay` accordingly renders with `width={rules.maxWidth}`/`height={rules.maxHeight}`, `aspectRatio: maxWidth / maxHeight` and `objectFit: 'cover'`). The inline `aspectRatio` is required: `width`/`height` alone only reserve space – with `height: auto` (Tailwind preflight) the browser switches to the file's natural aspect ratio as soon as it has loaded. It deliberately sets no `width`, so the image keeps its size (`maxWidth`, shrunk to the container) and width/height classes passed via `className` still apply; an `aspect-*` class is overridden by the inline style. That is why the module component is an `async function` as soon as it has at least one `EditableImage` field (details: [Plop templates](./plop.md)).

## Env vars

| Variable | Purpose |
|---|---|
| `BLOB_STORE_ID` | Vercel Blob store binding (OIDC auth instead of a static token) |
| `BLOB_WEBHOOK_PUBLIC_KEY` | Required by `handleUploadPresigned`, even without an implemented webhook handler (see above) |
| `VERCEL_OIDC_TOKEN` | OIDC credential for blob access |

All three are part of `REQUIRED_EDITOR_ENV_VARS` (`session.ts`, see [Authentication](./auth.md)) – if one of them is missing, the entire editor UI is hidden. Exception: on Vercel, `VERCEL_OIDC_TOKEN` is not checked at runtime, because functions receive it per request instead of as an environment variable (details in [Authentication](./auth.md)). Setup steps (creating the blob store, `vercel env pull`): see the README, "Quickstart".

**Local development – token renewal:** the `VERCEL_OIDC_TOKEN` written by `vercel env pull` is only valid for about 12 hours. `@vercel/blob` renews it automatically (via `@vercel/oidc`), but only if the directory is linked via `.vercel/project.json` (`vercel link --project <name>`) and the Vercel CLI is logged in (`vercel login`). A repository link (`.vercel/repo.json`) is not enough – `vercel link` creates one when you pick the project suggested as "(linked by git)", and `@vercel/oidc` only reads `project.json`. Without it, the renewal fails silently, `issueSignedToken` finds no credentials and the upload route answers with 400. The client (`uploadPresigned`) ignores the response body and only shows the generic "Failed to retrieve the presigned URL" – the route therefore logs the actual cause in the dev server terminal (`[biberblog] Image upload: …`).

## Known limitations

- **Mobile variant only for top-level image fields:** image item fields of collections have no mobile variant yet (a `mobile` entry in their registry entry is ignored).
- **Fixed breakpoint:** the mobile variant applies below 48rem (768 px), Tailwind's default `md`. A project that changes `--breakpoint-md` has a different `max-md:` but the same `<source>` media query – keep the default.
- **No on-the-fly server-side cropping:** Changing the target dimensions in `imageFieldRegistry.ts` (e.g. because the layout changes) takes effect in the display immediately – already published images are cropped to the new format by CSS (`object-fit: cover`, centered). The files themselves keep their old dimensions until a new image or crop is published for the field (an alt-text-only change keeps the file), so they may be larger than needed or upscaled (new `maxWidth` larger than the file). Keep `aspectRatio` and `maxWidth / maxHeight` in sync: the crop dialog uses `aspectRatio`, display and publish use `maxWidth`/`maxHeight`.

## Files

- `src/system/content/imageSchema.ts` – `imageValueSchema`, `cropSchema`, `tempImageDraftSchema`, `responsiveImageDraftSchema`, `ImageDraft` (single image while editing), `FieldImageDraft` (top-level field, including `ResponsiveImageDraft`), `tempPathnamesOf`.
- `src/system/content/imageFieldRules.ts` – `ImageFieldRules`/`ImageVariantRules`, `MOBILE_IMAGE_MEDIA_QUERY`.
- `src/project/content/imageFieldRegistry.ts` – developer-owned rules per image field.
- `src/system/lib/images/blob.ts` (`server-only`) – Vercel Blob helpers (`assertTempPathname`, `readTempBlobBytes`, `deleteTempBlob`, `issueTempPreviewUrl`, `cleanupOrphanTempBlobs`).
- `src/system/lib/images/process.ts` (`server-only`) – `sharp` processing (`assertCropAspectRatio`, `processImageCrop`).
- `src/system/lib/images/actions.ts` (`'use server'`) – `requestTempImagePreview`, `discardTempImage`.
- `src/system/lib/images/loadContentImage.ts` – `loadContentImage` resolves a published field value to a hash-versioned `src` URL (no pixel dimensions, see above); `loadCollectionImages` does the same for the image item fields of a collection.
- `src/system/lib/images/cropMath.ts` – `computeCrop`/`slidersFromCrop`/`deriveCrop`, pure geometry.
- `src/system/lib/images/cropCanvas.ts` – `paintCropPreview`, Canvas 2D rendering.
- `src/system/api/imageUpload.ts` – route handler for presigned uploads (route file `app/api/editor/image/upload/route.ts` only re-exports it).
- `src/system/components/editable-fields/image/` – `EditableImage.client.tsx` (gate, analogous to the other field types: `next/dynamic`, `ssr: false`), `EditableImageDisplay.tsx` (static `next/image`), `EditableImage.editor.client.tsx` (editor field), `useImageCropEditor.client.ts` (dialog state of one or two variants – shared with image item fields), `imageDraft.ts` (`buildImageDraft`: what "Apply" creates, pure), `ImageCropper.client.tsx` (dialog content), `ImageFieldInput.client.tsx` (image item field in the collection editor), `EditableImageDraftPreview.client.tsx` (live preview in the full layout, `ResponsiveImageDraftPreview` for fields with a mobile variant).
- `src/system/components/editable-fields/collection/CollectionImages.client.tsx` – `CollectionImage` for the images of collection items (see [Collection](./collection.md)).
