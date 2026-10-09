import { Placeholder } from 'sta/services/editor/base';

import { LabelSelection } from '../data/LabelSelection';
import { VectorUtils } from '../utils';

import { InteractState } from './InteractState';

/**
 * @typedef {import('three')} THREE
 */

/**
 * @typedef {import('../controls').SelectionEditControls} SelectionEditControls
 */

/**
 * @typedef {import('../data').ReadonlyLabelSelection} ReadonlyLabelSelection
 */

/**
 * @typedef {import('../data').SelectionParams} SelectionParams
 */

/**
 * @typedef {import('../data').UUID} UUID
 */

/**
 * @typedef {import('../widgets').EditMode} EditMode
 */

/**
 * @template {MainWindowMapper} WM 
 * @typedef {import('./InteractContext').InteractContext<WM>} InteractContext
 */

/**
 * @typedef {import('./InteractState').MainWindowMapper} MainWindowMapper
 */

/**
 * @typedef {import('./InteractState').InteractContextUsage} InteractContextUsage
 */

/**
 * @typedef {import('../tools').ObjQuery} ObjQuery
 */

/**
 * @typedef {import('./InteractContext').LabelInspectorUsage} LabelInspectorUsage
 */

/**
 * @template {ObjQuery} T
 * @typedef {import('../tools').SelectionCurator<T>} SelectionCurator 
 */

/**
 * @typedef {object} EditStateParams
 * @property {?UUID} instanceId The unique identifier of the object instance to edit.
 * @property {?UUID} selectionId The unique identifier of the selection to edit.
 */

/**
 * Represents the state when the user can create a vector object.
 * 
 * @template {MainWindowMapper} WM The windows defined in the scene display.
 * @augments InteractState<WM>
 */
export class DrawSelectionState extends InteractState {

    /**
     * @type {?SelectionCurator<ObjQuery>}
     */
    get activatedSelectionCurator() { return this.context.activeCurator; }

    /**
     * @type {SelectionEditControls}
     */
    get selectionController() { return this.context.selectionController; }

    /**
     * Whether a vector object is being created.
     * 
     * @type {boolean}
     */
    get isCreatingSelection() { return this.selectionController.isCreating; }

    /**
     * Whether a selection object is being edited.
     * 
     * @type {boolean}
     */
    get isEditingSelection() { return this.selectionController.isEditing; }

    /**
     * 
     * @type {boolean}
     */
    get isCuratorDrawing() { return this.selectionController.isCuratorDrawing; }

    /**
     * The parameters of this state.
     * 
     * @readonly
     * @type {EditStateParams}
     */
    params;

    /**
     * @type {boolean}
     */
    #enabledCameraControl = false;

    /**
     * @type {boolean}
     */
    get enabledCameraControl() { return this.#enabledCameraControl; }

    /**
     * Creates a new state instance.
     * 
     * This is called right before the state of the context is transitioned to this one.
     * 
     * @param {InteractContext<WM>} context The context containing this state.
     * @param {EditStateParams} params The parameters of this state.
     */
    constructor(context, params) {
        super({
            context: context,
            keydownBinds: [
                {
                    keyCombo: 'escape',
                    name: 'cancel create/edit selection',
                    handler: () => {
                        this.#abortEditSelection();
                        this.context.transitionNavigate();
                    },
                },
                {
                    keyCombo: 'g',
                    name: 'finish create selection',
                    handler: () => {
                        if (this.isCuratorDrawing) {
                            this.activatedSelectionCurator?.finish();
                        }
                    },
                },
                {
                    keyCombo: 'delete',
                    name: 'Delete selection',
                    handler: async () => {
                        await this.#deleteSelectedSelection();
                    },
                },
            ],
        });

        this.params = params;
        this.context.setPointCloudNDC();
        this.#setup(this.params);
    }

    /**
     * Setups this object.
     * 
     * @param {EditStateParams} params The parameters to this method.
     */
    #setup({ instanceId, selectionId }) {
        const {
            instanceInspector, selectionInspector,
            selectionMonitor, selectionController,
            selectionSelector,
        } = this.context;

        instanceInspector.selectedId = instanceId;
        selectionInspector.selectedId = selectionId;

        const selection = selectionInspector.selectedSelection;

        selectionController.select(selection);

        if (selection) {
            selectionSelector.selectedObj = selection;
            selectionMonitor.selection = selection;
        } else {
            selectionSelector.selectedObj = null;
        }
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     * 
     * This is called right before the state of the context is transitioned from this one.
     */
    dispose() {
        this.context.selectionSelector.selectedObj = null;
        this.selectionController?.abort();

        super.dispose();
    }

    /**
     * Gets the CSS class (without `cursor-` prefix) for the main window
     * while the user is not actively drawing.
     * 
     * @returns {string} The requested class.
     */
    #getPassiveCursorClass() {
        const drawMode = this.context.drawMode;

        switch (drawMode) {
            case 'polygon':
                return 'crosshair';
            case 'box':
                return 'crosshair';
            case 'lasso':
                return 'crosshair';
            case 'brush':
                return 'none';
            default:
                return 'default';
        }
    }

