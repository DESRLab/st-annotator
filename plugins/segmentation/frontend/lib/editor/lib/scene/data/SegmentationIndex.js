import _ from 'lodash';
import BiMap from 'ts-bidirectional-map';
import * as THREE from 'three';

import { CollectionUtils } from 'sta/common/utils';
import { Placeholder } from 'sta/services/editor/base';

import { LabelSelection } from './LabelSelection';
import { LabelClass } from './LabelClass';
import { LabelInstance } from './LabelInstance';

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
 * @typedef {import('./LabelSelection').LabelSelectionParams} LabelSelectionParams
 */

/**
 * @typedef {import('./LabelSelection').PropertyChangeEvent} LabelSelectionChangeEvent
 */

/**
 * @typedef {import('./LabelSelection').ReadonlyLabelSelection} ReadonlyLabelSelection
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
 * @typedef {import('./LabelInstance').LabelInstanceParams} LabelInstanceParams
 */

/**
 * @typedef {import('./LabelInstance').PropertyChangeEvent} LabelInstanceChangeEvent 
 */

/**
 * @typedef {import('./LabelInstance').ReadonlyLabelInstance} ReadonlyLabelInstance
 */

/** 
 * @interface
 * @see SegmentationIndex
 */
export class _SegmentationIndex {
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
     * @throws {Error} If the selection is not in the collection.
     * @abstract
     */
    updateLabelClass(labelClass, classParams) {
        throw new Error('Not implemented');
    }

    /**
     * The number of selection stored in the collection.
     * 
     * @type {number}
     */
    get numLabelInstances() { throw new Error('Not implemented'); }

    /**
     * Iterates through each selection in the collection.
     * 
     * @returns {IterableIterator<ReadonlyLabelInstance>} An iterator that yields such items.
     * @abstract
     */
    iterLabelInstances() {
        throw new Error('Not implemented');
    }

    /**
     * Tests whether an selection exists in the collection.
     * 
     * @param {UUID} id The unique identifier of the selection.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {boolean} `true` if the data is in the collection; otherwise, `false`.
     * @throws {Error} If the instance is not in the collection.
     * @abstract
     */
    hasLabelInstance(id, allowDeleted = false) {
        throw new Error('Not implemented');
    }

    /**
     * Gets an selection in the collection by its unique identifier.
     * 
     * @param {UUID} id The unique identifier of the selection.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {ReadonlyLabelInstance} The data of the corresponding selection.
     * @throws {Error} If the instance is not in the collection.
     * @abstract
     */
    getLabelInstance(id, allowDeleted = false) {
        throw new Error('Not implemented');
    }

    /**
     * Adds an selection to the collection.
     * 
     * @param {InstanceParams} instanceParams Parameters to initialize the selection.
     * @returns {LabelInstance} The newly created selection.
     * @throws {Error} If the instance is already in the collection.
     * @abstract
     */
    addLabelInstance(instanceParams) {
        throw new Error('Not implemented');
    }

    /**
     * Removes an selection from the collection.
     * 
     * @param {ReadonlyLabelInstance} instance The selection to remove.
     * @throws {Error} If the instance is not in the collection.
     * @abstract
     */
    deleteLabelInstance(instance) {
        throw new Error('Not implemented');
    }

    /**
     * Updates an selection in the collection.
     * 
     * @param {ReadonlyLabelInstance} instance The selection to update.
     * @param {Partial<InstanceParams>} instanceParams Parameters to update the selection.
     * @throws {Error} If the instance is not in the collection.
     * @abstract
     */
    updateLabelInstance(instance, instanceParams) {
        throw new Error('Not implemented');
    }

    /**
     * The number of selections stored in the collection.
     * 
     * @type {number}
     */
    get numLabelSelections() { throw new Error('Not implemented'); }

    /**
     * Iterates through each selection in the collection.
     * 
     * @returns {IterableIterator<ReadonlyLabelSelection>} An iterator that yields such items.
     * @abstract
     */
    iterLabelSelections() {
        throw new Error('Not implemented');
    }

    /**
     * Tests whether a selection exists in the collection.
     * 
     * @param {UUID} id The unique identifier of the selection.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {boolean} `true` if the data is in the collection; otherwise, `false`.
     * @throws {Error} If the data is not in the collection.
     * @abstract
     */
    hasLabelSelection(id, allowDeleted = false) {
        throw new Error('Not implemented');
    }

    /**
     * Gets a selection in the collection by its unique identifier.
     * 
     * @param {UUID} id The unique identifier of the selection.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {ReadonlyLabelSelection} The data of the corresponding selection.
     * @throws {Error} If the data is not in the collection.
     * @abstract
     */
    getLabelSelection(id, allowDeleted = false) {
        throw new Error('Not implemented');
    }

    /**
     * Adds a selection to the collection.
     * 
     * @param {SelectionParams} selectionParams Parameters to initialize the selection.
     * @returns {ReadonlyLabelSelection} The newly created selection.
     * @throws {Error} If the data is already in the collection.
     * @abstract
     */
    addLabelSelection(selectionParams) {
        throw new Error('Not implemented');
    }

    /**
     * Removes a selection from the collection.
     * 
     * @param {ReadonlyLabelSelection} selection The selection to remove.
     * @throws {Error} If the selection is not in the collection.
     * @abstract
     */
    deleteLabelSelection(selection) {
        throw new Error('Not implemented');
    }

