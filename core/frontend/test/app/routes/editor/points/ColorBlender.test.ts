import { expect } from "chai";
import * as THREE from "three";
import { describe, it } from "vitest";

import { Colormap } from "../../../../../app/routes/editor/colors";
import { CoordinateFormat } from "../../../../../app/routes/editor/config";
import {
  ApplyColormap,
  PointBuffer,
  NormalizedValueFunc,
  ComposeRGB,
} from "../../../../../app/routes/editor/points/data";

const makeColormap = () => {
  const colors = [
    new THREE.Color("blue"),
    new THREE.Color("yellow"),
    new THREE.Color("pink"),
    new THREE.Color("red"),
    new THREE.Color("green"),
  ];

  return new Colormap("", colors);
};

const helperInitializer: (
  data: number[],
  numChannels: number,
) => {
  normalizedValueFunc: NormalizedValueFunc[];
  buffer: PointBuffer;
} = (data, numChannels, composeRGB = false) => {
  const dataArray = new Float32Array(data);
  const pointBuffer = new PointBuffer(
    dataArray,
    CoordinateFormat.XYZ,
    numChannels,
  );
  const normalizedChannelsValueFuncList = [];
  for (let i = 0; i < dataArray.length / numChannels; i++) {
    const normalizedValueFunc = new NormalizedValueFunc(i, -100, +100);
    normalizedChannelsValueFuncList.push(normalizedValueFunc);
  }

  return {
    normalizedValueFunc: normalizedChannelsValueFuncList,
    buffer: pointBuffer,
  };
};
describe("test getColor method from ApplyColormap object in ColorBlender.tsx", () => {
  let data = [-10, -12, -2, -1, 0, 1, 7, 9, 3, 5, 20, -5];
  it("should return same color representation if the intesity of each buffer channel elements are similar", () => {
    const { normalizedValueFunc, buffer } = helperInitializer(data, 4);
    const colormap = makeColormap();

    const resultColor = new THREE.Color("pink");
    for (const normFunc of normalizedValueFunc) {
      const colorMapBlender = new ApplyColormap(colormap, normFunc);
      for (const color of colorMapBlender.getColors(buffer)) {
        expect(color.equals(resultColor)).to.be.equal(true);
      }
    }
  });
  it("should return different color respesntation if one of the buffer channel has different intensity than the others", () => {
    data = [100, 1, 2, 200, 1, 2, 300, 1, 2];
    const resultColorChannel0 = new THREE.Color("green");
    const resultColorChannel1 = new THREE.Color("pink");
    const { normalizedValueFunc, buffer } = helperInitializer(data, 3);
    const colormap = makeColormap();

    normalizedValueFunc.forEach((normFunc, i) => {
      const colorMapBlender = new ApplyColormap(colormap, normFunc);
      for (const color of colorMapBlender.getColors(buffer)) {
        if (i === 0) {
          expect(color.equals(resultColorChannel0)).to.be.equal(true);
        } else {
          expect(color.equals(resultColorChannel1)).to.be.equal(true);
        }
      }
    });
  });
});
describe("test getColor method from ComposeRGB object in ColorBlender.tsx", () => {
  const data = [-10, -12, -2, -1, 0, 1, 7, 9, 3, 5, 20, -5];
  const { normalizedValueFunc, buffer } = helperInitializer(data, 4);
  it("should assigns the normalized value of each channel element as rgb values", () => {
    const composeRGB = new ComposeRGB(
      normalizedValueFunc[0],
      normalizedValueFunc[1],
      normalizedValueFunc[2],
    );
    const resultRGBs = [
      [0.45, 0.5, 0.515],
      [0.44, 0.505, 0.525],
      [0.49, 0.535, 0.6],
    ];
    composeRGB.getColors(buffer).forEach((color, i) => {
      let counter = 0;
      expect(
        color.equals(
          new THREE.Color(
            resultRGBs[counter][i],
            resultRGBs[(counter += 1)][i],
            resultRGBs[(counter += 1)][i],
          ),
        ),
      ).to.be.equal(true);
    });
  });
  it("should throw error when passing null normalizedValueFunc object into the method ", () => {
    // @ts-expect-error - intentionally passing nulls to test the error path
    const composeRGB = new ComposeRGB(null, null, null);
    expect(() => {
      composeRGB.getColors(buffer);
    }).throws("Cannot read properties of null (reading 'getValues')");
  });
});
