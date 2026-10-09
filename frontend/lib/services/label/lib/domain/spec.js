import { Data } from 'dataclass';
import * as THREE from 'three';
import { z } from 'zod';

import { LabelGroupState } from './group';

/**
 * @typedef {import('../../../../common/lib/utils').Hashable} Hashable
 */

/**
 * For more details, refer to the corresponding Pydantic model on the backend.
 * 
 * @implements {Hashable}
 */
export class LabelSpecState extends Data {

    /**
     * @readonly
     */
    static PLAIN_SCHEMA = z.object({
        id: z.number().int(),
        name: z.string(),
        groups: z.array(LabelGroupState.SCHEMA),
    });

    /**
     * @readonly
     */
    static SCHEMA = this.PLAIN_SCHEMA
        .transform((data) => this.create(data));

    /**
     * @readonly
     * @type {number}
     */
    id;

    /**
     * @readonly
     * @type {string}
     */
    name;

    /**
     * @readonly
     * @type {ReadonlyArray<LabelGroupState>}
     */
    groups;

    /**
     * Deserializes an instance of this class from data parsed from a JSON string.
     * 
     * @param {unknown} obj The data to deserialize.
     * @returns {LabelSpecState} The resulting new instance.
     */
    static fromJSON(obj) {
        return this.SCHEMA.parse(obj);
    }

    /**
     * Hashes this object to a string so that it can be used as a key in a mapping.
     * 
     * @returns {string} The resulting hash.
     */
    hash() {
        return JSON.stringify({ id: this.id });
    }
}

/**
 * For more details, refer to the corresponding Pydantic model on the backend.
 * 
 * @implements {Hashable}
 */
export class ObjectClassState extends Data {

    /**
     * @readonly
     */
    static PLAIN_SCHEMA = z.object({
        id: z.number().int(),
        name: z.string(),
        description: z.string(),
        color: z.string().transform((c) => new THREE.Color(c)),
        is_deleted: z.boolean(),
    });

    /**
     * @readonly
     */
    static SCHEMA = this.PLAIN_SCHEMA
        .transform((data) => this.create(data));

    /**
     * @readonly
     * @type {number}
     */
    id;

    /**
     * @readonly
     * @type {string}
     */
    name;

    /**
     * @readonly
     * @type {string}
     */
    description;

    /**
     * @readonly
     * @type {THREE.Color}
     */
    color;

    /**
     * @readonly
     * @type {boolean}
     */
    is_deleted;

    /**
     * Deserializes an instance of this class from data parsed from a JSON string.
     * 
     * @param {unknown} obj The data to deserialize.
     * @returns {ObjectClassState} The resulting new instance.
     */
    static fromJSON(obj) {
        return this.SCHEMA.parse(obj);
    }

    /**
     * Hashes this object to a string so that it can be used as a key in a mapping.
     * 
     * @returns {string} The resulting hash.
     */
    hash() {
        return JSON.stringify({ id: this.id });
    }
}

/**
 * For more details, refer to the corresponding Pydantic model on the backend.
 * 
 * @template {ObjectClassState} [T=ObjectClassState]
 * @augments LabelSpecState
 */
// @ts-expect-error
export class ObjectClassSelectionState extends LabelSpecState {

    /**
     * Creates the schema for an object class selection that is applicable to subclasses.
     * 
     * @template {z.ZodEffects<any>} T
     * @param {T} objclassesSchema The schema of each individual object class.
     * @returns {z.ZodIntersection<typeof LabelSpecState.PLAIN_SCHEMA, any>} The resulting schema.
     */
    static buildPlainSchema(objclassesSchema) {
        return LabelSpecState.PLAIN_SCHEMA
            .and(z.object({
                description: z.string(),
                objclasses: z.array(objclassesSchema),
            }));
    }

    /**
     * @readonly
     */
    static PLAIN_SCHEMA = this.buildPlainSchema(ObjectClassState.SCHEMA);

    /**
     * @readonly
     */
    static SCHEMA = this.PLAIN_SCHEMA
        .transform((data) => this.create(data));

    /**
     * @readonly
     * @type {string}
     */
    description;

    /**
     * @readonly
     * @type {ReadonlyArray<T>}
     */
    objclasses;

    /**
     * Deserializes an instance of this class from data parsed from a JSON string.
     * 
     * @param {unknown} obj The data to deserialize.
     * @returns {ObjectClassSelectionState} The resulting new instance.
     */
    static fromJSON(obj) {
        return this.SCHEMA.parse(obj);
    }

    /**
     * Hashes this object to a string so that it can be used as a key in a mapping.
     * 
     * @returns {string} The resulting hash.
     */
    hash() {
        return JSON.stringify({ id: this.id });
    }
}
