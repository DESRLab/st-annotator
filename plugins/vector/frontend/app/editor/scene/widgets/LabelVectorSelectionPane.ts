import type {
  PaneControllerDataProcessor,
  PaneElementParams,
} from "sta/app/editor";

import type { UUID, VectorIndexEventMap } from "../data";

import { getLabelVectorSelectionItemText } from "./LabelSelectionText";
import type { LabelVectorSelectionItemSource } from "./LabelSelectionText";

/**
 * A plain row of the vector selection dropdown. The display text is computed
 * at projection time, so the pane never sees model instances.
 */
export interface LabelVectorSelectionItem {
  id: UUID;
  text: string;
}

export type { LabelVectorSelectionItemSource };

export interface LabelVectorSelectionInputtedData {
  vectorId: UUID | null;
}

export interface LabelVectorSelectionComputedData {
  vectors: ReadonlyMap<UUID, LabelVectorSelectionItem>;
}

interface LabelVectorSelectionPaneSettings {
  disabled: boolean;
  hidden: boolean;
}

interface LabelVectorSelectionSource {
  vectors: ReadonlyMap<UUID, LabelVectorSelectionItem>;
}

interface LabelVectorSelection {
  vectorId: UUID | null;
}

export interface LabelVectorSelectionPaneControllerParams {
  inputtedData: LabelVectorSelectionInputtedData;
  computedData: LabelVectorSelectionComputedData;
  settings: LabelVectorSelectionPaneSettings;
  internalData: LabelVectorSelectionSource | null;
  outputData: LabelVectorSelection;
}

type LabelVectorSelectionPaneElementParams =
  PaneElementParams<LabelVectorSelectionPaneControllerParams>;

export const renderTriggers = {
  "vector-add": true,
  "vector-delete": true,
  "bulk-add": true,
  "bulk-delete": true,

  "vector-resolveId": true,
  "vector-update": (e: VectorIndexEventMap["vector-update"]) =>
    e.propertyKey === "id" || e.propertyKey === "gtClassId",
  "class-update": (e: VectorIndexEventMap["class-update"]) =>
    e.propertyKey === "name",
};

export function getLabelVectorSelectionOutputData(
  paneParams: LabelVectorSelectionPaneElementParams,
) {
  const {
    inputtedData: { vectorId },
    computedData: { vectors },
  } = paneParams;

  let safeValue = vectorId;
  if (vectorId != null && !vectors.has(vectorId)) {
    safeValue = null;
  }

  return { vectorId: safeValue };
}

export const labelVectorSelectionPaneDefaultParams: LabelVectorSelectionPaneElementParams =
  {
    inputtedData: {
      vectorId: null,
    },
    computedData: {
      vectors: new Map(),
    },
    settings: {
      disabled: false,
      hidden: false,
    },
  };

export { getLabelVectorSelectionItemText };

/** Projects a vector object into a plain selection pane row. */
export function labelVectorToSelectionItem(
  item: LabelVectorSelectionItemSource,
): LabelVectorSelectionItem {
  return { id: item.id, text: getLabelVectorSelectionItemText(item) };
}

export const labelVectorSelectionPaneDataProcessor: PaneControllerDataProcessor<LabelVectorSelectionPaneControllerParams> =
  {
    computeData: (
      inputtedData: LabelVectorSelectionPaneControllerParams["inputtedData"],
      internalData: LabelVectorSelectionPaneControllerParams["internalData"],
    ) => ({
      vectors: internalData?.vectors ?? new Map(),
    }),
    outputData: getLabelVectorSelectionOutputData,
  };
