import { default as React } from "react";
import * as THREE from "three";

import { Placeholder, memoizeRender } from "sta/app/editor";
import type { RenderMemo } from "sta/app/editor";

import type {
  SelectionEditControls,
  AssistedSelectionEditControl,
  PromptedData,
} from "../controls";
import type { ReadonlyLabelSelection } from "../data";
import { LabelSelection } from "../data/LabelSelection";
import type { ObjQuery, SelectionCurator } from "../tools";
import type { PointCloudUtils } from "../utils";

import type {
  InteractContext,
  InteractContextUsage,
  LabelInspectorUsage,
  MainWindowMapper,
} from "./InteractContext";
import { InteractState } from "./InteractState";

export interface EditStateParams {
  instanceId: string | null;
  selectionId: string | null;
  /** The points prompted to the labeling assistant, if any. */
  promptedData: PromptedData | null;
}

/**
 * Represents the state when the user can create a vector object.
 */
export class DrawSelectionState<
  WM extends MainWindowMapper,
> extends InteractState<WM> {
  get activatedSelectionCurator(): SelectionCurator<ObjQuery> | null {
    return this.context.activeCurator;
  }

  get selectionController(): SelectionEditControls {
    return this.context.selectionController;
  }

  get assistedSelectionController(): AssistedSelectionEditControl {
    return this.context.assistedSelectionController;
  }

  /**
   * Whether a vector object is being created.
   */
  get isCreatingSelection(): boolean {
    return (
      this.selectionController.isCreating ||
      this.assistedSelectionController.isCreating
    );
  }

  /**
   * Whether a selection object is being edited.
   */
  get isEditingSelection(): boolean {
    return (
      this.selectionController.isEditing ||
      this.assistedSelectionController.isEditing
    );
  }

  readonly #hintMemo: RenderMemo = {};

  get isCuratorDrawing(): boolean {
    return this.selectionController.isCuratorDrawing;
  }

  /**
   * The parameters of this state.
   */
  readonly params: EditStateParams;

  #enabledCameraControl = false;

  get enabledCameraControl(): boolean {
    return this.#enabledCameraControl;
  }

  /**
   * The generation of assistant mask requests started from this state.
   *
   * Incremented each time an assistant create/update request begins, so a
   * result arriving for a superseded request can be discarded instead of
   * committing over (or duplicating) the newest one.
   */
  #assistantRequestGen = 0;

  /**
   * The assistant create request currently in flight, or `null` if none.
   *
   * The request is identified by its input token (the prompted
   * points/labels) against a specific point cloud. A racing duplicate of
   * the SAME gesture (identical prompt on the same point cloud, e.g. the
   * same prompt completion arriving twice before the first commit settles)
   * must not start a second prediction nor commit a second selection. A
   * DIFFERENT prompt against the same point cloud is a distinct, newer
   * request: it supersedes the pending one by advancing the generation.
   */
  #pendingCreate: { utils: PointCloudUtils; token: string } | null = null;

  /**
   * Builds a stable token identifying an assistant request's input, so a
   * racing duplicate of the same gesture can be told apart from a newer,
   * distinct request.
   */
  #promptToken(promptData: PromptedData): string {
    const points = promptData.points
      .map(({ x, y, z }) => `${x},${y},${z}`)
      .join(";");
    return `${points}|${promptData.labels.join(",")}`;
  }

  /**
   * Creates a new state instance.
   *
   * This is called right before the state of the context is transitioned to this one.
   */
  constructor(context: InteractContext<WM>, params: EditStateParams) {
    super({
      context: context,
      keydownBinds: [
        {
          keyCombo: "escape",
          name: "cancel create/edit selection",
          handler: () => {
            this.#abortEditSelection();
            this.context.transitionNavigate();
          },
        },
        {
          keyCombo: "g",
          name: "finish create selection",
          handler: () => {
            if (this.isCuratorDrawing) {
              this.activatedSelectionCurator?.finish();
            }
          },
        },
        {
          keyCombo: "delete",
          name: "Delete selection",
          handler: () => {
            void this.#deleteSelectedSelection();
          },
        },
      ],
    });

    this.params = params;
    this.context.setPointCloudNDC();
    this.#setup(this.params);
  }

  /**
   * Setups this object.
   */
  #setup({ instanceId, selectionId, promptedData }: EditStateParams): void {
    const {
      instanceInspector,
      selectionInspector,
      selectionMonitor,
      selectionController,
      selectionSelector,
      assistedSelectionController,
    } = this.context;

    instanceInspector.selectedId = instanceId;
    selectionInspector.selectedId = selectionId;

    const selection = selectionInspector.selectedSelection;

    selectionController.select(selection);
    assistedSelectionController.select(selection, promptedData);

    if (selection) {
      selectionSelector.selectedObj = selection;
      selectionMonitor.selection = selection;
    } else {
      selectionSelector.selectedObj = null;
    }
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   *
   * This is called right before the state of the context is transitioned from this one.
   */
  dispose(): void {
    this.context.selectionSelector.selectedObj = null;
    this.context.selectionController.deselect();
    this.selectionController?.abort();

    super.dispose();
  }

  /**
   * Gets the CSS class (without `cursor-` prefix) for the main window
   * while the user is not actively drawing.
   */
  #getPassiveCursorClass(): string {
    const drawMode = this.context.drawMode;

    switch (drawMode) {
      case "polygon":
        return "crosshair";
      case "box":
        return "crosshair";
      case "lasso":
        return "crosshair";
      case "brush":
        return "none";
      default:
        return "default";
    }
  }

  /**
   * Specifies how this state uses the context.
   *
   * This is called during each animation frame, and when an event is emitted by a component.
   */
  getUsage(isReadonly: boolean): InteractContextUsage {
    const { isCreatingSelection, isEditingSelection } = this;

    let cursorClass: string;
    if (isReadonly) {
      cursorClass = "not-allowed";
    } else {
      cursorClass = this.#getPassiveCursorClass();
    }

    let labelInspectorUsage: LabelInspectorUsage = {
      enabled: isCreatingSelection || isEditingSelection,
    };

    if (isEditingSelection) {
      labelInspectorUsage = {
        selectInstance: ({ value: instance }) => {
          const instanceId = instance?.id ?? null;
          const { selectionId, promptedData } = this.params;

          void this.context.transitionEdit({
            instanceId,
            selectionId,
            promptedData,
          });
        },
        selectSelection: ({ value: selection }) => {
          if (selection == null) {
            const { instanceId, promptedData } = this.params;

            void this.context.transitionEdit({
              instanceId,
              selectionId: null,
              promptedData,
            });
          } else {
            const { promptedData } = this.params;

            void this.context.transitionEditSelection({
              selectionId: selection.id,
              promptedData,
              selection,
            });
          }
        },
      };
    }

    return {
      mainWindow: {
        cursorClass: cursorClass,
        controlCamera: false,
        hiddenCanvas: false,
      },
      data: {
        beforeLoad: () => {
          // Ensure the components are operating on the correct object
          // in case it gets replaced
          this.#setup(this.params);
        },
        afterLoad: () => {
          // Ensure the components are operating on the correct object
          // in case it gets replaced
          this.#setup(this.params);
        },
        branchEdit: () => {
          // Ensure the components are operating on the correct object
          // in case it gets replaced
          this.#setup(this.params);
        },
      },
      selectionSelector: isReadonly ? undefined : { hover: false },
      assistedSelectionController: isReadonly
        ? undefined
        : {
            create: (event) => {
              void (async () => {
                const { maskThreshold, promptData } = event;
                const context = this.context;
                const pointCloudUtils = context.pointCloudUtils;
                if (pointCloudUtils == null) return;

                // A racing duplicate of the SAME gesture (identical prompt
                // on the same point cloud) must not start a second
                // prediction nor commit a second selection. A DIFFERENT
                // prompt against the same point cloud is a distinct, newer
                // request: it supersedes the pending one by advancing the
                // generation, so the older result is discarded on arrival.
                const requestToken = this.#promptToken(promptData);
                const pending = this.#pendingCreate;
                if (
                  pending?.utils === pointCloudUtils &&
                  pending?.token === requestToken
                ) {
                  return;
                }
                this.#pendingCreate = {
                  utils: pointCloudUtils,
                  token: requestToken,
                };

                try {
                  const requestGen = ++this.#assistantRequestGen;

                  // Predict against the displayed point cloud only, and only
                  // once the assistant has encoded it
                  if (
                    !(await pointCloudUtils.whenEncoded()) ||
                    context.pointCloudUtils !== pointCloudUtils
                  ) {
                    return;
                  }

                  // Capture the instance attributes (selected class) when the
                  // request is accepted: a change of the selected class while
                  // the prediction is in flight must not leak into the
                  // committed selection.
                  const instanceParams =
                    context.instanceInspector.getInstanceParams();

                  const promptedData = {
                    points: [...promptData.points],
                    labels: [...promptData.labels],
                  };

                  const format = context.sceneContext.config.coordinateFormat;
                  const pointsInDB = promptData.points.map((vector) =>
                    format.toDatabaseCoords(vector),
                  );
                  const pcdId = context.sceneContext.currentFrame?.id;
                  if (pcdId == null) return;

                  const logits = await context.dataView.predictMask(
                    pointsInDB,
                    promptData.labels,
                    pcdId,
                  );

                  // The point cloud may have been replaced, the interaction may
                  // have left this state, or a newer request may have superseded
                  // this one while predicting; a stale result is discarded and
                  // its failure is not reported against the new context.
                  if (
                    this.#isAssistantRequestStale(pointCloudUtils, requestGen)
                  )
                    return;

                  if (logits == null) {
                    // A failed prediction must not create an empty selection
                    console.warn(
                      "The labeling assistant failed to predict a mask; no selection was created.",
                    );
                    return;
                  }

                  pointCloudUtils.maskLogits = logits;

                  const selectionPoints =
                    pointCloudUtils.filterMaskLogitsByThreshold(maskThreshold);
                  if (selectionPoints.length === 0) {
                    console.warn(
                      "The predicted mask is empty at the current threshold; no selection was created.",
                    );
                    return;
                  }

                  const selection = this.#createSelection(selectionPoints);

                  if (selection !== null) {
                    const { dataView } = context;

                    if (selection.entityId == null) {
                      const newInstance =
                        await dataView.addLabelInstance(instanceParams);

                      // The context may have changed while the instance
                      // was being added (navigation, branch change,
                      // cancellation, layer disable); continuing would
                      // accept the selection against the newly current
                      // data view.
                      if (
                        this.#isAssistantRequestStale(
                          pointCloudUtils,
                          requestGen,
                        )
                      ) {
                        this.#disposeSelection(selection);
                        return;
                      }

                      if (!(selection instanceof LabelSelection)) {
                        throw new Error("Incorrect type of label selection");
                      }

                      selection.entityId = newInstance.id;
                    }

                    const newSelection =
                      await dataView.addLabelSelection(selection);

                    // Same guard between the selection commit and the
                    // follow-up transition.
                    if (
                      this.#isAssistantRequestStale(pointCloudUtils, requestGen)
                    ) {
                      this.#disposeSelection(selection);
                      return;
                    }

                    await context.transitionEditSelection({
                      selectionId: newSelection.id,
                      promptedData: promptedData,
                      selection: newSelection,
                    });
                    context.assistedSelectionController.markPredictionAvailable(
                      newSelection,
                    );

                    this.#disposeSelection(selection);
                  }
                } finally {
                  // Only clear the marker if it still belongs to this
                  // request: a newer request keeps its own marker.
                  const current = this.#pendingCreate;
                  if (
                    current?.utils === pointCloudUtils &&
                    current?.token === requestToken
                  ) {
                    this.#pendingCreate = null;
                  }
                }
              })();
            },
            update: (event) => {
              void (async () => {
                const { obj, promptData, mode, maskThreshold, predict } = event;
                const context = this.context;
                const pointCloudUtils = context.pointCloudUtils;
                if (pointCloudUtils == null) return;

                const requestGen = ++this.#assistantRequestGen;

                // The stored logits belong to the displayed point cloud only,
                // and only once the assistant has encoded it
                if (
                  !(await pointCloudUtils.whenEncoded()) ||
                  context.pointCloudUtils !== pointCloudUtils
                ) {
                  return;
                }

                const format = context.sceneContext.config.coordinateFormat;
                const pointsInDB = promptData.points.map((vector) =>
                  format.toDatabaseCoords(vector),
                );
                const pcdId = context.sceneContext.currentFrame?.id;
                if (pcdId == null) return;

                if (predict) {
                  const logits = await context.dataView.predictMask(
                    pointsInDB,
                    promptData.labels,
                    pcdId,
                  );

                  // The point cloud may have been replaced, the interaction
                  // may have left this state, or a newer request may have
                  // superseded this one while predicting; a stale result is
                  // discarded and its failure is not reported against the
                  // new context.
                  if (
                    this.#isAssistantRequestStale(pointCloudUtils, requestGen)
                  )
                    return;

                  if (logits == null) {
                    // A failed prediction must not modify the selection
                    // being edited
                    console.warn(
                      "The labeling assistant failed to predict a mask; the current selection was kept.",
                    );
                    return;
                  }

                  pointCloudUtils.maskLogits = logits;
                } else if (
                  this.#isAssistantRequestStale(pointCloudUtils, requestGen)
                ) {
                  return;
                }

                const newSelectionData =
                  pointCloudUtils.filterMaskLogitsByThreshold(maskThreshold);

                if (newSelectionData.length === 0) {
                  await this.#deleteSelectedSelection();
                } else {
                  const selectionDataInDB = newSelectionData.map((vector) =>
                    format.toDatabaseCoords(vector),
                  );

                  const updated =
                    await context.dataView.updateLabelPointSelection(
                      obj,
                      mode,
                      selectionDataInDB,
                    );

                  if (updated != null) {
                    await context.transitionEditSelection({
                      selectionId: updated.id,
                      promptedData: promptData,
                      selection: updated,
                    });
                    // The transition rebinds the controller to the committed
                    // selection. Mark that rebound object as owning the cached
                    // logits so threshold-only changes can refilter them
                    // without issuing another prediction.
                    context.assistedSelectionController.markPredictionAvailable(
                      updated,
                    );
                  }
                }
              })();
            },
          },
      selectionController: isReadonly
        ? undefined
        : {
            update: (event) => {
              void (async () => {
                const { obj, mode, newSelectionData, prevSelectionData } =
                  event;

                obj.getSelection().pointCoords = prevSelectionData.pointCoords;

                if (newSelectionData.pointCoords.length === 0) {
                  await this.#deleteSelectedSelection();
                } else {
                  const format =
                    this.context.sceneContext.config.coordinateFormat;
                  const updated =
                    await this.context.dataView.updateLabelPointSelection(
                      obj,
                      mode,
                      newSelectionData.pointCoords.map((point) =>
                        format.toDatabaseCoords(point),
                      ),
                    );

                  if (updated != null) {
                    await this.context.transitionEditSelection({
                      selectionId: updated.id,
                      promptedData: null,
                      selection: updated,
                    });
                  }
                }
              })();
            },
            create: (event) => {
              const selection = this.#createSelection(
                event.newSelectionData.pointCoords,
              );
              void (async () => {
                if (selection !== null) {
                  const { dataView, instanceInspector } = this.context;

                  if (selection.entityId == null) {
                    const instanceParams =
                      instanceInspector.getInstanceParams();
                    const newInstance =
                      await dataView.addLabelInstance(instanceParams);

                    if (!(selection instanceof LabelSelection)) {
                      throw new Error("Incorrect type of label selection");
                    }

                    selection.entityId = newInstance.id;
                  }

                  const newSelection =
                    await dataView.addLabelSelection(selection);

                  await this.context.transitionEditSelection({
                    selectionId: newSelection.id,
                    promptedData: null,
                    selection: newSelection,
                  });
                }
              })()
                .catch((error: unknown) => {
                  console.error("Failed to create selection:", error);
                  alert(`Failed to create selection.\n\n${error}`);
                })
                .finally(() => {
                  if (selection != null) this.#disposeSelection(selection);
                });
            },
          },
      labelInspector: isReadonly ? undefined : labelInspectorUsage,
    };
  }

  /**
   * Whether an assistant mask request started from this state has gone stale.
   *
   * A request is stale once the context it was accepted in no longer holds:
   * the point cloud was replaced (frame/project change), the interaction has
   * left this state (user cancellation, the layer being disabled, or any
   * navigation), or a newer assistant request has superseded it. A stale
   * result must be discarded instead of committing into the new context.
   */
  #isAssistantRequestStale(
    pointCloudUtils: PointCloudUtils | null,
    requestGen: number,
  ): boolean {
    return (
      this.context.pointCloudUtils !== pointCloudUtils ||
      this.context.currentState !== this ||
      this.#assistantRequestGen !== requestGen
    );
  }

  /**
   * Creates a selection by given selection points.
   */
  #createSelection(
    selectionPoints: readonly THREE.Vector3[],
  ): ReadonlyLabelSelection | null {
    if (selectionPoints.length === 0) return null;
    const { sceneContext, dataView, pointCloudUtils } = this.context;

    const format = sceneContext.config.coordinateFormat;
    const currentTimestamp =
      sceneContext.currentFrame?.getTimestampCenter() ?? null;
    const points = selectionPoints.map((point) =>
      format.toDatabaseCoords(point),
    );

    const selectionParams = {
      id: new Placeholder(),
      points: points,
      timestamp: currentTimestamp,
      entityId: null,
      showPointSize: pointCloudUtils?.pointSize,
    };

    const selection = dataView.addLabelSelectionLocalOnly(selectionParams);

    return selection;
  }

  /**
   * Disposes the new selection.
   */
  #disposeSelection(selection: ReadonlyLabelSelection): void {
    const { dataView } = this.context;
    dataView.deleteLabelSelectionLocalOnly(selection);
  }

  /**
   * Gets the text to display as a hint to the user when this layer is active.
   *
   * If the text is an empty string, no hint is displayed.
   */
  getHint(isReadonly: boolean): React.ReactNode {
    return memoizeRender(
      this.#hintMemo,
      [this.isCreatingSelection, this.activatedSelectionCurator?.toolType],
      () => {
        const { isCreatingSelection, activatedSelectionCurator } = this;
        if (activatedSelectionCurator != null && isCreatingSelection) {
          switch (activatedSelectionCurator.toolType) {
            case "brush":
              return (
                <>
                  Release left pointer to pause drawing, or press <kbd>Esc</kbd>{" "}
                  to abort, or press <kbd>g</kbd> to finish
                </>
              );
            default:
              return (
                <>
                  Release left pointer to finish drawing, or press{" "}
                  <kbd>Esc</kbd> to abort, or press <kbd>g</kbd> to finish
                </>
              );
          }
        }

        return (
          <>
            Click and drag to draw {activatedSelectionCurator?.toolType} to
            query points, or press <kbd>Esc</kbd> to cancel
          </>
        );
      },
    );
  }

  /**
   * Cancels transformation of the current selection, if any.
   */
  #abortEditSelection(): void {
    this.context.selectionSelector.selectedObj = null;
    this.context.selectionController.abort();
    this.context.transitionNavigate();
  }

  /**
   * Deletes the selected selection, if any, from the scene.
   */
  async #deleteSelectedSelection(): Promise<void> {
    const selection = this.context.selectionInspector.selectedSelection;
    if (selection) {
      void this.context.dataView.deleteLabelSelection(selection);

      this.context.transitionNavigate();
    }
  }
}
