import type { ReactNode } from "react";
import * as THREE from "three";

import type {
  SceneContext,
  SelectController,
  MainWindow,
} from "sta/app/editor";

import type {
  VectorTransformer,
  VectorTransformerEventMap,
} from "../controls/VectorTransformer.tsx";
import type {
  LabelVectorReformMonitor,
  VectorView,
  ReadonlyLabelVector,
  UUID,
} from "../data";
import type {
  LabelVectorClipboardEventMap,
  LabelVectorClipboard,
  VectorCreator,
  VectorCreatorEventMap,
  PolygonCreator,
  PolylineCreator,
  PointCreator,
} from "../tools";
import type {
  Action,
  DrawMode,
  LabelVectorInspectorEventMap,
} from "../widgets";
import { LabelVectorInspector } from "../widgets";
import { baseAction } from "../widgets/ActionPane.ts";

import { DrawVectorState } from "./DrawVectorState";
import { EditState } from "./EditVectorState";
import type { EditStateParams } from "./EditVectorState";
import type { InteractState } from "./InteractState";
import { SelectVectorState } from "./SelectVectorState";

// -- Exported type definitions (previously JSDoc-only) --

// A type alias, not an interface: the alias's implicit string index
// signature is what lets `WM extends MainWindowMapper` satisfy the
// WindowMapper (Record<string, SceneWindow>) constraints in this module.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type MainWindowMapper = { main: MainWindow };

/**
 * Defines each event that can be dispatched by {@link InteractContext}.
 */
export interface InteractContextEventMap<WM extends MainWindowMapper> {
  /** The event when the selected action changes. */
  "action-change": { type: "action-change" };
  /** The event when the selected draw mode changes. */
  "draw-mode-change": { type: "draw-mode-change" };
  /** The event when the active state has been changed. */
  change: { type: "change"; currentState: InteractState<WM> };
}