    /**
     * Updates a selection in the collection.
     * 
     * @param {ReadonlyLabelSelection} selection The selection to update.
     * @param {Partial<SelectionParams>} selectionParams Parameters to update the selection.
     * @throws {Error} If the selection is not in the collection.
     * @abstract
     */
    updateLabelSelection(selection, selectionParams) {
        throw new Error('Not implemented');
    }

    /**
     * Gets each selection belonging to an object instance by its unique identifier.
     * 
     * @param {UUID} id The unique identifier of the object instance.
     * @returns {ReadonlySet<ReadonlyLabelSelection>} The data of each selection belonging to the
     * corresponding object instance.
     * @throws {Error} If the data is not in the collection.
     * @abstract
     */
    getLabelInstanceElements(id) {
        throw new Error('Not implemented');
    }

}

/**
 * @typedef {Omit<LabelSelectionParams, 'config' | 'labels'>} SelectionParams
 */

/**
 * @typedef {Omit<LabelClassParams, 'config' | 'labels'>} ClassParams
 */

/**
 * @typedef {Omit<LabelInstanceParams, 'config' | 'labels'>} InstanceParams
 */

/**
 * Represents the event when a  selection in the collection has been updated.
 * - `obj`: The object which has been updated.
 * - `propertyKey`: The name of the property that was changed.
 * 
 * @typedef {{
 *     obj: ReadonlyLabelSelection;
 *     propertyKey: LabelSelectionChangeEvent['propertyKey'];
 * }} SelectionUpdateEvent
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
 * Represents the event when an object instance in the collection has been updated.
 * - `obj`: The object which has been updated.
 * - `propertyKey`: The name of the property that was changed.
 * 
 * @typedef {{
 *     obj: ReadonlyLabelInstance;
 *     propertyKey: LabelInstanceChangeEvent['propertyKey'];
 * }} InstanceUpdateEvent
 */

/**
 * Defines each event that can be dispatched by {@link SegmentationIndex}.
 * 
 * Note that bulk operations do not trigger the more specific events,
 * in order to avoid unnecessary updating.
 * 
 * @typedef {object} SegmentationIndexEventMap
 * @property {{ obj: ReadonlyLabelSelection }} selection-add The event when a selection
 * in the collection has been added.
 * @property {{ obj: ReadonlyLabelSelection }} selection-delete The event when a selection
 * in the collection has been deleted.
 * @property {SelectionUpdateEvent} selection-update
 * The event when a selection in the collection has been updated.
 * @property {{ obj: ReadonlyLabelSelection }} selection-resolveId he event when the
 * {@link Placeholder} unique identifier of a selection has been resolved.
 * @property {{ obj: ReadonlyLabelClass }} class-add The event when an object class
 * in the collection has been added.
 * @property {{ obj: ReadonlyLabelClass }} class-delete The event when an object class
 * in the collection has been deleted.
 * @property {ClassUpdateEvent} class-update
 * The event when an object class in the collection has been updated.
 * @property {{ obj: ReadonlyLabelInstance }} instance-add The event when an object instance
 * in the collection has been added.
 * @property {{ obj: ReadonlyLabelInstance }} instance-delete The event when an object instance
 * in the collection has been deleted.
 * @property {InstanceUpdateEvent} instance-update
 * The event when an object instance in the collection has been updated.
 * @property {{ obj: ReadonlyLabelInstance }} instance-resolveId The event when the
 * {@link Placeholder} unique identifier of an object instance has been resolved.
 * @property {{}} bulk-add The event when multiple items have been added
 * to the collection in a bulk operation.
 * @property {{}} bulk-delete The event multiple items have been deleted
 * from the collection in a bulk operation.
 */

/**
 * @type {ReadonlyArray<Extract<keyof SegmentationIndexEventMap, string>>}
 */
export const ALL_EVENT_TYPES = [
    'selection-add', 'selection-delete', 'selection-update', 'selection-resolveId',
    'class-add', 'class-delete', 'class-update',
    'instance-add', 'instance-delete', 'instance-update', 'instance-resolveId',
    'bulk-add', 'bulk-delete',
];

/**
 * @typedef {object} SegmentationDataParams
 * @property {ReadonlyArray<ClassParams>} [classes=[]] Parameters to initialize each
 * object class in the collection.
 * @property {ReadonlyArray<InstanceParams>} [instances=[]] Parameters to initialize each
 * object instance in the collection.
 * @property {ReadonlyArray<SelectionParams>} [selections=[]] Parameters to initialize each
 * selection in the collection.
 */

/**
 * @typedef {Required<SegmentationDataParams>} SegmentationLabelsData
 */

/**
 * Indexes a collection of segementation labels.
 * 
 * The index updates automatically whenever a change is made to a label created through an
 * `add` method of that index.
 * 
 * @typedef {Expand<_SegmentationIndex & THREE.EventDispatcher<SegmentationIndexEventMap>>
 * } SegmentationIndex
 */

/**
 * @typedef {Pick<SegmentationIndex, keyof THREE.EventDispatcher<SegmentationIndexEventMap>
 * | 'iterLabelClasses' | 'hasLabelClass' | 'getLabelClass'
 * | 'iterLabelInstances' | 'hasLabelInstance' | 'getLabelInstance'
 * | 'iterLabelSelections' | 'hasLabelSelection' | 'getLabelSelection'
 * | 'getLabelInstanceElements'>} ReadonlySegmentationIndex
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
 * @template {{} | null} KResolved
 * @template V
 * @augments {CollectionUtils.DefaultMap<KResolved | Placeholder<KResolved>, V>}
 */
