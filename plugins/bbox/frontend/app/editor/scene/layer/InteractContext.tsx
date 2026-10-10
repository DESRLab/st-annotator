import type { ReactNode } from "react";
import type { Transformer } from "sta-gmesh/app";
import * as THREE from "three";

import type {
  SceneContext,
  ScenePointerEvent,
  SelectorEventMap,
  Selector,
  MainWindow,
} from "sta/app/editor";

import type {
  LabelBoxTransformMonitor,
  BBoxView,
  ReadonlyLabelBox,
  UUID,
} from "../data";
import type {
  LabelBoxClipboard,
  LabelBoxCreator,
  LabelBoxCreatorEventMap,
  BoxClipboardData,
  LabelBoxClipboardEventMap,
} from "../tools";
import type {
  Action,
  LabelBoxInspectorEventMap,
  LabelTrackInspectorEventMap,
  LabelTrackInspectorHandle,
} from "../widgets";
import { LabelBoxInspector, createLabelTrackInspector } from "../widgets";
import { baseAction } from "../widgets/ActionPane.ts";
import type { DrawMode } from "../widgets/DrawModePane.react.tsx";

import { DrawBoxState } from "./DrawBoxState";
import { EditState } from "./EditState";
import type { EditStateParams } from "./EditState";
import type { InteractState } from "./InteractState";
import { SelectBoxState } from "./SelectBoxState";

// The Transformer type is imported type-only so that no runtime dependency
// on sta-gmesh is introduced. Event shapes are defined locally below.

type TransformerInstance<T> = Transformer<T>;
interface TransformerBeginEvent<T> {
  obj: T;
}
interface TransformerAbortEvent<T> {
  obj: T;
}
interface TransformerCheckpointEvent<T> {
  obj: T;
  mode: string;
  prevTransform: {
    position: THREE.Vector3;
    rotation: THREE.Euler;
    scale: THREE.Vector3;
  };
}

// A type alias, not an interface: the alias's implicit string index
// signature is what lets `WM extends MainWindowMapper` satisfy the
// WindowMapper (Record<string, SceneWindow>) constraints in this module.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type MainWindowMapper = { main: MainWindow };

export interface StateContextParams<WM extends MainWindowMapper> {
  /** A handle to the state of the scene. */
  sceneContext: SceneContext<WM>;
  /** A view of the data to display in this layer. */
  dataView: BBoxView;
  /** Creates bounding boxes in the scene. */
  boxCreator: LabelBoxCreator;
  /** Interacts with the vertices of the paths of
   * the labelled objects in the scene, i.e., the centers of the corresponding bounding boxes. */
  boxSelector: Selector<ReadonlyLabelBox>;
  /** Transforms selected boxes in the scene. */
  boxTransformer: TransformerInstance<ReadonlyLabelBox>;
  /** Monitors the transform of the selected box. */
  boxMonitor: LabelBoxTransformMonitor;
  /** Allows the user to copy and paste bounding boxes. */
  boxClipboard: LabelBoxClipboard;
  /** Whether tracks are managed automatically (one box each). Layer
   * configuration, injected explicitly so the inspectors have it while
   * data is absent or loading. */
  autoTracks: boolean;
}

export interface MainWindowUsage {
  /** The CSS class that sets the `cursor` property of the
   * main window (without the prefix `cursor-`). */
  cursorClass?: string;
  /** Whether the controls of the camera are enabled. */
  controlCamera?: boolean;
  /** Handles the event when the pointer is activated on the main window. */
  pointerdown?: (event: ScenePointerEvent) => void;
  /** Handles the event when the pointer is released on the main window. */
  pointerup?: (event: ScenePointerEvent) => void;
}

export interface LabelDataUsage {
  /** Handles the event before the data is (un)loaded. */
  beforeLoad?: () => void;
  /** Handles the event after the data is (un)loaded. */
  afterLoad?: () => void;
  /** Handles the event after the branch has been edited. */
  branchEdit?: () => void;
}

