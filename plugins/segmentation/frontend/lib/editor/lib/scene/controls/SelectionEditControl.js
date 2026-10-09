import * as THREE from 'three';

import { ThreeUtils } from 'sta/common/utils';

import { EditModePaneController } from '../widgets';
import { VectorUtils } from '../utils';

/* eslint-disable max-len */
/**
 * @typedef {import('sta/services/editor/base').WindowPointer} WindowPointer
 */

/**
 * @typedef {import('sta/services/editor/base').PaneControllerDataTypes} PaneControllerDataTypes
 */

/**
 * @template {PaneControllerDataTypes} P
 * @typedef {import('sta/services/editor/base').PaneControllerChangeEvent<P>} PaneControllerChangeEvent
 */

/**
 * @typedef {import('../data').ReadonlyLabelSelection} ReadonlyLabelSelection
 */

/**
 * @typedef {import('../data/LabelSelection').PropertyChangeEvent} PropertyChangeEvent
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
 * @template {ParametricGeo | VertexGeo} T
 * @typedef {import('../tools').SelectionCuratorEventMap<T>} SelectionCuratorEventMap
 */

/**
 * @template {ParametricGeo | VertexGeo} T
 * @typedef {import('../tools').SelectionCurator<T>} SelectionCurator 
 */

/**
 * @typedef {import('../widgets').EditMode} EditMode
 */

/**
 * @typedef {import('../utils').PointCloudUtils} PointCloudUtils
 */

/**
 * @typedef {import('../widgets/EditModePane').EditModePaneControllerParams} EditModePaneControllerParams
 */
/* eslint-enable max-len */

/**
 * @typedef {{box: RectangleCurator, 
 *     polygon: PolygonCurator, 
 *     lasso: LassoCurator, 
 *     brush: BrushCurator
 * }} SelectionCurators 
 */

/**
 * @typedef {ParametricGeo | VertexGeo} ObjQuery
 */

/**
 * Represents the local selection.
 * 
 * @typedef {Readonly<{
 *     pointCoords: ReadonlyArray<THREE.Vector3>;
 *     centerPoint: Readonly<THREE.Vector3>;
 * }>} LocalSelectionData
 */

/**
 * @typedef {{
 *     newSelectionData: { pointCoords: ReadonlyArray<THREE.Vector3> }; 
 * }} CreateSelectionEvent
 */

/**
 * @typedef {{
 *     obj: ReadonlyLabelSelection;
 *     mode: EditMode;
 *     prevSelectionData: { pointCoords: ReadonlyArray<THREE.Vector3> }; 
 * }} UpdateSelectionEvent
 */

/**
 * Defines each event that can be dispatched by {@link SelectionEditControls}.
 * 
 * @typedef {object} SelectionEditControlsEventMap
 * @property {CreateSelectionEvent} create The event when a new selection has been created.
 * @property {{ obj: ?ReadonlyLabelSelection }} begin The event when modifying
 * a selection has begun.
 * @property {{ obj: ?ReadonlyLabelSelection }} abort The event when modifying
 * a selection has been aborted.
 * @property {UpdateSelectionEvent} update The event when a selection has been updated.
 */

/**
 * Handles creation of a selection as well as modifications. 
 * 
 * @augments THREE.EventDispatcher<SelectionEditControlsEventMap>
 */
export class SelectionEditControls extends THREE.EventDispatcher {
    /**
     * The DOM element representing this object.
     * 
     * @readonly
     * @type {HTMLDivElement}
     */
    dom;

    /**
     * @type {?PointCloudUtils}
     */
    #pcdUtils = null;

