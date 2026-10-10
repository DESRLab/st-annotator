# Frontend E2E Tests

These Playwright tests run the real backend and frontend, then exercise handbook workflows through the browser.

## Run

```sh
# From the repository root
bash scripts/install.sh
bash scripts/build-prod.sh
npm run install:browsers --workspace=st-annotator-frontend-tests
npm run test:e2e --workspace=st-annotator-frontend-tests
```

The repository has one npm workspace and one root lockfile. Do not run
`npm install` or `npm ci` inside `tests/frontend`. The build stage is required
on a clean checkout because the full test composition imports core and plugin
package exports from their generated `dist/` directories.

After the workspace is installed and built, run both browser suites with:

```sh
bash scripts/test.sh frontend
```

That command also runs the core and plugin frontend unit tests. To run only one
browser suite, use its workspace script directly:

```sh
npm run test:e2e --workspace=st-annotator-frontend-tests
npm run test:e2e:auth --workspace=st-annotator-frontend-tests
npm run test:e2e:with-data --workspace=st-annotator-frontend-tests
```

`npm run test:e2e` uses the standard testing server with an empty temporary database seeded with `admin` / `admin`. Browser specs provision a disposable role-specific account through the admin API when the empty-database workflow needs one.

`npm run test:e2e:auth` runs the isolated access-expiry and refresh-rotation
scenario with a two-second access-token lifetime.

`npm run test:e2e:with-data` runs the data-backed suite under `with-data/` against a temporary database seeded with fully synthetic point clouds and bounding box labels; use it for editor workflows that need point cloud and label data.

Each suite writes an independent HTML report. Open a completed run in your
browser with the corresponding command:

```sh
npm run show-report:e2e --workspace=st-annotator-frontend-tests
npm run show-report:auth --workspace=st-annotator-frontend-tests
npm run show-report:with-data --workspace=st-annotator-frontend-tests
```

These commands serve the saved report locally and open it in the default
browser. They do not rerun the tests.

### Forwarding Playwright options

The base npm scripts forward everything after `--` to Playwright, so options
can be composed without adding a package script for every variant. For example:

```sh
# Watch the standard suite run in a visible browser.
npm run test:e2e --workspace=st-annotator-frontend-tests -- --headed

# Open Playwright UI mode for the isolated refresh suite.
npm run test:e2e:auth --workspace=st-annotator-frontend-tests -- --ui

# Run one with-data interaction and retain a trace even when it passes.
npm run test:e2e:with-data --workspace=st-annotator-frontend-tests -- \
  --trace on --grep "playback controls"
```

Playwright does not expose video mode as a test CLI flag. Set
`STA_E2E_VIDEO=on` to record successful tests, while continuing to forward any
other Playwright options normally:

```sh
STA_E2E_VIDEO=on npm run test:e2e:with-data \
  --workspace=st-annotator-frontend-tests -- \
  --trace on --grep "playback controls"

npm run show-report:with-data --workspace=st-annotator-frontend-tests
```

Without `STA_E2E_VIDEO=on`, videos and traces retain their default
failure-only behavior. Video capture is intentionally opt-in because the
with-data suite produces large artifacts.

Do not run npm scripts with `npx`; use `npm run <script>`. The examples below
assume `cd tests/frontend`; alternatively, append
`--workspace=st-annotator-frontend-tests` when running them from the repository
root.

On a host without a display server, wrap the command in Xvfb:

```bash
xvfb-run -a npm run test:e2e -- --headed
xvfb-run -a npm run test:e2e:with-data -- --headed
```

For visible browser debugging on a machine with a display:

```bash
npm run test:e2e -- --headed
npm run test:e2e:with-data -- --headed
```

Playwright UI mode also forwards through the base scripts:

```bash
npm run test:e2e -- --ui --ui-host=0.0.0.0 --ui-port=9323
```

It needs a desktop display and stays open until closed. On a headless host,
prefix the same command with `xvfb-run -a`.

## Servers and URLs

The default Playwright config starts:

- backend: `uv run --directory ../.. --package sta sta serve -c appconfig-postgis.json --http localhost:8000 --testing`
- frontend: `STA_BACKEND_URL=http://localhost:8000 STA_CONFIG_PATH=../../distributions/full/frontend/sta.config.ts npm --prefix ../../core/frontend run dev -- --host localhost --port 5173`

The with-data Playwright config starts:

