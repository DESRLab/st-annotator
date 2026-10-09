import _ from 'lodash';
import BiMap from 'ts-bidirectional-map';
import * as THREE from 'three';

import { CollectionUtils } from 'sta/common/utils';
import { Placeholder } from 'sta/services/editor/base';

import { LabelBox } from './LabelBox';
import { LabelClass } from './LabelClass';
import { LabelTrack } from './LabelTrack';

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
 * @typedef {import('./LabelBox').LabelBoxParams} LabelBoxParams
 */

/**
 * @typedef {import('./LabelBox').PropertyChangeEvent} LabelBoxChangeEvent
 */

/**
 * @typedef {import('./LabelBox').ReadonlyLabelBox} ReadonlyLabelBox
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
 * @typedef {import('./LabelTrack').LabelTrackParams} LabelTrackParams
 */

/**
 * @typedef {import('./LabelTrack').PropertyChangeEvent} LabelTrackChangeEvent
 */

/**
 * @typedef {import('./LabelTrack').ReadonlyLabelTrack} ReadonlyLabelTrack
 */

/**
 * @interface
 * @see BBoxIndex
 */
export class _BBoxIndex {

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
     * The number of object tracks stored in the collection.
     * 
     * @type {number}
     */
    get numLabelTracks() { throw new Error('Not implemented'); }

    /**
     * Iterates through each object track in the collection.
     * 
     * @returns {IterableIterator<ReadonlyLabelTrack>} An iterator that yields such items.
     * @abstract
     */
    iterLabelTracks() {
        throw new Error('Not implemented');
    }

    /**
     * Tests whether an object track exists in the collection.
     * 
     * @param {UUID} id The unique identifier of the object track.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {boolean} `true` if the data is in the collection; otherwise, `false`.
     * @throws {Error} If the track is not in the collection.
     * @abstract
     */
    hasLabelTrack(id, allowDeleted = false) {
        throw new Error('Not implemented');
    }

    /**
     * Gets an object track in the collection by its unique identifier.
     * 
     * @param {UUID} id The unique identifier of the object track.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {ReadonlyLabelTrack} The data of the corresponding object track.
     * @throws {Error} If the track is not in the collection.
     * @abstract
     */
    getLabelTrack(id, allowDeleted = false) {
        throw new Error('Not implemented');
    }

    /**
     * Adds an object track to the collection.
     * 
     * @param {TrackParams} trackParams Parameters to initialize the object track.
     * @returns {LabelTrack} The newly created object track.
     * @throws {Error} If the track is already in the collection.
     * @abstract
     */
    addLabelTrack(trackParams) {
        throw new Error('Not implemented');
    }

    /**
     * Removes an object track from the collection.
     * 
     * @param {ReadonlyLabelTrack} track The object track to remove.
     * @throws {Error} If the track is not in the collection.
     * @abstract
     */
    deleteLabelTrack(track) {
        throw new Error('Not implemented');
    }

    /**
     * Updates an object track in the collection.
     * 
     * @param {ReadonlyLabelTrack} track The object track to update.
     * @param {Partial<TrackParams>} trackParams Parameters to update the object track.
     * @throws {Error} If the track is not in the collection.
     * @abstract
     */
    updateLabelTrack(track, trackParams) {
        throw new Error('Not implemented');
    }

    /**
     * The number of bounding boxes stored in the collection.
     * 
     * @type {number}
     */
    get numLabelBoxes() { throw new Error('Not implemented'); }

    /**
     * Iterates through each bounding box in the collection.
     * 
     * @returns {IterableIterator<ReadonlyLabelBox>} An iterator that yields such items.
     * @abstract
     */
    iterLabelBoxes() {
        throw new Error('Not implemented');
    }

    /**
     * Tests whether a bounding box exists in the collection.
     * 
     * @param {UUID} id The unique identifier of the bounding box.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {boolean} `true` if the data is in the collection; otherwise, `false`.
     * @throws {Error} If the data is not in the collection.
     * @abstract
     */
    hasLabelBox(id, allowDeleted = false) {
        throw new Error('Not implemented');
    }

    /**
     * Gets a bounding box in the collection by its unique identifier.
     * 
     * @param {UUID} id The unique identifier of the bounding box.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {ReadonlyLabelBox} The data of the corresponding bounding box.
     * @throws {Error} If the data is not in the collection.
     * @abstract
     */
    getLabelBox(id, allowDeleted = false) {
        throw new Error('Not implemented');
    }

    /**
     * Adds a bounding box to the collection.
     * 
     * @param {BoxParams} boxParams Parameters to initialize the bounding box.
     * @returns {ReadonlyLabelBox} The newly created bounding box.
     * @throws {Error} If the data is already in the collection.
     * @abstract
     */
    addLabelBox(boxParams) {
        throw new Error('Not implemented');
    }

    /**
     * Removes a bounding box from the collection.
     * 
     * @param {ReadonlyLabelBox} box The bounding box to remove.
     * @throws {Error} If the box is not in the collection.
     * @abstract
     */
    deleteLabelBox(box) {
        throw new Error('Not implemented');
    }

