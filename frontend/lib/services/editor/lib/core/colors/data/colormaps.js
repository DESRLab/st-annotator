/**
 * A pseudo-registry containing colormap definitions.
 * 
 * @module
 */
import colormap from 'colormap';

import { Colormap } from './Colormap';

/**
 * Gets a colormap by name.
 * 
 * @param {string} name The name of the colormap. Refer to the `colormap` package for details.
 * @returns {Colormap} The requested colormap.
 */
export function get(name) {
    const arr = colormap({
        colormap: name,
        nshades: 255,
        format: 'hex',
        alpha: 1,
    });

    return new Colormap(name, arr);
}
