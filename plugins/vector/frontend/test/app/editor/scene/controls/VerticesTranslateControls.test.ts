import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import type { WindowPointer } from "sta/app/editor";

import { LineGeo } from "../../../../../app/editor/scene/data/views/LineGeo";
import { VerticesTranslateControls } from "../../../../../app/editor/scene/controls/VerticesTranslateControls";

describe("whole-vector centroid handle", () => {
  it("moves every vertex without snapping an off-center grab to the pointer", () => {
    const object = new LineGeo({
      vectorCoords: [new THREE.Vector3(0, 3, 0), new THREE.Vector3(6, 3, 4)],
      color: new THREE.Color("red"),
    });
    object.enableCenter();
    const pointer = {
      createDragController: () =>
        Object.assign(new THREE.EventDispatcher(), {
          dispose: vi.fn(),
        }),
    } as unknown as WindowPointer;
    const controls = new VerticesTranslateControls(
      pointer,
      new THREE.Raycaster(),
      1,
    );
    controls.object = object;
    const handle = [...controls.draggableGroup!.objects][0];
    vi.spyOn(controls, "draggedElement", "get").mockReturnValue(handle);
    controls.applyTransform(
      new THREE.Vector3(3.2, 3, 2),
      new THREE.Vector3(5.2, 9, 5),
    );
    expect(object.vectorCoords.map((point) => point.toArray())).toEqual([
      [2, 3, 3],
      [8, 3, 7],
    ]);
    expect(handle.position.toArray()).toEqual([5, 3, 5]);
    expect(handle.position.toArray()).toEqual(object.centerPoint.toArray());
    controls.dispose();
    object.dispose();
  });
  it.each([false, true])("uses the vertex centroid (closed: %s)", (closed) => {
    const points = [
      new THREE.Vector3(0, 3, 0),
      new THREE.Vector3(9, 3, 0),
      new THREE.Vector3(0, 3, 6),
    ];
    if (closed) points.push(points[0].clone());
    const [handle] = VerticesTranslateControls.createElements(points);
    expect(handle.position.toArray()).toEqual([3, 3, 2]);
    handle.updateMatrixWorld(true);
    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(3, 10, 2),
      new THREE.Vector3(0, -1, 0),
    );
    expect(handle.raycast(raycaster)[0]?.object).toBe(handle);
    raycaster.ray.origin.x = 30;
    expect(handle.raycast(raycaster)).toEqual([]);
    // Keep the draggable surface; the label supplies the center marker.
    const plane = handle.children.find((child) => child instanceof THREE.Mesh);
    expect(plane).toBeDefined();
    expect((plane as THREE.Mesh).visible).toBe(true);
    raycaster.ray.origin.set(5, 10, 3);
    expect(handle.raycast(raycaster)[0]?.object).toBe(handle);
    expect(
      handle.children.filter((child) => child instanceof THREE.Mesh),
    ).toHaveLength(1);
  });
});
