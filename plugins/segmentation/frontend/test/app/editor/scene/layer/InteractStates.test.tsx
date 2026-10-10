import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { Timestamp } from "sta/common";

import { DrawSelectionState } from "../../../../../app/editor/scene/layer/DrawSelectionState";
import { NavigationState } from "../../../../../app/editor/scene/layer/NavigationState";
import { SelectSelectionState } from "../../../../../app/editor/scene/layer/SelectSelectionState";

import {
  createInteractContextFixture,
  EDITOR_CONFIG,
  createLabelSelectionFixture,
  createLoadedIndex,
  createSelectionFixture,
} from "./interactContextFixture";

const press = (state: { keydownHandler: any }, keyCombo: string) =>
  state.keydownHandler.handle({ keyCombo });

const GESTURE_POINTS = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1)];

describe("segmentation interaction states", () => {
  it("navigation exposes readonly-safe controls and toggles select/draw actions", () => {
    const context = { toggleSelect: vi.fn(), toggleDraw: vi.fn() } as any;
    const state = new NavigationState(context);

    expect(state.getUsage(false).selectionController).toEqual({
      enabled: false,
    });
    expect(state.getUsage(false).labelInspector).toEqual({ enabled: true });
    expect(state.getUsage(true).selectionController).toBeUndefined();
    expect(state.getUsage(true).labelInspector).toBeUndefined();
    press(state, "s");
    expect(context.toggleSelect).toHaveBeenCalledOnce();
    expect(context.toggleDraw).not.toHaveBeenCalled();
    press(state, "d");
    expect(context.toggleDraw).toHaveBeenCalledOnce();
    state.dispose();
  });

  it("selection state enters edit for a valid target and escape cancels", async () => {
    const context = {
      transitionEditSelection: vi.fn(),
      transitionNavigate: vi.fn(),
      currentState: null,
    } as any;
    const state = new SelectSelectionState(context);
    context.currentState = state;
    const usage = state.getUsage(false);

    expect(usage.selectionSelector?.hover).toBe(true);
    const picked = { id: "selection-1" };
    usage.selectionSelector?.select?.({ object: picked } as any);
    expect(context.transitionEditSelection).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(context.transitionEditSelection).toHaveBeenCalledWith({
      selectionId: "selection-1",
      promptedData: null,
      selection: picked,
    });
    press(state, "escape");
    expect(context.transitionNavigate).toHaveBeenCalledOnce();
  });
});

const pointCloudUtils = {
  whenEncoded: vi.fn().mockResolvedValue(true),
  buffer: { getCoords: () => [] },
};

