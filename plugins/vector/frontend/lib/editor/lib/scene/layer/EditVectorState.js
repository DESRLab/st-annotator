import { InteractState } from './InteractState';

/**
 * @typedef {import('sta/services/editor/core').MainWindow} MainWindow
 */

/**
 * @typedef {import('../data').ReadonlyLabelVector} ReadonlyLabelVector
 */

/**
 * @typedef {import('../data').UUID} UUID
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
 * @typedef {object} EditStateParams
 * @property {?UUID} vectorId The unique identifier of the vector object to edit.
 */

/**
 * Represents the state when the user can edit labels.
 * 
 * @template {MainWindowMapper} WM The windows defined in the scene display.
 * @augments {InteractState<WM>} 
 */
export class EditState extends InteractState {

    /**
     * Whether a vector object is being transformed.
     * 
     * @type {boolean}
     */
    get isTransformingVector() { return this.context.vectorTransformer.isTransforming; }

    /**
     * The parameters of this state.
     * 
     * @readonly
     * @type {EditStateParams}
     */
    params;

    /**
     * 
     * @param {InteractContext<WM>} context The context containing this state.
     * @param {EditStateParams} params  The parameters of this state. 
     */
    constructor(context, params) {
        super({
            context: context,
            keydownBinds: [
                {
                    keyCombo: 'escape',
                    name: 'Cancel edit vector',
                    handler: () => {
                        if (this.isTransformingVector) {
                            this.#abortTransformVector();
                        } else {
                            this.context.transitionNavigate();
                        }
                    },
                },
                {
                    keyCombo: 'delete',
                    name: 'Delete vector',
                    handler: () => {
                        this.#deleteSelectedVector();
                    },
                },
                {
                    keyCombo: 'ctrl + c',
                    name: 'Copy vector',
                    handler: () => {
                        this.#copySelectedVector();
                    },
                },
                {
                    keyCombo: 'ctrl + v',
                    name: 'Paste vector',
                    handler: () => {
                        this.#pasteSelectedVector();
                    },
                },
            ],
        });

        this.params = params;
        this.#setup(this.params);
    }

    /**
     * Setsup this object.
     * 
     * @param {EditStateParams} params The parameters to this method. 
     */
    #setup({ vectorId }) {
        const {
            vectorTransformer, vectorMonitor,
            vectorSelector, vectorClipboard,
            vectorInspector,
        } = this.context;

        vectorInspector.selectedId = vectorId;

        const vector = vectorInspector.selectedVector;
        vectorMonitor.vector = vector;

        if (vector) {
            vectorSelector.selectedObj = vector;
            vectorTransformer.select(vector);
            vectorClipboard.select(vector);
        } else {
            vectorSelector.selectedObj = null;
            vectorClipboard.deselect();
            vectorTransformer.deselect();
        }
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     * 
     * This is called right before the state of the context is transitioned from this one.
     */
    dispose() {
        this.#setup({ vectorId: null });

        super.dispose();
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
        const { isTransformingVector } = this;

        return {
            mainWindow: {
                cursorClass: 'all-scroll',
                controlCamera: !isTransformingVector,
                hiddenCanvas: true,
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
            vectorTransformer: isReadonly ? undefined : {
                checkpoint: async (event) => {
                    const { obj, mode, prevTransform } = event;

                    const newVertices = {
                        vertices: obj.vertices,
                    };

                    // Need to revert the vector so that the operation can be undone
                    obj.getGeo().vectorCoords = prevTransform.vectorCoords;

                    // Reapplies the transformation
                    await this.context.dataView
                        .updateLabelVectorGeometry(obj, mode, obj.vectorType, newVertices.vertices);
                },
            },
            labelInspector: isReadonly ? undefined : {
                selectVector: async ({ value: vector }) => {
                    const vectorId = vector?.id ?? null;

                    if (vectorId == null) {
                        this.context.transitionEdit({ vectorId });
                    } else {
                        await this.context.transitionEditVector({ vectorId });
                    }
                },
            },
            labelClipboard: isReadonly ? undefined : {
                pasteVector: async (event) => {
                    const currentTimestamp = this.context.sceneContext.currentFrame
                        ?.getTimestampCenter() ?? null;

                    const vector = await this.context.dataView.addLabelVector({
                        ...event.clipboard,
                        timestamp: currentTimestamp,
                    });

                    await this.context.transitionEditVector({ vectorId: vector.id });
                },
            },
        };
    }

    /**
     * Gets the text to display as a hint to the user when this layer is avtive.
     * 
     * If the text is an empty string, no hint is displayed.
     * 
     * @param {boolean} isReadonly `true` if the labels cannot be edited; otherwise, `false`.
     * @returns {string} The requested hint.
     */
    getHint(isReadonly) {
        const { vectorInspector } = this.context;

        const hasSelectedVector = (this.params.vectorId != null);
        const vector = vectorInspector.selectedVector;
        if (hasSelectedVector && vector != null) {
            if (isReadonly) return 'The scene is currently in read-only mode';

            return `Drag the vertices of the ${vector.vectorType} to reform, press [Del] to delete, or press [Esc] to deselect`;
        }

        const drawDesc = isReadonly ? '' : ', or [D] to draw a vector';
        return `Press [S] to select avector${drawDesc}`;
    }

    /**
     * Cancels transformation of the current vector, if any.
     */
    #abortTransformVector() {
        this.context.vectorTransformer.abort();
    }

    /**
     * Deletes the selected vector, if any, from the scene.
     */
    #deleteSelectedVector() {
        const vector = this.context.vectorInspector.selectedVector;
        if (vector) {
            this.context.dataView.deleteLabelVector(vector);

            this.context.transitionNavigate();
        }
    }

    /**
     * Copies the current vector object, if any.
     */
    #copySelectedVector() {
        this.context.vectorClipboard.copy();
    }

    /**
     * Pastes the current vector object, if any.
     */
    #pasteSelectedVector() {
        this.context.vectorClipboard.paste();
    }
}
