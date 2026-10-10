import * as THREE from "three";

import type { EditorConfig } from "sta/app/editor";
import { OptionalVector3, ThreeUtils } from "sta/common";

import type { ReadonlyBBoxIndex } from "./BBoxIndex";

/**
 * Checks that a default size is valid.
 *
 * @param defaultSize The input default size.
 * @returns A copy of the input default size with each component
 * potentially set to a fallback value.
 */
export function checkDefaultSize(
  defaultSize: Readonly<OptionalVector3>,
): OptionalVector3 {
  return defaultSize.clone().map((v) => ThreeUtils.checkSize(v));
}

/**
 * Parameters for creating a {@link LabelClass}.
 */
export interface LabelClassParams {
  /** The configuration of the application. */
  config: EditorConfig;
  /**
   * A collection of labels from which related labels are queried for this object class.
   *
   * This is usually the collection of labels containing this object class.
   */
  labels: ReadonlyBBoxIndex | null;
  /** The unique identifier of the object class. */
  id: number;
  /** The display name of the object class. */
  name: string;
  /**
   * The display color of a bounding box associated with the object class.
   *
   * A shallow copy of the color is made to this object.
   */
  boxColor: Readonly<THREE.Color>;
  /**
   * The default size of a bounding box associated with the object class,
   * in the coordinate system of the database.
   * Defaults to an empty vector.
   *
   * A shallow copy of the default size is made to this object.
   */
  defaultSizeDatabase?: Readonly<OptionalVector3>;
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

/**
 * Defines each event that can be dispatched by {@link LabelClass}.
 */
export interface LabelClassEventMap {
  /**
   * The event when a property (except for `labels`) has been changed.
   */
  change: PropertyChangeEvent;
}

/**
 * A read-only view of a {@link LabelClass}.
 */
export type ReadonlyLabelClass = Pick<
  Readonly<LabelClass>,
  | keyof THREE.EventDispatcher<LabelClassEventMap>
  | keyof LabelClassParams
  | "defaultSizeThreeJS"
>;

/**
 * Represents an object class.
 */
export class LabelClass extends THREE.EventDispatcher<LabelClassEventMap> {
  /**
   * The configuration of the application.
   */
  readonly config: EditorConfig;

  #labels: ReadonlyBBoxIndex | null;

  /**
   * A collection of labels from which related labels are queried for this object class.
   *
   * This is usually the collection of labels containing this object class.
   */
  get labels(): ReadonlyBBoxIndex | null {
    return this.#labels;
  }

  set labels(value: ReadonlyBBoxIndex | null) {
    const prevValue = this.#labels;
    if (prevValue !== value) {
      this.#labels = value;

      this.#render();
    }
  }

  #id: number;

  /**
   * The unique identifier of the object class.
   */
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

  /**
   * The display name of the object class.
   */
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

  #boxColor: THREE.Color;

  /**
   * The display color of a bounding box associated with the class.
   */
  get boxColor(): Readonly<THREE.Color> {
    return this.#boxColor;
  }

  set boxColor(value: Readonly<THREE.Color>) {
    if (this.#boxColor !== value) {
      this.#boxColor = value;

      this.dispatchEvent({
        type: "change",
        obj: this,
        propertyKey: "boxColor",
      });
    }
  }

  #defaultSizeDatabase: OptionalVector3;

  /**
   * The default size of a bounding box associated with the class,
   * in the coordinate system of the database.
   */
  get defaultSizeDatabase(): Readonly<OptionalVector3> {
    return this.#defaultSizeDatabase;
  }

  set defaultSizeDatabase(value: Readonly<OptionalVector3>) {
    if (this.#defaultSizeDatabase !== value) {
      this.#defaultSizeDatabase = checkDefaultSize(value);

      this.dispatchEvent({
        type: "change",
        obj: this,
        propertyKey: "defaultSizeDatabase",
      });
    }
  }

  /**
   * The default size of a bounding box associated with the class,
   * in the coordinate system of `three.js`.
   */
  get defaultSizeThreeJS(): Readonly<OptionalVector3> {
    return LabelClass.#toThreeJSDefaultSize(
      this.config,
      this.#defaultSizeDatabase,
    );
  }

  /**
   * Updates the view according to the data in this object.
   */
  #render() {
    // Nothing to update
  }

  /**
   * Converts a default size from database format into `three.js` format.
   *
   * @param config The configuration of the application.
   * @param dbSize The original default size.
   * @returns The converted default size.
   */
  static #toThreeJSDefaultSize(
    config: EditorConfig,
    dbSize: Readonly<OptionalVector3>,
  ): Readonly<OptionalVector3> {
    const format = config.coordinateFormat;
    return format.toThreeJSCoords(dbSize);
  }

  /**
   * Creates a new object class.
   *
   * @param params The parameters of the input.
   */
  constructor(params: LabelClassParams) {
    super();

    this.config = params.config;

    this.#labels = params.labels;

    this.#id = params.id;
    this.#name = params.name;
    this.#boxColor = params.boxColor.clone();
    this.#defaultSizeDatabase = checkDefaultSize(
      params.defaultSizeDatabase ?? new OptionalVector3(),
    );
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose() {}
}
