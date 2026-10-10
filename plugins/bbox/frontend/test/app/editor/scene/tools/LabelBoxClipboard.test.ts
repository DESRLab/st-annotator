import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { LabelBoxClipboard } from "../../../../../app/editor/scene/tools/LabelBoxClipboard";

describe("LabelBoxClipboard", () => {
  it("does nothing while empty or disabled and snapshots mutable geometry on copy", () => {
    const clipboard = new LabelBoxClipboard();
    const pasted = vi.fn();
    clipboard.addEventListener("paste", pasted);
    clipboard.paste();
    expect(pasted).not.toHaveBeenCalled();

    const center = new THREE.Vector3(1, 2, 3);
    const size = new THREE.Vector3(4, 5, 6);
    clipboard.select({
      boxType: "cuboid",
      center,
      angle: 0.5,
      size,
      qualityRank: 1,
      distinctiveLv: 2,
      occlusionLv: 3,
      perceivedClassId: 4,
      entityId: 5,
    } as any);
    clipboard.disabled = true;
    clipboard.copy();
    expect(clipboard.clipboard).toBeNull();
    clipboard.disabled = false;
    clipboard.copy();
    center.setScalar(99);
    size.setScalar(99);
    expect(clipboard.clipboard?.center.toArray()).toEqual([1, 2, 3]);
    expect(clipboard.clipboard?.size.toArray()).toEqual([4, 5, 6]);
  });

  it("supports repeated paste without mutating or consuming the snapshot", () => {
    const clipboard = new LabelBoxClipboard();
    clipboard.select({
      boxType: "cuboid",
      center: new THREE.Vector3(),
      angle: 0,
      size: new THREE.Vector3(1, 1, 1),
      qualityRank: 0,
      distinctiveLv: 0,
      occlusionLv: 0,
      perceivedClassId: null,
      entityId: null,
    } as any);
    clipboard.copy();
    const pasted = vi.fn();
    clipboard.addEventListener("paste", pasted);
    clipboard.paste();
    clipboard.paste();
    expect(pasted).toHaveBeenCalledTimes(2);
    expect(pasted.mock.calls[0][0].clipboard).toBe(
      pasted.mock.calls[1][0].clipboard,
    );
  });

  it("treats copy/paste from a stale control after deletion as bounded no-ops", () => {
    const clipboard = new LabelBoxClipboard();
    const copied = vi.fn();
    const pasted = vi.fn();
    clipboard.addEventListener("copy", copied);
    clipboard.addEventListener("paste", pasted);

    const box = {
      boxType: "cuboid",
      center: new THREE.Vector3(1, 2, 3),
      angle: 0.5,
      size: new THREE.Vector3(4, 5, 6),
      qualityRank: 1,
      distinctiveLv: 2,
      occlusionLv: 3,
      perceivedClassId: 4,
      entityId: "track-1",
    } as any;
    clipboard.select(box);

    // The label is deleted and the edit state tears the selection down
    // (the way `EditState.dispose` does); the stale control fires after.
    clipboard.deselect();
    clipboard.copy();
    clipboard.paste();
    expect(copied).not.toHaveBeenCalled();
    expect(pasted).not.toHaveBeenCalled();
    expect(clipboard.clipboard).toBeNull();

    // Even a clipboard that still holds the deleted label only ever reads
    // it: copy snapshots the stale parameters without mutating anything,
    // and paste reuses that snapshot for the new label to be created.
    clipboard.select(box);
    clipboard.copy();
    expect(copied).toHaveBeenCalledTimes(1);
    box.center.setScalar(0);
    box.entityId = null;
    clipboard.paste();
    expect(pasted).toHaveBeenCalledTimes(1);
    expect(pasted.mock.calls[0][0].clipboard.center.toArray()).toEqual([
      1, 2, 3,
    ]);
    expect(pasted.mock.calls[0][0].clipboard.entityId).toBe("track-1");
  });
});
