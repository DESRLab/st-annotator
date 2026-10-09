import { VectorUtils } from '../../utils';

import { SelectionVertexCurator } from './VertexQueryCreator';

/**
 * @typedef {import('three')} THREE 
 */

/**
 * @template T
 * @typedef {import('sta/services/editor/base').InteractController<T>} InteractController 
 */

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
 * @typedef {import('../SelectionCurator').ToolTypes} ToolTypes
 */

/**
 * @typedef {import('./VertexQueryCreator').DrawStage} DrawStage
 */

/**
 * Draws a rectangle box with set of vertices along `x-z` plane to be used 
 * to query a selection from point cloud.
 * 
 * @augments SelectionVertexCurator
 */
export class RectangleCurator extends SelectionVertexCurator {
    /**
     * The type of this object query.
     * 
     * @type {ToolTypes}
     */
    static objQueryType = 'box';

    /**
     * @type {ToolTypes}
     */
    get toolType() { return RectangleCurator.objQueryType; }

    /**
     * Updates how the data of this object query to be stored.
     * 
     * @protected
     * @param {DrawStage} drawStage The stage of drawing of the object query.
     * @param {?{
     *      pointerPixelPos: THREE.Vector2,
     *      pointerNDCPos: THREE.Vector2,
     * }} data If given it updates the state of drawn object.
     */
    updateObjQueryState(drawStage, data) {
        let drawnObjData = this.newDrawnObjData;

        /**
         * @type {VertexGeo}
         */
        const defaultObjData = {
            pixelVertices: [],
            ndcVertices: [],
        };

        if (data === null) {
            drawnObjData = defaultObjData;
        } else {
            const { pointerPixelPos, pointerNDCPos } = data;
            const startPixelPos = drawnObjData.pixelVertices.at(0);
            const startNDCPos = drawnObjData.ndcVertices.at(0);

            switch (drawStage) {
                case 'begin':
                    drawnObjData.pixelVertices = new Array(pointerPixelPos);
                    drawnObjData.ndcVertices = new Array(pointerNDCPos);

                    this.dispatchEvent({ type: drawStage, objQuery: drawnObjData });
                    break;
                case 'resume':
                    if (startPixelPos != null && startNDCPos != null) {
                        drawnObjData.pixelVertices = VectorUtils
                            .setRectangleCoords(startPixelPos, pointerPixelPos);
                        drawnObjData.ndcVertices = VectorUtils
                            .setRectangleCoords(startNDCPos, pointerNDCPos);
                    }
                    break;
                default:
                    drawnObjData = defaultObjData;
            }
        }
        this.newDrawnObjData = drawnObjData;
    }

    /**
     * Creates a new vector object.
     * 
     * @param {WindowPointer} pointer The pointer that interacts with the objects.
     * @param {THREE.Raycaster} raycaster Raycasts the pointer to this set of controls.
     * @param {HTMLCanvasElement} canvas The HTML canvas where this object draws in.
     */
    constructor(pointer, raycaster, canvas) {
        super(pointer, raycaster, canvas);
    }

    /**
     * Triggered when pointer is moved on this object's base element.
     * 
     * @protected
     * @param {ScenePointerEvent} event The corresponding pointer event.
     */
    onPointerMove = (event) => {
        const { enabled, isCreating } = this;
        if (!enabled || !isCreating) return;
        if (event.buttons !== 1) return;

        const pointerPixelPos = this.getPointerPixelPos(event);
        const pointerNDCPos = this.getPointerNDCPos(event);

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

        this.updateObjQueryState('resume', data);
        this.updateDrawInContext(pointerPixelPos);
    };

    /**
     * Triggered when pointer is released this object's base element.
     * 
     * @protected
     * @param {ScenePointerEvent} event The corresponding pointer event.
     */
    onPointerUp = (event) => {
        const { enabled, isCreating } = this;
        if (!enabled || !isCreating) return;
        if (event.buttons !== 0) return;

        this.finish();
    };

    /**
     * Begins drawing a polygon on 2d canvas context.
     * 
     * @protected
     * @param {THREE.Vector2} pointerCoords The current pointer coordinates.
     */
    startDrawInContext(pointerCoords) {
        if (!this.isCreating) return;

        this.context.beginPath();
        this.context.strokeStyle = this.strokeColor.getStyle();
        this.context.lineWidth = this.strokeWidth;
    }

    /**
     * Continues drawing a polygon on 2d canvas context while pointer is moving.
     * 
     * @protected
     * @param {THREE.Vector2} pointerCoords The current pointer coordinates.
     */
    updateDrawInContext(pointerCoords) {
        const { isCreating, newDrawnObjData } = this;
        if (!isCreating) return;

        this.clearCanvas();

        const topLeftPos = newDrawnObjData.pixelVertices.at(0);
        if (topLeftPos != null) {
            const width = pointerCoords.x - topLeftPos.x;
            const height = pointerCoords.y - topLeftPos.y;

            this.startDrawInContext(pointerCoords);

            this.context.rect(topLeftPos.x, topLeftPos.y, width, height);
            this.context.stroke();
        }
    }
}
