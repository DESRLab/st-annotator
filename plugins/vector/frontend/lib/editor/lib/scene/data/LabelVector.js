import BiMap from 'ts-bidirectional-map';
import * as THREE from 'three';

import { Equatable } from 'sta/common/utils';

import { PointBuilder, LineBuilder } from './views';

/**
 * @typedef {import('sta/common/utils').Timestamp} Timestamp
 */

/**
 * @typedef {import('sta/services/editor/base').EditorConfig} EditorConfig
 */

/**
 * @typedef {import('../../../../label/lib').VectorType} VectorType
 */

/**
 * @typedef {import('./models').UUID} UUID
 */

/**
 * @typedef {import('./views').Line} Line
 */

/**
 * @typedef {import('./views').Point} Point
 */

/**
 * @template {Line | Point} G
 * @typedef {import('./views').VectorGeo<G>} VectorGeo
 */

/**
 * @typedef {import('./views').VectorBuilder} VectorBuilder 
 */

/**
 * @typedef {import('./views/VectorGeo').VectorBuilderParams} VectorBuilderParams
 */

/**
 * @typedef {import('./LabelClass').ReadonlyLabelClass} ReadonlyLabelClass
 */

/**
 * @typedef {import('./VectorIndex').VectorIndexEventMap} VectorIndexEventMap
 */

/**
 * @typedef {import('./VectorIndex').ReadonlyVectorIndex} ReadonlyVectorIndex
 */

/**
 * @typedef {import('./VectorIndex').ClassUpdateEvent} ClassUpdateEvent
 */

/**
 * @typedef {object} LabelVectorViewParams
 * @property {VectorBuilder} vectorBuilder Creates the `three.js` objects of the vector object.
 * @property {ReadonlyArray<Readonly<THREE.Vector3>>} [vectorCoords=[]] The coordinates
 * of each vertex
 * in the object vector.
 * @property {Readonly<THREE.Color>} [color] The display color of the object vector.
 * Defaults to black.
 */

/**
 * View class for {@link LabelVector}
 * 
 */
class LabelVectorView {

    /**
     * @type {VectorBuilder}
     */
    #vectorBuilder;

    /**
     * @type {VectorGeo<Line | Point>}
     */
    #vectorGeo;

