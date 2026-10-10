import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { Timestamp } from "sta/common";

import { DrawVectorState } from "../../../../../app/editor/scene/layer/DrawVectorState";
import { EditState } from "../../../../../app/editor/scene/layer/EditVectorState";
import { SelectVectorState } from "../../../../../app/editor/scene/layer/SelectVectorState";

import {
  createInteractContextFixture,
  createLabelVectorFixture,
  createLoadedIndex,
  createVectorFixture,
} from "./interactContextFixture";

const press = (state: { keydownHandler: any }, keyCombo: string) =>
  state.keydownHandler.handle({ keyCombo });

function makeContext() {
  const vector = { id: "vector-1", vectorType: "polyline" };
  const creator = {
    enabled: true,
    isCreating: false,
    vectorType: "polyline",
    abort: vi.fn(),
    finish: vi.fn(),
  };
  const context = {
    drawMode: "polyline",
    activatedVectorCreator: creator,
    vectorInspector: {
      selectedId: null,
      get selectedVector() {
        return this.selectedId == null ? null : vector;
      },
    },
    vectorSelector: { selectedObj: null },
    vectorTransformer: {
      isTransforming: false,
      select: vi.fn(),
      deselect: vi.fn(),
      abort: vi.fn(),
    },
    vectorMonitor: { vector: null },
    vectorClipboard: { select: vi.fn(), deselect: vi.fn() },
    dataView: { addLabelVector: vi.fn() },
    sceneContext: {
      currentFrame: { getTimestampCenter: () => "current-time" },
    },
    transitionNavigate: vi.fn(),
    transitionEditVector: vi.fn(),
  };
  return { context: context as any, creator, vector };
}

describe("vector interaction states", () => {
  it("draw cancellation and finish route only to the active creator and disposal aborts it", () => {
    const { context, creator } = makeContext();
    const state = new DrawVectorState(context);
    expect(state.getUsage(true).vectorCreator).toBeUndefined();

    creator.isCreating = true;
    press(state, "g");
    press(state, "escape");
    expect(creator.finish).toHaveBeenCalledOnce();
    expect(creator.abort).toHaveBeenCalledOnce();
    state.dispose();
    expect(creator.abort).toHaveBeenCalledTimes(2);
  });

  it("select state transitions only after a target is selected and escape cancels", async () => {
    const { context } = makeContext();
    const state = new SelectVectorState(context);
    const usage = state.getUsage(false);
    expect(usage.vectorSelector?.hover).toBe(true);
    const picked = { id: "picked" };
    await usage.vectorSelector?.select?.({ object: picked } as any);
    expect(context.transitionEditVector).toHaveBeenCalledWith({
      vectorId: "picked",
      vector: picked,
    });
    press(state, "escape");
    expect(context.transitionNavigate).toHaveBeenCalledOnce();
  });

  it("edit state selects controls, aborts an active transform, and cleans selection on exit", () => {
    const { context, vector } = makeContext();
    const state = new EditState(context, { vectorId: "vector-1" });
    expect(context.vectorSelector.selectedObj).toBe(vector);
    expect(context.vectorTransformer.select).toHaveBeenCalledWith(vector);
    expect(context.vectorClipboard.select).toHaveBeenCalledWith(vector);
    expect(state.getUsage(true).vectorTransformer).toBeUndefined();

    context.vectorTransformer.isTransforming = true;
    press(state, "escape");
    expect(context.vectorTransformer.abort).toHaveBeenCalledOnce();
    state.dispose();
    expect(context.vectorSelector.selectedObj).toBeNull();
    expect(context.vectorTransformer.deselect).toHaveBeenCalledOnce();
    expect(context.vectorClipboard.deselect).toHaveBeenCalledOnce();
  });

  it("routes a clipboard snapshot through creation at the current frame and selects the result", async () => {
    const { context } = makeContext();
    const pastedVector = { id: "pasted-vector" };
    context.dataView.addLabelVector.mockResolvedValue(pastedVector);
    const state = new EditState(context, { vectorId: null });
    const clipboard = {
      vectorType: "LineString",
      vertices: [],
      gtClassId: null,
    };
    await state
      .getUsage(false)
      .labelClipboard?.pasteVector?.({ clipboard } as any);
    expect(context.dataView.addLabelVector).toHaveBeenCalledWith({
      ...clipboard,
      timestamp: "current-time",
    });
    expect(context.transitionEditVector).toHaveBeenCalledWith({
      vectorId: "pasted-vector",
      vector: pastedVector,
    });
  });
});

