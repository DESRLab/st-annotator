import { DecimalVector3Data } from 'sta/common/spatial';

import { VectorOperation } from '../VectorOperation';

/**
 * @typedef {import('three')} THREE
 */

/**
 * @template {{} | null} T
 * @typedef {import('sta/services/editor/base').Placeholder<T>} Placeholder
 */

/**
 * @typedef {import('../../models').UUID} UUID
 */

/**
 * @typedef {import('../../VectorIndex').VectorIndex} VectorIndex
 */

/**
 * @typedef {import('../../LabelVector').VectorType} VectorType
 */

/**
 * @typedef {import('../../LabelVector').ReadonlyLabelVector} ReadonlyLabelVector
 */

/**
 * @typedef {import('../../LabelClass').ReadonlyLabelClass} ReadonlyLabelClass
 */

/**
 * @typedef {{
 *      vector_id: UUID;
 * }} UpdateParams
 */

/**
 * @template {UpdateParams} P
 * @template D
 * @augments {VectorOperation<P, null>}
 */
class Update extends VectorOperation {

    /**
     * The result of this operation, expressed as a {@link Placeholder}.
     * 
     * It is resolved with the value returned from the backend after it is pushed there.
     * 
     * @type {null}
     */
    get opResult() { return null; }

    /**
     * @type {D | undefined}
     */
    #data = undefined;

    /**
     * Gets the data to store so that this operation can be undone.
     * 
     * @protected
     * @param {ReadonlyLabelVector} vector The target vector object.
     * @returns {D} The data to store.
     * @abstract
     */
    getData(vector) {
        throw new Error('Not implemented');
    }

    /**
     * Applies this operation to a vector object.
     * 
     * @protected
     * @param {VectorIndex} index The index to update.
     * @param {ReadonlyLabelVector} vector The target vector object.
     * @param {P} params The parameters of this operation.
     * @abstract
     */
    applyVector(index, vector, params) {
        throw new Error('Not implemented');
    }

    /**
     * Reverts the changes applied by this operation to a vector object.
     * 
     * @protected
     * @param {VectorIndex} index The index to update.
     * @param {ReadonlyLabelVector} vector The target vector object.
     * @param {D} data The data stored when this operation was previously applied.
     * @abstract
     */
    undoVector(index, vector, data) {
        throw new Error('Not implemented');
    }

    /**
     * Applies this operation to a collection of vector labels.
     * 
     * @param {VectorIndex} index The index to update. 
     */
    applyIndex(index) {
        if (this.#data !== undefined) {
            throw new Error('Cannot undo an operation that has not been applied');
        }

        const params = this.opParams;
        const vector = index.getLabelVector(params.vector_id);

        this.#data = this.getData(vector);
        this.applyVector(index, vector, params);
    }

    /**
     * Undos this operation to a collection of vector labels.
     * 
     * @param {VectorIndex} index The index to update. 
     */
    undoIndex(index) {
        if (this.#data === undefined) {
            throw new Error('Cannot undo an operation that has not been applied');
        }

        const params = this.opParams;
        const vector = index.getLabelVector(params.vector_id);

        this.undoVector(index, vector, this.#data);
        this.#data = undefined;
    }
}

/**
 * @typedef {{
 *     vector_id: UUID;
 *     gt_class_id: ?number;
 * }} AssignClassParams
 */

/**
 * @augments {Update<AssignClassParams, ?number>}
 */
export class AssignClass extends Update {

    /**
     * The display name of this operation
     * 
     * @type {string}
     */
    get displayName() { return 'Assign Ground Truth Class'; }

    /**
     * The name of this operation, which is sent to the backend.
     * 
     * @type {string}
     */
    get opName() { return 'vector-assign-class'; }

