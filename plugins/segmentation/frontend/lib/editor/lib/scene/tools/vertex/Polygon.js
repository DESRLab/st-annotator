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
 * Draws a polygon with set of vertices along `x-z` plane to be used 
 * to query a selection from point cloud.
 * 
 * @augments SelectionVertexCurator
 */
export class PolygonCurator extends SelectionVertexCurator {

    /**
     * The type of this object query.
     * 
     * @type {ToolTypes}
     */
    static objQueryType = 'polygon';

    /**
     * @type {ToolTypes}
     */
    get toolType() { return PolygonCurator.objQueryType; }

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

            switch (drawStage) {
                case 'begin':
                    drawnObjData.pixelVertices = new Array(pointerPixelPos);
                    drawnObjData.ndcVertices = new Array(pointerNDCPos);

                    this.dispatchEvent({ type: drawStage, objQuery: drawnObjData });
                    break;
                case 'resume':
                    if (!this.isCoordsRepeated(pointerPixelPos)) {
                        drawnObjData.pixelVertices.push(pointerPixelPos);
                        drawnObjData.ndcVertices.push(pointerNDCPos);
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

        const pointerCoords = this.getPointerPixelPos(event);
        this.startDrawInContext(pointerCoords);
        this.updateDrawInContext(pointerCoords);
    };

    /**
     * Triggered when pointer is released this object's base element.
     * 
     * @protected
     * @param {ScenePointerEvent} event The corresponding pointer event.
     */
    onPointerUp = (event) => {
    };

    /**
     * Begins drawing a polygon on 2d canvas context.
     * 
     * @protected
     * @param {THREE.Vector2} pointerCoords The current pointer coordinates.
     */
    startDrawInContext(pointerCoords) {
        const { isCreating, newDrawnObjData } = this;
        if (!isCreating) return;

        this.context.beginPath();
        this.context.strokeStyle = this.strokeColor.getStyle();
        this.context.lineWidth = this.strokeWidth;

        const vertices = newDrawnObjData.pixelVertices;

        for (const vertex of vertices) {
            this.context.lineTo(vertex.x, vertex.y);
        }

        this.context.stroke();
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

        const vertices = newDrawnObjData.pixelVertices;

        this.clearCanvas();

        this.context.moveTo(vertices[0].x, vertices[0].y);
        this.context.lineTo(pointerCoords.x, pointerCoords.y);

        this.context.moveTo(vertices[vertices.length - 1].x, vertices[vertices.length - 1].y);
        this.context.lineTo(pointerCoords.x, pointerCoords.y);

        this.context.stroke();
    }
}
