import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { EditorConfig, ProjectConfig } from "sta/app/editor";

import { LabelBox } from "../../../../../app/editor/scene/data/LabelBox";
import {
  LabelBoxCreator,
  type LabelBoxDrawMode,
} from "../../../../../app/editor/scene/tools/LabelBoxCreator";

function makeBox() {
  return new LabelBox({
    config: new EditorConfig(ProjectConfig.fromJSON({ frame_cache_size: 1 })),
    labels: null,
    id: "box",
    boxType: "cuboid",
    center: new THREE.Vector3(),
    angle: 0,
    size: new THREE.Vector3(4, 5, 6),
  });
}

function makeCreator(pointerPosition: THREE.Vector3) {
  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(pointerPosition.x, 10, pointerPosition.z),
    new THREE.Vector3(0, -1, 0),
  );
  const controller = Object.assign(new THREE.EventDispatcher(), {
    raycaster,
  });
  const pointer = { createHoverController: vi.fn(() => controller) } as any;
  return { creator: new LabelBoxCreator(pointer, raycaster), controller };
}

describe.each([
  ["point2center", Math.atan2(-2, -3)],
  ["center2point", Math.atan2(2, 3)],
] as const)(
  "LabelBoxCreator %s continuation",
  (mode: LabelBoxDrawMode, expectedAngle: number) => {
    it("continues with fixed size, translated center, heading, and a clean end state", () => {
      const { creator } = makeCreator(new THREE.Vector3(2, 0, 3));
      const box = makeBox();
      const initialSize = box.asObject3D().scale.clone();
      const ended = vi.fn();
      creator.addEventListener("end", ended);
      expect(creator.begin(mode, box)).toBe(true);
      expect(creator.isSizeFixed).toBe(true);
      creator.updateState();
      expect(box.asObject3D().position.toArray()).toEqual([2, 0, 3]);
      expect(box.asObject3D().rotation.y).toBeCloseTo(expectedAngle);
      expect(box.asObject3D().scale).toEqual(initialSize);
      expect(creator.end(true)).toBe(true);
      expect(creator.isCreating).toBe(false);
      expect(ended).toHaveBeenCalledWith(
        expect.objectContaining({ box, applyDefaultSize: true }),
      );
      creator.dispose();
    });
  },
);

describe("LabelBoxCreator lifecycle", () => {
  it("rejects reentry, aborts when disabled, and removes its pointer listener", () => {
    const { creator, controller } = makeCreator(new THREE.Vector3());
    const box = makeBox();
    const aborted = vi.fn();
    creator.addEventListener("abort", aborted);
    expect(creator.begin("corner2corner", box)).toBe(true);
    expect(creator.begin("corner2corner", makeBox())).toBe(false);
    creator.disabled = true;
    expect(aborted).toHaveBeenCalledOnce();
    expect(creator.isCreating).toBe(false);
    const remove = vi.spyOn(controller, "removeEventListener");
    creator.dispose();
    expect(remove).toHaveBeenCalledWith("pointermove", expect.any(Function));
  });
});