export interface MainWindowUsage {
  /**
   * The CSS class that sets the `cursor` property of the
   * main window (without the prefix `cursor-`).
   */
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

export interface VectorSelectorUsage {
  /** Whether the vector selector can hover over objects. */
  hover?: boolean;
  /**
   * Handles the event when a vector object is selected.
   * If not provided, the vector selector cannot select objects.
   */
  select?: (event: { object: ReadonlyLabelVector }) => void | Promise<void>;
}

export interface VectorCreatorUsage {
  /** Handles the event when a Vector has aborted being created. */
  abort?: (event: VectorCreatorEventMap["abort"]) => void;
  /** Handles the event when a Vector has finished being created. */
  finish?: (event: VectorCreatorEventMap["end"]) => void | Promise<void>;
}

export interface VectorTransformerUsage {
  /**
   * Whether the inspector is enabled. Defaults to `true` if
   * any event handler is set; otherwise, defaults to `false`.
   */
  enabled?: boolean;
  /** Handles the event when a vector object has begun to transformed. */
  begin?: (event: VectorTransformerEventMap["begin"]) => void;
  /** Handles the event when a vector object has aborted being transformed. */
  abort?: (event: VectorTransformerEventMap["abort"]) => void;
  /** Handles the event when a vector object has finished being transformed. */
  checkpoint?: (
    event: VectorTransformerEventMap["checkpoint"],
  ) => void | Promise<void>;
}

export interface LabelInspectorUsage {
  /**
   * Whether the inspector is enabled. Defaults to `true` if
   * any event handler is set; otherwise, defaults to `false`.
   */
  enabled?: boolean;
  /**
   * Handles the event when a vector object is selected through the inspector.
   */
  selectVector?: (
    event: LabelVectorInspectorEventMap["select-vector"],
  ) => void | Promise<void>;
}

export interface LabelClipboardUsage {
  /**
   * Whether the inspector is enabled. Defaults to `true` if
   * any event handler is set; otherwise, defaults to `false`.
   */
  enabled?: boolean;
  /** Handles the event when a vector object is pasted. */
  pasteVector?: (
    event: LabelVectorClipboardEventMap["paste"],
  ) => void | Promise<void>;
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
  /** Specifies the usage of the vector selector. */
  vectorSelector?: VectorSelectorUsage;
  /** specifies the usage of the vector creator. */
  vectorCreator?: VectorCreatorUsage;
  /** Specifies the usage of the vector transformer. */
  vectorTransformer?: VectorTransformerUsage;
  /** Specifies the usage of the label inspector. */
  labelInspector?: LabelInspectorUsage;
  /** Specifies the usage of the label clipboard. */
  labelClipboard?: LabelClipboardUsage;
}

export interface VectorCreators {
  polygon: PolygonCreator;
  polyline: PolylineCreator;
  point: PointCreator;
}

export interface StateContextParams<WM extends MainWindowMapper> {
  /** A handle to the state of the scene. */
  sceneContext: SceneContext<WM>;
  /** A view of the data to display in this layer. */
  dataView: VectorView;
  /**
   * The 2D canvas in the scene
   * where the drawing of vector object takes place.
   */
  canvas: HTMLCanvasElement;
  /** a set of tools to create vector object based on their type. */
  vectorCreators: VectorCreators;
  /** Interacts with the vertices of vector object. */
  vectorSelector: SelectController<ReadonlyLabelVector>;
  /** Transforms selected vertices of a vector object in the scene. */
  vectorTransformer: VectorTransformer;
  /** Monitors the changes on a vector object shape. */
  vectorMonitor: LabelVectorReformMonitor;
  /** Allows the user to copy and paste vector objects. */
  vectorClipboard: LabelVectorClipboard;
}

export type { InteractState };

/**
 * Contains the context to be referred to in each InteractState.
 */
export class InteractContext<
  WM extends MainWindowMapper,
> extends THREE.EventDispatcher<InteractContextEventMap<WM>> {
  /**
   * A handle to the state of the scene.
   */
  readonly sceneContext: SceneContext<WM>;

  get mainWindow(): MainWindow {
    return this.sceneContext.display.windows.main;
  }

  /**
   * whether the layer of this interact context
   * is active.
   */
  #layerIsActive = false;

  /**
   * `true` if the layer for this interact context is active.
   * otherwise; `flase`
   */
  get layerIsActive(): boolean {
    return this.#layerIsActive;
  }

  set layerIsActive(value) {
    if (this.#layerIsActive !== value) {
      this.#layerIsActive = value;

      // The usage of the current state depends on whether the layer
      // is active, so re-apply it right away.
      this.#applyUsage();
    }
  }

  readonly canvas: HTMLCanvasElement;

  /**
   * A view of the data to display in this layer.
   */
  dataView: VectorView;

  /**
   * a set of vector creators to draw specific vector type.
   */
  readonly vectorCreators: VectorCreators;

  #drawMode: DrawMode = "polyline";

  #drawModeSettings: { disabled: boolean; hidden: boolean } = {
    disabled: false,
    hidden: false,
  };

  get drawMode(): DrawMode {
    return this.#drawMode;
  }

