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

import type { DistinctiveLevel, OcclusionLevel } from "../../../../models";
import type {
  BoxParams,
  BoxPose,
  BoxType,
  ReadonlyBBoxIndex,
  ReadonlyLabelBox,
  ReadonlyLabelClass,
  ReadonlyLabelTrack,
  TrackParams,
  UUID,
} from "../data";

import { renderTriggers as descriptorsRenderTriggers } from "./LabelBoxDescriptorsPane.ts";
import { renderTriggers as geometryRenderTriggers } from "./LabelBoxGeometryPane.ts";
import {
  cloneLabelBoxInspectorInputtedData,
  labelBoxInspectorPaneDataProcessor,
  labelBoxInspectorPaneFactoryParams,
} from "./LabelBoxInspectorPane.ts";
import type {
  LabelBoxParams,
  LabelBoxInspectorPaneControllerParams,
} from "./LabelBoxInspectorPane.ts";
import { renderTriggers as relationsRenderTriggers } from "./LabelBoxRelationsPane.ts";
import {
  getLabelBoxSelectionItemText,
  renderTriggers as selectionRenderTriggers,
} from "./LabelBoxSelectionPane.ts";
import { getLabelTrackSelectionItemText } from "./LabelTrackSelectionPane.ts";

/**
 * The narrow, structural surface of the bbox labels view consumed by the
 * inspectors: the current labels index, the entity query accessors, the
 * label mutation APIs, and the load events. Deliberately declares no
 * three.js-facing members. The concrete `BBoxView` satisfies this
 * structurally.
 */
export interface BBoxInspectorLabelsView extends SourceEventTarget {
  readonly data: ReadonlyBBoxIndex | null;

  iterLabelBoxes(): IterableIterator<ReadonlyLabelBox>;
  iterLabelTracks(): IterableIterator<ReadonlyLabelTrack>;
  iterLabelClasses(): IterableIterator<ReadonlyLabelClass>;

  hasLabelBox(id: UUID): boolean;
  getLabelBox(id: UUID): ReadonlyLabelBox;
  hasLabelTrack(id: UUID): boolean;
  getLabelTrack(id: UUID): ReadonlyLabelTrack;
  getLabelClass(id: number): ReadonlyLabelClass;

  addLabelTrack(params: Omit<TrackParams, "id">): Promise<ReadonlyLabelTrack>;
  updateLabelBoxTransform(
    box: ReadonlyLabelBox,
    mode: string,
    pose: BoxPose,
  ): Promise<void>;
  updateLabelBoxType(box: ReadonlyLabelBox, boxType: BoxType): Promise<void>;
  updateLabelBoxParentTrack(
    box: ReadonlyLabelBox,
    track: ReadonlyLabelTrack | null,
  ): Promise<void>;
  updateLabelBoxPerceivedClass(
    box: ReadonlyLabelBox,
    labelClass: ReadonlyLabelClass | null,
  ): Promise<void>;
  updateLabelBoxDistinctiveLv(
    box: ReadonlyLabelBox,
    distinctiveLv: DistinctiveLevel,
  ): Promise<void>;
  updateLabelBoxOcclusionLv(
    box: ReadonlyLabelBox,
    occlusionLv: OcclusionLevel,
  ): Promise<void>;
  updateLabelTrackGtClass(
    track: ReadonlyLabelTrack,
    labelClass: ReadonlyLabelClass | null,
  ): Promise<void>;
  updateLabelTrackIsBlack(
    track: ReadonlyLabelTrack,
    isBlack: boolean,
  ): Promise<void>;
}

export interface LabelBoxInspectorEventMap {
  change: {};
  "select-box": { value: ReadonlyLabelBox | null };
  "select-track": { value: ReadonlyLabelTrack | null };
  "toggle-drawBox": { drawBoxActive: boolean };
}

export interface LabelBoxInspectorParams {
  labelsView: BBoxInspectorLabelsView;
  selectedId?: UUID | null;
  disabled?: boolean;
  autoTracks?: boolean;
}

export interface LabelBoxInspectorHandle extends InspectorHandle<
  LabelBoxInspectorPaneControllerParams,
  LabelBoxInspectorEventMap
