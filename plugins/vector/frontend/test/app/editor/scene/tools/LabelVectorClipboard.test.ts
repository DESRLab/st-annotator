import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { LabelVectorClipboard } from "../../../../../app/editor/scene/tools/LabelVectorClipboard";

describe("LabelVectorClipboard", () => {
  it("takes an independent vertex snapshot and preserves placeholder class IDs", () => {
    const vertices = [new THREE.Vector3(1, 2, 3), new THREE.Vector3(4, 5, 6)];
    const clipboard = new LabelVectorClipboard();
    clipboard.select({
      vectorType: "polyline",
      vertices,
      gtClassId: -7,
    } as any);
    clipboard.copy();
    vertices[0].setScalar(99);
    vertices.push(new THREE.Vector3());

    expect(clipboard.clipboard?.vertices).toHaveLength(2);
    expect(clipboard.clipboard?.vertices[0].toArray()).toEqual([1, 2, 3]);
    expect(clipboard.clipboard?.gtClassId).toBe(-7);
  });

  it("blocks empty/disabled paste and emits every repeated paste", () => {
    const clipboard = new LabelVectorClipboard();
    const pasted = vi.fn();
    clipboard.addEventListener("paste", pasted);
    clipboard.paste();
    expect(pasted).not.toHaveBeenCalled();

    clipboard.select({
      vectorType: "point",
      vertices: [new THREE.Vector3()],
      gtClassId: null,
    } as any);
    clipboard.copy();
    clipboard.disabled = true;
    clipboard.paste();
    expect(pasted).not.toHaveBeenCalled();
    clipboard.disabled = false;
    clipboard.paste();
    clipboard.paste();
    expect(pasted).toHaveBeenCalledTimes(2);
  });

  it("treats copy/paste from a stale control after deletion as bounded no-ops", () => {
    const clipboard = new LabelVectorClipboard();
    const copied = vi.fn();
    const pasted = vi.fn();
    clipboard.addEventListener("copy", copied);
    clipboard.addEventListener("paste", pasted);

    const vector = {
      vectorType: "polyline",
      vertices: [new THREE.Vector3(1, 2, 3), new THREE.Vector3(4, 5, 6)],
      gtClassId: 4,
    } as any;
    clipboard.select(vector);

    // The label is deleted and the edit state tears the selection down;
    // the stale control fires after.
    clipboard.deselect();
    clipboard.copy();
    clipboard.paste();
    expect(copied).not.toHaveBeenCalled();
    expect(pasted).not.toHaveBeenCalled();
    expect(clipboard.clipboard).toBeNull();

    // Even a clipboard that still holds the deleted label only ever reads
    // it: copy snapshots the stale geometry without mutating anything, and
    // paste reuses that snapshot for the new label to be created.
    clipboard.select(vector);
    clipboard.copy();
    expect(copied).toHaveBeenCalledTimes(1);
    vector.vertices[0].setScalar(0);
    vector.gtClassId = null;
    clipboard.paste();
    expect(pasted).toHaveBeenCalledTimes(1);
    expect(pasted.mock.calls[0][0].clipboard.vertices[0].toArray()).toEqual([
      1, 2, 3,
    ]);
    expect(pasted.mock.calls[0][0].clipboard.gtClassId).toBe(4);
  });
});
