# Writing a Plugin

A plugin is simply a function that is automatically called when you run the ST Annotator Platform.

## Example Plugin

Each plugin has its own backend package rooted at `plugins/<name>/backend/`: `pyproject.toml` and the importable package directory sit side by side, and `plugin.py` lives inside that package directory next to the package's other modules. Create the plugin file as follows:

```py
# Directory structure:
# plugins/
#   my_plugin/
#     backend/
#       pyproject.toml
#       my_package/
#         plugin.py  # beside models/, domain/ and api/ in a full plugin

def register():
    print("Successfully loaded plugin.py")
```

To register the plugin to the backend, add the following lines to `plugins/my_plugin/backend/pyproject.toml`:

```
[project.entry-points."sta.plugins"]
registry = "my_package.plugin:register"
```

The value names an importable module and function, so `my_package.plugin:register` resolves to `plugins/my_plugin/backend/my_package/plugin.py`. Then install the package. Afterwards, you should see the print statement being executed whenever you run `sta serve`.

## Plugin Structure

Each plugin lives under the top-level `plugins/` directory as a package with separate backend and frontend halves, corresponding to different application layers:

```
plugins/
  my_plugin/
    backend/
      my_package/
        models/  # Database layer
        domain/  # Domain layer
        api/     # API layer
        plugin.py
      pyproject.toml
    frontend/
      app/     # Data management routes, frontend plugin registration,
               # and editor integration (app/editor/)
      models/  # Label data state classes (label plugins only)
      test/    # Frontend unit tests
```

A backend-only plugin can omit the frontend directory. A data plugin that adds browser-visible data types should usually include both backend API routes and frontend route modules. The `app/editor/` directory holds the annotation editor integration. The `models/` directory exists only in the label plugins (bbox, vector and segmentation); it holds their label data state classes, which are consumed by the editor's data adapters as well as the plugins' own editor code, while the source plugins pcd and gmesh have none. `test/` holds the plugin's frontend unit tests.

### Backend

#### Database Layer (`models`)

