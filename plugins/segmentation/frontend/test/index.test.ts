import { expect } from "chai";
import { describe, it } from "vitest";

import {
  LabelSelectionState,
  SegmentationClassSelectionState,
} from "../models";

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
describe("segmentation frontend package", () => {
  it("parses segmentation label schemas from backend payloads", () => {
    const selection = SegmentationClassSelectionState.SCHEMA.parse({
      id: 1,
      name: "segmentation",
      description: "",
      groups: [group],
      objclasses: [objectClass],
      distinctive_lv: 1,
      occlusion_lv: null,
      extra: "ignored",
    });
    const label = LabelSelectionState.SCHEMA.parse({
      id: "s1",
      entity_id: null,
      timestamp: "0",
      points: [{ x: 0, y: 1, z: 2 }],
      quality_rank: null,
      distinctive_lv: 0,
      occlusion_lv: 2,
      perceived_class_id: objectClass.id,
      extra: "ignored",
    });

    expect(selection.distinctive_lv.value).to.equal(1);
    expect(selection.occlusion_lv.value).to.equal(null);
    expect(label.points[0]).to.have.property("x", "0");
    expect(label.perceived_class_id).to.equal(objectClass.id);
    expect(label.distinctive_lv.value).to.equal(0);
    expect(label.occlusion_lv.value).to.equal(2);
  });
});