class DefaultMapWithPlaceholderLookup extends CollectionUtils.DefaultMap {

    /**
     * @readonly
     * @type {Map<KResolved, Placeholder<KResolved>>}
     */
    #resolvedPlaceholders = new Map();

    /**
     * @type {(key: KResolved | Placeholder<KResolved>) => V}
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
     * @type {(key: KResolved | Placeholder<KResolved>, value: V) => this}
     */
    set(key, value) {
        if (Placeholder.isPlaceholder(key)) {
            this.#listenToResolve(key);
        }

        return super.set(key, value);
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
        selectionColor: labelClass.selectionColor,
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
 * Converts `instance` into a plain object, so that it can be destructured.
 * 
 * @param {ReadonlyLabelInstance} instance The input object.
 * @returns {Required<InstanceParams>} The converted object.
 */
export function labelInstanceToPlain(instance) {
    return {
        id: instance.id,
        isBlack: instance.isBlack,
        gtClassId: instance.gtClassId,
        minTimestamp: instance.minTimestamp,
        maxTimestamp: instance.maxTimestamp,
    };
}

/**
 * Converts `params` into a plain object.
 * 
 * @template {Partial<InstanceParams>} T
 * @param {T} instanceParams The input object, which may not be plain.
 * @returns {T extends LabelInstance ? Required<InstanceParams> : T} The converted object.
 * @throws {Error} If the object cannot be converted.
 */
export function cleanInstanceParams(instanceParams) {
    // @ts-expect-error
    if (instanceParams instanceof LabelInstance) return labelInstanceToPlain(instanceParams);

    if (!_.isPlainObject(instanceParams)) {
        console.error(instanceParams);
        throw new Error('Unable to clean instanceParams');
    }

    // @ts-expect-error
    return instanceParams;
}

/**
 * Converts `selection` into a plain object, so that it can be destructured.
 * 
 * @param {ReadonlyLabelSelection} selection The input object.
 * @returns {Required<SelectionParams>} The converted object.
 */
export function labelSelectionToPlain(selection) {
    return {
        id: selection.id,
        points: selection.points,
        qualityRank: selection.qualityRank,
        distinctiveLv: selection.distinctiveLv,
        occlusionLv: selection.occlusionLv,
        perceivedClassId: selection.perceivedClassId,
        entityId: selection.entityId,
        timestamp: selection.timestamp,
        showPointSize: selection.showPointSize,
        showPerceivedClass: selection.showPerceivedClass,
        showColor: selection.showColor,
        showCenter: selection.showCenter,
    };
}

/**
 * Converts `selectionParams` into a plain object.
 * 
 * @template {Partial<SelectionParams>} T
 * @param {T} selectionParams The input object, which may not be plain.
 * @returns {T extends LabelSelection ? Required<SelectionParams> : T} The converted object.
 * @throws {Error} If the object cannot be converted.
 */
export function cleanSelectionParams(selectionParams) {
    // @ts-expect-error
    if (selectionParams instanceof LabelSelection) return labelSelectionToPlain(selectionParams);

    if (!_.isPlainObject(selectionParams)) {
        console.error(selectionParams);
        throw new Error('Unable to clean selectionParams');
    }

    // @ts-expect-error
    return selectionParams;
}

/**
 * Indexes a collection of segmentation labels.
 * 
 * The index updates automatically whenever a change is made to a label created through an
 * `add` method of that index.
 * 
 * @augments THREE.EventDispatcher<SegmentationIndexEventMap>
 * @implements {SegmentationIndex}
 */
export class BaseSegmentationIndex extends THREE.EventDispatcher {

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
     * @returns {ReadonlyLabelClass} The data of the corresponding object class.
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
     * @throws {Error} If the selection is not in the collection.
     */
    #deleteLabelClass(labelClass) {
        const id = labelClass.id;

        for (const selection of this.iterLabelSelections()) {
            if (selection.perceivedClassId === id) {
                throw new Error(`Cannot delete class with ID: ${id}. It is used by the selection with ID: ${selection.id}`);
            }
        }

        for (const instance of this.iterLabelInstances()) {
            if (instance.gtClassId === id) {
                throw new Error(`Cannot delete class with ID: ${id}. It is used by the instance with ID: ${instance.id}`);
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

        // Throw the error at the beginning (if the instance does not exist) 
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
     * @throws {Error} If the selection is not in the collection.
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
     * Indexes each object instance in the collection by its unique identifier.
     * 
     * @type {BiMap<UUID, LabelInstance>}
     */
    #instancesById;

    /**
     * @type {BiMap<UUID, LabelInstance>}
     */
    #deletedInstances;

    /**
     * The number of object instances stored in the collection.
     * 
     * @type {number}
     */
    get numLabelInstances() { return this.#instancesById.size; }

    /**
     * Iterates through each object instance in the collection.
     * 
     * @returns {IterableIterator<ReadonlyLabelInstance>} An iterator that yields such items.
     */
    iterLabelInstances() { return this.#instancesById.values(); }

    /**
     * Tests whether an object instance exists in the collection.
     * 
     * @param {UUID} id The unique identifier of the object instance.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {boolean} `true` if the data is in the collection; otherwise, `false`.
     * @throws {Error} If the instance is not in the collection.
     */
    hasLabelInstance(id, allowDeleted = false) {
        return this.#instancesById.has(id)
            || (allowDeleted && this.#deletedInstances.has(id));
    }

    /**
     * Gets an object instance in the collection by its unique identifier.
     * 
     * @param {UUID} id The unique identifier of the object instance.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {LabelInstance} The data of the corresponding object instance.
     * @throws {Error} If the instance is not in the collection.
     */
    #getLabelInstance(id, allowDeleted = false) {
        const result = this.#instancesById.get(id)
            ?? (allowDeleted ? this.#deletedInstances.get(id) : null);

        if (result == null) {
            throw new Error(`There is no instance with the given ID: ${id}`);
        } else if (result.labels !== this) {
            throw new Error(`Instance not registered to index. ID: ${id}`);
        }

        return result;
    }

    /**
     * Gets an object instance in the collection by its unique identifier.
     * 
     * @param {UUID} id The unique identifier of the object instance.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {ReadonlyLabelInstance} The data of the corresponding object instance.
     * @throws {Error} If the instance is not in the collection.
     */
    getLabelInstance(id, allowDeleted = false) {
        return this.#getLabelInstance(id, allowDeleted);
    }

    /**
     * If `instanceParams.id` is a {@link Placeholder}, emits {@link InstanceResolveIDEvent}
     * once it is resolved.
     * 
     * @param {Partial<InstanceParams>} instanceParams The input parameters.
     */
    #emitWhenInstanceIDResolved(instanceParams) {
        const instanceId = instanceParams.id;
        if (Placeholder.isPlaceholder(instanceId)) {
            instanceId.getAsync()
                .then(() => {
                    // This check is in case another ID has been assigned to the object
                    // Also, we test with the Placeholder object, not the resolved value
                    if (this.hasLabelInstance(instanceId)) {
                        this.dispatchEvent({
                            type: 'instance-resolveId',
                            obj: this.getLabelInstance(instanceId),
                        });
                    }
                });
        }
    }

    /**
     * Adds an object instance to the collection,
     * without performing validation or emitting events.
     * 
     * @param {LabelInstance} instance The object instance to add.
     */
    #addLabelInstance(instance) {
        const id = instance.id;

        for (const [selectionId, { entityId: instanceId }] of this.#selectionsById.entries()) {
            if (instanceId === id) {
                this.#selectionIdsByInstanceId.get(instanceId).add(selectionId);
            }
        }
        this.#instancesById.set(id, instance);

        instance.addEventListener('change', this.#onInstanceChange);
    }

    /**
     * Adds an object instance to the collection.
     * 
     * @param {InstanceParams} instanceParams Parameters to initialize the object instance.
     * @param {boolean} isBulk `true` if this is a bulk operation; otherwise, `false`.
     * @returns {LabelInstance} The newly created object instance.
     * @throws {Error} If the instance is already in the collection.
     */
    #addLabelInstanceOrBulk(instanceParams, isBulk) {
        const id = instanceParams.id;

        // Throw the error at the beginning so that a failed operation does not mutate the mapping
        if (this.#instancesById.has(id)) {
            throw new Error(`There already exists a instance with the given ID: ${id}`);
        }

        const plainParams = cleanInstanceParams(instanceParams);

        // Initialize after validation so we don't have to dispose if validation fails
        // Override config/labels since that is not considered part of the parameters
        const instance = new LabelInstance({ ...plainParams, config: this.config, labels: this });
        this.#addLabelInstance(instance);
        instance.render();

        this.#emitWhenInstanceIDResolved(plainParams);

        if (!isBulk) {
            this.dispatchEvent({ type: 'instance-add', obj: instance });
        }

        return instance;
    }

    /**
     * Adds an object instance to the collection.
     * 
     * @param {InstanceParams} instanceParams Parameters to initialize the object instance.
     * @returns {LabelInstance} The newly created object instance.
     * @throws {Error} If the instance is already in the collection.
     */
    addLabelInstance(instanceParams) {
        return this.#addLabelInstanceOrBulk(instanceParams, false);
    }

    /**
     * Removes an object instance from the collection,
     * without performing validation or emitting events.
     * 
     * @param {LabelInstance} instance The object instance to remove.
     * @throws {Error} If the instance is not in the collection.
     */
    #deleteLabelInstance(instance) {
        const id = instance.id;

        for (const selection of this.iterLabelSelections()) {
            if (selection.entityId === id) {
                throw new Error(`Cannot delete instance with ID: ${id}. It is used by the selection with ID: ${selection.id}`);
            }
        }

        this.#selectionIdsByInstanceId.delete(id);
        this.#instancesById.delete(id);
        this.#deletedInstances.set(id, instance);

        instance.removeEventListener('change', this.#onInstanceChange);
    }

    /**
     * Removes an object instance from the collection.
     * 
     * @param {ReadonlyLabelInstance} instance The object instance to remove.
     * @param {boolean} isBulk `true` if this is a bulk operation; otherwise, `false`.
     * @throws {Error} If the instance is not in the collection.
     */
    #deleteLabelInstanceOrBulk(instance, isBulk) {
        const id = instance.id;

        // Throw the error at the beginning (if the instance does not exist) 
        // so that a failed operation does not mutate the mapping
        const editableInstance = this.#getLabelInstance(id);
        if (editableInstance !== instance) {
            throw new Error(`Incorrect instance for instance with ID: ${id}`);
        }

        this.#deleteLabelInstance(editableInstance);
        editableInstance.dispose();

        if (!isBulk) {
            this.dispatchEvent({ type: 'instance-delete', obj: instance });
        }
    }

    /**
     * Removes an object instance from the collection.
     * 
     * @param {ReadonlyLabelInstance} instance The object instance to remove.
     * @throws {Error} If the instance is not in the collection.
     */
    deleteLabelInstance(instance) {
        this.#deleteLabelInstanceOrBulk(instance, false);
    }

    /**
     * Updates an object instance in the collection.
     * 
     * @param {ReadonlyLabelInstance} instance The object instance to update.
     * @param {Partial<InstanceParams>} instanceParams Parameters to update the object instance.
     * @throws {Error} If the instance is not in the collection.
     */
    updateLabelInstance(instance, instanceParams) {
        const editableInstance = this.#instancesById.get(instance.id);
        if (editableInstance !== instance) {
            throw new Error('Failed assertion: The two versions should be the same');
        }

        const plainParams = cleanInstanceParams(instanceParams);

        Object.assign(editableInstance, plainParams);

        this.#emitWhenInstanceIDResolved(plainParams);

        // Emitted indirectly by listening to the event of the label
        // this.dispatchEvent({ type: 'instance-update', obj: instance });
    }

    /**
     * Indexes each a selection in the collection by its unique identifier.
     * 
     * @type {BiMap<UUID, LabelSelection>}
     */
    #selectionsById;

    /**
     * @type {BiMap<UUID, LabelSelection>}
     */
    #deletedSelections;

    /**
     * The number of a selections stored in the collection.
     * 
     * @type {number}
     */
    get numLabelSelections() { return this.#selectionsById.size; }

    /**
     * Iterates through each selection in the collection.
     * 
     * @returns {IterableIterator<ReadonlyLabelSelection>} An iterator that yields such items.
     */
    iterLabelSelections() { return this.#selectionsById.values(); }

    /**
     * Tests whether a selection exists in the collection.
     * 
     * @param {UUID} id The unique identifier of the selection.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {boolean} `true` if the data is in the collection; otherwise, `false`.
     * @throws {Error} If the data is not in the collection.
     */
    hasLabelSelection(id, allowDeleted = false) {
        return this.#selectionsById.has(id)
            || (allowDeleted && this.#deletedSelections.has(id));
    }

    /**
     * Gets a selection in the collection by its unique identifier.
     * 
     * @param {UUID} id The unique identifier of the selection.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {LabelSelection} The data of the corresponding selection.
     * @throws {Error} If the data is not in the collection.
     */
    #getLabelSelection(id, allowDeleted = false) {
        const result = this.#selectionsById.get(id)
            ?? (allowDeleted ? this.#deletedSelections.get(id) : null);

        if (result == null) {
            throw new Error(`There is no selection with the given ID: ${id}`);
        } else if (result.labels !== this) {
            throw new Error(`Selection not registered to index. ID: ${id}`);
        }

        return result;
    }

    /**
     * Gets a selection in the collection by its unique identifier.
     * 
     * @param {UUID} id The unique identifier of the selection.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {ReadonlyLabelSelection} The data of the corresponding selection.
     * @throws {Error} If the data is not in the collection.
     */
    getLabelSelection(id, allowDeleted = false) {
        return this.#getLabelSelection(id, allowDeleted);
    }

    /**
     * If `selectionParams.id` is a {@link Placeholder}, emits {@link SelectionResolveIDEvent}
     * once it is resolved.
     * 
     * @param {Partial<SelectionParams>} selectionParams The input parameters.
     */
    #emitWhenSelectionIDResolved(selectionParams) {
        const selectionId = selectionParams.id;
        if (Placeholder.isPlaceholder(selectionId)) {
            selectionId.getAsync()
                .then(() => {
                    // This check is in case another ID has been assigned to the object
                    // Also, we test with the Placeholder object, not the resolved value
                    if (this.hasLabelSelection(selectionId)) {
                        this.dispatchEvent({
                            type: 'selection-resolveId',
                            obj: this.getLabelSelection(selectionId),
                        });
                    }
                });
        }
    }

    /**
     * Adds a selection to the collection,
     * without performing validation or emitting events.
     * 
     * @param {LabelSelection} selection The selection to add.
     */
    #addLabelSelection(selection) {
        const id = selection.id;

        const instanceId = selection.entityId;
        if (instanceId != null) {
            this.#selectionIdsByInstanceId.get(instanceId).add(id);
        }

        this.#selectionsById.set(id, selection);

        selection.addEventListener('change', this.#onSelectionChange);
    }

    /**
     * Adds a selection to the collection.
     * 
     * @param {SelectionParams} selectionParams Parameters to initialize the selection.
     * @param {boolean} isBulk `true` if this is a bulk operation; otherwise, `false`.
     * @returns {ReadonlyLabelSelection} The newly created selection.
     * @throws {Error} If the data is already in the collection.
     */
    #addLabelSelectionOrBulk(selectionParams, isBulk) {
        const id = selectionParams.id;

        // Throw the error at the beginning so that a failed operation does not mutate the mapping
        if (this.#selectionsById.has(id)) {
            throw new Error(`There already exists a selection with the given ID: ${id}`);
        }

        const plainParams = cleanSelectionParams(selectionParams);

        // Initialize after validation so we don't have to dispose if validation fails
        // Override config/labels since that is not considered part of the parameters
        const selection = new LabelSelection({ ...plainParams, config: this.config, labels: this });
        this.#addLabelSelection(selection);

        selection.render();

        this.#emitWhenSelectionIDResolved(plainParams);

        if (!isBulk) {
            this.dispatchEvent({ type: 'selection-add', obj: selection });
        }

        return selection;
    }

    /**
     * Adds a selection to the collection.
     * 
     * @param {SelectionParams} selectionParams Parameters to initialize the selection.
     * @returns {ReadonlyLabelSelection} The newly created selection.
     * @throws {Error} If the data is already in the collection.
     */
    addLabelSelection(selectionParams) {
        return this.#addLabelSelectionOrBulk(selectionParams, false);
    }

    /**
     * Removes a selection from the collection,
     * without performing validation or emitting events.
     * 
     * @param {LabelSelection} selection The selection to remove.
     * @throws {Error} If the selection is not in the collection.
     */
    #deleteLabelSelection(selection) {
        const id = selection.id;

        const instanceId = selection.entityId;
        if (instanceId != null) {
            this.#selectionIdsByInstanceId.get(instanceId).delete(id);
        }

        this.#selectionsById.delete(id);
        this.#deletedSelections.set(id, selection);

        selection.removeEventListener('change', this.#onSelectionChange);
    }

    /**
     * Removes a selection from the collection.
     * 
     * @param {ReadonlyLabelSelection} selection The selection to remove.
     * @param {boolean} isBulk `true` if this is a bulk operation; otherwise, `false`.
     * @throws {Error} If the selection is not in the collection.
     */
    #deleteLabelSelectionOrBulk(selection, isBulk) {
        const id = selection.id;

        // Throw the error at the beginning (if the selection does not exist) 
        // so that a failed operation does not mutate the mapping
        const editableSelection = this.#getLabelSelection(id);
        if (editableSelection !== selection) {
            throw new Error(`Incorrect instance for instance with ID: ${id}`);
        }

        this.#deleteLabelSelection(editableSelection);
        editableSelection.dispose();

        if (!isBulk) {
            this.dispatchEvent({ type: 'selection-delete', obj: selection });
        }
    }

    /**
     * Removes a selection from the collection.
     * 
     * @param {ReadonlyLabelSelection} selection The selection to remove.
     * @throws {Error} If the selection is not in the collection.
     */
    deleteLabelSelection(selection) {
        this.#deleteLabelSelectionOrBulk(selection, false);
    }

    /**
     * Updates a selection in the collection.
     * 
     * @param {ReadonlyLabelSelection} selection The selection to update.
     * @param {Partial<SelectionParams>} selectionParams Parameters to update the selection.
     * @throws {Error} If the selection is not in the collection.
     */
    updateLabelSelection(selection, selectionParams) {
        const editableSelection = this.#selectionsById.get(selection.id);
        if (editableSelection !== selection) {
            throw new Error('Failed assertion: The two versions should be the same');
        }

        const plainParams = cleanSelectionParams(selectionParams);

        Object.assign(editableSelection, plainParams);

        this.#emitWhenSelectionIDResolved(plainParams);

        // Emitted indirectly by listening to the event of the label
        // this.dispatchEvent({ type: 'selection-update', obj: selection });
    }

    /**
     * Map the unique identifier of an object instance to the unique identifier of each of
     * its element a selections.
     * 
     * @type {CollectionUtils.DefaultMap<UUID, Set<UUID>>}
     */
    #selectionIdsByInstanceId;

    /**
     * Gets each selection belonging to an object instance by its unique identifier.
     * 
     * @param {UUID} id The unique identifier of the object instance.
     * @returns {ReadonlySet<ReadonlyLabelSelection>} The data of each selection belonging to the
     * corresponding object instance.
     * @throws {Error} If the data is not in the collection.
     */
    getLabelInstanceElements(id) {
        const elementIds = this.#selectionIdsByInstanceId.get(id);
        // eslint-disable-next-line max-len
        return new Set(Array.from(elementIds, (selectionId) => this.getLabelSelection(selectionId)));
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
     * Handles the event when an object instance in the collection has been updated.
     * 
     * @param {LabelInstanceChangeEvent} event The event to handle.
     */
    #onInstanceChange = (event) => {
        const instance = event.obj;

        if (event.propertyKey === 'id') {
            const prevInstanceId = this.#instancesById.getKey(instance);
            if (prevInstanceId == null) {
                throw new Error('Assertion failed: Missing instance');
            }

            const instanceId = instance.id;
            const elementIds = this.#selectionIdsByInstanceId.get(prevInstanceId);

            this.#instancesById.delete(prevInstanceId);
            this.#selectionIdsByInstanceId.delete(prevInstanceId);

            this.#instancesById.set(instanceId, instance);
            this.#selectionIdsByInstanceId.set(instanceId, elementIds);
        }

        this.dispatchEvent({
            type: 'instance-update',
            obj: instance,
            propertyKey: event.propertyKey,
        });
    };

    /**
     * Handles the event when a selection in the collection has been updated.
     * 
     * @param {LabelSelectionChangeEvent} event The event to handle.
     */
    #onSelectionChange = (event) => {
        const selection = event.obj;

        if (event.propertyKey === 'id') {
            const prevSelectionId = this.#selectionsById.getKey(selection);
            if (prevSelectionId == null) {
                throw new Error('Assertion failed: Missing selection');
            }

            const selectionId = selection.id;
            const instanceId = selection.entityId;

            this.#selectionsById.delete(prevSelectionId);
            if (instanceId != null) {
                this.#selectionIdsByInstanceId.get(instanceId).delete(prevSelectionId);
            }

            this.#selectionsById.set(selectionId, selection);
            if (instanceId != null) {
                this.#selectionIdsByInstanceId.get(instanceId).add(selectionId);
            }
        } else if (event.propertyKey === 'entityId') {
            const selectionId = selection.id;
            const [prevInstanceId] = [...this.#selectionIdsByInstanceId]
                .find(([, selectionIds]) => selectionIds.has(selectionId)) ?? [null];
            const instanceId = selection.entityId;

            if (prevInstanceId != null) {
                this.#selectionIdsByInstanceId.get(prevInstanceId).delete(selectionId);
            }

            if (instanceId != null) {
                this.#selectionIdsByInstanceId.get(instanceId).add(selectionId);
            }
        }

        this.dispatchEvent({
            type: 'selection-update',
            obj: selection,
            propertyKey: event.propertyKey,
        });
    };

    /**
     * Creates a new index for a collection of object instanceing labels.
     * 
     * @param {EditorConfig} config The configuration of the application.
     * @param {SegmentationDataParams} dataParams Parameters to initialize each label
     * in the collection.
     */
    constructor(config, dataParams) {
        super();

        this.config = config;

        this.#classesById = new BiMap();
        this.#deletedClasses = new BiMap();
        this.#instancesById = new BiMapWithPlaceholderLookup();
        this.#deletedInstances = new BiMapWithPlaceholderLookup();
        this.#selectionsById = new BiMapWithPlaceholderLookup();
        this.#deletedSelections = new BiMapWithPlaceholderLookup();
        this.#selectionIdsByInstanceId = new DefaultMapWithPlaceholderLookup(() => new Set());

        this.addBulk(dataParams);
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.deleteBulk({
            // Make a copy of the collection before deleting
            classes: [...this.iterLabelClasses()],
            instances: [...this.iterLabelInstances()],
            selections: [...this.iterLabelSelections()],
        });

        this.#deletedSelections.clear();
        this.#deletedInstances.clear();
        this.#deletedClasses.clear();
    }

    /**
     * Adds multiple items to this collection in bulk.
     * 
     * @param {{
     *     classes?: ReadonlyArray<ClassParams>;
     *     instances?: ReadonlyArray<InstanceParams>;
     *     selections?: ReadonlyArray<SelectionParams>;
     * }} params The parameters of each item to add.
     */
    addBulk({ classes = [], selections = [], instances = [] }) {
        for (const labelClass of classes) {
            this.#addLabelClassOrBulk(labelClass, true);
        }
        for (const instance of instances) {
            // Instances require classes to be first defined
            this.#addLabelInstanceOrBulk(instance, true);
        }
        for (const selection of selections) {
            // Selections require classes and instances to be first defined
            this.#addLabelSelectionOrBulk(selection, true);
        }

        this.dispatchEvent({ type: 'bulk-add' });
    }

    /**
     * Delete multiple items from this collection in bulk.
     * 
     * @param {{
     *     classes?: ReadonlyArray<ReadonlyLabelClass>;
     *     instances?: ReadonlyArray<ReadonlyLabelInstance>;
     *     selections?: ReadonlyArray<ReadonlyLabelSelection>;
     * }} params Each item to delete.
     */
    deleteBulk({ classes = [], selections = [], instances = [] }) {
        for (const selection of selections) {
            this.#deleteLabelSelectionOrBulk(selection, true);
        }
        for (const instance of instances) {
            this.#deleteLabelInstanceOrBulk(instance, true);
        }
        for (const labelClass of classes) {
            this.#deleteLabelClassOrBulk(labelClass, true);
        }

        this.dispatchEvent({ type: 'bulk-delete' });
    }
}

/**
 * Represents a view of an index such that it only includes labels that exists
 * within a set of frames.
 * 
 * @augments THREE.EventDispatcher<SegmentationIndexEventMap>
 * @implements {SegmentationIndex}
 */
export class SegmentationIndexView extends THREE.EventDispatcher {

    /**
     * The wrapped index.
     * 
     * @type {SegmentationIndex}
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
     * Tests whether a a selection exists in the frames to include.
     * 
     * @param {SelectionParams} selection The query a selection.
     * @returns {boolean} `true` if the given a selection exists in the frames to include;
     * otherwise, `false`.
     */
    #isSelectionInFrames(selection) {
        return this.#anyPointsInFrames(selection.points)
            && this.#isTimestampInFrames(selection.timestamp ?? null);
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
     * @throws {Error} If the selection is not in the collection.
     */
    updateLabelClass(labelClass, classParams) {
        return this.#wrapped.updateLabelClass(labelClass, classParams);
    }

    /**
     * The number of object instances stored in the collection.
     * 
     * @type {number}
     */
    get numLabelInstances() { return this.#wrapped.numLabelInstances; }

    /**
     * Iterates through each object instance in the collection.
     * 
     * @returns {IterableIterator<ReadonlyLabelInstance>} An iterator that yields such items.
     */
    iterLabelInstances() {
        return this.#wrapped.iterLabelInstances();
    }

    /**
     * Tests whether an object instance exists in the collection.
     * 
     * @param {UUID} id The unique identifier of the object instance.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {boolean} `true` if the data is in the collection; otherwise, `false`.
     * @throws {Error} If the instance is not in the collection.
     */
    hasLabelInstance(id, allowDeleted = false) {
        return this.#wrapped.hasLabelInstance(id, allowDeleted);
    }

    /**
     * Gets an object instance in the collection by its unique identifier.
     * 
     * @param {UUID} id The unique identifier of the object instance.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {ReadonlyLabelInstance} The data of the corresponding object instance.
     * @throws {Error} If the instance is not in the collection.
     * @abstract
     */
    getLabelInstance(id, allowDeleted = false) {
        return this.#wrapped.getLabelInstance(id, allowDeleted);
    }

    /**
     * Adds an object instance to the collection.
     * 
     * @param {InstanceParams} instanceParams Parameters to initialize the object instance.
     * @returns {LabelInstance} The newly created object instance.
     * @throws {Error} If the instance is already in the collection.
     */
    addLabelInstance(instanceParams) {
        return this.#wrapped.addLabelInstance(instanceParams);
    }

    /**
     * Removes an object instance from the collection.
     * 
     * @param {ReadonlyLabelInstance} instance The object instance to remove.
     * @throws {Error} If the instance is not in the collection.
     */
    deleteLabelInstance(instance) {
        return this.#wrapped.deleteLabelInstance(instance);
    }

    /**
     * Updates an object instance in the collection.
     * 
     * @param {ReadonlyLabelInstance} instance The object instance to update.
     * @param {Partial<InstanceParams>} instanceParams Parameters to update the object instance.
     * @throws {Error} If the instance is not in the collection.
     */
    updateLabelInstance(instance, instanceParams) {
        return this.#wrapped.updateLabelInstance(instance, instanceParams);
    }

    /**
     * The number of a selections stored in the collection.
     * 
     * @type {number}
     */
    get numLabelSelections() { return this.#wrapped.numLabelSelections; }

    /**
     * Iterates through each vector object in the collection.
     * 
     * @returns {IterableIterator<ReadonlyLabelSelection>} An iterator that yeilds such items.
     */
    * iterLabelSelections() {
        for (const selection of this.#wrapped.iterLabelSelections()) {
            if (this.#isSelectionInFrames(selection)) yield selection;
        }
    }

    /**
     * Tests whether a a selection exists in the collection.
     * 
     * @param {UUID} id The unique identifier of the a selection.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {boolean} `true` if the data is in the collection; otherwise, `false`.
     * @throws {Error} If the data is not in the collection.
     */
    hasLabelSelection(id, allowDeleted = false) {
        if (!this.#wrapped.hasLabelSelection(id, allowDeleted)) return false;

        const selection = this.#wrapped.getLabelSelection(id, allowDeleted);
        return this.#isSelectionInFrames(selection);
    }

    /**
     * Gets a a selection in the collection by its unique identifier.
     * 
     * @param {UUID} id The unique identifier of the a selection.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {ReadonlyLabelSelection} The data of the corresponding a selection.
     * @throws {Error} If the data is not in the collection.
     */
    getLabelSelection(id, allowDeleted = false) {
        const selection = this.#wrapped.getLabelSelection(id, allowDeleted);
        if (!this.#isSelectionInFrames(selection)) {
            throw new Error('The selection does not exist in the frame');
        }

        return selection;
    }

    /**
     * Adds a a selection to the collection.
     * 
     * @param {SelectionParams} selectionParams Parameters to initialize the a selection.
     * @returns {ReadonlyLabelSelection} The newly created a selection.
     * @throws {Error} If the data is already in the collection.
     */
    addLabelSelection(selectionParams) {
        if (!this.#isSelectionInFrames(selectionParams)) {
            throw new Error('The selection does not exist in the frame');
        }

        return this.#wrapped.addLabelSelection(selectionParams);
    }

    /**
     * Removes a a selection from the collection.
     * 
     * @param {ReadonlyLabelSelection} selection The a selection to remove.
     * @throws {Error} If the selection is not in the collection.
     */
    deleteLabelSelection(selection) {
        if (!this.#isSelectionInFrames(selection)) {
            throw new Error('The selection does not exist in the frame');
        }

        this.#wrapped.deleteLabelSelection(selection);
    }

    /**
     * Updates a a selection in the collection.
     * 
     * @param {ReadonlyLabelSelection} selection The a selection to update.
     * @param {Partial<SelectionParams>} selectionParams Parameters to update the a selection.
     * @throws {Error} If the selection is not in the collection.
     */
    updateLabelSelection(selection, selectionParams) {
        if (!this.#isSelectionInFrames(selection)) {
            throw new Error('The selection does not exist in the frame');
        }

        this.#wrapped.updateLabelSelection(selection, selectionParams);
    }

    /**
     * Gets each a selection belonging to an object instance by its unique identifier.
     * 
     * @param {UUID} id The unique identifier of the object instance.
     * @returns {ReadonlySet<ReadonlyLabelSelection>} The data of each a selection belonging to the
     * corresponding object instance.
     * @throws {Error} If the data is not in the collection.
     */
    getLabelInstanceElements(id) {
        return new Set([...this.#wrapped.getLabelInstanceElements(id)]
            .filter((selection) => this.#isSelectionInFrames(selection)));
    }

    /**
     * Handles events dispatched by the wrapped index.
     * 
     * @template {Extract<keyof SegmentationIndexEventMap, string>} T
     * @param {THREE.BaseEvent<T> & SegmentationIndexEventMap[T]} wrappedEvent The event to handle.
     */
    #handleWrappedEvent = (wrappedEvent) => {
        if ('obj' in wrappedEvent) {
            // Avoid forwarding events for objects not shown in this view
            const obj = wrappedEvent.obj;
            if (obj instanceof LabelClass) {
                if (!this.hasLabelClass(obj.id)) return;
            } else if (obj instanceof LabelInstance) {
                if (!this.hasLabelInstance(obj.id)) return;
            } else if (obj instanceof LabelSelection) {
                if (!this.hasLabelSelection(obj.id)) return;
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
     * @param {SegmentationIndex} wrapped The index to create a view from.
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