We use [SQLModel](https://sqlmodel.tiangolo.com/) to define the schema for the database and CRUD operations.

#### Domain Layer (`domain`)

For each file under `domain`, use the corresponding CRUD models under `models` to construct CRUD methods that can be called from elsewhere in the codebase.

#### API Layer (`api`)

For each file under `api`, construct FastAPI endpoints that call corresponding methods in `domain` so that they can be accessed from the frontend.

## Data Plugins

Data plugins introduce new data types to the ST Annotator Platform. In general, we can categorize data types as follows:

- Source Data (e.g. point cloud)
- Label Data (e.g. bounding box)
- Source Specifications (e.g. preprocessors)
- Label Specifications (e.g. object class)

More details on each data type below:

### Source Data

Source data refers to the data referenced during the annotation process. It should not be updated by annotators.

Source data (see `SourceDataSQLModel`) includes the following attributes (\* indicates primary key):

- `id`\*: The unique identifier of the data instance.
- `group_id`: The group associated with the data instance.
- `st_bounds`: The spatiotemporal boundaries of the data instance.

Usually, source data is stored in read-only files. In this case, we can save storage space by referencing them via metadata instead of copying them into the database.

This metadata (see `SourceMetadataSQLModel`) includes the following attributes in addition to those common to source data:

- `uri`: A reference to the file containing the data instance.

Building on this, `SourceTransformMetadataSQLModel` provides a way to transform the local coordinates in a file into world space by including the following attributes:

- `transform`: The transformation matrix used to transform each coordinate in the file into the coordinate system of the database. Note that the spatiotemporal boundaries should be updated along with the transformation matrix to maintain their consistency.

As indicated by the unique constraint on (`uri`, `group_id`), the same data file can be associated with multiple groups; each such association creates a separate instance of metadata.

### Label Data

Label data refers to the data created during the annotation process. To keep track of the annotation history, we maintain snapshots of label data, which are created whenever a user performs an atomic operation. This process is similar to using a Git repository to manage the history of a codebase.

Label data (see `LabelDataSQLModel`) includes the following attributes (\* indicates primary key):

- `id`\*: The unique identifier of the data instance.
- `commit_hash`\*: The commit of the snapshot.
- `group_id`\*: The group associated with the data instance.

As indicated by the composite primary key, within a particular group, we maintain multiple snapshots for the same data instance. To save storage space, we allow `id`s to be reused between groups; such `id`s have no relation between each other, unlike the case for source data `uri`s.

We categorize label data by their compositional nature: entity (parent) and element (child).

Label entities (see `LabelEntitySQLModel`) do not exist in space and time by themselves. Rather, they are semantically defined by their constituent elements.

Label elements (see `LabelElementSQLModel`) represent concrete observations. They have the following attributes in addition to those common to label data:

- `st_bounds`: The spatiotemporal boundaries of the data instance.
- `entity_id`: The label entity acting as its parent.

### Data Specifications

Source and label data can also be modified by specifications. Unlike file metadata, which specifies data at the instance level, specification data is applied at the group level; this means that the same specification is applied to every group that uses that specification.

Specifications for source data is referred to as *source specifications* (see `SourceSpecSQLModel`); the same for label data is referred to as *label specifications* (see `LabelSpecSQLModel`). Subclass the corresponding base with the specification's own columns and bind the concrete table with `get_table_cls(tablename)`: the pcd plugin defines `PointCloudSpecSQLModel(SourceSpecSQLModel)` and binds `PointCloudSpec = PointCloudSpecSQLModel.get_table_cls("pcd_spec")`. That call generates the specification table together with the link table associating it with a group (named `<tablename>_source_group` for source specifications and `<tablename>_label_group` for label specifications), its `group_links`/`groups` relationships, and the `get_create_cls()`, `get_public_cls()` and `get_update_cls()` request and response models with their `group_ids` fields. The link table is never hand-written; where a plugin mentions these generated classes in annotations it declares them only under `if TYPE_CHECKING:` and binds the runtime names in the `else` branch.

Since object classes are very common in label data, the main library ships the object class tables ready to use: `ObjectClass` holds the class definitions and is not scoped to any group, while `ObjectClassSelection` (created by `ObjectClassSelectionSQLModel.get_table_cls("object_class_selection")`) is a label specification listing the classes selectable in a given label group, so users see only those classes in the annotation editor. The core editor loads this selection once for the selected branch's label group and shares it with label data receivers; plugin bulk label responses carry labels and class IDs, not the selection. Plugins import both tables rather than subclassing them. An author who needs a different specification extends a base instead: `ObjectClassSelectionSQLModel` for a selection that still links to `ObjectClass` rows, or `LabelSpecSQLModel` for a label specification unrelated to object classes.

Because a specification is applied to whole groups, saving one can leave every scan of those groups awaiting re-derivation, and the write says so: `enqueue_job` answers with the row it created, or `None` when equivalent work was already waiting, so only the queue can report what a save started. A plugin therefore overrides the `SourceSpecDomain` writers it extends to carry those ids up from its reconcile step — beside the record for `create_spec`/`update_spec`, alone for the delete and bulk writers — and its endpoints answer with them as `job_ids` (`sta.api.responses.QueuedJobsResponse`, `sta.api.crud.commit_queued_jobs`). The base reports an empty list, because it queues nothing: it has no reader for the data a specification configures. A client that offers to show the reader what their save began has to read these ids rather than infer a job from a success, since a save that changed nothing a derived value depends on starts none. The same reporting applies to a data write that queues, such as a bulk metadata edit, whose derived-state contract the *Data Management* notes below describe.

Note that you can define any number of specification types for each type of source/label data; how they apply to the that data is up to you.

### Backend Implementation

Use this directory structure:

```
backend/
  my_package/
    models/
      source/  # (or label/)
    domain/
      source/  # (or label/)
      editor/
    api/
      source/  # (or label/)
    plugin.py
  pyproject.toml
```

The `register` method in the backend should do the following:

- Register the plugin's router for managing source (or label) data to the corresponding parent router in the main library (`sta.api.source.data.router` or `sta.api.label.data.router`).
- (Data specifications) Register the plugin's specification router to `sta.api.source.spec.router`, as the pcd plugin does, or to `sta.api.label.spec.router`.
- Register a data loader to the main library's `SOURCE_DATA_LOADERS` (or `LABEL_DATA_LOADERS`) so that they can be shown in the annotation editor.
- (Label data only) Register labelset operations to the main library's `OP_REGISTRY` so that users can update the annotations.
- (Optional) Register the plugin's own editor endpoints under `sta.api.editor.router`; the segmentation plugin mounts its assisted-labeling proxy there.
- (Optional) Attach a resource that opens and closes with the API process by passing an async generator function to `register_lifespan_handler` (`sta.api.lifespan`); the segmentation plugin does this for its model-service client.
- (Optional) Register an executor for each kind of background work the plugin queues, with `register_job_executor(kind, executor)` (`sta.domain.jobs`); pcd and gmesh queue their spatial-bounds sweeps this way. Core owns the queue and the `job` table, so a kind whose executor is absent simply fails — the plugin that knows the work is the only place that can supply it.
- (Optional) Let browser clients read plugin-defined response headers with `expose_headers` (`sta.api.cors`). Binary source loaders need it: pcd exposes its channel and point-count headers, gmesh its vertex and face byte-length headers.
- (Optional) Attach commands to the `sta plugins` CLI (via the `plugins_cli.group` decorator).

#### Data Management

1. Define appropriate SQLModel subclasses under `models/`.
2. Define domain wrappers under `/domain`, such as `SourceMetadataDomain` for source data, or `LabelElementDomain` for label data.
3. Define corresponding CRUD endpoints under `/api`.

Source metadata whose spatial bounds are derived from its stored file inherits
`bounds_config_hash` from `SourceDataSQLModel`: the identity of the reading configuration
the stored bounds was produced under, and NULL while the record awaits derivation.
`touch_st_bounds()` must write that identity alongside the bounds on success, and write
neither on failure — a record whose file cannot be read stays pending with its reason in
`bounds_error`, so "attempted" never looks like "finished". Deriving one record belongs in
the write path; deriving a group's inventory belongs in a queued sweep
(`schedule_bounds_reconcile()`), which is what keeps a request from reading a dataset. The
pcd and gmesh domains are the reference implementations, including why an identity is
plugin-owned: pcd hashes the configuration fields its reader consumes, while gmesh has no
configuration at all and uses one constant.

#### Data Loader

Create a subclass of `DataLoader` under `domain/editor`, implementing the abstract `get_data_bulk` method to query the data from the backend. If the bulk response is JSON, also set the `data_model` class attribute to the pydantic model describing that response; the label bulk endpoint is re-registered with the union of the registered `data_model`s as its response model, so label responses stay typed end to end. Nothing consumes `data_model` for source data — the source bulk endpoint is characterized only by the keys registered in `SOURCE_DATA_LOADERS` — so source loaders such as pcd and gmesh leave it as `None`, as does any loader that returns a binary response.

<a id="backend-labelset-operations"></a>
#### Labelset Operations

For each operation, define the following:

- A unique `op_name` to identify the type of operation.
- A `pydantic.BaseModel` (or list or dictionary thereof) to express the `op_params` required by the operation. This is used to parse the JSON data sent from the frontend.
- A concrete subclass of `Operation`. Implement its `apply()` method which applies the operation to a blank `commit`. Usually, `apply()` creates a new snapshot of each label that has been updated by the operation; those snapshots are linked to the provided `commit`. The return value of this method can be used in subsequent operations (see [Placeholder Values](./design/placeholder-values.md)). For common shapes, subclass the provided `CreateBase`, `UpdateBase` or `DeleteBase` instead and implement their abstract classmethods: `CreateBase` requires `get_domain()` and `get_data(commit, params)`, `UpdateBase` requires `get_domain()`, `get_id(params)` and `get_data(params)`, and `DeleteBase` requires `get_domain()` and `get_id(params)` — it defines no `get_data()`, since the identified row is deleted as a whole.

Then register the operation to the main library's `OP_REGISTRY` via `OperationRegistry.register(op_name, op_type, params_type)`, conventionally collected into a `register_*_ops(registry)` helper that `register()` calls.

### Frontend Implementation

The plugin should include the following:

- A frontend plugin object that registers data management routes and optional startup behavior.
- A user interface for data managers to perform CRUD operations on source data and to view label data.
- A user interface to interact with the data in the annotation editor.

Register the frontend plugin by exporting an object that satisfies `STAPlugin`
as the default export of the plugin's `app/plugin.ts`, and give the package an
`app/index.ts` barrel that re-exports that registration together with the
plugin's editor module:

```ts
// app/index.ts
export { default } from "./plugin";
export * from "./editor/index";
```

The package's `./app` subpath resolves to the built barrel, so an application
importing `sta-my-plugin/app` receives the registration as its default export
and the editor contributions through its star export. Add the package to the
target distribution's dependencies and import that `./app` export from that
distribution's `sta.config.ts`. Do not add optional plugins to `core/frontend`:
core's default configuration intentionally registers none. The repository's
complete product is composed in `distributions/full/frontend/sta.config.ts`;
downstream products can provide their own composition. See [Build, Distribution,
and Release](./build.md#frontend-application-compositions) for development and
production build commands.

Plugin code reaches core through package subpaths: the `STAPlugin` type and the
`pluginRouteModule` helper come from `sta/app`, and the editor interfaces
(`EditorLayerFactoryEnv`, `findEditorLayer`, `Placeholder`,
`createPluginSliceSelectorHook`) from `sta/app/editor`.

A frontend plugin can contribute route cards to these data management dashboards:

- `routes.source.data`: source data storage pages.
- `routes.source.specs`: source specification pages.
- `routes.label.data`: label data storage pages.
- `routes.label.specs`: label specification pages.

Each route entry provides a `path`, `module` and `title`. The `path` becomes the child route under the corresponding dashboard, `module` points to the React Router route module, and `title` is displayed on the dashboard card. The `module` value is passed straight to react-router's build-time `route(d.path, d.module)` calls in `core/frontend/app/routes.ts`, so it cannot be a bare relative string such as `'./label/data/vector'`. Every shipped plugin builds it with the helper core exports from `sta/app`: `module: pluginRouteModule(import.meta.url, "./label/data/vector")`. The helper resolves the route module against the plugin's own module URL and appends the extension the bundler needs — `.tsx` when the plugin is consumed from its TypeScript sources, `.js` when it is consumed from its built `dist/` output — returning the resulting absolute path.

Plugins can also define an `entrypoint`. Use it for startup registration, such as adding source file handlers to `FILE_HANDLERS` from `core/frontend/app/plugins/source-files.ts` so the source file explorer can offer plugin-specific import actions.

`editor` is a required field of `STAPlugin` and `loader` is required within it, so every frontend registration supplies an editor loader, even one whose real contribution is data management routes. The loader returns the plugin's annotation editor integration (`() => import('./editor/index.js')`, as all shipped plugins write it) and is called by the editor runtime. The editor runtime is plugin-agnostic and discovers a module's contributions structurally:

- Export `createEditorLayer(env: EditorLayerFactoryEnv)` to contribute the plugin's scene layer. The env provides the scene `context`, the layers already created (registration order — a layer may depend only on layers registered earlier, discovered with `findEditorLayer(env.layers, SomeLayerClass)`), and the plugin's overlay DOM (`env.overlayDoms`).
- Optionally export `createEditorPreferencesMenu(env: EditorPreferencesMenuFactoryEnv)` to contribute the app's preferences menu (the layer collection exists at that point; the first contributor wins). The pcd plugin uses this for the main camera menu.
- If the layer needs React-owned overlay DOM (canvases/divs) that must exist before it is constructed, declare it in the registration's `editor.overlayDoms` — a list of `{ key, kind: 'canvas' | 'div', id?, testId? }` specs. The editor display shell creates those elements before building the runtime and passes them to the factory through `env.overlayDoms`, keyed by the spec's `key` (see the vector and segmentation registrations for examples).
- To serve the frame-creation dialog's source metadata for the plugin's source data type, set the registration's `client.source.loader`: `sourceLookupNames` lists the source-lookup names the loader serves and `loadMetadatas({ query })` returns that group's metadata records (see the pcd and gmesh registrations). The dialog dispatches by source-lookup name and passes only `query: { group_id }`; `auth` is optional in the `SourceMetadataSource` interface and core never populates it, so a loader must not depend on it.

#### Data Management

Source data routes should implement the same table behavior as the core data management pages: list, create, update, batch update and delete when the user has the `data-manager` role, and view-only behavior otherwise. Users with the `project-manager` role can access data management pages in read-only mode, so plugin routes should continue to load data for them but hide create, save, edit and delete actions unless they also have `data-manager`.

Bulk work is reached from the row context menu and nowhere else. A plugin grid declares its batch operations in the `commandItems` array it hands to `selectableConfig` — `Batch Edit Details` and `Batch Delete`, visible when more than one entry is selected — and gives every command that writes a single row the matching one-entry gate, so a multi-row selection can never narrow itself to the row that happened to be right-clicked. On a paginated grid, the gates must count the whole-list selection from `selectedAllIdsRef` when present; `getAllSelectedItems()` counts only the current page. Read-only commands (`Open`, and `View Details` for a user who cannot write) keep no such override: a table with no batch command for that user must not end up with an empty menu. The toolbar above the grid holds the create button and nothing but the selection group, which comes from `GridSelectionButtons` (`core/frontend/app/components/GridSelectionButtons.tsx`). Pass `onSelectCurrentPage` only when the route actually pages its list, which is also when the route needs a `.../ids` endpoint beside the list endpoint so `Select All (N)` can name every entry under the current filter; a route that returns its whole inventory in one call passes just `onSelectAll`.

Use the generated frontend client from `core/frontend/client` to call the plugin's backend endpoints from route loaders and actions. The route loader should load the current session and user, pass the access token to backend calls, and return enough user information for the component to derive `canManage = user.roles.includes('data-manager')`.

For source data pages, plugin authors can reuse helpers from `core/frontend/app/plugins/source-data.ts` for common formatting, datetime conversion and error normalization. File-backed source plugins can register file explorer actions through `FILE_HANDLERS`; those actions remain data-manager-only because the file explorer itself is data-manager-only.

Label data pages should generally be read-only views over committed label snapshots. Use helpers from `core/frontend/app/plugins/label-data.tsx` to build commit filters and SlickGrid options. If a plugin needs to expose label mutation UI outside the annotation editor, it should apply the same `data-manager`-only controls as source data management and rely on backend authorization as the final guard.

#### Data Annotation

##### Data Loader

Define a concrete implementation of `DataLoader`, which builds on top of `DataLookup` by adding a layer of indirection between which frame is opened by the user (i.e., the current frame) and which frames need their data to be loaded.

- `UnitDataLoader` is functionally identical to `DataLookup` (one-to-one mapping of frames)
- `WindowDataLoader` also loads the data in nearby frames (one-to-many mapping of frames), combining them into a single object. This enables data from other frames to be displayed in the current frame.

##### Data View

Define a concrete implementation of `DataView` (`SourceDataView` for source data; `LabelDataView` for label data), which exposes the data from `DataLoader` for the current frame.

For label data, you should also define methods to apply the various [operations](#frontend-labelset-operations) to the active data. Each such mutator wraps the operation and applies it through the current frame's `EditableBranch` (e.g. `this.currentBranch?.apply(op)`).

##### Data Layer

Define a concrete implementation of `DataLayer` (`SourceDataLayer` for source data; `LabelDataLayer` for label data), through which the user can interact with the data that is exposed by `DataView`.

- Customize the layer-specific menus via the `actionsView`, `toolsView`, `prefsView`, `objectTreeView`, and `controlsView` (or `controlsSections`) attributes, each providing a React node.
- Place `three.js` objects in the scene via the `objects` attribute.
- Customize the 2D overlay via the `overlayView` attribute. Label inspectors (the former property panels) are rendered as draggable React panels inside this overlay.
- If the layer declared `editor.overlayDoms` in its registration and needs to render React content inside one of those elements (e.g. the segmentation brush cursor inside its cursor div), implement `EditorOverlayViewsContributor`: the `editorOverlayViews` attribute maps each DOM `key` to a React node, and the display shell renders it inside the element, re-rendering on the layer's `overlay-change` event.
- Programmatically navigate the scene and labelset repository via the `context` attribute.
- Set up event handlers for 3D pointer interaction via the `WindowPointer` class; windows can be accessed through the `context.display` attribute.
- Set up keybinds via the `keydownHandler` and `keyupHandler` attributes.

You should refresh the `three.js` objects and the model state backing these views inside the `render()` method. Rendering is demand-driven: whenever an event marks internal render state dirty, call the protected `requestRender()` method to schedule a frame. After adding or removing children of the layer's `objects` group, call the protected `refreshObjects()` method once so that the layer collection reapplies the correct per-window visibility masks without polling every group's children.

Where these contributions live: `createEditorLayer` and `createEditorPreferencesMenu` are plain function exports of the plugin's `app/editor/contribution.ts`, star-exported from the plugin's editor barrel `app/editor/index.ts` so they are present on exactly the module the registration's `editor.loader` returns. A layer that owns editor state also implements `EditorSliceContributor` (`mapEditorSlice(previous)` projects the layer's imperative state into the snapshot slice keyed by the plugin's registration key, reusing `previous` fields that are unchanged, and `subscribeEditorSlice(listener)` subscribes to every event that can affect that slice). Both contributions are discovered structurally, so core never imports a plugin package. See [Editor State Management](./design/editor-state-management.md#the-unified-read-model-editor-state-store) for the snapshot shape and the wiring rules.

The label plugins' editor scaffolds — each plugin's `InteractContext`, its inspector and settings-pane containers, its label index classes, and the vector controls stack — share a shape without sharing a base. That duplication is deliberate: the per-plugin state structure is not settled, so a common abstraction would be designed backwards. A plugin extending this surface copies the nearest existing one rather than unifying them; unification is a decision of its own, not a side effect of unrelated work.

<a id="frontend-labelset-operations"></a>
##### Labelset Operations

For each operation, define a concrete implementation of `BaseOperation` which includes the following:

- An `opName` that corresponds to the `op_name` in Python (described above).
- A type definition of `opParams` which corresponds to the `op_params` in Python (described above). May contain [placeholders](./design/placeholder-values.md).
- An `opResult` that corresponds to the return value of `Operation.apply()` in Python. Expressed as a [placeholder](./design/placeholder-values.md).
- An implementation of `applyLocal()` to update the data in the annotation editor when the operation is applied.
- An implementation of `undoLocal()` to update the data in the annotation editor when the operation is undone.

You can apply an operation by calling `EditableBranch.apply()` with your operation, typically through the label data view's mutator methods. This immediately applies the operation client-side. When the user saves their changes, the operation is also applied server-side, which invokes the corresponding `apply()` method in Python (described above).

Note that once an operation has been applied server-side, it can no longer be undone in the annotation editor.