describe("vector gesture cancellation and stale callbacks across navigation", () => {
  it("cancels an in-progress draw when navigation starts before the gesture finishes", () => {
    const { context, dataView, vectorCreators, setSourceData, applyLayerGate } =
      createInteractContextFixture();
    const creator = vectorCreators.polyline;
    setSourceData({});
    dataView.data = createLoadedIndex();
    applyLayerGate(true);
    context.setAction("draw");
    creator.addVertex(new THREE.Vector3(0, 0, 0));
    expect(creator.isCreating).toBe(true);

    // Navigation starts before the gesture finishes: the labels begin
    // (re)loading, the layer gates the context, and the draft is aborted.
    dataView.data = null;
    applyLayerGate(true);
    expect(creator.abort).toHaveBeenCalled();
    expect(creator.isCreating).toBe(false);
    expect(creator.enabled).toBe(false);

    // The old gesture "completes" late: the disabled creator refuses to
    // finish or accept further vertices. Neither the old nor the new
    // frame receives a label.
    expect(creator.finish()).toBe(false);
    expect(creator.addVertex(new THREE.Vector3(1, 1, 1))).toBe(false);
    expect(dataView.addLabelVector).not.toHaveBeenCalled();
    expect(dataView.addLabelVectorLocalOnly).not.toHaveBeenCalled();

    // The new frame becomes ready; a new gesture starts clean.
    dataView.data = createLoadedIndex();
    applyLayerGate(true);
    context.setAction("draw");
    expect(creator.addVertex(new THREE.Vector3(2, 2, 2))).toBe(true);
    expect(creator.isCreating).toBe(true);
  });

  it("does not start a gesture when navigation begins before the first pointer event", () => {
    const { context, dataView, vectorCreators, setSourceData, applyLayerGate } =
      createInteractContextFixture();
    const creator = vectorCreators.polyline;
    setSourceData({});
    dataView.data = createLoadedIndex();
    applyLayerGate(true);
    context.setAction("draw");

    dataView.data = null;
    applyLayerGate(true);

    expect(creator.addVertex(new THREE.Vector3(0, 0, 0))).toBe(false);
    expect(creator.finish()).toBe(false);
    expect(dataView.addLabelVectorLocalOnly).not.toHaveBeenCalled();
    expect(dataView.addLabelVector).not.toHaveBeenCalled();
  });

  it("does not apply a stale pointer selection after the frame changed", async () => {
    const {
      context,
      dataView,
      vectorSelector,
      sceneContext,
      setSourceData,
      applyLayerGate,
    } = createInteractContextFixture();
    const staleVector = createVectorFixture({
      id: "shared-id",
      timestamp: new Timestamp("2026-08-15T11:00:00Z"),
    });
    setSourceData({});
    dataView.vectors.set("shared-id", staleVector);
    dataView.data = createLoadedIndex();
    applyLayerGate(true);
    context.setAction("select");

    // The selected vector lives outside the current frame, so entering
    // edit navigates first, hold that navigation in flight.
    sceneContext.currentFrame.containsTimestamp = () => false;
    let resolveNavigation!: () => void;
    sceneContext.displayFrameFromCurrent = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveNavigation = resolve;
        }),
    );
    vectorSelector.dispatchEvent({
      type: "selectin",
      object: staleVector,
    } as any);
    expect(sceneContext.displayFrameFromCurrent).toHaveBeenCalled();

    // While the navigation is in flight, the labels unload and the new
    // frame loads; it happens to contain a different vector reusing the id.
    dataView.data = null;
    applyLayerGate(true);
    expect(context.selectedVectorId).toBeNull();
    dataView.vectors.clear();
    dataView.vectors.set(
      "shared-id",
      createVectorFixture({ id: "shared-id", vectorType: "polygon" }),
    );
    dataView.data = createLoadedIndex();
    applyLayerGate(true);
    expect(context.selectedVectorId).toBeNull();

    resolveNavigation();
    // Let the stale continuation run to completion.
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The stale callback is a no-op: the coincidentally reused id of the
    // new frame is neither selected nor edited.
    expect(context.selectedVectorId).toBeNull();
    expect(context.currentState).toBeInstanceOf(EditState);
    expect(
      (context.currentState as InstanceType<typeof EditState>).params.vectorId,
    ).toBeNull();
  });

  it("rejects a selection callback captured on a previous frame when its id is reused", async () => {
    const { context, dataView, setSourceData, applyLayerGate } =
      createInteractContextFixture();
    const staleVector = createVectorFixture({ id: "shared-id" });
    setSourceData({});
    dataView.vectors.set("shared-id", staleVector);
    dataView.data = createLoadedIndex();
    applyLayerGate(true);
    context.setAction("select");

    // Capture the callback a pointer selection on this frame would use.
    const capturedSelect =
      context.currentState!.getUsage(false).vectorSelector!.select!;

    // The app navigates: the labels are replaced, and the new frame
    // happens to contain a different vector reusing the id.
    dataView.data = null;
    applyLayerGate(true);
    dataView.vectors.clear();
    dataView.vectors.set(
      "shared-id",
      createVectorFixture({ id: "shared-id", vectorType: "polygon" }),
    );
    dataView.data = createLoadedIndex();
    applyLayerGate(true);
    expect(context.selectedVectorId).toBeNull();

    // The captured callback fires late: it must not select or edit the
    // new frame's vector that merely reuses the id.
    await capturedSelect({ object: staleVector });
    expect(context.selectedVectorId).toBeNull();
    expect(context.currentState).toBeInstanceOf(EditState);
    expect(
      (context.currentState as InstanceType<typeof EditState>).params.vectorId,
    ).toBeNull();
  });

  it("cancels the gesture and reroutes input when the layer is disabled or switched mid-gesture", () => {
    const {
      context,
      dataView,
      mainWindow,
      vectorCreators,
      vectorSelector,
      setSourceData,
      applyLayerGate,
      key,
    } = createInteractContextFixture();
    const creator = vectorCreators.polyline;
    setSourceData({});
    dataView.data = createLoadedIndex();
    applyLayerGate(true);
    context.setAction("draw");
    creator.addVertex(new THREE.Vector3(0, 0, 0));
    expect(creator.isCreating).toBe(true);
    expect(mainWindow.dom.classList.contains("cursor-crosshair")).toBe(true);

    // The layer is disabled or another layer is activated: the gate closes.
    applyLayerGate(false);
    expect(context.disabled).toBe(true);
    expect(creator.abort).toHaveBeenCalled();
    expect(creator.isCreating).toBe(false);
    // The draw cursor is released and the components are disabled.
    expect(mainWindow.dom.classList.contains("cursor-crosshair")).toBe(false);
    expect(vectorSelector.hoverEnabled).toBe(false);
    expect(vectorSelector.selectEnabled).toBe(false);

    // Input after the switch commits nothing for the abandoned gesture.
    expect(creator.finish()).toBe(false);
    expect(dataView.addLabelVector).not.toHaveBeenCalled();

    // Re-activation routes input to the enabled layer again.
    applyLayerGate(true);
    expect(context.disabled).toBe(false);
    context.setAction("draw");
    expect(creator.addVertex(new THREE.Vector3(1, 1, 1))).toBe(true);
    key("escape");
  });
});

