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
 * @typedef {import('../data').ReadonlyLabelTrack} ReadonlyLabelTrack
 */

/**
 * @typedef {import('../data').ReadonlyBBoxIndex} ReadonlyBBoxIndex
 */

/**
 * @typedef {import('../data').UUID} UUID
 */

/**
 * @typedef {import('./InspectorPaneRenderTrigger').InspectorPaneRenderTrigger} InspectorPaneRenderTrigger
 */
/* eslint-enable max-len */
/**
 * @typedef {object} LabelTrackSelectionPaneOptions
 * @property {string} [header='Object Track'] The text displayed in the header of this pane element.
 * @property {string} [nullText='(No track selected)'] The text to display for the option
 * representing no object track.
 */

/**
 * @typedef {object} LabelTrackSelectionInputtedData
 * @property {?UUID} trackId The unique identifier of the selected object track,
 * or `null` if none is selected.
 */

/**
 * @typedef {object} LabelTrackSelectionComputedData
 * @property {ReadonlyMap<UUID, ReadonlyLabelTrack>} tracks Indexes each object track that
 * can be selected from by its unique identifier.
 */

/**
 * @typedef {object} LabelTrackSelectionPaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 */

/**
 * @typedef {object} LabelTrackSelectionSource
 * @property {ReadonlyMap<UUID, ReadonlyLabelTrack>} tracks Indexes each object track that
 * can be selected from by its unique identifier.
 */

/**
 * @typedef {object} LabelTrackSelection
 * @property {?UUID} trackId The unique identifier of the selected object track;
 * `null` if none is selected or the one provided in
 * {@link LabelTrackSelectionInputtedData#trackId} is not found.
 */

/**
 * @typedef {{
 *     inputtedData: LabelTrackSelectionInputtedData;
 *     computedData: LabelTrackSelectionComputedData;
 *     settings: LabelTrackSelectionPaneSettings;
 *     internalData: ?LabelTrackSelectionSource;
 *     outputData: LabelTrackSelection;
 * }} LabelTrackSelectionPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<LabelTrackSelectionPaneControllerParams>
 * } LabelTrackSelectionPaneElementParams
 */

/**
 * @typedef {PaneControllerState<LabelTrackSelectionPaneControllerParams>
 * } LabelTrackSelectionPaneControllerState
 */

/**
 * @type {InspectorPaneRenderTrigger}
 */
export const renderTriggers = {
    // Number of items is changed
    'track-add': true,
    'track-delete': true,
    'bulk-add': true,
    'bulk-delete': true,

    // Display text is changed
    'track-resolveId': true,
    'track-update': (e) => (e.propertyKey === 'id' || e.propertyKey === 'gtClassId'),
    'class-update': (e) => (e.propertyKey === 'name'),
};

/**
 * Represents a UI to select a {@link ReadonlyLabelTrack}.
 * 
 * @augments PaneController<LabelTrackSelectionPaneControllerParams>
 */
export class LabelTrackSelectionPaneController extends PaneController {

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<LabelTrackSelectionPaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {
            trackId: null,
        },
        computedData: {
            tracks: new Map(),
        },
        settings: {
            disabled: false,
            hidden: false,
        },
    };

    /**
     * Gets the text to display for an item.
     * 
     * @param {ReadonlyLabelTrack} item The item for which to obtain the text.
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
     * {@link LabelTrackSelectionPaneElementParams}.
     * 
     * @param {LabelTrackSelectionPaneOptions} options Static options to apply to each
     * pane element constructed by the factory.
     * @returns {PaneElementFactory<LabelTrackSelectionPaneElementParams>}
     * The resulting pane element factory.
     */
    static elementFactory(options = {}) {
        const header = options.header ?? 'Object Track';
        const nullText = options.nullText ?? '(No track selected)';

        const builder = PaneElementFactoryBuilder.withoutEvents(this.FACTORY_PARAMS);

        return builder.sequential([
            builder.list(['inputtedData', 'trackId'], {
                options: ({ computedData: { tracks }, settings: { disabled, hidden } }) => {
                    const nullOption = { text: nullText, value: null };
                    const otherOptions = Array.from(tracks.values(), (track) => ({
                        text: this.getItemText(track),
                        value: track.id,
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
     * @type {PaneControllerDataProcessor<LabelTrackSelectionPaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => ({
            tracks: internalData?.tracks ?? new Map(),
        }),
        outputData: (paneParams) => {
            const { inputtedData: { trackId }, computedData: { tracks } } = paneParams;

            let safeTrackId = trackId;
            if (trackId != null && !tracks.has(trackId)) {
                safeTrackId = null;
            }

            return { trackId: safeTrackId };
        },
    };

    /**
     * Creates a new UI to select a {@link ReadonlyLabelTrack}.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {Partial<LabelTrackSelectionPaneControllerState>} initialState
     * The initial state to set.
     * @returns {LabelTrackSelectionPaneController} The resulting controller.
     */
    static create(dom, initialState = {}) {
        return new LabelTrackSelectionPaneController(
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
