import { Decimal } from "decimal.js";
import _ from "lodash";
import { z } from "zod";

import type { Hashable } from "./interfaces/Hashable";

interface _TimestampAttrs {
  unixTime: Decimal;
}

/**
 * Similar to {@link Date}, but stores the timestamp as a decimal value to achieve
 * arbitrary precision.
 *
 * This is a value-based class.
 */
export class Timestamp implements Hashable {
  /**
   * The minimum Unix timestamp supported by {@link Date}, and consequently,
   * this object.
   */
  static MIN_UNIX_TIME = -8.64e15;

  /**
   * The maximum Unix timestamp supported by {@link Date}, and consequently,
   * this object.
   */
  static MAX_UNIX_TIME = +8.64e15;

  /**
   * The precision of the stored timestamps.
   */
  static DECIMAL_PRECISION = 1000;

  static {
    Decimal.set({ precision: this.DECIMAL_PRECISION });
  }

  static readonly PLAIN_SCHEMA = z.string().datetime({ offset: true });

  static readonly SCHEMA = this.PLAIN_SCHEMA.transform(
    (data: string) => new Timestamp(data),
  );

  /**
   * The number of milliseconds since midnight, January 1, 1970 UTC.
   */
  #unixTime: Decimal;

  /**
   * Obtains the attributes of a {@link Timestamp} based on the current date and time.
   */
  static #getCurrentAttrs(): _TimestampAttrs {
    return Timestamp.#parseUnixTime(performance.timeOrigin + performance.now());
  }

  /**
   * Parses the attributes of a {@link Timestamp} from a Unix timestamp.
   *
   * @param unixTime The number of milliseconds since midnight, January 1,
   * 1970 UTC. May be a floating-point or decimal value.
   */
  static #parseUnixTime(unixTime: number | Decimal): _TimestampAttrs {
    const decimalUnixTime = new Decimal(unixTime);

    if (decimalUnixTime.isNaN()) {
      throw new Error("The Unix timestamp cannot be NaN");
    }

    if (
      decimalUnixTime.lessThan(this.MIN_UNIX_TIME) ||
      decimalUnixTime.greaterThan(this.MAX_UNIX_TIME)
    ) {
      throw new Error("The Unix timestamp is not in the valid range");
    }

    return { unixTime: decimalUnixTime };
  }

  /**
   * Parses the attributes of a {@link Timestamp} from a string.
   *
   * @param dateString A string that can be parsed according to {@link Date.parse}.
   * May contain additional digits after milliseconds.
   */
  static #parseDateString(dateString: string): _TimestampAttrs {
    // Date parses extra decimal digits incorrectly
    const dateStringFloor = dateString.replace(/(\.[0-9]{3})[0-9]+/, "$1");

    const dateFloor = new Date(dateStringFloor);
    if (Number.isNaN(dateFloor.getTime())) {
      throw new Error("The string cannot be parsed into a valid Date");
    }

    const millisecondsFloor = new Decimal(dateFloor.getTime());

    const millisecondsFracDigits =
      /\.[0-9]{3}([0-9]+)/.exec(dateString)?.[1] ?? "0";
    const millisecondsFrac = new Decimal(`0.${millisecondsFracDigits}`);

    const decimalUnixTime = millisecondsFloor.add(millisecondsFrac);

    return { unixTime: decimalUnixTime };
  }

  /**
   * Parses the attributes of a {@link Timestamp} from a {@link Date} object.
   *
   * @param dateObject A existing {@link Date} object which has millisecond-level
   * precision.
   */
  static #parseDateObject(dateObject: Date): _TimestampAttrs {
    return this.#parseUnixTime(dateObject.getTime());
  }

  /**
   * Parses the attributes of a {@link Timestamp} from another {@link Timestamp} object.
   *
   * @param other A existing {@link Timestamp} object which has arbitrary
   * precision.
   */
  static #parseOther(other: Timestamp): _TimestampAttrs {
    return { unixTime: other.#unixTime };
  }

  /**
   * Creates a new timestamp with arbitrary precision.
   *
   * @param value This can be one of:
   * - The number of milliseconds since midnight, January 1, 1970 UTC.
   *   May be a floating-point or decimal value.
   * - A string value representing a date that can be parsed according to {@link Date.parse}.
   *   May contain additional digits after milliseconds.
   * - A existing {@link Date} object which has millisecond-level precision.
   * - An existing {@link Timestamp} object which has arbitrary precision.
   *
   * Defaults to the current date and time, with arbitrary precision.
   */
  constructor(value?: number | Decimal | string | Readonly<Date> | Timestamp) {
    let attrs: _TimestampAttrs;

    if (value === undefined) {
      attrs = Timestamp.#getCurrentAttrs();
    } else if (typeof value === "number" || Decimal.isDecimal(value)) {
      attrs = Timestamp.#parseUnixTime(value);
    } else if (value instanceof Timestamp) {
      attrs = Timestamp.#parseOther(value);
    } else if (typeof value === "string") {
      attrs = Timestamp.#parseDateString(value);
    } else if (_.isDate(value)) {
      attrs = Timestamp.#parseDateObject(value);
    } else {
      throw new TypeError("Invalid type of value");
    }

    this.#unixTime = attrs.unixTime;

    Object.freeze(this);
  }

  /**
   * Hashes this object to a string so that it can be used as a key in a mapping.
   */
  hash(): string {
    return JSON.stringify({ time: this.getTime() });
  }

  /**
   * Tests whether two objects are equal to each other;
   * that is, whether they have the same UTC timestamp.
   *
   * This should agree with {@link hash}; that is, two equal objects must
   * have the same hash, although two objects with the same hash need not be equal.
   */
  equals(other: object): boolean {
    return other instanceof Timestamp && this.getTime() === other.getTime();
  }

  /**
   * Returns the primitive value of the specified object.
   */
  valueOf(): number {
    console.warn(
      "Type coercions are discouraged for Timestamp objects. Prefer using Timestamp#getDate() or Timestamp#getTime().",
    );

    return this.getTime();
  }

  /**
   * Returns a string representation of this timestamp.
   *
   * Unlike {@link Date#toString}, the ISO format is returned to better
   * distinguish it from a regular {@link Date} object.
   */
  toString(): string {
    return this.toISOString();
  }

  /**
   * Used by the {@link JSON.stringify} method to enable the transformation of an object's
   * data for JavaScript Object Notation (JSON) serialization.
   */
  toJSON(): string {
    return this.toISOString();
  }

  /**
   * Returns this timestamp as a string value in ISO format.
   */
  toISOString(): string {
    const dateFloor = new Date(this.#unixTime.floor().toNumber());

    // According to the documentation, the output format should always be
    // `[±YY]YYYY-MM-DDTHH:mm:ss.sssZ`
    const dateFloorStr = dateFloor.toISOString();
    if (!dateFloorStr.endsWith("Z")) {
      throw new Error("Incorrect string format");
    }

    const prefix = _.trimEnd(dateFloorStr, "Z");
    const suffix = "Z";

    const extraPrecisionDigits =
      this.#unixTime.sub(this.#unixTime.floor()).toFixed().split(".").at(1) ??
      "";

    return `${prefix}${extraPrecisionDigits}${suffix}`;
  }

  /**
   * Returns the stored date with millisecond-level precision.
   */
  getDate(): Date {
    return new Date(this.getTime());
  }

  /**
   * Returns the stored time value in milliseconds since midnight, January 1, 1970 UTC.
   *
   * Unlike {@link Date#getTime}, this can be a floating-point value.
   */
  getTime(): number {
    return this.#unixTime.toNumber();
  }

  /**
   * Creates a copy of this object.
   */
  clone(): Timestamp {
    return new Timestamp(this);
  }
}
