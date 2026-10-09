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
 * @typedef {import('../data').ReadonlyLabelSelection} ReadonlyLabelSelection
 */

/**
 * @typedef {import('../data').UUID} UUID
 */

/**
 * @typedef {import('./InspectorPaneRenderTrigger').InspectorPaneRenderTrigger} InspectorPaneRenderTrigger
 */
/* eslint-enable max-len */
/**
 * @typedef {object} LabelSelectionSelectionPaneOptions
 * @property {string} [header='Selection'] The text displayed in the header of this pane element.
 * @property {string} [nullText='(No selection selected)'] The text to display for the option
 * representing no selection.
 */

/**
 * @typedef {object} LabelSelectionSelectionInputtedData
 * @property {?UUID} selectionId The unique identifier of the selected selection,
 * or `null` if none is selected.
 */

/**
 * @typedef {object} LabelSelectionSelectionComputedData
 * @property {ReadonlyMap<UUID, ReadonlyLabelSelection>} selections Indexes each selection that
 * can be selected from by its unique identifier.
 */

/**
 * @typedef {object} LabelSelectionSelectionPaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 */

/**
 * @typedef {object} LabelSelectionSelectionSource
 * @property {ReadonlyMap<UUID, ReadonlyLabelSelection>} selections Indexes each selection that
 * can be selected from by its unique identifier.
 */

/**
 * @typedef {object} LabelSelectionSelection
 * @property {?UUID} selectionId The unique identifier of the selected selection;
 * `null` if none is selected or the one provided in
 * {@link LabelSelectionSelectionInputtedData#selectionId} is not found.
 */

/**
 * @typedef {{
 *     inputtedData: LabelSelectionSelectionInputtedData;
 *     computedData: LabelSelectionSelectionComputedData;
 *     settings: LabelSelectionSelectionPaneSettings;
 *     internalData: ?LabelSelectionSelectionSource;
 *     outputData: LabelSelectionSelection;
 * }} LabelSelectionSelectionPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<LabelSelectionSelectionPaneControllerParams>
 * } LabelSelectionSelectionPaneElementParams
 */

/**
 * @typedef {PaneControllerState<LabelSelectionSelectionPaneControllerParams>
 * } LabelSelectionSelectionPaneControllerState
 */

/**
 * @type {InspectorPaneRenderTrigger}
 */
export const renderTriggers = {
    // Number of items is changed
    'selection-add': true,
    'selection-delete': true,
    'bulk-add': true,
    'bulk-delete': true,

    // Display text is changed
    'selection-resolveId': true,
    'selection-update': (e) => (e.propertyKey === 'id'
       || e.propertyKey === 'entityId' || e.propertyKey === 'perceivedClassId'),
    'class-update': (e) => (e.propertyKey === 'name'),
    'instance-update': (e) => (e.propertyKey === 'gtClassId'),
};

/**
 * Represents a UI to select a {@link ReadonlyLabelSelection}.
 * 
 * @augments PaneController<LabelSelectionSelectionPaneControllerParams>
 */
export class LabelSelectionSelectionPaneController extends PaneController {

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<LabelSelectionSelectionPaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {
            selectionId: null,
        },
        computedData: {
            selections: new Map(),
        },
        settings: {
            disabled: false,
            hidden: false,
        },
    };

    /**
     * Gets the text to display for an item.
     * 
     * @param {ReadonlyLabelSelection} item The item for which to obtain the text.
     * @returns {string} The requested text.
     */
    static getItemText(item) {
        const { id, perceivedClass } = item;
        const shortId = new ShortUUID(id);

        if (perceivedClass == null) {
            const { gtClass } = item;
            if (gtClass == null) return `B{${shortId}} <Unclassified>`;

            return `B{${shortId}} <Inherited>`;
        }

        return `B{${shortId}} [${perceivedClass.name}]`;
    }

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * {@link LabelSelectionSelectionPaneElementParams}.
     * 
     * @param {LabelSelectionSelectionPaneOptions} options Static options to apply to each
     * pane element constructed by the factory.
     * @returns {PaneElementFactory<LabelSelectionSelectionPaneElementParams>}
     * The resulting pane element factory.
     */
    static elementFactory(options = {}) {
        const header = options.header ?? 'Selection';
        const nullText = options.nullText ?? '(No selection selected)';

        const builder = PaneElementFactoryBuilder.withoutEvents(this.FACTORY_PARAMS);

        return builder.sequential([
            builder.list(['inputtedData', 'selectionId'], {
                options: ({
                    computedData: { selections },
                    settings: { disabled, hidden },
                }) => {
                    const nullOption = { text: nullText, value: null };
                    const otherOptions = Array.from(selections.values(), (selection) => ({
                        text: this.getItemText(selection),
                        value: selection.id,
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
     * @type {PaneControllerDataProcessor<LabelSelectionSelectionPaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => ({
            selections: internalData?.selections ?? new Map(),
        }),
        outputData: (paneParams) => {
            const {
                inputtedData: { selectionId },
                computedData: { selections },
            } = paneParams;

            let safeBoxId = selectionId;
            if (selectionId != null && !selections.has(selectionId)) {
                safeBoxId = null;
            }

            return { selectionId: safeBoxId };
        },
    };

    /**
     * Creates a new UI to select a {@link ReadonlyLabelSelection}.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {Partial<LabelSelectionSelectionPaneControllerState>} initialState
     * The initial state to set.
     * @returns {LabelSelectionSelectionPaneController} The resulting controller.
     */
    static create(dom, initialState = {}) {
        return new LabelSelectionSelectionPaneController(
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
