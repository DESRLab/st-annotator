import { default as React } from "react";

import { definePane, TweakpanePaneHost } from "sta/app/editor";

import {
  pointCloudSettingsPaneDataProcessor,
  createPointCloudSettingsPaneElementFactory,
} from "./PointCloudSettingsPane.ts";
import type { PointCloudSettingsPaneControllerParams } from "./PointCloudSettingsPane.ts";

export * from "./PointCloudSettingsPane.ts";

const pointCloudSettingsPaneDefinition = definePane({
  dataProcessor: pointCloudSettingsPaneDataProcessor,
  factory: createPointCloudSettingsPaneElementFactory(),
});

interface PointCloudSettingsPaneViewProps {
  paneParams: Pick<
    PointCloudSettingsPaneControllerParams,
    "inputtedData" | "settings"
  > &
    Partial<Pick<PointCloudSettingsPaneControllerParams, "internalData">>;
  onInputChange: (
    change: PointCloudSettingsPaneControllerParams["inputtedData"],
  ) => void;
}

export function PointCloudSettingsPaneView({
  paneParams,
  onInputChange,
}: PointCloudSettingsPaneViewProps): React.JSX.Element {
  return (
    <TweakpanePaneHost
      definition={pointCloudSettingsPaneDefinition}
      mapOutputChange={({ inputtedData }) => inputtedData}
      onInputChange={onInputChange}
      paneParams={paneParams}
    />
  );
}