    /**
     * @type {?PointCloudUtils}
     */
    get pcdUtils() { return this.#pcdUtils; }

    set pcdUtils(value) {
        if (this.#pcdUtils !== value) {
            this.#pcdUtils = value;
        }
    }

    /**
     * @type {THREE.Camera}
     */
    #camera;

    /**
     * @type {THREE.Camera}
     */
    get camera() { return this.#camera; }

    /**
     * @type {THREE.Camera}
     */
    set camera(value) {
        if (this.#camera !== value) {
            this.#camera = value;
        }
    }

    /**
     * @type {?SelectionCurator<ObjQuery>}
     */
    get activateCurator() {
        return Object.values(this.curators)
            .filter((curator) => curator.enabled === true).at(0) ?? null;
    }

    /**
     * a set of objQuery creators to draw specific objQuery type.
     * 
     * @readonly
     * @type {SelectionCurators}
     */
    curators;

    /**
     * The selection's coordinate data at the beginning of the current
     * edit state.
     * 
     * @type {?LocalSelectionData}
     */
    #startSelection = null;

    /**
     * @type {?ReadonlyLabelSelection}
     */
    #currentObj = null;

    /**
     * selection points that were painted by brush.
     * 
     * @type {THREE.Vector3[]}
     */
    #paintedMask = [];

    /**
     * The object to be modified, if any.
     * It is modified during the transformation.
     * 
     * @type {?ReadonlyLabelSelection}
     */
    get selectedObj() { return this.#currentObj; }

    /**
     * Sets or unsets the stored state of an object.
     * 
     * @param {?ReadonlyLabelSelection} obj If given, sets the state to 
     * begin modifying this object; otherwise, 
     * unsets the state to finish modifying the current object.
     */
    #setState(obj) {
        if (obj == null) {
            this.#currentObj?.removeEventListener('change', this.#onObjChanged);

            this.#startSelection = null;
            this.#currentObj = null;
        } else {
            const currentObj = obj;

            this.#startSelection = {
                pointCoords: [...currentObj.pointCoords],
                centerPoint: currentObj.centerPoint.clone(),
            };

            currentObj.addEventListener('change', this.#onObjChanged);

            this.#currentObj = currentObj;
        }
    }

    /**
     * @type {boolean}
     */
    #disabled = false;

    /**
     * `true` if this editor is disabled; otherwise, `false.`
     * 
     * If set to `true` while an object is being modified, aborts the process.
     * 
     * @type {boolean}
     */
    get disabled() { return this.#disabled; }

    set disabled(value) {
        if (this.#disabled !== value) {
            this.#disabled = value;

            if (value) {
                this.abort();
            }

            this.render();
        }
    }

    /**
     * 
     * @readonly 
     * @type {EditModePaneController}
     */
    #editModeInput;

    /**
     * @type {EditMode}
     */
    #editMode = 'add';

    /**
     * The edit mode to modify a selection.
     * 
     * @type {EditMode}
     */
    get editMode() { return this.#editMode; }

    /**
     * 
     * @type {boolean}
     */
    get isCuratorDrawing() {
        const activeCurator = this.activateCurator;

        return activeCurator ? activeCurator.isCreating : false;
    }

    /**
     * 
     * @type {boolean}
     */
    get hasSelection() { return this.#currentObj != null; }

    /**
     * 
     * @type {boolean}
     */
    get isCreating() { return !this.hasSelection && !this.disabled && this.editMode === 'add'; }

    /**
     * 
     * @type {boolean}
     */
    get isEditing() { return this.hasSelection && !this.disabled; }

    /**
     * Handles the event when the user action is changed.
     * 
     * @param {PaneControllerChangeEvent<EditModePaneControllerParams>} event
     * The event to handle.
     */
    #onEditModeChange = (event) => {
        const editMode = event.outputData.editMode;

        this.#editMode = editMode;
    };

    /**
     * Creates a new object editor.
     * 
     * @param {SelectionCurators} selectionCurators The curator tools to query 
     * point selection based on drawn geometry objects by curators.
     */
    constructor(selectionCurators) {
        super();

        this.curators = selectionCurators;

        this.dom = document.createElement('div');
        {
            this.#editModeInput = EditModePaneController.create(this.dom, {
                inputtedData: {
                    editMode: 'add',
                },
            });
        }

        this.#editModeInput.bindOutputData(this.#onEditModeChange);

        /** @type {ReadonlyArray<THREE.EventDispatcher<SelectionCuratorEventMap<ObjQuery>>>} */
        const curators = Object.values(this.curators);
        for (const curator of curators) {
            curator.addEventListener('begin', this.#onCuratorBegin);
            curator.addEventListener('end', this.#onCuratorEnd);
            curator.addEventListener('pause', this.#onCuratorPause);
        }

        this.#editMode = this.#editModeInput.outputData.editMode;
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.#editModeInput.dispose();

        /** @type {ReadonlyArray<THREE.EventDispatcher<SelectionCuratorEventMap<ObjQuery>>>} */
        const curators = Object.values(this.curators);
        for (const curator of curators) {
            curator.removeEventListener('begin', this.#onCuratorBegin);
            curator.removeEventListener('end', this.#onCuratorEnd);
            curator.removeEventListener('pause', this.#onCuratorPause);
        }
    }

    /**
     * Reset the current object when the object is modified 
     * from undo and redo.
     * 
     * @param {PropertyChangeEvent} event The event to handle.
     */
    #onObjChanged = (event) => {
        const currentObj = this.#currentObj;
        const startSelection = this.#startSelection;
        if (currentObj == null || startSelection == null) return;

        if (event.propertyKey === 'points') {
            if (!ThreeUtils.areVerticesEqual(event.obj.pointCoords, startSelection.pointCoords)) {
                this.#setState(event.obj);
            }
        }
    };

    /**
     * Sets the start state of editing a selection object.
     * 
     * @param {SelectionCuratorEventMap<ObjQuery>['begin']} event the event to handle.
     */
    #onCuratorBegin = (event) => {
        if (this.disabled) return;

        const currentObj = this.#currentObj;
        this.#setState(currentObj);

        this.dispatchEvent({ type: 'begin', obj: currentObj });

        if (Object.hasOwn(event.objQuery, 'center')) {
            const currentMasks = this.#paintedMask;
            const pointsInObjQuery = this.#getPointsInObjQuery(event.objQuery);
            this.#paintedMask = VectorUtils.concatRemoveDuplicates(currentMasks, pointsInObjQuery);
        }
    };

    /**
     * @param {SelectionCuratorEventMap<ObjQuery>['end']} event event The event to handle.
     */
    #onCuratorEnd = (event) => {
        if (this.disabled) return;

        const pointsInObjQuery = this.#getPointsInObjQuery(event.objQuery);
        this.#checkpoint(pointsInObjQuery);
    };

    /**
     * @param {SelectionCuratorEventMap<ObjQuery>['pause']} event event The event to handle.
     */
    #onCuratorPause = (event) => {
        let currentMask = this.#paintedMask;
        const pointsInObjQuery = this.#getPointsInObjQuery(event.objQuery);
        currentMask = VectorUtils.concatRemoveDuplicates(currentMask, pointsInObjQuery);
        this.#paintedMask = [];

        this.#checkpoint(currentMask);
    };

    /**
     * Finds the points inside object query drawn by curator tools.
     * 
     * @param {ObjQuery} objQuery The object query to filter the points from.
     * @returns {THREE.Vector3[]} The resulting points inside object geometry.
     */
    #getPointsInObjQuery(objQuery) {
        const { pcdUtils, activateCurator, editMode } = this;
        if (pcdUtils == null || activateCurator == null) return [];

        const currentObj = this.#currentObj;

        /**
         * @type {THREE.Vector3[]}
         */
        let queriedPoints = [];

        if (editMode === 'erase' && currentObj != null) {
            queriedPoints = activateCurator
                .queryPointsFromBuffer([...currentObj.pointCoords], objQuery);
        } else {
            queriedPoints = activateCurator
                .queryPointsFromTree(pcdUtils.tree, objQuery);
        }

        return queriedPoints;
    }

    /**
     * Handles creating a new label selection data or modifying existing
     * selection point. 
     * 
     * @param {THREE.Vector3[]} queriedPoints The points inside the query 
     * geometry object drawn by curator tool.
     */
    #checkpoint(queriedPoints) {
        const editMode = this.editMode;
        const currentObj = this.#currentObj;
        const startSelection = this.#startSelection;

        if (currentObj == null) {
            if (this.isCreating) {
                this.dispatchEvent({ type: 'create', newSelectionData: { pointCoords: queriedPoints } });
            }
        } else {
            if (startSelection == null) return;

            const startPoints = [...startSelection.pointCoords];

            /**
             * @type {THREE.Vector3[]}
             */
            let newPoints = [];

            switch (editMode) {
                case 'add':
                    newPoints = VectorUtils.concatRemoveDuplicates(startPoints, queriedPoints);
                    break;
                case 'erase':
                    newPoints = VectorUtils.findDisjoint(startPoints, queriedPoints);
                    break;
                default:
            }

            currentObj.getSelection().pointCoords = newPoints;

            // if no changes has been made.
            if (startSelection.centerPoint.equals(currentObj.centerPoint)) {
                return;
            }

            const updatedObj = newPoints.length === 0 ? null : currentObj;
            this.#setState(updatedObj);

            this.dispatchEvent({
                type: 'update',
                obj: currentObj,
                mode: this.editMode,
                prevSelectionData: {
                    pointCoords: startSelection.pointCoords,
                },
            });
        }
    }

    /**
     * Selects an object to edit.
     * 
     * @param {?ReadonlyLabelSelection} obj The object to edit.
     * if null is passed, the control creates a new selection object.
     */
    select(obj) {
        if (this.hasSelection) {
            this.deselect();
        }

        this.#setState(obj);
    }

    /**
     * Deselects the object so it can no longer be modified.
     * 
     * This is a no-op if there is no selected box.
     */
    deselect() {
        if (!this.hasSelection) return;

        this.abort();
        this.#setState(null);
    }

    /**
     * Aborts create or editing a label selection data points.
     */
    abort() {
        const { isCuratorDrawing, activateCurator } = this;

        if (isCuratorDrawing) {
            activateCurator?.abort();
        }

        const startSelection = this.#startSelection;
        const currentObj = this.#currentObj;

        if (currentObj != null && startSelection != null) {
            currentObj.getSelection().pointCoords = startSelection.pointCoords;
        }

        this.dispatchEvent({ type: 'abort', obj: currentObj });
    }

    /**
     * Renders the avaiable edit mode inputs. 
     */
    render() {
        this.#editModeInput.updateState({
            inputtedData: {
                editMode: this.editMode,
            },
            settings: {
                disabled: !this.isCreating || !this.isEditing,
                hidden: this.disabled,
            },
        });
    }
}