  setDrawMode(mode: DrawMode) {
    if (this.#drawModeSettings.disabled || this.#drawMode === mode) return;
    this.#drawMode = mode;
    this.#updateDrawCreator();
    this.#notifyDrawModeChange();
  }

  cycleDrawMode() {
    const modes: DrawMode[] = ["polyline", "polygon", "point"];
    this.setDrawMode(modes[(modes.indexOf(this.#drawMode) + 1) % modes.length]);
  }

  #notifyDrawModeChange() {
    this.dispatchEvent({ type: "draw-mode-change" });
  }

  get action(): Action {
    return this.#action;
  }

  get activatedVectorCreator(): VectorCreator | null {
    return (
      Object.values(this.vectorCreators).find(
        (creator) => creator.enabled === true,
      ) ?? null
    );
  }

  /**
   * Interacts with the vertices of vector objects in the scene.
   */
  readonly vectorSelector: SelectController<ReadonlyLabelVector>;

  /**
   * Monitors the transform of the selected vector.
   */
  readonly vectorMonitor: LabelVectorReformMonitor;

  /**
   * Inspects selected vector objects in the scene.
   */
  readonly #vectorInspector: LabelVectorInspector;

  #unsubscribeInspectorEvents: (() => void)[] = [];

  get vectorInspector(): LabelVectorInspector {
    return this.#vectorInspector;
  }

  /**
   * The id of the vector inspected, or `null` if none is selected. Reads
   * the inspector coordinator rather than the pointer selector, so the
   * inspected vector survives leaving the edit state (e.g. the Escape
   * abort).
   */
  get selectedVectorId(): UUID | null {
    return this.#vectorInspector.selectedId;
  }

  /** Whether the draw-vector button of the vector inspector is active. */
  get drawVectorActive(): boolean {
    return this.#vectorInspector.drawVectorActive;
  }

  /** The exact disabled state of the vector inspector pane: usage-derived,
   * plus disabled while the labels are absent/loading. */
  get vectorInspectorDisabled(): boolean {
    return this.#vectorInspector.disabled || this.dataView.data == null;
  }

  /**
   * Transforms the vertices of the vectors in the scene.
   */
  readonly vectorTransformer: VectorTransformer;

  /**
   * Allows the user to copy and paste the vector objects.
   */
  readonly vectorClipboard: LabelVectorClipboard;

  #action: Action = "edit";

  #actionSettings: { disabled: boolean; hidden: boolean } = {
    disabled: false,
    hidden: false,
  };

  /**
   * The currently active state.
   */
  get currentState(): InteractState<WM> | null {
    return this.#currentState;
  }
  #currentState: InteractState<WM> | null = null;

  /**
   * `true` if all state transitions are disabled; otherwise, `false`.
   */
  get disabled(): boolean {
    return this.#actionSettings.disabled;
  }

  set disabled(value) {
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

  setAction(action: Action) {
    if (this.disabled || this.#action === action) return;
    this.#action = action;
    this.#notifyActionChange();
    this.#setStateFromAction(action);
  }

  toggleAction(action: Action) {
    this.setAction(this.#action === action ? baseAction : action);
  }

  toggleSelect() {
    this.toggleAction("select");
  }

  toggleDraw() {
    this.toggleAction("draw");
  }

  #notifyActionChange() {
    this.dispatchEvent({ type: "action-change" });
  }

  /**
   * Handles the event before the label data is loaded.
   */
  #onBeforeDataLoad = () => {
    this.currentState?.getUsage(this.#prevIsReadonly).data?.beforeLoad?.();

    this.#applyUsage();
  };

  /**
   * Handles the event after the label data is loaded.
   */
  #onAfterDataLoad = () => {
    this.currentState?.getUsage(this.#prevIsReadonly).data?.afterLoad?.();

    this.#applyUsage();
  };

  /**
   * Handles the event after a commit is applied to the label data.
   */
  #onEditBranch = () => {
    this.currentState?.getUsage(this.#prevIsReadonly).data?.branchEdit?.();

    this.#applyUsage();
  };

  /**
   * Handles the event when the pointer selects a vector object.
   */
  #onPointerSelectVector = (event: { object: ReadonlyLabelVector }) => {
    void this.currentState
      ?.getUsage(this.#prevIsReadonly)
      .vectorSelector?.select?.(event);
  };

  /**
   * Handles the event when a vector transform begins.
   */
  #onBeginTransformVector = (event: VectorTransformerEventMap["begin"]) => {
    this.currentState
      ?.getUsage(this.disabled)
      .vectorTransformer?.begin?.(event);

    this.#applyUsage();
  };

  /**
   * Handles the event when a vector transform is aborted.
   */
  #onAbortTransformVector = (event: VectorTransformerEventMap["abort"]) => {
    this.currentState
      ?.getUsage(this.disabled)
      .vectorTransformer?.abort?.(event);

    this.#applyUsage();
  };

  /**
   * Handles the event when a vector transform checkpoint is reached.
   */
  #onFinishTransformVector = (
    event: VectorTransformerEventMap["checkpoint"],
  ) => {
    void this.currentState
      ?.getUsage(this.disabled)
      .vectorTransformer?.checkpoint?.(event);

    this.#applyUsage();
  };

  /**
   * Handles the event when the user begins drawing a new vector object.
   */
  #onBeginCreateVector = (_event: VectorCreatorEventMap["begin"]) => {
    this.#applyUsage();
  };

  /**
   * Handles the event when the user has cancelled drawing a new vector object.
   */
  #onAbortCreateVector = (event: VectorCreatorEventMap["abort"]) => {
    this.currentState?.getUsage(this.disabled).vectorCreator?.abort?.(event);

    this.#applyUsage();
  };

  /**
   * Handles the event when the user has finished drawing a new vector object.
   */
  #onFinishCreateVector = (event: VectorCreatorEventMap["end"]) => {
    void this.currentState
      ?.getUsage(this.disabled)
      .vectorCreator?.finish?.(event);

