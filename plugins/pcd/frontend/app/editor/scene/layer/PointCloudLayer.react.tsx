import { default as React } from "react";

import { useEditorIntents, useOptimisticPaneParams } from "sta/app/editor";

import { PointCloudSettingsPaneView } from "../widgets/PointCloudSettingsPane.react.tsx";
import type { PointCloudSettingsPaneControllerParams } from "../widgets/PointCloudSettingsPane.react.tsx";

import type { PointCloudPluginIntents } from "./PointCloudSlice";
import { usePcdSelector } from "./PointCloudSlice.react.ts";

/**
 * Selects the committed layer settings from the editor state snapshot and
 * writes new values back through the pcd intents, keeping an optimistic
 * local draft over the committed params.
 */
export function PointCloudPreferencesView(): React.JSX.Element {
  const settings = usePcdSelector((slice) => slice.settings);
  const intents = useEditorIntents<PointCloudPluginIntents>();

  const committedParams = React.useMemo(
    (): Pick<
      PointCloudSettingsPaneControllerParams,
      "inputtedData" | "internalData" | "settings"
    > => ({
      inputtedData: settings.values,
      internalData: settings.target,
      settings: { disabled: settings.disabled, hidden: false },
    }),
    [settings],
  );
  const applyInputChange = React.useCallback(
    (values: PointCloudSettingsPaneControllerParams["inputtedData"]): void =>
      intents.pcd.setSettings(values),
    [intents],
  );

  const paneState = useOptimisticPaneParams({
    committedParams,
    onInputChange: applyInputChange,
  });
  return (
    <PointCloudSettingsPaneView
      onInputChange={(change) => paneState.onInputChange(change)}
      paneParams={paneState.paneParams}
    />
  );
}
