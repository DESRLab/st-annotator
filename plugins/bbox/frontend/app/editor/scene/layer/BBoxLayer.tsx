import { default as React } from "react";
import { Transformer, TransformerSettingsView } from "sta-gmesh/app";
import { Color, Raycaster, type Object3D, type Vector3 } from "three";

import type {
  Axis,
  EditorE2EProbeTargetsContributor,
  EditorSliceContributor,
  LayerCollectionEventMap,
  SceneContext,
  WindowMapper,
} from "sta/app/editor";
import {
  LabelDataLayer,
  WindowPointer,
  SceneObjectsGroup,
  AccordionPaneHost,
  subscribeDataIndexLifecycle,
  DraggableBase,
  DraggablePlane,
  DraggableVertex,
  isE2EProbeEnabled,
  ClipboardToolView,
  EventSubscriptions,
} from "sta/app/editor";
import { ThreeUtils } from "sta/common";

import { getAutoTracks, getSettings } from "../../config";
import { ALL_EVENT_TYPES, LabelBoxTransformMonitor, BBoxView } from "../data";
import type {
  ReadonlyBBoxIndex,
  ReadonlyLabelBox,
  ReadonlyLabelTrack,
  UUID,
} from "../data";
import { LabelBoxClipboard, LabelBoxCreator } from "../tools";
import { BBoxLabelsTreeHost } from "../widgets";
import { actionDefinitions } from "../widgets/ActionPane.ts";
import type { Action } from "../widgets/ActionPane.ts";
import {
  bboxSettingsPaneMaxTimePathRange,
  getBBoxSettingsOutputData,
} from "../widgets/BBoxSettingsPane.react.tsx";
import type {
  BBoxSettings,
  BBoxSettingsPaneControllerParams,
} from "../widgets/BBoxSettingsPane.react.tsx";
import type { DrawMode } from "../widgets/DrawModePane.react.tsx";
import type { LabelBoxInspectorPaneControllerParams } from "../widgets/LabelBoxInspectorPane.ts";
import type { LabelTrackInspectorPaneControllerParams } from "../widgets/LabelTrackInspectorPane.ts";

import {
  BBoxActionsView,
  BBoxDrawModeView,
  BBoxLayerOverlayView,
  BBoxPreferencesView,
} from "./BBoxLayer.react.tsx";
import { mapBBoxSlice } from "./BBoxSlice";
import type { BBoxPluginIntents, BBoxSlice } from "./BBoxSlice";
import { getBBoxTooltipContent } from "./BBoxTooltip";
import { InteractContext } from "./InteractContext";
import { shouldDisableBBoxInteraction } from "./InteractionGate";
import type {
  InteractContextEventMap,
  MainWindowMapper,
} from "./InteractContext";
import type { InteractState } from "./InteractState";

export function getBBoxInteractionColor(
  box: ReadonlyLabelBox,
  selectedBox: ReadonlyLabelBox | null,
  hoveredBox: ReadonlyLabelBox | null,
  selectedColor: Readonly<{ r: number; g: number; b: number }>,
  hoveredColor: Readonly<{ r: number; g: number; b: number }>,
): Color | null {
  const color =
    box === selectedBox
      ? selectedColor
      : box === hoveredBox
        ? hoveredColor
        : null;
  return color == null ? null : new Color(color.r, color.g, color.b);
}

/** Joins the axes of a draggable gizmo element into a comparable key. */
const draggableAxesKey = (axes: readonly Axis[]): string => [...axes].join("");

/**
 * Tests whether an object is visible through its whole ancestor chain, up
 * to and including the given root.
 */
function isVisibleThroughAncestors(object: Object3D, root: Object3D): boolean {
  let current: Object3D | null = object;
  while (current != null) {
    if (!current.visible) return false;
    if (current === root) return true;
    current = current.parent;
  }
  return false;
}

/**
 * Finds the gizmo handle of a box transformer to project for the e2e
 * probe by locating the real draggable element in the live controls
 * subtree; only handles visible end-to-end are eligible.
 *
 * In the 2D view used by the fixture tests, translation is done on the
 * XZ-plane plane handles, rotation on the (only ever enabled) Y ring, and
 * resizing on the face/edge vertices without Y.
 */
function findBBoxProbeHandle(
  controls: Object3D,
  mode: string,
): Object3D | null {
  const candidates: DraggableBase[] = [];
  controls.traverse((object) => {
    if (
      object instanceof DraggableBase &&
      isVisibleThroughAncestors(object, controls)
    ) {
      candidates.push(object);
    }
  });

  switch (mode) {
    case "translate":
      return (
        candidates.find(
          (element) =>
            element instanceof DraggablePlane &&
            draggableAxesKey(element.axes) === "XZ",
        ) ?? null
      );
    case "rotate":
      return (
        candidates.find(
          (element) =>
            element instanceof DraggableVertex && element.axes.includes("Y"),
        ) ?? null
      );
    case "scale": {
      // Prefer an XZ face-center vertex (2D-friendly), then any
      // other face vertex, then any non-Y vertex handle.
      const vertices = candidates.filter(
        (element): element is DraggableVertex =>
          element instanceof DraggableVertex && !element.axes.includes("Y"),
      );
      return (
        vertices.find((element) => draggableAxesKey(element.axes) === "XZ") ??
        vertices.find((element) => element.axes.length === 2) ??
        vertices.at(0) ??
        null
      );
    }
    default:
      return null;
  }
}

