import * as THREE from 'three';

import { DrawBoxState } from './DrawBoxState';
import { EditState } from './EditState';
import { SelectBoxState } from './SelectBoxState';

/* eslint-disable max-len */
/**
 * @template {WindowMapper} WM
 * @typedef {import('sta/services/editor/base').SceneContext<WM>} SceneContext
 */

/**
 * @typedef {import('sta/services/editor/base').ScenePointerEvent} ScenePointerEvent
 */

/**
 * @typedef {import('sta/services/editor/base').WindowMapper} WindowMapper
 */

/**
 * @template T
 * @typedef {import('sta/services/editor/base').SelectorEventMap<T>} SelectorEventMap
 */

/**
 * @template T
 * @typedef {import('sta/services/editor/base').Selector<T>} Selector
 */

/**
 * @typedef {import('sta/services/editor/base').PaneControllerDataTypes} PaneControllerDataTypes
 */

/**
 * @template {PaneControllerDataTypes} P
 * @typedef {import('sta/services/editor/base').PaneControllerChangeEvent<P>} PaneControllerChangeEvent
 */

/**
 * @typedef {import('sta/services/editor/core').MainWindow} MainWindow
 */

/**
 * @template T
 * @typedef {import('sta-gmesh/editor').TransformerEventMap<T>} TransformerEventMap
 */

/**
 * @template T
 * @typedef {import('sta-gmesh/editor').Transformer<T>} Transformer
 */

/**
 * @typedef {import('../data').LabelBoxTransformMonitor} LabelBoxTransformMonitor
 */

/**
 * @typedef {import('../data').BBoxView} BBoxView
 */

/**
 * @typedef {import('../data').ReadonlyLabelBox} ReadonlyLabelBox
 */

/**
 * @typedef {import('../data').ReadonlyLabelTrack} ReadonlyLabelTrack
 */

/**
 * @typedef {import('../data').UUID} UUID
 */

/**
 * @typedef {import('../tools').LabelBoxClipboardEventMap} LabelBoxClipboardEventMap
 */

/**
 * @typedef {import('../tools').LabelBoxClipboard} LabelBoxClipboard
 */

/**
 * @typedef {import('../tools').LabelBoxCreatorEventMap} LabelBoxCreatorEventMap
 */

/**
 * @typedef {import('../tools').LabelBoxCreator} LabelBoxCreator
 */

/**
 * @typedef {import('../widgets').Action} Action
 */

/**
 * @typedef {import('../widgets').ActionPaneController} ActionPaneController
 */

/**
 * @typedef {import('../widgets').ActionPaneControllerParams} ActionPaneControllerParams
 */

/**
 * @typedef {import('../widgets').DrawModePaneController} DrawModePaneController
 */

/**
 * @typedef {import('../widgets').LabelBoxInspectorEventMap} LabelBoxInspectorEventMap
 */

/**
 * @typedef {import('../widgets').LabelBoxInspector} LabelBoxInspector
 */

/**
 * @typedef {import('../widgets').LabelTrackInspectorEventMap} LabelTrackInspectorEventMap
 */

/**
 * @typedef {import('../widgets').LabelTrackInspector} LabelTrackInspector
 */

/**
 * @typedef {import('./EditState').EditStateParams} EditStateParams
 */

/**
 * @template {MainWindowMapper} WM
 * @typedef {import('./InteractState').InteractState<WM>} InteractState
 */
/* eslint-enable max-len */

/**
 * @typedef {{ main: MainWindow }} MainWindowMapper
 */

