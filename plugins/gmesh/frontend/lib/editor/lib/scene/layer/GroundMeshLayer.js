import { SourceDataLayer } from 'sta/services/editor/base';

import { getSettings } from '../../config';

import { GroundMeshView } from '../data';
import { GroundMeshSettingsPaneController } from '../widgets';

/* eslint-disable max-len */
/**
 * @template {WindowMapper} WM
 * @typedef {import('sta/services/editor/base').SceneContext<WM>} SceneContext
 */

/**
 * @typedef {import('sta/services/editor/base').WindowMapper} WindowMapper
 */

/**
 * @typedef {import('sta/services/editor/base').PaneControllerDataTypes} PaneControllerDataTypes
 */

/**
 * @template {PaneControllerDataTypes} P
 * @typedef {import('sta/services/editor/base').PaneControllerChangeEvent<P>} PaneControllerChangeEvent
 */

/**
 * @typedef {import('../data').GroundMesh} GroundMesh
 */

/**
 * @typedef {import('../widgets').GroundMeshSettingsPaneControllerParams} GroundMeshSettingsPaneControllerParams
 */
/* eslint-enable max-len */

/**
 * Facilitates user interaction with the ground mesh, if any, for the current frame.
 * 
 * @template {WindowMapper} WM The windows defined in the scene display.
 * @augments {SourceDataLayer<WM, ?GroundMesh>}
 */
export class GroundMeshLayer extends SourceDataLayer {

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
     * A view of the data to display in this layer.
     * 
     * @readonly
     * @type {GroundMeshView}
     */
    #dataView;

    /**
     * Specifies the settings to apply to the ground mesh.
     * 
     * @readonly
     * @type {GroundMeshSettingsPaneController}
     */
    #settingsInput;

    /**
     * Creates a new layer for ground meshes.
     * 
     * @template {WindowMapper} WM The windows defined in the scene display.
     * @param {SceneContext<WM>} context A handle to the state of the scene.
     * @param {string} name The display name of this layer.
     * @param {number} [maxCacheSize] The maximum size of the data cache. Defaults to the value
     * provided in `context.config`.
     * @returns {GroundMeshLayer<WM>} The newly created data layer.
     */
    static create(context, name, maxCacheSize = undefined) {
        const dataView = GroundMeshView.create(context, maxCacheSize);

        return new GroundMeshLayer(context, name, dataView);
    }

    /**
     * Creates a new layer for ground meshes.
     * 
     * @param {SceneContext<WM>} context A handle to the state of the scene.
     * @param {string} name The display name of this layer.
     * @param {GroundMeshView} dataView A view of the data to display in the layer.
     */
    constructor(context, name, dataView) {
        super(context, name, dataView);

        const config = context.config;
        const settings = getSettings(config);

        this.#dataView = dataView;

        const settingsInputDom = document.createElement('div');
        {
            this.#settingsInput = GroundMeshSettingsPaneController.create(settingsInputDom, {
                inputtedData: settings,
            });
        }
        this.prefsElem = settingsInputDom;
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

        const { blender, showWireframe, opacity } = this.#settingsInput.outputData;
        if (blender != null) data.blender = blender;
        data.showWireframe = showWireframe;
        data.opacity = opacity;

        this.objects.add(data.asObject3D());
    }
}
