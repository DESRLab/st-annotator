import * as THREE from 'three';

import { DrawVectorState } from './DrawVectorState';
import { SelectVectorState } from './SelectVectorState';
import { EditState } from './EditVectorState';

/* eslint-disable max-len */
/**
 * @typedef {import('sta/services/editor/base').ScenePointerEvent} ScenePointerEvent
 */

/**
 * @typedef {import('sta/services/editor/base').WindowMapper} WindowMapper
 */

/**
 * @template {WindowMapper} WM
 * @typedef {import('sta/services/editor/base').SceneContext<WM>} SceneContext
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
 * @template {PaneControllerDataTypes} P
 * @typedef {import('sta/services/editor/base').PaneControllerChangeEvent<P>} PaneControllerChangeEvent
 */

/**
 * @typedef {import('sta/services/editor/core').MainWindow} MainWindow
 */

/**
 * @typedef {import('sta/services/editor/base').PaneControllerDataTypes} PaneControllerDataTypes
 */

/**
 * @typedef {import('../data').LabelVectorReformMonitor} LabelVectorReformMonitor 
 */

/**
 * @typedef {import('../controls/VectorTransformer').VectorTransformerEventMap} VectorTransformerEventMap
 */

/**
 * @typedef {import('../controls/VectorTransformer').VectorTransformer} VectorTransformer
 */

/**
 * @typedef {import('../data').VectorView} VectorView
 */

/**
 * @typedef {import('../data').ReadonlyLabelVector} ReadonlyLabelVector
 */

/**
 * @typedef {import('../data').UUID} UUID
 */

/**
 * @typedef {import('../tools').VectorCreator} VectorCreator
 */

/**
 * @typedef {import('../tools').LabelVectorClipboardEventMap} LabelVectorClipboardEventMap
 */

/**
 * @typedef {import('../tools').LabelVectorClipboard} LabelVectorClipboard
 */

/**
 * @typedef {import('../tools').VectorCreatorEventMap} VectorCreatorEventMap
 */

/**
 * @typedef {import('../tools').PolygonCreator} PolygonCreator
 */

/**
 * @typedef {import('../tools').PolylineCreator} PolylineCreator
 */

/**
 * @typedef {import('../tools').PointCreator} PointCreator
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
 * @typedef {import('../widgets/DrawModePane').DrawModePaneControllerParams} DrawModePaneControllerParams
 */

/**
 * @typedef {import('../widgets').DrawMode} DrawMode
 */

/**
 * @typedef {import('../widgets').LabelVectorInspectorEventMap} LabelVectorInspectorEventMap 
 */

/**
 * @typedef {import('../widgets').LabelVectorInspector} LabelVectorInspector 
 */

/**
 * @typedef {import('./EditVectorState').EditStateParams} EditStateParams
 */

/**
 * @typedef {{ main: MainWindow }} MainWindowMapper
 */

/**
 * @template {MainWindowMapper} WM
 * @typedef {import('./InteractState').InteractState<WM>} InteractState
 */
/* eslint-enable max-len */

/**
 * @typedef {{
 *     polygon: PolygonCreator;
 *     polyline: PolylineCreator;
 *     point: PointCreator;
 * }} VectorCreators
 */

/**
 * @template {MainWindowMapper} WM The windows defined in the scene display.
 * @typedef {object} StateContextParams
 * @property {SceneContext<WM>} sceneContext A handle to the state of the scene.
 * @property {VectorView} dataView A view of the data to display in this layer.
 * @property {HTMLCanvasElement} canvas The 2D canvas in the scene 
 * where the drawing of vector object takes place.
 * @property {DrawModePaneController} drawModeInput Allows the user to set the mode of drawing
 * objects in the scene.
 * @property {VectorCreators} vectorCreators a set of tools 
 * to create vector object based on their type.
 * @property {Selector<ReadonlyLabelVector>} vectorSelector Interacts with 
 * the vertices of vector object.
 * @property {VectorTransformer} vectorTransformer Transforms selected vertices 
 * of a vector object in the scene.
 * @property {LabelVectorInspector} vectorInspector Inspects selected vector objects in the scene.
 * @property {LabelVectorReformMonitor} vectorMonitor Monitors the 
 * changes on a vector object shape.
 * @property {LabelVectorClipboard} vectorClipboard Allows the user to 
 * copy and paste vector objects.
 * @property {ActionPaneController} actionInput Allows the user to set the mode of interaction
 * with the scene.
 */

