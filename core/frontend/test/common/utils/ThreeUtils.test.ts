import { expect } from "chai";
import fc from "fast-check";
import type { Arbitrary } from "fast-check";
import _ from "lodash";
import * as THREE from "three";
import { describe, it } from "vitest";

import {
  checkArray,
  checkValue,
  floatApprox,
  makeColorArbitrary,
  makeVector3Arbitrary,
  tensorApprox,
} from "../../../lib/common/lib/testing";
import { ThreeUtils } from "../../../lib/common/lib/utils";

const makeMatArraysArbitrary: () => Arbitrary<
  readonly (readonly number[])[]
> = () =>
  fc.array(
    fc.array(fc.option(fc.double(), { nil: NaN, freq: 9 }), {
      minLength: 9,
      maxLength: 9,
    }),
    { minLength: 1 },
  );

const matrix3sFromArrays: (
  arrays: readonly (readonly number[])[],
) => readonly THREE.Matrix3[] = (arrays) =>
  arrays.map((arr) => new THREE.Matrix3().fromArray(arr));

describe("ThreeUtils.sumMatrix3()", () => {
  it("rejects non-numeric elements in the first and additional matrices", () => {
    for (const invalid of [null, undefined]) {
      for (const index of [0, 1]) {
        const matrices = [new THREE.Matrix3(), new THREE.Matrix3()];
        // @ts-expect-error - exercise the numeric validation boundary.
        matrices[index].elements[1] = invalid;
        expect(() => ThreeUtils.sumMatrix3(matrices[0], matrices[1])).to.throw(
          "The input is not numeric",
        );
      }
    }
  });
  it("should return same result as _.unzip()", () => {
    fc.assert(
      fc.property(makeMatArraysArbitrary(), fc.context(), (arrays, ctx) => {
        const [mat, ...mats] = matrix3sFromArrays(arrays);
        const result = ThreeUtils.sumMatrix3(mat, ...mats);

        // _.unzipWith(arrays, _.add) incorrectly produces 0 if the final value is NaN
        const [expectedResult] = matrix3sFromArrays([
          _.unzip(arrays).map((arr) => _.sum(arr)),
        ]);

        return checkValue(result, expectedResult, ctx, tensorApprox);
      }),
    );
  });
});

describe("ThreeUtils.setFromNormals()", () => {
  it("should create new buffer with same values as input normals", () => {
    fc.assert(
      fc.property(
        fc.array(makeVector3Arbitrary()),
        fc.context(),
        (vecs, ctx) => {
          const geometry = ThreeUtils.setFromNormals(
            new THREE.BufferGeometry(),
            vecs,
          );
          const buffer = geometry.getAttribute("normal");

          expect(buffer.count).to.equal(vecs.length, "incorrect buffer size");
          expect(buffer.itemSize).to.equal(3, "incorrect item size");

          expect(
            checkArray(
              vecs.flatMap((v, i) => [
                buffer.getX(i),
                buffer.getY(i),
                buffer.getZ(i),
              ]),
              vecs.flatMap((v) => v.toArray()),
              ctx,
              floatApprox,
            ),
            "incorrect buffer values",
          );

          ThreeUtils.setFromNormals(geometry, vecs);
          const newBuffer = geometry.getAttribute("normal");

          expect(newBuffer).to.not.equal(buffer, "failed to create new buffer");
        },
      ),
    );
  });
});

describe("ThreeUtils.setFromColors()", () => {
  it("should create new buffer with same values as input colors", () => {
    fc.assert(
      fc.property(
        fc.array(makeColorArbitrary()),
        fc.context(),
        (colors, ctx) => {
          const geometry = ThreeUtils.setFromColors(
            new THREE.BufferGeometry(),
            colors,
          );
          const buffer = geometry.getAttribute("color");

          expect(buffer.count).to.equal(colors.length, "incorrect buffer size");
          expect(buffer.itemSize).to.equal(3, "incorrect item size");

          expect(
            checkArray(
              colors.flatMap((c, i) => [
                buffer.getX(i),
                buffer.getY(i),
                buffer.getZ(i),
              ]),
              colors.flatMap((c) => c.toArray()),
              ctx,
              floatApprox,
            ),
            "incorrect buffer values",
          );

          ThreeUtils.setFromColors(geometry, colors);
          const newBuffer = geometry.getAttribute("color");

          expect(newBuffer).to.not.equal(buffer, "failed to create new buffer");
        },
      ),
    );
  });
});

describe("size and opacity normalization", () => {
  it("handles NaN, signed zero, infinities, and range boundaries", () => {
    for (const [input, size, opacity] of [
      [NaN, 0, 0],
      [-Infinity, Infinity, 0],
      [-2, 2, 0],
      [-Number.MIN_VALUE, Number.MIN_VALUE, 0],
      [-0, 0, 0],
      [0, 0, 0],
      [Number.MIN_VALUE, Number.MIN_VALUE, Number.MIN_VALUE],
      [0.25, 0.25, 0.25],
      [1, 1, 1],
      [1.0001, 1.0001, 1],
      [2, 2, 1],
      [Infinity, Infinity, 1],
    ]) {
      expect(ThreeUtils.checkSize(input)).to.equal(size);
      expect(ThreeUtils.checkOpacity(input)).to.equal(opacity);
    }
  });
});
