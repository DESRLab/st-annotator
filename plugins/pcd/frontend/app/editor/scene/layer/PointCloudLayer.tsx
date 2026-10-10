import { default as React } from "react";
import { PolarGridHelper, Raycaster, Vector2 } from "three";
import type { Camera, Vector3 } from "three";

import { SourceDataLayer } from "sta/app/editor";
import type {
  EditorRuntime,
  EditorSliceContributor,
  PaneElementParams,
  SceneContext,
  WindowMapper,
  MainWindow,
} from "sta/app/editor";
import { ThreeUtils } from "sta/common";

import { getSettings } from "../../config";
import type { MainCameraPreferencesMenu } from "../../widgets";
import { PointCloudView } from "../data";
import type { PointCloud } from "../data";
import {
  pointCloudSettingsPaneDataProcessor,
  pointCloudSettingsPaneFactoryParams,
} from "../widgets/PointCloudSettingsPane.react.tsx";
import type { PointCloudSettingsPaneControllerParams } from "../widgets/PointCloudSettingsPane.react.tsx";

import { PointCloudPreferencesView } from "./PointCloudLayer.react.tsx";
import { mapPointCloudSlice } from "./PointCloudSlice";
import type {
  PointCloudPluginIntents,
  PointCloudSlice,
} from "./PointCloudSlice";

