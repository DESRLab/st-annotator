import { default as React } from "react";

import { usePaneState } from "sta/app/editor";
import type { PaneStateSource } from "sta/app/editor";

import type { TransformerSettingsPaneControllerParams } from "../widgets";
import { TransformerSettingsPaneView } from "../widgets/TransformerSettingsPane.react.tsx";

/** The pane-facing surface of a source that owns vector transformer settings. */
export interface VectorTransformerSettingsPaneSource extends PaneStateSource {
  settingsPaneParams: Pick<
    TransformerSettingsPaneControllerParams,
    "inputtedData" | "settings"
  >;
  onSettingsInputChange(
    inputtedData: TransformerSettingsPaneControllerParams["inputtedData"],
  ): void;
}

export function VectorTransformerSettingsView({
  transformer,
}: {
  transformer: VectorTransformerSettingsPaneSource;
}): React.JSX.Element {
  const paneState = usePaneState({
    eventType: "settings-change",
    getPaneParams: (): Pick<
      TransformerSettingsPaneControllerParams,
      "inputtedData" | "settings"
    > => transformer.settingsPaneParams,
    inputChangePolicy: "optimistic",
    onInputChange: (inputtedData): void =>
      transformer.onSettingsInputChange(inputtedData),
    source: transformer,
  });
  return (
    <TransformerSettingsPaneView
      onInputChange={(inputtedData) => paneState.onInputChange(inputtedData)}
      paneParams={paneState.paneParams}
    />
  );
}
