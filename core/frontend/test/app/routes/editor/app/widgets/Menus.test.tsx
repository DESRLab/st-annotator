/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { ComposableKeybindHandler } from "../../../../../../app/routes/editor/app/Keybinds";
import { ControlsMenuView } from "../../../../../../app/routes/editor/app/widgets/ControlsMenu.react.tsx";
import {
  LayerSelectHost,
  TabbedReactHost,
} from "../../../../../../app/routes/editor/app/widgets/MenuHosts.react.tsx";
import { MenuKeybinds } from "../../../../../../app/routes/editor/app/widgets/MenuKeybinds.ts";
import { ObjectTreeMenuView } from "../../../../../../app/routes/editor/app/widgets/ObjectTreeMenu.react.tsx";
import { PreferencesMenuView } from "../../../../../../app/routes/editor/app/widgets/PreferencesMenu.react.tsx";
import { ToolsMenuView } from "../../../../../../app/routes/editor/app/widgets/ToolsMenu.react.tsx";
import { EditorIntentsProvider } from "../../../../../../app/routes/editor/store/EditorIntents.react.tsx";
import { EditorStoreProvider } from "../../../../../../app/routes/editor/store/EditorStore.react.tsx";
import {
  createEditorStateFixture,
  createMockEditorStore,
  noopEditorIntents,
} from "../../../../../../app/routes/editor/store/testing";
import type {
  EditorState,
  LayerViewSlots,
} from "../../../../../../app/routes/editor/store/types";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function getTweakpaneTab(container, title) {
  return [...container.querySelectorAll(".tp-tbiv")].find(
    (tab) => tab.querySelector(".tp-tbiv_t")?.textContent === title,
  );
}

interface TestControls {
  controls: LayerViewSlots["controls"] & {
    controlsSections: LayerViewSlots["controls"]["controlsSections"];
  };
  setControlsSections(
    sections: LayerViewSlots["controls"]["controlsSections"],
  ): void;
  dispatchControlsChange(): void;
}

/** A mutable controls source standing in for a layer's controls. */
function createTestControls(name: string): TestControls {
  const listeners = new Set<() => void>();
  const testControls: TestControls = {
    controls: {
      controlsSections: null,
      controlsView: <span>{name} controls</span>,
      addEventListener(
        _eventType: "controls-change",
        listener: () => void,
      ): void {
        listeners.add(listener);
      },
      removeEventListener(
        _eventType: "controls-change",
        listener: () => void,
      ): void {
        listeners.delete(listener);
      },
    },
    setControlsSections(sections): void {
      testControls.controls.controlsSections = sections;
    },
    dispatchControlsChange(): void {
      for (const listener of [...listeners]) listener();
    },
  };
  return testControls;
}

interface MenuLayersFixture {
  state: EditorState;
  controls: Record<string, TestControls>;
}

function createMenuLayersFixture(activeKey: string | null): MenuLayersFixture {
  const descriptors = [
    { key: "source-a", name: "Source A", kind: "source" as const },
    { key: "label-a", name: "Label A", kind: "label" as const },
  ];
  const controls = {
    "source-a": createTestControls("Source A"),
    "label-a": createTestControls("Label A"),
  };

  return {
    state: createEditorStateFixture({
      layers: {
        metadata: new Map(
          descriptors.map((descriptor) => [descriptor.key, descriptor]),
        ),
        order: descriptors.map((descriptor) => descriptor.key),
        views: new Map(
          descriptors.map((descriptor) => [
            descriptor.key,
            {
              actionsView: null,
              toolsView: <span>{descriptor.name} tools</span>,
              prefsView: <span>{descriptor.name} prefs</span>,
              objectTreeView: <span>{descriptor.name} objects</span>,
              controls: controls[descriptor.key].controls,
            },
          ]),
        ),
      },
      ui: {
        layers: new Map(
          descriptors.map((descriptor) => [
            descriptor.key,
            { active: descriptor.key === activeKey, enabled: true },
          ]),
        ),
        activeLayerKey: activeKey,
        hint: null,
      },
    }),
    controls,
  };
}

