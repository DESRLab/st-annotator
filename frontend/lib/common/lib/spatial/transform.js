import { Data } from 'dataclass';
import { z } from 'zod';

import { DecimalVector3Data } from './vectors';

/**
 * For more details, refer to the corresponding Pydantic model on the backend.
 */
export class Transform extends Data {

    /**
     * @readonly
     */
    static PLAIN_SCHEMA = z.object({
        translation: DecimalVector3Data.SCHEMA,
        rotation: DecimalVector3Data.SCHEMA,
        scale: DecimalVector3Data.SCHEMA,
    });

    /**
     * @readonly
     */
    static SCHEMA = this.PLAIN_SCHEMA
        .transform((data) => this.create(data));

    /**
     * @readonly
     * @type {import('./vectors').DecimalVector3Data}
     */
    translation;

    /**
     * Note that this represents extrisic rotation in X-Y-Z order,
     * whereas `three.js` uses intrinsic rotations.
     * 
     * @readonly
     * @type {import('./vectors').DecimalVector3Data}
     */
    rotation;

    /**
     * @readonly
     * @type {import('./vectors').DecimalVector3Data}
     */
    scale;

    /**
     * Deserializes an instance of this class from data parsed from a JSON string.
     * 
     * @param {unknown} obj The data to deserialize.
     * @returns {Transform} The resulting new instance.
     */
    static fromJSON(obj) {
        return this.SCHEMA.parse(obj);
    }
}
