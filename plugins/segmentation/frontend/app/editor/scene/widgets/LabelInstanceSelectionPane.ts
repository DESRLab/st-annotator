import type {
  InspectorPaneRenderTrigger,
  PaneControllerDataProcessor,
  PaneElementParams,
} from "sta/app/editor";

import type { SegmentationIndexEventMap, UUID } from "../data";
import { getLabelInstanceSelectionItemText } from "./LabelSelectionText";
import type { LabelInstanceSelectionItemSource } from "./LabelSelectionText";

/** A projected label-instance row displayed by selection controls. */
export interface LabelInstanceSelectionItem {
  readonly id: UUID;
  readonly text: string;
}

export interface LabelInstanceSelectionPaneControllerParams {
  inputtedData: { instanceId: UUID | null };
  computedData: { instances: ReadonlyMap<UUID, LabelInstanceSelectionItem> };
  settings: { disabled: boolean; hidden: boolean };
  internalData: {
    instances: ReadonlyMap<UUID, LabelInstanceSelectionItem>;
  } | null;
  outputData: { instanceId: UUID | null };
}

type LabelInstanceSelectionPaneElementParams =
  PaneElementParams<LabelInstanceSelectionPaneControllerParams>;

export const renderTriggers: InspectorPaneRenderTrigger<SegmentationIndexEventMap> =
  {
    "instance-add": true,
    "instance-delete": true,
    "bulk-add": true,
    "bulk-delete": true,
    "instance-resolveId": true,
    "instance-update": (event) =>
      event.propertyKey === "id" || event.propertyKey === "gtClassId",
    "class-update": (event) => event.propertyKey === "name",
  };

export function getLabelInstanceSelectionOutputData({
  inputtedData: { instanceId },
  computedData: { instances },
}: Readonly<LabelInstanceSelectionPaneElementParams>): {
  instanceId: UUID | null;
} {
  return {
    instanceId:
      instanceId != null && !instances.has(instanceId) ? null : instanceId,
  };
}

export const labelInstanceSelectionPaneDefaultParams: LabelInstanceSelectionPaneElementParams =
  {
    inputtedData: { instanceId: null },
    computedData: { instances: new Map() },
    settings: { disabled: false, hidden: false },
  };

export function projectLabelInstanceSelectionItem(
  item: LabelInstanceSelectionItemSource,
): LabelInstanceSelectionItem {
  return { id: item.id, text: getLabelInstanceSelectionItemText(item) };
}

export { getLabelInstanceSelectionItemText } from "./LabelSelectionText";
export type { LabelInstanceSelectionItemSource } from "./LabelSelectionText";

export const labelInstanceSelectionPaneDataProcessor: PaneControllerDataProcessor<LabelInstanceSelectionPaneControllerParams> =
  {
    computeData: (_inputtedData, internalData) => ({
      instances: internalData?.instances ?? new Map(),
    }),
    outputData: getLabelInstanceSelectionOutputData,
  };
