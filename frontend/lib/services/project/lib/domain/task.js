import { Data } from 'dataclass';
import _ from 'lodash';
import { z } from 'zod';

import { AccountState } from '../../../account/lib';
import { SourceGroupState } from '../../../source/lib';
import { LabelGroupState } from '../../../label/lib';

import { ProjectState } from './project';

/**
 * @typedef {import('../../../../common/lib/utils').Hashable} Hashable
 */

/**
 * For more details, refer to the corresponding Pydantic model on the backend.
 * 
 * @implements {Hashable}
 */
export class TaskState extends Data {

    /**
     * @readonly
     */
    static PLAIN_SCHEMA = z.object({
        id: z.number().int(),
        parent_id: z.number().int().nullable(),
        project: ProjectState.SCHEMA,
        source_group_id: z.number().int(),
        label_group_id: z.number().int(),
        name: z.string(),
        description: z.string(),
        deadline: z.null().or(z.string().pipe(z.coerce.date())),
        supervisor_ids: z.array(z.number().int()),
        annotator_ids_by_quality_rank: z.record(
            z.string().pipe(z.coerce.number().int()).or(z.number().int()),
            z.number().int(),
        ),
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
     * @type {?number}
     */
    parent_id;

    /**
     * @readonly
     * @type {ProjectState}
     */
    project;

    /**
     * @readonly
     * @type {number}
     */
    source_group_id;

    /**
     * @readonly
     * @type {number}
     */
    label_group_id;

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
     * @type {?Date}
     */
    deadline;

    /**
     * @readonly
     * @type {ReadonlyArray<number>}
     */
    supervisor_ids;

    /**
     * @readonly
     * @type {Record<number, number>}
     */
    annotator_ids_by_quality_rank;

    /**
     * Auxillary field for SlickGrid tables.
     * 
     * @type {ReadonlyArray<number>}
     */
    get annotatorIdsFromBestToWorst() {
        return _.sortBy(this.annotator_ids_by_quality_rank, (id, rank) => rank)
            .map((id) => id);
    }

    /**
     * Deserializes an instance of this class from data parsed from a JSON string.
     * 
     * @param {unknown} obj The data to deserialize.
     * @returns {TaskState} The resulting new instance.
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
export class TaskData extends TaskState {

    /**
     * @readonly
     */
    static PLAIN_SCHEMA = TaskState.PLAIN_SCHEMA
        .and(z.object({
            valid_source_group: SourceGroupState.SCHEMA.nullable(),
            valid_label_group: LabelGroupState.SCHEMA.nullable(),
            valid_supervisors: z.array(AccountState.SCHEMA),
            valid_annotators: z.array(AccountState.SCHEMA),
            source_group_warn_msg: z.string(),
            label_group_warn_msg: z.string(),
            supervisors_warn_msg: z.string(),
            annotators_warn_msg: z.string(),
        }));

    /**
     * @readonly
     */
    static SCHEMA = this.PLAIN_SCHEMA
        .transform((data) => this.create(data));

    /**
     * @readonly
     * @type {?SourceGroupState}
     */
    valid_source_group;

    /**
     * @readonly
     * @type {?LabelGroupState}
     */
    valid_label_group;

    /**
     * @readonly
     * @type {ReadonlyArray<AccountState>}
     */
    valid_supervisors;

    /**
     * @readonly
     * @type {ReadonlyArray<AccountState>}
     */
    valid_annotators;

    /**
     * @readonly
     * @type {string}
     */
    source_group_warn_msg;

    /**
     * @readonly
     * @type {string}
     */
    label_group_warn_msg;

    /**
     * @readonly
     * @type {string}
     */
    supervisors_warn_msg;

    /**
     * @readonly
     * @type {string}
     */
    annotators_warn_msg;

    /**
     * Deserializes an instance of this class from data parsed from a JSON string.
     * 
     * @param {unknown} obj The data to deserialize.
     * @returns {TaskData} The resulting new instance.
     */
    static fromJSON(obj) {
        return this.SCHEMA.parse(obj);
    }
}
