import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { DrawSelectionState } from "../../../../../app/editor/scene/layer/DrawSelectionState";
import { NavigationState } from "../../../../../app/editor/scene/layer/NavigationState";

import {
  createInteractContextFixture,
  createLoadedIndex,
} from "./interactContextFixture";

const GESTURE_POINTS = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1)];

/** A loaded point cloud; `encoded` controls the assistant-specific state. */
function createPointCloudUtils(encoded: boolean) {
  return {
    whenEncoded: vi.fn().mockResolvedValue(encoded),
    buffer: { getCoords: () => [] },
  };
}

describe("segmentation loading intent guards", () => {
  it("creation entry points are no-ops during the initial runtime mount", () => {
    const { context, dataView, selectionController, key } =
      createInteractContextFixture();
    expect(context.disabled).toBe(true);

    // Toolbar/pane route: action changes are dropped while disabled.
    context.setAction("draw");
    context.toggleDraw();
    expect(context.action).toBe("navigate");
    expect(context.currentState).toBeInstanceOf(NavigationState);

    // Canvas gesture route: no curator is enabled, so a stroke cannot
    // start a draft.
    expect(selectionController.startGesture("box")).toBe(false);
    expect(selectionController.finishGesture(GESTURE_POINTS)).toBe(false);

    // Hotkey route: the draw-state finish keybind is not even mounted.
    key("g");

    // No backend mutation occurs.
    expect(dataView.addLabelSelectionLocalOnly).not.toHaveBeenCalled();
    expect(dataView.addLabelSelection).not.toHaveBeenCalled();
    expect(dataView.addLabelInstance).not.toHaveBeenCalled();
  });

  it("notifies action listeners only when the action changes", () => {
    const { context, dataView, setPointCloudUtils, applyLayerGate } =
      createInteractContextFixture();
    dataView.data = createLoadedIndex();
    setPointCloudUtils(createPointCloudUtils(true));
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
      selectionController,
      setPointCloudUtils,
      applyLayerGate,
    } = createInteractContextFixture();

    // The point cloud finished loading (and encoding) first; the
    // segmentation layer keeps interaction disabled until its label data
    // is present.
    setPointCloudUtils(createPointCloudUtils(true));
    dataView.data = null;
    applyLayerGate(true);
    expect(context.disabled).toBe(true);

    context.setAction("draw");
    expect(context.action).toBe("navigate");
    expect(selectionController.startGesture("box")).toBe(false);
    expect(dataView.addLabelSelectionLocalOnly).not.toHaveBeenCalled();
    expect(dataView.addLabelSelection).not.toHaveBeenCalled();
  });

  it("does not enable creation while the source data is loading, even if labels are ready", () => {
    const {
      context,
      dataView,
      selectionController,
      setPointCloudUtils,
      applyLayerGate,
    } = createInteractContextFixture();

    // The labels finished loading first; the segmentation layer keeps
    // interaction disabled until its complete prerequisite set is ready
    // The point cloud queried by the curators was included.
    dataView.data = createLoadedIndex();
    setPointCloudUtils(null);
    applyLayerGate(true);
    expect(context.disabled).toBe(true);

    context.setAction("draw");
    expect(context.action).toBe("navigate");
    expect(selectionController.startGesture("box")).toBe(false);
    expect(dataView.addLabelSelectionLocalOnly).not.toHaveBeenCalled();
    expect(dataView.addLabelSelection).not.toHaveBeenCalled();

    // Once the source data settles, the same action engages.
    setPointCloudUtils(createPointCloudUtils(true));
    applyLayerGate(true);
    expect(context.disabled).toBe(false);
    context.setAction("draw");
    expect(context.currentState).toBeInstanceOf(DrawSelectionState);
  });

  it("does not let the assistant create a selection without an encoded point cloud", async () => {
    const { context, dataView, setPointCloudUtils, applyLayerGate } =
      createInteractContextFixture();

    // Labels and the point cloud are loaded, but the assistant has not
    // encoded the cloud yet.
    setPointCloudUtils(createPointCloudUtils(false));
    dataView.data = createLoadedIndex();
    applyLayerGate(true);
    context.setAction("draw");
    expect(context.currentState).toBeInstanceOf(DrawSelectionState);

    // The assistant creation path bails out before any mutation.
    const usage = context.currentState!.getUsage(false);
    usage.assistedSelectionController?.create?.({
      maskThreshold: 0.5,
      promptData: { points: GESTURE_POINTS, labels: [1, 1] },
    });
    expect(dataView.predictMask).not.toHaveBeenCalled();
    expect(dataView.addLabelSelection).not.toHaveBeenCalled();
  });

  it("creates exactly one label for one gesture once the layer is active and loaded", async () => {
    const {
      context,
      dataView,
      selectionController,
      setPointCloudUtils,
      applyLayerGate,
    } = createInteractContextFixture();

    setPointCloudUtils(createPointCloudUtils(true));
    dataView.data = createLoadedIndex();
    applyLayerGate(true);
    expect(context.disabled).toBe(false);

    context.setAction("draw");
    expect(context.currentState).toBeInstanceOf(DrawSelectionState);
    expect(selectionController.curators.box.enabled).toBe(true);

    // One pointer stroke starts exactly one draft.
    expect(selectionController.startGesture("box")).toBe(true);
    expect(selectionController.isCuratorDrawing).toBe(true);
    expect(dataView.addLabelSelectionLocalOnly).not.toHaveBeenCalled();

    // Finishing the gesture commits exactly one instance (auto-managed)
    // and one selection; the local draft is cleaned up afterwards.
    expect(selectionController.finishGesture(GESTURE_POINTS)).toBe(true);
    await vi.waitFor(() =>
      expect(dataView.deleteLabelSelectionLocalOnly).toHaveBeenCalledOnce(),
    );
    expect(dataView.addLabelSelectionLocalOnly).toHaveBeenCalledOnce();
    expect(dataView.addLabelInstance).toHaveBeenCalledOnce();
    expect(dataView.addLabelSelection).toHaveBeenCalledOnce();

    // The registered selection is selected for editing.
    expect(context.currentState).toBeInstanceOf(DrawSelectionState);
    expect(context.selectedSelectionId).toBe(
      [...dataView.selections.keys()][0],
    );
  });

  it("cancels an in-progress draft when labels start reloading and stays gated until ready", async () => {
    const {
      context,
      dataView,
      selectionController,
      setPointCloudUtils,
      applyLayerGate,
    } = createInteractContextFixture();

    setPointCloudUtils(createPointCloudUtils(true));
    dataView.data = createLoadedIndex();
    applyLayerGate(true);
    context.setAction("draw");
    expect(selectionController.startGesture("box")).toBe(true);
    expect(selectionController.isCuratorDrawing).toBe(true);

    // The layer disables the context while the next frame's labels load
    // (onBeforeUpdateData); leaving the draw state aborts the gesture.
    dataView.data = null;
    applyLayerGate(true);
    expect(context.disabled).toBe(true);
    expect(selectionController.abort).toHaveBeenCalled();
    expect(selectionController.isCuratorDrawing).toBe(false);
    expect(context.currentState).toBeInstanceOf(NavigationState);

    // A late completion of the superseded frame must not re-enable the
    // tools: the gate only opens for the data that is actually loaded,
    // and the disabled controller refuses to finish the stale gesture.
    applyLayerGate(true);
    expect(context.disabled).toBe(true);
    context.setAction("draw");
    expect(context.action).toBe("navigate");
    expect(selectionController.finishGesture(GESTURE_POINTS)).toBe(false);
    expect(dataView.addLabelSelection).not.toHaveBeenCalled();

    dataView.data = createLoadedIndex();
    applyLayerGate(true);
    expect(context.disabled).toBe(false);
    context.setAction("draw");
    expect(context.currentState).toBeInstanceOf(DrawSelectionState);

    // The aborted gesture allocated nothing (the selection materializes
    // at finish time); a new gesture starts clean and commits once.
    expect(dataView.addLabelSelectionLocalOnly).not.toHaveBeenCalled();
    expect(selectionController.startGesture("box")).toBe(true);
    expect(selectionController.finishGesture(GESTURE_POINTS)).toBe(true);
    await vi.waitFor(() =>
      expect(dataView.addLabelSelection).toHaveBeenCalledOnce(),
    );
    expect(dataView.addLabelSelectionLocalOnly).toHaveBeenCalledTimes(1);
  });
});
