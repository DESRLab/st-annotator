/* @vitest-environment jsdom */

import { act, default as React, type JSX } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorIntentsProvider, EditorStoreProvider } from "sta/app/editor";
import {
  createEditorStateFixture,
  createMockEditorStore,
  noopEditorIntents,
} from "sta/app/editor/testing";
import type { LayersDomainSlice } from "sta/app/editor";
import type { FixtureLayerDescriptor } from "sta/app/editor/testing";

import type {
  VectorEntity,
  VectorIntents,
  VectorSlice,
} from "../../../../app/editor/scene/layer/VectorSlice";
import { VectorLabelsTreeHost } from "../../../../app/editor/scene/widgets/VectorLabelsTree.react.tsx";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
});

const VECTOR_LAYER_DESCRIPTORS: readonly FixtureLayerDescriptor[] = [
  { key: "vector", name: "Vector", kind: "label" },
];

const CLASS_CAR = { id: 1, name: "Car" };
const VECTOR_ID = "33333333-3333-4333-8333-333333333333";

async function renderPane(
  slice: object,
  intents: typeof noopEditorIntents,
  node: JSX.Element,
) {
  // The fixture builder only knows the base slices; the plugin slice is
  // merged into `layers` exactly as the route mapper does.
  const state = createEditorStateFixture({
    layerDescriptors: VECTOR_LAYER_DESCRIPTORS,
    layers: { vector: slice } as unknown as Partial<LayersDomainSlice>,
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

function queryButton(
  dom: HTMLElement,
  kind: string,
  id: string | null,
): HTMLButtonElement {
  const button = dom.querySelector<HTMLButtonElement>(
    'button[data-label-kind="' +
      kind +
      '"][data-label-id="' +
      (id ?? "") +
      '"]',
  );
  expect(button, `button ${kind} ${String(id)}`).toBeTruthy();
  return button!;
}

describe("vector labels tree container", () => {
  function createVectorSlice(
    overrides: Partial<VectorSlice> = {},
  ): VectorSlice {
    return {
      ui: {
        action: "edit",
        drawMode: "polyline",
        disabled: false,
        selectedVectorId: null,
        canCopy: false,
        canPaste: false,
        drawVectorActive: false,
        vectorInspectorDisabled: false,
      },
      settings: {
        values: {} as VectorSlice["settings"]["values"],
        disabled: false,
      },
      vectors: [],
      classes: [],
      ...overrides,
    };
  }

  function createVectorIntents(): typeof noopEditorIntents & {
    vector: Record<keyof VectorIntents, ReturnType<typeof vi.fn>>;
  } {
    return {
      ...noopEditorIntents,
      vector: {
        setAction: vi.fn(),
        setDrawMode: vi.fn(),
        setSettings: vi.fn(),
        applyVectorInspectorInput: vi.fn(),
        selectVector: vi.fn(),
        vectorInspectorPaneEvent: vi.fn(),
      },
    };
  }

  function createVectorEntity(
    overrides: Partial<VectorEntity> = {},
  ): VectorEntity {
    return {
      id: VECTOR_ID,
      text: `P{${VECTOR_ID.slice(0, 4)}} [Car]`,
      gtClassId: CLASS_CAR.id,
      ...overrides,
    };
  }

  it("renders vectors from the slice and dispatches selection intents on click", async () => {
    const intents = createVectorIntents();
    const view = await renderPane(
      createVectorSlice({
        vectors: [createVectorEntity()],
      }),
      intents,
      <VectorLabelsTreeHost />,
    );

    expect(view.container.querySelector(".vector-tree")).toBeTruthy();
    expect(
      queryButton(view.container, "vector", VECTOR_ID).textContent,
    ).toContain("[Car]");

    await act(async () => {
      queryButton(view.container, "vector", VECTOR_ID).click();
    });
    expect(intents.vector.selectVector).toHaveBeenCalledWith(VECTOR_ID);

    // The slice selection is echoed; clicking again deselects.
    await act(async () => {
      view.setState(
        createEditorStateFixture({
          layerDescriptors: VECTOR_LAYER_DESCRIPTORS,
          layers: {
            vector: createVectorSlice({
              vectors: [createVectorEntity()],
              ui: {
                ...createVectorSlice().ui,
                selectedVectorId: VECTOR_ID,
              },
            }),
          } as unknown as Partial<LayersDomainSlice>,
        }),
      );
    });
    expect(
      queryButton(view.container, "vector", VECTOR_ID).getAttribute(
        "aria-selected",
      ),
    ).toBe("true");

    await act(async () => {
      queryButton(view.container, "vector", VECTOR_ID).click();
    });
    expect(intents.vector.selectVector.mock.calls.at(-1)?.[0]).toBeNull();

    await view.unmount();
  });

  it("disables the tree while the vector inspector is disabled", async () => {
    const intents = createVectorIntents();
    const view = await renderPane(
      createVectorSlice({
        vectors: [createVectorEntity()],
        ui: {
          ...createVectorSlice().ui,
          vectorInspectorDisabled: true,
        },
      }),
      intents,
      <VectorLabelsTreeHost />,
    );

    expect(
      view.container
        .querySelector(".vector-tree")
        ?.getAttribute("aria-disabled"),
    ).toBe("true");
    const buttons = [...view.container.querySelectorAll("button")];
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) expect(button.disabled).toBe(true);

    await view.unmount();
  });

  it("keeps mounted rows bounded for a large vector collection", async () => {
    const vectors = Array.from({ length: 50_000 }, (_, index) =>
      createVectorEntity({
        id: `vector-${index}` as any,
        text: `Vector ${index}`,
      }),
    );
    const view = await renderPane(
      createVectorSlice({ vectors }),
      createVectorIntents(),
      <VectorLabelsTreeHost />,
    );

    expect(
      view.container.querySelectorAll('[role="treeitem"]').length,
    ).toBeLessThanOrEqual(18);
    await view.unmount();
  });
});
