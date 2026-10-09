import * as THREE from 'three';

import { SelectSelectionState } from './SelectSelectionState';
import { DrawSelectionState } from './DrawSelectionState';
import { NavigationState } from './NavigationState';

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
 * @typedef {import('../controls').SelectionEditControlsEventMap} SelectionEditControlsEventMap
 */

/**
 * @typedef {import('../controls').SelectionEditControls} SelectionEditControls
 */

/**
 * @typedef {import('../data').SegmentationView} SegmentationView
 */

/**
 * @typedef {import('../data').ReadonlyLabelSelection} ReadonlyLabelSelection
 */

/**
 * @typedef {import('../data').ReadonlyLabelInstance} ReadonlyLabelInstance
 */

/**
 * @typedef {import('../data').UUID} UUID
 */

/**
 * @typedef {import('../data').LabelSelectionReformMonitor} LabelSelectionReformMonitor
 */

/**
 * @typedef {import('../tools').ParametricGeo} ParametricGeo 
 */

/**
 * @typedef {import('../tools').VertexGeo} VertexGeo
 */

/**
 * @typedef {import('../tools').RectangleCurator} RectangleCurator 
 */

/**
 * @typedef {import('../tools').PolygonCurator} PolygonCurator
 */

/**
 * @typedef {import('../tools').LassoCurator} LassoCurator
 */

/**
 * @typedef {import('../tools').BrushCurator} BrushCurator
 */

/**
 * @typedef {import('../tools').ObjQuery} ObjQuery
 */

/**
 * @template {ObjQuery} T
 * @typedef {import('../tools').SelectionCurator<T>} SelectionCurator
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
 * @typedef {import('../widgets').DrawMode} DrawMode 
 */

/**
 * @typedef {import('../widgets/DrawModePane').DrawModePaneControllerParams} DrawModePaneControllerParams
 */

/**
 * @typedef {import('../widgets').LabelSelectionInspectorEventMap} LabelSelectionInspectorEventMap
 */

/**
 * @typedef {import('../widgets').LabelSelectionInspector} LabelSelectionInspector
 */

/**
 * @typedef {import('../widgets').LabelInstanceInspectorEventMap} LabelInstanceInspectorEventMap
 */

/**
 * @typedef {import('../widgets').LabelInstanceInspector} LabelInstanceInspector
 */

/**
 * @typedef {import('../utils').PointCloudUtils} PointCloudUtils 
 */

/**
 * @typedef {import('./DrawSelectionState').EditStateParams} EditStateParams
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
 * @typedef {{
 *     box: RectangleCurator;
 *     polygon: PolygonCurator;
 *     lasso: LassoCurator;
 *     brush: BrushCurator;
 * }} SelectionCurators 
 */

/**
 * @template {MainWindowMapper} WM The windows defined in the scene display.
 * @typedef {object} StateContextParams
 * @property {SceneContext<WM>} sceneContext A handle to the state of the scene.
 * @property {SegmentationView} dataView A view of the data to display in this layer.
 * @property {?PointCloudUtils} pointCloudUtils The copied point cloud of the current source
 * in the frame.
 * @property {HTMLCanvasElement} canvas The 2D canvas in the scene where the drawing of
 * object query takes place.
 * @property {DrawModePaneController} drawModeInput Allows the user to set the mode of drawing
 * objects in the scene.
 * @property {SelectionEditControls} selectionController creates/edits point selection.
 * @property {Selector<ReadonlyLabelSelection>} selectionSelector Interacts with points
 * shaping a selection.
 * @property {LabelSelectionReformMonitor} selectionMonitor Monitors the transform of the
 * selected selection.
 * @property {LabelInstanceInspector} instanceInspector Inspects selected object instance
 * in the scene.
 * @property {LabelSelectionInspector} selectionInspector Inspects selected selection
 * in the scene.
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
 * @typedef {object} SelectionSelectorUsage
 * @property {boolean} [hover=false] Whether the selection selector can hover over objects.
 * @property {(event: SelectorEventMap<ReadonlyLabelSelection>['selectin']) => void} [select]
 * Handles the event when a selection is selected.
 * If not provided, the selection selector cannot select objects.
 */

