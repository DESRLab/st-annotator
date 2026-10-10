/**
 * Provides useful functions for running tests on the annotation editor frontend.
 *
 * @module app/editor
 */

import fc from "fast-check";

import { ProjectConfig } from "../models";
import {
  makeColorArbitrary,
  makeVector3DataArbitrary,
} from "sta/common/testing";

import { Colormap } from "../colors/data/Colormap";
import { CoordinateFormat } from "../config/CoordinateFormat";
import type { CoordinateFormatSpec } from "../config/CoordinateFormat";
import { EditorConfig } from "../config/EditorConfig";
import { ApplyColormap } from "../points/data/ColorBlender";
import type { ColorBlender } from "../points/data/ColorBlender";
import { PointBuffer } from "../points/data/PointBuffer";
import { NormalizedValueFunc } from "../points/data/ValueFunc";

export {
  createEditorStateFixture,
  createMockEditorStore,
  noopEditorIntents,
} from "../store/testing";
export type { FixtureLayerDescriptor, MockEditorStore } from "../store/testing";

export function makeColormapArbitrary(): fc.Arbitrary<Colormap> {
  return fc
    .record({
      name: fc.string(),
      colors: fc.array(makeColorArbitrary()),
    })
    .map(({ name, colors }) => new Colormap(name, colors));
}

export function makeNormalizedValueFuncArbitrary(): fc.Arbitrary<NormalizedValueFunc> {
  return fc
    .record({
      channel: fc.integer(),
      vmin: fc.double({ noNaN: true, noDefaultInfinity: true }),
      vmax: fc.double({ noNaN: true, noDefaultInfinity: true }),
    })
    .map(
      ({ channel, vmin, vmax }) => new NormalizedValueFunc(channel, vmin, vmax),
    );
}

export function makeApplyColormapArbitrary(): fc.Arbitrary<ColorBlender> {
  return fc
    .record({
      colormap: makeColormapArbitrary(),
      valueFunc: makeNormalizedValueFuncArbitrary(),
    })
    .map(({ colormap, valueFunc }) => new ApplyColormap(colormap, valueFunc));
}

/**
 * Creates an arbitrary that returns a random {@link CoordinateFormat}.
 *
 * @returns The new arbitrary.
 */
export function makeCoordinateFormatArbitrary(): fc.Arbitrary<CoordinateFormatSpec> {
  return fc.constantFrom(...Object.values(CoordinateFormat));
}

export function makePointBufferArbitrary(): fc.Arbitrary<PointBuffer> {
  return fc
    .record({
      data: fc
        .float32Array({
          minLength: 3,
          noNaN: true,
          noDefaultInfinity: true,
        })
        .filter((data) => data.length % 4 === 0),
      format: makeCoordinateFormatArbitrary(),
      numChannels: fc.constantFrom(4),
    })
    .map(
      ({ data, format, numChannels }) =>
        new PointBuffer(data, format, numChannels),
    );
}

/**
 * Creates an arbitrary that returns a random {@link EditorConfig}.
 *
 * @returns The new arbitrary.
 */
export function makeEditorConfigArbitrary(): fc.Arbitrary<EditorConfig> {
  return fc
    .record({
      frame_cache_size: fc.integer({ min: 1 }),
      init_camera_position: makeVector3DataArbitrary(),
      init_camera_target: makeVector3DataArbitrary(),
    })
    .map((data) => new EditorConfig(ProjectConfig.create(data)));
}
