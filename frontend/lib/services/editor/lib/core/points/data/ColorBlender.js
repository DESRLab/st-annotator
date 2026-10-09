import * as THREE from 'three';

/**
 * @typedef {import('../../colors').Colormap} Colormap
 */

/**
 * @typedef {import('./PointBuffer').PointBuffer} PointBuffer
 */

/**
 * @typedef {import('./ValueFunc').ValueFunc} ValueFunc
 */

/**
 * Represents a function that computes the color of each point in a point cloud.
 * 
 * This is a value-based class.
 * 
 * @abstract
 */
export class ColorBlender {

    /**
     * A function that computes the color of each point in a point cloud.
     * 
     * @param {Readonly<PointBuffer>} buffer The buffer containing the data of the point cloud.
     * @returns {THREE.Color[]} The `i`th element is the color of the `i`th point.
     * @abstract
     */
    getColors(buffer) { throw new Error('Not implemented'); }

    /**
     * Creates a deep copy of this object.
     * 
     * @returns {ColorBlender} The newly created copy.
     * @abstract
     */
    clone() { throw new Error('Not implemented'); }
}

/**
 * A function that computes the color of each point using a colormap.
 * 
 * This is a value-based class.
 */
export class ApplyColormap extends ColorBlender {

    /**
     * The colormap used to generate the color for each point.
     * 
     * @readonly
     * @type {Colormap}
     */
    colormap;

    /**
     * The function used to transform the value of each point into the input to the colormap,
     * within the range `[0, 1]`.
     * 
     * @readonly
     * @type {ValueFunc}
     */
    valueFunc;

    /**
     * Creates a function that computes the color of each point using a colormap.
     * 
     * @param {Colormap} colormap The colormap used to generate the color for each point.
     * @param {ValueFunc} valueFunc The function used to transform the value of
     * each point into the input to the colormap, within the range `[0, 1]`.
     */
    constructor(colormap, valueFunc) {
        super();

        this.colormap = colormap;
        this.valueFunc = valueFunc;

        Object.freeze(this);
    }

    /**
     * A function that computes the color of each point in a point cloud.
     * 
     * @param {Readonly<PointBuffer>} buffer The buffer containing the data of the point cloud.
     * `this.channel` should be in the range `[0, buffer.numChannels)`.
     * @returns {THREE.Color[]} The `i`th element is the color of the `i`th point.
     */
    getColors(buffer) {
        const { colormap, valueFunc } = this;

        const normedValues = valueFunc.getValues(buffer);

        return colormap.apply(normedValues);
    }

    /**
     * Creates a deep copy of this object.
     * 
     * @returns {ApplyColormap} The newly created copy.
     */
    clone() {
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
     * 
     * @readonly
     * @type {ValueFunc}
     */
    valueFuncR;

    /**
     * The function used to transform the value of each point into the intensity of the
     * green channel, within the range `[0, 1]`.
     * 
     * @readonly
     * @type {ValueFunc}
     */
    valueFuncG;

    /**
     * The function used to transform the value of each point into the intensity of the
     * blue channel, within the range `[0, 1]`.
     * 
     * @readonly
     * @type {ValueFunc}
     */
    valueFuncB;

    /**
     * Creates a function that computes the color of each point using a set of RGB channels.
     * 
     * @param {ValueFunc} valueFuncR The function used to transform the value of
     * each point into the intensity of the red channel, within the range `[0, 1]`.
     * @param {ValueFunc} valueFuncG The function used to transform the value of
     * each point into the intensity of the green channel, within the range `[0, 1]`.
     * @param {ValueFunc} valueFuncB The function used to transform the value of
     * each point into the intensity of the blue channel, within the range `[0, 1]`.
     */
    constructor(valueFuncR, valueFuncG, valueFuncB) {
        super();

        this.valueFuncR = valueFuncR;
        this.valueFuncG = valueFuncG;
        this.valueFuncB = valueFuncB;

        Object.freeze(this);
    }

    /**
     * A function that computes the color of each point in a point cloud.
     * 
     * @param {Readonly<PointBuffer>} buffer The buffer containing the data of the point cloud.
     * `this.channel{R,G,B}` should be in the range `[0, buffer.numChannels)`.
     * @returns {THREE.Color[]} The `i`th element is the color of the `i`th point.
     */
    getColors(buffer) {
        const { valueFuncR, valueFuncG, valueFuncB } = this;

        const normedValuesR = valueFuncR.getValues(buffer);
        const normedValuesG = valueFuncG.getValues(buffer);
        const normedValuesB = valueFuncB.getValues(buffer);

        return normedValuesR.map((r, i) => {
            const g = normedValuesG[i];
            const b = normedValuesB[i];

            return new THREE.Color(r, g, b);
        });
    }

    /**
     * Creates a deep copy of this object.
     * 
     * @returns {ComposeRGB} The newly created copy.
     */
    clone() {
        return new ComposeRGB(this.valueFuncR, this.valueFuncG, this.valueFuncB);
    }
}
