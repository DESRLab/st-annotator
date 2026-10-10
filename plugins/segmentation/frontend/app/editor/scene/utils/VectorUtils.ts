import * as THREE from "three";

import { ThreeUtils } from "sta/common";

export interface ParametricGeo {
  center: THREE.Vector2;
  radius: number;
}
export interface VertexGeo {
  pixelVertices: THREE.Vector2[];
  ndcVertices: THREE.Vector2[];
}

/**
 * Checks whether a points falls in side a circular geometry.
 */
export function isPointInCircle(
  point: Readonly<THREE.Vector3>,
  paramGeo: ParametricGeo,
): boolean {
  if (paramGeo == null) return false;

  const { center, radius } = paramGeo;

  return (point.x - center.x) ** 2 + (point.y - center.y) ** 2 < radius ** 2;
}

/**
 * Subsitutes the points falling on the edges of a polygon.
 */
function substitutePointOnLine(
  pointA: THREE.Vector2,
  pointB: THREE.Vector2,
  queryPoint: THREE.Vector3,
): number {
  return (
    (queryPoint.y - pointA.y) * (pointB.x - pointA.x) -
    (queryPoint.x - pointA.x) * (pointB.y - pointA.y)
  );
}

/**
 * Checks whether a given 3d points falls inside a polygon.
 */
export function isPointInPolygon(
  point: Readonly<THREE.Vector3>,
  paramGeo: VertexGeo,
): boolean {
  if (paramGeo == null || point == null) return false;

  const polygon = paramGeo.ndcVertices;

  let windingNum = 0;
  let pointOnLine = 0;

  for (let i = 0; i < polygon.length; i++) {
    const pointA = polygon.at(i);
    const pointB = polygon.at((i + 1) % polygon.length);
    if (pointA == null || pointB == null) {
      return false;
    }

    pointOnLine = substitutePointOnLine(
      pointA.clone(),
      pointB.clone(),
      point.clone(),
    );

    if (pointOnLine === 0.0) {
      return false;
    }

    if (pointA.y <= point.y) {
      if (pointB.y > point.y) {
        if (pointOnLine > 0) {
          windingNum += 1;
        }
      }
    } else {
      if (pointB.y < point.y) {
        if (pointOnLine < 0) {
          windingNum -= 1;
        }
      }
    }
  }

  return windingNum !== 0;
}

/**
 * Concatinates two array of vector3 and removes the duplicate points.
 */
export function concatRemoveDuplicates(
  value: readonly THREE.Vector3[],
  other: readonly THREE.Vector3[],
): THREE.Vector3[] {
  const uniqueMap = new Map<string, THREE.Vector3>();

  value.forEach((vec) => uniqueMap.set(`${vec.x},${vec.y},${vec.z}`, vec));
  other.forEach((vec) => uniqueMap.set(`${vec.x},${vec.y},${vec.z}`, vec));

  return [...uniqueMap.values()];
}

/**
 * Finds the disjoint elemnets of
 * an array of vector3 based on another array.
 */
export function findDisjoint(
  value: readonly THREE.Vector3[],
  other: readonly THREE.Vector3[],
): THREE.Vector3[] {
  const hashTable: Record<string, boolean> = {};

  other.forEach((vector) => {
    const id = `${vector.x}_${vector.y}_${vector.z}`;
    hashTable[id] = true;
  });

  return [...value].filter((vector) => {
    const id = `${vector.x}_${vector.y}_${vector.z}`;
    return !hashTable[id];
  });
}

/**
 * Obtains camera's frustum [min/max] corners in world space.
 */
export function getCameraWorldFrustumMinMax(camera: THREE.Camera): {
  min: THREE.Vector3;
  max: THREE.Vector3;
} {
  const nearPlaneCorners = [
    new THREE.Vector3(-1, 1, -1), // near Top-left
    new THREE.Vector3(1, 1, -1), // near Top-right
    new THREE.Vector3(-1, -1, -1), // near Bottom-left
    new THREE.Vector3(1, -1, -1), // near Bottom-right
    new THREE.Vector3(-1, 1, 1), // far Top-left
    new THREE.Vector3(1, 1, 1), // far Top-right
    new THREE.Vector3(-1, -1, 1), // far Bottom-left
    new THREE.Vector3(1, -1, 1), // far Bottom-right
  ].map((vector) => vector.unproject(camera));

  return ThreeUtils.findMinMax(nearPlaneCorners);
}

/**
 * Arranges the box points counter clock-wise.
 */
export function setRectangleCoords(
  topLeft: THREE.Vector2,
  bottomRight: THREE.Vector2,
): THREE.Vector2[] {
  const boxVertices: THREE.Vector2[] = [];

  boxVertices.push(topLeft);

  const bottomLeft = new THREE.Vector2(topLeft.x, bottomRight.y);
  boxVertices.push(bottomLeft);

  boxVertices.push(bottomRight);

  const topRight = new THREE.Vector2(bottomRight.x, topLeft.y);
  boxVertices.push(topRight);

  return boxVertices;
}

/**
 * Obtains a float32 array from an array of `three.js` coordinates.
 */
export function asFloat32(
  value: readonly THREE.Vector3[],
): Float32Array<ArrayBuffer> {
  const arrFloat32 = new Float32Array(value.length * 3);
  for (const [i, { x, y, z }] of value.entries()) {
    arrFloat32.set([x, y, z], i * 3);
  }

  return arrFloat32;
}

/**
 * Calculates the distance between two coordinates.
 */
export function distance(
  a: Readonly<THREE.Vector3>,
  b: Readonly<THREE.Vector3>,
): number {
  const v1 = new THREE.Vector3(a.x, a.y, a.z);
  const v2 = new THREE.Vector3(b.x, b.y, b.z);

  return v1.distanceTo(v2);
}
