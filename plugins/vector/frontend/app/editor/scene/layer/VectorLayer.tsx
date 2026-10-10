import { default as React } from "react";
import { GroundMeshLayer } from "sta-gmesh/app";
import { PointCloudLayer } from "sta-pcd/app";
import { Color, Raycaster, type Object3D, type Vector3 } from "three";

import type {
  EditorE2EProbeTargetsContributor,
  EditorSliceContributor,
  SceneContext,
  WindowMapper,
} from "sta/app/editor";
import {
  LabelDataLayer,
  WindowPointer,
  SceneObjectsGroup,
  AccordionPaneHost,
  subscribeDataIndexLifecycle,
  DraggableVertex,
  isE2EProbeEnabled,
  ClipboardToolView,
} from "sta/app/editor";
import { ThreeUtils } from "sta/common";

import { getSettings } from "../../config";
import { VectorTransformer, VectorTransformerSettingsView } from "../controls";
import { DraggablePlane } from "../controls/DraggablePlane";
import { VectorView, LabelVectorReformMonitor, ALL_EVENT_TYPES } from "../data";
import type { ReadonlyLabelVector, ReadonlyVectorIndex, UUID } from "../data";
import {
  PolygonCreator,
  PolylineCreator,
  PointCreator,
  LabelVectorClipboard,
  VectorCreator,
} from "../tools";
import { VectorLabelsTreeHost } from "../widgets";
import { actionDefinitions } from "../widgets/ActionPane.ts";
import type { Action } from "../widgets/ActionPane.ts";
import type { DrawMode } from "../widgets/DrawModePane.react.tsx";
import type { LabelVectorInspectorPaneControllerParams } from "../widgets/LabelVectorInspectorPane.ts";
import { getVectorSettingsOutputData } from "../widgets/VectorSettingsPane.react.tsx";
import type {
  VectorSettings,
  VectorSettingsPaneControllerParams,
} from "../widgets/VectorSettingsPane.react.tsx";

import { InteractContext } from "./InteractContext";
import { shouldDisableVectorInteraction } from "./InteractionGate";
import type {
  InteractContextEventMap,
  InteractState,
  MainWindowMapper,
} from "./InteractContext";
import {
  VectorActionsView,
  VectorDrawModeView,
  VectorLayerOverlayView,
  VectorPreferencesView,
} from "./VectorLayer.react.tsx";
import { mapVectorSlice } from "./VectorSlice";
import type { VectorPluginIntents, VectorSlice } from "./VectorSlice";
import { getVectorTooltipContent } from "./VectorTooltip";

export function getVectorInteractionColor(
  vector: ReadonlyLabelVector,
  selectedVector: ReadonlyLabelVector | null,
  hoveredVector: ReadonlyLabelVector | null,
  selectedColor: Readonly<{ r: number; g: number; b: number }>,
  hoveredColor: Readonly<{ r: number; g: number; b: number }>,
): Color | null {
  const color =
    vector === selectedVector
      ? selectedColor
      : vector === hoveredVector
        ? hoveredColor
        : null;
  return color == null ? null : new Color(color.r, color.g, color.b);
}

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

/** Collects the visible vertex handles of a vector gizmo, in vertex order. */
function findVectorVertexHandles(controls: Object3D): DraggableVertex[] {
  const handles: DraggableVertex[] = [];
  controls.traverse((object) => {
    if (
      object instanceof DraggableVertex &&
      isVisibleThroughAncestors(object, controls)
    ) {
      handles.push(object);
    }
  });
  return handles;
}

/** Collects the visible whole-object plane handles of a vector gizmo. */
function findVectorPlaneHandles(controls: Object3D): DraggablePlane[] {
  const handles: DraggablePlane[] = [];
  controls.traverse((object) => {
    if (
      object instanceof DraggablePlane &&
      isVisibleThroughAncestors(object, controls)
    ) {
      handles.push(object);
    }
  });
  return handles;
}

/**
 * Facilitate use interaction with the vector labels for the current frame.
 */
