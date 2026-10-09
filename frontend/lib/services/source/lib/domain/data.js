import { Data } from 'dataclass';
import { z } from 'zod';

import { PartialSTBounds, Transform } from '../../../../common/lib/spatial';

import { SourceGroupState } from './group';

/**
 * @typedef {import('../../../../common/lib/utils').Hashable} Hashable
 */

/**
 * For more details, refer to the corresponding Pydantic model on the backend.
 * 
 * @implements {Hashable}
 */
export class SourceDataState extends Data {

    /**
     * @readonly
     */
    static PLAIN_SCHEMA = z.object({
        id: z.number().int(),
        st_bounds: PartialSTBounds.SCHEMA,
        group: SourceGroupState.SCHEMA,
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
     * @type {PartialSTBounds}
     */
    st_bounds;

    /**
     * @readonly
     * @type {SourceGroupState}
     */
    group;

    /**
     * Auxillary field for SlickGrid tables.
     * 
     * @type {?Date}
     */
    get minDate() { return this.st_bounds.min_timestamp?.getDate() ?? null; }

    /**
     * Auxillary field for SlickGrid tables.
     * 
     * @type {?Date}
     */
    get maxDate() { return this.st_bounds.max_timestamp?.getDate() ?? null; }

    /**
     * Deserializes an instance of this class from data parsed from a JSON string.
     * 
     * @param {unknown} obj The data to deserialize.
     * @returns {SourceDataState} The resulting new instance.
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
 */
// @ts-expect-error
export class SourceMetadataState extends SourceDataState {

    /**
     * @readonly
     */
    static PLAIN_SCHEMA = SourceDataState.PLAIN_SCHEMA
        .and(z.object({ uri: z.string() }));

    /**
     * @readonly
     */
    static SCHEMA = this.PLAIN_SCHEMA
        .transform((data) => this.create(data));

    /**
     * @readonly
     * @type {string}
     */
    uri;

    /**
     * Deserializes an instance of this class from data parsed from a JSON string.
     * 
     * @param {unknown} obj The data to deserialize.
     * @returns {SourceMetadataState} The resulting new instance.
     */
    static fromJSON(obj) {
        return this.SCHEMA.parse(obj);
    }
}

/**
 * For more details, refer to the corresponding Pydantic model on the backend.
 */
// @ts-expect-error
export class SourceTransformMetadataState extends SourceMetadataState {

    /**
     * @readonly
     */
    static PLAIN_SCHEMA = SourceMetadataState.PLAIN_SCHEMA
        .and(z.object({ transform: Transform.SCHEMA }));

    /**
     * @readonly
     */
    static SCHEMA = this.PLAIN_SCHEMA
        .transform((data) => this.create(data));

    /**
     * @readonly
     * @type {Transform}
     */
    transform;

    /**
     * Deserializes an instance of this class from data parsed from a JSON string.
     * 
     * @param {unknown} obj The data to deserialize.
     * @returns {SourceTransformMetadataState} The resulting new instance.
     */
    static fromJSON(obj) {
        return this.SCHEMA.parse(obj);
    }
}
