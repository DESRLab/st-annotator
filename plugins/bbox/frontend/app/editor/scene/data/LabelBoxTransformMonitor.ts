import * as THREE from "three";

import type { ReadonlyLabelBox } from "./LabelBox";
import { LabelBox } from "./LabelBox";

type LocalTransform = Readonly<{
  position: Readonly<THREE.Vector3>;
  rotation: Readonly<THREE.Euler>;
  scale: Readonly<THREE.Vector3>;
}>;

/**
 * Since the box's `three.js` representation can be modified directly,
 * we have to periodically check whether it has been updated to fire
 * the change events.
 *
 * However, it is too costly to continuously monitor all boxes,
 * so this class is used to monitor specific boxes.
 *
 * The monitored box is the one the active Edit/Draw state assigned, so the poll
 * only ever runs inside an already-dirty manipulation window. A feature that
 * monitors a box outside manipulation has to emit its own dirty event or accept
 * eventual consistency: a detected change is dispatched up to the interval late.
 */
export class LabelBoxTransformMonitor {
  #box: ReadonlyLabelBox | null;

  /**
   * The bounding box to monitor, if any.
   */
  get box(): ReadonlyLabelBox | null {
    return this.#box;
  }

  set box(value: ReadonlyLabelBox | null) {
    if (this.#box !== value) {
      this.#box = value;

      this.#setPrevTransform(value);
    }
  }

  #prevTransform: LocalTransform | null;

  /**
   * Updates the value of `this.#prevTransform` according to a bounding box.
   */
  #setPrevTransform(box: ReadonlyLabelBox | null) {
    if (box == null) {
      this.#prevTransform = null;
      return;
    }

    const { position, rotation, scale } = box.asObject3D();

    this.#prevTransform = {
      position: position.clone(),
      rotation: rotation.clone(),
      scale: scale.clone(),
    };
  }

  /**
   * Since the box's `three.js` representation can be modified directly,
   * we have to periodically check whether it has been updated.
   */
  #monitorTransform = () => {
    const box = this.#box;
    if (box == null) return;

    if (!(box instanceof LabelBox)) {
      console.error(box);
      throw new Error("Incorrect type of box");
    }

    const { position, rotation, scale } = box.asObject3D();
    const prevTransform = this.#prevTransform;

    if (prevTransform != null) {
      if (!prevTransform.position.equals(position)) {
        box.dispatchEvent({
          type: "change",
          obj: box,
          propertyKey: "center",
        });
      }
      if (!prevTransform.rotation.equals(rotation)) {
        box.dispatchEvent({
          type: "change",
          obj: box,
          propertyKey: "angle",
        });
      }
      if (!prevTransform.scale.equals(scale)) {
        box.dispatchEvent({
          type: "change",
          obj: box,
          propertyKey: "size",
        });
      }
    }

    this.#setPrevTransform(box);
  };

  readonly #MONITOR_TRANSFORM_INTERVAL_MS: number = 100;

  readonly #monitorTransformTimer: ReturnType<typeof setInterval>;

  /**
   * Creates a new object to monitor changes to the transform of a bounding box.
   *
   * @param box The bounding box to monitor, if any.
   */
  constructor(box: ReadonlyLabelBox | null = null) {
    this.#box = box;
    this.#setPrevTransform(box);

    this.#monitorTransformTimer = setInterval(
      this.#monitorTransform,
      this.#MONITOR_TRANSFORM_INTERVAL_MS,
    );
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose() {
    clearInterval(this.#monitorTransformTimer);
  }
}
