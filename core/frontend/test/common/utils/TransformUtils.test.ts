import { expect } from "chai";
import fc from "fast-check";
import type { ContextValue } from "fast-check";
import _ from "lodash";
import * as THREE from "three";
import { describe, it } from "vitest";

import {
  checkValue,
  floatApprox,
  makeEulerArbitrary,
  makeVector3Arbitrary,
  tensorApprox,
} from "../../../lib/common/lib/testing";
import {
  MathUtils,
  ThreeUtils,
  TransformUtils,
} from "../../../lib/common/lib/utils";

const MIN_ABS = Math.sqrt(ThreeUtils.EPSILON);
const MAX_ABS = 1 / MIN_ABS;

const makeLocalComponentArbitrary = () =>
  fc.double({ min: -1, max: 1, noNaN: true });

const makeOtherComponentArbitrary = () =>
  fc.double({ min: -MAX_ABS, max: MAX_ABS, noNaN: true });

const makeScaleComponentArbitrary = () =>
  fc.oneof(
    fc.double({ min: -MAX_ABS, max: -MIN_ABS, noNaN: true }),
    fc.double({ min: MIN_ABS, max: MAX_ABS, noNaN: true }),
  );

const makePointerEndpointsArbitrary = () =>
  fc
    .record({
      origin: makeVector3Arbitrary(makeLocalComponentArbitrary),
      offsetRot: makeEulerArbitrary(makeOtherComponentArbitrary),
      offsetLen: makeLocalComponentArbitrary(),
    })
    .map(({ origin, offsetRot, offsetLen }) => {
      const offsetDir = new THREE.Vector3(1, 0, 0).applyEuler(offsetRot);
      const offset = offsetDir.multiplyScalar(offsetLen);

      return {
        initPointerLocalPos: origin.clone(),
        nextPointerLocalPos: origin.clone().add(offset),
      };
    });

const makeObj3D: (
  position: THREE.Vector3,
  rotation: THREE.Euler,
  scale: THREE.Vector3,
) => THREE.Object3D = (position, rotation, scale) => {
  const obj3D = new THREE.Object3D();

  obj3D.position.copy(position);
  obj3D.rotation.copy(rotation);
  obj3D.scale.copy(scale);
  obj3D.updateMatrixWorld();

  return obj3D;
};

const iterTransformFunc: (
  obj3D: THREE.Object3D,
  initPointerLocalPos: THREE.Vector3,
  nextPointerLocalPos: THREE.Vector3,
  transformFunc: (
    obj3D: THREE.Object3D,
    initPointerLocalPos: THREE.Vector3,
    nextPointerLocalPos: THREE.Vector3,
  ) => void,
  ctx?: ContextValue,
  iterCount?: number,
) => THREE.Vector3 = (
  obj3D,
  initPointerLocalPos,
  nextPointerLocalPos,
  transformFunc,
  ctx = undefined,
  iterCount = 1,
) => {
  let pointerLocalPos = nextPointerLocalPos;

  for (let i = 0; i < iterCount; i++) {
    const pointerWorldPos = obj3D.localToWorld(pointerLocalPos.clone());
    ctx?.log(`[i=${i}] pointerWorldPos=${pointerWorldPos}`);

    transformFunc(obj3D, initPointerLocalPos, pointerLocalPos);
    ctx?.log(`[i=${i}] position=${obj3D.position}`);
    ctx?.log(`[i=${i}] rotation=${obj3D.rotation}`);
    ctx?.log(`[i=${i}] scale=${obj3D.scale}`);

    pointerLocalPos = obj3D.worldToLocal(pointerWorldPos);
    ctx?.log(`[i=${i}] pointerLocalPos=${pointerLocalPos}`);
  }

  return pointerLocalPos;
};

