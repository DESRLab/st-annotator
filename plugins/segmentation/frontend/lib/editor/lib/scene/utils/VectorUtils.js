import * as THREE from 'three';

import { ThreeUtils } from 'sta/common/utils';

/**
 * @typedef {import('rbush-3d').BBox} BBox
 */

/**
 * @typedef {import('../tools').ParametricGeo} ParametricGeo
 */

/**
 * @typedef {import('../tools').VertexGeo} VertexGeo
 */

/**
 * Checks whether a points falls in side a circular geometry.
 * 
 * @param {Readonly<THREE.Vector3>} point The point to query.
 * @param {ParametricGeo} paramGeo The parametric parameters to
 * query the point based
 * @returns {boolean}  `True` if point is inside the circle.
 */
export function isPointInCircle(point, paramGeo) {
    if (paramGeo == null) return false;

    const { center, radius } = paramGeo;

    return (
        ((point.x - center.x) ** 2)
        + ((point.y - center.y) ** 2))
        < (radius ** 2);
}

/**
 * Subsitutes the points falling on the edges of a polygon.
 * 
 * @param {THREE.Vector2} pointA first point of the polygon.
 * @param {THREE.Vector2} pointB second point of the polygon.
 * @param {THREE.Vector3} queryPoint the point to check.
 * @returns {number} The resulting number.
 */
function substitutePointOnLine(pointA, pointB, queryPoint) {
    return ((queryPoint.y - pointA.y) * (pointB.x - pointA.x))
            - ((queryPoint.x - pointA.x) * (pointB.y - pointA.y));
}

/**
 * Checks whether a given 3d points falls inside a polygon.
 * 
 * @param {Readonly<THREE.Vector3>} point The point to query.
 * @param {VertexGeo} paramGeo The vertices parameters to query the point based on.
 * @returns {boolean} `true` if the point falls inside the geometry object.
 */
export function isPointInPolygon(point, paramGeo) {
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

        pointOnLine = substitutePointOnLine(pointA.clone(), pointB.clone(), point.clone());

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
 * 
 * @param {ReadonlyArray<THREE.Vector3>} value The first array for concatination.
 * @param {ReadonlyArray<THREE.Vector3>} other The second array in concatination.
 * @returns {THREE.Vector3[]} The resulting array
 */
export function concatRemoveDuplicates(value, other) {
    const uniqueMap = new Map();

    value.forEach((vec) => uniqueMap.set(`${vec.x},${vec.y},${vec.z}`, vec));
    other.forEach((vec) => uniqueMap.set(`${vec.x},${vec.y},${vec.z}`, vec));

    return [...uniqueMap.values()];
}

/**
 * Finds the disjoint elemnets of 
 * an array of vector3 based on another array.
 * 
 * @param {ReadonlyArray<THREE.Vector3>} value The first array.
 * @param {ReadonlyArray<THREE.Vector3>} other The other array.
 * @returns {THREE.Vector3[]} the resulting array.
 */
export function findDisjoint(value, other) {
    /**
     * @type {Record<string, boolean>}
     */
    const hashTable = {};

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
 * 
 * @param {THREE.Camera} camera The active camera in the scene.
 * @returns {{
 *      min: THREE.Vector3,
 *      max: THREE.Vector3,
 * }} The resulted min max vectors in the world space.
 */
export function getCameraWorldFrustumMinMax(camera) {
    const nearPlaneCorners = [
        new THREE.Vector3(-1, 1, -1),  // near Top-left
        new THREE.Vector3(1, 1, -1),   // near Top-right
        new THREE.Vector3(-1, -1, -1), // near Bottom-left
        new THREE.Vector3(1, -1, -1),   // near Bottom-right
        new THREE.Vector3(-1, 1, 1),   // far Top-left
        new THREE.Vector3(1, 1, 1),    // far Top-right
        new THREE.Vector3(-1, -1, 1),  // far Bottom-left
        new THREE.Vector3(1, -1, 1),    // far Bottom-right
    ].map((vector) => vector.unproject(camera));

    return ThreeUtils.findMinMax(nearPlaneCorners);
}

/**
 * Creates RBush-3D BBox from a given center and radius. 
 * 
 * @param {THREE.Vector3} center The center point.
 * @param {number} radius The radius distance from center point.
 * @returns {{
 *     minX: number;
 *     minY: number;
 *     minZ: number;
 *     maxX: number;
 *     maxY: number;
 *     maxZ: number;
 * }} The resulting bounding box.
 */
export function getBBoxByCenterRadius(center, radius) {
    return {
        minX: center.x - radius,
        minY: center.y - radius,
        minZ: center.z - radius,
        maxX: center.x + radius,
        maxY: center.y + radius,
        maxZ: center.z + radius,
    };
}

/**
 * Serializes threejs [min,max] vectors to RBush-3D BBox.
 * 
 * @param {THREE.Vector3} min The minimum vector.
 * @param {?THREE.Vector3} [max] The maximum vector.
 * @returns {BBox} The serialized vector to bbox.
 */
export function vectorToBBox(min, max = null) {
    let maxVector = max;

    if (maxVector == null) {
        maxVector = min.clone();
    }

    return {
        minX: min.x,
        minY: min.y,
        minZ: min.z,
        maxX: maxVector.x,
        maxY: maxVector.y,
        maxZ: maxVector.z,
    };
}

/**
 * Serializes threejs vector3 to RBush-3D BBox.
 * 
 * @param {THREE.Vector3[]} vectors The array of vector3 to serialize.
 * @returns {BBox[]} The array of serialized vectors to bboxes.
 */
export function vectorsToBBoxes(vectors) {
    return vectors.map((vector) => vectorToBBox(vector));
}

/**
 * Arranges the box points counter clock-wise.
 * 
 * @param {THREE.Vector2} topLeft The top-left corner of the box.
 * @param {THREE.Vector2} bottomRight The bottom-right corner of the box.
 * @returns {THREE.Vector2[]} The resulted array of vertices representing a rectangle box.
 */
export function setRectangleCoords(topLeft, bottomRight) {
    const boxVertices = [];

    boxVertices.push(topLeft);

    const bottomLeft = new THREE.Vector2(topLeft.x, bottomRight.y);
    boxVertices.push(bottomLeft);

    boxVertices.push(bottomRight);

    const topRight = new THREE.Vector2(bottomRight.x, topLeft.y);
    boxVertices.push(topRight);

    return boxVertices;
}
