import Decimal from 'decimal.js';
import _ from 'lodash';
import { z } from 'zod';

/**
 * @typedef {import('./interfaces').Hashable} Hashable
 */

/**
 * @typedef {{ unixTime: Decimal }} _TimestampAttrs
 */

/**
 * Similar to {@link Date}, but stores the timestamp as a decimal value to achieve
 * arbitrary precision.
 * 
 * This is a value-based class.
 * 
 * @implements {Hashable}
 */
export class Timestamp {

    /**
     * The minimum Unix timestamp supported by {@link Date}, and consequently,
     * this object.
     * 
     * @type {number}
     */
    static MIN_UNIX_TIME = -8.64e15;

    /**
     * The maximum Unix timestamp supported by {@link Date}, and consequently,
     * this object.
     * 
     * @type {number}
     */
    static MAX_UNIX_TIME = +8.64e15;

    /**
     * The precision of the stored timestamps.
     */
    static DECIMAL_PRECISION = 1000;

    static {
        Decimal.set({ precision: this.DECIMAL_PRECISION });
    }

    /**
     * @readonly
     */
    static PLAIN_SCHEMA = z.string().datetime({ offset: true });

    /**
     * @readonly
     */
    static SCHEMA = this.PLAIN_SCHEMA
        .transform((data) => new Timestamp(data));

    /**
     * The number of milliseconds since midnight, January 1, 1970 UTC.
     * 
     * @readonly
     * @type {Decimal}
     */
    #unixTime;

