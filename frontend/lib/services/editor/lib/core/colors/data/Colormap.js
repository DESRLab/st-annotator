import * as THREE from 'three';

/**
 * Represents a mapping from real numbers to colors.
 * 
 * This is a value-based class.
 */
export class Colormap {

    /**
     * The name of the colormap.
     * 
     * @readonly
     * @type {string}
     */
    name;

    /**
     * A dense array containing the colors used for values within the interval `[0, 1]`, where
     * the first color is mapped from `0` and the last color is mapped from `1`.
     * 
     * @readonly
     * @type {ReadonlyArray<Readonly<THREE.Color>>}
     */
    #colors;

    /**
     * Creates a new colormap.
     * 
     * @param {string} name The name of the colormap.
     * @param {Iterable<THREE.ColorRepresentation>} colors
     * The colors used for values within the interval `[0, 1]`, where the
     * first color is mapped from `0` and the last color is mapped from `1`.
     * All of its elements are extracted and converted to {@link THREE.Color}
     * objects to form the color map.
     */
    constructor(name, colors) {
        this.name = name;
        this.#colors = Array.from(colors, (c) => Object.freeze(new THREE.Color(c)));

        Object.freeze(this);
    }

    /**
     * Applies the colormap to a set of values within the interval `[0, 1]`.
     * 
     * @param {number[]} values The values to obtain the colors for.
     * @param {THREE.ColorRepresentation} badColor The color used for values outside the interval.
     * It is converted to a {@link THREE.Color} through its constructor.
     * @returns {THREE.Color[]} The `i`th element is the color of the `i`th value.
     */
    apply(values, badColor = 'black') {
        const colors = this.#colors;
        const maxIdx = colors.length - 1;

        // No available colors
        if (maxIdx < 0) return values.map(() => new THREE.Color(badColor));

        return values.map((v) => (
            (Number.isFinite(v) && (0 <= v && v <= 1)) ? colors[Math.round(v * maxIdx)]
                : new THREE.Color(badColor)
        ));
    }
}