const makeNoMutateArgsTest: (
  transformFunc: (
    obj3D: THREE.Object3D,
    initPointerLocalPos: THREE.Vector3,
    nextPointerLocalPos: THREE.Vector3,
  ) => void,
) => void = (transformFunc) =>
  it("should not mutate input pointer positions", () => {
    fc.assert(
      fc.property(
        makeVector3Arbitrary(makeOtherComponentArbitrary),
        makeEulerArbitrary(makeOtherComponentArbitrary),
        makeVector3Arbitrary(makeScaleComponentArbitrary),
        makePointerEndpointsArbitrary(),
        fc.context(),
        (
          position,
          rotation,
          scale,
          { initPointerLocalPos, nextPointerLocalPos },
          ctx,
        ) => {
          const obj3D = makeObj3D(position, rotation, scale);

          const initPointerLocalPos0 = initPointerLocalPos.clone();
          const nextPointerLocalPos0 = nextPointerLocalPos.clone();

          iterTransformFunc(
            obj3D,
            initPointerLocalPos,
            nextPointerLocalPos,
            transformFunc,
            ctx,
          );

          expect(
            checkValue(
              initPointerLocalPos,
              initPointerLocalPos0,
              ctx,
              tensorApprox,
            ),
            "initPointerLocalPos was mutated",
          ).to.be.true;

          expect(
            checkValue(
              nextPointerLocalPos,
              nextPointerLocalPos0,
              ctx,
              tensorApprox,
            ),
            "nextPointerLocalPos was mutated",
          ).to.be.true;
        },
      ),
    );
  });

const makeNoTranslateTest: (
  transformFunc: (
    obj3D: THREE.Object3D,
    initPointerLocalPos: THREE.Vector3,
    nextPointerLocalPos: THREE.Vector3,
  ) => void,
) => void = (transformFunc) =>
  it("should not translate object", () => {
    fc.assert(
      fc.property(
        makeVector3Arbitrary(makeOtherComponentArbitrary),
        makeEulerArbitrary(makeOtherComponentArbitrary),
        makeVector3Arbitrary(makeScaleComponentArbitrary),
        makePointerEndpointsArbitrary(),
        fc.context(),
        (
          position,
          rotation,
          scale,
          { initPointerLocalPos, nextPointerLocalPos },
          ctx,
        ) => {
          const obj3D = makeObj3D(position, rotation, scale);

          const initPosition = position.clone();

          iterTransformFunc(
            obj3D,
            initPointerLocalPos,
            nextPointerLocalPos,
            transformFunc,
            ctx,
          );

          return checkValue(obj3D.position, initPosition, ctx, tensorApprox);
        },
      ),
    );
  });

const makeNoRotateTest: (
  transformFunc: (
    obj3D: THREE.Object3D,
    initPointerLocalPos: THREE.Vector3,
    nextPointerLocalPos: THREE.Vector3,
  ) => void,
) => void = (transformFunc) =>
  it("should not rotate object", () => {
    fc.assert(
      fc.property(
        makeVector3Arbitrary(makeOtherComponentArbitrary),
        makeEulerArbitrary(makeOtherComponentArbitrary),
        makeVector3Arbitrary(makeScaleComponentArbitrary),
        makePointerEndpointsArbitrary(),
        fc.context(),
        (
          position,
          rotation,
          scale,
          { initPointerLocalPos, nextPointerLocalPos },
          ctx,
        ) => {
          const obj3D = makeObj3D(position, rotation, scale);

          const initRotation = rotation.clone();

          iterTransformFunc(
            obj3D,
            initPointerLocalPos,
            nextPointerLocalPos,
            transformFunc,
            ctx,
          );

          return checkValue(
            new THREE.Matrix4().makeRotationFromEuler(obj3D.rotation),
            new THREE.Matrix4().makeRotationFromEuler(initRotation),
            ctx,
            tensorApprox,
          );
        },
      ),
    );
  });

