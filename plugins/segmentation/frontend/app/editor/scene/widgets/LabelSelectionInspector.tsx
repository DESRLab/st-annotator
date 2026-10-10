import type { InspectorHandle, PaneElementParams } from "sta/app/editor";
import {
  createInspectorEventBus,
  InspectorRenderSignaller,
  composeRenderTriggers,
} from "sta/app/editor";

import type {
  ReadonlyLabelInstance,
  ReadonlyLabelSelection,
  SegmentationIndexEventMap,
  SelectionParams,
  UUID,
} from "../data";

import type { SegmentationInspectorLabelsView } from "./LabelInstanceInspector.tsx";
import { projectLabelInstanceSelectionItem } from "./LabelInstanceSelectionPane.ts";
import { renderTriggers as descriptorsRenderTriggers } from "./LabelSelectionDescriptorsPane.ts";
import {
  cloneLabelSelectionInspectorInputtedData,
  labelSelectionInspectorPaneDataProcessor,
  labelSelectionInspectorPaneFactoryParams,
} from "./LabelSelectionInspectorPane.ts";
import type { LabelSelectionInspectorPaneControllerParams } from "./LabelSelectionInspectorPane.ts";
import { renderTriggers as relationsRenderTriggers } from "./LabelSelectionRelationsPane.ts";
import {
  projectLabelSelectionSelectionItem,
  renderTriggers as selectionRenderTriggers,
} from "./LabelSelectionSelectionPane.ts";

export interface LabelSelectionInspectorEventMap {
  change: {};
  "select-selection": { value: ReadonlyLabelSelection | null };
  "select-instance": { value: ReadonlyLabelInstance | null };
  "toggle-drawSelection": { drawSelectionActive: boolean };
}

export interface LabelSelectionInspectorParams {
  labelsView: SegmentationInspectorLabelsView;
  selectedId?: UUID | null;
  disabled?: boolean;
  autoInstances?: boolean;
}

export interface LabelSelectionInspectorHandle extends InspectorHandle<
  LabelSelectionInspectorPaneControllerParams,
  LabelSelectionInspectorEventMap
> {
  autoInstances: boolean;
  disabled: boolean;
  drawSelectionActive: boolean;
  readonly labelsView: SegmentationInspectorLabelsView;
  readonly selectedSelection: ReadonlyLabelSelection | null;
  selectedId: UUID | null;
  clickDrawSelection(): void;
  getSelectionParams(): Omit<SelectionParams, "config" | "id" | "points">;
}

export function getLabelSelectionInspectorPaneParams(
  labelsView: SegmentationInspectorLabelsView,
  selectedSelection: ReadonlyLabelSelection | null,
  disabled: boolean,
  autoInstances: boolean,
  drawSelectionActive: boolean,
): Pick<
  LabelSelectionInspectorPaneControllerParams,
  "inputtedData" | "internalData" | "settings"
> {
  const labels = labelsView.data;
  const inputtedData =
    selectedSelection == null
      ? {
          ...cloneLabelSelectionInspectorInputtedData(
            labelSelectionInspectorPaneFactoryParams.inputtedData,
          ),
          selection: { selectionId: null },
        }
      : {
          selection: { selectionId: selectedSelection.id },
          relations: {
            instanceSelect: {
              instanceId: selectedSelection.entityId,
            },
            classSelect: {
              classId: selectedSelection.perceivedClassId,
            },
          },
          descriptors: {
            distinctiveLv: selectedSelection.distinctiveLv,
            occlusionLv: selectedSelection.occlusionLv,
          },
        };

  return {
    inputtedData: inputtedData,
    internalData: {
      selections: new Map(
        Array.from(labelsView.iterLabelSelections(), (entry) => [
          entry.id,
          projectLabelSelectionSelectionItem(entry),
        ]),
      ),
      instances: new Map(
        Array.from(labelsView.iterLabelInstances(), (entry) => [
          entry.id,
          projectLabelInstanceSelectionItem(entry),
        ]),
      ),
      classes: new Map(
        Array.from(labelsView.iterLabelClasses(), (entry) => [
          entry.id,
          { id: entry.id, name: entry.name },
        ]),
      ),
    },
    settings: {
      disabled: disabled || labels == null,
      hidden: false,
      drawSelectionActive,
      disableInstanceInput: !autoInstances,
    },
  };
}

/**
 * Displays information about a selection which can be edited directly.
 *
 */
export class LabelSelectionInspector implements LabelSelectionInspectorHandle {
  #events = createInspectorEventBus<LabelSelectionInspectorEventMap>();

  #inputtedData: LabelSelectionInspectorPaneControllerParams["inputtedData"];

  #internalData: LabelSelectionInspectorPaneControllerParams["internalData"];

  #settings: LabelSelectionInspectorPaneControllerParams["settings"];

  /**
   * A view of the collection of labels used to update the selected object instance.
   */
  labelsView: SegmentationInspectorLabelsView;

