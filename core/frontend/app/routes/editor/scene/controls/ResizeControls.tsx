import * as THREE from "three";

import { WindowPointer } from "../tools/ScenePointer";
import { ThreeUtils, TransformUtils, TypeUtils } from "sta/common";

import { Controls } from "./Controls";
import { DraggableBase } from "./DraggableBase";
import { DraggableVertex } from "./DraggableVertex";
import { VertexFrame } from "./VertexFrame";

type Axis = "X" | "Y" | "Z";

/**
 * Represents a frame in a {@link ResizeControls}.
 */
class ResizeVertexFrame extends VertexFrame {
  /**
   * Creates a new frame in a {@link ResizeControls}.
   *
   * @param vertices The vertices contained in the frame.
   */
  constructor(vertices: readonly DraggableVertex[]) {
    super(vertices);

    if (vertices.length !== 4) {
      throw new Error(
        `Ths object only supports 4 vertices, but found: ${vertices.length}`,
      );
    }

    const allCoords = vertices.map(
      (vertex: DraggableVertex) => vertex.position,
    );
    const minCoords = allCoords.reduce(
      (acc: THREE.Vector3, v: THREE.Vector3) => acc.min(v),
      allCoords[0].clone(),
    );
    const maxCoords = allCoords.reduce(
      (acc: THREE.Vector3, v: THREE.Vector3) => acc.max(v),
      allCoords[0].clone(),
    );

    const [indexA, indexB] = Array.from(
      new Set(vertices.flatMap((vertex: DraggableVertex) => vertex.axes)),
      (axis) => {
        switch (axis) {
          case "X":
            return 0;
          case "Y":
            return 1;
          case "Z":
            return 2;
          default:
            throw new Error(`Invalid axis: ${axis}`);
        }
      },
    );
    if (indexA == null) {
      throw new Error(
        `Did not find valid indexA. allCoords: ${JSON.stringify(allCoords)}`,
      );
    }
    if (indexB == null) {
      throw new Error(
        `Did not find valid indexB. allCoords: ${JSON.stringify(allCoords)}`,
      );
    }

    const minMax = maxCoords
      .clone()
      .setComponent(indexA, minCoords.getComponent(indexA));
    const maxMin = maxCoords
      .clone()
      .setComponent(indexB, minCoords.getComponent(indexB));
    const points = [minCoords, minMax, maxCoords, maxMin, minCoords];

    const frameBuffer = new THREE.BufferGeometry().setFromPoints(points);
    const frameMaterial = new THREE.LineDashedMaterial({ color: "gray" });
    const frame = new THREE.Line(frameBuffer, frameMaterial);
    this.frame = frame;
    this.add(frame);
  }
}

/**
 * Used to perform anchored resizing of `three.js` objects along one or two axes.
 */
export class ResizeControls extends Controls {
  #clipToAspect = false;

  /**
   * Whether or not resizing is clipped to match the initial aspect ratio.
   * Default is `false`.
   */
  get clipToAspect(): boolean {
    return this.#clipToAspect;
  }

  set clipToAspect(value: boolean) {
    if (this.clipToAspect !== value) {
      this.#clipToAspect = value;

      this.updateState();
    }
  }

  #enablePlane = true;

  /**
   * Whether or not resizing can be done along two axes at once. Default is `true`.
   */
  get enablePlane(): boolean {
    return this.#enablePlane;
  }

  set enablePlane(value: boolean) {
    if (this.enablePlane !== value) {
      this.#enablePlane = value;

      this.updateVisibility();
    }
  }

  /**
   * Updates the visibility of the components in the set of controls.
   *
   * @protected
   * @returns This object.
   */
  updateVisibility(): this {
    super.updateVisibility();

    if (!this.enablePlane) {
      for (const element of this.draggableGroup.objects) {
        if (element.axes.length === 2) {
          element.visible = false;
        }
      }
    }

    return this;
  }

