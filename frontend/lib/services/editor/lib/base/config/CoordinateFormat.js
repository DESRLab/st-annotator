/**
 * @typedef {import('three')} THREE
 */

/**
 * @typedef {import('../../../../../common/lib/spatial').OptionalVector3} OptionalVector3
 */

/**
 * Specifies a mapping between the coordinate system of the database and that of `three.js`,
 * where the name of the mapping is formed by iterating over the axes in `three.js` and
 * returning the corresponding axes in the database.
 * 
 * For example, if `(1, 2, 3)` in `three.js` corresponds to `(3, 1, 2)` in the database,
 * the coordinate format is taken to be `ZXY`.
 * 
 * This is a value-based class.
 * 
 * @interface
 */
export class CoordinateFormatSpec {

    /**
     * Returns a string representation of an object.
     * 
     * @returns {string} A string representing this object.
     * @abstract
     */
    toString() {
        throw new Error('Not implemented');
    }

    /**
     * Converts a set of coordinates from `three.js` format into database format.
     * 
     * @template {Readonly<OptionalVector3> | THREE.Vector3} T
     * @param {T} threeCoords The original coordinates.
     * @returns {T} The converted coordinates.
     */
    toDatabaseCoords(threeCoords) {
        throw new Error('Not implemented');
    }

    /**
     * Converts a set of coordinates from database format into `three.js` format.
     * 
     * @template {Readonly<OptionalVector3> | THREE.Vector3} T
     * @param {T} dbCoords The original coordinates.
     * @returns {T} The converted coordinates.
     */
    toThreeJSCoords(dbCoords) {
        throw new Error('Not implemented');
    }
}

/**
 * Concrete implementation of {@link CoordinateFormatSpec}.
 * 
 * @implements {CoordinateFormatSpec}
 */
class CoordinateFormatSpecImpl {

    /**
     * The name of this mapping.
     * 
     * @readonly
     * @type {string}
     */
    #name;

    /**
     * The index of the coordinate in database format that represents
     * the `x` coordinate in `three.js` format.
     * 
     * @readonly
     * @type {number}
     */
    #xIdx;

    /**
     * The index of the coordinate in database format that represents
     * the `y` coordinate in `three.js` format.
     * 
     * @readonly
     * @type {number}
     */
    #yIdx;

    /**
     * The index of the coordinate in database format that represents
     * the `z` coordinate in `three.js` format.
     * 
     * @readonly
     * @type {number}
     */
    #zIdx;

    /**
     * Creates a new mapping between the coordinate system of a database and that of `three.js`.
     * 
     * @param {string} name The name of the mapping.
     * @param {number} xIdx The index of the coordinates in database format that represents
     * the `x` coordinate in `three.js` format.
     * @param {number} yIdx The index of the coordinates in database format that represents
     * the `y` coordinate in `three.js` format.
     * @param {number} zIdx The index of the coordinates in database format that represents
     * the `z` coordinate in `three.js` format.
     */
    constructor(name, xIdx, yIdx, zIdx) {
        this.#name = name;
        this.#xIdx = xIdx;
        this.#yIdx = yIdx;
        this.#zIdx = zIdx;

        Object.freeze(this);
    }

    /**
     * Returns a string representation of an object.
     * 
     * @returns {string} A string representing this object.
     */
    toString() {
        return `CoordinateFormat.${this.#name}`;
    }

    /**
     * Converts a set of coordinates from `three.js` format into database format.
     * 
     * @template {Readonly<OptionalVector3> | THREE.Vector3} T
     * @param {T} threeCoords The original coordinates.
     * @returns {T} The converted coordinates.
     */
    toDatabaseCoords(threeCoords) {
        // @ts-expect-error
        return threeCoords.clone()
            // @ts-expect-error
            .setComponent(this.#xIdx, threeCoords.x)
            // @ts-expect-error
            .setComponent(this.#yIdx, threeCoords.y)
            // @ts-expect-error
            .setComponent(this.#zIdx, threeCoords.z);
    }

    /**
     * Converts a set of coordinates from database format into `three.js` format.
     * 
     * @template {Readonly<OptionalVector3> | THREE.Vector3} T
     * @param {T} dbCoords The original coordinates.
     * @returns {T} The converted coordinates.
     */
    toThreeJSCoords(dbCoords) {
        const x = dbCoords.getComponent(this.#xIdx);
        const y = dbCoords.getComponent(this.#yIdx);
        const z = dbCoords.getComponent(this.#zIdx);

        // @ts-expect-error
        return dbCoords.clone().set(x, y, z);
    }
}

/**
 * Represents a mapping between the coordinate system of a database and that of `three.js`,
 * where the name of the mapping is formed by iterating over the axes in `three.js` and
 * returning the corresponding axes in the database.
 * 
 * For example, if `(1, 2, 3)` in `three.js` corresponds to `(3, 1, 2)` in the database,
 * the coordinate format is taken to be `ZXY`.
 * 
 * @readonly
 * @enum {CoordinateFormatSpec}
 */
export const CoordinateFormat = Object.freeze({
    XYZ: new CoordinateFormatSpecImpl('XYZ', 0, 1, 2),
    XZY: new CoordinateFormatSpecImpl('XZY', 0, 2, 1),
    YXZ: new CoordinateFormatSpecImpl('YXZ', 1, 0, 2),
    YZX: new CoordinateFormatSpecImpl('YZX', 2, 0, 1),
    ZXY: new CoordinateFormatSpecImpl('ZXY', 1, 2, 0),
    ZYX: new CoordinateFormatSpecImpl('ZYX', 2, 1, 0),
});
