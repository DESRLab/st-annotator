import BiMap from 'ts-bidirectional-map';
import * as THREE from 'three';

import { Equatable, ThreeUtils } from 'sta/common/utils';

import { DistinctiveLevel, OcclusionLevel } from '../../../../label/lib';
import { BoundingCuboidBuilder, BoundingCylinderBuilder } from './views';

/* eslint-disable max-len */
/**
 * @typedef {import('sta/common/utils').Timestamp} Timestamp
 */

/**
 * @typedef {import('sta/services/editor/base').EditorConfig} EditorConfig
 */

/**
 * @typedef {import('../../../../label/lib').BoxType} BoxType
 */

/**
 * @typedef {import('./models').UUID} UUID
 */

/**
 * @typedef {import('./views').BoundingBox} BoundingBox
 */

/**
 * @typedef {import('./views').BoundingBoxBuilder} BoundingBoxBuilder
 */

/**
 * @typedef {import('./views/BoundingBox').BoundingBoxParams} BoundingBoxParams
 */

/**
 * @typedef {import('./LabelClass').ReadonlyLabelClass} ReadonlyLabelClass
 */

/**
 * @typedef {import('./LabelTrack').ReadonlyLabelTrack} ReadonlyLabelTrack
 */

/**
 * @typedef {import('./BBoxIndex').ReadonlyBBoxIndex} ReadonlyBBoxIndex
 */

/**
 * @typedef {import('./BBoxIndex').BBoxIndexEventMap} BBoxIndexEventMap
 */
/* eslint-enable max-len */

/**
 * @typedef {object} LabelBoxViewParams
 * @property {BoundingBoxBuilder} boxBuilder Creates the `three.js` objects of the bounding box.
 * @property {Readonly<THREE.Vector3>} [position] The position of the bounding box in world space.
 * Defaults to the identity transform.
 * @property {Readonly<THREE.Euler>} [rotation] The rotation of the bounding box.
 * Defaults to the identity transform.
 * @property {Readonly<THREE.Vector3>} [scale] The scale of the bounding box.
 * Defaults to the identity transform.
 * @property {Readonly<THREE.Color>} [color] The display color of the bounding box.
 * Defaults to black.
 * @property {number} [opacity=0.2] The opacity of the faces in the bounding box.
 * @property {boolean} [showForwardIndicator=true] `true` if the forward indicator of the
 * bounding box is visible; otherwise, `false`.
 * @property {boolean} [showFrame=true] `true` if the faces and edges of the bounding box are
 * visible; otherwise, `false`.
 */

/**
 * View class for {@link LabelBox}.
 */
class LabelBoxView {

    /**
     * @type {BoundingBoxBuilder}
     */
    #boxBuilder;

    /**
     * @type {BoundingBox}
     */
    #box;

    /**
     * Creates the `three.js` objects of the bounding box.
     * 
     * @type {BoundingBoxBuilder}
     */
    get boxBuilder() { return this.#boxBuilder; }

    set boxBuilder(value) {
        if (this.#boxBuilder !== value) {
            this.#boxBuilder = value;
            this.#box = LabelBoxView.#createBox(value, this);
        }
    }

    /**
     * Creates a new bounding box with the given parameters.
     * 
     * @param {BoundingBoxBuilder} builder Creates the `three.js` objects of the box.
     * @param {BoundingBoxParams} params The parameters to pass to the box.
     * @returns {BoundingBox} The new bounding box.
     */
    static #createBox(builder, params) {
        return builder.createBox(params);
    }