  /**
   * Creates the elements of this set of controls.
   *
   * @returns The requested elements.
   */
  static createElements(): {
    draggableElements: readonly DraggableBase[];
    visualElements?: readonly THREE.Object3D[];
  } {
    const halfLength = 0.5;

    const coordsByAxes = new Map<Axis[], THREE.Vector3[]>([
      [
        ["X"],
        [
          new THREE.Vector3(-halfLength, 0, 0),
          new THREE.Vector3(halfLength, 0, 0),
        ],
      ],
      [
        ["Y"],
        [
          new THREE.Vector3(0, -halfLength, 0),
          new THREE.Vector3(0, halfLength, 0),
        ],
      ],
      [
        ["Z"],
        [
          new THREE.Vector3(0, 0, -halfLength),
          new THREE.Vector3(0, 0, halfLength),
        ],
      ],
      [
        ["X", "Y"],
        [
          new THREE.Vector3(-halfLength, -halfLength, 0),
          new THREE.Vector3(-halfLength, halfLength, 0),
          new THREE.Vector3(halfLength, halfLength, 0),
          new THREE.Vector3(halfLength, -halfLength, 0),
        ],
      ],
      [
        ["Y", "Z"],
        [
          new THREE.Vector3(0, -halfLength, -halfLength),
          new THREE.Vector3(0, -halfLength, halfLength),
          new THREE.Vector3(0, halfLength, halfLength),
          new THREE.Vector3(0, halfLength, -halfLength),
        ],
      ],
      [
        ["X", "Z"],
        [
          new THREE.Vector3(-halfLength, 0, -halfLength),
          new THREE.Vector3(-halfLength, 0, halfLength),
          new THREE.Vector3(halfLength, 0, halfLength),
          new THREE.Vector3(halfLength, 0, -halfLength),
        ],
      ],
    ]);

    const draggableElements: DraggableBase[] = [];

    const visualElements: THREE.Object3D[] = [];

    const verticesByAxes = new Map<string, DraggableVertex[]>();
    for (const [axes, coords] of coordsByAxes.entries()) {
      const vertices = coords.map((c) => new DraggableVertex(axes, axes, c));
      verticesByAxes.set(axes.join(""), vertices);
    }

    for (const [axes, vertices] of verticesByAxes.entries()) {
      for (const vertex of vertices) {
        draggableElements.push(vertex);
      }

      if (axes.length === 2) {
        const frameVertices = Array.from(axes, (axis) =>
          verticesByAxes.get(axis),
        )
          .filter(TypeUtils.isNotNull)
          .flat();
        const frame = new ResizeVertexFrame(frameVertices);

        visualElements.push(frame);
      }
    }

    return { draggableElements, visualElements };
  }

  /**
   * Creates a new set of controls to resize an object.
   *
   * @param pointer The pointer that interacts with the set of controls.
   * @param raycaster Raycasts the pointer to the set of controls.
   * @returns The newly created set of controls.
   */
  static create(
    pointer: WindowPointer,
    raycaster: THREE.Raycaster,
  ): ResizeControls {
    const { draggableElements, visualElements } = this.createElements();
    const draggableGroup = Controls.createGroup(draggableElements);

    const elementDragger = pointer.createDragController<DraggableBase>({
      groups: [{ group: draggableGroup, priority: 0 }],
      raycaster: raycaster,
    });

    return new ResizeControls(draggableGroup, elementDragger, visualElements);
  }

  /**
   * Sets the transform according to the position of the pointer.
   *
   * @protected
   * @param initPointerLocalPos The position of the pointer in model space when
   * the element was clicked.
   * @param nextPointerLocalPos The current position of the pointer in model
   * space.
   */
  adjustMatrix(
    initPointerLocalPos: THREE.Vector3,
    nextPointerLocalPos: THREE.Vector3,
  ): void {
    if (
      this.draggedElement == null ||
      this.initObjectState == null || // !this.dragging
      this.axis_or_plane == null
    ) {
      throw new Error("No object is being transformed");
    }

    // Use this instead of initPointerLocalPos, otherwise the opposite vertex
    // might not be anchored as initPointerLocalPos may not exactly be at the corner.
    const initLocalPos = this.draggedElement.position;

    if (this.clipToAspect) {
      const initObjectState = this.initObjectState;
      const initAspect = ThreeUtils.mapVector3(
        initObjectState.scale.clone(),
        Math.abs,
      );

      const aspect: { x?: number; y?: number; z?: number } = {};
      for (const axis of this.axis_or_plane) {
        switch (axis) {
          case "X":
            aspect.x = initAspect.x;
            break;
          case "Y":
            aspect.y = initAspect.y;
            break;
          case "Z":
            aspect.z = initAspect.z;
            break;
          default:
            throw new Error(`Invalid axis: ${axis}`);
        }
      }

      TransformUtils.resize(this, initLocalPos, nextPointerLocalPos, aspect);
    } else {
      TransformUtils.resize(this, initLocalPos, nextPointerLocalPos);
    }
  }
}
