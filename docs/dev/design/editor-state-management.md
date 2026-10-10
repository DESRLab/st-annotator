# Editor State Management

The annotation editor is a deliberate hybrid of React and imperative code; new changes must preserve this boundary.

The three.js scene graph, the per-frame render loop, and the editor domain models (labelsets and their history, playback, selection, data indices, lookups and loaders) are imperative classes that remain the single source of truth for their state. Do not mirror their state into React state, and do not write three.js objects from React.

New UI-only state — panels, overlays, tooltips, dialogs — is React state. Anything that mutates per frame or per pointer event stays imperative; React never sits in the render loop.

## The unified read model (editor state store)

React reads editor state through a single three-free snapshot, not by reaching into models. A route-owned store (`core/frontend/app/routes/editor/store/`) lazily maps the imperative runtime into a normalized, read-only `EditorState` snapshot (`store/types.ts`) with four top-level slices:

- `navigation` — "where am I in the dataset": `projectId`, task, sourceGroup, labelBranch (each `{items, currentId}`), frames (`byId`/`ids`/`activeId`), `isNavigating`, bounds.
- `labelset` — version-control state of the selected branch: `history`, `hasUnsavedChanges`, `isSaving`, `branchId`, `unsavedBranchIds`. Shared by all label plugins; it is NOT a plugin slice.
- `layers` — structural/domain state: `metadata` (keyed `{key,name,kind}`), `order`, `views` (opaque per-layer React nodes + controls source), plus one plugin slice per contributing layer keyed by its collection key (`layers.bbox`, `layers.vector`, …).
- `ui` — cross-cutting/shell state plus per-layer interaction records: `layers.<key> = {active, enabled}`, `activeLayerKey`, `hint`.

Components read with `useEditorSelector(selector, isEqual?)` and write with `useEditorIntents()` (`store/`). Intents run through the imperative controllers, which mutate and notify; the store then re-maps. Components never mutate the snapshot or the scene, and never hold model handles. Selector results are memoized by `isEqual` (default `Object.is`), so return a structurally-shared slice reference — selecting a whole object that is rebuilt on every invalidation causes spurious re-renders.

