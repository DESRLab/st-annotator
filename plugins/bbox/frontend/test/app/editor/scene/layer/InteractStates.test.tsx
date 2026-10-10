import { describe, expect, it, vi } from "vitest";

import { Timestamp } from "sta/common";

import { DrawBoxState } from "../../../../../app/editor/scene/layer/DrawBoxState";
import { EditState } from "../../../../../app/editor/scene/layer/EditState";
import { SelectBoxState } from "../../../../../app/editor/scene/layer/SelectBoxState";

import {
  createInteractContextFixture,
  createLabelBoxFixture,
  createLoadedIndex,
} from "./interactContextFixture";

function key(state: { keydownHandler: any }, keyCombo: string): void {
  state.keydownHandler.handle({ keyCombo });
}

function makeContext() {
  const box = { id: "box-1" };
  const currentTime = new Date("2026-08-15T12:00:00Z");
  const context = {
    drawMode: "corner2corner",
    boxCreator: {
      isCreating: false,
      isSizeFixed: false,
      abort: vi.fn(),
      finish: vi.fn(),
      begin: vi.fn(),
    },
    boxSelector: {
      isHoveringObj: false,
      hoveredObj: null,
      selectedObj: null,
    },
    boxTransformer: {
      isTransforming: false,
      select: vi.fn(),
      deselect: vi.fn(),
      abort: vi.fn(),
    },
    boxClipboard: {
      select: vi.fn(),
      deselect: vi.fn(),
      copy: vi.fn(),
      paste: vi.fn(),
    },
    boxMonitor: { box: null },
    boxInspector: {
      selectedId: null,
      get selectedBox() {
        return this.selectedId == null ? null : box;
      },
      getBoxParams: () => ({ boxType: "cuboid" }),
    },
    trackInspector: { selectedId: null },
    transitionNavigate: vi.fn(),
    transitionEditBox: vi.fn(),
    transitionEdit: vi.fn(),
    dataView: {
      addLabelBox: vi.fn(),
      addLabelBoxLocalOnly: vi.fn((params) => params),
    },
    sceneContext: {
      currentFrame: { getTimestampCenter: () => currentTime },
    },
  };
  return { context: context as any, box, currentTime };
}

