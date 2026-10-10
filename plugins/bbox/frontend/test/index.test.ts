import { expect } from "chai";
import { describe, it } from "vitest";

import {
  BBoxClassSelectionState,
  LabelBoxState,
  LabelTrackState,
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

describe("bbox frontend package", () => {
  it("parses bbox label schemas from backend payloads", () => {
    const selection = BBoxClassSelectionState.SCHEMA.parse({
      id: 1,
      name: "bbox",
      description: "",
      groups: [group],
      objclasses: [{ ...objectClass, default_size: { x: 1, y: 2, z: 3 } }],
      distinctive_lv: 1,
      occlusion_lv: 2,
      extra: "ignored",
    });
    const track = LabelTrackState.SCHEMA.parse({
      id: "t1",
      is_black: false,
      gt_class_id: objectClass.id,
      extra: "ignored",
    });
    const label = LabelBoxState.SCHEMA.parse({
      id: "b1",
      entity_id: "t1",
      timestamp: "0",
      type: "cuboid",
      center: { x: 1, y: 2, z: 3 },
      angle: 0.25,
      size: { x: 4, y: 5, z: 6 },
      distinctive_lv: 0,
      occlusion_lv: null,
      perceived_class_id: objectClass.id,
      extra: "ignored",
    });

    expect(selection.distinctive_lv.value).to.equal(1);
    expect(selection.occlusion_lv.value).to.equal(2);
    expect(selection.objclasses[0].default_size.x).to.equal("1");
    expect(track.gt_class_id).to.equal(objectClass.id);
    expect(label.perceived_class_id).to.equal(objectClass.id);
    expect(label.center.x).to.equal("1");
    expect(label.angle).to.equal(0.25);
    expect(label.distinctive_lv.value).to.equal(0);
    expect(label.occlusion_lv.value).to.equal(null);
  });
});
