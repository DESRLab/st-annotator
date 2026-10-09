import * as THREE from 'three';

import { TypeUtils, Equatable } from 'sta/common/utils';

import { Polyline } from './views';

/* eslint-disable max-len */
/**
 * @typedef {import('sta/common/utils').Timestamp} Timestamp
 */

/**
 * @typedef {import('sta/services/editor/base').EditorConfig} EditorConfig
 */

/**
 * @typedef {import('./models').UUID} UUID
 */

/**
 * @typedef {import('./LabelBox').ReadonlyLabelBox} ReadonlyLabelBox
 */

/**
 * @typedef {import('./LabelClass').ReadonlyLabelClass} ReadonlyLabelClass
 */

/**
 * @typedef {import('./BBoxIndex').ReadonlyBBoxIndex} ReadonlyBBoxIndex
 */

/**
 * @typedef {import('./BBoxIndex').BBoxIndexEventMap} BBoxIndexEventMap
 */
/* eslint-enable max-len */

/**
 * @typedef {object} LabelTrackViewParams
 * @property {ReadonlyArray<Readonly<THREE.Vector3>>} [pathCoords=[]] The coordinates of each vertex
 * in the object track.
 * @property {Readonly<THREE.Color>} [color] The display color of the object track.
 * Defaults to black.
 */

/**
 * View class for {@link LabelTrack}.
 */
class LabelTrackView {

    /**
     * @readonly
     * @type {Polyline}
     */
    #line;