describe("bbox interaction states", () => {
  it("select state exposes selection controls, selects valid targets, and cancels", async () => {
    const { context } = makeContext();
    const state = new SelectBoxState(context);
    const usage = state.getUsage(false);

    expect(usage.mainWindow).toEqual({
      cursorClass: "crosshair",
      controlCamera: true,
    });
    expect(usage.boxSelector?.hover).toBe(true);
    const picked = { id: "picked" };
    usage.boxSelector?.select?.({ object: picked } as any);
    expect(context.transitionEditBox).toHaveBeenCalledWith({
      boxId: "picked",
      box: picked,
    });

    key(state, "escape");
    expect(context.transitionNavigate).toHaveBeenCalledOnce();
    state.dispose();
  });

  it("draw state disables mutation when readonly and aborts an in-progress gesture on escape/disposal", () => {
    const { context } = makeContext();
    const state = new DrawBoxState(context);

    expect(state.getUsage(true).boxCreator).toBeUndefined();
    expect(state.getUsage(true).mainWindow?.cursorClass).toBe("not-allowed");
    context.boxCreator.isCreating = true;
    key(state, "escape");
    expect(context.boxCreator.abort).toHaveBeenCalledOnce();
    state.dispose();
    expect(context.boxCreator.abort).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["an earlier box", new Date("2026-08-15T11:59:00Z"), "point2center"],
    ["a box without a timestamp", null, "point2center"],
    ["an equal-time box", new Date("2026-08-15T12:00:00Z"), "center2point"],
    ["a later box", new Date("2026-08-15T12:01:00Z"), "center2point"],
  ] as const)(
    "uses the temporal continuation origin for %s",
    (_description, timestamp, expectedMode) => {
      const { context } = makeContext();
      const hoveredBox = {
        id: "hovered-box",
        timestamp,
        center: { x: 1, y: 2, z: 3 },
        angle: 0.25,
        size: { x: 4, y: 5, z: 6 },
        entityId: "track-1",
      };
      context.boxSelector.hoveredObj = hoveredBox;
      context.boxSelector.isHoveringObj = true;
      const state = new DrawBoxState(context);

      state.getUsage(false).mainWindow?.pointerdown?.({ button: 0 } as any);

      expect(context.dataView.addLabelBoxLocalOnly).toHaveBeenCalledWith(
        expect.objectContaining({
          center: hoveredBox.center,
          angle: hoveredBox.angle,
          size: hoveredBox.size,
          entityId: hoveredBox.entityId,
        }),
      );
      expect(context.boxCreator.begin).toHaveBeenCalledWith(
        expectedMode,
        expect.anything(),
      );
      expect(state.getUsage(false).mainWindow?.cursorClass).toBe("copy");
    },
  );

  it("edit state binds and cleans up selected controls and aborts a lost transform", () => {
    const { context, box } = makeContext();
    const state = new EditState(context, {
      trackId: "track-1",
      boxId: "box-1",
    });

    expect(context.boxSelector.selectedObj).toBe(box);
    expect(context.boxTransformer.select).toHaveBeenCalledWith(box);
    expect(context.boxClipboard.select).toHaveBeenCalledWith(box);
    expect(state.getUsage(true).boxTransformer).toBeUndefined();

    context.boxTransformer.isTransforming = true;
    key(state, "escape");
    expect(context.boxTransformer.abort).toHaveBeenCalledOnce();

    state.dispose();
    expect(context.boxSelector.selectedObj).toBeNull();
    expect(context.boxTransformer.deselect).toHaveBeenCalledOnce();
    expect(context.boxClipboard.deselect).toHaveBeenCalledOnce();
  });

  it("routes a clipboard snapshot through creation at the current frame and selects the result", async () => {
    const { context, currentTime } = makeContext();
    const pastedBox = { id: "pasted-box" };
    context.dataView.addLabelBox.mockResolvedValue(pastedBox);
    const state = new EditState(context, { trackId: null, boxId: null });
    const clipboard = {
      boxType: "cuboid",
      center: {},
      size: {},
      entityId: null,
    };
    state.getUsage(false).labelClipboard?.pasteBox?.({ clipboard } as any);
    // The paste handler is fire-and-forget; let its promise chain run to completion.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(context.dataView.addLabelBox).toHaveBeenCalledWith({
      ...clipboard,
      timestamp: currentTime,
    });
    expect(context.transitionEditBox).toHaveBeenCalledWith({
      boxId: "pasted-box",
      box: pastedBox,
    });
  });
});

