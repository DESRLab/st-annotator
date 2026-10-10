import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { SnapToGroundMesh } from "../../../../../app/editor/scene/tools/SnapToGroundMesh";

function meshWithProjection(project: (ray: THREE.Raycaster) => number | null) {
  return {
    asObject3D: () => new THREE.Object3D(),
    raycast: vi.fn((ray: THREE.Raycaster) => {
      const y = project(ray);
      return y == null
        ? []
        : [
            {
              point: new THREE.Vector3(ray.ray.origin.x, y, ray.ray.origin.z),
            },
          ];
    }),
  } as any;
}

describe("SnapToGroundMesh", () => {
  it("is a no-op without a mesh, attachment, or intersection", () => {
    const object = new THREE.Object3D();
    object.position.set(1, 5, 2);
    const snapper = new SnapToGroundMesh(null);
    snapper.attach(object);
    snapper.snapToMesh();
    expect(object.position.toArray()).toEqual([1, 5, 2]);

    snapper.groundMesh = meshWithProjection(() => null);
    snapper.snapToMesh();
    expect(object.position.toArray()).toEqual([1, 5, 2]);
  });

  it("maintains the initial relative elevation as ground height changes", () => {
    const object = new THREE.Object3D();
    object.position.set(0, 5, 0);
    const mesh = meshWithProjection((ray) => (ray.ray.origin.x === 0 ? 2 : 10));
    const snapper = new SnapToGroundMesh(mesh);
    snapper.attach(object);
    object.position.x = 1;
    snapper.snapToMesh();
    expect(object.position.y).toBe(13);
  });

  it("prefers the downward intersection, honors disabled, and detaches cleanly", () => {
    const object = new THREE.Object3D();
    object.position.y = 5;
    const mesh = meshWithProjection((ray) =>
      ray.ray.direction.y < 0 ? 2 : 20,
    );
    const snapper = new SnapToGroundMesh(mesh);
    snapper.attach(object);
    object.position.y = 8;
    snapper.disabled = true;
    snapper.snapToMesh();
    expect(object.position.y).toBe(8);
    snapper.disabled = false;
    snapper.snapToMesh();
    expect(object.position.y).toBe(5);
    snapper.detach();
    object.position.y = 9;
    snapper.snapToMesh();
    expect(object.position.y).toBe(9);
  });
});
