# Build, Distribution, and Release

ST Annotator has two independently packaged layers:

- Python packages provide the backend core and backend plugins.
- npm packages provide the frontend core and frontend plugins.

The repository is a development workspace for both layers. The Python packages
are members of the root uv workspace, while all frontend packages use the root
npm workspace and its single `package-lock.json`.

## Set up the workspace

Run the installation script from the repository root:

```sh
bash scripts/install.sh
```

The script runs one root `npm ci`, synchronizes every Python workspace package,
starts a temporary backend on `localhost:8000` from `appconfig-postgis.json`,
and regenerates the TypeScript API client from the backend's OpenAPI document.
That temporary backend runs with `--debug --testing`, which drops and recreates
the separate `<db>_test` database, so installation needs a reachable
PostgreSQL/PostGIS server, a populated `.env`, and `curl` on the `PATH`. The
generated client is environment-specific and
ignored by Git. Run the installation script after changing backend API
contracts or the workspace lockfiles. Local installation refreshes `uv.lock`
before syncing; in CI, installation uses `uv sync --frozen` so dependency
resolution cannot alter the committed lockfile.

For normal frontend-only work, an existing checkout can be refreshed with:

```sh
npm ci
```

Do not run separate installs inside `core/frontend` or plugin directories.
Workspace packages are linked by npm, and the root lockfile is the reproducible
record of the complete frontend development environment.

The standard development workflow is:

```sh
bash scripts/install.sh
bash scripts/serve-dev.sh -c appconfig-postgis.json
```

`install.sh` installs dependencies and generates the API client. `serve-dev.sh`
then rebuilds outdated frontend package exports in dependency order and
starts the backend and the source-watching Vite frontend development server.
It checks package sources for changes while the server runs. A production
build is not required: Vite compiles application source on demand.

Run `bash scripts/build-prod.sh` separately when producing publishable package
artifacts, validating the full production composition, or preparing a release.
It is a production/package validation command rather than a prerequisite for
`serve-dev.sh`.

Run `bash scripts/build-dev.sh` when you need a clean rebuild of the
publishable frontend packages during development. The development server
performs incremental package builds automatically.

## Frontend package builds

The frontend distinguishes a **package build** from an **application build**.

### Build distributable packages

From the repository root, run the development build script:

```sh
bash scripts/build-dev.sh
```

The script first removes all generated package and application output:
`core/frontend/{.react-router,build,dist}`, every plugin frontend's `dist/`,
the generated composition shims, and the production build-hash marker. It then
invokes `build:package` for `sta` and each frontend plugin, in the explicit
workspace list in the script; a new plugin must be added to both the cleanup
and build lists.

The OpenAPI client under `core/frontend/client/` is generated during both
installation and frontend builds. Each generation briefly starts the testing
backend and requires the configured database to be reachable.

Each package build:

1. removes that package's previous `dist/` directory;
2. compiles TypeScript to JavaScript;
3. emits declaration files and source maps;
4. copies runtime assets such as CSS, shaders, images, JSON, and WASM; and
5. makes emitted relative ESM imports directly consumable by Node and bundlers.

The result is a `dist/` directory in each package. Package `exports` point to
these built files rather than repository TypeScript sources, and the `files`
field limits a packed package to its intended runtime artifacts. `npm pack` and
`npm publish` run the package's `prepack` script, so they rebuild `dist/`
automatically.

`scripts/build-dev.sh` cleans every package before any rebuilding starts.
Cleaning is also part of each package's `build:package` command. Consequently
direct `npm pack`/`npm publish` builds cannot retain files for deleted or
renamed sources, and retrying an interrupted build starts that package from an
empty output directory.

While `serve-dev.sh` is running, its watcher recompiles changed packages
without deleting `dist/` first. This keeps package entry points available to
Vite during a reload. Run `bash scripts/build-dev.sh` with the dev server
stopped when deleted or renamed sources require a fully clean output tree.

The core package has no frontend plugin dependency and is valid by itself.
Plugin manifests describe their own runtime closure. Installing a plugin with
indispensable plugin prerequisites also installs those prerequisite packages;
optional siblings remain host-selected.

### Verify packages outside the workspace

Workspace hoisting can hide undeclared imports. Before releasing frontend
packages, run:

```sh
node scripts/check-frontend-dependencies.mjs
node scripts/test-frontend-packages.mjs
```

`check-frontend-dependencies.mjs` validates internal dependency ranges, plugin
contracts, and package exports. `test-frontend-packages.mjs` builds and packs
all frontend packages, then installs their tarballs in temporary projects for
these compositions:

- core only;
- each plugin with its required dependency closure; and
- the complete plugin set.

The temporary projects resolve the core package's `sta/app` and `sta/client`
exports and each plugin's `<plugin>/app` export, and perform a real import of
`sta/client`. `check-frontend-dependencies.mjs` separately verifies that every
declared export target exists on disk. This is the release gate that proves
package consumption does not depend on npm workspace hoisting.

To inspect one package manually, use:

