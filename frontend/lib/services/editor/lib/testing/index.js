/**
 * Provides useful functions for running tests on the annotation editor frontend.
 * 
 * @module sta/services/editor/testing
 */

import fc from 'fast-check';

import { makeColorArbitrary, makeVector3DataArbitrary } from '../../../../common/lib/testing';

import { ProjectConfig } from '../../../project/lib';

import { CoordinateFormat, EditorConfig } from '../base';
import { Colormap, ApplyColormap, NormalizedValueFunc, PointBuffer } from '../core';

/**
 * @typedef {import('../core').ColorBlender} ColorBlender
 */

/**
 * @type {() => fc.Arbitrary<Colormap>}
 */
export function makeColormapArbitrary() {
    return fc.record({
        name: fc.string(),
        colors: fc.array(makeColorArbitrary()),
    }).map(({ name, colors }) => new Colormap(name, colors));
}

/**
 * @type {() => fc.Arbitrary<NormalizedValueFunc>}
 */
export function makeNormalizedValueFuncArbitrary() {
    return fc.record({
        channel: fc.integer(),
        vmin: fc.double({ noNaN: true, noDefaultInfinity: true }),
        vmax: fc.double({ noNaN: true, noDefaultInfinity: true }),
    }).map(({ channel, vmin, vmax }) => new NormalizedValueFunc(channel, vmin, vmax));
}

/**
 * @type {() => fc.Arbitrary<ColorBlender>}
 */
export function makeApplyColormapArbitrary() {
    return fc.record({
        colormap: makeColormapArbitrary(),
        valueFunc: makeNormalizedValueFuncArbitrary(),
    }).map(({ colormap, valueFunc }) => new ApplyColormap(colormap, valueFunc));
}

/**
 * Creates an arbitrary that returns a random {@link CoordinateFormat}.
 * 
 * @returns {fc.Arbitrary<CoordinateFormat>} The new arbitrary.
 */
export function makeCoordinateFormatArbitrary() {
    return fc.constantFrom(...Object.values(CoordinateFormat));
}

/**
 * @type {() => fc.Arbitrary<PointBuffer>}
 */
export function makePointBufferArbitrary() {
    return fc.record({
        data: fc.float32Array({ minLength: 3, noNaN: true, noDefaultInfinity: true })
            .filter((data) => (data.length % 4 === 0)),
        format: makeCoordinateFormatArbitrary(),
        numChannels: fc.constantFrom(4),
    }).map(({ data, format, numChannels }) => new PointBuffer(data, format, numChannels));
}

/**
 * Creates an arbitrary that returns a random {@link EditorConfig}.
 * 
 * @returns {fc.Arbitrary<EditorConfig>} The new arbitrary.
 */
export function makeEditorConfigArbitrary() {
    return fc.record({
        auto_tracks: fc.option(fc.boolean(), { nil: undefined }),
        frame_cache_size: fc.integer({ min: 1 }),
        init_camera_position: makeVector3DataArbitrary(),
        init_camera_target: makeVector3DataArbitrary(),
    }).map((data) => new EditorConfig(ProjectConfig.create(data)));
}
