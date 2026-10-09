import { Placeholder } from 'sta/services/editor/base';

/**
 * @typedef {string | Placeholder<string>} UUID
 */

/**
 * A shorter version of a {@link UUID} that can be displayed to the user for convenience.
 */
export class ShortUUID {

    /**
     * The reference unique identifier.
     * 
     * @readonly
     * @type {UUID}
     */
    id;

    /**
     * Creates a shorter version of the given {@link UUID}.
     * 
     * @param {UUID} id The reference unique identifier.
     */
    constructor(id) {
        this.id = id;
    }

    /**
     * Returns a string representation of this object.
     * 
     * @returns {string} The string representation of this object.
     */
    toString() {
        let { id } = this;
        if (Placeholder.isPlaceholder(id)) {
            id = id.orElse('<...>');
        }

        return id.slice(-6);
    }
}
