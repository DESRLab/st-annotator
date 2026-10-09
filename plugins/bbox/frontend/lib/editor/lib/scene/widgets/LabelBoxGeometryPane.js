import * as THREE from 'three';

import { PaneElementFactoryBuilder } from 'sta/services/editor/base';

/* eslint-disable max-len */
/**
 * @template T
 * @typedef {import('sta/common/utils').TypeUtils.Immutable<T>} Immutable
 */

/**
 * @template P
 * @typedef {import('sta/services/editor/base').PaneElementFactory<P>} PaneElementFactory
 */

/**
 * @typedef {import('sta/services/editor/base').PaneControllerDataTypes} PaneControllerDataTypes
 */

/**
 * @template {PaneControllerDataTypes} P
 * @typedef {import('sta/services/editor/base').PaneElementParams<P>} PaneElementParams
 */

/**
 * @template {PaneControllerDataTypes} P
 * @typedef {import('sta/services/editor/base').PaneControllerDataProcessor<P>} PaneControllerDataProcessor
 */

/**
 * @typedef {import('../../../../label/lib').BoxType} BoxType
 */

/**
 * @typedef {import('./InspectorPaneRenderTrigger').InspectorPaneRenderTrigger} InspectorPaneRenderTrigger
 */
/* eslint-enable max-len */

/**
 * @typedef {object} LabelBoxGeometryInputtedData
 * @property {BoxType} boxType Indicates the type of bounding box.
 * @property {Immutable<THREE.Vector3>} center The position vector of the bounding box in the
 * coordinate system of the database.
 * 
 * Note that this is edited in-place, so you should make a copy to avoid unintentional mutation.
 * @property {Immutable<THREE.Vector3>} size The size vector of the bounding box in the
 * coordinate system of the database.
 * 
 * Note that this is edited in-place, so you should make a copy to avoid unintentional mutation.
 * @property {number} angle The rotation of the bounding box about the vertical axis.
 */

/**
 * @typedef {object} LabelBoxGeometryPaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 * @property {boolean} disableTransform `true` if direct manipulation of the box's transform
 * through the pane is disabled; otherwise, the default behaviour of `disabled` is applied.
 */

/**
 * @typedef {object} LabelBoxGeometry
 * @property {BoxType} boxType Indicates the type of bounding box.
 * @property {Immutable<THREE.Vector3>} center The position vector of the bounding box in the
 * coordinate system of the database.
 * @property {Immutable<THREE.Vector3>} size The size vector of the bounding box in the
 * coordinate system of the database.
 * @property {number} angle The rotation of the bounding box about the vertical axis.
 */

/**
 * @typedef {{
 *     inputtedData: LabelBoxGeometryInputtedData;
 *     computedData: {};
 *     settings: LabelBoxGeometryPaneSettings;
 *     internalData: {};
 *     outputData: LabelBoxGeometry;
 * }} LabelBoxGeometryPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<
 * LabelBoxGeometryPaneControllerParams>} LabelBoxGeometryPaneElementParams
 */

/**
 * @type {InspectorPaneRenderTrigger}
 */
export const renderTriggers = {
    // Display text is changed
    'box-update': (e) => (e.propertyKey === 'boxType'
       || e.propertyKey === 'center' || e.propertyKey === 'size' || e.propertyKey === 'angle'),
};

/**
 * Namespace to setup {@link PaneElement}s for {@link LabelBoxGeometry}.
 */
export class LabelBoxGeometryPaneController {

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<LabelBoxGeometryPaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {
            boxType: 'cuboid',
            center: new THREE.Vector3(),
            size: new THREE.Vector3(1, 1, 1),
            angle: 0,
        },
        computedData: {},
        settings: {
            disabled: false,
            hidden: false,
            disableTransform: false,
        },
    };

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * {@link LabelBoxGeometryPaneElementParams}.
     * 
     * @returns {PaneElementFactory<LabelBoxGeometryPaneElementParams>}
     * The resulting pane element factory.
     */
    static elementFactory() {
        const builder = PaneElementFactoryBuilder.withoutEvents(this.FACTORY_PARAMS);

        return builder.sequential([
            builder.input(['inputtedData', 'boxType'], {
                options: ({ settings: { disabled, hidden } }) => ({
                    label: 'Type',
                    options: {
                        Cuboid: 'cuboid',
                        Cylinder: 'cylinder',
                    },
                    disabled: disabled,
                    hidden: hidden,
                }),
            }),
            builder.input(['inputtedData', 'center'], {
                options: ({ settings: { disabled, hidden, disableTransform } }) => ({
                    label: 'Center',
                    x: { step: 0.001 },
                    y: { step: 0.001 },
                    z: { step: 0.001 },
                    disabled: disabled || disableTransform,
                    hidden: hidden,
                }),
            }),
            builder.input(['inputtedData', 'size'], {
                options: ({ settings: { disabled, hidden, disableTransform } }) => ({
                    label: 'Size',
                    x: { min: 0.001, step: 0.001 },
                    y: { min: 0.001, step: 0.001 },
                    z: { min: 0.001, step: 0.001 },
                    disabled: disabled || disableTransform,
                    hidden: hidden,
                }),
            }),
            builder.input(['inputtedData', 'angle'], {
                options: ({ settings: { disabled, hidden, disableTransform } }) => ({
                    label: 'Angle',
                    min: -Math.PI / 2,
                    max: Math.PI / 2,
                    step: 0.001,
                    disabled: disabled || disableTransform,
                    hidden: hidden,
                }),
            }),
        ]);
    }

    /**
     * Data processor to pass into {@link PaneController}.
     * 
     * @type {PaneControllerDataProcessor<LabelBoxGeometryPaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => ({}),
        outputData: (paneParams) => {
            const { inputtedData: { boxType, center, size, angle } } = paneParams;

            return { boxType, center, size, angle };
        },
    };
}
