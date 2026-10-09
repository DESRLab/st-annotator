import { Pane } from 'tweakpane';

import { PaneController, PaneElementFactoryBuilder } from 'sta/services/editor/base';

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
 * @typedef {import('../data').ReadonlyLabelClass} ReadonlyLabelClass
 */

/**
 * @typedef {import('./InspectorPaneRenderTrigger').InspectorPaneRenderTrigger} InspectorPaneRenderTrigger
 */
/* eslint-enable max-len */
/**
 * @typedef {object} LabelClassSelectionPaneOptions
 * @property {string} [header='Object Class'] The text displayed in the header of this pane element.
 * @property {string} [nullText='(No class selected)'] The text to display for the option
 * representing no object class.
 */

/**
 * @typedef {object} LabelClassSelectionInputtedData
 * @property {?number} classId The unique identifier of the selected object class,
 * or `null` if none is selected.
 */

/**
 * @typedef {object} LabelClassSelectionComputedData
 * @property {ReadonlyMap<number, ReadonlyLabelClass>} classes Indexes each object class that
 * can be selected from by its unique identifier.
 */

/**
 * @typedef {object} LabelClassSelectionPaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 */

/**
 * @typedef {object} LabelClassSelectionSource
 * @property {ReadonlyMap<number, ReadonlyLabelClass>} classes Indexes each object class that
 * can be selected from by its unique identifier.
 */

/**
 * @typedef {object} LabelClassSelection
 * @property {?number} classId The unique identifier of the selected object class;
 * `null` if none is selected or the one provided in
 * {@link LabelClassSelectionInputtedData#classId} is not found.
 */

/**
 * @typedef {{
 *     inputtedData: LabelClassSelectionInputtedData;
 *     computedData: LabelClassSelectionComputedData;
 *     settings: LabelClassSelectionPaneSettings;
 *     internalData: ?LabelClassSelectionSource;
 *     outputData: LabelClassSelection;
 * }} LabelClassSelectionPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<LabelClassSelectionPaneControllerParams
 * >} LabelClassSelectionPaneElementParams
 */

/**
 * @typedef {PaneControllerState<LabelClassSelectionPaneControllerParams>
 * } LabelClassSelectionPaneControllerState
 */

/**
 * @type {InspectorPaneRenderTrigger}
 */
export const renderTriggers = {
    // Number of items is changed
    'class-add': true,
    'class-delete': true,
    'bulk-add': true,
    'bulk-delete': true,

    // Display text is changed
    'class-update': (e) => (e.propertyKey === 'name'),
};

/**
 * Represents a UI to select a {@link ReadonlyLabelClass}.
 * 
 * @augments PaneController<LabelClassSelectionPaneControllerParams>
 */
export class LabelClassSelectionPaneController extends PaneController {

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<LabelClassSelectionPaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {
            classId: null,
        },
        computedData: {
            classes: new Map(),
        },
        settings: {
            disabled: false,
            hidden: false,
        },
    };

    /**
     * Gets the text to display for an item.
     * 
     * @param {ReadonlyLabelClass} item The item for which to obtain the text.
     * @returns {string} The requested text.
     */
    static #getItemText(item) {
        return item.name;
    }

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * {@link LabelClassSelectionPaneElementParams}.
     * 
     * @param {LabelClassSelectionPaneOptions} options Static options to apply to each
     * pane element constructed by the factory.
     * @returns {PaneElementFactory<LabelClassSelectionPaneElementParams>}
     * The resulting pane element factory.
     */
    static elementFactory(options = {}) {
        const header = options.header ?? 'Object Class';
        const nullText = options.nullText ?? '(No class selected)';

        const builder = PaneElementFactoryBuilder.withoutEvents(this.FACTORY_PARAMS);

        return builder.sequential([
            builder.list(['inputtedData', 'classId'], {
                options: ({ computedData: { classes }, settings: { disabled, hidden } }) => {
                    const nullOption = { text: nullText, value: null };
                    const otherOptions = Array.from(classes.values(), (c) => ({
                        text: this.#getItemText(c),
                        value: c.id,
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
     * @type {PaneControllerDataProcessor<LabelClassSelectionPaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => ({
            classes: internalData?.classes ?? new Map(),
        }),
        outputData: (paneParams) => {
            const { inputtedData: { classId }, computedData: { classes } } = paneParams;

            let safeClassId = classId;
            if (classId != null && !classes.has(classId)) {
                safeClassId = null;
            }

            return { classId: safeClassId };
        },
    };

    /**
     * Creates a new UI to select a {@link ReadonlyLabelClass}.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {Partial<LabelClassSelectionPaneControllerState>} initialState
     * The initial state to set.
     * @returns {LabelClassSelectionPaneController} The resulting controller.
     */
    static create(dom, initialState = {}) {
        return new LabelClassSelectionPaneController(
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
