import type {
  InspectorHandle,
  PaneElementParams,
  SourceEventTarget,
} from "sta/app/editor";
import {
  createInspectorEventBus,
  InspectorRenderSignaller,
  composeRenderTriggers,
} from "sta/app/editor";

import type { QualityLevel } from "../../../../models";
import type {
  InstanceParams,
  ReadonlyLabelClass,
  ReadonlyLabelInstance,
  ReadonlyLabelSelection,
  ReadonlySegmentationIndex,
  SegmentationIndexEventMap,
  UUID,
} from "../data";

import { renderTriggers as descriptorsRenderTriggers } from "./LabelInstanceDescriptorsPane.ts";
import {
  cloneLabelInstanceInspectorInputtedData,
  labelInstanceInspectorPaneDataProcessor,
  labelInstanceInspectorPaneFactoryParams,
} from "./LabelInstanceInspectorPane.ts";
import type { LabelInstanceInspectorPaneControllerParams } from "./LabelInstanceInspectorPane.ts";
import { renderTriggers as relationsRenderTriggers } from "./LabelInstanceRelationsPane.ts";
import {
  projectLabelInstanceSelectionItem,
  renderTriggers as selectionRenderTriggers,
} from "./LabelInstanceSelectionPane.ts";

/**
 * The narrow, structural surface of the segmentation labels view consumed by
 * the inspectors: the current labels index, the entity query accessors, the
 * label mutation APIs, and the load events. Deliberately declares no
 * three.js-facing members. The concrete `SegmentationView` satisfies this
 * structurally.
 */
export interface SegmentationInspectorLabelsView extends SourceEventTarget {
  readonly data: ReadonlySegmentationIndex | null;

  iterLabelSelections(): IterableIterator<ReadonlyLabelSelection>;
  iterLabelInstances(): IterableIterator<ReadonlyLabelInstance>;
  iterLabelClasses(): IterableIterator<ReadonlyLabelClass>;

  hasLabelSelection(id: UUID): boolean;
  getLabelSelection(id: UUID): ReadonlyLabelSelection;
  hasLabelInstance(id: UUID): boolean;
  getLabelInstance(id: UUID): ReadonlyLabelInstance;
  getLabelClass(id: number): ReadonlyLabelClass;

  addLabelInstance(
    params: Omit<InstanceParams, "id">,
  ): Promise<ReadonlyLabelInstance>;
  updateLabelInstanceGtClass(
    instance: ReadonlyLabelInstance,
    labelClass: ReadonlyLabelClass | null,
  ): Promise<void>;
  updateLabelInstanceIsBlack(
    instance: ReadonlyLabelInstance,
    isBlack: boolean,
  ): Promise<void>;
  updateLabelSelectionParentInstance(
    selection: ReadonlyLabelSelection,
    instance: ReadonlyLabelInstance | null,
  ): Promise<void>;
  updateLabelSelectionPerceivedClass(
    selection: ReadonlyLabelSelection,
    labelClass: ReadonlyLabelClass | null,
  ): Promise<void>;
  updateLabelSelectionDistinctiveLv(
    selection: ReadonlyLabelSelection,
    distinctiveLv: QualityLevel,
  ): Promise<void>;
  updateLabelSelectionOcclusionLv(
    selection: ReadonlyLabelSelection,
    occlusionLv: QualityLevel,
  ): Promise<void>;
}

export interface LabelInstanceInspectorEventMap {
  change: {};
  "select-instance": { value: ReadonlyLabelInstance | null };
}

export interface LabelInstanceInspectorParams {
  labelsView: SegmentationInspectorLabelsView;
  selectedId?: UUID | null;
  disabled?: boolean;
}

export interface LabelInstanceInspectorHandle extends InspectorHandle<
  LabelInstanceInspectorPaneControllerParams,
  LabelInstanceInspectorEventMap
> {
  disabled: boolean;
  readonly labelsView: SegmentationInspectorLabelsView;
  readonly selectedInstance: ReadonlyLabelInstance | null;
  selectedId: UUID | null;
  clickCreateInstance(): void;
  getInstanceParams(): Omit<InstanceParams, "config" | "id">;
}

