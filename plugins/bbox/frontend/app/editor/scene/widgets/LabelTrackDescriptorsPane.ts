import { definePaneElements, paneControls } from "sta/app/editor";
import type {
  PaneControllerDataProcessor,
  PaneElementFactory,
  PaneElementParams,
  InspectorPaneRenderTrigger,
} from "sta/app/editor";

import type { BBoxIndexEventMap } from "../data";

export interface LabelTrackDescriptorsInputtedData {
  isBlack: boolean;
}

interface LabelTrackDescriptorsPaneSettings {
  disabled: boolean;
  hidden: boolean;
}

interface LabelTrackDescriptors {
  isBlack: boolean;
}

export interface LabelTrackDescriptorsPaneControllerParams {
  inputtedData: LabelTrackDescriptorsInputtedData;
  computedData: {};
  settings: LabelTrackDescriptorsPaneSettings;
  internalData: {};
  outputData: LabelTrackDescriptors;
}

type LabelTrackDescriptorsPaneElementParams =
  PaneElementParams<LabelTrackDescriptorsPaneControllerParams>;

export const renderTriggers: InspectorPaneRenderTrigger<BBoxIndexEventMap> = {
  // Display text is changed
  "track-update": (e) => e.propertyKey === "isBlack",
};

export function getLabelTrackDescriptorsOutputData(
  paneParams: Readonly<LabelTrackDescriptorsPaneElementParams>,
) {
  const {
    inputtedData: { isBlack },
  } = paneParams;

  return { isBlack };
}

export const labelTrackDescriptorsPaneFactoryParams: LabelTrackDescriptorsPaneElementParams =
  {
    inputtedData: { isBlack: false },
    computedData: {},
    settings: { disabled: false, hidden: false },
  };

export function createLabelTrackDescriptorsPaneElementFactory(): PaneElementFactory<LabelTrackDescriptorsPaneElementParams> {
  const controls = paneControls<LabelTrackDescriptorsPaneElementParams>();
  return definePaneElements(
    labelTrackDescriptorsPaneFactoryParams,
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

export const labelTrackDescriptorsPaneDataProcessor: PaneControllerDataProcessor<LabelTrackDescriptorsPaneControllerParams> =
  {
    computeData: (
      _inputtedData: LabelTrackDescriptorsPaneControllerParams["inputtedData"],
      _internalData: LabelTrackDescriptorsPaneControllerParams["internalData"],
    ) => ({}),
    outputData: getLabelTrackDescriptorsOutputData,
  };
