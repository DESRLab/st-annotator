import { cloneDeep } from "lodash";

import { definePaneElements, paneControls } from "sta/app/editor";
import type {
  PaneControllerDataProcessor,
  PaneElementFactory,
  PaneElementParams,
  InspectorPaneRenderTrigger,
} from "sta/app/editor";

import {
  DistinctiveLevel,
  OcclusionLevel,
  type QualityLevel,
} from "../../../../models";
import type { SegmentationIndexEventMap } from "../data";

export interface LabelSelectionDescriptorsInputtedData {
  distinctiveLv: QualityLevel;
  occlusionLv: QualityLevel;
}

interface LabelSelectionDescriptorsPaneSettings {
  disabled: boolean;
  hidden: boolean;
}

interface LabelSelectionDescriptors {
  distinctiveLv: QualityLevel;
  occlusionLv: QualityLevel;
}

export interface LabelSelectionDescriptorsPaneControllerParams {
  inputtedData: LabelSelectionDescriptorsInputtedData;
  computedData: {};
  settings: LabelSelectionDescriptorsPaneSettings;
  internalData: {};
  outputData: LabelSelectionDescriptors;
}

type LabelSelectionDescriptorsPaneElementParams =
  PaneElementParams<LabelSelectionDescriptorsPaneControllerParams>;

export const renderTriggers: InspectorPaneRenderTrigger<SegmentationIndexEventMap> =
  {
    // Display text is changed
    "selection-update": (e) =>
      e.propertyKey === "distinctiveLv" || e.propertyKey === "occlusionLv",
  };

export function getLabelSelectionDescriptorsOutputData(
  paneParams: Readonly<LabelSelectionDescriptorsPaneElementParams>,
): LabelSelectionDescriptors {
  const {
    inputtedData: { distinctiveLv, occlusionLv },
  } = paneParams;

  return {
    distinctiveLv: cloneDeep(distinctiveLv),
    occlusionLv: cloneDeep(occlusionLv),
  };
}

export const labelSelectionDescriptorsPaneFactoryParams: LabelSelectionDescriptorsPaneElementParams =
  {
    inputtedData: {
      distinctiveLv: DistinctiveLevel.Unknown,
      occlusionLv: OcclusionLevel.Unknown,
    },
    computedData: {},
    settings: { disabled: false, hidden: false },
  };

export function createLabelSelectionDescriptorsPaneElementFactory(): PaneElementFactory<LabelSelectionDescriptorsPaneElementParams> {
  const controls = paneControls<LabelSelectionDescriptorsPaneElementParams>();
  return definePaneElements(
    labelSelectionDescriptorsPaneFactoryParams,
    [],
    controls.sequential([
      controls.list(["inputtedData", "distinctiveLv"], {
        options: ({ settings: { disabled, hidden } }) => ({
          label: "Distinctiveness Level",
          options: Object.values(DistinctiveLevel).map((v) => ({
            text: v.name,
            value: v,
          })),
          disabled,
          hidden,
        }),
      }),
      controls.list(["inputtedData", "occlusionLv"], {
        options: ({ settings: { disabled, hidden } }) => ({
          label: "Occlusion Level",
          options: Object.values(OcclusionLevel).map((v) => ({
            text: v.name,
            value: v,
          })),
          disabled,
          hidden,
        }),
      }),
    ]),
  );
}

export const labelSelectionDescriptorsPaneDataProcessor: PaneControllerDataProcessor<LabelSelectionDescriptorsPaneControllerParams> =
  {
    computeData: (_inputtedData, _internalData) => ({}),
    outputData: getLabelSelectionDescriptorsOutputData,
  };
