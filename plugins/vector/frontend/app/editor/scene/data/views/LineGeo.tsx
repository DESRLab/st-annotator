import * as THREE from "three";

import { VectorGeo, VectorBuilder } from "./VectorGeo";
import type { VectorBuilderParams, Line } from "./VectorGeo";

/**
 * Represents polygon and polyline geometries.
 */
export class LineGeo extends VectorGeo<Line> {
  /**
   * Updates the shape of the `three.js` components of this polyline.
   */
  updateVector() {
    const vectorCoords = [...this.vectorCoords];
    const position = this.geo.geometry.getAttribute("position");
    const sizeChanged = vectorCoords.length !== position.count;

    if (sizeChanged) {
      const geometry = new THREE.BufferGeometry().setFromPoints(vectorCoords);
      const material = this.geo.material.clone();
      this.geo = new THREE.Line(geometry, material);
    } else {
      vectorCoords.forEach(({ x, y, z }, i) => {
        if (
          position.getX(i) !== x ||
          position.getY(i) !== y ||
          position.getZ(i) !== z
        ) {
          position.setXYZ(i, x, y, z);
          position.needsUpdate = true;
        }
      });
    }
  }

  constructor(params: VectorBuilderParams) {
    const vertices = new THREE.BufferGeometry().setFromPoints([
      ...params.vectorCoords,
    ]);
    const material = new THREE.LineBasicMaterial({ color: params.color });
    const geo = new THREE.Line(vertices, material);

    super({
      vectorCoords: params.vectorCoords,
      geo: geo,
    });
  }

  /**
   * Returns a new instance of this object.
   */
  clone(): LineGeo {
    return new LineGeo({
      vectorCoords: this.vectorCoords,
      color: this.color.clone(),
    });
  }
}

export class LineBuilder extends VectorBuilder {
  /**
   * Creates the Polyline shape.
   */
  createVector(params: VectorBuilderParams): LineGeo {
    return new LineGeo(params);
  }
}
