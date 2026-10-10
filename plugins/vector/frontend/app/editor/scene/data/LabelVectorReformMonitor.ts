import * as THREE from "three";

import type { EditorConfig } from "sta/app/editor";
import { ThreeUtils } from "sta/common";

import { LabelVector } from "./LabelVector";
import type { ReadonlyLabelVector } from "./LabelVector";

type LocalTransform = Readonly<{ vectorCoords: readonly THREE.Vector3[] }>;

/**
 * Since the vector's `three.js` representation can be modified directly,
 * we have to periodically check whether it has been updated to fire
 * the change events.
 *
 * However, it is too costly to continuously monitor all vector objects,
 * so this class is used to monitor specific vector obejcts.
 *
 * The monitored vector is the one the active Edit/Draw state assigned, so the
 * poll only ever runs inside an already-dirty manipulation window. A feature that
 * monitors a vector outside manipulation has to emit its own dirty event or
 * accept eventual consistency: a detected change is dispatched up to the
 * interval late.
 */
export class LabelVectorReformMonitor {
  readonly config: EditorConfig;

  #vector: ReadonlyLabelVector | null;

  // The vector object to monitor, if any.
  get vector(): ReadonlyLabelVector | null {
    return this.#vector;
  }

  set vector(value: ReadonlyLabelVector | null) {
    if (this.#vector !== value) {
      this.#vector = value;

      this.#setPrevTransform(value);
    }
  }

  #prevTransform: LocalTransform | null = null;

  #setPrevTransform(vector: ReadonlyLabelVector | null) {
    if (vector == null) {
      this.#prevTransform = null;
      return;
    }

    this.#prevTransform = { vectorCoords: vector.vectorCoords };
  }

  #monitorReform = () => {
    const vector = this.#vector;
    const prevTransform = this.#prevTransform;
    if (vector == null) return;

    if (!(vector instanceof LabelVector)) {
      console.error(vector);
      throw new Error("Incorrect type of vector");
    }

    if (prevTransform != null) {
      if (
        !ThreeUtils.areVerticesEqual(
          prevTransform.vectorCoords,
          vector.vectorCoords,
        )
      ) {
        vector.dispatchEvent({
          type: "change",
          obj: vector,
          propertyKey: "vertices",
        });
      }
    }

    this.#setPrevTransform(vector);
  };

  readonly #MONITOR_REFORM_INTERVAL_MS: number = 100;

  readonly #monitorReformTimer: ReturnType<typeof setInterval>;

  constructor(config: EditorConfig, vector: ReadonlyLabelVector | null = null) {
    this.config = config;
    this.#vector = vector;
    this.#setPrevTransform(vector);

    this.#monitorReformTimer = setInterval(
      this.#monitorReform,
      this.#MONITOR_REFORM_INTERVAL_MS,
    );
  }

  dispose() {
    clearInterval(this.#monitorReformTimer);
  }
}
