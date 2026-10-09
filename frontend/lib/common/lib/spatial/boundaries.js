import { Data } from 'dataclass';
import { z } from 'zod';

import { Timestamp } from '../utils';
import { DecimalVector3Data, OptionalDecimalVector3Data } from './vectors';

/**
 * Represents an interval along a coordinate axis.
 */
export class CoordBounds extends Data {

    /**
     * The minimum coordinate, or `null` if unbounded.
     * 
     * @readonly
     * @type {?number}
     */
    min;

    /**
     * The maximum coordinate, or `null` if unbounded.
     * 
     * @readonly
     * @type {?number}
     */
    max;

    /**
     * The center coordinate, or `null` if either boundary is missing.
     * 
     * @type {?number}
     */
    get center() {
        const { min, max } = this;
        if (min == null || max == null) return null;

        return (min + max) / 2;
    }

    /**
     * Tests if a point falls within this interval (inclusive).
     * 
     * @param {number} point The point to test.
     * @returns {boolean} `true` if the given point falls within this interval;
     * otherwise, `false`.
     */
    contains(point) {
        return (this.min == null || this.min <= point)
            && (this.max == null || this.max >= point);
    }
}

/**
 * Represents a set of boundaries in 3D space.
 */
export class SpatialBounds extends Data {

    /**
     * @readonly
     * @type {CoordBounds}
     */
    xBounds;

    /**
     * @readonly
     * @type {CoordBounds}
     */
    yBounds;

    /**
     * @readonly
     * @type {CoordBounds}
     */
    zBounds;

    /**
     * Tests if a point falls within this set of boundaries (inclusive).
     * 
     * @param {THREE.Vector3} point The point to test.
     * @returns {boolean} `true` if the given point falls within this set of boundaries;
     * otherwise, `false`.
     */
    contains(point) {
        return this.xBounds.contains(point.x)
            && this.yBounds.contains(point.y)
            && this.zBounds.contains(point.z);
    }
}

/**
 * For more details, refer to the corresponding Pydantic model on the backend.
 */
export class PartialSTBounds extends Data {

    /**
     * @readonly
     */
    static PLAIN_SCHEMA = z.object({
        min_coords: OptionalDecimalVector3Data.SCHEMA,
        max_coords: OptionalDecimalVector3Data.SCHEMA,
        min_timestamp: Timestamp.SCHEMA.nullable(),
        max_timestamp: Timestamp.SCHEMA.nullable(),
    });

    /**
     * @readonly
     */
    static SCHEMA = this.PLAIN_SCHEMA
        .transform((data) => this.create(data));

    /**
     * @readonly
     * @type {OptionalDecimalVector3Data}
     */
    min_coords;

    /**
     * @readonly
     * @type {OptionalDecimalVector3Data}
     */
    max_coords;

    /**
     * @readonly
     * @type {?Timestamp}
     */
    min_timestamp;

    /**
     * @readonly
     * @type {?Timestamp}
     */
    max_timestamp;

    /**
     * Deserializes an instance of this class from data parsed from a JSON string.
     * 
     * @param {unknown} obj The data to deserialize.
     * @returns {PartialSTBounds} The resulting new instance.
     */
    static fromJSON(obj) {
        return this.SCHEMA.parse(obj);
    }

    /**
     * Creates a new instance with no boundaries.
     * 
     * @returns {PartialSTBounds} The resulting instance.
     */
    static empty() {
        return PartialSTBounds.create({
            min_coords: OptionalDecimalVector3Data.empty(),
            max_coords: OptionalDecimalVector3Data.empty(),
            min_timestamp: null,
            max_timestamp: null,
        });
    }

    /**
     * Obtains the spatial component of this set of boundaries.
     * 
     * @returns {SpatialBounds} The spatial boundaries.
     */
    getSpatialBounds() {
        const minCoords = this.min_coords.toOptionalVector3();
        const maxCoords = this.max_coords.toOptionalVector3();

        return SpatialBounds.create({
            xBounds: CoordBounds.create({ min: minCoords.x, max: maxCoords.x }),
            yBounds: CoordBounds.create({ min: minCoords.y, max: maxCoords.y }),
            zBounds: CoordBounds.create({ min: minCoords.z, max: maxCoords.z }),
        });
    }

    /**
     * Obtains the time component of this set of boundaries.
     * 
     * @returns {CoordBounds} The timestamp boundaries.
     */
    getTimestampBounds() {
        return CoordBounds.create({
            min: this.min_timestamp?.getTime() ?? null,
            max: this.max_timestamp?.getTime() ?? null,
        });
    }
}

/**
 * For more details, refer to the corresponding Pydantic model on the backend.
 */
export class STBounds extends Data {

    /**
     * @readonly
     */
    static PLAIN_SCHEMA = z.object({
        min_coords: DecimalVector3Data.SCHEMA,
        max_coords: DecimalVector3Data.SCHEMA,
        min_timestamp: Timestamp.SCHEMA,
        max_timestamp: Timestamp.SCHEMA,
    });

    /**
     * @readonly
     */
    static SCHEMA = this.PLAIN_SCHEMA
        .transform((data) => this.create(data));

    /**
     * @readonly
     * @type {DecimalVector3Data}
     */
    min_coords;

    /**
     * @readonly
     * @type {DecimalVector3Data}
     */
    max_coords;

    /**
     * @readonly
     * @type {Timestamp}
     */
    min_timestamp;

    /**
     * @readonly
     * @type {Timestamp}
     */
    max_timestamp;

    /**
     * Deserializes an instance of this class from data parsed from a JSON string.
     * 
     * @param {unknown} obj The data to deserialize.
     * @returns {STBounds} The resulting new instance.
     */
    static fromJSON(obj) {
        return this.SCHEMA.parse(obj);
    }
}
