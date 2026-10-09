import * as THREE from 'three';
import { Pane } from 'tweakpane';

import { PaneController, PaneElementFactoryBuilder } from '../../../base';

/**
 * @template T
 * @typedef {import('../../../../../../common/lib/utils').TypeUtils.Immutable<T>} Immutable
 */

/**
 * @template P
 * @typedef {import('../../../base').PaneElementFactory<P>} PaneElementFactory
 */

/**
 * @typedef {import('../../../base').PaneControllerDataTypes} PaneControllerDataTypes
 */

/**
 * @template {PaneControllerDataTypes} P
 * @typedef {import('../../../base').PaneElementParams<P>} PaneElementParams
 */

/**
 * @template {PaneControllerDataTypes} P
 * @typedef {import('../../../base').PaneControllerDataProcessor<P>} PaneControllerDataProcessor
 */

/**
 * @template {PaneControllerDataTypes} P
 * @typedef {import('../../../base').PaneControllerState<P>} PaneControllerState
 */

/**
 * @typedef {object} TransformInputtedData
 * @property {Immutable<THREE.Vector3>} position The `three.js` position.
 * 
 * Note that this is edited in-place, so you should make a copy to avoid unintentional mutation.
 * @property {Immutable<THREE.Euler>} rotation The `three.js` rotation.
 * 
 * Note that this is edited in-place, so you should make a copy to avoid unintentional mutation.
 * @property {Immutable<THREE.Vector3>} scale The `three.js` scale.
 * 
 * Note that this is edited in-place, so you should make a copy to avoid unintentional mutation.
 */

/**
 * @typedef {object} TransformPaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 */

/**
 * @typedef {object} Transform
 * @property {Immutable<THREE.Vector3>} position The `three.js` position.
 * @property {Immutable<THREE.Euler>} rotation The `three.js` rotation.
 * @property {Immutable<THREE.Vector3>} scale The `three.js` scale.
 */

/**
 * @typedef {{
 *     inputtedData: TransformInputtedData;
 *     computedData: {};
 *     settings: TransformPaneSettings;
 *     internalData: {};
 *     outputData: Transform;
 * }} TransformPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<TransformPaneControllerParams>} TransformPaneElementParams
 */

/**
 * @typedef {PaneControllerState<TransformPaneControllerParams>} TransformPaneControllerState
 */

/**
 * Represents a UI to configure a {@link Transform}.
 * 
 * @augments PaneController<TransformPaneControllerParams>
 */
export class TransformPaneController extends PaneController {

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<TransformPaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {
            position: new THREE.Vector3(),
            rotation: new THREE.Euler(),
            scale: new THREE.Vector3(1, 1, 1),
        },
        computedData: {},
        settings: {
            disabled: false,
            hidden: false,
        },
    };

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * {@link TransformPaneElementParams}.
     * 
     * @returns {PaneElementFactory<TransformPaneElementParams>}
     * The resulting pane element factory.
     */
    static elementFactory() {
        const builder = PaneElementFactoryBuilder.withoutEvents(this.FACTORY_PARAMS);

        return builder.sequential([
            builder.input(['inputtedData', 'position'], {
                options: ({ settings: { disabled, hidden } }) => ({
                    label: 'Position',
                    disabled: disabled,
                    hidden: hidden,
                }),
            }),
            builder.input(['inputtedData', 'rotation'], {
                options: ({ settings: { disabled, hidden } }) => ({
                    label: 'Rotation',
                    disabled: disabled,
                    hidden: hidden,
                }),
            }),
            builder.input(['inputtedData', 'scale'], {
                options: ({ settings: { disabled, hidden } }) => ({
                    label: 'Scale',
                    disabled: disabled,
                    hidden: hidden,
                }),
            }),
        ]);
    }

    /**
     * Data processor to pass into {@link PaneController}.
     * 
     * @type {PaneControllerDataProcessor<TransformPaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => ({}),
        outputData: (paneParams) => {
            const { inputtedData: { position, rotation, scale } } = paneParams;

            return { position, rotation, scale };
        },
    };

    /**
     * Creates a new UI to configure a {@link Transform}.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {Partial<TransformPaneControllerState>} initialState
     * The initial state to set.
     * @returns {TransformPaneControllerState} The resulting controller.
     */
    static create(dom, initialState = {}) {
        return new TransformPaneController(
            () => new Pane({ container: dom }),
            this.elementFactory(),
            this.DATA_PROCESSOR,
            {
                inputtedData: initialState.inputtedData ?? this.FACTORY_PARAMS.inputtedData,
                internalData: initialState.internalData ?? {},
                settings: initialState.settings ?? this.FACTORY_PARAMS.settings,
            },
        );
    }
}
