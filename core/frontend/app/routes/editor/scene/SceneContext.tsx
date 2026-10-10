import { Queue } from "async-await-queue";
import * as THREE from "three";

import type { TaskState, SourceGroupState } from "../models";
import type { CoordBounds } from "sta/common";

import { EditorConfig } from "../config";
import type { EditableBranch } from "../labelset";
import { FrameNavigator } from "../nav";
import type {
  SourceGroupIndex,
  LabelsetBranchIndex,
  EditableFrame,
  FrameIndex,
  FrameNavigatorEventMap,
  FrameSelectors,
  TaskIndex,
} from "../nav";
import type { EditorViews } from "../views";

import type { SceneDisplay, WindowMapper } from "./display";
import type { LayerCollection, SceneLayer } from "./layer";
import type { LayerCollectionEventMap } from "./layer/LayerCollection.tsx";

/**
 * Represents the event when a source group is opened.
 */
export interface NavSourceGroupEvent {
  prevGroup: SourceGroupState | null;
  group: SourceGroupState | null;
}

/**
 * Represents the event when a label branch is opened.
 */
export interface NavLabelBranchEvent {
  prevBranch: EditableBranch | null;
  branch: EditableBranch | null;
}

/**
 * Represents the event when a frame is displayed.
 */
export interface NavFrameEvent {
  prevFrame: EditableFrame | null;
  frame: EditableFrame | null;
}

/**
 * Defines each event that can be dispatched by {@link SceneContext}.
 */
export interface SceneContextEventMap<WM extends WindowMapper> {
  "layer-activate": LayerCollectionEventMap<WM>["layer-activate"];
  "isNavigating-changed": {};
  "nav-source-group": NavSourceGroupEvent;
  "nav-label-branch": NavLabelBranchEvent;
  "nav-frame": NavFrameEvent;
  "edit-branch": FrameNavigatorEventMap["edit-branch"];
  "edit-frame": FrameNavigatorEventMap["edit-frame"];
}

/**
 * Interface through which components can control the active scene.
 */
export class SceneContext<
  WM extends WindowMapper = WindowMapper,
