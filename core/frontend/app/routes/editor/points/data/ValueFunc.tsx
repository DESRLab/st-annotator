import _ from "lodash";

import { MathUtils } from "sta/common";

import type { PointBuffer } from "./PointBuffer";

/**
 * Represents a function that computes the value of each point.
 *
 * This is a value-based class.
 */
export class ValueFunc {
  /**
   * A function that computes the value of each point.
   *
   * @param buffer The buffer containing the point data.
   * @returns The `i`th element is the value of the `i`th point.
   */
  getValues(buffer: Readonly<PointBuffer>): number[] {
    throw new Error("Not implemented");
  }

  /**
   * Creates a deep copy of this object.
   *
   * @returns The newly created copy.
   */
  clone(): ValueFunc {
    throw new Error("Not implemented");
  }
}

/**
 * Represents a function that computes the normalized value of each point.
 *
 * This is a value-based class.
 */
export class NormalizedValueFunc extends ValueFunc {
  /** The index of the channel containing the values. */
  channel: number;

  /**
   * Values in the range `[vmin, vmax]` are linearly mapped to the range `[0, 1]`,
   * clipping values outside of this range to either end.
   *
   * Can be either a constant, or a function that takes in the values extracted from
   * point data and outputs a single number.
   */
  vmin: number | ((values: number[]) => number);

  /**
   * Values in the range `[vmin, vmax]` are linearly mapped to the range `[0, 1]`,
   * clipping values outside of this range to either end.
   *
   * Can be either a constant, or a function that takes in the values extracted from
   * point data and outputs a single number.
   */
  vmax: number | ((values: number[]) => number);

  /**
   * Creates a function that takes in values extracted from point data and
   * outputs the value corresponding to a standard score.
   *
   * @param z The standard score for which the function outputs the value.
   * @returns The resulting function.
   */
  static fromStdScore(z: number): (values: number[]) => number {
    return (values: number[]) => {
      const mean = _.mean(values);
      const std = values.length === 0 ? NaN : MathUtils.getStd(values, mean);

      return mean + z * std;
    };
  }

  /**
   * Creates a function that computes the normalized value of each point.
   *
   * @param channel The index of the channel containing the values.
   * @param vmin Values in the range `[vmin, vmax]` are linearly mapped to the range `[0, 1]`,
   * clipping values outside of this range to either end. Can be either a constant, or a
   * function that takes in values extracted from point data and outputs a single number.
   * @param vmax Values in the range `[vmin, vmax]` are linearly mapped to the range `[0, 1]`,
   * clipping values outside of this range to either end. Can be either a constant, or a
   * function that takes in values extracted from point data and outputs a single number.
   */
  constructor(
    channel: number,
    vmin: number | ((values: number[]) => number),
    vmax: number | ((values: number[]) => number),
  ) {
    super();

    this.channel = channel;
    this.vmin = typeof vmin === "number" ? vmin : vmin.bind(this);
    this.vmax = typeof vmax === "number" ? vmax : vmax.bind(this);

    Object.freeze(this);
  }

  /**
   * A function that computes the value of each point.
   *
   * @param buffer The buffer containing the point data.
   * `this.channel` should be in the range `[0, buffer.numChannels)`.
   * @returns The `i`th element is the value of the `i`th point.
   */
  getValues(buffer: Readonly<PointBuffer>): number[] {
    const { channel, vmin, vmax } = this;

    const values = buffer.getChannel(channel);
    const minFunc: (values: number[]) => number =
      typeof vmin === "number" ? () => vmin : vmin;
    const maxFunc: (values: number[]) => number =
      typeof vmax === "number" ? () => vmax : vmax;

    return MathUtils.normalize(values, minFunc(values), maxFunc(values), true);
  }

  /**
   * Creates a deep copy of this object.
   *
   * @returns The newly created copy.
   */
  clone(): NormalizedValueFunc {
    return new NormalizedValueFunc(this.channel, this.vmin, this.vmax);
  }
}
