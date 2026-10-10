import * as THREE from "three";

import { VectorGeo, VectorBuilder } from "./VectorGeo";
import type { VectorBuilderParams, Point } from "./VectorGeo";

export class PointGeo extends VectorGeo<Point> {
  /**
   * Updates the coordinate of the `three.js` components of this point.
   */
  updateVector() {
    const pointCoords = [...this.vectorCoords];
    const position = this.geo.geometry.getAttribute("position");

    pointCoords.forEach(({ x, y, z }, i) => {
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

  constructor(params: VectorBuilderParams) {
    const vertices = new THREE.BufferGeometry().setFromPoints([
      ...params.vectorCoords,
    ]);
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
   * Returns a new instance of this object.
   */
  clone(): PointGeo {
    return new PointGeo({
      vectorCoords: this.vectorCoords,
      color: this.color.clone(),
    });
  }
}

export class PointBuilder extends VectorBuilder {
  /**
   * Creates the Point shape.
   */
  createVector(params: VectorBuilderParams): PointGeo {
    return new PointGeo(params);
  }
}
