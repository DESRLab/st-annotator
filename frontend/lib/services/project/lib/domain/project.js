import { Data } from 'dataclass';
import { z } from 'zod';

import { Vector3Data } from '../../../../common/lib/spatial';

import { AccountState } from '../../../account/lib';

/**
 * @typedef {import('../../../../common/lib/utils').Hashable} Hashable
 */

/**
 * For more details, refer to the corresponding Pydantic model on the backend.
 */
export class ProjectConfig extends Data {

    /**
     * @readonly
     */
    static PLAIN_SCHEMA = z.object({
        frame_cache_size: z.number().int().min(1),
        auto_tracks: z.boolean(),
        init_camera_position: Vector3Data.SCHEMA,
        init_camera_target: Vector3Data.SCHEMA,
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
    frame_cache_size;

    /**
     * @readonly
     * @type {boolean}
     */
    auto_tracks;

    /**
     * @readonly
     * @type {Vector3Data}
     */
    init_camera_position;

    /**
     * @readonly
     * @type {Vector3Data}
     */
    init_camera_target;

    /**
     * Deserializes an instance of this class from data parsed from a JSON string.
     * 
     * @param {unknown} obj The data to deserialize.
     * @returns {ProjectConfig} The resulting new instance.
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
export class ProjectState extends Data {

    /**
     * @readonly
     */
    static PLAIN_SCHEMA = z.object({
        id: z.number().int(),
        name: z.string(),
        description: z.string(),
        config: ProjectConfig.SCHEMA,
        member_ids: z.array(z.number().int()),
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
     * @type {ProjectConfig}
     */
    config;

    /**
     * @readonly
     * @type {ReadonlyArray<number>}
     */
    member_ids;

    /**
     * Deserializes an instance of this class from data parsed from a JSON string.
     * 
     * @param {unknown} obj The data to deserialize.
     * @returns {ProjectState} The resulting new instance.
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
export class ProjectData extends ProjectState {

    /**
     * @readonly
     */
    static PLAIN_SCHEMA = ProjectState.PLAIN_SCHEMA
        .and(z.object({
            valid_members: z.array(AccountState.SCHEMA),
            members_warn_msg: z.string(),
        }));

    /**
     * @readonly
     */
    static SCHEMA = this.PLAIN_SCHEMA
        .transform((data) => this.create(data));

    /**
     * @readonly
     * @type {ReadonlyArray<AccountState>}
     */
    valid_members;

    /**
     * @readonly
     * @type {string}
     */
    members_warn_msg;

    /**
     * Deserializes an instance of this class from data parsed from a JSON string.
     * 
     * @param {unknown} obj The data to deserialize.
     * @returns {ProjectData} The resulting new instance.
     */
    static fromJSON(obj) {
        return this.SCHEMA.parse(obj);
    }
}
