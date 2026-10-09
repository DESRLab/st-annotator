import _ from 'lodash';
import BiMap from 'ts-bidirectional-map';
import * as THREE from 'three';

import { Placeholder } from 'sta/services/editor/base';
import { LabelVector } from './LabelVector';
import { LabelClass } from './LabelClass';

/**
 * @typedef {import('sta/common/utils').Timestamp} Timestamp
 */

/**
 * @template T
 * @typedef {import('sta/common/utils').TypeUtils.Expand<T>} Expand
 */

/**
 * @typedef {import('sta/services/editor/base').EditableFrame} EditableFrame
 */

/**
 * @typedef {import('sta/services/editor/base').EditorConfig} EditorConfig
 */

/**
 * @typedef {import('./models').UUID} UUID
 */

/**
 * @typedef {import('./LabelVector').LabelVectorParams} LabelVectorParams
 */

/**
 * @typedef {import('./LabelVector').PropertyChangeEvent} LabelVectorChangeEvent
 */

/**
 * @typedef {import('./LabelVector').ReadonlyLabelVector} ReadonlyLabelVector
 */

/**
 * @typedef {import('./LabelClass').LabelClassParams} LabelClassParams
 */

/**
 * @typedef {import('./LabelClass').PropertyChangeEvent} LabelClassChangeEvent
 */

/**
 * @typedef {import('./LabelClass').ReadonlyLabelClass} ReadonlyLabelClass
 */

/**
 * @interface
 * @see VectorIndex
 */
export class _VectorIndex {

    /**
     * The configuration of the application.
     * 
     * @type {EditorConfig}
     * @abstract
     */
    get config() { throw new Error('Not implemented'); }

    /**
     * The number of object classes stored in the collection.
     * 
     * @type {number}
     */
    get numLabelClasses() { throw new Error('Not implemented'); }

    /**
     * Iterates through each object class in the collection.
     * 
     * @returns {IterableIterator<ReadonlyLabelClass>} An iterator that yields such items.
     * @abstract
     */
    iterLabelClasses() {
        throw new Error('Not implemented');
    }

    /**
     * Tests whether an object class exists in the collection.
     * 
     * @param {number} id The unique identifier of the object class.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {boolean} `true` if the data is in the collection; otherwise, `false`.
     * @throws {Error} If the data is not in the collection.
     * @abstract
     */
    hasLabelClass(id, allowDeleted = false) {
        throw new Error('Not implemented');
    }

    /**
     * Gets an object class in the collection by its unique identifier.
     * 
     * @param {number} id The unique identifier of the object class.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {ReadonlyLabelClass} The data of the corresponding object class.
     * @throws {Error} If the data is not in the collection.
     * @abstract
     */
    getLabelClass(id, allowDeleted = false) {
        throw new Error('Not implemented');
    }

    /**
     * Adds an object class to the collection.
     * 
     * @param {ClassParams} classParams Parameters to initialize the object class.
     * @returns {ReadonlyLabelClass} The newly created object class.
     * @throws {Error} If the data is already in the collection.
     * @abstract
     */
    addLabelClass(classParams) {
        throw new Error('Not implemented');
    }

    /**
     * Removes an object class from the collection.
     * 
     * @param {ReadonlyLabelClass} labelClass The object class to remove.
     * @throws {Error} If the class is not in the collection.
     * @abstract
     */
    deleteLabelClass(labelClass) {
        throw new Error('Not implemented');
    }

    /**
     * Updates an object class in the collection.
     * 
     * @param {ReadonlyLabelClass} labelClass The object class to update.
     * @param {Partial<ClassParams>} classParams Parameters to update the object class.
     * @throws {Error} If the box is not in the collection.
     * @abstract
     */
    updateLabelClass(labelClass, classParams) {
        throw new Error('Not implemented');
    }

    /**
     * The number of object vectors stored in the collection.
     * 
     * @type {number}
     */
    get numLabelVectors() { throw new Error('Not implemented'); }

    /**
     * Iterates through each object vector in the collection.
     * 
     * @returns {IterableIterator<ReadonlyLabelVector>} An iterator that yields such items.
     * @abstract
     */
    iterLabelVectors() {
        throw new Error('Not implemented');
    }

    /**
     * Tests whether an object vector exists in the collection.
     * 
     * @param {UUID} id The unique identifier of the object vector.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {boolean} `true` if the data is in the collection; otherwise, `false`.
     * @throws {Error} If the vector is not in the collection.
     * @abstract
     */
    hasLabelVector(id, allowDeleted = false) {
        throw new Error('Not implemented');
    }

    /**
     * Gets an object vector in the collection by its unique identifier.
     * 
     * @param {UUID} id The unique identifier of the object vector.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {ReadonlyLabelVector} The data of the corresponding object vector.
     * @throws {Error} If the vector is not in the collection.
     * @abstract
     */
    getLabelVector(id, allowDeleted = false) {
        throw new Error('Not implemented');
    }

