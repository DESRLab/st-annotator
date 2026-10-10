import type { InspectorHandle, PaneElementParams } from "sta/app/editor";
import {
  createInspectorEventBus,
  InspectorRenderSignaller,
  composeRenderTriggers,
} from "sta/app/editor";

import type { ReadonlyLabelTrack, TrackParams, UUID } from "../data";

import type { BBoxInspectorLabelsView } from "./LabelBoxInspector.tsx";
import { renderTriggers as descriptorsRenderTriggers } from "./LabelTrackDescriptorsPane.ts";
import {
  labelTrackInspectorPaneDataProcessor,
  labelTrackInspectorPaneFactoryParams,
} from "./LabelTrackInspectorPane.ts";
import type {
  LabelTrackParams,
  LabelTrackInspectorPaneControllerParams,
} from "./LabelTrackInspectorPane.ts";
import { renderTriggers as relationsRenderTriggers } from "./LabelTrackRelationsPane.ts";
import {
  getLabelTrackSelectionItemText,
  renderTriggers as selectionRenderTriggers,
} from "./LabelTrackSelectionPane.ts";

export interface LabelTrackInspectorEventMap {
  change: {};
  "select-track": { value: ReadonlyLabelTrack | null };
}

export interface LabelTrackInspectorParams {
  labelsView: BBoxInspectorLabelsView;
  selectedId?: UUID | null;
  disabled?: boolean;
}

export interface LabelTrackInspectorHandle extends InspectorHandle<
  LabelTrackInspectorPaneControllerParams,
  LabelTrackInspectorEventMap
> {
  disabled: boolean;
  readonly labelsView: BBoxInspectorLabelsView;
  readonly selectedTrack: ReadonlyLabelTrack | null;
  selectedId: UUID | null;
  clickCreateTrack(): void;
  getTrackParams(): Pick<TrackParams, "gtClassId" | "isBlack">;
}

export function getLabelTrackInspectorPaneParams(
  labelsView: BBoxInspectorLabelsView,
  selectedTrack: ReadonlyLabelTrack | null,
  disabled: boolean,
): Pick<
  LabelTrackInspectorPaneControllerParams,
  "inputtedData" | "internalData" | "settings"
