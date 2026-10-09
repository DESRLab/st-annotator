import _ from 'lodash';

import { SelectableScrollList } from '../../../../../../common/lib/widgets';

import { HistoryItemStatus } from '../../labelset';

import { FramePlayback } from '../FramePlayback';
import { ComposableKeybindHandler } from '../Keybinds';

import { FrameInspectorPaneController } from './FrameInspectorPane';
import { FramePathMenu } from './FramePathMenu';
import { BaseMenu } from './Menu';
import { ProjectPaneController } from './ProjectPane';
import { SceneSelectionPaneController } from './SceneSelectionPane';

/* eslint-disable max-len */
/**
 * @typedef {import('../../../../../../common/lib/utils').EquatableValue} EquatableValue
 */

/**
 * @template {EquatableValue | null} T The type of value stored in each item.
 * @typedef {import('../../../../../../common/lib/widgets').SelectableListEventMap<T>} SelectableListEventMap
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
 * @typedef {import('../../labelset').HistoryItem} HistoryItem
 */

/**
 * @typedef {import('../../labelset').EditableBranch} EditableBranch
 */

/**
 * @typedef {import('../../scene').SceneContext<any>} SceneContext
 */

/**
 * @typedef {import('../../widgets').PaneControllerDataTypes} PaneControllerDataTypes
 */

/**
 * @template {PaneControllerDataTypes} P
 * @typedef {import('../../widgets').PaneControllerChangeEvent<P>} PaneControllerChangeEvent
 */

/**
 * @typedef {import('../Keybinds').Keybind} Keybind
 */

/**
 * @typedef {import('./FrameInspectorPane').FrameInspectorPaneControllerParams} FrameInspectorPaneControllerParams
 */

/**
 * @typedef {import('./SceneSelectionPane').SceneSelectionPaneControllerParams} SceneSelectionPaneControllerParams
 */
/* eslint-enable max-len */

/**
 * @typedef {object} LabelsetEditorState
 * @property {?number} taskId The unique identifier of the active task.
 * @property {?EditableBranch} branch The branch to edit. It should be accessible
 * under `taskId` and `labelParams`.
 */

/**
 * Enables the user to edit the history of a labelset.
 */
export class LabelsetEditor {

    /**
     * A pane containing the history items and save button.
     * 
     * @readonly
     * @type {SceneSelectionPaneController}
     */
    pane;

    /**
     * Handles the event when a key is pressed in this menu.
     * 
     * @readonly
     * @type {ComposableKeybindHandler}
     */
    keydownHandler;

    /**
     * Handles the event when a key is released in this menu.
     * 
     * @readonly
     * @type {ComposableKeybindHandler}
     */
    keyupHandler;

    /**
     * @type {LabelsetEditorState}
     */
    #state;

    /**
     * The state of this editor.
     * 
     * @type {LabelsetEditorState}
     */
    get state() { return this.#state; }

    set state(value) {
        if (this.#state !== value) {
            this.#state.branch?.removeEventListener('beforechange', this.#beforeBranchChange);
            this.#state.branch?.removeEventListener('afterchange', this.#afterBranchChange);

            this.#state = value;

            this.#state.branch?.addEventListener('beforechange', this.#beforeBranchChange);
            this.#state.branch?.addEventListener('afterchange', this.#afterBranchChange);

            this.#render(true);
        }
    }

    /**
     * @readonly
     * @type {SelectableScrollList<HistoryItem>}
     */
    #historyList;

    /**
     * Rebases the active branch to a history item.
     * 
     * @param {HistoryItem} historyItem The target of the rebase.
     */
    async #rebaseHistoryItem(historyItem) {
        const { id, status, isSavepoint } = historyItem;
        if (status === HistoryItemStatus.SAVED && !isSavepoint) return;  // Not allowed

        await this.state.branch?.rebase(id);
    }

