import * as THREE from "three";

import type { DraggableVertex } from "./DraggableVertex";

/**
 * Represents a frame containing {@link DraggableVertex} objects.
 */
export class VertexFrame extends THREE.Object3D {
  /**
   * The vertices contained in this frame.
   */
  readonly vertices: readonly DraggableVertex[];

  /**
   * The frame that is displayed.
   */
  frame: THREE.Object3D = new THREE.Object3D();

  /**
   * Creates a new frame containing {@link DraggableVertex} objects.
   *
   * @param vertices The vertices contained in this frame.
   */
  constructor(vertices: readonly DraggableVertex[]) {
    super();

    this.vertices = vertices;
  }
}
