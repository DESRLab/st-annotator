import * as editor from "./index";
import * as models from "./models";

import { readFrameFramesIdGet } from "../../../client";
import type {
  FramePublicWithParents,
  ProjectConfig as ProjectConfigPublic,
} from "../../../client";
import { getPlugins, type Plugins } from "../../config";

import {
  isEditorLayerContributor,
  isEditorPreferencesMenuContributor,
} from "./moduleContributors";
import type { EditorPreferencesMenu } from "./moduleContributors";

export type EditorMode = "annotate" | "review";

export interface EditorLoadOptions {
  mode: EditorMode;
  projectId: number;
  taskId?: number;
  frameId?: number;
}

export interface EditorRuntimeMountHooks {
  /** Called when a data layer begins loading the initially selected frame. */
  onFrameDataLoadStart?: () => void;
}

export interface CreateEditorRuntimeOptions {
  projectId: number;
  initialProjectConfig?: ProjectConfigPublic;
  elements: EditorRuntimeElements;
}

interface E2EProbeLifecycle {
  attach(): void;
  detach(): void;
}

/** One React-created overlay element: a canvas or div declared by a plugin. */
export type EditorOverlayDom = HTMLCanvasElement | HTMLDivElement;

/**
 * Overlay DOM created by the editor display shell, keyed by plugin key and
 * then by the DOM key each plugin declares in its registration's
 * `editor.overlayDoms`.
 */
export type EditorOverlayDoms = Record<
  string,
  Record<string, EditorOverlayDom>
>;

/** DOM elements created by React before the imperative editor runtime starts. */
export interface EditorRuntimeElements {
  canvas: HTMLCanvasElement;
  displayDom: HTMLDivElement;
  overlayDoms: EditorOverlayDoms;
  mainWindowDom: HTMLDivElement;
  minimapWindowDom: HTMLDivElement;
}

/** The plugin editor integration modules, keyed by the active STA configuration. */
export type EditorPluginRegistry = {
  [K in keyof Plugins]: Awaited<ReturnType<Plugins[K]["editor"]["loader"]>>;
};

/** The layer type contributed by a plugin editor module. */
export type ContributedLayer<M> = M extends {
  createEditorLayer(env: never): infer L;
}
  ? L
  : never;

/**
 * The editor layers keyed by plugin key, each with the exact layer type
 * contributed by that plugin's editor module. Derived from the plugin
 * registrations, so the composition root itself stays plugin-agnostic.
 */
export type EditorLayers = {
  [
    K in keyof EditorPluginRegistry as EditorPluginRegistry[K] extends {
      createEditorLayer: unknown;
    }
      ? K
      : never
  ]: ContributedLayer<EditorPluginRegistry[K]>;
};

/** The window mapper wired by `createEditorRuntime` via `DefaultSceneDisplay`. */
export type EditorWindowMapper = editor.DefaultWindowMapper;

export type EditorApp = editor.App<EditorWindowMapper>;
export type EditorSceneContext = editor.SceneContext<EditorWindowMapper>;
export type EditorLayerCollection = editor.LayerCollection<EditorWindowMapper>;

export async function loadEditorRuntimeModules(): Promise<EditorPluginRegistry> {
  const registry = getPlugins();
  const entries = Object.entries(registry);
  const modules = await Promise.all(
    entries.map(([, plugin]) => plugin.editor.loader()),
  );

  // Promise.all preserves input order, so construction can still honor plugin
  // registration dependencies while the independent bundles download together.
  return Object.fromEntries(
    entries.map(([key], index) => [key, modules[index]]),
  );
}

/**
 * Creates the scene display, the plugin-contributed layers, and the
 * preferences menu for a runtime.
 *
 * Layers are contributed in registration order; a layer factory may depend
 * only on layers whose plugins are registered earlier (it discovers them
 * through the environment's `layers`).
 */
async function createEditorSceneWiring(
  registry: EditorPluginRegistry,
  context: EditorSceneContext,
  elements: EditorRuntimeElements,
) {
  const display = new editor.DefaultSceneDisplay(context, elements);
  await context.bindDisplay(display);

  const layersByKey: Record<string, editor.SceneLayer<EditorWindowMapper>> = {};
  for (const [key, pluginEditor] of Object.entries(registry)) {
    if (!isEditorLayerContributor(pluginEditor)) continue;
    layersByKey[key] = pluginEditor.createEditorLayer({
      context,
      layers: layersByKey,
      overlayDoms: elements.overlayDoms[key] ?? {},
    });
  }

  const layers = new editor.LayerCollection(layersByKey, null);

  // The preferences menu is contributed after the layer collection exists;
  // the first contributor wins (the app has a single preferences menu).
  let prefsMenu: EditorPreferencesMenu | null = null;
  for (const pluginEditor of Object.values(registry)) {
    if (!isEditorPreferencesMenuContributor(pluginEditor)) continue;
    prefsMenu = pluginEditor.createEditorPreferencesMenu({
      context,
      layers,
      layersByKey,
    });
    break;
  }

  return { display, layersByKey, layers, prefsMenu };
}

