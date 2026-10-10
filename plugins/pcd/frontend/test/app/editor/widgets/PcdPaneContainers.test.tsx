/* @vitest-environment jsdom */

import { act, default as React, type JSX } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  CoordinateFormat,
  PointBuffer,
  EditorIntentsProvider,
  EditorStoreProvider,
} from "sta/app/editor";
import {
  createEditorStateFixture,
  createMockEditorStore,
  noopEditorIntents,
} from "sta/app/editor/testing";
import type { LayersDomainSlice } from "sta/app/editor";

import { PointCloudPreferencesView } from "../../../../app/editor/scene/layer/PointCloudLayer.react.tsx";
import type {
  PointCloudIntents,
  PointCloudSlice,
} from "../../../../app/editor/scene/layer/PointCloudSlice";
import { pointCloudSettingsPaneFactoryParams } from "../../../../app/editor/scene/widgets/PointCloudSettingsPane.react.tsx";
import {
  MainCameraPreferencesMenuView,
  MainCameraSettingsView,
} from "../../../../app/editor/widgets/MainCameraPreferencesMenu.react.tsx";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  // The color blender sub-pane draws onto a canvas; jsdom has no 2D context.
  HTMLCanvasElement.prototype.getContext = (() => ({
    beginPath() {},
    clearRect() {},
    createLinearGradient() {
      return { addColorStop() {} };
    },
    fill() {},
    fillRect() {},
    getImageData() {
      return { data: [0, 0, 0, 255] };
    },
    lineTo() {},
    moveTo() {},
    putImageData() {},
    rect() {},
    stroke() {},
  })) as any;
});

afterEach(() => {
  document.body.replaceChildren();
});

function createPcdSlice(
  overrides: Partial<PointCloudSlice> = {},
): PointCloudSlice {
  return {
    camera: { viewMode: "2D", orbitPoint: false },
    settings: {
      values: pointCloudSettingsPaneFactoryParams.inputtedData,
      disabled: false,
      target: null,
    },
    ...overrides,
  };
}

function createRecordingIntents(): typeof noopEditorIntents & {
  pcd: Record<keyof PointCloudIntents, ReturnType<typeof vi.fn>>;
} {
  return {
    ...noopEditorIntents,
    pcd: {
      setSettings: vi.fn(),
      setCameraSettings: vi.fn(),
    },
  };
}