- backend: `uv run --directory ../backend --package sta-integration-tests python ../frontend/serve_e2e_fixture.py --http localhost:8000`
- frontend: `STA_BACKEND_URL=http://localhost:8000 STA_CONFIG_PATH=../../distributions/full/frontend/sta.config.ts VITE_STA_E2E_PROBE=1 npm --prefix ../../core/frontend run dev -- --host localhost --port 5173`

Both frontends explicitly select the full distribution. Installing a plugin in
the workspace does not activate it; the selected `sta.config.ts` does.

Because that selection lives in one generated file per checkout
(`core/frontend/app/sta-config.shim.ts`), a tooling run in the same checkout can
re-point a server that is already up. Wherever a test waits for something only a
plugin can render, it samples the served composition and reports it instead of
waiting out its timeout: `helpers/ui.ts` does so in `clickItemTypeLink` and at the
start of every `handbook data workflows` test, and `waitForEditorDataLoad` names
it when the editor never requests its frame data.

Both configs follow the standard URL contract: they read `STA_BACKEND_URL` and `STA_FRONTEND_URL` (defaulting to `http://localhost:8000` and `http://localhost:5173`) and derive each webServer's bind address, the browser base URL and the health-check URLs from them. Run `bash verify_e2e_urls.sh` to verify the contract end to end.

The with-data fixture helper creates the same `_test` database as `sta serve --testing`, seeds synthetic point cloud and bounding box labels, creates `e2e-annotator`, `e2e-data-manager`, and `e2e-project-manager` accounts, and grants the annotator membership, task assignment, and branch write access for editor scenarios. It keeps that database alive only while the backend server is running.

## Editor specs

`with-data/` is the data-backed editor suite. It boots a fixture backend seeded
from synthetic point-cloud data and runs a single worker, so a full pass takes
well over twenty minutes and must run undisturbed: concurrent build or test jobs
are its timing flakes.

It also cannot share the checkout with a tooling run. `core/frontend/app/sta-config.shim.ts`
is the generated file that decides which plugin composition the frontend serves,
and there is one per checkout, so a `scripts/doc.sh`, `scripts/lint.sh`, or core
`typecheck` / `lint` / `test:unit` run rewrites it to the plugin-free
`core/frontend/sta.config.ts` underneath a dev server that is already up. The
editor then registers no layers, so it never requests its frame data and every
test that opens the editor fails for that one reason; `waitForEditorDataLoad`
names that condition instead of waiting out the test timeout.

Keep the suite focused on what needs a browser:
user-input registration (pointer/keyboard routing), rendered canvas/WebGL output,
network requests, and persistence. When equivalent unit coverage lands, delete
the redundant scenario rather than keeping it as insurance.

- **Project gestures through the probe, don't guess coordinates.** Pointer and
  rendering specs drive real gestures through the editor's projection probe, gated
  by `VITE_STA_E2E_PROBE`, which only `playwright.with-data.config.ts` sets; without
  the flag there is no probe and no behaviour change. Use the typed wrappers in
  `with-data/editor-helpers.ts` (`projectLabelPoint`, `projectTransformHandle`,
  `projectWorldPoint`, `probeHoveredLabel`, `dragFromProjectedTarget`), and bisect
  routing-vs-rendering-vs-disabled with the hover/raycast reads before touching a
  coordinate.
- **Address seeds deterministically.** Seeded labels carry stable uuid ids
  (`seededLabelId` / `SEED_IDS`) and are read through the element API, never by
  parsing a bulk payload captured during navigation, which can resolve to the
  default frame's data under load. Frames come from `loadEditorFixture`, which pins
  `sort_by=min_timestamp` so `frames[i]` is frame *i*; a new direct `/frames/` read
  must pin `sort_by` too, or the timestamped seeds fall outside the opened frame's
  label window and projections stay null forever.
- **Synchronise, don't sleep.** Pixel assertions wait on the demand renderer's
  generation (`getEditorRenderState`, `waitForEditorRenderAfter`,
  `waitForEditorRenderSettled`). Every data load resets interaction state and closes
  the input gate, so wait for bulk activity to settle before asserting a gesture or
  hotkey, and blur `document.activeElement` first — hotkeys are swallowed while a
  form or Tweakpane control holds focus. To assert a *gated* state, wait for the
  app's own presentation of it — the `project-loading-overlay` row naming the
  outstanding layer — rather than for a bulk request to have started: a request can
  be a neighbour's prefetch or a superseded load that aborts, and either leaves the
  layer interactable, so the press lands outside the window being tested.