    /**
     * Updates a bounding box in the collection.
     * 
     * @param {ReadonlyLabelBox} box The bounding box to update.
     * @param {Partial<BoxParams>} boxParams Parameters to update the bounding box.
     * @throws {Error} If the box is not in the collection.
     * @abstract
     */
    updateLabelBox(box, boxParams) {
        throw new Error('Not implemented');
    }

    /**
     * Gets each bounding box belonging to an object track by its unique identifier.
     * 
     * @param {UUID} id The unique identifier of the object track.
     * @returns {ReadonlySet<ReadonlyLabelBox>} The data of each bounding box belonging to the
     * corresponding object track.
     * @throws {Error} If the data is not in the collection.
     * @abstract
     */
    getLabelTrackElements(id) {
        throw new Error('Not implemented');
    }
}

/**
 * @typedef {Omit<LabelBoxParams, 'config' | 'labels'>} BoxParams
 */

/**
 * @typedef {Omit<LabelClassParams, 'config' | 'labels'>} ClassParams
 */

/**
 * @typedef {Omit<LabelTrackParams, 'config' | 'labels'>} TrackParams
 */

/**
 * Represents the event when a bounding box in the collection has been updated.
 * - `obj`: The object which has been updated.
 * - `propertyKey`: The name of the property that was changed.
 * 
 * @typedef {{
 *     obj: ReadonlyLabelBox;
 *     propertyKey: LabelBoxChangeEvent['propertyKey'];
 * }} BoxUpdateEvent
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
 * Represents the event when an object track in the collection has been updated.
 * - `obj`: The object which has been updated.
 * - `propertyKey`: The name of the property that was changed.
 * 
 * @typedef {{
 *     obj: ReadonlyLabelTrack;
 *     propertyKey: LabelTrackChangeEvent['propertyKey'];
 * }} TrackUpdateEvent
 */

/**
 * Defines each event that can be dispatched by {@link BBoxIndex}.
 * 
 * Note that bulk operations do not trigger the more specific events,
 * in order to avoid unnecessary updating.
 * 
 * @typedef {object} BBoxIndexEventMap
 * @property {{ obj: ReadonlyLabelBox }} box-add The event when a bounding box
 * in the collection has been added.
 * @property {{ obj: ReadonlyLabelBox }} box-delete The event when a bounding box
 * in the collection has been deleted.
 * @property {BoxUpdateEvent} box-update
 * The event when a bounding box in the collection has been updated.
 * @property {{ obj: ReadonlyLabelBox }} box-resolveId he event when the
 * {@link Placeholder} unique identifier of a bounding box has been resolved.
 * @property {{ obj: ReadonlyLabelClass }} class-add The event when an object class
 * in the collection has been added.
 * @property {{ obj: ReadonlyLabelClass }} class-delete The event when an object class
 * in the collection has been deleted.
 * @property {ClassUpdateEvent} class-update
 * The event when an object class in the collection has been updated.
 * @property {{ obj: ReadonlyLabelTrack }} track-add The event when an object track
 * in the collection has been added.
 * @property {{ obj: ReadonlyLabelTrack }} track-delete The event when an object track
 * in the collection has been deleted.
 * @property {TrackUpdateEvent} track-update
 * The event when an object track in the collection has been updated.
 * @property {{ obj: ReadonlyLabelTrack }} track-resolveId The event when the
 * {@link Placeholder} unique identifier of an object track has been resolved.
 * @property {{}} bulk-add The event when multiple items have been added
 * to the collection in a bulk operation.
 * @property {{}} bulk-delete The event multiple items have been deleted
 * from the collection in a bulk operation.
 */

/**
 * @type {ReadonlyArray<Extract<keyof BBoxIndexEventMap, string>>}
 */
export const ALL_EVENT_TYPES = [
    'box-add', 'box-delete', 'box-update', 'box-resolveId',
    'class-add', 'class-delete', 'class-update',
    'track-add', 'track-delete', 'track-update', 'track-resolveId',
    'bulk-add', 'bulk-delete',
];

/**
 * @typedef {object} BBoxDataParams
 * @property {ReadonlyArray<ClassParams>} [classes=[]] Parameters to initialize each
 * object class in the collection.
 * @property {ReadonlyArray<TrackParams>} [tracks=[]] Parameters to initialize each
 * object track in the collection.
 * @property {ReadonlyArray<BoxParams>} [boxes=[]] Parameters to initialize each
 * bounding box in the collection.
 */

/**
 * @typedef {Required<BBoxDataParams>} BBoxLabelsData
 */

/**
 * Indexes a collection of bounding box labels.
 * 
 * The index updates automatically whenever a change is made to a label created through an
 * `add` method of that index.
 * 
 * @typedef {Expand<_BBoxIndex & THREE.EventDispatcher<BBoxIndexEventMap>>
 * } BBoxIndex
 */

/**
 * @typedef {Pick<BBoxIndex, keyof THREE.EventDispatcher<BBoxIndexEventMap>
 * | 'iterLabelClasses' | 'hasLabelClass' | 'getLabelClass'
 * | 'iterLabelTracks' | 'hasLabelTrack' | 'getLabelTrack'
 * | 'iterLabelBoxes' | 'hasLabelBox' | 'getLabelBox'
 * | 'getLabelTrackElements'>} ReadonlyBBoxIndex
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
        boxColor: labelClass.boxColor,
        defaultSizeDatabase: labelClass.defaultSizeDatabase,
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
 * Converts `track` into a plain object, so that it can be destructured.
 * 
 * @param {ReadonlyLabelTrack} track The input object.
 * @returns {Required<TrackParams>} The converted object.
 */