describe("bbox gesture cancellation and stale callbacks across navigation", () => {
  it("cancels an in-progress draw when navigation starts before pointer-up", () => {
    const {
      context,
      dataView,
      boxCreator,
      setSourceData,
      applyLayerGate,
      pointerdown,
      pointerup,
    } = createInteractContextFixture();
    setSourceData({});
    dataView.data = createLoadedIndex();
    applyLayerGate(true);
    context.setAction("draw");
    pointerdown();
    expect(boxCreator.isCreating).toBe(true);

    // Navigation starts before the final pointer event: the labels begin
    // (re)loading, the layer gates the context, and the draft is aborted.
    dataView.data = null;
    applyLayerGate(true);
    expect(boxCreator.abort).toHaveBeenCalled();
    expect(boxCreator.isCreating).toBe(false);
    // The aborted draft takes its placeholder track with it.
    expect(dataView.localTracks.size).toBe(0);

    // The old gesture "completes" late: the aborted creator refuses to
    // finish, and a late pointer-up reaches no draw handler. Neither the
    // old nor the new frame receives a label.
    expect(boxCreator.end(true)).toBe(false);
    pointerup();
    expect(dataView.addLabelBox).not.toHaveBeenCalled();
    expect(dataView.addLabelTrack).not.toHaveBeenCalled();

    // The new frame becomes ready; a new gesture starts clean.
    dataView.data = createLoadedIndex();
    applyLayerGate(true);
    context.setAction("draw");
    pointerdown();
    expect(boxCreator.begin).toHaveBeenCalledTimes(2);
    expect(dataView.addLabelBoxLocalOnly).toHaveBeenCalledTimes(2);
  });

  it("does not start a gesture when navigation begins before the first pointer event", () => {
    const {
      context,
      dataView,
      boxCreator,
      setSourceData,
      applyLayerGate,
      pointerdown,
      pointerup,
    } = createInteractContextFixture();
    setSourceData({});
    dataView.data = createLoadedIndex();
    applyLayerGate(true);
    context.setAction("draw");

    dataView.data = null;
    applyLayerGate(true);

    pointerdown();
    pointerup();
    expect(boxCreator.begin).not.toHaveBeenCalled();
    expect(dataView.addLabelBoxLocalOnly).not.toHaveBeenCalled();
    expect(dataView.addLabelBox).not.toHaveBeenCalled();
  });

  it("does not apply a stale pointer selection after the frame changed", async () => {
    const {
      context,
      dataView,
      boxSelector,
      sceneContext,
      setSourceData,
      applyLayerGate,
    } = createInteractContextFixture();
    const staleBox = createLabelBoxFixture({
      id: "shared-id",
      timestamp: new Timestamp("2026-08-15T11:00:00Z"),
    });
    setSourceData({});
    dataView.boxes.set("shared-id", staleBox);
    dataView.data = createLoadedIndex();
    applyLayerGate(true);
    context.setAction("select");

    // The selected box lives outside the current frame, so entering edit
    // navigates first, hold that navigation in flight.
    sceneContext.currentFrame.containsTimestamp = () => false;
    let resolveNavigation!: () => void;
    sceneContext.displayFrameFromCurrent = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveNavigation = resolve;
        }),
    );
    boxSelector.dispatchEvent({
      type: "selectin",
      object: staleBox,
    } as any);
    expect(sceneContext.displayFrameFromCurrent).toHaveBeenCalled();

    // While the navigation is in flight, the labels unload and the new
    // frame loads; it happens to contain a different box reusing the id.
    dataView.data = null;
    applyLayerGate(true);
    expect(context.selectedBoxId).toBeNull();
    dataView.boxes.clear();
    dataView.boxes.set(
      "shared-id",
      createLabelBoxFixture({ id: "shared-id", entityId: "track-b" }),
    );
    dataView.data = createLoadedIndex();
    applyLayerGate(true);
    expect(context.selectedBoxId).toBeNull();

    resolveNavigation();
    // Let the stale continuation run to completion.
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The stale callback is a no-op: the coincidentally reused id of the
    // new frame is neither selected nor edited.
    expect(context.selectedBoxId).toBeNull();
    expect(context.currentState).toBeInstanceOf(EditState);
    expect(
      (context.currentState as InstanceType<typeof EditState>).params.boxId,
    ).toBeNull();
  });

  it("rejects a selection callback captured on a previous frame when its id is reused", async () => {
    const { context, dataView, setSourceData, applyLayerGate } =
      createInteractContextFixture();
    const staleBox = createLabelBoxFixture({ id: "shared-id" });
    setSourceData({});
    dataView.boxes.set("shared-id", staleBox);
    dataView.data = createLoadedIndex();
    applyLayerGate(true);
    context.setAction("select");

    // Capture the callback a pointer selection on this frame would use.
    const capturedSelect =
      context.currentState!.getUsage(false).boxSelector!.select!;

    // The app navigates: the labels are replaced, and the new frame
    // happens to contain a different box reusing the id.
    dataView.data = null;
    applyLayerGate(true);
    dataView.boxes.clear();
    dataView.boxes.set(
      "shared-id",
      createLabelBoxFixture({ id: "shared-id", entityId: "track-b" }),
    );
    dataView.data = createLoadedIndex();
    applyLayerGate(true);
    expect(context.selectedBoxId).toBeNull();

    // The captured callback fires late: it must not select or edit the
    // new frame's box that merely reuses the id.
    capturedSelect({ object: staleBox });
    // The select handler is fire-and-forget; let its promise chain run to completion.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(context.selectedBoxId).toBeNull();
    expect(context.currentState).toBeInstanceOf(EditState);
    expect(
      (context.currentState as InstanceType<typeof EditState>).params.boxId,
    ).toBeNull();
  });

  it("cancels the gesture and reroutes input when the layer is disabled or switched mid-gesture", () => {
    const fixture = createInteractContextFixture();
    const {
      context,
      dataView,
      mainWindow,
      boxCreator,
      boxSelector,
      setSourceData,
      applyLayerGate,
      pointerdown,
      pointerup,
      key,
    } = fixture;
    setSourceData({});
    dataView.data = createLoadedIndex();
    applyLayerGate(true);
    context.setAction("draw");
    pointerdown();
    expect(boxCreator.isCreating).toBe(true);
    expect(mainWindow.dom.classList.contains("cursor-cell")).toBe(true);

    // The layer is disabled or another layer is activated: the gate closes.
    applyLayerGate(false);
    expect(context.disabled).toBe(true);
    expect(boxCreator.abort).toHaveBeenCalled();
    expect(boxCreator.isCreating).toBe(false);
    // The aborted draft takes its placeholder track with it.
    expect(dataView.localTracks.size).toBe(0);
    // The draw cursor is released and the components are disabled.
    expect(mainWindow.dom.classList.contains("cursor-cell")).toBe(false);
    expect(boxSelector.hoverEnabled).toBe(false);
    expect(boxSelector.selectEnabled).toBe(false);

    // Input after the switch commits nothing for the abandoned gesture.
    pointerup();
    expect(boxCreator.end).not.toHaveBeenCalled();
    expect(dataView.addLabelBox).not.toHaveBeenCalled();

    // Re-activation routes input to the enabled layer again.
    applyLayerGate(true);
    expect(context.disabled).toBe(false);
    context.setAction("draw");
    pointerdown();
    expect(boxCreator.begin).toHaveBeenCalledTimes(2);
    key("escape");
  });
});