const makeNoScaleTest: (
  transformFunc: (
    obj3D: THREE.Object3D,
    initPointerLocalPos: THREE.Vector3,
    nextPointerLocalPos: THREE.Vector3,
  ) => void,
) => void = (transformFunc) =>
  it("should not scale object", () => {
    fc.assert(
      fc.property(
        makeVector3Arbitrary(makeOtherComponentArbitrary),
        makeEulerArbitrary(makeOtherComponentArbitrary),
        makeVector3Arbitrary(makeScaleComponentArbitrary),
        makePointerEndpointsArbitrary(),
        fc.context(),
        (
          position,
          rotation,
          scale,
          { initPointerLocalPos, nextPointerLocalPos },
          ctx,
        ) => {
          const obj3D = makeObj3D(position, rotation, scale);

          const initScale = scale.clone();

          iterTransformFunc(
            obj3D,
            initPointerLocalPos,
            nextPointerLocalPos,
            transformFunc,
            ctx,
          );

          return checkValue(obj3D.scale, initScale, ctx, tensorApprox);
        },
      ),
    );
  });

type ComputeResultAndEstimateErrorFunc<T> = (
  inputs: number[],
  getResult: (inputs: number[]) => T,
  getError: (result: T, resultWithEps: T) => T,
  initError: () => T,
  accumError: (prevError: T, newError: T) => T,
) => { result: T; error: T };

const computeResultAndEstimateError: <T>(
  inputs: number[],
  getResult: (inputs: number[]) => T,
  getError: (result: T, resultWithEps: T) => T,
  initError: () => T,
  accumError: (prevError: T, newError: T) => T,
) => { result: T; error: T } = (
  inputs,
  getResult,
  getError,
  initError,
  accumError,
) => {
  const result = getResult(inputs);

  let error = initError();
  for (let i = 0; i < inputs.length; i++) {
    const inputsBefore = inputs.slice(0, i);
    const inputWithEps = inputs[i] + ThreeUtils.EPSILON;
    const inputsAfter = inputs.slice(i + 1);
    const inputsWithEps = [...inputsBefore, inputWithEps, ...inputsAfter];

    const resultWithEps = getResult(inputsWithEps);
    const newError = getError(result, resultWithEps);

    error = accumError(error, newError);
  }

  return { result, error };
};

// @ts-expect-error - the generic implementation is narrowed to the number instantiation
const computeNumberAndEstimateError: ComputeResultAndEstimateErrorFunc<number> =
  computeResultAndEstimateError;

// @ts-expect-error - the generic implementation is narrowed to the Vector3 instantiation
const computeVector3AndEstimateError: ComputeResultAndEstimateErrorFunc<THREE.Vector3> =
  computeResultAndEstimateError;

const makePointerPosTest: (
  transformFunc: (
    obj3D: THREE.Object3D,
    initPointerLocalPos: THREE.Vector3,
    nextPointerLocalPos: THREE.Vector3,
  ) => void,
) => void = (transformFunc) =>
  it("should update recalculated value of nextPointerLocalPos to be positioned close to initPointerLocalPos", () => {
    fc.assert(
      fc.property(
        makeVector3Arbitrary(makeOtherComponentArbitrary),
        makeEulerArbitrary(makeOtherComponentArbitrary),
        makeVector3Arbitrary(makeScaleComponentArbitrary),
        makePointerEndpointsArbitrary(),
        fc.context(),
        (
          position,
          rotation,
          scale,
          { initPointerLocalPos, nextPointerLocalPos },
          ctx,
        ) => {
          const { result: pointerLocalPos, error: tol } =
            computeVector3AndEstimateError(
              [
                position.x,
                position.y,
                position.z,
                rotation.x,
                rotation.y,
                rotation.z,
                scale.x,
                scale.y,
                scale.z,
              ],
              ([posX, posY, posZ, rotX, rotY, rotZ, sclX, sclY, sclZ]) => {
                const pos = new THREE.Vector3(posX, posY, posZ);
                const rot = new THREE.Euler(rotX, rotY, rotZ, rotation.order);
                const scl = new THREE.Vector3(sclX, sclY, sclZ);

                const obj3D = makeObj3D(pos, rot, scl);

                const pointerGlobalPos = obj3D.localToWorld(
                  nextPointerLocalPos.clone(),
                );

                iterTransformFunc(
                  obj3D,
                  initPointerLocalPos,
                  nextPointerLocalPos,
                  transformFunc,
                );

                return obj3D.worldToLocal(pointerGlobalPos);
              },
              (result, resultWithEps) =>
                resultWithEps.toArray().some(Number.isNaN)
                  ? new THREE.Vector3().setScalar(Number.POSITIVE_INFINITY)
                  : ThreeUtils.mapVector3(
                      result.clone().sub(resultWithEps),
                      Math.abs,
                    ),
              () => new THREE.Vector3().setScalar(ThreeUtils.EPSILON),
              (prevError, newError) => prevError.clone().add(newError),
            );

          ctx?.log(`tol=${tol}`);

          return checkValue(
            pointerLocalPos,
            initPointerLocalPos,
            ctx,
            (actual, expected) =>
              floatApprox(actual.x, expected.x, {
                atol: tol.x,
              }) &&
              floatApprox(actual.y, expected.y, {
                atol: tol.y,
              }) &&
              floatApprox(actual.z, expected.z, { atol: tol.z }),
          );
        },
      ),
    );
  });

