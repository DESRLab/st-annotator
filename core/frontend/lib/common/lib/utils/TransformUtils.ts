import _ from "lodash";
import * as THREE from "three";

import * as MathUtils from "./MathUtils";
import * as ThreeUtils from "./ThreeUtils";

/**
 * If any component of a vector is too close to zero, adds or subtracts a small value to it
 * to move it away from zero.
 */
function avoidZero(v: THREE.Vector3): THREE.Vector3 {
  for (const i of [0, 1, 2]) {
    const scaleComponent = v.getComponent(i);
    if (ThreeUtils.isAbsClose(scaleComponent, 0)) {
      const sign = MathUtils.sign1(scaleComponent);
      v.setComponent(i, sign * ThreeUtils.EPSILON);
    }
  }

  return v;
}

/**
 * Updates the position of an object by click-and-dragging it.
 *
 * It is assumed that the object has unit dimensions in model space.
 */
export function translate(
  obj3D: THREE.Object3D,
  initPointerLocalPos: THREE.Vector3,
  nextPointerLocalPos: THREE.Vector3,
  disableAxes: { x?: boolean; y?: boolean; z?: boolean } | null = null,
  snap: { worldPos: THREE.Vector3; axis: "X" | "Y" | "Z" } | null = null,
): void {
  // Avoid division by zero
  avoidZero(obj3D.scale);

  const deltaLocal = nextPointerLocalPos.clone().sub(initPointerLocalPos);

  // Transform the delta from model to world space
  const positionDelta = deltaLocal
    .clone()
    .multiply(obj3D.scale)
    .applyEuler(obj3D.rotation);

  if (disableAxes) {
    if (disableAxes.x) deltaLocal.x = 0;
    if (disableAxes.y) deltaLocal.y = 0;
    if (disableAxes.z) deltaLocal.z = 0;

    positionDelta.copy(
      deltaLocal.clone().multiply(obj3D.scale).applyEuler(obj3D.rotation),
    );
  }

  if (snap) {
    const unadjustedPosition = obj3D.position.clone().add(positionDelta);

    // Get offset from provided position in model space
    const offsetLocal = snap.worldPos
      .clone()
      .sub(unadjustedPosition)
      .applyMatrix4(
        new THREE.Matrix4().makeRotationFromEuler(obj3D.rotation).invert(),
      )
      .divide(obj3D.scale);

    // Apply snapping
    const snappedOffsetLocal = offsetLocal.clone();
    switch (snap.axis) {
      case "X":
        snappedOffsetLocal.y = snappedOffsetLocal.z = 0;
        break;
      case "Y":
        snappedOffsetLocal.x = snappedOffsetLocal.z = 0;
        break;
      case "Z":
        snappedOffsetLocal.x = snappedOffsetLocal.y = 0;
        break;
      default:
        throw new Error(`Invalid axis: ${snap.axis}`);
    }

    deltaLocal.sub(snappedOffsetLocal.clone().sub(offsetLocal));
    positionDelta.copy(
      deltaLocal.clone().multiply(obj3D.scale).applyEuler(obj3D.rotation),
    );
  }

  obj3D.position.add(positionDelta);

  obj3D.updateMatrixWorld();
}

/**
 * Updates the rotation of an object by click-and-dragging it.
 *
 * It is assumed that the object has unit dimensions in model space.
 */
export function rotate(
  obj3D: THREE.Object3D,
  initPointerLocalPos: THREE.Vector3,
  nextPointerLocalPos: THREE.Vector3,
): void {
  // Avoid singularity points
  avoidZero(obj3D.scale);

  // https://math.stackexchange.com/questions/180418/calculate-rotation-matrix-to-align-vector-a-to-vector-b-in-3d
  const a = initPointerLocalPos.clone().multiply(obj3D.scale).normalize();
  const b = nextPointerLocalPos.clone().multiply(obj3D.scale).normalize();

  const v = a.clone().cross(b);
  const c = a.clone().dot(b);

  const I = new THREE.Matrix3();
  const vx = new THREE.Matrix3().set(0, -v.z, v.y, v.z, 0, -v.x, -v.y, v.x, 0);
  const vx2 = vx
    .clone()
    .multiply(vx)
    .multiplyScalar(1 / (1 + c + ThreeUtils.EPSILON));
  const R = ThreeUtils.sumMatrix3(I, vx, vx2);

  const rotationDelta = new THREE.Matrix4().setFromMatrix3(R);
  const prevRotation = new THREE.Matrix4().makeRotationFromEuler(
    obj3D.rotation,
  );
  const nextRotation = rotationDelta.multiply(prevRotation);
  obj3D.rotation.setFromRotationMatrix(nextRotation);

  obj3D.updateMatrixWorld();
}