export class EditorRuntime {
  readonly app: EditorApp;
  readonly context: EditorSceneContext;
  readonly layers: EditorLayerCollection;
  readonly layersByKey: EditorLayers;

  /**
   * The read-only e2e projection probe, or `null` when the runtime was
   * not created with the `VITE_STA_E2E_PROBE` env gate set.
   */
  readonly #e2eProbe: E2EProbeLifecycle | null;

  #isDisposed = false;

  constructor(params: {
    app: EditorApp;
    context: EditorSceneContext;
    layers: EditorLayerCollection;
    layersByKey: EditorLayers;
    e2eProbe?: E2EProbeLifecycle | null;
  }) {
    this.app = params.app;
    this.context = params.context;
    this.layers = params.layers;
    this.layersByKey = params.layersByKey;
    this.#e2eProbe = params.e2eProbe ?? null;
  }

  /**
   * Binds the layers, loads the initial scene, and starts the render loop.
   *
   * @returns A message explaining that the frame requested by the initial URL
   * could not be opened, or `null` when there was nothing to report. The caller
   * presents it: the runtime owns no notification UI.
   */
  async mount(
    loadOptions: EditorLoadOptions,
    hooks: EditorRuntimeMountHooks = {},
  ): Promise<string | null> {
    this.#assertNotDisposed();

    await this.context.bindLayers(this.layers);

    this.#assertNotDisposed();
    // Bind layers before choosing the initial frame.  That way initial frame
    // selection follows the same data-loading and rendering path as later
    // frame navigation, rather than loading labels while no layer is bound.
    const dataViews = this.layers.dataLayers.map((layer) => layer.dataView);
    let frameLoadStarted = false;
    const onBeforeLoad = (): void => {
      if (frameLoadStarted) return;
      frameLoadStarted = true;
      hooks.onFrameDataLoadStart?.();
    };
    for (const dataView of dataViews)
      dataView.addEventListener("beforeload", onBeforeLoad);
    let frameLoadNotice: string | null = null;
    try {
      frameLoadNotice = await loadInitialEditorData(loadOptions, this.app);
    } finally {
      for (const dataView of dataViews)
        dataView.removeEventListener("beforeload", onBeforeLoad);
    }

    this.#assertNotDisposed();
    // Expose the read-only e2e probe only once the runtime is ready. It is
    // `null` (and this is a no-op) unless the env gate is set.
    this.#e2eProbe?.attach();

    return frameLoadNotice;
  }

  dispose() {
    if (this.#isDisposed) return;

    this.#isDisposed = true;
    this.#e2eProbe?.detach();
    this.app.dispose();
  }

  #assertNotDisposed() {
    if (this.#isDisposed) {
      throw new Error("Editor runtime has been disposed");
    }
  }
}

export async function createEditorRuntime({
  projectId,
  initialProjectConfig,
  elements,
}: CreateEditorRuntimeOptions): Promise<EditorRuntime> {
  const registry = await loadEditorRuntimeModules();

  const views = new editor.EditorViews({
    projectId,
  });

  if (initialProjectConfig != null) {
    const projectConfig = models.ProjectConfig.fromJSON(initialProjectConfig);
    const getConfigData = views.getConfigData.bind(views);
    let isInitialConfigAvailable = true;

    views.getConfigData = async () => {
      if (isInitialConfigAvailable) {
        isInitialConfigAvailable = false;
        return projectConfig;
      }

      return getConfigData();
    };
  }

  const context = await editor.SceneContext.create<EditorWindowMapper>(views);

  try {
    const { layersByKey, layers, prefsMenu } = await createEditorSceneWiring(
      registry,
      context,
      elements,
    );

    const menus = {
      project: new editor.ProjectMenu(context),
      tools: new editor.MenuKeybinds(),
      prefs: prefsMenu ?? {
        keydownHandler: new editor.ComposableKeybindHandler(),
        keyupHandler: new editor.ComposableKeybindHandler(),
        renderView: () => null,
        dispose(): void {
          this.keydownHandler.dispose();
          this.keyupHandler.dispose();
        },
      },
    };

    let app: EditorApp;
    try {
      app = new editor.App(context, layers, menus);
    } catch (error) {
      for (const menu of Object.values(menus)) menu.dispose();
      layers.dispose();
      throw error;
    }
    // `null` (and entirely inert) unless the `VITE_STA_E2E_PROBE` env
    // gate is set; see `e2eProbe.ts`.
    let e2eProbe: E2EProbeLifecycle | null = null;
    if (import.meta.env.VITE_STA_E2E_PROBE === "1") {
      const probeModule = await import("./e2eProbe");
      const probe = probeModule.createE2EProbe(context, layersByKey, app);
      if (probe != null) {
        e2eProbe = {
          attach: () => probeModule.attachE2EProbe(probe),
          detach: () => probeModule.detachE2EProbe(probe),
        };
      }
    }

    return new EditorRuntime({
      app,
      context,
      layers,
      layersByKey,
      e2eProbe,
    });
  } catch (error) {
    context.dispose();
    throw error;
  }
}

