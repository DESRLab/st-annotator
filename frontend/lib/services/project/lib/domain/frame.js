import { Data } from 'dataclass';
import { z } from 'zod';

import { PartialSTBounds } from '../../../../common/lib/spatial';
import { Timestamp } from '../../../../common/lib/utils';

import { AccountState } from '../../../account/lib';
import { SourceGroupState } from '../../../source/lib';
import { LabelsetBranchState } from '../../../label/lib';

import { TaskState } from './task';

/**
 * @typedef {import('../../../../common/lib/utils').Hashable} Hashable
 */

/**
 * @readonly
 * @enum {'annotate' | 'review'}
 */
export const WorkType = Object.freeze({
    ANNOTATE: 'annotate',
    REVIEW: 'review',
});

/**
 * For more details, refer to the corresponding Pydantic model on the backend.
 * 
 * @implements {Hashable}
 */
export class FrameState extends Data {

    /**
     * @readonly
     */
    static PLAIN_SCHEMA = z.object({
        id: z.number().int(),
        task: TaskState.SCHEMA,
        account_id: z.number().int(),
        source_group_id: z.number().int(),
        label_branch_id: z.number().int(),
        st_bounds: PartialSTBounds.SCHEMA,
        work_type: z.nativeEnum(WorkType),
        last_viewed_at: Timestamp.SCHEMA.nullable(),
        is_complete: z.boolean(),
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
     * @type {TaskState}
     */
    task;

    /**
     * @readonly
     * @type {number}
     */
    account_id;

    /**
     * @readonly
     * @type {number}
     */
    source_group_id;

    /**
     * @readonly
     * @type {number}
     */
    label_branch_id;

    /**
     * @readonly
     * @type {PartialSTBounds}
     */
    st_bounds;

    /**
     * @readonly
     * @type {WorkType}
     */
    work_type;

    /**
     * @readonly
     * @type {?Timestamp}
     */
    last_viewed_at;

    /**
     * @readonly
     * @type {boolean}
     */
    is_complete;

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
     * Auxillary field for SlickGrid tables.
     * 
     * @type {?Date}
     */
    get lastViewedAtDate() { return this.last_viewed_at?.getDate() ?? null; }

    /**
     * Deserializes an instance of this class from data parsed from a JSON string.
     * 
     * @param {unknown} obj The data to deserialize.
     * @returns {FrameState} The resulting new instance.
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

// @ts-expect-error
export class FrameData extends FrameState {

    /**
     * @readonly
     */
    static PLAIN_SCHEMA = FrameState.PLAIN_SCHEMA
        .and(z.object({
            valid_account: AccountState.SCHEMA.nullable(),
            valid_source_group: SourceGroupState.SCHEMA.nullable(),
            valid_label_branch: LabelsetBranchState.SCHEMA.nullable(),
            account_warn_msg: z.string(),
            source_group_warn_msg: z.string(),
            label_branch_warn_msg: z.string(),
        }));

    /**
     * @readonly
     */
    static SCHEMA = this.PLAIN_SCHEMA
        .transform((data) => this.create(data));

    /**
     * @readonly
     * @type {?AccountState}
     */
    valid_account;

    /**
     * @readonly
     * @type {?SourceGroupState}
     */
    valid_source_group;

    /**
     * @readonly
     * @type {?LabelsetBranchState}
     */
    valid_label_branch;

    /**
     * @readonly
     * @type {string}
     */
    account_warn_msg;

    /**
     * @readonly
     * @type {string}
     */
    source_group_warn_msg;

    /**
     * @readonly
     * @type {string}
     */
    label_branch_warn_msg;

    /**
     * Deserializes an instance of this class from data parsed from a JSON string.
     * 
     * @param {unknown} obj The data to deserialize.
     * @returns {FrameData} The resulting new instance.
     */
    static fromJSON(obj) {
        return this.SCHEMA.parse(obj);
    }
}
