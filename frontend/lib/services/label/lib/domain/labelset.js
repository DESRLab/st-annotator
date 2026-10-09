import { Data } from 'dataclass';
import { z } from 'zod';

import { Timestamp } from '../../../../common/lib/utils';

import { LabelGroupState } from './group';

/**
 * @typedef {import('../../../../common/lib/utils').Hashable} Hashable
 */

/**
 * @readonly
 * @enum {0 | 1 | 2 | 3 | 4}
 */
export const BranchPermissionLevel = Object.freeze({
    NONE: 0,
    READ: 1,
    WRITE: 2,
    WRITE_ELEVATED: 3,
    ADMIN: 4,
});

/**
 * Finds the branch permission level based on its numeric value.
 * 
 * @param {number} value The numeric value of branch permission level.
 * @returns {BranchPermissionLevel} An instance of branch permission level.
 */
export function getBranchPermissionLvByValue(value) {
    return Object.values(BranchPermissionLevel)
        .find((permLv) => permLv === value) ?? BranchPermissionLevel.NONE;
}

/**
 * For more details, refer to the corresponding Pydantic model on the backend.
 * 
 * @implements {Hashable}
 */
export class LabelsetCommitState extends Data {

    /**
     * @readonly
     */
    static PLAIN_SCHEMA = z.object({
        group: LabelGroupState.SCHEMA,
        hash: z.string(),
        author_id: z.number().int(),
        timestamp: Timestamp.SCHEMA,
        op_config: z.object({
            op_name: z.string(),
            op_params: z.object({}).passthrough().or(z.unknown()),
        }),
    });

    /**
     * @readonly
     */
    static SCHEMA = this.PLAIN_SCHEMA
        .transform((data) => {
            const { hash: hash_, ...rest } = data;
            return LabelsetCommitState.create({ hash_, ...rest });
        });

    /**
     * @readonly
     * @type {LabelGroupState}
     */
    group;

    /**
     * @readonly
     * @type {string}
     */
    hash_;

    /**
     * @readonly
     * @type {number}
     */
    author_id;

    /**
     * @readonly
     * @type {Timestamp}
     */
    timestamp;

    /**
     * @readonly
     * @type {{ op_name: string, op_params?: unknown }}
     */
    op_config;

    /**
     * Deserializes an instance of this class from data parsed from a JSON string.
     * 
     * @param {unknown} obj The data to deserialize.
     * @returns {LabelsetCommitState} The resulting new instance.
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
        return JSON.stringify({ hash: this.hash_ });
    }
}

/**
 * For more details, refer to the corresponding Pydantic model on the backend.
 */
export class LabelsetEdgeState extends Data {

    /**
     * @readonly
     */
    static PLAIN_SCHEMA = z.object({
        group: LabelGroupState.SCHEMA,
        parent_hash: z.string(),
        child_hash: z.string(),
    });

    /**
     * @readonly
     */
    static SCHEMA = this.PLAIN_SCHEMA
        .transform((data) => this.create(data));

    /**
     * @readonly
     * @type {LabelGroupState}
     */
    group;

    /**
     * @readonly
     * @type {string}
     */
    parent_hash;

    /**
     * @readonly
     * @type {string}
     */
    child_hash;

    /**
     * Deserializes an instance of this class from data parsed from a JSON string.
     * 
     * @param {unknown} obj The data to deserialize.
     * @returns {LabelsetEdgeState} The resulting new instance.
     */
    static fromJSON(obj) {
        return this.SCHEMA.parse(obj);
    }
}

/**
 * For more details, refer to the corresponding Pydantic model on the backend.
 * 
 * @implements {Hashable}
 */
export class LabelsetBranchState extends Data {

    /**
     * @readonly
     */
    static PLAIN_SCHEMA = z.object({
        id: z.number().int(),
        group: LabelGroupState.SCHEMA,
        name: z.string(),
        head: LabelsetCommitState.SCHEMA,
        checkpoint: LabelsetCommitState.SCHEMA,
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
     * @type {LabelGroupState}
     */
    group;

    /**
     * @readonly
     * @type {string}
     */
    name;

    /**
     * @readonly
     * @type {LabelsetCommitState}
     */
    head;

    /**
     * @readonly
     * @type {LabelsetCommitState}
     */
    checkpoint;

    /**
     * Deserializes an instance of this class from data parsed from a JSON string.
     * 
     * @param {unknown} obj The data to deserialize.
     * @returns {LabelsetBranchState} The resulting new instance.
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
export class CommitGraphState extends Data {

    /**
     * @readonly
     */
    static PLAIN_SCHEMA = z.object({
        group: LabelGroupState.SCHEMA,
        node_hashes: z.array(z.string().uuid()),
        edge_hashes: z.array(z.tuple([z.string().uuid(), z.string().uuid()])),
        commits: z.array(LabelsetCommitState.SCHEMA),
    });

    /**
     * @readonly
     */
    static SCHEMA = this.PLAIN_SCHEMA
        .transform((data) => this.create(data));

    /**
     * @readonly
     * @type {LabelGroupState}
     */
    group;

    /**
     * @readonly
     * @type {ReadonlyArray<string>}
     */
    node_hashes;

    /**
     * @readonly
     * @type {ReadonlyArray<[string, string]>}
     */
    edge_hashes;

    /**
     * @readonly
     * @type {ReadonlyArray<LabelsetCommitState>}
     */
    commits;

    /**
     * Deserializes an instance of this class from data parsed from a JSON string.
     * 
     * @param {unknown} obj The data to deserialize.
     * @returns {CommitGraphState} The resulting new instance.
     */
    static fromJSON(obj) {
        return this.SCHEMA.parse(obj);
    }
}