/**
 * @typedef {object} MainWindowUsage
 * @property {string} [cursorClass] The CSS class that sets the `cursor` property of the
 * main window (without the prefix `cursor-`).
 * @property {boolean} [controlCamera=true] Whether the controls of the camera are enabled.
 * @property {boolean} [hiddenCanvas=true] Whether the canvas for 2d drawing is hidden.
 */

/**
 * @typedef {object} LabelDataUsage
 * @property {() => void} [beforeLoad] Handles the event before the data is (un)loaded.
 * @property {() => void} [afterLoad] Handles the event after the data is (un)loaded.
 * @property {() => void} [branchEdit] Handles the event after the branch has been edited.
 */

/**
 * @typedef {object} VectorSelectorUsage
 * @property {boolean} [hover=false] Whether the vector selector can hover over objects.
 * @property {(event: SelectorEventMap<ReadonlyLabelVector>['selectin']) => void} [select]
 * Handles the event when a vector object is selected.
 * If not provided, the vector selector cannot select objects.
 */

/**
 * @typedef {object} VectorCreatorUsage
 * @property {(event: VectorCreatorEventMap['abort']) => void} [abort] Handles the event
 * when a Vector has aborted being created.
 * @property {(event: VectorCreatorEventMap['end']) => void} [finish] Handles the event
 * when a Vector has finished being created.
 */

/**
 * @typedef {object} VectorTransformerUsage
 * @property {boolean} [enabled] Whether the inspector is enabled. Defaults to `true` if
 * any event handler is set; otherwise, defaults to `false`.
 * @property {(event: VectorTransformerEventMap['begin']) => void} [begin] Handles 
 * the event when a vector object has begun to transformed.
 * @property {(event: VectorTransformerEventMap['abort']) =>  void} [abort] Handles 
 * the event when a vector object has aborted being transformed.
 * @property {(event: VectorTransformerEventMap['checkpoint']) => void} [checkpoint] Handles 
 * the event when a vector object has finished being transformed.
 */

/**
 * @typedef {object} LabelInspectorUsage
 * @property {boolean} [enabled] Whether the inspector is enabled. Defaults to `true` if
 * any event handler is set; otherwise, defaults to `false`.
 * @property {(event: LabelVectorInspectorEventMap['select-vector']) => void} [selectVector]
 * Handles the event when a vector object is selected through the inspector.
 */

/**
 * @typedef {object} LabelClipboardUsage
 * @property {boolean} [enabled] Whether the inspector is enabled. Defaults to `true` if
 * any event handler is set; otherwise, defaults to `false`.
 * @property {(event: LabelVectorClipboardEventMap['paste']) => void} [pasteVector] Handles 
 * the event when a vector object is pasted.
 */

