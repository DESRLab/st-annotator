import type {
  InspectorPaneRenderTrigger,
  PaneControllerDataProcessor,
  PaneElementParams,
} from "sta/app/editor";

import type { BBoxIndexEventMap, UUID } from "../data";

/** A projected object-track row displayed by selection controls. */
export interface LabelTrackSelectionItem {
  readonly id: UUID;
  readonly text: string;
}

export interface LabelTrackSelectionPaneControllerParams {
  inputtedData: { trackId: UUID | null };
  computedData: { tracks: readonly LabelTrackSelectionItem[] };
  settings: { disabled: boolean; hidden: boolean };
  internalData: { tracks: readonly LabelTrackSelectionItem[] } | null;
  outputData: { trackId: UUID | null };
}

type LabelTrackSelectionPaneElementParams =
  PaneElementParams<LabelTrackSelectionPaneControllerParams>;

export const renderTriggers: InspectorPaneRenderTrigger<BBoxIndexEventMap> = {
  "track-add": true,
  "track-delete": true,
  "bulk-add": true,
  "bulk-delete": true,
  "track-resolveId": true,
  "track-update": (event) =>
    event.propertyKey === "id" || event.propertyKey === "gtClassId",
  "class-update": (event) => event.propertyKey === "name",
};

export function getLabelTrackSelectionOutputData({
  inputtedData: { trackId },
  computedData: { tracks },
}: Readonly<LabelTrackSelectionPaneElementParams>): { trackId: UUID | null } {
  return {
    trackId:
      trackId != null && !tracks.some((item) => item.id === trackId)
        ? null
        : trackId,
  };
}

export const labelTrackSelectionPaneDefaultParams: LabelTrackSelectionPaneElementParams =
  {
    inputtedData: { trackId: null },
    computedData: { tracks: [] },
    settings: { disabled: false, hidden: false },
  };

export { getLabelTrackSelectionItemText } from "./LabelSelectionText";

export const labelTrackSelectionPaneDataProcessor: PaneControllerDataProcessor<LabelTrackSelectionPaneControllerParams> =
  {
    computeData: (_inputtedData, internalData) => ({
      tracks: internalData?.tracks ?? [],
    }),
    outputData: getLabelTrackSelectionOutputData,
  };