> {
  autoTracks: boolean;
  disabled: boolean;
  drawBoxActive: boolean;
  readonly labelsView: BBoxInspectorLabelsView;
  readonly selectedBox: ReadonlyLabelBox | null;
  selectedId: UUID | null;
  clickDrawBox(): void;
  getBoxParams(): Pick<
    BoxParams,
    | "boxType"
    | "entityId"
    | "perceivedClassId"
    | "distinctiveLv"
    | "occlusionLv"
  >;
}

export function getLabelBoxInspectorPaneParams(
  labelsView: BBoxInspectorLabelsView,
  selectedBox: ReadonlyLabelBox | null,
  disabled: boolean,
  autoTracks: boolean,
  drawBoxActive: boolean,
): Pick<
  LabelBoxInspectorPaneControllerParams,
  "inputtedData" | "internalData" | "settings"
> {
  const labels = labelsView.data;
  const inputtedData =
    selectedBox == null
      ? {
          ...cloneLabelBoxInspectorInputtedData(
            labelBoxInspectorPaneFactoryParams.inputtedData,
          ),
          selection: { boxId: null },
        }
      : {
          selection: { boxId: selectedBox.id },
          geometry: {
            boxType: selectedBox.boxType,
            // Project the live three.js vectors into plain records so
            // they can cross into pane data
            center: {
              x: selectedBox.center.x,
              y: selectedBox.center.y,
              z: selectedBox.center.z,
            },
            size: {
              x: selectedBox.size.x,
              y: selectedBox.size.y,
              z: selectedBox.size.z,
            },
            angle: selectedBox.angle,
          },
          relations: {
            trackSelect: { trackId: selectedBox.entityId },
            classSelect: { classId: selectedBox.perceivedClassId },
          },
          descriptors: {
            distinctiveLv: selectedBox.distinctiveLv,
            occlusionLv: selectedBox.occlusionLv,
          },
        };

  return {
    inputtedData: inputtedData,
    internalData: {
      // Project the model instances into plain DTO rows/records so they
      // can cross into pane data
      boxes: Array.from(labelsView.iterLabelBoxes(), (entry) => ({
        id: entry.id,
        text: getLabelBoxSelectionItemText(entry),
      })),
      tracks: Array.from(labelsView.iterLabelTracks(), (entry) => ({
        id: entry.id,
        text: getLabelTrackSelectionItemText(entry),
      })),
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
      drawBoxActive,
      disableTransform: false,
      disableTrackInput: autoTracks,
    },
  };
}

/**
 * Displays information about a bounding box which can be edited directly.
 *
 */
export class LabelBoxInspector implements LabelBoxInspectorHandle {
  #events = createInspectorEventBus<LabelBoxInspectorEventMap>();

  #inputtedData: LabelBoxInspectorPaneControllerParams["inputtedData"];

  #internalData: LabelBoxInspectorPaneControllerParams["internalData"];

  #settings: LabelBoxInspectorPaneControllerParams["settings"];

  /**
   * A view of the collection of labels used to update the selected object track.
   */
  readonly labelsView: BBoxInspectorLabelsView;

  /**
   * Handles the event when the collection of labels is (un)loaded.
   */
  #onDataLoad = () => {
    const selectedId = this.selectedId;
    if (selectedId != null && !this.labelsView.hasLabelBox(selectedId)) {
      // The label no longer exists
      this.selectedId = null;
    }

