import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { AssistedSelectionEditControl } from "../../../../../app/editor/scene/controls/AssistedSelectionEditControl";
import type { PointPrompterEventMap } from "../../../../../app/editor/scene/tools/PointPrompter";
import { createLabelSelectionFixture } from "../layer/interactContextFixture";

function createControl() {
  const pointPrompter = Object.assign(
    new THREE.EventDispatcher<PointPrompterEventMap>(),
    { abort: vi.fn() },
  );
  return {
    control: new AssistedSelectionEditControl(pointPrompter as never),
    pointPrompter,
  };
}

describe("AssistedSelectionEditControl prediction ownership", () => {
  it("does not checkpoint an existing selection before a prediction succeeds", () => {
    const { control } = createControl();
    const selection = createLabelSelectionFixture();
    const update = vi.fn();
    control.addEventListener("update", update);
    control.select(selection, null);

    control.maskThreshold = 0.6;

    expect(update).not.toHaveBeenCalled();
    control.dispose();
  });

  it("ignores predictions for another or stale selection", () => {
    const { control } = createControl();
    const first = createLabelSelectionFixture({ id: "first" });
    const second = createLabelSelectionFixture({ id: "second" });
    const update = vi.fn();
    control.addEventListener("update", update);
    control.select(first, null);

    control.markPredictionAvailable(second);
    control.maskThreshold = 0.6;
    control.markPredictionAvailable(first);
    control.select(second, null);
    control.maskThreshold = 0.7;

    expect(update).not.toHaveBeenCalled();
    control.dispose();
  });

  it("re-checkpoints only after the current selection owns a prediction", () => {
    const { control } = createControl();
    const selection = createLabelSelectionFixture();
    const update = vi.fn();
    control.addEventListener("update", update);
    control.select(selection, null);
    control.markPredictionAvailable(selection);

    control.maskThreshold = 0.6;

    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        obj: selection,
        maskThreshold: 0.6,
        predict: false,
        type: "update",
      }),
    );
    control.dispose();
  });

  it("keeps all foreground/background prompts and immutable request snapshots across selection refreshes", () => {
    const { control, pointPrompter } = createControl();
    const selection = createLabelSelectionFixture();
    const firstPoint = new THREE.Vector3(10, 11, 12);
    const secondPoint = new THREE.Vector3(20, 21, 22);
    const updates: {
      promptData: { points: THREE.Vector3[]; labels: number[] };
    }[] = [];
    control.addEventListener("update", (event) => updates.push(event));
    control.select(selection, {
      points: [selection.centerPoint.clone()],
      labels: [1],
    });

    pointPrompter.dispatchEvent({
      type: "end",
      vertex: firstPoint,
      label: 0,
    });
    expect(updates[0].promptData.labels).toEqual([1, 0]);

    // Mirrors the state transition after the first prediction completes.
    control.select(selection, updates[0].promptData);
    pointPrompter.dispatchEvent({
      type: "end",
      vertex: secondPoint,
      label: 1,
    });

    expect(updates[0].promptData.labels).toEqual([1, 0]);
    expect(updates[0].promptData.points).toHaveLength(2);
    expect(updates[1].promptData.labels).toEqual([1, 0, 1]);
    expect(updates[1].promptData.points).toHaveLength(3);

    const markerGroup = control.prompts.asObject3D();
    const markerCount = markerGroup.children.reduce((count, child) => {
      const position = (child as THREE.Points).geometry.getAttribute(
        "position",
      );
      return count + (position?.count ?? 0);
    }, 0);
    expect(markerCount).toBe(3);
    control.dispose();
  });

  it("keeps cached-mask ownership across an assisted selection refresh", () => {
    const { control } = createControl();
    const selection = createLabelSelectionFixture();
    const promptedData = {
      points: [selection.centerPoint.clone()],
      labels: [1],
    };
    const update = vi.fn();
    control.addEventListener("update", update);
    control.select(selection, promptedData);
    control.markPredictionAvailable(selection);

    // The edit operation refreshes/reselects the object before the user moves
    // the threshold slider.
    control.select(selection, promptedData);
    control.maskThreshold = 0.7;

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        maskThreshold: 0.7,
        predict: false,
        promptData: expect.objectContaining({ labels: [1] }),
      }),
    );
    control.dispose();
  });
});
