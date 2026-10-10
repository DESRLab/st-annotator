import type {
  PaneControllerDataProcessor,
  PaneElementParams,
  InspectorPaneRenderTrigger,
} from "sta/app/editor";

import type { UUID, BBoxIndexEventMap } from "../data";

export interface LabelBoxSelectionInputtedData {
  boxId: UUID | null;
}

/**
 * A plain row displayed by the label-box selection pane: the unique identifier
 * of a bounding box along with its precomputed display text.
 */
export interface LabelBoxSelectionItem {
  readonly id: UUID;
  readonly text: string;
}

export interface LabelBoxSelectionComputedData {
  boxes: readonly LabelBoxSelectionItem[];
}

interface LabelBoxSelectionPaneSettings {
  disabled: boolean;
  hidden: boolean;
}

interface LabelBoxSelectionSource {
  boxes: readonly LabelBoxSelectionItem[];
}

interface LabelBoxSelection {
  boxId: UUID | null;
}

export interface LabelBoxSelectionPaneControllerParams {
  inputtedData: LabelBoxSelectionInputtedData;
  computedData: LabelBoxSelectionComputedData;
  settings: LabelBoxSelectionPaneSettings;
  internalData: LabelBoxSelectionSource | null;
  outputData: LabelBoxSelection;
}

type LabelBoxSelectionPaneElementParams =
  PaneElementParams<LabelBoxSelectionPaneControllerParams>;

export const renderTriggers: InspectorPaneRenderTrigger<BBoxIndexEventMap> = {
  // Number of items is changed
  "box-add": true,
  "box-delete": true,
  "bulk-add": true,
  "bulk-delete": true,

  // Display text is changed
  "box-resolveId": true,
  "box-update": (e) =>
    e.propertyKey === "id" ||
    e.propertyKey === "entityId" ||
    e.propertyKey === "perceivedClassId",
  "class-update": (e) => e.propertyKey === "name",
  "track-update": (e) => e.propertyKey === "gtClassId",
};

export function getLabelBoxSelectionOutputData(
  paneParams: Readonly<LabelBoxSelectionPaneElementParams>,
): LabelBoxSelection {
  const {
    inputtedData: { boxId },
    computedData: { boxes },
  } = paneParams;

  let safeValue = boxId;
  if (boxId != null && !boxes.some((item) => item.id === boxId)) {
    safeValue = null;
  }

  return { boxId: safeValue };
}

export const labelBoxSelectionPaneDefaultParams: LabelBoxSelectionPaneElementParams =
  {
    inputtedData: {
      boxId: null,
    },
    computedData: {
      boxes: [],
    },
    settings: {
      disabled: false,
      hidden: false,
    },
  };

export { getLabelBoxSelectionItemText } from "./LabelSelectionText";

export const labelBoxSelectionPaneDataProcessor: PaneControllerDataProcessor<LabelBoxSelectionPaneControllerParams> =
  {
    computeData: (_inputtedData, internalData) => ({
      boxes: internalData?.boxes ?? [],
    }),
    outputData: getLabelBoxSelectionOutputData,
  };
