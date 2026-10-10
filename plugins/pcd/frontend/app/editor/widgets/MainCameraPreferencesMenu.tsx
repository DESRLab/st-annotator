import { default as React } from "react";

import {
  ComposableKeybindHandler,
  viewModePaneGridViewModes,
} from "sta/app/editor";
import type { LayerCollection, WindowMapper, MainWindow } from "sta/app/editor";

import type { PointCloudLayer } from "../scene";
import { mainCameraSettingsPaneFactoryParams } from "../scene/widgets/MainCameraSettingsPane.react.tsx";
import type { MainCameraSettingsPaneControllerParams } from "../scene/widgets/MainCameraSettingsPane.react.tsx";

import { MainCameraPreferencesMenuView } from "./MainCameraPreferencesMenu.react.tsx";

/**
 * Applies and keybinds the main camera settings (view mode / orbit point).
 *
 * The committed settings state lives on the main window itself (`viewMode`
 * plus the orbit-target override); the menu reads it from there instead of
 * keeping a second copy, and the editor state snapshot mirrors it through
 * the point cloud slice.
 */
export class MainCameraPreferencesMenu<WM extends WindowMapper = WindowMapper> {
  mainWindow: MainWindow;
  layers: LayerCollection<WM>;
  pcdLayer: PointCloudLayer<WM>;
  readonly keydownHandler = new ComposableKeybindHandler();
  readonly keyupHandler = new ComposableKeybindHandler();

  KEYDOWN_BINDS = [
    {
      keyCombo: "x",
      name: "Cycle view mode",
      handler: () => {
        const viewModes = viewModePaneGridViewModes;
        const currentIdx = viewModes.indexOf(this.mainWindow.viewMode);
        this.updateMainCameraSettings({
          viewMode: viewModes[(currentIdx + 1) % viewModes.length],
        });
      },
    },
    {
      keyCombo: "o",
      name: "Toggle orbit point",
      handler: () => {
        this.updateMainCameraSettings({
          orbitPoint: this.mainWindow.overrideOrbitTarget == null,
        });
      },
    },
  ];

  constructor(
    layers: LayerCollection<WM>,
    mainWindow: MainWindow,
    pcdLayer: PointCloudLayer<WM>,
  ) {
    for (const keybind of this.KEYDOWN_BINDS) {
      this.keydownHandler.register(keybind);
    }

    this.layers = layers;
    this.mainWindow = mainWindow;
    this.pcdLayer = pcdLayer;

    this.updateMainCameraSettings(
      mainCameraSettingsPaneFactoryParams.inputtedData,
    );
  }

  /** Whether the orbit point setting is currently applied. */
  get #orbitPoint(): boolean {
    return this.mainWindow.overrideOrbitTarget != null;
  }

  updateMainCameraSettings = (
    change: Partial<MainCameraSettingsPaneControllerParams["inputtedData"]>,
  ): void => {
    const viewMode = change.viewMode ?? this.mainWindow.viewMode;
    const orbitPoint = change.orbitPoint ?? this.#orbitPoint;
    if (
      viewMode === this.mainWindow.viewMode &&
      orbitPoint === this.#orbitPoint
    )
      return;

    this.mainWindow.viewMode = viewMode;
    this.mainWindow.overrideOrbitTarget = orbitPoint
      ? this.pcdLayer.overrideOrbitTarget
      : null;
  };

  renderView(): React.JSX.Element {
    return <MainCameraPreferencesMenuView />;
  }

  dispose(): void {
    this.keydownHandler.dispose();
    this.keyupHandler.dispose();
  }
}
