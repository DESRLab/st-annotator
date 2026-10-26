/* @vitest-environment jsdom */

import { act, default as React, type JSX } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { EditorIntentsProvider, EditorStoreProvider } from "sta/app/editor";
import {
  createEditorStateFixture,
  createMockEditorStore,
  noopEditorIntents,
} from "sta/app/editor/testing";
import type { LayersDomainSlice } from "sta/app/editor";

import { GroundMeshPreferencesView } from "../../../../app/editor/scene/layer/GroundMeshLayer.react.tsx";
import type {
  GroundMeshIntents,
  GroundMeshSlice,
} from "../../../../app/editor/scene/layer/GroundMeshSlice";

import {
  createGroundMeshSettingsPaneElementFactory,
  groundMeshSettingsPaneDataProcessor,
  groundMeshSettingsPaneFactoryParams,
} from "../../../../app/editor/scene/widgets/GroundMeshSettingsPane.react.tsx";
import {
  createTransformerSettingsPaneElementFactory as createGroundMeshTransformerSettingsPaneElementFactory,
  getTransformationSelectSettings as getGroundMeshTransformationSelectSettings,
  transformerSettingsPaneDataProcessor as groundMeshTransformerSettingsPaneDataProcessor,
} from "../../../../app/editor/scene/widgets/TransformerSettingsPane.react.tsx";
import type { TransformerSettingsPaneControllerParams } from "../../../../app/editor/scene/widgets/TransformerSettingsPane.react.tsx";

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

function createGmeshSlice(
  overrides: Partial<GroundMeshSlice> = {},
): GroundMeshSlice {
  return {
    ui: {},
    settings: {
      values: groundMeshSettingsPaneFactoryParams.inputtedData,
      disabled: false,
      target: null,
    },
    ...overrides,
  };
}

function createRecordingIntents(): typeof noopEditorIntents & {
  gmesh: Record<keyof GroundMeshIntents, ReturnType<typeof vi.fn>>;
} {
  return {
    ...noopEditorIntents,
    gmesh: {
      setSettings: vi.fn(),
    },
  };
}