    /**
     * Adds an object vector to the collection.
     * 
     * @param {VectorParams} vectorParams Parameters to initialize the object vector.
     * @returns {LabelVector} The newly created object vector.
     * @throws {Error} If the vector is already in the collection.
     * @abstract
     */
    addLabelVector(vectorParams) {
        throw new Error('Not implemented');
    }

    /**
     * Removes an object vector from the collection.
     * 
     * @param {ReadonlyLabelVector} vector The object vector to remove.
     * @throws {Error} If the vector is not in the collection.
     * @abstract
     */
    deleteLabelVector(vector) {
        throw new Error('Not implemented');
    }

    /**
     * Updates an object vector in the collection.
     * 
     * @param {ReadonlyLabelVector} vector The object vector to update.
     * @param {Partial<VectorParams>} vectorParams Parameters to update the object vector.
     * @throws {Error} If the vector is not in the collection.
     * @abstract
     */
    updateLabelVector(vector, vectorParams) {
        throw new Error('Not implemented');
    }

}

/**
 * @typedef {Omit<LabelVectorParams, 'config' | 'labels'>} VectorParams
 */

/**
 * @typedef {Omit<LabelClassParams, 'config' | 'labels'>} ClassParams
 */

/**
 * Represents the event when a vector object in the collection has been updated.
 * - `obj`: The object which has been updated.
 * - `propertyKey`: The name of the property that was changed.
 * 
 * @typedef {{
 *     obj: ReadonlyLabelVector;
 *     propertyKey: LabelVectorChangeEvent['propertyKey'];
 * }} VectorUpdateEvent
 */

/**
 * Represents the event when an object class in the collection has been updated.
 * - `obj`: The object which has been updated.
 * - `propertyKey`: The name of the property that was changed.
 * 
 * @typedef {{
 *     obj: ReadonlyLabelClass;
 *     propertyKey: LabelClassChangeEvent['propertyKey'];
 * }} ClassUpdateEvent
 */

/**
 * Defines each event that can be dispatched by {@link VectorIndex}.
 * 
 * Note that bulk operations do not trigger the more specific events,
 * in order to avoid unnecessary updating.
 * 
 * @typedef {object} VectorIndexEventMap
 * @property {{ obj: ReadonlyLabelVector }} vector-add The event when an object vector
 * in the collection has been added.
 * @property {{ obj: ReadonlyLabelVector }} vector-delete The event when an object vector
 * in the collection has been deleted.
 * @property {VectorUpdateEvent} vector-update
 * The event when an object vector in the collection has been updated.
 * @property {{ obj: ReadonlyLabelVector }} vector-resolveId he event when the
 * {@link Placeholder} unique identifier of an object vector has been resolved.
 * @property {{ obj: ReadonlyLabelClass }} class-add The event when an object class
 * in the collection has been added.
 * @property {{ obj: ReadonlyLabelClass }} class-delete The event when an object class
 * in the collection has been deleted.
 * @property {ClassUpdateEvent} class-update
 * The event when an object class in the collection has been updated.
 * @property {{}} bulk-add The event when multiple items have been added
 * to the collection in a bulk operation.
 * @property {{}} bulk-delete The event multiple items have been deleted
 * from the collection in a bulk operation.
 */

/**
 * @type {ReadonlyArray<Extract<keyof VectorIndexEventMap, string>>}
 */
export const ALL_EVENT_TYPES = [
    'vector-add', 'vector-delete', 'vector-update', 'vector-resolveId',
    'class-add', 'class-delete', 'class-update',
    'bulk-add', 'bulk-delete',
];

/**
 * @typedef {object} VectorDataParams
 * @property {ReadonlyArray<ClassParams>} [classes=[]] Parameters to initialize each 
 * object class in the collection.
 * @property {ReadonlyArray<VectorParams>} [vectors=[]] Parameters to initialize each
 * object vector in the collection.
 */

/**
 * @typedef {Required<VectorDataParams>} VectorLabelsData
 */

/**
 * Indexes a collection of vector object labels.
 * 
 * The index updates automatically whenever a change is made to a label created through an 
 * `add` method of that index.
 * 
 * @typedef {Expand<_VectorIndex & THREE.EventDispatcher<VectorIndexEventMap>>} VectorIndex
 */

/**
 * @typedef {Pick<VectorIndex, keyof THREE.EventDispatcher<VectorIndexEventMap>
 * | 'iterLabelClasses' | 'hasLabelClass' | 'getLabelClass'
 * | 'iterLabelVectors' | 'hasLabelVector' | 'getLabelVector'>} ReadonlyVectorIndex
 */

/**
 * @template {{} | null} KResolved
 * @template V
 * @augments {BiMap<KResolved | Placeholder<KResolved>, V>}
 */
