import { expect } from "chai";
import { describe, it } from "vitest";

import { LabelVectorState, VectorClassSelectionState } from "../models";

const objectClass = {
  id: 1,
  name: "car",
  description: "",
  color_rgb: 0xff0000,
  is_deleted: false,
};

const group = {
  id: 1,
  name: "labels",
  description: "",
};

// Placeholder test just to make the command pass
describe("vector frontend package", () => {
  it("parses vector label schemas from backend payloads", () => {
    const selection = VectorClassSelectionState.SCHEMA.parse({
      id: 1,
      name: "vector",
      description: "",
      groups: [group],
      objclasses: [objectClass],
      extra: "ignored",
    });
    const label = LabelVectorState.SCHEMA.parse({
      id: "v1",
      timestamp: "0",
      vertices: [{ x: 0, y: 1, z: 2 }],
      gt_class_id: objectClass.id,
      type: "Point",
      extra: "ignored",
    });

    expect(selection.objclasses[0].name).to.equal("car");
    // The receiver parses the selection supplied by core. The schema must
    // construct the vector subclass so its plugin contract remains intact.
    expect(selection.constructor.name).to.equal("VectorClassSelectionState");
    expect(label.gt_class_id).to.equal(objectClass.id);
    expect(label.vertices[0].x).to.equal("0");
    expect(label.type).to.equal("Point");
  });
});