describe("segmentation gesture cancellation and stale callbacks across navigation", () => {
  it("cancels an in-progress draw when navigation starts before the gesture finishes", () => {
    const {
      context,
      dataView,
      selectionController,
      setPointCloudUtils,
      applyLayerGate,
    } = createInteractContextFixture();
    setPointCloudUtils(pointCloudUtils);
    dataView.data = createLoadedIndex();
    applyLayerGate(true);
    context.setAction("draw");
    expect(selectionController.startGesture("box")).toBe(true);
    expect(selectionController.isCuratorDrawing).toBe(true);

    // Navigation starts before the gesture finishes: the labels begin
    // (re)loading, the layer gates the context, and the draft is aborted.
    dataView.data = null;
    applyLayerGate(true);
    expect(selectionController.abort).toHaveBeenCalled();
    expect(selectionController.isCuratorDrawing).toBe(false);

    // The old gesture "completes" late: the disabled controller refuses
    // to finish. Neither the old nor the new frame receives a label.
    expect(selectionController.finishGesture(GESTURE_POINTS)).toBe(false);
    expect(dataView.addLabelSelection).not.toHaveBeenCalled();
    expect(dataView.addLabelSelectionLocalOnly).not.toHaveBeenCalled();

    // The new frame becomes ready; a new gesture starts clean.
    dataView.data = createLoadedIndex();
    applyLayerGate(true);
    context.setAction("draw");
    expect(selectionController.startGesture("box")).toBe(true);
    expect(selectionController.isCuratorDrawing).toBe(true);
  });

  it("does not start a gesture when navigation begins before the first pointer event", () => {
    const {
      context,
      dataView,
      selectionController,
      setPointCloudUtils,
      applyLayerGate,
    } = createInteractContextFixture();
    setPointCloudUtils(pointCloudUtils);
    dataView.data = createLoadedIndex();
    applyLayerGate(true);
    context.setAction("draw");

    dataView.data = null;
    applyLayerGate(true);

    expect(selectionController.startGesture("box")).toBe(false);
    expect(selectionController.finishGesture(GESTURE_POINTS)).toBe(false);
    expect(dataView.addLabelSelectionLocalOnly).not.toHaveBeenCalled();
    expect(dataView.addLabelSelection).not.toHaveBeenCalled();
  });

  it("does not apply a stale pointer selection after the frame changed", async () => {
    const {
      context,
      dataView,
      selectionSelector,
      sceneContext,
      setPointCloudUtils,
      applyLayerGate,
    } = createInteractContextFixture();
    const staleSelection = createSelectionFixture({
      id: "shared-id",
      timestamp: new Timestamp("2026-08-15T11:00:00Z"),
    });
    setPointCloudUtils(pointCloudUtils);
    dataView.selections.set("shared-id", staleSelection);
    dataView.data = createLoadedIndex();
    applyLayerGate(true);
    context.setAction("select");

    // The selected selection lives outside the current frame, so entering
    // edit navigates first, hold that navigation in flight.
    sceneContext.currentFrame.containsTimestamp = () => false;
    let resolveNavigation!: () => void;
    sceneContext.displayFrameFromCurrent = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveNavigation = resolve;
        }),
    );
    selectionSelector.dispatchEvent({
      type: "selectin",
      object: staleSelection,
    } as any);
    await Promise.resolve();
    expect(sceneContext.displayFrameFromCurrent).toHaveBeenCalled();

    // While the navigation is in flight, the labels unload and the new
    // frame loads; it happens to contain a different selection reusing
    // the id.
    dataView.data = null;
    applyLayerGate(true);
    expect(context.selectedSelectionId).toBeNull();
    dataView.selections.clear();
    dataView.selections.set(
      "shared-id",
      createSelectionFixture({ id: "shared-id", entityId: "instance-b" }),
    );
    dataView.data = createLoadedIndex();
    applyLayerGate(true);
    expect(context.selectedSelectionId).toBeNull();

    resolveNavigation();
    // Let the stale continuation run to completion.
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The stale callback is a no-op: the coincidentally reused id of the
    // new frame is neither selected nor edited.
    expect(context.selectedSelectionId).toBeNull();
    expect(context.currentState).toBeInstanceOf(NavigationState);
  });

  it("rejects a selection callback captured on a previous frame when its id is reused", async () => {
    const { context, dataView, setPointCloudUtils, applyLayerGate } =
      createInteractContextFixture();
    const staleSelection = createSelectionFixture({ id: "shared-id" });
    setPointCloudUtils(pointCloudUtils);
    dataView.selections.set("shared-id", staleSelection);
    dataView.data = createLoadedIndex();
    applyLayerGate(true);
    context.setAction("select");

    // Capture the callback a pointer selection on this frame would use.
    const capturedSelect =
      context.currentState!.getUsage(false).selectionSelector!.select!;

    // The app navigates: the labels are replaced, and the new frame
    // happens to contain a different selection reusing the id.
    dataView.data = null;
    applyLayerGate(true);
    dataView.selections.clear();
    dataView.selections.set(
      "shared-id",
      createSelectionFixture({ id: "shared-id", entityId: "instance-b" }),
    );
    dataView.data = createLoadedIndex();
    applyLayerGate(true);
    expect(context.selectedSelectionId).toBeNull();

    // The captured callback fires late: it must not select or edit the
    // new frame's selection that merely reuses the id.
    capturedSelect({ object: staleSelection });
    expect(context.selectedSelectionId).toBeNull();
    expect(context.currentState).toBeInstanceOf(NavigationState);
  });

  it("cancels the gesture and reroutes input when the layer is disabled or switched mid-gesture", () => {
    const {
      context,
      dataView,
      mainWindow,
      selectionController,
      selectionSelector,
      setPointCloudUtils,
      applyLayerGate,
    } = createInteractContextFixture();
    setPointCloudUtils(pointCloudUtils);
    dataView.data = createLoadedIndex();
    applyLayerGate(true);
    context.setAction("draw");
    expect(selectionController.startGesture("box")).toBe(true);
    expect(selectionController.isCuratorDrawing).toBe(true);
    expect(mainWindow.dom.classList.contains("cursor-crosshair")).toBe(true);

    // The layer is disabled or another layer is activated: the gate closes.
    applyLayerGate(false);
    expect(context.disabled).toBe(true);
    expect(selectionController.abort).toHaveBeenCalled();
    expect(selectionController.isCuratorDrawing).toBe(false);
    expect(selectionController.curators.box.enabled).toBe(false);
    // The draw cursor is released and the components are disabled.
    expect(mainWindow.dom.classList.contains("cursor-crosshair")).toBe(false);
    expect(selectionSelector.hoverEnabled).toBe(false);
    expect(selectionSelector.selectEnabled).toBe(false);

    // Input after the switch commits nothing for the abandoned gesture.
    expect(selectionController.finishGesture(GESTURE_POINTS)).toBe(false);
    expect(dataView.addLabelSelection).not.toHaveBeenCalled();

    // Re-activation routes input to the enabled layer again.
    applyLayerGate(true);
    expect(context.disabled).toBe(false);
    context.setAction("draw");
    expect(selectionController.startGesture("box")).toBe(true);
    expect(selectionController.isCuratorDrawing).toBe(true);
  });
});

