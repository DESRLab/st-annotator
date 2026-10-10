import * as THREE from "three";

import type { Colormap } from "../../colors";

import type { PointBuffer } from "./PointBuffer";
import type { ValueFunc } from "./ValueFunc";

/**
 * Represents a function that computes the color of each point.
 *
 * This is a value-based class.
 */
export class ColorBlender {
  /**
   * A function that computes the color of each point.
   *
   * @param buffer The buffer containing the point data.
   * @returns The `i`th element is the color of the `i`th point.
   */
  getColors(buffer: Readonly<PointBuffer>): THREE.Color[] {
    throw new Error("Not implemented");
  }

  /**
   * Creates a deep copy of this object.
   *
   * @returns The newly created copy.
   */
  clone(): ColorBlender {
    throw new Error("Not implemented");
  }
}

/**
 * A function that computes the color of each point using a colormap.
 *
 * This is a value-based class.
 */
export class ApplyColormap extends ColorBlender {
  /** The colormap used to generate the color for each point. */
  readonly colormap: Colormap;

  /**
   * The function used to transform the value of each point into the input to the colormap,
   * within the range `[0, 1]`.
   */
  readonly valueFunc: ValueFunc;

  /**
   * Creates a function that computes the color of each point using a colormap.
   *
   * @param colormap The colormap used to generate the color for each point.
   * @param valueFunc The function used to transform the value of
   * each point into the input to the colormap, within the range `[0, 1]`.
   */
  constructor(colormap: Colormap, valueFunc: ValueFunc) {
    super();

    this.colormap = colormap;
    this.valueFunc = valueFunc;

    Object.freeze(this);
  }

  /**
   * A function that computes the color of each point.
   *
   * @param buffer The buffer containing the point data.
   * `this.channel` should be in the range `[0, buffer.numChannels)`.
   * @returns The `i`th element is the color of the `i`th point.
   */
  getColors(buffer: Readonly<PointBuffer>): THREE.Color[] {
    const { colormap, valueFunc } = this;

    const normedValues = valueFunc.getValues(buffer);

    return colormap.apply(normedValues);
  }

  /**
   * Creates a deep copy of this object.
   *
   * @returns The newly created copy.
   */
  clone(): ApplyColormap {
    return new ApplyColormap(this.colormap, this.valueFunc);
  }
}

/**
 * A function that computes the color of each point using a set of RGB channels.
 *
 * This is a value-based class.
 */
export class ComposeRGB extends ColorBlender {
  /**
   * The function used to transform the value of each point into the intensity of the
   * red channel, within the range `[0, 1]`.
   */
  readonly valueFuncR: ValueFunc;

  /**
   * The function used to transform the value of each point into the intensity of the
   * green channel, within the range `[0, 1]`.
   */
  readonly valueFuncG: ValueFunc;

  /**
   * The function used to transform the value of each point into the intensity of the
   * blue channel, within the range `[0, 1]`.
   */
  readonly valueFuncB: ValueFunc;

  /**
   * Creates a function that computes the color of each point using a set of RGB channels.
   *
   * @param valueFuncR The function used to transform the value of
   * each point into the intensity of the red channel, within the range `[0, 1]`.
   * @param valueFuncG The function used to transform the value of
   * each point into the intensity of the green channel, within the range `[0, 1]`.
   * @param valueFuncB The function used to transform the value of
   * each point into the intensity of the blue channel, within the range `[0, 1]`.
   */
  constructor(
    valueFuncR: ValueFunc,
    valueFuncG: ValueFunc,
    valueFuncB: ValueFunc,
  ) {
    super();

    this.valueFuncR = valueFuncR;
    this.valueFuncG = valueFuncG;
    this.valueFuncB = valueFuncB;

    Object.freeze(this);
  }

  /**
   * A function that computes the color of each point.
   *
   * @param buffer The buffer containing the point data.
   * `this.channel{R,G,B}` should be in the range `[0, buffer.numChannels)`.
   * @returns The `i`th element is the color of the `i`th point.
   */
  getColors(buffer: Readonly<PointBuffer>): THREE.Color[] {
    const { valueFuncR, valueFuncG, valueFuncB } = this;

    const normedValuesR = valueFuncR.getValues(buffer);
    const normedValuesG = valueFuncG.getValues(buffer);
    const normedValuesB = valueFuncB.getValues(buffer);

    return normedValuesR.map((r: number, i: number) => {
      const g = normedValuesG[i];
      const b = normedValuesB[i];

      return new THREE.Color(r, g, b);
    });
  }

  /**
   * Creates a deep copy of this object.
   *
   * @returns The newly created copy.
   */
  clone(): ComposeRGB {
    return new ComposeRGB(this.valueFuncR, this.valueFuncG, this.valueFuncB);
  }
}
