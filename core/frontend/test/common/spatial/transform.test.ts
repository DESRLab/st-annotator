import { expect } from "chai";
import { describe, it } from "vitest";

import { Transform } from "../../../lib/common/lib/spatial/transform";

describe("Transform", () => {
  it("validates and freezes transform value objects", () => {
    const values = {
      translation: { x: "1", y: "2", z: "3" },
      rotation: { x: "0", y: "0", z: "0" },
      scale: { x: "1", y: "1", z: "1" },
    };
    const first = Transform.fromJSON(values);
    const same = Transform.fromJSON(values);
    const different = Transform.fromJSON({
      ...values,
      translation: { ...values.translation, x: "4" },
    });

    expect(Object.isFrozen(first)).to.be.true;
    expect(first.equals(same)).to.be.true;
    expect(first.equals(different)).to.be.false;
    expect(() => Transform.fromJSON({ ...values, scale: null })).to.throw();
  });
});