describe("bbox double-create from duplicate input routes", () => {
  function makeReadyDrawFixture() {
    const fixture = createInteractContextFixture();
    fixture.setSourceData({});
    fixture.dataView.data = createLoadedIndex();
    fixture.applyLayerGate(true);
    fixture.context.setAction("draw");
    return fixture;
  }

  it("commits exactly one box when the finish hotkey and the pointer release land in the same tick", async () => {
    const { context, dataView, boxCreator, pointerdown, pointerup, key } =
      makeReadyDrawFixture();
    pointerdown();

    // The finish hotkey and the canvas release race in the same tick.
    // The creator synchronously leaves the creating state when the
    // first route ends the gesture, so the second route is a no-op and
    // exactly one operation is committed.
    key("g");
    pointerup();

    expect(boxCreator.end).toHaveBeenCalledTimes(2);
    expect(boxCreator.end.mock.results[1].value).toBe(false);
    // The draft cleanup runs last in the commit path; waiting on it
    // lets the whole commit (including the edit transition) settle.
    await vi.waitFor(() =>
      expect(dataView.deleteLabelBoxLocalOnly).toHaveBeenCalledOnce(),
    );
    expect(dataView.addLabelBox).toHaveBeenCalledOnce();
    expect(dataView.addLabelTrack).toHaveBeenCalledOnce();
    expect(dataView.boxes.size).toBe(1);

    // Exactly one draft was allocated and cleaned up, and the
    // registered box, not a duplicate, is being edited.
    expect(dataView.addLabelBoxLocalOnly).toHaveBeenCalledOnce();
    expect(dataView.deleteLabelTrackLocalOnly).toHaveBeenCalledOnce();
    expect(context.currentState).toBeInstanceOf(EditState);
    expect(context.selectedBoxId).toBe([...dataView.boxes.keys()][0]);
  });

  it("lets the pointer release win the same-tick race without a follow-up commit from the hotkey", async () => {
    const { dataView, boxCreator, pointerdown, pointerup, key } =
      makeReadyDrawFixture();
    pointerdown();

    // The pointer release arrives first and ends the gesture. The
    // undragged draft is rejected as too small, and the racing hotkey
    // finds no gesture in progress; either way at most one commit can
    // result, here zero.
    pointerup();
    key("g");

    expect(boxCreator.end).toHaveBeenCalledTimes(2);
    expect(boxCreator.end.mock.results[1].value).toBe(false);
    // Let the rejected commit path settle.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(dataView.addLabelBox).not.toHaveBeenCalled();
    expect(dataView.addLabelTrack).not.toHaveBeenCalled();
    expect(dataView.boxes.size).toBe(0);
    // The single rejected draft was disposed; the hotkey allocated none.
    expect(dataView.addLabelBoxLocalOnly).toHaveBeenCalledOnce();
    expect(dataView.deleteLabelBoxLocalOnly).toHaveBeenCalledOnce();
    expect(boxCreator.isCreating).toBe(false);
  });

  it("commits exactly one box when the finish entry point is invoked twice", async () => {
    const { context, dataView, boxCreator, pointerdown, key } =
      makeReadyDrawFixture();
    pointerdown();

    // A double dispatch of the finish keybind: the creator leaves the
    // creating state synchronously, so the second invocation is a
    // no-op and the box is committed exactly once.
    key("g");
    key("g");

    expect(boxCreator.end).toHaveBeenCalledTimes(2);
    expect(boxCreator.end.mock.results[1].value).toBe(false);
    await vi.waitFor(() =>
      expect(dataView.deleteLabelBoxLocalOnly).toHaveBeenCalledOnce(),
    );
    expect(dataView.addLabelBox).toHaveBeenCalledOnce();
    expect(dataView.addLabelTrack).toHaveBeenCalledOnce();
    expect(dataView.boxes.size).toBe(1);
    expect(context.selectedBoxId).toBe([...dataView.boxes.keys()][0]);
  });

  it("allocates exactly one draft when pointer-down fires twice for the same gesture", async () => {
    const { dataView, boxCreator, pointerdown, key } = makeReadyDrawFixture();

    pointerdown();
    // A second pointer-down while the gesture is active (e.g. a second
    // finger) must not allocate a second local draft.
    pointerdown();

    expect(boxCreator.begin).toHaveBeenCalledOnce();
    expect(dataView.addLabelBoxLocalOnly).toHaveBeenCalledOnce();
    expect(dataView.addLabelTrackLocalOnly).toHaveBeenCalledOnce();

    // The single gesture commits exactly once and cleans up its draft.
    key("g");
    await vi.waitFor(() =>
      expect(dataView.deleteLabelBoxLocalOnly).toHaveBeenCalledOnce(),
    );
    expect(dataView.addLabelBox).toHaveBeenCalledOnce();
    expect(dataView.boxes.size).toBe(1);
    expect(dataView.addLabelBoxLocalOnly).toHaveBeenCalledOnce();
    expect(dataView.deleteLabelTrackLocalOnly).toHaveBeenCalledOnce();
    expect(dataView.localTracks.size).toBe(0);
  });

  it("never commits more than one box for a double-click of the create gesture", async () => {
    const { dataView, boxCreator, pointerdown, pointerup } =
      makeReadyDrawFixture();

    // Two rapid clicks are two separate gestures; each completes the
    // draft at epsilon size and is rejected, so no label results, and
    // crucially no gesture ever commits twice.
    pointerdown();
    pointerup();
    pointerdown();
    pointerup();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(boxCreator.begin).toHaveBeenCalledTimes(2);
    expect(dataView.addLabelBox).not.toHaveBeenCalled();
    expect(dataView.addLabelTrack).not.toHaveBeenCalled();
    expect(dataView.boxes.size).toBe(0);
    expect(dataView.addLabelBoxLocalOnly).toHaveBeenCalledTimes(2);
    expect(dataView.deleteLabelBoxLocalOnly).toHaveBeenCalledTimes(2);
    // Each rejected draft also disposed its placeholder track.
    expect(dataView.deleteLabelTrackLocalOnly).toHaveBeenCalledTimes(2);
    expect(dataView.localTracks.size).toBe(0);
    expect(boxCreator.isCreating).toBe(false);
  });
});

