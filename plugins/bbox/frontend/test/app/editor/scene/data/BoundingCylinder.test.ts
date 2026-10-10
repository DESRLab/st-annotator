import { describe } from "vitest";

import { BoundingCylinderBuilder } from "../../../../../app/editor/scene/data/views";

import {
  makeCenterTest,
  makeConstructorTest,
  makeFacesTest,
  makeForwardIndicatorFacesTest,
} from "./BoundingBox.test";

describe("BoundingCylinder", () => {
  const testBuilder = new BoundingCylinderBuilder();

  makeConstructorTest(testBuilder);
  makeCenterTest(testBuilder);
  makeFacesTest(testBuilder);
  makeForwardIndicatorFacesTest(testBuilder);
});
