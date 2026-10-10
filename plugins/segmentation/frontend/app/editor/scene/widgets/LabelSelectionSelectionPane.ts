import type {
  PaneControllerDataProcessor,
  PaneElementParams,
  InspectorPaneRenderTrigger,
} from "sta/app/editor";

import type { UUID, SegmentationIndexEventMap } from "../data";

import { getLabelSelectionSelectionItemText } from "./LabelSelectionText";
import type { LabelSelectionSelectionItemSource } from "./LabelSelectionText";

/**
 * The plain record of a label selection this pane displays; projected from
 * the model selection at pane-param build time.
 */
export interface LabelSelectionSelectionItem {
  readonly id: UUID;
  readonly text: string;
}

export interface LabelSelectionSelectionInputtedData {
  selectionId: UUID | null;
}

export interface LabelSelectionSelectionComputedData {
  selections: ReadonlyMap<UUID, LabelSelectionSelectionItem>;
}

interface LabelSelectionSelectionPaneSettings {
  disabled: boolean;
  hidden: boolean;
}

interface LabelSelectionSelectionSource {
  selections: ReadonlyMap<UUID, LabelSelectionSelectionItem>;
}

interface LabelSelectionSelection {
  selectionId: UUID | null;
}

export interface LabelSelectionSelectionPaneControllerParams {
  inputtedData: LabelSelectionSelectionInputtedData;
  computedData: LabelSelectionSelectionComputedData;
  settings: LabelSelectionSelectionPaneSettings;
  internalData: LabelSelectionSelectionSource | null;
  outputData: LabelSelectionSelection;
}

type LabelSelectionSelectionPaneElementParams =
  PaneElementParams<LabelSelectionSelectionPaneControllerParams>;

export const renderTriggers: InspectorPaneRenderTrigger<SegmentationIndexEventMap> =
  {
    // Number of items is changed
    "selection-add": true,
    "selection-delete": true,
    "bulk-add": true,
    "bulk-delete": true,

    // Display text is changed
    "selection-resolveId": true,
    "selection-update": (e) =>
      e.propertyKey === "id" ||
      e.propertyKey === "entityId" ||
      e.propertyKey === "perceivedClassId",
    "class-update": (e) => e.propertyKey === "name",
    "instance-update": (e) => e.propertyKey === "gtClassId",
  };

export function getLabelSelectionSelectionOutputData(
  paneParams: Readonly<LabelSelectionSelectionPaneElementParams>,
): LabelSelectionSelection {
  const {
    inputtedData: { selectionId },
    computedData: { selections },
  } = paneParams;

  let safeValue = selectionId;
  if (selectionId != null && !selections.has(selectionId)) {
    safeValue = null;
  }

  return { selectionId: safeValue };
}

export const labelSelectionSelectionPaneDefaultParams: LabelSelectionSelectionPaneElementParams =
  {
    inputtedData: {
      selectionId: null,
    },
    computedData: {
      selections: new Map(),
    },
    settings: {
      disabled: false,
      hidden: false,
    },
  };

/**
 * Projects a label selection into the plain item displayed by this pane.
 *
 * @param item The label selection members to project.
 * @returns The resulting plain item.
 */
export function projectLabelSelectionSelectionItem(
  item: LabelSelectionSelectionItemSource,
): LabelSelectionSelectionItem {
  return { id: item.id, text: getLabelSelectionSelectionItemText(item) };
}

export { getLabelSelectionSelectionItemText } from "./LabelSelectionText";
export type { LabelSelectionSelectionItemSource } from "./LabelSelectionText";

export const labelSelectionSelectionPaneDataProcessor: PaneControllerDataProcessor<LabelSelectionSelectionPaneControllerParams> =
  {
    computeData: (_inputtedData, internalData) => ({
      selections: internalData?.selections ?? new Map(),
    }),
    outputData: getLabelSelectionSelectionOutputData,
  };