    /**
     * Handles the event when a history item has been selected.
     * 
     * @param {SelectableListEventMap<HistoryItem>['select']} event The event to handle.
     */
    #onHistorySelect = async (event) => {
        await this.#rebaseHistoryItem(event.value);
    };

    /**
     * Recreates each item in `this.#historyList`.
     * 
     * @param {boolean} scrollToSelection If `true`, the scroll position of the
     * item to select is maintained.
     */
    #recreateHistoryListItems(scrollToSelection) {
        const reversedHistory = _.reverse(this.state.branch?.getHistory() ?? []);
        const currentHistoryItem = reversedHistory.find((historyItem) => historyItem.isCurrent);

        /**
         * @type {Parameters<SelectableScrollList<HistoryItem>['setItems']>[0]}
         */
        const nextItems = reversedHistory
            .map((historyItem) => {
                const { status, isSavepoint } = historyItem;

                return {
                    value: historyItem,
                    text: historyItem.name,
                    description: historyItem.details,
                    disabled: (status === HistoryItemStatus.SAVED && !isSavepoint),
                    modifyHTML: (dom) => {
                        dom.classList.remove('inactive', 'saved');

                        if (status === HistoryItemStatus.INACTIVE) dom.classList.add('inactive');
                        if (status === HistoryItemStatus.SAVED) dom.classList.add('saved');
                    },
                };
            });

        this.#historyList.setItemsAndValue(nextItems, currentHistoryItem, scrollToSelection);
    }

    /**
     * Updates the view according to the data in the model.
     * 
     * @param {boolean} scrollHistoryToSelection If `true`, the scroll position of the
     * item to select in the history list is maintained.
     */
    #render(scrollHistoryToSelection) {
        const { branch } = this.state;

        const disableNavInput = (branch == null) ? true : branch.isUpdating;

        this.#historyList.disabled = disableNavInput;
        this.#recreateHistoryListItems(scrollHistoryToSelection);

        this.pane.updateState({
            internalData: {
                tasks: this.pane.internalData?.tasks ?? [],   // No change
                sourceGroups: this.pane.internalData?.sourceGroups ?? [],   // No change
                labelBranches: this.pane.internalData?.labelBranches ?? [],   // No change
                historyElem: this.#historyList.dom,
                isSaving: (branch == null) ? false : branch.isUpdating,
            },
            settings: {
                disabled: disableNavInput,
                disableSave: (branch == null) ? true : !branch.hasUnsavedChanges,
            },
        });
    }

    /**
     * Handles the event when the user saves their changes.
     */
    #onSave = () => {
        const { taskId, branch } = this.state;
        if (taskId == null || branch == null) return;

        branch.pushActive(taskId);
    };

    /**
     * Handles the event before the state of the branch is updated.
     */
    #beforeBranchChange = () => {
        this.#render(false);
    };

    /**
     * Handles the event after the state of the branch is updated.
     */
    #afterBranchChange = () => {
        this.#render(true);
    };

    /**
     * @readonly
     * @type {ReadonlyArray<Keybind>}
     */
    KEYDOWN_BINDS = [
        {
            keyCombo: 'ctrl + z',
            name: 'Undo change',
            handler: () => {
                this.stepUndo();
            },
        },
        {
            keyCombo: 'ctrl + y',
            name: 'Redo change',
            handler: () => {
                this.stepRedo();
            },
        },
        {
            keyCombo: 'ctrl + s',
            name: 'Save changes',
            handler: () => {
                this.clickSaveButton();
            },
        },
    ];

    /**
     * Creates a new UI for the user to edit the history of a branch.
     * 
     * @param {SceneSelectionPaneController} pane A pane containing the history items
     * and save button.
     * @param {LabelsetEditorState} state The initial state to set.
     */
    constructor(pane, state) {
        this.pane = pane;
        this.#state = state;

        this.keydownHandler = new ComposableKeybindHandler();
        this.keyupHandler = new ComposableKeybindHandler();

        this.#historyList = new SelectableScrollList({ items: [] });
        this.#historyList.dom.style.minHeight = '128px';
        this.#historyList.dom.style.height = '128px';
        this.#historyList.dom.classList.add('labelset-history');

        for (const keybind of this.KEYDOWN_BINDS) {
            this.keydownHandler.register(keybind);
        }

        this.pane.paneEvents.addEventListener('click-save', this.#onSave);

        this.#state.branch?.addEventListener('beforechange', this.#beforeBranchChange);
        this.#state.branch?.addEventListener('afterchange', this.#afterBranchChange);

        this.#historyList.addEventListener('select', this.#onHistorySelect);

        this.#render(true);
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.#historyList.removeEventListener('select', this.#onHistorySelect);
        this.#historyList.dispose();

        this.#state.branch?.removeEventListener('beforechange', this.#beforeBranchChange);
        this.#state.branch?.removeEventListener('afterchange', this.#afterBranchChange);

        this.pane.updateState({
            internalData: {
                tasks: this.pane.internalData?.tasks ?? [],   // No change
                sourceGroups: this.pane.internalData?.sourceGroups ?? [],   // No change
                labelBranches: this.pane.internalData?.labelBranches ?? [],   // No change
                historyElem: document.createElement('div'),
                isSaving: false,
            },
        });

        this.pane.paneEvents.removeEventListener('click-save', this.#onSave);

        this.keydownHandler.dispose();
        this.keyupHandler.dispose();
    }

    /**
     * Undoes the current change, if possible.
     */
    stepUndo() {
        const history = this.state.branch?.getHistory() ?? [];

        const currentIdx = history.findIndex((historyItem) => historyItem.isCurrent);
        if (currentIdx === -1 || currentIdx === 0) return;

        this.#rebaseHistoryItem(history[currentIdx - 1]);
    }

    /**
     * Redoes the next change, if possible.
     */
    stepRedo() {
        const history = this.state.branch?.getHistory() ?? [];

        const currentIdx = history.findIndex((historyItem) => historyItem.isCurrent);
        if (currentIdx === -1 || currentIdx === history.length - 1) return;

        this.#rebaseHistoryItem(history[currentIdx + 1]);
    }

    /**
     * Clicks on the save button.
     *
     * This is a no-op if the button is disabled.
     */
    clickSaveButton() {
        this.pane.clickSaveButton();
    }
}

/**
 * Allows the user to navigate the currently open project.
 */
export class ProjectMenu extends BaseMenu {

    /**
     * @readonly
     * @type {LabelsetEditor}
     */
    labelsetEditor;

    /**
     * @readonly
     * @type {ProjectPaneController}
     */
    #mainPane;

    /**
     * @readonly
     * @type {SceneSelectionPaneController}
     */
    #sceneSelectionPane;

    /**
     * @readonly
     * @type {FramePathMenu}
     */
    #framePathMenu;

    /**
     * @readonly
     * @type {FrameInspectorPaneController}
     */
    #frameInspectorPane;

    /**
     * Represents the active scene.
     * 
     * @readonly
     * @type {SceneContext}
     */
    context;

    /**
     * The available tasks to select from.
     * 
     * @type {ReadonlyArray<TaskState>}
     */
    get tasks() { return this.context.tasks.elements; }

    /**
     * The selected task, if any.
     * 
     * @type {?TaskState}
     */
    get task() { return this.context.currentTask; }

    /**
     * Selects a task.
     * 
     * @param {?TaskState} task The task to set.
     */
    async setTask(task) {
        await this.context.displayTask(task);
    }

    /**
     * The available source groups to select from.
     * 
     * @type {ReadonlyArray<SourceGroupState>}
     */
    get sourceGroups() { return this.context.sourceGroups.elements; }

    /**
     * The selected source group, if any.
     * 
     * @type {?SourceGroupState}
     */
    get sourceGroup() { return this.context.currentSourceGroup; }

    /**
     * Selects a source group.
     * 
     * @param {?SourceGroupState} group The source group to set.
     */
    async setSourceGroup(group) {
        await this.context.displaySourceGroup(group);
    }

    /**
     * The available label branches to select from.
     * 
     * @type {ReadonlyArray<EditableBranch>}
     */
    get labelBranches() { return this.context.labelBranches.elements; }

    /**
     * The selected label branch, if any.
     * 
     * @type {?EditableBranch}
     */
    get labelBranch() { return this.context.currentLabelBranch; }

    /**
     * Selects a label branch.
     * 
     * @param {?EditableBranch} branch The label branch to set.
     */
    async setLabelBranch(branch) {
        await this.context.displayLabelBranch(branch);
    }

    /**
     * `true` if the current frame is complete or `null`; otherwise, `false`.
     * 
     * @type {boolean}
     */
    get isComplete() { return this.context.currentFrame?.is_complete ?? true; }

    /**
     * Traverses the sequence of frames.
     * 
     * @type {FramePlayback}
     */
    get playback() { return this.#framePathMenu.playback; }

    /**
     * Updates whether the current frame is complete or not.
     * 
     * @param {boolean} value `true` to mark the frame as complete; `false` to mark it
     * as incomplete.
     */
    async setIsComplete(value) {
        await this.context.currentFrame?.updateIsComplete(value);
    }

    /**
     * Updates the view according to the data in the model.
     */
    #render() {
        const {
            context,
            tasks, task,
            sourceGroups, sourceGroup,
            labelBranches, labelBranch, isComplete,
        } = this;

        const availableFrames = this.context.frames.elements;
        const completedFrames = availableFrames.filter((frame) => frame.is_complete);

        this.#sceneSelectionPane.updateState({
            inputtedData: {
                task: task,
                sourceGroup: sourceGroup,
                labelBranch: labelBranch,
                frameProgress: {
                    completed: completedFrames.length,
                    total: availableFrames.length,
                },
            },
            internalData: {
                tasks: tasks,
                sourceGroups: sourceGroups,
                labelBranches: labelBranches,
                historyElem: this.#sceneSelectionPane.internalData?.historyElem ?? document.createElement('div'),
                isSaving: this.#sceneSelectionPane.internalData?.isSaving ?? false,
            },
            settings: {
                disabled: context.isNavigating,
            },
        });

        this.#frameInspectorPane.updateState({
            inputtedData: {
                xBounds: context.currentXBounds,
                yBounds: context.currentYBounds,
                zBounds: context.currentZBounds,
                tBounds: context.currentTBounds,
                status: isComplete ? 'complete' : 'incomplete',
            },
            settings: {
                disabled: context.isNavigating || (context.currentFrame == null),
                disableSTInput: true,
            },
        });
    }

    /**
     * Handles the event when the `isNavigating` status is changed.
     */
    #onIsNavigatingChange = () => {
        this.#render();
    };

    /**
     * Handles the event when the context navigates to a different frame.
     */
    #onNavFrame = () => {
        this.#render();
    };

    /**
     * Handles the event when a frame in the context has been edited.
     */
    #onEditFrame = () => {
        this.#render();
    };

    /**
     * Handles the event when the active branch is switched to a different one.
     */
    #onNavBranch = () => {
        this.labelsetEditor.state = {
            taskId: this.context.currentTaskId,
            branch: this.labelBranch,
        };
    };

    /**
     * Handles the event when an input in the frame inspector pane has been changed.
     * 
     * @param {PaneControllerChangeEvent<SceneSelectionPaneControllerParams>} event
     * The event to handle.
     */
    #onSceneSelectorPaneChange = async (event) => {
        const { task, sourceGroup, labelBranch } = event.outputData;

        if (this.task !== task) {
            await this.setTask(task);
        } else if (this.sourceGroup !== sourceGroup) {
            await this.setSourceGroup(sourceGroup);
        } else if (this.labelBranch !== labelBranch) {
            await this.setLabelBranch(labelBranch);
        }
    };

    /**
     * Handles the event when an input in the frame inspector pane has been changed.
     * 
     * @param {PaneControllerChangeEvent<FrameInspectorPaneControllerParams>} event
     * The event to handle.
     */
    #onFrameInspectorPaneChange = async (event) => {
        const { status } = event.outputData;

        await this.setIsComplete(status === 'complete');
    };

    /**
     * @readonly
     * @type {ReadonlyArray<Keybind>}
     */
    KEYDOWN_BINDS = [
        {
            keyCombo: 'z',
            name: 'Step previous frame',
            handler: () => {
                this.#framePathMenu.clickStepPrev();
            },
        },
        {
            keyCombo: 'shift + z',
            name: 'Cycle frame status; step previous frame',
            handler: async () => {
                await this.cycleStatusAsync();

                this.#framePathMenu.clickStepPrev();
            },
        },
        {
            keyCombo: 'c',
            name: 'Step next frame',
            handler: () => {
                this.#framePathMenu.clickStepNext();
            },
        },
        {
            keyCombo: 'shift + c',
            name: 'Cycle frame status; step next frame',
            handler: async () => {
                await this.cycleStatusAsync();

                this.#framePathMenu.clickStepNext();
            },
        },
    ];

    /**
     * Creates a new menu for navigating the currently open project.
     * 
     * @param {SceneContext} context Represents the active scene.
     */
    constructor(context) {
        super();

        for (const keybind of this.KEYDOWN_BINDS) {
            this.keydownHandler.register(keybind);
        }

        this.context = context;

        const sceneSelectionDom = document.createElement('div');
        this.#sceneSelectionPane = SceneSelectionPaneController.create(sceneSelectionDom);
        this.#sceneSelectionPane.addEventListener('change', this.#onSceneSelectorPaneChange);

        this.#framePathMenu = new FramePathMenu(new FramePlayback(context));
        this.keydownHandler.appendChild(this.#framePathMenu.keydownHandler);
        this.keyupHandler.appendChild(this.#framePathMenu.keyupHandler);

        const frameInspectorDom = document.createElement('div');
        this.#frameInspectorPane = FrameInspectorPaneController.create(frameInspectorDom);
        this.#frameInspectorPane.addEventListener('change', this.#onFrameInspectorPaneChange);

        this.#mainPane = ProjectPaneController.create(this.dom, {
            internalData: {
                sceneSelectionElem: sceneSelectionDom,
                framePathElem: this.#framePathMenu.dom,
                frameInspectorElem: frameInspectorDom,
            },
        });

        this.labelsetEditor = new LabelsetEditor(this.#sceneSelectionPane, {
            taskId: this.context.currentTaskId,
            branch: this.labelBranch,
        });
        this.keydownHandler.appendChild(this.labelsetEditor.keydownHandler);
        this.keyupHandler.appendChild(this.labelsetEditor.keyupHandler);

        this.context.addEventListener('isNavigating-changed', this.#onIsNavigatingChange);
        this.context.addEventListener('nav-source-group', this.#onNavFrame);
        this.context.addEventListener('nav-label-branch', this.#onNavBranch);
        this.context.addEventListener('nav-frame', this.#onNavFrame);
        this.context.addEventListener('edit-frame', this.#onEditFrame);

        this.#render();
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.context.removeEventListener('isNavigating-changed', this.#onIsNavigatingChange);
        this.context.removeEventListener('nav-source-group', this.#onNavFrame);
        this.context.removeEventListener('nav-label-branch', this.#onNavBranch);
        this.context.removeEventListener('nav-frame', this.#onNavFrame);
        this.context.removeEventListener('edit-frame', this.#onEditFrame);

        // labelsetEditor uses the pane so it needs to be disposed first
        this.labelsetEditor.dispose();

        this.#mainPane.dispose();

        this.#frameInspectorPane.removeEventListener('change', this.#onFrameInspectorPaneChange);
        this.#frameInspectorPane.dispose();

        this.#framePathMenu.dispose();

        this.#sceneSelectionPane.removeEventListener('change', this.#onSceneSelectorPaneChange);
        this.#sceneSelectionPane.dispose();

        super.dispose();
    }

    /**
     * Cycles to the next frame status.
     * 
     * This is a no-op if the input is disabled.
     */
    cycleStatus() {
        this.#frameInspectorPane.cycleStatus();
    }

    /**
     * Cycles to the next frame status.
     * 
     * This is a no-op if the input is disabled.
     */
    async cycleStatusAsync() {
        if (!this.#frameInspectorPane.isStatusSelectEnabled()) return;

        const currentFrame = this.context.currentFrame;
        if (currentFrame) await currentFrame.updateIsComplete(!currentFrame.is_complete);
    }
}