describe("segmentation double-create from duplicate input routes", () => {
  function makeReadyDrawFixture() {
    const fixture = createInteractContextFixture();
    fixture.setPointCloudUtils(pointCloudUtils);
    fixture.dataView.data = createLoadedIndex();
    fixture.applyLayerGate(true);
    fixture.context.setAction("draw");
    return fixture;
  }

  it.each([["the hotkey arrives first"], ["the canvas release arrives first"]])(
    "commits exactly one selection when %s in the same tick",
    async (winner) => {
      const { context, dataView, selectionController, key } =
        makeReadyDrawFixture();
      selectionController.queriedPoints = GESTURE_POINTS;
      expect(selectionController.startGesture("box")).toBe(true);

      // The pointer release and the `g` hotkey both finish the same
      // gesture; the curator synchronously leaves the creating state on
      // the first route, so the second route cannot commit again.
      if (winner.startsWith("the hotkey")) {
        key("g");
        expect(selectionController.finishGesture(GESTURE_POINTS)).toBe(false);
      } else {
        expect(selectionController.finishGesture(GESTURE_POINTS)).toBe(true);
        key("g");
      }

      // The draft cleanup runs last in the commit path; waiting on it
      // lets the whole commit (including the edit transition) settle.
      await vi.waitFor(() =>
        expect(dataView.deleteLabelSelectionLocalOnly).toHaveBeenCalledOnce(),
      );
      expect(dataView.addLabelSelection).toHaveBeenCalledOnce();
      expect(dataView.addLabelInstance).toHaveBeenCalledOnce();
      expect(dataView.addLabelSelectionLocalOnly).toHaveBeenCalledOnce();
      expect(dataView.selections.size).toBe(1);
      expect(context.selectedSelectionId).toBe(
        [...dataView.selections.keys()][0],
      );
    },
  );

  it("commits exactly one selection when the gesture completion is invoked twice", async () => {
    const { context, dataView, selectionController } = makeReadyDrawFixture();
    expect(selectionController.startGesture("box")).toBe(true);

    // A duplicated completion of the same gesture: the controller has
    // already left the drawing state when the second call arrives.
    expect(selectionController.finishGesture(GESTURE_POINTS)).toBe(true);
    expect(selectionController.finishGesture(GESTURE_POINTS)).toBe(false);

    await vi.waitFor(() =>
      expect(dataView.deleteLabelSelectionLocalOnly).toHaveBeenCalledOnce(),
    );
    expect(dataView.addLabelSelection).toHaveBeenCalledOnce();
    expect(dataView.addLabelInstance).toHaveBeenCalledOnce();
    expect(dataView.selections.size).toBe(1);
    expect(context.selectedSelectionId).toBe(
      [...dataView.selections.keys()][0],
    );
  });

  it("allocates exactly one selection when the gesture start fires twice", async () => {
    const { dataView, selectionController } = makeReadyDrawFixture();
    expect(selectionController.startGesture("box")).toBe(true);
    // A second pointer-down resumes the same gesture rather than
    // starting a second draft.
    expect(selectionController.startGesture("box")).toBe(true);

    expect(selectionController.finishGesture(GESTURE_POINTS)).toBe(true);
    await vi.waitFor(() =>
      expect(dataView.deleteLabelSelectionLocalOnly).toHaveBeenCalledOnce(),
    );
    expect(dataView.addLabelSelection).toHaveBeenCalledOnce();
    expect(dataView.addLabelSelectionLocalOnly).toHaveBeenCalledOnce();
    expect(dataView.addLabelInstance).toHaveBeenCalledOnce();
    expect(dataView.selections.size).toBe(1);
  });

  it("commits at most one assisted selection when two prompt completions race the pending prediction", async () => {
    const {
      context,
      dataView,
      assistedSelectionController,
      setPointCloudUtils,
      applyLayerGate,
    } = createInteractContextFixture();

    // The assistant's commit path is asynchronous (encode check, then
    // prediction, then registration). Prompt completions that arrive
    // while the first commit is still in flight must not start a
    // second create for the same prompt sequence.
    const assistedPointCloudUtils = {
      whenEncoded: vi.fn().mockResolvedValue(true),
      buffer: { getCoords: () => [] },
      maskLogits: null as unknown,
      filterMaskLogitsByThreshold: vi.fn(() => [...GESTURE_POINTS]),
      pointSize: 1,
    };
    dataView.predictMask.mockResolvedValue([1, 1]);
    setPointCloudUtils(assistedPointCloudUtils);
    dataView.data = createLoadedIndex();
    applyLayerGate(true);
    context.setAction("draw");

    const promptData = {
      points: [new THREE.Vector3(0, 0, 0)],
      labels: [1],
    };
    assistedSelectionController.dispatchEvent({
      type: "create",
      promptData,
      maskThreshold: 0.5,
    } as any);
    assistedSelectionController.dispatchEvent({
      type: "create",
      promptData,
      maskThreshold: 0.5,
    } as any);

    await vi.waitFor(() =>
      expect(dataView.addLabelSelection).toHaveBeenCalledOnce(),
    );
    // Let a racing duplicate commit (if any) settle before counting.
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Policy: latest-request-wins. Both completions may start a
    // prediction, but the superseded one is discarded before it commits,
    // so exactly one instance and one selection are ever registered.
    expect(dataView.predictMask).toHaveBeenCalled();
    expect(dataView.addLabelInstance).toHaveBeenCalledOnce();
    expect(dataView.addLabelSelection).toHaveBeenCalledOnce();
    expect(dataView.addLabelSelectionLocalOnly).toHaveBeenCalledOnce();
    expect(dataView.deleteLabelSelectionLocalOnly).toHaveBeenCalledOnce();
    expect(dataView.selections.size).toBe(1);
    expect(context.selectedSelectionId).toBe(
      [...dataView.selections.keys()][0],
    );
  });
});

