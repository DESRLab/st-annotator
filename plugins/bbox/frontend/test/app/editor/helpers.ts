import fc from "fast-check";
import type { Arbitrary } from "fast-check";

/**
 * Creates an arbitrary level descriptor payload.
 *
 * @returns The new arbitrary.
 */
export function makeLevelDescriptorArbitrary(): Arbitrary<{
  title: string;
  value: number;
  description: string;
}> {
  return fc.record({
    title: fc.string(),
    value: fc.integer(),
    description: fc.string(),
  });
}