class BiMapWithPlaceholderLookup extends BiMap {

    /**
     * @readonly
     * @type {Map<KResolved, Placeholder<KResolved>>}
     */
    #resolvedPlaceholders = new Map();

    /**
     * @type {(key: KResolved | Placeholder<KResolved>) => V | undefined}
     */
    get(key) {
        if (!Placeholder.isPlaceholder(key)) {
            const resolvedKey = this.#resolvedPlaceholders.get(key);
            if (resolvedKey !== undefined) return super.get(resolvedKey);
        }

        return super.get(key);
    }

    /**
     * Listens to the event when the placeholder of a key is resolved.
     * 
     * @param {Placeholder<KResolved>} key The placeholder key.
     */
    #listenToResolve(key) {
        key.getAsync()
            .then((resolvedKey) => {
                this.#resolvedPlaceholders.set(resolvedKey, key);
            });
    }

    /**
     * @type {(key: KResolved | Placeholder<KResolved>, value: V) => void}
     */
    set(key, value) {
        if (Placeholder.isPlaceholder(key)) {
            this.#listenToResolve(key);
        }

        super.set(key, value);
    }
}

/**
 * Converts `labelClass` into a plain object, so that it can be destructured.
 * 
 * @param {ReadonlyLabelClass} labelClass The input object.
 * @returns {Required<ClassParams>} The converted object.
 */
export function labelClassToPlain(labelClass) {
    return {
        id: labelClass.id,
        name: labelClass.name,
        vectorColor: labelClass.vectorColor,
    };
}

/**
 * Converts `params` into a plain object.
 * 
 * @template {Partial<ClassParams>} T
 * @param {T} classParams The input object, which may not be plain.
 * @returns {T extends LabelClass ? Required<ClassParams> : T} The converted object.
 * @throws {Error} If the object cannot be converted.
 */
export function cleanClassParams(classParams) {
    // @ts-expect-error
    if (classParams instanceof LabelClass) return labelClassToPlain(classParams);

    if (!_.isPlainObject(classParams)) {
        console.error(classParams);
        throw new Error('Unable to clean classParams');
    }

    // @ts-expect-error
    return classParams;
}

/**
 * Converts `vector` into plain object. so that it can be destructed.
 * 
 * @param {ReadonlyLabelVector} vector The input vector object. 
 * @returns {Required<VectorParams>} The converted object.
 */
export function labelVectorToPlain(vector) {
    return {
        id: vector.id,
        vertices: vector.vertices,
        gtClassId: vector.gtClassId,
        timestamp: vector.timestamp,
        vectorType: vector.vectorType,
        showColor: vector.showColor,
    };
}

/**
 * Convert `vectorParams` into a plain object, so that it can desctructured.
 * 
 * @template {Partial<VectorParams>} T 
 * @param {T} vectorParams The input object, which may not be plain.
 * @returns {T extends LabelVector ? Required<VectorParams> : T} the converted object.
 * @throws {Error} If the object cannot be converted.
 */
export function cleanVectorParams(vectorParams) {
    // @ts-expect-error
    if (vectorParams instanceof LabelVector) return labelVectorToPlain(vectorParams);

    if (!_.isPlainObject(vectorParams)) {
        console.error(vectorParams);
        throw new Error('Unbale to clean vectorParams');
    }

    // @ts-expect-error
    return vectorParams;
}

/**
 * Indexes a collection of vector labels.
 * 
 * The index updates automatically whenever a change is made to a label created through an
 * `add` method of that index.
 * 
 * @augments THREE.EventDispatcher<VectorIndexEventMap>
 * @implements {VectorIndex}
 */
export class BaseVectorIndex extends THREE.EventDispatcher {

    /**
     * The configuration of the application.
     * 
     * @readonly
     * @type {EditorConfig}
     */
    config;

    /**
     * Indexes each object class in the collection by its unique identifier.
     * 
     * @type {BiMap<number, LabelClass>}
     */
    #classesById;

    /**
     * @type {BiMap<number, LabelClass>}
     */
    #deletedClasses;

