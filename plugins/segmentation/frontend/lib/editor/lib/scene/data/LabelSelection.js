import * as THREE from 'three';

import { Equatable } from 'sta/common/utils';

import { DistinctiveLevel, OcclusionLevel } from '../../../../label/lib';
import { Selection } from './views';

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
 * @typedef {import('./views/Selection').SelectionParams} SelectionParams
 */

/**
 * @typedef {import('./LabelClass').ReadonlyLabelClass} ReadonlyLabelClass
 */

/**
 * @typedef {import('./LabelInstance').ReadonlyLabelInstance} ReadonlyLabelInstance
 */

/**
 * @typedef {import('./SegmentationIndex').SegmentationIndexEventMap} SegmentationIndexEventMap
 */

/**
 * @typedef {import('./SegmentationIndex').ReadonlySegmentationIndex} ReadonlySegmentationIndex
 */
/* eslint-enable max-len */

/**
 * @typedef {object} LabelSelectionViewParams
 * @property {ReadonlyArray<Readonly<THREE.Vector3>>} [pointsCoords=[]] The points' coordinates 
 * of creating a selection.
 * @property {Readonly<number>} [pointSize=0.5] The size of the points of a selection.
 * @property {Readonly<THREE.Color>} [color] The display color of the point selection.
 * Defaults to black.
 * @property {boolean} [showCenter=false] `false` (default) if center of a selection is visibile,
 * otherwise, `false`.
 */

/**
 * View class for {@link LabelSelection}
 */
class LabelSelectionView {
    /**
     * @readonly
     * @type {Selection}
     */
    #selection;

