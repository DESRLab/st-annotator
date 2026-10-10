import { default as React } from "react";

import { usePaneState } from "sta/app/editor";
import type { PaneStateSource } from "sta/app/editor";

import { TransformerSettingsPaneView } from "../widgets/TransformerSettingsPane.react.tsx";
import type { TransformerSettingsPaneControllerParams } from "../widgets/index.ts";

/** The pane-facing surface of a source that owns transformer settings. */
export interface TransformerSettingsPaneSource extends PaneStateSource {
  settingsPaneParams: Pick<
    TransformerSettingsPaneControllerParams,
    "inputtedData" | "settings"
  >;
  onSettingsInputChange(
    inputtedData: TransformerSettingsPaneControllerParams["inputtedData"],
  ): void;
}

export function TransformerSettingsView({
  transformer,
}: {
  transformer: TransformerSettingsPaneSource;
}): React.JSX.Element {
  const paneState = usePaneState({
    eventType: "settings-change",
    getPaneParams: (): Pick<
      TransformerSettingsPaneControllerParams,
      "inputtedData" | "settings"
    > => transformer.settingsPaneParams,
    inputChangePolicy: "optimistic",
    onInputChange: transformer.onSettingsInputChange.bind(transformer),
    source: transformer,
  });
  return (
    <TransformerSettingsPaneView
      onInputChange={paneState.onInputChange.bind(paneState)}
      paneParams={paneState.paneParams}
    />
  );
}
