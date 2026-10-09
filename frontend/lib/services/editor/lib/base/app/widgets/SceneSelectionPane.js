import { Pane } from 'tweakpane';

import { PaneController, PaneElementFactoryBuilder } from '../../widgets';

/**
 * @template T
 * @typedef {import('../../../../../../common/lib/utils').TypeUtils.Immutable<T>} Immutable
 */

/**
 * @typedef {import('../../../../../project/lib').TaskState} TaskState
 */

/**
 * @typedef {import('../../../../../label/lib').LabelsetBranchState} LabelsetBranchState
 */

/**
 * @typedef {import('../../../../../source/lib').SourceGroupState} SourceGroupState
 */

/**
 * @typedef {import('../../labelset').EditableBranch} EditableBranch
 */

/**
 * @template P
 * @template {{}} E
 * @typedef {import('../../widgets').PaneElementFactory<P, E>} PaneElementFactory
 */

/**
 * @typedef {import('../../widgets').PaneControllerDataTypes} PaneControllerDataTypes
 */

/**
 * @template {PaneControllerDataTypes} P
 * @typedef {import('../../widgets').PaneElementParams<P>} PaneElementParams
 */

/**
 * @template {PaneControllerDataTypes} P
 * @typedef {import('../../widgets').PaneControllerDataProcessor<P>} PaneControllerDataProcessor
 */

/**
 * @template {PaneControllerDataTypes} P
 * @typedef {import('../../widgets').PaneControllerState<P>} PaneControllerState
 */
/**
 * @typedef {object} SceneSelectionInputtedData
 * @property {?TaskState} task The selected task.
 * @property {?SourceGroupState} sourceGroup The unique identifier of the selected source group.
 * @property {?EditableBranch} labelBranch The unique identifier of the selected label branch.
 * @property {{ completed: number, total: number }} frameProgress The completion status
 * of the available frames.
 */

/**
 * @typedef {object} SceneSelectionComputedData
 * @property {ReadonlyArray<TaskState>} tasks The name of each task that can be
 * selected from.
 * @property {ReadonlyArray<SourceGroupState>} sourceGroups Each source group that can
 * be selected from.
 * @property {ReadonlyArray<EditableBranch>} labelBranches Each label branch that can
 * be selected from.
 * @property {HTMLElement} historyElem An element containing the history data.
 * @property {boolean} isSaving `true` if the labelset is currently saving changes;
 * otherwise, `false`.
 */

/**
 * @typedef {object} SceneSelectionPaneSettings
 * @property {boolean} disabled `true` if each sub-element is disabled; otherwise, `false`.
 * @property {boolean} hidden `true` if each sub-element is hidden; otherwise, `false`.
 * @property {boolean} disableSave `true` if the save button is disabled; otherwise,
 * the default behaviour of `disabled` is applied.
 */

/**
 * @typedef {object} SceneSelectionSource
 * @property {ReadonlyArray<TaskState>} tasks The name of each task that can be
 * selected from.
 * @property {ReadonlyArray<SourceGroupState>} sourceGroups Each source group that can
 * be selected from.
 * @property {ReadonlyArray<EditableBranch>} labelBranches Each label branch that can
 * be selected from.
 * @property {HTMLElement} historyElem An element containing the history data.
 * @property {boolean} isSaving `true` if the labelset is currently saving changes;
 * otherwise, `false`.
 */

/**
 * @typedef {object} SceneSelectionState
 * @property {?TaskState} task The selected task.
 * @property {?SourceGroupState} sourceGroup The unique identifier of the selected source group.
 * @property {?EditableBranch} labelBranch The unique identifier of the selected label branch.
 */

/**
 * @typedef {{
 *     inputtedData: SceneSelectionInputtedData;
 *     computedData: SceneSelectionComputedData;
 *     settings: SceneSelectionPaneSettings;
 *     internalData: ?SceneSelectionSource;
 *     outputData: SceneSelectionState;
 * }} SceneSelectionPaneControllerParams
 */

/**
 * @typedef {PaneElementParams<SceneSelectionPaneControllerParams>
 * } SceneSelectionPaneElementParams
 */

