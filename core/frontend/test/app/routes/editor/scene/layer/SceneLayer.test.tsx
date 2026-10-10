/* @vitest-environment jsdom */

import { act, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LayerControlsContentView } from "../../../../../../app/routes/editor/scene/layer/LayerControlsContent.react.tsx";
import { LayerOverlayView } from "../../../../../../app/routes/editor/scene/layer/LayerOverlay.react.tsx";
import { BaseSceneLayer } from "../../../../../../app/routes/editor/scene/layer/SceneLayer.tsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const context = {
  display: { windows: { main: {}, minimap: {} } },
  isLayerActive: () => false,
};

function OverlayVersion({
  layer,
}: {
  layer: BaseSceneLayer;
}): React.JSX.Element {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const update = (): void => setVersion((version) => version + 1);
    layer.addEventListener("overlay-change", update);
    return () => layer.removeEventListener("overlay-change", update);
  }, [layer]);
  return <output>{version}</output>;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("SceneLayer base contracts", () => {
  it("renders React-owned layer controls content", async () => {
    const dom = document.createElement("div");
    const root = createRoot(dom);
    document.body.append(dom);

    await act(async () => {
      root.render(
        <LayerControlsContentView
          sections={[
            {
              title: "Tools",
              keybinds: [
                {
                  keyCombo: "ctrl+a",
                  name: "Do A",
                  handler: () => {},
                },
              ],
            },
          ]}
        />,
      );
    });

    expect(dom.textContent).toContain("Tools");
    expect(dom.textContent).toContain("CTRL+A");
    expect(dom.textContent).toContain("Do A");

    await act(async () => {
      root.render(
        <LayerControlsContentView
          sections={[
            {
              title: "Context",
              keybinds: [
                {
                  keyCombo: "shift+b",
                  name: "Do B",
                  handler: () => {},
                },
              ],
            },
          ]}
        />,
      );
    });

    expect(dom.textContent).not.toContain("Do A");
    expect(dom.textContent).toContain("Context");
    expect(dom.textContent).toContain("SHIFT+B");
    expect(dom.textContent).toContain("Do B");

    await act(async () => root.unmount());
    expect(dom.innerHTML).toBe("");
  });

  it("does not create an overlay DOM host", () => {
    const layer = new BaseSceneLayer(
      context as unknown as ConstructorParameters<typeof BaseSceneLayer>[0],
      "Layer",
    );

    expect(layer.overlayView).toBeNull();

    layer.dispose();
  });

  it('left-aligns the "(None)" actions placeholder as on main, keeping the others centered', async () => {
    const layer = new BaseSceneLayer(
      context as unknown as ConstructorParameters<typeof BaseSceneLayer>[0],
      "Layer",
    );
    const dom = document.createElement("div");
    document.body.append(dom);
    const root = createRoot(dom);

    await act(async () => {
      root.render(layer.actionsView);
    });
    const actionsPlaceholder = dom.firstElementChild as HTMLElement;
    expect(actionsPlaceholder.textContent).toBe("(None)");
    expect(actionsPlaceholder.style.justifyContent).toBe("flex-start");
    expect(actionsPlaceholder.style.alignItems).toBe("center");

    await act(async () => {
      root.render(layer.toolsView);
    });
    const toolsPlaceholder = dom.firstElementChild as HTMLElement;
    expect(toolsPlaceholder.textContent).toBe("(No tools available)");
    expect(toolsPlaceholder.style.justifyContent).toBe("center");

    await act(async () => root.unmount());
    layer.dispose();
  });

  it("owns layer resources without an overlay DOM host", async () => {
    let layer;

    await act(async () => {
      layer = new BaseSceneLayer(
        context as unknown as ConstructorParameters<typeof BaseSceneLayer>[0],
        "Layer",
      );
    });
    expect(layer.context).toBe(context);
    expect(layer.name).toBe("Layer");
    expect(layer.state.isVisible("main")).toBe(true);
    expect(layer.objects.type).toBe("Group");
    expect(layer.actionsView).not.toBeNull();
    expect(layer.toolsView).not.toBeNull();
    expect(layer.prefsView).not.toBeNull();
    expect(layer.objectTreeView).not.toBeNull();
    expect(layer.controlsView).not.toBeNull();
    expect(layer.controlsSections).toBeNull();
    const onControlsChange = vi.fn();
    const onOverlayChange = vi.fn();
    const onHintChange = vi.fn();
    layer.addEventListener("controls-change", onControlsChange);
    layer.addEventListener("overlay-change", onOverlayChange);
    layer.addEventListener("hint-change", onHintChange);
    layer.setControlsSections([]);
    layer.refreshOverlay();
    layer.refreshHint();
    expect(onControlsChange).toHaveBeenCalledOnce();
    expect(onOverlayChange).toHaveBeenCalledOnce();
    expect(onHintChange).toHaveBeenCalledOnce();
    layer.removeEventListener("controls-change", onControlsChange);
    layer.removeEventListener("overlay-change", onOverlayChange);
    layer.removeEventListener("hint-change", onHintChange);
    layer.setControlsSections([]);
    layer.refreshOverlay();
    layer.refreshHint();
    expect(onControlsChange).toHaveBeenCalledOnce();
    expect(onOverlayChange).toHaveBeenCalledOnce();
    expect(onHintChange).toHaveBeenCalledOnce();
    expect(layer.getHint()).toBeNull();

    await act(async () => layer.dispose());
    expect(layer.actionsView).not.toBeNull();
  });

  it("updates React overlay subscribers from a stable layer snapshot version", async () => {
    const layer = new BaseSceneLayer(
      context as unknown as ConstructorParameters<typeof BaseSceneLayer>[0],
      "Layer",
    );
    const rootElem = document.createElement("div");
    const root = createRoot(rootElem);
    document.body.append(rootElem);

    await act(async (): Promise<void> => {
      root.render(<OverlayVersion layer={layer} />);
    });
    expect(rootElem.querySelector("output")?.textContent).toBe("0");

    await act(async (): Promise<void> => {
      layer.refreshOverlay();
    });
    expect(rootElem.querySelector("output")?.textContent).toBe("1");

    await act(async (): Promise<void> => root.unmount());
    layer.dispose();
  });

  it("renders tooltip models and React-owned overlay children", async () => {
    const rootElem = document.createElement("div");
    document.body.append(rootElem);

    const root = createRoot(rootElem);

    await act(async () => {
      root.render(
        <LayerOverlayView
          tooltips={[
            {
              className: "layer-tooltip",
              left: "25%" as any,
              lines: ["Box", "Car"],
              top: "50%" as any,
              visible: true,
            },
          ]}
        >
          <div className="brush">Cursor</div>
        </LayerOverlayView>,
      );
    });

    expect(rootElem.querySelector(".brush")?.textContent).toBe("Cursor");

    const tooltip = rootElem.querySelector<HTMLElement>(".layer-tooltip");
    expect(tooltip?.innerHTML).toBe("Box<br>Car");
    expect(tooltip?.style.left).toBe("25%");
    expect(tooltip?.style.top).toBe("50%");
    expect(tooltip?.style.visibility).toBe("visible");

    await act(async () => {
      root.render(
        <LayerOverlayView
          tooltips={[
            {
              className: "layer-tooltip",
              left: "10%" as any,
              lines: ["Hidden"],
              top: "20%" as any,
              visible: false,
            },
          ]}
        />,
      );
    });

    expect(rootElem.querySelector(".layer-tooltip")?.textContent).toBe(
      "Hidden",
    );
    expect(
      rootElem.querySelector<HTMLElement>(".layer-tooltip")?.style.visibility,
    ).toBe("hidden");

    await act(async () => root.unmount());
  });

  it("renders inspector panels immediately and updates their visibility declaratively", async () => {
    const rootElem = document.createElement("div");
    document.body.append(rootElem);
    const root = createRoot(rootElem);

    await act(async () => {
      root.render(
        <LayerOverlayView
          panels={[
            {
              content: <div>Inspector content</div>,
              hidden: false,
              key: "inspector",
              title: "Inspector",
            },
          ]}
        />,
      );
    });

    const panel = rootElem.querySelector<HTMLElement>(
      '[data-test="editor-panel-inspector"]',
    );
    expect(panel).not.toBeNull();
    expect(panel?.hidden).toBe(false);
    expect(panel?.textContent).toContain("Inspector content");

    await act(async () => {
      root.render(
        <LayerOverlayView
          panels={[
            {
              content: <div>Inspector content</div>,
              hidden: true,
              key: "inspector",
              title: "Inspector",
            },
          ]}
        />,
      );
    });

    expect(panel?.hidden).toBe(true);
    expect(panel?.textContent).not.toContain("Inspector content");

    await act(async () => root.unmount());
  });
});
