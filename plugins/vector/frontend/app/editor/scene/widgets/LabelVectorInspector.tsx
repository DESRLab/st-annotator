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

import type {
  ReadonlyLabelClass,
  ReadonlyLabelVector,
  ReadonlyVectorIndex,
  UUID,
  VectorParams,
} from "../data";

import {
  cloneLabelVectorInspectorInputtedData,
  labelVectorInspectorPaneDataProcessor,
  labelVectorInspectorPaneFactoryParams,
} from "./LabelVectorInspectorPane.ts";
import type {
  LabelVectorInspectorPaneControllerParams,
  LabelVectorParams,
} from "./LabelVectorInspectorPane.ts";
import { renderTriggers as relationsRenderTriggers } from "./LabelVectorRelationsPane.ts";
import {
  labelVectorToSelectionItem,
  renderTriggers as selectionRenderTriggers,
} from "./LabelVectorSelectionPane.ts";

/**
 * The narrow, structural surface of the vector labels view consumed by the
 * inspector: the current labels index, the entity query accessors, the
 * label mutation APIs, and the load events. Deliberately declares no
 * three.js-facing members. The concrete `VectorView` satisfies this
 * structurally.
 */
export interface VectorInspectorLabelsView extends SourceEventTarget {
  readonly data: ReadonlyVectorIndex | null;

  iterLabelVectors(): IterableIterator<ReadonlyLabelVector>;
  iterLabelClasses(): IterableIterator<ReadonlyLabelClass>;

  hasLabelVector(id: UUID): boolean;
  getLabelVector(id: UUID): ReadonlyLabelVector;
  getLabelClass(id: number): ReadonlyLabelClass;

  updateLabelVectorGtClass(
    vector: ReadonlyLabelVector,
    labelClass: ReadonlyLabelClass | null,
  ): Promise<void>;
}

export interface LabelVectorInspectorEventMap {
  change: {};
  "select-vector": { value: ReadonlyLabelVector | null };
  "toggle-drawVector": { drawVectorActive: boolean };
}

export interface LabelVectorInspectorParams {
  labelsView: VectorInspectorLabelsView;
  selectedId?: UUID | null;
  disabled?: boolean;
}

export interface LabelVectorInspectorHandle extends InspectorHandle<
  LabelVectorInspectorPaneControllerParams,
  LabelVectorInspectorEventMap
> {
  disabled: boolean;
  drawVectorActive: boolean;
  readonly labelsView: VectorInspectorLabelsView;
  readonly selectedVector: ReadonlyLabelVector | null;
  selectedId: UUID | null;
  clickDrawVector(): void;
  getVectorParams(): Omit<
    VectorParams,
    "config" | "id" | "vertices" | "vectorType"
  >;
}

export function getLabelVectorInspectorPaneParams(
  labelsView: VectorInspectorLabelsView,
  selectedVector: ReadonlyLabelVector | null,
  disabled: boolean,
  drawVectorActive: boolean,
): Pick<
  LabelVectorInspectorPaneControllerParams,
  "inputtedData" | "internalData" | "settings"