    /**
     * The position of this bounding box in world space.
     * 
     * @type {Readonly<THREE.Vector3>}
     */
    get position() { return this.#box.position; }

    set position(value) { this.#box.position = value; }

    /**
     * The rotation of this bounding box.
     * 
     * @type {Readonly<THREE.Euler>}
     */
    get rotation() { return this.#box.rotation; }

    set rotation(value) { this.#box.rotation = value; }

    /**
     * The scale of this bounding box.
     * 
     * @type {Readonly<THREE.Vector3>}
     */
    get scale() { return this.#box.scale; }

    set scale(value) { this.#box.scale = value; }

    /**
     * The display color of the bounding box.
     * 
     * @type {Readonly<THREE.Color>}
     */
    get color() { return this.#box.color; }

    set color(value) { this.#box.color = value; }

    /**
     * The opacity of the faces in the bounding box.
     * 
     * @type {number}
     */
    get opacity() { return this.#box.opacity; }

    set opacity(value) { this.#box.opacity = value; }

    /**
     * `true` if the forward indicator of the bounding box is visible; otherwise, `false`.
     * 
     * @type {boolean}
     */
    get showForwardIndicator() { return this.#box.showForwardIndicator; }

    set showForwardIndicator(value) { this.#box.showForwardIndicator = value; }

    /**
     * `true` if the faces and edges of the bounding box are visible; otherwise, `false`.
     * 
     * @type {boolean}
     */
    get showFrame() { return this.#box.showFrame; }

    set showFrame(value) { this.#box.showFrame = value; }

    /**
     * Creates a view for a {@link LabelBox}.
     * 
     * @param {LabelBoxViewParams} params The parameters to pass to the view.
     */
    constructor(params) {
        this.#box = LabelBoxView.#createBox(params.boxBuilder, {
            position: params.position ?? new THREE.Vector3(0, 0, 0),
            rotation: params.rotation ?? new THREE.Euler(0, 0, 0),
            scale: params.scale ?? new THREE.Vector3(1, 1, 1),
            color: params.color ?? new THREE.Color('black'),
            opacity: params.opacity ?? 0.2,
            showForwardIndicator: params.showForwardIndicator ?? true,
            showFrame: params.showFrame ?? true,
        });
    }

    /**
     * Returns a `three.js` representation of this view.
     * 
     * @returns {THREE.Object3D} The resulting object.
     */
    asObject3D() {
        return this.#box.asObject3D();
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
        return this.#box.raycast(raycaster, intersects);
    }
}

/**
 * A mapping to/from each view type for a bounding box and its string representation.
 * 
 * @type {BiMap<BoundingBoxBuilder, BoxType>}
 */
const boxBuilderToString = new BiMap();
boxBuilderToString.set(new BoundingCuboidBuilder(), 'cuboid');
boxBuilderToString.set(new BoundingCylinderBuilder(), 'cylinder');

/**
 * @typedef {object} LabelBoxParams
 * @property {EditorConfig} config The configuration of the application.
 * @property {?ReadonlyBBoxIndex} labels A collection of labels from which related labels
 * are queried for this bounding box.
 * 
 * This is usually the collection of labels containing this bounding box.
 * @property {UUID} id The unique identifier of the bounding box.
 * @property {BoxType} boxType Indicates the type of bounding box.
 * @property {Readonly<THREE.Vector3>} center The position vector of the bounding box in the
 * coordinate system of the database.
 * 
 * A shallow copy of the vector is made to this object.
 * @property {number} angle The rotation of the bounding box about the vertical axis.
 * @property {Readonly<THREE.Vector3>} size The size vector of the bounding box in the
 * coordinate system of the database.
 * 
 * A shallow copy of the vector is made to this object.
 * @property {?number} [qualityRank=null] The quality rank of the annotation.
 * @property {DistinctiveLevel} [distinctiveLv=DistinctiveLevel.Unknown] The distinctiveness
 * level of the represented object.
 * @property {OcclusionLevel} [occlusionLv=OcclusionLevel.Unknown] The occlusion level of the
 * represented object.
 * @property {?number} [perceivedClassId=null] The unique identifier of the perceived class of the
 * represented object, or `null` if no class is assigned.
 * @property {?UUID} [entityId=null] The unique identifier of the object track representing the
 * same object, or `null` if no track is assigned.
 * @property {?Timestamp} [timestamp=null] The timestamp of the represented object.
 * 
 * A shallow copy of the date is made to this object.
 * @property {number} [opacity=0.2] The opacity of the faces in the bounding box.
 * @property {boolean} [showForwardIndicator=true] `true` if the forward indicator of the
 * bounding box is visible; otherwise, `false`.
 * @property {boolean} [showFrame=true] `true` if the faces and edges of the bounding box
 * are visible; otherwise, `false`.
 * @property {boolean} [showPerceivedClass=true] If `true`, displays the color of the bounding box
 * based on their perceived class; otherwise, displays the color based on their ground truth class.
 * @property {?Readonly<THREE.Color>} [showColor=null] If given, displays the given color for
 * the bounding box, regardless of `showPerceivedClass`.
 * 
 * A shallow copy of the color is made to this object.
 */

/**
 * Represents the event when a property (except for `labels`) has been changed.
 * - `obj`: The object which property has been changed.
 * - `propertyKey`: The name of the property that was changed.
 * 
 * @typedef {{
 *     obj: LabelBox;
 *     propertyKey: Exclude<keyof LabelBoxParams, 'config' | 'labels'>;
 * }} PropertyChangeEvent
 */

/**
 * Defines each event that can be dispatched by {@link LabelBox}.
 * 
 * @typedef {object} LabelBoxEventMap
 * @property {PropertyChangeEvent} change The event when a property (except for `labels`)
 * has been changed.
 */

/**
 * @typedef {Pick<Readonly<LabelBox>, keyof THREE.EventDispatcher<LabelBoxEventMap>
 * | 'asObject3D' | 'raycast' | keyof LabelBoxParams
 * | 'entity' | 'gtClass' | 'perceivedClass' | 'displayClass'>} ReadonlyLabelBox
 */

/**
 * Represents a bounding box in the scene.
 * 
 * The structure of this agent class is similar to {@link Controller}, but since we are wrapping
 * {@link ReadonlyBBoxIndex} which is an agent class, we need to perform the
 * coordination at the agent level rather than the controller level. Here,
 * {@link ReadonlyBBoxIndex} acts like a model while {@link LabelBoxView} acts like a
 * view.
 * 
 * @augments THREE.EventDispatcher<LabelBoxEventMap>
 */
export class LabelBox extends THREE.EventDispatcher {

    /**
     * @readonly
     * @type {LabelBoxView}
     */
    #view;

    /**
     * Returns a `three.js` representation of this bounding box.
     * 
     * @returns {THREE.Object3D} The resulting object.
     */
    asObject3D() {
        return this.#view.asObject3D();
    }

    /**
     * Performs raycasting against this bounding box.
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
     * A collection of labels from which related labels are queried for this bounding box.
     * 
     * This is usually the collection of labels containing this bounding box.
     * 
     * @type {?ReadonlyBBoxIndex}
     */
    get labels() { return this.#labels; }

    set labels(value) {
        if (this.#labels !== value) {
            this.#labels?.removeEventListener('class-delete', this.#onClassDelete);
            this.#labels?.removeEventListener('class-update', this.#onClassUpdate);
            this.#labels?.removeEventListener('track-add', this.#onTrackChange);
            this.#labels?.removeEventListener('track-delete', this.#onTrackChange);
            this.#labels?.removeEventListener('track-update', this.#onTrackChange);

            this.#labels = value;
            this.#labels?.addEventListener('class-delete', this.#onClassDelete);
            this.#labels?.addEventListener('class-update', this.#onClassUpdate);
            this.#labels?.addEventListener('track-add', this.#onTrackChange);
            this.#labels?.addEventListener('track-delete', this.#onTrackChange);
            this.#labels?.addEventListener('track-update', this.#onTrackChange);

            this.render();
        }
    }

    /**
     * @type {UUID}
     */
    #id;

    /**
     * The unique identifier of this bounding box.
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
     * @type {BoxType}
     */
    #boxType;

    /**
     * Indicates the type of bounding box.
     * 
     * @type {BoxType}
     */
    get boxType() { return this.#boxType; }

    set boxType(value) {
        if (this.#boxType !== value) {
            this.#boxType = value;

            this.render();
            this.dispatchEvent({ type: 'change', obj: this, propertyKey: 'boxType' });
        }
    }

    /**
     * The position vector of the bounding box in the coordinate system of the database.
     * 
     * A shallow copy of the vector is made to this object.
     * 
     * @type {Readonly<THREE.Vector3>}
     */
    get center() {
        return LabelBox.#getCenter(this.config, this.#view);
    }

    set center(value) {
        if (!this.center.equals(value)) {
            this.#view.position = LabelBox.#getPosition(this.config, value);

            this.render();
            this.dispatchEvent({ type: 'change', obj: this, propertyKey: 'center' });
        }
    }

    /**
     * The rotation of the bounding box about the vertical axis.
     * 
     * @type {number}
     */
    get angle() {
        return LabelBox.#getAngle(this.config, this.#view);
    }

    set angle(value) {
        if (this.angle !== value) {
            this.#view.rotation = LabelBox.#getRotation(this.config, value);

            this.render();
            this.dispatchEvent({ type: 'change', obj: this, propertyKey: 'angle' });
        }
    }

    /**
     * The size vector of the bounding box in the coordinate system of the database.
     * 
     * A shallow copy of the vector is made to this object.
     * 
     * @type {Readonly<THREE.Vector3>}
     */
    get size() {
        return LabelBox.#getSize(this.config, this.#view);
    }

    set size(value) {
        if (!this.size.equals(value)) {
            this.#view.scale = LabelBox.#getScale(this.config, value);

            this.render();
            this.dispatchEvent({ type: 'change', obj: this, propertyKey: 'size' });
        }
    }

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

        return LabelBox.#getPerceivedClass(labels, this.perceivedClassId);
    }

    /**
     * @type {?UUID}
     */
    #entityId;

    /**
     * The unique identifier of the object track representing the same object,
     * or `null` if no track is assigned.
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
     * The object track which a bounding box belongs to, or `null` if no track is
     * assigned.
     * 
     * This is `null` if there is no collection of labels to query.
     * 
     * @type {?ReadonlyLabelTrack}
     */
    get entity() {
        const { labels } = this;
        if (labels == null) return null;

        return LabelBox.#getEntity(labels, this.entityId);
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

        return LabelBox.#getGroundTruthClass(labels, this.entityId);
    }

    /**
     * The class being displayed for this bounding box, or `null` if no class is
     * assigned.
     * 
     * This is `null` if there is no collection of labels to query.
     * 
     * @type {?ReadonlyLabelClass}
     */
    get displayClass() {
        const { labels } = this;
        if (labels == null) return null;

        return LabelBox.#getDisplayClass(labels, this);
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
     * The opacity of the faces in this bounding box.
     * 
     * @type {number}
     */
    get opacity() { return this.#view.opacity; }

    set opacity(value) {
        if (this.#view.opacity !== value) {
            this.#view.opacity = value;
            this.dispatchEvent({ type: 'change', obj: this, propertyKey: 'opacity' });
        }
    }

    /**
     * `true` if the forward indicator of this bounding box is visible; otherwise, `false`.
     * 
     * @type {boolean}
     */
    get showForwardIndicator() { return this.#view.showForwardIndicator; }

    set showForwardIndicator(value) {
        if (this.#view.showForwardIndicator !== value) {
            this.#view.showForwardIndicator = value;
            this.dispatchEvent({ type: 'change', obj: this, propertyKey: 'showForwardIndicator' });
        }
    }

    /**
     * `true` if the faces and edges of this bounding box are visible; otherwise, `false`.
     * 
     * @type {boolean}
     */
    get showFrame() { return this.#view.showFrame; }

    set showFrame(value) {
        if (this.#view.showFrame !== value) {
            this.#view.showFrame = value;
            this.dispatchEvent({ type: 'change', obj: this, propertyKey: 'showFrame' });
        }
    }

    /**
     * @type {boolean}
     */
    #showPerceivedClass;

    /**
     * If `true`, displays the color of the bounding box based on their perceived class;
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
     * Updates the view according to the data in this object.
     */
    render() {
        const { boxType } = this;
        const view = this.#view;
        const labels = this.#labels;

        view.boxBuilder = LabelBox.#getBoxBuilder(boxType);

        if (labels == null) return;

        view.color = LabelBox.#getColor(labels, this);
    }

    /**
     * Gets the element builder of a bounding box.
     * 
     * @param {BoxType} boxType Indicates the type of bounding box.
     * @returns {BoundingBoxBuilder} The requested type.
     */
    static #getBoxBuilder(boxType) {
        const boxBuilder = boxBuilderToString.getKey(boxType);
        if (boxBuilder == null) {
            throw new Error(`Unrecognized box type: ${boxType}`);
        }

        return boxBuilder;
    }

    /**
     * Gets the position of a bounding box in world space.
     * 
     * @param {EditorConfig} config The configuration of the application.
     * @param {Readonly<THREE.Vector3>} center The position vector of the bounding box in the
     * coordinate system of the database.
     * @returns {Readonly<THREE.Vector3>} The requested position.
     */
    static #getPosition(config, center) {
        const format = config.coordinateFormat;
        return format.toThreeJSCoords(center);
    }

    /**
     * Gets the rotation of a bounding box.
     * 
     * @param {EditorConfig} config The configuration of the application.
     * @param {number} angle The rotation of the bounding box about the vertical axis.
     * @returns {Readonly<THREE.Euler>} The requested rotation.
     */
    static #getRotation(config, angle) {
        return new THREE.Euler(0, angle, 0, 'XYZ');
    }

    /**
     * Gets the scale of a bounding box.
     * 
     * @param {EditorConfig} config The configuration of the application.
     * @param {Readonly<THREE.Vector3>} size The size vector of the bounding box in the coordinate
     * system of the database.
     * @returns {Readonly<THREE.Vector3>} The requested scale.
     */
    static #getScale(config, size) {
        const format = config.coordinateFormat;
        return format.toThreeJSCoords(size);
    }

    /**
     * Gets the perceived class for a bounding box, if it exists.
     * 
     * @param {ReadonlyBBoxIndex} labels The collection of labels from which related
     * labels are queried.
     * @param {?number} perceivedClassId The unique identifier of the perceived class of the
     * represented object, or null if no class is assigned.
     * @returns {?ReadonlyLabelClass} The requested class, or `null` if there is no such class.
     */
    static #getPerceivedClass(labels, perceivedClassId) {
        return (perceivedClassId == null) ? null : labels.getLabelClass(perceivedClassId);
    }

    /**
     * Gets the object track which a bounding box belongs to, if it exists.
     * 
     * @param {ReadonlyBBoxIndex} labels The collection of labels from which related
     * labels are queried.fier of the object track representing the same object,
     * or `null` if no track is assigned.
     * @param {?UUID} entityId The unique identifier of the object track representing the same
     * object, or `null` if no track is assigned.
     * @returns {?ReadonlyLabelTrack} The requested track, or `null` if there is no such track.
     */
    static #getEntity(labels, entityId) {
        return (entityId == null) ? null : labels.getLabelTrack(entityId);
    }

    /**
     * Gets the ground truth class for a bounding box, if it exists.
     * 
     * @param {ReadonlyBBoxIndex} labels The collection of labels from which related
     * labels are queried.
     * @param {?UUID} entityId The unique identifier of the object track representing the same
     * object, or `null` if no track is assigned.
     * @returns {?ReadonlyLabelClass} The requested class, or `null` if there is no such class.
     */
    static #getGroundTruthClass(labels, entityId) {
        const track = LabelBox.#getEntity(labels, entityId);
        return (track == null) ? null : track.gtClass;
    }

    /**
     * Gets the display class for a bounding box.
     * 
     * @param {ReadonlyBBoxIndex} labels The collection of labels from which related
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
     * @type {Readonly<THREE.Color>}
     */
    static #NO_CLASS_COLOR = new THREE.Color(0xD22B2B);

    /**
     * Gets the display color for a bounding box.
     * 
     * @param {ReadonlyBBoxIndex} labels The collection of labels from which related
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
        return LabelBox.#getDisplayClass(labels, model)?.boxColor ?? LabelBox.#NO_CLASS_COLOR;
    }

    /**
     * Handles the event when an object track has been added, deleted or updated.
     * 
     * @template {'add' | 'delete' | 'update'} T
     * @param {BBoxIndexEventMap[`track-${T}`]} event The event to handle.
     */
    #onTrackChange = (event) => {
        if (event.obj.id === this.entityId) {
            this.render();
        }
    };

    /**
     * Handles the event when an object class has been deleted.
     * 
     * @param {BBoxIndexEventMap['class-delete']} event The event to handle.
     */
    #onClassDelete = (event) => {
        if (event.obj === this.displayClass) {
            this.render();
        }
    };

    /**
     * Handles the event when an object class has been updated.
     * 
     * @param {BBoxIndexEventMap['class-update']} event The event to handle.
     */
    #onClassUpdate = (event) => {
        if (event.obj === this.displayClass) {
            this.render();
        }
    };

    /**
     * Creates a new object track to represent an object.
     * 
     * @param {LabelBoxParams} params The parameters of the object track.
     */
    constructor(params) {
        super();

        this.config = params.config;

        this.#labels = params.labels;
        this.#labels?.addEventListener('class-delete', this.#onClassDelete);
        this.#labels?.addEventListener('class-update', this.#onClassUpdate);
        this.#labels?.addEventListener('track-add', this.#onTrackChange);
        this.#labels?.addEventListener('track-delete', this.#onTrackChange);
        this.#labels?.addEventListener('track-update', this.#onTrackChange);

        this.#id = params.id;
        this.#boxType = params.boxType;
        this.#qualityRank = params.qualityRank ?? null;
        this.#distinctiveLv = params.distinctiveLv ?? DistinctiveLevel.Unknown;
        this.#occlusionLv = params.occlusionLv ?? OcclusionLevel.Unknown;
        this.#perceivedClassId = params.perceivedClassId ?? null;
        this.#entityId = params.entityId ?? null;
        this.#timestamp = params.timestamp?.clone() ?? null;
        this.#showPerceivedClass = params.showPerceivedClass ?? true;
        this.#showColor = params.showColor?.clone() ?? null;

        this.#view = new LabelBoxView({
            boxBuilder: LabelBox.#getBoxBuilder(params.boxType),
            position: LabelBox.#getPosition(this.config, params.center),
            rotation: LabelBox.#getRotation(this.config, params.angle),
            scale: LabelBox.#getScale(this.config, params.size),
            opacity: params.opacity,
            showForwardIndicator: params.showForwardIndicator,
            showFrame: params.showFrame,
        });

        // Need to add to the index first, so we call this in the index
        // this.render();
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.#labels?.removeEventListener('class-delete', this.#onClassDelete);
        this.#labels?.removeEventListener('class-update', this.#onClassUpdate);
        this.#labels?.removeEventListener('track-add', this.#onTrackChange);
        this.#labels?.removeEventListener('track-delete', this.#onTrackChange);
        this.#labels?.removeEventListener('track-update', this.#onTrackChange);
    }

    /**
     * Gets the position vector of a bounding box in the coordinate system of the database.
     * 
     * @param {EditorConfig} config The configuration of the application.
     * @param {LabelBoxView} view The input view instance.
     * @returns {Readonly<THREE.Vector3>} The requested position vector.
     */
    static #getCenter(config, view) {
        const format = config.coordinateFormat;
        return format.toDatabaseCoords(view.position);
    }

    /**
     * Gets the rotation of a bounding box about the vertical axis.
     * 
     * @param {EditorConfig} config The configuration of the application.
     * @param {LabelBoxView} view The input view instance.
     * @returns {number} The rotation of the box.
     */
    static #getAngle(config, view) {
        // Given: The vertical axis is the `y` axis in `three.js`.
        // Apply the rotation matrix to a unit vector in the `z` direction that corresponds
        // to the `z` scale, then compute its angle against the positive `z` axis.
        const signZ = Math.sign(view.scale.z);
        const flippedZ = new THREE.Vector3(0, 0, (signZ === 0) ? 1 : signZ);
        const rotatedZ = flippedZ.applyEuler(view.rotation);

        return Math.atan2(rotatedZ.x, rotatedZ.z);
    }

    /**
     * Gets the size vector of a bounding box in the coordinate system of the database.
     * 
     * @param {EditorConfig} config The configuration of the application.
     * @param {LabelBoxView} view The input view instance.
     * @returns {Readonly<THREE.Vector3>} The requested size vector.
     */
    static #getSize(config, view) {
        const format = config.coordinateFormat;
        return ThreeUtils.mapVector3(format.toDatabaseCoords(view.scale), Math.abs);
    }
}
