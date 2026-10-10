import { expect } from "chai";
import { describe, it } from "vitest";

import { CoordinateFormat } from "../../../../../app/routes/editor/config";
import {
  NormalizedValueFunc,
  PointBuffer,
} from "../../../../../app/routes/editor/points/data";

describe("test getValues method from NormalizedValueFunc object in ValueFunc.tsx", () => {
  const dataArray = new Float32Array([
    -10219.2900383, -1.8190283, -0.0221532, 0.99, 1.0009654, 1.0254391,
    100.299871, 182.00232323, -29.30921232,
  ]);
  const pointBuffer = new PointBuffer(dataArray, CoordinateFormat.XYZ, 3);
  const normalizedChannel = [
    [0, 0.50495, 1.0],
    [0.4909048585, 0.494995173, 1.0],
    [0.499889234, 0.5051271955, 0.3534539384],
  ];
  it("should return normalized value for each of given channel ", () => {
    for (let i = 0; i < dataArray.length / 3; i++) {
      const normalizedValueFunc = new NormalizedValueFunc(i, -100, +100);
      const result = normalizedChannel[i];
      normalizedValueFunc.getValues(pointBuffer).forEach((v, j) => {
        expect(Number(v.toFixed(8))).to.be.closeTo(
          Number(result[j].toFixed(8)),
          0.1,
        );
      });
    }
  });
  it("should return normalized values for channel 0 if channel null is passed", () => {
    const result = normalizedChannel[0];
    // @ts-expect-error - intentionally passing a null channel to test the fallback
    const normalizedValueFunc = new NormalizedValueFunc(null, -100, +100);
    normalizedValueFunc.getValues(pointBuffer).forEach((v, i) => {
      expect(Number(v.toFixed(8))).to.be.closeTo(
        Number(result[i].toFixed(8)),
        0.1,
      );
    });
  });
  it("should return array of NaN when positive and negative infinity are passed as vmin and vmax", () => {
    const normalizedValueFunc = new NormalizedValueFunc(
      0,
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    );
    for (const value of normalizedValueFunc.getValues(pointBuffer)) {
      expect(value).to.be.NaN;
    }
  });
  it("should throw an error when null pointBufer is passed", () => {
    const normalizedValueFunc = new NormalizedValueFunc(0, -100, +100);
    // @ts-expect-error - intentionally passing null to test the error path
    expect(() => {
      normalizedValueFunc.getValues(null);
    }).throws("Cannot read properties of null (reading 'getChannel')");
  });
  it("should return 0/1/NaN when min and max are zero passed", () => {
    const [channel, vmin, vmax] = [0, 0, 0];
    const normalizedValueFunc = new NormalizedValueFunc(channel, vmin, vmax);

    normalizedValueFunc.getValues(pointBuffer).forEach((outputValue, i) => {
      const inputValue = pointBuffer.getPoint(i)[channel];
      if (inputValue < vmin) {
        expect(outputValue).to.equal(0);
      } else if (inputValue > vmax) {
        expect(outputValue).to.equal(1);
      } else {
        expect(outputValue).to.be.NaN;
      }
    });
  });
  it("should return 0/1/NaN when same min and max are passed", () => {
    const [channel, vmin, vmax] = [0, 4, 4];
    const normalizedValueFunc = new NormalizedValueFunc(channel, vmin, vmax);

    normalizedValueFunc.getValues(pointBuffer).forEach((outputValue, i) => {
      const inputValue = pointBuffer.getPoint(i)[channel];
      if (inputValue < vmin) {
        expect(outputValue).to.equal(0);
      } else if (inputValue > vmax) {
        expect(outputValue).to.equal(1);
      } else {
        expect(outputValue).to.be.NaN;
      }
    });
  });
});
describe("test fromStdScore method from NormalizedValueFunc object in ValueFunc.tsx", () => {
  const dataArray = new Float32Array([
    -10219.2900383, -1.8190283, -0.0221532, 0.99, 1.0009654, 1.0254391,
    100.299871, 182.00232323, -29.30921232,
  ]);
  const pointBuffer = new PointBuffer(dataArray, CoordinateFormat.XYZ, 3);
  it("should return normalized value for each of given channel based on their min max std scores", () => {
    const minScore = NormalizedValueFunc.fromStdScore(-1);
    const maxScore = NormalizedValueFunc.fromStdScore(1);
    const normalizedChannel = [
      [0, 0.8484129022, 0.8586690851],
      [0.1382803731, 0.1546762108, 1],
      [0.8347619107, 0.8720176424, 0],
    ];
    for (let i = 0; i < dataArray.length / 3; i++) {
      const normalizedValueFunc = new NormalizedValueFunc(
        i,
        minScore,
        maxScore,
      );
      const result = normalizedChannel[i];
      normalizedValueFunc.getValues(pointBuffer).forEach((v, j) => {
        expect(Number(v.toFixed(10))).to.be.closeTo(
          Number(result[j].toFixed(10)),
          0.1,
        );
      });
    }
  });
});
