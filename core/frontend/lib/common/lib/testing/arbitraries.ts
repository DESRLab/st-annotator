import { expect } from "chai";
import fc from "fast-check";
import _ from "lodash";
import { describe, it } from "@vitest/runner";

/**
 * Creates a subclass that includes {@link fc.toStringMethod},
 * such that its instances become easier to inspect in case the test fails.
 *
 * @param cls The original class.
 * @param props The properties to include in the string representation.
 * @returns The newly created subclass. The original class remains unchanged.
 */
export function assignToStringMethod<
  T extends object,
  C extends new (...args: any[]) => T,
>(cls: C, ...props: _.Many<keyof T>[]): C {
  if (fc.toStringMethod in cls.prototype) {
    throw new Error("The object already has a fc.toStringMethod assigned");
  }

  // @ts-expect-error Adding fc.toStringMethod to the prototype which is not part of T
  return class clsWithToStringMethod extends cls {
    [fc.toStringMethod]() {
      return cls.name + JSON.stringify(_.pick(this, ...props));
    }
  };
}

/**
 * Creates an arbitrary that returns a random string of decimal digits.
 *
 * @param constraints Constraints that are applied to the
 * array of generated digits.
 * @returns The new arbitrary.
 */
export function makeDigitsArbitrary(
  constraints: fc.ArrayConstraints = {},
): fc.Arbitrary<string> {
  return fc
    .array(fc.constantFrom(..."0123456789"), constraints)
    .map((arr) => arr.join(""));
}

/**
 * Parameters for roundtrip tests.
 */
export interface RoundtripTestsParams<A, B> {
  /** Generates instances of the first type to test. */
  a: fc.Arbitrary<A>;
  /** Generates instances of the second type to test. */
  b: fc.Arbitrary<B>;
  /** Maps instances from the first type to the second type. */
  a2b: (a: A) => B;
  /** Maps instances from the second type to the first type. */
  b2a: (b: B) => A;
  /**
   * A function that accepts each object of the first type and returns `true`
   * if they pass the test, otherwise `false`.
   * Defaults to [_.isEqual]{@link https://lodash.com/docs#isEqual}.
   */
  equalsA?: (actual: A, expected: A) => boolean;
  /**
   * A function that accepts each object of the second type and returns `true`
   * if they pass the test, otherwise `false`.
   * Defaults to [_.isEqual]{@link https://lodash.com/docs#isEqual}.
   */
  equalsB?: (actual: B, expected: B) => boolean;
  /** Test parameters that are used to reproduce failures. */
  repro?: Pick<fc.Parameters, "seed" | "path" | "endOnFailure">;
}

/**
 * Validates that a pair of functions that are inverses of each other by testing
 * whether the value is preserved after a roundtrip.
 *
 * @param params The parameters of the test.
 * @returns The new test suite.
 */
export function makeRoundtripTests<A, B>(
  params: RoundtripTestsParams<A, B>,
): ReturnType<typeof describe> {
  const {
    a: arbA,
    b: arbB,
    a2b,
    b2a,
    equalsA = (actual: A, expected: A): boolean => _.isEqual(actual, expected),
    equalsB = (actual: B, expected: B): boolean => _.isEqual(actual, expected),
    repro: reproOpts = {},
  } = params;

  return describe(`inverse functions (a2b: ${a2b.name}, b2a: ${b2a.name})`, () => {
    it("identity round trip (a -> b -> a)", () => {
      fc.assert(
        fc.property(arbA, fc.context(), (a, ctx) => {
          const b = a2b(a);
          ctx.log(`b=${fc.stringify(b)}`);

          const newA = b2a(b);
          ctx.log(`newA=${fc.stringify(newA)}`);

          expect(equalsA(newA, a)).to.be.true;
        }),
        reproOpts,
      );
    });
    it("identity round trip (b -> a -> b)", () => {
      fc.assert(
        fc.property(arbB, fc.context(), (b, ctx) => {
          const a = b2a(b);
          ctx.log(`a=${fc.stringify(a)}`);

          const newB = a2b(a);
          ctx.log(`newB=${fc.stringify(newB)}`);

          expect(equalsB(newB, b)).to.be.true;
        }),
        reproOpts,
      );
    });
  });
}
