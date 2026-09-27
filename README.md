<!-- biberblog:template-readme -->

# 🦫 biberblog

**On-page content editing for static Next.js websites – without a database.**

Your customer edits texts and images directly on their live website. You keep a plain, static Next.js site in Git. biberblog is only a thin editing layer on top: every change becomes a commit, every commit a new deployment.

**0 databases · 1 commit per publish · ~60 s until live · 100 % static Next.js**

---

## Why biberblog?

### For your customers

- **Edit where the content is.** No admin dashboard to learn – click a text or image on the page, change it, see the result immediately in the real layout.
- **Safe by design.** Customers can only change the fields you made editable. Layout, structure and code stay untouched.
- **Nothing gets lost.** Every publish is a Git commit, so every version of every text and image can be restored.
- **Fast websites.** The site stays fully static – great load times and SEO.

### For you as a developer

- **It's just Next.js.** Build the site with the App Router as you always do. No CMS schema, no SDK in your components, no content API.
- **No database, no CMS subscription.** Content lives as JSON in your repository; images end up as optimized WEBP files in `public/`.
- **Scaffolding included.** Pages, modules and editable fields are generated and kept in sync by CLI commands.
- **No black box.** The editor code lives in your repository. Adapt its look and texts per project.

---

## How is this different from other Git-based CMSs?

Git-based CMSs (e.g. Decap, TinaCMS, Keystatic, Pages CMS) and on-page editing are not new ideas. biberblog combines them with two deliberate choices:

