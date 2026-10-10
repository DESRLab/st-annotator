import { default as React } from "react";

import { definePane, TweakpanePaneHost } from "sta/app/editor";

import {
  vectorSettingsPaneDataProcessor,
  createVectorSettingsPaneElementFactory,
} from "./VectorSettingsPane.ts";
import type { VectorSettingsPaneControllerParams } from "./VectorSettingsPane.ts";

export * from "./VectorSettingsPane.ts";

const vectorSettingsPaneDefinition = definePane({
  dataProcessor: vectorSettingsPaneDataProcessor,
  factory: createVectorSettingsPaneElementFactory(),
});

interface VectorSettingsPaneViewProps {
  paneParams: Pick<
    VectorSettingsPaneControllerParams,
    "inputtedData" | "settings"
  > &
    Partial<Pick<VectorSettingsPaneControllerParams, "internalData">>;
  onInputChange: (
    change: VectorSettingsPaneControllerParams["inputtedData"],
  ) => void;
}

export function VectorSettingsPaneView({
  paneParams,
  onInputChange,
}: VectorSettingsPaneViewProps): React.JSX.Element {
  return (
    <TweakpanePaneHost
      definition={vectorSettingsPaneDefinition}
      mapOutputChange={({ inputtedData }) => inputtedData}
      onInputChange={onInputChange}
      paneParams={paneParams}
    />
  );
}
