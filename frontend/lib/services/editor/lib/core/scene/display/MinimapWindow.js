import tippy, { followCursor } from 'tippy.js';
import 'tippy.js/dist/tippy.css';

import interact from 'interactjs';
import _ from 'lodash';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

import { ThreeUtils, TypeUtils } from '../../../../../../common/lib/utils';

import { BaseSceneWindow, panControls2D } from '../../../base';

/**
 * @typedef {import('tippy.js').Instance} Instance
 */

/**
 * @typedef {import('../../../base').EditorConfig} EditorConfig
 */

/**
 * @typedef {import('../../../base').SceneDisplay<any>} SceneDisplay
 */

/**
 * @typedef {import('./MainWindow').MainWindow} MainWindow
 */

/**
 * Represents an event dispatched by {@link MinimapWindow}.
 * 
 * @typedef {object} MinimapWindowEventMap
 * @property {{ camera: THREE.Camera }} camera-update The event when the pose of the camera
 * has been updated.
 */

/**
 * Represents the minimap window of the application.
 * 
 * @augments BaseSceneWindow<MinimapWindowEventMap>
 */
export class MinimapWindow extends BaseSceneWindow {

    /**
     * The configuration of the application.
     * 
     * @readonly
     * @type {EditorConfig}
     */
    config;

    /**
     * The main window containing the scene.
     * 
     * @readonly
     * @type {MainWindow}
     */
    mainWindow;

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
     * The size of each pixel of the top-down view in world space.
     * 
     * A larger value leads to poorer resolution, but more area can be covered by the view.
     * 
     * @readonly
     * @type {number}
     */
    #UNITS_PER_PIXEL = 0.1;

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