    /**
     * The number of object classes stored in the collection.
     * 
     * @type {number}
     */
    get numLabelClasses() { return this.#classesById.size; }

    /**
     * Iterates through each object class in the collection.
     * 
     * @returns {IterableIterator<ReadonlyLabelClass>} An iterator that yields such items.
     */
    iterLabelClasses() { return this.#classesById.values(); }

    /**
     * Tests whether an object class exists in the collection.
     * 
     * @param {number} id The unique identifier of the object class.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {boolean} `true` if the data is in the collection; otherwise, `false`.
     * @throws {Error} If the data is not in the collection.
     */
    hasLabelClass(id, allowDeleted = false) {
        return this.#classesById.has(id)
            || (allowDeleted && this.#deletedClasses.has(id));
    }

    /**
     * Gets an object class in the collection by its unique identifier.
     * 
     * @param {number} id The unique identifier of the object class.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {LabelClass} The data of the corresponding object class.
     * @throws {Error} If the data is not in the collection.
     */
    #getLabelClass(id, allowDeleted = false) {
        const result = this.#classesById.get(id)
            ?? (allowDeleted ? this.#deletedClasses.get(id) : null);

        if (result == null) {
            throw new Error(`There is no class with the given ID: ${id}`);
        } else if (result.labels !== this) {
            throw new Error(`Class not registered to index. ID: ${id}`);
        }

        return result;
    }

    /**
     * Gets an object class in the collection by its unique identifier.
     * 
     * @param {number} id The unique identifier of the object class.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {LabelClass} The data of the corresponding object class.
     * @throws {Error} If the data is not in the collection.
     */
    getLabelClass(id, allowDeleted = false) {
        return this.#getLabelClass(id, allowDeleted);
    }

    /**
     * Adds an object class to the collection,
     * without performing validation or emitting events.
     * 
     * @param {LabelClass} labelClass The object class to add.
     */
    #addLabelClass(labelClass) {
        const id = labelClass.id;

        this.#classesById.set(id, labelClass);

        labelClass.addEventListener('change', this.#onClassChange);
    }

    /**
     * Adds an object class to the collection.
     * 
     * @param {ClassParams} classParams Parameters to initialize the object class.
     * @param {boolean} isBulk `true` if this is a bulk operation; otherwise, `false`.
     * @returns {ReadonlyLabelClass} The newly created object class.
     * @throws {Error} If the data is already in the collection.
     */
    #addLabelClassOrBulk(classParams, isBulk) {
        const id = classParams.id;

        // Throw the error at the beginning so that a failed operation does not mutate the mapping
        if (this.#classesById.has(id)) {
            throw new Error(`There already exists a class with the given ID: ${id}`);
        }

        const plainParams = cleanClassParams(classParams);

        // Initialize after validation so we don't have to dispose if validation fails
        // Override config/labels since that is not considered part of the parameters
        const labelClass = new LabelClass({ ...plainParams, config: this.config, labels: this });
        this.#addLabelClass(labelClass);

        if (!isBulk) {
            this.dispatchEvent({ type: 'class-add', obj: labelClass });
        }

        return labelClass;
    }

    /**
     * Adds an object class to the collection.
     * 
     * @param {ClassParams} classParams Parameters to initialize the object class.
     * @returns {ReadonlyLabelClass} The newly created object class.
     * @throws {Error} If the data is already in the collection.
     */
    addLabelClass(classParams) {
        return this.#addLabelClassOrBulk(classParams, false);
    }

    /**
     * Removes an object class from the collection,
     * without performing validation or emitting events.
     * 
     * @param {LabelClass} labelClass The object class to remove.
     * @throws {Error} If the vector is not in the collection.
     */
    #deleteLabelClass(labelClass) {
        const id = labelClass.id;

        for (const vector of this.iterLabelVectors()) {
            if (vector.gtClassId === id) {
                throw new Error(`Cannot delete class with ID: ${id}. It is used by the vector with ID: ${vector.id}`);
            }
        }

        this.#classesById.delete(id);
        this.#deletedClasses.set(id, labelClass);

        labelClass.removeEventListener('change', this.#onClassChange);
    }

    /**
     * Removes an object class from the collection.
     * 
     * @param {ReadonlyLabelClass} labelClass The object class to remove.
     * @param {boolean} isBulk `true` if this is a bulk operation; otherwise, `false`.
     * @throws {Error} If the class is not in the collection.
     */
    #deleteLabelClassOrBulk(labelClass, isBulk) {
        const id = labelClass.id;

        // Throw the error at the beginning (if the track does not exist) 
        // so that a failed operation does not mutate the mapping
        const editableClass = this.#getLabelClass(id);
        if (editableClass !== labelClass) {
            throw new Error(`Incorrect instance for class with ID: ${id}`);
        }

        this.#deleteLabelClass(editableClass);
        editableClass.dispose();

        if (!isBulk) {
            this.dispatchEvent({ type: 'class-delete', obj: labelClass });
        }
    }

    /**
     * Removes an object class from the collection.
     * 
     * @param {ReadonlyLabelClass} labelClass The object class to remove.
     * @throws {Error} If the class is not in the collection.
     */
    deleteLabelClass(labelClass) {
        this.#deleteLabelClassOrBulk(labelClass, false);
    }

    /**
     * Updates an object class in the collection.
     * 
     * @param {ReadonlyLabelClass} labelClass The object class to update.
     * @param {Partial<ClassParams>} classParams Parameters to update the object class.
     * @throws {Error} If the box is not in the collection.
     */
    updateLabelClass(labelClass, classParams) {
        const editableClass = this.#classesById.get(labelClass.id);
        if (editableClass !== labelClass) {
            throw new Error('Failed assertion: The two versions should be the same');
        }

        const plainParams = cleanClassParams(classParams);

        Object.assign(editableClass, plainParams);

        // Emitted indirectly by listening to the event of the label
        // this.dispatchEvent({ type: 'class-update', obj: labelClass });
    }

    /**
     * Indexes each vector object in the collection by its unique identifier.
     * 
     * @type {BiMap<UUID, LabelVector>}
     */
    #vectorsById;

    /**
     * @type {BiMap<UUID, LabelVector>}
     */
    #deletedVectors;

    /**
     * The number of vector objects stored in the collection.
     * 
     * @type {number}
     */
    get numLabelVectors() { return this.#vectorsById.size; }

    /**
     * Iterates through each vector object in the collection.
     * 
     * @returns {IterableIterator<ReadonlyLabelVector>} An iterator that yield such items.
     */
    iterLabelVectors() { return this.#vectorsById.values(); }

    /**
     * Tests whether a vector object exists in the collection.
     * 
     * @param {UUID} id The unique identifier of the vector object.
     * @param {boolean} allowDeleted If `true`, may consider items that  have been
     * marked as deleted.
     * @returns {boolean} `true` if the data is in the collection; otherwise, `false`.
     * @throws {Error} If the vector is not in the collection. 
     */
    hasLabelVector(id, allowDeleted = false) {
        return this.#vectorsById.has(id) || (allowDeleted && this.#deletedVectors.has(id));
    }

    /**
     * 
     * @param {UUID} id The unique identifier of the vector object.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {LabelVector} The data of the corresponding vector object.
     * @throws {Error} If the vector is not in the collection.
     */
    #getLabelVector(id, allowDeleted = false) {
        const result = this.#vectorsById.get(id)
            ?? (allowDeleted ? this.#deletedVectors.get(id) : null);

        if (result == null) {
            throw new Error(`There is no vector with the given ID: ${id}`);
        } else if (result.labels !== this) {
            throw new Error(`Vector not registered to index. ID: ${id}`);
        }

        return result;
    }

    /**
     * Gets a vector object in the collection by its unique identifier.
     * 
     * @param {UUID} id The unique identifier of the vector object.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {ReadonlyLabelVector} The data of the corresponding vector object.
     * @throws {Error} If the vector is not in the collection.
     */
    getLabelVector(id, allowDeleted = false) {
        return this.#getLabelVector(id, allowDeleted);
    }

    /**
     * If `vectorParams.id` is a {@link Placeholder}, emits {@link VectorResolveIDEvent}
     * once it is resolved
     * 
     * @param {Partial<VectorParams>} vectorParams The input parameters.
     */
    #emitWhenVectorIDResolved(vectorParams) {
        const vectorId = vectorParams.id;
        if (Placeholder.isPlaceholder(vectorId)) {
            vectorId.getAsync()
                .then(() => {
                    if (this.hasLabelVector(vectorId)) {
                        this.dispatchEvent({
                            type: 'vector-resolveId',
                            obj: this.getLabelVector(vectorId),
                        });
                    }
                });
        }
    }

    /**
     * Adds a vector object to the collection,
     * without performing validation or emitting events.
     * 
     * @param {LabelVector} vector The vector object to add. 
     */
    #addLabelVector(vector) {
        const id = vector.id;
        this.#vectorsById.set(id, vector);

        vector.addEventListener('change', this.#onVectorChange);
    }

    /**
     * Adds an object track to the collection.
     * 
     * @param {VectorParams} vectorParams Parameters to initialize the
     * @param {boolean} isBulk `true` if this is a bulk operation; otherwise, `false`.
     * @returns {LabelVector} The newly created vector object.
     * @throws {Error} If the vector is already in the collection.
     */
    #addLabelVectorOrBulk(vectorParams, isBulk) {
        const id = vectorParams.id;

        if (this.#vectorsById.has(id)) {
            throw new Error(`There already exists a track with the given ID: ${id}`);
        }

        const plainParams = cleanVectorParams(vectorParams);
        const vector = new LabelVector({ ...plainParams, config: this.config, labels: this });

        this.#addLabelVector(vector);
        vector.render();

        this.#emitWhenVectorIDResolved(plainParams);

        if (!isBulk) {
            this.dispatchEvent({ type: 'vector-add', obj: vector });
        }

        return vector;
    }

    /**
     * Adds a vector object trakc to the collection.
     * 
     * @param {VectorParams} vectorParams Parameters to initialize the vector object.
     * @returns {LabelVector} The newly created vector object.
     * @throws {Error} If the vector is already in the collection. 
     */
    addLabelVector(vectorParams) {
        return this.#addLabelVectorOrBulk(vectorParams, false);
    }

    /**
     * Removes a vector object from the collection,
     * without performing validation or emitting events.
     * 
     * @param {LabelVector} vector The vector object to remove.
     * @throws {Error} If the vector is not in the collection. 
     */
    #deleteLabelVector(vector) {
        const id = vector.id;

        if (!this.#vectorsById.has(id)) {
            throw new Error(`Cannot delete vector with ID: ${id}. the object does not exists`);
        }

        this.#vectorsById.delete(id);
        this.#deletedVectors.set(id, vector);

        vector.removeEventListener('change', this.#onVectorChange);
    }

    /**
     * Removes a vector object from the collection.
     * 
     * @param {ReadonlyLabelVector} vector The vector object to remove.
     * @param {boolean} isBulk `true` if this is a bulk operation; otherwise, `false`.
     * @throws {Error} If the vector is not in the collection.
     */
    #deleteLabelVectororBulk(vector, isBulk) {
        const id = vector.id;

        const editableVector = this.#getLabelVector(id);
        if (editableVector !== vector) {
            throw new Error(`Incorrect instance for vector with ID: ${id}`);
        }

        this.#deleteLabelVector(editableVector);
        editableVector.dispose();

        if (!isBulk) {
            this.dispatchEvent({ type: 'vector-delete', obj: vector });
        }
    }

