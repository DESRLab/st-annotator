import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  concatRemoveDuplicates,
  findDisjoint,
  isPointInCircle,
  isPointInPolygon,
  setRectangleCoords,
} from "../../../../../app/editor/scene/utils/VectorUtils";

describe("segmentation query geometry", () => {
  it("uses a strict circle threshold and rejects degenerate radii", () => {
    const circle = { center: new THREE.Vector2(1, 1), radius: 2 };
    expect(isPointInCircle(new THREE.Vector3(1, 1, 99), circle)).toBe(true);
    expect(isPointInCircle(new THREE.Vector3(3, 1, 0), circle)).toBe(false);
    expect(
      isPointInCircle(new THREE.Vector3(1, 1, 0), {
        ...circle,
        radius: 0,
      }),
    ).toBe(false);
  });

  it("accepts polygon interiors but excludes edges, outside points, and degenerate polygons", () => {
    const square = {
      pixelVertices: [],
      ndcVertices: [
        new THREE.Vector2(-1, -1),
        new THREE.Vector2(1, -1),
        new THREE.Vector2(1, 1),
        new THREE.Vector2(-1, 1),
      ],
    };
    expect(isPointInPolygon(new THREE.Vector3(0, 0, 0), square)).toBe(true);
    expect(isPointInPolygon(new THREE.Vector3(1, 0, 0), square)).toBe(false);
    expect(isPointInPolygon(new THREE.Vector3(2, 0, 0), square)).toBe(false);
    expect(
      isPointInPolygon(new THREE.Vector3(0, 0, 0), {
        pixelVertices: [],
        ndcVertices: [],
      }),
    ).toBe(false);
  });

  it("implements Add and Erase point-set algebra without duplicate coordinates", () => {
    const a = new THREE.Vector3(1, 2, 3);
    const sameA = a.clone();
    const b = new THREE.Vector3(4, 5, 6);
    expect(concatRemoveDuplicates([a], [sameA, b])).toEqual([sameA, b]);
    expect(findDisjoint([a, b], [sameA])).toEqual([b]);
  });

  it("converts rectangle bounds without mutating inputs", () => {
    const topLeft = new THREE.Vector2(-1, 1);
    const bottomRight = new THREE.Vector2(1, -1);
    expect(
      setRectangleCoords(topLeft, bottomRight).map((point) => point.toArray()),
    ).toEqual([
      [-1, 1],
      [-1, -1],
      [1, -1],
      [1, 1],
    ]);
    expect(topLeft.toArray()).toEqual([-1, 1]);
    expect(bottomRight.toArray()).toEqual([1, -1]);
  });
});
