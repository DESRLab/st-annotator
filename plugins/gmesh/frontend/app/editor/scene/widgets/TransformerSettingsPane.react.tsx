import { default as React } from "react";

import { definePane, TweakpanePaneHost } from "sta/app/editor";

import {
  transformerSettingsPaneDataProcessor,
  createTransformerSettingsPaneElementFactory,
} from "./TransformerSettingsPane.ts";
import type { TransformerSettingsPaneControllerParams } from "./TransformerSettingsPane.ts";

export * from "./TransformerSettingsPane.ts";

const transformerSettingsPaneDefinition = definePane({
  dataProcessor: transformerSettingsPaneDataProcessor,
  factory: createTransformerSettingsPaneElementFactory(),
});

interface TransformerSettingsPaneViewProps {
  paneParams: Pick<
    TransformerSettingsPaneControllerParams,
    "inputtedData" | "settings"
  > &
    Partial<Pick<TransformerSettingsPaneControllerParams, "internalData">>;
  onInputChange: (
    change: TransformerSettingsPaneControllerParams["inputtedData"],
  ) => void;
}

export function TransformerSettingsPaneView({
  paneParams,
  onInputChange,
}: TransformerSettingsPaneViewProps): React.JSX.Element {
  return (
    <TweakpanePaneHost
      definition={transformerSettingsPaneDefinition}
      mapOutputChange={({ inputtedData }) => inputtedData}
      onInputChange={onInputChange}
      paneParams={paneParams}
    />
  );
}