export function getLabelInstanceInspectorPaneParams(
  labelsView: SegmentationInspectorLabelsView,
  selectedInstance: ReadonlyLabelInstance | null,
  disabled: boolean,
): Pick<
  LabelInstanceInspectorPaneControllerParams,
  "inputtedData" | "internalData" | "settings"
> {
  const labels = labelsView.data;
  const inputtedData =
    selectedInstance == null
      ? {
          ...cloneLabelInstanceInspectorInputtedData(
            labelInstanceInspectorPaneFactoryParams.inputtedData,
          ),
          selection: { instanceId: null },
        }
      : {
          selection: { instanceId: selectedInstance.id },
          relations: {
            classSelect: { classId: selectedInstance.gtClassId },
          },
          descriptors: { isBlack: selectedInstance.isBlack },
        };

  return {
    inputtedData: inputtedData,
    internalData: {
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
    settings: { disabled: disabled || labels == null, hidden: false },
  };
}

/**
 * Displays information about an object instance which can be edited directly.
 *
 */
export class LabelInstanceInspector implements LabelInstanceInspectorHandle {
  #events = createInspectorEventBus<LabelInstanceInspectorEventMap>();

  /**
   * Specifies the attributes to apply to the object instance.
   */
  #inputtedData: LabelInstanceInspectorPaneControllerParams["inputtedData"];

  #internalData: LabelInstanceInspectorPaneControllerParams["internalData"];

  #settings: LabelInstanceInspectorPaneControllerParams["settings"];

  /**
   * A view of the collection of labels used to update the selected object instance.
   */
  labelsView: SegmentationInspectorLabelsView;

  /**
   * Handles the event when the collection of labels is (un)loaded.
   */
  #onDataLoad = () => {
    const selectedId = this.selectedId;
    if (selectedId != null && !this.labelsView.hasLabelInstance(selectedId)) {
      // The label no longer exists
      this.selectedId = null;
    }

    // Need to show the new list of available labels
    this.#render();
  };

  #signaller: InspectorRenderSignaller<SegmentationIndexEventMap>;

  #selectedId: UUID | null;

  /**
   * The unique identifier of the object instance that is selected, if any.
   */
  get selectedId() {
    return this.#selectedId;
  }

  /**
   * The unique identifier of the object instance that is selected, if any.
   */
  set selectedId(value) {
    if (this.#selectedId !== value) {
      this.#selectedId = value;

      // Need to show the attributes for the newly selected object instance
      this.#render();

      this.#events.dispatchEvent({
        type: "select-instance",
        value: this.selectedInstance,
      });
    }
  }

  /**
   * The object instance that is selected, if any.
   */
  get selectedInstance() {
    const { selectedId, labelsView } = this;
    if (selectedId == null) return null;

    return labelsView.hasLabelInstance(selectedId)
      ? labelsView.getLabelInstance(selectedId)
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

  /**
   * Handles the event when the attributes in the inspector have been updated.
   *
   * The event to handle.
   */
  #onInspectorChange = async (event: {
    outputData: LabelInstanceInspectorPaneControllerParams["outputData"];
    prevOutputData: LabelInstanceInspectorPaneControllerParams["outputData"];
  }) => {
    const { instanceId: prevInstanceId } = event.prevOutputData;
    const { instanceId } = event.outputData;

    // Select instance
    if (instanceId !== prevInstanceId) {
      this.selectedId = instanceId;
      // Edit instance
    } else {
      void this.#updateInstance();
    }
  };

  /**
   * Updates the currently selected instance according to the view.
   */
  async #updateInstance() {
    const { labelsView, selectedInstance } = this;
    if (selectedInstance == null) return;

    const { classId, isBlack } = this.outputData;

    if (selectedInstance.gtClassId !== classId) {
      const labelClass =
        classId == null ? null : labelsView.getLabelClass(classId);
      await labelsView.updateLabelInstanceGtClass(selectedInstance, labelClass);
    }

    if (selectedInstance.isBlack !== isBlack) {
      await labelsView.updateLabelInstanceIsBlack(selectedInstance, isBlack);
    }
  }

  /**
   * Updates the view according to the data in this object.
   */
  #render() {
    const { labelsView, selectedInstance, disabled } = this;
    const paneParams = getLabelInstanceInspectorPaneParams(
      labelsView,
      selectedInstance,
      disabled,
    );
    this.#inputtedData = paneParams.inputtedData;
    this.#internalData = paneParams.internalData;
    this.#settings = paneParams.settings;

    this.#signaller.labels = labelsView.data;
    this.#notifyRender();
  }

  #requireRender = () => this.#render();

  /**
   * Handles the event when the user creates a new object instance by clicking the
   * corresponding button in the inspector.
   *
   * The event to handle.
   */
  #onCreateInstance = async (event: { type: string }) => {
    const { labelsView } = this;

    const params = this.getInstanceParams();
    const newInstance = await labelsView.addLabelInstance(params);

    // Triggers re-render
    this.selectedId = newInstance.id;
  };

  /**
   * Gets the parameters of an object instance represented by this inspector.
   */
  getInstanceParams(): Omit<InstanceParams, "config" | "id"> {
    const { classId, isBlack } = this.outputData;

    return {
      gtClassId: classId,
      isBlack: isBlack,
    };
  }

  /**
   * Creates a new object instance inspector.
   */
  constructor(params: LabelInstanceInspectorParams) {
    this.labelsView = params.labelsView;
    this.labelsView.addEventListener("beforeload", this.#onDataLoad);
    this.labelsView.addEventListener("afterload", this.#onDataLoad);

    this.#selectedId = params.selectedId ?? null;
    this.#disabled = params.disabled ?? false;

    this.#inputtedData = cloneLabelInstanceInspectorInputtedData(
      labelInstanceInspectorPaneFactoryParams.inputtedData,
    );
    this.#internalData = null;
    this.#settings = labelInstanceInspectorPaneFactoryParams.settings;

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
   * Clicks on the create instance button.
   *
   * This is a no-op if the button is disabled.
   */
  clickCreateInstance() {
    if (!this.#settings.disabled)
      void this.#onCreateInstance({ type: "create" });
  }

  get paneParams(): Pick<
    LabelInstanceInspectorPaneControllerParams,
    "inputtedData" | "internalData" | "settings"
  > {
    return {
      inputtedData: this.#inputtedData,
      internalData: this.#internalData,
      settings: this.#settings,
    };
  }

  get outputData(): LabelInstanceInspectorPaneControllerParams["outputData"] {
    return labelInstanceInspectorPaneDataProcessor.outputData(
      this.#getPaneElementParams(),
    );
  }

  onInputChange = (
    inputtedData: LabelInstanceInspectorPaneControllerParams["inputtedData"],
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
    if (event.type === "click-createInstance")
      void this.#onCreateInstance(event);
  };

  #getPaneElementParams(): PaneElementParams<LabelInstanceInspectorPaneControllerParams> {
    return {
      inputtedData: this.#inputtedData,
      computedData: labelInstanceInspectorPaneDataProcessor.computeData(
        this.#inputtedData,
        this.#internalData,
      ),
      settings: this.#settings,
    };
  }

  #notifyRender(): void {
    this.#events.dispatchEvent({ type: "change" });
  }

  addEventListener<TType extends keyof LabelInstanceInspectorEventMap>(
    type: TType,
    listener: (
      event: Readonly<{ type: TType } & LabelInstanceInspectorEventMap[TType]>,
    ) => void,
  ): void {
    this.#events.addEventListener(type, listener);
  }

  removeEventListener<TType extends keyof LabelInstanceInspectorEventMap>(
    type: TType,
    listener: (
      event: Readonly<{ type: TType } & LabelInstanceInspectorEventMap[TType]>,
    ) => void,
  ): void {
    this.#events.removeEventListener(type, listener);
  }
}
