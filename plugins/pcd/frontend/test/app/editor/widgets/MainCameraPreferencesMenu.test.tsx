/* @vitest-environment jsdom */

import { act, default as React } from "react";
import { createRoot } from "react-dom/client";
import { Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createEditorStore,
  EditorIntentsProvider,
  EditorStoreProvider,
  LayerCollection,
} from "sta/app/editor";
import {
  createEditorStateFixture,
  noopEditorIntents,
} from "sta/app/editor/testing";
import type { LayersDomainSlice } from "sta/app/editor";

import type { PointCloudSlice } from "../../../../app/editor/scene/layer/PointCloudSlice";
import { MainCameraPreferencesMenuView } from "../../../../app/editor/widgets/MainCameraPreferencesMenu.react.tsx";
import { MainCameraPreferencesMenu } from "../../../../app/editor/widgets/MainCameraPreferencesMenu.tsx";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView = vi.fn();

async function renderView(node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(node);
  });

  return {
    container,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("MainCameraPreferencesMenu", () => {
  it("preserves menu keybinds while composing React preference tabs", async () => {
    const layers = new LayerCollection({});
    const mainWindow = { viewMode: "2D", overrideOrbitTarget: null };
    const pcdLayer = { overrideOrbitTarget: { x: 1, y: 2, z: 3 } };
    let menu: MainCameraPreferencesMenu | undefined;

    await act(async () => {
      menu = new MainCameraPreferencesMenu(
        layers,
        mainWindow as unknown as ConstructorParameters<
          typeof MainCameraPreferencesMenu
        >[1],
        pcdLayer as unknown as ConstructorParameters<
          typeof MainCameraPreferencesMenu
        >[2],
      );
    });

    // The pane containers read the pcd slice from the editor state store.
    const pcdSlice: PointCloudSlice = {
      camera: { viewMode: "2D", orbitPoint: false },
      settings: {
        values: {} as PointCloudSlice["settings"]["values"],
        disabled: false,
        target: null,
      },
    };
    const store = createEditorStore(() =>
      createEditorStateFixture({
        layerDescriptors: [{ key: "pcd", name: "Point Cloud", kind: "source" }],
        layers: {
          pcd: pcdSlice,
        } as unknown as Partial<LayersDomainSlice>,
      }),
    );
    const view = await renderView(
      <EditorStoreProvider store={store}>
        <EditorIntentsProvider intents={noopEditorIntents}>
          <MainCameraPreferencesMenuView />
        </EditorIntentsProvider>
      </EditorStoreProvider>,
    );

    expect((menu! as any).layers).toBe(layers);
    expect(view.container.textContent).toContain("Main Camera");
    expect(mainWindow.viewMode).toBe("2D");

    await act(async () => {
      menu!.keydownHandler.handle({ keyCombo: "x" } as any);
      menu!.keydownHandler.handle({ keyCombo: "o" } as any);
    });

    expect(mainWindow.viewMode).toBe("3D");
    expect(mainWindow.overrideOrbitTarget).toBe(pcdLayer.overrideOrbitTarget);

    await view.unmount();
    await act(async () => menu!.dispose());
  });

  it("hosts the composed preferences menu with React and preserves camera bindings", async () => {
    const layers = new LayerCollection({});
    const mainWindow = { viewMode: "2D", overrideOrbitTarget: null };
    const pcdLayer = { overrideOrbitTarget: () => new Vector3(1, 2, 3) };
    let menu: MainCameraPreferencesMenu | undefined;

    await act(async () => {
      menu = new MainCameraPreferencesMenu(
        layers,
        mainWindow as unknown as ConstructorParameters<
          typeof MainCameraPreferencesMenu
        >[1],
        pcdLayer as unknown as ConstructorParameters<
          typeof MainCameraPreferencesMenu
        >[2],
      );
    });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    // The pane containers read the pcd slice from the editor state store.
    const pcdSlice: PointCloudSlice = {
      camera: { viewMode: "2D", orbitPoint: false },
      settings: {
        values: {} as PointCloudSlice["settings"]["values"],
        disabled: false,
        target: null,
      },
    };
    const intents = {
      ...noopEditorIntents,
      pcd: { setSettings: vi.fn(), setCameraSettings: vi.fn() },
    };
    const store = createEditorStore(() =>
      createEditorStateFixture({
        layerDescriptors: [{ key: "pcd", name: "Point Cloud", kind: "source" }],
        layers: {
          pcd: pcdSlice,
        } as unknown as Partial<LayersDomainSlice>,
      }),
    );
    await act(async () => {
      root.render(
        <EditorStoreProvider store={store}>
          <EditorIntentsProvider intents={intents}>
            <MainCameraPreferencesMenuView />
          </EditorIntentsProvider>
        </EditorStoreProvider>,
      );
    });

    expect(menu!.layers).toBe(layers);
    expect(host.textContent).toContain("Main Camera");
    expect(host.textContent).toContain("Layer");

    // Pane input routes through the pcd intents.
    const orbitRow = [...host.querySelectorAll<HTMLElement>(".tp-lblv")].find(
      (candidate) => candidate.textContent?.includes("Orbit Point"),
    );
    await act(async () => {
      orbitRow
        ?.querySelector<HTMLInputElement>('input[type="checkbox"]')
        ?.click();
    });
    expect(intents.pcd.setCameraSettings).toHaveBeenCalledWith({
      viewMode: "2D",
      orbitPoint: true,
    });

    // The keybinds apply the settings through the main window.
    await act(async () => {
      menu!.keydownHandler.handle({ keyCombo: "x" } as any);
      menu!.keydownHandler.handle({ keyCombo: "o" } as any);
    });
    expect(mainWindow.viewMode).toBe("3D");
    expect(mainWindow.overrideOrbitTarget).toBe(pcdLayer.overrideOrbitTarget);

    await act(async () => root.unmount());
    await act(async () => menu!.dispose());
    expect(host.innerHTML).toBe("");
  });
});