const makePointerDirTest: (
  transformFunc: (
    obj3D: THREE.Object3D,
    initPointerLocalPos: THREE.Vector3,
    nextPointerLocalPos: THREE.Vector3,
  ) => void,
) => void = (transformFunc) =>
  it("should update recalculated value of nextPointerLocalPos to be angled close to initPointerLocalPos", () => {
    fc.assert(
      fc.property(
        makeVector3Arbitrary(makeOtherComponentArbitrary),
        makeEulerArbitrary(makeOtherComponentArbitrary),
        makeVector3Arbitrary(makeScaleComponentArbitrary),
        makePointerEndpointsArbitrary(),
        fc.context(),
        (
          position,
          rotation,
          scale,
          { initPointerLocalPos, nextPointerLocalPos },
          ctx,
        ) => {
          // Otherwise, the angle is essentially undefined
          fc.pre(initPointerLocalPos.length() > ThreeUtils.EPSILON);
          fc.pre(nextPointerLocalPos.length() > ThreeUtils.EPSILON);

          const { result: angleTo, error: tol } = computeNumberAndEstimateError(
            [
              position.x,
              position.y,
              position.z,
              rotation.x,
              rotation.y,
              rotation.z,
              scale.x,
              scale.y,
              scale.z,
            ],
            ([posX, posY, posZ, rotX, rotY, rotZ, sclX, sclY, sclZ]) => {
              const pos = new THREE.Vector3(posX, posY, posZ);
              const rot = new THREE.Euler(rotX, rotY, rotZ, rotation.order);
              const scl = new THREE.Vector3(sclX, sclY, sclZ);

              const obj3D = makeObj3D(pos, rot, scl);

              const pointerGlobalPos = obj3D.localToWorld(
                nextPointerLocalPos.clone(),
              );

              iterTransformFunc(
                obj3D,
                initPointerLocalPos,
                nextPointerLocalPos,
                transformFunc,
              );

              const pointerLocalPos = obj3D.worldToLocal(pointerGlobalPos);

              return MathUtils.normalizeAngle(
                pointerLocalPos.angleTo(initPointerLocalPos),
              );
            },
            (result, resultWithEps) =>
              Math.min(
                Math.abs(result - resultWithEps),
                Math.abs(result - (resultWithEps - MathUtils.TAU)),
                Math.abs(result - (resultWithEps + MathUtils.TAU)),
              ),
            () => ThreeUtils.EPSILON,
            (prevError, newError) => prevError + newError,
          );

          ctx?.log(`tol=${tol}`);

          return checkValue(angleTo, 0, ctx, (actual, expected) =>
            floatApprox(actual, expected, { atol: tol }),
          );
        },
      ),
    );
  });