/** Outcome of reading the frame the initial URL requested. */
type InitialFrameRead =
  | { status: "none" }
  | { status: "failed"; frameId: number }
  | { status: "loaded"; frame: FramePublicWithParents };

/**
 * Reads the frame requested by the URL without changing the loaded scene frame list.
 *
 * A failed read is kept distinct from an absent request: after a failure the
 * editor shows a frame nobody asked for, which has to be reported, whereas an
 * absent request is the ordinary case with nothing to explain.
 */
async function readInitialFrame(
  frameId: number | undefined,
): Promise<InitialFrameRead> {
  if (frameId == null) return { status: "none" };

  try {
    const result = await readFrameFramesIdGet({
      path: { id: frameId },
    });

    const frame = result.error != null ? null : result.data;
    return frame == null
      ? { status: "failed", frameId }
      : { status: "loaded", frame };
  } catch {
    return { status: "failed", frameId };
  }
}

/**
 * Reports a frame the URL requested that the load did not open, so that a
 * substituted frame is never silent.
 *
 * Returns `null` when no frame was requested, when the request was honored, or
 * when no task was loaded at all, since the application's own hint already
 * explains an editor without a task.
 */
function describeUnopenedFrame(
  requestedId: number | null | undefined,
  openedId: number | null | undefined,
  hasTask: boolean,
  reason: string | null,
): string | null {
  if (requestedId == null || !hasTask || openedId === requestedId) return null;

  const outcome =
    openedId == null
      ? "No frame is open."
      : `Showing frame ${openedId} instead.`;
  return `${reason ?? `Frame ${requestedId} could not be opened`}. ${outcome}`;
}

/**
 * Loads the initial task and frame for an editor application.
 *
 * This intentionally does not render the application. Route-owned React
 * callers own the application root.
 *
 * @returns A message explaining that the frame requested by the URL could not
 * be opened, or `null` when there was nothing to report. Load failures stay
 * non-blocking so the editor remains usable.
 */
export async function loadInitialEditorData<WM extends editor.WindowMapper>(
  loadOptions: EditorLoadOptions,
  app: editor.App<WM>,
): Promise<string | null> {
  const { context, menus } = app;
  const { taskId: loadTaskId, frameId: loadFrameId } = loadOptions;
  const initialFramePromise = readInitialFrame(loadFrameId);

  try {
    const initialTask =
      context.tasks.elements.find((task) => task.id === loadTaskId) ??
      context.tasks.elements.at(0) ??
      null;

    // Displaying the task loads its source groups, label branches, and scene
    // frames but selects none of them: the frame to open on is decided below,
    // once the frame read identifies the group and branch it belongs to (or the
    // playback sort picks the first frame when none was requested). Selecting
    // the frame only there displays exactly one frame per load.
    await context.displayTaskSelectors(initialTask);
  } catch (error) {
    // Should still load the application
    console.warn("Unable to set initial task:");
    console.warn(error);
  }

  /** Why the requested frame could not be opened, when it could not be. */
  let unopenedReason: string | null = null;

  try {
    const initialFrame = await initialFramePromise;
    if (context.currentTaskId != null) {
      const displayFirstFrame = async () => {
        const firstSourceGroup = context.sourceGroups.elements.at(0) ?? null;
        const firstLabelBranch = context.labelBranches.elements.at(0) ?? null;
        const sortFunc = menus.project.playback.sortFunc;
        const firstFrame = sortFunc.sortedFrames(context.frames).at(0) ?? null;
        await context.displaySceneSelection(
          firstSourceGroup,
          firstLabelBranch,
          firstFrame?.id ?? null,
        );
      };

      if (initialFrame.status === "failed") {
        unopenedReason = `Frame ${initialFrame.frameId} could not be loaded`;
        await displayFirstFrame();
      } else if (initialFrame.status === "loaded") {
        if (initialFrame.frame.task_id !== context.currentTaskId) {
          unopenedReason = `Frame ${initialFrame.frame.id} belongs to another task`;
          await displayFirstFrame();
        } else {
          // As on `main`, the lookups are passed through as-is even when
          // the group/branch is missing from the loaded lists; displaying
          // `null` clears the scene rather than falling back to another
          // frame.
          const loadSourceGroup =
            context.sourceGroups.elements.find(
              (group) => group.id === initialFrame.frame.source_group_id,
            ) ?? null;
          const loadLabelBranch =
            context.labelBranches.elements.find(
              (branch) => branch.id === initialFrame.frame.label_branch_id,
            ) ?? null;
          await context.displaySceneSelection(
            loadSourceGroup,
            loadLabelBranch,
            initialFrame.frame.id,
          );
        }
      } else {
        await displayFirstFrame();
      }
    }
  } catch (error) {
    // Should still load the application
    console.warn("Unable to load initial frame:");
    console.warn(error);
  }

  return describeUnopenedFrame(
    loadFrameId,
    context.currentFrameId ?? null,
    context.currentTaskId != null,
    unopenedReason,
  );
}
