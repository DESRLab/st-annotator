import { default as React } from "react";

import { definePane, TweakpanePaneHost } from "sta/app/editor";

import {
  groundMeshSettingsPaneDataProcessor,
  createGroundMeshSettingsPaneElementFactory,
} from "./GroundMeshSettingsPane.ts";
import type { GroundMeshSettingsPaneControllerParams } from "./GroundMeshSettingsPane.ts";

export * from "./GroundMeshSettingsPane.ts";

const groundMeshSettingsPaneDefinition = definePane({
  dataProcessor: groundMeshSettingsPaneDataProcessor,
  factory: createGroundMeshSettingsPaneElementFactory(),
});

interface GroundMeshSettingsPaneViewProps {
  paneParams: Pick<
    GroundMeshSettingsPaneControllerParams,
    "inputtedData" | "settings"
  > &
    Partial<Pick<GroundMeshSettingsPaneControllerParams, "internalData">>;
  onInputChange: (
    change: GroundMeshSettingsPaneControllerParams["inputtedData"],
  ) => void;
}

export function GroundMeshSettingsPaneView({
  paneParams,
  onInputChange,
}: GroundMeshSettingsPaneViewProps): React.JSX.Element {
  return (
    <TweakpanePaneHost
      definition={groundMeshSettingsPaneDefinition}
      mapOutputChange={({ inputtedData }) => inputtedData}
      onInputChange={onInputChange}
      paneParams={paneParams}
    />
  );
}
