import { describe, expect, it, vi } from "vitest";

import { DrawBoxState } from "../../../../../app/editor/scene/layer/DrawBoxState";
import { EditState } from "../../../../../app/editor/scene/layer/EditState";

import {
  createInteractContextFixture,
  createLoadedIndex,
} from "./interactContextFixture";

describe("bbox loading intent guards", () => {
  it("creation entry points are no-ops during the initial runtime mount", () => {
    const { context, dataView, boxCreator, pointerdown, pointerup, key } =
      createInteractContextFixture();
    expect(context.disabled).toBe(true);

    // Toolbar/pane route: action changes are dropped while disabled.
    context.setAction("draw");
    context.toggleDraw();
    expect(context.action).toBe("edit");
    expect(context.currentState).toBeInstanceOf(EditState);

    // Canvas gesture route: pointer events never start a draft.
    pointerdown();
    pointerup();
    expect(dataView.addLabelBoxLocalOnly).not.toHaveBeenCalled();
    expect(dataView.addLabelTrackLocalOnly).not.toHaveBeenCalled();
    expect(boxCreator.begin).not.toHaveBeenCalled();

    // Hotkey route: the draw-state finish keybind is not even mounted.
    key("g");
    expect(boxCreator.end).not.toHaveBeenCalled();

    // Components stay disabled; no backend mutation occurs.
    expect(boxCreator.disabled).toBe(true);
    expect(dataView.addLabelBox).not.toHaveBeenCalled();
    expect(dataView.addLabelTrack).not.toHaveBeenCalled();
  });

  it("notifies action listeners only when the action changes", () => {
    const { context, dataView, setSourceData, applyLayerGate } =
      createInteractContextFixture();
    dataView.data = createLoadedIndex();
    setSourceData({});
    applyLayerGate(true);

    const listener = vi.fn();
    context.addEventListener("action-change", listener);
    context.setAction("draw");
    context.setAction("draw");

    expect(listener).toHaveBeenCalledOnce();
  });

  it("does not enable creation while labels are loading, even if source data is ready", () => {
    const {
      context,
      dataView,
      boxCreator,
      setSourceData,
      applyLayerGate,
      pointerdown,
      pointerup,
    } = createInteractContextFixture();

    // The point cloud and ground mesh finished loading first; the bbox
    // layer keeps interaction disabled until its label data is present.
    setSourceData({});
    boxCreator.pcd = {};
    boxCreator.groundMesh = { raycast: () => [] };
    dataView.data = null;
    applyLayerGate(true);
    expect(context.disabled).toBe(true);

    context.setAction("draw");
    pointerdown();
    pointerup();
    expect(boxCreator.begin).not.toHaveBeenCalled();
    expect(dataView.addLabelBoxLocalOnly).not.toHaveBeenCalled();
    expect(dataView.addLabelBox).not.toHaveBeenCalled();
  });

  it("does not enable creation while the source data is loading, even if labels are ready", () => {
    const {
      context,
      dataView,
      boxCreator,
      setSourceData,
      applyLayerGate,
      pointerdown,
      pointerup,
    } = createInteractContextFixture();

    // The labels finished loading first; the bbox layer keeps interaction
    // disabled until its complete prerequisite set is ready, the point
    // cloud used to place boxes included.
    dataView.data = createLoadedIndex();
    setSourceData(null);
    applyLayerGate(true);
    expect(context.disabled).toBe(true);

    context.setAction("draw");
    pointerdown();
    pointerup();
    expect(boxCreator.begin).not.toHaveBeenCalled();
    expect(dataView.addLabelBoxLocalOnly).not.toHaveBeenCalled();
    expect(dataView.addLabelBox).not.toHaveBeenCalled();

    // Once the source data settles, the same action engages.
    setSourceData({});
    applyLayerGate(true);
    expect(context.disabled).toBe(false);
    context.setAction("draw");
    expect(context.currentState).toBeInstanceOf(DrawBoxState);
  });

  it("creates exactly one label for one gesture once the layer is active and loaded", async () => {
    const {
      context,
      dataView,
      boxCreator,
      setSourceData,
      applyLayerGate,
      pointerdown,
      key,
    } = createInteractContextFixture();

    setSourceData({});
    dataView.data = createLoadedIndex();
    applyLayerGate(true);
    expect(context.disabled).toBe(false);

    context.setAction("draw");
    expect(context.currentState).toBeInstanceOf(DrawBoxState);
    expect(boxCreator.disabled).toBe(false);

    // A single pointer-down allocates exactly one local draft.
    pointerdown();
    expect(dataView.addLabelTrackLocalOnly).toHaveBeenCalledOnce();
    expect(dataView.addLabelBoxLocalOnly).toHaveBeenCalledOnce();
    expect(boxCreator.begin).toHaveBeenCalledOnce();

    // The 'g' hotkey finishes with a default size, committing exactly one
    // track registration and one box operation.
    key("g");
    expect(boxCreator.end).toHaveBeenCalledWith(true);
    await vi.waitFor(() => expect(dataView.addLabelBox).toHaveBeenCalledOnce());
    expect(dataView.addLabelTrack).toHaveBeenCalledOnce();

    // The local draft is cleaned up and the registered box is selected.
    expect(dataView.deleteLabelBoxLocalOnly).toHaveBeenCalledOnce();
    expect(dataView.deleteLabelTrackLocalOnly).toHaveBeenCalledOnce();
    expect(context.currentState).toBeInstanceOf(EditState);
    expect(context.selectedBoxId).toBe([...dataView.boxes.keys()][0]);
  });

  it("cancels an in-progress draft when labels start reloading and stays gated until ready", () => {
    const {
      context,
      dataView,
      boxCreator,
      setSourceData,
      applyLayerGate,
      pointerdown,
      key,
    } = createInteractContextFixture();

    setSourceData({});
    dataView.data = createLoadedIndex();
    applyLayerGate(true);
    context.setAction("draw");
    pointerdown();
    expect(boxCreator.isCreating).toBe(true);

    // The layer disables the context while the next frame's labels load
    // (onBeforeUpdateData); leaving the draw state aborts the draft.
    dataView.data = null;
    applyLayerGate(true);
    expect(context.disabled).toBe(true);
    expect(boxCreator.abort).toHaveBeenCalled();
    expect(boxCreator.isCreating).toBe(false);
    expect(context.currentState).toBeInstanceOf(EditState);

    // A late completion of the superseded frame must not re-enable the
    // tools: the gate only opens for the data that is actually loaded.
    applyLayerGate(true);
    expect(context.disabled).toBe(true);
    context.setAction("draw");
    expect(context.action).toBe("edit");

    dataView.data = createLoadedIndex();
    applyLayerGate(true);
    expect(context.disabled).toBe(false);
    context.setAction("draw");
    expect(context.currentState).toBeInstanceOf(DrawBoxState);

    // The cancelled draft was disposed; a new gesture starts clean and
    // allocates exactly one new draft.
    expect(dataView.deleteLabelBoxLocalOnly).toHaveBeenCalled();
    pointerdown();
    expect(dataView.addLabelBoxLocalOnly).toHaveBeenCalledTimes(2);
    expect(boxCreator.begin).toHaveBeenCalledTimes(2);
    key("escape");
  });
});
