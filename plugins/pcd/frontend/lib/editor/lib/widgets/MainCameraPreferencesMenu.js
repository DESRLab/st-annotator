import { BaseMenu, BasePreferencesMenu } from 'sta/services/editor/base';

import { MainCameraSettingsPaneController } from '../scene';

/* eslint-disable max-len */
/**
 * @typedef {import('sta/services/editor/base').LayerCollection<any>} LayerCollection
 */

/**
 * @typedef {import('sta/services/editor/base').PaneControllerDataTypes} PaneControllerDataTypes
 */

/**
 * @template {PaneControllerDataTypes} P
 * @typedef {import('sta/services/editor/base').PaneControllerChangeEvent<P>} PaneControllerChangeEvent
 */

/**
 * @typedef {import('sta/services/editor/base').PreferencesMenu} PreferencesMenu
 */

/**
 * @typedef {import('sta/services/editor/base').Keybind} Keybind
 */

/**
 * @typedef {import('sta/services/editor/core').MainWindow} MainWindow
 */

/**
 * @typedef {import('../scene').MainCameraSettingsPaneControllerParams} MainCameraSettingsPaneControllerParams
 */

/**
 * @typedef {import('../scene').PointCloudLayer<any>} PointCloudLayer
 */
/* eslint-enable max-len */

/**
 * Displays the preferences of the application.
 * 
 * @implements {PreferencesMenu}
 */
export class MainCameraPreferencesMenu extends BaseMenu {

    /**
     * @readonly
     * @type {BasePreferencesMenu}
     */
    #prefs;

    /**
     * Contains each layer in the application.
     * 
     * @type {LayerCollection}
     */
    get layers() { return this.#prefs.layers; }

    /**
     * The main window of the application.
     * 
     * @readonly
     * @type {MainWindow}
     */
    mainWindow;

    /**
     * @readonly
     * @type {MainCameraSettingsPaneController}
     */
    #mainCameraSettingsInput;

    /**
     * Handles the event when the settings of the main camera has been changed.
     * 
     * @param {PaneControllerChangeEvent<MainCameraSettingsPaneControllerParams>} event
     * The event to handle.
     */
    #onMainCameraSettingsChange = (event) => {
        const { viewMode, orbitPoint } = event.outputData;

        this.mainWindow.viewMode = viewMode;

        if (orbitPoint) {
            this.mainWindow.overrideOrbitTarget = this.pcdLayer.overrideOrbitTarget;
        } else {
            this.mainWindow.overrideOrbitTarget = null;
        }
    };

    /**
     * The layer to refer to when orbiting the camera around a point in a point cloud.
     * 
     * @readonly
     * @type {PointCloudLayer}
     */
    pcdLayer;

    /**
     * @readonly
     * @type {ReadonlyArray<Keybind>}
     */
    KEYDOWN_BINDS = [
        {
            keyCombo: 'x',
            name: 'Cycle view mode',
            handler: () => {
                this.#mainCameraSettingsInput.cycleViewMode();
            },
        },
        {
            keyCombo: 'o',
            name: 'Toggle orbit point',
            handler: () => {
                this.#mainCameraSettingsInput.toggleOrbitPoint();
            },
        },
    ];

    /**
     * Creates a new display for the preferences of the application.
     * 
     * @param {LayerCollection} layers Contains each layer in the application.
     * @param {MainWindow} mainWindow The main window of the application.
     * @param {PointCloudLayer} pcdLayer The layer to refer to when orbiting the camera
     * around a point in a point cloud.
     */
    constructor(layers, mainWindow, pcdLayer) {
        super();

        for (const keybind of this.KEYDOWN_BINDS) {
            this.keydownHandler.register(keybind);
        }

        const mainCameraSettingsDom = document.createElement('div');
        this.#mainCameraSettingsInput = MainCameraSettingsPaneController
            .create(mainCameraSettingsDom);

        this.#prefs = new BasePreferencesMenu(layers, {
            'Main Camera': this.#mainCameraSettingsInput.dom,
        });
        this.dom.appendChild(this.#prefs.dom);
        this.keydownHandler.setChildren([this.#prefs.keydownHandler]);
        this.keyupHandler.setChildren([this.#prefs.keyupHandler]);

        this.mainWindow = mainWindow;
        this.pcdLayer = pcdLayer;

        this.#mainCameraSettingsInput.bindOutputData(this.#onMainCameraSettingsChange);
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.#prefs.dispose();

        this.#mainCameraSettingsInput.dispose();

        super.dispose();
    }
}