> {
  const labels = labelsView.data;
  const inputtedData =
    selectedVector == null
      ? {
          ...cloneLabelVectorInspectorInputtedData(
            labelVectorInspectorPaneFactoryParams.inputtedData,
          ),
          selection: { vectorId: null },
        }
      : {
          selection: { vectorId: selectedVector.id },
          relations: {
            classSelect: { classId: selectedVector.gtClassId },
          },
        };

  return {
    inputtedData: inputtedData,
    internalData: {
      // Pane data must stay plain: project model instances into DTO
      // rows here, computing display text at projection time.
      vectors: new Map(
        Array.from(labelsView.iterLabelVectors(), (entry) => [
          entry.id,
          labelVectorToSelectionItem(entry),
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
      drawVectorActive,
      disableTransform: false,
    },
  };
}

/**
 * Displays information about a vector object which can be edited directly.
 *
 */
export class LabelVectorInspector implements LabelVectorInspectorHandle {
  #events = createInspectorEventBus<LabelVectorInspectorEventMap>();

  #inputtedData: LabelVectorInspectorPaneControllerParams["inputtedData"];

  #internalData: LabelVectorInspectorPaneControllerParams["internalData"];

  #settings: LabelVectorInspectorPaneControllerParams["settings"];

  /**
   * A view of the collection of labels used to update the selected vector object.
   */
  readonly labelsView: VectorInspectorLabelsView;

  /**
   * Handles the event when the collection of labels is (un)loaded.
   */
  #onDataLoad = () => {
    const selectedId = this.selectedId;
    if (selectedId != null && !this.labelsView.hasLabelVector(selectedId)) {
      // The label no longer exists
      this.selectedId = null;
    }

    // Need to show the new list of available labels
    this.#render();
  };

  readonly #signaller;

  #selectedId;

  /**
   * The unique identifier of the vector object that is selected, if any.
   */
  get selectedId() {
    return this.#selectedId;
  }

  /**
   * The unique identifier of the vector object that is selected, if any.
   */
  set selectedId(value) {
    if (this.#selectedId !== value) {
      this.#selectedId = value;

      // Need to show the attributes for the newly selected vector object
      this.#render();

      this.#events.dispatchEvent({
        type: "select-vector",
        value: this.selectedVector,
      });
    }
  }

  /**
   * The bounding box that is selected, if any.
   */
  get selectedVector() {
    const { selectedId, labelsView } = this;
    if (selectedId == null) return null;

    return labelsView.hasLabelVector(selectedId)
      ? labelsView.getLabelVector(selectedId)
      : null; // May not exist if the data is currently being loaded
  }

  #disabled;

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

  #drawVectorActive: boolean;

  /**
   * `true` if the draw box button is active; otherwise, `false`.
   */
  get drawVectorActive() {
    return this.#drawVectorActive;
  }

  set drawVectorActive(value: boolean) {
    if (this.#drawVectorActive !== value) {
      this.#drawVectorActive = value;

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
    outputData: LabelVectorParams;
    prevOutputData: LabelVectorParams;
  }) => {
    const { vectorId: prevVectorId } = event.prevOutputData;
    const { vectorId } = event.outputData;

    // Select vector
    if (vectorId !== prevVectorId) {
      this.selectedId = vectorId;
      // Edit vector
    } else {
      void this.#updateVector();
    }
  };

  async #updateVector() {
    const { labelsView, selectedVector } = this;
    if (selectedVector == null) return;

    const { classId } = this.outputData;

    if (selectedVector.gtClassId !== classId) {
      const labelClass =
        classId == null ? null : labelsView.getLabelClass(classId);
      await labelsView.updateLabelVectorGtClass(selectedVector, labelClass);
    }
  }

  /**
   * Updates the view according to the data in this object.
   */
  #render() {
    const { labelsView, selectedVector, disabled, drawVectorActive } = this;
    const paneParams = getLabelVectorInspectorPaneParams(
      labelsView,
      selectedVector,
      disabled,
      drawVectorActive,
    );
    this.#inputtedData = paneParams.inputtedData;
    this.#internalData = paneParams.internalData;
    this.#settings = paneParams.settings;

    this.#signaller.labels = labelsView.data;
    this.#notifyRender();
  }

  #requireRender = () => this.#render();

  /**
   * Handles the event when the user begins drawing a new vector object.
   *
   * The event to handle.
   */
  #onDrawVector = (event?: { type: string }) => {
    this.drawVectorActive = !this.drawVectorActive;

    this.#events.dispatchEvent({
      type: "toggle-drawVector",
      drawVectorActive: this.drawVectorActive,
    });
  };

  /**
   * Gets the parameters of a vector object represented by this inspector.
   *
   * parameters.
   */
  getVectorParams(): Omit<
    VectorParams,
    "config" | "id" | "vertices" | "vectorType"
  > {
    const { classId } = this.outputData;

    return {
      gtClassId: classId,
    };
  }

  /**
   * Creates a new vector object inspector.
   */
  constructor(params: LabelVectorInspectorParams) {
    this.labelsView = params.labelsView ?? null;
    this.labelsView.addEventListener("beforeload", this.#onDataLoad);
    this.labelsView.addEventListener("afterload", this.#onDataLoad);

    this.#selectedId = params.selectedId ?? null;
    this.#disabled = params.disabled ?? false;

    this.#inputtedData = cloneLabelVectorInspectorInputtedData(
      labelVectorInspectorPaneFactoryParams.inputtedData,
    );
    this.#internalData = null;
    this.#settings = {
      disabled: false,
      hidden: false,
      drawVectorActive: false,
      disableTransform: true,
    };

    this.#signaller = new InspectorRenderSignaller(
      composeRenderTriggers(selectionRenderTriggers, relationsRenderTriggers),
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
   * Clicks on the draw Vector button.
   *
   * This is a no-op if the button is disabled.
   */
  clickDrawVector() {
    if (!this.#settings.disabled) this.#onDrawVector();
  }

  get paneParams(): Pick<
    LabelVectorInspectorPaneControllerParams,
    "inputtedData" | "internalData" | "settings"
  > {
    return {
      inputtedData: this.#inputtedData,
      internalData: this.#internalData,
      settings: this.#settings,
    };
  }

  get outputData(): LabelVectorParams {
    return labelVectorInspectorPaneDataProcessor.outputData(
      this.#getPaneElementParams(),
    );
  }

  onInputChange = (
    inputtedData: LabelVectorInspectorPaneControllerParams["inputtedData"],
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
    if (event.type === "click-drawVector") this.#onDrawVector(event);
  };

  #getPaneElementParams(): PaneElementParams<LabelVectorInspectorPaneControllerParams> {
    return {
      inputtedData: this.#inputtedData,
      computedData: labelVectorInspectorPaneDataProcessor.computeData(
        this.#inputtedData,
        this.#internalData,
      ),
      settings: this.#settings,
    };
  }

  #notifyRender(): void {
    this.#events.dispatchEvent({ type: "change" });
  }

  addEventListener<TType extends keyof LabelVectorInspectorEventMap>(
    type: TType,
    listener: (
      event: Readonly<{ type: TType } & LabelVectorInspectorEventMap[TType]>,
    ) => void,
  ): void {
    this.#events.addEventListener(type, listener);
  }

  removeEventListener<TType extends keyof LabelVectorInspectorEventMap>(
    type: TType,
    listener: (
      event: Readonly<{ type: TType } & LabelVectorInspectorEventMap[TType]>,
    ) => void,
  ): void {
    this.#events.removeEventListener(type, listener);
  }
}
