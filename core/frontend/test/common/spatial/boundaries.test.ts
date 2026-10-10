import { describe, expect, it } from "vitest";

import { PartialSTBounds, STBounds } from "../../../lib/common/lib/spatial";

const partialValues = {
  min_coords: { x: "1", y: null, z: "3" },
  max_coords: { x: "4", y: null, z: "6" },
  min_timestamp: "2026-01-01T00:00:00.000Z",
  max_timestamp: null,
};

describe("ST bounds value objects", () => {
  it("validates and freezes partial bounds", () => {
    const first = PartialSTBounds.fromJSON(partialValues);
    const same = PartialSTBounds.fromJSON(partialValues);
    const different = PartialSTBounds.fromJSON({
      ...partialValues,
      max_coords: { ...partialValues.max_coords, x: "5" },
    });

    expect(Object.isFrozen(first)).toBe(true);
    expect(first.equals(same)).toBe(true);
    expect(first.equals(different)).toBe(false);
    expect(() =>
      PartialSTBounds.fromJSON({ ...partialValues, min_coords: null }),
    ).toThrow();
  });

  it("validates and freezes fully bounded values", () => {
    const values = {
      min_coords: { x: "1", y: "2", z: "3" },
      max_coords: { x: "4", y: "5", z: "6" },
      min_timestamp: "2026-01-01T00:00:00.000Z",
      max_timestamp: "2026-01-02T00:00:00.000Z",
    };
    const first = STBounds.fromJSON(values);

    expect(Object.isFrozen(first)).toBe(true);
    expect(first.equals(STBounds.fromJSON(values))).toBe(true);
    expect(() =>
      STBounds.fromJSON({ ...values, max_timestamp: null }),
    ).toThrow();
  });
});