- **Opt out of retries when a spec mutates shared state.** The suite allows retries
  for timing-sensitive gestures and browser disconnects, but a spec that persists to
  the shared fixture database (frame-status cycles, `Ctrl+S`) or restores its gesture
  mutations in place sets `test.describe.configure({ retries: 0 })` so a retry cannot
  start mid-mutation.
- **Use real pointers only on exposed targets.** The default layout stacks draggable
  panels over the display and over each other, so call `uncoverTarget` before any
  real-pointer gesture. Orthographic 2D keeps the page-pixel to scene mapping 1:1,
  and a drag must start inside `#main-window` to reach OrbitControls.
- **Locate pane controls by visible row.** Controls duplicated by inactive tabs need
  visible-row locators. Inspector compatibility selects are hidden native controls,
  so only tests deliberately exercising that surface pass `selectOption(..., { force:
  true })`; the general pane-row helper stays visibility-agnostic.

Known coverage gap: bbox transform-gizmo *constraints* have no scenario — the probe
supplies the needed projection, but no spec drives a constrained drag. That is a gap,
not an observed defect.

## Current Coverage

The empty-database suite maps one spec file to each handbook page currently under test:

- `handbook-account.spec.ts`: login, profile pages, settings pages, admin account table CRUD, admin-side username/password/role updates, self-service username/password updates, and access restrictions.
- `handbook-data.spec.ts`: source group CRUD, file explorer, source storage/spec dashboards, label group CRUD, label storage/spec dashboards, object-class pages, repository read/open checks, branch CRUD, and commit graph.
- `handbook-projects.spec.ts`: project CRUD, task CRUD, task opening, recent frames pages, all frames table/read controls, and the batch completion write reached from the row menu by both a project manager and a frame's own account.

The data-backed suite currently includes:

- `with-data/handbook-editor.spec.ts`: annotation editor point cloud layer/preferences controls and bounding box actions, tools, preferences, selection, and clipboard controls.
- `with-data/editor-load.spec.ts`: workspace loading plus application/inspector panel gestures and minimap window move/resize contracts.
- `with-data/editor-state-regression.spec.ts`: the editor initializes from the URL into the matching project/task/branch/frame state and mirrors layer, enabled, and preference state.
- `with-data/grid-filtering.spec.ts`: server-side grid filtering and sorting across the frames, projects, and source/label group grids.
- `with-data/interaction-cursors.spec.ts`: label layers apply their interaction cursors without fighting over them.
- `with-data/editor-rendering-and-label-workflows.spec.ts`: rendered preference effects plus pointer-driven bbox, vector, and segmentation creation, inspection, editing, history, and persistence workflows.
- `with-data/editor-hotkeys.spec.ts`: behavioral hotkey coverage, including active-layer isolation for overlapping shortcuts.
- `with-data/editor-frame-status.spec.ts`: Complete/Incomplete frame status updates persist across reloads.
- `with-data/editor-project-navigation.spec.ts`: frame-ID/index and frame-row navigation, row status actions, path sorting/stride/display, playback, FPS, and read-only frame bounds.
- `with-data/editor-pointer-gestures.spec.ts`: main-camera zoom/orbit/pan and minimap pan/coordinate-tooltip behavior.
- `with-data/assistant-labeling.spec.ts`: point-cloud assistant encoding, left/right-click prompting, segmentation creation and inspection, and failure integrity.
- `with-data/editor-bbox-pointer-routing.spec.ts`: bbox pointer hit routing, selection, drawing, and interaction ownership across editor modes.
- `with-data/editor-vector-pointer-routing.spec.ts`: vector pointer hit routing, selection, drawing, and interaction ownership across editor modes.
- `with-data/files-browser.spec.ts`: file explorer navigation and plugin-provided file actions against the seeded fixture filesystem.

## Environment Overrides

```bash
STA_BACKEND_URL=http://localhost:8100 \
STA_FRONTEND_URL=http://localhost:5273 \
STA_E2E_ADMIN_USERNAME=admin \
STA_E2E_ADMIN_PASSWORD=admin \
npm run test:e2e
```

`STA_BACKEND_URL` / `STA_FRONTEND_URL` retarget the whole stack: the webServer bind addresses, the browser base URL and the backend CORS origin. `STA_E2E_ADMIN_USERNAME` / `STA_E2E_ADMIN_PASSWORD` replace the admin credentials the specs log in with.

The editor fixture is fully synthetic: `tests/frontend/serve_e2e_fixture.py` generates the point clouds and labels itself, so the with-data suite needs no external dataset.