describe("vector double-create from duplicate input routes", () => {
  function makeReadyDrawFixture() {
    const fixture = createInteractContextFixture();
    fixture.setSourceData({});
    fixture.dataView.data = createLoadedIndex();
    fixture.applyLayerGate(true);
    fixture.context.setAction("draw");
    return fixture;
  }

  type FinishRoute = (
    creator: { finish(): boolean },
    key: (keyCombo: string) => void,
  ) => void;
  const finishViaCanvas: FinishRoute = (creator) => {
    creator.finish();
  };
  const finishViaHotkey: FinishRoute = (_creator, key) => {
    key("g");
  };

  it.each([
    ["the canvas finish arrives first", finishViaCanvas, finishViaHotkey],
    ["the finish hotkey arrives first", finishViaHotkey, finishViaCanvas],
    ["the canvas finish is invoked twice", finishViaCanvas, finishViaCanvas],
    ["the finish hotkey is dispatched twice", finishViaHotkey, finishViaHotkey],
  ])(
    "commits exactly one vector when %s in the same tick",
    async (_description, first, second) => {
      const { context, dataView, vectorCreators, key } = makeReadyDrawFixture();
      const creator = vectorCreators.polyline;
      creator.addVertex(new THREE.Vector3(0, 0, 0));
      creator.addVertex(new THREE.Vector3(1, 1, 1));

      // Both completion routes target the same in-progress gesture; the
      // creator synchronously leaves the creating state on the first one,
      // so the duplicate cannot commit a second vector.
      first(creator, key);
      second(creator, key);

      expect(creator.finish).toHaveBeenCalledTimes(2);
      expect(creator.finish.mock.results[1].value).toBe(false);
      // The draft cleanup runs last in the commit path; waiting on it
      // lets the whole commit (including the edit transition) settle.
      await vi.waitFor(() =>
        expect(dataView.deleteLabelVectorLocalOnly).toHaveBeenCalledOnce(),
      );
      expect(dataView.addLabelVector).toHaveBeenCalledOnce();
      expect(dataView.addLabelVectorLocalOnly).toHaveBeenCalledOnce();
      expect(dataView.vectors.size).toBe(1);
      expect(context.selectedVectorId).toBe([...dataView.vectors.keys()][0]);
    },
  );

  it("commits distinct labels for two separate gestures", async () => {
    const { context, dataView, vectorCreators, key } = makeReadyDrawFixture();
    const creator = vectorCreators.polyline;

    creator.addVertex(new THREE.Vector3(0, 0, 0));
    creator.addVertex(new THREE.Vector3(1, 1, 1));
    creator.finish();
    await vi.waitFor(() =>
      expect(dataView.deleteLabelVectorLocalOnly).toHaveBeenCalledOnce(),
    );

    // Committing transitions to the edit state; drawing again is a new,
    // separate gesture and commits its own vector. Deduplication is
    // scoped to one gesture, not to the layer.
    expect(context.currentState).toBeInstanceOf(EditState);
    context.setAction("draw");

    creator.addVertex(new THREE.Vector3(2, 2, 2));
    creator.addVertex(new THREE.Vector3(3, 3, 3));
    key("g");
    await vi.waitFor(() =>
      expect(dataView.deleteLabelVectorLocalOnly).toHaveBeenCalledTimes(2),
    );
    expect(dataView.addLabelVector).toHaveBeenCalledTimes(2);
    expect(dataView.vectors.size).toBe(2);
    expect(dataView.addLabelVectorLocalOnly).toHaveBeenCalledTimes(2);
  });
});

