import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

import { ThreeUtils } from '../../../../../../common/lib/utils';

import { BaseSceneWindow, panControls2D, panControls3D, rotateControls3D } from '../../../base';

/**
 * @typedef {import('../../../base').SceneDisplay<any>} SceneDisplay
 */

/**
 * @typedef {'2D' | '3D'} ViewMode
 */

/**
 * Defines each event that can be dispatched by {@link MainWindow}.
 * 
 * @typedef {object} MainWindowEventMap
 * @property {{ camera: THREE.Camera }} camera-update The event when the pose of the camera
 * has been updated.
 * @property {{ viewMode: ViewMode }} viewMode-change The event when the view mode has been updated.
 */

/**
 * Represents the main window of the application.
 * 
 * @augments BaseSceneWindow<MainWindowEventMap>
 */
export class MainWindow extends BaseSceneWindow {

    /**
     * @type {HTMLDivElement}
     */
    #dom;

    /**
     * A DOM element which boundaries define the area in which to render this window.
     * 
     * When this window is added to a {@link SceneDisplay}, this element will be
     * added as a sibling of its rendering canvas.
     * 
     * @type {HTMLDivElement}
     */
    get dom() { return this.#dom; }

    /**
     * The camera used to render the 2D (top-down) view of the scene.
     * 
     * @readonly
     * @type {THREE.OrthographicCamera}
     */
    camera2D;

    /**
     * The camera used to render the 3D view of the scene.
     * 
     * @readonly
     * @type {THREE.PerspectiveCamera}
     */
    camera3D;

    /**
     * The size of each pixel of the top-down view in world space.
     * 
     * A larger value leads to poorer resolution, but more area can be covered by the view.
     * 
     * @readonly
     * @type {number}
     */
    #UNITS_PER_PIXEL = 0.05;

    /**
     * The near plane for each camera.
     * 
     * @readonly
     * @type {number}
     */
    #NEAR = ThreeUtils.EPSILON;

    /**
     * The far plane for each camera.
     * 
     * @readonly
     * @type {number}
     */
    #FAR = 1 / ThreeUtils.EPSILON;

    /**
     * Observes the DOM element of this window for resize events.
     * 
     * @type {ResizeObserver}
     */
    #observer;

    /**
     * Updates each camera to fit the DOM element of this window.
     */
    #updateCameraAspects = () => {
        const { width, height } = this.dom.getBoundingClientRect();

        const widthUnits = width * this.#UNITS_PER_PIXEL;
        const heightUnits = height * this.#UNITS_PER_PIXEL;

        this.camera2D.left = widthUnits / -2;
        this.camera2D.right = widthUnits / 2;
        this.camera2D.top = heightUnits / 2;
        this.camera2D.bottom = heightUnits / -2;
        this.camera2D.updateProjectionMatrix();

        this.camera3D.aspect = widthUnits / heightUnits;
        this.camera3D.updateProjectionMatrix();
    };

    /**
     * @type {ViewMode}
     */
    #viewMode;

    /**
     * If `'2D'`, a top-down view of the scene is rendered; if `'3D'`, a three-dimensional
     * view of the scene is rendered.
     * 
     * @type {ViewMode}
     */
    get viewMode() { return this.#viewMode; }

    set viewMode(value) {
        if (this.#viewMode !== value) {
            this.#viewMode = value;

            this.#updateControlsEnabled();

            this.dispatchEvent({ type: 'viewMode-change', viewMode: value });

            // Since the result of this.getCamera() changes
            this.dispatchEvent({ type: 'camera-update', camera: this.getCamera() });
        }
    }

    /**
     * @type {boolean}
     */
    #enableCameraControls;

    /**
     * `true` if the user can manipulate the camera; otherwise, `false`.
     * 
     * @type {boolean}
     */
    get enableCameraControls() { return this.#enableCameraControls; }

    set enableCameraControls(value) {
        if (this.#enableCameraControls !== value) {
            this.#enableCameraControls = value;

            this.#updateControlsEnabled();
        }
    }

    /**
     * The controls used to move the camera used to render the 2D (top-down) view of the scene.
     * 
     * @readonly
     * @type {OrbitControls}
     */
    controls2D;

    /**
     * The controls used to move the camera used to render the 3D view of the scene.
     * 
     * @readonly
     * @type {OrbitControls}
     */
    controls3D;

    /**
     * Updates whether each set of controls is enabled.
     */
    #updateControlsEnabled() {
        const { enableCameraControls, viewMode } = this;

        this.controls2D.enabled = enableCameraControls && viewMode === '2D';
        this.controls3D.enabled = enableCameraControls && viewMode === '3D';
    }

    /**
     * A crosshair shown when the camera is being manipulated and the orbit target of
     * the camera is overriden.
     * 
     * @type {HTMLLabelElement}
     */
    #crosshair;

    /**
     * If given, the orbit target of the camera controls of this window is overriden with
     * the return value of this function, which accepts the default orbit target and
     * the state of the active camera.
     * 
     * @type {?((defaultTarget: THREE.Vector3, camera: THREE.Camera) => THREE.Vector3)}
     */
    overrideOrbitTarget;

    /**
     * Prevents infinite recursion when updating the controls while handling
     * the `change` event of {@link OrbitControls}.
     * 
     * @param {() => void} handler The event handler to wrap.
     * @returns {() => void} The wrapped event handler.
     */
    #wrapChangeHandler(handler) {
        let isHandlingChange = false;

        return () => {
            if (isHandlingChange) return;

            try {
                isHandlingChange = true;

                handler();
            } finally {
                isHandlingChange = false;
            }
        };
    }