    /**
     * Obtains the attributes of a {@link Timestamp} based on the current date and time.
     * 
     * @returns {_TimestampAttrs} The attributes of the current date and time.
     */
    static #getCurrentAttrs() {
        return Timestamp.#parseUnixTime(performance.timeOrigin + performance.now());
    }

    /**
     * Parses the attributes of a {@link Timestamp} from a Unix timestamp.
     * 
     * @param {number | Decimal} unixTime The number of milliseconds since midnight, January 1,
     * 1970 UTC. May be a floating-point or decimal value.
     * @returns {_TimestampAttrs} The parsed attributes.
     */
    static #parseUnixTime(unixTime) {
        const decimalUnixTime = new Decimal(unixTime);

        if (decimalUnixTime.isNaN()) {
            throw new Error('The Unix timestamp cannot be NaN');
        }

        if (decimalUnixTime.lessThan(this.MIN_UNIX_TIME)
            || decimalUnixTime.greaterThan(this.MAX_UNIX_TIME)) {
            throw new Error('The Unix timestamp is not in the valid range');
        }

        return { unixTime: decimalUnixTime };
    }

    /**
     * Parses the attributes of a {@link Timestamp} from a string.
     * 
     * @param {string} dateString A string that can be parsed according to {@link Date.parse}.
     * May contain additional digits after milliseconds.
     * @returns {_TimestampAttrs} The parsed attributes.
     */
    static #parseDateString(dateString) {
        // Date parses extra decimal digits incorrectly
        const dateStringFloor = dateString.replace(/(\.[0-9]{3})[0-9]+/, '$1');

        const dateFloor = new Date(dateStringFloor);
        if (Number.isNaN(dateFloor.getTime())) {
            throw new Error('The string cannot be parsed into a valid Date');
        }

        const millisecondsFloor = new Decimal(dateFloor.getTime());

        const millisecondsFracDigits = dateString.match(/\.[0-9]{3}([0-9]+)/)?.[1] ?? '0';
        const millisecondsFrac = new Decimal(`0.${millisecondsFracDigits}`);

        const decimalUnixTime = millisecondsFloor.add(millisecondsFrac);

        return { unixTime: decimalUnixTime };
    }

    /**
     * Parses the attributes of a {@link Timestamp} from a {@link Date} object.
     * 
     * @param {Date} dateObject A existing {@link Date} object which has millisecond-level
     * precision.
     * @returns {_TimestampAttrs} The parsed attributes.
     */
    static #parseDateObject(dateObject) {
        return this.#parseUnixTime(dateObject.getTime());
    }

    /**
     * Parses the attributes of a {@link Timestamp} from another {@link Timestamp} object.
     * 
     * @param {Timestamp} other A existing {@link Timestamp} object which has arbitrary
     * precision.
     * @returns {_TimestampAttrs} The parsed attributes.
     */
    static #parseOther(other) {
        return { unixTime: other.#unixTime };
    }

    /**
     * Creates a new timestamp with arbitrary precision.
     * 
     * @param {number | Decimal | string | Readonly<Date> | Timestamp} [value] This can be one of:
     * - The number of milliseconds since midnight, January 1, 1970 UTC.
     *   May be a floating-point or decimal value.
     * - A string value representing a date that can be parsed according to {@link Date.parse}.
     *   May contain additional digits after milliseconds.
     * - A existing {@link Date} object which has millisecond-level precision.
     * - An existing {@link Timestamp} object which has arbitrary precision.
     * 
     * Defaults to the current date and time, with arbitrary precision.
     */
    constructor(value = undefined) {
        /**
         * @type {_TimestampAttrs}
         */
        let attrs;

        if (value === undefined) {
            attrs = Timestamp.#getCurrentAttrs();
        } else if (typeof value === 'number' || Decimal.isDecimal(value)) {
            attrs = Timestamp.#parseUnixTime(value);
        } else if (typeof value === 'string') {
            attrs = Timestamp.#parseDateString(value);
        } else if (_.isDate(value)) {
            attrs = Timestamp.#parseDateObject(value);
        } else if (value instanceof Timestamp) {
            attrs = Timestamp.#parseOther(value);
        } else {
            throw new TypeError('Invalid type of value');
        }

        this.#unixTime = attrs.unixTime;

        Object.freeze(this);
    }

    /**
     * Hashes this object to a string so that it can be used as a key in a mapping.
     * 
     * @returns {string} The resulting hash.
     */
    hash() {
        return JSON.stringify({ time: this.getTime() });
    }

    /**
     * Tests whether two objects are equal to each other;
     * that is, whether they have the same UTC timestamp.
     * 
     * This should agree with {@link hash}; that is, two equal objects must
     * have the same hash, although two objects with the same hash need not be equal.
     *
     * @param {object} other The object to compare against.
     * @returns {boolean} `true` if the two objects are equal; otherwise, `false`.
     */
    equals(other) {
        return other instanceof Timestamp
            && this.getTime() === other.getTime();
    }

    /**
     * Returns the primitive value of the specified object.
     * 
     * @returns {number} The resulting primitive value.
     */
    valueOf() {
        console.warn('Type coercions are discouraged for Timestamp objects. Prefer using Timestamp#getDate() or Timestamp#getTime().');

        return this.getTime();
    }

    /**
     * Returns a string representation of this timestamp.
     * 
     * Unlike {@link Date#toString}, the ISO format is returned in order to better
     * distinguish it from a regular {@link Date} object.
     * 
     * @returns {string} The resulting string.
     */
    toString() {
        return this.toISOString();
    }

    /**
     * Used by the {@link JSON.stringify} method to enable the transformation of an object's
     * data for JavaScript Object Notation (JSON) serialization.
     * 
     * @returns {string} The JSON-compatible type.
     */
    toJSON() {
        return this.toISOString();
    }

    /**
     * Returns this timestamp as a string value in ISO format.
     * 
     * @returns {string} The resulting string value.
     */
    toISOString() {
        const dateFloor = new Date(this.#unixTime.floor().toNumber());

        // According to the documentation, the output format should always be
        // `[±YY]YYYY-MM-DDTHH:mm:ss.sssZ`
        const dateFloorStr = dateFloor.toISOString();
        if (!dateFloorStr.endsWith('Z')) {
            throw new Error('Incorrect string format');
        }

        const prefix = _.trimEnd(dateFloorStr, 'Z');
        const suffix = 'Z';

        const extraPrecisionDigits = this.#unixTime.sub(this.#unixTime.floor())
            .toFixed().split('.').at(1) ?? '';

        return `${prefix}${extraPrecisionDigits}${suffix}`;
    }

    /**
     * Returns the stored date with millisecond-level precision.
     * 
     * @returns {Date} The resulting date.
     */
    getDate() {
        return new Date(this.getTime());
    }

    /**
     * Returns the stored time value in milliseconds since midnight, January 1, 1970 UTC.
     * 
     * Unlike {@link Date#getTime}, this can be a floating-point value.
     * 
     * @returns {number} The resulting value.
     */
    getTime() {
        return this.#unixTime.toNumber();
    }

    /**
     * Creates a copy of this object.
     * 
     * @returns {Timestamp} The newly created copy.
     */
    clone() {
        return new Timestamp(this);
    }
}
