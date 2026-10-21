import { describe, expect, it } from "vitest";

import { formatClassName } from "../../../app/plugins/label-data";

describe("class names in label data", () => {
  it("resolves the name rather than displaying the stored ID", () => {
    expect(formatClassName(42, { 42: "Chair" })).toBe("Chair");
  });

  it("leaves an unclassified label empty and preserves unresolved references", () => {
    expect(formatClassName(null, { 42: "Chair" })).toBe("-");
    expect(formatClassName(43, { 42: "Chair" })).toBe("43");
  });
});
