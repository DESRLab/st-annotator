import { describe, expect, it } from "vitest";

import { blankAxesError, SpatialBoundsOrder } from "../../../app/models/types";

const min = (x = "", y = "", z = "") => ({ x, y, z });
const max = (x = "", y = "", z = "") => ({ x, y, z });

describe("SpatialBoundsOrder", () => {
  it("accepts an ordered box and one whose sides touch", () => {
    expect(
      SpatialBoundsOrder.validate(min("-1", "-2", "-3"), max("1", "2", "3")),
    ).toBeNull();
    expect(SpatialBoundsOrder.validate(min("2"), max("2"))).toBeNull();
  });

  it("reports the first inverted axis", () => {
    expect(SpatialBoundsOrder.validate(min("-1", "5"), max("1", "-5"))).toBe(
      "The minimum Y coordinate cannot be greater than the maximum Y coordinate.",
    );
  });

  it("treats an axis with a blank side as unbounded", () => {
    // A blank side stores no bound, so there is nothing for it to be inverted against.
    expect(SpatialBoundsOrder.validate(min("50"), max())).toBeNull();
    expect(
      SpatialBoundsOrder.validate(min("50", "", "9"), max("", "10", "100")),
    ).toBeNull();
  });

  it("compares signed fractional values numerically", () => {
    expect(
      SpatialBoundsOrder.validate(min("-0.5"), max("-0.500001")),
    ).toContain("minimum X coordinate");
  });

  it("ignores surrounding whitespace", () => {
    expect(SpatialBoundsOrder.validate(min(" 5 "), max("  1 "))).toContain(
      "minimum X coordinate",
    );
  });
});

const vector = (x = "", y = "", z = "") => ({ x, y, z });

describe("blankAxesError", () => {
  it("says nothing when every axis carries a value", () => {
    expect(
      blankAxesError("Scale", vector("1", "2", "3"), "point cloud"),
    ).toBeNull();
  });

  it("names a single blank axis", () => {
    expect(blankAxesError("Scale", vector("1", "", "3"), "point cloud")).toBe(
      "Scale needs a value for Y; every component is required, so leave the box unticked to keep each point cloud's current scale.",
    );
  });

  it("names every blank axis", () => {
    expect(blankAxesError("Translation", vector("1.5"), "point cloud")).toBe(
      "Translation needs a value for Y and Z; every component is required, so leave the box unticked to keep each point cloud's current translation.",
    );
  });

  it("treats a zero as a value, not a blank", () => {
    // "0" is a legal transform component; reading it as empty would refuse a valid edit.
    expect(
      blankAxesError("Rotation", vector("0", "0", "0"), "ground mesh"),
    ).toBeNull();
  });
});
