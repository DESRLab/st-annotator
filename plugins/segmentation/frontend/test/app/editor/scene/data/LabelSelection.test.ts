import { describe, expect, it } from "vitest";

import type { EditorConfig } from "sta/app/editor";
import * as THREE from "three";

import { LabelSelection } from "../../../../../app/editor/scene/data/LabelSelection";
import { labelSelectionToPlain } from "../../../../../app/editor/scene/data/SegmentationIndex";

describe("LabelSelection coordinate conversion", () => {
  it("projects database XYZ points into Three.js ZXY coordinates", () => {
    const config = {
      coordinateFormat: {
        toString: () => "CoordinateFormat.ZXY",
        toDatabaseCoords: (point: THREE.Vector3) =>
          point.clone().set(point.z, point.x, point.y),
        toThreeJSCoords: (point: THREE.Vector3) =>
          point.clone().set(point.y, point.z, point.x),
      },
    } as unknown as EditorConfig;
    const selection = new LabelSelection({
      config,
      labels: null,
      id: "selection-a",
      points: [new THREE.Vector3(1, 2, 3)],
    });

    expect(selection.points[0].toArray()).toEqual([1, 2, 3]);
    expect(selection.pointCoords[0].toArray()).toEqual([2, 3, 1]);

    selection.points = [new THREE.Vector3(4, 5, 6)];
    expect(selection.points[0].toArray()).toEqual([4, 5, 6]);
    expect(selection.pointCoords[0].toArray()).toEqual([5, 6, 4]);
  });
});

describe("LabelSelection rendering", () => {
  it("lets source point colors show through an overlapping selection", () => {
    const config = {
      coordinateFormat: {
        toThreeJSCoords: (point: THREE.Vector3) => point.clone(),
      },
    } as unknown as EditorConfig;
    const selection = new LabelSelection({
      config,
      labels: null,
      id: "selection-a",
      points: [new THREE.Vector3(1, 2, 3)],
    });
    const points = selection
      .asObject3D()
      .children.find(
        (child): child is THREE.Points =>
          child instanceof THREE.Points && child.visible,
      );

    expect(points).toBeDefined();
    const material = points?.material as THREE.PointsMaterial;
    expect(material.transparent).toBe(true);
    expect(material.opacity).toBeGreaterThan(0);
    expect(material.opacity).toBeLessThan(1);
    expect(material.depthWrite).toBe(false);

    selection.setDisplayOptions({ opacity: 0.2 });
    expect(selection.opacity).toBe(0.2);
    expect(labelSelectionToPlain(selection).opacity).toBe(0.2);
    expect(material.opacity).toBe(0.2);
    selection.points = [new THREE.Vector3(4, 5, 6)];
    const updatedPoints = selection
      .asObject3D()
      .children.find(
        (child): child is THREE.Points =>
          child instanceof THREE.Points && child.visible,
      );
    expect((updatedPoints?.material as THREE.PointsMaterial).opacity).toBe(0.2);

    selection.setDisplayOptions({ opacity: 1 });
    const opaqueMaterial = updatedPoints?.material as THREE.PointsMaterial;
    expect(opaqueMaterial.opacity).toBe(1);
    expect(opaqueMaterial.transparent).toBe(false);
    expect(opaqueMaterial.depthWrite).toBe(true);
  });
});
