# AGENTS.md

Guidance for automated agents working on ST Annotator. This file records what is
easy to get wrong; the full conventions live in
[docs/dev/conventions.md](docs/dev/conventions.md) and the build/release pipeline
in [docs/dev/build.md](docs/dev/build.md).

## Repository shape

- `core/backend` — Python backend package `sta` (FastAPI + SQLModel).
- `core/frontend` — TypeScript frontend package `sta` (React Router, SSR + three.js editor).
- `plugins/<name>/{backend,frontend}` — one package per data type (`bbox`, `gmesh`, `pcd`,
  `segmentation`, `vector`). Backend packages are `sta_<name>`, frontend packages `sta-<name>`.
- `distributions/full` — the product composition that registers every plugin.
- `tests/backend` — plugin-dependent backend integration tests (its own uv project).
- `tests/frontend` — Playwright suites, the cross-package type contracts, and the
  with-data fixture server.
- `config/python`, `config/js` — shared Pyright/Ruff and ESLint/TypeScript configuration.
- `scripts/` — every repository-wide command.

The `main` branch holds the pre-React JavaScript original under `packages/`.
When migrated semantics look arbitrary, check the same class name there before
assuming a bug.

## Entry points

The root `package.json` defines **no npm scripts**. Repository-wide commands are
shell scripts in `scripts/`, and the tooling scripts are `scripts/*.mjs` invoked
as `node scripts/<tool>.mjs`. Do not add root npm aliases or aggregate scripts.

All of these run from the **repository root** — `lint.sh`, `format.sh` and
friends resolve `plugins/*/` relative to the current directory and do not `cd`
themselves.

| Purpose | Command |
| --- | --- |
| Install (npm ci + uv sync + API client) | `bash scripts/install.sh` |
| Lint (non-mutating, both languages) | `bash scripts/lint.sh [all\|backend\|frontend]` |
| Format (rewriting counterpart) | `bash scripts/format.sh [all\|backend\|frontend]` |
| Tests | `bash scripts/test.sh [all\|backend\|frontend]` |
| Docs (Sphinx + TypeDoc + MkDocs) | `bash scripts/doc.sh` |
| Clean rebuild of publishable packages | `bash scripts/build-dev.sh` |
| Production build / smoke test | `bash scripts/build-prod.sh`, `bash scripts/smoke-prod.sh` |

`lint.sh` and `format.sh` take the same argument shape and cover the same trees.
`scripts/format.sh` is the only rewriting entry point; ESLint autofix and
Prettier are both inside it.

### Running the application

- Development: `bash scripts/serve-dev.sh -c appconfig-postgis.json` starts the
  backend plus the source-watching Vite frontend. A production build is **not** a
  prerequisite — Vite compiles current source on demand. Use `bash
  scripts/build-dev.sh` only when you need clean package artifacts.
- Core-only frontend (no plugins, since `core/frontend/sta.config.ts` registers
  none): `npm run dev` inside `core/frontend`.
- Production: `bash scripts/build-prod.sh`, then `bash scripts/serve-prod.sh -c
  appconfig-postgis.json`, which starts `sta serve` and the React Router server as
  one pair (`--backend-url`, `--backend-bind` and `--frontend-url` override the
  defaults). To run the frontend as its own process, `npm start` in
  `core/frontend` with `STA_BACKEND_URL` pointed at the public backend origin;
  the deployment artifacts are `core/frontend/build/server` and
  `core/frontend/build/client`. Backend configuration itself is documented in
  [docs/user/config.md](docs/user/config.md).
- The runtime floor is Node 20 (React Router 7's minimum, declared in every
  `package.json`); the backend requires Python 3.10+ and CI verifies 3.10–3.12.

### Continuous integration

`.github/workflows/pre-release.yml` gates a change with these same scripts; every
job first runs `.github/actions/setup`, which calls `scripts/install.sh`. The
backend job runs `lint.sh backend` then `test.sh backend` across Python 3.10–3.12;
the frontend job runs `build-dev.sh` → `lint.sh frontend` → `test.sh frontend` →
`node scripts/test-frontend-packages.mjs` → `build-prod.sh` → `smoke-prod.sh`; a
separate job runs `doc.sh`. Anything that breaks those is not ready to merge.

## Environments