    /**
     * Removes a vector object from the collection.
     * 
     * @param {LabelVector} vector The vector object to remove.
     * @throws {Error} If the track is not in the collection.
     */
    deleteLabelVector(vector) {
        this.#deleteLabelVectororBulk(vector, false);
    }

    /**
     * 
     * @param {LabelVector} vector The vector object to update.
     * @param {Partial<VectorParams>} vectorParams Parameters to update the vector object.
     * @throws {Error} If the vector is not in the collection.     
     */
    updateLabelVector(vector, vectorParams) {
        const editableVector = this.#vectorsById.get(vector.id);

        if (editableVector !== vector) {
            throw new Error('Failed assertion: The two versions should be the same');
        }

        const plainParams = cleanVectorParams(vectorParams);

        Object.assign(editableVector, plainParams);

        this.#emitWhenVectorIDResolved(plainParams);
    }

    /**
     * Handles the event when an object class in the collection has been updated.
     * 
     * @param {LabelClassChangeEvent} event The event to handle.
     */
    #onClassChange = (event) => {
        const labelClass = event.obj;

        if (event.propertyKey === 'id') {
            const prevId = this.#classesById.getKey(labelClass);
            if (prevId == null) {
                throw new Error('Assertion failed: Missing class');
            }

            const id = labelClass.id;

            this.#classesById.delete(prevId);

            this.#classesById.set(id, labelClass);
        }