```sh
npm pack --dry-run --workspace=sta-vector
```

## Frontend application compositions

Installing a frontend plugin does not activate it. An application composition
chooses runtime plugins explicitly in a `sta.config.ts` file and their
lightweight route manifests in the adjacent `sta.routes.ts` file. Keeping route
metadata separate lets React Router discover routes from workspace source
before the application's Vite aliases are active.

The repository provides two compositions:

- `core/frontend/sta.config.ts` and `sta.routes.ts` are the core-only defaults
  and register no plugins.
- `distributions/full/frontend/sta.config.ts` imports and registers every
  repository plugin in dependency order; its adjacent `sta.routes.ts` imports
  the matching route manifests directly from workspace source.

`STA_CONFIG_PATH` selects the composition used by Vite and React Router. If it
is unset, Vite searches upward for the nearest `sta.config.*`, which is normally
the core-only configuration when commands run from `core/frontend`. A relative
`STA_CONFIG_PATH` is resolved from the command's working directory.
The routes configuration is derived by replacing `.config` with `.routes` and
must exist beside the selected application configuration.

For example, run a core-only development server with:

```sh
npm run dev --workspace=sta
```

Run the full product with the backend and frontend together using:

```sh
bash scripts/serve-dev.sh -c appconfig-postgis.json
```

The serving script selects the full composition and passes the backend URL to
both server-side loaders and the browser client.

### Build the full application

`scripts/build-prod.sh` invokes `scripts/build-dev.sh` first, so every
production build starts by cleaning and rebuilding all frontend packages. It
then selects the full composition and invokes the core application's React
Router build. To perform the same clean package rebuild without creating the
React Router application bundle, use:

```sh
bash scripts/build-dev.sh
```

`bash scripts/build-prod.sh` selects
`distributions/full/frontend/sta.config.ts` and invokes the core React Router
production build. The deployable application is written under:

```text
core/frontend/build/
  client/  # static browser assets
  server/  # React Router server bundle
```

Serve that bundle together with a non-debug backend using:

```sh
STA_JWT_PRIVATE_KEY_PATH=/path/to/jwt-signing.key \
STA_SESSION_SECRET=<private-secret> \
bash scripts/serve-prod.sh -c appconfig-postgis.json
```

`serve-prod.sh` does not build the application. It exits with an error when the
production bundle or its build-hash marker is missing, or when source inputs
have changed since the build, so deployment remains an explicit build-then-serve
process. It serves plain HTTP; use separately managed
processes and a reverse proxy for TLS deployments.

A successful build does not by itself prove the bundle runs. Node resolves
package entry points differently from the Vite dev server, so a bundle can
compile cleanly and still fail while the server entry loads, and the browser
tests exercise the dev server rather than the built output.
`scripts/smoke-prod.sh` closes that gap: it starts the built server entry with
`react-router-serve`, asserts that `/login` responds 200 and that `/` responds
302 through the protected layout, and fails if the server bundle imports a
test-only package. The assertions are on status codes only; the script does not
inspect rendered markup. It requires no backend and no deployment secret,
supplying a throwaway
session secret because the production server refuses to start without one.

```sh
bash scripts/build-prod.sh
bash scripts/smoke-prod.sh
```

Each production build also generates an untracked build hash shared by the
client and SSR bundles. The server rejects requests with HTTP 503 if its
embedded hash differs from the deployed client marker, preventing a mixed
old-server/new-client build from being served. This guard applies to production
artifacts; the Vite development server serves current source directly and does
not require a production build hash. The source fingerprint in the production
build separately lets `serve-prod.sh` reject an outdated bundle at startup.

The distribution workspace is deliberately private. It is a composition
manifest, not another copy of core and not a publishable plugin. Its package
dependencies describe the exact packages that a full-product deployment must
install. After the build, the helper restores the generated configuration shim
to the core-only configuration so subsequent core commands are not
accidentally coupled to the full product.

A downstream product can create another private composition package with its
own dependencies and `sta.config.ts`, then build core with an absolute
`STA_CONFIG_PATH` pointing to that file.

## Backend package builds

The backend core and each backend plugin are separate Python distributions.
Their `pyproject.toml` files use `uv_build`, and plugin discovery uses the
`sta.plugins` entry-point group. Installing a backend plugin therefore enables
its backend registration; this differs from the frontend, where installation
and activation are deliberately separate.

Build a backend distribution from its package directory, for example:

```sh
cd core/backend
uv build
```

or:

```sh
cd plugins/vector/backend
uv build
```

The resulting source distribution and wheel are written to that package's
`dist/` directory. Build and test each backend package that will be published;
backend plugins declare core and prerequisite plugins as normal Python package
dependencies.

## Validation before release

CI runs backend checks across Python 3.10–3.12 and frontend checks in a
separate job. To run the same gates locally from the repository root:

```sh
bash scripts/install.sh
bash scripts/lint.sh backend
bash scripts/test.sh backend
bash scripts/build-dev.sh
bash scripts/lint.sh frontend
bash scripts/test.sh frontend
node scripts/test-frontend-packages.mjs
bash scripts/build-prod.sh
bash scripts/smoke-prod.sh
bash scripts/doc.sh
```