        this.#updateMarkers();
    };

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
     * Updates whether each set of controls is enabled.
     */
    #updateControlsEnabled() {
        const { enableCameraControls } = this;

        this.controls2D.enabled = enableCameraControls;
    }

    /**
     * An indicator used to locate the 2D camera.
     * 
     * @type {HTMLLabelElement}
     */
    #camera2DMarker;

    /**
     * An indicator used to locate the 3D camera.
     * 
     * @type {HTMLLabelElement}
     */
    #camera3DMarker;

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

    #onControlsChange = this.#wrapChangeHandler(() => {
        const mainWindow = this.mainWindow;

        panControls2D(mainWindow.controls2D, this.camera2D.position);

        this.#updateMarkers();

        this.dispatchEvent({ type: 'camera-update', camera: this.getCamera() });
    });

    #onControlsEnd = () => {
        this.dispatchEvent({ type: 'camera-update', camera: this.getCamera() });
    };

    #onMainWindowUpdate = () => {
        const mainWindow = this.mainWindow;

        panControls2D(this.controls2D, mainWindow.camera2D.position);

        this.#updateMarkers();
    };

    #updateMarkers = () => {
        const mainWindow = this.mainWindow;

        this.#camera2DMarker.title = `(${mainWindow.camera2D.position.x}, ${mainWindow.camera2D.position.z})`;
        this.#camera3DMarker.title = `(${mainWindow.camera3D.position.x}, ${mainWindow.camera3D.position.z})`;

        const is3DActive = (mainWindow.viewMode === '3D');

        this.#camera3DMarker.style.color = is3DActive ? 'yellow' : 'lightgray';
        this.#camera3DMarker.style.webkitTextStrokeColor = is3DActive ? 'gold' : 'gray';

        const camera3DNDC = mainWindow.camera3D.position.clone().project(this.camera2D);
        const camera3DRelPos = ThreeUtils.getNDCRelPos(camera3DNDC);
        const camera3DRelCoords = new THREE.Vector3(camera3DRelPos.x, camera3DRelPos.y, 0);

        const isCamera3DInMinimap = (0 <= camera3DRelCoords.x && camera3DRelCoords.x <= 1)
            && (0 <= camera3DRelCoords.y && camera3DRelCoords.y <= 1);

        if (isCamera3DInMinimap) {
            this.#camera3DMarker.style.top = `${camera3DRelCoords.y * 100}%`;
            this.#camera3DMarker.style.left = `${camera3DRelCoords.x * 100}%`;
        } else {
            // Project a ray from the center to the camera,
            // then determine where it intersects the box
            const CENTER = new THREE.Vector3(0.5, 0.5, 0);
            const centerToNDC = camera3DRelCoords.clone().sub(CENTER).normalize();
            const ray = new THREE.Ray(CENTER, centerToNDC);
            const boxPlanes = [
                new THREE.Plane().setFromNormalAndCoplanarPoint(
                    new THREE.Vector3().setX(-1),
                    new THREE.Vector3().setX(0),
                ),
                new THREE.Plane().setFromNormalAndCoplanarPoint(
                    new THREE.Vector3().setX(1),
                    new THREE.Vector3().setX(1),
                ),
                new THREE.Plane().setFromNormalAndCoplanarPoint(
                    new THREE.Vector3().setY(-1),
                    new THREE.Vector3().setY(0),
                ),
                new THREE.Plane().setFromNormalAndCoplanarPoint(
                    new THREE.Vector3().setY(1),
                    new THREE.Vector3().setY(1),
                ),
            ];

            const intersects = boxPlanes
                .map((boxPlane) => ray.intersectPlane(boxPlane, new THREE.Vector3()))
                .filter(TypeUtils.isNotNull);
            const closestIntersect = _.minBy(
                intersects,
                (intersect) => intersect.distanceToSquared(CENTER),
            ) ?? CENTER;

            this.#camera3DMarker.style.top = `${closestIntersect.y * 100}%`;
            this.#camera3DMarker.style.left = `${closestIntersect.x * 100}%`;

            // Override the fill color but keep the outline
            this.#camera3DMarker.style.color = 'transparent';
        }

        const target3DNDC = mainWindow.controls3D.target.clone().project(this.camera2D);
        const dir3DNDC = target3DNDC.clone().sub(camera3DNDC);
        const dir3DNDCAngle = Math.atan2(dir3DNDC.y, dir3DNDC.x);
        this.#camera3DMarker.style.transform = `translate(-50%, -50%) rotate(${-dir3DNDCAngle}rad)`;
    };

    /**
     * @type {Instance}
     */
    #tooltip;

    /**
     * Handles the event when the minimap is hovered over.
     * 
     * @param {PointerEvent} event The event to handle.
     */
    #onPointerMove = (event) => {
        const pointerNDC = ThreeUtils.getPointerNDC(this.#dom, event);

        // z=-1 corresponds to near plane
        const worldNDC = new THREE.Vector3(pointerNDC.x, pointerNDC.y, -1).unproject(this.camera2D);

        const worldNDCDb = this.config.coordinateFormat.toDatabaseCoords(worldNDC);

        this.#tooltip.setContent(`(${worldNDCDb.x.toFixed(3)}, ${worldNDCDb.y.toFixed(3)})`);
    };

    /**
     * Creates a new main window.
     * 
     * @param {string} name The name of the window.
     * @param {number} layerId The `three.js` layer of the window.
     * @param {EditorConfig} config The configuration of the application.
     * @param {MainWindow} mainWindow The main window, which the camera markers are based on.
     */
    constructor(name, layerId, config, mainWindow) {
        super(name, layerId);

        this.config = config;

        this.mainWindow = mainWindow;
        this.mainWindow.addEventListener('camera-update', this.#onMainWindowUpdate);

        this.#dom = document.createElement('div');
        this.#dom.id = 'minimap-window';
        this.#dom.style.position = 'absolute';
        this.#dom.style.border = '5px solid darkgray';

        const rect = { top: 32, left: 32, width: 256, height: 256 };
        const updateRect = () => {
            this.#dom.style.top = `${rect.top}px`;
            this.#dom.style.left = `${rect.left}px`;
            this.#dom.style.width = `${rect.width}px`;
            this.#dom.style.height = `${rect.height}px`;
        };

        interact(this.#dom)
            .draggable({
                listeners: {
                    move: (event) => {
                        const { y: dy, x: dx } = event.delta;
                        rect.top += dy;
                        rect.left += dx;

                        updateRect();
                    },
                },
            })
            .resizable({
                edges: { top: true, left: true, bottom: true, right: true },
                invert: 'reposition',
                listeners: {
                    move: (event) => {
                        const { width, height } = event.rect;
                        rect.width = width;
                        rect.height = height;

                        const { top: dy, left: dx } = event.deltaRect;
                        rect.top += dy;
                        rect.left += dx;

                        updateRect();
                    },
                },
            });

        this.#tooltip = tippy(this.#dom, {
            followCursor: true,
            plugins: [followCursor],
        });

        this.#dom.addEventListener('pointermove', this.#onPointerMove);

        updateRect();

        this.camera2D = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, this.#NEAR, this.#FAR);
        this.camera2D.position.setY(50);
        this.camera2D.lookAt(0, 0, 0);
        this.camera2D.layers.set(layerId);

        this.#observer = new ResizeObserver(this.#updateCameraAspects);
        this.#observer.observe(this.dom);

        this.#enableCameraControls = true;

        this.controls2D = new OrbitControls(this.camera2D, this.dom);
        this.controls2D.maxPolarAngle = 0;
        this.controls2D.enableRotate = false;
        this.controls2D.addEventListener('change', this.#onControlsChange);
        this.controls2D.addEventListener('end', this.#onControlsEnd);

        this.#camera2DMarker = document.createElement('label');
        this.#camera2DMarker.style.position = 'absolute';
        this.#camera2DMarker.style.top = '50%';
        this.#camera2DMarker.style.left = '50%';
        this.#camera2DMarker.style.transform = 'translate(-50%, -50%)';
        this.#camera2DMarker.style.fontSize = '2em';
        this.#camera2DMarker.style.color = 'red';
        this.#camera2DMarker.style.userSelect = 'none';
        this.#camera2DMarker.textContent = '🞜';

        this.#camera3DMarker = document.createElement('label');
        this.#camera3DMarker.style.position = 'absolute';
        this.#camera3DMarker.style.top = '50%';
        this.#camera3DMarker.style.left = '50%';
        this.#camera3DMarker.style.transform = 'translate(-50%, -50%)';
        this.#camera3DMarker.style.fontSize = '2em';
        this.#camera3DMarker.style.color = 'yellow';
        this.#camera3DMarker.style.webkitTextStrokeColor = 'gold';
        this.#camera3DMarker.style.webkitTextStrokeWidth = '2px';
        this.#camera3DMarker.style.userSelect = 'none';
        this.#camera3DMarker.textContent = '⮞';

        // Display the 3D marker on top of the 2D marker
        this.dom.appendChild(this.#camera3DMarker);
        this.dom.appendChild(this.#camera2DMarker);

        this.#updateCameraAspects();
        this.#updateControlsEnabled();
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.#dom.removeEventListener('pointermove', this.#onPointerMove);
        this.#observer.unobserve(this.dom);

        this.#tooltip.destroy();

        this.controls2D.removeEventListener('change', this.#onControlsChange);
        this.controls2D.removeEventListener('end', this.#onControlsEnd);

        this.mainWindow.removeEventListener('camera-update', this.#onMainWindowUpdate);

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
        return this.camera2D;
    }

    /**
     * Gets the corresponding set of controls of {@link MinimapWindow#getCamera}.
     * 
     * @returns {OrbitControls} The requested set of controls.
     */
    getControls() {
        return this.controls2D;
    }
}
