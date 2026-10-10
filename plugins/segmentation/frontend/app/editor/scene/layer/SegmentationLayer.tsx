import { default as React } from "react";
import { PointCloudLayer } from "sta-pcd/app";
import { Color, Raycaster, type Object3D, type Vector3 } from "three";

import {
  LabelDataLayer,
  WindowPointer,
  SceneObjectsGroup,
  AccordionPaneHost,
  subscribeDataIndexLifecycle,
  isE2EProbeEnabled,
} from "sta/app/editor";
import type {
  EditorE2EProbeTargetsContributor,
  EditorOverlayViewsContributor,
  EditorSliceContributor,
  LayerCollectionEventMap,
  SceneContext,
} from "sta/app/editor";
import { ThreeUtils } from "sta/common";

import { getSettings } from "../../config";
import {
  SelectionEditControls,
  SelectionEditControlsView,
  AssistedSelectionEditControl,
  AssistedSelectionEditControlView,
} from "../controls";
import {
  ALL_EVENT_TYPES,
  SegmentationView,
  LabelSelectionReformMonitor,
} from "../data";
import type {
  ReadonlyLabelInstance,
  ReadonlyLabelSelection,
  ReadonlySegmentationIndex,
  UUID,
} from "../data";
import {
  LassoCurator,
  PolygonCurator,
  RectangleCurator,
  BrushCurator,
  PointPrompter,
} from "../tools";
import { PointCloudUtils } from "../utils";
import { SegmentationLabelsTreeHost } from "../widgets";
import { actionDefinitions } from "../widgets/ActionPane.ts";
import type { Action } from "../widgets/ActionPane.ts";
import type { DrawMode } from "../widgets/DrawModePane.react.tsx";
import type { EditMode } from "../widgets/EditModePane.react.tsx";
import type { LabelInstanceInspectorPaneControllerParams } from "../widgets/LabelInstanceInspectorPane.ts";
import type { LabelSelectionInspectorPaneControllerParams } from "../widgets/LabelSelectionInspectorPane.ts";
import {
  getSegmentationSettingsOutputData,
  segmentationSettingsPaneMaxBrushDiameter,
  segmentationSettingsPaneMaxBrushHueStyle,
  segmentationSettingsPaneMaxTimePathRange,
} from "../widgets/SegmentationSettingsPane.react.tsx";
import type {
  SegmentationSettings,
  SegmentationSettingsPaneControllerParams,
} from "../widgets/SegmentationSettingsPane.react.tsx";

import { InteractContext } from "./InteractContext";
import { shouldDisableSegmentationInteraction } from "./InteractionGate";
import type {
  InteractContextEventMap,
  InteractState,
  MainWindowMapper,
} from "./InteractContext";
import {
  SegmentationActionsView,
  SegmentationDrawModeView,
  SegmentationLayerOverlayView,
  SegmentationPreferencesView,
} from "./SegmentationLayer.react.tsx";
import { mapSegmentationSlice } from "./SegmentationSlice";
import type {
  SegmentationPluginIntents,
  SegmentationSlice,
} from "./SegmentationSlice";
import { getSegmentationTooltipContent } from "./SegmentationTooltip";

export function getSegmentationInteractionColor(
  selection: ReadonlyLabelSelection,
  selectedSelection: ReadonlyLabelSelection | null,
  hoveredSelection: ReadonlyLabelSelection | null,
  selectedColor: Readonly<{ r: number; g: number; b: number }>,
  hoveredColor: Readonly<{ r: number; g: number; b: number }>,
): Color | null {
  const color =
    selection === selectedSelection
      ? selectedColor
      : selection === hoveredSelection
        ? hoveredColor
        : null;
  return color == null ? null : new Color(color.r, color.g, color.b);
}

/** Resolves the point material opacity from the transparency preference. */
export function getSelectionDisplayOpacity(
  transparent: boolean,
  opacity: number,
): number {
  return transparent ? opacity : 1;
}

/** Allocates a global point budget proportionally while preserving the exact total. */

/**
 * Facilitates user interaction with the segmentation labels for the current frame.
 */