/** Facilitates user interaction with the point cloud for the current frame. */
export class PointCloudLayer<WM extends WindowMapper>
  extends SourceDataLayer<WM, PointCloud | null>
  implements EditorSliceContributor<PointCloudSlice>
{
  /** Whether the Three.js objects or their display settings need refreshing. */
  #sceneDirty = true;

  /**
   * The preferences menu contributed by this plugin's editor integration,
   * the write path of the camera intents. Assigned after all layers are
   * constructed, since the menu keybinds the whole layer collection.
   */
  mainCameraMenu: MainCameraPreferencesMenu<WM> | null = null;

  onBeforeUpdateData() {
    // A new load invalidates the published data (the view nulls it right
    // after dispatching beforeload), so the settings target must not keep
    // exposing the previous buffer while the new load is in flight.
    this.#settingsInternalData = null;
    this.#settingsPaneSettings = {
      ...this.#settingsPaneSettings,
      disabled: true,
    };
    this.#sceneDirty = true;
    this.#notifySettingsChange();
  }

  onAfterUpdateData() {
    const { data } = this.dataView;

    // Expose only the plain color blender target to the settings pane,
    // never the model that owns the `three.js` objects.
    this.#settingsInternalData =
      data == null
        ? null
        : { buffer: data.buffer, channelNames: data.channelNames };
    this.#settingsPaneSettings = { disabled: data == null, hidden: false };
    this.#sceneDirty = true;
    this.#notifySettingsChange();
  }

  /** A function that can be set as {@link MainWindow#overrideOrbitTarget}. */
  overrideOrbitTarget = (defaultTarget: Vector3, camera: Camera) => {
    // Update the target of the controls to be approximately the point at the
    // center of the screen without changing the orientation of the camera
    const { data } = this.dataView;
    if (data == null) return defaultTarget;

    const raycaster = new Raycaster();
    raycaster.setFromCamera(new Vector2(0, 0), camera);

    // Allow the raycaster to work at different zoom levels
    for (const threshold of [0.025, 0.25, 2.5]) {
      ThreeUtils.setRaycasterPointsThreshold(raycaster, threshold);

      const intersects = data.raycast(raycaster);
      if (intersects.length > 0) {
        const distance = intersects[0].distance;

        const v = defaultTarget.clone().sub(camera.position).normalize();
        return camera.position.clone().add(v.multiplyScalar(distance));
      }
    }

    return defaultTarget;
  };

  /** A view of the data to display in this layer. */
  readonly #dataView: PointCloudView;

  /** Visualizes the distance from the origin of the frame. */
  readonly #gridHelper = new PolarGridHelper(250, 1, 5, 128);

  /** Specifies the settings to apply to the point cloud. */
  #settingsInputtedData: PointCloudSettingsPaneControllerParams["inputtedData"];

  #settingsInternalData: PointCloudSettingsPaneControllerParams["internalData"];

  #settingsPaneSettings: PointCloudSettingsPaneControllerParams["settings"];

  /** Cached output of {@link settingsOutput}, valid until one of its inputs is replaced. */
  #settingsOutputCache?: {
    inputtedData: PointCloudSettingsPaneControllerParams["inputtedData"];
    internalData: PointCloudSettingsPaneControllerParams["internalData"];
    settings: PointCloudSettingsPaneControllerParams["settings"];
    output: PointCloudSettingsPaneControllerParams["outputData"];
  };

  readonly PREFS_KEYDOWN_BINDS = [
    {
      keyCombo: "j",
      name: "Toggle RemoveBG",
      handler: () => {
        this.#toggleSetting("removeBackground");
      },
    },
    {
      keyCombo: "k",
      name: "Toggle CropArea",
      handler: () => {
        this.#toggleSetting("cropArea");
      },
    },
  ];

  /** Handles the event when the settings in the input have been updated. */
  #onSettingsChange = (
    inputtedData: PointCloudSettingsPaneControllerParams["inputtedData"],
  ): void => {
    this.#settingsInputtedData = inputtedData;
    // Tweakpane may update nested settings in place, so reference
    // equality alone cannot prove that the cached processor output is
    // still valid (notably when switching blender type).
    this.#settingsOutputCache = undefined;
    this.#sceneDirty = true;
    this.#applyDisplaySettings();
    this.requestRender();
    this.#notifySettingsChange();

    const dataView = this.#dataView;
    const { removeBackground, cropArea } = this.settingsOutput;

    void dataView.setOptions(removeBackground, cropArea);
  };

  /** Creates a new layer for point clouds. */
  static create<WM extends WindowMapper>(
    context: SceneContext<WM>,
    name: string,
    maxCacheSize?: number,
  ): PointCloudLayer<WM> {
    const dataView = PointCloudView.create(context, maxCacheSize);

    return new PointCloudLayer(context, name, dataView);
  }

  /** Creates a new layer for point clouds. */
  constructor(
    context: SceneContext<WM>,
    name: string,
    dataView: PointCloudView,
  ) {
    super(context, name, dataView);

    const config = context.config;
    const settings = getSettings(config);

    this.#dataView = dataView;

    this.#settingsInputtedData = settings;
    this.#settingsInternalData = null;
    this.#settingsPaneSettings = pointCloudSettingsPaneFactoryParams.settings;
    this.setControlsSections([
      { title: "Preferences", keybinds: this.PREFS_KEYDOWN_BINDS },
    ]);

    for (const keybind of this.PREFS_KEYDOWN_BINDS) {
      this.keydownHandler.register(keybind);
    }
  }

  dispose() {
    super.dispose();
  }

  /** The main window of the scene display, which owns the camera state
   * mapped into this layer's editor-state slice. */
  get #mainWindow(): MainWindow {
    // The window mapper is generic, but the scene display always includes
    // the main window; narrow it here.
    return (this.context.display.windows as unknown as { main: MainWindow })
      .main;
  }

  /** Maps this layer's camera/settings state into its plain editor-state slice. */
  /** Contributes the point cloud intent group to the editor intents. */
  createEditorIntents(runtime: EditorRuntime): PointCloudPluginIntents {
    return {
      pcd: {
        setSettings: (values) => {
          this.onSettingsInputChange(values);
        },
        setCameraSettings: (change) => {
          this.mainCameraMenu?.updateMainCameraSettings(change);
        },
      },
    };
  }

  mapEditorSlice(previous: PointCloudSlice | null): PointCloudSlice {
    return mapPointCloudSlice(
      {
        viewMode: this.#mainWindow.viewMode,
        orbitPoint: this.#mainWindow.overrideOrbitTarget != null,
        settings: {
          values: this.#settingsInputtedData,
          disabled: this.#settingsPaneSettings.disabled,
          target: this.#settingsInternalData,
        },
      },
      previous,
    );
  }

  /** Subscribes to every event that can change this layer's editor-state slice. */
  subscribeEditorSlice(listener: () => void): () => void {
    const mainWindow = this.#mainWindow;
    mainWindow.addEventListener("viewMode-change", listener);
    mainWindow.addEventListener("orbitTarget-change", listener);
    this.addEventListener("settings-change", listener);

    return (): void => {
      mainWindow.removeEventListener("viewMode-change", listener);
      mainWindow.removeEventListener("orbitTarget-change", listener);
      this.removeEventListener("settings-change", listener);
    };
  }

  get prefsView(): React.JSX.Element {
    return <PointCloudPreferencesView />;
  }

  /** Updates the `three.js` objects and the DOM elements of this layer. */
  render() {
    if (!this.#sceneDirty) return;
    this.#sceneDirty = false;

    this.objects.clear();

    const { data } = this.dataView;
    if (data == null) {
      this.refreshObjects();
      return;
    }

    this.#applyDisplaySettings();

    this.objects.add(data.asObject3D());

    this.#gridHelper.position.copy(data.position);
    this.objects.add(this.#gridHelper);
    this.refreshObjects();
  }

  /** Applies the current visual settings to the loaded point cloud, if any. */
  #applyDisplaySettings(): void {
    const { data } = this.dataView;
    if (data == null) return;

    const { blender, pointSize } = this.settingsOutput;
    if (blender != null) data.blender = blender;
    data.pointSize = pointSize;
  }

  get settingsOutput() {
    const cache = this.#settingsOutputCache;
    if (
      cache?.inputtedData === this.#settingsInputtedData &&
      cache?.internalData === this.#settingsInternalData &&
      cache?.settings === this.#settingsPaneSettings
    )
      return cache.output;

    const output = pointCloudSettingsPaneDataProcessor.outputData(
      this.#getSettingsPaneElementParams(),
    );
    this.#settingsOutputCache = {
      inputtedData: this.#settingsInputtedData,
      internalData: this.#settingsInternalData,
      settings: this.#settingsPaneSettings,
      output,
    };
    return output;
  }

  onSettingsInputChange = (
    inputtedData: PointCloudSettingsPaneControllerParams["inputtedData"],
  ): void => {
    this.#onSettingsChange(inputtedData);
  };

  #toggleSetting(setting: "removeBackground" | "cropArea"): void {
    if (this.#settingsPaneSettings.disabled) return;
    this.#onSettingsChange({
      ...this.#settingsInputtedData,
      [setting]: !this.#settingsInputtedData[setting],
    });
  }

  #getSettingsPaneElementParams(): PaneElementParams<PointCloudSettingsPaneControllerParams> {
    return {
      inputtedData: this.#settingsInputtedData,
      computedData: pointCloudSettingsPaneDataProcessor.computeData(
        this.#settingsInputtedData,
        this.#settingsInternalData,
      ),
      settings: this.#settingsPaneSettings,
    };
  }

  #notifySettingsChange(): void {
    this.dispatchEvent({ type: "settings-change" });
  }
}
