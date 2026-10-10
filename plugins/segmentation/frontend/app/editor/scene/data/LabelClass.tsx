import * as THREE from "three";

import type { EditorConfig } from "sta/app/editor";

import type { ReadonlySegmentationIndex } from "./SegmentationIndex";

export interface LabelClassParams {
  /** The configuration of the application. */
  config: EditorConfig;
  /**
   * A collection of labels from which related labels are queried from this object class.
   *
   * This is usually the collection of labels containing this object class.
   */
  labels: ReadonlySegmentationIndex | null;
  /** The unique identifier of the object class. */
  id: number;
  /** The display name of the object class. */
  name: string;
  /** The display color of points selection associated with the object class. */
  selectionColor: Readonly<THREE.Color>;
}

/**
 * Represents the event when a property (except for `labels`) has been changed.
 * - `obj`: The object which property has been changed.
 * - `propertyKey`: The name of the property that was changed.
 */
export interface PropertyChangeEvent {
  obj: LabelClass;
  propertyKey: Exclude<keyof LabelClassParams, "config" | "labels">;
}

/** Defines each event that can be dispatched by {@link LabelClass}. */
export interface LabelClassEventMap {
  /** The event when a property (except for `labels`) has been changed. */
  change: PropertyChangeEvent;
}

export type ReadonlyLabelClass = Pick<
  Readonly<LabelClass>,
  keyof THREE.EventDispatcher<LabelClassEventMap> | keyof LabelClassParams
>;

/** Represents an object class. */
export class LabelClass extends THREE.EventDispatcher<LabelClassEventMap> {
  /** The configuration of the application. */
  readonly config: EditorConfig;

  #labels: ReadonlySegmentationIndex | null;

  /**
   * A collection of labels from which related labels are queried for this object class.
   *
   * This is usually the collection of labels containing this object class.
   */
  get labels(): ReadonlySegmentationIndex | null {
    return this.#labels;
  }

  set labels(value: ReadonlySegmentationIndex | null) {
    const prevValue = this.#labels;
    if (prevValue !== value) {
      this.#labels = value;

      this.#render();
    }
  }

  #id: number;

  /** The unique identifier of the object class. */
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

  /** The display name of the object class. */
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

  #selectionColor: Readonly<THREE.Color>;

  /** The display color of a points selection associated with the class. */
  get selectionColor(): Readonly<THREE.Color> {
    return this.#selectionColor;
  }

  set selectionColor(value: Readonly<THREE.Color>) {
    if (this.#selectionColor !== value) {
      this.#selectionColor = value;

      this.dispatchEvent({
        type: "change",
        obj: this,
        propertyKey: "selectionColor",
      });
    }
  }

  /** Updates the view according to the data in this object. */
  #render() {
    // Nothing to update
  }

  /** Creates a new object class. */
  constructor(params: LabelClassParams) {
    super();

    this.config = params.config;

    this.#labels = params.labels;

    this.#id = params.id;
    this.#name = params.name;
    this.#selectionColor = params.selectionColor.clone();
  }

  /** Disposes of this object. Do not use it afterwards. */
  dispose() {}
}
