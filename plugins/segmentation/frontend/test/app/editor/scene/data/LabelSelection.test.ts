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
          child instanceof THREE.Points &&
          child !== selection.centerAsObject3D() &&
          child.visible,
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
          child instanceof THREE.Points &&
          child !== selection.centerAsObject3D() &&
          child.visible,
      );
    expect((updatedPoints?.material as THREE.PointsMaterial).opacity).toBe(0.2);

    selection.setDisplayOptions({ opacity: 1 });
    const opaqueMaterial = updatedPoints?.material as THREE.PointsMaterial;
    expect(opaqueMaterial.opacity).toBe(1);
    expect(opaqueMaterial.transparent).toBe(false);
    expect(opaqueMaterial.depthWrite).toBe(true);
  });
});

describe("selection session visibility", () => {
  it("keeps only the centroid visible and pickable when hidden, while respecting isolation", () => {
    const config = {
      coordinateFormat: {
        toThreeJSCoords: (point: THREE.Vector3) => point.clone(),
      },
    } as unknown as EditorConfig;
    const selection = new LabelSelection({
      config,
      labels: null,
      id: "selection-a",
      points: [new THREE.Vector3(-4, 0, 0), new THREE.Vector3(4, 0, 0)],
      showCenter: false,
    });
    const centerRay = new THREE.Raycaster(
      new THREE.Vector3(0, 0, 10),
      new THREE.Vector3(0, 0, -1),
    );
    const surfaceRay = new THREE.Raycaster(
      new THREE.Vector3(4, 0, 10),
      new THREE.Vector3(0, 0, -1),
    );
    centerRay.params.Points.threshold =
      surfaceRay.params.Points.threshold = 0.1;
    selection.asObject3D().updateMatrixWorld(true);
    expect(selection.centerAsObject3D().visible).toBe(true);
    expect(selection.raycast(centerRay)[0]?.object).toBe(
      selection.centerAsObject3D(),
    );
    expect(selection.raycast(surfaceRay).length).toBeGreaterThan(0);
    let notifications = 0;
    selection.addEventListener("change", () => {
      notifications++;
    });
    selection.setHidden(true);
    selection.setHidden(true);
    expect(notifications).toBe(1);
    expect(selection.asObject3D().visible).toBe(true);
    expect(
      selection.asObject3D().children.filter((child) => child.visible),
    ).toEqual([selection.centerAsObject3D()]);
    expect(selection.raycast(centerRay)[0]?.object).toBe(
      selection.centerAsObject3D(),
    );
    expect(selection.raycast(surfaceRay)).toEqual([]);
    selection.setDisplayVisibility(false);
    expect(selection.asObject3D().visible).toBe(false);
    expect(selection.raycast(centerRay)).toEqual([]);
    selection.setDisplayVisibility(true);
    expect(selection.hidden).toBe(true);
    expect(selection.raycast(surfaceRay).length).toBeGreaterThan(0);
    selection.setDisplayVisibility(null);
    expect(selection.raycast(surfaceRay)).toEqual([]);
    expect(selection.raycast(centerRay).length).toBeGreaterThan(0);
    selection.setHidden(false);
    expect(selection.showCenter).toBe(false);
    expect(selection.raycast(surfaceRay).length).toBeGreaterThan(0);
    selection.dispose();
  });

  it("moves the centroid with hidden label edits and has no marker for an empty label", () => {
    const config = {
      coordinateFormat: {
        toThreeJSCoords: (point: THREE.Vector3) => point.clone(),
      },
    } as unknown as EditorConfig;
    const selection = new LabelSelection({
      config,
      labels: null,
      id: "selection-a",
      points: [],
    });
    expect(selection.centerAsObject3D().visible).toBe(false);
    selection.setHidden(true);
    selection.points = [new THREE.Vector3(2, 3, 4), new THREE.Vector3(4, 5, 6)];
    expect(selection.centerPoint.toArray()).toEqual([3, 4, 5]);
    expect(selection.centerAsObject3D().visible).toBe(true);
    expect(
      selection.asObject3D().children.filter((child) => child.visible),
    ).toEqual([selection.centerAsObject3D()]);
    selection.setDisplayVisibility(false);
    selection.points = [new THREE.Vector3(1, 2, 3)];
    expect(selection.asObject3D().visible).toBe(false);
    selection.dispose();
  });
});
