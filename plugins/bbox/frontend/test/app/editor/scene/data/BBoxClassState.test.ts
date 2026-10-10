import { expect } from "chai";
import { describe, it } from "vitest";

import { BBoxClassState } from "../../../../../models";

describe("BBoxClassState", () => {
  it("should accept backend object class default_size_x/y/z fields", () => {
    const state = BBoxClassState.SCHEMA.parse({
      id: 1,
      name: "Car",
      color_rgb: 0xff0000,
      default_size_x: "4.0",
      default_size_y: "1.8",
      default_size_z: "1.6",
    });

    expect(state.default_size.x).to.equal("4.0");
    expect(state.default_size.y).to.equal("1.8");
    expect(state.default_size.z).to.equal("1.6");
  });

  it("should default missing backend object class sizes to null components", () => {
    const state = BBoxClassState.SCHEMA.parse({
      id: 1,
      name: "Unknown",
      color_rgb: 0xffffff,
    });

    expect(state.default_size.x).to.equal(null);
    expect(state.default_size.y).to.equal(null);
    expect(state.default_size.z).to.equal(null);
  });
});