describe("vector pointer/keyboard conflict during transform (plan item 22)", () => {
  type TransformFixture = ReturnType<typeof makeTransformingFixture>;

  /**
   * Ready layer with a committed vector selected for editing and a gizmo
   * drag in progress: the pointer is down on a vertex handle, so the
   * camera controls are suspended and a checkpoint has not yet fired.
   */
  function makeTransformingFixture() {
    const fixture = createInteractContextFixture();
    const {
      context,
      dataView,
      mainWindow,
      vectorSelector,
      vectorTransformer,
      setSourceData,
      applyLayerGate,
    } = fixture;
    const vector = createLabelVectorFixture({ id: "vector-1" });
    setSourceData({});
    dataView.vectors.set("vector-1", vector);
    dataView.data = createLoadedIndex();
    applyLayerGate(true);
    context.setAction("select");
    vectorSelector.dispatchEvent({
      type: "selectin",
      object: vector,
    } as any);

    expect(context.currentState).toBeInstanceOf(EditState);
    expect(context.selectedVectorId).toBe("vector-1");
    expect(vectorTransformer.hasSelection).toBe(true);
    expect(vectorTransformer.disabled).toBe(false);

    // The gizmo drag begins; the camera controls are suspended for it.
    expect(vectorTransformer.beginTransform()).toBe(true);
    expect(mainWindow.enableCameraControls).toBe(false);

    // Reset the transformer's call history: the setup transitions issue
    // no-op abort/deselect calls (usage refresh disables the gizmo
    // briefly), which the conflict assertions must not count.
    vectorTransformer.select.mockClear();
    vectorTransformer.deselect.mockClear();
    vectorTransformer.abort.mockClear();

    return { ...fixture, vector };
  }

  /** The number of branch operations the view has committed. */
  function countHistoryOps({ dataView }: TransformFixture): number {
    return (
      dataView.updateLabelVectorGeometry.mock.calls.length +
      dataView.deleteLabelVector.mock.calls.length +
      dataView.addLabelVector.mock.calls.length
    );
  }

  /** Shared postconditions every conflict must satisfy after settling. */
  function expectGestureSettled(fixture: TransformFixture): void {
    const { dataView, vectorTransformer, vectorCreators } = fixture;
    // At most one history operation for the whole transition.
    expect(countHistoryOps(fixture)).toBeLessThanOrEqual(1);
    // The drag is over and its gizmo released; a late pointer-up
    // (the released pointer capture) cannot checkpoint anything.
    expect(vectorTransformer.isTransforming).toBe(false);
    expect(vectorTransformer.endTransform()).toBe(false);
    expect(countHistoryOps(fixture)).toBeLessThanOrEqual(1);
    // The abandoned drag never morphed into a draw gesture.
    for (const creator of Object.values(vectorCreators)) {
      expect(creator.isCreating).toBe(false);
    }
    expect(dataView.addLabelVector).not.toHaveBeenCalled();
  }

  it.each([
    [
      "escape",
      (fixture: TransformFixture) => {
        const { context, dataView, mainWindow, vectorTransformer, key } =
          fixture;

        key("escape");

        // Precedence: Escape aborts the drag and KEEPS the edit state;
        // it does not navigate and does not commit anything.
        expect(vectorTransformer.abort).toHaveBeenCalledOnce();
        expect(vectorTransformer.isTransforming).toBe(false);
        expect(vectorTransformer.hasSelection).toBe(true);
        expect(dataView.updateLabelVectorGeometry).not.toHaveBeenCalled();
        expect(dataView.deleteLabelVector).not.toHaveBeenCalled();
        expect(countHistoryOps(fixture)).toBe(0);
        expect(context.currentState).toBeInstanceOf(EditState);
        expect(
          (context.currentState as InstanceType<typeof EditState>).params
            .vectorId,
        ).toBe("vector-1");
        expect(context.selectedVectorId).toBe("vector-1");
        // Camera controls are released with the drag.
        expect(mainWindow.enableCameraControls).toBe(true);
      },
    ],
    [
      "delete",
      (fixture: TransformFixture) => {
        const {
          context,
          dataView,
          mainWindow,
          vectorTransformer,
          vectorSelector,
          key,
        } = fixture;

        key("delete");

        // Precedence: Delete wins over the drag, the selected label is
        // deleted (exactly one operation) and the drag is cancelled
        // through the state teardown, without a checkpoint of its own.
        expect(dataView.deleteLabelVector).toHaveBeenCalledOnce();
        expect(dataView.deleteLabelVector).toHaveBeenCalledWith(fixture.vector);
        expect(dataView.updateLabelVectorGeometry).not.toHaveBeenCalled();
        expect(countHistoryOps(fixture)).toBe(1);
        expect(vectorTransformer.isTransforming).toBe(false);
        expect(vectorTransformer.hasSelection).toBe(false);
        expect(vectorTransformer.abort).toHaveBeenCalled();
        // The gizmo, selection and monitor are released; the state is
        // back to editing nothing.
        expect(context.selectedVectorId).toBeNull();
        expect(vectorSelector.selectedObj).toBeNull();
        expect(context.vectorMonitor.vector).toBeNull();
        expect(context.currentState).toBeInstanceOf(EditState);
        expect(
          (context.currentState as InstanceType<typeof EditState>).params
            .vectorId,
        ).toBeNull();
        expect(mainWindow.enableCameraControls).toBe(true);
      },
    ],
    [
      "undo",
      (fixture: TransformFixture) => {
        const { context, dataView, vectorTransformer } = fixture;

        // The plugin state machine binds no undo route: undo belongs to
        // the labelset editor above the layer. During a drag the combo
        // is unhandled here and must not disturb the gesture.
        expect(
          context.currentState!.keydownHandler.handle({
            keyCombo: "ctrl + z",
          } as any),
        ).toBe(false);
        expect(vectorTransformer.isTransforming).toBe(true);
        expect(countHistoryOps(fixture)).toBe(0);

        // Completing the drag afterwards commits exactly one operation.
        expect(vectorTransformer.endTransform()).toBe(true);
        expect(dataView.updateLabelVectorGeometry).toHaveBeenCalledOnce();
        expect(dataView.updateLabelVectorGeometry).toHaveBeenCalledWith(
          fixture.vector,
          "vertex",
          "LineString",
          expect.anything(),
          expect.anything(),
        );
        expect(countHistoryOps(fixture)).toBe(1);
      },
    ],
    [
      "layer switch/disable",
      (fixture: TransformFixture) => {
        const {
          context,
          dataView,
          mainWindow,
          vectorTransformer,
          vectorSelector,
          vectorCreators,
          applyLayerGate,
          key,
        } = fixture;
        const creator = vectorCreators.polyline;

        applyLayerGate(false);

        // The closed gate cancels the drag without committing it.
        expect(context.disabled).toBe(true);
        expect(vectorTransformer.abort).toHaveBeenCalled();
        expect(vectorTransformer.isTransforming).toBe(false);
        expect(vectorTransformer.hasSelection).toBe(false);
        expect(vectorTransformer.disabled).toBe(true);
        expect(dataView.updateLabelVectorGeometry).not.toHaveBeenCalled();
        expect(dataView.deleteLabelVector).not.toHaveBeenCalled();
        expect(countHistoryOps(fixture)).toBe(0);
        // No orphan gizmo/selection: the components are disabled and
        // the cursor is released.
        expect(vectorSelector.selectedObj).toBeNull();
        expect(vectorSelector.hoverEnabled).toBe(false);
        expect(vectorSelector.selectEnabled).toBe(false);
        expect(mainWindow.dom.classList.contains("cursor-all-scroll")).toBe(
          false,
        );
        // An inactive layer deliberately stops driving the shared
        // camera flag; the flag recovers on re-activation.
        expect(mainWindow.enableCameraControls).toBe(false);

        // Re-activation routes fresh input to the enabled layer only;
        // the abandoned drag still cannot commit, and the camera flag
        // recovers with the active layer's usage.
        applyLayerGate(true);
        expect(context.disabled).toBe(false);
        expect(mainWindow.enableCameraControls).toBe(true);
        expect(vectorTransformer.endTransform()).toBe(false);
        context.setAction("draw");
        expect(creator.addVertex(new THREE.Vector3(0, 0, 0))).toBe(true);
        key("escape");
        expect(creator.isCreating).toBe(false);
        expect(countHistoryOps(fixture)).toBe(0);
      },
    ],
    [
      "frame-next",
      (fixture: TransformFixture) => {
        const {
          context,
          dataView,
          vectorTransformer,
          vectorCreators,
          applyLayerGate,
          key,
        } = fixture;
        const creator = vectorCreators.polyline;

        // The next frame begins loading: the labels unload and the
        // layer closes the gate.
        dataView.data = null;
        applyLayerGate(true);

        expect(context.disabled).toBe(true);
        expect(vectorTransformer.abort).toHaveBeenCalled();
        expect(vectorTransformer.isTransforming).toBe(false);
        expect(vectorTransformer.hasSelection).toBe(false);
        expect(dataView.updateLabelVectorGeometry).not.toHaveBeenCalled();
        expect(dataView.deleteLabelVector).not.toHaveBeenCalled();
        expect(countHistoryOps(fixture)).toBe(0);
        expect(context.selectedVectorId).toBeNull();

        // The next frame arrives (empty); neither frame received a
        // label from the abandoned drag.
        dataView.vectors.clear();
        dataView.data = createLoadedIndex();
        applyLayerGate(true);
        expect(context.disabled).toBe(false);
        expect(dataView.vectors.size).toBe(0);
        expect(countHistoryOps(fixture)).toBe(0);
        expect(vectorTransformer.endTransform()).toBe(false);

        // A new gesture on the new frame starts clean...
        context.setAction("draw");
        expect(creator.addVertex(new THREE.Vector3(0, 0, 0))).toBe(true);
        // ...and is the only gesture in flight (released here so the
        // shared postconditions see a settled layer).
        key("escape");
        expect(creator.isCreating).toBe(false);
      },
    ],
  ])(
    "has deterministic precedence when %s arrives during a transform drag",
    (_name, scenario) => {
      const fixture = makeTransformingFixture();
      scenario(fixture);
      expectGestureSettled(fixture);
    },
  );
});
