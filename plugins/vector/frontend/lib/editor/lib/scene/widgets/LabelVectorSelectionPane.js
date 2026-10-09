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
 * @typedef {import('../data').ReadonlyLabelVector} ReadonlyLabelVector
 */

/**
 * @typedef {import('../data').UUID} UUID
 */

/**
 * @typedef {import('./InspectorPaneRenderTrigger').InspectorPaneRenderTrigger} InspectorPaneRenderTrigger
 */
/* eslint-enable max-len */

/**
 * @typedef {object} LabelVectorSelectionPaneOptions
 * @property {string} [header='Vector'] The text displayed in the header of this
 * pane element.
 * @property {string} [nullText='(No vector selected)'] The text to display for the option
 * representing no vector. 
 */

/**
 * @typedef {object} LabelVectorSelectionInputtedData
 * @property {?UUID} vectorId The unique identifier of the selected vector object,
 * or `null` if none is selected.
 */

/**
 * @typedef {object} LabelVectorSelectionComputedData
 * @property {ReadonlyMap<UUID, ReadonlyLabelVector>} vectors Indexes each vector object that
 * can be selected from by its unique identifier.
 */

/**
 * @typedef {object} LabelVectorSelectionPaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 */

/**
 * @typedef {object} LabelVectorSelectionSource
 * @property {ReadonlyMap<UUID, ReadonlyLabelVector>} vectors Indexes each vector object that
 * can be selected from by its unique identifier. 
 */

/**
 * @typedef {object} LabelVectorSelection 
 * @property {?UUID} vectorId The unitque identifier of the selected vector object;
 * `null` if none is selected or the one provided in.
 * 
 * {@link LabelVectorSelectionInputtedData#vectorId} is not found.
 */

/**
 * @typedef {{
 *     inputtedData: LabelVectorSelectionInputtedData;
 *     computedData: LabelVectorSelectionComputedData;
 *     settings: LabelVectorSelectionPaneSettings;
 *     internalData: ?LabelVectorSelectionSource;
 *     outputData: LabelVectorSelection;
 * }} LabelVectorSelectionPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<LabelVectorSelectionPaneControllerParams>
 * } LabelVectorSelectionPaneElementParams 
 */

/**
 * @typedef {PaneControllerState<LabelVectorSelectionPaneControllerParams>
 * } LabelVectorSelectionPaneControllerState 
 */

/**
 * @type {InspectorPaneRenderTrigger}
 */
export const renderTriggers = {
    'vector-add': true,
    'vector-delete': true,
    'bulk-add': true,
    'bulk-delete': true,

    'vector-resolveId': true,
    'vector-update': (e) => (e.propertyKey === 'id' || e.propertyKey === 'gtClassId'),
    'class-update': (e) => (e.propertyKey === 'name'),
};

/**
 * Represents a UI to select a {@link ReadonlyLabelVector}.
 * 
 * @augments PaneController<LabelVectorSelectionPaneControllerParams>
 */
export class LabelVectorSelectionPaneController extends PaneController {

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<LabelVectorSelectionPaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {
            vectorId: null,
        },
        computedData: {
            vectors: new Map(),
        },
        settings: {
            disabled: false,
            hidden: false,
        },
    };

    /**
     * Gets the text to display for an item.
     * 
     * @param {ReadonlyLabelVector} item The item for which to obtain the text.
     * @returns {string} The requested text.
     */
    static getItemText(item) {
        const { id, gtClass } = item;
        const shortId = new ShortUUID(id);

        if (gtClass == null) return `P{${shortId}} <Unclassified>`;

        return `P{${shortId}} [${gtClass.name}]`;
    }

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * {@link LabelVectorSelectionPaneElementParams}
     * 
     * @param {LabelVectorSelectionPaneOptions} options Static options to apply to each
     * pane element constructed by the factory.
     * @returns {PaneElementFactory<LabelVectorSelectionPaneElementParams>}
     * The resulting pane element factory.
     */
    static elementFactory(options = {}) {
        const header = options.header ?? 'Vector';
        const nullText = options.nullText ?? '(No vector selected)';

        const builder = PaneElementFactoryBuilder.withoutEvents(this.FACTORY_PARAMS);

        return builder.sequential([
            builder.list(['inputtedData', 'vectorId'], {
                options: ({ computedData: { vectors }, settings: { disabled, hidden } }) => {
                    const nullOption = { text: nullText, value: null };
                    const otherOptions = Array.from(vectors.values(), (vector) => ({
                        text: this.getItemText(vector),
                        value: vector.id,
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
     * @type {PaneControllerDataProcessor<LabelVectorSelectionPaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => ({
            vectors: internalData?.vectors ?? new Map(),
        }),
        outputData: (paneParams) => {
            const { inputtedData: { vectorId }, computedData: { vectors } } = paneParams;

            let safeVectorId = vectorId;
            if (vectorId != null && !vectors.has(vectorId)) {
                safeVectorId = null;
            }

            return { vectorId: safeVectorId };
        },
    };

    /**
     * Creates a new UI to select a {@link ReadonlyLabelVector}
     * 
     * @param {HTMLElement} dom The DOM element that contains the pane.
     * @param {Partial<LabelVectorSelectionPaneControllerState>} initialState
     * The initial state to set.
     * @returns {LabelVectorSelectionPaneController} The resulting controller.
     */
    static create(dom, initialState = {}) {
        return new LabelVectorSelectionPaneController(
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
