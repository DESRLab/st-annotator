import { expect } from "chai";
import fc from "fast-check";
import * as THREE from "three";
import { describe, it } from "vitest";

import {
  CoordinateFormat,
  Colormap,
  PointBuffer,
  ApplyColormap,
  NormalizedValueFunc,
} from "sta/app/editor";
import { makePointBufferArbitrary } from "sta/app/editor/testing";
import {
  checkValue,
  makeVector3Arbitrary,
  tensorApprox,
} from "sta/common/testing";

import { PointCloud } from "../../../../../app/editor";

const makePointSizeArbitrary = () =>
  fc.double({
    min: 0,
    max: 2,
    noNaN: true,
    noDefaultInfinity: true,
  });

const makePcdParamsArbitrary = () =>
  fc.record({
    buffer: makePointBufferArbitrary(),
    channelNames: fc.array(fc.string()),
    position: makeVector3Arbitrary(),
    pointSize: makePointSizeArbitrary(),
  });

function createBlender(): ApplyColormap {
  return new ApplyColormap(
    new Colormap("", [new THREE.Color("blue"), new THREE.Color("yellow")]),
    new NormalizedValueFunc(0, -100, 100),
  );
}

describe("#clone()", () => {
  it("should return an instance that is independent of the original", () => {
    fc.assert(
      fc.property(
        makePcdParamsArbitrary(),
        makePcdParamsArbitrary(),
        fc.context(),
        (params0, params1, ctx) => {
          const pcd0 = new PointCloud(
            params0.buffer,
            params0.channelNames,
            params0.position,
            createBlender(),
            params0.pointSize,
          );
          const pcd1 = pcd0.clone();

          pcd1.position = params1.position;
          pcd1.blender = createBlender();
          pcd1.pointSize = params1.pointSize;

          expect(
            checkValue(pcd0.position, pcd1.position, ctx, (a, b) =>
              tensorApprox(a, b),
            ),
          ).to.equal(
            tensorApprox(params0.position, params1.position),
            "Incorrect value of position",
          );

          expect(checkValue(pcd0.pointSize, pcd1.pointSize, ctx)).to.equal(
            params0.pointSize === params1.pointSize,
            "Incorrect point cloud size",
          );

          expect(pcd0.blender).to.not.equal(pcd1.blender);
        },
      ),
    );
  });
});

describe("rendering colors", () => {
  it("updates the live geometry color attribute when the blender changes", () => {
    const buffer = new PointBuffer(
      new Float32Array([0, 0, 0, 1, 1, 1]),
      CoordinateFormat.XYZ,
      3,
    );
    const redBlender = {
      getColors: () => [new THREE.Color("red"), new THREE.Color("red")],
    } as any;
    const blueBlender = {
      getColors: () => [new THREE.Color("blue"), new THREE.Color("blue")],
    } as any;
    const cloud = new PointCloud(
      buffer,
      ["X", "Y", "Z"],
      new THREE.Vector3(),
      redBlender,
      1,
    );
    const points = cloud.asObject3D() as THREE.Points<THREE.BufferGeometry>;
    const colors = points.geometry.getAttribute(
      "color",
    ) as THREE.BufferAttribute;
    const initialColors = [...colors.array];
    const initialVersion = colors.version;

    cloud.blender = blueBlender;

    expect([...colors.array]).not.to.deep.equal(initialColors);
    expect(colors.version).to.equal(initialVersion + 1);
  });
});

const helperInitializer: (
  data: number[],
  numChannels: number,
) => {
  pointBuffer: PointBuffer;
  colorBlenders: ApplyColormap[];
} = (data, numChannels) => {
  const dataArray = new Float32Array(data);
  const colors = [
    new THREE.Color("blue"),
    new THREE.Color("yellow"),
    new THREE.Color("pink"),
    new THREE.Color("red"),
    new THREE.Color("green"),
  ];
  const colormap = new Colormap("", colors);
  const buffer = new PointBuffer(dataArray, CoordinateFormat.XYZ, numChannels);
  const colorBlenders = [];
  for (let i = 0; i < dataArray.length / numChannels; i++) {
    const normFunc = new NormalizedValueFunc(i, -100, +100);
    const colormapBlender = new ApplyColormap(colormap, normFunc);
    colorBlenders.push(colormapBlender);
  }
  return { pointBuffer: buffer, colorBlenders: colorBlenders };
};

describe("test raycast method from PointCloud object in PointCloud.tsx", () => {
  const { pointBuffer, colorBlenders } = helperInitializer(
    [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9],
    3,
  );
  const pointCloud = new PointCloud(
    pointBuffer,
    [],
    new THREE.Vector3(),
    colorBlenders[1],
    1,
  );
  const rays = pointCloud.raycast(
    new THREE.Raycaster(new THREE.Vector3(1, 0, 10)),
  );
  it("should return 3 intersections of same threejs point instance at different distances", () => {
    expect(rays.length).to.be.equal(3);
    for (const ray of rays) {
      expect(ray.object).to.be.an.instanceOf(THREE.Points);
    }
  });
});