/**
 * @template {MainWindowMapper} WM The windows defined in the scene display.
 * @typedef {object} StateContextParams
 * @property {SceneContext<WM>} sceneContext A handle to the state of the scene.
 * @property {BBoxView} dataView A view of the data to display in this layer.
 * @property {LabelBoxCreator} boxCreator Creates bounding boxes in the scene.
 * @property {DrawModePaneController} drawModeInput Allows the user to set the mode of drawing
 * objects in the scene.
 * @property {Selector<ReadonlyLabelBox>} boxSelector Interacts with the vertices of the paths of
 * the labelled objects in the scene, i.e., the centers of the corresponding bounding boxes.
 * @property {Transformer<ReadonlyLabelBox>} boxTransformer Transforms selected boxes in the scene.
 * @property {LabelTrackInspector} trackInspector Inspects selected object tracks in the scene.
 * @property {LabelBoxInspector} boxInspector Inspects selected bounding boxes in the scene.
 * @property {LabelBoxTransformMonitor} boxMonitor Monitors the transform of the selected box.
 * @property {LabelBoxClipboard} boxClipboard Allows the user to copy and paste bounding boxes.
 * @property {ActionPaneController} actionInput Allows the user to set the mode of interaction
 * with the scene.
 */

/**
 * @typedef {object} MainWindowUsage
 * @property {string} [cursorClass] The CSS class that sets the `cursor` property of the
 * main window (without the prefix `cursor-`).
 * @property {boolean} [controlCamera=true] Whether the controls of the camera are enabled.
 * @property {(event: ScenePointerEvent) => void} [pointerdown] Handles the event
 * when the pointer is activated on the main window.
 * @property {(event: ScenePointerEvent) => void} [pointerup] Handles the event
 * when the pointer is released on the main window.
 */

/**
 * @typedef {object} LabelDataUsage
 * @property {() => void} [beforeLoad] Handles the event before the data is (un)loaded.
 * @property {() => void} [afterLoad] Handles the event after the data is (un)loaded.
 * @property {() => void} [branchEdit] Handles the event after the branch has been edited.
 */

/**
 * @typedef {object} BoxSelectorUsage
 * @property {boolean} [hover=false] Whether the box selector can hover over objects.
 * @property {(event: SelectorEventMap<ReadonlyLabelBox>['selectin']) => void} [select]
 * Handles the event when a bounding box is selected.
 * If not provided, the box selector cannot select objects.
 */

/**
 * @typedef {object} BoxCreatorUsage
 * @property {boolean} [enabled] Whether the inspector is enabled. Defaults to `true` if
 * any event handler is set; otherwise, defaults to `false`.
 * @property {(event: LabelBoxCreatorEventMap['begin']) => void} [begin] Handles the event
 * when a bounding box has begun to be created.
 * @property {(event: LabelBoxCreatorEventMap['abort']) => void} [abort] Handles the event
 * when a bounding box has aborted being created.
 * @property {(event: LabelBoxCreatorEventMap['end']) => void} [finish] Handles the event
 * when a bounding box has finished being created.
 */

/**
 * @typedef {object} BoxTransformerUsage
 * @property {boolean} [enabled] Whether the inspector is enabled. Defaults to `true` if
 * any event handler is set; otherwise, defaults to `false`.
 * @property {(event: TransformerEventMap<ReadonlyLabelBox>['begin']) => void} [begin]
 * Handles the event when a bounding box has begun to be transformed.
 * @property {(event: TransformerEventMap<ReadonlyLabelBox>['abort']) => void} [abort]
 * Handles the event when a bounding box has aborted being transformed.
 * @property {(event: TransformerEventMap<ReadonlyLabelBox>['checkpoint']) => void} [checkpoint]
 * Handles the event when a bounding box has finished being transformed.
 */

/**
 * @typedef {object} LabelInspectorUsage
 * @property {boolean} [enabled] Whether the inspector is enabled. Defaults to `true` if
 * any event handler is set; otherwise, defaults to `false`.
 * @property {(event: LabelTrackInspectorEventMap['select-track']) => void} [selectTrack]
 * Handles the event when an object track is selected through the inspector.
 * @property {(event: LabelBoxInspectorEventMap['select-box']) => void} [selectBox]
 * Handles the event when a bounding box is selected through the inspector.
 */

/**
 * @typedef {object} LabelClipboardUsage
 * @property {boolean} [enabled] Whether the inspector is enabled. Defaults to `true` if
 * any event handler is set; otherwise, defaults to `false`.
 * @property {(event: LabelBoxClipboardEventMap['paste']) => void} [pasteBox] Handles the event
 * when a bounding box is pasted.
 */

