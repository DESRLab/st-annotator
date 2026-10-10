import { default as React } from "react";

import { definePane, TweakpanePaneHost } from "sta/app/editor";

import {
  bboxSettingsPaneDataProcessor,
  createBBoxSettingsPaneElementFactory,
} from "./BBoxSettingsPane.ts";
import type { BBoxSettingsPaneControllerParams } from "./BBoxSettingsPane.ts";

export * from "./BBoxSettingsPane.ts";

const bboxSettingsPaneDefinition = definePane({
  dataProcessor: bboxSettingsPaneDataProcessor,
  factory: createBBoxSettingsPaneElementFactory(),
});

interface BBoxSettingsPaneViewProps {
  paneParams: Pick<
    BBoxSettingsPaneControllerParams,
    "inputtedData" | "settings"
  > &
    Partial<Pick<BBoxSettingsPaneControllerParams, "internalData">>;
  onInputChange: (
    change: BBoxSettingsPaneControllerParams["inputtedData"],
  ) => void;
}

export function BBoxSettingsPaneView({
  paneParams,
  onInputChange,
}: BBoxSettingsPaneViewProps): React.JSX.Element {
  return (
    <TweakpanePaneHost
      definition={bboxSettingsPaneDefinition}
      mapOutputChange={({ inputtedData }) => inputtedData}
      onInputChange={onInputChange}
      paneParams={paneParams}
    />
  );
}