/**
 * Updates the size of an object by click-and-dragging it.
 *
 * It is assumed that the object has unit dimensions in model space.
 */
export function resize(
  obj3D: THREE.Object3D,
  initPointerLocalPos: THREE.Vector3,
  nextPointerLocalPos: THREE.Vector3,
  aspect: {
    x?: number;
    y?: number;
    z?: number;
    mode?: "clip" | "avg";
  } | null = null,
  localAnchor: "opposite" | THREE.Vector3 = "opposite",
): void {
  // Avoid division by zero
  avoidZero(obj3D.scale);

  const deltaLocal = nextPointerLocalPos.clone().sub(initPointerLocalPos);

  // Multiplying by this factor ensures that the sign of the change in scale is correct,
  // regardless of where in model space the object was originally clicked
  const initSign = ThreeUtils.mapVector3(
    initPointerLocalPos.clone(),
    MathUtils.sign1,
  );

  // Transform the delta from model to world space
  const scaleDelta = deltaLocal
    .clone()
    .multiply(initSign)
    .multiply(obj3D.scale);

  // Enforce aspect ratio
  if (aspect) {
    const aspectOrZero = new THREE.Vector3(
      aspect.x ?? 0,
      aspect.y ?? 0,
      aspect.z ?? 0,
    );
    if (aspectOrZero.x < 0 || aspectOrZero.y < 0 || aspectOrZero.z < 0) {
      throw new Error(
        `The aspect ratio must be non-negative, but found: ${aspectOrZero.toArray()}`,
      );
    }

    const unadjustedScale = obj3D.scale.clone().add(scaleDelta);
    const adjustedScale = unadjustedScale.clone();

    // relSize: The size (i.e., absolute value of scale) relative to the aspect ratio
    // Note that the components for which aspect ratio is not considered are infinity
    const relSize = ThreeUtils.mapVector3(
      unadjustedScale.clone(),
      Math.abs,
    ).divide(aspectOrZero);
    if (relSize.x < 0 || relSize.y < 0 || relSize.z < 0) {
      throw new Error(
        `Expected relSize to be non-negative, but found: ${relSize.toArray()}`,
      );
    }

    const relSizeFinite = relSize
      .toArray()
      .filter(Number.isFinite)
      .filter(_.negate(Number.isNaN));

    // Fit the aspect ratio
    let refRelSize: number;
    switch (aspect.mode ?? "clip") {
      case "clip":
        refRelSize = Math.min(...relSizeFinite); // May be infinite
        if (!Number.isFinite(refRelSize)) refRelSize = Number.NaN;
        break;
      case "avg":
        refRelSize = _.mean(relSizeFinite); // May be NaN
        break;
      default:
        throw new Error(`Invalid aspect mode: ${aspect.mode}`);
    }

    const signedAspect = aspectOrZero
      .clone()
      .multiply(
        ThreeUtils.mapVector3(unadjustedScale.clone(), MathUtils.sign1),
      );
    if (aspect.x != null) adjustedScale.x = refRelSize * signedAspect.x;
    if (aspect.y != null) adjustedScale.y = refRelSize * signedAspect.y;
    if (aspect.z != null) adjustedScale.z = refRelSize * signedAspect.z;

    scaleDelta.copy(adjustedScale.clone().sub(obj3D.scale));
    deltaLocal.copy(scaleDelta.clone().divide(obj3D.scale).divide(initSign));
  }

  // Object is translated by half the cursor movement to keep opposite vertex stationary
  const positionScale =
    localAnchor === "opposite"
      ? ThreeUtils.mapVector3(initPointerLocalPos.clone(), Math.abs)
      : localAnchor;

  const positionDelta = deltaLocal
    .clone()
    .multiply(positionScale)
    .multiply(obj3D.scale)
    .applyEuler(obj3D.rotation);

  obj3D.position.add(positionDelta);
  obj3D.scale.add(scaleDelta);

  // Ensure that the scale is never zero, otherwise obj3D.worldToLocal may become a zero matrix
  avoidZero(obj3D.scale);

  obj3D.updateMatrixWorld();
}
