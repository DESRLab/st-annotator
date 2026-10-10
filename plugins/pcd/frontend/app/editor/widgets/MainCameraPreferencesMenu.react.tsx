import { default as React } from "react";

import { PreferencesMenuView, useEditorIntents } from "sta/app/editor";

import type { PointCloudPluginIntents } from "../scene/layer/PointCloudSlice";
import { usePcdSelector } from "../scene/layer/PointCloudSlice.react.ts";
import { MainCameraSettingsPaneView } from "../scene/widgets/MainCameraSettingsPane.react.tsx";
import type { MainCameraSettingsPaneControllerParams } from "../scene/widgets/MainCameraSettingsPane.react.tsx";

/**
 * Selects the main camera state from the editor state snapshot and writes
 * it back through the pcd intents.
 */
export function MainCameraSettingsView(): React.JSX.Element {
  const camera = usePcdSelector((slice) => slice.camera);
  const intents = useEditorIntents<PointCloudPluginIntents>();

  const paneParams = React.useMemo(
    (): Pick<
      MainCameraSettingsPaneControllerParams,
      "inputtedData" | "settings"
    > => ({
      inputtedData: {
        viewMode: camera.viewMode,
        orbitPoint: camera.orbitPoint,
      },
      settings: { disabled: false, hidden: false },
    }),
    [camera],
  );
  const applyInputChange = React.useCallback(
    (change: MainCameraSettingsPaneControllerParams["inputtedData"]): void =>
      intents.pcd.setCameraSettings(change),
    [intents],
  );

  return (
    <MainCameraSettingsPaneView
      onInputChange={applyInputChange}
      paneParams={paneParams}
    />
  );
}

/**
 * The composed preferences menu: the main camera settings tab plus the
 * generated per-layer tab rendered by {@link PreferencesMenuView}.
 */
export function MainCameraPreferencesMenuView(): React.JSX.Element {
  return (
    <PreferencesMenuView
      globalSettingsTabs={{
        "Main Camera": <MainCameraSettingsView />,
      }}
    />
  );
}