- **Python:** use the uv workspace, never a stray conda interpreter. The shared
  environment is `.venv` at the repo root; run everything as
  `uv run --package <pkg> --directory <project> …`. A bare `pytest` from a
  system/conda environment resolves different dependency versions than CI and is
  not a verification result.
- **Node:** one npm workspace with one root `package-lock.json`. Run `npm ci` at
  the repository root only. Never `npm install`/`npm ci` inside `core/frontend`,
  a plugin, or `tests/frontend`.
- Regenerating a lockfile must not upgrade unrelated packages
  (`npm install --package-lock-only`, then diff the lockfile and keep the change
  limited to the intended entries).
- `uv lock` refreshes on local install; CI uses `uv sync --frozen`. Do not let a
  feature commit silently change dependency resolution.

## Backend rules

Rules that constrain backend work anywhere. A rule about one feature or one
file belongs where it is implemented — in the source it describes, or in
[docs/dev/plugin.md](docs/dev/plugin.md) for a plugin contract.

- The core backend test suite is **plugin-free**. Tests that need a plugin
  belong in `tests/backend`, which depends on both core and the plugins.
- Plugins register through the `sta.plugins` entry-point group, discovered in
  **sorted target name** order so FastAPI route order — and therefore the
  generated client's operation order — never depends on interpreter discovery
  order. A backend without the plugins installed simply exposes no plugin routes.
- Core-then-ORM deletes are a standing hazard: bulk-delete the link rows with
  `synchronize_session=False` and expire exactly the affected collections. For a
  cascading delete (task subtree, project tasks), do this for the **entire**
  cascade set, not only the directly deleted record.
- Core owns the deferred-work queue (`sta/models/job.py`, `sta/domain/jobs`) and
  a plugin supplies the work by `register_job_executor(kind, executor)` in its
  `register()`. `build_api` leaves the worker **off** (tests assert on what a
  request left behind); only `sta serve` starts it, and a caller needing
  consistency before returning uses `run_pending_jobs()` — committing first,
  because a failed job rolls its transaction back. Reading a data file belongs
  in such a job, never in a request.
- FastAPI captures `response_model` at decoration, so changing an endpoint's
  return annotation afterwards does nothing; a renamed pydantic v2 model keeps
  its old OpenAPI name until `model_rebuild(force=True)`. Both reach the
  generated client: an `Annotated[..., WithJsonSchema({...})]` type must include
  `'type'` in its schema dict or the client emits `unknown` for that field.
- PATCH payload models widen every field to `X | None`, which conflates "absent,
  leave the stored value" with "explicit null, clear it". `RequiredFieldNullGuard`
  (`core/backend/sta/models/base.py`) refuses the second reading wherever the column
  is NOT NULL, so the violation is a 422 naming the field instead of an unmapped
  not-null `IntegrityError` 500, and the required set is *derived* from the table
  model rather than restated. Its docstrings own every exception (a deliberately
  normalized null, the `ClassVar` annotation a hand-written payload must keep, which
  fields the table model cannot cover). Do not re-add a domain-layer `is None` guard
  for a real column; the model is the single place that refuses it.
- Docstrings are reST/NumPy style; Ruff checks the `D` ruleset, with `D1`
  (missing docstrings) unenforced. `E501`, `COM812` and `ISC001` are off because
  the formatter owns line width and trailing commas — do not re-enable them.

## Frontend rules

Rules that constrain frontend work anywhere. How one component, pane, or plugin
scaffold behaves belongs in
[docs/dev/conventions.md](docs/dev/conventions.md) or in the source it describes.

### Backend access

Access to the backend should be done via `sta/client`. Whenever changes to the backend are made,
make sure to regenerate the client by running `bash scripts/generate-openapi-client.sh`.

Avoid using `sta/client-instance` directly for sending requests as doing so might miss
some built-in features such as cookie-based authentication.

### Editor state ownership

The editor is a deliberate React/three.js hybrid;
[docs/dev/design/editor-state-management.md](docs/dev/design/editor-state-management.md) is
normative. The load-bearing constraints:

- Imperative domain models are the single source of truth and the only writers of
  three.js objects. React never sits in the render loop, never mirrors model
  state, and never writes the snapshot or the scene.
