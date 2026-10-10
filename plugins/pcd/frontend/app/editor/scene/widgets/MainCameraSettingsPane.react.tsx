import { default as React } from "react";

import { definePane, TweakpanePaneHost } from "sta/app/editor";

import {
  mainCameraSettingsPaneDataProcessor,
  createMainCameraSettingsPaneElementFactory,
} from "./MainCameraSettingsPane.ts";
import type { MainCameraSettingsPaneControllerParams } from "./MainCameraSettingsPane.ts";

export * from "./MainCameraSettingsPane.ts";

const mainCameraSettingsPaneDefinition = definePane({
  dataProcessor: mainCameraSettingsPaneDataProcessor,
  factory: createMainCameraSettingsPaneElementFactory(),
});

interface MainCameraSettingsPaneViewProps {
  paneParams: Pick<
    MainCameraSettingsPaneControllerParams,
    "inputtedData" | "settings"
  > &
    Partial<Pick<MainCameraSettingsPaneControllerParams, "internalData">>;
  onInputChange: (
    change: MainCameraSettingsPaneControllerParams["inputtedData"],
  ) => void;
}

export function MainCameraSettingsPaneView({
  paneParams,
  onInputChange,
}: MainCameraSettingsPaneViewProps): React.JSX.Element {
  return (
    <TweakpanePaneHost
      definition={mainCameraSettingsPaneDefinition}
      mapOutputChange={({ inputtedData }) => inputtedData}
      onInputChange={onInputChange}
      paneParams={paneParams}
    />
  );
}
