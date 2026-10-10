import type { ReactNode } from "react";
import * as THREE from "three";

import type {
  SceneContext,
  SelectorEventMap,
  Selector,
  Placeholder,
  MainWindow,
} from "sta/app/editor";

import type {
  SelectionEditControlsEventMap,
  SelectionEditControls,
  AssistedSelectionEditControlsEventMap,
  AssistedSelectionEditControl,
  PromptedData,
} from "../controls";
import type {
  SegmentationView,
  ReadonlyLabelSelection,
  LabelSelectionReformMonitor,
} from "../data";
import type {
  RectangleCurator,
  PolygonCurator,
  LassoCurator,
  BrushCurator,
  SelectionCurator,
} from "../tools";
import type { PointCloudUtils } from "../utils";
import type {
  Action,
  DrawMode,
  LabelSelectionInspectorEventMap,
  LabelSelectionInspectorHandle,
  LabelInstanceInspectorEventMap,
  LabelInstanceInspectorHandle,
} from "../widgets";
import { LabelInstanceInspector, LabelSelectionInspector } from "../widgets";
import { baseAction } from "../widgets/ActionPane.ts";

import { DrawSelectionState } from "./DrawSelectionState";
import { InteractState } from "./InteractState";
import { NavigationState } from "./NavigationState";
import { SelectSelectionState } from "./SelectSelectionState";

export type { InteractState } from "./InteractState";

export type UUID = string | Placeholder<string>;

// A type alias, not an interface: the alias's implicit string index
// signature is what lets `WM extends MainWindowMapper` satisfy the
// WindowMapper (Record<string, SceneWindow>) constraints in this module.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type MainWindowMapper = { main: MainWindow };

export interface SelectionCurators {
  box: RectangleCurator;
  polygon: PolygonCurator;
  lasso: LassoCurator;
  brush: BrushCurator;
}

export interface StateContextParams<WM extends MainWindowMapper> {
  /** A handle to the state of the scene. */
  sceneContext: SceneContext<WM>;
  /** A view of the data to display in this layer. */
  dataView: SegmentationView;
  /** The copied point cloud of the current source in the frame. */
  pointCloudUtils: PointCloudUtils | null;
  /** The 2D canvas in the scene where the drawing of object query takes place. */
  canvas: HTMLCanvasElement;
  /** creates/edits point selection. */
  selectionController: SelectionEditControls;
  /** Creates/edits point selection using masks predicted by the labeling assistant. */
  assistedSelectionController: AssistedSelectionEditControl;
  /** Interacts with points shaping a selection. */
  selectionSelector: Selector<ReadonlyLabelSelection>;
  /** Monitors the transform of the selected selection. */
  selectionMonitor: LabelSelectionReformMonitor;
  /** Whether instances are managed automatically (one selection each).
   * Layer configuration, injected explicitly so the inspectors have it
   * while data is absent or loading. */
  autoInstances: boolean;
}

export interface MainWindowUsage {
  /** The CSS class that sets the `cursor` property of the main window (without the prefix `cursor-`). */
  cursorClass?: string;
  /** Whether the controls of the camera are enabled. */
  controlCamera?: boolean;
  /** Whether the canvas for 2d drawing is hidden. */
  hiddenCanvas?: boolean;
}

export interface LabelDataUsage {
  /** Handles the event before the data is (un)loaded. */
  beforeLoad?: () => void;
  /** Handles the event after the data is (un)loaded. */
  afterLoad?: () => void;
  /** Handles the event after the branch has been edited. */
  branchEdit?: () => void;
}

export interface SelectionSelectorUsage {
  /** Whether the selection selector can hover over objects. */
  hover?: boolean;
  /**
   * Handles the event when a selection is selected.
   * If not provided, the selection selector cannot select objects.
   */
  select?: (
    event: SelectorEventMap<ReadonlyLabelSelection>["selectin"],
  ) => void;
}

export interface SelectionControllerUsage {
  /** whether the controller is enabled. */
  enabled?: boolean;
  /** Handles the event when a selection has been created newly or updated. */
  begin?: (event: SelectionEditControlsEventMap["begin"]) => void;
  /** Handles the event when creating or updating a selection has been terminated. */
  abort?: (event: SelectionEditControlsEventMap["abort"]) => void;
  /** Handles the event when a new selection has been created. */
  create?: (event: SelectionEditControlsEventMap["create"]) => void;
  /** Handles the event when a selection has been updated. */
  update?: (event: SelectionEditControlsEventMap["update"]) => void;
}