export function labelTrackToPlain(track) {
    return {
        id: track.id,
        isBlack: track.isBlack,
        gtClassId: track.gtClassId,
        minTimestamp: track.minTimestamp,
        maxTimestamp: track.maxTimestamp,
    };
}

/**
 * Converts `params` into a plain object.
 * 
 * @template {Partial<TrackParams>} T
 * @param {T} trackParams The input object, which may not be plain.
 * @returns {T extends LabelTrack ? Required<TrackParams> : T} The converted object.
 * @throws {Error} If the object cannot be converted.
 */
export function cleanTrackParams(trackParams) {
    // @ts-expect-error
    if (trackParams instanceof LabelTrack) return labelTrackToPlain(trackParams);

    if (!_.isPlainObject(trackParams)) {
        console.error(trackParams);
        throw new Error('Unable to clean trackParams');
    }

    // @ts-expect-error
    return trackParams;
}

/**
 * Converts `box` into a plain object, so that it can be destructured.
 * 
 * @param {ReadonlyLabelBox} box The input object.
 * @returns {Required<BoxParams>} The converted object.
 */
export function labelBoxToPlain(box) {
    return {
        id: box.id,
        boxType: box.boxType,
        center: box.center,
        angle: box.angle,
        size: box.size,
        qualityRank: box.qualityRank,
        distinctiveLv: box.distinctiveLv,
        occlusionLv: box.occlusionLv,
        perceivedClassId: box.perceivedClassId,
        entityId: box.entityId,
        timestamp: box.timestamp,
        opacity: box.opacity,
        showForwardIndicator: box.showForwardIndicator,
        showFrame: box.showFrame,
        showPerceivedClass: box.showPerceivedClass,
        showColor: box.showColor,
    };
}

/**
 * Converts `boxParams` into a plain object.
 * 
 * @template {Partial<BoxParams>} T
 * @param {T} boxParams The input object, which may not be plain.
 * @returns {T extends LabelBox ? Required<BoxParams> : T} The converted object.
 * @throws {Error} If the object cannot be converted.
 */
export function cleanBoxParams(boxParams) {
    // @ts-expect-error
    if (boxParams instanceof LabelBox) return labelBoxToPlain(boxParams);

    if (!_.isPlainObject(boxParams)) {
        console.error(boxParams);
        throw new Error('Unable to clean boxParams');
    }

    // @ts-expect-error
    return boxParams;
}

/**
 * Indexes a collection of bounding box labels.
 * 
 * The index updates automatically whenever a change is made to a label created through an
 * `add` method of that index.
 * 
 * @augments THREE.EventDispatcher<BBoxIndexEventMap>
 * @implements {BBoxIndex}
 */
export class BaseBBoxIndex extends THREE.EventDispatcher {

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
     * @throws {Error} If the box is not in the collection.
     */
    #deleteLabelClass(labelClass) {
        const id = labelClass.id;

        for (const box of this.iterLabelBoxes()) {
            if (box.perceivedClassId === id) {
                throw new Error(`Cannot delete class with ID: ${id}. It is used by the box with ID: ${box.id}`);
            }
        }