export interface BoxSelectorUsage {
  /** Whether the box selector can hover over objects. */
  hover?: boolean;
  /** Handles the event when a bounding box is selected.
   * If not provided, the box selector cannot select objects. */
  select?: (event: SelectorEventMap<ReadonlyLabelBox>["selectin"]) => void;
}

export interface BoxCreatorUsage {
  /** Whether the inspector is enabled. Defaults to `true` if
   * any event handler is set; otherwise, defaults to `false`. */
  enabled?: boolean;
  /** Handles the event when a bounding box has begun to be created. */
  begin?: (event: LabelBoxCreatorEventMap["begin"]) => void;
  /** Handles the event when a bounding box has aborted being created. */
  abort?: (event: LabelBoxCreatorEventMap["abort"]) => void;
  /** Handles the event when a bounding box has finished being created. */
  finish?: (event: LabelBoxCreatorEventMap["end"]) => void;
}

export interface BoxTransformerUsage {
  /** Whether the inspector is enabled. Defaults to `true` if
   * any event handler is set; otherwise, defaults to `false`. */
  enabled?: boolean;
  /** Handles the event when a bounding box has begun to be transformed. */
  begin?: (event: TransformerBeginEvent<ReadonlyLabelBox>) => void;
  /** Handles the event when a bounding box has aborted being transformed. */
  abort?: (event: TransformerAbortEvent<ReadonlyLabelBox>) => void;
  /** Handles the event when a bounding box has finished being transformed. */
  checkpoint?: (event: TransformerCheckpointEvent<ReadonlyLabelBox>) => void;
}

export interface LabelInspectorUsage {
  /** Whether the inspector is enabled. Defaults to `true` if
   * any event handler is set; otherwise, defaults to `false`. */
  enabled?: boolean;
  /** Handles the event when an object track is selected through the inspector. */
  selectTrack?: (event: LabelTrackInspectorEventMap["select-track"]) => void;
  /** Handles the event when a bounding box is selected through the inspector. */
  selectBox?: (event: LabelBoxInspectorEventMap["select-box"]) => void;
}

export interface LabelClipboardUsage {
  /** Whether the inspector is enabled. Defaults to `true` if
   * any event handler is set; otherwise, defaults to `false`. */
  enabled?: boolean;
  /** Handles the event when a bounding box is pasted. */
  pasteBox?: (
    event: LabelBoxClipboardEventMap<BoxClipboardData>["paste"],
  ) => void;
}

/** Omitting a component indicates that it is unused;
 * this automatically disables it within the context (if possible). */
export interface InteractContextUsage {
  /** Specifies the usage of the main window. */
  mainWindow?: MainWindowUsage;
  /** Specifies the usage of the labels. */
  data?: LabelDataUsage;
  /** Specifies the usage of the box selector. */
  boxSelector?: BoxSelectorUsage;
  /** Specifies the usage of the box creator. */
  boxCreator?: BoxCreatorUsage;
  /** Specifies the usage of the box transformer. */
  boxTransformer?: BoxTransformerUsage;
  /** Specifies the usage of the label inspector. */
  labelInspector?: LabelInspectorUsage;
  /** Specifies the usage of the label clipboard. */
  labelClipboard?: LabelClipboardUsage;
}

/** Defines each event that can be dispatched by {@link InteractContext}. */
export interface InteractContextEventMap<WM extends MainWindowMapper> {
  /** The event when the selected action changes. */
  "action-change": { type: "action-change" };
  /** The event when the selected draw mode changes. */
  "draw-mode-change": { type: "draw-mode-change" };
  /** The event when the active state has been changed. */
  change: { currentState: InteractState<WM> };
}

/** Contains the context to be referred to in each {@link InteractState}. */
export class InteractContext<
  WM extends MainWindowMapper,
