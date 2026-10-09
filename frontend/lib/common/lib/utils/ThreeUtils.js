import _ from 'lodash';
import * as THREE from 'three';

import * as MathUtils from './MathUtils';

/**
 * The threshold used to check if a value is close enough to zero.
 * 
 * @type {number}
 */
export const EPSILON = 1e-07;

/**
 * Checks if two numbers are close to each other, i.e., the absolute difference between them is
 * equal to or less than a threshold.
 * 
 * @param {number} a The first number to compare.
 * @param {number} b The second number to compare.
 * @param {number} tol The tolerance threshold, which defaults to {@link EPSILON}.
 * @returns {boolean} `true` if the two numbers are close to each other; otherwise, `false`.
 */
export function isAbsClose(a, b, tol = EPSILON) {
    return Math.abs(a - b) <= tol;
}

/**
 * Checks if two numbers are close to each other, i.e., the relative difference between them is
 * equal to or less than a threshold.
 * 
 * @param {number} a The first number to compare.
 * @param {number} b The second number to compare.
 * @param {number} tol The tolerance threshold, which defaults to {@link EPSILON}.
 * @returns {boolean} `true` if the two numbers are close to each other; otherwise, `false`.
 */
export function isRelClose(a, b, tol = EPSILON) {
    return (1 - tol) * b <= a && a <= (1 + tol) * b;
}

/**
 * Checks if x,y,z coordinates of two vector3 are close to each other, 
 * i.e., the absolute difference between them is
 * equal to or less than a threshold.
 * 
 * @param {THREE.Vector3} value The first vector3 to compare.
 * @param {THREE.Vector3} other The second vector3 to compare.
 * @param {number} tol The tolerance threshold, which defaults to {@link EPSILON}.
 * @returns {boolean} `true` if the two numbers are close to each other; otherwise, `false`.
 */
export function isVectorClose(value, other, tol = EPSILON) {
    const v = value.clone();
    const o = other.clone();

    return (isAbsClose(v.x, o.x, tol) && isAbsClose(v.y, o.y, tol) && isAbsClose(v.z, o.z, tol));
}

/**
 * Applies a function to each element of a vector, modifying it in-place.
 * 
 * @param {THREE.Vector3} v The vector to modify.
 * @param {(value: number) => number} fn The function to apply.
 * @returns {THREE.Vector3} The modified input vector.
 */
export function mapVector3(v, fn) {
    return v.set(fn(v.x), fn(v.y), fn(v.z));
}

/**
 * Applies a function to each element of a pair of vectors, resulting in a new vector.
 * 
 * @param {THREE.Vector3} v1 The first vector in the pair.
 * @param {THREE.Vector3} v2 The second vector in the pair.
 * @param {(value1: number, value2: number) => number} fn The function to apply.
 * @returns {THREE.Vector3} The new vector.
 */
export function zipVector3(v1, v2, fn) {
    return new THREE.Vector3(fn(v1.x, v2.x), fn(v1.y, v2.y), fn(v1.z, v2.z));
}

/**
 * Computes the element-wise sum of one or more matrices.
 * 
 * @param {THREE.Matrix3} mat The first matrix.
 * @param {...THREE.Matrix3} mats The other matrices.
 * @returns {THREE.Matrix3} The output matrix.
 */
export function sumMatrix3(mat, ...mats) {
    const result = new THREE.Matrix3().multiplyScalar(0);
    const resultElements = result.elements;

    for (const m of [mat, ...mats]) {
        m.elements.forEach((e, i) => {
            MathUtils.assertIsNumeric(e);

            resultElements[i] += e;
        });
    }

    return result;
}

/**
 * Sets the attributes for a `three.js` geometry from an array of normals.
 * 
 * @param {THREE.BufferGeometry} geometry The geometry the update.
 * @param {THREE.Vector3[]} normals A dense array containing the normals to assign.
 * @returns {THREE.BufferGeometry} The modified geometry.
 */
export function setFromNormals(geometry, normals) {
    const normal = [];

    for (let i = 0, l = normals.length; i < l; i++) {
        const c = normals[i];
        normal.push(c.x, c.y, c.z);
    }

    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));

    return geometry;
}

/**
 * Sets the attributes for a `three.js` geometry from an array of colors.
 * 
 * @param {THREE.BufferGeometry} geometry The geometry the update.
 * @param {THREE.Color[]} colors A dense array containing the colors to assign.
 * @returns {THREE.BufferGeometry} The modified geometry.
 */
