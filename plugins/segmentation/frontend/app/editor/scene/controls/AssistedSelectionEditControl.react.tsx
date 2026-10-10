import { default as React } from "react";

import { usePaneState } from "sta/app/editor";

import { PromptModePaneView } from "../widgets/PromptModePane.react.tsx";
import type { PromptModePaneControllerParams } from "../widgets/PromptModePane.react.tsx";

import type { AssistedSelectionEditControl } from "./AssistedSelectionEditControl.tsx";

export function AssistedSelectionEditControlView({
  assistedSelectionController,
}: {
  assistedSelectionController: AssistedSelectionEditControl;
}): React.JSX.Element {
  const paneState = usePaneState({
    eventType: "change",
    getPaneParams: (): Pick<
      PromptModePaneControllerParams,
      "inputtedData" | "computedData" | "settings"
    > => assistedSelectionController.promptModePaneParams,
    inputChangePolicy: "reread",
    onInputChange: assistedSelectionController.onPromptModeInputChange,
    source: assistedSelectionController,
  });

  return (
    <PromptModePaneView
      onInputChange={(change) =>
        paneState.onInputChange({
          ...paneState.paneParams.inputtedData,
          ...change,
        })
      }
      paneParams={{ ...paneState.paneParams, computedData: {} }}
    />
  );
}
