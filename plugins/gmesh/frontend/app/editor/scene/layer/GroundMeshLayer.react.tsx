import { default as React } from "react";

import { useEditorIntents, useOptimisticPaneParams } from "sta/app/editor";

import { GroundMeshSettingsPaneView } from "../widgets/GroundMeshSettingsPane.react.tsx";
import type { GroundMeshSettingsPaneControllerParams } from "../widgets/GroundMeshSettingsPane.react.tsx";

import type { GroundMeshPluginIntents } from "./GroundMeshSlice";
import { useGmeshSelector } from "./GroundMeshSlice.react.ts";

/**
 * Selects the committed layer settings from the editor state snapshot and
 * writes new values back through the gmesh intents, keeping an optimistic
 * local draft over the committed params.
 */
export function GroundMeshPreferencesView(): React.JSX.Element {
  const settings = useGmeshSelector((slice) => slice.settings);
  const intents = useEditorIntents<GroundMeshPluginIntents>();

  const committedParams = React.useMemo(
    (): Pick<
      GroundMeshSettingsPaneControllerParams,
      "inputtedData" | "internalData" | "settings"
    > => ({
      inputtedData: settings.values,
      internalData: settings.target,
      settings: { disabled: settings.disabled, hidden: false },
    }),
    [settings],
  );
  const applyInputChange = React.useCallback(
    (values: GroundMeshSettingsPaneControllerParams["inputtedData"]): void =>
      intents.gmesh.setSettings(values),
    [intents],
  );

  const paneState = useOptimisticPaneParams({
    committedParams,
    onInputChange: applyInputChange,
  });
  return (
    <GroundMeshSettingsPaneView
      onInputChange={paneState.onInputChange.bind(paneState)}
      paneParams={paneState.paneParams}
    />
  );
}