export function setFromColors(geometry, colors) {
    const color = [];

    for (let i = 0, l = colors.length; i < l; i++) {
        const c = colors[i];
        color.push(c.r, c.g, c.b);
    }

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));

    return geometry;
}

/**
 * Gets the normalized device coordinates of the pointer when an event is fired.
 * 
 * @param {HTMLElement} domElement The HTML element which the event was fired from.
 * @param {PointerEvent} event The event being fired.
 * @returns {{x: number, y: number}} The normalized device coordinates.
 */
export function getPointerNDC(domElement, event) {
    if (domElement.ownerDocument.pointerLockElement) {
        return { x: 0, y: 0 };
    }

    const rect = domElement.getBoundingClientRect();
    return {
        x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
        y: -(((event.clientY - rect.top) / rect.height) * 2 - 1),
    };
}

/**
 * Further normalizes a set of normalized device coordinates to relative coordinates,
 * which fall in the interval `[0, 1]`.
 * 
 * @param {{ x: number, y: number }} ndc The input normalized device coordinates.
 * @returns {{ x: number, y: number }} The relative coordinates.
 */
export function getNDCRelPos(ndc) {
    return {
        y: 1 - (ndc.y + 1) / 2,
        x: (ndc.x + 1) / 2,
    };
}

/**
 * Gets the position of a point relative to an element, based on its {@link DOMRect}.
 * 
 * This is useful when computing the position of many points at once, since it avoids
 * the high overhead of recomputing {@link Element#getBoundingClientRect}.
 * 
 * @param {{ width: number, height: number }} rect The width and height of the element.
 * @param {{ x: number, y: number }} ndc The normalized device coordinates of the point within
 * `domElement`.
 * @returns {{ top: number, left: number }} The position of the point from the inner left and top
 * borders of the element, respectively.
 */
export function getNDCRectPos(rect, ndc) {
    const relPos = getNDCRelPos(ndc);

    return {
        top: rect.height * relPos.y,
        left: rect.width * relPos.x,
    };
}

/**
 * Gets the position of a point relative to an element.
 * 
 * @param {HTMLElement} domElement The HTML element containing the point.
 * @param {{ x: number, y: number }} ndc The normalized device coordinates of the point within
 * `domElement`.
 * @returns {{ top: number, left: number }} The position of the point from the inner left and top
 * borders of the element, respectively.
 */
export function getNDCElemPos(domElement, ndc) {
    const rect = domElement.getBoundingClientRect();

    return getNDCRectPos(rect, ndc);
}

/**
 * Gets the position of a point in the viewport.
 * 
 * @param {HTMLElement} domElement The HTML element containing the point.
 * @param {{ x: number, y: number }} ndc The normalized device coordinates of the point within
 * `domElement`.
 * @returns {{ top: number, left: number }} The position of the point from the inner left and top
 * borders of the viewport, respectively.
 */
export function getNDCClientPos(domElement, ndc) {
    const rect = domElement.getBoundingClientRect();
    const elemPos = getNDCElemPos(domElement, ndc);

    return {
        top: rect.top + elemPos.top,
        left: rect.left + elemPos.left,
    };
}

/**
 * Calculates the 3D points in world coordinates into camera space.
 * or (normalized device coordinates).
 * 
 * @param {THREE.Vector3[]} points The list of world point coordinates.
 * @param {THREE.Camera} camera The camera of the current scene.
 * @returns {THREE.Vector3[]} The array of normalized device coordinates.
 */
export function worldCoordsToNDC(points, camera) {
    return points.map((point) => point.clone().project(camera));
}

/**
 * Sets the threshold when raycasting against points.
 * 
 * @param {THREE.Raycaster} raycaster The raycaster to update. It is modified by this method.
 * @param {number} threshold The threshold to set.
 */
export function setRaycasterPointsThreshold(raycaster, threshold) {
    if (raycaster.params.Points == null) {
        raycaster.params.Points = { threshold };
    } else {
        raycaster.params.Points.threshold = threshold;
    }
}

/**
 * Sets the threshold when raycasting against points.
 * 
 * @param {THREE.Raycaster} raycaster The raycaster to update. It is modified by this method.
 * @param {number} threshold The threshold to set.
 */
export function setRaycasterLineThreshold(raycaster, threshold) {
    if (raycaster.params.Line == null) {
        raycaster.params.Line = { threshold };
    } else {
        raycaster.params.Line.threshold = threshold;
    }
}

