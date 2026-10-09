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
 * @typedef {import('../data').ReadonlyLabelBox} ReadonlyLabelBox
 */

/**
 * @typedef {import('../data').UUID} UUID
 */

/**
 * @typedef {import('./InspectorPaneRenderTrigger').InspectorPaneRenderTrigger} InspectorPaneRenderTrigger
 */
/* eslint-enable max-len */
/**
 * @typedef {object} LabelBoxSelectionPaneOptions
 * @property {string} [header='Bounding Box'] The text displayed in the header of this pane element.
 * @property {string} [nullText='(No box selected)'] The text to display for the option
 * representing no bounding box.
 */

/**
 * @typedef {object} LabelBoxSelectionInputtedData
 * @property {?UUID} boxId The unique identifier of the selected bounding box,
 * or `null` if none is selected.
 */

/**
 * @typedef {object} LabelBoxSelectionComputedData
 * @property {ReadonlyMap<UUID, ReadonlyLabelBox>} boxes Indexes each bounding box that
 * can be selected from by its unique identifier.
 */

/**
 * @typedef {object} LabelBoxSelectionPaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 */

/**
 * @typedef {object} LabelBoxSelectionSource
 * @property {ReadonlyMap<UUID, ReadonlyLabelBox>} boxes Indexes each bounding box that
 * can be selected from by its unique identifier.
 */

/**
 * @typedef {object} LabelBoxSelection
 * @property {?UUID} boxId The unique identifier of the selected bounding box;
 * `null` if none is selected or the one provided in
 * {@link LabelBoxSelectionInputtedData#boxId} is not found.
 */

/**
 * @typedef {{
 *     inputtedData: LabelBoxSelectionInputtedData;
 *     computedData: LabelBoxSelectionComputedData;
 *     settings: LabelBoxSelectionPaneSettings;
 *     internalData: ?LabelBoxSelectionSource;
 *     outputData: LabelBoxSelection;
 * }} LabelBoxSelectionPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<LabelBoxSelectionPaneControllerParams>
 * } LabelBoxSelectionPaneElementParams
 */

/**
 * @typedef {PaneControllerState<LabelBoxSelectionPaneControllerParams>
 * } LabelBoxSelectionPaneControllerState
 */

/**
 * @type {InspectorPaneRenderTrigger}
 */
export const renderTriggers = {
    // Number of items is changed
    'box-add': true,
    'box-delete': true,
    'bulk-add': true,
    'bulk-delete': true,

    // Display text is changed
    'box-resolveId': true,
    'box-update': (e) => (e.propertyKey === 'id'
       || e.propertyKey === 'entityId' || e.propertyKey === 'perceivedClassId'),
    'class-update': (e) => (e.propertyKey === 'name'),
    'track-update': (e) => (e.propertyKey === 'gtClassId'),
};

/**
 * Represents a UI to select a {@link ReadonlyLabelBox}.
 * 
 * @augments PaneController<LabelBoxSelectionPaneControllerParams>
 */
export class LabelBoxSelectionPaneController extends PaneController {

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<LabelBoxSelectionPaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {
            boxId: null,
        },
        computedData: {
            boxes: new Map(),
        },
        settings: {
            disabled: false,
            hidden: false,
        },
    };

    /**
     * Gets the text to display for an item.
     * 
     * @param {ReadonlyLabelBox} item The item for which to obtain the text.
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
     * {@link LabelBoxSelectionPaneElementParams}.
     * 
     * @param {LabelBoxSelectionPaneOptions} options Static options to apply to each
     * pane element constructed by the factory.
     * @returns {PaneElementFactory<LabelBoxSelectionPaneElementParams>}
     * The resulting pane element factory.
     */
    static elementFactory(options = {}) {
        const header = options.header ?? 'Bounding Box';
        const nullText = options.nullText ?? '(No box selected)';

        const builder = PaneElementFactoryBuilder.withoutEvents(this.FACTORY_PARAMS);

        return builder.sequential([
            builder.list(['inputtedData', 'boxId'], {
                options: ({ computedData: { boxes }, settings: { disabled, hidden } }) => {
                    const nullOption = { text: nullText, value: null };
                    const otherOptions = Array.from(boxes.values(), (box) => ({
                        text: this.getItemText(box),
                        value: box.id,
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
     * @type {PaneControllerDataProcessor<LabelBoxSelectionPaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => ({
            boxes: internalData?.boxes ?? new Map(),
        }),
        outputData: (paneParams) => {
            const { inputtedData: { boxId }, computedData: { boxes } } = paneParams;

            let safeBoxId = boxId;
            if (boxId != null && !boxes.has(boxId)) {
                safeBoxId = null;
            }

            return { boxId: safeBoxId };
        },
    };

    /**
     * Creates a new UI to select a {@link ReadonlyLabelBox}.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {Partial<LabelBoxSelectionPaneControllerState>} initialState
     * The initial state to set.
     * @returns {LabelBoxSelectionPaneController} The resulting controller.
     */
    static create(dom, initialState = {}) {
        return new LabelBoxSelectionPaneController(
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