/**
 * @typedef {PaneControllerState<SceneSelectionPaneControllerParams>
 * } SceneSelectionPaneControllerState
 */

/**
 * Defines each event that can be dispatched by {@link SceneSelectionPaneController}.
 * 
 * @typedef {object} SceneSelectionPaneControllerEventMap
 * @property {{}} click-save The event when the save button is clicked.
 */

/**
 * Represents a UI to select the parameters for a scene.
 * 
 * @augments {PaneController<SceneSelectionPaneControllerParams,
 * SceneSelectionPaneControllerEventMap>}
 */
export class SceneSelectionPaneController extends PaneController {

    /**
     * Clicks on the save button.
     * 
     * This is a no-op if the button is disabled.
     */
    clickSaveButton() {
        const settings = SceneSelectionPaneController.getSaveButtonSettings(this.getPaneParams());
        if (settings.disabled) return;

        this.paneEvents.dispatchEvent({ type: 'click-save' });
    }

    /**
     * Dummy arguments to pass into {@link PaneElementFactoryBuilder}.
     * 
     * @type {Immutable<SceneSelectionPaneElementParams>}
     */
    static FACTORY_PARAMS = {
        inputtedData: {
            task: null,
            sourceGroup: null,
            labelBranch: null,
            frameProgress: { completed: 0, total: 0 },
        },
        computedData: {
            tasks: [],
            sourceGroups: [],
            labelBranches: [],
            historyElem: document.createElement('div'),
            isSaving: false,
        },
        settings: {
            disabled: false,
            hidden: false,
            disableSave: false,
        },
    };

    /**
     * Obtains the settings for the save button.
     * 
     * @param {Immutable<SceneSelectionPaneElementParams>} paneParams
     * The parameters of the pane.
     * @returns {{ title: string, disabled: boolean, hidden: boolean }} The requested settings.
     */
    static getSaveButtonSettings({
        computedData: { isSaving },
        settings: { disabled, hidden, disableSave },
    }) {
        return {
            title: isSaving ? 'Saving...' : 'Save Changes',
            disabled: disabled || disableSave,
            hidden: hidden,
        };
    }