The write side is composed per plugin: `EditorIntents<TPluginIntents>` merges the base intents with plugin intent groups keyed by layer key (e.g. `intents.bbox.setAction(...)`), built by the composition root. Plugin pane containers read their slice through a per-plugin selector hook (`useBBoxSelector` and siblings, built with `createPluginSliceSelectorHook` — TypeScript cannot partially infer `useEditorSelector`'s type arguments), and settings panes layer a local optimistic draft over the committed selector state (`useOptimisticPaneParams`); pane drafts never enter the snapshot.

The mapper rebuilds each slice only when its invalidation fingerprint changes (structural sharing): per-source counters in `EditorMapperCounters` (maintained by the wiring in `useEditorStoreRuntime.ts`) plus reference fingerprints of the navigator indexes. Keep this O(1)-when-idle; never diff the tree per frame.

Plugin slices are contributed, not registered: a layer that implements `EditorSliceContributor<TSlice>` (`mapEditorSlice(previous)` + `subscribeEditorSlice(listener)`, `store/contributors.ts`) is discovered structurally at runtime — no static plugin import at the wiring. Follow the template in `plugins/bbox/.../layer/BBoxSlice.ts` + `BBoxLayer.mapEditorSlice/subscribeEditorSlice`: a plain `*Slice.ts` pure mapper (reuse `previous` when every field is `===`-equal) plus a layer method that delegates to it, and a unit test of the pure mapper (constructing the real layer needs a live scene context, so test the mapper, not the layer). Type-level regression for the merged slices and intents lives in `tests/frontend/type-contracts/` (`plugin-slices.ts`, `plugin-intents.ts`), compiled by the frontend-tests typecheck (`tests/frontend/tsconfig.type-contracts.json`) because it spans every plugin package.

The label plugins' slices also carry ENTITY LISTS: plain DTO projections of the current labels index (`bbox.boxes/tracks/classes`, `vector.vectors/classes`, `segmentation.instances/selections/classes`), plus the inspector pane state (`draw*Active`, the exact per-pane disabled values, selection ids). Three rules keep them cheap and correct:

- **Per-record structural sharing.** Every record is reprojected and compared field by field on each invalidation; unchanged records and whole lists reuse the previous references so downstream selectors/memos/Tweakpane identities stay stable. Mapping is O(N) per index mutation and O(1) only while idle — the sharing buys identity stability, not mapping cost.
- **Entity text is relationally derived** (linked class/track names): recompute it on every mapping and include it in the record comparison; never cache it.
- **Keep the domain relation names** in DTOs (`entityId` = parent track/instance, `perceivedClassId`, `gtClassId`) so write paths wired against the DTOs target the right relation.

**Wiring pitfalls (cost e2e failures and review rounds to learn):**

- Structural sharing keyed on object identity/reference misses IN-PLACE mutation. Frame status (`is_complete`) flips on a stable `frames.elements` reference, so the navigation fingerprint also includes a `navigation` counter bumped on `edit-frame`. Any new in-place mutation needs its own counter/event in the fingerprint.
- Subscribe to EVERY event that can change the mapped state. The store wiring subscribes to branch `beforechange` AND `afterchange` (`beforechange` flips `isSaving` at save start); subscribing to only `afterchange` leaves the Save button stale.
- Labels indexes are REPLACED on every data load, and `DataView` dispatches `beforeload` BEFORE nulling `data`. Aggregate index events through `subscribeDataIndexLifecycle` (`data`): persistent view-level `beforeload`/`afterload` subscriptions; on `beforeload` detach every listener from the OLD index and publish loading (the slice's `labels` input goes `null`, so entity lists map empty mid-load); on `afterload` attach to the NEW index. Subscribe the index's FULL `ALL_EVENT_TYPES` constant (covers `add/delete/update/resolveId/bulk`) — a hand-enumerated list will go stale.
- An `InteractContext` must NOT start its state machine in its constructor: the layer attaches its `change`/`action-change` listeners after construction, so the initial transition is triggered by the layer's `disabled = true` assignment made AFTER those listeners — otherwise the initial controls/keybind update is lost on a listener that does not exist yet.
- Inspector pane events (draw toggles, create buttons) are intents that forward `onPaneEvent` VERBATIM — never the coordinators' guarded `click*` methods — so the coordinators keep their exact internal ordering (including the draw-toggle input-mirror rebuild that the draw flow reads for new-entity defaults).
- The store/intents providers must wrap the WHOLE editor tree, not just the app view. The layer overlays embed selector/intent-based inspector containers, but their host (the display shell / `LayerCollectionOverlaysView`) mounts BEFORE the runtime exists, so the providers cannot be gated on runtime presence. Wrap the whole tree in the nullable `OptionalEditorStoreProvider`/`OptionalEditorIntentsProvider` — adding providers only later remounts the scene canvases and re-triggers the runtime lifecycle.
- Slice entity-selection ids (`selectedBoxId`, `selectedVectorId`, `selectedSelectionId`) must be mapped from the INSPECTOR COORDINATOR's `selectedId` (e.g. `context.selectedSelectionId`), NOT from the pointer selector's `selectedObj`. The abort/Escape flow clears `selectedObj` but deliberately keeps the inspector's selection, so the inspector panes keep showing the inspected entity after leaving the edit state. (Track ids are the exception: `selectedTrackId` reads the live state-machine params by design.)
- Stale selection clearing is OWNED BY THE COORDINATORS, not by React containers: every inspector coordinator clears its own `selectedId` on `beforeload`/`afterload` when the label no longer exists. Do not add container effects that clear a selection because the id is missing from the slice entity lists — the lists map EMPTY during the load window (`labels` is null between `beforeload` and `afterload`), so such an effect would wipe selections that survive the reload.

Test fixtures: `store/testing.ts` provides `createEditorStateFixture`, `createMockEditorStore`, and `noopEditorIntents` for rendering components against a plain snapshot in jsdom.

Plugin loading seam: an application imports plugin packages only in its explicit
`sta.config.ts`, through each plugin package's `./app` export subpath
(`sta-bbox/app`, …). Core's default configuration selects no plugins;
`distributions/full/frontend/sta.config.ts` selects the repository's complete
product. Its adjacent `sta.routes.ts` imports each plugin's lightweight
`app/routes.ts` manifest directly from workspace source; route discovery must
not import runtime plugin barrels or depend on package `dist/` artifacts.
Installing or workspace-linking a plugin never activates it. A plugin
may declare another plugin in `dependencies` only when it is an indispensable
runtime prerequisite; otherwise the host must select both. The `./app` subpath
resolves to the built plugin barrel, whose default export is the registration
and whose star export contains its editor modules. The registration's
`editor.loader` dynamically imports the adjacent editor barrel. The composition
root (`runtime.ts`) remains plugin-agnostic: it loads registered modules and
discovers their contributions structurally. Cross-plugin imports use the same
`./app` subpath (`sta-gmesh/app`, `sta-pcd/app`). Editor widget tests that
exercise a specific plugin live under that plugin's `frontend/test/` tree.
All editor and plugin modules must stay Node-import-safe (no DOM at import
time), because the SSR bundle includes them without stubs.

On the plugin side these contributions live by convention in `app/editor/contribution.ts`, star-exported from the plugin's editor barrel (`app/editor/index.ts`) so they are present on the exact module the registration's `editor.loader` returns. Unlike the declarative registration fields (`routes`, `editor.overlayDoms`, `client.source.loader`, `client.source.bounds`), the layer and preferences-menu contributions are function exports on the editor module itself, because they need the live runtime environment rather than static data. `createEditorLayer(env)` receives the scene `context`, the layers already created (registration order — a layer may depend only on layers registered earlier, discovered by class via `findEditorLayer`), and the overlay DOM the registration declared, and returns the concrete layer whose exact type `EditorLayers` picks up per registry key. See `plugins/vector/frontend/app/editor/contribution.ts` for a minimal example (depends on pcd + gmesh, receives its canvas from `env.overlayDoms`); pcd's plugin also contributes the main-camera preferences menu.

## Narrow bridges for imperative sources

`useSourceEventVersion` (duck-typed `useSyncExternalStore` bridge over event sources) is the sanctioned read path for the sources deliberately kept out of the snapshot: `FramePlayback` traversal state, the transformer gizmo panes, and the segmentation assisted-selection control (render-loop / live-interaction state, on `usePaneState`). The plugin interaction/settings/inspector panes are store-backed (selectors + intents); their drafts stay local React state (`useOptimisticPaneParams`: optimistic input merged before the write path round-trips). The scene-view chrome (windows/display, clipboard, layer overlays) likewise reads through `useSourceEventVersion`, and prefers **narrow structural sources** over the owning classes (see the imperative-host note below); the remaining exceptions are listed here. When moving one of these sources into the store, add the state to the snapshot + wiring first, then switch the component to `useEditorSelector`/intents, and delete the bridge only once nothing uses it.

**Bridged sources (the enumerated exceptions).** Decision rule: state belongs in the store when MULTIPLE React consumers must read it consistently; state that is single-consumer, per-frame, or DOM-geometry-coupled stays with its imperative owner behind a narrow bridge. The enumerated exceptions, grouped by rationale:

- _Render-loop / live-interaction state_ (imperative controllers operating per-frame or per-pointer-event during continuous manipulation; React must not sit in that loop): the transformer gizmo panes (gmesh `Transformer.react.tsx` shared by bbox, `VectorTransformer.react.tsx`) and the segmentation assisted-selection control — both on `usePaneState` over their controller — plus `FramePlayback` traversal (advances per animation frame).
- _DOM-geometry / camera-coupled chrome_ (values change continuously with layout/camera and are consumed only by their own window; see exception #1): `MainWindow`/`MinimapWindow`/`DefaultSceneDisplay` rect/markers/crosshair.
- _Single-consumer imperative reads_ (the cross-component facets are already in the slices where needed): the clipboard tool view (`canCopy`/`canPaste` live in the label slices) and the layer-overlay refresh plumbing (payload is already three-free plain data). (The labels trees are store-backed like the panes: they group the slice entity lists and write selection through the `select*` intents.)
- _Core menu surfaces over live handler state_ (the `Controls` menu re-renders when a handler's own state changes rather than through the snapshot): the keybind handler collection (`change`) and the active layer's controls source (`controls-change`).
- _Core chrome that still holds an owning model_ (a deliberate gap, not a template): the frame-path menu subscribes to the scene context's navigation events (`isNavigating-changed`, `edit-frame`, `nav-frame`, `nav-source-group`) and takes `FramePlayback` as a prop, duplicating what the `navigation` slice already carries. Its `ProjectMenu` sibling does the same. New code must not extend this pattern — bridge a narrow source or go through the store.

This enumeration is the complete list of bridged sources; a new exception must fit one of the rationales above.

## three.js / React separation

React components must never contain three.js objects: no `THREE.*` value may be received as a prop, read from a model getter during render, or constructed in a component. Three.js objects are modified indirectly by the imperative layer when state changes (the template is labelset ops → index → model setters → view Object3D updates). The hard, lint-enforced guarantee is **three-free imports**: no `*.react.tsx` / `*.react.ts` module may import `three` directly. Passing plain state through an intermediate module that itself uses three.js is the intended shape of the boundary, and `import type` across it is erased at build time, so neither is a violation; what must not happen is a React module touching three.js values. On top of that, React's inputs are three-free data **plus an enumerated set of narrow imperative / model-view interfaces**, not "everything plain." The enumerated exceptions:

1. **Narrow imperative hosts** — the window views expose, alongside three-free snapshots and event subscriptions, the minimal imperative operations that reconcile render/UI state with DOM geometry: `MainWindowSource` has `updateCameraAspects()` (three.js camera frustum from DOM layout, called from a `ResizeObserver` effect); `MinimapWindowSource` has `setRect()` (minimap UI geometry from drag/resize), `updateCameraAspects()` and `getPointerTooltipContent()` (a derived read); `DefaultSceneDisplaySource` exposes no imperative member at all, only the window snapshots its chrome renders from. These write no _domain_ state, so React still never mutates the scene graph or any model.

Plugin React views must not take their owning layer/`InteractContext` as a prop; they receive narrow `*Source` interfaces (e.g. `BBoxOverlaySource`, `SegmentationLayerOverlaySource`) that the owning class satisfies structurally, or no props at all when they are pure selector/intent containers. No `Readonly*` label model crosses into React: the inspector panes are pure selector/intent containers projecting their params from the slice's entity DTOs (scalar quality levels readapted to the panes' `QualityLevel` contract), and the inspector _coordinators_ (selection sync, diff-based async writes, draw defaults) are imperative classes owned by each plugin's `InteractContext`, reached from React only through editor intents; the narrow structural label-view sources (`BBoxInspectorLabelsView`, `VectorInspectorLabelsView`, `SegmentationInspectorLabelsView`) are the coordinators' write-path surface — an imperative-to-imperative boundary. Other imperative interaction helpers that React needs to reach (the inspector coordinators, the main camera settings menu) are likewise owned by the imperative side (`InteractContext` / the editor runtime) and exposed through editor intents — React never constructs or holds them.

The `EditorState` snapshot itself is likewise **three-free, not literally plain**: it carries no three.js objects but does carry opaque UI slots (model-produced `ReactNode`s rendered but never inspected), `Map`/`Set` containers, per-layer `controls` event-source references, and the pcd/gmesh color blender target (`PointBuffer` data plus channel names — a data container, not a scene object) under `settings.target`.

File convention enforcing the boundary: a `*.react.tsx` file contains React components/hooks and imports no `three` module; imperative classes that own three.js objects live in plain-named `.tsx` files. This is lint-enforced (`no-restricted-imports` on `three` for `**/*.react.tsx` and `**/*.react.ts` in every frontend package). A plain `.ts` slice module (e.g. `BBoxSlice.ts`) may `import type` from a `.react.tsx` for shared plain types — type-only imports are erased and introduce no three runtime dependency.

The event substrate follows the same boundary: modules outside the scene layer emit through the three-free `VanillaEventDispatcher` (`utils`) — navigation, labelset, data views, keybinds, playback, layer state, the pane engine, and the clipboard all do. `THREE.EventDispatcher` stays only in modules that use three geometry/scene types regardless (the scene layer, the label models/indexes, `EditableFrame`'s spatial queries). The two dispatchers are behavior-identical and structurally interchangeable (both satisfy `TypedEventTarget`/`SourceEventTarget`), so new non-scene code must not import `three` just for the emitter base.

## State synchronization

The imperative domain models are the editor's only authoritative state; the three.js scene graph and the React-facing plain state snapshot are both _derived views_ of them, so they cannot diverge from each other. Three invariants preserve this:

1. **Single write path.** Every mutation — React pane input, pointer/gizmo manipulation, labelset operations (incl. undo/redo), data loads — is applied through the models' mutation pipeline (ops → index → model setters). No code path may write an Object3D without updating the model, and none may update the React-facing snapshot except in response to a model notification. Do not introduce direct Object3D mutations that bypass this path.
2. **Notify after mutate.** Models dispatch change events only after the mutation is complete, so observers (React bridges, snapshot mappers) always read a complete state whose Object3D side has already been updated.
3. **UI emits intents, never state writes.** React components call imperative controller/view APIs to effect change; they never write the scene or the snapshot directly.

The only sanctioned transient divergence is continuous manipulation (e.g. a gizmo drag): the Object3D follows the pointer immediately and the model/UI catch up when the interaction commits through the write path. Anything that must track a live manipulation reads the Object3D imperatively per frame, outside React. An abandoned transform (invalid result or abort) is converged back through a named model rollback API (e.g. `LabelVector.rollbackCoords`) — a rollback re-syncs the Object3D to the already-committed model state, creates no op and dispatches no change, and must never be a raw geometry assignment.