    /**
     * Specifies how this state uses the context.
     * 
     * This is called during each animation frame, and when an event is emitted by a component.
     * 
     * @param {boolean} isReadonly `true` if the labels cannot be edited; otherwise, `false`.
     * @returns {InteractContextUsage} The requested information.
     */
    getUsage(isReadonly) {
        const { isCreatingSelection, isEditingSelection } = this;

        let cursorClass;
        if (isReadonly) {
            cursorClass = 'not-allowed';
        } else {
            cursorClass = this.#getPassiveCursorClass();
        }

        /**
         * @type {LabelInspectorUsage}
         */
        let labelInspectorUsage = {
            enabled: isCreatingSelection || isEditingSelection,
        };

        if (isEditingSelection) {
            labelInspectorUsage = {
                selectInstance: ({ value: instance }) => {
                    const instanceId = instance?.id ?? null;
                    const { selectionId } = this.params;

                    this.context.transitionEdit({ instanceId, selectionId });
                },
                selectSelection: async ({ value: selection }) => {
                    const selectionId = selection?.id ?? null;

                    if (selectionId == null) {
                        const { instanceId } = this.params;

                        this.context.transitionEdit({ instanceId, selectionId });
                    } else {
                        await this.context.transitionEditSelection({ selectionId });
                    }
                },
            };
        }

        return {
            mainWindow: {
                cursorClass: cursorClass,
                controlCamera: false,
                hiddenCanvas: false,
            },
            data: {
                beforeLoad: () => {
                    // Ensure the components are operating on the correct object
                    // in case it gets replaced
                    this.#setup(this.params);
                },
                afterLoad: () => {
                    // Ensure the components are operating on the correct object
                    // in case it gets replaced
                    this.#setup(this.params);
                },
                branchEdit: () => {
                    // Ensure the components are operating on the correct object
                    // in case it gets replaced
                    this.#setup(this.params);
                },
            },
            selectionSelector: isReadonly ? undefined : { hover: false },
            selectionController: isReadonly ? undefined : {
                update: async (event) => {
                    const { obj, mode, prevSelectionData } = event;

                    const newSelectionData = {
                        points: obj.points,
                    };

                    obj.getSelection().pointCoords = prevSelectionData.pointCoords;

                    if (newSelectionData.points.length === 0) {
                        await this.#deleteSelectedSelection();
                    } else {
                        await this.context.dataView
                            .updateLabelPointSelection(obj, mode, newSelectionData.points);
                    }
                },
                create: async (event) => {
                    const selection = this.#createSelection(event.newSelectionData.pointCoords);
                    if (selection !== null) {
                        const { dataView, instanceInspector } = this.context;

                        if (selection.entityId == null) {
                            const instanceParams = instanceInspector.getInstanceParams();
                            const newInstance = await dataView.addLabelInstance(instanceParams);

                            if (!(selection instanceof LabelSelection)) {
                                throw new Error('Incorrect type of label selection');
                            }

                            selection.entityId = newInstance.id;
                        }

                        const newSelection = await dataView.addLabelSelection(selection);

                        await this.context
                            .transitionEditSelection({ selectionId: newSelection.id });

                        this.#disposeSelection(selection);
                    }
                },
            },
            labelInspector: isReadonly ? undefined : labelInspectorUsage,
        };
    }