export class SegmentationLayer<WM extends MainWindowMapper>
  extends LabelDataLayer<WM, ReadonlySegmentationIndex>
  implements
    EditorE2EProbeTargetsContributor,
    EditorOverlayViewsContributor,
    EditorSliceContributor<SegmentationSlice>
{
  /** Narrows the inherited data view to the segmentation-specific view. */
  declare readonly dataView: SegmentationView;

  onBeforeUpdateData() {
    this.#settingsPaneSettings = {
      ...this.#settingsPaneSettings,
      disabled: true,
    };
    this.#notifySettingsChange();
    this.#interactContext.disabled = true;

    // The label data is about to be replaced, and the state may
    // re-select objects in response, changing the hint as well.
    this.#markLabelsDirty();
    this.refreshHint();
  }

  /**
   * Applies the interaction gate: creation/editing is only available once
   * the layer's complete prerequisite set is ready, it is active, its
   * label data is loaded, and its source data (the point cloud queried by
   * the curators and the assistant) is loaded.
   */
  #applyInteractGate() {
    const { isActive } = this;
    const { data } = this.dataView;
    const pointCloudUtils = this.#interactContext.pointCloudUtils;

    this.#interactContext.disabled = shouldDisableSegmentationInteraction(
      isActive,
      data,
      pointCloudUtils,
    );
  }

  onAfterUpdateData() {
    this.#settingsPaneSettings = {
      ...this.#settingsPaneSettings,
      disabled: false,
    };
    this.#notifySettingsChange();
    this.#applyInteractGate();

    // The label data has been replaced, and the state may have
    // re-selected objects in response, changing the hint as well.
    this.#markLabelsDirty();
    this.refreshHint();
  }

  /**
   * Handles the event when a layer has been activated.
   */
  #onLayerActivate = (
    _event: LayerCollectionEventMap<WM>["layer-activate"],
  ) => {
    const { isActive } = this;

    this.#interactContext.layerIsActive = isActive;
    this.#applyInteractGate();

    // The overlay snapshot contains the activation state of this layer,
    // and enabling the curators of this layer may change the hint.
    this.#renderOverlay();
    this.refreshHint();
  };

  readonly #interactContext: InteractContext<WM>;

  /**
   * A layer that displays the point cloud for the current frame.
   */
  readonly pointCloudLayer: any;

  /**
   * Handles the event when the active point cloud is switched to a different one.
   */
  #onUpdatePointCloud = () => {
    const { dataView } = this.pointCloudLayer;
    const pcd = dataView.data;
    const pcdId = this.context.currentFrame?.id ?? null;

    // A newer point cloud supersedes any encoding still in flight, so the
    // assistant never predicts against a cloud other than the displayed one.
    this.#encodeAbort?.abort();
    this.#encodeAbort = null;

    let pcdUtils: PointCloudUtils | null = null;

    if (pcd != null) {
      pcdUtils = new PointCloudUtils(
        pcd.buffer.clone(),
        pcd.position.clone(),
        pcd.pointSize,
      );

      if (pcdId == null) {
        pcdUtils.finishEncode(false);
      } else {
        const encodeAbort = new AbortController();
        this.#encodeAbort = encodeAbort;
        const encodeTarget = pcdUtils;

        // The reference implementation encodes from this afterload handler.
        // Reuse the one health probe if it is still in flight, then issue one
        // upload for this loaded frame.
        void this.#checkAssistantHealthOnce()
          .then(() => {
            if (encodeAbort.signal.aborted || !this.#isAssistantAvailable)
              return false;

            const pcdArr = encodeTarget.getPointsAsFloat32();
            return this.#interactContext.dataView.encodePointCloud(
              pcdArr,
              pcd.buffer.numPoints,
              pcdId,
              encodeAbort.signal,
            );
          })
          .then((encoded) => encodeTarget.finishEncode(encoded));
      }

      const pointPrompter =
        this.#interactContext.assistedSelectionController.pointPrompter;
      pointPrompter.pcdUtils = pcdUtils;
      pointPrompter.pcdObj = pcd.asObject3D();
    }

    this.#interactContext.pointCloudUtils = pcdUtils;

    // The source data is part of the interaction gate, and may settle
    // after the label data did.
    this.#applyInteractGate();

    // The point size of the displayed selections depends on the point cloud.
    this.#markLabelsDirty();
  };

  #canvas: HTMLCanvasElement;

  /** Suppresses the browser menu so right-click can be a background prompt. */
  #onContextMenu = (event: Event): void => event.preventDefault();

  /**
   * Aborts the in-flight point cloud encoding when a newer point cloud
   * supersedes the one being encoded.
   */
  #encodeAbort: AbortController | null = null;

  #tooltipModels: {
    key?: React.Key;
    className: string;
    left: string;
    lines: readonly string[];
    top: string;
    visible: boolean;
  }[] = [];

  /**
   * `true` if the display of the labels and the scene objects of this layer
   * need to be updated; otherwise, `false`.
   *
   * This is marked dirty through the events of the components the display
   * depends on, and consumed by {@link SegmentationLayer#render}, which no
   * longer performs this work every frame.
   */
  #labelsDirty = true;

  /**
   * `true` if the models of the selection tooltips need to be updated;
   * otherwise, `false`.
   *
   * Unlike {@link SegmentationLayer#labelsDirty}, this can be marked dirty
   * on its own when only the screen positions of the tooltips change
   * (i.e. when the camera moves while the tooltips are visible).
   */
  #tooltipsDirty = true;

  /**
   * Marks the display of the labels (and thereby the tooltip models,
   * which are derived from the same selections) as needing an update.
   */
  #markLabelsDirty = (): void => {
    this.#labelsDirty = true;
    this.#tooltipsDirty = true;
    this.requestRender();
  };

  /**
   * Marks the tooltip models as needing an update.
   */
  #markTooltipsDirty = (): void => {
    this.#tooltipsDirty = true;
    this.requestRender();
  };

  /**
   * An accordion containing each tool.
   */
  readonly #toolFolders: Record<string, React.JSX.Element>;

  readonly TOOLS_KEYDOWN_BINDS = [
    {
      keyCombo: "p",
      name: "Query with Polygon",
      handler: () => {
        this.#interactContext.setDrawMode("polygon");
      },
    },
    {
      keyCombo: "r",
      name: "Query with Rectangle",
      handler: () => {
        this.#interactContext.setDrawMode("box");
      },
    },
    {
      keyCombo: "l",
      name: "Query with Lasso",
      handler: () => {
        this.#interactContext.setDrawMode("lasso");
      },
    },
    {
      keyCombo: "b",
      name: "Query with Brush",
      handler: () => {
        this.#interactContext.setDrawMode("brush");
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

  readonly PREFS_KEYDOWN_BINDS = [
    {
      keyCombo: "q",
      name: "Toggle selection transparency",
      handler: () => {
        if (this.#settingsPaneSettings.disabled) return;
        this.#onSettingsChange({
          ...this.#settingsInputtedData,
          selectionTransparency:
            !this.#settingsInputtedData.selectionTransparency,
        });
      },
    },
  ];

  /**
   * Specifies the settings to apply to the segmentation labels.
   */
  #settingsInputtedData: SegmentationSettingsPaneControllerParams["inputtedData"];

  #settingsInternalData: SegmentationSettingsPaneControllerParams["internalData"];

  #settingsPaneSettings: SegmentationSettingsPaneControllerParams["settings"];

  /** Backend-reported assistant availability and its single health probe. */
  #isAssistantAvailable = false;

  #assistantHealthAbort: AbortController | null = null;

  #assistantHealthPromise: Promise<void> | null = null;

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
      { title: "Preferences", keybinds: this.PREFS_KEYDOWN_BINDS },
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

    // The new state may re-select objects, which changes the display
    // of the selections, and the hint is specific to each state.
    this.#markLabelsDirty();
    this.refreshHint();
  };

  /**
   * Handles the event when the active action has changed.
   *
   * The action determines which curator is enabled, which the hint
   * of the draw state depends on.
   */
  #onInteractActionChange = (
    _event: InteractContextEventMap<WM>["action-change"],
  ) => {
    this.refreshHint();
  };

  /**
   * Handles the event when the active draw mode has changed.
   *
   * The draw mode determines which curator is enabled, which the hint
   * of the draw state depends on.
   */
  #onInteractDrawModeChange = (
    _event: InteractContextEventMap<WM>["draw-mode-change"],
  ) => {
    this.refreshHint();
  };

  /**
   * Handles the event when the camera of the main window has been updated.
   *
   * The screen positions of the tooltips continuously depend on the camera;
   * while no tooltips are visible, no update is needed.
   */
  #onCameraUpdate = (): void => {
    if (this.settingsOutput.showTooltips) {
      this.#markTooltipsDirty();
    }
  };

  /**
   * Handles the event when the hovered or selected selection has changed,
   * as the display of the selections depends on it.
   */
  #onSelectionSelectorChange = (): void => {
    this.#markLabelsDirty();
  };

  /**
   * Handles the event when the selection controller has internally changed
   * (e.g. when the edit mode is switched), which the hint of the draw state
   * depends on.
   */
  #onSelectionControllerChange = (): void => {
    this.refreshHint();
  };

  /**
   * Handles the event when creating or updating a selection has finished
   * or has been aborted, as the displayed selection points depend on it.
   */
  #onSelectionControllerEdit = (): void => {
    this.#markLabelsDirty();
    this.refreshHint();
  };

  /**
   * Handles the event when a branch has been edited.
   *
   * The labels of this layer are modified in-place by such edits,
   * so the display needs to be updated.
   */
  #onEditBranch = (): void => {
    this.#markLabelsDirty();
  };

  /**
   * Handles the event when the points prompted to the labeling assistant
   * have changed, as the displayed prompt markers depend on them.
   */
  #onPromptedPointsChange = (): void => {
    this.#markLabelsDirty();
  };

  /**
   * Handles the event when the settings in the input have been updated.
   *
   * The event to handle.
   */
  #onSettingsChange = (
    inputtedData: SegmentationSettingsPaneControllerParams["inputtedData"],
  ) => {
    this.#settingsInputtedData = inputtedData;
    this.#notifySettingsChange();
    const {
      useAssistant,
      strokeColor,
      brushDiameter,
      timePathRange,
      brushHueStyle,
    } = this.settingsOutput;
    const dataView = this.#interactContext.dataView;
    const brush = this.#interactContext.selectionController.curators.brush;

    dataView.timePathRange = timePathRange;
    brush.diameter = brushDiameter;
    brush.hue = brushHueStyle;

    this.#interactContext.useAssistant =
      this.#isAssistantAvailable && useAssistant;

    const selectionCurators = Object.values(
      this.#interactContext.selectionController.curators,
    );

    for (const curator of selectionCurators) {
      curator.strokeColor = new Color(
        strokeColor.r,
        strokeColor.g,
        strokeColor.b,
      );
    }

    // The display of the selections and the visibility of the tooltips
    // depend on these settings.
    this.#markLabelsDirty();
  };

  /** Refreshes assistant availability through the backend-owned health check. */
  async #refreshAssistantHealth(): Promise<void> {
    this.#assistantHealthAbort?.abort();
    const controller = new AbortController();
    this.#assistantHealthAbort = controller;

    const isAssistantAvailable = await this.dataView.isAssistantAvailable(
      controller.signal,
    );
    if (controller.signal.aborted || this.#assistantHealthAbort !== controller)
      return;

    this.#isAssistantAvailable = isAssistantAvailable;
    this.#settingsPaneSettings = {
      ...this.#settingsPaneSettings,
      isAssistantAvailable,
    };
    this.#interactContext.useAssistant =
      isAssistantAvailable && this.#settingsInputtedData.useAssistant;
    this.#notifySettingsChange();
  }

  /** Probes once for this editor-layer lifetime. */
  #checkAssistantHealthOnce(): Promise<void> {
    this.#assistantHealthPromise ??= this.#refreshAssistantHealth();
    return this.#assistantHealthPromise;
  }

  #renderOverlay = () => {
    this.refreshOverlay();
  };

  get overlayView(): React.JSX.Element {
    return <SegmentationLayerOverlayView source={this} />;
  }

  get overlaySnapshot() {
    const { selectionController } = this.#interactContext;
    const brush = selectionController.curators.brush;
    return {
      brushCursor: brush.cursor,
      brushCursorView: brush.cursorView,
      isActive: this.isActive,
      tooltips: this.#tooltipModels,
    };
  }

  /** Renders the brush cursor view inside the `brushCursor` overlay slot DOM. */
  get editorOverlayViews(): Readonly<Record<string, React.ReactNode>> {
    return { brushCursor: this.overlaySnapshot.brushCursorView };
  }

  get actionsView(): React.JSX.Element {
    return <SegmentationActionsView />;
  }

  get toolsView(): React.JSX.Element {
    return <AccordionPaneHost folders={this.#toolFolders} />;
  }

  get prefsView(): React.JSX.Element {
    return <SegmentationPreferencesView />;
  }

  setOverlaySize(width: number, height: number): void {
    this.#canvas.height = height;
    this.#canvas.width = width;
  }

  get objectTreeView(): React.JSX.Element {
    return <SegmentationLabelsTreeHost />;
  }

  /** Applies new instance inspector pane input (editor-intent target). */
  applyInstanceInspectorInput(
    inputtedData: LabelInstanceInspectorPaneControllerParams["inputtedData"],
  ): void {
    this.#interactContext.instanceInspector.onInputChange(inputtedData);
  }

  /** Applies new selection inspector pane input (editor-intent target). */
  applySelectionInspectorInput(
    inputtedData: LabelSelectionInspectorPaneControllerParams["inputtedData"],
  ): void {
    this.#interactContext.selectionInspector.onInputChange(inputtedData);
  }

  /** Selects an instance from the labels tree; `null` deselects
   * (editor-intent target). The coordinator keeps the selection across
   * pointer-selector aborts and clears it itself when the label is
   * (un)loaded away. */
  selectInstance(id: UUID | null): void {
    this.#interactContext.instanceInspector.selectedId = id;
  }

  /** Selects a selection from the labels tree; `null` deselects
   * (editor-intent target). */
  selectSelection(id: UUID | null): void {
    this.#interactContext.selectionInspector.selectedId = id;
  }

  /** Forwards an instance inspector pane event, e.g. create-instance
   * (editor-intent target). */
  instanceInspectorPaneEvent(event: { type: string }): void {
    this.#interactContext.instanceInspector.onPaneEvent(event);
  }

  /** Forwards a selection inspector pane event, e.g. the draw-selection
   * toggle (editor-intent target). The coordinator keeps its exact internal
   * ordering, including the input-mirror rebuild the toggle triggers —
   * so the draw flow keeps seeing the same defaults as before. */
  selectionInspectorPaneEvent(event: { type: string }): void {
    this.#interactContext.selectionInspector.onPaneEvent(event);
  }

  /**
   * Creates a new layer for segmentation labels.
   */
  static create<WM extends MainWindowMapper>(
    context: SceneContext<WM>,
    name: string,
    pointCloudLayer: PointCloudLayer<WM>,
    canvas: HTMLCanvasElement,
    brushCursor: HTMLDivElement,
  ): SegmentationLayer<WM> {
    // timePathRange is set when #onSettingsChange is called
    const dataView = SegmentationView.create(context, 0);

    return new SegmentationLayer(
      context,
      name,
      dataView,
      pointCloudLayer,
      canvas,
      brushCursor,
    );
  }

  /**
   * Creates a new display for label data that updates based on the current frame.
   */
  constructor(
    context: SceneContext<WM>,
    name: string,
    dataView: SegmentationView,
    pointCloudLayer: PointCloudLayer<WM>,
    canvas: HTMLCanvasElement,
    brushCursor: HTMLDivElement,
  ) {
    super(context, name, dataView);

    const config = context.config;
    const settings = getSettings(config);

    this.pointCloudLayer = pointCloudLayer;

    const pointer = new WindowPointer(this.context.display.windows.main);

    const selectionSelectRaycaster = new Raycaster();
    ThreeUtils.setRaycasterPointsThreshold(selectionSelectRaycaster, 0.5);

    const selectionSelectorGroup = new SceneObjectsGroup({
      objects: {
        [Symbol.iterator]: () => {
          return this.iterLabelSelections();
        },
      },
      raycastFunc: (obj, raycaster) => obj.raycast(raycaster),
    });

    const selectionSelector =
      pointer.createSelectController<ReadonlyLabelSelection>({
        groups: [{ group: selectionSelectorGroup, priority: 0 }],
        raycaster: selectionSelectRaycaster,
      });

    canvas.id = "segmentation-canvas";
    canvas.hidden = true;
    canvas.addEventListener("contextmenu", this.#onContextMenu);
    // The overlay has `pointer-events: none`; pointer events target the scene
    // window underneath it, so that is where the native context menu must also
    // be suppressed.
    context.display.windows.main.dom.addEventListener(
      "contextmenu",
      this.#onContextMenu,
    );
    this.#canvas = canvas;
    const selectionCuratorRaycaster = new Raycaster();
    ThreeUtils.setRaycasterPointsThreshold(selectionCuratorRaycaster, 0.25);

    const assistantRaycaster = new Raycaster();
    ThreeUtils.setRaycasterPointsThreshold(assistantRaycaster, 0.1);

    const polygonCurator = new PolygonCurator(
      pointer,
      selectionCuratorRaycaster,
      canvas,
    );
    const lassoCurator = new LassoCurator(
      pointer,
      selectionCuratorRaycaster,
      canvas,
    );
    const rectangleCurator = new RectangleCurator(
      pointer,
      selectionCuratorRaycaster,
      canvas,
    );
    const brushCurator = new BrushCurator(
      pointer,
      selectionCuratorRaycaster,
      canvas,
      brushCursor,
    );

    const pointPrompter = new PointPrompter(
      pointer,
      assistantRaycaster,
      canvas,
    );

    const selectionController = new SelectionEditControls({
      polygon: polygonCurator,
      lasso: lassoCurator,
      box: rectangleCurator,
      brush: brushCurator,
    });

    const assistedSelectionController = new AssistedSelectionEditControl(
      pointPrompter,
    );

    const selectionMonitor = new LabelSelectionReformMonitor();

    brushCurator.addEventListener("cursor-change", this.#renderOverlay);
    this.#settingsInputtedData = settings;
    this.#settingsInternalData = {};
    this.#settingsPaneSettings = {
      disabled: false,
      hidden: false,
      isAssistantAvailable: false,
      maxTimePathRange: segmentationSettingsPaneMaxTimePathRange,
      maxBrushDiameter: segmentationSettingsPaneMaxBrushDiameter,
      maxBrushHueStyle: segmentationSettingsPaneMaxBrushHueStyle,
    };
    this.#renderOverlay();

    this.#interactContext = new InteractContext({
      sceneContext: context,
      dataView: dataView,
      canvas: canvas,
      selectionSelector: selectionSelector,
      pointCloudUtils: null,
      selectionMonitor: selectionMonitor,
      selectionController: selectionController,
      assistedSelectionController: assistedSelectionController,
      autoInstances: true,
    });

    this.#toolFolders = {
      Draw: <SegmentationDrawModeView />,
      Modify: <SelectionEditControlsView />,
    };

    this.#toolFolders.Assistant = (
      <AssistedSelectionEditControlView
        assistedSelectionController={assistedSelectionController}
      />
    );

    this.#interactContext.layerIsActive = this.isActive;

    this.context.addEventListener("layer-activate", this.#onLayerActivate);

    this.pointCloudLayer.dataView.addEventListener(
      "afterload",
      this.#onUpdatePointCloud,
    );

    for (const keybind of [
      ...this.TOOLS_KEYDOWN_BINDS,
      ...this.ACTIONS_KEYDOWN_BINDS,
      ...this.PREFS_KEYDOWN_BINDS,
    ]) {
      this.keydownHandler.register(keybind);
    }

    this.#interactContext.addEventListener(
      "change",
      this.#onInteractStateChange,
    );

    void this.#checkAssistantHealthOnce();
    this.#interactContext.addEventListener(
      "action-change",
      this.#onInteractActionChange,
    );
    this.#interactContext.addEventListener(
      "draw-mode-change",
      this.#onInteractDrawModeChange,
    );

    // Starts the interaction state machine (initial transition). Set
    // after the listeners above so the initial state update is heard.
    this.#interactContext.disabled = true;

    // The labels of this layer are modified in-place by branch edits,
    // and the hint depends on the enabled curators.
    this.context.addEventListener("edit-branch", this.#onEditBranch);

    // The screen positions of the tooltips continuously depend on the camera.
    this.#interactContext.mainWindow.addEventListener(
      "camera-update",
      this.#onCameraUpdate,
    );

    // The display of the selections depends on the hovered/selected selection.
    selectionSelector.addEventListener(
      "hoverin",
      this.#onSelectionSelectorChange,
    );
    selectionSelector.addEventListener(
      "hoverout",
      this.#onSelectionSelectorChange,
    );
    selectionSelector.addEventListener(
      "selectin",
      this.#onSelectionSelectorChange,
    );
    selectionSelector.addEventListener(
      "selectout",
      this.#onSelectionSelectorChange,
    );

    // The hint of the draw state depends on the internal state of the
    // selection controller, and the displayed points on its edits.
    selectionController.addEventListener(
      "change",
      this.#onSelectionControllerChange,
    );
    selectionController.addEventListener(
      "abort",
      this.#onSelectionControllerEdit,
    );
    selectionController.addEventListener(
      "create",
      this.#onSelectionControllerEdit,
    );
    selectionController.addEventListener(
      "update",
      this.#onSelectionControllerEdit,
    );

    // The displayed prompt markers depend on the prompted points.
    assistedSelectionController.pointPrompter.addEventListener(
      "end",
      this.#onPromptedPointsChange,
    );
    assistedSelectionController.addEventListener(
      "abort",
      this.#onPromptedPointsChange,
    );
  }

  dispose() {
    this.context.removeEventListener("layer-activate", this.#onLayerActivate);
    this.context.removeEventListener("edit-branch", this.#onEditBranch);

    this.pointCloudLayer.dataView.removeEventListener(
      "afterload",
      this.#onUpdatePointCloud,
    );

    this.#canvas.removeEventListener("contextmenu", this.#onContextMenu);
    this.context.display.windows.main.dom.removeEventListener(
      "contextmenu",
      this.#onContextMenu,
    );

    // No encoding may outlive this layer
    this.#encodeAbort?.abort();
    this.#encodeAbort = null;
    this.#assistantHealthAbort?.abort();
    this.#assistantHealthAbort = null;

    const selectionCurators =
      this.#interactContext.selectionController.curators;
    selectionCurators.brush.removeEventListener(
      "cursor-change",
      this.#renderOverlay,
    );

    for (const curator of Object.values(selectionCurators)) {
      curator.dispose();
    }

    this.#interactContext.mainWindow.removeEventListener(
      "camera-update",
      this.#onCameraUpdate,
    );

    const {
      selectionSelector,
      selectionController,
      assistedSelectionController,
    } = this.#interactContext;

    selectionSelector.removeEventListener(
      "hoverin",
      this.#onSelectionSelectorChange,
    );
    selectionSelector.removeEventListener(
      "hoverout",
      this.#onSelectionSelectorChange,
    );
    selectionSelector.removeEventListener(
      "selectin",
      this.#onSelectionSelectorChange,
    );
    selectionSelector.removeEventListener(
      "selectout",
      this.#onSelectionSelectorChange,
    );
    selectionSelector.dispose();

    selectionController.removeEventListener(
      "change",
      this.#onSelectionControllerChange,
    );
    selectionController.removeEventListener(
      "abort",
      this.#onSelectionControllerEdit,
    );
    selectionController.removeEventListener(
      "create",
      this.#onSelectionControllerEdit,
    );
    selectionController.removeEventListener(
      "update",
      this.#onSelectionControllerEdit,
    );

    assistedSelectionController.pointPrompter.removeEventListener(
      "end",
      this.#onPromptedPointsChange,
    );
    assistedSelectionController.removeEventListener(
      "abort",
      this.#onPromptedPointsChange,
    );
    assistedSelectionController.pointPrompter.dispose();
    assistedSelectionController.prompts.dispose();
    assistedSelectionController.dispose();

    this.#interactContext.removeEventListener(
      "change",
      this.#onInteractStateChange,
    );
    this.#interactContext.removeEventListener(
      "action-change",
      this.#onInteractActionChange,
    );
    this.#interactContext.removeEventListener(
      "draw-mode-change",
      this.#onInteractDrawModeChange,
    );
    this.#interactContext.dispose();

    super.dispose();
  }

  /**
   * Iterates through each selection label to display.
   */
  *iterLabelSelections(): IterableIterator<ReadonlyLabelSelection> {
    const dataView = this.#interactContext.dataView;

    if (dataView === undefined) return;

    for (const selection of dataView.iterLabelSelections()) yield selection;
  }

  /**
   * Iterates through each object instance to display.
   */
  *iterLabelInstances(): IterableIterator<ReadonlyLabelInstance> {
    const dataView = this.#interactContext.dataView;

    // This may be called in the constructor so it may not be initialized yet
    if (dataView === undefined) return;

    for (const instance of dataView.iterLabelInstances()) yield instance;
  }

  /**
   * Test-only e2e probe seam ({@link EditorE2EProbeTargetsContributor}):
   * the world-space point at index `point` (default `0`) of the
   * selection with the given id, or `null` when the probe is disabled
   * or the selection/point does not exist. Read-only.
   */
  getE2EProbeLabelPoint(id: UUID, point: number | null): Vector3 | null {
    if (!isE2EProbeEnabled()) return null;
    if (!this.dataView.hasLabelSelection(id)) return null;

    // `pointCoords` are three.js (world) coordinates, unlike `points`,
    // which are database coordinates.
    const coords = this.dataView.getLabelSelection(id).pointCoords;
    return coords[point ?? 0]?.clone() ?? null;
  }

  /**
   * Test-only e2e probe seam ({@link EditorE2EProbeTargetsContributor}):
   * segmentation selections have no gizmo targets in the probe, so this
   * is always `null`. Read-only.
   */
  getE2EProbeTransformHandle(
    _mode: string,
    _point: number | null,
  ): Object3D | null {
    return null;
  }

  /**
   * Test-only e2e probe seam ({@link EditorE2EProbeTargetsContributor}):
   * the id of the selection the selector currently reports as hovered,
   * or `null` when the probe is disabled or nothing is hovered.
   * Read-only.
   */
  getE2EProbeHoveredLabel(): string | null {
    if (!isE2EProbeEnabled()) return null;

    const id = this.#interactContext.selectionSelector.hoveredObj?.id;
    return typeof id === "string" ? id : null;
  }

  /**
   * Test-only e2e probe seam ({@link EditorE2EProbeTargetsContributor}):
   * raycasts the selection selector groups with the given raycaster,
   * returning the candidate selection count and the closest hit id.
   * Read-only.
   */
  getE2EProbeSelectorRaycast(
    raycaster: Raycaster,
  ): { count: number; hitId: string | null } | null {
    if (!isE2EProbeEnabled()) return null;

    let count = 0;
    let hit: ReadonlyLabelSelection | null = null;
    for (const group of this.#interactContext.selectionSelector.groups.iterGroups()) {
      for (const _ of group.objects) count += 1;
      hit ??= group.raycast(raycaster);
    }
    const hitId = hit?.id;
    return { count, hitId: typeof hitId === "string" ? hitId : null };
  }

  /**
   * Test-only e2e probe seam ({@link EditorE2EProbeTargetsContributor}):
   * the selection selector's live hover-enabled flag and current raycaster
   * ray. Read-only.
   */
  getE2EProbeSelectorState(): {
    hoverEnabled: boolean;
    ray: { origin: Vector3; direction: Vector3 };
  } | null {
    if (!isE2EProbeEnabled()) return null;

    const selector = this.#interactContext.selectionSelector;
    return {
      hoverEnabled: selector.hoverEnabled,
      ray: {
        origin: selector.raycaster.ray.origin,
        direction: selector.raycaster.ray.direction,
      },
    };
  }

  /**
   * Gets the text to display as a hint to the user when this layer is active.
   *
   * If the text is an empty string, no hint is displayed.
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
  /** Contributes the segmentation intent group to the editor intents. */
  createEditorIntents(): SegmentationPluginIntents {
    return {
      segmentation: {
        setAction: (action) => {
          this.setAction(action);
        },
        setDrawMode: (drawMode) => {
          this.setDrawMode(drawMode);
        },
        setEditMode: (editMode) => {
          this.setEditMode(editMode);
        },
        setSettings: (values) => {
          this.onSettingsInputChange(values);
        },
        applyInstanceInspectorInput: (values) => {
          this.applyInstanceInspectorInput(values);
        },
        applySelectionInspectorInput: (values) => {
          this.applySelectionInspectorInput(values);
        },
        selectInstance: (id) => {
          this.selectInstance(id);
        },
        selectSelection: (id) => {
          this.selectSelection(id);
        },
        instanceInspectorPaneEvent: (event) => {
          this.instanceInspectorPaneEvent(event);
        },
        selectionInspectorPaneEvent: (event) => {
          this.selectionInspectorPaneEvent(event);
        },
      },
    };
  }

  mapEditorSlice(previous: SegmentationSlice | null): SegmentationSlice {
    const context = this.#interactContext;
    return mapSegmentationSlice(
      {
        action: context.action,
        drawMode: context.drawMode,
        editMode: context.selectionController.editMode,
        disabled: context.disabled,
        selectedInstanceId: context.selectedInstanceId,
        selectedSelectionId: context.selectedSelectionId,
        autoInstances: true,
        drawSelectionActive: context.drawSelectionActive,
        instanceInspectorDisabled: context.instanceInspectorDisabled,
        selectionInspectorDisabled: context.selectionInspectorDisabled,
        settings: {
          values: this.#settingsInputtedData,
          disabled: this.#settingsPaneSettings.disabled,
          isAssistantAvailable: this.#isAssistantAvailable,
        },
        labels: this.#labelsLoading ? null : this.dataView,
      },
      previous,
    );
  }

  /** Subscribes to every event that can change this layer's editor-state slice. */
  subscribeEditorSlice(listener: () => void): () => void {
    const context = this.#interactContext;
    const { selectionSelector, selectionController } = context;

    context.addEventListener("action-change", listener);
    context.addEventListener("draw-mode-change", listener);
    context.addEventListener("label-select-change", listener);
    // State transitions move the selected instance/selection and the
    // per-inspector disabled state; they complement (not replace) the
    // other sources.
    context.addEventListener("change", listener);
    selectionSelector.addEventListener("selectin", listener);
    selectionSelector.addEventListener("selectout", listener);
    selectionController.addEventListener("change", listener);
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
      context.removeEventListener("label-select-change", listener);
      context.removeEventListener("change", listener);
      selectionSelector.removeEventListener("selectin", listener);
      selectionSelector.removeEventListener("selectout", listener);
      selectionController.removeEventListener("change", listener);
      this.removeEventListener("settings-change", listener);
    };
  }

  /** Selects the interaction action (editor-intent target). */
  setAction(action: Action): void {
    this.#interactContext.setAction(action);
  }

  /** Selects the query/prompt tool used while drawing a selection (editor-intent target). */
  setDrawMode(drawMode: DrawMode): void {
    this.#interactContext.setDrawMode(drawMode);
  }

  /** Selects the edit mode used to modify a selection (editor-intent target). */
  setEditMode(editMode: EditMode): void {
    if (this.#interactContext.disabled) return;
    this.#interactContext.selectionController.onEditModeInputChange({
      editMode,
    });
  }

  /**
   * Updates how an instance is displayed.
   */
  #renderInstance(instance: ReadonlyLabelInstance) {
    const dataView = this.#interactContext.dataView;

    const displayParams = {
      minTimestamp: dataView.getMinTimestampInRange(),
      maxTimestamp: dataView.getMaxTimestampInRange(),
    };

    dataView.setLabelInstanceDisplayParams(instance, displayParams);

    return instance;
  }

  /**
   * Updates how a selection is displayed.
   */
  #renderSelection(selection: ReadonlyLabelSelection) {
    const dataView = this.#interactContext.dataView;
    const pcd = this.pointCloudLayer.dataView?.data;
    const {
      selectedSelectionColor,
      hoveredSelectionColor,
      showPerceivedClass,
      selectionTransparency,
      selectionOpacity,
    } = this.settingsOutput;

    let showPointSize = pcd ? pcd.pointSize : 0.5;

    const isHovered =
      selection === this.#interactContext.selectionSelector.hoveredObj &&
      selection !== this.#interactContext.selectionSelector.selectedObj;
    const showColor = getSegmentationInteractionColor(
      selection,
      this.#interactContext.selectionSelector.selectedObj,
      this.#interactContext.selectionSelector.hoveredObj,
      selectedSelectionColor,
      hoveredSelectionColor,
    );
    if (isHovered) {
      showPointSize += 1;
    }

    const currentFrame = this.context.currentFrame;

    const displayOptions = {
      showPointSize: showPointSize,
      showCenter: !currentFrame?.containsTimestamp(selection.timestamp),
      showPerceivedClass: showPerceivedClass,
      opacity: getSelectionDisplayOpacity(
        selectionTransparency,
        selectionOpacity,
      ),
      showColor: showColor,
    };

    dataView.setLabelSelectionDisplayParams(selection, displayOptions);

    return selection;
  }

  /**
   * Builds the tooltip model for a selection.
   */
  #getTooltipModel(selection: ReadonlyLabelSelection) {
    const currentFrame = this.context.currentFrame;
    const mainCamera = this.#interactContext.mainWindow.getCamera();
    const {
      showTooltips,
      showOcclusion,
      showTimestampDiff,
      showDistinctiveness,
      showTrackSegId,
    } = this.settingsOutput;

    const selectionNDC = selection.centerPoint.clone().project(mainCamera);
    const relPos = ThreeUtils.getNDCRelPos(selectionNDC);

    const { className, lines, visible } = getSegmentationTooltipContent({
      selectionId: selection.id,
      instanceId: selection.entityId,
      timestamp: selection.timestamp,
      currentTimestamp: currentFrame?.getTimestampCenter() ?? null,
      isInCurrentFrame:
        currentFrame?.containsTimestamp(selection.timestamp) ?? false,
      displayClassName: selection.displayClass?.name ?? null,
      occlusionName: selection.occlusionLv.name,
      distinctivenessName: selection.distinctiveLv.name,
      showTooltips,
      showTrackSegId,
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

  /**
   * Updates the `three.js` objects and the DOM elements of this layer.
   * It is called during each animation frame while this layer is displayed.
   *
   * The work is change-driven: the events of the components the display
   * depends on mark this layer as dirty, and this method only performs
   * the work when something has been marked dirty since the previous call.
   */
  render() {
    // Avoid querying frames when the task is changing; the dirty flags
    // are preserved, so the work resumes once the navigation ends.
    if (this.context.isNavigating) return;

    if (!this.#labelsDirty && !this.#tooltipsDirty) return;

    const { dataView } = this.#interactContext;

    const { data } = dataView;
    if (data == null) {
      this.objects.clear();
      this.refreshObjects();
      this.#tooltipModels = [];
      this.#renderOverlay();

      this.#labelsDirty = false;
      this.#tooltipsDirty = false;
      return;
    }

    if (this.#labelsDirty) {
      this.objects.clear();

      const selections = [...this.iterLabelSelections()];

      this.#tooltipModels = selections.map((selection) => {
        this.#renderSelection(selection);
        this.objects.add(selection.asObject3D());

        return this.#getTooltipModel(selection);
      });

      const instanceIds = [...dataView.iterLabelInstanceIdsWithElements()];
      for (const instanceId of instanceIds) {
        const instance = dataView.getLabelInstance(instanceId);
        this.#renderInstance(instance);
        this.objects.add(instance.asObject3D());
      }

      const assistedController =
        this.#interactContext.assistedSelectionController;
      this.objects.add(assistedController.prompts.asObject3D());
      this.refreshObjects();
    } else {
      // Only the camera has moved while the tooltips are visible, so
      // recompute the tooltip models without touching the label display.
      this.#tooltipModels = [...this.iterLabelSelections()].map((selection) =>
        this.#getTooltipModel(selection),
      );
    }

    this.#renderOverlay();

    this.#labelsDirty = false;
    this.#tooltipsDirty = false;
  }

  get settingsPaneParams(): Pick<
    SegmentationSettingsPaneControllerParams,
    "inputtedData" | "computedData" | "internalData" | "settings"
  > {
    return {
      inputtedData: this.#settingsInputtedData,
      computedData: {},
      internalData: this.#settingsInternalData,
      settings: this.#settingsPaneSettings,
    };
  }

  get settingsOutput(): SegmentationSettings {
    return getSegmentationSettingsOutputData(this.settingsPaneParams);
  }

  onSettingsInputChange = (
    inputtedData: SegmentationSettingsPaneControllerParams["inputtedData"],
  ): void => {
    this.#onSettingsChange(inputtedData);
  };

  #notifySettingsChange(): void {
    this.dispatchEvent({ type: "settings-change" });
  }
}
