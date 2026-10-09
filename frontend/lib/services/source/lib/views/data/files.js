import { IOUtils } from '../../../../../common/lib/utils';

import { Data } from 'dataclass';
import { z } from 'zod';

import { SourceGroupState } from '../../domain';

/**
 * For more details, refer to the corresponding Pydantic model on the backend.
 */
export class SourceDirectory extends Data {

    /**
     * @readonly
     */
    static PLAIN_SCHEMA = z.object({
        name: z.string(),
        uri: z.string(),
        type: z.literal('directory'),
        href: z.string(),
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
    name;

    /**
     * @readonly
     * @type {string}
     */
    uri;

    /**
     * @readonly
     * @type {'directory'}
     */
    type;

    /**
     * @readonly
     * @type {string}
     */
    href;

    /**
     * Auxillary field for SlickGrid tables.
     * 
     * @type {string}
     */
    get id() { return this.name; }

    /**
     * Auxillary field for SlickGrid tables.
     * 
     * @type {ReadonlyArray<string>}
     */
    get groupNames() { return []; }

    /**
     * Deserializes an instance of this class from data parsed from a JSON string.
     * 
     * @param {unknown} obj The data to deserialize.
     * @returns {SourceDirectory} The resulting new instance.
     */
    static fromJSON(obj) {
        return this.SCHEMA.parse(obj);
    }
}

/**
 * For more details, refer to the corresponding Pydantic model on the backend.
 */
export class SourceFile extends Data {

    /**
     * @readonly
     */
    static PLAIN_SCHEMA = z.object({
        name: z.string(),
        uri: z.string(),
        type: z.literal('file'),
        can_edit: z.boolean(),
        groups: z.array(SourceGroupState.SCHEMA),
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
    name;

    /**
     * @readonly
     * @type {string}
     */
    uri;

    /**
     * @readonly
     * @type {'file'}
     */
    type;

    /**
     * @readonly
     * @type {boolean}
     */
    can_edit;

    /**
     * @readonly
     * @type {ReadonlyArray<SourceGroupState>}
     */
    groups;

    /**
     * Auxillary field for SlickGrid tables.
     * 
     * @type {string}
     */
    get id() { return this.name; }

    /**
     * Auxillary field for SlickGrid tables.
     * 
     * @type {ReadonlyArray<string>}
     */
    get groupNames() { return this.groups.map((group) => group.name); }

    /**
     * Deserializes an instance of this class from data parsed from a JSON string.
     * 
     * @param {unknown} obj The data to deserialize.
     * @returns {SourceFile} The resulting new instance.
     */
    static fromJSON(obj) {
        return this.SCHEMA.parse(obj);
    }
}

/**
 * @typedef {SourceDirectory | SourceFile} SourceFileObject
 */

/**
 * Deserializes an instance of {@link SourceFileObject} from data parsed from a JSON string.
 * 
 * @param {unknown} obj The data to deserialize.
 * @returns {SourceFileObject} The resulting new instance.
 */
function sourceFileObjectFromJSON(obj) {
    return SourceDirectory.SCHEMA.or(SourceFile.SCHEMA)
        .parse(obj);
}

/**
 * Obtains the list of all file objects under a directory, including subdirectories.
 * (Data Manager Only)
 * 
 * @param {string} urlPrefix The base URI of the file browser.
 * @param {string} uri The URI of the directory.
 * @returns {Promise<SourceFileObject[]>} A promise that resolves to the requested data.
 */
export async function managerListDirectory(urlPrefix, uri) {
    return IOUtils.get(`${urlPrefix}/ls/${uri}`, { dataType: 'json' })
        .then((data) => IOUtils.parseArray(data).map(sourceFileObjectFromJSON))
        .catch((reason) => {
            console.error(`Failed to list file objects under directory ${uri}:`, reason);
            return [];
        });
}