/**
 * Updates a raycaster according to the position of the pointer when it is moved.
 * 
 * @param {THREE.Raycaster} raycaster The raycaster to update. It is modified by this method.
 * @param {THREE.Camera} camera The camera from which the ray should originate.
 * @param {HTMLElement} domElement The HTML element which the event was fired from.
 * @param {PointerEvent} event The event being fired.
 * @returns {THREE.Raycaster} The updated raycaster.
 */
export function updateRaycaster(raycaster, camera, domElement, event) {
    const { x, y } = getPointerNDC(domElement, event);
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    return raycaster;
}

/**
 * Checks that an inputted size is non-negative.
 * 
 * @param {number} size The input size.
 * @returns {number} The input size, or a fallback value equal to taking the absolute value of
 * `size`. In the case that the input is {@link NaN}, fallbacks to `0`.
 */
export function checkSize(size) {
    const isnan = Number.isNaN(size);

    if (isnan || size < 0) {
        console.error(`The size must be non-negative. Found: ${size}`);

        // Fallback value
        return isnan ? 0 : -size;
    }

    return size;
}

/**
 * Checks that an inputted opacity is in the range `[0, 1]`.
 * 
 * @param {number} opacity The input opacity.
 * @returns {number} The input opacity, or a fallback value equal to clamping `opacity` to
 * its valid range. In the case that the input is {@link NaN}, fallbacks to `0`.
 */
export function checkOpacity(opacity) {
    const isnan = Number.isNaN(opacity);

    if (isnan || opacity < 0 || opacity > 1) {
        console.error(`The opacity must be in the range [0, 1]. Found: ${opacity}`);

        // Fallback value
        return isnan ? 0 : _.clamp(opacity, 0, 1);
    }

    return opacity;
}

/**
 * Checks whether vector coordinates exists in an array.
 * 
 * @param {ReadonlyArray<THREE.Vector>} array The given array for search.
 * @param {THREE.Vector} point The desired point to search for.
 * @returns {boolean} `true` if the point exist in the array.
 */
export function isCoordinatesInArray(array, point) {
    return array.some((vec) => vec.equals(point));
}

/**
 * Performs a deep comparison between two array of vertices
 *  to determine if they are equivalent.
 * 
 * @param {ReadonlyArray<THREE.Vector3>} value The first array.
 * @param {ReadonlyArray<THREE.Vector3>} other The second array.
 * @returns {boolean} `true` if the vertices of two arrays are equal.
 */
export function areVerticesEqual(value, other) {
    const serializedValue = value.map((vertex) => JSON.stringify(vertex));
    const serializedOther = other.map((vertex) => JSON.stringify(vertex));

    return _.isEqual(serializedValue, serializedOther);
}

/**
 * Gets the min and max coordinates of a given Vector3 array.
 * 
 * @param {ReadonlyArray<THREE.Vector3>} value The array to find the min and max value from.
 * @returns {{ min: THREE.Vector3, max: THREE.Vector3 }} The corresponding min and max coordinates 
 * of requested array.
 */
export function findMinMax(value) {
    const serializedValue = value.map((vertex) => ({
        x: vertex.clone().x,
        y: vertex.clone().y,
        z: vertex.clone().z,
    }));

    const minX = _.minBy(serializedValue, 'x')?.x ?? 0;
    const minY = _.minBy(serializedValue, 'y')?.y ?? 0;
    const minZ = _.minBy(serializedValue, 'z')?.z ?? 0;
    const minCoords = new THREE.Vector3(minX, minY, minZ);

    const maxX = _.maxBy(serializedValue, 'x')?.x ?? 0;
    const maxY = _.maxBy(serializedValue, 'y')?.y ?? 0;
    const maxZ = _.maxBy(serializedValue, 'z')?.z ?? 0;
    const maxCoords = new THREE.Vector3(maxX, maxY, maxZ);

    return {
        min: minCoords,
        max: maxCoords,
    };
}

/**
 * Calculates the center point of vector3 array.
 * 
 * @param {ReadonlyArray<THREE.Vector3>} value The array to find the min and max value from.
 * @returns {THREE.Vector3} The corresponding min and max coordinates 
 * of requested array.
 */
export function findCenter(value) {
    const center = new THREE.Vector3();

    value.forEach((vector) => {
        center.add(vector.clone());
    });

    return center.divideScalar(value.length);
}
