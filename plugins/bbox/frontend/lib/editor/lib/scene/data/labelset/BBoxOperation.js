/**
 * @template {{} | null} T
 * @typedef {import('sta/services/editor/base').Placeholder<T>} Placeholder
 */

/**
 * @typedef {import('../BBoxIndex').BBoxIndex} BBoxIndex
 */

/**
 * @typedef {import('../BBoxView').BBoxView} BBoxView
 */

/**
 * Abstract base class for operations that can be applied on a collection of
 * bounding box labels.
 * 
 * @template P The parameter type of the operation.
 * @template {{} | null} R The return type of the operation.
 */
export class BBoxOperation {

    /**
     * The display name of this operation.
     * 
     * @type {string}
     * @abstract
     */
    get displayName() { throw new Error('Not implemented'); }

    /**
     * The name of this operation, which is sent to the backend.
     * 
     * @type {string}
     * @abstract
     */
    get opName() { throw new Error('Not implemented'); }

    /**
     * The parameters of this operation, which is sent to the backend.
     * May contain {@link Placeholder} instances.
     * 
     * @readonly
     * @type {P}
     */
    opParams;

    /**
     * The result of this operation, expressed as a {@link Placeholder}.
     * 
     * It is resolved with the value returned from the backend after it is pushed there.
     * 
     * @type {?Placeholder<R>}
     * @abstract
     */
    get opResult() { throw new Error('Not implemented'); }

    /**
     * Creates a new operation.
     * 
     * Subclasses should create new objects from a static method that
     * generates the parameters before passing it to this constructor.
     * 
     * @protected
     * @param {P} opParams The parameters of the operation.
     */
    constructor(opParams) {
        this.opParams = opParams;
    }

    /**
     * Applies this operation to a collection of bounding box labels.
     * 
     * @param {BBoxIndex} index The index to update.
     * @abstract
     */
    applyIndex(index) {
        throw new Error('Not implemented');
    }

    /**
     * Reverts the changes applied by this operation to a collection of
     * bounding box labels.
     * 
     * @param {BBoxIndex} index The index to update.
     * @abstract
     */
    undoIndex(index) {
        throw new Error('Not implemented');
    }
}
