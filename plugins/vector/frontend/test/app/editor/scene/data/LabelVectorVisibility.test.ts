import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { EditorConfig } from "sta/app/editor";

import { LabelVector } from "../../../../../app/editor/scene/data/LabelVector";
import { VectorType } from "../../../../../models";

const config = {
  coordinateFormat: {
    toThreeJSCoords: (point: THREE.Vector3) => point.clone(),
    toDatabaseCoords: (point: THREE.Vector3) => point.clone(),
  },
} as unknown as EditorConfig;

function rayAt(x: number, y: number) {
  const ray = new THREE.Raycaster(
    new THREE.Vector3(x, y, 10),
    new THREE.Vector3(0, 0, -1),
  );
  ray.params.Points.threshold = ray.params.Line.threshold = 0.1;
  return ray;
}

describe("vector session visibility", () => {
  it.each([
    [VectorType.POINT, [new THREE.Vector3(0, 0, 0)], [0, 0]],
    [
      VectorType.POLYLINE,
      [
        new THREE.Vector3(-4, -2, 0),
        new THREE.Vector3(0, 4, 0),
        new THREE.Vector3(4, -2, 0),
      ],
      [0, 0],
    ],
    [
      VectorType.POLYGON,
      [
        new THREE.Vector3(-4, -2, 0),
        new THREE.Vector3(0, 4, 0),
        new THREE.Vector3(4, -2, 0),
        new THREE.Vector3(-4, -2, 0),
      ],
      [0, 0],
    ],
  ] as const)(
    "keeps a clickable centroid for hidden %s labels",
    (vectorType, vertices, center) => {
      const vector = new LabelVector({
        config,
        labels: null,
        id: "vector-a",
        vectorType,
        vertices: [...vertices],
      });
      const marker = () =>
        vector
          .asObject3D()
          .children.find((child) => child instanceof THREE.Points)!;
      vector.asObject3D().updateMatrixWorld(true);
      expect(marker()?.visible).toBe(true);
      expect(vector.centerPoint.toArray()).toEqual([0, 0, 0]);
      expect(
        (marker() as THREE.Points).geometry.getAttribute("position").getX(0),
      ).toBe(vector.centerPoint.x);
      expect(
        vector.raycast(rayAt(...center)).some((hit) => hit.object === marker()),
      ).toBe(true);
      const changed = vi.fn();
      vector.addEventListener("change", changed);
      vector.setHidden(true);
      vector.setHidden(true);
      expect(changed).toHaveBeenCalledTimes(1);
      expect(vector.getGeo().geo.material.visible).toBe(false);
      expect(vector.asObject3D().visible).toBe(true);
      expect(vector.raycast(rayAt(...center)).map((hit) => hit.object)).toEqual(
        [marker()],
      );
      if (vertices.length > 1)
        expect(vector.raycast(rayAt(-4, -2))).toEqual([]);
      vector.setDisplayVisibility(false);
      expect(vector.raycast(rayAt(...center))).toEqual([]);
      vector.render();
      expect(vector.asObject3D().visible).toBe(false);
      vector.setDisplayVisibility(true);
      expect(vector.hidden).toBe(true);
      expect(vector.getGeo().geo.material.visible).toBe(true);
      if (vertices.length > 1)
        expect(vector.raycast(rayAt(-4, -2)).length).toBeGreaterThan(0);
      vector.setDisplayVisibility(null);
      expect(vector.getGeo().geo.material.visible).toBe(false);
      expect(vector.raycast(rayAt(...center)).length).toBeGreaterThan(0);
      vector.vertices = vertices.map((point) =>
        point.clone().add(new THREE.Vector3(10, 0, 0)),
      );
      vector.asObject3D().updateMatrixWorld(true);
      expect(vector.raycast(rayAt(10, 0)).map((hit) => hit.object)).toEqual([
        marker(),
      ]);
      expect(vector.raycast(rayAt(0, 0))).toEqual([]);
      vector.getGeo().vectorCoords = vertices.map((point) =>
        point.clone().add(new THREE.Vector3(20, 0, 0)),
      );
      vector.asObject3D().updateMatrixWorld(true);
      expect(vector.centerPoint.toArray()).toEqual([20, 0, 0]);
      expect(vector.raycast(rayAt(20, 0)).map((hit) => hit.object)).toEqual([
        marker(),
      ]);
      vector.rollbackCoords(
        vertices.map((point) => point.clone().add(new THREE.Vector3(10, 0, 0))),
      );
      vector.asObject3D().updateMatrixWorld(true);
      expect(vector.raycast(rayAt(10, 0)).map((hit) => hit.object)).toEqual([
        marker(),
      ]);
      const disposeMarker = vi.spyOn(
        (marker() as THREE.Points).geometry,
        "dispose",
      );
      vector.dispose();
      expect(disposeMarker).toHaveBeenCalledOnce();
    },
  );
});