> {
  const labels = labelsView.data;
  const inputtedData =
    selectedTrack == null
      ? {
          ...structuredClone(labelTrackInspectorPaneFactoryParams.inputtedData),
          selection: { trackId: null },
        }
      : {
          selection: { trackId: selectedTrack.id },
          relations: {
            classSelect: { classId: selectedTrack.gtClassId },
          },
          descriptors: { isBlack: selectedTrack.isBlack },
        };

  return {
    inputtedData: inputtedData,
    internalData: {
      // Project the model instances into plain DTO rows/records so they
      // can cross into pane data
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
    settings: { disabled: disabled || labels == null, hidden: false },
  };
}

/**
 * Creates an imperative object-track inspector.
 *
 * Owned by the layer's interaction context (not React); the inspector pane
 * reads its state from the editor state snapshot and writes back through
 * the editor intents, which delegate here.
 */
export function createLabelTrackInspector(
  params: LabelTrackInspectorParams,
): LabelTrackInspectorHandle {
  const { labelsView } = params;
  const events = createInspectorEventBus<LabelTrackInspectorEventMap>();
  const signaller = new InspectorRenderSignaller(
    composeRenderTriggers(
      selectionRenderTriggers,
      relationsRenderTriggers,
      descriptorsRenderTriggers,
    ),
  );
  let selectedId = params.selectedId ?? null;
  let disabled = params.disabled ?? false;
  let inputtedData = structuredClone(
    labelTrackInspectorPaneFactoryParams.inputtedData,
  );
  let internalData: LabelTrackInspectorPaneControllerParams["internalData"] =
    null;
  let settings = labelTrackInspectorPaneFactoryParams.settings;

  const selectedTrack = (): ReadonlyLabelTrack | null =>
    selectedId != null && labelsView.hasLabelTrack(selectedId)
      ? labelsView.getLabelTrack(selectedId)
      : null;
  const getPaneElementParams =
    (): PaneElementParams<LabelTrackInspectorPaneControllerParams> => ({
      inputtedData,
      computedData: labelTrackInspectorPaneDataProcessor.computeData(
        inputtedData,
        internalData,
      ),
      settings,
    });
  const outputData = (): LabelTrackParams =>
    labelTrackInspectorPaneDataProcessor.outputData(getPaneElementParams());
  const notifyRender = (): void => events.dispatchEvent({ type: "change" });
  const render = (): void => {
    const paneParams = getLabelTrackInspectorPaneParams(
      labelsView,
      selectedTrack(),
      disabled,
    );
    inputtedData = paneParams.inputtedData;
    internalData = paneParams.internalData;
    settings = paneParams.settings;
    signaller.labels = labelsView.data;
    notifyRender();
  };
  const updateTrack = async (): Promise<void> => {
    const track = selectedTrack();
    if (track == null) return;

    const { classId, isBlack } = outputData();
    if (track.gtClassId !== classId) {
      await labelsView.updateLabelTrackGtClass(
        track,
        classId == null ? null : labelsView.getLabelClass(classId),
      );
    }
    if (track.isBlack !== isBlack)
      await labelsView.updateLabelTrackIsBlack(track, isBlack);
  };
  const onInspectorChange = async (event: {
    outputData: LabelTrackParams;
    prevOutputData: LabelTrackParams;
  }): Promise<void> => {
    if (event.outputData.trackId !== event.prevOutputData.trackId) {
      inspector.selectedId = event.outputData.trackId;
    } else {
      await updateTrack();
    }
  };
  const createTrack = async (): Promise<void> => {
    const { classId, isBlack } = outputData();
    const track = await labelsView.addLabelTrack({
      gtClassId: classId,
      isBlack,
    });
    inspector.selectedId = track.id;
  };
  const onDataLoad = (): void => {
    if (selectedId != null && !labelsView.hasLabelTrack(selectedId))
      inspector.selectedId = null;
    render();
  };
  const requireRender = (): void => render();

  const inspector: LabelTrackInspectorHandle = {
    get labelsView(): BBoxInspectorLabelsView {
      return labelsView;
    },
    get selectedId(): UUID | null {
      return selectedId;
    },
    set selectedId(value: UUID | null) {
      if (selectedId === value) return;
      selectedId = value;
      render();
      events.dispatchEvent({
        type: "select-track",
        value: selectedTrack(),
      });
    },
    get selectedTrack(): ReadonlyLabelTrack | null {
      return selectedTrack();
    },
    get disabled(): boolean {
      return disabled;
    },
    set disabled(value: boolean) {
      if (disabled === value) return;
      disabled = value;
      render();
    },
    get paneParams(): Pick<
      LabelTrackInspectorPaneControllerParams,
      "inputtedData" | "internalData" | "settings"
    > {
      return { inputtedData, internalData, settings };
    },
    getTrackParams(): Pick<TrackParams, "gtClassId" | "isBlack"> {
      const { classId, isBlack } = outputData();
      return { gtClassId: classId, isBlack };
    },
    clickCreateTrack(): void {
      if (!settings.disabled) void createTrack();
    },
    onInputChange(nextInputtedData): void {
      const prevOutputData = outputData();
      inputtedData = nextInputtedData;
      notifyRender();
      void onInspectorChange({
        prevOutputData,
        outputData: outputData(),
      });
    },
    onPaneEvent(event): void {
      if (event.type === "click-createTrack") void createTrack();
    },
    dispose(): void {
      labelsView.removeEventListener("beforeload", onDataLoad);
      labelsView.removeEventListener("afterload", onDataLoad);
      signaller.removeEventListener("render", requireRender);
      signaller.dispose();
      events.clear();
    },
    addEventListener(type, listener): void {
      events.addEventListener(type, listener);
    },
    removeEventListener(type, listener): void {
      events.removeEventListener(type, listener);
    },
  };

  labelsView.addEventListener("beforeload", onDataLoad);
  labelsView.addEventListener("afterload", onDataLoad);
  signaller.addEventListener("render", requireRender);
  render();
  return inspector;
}
