import type { FrameState, TaskState, SourceGroupState } from "../models";
import { TypeUtils, type CoordBounds, type Timestamp } from "sta/common";

import type { EditableBranch } from "../labelset";
import { VanillaEventDispatcher } from "../utils";
import type { EditorViews } from "../views";

import type { EditableFrame } from "./EditableFrame";
import { LabelsetNavigator } from "./LabelsetNavigator";
import type { LabelsetBranchIndex } from "./LabelsetNavigator";
import { ProjectNavigator } from "./ProjectNavigator";
import type { TaskIndex } from "./ProjectNavigator";
import { SceneNavigator } from "./SceneNavigator";
import type { FrameIndex } from "./SceneNavigator";
import { SourcesetNavigator } from "./SourcesetNavigator";
import type { SourceGroupIndex } from "./SourcesetNavigator";

/**
 * Defines each event that can be dispatched by {@link FrameNavigator}.
 */
export interface FrameNavigatorEventMap {
  /** The event when a branch in the navigator has been edited. */
  "edit-branch": { branch: EditableBranch };
  /** The event when a frame in the navigator has been edited. */
  "edit-frame": { frame: EditableFrame };
}

export interface FrameSelectors {
  xBounds?: CoordBounds | null;
  yBounds?: CoordBounds | null;
  zBounds?: CoordBounds | null;
  tBounds?: CoordBounds | null;
  xCenter?: number | null;
  yCenter?: number | null;
  zCenter?: number | null;
  tCenter?: Timestamp | null;
}

/**
 * Navigates between frames in the application.
 */
export class FrameNavigator extends VanillaEventDispatcher<FrameNavigatorEventMap> {
  /**
   * The interface of the application with the server.
   */
  readonly views: EditorViews;

  /**
   * Navigates between tasks in the active project.
   */
  readonly #projectNav: ProjectNavigator;

  /**
   * The tasks available to the project.
   */
  get tasks(): TaskIndex {
    return this.#projectNav.tasks;
  }

  /**
   * The number of tasks available to the project.
   */
  get numTasks(): number {
    return this.#projectNav.numTasks;
  }

  /**
   * The currently selected task, or `null` if none.
   */
  get task(): TaskState | null {
    return this.#projectNav.task;
  }

  /**
   * The unique identifier of the selected task;
   * set this property to select the corresponding task.
   */
  get taskId(): number | null {
    return this.#projectNav.taskId;
  }

  /**
   * Selects and loads a task, along with its associated source groups and label branches.
   *
   * @param task The task to load.
   * @returns A promise that resolves when the given task and its
   * associated source groups and label branches have been loaded.
   */
  async loadTask(task: TaskState | null): Promise<void> {
    await this.#selectTask(task, false);
  }

  /**
   * Selects and loads a task with its associated source groups, label branches,
   * and scene frames, but displays none of those frames.
   *
   * The initial load uses this to postpone the frame until the source group and
   * label branch it belongs to are known, so one frame is displayed per load
   * instead of the scene's first frame followed by the requested one.
   *
   * @param task The task to load.
   * @returns A promise that resolves when the given task and its
   * associated source groups and label branches have been loaded.
   */
  async loadTaskSelectors(task: TaskState | null): Promise<void> {
    await this.#selectTask(task, true);
  }

