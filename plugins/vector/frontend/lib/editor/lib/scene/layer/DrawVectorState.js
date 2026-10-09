import { Placeholder } from 'sta/services/editor/base';

import { InteractState } from './InteractState';

/**
 * @typedef {import('three')} THREE
 */

/**
 * @typedef {import('../data').ReadonlyLabelVector} ReadonlyLabelVector
 */

/**
 * @typedef {import('../data').VectorParams} VectorParams
 */

/**
 * @typedef {import('../tools').VectorCreator} VectorCreator
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
 * Represents the state when the user can create a vector object.
 * 
 * @template {MainWindowMapper} WM The windows defined in the scene display.
 * @augments {InteractState<WM>}
 */
export class DrawVectorState extends InteractState {

    /**
     * The creator tool selected to draw a vector object.
     * 
     * @type {?VectorCreator} 
     */
    get activatedVectorCreator() { return this.context.activatedVectorCreator; }

    /**
     * Whether a vector object is being created.
     * 
     * @type {boolean}
     */
    get isCreatingVector() {
        const activatedVectorCreator = this.activatedVectorCreator;

        if (activatedVectorCreator == null) return false;

        return activatedVectorCreator.isCreating;
    }

    /**
     * Creates a new state instance.
     * 
     * This is called right before the state of the context is transitioned to this one.
     * 
     * @param {InteractContext<WM>} context The context containing this state.
     */
    constructor(context) {
        super({
            context: context,
            keydownBinds: [
                {
                    keyCombo: 'escape',
                    name: 'cancel draw vector',
                    handler: () => {
                        if (this.activatedVectorCreator?.isCreating) {
                            this.activatedVectorCreator?.abort();
                        } else {
                            this.context.transitionNavigate();
                        }
                    },
                },
                {
                    keyCombo: 'g',
                    name: 'finish draw vector',
                    handler: () => {
                        this.activatedVectorCreator?.finish();
                    },
                },
            ],
        });
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     * 
     * This is called right before the state of the context is transitioned from this one.
     */
    dispose() {
        this.activatedVectorCreator?.abort();

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
            case 'polyline':
                return 'crosshair';
            case 'point':
                return 'crosshair';
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
        const { isCreatingVector } = this;
        let cursorClass;
        if (isReadonly) {
            cursorClass = 'not-allowed';
        } else {
            cursorClass = this.#getPassiveCursorClass();
        }

        return {
            mainWindow: {
                cursorClass: cursorClass,
                controlCamera: !isCreatingVector,
                hiddenCanvas: false,
            },
            vectorSelector: isReadonly ? undefined : { hover: !isCreatingVector },
            vectorCreator: isReadonly ? undefined : {
                abort: () => {
                    this.activatedVectorCreator?.abort();
                },
                finish: async (event) => {
                    const vertices = event.vertices;
                    const vector = this.#initVector(vertices);
                    const { dataView } = this.context;

                    if (vector !== null) {
                        const registeredVector = await dataView.addLabelVector(vector);
                        await this.context.transitionEditVector({ vectorId: registeredVector.id });

                        this.#disposeVector(vector);
                    }
                },
            },
            labelInspector: isReadonly ? undefined : { enabled: !isCreatingVector },
        };
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
        const { isCreatingVector, activatedVectorCreator } = this;
        if (isCreatingVector) {
            return 'Double click pointer to finish drawing, or press [Esc] to abort';
        }

        return `Click and drag to draw ${activatedVectorCreator?.vectorType}, or press [Esc] to cancel`;
    }

    /**
     * Constructs a new vector object.
     * 
     * @param {ReadonlyArray<THREE.Vector3>} vertices The vertices in ThreeJS coordinates 
     * shaping a vector geometry.
     * @returns {?ReadonlyLabelVector} The newly created vector object.
     */
    #initVector(vertices) {
        const { sceneContext, dataView } = this.context;
        const activatedVectorCreator = this.activatedVectorCreator;

        if (activatedVectorCreator === null) return null;

        /**
         * @type {?VectorParams}
         */
        let vectorParams = null;

        const currentTimestamp = sceneContext.currentFrame?.getTimestampCenter() ?? null;
        const vectorType = activatedVectorCreator.vectorType;
        const format = sceneContext.config.coordinateFormat;
        const verticesInDB = vertices.map((vertex) => format.toDatabaseCoords(vertex));

        vectorParams = {
            id: new Placeholder(),
            timestamp: currentTimestamp,
            vertices: verticesInDB,
            vectorType: vectorType,
        };

        const vector = dataView.addLabelVectorLocalOnly(vectorParams);

        return vector;
    }

    /**
     * @param {ReadonlyLabelVector} vector The vector object to be deleted locally.
     */
    #disposeVector(vector) {
        const { dataView } = this.context;
        dataView.deleteLabelVectorLocalOnly(vector);
    }
}
