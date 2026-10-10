import { expect } from "chai";
import { describe, it } from "vitest";

import {
  TypeUtils,
  getPropOrDefault,
  hasProp,
  isNotNull,
  mergeObjects,
} from "../../../lib/common/lib/utils";

describe("TypeUtils public exports", () => {
  it("exports TypeUtils runtime helpers directly from the utils barrel", () => {
    expect(isNotNull).to.equal(TypeUtils.isNotNull);
    expect(hasProp).to.equal(TypeUtils.hasProp);
    expect(getPropOrDefault).to.equal(TypeUtils.getPropOrDefault);
    expect(mergeObjects).to.equal(TypeUtils.mergeObjects);
  });
});
