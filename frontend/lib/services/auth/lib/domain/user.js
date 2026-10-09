import { Data } from 'dataclass';
import { z } from 'zod';

/**
 * @typedef {import('../../../../common/lib/utils').Hashable} Hashable
 */

/**
 * @readonly
 * @enum {'admin' | 'data-manager' | 'project-manager' | 'supervisor' | 'annotator'}
 */
export const Role = Object.freeze({
    ADMIN: 'admin',
    DATA_MANAGER: 'data-manager',
    PROJECT_MANAGER: 'project-manager',
    SUPERVISOR: 'supervisor',
    ANNOTATOR: 'annotator',
});

/**
 * For more details, refer to the corresponding Pydantic model on the backend.
 * 
 * @implements {Hashable}
 */
export class UserState extends Data {

    /**
     * @readonly
     */
    static PLAIN_SCHEMA = z.object({
        id: z.number().int(),
        username: z.string(),
        created_at: z.string().datetime({ offset: true })
            .transform((x) => new Date(x)),
        prev_login_at: z.string().datetime({ offset: true })
            .transform((x) => new Date(x))
            .nullable(),
        current_login_at: z.string().datetime({ offset: true })
            .transform((x) => new Date(x))
            .nullable(),
        roles: z.array(z.nativeEnum(Role)),
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
    username;

    /**
     * @readonly
     * @type {Date}
     */
    created_at;

    /**
     * @readonly
     * @type {?Date}
     */
    prev_login_at;

    /**
     * @readonly
     * @type {?Date}
     */
    current_login_at;

    /**
     * @readonly
     * @type {ReadonlyArray<Role>}
     */
    roles;

    /**
     * Deserializes an instance of this class from data parsed from a JSON string.
     * 
     * @param {unknown} obj The data to deserialize.
     * @returns {UserState} The resulting new instance.
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