> extends THREE.EventDispatcher<InteractContextEventMap<WM>> {
  /** A handle to the state of the scene. */
  readonly sceneContext: SceneContext<WM>;

  get mainWindow(): MainWindow {
    return this.sceneContext.display.windows.main;
  }

  /** A view of the data to display in this layer. */
  readonly dataView: BBoxView;

  /** Creates bounding boxes in the scene. */
  readonly boxCreator: LabelBoxCreator;

  #drawMode: DrawMode = "corner2corner";

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
    this.#notifyDrawModeChange();
  }

  cycleDrawMode(): void {
    this.setDrawMode(
      this.#drawMode === "corner2corner" ? "center2front" : "corner2corner",
    );
  }

  #notifyDrawModeChange(): void {
    this.dispatchEvent({ type: "draw-mode-change" });
  }

  /** Interacts with the vertices of the paths of the labelled objects in the scene,
   * i.e., the centers of the corresponding bounding boxes. */
  readonly boxSelector: Selector<ReadonlyLabelBox>;

  /** Monitors the transform of the selected box. */
  readonly boxMonitor: LabelBoxTransformMonitor;

  /** Inspects selected object tracks in the scene. */
  readonly #trackInspector: LabelTrackInspectorHandle;

  /** Inspects selected bounding boxes in the scene. */
  readonly #boxInspector: LabelBoxInspector;

  #unsubscribeInspectorEvents: (() => void)[] = [];

  get trackInspector(): LabelTrackInspectorHandle {
    return this.#trackInspector;
  }

  get boxInspector(): LabelBoxInspector {
    return this.#boxInspector;
  }

  /**
   * The id of the track being edited, or `null` outside the edit state
   * (navigation/select/draw). Reads the live state machine, so it never
   * exposes a stale prior edit-state value.
   */
  get selectedTrackId(): UUID | null {
    const state = this.#currentState;
    return state instanceof EditState ? state.params.trackId : null;
  }

  /**
   * The id of the box inspected, or `null` if none is selected. Reads the
   * inspector coordinator rather than the pointer selector, so the
   * inspected box survives leaving the edit state (e.g. the Escape abort).
   */
  get selectedBoxId(): UUID | null {
    return this.#boxInspector.selectedId;
  }

  /** Whether the draw-box button of the box inspector is active. */
  get drawBoxActive(): boolean {
    return this.#boxInspector.drawBoxActive;
  }

  /** The exact disabled state of the box inspector pane: usage-derived,
   * plus disabled while the labels are absent/loading. */
  get boxInspectorDisabled(): boolean {
    return this.#boxInspector.disabled || this.dataView.data == null;
  }

  /** The exact disabled state of the track inspector pane: usage-derived,
   * plus disabled while the labels are absent/loading. */
  get trackInspectorDisabled(): boolean {
    return this.#trackInspector.disabled || this.dataView.data == null;
  }

  /** Transforms selected boxes in the scene. */
  readonly boxTransformer: TransformerInstance<ReadonlyLabelBox>;

  /** Allows the user to copy and paste bounding boxes. */
  readonly boxClipboard: LabelBoxClipboard;

  #action: Action = "edit";

  #actionSettings: { disabled: boolean; hidden: boolean } = {
    disabled: false,
    hidden: false,
  };

  /** The selected interaction action. */
  get action(): Action {
    return this.#action;
  }

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

  /** Handles the event when the pointer is activated on the main window. */
  #onPointerDown = (event: ScenePointerEvent): void => {
    this.currentState?.getUsage(this.disabled).mainWindow?.pointerdown?.(event);
  };

  /** Handles the event when the pointer is released on the main window. */
  #onPointerUp = (event: ScenePointerEvent): void => {
    this.currentState?.getUsage(this.disabled).mainWindow?.pointerup?.(event);
  };

  /** Handles the event before the label data is loaded. */
  #onBeforeDataLoad = (): void => {
    this.currentState?.getUsage(this.disabled).data?.beforeLoad?.();
    this.#refreshUsage();
  };

  /** Handles the event after the label data is loaded. */
  #onAfterDataLoad = (): void => {
    this.currentState?.getUsage(this.disabled).data?.afterLoad?.();
    this.#refreshUsage();
  };

  /** Handles the event after a commit is applied to the label data. */
  #onEditBranch = (): void => {
    this.currentState?.getUsage(this.disabled).data?.branchEdit?.();
    this.#refreshUsage();
  };

  /** Handles the event when the user has begun drawing a new bounding box. */
  #onBeginCreateBox = (event: LabelBoxCreatorEventMap["begin"]): void => {
    this.currentState?.getUsage(this.disabled).boxCreator?.begin?.(event);
    this.#refreshUsage();
  };

  /** Handles the event when the user has cancelled drawing a new bounding box. */
  #onAbortCreateBox = (event: LabelBoxCreatorEventMap["abort"]): void => {
    this.currentState?.getUsage(this.disabled).boxCreator?.abort?.(event);
    this.#refreshUsage();
  };

  /** Handles the event when the user has finished drawing a new bounding box. */
  #onFinishCreateBox = (event: LabelBoxCreatorEventMap["end"]): void => {
    this.currentState?.getUsage(this.disabled).boxCreator?.finish?.(event);
    this.#refreshUsage();
  };

  /** Handles the event when the pointer selects a bounding box. */
  #onPointerSelectBox = (
    event: SelectorEventMap<ReadonlyLabelBox>["selectin"],
  ): void => {
    this.currentState?.getUsage(this.disabled).boxSelector?.select?.(event);
  };

  /** Handles the event when the bounding box has begun transforming. */
  #onBeginTransformBox = (
    event: TransformerBeginEvent<ReadonlyLabelBox>,
  ): void => {
    this.currentState?.getUsage(this.disabled).boxTransformer?.begin?.(event);
    this.#refreshUsage();
  };

  /** Handles the event when the bounding box has aborted transforming. */
  #onAbortTransformBox = (
    event: TransformerAbortEvent<ReadonlyLabelBox>,
  ): void => {
    this.currentState?.getUsage(this.disabled).boxTransformer?.abort?.(event);
    this.#refreshUsage();
  };

  /** Handles the event when the bounding box has finished transforming. */
  #onFinishTransformBox = (
    event: TransformerCheckpointEvent<ReadonlyLabelBox>,
  ): void => {
    this.currentState
      ?.getUsage(this.disabled)
      .boxTransformer?.checkpoint?.(event);
    this.#refreshUsage();
  };

  /** Handles the event when the inspector selects an object track. */
  #onInspectorSelectTrack = (
    event: LabelTrackInspectorEventMap["select-track"],
  ): void => {
    this.currentState
      ?.getUsage(this.disabled)
      .labelInspector?.selectTrack?.(event);
  };

  /** Handles the event when the inspector selects a bounding box. */
  #onInspectorSelectBox = (
    event: LabelBoxInspectorEventMap["select-box"],
  ): void => {
    this.currentState
      ?.getUsage(this.disabled)
      .labelInspector?.selectBox?.(event);
  };

  /** Handles the event when the inspector toggles the draw box button. */
  #onInspectorToggleDrawBox = (
    _event: LabelBoxInspectorEventMap["toggle-drawBox"],
  ): void => {
    this.toggleDraw();
  };

  /** Handles the event when a bounding box has been pasted. */
  #onPasteBox = (
    event: LabelBoxClipboardEventMap<BoxClipboardData>["paste"],
  ): void => {
    this.currentState
      ?.getUsage(this.disabled)
      .labelClipboard?.pasteBox?.(event);
  };

  /** Handles the event when the view mode is changed. */
  #onViewModeChange = (): void => {
    const { mainWindow, boxTransformer } = this;
    const { viewMode } = mainWindow;

    if (viewMode === "2D") {
      boxTransformer.disableMoveXZ = false;
      boxTransformer.disableMoveResizeY = true;
      boxTransformer.disablePlaneResize = false;
    } else if (viewMode === "3D") {
      boxTransformer.disableMoveXZ = true;
      boxTransformer.disableMoveResizeY = false;
      boxTransformer.disablePlaneResize = true;
    }

    this.#refreshUsage();
  };

  /** Updates the current state based on the selected action. */
  #setStateFromAction = (action: Action): void => {
    const { currentState } = this;

    switch (action) {
      // These instanceof checks prevent infinite loop when #renderState is called
      case "edit":
        if (!(currentState instanceof EditState)) {
          this.transitionNavigate();
        }
        break;
      case "select":
        if (!(currentState instanceof SelectBoxState)) {
          this.transitionSelectBox();
        }
        break;
      case "draw":
        if (!(currentState instanceof DrawBoxState)) {
          this.transitionDrawBox();
        }
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    this.#renderState();
  };

  /** Updates the selected action based on the current state. */
  #renderState = (): void => {
    const { currentState } = this;
    let action: Action;

    if (currentState == null || currentState instanceof EditState) {
      action = "edit";
    } else if (currentState instanceof SelectBoxState) {
      action = "select";
    } else if (currentState instanceof DrawBoxState) {
      action = "draw";
    } else {
      throw new Error(`Unhandled state type: ${JSON.stringify(currentState)}`);
    }

    this.#boxInspector.drawBoxActive = currentState instanceof DrawBoxState;

    if (this.#action !== action) {
      this.#action = action;
      this.#notifyActionChange();
    }
  };

  /** Creates a new context. */
  constructor(params: StateContextParams<WM>) {
    super();

    this.sceneContext = params.sceneContext;
    this.dataView = params.dataView;
    this.boxCreator = params.boxCreator;
    this.boxSelector = params.boxSelector;
    this.boxTransformer = params.boxTransformer;
    this.boxMonitor = params.boxMonitor;
    this.boxClipboard = params.boxClipboard;

    // The context owns the inspectors so their state stays imperative and
    // survives independently of the React tree; the inspector panes read
    // the editor state snapshot and write back through intents.
    this.#boxInspector = new LabelBoxInspector({
      labelsView: params.dataView,
      autoTracks: params.autoTracks,
    });
    this.#trackInspector = createLabelTrackInspector({
      labelsView: params.dataView,
    });

    this.mainWindow.pointerEvents.addEventListener(
      "pointerdown",
      this.#onPointerDown,
    );
    this.mainWindow.pointerEvents.addEventListener(
      "pointerup",
      this.#onPointerUp,
    );

    this.dataView.addEventListener("beforeload", this.#onBeforeDataLoad);
    this.dataView.addEventListener("afterload", this.#onAfterDataLoad);
    this.dataView.context.addEventListener("edit-branch", this.#onEditBranch);

    this.boxCreator.addEventListener("begin", this.#onBeginCreateBox);
    this.boxCreator.addEventListener("abort", this.#onAbortCreateBox);
    this.boxCreator.addEventListener("end", this.#onFinishCreateBox);

    this.boxTransformer.addEventListener("begin", this.#onBeginTransformBox);
    this.boxTransformer.addEventListener("abort", this.#onAbortTransformBox);
    this.boxTransformer.addEventListener(
      "checkpoint",
      this.#onFinishTransformBox,
    );

    this.boxSelector.addEventListener("selectin", this.#onPointerSelectBox);
    // The cursor of the draw state depends on whether a box is hovered
    this.boxSelector.addEventListener("hoverin", this.#refreshUsage);
    this.boxSelector.addEventListener("hoverout", this.#refreshUsage);

    this.boxClipboard.addEventListener("paste", this.#onPasteBox);

    this.mainWindow.addEventListener("viewMode-change", this.#onViewModeChange);

    // These events can change the usage of the current state
    this.addEventListener("action-change", this.#refreshUsage);
    this.addEventListener("draw-mode-change", this.#refreshUsage);
    this.addEventListener("change", this.#refreshUsage);

    this.#onViewModeChange();

    const boxInspector = this.#boxInspector;
    const trackInspector = this.#trackInspector;
    boxInspector.addEventListener("select-box", this.#onInspectorSelectBox);
    boxInspector.addEventListener(
      "toggle-drawBox",
      this.#onInspectorToggleDrawBox,
    );
    boxInspector.addEventListener("select-track", this.#onInspectorSelectTrack);
    // The cursor of the draw state depends on the box type in the inspector
    boxInspector.addEventListener("change", this.#refreshUsage);
    trackInspector.addEventListener(
      "select-track",
      this.#onInspectorSelectTrack,
    );
    this.#unsubscribeInspectorEvents = [
      () =>
        boxInspector.removeEventListener(
          "select-box",
          this.#onInspectorSelectBox,
        ),
      () =>
        boxInspector.removeEventListener(
          "toggle-drawBox",
          this.#onInspectorToggleDrawBox,
        ),
      () =>
        boxInspector.removeEventListener(
          "select-track",
          this.#onInspectorSelectTrack,
        ),
      () => boxInspector.removeEventListener("change", this.#refreshUsage),
      () =>
        trackInspector.removeEventListener(
          "select-track",
          this.#onInspectorSelectTrack,
        ),
    ];

    // The state machine is started by the layer's initial `disabled =
    // true` assignment, which it makes AFTER attaching its `change`
    // listener, so the initial state update (controls, keybinds) is
    // not lost on a listener that does not exist yet.
  }

  /** Disposes of this object. Do not use it afterwards. */
  dispose(): void {
    this.mainWindow.pointerEvents.removeEventListener(
      "pointerdown",
      this.#onPointerDown,
    );
    this.mainWindow.pointerEvents.removeEventListener(
      "pointerup",
      this.#onPointerUp,
    );

    this.dataView.removeEventListener("beforeload", this.#onBeforeDataLoad);
    this.dataView.removeEventListener("afterload", this.#onAfterDataLoad);
    this.dataView.context.removeEventListener(
      "edit-branch",
      this.#onEditBranch,
    );

    this.boxCreator.removeEventListener("begin", this.#onBeginCreateBox);
    this.boxCreator.removeEventListener("abort", this.#onAbortCreateBox);
    this.boxCreator.removeEventListener("end", this.#onFinishCreateBox);

    this.boxTransformer.removeEventListener("begin", this.#onBeginTransformBox);
    this.boxTransformer.removeEventListener("abort", this.#onAbortTransformBox);
    this.boxTransformer.removeEventListener(
      "checkpoint",
      this.#onFinishTransformBox,
    );

    this.boxSelector.removeEventListener("selectin", this.#onPointerSelectBox);
    this.boxSelector.removeEventListener("hoverin", this.#refreshUsage);
    this.boxSelector.removeEventListener("hoverout", this.#refreshUsage);

    // Detach the inspector event handlers before disposing the
    // inspectors themselves, exactly once.
    for (const unsubscribe of this.#unsubscribeInspectorEvents) unsubscribe();
    this.#unsubscribeInspectorEvents = [];
    this.#boxInspector.dispose();
    this.#trackInspector.dispose();

    this.boxClipboard.removeEventListener("paste", this.#onPasteBox);

    this.mainWindow.removeEventListener(
      "viewMode-change",
      this.#onViewModeChange,
    );

    this.removeEventListener("action-change", this.#refreshUsage);
    this.removeEventListener("draw-mode-change", this.#refreshUsage);
    this.removeEventListener("change", this.#refreshUsage);
  }

  /** Gets the content to display as a hint to the user when this layer is active. */
  getHint(): ReactNode {
    return this.currentState?.getHint(this.disabled) ?? null;
  }

  /** Re-applies the cursor and the enabled flags of each component to match
   * the usage of the current state.
   *
   * This is called whenever an event can change what the current state
   * returns from {@link InteractState#getUsage}, instead of every frame. */
  #refreshUsage = (): void => {
    const { currentState } = this;

    if (currentState != null) {
      const usage = currentState.getUsage(this.disabled);

      this.#updateCursor(usage);
      this.#updateEnabled(usage);
    }
  };

  #prevCursorClassWithPrefix = "";

  /** Updates the cursor that is displayed when hovered over the main window. */
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

  /** Updates the enabled status of each component in this context. */
  #updateEnabled(usage: InteractContextUsage): void {
    this.mainWindow.enableCameraControls = !!usage.mainWindow?.controlCamera;

    this.boxSelector.hoverEnabled = !!usage.boxSelector?.hover;
    this.boxSelector.selectEnabled = !!usage.boxSelector?.select;

    if (usage.boxCreator && "enabled" in usage.boxCreator) {
      this.boxCreator.disabled = !usage.boxCreator.enabled;
    } else {
      this.boxCreator.disabled = !(
        usage.boxCreator?.begin ??
        usage.boxCreator?.abort ??
        usage.boxCreator?.finish
      );
    }

    if (usage.boxTransformer && "enabled" in usage.boxTransformer) {
      this.boxTransformer.disabled = !usage.boxTransformer.enabled;
    } else {
      this.boxTransformer.disabled = !(
        usage.boxTransformer?.begin ??
        usage.boxTransformer?.abort ??
        usage.boxTransformer?.checkpoint
      );
    }

    if (usage.labelInspector && "enabled" in usage.labelInspector) {
      this.#boxInspector.disabled = !usage.labelInspector.enabled;
      this.#trackInspector.disabled = !usage.labelInspector.enabled;
    } else {
      this.#boxInspector.disabled = !usage.labelInspector?.selectBox;
      this.#trackInspector.disabled = !usage.labelInspector?.selectTrack;
    }

    if (usage.labelClipboard && "enabled" in usage.labelClipboard) {
      this.boxClipboard.disabled = !usage.labelClipboard.enabled;
    } else {
      this.boxClipboard.disabled = !usage.labelClipboard?.pasteBox;
    }
  }

  /** Sets the active state.
   * This is a no-op if the context is disabled. */
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

  /** Transitions the state of this context to navigation. */
  transitionNavigate(): void {
    this.#transition(() => new EditState(this, { trackId: null, boxId: null }));
  }

  /** Transitions the state of this context to selecting a bounding box. */
  transitionSelectBox(): void {
    this.#transition(() => new SelectBoxState(this));
  }

  /** Transitions the state of this context to drawing a bounding box. */
  transitionDrawBox(): void {
    this.#transition(() => new DrawBoxState(this));
  }

  /** Transitions the state of this context to editing some labels. */
  transitionEdit({ trackId, boxId }: EditStateParams): void {
    this.#transition(() => new EditState(this, { trackId, boxId }));
  }

  /** Transitions the state of this context to editing a bounding box.
   *
   * `box` is the object the caller captured when the edit was initiated.
   * When provided, it guards against stale callbacks: a selection captured
   * against another revision of the labels must not select or edit an
   * object that merely reuses the id in the current revision. */
  async transitionEditBox({
    boxId,
    box,
  }: {
    boxId: UUID;
    box?: ReadonlyLabelBox;
  }): Promise<void> {
    // The identity of the captured box (not just its id) must still
    // resolve in the current labels before anything is looked up or
    // edited; the app may have navigated since the callback was captured.
    if (
      box != null &&
      (!this.dataView.hasLabelBox(boxId) ||
        this.dataView.getLabelBox(boxId) !== box)
    )
      return;

    const target = box ?? this.dataView.getLabelBox(boxId);
    const trackId = target.entityId ?? null;

    const ctx = this.sceneContext;
    const targetTimestamp = target.timestamp;

    // This check is not required but it can avoid unnecessarily computing the path
    if (
      ctx.currentFrame != null &&
      !ctx.currentFrame.containsTimestamp(targetTimestamp)
    ) {
      await ctx.displayFrameFromCurrent({ tCenter: targetTimestamp });

      // The labels may have been (re)loaded while the navigation was in
      // flight; the captured callback is stale if the box it captured
      // is no longer the one behind its id (e.g. the id was reused by
      // the new frame), and must not edit the new frame's labels.
      if (
        !this.dataView.hasLabelBox(boxId) ||
        this.dataView.getLabelBox(boxId) !== target
      )
        return;
    }

    this.transitionEdit({ trackId, boxId });
  }
}