- No `three` import in any `*.react.tsx` / `*.react.ts` module — lint-enforced
  via `threeBoundaryPatterns` in `config/js/eslint.config.mjs`. When a package
  adds its own `no-restricted-imports` block for TS files it must spread that
  list, or the boundary disappears from its React modules.
- React reads multi-consumer state through the `EditorState` snapshot
  (`useEditorSelector`) and writes through intents (`useEditorIntents`).
  Imperative exceptions must fit one of the rationales documented on the design
  page; do not hand-roll React subscriptions to editor sources.
- **Nothing asserts at runtime that the scene matches the UI.** Synchronisation is
  guaranteed by construction (single write path, notify after mutate, UI emits
  intents), so a mutation that forgets to dispatch a notification leaves the UI
  silently stale. Every new mutation needs a notification, and every new
  in-place mutation on a stable reference needs its own counter in the mapper's
  invalidation fingerprint.
- Keep the render loop change-driven, not per-frame: repaint only what a dirty
  signal marks, and do not reintroduce polling or per-frame recomputation of
  layout, hints, or settings output.
- Register listeners through the `EventSubscriptions` tracker
  (`app/routes/editor/utils/`) so disposal is LIFO and idempotent, and dispose
  every source you construct.

### Composition and module resolution

- Plugin contributions are discovered structurally at runtime; the composition
  root (`runtime.ts`) names no plugin. The main frontend imports plugin packages
  **only** in `sta.config.ts` (lint-enforced), and a distribution's
  `sta.config.ts` is what activates a plugin — installing never does. Registering
  a plugin touches its `file:` dependency (and the lockfile) plus that config
  file; nothing per-plugin belongs in the runtime.
- The whole editor and plugin module graph must stay Node-import-safe (no DOM at
  import time), because the SSR bundle includes it without stubs.
- Every `sta` and `sta-*` package `exports` subpath targets a built `dist/`
  artifact, while core typechecks against its own TypeScript source. A stale
  package build is therefore invisible to `typecheck` yet live in the browser:
  rebuild (`bash scripts/build-dev.sh`) before trusting a browser or
  package-consumer result, and build the plugins before their dependents.
- Frontend linting is type-aware (`recommendedTypeChecked` + `stylisticTypeChecked`
  through the TS project service). Some high-volume rules are pinned off in the
  shared config with a comment; re-enabling one means fixing its violations per
  package first. Sources outside a tsconfig project are linted without type info.

### Auth, requests, and forms

- The browser never carries an access token through editor runtime or view
  objects. The React Router host keeps it in an HTTP-only session and exposes a
  same-origin authenticated proxy (`app/routes/backend-proxy.ts`); editor and
  plugin traffic goes through it. File downloads use a dedicated resource route
  (`app/routes/source/files-download.ts`) so binary responses stream instead of
  being serialized through action data.
- The proxy forwards an explicit header allow-list, so a new backend header that a
  browser call must supply has to be added there or the request 422s before ever
  reaching the backend. Identity headers are deliberately **not** forwarded: they
  are re-derived server-side from the signed session, so accepting either from the
  browser would be a spoofing hole.
- Paginated grids round-trip server-side filtering and sorting through URL state.
- A relationship id list a payload carries **replaces** that relationship outright, while an
  omitted field leaves the stored links alone and an explicit `null` is refused with 422. An
  edit form must therefore seed the record's full membership and submit it back: an id its
  picker could not list is otherwise dropped, and dropping one silently un-assigns it.

## Generated artifacts

- `core/frontend/client/` is generated from the **running** backend's OpenAPI
  schema and is gitignored. Frontend typechecking reads it from disk, so a
  backend schema change is invisible — including to the
  `openapi-conformance*.ts` compile-time gates — until the client is
  regenerated. Regenerate with `bash scripts/generate-openapi-client.sh`
  (or `npm run openapi-ts --workspace=sta`, which includes the mandatory
  `scripts/export-openapi-client-types.mjs` post-step that restores the public
  client contract exports). Never hand-edit generated files; back the directory
  up before regenerating, since git offers no safety net.
- Every environment generates its own client from its active backend; generated
  operation-name suffixes shift with plugin load order, so diff the exported
  operation inventory rather than the line count when checking a regen.
