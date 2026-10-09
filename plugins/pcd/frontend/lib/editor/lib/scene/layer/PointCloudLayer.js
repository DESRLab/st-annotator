import * as THREE from 'three';

import { ThreeUtils } from 'sta/common/utils';

import { ControlsMenu, SourceDataLayer } from 'sta/services/editor/base';

import { getSettings } from '../../config';

import { PointCloudView } from '../data';
import { PointCloudSettingsPaneController } from '../widgets';

/* eslint-disable max-len */
/**
 * @template {WindowMapper} WM
 * @typedef {import('sta/services/editor/base').SceneContext<WM>} SceneContext
 */

/**
 * @typedef {import('sta/services/editor/base').WindowMapper} WindowMapper
 */

/**
 * @typedef {import('sta/services/editor/base').Keybind} Keybind
 */

/**
 * @typedef {import('sta/services/editor/base').PaneControllerDataTypes} PaneControllerDataTypes
 */

/**
 * @template {PaneControllerDataTypes} P
 * @typedef {import('sta/services/editor/base').PaneControllerChangeEvent<P>} PaneControllerChangeEvent
 */

/**
 * @typedef {import('sta/services/editor/core').MainWindow} MainWindow
 */

/**
 * @typedef {import('../data').PointCloud} PointCloud
 */

/**
 * @typedef {import('../widgets').PointCloudSettingsPaneControllerParams} PointCloudSettingsPaneControllerParams
 */
/* eslint-enable max-len */

/**
 * Facilitates user interaction with the point cloud for the current frame.
 * 
 * @template {WindowMapper} WM The windows defined in the scene display.
 * @augments {SourceDataLayer<WM, ?PointCloud>}
 */
export class PointCloudLayer extends SourceDataLayer {

    /**
     * Contains logic to run before the data to display is switched to a different one.
     * 
     * @protected
     */
    onBeforeUpdateData() {
        this.#settingsInput.updateSettings({ disabled: true });
    }

    /**
     * Contains logic to run after the data to display is switched to a different one.
     * 
     * @protected
     */
    onAfterUpdateData() {
        const { data } = this.dataView;

        this.#settingsInput.updateState({
            internalData: data,
            settings: { disabled: (data == null) },
        });
    }

    /**
     * A function that can be set as {@link MainWindow#overrideOrbitTarget}.
     * 
     * @readonly
     * @type {(defaultTarget: THREE.Vector3, camera: THREE.Camera) => THREE.Vector3}
     */
    overrideOrbitTarget = (defaultTarget, camera) => {
        // Update the target of the controls to be approximately the point at the
        // center of the screen without changing the orientation of the camera
        const { data } = this.dataView;
        if (data == null) return defaultTarget;

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

        // Allow the raycaster to work at different zoom levels
        for (const threshold of [0.025, 0.25, 2.5]) {
            ThreeUtils.setRaycasterPointsThreshold(raycaster, threshold);

            const intersects = data.raycast(raycaster);
            if (intersects.length > 0) {
                const distance = intersects[0].distance;

                const v = defaultTarget.clone().sub(camera.position).normalize();
                return camera.position.clone().add(v.multiplyScalar(distance));
            }
        }

        return defaultTarget;
    };

    /**
     * A view of the data to display in this layer.
     * 
     * @readonly
     * @type {PointCloudView}
     */
    #dataView;

    /**
     * Visualizes the distance from the origin of the frame.
     * 
     * @readonly
     * @type {THREE.Object3D}
     */
    #gridHelper = new THREE.PolarGridHelper(250, 1, 5, 128);

    /**
     * Specifies the settings to apply to the point cloud.
     * 
     * @readonly
     * @type {PointCloudSettingsPaneController}
     */
    #settingsInput;

    /**
     * @readonly
     * @type {ReadonlyArray<Keybind>}
     */
    PREFS_KEYDOWN_BINDS = [
        {
            keyCombo: 'j',
            name: 'Toggle RemoveBG',
            handler: () => {
                this.#settingsInput.toggleRemoveBackground();
            },
        },
        {
            keyCombo: 'k',
            name: 'Toggle CropArea',
            handler: () => {
                this.#settingsInput.toggleCropArea();
            },
        },
    ];

    /**
     * Handles the event when the settings in the input have been updated.
     * 
     * @param {PaneControllerChangeEvent<PointCloudSettingsPaneControllerParams>} event
     * The event to handle.
     */
    #onSettingsChange = (event) => {
        const dataView = this.#dataView;
        const { removeBackground, cropArea } = event.outputData;

        dataView.setOptions(removeBackground, cropArea);
    };

    /**
     * Creates a new layer for point clouds.
     * 
     * @template {WindowMapper} WM The windows defined in the scene display.
     * @param {SceneContext<WM>} context A handle to the state of the scene.
     * @param {string} name The display name of this layer.
     * @param {number} [maxCacheSize] The maximum size of the data cache. Defaults to the value
     * provided in `context.config`.
     * @returns {PointCloudLayer<WM>} The newly created data layer.
     */
    static create(context, name, maxCacheSize = undefined) {
        const dataView = PointCloudView.create(context, maxCacheSize);

        return new PointCloudLayer(context, name, dataView);
    }

    /**
     * Creates a new layer for point clouds.
     * 
     * @param {SceneContext<WM>} context A handle to the state of the scene.
     * @param {string} name The display name of this layer.
     * @param {PointCloudView} dataView A view of the data to display in the layer.
     */
    constructor(context, name, dataView) {
        super(context, name, dataView);

        const config = context.config;
        const settings = getSettings(config);

        this.#dataView = dataView;

        const settingsInputDom = document.createElement('div');
        {
            this.#settingsInput = PointCloudSettingsPaneController.create(settingsInputDom, {
                inputtedData: settings,
            });
        }
        this.prefsElem = settingsInputDom;

        const controlsContent = document.createElement('div');
        controlsContent.style.width = '100%';
        controlsContent.style.paddingLeft = 'var(--cnt-h-p)';
        controlsContent.innerHTML = ControlsMenu.getControlsSectionHtmlText(
            'Preferences',
            this.PREFS_KEYDOWN_BINDS,
        );
        this.controlsElem.replaceChildren(controlsContent);

        for (const keybind of this.PREFS_KEYDOWN_BINDS) {
            this.keydownHandler.register(keybind);
        }

        this.#settingsInput.bindOutputData(this.#onSettingsChange);
    }

    dispose() {
        this.#settingsInput.dispose();

        super.dispose();
    }

    /**
     * Updates the `three.js` objects and the DOM elements of this layer.
     * It is called during each animation frame while this layer is displayed.
     */
    render() {
        this.objects.clear();

        const { data } = this.dataView;
        if (data == null) return;

        const { blender, pointSize } = this.#settingsInput.outputData;
        if (blender != null) data.blender = blender;
        data.pointSize = pointSize;

        this.objects.add(data.asObject3D());

        this.#gridHelper.position.copy(data.position);
        this.objects.add(this.#gridHelper);
    }
}