export class VectorLayer<WM extends WindowMapper & MainWindowMapper>
  extends LabelDataLayer<WM, ReadonlyVectorIndex>
  implements
    EditorE2EProbeTargetsContributor,
    EditorSliceContributor<VectorSlice>
{
  /** Narrows the inherited data view to the vector-specific view. */
  declare readonly dataView: VectorView;

  /**
   * `true` if the vector labels (their display colors, the scene objects
   * and the tooltip models) need to be rebuilt on the next render.
   */
  #labelsDirty = true;

  /**
   * `true` if only the screen positions of the tooltips need to be
   * recomputed on the next render, without touching the vector labels.
   */
  #tooltipsDirty = true;

  /** Marks label scene objects as dirty and wakes the demand renderer. */
  #markLabelsDirty = (): void => {
    this.#labelsDirty = true;
    this.requestRender();
  };

  /** Marks tooltip positions as dirty and wakes the demand renderer. */
  #markTooltipsDirty = (): void => {
    this.#tooltipsDirty = true;
    this.requestRender();
  };

  /**
   * The value of `isActive` as of the most recent `layer-activate` event
   * handled by this object.
   */
  #prevIsActive = false;

  /**
   * The label index this object is subscribed to for change events,
   * i.e. the currently loaded data (if any).
   */
  #indexEventSource: ReadonlyVectorIndex | null = null;

  /**
   * Subscribes this object to the change events of the currently loaded
   * label index, if any, so the labels are rebuilt whenever a label
   * changes without a reload (e.g. edits applied to the branch, or the
   * local-only additions made while drawing).
   */
  #subscribeIndexEvents(): void {
    const data = this.dataView.data;

    if (data == null) return;

    for (const eventType of ALL_EVENT_TYPES) {
      data.addEventListener(eventType, this.#onLabelsChange);
    }

    this.#indexEventSource = data;
  }

  /**
   * Reverses {@link VectorLayer.#subscribeIndexEvents}.
   */
  #unsubscribeIndexEvents(): void {
    const data = this.#indexEventSource;

    if (data == null) return;

    for (const eventType of ALL_EVENT_TYPES) {
      data.removeEventListener(eventType, this.#onLabelsChange);
    }

    this.#indexEventSource = null;
  }

  /**
   * Handles the event when a label in the loaded index has changed.
   */
  #onLabelsChange = (): void => {
    this.#markLabelsDirty();
  };

  /**
   * Applies the interaction gate: creation/editing is only available once
   * the layer's complete prerequisite set is ready, it is active, its
   * label data is loaded, and its source data (the point cloud used to
   * place vectors) is loaded.
   */
  #applyInteractGate() {
    const { isActive } = this;
    const { data } = this.dataView;
    const pointCloud = this.pointCloudLayer.dataView.data;

    this.#interactContext.disabled = shouldDisableVectorInteraction(
      isActive,
      data,
      pointCloud,
    );
  }

  onBeforeUpdateData() {
    this.#settingsPaneSettings = {
      ...this.#settingsPaneSettings,
      disabled: true,
    };
    this.#notifySettingsChange();
    this.#interactContext.disabled = true;

    // The labels are about to be (un)loaded; both the labels and the
    // hint (which can depend on the read-only status) change.
    this.#unsubscribeIndexEvents();
    this.#markLabelsDirty();
    this.refreshHint();
  }

  onAfterUpdateData() {
    this.#settingsPaneSettings = {
      ...this.#settingsPaneSettings,
      disabled: false,
    };
    this.#notifySettingsChange();
    this.#applyInteractGate();

    // New label data has been loaded, so the labels and the hint
    // (which can depend on the read-only status) change.
    this.#subscribeIndexEvents();
    this.#markLabelsDirty();
    this.refreshHint();
  }

  /**
   * Handles the event when a layer has been activated.
   */
  #onLayerActivate = (_event: unknown) => {
    const { isActive } = this;

    this.#interactContext.layerIsActive = isActive;
    this.#applyInteractGate();

    // The enabled status of the components (and thus the hint) depends
    // on whether this layer is active.
    this.refreshHint();

    if (this.#prevIsActive !== isActive) {
      this.#prevIsActive = isActive;

      // Whether the layer is active determines the enabled status of
      // the components, which in turn affects the displayed objects
      // (e.g. the transform controls), so rebuild the labels.
      this.#markLabelsDirty();

      // The overlay displays the inspector panel only while this
      // layer is active.
      this.#renderOverlay();
    }
  };

  readonly #interactContext;
  readonly #pointer: WindowPointer;

  /**
   * A layer that displays the point cloud for the current frame.
   */
  readonly pointCloudLayer;

  /**
   * A layer that displays the ground mesh for the current frame.
   */
  readonly groundMeshLayer;

  /**
   * Observes the overlay DOM of this object for resize events.
   */
  readonly #canvas: HTMLCanvasElement;

  /**
   * Suppresses the browser context menu on the drawing canvas so that the
   * right button can be used for drawing.
   */
  #onContextMenu = (event: Event): void => event.preventDefault();

  /**
   * Handles the event when the active point cloud is switched to a different one.
   */
  #onUpdatePointCloud = () => {
    const { dataView } = this.pointCloudLayer;
    const pcd = dataView.data;

    let pcdObj = null;

    if (pcd != null) {
      pcdObj = pcd.asObject3D();
    }

    const vectorCreators = Object.values(
      this.#interactContext.vectorCreators,
    ) as VectorCreator[];
    for (const creator of vectorCreators) {
      creator.pcdObj = pcdObj;
    }

    // The source data is part of the interaction gate, and may settle
    // after the label data did.
    this.#applyInteractGate();
  };

  #tooltipModels: {
    key?: React.Key;
    className: string;
    left: string;
    lines: readonly string[];
    top: string;
    visible: boolean;
  }[] = [];

  /**
   * Specifies the settings to apply to the vector labels.
   */
  #settingsInputtedData: VectorSettingsPaneControllerParams["inputtedData"];

  #settingsInternalData: VectorSettingsPaneControllerParams["internalData"];

  #settingsPaneSettings: VectorSettingsPaneControllerParams["settings"];

  /**
   * An accordion containing each tool.
   */
  readonly #toolFolders;

  readonly TOOLS_KEYDOWN_BINDS = [
    {
      keyCombo: "k",
      name: "Draw Polygon",
      handler: () => {
        this.#interactContext.setDrawMode("polygon");
      },
    },
    {
      keyCombo: "l",
      name: "Draw line",
      handler: () => {
        this.#interactContext.setDrawMode("polyline");
      },
    },
    {
      keyCombo: "p",
      name: "Draw Point",
      handler: () => {
        this.#interactContext.setDrawMode("point");
      },
    },
    {
      keyCombo: "w",
      name: "Toggle translate single vertex",
      handler: () => {
        this.#interactContext.vectorTransformer.toggleControlsEnabled("vertex");
      },
    },
    {
      keyCombo: "e",
      name: "Toggle translate all vertices",
      handler: () => {
        this.#interactContext.vectorTransformer.toggleControlsEnabled(
          "vertices",
        );
      },
    },
  ];

  readonly ACTIONS_KEYDOWN_BINDS = actionDefinitions
    .filter((definition) => definition.role === "selectable")
    .map(({ value, keyCombo, keybindName }) => ({
      keyCombo,
      name: keybindName,
      handler: () => {
        this.#interactContext.toggleAction(value);
      },
    }));

  /**
   * Updates the controls menu to display the keybinds in an interaction state,
   * replacing those of the previous interaction state.
   *
   * display the keybinds.
   */
  #updateControlsElem = (interactState: InteractState<WM>) => {
    this.keydownHandler.setChildren([interactState.keydownHandler]);
    this.keyupHandler.setChildren([interactState.keyupHandler]);

    this.setControlsSections([
      { title: "Tools", keybinds: this.TOOLS_KEYDOWN_BINDS },
      { title: "Actions", keybinds: this.ACTIONS_KEYDOWN_BINDS },
      {
        title: "Context",
        keybinds: [...interactState.keydownHandler.iterSubtreeKeybinds()],
      },
    ]);
  };

  /**
   * Handles the event when the active interaction state has changed.
   */
  #onInteractStateChange = (event: InteractContextEventMap<WM>["change"]) => {
    this.#updateControlsElem(event.currentState);

    // The state transition can (re)select the vector to transform and
    // enable/disable the transform controls, both of which change the
    // displayed objects; it also changes the hint.
    this.#markLabelsDirty();
    this.refreshHint();
  };

  /**
   * Handles the event when the selected draw mode has changed.
   */
  #onDrawModeChange = (
    _event: InteractContextEventMap<WM>["draw-mode-change"],
  ) => {
    // The hint of the draw state shows the type of vector being drawn,
    // which depends on the draw mode.
    this.refreshHint();
  };

  /**
   * Handles the event when the hovered object of the vector selector
   * has changed.
   */
  #onVectorHoverChange = (): void => {
    // The display color of a vector depends on whether it is hovered.
    this.#markLabelsDirty();
  };

  /**
   * Handles the event when the selected object of the vector selector
   * has changed.
   */
  #onVectorSelectChange = (): void => {
    // The display color of a vector depends on whether it is selected.
    this.#markLabelsDirty();
  };

  /**
   * Handles the event when the user begins drawing a new vector object.
   */
  #onBeginCreateVector = (): void => {
    // The hint of the draw state depends on whether a vector is being
    // created.
    this.refreshHint();
  };

  /**
   * Handles the event when the user has cancelled drawing a new vector object.
   */
  #onAbortCreateVector = (): void => {
    this.refreshHint();
  };

  /**
   * Handles the event when the user has finished drawing a new vector object.
   */
  #onFinishCreateVector = (): void => {
    // The vector created locally is added to the labels; over-mark
    // dirty in case the index change event has not been delivered yet.
    this.#markLabelsDirty();
    this.refreshHint();
  };

  /**
   * Handles the event when the camera of the main window has changed.
   */
  #onCameraUpdate = (): void => {
    // Only the screen positions of the tooltips depend on the camera,
    // and only while they are shown.
    if (!this.#settingsInputtedData.showTooltips) return;
    if (this.#tooltipModels.length === 0) return;

    this.#markTooltipsDirty();
  };

  /**
   * Handles the event when the settings in the input have been updated.
   *
   * The event to handle
   */
  #onSettingsChange = (
    inputtedData: VectorSettingsPaneControllerParams["inputtedData"],
  ) => {
    this.#settingsInputtedData = inputtedData;
    this.#notifySettingsChange();
    const { strokeColor: newStrokeColor, strokeWidth: newStrokeWidth } =
      this.settingsOutput;

    const vectorCreators = Object.values(
      this.#interactContext.vectorCreators,
    ) as VectorCreator[];

    for (const creator of vectorCreators) {
      creator.strokeColor = new Color(
        newStrokeColor.r,
        newStrokeColor.g,
        newStrokeColor.b,
      );
      creator.strokeWidth = newStrokeWidth;
    }

    // The display colors of the vectors and the visibility of the
    // tooltips depend on the settings.
    this.#markLabelsDirty();
  };

  #renderOverlay = () => {
    this.refreshOverlay();
  };

  get overlayView(): React.JSX.Element {
    return <VectorLayerOverlayView source={this} />;
  }

  get overlaySnapshot() {
    return {
      isActive: this.isActive,
      tooltips: this.#tooltipModels,
    };
  }

  get prefsView(): React.JSX.Element {
    return <VectorPreferencesView />;
  }

  get objectTreeView(): React.JSX.Element {
    return <VectorLabelsTreeHost />;
  }

  /** Applies new vector inspector pane input (editor-intent target). */
  applyVectorInspectorInput(
    inputtedData: LabelVectorInspectorPaneControllerParams["inputtedData"],
  ): void {
    this.#interactContext.vectorInspector.onInputChange(inputtedData);
  }

  /** Selects a vector from the labels tree; `null` deselects
   * (editor-intent target). The coordinator keeps the selection across
   * pointer-selector aborts and clears it itself when the label is
   * (un)loaded away. */
  selectVector(id: UUID | null): void {
    this.#interactContext.vectorInspector.selectedId = id;
  }

  /** Forwards a vector inspector pane event, e.g. the draw-vector toggle
   * (editor-intent target). The coordinator keeps its exact internal
   * ordering, including the input-mirror rebuild the toggle triggers —
   * so the draw flow keeps seeing the same defaults as before. */
  vectorInspectorPaneEvent(event: { type: string }): void {
    this.#interactContext.vectorInspector.onPaneEvent(event);
  }

  get actionsView(): React.JSX.Element {
    return <VectorActionsView />;
  }

  get toolsView(): React.JSX.Element {
    return <AccordionPaneHost folders={this.#toolFolders} />;
  }

  setOverlaySize(width: number, height: number): void {
    this.#canvas.height = height;
    this.#canvas.width = width;

    // Resizing the overlay also resizes the camera frustums, which
    // changes the screen positions of the tooltips (while shown).
    if (this.#settingsInputtedData.showTooltips) {
      this.#markTooltipsDirty();
    }
  }

  /**
   * Creates a new layer for vector labels.
   */
  static create<WM extends WindowMapper & MainWindowMapper>(
    context: SceneContext<WM>,
    name: string,
    pointCloudLayer: PointCloudLayer<WM>,
    groundMeshLayer: GroundMeshLayer<WM>,
    canvas: HTMLCanvasElement,
  ): VectorLayer<WM> {
    const dataView = VectorView.create(context, 0);

    return new VectorLayer(
      context,
      name,
      dataView,
      pointCloudLayer,
      groundMeshLayer,
      canvas,
    );
  }

  /**
   * Creates a new display for label data that updates based on the current frame.
   */
  constructor(
    context: SceneContext<WM>,
    name: string,
    dataView: VectorView,
    pointCloudLayer: PointCloudLayer<WM>,
    groundMeshLayer: GroundMeshLayer<WM>,
    canvas: HTMLCanvasElement,
  ) {
    super(context, name, dataView);

    const config = context.config;
    const layerSettings = getSettings(config);

    this.pointCloudLayer = pointCloudLayer;
    this.groundMeshLayer = groundMeshLayer;

    const pointer = new WindowPointer(context.display.windows.main);
    this.#pointer = pointer;

    const vectorSelectRaycaster = new Raycaster();
    ThreeUtils.setRaycasterLineThreshold(vectorSelectRaycaster, 0.25);
    ThreeUtils.setRaycasterPointsThreshold(vectorSelectRaycaster, 0.25);

    const vectorSelectorGroup = new SceneObjectsGroup({
      objects: {
        [Symbol.iterator]: () => this.iterLabelVectors(),
      },
      raycastFunc: (obj: ReadonlyLabelVector, raycaster) =>
        obj.raycast(raycaster),
    });

    const vectorSelector = pointer.createSelectController({
      groups: [{ group: vectorSelectorGroup, priority: 0 }],
      raycaster: vectorSelectRaycaster,
    });

    const vectCreatorRaycaster = new Raycaster();
    ThreeUtils.setRaycasterPointsThreshold(vectCreatorRaycaster, 0.25);
    ThreeUtils.setRaycasterLineThreshold(vectCreatorRaycaster, 0.25);

    canvas.id = "vector-canvas";
    canvas.hidden = true;
    canvas.addEventListener("contextmenu", this.#onContextMenu);
    this.#canvas = canvas;
    const format = config.coordinateFormat;
    const polygonCreator = new PolygonCreator(
      format,
      pointer,
      vectCreatorRaycaster,
      canvas,
    );
    const polylineCreator = new PolylineCreator(
      format,
      pointer,
      vectCreatorRaycaster,
      canvas,
    );
    const pointCreator = new PointCreator(
      format,
      pointer,
      vectCreatorRaycaster,
      canvas,
    );

    const vectorMonitor = new LabelVectorReformMonitor(context.config);

    const vectorTransformRaycaster = new Raycaster();
    ThreeUtils.setRaycasterPointsThreshold(vectorTransformRaycaster, 0.25);

    const vectorTransformer = new VectorTransformer(
      context.config,
      pointer,
      vectorTransformRaycaster,
    );

    const vectorClipboard = new LabelVectorClipboard();

    this.#settingsInputtedData = layerSettings;
    this.#settingsInternalData = {};
    this.#settingsPaneSettings = { disabled: false, hidden: false };
    this.#renderOverlay();

    for (const keybind of [
      ...this.TOOLS_KEYDOWN_BINDS,
      ...this.ACTIONS_KEYDOWN_BINDS,
    ]) {
      this.keydownHandler.register(keybind);
    }

    this.#interactContext = new InteractContext({
      sceneContext: context,
      dataView: dataView,
      canvas: canvas,
      vectorCreators: {
        polygon: polygonCreator,
        polyline: polylineCreator,
        point: pointCreator,
      },
      vectorSelector: vectorSelector,
      vectorTransformer: vectorTransformer,
      vectorClipboard: vectorClipboard,
      vectorMonitor: vectorMonitor,
    });

    this.#toolFolders = {
      Draw: <VectorDrawModeView />,
      Transform: (
        <VectorTransformerSettingsView transformer={vectorTransformer} />
      ),
      Clipboard: <ClipboardToolView clipboard={vectorClipboard} />,
    };

    this.context.addEventListener("layer-activate", this.#onLayerActivate);

    this.pointCloudLayer.dataView.addEventListener(
      "beforeload",
      this.#onUpdatePointCloud,
    );
    this.pointCloudLayer.dataView.addEventListener(
      "afterload",
      this.#onUpdatePointCloud,
    );

    this.#interactContext.addEventListener(
      "change",
      this.#onInteractStateChange,
    );
    this.#interactContext.addEventListener(
      "draw-mode-change",
      this.#onDrawModeChange,
    );

    // Starts the interaction state machine (initial transition). Set
    // after the listeners above so the initial state update is heard.
    this.#interactContext.disabled = true;

    vectorSelector.addEventListener("hoverin", this.#onVectorHoverChange);
    vectorSelector.addEventListener("hoverout", this.#onVectorHoverChange);
    vectorSelector.addEventListener("selectin", this.#onVectorSelectChange);
    vectorSelector.addEventListener("selectout", this.#onVectorSelectChange);
    vectorTransformer.addEventListener(
      "settings-change",
      this.#markLabelsDirty,
    );

    for (const creator of Object.values(
      this.#interactContext.vectorCreators,
    ) as VectorCreator[]) {
      creator.addEventListener("begin", this.#onBeginCreateVector);
      creator.addEventListener("abort", this.#onAbortCreateVector);
      creator.addEventListener("end", this.#onFinishCreateVector);
    }

    this.#interactContext.mainWindow.addEventListener(
      "camera-update",
      this.#onCameraUpdate,
    );

    // Synchronize the initial state, in case this layer is already
    // active or already has data before the subscriptions above.
    this.#prevIsActive = this.isActive;
    this.#interactContext.layerIsActive = this.isActive;
    this.#subscribeIndexEvents();
  }

  dispose() {
    this.context.removeEventListener("layer-activate", this.#onLayerActivate);

    this.pointCloudLayer.dataView.removeEventListener(
      "beforeload",
      this.#onUpdatePointCloud,
    );
    this.pointCloudLayer.dataView.removeEventListener(
      "afterload",
      this.#onUpdatePointCloud,
    );

    this.#canvas.removeEventListener("contextmenu", this.#onContextMenu);

    const vectorCreators = this.#interactContext.vectorCreators;

    for (const creator of Object.values(vectorCreators) as VectorCreator[]) {
      creator.dispose();
    }

    // The inspector is disposed by the interaction context itself.
    this.#interactContext.vectorTransformer.dispose();
    this.#interactContext.vectorSelector.dispose();
    this.#interactContext.removeEventListener(
      "change",
      this.#onInteractStateChange,
    );
    this.#interactContext.removeEventListener(
      "draw-mode-change",
      this.#onDrawModeChange,
    );

    const vectorSelector = this.#interactContext.vectorSelector;
    vectorSelector.removeEventListener("hoverin", this.#onVectorHoverChange);
    vectorSelector.removeEventListener("hoverout", this.#onVectorHoverChange);
    vectorSelector.removeEventListener("selectin", this.#onVectorSelectChange);
    vectorSelector.removeEventListener("selectout", this.#onVectorSelectChange);
    this.#interactContext.vectorTransformer.removeEventListener(
      "settings-change",
      this.#markLabelsDirty,
    );

    for (const creator of Object.values(vectorCreators) as VectorCreator[]) {
      creator.removeEventListener("begin", this.#onBeginCreateVector);
      creator.removeEventListener("abort", this.#onAbortCreateVector);
      creator.removeEventListener("end", this.#onFinishCreateVector);
    }

    this.#interactContext.mainWindow.removeEventListener(
      "camera-update",
      this.#onCameraUpdate,
    );

    this.#unsubscribeIndexEvents();
    this.#interactContext.dispose();
    this.#pointer.dispose();

    super.dispose();
  }

  /**
   * Iterates through each vector label to display.
   *
   * @yields Each vector label to display.
   */
  *iterLabelVectors(): IterableIterator<ReadonlyLabelVector> {
    const dataView = this.#interactContext.dataView;

    if (dataView === undefined) return;

    for (const vector of dataView.iterLabelVectors()) yield vector;
  }

  /**
   * Test-only e2e probe seam ({@link EditorE2EProbeTargetsContributor}):
   * the world-space point of the vector with the given id, the vertex
   * at `vertex` when given, otherwise the midpoint of the first segment
   * (or the single point of a point vector), or `null` when the probe
   * is disabled or the vector/vertex does not exist. Read-only.
   */
  getE2EProbeLabelPoint(id: UUID, vertex: number | null): Vector3 | null {
    if (!isE2EProbeEnabled()) return null;
    if (!this.dataView.hasLabelVector(id)) return null;

    const coords = this.dataView.getLabelVector(id).vectorCoords;
    if (vertex != null) return coords.at(vertex)?.clone() ?? null;
    if (coords.length >= 2)
      return coords[0].clone().add(coords[1]).multiplyScalar(0.5);
    return coords.at(0)?.clone() ?? null;
  }

  /**
   * Test-only e2e probe seam ({@link EditorE2EProbeTargetsContributor}):
   * the live gizmo handle of the selected vector, or `null` when the
   * probe is disabled or no vector is selected for transformation.
   *
   * For the `vertex` mode, `vertex` selects the vertex handle by index,
   * defaulting to `1` (the middle handle of the default three-vertex
   * fixture line). For the `vertices` mode, the whole-object plane
   * handle at the vertices' bounding box center is returned. Read-only.
   */
  getE2EProbeTransformHandle(
    mode: string,
    vertex: number | null,
  ): Object3D | null {
    if (!isE2EProbeEnabled()) return null;

    const controls = this.#interactContext.vectorTransformer.getControls();
    if (controls == null) return null;

    switch (mode) {
      case "vertex":
        return findVectorVertexHandles(controls).at(vertex ?? 1) ?? null;
      case "vertices":
        return findVectorPlaneHandles(controls).at(0) ?? null;
      default:
        return null;
    }
  }

  /**
   * Test-only e2e probe seam ({@link EditorE2EProbeTargetsContributor}):
   * the id of the vector the selector currently reports as hovered, or
   * `null` when the probe is disabled or nothing is hovered. Read-only.
   */
  getE2EProbeHoveredLabel(): string | null {
    if (!isE2EProbeEnabled()) return null;

    const id = this.#interactContext.vectorSelector.hoveredObj?.id;
    return typeof id === "string" ? id : null;
  }

  /**
   * Test-only e2e probe seam ({@link EditorE2EProbeTargetsContributor}):
   * raycasts the vector selector groups with the given raycaster,
   * returning the candidate vector count and the closest hit id.
   * Read-only.
   */
  getE2EProbeSelectorRaycast(
    raycaster: Raycaster,
  ): { count: number; hitId: string | null } | null {
    if (!isE2EProbeEnabled()) return null;

    let count = 0;
    let hit: ReadonlyLabelVector | null = null;
    for (const group of this.#interactContext.vectorSelector.groups.iterGroups()) {
      for (const _ of group.objects) count += 1;
      hit ??= group.raycast(raycaster);
    }
    const hitId = hit?.id;
    return { count, hitId: typeof hitId === "string" ? hitId : null };
  }

  /**
   * Test-only e2e probe seam ({@link EditorE2EProbeTargetsContributor}):
   * the vector selector's live hover-enabled flag and current raycaster
   * ray. Read-only.
   */
  getE2EProbeSelectorState(): {
    hoverEnabled: boolean;
    ray: { origin: Vector3; direction: Vector3 };
  } | null {
    if (!isE2EProbeEnabled()) return null;

    const selector = this.#interactContext.vectorSelector;
    return {
      hoverEnabled: selector.hoverEnabled,
      ray: {
        origin: selector.raycaster.ray.origin,
        direction: selector.raycaster.ray.direction,
      },
    };
  }

  /**
   * Gets the content to display as a hint to the user when this layer is active.
   *
   * If `null`, no hint is displayed.
   */
  getHint(): React.ReactNode {
    return this.#interactContext.getHint();
  }

  /**
   * `true` between the labels view's `beforeload` and `afterload`; the
   * entity lists map empty while the load is in flight.
   */
  #labelsLoading = false;

  /** Maps this layer's interaction state into its plain editor-state slice. */
  /** Contributes the vector intent group to the editor intents. */
  createEditorIntents(): VectorPluginIntents {
    return {
      vector: {
        setAction: (action) => {
          this.setAction(action);
        },
        setDrawMode: (drawMode) => {
          this.setDrawMode(drawMode);
        },
        setSettings: (values) => {
          this.onSettingsInputChange(values);
        },
        applyVectorInspectorInput: (values) => {
          this.applyVectorInspectorInput(values);
        },
        selectVector: (id) => {
          this.selectVector(id);
        },
        vectorInspectorPaneEvent: (event) => {
          this.vectorInspectorPaneEvent(event);
        },
      },
    };
  }

  mapEditorSlice(previous: VectorSlice | null): VectorSlice {
    const { vectorClipboard } = this.#interactContext;
    return mapVectorSlice(
      {
        action: this.#interactContext.action,
        drawMode: this.#interactContext.drawMode,
        disabled: this.#interactContext.disabled,
        selectedVectorId: this.#interactContext.selectedVectorId,
        drawVectorActive: this.#interactContext.drawVectorActive,
        vectorInspectorDisabled: this.#interactContext.vectorInspectorDisabled,
        clipboard: vectorClipboard.getViewState(),
        settings: {
          values: this.#settingsInputtedData,
          disabled: this.#settingsPaneSettings.disabled,
        },
        labels: this.#labelsLoading ? null : this.dataView,
      },
      previous,
    );
  }

  /** Subscribes to every event that can change this layer's editor-state slice. */
  subscribeEditorSlice(listener: () => void): () => void {
    const { vectorSelector, vectorClipboard } = this.#interactContext;
    const context = this.#interactContext;

    context.addEventListener("action-change", listener);
    context.addEventListener("draw-mode-change", listener);
    // State transitions move the selected vector and the per-inspector
    // disabled state; they complement (not replace) the other sources.
    context.addEventListener("change", listener);
    vectorSelector.addEventListener("selectin", listener);
    vectorSelector.addEventListener("selectout", listener);
    vectorClipboard.addEventListener("change", listener);
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
      vectorSelector.removeEventListener("selectin", listener);
      vectorSelector.removeEventListener("selectout", listener);
      vectorClipboard.removeEventListener("change", listener);
      this.removeEventListener("settings-change", listener);
    };
  }

  /** Selects the interaction action (editor-intent target). */
  setAction(action: Action): void {
    this.#interactContext.setAction(action);
  }

  /** Selects the type of vector drawn while drawing (editor-intent target). */
  setDrawMode(drawMode: DrawMode): void {
    this.#interactContext.setDrawMode(drawMode);
  }

  /**
   * Updates how a vector object is displayed
   */
  #renderVector(vector: ReadonlyLabelVector) {
    const dataView = this.#interactContext.dataView;
    const { selectedVectorColor, hoveredVectorColor } = this.settingsOutput;

    const showColor = getVectorInteractionColor(
      vector,
      this.#interactContext.vectorSelector.selectedObj,
      this.#interactContext.vectorSelector.hoveredObj,
      selectedVectorColor,
      hoveredVectorColor,
    );

    dataView.setLabelVectorDisplayParams(vector, { showColor });

    return vector;
  }

  /**
   * Builds the tooltip model for a vector object.
   */
  #getTooltipModel(vector: ReadonlyLabelVector) {
    const mainCamera = this.#interactContext.mainWindow.getCamera();
    const { showTooltips, showVectorId } = this.settingsOutput;

    const vectorFirstVertexNDC = vector.vectorCoords
      .at(0)
      ?.clone()
      .project(mainCamera);
    if (vectorFirstVertexNDC == null) {
      throw Error(
        `Not a valid vector object with empty vertices ${JSON.stringify(vector.vectorCoords)}`,
      );
    }

    const relPos = ThreeUtils.getNDCRelPos(vectorFirstVertexNDC);

    const { className, lines, visible } = getVectorTooltipContent({
      vectorId: vector.id,
      displayClassName: vector.gtClass?.name ?? null,
      showTooltips,
      showVectorId,
    });

    return {
      className,
      left: `${relPos.x * 100}%`,
      lines,
      top: `${relPos.y * 100}%`,
      visible,
    };
  }

  /**
   * Rebuilds the display colors, the scene objects, and the tooltip
   * models of the vector labels.
   *
   * This is called only when the labels are dirty, rather than during
   * each animation frame.
   */
  #renderLabels() {
    const { dataView, vectorTransformer } = this.#interactContext;

    this.objects.clear();

    const { data } = dataView;
    if (data == null) {
      this.#tooltipModels = [];
      this.#renderOverlay();
      this.refreshObjects();
      return;
    }

    const vectors = [...this.iterLabelVectors()];

    this.#tooltipModels = vectors.map((vector) => {
      this.#renderVector(vector);
      this.objects.add(vector.asObject3D());

      return this.#getTooltipModel(vector);
    });
    this.#renderOverlay();

    const vectorTransformerControls = vectorTransformer.getControls();
    if (vectorTransformerControls != null) {
      this.objects.add(vectorTransformerControls);
    }
    this.refreshObjects();
  }

  /**
   * Rebuilds only the tooltip models, updating the screen positions of
   * the tooltips without touching the vector labels.
   *
   * This is called only when the tooltips are dirty, e.g. when the
   * camera moves while the tooltips are shown.
   */
  #renderTooltips() {
    const { data } = this.#interactContext.dataView;
    if (data == null) {
      this.#tooltipModels = [];
      this.#renderOverlay();
      return;
    }

    this.#tooltipModels = [...this.iterLabelVectors()].map((vector) =>
      this.#getTooltipModel(vector),
    );
    this.#renderOverlay();
  }

  render() {
    // Avoid querying frames when the task is changing
    if (this.context.isNavigating) return;

    // Skip the per-frame work when nothing has changed since the
    // previous render; the dirty flags are set by the event handlers
    // of this object whenever the labels or the tooltips can change.
    if (!this.#labelsDirty && !this.#tooltipsDirty) return;

    // Clear the flags before rebuilding, so that events dispatched
    // synchronously during the rebuild (e.g. the display color writes
    // of {@link VectorLayer.#renderVector}) mark this object dirty
    // again instead of being lost.
    if (this.#labelsDirty) {
      this.#labelsDirty = false;
      this.#tooltipsDirty = false;
      this.#renderLabels();
    } else {
      this.#tooltipsDirty = false;
      this.#renderTooltips();
    }
  }

  get settingsPaneParams(): Pick<
    VectorSettingsPaneControllerParams,
    "inputtedData" | "computedData" | "internalData" | "settings"
  > {
    return {
      inputtedData: this.#settingsInputtedData,
      computedData: {},
      internalData: this.#settingsInternalData,
      settings: this.#settingsPaneSettings,
    };
  }

  get settingsOutput(): VectorSettings {
    return getVectorSettingsOutputData(this.settingsPaneParams);
  }

  onSettingsInputChange = (
    inputtedData: VectorSettingsPaneControllerParams["inputtedData"],
  ): void => {
    this.#onSettingsChange(inputtedData);
  };

  #notifySettingsChange(): void {
    this.dispatchEvent({ type: "settings-change" });
  }
}