        for (const track of this.iterLabelTracks()) {
            if (track.gtClassId === id) {
                throw new Error(`Cannot delete class with ID: ${id}. It is used by the track with ID: ${track.id}`);
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
     * Indexes each object track in the collection by its unique identifier.
     * 
     * @type {BiMap<UUID, LabelTrack>}
     */
    #tracksById;

    /**
     * @type {BiMap<UUID, LabelTrack>}
     */
    #deletedTracks;

    /**
     * The number of object tracks stored in the collection.
     * 
     * @type {number}
     */
    get numLabelTracks() { return this.#tracksById.size; }

    /**
     * Iterates through each object track in the collection.
     * 
     * @returns {IterableIterator<ReadonlyLabelTrack>} An iterator that yields such items.
     */
    iterLabelTracks() { return this.#tracksById.values(); }

    /**
     * Tests whether an object track exists in the collection.
     * 
     * @param {UUID} id The unique identifier of the object track.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {boolean} `true` if the data is in the collection; otherwise, `false`.
     * @throws {Error} If the track is not in the collection.
     */
    hasLabelTrack(id, allowDeleted = false) {
        return this.#tracksById.has(id)
            || (allowDeleted && this.#deletedTracks.has(id));
    }

    /**
     * Gets an object track in the collection by its unique identifier.
     * 
     * @param {UUID} id The unique identifier of the object track.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {LabelTrack} The data of the corresponding object track.
     * @throws {Error} If the track is not in the collection.
     */
    #getLabelTrack(id, allowDeleted = false) {
        const result = this.#tracksById.get(id)
            ?? (allowDeleted ? this.#deletedTracks.get(id) : null);

        if (result == null) {
            throw new Error(`There is no track with the given ID: ${id}`);
        } else if (result.labels !== this) {
            throw new Error(`Track not registered to index. ID: ${id}`);
        }

        return result;
    }

    /**
     * Gets an object track in the collection by its unique identifier.
     * 
     * @param {UUID} id The unique identifier of the object track.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {ReadonlyLabelTrack} The data of the corresponding object track.
     * @throws {Error} If the track is not in the collection.
     */
    getLabelTrack(id, allowDeleted = false) {
        return this.#getLabelTrack(id, allowDeleted);
    }

    /**
     * If `trackParams.id` is a {@link Placeholder}, emits {@link TrackResolveIDEvent}
     * once it is resolved.
     * 
     * @param {Partial<TrackParams>} trackParams The input parameters.
     */
    #emitWhenTrackIDResolved(trackParams) {
        const trackId = trackParams.id;
        if (Placeholder.isPlaceholder(trackId)) {
            trackId.getAsync()
                .then(() => {
                    // This check is in case another ID has been assigned to the object
                    // Also, we test with the Placeholder object, not the resolved value
                    if (this.hasLabelTrack(trackId)) {
                        this.dispatchEvent({
                            type: 'track-resolveId',
                            obj: this.getLabelTrack(trackId),
                        });
                    }
                });
        }
    }

    /**
     * Adds an object track to the collection,
     * without performing validation or emitting events.
     * 
     * @param {LabelTrack} track The object track to add.
     */
    #addLabelTrack(track) {
        const id = track.id;

        for (const [boxId, { entityId: trackId }] of this.#boxesById.entries()) {
            if (trackId === id) {
                this.#boxIdsByTrackId.get(trackId).add(boxId);
            }
        }
        this.#tracksById.set(id, track);

        track.addEventListener('change', this.#onTrackChange);
    }

    /**
     * Adds an object track to the collection.
     * 
     * @param {TrackParams} trackParams Parameters to initialize the object track.
     * @param {boolean} isBulk `true` if this is a bulk operation; otherwise, `false`.
     * @returns {LabelTrack} The newly created object track.
     * @throws {Error} If the track is already in the collection.
     */
    #addLabelTrackOrBulk(trackParams, isBulk) {
        const id = trackParams.id;

        // Throw the error at the beginning so that a failed operation does not mutate the mapping
        if (this.#tracksById.has(id)) {
            throw new Error(`There already exists a track with the given ID: ${id}`);
        }

        const plainParams = cleanTrackParams(trackParams);

        // Initialize after validation so we don't have to dispose if validation fails
        // Override config/labels since that is not considered part of the parameters
        const track = new LabelTrack({ ...plainParams, config: this.config, labels: this });
        this.#addLabelTrack(track);
        track.render();

        this.#emitWhenTrackIDResolved(plainParams);

        if (!isBulk) {
            this.dispatchEvent({ type: 'track-add', obj: track });
        }

        return track;
    }

    /**
     * Adds an object track to the collection.
     * 
     * @param {TrackParams} trackParams Parameters to initialize the object track.
     * @returns {LabelTrack} The newly created object track.
     * @throws {Error} If the track is already in the collection.
     */
    addLabelTrack(trackParams) {
        return this.#addLabelTrackOrBulk(trackParams, false);
    }

    /**
     * Removes an object track from the collection,
     * without performing validation or emitting events.
     * 
     * @param {LabelTrack} track The object track to remove.
     * @throws {Error} If the track is not in the collection.
     */
    #deleteLabelTrack(track) {
        const id = track.id;

        for (const box of this.iterLabelBoxes()) {
            if (box.entityId === id) {
                throw new Error(`Cannot delete track with ID: ${id}. It is used by the box with ID: ${box.id}`);
            }
        }

        this.#boxIdsByTrackId.delete(id);
        this.#tracksById.delete(id);
        this.#deletedTracks.set(id, track);

        track.removeEventListener('change', this.#onTrackChange);
    }

    /**
     * Removes an object track from the collection.
     * 
     * @param {ReadonlyLabelTrack} track The object track to remove.
     * @param {boolean} isBulk `true` if this is a bulk operation; otherwise, `false`.
     * @throws {Error} If the track is not in the collection.
     */
    #deleteLabelTrackOrBulk(track, isBulk) {
        const id = track.id;

        // Throw the error at the beginning (if the track does not exist) 
        // so that a failed operation does not mutate the mapping
        const editableTrack = this.#getLabelTrack(id);
        if (editableTrack !== track) {
            throw new Error(`Incorrect instance for track with ID: ${id}`);
        }

        this.#deleteLabelTrack(editableTrack);
        editableTrack.dispose();

        if (!isBulk) {
            this.dispatchEvent({ type: 'track-delete', obj: track });
        }
    }

    /**
     * Removes an object track from the collection.
     * 
     * @param {ReadonlyLabelTrack} track The object track to remove.
     * @throws {Error} If the track is not in the collection.
     */
    deleteLabelTrack(track) {
        this.#deleteLabelTrackOrBulk(track, false);
    }

    /**
     * Updates an object track in the collection.
     * 
     * @param {ReadonlyLabelTrack} track The object track to update.
     * @param {Partial<TrackParams>} trackParams Parameters to update the object track.
     * @throws {Error} If the track is not in the collection.
     */
    updateLabelTrack(track, trackParams) {
        const editableTrack = this.#tracksById.get(track.id);
        if (editableTrack !== track) {
            throw new Error('Failed assertion: The two versions should be the same');
        }

        const plainParams = cleanTrackParams(trackParams);

        Object.assign(editableTrack, plainParams);

        this.#emitWhenTrackIDResolved(plainParams);

        // Emitted indirectly by listening to the event of the label
        // this.dispatchEvent({ type: 'track-update', obj: track });
    }

    /**
     * Indexes each bounding box in the collection by its unique identifier.
     * 
     * @type {BiMap<UUID, LabelBox>}
     */
    #boxesById;

    /**
     * @type {BiMap<UUID, LabelBox>}
     */
    #deletedBoxes;

    /**
     * The number of bounding boxes stored in the collection.
     * 
     * @type {number}
     */
    get numLabelBoxes() { return this.#boxesById.size; }

    /**
     * Iterates through each bounding box in the collection.
     * 
     * @returns {IterableIterator<ReadonlyLabelBox>} An iterator that yields such items.
     */
    iterLabelBoxes() { return this.#boxesById.values(); }

    /**
     * Tests whether a bounding box exists in the collection.
     * 
     * @param {UUID} id The unique identifier of the bounding box.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {boolean} `true` if the data is in the collection; otherwise, `false`.
     * @throws {Error} If the data is not in the collection.
     */
    hasLabelBox(id, allowDeleted = false) {
        return this.#boxesById.has(id)
            || (allowDeleted && this.#deletedBoxes.has(id));
    }

    /**
     * Gets a bounding box in the collection by its unique identifier.
     * 
     * @param {UUID} id The unique identifier of the bounding box.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {LabelBox} The data of the corresponding bounding box.
     * @throws {Error} If the data is not in the collection.
     */
    #getLabelBox(id, allowDeleted = false) {
        const result = this.#boxesById.get(id)
            ?? (allowDeleted ? this.#deletedBoxes.get(id) : null);

        if (result == null) {
            throw new Error(`There is no box with the given ID: ${id}`);
        } else if (result.labels !== this) {
            throw new Error(`Box not registered to index. ID: ${id}`);
        }

        return result;
    }

    /**
     * Gets a bounding box in the collection by its unique identifier.
     * 
     * @param {UUID} id The unique identifier of the bounding box.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {ReadonlyLabelBox} The data of the corresponding bounding box.
     * @throws {Error} If the data is not in the collection.
     */
    getLabelBox(id, allowDeleted = false) {
        return this.#getLabelBox(id, allowDeleted);
    }

    /**
     * If `boxParams.id` is a {@link Placeholder}, emits {@link BoxResolveIDEvent}
     * once it is resolved.
     * 
     * @param {Partial<BoxParams>} boxParams The input parameters.
     */
    #emitWhenBoxIDResolved(boxParams) {
        const boxId = boxParams.id;
        if (Placeholder.isPlaceholder(boxId)) {
            boxId.getAsync()
                .then(() => {
                    // This check is in case another ID has been assigned to the object
                    // Also, we test with the Placeholder object, not the resolved value
                    if (this.hasLabelBox(boxId)) {
                        this.dispatchEvent({
                            type: 'box-resolveId',
                            obj: this.getLabelBox(boxId),
                        });
                    }
                });
        }
    }

    /**
     * Adds a bounding box to the collection,
     * without performing validation or emitting events.
     * 
     * @param {LabelBox} box The bounding box to add.
     */
    #addLabelBox(box) {
        const id = box.id;

        const trackId = box.entityId;
        if (trackId != null) {
            this.#boxIdsByTrackId.get(trackId).add(id);
        }

        this.#boxesById.set(id, box);

        box.addEventListener('change', this.#onBoxChange);
    }

    /**
     * Adds a bounding box to the collection.
     * 
     * @param {BoxParams} boxParams Parameters to initialize the bounding box.
     * @param {boolean} isBulk `true` if this is a bulk operation; otherwise, `false`.
     * @returns {ReadonlyLabelBox} The newly created bounding box.
     * @throws {Error} If the data is already in the collection.
     */
    #addLabelBoxOrBulk(boxParams, isBulk) {
        const id = boxParams.id;

        // Throw the error at the beginning so that a failed operation does not mutate the mapping
        if (this.#boxesById.has(id)) {
            throw new Error(`There already exists a box with the given ID: ${id}`);
        }

        const plainParams = cleanBoxParams(boxParams);

        // Initialize after validation so we don't have to dispose if validation fails
        // Override config/labels since that is not considered part of the parameters
        const box = new LabelBox({ ...plainParams, config: this.config, labels: this });
        this.#addLabelBox(box);
        box.render();

        this.#emitWhenBoxIDResolved(plainParams);

        if (!isBulk) {
            this.dispatchEvent({ type: 'box-add', obj: box });
        }

        return box;
    }

    /**
     * Adds a bounding box to the collection.
     * 
     * @param {BoxParams} boxParams Parameters to initialize the bounding box.
     * @returns {ReadonlyLabelBox} The newly created bounding box.
     * @throws {Error} If the data is already in the collection.
     */
    addLabelBox(boxParams) {
        return this.#addLabelBoxOrBulk(boxParams, false);
    }

    /**
     * Removes a bounding box from the collection,
     * without performing validation or emitting events.
     * 
     * @param {LabelBox} box The bounding box to remove.
     * @throws {Error} If the box is not in the collection.
     */
    #deleteLabelBox(box) {
        const id = box.id;

        const trackId = box.entityId;
        if (trackId != null) {
            this.#boxIdsByTrackId.get(trackId).delete(id);
        }

        this.#boxesById.delete(id);
        this.#deletedBoxes.set(id, box);

        box.removeEventListener('change', this.#onBoxChange);
    }

    /**
     * Removes a bounding box from the collection.
     * 
     * @param {ReadonlyLabelBox} box The bounding box to remove.
     * @param {boolean} isBulk `true` if this is a bulk operation; otherwise, `false`.
     * @throws {Error} If the box is not in the collection.
     */
    #deleteLabelBoxOrBulk(box, isBulk) {
        const id = box.id;

        // Throw the error at the beginning (if the box does not exist) 
        // so that a failed operation does not mutate the mapping
        const editableBox = this.#getLabelBox(id);
        if (editableBox !== box) {
            throw new Error(`Incorrect instance for track with ID: ${id}`);
        }

        this.#deleteLabelBox(editableBox);
        editableBox.dispose();

        if (!isBulk) {
            this.dispatchEvent({ type: 'box-delete', obj: box });
        }
    }

    /**
     * Removes a bounding box from the collection.
     * 
     * @param {ReadonlyLabelBox} box The bounding box to remove.
     * @throws {Error} If the box is not in the collection.
     */
    deleteLabelBox(box) {
        this.#deleteLabelBoxOrBulk(box, false);
    }

    /**
     * Updates a bounding box in the collection.
     * 
     * @param {ReadonlyLabelBox} box The bounding box to update.
     * @param {Partial<BoxParams>} boxParams Parameters to update the bounding box.
     * @throws {Error} If the box is not in the collection.
     */
    updateLabelBox(box, boxParams) {
        const editableBox = this.#boxesById.get(box.id);
        if (editableBox !== box) {
            throw new Error('Failed assertion: The two versions should be the same');
        }

        const plainParams = cleanBoxParams(boxParams);

        Object.assign(editableBox, plainParams);

        this.#emitWhenBoxIDResolved(plainParams);

        // Emitted indirectly by listening to the event of the label
        // this.dispatchEvent({ type: 'box-update', obj: box });
    }

    /**
     * Map the unique identifier of an object track to the unique identifier of each of
     * its element bounding boxes.
     * 
     * @type {CollectionUtils.DefaultMap<UUID, Set<UUID>>}
     */
    #boxIdsByTrackId;

    /**
     * Gets each bounding box belonging to an object track by its unique identifier.
     * 
     * @param {UUID} id The unique identifier of the object track.
     * @returns {ReadonlySet<ReadonlyLabelBox>} The data of each bounding box belonging to the
     * corresponding object track.
     * @throws {Error} If the data is not in the collection.
     */
    getLabelTrackElements(id) {
        const elementIds = this.#boxIdsByTrackId.get(id);
        return new Set(Array.from(elementIds, (boxId) => this.getLabelBox(boxId)));
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
     * Handles the event when an object track in the collection has been updated.
     * 
     * @param {LabelTrackChangeEvent} event The event to handle.
     */
    #onTrackChange = (event) => {
        const track = event.obj;

        if (event.propertyKey === 'id') {
            const prevTrackId = this.#tracksById.getKey(track);
            if (prevTrackId == null) {
                throw new Error('Assertion failed: Missing track');
            }

            const trackId = track.id;
            const elementIds = this.#boxIdsByTrackId.get(prevTrackId);

            this.#tracksById.delete(prevTrackId);
            this.#boxIdsByTrackId.delete(prevTrackId);

            this.#tracksById.set(trackId, track);
            this.#boxIdsByTrackId.set(trackId, elementIds);
        }

        this.dispatchEvent({
            type: 'track-update',
            obj: track,
            propertyKey: event.propertyKey,
        });
    };

    /**
     * Handles the event when a bounding box in the collection has been updated.
     * 
     * @param {LabelBoxChangeEvent} event The event to handle.
     */
    #onBoxChange = (event) => {
        const box = event.obj;

        if (event.propertyKey === 'id') {
            const prevBoxId = this.#boxesById.getKey(box);
            if (prevBoxId == null) {
                throw new Error('Assertion failed: Missing box');
            }

            const boxId = box.id;
            const trackId = box.entityId;

            this.#boxesById.delete(prevBoxId);
            if (trackId != null) {
                this.#boxIdsByTrackId.get(trackId).delete(prevBoxId);
            }

            this.#boxesById.set(boxId, box);
            if (trackId != null) {
                this.#boxIdsByTrackId.get(trackId).add(boxId);
            }
        } else if (event.propertyKey === 'entityId') {
            const boxId = box.id;
            const [prevTrackId] = [...this.#boxIdsByTrackId]
                .find(([, boxIds]) => boxIds.has(boxId)) ?? [null];
            const trackId = box.entityId;

            if (prevTrackId != null) {
                this.#boxIdsByTrackId.get(prevTrackId).delete(boxId);
            }

            if (trackId != null) {
                this.#boxIdsByTrackId.get(trackId).add(boxId);
            }
        }

        this.dispatchEvent({
            type: 'box-update',
            obj: box,
            propertyKey: event.propertyKey,
        });
    };

    /**
     * Creates a new index for a collection of bounding box labels.
     * 
     * @param {EditorConfig} config The configuration of the application.
     * @param {BBoxDataParams} dataParams Parameters to initialize each label
     * in the collection.
     */
    constructor(config, dataParams) {
        super();

        this.config = config;

        this.#classesById = new BiMap();
        this.#deletedClasses = new BiMap();
        this.#tracksById = new BiMapWithPlaceholderLookup();
        this.#deletedTracks = new BiMapWithPlaceholderLookup();
        this.#boxesById = new BiMapWithPlaceholderLookup();
        this.#deletedBoxes = new BiMapWithPlaceholderLookup();
        this.#boxIdsByTrackId = new DefaultMapWithPlaceholderLookup(() => new Set());

        this.addBulk(dataParams);
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.deleteBulk({
            // Make a copy of the collection before deleting
            classes: [...this.iterLabelClasses()],
            tracks: [...this.iterLabelTracks()],
            boxes: [...this.iterLabelBoxes()],
        });

        this.#deletedBoxes.clear();
        this.#deletedTracks.clear();
        this.#deletedClasses.clear();
    }

    /**
     * Adds multiple items to this collection in bulk.
     * 
     * @param {{
     *     classes?: ReadonlyArray<ClassParams>;
     *     tracks?: ReadonlyArray<TrackParams>;
     *     boxes?: ReadonlyArray<BoxParams>;
     * }} params The parameters of each item to add.
     */
    addBulk({ classes = [], boxes = [], tracks = [] }) {
        for (const labelClass of classes) {
            this.#addLabelClassOrBulk(labelClass, true);
        }
        for (const track of tracks) {
            // Tracks require classes to be first defined
            this.#addLabelTrackOrBulk(track, true);
        }
        for (const box of boxes) {
            // Boxes require classes and tracks to be first defined
            this.#addLabelBoxOrBulk(box, true);
        }

        this.dispatchEvent({ type: 'bulk-add' });
    }

    /**
     * Delete multiple items from this collection in bulk.
     * 
     * @param {{
     *     classes?: ReadonlyArray<ReadonlyLabelClass>;
     *     tracks?: ReadonlyArray<ReadonlyLabelTrack>;
     *     boxes?: ReadonlyArray<ReadonlyLabelBox>;
     * }} params Each item to delete.
     */
    deleteBulk({ classes = [], boxes = [], tracks = [] }) {
        for (const box of boxes) {
            this.#deleteLabelBoxOrBulk(box, true);
        }
        for (const track of tracks) {
            this.#deleteLabelTrackOrBulk(track, true);
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
 * @augments THREE.EventDispatcher<BBoxIndexEventMap>
 * @implements {BBoxIndex}
 */
export class BBoxIndexView extends THREE.EventDispatcher {

    /**
     * The wrapped index.
     * 
     * @type {BBoxIndex}
     */
    #wrapped;

    /**
     * The frames to only include labels for.
     * 
     * @type {ReadonlyArray<EditableFrame>}
     */
    #frames;

    /**
     * Tests whether a point exists in the frames to include.
     * 
     * @param {THREE.Vector3} point The query point.
     * @returns {boolean} `true` if the given point exists in the frames to include;
     * otherwise, `false`.
     */
    #isPointInFrames(point) {
        return this.#frames.some((frame) => frame.containsPoint(point));
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
     * Tests whether a bounding box exists in the frames to include.
     * 
     * @param {BoxParams} box The query bounding box.
     * @returns {boolean} `true` if the given bounding box exists in the frames to include;
     * otherwise, `false`.
     */
    #isBoxInFrames(box) {
        return this.#isPointInFrames(box.center)
            && this.#isTimestampInFrames(box.timestamp ?? null);
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
     * The number of object tracks stored in the collection.
     * 
     * @type {number}
     */
    get numLabelTracks() { return this.#wrapped.numLabelTracks; }

    /**
     * Iterates through each object track in the collection.
     * 
     * @returns {IterableIterator<ReadonlyLabelTrack>} An iterator that yields such items.
     */
    iterLabelTracks() {
        return this.#wrapped.iterLabelTracks();
    }

    /**
     * Tests whether an object track exists in the collection.
     * 
     * @param {UUID} id The unique identifier of the object track.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {boolean} `true` if the data is in the collection; otherwise, `false`.
     * @throws {Error} If the track is not in the collection.
     */
    hasLabelTrack(id, allowDeleted = false) {
        return this.#wrapped.hasLabelTrack(id, allowDeleted);
    }

    /**
     * Gets an object track in the collection by its unique identifier.
     * 
     * @param {UUID} id The unique identifier of the object track.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {ReadonlyLabelTrack} The data of the corresponding object track.
     * @throws {Error} If the track is not in the collection.
     * @abstract
     */
    getLabelTrack(id, allowDeleted = false) {
        return this.#wrapped.getLabelTrack(id, allowDeleted);
    }

    /**
     * Adds an object track to the collection.
     * 
     * @param {TrackParams} trackParams Parameters to initialize the object track.
     * @returns {LabelTrack} The newly created object track.
     * @throws {Error} If the track is already in the collection.
     */
    addLabelTrack(trackParams) {
        return this.#wrapped.addLabelTrack(trackParams);
    }

    /**
     * Removes an object track from the collection.
     * 
     * @param {ReadonlyLabelTrack} track The object track to remove.
     * @throws {Error} If the track is not in the collection.
     */
    deleteLabelTrack(track) {
        return this.#wrapped.deleteLabelTrack(track);
    }

    /**
     * Updates an object track in the collection.
     * 
     * @param {ReadonlyLabelTrack} track The object track to update.
     * @param {Partial<TrackParams>} trackParams Parameters to update the object track.
     * @throws {Error} If the track is not in the collection.
     */
    updateLabelTrack(track, trackParams) {
        return this.#wrapped.updateLabelTrack(track, trackParams);
    }

    /**
     * The number of bounding boxes stored in the collection.
     * 
     * @type {number}
     */
    get numLabelBoxes() { return this.#wrapped.numLabelBoxes; }

    /**
     * Iterates through each bounding box in the collection.
     * 
     * @returns {IterableIterator<ReadonlyLabelBox>} An iterator that yields such items.
     */
    * iterLabelBoxes() {
        for (const box of this.#wrapped.iterLabelBoxes()) {
            if (this.#isBoxInFrames(box)) yield box;
        }
    }

    /**
     * Tests whether a bounding box exists in the collection.
     * 
     * @param {UUID} id The unique identifier of the bounding box.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {boolean} `true` if the data is in the collection; otherwise, `false`.
     * @throws {Error} If the data is not in the collection.
     */
    hasLabelBox(id, allowDeleted = false) {
        if (!this.#wrapped.hasLabelBox(id, allowDeleted)) return false;

        const box = this.#wrapped.getLabelBox(id, allowDeleted);
        return this.#isBoxInFrames(box);
    }

    /**
     * Gets a bounding box in the collection by its unique identifier.
     * 
     * @param {UUID} id The unique identifier of the bounding box.
     * @param {boolean} allowDeleted If `true`, may consider items that have been
     * marked as deleted.
     * @returns {ReadonlyLabelBox} The data of the corresponding bounding box.
     * @throws {Error} If the data is not in the collection.
     */
    getLabelBox(id, allowDeleted = false) {
        const box = this.#wrapped.getLabelBox(id, allowDeleted);
        if (!this.#isBoxInFrames(box)) {
            throw new Error('The box does not exist in the frame');
        }

        return box;
    }

    /**
     * Adds a bounding box to the collection.
     * 
     * @param {BoxParams} boxParams Parameters to initialize the bounding box.
     * @returns {ReadonlyLabelBox} The newly created bounding box.
     * @throws {Error} If the data is already in the collection.
     */
    addLabelBox(boxParams) {
        if (!this.#isBoxInFrames(boxParams)) {
            throw new Error('The box does not exist in the frame');
        }

        return this.#wrapped.addLabelBox(boxParams);
    }

    /**
     * Removes a bounding box from the collection.
     * 
     * @param {ReadonlyLabelBox} box The bounding box to remove.
     * @throws {Error} If the box is not in the collection.
     */
    deleteLabelBox(box) {
        if (!this.#isBoxInFrames(box)) {
            throw new Error('The box does not exist in the frame');
        }

        this.#wrapped.deleteLabelBox(box);
    }

    /**
     * Updates a bounding box in the collection.
     * 
     * @param {ReadonlyLabelBox} box The bounding box to update.
     * @param {Partial<BoxParams>} boxParams Parameters to update the bounding box.
     * @throws {Error} If the box is not in the collection.
     */
    updateLabelBox(box, boxParams) {
        if (!this.#isBoxInFrames(box)) {
            throw new Error('The box does not exist in the frame');
        }

        this.#wrapped.updateLabelBox(box, boxParams);
    }

    /**
     * Gets each bounding box belonging to an object track by its unique identifier.
     * 
     * @param {UUID} id The unique identifier of the object track.
     * @returns {ReadonlySet<ReadonlyLabelBox>} The data of each bounding box belonging to the
     * corresponding object track.
     * @throws {Error} If the data is not in the collection.
     */
    getLabelTrackElements(id) {
        return new Set([...this.#wrapped.getLabelTrackElements(id)]
            .filter((box) => this.#isBoxInFrames(box)));
    }

    /**
     * Handles events dispatched by the wrapped index.
     * 
     * @template {Extract<keyof BBoxIndexEventMap, string>} T
     * @param {THREE.BaseEvent<T> & BBoxIndexEventMap[T]} wrappedEvent
     * The event to handle.
     */
    #handleWrappedEvent = (wrappedEvent) => {
        if ('obj' in wrappedEvent) {
            // Avoid forwarding events for objects not shown in this view
            const obj = wrappedEvent.obj;
            if (obj instanceof LabelClass) {
                if (!this.hasLabelClass(obj.id)) return;
            } else if (obj instanceof LabelTrack) {
                if (!this.hasLabelTrack(obj.id)) return;
            } else if (obj instanceof LabelBox) {
                if (!this.hasLabelBox(obj.id)) return;
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
     * @param {BBoxIndex} wrapped The index to create a view from.
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