    this.#applyUsage();
  };

  /**
   * Handles the event when the inspector selects a vector object.
   */
  #onInspectorSelectVector = (
    event: LabelVectorInspectorEventMap["select-vector"],
  ) => {
    void this.currentState
      ?.getUsage(this.disabled)
      .labelInspector?.selectVector?.(event);
  };

  /**
   * Handles the event when the inspector toggles the draw vector button.
   */
  #onInspectorToggleDrawVector = (
    _event: LabelVectorInspectorEventMap["toggle-drawVector"],
  ) => {
    this.toggleDraw();
  };

  /**
   * Handles the event when a vector object has been pasted.
   */
  #onPasteVector = (event: LabelVectorClipboardEventMap["paste"]) => {
    void this.currentState
      ?.getUsage(this.disabled)
      .labelClipboard?.pasteVector?.(event);
  };

  /**
   * Handles the event when the view mode is changed.
   */
  #onViewModeChange = () => {
    const { mainWindow, vectorTransformer } = this;
    const { viewMode } = mainWindow;

    if (viewMode === "2D") {
      vectorTransformer.disableMoveXZ = false;
      vectorTransformer.disableMoveY = true;
    } else if (viewMode === "3D") {
      vectorTransformer.disableMoveXZ = true;
      vectorTransformer.disableMoveY = false;
    }

    this.#applyUsage();
  };

  #updateDrawCreator = () => {
    for (const [type, creator] of Object.entries(this.vectorCreators)) {
      creator.enabled = this.action === "draw" && type === this.#drawMode;
    }
  };

  /**
   * Updates the current dtate based on the selected action.
   */
  #setStateFromAction = (action: Action) => {
    const { currentState } = this;

    switch (action) {
      case "draw":
        if (!(currentState instanceof DrawVectorState)) {
          this.transitionDrawVector();
        }
        break;
      case "select":
        if (!(currentState instanceof SelectVectorState)) {
          this.transitionSelectVector();
        }
        break;
      case "edit":
        if (!(currentState instanceof EditState)) {
          this.transitionNavigate();
        }
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    this.#renderState();
  };

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
  #renderState = () => {
    const { currentState } = this;
    let action: Action;

    if (currentState == null || currentState instanceof EditState) {
      action = "edit";
    } else if (currentState instanceof SelectVectorState) {
      action = "select";
    } else if (currentState instanceof DrawVectorState) {
      action = "draw";
    } else {
      throw new Error(`Unhandled state type: ${JSON.stringify(currentState)}`);
    }

    const actionChanged = this.#action !== action;
    this.#action = action;

    this.#vectorInspector.drawVectorActive =
      currentState instanceof DrawVectorState;
    this.#updateDrawCreator();

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
    this.vectorCreators = params.vectorCreators;
    this.vectorSelector = params.vectorSelector;
    this.vectorTransformer = params.vectorTransformer;
    this.vectorMonitor = params.vectorMonitor;
    this.vectorClipboard = params.vectorClipboard;
    this.#updateDrawCreator();

    // The context owns the inspector so its state stays imperative and
    // survives independently of the React tree; the inspector pane reads
    // the editor state snapshot and writes back through intents.
    this.#vectorInspector = new LabelVectorInspector({
      labelsView: params.dataView,
    });

    this.dataView.addEventListener("beforeload", this.#onBeforeDataLoad);
    this.dataView.addEventListener("afterload", this.#onAfterDataLoad);
    this.dataView.context.addEventListener("edit-branch", this.#onEditBranch);

    const vectorCreators = Object.values(
      this.vectorCreators,
    ) as readonly THREE.EventDispatcher<VectorCreatorEventMap>[];
    for (const creator of vectorCreators) {
      creator.addEventListener("begin", this.#onBeginCreateVector);
      creator.addEventListener("abort", this.#onAbortCreateVector);
      creator.addEventListener("end", this.#onFinishCreateVector);
    }

    this.vectorSelector.addEventListener(
      "selectin",
      this.#onPointerSelectVector,
    );

    this.vectorTransformer.addEventListener(
      "begin",
      this.#onBeginTransformVector,
    );
    this.vectorTransformer.addEventListener(
      "abort",
      this.#onAbortTransformVector,
    );
    this.vectorTransformer.addEventListener(
      "checkpoint",
      this.#onFinishTransformVector,
    );

    this.vectorClipboard.addEventListener("paste", this.#onPasteVector);

    this.mainWindow.addEventListener("viewMode-change", this.#onViewModeChange);

    // The usage of the current state is applied in response to the
    // events that can change it, rather than during each animation
    // frame. Each of these events can change the cursor, the camera
    // controls, or the enabled status of a component.
    this.addEventListener("action-change", this.#applyUsage);
    this.addEventListener("draw-mode-change", this.#applyUsage);
    this.addEventListener("change", this.#applyUsage);

    const vectorInspector = this.#vectorInspector;
    vectorInspector.addEventListener(
      "select-vector",
      this.#onInspectorSelectVector,
    );
    vectorInspector.addEventListener(
      "toggle-drawVector",
      this.#onInspectorToggleDrawVector,
    );
    this.#unsubscribeInspectorEvents = [
      () =>
        vectorInspector.removeEventListener(
          "select-vector",
          this.#onInspectorSelectVector,
        ),
      () =>
        vectorInspector.removeEventListener(
          "toggle-drawVector",
          this.#onInspectorToggleDrawVector,
        ),
    ];

    // The state machine is started by the layer's initial `disabled =
    // true` assignment, which it makes AFTER attaching its `change`
    // listener, so the initial state update (controls, keybinds) is
    // not lost on a listener that does not exist yet.

    // Apply the usage once so that the components start in the
    // correct state even before any event has been dispatched.
    this.#applyUsage();
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose() {
    this.dataView.removeEventListener("beforeload", this.#onBeforeDataLoad);
    this.dataView.removeEventListener("afterload", this.#onAfterDataLoad);
    this.dataView.context.removeEventListener(
      "edit-branch",
      this.#onEditBranch,
    );

    const vectorCreators = Object.values(
      this.vectorCreators,
    ) as readonly THREE.EventDispatcher<VectorCreatorEventMap>[];
    for (const creator of vectorCreators) {
      creator.removeEventListener("begin", this.#onBeginCreateVector);
      creator.removeEventListener("abort", this.#onAbortCreateVector);
      creator.removeEventListener("end", this.#onFinishCreateVector);
    }

    this.vectorSelector.removeEventListener(
      "selectin",
      this.#onPointerSelectVector,
    );

    this.vectorTransformer.removeEventListener(
      "begin",
      this.#onBeginTransformVector,
    );
    this.vectorTransformer.removeEventListener(
      "abort",
      this.#onAbortTransformVector,
    );
    this.vectorTransformer.removeEventListener(
      "checkpoint",
      this.#onFinishTransformVector,
    );

    // Detach the inspector event handlers before disposing the
    // inspector itself, exactly once.
    for (const unsubscribe of this.#unsubscribeInspectorEvents) unsubscribe();
    this.#unsubscribeInspectorEvents = [];
    this.#vectorInspector.dispose();
    this.vectorMonitor.dispose();

    this.vectorClipboard.removeEventListener("paste", this.#onPasteVector);

    this.mainWindow.removeEventListener(
      "viewMode-change",
      this.#onViewModeChange,
    );

    this.removeEventListener("action-change", this.#applyUsage);
    this.removeEventListener("draw-mode-change", this.#applyUsage);
    this.removeEventListener("change", this.#applyUsage);
  }

  /**
   * The value of `disabled` in the most recent call to
   * {@link InteractContext.#applyUsage}.
   */
  #prevIsReadonly = false;

  /**
   * Applies the usage of the current state to this context, updating
   * the cursor, the camera controls, and the enabled status of each
   * component.
   *
   * This is not called during each animation frame; instead, it runs
   * once at construction and whenever an event can change the usage
   * of the current state (see the subscriptions in the constructor).
   */
  #applyUsage = () => {
    const { currentState, layerIsActive } = this;

    if (currentState == null) return;

    const usage = currentState.getUsage(this.disabled);

    if (layerIsActive) {
      this.mainWindow.enableCameraControls = !!usage.mainWindow?.controlCamera;
    }

    this.#updateCursor(usage);
    this.#updateEnabled(usage);

    this.#prevIsReadonly = this.disabled;
  };

  #prevCursorClassWithPrefix = "";

  /**
   * Updates the cursor that is displayed when hovered over the main window.
   *
   * @param usage Specifies how the context is used.
   */
  #updateCursor(usage: InteractContextUsage) {
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
   *
   * @param usage Specifies how the context is used.
   */
  #updateEnabled(usage: InteractContextUsage) {
    const {
      layerIsActive,
      drawMode,
      action,
      canvas,
      vectorCreators,
      vectorTransformer,
      vectorSelector,
      vectorClipboard,
    } = this;

    canvas.hidden = !!usage.mainWindow?.hiddenCanvas;

    vectorSelector.hoverEnabled =
      !!usage.vectorSelector?.hover && layerIsActive;
    vectorSelector.selectEnabled =
      !!usage.vectorSelector?.select && layerIsActive;

    for (const [type, creator] of Object.entries(vectorCreators)) {
      creator.enabled = action === "draw" && type === drawMode && layerIsActive;
    }

    if (usage.vectorTransformer && "enabled" in usage.vectorTransformer) {
      vectorTransformer.disabled = !usage.vectorTransformer.enabled;
    } else {
      vectorTransformer.disabled = !(
        usage.vectorTransformer?.begin ??
        usage.vectorTransformer?.abort ??
        usage.vectorTransformer?.checkpoint
      );
    }

    if (usage.labelInspector && "enabled" in usage.labelInspector) {
      this.#vectorInspector.disabled = !usage.labelInspector.enabled;
    } else {
      this.#vectorInspector.disabled = !usage.labelInspector?.selectVector;
    }

    if (usage.labelClipboard && "enabled" in usage.labelClipboard) {
      vectorClipboard.disabled = !usage.labelClipboard.enabled;
    } else {
      vectorClipboard.disabled = !usage.labelClipboard?.pasteVector;
    }
  }

  /**
   * Sets the active state.
   * This is a no-op if the context is disabled.
   *
   * @param stateFactory Lazily constructs the state to set.
   */
  #transition(stateFactory: () => InteractState<WM>) {
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
  transitionNavigate() {
    this.#transition(() => new EditState(this, { vectorId: null }));
  }

  /**
   * Transitions the state of this context to selecting a vector object.
   */
  transitionSelectVector() {
    this.#transition(() => new SelectVectorState(this));
  }

  /**
   * Transitions the state of this context to editing some labels.
   *
   * @param params The parameters of the new state.
   */
  transitionEdit({ vectorId }: EditStateParams) {
    this.#transition(() => new EditState(this, { vectorId }));
  }

  /**
   * Transitions the state of this context to drawing a vector object.
   */
  transitionDrawVector() {
    this.#transition(() => new DrawVectorState(this));
  }

  /**
   * Transitions the state of this context to editing a vector object.
   *
   * `vector` is the object the caller captured when the edit was
   * initiated. When provided, it guards against stale callbacks: a
   * selection captured against another revision of the labels must not
   * select or edit an object that merely reuses the id in the current
   * revision.
   */
  async transitionEditVector({
    vectorId,
    vector,
  }: {
    vectorId: UUID;
    vector?: ReadonlyLabelVector;
  }) {
    // The identity of the captured vector (not just its id) must still
    // resolve in the current labels before anything is looked up or
    // edited; the app may have navigated since the callback was captured.
    if (
      vector != null &&
      (!this.dataView.hasLabelVector(vectorId) ||
        this.dataView.getLabelVector(vectorId) !== vector)
    )
      return;

    const target = vector ?? this.dataView.getLabelVector(vectorId);
    const ctx = this.sceneContext;
    const targetTimestamp = target.timestamp;

    // This check is not required but it can avoid unnecessarily computing the path
    if (
      ctx.currentFrame != null &&
      !ctx.currentFrame.containsTimestamp(targetTimestamp)
    ) {
      await ctx.displayFrameFromCurrent({ tCenter: targetTimestamp });

      // The labels may have been (re)loaded while the navigation was in
      // flight; the captured callback is stale if the vector it
      // captured is no longer the one behind its id (e.g. the id was
      // reused by the new frame), and must not edit the new frame's
      // labels.
      if (
        !this.dataView.hasLabelVector(vectorId) ||
        this.dataView.getLabelVector(vectorId) !== target
      )
        return;
    }

    this.transitionEdit({ vectorId });
  }
}
