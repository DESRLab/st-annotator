import { definePaneElements, paneControls } from "sta/app/editor";
import type {
  PaneControllerDataProcessor,
  PaneElementFactory,
  PaneElementParams,
  InspectorPaneRenderTrigger,
} from "sta/app/editor";

import type { SegmentationIndexEventMap } from "../data";

export interface LabelInstanceDescriptorsInputtedData {
  isBlack: boolean;
}

interface LabelInstanceDescriptorsPaneSettings {
  disabled: boolean;
  hidden: boolean;
}

interface LabelInstanceDescriptors {
  isBlack: boolean;
}

export interface LabelInstanceDescriptorsPaneControllerParams {
  inputtedData: LabelInstanceDescriptorsInputtedData;
  computedData: {};
  settings: LabelInstanceDescriptorsPaneSettings;
  internalData: {};
  outputData: LabelInstanceDescriptors;
}

type LabelInstanceDescriptorsPaneElementParams =
  PaneElementParams<LabelInstanceDescriptorsPaneControllerParams>;

export const renderTriggers: InspectorPaneRenderTrigger<SegmentationIndexEventMap> =
  {
    // Display text is changed
    "instance-update": (e) => e.propertyKey === "isBlack",
  };

export function getLabelInstanceDescriptorsOutputData(
  paneParams: Readonly<LabelInstanceDescriptorsPaneElementParams>,
): LabelInstanceDescriptors {
  const {
    inputtedData: { isBlack },
  } = paneParams;

  return { isBlack };
}

export const labelInstanceDescriptorsPaneFactoryParams: LabelInstanceDescriptorsPaneElementParams =
  {
    inputtedData: { isBlack: false },
    computedData: {},
    settings: { disabled: false, hidden: false },
  };

export function createLabelInstanceDescriptorsPaneElementFactory(): PaneElementFactory<LabelInstanceDescriptorsPaneElementParams> {
  const controls = paneControls<LabelInstanceDescriptorsPaneElementParams>();
  return definePaneElements(
    labelInstanceDescriptorsPaneFactoryParams,
    [],
    controls.sequential([
      controls.input(["inputtedData", "isBlack"], {
        options: ({ settings: { disabled, hidden } }) => ({
          label: "Low Reflectivity",
          disabled,
          hidden,
        }),
      }),
    ]),
  );
}

export const labelInstanceDescriptorsPaneDataProcessor: PaneControllerDataProcessor<LabelInstanceDescriptorsPaneControllerParams> =
  {
    computeData: (_inputtedData, _internalData) => ({}),
    outputData: getLabelInstanceDescriptorsOutputData,
  };
