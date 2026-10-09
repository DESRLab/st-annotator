import _ from 'lodash';

import { MathUtils } from '../../../../../../common/lib/utils';

/**
 * @typedef {import('./PointBuffer').PointBuffer} PointBuffer
 */

/**
 * Represents a function that computes the value of each point in a point cloud.
 * 
 * This is a value-based class.
 * 
 * @abstract
 */
export class ValueFunc {

    /**
     * A function that computes the value of each point in a point cloud.
     * 
     * @param {Readonly<PointBuffer>} buffer The buffer containing the data of the point cloud.
     * @returns {number[]} The `i`th element is the value of the `i`th point.
     * @abstract
     */
    getValues(buffer) { throw new Error('Not implemented'); }

    /**
     * Creates a deep copy of this object.
     * 
     * @returns {ValueFunc} The newly created copy.
     * @abstract
     */
    clone() { throw new Error('Not implemented'); }
}

/**
 * Represents a function that computes the normalized value of each point in a point cloud.
 * 
 * This is a value-based class.
 */
export class NormalizedValueFunc extends ValueFunc {

    /**
     * The index of the channel containing the values.
     * 
     * @type {number}
     */
    channel;

    /**
     * Values in the range `[vmin, vmax]` are linearly mapped to the range `[0, 1]`,
     * clipping values outside of this range to either end.
     * 
     * Can be either a constant, or a function that takes in the values extracted from
     * the point cloud and outputs a single number.
     * 
     * @type {number | ((values: number[]) => number)}
     */
    vmin;

    /**
     * Values in the range `[vmin, vmax]` are linearly mapped to the range `[0, 1]`,
     * clipping values outside of this range to either end.
     * 
     * Can be either a constant, or a function that takes in the values extracted from
     * the point cloud and outputs a single number.
     * 
     * @type {number | ((values: number[]) => number)}
     */
    vmax;

    /**
     * Creates a function that takes in the values extracted from a point cloud and
     * outputs the value corresponding to a standard score.
     * 
     * @param {number} z The standard score for which the function outputs the value.
     * @returns {(values: number[]) => number} The resulting function.
     */
    static fromStdScore(z) {
        return (values) => {
            const mean = _.mean(values);
            const std = (values.length === 0) ? NaN : MathUtils.getStd(values, mean);

            return mean + z * std;
        };
    }

    /**
     * Creates a function that computes the normalized value of each point.
     * 
     * @param {number} channel The index of the channel containing the values.
     * @param {number | ((values: number[]) => number)} vmin Values in the range `[vmin, vmax]`
     * are linearly mapped to the range `[0, 1]`, clipping values outside of this range to either
     * end. Can be either a constant, or a function that takes in the values extracted from the
     * point cloud and outputs a single number.
     * @param {number | ((values: number[]) => number)} vmax Values in the range `[vmin, vmax]`
     * are linearly mapped to the range `[0, 1]`, clipping values outside of this range to either
     * end. Can be either a constant, or a function that takes in the values extracted from the
     * point cloud and outputs a single number.
     */
    constructor(channel, vmin, vmax) {
        super();

        this.channel = channel;
        this.vmin = (typeof vmin === 'number') ? vmin : vmin.bind(this);
        this.vmax = (typeof vmax === 'number') ? vmax : vmax.bind(this);

        Object.freeze(this);
    }

    /**
     * A function that computes the value of each point in a point cloud.
     * 
     * @param {Readonly<PointBuffer>} buffer The buffer containing the data of the point cloud.
     * `this.channel` should be in the range `[0, buffer.numChannels)`.
     * @returns {number[]} The `i`th element is the value of the `i`th point.
     */
    getValues(buffer) {
        const { channel, vmin, vmax } = this;

        const values = buffer.getChannel(channel);
        const minFunc = (typeof vmin === 'number') ? (() => vmin) : vmin;
        const maxFunc = (typeof vmax === 'number') ? (() => vmax) : vmax;

        return MathUtils.normalize(values, minFunc(values), maxFunc(values), true);
    }

    /**
     * Creates a deep copy of this object.
     * 
     * @returns {NormalizedValueFunc} The newly created copy.
     */
    clone() {
        return new NormalizedValueFunc(this.channel, this.vmin, this.vmax);
    }
}
