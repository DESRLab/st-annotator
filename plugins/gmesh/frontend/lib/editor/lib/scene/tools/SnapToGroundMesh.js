import * as THREE from 'three';

/**
 * @typedef {import('../data').GroundMesh} GroundMesh
 */

/**
 * A helper class to maintain an object's elevation relative to a ground mesh in world space.
 */
export class SnapToGroundMesh {

    /**
     * Whether to disable maintaining the object's elevation relative to the ground mesh.
     * 
     * @type {boolean}
     */
    disabled = false;

    /**
     * The ground mesh to refer to when adjusting the elevation.
     * 
     * @type {?GroundMesh}
     */
    groundMesh;

    /**
     * The object whose elevation to adjust.
     * 
     * @type {?THREE.Object3D}
     */
    #obj3D;

    /**
     * The relative height of the object relative to the ground mesh
     * when it was attached, in terms of world space.
     * 
     * @type {?number} 
     */
    #startWorldRelElevation = null;

    /**
     * Creates a new helper to maintain an object's elevation relative to a ground mesh.
     * 
     * @param {?GroundMesh} groundMesh The ground mesh to refer to when adjusting the elevation.
     */
    constructor(groundMesh) {
        this.groundMesh = groundMesh;
    }

    /**
     * Attachs an object, computing its elevation from the ground mesh.
     * When {@link SnapToGroundMesh#snapToMesh} is called, the elevation
     * of this object will be updated to equal this initial value.
     * 
     * If the initial elevation cannot be computed at this moment, it is recomputed
     * whenever {@link SnapToGroundMesh#snapToMesh} is called.
     * 
     * @param {THREE.Object3D} obj3D The object to attach.
     */
    attach(obj3D) {
        this.#obj3D = obj3D;
        this.#startWorldRelElevation = this.#computeWorldRelElevation(obj3D);
    }

    /**
     * Detaches the current object so that its elevation is no longer adjusted.
     * 
     * This is a no-op if no object is currently attached.
     */
    detach() {
        this.#obj3D = null;
        this.#startWorldRelElevation = null;
    }

    /**
     * Calculates the projection of the center of an object on the ground mesh.
     * 
     * @param {THREE.Object3D} obj3D The object for which to compute its relative elevation.
     * @returns {?THREE.Vector3} The computed point in world space, or `null` if it cannot be
     * computed.
     */
    #computeWorldProjectionOnMesh(obj3D) {
        const mesh = this.groundMesh;
        if (mesh == null) return null;

        const boxWorldPos = obj3D.localToWorld(new THREE.Vector3(0, 0, 0));
        const boxDownDir = obj3D.localToWorld(new THREE.Vector3(0, -0.5, 0))
            .sub(boxWorldPos)
            .normalize();
        const boxUpDir = obj3D.localToWorld(new THREE.Vector3(0, 0.5, 0))
            .sub(boxWorldPos)
            .normalize();

        const downRaycaster = new THREE.Raycaster(boxWorldPos, boxDownDir);
        const upRaycaster = new THREE.Raycaster(boxWorldPos, boxUpDir);
        const intersection = mesh.raycast(downRaycaster).at(0) ?? mesh.raycast(upRaycaster).at(0);

        return intersection?.point ?? null;
    }

    /**
     * Calculates the elevation of an object relative to the ground mesh.
     * 
     * This assumes that both the object and ground mesh are attached to the same parent,
     * i.e., the scene.
     * 
     * @param {THREE.Object3D} obj3D The object for which to compute its relative elevation.
     * @returns {?number} The computed elevation in world space, or `null` if it cannot be found.
     */
    #computeWorldRelElevation(obj3D) {
        const mesh3D = this.groundMesh?.asObject3D();
        if (mesh3D == null) return null;

        const projWorld = this.#computeWorldProjectionOnMesh(obj3D);
        if (projWorld == null) return null;

        return obj3D.getWorldPosition(new THREE.Vector3()).y - projWorld.y;
    }

    /**
     * Adjust the elevation of the attached object to maintain its elevation relative to the
     * ground mesh.
     * 
     * If the elevation of the object relative to the ground mesh has not been computed before,
     * computes it now.
     * 
     * This is a no-op if this feature is disabled, or if there is no ground mesh or
     * attached object.
     */
    snapToMesh() {
        const obj3D = this.#obj3D;
        if (this.disabled || !this.groundMesh || !obj3D) return;

        if (this.#startWorldRelElevation == null) {
            this.#startWorldRelElevation = this.#computeWorldRelElevation(obj3D);
        }

        const startRelElevation = this.#startWorldRelElevation;
        const currentRelElevation = this.#computeWorldRelElevation(obj3D);

        if (startRelElevation != null && currentRelElevation != null) {
            // Update the world position directly

            const parent = obj3D.parent;
            if (parent) parent.remove(obj3D);

            obj3D.position.y += startRelElevation - currentRelElevation;

            if (parent) parent.attach(obj3D);
        }
    }
}