describe("bbox draft track lifecycle (ghost-track leak)", () => {
  function makeReadyDrawFixture() {
    const fixture = createInteractContextFixture();
    fixture.setSourceData({});
    fixture.dataView.data = createLoadedIndex();
    fixture.applyLayerGate(true);
    fixture.context.setAction("draw");
    return fixture;
  }

  it("discards the placeholder track when a misclick is rejected as too small", async () => {
    const { dataView, pointerdown, pointerup } = makeReadyDrawFixture();

    pointerdown();
    expect(dataView.addLabelTrackLocalOnly).toHaveBeenCalledOnce();
    expect(dataView.localTracks.size).toBe(1);

    // A misclick (release without dragging) completes the draft at
    // epsilon size and is rejected: no label results, and the draft's
    // placeholder track must not outlive the draft as a ghost entry.
    pointerup();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(dataView.addLabelBox).not.toHaveBeenCalled();
    expect(dataView.addLabelTrack).not.toHaveBeenCalled();
    expect(dataView.deleteLabelBoxLocalOnly).toHaveBeenCalledOnce();
    expect(dataView.deleteLabelTrackLocalOnly).toHaveBeenCalledOnce();
    expect(dataView.localTracks.size).toBe(0);
  });

  it("discards the placeholder track when the draw is aborted with escape", () => {
    const { dataView, pointerdown, key } = makeReadyDrawFixture();

    pointerdown();
    expect(dataView.localTracks.size).toBe(1);

    key("escape");

    expect(dataView.addLabelBox).not.toHaveBeenCalled();
    expect(dataView.deleteLabelBoxLocalOnly).toHaveBeenCalledOnce();
    expect(dataView.deleteLabelTrackLocalOnly).toHaveBeenCalledOnce();
    expect(dataView.localTracks.size).toBe(0);
  });

  it("attaches the draft to the selected track without allocating a placeholder", async () => {
    const { context, dataView, pointerdown, key } = makeReadyDrawFixture();

    // A track selected through the track inspector while in the draw
    // state: the draft box attaches to it, so no placeholder track is
    // allocated (an unattached placeholder would leak even on commit).
    const registered = await dataView.addLabelTrack({
      gtClassId: null,
      isBlack: false,
    });
    context.trackInspector.selectedId = registered.id;

    pointerdown();
    expect(dataView.addLabelTrackLocalOnly).not.toHaveBeenCalled();
    expect(dataView.localTracks.size).toBe(0);
    expect(dataView.addLabelBoxLocalOnly).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: registered.id }),
    );

    // The commit registers the box against the selected track directly;
    // no track is created and nothing local-only is left behind.
    key("g");
    await vi.waitFor(() =>
      expect(dataView.deleteLabelBoxLocalOnly).toHaveBeenCalledOnce(),
    );
    expect(dataView.addLabelTrack).toHaveBeenCalledOnce();
    expect(dataView.addLabelBox).toHaveBeenCalledOnce();
    expect([...dataView.boxes.values()][0].entityId).toBe(registered.id);
    expect(dataView.deleteLabelTrackLocalOnly).not.toHaveBeenCalled();
    expect(dataView.localTracks.size).toBe(0);
  });

  it("registers the placeholder track exactly once when the draw commits", async () => {
    const { context, dataView, pointerdown, key } = makeReadyDrawFixture();

    pointerdown();
    const draftTrack = [...dataView.localTracks.values()][0];

    key("g");
    await vi.waitFor(() =>
      expect(dataView.deleteLabelBoxLocalOnly).toHaveBeenCalledOnce(),
    );

    // The placeholder is consumed by the commit: registered once, then
    // removed from the local set, not disposed twice, not left behind.
    expect(dataView.addLabelTrack).toHaveBeenCalledOnce();
    expect(dataView.addLabelTrack).toHaveBeenCalledWith(draftTrack);
    expect(dataView.deleteLabelTrackLocalOnly).toHaveBeenCalledOnce();
    expect(dataView.deleteLabelTrackLocalOnly).toHaveBeenCalledWith(draftTrack);
    expect(dataView.localTracks.size).toBe(0);
    expect(context.currentState).toBeInstanceOf(EditState);
  });
});

