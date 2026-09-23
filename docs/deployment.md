# Website validation and GitHub Pages deployment

## Production branch and previous deployment

The production content branch is `main`. The CMS publisher is intentionally pinned to `DanielBrindusa/ArtaGatitului` and `main`; `app-development` remains the development branch.

Before Milestone 10, the repository had no GitHub Actions workflow. Generated HTML, indexes, sitemap, manifests, service worker, CSS, and JavaScript were committed at the root of `main`, and GitHub Pages served that branch-root output. The generated files remain tracked during this migration so the existing public site is not removed or mass-rewritten. They are no longer the deployment input once Pages is configured to use GitHub Actions.

## Authoritative pipeline

Local verification and CI use the same npm scripts:

```powershell
npm ci
npm run pages:build
```

`pages:build` performs these stages in order:

1. validate source categories, recipe schema fields, safe and unique slugs, constrained tags, aliases, and local image references;
2. generate every static page, category route, data index, sitemap, manifest, service worker, icon, CSS, and JavaScript asset;
3. validate fresh output under `dist/generated`, including routes, internal links, canonical URLs, search/recipe/ingredient indexes, category data, sitemap URLs, PWA files, and the `/ArtaGatitului/` base path;
4. run the Node test suite, including shared renderer, block safety, CMS publishing, deployment, Windows, and Android architecture tests;
5. type-check and build the CMS frontend;
6. assemble and revalidate a clean `dist/site` artifact.

The artifact contains only validated public routes, `assets/`, PWA files, sitemap/robots files, and `.nojekyll`. It excludes source code, draft data, local configuration, credentials, and stale generated directories. `dist/` is ignored and is never source truth.

Node.js 22 is pinned by `.nvmrc` and the workflow. CI installs exactly `package-lock.json` with `npm ci`. `ARTA_BUILD_VERSION` is the source commit SHA in CI, so cache-version output is stable for a commit and changes when production content changes. The canonical site URL defaults to `https://danielbrindusa.github.io/ArtaGatitului/`.

## Workflow behavior

`.github/workflows/site.yml` runs for pull requests and pushes targeting `main` or `app-development`, plus manual validation runs.

- Pull requests: validate and build; never deploy.
- `app-development`: validate and build; never deploy.
- `main` pushes: validate, build, package, and upload the Pages artifact; deploy only after the validation job succeeds.
- Manual runs: validate and build; never deploy.

The deploy job uses a non-cancelling `github-pages` concurrency group. Rapid production commits queue rather than overlap. A failed validation or build never uploads a deployable artifact, and a failed deployment does not rewrite the source commit or replace the last successful site.

Only official GitHub actions are used. The validation job has `contents: read`. The deployment job has `actions: read`, `contents: read`, `pages: write`, and `id-token: write`. No PAT, deployment secret, repository write permission, or CMS workflow permission is required.

## CMS publication and status

The CMS still commits only `src/content/recipes/<slug>.json` and an optional `assets/images/recipes/<slug>.<ext>` source asset. It cannot modify `.github/workflows` or generated output.

After GitHub accepts the commit, the CMS reports `Building website...` and polls the public recipe URL. Generated HTML contains the source commit SHA, so only a page carrying that exact marker changes the state to `Website deployed`; an older page at the same slug cannot produce a false success. A timeout or non-public response becomes `Deployment not confirmed` and offers the fixed repository Actions page. The current GitHub App keeps only `Contents: read/write` and `Metadata: read`; it does not gain Actions permission, so the CMS does not claim to distinguish a failed workflow from a delayed or unreachable deployment. The commit SHA remains visible and no automatic rollback occurs.

## Manual GitHub configuration

After the Milestone 10 commit is merged into `main`:

1. Open **Repository Settings > Pages**.
2. Under **Build and deployment**, select **GitHub Actions** as the source.
3. Open **Actions > General** and ensure GitHub Actions are enabled. The workflow's explicit job permissions remain authoritative; do not add a PAT or secret.
4. Keep the automatically created `github-pages` environment. Optional environment protection may restrict deployment to `main`.
5. Run or observe the first `main` push and confirm both **Validate and build** and **Deploy GitHub Pages** succeed before considering the migration complete.

Recommended `main` protection disables force pushes. Required status checks are compatible with pull-request development, but requiring pull requests for every `main` update will block the CMS GitHub App's direct one-commit publication model. If a ruleset is used, allow only the installed repository-scoped GitHub App to bypass that specific pull-request requirement; do not grant broad bypass or workflow-write access.

No staging host, paid service, Firebase Hosting, deployment PAT, or additional GitHub App permission is needed.
