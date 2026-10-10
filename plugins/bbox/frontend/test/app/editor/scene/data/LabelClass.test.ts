import { expect } from "chai";
import fc from "fast-check";
import * as THREE from "three";
import { describe, it } from "vitest";

import { makeEditorConfigArbitrary } from "sta/app/editor/testing";
import { OptionalVector3, ThreeUtils } from "sta/common";
import {
  checkValue,
  makeColorArbitrary,
  makeOptionalVector3Arbitrary,
} from "sta/common/testing";

import { LabelClass } from "../../../../../app/editor/scene/data/LabelClass";

const MIN_ABS = Math.sqrt(ThreeUtils.EPSILON);
const MAX_ABS = 1 / MIN_ABS;

const makeSizeComponentArbitrary = () =>
  fc.double({ min: 0, max: MAX_ABS, noNaN: true });

const makeDefaultSizeArbitrary = () =>
  makeOptionalVector3Arbitrary(makeSizeComponentArbitrary);

const makeLabelClassParamsArbitrary = () =>
  fc.record({
    config: makeEditorConfigArbitrary(),
    labels: fc.constant(null), // Placeholder
    id: fc.integer(),
    name: fc.string(),
    boxColor: makeColorArbitrary(),
    defaultSizeDatabase: makeDefaultSizeArbitrary(),
  });

describe("LabelClass", () => {
  describe("#constructor()", () => {
    it("should set properties according to passed arguments", () => {
      fc.assert(
        fc.property(
          makeLabelClassParamsArbitrary(),
          fc.context(),
          (params, ctx) => {
            const labelClass = new LabelClass(params);

            expect(
              checkValue(labelClass.name, params.name, ctx),
              "Incorrect value of name",
            ).to.be.true;

            expect(
              checkValue(
                labelClass.boxColor.getHex(),
                params.boxColor.getHex(),
                ctx,
              ),
              "Incorrect value of boxColor",
            ).to.be.true;

            expect(
              checkValue(
                labelClass.defaultSizeDatabase,
                params.defaultSizeDatabase,
                ctx,
                (a, b) => a.equals(b),
              ),
              "Incorrect value of defaultSizeDatabase",
            ).to.be.true;
          },
        ),
      );
    });
  });
});

describe("property changes", () => {
  it("emits an event for each changed editable property", () => {
    const params = fc.sample(makeLabelClassParamsArbitrary(), 1)[0];
    const labelClass = new LabelClass(params);
    const changes: string[] = [];
    labelClass.addEventListener("change", (event) =>
      changes.push(event.propertyKey),
    );

    labelClass.name = `${params.name}-updated`;
    labelClass.boxColor = new THREE.Color(0x123456);
    labelClass.defaultSizeDatabase = new OptionalVector3();

    expect(changes).to.eql(["name", "boxColor", "defaultSizeDatabase"]);
  });
});
