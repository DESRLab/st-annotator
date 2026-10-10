import { default as React } from "react";

import { definePane, TweakpanePaneHost } from "sta/app/editor";

import {
  promptModePaneDataProcessor,
  createPromptModePaneElementFactory,
} from "./PromptModePane.ts";
import type { PromptModePaneControllerParams } from "./PromptModePane.ts";

export * from "./PromptModePane.ts";

const promptModePaneDefinition = definePane({
  dataProcessor: promptModePaneDataProcessor,
  factory: createPromptModePaneElementFactory(),
});

interface PromptModePaneViewProps {
  paneParams: Pick<
    PromptModePaneControllerParams,
    "inputtedData" | "computedData" | "settings"
  > &
    Partial<Pick<PromptModePaneControllerParams, "internalData">>;
  onInputChange: (
    change: PromptModePaneControllerParams["inputtedData"],
  ) => void;
}

export function PromptModePaneView({
  paneParams,
  onInputChange,
}: PromptModePaneViewProps): React.JSX.Element {
  return (
    <TweakpanePaneHost
      definition={promptModePaneDefinition}
      mapOutputChange={({ inputtedData }) => inputtedData}
      onInputChange={onInputChange}
      paneParams={paneParams}
    />
  );
}