/**
 * Omitting a component indicates that it is unused;
 * this automatically disables it within the context (if possible).
 * 
 * @typedef {object} InteractContextUsage
 * @property {MainWindowUsage} [mainWindow={}] Specifies the usage of the main window.
 * @property {LabelDataUsage} [data={}] Specifies the usage of the labels.
 * @property {BoxSelectorUsage} [boxSelector={}] Specifies the usage of the box selector.
 * @property {BoxCreatorUsage} [boxCreator={}] Specifies the usage of the box creator.
 * @property {BoxTransformerUsage} [boxTransformer={}] Specifies the usage of the box transformer.
 * @property {LabelInspectorUsage} [labelInspector={}] Specifies the usage of the label inspector.
 * @property {LabelClipboardUsage} [labelClipboard={}] Specifies the usage of the label clipboard.
 */

/**
 * Defines each event that can be dispatched by {@link InteractContext}.
 * 
 * @template {MainWindowMapper} WM The windows defined in the scene display.
 * @typedef {object} InteractContextEventMap
 * @property {{ currentState: InteractState<WM> }} change The event when the active state
 * has been changed.
 */

/**
 * Contains the context to be referred to in each {@link InteractState}.
 * 
 * @template {MainWindowMapper} WM The windows defined in the scene display.
 * @augments THREE.EventDispatcher<InteractContextEventMap<WM>>
 */
export class InteractContext extends THREE.EventDispatcher {

    /**
     * A handle to the state of the scene.
     * 
     * @readonly
     * @type {SceneContext<WM>}
     */
    sceneContext;

    /**
     * @type {MainWindow}
     */
    get mainWindow() { return this.sceneContext.display.windows.main; }

    /**
     * A view of the data to display in this layer.
     * 
     * @readonly
     * @type {BBoxView}
     */
    dataView;

    /**
     * Creates bounding boxes in the scene.
     * 
     * @readonly
     * @type {LabelBoxCreator}
     */
    boxCreator;

    /**
     * Allows the user to set the mode of drawing objects in the scene.
     * 
     * @readonly
     * @type {DrawModePaneController}
     */
    drawModeInput;

    /**
     * Interacts with the vertices of the paths of the labelled objects in the scene,
     * i.e., the centers of the corresponding bounding boxes.
     * 
     * @readonly
     * @type {Selector<ReadonlyLabelBox>}
     */
    boxSelector;

    /**
     * Monitors the transform of the selected box.
     * 
     * @readonly
     * @type {LabelBoxTransformMonitor}
     */
    boxMonitor;

    /**
     * Inspects selected object tracks in the scene.
     * 
     * @readonly
     * @type {LabelTrackInspector}
     */
    trackInspector;

    /**
     * Inspects selected bounding boxes in the scene.
     * 
     * @readonly
     * @type {LabelBoxInspector}
     */
    boxInspector;

    /**
     * Transforms selected boxes in the scene.
     * 
     * @readonly
     * @type {Transformer<ReadonlyLabelBox>}
     */
    boxTransformer;

    /**
     * Allows the user to copy and paste bounding boxes.
     * 
     * @readonly
     * @type {LabelBoxClipboard}
     */
    boxClipboard;

    /**
     * Allows the user to set the action to apply to the scene.
     * 
     * @readonly
     * @type {ActionPaneController}
     */
    actionInput;

    /**
     * @type {?InteractState<WM>}
     */
    #currentState = null;

    /**
     * The currently active state.
     * 
     * @type {?InteractState<WM>}
     */
    get currentState() { return this.#currentState; }

    /**
     * `true` if all state transitions are disabled; otherwise, `false`.
     * 
     * @type {boolean}
     */
    get disabled() { return this.actionInput.settings.disabled; }

    set disabled(value) {
        if (this.disabled !== value) {
            if (value) {
                this.transitionNavigate();
            }

            this.actionInput.updateSettings({ disabled: value });
        }
    }

    /**
     * Handles the event when the pointer is activated on the main window.
     * 
     * @param {ScenePointerEvent} event The event to handle.
     */
    #onPointerDown = (event) => {
        this.currentState?.getUsage(this.disabled).mainWindow?.pointerdown?.(event);
    };

