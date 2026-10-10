import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/**
 * Sets the position of a camera along all three dimensions.
 */
export function setCameraPosition3D(
  camera: THREE.Camera,
  position: THREE.Vector3,
) {
  // Avoid infinite loop
  if (camera.position.equals(position)) return;

  camera.position.copy(position);
  camera.updateMatrixWorld();
}

/**
 * Sets the position of a camera along a horizontal plane.
 *
 * The orbit target of the camera is also updated accordingly as if the
 * camera was panned.
 */
export function panControls2D(
  controls: OrbitControls,
  position: { x: number; z: number },
) {
  const camera = controls.object;

  // Avoid infinite loop from handling 'change' event
  if (camera.position.x === position.x && camera.position.z === position.z)
    return;

  const position3D = new THREE.Vector3(
    position.x,
    camera.position.y,
    position.z,
  );

  panControls3D(controls, position3D);
}

/**
 * Sets the position of a camera along all three dimensions.
 *
 * The orbit target of the camera is also updated accordingly as if the
 * camera was panned.
 */
export function panControls3D(
  controls: OrbitControls,
  position: THREE.Vector3,
) {
  const camera = controls.object;

  // Avoid infinite loop from handling 'change' event
  if (camera.position.equals(position)) return;

  const positionDelta = position.clone().sub(camera.position);

  setCameraPosition3D(camera, position);

  controls.target.add(positionDelta);
  controls.update();
}

/**
 * Rotates a camera so that it looks at a target point along all three dimensions.
 */
export function rotateControls3D(
  controls: OrbitControls,
  target: THREE.Vector3,
) {
  const camera = controls.object;

  // Avoid infinite loop
  if (controls.target.equals(target)) return;

  camera.lookAt(target);
  camera.updateMatrixWorld();

  controls.target.copy(target);
  controls.update();
}
