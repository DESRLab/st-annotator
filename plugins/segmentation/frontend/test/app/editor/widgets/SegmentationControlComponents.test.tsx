/* @vitest-environment jsdom */

import { act, default as React } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { EventDispatcher, Raycaster, Vector2, type Vector3 } from "three";
import { afterEach, describe, expect, it } from "vitest";

import { EditorIntentsProvider, EditorStoreProvider } from "sta/app/editor";
import {
  createEditorStateFixture,
  createMockEditorStore,
  noopEditorIntents,
} from "sta/app/editor/testing";
import type { LayersDomainSlice } from "sta/app/editor";
import type { FixtureLayerDescriptor } from "sta/app/editor/testing";

import { SelectionEditControlsView } from "../../../../app/editor/scene/controls/SelectionEditControl.react.tsx";
import { SelectionEditControls } from "../../../../app/editor/scene/controls/SelectionEditControl.tsx";
import type { SegmentationSlice } from "../../../../app/editor/scene/layer/SegmentationSlice";
import { BrushCurator } from "../../../../app/editor/scene/tools/parametric/Brush.tsx";
import type { EditMode } from "../../../../app/editor/scene/widgets/EditModePane.react.tsx";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

class FakeCurator extends EventDispatcher {
  enabled = false;
  isCreating = false;

  abort(): boolean {
    this.isCreating = false;
    return true;
  }

  queryPointsFromBuffer(points: readonly Vector3[]): readonly Vector3[] {
    return points;
  }

  queryPointTree(): readonly Vector3[] {
    return [];
  }
}

function createCanvasContext() {
  return {
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
    clearRect: () => {},
    lineJoin: "",
    lineCap: "",
    fillStyle: "",
  };
}

function createBrushCurator() {
  const canvas = document.createElement("canvas");
  Object.defineProperty(canvas, "getContext", {
    value: () => createCanvasContext(),
  });
  Object.defineProperty(canvas, "getBoundingClientRect", {
    value: () => ({
      width: 200,
      height: 100,
      left: 0,
      top: 0,
      right: 200,
      bottom: 100,
    }),
  });

  const raycaster = new Raycaster();
  const interactor = Object.assign(new EventDispatcher(), {
    raycaster,
    dispose: () => {},
  });
  const pointer = {
    createInteractor: () => interactor,
  };

  return new BrushCurator(
    pointer as unknown as ConstructorParameters<typeof BrushCurator>[0],
    raycaster,
    canvas,
    document.createElement("div"),
  );
}

function createCurators() {
  return {
    box: new FakeCurator(),
    polygon: new FakeCurator(),
    lasso: new FakeCurator(),
    brush: new FakeCurator(),
  };
}

async function flushReact() {
  await act(async () => {});
}

afterEach(() => {
  document.body.replaceChildren();
});

const SEGMENTATION_LAYER_DESCRIPTORS: readonly FixtureLayerDescriptor[] = [
  { key: "segmentation", name: "Segmentation", kind: "label" },
];