    /**
     * Updates the point clouds in tree structure.
     * 
     * @param {EditMode} mode The modification mode.
     * @param {THREE.Vector3[]} newSelectionPoints The newly modified points 
     * belonging to a selection.
     * @param {THREE.Vector3[]} oldSelectionPoints  The old points belonging to a selection.
     */
    #updatePcdUtilsTree(mode, newSelectionPoints, oldSelectionPoints = []) {
        if (this.context.pointCloudUtils != null) {
            if (mode === 'add') {
                for (const point of newSelectionPoints) {
                    this.context.pointCloudUtils
                        .tree.remove(VectorUtils.vectorToBBox(point));
                }
            } else {
                const disjointPoints = VectorUtils
                    .findDisjoint(oldSelectionPoints, newSelectionPoints);
                this.context.pointCloudUtils
                    .tree.load(VectorUtils.vectorsToBBoxes(disjointPoints));
            }
        }
    }

    /**
     * Creates a selection by given selection points.
     * 
     * @param {ReadonlyArray<THREE.Vector3>} selectionPoints The points shaping a 
     * selection object.
     * @returns {?ReadonlyLabelSelection} The newly created selection.
     */
    #createSelection(selectionPoints) {
        if (selectionPoints.length === 0) return null;
        const { sceneContext, dataView, pointCloudUtils } = this.context;

        const format = sceneContext.config.coordinateFormat;
        const currentTimestamp = sceneContext.currentFrame?.getTimestampCenter() ?? null;
        const points = selectionPoints.map((point) => format.toDatabaseCoords(point));

        /**
         * @type {?SelectionParams}
         */
        let selectionParams = null;

        selectionParams = {
            id: new Placeholder(),
            points: points,
            timestamp: currentTimestamp,
            entityId: null,
            showPointSize: pointCloudUtils?.pointSize,
        };

        const selection = dataView.addLabelSelectionLocalOnly(selectionParams);

        return selection;
    }

    /**
     * Disposes the new selection.
     * 
     * @param {ReadonlyLabelSelection} selection The newly created selection.
     */
    #disposeSelection(selection) {
        const { dataView } = this.context;
        dataView.deleteLabelSelectionLocalOnly(selection);
    }

    /**
     * Gets the text to display as a hint to the user when this layer is active.
     * 
     * If the text is an empty string, no hint is displayed.
     * 
     * @param {boolean} isReadonly `true` if the labels cannot be edited; otherwise, `false`.
     * @returns {string} The requested hint.
     */
    getHint(isReadonly) {
        const { isCreatingSelection, activatedSelectionCurator } = this;
        if (activatedSelectionCurator !== null) {
            if (isCreatingSelection) {
                const selectedTool = activatedSelectionCurator.toolType;
                let hint = '';
                switch (selectedTool) {
                    case 'brush':
                        hint = 'Release left pointer to pause drawing, or press [Esc] to abort, or press [g] to finish';
                        break;
                    default:
                        hint = 'Release left pointer to finish drawing, or press [Esc] to abort, or press [g] to finish';
                }
                return hint;
            }
        }

        return `Click and drag to draw ${activatedSelectionCurator?.toolType} to query points, or press [Esc] to cancel`;
    }

    /**
     * Cancels transformation of the current selection, if any.
     */
    #abortEditSelection() {
        this.context.selectionSelector.selectedObj = null;
        this.context.selectionController.abort();
        this.context.transitionNavigate();
    }

    /**
     * Deletes the selected selection, if any, from the scene.
     */
    async #deleteSelectedSelection() {
        const selection = this.context.selectionInspector.selectedSelection;
        if (selection) {
            this.context.dataView.deleteLabelSelection(selection);

            this.context.transitionNavigate();
        }
    }
}