async function renderPane(
  slice: GroundMeshSlice,
  intents: typeof noopEditorIntents,
  node: JSX.Element,
) {
  // The fixture builder only knows the base slices; the plugin slice is
  // merged into `layers` exactly as the route mapper does.
  const state = createEditorStateFixture({
    layerDescriptors: [{ key: "gmesh", name: "Ground Mesh", kind: "source" }],
    layers: { gmesh: slice } as unknown as Partial<LayersDomainSlice>,
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

describe("gmesh pane containers", () => {
  it("reads the committed settings from the snapshot and forwards optimistic input to the intents", async () => {
    const intents = createRecordingIntents();
    const view = await renderPane(
      createGmeshSlice(),
      intents,
      <GroundMeshPreferencesView />,
    );

    const checkbox = findLabeledCheckbox(view.container, "Show Wireframe");
    expect(checkbox).toBeTruthy();
    expect(checkbox?.checked).toBe(true);

    await act(async () => {
      checkbox?.click();
    });

    expect(intents.gmesh.setSettings).toHaveBeenCalledOnce();
    expect(intents.gmesh.setSettings.mock.calls[0][0]).toMatchObject({
      showWireframe: false,
    });

    await view.unmount();
  });

  it("disables the settings pane inputs while the layer is disabled", async () => {
    const intents = createRecordingIntents();
    const view = await renderPane(
      createGmeshSlice({
        settings: { ...createGmeshSlice().settings, disabled: true },
      }),
      intents,
      <GroundMeshPreferencesView />,
    );

    const checkbox = findLabeledCheckbox(view.container, "Show Wireframe");
    expect(checkbox?.disabled).toBe(true);

    await view.unmount();
  });

  it("drops a pending settings draft when the pane becomes disabled", async () => {
    const intents = createRecordingIntents();
    const slice = createGmeshSlice();
    const view = await renderPane(
      slice,
      intents,
      <GroundMeshPreferencesView />,
    );

    // Open a draft that never round-trips (the mock intent only records).
    await act(async () => {
      findLabeledCheckbox(view.container, "Show Wireframe")?.click();
    });
    expect(intents.gmesh.setSettings).toHaveBeenCalledOnce();
    expect(findLabeledCheckbox(view.container, "Show Wireframe")?.checked).toBe(
      false,
    );

    // A disabled transition keeps the same committed values reference;
    // the draft must still be dropped so it cannot overwrite committed
    // state after a disable/reload cycle.
    await act(async () => {
      view.setState(
        createEditorStateFixture({
          layerDescriptors: [
            { key: "gmesh", name: "Ground Mesh", kind: "source" },
          ],
          layers: {
            gmesh: createGmeshSlice({
              settings: { ...slice.settings, disabled: true },
            }),
          } as unknown as Partial<LayersDomainSlice>,
        }),
      );
    });
    expect(findLabeledCheckbox(view.container, "Show Wireframe")?.checked).toBe(
      true,
    );

    await view.unmount();
  });

  it("drops rapid settings drafts overtaken by a disable transition and re-enables with committed values", async () => {
    // Plan item 21: enter multiple rapid values, disable the pane before
    // React reconciliation, and verify the optimistic draft is dropped
    // instead of overwriting committed state after the transition.
    const intents = createRecordingIntents();
    const slice = createGmeshSlice();
    const view = await renderPane(
      slice,
      intents,
      <GroundMeshPreferencesView />,
    );

    const findWireframeCheckbox = (): HTMLInputElement | null =>
      findLabeledCheckbox(view.container, "Show Wireframe");
    const findOpacityInput = (): HTMLInputElement | undefined =>
      [...view.container.querySelectorAll<HTMLElement>(".tp-lblv")]
        .find((row) => row.textContent?.startsWith("Opacity"))
        ?.querySelector("input") ?? undefined;

    const wireframe = findWireframeCheckbox();
    const opacity = findOpacityInput();
    expect(wireframe).toBeTruthy();
    expect(wireframe?.checked).toBe(true);
    expect(opacity).toBeTruthy();
    expect(opacity?.value).toContain("0.3");

    // Two rapid values, the disable transition, and one delayed change
    // event all land in the same task, before React reconciliation runs.
    await act(async () => {
      wireframe?.click();
      opacity!.value = "0.8";
      opacity!.dispatchEvent(new Event("change", { bubbles: true }));

      // Disable the pane before the drafts reconcile.
      view.setState(
        createEditorStateFixture({
          layerDescriptors: [
            { key: "gmesh", name: "Ground Mesh", kind: "source" },
          ],
          layers: {
            gmesh: createGmeshSlice({
              settings: { ...slice.settings, disabled: true },
            }),
          } as unknown as Partial<LayersDomainSlice>,
        }),
      );

      // A delayed change event from a control toggled before the
      // disable arrives after the transition was committed.
      wireframe?.click();
    });

    // (a) The pane shows the authoritative committed values again and is
    // disabled: neither draft survived the disable transition.
    const disabledWireframe = findWireframeCheckbox();
    expect(disabledWireframe?.checked).toBe(true);
    expect(disabledWireframe?.disabled).toBe(true);
    expect(findOpacityInput()?.value).toContain("0.3");
    expect(findOpacityInput()?.disabled).toBe(true);

    // (b) The forwarded inputs are exactly the three user edits in
    // order; the disable transition itself forwarded nothing.
    expect(intents.gmesh.setSettings).toHaveBeenCalledTimes(3);
    expect(intents.gmesh.setSettings.mock.calls[0][0]).toMatchObject({
      showWireframe: false,
      opacity: 0.3,
    });
    expect(intents.gmesh.setSettings.mock.calls[1][0]).toMatchObject({
      showWireframe: false,
      opacity: 0.8,
    });
    expect(intents.gmesh.setSettings.mock.calls[2][0]).toMatchObject({
      showWireframe: true,
      opacity: 0.8,
    });

    // (c) Re-enabling shows the authoritative committed values; no stale
    // draft is resurrected.
    await act(async () => {
      view.setState(
        createEditorStateFixture({
          layerDescriptors: [
            { key: "gmesh", name: "Ground Mesh", kind: "source" },
          ],
          layers: {
            gmesh: slice,
          } as unknown as Partial<LayersDomainSlice>,
        }),
      );
    });
    const reenabledWireframe = findWireframeCheckbox();
    expect(reenabledWireframe?.checked).toBe(true);
    expect(reenabledWireframe?.disabled).toBe(false);
    expect(findOpacityInput()?.value).toContain("0.3");
    expect(findOpacityInput()?.disabled).toBe(false);
    expect(intents.gmesh.setSettings).toHaveBeenCalledTimes(3);

    await view.unmount();
  });
});

function transformerParams(
  overrides: Partial<{
    inputtedData: Partial<
      TransformerSettingsPaneControllerParams["inputtedData"]
    >;
    settings: Partial<TransformerSettingsPaneControllerParams["settings"]>;
  }> = {},
) {
  return {
    inputtedData: {
      isTransformSelected: {
        translate: true,
        rotate: true,
        scale: true,
        ...overrides.inputtedData?.isTransformSelected,
      },
    },
    computedData: {},
    settings: {
      disabled: false,
      hidden: false,
      ...overrides.settings,
    },
  };
}

describe("GroundMeshSettingsPane", () => {
  it("preserves the ground-mesh descriptor and output contract", async () => {
    const paneParams = {
      inputtedData: {
        ...groundMeshSettingsPaneFactoryParams.inputtedData,
        showWireframe: false,
        opacity: 0.8,
      },
      computedData: groundMeshSettingsPaneFactoryParams.computedData,
      internalData: null,
      settings: groundMeshSettingsPaneFactoryParams.settings,
    };

    expect(createGroundMeshSettingsPaneElementFactory()).toHaveProperty(
      "attach",
    );
    expect(
      groundMeshSettingsPaneDataProcessor.outputData(paneParams).showWireframe,
    ).toBe(false);
    expect(
      groundMeshSettingsPaneDataProcessor.outputData(paneParams).opacity,
    ).toBe(0.8);
  });
});

describe("TransformerSettingsPane", () => {
  it("preserves the transformer descriptor and output contract", async () => {
    const paneParams = transformerParams();

    expect(
      createGroundMeshTransformerSettingsPaneElementFactory(),
    ).toHaveProperty("attach");
    expect(
      getGroundMeshTransformationSelectSettings(transformerParams()).cells(2),
    ).toEqual({ title: "Scale", value: "scale" });
    expect(
      groundMeshTransformerSettingsPaneDataProcessor.outputData(paneParams)
        .isTransformSelected.scale,
    ).toBe(true);
  });
});