describe("bbox pointer/keyboard conflict during transform (plan item 22)", () => {
  type TransformFixture = ReturnType<typeof makeTransformingFixture>;

  /**
   * Ready layer with a committed box selected for editing and a gizmo
   * drag in progress: the pointer is down on a transform handle, so the
   * camera controls are suspended and a checkpoint has not yet fired.
   */
  function makeTransformingFixture() {
    const fixture = createInteractContextFixture();
    const {
      context,
      dataView,
      mainWindow,
      boxSelector,
      boxTransformer,
      setSourceData,
      applyLayerGate,
    } = fixture;
    const box = createLabelBoxFixture({ id: "box-1" });
    setSourceData({});
    dataView.boxes.set("box-1", box);
    dataView.data = createLoadedIndex();
    applyLayerGate(true);
    context.setAction("select");
    boxSelector.dispatchEvent({ type: "selectin", object: box } as any);

    expect(context.currentState).toBeInstanceOf(EditState);
    expect(context.selectedBoxId).toBe("box-1");
    expect(boxTransformer.hasSelection).toBe(true);
    expect(boxTransformer.disabled).toBe(false);

    // The gizmo drag begins; the camera controls are suspended for it.
    expect(boxTransformer.beginTransform()).toBe(true);
    expect(mainWindow.enableCameraControls).toBe(false);

    // Reset the transformer's call history: the setup transitions issue
    // no-op abort/deselect calls (usage refresh disables the gizmo
    // briefly), which the conflict assertions must not count.
    boxTransformer.select.mockClear();
    boxTransformer.deselect.mockClear();
    boxTransformer.abort.mockClear();

    return { ...fixture, box };
  }

  /** The number of branch operations the view has committed. */
  function countHistoryOps({ dataView }: TransformFixture): number {
    return (
      dataView.updateLabelBoxTransform.mock.calls.length +
      dataView.deleteLabelBox.mock.calls.length +
      dataView.addLabelBox.mock.calls.length
    );
  }

  /** Shared postconditions every conflict must satisfy after settling. */
  function expectGestureSettled(fixture: TransformFixture): void {
    const { dataView, boxTransformer, boxCreator } = fixture;
    // At most one history operation for the whole transition.
    expect(countHistoryOps(fixture)).toBeLessThanOrEqual(1);
    // The drag is over and its gizmo released; a late pointer-up
    // (the released pointer capture) cannot checkpoint anything.
    expect(boxTransformer.isTransforming).toBe(false);
    expect(boxTransformer.endTransform()).toBe(false);
    expect(countHistoryOps(fixture)).toBeLessThanOrEqual(1);
    // The abandoned drag never morphed into a draw gesture.
    expect(boxCreator.isCreating).toBe(false);
    expect(dataView.addLabelBox).not.toHaveBeenCalled();
  }

  it.each([
    [
      "escape",
      (fixture: TransformFixture) => {
        const { context, dataView, mainWindow, boxTransformer, key } = fixture;

        key("escape");

        // Precedence: Escape aborts the drag and KEEPS the edit state;
        // it does not navigate and does not commit anything.
        expect(boxTransformer.abort).toHaveBeenCalledOnce();
        expect(boxTransformer.isTransforming).toBe(false);
        expect(boxTransformer.hasSelection).toBe(true);
        expect(dataView.updateLabelBoxTransform).not.toHaveBeenCalled();
        expect(dataView.deleteLabelBox).not.toHaveBeenCalled();
        expect(countHistoryOps(fixture)).toBe(0);
        expect(context.currentState).toBeInstanceOf(EditState);
        expect(
          (context.currentState as InstanceType<typeof EditState>).params.boxId,
        ).toBe("box-1");
        expect(context.selectedBoxId).toBe("box-1");
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
          boxTransformer,
          boxSelector,
          key,
        } = fixture;

        key("delete");

        // Precedence: Delete wins over the drag, the selected label is
        // deleted (exactly one operation) and the drag is cancelled
        // through the state teardown, without a checkpoint of its own.
        expect(dataView.deleteLabelBox).toHaveBeenCalledOnce();
        expect(dataView.deleteLabelBox).toHaveBeenCalledWith(fixture.box);
        expect(dataView.updateLabelBoxTransform).not.toHaveBeenCalled();
        expect(countHistoryOps(fixture)).toBe(1);
        expect(boxTransformer.isTransforming).toBe(false);
        expect(boxTransformer.hasSelection).toBe(false);
        expect(boxTransformer.abort).toHaveBeenCalled();
        // The gizmo, selection and monitor are released; the state is
        // back to editing nothing.
        expect(context.selectedBoxId).toBeNull();
        expect(boxSelector.selectedObj).toBeNull();
        expect(context.boxMonitor.box).toBeNull();
        expect(context.currentState).toBeInstanceOf(EditState);
        expect(
          (context.currentState as InstanceType<typeof EditState>).params.boxId,
        ).toBeNull();
        expect(mainWindow.enableCameraControls).toBe(true);
      },
    ],
    [
      "undo",
      (fixture: TransformFixture) => {
        const { context, dataView, boxTransformer } = fixture;

        // The plugin state machine binds no undo route: undo belongs to
        // the labelset editor above the layer. During a drag the combo
        // is unhandled here and must not disturb the gesture.
        expect(
          context.currentState!.keydownHandler.handle({
            keyCombo: "ctrl + z",
          } as any),
        ).toBe(false);
        expect(boxTransformer.isTransforming).toBe(true);
        expect(countHistoryOps(fixture)).toBe(0);

        // Completing the drag afterwards commits exactly one operation.
        expect(boxTransformer.endTransform()).toBe(true);
        expect(dataView.updateLabelBoxTransform).toHaveBeenCalledOnce();
        expect(dataView.updateLabelBoxTransform).toHaveBeenCalledWith(
          fixture.box,
          "translate",
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
          boxTransformer,
          boxSelector,
          boxCreator,
          applyLayerGate,
          pointerdown,
          pointerup,
        } = fixture;

        applyLayerGate(false);

        // The closed gate cancels the drag without committing it.
        expect(context.disabled).toBe(true);
        expect(boxTransformer.abort).toHaveBeenCalled();
        expect(boxTransformer.isTransforming).toBe(false);
        expect(boxTransformer.hasSelection).toBe(false);
        expect(boxTransformer.disabled).toBe(true);
        expect(dataView.updateLabelBoxTransform).not.toHaveBeenCalled();
        expect(dataView.deleteLabelBox).not.toHaveBeenCalled();
        expect(countHistoryOps(fixture)).toBe(0);
        // No orphan gizmo/selection: the components are disabled and
        // the cursor is released.
        expect(boxSelector.selectedObj).toBeNull();
        expect(boxSelector.hoverEnabled).toBe(false);
        expect(boxSelector.selectEnabled).toBe(false);
        expect(mainWindow.dom.classList.contains("cursor-all-scroll")).toBe(
          false,
        );
        // The suspended camera controls are released.
        expect(mainWindow.enableCameraControls).toBe(true);

        // Re-activation routes fresh input to the enabled layer only;
        // the abandoned drag still cannot commit.
        applyLayerGate(true);
        expect(context.disabled).toBe(false);
        expect(boxTransformer.endTransform()).toBe(false);
        context.setAction("draw");
        pointerdown();
        expect(boxCreator.begin).toHaveBeenCalledOnce();
        pointerup();
        expect(countHistoryOps(fixture)).toBe(0);
      },
    ],
    [
      "frame-next",
      (fixture: TransformFixture) => {
        const {
          context,
          dataView,
          boxTransformer,
          boxCreator,
          applyLayerGate,
          pointerdown,
          key,
        } = fixture;

        // The next frame begins loading: the labels unload and the
        // layer closes the gate.
        dataView.data = null;
        applyLayerGate(true);

        expect(context.disabled).toBe(true);
        expect(boxTransformer.abort).toHaveBeenCalled();
        expect(boxTransformer.isTransforming).toBe(false);
        expect(boxTransformer.hasSelection).toBe(false);
        expect(dataView.updateLabelBoxTransform).not.toHaveBeenCalled();
        expect(dataView.deleteLabelBox).not.toHaveBeenCalled();
        expect(countHistoryOps(fixture)).toBe(0);
        expect(context.selectedBoxId).toBeNull();

        // The next frame arrives (empty); neither frame received a
        // label from the abandoned drag.
        dataView.boxes.clear();
        dataView.data = createLoadedIndex();
        applyLayerGate(true);
        expect(context.disabled).toBe(false);
        expect(dataView.boxes.size).toBe(0);
        expect(countHistoryOps(fixture)).toBe(0);
        expect(boxTransformer.endTransform()).toBe(false);

        // A new gesture on the new frame starts clean...
        context.setAction("draw");
        pointerdown();
        expect(boxCreator.begin).toHaveBeenCalledOnce();
        // ...and is the only gesture in flight (released here so the
        // shared postconditions see a settled layer).
        key("escape");
        expect(boxCreator.isCreating).toBe(false);
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