void makePointerDirTest;

describe("TransformUtils.translate()", () => {
  makeNoMutateArgsTest(TransformUtils.translate);
  makeNoRotateTest(TransformUtils.translate);
  makeNoScaleTest(TransformUtils.translate);
  makePointerPosTest(TransformUtils.translate);
  it("should not move object along disableAxes", () => {
    fc.assert(
      fc.property(
        makeVector3Arbitrary(makeOtherComponentArbitrary),
        makeEulerArbitrary(makeOtherComponentArbitrary),
        makeVector3Arbitrary(makeScaleComponentArbitrary),
        makePointerEndpointsArbitrary(),
        fc.record({
          x: fc.boolean(),
          y: fc.boolean(),
          z: fc.boolean(),
        }),
        fc.context(),
        (
          position,
          rotation,
          scale,
          { initPointerLocalPos, nextPointerLocalPos },
          disableAxes,
          ctx,
        ) => {
          const { result: obj3DLocalPos, error: tol } =
            computeVector3AndEstimateError(
              [
                position.x,
                position.y,
                position.z,
                rotation.x,
                rotation.y,
                rotation.z,
                scale.x,
                scale.y,
                scale.z,
              ],
              ([posX, posY, posZ, rotX, rotY, rotZ, sclX, sclY, sclZ]) => {
                const pos = new THREE.Vector3(posX, posY, posZ);
                const rot = new THREE.Euler(rotX, rotY, rotZ, rotation.order);
                const scl = new THREE.Vector3(sclX, sclY, sclZ);

                const obj3D = makeObj3D(pos, rot, scl);

                const initObj3D = obj3D.clone();

                iterTransformFunc(
                  obj3D,
                  initPointerLocalPos,
                  nextPointerLocalPos,
                  _.partialRight(TransformUtils.translate, disableAxes),
                  ctx,
                );

                return initObj3D.worldToLocal(obj3D.position.clone());
              },
              (result, resultWithEps) =>
                resultWithEps.toArray().some(Number.isNaN)
                  ? new THREE.Vector3().setScalar(Number.POSITIVE_INFINITY)
                  : ThreeUtils.mapVector3(
                      result.clone().sub(resultWithEps),
                      Math.abs,
                    ),
              () => new THREE.Vector3().setScalar(ThreeUtils.EPSILON),
              (prevError, newError) => prevError.clone().add(newError),
            );

          ctx?.log(`tol=${tol}`);

          if (disableAxes.x) {
            expect(
              checkValue(obj3DLocalPos.x, 0, ctx, (actual, expected) =>
                floatApprox(actual, expected, {
                  atol: tol.x,
                }),
              ),
              "obj3DLocalPos.x was changed",
            ).to.be.true;
          }
          if (disableAxes.y) {
            expect(
              checkValue(obj3DLocalPos.y, 0, ctx, (actual, expected) =>
                floatApprox(actual, expected, {
                  atol: tol.y,
                }),
              ),
              "obj3DLocalPos.y was changed",
            ).to.be.true;
          }
          if (disableAxes.z) {
            expect(
              checkValue(obj3DLocalPos.z, 0, ctx, (actual, expected) =>
                floatApprox(actual, expected, {
                  atol: tol.z,
                }),
              ),
              "obj3DLocalPos.z was changed",
            ).to.be.true;
          }
        },
      ),
    );
  });
  it("should align object along snap.axis in local space", () => {
    fc.assert(
      fc.property(
        makeVector3Arbitrary(makeOtherComponentArbitrary),
        makeEulerArbitrary(makeOtherComponentArbitrary),
        makeVector3Arbitrary(makeScaleComponentArbitrary),
        makePointerEndpointsArbitrary(),
        fc.record({
          worldPos: makeVector3Arbitrary(makeOtherComponentArbitrary),
          axis: fc.constantFrom("X", "Y", "Z"),
        }),
        fc.context(),
        (
          position,
          rotation,
          scale,
          { initPointerLocalPos, nextPointerLocalPos },
          snap,
          ctx,
        ) => {
          const { result: snapLocalPos, error: tol } =
            computeVector3AndEstimateError(
              [
                position.x,
                position.y,
                position.z,
                rotation.x,
                rotation.y,
                rotation.z,
                scale.x,
                scale.y,
                scale.z,
              ],
              ([posX, posY, posZ, rotX, rotY, rotZ, sclX, sclY, sclZ]) => {
                const pos = new THREE.Vector3(posX, posY, posZ);
                const rot = new THREE.Euler(rotX, rotY, rotZ, rotation.order);
                const scl = new THREE.Vector3(sclX, sclY, sclZ);

                const obj3D = makeObj3D(pos, rot, scl);

                iterTransformFunc(
                  obj3D,
                  initPointerLocalPos,
                  nextPointerLocalPos,
                  _.partialRight(TransformUtils.translate, {}, snap),
                  ctx,
                );

                return obj3D.worldToLocal(snap.worldPos.clone());
              },
              (result, resultWithEps) =>
                resultWithEps.toArray().some(Number.isNaN)
                  ? new THREE.Vector3().setScalar(Number.POSITIVE_INFINITY)
                  : ThreeUtils.mapVector3(
                      result.clone().sub(resultWithEps),
                      Math.abs,
                    ),
              () => new THREE.Vector3().setScalar(ThreeUtils.EPSILON),
              (prevError, newError) => prevError.add(newError),
            );

          ctx?.log(`tol=${tol}`);

          switch (snap.axis) {
            case "X":
              expect(
                checkValue(snapLocalPos.y, 0, ctx, (actual, expected) =>
                  floatApprox(actual, expected, {
                    atol: tol.y,
                  }),
                ),
                "snapLocalPos.y is not aligned with local x",
              ).to.be.true;

              expect(
                checkValue(snapLocalPos.z, 0, ctx, (actual, expected) =>
                  floatApprox(actual, expected, {
                    atol: tol.z,
                  }),
                ),
                "snapLocalPos.z is not aligned with local x",
              ).to.be.true;
              break;
            case "Y":
              expect(
                checkValue(snapLocalPos.x, 0, ctx, (actual, expected) =>
                  floatApprox(actual, expected, {
                    atol: tol.x,
                  }),
                ),
                "snapLocalPos.x is not aligned with local y",
              ).to.be.true;

              expect(
                checkValue(snapLocalPos.z, 0, ctx, (actual, expected) =>
                  floatApprox(actual, expected, {
                    atol: tol.z,
                  }),
                ),
                "snapLocalPos.z is not aligned with local y",
              ).to.be.true;
              break;
            case "Z":
              expect(
                checkValue(snapLocalPos.x, 0, ctx, (actual, expected) =>
                  floatApprox(actual, expected, {
                    atol: tol.x,
                  }),
                ),
                "snapLocalPos.x is not aligned with local z",
              ).to.be.true;

              expect(
                checkValue(snapLocalPos.y, 0, ctx, (actual, expected) =>
                  floatApprox(actual, expected, {
                    atol: tol.y,
                  }),
                ),
                "snapLocalPos.y is not aligned with local z",
              ).to.be.true;
              break;
            default:
              throw new Error(`Invalid axis: ${snap.axis}`);
          }
        },
      ),
    );
  });
});

describe("TransformUtils.rotate()", () => {
  makeNoMutateArgsTest(TransformUtils.rotate);
  makeNoTranslateTest(TransformUtils.rotate);
  makeNoScaleTest(TransformUtils.rotate);
  // makePointerDirTest(TransformUtils.rotate);
});

describe("TransformUtils.resize()", () => {
  makeNoMutateArgsTest(TransformUtils.resize);
  makeNoRotateTest(TransformUtils.resize);
  // makePointerPosTest(TransformUtils.resize);
});
