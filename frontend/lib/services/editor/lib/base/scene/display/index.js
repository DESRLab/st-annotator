import * as THREE from 'three';

/**
 * @typedef {import('three/examples/jsm/controls/OrbitControls').OrbitControls} OrbitControls
 */

/**
 * @typedef {import('./SceneDisplay').WindowMapper} WindowMapper
 */

/**
 * @typedef {import('./SceneWindow').ScenePointerEvent} ScenePointerEvent
 */

/**
 * @typedef {import('./SceneWindow').ScenePointerEventMap} ScenePointerEventMap
 */

export { SceneDisplay, BaseSceneDisplay } from './SceneDisplay';
export { SceneRenderer } from './SceneRenderer';
export { POINTER_EVENT_KEYS, SceneWindow, BaseSceneWindow } from './SceneWindow';

/**
 * Sets the position of a camera along a horizontal plane.
 * 
 * @param {THREE.Camera} camera The camera to update.
 * @param {{ x: number, z: number }} position The position to set, in world space.
 */
export function setCameraPosition2D(camera, position) {
    // Avoid infinite loop
    if (camera.position.x === position.x && camera.position.z === position.z) return;

    camera.position.setX(position.x).setZ(position.z);
    camera.updateMatrixWorld();
}

/**
 * Sets the position of a camera along all three dimensions.
 * 
 * @param {THREE.Camera} camera The camera to update.
 * @param {THREE.Vector3} position The position to set, in world space.
 */
export function setCameraPosition3D(camera, position) {
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
 * 
 * @param {OrbitControls} controls The set of controls for the camera.
 * @param {{ x: number, z: number }} position The position to set, in world space.
 */
export function panControls2D(controls, position) {
    const camera = controls.object;

    // Avoid infinite loop from handling 'change' event
    if (camera.position.x === position.x && camera.position.z === position.z) return;

    const position3D = new THREE.Vector3(position.x, camera.position.y, position.z);

    panControls3D(controls, position3D);
}

/**
 * Sets the position of a camera along all three dimensions.
 * 
 * The orbit target of the camera is also updated accordingly as if the
 * camera was panned.
 * 
 * @param {OrbitControls} controls The set of controls for the camera.
 * @param {THREE.Vector3} position The position to set, in world space.
 */
export function panControls3D(controls, position) {
    const camera = controls.object;

    // Avoid infinite loop from handling 'change' event
    if (camera.position.equals(position)) return;

    const positionDelta = position.clone().sub(camera.position);

    setCameraPosition3D(camera, position);

    controls.target.add(positionDelta);
    controls.update();
}

/**
 * Rotates a camera so that it looks at a target point along the horizontal plane.
 * 
 * @param {OrbitControls} controls The set of controls for the camera.
 * @param {{ x: number, z: number }} target The coordinates of the point, in world space.
 */
export function rotateControls2D(controls, target) {
    // Avoid infinite loop from handling 'change' event
    if (controls.target.x === target.x && controls.target.z === target.z) return;

    const target3D = new THREE.Vector3(target.x, controls.target.y, target.z);

    rotateControls3D(controls, target3D);
}

/**
 * Rotates a camera so that it looks at a target point along all three dimensions.
 * 
 * @param {OrbitControls} controls The set of controls for the camera.
 * @param {THREE.Vector3} target The coordinates of the point in world space.
 */
export function rotateControls3D(controls, target) {
    const camera = controls.object;

    // Avoid infinite loop from handling 'change' event
    if (controls.target.equals(target)) return;

    camera.lookAt(target);
    camera.updateMatrixWorld();

    controls.target.copy(target);
    controls.update();
}
