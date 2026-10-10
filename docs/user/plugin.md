# Registering a Plugin

Here is the procedure of registering a [plugin](../dev/plugin.md) on the ST Annotator platform.

## Procedure

1. From the repository root, run `bash scripts/install.sh` to install or update every backend workspace package.
   - Backend plugins are discovered through the `sta.plugins` Python entry point group.
   - A bare `uv sync --all-packages --all-groups` is not a working alternative: the script synchronizes twice, the first pass with `--no-install-package cloth-simulation-filter`, because the gmesh plugin's pinned cloth-simulation-filter build runs without PEP 517 build isolation (the workspace root lists it under `no-build-isolation-package`) and builds against the workspace NumPy, which the first pass installs.
   - The same script installs the frontend workspace with `npm ci` and regenerates the TypeScript API client from the backend's OpenAPI document; frontend builds also regenerate it, so the client the plugins' routes call stays in sync with the backend.
2. Install or update the frontend package that contains the plugin routes and editor code.
   - In a checked-out repository the installation script above covers this, since every plugin frontend is a member of the root npm workspace.
3. Register the frontend plugin in the target distribution's `sta.config.ts`.
   - Add the frontend package to that distribution's dependencies, then import its `./app` export and add it to the `plugins` map.
   - Import the plugin's lightweight `app/routes.ts` manifest from workspace source in the adjacent `sta.routes.ts` and add it under the same plugin key. React Router loads this file before application Vite aliases are available, so it must not import the runtime package barrel.
   - The complete repository product uses `distributions/full/frontend/sta.config.ts`; core's default configuration intentionally contains no plugins.
   - Add the plugin to the `plugins` map so its source data, label data, source specification and label specification routes appear in the data management site.
   - Keep the `plugins` map key identical to the plugin's backend loader key and its `sourceLookupNames`, as every shipped plugin does (`pcd` for `SOURCE_DATA_LOADERS["pcd"]` and `sourceLookupNames: ["pcd"]`, `bbox` for `LABEL_DATA_LOADERS["bbox"]`): the same key names the editor's layers, the overlay-DOM slots, and the per-layer editor state slice that a plugin's React panes select from.
   - If the plugin integrates with the file explorer, its frontend entrypoint registers file handlers when the app starts.
4. [Restart the web server](./host.md) to enable the backend and frontend plugin changes.

Frontend data management routes follow the same permissions as the core data management site: users with the `data-manager` role can create, modify and delete data; users with only the `project-manager` role can view data pages in read-only mode and cannot use the file explorer.
