import { ThreeUtils } from 'sta/common/utils';

import { VectorUtils } from '../../utils';

import { SelectionCurator } from '../SelectionCurator';

/**
 * @typedef {import('sta/services/editor/base').ScenePointerEvent} ScenePointerEvent
 */

/**
 * @typedef {import('sta/services/editor/base').WindowPointer} WindowPointer
 */

/**
 * @typedef {import('../SelectionCurator').VertexGeo} VertexGeo 
 */

/**
 * @typedef {import('../SelectionCurator').ParametricGeo} ParametricGeo
 */

/**
 * Represents the stages of drawing a complete vector object.
 * 
 * @typedef {'begin' | 'resume' | 'abort' | 'end'} DrawStage 
 */

/**
 * Creates vertex-based geometry to query selection of points.
 * 
 * @abstract
 * @augments {SelectionCurator<VertexGeo>}
 */
export class SelectionVertexCurator extends SelectionCurator {

    /**
     * @type {boolean}
     */
    get isCreating() { return this.newDrawnObjData.pixelVertices.length > 0; }

    /**
     * @type {number}
     */
    #strokeWidth = 3;

    /**
     * The line width of vector object while creating the object.
     * 
     * @type {number}
     */
    get strokeWidth() { return this.#strokeWidth; }

    set strokeWidth(value) {
        if (value != null) {
            if (this.#strokeWidth !== value) {
                this.#strokeWidth = value;
            }
        }
    }

    /**
     * Whether a coordinates already exist in the polygon vertices.
     * 
     * @param {THREE.Vector2} coords The newly registered coordinates 
     * from pointer position.
     * @returns {boolean} Returns true if the coordinate exists in the vertices list.
     */
    isCoordsRepeated(coords) {
        return ThreeUtils.isCoordinatesInArray(this.newDrawnObjData.pixelVertices, coords);
    }

    /**
     * 
     * @protected
     * @abstract
     * @param {DrawStage} drawStage The stage of drawing of the vector object being created.
     * @param {?{
     *      pointerPixelPos: THREE.Vector2,
     *      pointerNDCPos: THREE.Vector2,
     * }} data If given it updates the state of drawn object.
     */
    updateObjQueryState(drawStage, data) {
        throw new Error('Not Implemented');
    }

    /**
     * Creates a new vertex-based object query creator.
     * 
     * @param {WindowPointer} pointer The pointer that interacts with the objects.
     * @param {THREE.Raycaster} raycaster Raycasts the pointer to this set of controls.
     * @param {HTMLCanvasElement} canvas The HTML canvas where this object draws in.
     */
    constructor(pointer, raycaster, canvas) {
        /**
         * @type {VertexGeo}
         */
        const defaultObjData = {
            pixelVertices: [],
            ndcVertices: [],
        };

        super(pointer, raycaster, canvas, defaultObjData);
    }

    /**
     * Filters the points based on the object query drawn.
     * 
     * @protected
     * @param {THREE.Vector3[]} points The points to filter in world space.
     * @param {THREE.Vector3[]} ncdPoints The points to filter in ncd space.
     * @param {VertexGeo} objQuery The object to apply filtering query.
     * @returns {THREE.Vector3[]} The resulted filtered points.
     */
    filterPoints(points, ncdPoints, objQuery) {
        return points.filter((_, i) => VectorUtils.isPointInPolygon(ncdPoints[i], objQuery));
    }

    /**
     * Filters the points based on the object query drawn from buffer array.
     * 
     * @param {THREE.Vector3[]} buffer The buffer array to query points from.
     * @param {VertexGeo} objQuery The object to apply filtering query.
     * @returns {THREE.Vector3[]} The resulted filtered points.
     */
    queryPointsFromBuffer(buffer, objQuery) {
        const camera = this.raycaster.camera;
        const bufferNDC = ThreeUtils.worldCoordsToNDC([...buffer], camera);

        return buffer.filter((_, i) => VectorUtils.isPointInPolygon(bufferNDC[i], objQuery));
    }

    /**
     * Triggered when the pointer is pressed down on this object's base element.
     * 
     * @protected
     * @param {ScenePointerEvent} event The corresponding pointer event.
     */
    onPointerDown = (event) => {
        const { enabled, isCreating } = this;
        if (!enabled) return;
        if (event.buttons !== 1) return;

        const pointerPixelPos = this.getPointerPixelPos(event);
        const pointerNDCPos = this.getPointerNDCPos(event);

        const drawStage = isCreating ? 'resume' : 'begin';
        /**
         * @type {?{ 
         *      pointerPixelPos: THREE.Vector2,
         *      pointerNDCPos: THREE.Vector2,
         * }}
         */
        let data = null;

        data = {
            pointerPixelPos,
            pointerNDCPos,
        };

        this.updateObjQueryState(drawStage, data);

        this.startDrawInContext(pointerPixelPos);
    };

    /**
     * Aborts creating a vector object.
     * 
     * @returns {boolean} returns true if successfully is invoked.
     */
    abort() {
        this.clearCanvas();

        if (!this.isCreating) return false;

        this.updateObjQueryState('abort', null);

        this.dispatchEvent({ type: 'abort', objQuery: this.newDrawnObjData });

        return true;
    }

    /**
     *  Finishes creating a vector object.
     * 
     * @returns {boolean} returns true if successfully is invoked.
     */
    finish() {
        if (!this.isCreating) return false;

        this.clearCanvas();

        const objQuery = this.newDrawnObjData;

        this.updateObjQueryState('end', null);

        this.dispatchEvent({ type: 'end', objQuery: objQuery });

        return true;
    }
}
