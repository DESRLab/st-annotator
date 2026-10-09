import { Data } from 'dataclass';
import { z } from 'zod';

import { SourceGroupState } from './group';

/**
 * @typedef {import('../../../../common/lib/utils').Hashable} Hashable
 */

/**
 * For more details, refer to the corresponding Pydantic model on the backend.
 * 
 * @implements {Hashable}
 */
export class SourceSpecState extends Data {

    /**
     * @readonly
     */
    static PLAIN_SCHEMA = z.object({
        id: z.number().int(),
        name: z.string(),
        groups: z.array(SourceGroupState.SCHEMA),
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
     * @type {ReadonlyArray<SourceGroupState>}
     */
    groups;

    /**
     * Deserializes an instance of this class from data parsed from a JSON string.
     * 
     * @param {unknown} obj The data to deserialize.
     * @returns {SourceSpecState} The resulting new instance.
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