The lint script is the single entry point for non-mutating validation of both
languages: formatting, dependency checks, static analysis, and type checking.
`scripts/format.sh` applies the corresponding rewrites — ESLint autofixes and
Prettier formatting for the frontend, `ruff format` for Python — and both
scripts take `all`, `backend`, or `frontend`. The build script produces the
publishable frontend package artifacts and proves that the full composition
bundles successfully. The smoke script proves the built server bundle boots and
serves, which neither the build nor the browser tests cover. The test script
covers backend and frontend unit and integration tests, including browser tests.
The isolated tarball installations described above run separately through
`scripts/test-frontend-packages.mjs`. The separate documentation workflow
(`.github/workflows/docs.yml`) publishes `development/` on pushes to `main` and
builds the tagged source when a GitHub release is published. Manual runs target
`main`. Release tags use `vX.Y.Z` or
`vX.Y.Z-prerelease`; documentation directories omit the leading `v`. Published
prereleases receive their own snapshot but do not update `stable/`. The stable
alias advances only for a stable release at least as new as its current target,
so publishing an older release does not change the default documentation.
The development snapshot uses `development/` because `dev/` is the existing
developer guide path; unversioned developer guide links remain redirects.

The workflow runs `doc.sh` once, preserving its complete MkDocs, Sphinx, and
TypeDoc output. `DOCS_VERSION` selects a version-specific `site_url` through a
temporary MkDocs configuration written by
`scripts/configure-doc-version.py`; an ordinary `bash scripts/doc.sh` still builds
the standalone site. The publishing tools come from the workflow revision,
while documentation and package sources come from the selected branch or tag.
Release checkouts must support the current documentation build pipeline.

`uv run --package sta python scripts/package-doc-versions.py site <archive> <version> [--stable]`
updates the selected snapshot in an archive checkout. The `docs-site` branch
stores completed snapshots, Material-compatible `versions.json` metadata, and
redirects. Older snapshots are preserved without rebuilding them. The site root
and existing unversioned HTML paths redirect to the corresponding stable page,
or to development documentation before a stable release exists. A page absent
from the default snapshot redirects to its home page. Redirects preserve query
parameters and fragments in browsers with JavaScript. The `stable/` paths
redirect to the corresponding pages of the latest stable snapshot.

The assembled archive is uploaded with `actions/upload-pages-artifact` and
published with `actions/deploy-pages` in the `github-pages` environment. The
release run saves its snapshot and dispatches this workflow on `main`, which
updates development documentation and publishes the complete archive. It does
not deploy Pages directly: a release deployment can report success while
reusing an earlier artifact from the same source commit
([deploy-pages issue 383](https://github.com/actions/deploy-pages/issues/383)).
To republish an archived release, manually run **Publish documentation** on
`main`; the workflow includes all snapshots stored on `docs-site`.

The repository's **Settings → Pages → Build and deployment → Source** stays set to
**GitHub Actions**; `docs-site` is archive storage, not a branch-based Pages
source. The build job needs `contents: write` to persist snapshots; the deployment
job needs `pages: write` and `id-token: write`. Publishing is serialized without
cancelling an active run. Documentation deploys independently of backend and
frontend tests and does not run on pull requests.
The release publication request needs `actions: write` to dispatch the workflow
on `main`. A successful request queues publication; the dispatched run's
deployment determines whether the updated site is published.

`uv run --package sta python scripts/test-doc-versions.py` verifies snapshot preservation,
API reference inclusion, stable alias ordering, and redirects. Pre-release CI
and the publishing workflow run this check. `doc.sh` builds frontend
packages in dependency order before TypeDoc discovers their public entry points
from package exports, so documentation does not depend on existing `dist/`
artifacts.

CI does **not** publish npm packages, Python distributions, application images,
or release archives. Publishing runtime artifacts is an explicit maintainer
action; neither merging to `main` nor publishing documentation releases them.

## Release ordering and versioning

Core and plugin frontend/backend halves currently share the same release
version. Before a release:

1. run `bash scripts/set-version.sh <major.minor.patch>` from the repository
   root to set the shared release version (use `--dry-run` to preview);
2. review internal compatibility ranges when the release changes a package
   contract;
3. review the root `package-lock.json` and `uv.lock`;
4. run the validation commands above;
5. build and inspect Python distributions and npm tarballs; and
6. publish prerequisites before packages that depend on them.

For the current full composition, a safe frontend publication order is core,
`sta-pcd`, `sta-gmesh`, then the plugins that depend on them (`sta-bbox`,
`sta-segmentation`, and `sta-vector`). Publish only packages changed by the
release, but ensure every referenced version is already available in the target
registry before building or deploying the full composition.

The exact registry, credentials, signing, tags, and deployment destination are
release-environment concerns and are not encoded in this repository today. A
future automated release workflow should preserve the same package-build,
isolated-install, composition-build, and publication-order gates.
