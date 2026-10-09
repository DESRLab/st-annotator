import { Polygon, Polyline } from '@arcgis/core/geometry';

import { MathUtils } from 'sta/common/utils';

/**
 * @typedef {import('three')} THREE
 */

/**
 * @typedef {import('../../../label/lib').VectorType} VectorType
 */

/**
 * @param {ReadonlyArray<THREE.Vector3>} vertices The vertices
 * shaping a point object.
 * @returns {boolean} `true` if the vertices are shaping a valid point object.
 */
export function isValidPoint(vertices) {
    if (vertices.length > 1 || vertices.length === 0) return false;
    const vertex = vertices.at(0)?.clone();
    if (vertex == null) {
        return false;
    }
    return (
        MathUtils.isNumeric(vertex.x)
        && MathUtils.isNumeric(vertex.y)
        && MathUtils.isNumeric(vertex.z)
    );
}

/**
 * @param {ReadonlyArray<THREE.Vector3>} vertices The vertices
 * shaping a polygon object.
 * @returns {boolean} `true` if the vertices are shaping a valid polygon object.
 */
export function isValidPolygon(vertices) {
    if (vertices.length < 4) return false;
    const firstPoint = vertices.at(0);
    const lastPoint = vertices.at(-1);

    const coordinates = vertices.map((vertex) => [vertex.x, vertex.y, vertex.z]);
    try {
        if (firstPoint == null || lastPoint == null) return false;

        const isClosed = firstPoint.equals(lastPoint);

        const vector = new Polygon({ rings: [coordinates], hasZ: true });

        return ((!vector.isSelfIntersecting) && vector.initialized && isClosed);
    } catch (error) {
        return false;
    }
}

/**
 * @param {ReadonlyArray<THREE.Vector3>} vertices The vertices
 * shaping a line object.
 * @returns {boolean} `true` if the vertices are shaping a valid line object.
 */
export function isValidLine(vertices) {
    if (vertices.length < 2) return false;

    const coordinates = vertices.map((vertex) => [vertex.x, vertex.y, vertex.z]);

    try {
        const vector = new Polyline({ paths: [coordinates], hasZ: true });

        return (vector.initialized);
    } catch (error) {
        return false;
    }
}

/**
 * Validates the vector object based on its type.
 * 
 * @param {ReadonlyArray<THREE.Vector3>} vertices The vertices shaping a vector.
 * @param {VectorType} vectorType The vectorType that is being validated
 * @returns {boolean} `true` if the vertices are shaping a valid vector.
 */
export function isValidVector(vertices, vectorType) {
    switch (vectorType) {
        case 'Polygon':
            return isValidPolygon(vertices);
        case 'LineString':
            return isValidLine(vertices);
        case 'Point':
            return isValidPoint(vertices);
        default:
            return false;
    }
}
