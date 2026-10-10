import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { DrawVectorState } from "../../../../../app/editor/scene/layer/DrawVectorState";
import { EditState } from "../../../../../app/editor/scene/layer/EditVectorState";

import {
  createInteractContextFixture,
  createLoadedIndex,
} from "./interactContextFixture";

describe("vector loading intent guards", () => {
  it("creation entry points are no-ops during the initial runtime mount", () => {
    const { context, dataView, vectorCreators, key } =
      createInteractContextFixture();
    expect(context.disabled).toBe(true);
    const creator = vectorCreators.polyline;

    // Toolbar/pane route: action changes are dropped while disabled.
    context.setAction("draw");
    context.toggleDraw();
    expect(context.action).toBe("edit");
    expect(context.currentState).toBeInstanceOf(EditState);

    // Canvas gesture route: creators stay disabled, so pointer input
    // cannot start a draft.
    expect(creator.enabled).toBe(false);
    expect(creator.addVertex(new THREE.Vector3())).toBe(false);

    // Hotkey route: the draw-state finish keybind is not even mounted.
    key("g");
    expect(creator.finish).not.toHaveBeenCalled();

    // No backend mutation occurs.
    expect(dataView.addLabelVectorLocalOnly).not.toHaveBeenCalled();
    expect(dataView.addLabelVector).not.toHaveBeenCalled();
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
    const { context, dataView, vectorCreators, setSourceData, applyLayerGate } =
      createInteractContextFixture();

    // The point cloud finished loading first (it feeds the creators'
    // snapping source); the vector layer keeps interaction disabled
    // until its label data is present.
    setSourceData({});
    for (const creator of Object.values(vectorCreators)) creator.pcdObj = {};
    dataView.data = null;
    applyLayerGate(true);
    expect(context.disabled).toBe(true);

    context.setAction("draw");
    expect(vectorCreators.polyline.enabled).toBe(false);
    expect(vectorCreators.polyline.addVertex(new THREE.Vector3())).toBe(false);
    expect(dataView.addLabelVectorLocalOnly).not.toHaveBeenCalled();
    expect(dataView.addLabelVector).not.toHaveBeenCalled();
  });

  it("does not enable creation while the source data is loading, even if labels are ready", () => {
    const { context, dataView, vectorCreators, setSourceData, applyLayerGate } =
      createInteractContextFixture();

    // The labels finished loading first; the vector layer keeps
    // interaction disabled until its complete prerequisite set is ready
    // The point cloud the creators snap against was included.
    dataView.data = createLoadedIndex();
    setSourceData(null);
    applyLayerGate(true);
    expect(context.disabled).toBe(true);

    context.setAction("draw");
    expect(vectorCreators.polyline.enabled).toBe(false);
    expect(vectorCreators.polyline.addVertex(new THREE.Vector3())).toBe(false);
    expect(dataView.addLabelVectorLocalOnly).not.toHaveBeenCalled();
    expect(dataView.addLabelVector).not.toHaveBeenCalled();

    // Once the source data settles, the same action engages.
    setSourceData({});
    applyLayerGate(true);
    expect(context.disabled).toBe(false);
    context.setAction("draw");
    expect(context.currentState).toBeInstanceOf(DrawVectorState);
  });

  it("creates exactly one label for one gesture once the layer is active and loaded", async () => {
    const {
      context,
      dataView,
      vectorCreators,
      setSourceData,
      applyLayerGate,
      key,
    } = createInteractContextFixture();
    const creator = vectorCreators.polyline;

    setSourceData({});
    dataView.data = createLoadedIndex();
    applyLayerGate(true);
    expect(context.disabled).toBe(false);

    context.setAction("draw");
    expect(context.currentState).toBeInstanceOf(DrawVectorState);
    expect(creator.enabled).toBe(true);

    // Pointer input adds vertices; nothing is allocated until the
    // gesture finishes.
    creator.addVertex(new THREE.Vector3(0, 0, 0));
    creator.addVertex(new THREE.Vector3(1, 1, 1));
    expect(creator.isCreating).toBe(true);
    expect(dataView.addLabelVectorLocalOnly).not.toHaveBeenCalled();

    // The 'g' hotkey finishes the gesture, committing exactly one vector;
    // the local draft is allocated at finish time and cleaned up after
    // the registration settles.
    key("g");
    expect(creator.finish).toHaveBeenCalledOnce();
    await vi.waitFor(() =>
      expect(dataView.deleteLabelVectorLocalOnly).toHaveBeenCalledOnce(),
    );
    expect(dataView.addLabelVector).toHaveBeenCalledOnce();
    expect(dataView.addLabelVectorLocalOnly).toHaveBeenCalledOnce();

    // The registered vector is selected.
    expect(context.currentState).toBeInstanceOf(EditState);
    expect(context.selectedVectorId).toBe([...dataView.vectors.keys()][0]);
  });

  it("cancels an in-progress draft when labels start reloading and stays gated until ready", async () => {
    const {
      context,
      dataView,
      vectorCreators,
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

    // The layer disables the context while the next frame's labels load
    // (onBeforeUpdateData); leaving the draw state aborts the draft and
    // the usage refresh disables the creator.
    dataView.data = null;
    applyLayerGate(true);
    expect(context.disabled).toBe(true);
    expect(creator.abort).toHaveBeenCalled();
    expect(creator.isCreating).toBe(false);
    expect(creator.enabled).toBe(false);
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
    expect(context.currentState).toBeInstanceOf(DrawVectorState);

    // The aborted gesture allocated nothing (the vector materializes at
    // finish time); a new gesture starts clean and commits exactly once.
    expect(dataView.addLabelVectorLocalOnly).not.toHaveBeenCalled();
    expect(dataView.localVectors.size).toBe(0);
    creator.addVertex(new THREE.Vector3(2, 2, 2));
    key("g");
    await vi.waitFor(() =>
      expect(dataView.deleteLabelVectorLocalOnly).toHaveBeenCalledOnce(),
    );
    expect(dataView.addLabelVector).toHaveBeenCalledOnce();
    expect(dataView.addLabelVectorLocalOnly).toHaveBeenCalledTimes(1);
    expect(dataView.localVectors.size).toBe(0);
  });
});
