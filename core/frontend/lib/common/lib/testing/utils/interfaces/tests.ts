import { expect } from "chai";
import fc from "fast-check";
import _ from "lodash";
import { describe, it } from "@vitest/runner";

import type { Equatable } from "../../../utils/interfaces/Equatable";
import type { Hashable } from "../../../utils/interfaces/Hashable";

import { EquatableStub, HashableStub } from "./stubs";

/**
 * Creates an arbitrary that generates `count` values, of which at most one may be replaced by
 * a stub.
 *
 * @param stubArb Generates an instance of the stub.
 * @param cutArb Generates an instance of the class under test.
 * @param count The number of values to generate in total.
 * @returns The resulting arbitrary.
 */
function makeMaybeStubsArbitrary<T, U>(
  stubArb: fc.Arbitrary<T>,
  cutArb: fc.Arbitrary<U>,
  count: number,
): fc.Arbitrary<(T | U)[]> {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("Count must be a non-negative integer");
  }

  return fc
    .tuple(
      fc.oneof(stubArb, cutArb),
      fc.tuple(..._.range(count - 1).map(() => cutArb)),
      fc.integer({ min: 0, max: count - 1 }),
    )
    .map(([maybeStub, cuts, insertIdx]) => [
      ...cuts.slice(0, insertIdx),
      maybeStub,
      ...cuts.slice(insertIdx),
    ]);
}

/** Options for equatable test suites. */
export interface EquatableTestsOptions {
  /** Test parameters that are used to reproduce failures. */
  repro?: Pick<fc.Parameters, "seed" | "path" | "endOnFailure">;
}

/**
 * Validates the standard properties of equality checking:
 * - Reflexive property: `true -> a.equals(a)`
 * - Symmetric property: `a.equals(b) -> b.equals(a)`
 * - Transitive property: `a.equals(b) && b.equals(c) -> a.equals(c)`
 *
 * Note that this should hold even for objects with different types.
 *
 * @param arb Generates the equatable instances to test.
 * @param opts Optional parameters of the test.
 * @returns The new test suite.
 */
export function makeEquatableTests<T extends Equatable>(
  arb: fc.Arbitrary<T>,
  opts: EquatableTestsOptions = {},
): ReturnType<typeof describe> {
  const { repro: reproOpts = {} } = opts;

  return describe("Equatable#equals()", () => {
    it("reflexive property", () => {
      fc.assert(
        fc.property(
          makeMaybeStubsArbitrary(fc.constant(new EquatableStub()), arb, 1),
          fc.context(),
          ([a], ctx) => {
            expect(a.equals(a)).to.be.true;
          },
        ),
        reproOpts,
      );
    });
    it("symmetric property", () => {
      fc.assert(
        fc.property(
          makeMaybeStubsArbitrary(fc.constant(new EquatableStub()), arb, 2),
          fc.context(),
          ([a, b], ctx) => {
            expect(a.equals(b)).to.equal(b.equals(a));
          },
        ),
        reproOpts,
      );
    });
    it("transitive property", () => {
      fc.assert(
        fc.property(
          makeMaybeStubsArbitrary(fc.constant(new EquatableStub()), arb, 3),
          fc.context(),
          ([a, b, c], ctx) => {
            const aEqb = a.equals(b);
            const bEqc = b.equals(c);
            ctx.log(`a.equals(b)=${aEqb}`);
            ctx.log(`b.equals(c)=${bEqc}`);

            if (aEqb && bEqc) {
              expect(a.equals(c)).to.be.true;
            }
          },
        ),
        reproOpts,
      );
    });
  });
}

/** Options for hashable test suites. */
export interface HashableTestsOptions {
  /** Test parameters that are used to reproduce failures. */
  repro?: Pick<fc.Parameters, "seed" | "path" | "endOnFailure">;
}

/**
 * Validates the standard properties of hash values:
 * - Consistency with equality: `a.equals(b) -> a.hash() === b.hash()`
 *
 * Note that this should hold even for objects with different types.
 *
 * @param arb Generates the hashable instances to test.
 * @param opts Optional parameters of the test.
 * @returns The new test suite.
 */
export function makeHashableTests<T extends Hashable>(
  arb: fc.Arbitrary<T>,
  opts: HashableTestsOptions = {},
): ReturnType<typeof describe> {
  const { repro: reproOpts = {} } = opts;

  return describe("Hashable#hash()", () => {
    it("consistency with equality (against self)", () => {
      fc.assert(
        fc.property(
          makeMaybeStubsArbitrary(fc.constant(new HashableStub()), arb, 1),
          fc.context(),
          ([a], ctx) => {
            expect(a.hash()).to.equal(a.hash());
          },
        ),
        reproOpts,
      );
    });
    it("consistency with equality (against other)", () => {
      fc.assert(
        fc.property(
          makeMaybeStubsArbitrary(fc.constant(new HashableStub()), arb, 2),
          fc.context(),
          ([a, b], ctx) => {
            if (a.equals(b)) {
              expect(a.hash()).to.equal(b.hash());
            }
          },
        ),
        reproOpts,
      );
    });
  });
}
