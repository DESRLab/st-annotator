import { default as React } from "react";

import { definePane, TweakpanePaneHost } from "sta/app/editor";

import {
  segmentationSettingsPaneDataProcessor,
  createSegmentationSettingsPaneElementFactory,
} from "./SegmentationSettingsPane.ts";
import type { SegmentationSettingsPaneControllerParams } from "./SegmentationSettingsPane.ts";

export * from "./SegmentationSettingsPane.ts";

const segmentationSettingsPaneDefinition = definePane({
  dataProcessor: segmentationSettingsPaneDataProcessor,
  factory: createSegmentationSettingsPaneElementFactory(),
});

interface SegmentationSettingsPaneViewProps {
  paneParams: Pick<
    SegmentationSettingsPaneControllerParams,
    "inputtedData" | "settings"
  > &
    Partial<Pick<SegmentationSettingsPaneControllerParams, "internalData">>;
  onInputChange: (
    change: SegmentationSettingsPaneControllerParams["inputtedData"],
  ) => void;
}

export function SegmentationSettingsPaneView({
  paneParams,
  onInputChange,
}: SegmentationSettingsPaneViewProps): React.JSX.Element {
  return (
    <TweakpanePaneHost
      definition={segmentationSettingsPaneDefinition}
      mapOutputChange={({ inputtedData }) => inputtedData}
      onInputChange={onInputChange}
      paneParams={paneParams}
    />
  );
}