- **No external service, no admin UI.** There is no CMS backend, no cloud account and no separate dashboard – just an editor mode directly on the website, backed by your repository.
- **The editor code is yours.** Like [shadcn/ui](https://ui.shadcn.com/), biberblog is not a dependency hidden in `node_modules`: the editor lives in your repository (`src/system/`), so you can read, adapt and restyle everything per project.

If your customer publishes content frequently (news, blog posts) or you need several editors, roles or a hosting provider other than Vercel, an established CMS is likely the better fit.

---

## What customers can edit

| Field                | What the customer can do                                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `EditableText`       | Plain text (headings, labels, short texts)                                                                                                    |
| `EditableRichtext`   | Paragraphs with bold text, bullet/numbered lists, internal and external links – deliberately nothing more                                     |
| `EditableCollection` | Lists of items (e.g. team members, FAQs): add, remove, reorder, edit – the item structure (text, richtext and image fields) is defined by you |
| `EditableImage`      | Upload an image and choose the crop (zoom, pan, rotate) – the output size is fixed by you                                                     |

In addition, the customer maintains the **SEO title and description** of every page in one dialog ("SEO" in the editor navbar). Each page file exports its `metadata` from these values.

Which fields a module has, and where they appear in the markup, is up to you.

---

## How it works

1. **Enter editor mode.** The customer clicks the edit button on the website and logs in with the project password (once per browser and device – the session lasts about a year).
2. **Edit.** Changes are previewed live in the real layout. Nothing is saved yet.
3. **Publish.** One click on "Publish":
   - biberblog commits all changed content files and images in **one commit** directly to `main` of your **GitHub** repository,
   - the push triggers a new **Vercel** deployment,
   - the editor shows a waiting dialog and reports as soon as the new version is live (usually after **30–60 seconds**).

---

## Requirements & limitations

**You need:**

- A **GitHub** repository connected to a **Vercel** project via Vercel's Git integration.
- Direct pushes to `main` must be allowed for the token (no branch protection requiring pull requests or checks).
- A **Vercel Pro** plan (or higher) – client websites are commercial projects.
- **Vercel Blob** for image editing (a private blob store is used as temporary storage while editing).
- Node.js as specified in `.nvmrc`.

**Good to know:**

- biberblog is built for **one editor per website** who updates content occasionally. There is no user management and no conflict handling for simultaneous edits.
- The published website itself is a portable static Next.js site. The editor, however, depends on GitHub and Vercel.
- Editor UI texts ship in English and can be changed per project (see "Editor UI texts" below).

All deliberate trade-offs are documented in [`src/system/docs/decisions.md`](./src/system/docs/decisions.md).

---

## Quickstart

### 1. Create your project

Create your own repository from this one (e.g. via "Use this template" or by cloning and pushing to a new repository), then:

```bash
npm install
```

### 2. Create the Vercel project and the blob store

1. Import the repository in Vercel (this connects the Git integration).
2. Link the local project:
   ```bash
   npm install -g vercel
   vercel login
   vercel link --project <your-vercel-project-name>
   ```
   `--project` matters: it makes the CLI write `.vercel/project.json`. Through this file and your CLI login, the short-lived `VERCEL_OIDC_TOKEN` (valid for about 12 hours) is renewed automatically during local development. Without `--project`, the CLI suggests the project as "(linked by git)" – picking that creates a repository link (`.vercel/repo.json`) instead, and the token renewal does not work with it. An existing `.vercel/repo.json` also prevents `project.json` from being written, so remove it before linking. Without `project.json`, local image uploads fail once the token has expired ("Failed to retrieve the presigned URL").
3. Create a blob store in the Vercel dashboard (project → **Storage** → **Create Database** → **Blob**):
   - **Access:** Private
   - **Environments:** include **Development**, otherwise the variables are missing locally.
   - Do **not** check "Add a read-write token env var to this connection" – biberblog authenticates via OIDC (`BLOB_STORE_ID` + `VERCEL_OIDC_TOKEN`).
   - **Region:** close to your audience (e.g. `fra1` for Germany/Austria/Switzerland) – cannot be changed later.

### 3. Pull the Vercel variables

```bash
vercel env pull .env.local
```

This brings the blob store connection (`BLOB_STORE_ID`, `BLOB_WEBHOOK_PUBLIC_KEY`, `VERCEL_OIDC_TOKEN`) into `.env.local`.

### 4. Run the setup

```bash
npm run setup
```

The setup asks for the customer's editor password and a GitHub token – a [fine-grained personal access token](https://github.com/settings/personal-access-tokens) for only this repository with the permission **Contents: Read & write** (note its expiry date – publishing stops working once it expires). It then:

- writes `.env.local`: generates the session secret, stores the password as an Argon2id hash (with every `$` escaped as `\$` – Next.js would otherwise expand it) and derives `VERCEL_GIT_REPO_OWNER`/`VERCEL_GIT_REPO_SLUG` from the Git remote,
- prints `EDITOR_SESSION_SECRET`, `EDITOR_PASSWORD_HASH` and `GITHUB_TOKEN` – add them in the Vercel dashboard for **Production** and **Development** and redeploy,
- on the first run, replaces this README with a short project README and removes the root `LICENSE` (biberblog's license stays in `src/system/LICENSE`).

The setup never overwrites existing values and can be run any time. `vercel env pull` overwrites `.env.local` – so run `npm run setup` again after every pull (e.g. after adding variables in the Vercel dashboard). An expired `VERCEL_OIDC_TOKEN` does not need a new pull, it is renewed automatically (see step 2):

```bash
vercel env pull .env.local && npm run setup
```

To change the customer's password later: `npm run editor:set-password` (then update the hash in Vercel and `.env.local`).

`src/system/.env.example` lists all variables. If any of them is missing, the site simply runs without editor mode – no edit button is rendered.

### 5. Start developing

```bash
npm run dev
```

The template starts without any content – the home page is empty. Create your first module with `npm run module:create` and place it on the page with `npm run page:add-module` (all commands: [`src/system/docs/cli.md`](./src/system/docs/cli.md)).

> **Heads-up:** Publishing from your local machine also commits to `main` and triggers a production deployment.

---

## Working with biberblog

- Your work happens in `src/project/*`, `app/*` and `public/*`. `src/system/*` contains the editor itself. `src/generated/*` is derived from your modules and pages – never edit it by hand; it is updated by the CLI commands and `npm run generate`.
- **Never create or delete pages, modules or editable fields by hand** – use the CLI commands, which also keep registries and content files in sync: [`src/system/docs/cli.md`](./src/system/docs/cli.md).
- You can freely edit and reformat the generated module code. The CLI changes it via the syntax tree (not text search), so formatting and additional code don't get in the way – see [`src/system/docs/plop.md`](./src/system/docs/plop.md) for the few names it relies on.
- Run the tests with `npm run test` (or `npm run test:watch`). Test files live next to the code they test (`*.test.ts`). `npm run typecheck` runs the TypeScript check.
- GitHub Actions (`.github/workflows/biberblog.yml`) checks the generated files and runs lint, type check and tests on every pull request and on pushes to `main` that change code – editor publishes (content JSON and images only) are skipped.
- Content lives in `src/project/content/*.json`. Don't change its structure by hand, and don't edit it while the customer is editing (their next publish would overwrite your change). The `label` of a page is its name in the editor's link dialog – after changing it, run `npm run generate`.

### Editor UI texts

All texts the customer sees in the editor (buttons, dialogs, hints, error messages, placeholders of new fields) are in `src/project/config/translations.ts`. Adapt them per project, e.g. for a German-speaking customer. TypeScript reports missing or misspelled keys.

### Page language

`app/layout.tsx` sets `<html lang="en">`. Set it to the language of your website's content (e.g. `lang="de"`) – it is used by screen readers, search engines and browser translation, and `globals.css` relies on it for automatic hyphenation (`hyphens: auto`). It is independent of the editor UI texts, which ship in English.

### Edit button

`<BiberblogEditor />` in `app/layout.tsx` renders the edit button (and the editor navbar in editor mode) – the only line of the editor in your layout. All props are optional:

```tsx
<BiberblogEditor
  text="Edit page"
  icon={<SquarePen />}
  className={`${containerWrapper} flex justify-end bg-background py-2`}
/>
```

[Lucide](https://lucide.dev/) icons are preinstalled and recommended, but not required.

---

## Roadmap

biberblog 1.0.0 is the first public release. What changes from version to version is listed in [`src/system/CHANGELOG.md`](./src/system/CHANGELOG.md).

- **Updates for existing projects** – every project has its own copy of `src/system/`, so fixes and features don't reach existing projects automatically yet. Planned: an update script that merges new system versions into a project (3-way merge, dependencies, migrations) and a GitHub Action that opens the update as a pull request – no npm package, the code stays visible. The groundwork is done: `src/system/` is identical in every project, and `src/system/manifest.json` describes the system's version and footprint.
- **Demo website** – a public example site with a short GIF in this README.
- **Possible later:** faster detection of failed builds via the GitHub commit status (see [`src/system/docs/decisions.md`](./src/system/docs/decisions.md)).

---

## Documentation

| Document                                                                                                                                                                                       | Content                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| [`src/system/docs/cli.md`](./src/system/docs/cli.md)                                                                                                                                           | All CLI commands (pages, modules, fields, images)       |
| [`src/system/docs/architecture.md`](./src/system/docs/architecture.md)                                                                                                                         | Overview, editor UI texts, dependencies                 |
| [`src/system/docs/decisions.md`](./src/system/docs/decisions.md)                                                                                                                               | Deliberate decisions and accepted risks                 |
| [`src/system/docs/auth.md`](./src/system/docs/auth.md)                                                                                                                                         | Editor login and sessions                               |
| [`src/system/docs/publish.md`](./src/system/docs/publish.md)                                                                                                                                   | Publish flow, GitHub commit, waiting for the deployment |
| [`src/system/docs/images.md`](./src/system/docs/images.md)                                                                                                                                     | Image field, upload and crop                            |
| [`src/system/docs/seo.md`](./src/system/docs/seo.md)                                                                                                                                           | SEO dialog and page metadata                            |
| [`src/system/docs/richtext.md`](./src/system/docs/richtext.md) · [`src/system/docs/collection.md`](./src/system/docs/collection.md) · [`src/system/docs/store.md`](./src/system/docs/store.md) | Field types and editor state                            |
| [`src/system/docs/plop.md`](./src/system/docs/plop.md)                                                                                                                                         | How the scaffolding works internally                    |

---

## License

biberblog is open source under the [MIT License](LICENSE).

## Author

**developed in Bonn**
by Arseny Bobrov • [bibertec](https://bibertec.de) • 2026