/** Facilitates user interaction with the bounding box labels for the current frame. */
export class BBoxLayer<WM extends WindowMapper & MainWindowMapper>
  extends LabelDataLayer<WM, ReadonlyBBoxIndex>
  implements EditorE2EProbeTargetsContributor, EditorSliceContributor<BBoxSlice>
{
  /** Narrows the inherited data view to the bbox-specific view. */
  declare readonly dataView: BBoxView;

  /** Whether new boxes are automatically assigned to a track. */
  get autoTracks(): boolean {
    return getAutoTracks(this.context.config);
  }

  onBeforeUpdateData(): void {
    this.#settingsPaneSettings = {
      ...this.#settingsPaneSettings,
      disabled: true,
    };
    this.#notifySettingsChange();
    this.#interactContext.disabled = true;

    this.#invalidateSceneAndTooltips();
  }

  /**
   * Applies the interaction gate: creation/editing is only available once
   * the layer's complete prerequisite set is ready, it is active, its
   * label data is loaded, and its source data (the point cloud used to
   * place boxes) is loaded.
   */
  #applyInteractGate(): void {
    const { isActive } = this;
    const { data } = this.dataView;
    const pointCloud = this.pointCloudLayer.dataView.data;

    this.#interactContext.disabled = shouldDisableBBoxInteraction(
      isActive,
      data,
      pointCloud,
    );
  }

  onAfterUpdateData(): void {
    this.#settingsPaneSettings = {
      ...this.#settingsPaneSettings,
      disabled: false,
    };
    this.#notifySettingsChange();
    this.#applyInteractGate();

    this.#invalidateSceneAndTooltips();
  }

  /** Handles the event when a layer has been activated. */
  #onLayerActivate = (
    _event: LayerCollectionEventMap<WM>["layer-activate"],
  ): void => {
    this.#applyInteractGate();

    this.#invalidateSceneAndTooltips();
  };

  readonly #interactContext: InteractContext<WM>;

  /** A layer that displays the point cloud for the current frame. */

  readonly pointCloudLayer: any;

  /** Handles the event when the active point cloud is switched to a different one. */
  #onUpdatePointCloud = (): void => {
    const { dataView } = this.pointCloudLayer;
    const pcd = dataView.data;

    this.#interactContext.boxCreator.pcd = pcd;

    // The source data is part of the interaction gate, and may settle
    // after the label data did.
    this.#applyInteractGate();
  };

  /** A layer that displays the ground mesh for the current frame. */

  readonly groundMeshLayer: any;

  /** Handles the event when the active ground mesh is switched to a different one. */
  #onUpdateGroundMesh = (): void => {
    const { state, dataView } = this.groundMeshLayer;
    const groundMesh = dataView.data;
    const meshIsVisible = groundMesh && state.enabled;

    this.#settingsPaneSettings = {
      ...this.#settingsPaneSettings,
      disallowRelativeElevation: !meshIsVisible,
    };
    this.#notifySettingsChange();

    this.#interactContext.boxCreator.groundMesh = groundMesh;
    this.#interactContext.boxTransformer.groundMesh = groundMesh;
  };

  #tooltipModels: {
    key?: React.Key;
    className: string;
    left: string;
    lines: readonly string[];
    top: string;
    visible: boolean;
  }[] = [];

  /** `true` if the box/track display params and the scene objects may have
   * changed since the last render; otherwise, `false`. */
  #sceneDirty = true;

  /** `true` if the tooltip models may have changed since the last render;
   * otherwise, `false`. */
  #tooltipsDirty = true;

  /** Whether the tooltips are displayed according to the settings.
   * Cached so that camera updates are ignored while they are hidden. */
  #tooltipsVisible = false;

  /** Marks the box/track display and the scene objects as needing a re-render. */
  #invalidateScene = (): void => {
    this.#sceneDirty = true;
    this.requestRender();
  };

  /** Marks the box/track display, the scene objects, and the tooltips as
   * needing a re-render. */
  #invalidateSceneAndTooltips = (): void => {
    this.#sceneDirty = true;
    this.#tooltipsDirty = true;
    this.requestRender();
  };

  /** Handles the event when a bounding box is created, aborted, or finished,
   * which can change the displayed boxes and the hint. */
  #onCreateBoxChange = (): void => {
    this.#invalidateSceneAndTooltips();
    this.refreshHint();
  };

  /** Handles the event when a bounding box begins, aborts, or finishes being
   * transformed, which can change the gizmo, the tooltips, and the hint. */
  #onTransformBoxChange = (): void => {
    this.#invalidateSceneAndTooltips();
    this.refreshHint();
  };

  /** Handles the event when the camera of the main window is updated. The
   * screen positions of the tooltips depend on it, but only while the
   * tooltips are actually displayed. */
  #onCameraUpdate = (): void => {
    if (this.#tooltipsVisible) {
      this.#tooltipsDirty = true;
    }
  };

  /** Handles the event when the selected action changes, which can change
   * the hint (e.g., read-only mode).
   *
   * The enabled flags of the components also change with it, which can
   * change whether the gizmo controls are displayed. */
  #onActionChange = (): void => {
    this.#invalidateScene();
    this.refreshHint();
  };

  /** An accordion containing each tool. */
  readonly #toolFolders: Record<string, React.JSX.Element>;

  readonly #subscriptions = new EventSubscriptions();

  readonly TOOLS_KEYDOWN_BINDS = [
    {
      keyCombo: "f",
      name: "Cycle draw origin",
      handler: () => {
        this.#interactContext.cycleDrawMode();
      },
    },
    {
      keyCombo: "w",
      name: "Toggle translate gizmo",
      handler: () => {
        this.#interactContext.boxTransformer.toggleControlsEnabled("translate");
      },
    },
    {
      keyCombo: "e",
      name: "Toggle rotate gizmo",
      handler: () => {
        this.#interactContext.boxTransformer.toggleControlsEnabled("rotate");
      },
    },
    {
      keyCombo: "r",
      name: "Toggle scale gizmo",
      handler: () => {
        this.#interactContext.boxTransformer.toggleControlsEnabled("scale");
      },
    },
    {
      keyCombo: "shift",
      name: "Enable gizmo constraints",
      handler: () => {
        this.setApplyConstraints(true);
      },
    },
  ];

  readonly TOOLS_KEYUP_BINDS = [
    {
      keyCombo: "shift",
      name: "Disable gizmo constraints",
      handler: () => {
        this.setApplyConstraints(false);
      },
    },
  ];

  /** Specifies the settings to apply to the bounding box labels. */
  #settingsInputtedData: BBoxSettingsPaneControllerParams["inputtedData"];

  #settingsInternalData: BBoxSettingsPaneControllerParams["internalData"];

  #settingsPaneSettings: BBoxSettingsPaneControllerParams["settings"];

  readonly PREFS_KEYDOWN_BINDS = [
    {
      keyCombo: "q",
      name: "Toggle box transparency",
      handler: () => {
        this.#toggleSetting("boxTransparency");
      },
    },
    {
      keyCombo: "t",
      name: "Toggle box tooltips",
      handler: () => {
        this.#toggleSetting("showTooltips");
      },
    },
  ];

  /** Handles the event when the settings in the input have been updated. */
  #onSettingsChange = (
    inputtedData: BBoxSettingsPaneControllerParams["inputtedData"],
  ): void => {
    const dataView = this.#interactContext.dataView;
    this.#settingsInputtedData = inputtedData;
    this.#notifySettingsChange();
    const { timePathRange, maintainRelativeElevation } = this.settingsOutput;

    dataView.timePathRange = timePathRange;

    this.#interactContext.boxCreator.disableRelElevation =
      !maintainRelativeElevation;
    this.#interactContext.boxTransformer.disableRelElevation =
      !maintainRelativeElevation;

    this.#tooltipsVisible = this.settingsOutput.showTooltips;

    // The settings affect both the box display and the tooltip contents
    this.#invalidateSceneAndTooltips();
  };

  readonly ACTIONS_KEYDOWN_BINDS = actionDefinitions
    .filter((definition) => definition.role === "selectable")
    .map(({ value, keyCombo, keybindName }) => ({
      keyCombo,
      name: keybindName,
      handler: () => {
        this.#interactContext.toggleAction(value);
      },
    }));

  /** Updates the controls menu to display the keybinds in an interaction state,
   * replacing those of the previous interaction state. */
  #updateControlsElem = (interactState: InteractState<WM>): void => {
    this.keydownHandler.setChildren([interactState.keydownHandler]);
    this.keyupHandler.setChildren([interactState.keyupHandler]);

    this.setControlsSections([
      { title: "Tools", keybinds: this.TOOLS_KEYDOWN_BINDS },
      { title: "Actions", keybinds: this.ACTIONS_KEYDOWN_BINDS },
      { title: "Preferences", keybinds: this.PREFS_KEYDOWN_BINDS },
      {
        title: "Context",
        keybinds: [...interactState.keydownHandler.iterSubtreeKeybinds()],
      },
    ]);
  };

  /** Handles the event when the active interaction state has changed. */
  #onInteractStateChange = (
    event: InteractContextEventMap<WM>["change"],
  ): void => {
    this.#updateControlsElem(event.currentState);

    // The state change can change the selected box, the gizmo, and the hint
    this.#invalidateSceneAndTooltips();
    this.refreshHint();
  };

  #renderOverlay = (): void => {
    this.refreshOverlay();
  };

  get overlayView(): React.JSX.Element {
    return <BBoxLayerOverlayView source={this} />;
  }

  get overlaySnapshot() {
    return {
      isActive: this.isActive,
      tooltips: this.#tooltipModels,
    };
  }

  get prefsView(): React.JSX.Element {
    return <BBoxPreferencesView />;
  }

  get objectTreeView(): React.JSX.Element {
    return <BBoxLabelsTreeHost />;
  }

  /** Applies new box inspector pane input (editor-intent target). */
  applyBoxInspectorInput(
    inputtedData: LabelBoxInspectorPaneControllerParams["inputtedData"],
  ): void {
    this.#interactContext.boxInspector.onInputChange(inputtedData);
  }

  /** Selects a box from the labels tree; `null` deselects (editor-intent
   * target). The coordinator keeps the selection across pointer-selector
   * aborts and clears it itself when the label is (un)loaded away. */
  selectBox(id: UUID | null): void {
    this.#interactContext.boxInspector.selectedId = id;
  }

  /** Selects a track from the labels tree; `null` deselects
   * (editor-intent target). */
  selectTrack(id: UUID | null): void {
    this.#interactContext.trackInspector.selectedId = id;
  }

  /** Applies new track inspector pane input (editor-intent target). */
  applyTrackInspectorInput(
    inputtedData: LabelTrackInspectorPaneControllerParams["inputtedData"],
  ): void {
    this.#interactContext.trackInspector.onInputChange(inputtedData);
  }

  /** Forwards a box inspector pane event, e.g. the draw-box toggle
   * (editor-intent target). The coordinator keeps its exact internal
   * ordering, including the input-mirror rebuild the toggle triggers —
   * so the draw flow keeps seeing the same defaults as before. */
  boxInspectorPaneEvent(event: { type: string }): void {
    this.#interactContext.boxInspector.onPaneEvent(event);
  }

  /** Forwards a track inspector pane event, e.g. create-track
   * (editor-intent target). */
  trackInspectorPaneEvent(event: { type: string }): void {
    this.#interactContext.trackInspector.onPaneEvent(event);
  }

  get actionsView(): React.JSX.Element {
    return <BBoxActionsView />;
  }

  get toolsView(): React.JSX.Element {
    return <AccordionPaneHost folders={this.#toolFolders} />;
  }

  /** Creates a new layer for bounding box labels. */
  static create<WM extends WindowMapper & MainWindowMapper>(
    context: SceneContext<WM>,
    name: string,
    pointCloudLayer: any,
    groundMeshLayer: any,
  ): BBoxLayer<WM> {
    // timePathRange is set when #onSettingsChange is called
    const dataView = BBoxView.create(context, 0);

    return new BBoxLayer(
      context,
      name,
      dataView,
      pointCloudLayer,
      groundMeshLayer,
    );
  }

  /** Creates a new display for label data that updates based on the current frame. */
  constructor(
    context: SceneContext<WM>,
    name: string,
    dataView: BBoxView,
    pointCloudLayer: any,
    groundMeshLayer: any,
  ) {
    super(context, name, dataView);

    const config = context.config;
    const settings = getSettings(config);

    this.pointCloudLayer = pointCloudLayer;
    this.groundMeshLayer = groundMeshLayer;

    const pointer = new WindowPointer(context.display.windows.main);

    const boxSelectRaycaster = new Raycaster();
    ThreeUtils.setRaycasterPointsThreshold(boxSelectRaycaster, 0.25);

    const boxSelectorGroup = new SceneObjectsGroup({
      objects: {
        [Symbol.iterator]: () => this.iterLabelBoxes(),
      },
      raycastFunc: (obj: ReadonlyLabelBox, raycaster) => obj.raycast(raycaster),
    });

    const boxSelector = pointer.createSelectController({
      groups: [{ group: boxSelectorGroup, priority: 0 }],
      raycaster: boxSelectRaycaster,
    });

    const boxMonitor = new LabelBoxTransformMonitor();

    const boxCreator = new LabelBoxCreator(
      pointer,
      new Raycaster(),
      this.groundMeshLayer.dataView.data,
      this.pointCloudLayer.dataView.data,
    );

    const boxTransformRaycaster = new Raycaster();
    ThreeUtils.setRaycasterPointsThreshold(boxTransformRaycaster, 0.25);

    const boxTransformer = new Transformer(
      pointer,
      boxTransformRaycaster,
      (obj: ReadonlyLabelBox) => obj.asObject3D(),
      this.groundMeshLayer.dataView.data,
    );

    const boxClipboard = new LabelBoxClipboard();

    this.#settingsInputtedData = settings;
    this.#settingsInternalData = {};
    this.#settingsPaneSettings = {
      disabled: false,
      hidden: false,
      disallowRelativeElevation: false,
      maxTimePathRange: bboxSettingsPaneMaxTimePathRange,
    };
    this.#tooltipsVisible = this.settingsOutput.showTooltips;
    this.#renderOverlay();

    for (const keybind of [
      ...this.TOOLS_KEYDOWN_BINDS,
      ...this.ACTIONS_KEYDOWN_BINDS,
      ...this.PREFS_KEYDOWN_BINDS,
    ]) {
      this.keydownHandler.register(keybind);
    }
    for (const keybind of this.TOOLS_KEYUP_BINDS) {
      this.keyupHandler.register(keybind);
    }

    this.#interactContext = new InteractContext({
      sceneContext: context,
      dataView: dataView,
      boxCreator: boxCreator,
      boxSelector: boxSelector,
      boxTransformer: boxTransformer,
      boxMonitor: boxMonitor,
      boxClipboard: boxClipboard,
      autoTracks: this.autoTracks,
    });

    this.#toolFolders = {
      Draw: <BBoxDrawModeView />,
      Transform: <TransformerSettingsView transformer={boxTransformer} />,
      Clipboard: <ClipboardToolView clipboard={boxClipboard} />,
    };

    // Avoid accessing attributes from event handlers before they are initialized
    this.context.addEventListener("layer-activate", this.#onLayerActivate);

    this.pointCloudLayer.dataView.addEventListener(
      "beforeload",
      this.#onUpdatePointCloud,
    );
    this.pointCloudLayer.dataView.addEventListener(
      "afterload",
      this.#onUpdatePointCloud,
    );

    this.groundMeshLayer.dataView.addEventListener(
      "beforeload",
      this.#onUpdateGroundMesh,
    );
    this.groundMeshLayer.dataView.addEventListener(
      "afterload",
      this.#onUpdateGroundMesh,
    );
    this.groundMeshLayer.state.addEventListener(
      "change",
      this.#onUpdateGroundMesh,
    );

    this.#interactContext.addEventListener(
      "change",
      this.#onInteractStateChange,
    );
    this.#interactContext.addEventListener(
      "action-change",
      this.#onActionChange,
    );

    this.#subscriptions.add<
      InteractContextEventMap<WM>,
      "box-visibility-change"
    >(
      this.#interactContext,
      "box-visibility-change",
      this.#invalidateSceneAndTooltips,
    );

    // Starts the interaction state machine (initial transition). Set
    // after the listeners above so the initial state update is heard.
    this.#interactContext.disabled = true;

    // Selection/hover changes affect the box display colors
    boxSelector.addEventListener("selectin", this.#invalidateScene);
    boxSelector.addEventListener("selectout", this.#invalidateScene);
    boxSelector.addEventListener("hoverin", this.#invalidateScene);
    boxSelector.addEventListener("hoverout", this.#invalidateScene);

    // Creating/transforming a box changes the displayed boxes, the gizmo,
    // the tooltips, and the hint
    boxCreator.addEventListener("begin", this.#onCreateBoxChange);
    boxCreator.addEventListener("abort", this.#onCreateBoxChange);
    boxCreator.addEventListener("end", this.#onCreateBoxChange);
    boxTransformer.addEventListener("begin", this.#onTransformBoxChange);
    boxTransformer.addEventListener("abort", this.#onTransformBoxChange);
    boxTransformer.addEventListener("checkpoint", this.#onTransformBoxChange);

    // Editing the label data changes the box display and the tooltips
    this.context.addEventListener(
      "edit-branch",
      this.#invalidateSceneAndTooltips,
    );

    // The tooltip screen positions depend on the camera
    this.#interactContext.mainWindow.addEventListener(
      "camera-update",
      this.#onCameraUpdate,
    );
    this.#onSettingsChange(settings);
  }

  dispose(): void {
    this.#subscriptions.dispose();
    this.context.removeEventListener("layer-activate", this.#onLayerActivate);

    this.pointCloudLayer.dataView.removeEventListener(
      "beforeload",
      this.#onUpdatePointCloud,
    );
    this.pointCloudLayer.dataView.removeEventListener(
      "afterload",
      this.#onUpdatePointCloud,
    );

    this.groundMeshLayer.dataView.removeEventListener(
      "beforeload",
      this.#onUpdateGroundMesh,
    );
    this.groundMeshLayer.dataView.removeEventListener(
      "afterload",
      this.#onUpdateGroundMesh,
    );
    this.groundMeshLayer.state.removeEventListener(
      "change",
      this.#onUpdateGroundMesh,
    );

    this.#interactContext.mainWindow.removeEventListener(
      "camera-update",
      this.#onCameraUpdate,
    );
    this.context.removeEventListener(
      "edit-branch",
      this.#invalidateSceneAndTooltips,
    );

    const { boxSelector, boxCreator, boxTransformer } = this.#interactContext;
    boxSelector.removeEventListener("selectin", this.#invalidateScene);
    boxSelector.removeEventListener("selectout", this.#invalidateScene);
    boxSelector.removeEventListener("hoverin", this.#invalidateScene);
    boxSelector.removeEventListener("hoverout", this.#invalidateScene);

    boxCreator.removeEventListener("begin", this.#onCreateBoxChange);
    boxCreator.removeEventListener("abort", this.#onCreateBoxChange);
    boxCreator.removeEventListener("end", this.#onCreateBoxChange);
    boxTransformer.removeEventListener("begin", this.#onTransformBoxChange);
    boxTransformer.removeEventListener("abort", this.#onTransformBoxChange);
    boxTransformer.removeEventListener(
      "checkpoint",
      this.#onTransformBoxChange,
    );

    this.#interactContext.boxSelector.dispose();
    this.#interactContext.boxMonitor.dispose();
    // The inspectors are disposed by the interaction context itself.
    this.#interactContext.boxCreator.dispose();
    this.#interactContext.boxTransformer.dispose();
    this.#interactContext.boxClipboard.dispose();
    this.#interactContext.removeEventListener(
      "change",
      this.#onInteractStateChange,
    );
    this.#interactContext.removeEventListener(
      "action-change",
      this.#onActionChange,
    );
    this.#interactContext.dispose();

    super.dispose();
  }

  /** Iterates through each bounding box to display. */
  *iterLabelBoxes(): IterableIterator<ReadonlyLabelBox> {
    const { dataView, boxCreator } = this.#interactContext;

    // This may be called in the constructor so it may not be initialized yet
    if (dataView === undefined) return;

    for (const box of dataView.iterLabelBoxes()) yield box;

    const newBox = boxCreator.newObj;
    if (newBox != null) yield newBox;
  }

  /** Iterates through each object track to display. */
  *iterLabelTracks(): IterableIterator<ReadonlyLabelTrack> {
    const dataView = this.#interactContext.dataView;

    // This may be called in the constructor so it may not be initialized yet
    if (dataView === undefined) return;

    for (const track of dataView.iterLabelTracks()) yield track;
  }

  /**
   * Test-only e2e probe seam ({@link EditorE2EProbeTargetsContributor}):
   * the world-space center of the box with the given id, or `null` when
   * the probe is disabled or the box does not exist. Read-only.
   */
  getE2EProbeLabelPoint(id: UUID, _subIndex: number | null): Vector3 | null {
    if (!isE2EProbeEnabled()) return null;
    if (!this.dataView.hasLabelBox(id)) return null;

    return this.dataView.getLabelBox(id).asObject3D().position.clone();
  }

  /**
   * Test-only e2e probe seam ({@link EditorE2EProbeTargetsContributor}):
   * the live gizmo handle of the selected box for the given transform
   * mode, or `null` when the probe is disabled or no box is selected
   * for transformation. Read-only.
   */
  getE2EProbeTransformHandle(
    mode: string,
    _subIndex: number | null,
  ): Object3D | null {
    if (!isE2EProbeEnabled()) return null;

    const controls = this.#interactContext.boxTransformer.getControls();
    if (controls == null) return null;

    return findBBoxProbeHandle(controls, mode);
  }

  /**
   * Test-only e2e probe seam ({@link EditorE2EProbeTargetsContributor}):
   * the id of the box the selector currently reports as hovered, or
   * `null` when the probe is disabled or nothing is hovered. Read-only.
   */
  getE2EProbeHoveredLabel(): string | null {
    if (!isE2EProbeEnabled()) return null;

    const id = this.#interactContext.boxSelector.hoveredObj?.id;
    return typeof id === "string" ? id : null;
  }

  /**
   * Test-only e2e probe seam ({@link EditorE2EProbeTargetsContributor}):
   * raycasts the box selector groups with the given raycaster, returning
   * the candidate box count and the closest hit id. Read-only.
   */
  getE2EProbeSelectorRaycast(
    raycaster: Raycaster,
  ): { count: number; hitId: string | null } | null {
    if (!isE2EProbeEnabled()) return null;

    let count = 0;
    let hit: ReadonlyLabelBox | null = null;
    for (const group of this.#interactContext.boxSelector.groups.iterGroups()) {
      for (const _ of group.objects) count += 1;
      hit ??= group.raycast(raycaster);
    }
    const hitId = hit?.id;
    return { count, hitId: typeof hitId === "string" ? hitId : null };
  }

  /**
   * Test-only e2e probe seam ({@link EditorE2EProbeTargetsContributor}):
   * the box selector's live hover-enabled flag and current raycaster ray.
   * Read-only.
   */
  getE2EProbeSelectorState(): {
    hoverEnabled: boolean;
    ray: { origin: Vector3; direction: Vector3 };
  } | null {
    if (!isE2EProbeEnabled()) return null;

    const selector = this.#interactContext.boxSelector;
    return {
      hoverEnabled: selector.hoverEnabled,
      ray: {
        origin: selector.raycaster.ray.origin,
        direction: selector.raycaster.ray.direction,
      },
    };
  }

  /** Gets the content to display as a hint to the user when this layer is active.
   * If `null`, no hint is displayed. */
  getHint(): React.ReactNode {
    return this.#interactContext.getHint();
  }

  /**
   * `true` between the labels view's `beforeload` and `afterload`; the
   * entity lists map empty while the load is in flight.
   */
  #labelsLoading = false;

  /** Maps this layer's interaction state into its plain editor-state slice. */
  /** Contributes the bbox intent group to the editor intents. */
  createEditorIntents(): BBoxPluginIntents {
    return {
      bbox: {
        setBoxHidden: (id, hidden) => {
          this.#interactContext.setBoxHidden(id, hidden);
        },
        setAction: (action) => {
          this.setAction(action);
        },
        setDrawMode: (drawMode) => {
          this.setDrawMode(drawMode);
        },
        setSettings: (values) => {
          this.onSettingsInputChange(values);
        },
        applyBoxInspectorInput: (values) => {
          this.applyBoxInspectorInput(values);
        },
        applyTrackInspectorInput: (values) => {
          this.applyTrackInspectorInput(values);
        },
        selectBox: (id) => {
          this.selectBox(id);
        },
        selectTrack: (id) => {
          this.selectTrack(id);
        },
        boxInspectorPaneEvent: (event) => {
          this.boxInspectorPaneEvent(event);
        },
        trackInspectorPaneEvent: (event) => {
          this.trackInspectorPaneEvent(event);
        },
      },
    };
  }

  mapEditorSlice(previous: BBoxSlice | null): BBoxSlice {
    const { boxClipboard } = this.#interactContext;
    return mapBBoxSlice(
      {
        action: this.#interactContext.action,
        drawMode: this.#interactContext.drawMode,
        disabled: this.#interactContext.disabled,
        selectedBoxId: this.#interactContext.selectedBoxId,
        selectedTrackId: this.#interactContext.selectedTrackId,
        autoTracks: this.autoTracks,
        drawBoxActive: this.#interactContext.drawBoxActive,
        boxInspectorDisabled: this.#interactContext.boxInspectorDisabled,
        trackInspectorDisabled: this.#interactContext.trackInspectorDisabled,
        clipboard: boxClipboard.getViewState(),
        settings: {
          values: this.#settingsInputtedData,
          disabled: this.#settingsPaneSettings.disabled,
          disallowRelativeElevation:
            this.#settingsPaneSettings.disallowRelativeElevation,
        },
        labels: this.#labelsLoading ? null : this.dataView,
      },
      previous,
    );
  }

  /** Subscribes to every event that can change this layer's editor-state slice. */
  subscribeEditorSlice(listener: () => void): () => void {
    const { boxSelector, boxClipboard } = this.#interactContext;
    const context = this.#interactContext;

    context.addEventListener("action-change", listener);
    context.addEventListener("draw-mode-change", listener);
    // State transitions move the selected box/track and the per-inspector
    // disabled state; they complement (not replace) the other sources.
    context.addEventListener("change", listener);
    boxSelector.addEventListener("selectin", listener);
    boxSelector.addEventListener("selectout", listener);
    boxClipboard.addEventListener("change", listener);
    this.addEventListener("settings-change", listener);

    // Entity lists: aggregate every event of the current labels index,
    // following the index across loads. The lifecycle helper detaches
    // from the old index and publishes the loading state at
    // `beforeload` (DataView nulls its data right after dispatching it),
    // and attaches to the new index at `afterload`.
    const disposeIndexLifecycle = subscribeDataIndexLifecycle({
      view: this.dataView,
      eventTypes: ALL_EVENT_TYPES,
      listener,
      setLoading: (loading): void => {
        this.#labelsLoading = loading;
      },
    });

    return (): void => {
      disposeIndexLifecycle();
      context.removeEventListener("action-change", listener);
      context.removeEventListener("draw-mode-change", listener);
      context.removeEventListener("change", listener);
      boxSelector.removeEventListener("selectin", listener);
      boxSelector.removeEventListener("selectout", listener);
      boxClipboard.removeEventListener("change", listener);
      this.removeEventListener("settings-change", listener);
    };
  }

  /** Selects the interaction action (editor-intent target). */
  setAction(action: Action): void {
    this.#interactContext.setAction(action);
  }

  /** Selects the draw origin used when creating a box (editor-intent target). */
  setDrawMode(drawMode: DrawMode): void {
    this.#interactContext.setDrawMode(drawMode);
  }

  /** Updates how a track is displayed. */
  #renderTrack(track: ReadonlyLabelTrack): ReadonlyLabelTrack {
    const dataView = this.#interactContext.dataView;

    const displayParams = {
      minTimestamp: dataView.getMinTimestampInRange(),
      maxTimestamp: dataView.getMaxTimestampInRange(),
    };

    dataView.setLabelTrackDisplayParams(track, displayParams);

    return track;
  }

  /** Updates how a bounding box is displayed. */
  #renderBox(box: ReadonlyLabelBox): ReadonlyLabelBox {
    const dataView = this.#interactContext.dataView;
    const {
      selectedBoxColor,
      hoveredBoxColor,
      showPerceivedClass,
      boxOpacity,
    } = this.settingsOutput;

    const showColor = getBBoxInteractionColor(
      box,
      this.#interactContext.boxSelector.selectedObj,
      this.#interactContext.boxSelector.hoveredObj,
      selectedBoxColor,
      hoveredBoxColor,
    );

    const currentFrame = this.context.currentFrame;

    const displayOptions = {
      opacity: boxOpacity,
      showFrame:
        currentFrame == null || currentFrame.containsTimestamp(box.timestamp),
      showPerceivedClass: showPerceivedClass,
      showColor: showColor,
    };

    dataView.setLabelBoxDisplayParams(box, displayOptions);

    return box;
  }

  /** Builds the tooltip model for a bounding box. */
  #getTooltipModel(box: ReadonlyLabelBox) {
    const currentFrame = this.context.currentFrame;
    const mainCamera = this.#interactContext.mainWindow.getCamera();
    const {
      showTooltips,
      showOcclusion,
      showTimestampDiff,
      showDistinctiveness,
      showTrackBoxId,
    } = this.settingsOutput;

    const boxNDC = box.asObject3D().position.clone().project(mainCamera);
    const relPos = ThreeUtils.getNDCRelPos(boxNDC);

    const { className, lines, visible } = getBBoxTooltipContent({
      boxId: box.id,
      trackId: box.entityId,
      timestamp: box.timestamp,
      currentTimestamp: currentFrame?.getTimestampCenter() ?? null,
      isInCurrentFrame: currentFrame?.containsTimestamp(box.timestamp) ?? false,
      displayClassName: box.displayClass?.name ?? null,
      occlusionName: box.occlusionLv.name,
      distinctivenessName: box.distinctiveLv.name,
      showTooltips: showTooltips && !box.hidden,
      showTrackBoxId,
      showTimestampDiff,
      showOcclusion,
      showDistinctiveness,
    });

    return {
      className,
      left: `${relPos.x * 100}%`,
      lines,
      top: `${relPos.y * 100}%`,
      visible,
    };
  }

  /** Updates the `three.js` objects and the DOM elements of this layer.
   * It is called during each animation frame while this layer is displayed. */
  render(): void {
    const { dataView, boxCreator, boxTransformer } = this.#interactContext;

    // Avoid querying frames when the task is changing
    if (this.context.isNavigating) return;

    const sceneDirty = this.#sceneDirty;

    // The tooltip positions have one continuous dependency: the
    // box being created or transformed is moved directly on every pointer
    // move without dispatching any event (and the camera is locked while
    // doing so), so its tooltip must keep being updated every frame until
    // the manipulation ends.
    const isManipulatingBox =
      boxCreator.isCreating || boxTransformer.isTransforming;
    const tooltipsDirty =
      this.#tooltipsDirty || (isManipulatingBox && this.#tooltipsVisible);

    // The cursor/enabled flags are updated by the interact context in
    // response to events, and the display is only updated when one of the
    // display inputs changed since the previous render.
    if (!sceneDirty && !tooltipsDirty) return;

    const { data } = dataView;
    if (data == null) {
      this.objects.clear();
      this.refreshObjects();
      this.#tooltipModels = [];
      this.#renderOverlay();

      this.#sceneDirty = false;
      this.#tooltipsDirty = false;
      return;
    }

    const boxes = [...this.iterLabelBoxes()];

    if (sceneDirty) {
      this.objects.clear();

      for (const box of boxes) {
        this.#renderBox(box);
        this.objects.add(box.asObject3D());
      }

      for (const track of this.iterLabelTracks()) {
        this.#renderTrack(track);

        // Cannot use track.elements as we want it to be based on the boxes
        // instead of the vertices
        if (data.getLabelTrackElements(track.id).size > 0) {
          this.objects.add(track.asObject3D());
        }
      }

      const boxTransformerControls = boxTransformer.getControls();
      if (boxTransformerControls != null) {
        this.objects.add(boxTransformerControls);
      }

      this.refreshObjects();
      this.#sceneDirty = false;
    }

    if (tooltipsDirty) {
      this.#tooltipModels = boxes.map((box) => this.#getTooltipModel(box));
      this.#renderOverlay();

      this.#tooltipsDirty = false;
    }
  }

  /** Sets whether to apply constraints to the controls, where applicable. */
  setApplyConstraints(value: boolean): this {
    this.#interactContext.boxCreator.clipToAspect = value;
    this.#interactContext.boxTransformer.setApplyConstraints(value);

    return this;
  }

  get settingsPaneParams(): Pick<
    BBoxSettingsPaneControllerParams,
    "inputtedData" | "computedData" | "internalData" | "settings"
  > {
    return {
      inputtedData: this.#settingsInputtedData,
      computedData: {},
      internalData: this.#settingsInternalData,
      settings: this.#settingsPaneSettings,
    };
  }

  get settingsOutput(): BBoxSettings {
    return getBBoxSettingsOutputData(this.settingsPaneParams);
  }

  onSettingsInputChange = (
    inputtedData: BBoxSettingsPaneControllerParams["inputtedData"],
  ): void => {
    this.#onSettingsChange(inputtedData);
  };

  #toggleSetting(settingName: "boxTransparency" | "showTooltips"): void {
    if (this.#settingsPaneSettings.disabled) return;

    this.#onSettingsChange({
      ...this.#settingsInputtedData,
      [settingName]: !this.#settingsInputtedData[settingName],
    });
  }

  #notifySettingsChange(): void {
    this.dispatchEvent({ type: "settings-change" });
  }
}