export interface AssistedSelectionControllerUsage {
  /** whether the controller is enabled. */
  enabled?: boolean;
  /** Handles the event when a selection has been created newly or updated. */
  begin?: (event: AssistedSelectionEditControlsEventMap["begin"]) => void;
  /** Handles the event when creating or updating a selection has been terminated. */
  abort?: (event: AssistedSelectionEditControlsEventMap["abort"]) => void;
  /** Handles the event when a new selection has been created. */
  create?: (event: AssistedSelectionEditControlsEventMap["create"]) => void;
  /** Handles the event when a selection has been updated. */
  update?: (event: AssistedSelectionEditControlsEventMap["update"]) => void;
}

export interface LabelInspectorUsage {
  /** Whether the inspector is enabled. Defaults to `true` if any event handler is set; otherwise, defaults to `false`. */
  enabled?: boolean;
  /** Handles the event when an object track is selected through the inspector. */
  selectInstance?: (
    event: LabelInstanceInspectorEventMap["select-instance"],
  ) => void;
  /** Handles the event when a selection is selected through the inspector. */
  selectSelection?: (
    event: LabelSelectionInspectorEventMap["select-selection"],
  ) => void;
}

/**
 * Omitting a component indicates that it is unused;
 * this automatically disables it within the context (if possible).
 */
export interface InteractContextUsage {
  /** Specifies the usage of the main window. */
  mainWindow?: MainWindowUsage;
  /** Specifies the usage of the labels. */
  data?: LabelDataUsage;
  /** Specifies the usage of the selection selector. */
  selectionSelector?: SelectionSelectorUsage;
  /** specifies the usage of the selection controler. */
  selectionController?: SelectionControllerUsage;
  /** Specifies the usage of the assisted selection controller. */
  assistedSelectionController?: AssistedSelectionControllerUsage;
  /** Specifies the usage of the label inspector. */
  labelInspector?: LabelInspectorUsage;
}

/**
 * Defines each event that can be dispatched by {@link InteractContext}.
 */
export interface InteractContextEventMap<WM extends MainWindowMapper> {
  "action-change": { type: "action-change" };
  "draw-mode-change": { type: "draw-mode-change" };
  /** The event when the instance or selection selected in the inspectors has changed. */
  "label-select-change": { type: "label-select-change" };
  /** The event when the active state has been changed. */
  change: { currentState: InteractState<WM> };
}

export interface EditStateParams {
  instanceId: UUID | null;
  selectionId: UUID | null;
  /** The points prompted to the labeling assistant, if any. */
  promptedData: PromptedData | null;
}

/**
 * Contains the context to be referred to in each {@link InteractState}.
 */
export class InteractContext<
  WM extends MainWindowMapper,
