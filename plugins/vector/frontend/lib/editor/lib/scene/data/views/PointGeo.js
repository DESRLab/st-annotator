import * as THREE from 'three';

import { VectorGeo, VectorBuilder } from './VectorGeo';

/**
 * @typedef {import('./VectorGeo').VectorBuilderParams} VectorBuilderParams
 */

/**
 * @typedef {import('./VectorGeo').Point} Point
 */

/**
 * @augments VectorGeo<Point>
 */
export class PointGeo extends VectorGeo {
    /**
     * Updates the coordinate of the `three.js` components of this point.
     */
    updateVector() {
        const pointCoords = [...this.vectorCoords];
        const position = this.geo.geometry.getAttribute('position');

        pointCoords.forEach(({ x, y, z }, i) => {
            if (position.getX(i) !== x || position.getY(i) !== y || position.getZ(i) !== z) {
                position.setXYZ(i, x, y, z);
                position.needsUpdate = true;
            }
        });
    }

    /**
     * 
     * @param {VectorBuilderParams} params The parameters of the point.
     */
    constructor(params) {
        const vertices = new THREE.BufferGeometry().setFromPoints([...params.vectorCoords]);
        const material = new THREE.PointsMaterial({
            color: params.color,
            size: 10,
            sizeAttenuation: false,
            side: THREE.DoubleSide,
        });
        const geo = new THREE.Points(vertices, material);

        super({
            vectorCoords: params.vectorCoords,
            geo: geo,
        });
    }

    /**
     * @returns {PointGeo} new instance of this object.
     */
    clone() {
        return new PointGeo({
            vectorCoords: this.vectorCoords,
            color: this.color.clone(),
        });
    }
}

export class PointBuilder extends VectorBuilder {

    /**
     * Creates the Point shape.
     * 
     * @param {VectorBuilderParams} params The vector parameters.
     * @returns {PointGeo} The created point object.
     */
    createVector(params) {
        return new PointGeo(params);
    }
}