    /**
     * @type {VectorGeo<Line | Point>}
     */
    get vectorGeo() { return this.#vectorGeo; }

    /**
     * The coordinates of each vertex in the object vector.
     * 
     * @type {ReadonlyArray<THREE.Vector3>}
     */
    get vectorCoords() { return this.#vectorGeo.vectorCoords; }

    set vectorCoords(value) { this.#vectorGeo.vectorCoords = value; }

    /**
     * Creates the `three.js` objects of the vector object.
     * 
     * @type {VectorBuilder}
     */
    get vectorBuilder() { return this.#vectorBuilder; }

    set vectorBuilder(value) {
        if (this.#vectorBuilder !== value) {
            this.#vectorBuilder = value;
            this.#vectorGeo = LabelVectorView.#createVector(value, this);
        }
    }

    /**
     * Creates a new vector object with the given parameters.
     * 
     * @param {VectorBuilder} builder Creates the `three.js` objects of vector object.
     * @param {VectorBuilderParams} params The parameters to pass to the box.
     * @returns {VectorGeo<Line | Point>} The new vector object. 
     */
    static #createVector(builder, params) {
        return builder.createVector(params);
    }

    /**
     * The display color of the object vector.
     * 
     * @type {Readonly<THREE.Color>} 
     */
    get color() { return this.#vectorGeo.color; }

    set color(value) { this.#vectorGeo.color = value; }

    /**
     * Creates a view for a {@link LabelVector}.
     * 
     * @param {LabelVectorViewParams} params The parameters to pass to the view.
     */
    constructor(params) {
        this.#vectorGeo = LabelVectorView.#createVector(params.vectorBuilder, {
            vectorCoords: params.vectorCoords ?? [new THREE.Vector3(0, 0, 0)],
            color: params.color ?? new THREE.Color('red'),
        });
    }

    /**
     * Returns a `three.js` representation of this view.
     * 
     * @returns {THREE.Object3D} The resulting object.
     */
    asObject3D() {
        return this.#vectorGeo.asObject3D();
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
        return this.#vectorGeo.raycast(raycaster, intersects);
    }
}

/**
 * A mapping to/from each view type for a vector object its string representation.
 * 
 * @type {BiMap<VectorBuilder, VectorType>} 
 */
const vectorBuilderToString = new BiMap();
vectorBuilderToString.set(new LineBuilder(), 'LineString');
vectorBuilderToString.set(new LineBuilder(), 'Polygon');
vectorBuilderToString.set(new PointBuilder(), 'Point');

/**
 * @typedef {object} LabelVectorParams
 * @property {EditorConfig} config The configuration of the application.
 * @property {?ReadonlyVectorIndex} labels A collection of labels from which related labels
 * are queried for this vector object.
 * 
 * This is usually the collection of labels containingthis vector.
 * @property {UUID} id The unique identifieer of the vector object.
 * @property {VectorType} vectorType Indicates the type of vector object.
 * @property {ReadonlyArray<THREE.Vector3>} vertices the vertices of a vector object.
 * @property {?Timestamp} [timestamp=null] The timestamp of the represented object.
 * @property {?number} [gtClassId=null] The unique identifier of the ground truth class of the
 * represented object, or `null` if no class is assigned.
 * @property {?Readonly<THREE.Color>} [showColor=null] If given, displays the given color for
 * the bounding box, regardless of `showPerceivedClass`.
 */

/**
 * Represents the event when a property (except for `labels`) has been changed.
 * - `obj`: The object which property has been changed.
 * - `propertyKey`: The name of the property that was changed.
 * 
 * @typedef {{
 *     obj: LabelVector;
 *     propertyKey: Exclude<keyof LabelVectorParams, 'config' | 'labels'>;
 * }} PropertyChangeEvent
 */

/**
 * Defines each event that can be dispatched by {@link LabelVector}.
 * 
 * @typedef {object} LabelVectorEventMap
 * @property {PropertyChangeEvent} change The event when a property (except for `labels`)
 * has been changed.
 */

/**
 * @typedef {Pick<Readonly<LabelVector>, keyof THREE.EventDispatcher<LabelVectorEventMap>
 * | 'asObject3D' | 'getGeo' | 'raycast' | keyof LabelVectorParams | 'gtClass' 
 * | 'vertices' | 'vectorType' | 'vectorCoords' >} ReadonlyLabelVector
 */

/**
 * Represents an object across one or more frames.
 * 
 * 
 * The structure of this agent class is similar to {@link Controller}, but since we are wrapping
 * {@link ReadonlyVectorIndex} which is an agent class, we need to perform coordination 
 * at the agent level rather than the controller level. Here, {@link ReadonlyVectorIndex}
 * acts like a model while {@link LabelVectorView} acts like a view.
 * 
 * @augments THREE.EventDispatcher<LabelVectorEventMap>
 */
export class LabelVector extends THREE.EventDispatcher {

    /**
     * @readonly
     * @type {LabelVectorView}
     */
    #view;

    /**
     * Returns a `three.js` representation of this controller.
     * 
     * @returns {THREE.Object3D} The resulting object.
     */
    asObject3D() { return this.#view.asObject3D(); }

    /**
     * Returns a view object of label vector.
     * 
     * @returns {VectorGeo<Line | Point>} The resulting object.
     */
    getGeo() { return this.#view.vectorGeo; }

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
     * @type {?ReadonlyVectorIndex}
     */
    #labels;

    /**
     * A collection of labels from which related labels are queried for this vector object.
     * 
     * This is usually the collection of labels containing this vector object.
     * 
     * @type {?ReadonlyVectorIndex}
     */
    get labels() { return this.#labels; }

    set labels(value) {
        if (this.#labels !== value) {
            this.#labels?.removeEventListener('class-delete', this.#onClassDelete);
            this.#labels?.removeEventListener('class-update', this.#onClassUpdate);
            this.#labels?.removeEventListener('vector-add', this.#onVectorChange);
            this.#labels?.removeEventListener('vector-delete', this.#onVectorChange);
            this.#labels?.removeEventListener('vector-update', this.#onVectorChange);

            this.#labels = value;
            this.#labels?.addEventListener('class-delete', this.#onClassDelete);
            this.#labels?.addEventListener('class-update', this.#onClassUpdate);
            this.#labels?.addEventListener('vector-add', this.#onVectorChange);
            this.#labels?.addEventListener('vector-delete', this.#onVectorChange);
            this.#labels?.addEventListener('vector-update', this.#onVectorChange);

            this.render();
        }
    }

    /**
     * @type {UUID}
     */
    #id;

    /**
     * The unique identifier of this vector object.
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
     * @type {VectorType}
     */
    #vectorType;

    /**
     * Indicates the type of bounding box.
     * 
     * @type {VectorType}
     */
    get vectorType() { return this.#vectorType; }

    set vectorType(value) {
        if (this.#vectorType !== value) {
            this.#vectorType = value;

            this.render();
            this.dispatchEvent({ type: 'change', obj: this, propertyKey: 'vectorType' });
        }
    }

    /**
     * The vectices of the vector object in the coordinate system of the database.
     * 
     * @type {ReadonlyArray<THREE.Vector3>}
     */
    get vertices() { return LabelVector.#getVectorVerices(this.config, this.#view); }

    set vertices(value) {
        this.#view.vectorCoords = LabelVector.#getVectorCoords(this.config, value);

        this.render();
        this.dispatchEvent({ type: 'change', obj: this, propertyKey: 'vertices' });
    }

    /**
     * The vertices of the vector object in threejs coordinate system, that
     * being rendered on the scene.
     * 
     * @type {ReadonlyArray<THREE.Vector3>}
     */
    get vectorCoords() { return this.#view.vectorCoords; }

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

        return LabelVector.#getGroundTruthClass(labels, this.gtClassId);
    }

    /**
     * @type {?THREE.Color}
     */
    #showColor = null;

    /**
     * If given, displays the given color for the bounding box, regardless of `showPerceivedClass`.
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
     * Updates the view according to the data in this object.
     */
    render() {
        const { vectorType, gtClassId, config, vertices } = this;
        const view = this.#view;
        const labels = this.#labels;
        view.vectorBuilder = LabelVector.#getVectorBuilder(vectorType);

        if (labels == null) return;

        view.vectorCoords = LabelVector.#getVectorCoords(config, vertices);
        view.color = LabelVector.#getColor(labels, gtClassId, this);
    }

    /**
     * Gets the elemetn builder of a vector object.
     * 
     * @param {VectorType} vectorType Indicates the type of vector.
     * @returns {VectorBuilder} The request type.
     */
    static #getVectorBuilder(vectorType) {
        const vectorBuilder = vectorBuilderToString.getKey(vectorType);
        if (vectorBuilder == null) {
            throw new Error(`Unrecognized vector type: ${vectorType}`);
        }

        return vectorBuilder;
    }

    /**
     * Gets the coordinates of each vertex for an object vector based on database coordinate format.
     * 
     * @param {EditorConfig} config The configuration of the application.
     * @param {LabelVectorView} view The input view instance.
     * @returns {ReadonlyArray<Readonly<THREE.Vector3>>} The requested coordinates.
     */
    static #getVectorVerices(config, view) {
        const vectorVerices = view.vectorCoords;
        const format = config.coordinateFormat;
        return vectorVerices.map((vertex) => format.toDatabaseCoords(vertex));
    }

    /**
     * Gets the vertices of vector object on threejs.
     * 
     * @param {EditorConfig} config The configuration of the application.
     * @param {ReadonlyArray<THREE.Vector3>} vertices The vertices of a vector object.
     * @returns {ReadonlyArray<THREE.Vector3>} The requested vertices.
     */
    static #getVectorCoords(config, vertices) {
        const format = config.coordinateFormat;
        return vertices.map((vertex) => format.toThreeJSCoords(vertex));
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
     * @param {ReadonlyVectorIndex} labels The collection of labels from which related
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
     * @param {ReadonlyVectorIndex} labels The collection of labels from which related
     * labels are queried.
     * @param {?number} gtClassId The unique identifier of the ground truth class of the
     * represented object, or `null` if no class is assigned.
     * @param {{showColor: ?Readonly<THREE.Color>,
     *  gtClassId: ?number}} model The input model instance.
     * @returns {Readonly<THREE.Color>} The requested color.
     */
    static #getColor(labels, gtClassId, model) {
        if (model.showColor) return model.showColor;
        const gtClass = LabelVector.#getGroundTruthClass(labels, gtClassId);
        return gtClass?.vectorColor ?? LabelVector.#NO_CLASS_COLOR;
    }

    /**
     * Handles the event when vector object has been added, deleted or updated.
     * 
     * @template {'add' | 'delete' | 'update'} T
     * @param {VectorIndexEventMap[`vector-${T}`]} event The event to handle.
     */
    #onVectorChange = (event) => {
        if (event.obj.id === this.id) {
            this.render();
        }
    };

    /**
     * Handles the event when an object class has been deleted.
     * 
     * @param {VectorIndexEventMap['class-delete']} event The event to handle.
     */
    #onClassDelete = (event) => {
        if (event.obj === this.gtClass) {
            this.render();
        }
    };

    /**
     * Handles the event when an object class has been updated.
     * 
     * @param {VectorIndexEventMap['class-update']} event The event to handle.
     */
    #onClassUpdate = (event) => {
        if (event.obj === this.gtClass) {
            this.render();
        }
    };

    /**
     * Creates a new vector object to represent an object.
     * 
     * @param {LabelVectorParams} params The parameters of the vector object.
     */
    constructor(params) {
        super();
        this.config = params.config;

        this.#labels = params.labels;
        this.#labels?.addEventListener('vector-add', this.#onVectorChange);
        this.#labels?.addEventListener('vector-delete', this.#onVectorChange);
        this.#labels?.addEventListener('vector-update', this.#onVectorChange);
        this.#labels?.addEventListener('class-delete', this.#onClassDelete);
        this.#labels?.addEventListener('class-update', this.#onClassUpdate);

        this.#id = params.id;
        this.#vectorType = params.vectorType;
        this.#gtClassId = params.gtClassId ?? null;
        this.#timestamp = params.timestamp?.clone() ?? null;
        this.#showColor = params.showColor?.clone() ?? null;

        this.#view = new LabelVectorView({
            vectorBuilder: LabelVector.#getVectorBuilder(params.vectorType),
            vectorCoords: LabelVector.#getVectorCoords(this.config, params.vertices),
        });
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.#labels?.removeEventListener('vector-add', this.#onVectorChange);
        this.#labels?.removeEventListener('vector-delete', this.#onVectorChange);
        this.#labels?.removeEventListener('vector-update', this.#onVectorChange);
        this.#labels?.removeEventListener('class-delete', this.#onClassDelete);
        this.#labels?.removeEventListener('class-update', this.#onClassUpdate);
    }
}