    /**
     * @type {Selection}
     */
    get selection() { return this.#selection; }

    /**
     * The coordinates of each vertex in the object vector.
     * 
     * @type {ReadonlyArray<Readonly<THREE.Vector3>>}
     */
    get pointCoords() { return this.#selection.pointCoords; }

    set pointCoords(value) { this.#selection.pointCoords = value; }

    /**
     * The display color of the object vector.
     * 
     * @type {Readonly<THREE.Color>} 
     */
    get color() { return this.#selection.color; }

    set color(value) { this.#selection.color = value; }

    /**
     * @type {number} The points' size of the selection.
     */
    get pointSize() { return this.#selection.pointSize; }

    set pointSize(value) { this.#selection.pointSize = value; }

    /**
     * @type {Readonly<THREE.Vector3>} The center of this selection.
     */
    get centerPoint() { return this.#selection.centerPoint; }

    /**
     * `true` if the center of the selection is visible; otherwise, `false`.
     * 
     * @type {boolean}
     */
    get showCenter() { return this.#selection.showCenter; }

    set showCenter(value) { this.#selection.showCenter = value; }

    /**
     * Creates a view for a {@link LabelSelection}
     * 
     * @param {LabelSelectionViewParams} params The parameters to pass to the view.
     */
    constructor(params) {
        this.#selection = new Selection({
            pointsCoords: params.pointsCoords ?? [],
            color: params.color ?? new THREE.Color('red'),
            pointSize: params.pointSize ?? 0.5,
            showCenter: params.showCenter ?? false,
        });
    }

    /**
     * Returns a `three.js` representation of this view.
     * 
     * @returns {THREE.Object3D} The resulting object.
     */
    asObject3D() {
        return this.#selection.asObject3D();
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
        return this.#selection.raycast(raycaster, intersects);
    }
}

/**
 * @typedef {object} LabelSelectionParams
 * @property {EditorConfig} config The configuration of the project.
 * @property {?ReadonlySegmentationIndex} labels A collection of labels from which related labels
 * are queried for this selection object.
 * 
 * This is usually the collection of labels containing this selection object.
 * @property {UUID} id The unique identifier of the selection
 * @property {ReadonlyArray<THREE.Vector3>} points the points coordinates of a selection.
 * 
 * A shallow copy of the vector is made to this object.
 * @property {?number} [qualityRank=null] The quality rank of the annotation.
 * @property {DistinctiveLevel} [distinctiveLv=DistinctiveLevel.Unknown] The distinctiveness
 * level of the represented object.
 * @property {OcclusionLevel} [occlusionLv=OcclusionLevel.Unknown] The occlusion level of the
 * represented object.
 * @property {?number} [perceivedClassId=null] The unique identifier of the perceived class of the
 * represented object, or `null` if no class is assigned.
 * @property {?UUID} [entityId=null] The unique identifier of the instance object representing the
 * same object, or `null` if no object is assigned.
 * @property {?Timestamp} [timestamp=null] The timestamp of the represented object.
 * @property {?Readonly<number>} [showPointSize=null] of given, displays the given number for
 * points selection size.
 * @property {boolean} [showPerceivedClass=true] If `true`, displays the color of the selection
 * based on their perceived class; otherwise, displays the color based on their ground truth class.
 * @property {?Readonly<THREE.Color>} [showColor=null] If given, displays the given color for
 * the selection, regardless of `showPerceivedClass`.
 * @property {boolean} [showCenter=false] `false` (default) if center of a selection is visibile,
 * otherwise, `false`.
 */

/**
 * Represents the event when a property (except for `labels`) has been changed.
 * - `obj`: The object which property has been changed.
 * - `propertyKey`: The name of the property that was changed.
 * 
 * @typedef {{
 *     obj: LabelSelection;
 *     propertyKey: Exclude<keyof LabelSelectionParams, 'config' | 'labels'>;
 * }} PropertyChangeEvent
 */

/**
 * Defines each event that can be dispatched by {@link LabelSelection}.
 * 
 * @typedef {object} LabelSelectionEventMap
 * @property {PropertyChangeEvent} change The event when a property (except for `labels`)
 * has been changed.
 */

/**
 * @typedef {Pick<Readonly<LabelSelection>, keyof THREE.EventDispatcher<LabelSelectionEventMap>
 * | 'asObject3D' | 'raycast' | keyof LabelSelectionParams | 'entity' | 'gtClass'
 * | 'perceivedClass' | 'displayClass'
 * | 'centerPoint' | 'points' | 'pointCoords' | 'getSelection'>} ReadonlyLabelSelection
 */

/**
 * Represents a selection in the scene.
 * 
 * @augments THREE.EventDispatcher<LabelSelectionEventMap>
 */
export class LabelSelection extends THREE.EventDispatcher {
    /**
     * @readonly
     * @type {LabelSelectionView}
     */
    #view;

    /**
     * @returns {Selection} The `three.js` selection 
     * object in the scene.
     */
    getSelection() { return this.#view.selection; }

    /**
     * Returns a `three.js` representation of this selection.
     * 
     * @returns {THREE.Object3D} The resulting object.
     */
    asObject3D() {
        return this.#view.asObject3D();
    }

    /**
     * Performs raycasting against this selection.
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
     * @type {?ReadonlySegmentationIndex}
     */
    #labels;

    /**
     * A collection of labels from which related labels are queried for this selection.
     * 
     * This is usually the collection of labels containing this selection.
     * 
     * @type {?ReadonlySegmentationIndex}
     */
    get labels() { return this.#labels; }

    set labels(value) {
        if (this.#labels !== value) {
            this.#labels?.removeEventListener('class-delete', this.#onClassDelete);
            this.#labels?.removeEventListener('class-update', this.#onClassUpdate);
            this.#labels?.removeEventListener('instance-add', this.#onInstanceChange);
            this.#labels?.removeEventListener('instance-delete', this.#onInstanceChange);
            this.#labels?.removeEventListener('instance-update', this.#onInstanceChange);

            this.#labels = value;
            this.#labels?.addEventListener('class-delete', this.#onClassDelete);
            this.#labels?.addEventListener('class-update', this.#onClassUpdate);
            this.#labels?.addEventListener('instance-add', this.#onInstanceChange);
            this.#labels?.addEventListener('instance-delete', this.#onInstanceChange);
            this.#labels?.addEventListener('instance-update', this.#onInstanceChange);

            this.render();
        }
    }

    /**
     * @type {UUID}
     */
    #id;

    /**
     * The unique identifier of this selection.
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
     * The points of the selection in the coordinate system of the database.
     * 
     * @type {ReadonlyArray<THREE.Vector3>}
     */
    get points() { return LabelSelection.#getPointCoords(this.config, this.#view); }

    set points(value) {
        this.#view.pointCoords = LabelSelection.#getSelectionCoords(this.config, value);

        this.render();
        this.dispatchEvent({ type: 'change', obj: this, propertyKey: 'points' });
    }

    /**
     * The center point of a selection in threejs coordinate system.
     * 
     * @type {Readonly<THREE.Vector3>}
     */
    get centerPoint() { return this.#view.centerPoint; }

    /**
     * The vertices of the selection object in threejs coordinate system, that
     * being rendered on the scene.
     * 
     * @type {ReadonlyArray<THREE.Vector3>}
     */
    get pointCoords() { return this.#view.pointCoords; }

    /**
     * @type {?number}
     */
    #qualityRank;

    /**
     * The quality rank of the annotation.
     * 
     * @type {?number}
     */
    get qualityRank() { return this.#qualityRank; }

    set qualityRank(value) {
        if (this.#qualityRank !== value) {
            this.#qualityRank = value;

            this.render();
            this.dispatchEvent({ type: 'change', obj: this, propertyKey: 'qualityRank' });
        }
    }

    /**
     * @type {DistinctiveLevel}
     */
    #distinctiveLv;

    /**
     * The distinctiveness level of the represented object.
     * 
     * @type {DistinctiveLevel}
     */
    get distinctiveLv() { return this.#distinctiveLv; }

    set distinctiveLv(value) {
        if (!this.#distinctiveLv.equals(value)) {
            this.#distinctiveLv = value;

            this.render();
            this.dispatchEvent({ type: 'change', obj: this, propertyKey: 'distinctiveLv' });
        }
    }

    /**
     * @type {OcclusionLevel}
     */
    #occlusionLv;

    /**
     * The occlusion level of the represented object.
     * 
     * @type {OcclusionLevel}
     */
    get occlusionLv() { return this.#occlusionLv; }

    set occlusionLv(value) {
        if (!this.#occlusionLv.equals(value)) {
            this.#occlusionLv = value;

            this.render();
            this.dispatchEvent({ type: 'change', obj: this, propertyKey: 'occlusionLv' });
        }
    }

    /**
     * @type {?number}
     */
    #perceivedClassId;

    /**
     * The unique identifier of the perceived class of the represented object,
     * or `null` if no class is assigned.
     * 
     * @type {?number}
     */
    get perceivedClassId() { return this.#perceivedClassId; }

    set perceivedClassId(value) {
        if (this.#perceivedClassId !== value) {
            this.#perceivedClassId = value;

            this.render();
            this.dispatchEvent({ type: 'change', obj: this, propertyKey: 'perceivedClassId' });
        }
    }

    /**
     * The perceived class of the represented object, or `null` if no class is
     * assigned.
     * 
     * This is `null` if there is no collection of labels to query.
     * 
     * @type {?ReadonlyLabelClass}
     */
    get perceivedClass() {
        const { labels } = this;
        if (labels == null) return null;

        return LabelSelection.#getPerceivedClass(labels, this.perceivedClassId);
    }

    /**
     * @type {?Timestamp}
     */
    #timestamp;

    /**
     * The timestamp of the represented object.
     * 
     * A shallow copy of the date is made to this object.
     * 
     * @type {?Timestamp}
     */
    get timestamp() { return this.#timestamp; }

    set timestamp(value) {
        if (!Equatable.equalsNullable(this.#timestamp, value)) {
            this.#timestamp = value?.clone() ?? null;

            this.render();
            this.dispatchEvent({ type: 'change', obj: this, propertyKey: 'timestamp' });
        }
    }

    /**
     * @type {?UUID}
     */
    #entityId;

    /**
     * The unique identifier of the instance object representing the same object,
     * or `null` if no object is assigned.
     * 
     * @type {?UUID}
     */
    get entityId() { return this.#entityId; }

    set entityId(value) {
        if (this.#entityId !== value) {
            this.#entityId = value;

            this.render();
            this.dispatchEvent({ type: 'change', obj: this, propertyKey: 'entityId' });
        }
    }

    /**
     * The instance object which a selection belongs to, or `null` if no track is
     * assigned.
     * 
     * This is `null` if there is no collection of labels to query.
     * 
     * @type {?ReadonlyLabelInstance}
     */
    get entity() {
        const { labels } = this;
        if (labels == null) return null;

        return LabelSelection.#getEntity(labels, this.entityId);
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

        return LabelSelection.#getGroundTruthClass(labels, this.entityId);
    }

    /**
     * The class being displayed for this selection, or `null` if no class is
     * assigned.
     * 
     * This is `null` if there is no collection of labels to query.
     * 
     * @type {?ReadonlyLabelClass}
     */
    get displayClass() {
        const { labels } = this;
        if (labels == null) return null;

        return LabelSelection.#getDisplayClass(labels, this);
    }

    /**
     * @type {?number}
     */
    #showPointSize;

    /**
     * If given, displays the given point size for the selection.
     * 
     * @type {?Readonly<number>}
     */
    get showPointSize() { return this.#showPointSize; }

    set showPointSize(value) {
        if (this.#showPointSize !== value) {
            this.#showPointSize = value ?? null;

            this.render();
            this.dispatchEvent({ type: 'change', obj: this, propertyKey: 'showPointSize' });
        }
    }

    /**
     * @type {boolean}
     */
    #showPerceivedClass;

    /**
     * If `true`, displays the color of the selection based on their perceived class;
     * otherwise, displays the color based on their ground truth class.
     * 
     * @type {boolean}
     */
    get showPerceivedClass() { return this.#showPerceivedClass; }

    set showPerceivedClass(value) {
        if (this.#showPerceivedClass !== value) {
            this.#showPerceivedClass = value;

            this.render();
            this.dispatchEvent({ type: 'change', obj: this, propertyKey: 'showPerceivedClass' });
        }
    }

    /**
     * @type {?THREE.Color}
     */
    #showColor;

    /**
     * If given, displays the given color for the selection, regardless of `showPerceivedClass`.
     * 
     * @type {?Readonly<THREE.Color>}
     */
    get showColor() { return this.#showColor; }

    set showColor(value) {
        if (!Equatable.equalsNullable(this.#showColor, value)) {
            this.#showColor = value?.clone() ?? null;

            this.render();
            this.dispatchEvent({ type: 'change', obj: this, propertyKey: 'showColor' });
        }
    }

    /**
     * `true` if the faces and edges of this bounding box are visible; otherwise, `false`.
     * 
     * @type {boolean}
     */
    get showCenter() { return this.#view.showCenter; }

    set showCenter(value) {
        if (this.#view.showCenter !== value) {
            this.#view.showCenter = value;
            this.dispatchEvent({ type: 'change', obj: this, propertyKey: 'showCenter' });
        }
    }

    /**
     * Creates a new selection to represent an object.
     * 
     * @param {LabelSelectionParams} params The parameters of the selection.
     */
    constructor(params) {
        super();

        this.config = params.config;

        this.#labels = params.labels;
        this.#labels?.addEventListener('class-delete', this.#onClassDelete);
        this.#labels?.addEventListener('class-update', this.#onClassUpdate);
        this.#labels?.addEventListener('instance-add', this.#onInstanceChange);
        this.#labels?.addEventListener('instance-delete', this.#onInstanceChange);
        this.#labels?.addEventListener('instance-update', this.#onInstanceChange);

        this.#id = params.id;
        this.#qualityRank = params.qualityRank ?? null;
        this.#distinctiveLv = params.distinctiveLv ?? DistinctiveLevel.Unknown;
        this.#occlusionLv = params.occlusionLv ?? OcclusionLevel.Unknown;
        this.#perceivedClassId = params.perceivedClassId ?? null;
        this.#entityId = params.entityId ?? null;
        this.#timestamp = params.timestamp?.clone() ?? null;
        this.#showPointSize = params.showPointSize ?? 0.5;
        this.#showPerceivedClass = params.showPerceivedClass ?? true;
        this.#showColor = params.showColor?.clone() ?? null;

        this.#view = new LabelSelectionView({
            pointsCoords: LabelSelection.#getSelectionCoords(this.config, params.points),
            color: LabelSelection.#NO_CLASS_COLOR,
            pointSize: this.showPointSize ?? 0.5,
        });

        // Need to add to the index first, so we call this in the index
        // this.render();
    }

    /**
     * Updates the view according to the data in this object.
     */
    render() {
        const { config, points, showPointSize } = this;
        const view = this.#view;
        const labels = this.#labels;
        if (labels == null) return;

        view.pointCoords = LabelSelection.#getSelectionCoords(config, points);
        view.color = LabelSelection.#getColor(labels, this);
        view.pointSize = showPointSize ?? view.pointSize;
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.#labels?.removeEventListener('class-delete', this.#onClassDelete);
        this.#labels?.removeEventListener('class-update', this.#onClassUpdate);
        this.#labels?.removeEventListener('instance-add', this.#onInstanceChange);
        this.#labels?.removeEventListener('instance-delete', this.#onInstanceChange);
        this.#labels?.removeEventListener('instance-update', this.#onInstanceChange);
    }

    /**
     * Handles the event when an instance object has been added, deleted or updated.
     * 
     * @template {'add' | 'delete' | 'update'} T
     * @param {SegmentationIndexEventMap[`instance-${T}`]} event The event to handle.
     */
    #onInstanceChange = (event) => {
        if (event.obj.id === this.entityId) {
            this.render();
        }
    };

    /**
     * Handles the event when an object class has been deleted.
     * 
     * @param {SegmentationIndexEventMap['class-delete']} event The event to handle.
     */
    #onClassDelete = (event) => {
        if (event.obj === this.perceivedClass) {
            this.render();
        }
    };

    /**
     * Handles the event when an object class has been updated.
     * 
     * @param {SegmentationIndexEventMap['class-update']} event The event to handle.
     */
    #onClassUpdate = (event) => {
        if (event.obj === this.perceivedClass) {
            this.render();
        }
    };

    /**
     * Gets the coordinates of each point for a selection based on database coordinate format.
     * 
     * @param {EditorConfig} config The configuration of the application.
     * @param {LabelSelectionView} view The input view instance.
     * @returns {ReadonlyArray<Readonly<THREE.Vector3>>} The requested coordinates.
     */
    static #getPointCoords(config, view) {
        const pointsCoords = view.pointCoords;
        const format = config.coordinateFormat;
        return pointsCoords.map((point) => format.toDatabaseCoords(point));
    }

    /**
     * Gets the points of selection object on threejs.
     * 
     * @param {EditorConfig} config The configuration of the application.
     * @param {ReadonlyArray<THREE.Vector3>} points The points of a selection object
     * in db coordinates system.
     * @returns {ReadonlyArray<THREE.Vector3>} The requested points.
     */
    static #getSelectionCoords(config, points) {
        const format = config.coordinateFormat;
        return points.map((point) => format.toThreeJSCoords(point));
    }

    /**
     * Gets the perceived class for an object track, if it exists.
     * 
     * @param {ReadonlySegmentationIndex} labels The collection of labels from which related
     * labels are queried.
     * @param {?number} perceivedClassId The unique identifier of the perceived class of the
     * represented object, or `null` if no class is assigned.
     * @returns {?ReadonlyLabelClass} The requested class, or `null` if there is no such class.
     */
    static #getPerceivedClass(labels, perceivedClassId) {
        return (perceivedClassId == null) ? null : labels.getLabelClass(perceivedClassId);
    }

    /**
     * Gets the instance of a selection belongs to, if it exists.
     * 
     * @param {ReadonlySegmentationIndex} labels The collection of labels from which related
     * labels are queried.fier of the instance representing the same object,
     * or `null` if no instance is assigned.
     * @param {?UUID} entityId The unique identifier of the instance object representing the
     * same object, or `null` if no object is assigned.
     * @returns {?ReadonlyLabelInstance} The requested instance, or `null` if 
     * there is no such instance.
     */
    static #getEntity(labels, entityId) {
        return (entityId == null) ? null : labels.getLabelInstance(entityId);
    }

    /**
     * Gets the ground truth class for a bounding box, if it exists.
     * 
     * @param {ReadonlySegmentationIndex} labels The collection of labels from which related
     * labels are queried.
     * @param {?UUID} entityId The unique identifier of the selection instance representing the same
     * object, or `null` if no track is assigned.
     * @returns {?ReadonlyLabelClass} The requested class, or `null` if there is no such class.
     */
    static #getGroundTruthClass(labels, entityId) {
        const instance = LabelSelection.#getEntity(labels, entityId);
        return (instance == null) ? null : instance.gtClass;
    }

    /**
     * Gets the display class for a bounding box.
     * 
     * @param {ReadonlySegmentationIndex} labels The collection of labels from which related
     * labels are queried.
     * @param {{
     *     perceivedClassId: ?number;
     *     entityId: ?UUID;
     *     showPerceivedClass: boolean;
     * }} model The input model instance.
     * @returns {?ReadonlyLabelClass} The requested class, or `null` if there is no such class.
     */
    static #getDisplayClass(labels, model) {
        if (model.showPerceivedClass) {
            const perceivedClass = this.#getPerceivedClass(labels, model.perceivedClassId);
            if (perceivedClass) return perceivedClass;
        }

        return this.#getGroundTruthClass(labels, model.entityId);
    }

    /**
     * The default color to use when there is no associated class.
     * 
     * @readonly
     * @type {Readonly<THREE.Color>}
     */
    static #NO_CLASS_COLOR = new THREE.Color(0xD22B2B);

    /**
     * Gets the color to display for an object track.
     * 
     * @param {ReadonlySegmentationIndex} labels The collection of labels from which related
     * labels are queried.
     * @param {{
     *     perceivedClassId: ?number;
     *     entityId: ?UUID;
     *     showPerceivedClass: boolean;
     *     showColor: ?Readonly<THREE.Color>; 
     * }} model The input model instance.
     * @returns {Readonly<THREE.Color>} The requested color.
     */
    static #getColor(labels, model) {
        if (model.showColor) return model.showColor;
        return LabelSelection.#getDisplayClass(labels, model)?.selectionColor
            ?? LabelSelection.#NO_CLASS_COLOR;
    }
}
