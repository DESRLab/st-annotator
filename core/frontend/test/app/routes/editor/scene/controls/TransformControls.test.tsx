import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import type { ControlsEventMap } from "../../../../../../app/routes/editor/scene/controls/Controls";
import { Controls } from "../../../../../../app/routes/editor/scene/controls/Controls";
import { DraggableBase } from "../../../../../../app/routes/editor/scene/controls/DraggableBase";
import { SceneObjectsGroup } from "../../../../../../app/routes/editor/scene/tools/SceneObjects";
import {
  TransformControls,
  type Transformation,
} from "../../../../../../app/routes/editor/scene/controls/TransformControls";

class StubControls extends THREE.Object3D<ControlsEventMap> {
  disposeCount = 0;

  syncMatrix = vi.fn(() => this);

  dispose(): void {
    this.disposeCount += 1;
  }
}

function makeTransformControls(): {
  controls: TransformControls;
  stubs: Record<Transformation, StubControls>;
} {
  const stubs: Record<Transformation, StubControls> = {
    translate: new StubControls(),
    rotate: new StubControls(),
    scale: new StubControls(),
  };

  // The constructor only uses the pointer by reference, so a stub suffices.
  const controls = new TransformControls(stubs as never, {} as never);

  return { controls, stubs };
}

describe("TransformControls", () => {
  it("disposes geometry and material resources owned by each control", () => {
    const draggable = new DraggableBase(["X"]);
    const group = Controls.createGroup([draggable]);
    const dragger = Object.assign(new THREE.EventDispatcher(), {
      dispose: vi.fn(),
      raycaster: new THREE.Raycaster(),
      draggedObj: null,
      hoveredObj: null,
    });
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.MeshBasicMaterial();
    const geometryDispose = vi.spyOn(geometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    const visual = new THREE.Mesh(geometry, material);
    const controls = new Controls(
      group as SceneObjectsGroup<DraggableBase>,
      dragger as never,
      [visual],
    );

    controls.dispose();

    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });

  it("forwards control events while active", () => {
    const { controls, stubs } = makeTransformControls();
    controls.attach(new THREE.Object3D());

    const forwarded: { type: string; mode: Transformation }[] = [];
    controls.addEventListener("mouseDown", (e) =>
      forwarded.push({ type: e.type, mode: e.mode }),
    );
    controls.addEventListener("mouseUp", (e) =>
      forwarded.push({ type: e.type, mode: e.mode }),
    );
    controls.addEventListener("objectChange", (e) =>
      forwarded.push({ type: e.type, mode: "rotate" }),
    );

    stubs.translate.dispatchEvent({ type: "mouseDown" });
    stubs.rotate.dispatchEvent({ type: "objectChange" });
    stubs.scale.dispatchEvent({ type: "mouseUp" });

    expect(forwarded).toEqual([
      { type: "mouseDown", mode: "translate" },
      { type: "objectChange", mode: "rotate" },
      { type: "mouseUp", mode: "scale" },
    ]);
    expect(stubs.rotate.syncMatrix).toHaveBeenCalledOnce();
  });

  it("removes its control event listeners on disposal", () => {
    const { controls, stubs } = makeTransformControls();
    controls.attach(new THREE.Object3D());

    const forwarded: string[] = [];
    controls.addEventListener("mouseDown", (e) => forwarded.push(e.type));
    controls.addEventListener("mouseUp", (e) => forwarded.push(e.type));
    controls.addEventListener("objectChange", (e) => forwarded.push(e.type));

    controls.dispose();

    stubs.translate.dispatchEvent({ type: "mouseDown" });
    stubs.rotate.dispatchEvent({ type: "mouseUp" });
    stubs.scale.dispatchEvent({ type: "objectChange" });

    expect(forwarded).toEqual([]);
    expect(stubs.translate.disposeCount).toBe(1);
    expect(stubs.rotate.disposeCount).toBe(1);
    expect(stubs.scale.disposeCount).toBe(1);
  });
});