    /**
     * The coordinates of each vertex in the object track.
     * 
     * @type {ReadonlyArray<Readonly<THREE.Vector3>>}
     */
    get pathCoords() { return this.#line.pathCoords; }

    set pathCoords(value) { this.#line.pathCoords = value; }

    /**
     * The display color of the object track.
     * 
     * @type {Readonly<THREE.Color>} 
     */
    get color() { return this.#line.color; }

    set color(value) { this.#line.color = value; }

    /**
     * Creates a view for a {@link LabelTrack}.
     * 
     * @param {LabelTrackViewParams} params The parameters to pass to the view.
     */
    constructor(params) {
        this.#line = new Polyline({
            pathCoords: params.pathCoords ?? [],
            color: params.color ?? new THREE.Color('black'),
        });
    }

    /**
     * Returns a `three.js` representation of this view.
     * 
     * @returns {THREE.Object3D} The resulting object.
     */
    asObject3D() {
        return this.#line.asObject3D();
    }

    /**
     * Performs raycasting against this view.
     * 
     * @param {THREE.Raycaster} raycaster The caster of the ray.
     * @param {THREE.Intersection[]} intersects If provided, the results are accumulated into
     * this array. Otherwise, a new one is instantiated.
     * @returns {THREE.Intersection[]} Refer to the `raycast` method of {@link THREE.Object3D}.
     */
    raycast(raycaster, intersects = []) {
        return this.#line.raycast(raycaster, intersects);
    }
}

/**
 * @typedef {object} LabelTrackParams
 * @property {EditorConfig} config The configuration of the application.
 * @property {?ReadonlyBBoxIndex} labels A collection of labels from which related labels
 * are queried for this object track.
 * 
 * This is usually the collection of labels containing this object track.
 * @property {UUID} id The unique identifier of the object track.
 * @property {boolean} [isBlack=false] `true` if the represented object has low reflectivity;
 * otherwise, `false`.
 * @property {?number} [gtClassId=null] The unique identifier of the ground truth class of the
 * represented object, or `null` if no class is assigned.
 * @property {?Timestamp} [minTimestamp=null] The minimum timestamp for which to display the track.
 * @property {?Timestamp} [maxTimestamp=null] The maximum timestamp for which to display the track.
 */

/**
 * Represents the event when a property (except for `labels`) has been changed.
 * - `obj`: The object which property has been changed.
 * - `propertyKey`: The name of the property that was changed.
 * 
 * @typedef {{
 *     obj: LabelTrack;
 *     propertyKey: Exclude<keyof LabelTrackParams, 'config' | 'labels'>;
 * }} PropertyChangeEvent
 */

/**
 * Defines each event that can be dispatched by {@link LabelTrack}.
 * 
 * @typedef {object} LabelTrackEventMap
 * @property {PropertyChangeEvent} change The event when a property (except for `labels`)
 * has been changed.
 */

/**
 * @typedef {Pick<Readonly<LabelTrack>, keyof THREE.EventDispatcher<LabelTrackEventMap>
 * | 'asObject3D' | 'raycast' | 'minTimestamp' | 'maxTimestamp' | keyof LabelTrackParams
 * | 'gtClass' | 'elements'>} ReadonlyLabelTrack
 */

/**
 * Represents an object across one or more frames.
 * 
 * The structure of this agent class is similar to {@link Controller}, but since we are wrapping
 * {@link ReadonlyBBoxIndex} which is an agent class, we need to perform the coordination
 * at the agent level rather than the controller level. Here, {@link ReadonlyBBoxIndex}
 * acts like a model while {@link LabelTrackView} acts like a view.
 * 
 * @augments THREE.EventDispatcher<LabelTrackEventMap>
 */
export class LabelTrack extends THREE.EventDispatcher {

    /**
     * @readonly
     * @type {LabelTrackView}
     */
    #view;

    /**
     * Returns a `three.js` representation of this controller.
     * 
     * @returns {THREE.Object3D} The resulting object.
     */
    asObject3D() { return this.#view.asObject3D(); }

    /**
     * Performs raycasting against this object track.
     * 
     * @param {THREE.Raycaster} raycaster The caster of the ray.
     * @param {THREE.Intersection[]} intersects If provided, the results are accumulated into
     * this array. Otherwise, a new one is instantiated.
     * @returns {THREE.Intersection[]} Refer to the `raycast` method of {@link THREE.Object3D}.
     */
    raycast(raycaster, intersects = []) {
        return this.#view.raycast(raycaster, intersects);
    }

    /**
     * The configuration of the application.
     * 
     * @readonly
     * @type {EditorConfig}
     */
    config;

    /**
     * @type {?ReadonlyBBoxIndex}
     */
    #labels;

    /**
     * A collection of labels from which related labels are queried for this object track.
     * 
     * This is usually the collection of labels containing this object track.
     * 
     * @type {?ReadonlyBBoxIndex}
     */
    get labels() { return this.#labels; }

    set labels(value) {
        if (this.#labels !== value) {
            this.#labels?.removeEventListener('box-add', this.#onBoxChange);
            this.#labels?.removeEventListener('box-delete', this.#onBoxChange);
            this.#labels?.removeEventListener('box-update', this.#onBoxChange);
            this.#labels?.removeEventListener('class-delete', this.#onClassDelete);
            this.#labels?.removeEventListener('class-update', this.#onClassUpdate);

            this.#labels = value;
            this.#labels?.addEventListener('box-add', this.#onBoxChange);
            this.#labels?.addEventListener('box-delete', this.#onBoxChange);
            this.#labels?.addEventListener('box-update', this.#onBoxChange);
            this.#labels?.addEventListener('class-delete', this.#onClassDelete);
            this.#labels?.addEventListener('class-update', this.#onClassUpdate);

            this.render();
        }
    }

    /**
     * @type {UUID}
     */
    #id;

    /**
     * The unique identifier of this object track.
     * 
     * @type {UUID}
     */
    get id() { return this.#id; }

    set id(value) {
        if (this.#id !== value) {
            this.#id = value;

            this.render();
            this.dispatchEvent({ type: 'change', obj: this, propertyKey: 'id' });
        }
    }

    /**
     * @type {boolean}
     */
    #isBlack;

    /**
     * true` if the represented object has low reflectivity; otherwise, `false`.
     * 
     * @type {boolean}
     */
    get isBlack() { return this.#isBlack; }

    set isBlack(value) {
        if (this.#isBlack !== value) {
            this.#isBlack = value;

            this.render();
            this.dispatchEvent({ type: 'change', obj: this, propertyKey: 'isBlack' });
        }
    }

    /**
     * @type {?number}
     */
    #gtClassId;

    /**
     * The unique identifier of the ground truth class of the represented object,
     * or `null` if no class is assigned.
     * 
     * @type {?number}
     */
    get gtClassId() { return this.#gtClassId; }

    set gtClassId(value) {
        if (this.#gtClassId !== value) {
            this.#gtClassId = value;

            this.render();
            this.dispatchEvent({ type: 'change', obj: this, propertyKey: 'gtClassId' });
        }
    }

    /**
     * The ground truth class of the represented object, or `null` if no class is
     * assigned.
     * 
     * This is `null` if there is no collection of labels to query.
     * 
     * @type {?ReadonlyLabelClass}
     */
    get gtClass() {
        const { labels } = this;
        if (labels == null) return null;

        return LabelTrack.#getGroundTruthClass(labels, this.gtClassId);
    }

    /**
     * The bounding boxes that belong to this object track.
     * 
     * This is an empty array if there is no collection of labels to query.
     * 
     * @type {ReadonlySet<ReadonlyLabelBox>}
     */
    get elements() {
        const { labels } = this;
        if (labels == null) return new Set();

        return LabelTrack.#getElements(labels, this.id);
    }

    /**
     * @type {?Timestamp}
     */
    #minTimestamp = null;

    /**
     * The minimum timestamp for which to display this object track.
     * 
     * @type {?Timestamp}
     */
    get minTimestamp() { return this.#minTimestamp; }

    set minTimestamp(value) {
        if (!Equatable.equalsNullable(this.#minTimestamp, value)) {
            this.#minTimestamp = value;

            this.render();
            this.dispatchEvent({ type: 'change', obj: this, propertyKey: 'minTimestamp' });
        }
    }

    /**
     * @type {?Timestamp}
     */
    #maxTimestamp = null;

    /**
     * The maximum timestamp for which to display this object track.
     * 
     * @type {?Timestamp}
     */
    get maxTimestamp() { return this.#maxTimestamp; }

    set maxTimestamp(value) {
        if (!Equatable.equalsNullable(this.#maxTimestamp, value)) {
            this.#maxTimestamp = value;

            this.render();
            this.dispatchEvent({ type: 'change', obj: this, propertyKey: 'maxTimestamp' });
        }
    }

    /**
     * Updates the view according to the data in this object.
     */
    render() {
        const { id, gtClassId, minTimestamp, maxTimestamp } = this;
        const view = this.#view;
        const labels = this.#labels;
        if (labels == null) return;

        view.pathCoords = LabelTrack.#getPathCoords(labels, id, minTimestamp, maxTimestamp);
        view.color = LabelTrack.#getColor(labels, gtClassId);
    }

    /**
     * Gets the bounding boxes that belong to an object track.
     * 
     * @param {ReadonlyBBoxIndex} labels The collection of labels from which related
     * labels are queried.
     * @param {UUID} id The unique identifier of the object track.
     * @returns {ReadonlySet<ReadonlyLabelBox>} The requested bounding boxes.
     */
    static #getElements(labels, id) {
        return labels.getLabelTrackElements(id);
    }

    /**
     * Gets the coordinates of each vertex for an object track.
     * 
     * @param {ReadonlyBBoxIndex} labels The collection of labels from which related
     * labels are queried.
     * @param {UUID} id The unique identifier of the object track.
     * @param {?Timestamp} minTimestamp The minimum timestamp for which to display the object track.
     * @param {?Timestamp} maxTimestamp The maximum timestamp for which to display the object track.
     * @returns {ReadonlyArray<Readonly<THREE.Vector3>>} The requested coordinates.
     */
    static #getPathCoords(labels, id, minTimestamp, maxTimestamp) {
        return [...LabelTrack.#getElements(labels, id)]
            .filter(
                /**
                 * Type annotates the returned array as objects where `timestamp` is not null-like.
                 * 
                 * @param {ReadonlyLabelBox} box An element of the array.
                 * @returns {box is (ReadonlyLabelBox & { timestamp: Timestamp })}
                 * `true` if `timestamp` is not null-like; otherwise, `false`.
                 */
                (box) => LabelTrack.#filterFunc(box.timestamp, minTimestamp, maxTimestamp),
            )
            .sort((d1, d2) => d1.timestamp.getTime() - d2.timestamp.getTime())
            .map((box) => box.asObject3D().position);
    }

    /**
     * Checks whether bounding box timestamp is within the given time interval.
     * 
     * @param {?Timestamp} boxTimestamp The bounding box timestamp. 
     * @param {?Timestamp} minTimestamp The start of the time interval.
     * @param {?Timestamp} maxTimestamp The end of the time interval.
     * @returns {boolean} `true` if the bounding box timestamp is within the interval;
     * otherwise, `false`.
     */
    static #filterFunc(boxTimestamp, minTimestamp, maxTimestamp) {
        const min = minTimestamp?.getTime() ?? Number.NEGATIVE_INFINITY;
        const max = maxTimestamp?.getTime() ?? Number.POSITIVE_INFINITY;

        return (
            TypeUtils.isNotNull(boxTimestamp)
            && min <= boxTimestamp.getTime()
            && boxTimestamp.getTime() <= max
        );
    }

    /**
     * The default color to use when there is no associated class.
     * 
     * @readonly
     * @type {Readonly<THREE.Color>}
     */
    static #NO_CLASS_COLOR = new THREE.Color(0xD22B2B);

    /**
     * Gets the ground truth class for an object track, if it exists.
     * 
     * @param {ReadonlyBBoxIndex} labels The collection of labels from which related
     * labels are queried.
     * @param {?number} gtClassId The unique identifier of the ground truth class of the
     * represented object, or `null` if no class is assigned.
     * @returns {?ReadonlyLabelClass} The requested class, or `null` if there is no such class.
     */
    static #getGroundTruthClass(labels, gtClassId) {
        return (gtClassId == null) ? null : labels.getLabelClass(gtClassId);
    }

    /**
     * Gets the color to display for an object track.
     * 
     * @param {ReadonlyBBoxIndex} labels The collection of labels from which related
     * labels are queried.
     * @param {?number} gtClassId The unique identifier of the ground truth class of the
     * represented object, or `null` if no class is assigned.
     * @returns {Readonly<THREE.Color>} The requested color.
     */
    static #getColor(labels, gtClassId) {
        const gtClass = LabelTrack.#getGroundTruthClass(labels, gtClassId);
        return gtClass?.boxColor ?? LabelTrack.#NO_CLASS_COLOR;
    }

    /**
     * Handles the event when a bounding box has been added, deleted or updated.
     * 
     * @template {'add' | 'delete' | 'update'} T
     * @param {BBoxIndexEventMap[`box-${T}`]} event The event to handle.
     */
    #onBoxChange = (event) => {
        if (event.obj.entity === this) {
            this.render();
        } else if (this.#view.pathCoords.length !== this.elements.size) {
            // In case an element is unassigned
            this.render();
        }
    };

    /**
     * Handles the event when an object class has been deleted.
     * 
     * @param {BBoxIndexEventMap['class-delete']} event The event to handle.
     */
    #onClassDelete = (event) => {
        if (event.obj === this.gtClass) {
            this.render();
        }
    };

    /**
     * Handles the event when an object class has been updated.
     * 
     * @param {BBoxIndexEventMap['class-update']} event The event to handle.
     */
    #onClassUpdate = (event) => {
        if (event.obj === this.gtClass) {
            this.render();
        }
    };

    /**
     * Creates a new object track to represent an object.
     * 
     * @param {LabelTrackParams} params The parameters of the object track.
     */
    constructor(params) {
        super();

        this.config = params.config;

        this.#labels = params.labels;
        this.#labels?.addEventListener('box-add', this.#onBoxChange);
        this.#labels?.addEventListener('box-delete', this.#onBoxChange);
        this.#labels?.addEventListener('box-update', this.#onBoxChange);
        this.#labels?.addEventListener('class-delete', this.#onClassDelete);
        this.#labels?.addEventListener('class-update', this.#onClassUpdate);

        this.#id = params.id;
        this.#isBlack = params.isBlack ?? false;
        this.#gtClassId = params.gtClassId ?? null;

        this.#view = new LabelTrackView({});

        // Need to add to the index first, so we call this in the index
        // this.render();
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.#labels?.removeEventListener('box-add', this.#onBoxChange);
        this.#labels?.removeEventListener('box-delete', this.#onBoxChange);
        this.#labels?.removeEventListener('box-update', this.#onBoxChange);
        this.#labels?.removeEventListener('class-delete', this.#onClassDelete);
        this.#labels?.removeEventListener('class-update', this.#onClassUpdate);
    }
}
