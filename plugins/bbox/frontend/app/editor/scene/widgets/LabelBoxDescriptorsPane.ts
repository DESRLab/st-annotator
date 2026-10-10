import { cloneDeep } from "lodash";

import { definePaneElements, paneControls } from "sta/app/editor";
import type {
  PaneControllerDataProcessor,
  PaneElementFactory,
  PaneElementParams,
  InspectorPaneRenderTrigger,
} from "sta/app/editor";

import { DistinctiveLevel, OcclusionLevel } from "../../../../models";
import type { BBoxIndexEventMap } from "../data";

export interface LabelBoxDescriptorsInputtedData {
  distinctiveLv: DistinctiveLevel;
  occlusionLv: OcclusionLevel;
}

interface LabelBoxDescriptorsPaneSettings {
  disabled: boolean;
  hidden: boolean;
}

interface LabelBoxDescriptors {
  distinctiveLv: DistinctiveLevel;
  occlusionLv: OcclusionLevel;
}

export interface LabelBoxDescriptorsPaneControllerParams {
  inputtedData: LabelBoxDescriptorsInputtedData;
  computedData: {};
  settings: LabelBoxDescriptorsPaneSettings;
  internalData: {};
  outputData: LabelBoxDescriptors;
}

type LabelBoxDescriptorsPaneElementParams =
  PaneElementParams<LabelBoxDescriptorsPaneControllerParams>;

export const renderTriggers: InspectorPaneRenderTrigger<BBoxIndexEventMap> = {
  // Display text is changed
  "box-update": (e) =>
    e.propertyKey === "distinctiveLv" || e.propertyKey === "occlusionLv",
};

export function getLabelBoxDescriptorsOutputData(
  paneParams: Readonly<LabelBoxDescriptorsPaneElementParams>,
) {
  const {
    inputtedData: { distinctiveLv, occlusionLv },
  } = paneParams;

  return {
    distinctiveLv: cloneDeep(distinctiveLv),
    occlusionLv: cloneDeep(occlusionLv),
  };
}

export const labelBoxDescriptorsPaneFactoryParams: LabelBoxDescriptorsPaneElementParams =
  {
    inputtedData: {
      distinctiveLv: DistinctiveLevel.Unknown,
      occlusionLv: OcclusionLevel.Unknown,
    },
    computedData: {},
    settings: { disabled: false, hidden: false },
  };

export function createLabelBoxDescriptorsPaneElementFactory(): PaneElementFactory<LabelBoxDescriptorsPaneElementParams> {
  const controls = paneControls<LabelBoxDescriptorsPaneElementParams>();
  return definePaneElements(
    labelBoxDescriptorsPaneFactoryParams,
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

export const labelBoxDescriptorsPaneDataProcessor: PaneControllerDataProcessor<LabelBoxDescriptorsPaneControllerParams> =
  {
    computeData: (
      _inputtedData: LabelBoxDescriptorsPaneControllerParams["inputtedData"],
      _internalData: LabelBoxDescriptorsPaneControllerParams["internalData"],
    ) => ({}),
    outputData: getLabelBoxDescriptorsOutputData,
  };