describe("segmentation pointer/keyboard conflict during selection edit (plan item 22)", () => {
  type EditFixture = Awaited<ReturnType<typeof makeEditingFixture>>;

  /**
   * Ready layer with a committed selection being edited and an edit
   * stroke in progress: the pointer is down on the selection's draw
   * curator, so the stroke has not yet checkpointed an update.
   */
  async function makeEditingFixture() {
    const fixture = createInteractContextFixture();
    const {
      context,
      dataView,
      mainWindow,
      selectionSelector,
      selectionController,
      setPointCloudUtils,
      applyLayerGate,
    } = fixture;
    const selection = createLabelSelectionFixture({ id: "selection-1" });
    setPointCloudUtils(pointCloudUtils);
    dataView.selections.set("selection-1", selection);
    dataView.data = createLoadedIndex();
    applyLayerGate(true);
    context.setAction("select");
    selectionSelector.dispatchEvent({
      type: "selectin",
      object: selection,
    } as any);
    await Promise.resolve();

    expect(context.currentState).toBeInstanceOf(DrawSelectionState);
    expect(context.selectedSelectionId).toBe("selection-1");
    expect(selectionController.hasSelection).toBe(true);
    expect(selectionController.isEditing).toBe(true);

    // The edit stroke begins; the camera controls stay suspended for
    // the whole edit state of this plugin.
    expect(selectionController.startGesture("box")).toBe(true);
    expect(selectionController.isCuratorDrawing).toBe(true);
    expect(selectionController.isCreating).toBe(false);
    expect(mainWindow.enableCameraControls).toBe(false);

    // Reset the controller's call history: the setup transitions
    // issue no-op abort/deselect calls which the conflict assertions
    // must not count.
    selectionController.select.mockClear();
    selectionController.deselect.mockClear();
    selectionController.abort.mockClear();

    return { ...fixture, selection };
  }

  /** The number of branch operations the view has committed. */
  function countHistoryOps({ dataView }: EditFixture): number {
    return (
      dataView.updateLabelPointSelection.mock.calls.length +
      dataView.deleteLabelSelection.mock.calls.length +
      dataView.addLabelSelection.mock.calls.length
    );
  }

  /** Shared postconditions every conflict must satisfy after settling. */
  function expectGestureSettled(fixture: EditFixture): void {
    const { dataView, selectionController } = fixture;
    // At most one history operation for the whole transition.
    expect(countHistoryOps(fixture)).toBeLessThanOrEqual(1);
    // The stroke is over and the edit controls released; a late
    // pointer-up (the released pointer capture) cannot checkpoint.
    expect(selectionController.isCuratorDrawing).toBe(false);
    expect(selectionController.finishGesture(GESTURE_POINTS)).toBe(false);
    expect(countHistoryOps(fixture)).toBeLessThanOrEqual(1);
    // No orphan draft: the abandoned stroke never became a create.
    expect(dataView.addLabelSelection).not.toHaveBeenCalled();
    expect(dataView.addLabelSelectionLocalOnly).not.toHaveBeenCalled();
  }

  it.each(["add", "erase"] as const)(
    "commits the newly drawn coordinates for a non-assisted %s stroke",
    async (mode) => {
      const fixture = await makeEditingFixture();
      const newPoints = [
        new THREE.Vector3(7, 8, 9),
        new THREE.Vector3(10, 11, 12),
      ];
      (fixture.selectionController as { editMode: string }).editMode = mode;

      expect(fixture.selectionController.finishGesture(newPoints)).toBe(true);
      await Promise.resolve();

      expect(fixture.dataView.updateLabelPointSelection).toHaveBeenCalledWith(
        fixture.selection,
        mode,
        newPoints.map((point) =>
          EDITOR_CONFIG.coordinateFormat.toDatabaseCoords(point),
        ),
      );
    },
  );

  it.each([
    [
      "escape",
      (fixture: EditFixture) => {
        const {
          context,
          dataView,
          mainWindow,
          selectionController,
          selectionSelector,
          key,
        } = fixture;

        key("escape");

        // Precedence: Escape aborts the stroke AND leaves the edit
        // state (segmentation navigates away; unlike bbox/vector it
        // does not keep the selection selected).
        expect(selectionController.abort).toHaveBeenCalled();
        expect(selectionController.isCuratorDrawing).toBe(false);
        expect(selectionController.hasSelection).toBe(false);
        expect(dataView.updateLabelPointSelection).not.toHaveBeenCalled();
        expect(dataView.deleteLabelSelection).not.toHaveBeenCalled();
        expect(countHistoryOps(fixture)).toBe(0);
        expect(context.currentState).toBeInstanceOf(NavigationState);
        expect(selectionSelector.selectedObj).toBeNull();
        // DIVERGENCE from bbox/vector: their edit states clear the
        // inspector selection when they dispose; segmentation keeps
        // the last inspected id until the next data load or edit
        // transition. It is display state only, no control retains
        // the object, so nothing can mutate it.
        expect(context.selectedSelectionId).toBe("selection-1");
        // Camera controls are restored with the navigation state.
        expect(mainWindow.enableCameraControls).toBe(true);
      },
    ],
    [
      "delete",
      (fixture: EditFixture) => {
        const {
          context,
          dataView,
          mainWindow,
          selectionController,
          selectionSelector,
          key,
        } = fixture;

        key("delete");

        // Precedence: Delete wins over the stroke, the selected label
        // is deleted (exactly one operation) and the stroke is
        // cancelled through the state teardown, without an update of
        // its own.
        expect(dataView.deleteLabelSelection).toHaveBeenCalledOnce();
        expect(dataView.deleteLabelSelection).toHaveBeenCalledWith(
          fixture.selection,
        );
        expect(dataView.updateLabelPointSelection).not.toHaveBeenCalled();
        expect(countHistoryOps(fixture)).toBe(1);
        expect(selectionController.isCuratorDrawing).toBe(false);
        expect(selectionController.hasSelection).toBe(false);
        expect(selectionController.abort).toHaveBeenCalled();
        // The edit controls and selection are released; the state is
        // back to navigation.
        expect(selectionSelector.selectedObj).toBeNull();
        expect(context.currentState).toBeInstanceOf(NavigationState);
        // Same divergence as the escape case: the inspector keeps the
        // (now deleted) id until the next data load or edit
        // transition; the view resolves it to `null` once the delete
        // applies, so no control can mutate the deleted label.
        expect(context.selectedSelectionId).toBe("selection-1");
        expect(mainWindow.enableCameraControls).toBe(true);
      },
    ],
    [
      "undo",
      (fixture: EditFixture) => {
        const { context, dataView, selectionController } = fixture;

        // The plugin state machine binds no undo route: undo belongs to
        // the labelset editor above the layer. During a stroke the
        // combo is unhandled here and must not disturb the gesture.
        expect(
          context.currentState!.keydownHandler.handle({
            keyCombo: "ctrl + z",
          } as any),
        ).toBe(false);
        expect(selectionController.isCuratorDrawing).toBe(true);
        expect(countHistoryOps(fixture)).toBe(0);

        // Completing the stroke afterwards commits exactly one
        // operation: an UPDATE of the selected selection.
        expect(selectionController.finishGesture(GESTURE_POINTS)).toBe(true);
        expect(dataView.updateLabelPointSelection).toHaveBeenCalledOnce();
        expect(dataView.updateLabelPointSelection).toHaveBeenCalledWith(
          fixture.selection,
          "add",
          expect.anything(),
        );
        expect(countHistoryOps(fixture)).toBe(1);
      },
    ],
    [
      "layer switch/disable",
      (fixture: EditFixture) => {
        const {
          context,
          dataView,
          mainWindow,
          selectionController,
          selectionSelector,
          applyLayerGate,
        } = fixture;

        applyLayerGate(false);

        // The closed gate cancels the stroke without committing it.
        expect(context.disabled).toBe(true);
        expect(selectionController.abort).toHaveBeenCalled();
        expect(selectionController.isCuratorDrawing).toBe(false);
        expect(selectionController.hasSelection).toBe(false);
        expect(selectionController.disabled).toBe(true);
        expect(dataView.updateLabelPointSelection).not.toHaveBeenCalled();
        expect(dataView.deleteLabelSelection).not.toHaveBeenCalled();
        expect(countHistoryOps(fixture)).toBe(0);
        // No orphan gizmo/preview: the curators are disabled and the
        // selection is released.
        expect(selectionController.curators.box.enabled).toBe(false);
        expect(selectionSelector.selectedObj).toBeNull();
        expect(selectionSelector.hoverEnabled).toBe(false);
        expect(selectionSelector.selectEnabled).toBe(false);
        expect(mainWindow.dom.classList.contains("cursor-crosshair")).toBe(
          false,
        );
        // An inactive layer deliberately stops driving the shared
        // camera flag; the flag recovers on re-activation.
        expect(mainWindow.enableCameraControls).toBe(false);

        // Re-activation routes fresh input to the enabled layer only;
        // the abandoned stroke still cannot commit, and the camera
        // flag recovers with the active layer's usage.
        applyLayerGate(true);
        expect(context.disabled).toBe(false);
        expect(mainWindow.enableCameraControls).toBe(true);
        expect(selectionController.finishGesture(GESTURE_POINTS)).toBe(false);
        context.setAction("draw");
        expect(selectionController.startGesture("box")).toBe(true);
        selectionController.abort();
        expect(selectionController.isCuratorDrawing).toBe(false);
        expect(countHistoryOps(fixture)).toBe(0);
      },
    ],
    [
      "frame-next",
      (fixture: EditFixture) => {
        const { context, dataView, selectionController, applyLayerGate } =
          fixture;

        // The next frame begins loading: the labels unload and the
        // layer closes the gate.
        dataView.data = null;
        applyLayerGate(true);

        expect(context.disabled).toBe(true);
        expect(selectionController.abort).toHaveBeenCalled();
        expect(selectionController.isCuratorDrawing).toBe(false);
        expect(selectionController.hasSelection).toBe(false);
        expect(dataView.updateLabelPointSelection).not.toHaveBeenCalled();
        expect(dataView.deleteLabelSelection).not.toHaveBeenCalled();
        expect(countHistoryOps(fixture)).toBe(0);
        // The inspector id persists across the cancellation (see the
        // escape case), but must not survive into the new frame.
        expect(context.selectedSelectionId).toBe("selection-1");

        // The next frame arrives (empty): the labels are swapped
        // between the view's load events, which the inspector listens
        // to. Neither frame received a label from the abandoned stroke.
        dataView.selections.clear();
        dataView.data = createLoadedIndex();
        dataView.dispatchEvent({ type: "afterload" });
        applyLayerGate(true);
        expect(context.disabled).toBe(false);
        expect(dataView.selections.size).toBe(0);
        expect(countHistoryOps(fixture)).toBe(0);
        expect(context.selectedSelectionId).toBeNull();
        expect(selectionController.finishGesture(GESTURE_POINTS)).toBe(false);

        // A new gesture on the new frame starts clean...
        context.setAction("draw");
        expect(selectionController.startGesture("box")).toBe(true);
        // ...and is the only gesture in flight (released here so the
        // shared postconditions see a settled layer).
        selectionController.abort();
        expect(selectionController.isCuratorDrawing).toBe(false);
      },
    ],
  ])(
    "has deterministic precedence when %s arrives during an edit stroke",
    async (_name, scenario) => {
      const fixture = await makeEditingFixture();
      scenario(fixture);
      expectGestureSettled(fixture);
    },
  );
});
