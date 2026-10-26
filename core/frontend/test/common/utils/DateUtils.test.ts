import { expect } from "chai";
import fc from "fast-check";
import { describe, it } from "vitest";

import {
  checkValue,
  makeEquatableTests,
  makeHashableTests,
} from "../../../lib/common/lib/testing";
import {
  makeTimestampArbitrary,
  makeUnixTimeArbitrary,
} from "../../../lib/common/lib/testing/utils/arbitraries";
import { Timestamp } from "../../../lib/common/lib/utils";

describe("Timestamp", () => {
  describe("#constructor()", () => {
    it("defaults to a frozen timestamp with a valid Date", () => {
      const timestamp = new Timestamp();
      expect(timestamp).to.be.frozen;
      expect(timestamp.getDate().getTime(), "Invalid date").to.not.be.NaN;
      expect(timestamp.getTime(), "Invalid time").to.not.be.NaN;
    });
    it("preserves fractional milliseconds through construction and cloning", () => {
      for (const value of [0.125, -0.125, 1700000000000.25]) {
        const timestamp = new Timestamp(value);
        const clone = timestamp.clone();
        expect(timestamp.getTime()).to.equal(value);
        expect(clone.getTime()).to.equal(value);
        expect(clone.toISOString()).to.equal(timestamp.toISOString());
        expect(
          Math.abs(timestamp.getTime() - timestamp.getDate().getTime()),
        ).to.be.lessThan(1);
      }
      const timestamp = new Timestamp("1970-01-01T00:00:00.000125Z");
      expect(timestamp.getTime()).to.equal(0.125);
      expect(timestamp.clone().toISOString()).to.equal(
        "1970-01-01T00:00:00.000125Z",
      );
    });
    it("should preserve Unix timestamp", () => {
      fc.assert(
        fc.property(makeUnixTimeArbitrary(), fc.context(), (unixTime, ctx) => {
          const timestamp = new Timestamp(unixTime);
          ctx.log(
            `timestamp=${fc.stringify({
              date: timestamp.getDate(),
              time: timestamp.getTime(),
            })}`,
          );

          expect(timestamp.getTime()).to.equal(Number(unixTime));
        }),
      );
    });
    it("should preserve value of Date object", () => {
      fc.assert(
        fc.property(fc.date(), fc.context(), (date, ctx) => {
          const timestamp = new Timestamp(date);
          ctx.log(
            `timestamp=${fc.stringify({
              date: timestamp.getDate(),
              time: timestamp.getTime(),
            })}`,
          );

          expect(timestamp.getDate().getTime()).to.equal(date.getTime());
        }),
      );
    });
    it("should preserve value of Date string", () => {
      fc.assert(
        fc.property(fc.date(), fc.context(), (date, ctx) => {
          // Other string methods do not preserve the full resolution of Date
          const timestamp = new Timestamp(date.toISOString());
          ctx.log(
            `timestamp=${fc.stringify({
              date: timestamp.getDate(),
              time: timestamp.getTime(),
            })}`,
          );

          expect(timestamp.getDate().getTime()).to.equal(date.getTime());
        }),
      );
    });
    it("should reject invalid Unix timestamps", () => {
      fc.assert(
        fc.property(
          makeUnixTimeArbitrary(false),
          fc.context(),
          (unixTime, ctx) => {
            expect(() => new Timestamp(unixTime)).to.throw(Error);
          },
        ),
      );
    });
    it("should reject invalid date strings", () => {
      expect(() => new Timestamp("Invalid Date")).to.throw(Error);
    });
    it("should reject invalid date objects", () => {
      expect(() => new Timestamp(new Date(NaN))).to.throw(Error);
    });
  });

  makeEquatableTests(makeTimestampArbitrary());
  makeHashableTests(makeTimestampArbitrary());

  describe("#clone()", () => {
    it("should return a new Timestamp that is equal to the original", () => {
      fc.assert(
        fc.property(makeTimestampArbitrary(), fc.context(), (date, ctx) => {
          const clone = date.clone();
          expect(clone).not.to.equal(date);
          expect(clone.toISOString()).to.equal(date.toISOString());
          expect(checkValue(date, clone, ctx, (a, b) => a.equals(b))).to.be
            .true;
        }),
      );
    });
  });
});
