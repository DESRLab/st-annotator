import * as THREE from "three";

import type { EditorConfig } from "sta/app/editor";

import type { ReadonlyVectorIndex } from "./VectorIndex";

export interface LabelClassParams {
  config: EditorConfig;
  labels: ReadonlyVectorIndex | null;
  id: number;
  name: string;
  vectorColor: Readonly<THREE.Color>;
}

export interface PropertyChangeEvent {
  obj: LabelClass;
  propertyKey: Exclude<keyof LabelClassParams, "config" | "labels">;
}

export interface LabelClassEventMap {
  change: PropertyChangeEvent;
}

export type ReadonlyLabelClass = Pick<
  Readonly<LabelClass>,
  keyof THREE.EventDispatcher<LabelClassEventMap> | keyof LabelClassParams
>;

/**
 * Represents an object class.
 */
export class LabelClass extends THREE.EventDispatcher<LabelClassEventMap> {
  readonly config: EditorConfig;

  #labels: ReadonlyVectorIndex | null;

  // A collection of labels from which related labels are queried for this object class.
  // This is usually the collection of labels containing this object class.
  get labels(): ReadonlyVectorIndex | null {
    return this.#labels;
  }

  set labels(value: ReadonlyVectorIndex | null) {
    const prevValue = this.#labels;
    if (prevValue !== value) {
      this.#labels = value;

      this.#render();
    }
  }

  #id: number;

  // The unique identifier of the object class.
  get id(): number {
    return this.#id;
  }

  set id(value: number) {
    if (this.#id !== value) {
      this.#id = value;

      this.dispatchEvent({
        type: "change",
        obj: this,
        propertyKey: "id",
      });
    }
  }

  #name: string;

  // The display name of the object class
  get name(): string {
    return this.#name;
  }

  set name(value: string) {
    if (this.#name !== value) {
      this.#name = value;

      this.dispatchEvent({
        type: "change",
        obj: this,
        propertyKey: "name",
      });
    }
  }

  #VectorColor: THREE.Color;

  // The display color of a bounding box associated with the class.
  get vectorColor(): Readonly<THREE.Color> {
    return this.#VectorColor;
  }

  set vectorColor(value: Readonly<THREE.Color>) {
    if (this.#VectorColor !== value) {
      this.#VectorColor = value;

      this.dispatchEvent({
        type: "change",
        obj: this,
        propertyKey: "vectorColor",
      });
    }
  }

  #render() {
    // Nothing to update
  }

  constructor(params: LabelClassParams) {
    super();

    this.config = params.config;

    this.#labels = params.labels;

    this.#id = params.id;
    this.#name = params.name;
    this.#VectorColor = params.vectorColor.clone();
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose() {}
}