describe("Segmentation control components", () => {
  it("hosts SelectionEditControls edit mode pane with React", async () => {
    let controls!: SelectionEditControls;

    await act(async () => {
      controls = new SelectionEditControls(
        createCurators() as unknown as ConstructorParameters<
          typeof SelectionEditControls
        >[0],
      );
    });

    // The pane reads the edit mode from the snapshot and writes it back
    // through the intents; mirror the route wiring by routing the intent
    // to the controller and re-mapping on its change event.
    const createSlice = (
      editMode: SegmentationSlice["ui"]["editMode"],
    ): SegmentationSlice => ({
      ui: {
        action: "navigate",
        drawMode: "brush",
        editMode,
        disabled: false,
        selectedInstanceId: null,
        selectedSelectionId: null,
        autoInstances: true,
        drawSelectionActive: false,
        instanceInspectorDisabled: false,
        selectionInspectorDisabled: false,
      },
      instances: [],
      selections: [],
      classes: [],
      settings: {
        values: {
          useAssistant: false,
          timePathRange: 5,
          showTooltips: false,
          showPerceivedClass: false,
          showOcclusion: true,
          showDistinctiveness: false,
          showTimestampDiff: false,
          showTrackSegId: false,
          selectionTransparency: true,
          selectionOpacity: 0.5,
          brushDiameter: 40,
          brushHueStyle: 0.3,
          strokeColor: { r: 1, g: 0, b: 0 },
          hoveredSelectionColor: { r: 1, g: 0, b: 0 },
          selectedSelectionColor: { r: 1, g: 1, b: 0 },
        },
        disabled: false,
        isAssistantAvailable: false,
      },
    });
    const createState = (editMode: SegmentationSlice["ui"]["editMode"]) =>
      createEditorStateFixture({
        layerDescriptors: SEGMENTATION_LAYER_DESCRIPTORS,
        layers: {
          segmentation: createSlice(editMode),
        } as unknown as Partial<LayersDomainSlice>,
      });
    const { store, setState } = createMockEditorStore(createState("add"));
    controls.addEventListener("change", () =>
      setState(createState(controls.editMode)),
    );

    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <EditorStoreProvider store={store}>
          <EditorIntentsProvider
            intents={{
              ...noopEditorIntents,
              segmentation: {
                setAction: () => {},
                setDrawMode: () => {},
                setEditMode: (editMode: EditMode) =>
                  controls.onEditModeInputChange({
                    editMode,
                  }),
                setSettings: () => {},
              },
            }}
          >
            <SelectionEditControlsView />
          </EditorIntentsProvider>
        </EditorStoreProvider>,
      );
    });
    await flushReact();

    expect(host.textContent).toContain("Edit Mode");
    expect(host.textContent).toContain("Add");
    expect(host.textContent).toContain("Erase");
    expect(controls.editMode).toBe("add");

    await act(async () => {
      host.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1].click();
    });

    expect(controls.editMode).toBe("erase");

    await act(async () => root.unmount());
    await act(async () => controls.dispose());
    expect(host.innerHTML).toBe("");
  });

  it("renders BrushCurator cursor state through React", async () => {
    let brush!: BrushCurator;

    await act(async () => {
      brush = createBrushCurator();
    });
    document.body.append(brush.cursor);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const renderCursor = () =>
      root.render(createPortal(brush.cursorView, brush.cursor));
    // `cursor-change` is dispatched with `as never` by the curator, so it
    // sits outside the typed event map; subscribe through the plain
    // dispatcher surface instead.
    const brushEvents = brush as unknown as {
      addEventListener(type: string, listener: () => void): void;
      removeEventListener(type: string, listener: () => void): void;
    };
    brushEvents.addEventListener("cursor-change", renderCursor);
    await act(async () => renderCursor());
    await flushReact();

    let cursor = brush.cursor.querySelector<HTMLElement>(".brush");
    expect(cursor).not.toBeNull();
    expect(cursor?.hidden).toBe(true);
    expect(cursor?.style.width).toBe("40px");
    expect(cursor?.style.height).toBe("40px");

    await act(async () => {
      brush.enabled = true;
      brush.diameter = 64;
      brush.updateCursorPos(new Vector2(100, 80));
    });

    cursor = brush.cursor.querySelector<HTMLElement>(".brush");
    expect(cursor?.hidden).toBe(false);
    expect(cursor?.style.width).toBe("64px");
    expect(cursor?.style.height).toBe("64px");
    expect(cursor?.style.left).toBe("68px");
    expect(cursor?.style.top).toBe("48px");

    brushEvents.removeEventListener("cursor-change", renderCursor);
    await act(async () => root.unmount());
    await act(async () => brush.dispose());
    expect(brush.cursor.innerHTML).toBe("");
  });
});
