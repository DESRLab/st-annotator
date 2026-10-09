/**
 * @typedef {import('../data').LabelDataView<any>} LabelDataView
 */

/**
 * @template {{} | null} T
 * @typedef {import('./Placeholder').Placeholder<T>} Placeholder
 */

/**
 * Interface for operations that can be applied on a collection of labels.
 * 
 * @interface
 * @template P The parameter type of the operation.
 * @template {{} | null} R The return type of the operation.
 */
export class Operation {

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
     * @type {P}
     * @abstract
     */
    get opParams() { throw new Error('Not implemented'); }

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
     * Applies this operation to the local data.
     * 
     * @abstract
     */
    applyLocal() {
        throw new Error('Not implemented');
    }

    /**
     * Reverts the changes applied by this operation to the local data.
     * 
     * @abstract
     */
    undoLocal() {
        throw new Error('Not implemented');
    }
}

/**
 * Abstract base implementation of {@link Operation}.
 * 
 * @template {LabelDataView} D The type of local data modified by the operation.
 * @template P The parameter type of the operation.
 * @template {{} | null} R The return type of the operation.
 * @implements {Operation<P, R>}
 */
export class BaseOperation {

    /**
     * A handle to the data modified by the operation.
     * 
     * @readonly
     * @type {D}
     */
    dataView;

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
     * @param {D} dataView A handle to the data modified by the operation.
     * @param {P} opParams The parameters of the operation.
     */
    constructor(dataView, opParams) {
        this.dataView = dataView;
        this.opParams = opParams;
    }

    /**
     * Applies this operation to the local data.
     * 
     * @abstract
     */
    applyLocal() {
        throw new Error('Not implemented');
    }

    /**
     * Reverts the changes applied by this operation to the local data.
     * 
     * @abstract
     */
    undoLocal() {
        throw new Error('Not implemented');
    }
}