        this.dispatchEvent({
            type: 'class-update',
            obj: labelClass,
            propertyKey: event.propertyKey,
        });
    };

    /**
     * Handles the event when a vector object in the collection has been updated.
     * 
     * @param {LabelVectorChangeEvent} event The event to handle. 
     */
    // eslint-disable-next-line no-shadow
    #onVectorChange = (event) => {
        const vector = event.obj;

        if (event.propertyKey === 'id') {
            const prevVectorId = this.#vectorsById.getKey(vector);
            if (prevVectorId == null) {
                throw new Error('Assertion failed: Missing vector');
            }

            const vectorId = vector.id;

            this.#vectorsById.delete(prevVectorId);
            this.#vectorsById.set(vectorId, vector);
        }

        this.dispatchEvent({
            type: 'vector-update',
            obj: vector,
            propertyKey: event.propertyKey,
        });
    };

    /**
     * Creates a new index for a collection of vector objects.
     * 
     * @param {EditorConfig} config The configuration of the application.
     * @param {VectorDataParams} dataParams Parameters to initialize each label
     * in the collection.
     */
    constructor(config, dataParams) {
        super();

        this.config = config;

        this.#classesById = new BiMap();
        this.#deletedClasses = new BiMap();

        this.#vectorsById = new BiMapWithPlaceholderLookup();
        this.#deletedVectors = new BiMapWithPlaceholderLookup();

        this.addBulk(dataParams);
    }

    /**
     * Disposes of this object. Do not sue it afterwards.
     */
    dispose() {
        this.deleteBulk({
            classes: [...this.iterLabelClasses()],
            vectors: [...this.iterLabelVectors()],
        });

        this.#deletedVectors.clear();
        this.#deletedClasses.clear();
    }

    /**
     * Adds multiple items to this collection in bulk.
     * 
     * @param {{
     *      classes?: ReadonlyArray<ClassParams>;
     *      vectors?: ReadonlyArray<VectorParams>;
     * }}  params The parameters of each item to add.
     */
    addBulk({ classes = [], vectors = [] }) {
        for (const labelClass of classes) {
            this.#addLabelClassOrBulk(labelClass, true);
        }

        for (const vector of vectors) {
            this.#addLabelVectorOrBulk(vector, true);
        }

        this.dispatchEvent({ type: 'bulk-add' });
    }

    /**
     * Adds multiple items to this collection in bulk.
     * 
     * @param {{
     *      classes?: ReadonlyArray<ReadonlyLabelClass>;
     *      vectors?: ReadonlyArray<ReadonlyLabelVector>;
     * }}  params The parameters of each item to add.
     */
    deleteBulk({ classes = [], vectors = [] }) {
        for (const labelClass of classes) {
            this.#deleteLabelClassOrBulk(labelClass, true);
        }

        for (const vector of vectors) {
            this.#deleteLabelVectororBulk(vector, true);
        }

        this.dispatchEvent({ type: 'bulk-delete' });
    }
}