  /**
   * Selects a task and reloads every selector below it.
   *
   * @param task The task to load.
   * @param deferFrameSelection `true` to leave all of the loaded scene's frames
   * undisplayed, for a caller that selects the frame itself afterwards.
   */
  async #selectTask(
    task: TaskState | null,
    deferFrameSelection: boolean,
  ): Promise<void> {
    if (this.task?.id === task?.id) return;
    if (this.#projectNav == null) return;

    const prevFrame = this.frame;
    const prevTask = this.task;

    this.#projectNav.task = task;
    try {
      await Promise.all([
        this.#loadSourcesetNav(this.task),
        this.#loadLabelsetNav(this.task),
      ]);
      await this.#loadSceneNav(
        this.task,
        this.sourceGroup,
        this.labelBranch,
        undefined,
        deferFrameSelection,
      );
    } catch (error) {
      this.#projectNav.task = prevTask;
      await Promise.allSettled([
        this.#loadSourcesetNav(prevTask),
        this.#loadLabelsetNav(prevTask),
      ]);
      await this.#loadSceneNav(
        prevTask,
        this.sourceGroup,
        this.labelBranch,
      ).catch(() => undefined);
      throw error;
    }

    if (deferFrameSelection) return;

    if (prevFrame) {
      const closestFrame = this.#findClosestFrame(prevFrame);
      if (closestFrame) {
        await this.loadFrame(closestFrame);
        return;
      }
    }
  }

  /**
   * Selects and loads a task, along with its associated source groups and label branches.
   *
   * @param taskId The unique identifier of the task to load.
   * @returns A promise that resolves when the given task and its
   * associated source groups and label branches have been loaded.
   */
  async loadTaskById(taskId: number | null): Promise<void> {
    if (this.taskId === taskId) return;
    if (this.#projectNav == null) return;

    const prevTask = this.task;
    this.#projectNav.taskId = taskId;
    try {
      await Promise.all([
        this.#loadSourcesetNav(this.task),
        this.#loadLabelsetNav(this.task),
      ]);
      await this.#loadSceneNav(this.task, this.sourceGroup, this.labelBranch);
    } catch (error) {
      this.#projectNav.task = prevTask;
      await Promise.allSettled([
        this.#loadSourcesetNav(prevTask),
        this.#loadLabelsetNav(prevTask),
      ]);
      await this.#loadSceneNav(
        prevTask,
        this.sourceGroup,
        this.labelBranch,
      ).catch(() => undefined);
      throw error;
    }
  }

  /**
   * Navigates between sourcesets in the active task.
   */
  readonly #sourcesetNav: SourcesetNavigator;

  async #unloadSourcesetNav() {
    await this.#sourcesetNav.load(null);
  }

  /**
   * Loads the wrapped sourceset navigator.
   *
   * @param task The task which the sourceset is based on.
   */
  async #loadSourcesetNav(task: TaskState | null) {
    await this.#unloadSourcesetNav();

    if (task != null) {
      await this.#sourcesetNav.load(task.id);
    }
  }

  /**
   * The branches available to the task.
   */
  get sourceGroups(): SourceGroupIndex {
    return this.#sourcesetNav.groups;
  }

  /**
   * The number of branches available to the task.
   */
  get numSourceGroups(): number {
    return this.#sourcesetNav.numGroups;
  }

  /**
   * The currently selected source group, or `null` if none.
   */
  get sourceGroup(): SourceGroupState | null {
    return this.#sourcesetNav.group;
  }

  /**
   * Selects and loads a source group.
   *
   * @param group The group to load.
   * @returns A promise that resolves when the given group and its
   * associated frames have been loaded.
   */
  async loadSourceGroup(group: SourceGroupState | null): Promise<void> {
    if (this.sourceGroup?.id === group?.id) return;
    if (this.#sourcesetNav == null) return;

    const prevFrame = this.frame;

    this.#sourcesetNav.group = group;

    await this.#loadSceneNav(this.task, this.sourceGroup, this.labelBranch);

    if (prevFrame) {
      const closestFrame = this.#findClosestFrame(prevFrame);
      if (closestFrame) {
        await this.loadFrame(closestFrame);
        return;
      }
    }
  }

  /**
   * Navigates between labelsets in the active task.
   */
  readonly #labelsetNav: LabelsetNavigator;

  /**
   * Each callback, when called, disposes of an event listener.
   */
  #disposeBranchEditCallbacks: (() => void)[] = [];

  async #unloadLabelsetNav() {
    for (const disposeBranchEdit of this.#disposeBranchEditCallbacks) {
      disposeBranchEdit();
    }

    await this.#labelsetNav.load(null);
    this.#disposeBranchEditCallbacks = [];
  }

  /**
   * Loads the wrapped labelset navigator.
   *
   * @param task The task which the labelset is based on.
   */
  async #loadLabelsetNav(task: TaskState | null) {
    await this.#unloadLabelsetNav();

    if (task != null) {
      await this.#labelsetNav.load(task.id);

      for (const branch of this.#labelsetNav.branches.elements) {
        const handler = () =>
          this.dispatchEvent({ type: "edit-branch", branch: branch });

        branch.addEventListener("afterchange", handler);
        this.#disposeBranchEditCallbacks.push(() => {
          branch.removeEventListener("afterchange", handler);
        });
      }
    }
  }

  /**
   * The label branches available to the task.
   */
  get labelBranches(): LabelsetBranchIndex {
    return this.#labelsetNav.branches;
  }

  /**
   * The number of label branches available to the task.
   */
  get numLabelBranches(): number {
    return this.#labelsetNav.numBranches;
  }

  /**
   * `true` if any branch has unsaved changes; otherwise, `false`.
   */
  get hasUnsavedChanges(): boolean {
    return this.#labelsetNav.hasUnsavedChanges;
  }

  /**
   * The currently selected label branch, or `null` if none.
   */
  get labelBranch(): EditableBranch | null {
    return this.#labelsetNav.branch;
  }

  /**
   * Selects and loads a label branch.
   *
   * @param branch The branch to load.
   * @returns A promise that resolves when the given branch and its
   * associated frames have been loaded.
   */
  async loadLabelBranch(branch: EditableBranch | null): Promise<void> {
    if (this.labelBranch?.id === branch?.id) return;
    if (this.#labelsetNav == null) return;

    const prevFrame = this.frame;

    this.#labelsetNav.branch = branch;

    await this.#loadSceneNav(this.task, this.sourceGroup, this.labelBranch);

    if (prevFrame) {
      const closestFrame = this.#findClosestFrame(prevFrame);
      if (closestFrame) {
        await this.loadFrame(closestFrame);
        return;
      }
    }
  }

  /**
   * Selects a source group, label branch, and frame as one scene load.
   * This avoids rebuilding the scene once for each selector during initial
   * navigation.
   */
  async loadSceneSelection(
    sourceGroup: SourceGroupState | null,
    labelBranch: EditableBranch | null,
    frameId: number | null,
  ): Promise<void> {
    // Resolve the complete target tuple before mutating any selector. A stale
    // URL frame id must not leave the navigator in a partially updated scene.
    let loadedFrames: FrameState[] | undefined;
    if (frameId != null) {
      loadedFrames =
        this.taskId == null
          ? []
          : await this.views.getFrames(
              this.taskId,
              sourceGroup?.id ?? null,
              labelBranch?.id ?? null,
            );
      if (!loadedFrames.some((frame) => frame.id === frameId)) {
        frameId = loadedFrames[0]?.id ?? null;
      }
    }

    const sceneChanged =
      this.sourceGroup?.id !== sourceGroup?.id ||
      this.labelBranch?.id !== labelBranch?.id;
    this.#sourcesetNav.group = sourceGroup;
    this.#labelsetNav.branch = labelBranch;
    if (sceneChanged) {
      await this.#loadSceneNav(
        this.task,
        this.sourceGroup,
        this.labelBranch,
        loadedFrames,
      );
    }
    this.#sceneNav.frameId = frameId;
  }

  /**
   * Navigates between scenes in the active task.
   */
  readonly #sceneNav: SceneNavigator;

  /**
   * Each callback, when called, disposes of an event listener.
   */
  #disposeFrameEditCallbacks: (() => void)[] = [];

  async #unloadSceneNav() {
    for (const disposeFrameEdit of this.#disposeFrameEditCallbacks) {
      disposeFrameEdit();
    }

    await this.#sceneNav.load(null, null, null);
    this.#disposeFrameEditCallbacks = [];
  }

  /**
   * Loads the wrapped scene navigator.
   *
   * @param task The task which the scene is based on.
   * @param sourceGroup The source group which the scene is based on.
   * @param labelBranch The label branch which the scene is based on.
   * @param deferFrameSelection `true` to load the scene without displaying any
   * of its frames.
   */
  #loadSceneNav = async (
    task: TaskState | null,
    sourceGroup: SourceGroupState | null,
    labelBranch: EditableBranch | null,
    loadedFrames?: FrameState[],
    deferFrameSelection?: boolean,
  ) => {
    await this.#unloadSceneNav();

    if (task != null && sourceGroup != null && labelBranch != null) {
      await this.#sceneNav.load(
        task.id,
        sourceGroup.id,
        labelBranch.id,
        loadedFrames,
        deferFrameSelection,
      );

      for (const frame of this.#sceneNav.frames.elements) {
        const handler = () =>
          this.dispatchEvent({ type: "edit-frame", frame: frame });

        frame.addEventListener("edit", handler);
        this.#disposeFrameEditCallbacks.push(() => {
          frame.removeEventListener("edit", handler);
        });
      }
    }
  };

  /**
   * The frames available to the task.
   */
  get frames(): FrameIndex {
    return this.#sceneNav.frames;
  }

  /**
   * The number of frames available to the task.
   */
  get numFrames(): number {
    return this.#sceneNav.numFrames;
  }

  /**
   * The currently selected frame, or `null` if none.
   */
  get frame(): EditableFrame | null {
    return this.#sceneNav.frame;
  }

  /**
   * The unique identifier of the selected frame.
   */
  get frameId(): number | null {
    return this.#sceneNav.frameId;
  }

  /**
   * Selects source data in the selected frame.
   */
  get sourceGroupId(): number | null {
    return this.#sceneNav.sourceGroupId;
  }

  /**
   * Selects label data in the selected frame.
   */
  get labelBranchId(): number | null {
    return this.#sceneNav.labelBranchId;
  }

  /**
   * Selects and loads a frame.
   *
   * @param frame The frame to load.
   * @returns A promise that resolves when the given frame has been loaded.
   */
  async loadFrame(frame: EditableFrame | null): Promise<void> {
    if (this.frame?.id === frame?.id) return;
    if (this.#sceneNav == null) return;

    this.#sceneNav.frame = frame;
  }

  /**
   * Selects and loads a frame.
   *
   * @param frameId The unique identifier of the frame to load.
   * @returns A promise that resolves when the given frame has been loaded.
   */
  async loadFrameById(frameId: number | null): Promise<void> {
    if (this.frameId === frameId) return;
    if (this.#sceneNav == null) return;

    this.#sceneNav.frameId = frameId;
  }

  /**
   * Finds all frames that match the given selectors.
   *
   * The results are sorted according to their distance from the current frame
   * from closest to furthest.
   *
   * @param selectors For each axis, the value to match against.
   * If an axis is omitted, the corresponding value of the current frame is used.
   * @param idxTol Expands the search to potentially include frames that are not
   * exactly aligned along each axis.
   * @returns An array of frames that match the given selectors.
   */
  #findFramesFromCurrent(
    selectors: FrameSelectors,
    idxTol = 0,
  ): readonly EditableFrame[] {
    const frame = this.frame;
    const { axes } = this.frames;

    // For each axis omitted from the selectors, the search defaults to
    // the value of the current frame along that axis.
    const defaults: Required<FrameSelectors> = {
      xBounds: frame == null ? null : axes.xb.getValue(frame),
      yBounds: frame == null ? null : axes.yb.getValue(frame),
      zBounds: frame == null ? null : axes.zb.getValue(frame),
      tBounds: frame == null ? null : axes.tb.getValue(frame),
      xCenter: frame == null ? null : axes.xc.getValue(frame),
      yCenter: frame == null ? null : axes.yc.getValue(frame),
      zCenter: frame == null ? null : axes.zc.getValue(frame),
      tCenter: frame == null ? null : axes.tc.getValue(frame),
    };

    const getProp = <K extends keyof FrameSelectors>(
      obj: FrameSelectors,
      key: K,
    ): Required<Pick<FrameSelectors, K>>[K] =>
      TypeUtils.getPropOrDefault(obj, key, defaults[key]);

    const getIdxTol = <K extends keyof FrameSelectors>(
      obj: FrameSelectors,
      key: K,
    ): number => (key in obj ? 0 : idxTol);

    return this.frames
      .findInRangeOfValue(
        {
          xb: getProp(selectors, "xBounds"),
          yb: getProp(selectors, "yBounds"),
          zb: getProp(selectors, "zBounds"),
          tb: getProp(selectors, "tBounds"),
          xc: getProp(selectors, "xCenter"),
          yc: getProp(selectors, "yCenter"),
          zc: getProp(selectors, "zCenter"),
          tc: getProp(selectors, "tCenter"),
        },
        {
          xb: getIdxTol(selectors, "xBounds"),
          yb: getIdxTol(selectors, "yBounds"),
          zb: getIdxTol(selectors, "zBounds"),
          tb: getIdxTol(selectors, "tBounds"),
          xc: getIdxTol(selectors, "xCenter"),
          yc: getIdxTol(selectors, "yCenter"),
          zc: getIdxTol(selectors, "zCenter"),
          tc: getIdxTol(selectors, "tCenter"),
        },
      )
      .toSorted((a, b) => {
        const frame = this.frame;
        if (frame == null) return 0;

        const aDist = this.frames.frameIdxDistance(a, frame);
        const bDist = this.frames.frameIdxDistance(b, frame);

        return aDist - bDist;
      });
  }

  /**
   * Finds the frame that most closely matches the given selectors.
   *
   * @param frame For each axis, the value to match against.
   * @returns The closest frame, or `null` if no frames are available.
   */
  #findClosestFrame(frame: EditableFrame): EditableFrame | null {
    return (
      this.frames.elements
        .toSorted((a, b) => {
          const aDist = this.frames.frameIdxDistance(a, frame, {
            fuzzy: true,
          });
          const bDist = this.frames.frameIdxDistance(b, frame, {
            fuzzy: true,
          });

          return aDist - bDist;
        })
        .at(0) ?? null
    );
  }

  /**
   * Sets the current frame to the frame that most closely matches a set of selectors
   * to the user (in the current branch). Then, loads that frame.
   *
   * @param selectors For each axis, the value to match against.
   * If an axis is omitted, the corresponding value of the current frame is used.
   * @returns A promise that resolves when the given frame has been loaded.
   */
  async loadFrameFromCurrent(selectors: FrameSelectors): Promise<void> {
    if (this.#sceneNav == null) return;

    const [frame] = this.#findFramesFromCurrent(
      selectors,
      Number.MAX_SAFE_INTEGER,
    );
    if (frame == null) {
      console.error(selectors);
      throw new Error("Cannot find matching frame");
    }

    await this.loadFrame(frame);
  }

  /**
   * Creates a new navigator for the application with its index already loaded.
   *
   * @param views The interface of the application with the server.
   * @returns A promise that resolves to the newly created navigator.
   */
  static async create(views: EditorViews): Promise<FrameNavigator> {
    const nav = new FrameNavigator(views);

    await nav.load();

    return nav;
  }

  /**
   * Creates a new navigator for the application.
   *
   * @param views The interface of the application with the server.
   */
  protected constructor(views: EditorViews) {
    super();

    this.views = views;

    this.#projectNav = new ProjectNavigator(views);
    this.#sourcesetNav = new SourcesetNavigator(views);
    this.#labelsetNav = new LabelsetNavigator(views);
    this.#sceneNav = new SceneNavigator(views);
  }

  /**
   * Loads the index of this navigator.
   */
  async load() {
    await this.#projectNav.load();

    await this.loadTask(null);
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose() {
    void this.#unloadSceneNav();
    void this.#unloadSourcesetNav();
    void this.#unloadLabelsetNav();
  }
}
