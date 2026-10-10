import { default as React } from "react";

import { definePane, TweakpanePaneHost } from "sta/app/editor";

import {
  drawModePaneDataProcessor,
  createDrawModePaneElementFactory,
} from "./DrawModePane.ts";
import type { DrawModePaneControllerParams } from "./DrawModePane.ts";

export * from "./DrawModePane.ts";

const drawModePaneDefinition = definePane({
  dataProcessor: drawModePaneDataProcessor,
  factory: createDrawModePaneElementFactory(),
});

interface DrawModePaneViewProps {
  paneParams: Pick<DrawModePaneControllerParams, "inputtedData" | "settings"> &
    Partial<Pick<DrawModePaneControllerParams, "internalData">>;
  onInputChange: (change: DrawModePaneControllerParams["inputtedData"]) => void;
}

export function DrawModePaneView({
  paneParams,
  onInputChange,
}: DrawModePaneViewProps): React.JSX.Element {
  return (
    <TweakpanePaneHost
      definition={drawModePaneDefinition}
      mapOutputChange={({ inputtedData }) => inputtedData}
      onInputChange={onInputChange}
      paneParams={paneParams}
    />
  );
}