    /**
     * Creates a {@link PaneElementFactory} that constructs a pane element for
     * {@link SceneSelectionPaneElementParams}.
     * 
     * @returns {PaneElementFactory<SceneSelectionPaneElementParams,
     * SceneSelectionPaneControllerEventMap>}
     * The resulting pane element factory.
     */
    static elementFactory() {
        /**
         * @type {PaneElementFactoryBuilder<SceneSelectionPaneElementParams,
         * SceneSelectionPaneControllerEventMap>}
         */
        const builder = new PaneElementFactoryBuilder(this.FACTORY_PARAMS, ['click-save']);

        return builder.sequential([
            builder.list(['inputtedData', 'task'], {
                options: ({ computedData: { tasks }, settings: { disabled, hidden } }) => ({
                    label: 'Task:',
                    options: (tasks.length === 0)
                        ? [{ text: '(No task selected)', value: null }]
                        : tasks.map((task) => ({
                            text: `[#${task.id}] ${task.name}`,
                            value: task,
                        })),
                    disabled: disabled,
                    hidden: hidden,
                }),
                modifyHTML: (element) => {
                    const listContainer = element.querySelector('.tp-lblv_v');
                    if (listContainer instanceof HTMLDivElement) {
                        listContainer.style.width = '80%';
                    } else {
                        console.warn('Cannot find list container');
                    }
                },
            }),
            builder.separator({
                options: ({ settings: { disabled, hidden } }) => ({ disabled, hidden }),
            }),
            builder.list(['inputtedData', 'sourceGroup'], {
                options: ({
                    computedData: { sourceGroups },
                    settings: { disabled, hidden },
                }) => ({
                    label: 'Source Group:',
                    options: (sourceGroups.length === 0)
                        ? [{ text: '(No group selected)', value: null }]
                        : sourceGroups.map((group) => ({
                            text: `[#${group.id}] ${group.name}`,
                            value: group,
                        })),
                    disabled: disabled,
                    hidden: hidden,
                }),
                modifyHTML: (element) => {
                    const listContainer = element.querySelector('.tp-lblv_v');
                    if (listContainer instanceof HTMLDivElement) {
                        listContainer.style.width = '66%';
                    } else {
                        console.warn('Cannot find list container');
                    }
                },
            }),
            builder.list(['inputtedData', 'labelBranch'], {
                options: ({
                    computedData: { labelBranches },
                    settings: { disabled, hidden },
                }) => ({
                    label: 'Label Branch:',
                    options: (labelBranches.length === 0)
                        ? [{ text: '(No branch selected)', value: null }]
                        : labelBranches.map((branch) => ({
                            text: `[#${branch.id}] ${branch.name}${branch.hasUnsavedChanges ? '*' : ''}`,
                            value: branch,
                        })),
                    disabled: disabled,
                    hidden: hidden,
                }),
                modifyHTML: (element) => {
                    const listContainer = element.querySelector('.tp-lblv_v');
                    if (listContainer instanceof HTMLDivElement) {
                        listContainer.style.width = '66%';
                    } else {
                        console.warn('Cannot find list container');
                    }
                },
            }),
            builder.separator({
                options: ({ settings: { disabled, hidden } }) => ({ disabled, hidden }),
            }),
            builder.text({
                options: ({
                    inputtedData: { frameProgress },
                    settings: { disabled, hidden },
                }) => ({
                    view: 'text',
                    label: 'Frame Progress',
                    value: frameProgress,
                    parse: (s) => {
                        const matches = s.match(/^[0-9,.]+\/[0-9,.]+/);
                        const [completed, total] = matches?.slice(1)
                            .map((x) => Number.parseInt(x, 10)) ?? [0, 0];

                        return { completed, total };
                    },
                    format: ({ completed, total }) => {
                        const completedFrac = (total === 0) ? 0 : completed / total;
                        return `${completed}/${total} (${(completedFrac * 100).toPrecision(3)}%) completed`;
                    },
                    disabled: disabled || true,
                    hidden: hidden,
                }),
                modifyHTML: (element) => {
                    const listContainer = element.querySelector('.tp-lblv_v');
                    if (listContainer instanceof HTMLDivElement) {
                        listContainer.style.width = '66%';
                    } else {
                        console.warn('Cannot find list container');
                    }
                },
            }),
            builder.separator({
                options: ({ settings: { disabled, hidden } }) => ({ disabled, hidden }),
            }),
            builder.folder(
                builder.htmlContainer({
                    options: ({ computedData: { historyElem } }) => ({ innerElem: historyElem }),
                }),
                {
                    options: ({ settings: { disabled, hidden } }) => ({
                        title: 'History',
                        disabled: disabled,
                        hidden: hidden,
                    }),
                },
            ),
            builder.separator({
                options: ({ settings: { disabled, hidden } }) => ({ disabled, hidden }),
            }),
            builder.button({
                options: (paneParams) => this.getSaveButtonSettings(paneParams),
                eventHandlers: {
                    click: (paneElem) => paneElem.dispatchEvent({ type: 'click-save' }),
                },
            }),
        ]);
    }

    /**
     * Data processor to pass into {@link PaneController}.
     * 
     * @type {PaneControllerDataProcessor<SceneSelectionPaneControllerParams>}
     */
    static DATA_PROCESSOR = {
        computeData: (inputtedData, internalData) => ({
            tasks: internalData?.tasks ?? [],
            sourceGroups: internalData?.sourceGroups ?? [],
            labelBranches: internalData?.labelBranches ?? [],
            historyElem: internalData?.historyElem ?? document.createElement('div'),
            isSaving: internalData?.isSaving ?? false,
        }),
        outputData: (paneParams) => ({
            task: paneParams.inputtedData.task,
            sourceGroup: paneParams.inputtedData.sourceGroup,
            labelBranch: paneParams.inputtedData.labelBranch,
        }),
    };

    /**
     * Creates a new UI to select the parameters for a scene.
     * 
     * @param {HTMLDivElement} dom The DOM element that contains the pane.
     * @param {Partial<SceneSelectionPaneControllerState>} initialState
     * The initial state to set.
     * @returns {SceneSelectionPaneController} The resulting controller.
     */
    static create(dom, initialState = {}) {
        return new SceneSelectionPaneController(
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