- `core/frontend/app/sta-config.shim.ts`, `app/sta-routes-config.shim.ts` and
  `public/build-hash.txt` are generated by the config-selection script; package
  scripts select them via `pre*` hooks. The shims are one file per checkout, not
  one per server, so a `pre*` hook also re-points a dev server that is already
  running — core's hooks select the plugin-free `sta.config.ts`, which silently
  drops every plugin route from it. A Playwright run that reuses an existing
  frontend therefore serves whatever composition the shim held when the browser
  last loaded it, so the suites assert the item types they depend on instead of
  waiting on a tab that was never contributed.

## Testing

How to verify work anywhere in the repository. How to write a spec for one suite
belongs to that suite's own README, and why a harness setting is what it is
belongs in the file that sets it.

### Backend

- `bash scripts/test.sh backend` runs each package's pytest through uv
  (core, every plugin, then `tests/backend`). Narrow iterations are fine
  (`uv run --package sta --directory core/backend pytest
  test/domain/test_data.py`), but a targeted green run is not a finished
  verification.
- This is a shared, loaded machine: a setup-phase database-connection error or a
  lone hypothesis deadline failure is environmental, not a regression. Retry it in
  isolation before suspecting the change under test. Why the runner parallelises the
  way it does is recorded where it is set, in `scripts/test.sh` and
  `core/backend/test/conftest.py`.
- Core suites opt out of what they do not need with `pytest.mark.in_memory_db` and
  `pytest.mark.no_plugins`; both are implemented and explained in
  `core/backend/sta/testing/config.py`.

### Frontend

- Unit tests live in each package's mirrored `test/` tree (`core/frontend/test/`,
  `plugins/<p>/frontend/test/`), never colocated with `app/`. A test that
  exercises a specific plugin belongs to that plugin, not to core: core frontend
  tests must not import repository plugins.
- Rendering-focused behaviour is a unit-test problem — build an `EditorState`
  fixture (`app/routes/editor/testing`) and drive intents. The browser is for what
  only a browser proves: input registration, rendered output, network requests, and
  persistence. When equivalent unit coverage lands, delete the redundant browser
  scenario rather than keeping it as insurance.
- Race and guard tests must be verified red against a mutated implementation
  before being accepted; a defect fix ships with a regression test that fails
  before the fix.

### Editor E2E

Whenever you change a code pattern in the frontend or backend for a plugin,
make sure that it also applies to other plugin packages so that the architecture stays consistent.

`tests/frontend/with-data/` is the data-backed editor suite: one worker against a
fixture backend seeded from synthetic point-cloud data, and a full pass well over
twenty minutes that must run undisturbed. Which Playwright config covers which
scenario, how to install browsers and invoke one suite, and the rules for writing a
spec in it — probe-projected gestures, deterministic seed addressing, waiting on the
demand renderer instead of sleeping, the retry opt-out, uncovering occluded targets,
and pane-locator visibility — belong to `tests/frontend/README.md`.

Authorization coverage is indexed by `tests/backend/AUTHORIZATION_INVENTORY.md`,
which records the human-readable role and resource policy for core and plugin
operations.

## Documentation

- Shared repo docs describe the **current** state in present tense: no dates, no
  commit narrative, no run tallies. Put completion records in commits or plans,
  not reference documentation.
- Refresh docs in the same change as the behaviour they describe.
- `scripts/doc.sh` **is** warning-gated, so a green run means no warning was
  reported: TypeDoc through `treatWarningsAsErrors`, Sphinx through `-W`, and MkDocs
  through `--strict`. Curate a new warning at its cause rather than silencing a stage,
  and each gate says where at the file that owns it — `typedoc.json`,
  `core/frontend/typedoc-suppress-dts-warnings.js`, `mkdocs.yml`, `scripts/doc.sh`.

## Guardrails

- Never read or print database configuration: no `.env`, no DB environment
  variables, no connection strings. The backend loads its own config; observe
  behaviour through the application instead.
- When an assertion contradicts a deliberate product/access rule, the rule is
  authoritative and the assertion is stale: update the test to assert the new
  behaviour **positively** (row-scoped, still discriminating), correct the
  handbook prose, and pin the rule with a focused backend test. Confirm the
  direction before editing, and never weaken an assertion silently.
- Do not add defensive fallbacks, abstractions, or validation for states that
  cannot occur; validation belongs at system boundaries.
- Do not "fix" a documented intentional divergence (plugin interaction-state
  differences are pinned by tests) without changing the decision itself.
