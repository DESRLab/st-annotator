import * as THREE from 'three';

import { VectorGeo, VectorBuilder } from './VectorGeo';

/**
 * @typedef {import('./VectorGeo').VectorBuilderParams} VectorBuilderParams
 */

/**
 * @typedef {import('./VectorGeo').Line} Line
 */

/**
 * Represents polygon and polyline geometries.
 * 
 * @augments VectorGeo<Line>
 */
export class LineGeo extends VectorGeo {

    /**
     * Updates the shape of the `three.js` components of this polyline.
     */
    updateVector() {
        const vectorCoords = [...this.vectorCoords];
        const position = this.geo.geometry.getAttribute('position');
        const sizeChanged = vectorCoords.length !== position.count;

        if (sizeChanged) {
            const geometry = new THREE.BufferGeometry().setFromPoints(vectorCoords);
            const material = this.geo.material.clone();
            this.geo = new THREE.Line(geometry, material);
        } else {
            vectorCoords.forEach(({ x, y, z }, i) => {
                if (position.getX(i) !== x || position.getY(i) !== y || position.getZ(i) !== z) {
                    position.setXYZ(i, x, y, z);
                    position.needsUpdate = true;
                }
            });
        }
    }

    /**
     * 
     * @param {VectorBuilderParams} params The parameters of the polyline.
     */
    constructor(params) {
        const vertices = new THREE.BufferGeometry().setFromPoints([...params.vectorCoords]);
        const material = new THREE.LineBasicMaterial({ color: params.color });
        const geo = new THREE.Line(vertices, material);

        super({
            vectorCoords: params.vectorCoords,
            geo: geo,
        });
    }

    /**
     * @returns {LineGeo} new instance of this object.
     */
    clone() {
        return new LineGeo({
            vectorCoords: this.vectorCoords,
            color: this.color.clone(),
        });
    }
}

export class LineBuilder extends VectorBuilder {

    /**
     * Creates the Polyline shape.
     * 
     * @param {VectorBuilderParams} params The vector parameters.
     * @returns {LineGeo} The created polyline object.
     */
    createVector(params) {
        return new LineGeo(params);
    }
}