  /**
   * Handles the event when the collection of labels is (un)loaded.
   */
  #onDataLoad = () => {
    const selectedId = this.selectedId;
    if (selectedId != null && !this.labelsView.hasLabelSelection(selectedId)) {
      // The label no longer exists
      this.selectedId = null;
    }

    // Need to show the new list of available labels
    this.#render();
  };

  #signaller: InspectorRenderSignaller<SegmentationIndexEventMap>;

  #selectedId: UUID | null;

  /**
   * The unique identifier of the selection that is selected, if any.
   */
  get selectedId() {
    return this.#selectedId;
  }

  /**
   * The unique identifier of the selection that is selected, if any.
   */
  set selectedId(value) {
    if (this.#selectedId !== value) {
      this.#selectedId = value;

      // Need to show the attributes for the newly selected selection
      this.#render();

      this.#events.dispatchEvent({
        type: "select-selection",
        value: this.selectedSelection,
      });
    }
  }

  /**
   * The selection that is selected, if any.
   */
  get selectedSelection() {
    const { selectedId, labelsView } = this;
    if (selectedId == null) return null;

    return labelsView.hasLabelSelection(selectedId)
      ? labelsView.getLabelSelection(selectedId)
      : null; // May not exist if the data is currently being loaded
  }

  #disabled: boolean;

  /**
   * `true` if this inspector is disabled; otherwise, `false`.
   */
  get disabled() {
    return this.#disabled;
  }

  set disabled(value) {
    if (this.#disabled !== value) {
      this.#disabled = value;

      // Need to update the settings
      this.#render();
    }
  }

  #autoInstances = true;

  /**
   * If `true`, each object instance only has one selection, and such objects
   * are managed by the program without explicit input from the user.
   */
  get autoInstances() {
    return this.#autoInstances;
  }

  set autoInstances(value) {
    if (this.#autoInstances !== value) {
      this.#autoInstances = value;

      // Need to update the settings
      this.#render();
    }
  }

  #drawSelectionActive: boolean;

  /**
   * `true` if the draw selection button is active; otherwise, `false`.
   */
  get drawSelectionActive() {
    return this.#drawSelectionActive;
  }

  set drawSelectionActive(value: boolean) {
    if (this.#drawSelectionActive !== value) {
      this.#drawSelectionActive = value;

      // Need to update the settings
      this.#render();
    }
  }

  /**
   * Handles the event when the attributes in the inspector have been updated.
   *
   * The event to handle.
   */
  #onInspectorChange = async (event: {
    outputData: LabelSelectionInspectorPaneControllerParams["outputData"];
    prevOutputData: LabelSelectionInspectorPaneControllerParams["outputData"];
  }) => {
    const { selectionId: prevSelectionId, instanceId: prevInstanceId } =
      event.prevOutputData;
    const { selectionId, instanceId } = event.outputData;

    // Select selection
    if (selectionId !== prevSelectionId) {
      this.selectedId = selectionId;
      // Edit selection
    } else {
      void this.#updateSelection();
    }

    // Select instance
    if (instanceId !== prevInstanceId) {
      const { labelsView } = this;

      const instance =
        instanceId == null ? null : labelsView.getLabelInstance(instanceId);
      this.#events.dispatchEvent({
        type: "select-instance",
        value: instance,
      });
    }
  };

  /**
   * Updates the currently selected selection according to the view.
   */
  async #updateSelection() {
    const { labelsView, selectedSelection } = this;
    if (selectedSelection == null) return;

    const { instanceId, classId, distinctiveLv, occlusionLv } = this.outputData;

    if (selectedSelection.entityId !== instanceId) {
      const instance =
        instanceId == null ? null : labelsView.getLabelInstance(instanceId);
      await labelsView.updateLabelSelectionParentInstance(
        selectedSelection,
        instance,
      );
    }

    if (selectedSelection.perceivedClassId !== classId) {
      const labelClass =
        classId == null ? null : labelsView.getLabelClass(classId);
      await labelsView.updateLabelSelectionPerceivedClass(
        selectedSelection,
        labelClass,
      );

      if (this.autoInstances) {
        if (labelClass != null) {
          const instance = await labelsView.addLabelInstance({
            gtClassId: classId,
          });
          await labelsView.updateLabelSelectionParentInstance(
            selectedSelection,
            instance,
          );
        } else {
          await labelsView.updateLabelSelectionParentInstance(
            selectedSelection,
            null,
          );
        }
      }
    }

    if (!selectedSelection.distinctiveLv.equals(distinctiveLv)) {
      await labelsView.updateLabelSelectionDistinctiveLv(
        selectedSelection,
        distinctiveLv,
      );
    }

    if (!selectedSelection.occlusionLv.equals(occlusionLv)) {
      await labelsView.updateLabelSelectionOcclusionLv(
        selectedSelection,
        occlusionLv,
      );
    }
  }

  /**
   * Updates the view according to the data in this object.
   */
  #render() {
    const {
      labelsView,
      selectedSelection,
      disabled,
      autoInstances,
      drawSelectionActive,
    } = this;
    const paneParams = getLabelSelectionInspectorPaneParams(
      labelsView,
      selectedSelection,
      disabled,
      autoInstances,
      drawSelectionActive,
    );
    this.#inputtedData = paneParams.inputtedData;
    this.#internalData = paneParams.internalData;
    this.#settings = paneParams.settings;

    this.#signaller.labels = labelsView.data;
    this.#notifyRender();
  }

  #requireRender = () => this.#render();

  /**
   * Handles the event when the user begins drawing a new selection.
   *
   * The event to handle.
   */
  #onDrawSelection = (event: { type: string }) => {
    this.drawSelectionActive = !this.drawSelectionActive;

    this.#events.dispatchEvent({
      type: "toggle-drawSelection",
      drawSelectionActive: this.drawSelectionActive,
    });
  };

  /**
   * Gets the parameters of a selection represented by this inspector.
   *
   * parameters.
   */
  getSelectionParams(): Omit<SelectionParams, "config" | "id" | "points"> {
    const { instanceId, classId, distinctiveLv, occlusionLv } = this.outputData;

    return {
      entityId: instanceId,
      perceivedClassId: classId,
      distinctiveLv: distinctiveLv,
      occlusionLv: occlusionLv,
    };
  }

  /**
   * Creates a new selection inspector.
   */
  constructor(params: LabelSelectionInspectorParams) {
    this.labelsView = params.labelsView;
    this.labelsView.addEventListener("beforeload", this.#onDataLoad);
    this.labelsView.addEventListener("afterload", this.#onDataLoad);

    this.#selectedId = params.selectedId ?? null;
    this.#disabled = params.disabled ?? false;
    this.#autoInstances = params.autoInstances ?? false;

    this.#inputtedData = cloneLabelSelectionInspectorInputtedData(
      labelSelectionInspectorPaneFactoryParams.inputtedData,
    );
    this.#internalData = null;
    this.#settings = {
      disabled: false,
      hidden: false,
      drawSelectionActive: false,
      disableInstanceInput: false,
    };

    this.#signaller = new InspectorRenderSignaller(
      composeRenderTriggers(
        selectionRenderTriggers,
        relationsRenderTriggers,
        descriptorsRenderTriggers,
      ),
    );
    this.#signaller.addEventListener("render", this.#requireRender);

    this.#render();
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose() {
    this.labelsView.removeEventListener("beforeload", this.#onDataLoad);
    this.labelsView.removeEventListener("afterload", this.#onDataLoad);

    this.#signaller.removeEventListener("render", this.#requireRender);
    this.#signaller.dispose();
    this.#events.clear();
  }

  /**
   * Clicks on the draw selection button.
   *
   * This is a no-op if the button is disabled.
   */
  clickDrawSelection() {
    if (!this.#settings.disabled) this.#onDrawSelection({ type: "draw" });
  }

  get paneParams(): Pick<
    LabelSelectionInspectorPaneControllerParams,
    "inputtedData" | "internalData" | "settings"
  > {
    return {
      inputtedData: this.#inputtedData,
      internalData: this.#internalData,
      settings: this.#settings,
    };
  }

  get outputData(): LabelSelectionInspectorPaneControllerParams["outputData"] {
    return labelSelectionInspectorPaneDataProcessor.outputData(
      this.#getPaneElementParams(),
    );
  }

  onInputChange = (
    inputtedData: LabelSelectionInspectorPaneControllerParams["inputtedData"],
  ): void => {
    const prevOutputData = this.outputData;
    this.#inputtedData = inputtedData;
    this.#notifyRender();
    void this.#onInspectorChange({
      prevOutputData,
      outputData: this.outputData,
    });
  };

  onPaneEvent = (event: { type: string }): void => {
    if (event.type === "click-drawSelection") this.#onDrawSelection(event);
  };

  #getPaneElementParams(): PaneElementParams<LabelSelectionInspectorPaneControllerParams> {
    return {
      inputtedData: this.#inputtedData,
      computedData: labelSelectionInspectorPaneDataProcessor.computeData(
        this.#inputtedData,
        this.#internalData,
      ),
      settings: this.#settings,
    };
  }

  #notifyRender(): void {
    this.#events.dispatchEvent({ type: "change" });
  }

  addEventListener<TType extends keyof LabelSelectionInspectorEventMap>(
    type: TType,
    listener: (
      event: Readonly<{ type: TType } & LabelSelectionInspectorEventMap[TType]>,
    ) => void,
  ): void {
    this.#events.addEventListener(type, listener);
  }

  removeEventListener<TType extends keyof LabelSelectionInspectorEventMap>(
    type: TType,
    listener: (
      event: Readonly<{ type: TType } & LabelSelectionInspectorEventMap[TType]>,
    ) => void,
  ): void {
    this.#events.removeEventListener(type, listener);
  }
}