    /**
     * Handles the event when a set of controls begins to be manipulated.
     * 
     * @param {OrbitControls} controls The subject of the event.
     */
    #handleControlsStart(controls) {
        const overrideOrbitTarget = this.overrideOrbitTarget;
        if (overrideOrbitTarget == null) return;

        const newTarget = overrideOrbitTarget(controls.target.clone(), controls.object);
        controls.target.copy(newTarget);

        this.#crosshair.hidden = false;
    }

    #onControls2DStart = () => {
        this.#handleControlsStart(this.controls2D);
    };

    #onControls2DChange = this.#wrapChangeHandler(() => {
        // Keep the target of the two controls the same along the horizontal
        const panDelta2D = this.controls2D.target.clone().sub(this.controls3D.target).setY(0);
        const nextPos = this.controls3D.object.position.clone().add(panDelta2D);
        panControls2D(this.controls3D, nextPos);

        this.dispatchEvent({ type: 'camera-update', camera: this.getCamera() });
    });

    #onControls2DEnd = () => {
        this.#crosshair.hidden = true;

        this.dispatchEvent({ type: 'camera-update', camera: this.getCamera() });
    };

    #onControls3DStart = () => {
        this.#handleControlsStart(this.controls3D);
    };

    #onControls3DChange = this.#wrapChangeHandler(() => {
        // Keep the target of the two controls the same along the horizontal
        const panDelta2D = this.controls3D.target.clone().sub(this.controls2D.target).setY(0);
        const nextPos = this.controls2D.object.position.clone().add(panDelta2D);
        panControls2D(this.controls2D, nextPos);

        this.dispatchEvent({ type: 'camera-update', camera: this.getCamera() });
    });

    #onControls3DEnd = () => {
        this.#crosshair.hidden = true;

        this.dispatchEvent({ type: 'camera-update', camera: this.getCamera() });
    };

    #attachControls = () => {
        this.controls2D.addEventListener('start', this.#onControls2DStart);
        this.controls2D.addEventListener('change', this.#onControls2DChange);
        this.controls2D.addEventListener('end', this.#onControls2DEnd);
        this.controls3D.addEventListener('start', this.#onControls3DStart);
        this.controls3D.addEventListener('change', this.#onControls3DChange);
        this.controls3D.addEventListener('end', this.#onControls3DEnd);
    };

    #detachControls = () => {
        this.controls2D.removeEventListener('start', this.#onControls2DStart);
        this.controls2D.removeEventListener('change', this.#onControls2DChange);
        this.controls2D.removeEventListener('end', this.#onControls2DEnd);

        this.controls3D.removeEventListener('start', this.#onControls3DStart);
        this.controls3D.removeEventListener('change', this.#onControls3DChange);
        this.controls3D.removeEventListener('end', this.#onControls3DEnd);
    };

    /**
     * Creates a new main window.
     * 
     * @param {string} name The name of the window.
     * @param {number} layerId The `three.js` layer of the window.
     */
    constructor(name, layerId) {
        super(name, layerId);

        this.#dom = document.createElement('div');
        this.#dom.id = 'main-window';
        this.#dom.style.position = 'absolute';
        this.#dom.style.top = '0';
        this.#dom.style.left = '0';
        this.#dom.style.width = '100%';
        this.#dom.style.height = '100%';

        this.camera2D = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, this.#NEAR, this.#FAR);
        this.camera2D.position.setY(25);
        this.camera2D.lookAt(0, 0, 0);
        this.camera2D.layers.set(layerId);

        this.camera3D = new THREE.PerspectiveCamera(30, 1, this.#NEAR, this.#FAR);
        this.camera3D.position.setY(25);
        this.camera3D.lookAt(0, 0, 0);
        this.camera3D.layers.set(layerId);

        this.#observer = new ResizeObserver(this.#updateCameraAspects);

        this.#viewMode = '2D';
        this.#enableCameraControls = true;

        this.controls2D = new OrbitControls(this.camera2D, this.dom);
        this.controls2D.maxPolarAngle = 0;

        this.controls3D = new OrbitControls(this.camera3D, this.dom);
        this.controls3D.minDistance = ThreeUtils.EPSILON;

        this.#crosshair = document.createElement('label');
        this.#crosshair.style.position = 'absolute';
        this.#crosshair.style.top = '50%';
        this.#crosshair.style.left = '50%';
        this.#crosshair.style.transform = 'translate(-50%, -50%)';
        this.#crosshair.style.fontSize = '2em';
        this.#crosshair.style.color = 'yellow';
        this.#crosshair.style.userSelect = 'none';
        this.#crosshair.hidden = true;
        this.#crosshair.textContent = '+';
        this.dom.appendChild(this.#crosshair);

        this.#attachControls();
        this.#observer.observe(this.dom);

        this.#updateCameraAspects();
        this.#updateControlsEnabled();
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.#observer.unobserve(this.dom);

        this.#detachControls();

        super.dispose();
    }

    /**
     * Gets the camera used to render this window.
     * 
     * This camera should be located in world space,
     * rather than being relative to the current frame.
     * 
     * Unlike other attributes of this window, a different camera may be returned
     * each time this is called.
     * 
     * @returns {THREE.Camera} The requested camera.
     */
    getCamera() {
        switch (this.viewMode) {
            case '2D':
                return this.camera2D;
            case '3D':
                return this.camera3D;
            default:
                throw new Error(`Unhandled viewMode: ${this.viewMode}`);
        }
    }

    /**
     * Gets the corresponding set of controls of {@link MainWindow#getCamera}.
     * 
     * @returns {OrbitControls} The requested set of controls.
     */
    getControls() {
        switch (this.viewMode) {
            case '2D':
                return this.controls2D;
            case '3D':
                return this.controls3D;
            default:
                throw new Error(`Unhandled viewMode: ${this.viewMode}`);
        }
    }

    /**
     * Sets the pose of the 3D camera, updating the 2D camera to be directly
     * above the target.
     * 
     * @param {THREE.Vector3} position3D The new position.
     * @param {THREE.Vector3} target3D The new target to look at.
     */
    setPose3D(position3D, target3D) {
        // Avoid unintentional interactions between 2D and 3D controls
        this.#detachControls();

        try {
            this.#panCamera3D(position3D);
            rotateControls3D(this.controls3D, target3D);
        } finally {
            this.#attachControls();
        }

        this.dispatchEvent({ type: 'camera-update', camera: this.getCamera() });
    }

    /**
     * Inner logic of {@link MainWindow#panCamera3D}.
     * 
     * @param {THREE.Vector3} position3D The new position.
     */
    #panCamera3D(position3D) {
        const delta3DTo2D = this.camera2D.position.clone().sub(this.camera3D.position);
        const position2D = position3D.clone().add(delta3DTo2D);

        panControls3D(this.controls3D, position3D);
        panControls3D(this.controls2D, position2D);
    }

    /**
     * Pans the 3D camera to the given position, updating the 2D camera to
     * maintain its position and direction relative to the 3D camera.
     * 
     * @param {THREE.Vector3} position3D The new position.
     */
    panCamera3D(position3D) {
        // Avoid unintentional interactions between 2D and 3D controls
        this.#detachControls();

        try {
            this.#panCamera3D(position3D);
        } finally {
            this.#attachControls();
        }

        this.dispatchEvent({ type: 'camera-update', camera: this.getCamera() });
    }
}