    // Need to show the new list of available labels
    this.#render();
  };

  readonly #signaller;

  #selectedId;

  /**
   * The unique identifier of the bounding box that is selected, if any.
   */
  get selectedId() {
    return this.#selectedId;
  }

  /**
   * The unique identifier of the bounding box that is selected, if any.
   */
  set selectedId(value) {
    if (this.#selectedId !== value) {
      this.#selectedId = value;

      // Need to show the attributes for the newly selected bounding box
      this.#render();

      this.#notifySelectBox({ value: this.selectedBox });
    }
  }

  /**
   * The bounding box that is selected, if any.
   */
  get selectedBox() {
    const { selectedId, labelsView } = this;
    if (selectedId == null) return null;

    return labelsView.hasLabelBox(selectedId)
      ? labelsView.getLabelBox(selectedId)
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

  #autoTracks;

  /**
   * If `true`, each object track only has one bounding box, and such objects
   * are managed by the program without explicit input from the user.
   */
  get autoTracks() {
    return this.#autoTracks;
  }

  set autoTracks(value) {
    if (this.#autoTracks !== value) {
      this.#autoTracks = value;

      // Need to update the settings
      this.#render();
    }
  }

  #drawBoxActive: boolean;

  /**
   * `true` if the draw box button is active; otherwise, `false`.
   */
  get drawBoxActive() {
    return this.#drawBoxActive;
  }

  set drawBoxActive(value: boolean) {
    if (this.#drawBoxActive !== value) {
      this.#drawBoxActive = value;

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
    outputData: LabelBoxParams;
    prevOutputData: LabelBoxParams;
  }) => {
    const { boxId: prevBoxId, trackId: prevTrackId } = event.prevOutputData;
    const { boxId, trackId } = event.outputData;

    // Select box
    if (boxId !== prevBoxId) {
      this.selectedId = boxId;
      // Edit box
    } else {
      void this.#updateBox();
    }

    // Select track
    if (trackId !== prevTrackId) {
      const { labelsView } = this;

      const track = trackId == null ? null : labelsView.getLabelTrack(trackId);
      this.#notifySelectTrack({ value: track });
    }
  };

  /**
   * Updates the currently selected box according to the view.
   */
  async #updateBox() {
    const { labelsView, selectedBox } = this;
    if (selectedBox == null) return;

    const {
      boxType,
      center,
      size,
      angle,
      trackId,
      classId,
      distinctiveLv,
      occlusionLv,
    } = this.outputData;

    // Component-wise equivalent of THREE.Vector3.equals
    const isCenterChanged =
      selectedBox.center.x !== center.x ||
      selectedBox.center.y !== center.y ||
      selectedBox.center.z !== center.z;
    const isSizeChanged =
      selectedBox.size.x !== size.x ||
      selectedBox.size.y !== size.y ||
      selectedBox.size.z !== size.z;

    if (isCenterChanged || isSizeChanged || selectedBox.angle !== angle) {
      await labelsView.updateLabelBoxTransform(selectedBox, "inspector", {
        // Snapshot the plain records so later in-place pane edits
        // cannot affect the pending operation
        center: { ...center },
        size: { ...size },
        angle,
      });
    }

    if (selectedBox.boxType !== boxType) {
      await labelsView.updateLabelBoxType(selectedBox, boxType);
    }

    if (selectedBox.entityId !== trackId) {
      const track = trackId == null ? null : labelsView.getLabelTrack(trackId);
      await labelsView.updateLabelBoxParentTrack(selectedBox, track);
    }

    if (selectedBox.perceivedClassId !== classId) {
      const labelClass =
        classId == null ? null : labelsView.getLabelClass(classId);
      await labelsView.updateLabelBoxPerceivedClass(selectedBox, labelClass);

      if (this.autoTracks) {
        if (labelClass != null) {
          const track = await labelsView.addLabelTrack({
            gtClassId: classId,
          });
          await labelsView.updateLabelBoxParentTrack(selectedBox, track);
        } else {
          await labelsView.updateLabelBoxParentTrack(selectedBox, null);
        }
      }
    }

    if (!selectedBox.distinctiveLv.equals(distinctiveLv)) {
      await labelsView.updateLabelBoxDistinctiveLv(selectedBox, distinctiveLv);
    }

    if (!selectedBox.occlusionLv.equals(occlusionLv)) {
      await labelsView.updateLabelBoxOcclusionLv(selectedBox, occlusionLv);
    }
  }

  /**
   * Updates the view according to the data in this object.
   */
  #render() {
    const { labelsView, selectedBox, disabled, autoTracks, drawBoxActive } =
      this;
    const paneParams = getLabelBoxInspectorPaneParams(
      labelsView,
      selectedBox,
      disabled,
      autoTracks,
      drawBoxActive,
    );
    this.#inputtedData = paneParams.inputtedData;
    this.#internalData = paneParams.internalData;
    this.#settings = paneParams.settings;

    this.#signaller.labels = labelsView.data;
    this.#notifyRender();
  }

  #requireRender = () => this.#render();

  /**
   * Handles the event when the user begins drawing a new bounding box.
   */
  #onDrawBox = (event?: { type: string }) => {
    this.drawBoxActive = !this.drawBoxActive;

    this.#notifyToggleDrawBox({ drawBoxActive: this.drawBoxActive });
  };

  /**
   * Gets the parameters of a bounding box represented by this inspector.
   *
   * parameters.
   */
  getBoxParams(): Pick<
    BoxParams,
    | "boxType"
    | "entityId"
    | "perceivedClassId"
    | "distinctiveLv"
    | "occlusionLv"
  > {
    const { boxType, trackId, classId, distinctiveLv, occlusionLv } =
      this.outputData;

    return {
      boxType: boxType,
      entityId: trackId,
      perceivedClassId: classId,
      distinctiveLv: distinctiveLv,
      occlusionLv: occlusionLv,
    };
  }

  /**
   * Creates a new bounding box inspector.
   */
  constructor(params: LabelBoxInspectorParams) {
    this.labelsView = params.labelsView;
    this.labelsView.addEventListener("beforeload", this.#onDataLoad);
    this.labelsView.addEventListener("afterload", this.#onDataLoad);

    this.#selectedId = params.selectedId ?? null;
    this.#disabled = params.disabled ?? false;
    this.#autoTracks = params.autoTracks ?? false;

    this.#inputtedData = cloneLabelBoxInspectorInputtedData(
      labelBoxInspectorPaneFactoryParams.inputtedData,
    );
    this.#internalData = null;
    this.#settings = {
      disabled: false,
      hidden: false,
      drawBoxActive: false,
      disableTransform: true,
      disableTrackInput: false,
    };

    this.#signaller = new InspectorRenderSignaller(
      composeRenderTriggers(
        selectionRenderTriggers,
        geometryRenderTriggers,
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
   * Clicks on the draw box button.
   *
   * This is a no-op if the button is disabled.
   */
  clickDrawBox() {
    if (!this.#settings.disabled) this.#onDrawBox();
  }

  get paneParams(): Pick<
    LabelBoxInspectorPaneControllerParams,
    "inputtedData" | "internalData" | "settings"
  > {
    return {
      inputtedData: this.#inputtedData,
      internalData: this.#internalData,
      settings: this.#settings,
    };
  }

  get outputData(): LabelBoxParams {
    return labelBoxInspectorPaneDataProcessor.outputData(
      this.#getPaneElementParams(),
    );
  }

  onInputChange = (
    inputtedData: LabelBoxInspectorPaneControllerParams["inputtedData"],
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
    if (event.type === "click-drawBox") this.#onDrawBox(event);
  };

  #getPaneElementParams(): PaneElementParams<LabelBoxInspectorPaneControllerParams> {
    return {
      inputtedData: this.#inputtedData,
      computedData: labelBoxInspectorPaneDataProcessor.computeData(
        this.#inputtedData,
        this.#internalData,
      ),
      settings: this.#settings,
    };
  }

  #notifyRender(): void {
    this.#events.dispatchEvent({ type: "change" });
  }

  #notifySelectBox(event: LabelBoxInspectorEventMap["select-box"]): void {
    this.#events.dispatchEvent({ type: "select-box", ...event });
  }

  #notifySelectTrack(event: LabelBoxInspectorEventMap["select-track"]): void {
    this.#events.dispatchEvent({ type: "select-track", ...event });
  }

  #notifyToggleDrawBox(
    event: LabelBoxInspectorEventMap["toggle-drawBox"],
  ): void {
    this.#events.dispatchEvent({ type: "toggle-drawBox", ...event });
  }

  addEventListener<TType extends keyof LabelBoxInspectorEventMap>(
    type: TType,
    listener: (
      event: Readonly<{ type: TType } & LabelBoxInspectorEventMap[TType]>,
    ) => void,
  ): void {
    this.#events.addEventListener(type, listener);
  }

  removeEventListener<TType extends keyof LabelBoxInspectorEventMap>(
    type: TType,
    listener: (
      event: Readonly<{ type: TType } & LabelBoxInspectorEventMap[TType]>,
    ) => void,
  ): void {
    this.#events.removeEventListener(type, listener);
  }
}