function withActiveKey(
  state: EditorState,
  activeKey: string | null,
): EditorState {
  return {
    ...state,
    ui: {
      ...state.ui,
      activeLayerKey: activeKey,
      layers: new Map(
        [...state.ui.layers.entries()].map(([key, value]) => [
          key,
          { ...value, active: key === activeKey },
        ]),
      ),
    },
  };
}

async function renderWithStore(state: EditorState, node: React.ReactNode) {
  const store = createMockEditorStore(state);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const render = async (element: React.ReactNode): Promise<void> => {
    await act(async () => {
      root.render(
        <EditorStoreProvider store={store.store}>
          <EditorIntentsProvider intents={noopEditorIntents}>
            {element}
          </EditorIntentsProvider>
        </EditorStoreProvider>,
      );
    });
  };

  await render(node);

  return {
    container,
    render,
    store,
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("Menu base classes", () => {
  it("hosts React tab content in native Tweakpane pages", async () => {
    const view = await renderWithStore(
      createMenuLayersFixture(null).state,
      <TabbedReactHost
        tabs={[
          { title: "First", children: <span>first content</span> },
          { title: "Second", children: <span>second content</span> },
        ]}
      />,
    );

    expect(view.container.querySelector(".tp-tabv")).not.toBeNull();
    expect(view.container.textContent).toContain("first content");

    await act(async () => {
      getTweakpaneTab(view.container, "Second").querySelector("button").click();
    });
    expect(view.container.textContent).toContain("second content");

    await view.unmount();
  });

  it("provides disposable keybind ownership without a menu base class", () => {
    const menu = new MenuKeybinds();
    expect(menu.keydownHandler).toBeInstanceOf(ComposableKeybindHandler);
    expect(menu.keyupHandler).toBeInstanceOf(ComposableKeybindHandler);
    expect(() => menu.dispose()).not.toThrow();
  });
});

describe("React menu hosts", () => {
  const layerOptions = [
    { key: "source-a", name: "Source A" },
    { key: "label-a", name: "Label A" },
  ];

  it("uses Tweakpane label/list structure for Configure Layer", async () => {
    const view = await renderWithStore(
      createMenuLayersFixture("source-a").state,
      <LayerSelectHost
        activeKey="source-a"
        layerOptions={layerOptions}
        renderLayerContent={(key) => <span>{key} prefs</span>}
      />,
    );

    const row = view.container.querySelector(".tp-lblv");
    const label = row.querySelector(".tp-lblv_l");
    const value = row.querySelector(".tp-lblv_v");

    expect(label.textContent).toBe("Configure Layer:");
    expect(label.hasAttribute("style")).toBe(false);
    expect(value.hasAttribute("style")).toBe(false);
    expect(value.querySelector(".tp-lstv select.tp-lstv_s")).not.toBeNull();
    expect(value.querySelector(".tp-lstv_m")).not.toBeNull();
    const separators = view.container.querySelectorAll<HTMLElement>(".tp-sprv");
    expect(separators).toHaveLength(2);
    expect(separators[1].style.paddingTop).toBe("2px");

    await view.unmount();
  });

  it("selects layer-specific React content without mutating the active layer", async () => {
    const view = await renderWithStore(
      createMenuLayersFixture("source-a").state,
      <LayerSelectHost
        activeKey="source-a"
        layerOptions={layerOptions}
        renderLayerContent={(key) => (
          <span>{key === "source-a" ? "Source A prefs" : "Label A prefs"}</span>
        )}
      />,
    );

    expect(view.container.textContent).toContain("Source A prefs");
    const row = view.container.querySelector(".tp-lblv");
    expect(row.querySelector(".tp-lstv select.tp-lstv_s")).not.toBeNull();
    expect(row.querySelector(".tp-lblv_v").hasAttribute("style")).toBe(false);

    const select = view.container.querySelector("select");
    await act(async () => {
      select.selectedIndex = 2;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(view.container.textContent).toContain("Label A prefs");
    await view.unmount();
  });
});

describe("ToolsMenuView and ObjectTreeMenuView", () => {
  it("renders active-layer content directly from React views", async () => {
    const toolsView = await renderWithStore(
      createMenuLayersFixture(null).state,
      <ToolsMenuView />,
    );
    const objectTreeView = await renderWithStore(
      createMenuLayersFixture(null).state,
      <ObjectTreeMenuView />,
    );

    expect(toolsView.container.textContent).toContain("(No layer selected)");

    await act(async () => {
      toolsView.store.setState(
        withActiveKey(createMenuLayersFixture(null).state, "source-a"),
      );
    });
    await act(async () => {
      objectTreeView.store.setState(
        withActiveKey(createMenuLayersFixture(null).state, "source-a"),
      );
    });

    expect(toolsView.container.textContent).toContain("Source A tools");
    expect(objectTreeView.container.textContent).toContain("Source A objects");
    await toolsView.unmount();
    await objectTreeView.unmount();
  });

  it("renders React-owned Scene Objects content without hosting the legacy element", async () => {
    const view = await renderWithStore(
      withActiveKey(createMenuLayersFixture(null).state, "source-a"),
      <ObjectTreeMenuView />,
    );

    expect(view.container.textContent).toContain("Source A objects");

    await view.unmount();
  });
});

describe("ControlsMenu", () => {
  it("renders general keybinds and refreshes when handlers change", async () => {
    const general = new ComposableKeybindHandler([
      { keyCombo: "a", name: "Do A", handler: () => {} },
    ]);
    const child = new ComposableKeybindHandler([
      { keyCombo: "b", name: "Do B", handler: () => {} },
    ]);
    general.appendChild(child);

    const view = await renderWithStore(
      createMenuLayersFixture(null).state,
      <ControlsMenuView generalHandlers={{ General: general }} />,
    );
    expect(view.container.querySelector(".tp-tabv")).not.toBeNull();
    const generalContent = view.container.querySelector(
      ".tp-htmlcontainerv_t > div",
    );
    expect(generalContent.querySelector("b")?.tagName).toBe("B");
    expect(generalContent.querySelector(".react-controls-general")).toBeNull();
    expect(view.container.textContent).toContain("Do A");
    expect(view.container.textContent).toContain("Do B");

    await act(async () => {
      general.register({
        keyCombo: "c",
        name: "Do C",
        handler: () => {},
      });
    });

    expect(view.container.textContent).toContain("Do C");
    await view.unmount();
  });

  it("updates React-owned layer controls when its sections change", async () => {
    const fixture = createMenuLayersFixture("source-a");
    fixture.controls["source-a"].setControlsSections([
      {
        title: "Tools",
        keybinds: [{ keyCombo: "a", name: "Do A", handler: () => {} }],
      },
    ]);

    const view = await renderWithStore(
      fixture.state,
      <ControlsMenuView generalHandlers={{}} />,
    );
    await act(async () => {
      getTweakpaneTab(view.container, "Layer").querySelector("button").click();
    });
    expect(view.container.textContent).toContain("Do A");

    await act(async () => {
      fixture.controls["source-a"].setControlsSections([
        {
          title: "Context",
          keybinds: [{ keyCombo: "b", name: "Do B", handler: () => {} }],
        },
      ]);
      fixture.controls["source-a"].dispatchControlsChange();
    });

    expect(view.container.textContent).not.toContain("Do A");
    expect(view.container.textContent).toContain("Context");
    expect(view.container.textContent).toContain("Do B");
    await view.unmount();
  });
});

describe("BasePreferencesMenu", () => {
  it("renders global tabs plus layer preferences", async () => {
    const view = await renderWithStore(
      createMenuLayersFixture(null).state,
      <PreferencesMenuView
        globalSettingsTabs={{ Global: <span>global prefs</span> }}
      />,
    );

    expect(view.container.querySelector(".tp-tabv")).not.toBeNull();
    expect(view.container.textContent).toContain("Global");
    expect(view.container.textContent).toContain("Layer");
    expect(view.container.textContent).toContain("global prefs");
    expect(
      view.container.textContent.match(/\(No layer selected\)/g) ?? [],
    ).toHaveLength(1);

    await view.unmount();
  });

  it("rejects conflicts with its owned Layer tab", () => {
    expect(() =>
      PreferencesMenuView({
        globalSettingsTabs: { Layer: <span>global prefs</span> },
      }),
    ).toThrow(/conflicts/);
  });
});