> extends THREE.EventDispatcher<SceneContextEventMap<WM>> {
  /** The configuration of the application. */
  readonly config: EditorConfig;

  /** The interface of the application with the backend. */
  readonly views: EditorViews;

  /** Navigates between the frames to display in the scene. */
  #nav: FrameNavigator;

  /** The tasks available to the project. */
  get tasks(): TaskIndex {
    return this.#nav.tasks;
  }

  /** The currently selected task, or `null` if none. */
  get currentTask(): TaskState | null {
    return this.#nav.task;
  }

  /** The unique identifier of the selected task, or `null` if none. */
  get currentTaskId(): number | null {
    return this.#nav.taskId;
  }

  /** The source groups available to the task. */
  get sourceGroups(): SourceGroupIndex {
    return this.#nav.sourceGroups;
  }

  /** The currently selected source group, or `null` if none. */
  get currentSourceGroup(): SourceGroupState | null {
    return this.#nav.sourceGroup;
  }

  /** The label branches available to the task. */
  get labelBranches(): LabelsetBranchIndex {
    return this.#nav.labelBranches;
  }

  /** The currently selected label branch, or `null` if none. */
  get currentLabelBranch(): EditableBranch | null {
    return this.#nav.labelBranch;
  }

  /** `true` if any branch has unsaved changes; otherwise, `false`. */
  get hasUnsavedChanges(): boolean {
    return this.#nav.hasUnsavedChanges;
  }

  /** The frames available to the task. */
  get frames(): FrameIndex {
    return this.#nav.frames;
  }

  /** The currently selected frame, or `null` if none. */
  get currentFrame(): EditableFrame | null {
    return this.#nav.frame;
  }

  /** The unique identifier of the selected frame, or `null` if none. */
  get currentFrameId(): number | null {
    return this.#nav.frameId;
  }

  /** The source data selector of the selected frame, or `null` if none. */
  get currentSourceGroupId(): number | null {
    return this.#nav.sourceGroupId;
  }

  /** The source data selector of the selected frame, or `null` if none. */
  get currentLabelBranchId(): number | null {
    return this.#nav.labelBranchId;
  }

  /** The `x` boundaries of the selected frame, or `null` if none. */
  get currentXBounds(): CoordBounds | null {
    return this.#getCurrentBounds("xb");
  }

  /** The `y` boundaries of the selected frame, or `null` if none. */
  get currentYBounds(): CoordBounds | null {
    return this.#getCurrentBounds("yb");
  }

  /** The `z` boundaries of the selected frame, or `null` if none. */
  get currentZBounds(): CoordBounds | null {
    return this.#getCurrentBounds("zb");
  }

  /** The `t` boundaries of the selected frame, or `null` if none. */
  get currentTBounds(): CoordBounds | null {
    return this.#getCurrentBounds("tb");
  }

  /**
   * Gets the boundaries of the selected frame along the given axis
   * of the frame index, or `null` if no frame is selected.
   */
  #getCurrentBounds(axName: "xb" | "yb" | "zb" | "tb"): CoordBounds | null {
    const frame = this.#nav.frame;
    if (frame == null) return null;

    return this.#nav.frames.axes[axName].getValue(frame);
  }

  /** Defines how the scene is displayed. */
  #display: SceneDisplay<WM> | null;

  /**
   * Defines how the scene is displayed.
   *
   * This is initially `null` because the display itself require this context,
   * resulting in a circular dependency. As a result, displays should not refer to
   * this attribute at construction time.
   */
  get display(): SceneDisplay<WM> {
    if (this.#display == null) {
      throw new Error("This context has not been bound to a SceneDisplay");
    }

    return this.#display;
  }

  #layers: LayerCollection<WM> | null;
  #isDisposed = false;

  /**
   * The collection of layers available in the scene.
   *
   * This is initially `null` because the layers themselves require this context,
   * resulting in a circular dependency. As a result, layers should not refer to
   * this attribute at construction time.
   */
  get layers(): LayerCollection<WM> {
    if (this.#layers == null) {
      throw new Error("This context has not been bound to a LayerCollection");
    }

    return this.#layers;
  }

  /** The layer that is currently active, or `null` if none. */
  get activeLayer(): SceneLayer<WM> | null {
    return this.#layers?.activeLayer ?? null;
  }

  /** Handles the event when a branch has been edited. */
  #onEditBranch = (event: FrameNavigatorEventMap["edit-branch"]) => {
    this.dispatchEvent({ type: "edit-branch", branch: event.branch });
  };

  /** Handles the event when a frame has been edited. */
  #onEditFrame = (event: FrameNavigatorEventMap["edit-frame"]) => {
    this.dispatchEvent({ type: "edit-frame", frame: event.frame });
  };

  /** Handles the event when a layer has been activated. */
  #onLayerActivate = (event: LayerCollectionEventMap<WM>["layer-activate"]) => {
    this.dispatchEvent({
      type: "layer-activate",
      activeLayer: event.activeLayer,
    });
  };

  /**
   * Creates a new scene context with its contents already loaded.
   */
  static async create<WM extends WindowMapper = WindowMapper>(
    views: EditorViews,
  ): Promise<SceneContext<WM>> {
    const config = new EditorConfig(await views.getConfigData());
    const nav = await FrameNavigator.create(views);
    return new SceneContext<WM>(config, views, nav);
  }

  /**
   * Creates a new scene context to coordinate its components.
   */
  constructor(config: EditorConfig, views: EditorViews, nav: FrameNavigator) {
    super();

    this.config = config;
    this.views = views;
    this.#nav = nav;

    this.#display = null;
    this.#layers = null;

    this.#nav.addEventListener("edit-branch", this.#onEditBranch);
    this.#nav.addEventListener("edit-frame", this.#onEditFrame);
  }

  /** Disposes of this object. Do not use it afterwards. */
  dispose() {
    if (this.#isDisposed) return;
    this.#isDisposed = true;

    this.#nav.removeEventListener("edit-branch", this.#onEditBranch);
    this.#nav.removeEventListener("edit-frame", this.#onEditFrame);

    this.#layers?.removeEventListener("layer-activate", this.#onLayerActivate);

    // The context owns the display bound to it. Disposing it here releases
    // window-level pointer observers, camera controls, and scene listeners.
    const display = this.#display;
    this.#display = null;
    display?.dispose();

    this.#nav.dispose();
  }

  /** Binds a display to this context. */
  async bindDisplay(display: SceneDisplay<WM>): Promise<void> {
    this.#display = display;
  }

  /**
   * Binds a collection of layers to this context, and initializes them such that
   * the data displayed corresponds to the current frame.
   */
  async bindLayers(layers: LayerCollection<WM>): Promise<void> {
    this.#layers?.removeEventListener("layer-activate", this.#onLayerActivate);

    this.#layers = layers;
    this.#layers.addEventListener("layer-activate", this.#onLayerActivate);
    // The collection may already have an active layer when it is bound.
    // Replay it so layer-owned UI, including inspector panels, receives
    // the initial activation state.
    this.#onLayerActivate({ activeLayer: layers.activeLayer });

    const currentFrame = this.currentFrame;
    if (this.currentLabelBranch != null && layers.labelDataLayers.length > 0)
      await this.views.getClassSelection(this.currentLabelBranch.group.id);
    void currentFrame?.updateLastViewedAt();

    await Promise.all(
      layers.dataLayers.map((layer) => layer.dataView.setFrame(currentFrame)),
    );
  }

  /** Tests if a layer is the currently active one. */
  isLayerActive(layer: SceneLayer<WM>): boolean {
    if (this.#layers == null) return false;

    return this.#layers.activeLayer === layer;
  }

  /**
   * Requests that data be loaded in memory for a frame (in the current branch).
   *
   * Unlike {@link SceneContext#displayFrame}, the frame is not actually displayed to the user.
   * However, subsequently calling {@link SceneContext#displayFrame} should almost immediately
   * display the frame, since the data has already been loaded (unless the cache has expired).
   *
   * Requires that this context be bound to a {@link LayerCollection}
   * (see {@link SceneContext#bindLayers}).
   */
  async requireFrame(frame: EditableFrame): Promise<void> {
    const {
      layers: { dataLayers },
    } = this;

    await Promise.all(dataLayers.map((layer) => layer.dataView.getData(frame)));
  }

  /** Ensures that all navigation operations are run sequentially. */
  #navQueue = new Queue(1, 0);

  /** `true` if a navigation operation is currently in progress. */
  get isNavigating(): boolean {
    const { waiting, running } = this.#navQueue.stat();
    return waiting > 0 || running > 0;
  }

  /**
   * Runs a navigation operation inside the lock.
   */
  async #runInNavContext(navFn: () => Promise<void>): Promise<void> {
    return this.#navQueue
      .run(async () => {
        this.dispatchEvent({ type: "isNavigating-changed" });

        const prevFrame = this.currentFrame;
        const prevSourceGroup = this.currentSourceGroup;
        const prevLabelBranch = this.currentLabelBranch;

        await navFn();

        const currentFrame = this.currentFrame;
        const currentSourceGroup = this.currentSourceGroup;
        const currentLabelBranch = this.currentLabelBranch;

        if (currentLabelBranch != null && this.#layers?.labelDataLayers.length)
          await this.views.getClassSelection(currentLabelBranch.group.id);

        if (prevFrame?.id !== currentFrame?.id) {
          this.dispatchEvent({
            type: "nav-frame",
            prevFrame: prevFrame,
            frame: currentFrame,
          });

          // Keep the address bar deep-linkable without reloading the page.
          this.views.syncEditorUrl(currentFrame);

          if (this.#layers != null) {
            // Run this in the background; do not await
            void currentFrame?.updateLastViewedAt();

            const { dataLayers } = this.#layers;

            await Promise.all(
              dataLayers.map((layer) => layer.dataView.setFrame(currentFrame)),
            );
          }
        }

        if (prevSourceGroup?.id !== currentSourceGroup?.id) {
          this.dispatchEvent({
            type: "nav-source-group",
            prevGroup: prevSourceGroup,
            group: currentSourceGroup,
          });
        }

        if (prevLabelBranch?.id !== currentLabelBranch?.id) {
          this.dispatchEvent({
            type: "nav-label-branch",
            prevBranch: prevLabelBranch,
            branch: currentLabelBranch,
          });
        }
      })
      .finally(() => {
        this.dispatchEvent({ type: "isNavigating-changed" });
      });
  }

  /**
   * Sets the active task and loads its source groups, label branches, and scene
   * frames, but displays no frame.
   *
   * The initial load uses this before choosing a frame with
   * {@link SceneContext#displaySceneSelection}, which needs the loaded groups
   * and branches to resolve the frame's own scene. Selecting the frame only
   * there means one frame is displayed per load.
   *
   * Requires that this context be bound to a {@link LayerCollection}
   * (see {@link SceneContext#bindLayers}).
   */
  async displayTaskSelectors(task: TaskState | null): Promise<void> {
    await this.#runInNavContext(async () => {
      await this.#nav.loadTaskSelectors(task);
    });
  }

  /**
   * Sets the active task, then displays the first available frame.
   *
   * Requires that this context be bound to a {@link LayerCollection}
   * (see {@link SceneContext#bindLayers}).
   */
  async displayTaskById(taskId: number | null): Promise<void> {
    await this.#runInNavContext(async () => {
      await this.#nav.loadTaskById(taskId);
    });
  }

  /**
   * Sets the active source group, then displays the first available frame.
   *
   * Concurrent calls to this method are run sequentially.
   *
   * Requires that this context be bound to a {@link LayerCollection}
   * (see {@link SceneContext#bindLayers}).
   */
  async displaySourceGroup(group: SourceGroupState | null): Promise<void> {
    await this.#runInNavContext(async () => {
      await this.#nav.loadSourceGroup(group);
    });
  }

  /**
   * Sets the active label branch, then displays the first available frame.
   *
   * Concurrent calls to this method are run sequentially.
   *
   * Requires that this context be bound to a {@link LayerCollection}
   * (see {@link SceneContext#bindLayers}).
   */
  async displayLabelBranch(branch: EditableBranch | null): Promise<void> {
    await this.#runInNavContext(async () => {
      await this.#nav.loadLabelBranch(branch);
    });
  }

  /** Selects the initial source group, label branch, and frame atomically. */
  async displaySceneSelection(
    sourceGroup: SourceGroupState | null,
    labelBranch: EditableBranch | null,
    frameId: number | null,
  ): Promise<void> {
    await this.#runInNavContext(async () => {
      await this.#nav.loadSceneSelection(sourceGroup, labelBranch, frameId);
    });
  }

  /**
   * Loads and displays a frame to the user (in the current branch).
   *
   * Concurrent calls to this method are run sequentially.
   *
   * Requires that this context be bound to a {@link LayerCollection}
   * (see {@link SceneContext#bindLayers}).
   */
  async displayFrame(frame: EditableFrame | null): Promise<void> {
    await this.#runInNavContext(async () => {
      await this.#nav.loadFrame(frame);
    });
  }

  /**
   * Loads and displays a frame to the user (in the current branch).
   *
   * Concurrent calls to this method are run sequentially.
   *
   * Requires that this context be bound to a {@link LayerCollection}
   * (see {@link SceneContext#bindLayers}).
   */
  async displayFrameById(frameId: number | null): Promise<void> {
    await this.#runInNavContext(async () => {
      await this.#nav.loadFrameById(frameId);
    });
  }

  /**
   * Loads and displays the frame that most closely matches a set of selectors
   * to the user (in the current branch).
   *
   * Concurrent calls to this method are run sequentially.
   */
  async displayFrameFromCurrent(selectors: FrameSelectors): Promise<void> {
    await this.#runInNavContext(async () => {
      await this.#nav.loadFrameFromCurrent(selectors);
    });
  }
}
