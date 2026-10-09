import { Data } from 'dataclass';
import { z } from 'zod';

import { PartialSTBounds } from '../../../../common/lib/spatial';

import { LabelsetCommitState } from './labelset';

/**
 * For more details, refer to the corresponding Pydantic model on the backend.
 */
export class LabelDataState extends Data {

    /**
     * @readonly
     */
    static PLAIN_SCHEMA = z.object({
        id: z.string().uuid(),
        commit: LabelsetCommitState.SCHEMA,
        is_deleted: z.boolean(),
    });

    /**
     * @readonly
     */
    static SCHEMA = this.PLAIN_SCHEMA
        .transform((data) => this.create(data));

    /**
     * @readonly
     * @type {string}
     */
    id;

    /**
     * @readonly
     * @type {LabelsetCommitState}
     */
    commit;

    /**
     * @readonly
     * @type {boolean}
     */
    is_deleted;

    /**
     * Deserializes an instance of this class from data parsed from a JSON string.
     * 
     * @param {unknown} obj The data to deserialize.
     * @returns {LabelDataState} The resulting new instance.
     */
    static fromJSON(obj) {
        return this.SCHEMA.parse(obj);
    }
}

/**
 * For more details, refer to the corresponding Pydantic model on the backend.
 */
export class LabelEntityState extends LabelDataState {

    /**
     * @readonly
     */
    static PLAIN_SCHEMA = LabelDataState.PLAIN_SCHEMA;

    /**
     * @readonly
     */
    static SCHEMA = this.PLAIN_SCHEMA
        .transform((data) => this.create(data));

    /**
     * Deserializes an instance of this class from data parsed from a JSON string.
     * 
     * @param {unknown} obj The data to deserialize.
     * @returns {LabelEntityState} The resulting new instance.
     */
    static fromJSON(obj) {
        return this.SCHEMA.parse(obj);
    }
}

/**
 * For more details, refer to the corresponding Pydantic model on the backend.
 */
// @ts-expect-error
export class LabelElementState extends LabelDataState {

    /**
     * @readonly
     */
    static PLAIN_SCHEMA = LabelDataState.PLAIN_SCHEMA
        .and(z.object({
            st_bounds: PartialSTBounds.SCHEMA,
            entity_id: z.string().uuid().nullable(),
        }));

    /**
     * @readonly
     */
    static SCHEMA = this.PLAIN_SCHEMA
        .transform((data) => this.create(data));

    /**
     * @readonly
     * @type {PartialSTBounds}
     */
    st_bounds;

    /**
     * @readonly
     * @type {?string}
     */
    entity_id;

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
     * @returns {LabelElementState} The resulting new instance.
     */
    static fromJSON(obj) {
        return this.SCHEMA.parse(obj);
    }
}
