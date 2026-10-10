import { expect } from "chai";
import { restore, stub } from "sinon";
import type { SinonStub } from "sinon";
import * as THREE from "three";
import { describe, it, beforeAll, afterAll } from "vitest";

import { CoordinateFormat } from "../../../../../app/routes/editor/config";
import { PointBuffer } from "../../../../../app/routes/editor/points/data";

describe("test getPoint method from PointBuffer object in PointBuffer.ts", () => {
  let dataArray = new Float32Array([
    -10219.2900383, -1.8190283, -0.0221532, 0.99, 1.0009654, 1.0254391,
    100.299871, 182.00232323, -29.30921232,
  ]);
  it("should return the sliced data buffer", () => {
    const pointBuffer = new PointBuffer(dataArray, CoordinateFormat.XYZ, 3);
    let counter = 0;
    for (let i = 0; i < dataArray.length / 3; i++) {
      for (const value of pointBuffer.getPoint(i)) {
        expect(Number(value.toFixed(6))).to.be.equal(
          Number(dataArray[counter].toFixed(6)),
        );
        counter += 1;
      }
    }
  });
  it("should return empty chunck when NaN index is passed", () => {
    const pointBuffer = new PointBuffer(dataArray, CoordinateFormat.XYZ, 3);
    expect(pointBuffer.getPoint(NaN)).to.be.empty;
  });
  it("should return one chunck of float32 array when the number of channel is equal to length of the data points", () => {
    dataArray = new Float32Array([
      -10219.2900383, -1.8190283, -0.0221532, 0.9919212712,
    ]);
    const pointBuffer = new PointBuffer(dataArray, CoordinateFormat.XYZ, 4);
    expect(pointBuffer.getPoint(0).length).to.be.equal(dataArray.length);
    dataArray.forEach((v, i) => {
      expect(Number(pointBuffer.getPoint(0)[i].toFixed(5))).to.be.equal(
        Number(v.toFixed(5)),
      );
    });
  });
});
describe("test getPointCoords method from PointBuffer object in PointBuffer.ts", () => {
  const dataArray = new Float32Array([
    -10219.2900383, -1.8190283, -0.0221532, 0.99, 1.0009654, 1.0254391,
    100.299871, 182.00232323, -29.30921232,
  ]);
  let pointBuffer = new PointBuffer(dataArray, CoordinateFormat.XYZ, 3);
  let stubMethod: SinonStub<[pointIdx: number], Float32Array>;
  beforeAll(() => {
    stubMethod = stub(pointBuffer, "getPoint");
  });
  afterAll(() => {
    restore();
  });
  it("should return threejs vector of each chunck at any pointId", () => {
    for (const format of Object.values(CoordinateFormat)) {
      pointBuffer = new PointBuffer(dataArray, format, 3);
      stubMethod = stub(pointBuffer, "getPoint");
      stubMethod.withArgs(1).returns(new Float32Array([4.0, 6.0, 8.0]));
      expect(
        pointBuffer
          .getPointCoords(1)
          .equals(format.toThreeJSCoords(new THREE.Vector3(4, 6, 8))),
      ).to.be.equal(true);
    }
  });
  it("should return threejs vector of 0,0,0 when the getPoint Chunck returns null,null,null", () => {
    // @ts-expect-error - intentionally passing nulls, which the Float32Array coerces to zeros
    stubMethod.withArgs(1).returns(new Float32Array([null, null, null]));
    expect(
      pointBuffer.getPointCoords(1).equals(new THREE.Vector3(0, 0, 0)),
    ).to.be.equal(true);
  });
});
describe("test getCoords method from PointBuffer object in PointBuffer.ts", () => {
  const dataArray = new Float32Array([
    -10219.2900383, -1.8190283, -0.0221532, 0.99, 1.0009654, 1.0254391,
    100.299871, 182.00232323, -29.30921232,
  ]);
  const result = [
    new THREE.Vector3(dataArray[0], dataArray[1], dataArray[2]),
    new THREE.Vector3(dataArray[3], dataArray[4], dataArray[5]),
    new THREE.Vector3(dataArray[6], dataArray[7], dataArray[8]),
  ];
  const pointBuffer = new PointBuffer(dataArray, CoordinateFormat.XYZ, 3);
  beforeAll(() => {
    const stubMethod = stub(pointBuffer, "getPointCoords");
    result.forEach((v, i) => {
      stubMethod.withArgs(i).returns(v);
    });
  });
  afterAll(() => {
    restore();
  });
  it("should return an array of threejs vectors", () => {
    for (const value of pointBuffer.getCoords()) {
      expect(result.includes(value)).to.be.equal(true);
    }
  });
});
describe("test getChannel method from PointBuffer object in PointBuffer.ts", () => {
  const dataArray = new Float32Array([
    -10219.2900383, -1.8190283, -0.0221532, 0.99, 1.0009654, 1.0254391,
    100.299871, 182.00232323, -29.30921232,
  ]);
  const pointBuffer = new PointBuffer(dataArray, CoordinateFormat.XYZ, 3);
  it("should return first values of each channel chunk for channel index 0 and so on till 3", () => {
    for (let i = 0; i < dataArray.length / 3; i++) {
      let counter = i;
      for (const value of pointBuffer.getChannel(i)) {
        expect(Number(value.toFixed(6))).to.be.equal(
          Number(dataArray[counter].toFixed(6)),
        );
        counter += 3;
      }
    }
  });
});
describe("test conversion between geometry and point buffer", () => {
  const dataArray = new Float32Array([
    -10219.2900383, -1.8190283, -0.0221532, 0.99, 1.0009654, 1.0254391,
    100.299871, 182.00232323, -29.30921232,
  ]);
  const pointBuffer = new PointBuffer(dataArray, CoordinateFormat.XYZ, 3);
  it("should preserve the point coordinates throughout a round trip", () => {
    const geometry = new THREE.BufferGeometry();
    pointBuffer.updateGeometry(geometry, "position");

    const newBuffer = PointBuffer.fromBufferAttribute(
      geometry.getAttribute("position"),
      pointBuffer.format,
    );

    expect(pointBuffer.getCoords()).to.eql(newBuffer.getCoords());
  });
});
describe("test clone method from PointBuffer object in PointBuffer.ts", () => {
  const dataArray = new Float32Array([
    -10219.2900383, -1.8190283, -0.0221532, 0.99, 1.0009654, 1.0254391,
    100.299871, 182.00232323, -29.30921232,
  ]);
  let pointBuffer = new PointBuffer(dataArray, CoordinateFormat.XYZ, 3);
  let clonedBuffer = pointBuffer.clone();
  it("should return an instance of pointBuffer", () => {
    expect(clonedBuffer).to.be.an.instanceOf(PointBuffer);
    expect(clonedBuffer.format).to.be.equal(pointBuffer.format);
  });
  it("should preserve the same coordinate format as well", () => {
    for (const format of Object.values(CoordinateFormat)) {
      pointBuffer = new PointBuffer(dataArray, format, 3);
      clonedBuffer = pointBuffer.clone();
      expect(clonedBuffer.format).to.be.equal(pointBuffer.format);
    }
  });
});