    /**
     * Handles the event when the pointer is released on the main window.
     * 
     * @param {ScenePointerEvent} event The event to handle.
     */
    #onPointerUp = (event) => {
        this.currentState?.getUsage(this.disabled).mainWindow?.pointerup?.(event);
    };

    /**
     * Handles the event before the label data is loaded.
     */
    #onBeforeDataLoad = () => {
        this.currentState?.getUsage(this.disabled).data?.beforeLoad?.();
    };

    /**
     * Handles the event after the label data is loaded.
     */
    #onAfterDataLoad = () => {
        this.currentState?.getUsage(this.disabled).data?.afterLoad?.();
    };

    /**
     * Handles the event after a commit is applied to the label data.
     */
    #onEditBranch = () => {
        this.currentState?.getUsage(this.disabled).data?.branchEdit?.();
    };

    /**
     * Handles the event when the user has begun drawing a new bounding box.
     * 
     * @param {LabelBoxCreatorEventMap['begin']} event The event to handle.
     */
    #onBeginCreateBox = (event) => {
        this.currentState?.getUsage(this.disabled).boxCreator?.begin?.(event);
    };

    /**
     * Handles the event when the user has cancelled drawing a new bounding box.
     * 
     * @param {LabelBoxCreatorEventMap['abort']} event The event to handle.
     */
    #onAbortCreateBox = (event) => {
        this.currentState?.getUsage(this.disabled).boxCreator?.abort?.(event);
    };

    /**
     * Handles the event when the user has finished drawing a new bounding box.
     * 
     * @param {LabelBoxCreatorEventMap['end']} event The event to handle.
     */
    #onFinishCreateBox = (event) => {
        this.currentState?.getUsage(this.disabled).boxCreator?.finish?.(event);
    };

    /**
     * Handles the event when the pointer selects a bounding box.
     * 
     * @param {SelectorEventMap<ReadonlyLabelBox>['selectin']} event The event to handle.
     */
    #onPointerSelectBox = (event) => {
        this.currentState?.getUsage(this.disabled).boxSelector?.select?.(event);
    };

    /**
     * Handles the event when the bounding box has begun transforming.
     * 
     * @param {TransformerEventMap<ReadonlyLabelBox>['begin']} event The event to handle.
     */
    #onBeginTransformBox = (event) => {
        this.currentState?.getUsage(this.disabled).boxTransformer?.begin?.(event);
    };

    /**
     * Handles the event when the bounding box has aborted transforming.
     * 
     * @param {TransformerEventMap<ReadonlyLabelBox>['abort']} event The event to handle.
     */
    #onAbortTransformBox = (event) => {
        this.currentState?.getUsage(this.disabled).boxTransformer?.abort?.(event);
    };

    /**
     * Handles the event when the bounding box has finished transforming.
     * 
     * @param {TransformerEventMap<ReadonlyLabelBox>['checkpoint']} event The event to handle.
     */
    #onFinishTransformBox = (event) => {
        this.currentState?.getUsage(this.disabled).boxTransformer?.checkpoint?.(event);
    };

    /**
     * Handles the event when the inspector selects an object track.
     * 
     * @param {LabelTrackInspectorEventMap['select-track']} event The event to handle.
     */
    #onInspectorSelectTrack = (event) => {
        this.currentState?.getUsage(this.disabled).labelInspector?.selectTrack?.(event);
    };

    /**
     * Handles the event when the inspector selects a bounding box.
     * 
     * @param {LabelBoxInspectorEventMap['select-box']} event The event to handle.
     */
    #onInspectorSelectBox = (event) => {
        this.currentState?.getUsage(this.disabled).labelInspector?.selectBox?.(event);
    };

    /**
     * Handles the event when the inspector toggles the draw box button.
     * 
     * @param {LabelBoxInspectorEventMap['toggle-drawBox']} event The event to handle.
     */
    #onInspectorToggleDrawBox = (event) => {
        this.actionInput.toggleDraw();
    };

    /**
     * Handles the event when a bounding box has been pasted.
     * 
     * @param {LabelBoxClipboardEventMap['paste']} event The event to handle.
     */
    #onPasteBox = (event) => {
        this.currentState?.getUsage(this.disabled).labelClipboard?.pasteBox?.(event);
    };

    /**
     * Handles the event when the view mode is changed.
     */
    #onViewModeChange = () => {
        const { mainWindow, boxTransformer } = this;
        const { viewMode } = mainWindow;

        if (viewMode === '2D') {
            boxTransformer.disableMoveXZ = false;
            boxTransformer.disableMoveResizeY = true;
            boxTransformer.disablePlaneResize = false;
        } else if (viewMode === '3D') {
            boxTransformer.disableMoveXZ = true;
            boxTransformer.disableMoveResizeY = false;
            boxTransformer.disablePlaneResize = true;
        }
    };

    /**
     * Handles the event when the user action is changed.
     * 
     * @param {PaneControllerChangeEvent<ActionPaneControllerParams>} event
     * The event to handle.
     */
    #onActionChange = (event) => {
        this.#setStateFromAction(event.outputData.action);
    };

    /**
     * Updates the current state based on the selected action.
     * 
     * @param {Action} action The selected action.
     */
    #setStateFromAction = (action) => {
        const { currentState } = this;

        switch (action) {
            // These instanceof checks prevent infinite loop when #renderState is called
            case 'edit':
                if (!(currentState instanceof EditState)) {
                    this.transitionNavigate();
                }
                break;
            case 'select':
                if (!(currentState instanceof SelectBoxState)) {
                    this.transitionSelectBox();
                }
                break;
            case 'draw':
                if (!(currentState instanceof DrawBoxState)) {
                    this.transitionDrawBox();
                }
                break;
            default:
                throw new Error(`Unknown action: ${action}`);
        }

        this.#renderState();
    };

    /**
     * Updates the selected action based on the current state.
     */
    #renderState = () => {
        const { actionInput, boxInspector, currentState } = this;

        if (currentState == null || currentState instanceof EditState) {
            actionInput.updateInputtedData({ action: 'edit' });
        } else if (currentState instanceof SelectBoxState) {
            actionInput.updateInputtedData({ action: 'select' });
        } else if (currentState instanceof DrawBoxState) {
            actionInput.updateInputtedData({ action: 'draw' });
        } else {
            throw new Error(`Unhandled state type: ${JSON.stringify(currentState)}`);
        }

        boxInspector.drawBoxActive = (currentState instanceof DrawBoxState);
    };

    /**
     * Creates a new context.
     * 
     * @param {StateContextParams<WM>} params The properties of the context.
     */
    constructor(params) {
        super();

        this.sceneContext = params.sceneContext;
        this.dataView = params.dataView;
        this.boxCreator = params.boxCreator;
        this.drawModeInput = params.drawModeInput;
        this.boxSelector = params.boxSelector;
        this.boxTransformer = params.boxTransformer;
        this.trackInspector = params.trackInspector;
        this.boxInspector = params.boxInspector;
        this.boxMonitor = params.boxMonitor;
        this.boxClipboard = params.boxClipboard;
        this.actionInput = params.actionInput;

        this.mainWindow.pointerEvents.addEventListener('pointerdown', this.#onPointerDown);
        this.mainWindow.pointerEvents.addEventListener('pointerup', this.#onPointerUp);

        this.dataView.addEventListener('beforeload', this.#onBeforeDataLoad);
        this.dataView.addEventListener('afterload', this.#onAfterDataLoad);
        this.dataView.context.addEventListener('edit-branch', this.#onEditBranch);

        this.boxCreator.addEventListener('begin', this.#onBeginCreateBox);
        this.boxCreator.addEventListener('abort', this.#onAbortCreateBox);
        this.boxCreator.addEventListener('end', this.#onFinishCreateBox);

        this.boxTransformer.addEventListener('begin', this.#onBeginTransformBox);
        this.boxTransformer.addEventListener('abort', this.#onAbortTransformBox);
        this.boxTransformer.addEventListener('checkpoint', this.#onFinishTransformBox);

        this.boxSelector.addEventListener('selectin', this.#onPointerSelectBox);

        this.boxInspector.addEventListener('select-box', this.#onInspectorSelectBox);
        this.boxInspector.addEventListener('toggle-drawBox', this.#onInspectorToggleDrawBox);
        this.boxInspector.addEventListener('select-track', this.#onInspectorSelectTrack);

        this.trackInspector.addEventListener('select-track', this.#onInspectorSelectTrack);

        this.boxClipboard.addEventListener('paste', this.#onPasteBox);

        this.mainWindow.addEventListener('viewMode-change', this.#onViewModeChange);

        this.#onViewModeChange();

        this.actionInput.bindOutputData(this.#onActionChange);
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.mainWindow.pointerEvents.removeEventListener('pointerdown', this.#onPointerDown);
        this.mainWindow.pointerEvents.removeEventListener('pointerup', this.#onPointerUp);

        this.dataView.removeEventListener('beforeload', this.#onBeforeDataLoad);
        this.dataView.removeEventListener('afterload', this.#onAfterDataLoad);
        this.dataView.context.removeEventListener('edit-branch', this.#onEditBranch);

        this.boxCreator.removeEventListener('begin', this.#onBeginCreateBox);
        this.boxCreator.removeEventListener('abort', this.#onAbortCreateBox);
        this.boxCreator.removeEventListener('end', this.#onFinishCreateBox);

        this.boxTransformer.removeEventListener('begin', this.#onBeginTransformBox);
        this.boxTransformer.removeEventListener('abort', this.#onAbortTransformBox);
        this.boxTransformer.removeEventListener('checkpoint', this.#onFinishTransformBox);

        this.boxSelector.removeEventListener('selectin', this.#onPointerSelectBox);

        this.trackInspector.removeEventListener('select-track', this.#onInspectorSelectTrack);

        this.boxInspector.removeEventListener('select-box', this.#onInspectorSelectBox);
        this.boxInspector.removeEventListener('toggle-drawBox', this.#onInspectorToggleDrawBox);
        this.boxInspector.removeEventListener('select-track', this.#onInspectorSelectTrack);

        this.boxClipboard.removeEventListener('paste', this.#onPasteBox);

        this.mainWindow.removeEventListener('viewMode-change', this.#onViewModeChange);
    }

    /**
     * Gets the text to display as a hint to the user when this layer is active.
     * 
     * If the text is an empty string, no hint is displayed.
     * 
     * @returns {string} The requested hint.
     */
    getHint() {
        const hint = this.currentState?.getHint(this.disabled) ?? '';

        return hint.replaceAll('[', '<kbd>').replaceAll(']', '</kbd>');
    }

    /**
     * Updates the `three.js` objects and the DOM elements of this layer.
     * It is called during each animation frame while this layer is displayed.
     * 
     */
    render() {
        const { currentState } = this;

        if (currentState != null) {
            const usage = currentState.getUsage(this.disabled);

            this.#updateCursor(usage);
            this.#updateEnabled(usage);
        }
    }

    /**
     * @type {string}
     */
    #prevCursorClassWithPrefix = '';

    /**
     * Updates the cursor that is displayed when hovered over the main window.
     * 
     * @param {InteractContextUsage} usage Specifies how the context is used.
     */
    #updateCursor(usage) {
        const container = this.mainWindow.dom;
        const cursorClass = usage.mainWindow?.cursorClass ?? '';
        const cursorClassWithPrefix = cursorClass ? `cursor-${cursorClass}` : '';

        if (this.#prevCursorClassWithPrefix !== cursorClassWithPrefix) {
            if (this.#prevCursorClassWithPrefix) {
                container.classList.remove(this.#prevCursorClassWithPrefix);
            }

            if (cursorClassWithPrefix) {
                container.classList.add(cursorClassWithPrefix);
            }

            this.#prevCursorClassWithPrefix = cursorClassWithPrefix;
        }
    }

    /**
     * Updates the enabled status of each component in this context.
     * 
     * @param {InteractContextUsage} usage Specifies how the context is used.
     */
    #updateEnabled(usage) {
        this.mainWindow.enableCameraControls = !!(usage.mainWindow?.controlCamera);

        this.boxSelector.hoverEnabled = !!(usage.boxSelector?.hover);
        this.boxSelector.selectEnabled = !!(usage.boxSelector?.select);

        if (usage.boxCreator && 'enabled' in usage.boxCreator) {
            this.boxCreator.disabled = !usage.boxCreator.enabled;
        } else {
            this.boxCreator.disabled = !(usage.boxCreator?.begin
                || usage.boxCreator?.abort || usage.boxCreator?.finish);
        }

        if (usage.boxTransformer && 'enabled' in usage.boxTransformer) {
            this.boxTransformer.disabled = !usage.boxTransformer.enabled;
        } else {
            this.boxTransformer.disabled = !(usage.boxTransformer?.begin
                || usage.boxTransformer?.abort || usage.boxTransformer?.checkpoint);
        }

        if (usage.labelInspector && 'enabled' in usage.labelInspector) {
            this.boxInspector.disabled = !usage.labelInspector.enabled;
            this.trackInspector.disabled = !usage.labelInspector.enabled;
        } else {
            this.boxInspector.disabled = !(usage.labelInspector?.selectBox);
            this.trackInspector.disabled = !(usage.labelInspector?.selectTrack);
        }

        if (usage.labelClipboard && 'enabled' in usage.labelClipboard) {
            this.boxClipboard.disabled = !usage.labelClipboard.enabled;
        } else {
            this.boxClipboard.disabled = !(usage.labelClipboard?.pasteBox);
        }
    }

    /**
     * Sets the active state.
     * 
     * This is a no-op if the context is disabled.
     * 
     * @param {() => InteractState<WM>} stateFactory Lazily constructs the state to set.
     */
    #transition(stateFactory) {
        if (this.disabled) return;

        this.#currentState?.dispose();

        // We set it to `null` first so that events triggered by stateFactory
        // are not handled by the disposed state (instead, they are not handled at all)
        this.#currentState = null;

        this.#currentState = stateFactory();

        this.#renderState();

        this.dispatchEvent({ type: 'change', currentState: this.#currentState });
    }

    /**
     * Transitions the state of this context to navigation.
     */
    transitionNavigate() {
        this.#transition(() => new EditState(this, { trackId: null, boxId: null }));
    }

    /**
     * Transitions the state of this context to selecting a bounding box.
     */
    transitionSelectBox() {
        this.#transition(() => new SelectBoxState(this));
    }

    /**
     * Transitions the state of this context to drawing a bounding box.
     */
    transitionDrawBox() {
        this.#transition(() => new DrawBoxState(this));
    }

    /**
     * Transitions the state of this context to editing some labels.
     * 
     * @param {EditStateParams} params The parameters of the new state.
     */
    transitionEdit({ trackId, boxId }) {
        this.#transition(() => new EditState(this, { trackId, boxId }));
    }

    /**
     * Transitions the state of this context to editing a bounding box.
     * 
     * @param {{ boxId: UUID }} params The parameters of the new state.
     */
    async transitionEditBox({ boxId }) {
        const box = this.dataView.getLabelBox(boxId);
        const trackId = box.entityId ?? null;

        const ctx = this.sceneContext;
        const targetTimestamp = box.timestamp;

        // This check is not required but it can avoid unnecessarily computing the path
        if (ctx.currentFrame != null && !ctx.currentFrame.containsTimestamp(targetTimestamp)) {
            await ctx.displayFrameFromCurrent({ tCenter: targetTimestamp });
        }

        this.transitionEdit({ trackId, boxId });
    }
}