/**
 * @typedef {object} SelectionControllerUsage
 * @property {boolean} [enabled] whether the controller is enabled.
 * @property {(event: SelectionEditControlsEventMap['begin']) =>  void} [begin] Handles the event
 * when a selection has been created newly or updated.
 * @property {(event: SelectionEditControlsEventMap['abort']) =>  void} [abort] Handles the event
 * when creating or updating a selection has been terminated.
 * @property {(event: SelectionEditControlsEventMap['create']) => void} [create] Handles the event
 * when a new selection has been created.
 * @property {(event: SelectionEditControlsEventMap['update']) => void} [update] Handles the event
 * when a selection has been updated.
 */

/**
 * @typedef {object} LabelInspectorUsage
 * @property {boolean} [enabled] Whether the inspector is enabled. Defaults to `true` if
 * any event handler is set; otherwise, defaults to `false`.
 * @property {(event: LabelInstanceInspectorEventMap['select-instance']) => void} [selectInstance]
 * Handles the event when an object track is selected through the inspector.
 * @property {(event: LabelSelectionInspectorEventMap['select-selection']) => void
 * } [selectSelection] Handles the event when a selection is selected through the inspector.
 */

/**
 * Omitting a component indicates that it is unused;
 * this automatically disables it within the context (if possible).
 * 
 * @typedef {object} InteractContextUsage
 * @property {MainWindowUsage} [mainWindow={}] Specifies the usage of the main window.
 * @property {LabelDataUsage} [data={}] Specifies the usage of the labels.
 * @property {SelectionSelectorUsage} [selectionSelector={}] Specifies the usage of the
 * selection selector.
 * @property {SelectionControllerUsage} [selectionController={}] specifies the usage of the
 * selection controler.
 * @property {LabelInspectorUsage} [labelInspector={}] Specifies the usage of the label inspector.
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
     * A view of the data to display in this layer.
     * 
     * @readonly
     * @type {SegmentationView}
     */
    dataView;

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
     * @type {?PointCloudUtils}
     */
    #pointCloudUtils = null;

    /**
     * @type {?PointCloudUtils}
     */
    get pointCloudUtils() { return this.#pointCloudUtils; }

    set pointCloudUtils(value) {
        if (this.#pointCloudUtils !== value) {
            this.#pointCloudUtils = value;

            this.selectionController.pcdUtils = value;
            this.setPointCloudNDC();
        }
    }

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
     * Inspects selected object instances in the scene.
     * 
     * @readonly
     * @type {LabelInstanceInspector}
     */
    instanceInspector;

    /**
     * Inspects selected selection in the scene.
     * 
     * @readonly
     * @type {LabelSelectionInspector}
     */
    selectionInspector;

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
     * @type {THREE.Camera}
     */
    #activeCamera;

    /**
     * @type {THREE.Camera}
     */
    get activeCamera() { return this.#activeCamera; }

    /**
     * @type {?SelectionCurator<ObjQuery>}
     */
    get activeCurator() {
        return this.selectionController.activateCurator;
    }

    /**
     * Interacts with the selection objects in the scene.
     * 
     * @readonly
     * @type {Selector<ReadonlyLabelSelection>}
     */
    selectionSelector;

    /**
     * Manages creation/modification of selection objects.
     * 
     * @readonly
     * @type {SelectionEditControls}
     */
    selectionController;

    /**
     * 
     * @readonly
     * @type {LabelSelectionReformMonitor}
     */
    selectionMonitor;

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
     * Handles the event when the pointer selects a selection.
     * 
     * @param {SelectorEventMap<ReadonlyLabelSelection>['selectin']} event The event to handle.
     */
    #onPointerSelectSelection = (event) => {
        this.currentState?.getUsage(this.#prevIsReadonly).selectionSelector?.select?.(event);
    };

    /**
     * Handles the event when the user has started drawing a new obj query object.
     * 
     * @param {SelectionEditControlsEventMap['begin']} event The event to handle.
     */
    #onBeginSelectionController = (event) => {
        this.currentState?.getUsage(this.disabled).selectionController?.begin?.(event);
    };

    /**
     * Handles the event when the user has cancelled drawing a new obj query object.
     * 
     * @param {SelectionEditControlsEventMap['abort']} event The event to handle.
     */
    #onAbortSelectionController = (event) => {
        this.currentState?.getUsage(this.disabled).selectionController?.abort?.(event);
    };

    /**
     * Handles the event when the user has finished drawing a new obj query object.
     * 
     * @param {SelectionEditControlsEventMap['create']} event The event to handle.
     */
    #onCreateSelection = async (event) => {
        this.currentState?.getUsage(this.disabled).selectionController?.create?.(event);
    };

    /**
     * Handles the event when the user has finished modifying an obj query object.
     * 
     * @param {SelectionEditControlsEventMap['update']} event The event to handle.
     */
    #onUpdateSelection = async (event) => {
        this.currentState?.getUsage(this.disabled).selectionController?.update?.(event);
    };

    /**
     * Handles the event when the inspector selects an instance object.
     * 
     * @param {LabelInstanceInspectorEventMap['select-instance']} event The event to handle. 
     */
    #onInspectorSelectInstance = (event) => {
        this.currentState?.getUsage(this.disabled).labelInspector?.selectInstance?.(event);
    };

    /**
     * Handles the event when the inspector selects a selection.
     * 
     * @param {LabelSelectionInspectorEventMap['select-selection']} event The event to handle.
     */
    #onInspectorSelectSelection = (event) => {
        this.currentState?.getUsage(this.disabled).labelInspector?.selectSelection?.(event);
    };

    /**
     * Handles the event when the inspector toggles the draw box button.
     * 
     * @param {LabelSelectionInspectorEventMap['toggle-drawSelection']} event The event to handle.
     */
    #onInspectorToggleDrawSelection = (event) => {
        this.actionInput.toggleDraw();
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
     * Handles the event when the view mode is changed.
     */
    #onViewModeChange = () => {
        const { mainWindow } = this;
        const { viewMode } = mainWindow;

        if (viewMode === '2D') {
            this.#activeCamera = mainWindow.camera2D;
        } else if (viewMode === '3D') {
            this.#activeCamera = mainWindow.camera3D;
        }

        this.selectionController.camera = this.activeCamera;
    };

    /**
     * Handles the event when the user action is changed.
     * 
     * @param {PaneControllerChangeEvent<DrawModePaneControllerParams>} event
     * The event to handle.
     */
    #onDrawModeChange = (event) => {
        for (const [type, curator] of Object.entries(this.selectionController.curators)) {
            curator.enabled = (this.action === 'draw' && type === event.outputData.drawMode);
        }
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
            case 'navigate':
                if (!(currentState instanceof NavigationState)) {
                    this.transitionNavigate();
                }
                break;
            case 'select':
                if (!(currentState instanceof SelectSelectionState)) {
                    this.transitionSelectSelection();
                }
                break;
            case 'draw':
                if (!(currentState instanceof DrawSelectionState)) {
                    this.transitionDrawSelection();
                }
                break;
            default:
                throw new Error(`Unknown action: ${action}`);
        }

        this.#renderState();
    };

    /**
     * Scans the point cloud into camera coordinates.
     */
    setPointCloudNDC() {
        const { pointCloudUtils, activeCamera } = this;
        if (pointCloudUtils == null) return;

        const points = [...pointCloudUtils.buffer.getCoords()];

        pointCloudUtils.pointsInNDC = points.map((point) => point
            .clone().project(activeCamera));
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
     * Updates the selected action based on the current state.
     */
    #renderState = () => {
        const { actionInput, currentState, selectionInspector } = this;
        if (currentState == null || currentState instanceof NavigationState) {
            actionInput.updateInputtedData({ action: 'navigate' });
        } else if (currentState instanceof SelectSelectionState) {
            actionInput.updateInputtedData({ action: 'select' });
        } else if (currentState instanceof DrawSelectionState) {
            actionInput.updateInputtedData({ action: 'draw' });
        } else {
            throw new Error(`Unhandled state type: ${JSON.stringify(currentState)}`);
        }

        selectionInspector.drawSelectionActive = (currentState instanceof DrawSelectionState);
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
        this.selectionSelector = params.selectionSelector;
        this.drawModeInput = params.drawModeInput;
        this.actionInput = params.actionInput;
        this.selectionMonitor = params.selectionMonitor;

        this.dataView.addEventListener('beforeload', this.#onBeforeDataLoad);
        this.dataView.addEventListener('afterload', this.#onAfterDataLoad);
        this.dataView.context.addEventListener('edit-branch', this.#onEditBranch);

        this.#pointCloudUtils = params.pointCloudUtils;

        this.selectionInspector = params.selectionInspector;
        this.selectionInspector.addEventListener('select-selection', this.#onInspectorSelectSelection);
        this.selectionInspector.addEventListener('toggle-drawSelection', this.#onInspectorToggleDrawSelection);
        this.selectionInspector.addEventListener('select-instance', this.#onInspectorSelectInstance);

        this.instanceInspector = params.instanceInspector;
        this.instanceInspector.addEventListener('select-instance', this.#onInspectorSelectInstance);

        this.selectionSelector.addEventListener('selectin', this.#onPointerSelectSelection);

        this.selectionController = params.selectionController;
        this.selectionController.addEventListener('begin', this.#onBeginSelectionController);
        this.selectionController.addEventListener('abort', this.#onAbortSelectionController);
        this.selectionController.addEventListener('create', this.#onCreateSelection);
        this.selectionController.addEventListener('update', this.#onUpdateSelection);

        this.mainWindow.addEventListener('viewMode-change', this.#onViewModeChange);
        this.drawModeInput.bindOutputData(this.#onDrawModeChange);
        this.actionInput.bindOutputData(this.#onActionChange);

        this.#onViewModeChange();
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.dataView.removeEventListener('beforeload', this.#onBeforeDataLoad);
        this.dataView.removeEventListener('afterload', this.#onAfterDataLoad);
        this.dataView.context.removeEventListener('edit-branch', this.#onEditBranch);

        this.selectionSelector.removeEventListener('selectin', this.#onPointerSelectSelection);
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
            selectionController, selectionSelector,
            selectionInspector, instanceInspector,
        } = this;

        canvas.hidden = !!(usage.mainWindow?.hiddenCanvas);

        selectionSelector.hoverEnabled = !!(usage.selectionSelector?.hover) && layerIsActive;
        selectionSelector.selectEnabled = !!(usage.selectionSelector?.select) && layerIsActive;

        if (usage.selectionController && 'enabled' in usage.selectionController) {
            selectionController.disabled = !(usage.selectionController?.enabled) && layerIsActive;
        } else {
            selectionController.disabled = !(usage.selectionController?.create
                || usage.selectionController?.begin || usage.selectionController?.abort
                || usage.selectionController?.update);
        }

        for (const [type, curator] of Object.entries(selectionController.curators)) {
            curator.enabled = (action === 'draw' && type === drawMode && layerIsActive);
        }

        if (usage.labelInspector && 'enabled' in usage.labelInspector) {
            selectionInspector.disabled = !usage.labelInspector?.enabled;
            instanceInspector.disabled = !usage.labelInspector?.enabled;
        } else {
            selectionInspector.disabled = !(usage.labelInspector?.selectSelection);
            instanceInspector.disabled = !(usage.labelInspector?.selectInstance);
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
        this.#transition(() => new NavigationState(this));
    }

    /**
     * Transitions the state of this context to selecting a selection.
     */
    transitionSelectSelection() {
        this.#transition(() => new SelectSelectionState(this));
    }

    /**
     * Transitions the state of this context to drawing a selection.
     */
    transitionDrawSelection() {
        this.#transition(() => new DrawSelectionState(this,
            { instanceId: null, selectionId: null }));
    }

    /**
     * Transitions the state of this context to editing some labels.
     * 
     * @param {EditStateParams} params The parameters of the new state.
     */
    async transitionEdit({ instanceId, selectionId }) {
        this.#transition(() => new DrawSelectionState(this, { instanceId, selectionId }));
    }

    /**
     * Transitions the state of this context to editing a selection.
     * 
     * @param {{ selectionId: UUID }} params The parameters of the new state.
     */
    async transitionEditSelection({ selectionId }) {
        const selection = this.dataView.getLabelSelection(selectionId);
        const instanceId = selection.entityId ?? null;

        const ctx = this.sceneContext;
        const targetTimestamp = selection.timestamp;

        // This check is not required but it can avoid unnecessarily computing the path
        if (ctx.currentFrame != null && !ctx.currentFrame.containsTimestamp(targetTimestamp)) {
            await ctx.displayFrameFromCurrent({ tCenter: targetTimestamp });
        }

        this.transitionEdit({ instanceId, selectionId });
    }
}