> extends THREE.EventDispatcher<InteractContextEventMap<WM>> {
  /**
   * A view of the data to display in this layer.
   */
  readonly dataView: SegmentationView;

  /**
   * A handle to the state of the scene.
   */
  readonly sceneContext: SceneContext<WM>;

  get mainWindow(): MainWindow {
    return this.sceneContext.display.windows.main;
  }

  #pointCloudUtils: PointCloudUtils | null = null;

  get pointCloudUtils(): PointCloudUtils | null {
    return this.#pointCloudUtils;
  }

  set pointCloudUtils(value: PointCloudUtils | null) {
    if (this.#pointCloudUtils !== value) {
      this.#pointCloudUtils = value;

      this.selectionController.pcdUtils = value;
    }
  }

  #layerIsActive = false;

  /** `true` if the layer for this interact context is active. otherwise; `flase` */
  get layerIsActive(): boolean {
    return this.#layerIsActive;
  }

  set layerIsActive(value: boolean) {
    if (this.#layerIsActive !== value) {
      this.#layerIsActive = value;

      // The usage applied to each component depends on whether the
      // layer is active, so re-apply it upon this change.
      this.#applyUsage();
    }
  }

  #useAssistant = false;

  /** `true` if the labeling assistant is used for labeling; otherwise, `false`. */
  get useAssistant(): boolean {
    return this.#useAssistant;
  }

  set useAssistant(value: boolean) {
    if (this.#useAssistant !== value) {
      this.#useAssistant = value;

      // The usage applied to the selection controller, the assisted
      // selection controller, and the curators depends on this flag.
      this.#applyUsage();
    }
  }

  readonly canvas: HTMLCanvasElement;

  /** Inspects selected object instances in the scene. */
  readonly #instanceInspector: LabelInstanceInspectorHandle;

  /** Inspects selected selections in the scene. */
  readonly #selectionInspector: LabelSelectionInspectorHandle;

  #unsubscribeInspectorEvents: (() => void)[] = [];

  get instanceInspector(): LabelInstanceInspectorHandle {
    return this.#instanceInspector;
  }

  get selectionInspector(): LabelSelectionInspectorHandle {
    return this.#selectionInspector;
  }

  /**
   * The id of the object instance selected in the inspector, or `null` if
   * none is selected.
   */
  get selectedInstanceId(): UUID | null {
    return this.#instanceInspector.selectedId;
  }

  /**
   * The id of the selection inspected, or `null` if none is selected.
   * Reads the inspector coordinator rather than the pointer selector, so
   * the inspected selection survives leaving the edit state (e.g. the
   * Escape abort) the same way the instance selection does.
   */
  get selectedSelectionId(): UUID | null {
    return this.#selectionInspector.selectedId;
  }

  /** Whether the draw-selection button of the selection inspector is active. */
  get drawSelectionActive(): boolean {
    return this.#selectionInspector.drawSelectionActive;
  }

  /** The exact disabled state of the instance inspector pane: usage-derived,
   * plus disabled while the labels are absent/loading. */
  get instanceInspectorDisabled(): boolean {
    return this.#instanceInspector.disabled || this.dataView.data == null;
  }

  /** The exact disabled state of the selection inspector pane: usage-derived,
   * plus disabled while the labels are absent/loading. */
  get selectionInspectorDisabled(): boolean {
    return this.#selectionInspector.disabled || this.dataView.data == null;
  }

  #drawMode: DrawMode = "box";

  #drawModeSettings: { disabled: boolean; hidden: boolean } = {
    disabled: false,
    hidden: false,
  };

  get drawMode(): DrawMode {
    return this.#drawMode;
  }

  setDrawMode(mode: DrawMode): void {
    if (this.#drawModeSettings.disabled || this.#drawMode === mode) return;
    this.#drawMode = mode;
    this.#updateDrawCurator();
    this.#notifyDrawModeChange();
  }

  cycleDrawMode(): void {
    const modes: DrawMode[] = ["brush", "box", "lasso", "polygon"];
    this.setDrawMode(modes[(modes.indexOf(this.#drawMode) + 1) % modes.length]);
  }

  #notifyDrawModeChange(): void {
    this.dispatchEvent({ type: "draw-mode-change" });
  }

  get action(): Action {
    return this.#action;
  }

  #activeCamera: THREE.Camera;

  get activeCamera(): THREE.Camera {
    return this.#activeCamera;
  }

  get activeCurator(): SelectionCurator<any> | null {
    return this.selectionController.activateCurator;
  }

  /**
   * Interacts with the selection objects in the scene.
   */
  readonly selectionSelector: Selector<ReadonlyLabelSelection>;

  /**
   * Manages creation/modification of selection objects.
   */
  readonly selectionController: SelectionEditControls;

  /**
   * Manages creation/modification of selection objects using
   * masks predicted by the labeling assistant.
   */
  readonly assistedSelectionController: AssistedSelectionEditControl;

  readonly selectionMonitor: LabelSelectionReformMonitor;

  #action: Action = "navigate";

  #actionSettings: { disabled: boolean; hidden: boolean } = {
    disabled: false,
    hidden: false,
  };

  #currentState: InteractState<WM> | null = null;

  /** The currently active state. */
  get currentState(): InteractState<WM> | null {
    return this.#currentState;
  }

  /** `true` if all state transitions are disabled; otherwise, `false`. */
  get disabled(): boolean {
    return this.#actionSettings.disabled;
  }

  set disabled(value: boolean) {
    if (this.disabled !== value) {
      if (value) {
        this.transitionNavigate();
      }

      this.#actionSettings = { ...this.#actionSettings, disabled: value };
      this.#notifyActionChange();

      if (!value && this.currentState == null) {
        this.#setStateFromAction(this.#action);
      }
    }
  }

  setAction(action: Action): void {
    if (this.disabled || this.#action === action) return;
    this.#action = action;
    this.#notifyActionChange();
    this.#setStateFromAction(action);
  }

  toggleAction(action: Action): void {
    this.setAction(this.#action === action ? baseAction : action);
  }

  toggleSelect(): void {
    this.toggleAction("select");
  }

  toggleDraw(): void {
    this.toggleAction("draw");
  }

  #notifyActionChange(): void {
    this.dispatchEvent({ type: "action-change" });
  }

  #notifyLabelSelectChange(): void {
    this.dispatchEvent({ type: "label-select-change" });
  }

  /**
   * Handles the event before the label data is loaded.
   */
  #onBeforeDataLoad = (): void => {
    this.currentState?.getUsage(this.#prevIsReadonly).data?.beforeLoad?.();

    // The state may have re-selected objects in response to the load,
    // which the applied usage depends on.
    this.#applyUsage();
  };

  /**
   * Handles the event after the label data is loaded.
   */
  #onAfterDataLoad = (): void => {
    this.currentState?.getUsage(this.#prevIsReadonly).data?.afterLoad?.();

    // The state may have re-selected objects in response to the load,
    // which the applied usage depends on.
    this.#applyUsage();
  };

  /**
   * Handles the event after a commit is applied to the label data.
   */
  #onEditBranch = (): void => {
    this.currentState?.getUsage(this.#prevIsReadonly).data?.branchEdit?.();

    // The state may have re-selected objects in response to the edit,
    // which the applied usage depends on.
    this.#applyUsage();
  };

  /**
   * Handles the event when the pointer selects a selection.
   */
  #onPointerSelectSelection = (
    event: SelectorEventMap<ReadonlyLabelSelection>["selectin"],
  ): void => {
    this.currentState
      ?.getUsage(this.#prevIsReadonly)
      .selectionSelector?.select?.(event);
  };

  /**
   * Handles the event when the user has started drawing a new obj query object.
   */
  #onBeginSelectionController = (
    event: SelectionEditControlsEventMap["begin"],
  ): void => {
    this.currentState
      ?.getUsage(this.disabled)
      .selectionController?.begin?.(event);

    this.#applyUsage();
  };

  /**
   * Handles the event when the user has cancelled drawing a new obj query object.
   */
  #onAbortSelectionController = (
    event: SelectionEditControlsEventMap["abort"],
  ): void => {
    this.currentState
      ?.getUsage(this.disabled)
      .selectionController?.abort?.(event);

    this.#applyUsage();
  };

  /**
   * Handles the event when the user has finished drawing a new obj query object.
   */
  #onCreateSelection = (
    event: SelectionEditControlsEventMap["create"],
  ): void => {
    this.currentState
      ?.getUsage(this.disabled)
      .selectionController?.create?.(event);

    this.#applyUsage();
  };

  /**
   * Handles the event when the user has finished modifying an obj query object.
   */
  #onUpdateSelection = (
    event: SelectionEditControlsEventMap["update"],
  ): void => {
    this.currentState
      ?.getUsage(this.disabled)
      .selectionController?.update?.(event);

    this.#applyUsage();
  };

  /**
   * Handles the event when the selection controller has changed internally,
   * e.g. when the edit mode is switched.
   */
  #onChangeSelectionController = (): void => {
    this.#applyUsage();
  };

  /**
   * Handles the event when the user has prompted enough points for a new mask prediction.
   */
  #onCreateSelectionByMask = (
    event: AssistedSelectionEditControlsEventMap["create"],
  ): void => {
    this.currentState
      ?.getUsage(this.disabled)
      .assistedSelectionController?.create?.(event);

    this.#applyUsage();
  };

  /**
   * Handles the event when the user has modified a selection prompted by the assistant.
   */
  #onUpdateSelectionByMask = (
    event: AssistedSelectionEditControlsEventMap["update"],
  ): void => {
    this.currentState
      ?.getUsage(this.disabled)
      .assistedSelectionController?.update?.(event);

    this.#applyUsage();
  };

  /**
   * Handles the event when the inspector selects an instance object.
   */
  #onInspectorSelectInstance = (
    event: LabelInstanceInspectorEventMap["select-instance"],
  ): void => {
    this.currentState
      ?.getUsage(this.disabled)
      .labelInspector?.selectInstance?.(event);

    this.#notifyLabelSelectChange();
  };

  /**
   * Handles the event when the inspector selects a selection.
   */
  #onInspectorSelectSelection = (
    event: LabelSelectionInspectorEventMap["select-selection"],
  ): void => {
    this.currentState
      ?.getUsage(this.disabled)
      .labelInspector?.selectSelection?.(event);

    this.#notifyLabelSelectChange();
  };

  /**
   * Handles the event when the inspector toggles the draw selection button.
   */
  #onInspectorToggleDrawSelection = (
    _event: LabelSelectionInspectorEventMap["toggle-drawSelection"],
  ): void => {
    this.toggleDraw();
  };

  /**
   * Handles the event when the view mode is changed.
   */
  #onViewModeChange = (): void => {
    const { mainWindow } = this;
    const { viewMode } = mainWindow;

    if (viewMode === "2D") {
      this.#activeCamera = mainWindow.camera2D;
    } else if (viewMode === "3D") {
      this.#activeCamera = mainWindow.camera3D;
    }

    this.selectionController.camera = this.activeCamera;

    this.#applyUsage();
  };

  #updateDrawCurator = (): void => {
    for (const [type, curator] of Object.entries(
      this.selectionController.curators,
    )) {
      curator.enabled = this.action === "draw" && type === this.#drawMode;
    }
  };

  /**
   * Updates the current state based on the selected action.
   */
  #setStateFromAction = (action: Action): void => {
    const { currentState } = this;

    switch (action) {
      // These instanceof checks prevent infinite loop when #renderState is called
      case "navigate":
        if (!(currentState instanceof NavigationState)) {
          this.transitionNavigate();
        }
        break;
      case "select":
        if (!(currentState instanceof SelectSelectionState)) {
          this.transitionSelectSelection();
        }
        break;
      case "draw":
        if (!(currentState instanceof DrawSelectionState)) {
          this.transitionDrawSelection();
        }
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    this.#renderState();
  };

  /**
   * Scans the point cloud into camera coordinates.
   */
  setPointCloudNDC(): void {
    const { pointCloudUtils, activeCamera } = this;
    if (pointCloudUtils == null) return;

    const points = [...pointCloudUtils.buffer.getCoords()];

    pointCloudUtils.pointsInNDC = points.map((point) =>
      point.clone().project(activeCamera),
    );
  }

  /**
   * Gets the content to display as a hint to the user when this layer is active.
   *
   * If `null`, no hint is displayed.
   */
  getHint(): ReactNode {
    return this.currentState?.getHint(this.disabled) ?? null;
  }

  /**
   * Updates the selected action based on the current state.
   */
  #renderState = (): void => {
    const { currentState } = this;
    let action: Action;

    if (currentState == null || currentState instanceof NavigationState) {
      action = "navigate";
    } else if (currentState instanceof SelectSelectionState) {
      action = "select";
    } else if (currentState instanceof DrawSelectionState) {
      action = "draw";
    } else {
      throw new Error(`Unhandled state type: ${JSON.stringify(currentState)}`);
    }

    const actionChanged = this.#action !== action;
    this.#action = action;

    this.#selectionInspector.drawSelectionActive =
      currentState instanceof DrawSelectionState;
    this.#updateDrawCurator();

    if (actionChanged) this.#notifyActionChange();
  };

  /**
   * Creates a new context.
   */
  constructor(params: StateContextParams<WM>) {
    super();
    this.sceneContext = params.sceneContext;
    this.dataView = params.dataView;
    this.canvas = params.canvas;
    this.selectionSelector = params.selectionSelector;
    this.selectionMonitor = params.selectionMonitor;

    // The context owns the inspectors so their state stays imperative and
    // survives independently of the React tree; the inspector panes read
    // the editor state snapshot and write back through intents.
    this.#instanceInspector = new LabelInstanceInspector({
      labelsView: params.dataView,
    });
    this.#selectionInspector = new LabelSelectionInspector({
      labelsView: params.dataView,
      autoInstances: params.autoInstances,
    });

    this.dataView.addEventListener("beforeload", this.#onBeforeDataLoad);
    this.dataView.addEventListener("afterload", this.#onAfterDataLoad);
    this.dataView.context.addEventListener("edit-branch", this.#onEditBranch);

    this.#pointCloudUtils = params.pointCloudUtils;

    this.selectionSelector.addEventListener(
      "selectin",
      this.#onPointerSelectSelection,
    );

    this.selectionController = params.selectionController;
    this.#updateDrawCurator();
    this.selectionController.addEventListener(
      "begin",
      this.#onBeginSelectionController,
    );
    this.selectionController.addEventListener(
      "abort",
      this.#onAbortSelectionController,
    );
    this.selectionController.addEventListener(
      "create",
      this.#onCreateSelection,
    );
    this.selectionController.addEventListener(
      "update",
      this.#onUpdateSelection,
    );
    this.selectionController.addEventListener(
      "change",
      this.#onChangeSelectionController,
    );

    // The usage of the current state depends on the inputs of these
    // events, so re-apply it whenever one of them is dispatched.
    this.addEventListener("action-change", this.#applyUsage);
    this.addEventListener("draw-mode-change", this.#applyUsage);
    this.addEventListener("change", this.#applyUsage);

    this.assistedSelectionController = params.assistedSelectionController;
    this.assistedSelectionController.addEventListener(
      "create",
      this.#onCreateSelectionByMask,
    );
    this.assistedSelectionController.addEventListener(
      "update",
      this.#onUpdateSelectionByMask,
    );

    this.mainWindow.addEventListener("viewMode-change", this.#onViewModeChange);

    const instanceInspector = this.#instanceInspector;
    const selectionInspector = this.#selectionInspector;
    selectionInspector.addEventListener(
      "select-selection",
      this.#onInspectorSelectSelection,
    );
    selectionInspector.addEventListener(
      "toggle-drawSelection",
      this.#onInspectorToggleDrawSelection,
    );
    selectionInspector.addEventListener(
      "select-instance",
      this.#onInspectorSelectInstance,
    );
    instanceInspector.addEventListener(
      "select-instance",
      this.#onInspectorSelectInstance,
    );
    this.#unsubscribeInspectorEvents = [
      () =>
        selectionInspector.removeEventListener(
          "select-selection",
          this.#onInspectorSelectSelection,
        ),
      () =>
        selectionInspector.removeEventListener(
          "toggle-drawSelection",
          this.#onInspectorToggleDrawSelection,
        ),
      () =>
        selectionInspector.removeEventListener(
          "select-instance",
          this.#onInspectorSelectInstance,
        ),
      () =>
        instanceInspector.removeEventListener(
          "select-instance",
          this.#onInspectorSelectInstance,
        ),
    ];

    // The state machine is started by the layer's initial `disabled =
    // true` assignment, which it makes AFTER attaching its `change`
    // listener, so the initial state update (controls, keybinds) is
    // not lost on a listener that does not exist yet.

    // Applies the usage once at construction (also runs whenever
    // the view mode changes).
    this.#onViewModeChange();
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose(): void {
    this.dataView.removeEventListener("beforeload", this.#onBeforeDataLoad);
    this.dataView.removeEventListener("afterload", this.#onAfterDataLoad);
    this.dataView.context.removeEventListener(
      "edit-branch",
      this.#onEditBranch,
    );

    this.selectionSelector.removeEventListener(
      "selectin",
      this.#onPointerSelectSelection,
    );

    this.selectionController.removeEventListener(
      "begin",
      this.#onBeginSelectionController,
    );
    this.selectionController.removeEventListener(
      "abort",
      this.#onAbortSelectionController,
    );
    this.selectionController.removeEventListener(
      "create",
      this.#onCreateSelection,
    );
    this.selectionController.removeEventListener(
      "update",
      this.#onUpdateSelection,
    );
    this.selectionController.removeEventListener(
      "change",
      this.#onChangeSelectionController,
    );

    this.assistedSelectionController.removeEventListener(
      "create",
      this.#onCreateSelectionByMask,
    );
    this.assistedSelectionController.removeEventListener(
      "update",
      this.#onUpdateSelectionByMask,
    );

    this.removeEventListener("action-change", this.#applyUsage);
    this.removeEventListener("draw-mode-change", this.#applyUsage);
    this.removeEventListener("change", this.#applyUsage);

    this.mainWindow.removeEventListener(
      "viewMode-change",
      this.#onViewModeChange,
    );

    // Detach the inspector event handlers before disposing the
    // inspectors themselves, exactly once.
    for (const unsubscribe of this.#unsubscribeInspectorEvents) unsubscribe();
    this.#unsubscribeInspectorEvents = [];
    this.#instanceInspector.dispose();
    this.#selectionInspector.dispose();
    this.selectionMonitor.dispose();
  }

  /**
   * The value of `isReadonly` passed to the usage queries of the event
   * handlers.
   *
   * Note: this was never updated from its initial value (the previous
   * per-frame {@link InteractContext#render} did not assign to it either),
   * so it is kept as `false` to preserve the existing behavior.
   */
  #prevIsReadonly = false;

  /**
   * Updates the `three.js` objects and the DOM elements of this layer.
   * It is called during each animation frame while this layer is displayed.
   *
   * This work is now change-driven: {@link InteractContext#applyUsage} runs
   * once at construction, and again whenever the corresponding event signals
   * that the usage of the current state may have changed, so this method
   * performs no per-frame work and is kept as a no-op.
   */
  render(): void {
    // No-op: the usage is applied change-driven by #applyUsage.
  }

  /**
   * Applies the usage of the current state to each component of this context.
   *
   * This is run once at construction, and again whenever an event signals
   * that the usage of the current state may have changed, replacing the
   * previous per-frame polling.
   */
  #applyUsage = (): void => {
    const { currentState, layerIsActive } = this;

    if (currentState == null) return;

    const usage = currentState.getUsage(this.disabled);

    if (layerIsActive) {
      this.mainWindow.enableCameraControls = !!usage.mainWindow?.controlCamera;
    }

    this.#updateCursor(usage);
    this.#updateEnabled(usage);
  };

  #prevCursorClassWithPrefix = "";

  /**
   * Updates the cursor that is displayed when hovered over the main window.
   */
  #updateCursor(usage: InteractContextUsage): void {
    const container = this.mainWindow.dom;
    // All label layers share the same window container; only an enabled
    // context (active layer with loaded data) may set the cursor, and a
    // disabled one drops its class so the layers do not fight over it.
    const cursorClass = this.disabled
      ? ""
      : (usage.mainWindow?.cursorClass ?? "");
    const cursorClassWithPrefix = cursorClass ? `cursor-${cursorClass}` : "";

    if (this.#prevCursorClassWithPrefix !== cursorClassWithPrefix) {
      if (this.#prevCursorClassWithPrefix) {
        container.classList.remove(this.#prevCursorClassWithPrefix);
      }

      if (cursorClassWithPrefix) {
        container.classList.add(cursorClassWithPrefix);
      }

      this.#prevCursorClassWithPrefix = cursorClassWithPrefix;
    }
  }

  /**
   * Updates the enabled status of each component in this context.
   */
  #updateEnabled(usage: InteractContextUsage): void {
    const {
      layerIsActive,
      drawMode,
      action,
      canvas,
      selectionController,
      selectionSelector,
      assistedSelectionController,
      useAssistant,
    } = this;

    canvas.hidden = !!usage.mainWindow?.hiddenCanvas;

    selectionSelector.hoverEnabled =
      !!usage.selectionSelector?.hover && layerIsActive;
    selectionSelector.selectEnabled =
      !!usage.selectionSelector?.select && layerIsActive;

    if (useAssistant) {
      selectionController.disabled = true;
    } else if (
      usage.selectionController &&
      "enabled" in usage.selectionController
    ) {
      selectionController.disabled =
        !usage.selectionController?.enabled && layerIsActive;
    } else {
      selectionController.disabled = !(
        usage.selectionController?.create ??
        usage.selectionController?.begin ??
        usage.selectionController?.abort ??
        usage.selectionController?.update
      );
    }

    if (!useAssistant) {
      assistedSelectionController.disabled = true;
    } else if (
      usage.assistedSelectionController &&
      "enabled" in usage.assistedSelectionController
    ) {
      assistedSelectionController.disabled =
        !usage.assistedSelectionController?.enabled && layerIsActive;
    } else {
      assistedSelectionController.disabled = !(
        usage.assistedSelectionController?.create ??
        usage.assistedSelectionController?.begin ??
        usage.assistedSelectionController?.abort ??
        usage.assistedSelectionController?.update
      );
    }

    for (const [type, curator] of Object.entries(
      selectionController.curators,
    )) {
      curator.enabled =
        action === "draw" &&
        type === drawMode &&
        layerIsActive &&
        !useAssistant;
    }

    assistedSelectionController.pointPrompter.enabled =
      action === "draw" && useAssistant && layerIsActive;

    if (usage.labelInspector && "enabled" in usage.labelInspector) {
      this.#selectionInspector.disabled = !usage.labelInspector?.enabled;
      this.#instanceInspector.disabled = !usage.labelInspector?.enabled;
    } else {
      this.#selectionInspector.disabled =
        !usage.labelInspector?.selectSelection;
      this.#instanceInspector.disabled = !usage.labelInspector?.selectInstance;
    }
  }

  /**
   * Sets the active state.
   * This is a no-op if the context is disabled.
   */
  #transition(stateFactory: () => InteractState<WM>): void {
    if (this.disabled) return;

    this.#currentState?.dispose();

    // We set it to `null` first so that events triggered by stateFactory
    // are not handled by the disposed state (instead, they are not handled at all)
    this.#currentState = null;

    this.#currentState = stateFactory();

    this.#renderState();

    this.dispatchEvent({
      type: "change",
      currentState: this.#currentState,
    });
  }

  /**
   * Transitions the state of this context to navigation.
   */
  transitionNavigate(): void {
    this.#transition(() => new NavigationState(this));
  }

  /**
   * Transitions the state of this context to selecting a selection.
   */
  transitionSelectSelection(): void {
    this.#transition(() => new SelectSelectionState(this));
  }

  /**
   * Transitions the state of this context to drawing a selection.
   */
  transitionDrawSelection(): void {
    this.#transition(
      () =>
        new DrawSelectionState(this, {
          instanceId: null,
          selectionId: null,
          promptedData: null,
        }),
    );
  }

  /**
   * Transitions the state of this context to editing some labels.
   */
  async transitionEdit({
    instanceId,
    selectionId,
    promptedData,
  }: EditStateParams): Promise<void> {
    this.#transition(
      () =>
        new DrawSelectionState(this, {
          instanceId: instanceId as string | null,
          selectionId: selectionId as string | null,
          promptedData: promptedData,
        }),
    );
  }

  /**
   * Transitions the state of this context to editing a selection.
   *
   * `selection` is the object the caller captured when the edit was
   * initiated. When provided, it guards against stale callbacks: a
   * selection captured against another revision of the labels must not
   * select or edit an object that merely reuses the id in the current
   * revision.
   */
  async transitionEditSelection({
    selectionId,
    promptedData,
    selection,
  }: {
    selectionId: UUID;
    promptedData: PromptedData | null;
    selection?: ReadonlyLabelSelection;
  }): Promise<void> {
    // The identity of the captured selection (not just its id) must
    // still resolve in the current labels before anything is looked up
    // or edited; the app may have navigated since the callback was
    // captured.
    if (
      selection != null &&
      (!this.dataView.hasLabelSelection(selectionId) ||
        this.dataView.getLabelSelection(selectionId) !== selection)
    )
      return;

    const target = selection ?? this.dataView.getLabelSelection(selectionId);
    const instanceId = target.entityId ?? null;

    const ctx = this.sceneContext;
    const targetTimestamp = target.timestamp;

    // This check is not required but it can avoid unnecessarily computing the path
    if (
      ctx.currentFrame != null &&
      !ctx.currentFrame.containsTimestamp(targetTimestamp)
    ) {
      await ctx.displayFrameFromCurrent({ tCenter: targetTimestamp });

      // The labels may have been (re)loaded while the navigation was in
      // flight; the captured callback is stale if the selection it
      // captured is no longer the one behind its id (e.g. the id was
      // reused by the new frame), and must not edit the new frame's
      // labels.
      if (
        !this.dataView.hasLabelSelection(selectionId) ||
        this.dataView.getLabelSelection(selectionId) !== target
      )
        return;
    }

    await this.transitionEdit({ instanceId, selectionId, promptedData });
  }
}