/**
 * Omitting a component indicates that it is unused;
 * this automatically disables it within the context (if possible).
 * 
 * @typedef {object} InteractContextUsage
 * @property {MainWindowUsage} [mainWindow={}] Specifies the usage of the main window.
 * @property {LabelDataUsage} [data={}] Specifies the usage of the labels.
 * @property {VectorSelectorUsage} [vectorSelector={}] Specifies the usage of the vector selector.
 * @property {VectorCreatorUsage} [vectorCreator={}] specifies the usage of the vector creator.
 * @property {VectorTransformerUsage} [vectorTransformer={}] Specifies the usage of 
 * the vector transformer.
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
 * @augments {THREE.EventDispatcher<InteractContextEventMap<WM>>}
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
     * whether the layer of this interact context
     * is active.
     * 
     * @type {boolean}
     */
    #layerIsActive = false;

    /**
     * @type {boolean} `true` if the layer for this interact context is active.
     * otherwise; `flase`
     */
    get layerIsActive() { return this.#layerIsActive; }

    set layerIsActive(value) {
        if (this.#layerIsActive !== value) {
            this.#layerIsActive = value;
        }
    }

    /**
     * 
     * @readonly
     * @type {HTMLCanvasElement}
     */
    canvas;

    /**
     * A view of the data to display in this layer.
     * 
     * @type {VectorView}
     */
    dataView;

    /**
     * a set of vector creators to draw specific vector type.
     * 
     * @readonly
     * @type {VectorCreators}
     */
    vectorCreators;

    /**
     * Allows the user to set the mode of drawing objects in the scene.
     * 
     * @readonly
     * @type {DrawModePaneController}
     */
    drawModeInput;

    /**
     * 
     * @type {DrawMode}
     */
    get drawMode() { return this.drawModeInput.inputtedData.drawMode; }

    /**
     * @type {Action}
     */
    get action() { return this.actionInput.outputData.action; }

    /**
     * 
     * @type {?VectorCreator}
     */
    get activatedVectorCreator() {
        return Object.values(this.vectorCreators)
            .filter((creator) => creator.enabled === true).at(0) ?? null;
    }

    /**
     * Interacts with the vertices of vector objects in the scene.
     * 
     * @readonly
     * @type {Selector<ReadonlyLabelVector>}
     */
    vectorSelector;

    /**
     * Monitors the transform of the selected vector.
     * 
     * @readonly
     * @type {LabelVectorReformMonitor}
     */
    vectorMonitor;

    /**
     * Inspects selected vector objects in the scene.
     * 
     * @readonly
     * @type {LabelVectorInspector}
     */
    vectorInspector;

    /**
     * Transforms the vertices of the vectors in the scene.
     * 
     * @readonly
     * @type {VectorTransformer}
     */
    vectorTransformer;

    /**
     * Allows the user to copy and paste the vector objects.
     * 
     * @readonly
     * @type {LabelVectorClipboard}
     */
    vectorClipboard;

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
     * Handles the event before the label data is loaded.
     */
    #onBeforeDataLoad = () => {
        this.currentState?.getUsage(this.#prevIsReadonly).data?.beforeLoad?.();
    };

    /**
     * Handles the event after the label data is loaded.
     */
    #onAfterDataLoad = () => {
        this.currentState?.getUsage(this.#prevIsReadonly).data?.afterLoad?.();
    };

    /**
     * Handles the event after a commit is applied to the label data.
     */
    #onEditBranch = () => {
        this.currentState?.getUsage(this.#prevIsReadonly).data?.branchEdit?.();
    };

    /**
     * Handles the event when the pointer selects a vector object.
     * 
     * @param {SelectorEventMap<ReadonlyLabelVector>['selectin']} event The event to handle.
     */
    #onPointerSelectVector = (event) => {
        this.currentState?.getUsage(this.#prevIsReadonly).vectorSelector?.select?.(event);
    };

    /**
     * @param {VectorTransformerEventMap['begin']} event The event to handle.
     */
    #onBeginTransformVector = (event) => {
        this.currentState?.getUsage(this.disabled).vectorTransformer?.begin?.(event);
    };

    /**
     * @param {VectorTransformerEventMap['abort']} event The event to handle.
     */
    #onAbortTransformVector = (event) => {
        this.currentState?.getUsage(this.disabled).vectorTransformer?.abort?.(event);
    };

    /**
     * @param {VectorTransformerEventMap['checkpoint']} event The event to handle.
     */
    #onFinishTransformVector = (event) => {
        this.currentState?.getUsage(this.disabled).vectorTransformer?.checkpoint?.(event);
    };

    /**
     * Handles the event when the user has cancelled drawing a new vector object.
     * 
     * @param {VectorCreatorEventMap['abort']} event The event to handle.
     */
    #onAbortCreateVector = (event) => {
        this.currentState?.getUsage(this.disabled).vectorCreator?.abort?.(event);
    };

    /**
     * Handles the event when the user has finished drawing a new vector object.
     * 
     * @param {VectorCreatorEventMap['end']} event The event to handle.
     */
    #onFinishCreateVector = (event) => {
        this.currentState?.getUsage(this.disabled).vectorCreator?.finish?.(event);
    };

    /**
     * Handles the event when the inspector selects a vector object.
     * 
     * @param {LabelVectorInspectorEventMap['select-vector']} event The event to handle.
     */
    #onInspectorSelectVector = (event) => {
        this.currentState?.getUsage(this.disabled).labelInspector?.selectVector?.(event);
    };

    /**
     * Handles the event when the inspector toggles the draw vector button.
     * 
     * @param {LabelVectorInspectorEventMap['toggle-drawVector']} event The event to handle.
     */
    #onInspectorToggleDrawVector = (event) => {
        this.actionInput.toggleDraw();
    };

    /**
     * Handles the event when a vector object has been pasted.
     * 
     * @param {LabelVectorClipboardEventMap['paste']} event The event to handle.
     */
    #onPasteVector = (event) => {
        this.currentState?.getUsage(this.disabled).labelClipboard?.pasteVector?.(event);
    };

    /**
     * Handles the event when the view mode is changed.
     */
    #onViewModeChange = () => {
        const { mainWindow, vectorTransformer } = this;
        const { viewMode } = mainWindow;

        if (viewMode === '2D') {
            vectorTransformer.disableMoveXZ = false;
            vectorTransformer.disableMoveY = true;
        } else if (viewMode === '3D') {
            vectorTransformer.disableMoveXZ = true;
            vectorTransformer.disableMoveY = true;
        }
    };

    /**
     * Handles the event when the user action is changed.
     * 
     * @param {PaneControllerChangeEvent<DrawModePaneControllerParams>} event
     * The event to handle.
     */
    #onDrawModeChange = (event) => {
        for (const [type, creator] of Object.entries(this.vectorCreators)) {
            creator.enabled = (this.actionInput.outputData.action === 'draw' && type === event.outputData.drawMode);
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
     * Updates the current dtate based on the selected action.
     * 
     * @param {Action} action The selected action.
     */
    #setStateFromAction = (action) => {
        const { currentState } = this;

        switch (action) {
            case 'draw':
                if (!(currentState instanceof DrawVectorState)) {
                    this.transitionDrawVector();
                }
                break;
            case 'select':
                if (!(currentState instanceof SelectVectorState)) {
                    this.transitionSelectVector();
                }
                break;
            case 'edit':
                if (!(currentState instanceof EditState)) {
                    this.transitionNavigate();
                }
                break;
            default:
                throw new Error(`Unknown action: ${action}`);
        }

        this.#renderState();
    };

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
     * Updates the selected action based on the current state.
     */
    #renderState = () => {
        const { actionInput, currentState, vectorInspector } = this;
        if (currentState == null || currentState instanceof EditState) {
            actionInput.updateInputtedData({ action: 'edit' });
        } else if (currentState instanceof SelectVectorState) {
            actionInput.updateInputtedData({ action: 'select' });
        } else if (currentState instanceof DrawVectorState) {
            actionInput.updateInputtedData({ action: 'draw' });
        } else {
            throw new Error(`Unhandled state type: ${JSON.stringify(currentState)}`);
        }

        vectorInspector.drawVectorActive = (currentState instanceof DrawVectorState);
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
        this.canvas = params.canvas;
        this.vectorCreators = params.vectorCreators;
        this.vectorSelector = params.vectorSelector;
        this.drawModeInput = params.drawModeInput;
        this.actionInput = params.actionInput;
        this.vectorTransformer = params.vectorTransformer;
        this.vectorMonitor = params.vectorMonitor;
        this.vectorClipboard = params.vectorClipboard;
        this.vectorInspector = params.vectorInspector;

        this.dataView.addEventListener('beforeload', this.#onBeforeDataLoad);
        this.dataView.addEventListener('afterload', this.#onAfterDataLoad);
        this.dataView.context.addEventListener('edit-branch', this.#onEditBranch);

        /** @type {ReadonlyArray<THREE.EventDispatcher<VectorCreatorEventMap>>} */
        const vectorCreators = Object.values(this.vectorCreators);
        for (const creator of vectorCreators) {
            creator.addEventListener('abort', this.#onAbortCreateVector);
            creator.addEventListener('end', this.#onFinishCreateVector);
        }

        this.vectorSelector.addEventListener('selectin', this.#onPointerSelectVector);

        this.vectorTransformer.addEventListener('begin', this.#onBeginTransformVector);
        this.vectorTransformer.addEventListener('abort', this.#onAbortTransformVector);
        this.vectorTransformer.addEventListener('checkpoint', this.#onFinishTransformVector);

        this.vectorInspector.addEventListener('select-vector', this.#onInspectorSelectVector);
        this.vectorInspector.addEventListener('toggle-drawVector', this.#onInspectorToggleDrawVector);

        this.vectorClipboard.addEventListener('paste', this.#onPasteVector);

        this.mainWindow.addEventListener('viewMode-change', this.#onViewModeChange);

        this.drawModeInput.bindOutputData(this.#onDrawModeChange);
        this.actionInput.bindOutputData(this.#onActionChange);
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.dataView.removeEventListener('beforeload', this.#onBeforeDataLoad);
        this.dataView.removeEventListener('afterload', this.#onAfterDataLoad);
        this.dataView.context.removeEventListener('edit-branch', this.#onEditBranch);

        /** @type {ReadonlyArray<THREE.EventDispatcher<VectorCreatorEventMap>>} */
        const vectorCreators = Object.values(this.vectorCreators);
        for (const creator of vectorCreators) {
            creator.removeEventListener('abort', this.#onAbortCreateVector);
            creator.removeEventListener('end', this.#onFinishCreateVector);
        }

        this.vectorTransformer.removeEventListener('begin', this.#onBeginTransformVector);
        this.vectorTransformer.removeEventListener('abort', this.#onAbortTransformVector);
        this.vectorTransformer.removeEventListener('checkpoint', this.#onFinishTransformVector);

        this.vectorInspector.removeEventListener('select-vector', this.#onInspectorSelectVector);
        this.vectorInspector.removeEventListener('toggle-drawVector', this.#onInspectorToggleDrawVector);

        this.vectorClipboard.removeEventListener('paste', this.#onPasteVector);

        this.mainWindow.removeEventListener('viewMode-change', this.#onViewModeChange);
    }

    /**
     * The previous value of `isReadonly` in the most recent call to
     * {@link InteractContext#render}.
     * 
     * @type {boolean}
     */
    #prevIsReadonly = false;

    /**
     * Updates the `three.js` objects and the DOM elements of this layer.
     * It is called during each animation frame while this layer is displayed.
     * 
     */
    render() {
        const { currentState, layerIsActive } = this;

        if (currentState) {
            const usage = currentState.getUsage(this.disabled);

            if (layerIsActive) {
                this.mainWindow.enableCameraControls = !!(usage.mainWindow?.controlCamera);
            }

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
        const {
            layerIsActive, drawMode, action, canvas,
            vectorCreators, vectorInspector,
            vectorTransformer, vectorSelector,
            vectorClipboard,
        } = this;

        canvas.hidden = !!(usage.mainWindow?.hiddenCanvas);

        vectorSelector.hoverEnabled = !!(usage.vectorSelector?.hover) && layerIsActive;
        vectorSelector.selectEnabled = !!(usage.vectorSelector?.select) && layerIsActive;

        for (const [type, creator] of Object.entries(vectorCreators)) {
            creator.enabled = (action === 'draw' && type === drawMode && layerIsActive);
        }

        if (usage.vectorTransformer && 'enabled' in usage.vectorTransformer) {
            vectorTransformer.disabled = !usage.vectorTransformer.enabled;
        } else {
            vectorTransformer.disabled = !(usage.vectorTransformer?.begin
                || usage.vectorTransformer?.abort || usage.vectorTransformer?.checkpoint);
        }

        if (usage.labelInspector && 'enabled' in usage.labelInspector) {
            vectorInspector.disabled = !usage.labelInspector.enabled;
        } else {
            vectorInspector.disabled = !(usage.labelInspector?.selectVector);
        }

        if (usage.labelClipboard && 'enabled' in usage.labelClipboard) {
            vectorClipboard.disabled = !usage.labelClipboard.enabled;
        } else {
            vectorClipboard.disabled = !(usage.labelClipboard?.pasteVector);
        }
    }

    /**
     * Sets the active state.
     * 
     * @param {() => InteractState<WM>} stateFactory Lazily constructs the state to set.
     */
    #transition(stateFactory) {
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
        this.#transition(() => new EditState(this, { vectorId: null }));
    }

    /**
     * Transitions the state of this context to selecting a vector object.
     */
    transitionSelectVector() {
        this.#transition(() => new SelectVectorState(this));
    }

    /**
     * Transitions the state of this context to editing some labels.
     * 
     * @param {EditStateParams} params The parameters of the new state.
     */
    transitionEdit({ vectorId }) {
        this.#transition(() => new EditState(this, { vectorId }));
    }

    /**
     * Transitions the state of this context to drawing a vector object.
     */
    transitionDrawVector() {
        this.#transition(() => new DrawVectorState(this));
    }

    /**
     * Transitions the state of this context to editing a vector object.
     * 
     * @param {{ vectorId: UUID }} params The parameters of the new state.
     */
    async transitionEditVector({ vectorId }) {
        const vector = this.dataView.getLabelVector(vectorId);
        const ctx = this.sceneContext;
        const targetTimestamp = vector.timestamp;

        // This check is not required but it can avoid unnecessarily computing the path
        if (ctx.currentFrame != null && !ctx.currentFrame.containsTimestamp(targetTimestamp)) {
            await ctx.displayFrameFromCurrent({ tCenter: targetTimestamp });
        }

        this.transitionEdit({ vectorId });
    }

}