async function renderPane(
  slice: PointCloudSlice,
  intents: typeof noopEditorIntents,
  node: JSX.Element,
) {
  // The fixture builder only knows the base slices; the plugin slice is
  // merged into `layers` exactly as the route mapper does.
  const state = createEditorStateFixture({
    layerDescriptors: [{ key: "pcd", name: "Point Cloud", kind: "source" }],
    layers: { pcd: slice } as unknown as Partial<LayersDomainSlice>,
  });
  const { store, setState } = createMockEditorStore(state);

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <EditorStoreProvider store={store}>
        <EditorIntentsProvider intents={intents}>{node}</EditorIntentsProvider>
      </EditorStoreProvider>,
    );
  });

  return {
    container,
    setState,
    unmount: async (): Promise<void> => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function findLabeledCheckbox(
  container: HTMLElement,
  label: string,
): HTMLInputElement | null {
  const row = [...container.querySelectorAll<HTMLElement>(".tp-lblv")].find(
    (candidate) => candidate.textContent?.includes(label),
  );
  return row?.querySelector('input[type="checkbox"]') ?? null;
}

describe("pcd pane containers", () => {
  it("reads the committed settings from the snapshot and forwards optimistic input to the intents", async () => {
    const intents = createRecordingIntents();
    const view = await renderPane(
      createPcdSlice(),
      intents,
      <PointCloudPreferencesView />,
    );

    const checkbox = findLabeledCheckbox(view.container, "RemoveBG");
    expect(checkbox).toBeTruthy();
    expect(checkbox?.checked).toBe(true);

    await act(async () => {
      checkbox?.click();
    });

    expect(intents.pcd.setSettings).toHaveBeenCalledOnce();
    expect(intents.pcd.setSettings.mock.calls[0][0]).toMatchObject({
      removeBackground: false,
    });

    await view.unmount();
  });

  it("disables the settings pane inputs while the layer is disabled", async () => {
    const intents = createRecordingIntents();
    const view = await renderPane(
      createPcdSlice({
        settings: { ...createPcdSlice().settings, disabled: true },
      }),
      intents,
      <PointCloudPreferencesView />,
    );

    const checkbox = findLabeledCheckbox(view.container, "RemoveBG");
    expect(checkbox?.disabled).toBe(true);

    await view.unmount();
  });

  it("drops a pending settings draft when the pane becomes disabled", async () => {
    const intents = createRecordingIntents();
    const slice = createPcdSlice();
    const view = await renderPane(
      slice,
      intents,
      <PointCloudPreferencesView />,
    );

    // Open a draft that never round-trips (the mock intent only records).
    await act(async () => {
      findLabeledCheckbox(view.container, "RemoveBG")?.click();
    });
    expect(intents.pcd.setSettings).toHaveBeenCalledOnce();
    expect(findLabeledCheckbox(view.container, "RemoveBG")?.checked).toBe(
      false,
    );

    // A disabled transition keeps the same committed values reference;
    // the draft must still be dropped so it cannot overwrite committed
    // state after a disable/reload cycle.
    await act(async () => {
      view.setState(
        createEditorStateFixture({
          layerDescriptors: [
            { key: "pcd", name: "Point Cloud", kind: "source" },
          ],
          layers: {
            pcd: createPcdSlice({
              settings: { ...slice.settings, disabled: true },
            }),
          } as unknown as Partial<LayersDomainSlice>,
        }),
      );
    });
    expect(findLabeledCheckbox(view.container, "RemoveBG")?.checked).toBe(true);

    await view.unmount();
  });

  it("drops rapid settings drafts overtaken by a disable transition and re-enables with committed values", async () => {
    // Plan item 21: enter multiple rapid values, disable the pane before
    // React reconciliation, and verify the optimistic draft is dropped
    // instead of overwriting committed state after the transition.
    const intents = createRecordingIntents();
    const slice = createPcdSlice();
    const view = await renderPane(
      slice,
      intents,
      <PointCloudPreferencesView />,
    );

    const removeBg = findLabeledCheckbox(view.container, "RemoveBG");
    const cropArea = findLabeledCheckbox(view.container, "CropArea");
    expect(removeBg).toBeTruthy();
    expect(cropArea).toBeTruthy();
    expect(removeBg?.checked).toBe(true);
    expect(cropArea?.checked).toBe(true);

    // Two rapid values, the disable transition, and one delayed change
    // event all land in the same task, before React reconciliation runs.
    await act(async () => {
      removeBg?.click();
      cropArea?.click();

      // Disable the pane before the drafts reconcile.
      view.setState(
        createEditorStateFixture({
          layerDescriptors: [
            { key: "pcd", name: "Point Cloud", kind: "source" },
          ],
          layers: {
            pcd: createPcdSlice({
              settings: { ...slice.settings, disabled: true },
            }),
          } as unknown as Partial<LayersDomainSlice>,
        }),
      );

      // A delayed change event from a control toggled before the
      // disable arrives after the transition was committed.
      removeBg?.click();
    });

    // (a) The pane shows the authoritative committed values again and is
    // disabled: neither draft survived the disable transition.
    const disabledRemoveBg = findLabeledCheckbox(view.container, "RemoveBG");
    const disabledCropArea = findLabeledCheckbox(view.container, "CropArea");
    expect(disabledRemoveBg?.checked).toBe(true);
    expect(disabledRemoveBg?.disabled).toBe(true);
    expect(disabledCropArea?.checked).toBe(true);
    expect(disabledCropArea?.disabled).toBe(true);

    // (b) The forwarded inputs are exactly the three user toggles in
    // order; the disable transition itself forwarded nothing.
    expect(intents.pcd.setSettings).toHaveBeenCalledTimes(3);
    expect(intents.pcd.setSettings.mock.calls[0][0]).toMatchObject({
      removeBackground: false,
      cropArea: true,
    });
    expect(intents.pcd.setSettings.mock.calls[1][0]).toMatchObject({
      removeBackground: false,
      cropArea: false,
    });
    expect(intents.pcd.setSettings.mock.calls[2][0]).toMatchObject({
      removeBackground: true,
      cropArea: false,
    });

    // (c) Re-enabling shows the authoritative committed values; no stale
    // draft is resurrected.
    await act(async () => {
      view.setState(
        createEditorStateFixture({
          layerDescriptors: [
            { key: "pcd", name: "Point Cloud", kind: "source" },
          ],
          layers: {
            pcd: slice,
          } as unknown as Partial<LayersDomainSlice>,
        }),
      );
    });
    const reenabledRemoveBg = findLabeledCheckbox(view.container, "RemoveBG");
    const reenabledCropArea = findLabeledCheckbox(view.container, "CropArea");
    expect(reenabledRemoveBg?.checked).toBe(true);
    expect(reenabledRemoveBg?.disabled).toBe(false);
    expect(reenabledCropArea?.checked).toBe(true);
    expect(reenabledCropArea?.disabled).toBe(false);
    expect(intents.pcd.setSettings).toHaveBeenCalledTimes(3);

    await view.unmount();
  });

  it("reads the main camera state from the snapshot and writes it back through the pcd intents", async () => {
    const intents = createRecordingIntents();
    const view = await renderPane(
      createPcdSlice(),
      intents,
      <MainCameraSettingsView />,
    );

    // The view mode is a plugin-essentials radiogrid; the orbit point is
    // a checkbox.
    const mode3DRadio = [
      ...view.container.querySelectorAll<HTMLElement>(".tp-radv"),
    ]
      .find((item) => item.textContent === "3D")
      ?.querySelector<HTMLInputElement>(".tp-radv_i");
    expect(mode3DRadio?.checked).toBe(false);

    const orbitCheckbox = findLabeledCheckbox(view.container, "Orbit Point");
    expect(orbitCheckbox?.checked).toBe(false);

    await act(async () => {
      orbitCheckbox?.click();
    });
    expect(intents.pcd.setCameraSettings).toHaveBeenCalledOnce();
    expect(intents.pcd.setCameraSettings.mock.calls[0][0]).toEqual({
      viewMode: "2D",
      orbitPoint: true,
    });

    await view.unmount();
  });

  it("follows the snapshot when the main camera state round-trips", async () => {
    const intents = createRecordingIntents();
    const view = await renderPane(
      createPcdSlice(),
      intents,
      <MainCameraSettingsView />,
    );

    await act(async () => {
      view.setState(
        createEditorStateFixture({
          layerDescriptors: [
            { key: "pcd", name: "Point Cloud", kind: "source" },
          ],
          layers: {
            pcd: createPcdSlice({
              camera: { viewMode: "3D", orbitPoint: true },
            }),
          } as unknown as Partial<LayersDomainSlice>,
        }),
      );
    });

    const mode3DRadio = [
      ...view.container.querySelectorAll<HTMLElement>(".tp-radv"),
    ]
      .find((item) => item.textContent === "3D")
      ?.querySelector<HTMLInputElement>(".tp-radv_i");
    expect(mode3DRadio?.checked).toBe(true);
    expect(findLabeledCheckbox(view.container, "Orbit Point")?.checked).toBe(
      true,
    );

    await view.unmount();
  });

  it("composes the preferences menu with the main camera tab and the generated layer tab", async () => {
    const intents = createRecordingIntents();
    const view = await renderPane(
      createPcdSlice(),
      intents,
      <MainCameraPreferencesMenuView />,
    );

    expect(view.container.textContent).toContain("Main Camera");
    expect(view.container.textContent).toContain("Layer");
    expect(findLabeledCheckbox(view.container, "Orbit Point")).toBeTruthy();

    await view.unmount();
  });

  it("renders the ComposeRGB tabs with per-tab channel options from the point-cloud target", async () => {
    const intents = createRecordingIntents();
    const slice = createPcdSlice();
    const view = await renderPane(
      createPcdSlice({
        settings: {
          ...slice.settings,
          target: {
            buffer: new PointBuffer(
              new Float32Array([0, 10, 20, 30, 40, 50, 60, 70, 80]),
              CoordinateFormat.XYZ,
              3,
            ),
            channelNames: ["X", "Y", "Z"],
          },
          values: {
            ...slice.settings.values,
            blender: {
              ...slice.settings.values.blender,
              blenderType: "compose-rgb",
            },
          },
        },
      }),
      intents,
      <PointCloudPreferencesView />,
    );

    // The ComposeRGB pane is a tab folder with one tab per color channel,
    // and the first tab starts selected.
    const tabs = [...view.container.querySelectorAll<HTMLElement>(".tp-tbiv")];
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Red",
      "Green",
      "Blue",
    ]);
    expect(tabs[0].classList.contains("tp-tbiv-sel")).toBe(true);

    // Only the selected tab page of the ComposeRGB folder is visible;
    // the hidden ApplyColormap folder and the inactive tab pages must
    // not count. Tweakpane marks hidden blades and pages with
    // `tp-v-hidden`.
    const isHidden = (element: Element): boolean => {
      for (
        let node: Element | null = element;
        node != null;
        node = node.parentElement
      ) {
        if (node.classList.contains("tp-v-hidden")) return true;
      }
      return false;
    };
    const findVisibleChannelSelect = (): HTMLSelectElement | undefined =>
      [...view.container.querySelectorAll<HTMLElement>(".tp-lblv")]
        .filter(
          (row) => row.textContent?.startsWith("Channel") && !isHidden(row),
        )
        .map((row) => row.querySelector<HTMLSelectElement>("select")!)
        .at(0);

    // The selected tab's Channel select offers every point-cloud channel.
    const redChannel = findVisibleChannelSelect();
    expect(redChannel).toBeTruthy();
    expect(
      [...redChannel!.options].map((option) => option.textContent),
    ).toEqual(["0 (X)", "1 (Y)", "2 (Z)"]);

    // Switching tabs moves the selection marker and reveals each tab's
    // Channel select, which offers the same point-cloud channels.
    let previousChannel = redChannel;
    for (const tabIndex of [1, 2]) {
      await act(async () => {
        tabs[tabIndex].querySelector("button")?.click();
      });
      for (const [index, tab] of tabs.entries()) {
        expect(tab.classList.contains("tp-tbiv-sel")).toBe(index === tabIndex);
      }
      const tabChannel = findVisibleChannelSelect();
      expect(tabChannel).toBeTruthy();
      expect(tabChannel).not.toBe(previousChannel);
      expect(
        [...tabChannel!.options].map((option) => option.textContent),
      ).toEqual(["0 (X)", "1 (Y)", "2 (Z)"]);
      previousChannel = tabChannel;
    }

    await view.unmount();
  });
});