/**
 * Represents a view of an index such that it only includes labels that exists
 * within a set of frames.
 * 
 * @augments THREE.EventDispatcher<VectorIndexEventMap>
 * @implements {VectorIndex}
 */
export class VectorIndexView extends THREE.EventDispatcher {

    /**
     * The wrapped index.
     * 
     * @type {VectorIndex}
     */
    #wrapped;

    /**
     * The frames to only include labels for.
     * 
     * @type {ReadonlyArray<EditableFrame>}
     */
    #frames;

    /**
     * Tests whether any point from vertices of vector object exists in a frame to include.
     * 
     * @param {ReadonlyArray<THREE.Vector3>} points The query vertices of a vector object.
     * @param {EditableFrame} frame The query frame.
     * @returns {boolean} `true` if any point from given vertices of vector object exists in 
     * the frame to include; otherwise, `false`.
     */
    #arePointsInFrame(points, frame) {
        return points.some((point) => frame.containsPoint(point));
    }

    /**
     * Tests whether a point exists in the frames to include.
     * 
     * @param {ReadonlyArray<THREE.Vector3>} points The query vertices of a vector object.
     * @returns {boolean} `true` if the given point exists in the frames to include;
     * otherwise, `false`.
     */
    #anyPointsInFrames(points) {
        return this.#frames.some((frame) => this.#arePointsInFrame(points, frame));
    }

    /**
     * Tests whether a timestamp exists in the frames to include.
     * 
     * @param {?Timestamp} timestamp The query timestamp.
     * @returns {boolean} `true` if the given timestamp exists in the frames to include;
     * otherwise, `false`.
     */
    #isTimestampInFrames(timestamp) {
        return this.#frames.some((frame) => frame.containsTimestamp(timestamp));
    }

    /**
     * Tests whether a vector object exists in the frames to include.
     * 
     * @param {VectorParams} vector The query vector object.
     * @returns {boolean} `true` if the given vector object exists in the frames
     * to include otehrwise, `false`. 
     */
    #isVectorInFrames(vector) {
        return this.#anyPointsInFrames(vector.vertices)
            && this.#isTimestampInFrames(vector.timestamp ?? null);
    }

    /**
     * The configuration of the application.
     * 
     * @readonly
     * @type {EditorConfig}
     */
    get config() { return this.#wrapped.config; }

    /**
     * The number of object classes stored in the collection.
     * 
     * @type {number}
     */
    get numLabelClasses() { return this.#wrapped.numLabelClasses; }

    /**
     * Iterates through each object class in the collection.
     * 
     * @returns {IterableIterator<ReadonlyLabelClass>} An iterator that yields such items.
     */
    iterLabelClasses() {
        return this.#wrapped.iterLabelClasses();
    }

    /**
     * Tests whether an object class exists in the collection.
     * 
     * @param {number} id The unique identifier of the object class.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {boolean} `true` if the data is in the collection; otherwise, `false`.
     * @throws {Error} If the data is not in the collection.
     */
    hasLabelClass(id, allowDeleted = false) {
        return this.#wrapped.hasLabelClass(id, allowDeleted);
    }

    /**
     * Gets an object class in the collection by its unique identifier.
     * 
     * @param {number} id The unique identifier of the object class.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {ReadonlyLabelClass} The data of the corresponding object class.
     * @throws {Error} If the data is not in the collection.
     */
    getLabelClass(id, allowDeleted = false) {
        return this.#wrapped.getLabelClass(id, allowDeleted);
    }

    /**
     * Adds an object class to the collection.
     * 
     * @param {ClassParams} classParams Parameters to initialize the object class.
     * @returns {ReadonlyLabelClass} The newly created object class.
     * @throws {Error} If the data is already in the collection.
     */
    addLabelClass(classParams) {
        return this.#wrapped.addLabelClass(classParams);
    }

    /**
     * Removes an object class from the collection.
     * 
     * @param {ReadonlyLabelClass} labelClass The object class to remove.
     * @throws {Error} If the class is not in the collection.
     */
    deleteLabelClass(labelClass) {
        return this.#wrapped.deleteLabelClass(labelClass);
    }

    /**
     * Updates an object class in the collection.
     * 
     * @param {ReadonlyLabelClass} labelClass The object class to update.
     * @param {Partial<ClassParams>} classParams Parameters to update the object class.
     * @throws {Error} If the box is not in the collection.
     */
    updateLabelClass(labelClass, classParams) {
        return this.#wrapped.updateLabelClass(labelClass, classParams);
    }

    /**
     * The number of vector objects stored in the collection.
     * 
     * @type {number}
     */
    get numLabelVectors() { return this.#wrapped.numLabelVectors; }

    /**
     * Tests whether an vector object exists in the collection.
     * 
     * @param {UUID} id The unique identifier of the vector object.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {boolean} `true` if the data is in the collection; otherwise, `false`.
     * @throws {Error} If the vector is not in the collection.
     */
    hasLabelVector(id, allowDeleted = false) {
        if (!this.#wrapped.hasLabelVector(id, allowDeleted)) return false;

        const vector = this.#wrapped.getLabelVector(id, allowDeleted);
        return this.#isVectorInFrames(vector);
    }

    /**
     * Gets an vector object in the collection by its unique identifier.
     * 
     * @param {UUID} id The unique identifier of the vector object.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted. 
     * @returns {ReadonlyLabelVector} The data of the corresponding vector object.
     * @throws {Error} If the vector is not in the collection.
     * @abstract
     */
    getLabelVector(id, allowDeleted = false) {
        const vector = this.#wrapped.getLabelVector(id, allowDeleted);
        if (!this.#isVectorInFrames(vector)) {
            throw new Error('The vector does not exist in the frame');
        }
        return vector;
    }

    /**
     * Adds a vector object to the collection.
     * 
     * @param {VectorParams} vectorParams Parameters to initialize the vector object
     * @returns {LabelVector} The newly created vector object.
     * @throws {Error} If the vector is already in the collection.
     */
    addLabelVector(vectorParams) {
        if (!this.#isVectorInFrames(vectorParams)) {
            throw new Error('The vector does not exist in the frame');
        }

        return this.#wrapped.addLabelVector(vectorParams);
    }

    /**
     * Removes vector object from the collection.
     * 
     * @param {ReadonlyLabelVector} vector The vector object to remove.
     * @throws {Error} If the vector is not in the collection,
     */
    deleteLabelVector(vector) {
        if (!this.#isVectorInFrames(vector)) {
            throw new Error('The vector does not exist in the frame');
        }

        this.#wrapped.deleteLabelVector(vector);
    }

    /**
     * Updates vector object in the collection.
     * 
     * @param {ReadonlyLabelVector} vector The vector object to update.
     * @param {Partial<VectorParams>} vectorParams Parameters to updae the vector object.
     * @throws {Error} If the vector is not in the collection.
     */
    updateLabelVector(vector, vectorParams) {
        if (!this.#isVectorInFrames(vector)) {
            throw new Error('The vector does not exist in the frame');
        }

        this.#wrapped.updateLabelVector(vector, vectorParams);
    }

    /**
     * Iterates through each vector object in the collection.
     * 
     * @returns {IterableIterator<ReadonlyLabelVector>} An iterator that yeilds such items.
     */
    * iterLabelVectors() {
        for (const vector of this.#wrapped.iterLabelVectors()) {
            if (this.#isVectorInFrames(vector)) yield vector;
        }
    }

    /**
     * Handles events dispatched by the wrapped index.
     * 
     * @template {Extract<keyof VectorIndexEventMap, string>} T
     * @param {THREE.BaseEvent<T> & VectorIndexEventMap[T]} wrappedEvent The event to handle. 
     */
    #handleWrappedEvent = (wrappedEvent) => {
        if ('obj' in wrappedEvent) {
            const obj = wrappedEvent.obj;
            if (obj instanceof LabelClass) {
                if (!this.hasLabelClass(obj.id)) return;
            } else if (obj instanceof LabelVector) {
                if (!this.hasLabelVector(obj.id)) return;
            } else {
                console.warn(`Unhandled object type: ${obj.constructor.name}`);
            }
        }

        this.dispatchEvent({ ...wrappedEvent });
    };

    /**
     * Creates a view of an index such that it only includes labels that exists
     * within a set of frames.
     * 
     * Changes to the view are applied to this object, and vice versa.
     * 
     * @param {VectorIndex} wrapped The index to create a view from.
     * @param {ReadonlyArray<EditableFrame>} frames The reference frames.
     */
    constructor(wrapped, frames) {
        super();

        this.#wrapped = wrapped;
        this.#frames = frames;

        for (const eventType of ALL_EVENT_TYPES) {
            this.#wrapped.addEventListener(eventType, this.#handleWrappedEvent);
        }
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        for (const eventType of ALL_EVENT_TYPES) {
            this.#wrapped.removeEventListener(eventType, this.#handleWrappedEvent);
        }
    }
}
