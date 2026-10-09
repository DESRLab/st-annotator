import { Pane } from 'tweakpane';

import { PaneController, PaneElementFactoryBuilder } from 'sta/services/editor/base';

import { ShortUUID } from '../data';

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
 * @template {PaneControllerDataTypes} P
 * @typedef {import('sta/services/editor/base').PaneControllerState<P>} PaneControllerState
 */

/**
 * @typedef {import('../data').ReadonlyLabelInstance} ReadonlyLabelInstance
 */

/**
 * @typedef {import('../data').ReadonlySegmentationIndex} ReadonlySegmentationIndex
 */

/**
 * @typedef {import('../data').UUID} UUID
 */

/**
 * @typedef {import('./InspectorPaneRenderTrigger').InspectorPaneRenderTrigger} InspectorPaneRenderTrigger
 */

/**
 * @typedef {object} LabelInstanceSelectionPaneOptions
 * @property {string} [header='Object Instance'] The text displayed in the header of this pane element.
 * @property {string} [nullText='(No instance selected)'] The text to display for the option
 * representing no object instance.
 */

/**
 * @typedef {object} LabelInstanceSelectionInputtedData
 * @property {?UUID} instanceId The unique identifier of the selected object instance,
 * or `null` if none is selected.
 */

/**
 * @typedef {object} LabelInstanceSelectionComputedData
 * @property {ReadonlyMap<UUID, ReadonlyLabelInstance>} instances Indexes each object instance that
 * can be selected from by its unique identifier.
 */

/**
 * @typedef {object} LabelInstanceSelectionPaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 */

/**
 * @typedef {object} LabelInstanceSelectionSource
 * @property {ReadonlyMap<UUID, ReadonlyLabelInstance>} instances Indexes each object instance that
 * can be selected from by its unique identifier.
 */

/**
 * @typedef {object} LabelInstanceSelection
 * @property {?UUID} instanceId The unique identifier of the selected object instance;
 * `null` if none is selected or the one provided in
 * {@link LabelInstanceSelectionInputtedData#instanceId} is not found.
 */

/**
 * @typedef {{
 *     inputtedData: LabelInstanceSelectionInputtedData;
 *     computedData: LabelInstanceSelectionComputedData;
 *     settings: LabelInstanceSelectionPaneSettings;
 *     internalData: ?LabelInstanceSelectionSource;
 *     outputData: LabelInstanceSelection;
 * }} LabelInstanceSelectionPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<LabelInstanceSelectionPaneControllerParams>
 * } LabelInstanceSelectionPaneElementParams
 */

/**
 * @typedef {PaneControllerState<LabelInstanceSelectionPaneControllerParams>
 * } LabelInstanceSelectionPaneControllerState
 */
/* eslint-enable max-len */

/**
 * @type {InspectorPaneRenderTrigger}
 */
export const renderTriggers = {
    // Number of items is changed
    'instance-add': true,
    'instance-delete': true,
    'bulk-add': true,
    'bulk-delete': true,

    // Display text is changed
    'instance-resolveId': true,
    'instance-update': (e) => (e.propertyKey === 'id' || e.propertyKey === 'gtClassId'),
    'class-update': (e) => (e.propertyKey === 'name'),
};

/**
 * Represents a UI to select a {@link ReadonlyLabelInstance}.
 * 
 * @augments PaneController<LabelInstanceSelectionPaneControllerParams>
 */
export class LabelInstanceSelectionPaneController extends PaneController {

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<LabelInstanceSelectionPaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {
            instanceId: null,
        },
        computedData: {
            instances: new Map(),
        },
        settings: {
            disabled: false,
            hidden: false,
        },
    };

    /**
     * Gets the text to display for an item.
     * 
     * @param {ReadonlyLabelInstance} item The item for which to obtain the text.
     * @returns {string} The requested text.
     */
    static getItemText(item) {
        const { id, gtClass } = item;
        const shortId = new ShortUUID(id);

        if (gtClass == null) return `T{${shortId}} <Unclassified>`;

        return `T{${shortId}} [${gtClass.name}]`;
    }

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * {@link LabelInstanceSelectionPaneElementParams}.
     * 
     * @param {LabelInstanceSelectionPaneOptions} options Static options to apply to each
     * pane element constructed by the factory.
     * @returns {PaneElementFactory<LabelInstanceSelectionPaneElementParams>}
     * The resulting pane element factory.
     */
    static elementFactory(options = {}) {
        const header = options.header ?? 'Object Instance';
        const nullText = options.nullText ?? '(No instance selected)';

        const builder = PaneElementFactoryBuilder.withoutEvents(this.FACTORY_PARAMS);

        return builder.sequential([
            builder.list(['inputtedData', 'instanceId'], {
                options: ({ computedData: { instances }, settings: { disabled, hidden } }) => {
                    const nullOption = { text: nullText, value: null };
                    const otherOptions = Array.from(instances.values(), (instance) => ({
                        text: this.getItemText(instance),
                        value: instance.id,
                    }));

                    return {
                        label: header,
                        options: [nullOption, ...otherOptions],
                        disabled: disabled,
                        hidden: hidden,
                    };
                },
            }),
        ]);
    }

    /**
     * Data processor to pass into {@link PaneController}.
     * 
     * @type {PaneControllerDataProcessor<LabelInstanceSelectionPaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => ({
            instances: internalData?.instances ?? new Map(),
        }),
        outputData: (paneParams) => {
            const { inputtedData: { instanceId }, computedData: { instances } } = paneParams;

            let safeTrackId = instanceId;
            if (instanceId != null && !instances.has(instanceId)) {
                safeTrackId = null;
            }

            return { instanceId: safeTrackId };
        },
    };

    /**
     * Creates a new UI to select a {@link ReadonlyLabelInstance}.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {Partial<LabelInstanceSelectionPaneControllerState>} initialState
     * The initial state to set.
     * @returns {LabelInstanceSelectionPaneController} The resulting controller.
     */
    static create(dom, initialState = {}) {
        return new LabelInstanceSelectionPaneController(
            () => new Pane({ container: dom }),
            this.elementFactory(),
            this.DATA_PROCESSOR,
            {
                inputtedData: initialState.inputtedData ?? this.FACTORY_PARAMS.inputtedData,
                internalData: initialState.internalData ?? null,
                settings: initialState.settings ?? this.FACTORY_PARAMS.settings,
            },
        );
    }
}
