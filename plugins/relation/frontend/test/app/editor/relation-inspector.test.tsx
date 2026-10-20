/* @vitest-environment jsdom */
import { act, default as React } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { EditorIntentsProvider, EditorStoreProvider } from "sta/app/editor";
import type { LayersDomainSlice } from "sta/app/editor";
import {
  createEditorStateFixture,
  createMockEditorStore,
  noopEditorIntents,
} from "sta/app/editor/testing";
import {
  RelationOverlay,
  RelationPreferences,
  RelationTools,
} from "../../../app/editor/RelationPanels.react";
import type { RelationSlice } from "../../../app/editor/RelationSlice";
import { defaultRelationSettings } from "../../../app/editor/RelationSettings";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

it("renders a native inspector and routes selection, class and endpoint edits through intents", async () => {
  const slice: RelationSlice = {
    version: 0,
    settings: defaultRelationSettings,
    active: true,
    cycling: false,
    hoveredId: null,
    disabled: false,
    loading: false,
    error: null,
    mode: "edit",
    classId: 1,
    selectedId: "relation",
    firstEndpoint: null,
    classes: [
      { id: 1, name: "supports", color_rgb: 0 },
      { id: 2, name: "touches", color_rgb: 0 },
    ],
    endpoints: [
      { id: "box source", type: "box", text: "source — Chair", visible: true },
      {
        id: "vector target",
        type: "vector",
        text: "target — (Unclassified)",
        visible: true,
      },
      {
        id: "box replacement",
        type: "box",
        text: "replacement — Table",
        visible: true,
      },
    ],
    relations: [
      {
        id: "relation",
        displayId: "00000000-0000-0000-0000-000000000001",
        name: "supports",
        records: [
          {
            id: "relation",
            displayId: "forward-id",
            name: "supports",
            classId: 1,
            reversed: false,
            source: "box source",
            target: "vector target",
          },
          {
            id: "parallel",
            displayId: "parallel-id",
            name: "touches",
            classId: 2,
            reversed: false,
            source: "box source",
            target: "vector target",
          },
          {
            id: "duplicate",
            displayId: "duplicate-id",
            name: "supports",
            classId: 1,
            reversed: false,
            source: "box source",
            target: "vector target",
          },
          {
            id: "reverse",
            displayId: "reverse-id",
            name: "touches",
            classId: 2,
            reversed: true,
            source: "vector target",
            target: "box source",
          },
        ],
        source: "box source",
        sourceClassName: "Chair",
        target: "vector target",
        targetClassName: null,
        visible: true,
      },
    ],
  };
  const intents = {
    setHidden: vi.fn(),
    setSettings: vi.fn(),
    setMode: vi.fn(),
    select: vi.fn(),
    setClass: vi.fn(),
    add: vi.fn(),
    replaceEndpoint: vi.fn(),
    remove: vi.fn(),
    cancel: vi.fn(),
  };
  const { store, setState } = createMockEditorStore(
    createEditorStateFixture({
      layerDescriptors: [{ key: "relation", name: "Relations", kind: "label" }],
      layers: {
        relation: slice,
      } as unknown as Partial<LayersDomainSlice>,
    }),
  );
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const canvas = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(null);
  try {
    await act(async () =>
      root.render(
        <EditorStoreProvider store={store}>
          <EditorIntentsProvider
            intents={{ ...noopEditorIntents, relation: intents }}
          >
            <RelationOverlay />
            <RelationPreferences />
          </EditorIntentsProvider>
        </EditorStoreProvider>,
      ),
    );
    expect(container.textContent).toContain("Relations");
    expect(container.querySelector(".tp-lblv")).not.toBeNull();
    const hideRow = [...container.querySelectorAll(".tp-lblv")].find(
      (row) => row.querySelector(".tp-lblv_l")?.textContent === "Hide in scene",
    )!;
    const hideCheckbox = hideRow.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!;
    expect(hideCheckbox.checked).toBe(false);
    await act(async () => hideCheckbox.click());
    expect(intents.setHidden).toHaveBeenCalledWith("relation", true);

    const search = container.querySelector<HTMLInputElement>(
      'input[role="combobox"]',
    )!;
    expect(search).not.toBeNull();
    await act(async () => {
      search.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(search, "000000000001");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const result = document.querySelector<HTMLButtonElement>(
      '[data-label-id="relation"]',
    )!;
    expect(result.textContent).toContain(
      "00000000-0000-0000-0000-000000000001",
    );
    await act(async () => result.click());
    expect(intents.select).toHaveBeenCalledWith("relation");
    const draw = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "D",
    )!;
    expect(draw.closest(".tp-rowv")?.contains(search)).toBe(true);
    expect(draw.getAttribute("aria-pressed")).toBe("false");
    await act(async () => draw.click());
    expect(intents.setMode).toHaveBeenCalledWith("create");
    const allFolders = [
      ...container
        .querySelector('[data-testid="relation-inspector"]')!
        .querySelectorAll(".tp-fldv"),
    ];
    expect(allFolders).toHaveLength(3);
    const relationsFolder = container
      .querySelector('[data-testid="direction-relations"]')!
      .closest(".tp-fldv")!;
    expect(relationsFolder.querySelector(".tp-fldv_b")?.textContent).toContain(
      "Relations",
    );
    expect(relationsFolder.querySelectorAll("[data-relation-id]")).toHaveLength(
      3,
    );
    expect(relationsFolder.textContent).toContain("Add relation");
    const folders = allFolders.filter(
      (folder) => folder.querySelector('input[role="combobox"]') != null,
    );
    expect(folders).toHaveLength(2);
    for (const folder of folders) {
      const rows = [...folder.querySelectorAll(".tp-lblv_l")].map(
        (label) => label.textContent,
      );
      expect(rows).toContain("ID");
      expect(rows).not.toContain("Search");
      expect(folder.querySelectorAll('input[role="combobox"]')).toHaveLength(2);
    }
    expect(folders[0].textContent).toContain("Source");
    expect(folders[0].textContent).toContain("Replace source");
    expect(
      [
        ...folders[0].querySelectorAll<HTMLInputElement>(
          'input[type="text"]:not([role="combobox"])',
        ),
      ].map((input) => input.value),
    ).toEqual(["Chair"]);
    expect(folders[1].textContent).toContain("Target");
    expect(folders[1].textContent).toContain("Replace target");
    expect(
      [
        ...folders[1].querySelectorAll<HTMLInputElement>(
          'input[type="text"]:not([role="combobox"])',
        ),
      ].map((input) => input.value),
    ).toEqual(["(Unclassified)"]);
    for (const [index, endpoint] of ["source", "target"].entries()) {
      const [typeSearch, endpointSearch] = folders[
        index
      ].querySelectorAll<HTMLInputElement>('input[role="combobox"]');
      expect(typeSearch.closest(".tp-rowv")?.contains(endpointSearch)).toBe(
        true,
      );
      const previousCalls = intents.replaceEndpoint.mock.calls.length;
      await act(async () => {
        typeSearch.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )!.set!.call(typeSearch, "box");
        typeSearch.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () =>
        document
          .querySelector<HTMLButtonElement>('[data-label-id="box"]')!
          .click(),
      );
      expect(intents.replaceEndpoint).toHaveBeenCalledTimes(previousCalls);
      await act(async () => {
        endpointSearch.dispatchEvent(
          new FocusEvent("focusin", { bubbles: true }),
        );
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )!.set!.call(endpointSearch, "replacement");
        endpointSearch.dispatchEvent(new Event("input", { bubbles: true }));
      });
      const option = document.querySelector<HTMLButtonElement>(
        '[data-label-id="box replacement"]',
      )!;
      expect(option.textContent).toContain("Table");
      await act(async () => option.click());
      expect(intents.replaceEndpoint).toHaveBeenLastCalledWith(
        endpoint,
        "box replacement",
      );
    }
    const preferences = container.querySelector(
      '[data-testid="relation-preferences"]',
    )!;
    expect(preferences.textContent).toContain("Hover color");
    expect(preferences.textContent).toContain("Select color");
    expect(preferences.textContent).toContain("Line thickness");
    const tooltips = preferences.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!;
    expect(tooltips.checked).toBe(false);
    await act(async () => tooltips.click());
    expect(intents.setSettings).toHaveBeenLastCalledWith({
      ...defaultRelationSettings,
      showTooltips: true,
    });
    const width = [...preferences.querySelectorAll(".tp-lblv")]
      .find(
        (row) =>
          row.querySelector(".tp-lblv_l")?.textContent === "Line thickness",
      )!
      .querySelector("input")!;
    await act(async () => {
      width.value = "9";
      width.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(intents.setSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ lineWidth: 9 }),
    );
    const inputs = [...container.querySelectorAll("input")];
    expect(inputs.map((input) => input.value)).toContain("source — Chair");

    expect(inputs.map((input) => input.value)).toContain("Chair");
    expect(inputs.map((input) => input.value)).toContain("(Unclassified)");
    const selects = container.querySelectorAll("select");
    const recordRows = container.querySelectorAll("[data-relation-id]");
    expect(
      [...recordRows].map((row) => row.getAttribute("data-relation-id")),
    ).toEqual(["relation", "parallel", "duplicate"]);
    expect(
      [...recordRows].map((row) => row.querySelector("input")?.value),
    ).toEqual(["forward-id", "parallel-id", "duplicate-id"]);
    const parallelClass = recordRows[1].querySelector("select")!;
    expect(parallelClass.value).not.toBe(
      recordRows[0].querySelector("select")!.value,
    );
    await act(async () => {
      parallelClass.selectedIndex = 0;
      parallelClass.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(intents.setClass).toHaveBeenLastCalledWith(1, "parallel");
    await act(async () => {
      parallelClass.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    expect(intents.select).toHaveBeenLastCalledWith("parallel");
    const add = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Add relation",
    )!;
    await act(async () => add.click());
    expect(intents.add).toHaveBeenCalledOnce();
    expect([...selects[1].options].map((option) => option.textContent)).toEqual(
      [
        "(Select a relation)",
        "Chair → (Unclassified) (3)",
        "(Unclassified) → Chair (1)",
      ],
    );
    await act(async () => {
      selects[1].selectedIndex = 2;
      selects[1].dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(intents.select).toHaveBeenLastCalledWith("reverse");
    await act(async () => {
      selects[1].selectedIndex = 1;
      selects[1].dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {
      const firstClass = recordRows[0].querySelector("select")!;
      firstClass.selectedIndex = 1;
      firstClass.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(intents.setClass).toHaveBeenCalledWith(2, "relation");
    for (const [title, mode] of [
      ["Replace source", "source"],
      ["Replace target", "target"],
    ]) {
      const button = [...container.querySelectorAll("button")].find(
        (item) => item.textContent === title,
      )!;
      await act(async () => button.click());
      expect(intents.setMode).toHaveBeenCalledWith(mode);
    }
    expect(container.textContent).not.toContain("Status");
    expect(
      [...container.querySelectorAll("button")].map(
        (button) => button.textContent,
      ),
    ).not.toContain("Delete relation");
    await act(async () => {
      selects[0].selectedIndex = 0;
      selects[0].dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(intents.select).toHaveBeenCalledWith(null);
    await act(async () => {
      const group = slice.relations[0];
      setState(
        createEditorStateFixture({
          layers: {
            relation: {
              ...slice,
              selectedId: "reverse",
              classId: 2,
              relations: [
                {
                  ...group,
                  id: "reverse",
                  source: group.target,
                  target: group.source,
                  sourceClassName: group.targetClassName,
                  targetClassName: group.sourceClassName,
                  records: group.records.map((item) => ({
                    ...item,
                    reversed: !item.reversed,
                  })),
                },
              ],
            },
          } as unknown as Partial<LayersDomainSlice>,
        }),
      );
    });
    expect(
      [...container.querySelectorAll("[data-relation-id]")].map((row) =>
        row.getAttribute("data-relation-id"),
      ),
    ).toEqual(["reverse"]);
    await act(async () => {
      setState(
        createEditorStateFixture({
          layers: {
            relation: {
              ...slice,
              version: 1,
              relations: [
                {
                  ...slice.relations[0],
                  records: slice.relations[0].records.slice(0, 1),
                },
              ],
            },
          } as unknown as Partial<LayersDomainSlice>,
        }),
      );
    });
    const directionLabel = [...container.querySelectorAll(".tp-lblv_l")].find(
      (label) => label.textContent === "Direction",
    )!;
    expect(directionLabel).toBeDefined();
    expect(directionLabel.closest(".tp-v-hidden")).toBeNull();
    expect(
      directionLabel.parentElement!.querySelectorAll("option"),
    ).toHaveLength(2);
    await act(async () => {
      setState(
        createEditorStateFixture({
          layers: {
            relation: { ...slice, version: 1, relations: [] },
          } as unknown as Partial<LayersDomainSlice>,
        }),
      );
    });
    for (const title of ["Replace source", "Replace target"]) {
      const button = [...container.querySelectorAll("button")].find(
        (item) => item.textContent === title,
      )!;
      expect(button.disabled).toBe(true);
    }
    await act(async () => {
      setState(
        createEditorStateFixture({
          layers: {
            relation: { ...slice, version: 2, mode: "create" },
          } as unknown as Partial<LayersDomainSlice>,
        }),
      );
    });
    const activeDraw = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "D",
    )!;
    expect(activeDraw.getAttribute("aria-pressed")).toBe("true");
    await act(async () => activeDraw.click());
    expect(intents.cancel).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    canvas.mockRestore();
  }
});

it("shows the available cycle order and current relation in native Tools controls", async () => {
  const relation = (id: string, visible: boolean) => ({
    id,
    displayId: id,
    records: [],
    name: id,
    source: "box a",
    target: "box b",
    sourceClassName: "Chair",
    targetClassName: "Table",
    visible,
  });
  const slice: RelationSlice = {
    version: 0,
    settings: defaultRelationSettings,
    active: true,
    cycling: true,
    hoveredId: null,
    disabled: false,
    loading: false,
    error: null,
    mode: "edit",
    classId: 1,
    selectedId: "first",
    firstEndpoint: null,
    classes: [],
    endpoints: [],
    relations: [
      relation("first", true),
      { ...relation("second", true), hidden: true },
      relation("outside", false),
    ],
  };
  const setIsolation = vi.fn();
  const select = vi.fn();
  const { store, setState } = createMockEditorStore(
    createEditorStateFixture({
      layers: { relation: slice } as unknown as Partial<LayersDomainSlice>,
    }),
  );
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <EditorStoreProvider store={store}>
          <EditorIntentsProvider
            intents={{
              ...noopEditorIntents,
              relation: { setIsolation, select },
            }}
          >
            <RelationTools />
          </EditorIntentsProvider>
        </EditorStoreProvider>,
      ),
    );
    expect(container.querySelectorAll(".tp-btnv button")).toHaveLength(0);
    const row = [...container.querySelectorAll(".tp-lblv")].find(
      (element) =>
        element.querySelector(".tp-lblv_l")?.textContent ===
        "Isolate current relation",
    )!;
    const checkbox = row.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!;
    expect(checkbox.checked).toBe(true);
    await act(async () => checkbox.click());
    expect(setIsolation).toHaveBeenLastCalledWith(false);
    await act(async () =>
      setState(
        createEditorStateFixture({
          layers: {
            relation: { ...slice, version: 4, cycling: false },
          } as unknown as Partial<LayersDomainSlice>,
        }),
      ),
    );
    expect(checkbox.checked).toBe(false);
    await act(async () => checkbox.click());
    expect(setIsolation).toHaveBeenLastCalledWith(true);
    await act(async () =>
      setState(
        createEditorStateFixture({
          layers: { relation: slice } as unknown as Partial<LayersDomainSlice>,
        }),
      ),
    );
    const rows = () => [
      ...container.querySelectorAll('[data-testid="relation-cycle-entry"]'),
    ];
    const cycleList = container.querySelector(
      '[aria-label="Relation cycle order"]',
    )!;
    expect(cycleList.closest(".tp-fldv")).not.toBeNull();
    expect(cycleList.closest(".tp-rotv")).not.toBeNull();
    expect(rows()).toHaveLength(2);
    expect(rows().map((row) => row.getAttribute("data-relation-id"))).toEqual([
      "first",
      "second",
    ]);
    expect(rows()[0].getAttribute("aria-current")).toBe("step");
    expect(rows()[1].getAttribute("aria-current")).toBeNull();
    expect(container.textContent).not.toContain("outside");
    expect(rows()[0].textContent).toContain("first");
    expect(rows()[0].classList.contains("scrolllist-item")).toBe(true);
    expect(rows()[0].classList.contains("selected")).toBe(true);
    expect(
      container
        .querySelector('[role="listbox"]')
        ?.classList.contains("scrolllist"),
    ).toBe(true);
    await act(async () => (rows()[1] as HTMLElement).click());
    expect(select).toHaveBeenCalledWith("second");
    await act(async () =>
      setState(
        createEditorStateFixture({
          layers: {
            relation: { ...slice, version: 1, selectedId: "second" },
          } as unknown as Partial<LayersDomainSlice>,
        }),
      ),
    );
    expect(rows()[1].getAttribute("aria-current")).toBe("step");
    await act(async () =>
      setState(
        createEditorStateFixture({
          layers: {
            relation: {
              ...slice,
              version: 3,
              selectedId: "entry-90",
              relations: Array.from({ length: 100 }, (_, index) =>
                relation(`entry-${index}`, true),
              ),
            },
          } as unknown as Partial<LayersDomainSlice>,
        }),
      ),
    );
    expect(rows().length).toBeLessThan(30);
    expect(
      rows()
        .find((row) => row.getAttribute("data-relation-id") === "entry-90")
        ?.getAttribute("aria-current"),
    ).toBe("step");
    await act(async () =>
      setState(
        createEditorStateFixture({
          layers: {
            relation: { ...slice, version: 2, cycling: false, relations: [] },
          } as unknown as Partial<LayersDomainSlice>,
        }),
      ),
    );
    expect(checkbox.disabled).toBe(true);

    expect(rows()).toHaveLength(0);
    expect(container.textContent).toContain("No relations in the current view");
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