    /**
     * Creates a new operation from a set of (unserialized) parameters.
     * 
     * @param {ReadonlyLabelVector} vector The vector object to update.
     * @param {?ReadonlyLabelClass} labelClass The object class to assign.
     * @returns {AssignClass} The newly created operation.
     */
    static fromParams(vector, labelClass) {
        return new AssignClass({
            vector_id: vector.id,
            gt_class_id: labelClass?.id ?? null,
        });
    }

    /**
     * Gets the data to store so that this operation can be undone.
     * 
     * @param {ReadonlyLabelVector} vector The target vector object.
     * @returns {?number} The data to store.
     */
    getData(vector) {
        return vector.gtClassId;
    }

    /**
     * Applies this operation to a vector object.
     * 
     * @protected
     * @param {VectorIndex} index The index to update.
     * @param {ReadonlyLabelVector} vector The target vector object.
     * @param {AssignClassParams} params The parameters of this operation.
     */
    applyVector(index, vector, params) {
        index.updateLabelVector(vector, { gtClassId: params.gt_class_id });
    }

    /**
     * Reverts the changes applied by this operation to a vector obejct.
     * 
     * @param {VectorIndex} index The index to update.
     * @param {ReadonlyLabelVector} vector The target vector object.
     * @param {?number} data The data stored when this operation was previously applied. 
     */
    undoVector(index, vector, data) {
        index.updateLabelVector(vector, { gtClassId: data });
    }
}

/**
 * @typedef {{
 *      vertices: ReadonlyArray<THREE.Vector3>;
 *      type: VectorType;
 * }} VectorGeometry
 */

/**
 * @typedef {{ type: VectorType; coords: DecimalVector3Data[] }} VectorVertices
 */

/**
 * @typedef {{
 *      vector_id: UUID;
 *      mode: string;
 *      vertices: VectorVertices;
 * }} EditVectorGeometryParams
 */

/**
 * @augments {Update<EditVectorGeometryParams, VectorGeometry>}
 */
export class EditVectorGeometry extends Update {
    /**
     * The display name of this operation.
     * 
     * @type {string}
     */
    get displayName() { return 'Edit Vector Geometry'; }

    /**
     * The name of this operation, which is sent to the backend.
     * 
     * @type {string}
     */
    get opName() { return 'vector-edit'; }

    /**
     * Creates a new operation from a set of (unserialized) parameters.
     * 
     * @param {ReadonlyLabelVector} vector The vector object that has been edited.
     * @param {string} mode The mode of editing geometry.
     * @param {VectorGeometry} params The parameters of this operation. 
     * @returns {EditVectorGeometry} THe newly created operation. 
     */
    static fromParams(vector, mode, params) {
        return new EditVectorGeometry({
            vector_id: vector.id,
            mode: mode,
            vertices: {
                type: params.type,
                coords: params.vertices.map(DecimalVector3Data.fromVector3),
            },
        });
    }

    /**
     * Gets the data to store so that this operation can be undone.
     * 
     * @param {ReadonlyLabelVector} vector The target vector object.
     * @returns {VectorGeometry} The data to store.
     */
    getData(vector) {
        return {
            vertices: vector.vertices,
            type: vector.vectorType,
        };
    }

    /**
     * Applies this operation to a vector object.
     * 
     * @param {VectorIndex} index The index to update.
     * @param {ReadonlyLabelVector} vector The target vector object.
     * @param {EditVectorGeometryParams} params The parameters of this operation.
     */
    applyVector(index, vector, params) {
        index.updateLabelVector(vector, {
            vectorType: params.vertices.type,
            vertices: params.vertices.coords.map((vertex) => vertex.toVector3()),
        });
    }

    /**
     * Reverts the changes applied by this operation to a vector object.
     * 
     * @param {VectorIndex} index The index to update.
     * @param {ReadonlyLabelVector} vector The target vector object.
     * @param {VectorGeometry} data The data stored when this operation was previously applied.
     */
    undoVector(index, vector, data) {
        index.updateLabelVector(vector, {
            vertices: data.vertices,
            vectorType: data.type,
        });
    }
}
