import { default as React } from "react";

import { definePane, TweakpanePaneHost } from "sta/app/editor";

import {
  editModePaneDataProcessor,
  createEditModePaneElementFactory,
} from "./EditModePane.ts";
import type { EditModePaneControllerParams } from "./EditModePane.ts";

export * from "./EditModePane.ts";

const editModePaneDefinition = definePane({
  dataProcessor: editModePaneDataProcessor,
  factory: createEditModePaneElementFactory(),
});

interface EditModePaneViewProps {
  paneParams: Pick<
    EditModePaneControllerParams,
    "inputtedData" | "computedData" | "settings"
  > &
    Partial<Pick<EditModePaneControllerParams, "internalData">>;
  onInputChange: (change: EditModePaneControllerParams["inputtedData"]) => void;
}

export function EditModePaneView({
  paneParams,
  onInputChange,
}: EditModePaneViewProps): React.JSX.Element {
  return (
    <TweakpanePaneHost
      definition={editModePaneDefinition}
      mapOutputChange={({ inputtedData }) => inputtedData}
      onInputChange={onInputChange}
      paneParams={paneParams}
    />
  );
}
